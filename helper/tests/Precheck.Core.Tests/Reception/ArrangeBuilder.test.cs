using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeBoard 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeBoard;

/// <summary>
/// 어레인지 자료 만들기(ArrangeBuilder·Board.ToJson(arrange), spec reception-arrange design.md 7절, REQ-3305·AC-3301.3).
/// 가짜 상태 표·우리 의원 처음 값 칸(ArrangeLayout.Ours: X-ray G 촬영 코드, SONO1·EB422 등 → SONO, CARM1 → C-ARM, spec reception-other-clinic AC-5702.2)·가짜 내원(V+숫자)만 쓴다.
/// </summary>
public class ArrangeBuilderTests
{
    private const string Day = "20261109";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 9, 11, 0, 0);

    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal)
    {
        ["QA"] = Lane.Wait, ["QB"] = Lane.Hold, ["QC"] = Lane.Pay, ["QD"] = Lane.Done, ["QX"] = Lane.Hidden,
    };

    private static readonly string[] HiddenRsu = { "Z9" };

    private static readonly IReadOnlyDictionary<string, string> Names = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["EB422"] = "흉부 초음파",
        ["ESWT7"] = "체외충격파",
    };

    private static OrderItem Order(string code, string? at, string? part = null) => new OrderItem(code, at, part);

    private static VisitRow Visit(string id, string status, string hhmm, string? rsu = "N", string? lastSymptom = null, params OrderItem[] orders) =>
        new VisitRow(id, "9000" + id.Substring(1), Day + hhmm + "00", status, rsu, lastSymptom: lastSymptom, orders: orders);

    private static CellMark Mark(ArrangeStep st, bool manual = false, string det = "", string? part = null, string? readyAt = null, string? doneAt = null, string? addedAt = null) =>
        new CellMark(st, manual, det, part, readyAt, doneAt, addedAt);

    private sealed class Scene
    {
        public List<VisitRow> Visits { get; } = new List<VisitRow>();
        public Dictionary<string, VisitMark> Marks { get; } = new Dictionary<string, VisitMark>(StringComparer.Ordinal);
        public Dictionary<string, string> Xray { get; } = new Dictionary<string, string>(StringComparer.Ordinal);
        public VisitKeys Keys { get; } = new VisitKeys();

        public Scene Add(params VisitRow[] rows)
        {
            Visits.AddRange(rows);
            return this;
        }

        public Scene With(string visit, VisitMark mark)
        {
            Marks[visit] = mark;
            return this;
        }

        public BoardInput Input() => new BoardInput(Day, ReadAt, Visits.ToArray(), Names);

        public Arrange Build() => ArrangeBuilder.Build(Input(), Statuses, HiddenRsu, ArrangeLayout.Ours, Marks, Xray, Keys);

        public string Key(string visit) => Keys.KeyOf(Day, visit);

        public JsonElement Json()
        {
            var board = BoardBuilder.Build(Input(), Statuses, HiddenRsu, new Dictionary<string, string>(), Keys, ReadAt);
            using var document = JsonDocument.Parse(board.ToJson(Build()));
            return document.RootElement.Clone();
        }

        public ArrangeRow Row(string visit) => Build().Rows.Single(r => r.Key == Key(visit));
    }

    private static ArrangeCell? CellOf(Scene scene, string visit, string col) =>
        scene.Row(visit).Cells.TryGetValue(col, out var cell) ? cell : null;

    // ---- AC-3305.1 /api/board 답에 더함 -------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.1 ToJson(arrange)는 arrange { rows, ended }를 더하고 그 밖(state·at·every·counts·lists)은 ToJson()과 한 글자도 같다")]
    public void ArrangeAddedToBoardJson()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0910", null, null, Order("SONO1", "09:30")), Visit("V2", "QD", "0915"));
        scene.With("V2", new VisitMark(endedAt: "10:40"));
        var board = BoardBuilder.Build(scene.Input(), Statuses, HiddenRsu, new Dictionary<string, string>(), scene.Keys, ReadAt);

        var plain = board.ToJson();
        var with = board.ToJson(scene.Build());

        Assert.Equal(plain, board.ToJson(null));
        Assert.DoesNotContain("\"arrange\"", plain);
        Assert.StartsWith(plain.Substring(0, plain.Length - 1) + ",\"arrange\":{", with, StringComparison.Ordinal);
        using var document = JsonDocument.Parse(with);
        var arrange = document.RootElement.GetProperty("arrange");
        Assert.Equal(new[] { "rows", "ended" }, arrange.EnumerateObject().Select(p => p.Name));
        Assert.Single(arrange.GetProperty("rows").EnumerateArray());
        Assert.Single(arrange.GetProperty("ended").EnumerateArray());
    }

    // ---- AC-3305.2 줄 고르기·차례 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.2 진료대기·진료보류·수납대기·끝남 칸의 접수만, 접수 빠른 순(같으면 내원번호 순, V9 다음 V10)이고 숨김·취소 줄은 없다. 끝남(수납완료) 줄은 저절로 ended에 간다(AC-3305.10)")]
    public void RowsInAcceptedOrder()
    {
        var scene = new Scene().Add(
            Visit("V10", "QC", "0900"), Visit("V9", "QD", "0900"), Visit("V3", "QA", "0830"),
            Visit("V4", "QB", "0950"), Visit("V5", "QX", "0800"), Visit("V6", "QA", "0805", rsu: "Z9"), Visit("V7", "WEIRD", "0801"),
            Visit("V8", "QD", "0901"));
        scene.With("V8", new VisitMark(kept: true));

        var arrange = scene.Build();

        Assert.Equal(new[] { "V3", "V10", "V8", "V4" }.Select(scene.Key), arrange.Rows.Select(r => r.Key));
        Assert.Equal(new[] { scene.Key("V9") }, arrange.Ended.Select(e => e.Key));
    }

    [Fact(DisplayName = "AC-3305.2 endedAt이 있는 접수는 rows가 아니라 ended에 가고, ended는 종료 시각 늦은 순이다")]
    public void EndedRows()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900"), Visit("V2", "QB", "0905"), Visit("V3", "QD", "0910"), Visit("V4", "QC", "0915"));
        scene.With("V1", new VisitMark(endedAt: "10:20")).With("V3", new VisitMark(endedAt: "10:45")).With("V4", new VisitMark(endedAt: "10:20"));

        var arrange = scene.Build();

        Assert.Equal(new[] { scene.Key("V2") }, arrange.Rows.Select(r => r.Key));
        Assert.Equal(new (string, string?)[] { (scene.Key("V3"), "10:45"), (scene.Key("V1"), "10:20"), (scene.Key("V4"), "10:20") }, arrange.Ended.Select(e => (e.Key, e.EndedAt)));
    }

    // ---- AC-3305.3 줄 모양 --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.3 줄은 k·away·back·backWait(spec reception-arrange-tune AC-3601.4)·ptf·last·cells(일곱 칸, 없으면 null)·allDone뿐이고 이름·차트번호·메모·상태·접수 시각은 다시 넣지 않는다")]
    public void RowShape()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0910", null, "  허리 통증  ", Order("SONO1", "09:30")));
        scene.With("V1", new VisitMark(away: "10:50", ptf: new PtFirst("up", "10:40")));

        var row = scene.Json().GetProperty("arrange").GetProperty("rows")[0];

        Assert.Equal(new[] { "k", "away", "back", "backWait", "ptf", "last", "cells", "allDone" }, row.EnumerateObject().Select(p => p.Name));
        Assert.Equal(scene.Key("V1"), row.GetProperty("k").GetString());
        Assert.Equal("10:50", row.GetProperty("away").GetString());
        Assert.Equal(new[] { "st", "at" }, row.GetProperty("ptf").EnumerateObject().Select(p => p.Name));
        Assert.Equal("up", row.GetProperty("ptf").GetProperty("st").GetString());
        Assert.Equal("허리 통증", row.GetProperty("last").GetString());
        Assert.Equal(new[] { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" }, row.GetProperty("cells").EnumerateObject().Select(p => p.Name));
        Assert.Equal(JsonValueKind.Null, row.GetProperty("cells").GetProperty("xray").ValueKind);
        Assert.Equal(new[] { "st", "det", "part", "tags", "at", "ord", "manual" }, row.GetProperty("cells").GetProperty("sono").EnumerateObject().Select(p => p.Name));
        Assert.False(row.GetProperty("allDone").GetBoolean());
        // 열쇠(무작위 16진수)는 빼고 본다
        var text = row.GetRawText().Replace(scene.Key("V1"), "");
        foreach (var hidden in new[] { "90001", "QA", "0910", "chart", "name", "memo" }) Assert.DoesNotContain(hidden, text);
    }

    [Fact(DisplayName = "AC-3305.3 지난 증상이 없으면 last는 \"\"이고 away·ptf가 없으면 null이다")]
    public void EmptyRow()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0910"));

        var row = scene.Json().GetProperty("arrange").GetProperty("rows")[0];

        Assert.Equal("", row.GetProperty("last").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("away").ValueKind);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("ptf").ValueKind);
    }

    // ---- AC-3305.4 칸 하나 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.4 처방에서 온 칸은 todo·처방 시각·manual false·det \"\"이고, 표시가 ready면 readyAt, done이면 doneAt을 쓴다")]
    public void CellFromOrderAndMark()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("SONO1", "09:30")),
            Visit("V2", "QB", "0905", null, null, Order("SONO1", "09:31")),
            Visit("V3", "QC", "0910", null, null, Order("CARM1", "09:32")));
        scene.With("V2", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Ready, readyAt: "10:05")));
        scene.With("V3", new VisitMark().WithCell(ArrangeKeys.Carm, Mark(ArrangeStep.Done, readyAt: "10:00", doneAt: "10:20")));

        var todo = CellOf(scene, "V1", ArrangeKeys.Sono)!;
        var ready = CellOf(scene, "V2", ArrangeKeys.Sono)!;
        var done = CellOf(scene, "V3", ArrangeKeys.Carm)!;

        Assert.Equal((ArrangeStep.Todo, "09:30", false, ""), (todo.St, todo.At, todo.Manual, todo.Det));
        Assert.Equal((ArrangeStep.Ready, "10:05", false), (ready.St, ready.At, ready.Manual));
        Assert.Equal((ArrangeStep.Done, "10:20", false), (done.St, done.At, done.Manual));
    }

    [Fact(DisplayName = "AC-3305.4 직접 넣은 칸은 표시만으로 생기고 manual true·at은 넣은 시각이며, gone 표시면 처방이 있어도 칸이 없다")]
    public void ManualAndGoneCells()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900", null, null, Order("SONO1", "09:30"), Order("G1234", "09:30")));
        scene.With("V1", new VisitMark()
            .WithCell(ArrangeKeys.Carm, Mark(ArrangeStep.Todo, manual: true, addedAt: "09:50"))
            .WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Gone)));

        var row = scene.Row("V1");

        Assert.False(row.Cells.ContainsKey(ArrangeKeys.Sono));
        var carm = row.Cells[ArrangeKeys.Carm];
        Assert.Equal((ArrangeStep.Todo, "09:50", true), (carm.St, carm.At, carm.Manual));
        Assert.Equal((ArrangeStep.Todo, "09:30", false), (row.Cells[ArrangeKeys.Xray].St, row.Cells[ArrangeKeys.Xray].At, row.Cells[ArrangeKeys.Xray].Manual));
    }

    [Fact(DisplayName = "AC-3305.4 직접 칸(pt·ds·eswt·trac)은 처방을 보지 않고 표시로만 생기며 늘 manual true, 칸 글은 표시의 det다")]
    public void ManualOnlyColumns()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900", null, null, Order("ESWT7", "09:30")));
        Assert.Empty(scene.Row("V1").Cells);

        scene.With("V1", new VisitMark()
            .WithCell(ArrangeKeys.Pt, Mark(ArrangeStep.Done, manual: true, det: "HP", addedAt: "09:40", doneAt: "10:00"))
            .WithCell(ArrangeKeys.Eswt, Mark(ArrangeStep.Todo, manual: false, det: "2부위", addedAt: "09:41")));

        var row = scene.Row("V1");
        Assert.Equal((ArrangeStep.Done, "HP", "10:00", true), (row.Cells[ArrangeKeys.Pt].St, row.Cells[ArrangeKeys.Pt].Det, row.Cells[ArrangeKeys.Pt].At, row.Cells[ArrangeKeys.Pt].Manual));
        Assert.Equal((ArrangeStep.Todo, "2부위", "09:41", true), (row.Cells[ArrangeKeys.Eswt].St, row.Cells[ArrangeKeys.Eswt].Det, row.Cells[ArrangeKeys.Eswt].At, row.Cells[ArrangeKeys.Eswt].Manual));
    }

    [Fact(DisplayName = "AC-3305.4 처방이 사라진(직접 넣지 않은) 칸의 표시만 남으면 칸이 없다")]
    public void MarkWithoutOrder()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900"));
        scene.With("V1", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Ready, readyAt: "10:00")));

        Assert.Empty(scene.Row("V1").Cells);
    }

    // ---- AC-3301.3 같은 칸 모으기 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-3301.3 한 내원의 오늘 처방 여럿이 같은 칸에 들면 칸은 하나이고 시각은 가장 이른 것, 부위는 처음 빈 글 아닌 것이다(다른 코드 포함)")]
    public void SameColumnMerged()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900", null, null,
            Order("SONO1", "09:40", null), Order("EB422", "09:35", ""), Order("SONO1", null, "오른 어깨"), Order("SONO1", "09:50", "왼 무릎")));

        var row = scene.Row("V1");

        Assert.Single(row.Cells);
        var sono = row.Cells[ArrangeKeys.Sono];
        Assert.Equal("09:35", sono.At);
        Assert.Equal("오른 어깨", sono.Part);
    }

    // ---- AC-3305.5 순서 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.5 SONO·C-ARM의 끝나지 않은 칸은 칸마다 처방(또는 직접 넣은) 시각 빠른 순(같으면 접수 순)으로 1부터 ord, 끝난 칸·다른 칸·종료한 줄은 null")]
    public void QueueOrder()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("SONO1", "09:40"), Order("G1234", "09:10")),
            Visit("V2", "QA", "0905", null, null, Order("SONO1", "09:20"), Order("CARM1", "09:45")),
            Visit("V3", "QB", "0910", null, null, Order("SONO1", "09:40")),
            Visit("V4", "QC", "0915", null, null, Order("SONO1", "09:00")),
            Visit("V5", "QA", "0920", null, null, Order("SONO1", "09:05")),
            Visit("V6", "QA", "0925"));
        scene.With("V2", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Ready, readyAt: "10:30")));
        scene.With("V4", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Done, doneAt: "09:30")));
        scene.With("V5", new VisitMark(endedAt: "10:00"));
        scene.With("V6", new VisitMark().WithCell(ArrangeKeys.Carm, Mark(ArrangeStep.Todo, manual: true, addedAt: "09:44")));

        int? Ord(string visit, string col) => CellOf(scene, visit, col)?.Ord;

        Assert.Equal(1, Ord("V2", ArrangeKeys.Sono));
        Assert.Equal(2, Ord("V1", ArrangeKeys.Sono));
        Assert.Equal(3, Ord("V3", ArrangeKeys.Sono));
        Assert.Null(Ord("V4", ArrangeKeys.Sono));
        Assert.Equal(1, Ord("V6", ArrangeKeys.Carm));
        Assert.Equal(2, Ord("V2", ArrangeKeys.Carm));
        Assert.Null(Ord("V1", ArrangeKeys.Xray));
    }

    [Fact(DisplayName = "AC-3305.5 처방 시각을 모르는 칸(비트 시각 칸이 비거나 모양이 틀림)은 todo·at null(JSON \"at\":null)이고 순서는 시각 있는 칸 뒤다")]
    public void UnknownOrderTime()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("SONO1", null)),
            Visit("V2", "QA", "0905", null, null, Order("SONO1", "09:50")));

        var unknown = CellOf(scene, "V1", ArrangeKeys.Sono)!;
        Assert.Equal((ArrangeStep.Todo, (string?)null, (int?)2), (unknown.St, unknown.At, unknown.Ord));
        Assert.Equal(1, CellOf(scene, "V2", ArrangeKeys.Sono)!.Ord);
        var cell = scene.Json().GetProperty("arrange").GetProperty("rows")[0].GetProperty("cells").GetProperty("sono");
        Assert.Equal(JsonValueKind.Null, cell.GetProperty("at").ValueKind);
    }

    // ---- AC-3305.6 X-RAY와 X-ray 완료 표시 ------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.6 X-RAY 처방이나 직접 넣음이 있고 X-ray 완료 표시가 있으면 done·그 표시 시각, 처방이 없어도 표시가 있으면 끝난 X-RAY 칸(manual)이 있다")]
    public void XrayMarksMakeDone()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("G1234", "09:10")),
            Visit("V2", "QB", "0905"),
            Visit("V3", "QA", "0910", null, null, Order("G1234", "09:12")),
            Visit("V4", "QA", "0915"));
        scene.With("V4", new VisitMark().WithCell(ArrangeKeys.Xray, Mark(ArrangeStep.Todo, manual: true, addedAt: "09:20")));
        scene.Xray["V1"] = "09:55";
        scene.Xray["V2"] = "10:01";
        scene.Xray["V4"] = "10:02";

        Assert.Equal((ArrangeStep.Done, "09:55", false), Tuple(CellOf(scene, "V1", ArrangeKeys.Xray)!));
        Assert.Equal((ArrangeStep.Done, "10:01", true), Tuple(CellOf(scene, "V2", ArrangeKeys.Xray)!));
        Assert.Equal((ArrangeStep.Todo, "09:12", false), Tuple(CellOf(scene, "V3", ArrangeKeys.Xray)!));
        Assert.Equal((ArrangeStep.Done, "10:02", true), Tuple(CellOf(scene, "V4", ArrangeKeys.Xray)!));
    }

    private static (ArrangeStep, string?, bool) Tuple(ArrangeCell cell) => (cell.St, cell.At, cell.Manual);

    // ---- AC-3305.7 부위 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.7 SONO·C-ARM 부위는 표시의 part, 없으면 비트 부위, 둘 다 없으면 null이고 다른 칸의 part는 null이다")]
    public void Parts()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("SONO1", "09:10", "목"), Order("CARM1", "09:11", "허리")),
            Visit("V2", "QA", "0905", null, null, Order("SONO1", "09:12"), Order("G1234", "09:13", "목")));
        scene.With("V1", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Todo, part: "왼 어깨")));

        Assert.Equal("왼 어깨", CellOf(scene, "V1", ArrangeKeys.Sono)!.Part);
        Assert.Equal("허리", CellOf(scene, "V1", ArrangeKeys.Carm)!.Part);
        Assert.Null(CellOf(scene, "V2", ArrangeKeys.Sono)!.Part);
        Assert.Null(CellOf(scene, "V2", ArrangeKeys.Xray)!.Part);
    }

    // ---- AC-3305.8 allDone ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.8 칸이 하나 이상이고 모두 done이면 allDone true, 칸이 없거나 하나라도 끝나지 않았으면 false")]
    public void AllDone()
    {
        var scene = new Scene().Add(
            Visit("V1", "QA", "0900", null, null, Order("SONO1", "09:10")),
            Visit("V2", "QA", "0905", null, null, Order("SONO1", "09:10")),
            Visit("V3", "QA", "0910"));
        scene.With("V1", new VisitMark().WithCell(ArrangeKeys.Sono, Mark(ArrangeStep.Done, doneAt: "09:40"))
            .WithCell(ArrangeKeys.Pt, Mark(ArrangeStep.Done, manual: true, det: "ICE", addedAt: "09:00", doneAt: "09:30")));
        scene.With("V2", new VisitMark().WithCell(ArrangeKeys.Pt, Mark(ArrangeStep.Done, manual: true, det: "ICE", addedAt: "09:00", doneAt: "09:30")));

        Assert.True(scene.Row("V1").AllDone);
        Assert.False(scene.Row("V2").AllDone);
        Assert.False(scene.Row("V3").AllDone);
    }

    // ---- AC-3305.9 ended -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3305.9 ended 줄은 { k, endedAt, paid }뿐이고 [치료 종료]로 뺀 줄은 paid: false다")]
    public void EndedShape()
    {
        var scene = new Scene().Add(Visit("V1", "QA", "0900", null, "지난 증상", Order("SONO1", "09:10")));
        scene.With("V1", new VisitMark(away: "09:30", endedAt: "10:00"));

        var ended = scene.Json().GetProperty("arrange").GetProperty("ended")[0];

        Assert.Equal(new[] { "k", "endedAt", "paid" }, ended.EnumerateObject().Select(p => p.Name));
        Assert.Equal(scene.Key("V1"), ended.GetProperty("k").GetString());
        Assert.Equal("10:00", ended.GetProperty("endedAt").GetString());
        Assert.False(ended.GetProperty("paid").GetBoolean());
    }
}
