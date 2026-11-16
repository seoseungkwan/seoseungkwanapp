using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.ArrangeWriting;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 기능의 C# 시험만 한 거르기로 돌리려고 ArrangeTune 이름 공간에 둔다(TASK-2도 같은 곳)
namespace Precheck.Core.Tests.Reception.ArrangeTune;

/// <summary>
/// 돌아옴 표시(spec reception-arrange-tune design.md 1절, REQ-3601).
/// AC-3601.1 표시 파일의 back·backStop(값이 있을 때만 씀, 옛 파일도 읽힘, "HH:MM"이 아니거나 back 없이 backStop만 있으면 깨진 파일).
/// AC-3601.2 away on(back·backStop 지움)·off(back = 지금)·clear(모두 지움).
/// AC-3601.3 back이 있고 backStop이 없으면 받은 칸 쓰기(X-RAY 칸 포함)가 backStop = 지금(한 번만). away·ptf·end·/api/xray는 멈추지 않는다.
/// AC-3601.4 판의 어레인지 줄 back·backWait("{시간}째", 판 시각 − back, 0분부터, 목록 기다린 글과 같은 시간 글).
/// 가짜 암호화(XorProtector)·임시 폴더·주입한 시계·가짜 내원(V+숫자)만 쓴다.
/// </summary>
public class ArrangeBackTests : IDisposable
{
    private const string Now = "10:30";
    private const string FileName = "reception-arrange.dat";
    private static readonly DateTime Morning = new DateTime(2026, 11, 16, 10, 20, 31);

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-arrange-back-" + Guid.NewGuid().ToString("N"));
    private readonly FakeClock clock = new FakeClock(Morning);
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private ArrangeMarks Open() =>
        new ArrangeMarks(new StoreFolder(folder), protector, () => clock.Now, code => { lock (reports) reports.Add(code); });

    /// <summary>파일의 암호문만 바꾼다(머리는 그대로).</summary>
    private void WritePlain(string json)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static string Visit(string extra) =>
        "{\"day\":\"20261116\",\"visits\":{\"V1\":{\"cells\":{},\"away\":null,\"ptf\":null,\"endedAt\":null" + extra + "}}}";

    private static ArrangeOp Op(string op, ArrangeCol? col = null, string? v = null) => new ArrangeOp("0123456789abcdef", op, col, v);

    private static ArrangeCell Cell(ArrangeStep st, bool manual = false, string det = "", string? part = null, string? at = "09:30") =>
        new ArrangeCell(st, det, part, at, null, manual);

    private static IReadOnlyDictionary<ArrangeCol, ArrangeCell> Cells(params (ArrangeCol Col, ArrangeCell Cell)[] cells) =>
        cells.ToDictionary(c => c.Col, c => c.Cell);

    private static readonly IReadOnlyDictionary<ArrangeCol, ArrangeCell> NoCells = Cells();

    // ---- AC-3601.1 표시 파일 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3601.1 back·backStop은 값이 있을 때만 파일에 쓰고(없으면 지금 모양 그대로) 다시 열어도 같은 값으로 읽힌다")]
    public void BackStoredOnlyWhenSet()
    {
        var marks = Open();
        marks.Update("V1", _ => new VisitMark(back: "10:05"));
        marks.Update("V2", _ => new VisitMark(back: "10:05", backStop: "10:12"));
        marks.Update("V3", _ => new VisitMark(away: "10:20"));

        using (var document = JsonDocument.Parse(protector.LastPlain!))
        {
            var visits = document.RootElement.GetProperty("visits");
            Assert.Equal(new[] { "cells", "away", "ptf", "endedAt", "back" }, visits.GetProperty("V1").EnumerateObject().Select(p => p.Name));
            Assert.Equal(new[] { "cells", "away", "ptf", "endedAt", "back", "backStop" }, visits.GetProperty("V2").EnumerateObject().Select(p => p.Name));
            Assert.Equal(new[] { "cells", "away", "ptf", "endedAt" }, visits.GetProperty("V3").EnumerateObject().Select(p => p.Name));
            Assert.Equal("10:12", visits.GetProperty("V2").GetProperty("backStop").GetString());
        }

        var today = Open().Today();
        Assert.Equal(("10:05", (string?)null), (today["V1"].Back, today["V1"].BackStop));
        Assert.Equal(("10:05", "10:12"), (today["V2"].Back, today["V2"].BackStop));
        Assert.Equal(((string?)null, (string?)null), (today["V3"].Back, today["V3"].BackStop));
        Assert.Empty(reports);
    }

