using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Erp.Core.Closing;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Revenue;
using Xunit;

namespace Erp.Core.Tests.Closing;

/// <summary>REQ-3603·3604·3605 ClosingDay.Read: 가짜 DB가 문장 글자로 답을 고른다. 진료·금액·코드는 모두 지어낸 것이다.</summary>
public class ClosingDayTests
{
    private static ClosingGroup G(string key, params string[] codes) => ClosingFake.Group(key, codes);

    private static long[] Three(ClosingGroupCount group) => new[] { group.New, group.First90, group.Return };

    private static long[] Three(ClosingAgeBand band) => new[] { band.New, band.First90, band.Return };

    private static ClosingGroupCount GroupOf(ClosingDayResult result, string key) => Assert.Single(result.Groups, group => group.Key == key);

    private static ClosingAgeBand BandOf(ClosingDayResult result, string band) => Assert.Single(result.Ages, row => row.Band == band);

    private static ClosingDayResult Quiet(params ClosingGroup[] groups) => new DayRig().Read(groups);

    // ---- AC-3603.1 args·모양 ----------------------------------------------------------------------

    public static IEnumerable<object?[]> BadGroups()
    {
        yield return new object?[] { new[] { G("carm", "CARM1"), G("carm", "SONO1") } };                        // 같은 key 두 번
        yield return new object?[] { new[] { G("massage", "CARM1") } };                                        // 모르는 key
        yield return new object?[] { new[] { G("Carm", "CARM1") } };                                           // key 대소문자
        yield return new object?[] { new[] { G("sono") } };                                                    // 코드 0개
        yield return new object?[] { new[] { G("sono", Enumerable.Range(0, 21).Select(i => "C" + i).ToArray()) } }; // 코드 21개
        yield return new object?[] { new[] { G("sono", "SONO1", " ") } };                                      // 빈 코드
        yield return new object?[] { new[] { G("sono", new string('S', 21)) } };                               // 21자
        yield return new object?[] { new[] { G("sono", "SO NO") } };                                           // 가운데 공백
        yield return new object?[] { ClosingDay.GroupKeys.Concat(new[] { "carm" }).Select(key => G(key, "X1")).ToArray() }; // 20개
    }

    [Theory(DisplayName = "AC-3603.1 같은 key 두 번·모르는 key·코드 0개·21개·빈 코드·21자 코드·20묶음은 DB에 닿기 전에 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadGroups))]
    public void RefusesBadGroups(ClosingGroup[] groups)
    {
        var db = ClosingFake.Quiet();
        var error = Assert.ThrowsAny<HelperException>(() => ClosingDay.Read(db, Synthetic.Scope, ClosingFake.Day, groups));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-3603.1 묶음 key는 design.md 2절 19개 차례이고, 19개 모두 한 번씩이면 받는다")]
    public void AcceptsAllNineteenKeys()
    {
        Assert.Equal(
            new[]
            {
                "carm", "sono", "arthro", "manual", "eswt", "pt", "etc1", "etc2", "etc3", "etc4",
                "manualConsult", "lipus", "nail", "ct", "surgery", "eswtStd", "eswtRadial", "injection", "ptVisit",
            },
            ClosingDay.GroupKeys);
        var result = Quiet(ClosingDay.GroupKeys.Select(key => G(key, "X1")).ToArray());
        Assert.Equal(ClosingDay.GroupKeys, result.Groups.Select(group => group.Key));
    }

    [Fact(DisplayName = "AC-3603.1 date는 YYYY-MM-DD, groups는 args 차례 그대로(묶음이 없으면 빈 목록)")]
    public void KeepsArgsOrder()
    {
        Assert.Equal(ClosingFake.DayText, Quiet().Date);
        Assert.Empty(Quiet().Groups);
        var result = Quiet(G("ptVisit", "AA222"), G("eswt", "ESWT7"), G("carm", "CARM1"));
        Assert.Equal(new[] { "ptVisit", "eswt", "carm" }, result.Groups.Select(group => group.Key));
    }

    [Fact(DisplayName = "AC-3603.1 코드는 앞뒤 공백을 떼고 대문자로 견준다(args 쪽·비트 쪽 모두)")]
    public void CodesCompareTrimmedUpper()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 40, 1000m, "carm1")
            .Visit("V002", 2, "4", 40, 1000m, " SONO1 ")
            .Visit("V003", 3, "4", 40, 1000m, "도수")
            .Read(G("carm", "CARM1"), G("sono", "sono1"), G("manual", " 도수 "), G("pt", "MM010"));

        Assert.Equal(1, GroupOf(result, "carm").Patients);
        Assert.Equal(1, GroupOf(result, "sono").Patients);
        Assert.Equal(1, GroupOf(result, "manual").Patients);
        Assert.Equal(0, GroupOf(result, "pt").Patients);
    }

    [Fact(DisplayName = "AC-3603.1 9999-12-31은 도우미가 멈추지 않고 E-HELPER-BAD-MESSAGE(다음 날을 셀 수 없다)")]
    public void RefusesLastDate()
    {
        var db = ClosingFake.Quiet();
        var error = Assert.ThrowsAny<HelperException>(() => ClosingDay.Read(db, Synthetic.Scope, DateTime.MaxValue.Date, new ClosingGroup[0]));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-3603.1 문장마다 그날 값: @day·@nextDay = 그날·다음 날, @from·@to = 그날 0시·다음 날 0시, @hospital = 범위, 시간 제한 90초")]
    public void ArgumentsAreThatDay()
    {
        var rig = new DayRig().Visit("V001", 1, "1", 40, 1000m, "KK090");
        rig.Read(G("injection", "KK090"));
        var expected = new Dictionary<string, string>
        {
            ["@day"] = ClosingFake.DayKey,
            ["@nextDay"] = ClosingFake.NextDayKey,
            ["@from"] = ClosingFake.DayKey + "0000",
            ["@to"] = ClosingFake.NextDayKey + "0000",
            ["@hospital"] = Synthetic.Scope,
        };
        foreach (var call in rig.Db.Calls)
        {
            Assert.Equal(TimeSpan.FromSeconds(90), call.Timeout);
            foreach (var arg in call.Args.Where(arg => !arg.Key.StartsWith("@c", StringComparison.Ordinal))) Assert.Equal(expected[arg.Key], arg.Value);
        }
        // HistoryGuard는 revenue.days 안에서 한 번, 주사 묶음이 있어 한 번 더
        Assert.Equal(2, rig.Count(RevenueSql.HistoryGuard));
    }

    // ---- AC-3603.2 환자현황 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.2 진찰구분 1·3·4·0 → 신환·90일초진·재진·진찰료 산정안함, ptVisit 묶음이 없으면 ptVisit null이고 빼지 않으며 합계 = 칸의 합")]
    public void CountsExamKinds()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, 1000m)
            .Visit("V002", 2, "1", 30, 1000m, "AA222")
            .Visit("V003", 3, "3", 30, 1000m)
            .Visit("V004", 4, "4", 30, 1000m, "AA222")
            .Visit("V005", 5, "4", 30, 1000m)
            .Visit("V006", 6, "2", 30, 1000m)
            .Visit("V007", 7, "7", 30, 1000m)
            .Visit("V008", 8, null, 30, 1000m)
            .Visit("V009", 9, "0", 30, 1000m, "AA222")
            .Read();

        var patients = result.Patients;
        Assert.Equal(2, patients.New);
        Assert.Equal(1, patients.First90);
        Assert.Equal(5, patients.Return);
        Assert.Null(patients.PtVisit);
        Assert.Equal(1, patients.NoExamFee);
        Assert.Equal(9, patients.Total);
    }

