using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 기능(reception-pick-lists)의 시험만 한 거르기로 돌리려고 PickChoices 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PickChoices;

/// <summary>
/// 칸 표시 파일의 part·tags(ArrangeMarks, spec reception-pick-lists design.md 2절, AC-3502.1).
/// SONO·C-ARM part는 줄을 "|"로 이은 글, tags는 글 목록(비지 않을 때만 파일에 씀). 읽을 때는 모양만 본다.
/// 가짜 암호화(XorProtector)·임시 폴더·주입한 시계만 쓴다. 내원번호는 가짜(V+숫자)다.
/// </summary>
public class PickMarksTests : IDisposable
{
    private const string FileName = "reception-arrange.dat";
    private static readonly DateTime Morning = new DateTime(2026, 11, 12, 10, 20, 31);

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-pickmarks-" + Guid.NewGuid().ToString("N"));
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

    private static CellMark Cell(ArrangeStep st, string? part, params string[] tags) =>
        new CellMark(st, true, "", part, null, null, "10:00", tags);

    private static VisitMark With(ArrangeCol col, CellMark cell) => new VisitMark().WithCell(col, cell);

    /// <summary>파일의 암호문만 바꾼다(머리는 그대로).</summary>
    private void WritePlain(string json)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static string CellJson(string col, string part, string? tags = null) =>
        "{\"day\":\"20261112\",\"visits\":{\"V1\":{\"cells\":{\"" + col + "\":{\"st\":\"todo\",\"manual\":true,\"det\":\"\",\"part\":" + part
        + ",\"readyAt\":null,\"doneAt\":null,\"addedAt\":\"10:00\"" + (tags == null ? "" : ",\"tags\":" + tags) + "}},\"away\":null,\"ptf\":null,\"endedAt\":null}}}";

    [Fact(DisplayName = "AC-3502.1 SONO·C-ARM part는 줄을 \"|\"로 이은 글, tags는 글 목록으로 쓰고 다시 연 저장소도 같이 읽는다")]
    public void PartAndTagsRoundTrip()
    {
        Open().Update("V1001", _ => new VisitMark()
            .WithCell(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "오른 어깨|왼 무릎|소독", "DNA", "채혈"))
            .WithCell(ArrangeCol.Carm, Cell(ArrangeStep.Ready, "허리", "TP")));