    [Theory(DisplayName = "AC-3601.1 두 칸이 없는 옛 파일과 칸 차례가 다른 파일(kept 포함)도 읽힌다")]
    [InlineData("", null, null)]
    [InlineData(",\"back\":\"10:05\"", "10:05", null)]
    [InlineData(",\"backStop\":\"10:12\",\"back\":\"10:05\"", "10:05", "10:12")]
    [InlineData(",\"back\":\"10:05\",\"kept\":true", "10:05", null)]
    public void OldAndNewFilesRead(string extra, string? back, string? backStop)
    {
        Open().Update("V1001", _ => new VisitMark(away: "10:20"));
        WritePlain(Visit(extra).Replace("\"away\":null", "\"away\":\"10:00\""));

        var mark = Assert.Single(Open().Today());
        Assert.Equal("V1", mark.Key);
        Assert.Equal("10:00", mark.Value.Away);
        Assert.Equal((back, backStop), (mark.Value.Back, mark.Value.BackStop));
        Assert.Empty(reports);
    }

    [Theory(DisplayName = "AC-3601.1 모양이 \"HH:MM\"이 아니거나(null·숫자 포함) back 없이 backStop만 있거나 칸이 두 번이면 깨진 파일(빈 표시 + E-STORE-BROKEN)")]
    [InlineData(",\"back\":\"9:05\"")]
    [InlineData(",\"back\":\"25:00\"")]
    [InlineData(",\"back\":\"10:05:00\"")]
    [InlineData(",\"back\":1005")]
    [InlineData(",\"back\":null")]
    [InlineData(",\"back\":\"10:05\",\"backStop\":null")]
    [InlineData(",\"back\":\"10:05\",\"backStop\":\"1012\"")]
    [InlineData(",\"backStop\":\"10:12\"")]
    [InlineData(",\"back\":\"10:05\",\"back\":\"10:06\"")]
    [InlineData(",\"back\":\"10:05\",\"backWait\":\"3분째\"")]
    public void MalformedBackIsBroken(string extra)
    {
        Open().Update("V1001", _ => new VisitMark(away: "10:20"));
        WritePlain(Visit(extra));

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }

    public static IEnumerable<object[]> BadBacks() => new[]
    {
        new object[] { "backStop만", new VisitMark(backStop: "10:12") },
        new object[] { "back 모양", new VisitMark(back: "10:5") },
        new object[] { "backStop 모양", new VisitMark(back: "10:00", backStop: "24:00") },
    };

    [Theory(DisplayName = "AC-3601.1 back 없이 backStop만 있거나 시각 모양이 틀린 표시는 쓰지 않는다(ArgumentException, 파일 그대로)")]
    [MemberData(nameof(BadBacks))]
    public void BadBackRefused(string why, VisitMark bad)
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        var calls = protector.ProtectCalls;

        Assert.ThrowsAny<ArgumentException>(() => marks.Update("V1001", _ => bad));

