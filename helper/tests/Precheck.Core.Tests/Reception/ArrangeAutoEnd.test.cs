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

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeAutoEnd 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeAutoEnd;

/// <summary>
/// 수납완료 줄 저절로 빼기(spec reception-arrange design.md 10-2, 2026-11-10 사용자 고침, AC-3304.5·AC-3305.10·AC-3306.7).
/// 가짜 상태 표(QA 진료대기·QC 수납대기·QD 끝남)·우리 의원 처음 값 칸(ArrangeLayout.Ours, SONO1 → sono)·가짜 내원(V+숫자)·가짜 암호화(XorProtector)·임시 폴더만 쓴다.
/// </summary>
public class ArrangeAutoEndTests : IDisposable
{
    private const string Day = "20261110";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 10, 11, 0, 0);

    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal)
    {
        ["QA"] = Lane.Wait, ["QC"] = Lane.Pay, ["QD"] = Lane.Done,
    };

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-autoend-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();
    private readonly VisitKeys keys = new VisitKeys();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private static VisitRow Visit(string id, string status, string hhmm, string? paidAt = null, params OrderItem[] orders) =>
        new VisitRow(id, "9000" + id.Substring(1), Day + hhmm + "00", status, "N", paidAt: paidAt, orders: orders);

    private Arrange Build(IEnumerable<VisitRow> visits, IReadOnlyDictionary<string, VisitMark>? marks = null) =>
        ArrangeBuilder.Build(
            new BoardInput(Day, ReadAt, visits.ToArray(), new Dictionary<string, string>()), Statuses, new string[0], ArrangeLayout.Ours,
            marks ?? new Dictionary<string, VisitMark>(), new Dictionary<string, string>(), keys);

    private string Key(string visit) => keys.KeyOf(Day, visit);

    private ArrangeMarks Open() =>
        new ArrangeMarks(new StoreFolder(folder), protector, () => ReadAt, code => reports.Add(code));

    private static ArrangeOp Op(string op, string v) => new ArrangeOp("0123456789abcdef", op, null, v);

    private static readonly IReadOnlyDictionary<string, ArrangeCell> NoCells = new Dictionary<string, ArrangeCell>();

    // ---- AC-3305.10 수납완료 줄은 저절로 ended ---------------------------------------------------------

    [Fact(DisplayName = "AC-3305.10 수납완료 줄은 남은 칸이 있어도 rows가 아니라 ended에 { 수납 시각, paid: true }로 가고, kept인 줄·수납대기 줄은 rows에 남는다")]
    public void PaidRowsLeave()
    {
        var visits = new[]
        {
            Visit("V1", "QD", "0900", "202611101052", new OrderItem("SONO1", "09:10", null)),
            Visit("V2", "QC", "0905", null, new OrderItem("SONO1", "09:20", null)),
            Visit("V3", "QD", "0910", "202611101015"),
        };
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal) { ["V3"] = new VisitMark(kept: true) };

        var arrange = Build(visits, marks);

        Assert.Equal(new[] { Key("V2"), Key("V3") }, arrange.Rows.Select(r => r.Key));
        var ended = Assert.Single(arrange.Ended);
        Assert.Equal((Key("V1"), "10:52", true), (ended.Key, ended.EndedAt, ended.Paid));
    }

    [Fact(DisplayName = "AC-3305.10 [치료 종료]로 뺀 줄은 수납완료여도 paid: false·누른 시각이고, ended는 시각 늦은 순·수납 시각을 모르는 줄(null)은 맨 뒤다")]
    public void EndedOrderWithPaid()
    {
        var visits = new[]
        {
            Visit("V1", "QD", "0900", "202611101052"),
            Visit("V2", "QD", "0905", null),
            Visit("V3", "QD", "0910", "202611101015"),
            Visit("V4", "QA", "0915"),
        };
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
        {
            ["V3"] = new VisitMark(endedAt: "10:30"),
            ["V4"] = new VisitMark(endedAt: "11:00"),
        };

        var arrange = Build(visits, marks);

        Assert.Empty(arrange.Rows);
        Assert.Equal(
            new (string, string?, bool)[] { (Key("V4"), "11:00", false), (Key("V1"), "10:52", true), (Key("V3"), "10:30", false), (Key("V2"), null, true) },
            arrange.Ended.Select(e => (e.Key, e.EndedAt, e.Paid)));
    }

    [Fact(DisplayName = "AC-3305.10 저절로 빠진 줄의 SONO 칸은 순서를 받지 않는다")]
    public void PaidRowsTakeNoOrder()
    {
        var visits = new[]
        {
            Visit("V1", "QD", "0900", "202611101052", new OrderItem("SONO1", "09:10", null)),
            Visit("V2", "QA", "0905", null, new OrderItem("SONO1", "09:20", null)),
        };

        var row = Assert.Single(Build(visits).Rows);

        Assert.Equal(Key("V2"), row.Key);
        Assert.Equal(1, row.Cells[ArrangeKeys.Sono].Ord);
    }

    [Fact(DisplayName = "AC-3305.10 판 JSON의 ended 줄은 { k, endedAt, paid }이고 수납 시각을 모르면 endedAt이 null이다")]
    public void PaidEndedJson()
    {
        var visits = new[] { Visit("V1", "QD", "0900", "202611101052"), Visit("V2", "QD", "0905", null) };
        var input = new BoardInput(Day, ReadAt, visits, new Dictionary<string, string>());
        var board = BoardBuilder.Build(input, Statuses, new string[0], new Dictionary<string, string>(), keys, ReadAt);

        using var document = JsonDocument.Parse(board.ToJson(Build(visits)));
        var ended = document.RootElement.GetProperty("arrange").GetProperty("ended").EnumerateArray().ToArray();

        Assert.Equal(2, ended.Length);
        Assert.Equal(new[] { "k", "endedAt", "paid" }, ended[0].EnumerateObject().Select(p => p.Name));
        Assert.Equal("10:52", ended[0].GetProperty("endedAt").GetString());
        Assert.True(ended[0].GetProperty("paid").GetBoolean());
        Assert.Equal(JsonValueKind.Null, ended[1].GetProperty("endedAt").ValueKind);
        Assert.True(ended[1].GetProperty("paid").GetBoolean());
    }

    // ---- AC-3304.5 kept 저장 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3304.5 kept만 있는 표시도 빈 표시가 아니고, 파일에 kept: true로 남아 다시 열어도 그대로다. 다른 표시 바꾸기는 kept를 지킨다")]
    public void KeptIsStored()
    {
        var kept = new VisitMark(kept: true);
        Assert.False(kept.IsEmpty);
        Assert.True(kept.WithAway("10:00").WithEnded("10:10").WithPtf(null).WithCell(ArrangeKeys.Pt, null).Kept);

        Open().Update("V1", _ => kept);

        using (var document = JsonDocument.Parse(protector.LastPlain!))
        {
            var visit = document.RootElement.GetProperty("visits").GetProperty("V1");
            Assert.True(visit.GetProperty("kept").GetBoolean());
        }
        Assert.True(Open().Today()["V1"].Kept);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3304.5 kept가 거짓인 표시는 파일에 kept 칸이 없고(이 고침 전 모양 그대로) 다시 열면 kept 거짓이다")]
    public void NotKeptLeavesNoField()
    {
        Open().Update("V1", _ => new VisitMark(away: "10:00"));

        using (var document = JsonDocument.Parse(protector.LastPlain!))
        {
            var visit = document.RootElement.GetProperty("visits").GetProperty("V1");
            Assert.Equal(new[] { "cells", "away", "ptf", "endedAt" }, visit.EnumerateObject().Select(p => p.Name));
        }
        var mark = Open().Today()["V1"];
        Assert.False(mark.Kept);
        Assert.Equal("10:00", mark.Away);
        Assert.Empty(reports);
    }

    [Theory(DisplayName = "AC-3304.5 kept가 true가 아닌 값이면 모양이 틀린 파일이라 빈 표시, 기록에 E-STORE-BROKEN만")]
    [InlineData("false")]
    [InlineData("\"yes\"")]
    [InlineData("null")]
    public void KeptMustBeTrue(string value)
    {
        Open().Update("V1", _ => new VisitMark(away: "10:00"));
        var path = Path.Combine(folder, ArrangeMarks.FileName);
        var data = File.ReadAllBytes(path);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        var json = "{\"day\":\"" + Day + "\",\"visits\":{\"V1\":{\"cells\":{},\"away\":\"10:00\",\"ptf\":null,\"endedAt\":null,\"kept\":" + value + "}}}";
        File.WriteAllBytes(path, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }

    // ---- AC-3306.7 end off는 수납완료 줄이면 kept --------------------------------------------------------

    [Fact(DisplayName = "AC-3306.7 end off는 수납완료 줄이면 endedAt을 지우고 kept를 남기고, 아니면 endedAt만 지운다. end on은 endedAt만 쓰고 kept를 지킨다")]
    public void EndOffKeepsPaidRow()
    {
        var paidOff = ArrangeWrite.Apply(Op("end", "off"), new VisitMark(endedAt: "10:00"), NoCells, "10:30", paid: true);
        Assert.Equal(204, paidOff.Status);
        Assert.NotNull(paidOff.Next);
        Assert.Null(paidOff.Next!.EndedAt);
        Assert.True(paidOff.Next.Kept);

        var autoOff = ArrangeWrite.Apply(Op("end", "off"), null, NoCells, "10:30", paid: true);
        Assert.True(autoOff.Next!.Kept);

        var plainOff = ArrangeWrite.Apply(Op("end", "off"), new VisitMark(away: "09:50", endedAt: "10:00"), NoCells, "10:30");
        Assert.Null(plainOff.Next!.EndedAt);
        Assert.False(plainOff.Next.Kept);

        var on = ArrangeWrite.Apply(Op("end", "on"), new VisitMark(kept: true), NoCells, "10:30", paid: true);
        Assert.Equal("10:30", on.Next!.EndedAt);
        Assert.True(on.Next.Kept);
    }

    [Fact(DisplayName = "AC-3306.7 라우터: 저절로 빠진 수납완료 줄에도 칸 쓰기가 표에 있는 줄처럼 돌고, [다시 넣기]하면 kept로 표에 남으며, 수납 전 줄의 다시 넣기는 kept가 아니다")]
    public void RouterKeepsPaidRow()
    {
        var statuses = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["S1"] = Lane.Wait, ["S2"] = Lane.Done };
        using var rig = new ArrangeRig(statuses: statuses);
        var paid = rig.Key("V1002");

        var board = rig.Board().GetProperty("arrange");
        Assert.DoesNotContain(board.GetProperty("rows").EnumerateArray(), r => r.GetProperty("k").GetString() == paid);
        var ended = Assert.Single(board.GetProperty("ended").EnumerateArray());
        Assert.Equal(paid, ended.GetProperty("k").GetString());
        Assert.Equal("09:45", ended.GetProperty("endedAt").GetString());
        Assert.True(ended.GetProperty("paid").GetBoolean());

        // 빠진 줄도 칸 계산이 같다: 직접 칸 넣기는 204, 이미 넣은 칸에 다시 넣기는 400(줄을 못 만들면 덮어써 204가 된다),
        // 처방에서 온 X-RAY(G1234 09:40) step은 204·X-ray 완료 표시(줄을 못 만들면 404), 처방도 표시도 없는 SONO step은 404
        Assert.Equal(204, rig.Post(Body(paid, "add", "pt", "HP")).Status);
        Assert.Equal(400, rig.Post(Body(paid, "add", "pt", "ICE")).Status);
        Assert.Equal("HP", rig.ArrangeMarks.Today()["V1002"].Cells[ArrangeKeys.Pt].Det);
        Assert.Equal(204, rig.Post(Body(paid, "step", "xray", null)).Status);
        Assert.True(rig.XrayMarks.Today().ContainsKey("V1002"));
        Assert.Equal(404, rig.Post(Body(paid, "step", "sono", null)).Status);
        Assert.False(rig.ArrangeMarks.Today()["V1002"].Kept);

        Assert.Equal(204, rig.Post(Body(paid, "end", null, "off")).Status);
        Assert.True(rig.ArrangeMarks.Today()["V1002"].Kept);
        Assert.Equal("HP", rig.Row("V1002").GetProperty("cells").GetProperty("pt").GetProperty("det").GetString());
        Assert.Empty(rig.Board().GetProperty("arrange").GetProperty("ended").EnumerateArray());

        Assert.Equal(204, rig.Post(Body(paid, "end", null, "on")).Status);
        var manual = Assert.Single(rig.Board().GetProperty("arrange").GetProperty("ended").EnumerateArray());
        Assert.Equal("10:00", manual.GetProperty("endedAt").GetString());
        Assert.False(manual.GetProperty("paid").GetBoolean());

        var waiting = rig.Key("V1001");
        Assert.Equal(204, rig.Post(Body(waiting, "end", null, "on")).Status);
        Assert.Equal(204, rig.Post(Body(waiting, "end", null, "off")).Status);
        Assert.False(rig.ArrangeMarks.Today().TryGetValue("V1001", out var left) && left.Kept);
    }

    private static byte[] Body(string key, string op, string? col, string? v) => ArrangeRouteTests.Body(key, op, col, v);
}