    [Fact(DisplayName = "AC-3603.2 물리치료내원 코드를 받은 재진·산정안함 환자는 ptVisit으로 옮기고(재진·산정안함에서 뺌), 신환·90일초진은 그대로")]
    public void MovesPtVisitPatients()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, 1000m, "AA222")
            .Visit("V002", 2, "3", 30, 1000m, "aa222")
            .Visit("V003", 3, "4", 30, 1000m, "AA222", "MM010")
            .Visit("V004", 4, "4", 30, 1000m, "MM010")
            .Visit("V005", 5, "0", 30, 1000m, "PTX")
            .Visit("V006", 6, "0", 30, 1000m)
            .Visit("V007", 7, "4", 30, 1000m)
            .Read(G("ptVisit", "AA222", "PTX"));

        var patients = result.Patients;
        Assert.Equal(1, patients.New);
        Assert.Equal(1, patients.First90);
        Assert.Equal(2, patients.PtVisit);
        Assert.Equal(2, patients.Return);
        Assert.Equal(1, patients.NoExamFee);
        Assert.Equal(7, patients.Total);
    }

    [Theory(DisplayName = "AC-3603.2 그날 두 번 온 사람은 1 → 3 → 재진 → 0 차례로 앞선 하나로 센다")]
    [InlineData("4", "1", "new")]
    [InlineData("0", "1", "new")]
    [InlineData("3", "1", "new")]
    [InlineData("4", "3", "first90")]
    [InlineData("0", "3", "first90")]
    [InlineData("0", "4", "return")]
    [InlineData("0", "7", "return")]
    [InlineData("0", "0", "noExamFee")]
    public void TwoVisitsTakeFirstKind(string first, string second, string expected)
    {
        var result = new DayRig()
            .Visit("V001", 7, first, 30, 1000m)
            .Visit("V002", 7, second, 30, 2000m)
            .Read();

        var patients = result.Patients;
        var counts = new Dictionary<string, long>
        {
            ["new"] = patients.New,
            ["first90"] = patients.First90,
            ["return"] = patients.Return,
            ["noExamFee"] = patients.NoExamFee,
        };
        Assert.Equal(1, patients.Total);
        foreach (var pair in counts) Assert.Equal(pair.Key == expected ? 1 : 0, pair.Value);
    }

    // ---- AC-3603.3 묶음 사람 수·3분류 ---------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.3 묶음마다 서로 다른 환자 수와 3분류(재진 = 신환·90일초진이 아닌 모두), 한 사람이 두 묶음에 들면 묶음마다 센다")]
    public void CountsGroupPatients()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, 1000m, "CARM1", "SONO1")
            .Visit("V002", 2, "3", 30, 1000m, "CARM1")
            .Visit("V003", 3, "4", 30, 1000m, "CARM1", "AA222")
            .Visit("V004", 4, "0", 30, 1000m, "SONO1")
            .Visit("V005", 5, "4", 30, 1000m, "MM010")
            .Visit("V006", 5, "4", 30, 1000m, "CARM1")
            .Visit("V007", 6, "1", 30, 1000m, "MM010")
            .Read(G("carm", "CARM1"), G("sono", "SONO1"), G("ptVisit", "AA222"), G("pt", "MM010", "MM015"));

        var carm = GroupOf(result, "carm");
        Assert.Equal(4, carm.Patients);
        Assert.Equal(new long[] { 1, 1, 2 }, Three(carm));
        var sono = GroupOf(result, "sono");
        Assert.Equal(2, sono.Patients);
        Assert.Equal(new long[] { 1, 0, 1 }, Three(sono));
        var pt = GroupOf(result, "pt");
        Assert.Equal(2, pt.Patients);
        Assert.Equal(new long[] { 1, 0, 1 }, Three(pt));
        var ptVisit = GroupOf(result, "ptVisit");
        Assert.Equal(1, ptVisit.Patients);
        Assert.Equal(new long[] { 0, 0, 1 }, Three(ptVisit));
    }

    [Fact(DisplayName = "AC-3603.3 묶음 코드를 받은 환자가 없으면 patients·3분류·total·unpaidVisits가 모두 0이다")]
    public void EmptyGroupIsZero()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, null, "CARM1")
            .Read(G("eswt", "ESWT7", "ESWT10"));

        var eswt = GroupOf(result, "eswt");
        Assert.Equal(0, eswt.Patients);
        Assert.Equal(new long[] { 0, 0, 0 }, Three(eswt));
        Assert.Equal(0, eswt.Total);
        Assert.Equal(0, eswt.UnpaidVisits);
    }

    // ---- AC-3603.4 연령 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.4 ages는 늘 '0'~'90' 10줄이고 9세 '0'·10세 '10'·99세 '90'·100세 '90', 줄마다 3분류")]
    public void CountsAgeBands()
    {
        var empty = Quiet();
        Assert.Equal(new[] { "0", "10", "20", "30", "40", "50", "60", "70", "80", "90" }, empty.Ages.Select(row => row.Band));
        Assert.All(empty.Ages, row => Assert.Equal(new long[] { 0, 0, 0 }, Three(row)));

        var result = new DayRig()
            .Visit("V001", 1, "1", 9, 1000m)
            .Visit("V002", 2, "3", 0, 1000m)
            .Visit("V003", 3, "4", 10, 1000m)
            .Visit("V004", 4, "0", 19, 1000m)
            .Visit("V005", 5, "1", 99, 1000m)
            .Visit("V006", 6, "4", 100, 1000m)
            .Visit("V007", 7, "3", 45, 1000m)
            .Read();

        Assert.Equal(new long[] { 1, 1, 0 }, Three(BandOf(result, "0")));
        Assert.Equal(new long[] { 0, 0, 2 }, Three(BandOf(result, "10")));
        Assert.Equal(new long[] { 0, 1, 0 }, Three(BandOf(result, "40")));
        Assert.Equal(new long[] { 1, 0, 1 }, Three(BandOf(result, "90")));
        Assert.Equal(7, result.Ages.Sum(row => row.New + row.First90 + row.Return));
        Assert.Equal(0, result.Warnings.UnknownAge);
    }

    [Fact(DisplayName = "AC-3603.4 생년월일이 없거나 틀린 환자(만 나이 null)는 연령 표에 넣지 않고 unknownAge에 사람 수로 센다")]
    public void UnknownAgeIsCounted()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", null, 1000m)
            .Visit("V002", 1, "4", null, 1000m)
            .Visit("V003", 2, "4", null, 1000m)
            .Visit("V004", 3, "4", 50, 1000m)
            .Read();

        Assert.Equal(2, result.Warnings.UnknownAge);
        Assert.Equal(1, result.Ages.Sum(row => row.New + row.First90 + row.Return));
        Assert.Equal(new long[] { 0, 0, 1 }, Three(BandOf(result, "50")));
        Assert.Equal(3, result.Patients.Total);
    }

    [Fact(DisplayName = "AC-3603.4 만 나이는 그 사람의 첫 진료 값이다")]
    public void AgeFromFirstVisit()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 39, 1000m)
            .Visit("V002", 1, "4", 40, 1000m)
            .Read();

        Assert.Equal(new long[] { 0, 0, 1 }, Three(BandOf(result, "30")));
        Assert.Equal(new long[] { 0, 0, 0 }, Three(BandOf(result, "40")));
    }

    // ---- AC-3604.1 금액 여덟 칸 ---------------------------------------------------------------------

    private static RevenueDay RevenueOf(FakeDb db) => Assert.Single(RevenueDays.Read(db, Synthetic.Scope, ClosingFake.Day, ClosingFake.Day).Days);

    [Fact(DisplayName = "AC-3604.1 확정된 날: total·insurer·noncovered·receivableIn = revenue.days 그날 값, cash·card·transfer = 정상수납 + 미수입금, received = 셋의 합")]
    public void ConfirmedMoney()
    {
        var revenue = RevenueOf(ClosingFake.Quiet());
        var result = Quiet();
        var money = result.Money;

        Assert.False(revenue.Unconfirmed);
        Assert.False(revenue.SplitUnconfirmed);
        Assert.Equal(revenue.Total, money.Total);
        Assert.Equal(revenue.Insurer, money.Insurer);
        Assert.Equal(revenue.Noncovered, money.Noncovered);
        Assert.Equal(revenue.ReceivableIn, money.ReceivableIn);
        Assert.Equal(1050000L, money.Total);
        Assert.Equal(310000L, money.Insurer);
        Assert.Equal(405000L, money.Noncovered);
        Assert.Equal(24000L, money.ReceivableIn);
        Assert.Equal(207000L, money.Cash);
        Assert.Equal(308000L, money.Card);
        Assert.Equal(109000L, money.Transfer);
        Assert.Equal(624000L, money.Received);
        Assert.False(result.Warnings.MoneyUnconfirmed);
        Assert.False(result.Warnings.SplitUnconfirmed);
    }

    [Fact(DisplayName = "AC-3604.1 원 미만은 칸마다 버린다(현금 = 정상수납 현금 버림 + 미수입금 현금 버림)")]
    public void TruncatesEachField()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, RevenueSql.FinanceNormal, 1000.9m, 300.5m, 400.7m, 200.9m, 300.9m, 100.9m);
        RevenueFake.Row(rig.Db, RevenueSql.FinanceReceivable, 50.9m, 10.9m, 5.9m, 7.9m, 8.9m, 9.9m);
        RevenueFake.Row(rig.Db, RevenueSql.FinanceNormalExtra, 450.4m, 150m);
        RevenueFake.Row(rig.Db, RevenueSql.FinanceReceivableExtra, 15.9m, 4.9m);
        var money = rig.Read().Money;

        Assert.Equal(1051L, money.Total);
        Assert.Equal(311L, money.Insurer);
        Assert.Equal(406L, money.Noncovered);
        Assert.Equal(26L, money.ReceivableIn);
        Assert.Equal(207L, money.Cash);
        Assert.Equal(308L, money.Card);
        Assert.Equal(109L, money.Transfer);
        Assert.Equal(624L, money.Received);
    }

    [Theory(DisplayName = "AC-3604.1 세 검사에 걸린 unconfirmed 날: 여덟 칸 = FinanceNormal·FinanceReceivable을 확정 검사 없이 그대로 더한 값, moneyUnconfirmed true")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void UnconfirmedMoneyIsRawSum(int check)
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, RevenueFake.Checks[check], 1L);
        RevenueFake.Row(rig.Db, RevenueSql.FinanceNormal, 2000000m, 700000m, 600000m, 400000m, 500000m, 60000m);
        RevenueFake.Row(rig.Db, RevenueSql.FinanceReceivable, 30000m, 20000m, 1000m, 3000m, 4000m, 5000m);
        Assert.True(RevenueOf(rig.Db).Unconfirmed);

        var result = rig.Read();
        var money = result.Money;
        Assert.True(result.Warnings.MoneyUnconfirmed);
        Assert.False(result.Warnings.SplitUnconfirmed);
        Assert.Equal(2030000L, money.Total);
        Assert.Equal(720000L, money.Insurer);
        Assert.Equal(601000L, money.Noncovered);
        Assert.Equal(12000L, money.ReceivableIn);
        Assert.Equal(403000L, money.Cash);
        Assert.Equal(504000L, money.Card);
        Assert.Equal(65000L, money.Transfer);
        Assert.Equal(972000L, money.Received);
    }

    [Fact(DisplayName = "AC-3604.1 음수라서 unconfirmed인 날도 그대로 더한 값(음수 포함)과 moneyUnconfirmed true")]
    public void NegativeUnconfirmedIsRawSum()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, RevenueSql.FinanceNormal, 1000000m, 300000m, 400000m, -10000m, 300000m, 100000m);
        Assert.True(RevenueOf(rig.Db).Unconfirmed);

        var result = rig.Read();
        Assert.True(result.Warnings.MoneyUnconfirmed);
        Assert.Equal(-3000L, result.Money.Cash);
        Assert.Equal(1050000L, result.Money.Total);
        Assert.Equal(-3000L + 308000L + 109000L, result.Money.Received);
    }

    [Fact(DisplayName = "AC-3604.1 splitUnconfirmed 날: insurer·noncovered = 그대로 더한 값, 나머지 칸은 revenue.days 값, splitUnconfirmed true")]
    public void SplitUnconfirmedMoney()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, RevenueSql.FinanceNormalExtra, 460000m, 150000m);
        var revenue = RevenueOf(rig.Db);
        Assert.True(revenue.SplitUnconfirmed);
        Assert.Null(revenue.Insurer);

        var result = rig.Read();
        var money = result.Money;
        Assert.True(result.Warnings.SplitUnconfirmed);
        Assert.False(result.Warnings.MoneyUnconfirmed);
        Assert.Equal(310000L, money.Insurer);
        Assert.Equal(405000L, money.Noncovered);
        Assert.Equal(revenue.Total, money.Total);
        Assert.Equal(revenue.ReceivableIn, money.ReceivableIn);
        Assert.Equal(207000L, money.Cash);
        Assert.Equal(624000L, money.Received);
    }

    // ---- AC-3604.2 미수발생·감액·장애인기금·환불 ------------------------------------------------------------

    [Fact(DisplayName = "AC-3604.2 unpaidNew·discount·disabledFund·refund = MoneyExtraSql 네 칸(수납일 @day·@nextDay), 원 미만 버림")]
    public void ExtraMoney()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, ClosingSql.MoneyExtraSql, 622700.9m, 1000m, 17250.5m, 3000m);
        var money = rig.Read().Money;

        Assert.Equal(622700L, money.UnpaidNew);
        Assert.Equal(1000L, money.Discount);
        Assert.Equal(17250L, money.DisabledFund);
        Assert.Equal(3000L, money.Refund);
        var call = Assert.Single(rig.Db.Calls, c => c.Sql == ClosingSql.MoneyExtraSql);
        Assert.Equal(ClosingFake.DayKey, call.Args["@day"]);
        Assert.Equal(ClosingFake.NextDayKey, call.Args["@nextDay"]);
    }

    [Fact(DisplayName = "AC-3604.2 수납 줄이 없으면(NULL) 네 칸은 0이다")]
    public void ExtraMoneyNullIsZero()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, ClosingSql.MoneyExtraSql, null, null, null, null);
        var money = rig.Read().Money;

        Assert.Equal(0L, money.UnpaidNew);
        Assert.Equal(0L, money.Discount);
        Assert.Equal(0L, money.DisabledFund);
        Assert.Equal(0L, money.Refund);
    }

    [Fact(DisplayName = "AC-3604.2 환불 합이 음수면 부호를 뗀 양수로 낸다")]
    public void RefundIsPositive()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, ClosingSql.MoneyExtraSql, 0m, 0m, 0m, -3000.9m);
        Assert.Equal(3000L, rig.Read().Money.Refund);
    }

    [Fact(DisplayName = "AC-3604.2 금액을 확정하지 못하는 날에도 미수발생·감액·장애인기금·환불은 채운다")]
    public void ExtraMoneyOnUnconfirmedDay()
    {
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, RevenueSql.UnsupportedFinance, 2L);
        RevenueFake.Row(rig.Db, ClosingSql.MoneyExtraSql, 500m, 600m, 700m, 800m);
        var result = rig.Read();

        Assert.True(result.Warnings.MoneyUnconfirmed);
        Assert.Equal(500L, result.Money.UnpaidNew);
        Assert.Equal(600L, result.Money.Discount);
        Assert.Equal(700L, result.Money.DisabledFund);
        Assert.Equal(800L, result.Money.Refund);
    }

    // ---- AC-3604.3 치료별 매출 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3604.3 groups[].total = 그날 진료의 묶음 코드 처방 줄 금액 합 — 진찰료·묶음 밖 코드 줄·진료 총진료비는 더하지 않는다")]
    public void GroupTotalIsCodeLineAmounts()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, 987654m)
            .Line("V001", "AA154", 18000m)      // 진찰료
            .Line("V001", "ESWT7", 70000m)
            .Line("V001", "KK090", 20000m)      // 묶음 밖 코드
            .Visit("V002", 2, "4", 30, 54321m)
            .Line("V002", "ESWT7", 70000m)
            .Line("V002", "MM010", 1010m)
            .Line("V002", "MM010", 1010m)
            .Read(G("eswt", "ESWT7", "ESWT10"), G("pt", "MM010"));

        var eswt = GroupOf(result, "eswt");
        Assert.Equal(2L, eswt.Patients);
        Assert.Equal(140000L, eswt.Total);
        var pt = GroupOf(result, "pt");
        Assert.Equal(1L, pt.Patients);
        Assert.Equal(2020L, pt.Total);
    }

    [Fact(DisplayName = "AC-3604.3 한 묶음의 코드 둘은 함께 더하고, 두 묶음에 든 코드 하나는 묶음마다 더한다")]
    public void GroupTotalSharedCodes()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 30, 1000m)
            .Line("V001", "CRYO", 25000m)
            .Line("V001", "CRYO3", 30000m)
            .Line("V001", "CRYO3", 30000m)
            .Visit("V002", 2, "4", 30, 1000m)
            .Line("V002", "MM085", 6710m)
            .Read(G("etc1", "CRYO", "CRYO3"), G("pt", "MM085", "CRYO3"), G("etc2", "MM085"));

        Assert.Equal(85000L, GroupOf(result, "etc1").Total);
        Assert.Equal(66710L, GroupOf(result, "pt").Total);
        Assert.Equal(6710L, GroupOf(result, "etc2").Total);
    }

    [Fact(DisplayName = "AC-3604.3 원 미만은 묶음마다 버린다(진료·줄마다가 아니다)")]
    public void GroupTotalTruncatesPerGroup()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 30, 1000m)
            .Line("V001", "MM010", 1010.6m)
            .Line("V001", "MM015", 510.9m)
            .Visit("V002", 2, "4", 30, 1000m)
            .Line("V002", "MM010", 1010.6m)
            .Read(G("pt", "MM010", "MM015"), G("etc1", "MM015"));

        // 1,010.6 + 510.9 + 1,010.6 = 2,532.1 → 2,532 (줄마다 버리면 2,530, 진료마다 버리면 2,531)
        Assert.Equal(2532L, GroupOf(result, "pt").Total);
        Assert.Equal(510L, GroupOf(result, "etc1").Total);
    }

    [Fact(DisplayName = "AC-3604.3 단가 0원 코드(씨암 CARM1·SONO SONO1 처음 코드)와 금액 칸이 비어 있는(NULL) 코드는 0이고 사람 수는 그대로 센다")]
    public void GroupTotalZeroPrice()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 30, 50000m)
            .Line("V001", "CARM1", 0m)
            .Visit("V002", 2, "4", 30, 40000m)
            .Line("V002", "SONO1", null)
            .Read(G("carm", "CARM1"), G("sono", "SONO1"));

        Assert.Equal(1L, GroupOf(result, "carm").Patients);
        Assert.Equal(0L, GroupOf(result, "carm").Total);
        Assert.Equal(1L, GroupOf(result, "sono").Patients);
        Assert.Equal(0L, GroupOf(result, "sono").Total);
    }

    [Fact(DisplayName = "AC-3604.3 수납 줄이 없는 진료도 처방 금액은 그대로 더하고, 그 진료 수는 groups[].unpaidVisits(묶음 사람 진료)에 지금처럼 센다")]
    public void GroupTotalCountsUnpaidVisits()
    {
        var result = new DayRig()
            .Visit("V001", 1, "4", 30, null)
            .Line("V001", "ESWT7", 70000m)
            .Visit("V002", 1, "4", 30, 5000m)
            .Line("V002", "MM010", 1010m)
            .Visit("V003", 2, "4", 30, null)
            .Line("V003", "XRAY", 9000m)
            .Visit("V004", 3, "4", 30, null, "CARM1")
            .Read(G("eswt", "ESWT7"), G("pt", "MM010"), G("carm", "CARM1"), G("sono", "SONO1"));

        var eswt = GroupOf(result, "eswt");
        Assert.Equal(70000L, eswt.Total);
        Assert.Equal(1L, eswt.UnpaidVisits);
        // 같은 사람(1)의 수납 없는 진료 V001이 물리치료 묶음에도 센다(묶음 사람 진료)
        var pt = GroupOf(result, "pt");
        Assert.Equal(1010L, pt.Total);
        Assert.Equal(1L, pt.UnpaidVisits);
        Assert.Equal(1L, GroupOf(result, "carm").UnpaidVisits);
        Assert.Equal(0L, GroupOf(result, "sono").UnpaidVisits);
        Assert.Equal(3L, result.Warnings.UnpaidVisits);
    }

    [Fact(DisplayName = "AC-3604.3 warnings.unpaidVisits는 그날 모든 진료 가운데 수납 줄이 없는 진료 수다(묶음 밖 진료 포함)")]
    public void UnpaidVisitsOfDay()
    {
        var result = new DayRig()
            .Visit("V001", 1, "1", 30, null, "CARM1")
            .Visit("V002", 2, "4", 30, null)
            .Visit("V003", 3, "4", 30, null, "XRAY")
            .Visit("V004", 4, "4", 30, 1000m, "CARM1")
            .Read(G("carm", "CARM1"));

        Assert.Equal(3L, result.Warnings.UnpaidVisits);
        Assert.Equal(1L, GroupOf(result, "carm").UnpaidVisits);
        // 진료 총진료비(1,000)는 묶음 금액에 더하지 않는다(CARM1 줄 금액 0)
        Assert.Equal(0L, GroupOf(result, "carm").Total);
    }

    // ---- AC-3604.4 입원 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3604.4 inpatientVisits = InpatientSql 수(외래가 아닌 접수, 이 의원은 늘 0)")]
    public void InpatientVisits()
    {
        Assert.Equal(0L, Quiet().InpatientVisits);
        var rig = new DayRig();
        RevenueFake.Row(rig.Db, ClosingSql.InpatientSql, 2L);
        Assert.Equal(2L, rig.Read().InpatientVisits);
        Assert.Contains("c.OcmPatTyp<>'O'", ClosingSql.InpatientSql, StringComparison.Ordinal);
    }

    // ---- AC-3605.1 예약 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3605.1 reservations.kinds = 메모 번호마다 total·visited·changed·canceled(번호 앞뒤 공백 뗌, 빈 번호도 한 줄), patients = 그날 예약 환자 수")]
    public void Reservations()
    {
        var rig = new DayRig();
        rig.Db.Answer(ClosingSql.ReservationKindsSql, _ => new[]
        {
            new object?[] { "", 2L, 1L, 0L, 1L },
            new object?[] { "1", 10L, 6L, 2L, 3L },
            new object?[] { "14 ", 8, 7, 1, 1 },
        });
        RevenueFake.Row(rig.Db, ClosingSql.ReservationPatientsSql, 19);
        var reservations = rig.Read().Reservations;

        Assert.Equal(new[] { "", "1", "14" }, reservations.Kinds.Select(kind => kind.Kind));
        var shock = reservations.Kinds[1];
        Assert.Equal(new long[] { 10, 6, 2, 3 }, new[] { shock.Total, shock.Visited, shock.Changed, shock.Canceled });
        var manual = reservations.Kinds[2];
        Assert.Equal(new long[] { 8, 7, 1, 1 }, new[] { manual.Total, manual.Visited, manual.Changed, manual.Canceled });
        Assert.Equal(19L, reservations.Patients);
    }

    [Fact(DisplayName = "AC-3605.1 예약이 없으면 kinds는 빈 목록·patients 0, 내원은 살아 있는 예약(OS)·진료 끝난 접수, 취소는 OC, 바꿈은 RsvLog")]
    public void NoReservations()
    {
        var reservations = Quiet().Reservations;
        Assert.Empty(reservations.Kinds);
        Assert.Equal(0L, reservations.Patients);

        var kinds = System.Text.RegularExpressions.Regex.Replace(ClosingSql.ReservationKindsSql, @"\s+", " ");
        Assert.Contains("CASE WHEN r.RsvSts='OS' AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') THEN 1 ELSE 0 END Visited", kinds, StringComparison.Ordinal);
        Assert.Contains("CASE WHEN r.RsvSts='OC' THEN 1 ELSE 0 END Canceled", kinds, StringComparison.Ordinal);
        Assert.Contains("FROM dbo.RsvLog l WHERE l.RsvLogChtNum=r.RsvChtNum", kinds, StringComparison.Ordinal);
        Assert.Contains("r.RsvDtm>=@from AND r.RsvDtm<@to", kinds, StringComparison.Ordinal);
    }

    // ---- AC-3605.2 주사 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3605.2 injection 묶음이 없으면 injection null이고 HistoryGuard 한 번(revenue.days 안)뿐, InjectionFirstSql은 부르지 않는다")]
    public void NoInjectionGroup()
    {
        var rig = new DayRig().Visit("V001", 1, "1", 30, 1000m, "KK090");
        var result = rig.Read(G("carm", "CARM1"));

        Assert.Null(result.Injection);
        Assert.False(result.Warnings.NoHistory);
        Assert.Equal(0, rig.Count(ClosingSql.InjectionFirstSql));
        Assert.Equal(1, rig.Count(RevenueSql.HistoryGuard));
    }

    [Fact(DisplayName = "AC-3605.2 newPatients = 신환 가운데 주사 묶음 사람, newLines = 그 신환들의 주사 코드 줄 수 합, firstTime = InjectionFirstSql")]
    public void InjectionCounts()
    {
        var rig = new DayRig()
            .Visit("V001", 1, "1", 30, 1000m, "LA358", "LA358", "LA272", "A15")
            .Visit("V002", 1, "1", 30, 1000m, "KK090")
            .Visit("V003", 2, "1", 30, 1000m, "A15")
            .Visit("V004", 3, "3", 30, 1000m, "LA358")
            .Visit("V005", 4, "4", 30, 1000m, "KK090", "KK090")
            .Visit("V006", 5, "1", 30, 1000m, "la272");
        RevenueFake.Row(rig.Db, ClosingSql.InjectionFirstSql, 3L);
        var result = rig.Read(G("injection", "LA358", "LA272", "KK090"));

        var injection = Assert.IsType<ClosingInjection>(result.Injection);
        Assert.Equal(2L, injection.NewPatients);
        Assert.Equal(5L, injection.NewLines);
        Assert.Equal(3L, injection.FirstTime);
        Assert.False(result.Warnings.NoHistory);
        Assert.Equal(4L, GroupOf(result, "injection").Patients);
    }

    [Fact(DisplayName = "AC-3605.2 InjectionFirstSql 매개변수 @c0~@c19: 고른 코드(앞뒤 공백 뗀 대문자) 뒤 빈 자리는 첫 코드로 채운다")]
    public void InjectionCodeSlots()
    {
        var rig = new DayRig();
        rig.Read(G("injection", " la358 ", "KK090"));

        var call = Assert.Single(rig.Db.Calls, c => c.Sql == ClosingSql.InjectionFirstSql);
        var slots = Enumerable.Range(0, 20).Select(i => call.Args["@c" + i]).ToArray();
        Assert.Equal(new object?[] { "LA358", "KK090" }.Concat(Enumerable.Repeat((object?)"LA358", 18)), slots);
        Assert.Equal(ClosingFake.DayKey + "0000", call.Args["@from"]);
    }

    [Fact(DisplayName = "AC-3605.2 HistoryGuard ≠ 0(옛 자료가 따로 있음)이면 firstTime null·noHistory true이고 InjectionFirstSql을 부르지 않는다")]
    public void NoHistoryLeavesFirstTimeNull()
    {
        var rig = new DayRig().Visit("V001", 1, "1", 30, 1000m, "KK090");
        RevenueFake.Row(rig.Db, RevenueSql.HistoryGuard, 1L);
        var result = rig.Read(G("injection", "KK090"));

        var injection = Assert.IsType<ClosingInjection>(result.Injection);
        Assert.Null(injection.FirstTime);
        Assert.Equal(1L, injection.NewPatients);
        Assert.Equal(1L, injection.NewLines);
        Assert.True(result.Warnings.NoHistory);
        Assert.Equal(0, rig.Count(ClosingSql.InjectionFirstSql));
    }

    // ---- AC-3606.1 실패면 일부만 답하지 않는다 ---------------------------------------------------------------

    public static IEnumerable<object?[]> DayStatements() =>
        ClosingFake.Statements.Where(sql => sql != ClosingSql.MemoKindsSql)
            .Concat(new[] { RevenueSql.FinanceNormal, RevenueSql.FinanceReceivable, RevenueSql.Patients })
            .Select(sql => new object?[] { sql });

    [Theory(DisplayName = "AC-3606.1 문장 하나라도 읽기에 실패하면 일부만 답하지 않고 E-BIT-READ-FAILED 하나")]
    [MemberData(nameof(DayStatements))]
    public void ReadFailureFailsWhole(string sql)
    {
        var rig = new DayRig().Visit("V001", 1, "1", 30, 1000m, "KK090");
        rig.Db.Fail(sql, BitErrors.ReadFailed);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => rig.Read(G("injection", "KK090"))).Code);
    }

    [Fact(DisplayName = "AC-3606.1 칸이 모자라거나 숫자가 아닌 칸은 지어내지 않고 E-BIT-READ-FAILED")]
    public void BadCellsFail()
    {
        var shortRow = new DayRig();
        shortRow.Db.Answer(ClosingSql.DayVisitsSql, _ => new[] { new object?[] { "V001", 1L, "1", 30 } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ClosingDay.Read(shortRow.Db, Synthetic.Scope, ClosingFake.Day, new ClosingGroup[0])).Code);

        var notNumber = new DayRig();
        RevenueFake.Row(notNumber.Db, ClosingSql.MoneyExtraSql, "많음", 0m, 0m, 0m);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => notNumber.Read()).Code);

        var twoRows = new DayRig();
        twoRows.Db.Answer(ClosingSql.InpatientSql, _ => new[] { new object?[] { 0L }, new object?[] { 0L } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => twoRows.Read()).Code);
    }

    [Fact(DisplayName = "AC-3604.3 AC-3606.1 처방 줄에 금액 칸이 없거나 숫자가 아니면 지어내지 않고 E-BIT-READ-FAILED")]
    public void BadCodeAmountFails()
    {
        var noAmount = new DayRig().Visit("V001", 1, "4", 30, 1000m);
        noAmount.Db.Answer(ClosingSql.DayCodesSql, _ => new[] { new object?[] { "V001", "MM010", 1L } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => noAmount.Read(G("pt", "MM010"))).Code);

        var notNumber = new DayRig().Visit("V001", 1, "4", 30, 1000m);
        notNumber.Db.Answer(ClosingSql.DayCodesSql, _ => new[] { new object?[] { "V001", "MM010", 1L, "많음" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => notNumber.Read(G("pt", "MM010"))).Code);
    }

    // ---- AC-3606.2 답 모양 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.2 closing.day 답 JSON은 design.md 2절 칸만 있다(이름 그대로, null 칸도 실림)")]
    public void AnswerShape()
    {
        var withInjection = ClosingFake.DataOf(new DayRig()
            .Visit("V001", 1, "1", 30, 1000m, "KK090")
            .Read(G("injection", "KK090"), G("carm", "CARM1")));
        var rig = new DayRig();
        rig.Db.Answer(ClosingSql.ReservationKindsSql, _ => new[] { new object?[] { "1", 1L, 1L, 0L, 0L } });
        var plain = ClosingFake.DataOf(rig.Read());

        foreach (var data in new[] { withInjection, plain })
        {
            Assert.Equal(
                ClosingFake.Sorted("date", "patients", "groups", "ages", "money", "inpatientVisits", "reservations", "injection", "warnings"),
                ClosingFake.Keys(data));
            Assert.Equal(ClosingFake.Sorted("new", "first90", "return", "ptVisit", "noExamFee", "total"), ClosingFake.Keys(data.GetProperty("patients")));
            Assert.Equal(10, data.GetProperty("ages").GetArrayLength());
            foreach (var band in data.GetProperty("ages").EnumerateArray()) Assert.Equal(ClosingFake.Sorted("band", "new", "first90", "return"), ClosingFake.Keys(band));
            Assert.Equal(
                ClosingFake.Sorted("total", "insurer", "receivableIn", "unpaidNew", "noncovered", "discount", "disabledFund", "received", "card", "cash", "transfer", "refund"),
                ClosingFake.Keys(data.GetProperty("money")));
            Assert.Equal(ClosingFake.Sorted("kinds", "patients"), ClosingFake.Keys(data.GetProperty("reservations")));
            Assert.Equal(
                ClosingFake.Sorted("moneyUnconfirmed", "splitUnconfirmed", "unpaidVisits", "unknownAge", "noHistory"),
                ClosingFake.Keys(data.GetProperty("warnings")));
            Assert.Equal(JsonValueKind.String, data.GetProperty("date").ValueKind);
            Assert.Equal(JsonValueKind.Number, data.GetProperty("inpatientVisits").ValueKind);
        }

        Assert.Equal(2, withInjection.GetProperty("groups").GetArrayLength());
        foreach (var group in withInjection.GetProperty("groups").EnumerateArray())
        {
            Assert.Equal(ClosingFake.Sorted("key", "patients", "total", "unpaidVisits", "new", "first90", "return"), ClosingFake.Keys(group));
        }
        Assert.Equal(ClosingFake.Sorted("firstTime", "newPatients", "newLines"), ClosingFake.Keys(withInjection.GetProperty("injection")));
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("injection").ValueKind);
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("patients").GetProperty("ptVisit").ValueKind);
        var kind = Assert.Single(plain.GetProperty("reservations").GetProperty("kinds").EnumerateArray());
        Assert.Equal(ClosingFake.Sorted("kind", "total", "visited", "changed", "canceled"), ClosingFake.Keys(kind));
        Assert.Equal(JsonValueKind.Array, plain.GetProperty("groups").ValueKind);
    }

    [Fact(DisplayName = "AC-3606.2 답에는 진료번호·그날 번호 같은 줄 값이 없고 숫자 칸만 있다")]
    public void AnswerHasNoRowValues()
    {
        var data = ClosingFake.DataOf(new DayRig()
            .Visit("VISIT-0000913", 913, "1", 30, 1000m, "CARM1")
            .Visit("VISIT-0000914", 914, "4", 31, 2000m, "AA222")
            .Read(G("carm", "CARM1"), G("ptVisit", "AA222")));
        var text = data.GetRawText();

        Assert.DoesNotContain("VISIT-", text, StringComparison.Ordinal);
        Assert.DoesNotContain("913", text, StringComparison.Ordinal);
        Assert.DoesNotContain("914", text, StringComparison.Ordinal);
    }
}