        Assert.True(calls == protector.ProtectCalls, why);
        Assert.Equal("10:20", Open().Today()["V1001"].Away);
    }

    [Fact(DisplayName = "AC-3601.1 back만 있어도 빈 표시가 아니고, WithBack(null, null)이면 빈 표시이며, 다른 With…는 back·backStop을 그대로 둔다")]
    public void BackHelpers()
    {
        var mark = new VisitMark(back: "10:00", backStop: "10:05");
        Assert.False(new VisitMark(back: "10:00").IsEmpty);
        Assert.True(new VisitMark(back: "10:00").WithBack(null, null).IsEmpty);
        var stopped = new VisitMark(back: "10:00").WithBack("10:00", "10:07");
        Assert.Equal(("10:00", "10:07"), (stopped.Back, stopped.BackStop));
        foreach (var changed in new[]
        {
            mark.WithAway("10:41"), mark.WithPtf(new PtFirst("up", "10:42")), mark.WithEnded("10:43"), mark.WithKept(true),
            mark.WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "10:44")),
        })
            Assert.Equal(("10:00", "10:05"), (changed.Back, changed.BackStop));
    }

    // ---- AC-3601.2 away on·off·clear -----------------------------------------------------------------

    [Fact(DisplayName = "AC-3601.2 away on은 away = 지금이고 back·backStop을 지운다")]
    public void AwayOnClearsBack()
    {
        var on = ArrangeWrite.Apply(Op("away", v: "on"), new VisitMark(back: "09:50", backStop: "09:55"), NoCells, Now);
        Assert.Equal(204, on.Status);
        Assert.Equal((Now, (string?)null, (string?)null), (on.Next!.Away, on.Next.Back, on.Next.BackStop));
    }

    [Fact(DisplayName = "AC-3601.2 away off는 away를 지우고 back = 지금, backStop을 지운다(칸·PT 먼저는 그대로)")]
    public void AwayOffSetsBack()
    {
        var off = ArrangeWrite.Apply(Op("away", v: "off"), new VisitMark(away: "10:00"), NoCells, Now);
        Assert.Equal(204, off.Status);
        Assert.True(off.ChangesMarks);
        Assert.Equal(((string?)null, Now, (string?)null), (off.Next!.Away, off.Next.Back, off.Next.BackStop));

        var current = new VisitMark(away: "10:00", ptf: new PtFirst("up", "09:40"), back: "09:00", backStop: "09:10")
            .WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:41"));
        var again = ArrangeWrite.Apply(Op("away", v: "off"), current, NoCells, Now).Next!;
        Assert.Equal(((string?)null, Now, (string?)null, "up"), (again.Away, again.Back, again.BackStop, again.Ptf!.St));
        Assert.Equal("30분", again.Cells[ArrangeCol.Ds].Det);
    }

    [Fact(DisplayName = "AC-3601.2 away clear(되돌리기)는 away·back·backStop을 모두 지운다(다른 표시가 없으면 그 내원 표시도 없어짐), 몸 v \"clear\"를 받는다")]
    public void AwayClearRemovesAll()
    {
        Assert.True(ArrangeWrite.TryParse(Encoding.UTF8.GetBytes("{\"k\":\"0123456789abcdef\",\"op\":\"away\",\"v\":\"clear\"}"), out var parsed));
        Assert.Equal(("away", "clear"), (parsed.Op, parsed.V));

        var clear = ArrangeWrite.Apply(parsed, new VisitMark(away: "10:00", back: "09:00", backStop: "09:10"), NoCells, Now);
        Assert.Equal((204, true), (clear.Status, clear.ChangesMarks));
        Assert.Null(clear.Next);

        var withCell = new VisitMark(back: "10:10").WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:41"));
        var kept = ArrangeWrite.Apply(Op("away", v: "clear"), withCell, NoCells, Now).Next!;
        Assert.Equal(((string?)null, (string?)null, (string?)null), (kept.Away, kept.Back, kept.BackStop));
        Assert.Equal("30분", kept.Cells[ArrangeCol.Ds].Det);
    }

    [Theory(DisplayName = "AC-3601.2 away v는 on·off·clear만 받고 다른 글은 400")]
    [InlineData("back")]
    [InlineData("")]
    [InlineData("Clear")]
    public void AwayOtherValuesRefused(string v)
    {
        var refused = ArrangeWrite.Apply(Op("away", v: v), new VisitMark(away: "10:00"), NoCells, Now);
        Assert.Equal((400, false), (refused.Status, refused.ChangesMarks));
    }

    // ---- AC-3601.3 칸 쓰기가 센 것을 멈춤 ------------------------------------------------------------

    private static readonly VisitMark Counting = new VisitMark(back: "10:00");

    public static IEnumerable<object[]> CellWrites() => new[]
    {
        new object[] { "step pt", Op("step", ArrangeCol.Pt), Counting.WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "ICE", null, null, null, "09:50")), Cells((ArrangeCol.Pt, Cell(ArrangeStep.Todo, true, "ICE"))), null! },
        new object[] { "set sono", Op("set", ArrangeCol.Sono, "done"), Counting, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), null! },
        new object[] { "add ds", Op("add", ArrangeCol.Ds, "30분"), Counting, NoCells, null! },
        new object[] { "remove ds", Op("remove", ArrangeCol.Ds), Counting.WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:40")), Cells((ArrangeCol.Ds, Cell(ArrangeStep.Todo, true, "30분"))), null! },
        new object[] { "part sono", Op("part", ArrangeCol.Sono, "목"), Counting, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), null! },
        new object[] { "step xray", Op("step", ArrangeCol.Xray), Counting, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), true },
        new object[] { "set xray todo", Op("set", ArrangeCol.Xray, "todo"), Counting, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Done))), false },
        new object[] { "add xray", Op("add", ArrangeCol.Xray, "X-ray 찍기"), Counting, NoCells, null! },
        new object[] { "remove xray(표시 없는 직접 칸)", Op("remove", ArrangeCol.Xray), Counting, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Done, manual: true))), false },
    };

    [Theory(DisplayName = "AC-3601.3 back이 있고 backStop이 없는 내원의 칸 쓰기(step·set·add·remove·part, X-RAY 칸 포함)가 받아지면 backStop = 지금이고, X-RAY 칸 쓰기는 X-ray 표시와 함께 낸다")]
    [MemberData(nameof(CellWrites))]
    public void CellWriteStopsCounting(string why, ArrangeOp op, VisitMark current, IReadOnlyDictionary<ArrangeCol, ArrangeCell> cells, bool? xray)
    {
        var result = ArrangeWrite.Apply(op, current, cells, Now);

        Assert.True(result.Status == 204, why);
        Assert.True(result.ChangesMarks, why);
        Assert.Equal(("10:00", Now), (result.Next!.Back, result.Next.BackStop));
        Assert.Equal(xray, result.Xray);
    }

    [Fact(DisplayName = "AC-3601.3 backStop은 한 번만 남는다: 이미 멈춘 내원의 칸 쓰기는 backStop을 바꾸지 않고 X-RAY 칸 쓰기는 지금처럼 X-ray 표시만 낸다")]
    public void StopsOnce()
    {
        var stopped = new VisitMark(back: "10:00", backStop: "10:10");
        var step = ArrangeWrite.Apply(Op("add", ArrangeCol.Ds, "30분"), stopped, NoCells, Now);
        Assert.Equal(("10:00", "10:10"), (step.Next!.Back, step.Next.BackStop));

        var xray = ArrangeWrite.Apply(Op("step", ArrangeCol.Xray), stopped, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal((204, false, (bool?)true), (xray.Status, xray.ChangesMarks, xray.Xray));

        var plain = ArrangeWrite.Apply(Op("step", ArrangeCol.Xray), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal((204, false, (bool?)true), (plain.Status, plain.ChangesMarks, plain.Xray));
        var noBack = ArrangeWrite.Apply(Op("add", ArrangeCol.Ds, "30분"), new VisitMark(), NoCells, Now);
        Assert.Equal(((string?)null, (string?)null), (noBack.Next!.Back, noBack.Next.BackStop));
    }

    [Fact(DisplayName = "AC-3601.3 받지 않은 칸 쓰기(400·404)는 표시를 바꾸지 않는다")]
    public void RefusedWritesDoNotStop()
    {
        var done = ArrangeWrite.Apply(Op("step", ArrangeCol.Sono), Counting, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Done))), Now);
        Assert.Equal((400, false), (done.Status, done.ChangesMarks));
        var missing = ArrangeWrite.Apply(Op("step", ArrangeCol.Sono), Counting, NoCells, Now);
        Assert.Equal((404, false), (missing.Status, missing.ChangesMarks));
        var offList = ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "도수"), Counting, NoCells, Now);
        Assert.Equal((400, false), (offList.Status, offList.ChangesMarks));
    }

    [Theory(DisplayName = "AC-3601.3 ptf·end 쓰기는 센 것을 멈추지 않는다(back 그대로, backStop 없음)")]
    [InlineData("ptf", "up")]
    [InlineData("ptf", "off")]
    [InlineData("end", "on")]
    [InlineData("end", "off")]
    public void RowWritesDoNotStop(string op, string v)
    {
        var result = ArrangeWrite.Apply(Op(op, v: v), Counting, NoCells, Now);
        Assert.Equal(204, result.Status);
        Assert.Equal(("10:00", (string?)null), (result.Next!.Back, result.Next.BackStop));
    }

    [Fact(DisplayName = "AC-3601.3 [길] 자리비움 → 돌아옴 → X-RAY 화면 쓰기(/api/xray)는 멈추지 않고, X-RAY 칸 step은 X-ray 표시와 backStop을 함께 쓴다")]
    public void RouteStopsOnCellWrite()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1002");
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "on")).Status);
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "off")).Status);
        var back = rig.Clock.Now().ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal((back, (string?)null), (rig.ArrangeMarks.Today()["V1002"].Back, rig.ArrangeMarks.Today()["V1002"].BackStop));

        rig.Clock.Advance(TimeSpan.FromMinutes(5));
        Assert.Equal(204, rig.Post(Encoding.UTF8.GetBytes("{\"k\":\"" + key + "\",\"on\":true}"), "/api/xray").Status);
        Assert.Null(rig.ArrangeMarks.Today()["V1002"].BackStop);

        rig.Clock.Advance(TimeSpan.FromMinutes(2));
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "set", "xray", "todo")).Status);
        var stop = rig.Clock.Now().ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal((back, stop), (rig.ArrangeMarks.Today()["V1002"].Back, rig.ArrangeMarks.Today()["V1002"].BackStop));
        Assert.False(rig.XrayMarks.Today().ContainsKey("V1002"));
    }

    // ---- AC-3601.4 판의 back·backWait ----------------------------------------------------------------

    private const string Day = "20261116";

    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["QA"] = Lane.Wait };

    private static (Board Board, Arrange Arrange, VisitKeys Keys) BoardOf(DateTime readAt, VisitMark? mark, string accepted = "0910")
    {
        var visits = new[] { new VisitRow("V1", "90001", Day + accepted + "00", "QA", "N") };
        var input = new BoardInput(Day, readAt, visits, new Dictionary<string, string>());
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal);
        if (mark != null) marks["V1"] = mark;
        var keys = new VisitKeys();
        var xray = new Dictionary<string, string>();
        var arrange = ArrangeBuilder.Build(input, Statuses, new string[0], new ArrangeRule[0], marks, xray, keys);
        var board = BoardBuilder.Build(input, Statuses, new string[0], xray, keys, readAt);
        return (board, arrange, keys);
    }

    private static JsonElement RowJson(DateTime readAt, VisitMark? mark)
    {
        var (board, arrange, _) = BoardOf(readAt, mark);
        using var document = JsonDocument.Parse(board.ToJson(arrange));
        return document.RootElement.GetProperty("arrange").GetProperty("rows")[0].Clone();
    }

    [Theory(DisplayName = "AC-3601.4 backWait는 back이 있고 backStop이 없을 때만 \"{시간}째\"(판 시각 − back, 0분부터, 판이 더 이르면 0분)이고 아니면 null")]
    [InlineData("10:30", null, "30분째")]
    [InlineData("10:59", null, "1분째")]
    [InlineData("11:00", null, "0분째")]
    [InlineData("11:05", null, "0분째")]
    [InlineData("09:56", null, "1시간 4분째")]
    [InlineData("09:00", null, "2시간째")]
    [InlineData("10:30", "10:40", null)]
    [InlineData(null, null, null)]
    public void BackWait(string? back, string? backStop, string? wait)
    {
        var mark = back == null ? null : new VisitMark(back: back, backStop: backStop);
        var row = BoardOf(new DateTime(2026, 11, 16, 11, 0, 0), mark).Arrange.Rows.Single();

        Assert.Equal((back, wait), (row.Back, row.BackWait));
    }

    [Fact(DisplayName = "AC-3601.4 판 시각은 \"at\"의 시:분(초는 버림)이고 시간 글은 목록 기다린 글(\"1시간 4분째 대기\")과 같다")]
    public void BackWaitUsesBoardClock()
    {
        var (board, arrange, _) = BoardOf(new DateTime(2026, 11, 16, 11, 0, 59), new VisitMark(back: "10:30"));
        Assert.Equal("11:00:59", board.At);
        Assert.Equal("30분째", arrange.Rows.Single().BackWait);

        var same = BoardOf(new DateTime(2026, 11, 16, 11, 0, 0), new VisitMark(back: "09:56"), accepted: "0956");
        Assert.Equal(same.Board.Wait.Single().Waited, same.Arrange.Rows.Single().BackWait + " 대기");
    }

    [Fact(DisplayName = "AC-3601.4 판의 어레인지 줄은 k·away·back·backWait·ptf·last·cells·allDone이고 back·backWait는 늘 있다(없으면 null)")]
    public void RowJsonHasBack()
    {
        var at = new DateTime(2026, 11, 16, 11, 0, 0);
        var counting = RowJson(at, new VisitMark(back: "10:48"));
        Assert.Equal(new[] { "k", "away", "back", "backWait", "ptf", "last", "cells", "allDone" }, counting.EnumerateObject().Select(p => p.Name));
        Assert.Equal(("10:48", "12분째"), (counting.GetProperty("back").GetString(), counting.GetProperty("backWait").GetString()));

        var stopped = RowJson(at, new VisitMark(back: "10:48", backStop: "10:50"));
        Assert.Equal("10:48", stopped.GetProperty("back").GetString());
        Assert.Equal(JsonValueKind.Null, stopped.GetProperty("backWait").ValueKind);
        Assert.False(stopped.TryGetProperty("backStop", out _));

        var none = RowJson(at, null);
        Assert.Equal(JsonValueKind.Null, none.GetProperty("back").ValueKind);
        Assert.Equal(JsonValueKind.Null, none.GetProperty("backWait").ValueKind);
    }

    [Fact(DisplayName = "AC-3601.4 [길] 돌아옴 뒤 GET /api/board 줄에 back·\"0분째\", 시간이 지나면 기다린 시간, 칸 쓰기 뒤에는 backWait null·back 그대로, 되돌리기(clear) 뒤에는 둘 다 null")]
    public void RouteShowsBackOnBoard()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1001");
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "on")).Status);
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "off")).Status);
        var back = rig.Clock.Now().ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);

        var row = rig.Row("V1001");
        Assert.Equal(JsonValueKind.Null, row.GetProperty("away").ValueKind);
        Assert.Equal((back, "0분째"), (row.GetProperty("back").GetString(), row.GetProperty("backWait").GetString()));

        rig.Clock.Advance(TimeSpan.FromMinutes(12));
        Assert.Equal("12분째", rig.Row("V1001").GetProperty("backWait").GetString());

        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "step", "sono", null)).Status);
        row = rig.Row("V1001");
        Assert.Equal(back, row.GetProperty("back").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("backWait").ValueKind);

        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "on")).Status);
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "away", null, "clear")).Status);
        row = rig.Row("V1001");
        Assert.Equal(JsonValueKind.Null, row.GetProperty("away").ValueKind);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("back").ValueKind);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("backWait").ValueKind);
    }
}
