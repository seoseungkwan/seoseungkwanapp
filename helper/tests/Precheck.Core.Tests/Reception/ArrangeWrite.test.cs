using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeWriting 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeWriting;

/// <summary>
/// 어레인지 쓰기 계산(ArrangeWrite, spec reception-arrange design.md 8절, REQ-3306).
/// AC-3306.1 몸 모양({k, op, col?, v?}, 바른 UTF-8 JSON, 칸은 이것뿐, 같은 칸 두 번 없음).
/// AC-3306.2 op마다 받는 칸·글, 맞지 않으면 400. AC-3306.3 시각은 서버 시계, 앞 단계로 돌아가면 뒤 단계 시각을 지움(ready는 readyAt 남김).
/// AC-3306.4 X-RAY의 완료·되돌리기는 X-ray 완료 표시로. AC-3306.5 처방도 표시도 없는 칸의 step·set·part는 404.
/// </summary>
public class ArrangeWriteTests
{
    private const string Now = "10:30";

    private static ArrangeOp Op(string op, ArrangeCol? col = null, string? v = null) => new ArrangeOp("0123456789abcdef", op, col, v);

    private static ArrangeCell Cell(ArrangeStep st, bool manual = false, string det = "", string? part = null, string? at = "09:30") =>
        new ArrangeCell(st, det, part, at, null, manual);

    private static IReadOnlyDictionary<ArrangeCol, ArrangeCell> Cells(params (ArrangeCol Col, ArrangeCell Cell)[] cells) =>
        cells.ToDictionary(c => c.Col, c => c.Cell);

    private static readonly IReadOnlyDictionary<ArrangeCol, ArrangeCell> NoCells = Cells();

    private static CellMark? CellOf(ArrangeWriteResult result, ArrangeCol col) =>
        result.Next != null && result.Next.Cells.TryGetValue(col, out var cell) ? cell : null;

    private static bool Parse(string json, out ArrangeOp op) => ArrangeWrite.TryParse(Encoding.UTF8.GetBytes(json), out op);

    // ---- AC-3306.1 몸 모양 ---------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3306.1 몸은 {k, op, col?, v?} 글 칸뿐인 JSON이고 칸 이름·op 이름은 정해 둔 것만 받는다")]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"step\",\"col\":\"sono\"}", "step", "sono", null)]
    [InlineData("{\"op\":\"part\",\"v\":\"오른 무릎\",\"col\":\"carm\",\"k\":\"0123456789abcdef\"}", "part", "carm", "오른 무릎")]
    [InlineData("{\"k\":\"0123456789abcdef\",\"op\":\"away\",\"v\":\"on\"}", "away", null, "on")]
    public void ParsesGoodBodies(string json, string op, string? col, string? v)
    {
        Assert.True(Parse(json, out var parsed));
        Assert.Equal("0123456789abcdef", parsed.Key);
        Assert.Equal(op, parsed.Op);
        Assert.Equal(col, parsed.Col == null ? null : ArrangeMap.KeyOf(parsed.Col.Value));
        Assert.Equal(v, parsed.V);
    }

    [Theory(DisplayName = "AC-3306.1 모양이 틀린 몸(JSON 아님·배열·다른 칸·같은 칸 두 번·글 아닌 값·모르는 op·모르는 칸·k나 op 없음)은 받지 않는다")]
    [InlineData("not json")]
    [InlineData("[1]")]
    [InlineData("{\"k\":\"a\",\"op\":\"step\",\"col\":\"sono\",\"x\":\"1\"}")]
    [InlineData("{\"k\":\"a\",\"op\":\"step\",\"op\":\"set\",\"col\":\"sono\"}")]
    [InlineData("{\"k\":\"a\",\"op\":\"away\",\"v\":true}")]
    [InlineData("{\"k\":1,\"op\":\"away\",\"v\":\"on\"}")]
    [InlineData("{\"k\":\"a\",\"op\":\"jump\",\"col\":\"sono\"}")]
    [InlineData("{\"k\":\"a\",\"op\":\"step\",\"col\":\"bed\"}")]
    [InlineData("{\"op\":\"step\",\"col\":\"sono\"}")]
    [InlineData("{\"k\":\"a\",\"col\":\"sono\"}")]
    [InlineData("{\"k\":\"a\",\"op\":\"step\",\"col\":{\"x\":1}}")]
    public void RefusesBadBodies(string json)
    {
        Assert.False(Parse(json, out _));
    }

