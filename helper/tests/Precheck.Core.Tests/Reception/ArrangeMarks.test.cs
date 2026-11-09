using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeStore 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeStore;

/// <summary>
/// 어레인지 표시 저장(ArrangeMarks, spec reception-arrange design.md 4·6절, REQ-3304·AC-3312.3).
/// AC-3304.1 data\reception-arrange.dat(머리 + IProtector로 감싼 { day, visits })에 임시 파일 → 바꾸기로, 잠금 하나로 한 번에 하나씩 쓴다.
/// AC-3304.2 내원 하나의 표시는 칸마다 { st, manual, det, part, readyAt, doneAt, addedAt }와 away·ptf·endedAt뿐이다.
/// AC-3304.3 날이 오늘이 아니면 빈 표시, 1MB를 넘거나 모양이 틀리면 빈 표시 + 기록에 오류 번호만.
/// AC-3304.4 글 칸(det·part)은 칸마다 정해 둔 고르기 목록(ArrangeChoices)의 글만 받는다.
/// AC-3312.3 파일·기록에는 내원번호와 정해 둔 글(단계·부위·칸 글·시각)만 있다.
/// 가짜 암호화(XorProtector)·임시 폴더·주입한 시계만 쓴다. 내원번호는 가짜(V+숫자)다.
/// </summary>
public class ArrangeMarksTests : IDisposable
{
    private const string FileName = "reception-arrange.dat";
    private static readonly DateTime Morning = new DateTime(2026, 11, 9, 10, 20, 31);

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-arrange-" + Guid.NewGuid().ToString("N"));
    private readonly FakeClock clock = new FakeClock(Morning);
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private ArrangeMarks Open(IProtector? with = null) =>
        new ArrangeMarks(new StoreFolder(folder), with ?? protector, () => clock.Now, code => { lock (reports) reports.Add(code); });

    private string[] FolderFiles() => Directory.Exists(folder)
        ? Directory.GetFileSystemEntries(folder).Select(p => Path.GetFileName(p)!).OrderBy(n => n, StringComparer.Ordinal).ToArray()
        : new string[0];

    private static CellMark Cell(ArrangeStep st, bool manual = false, string det = "", string? part = null, string? readyAt = null, string? doneAt = null, string? addedAt = null) =>
        new CellMark(st, manual, det, part, readyAt, doneAt, addedAt);

    /// <summary>모든 칸을 쓴 표시 하나.</summary>
    private static VisitMark Full() => new VisitMark(
        new Dictionary<ArrangeCol, CellMark>
        {
            [ArrangeCol.Sono] = Cell(ArrangeStep.Ready, part: "오른 어깨", readyAt: "10:20"),
            [ArrangeCol.Xray] = Cell(ArrangeStep.Todo, manual: true, addedAt: "10:05"),
            [ArrangeCol.Pt] = Cell(ArrangeStep.Done, manual: true, det: "HP", doneAt: "10:30", addedAt: "10:10"),
            [ArrangeCol.Carm] = Cell(ArrangeStep.Gone),
        },
        away: "10:50", ptf: new PtFirst("up", "10:40"), endedAt: "11:00");