        var mark = Open().Today()["V1001"];
        Assert.Equal("오른 어깨|왼 무릎|소독", mark.Cells[ArrangeCol.Sono].Part);
        Assert.Equal(new[] { "DNA", "채혈" }, mark.Cells[ArrangeCol.Sono].Tags);
        Assert.Equal("허리", mark.Cells[ArrangeCol.Carm].Part);
        Assert.Equal(new[] { "TP" }, mark.Cells[ArrangeCol.Carm].Tags);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3502.1 tags는 비지 않을 때만 파일에 쓴다(칸 끝 \"tags\": [글…]), 빈 칸은 tags 없이 옛 일곱 칸 그대로다")]
    public void TagsWrittenOnlyWhenPresent()
    {
        Open().Update("V1001", _ => new VisitMark()
            .WithCell(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", "DNA"))
            .WithCell(ArrangeCol.Carm, Cell(ArrangeStep.Todo, "리덕션"))
            .WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "10:00")));

        using var document = JsonDocument.Parse(protector.LastPlain!);
        var cells = document.RootElement.GetProperty("visits").GetProperty("V1001").GetProperty("cells");
        Assert.Equal(new[] { "st", "manual", "det", "part", "readyAt", "doneAt", "addedAt", "tags" }, cells.GetProperty("sono").EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "DNA" }, cells.GetProperty("sono").GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal(new[] { "st", "manual", "det", "part", "readyAt", "doneAt", "addedAt" }, cells.GetProperty("carm").EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "st", "manual", "det", "part", "readyAt", "doneAt", "addedAt" }, cells.GetProperty("pt").EnumerateObject().Select(p => p.Name));
    }

    [Fact(DisplayName = "AC-3502.1 tags가 없는 옛 파일도 읽히고(Tags는 빈 목록), CellMark의 Tags는 고칠 수 없는 목록이다")]
    public void OldFileWithoutTagsReads()
    {
        Open().Update("V1", _ => new VisitMark(away: "10:00"));
        WritePlain(CellJson("sono", "\"오른 무릎\""));

        var cell = Open().Today()["V1"].Cells[ArrangeCol.Sono];
        Assert.Equal("오른 무릎", cell.Part);
        Assert.Empty(cell.Tags);
        Assert.False(cell.Tags is IList<string> list && !list.IsReadOnly, "Tags를 고칠 수 있다");
        Assert.Empty(new CellMark(ArrangeStep.Todo, false, "", null, null, null, null).Tags);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3502.1 읽을 때 part·tags는 모양만 본다: 목록에 없는 부위·시술·이름표(쪽 글 + 10글자 줄, 12개)도 읽힌다")]
    public void ShapeOnlyOnRead()
    {
        Open().Update("V1", _ => new VisitMark(away: "10:00"));
        var tags = "[" + string.Join(",", Enumerable.Range(1, 12).Select(i => "\"이름표" + i + "\"")) + "]";
        WritePlain(CellJson("sono", "\"양 가나다라마바사아자차|꼬리뼈|1|2|3|4\"", tags));

        var cell = Open().Today()["V1"].Cells[ArrangeCol.Sono];
        Assert.Equal("양 가나다라마바사아자차|꼬리뼈|1|2|3|4", cell.Part);
        Assert.Equal(12, cell.Tags.Count);
        Assert.Empty(reports);

        var marks = Open();
        marks.Update("V2", _ => With(ArrangeCol.Carm, Cell(ArrangeStep.Todo, "없는 시술", "없는 약")));
        Assert.Equal(new[] { "없는 약" }, Open().Today()["V2"].Cells[ArrangeCol.Carm].Tags);
    }

    public static IEnumerable<object[]> BadCells() => new[]
    {
        new object[] { "7줄", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "1|2|3|4|5|6|7")) },
        new object[] { "14글자 줄", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "가나다라마바사아자차카타파하")) },
        new object[] { "빈 줄", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨|")) },
        new object[] { "빈 부위", With(ArrangeCol.Carm, Cell(ArrangeStep.Todo, "")) },
        new object[] { "제어 글자 줄", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어\n깨")) },
        new object[] { "빈 이름표", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", "")) },
        new object[] { "| 든 이름표", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", "DNA|채혈")) },
        new object[] { "11글자 이름표", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", "가나다라마바사아자차카")) },
        new object[] { "제어 글자 이름표", With(ArrangeCol.Carm, Cell(ArrangeStep.Todo, "허리", "T\u0007P")) },
        new object[] { "이름표 13개", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", Enumerable.Range(1, 13).Select(i => "t" + i).ToArray())) },
        new object[] { "null 이름표", With(ArrangeCol.Sono, Cell(ArrangeStep.Todo, "어깨", new string[] { null! })) },
        new object[] { "PT 칸에 이름표", With(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "10:00", new[] { "DNA" })) },
        new object[] { "X-RAY 칸에 이름표", With(ArrangeCol.Xray, new CellMark(ArrangeStep.Todo, true, "", null, null, null, "10:00", new[] { "DNA" })) },
        new object[] { "PT 칸에 부위", With(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "HP", "어깨", null, null, "10:00")) },
    };

    [Theory(DisplayName = "AC-3502.1 모양이 틀린 part·tags는 쓰지 않는다(ArgumentException, 파일 그대로)")]
    [MemberData(nameof(BadCells))]
    public void BadShapesRefused(string why, VisitMark bad)
    {
        var marks = Open();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        var calls = protector.ProtectCalls;

        Assert.ThrowsAny<ArgumentException>(() => marks.Update("V1001", _ => bad));

        Assert.True(calls == protector.ProtectCalls, why);
        Assert.Equal("10:20", Open().Today()["V1001"].Away);
    }

    [Theory(DisplayName = "AC-3502.1 파일의 tags가 빈 배열·배열 아님·글 아닌 값·모양이 틀린 글이면 깨진 파일이다(빈 표시 + E-STORE-BROKEN)")]
    [InlineData("\"어깨\"", "[]")]
    [InlineData("\"어깨\"", "\"DNA\"")]
    [InlineData("\"어깨\"", "null")]
    [InlineData("\"어깨\"", "[1]")]
    [InlineData("\"어깨\"", "[\"DNA|채혈\"]")]
    [InlineData("\"1|2|3|4|5|6|7\"", null)]
    public void BrokenTagsInFile(string part, string? tags)
    {
        Open().Update("V1", _ => new VisitMark(away: "10:00"));
        WritePlain(CellJson("sono", part, tags));

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }
}

/// <summary>
/// 판의 어레인지 칸 tags·part(ArrangeBuilder·Board.ToJson, AC-3502.2)와 맨 위 picks(AC-3501.4).
/// 가짜 상태 표·가짜 지도(SONO1·CARM1)·가짜 내원(V+숫자)만 쓴다.
/// </summary>
public class PickBoardTests
{
    private const string Day = "20261112";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 12, 11, 0, 0);

    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["QA"] = Lane.Wait };
    private static readonly string[] HiddenRsu = { "Z9" };
    private static readonly IReadOnlyList<ArrangeRule> Map = new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono), ArrangeRule.Code("CARM1", ArrangeCol.Carm) };
    private static readonly IReadOnlyDictionary<string, string> NoNames = new Dictionary<string, string>(StringComparer.Ordinal);
    private static readonly IReadOnlyDictionary<string, string> NoXray = new Dictionary<string, string>(StringComparer.Ordinal);

    private readonly VisitKeys keys = new VisitKeys();

    private static VisitRow Visit(string id, params OrderItem[] orders) =>
        new VisitRow(id, "9000" + id.Substring(1), Day + "090000", "QA", "N", orders: orders);

    private BoardInput Input(params VisitRow[] visits) => new BoardInput(Day, ReadAt, visits, NoNames);

    private Arrange Arranged(BoardInput input, Dictionary<string, VisitMark> marks) =>
        ArrangeBuilder.Build(input, Statuses, HiddenRsu, Map, marks, NoXray, keys);

    private Board BoardOf(BoardInput input) => BoardBuilder.Build(input, Statuses, HiddenRsu, NoXray, keys, ReadAt);

    private static PickLists Custom() =>
        PickLists.TryParse(Picks.Bytes(Picks.Body(procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":true}]", drugs: "[]", parts: "[]", plains: "[\"드레싱\"]", withs: "[\"주사\"]")), out var lists)
            ? lists
            : throw new InvalidOperationException("시험 목록이 틀렸다");

    [Fact(DisplayName = "AC-3502.2 판의 어레인지 칸마다 tags(늘 배열, 처방에서만 온 칸은 [])가 part 뒤에 있고 part는 null 또는 \"|\"로 이은 글이다")]
    public void CellsHaveTags()
    {
        var input = Input(Visit("V1", new OrderItem("SONO1", "09:30", null), new OrderItem("CARM1", "09:31", null)), Visit("V2", new OrderItem("SONO1", "09:32", null)));
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
        {
            ["V1"] = new VisitMark()
                .WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Ready, false, "", "오른 어깨|왼 무릎", "10:00", null, null, new[] { "DNA", "채혈" }))
                .WithCell(ArrangeCol.Carm, new CellMark(ArrangeStep.Todo, false, "", "허리", null, null, null, new[] { "TP" })),
        };
        var arrange = Arranged(input, marks);
        var v1 = arrange.Rows.Single(r => r.Key == keys.KeyOf(Day, "V1"));
        Assert.Equal(new[] { "DNA", "채혈" }, v1.Cells[ArrangeCol.Sono].Tags);
        Assert.Equal("오른 어깨|왼 무릎", v1.Cells[ArrangeCol.Sono].Part);
        Assert.Equal(new[] { "TP" }, v1.Cells[ArrangeCol.Carm].Tags);

        using var document = JsonDocument.Parse(BoardOf(input).ToJson(arrange));
        var rows = document.RootElement.GetProperty("arrange").GetProperty("rows").EnumerateArray().ToArray();
        var sono = rows[0].GetProperty("cells").GetProperty("sono");
        Assert.Equal(new[] { "st", "det", "part", "tags", "at", "ord", "manual" }, sono.EnumerateObject().Select(p => p.Name));
        Assert.Equal("오른 어깨|왼 무릎", sono.GetProperty("part").GetString());
        Assert.Equal(new[] { "DNA", "채혈" }, sono.GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal(new[] { "TP" }, rows[0].GetProperty("cells").GetProperty("carm").GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
        var plain = rows[1].GetProperty("cells").GetProperty("sono");
        Assert.Equal(JsonValueKind.Array, plain.GetProperty("tags").ValueKind);
        Assert.Empty(plain.GetProperty("tags").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("part").ValueKind);
    }

    [Fact(DisplayName = "AC-3502.2 직접 칸(PT 등)·X-RAY 칸도 tags는 빈 배열이다")]
    public void OtherCellsHaveEmptyTags()
    {
        var input = Input(Visit("V1"));
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
        {
            ["V1"] = new VisitMark()
                .WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "10:00"))
                .WithCell(ArrangeCol.Xray, new CellMark(ArrangeStep.Todo, true, "", null, null, null, "10:01")),
        };
        using var document = JsonDocument.Parse(BoardOf(input).ToJson(Arranged(input, marks)));
        var cells = document.RootElement.GetProperty("arrange").GetProperty("rows")[0].GetProperty("cells");
        foreach (var col in new[] { "pt", "xray" })
        {
            Assert.Equal(JsonValueKind.Array, cells.GetProperty(col).GetProperty("tags").ValueKind);
            Assert.Empty(cells.GetProperty(col).GetProperty("tags").EnumerateArray());
        }
    }

    [Fact(DisplayName = "AC-3501.4 어레인지 칸을 보내는 판은 맨 위(arrange 뒤)에 picks = { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs } }(넘긴 목록)가 있다")]
    public void BoardCarriesPicks()
    {
        var input = Input(Visit("V1", new OrderItem("SONO1", "09:30", null)));
        var board = BoardOf(input);
        var arrange = Arranged(input, new Dictionary<string, VisitMark>(StringComparer.Ordinal));

        using var document = JsonDocument.Parse(board.ToJson(arrange, Custom()));
        var root = document.RootElement;
        Assert.Equal(new[] { "state", "at", "every", "counts", "lists", "arrange", "picks" }, root.EnumerateObject().Select(p => p.Name));
        var picks = root.GetProperty("picks");
        Assert.Equal(Picks.Json(Custom()), picks.GetRawText());
        Assert.True(PickLists.TryParse(Encoding.UTF8.GetBytes(picks.GetRawText()), out var read));
        Assert.Equal(Picks.Json(Custom()), Picks.Json(read));
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac" }, picks.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "n", "noDrug" }, picks.GetProperty("carm").GetProperty("procs")[0].EnumerateObject().Select(p => p.Name));
    }

    [Fact(DisplayName = "AC-3501.4 목록을 넘기지 않은 어레인지 판은 기본 목록을 picks로 보내고, 어레인지를 보내지 않는 판에는 picks가 없다")]
    public void PicksOnlyWithArrange()
    {
        var input = Input(Visit("V1"));
        var board = BoardOf(input);
        var arrange = Arranged(input, new Dictionary<string, VisitMark>(StringComparer.Ordinal));

        using (var document = JsonDocument.Parse(board.ToJson(arrange)))
            Assert.Equal(Picks.Json(PickLists.Defaults), document.RootElement.GetProperty("picks").GetRawText());
        Assert.Equal(board.ToJson(), board.ToJson(null, Custom()));
        Assert.DoesNotContain("\"picks\"", board.ToJson());
        var withArrange = board.ToJson(arrange, Custom());
        Assert.StartsWith(board.ToJson(arrange).Split(new[] { ",\"picks\":" }, StringSplitOptions.None)[0] + ",\"picks\":", withArrange, StringComparison.Ordinal);
    }
}

