using System;
using System.Linq;
using System.Reflection;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeOrders 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeOrders;

/// <summary>
/// 오늘 처방 시각 읽기(spec reception-arrange design.md 5절, REQ-3303, TASK-5).
/// AC-3303.2 지도의 PartColumn이 null이면 부위 문장은 돌지 않고 모든 부위는 null이다.
/// AC-3303.3 읽은 처방 시각은 VisitRow.Orders(코드·"HH:MM"·부위)로 실리고, 시간 제한은 다른 문장과 같은 8초, 실패하면 판 읽기 전체가 실패한다.
/// 가짜 DB·가짜 자료만 쓴다(내원번호 V+숫자, OdrDtm 원값 yyyyMMddHHmm…).
/// </summary>
public class BoardOrdersTests
{
    private static readonly DateTime Morning = BoardFake.Morning;

    private static FakeDb WithOrders(params object?[][] rows)
    {
        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.TodayOrderTimes, _ => rows);
        return db;
    }

    private static (string Code, string? At, string? Part)[] Orders(BoardInput input, string visit) =>
        input.Visits.Single(v => v.VisitId == visit).Orders.Select(o => (o.Code, o.At, o.Part)).ToArray();

    [Fact(DisplayName = "AC-3303.3 처방 시각 줄(VisitId, RxCode, FirstAt 원값)은 내원마다 VisitRow.Orders(코드·처방 시각 HH:MM·부위)로 실리고 시각·코드 순이다")]
    public void OrdersOnRows()
    {
        var db = WithOrders(
            new object?[] { "V1001", "SONO1", "202611050932" },
            new object?[] { "V1001", " carm1 ", "20261105091512" },
            new object?[] { "V1001", "ESWT7", "202611050932" },
            new object?[] { "V1003", "XR2", "202611051020" });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(new (string, string?, string?)[] { ("CARM1", "09:15", null), ("ESWT7", "09:32", null), ("SONO1", "09:32", null) }, Orders(input, "V1001"));
        Assert.Empty(Orders(input, "V1002"));
        Assert.Equal(new (string, string?, string?)[] { ("XR2", "10:20", null) }, Orders(input, "V1003"));
    }

    [Fact(DisplayName = "AC-3303.3 모르는 내원·빈 코드 줄은 버리고, 같은 내원·코드는 한 줄, 시각 모양이 틀리면(숫자 12자리 아님·시:분 밖) 시각만 null")]
    public void OddRows()
    {
        var db = WithOrders(
            new object?[] { "V7777", "SONO1", "202611050932" },
            new object?[] { "V1001", "  ", "202611050932" },
            new object?[] { "V1001", "SONO1", "202611050932" },
            new object?[] { "V1001", "SONO1", "202611050940" },
            new object?[] { "V1002", "CARM1", "2026-11-05" },
            new object?[] { "V1002", "XR2", "202611052561" },
            new object?[] { "V1003", "XR2", null });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(new (string, string?, string?)[] { ("SONO1", "09:32", null) }, Orders(input, "V1001"));
        Assert.Equal(new (string, string?, string?)[] { ("CARM1", null, null), ("XR2", null, null) }, Orders(input, "V1002"));
        Assert.Equal(new (string, string?, string?)[] { ("XR2", null, null) }, Orders(input, "V1003"));
    }

    [Fact(DisplayName = "AC-3303.3 처방 시각 문장은 오늘 처방(TodayRx) 바로 뒤에 그날 @from·@to·등록 범위로 돌고, 시간 제한은 다른 문장과 같은 8초 예산이다")]
    public void StatementOrderAndBudget()
    {
        var clock = new CacheClock(Morning);
        var db = WithOrders();

        BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now);

        var sqls = db.Sqls.ToList();
        Assert.Equal(sqls.IndexOf(ReceptionSql.TodayRx) + 1, sqls.IndexOf(ReceptionSql.TodayOrderTimes));
        var call = db.Calls.Single(c => c.Sql == ReceptionSql.TodayOrderTimes);
        Assert.Equal(new[] { "@from", "@hospital", "@to" }, call.Args.Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal("202611050000", call.Args["@from"]);
        Assert.Equal("202611060000", call.Args["@to"]);
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(TimeSpan.FromSeconds(8), call.Timeout);

        var slow = WithOrders();
        BoardFake.Slow(slow, ReceptionSql.TodayRx, clock, TimeSpan.FromSeconds(3));
        slow.Answer(ReceptionSql.TodayOrderTimes, _ => new object?[0][]);
        BoardReader.Read(slow, Synthetic.Scope, clock.Now(), clock.Now);
        Assert.Equal(TimeSpan.FromSeconds(5), slow.Calls.Single(c => c.Sql == ReceptionSql.TodayOrderTimes).Timeout);
    }

    [Fact(DisplayName = "AC-3303.3 처방 시각 문장이 실패하거나 8초 예산이 다 가면 판 읽기 전체가 실패한다(일부만 주지 않음), 칸이 모자란 줄도 E-BIT-READ-FAILED")]
    public void FailureFailsWholeRead()
    {
        var failing = WithOrders().Fail(ReceptionSql.TodayOrderTimes, BitErrors.ReadFailed);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(failing, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);

        var shortRow = WithOrders(new object?[] { "V1001", "SONO1" });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(shortRow, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);

        var clock = new CacheClock(Morning);
        var spent = WithOrders();
        BoardFake.Slow(spent, ReceptionSql.TodayRx, clock, TimeSpan.FromSeconds(8));
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(spent, Synthetic.Scope, Morning, clock.Now)).Code);
        Assert.DoesNotContain(ReceptionSql.TodayOrderTimes, spent.Sqls);
    }

    [Fact(DisplayName = "AC-3303.2 지도의 PartColumn이 null이면 부위 문장(TodayOrderParts)은 없고 돌지 않으며 모든 부위는 null이다")]
    public void NoPartsWhileUnknown()
    {
        Assert.Null(ArrangeMap.PartColumn);
        Assert.Null(typeof(ReceptionSql).GetField("TodayOrderParts", BindingFlags.Public | BindingFlags.Static));
        var db = WithOrders(new object?[] { "V1001", "SONO1", "202611050932" }, new object?[] { "V1002", "CARM1", "202611050933" });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.All(db.Sqls, sql => Assert.True(ReceptionSql.Parameters.ContainsKey(sql)));
        Assert.Equal(new[] { ReceptionSql.RxNames, ReceptionSql.TodayVisits, ReceptionSql.TodayRx, ReceptionSql.TodayOrderTimes }, db.Sqls.Take(4));
        Assert.All(input.Visits.SelectMany(v => v.Orders), order => Assert.Null(order.Part));
    }

    [Fact(DisplayName = "AC-3303.3 VisitRow를 처방 시각 없이 만들면(지금 호출 그대로) Orders는 빈 목록이고, OrderItem은 코드가 비면 만들지 않는다")]
    public void OptionalOrders()
    {
        Assert.Empty(new VisitRow("V1", "900001", "202611050900", "WN", "N").Orders);
        var row = new VisitRow("V1", "900001", "202611050900", "WN", "N", orders: new[] { new OrderItem("SONO1", "09:00", null) });
        Assert.Equal("SONO1", Assert.Single(row.Orders).Code);
        Assert.ThrowsAny<ArgumentException>(() => new OrderItem("", "09:00", null));
    }
}