    private byte[] Plain()
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        Assert.True(data.Length >= cipher.Length && data.Skip(data.Length - cipher.Length).SequenceEqual(cipher), "파일 끝이 IProtector 암호문이 아니다");
        return protector.LastPlain!;
    }

    /// <summary>파일의 암호문만 바꾼다(머리는 그대로).</summary>
    private void WritePlain(string json)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static bool Contains(byte[] data, string text)
    {
        var needle = Encoding.UTF8.GetBytes(text);
        for (var i = 0; i + needle.Length <= data.Length; i++)
            if (data.Skip(i).Take(needle.Length).SequenceEqual(needle)) return true;
        return false;
    }

    // ---- AC-3304.1 파일·쓰기 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3304.1 Update로 쓴 표시는 Today에 나오고, 저장 폴더를 새로 연 ArrangeMarks(도우미를 다시 켬)도 같은 표시를 읽는다")]
    public void WriteThenRead()
    {
        Open().Update("V1001", _ => Full());

        foreach (var marks in new[] { Open(), Open() })
        {
            var mark = Assert.Single(marks.Today());
            Assert.Equal("V1001", mark.Key);
            Assert.Equal("10:50", mark.Value.Away);
            Assert.Equal("up", mark.Value.Ptf!.St);
            Assert.Equal("10:40", mark.Value.Ptf.At);
            Assert.Equal("11:00", mark.Value.EndedAt);
            var sono = mark.Value.Cells[ArrangeCol.Sono];
            Assert.Equal(ArrangeStep.Ready, sono.St);
            Assert.False(sono.Manual);
            Assert.Equal("", sono.Det);
            Assert.Equal("오른 어깨", sono.Part);
            Assert.Equal("10:20", sono.ReadyAt);
            Assert.Null(sono.DoneAt);
            var pt = mark.Value.Cells[ArrangeCol.Pt];
            Assert.Equal((ArrangeStep.Done, true, "HP", (string?)null, (string?)null, "10:30", "10:10"), (pt.St, pt.Manual, pt.Det, pt.Part, pt.ReadyAt, pt.DoneAt, pt.AddedAt));
            Assert.Equal(ArrangeStep.Gone, mark.Value.Cells[ArrangeCol.Carm].St);
            Assert.Equal(4, mark.Value.Cells.Count);
        }
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3304.1 파일은 저장 폴더의 reception-arrange.dat 하나이고(임시 파일이 남지 않음) 머리 PRECHECK-STORE-1 뒤에 IProtector 암호문이며 X-ray 표시 파일과 따로다")]
    public void OneEncryptedFile()
    {
        Open().Update("V1001", _ => Full());

        Assert.Equal(new[] { FileName }, FolderFiles());
        var data = File.ReadAllBytes(FilePath);
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        Assert.Equal(1, protector.ProtectCalls);
        foreach (var text in new[] { "V1001", "오른 어깨", "10:20", "visits", "20261109" }) Assert.False(Contains(data, text), text);
        Assert.NotEqual(XrayMarks.FileName, ArrangeMarks.FileName);
    }

    [Fact(DisplayName = "AC-3304.1 푼 글은 { day: yyyyMMdd, visits: { 내원번호: … } }이다")]
    public void StoredShape()
    {
        var marks = Open();
        marks.Update("V1001", _ => Full());
        marks.Update("V1002", _ => new VisitMark(away: "10:21"));

        using var document = JsonDocument.Parse(Plain());
        var root = document.RootElement;
        Assert.Equal(new[] { "day", "visits" }, root.EnumerateObject().Select(p => p.Name));
        Assert.Equal("20261109", root.GetProperty("day").GetString());
        Assert.Equal(new[] { "V1001", "V1002" }, root.GetProperty("visits").EnumerateObject().Select(p => p.Name));
    }

    [Fact(DisplayName = "AC-3304.1 여러 휴대폰이 한꺼번에 써도 한 번에 하나씩 쓰고(암호화가 겹치지 않음) 표시를 잃지 않는다")]
    public void OneWriterAtATime()
    {
        var marks = Open();
        Parallel.For(0, 24, i => marks.Update("V" + (2000 + i), _ => new VisitMark(away: "10:2" + (i % 10))));

        Assert.Equal(1, protector.MaxInside);
        Assert.Equal(24, Open().Today().Count);
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-3304.1 Update는 지금 표시를 넘겨주고(없으면 null) 그 답으로 바꾼다, 같은 내원을 차례로 바꾸면 나중 것이 남는다")]
    public void UpdateSeesCurrent()
    {
        var marks = Open();
        VisitMark? seen = new VisitMark();
        marks.Update("V1001", current => { seen = current; return new VisitMark(away: "10:20"); });
        Assert.Null(seen);

        marks.Update("V1001", current => { seen = current; return current!.WithAway(null).WithEnded("10:25"); });
        Assert.Equal("10:20", seen!.Away);
        var mark = Open().Today()["V1001"];
        Assert.Null(mark.Away);
        Assert.Equal("10:25", mark.EndedAt);
    }

    [Fact(DisplayName = "AC-3304.1 답이 null이거나 빈 표시면 그 내원을 지우고, 바뀔 것이 없으면 파일을 쓰지 않는다")]
    public void EmptyMarkRemovesVisit()
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        marks.Update("V1002", _ => new VisitMark(away: "10:21"));

        marks.Update("V1001", _ => null);
        marks.Update("V1002", current => current!.WithAway(null));
        Assert.Empty(Open().Today());

        var calls = protector.ProtectCalls;
        marks.Update("V9999", _ => null);
        Assert.Equal(calls, protector.ProtectCalls);
    }

    [Fact(DisplayName = "AC-3304.1 암호화하지 못하면 파일을 쓰지 않고 E-STORE-FAILED, 표시는 그대로이고 임시 파일이 남지 않는다")]
    public void WriteFailureKeepsMarks()
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        protector.FailProtect = true;

        var error = Assert.Throws<BitException>(() => marks.Update("V1001", _ => new VisitMark(away: "10:30")));

        Assert.Equal(BitErrors.StoreFailed, error.Code);
        Assert.Equal("10:20", marks.Today()["V1001"].Away);
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    // ---- AC-3304.2 표시 모양 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3304.2 내원 표시는 cells·away·ptf·endedAt뿐이고 칸은 st(todo|ready|done|gone)·manual·det·part·readyAt·doneAt·addedAt뿐이다(이름·차트번호·메모·증상 칸 없음)")]
    public void VisitShape()
    {
        Open().Update("V1001", _ => Full());

        using var document = JsonDocument.Parse(Plain());
        var visit = document.RootElement.GetProperty("visits").GetProperty("V1001");
        Assert.Equal(new[] { "cells", "away", "ptf", "endedAt" }, visit.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "st", "at" }, visit.GetProperty("ptf").EnumerateObject().Select(p => p.Name));
        var cells = visit.GetProperty("cells");
        Assert.Equal(new[] { "xray", "sono", "carm", "pt" }, cells.EnumerateObject().Select(p => p.Name));
        foreach (var cell in cells.EnumerateObject())
            Assert.Equal(new[] { "st", "manual", "det", "part", "readyAt", "doneAt", "addedAt" }, cell.Value.EnumerateObject().Select(p => p.Name));
        Assert.Equal("ready", cells.GetProperty("sono").GetProperty("st").GetString());
        Assert.Equal("gone", cells.GetProperty("carm").GetProperty("st").GetString());
        Assert.Equal("todo", cells.GetProperty("xray").GetProperty("st").GetString());
        Assert.Equal("done", cells.GetProperty("pt").GetProperty("st").GetString());
        Assert.Equal(JsonValueKind.True, cells.GetProperty("pt").GetProperty("manual").ValueKind);
        Assert.Equal(JsonValueKind.Null, cells.GetProperty("pt").GetProperty("part").ValueKind);
    }

    [Fact(DisplayName = "AC-3304.2 빈 표시(칸 없음·away·ptf·endedAt 모두 없음)는 IsEmpty이고, With…는 그 칸만 바꾼 새 표시를 준다")]
    public void MarkHelpers()
    {
        Assert.True(new VisitMark().IsEmpty);
        var mark = new VisitMark().WithCell(ArrangeCol.Ds, Cell(ArrangeStep.Todo, manual: true, det: "30분", addedAt: "10:00"));
        Assert.False(mark.IsEmpty);
        Assert.True(mark.WithCell(ArrangeCol.Ds, null).IsEmpty);
        Assert.Equal("10:40", mark.WithPtf(new PtFirst("down", "10:40")).Ptf!.At);
        Assert.Null(mark.Ptf);
        Assert.Equal("10:41", mark.WithAway("10:41").Away);
        Assert.Equal("10:42", mark.WithEnded("10:42").EndedAt);
    }

    // ---- AC-3304.3 날·깨진 파일 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3304.3 날이 바뀌면 지난 날 표시는 읽을 때 버리고, 새 날 첫 Update는 null을 받아 새 날 파일만 쓴다")]
    public void NewDayStartsEmpty()
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "23:59"));
        clock.Now = new DateTime(2026, 11, 10, 0, 0, 1);

        Assert.Empty(marks.Today());
        Assert.Empty(Open().Today());
        VisitMark? seen = new VisitMark();
        marks.Update("V1001", current => { seen = current; return new VisitMark(away: "00:00"); });
        marks.Update("V2001", _ => new VisitMark(away: "00:01"));

        Assert.Null(seen);
        using var document = JsonDocument.Parse(Plain());
        Assert.Equal("20261110", document.RootElement.GetProperty("day").GetString());
        Assert.Equal(new[] { "00:00", "00:01" }, Open().Today().OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => p.Value.Away));
    }

    [Fact(DisplayName = "AC-3304.3 1MB를 넘는 파일은 읽지 않고 빈 표시, 기록에 E-STORE-BROKEN만 남는다")]
    public void TooBigIsBroken()
    {
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(FilePath, Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(new byte[1024 * 1024]).ToArray());

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }

    [Fact(DisplayName = "AC-3304.3 풀지 못하는 파일(다른 윈도우 계정)은 빈 표시로 시작하고 다음 쓰기가 새 파일로 덮는다")]
    public void UndecryptableIsBroken()
    {
        Open().Update("V1001", _ => new VisitMark(away: "10:20"));
        var other = new XorProtector(0x33);

        var marks = Open(other);
        Assert.Empty(marks.Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
        marks.Update("V1002", _ => new VisitMark(away: "10:21"));
        Assert.Equal(new[] { "V1002" }, Open(other).Today().Keys);
    }

    [Theory(DisplayName = "AC-3304.3 모양이 틀린 파일(칸 더함·틀린 단계·틀린 시각·목록 밖 글·JSON 아님)은 빈 표시, 기록에 E-STORE-BROKEN만")]
    [InlineData("not json")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{},\"x\":1}")]
    [InlineData("{\"day\":\"2026-11-09\",\"visits\":{}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{},\"away\":\"10:2\",\"ptf\":null,\"endedAt\":null}}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{},\"away\":null,\"ptf\":null,\"endedAt\":null,\"name\":\"가상환자07\"}}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{\"pt\":{\"st\":\"done\",\"manual\":true,\"det\":\"가상환자07\",\"part\":null,\"readyAt\":null,\"doneAt\":null,\"addedAt\":null}},\"away\":null,\"ptf\":null,\"endedAt\":null}}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{\"sono\":{\"st\":\"later\",\"manual\":false,\"det\":\"\",\"part\":null,\"readyAt\":null,\"doneAt\":null,\"addedAt\":null}},\"away\":null,\"ptf\":null,\"endedAt\":null}}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{\"bed\":{\"st\":\"done\",\"manual\":true,\"det\":\"\",\"part\":null,\"readyAt\":null,\"doneAt\":null,\"addedAt\":null}},\"away\":null,\"ptf\":null,\"endedAt\":null}}}")]
    [InlineData("{\"day\":\"20261109\",\"visits\":{\"V1\":{\"cells\":{},\"away\":null,\"ptf\":{\"st\":\"left\",\"at\":\"10:00\"},\"endedAt\":null}}}")]
    public void MalformedIsBroken(string json)
    {
        Open().Update("V1001", _ => new VisitMark(away: "10:20"));
        WritePlain(json);

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }

    // ---- AC-3304.4 고르기 목록 --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3304.4 고르기 목록(ArrangeChoices)은 design.md 4절 표 그대로다(부위 15개 + 부위는 나중에, X-ray 찍기, ICE·HP, 30분·50분, 1~4부위, 목·허리)")]
    public void ChoicesTable()
    {
        var parts = new[] { "목", "등", "허리", "오른 어깨", "왼 어깨", "양 어깨", "팔꿈치", "손목", "고관절", "오른 무릎", "왼 무릎", "양 무릎", "발목", "발바닥", "기타" };
        Assert.Equal(parts, ArrangeChoices.Parts);
        Assert.Equal("부위는 나중에", ArrangeChoices.PartLater);
        Assert.Equal(new[] { "X-ray 찍기" }, ArrangeChoices.AddOf(ArrangeCol.Xray));
        Assert.Equal(parts.Concat(new[] { "부위는 나중에" }), ArrangeChoices.AddOf(ArrangeCol.Sono));
        Assert.Equal(parts.Concat(new[] { "부위는 나중에" }), ArrangeChoices.AddOf(ArrangeCol.Carm));
        Assert.Equal(new[] { "ICE", "HP" }, ArrangeChoices.AddOf(ArrangeCol.Pt));
        Assert.Equal(new[] { "30분", "50분" }, ArrangeChoices.AddOf(ArrangeCol.Ds));
        Assert.Equal(new[] { "1부위", "2부위", "3부위", "4부위" }, ArrangeChoices.AddOf(ArrangeCol.Eswt));
        Assert.Equal(new[] { "목", "허리" }, ArrangeChoices.AddOf(ArrangeCol.Trac));
        foreach (var col in new[] { ArrangeCol.Xray, ArrangeCol.Sono, ArrangeCol.Carm }) Assert.Empty(ArrangeChoices.DetailsOf(col));
        foreach (var col in ArrangeMap.ManualOnly) Assert.Equal(ArrangeChoices.AddOf(col), ArrangeChoices.DetailsOf(col));
    }

    [Fact(DisplayName = "AC-3304.4 칸마다 목록의 글(직접 칸 det, SONO·C-ARM part)과 빈 det(처방 칸)는 받는다")]
    public void ChoicesAccepted()
    {
        var marks = Open();
        var i = 0;
        foreach (var col in ArrangeMap.ManualOnly)
            foreach (var det in ArrangeChoices.DetailsOf(col))
                marks.Update("V" + (3000 + i++), _ => new VisitMark().WithCell(col, Cell(ArrangeStep.Todo, manual: true, det: det, addedAt: "10:00")));
        foreach (var col in new[] { ArrangeCol.Sono, ArrangeCol.Carm })
            foreach (var part in ArrangeChoices.Parts)
                marks.Update("V" + (3000 + i++), _ => new VisitMark().WithCell(col, Cell(ArrangeStep.Todo, part: part)));
        marks.Update("V" + (3000 + i++), _ => new VisitMark().WithCell(ArrangeCol.Xray, Cell(ArrangeStep.Done, manual: true, doneAt: "10:01", addedAt: "10:00")));

        Assert.Equal(i, Open().Today().Count);
    }

    public static IEnumerable<object[]> BadMarks() => new[]
    {
        new object[] { "pt 목록 밖 글", new VisitMark().WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "가상환자07", null, null, null, "10:00")) },
        new object[] { "ds에 pt 글", new VisitMark().WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "ICE", null, null, null, "10:00")) },
        new object[] { "xray에 글", new VisitMark().WithCell(ArrangeCol.Xray, new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "10:00")) },
        new object[] { "sono 목록 밖 부위", new VisitMark().WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Todo, false, "", "어깨", null, null, null)) },
        new object[] { "sono 부위에 나중에", new VisitMark().WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Todo, false, "", "부위는 나중에", null, null, null)) },
        new object[] { "pt에 부위", new VisitMark().WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "HP", "목", null, null, "10:00")) },
        new object[] { "틀린 시각", new VisitMark().WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Ready, false, "", null, "9:5", null, null)) },
        new object[] { "25시", new VisitMark(away: "25:00") },
        new object[] { "끝 시각 글", new VisitMark(endedAt: "곧") },
        new object[] { "PT 먼저 단계", new VisitMark(ptf: new PtFirst("left", "10:00")) },
        new object[] { "PT 먼저 시각", new VisitMark(ptf: new PtFirst("up", "10:0")) },
    };

    [Theory(DisplayName = "AC-3304.4 목록 밖 글·칸에 맞지 않는 글·모양 틀린 시각·PT 먼저 값은 쓰지 않는다(ArgumentException, 파일 그대로)")]
    [MemberData(nameof(BadMarks))]
    public void BadMarksRefused(string why, VisitMark bad)
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        var calls = protector.ProtectCalls;

        Assert.ThrowsAny<ArgumentException>(() => marks.Update("V1001", _ => bad));

        Assert.True(calls == protector.ProtectCalls, why);
        Assert.Equal("10:20", Open().Today()["V1001"].Away);
    }

    [Fact(DisplayName = "AC-3304.4 내원번호가 비었거나 null이면 쓰지 않는다")]
    public void EmptyVisitRefused()
    {
        Assert.ThrowsAny<ArgumentException>(() => Open().Update("", _ => new VisitMark(away: "10:20")));
        Assert.ThrowsAny<ArgumentException>(() => Open().Update(null!, _ => new VisitMark(away: "10:20")));
        Assert.Empty(FolderFiles());
    }

    // ---- AC-3312.3 정해 둔 글만 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-3312.3 푼 글의 값은 내원번호·날·단계·부위·칸 글·시각·up/down뿐이고, 기록에는 오류 번호(E-…)만 간다")]
    public void OnlyDefinedText()
    {
        Open().Update("V1001", _ => Full());
        Open().Update("V1002", _ => new VisitMark(ptf: new PtFirst("down", "10:41")));

        var allowed = new HashSet<string>(StringComparer.Ordinal) { "20261109", "todo", "ready", "done", "gone", "up", "down", "" };
        allowed.UnionWith(ArrangeChoices.Parts);
        foreach (var col in Enum.GetValues(typeof(ArrangeCol)).Cast<ArrangeCol>()) allowed.UnionWith(ArrangeChoices.DetailsOf(col));
        var time = new System.Text.RegularExpressions.Regex(@"^\d{2}:\d{2}$");

        using var document = JsonDocument.Parse(Plain());
        var strings = new List<string>();
        void Walk(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Object) foreach (var p in element.EnumerateObject()) Walk(p.Value);
            else if (element.ValueKind == JsonValueKind.String) strings.Add(element.GetString()!);
        }
        Walk(document.RootElement);
        Assert.NotEmpty(strings);
        Assert.All(strings, s => Assert.True(allowed.Contains(s) || time.IsMatch(s), s));

        Open(new XorProtector(0x11)).Today();
        Assert.All(reports, code => Assert.Matches("^E-[A-Z]+(-[A-Z]+)*$", code));
    }

    [Fact(DisplayName = "AC-3312.3 비트·웹 서버로 가지 않는다: ArrangeMarks는 저장 폴더·암호화·시계·기록만 받고 Today·Update만 연다")]
    public void NarrowSurface()
    {
        var ctor = Assert.Single(typeof(ArrangeMarks).GetConstructors());
        Assert.Equal(new[] { typeof(IStoreFolder), typeof(IProtector), typeof(Func<DateTime>), typeof(Action<string>) }, ctor.GetParameters().Select(p => p.ParameterType));
        var methods = typeof(ArrangeMarks).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).Select(m => m.Name).OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(new[] { "Today", "Update" }, methods);
    }
}