/// <summary>
/// 쓰기 몸의 t와 지금 목록으로 보는 SONO·C-ARM 넣기·고르기(ArrangeWrite, AC-3502.3).
/// </summary>
public class PickWriteTests
{
    private const string Now = "10:30";
    private const string Key = "0123456789abcdef";

    private static ArrangeOp Op(string op, ArrangeCol? col, string? v, string? t = null) => new ArrangeOp(Key, op, col, v, t);

    private static readonly IReadOnlyDictionary<ArrangeCol, ArrangeCell> NoCells = new Dictionary<ArrangeCol, ArrangeCell>();

    private static IReadOnlyDictionary<ArrangeCol, ArrangeCell> One(ArrangeCol col, ArrangeCell cell) => new Dictionary<ArrangeCol, ArrangeCell> { [col] = cell };

    private static CellMark? CellOf(ArrangeWriteResult result, ArrangeCol col) =>
        result.Next != null && result.Next.Cells.TryGetValue(col, out var cell) ? cell : null;

    private static PickLists Custom() =>
        PickLists.TryParse(Picks.Bytes(Picks.Body(
            procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false}]", drugs: "[\"새약\"]", parts: "[\"꼬리뼈\"]", plains: "[\"드레싱\"]", withs: "[\"주사\"]")), out var lists)
            ? lists
            : throw new InvalidOperationException("시험 목록이 틀렸다");

    [Theory(DisplayName = "AC-3502.3 몸에 새 칸 t(글)를 받는다(없어도 됨), 글이 아닌 t·같은 t 두 번은 받지 않는다")]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"add\",\"col\":\"sono\",\"v\":\"오른 어깨|왼 무릎\",\"t\":\"DNA\"}", true, "DNA")]
    [InlineData("{\"t\":\"TP\",\"k\":\"0123456789abcdef\",\"op\":\"part\",\"col\":\"carm\",\"v\":\"허리\"}", true, "TP")]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"add\",\"col\":\"sono\",\"v\":\"어깨\"}", true, null)]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"add\",\"col\":\"sono\",\"v\":\"어깨\",\"t\":[\"DNA\"]}", false, null)]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"add\",\"col\":\"sono\",\"v\":\"어깨\",\"t\":null}", false, null)]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"add\",\"col\":\"sono\",\"v\":\"어깨\",\"t\":\"DNA\",\"t\":\"채혈\"}", false, null)]
    public void ParsesT(string json, bool ok, string? t)
    {
        Assert.Equal(ok, ArrangeWrite.TryParse(Encoding.UTF8.GetBytes(json), out var op));
        if (ok) Assert.Equal(t, op.T);
    }

    [Fact(DisplayName = "AC-3502.3 SONO add: v = 겹침 없는 1~6줄·t = 같이 하는 것 일부면 빈 칸에 part = v, tags = t를 \"|\"로 나눈 것(직접 넣음·넣은 시각)")]
    public void SonoAdd()
    {
        var result = ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "오른 어깨|왼 무릎", "DNA|채혈"), null, NoCells, Now);
        Assert.Equal(204, result.Status);
        var cell = CellOf(result, ArrangeCol.Sono)!;
        Assert.Equal((ArrangeStep.Todo, true, "", "오른 어깨|왼 무릎", "10:30"), (cell.St, cell.Manual, cell.Det, cell.Part, cell.AddedAt));
        Assert.Equal(new[] { "DNA", "채혈" }, cell.Tags);

        var plain = CellOf(ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "소독"), null, NoCells, Now), ArrangeCol.Sono)!;
        Assert.Equal("소독", plain.Part);
        Assert.Empty(plain.Tags);
        Assert.Empty(CellOf(ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "어깨", ""), null, NoCells, Now), ArrangeCol.Sono)!.Tags);
    }

    [Fact(DisplayName = "AC-3502.3 C-ARM add: v = 시술 하나·t = 약재 0~1개면 part = 시술, tags = [약재], 약재 없음 시술은 약재 없이")]
    public void CarmAdd()
    {
        var cell = CellOf(ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "허리", "TP"), null, NoCells, Now), ArrangeCol.Carm)!;
        Assert.Equal(("허리", true), (cell.Part, cell.Manual));
        Assert.Equal(new[] { "TP" }, cell.Tags);
        var reduction = CellOf(ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "리덕션"), null, NoCells, Now), ArrangeCol.Carm)!;
        Assert.Equal("리덕션", reduction.Part);
        Assert.Empty(reduction.Tags);
    }

    [Fact(DisplayName = "AC-3502.3 part: 있는 SONO·C-ARM 칸에 part = v·tags = t를 넣고(전 이름표는 바뀜), 단계 옮기기는 part·tags를 남긴다")]
    public void PartSetsTagsAndStepsKeepThem()
    {
        var current = new VisitMark().WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Todo, false, "", "목", null, null, null, new[] { "채혈" }));
        var cells = One(ArrangeCol.Sono, new ArrangeCell(ArrangeStep.Todo, "", "목", "09:30", 1, false));
        var parted = ArrangeWrite.Apply(Op("part", ArrangeCol.Sono, "양 무릎", "DNA"), current, cells, Now);
        Assert.Equal(204, parted.Status);
        var cell = CellOf(parted, ArrangeCol.Sono)!;
        Assert.Equal(("양 무릎", ArrangeStep.Todo, false), (cell.Part, cell.St, cell.Manual));
        Assert.Equal(new[] { "DNA" }, cell.Tags);

        var stepped = CellOf(ArrangeWrite.Apply(new ArrangeOp(Key, "step", ArrangeCol.Sono, null), parted.Next, cells, Now), ArrangeCol.Sono)!;
        Assert.Equal((ArrangeStep.Ready, "양 무릎"), (stepped.St, stepped.Part));
        Assert.Equal(new[] { "DNA" }, stepped.Tags);
        var set = CellOf(ArrangeWrite.Apply(new ArrangeOp(Key, "set", ArrangeCol.Sono, "done"), parted.Next, cells, Now), ArrangeCol.Sono)!;
        Assert.Equal(new[] { "DNA" }, set.Tags);

        var carm = ArrangeWrite.Apply(Op("part", ArrangeCol.Carm, "목", "기본"), null, One(ArrangeCol.Carm, new ArrangeCell(ArrangeStep.Todo, "", null, "09:40", 1, false)), Now);
        Assert.Equal(("목", ArrangeStep.Todo, true), (CellOf(carm, ArrangeCol.Carm)!.Part, CellOf(carm, ArrangeCol.Carm)!.St, carm.ChangesMarks));
        Assert.Equal(new[] { "기본" }, CellOf(carm, ArrangeCol.Carm)!.Tags);
    }

    public static IEnumerable<object?[]> Refused() => new[]
    {
        new object?[] { "SONO 목록 밖 부위", "add", ArrangeCol.Sono, "꼬리뼈", null },
        new object?[] { "SONO 7줄", "add", ArrangeCol.Sono, "목|등|허리|어깨|위팔|팔꿈치|손목", null },
        new object?[] { "SONO 겹친 줄", "add", ArrangeCol.Sono, "어깨|어깨", null },
        new object?[] { "SONO 쪽 글 틀림", "add", ArrangeCol.Sono, "오른쪽 어깨", null },
        new object?[] { "SONO 같이 목록 밖", "add", ArrangeCol.Sono, "어깨", "TP" },
        new object?[] { "SONO 같이 겹침", "add", ArrangeCol.Sono, "어깨", "DNA|DNA" },
        new object?[] { "SONO 부위는 나중에", "add", ArrangeCol.Sono, "부위는 나중에", null },
        new object?[] { "C-ARM 부위는 나중에", "add", ArrangeCol.Carm, "부위는 나중에", null },
        new object?[] { "C-ARM 목록 밖 시술", "add", ArrangeCol.Carm, "어깨", null },
        new object?[] { "C-ARM 쪽 글 + 시술", "add", ArrangeCol.Carm, "오른 허리", null },
        new object?[] { "C-ARM 시술 둘", "add", ArrangeCol.Carm, "허리|목", null },
        new object?[] { "C-ARM 약재 둘", "add", ArrangeCol.Carm, "허리", "TP|하프" },
        new object?[] { "C-ARM 약재 없음 시술에 약재", "add", ArrangeCol.Carm, "리덕션", "TP" },
        new object?[] { "C-ARM 목록 밖 약재", "add", ArrangeCol.Carm, "허리", "DNA" },
        new object?[] { "part SONO 부위는 나중에", "part", ArrangeCol.Sono, "부위는 나중에", null },
        new object?[] { "part C-ARM 약재 없음에 약재", "part", ArrangeCol.Carm, "리덕션", "기본" },
        new object?[] { "PT add에 t", "add", ArrangeCol.Pt, "HP", "DNA" },
        new object?[] { "PT add에 빈 t", "add", ArrangeCol.Pt, "HP", "" },
        new object?[] { "X-RAY add에 t", "add", ArrangeCol.Xray, "X-ray 찍기", "DNA" },
        new object?[] { "step에 t", "step", ArrangeCol.Sono, null, "DNA" },
        new object?[] { "set에 t", "set", ArrangeCol.Carm, "done", "TP" },
        new object?[] { "remove에 t", "remove", ArrangeCol.Sono, null, "DNA" },
        new object?[] { "away에 t", "away", null, "on", "DNA" },
        new object?[] { "ptf에 t", "ptf", null, "up", "" },
        new object?[] { "end에 t", "end", null, "on", "x" },
    };

    [Theory(DisplayName = "AC-3502.3 지금 목록에 어긋나거나, 다른 op·칸에 t가 있거나, v가 \"부위는 나중에\"면 400이다")]
    [MemberData(nameof(Refused))]
    public void RefusedWrites(string why, string op, ArrangeCol? col, string? v, string? t)
    {
        IReadOnlyDictionary<ArrangeCol, ArrangeCell> cells = op == "add"
            ? NoCells
            : new Dictionary<ArrangeCol, ArrangeCell>
            {
                [ArrangeCol.Sono] = new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", 1, true),
                [ArrangeCol.Carm] = new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", 1, true),
            };
        var current = op == "add" ? null : new VisitMark()
            .WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Todo, true, "", "목", null, null, "09:30"))
            .WithCell(ArrangeCol.Carm, new CellMark(ArrangeStep.Todo, true, "", "허리", null, null, "09:30"));
        var result = ArrangeWrite.Apply(Op(op, col, v, t), current, cells, Now);
        Assert.True(result.Status == 400, why + " → " + result.Status);
        Assert.False(result.ChangesMarks, why);
    }

    [Fact(DisplayName = "AC-3502.3 쓰기 검사는 넘긴 지금 목록으로 본다(없으면 기본값): 새 목록의 이름은 받고 기본값에만 있는 이름은 400")]
    public void ChecksFollowPassedLists()
    {
        var lists = Custom();
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "왼 꼬리뼈|드레싱", "주사"), null, NoCells, Now, picks: lists).Status);
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "꼬리뼈", "새약"), null, NoCells, Now, picks: lists).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "어깨"), null, NoCells, Now, picks: lists).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "허리", "TP"), null, NoCells, Now, picks: lists).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "꼬리뼈"), null, NoCells, Now).Status);
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "어깨"), null, NoCells, Now).Status);
    }

    [Fact(DisplayName = "AC-3502.3 PT·충격파 등 다른 칸의 add 목록은 그대로이고 SONO·C-ARM 옛 부위 목록·\"부위는 나중에\"는 ArrangeChoices에 없다")]
    public void OtherChoicesUnchanged()
    {
        var lists = PickLists.Defaults;
        Assert.Equal(new[] { "X-ray 찍기" }, ArrangeChoices.AddOf(ArrangeCol.Xray, lists));
        Assert.Equal(new[] { "ICE", "HP" }, ArrangeChoices.AddOf(ArrangeCol.Pt, lists));
        Assert.Equal(new[] { "30분", "50분" }, ArrangeChoices.AddOf(ArrangeCol.Ds, lists));
        Assert.Equal(new[] { "목", "허리" }, ArrangeChoices.AddOf(ArrangeCol.Trac, lists));
        Assert.Equal(20, ArrangeChoices.AddOf(ArrangeCol.Eswt, lists).Count);
        Assert.Empty(ArrangeChoices.AddOf(ArrangeCol.Sono, lists));
        Assert.Empty(ArrangeChoices.AddOf(ArrangeCol.Carm, lists));
        var members = typeof(ArrangeChoices).GetMembers().Select(m => m.Name).ToArray();
        Assert.DoesNotContain("Parts", members);
        Assert.DoesNotContain("PartLater", members);
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "HP"), null, NoCells, Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "도수"), null, NoCells, Now).Status);
    }
}