    [Fact(DisplayName = "AC-3306.1 바르지 않은 UTF-8 몸은 받지 않는다")]
    public void RefusesBadUtf8()
    {
        var body = Encoding.UTF8.GetBytes("{\"k\":\"a\",\"op\":\"away\",\"v\":\"on\"}").Concat(new byte[] { 0xC3 }).ToArray();
        Assert.False(ArrangeWrite.TryParse(body, out _));
        Assert.False(ArrangeWrite.TryParse(new byte[] { 0x7B, 0xFF, 0x7D }, out _));
    }

    // ---- AC-3306.2 op마다 ----------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3306.2 칸이 필요한 op에 col이 없거나, 칸을 받지 않는 op에 col이 있거나, v가 필요한데 없거나 받지 않는데 있으면 400")]
    [InlineData("step", null, null)]
    [InlineData("step", ArrangeCol.Sono, "ready")]
    [InlineData("set", ArrangeCol.Sono, null)]
    [InlineData("add", null, "HP")]
    [InlineData("remove", ArrangeCol.Pt, "HP")]
    [InlineData("away", ArrangeCol.Sono, "on")]
    [InlineData("away", null, null)]
    [InlineData("end", null, "maybe")]
    [InlineData("ptf", null, "left")]
    public void WrongShape(string op, ArrangeCol? col, string? v)
    {
        Assert.Equal(400, ArrangeWrite.Apply(Op(op, col, v), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo)), (ArrangeCol.Pt, Cell(ArrangeStep.Todo, true, "HP"))), Now).Status);
    }

    [Fact(DisplayName = "AC-3306.2 step: SONO·C-ARM은 todo → ready → done, 다른 칸은 todo → done, done에서 step은 400")]
    public void Steps()
    {
        var sonoTodo = ArrangeWrite.Apply(Op("step", ArrangeCol.Sono), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal(204, sonoTodo.Status);
        Assert.Equal((ArrangeStep.Ready, "10:30", (string?)null), (CellOf(sonoTodo, ArrangeCol.Sono)!.St, CellOf(sonoTodo, ArrangeCol.Sono)!.ReadyAt, CellOf(sonoTodo, ArrangeCol.Sono)!.DoneAt));

        var current = new VisitMark().WithCell(ArrangeCol.Sono, new CellMark(ArrangeStep.Ready, false, "", "목", "10:05", null, null));
        var sonoReady = ArrangeWrite.Apply(Op("step", ArrangeCol.Sono), current, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Ready, part: "목"))), Now);
        var done = CellOf(sonoReady, ArrangeCol.Sono)!;
        Assert.Equal((ArrangeStep.Done, "10:05", "10:30", "목"), (done.St, done.ReadyAt, done.DoneAt, done.Part));

        var ptMark = new VisitMark().WithCell(ArrangeCol.Pt, new CellMark(ArrangeStep.Todo, true, "ICE", null, null, null, "09:50"));
        var pt = ArrangeWrite.Apply(Op("step", ArrangeCol.Pt), ptMark, Cells((ArrangeCol.Pt, Cell(ArrangeStep.Todo, true, "ICE"))), Now);
        Assert.Equal((ArrangeStep.Done, "ICE", "10:30", "09:50", true), (CellOf(pt, ArrangeCol.Pt)!.St, CellOf(pt, ArrangeCol.Pt)!.Det, CellOf(pt, ArrangeCol.Pt)!.DoneAt, CellOf(pt, ArrangeCol.Pt)!.AddedAt, CellOf(pt, ArrangeCol.Pt)!.Manual));

        Assert.Equal(400, ArrangeWrite.Apply(Op("step", ArrangeCol.Sono), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Done))), Now).Status);
    }

    [Fact(DisplayName = "AC-3306.2 set: v는 todo·ready·done이고 ready는 SONO·C-ARM만(PT를 ready로는 400), 앞으로·뒤로 모두 된다")]
    public void Sets()
    {
        Assert.Equal(400, ArrangeWrite.Apply(Op("set", ArrangeCol.Pt, "ready"), null, Cells((ArrangeCol.Pt, Cell(ArrangeStep.Todo, true, "HP"))), Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("set", ArrangeCol.Sono, "gone"), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now).Status);
        var forward = ArrangeWrite.Apply(Op("set", ArrangeCol.Carm, "done"), null, Cells((ArrangeCol.Carm, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal((ArrangeStep.Done, "10:30"), (CellOf(forward, ArrangeCol.Carm)!.St, CellOf(forward, ArrangeCol.Carm)!.DoneAt));
    }

    [Fact(DisplayName = "AC-3306.2 add: 빈 칸에만 그 칸 목록의 글로 넣고(직접 넣음·넣은 시각), SONO·C-ARM은 고르기 목록(부위는 나중에 없음, spec reception-pick-lists AC-3502.3), X-RAY는 X-ray 찍기")]
    public void Adds()
    {
        var pt = ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "HP"), null, NoCells, Now);
        Assert.Equal((ArrangeStep.Todo, true, "HP", (string?)null, "10:30"), (CellOf(pt, ArrangeCol.Pt)!.St, CellOf(pt, ArrangeCol.Pt)!.Manual, CellOf(pt, ArrangeCol.Pt)!.Det, CellOf(pt, ArrangeCol.Pt)!.Part, CellOf(pt, ArrangeCol.Pt)!.AddedAt));

        var sono = ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "왼 어깨"), null, NoCells, Now);
        Assert.Equal(("", "왼 어깨"), (CellOf(sono, ArrangeCol.Sono)!.Det, CellOf(sono, ArrangeCol.Sono)!.Part));
        Assert.Equal("허리", CellOf(ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "허리"), null, NoCells, Now), ArrangeCol.Carm)!.Part);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Carm, "부위는 나중에"), null, NoCells, Now).Status);
        var xray = ArrangeWrite.Apply(Op("add", ArrangeCol.Xray, "X-ray 찍기"), null, NoCells, Now);
        Assert.Equal(("", true), (CellOf(xray, ArrangeCol.Xray)!.Det, CellOf(xray, ArrangeCol.Xray)!.Manual));

        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "도수"), null, NoCells, Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Ds, "HP"), null, NoCells, Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Sono, "목"), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now).Status);
    }

    [Fact(DisplayName = "AC-3306.2 remove: 직접 넣은 칸만 표시를 지우고, 처방에서 온 칸은 400")]
    public void Removes()
    {
        var current = new VisitMark(away: "10:00").WithCell(ArrangeCol.Ds, new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:40"));
        var removed = ArrangeWrite.Apply(Op("remove", ArrangeCol.Ds), current, Cells((ArrangeCol.Ds, Cell(ArrangeStep.Todo, true, "30분"))), Now);
        Assert.Equal(204, removed.Status);
        Assert.True(removed.ChangesMarks);
        Assert.Null(CellOf(removed, ArrangeCol.Ds));
        Assert.Equal("10:00", removed.Next!.Away);

        Assert.Equal(400, ArrangeWrite.Apply(Op("remove", ArrangeCol.Sono), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now).Status);
    }

    [Fact(DisplayName = "AC-3306.2 part: SONO·C-ARM에만 고르기 목록 글을 넣고(다른 칸·목록 밖·부위는 나중에는 400, spec reception-pick-lists AC-3502.3)")]
    public void Parts()
    {
        var part = ArrangeWrite.Apply(Op("part", ArrangeCol.Sono, "발목"), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo, at: "09:31"))), Now);
        Assert.Equal(("발목", ArrangeStep.Todo), (CellOf(part, ArrangeCol.Sono)!.Part, CellOf(part, ArrangeCol.Sono)!.St));

        Assert.Equal(400, ArrangeWrite.Apply(Op("part", ArrangeCol.Pt, "목"), null, Cells((ArrangeCol.Pt, Cell(ArrangeStep.Todo, true, "HP"))), Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("part", ArrangeCol.Sono, "꼬리뼈"), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("part", ArrangeCol.Sono, "부위는 나중에"), null, Cells((ArrangeCol.Sono, Cell(ArrangeStep.Todo))), Now).Status);
    }

    [Fact(DisplayName = "AC-3306.2 away·ptf·end: on·up·down은 서버 시각을 남기고 off는 지운다")]
    public void RowMarks()
    {
        Assert.Equal("10:30", ArrangeWrite.Apply(Op("away", v: "on"), null, NoCells, Now).Next!.Away);
        Assert.Null(ArrangeWrite.Apply(Op("away", v: "off"), new VisitMark(away: "10:00"), NoCells, Now).Next);
        var up = ArrangeWrite.Apply(Op("ptf", v: "up"), null, NoCells, Now).Next!.Ptf!;
        Assert.Equal(("up", "10:30"), (up.St, up.At));
        Assert.Equal("down", ArrangeWrite.Apply(Op("ptf", v: "down"), new VisitMark(ptf: new PtFirst("up", "10:00")), NoCells, Now).Next!.Ptf!.St);
        Assert.Null(ArrangeWrite.Apply(Op("ptf", v: "off"), new VisitMark(ptf: new PtFirst("down", "10:00"), away: "10:01"), NoCells, Now).Next!.Ptf);
        Assert.Equal("10:30", ArrangeWrite.Apply(Op("end", v: "on"), null, NoCells, Now).Next!.EndedAt);
        Assert.Null(ArrangeWrite.Apply(Op("end", v: "off"), new VisitMark(endedAt: "10:00", away: "09:00"), NoCells, Now).Next!.EndedAt);
    }

    // ---- AC-3306.3 시각 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3306.3 set으로 앞 단계로 돌아가면 뒤 단계 시각을 지우고, ready로 돌아가면 readyAt은 남긴다")]
    public void BackwardTimes()
    {
        var done = new VisitMark().WithCell(ArrangeCol.Carm, new CellMark(ArrangeStep.Done, false, "", "허리", "10:05", "10:20", null));
        var cells = Cells((ArrangeCol.Carm, Cell(ArrangeStep.Done, part: "허리")));

        var toReady = CellOf(ArrangeWrite.Apply(Op("set", ArrangeCol.Carm, "ready"), done, cells, Now), ArrangeCol.Carm)!;
        Assert.Equal((ArrangeStep.Ready, "10:05", (string?)null, "허리"), (toReady.St, toReady.ReadyAt, toReady.DoneAt, toReady.Part));

        var toTodo = CellOf(ArrangeWrite.Apply(Op("set", ArrangeCol.Carm, "todo"), done, cells, Now), ArrangeCol.Carm)!;
        Assert.Equal((ArrangeStep.Todo, (string?)null, (string?)null), (toTodo.St, toTodo.ReadyAt, toTodo.DoneAt));
    }

    // ---- AC-3306.4 X-RAY ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3306.4 X-RAY의 완료(step·set done)는 X-ray 완료 표시 켜기, 되돌리기(set todo)는 끄기이고 어레인지 표시는 바꾸지 않는다")]
    public void XrayUsesXrayMarks()
    {
        var step = ArrangeWrite.Apply(Op("step", ArrangeCol.Xray), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal((204, true, false), (step.Status, step.Xray, step.ChangesMarks));
        var set = ArrangeWrite.Apply(Op("set", ArrangeCol.Xray, "done"), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), Now);
        Assert.Equal(true, set.Xray);
        var undo = ArrangeWrite.Apply(Op("set", ArrangeCol.Xray, "todo"), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Done))), Now);
        Assert.Equal((204, false, false), (undo.Status, undo.Xray, undo.ChangesMarks));
        Assert.Equal(400, ArrangeWrite.Apply(Op("set", ArrangeCol.Xray, "ready"), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Todo))), Now).Status);

        var removed = ArrangeWrite.Apply(Op("remove", ArrangeCol.Xray), null, Cells((ArrangeCol.Xray, Cell(ArrangeStep.Done, manual: true))), Now);
        Assert.Equal((204, false), (removed.Status, removed.Xray));
    }

    // ---- AC-3306.5 없는 칸 ------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3306.5 처방도 표시도 없는 칸에 step·set·part를 받으면 404")]
    [InlineData("step", null)]
    [InlineData("set", "done")]
    [InlineData("part", "목")]
    public void MissingCell(string op, string? v)
    {
        Assert.Equal(404, ArrangeWrite.Apply(Op(op, ArrangeCol.Sono, v), null, NoCells, Now).Status);
    }
}
