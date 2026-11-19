using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Revenue;

/// <summary>REQ-003 RevenueDays.Read: 가짜 DB가 문장 글자로 답을 고른다. 금액·건수·코드는 모두 지어낸 것이다.</summary>
public class RevenueDaysTests
{
    private const string First = "2026-10-30";
    private const string Middle = "2026-10-31";
    private const string Last = "2026-11-01";

    private static DateTime D(string text) => DateTime.ParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static RevenueResult Read(FakeDb db, string from, string to) => RevenueDays.Read(db, Synthetic.Scope, D(from), D(to));

    private static RevenueDay OneDay(FakeDb db) => Assert.Single(Read(db, First, First).Days);

    private static RevenueCode[] CodesOf(FakeDb db) => Read(db, First, First).Codes.ToArray();

    private static long?[] Money(RevenueDay day) =>
        new[] { day.Total, day.Insurer, day.Noncovered, day.Copay, day.OtherTotal, day.Cash, day.Card, day.Transfer, day.ReceivableIn };

    private static void AssertUnconfirmed(RevenueDay day)
    {
        Assert.True(day.Unconfirmed);
        Assert.False(day.SplitUnconfirmed);
        Assert.All(Money(day), value => Assert.Null(value));
    }

    /// <summary>나눔 네 칸만 비고 남는 다섯 칸은 그대로다(기본 하루 금액, total만 다를 수 있다).</summary>
    private static void AssertSplitUnconfirmed(RevenueDay day, long total = 1050000L)
    {
        Assert.True(day.SplitUnconfirmed);
        Assert.False(day.Unconfirmed);
        Assert.Null(day.Insurer);
        Assert.Null(day.Noncovered);
        Assert.Null(day.Copay);
        Assert.Null(day.OtherTotal);
        Assert.Equal(total, day.Total);
        Assert.Equal(200000L, day.Cash);
        Assert.Equal(300000L, day.Card);
        Assert.Equal(100000L, day.Transfer);
        Assert.Equal(24000L, day.ReceivableIn);
    }

    /// <summary>그날 줄을 도우미 답과 같은 JSON으로 만든 뒤 본 roughTotal(AC-4405.1). 열쇠가 없으면 null.</summary>
    private static long? RoughOf(RevenueDay day)
    {
        using var json = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(day));
        return json.RootElement.TryGetProperty("roughTotal", out var value) ? value.GetInt64() : (long?)null;
    }

    /// <summary>그날 줄 JSON에 roughTotal 열쇠가 있는가(AC-4405.2 확인된 날은 열쇠가 없다).</summary>
    private static bool HasRough(RevenueDay day)
    {
        using var json = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(day));
        return json.RootElement.TryGetProperty("roughTotal", out _);
    }

    private static void AssertNoFlag(RevenueDay day)
    {
        Assert.False(day.Unconfirmed);
        Assert.False(day.SplitUnconfirmed);
    }

    private static string[] Sorted(IEnumerable<string> sqls) => sqls.OrderBy(sql => sql, StringComparer.Ordinal).ToArray();

    // ---- AC-003.1 어떤 문장을 언제 돌리는가 -------------------------------------------------------------

    [Fact(DisplayName = "AC-003.1 AC-4101.2 AC-6912.1 3일 기간이면 줄 3개, HistoryGuard 한 번, 날마다 문장 5개(FinanceNormal → FinanceReceivable → FinanceNormalExtra → FinanceReceivableExtra → Patients)를 그날 기간으로, 그 뒤 CodeAmounts 한 번, 맨 끝에 CodeAmountsByDay 한 번")]
    public void RunsFiveStatementsEachDay()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        var result = Read(db, First, Last);

        Assert.Equal(new[] { First, Middle, Last }, result.Days.Select(day => day.Date));
        Assert.Equal(RevenueSql.HistoryGuard, db.Calls[0].Sql);
        Assert.Empty(db.Calls[0].Args);
        Assert.Equal(RevenueSql.CodeAmounts, db.Calls[db.Calls.Count - 2].Sql);
        Assert.Equal(RevenueSql.CodeAmountsByDay, db.Calls[db.Calls.Count - 1].Sql);
        Assert.Equal(1 + 3 * 5 + 2, db.Calls.Count);

        var days = new[] { ("20261030", "20261031"), ("20261031", "20261101"), ("20261101", "20261102") };
        foreach (var (day, next) in days)
        {
            var calls = RevenueFake.CallsOn(db, next);
            Assert.Equal(RevenueFake.FiveStatements, calls.Select(call => call.Sql));
            foreach (var call in calls)
            {
                var expected = new Dictionary<string, string>
                {
                    ["@day"] = day,
                    ["@nextDay"] = next,
                    ["@from"] = day + "0000",
                    ["@to"] = next + "0000",
                    ["@hospital"] = Synthetic.Scope,
                };
                foreach (var arg in call.Args) Assert.Equal(expected[arg.Key], arg.Value);
            }
        }
        Assert.DoesNotContain(db.Calls, call => RevenueFake.Checks.Contains(call.Sql));
    }

    [Fact(DisplayName = "AC-003.1 모든 읽기의 시간 제한은 원본 CommandTimeout=90과 같다")]
    public void TimeoutMatchesOriginal()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        Read(db, First, Last);
        Assert.All(db.Calls, call => Assert.Equal(TimeSpan.FromSeconds(90), call.Timeout));
    }

    [Theory(DisplayName = "AC-003.1 AC-6912.1 세 검사 문장(UnsupportedFinance·FinanceMultiplicity·ReceivableMultiplicity)은 부르지 않는다: 가짜 DB가 검사에 1을 답해도 날마다 문장 5개뿐이고 참고 금액 문장도 없다")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(-1)]
    public void NeverRunsTheThreeChecks(int check)
    {
        var db = RevenueFake.Quiet(new FakeDb());
        if (check < 0) RevenueFake.ChecksCaught(db);
        else RevenueFake.Row(db, RevenueFake.Checks[check], 1L);
        Read(db, First, Last);

        Assert.DoesNotContain(db.Calls, call => RevenueFake.Checks.Contains(call.Sql));
        Assert.DoesNotContain(db.Calls, call => RevenueFake.RoughStatements.Contains(call.Sql));
        foreach (var next in new[] { "20261031", "20261101", "20261102" })
        {
            Assert.Equal(RevenueFake.FiveStatements, RevenueFake.CallsOn(db, next).Select(call => call.Sql));
        }
    }

    // ---- AC-003.2 금액 ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.2 금액이 맞는 칸에서 온다: 총액·공단·비급여는 두 문장 합, 현금·카드·계좌는 FinanceNormal, 미수입금은 FinanceReceivable 4+5+6")]
    public void MoneyComesFromRightCells()
    {
        var day = OneDay(RevenueFake.Quiet(new FakeDb()));

        AssertNoFlag(day);
        Assert.Equal(1050000L, day.Total);
        Assert.Equal(310000L, day.Insurer);
        Assert.Equal(405000L, day.Noncovered);
        Assert.Equal(155000L, day.Copay);
        Assert.Equal(180000L, day.OtherTotal);
        Assert.Equal(200000L, day.Cash);
        Assert.Equal(300000L, day.Card);
        Assert.Equal(100000L, day.Transfer);
        Assert.Equal(24000L, day.ReceivableIn);
    }

    [Fact(DisplayName = "AC-003.2 원 미만은 버린다: 12345.67 → 12345")]
    public void TruncatesWon()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 12345.67m, 1000m, 2000m, 100.9m, 200.9m, 300.9m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, null, null, null, null, null, null);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 1500m, 500m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, null, null);
        var day = OneDay(db);

        AssertNoFlag(day);
        Assert.Equal(12345L, day.Total);
        Assert.Equal(100L, day.Cash);
        Assert.Equal(200L, day.Card);
        Assert.Equal(300L, day.Transfer);
        Assert.Equal(0L, day.ReceivableIn);
        Assert.Equal(12345L - 1500L - 2000L, day.OtherTotal);
    }

    [Fact(DisplayName = "AC-003.2 두 문장 합은 더한 뒤에 버린다: 0.6 + 0.6 → 1, 미수입금 0.4 + 0.4 + 0.4 → 1")]
    public void AddsBeforeTruncating()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 0.6m, 0m, 0m, 0m, 0m, 0m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, 0.6m, 0m, 0m, 0.4m, 0.4m, 0.4m);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 0m, 0m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, 0m, 0m);
        var day = OneDay(db);

        Assert.Equal(1L, day.Total);
        Assert.Equal(1L, day.ReceivableIn);
    }

    [Fact(DisplayName = "AC-003.2 진료 없는 날(DB NULL)은 금액 아홉 칸이 0이고 두 표시 모두 거짓이다")]
    public void DbNullIsZero()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, null, null, null, null, null, null);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, null, null, null, null, null, null);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, null, null);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, null, null);
        var day = OneDay(db);

        AssertNoFlag(day);
        Assert.All(Money(day), value => Assert.Equal(0L, value));
    }

    [Theory(DisplayName = "AC-003.2 AC-6912.1 세 검사에 걸리던 날(환불·변경수납·예치금·연결 중복)도 확인된 날과 같은 칸·같은 규칙으로 금액 아홉 칸을 채우고 unconfirmed·splitUnconfirmed 거짓, roughTotal 열쇠 없음")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(-1)]
    public void CaughtDayIsReadLikeOtherDays(int check)
    {
        var plain = OneDay(RevenueFake.Quiet(new FakeDb()));
        var db = RevenueFake.Quiet(new FakeDb());
        if (check < 0) RevenueFake.ChecksCaught(db);
        else RevenueFake.Row(db, RevenueFake.Checks[check], 1L);
        var day = OneDay(db);

        AssertNoFlag(day);
        Assert.False(HasRough(day));
        Assert.Equal(Money(plain), Money(day));
        Assert.Equal(new long?[] { 1050000L, 310000L, 405000L, 155000L, 180000L, 200000L, 300000L, 100000L, 24000L }, Money(day));
        Assert.Equal(10L, day.Visits);
    }

    [Fact(DisplayName = "AC-6912.1 세 검사에 걸리던 날도 금액은 두 문장 합 뒤 원 미만을 버리고 otherTotal은 나머지다(0.6 + 0.6 → 1, 12345.07 + 0.6 → 12345)")]
    public void CaughtDayUsesSameMoneyRules()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.ChecksCaught(db);
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 12345.07m, 1000m, 2000m, 100.9m, 200.9m, 300.9m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, 0.6m, 0m, 0m, 0.4m, 0.4m, 0.4m);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 1500m, 500m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, null, null);
        var day = OneDay(db);

        AssertNoFlag(day);
        Assert.Equal(12345L, day.Total);
        Assert.Equal(1000L, day.Insurer);
        Assert.Equal(2000L, day.Noncovered);
        Assert.Equal(500L, day.Copay);
        Assert.Equal(12345L - 1500L - 2000L, day.OtherTotal);
        Assert.Equal(100L, day.Cash);
        Assert.Equal(200L, day.Card);
        Assert.Equal(300L, day.Transfer);
        Assert.Equal(1L, day.ReceivableIn);
    }

    [Fact(DisplayName = "AC-6912.2 세 검사에 걸리던 날도 total·cash·card·transfer·receivableIn이 음수면 지금처럼 unconfirmed 참, 금액 아홉 칸 null, roughTotal = 참고 금액")]
    public void CaughtNegativeDayIsUnconfirmed()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.ChecksCaught(db);
        RevenueFake.Row(db, RevenueSql.FinanceNormal, RevenueFake.NegativeCash);
        var day = OneDay(db);

        AssertUnconfirmed(day);
        Assert.Equal(RevenueFake.Rough, RoughOf(day));
        Assert.Equal(
            RevenueFake.MoneyStatements.Concat(RevenueFake.RoughStatements).Concat(new[] { RevenueSql.Patients }),
            RevenueFake.CallsOn(db, "20261031").Select(call => call.Sql));
    }

    [Fact(DisplayName = "AC-6912.3 세 검사에 걸리던 날도 insurer + copay ≠ 요양비용총액이면 지금처럼 splitUnconfirmed, 나눔 네 칸만 null·다섯 칸은 채움, unconfirmed 거짓, roughTotal 열쇠 없음")]
    public void CaughtMismatchDayIsSplitOnly()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.ChecksCaught(db);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 450001m, 150000m);
        var day = OneDay(db);

        AssertSplitUnconfirmed(day);
        Assert.False(HasRough(day));
        Assert.DoesNotContain(db.Calls, call => RevenueFake.RoughStatements.Contains(call.Sql));
    }

    [Fact(DisplayName = "AC-6912.3 세 검사에 걸리던 날도 나눔 칸(비급여)이 버린 뒤 음수면 지금처럼 splitUnconfirmed, 네 칸만 null")]
    public void CaughtNegativeSplitDayIsSplitOnly()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.ChecksCaught(db);
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 1000000m, 300000m, -6000m, 200000m, 300000m, 100000m);
        var day = OneDay(db);

        AssertSplitUnconfirmed(day);
        Assert.False(HasRough(day));
    }

    [Fact(DisplayName = "AC-003.2 insurer + copay ≠ 요양비용총액이면 그날만 splitUnconfirmed, 나눔 네 칸만 null, total·cash·card·transfer·receivableIn은 그대로(맞춰 고치지 않음)")]
    public void MismatchBlanksOnlySplit()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.RowOn(db, RevenueSql.FinanceNormalExtra, "20261031", new object?[] { 450001m, 150000m }, RevenueFake.NormalExtra);
        var days = Read(db, First, Last).Days;

        AssertSplitUnconfirmed(days[1]);
        AssertNoFlag(days[0]);
        AssertNoFlag(days[2]);
        Assert.Equal(310000L, days[0].Insurer);
        Assert.Equal(200000L, days[0].Cash);
    }

    [Fact(DisplayName = "AC-003.2 비교는 버리기 전 값으로 한다: insurer 1000.5 + 본인부담 499.5 = 요양비용총액 1500 → insurer 1000·copay 499, 합이 total")]
    public void ComparesBeforeTruncating()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 2000m, 1000.5m, 300m, 0m, 0m, 0m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, null, null, null, null, null, null);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 1500m, 499.5m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, null, null);
        var day = OneDay(db);

        AssertNoFlag(day);
        Assert.Equal(1000L, day.Insurer);
        Assert.Equal(499L, day.Copay);
        Assert.Equal(201L, day.OtherTotal);
        Assert.Equal(day.Total, day.Insurer + day.Copay + day.Noncovered + day.OtherTotal);
    }

    [Fact(DisplayName = "AC-003.2 버린 뒤에는 같아도 버리기 전에 다르면 나눔만 비운다: insurer 1000.4 + 본인부담 499.4 ≠ 요양비용총액 1499")]
    public void SubWonMismatchBlanksOnlySplit()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 2000m, 1000.4m, 300m, 200000m, 300000m, 100000m);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, 1499m, 499.4m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, null, null, null, 7000m, 8000m, 9000m);
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, null, null);

        AssertSplitUnconfirmed(OneDay(db), total: 2000L);
    }

    [Fact(DisplayName = "AC-003.2 요양비용총액·본인부담은 두 Extra 답을 더해 맞춘다(한쪽만 보면 어긋난다)")]
    public void ExtrasAreSummedAcrossStatements()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceReceivableExtra, 0m, 0m);
        AssertSplitUnconfirmed(OneDay(db));
    }

    private static object?[] Negative(
        string cell,
        bool splitOnly,
        object?[]? normal = null,
        object?[]? receivable = null,
        object?[]? normalExtra = null,
        long total = 1050000L) =>
        new object?[] { cell, splitOnly, total, normal ?? RevenueFake.Normal, receivable ?? RevenueFake.Receivable, normalExtra ?? RevenueFake.NormalExtra };

    public static IEnumerable<object?[]> NegativeCells()
    {
        // 남는 다섯 칸: 금액 아홉 칸을 비운다. total이 음수면 나머지인 otherTotal도 음수지만 이쪽을 먼저 본다
        yield return Negative("total", false, normal: new object?[] { -100000m, 300000m, 400000m, 200000m, 300000m, 100000m });
        yield return Negative("cash", false, normal: new object?[] { 1000000m, 300000m, 400000m, -1m, 300000m, 100000m });
        yield return Negative("card", false, normal: new object?[] { 1000000m, 300000m, 400000m, 200000m, -1m, 100000m });
        yield return Negative("transfer", false, normal: new object?[] { 1000000m, 300000m, 400000m, 200000m, 300000m, -1m });
        yield return Negative("receivableIn", false, receivable: new object?[] { 50000m, 10000m, 5000m, -30000m, 8000m, 9000m });

        // 나눔 네 칸: 그 네 칸만 비운다
        yield return Negative("insurer", true, normal: new object?[] { 1000000m, -320000m, 400000m, 200000m, 300000m, 100000m }, normalExtra: new object?[] { -170000m, 150000m });
        yield return Negative("noncovered", true, normal: new object?[] { 1000000m, 300000m, -6000m, 200000m, 300000m, 100000m });
        yield return Negative("copay", true, normalExtra: new object?[] { 290000m, -10000m });
        yield return Negative("otherTotal(총액보다 급여가 큼)", true, normal: new object?[] { 1000m, 300000m, 400000m, 200000m, 300000m, 100000m }, total: 51000L);
    }

    [Theory(DisplayName = "AC-003.2 음수 아홉 칸: total·cash·card·transfer·receivableIn → unconfirmed(아홉 칸 null), insurer·noncovered·copay·otherTotal → splitUnconfirmed(네 칸만 null)")]
    [MemberData(nameof(NegativeCells))]
    public void NegativeSetsItsFlag(string cell, bool splitOnly, long total, object?[] normal, object?[] receivable, object?[] normalExtra)
    {
        Assert.NotEmpty(cell);

        // 음수가 걸린 까닭이 되도록 금액 맞춤 검사는 지나는 답이다
        decimal Cell(object?[] row, int index) => (decimal)row[index]!;
        var insured = Cell(normalExtra, 0) + Cell(RevenueFake.ReceivableExtra, 0);
        Assert.Equal(insured, Cell(normal, 1) + Cell(receivable, 1) + Cell(normalExtra, 1) + Cell(RevenueFake.ReceivableExtra, 1));

        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, normal);
        RevenueFake.Row(db, RevenueSql.FinanceReceivable, receivable);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, normalExtra);
        var day = OneDay(db);

        if (splitOnly) AssertSplitUnconfirmed(day, total);
        else AssertUnconfirmed(day);
    }

    public static IEnumerable<object?[]> BothFlagsWouldStand()
    {
        var negativeCash = new object?[] { 1000000m, 300000m, 400000m, -1m, 300000m, 100000m };
        yield return new object?[] { "현금 음수 + 금액 어긋남", negativeCash, new object?[] { 450001m, 150000m } };
        yield return new object?[] { "현금 음수 + 비급여 음수", new object?[] { 1000000m, 300000m, -6000m, -1m, 300000m, 100000m }, RevenueFake.NormalExtra };
        yield return new object?[] { "총액 음수 + 금액 어긋남", new object?[] { -100000m, 300000m, 400000m, 200000m, 300000m, 100000m }, new object?[] { 450001m, 150000m } };
    }

    [Theory(DisplayName = "AC-003.2 남는 다섯 칸의 음수를 먼저 본다: 나눔 검사에도 걸리는 날은 unconfirmed이고 두 표시는 함께 참이 아니다")]
    [MemberData(nameof(BothFlagsWouldStand))]
    public void UnconfirmedWinsOverSplit(string what, object?[] normal, object?[] normalExtra)
    {
        Assert.NotEmpty(what);
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, normal);
        RevenueFake.Row(db, RevenueSql.FinanceNormalExtra, normalExtra);
        AssertUnconfirmed(OneDay(db));
    }

    [Fact(DisplayName = "AC-003.2 음수는 버린 뒤의 칸으로 본다: 현금 -0.5 → 0, 두 표시 모두 거짓")]
    public void SubWonNegativeIsZero()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 1000000m, 300000m, 400000m, -0.5m, 300000m, 100000m);
        var day = OneDay(db);
        AssertNoFlag(day);
        Assert.Equal(0L, day.Cash);
    }

    [Fact(DisplayName = "AC-003.2 나눔 칸도 버린 뒤의 칸으로 본다: 비급여 -0.5 → 0, 두 표시 모두 거짓")]
    public void SubWonNegativeSplitCellIsZero()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 1000000m, 300000m, -5000.5m, 200000m, 300000m, 100000m);
        var day = OneDay(db);
        AssertNoFlag(day);
        Assert.Equal(0L, day.Noncovered);
    }

    // ---- AC-4405 확인 필요한 날의 참고 금액(roughTotal) --------------------------------------------------

    [Theory(DisplayName = "AC-4405.1 AC-6912.1 참고 금액은 이제 음수인 날에만: 세 검사에 걸리던 날은 roughTotal 열쇠가 없고 금액 아홉 칸이 숫자다, 음수인 날만 roughTotal = 그날 정상수납 + 미수입금 줄 총진료비의 합(줄마다 원 미만 버림)")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void RoughTotalOnlyOnNegativeDays(int check)
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueFake.Checks[check], 1L);
        RevenueFake.RowOn(db, RevenueSql.FinanceNormal, "20261101", RevenueFake.NegativeCash, RevenueFake.Normal);
        var days = Read(db, First, Last).Days;

        AssertNoFlag(days[0]);
        AssertNoFlag(days[1]);
        Assert.False(HasRough(days[0]));
        Assert.False(HasRough(days[1]));
        Assert.Equal(1050000L, days[1].Total);
        AssertUnconfirmed(days[2]);
        Assert.Equal(RevenueFake.Rough, RoughOf(days[2]));
    }

    [Fact(DisplayName = "AC-4405.1 AC-6912.2 참고 금액 문장은 원장님별 doctorDays와 같은 글(StatsSql 정상수납 → 미수입금)을 그날 @day·@nextDay·@hospital로 90초 제한, 음수인 날의 금액 문장 넷 뒤·Patients 앞에 한 번씩 돌린다(그날 문장 일곱)")]
    public void RoughStatementsUseThatDay()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.RowOn(db, RevenueSql.FinanceNormal, "20261031", RevenueFake.NegativeCash, RevenueFake.Normal);
        Read(db, First, Last);

        var calls = RevenueFake.CallsOn(db, "20261101");
        Assert.Equal(
            new[]
            {
                RevenueSql.FinanceNormal, RevenueSql.FinanceReceivable, RevenueSql.FinanceNormalExtra, RevenueSql.FinanceReceivableExtra,
                StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql, RevenueSql.Patients,
            },
            calls.Select(call => call.Sql));
        Assert.Equal(RevenueFake.FiveStatements, RevenueFake.CallsOn(db, "20261031").Select(call => call.Sql));
        Assert.Equal(RevenueFake.FiveStatements, RevenueFake.CallsOn(db, "20261102").Select(call => call.Sql));
        foreach (var call in calls.Where(call => RevenueFake.RoughStatements.Contains(call.Sql)))
        {
            Assert.Equal(3, call.Args.Count);
            Assert.Equal("20261031", call.Args["@day"]);
            Assert.Equal("20261101", call.Args["@nextDay"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(90), call.Timeout);
        }
        Assert.True(Sql.IsAllowed(StatsSql.DoctorMoneyNormalSql));
        Assert.True(Sql.IsAllowed(StatsSql.DoctorMoneyReceivableSql));
    }

    [Fact(DisplayName = "AC-4405.1 AC-6912.2 음수로 버린 날은 roughTotal을 넣는다: 환불 음수는 그대로 빼고 줄마다 0 쪽으로 원 미만을 버린다(-20,000.7 → -20,000, -0.9 → 0), 진료의가 빈 줄도 더한다, 그날 문장 일곱")]
    public void NegativeDayGetsRoughTotal()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, 1000000m, 300000m, 400000m, -1m, 300000m, 100000m);
        RevenueFake.RoughRows(db,
            new[] { RevenueFake.RoughLine("D001", 500000.7m), RevenueFake.RoughLine("D002", -20000.7m) },
            new[] { RevenueFake.RoughLine("D001", -0.9m), RevenueFake.RoughLine(null, 1000.5m) });
        var day = OneDay(db);

        AssertUnconfirmed(day);
        Assert.Equal(500000L - 20000L + 0L + 1000L, RoughOf(day));
        Assert.Equal(
            Sorted(RevenueFake.FiveStatements.Concat(RevenueFake.RoughStatements)),
            Sorted(RevenueFake.CallsOn(db, "20261031").Select(call => call.Sql)));
        Assert.Equal(7, RevenueFake.CallsOn(db, "20261031").Count);
    }

    [Fact(DisplayName = "AC-4405.1 환불이 더 큰 날은 roughTotal이 음수 그대로이고, 줄이 없거나 금액이 DB NULL이면 0이다")]
    public void RoughTotalKeepsSignAndNullIsZero()
    {
        var refund = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(refund, RevenueSql.FinanceNormal, RevenueFake.NegativeCash);
        RevenueFake.RoughRows(refund, new[] { RevenueFake.RoughLine("D001", 1000m) }, new[] { RevenueFake.RoughLine("D001", -5000.5m) });
        Assert.Equal(-4000L, RoughOf(OneDay(refund)));

        var empty = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(empty, RevenueSql.FinanceNormal, RevenueFake.NegativeCash);
        RevenueFake.RoughRows(empty, new object?[0][], new[] { RevenueFake.RoughLine("D001", null) });
        Assert.Equal(0L, RoughOf(OneDay(empty)));
    }

    public static IEnumerable<object?[]> BrokenRough()
    {
        yield return new object?[] { "칸 모자람", StatsSql.DoctorMoneyNormalSql, new[] { new object?[] { "20261030", "D001" } } };
        yield return new object?[] { "숫자 아님", StatsSql.DoctorMoneyReceivableSql, new[] { new object?[] { "20261030", "D001", "not a number" } } };
        yield return new object?[] { "너무 큼", StatsSql.DoctorMoneyNormalSql, new[] { new object?[] { "20261030", "D001", 9007199254740992m } } };
    }

    [Theory(DisplayName = "AC-4405.1 참고 금액 문장의 답 모양이 틀리면 일부만 답하지 않고 E-BIT-READ-FAILED")]
    [MemberData(nameof(BrokenRough))]
    public void BrokenRoughIsReadFailed(string what, string sql, object?[][] rows)
    {
        Assert.NotEmpty(what);
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.FinanceNormal, RevenueFake.NegativeCash);
        db.Answer(sql, _ => rows);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, First)).Code);
    }

    [Fact(DisplayName = "AC-4405.1 참고 금액 문장이 실패하면 days·codes도 돌려주지 않고 E-BIT-READ-FAILED")]
    public void RoughFailureThrows()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.RowOn(db, RevenueSql.FinanceNormal, "20261031", RevenueFake.NegativeCash, RevenueFake.Normal);
        db.Fail(StatsSql.DoctorMoneyReceivableSql, BitErrors.ReadFailed);

        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, Last)).Code);
        Assert.DoesNotContain(db.Calls, call => call.Sql == RevenueSql.CodeAmounts);
    }

    [Fact(DisplayName = "AC-4405.2 AC-6912.3 확인된 날·나눔만 확인 필요한 날(splitUnconfirmed)은 roughTotal이 null이고 참고 금액 문장을 돌리지 않는다, 다른 칸은 그대로, 날마다 문장 다섯")]
    public void ConfirmedDaysHaveNoRoughTotal()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.RowOn(db, RevenueSql.FinanceNormalExtra, "20261031", new object?[] { 450001m, 150000m }, RevenueFake.NormalExtra);
        var days = Read(db, First, Last).Days;

        AssertSplitUnconfirmed(days[1]);
        AssertNoFlag(days[0]);
        AssertNoFlag(days[2]);
        Assert.All(days, day => Assert.False(HasRough(day)));
        Assert.Equal(1050000L, days[0].Total);
        Assert.DoesNotContain(db.Calls, call => RevenueFake.RoughStatements.Contains(call.Sql));
        foreach (var next in new[] { "20261031", "20261101", "20261102" }) Assert.Equal(5, RevenueFake.CallsOn(db, next).Count);
    }

    // ---- AC-003.3 내원·신환·재진 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.3 visits = 1째, newPatients = 2째, returnVisits = visits − newPatients")]
    public void VisitsFromPatients()
    {
        var day = OneDay(RevenueFake.Quiet(new FakeDb()));
        Assert.Equal(10L, day.Visits);
        Assert.Equal(3L, day.NewPatients);
        Assert.Equal(7L, day.ReturnVisits);
    }

    [Theory(DisplayName = "AC-003.3 Patients 3~5째 칸 가운데 하나라도 0이 아니면 그날 셋 다 null(금액은 그대로)")]
    [InlineData(1L, 0L, 0L)]
    [InlineData(0L, 1L, 0L)]
    [InlineData(0L, 0L, 1L)]
    public void PatientsChecksNullAllThree(long noChart, long duplicate, long noFirstVisit)
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.Patients, 10L, 3L, noChart, duplicate, noFirstVisit);
        var day = OneDay(db);

        Assert.Null(day.Visits);
        Assert.Null(day.NewPatients);
        Assert.Null(day.ReturnVisits);
        Assert.Equal(1050000L, day.Total);
    }

    [Fact(DisplayName = "AC-003.3 신환이 내원보다 많으면(재진이 음수) 원본처럼 확정하지 않는다: 셋 다 null")]
    public void NegativeReturnVisitsNullAllThree()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.Patients, 3L, 10L, 0L, 0L, 0L);
        var day = OneDay(db);

        Assert.Null(day.Visits);
        Assert.Null(day.NewPatients);
        Assert.Null(day.ReturnVisits);
    }

    [Fact(DisplayName = "AC-003.3 HistoryGuard ≠ 0이면 모든 날 newPatients·returnVisits null, visits는 그대로")]
    public void HistoryGuardNullsNewAndReturnOnEveryDay()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Row(db, RevenueSql.HistoryGuard, 1L);
        var days = Read(db, First, Last).Days;

        Assert.Equal(3, days.Count);
        Assert.All(days, day =>
        {
            Assert.Equal(10L, day.Visits);
            Assert.Null(day.NewPatients);
            Assert.Null(day.ReturnVisits);
            Assert.Equal(1050000L, day.Total);
        });
        Assert.Single(db.Calls, call => call.Sql == RevenueSql.HistoryGuard);
    }

    // ---- AC-003.4 내원 건수 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.4 visits는 Patients 첫째 칸이고, 그날 기간의 @from·@to로 읽는다")]
    public void VisitsIsFirstCellOfThatDay()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        db.Answer(RevenueSql.Patients, args => new[] { new object?[] { (string)args["@from"]! == "202610310000" ? 15L : 8L, 3L, 0L, 0L, 0L } });
        var days = Read(db, First, Last).Days;

        Assert.Equal(new long?[] { 8L, 15L, 8L }, days.Select(day => day.Visits));
        var second = Assert.Single(RevenueFake.CallsOn(db, "20261101"), call => call.Sql == RevenueSql.Patients);
        Assert.Equal("202610310000", second.Args["@from"]);
        Assert.Equal("202611010000", second.Args["@to"]);
        Assert.Equal(Synthetic.Scope, second.Args["@hospital"]);
        Assert.Equal(3, second.Args.Count);
    }

    // ---- AC-003.5 처방 코드 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.5 CodeAmounts는 기간에 한 번: count·amount(원 미만 버림)·name, @to는 끝날 다음 날")]
    public void ReadsCodesForWholePeriod()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, RevenueFake.Code("CARM1", 4, 12345.67m, name: "씨암"));
        var result = Read(db, First, Last);

        var code = Assert.Single(result.Codes);
        Assert.Equal("CARM1", code.Code);
        Assert.Equal(4L, code.Count);
        Assert.Equal(12345L, code.Amount);
        Assert.Equal("씨암", code.Name);

        var call = Assert.Single(db.Calls, c => c.Sql == RevenueSql.CodeAmounts);
        Assert.Equal("202610300000", call.Args["@from"]);
        Assert.Equal("202611020000", call.Args["@to"]);
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(3, call.Args.Count);
    }

    [Fact(DisplayName = "AC-003.5 값이 빠진 줄이 있는 코드는 amount null")]
    public void MissingValuesNullAmount()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, RevenueFake.Code("SONO1", 2, 5000m, missing: 1));
        var code = Assert.Single(CodesOf(db));
        Assert.Null(code.Amount);
        Assert.Equal(2L, code.Count);
    }

    [Fact(DisplayName = "AC-003.5 앞뒤 공백을 뺀 뒤 같은 코드는 합친다(건수·금액 더함, 이름은 첫 줄 것)")]
    public void MergesSameCodeAfterTrim()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db,
            RevenueFake.Code("도수", 2, 1000.9m, name: "도수치료"),
            RevenueFake.Code("도수 ", 3, 2000.9m, name: "다른 이름"));
        var code = Assert.Single(CodesOf(db));

        Assert.Equal("도수", code.Code);
        Assert.Equal(5L, code.Count);
        Assert.Equal(3000L, code.Amount);
        Assert.Equal("도수치료", code.Name);
    }

    [Fact(DisplayName = "AC-003.5 합칠 때 금액이 하나라도 null이면 null")]
    public void MergeWithMissingAmountIsNull()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db,
            RevenueFake.Code("도수", 2, 1000m),
            RevenueFake.Code(" 도수", 3, null, missing: 1));
        var code = Assert.Single(CodesOf(db));
        Assert.Equal(5L, code.Count);
        Assert.Null(code.Amount);
    }

    [Fact(DisplayName = "AC-003.5 모양이 틀린 코드는 이름 없는 한 줄 _REST로 합치고 실패하지 않는다")]
    public void BadShapesGoToRest()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db,
            RevenueFake.Code("A B", 1, 100m, name: "이름1"),
            RevenueFake.Code("X!", 2, 200m, name: "이름2"),
            RevenueFake.Code(new string('C', 31), 3, 300m),
            RevenueFake.Code("A\nB", 4, 400m),
            RevenueFake.Code("", 5, 500m),
            RevenueFake.Code(null, 6, 600m),
            RevenueFake.Code("_REST", 7, 700m, name: "진짜로 이런 코드"),
            RevenueFake.Code("OK-1", 1, 1m, name: "맞는 코드"),
            RevenueFake.Code(new string('가', 30), 1, 2m));
        var codes = CodesOf(db);

        Assert.Equal(new[] { new string('가', 30), "OK-1", "_REST" }, codes.Select(code => code.Code));
        var rest = codes[2];
        Assert.Null(rest.Name);
        Assert.Equal(28L, rest.Count);
        Assert.Equal(2800L, rest.Amount);
    }

    [Fact(DisplayName = "AC-003.5 코드 999개까지는 _REST가 없다")]
    public void NoRestUpTo999()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, Enumerable.Range(1, 999).Select(i => RevenueFake.Code("C" + i, 1, i)).ToArray());
        var codes = CodesOf(db);
        Assert.Equal(999, codes.Length);
        Assert.DoesNotContain(codes, code => code.Code == "_REST");
    }

    [Fact(DisplayName = "AC-003.5 코드 1,001개면 금액 순 999개 + _REST 한 줄로 1,000개 이하, 중복 없음, 실패하지 않음")]
    public void CutsAfter999ByAmount()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, Enumerable.Range(1, 1001).Select(i => RevenueFake.Code("C" + i, 2, i * 10m)).ToArray());
        var codes = CodesOf(db);

        Assert.Equal(1000, codes.Length);
        Assert.Equal(1000, codes.Select(code => code.Code).Distinct().Count());
        Assert.Equal("C1001", codes[0].Code);
        Assert.Equal("C3", codes[998].Code);
        Assert.Equal("_REST", codes[999].Code);
        Assert.Null(codes[999].Name);
        Assert.Equal(4L, codes[999].Count);
        Assert.Equal(30L, codes[999].Amount);
    }

    [Fact(DisplayName = "AC-003.5 금액 null은 맨 뒤라서 먼저 _REST로 가고, _REST 금액도 null이 된다")]
    public void NullAmountSortsLast()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        var rows = Enumerable.Range(1, 1000).Select(i => RevenueFake.Code("C" + i, 1, i)).ToList();
        rows.Insert(0, RevenueFake.Code("NOAMOUNT", 5, null, missing: 1));
        RevenueFake.Codes(db, rows.ToArray());
        var codes = CodesOf(db);

        Assert.Equal(1000, codes.Length);
        Assert.DoesNotContain(codes, code => code.Code == "NOAMOUNT" || code.Code == "C1");
        var rest = codes.Single(code => code.Code == "_REST");
        Assert.Equal(6L, rest.Count);
        Assert.Null(rest.Amount);
    }

    [Fact(DisplayName = "AC-003.5 웹이 받지 못하는 금액(음수·안전한 정수 넘음)은 그 코드만 amount null이고 한 달이 실패하지 않는다")]
    public void UnrepresentableAmountIsNull()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db,
            RevenueFake.Code("MINUS", 1, -100m),
            RevenueFake.Code("HUGE", 1, 9007199254740992m),
            RevenueFake.Code("MOST", 1, 9007199254740991m),
            RevenueFake.Code("SUM", 1, 9007199254740991m),
            RevenueFake.Code("SUM ", 1, 1m),
            RevenueFake.Code("TINY", 1, -0.5m));
        var codes = CodesOf(db).ToDictionary(code => code.Code);

        Assert.Null(codes["MINUS"].Amount);
        Assert.Null(codes["HUGE"].Amount);
        Assert.Equal(9007199254740991L, codes["MOST"].Amount);
        Assert.Null(codes["SUM"].Amount);
        Assert.Equal(0L, codes["TINY"].Amount);
    }

    public static IEnumerable<object?[]> Names()
    {
        yield return new object?[] { "  도수치료  ", "도수치료" };
        yield return new object?[] { "도수\r\n치료", "도수 치료" };
        yield return new object?[] { "도수\n\n치료", "도수 치료" };
        yield return new object?[] { "\n도수\t", "도수" };
        yield return new object?[] { "도\u0000수", "도 수" };
        yield return new object?[] { "도\u001F수", "도 수" };
        yield return new object?[] { "도\u007F수", "도 수" };
        yield return new object?[] { "도\u0085수", "도 수" };
        yield return new object?[] { "도\u009F수", "도 수" };
        yield return new object?[] { "도\u2028수", "도 수" };
        yield return new object?[] { "도\u2029수", "도 수" };
        yield return new object?[] { "   ", null };
        yield return new object?[] { "\n\t\u0085", null };
        yield return new object?[] { "", null };
        yield return new object?[] { null, null };
        yield return new object?[] { new string('가', 100), new string('가', 100) };
        yield return new object?[] { new string('가', 101), new string('가', 100) };
        yield return new object?[] { new string('가', 99) + " 나나", new string('가', 99) };
    }

    [Theory(DisplayName = "AC-003.5 처방 이름: 앞뒤 공백을 빼고 줄바꿈·제어 문자를 빈칸 하나로, 100자까지, 비면 null")]
    [MemberData(nameof(Names))]
    public void CleansNames(string? raw, string? expected)
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, RevenueFake.Code("CODE", 1, 1m, name: raw));
        Assert.Equal(expected, Assert.Single(CodesOf(db)).Name);
    }

    [Fact(DisplayName = "AC-003.5 처방 이름을 자를 때 글자(대리쌍)를 쪼개지 않고, 짝 없는 대리쌍은 답에 남기지 않는다")]
    public void NamesKeepValidUnicode()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, RevenueFake.Code("CUT", 1, 2m, name: new string('가', 99) + "\U0001F600"), RevenueFake.Code("LONE", 1, 1m, name: "도수\uD83D"));
        var codes = CodesOf(db);

        Assert.Equal(new string('가', 99), codes[0].Name);
        Assert.Equal("도수", codes[1].Name);
    }

    // ---- AC-003.6 실패 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.6 둘째 날 읽기가 실패하면 일부를 돌려주지 않고 E-BIT-READ-FAILED")]
    public void SecondDayFailureThrows()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        db.Answer(RevenueSql.Patients, args =>
            (string)args["@from"]! == "202610310000" ? throw new BitException(BitErrors.ReadFailed) : new[] { new object?[] { 10L, 3L, 0L, 0L, 0L } });

        var error = Assert.Throws<BitException>(() => Read(db, First, Last));
        Assert.Equal("E-BIT-READ-FAILED", error.Code);
        Assert.DoesNotContain(db.Calls, call => call.Sql == RevenueSql.CodeAmounts);
    }

    [Fact(DisplayName = "AC-003.6 마지막 CodeAmounts가 실패해도 답이 없다")]
    public void CodeFailureThrows()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        db.Fail(RevenueSql.CodeAmounts, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, Last)).Code);
    }

    public static IEnumerable<object?[]> BrokenAnswers()
    {
        yield return new object?[] { "칸 모자람", RevenueSql.FinanceNormal, new[] { new object?[] { 1m, 2m, 3m } } };
        yield return new object?[] { "줄 없음", RevenueSql.Patients, new object?[0][] };
        yield return new object?[] { "줄 둘", RevenueSql.FinanceReceivable, new[] { new object?[] { 1m, 1m, 1m, 1m, 1m, 1m }, new object?[] { 1m, 1m, 1m, 1m, 1m, 1m } } };
        yield return new object?[] { "숫자 아님", RevenueSql.FinanceNormal, new[] { new object?[] { "not a number", 2m, 3m, 4m, 5m, 6m } } };
        yield return new object?[] { "너무 큼", RevenueSql.FinanceNormal, new[] { new object?[] { 9007199254740992m, 2m, 3m, 4m, 5m, 6m } } };
        yield return new object?[] { "나눔 칸 너무 큼(공단)", RevenueSql.FinanceNormal, new[] { new object?[] { 1m, 9007199254740992m, 3m, 4m, 5m, 6m } } };
        yield return new object?[] { "나눔 칸 너무 큼(본인부담)", RevenueSql.FinanceNormalExtra, new[] { new object?[] { 1m, 9007199254740992m } } };
        yield return new object?[] { "건수 숫자 아님", RevenueSql.Patients, new[] { new object?[] { "x", 3L, 0L, 0L, 0L } } };
        yield return new object?[] { "코드 칸 모자람", RevenueSql.CodeAmounts, new[] { new object?[] { "C1", 1L } } };
    }

    [Theory(DisplayName = "AC-003.6 답의 모양이 틀리면 도우미가 죽지 않고 E-BIT-READ-FAILED")]
    [MemberData(nameof(BrokenAnswers))]
    public void BrokenAnswerIsReadFailed(string what, string sql, object?[][] rows)
    {
        Assert.NotEmpty(what);
        var db = RevenueFake.Quiet(new FakeDb());
        db.Answer(sql, _ => rows);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, First)).Code);
    }

    [Fact(DisplayName = "AC-003.6 to < from이거나 31일을 넘으면 DB를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    public void BadPeriodNeverReachesDb()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.ThrowsAny<HelperException>(() => Read(db, Last, First)).Code);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.ThrowsAny<HelperException>(() => Read(db, "2026-10-01", "2026-11-01")).Code);
        Assert.Empty(db.Calls);

        Assert.Equal(31, Read(db, "2026-10-01", "2026-10-31").Days.Count);
    }

    [Theory(DisplayName = "AC-003.6 to가 9999-12-31이면 다음 날을 셀 수 없어 읽기 문장을 부르지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("9999-12-31", "9999-12-31")]
    [InlineData("9999-12-01", "9999-12-31")]
    public void LastDateNeverReachesDb(string from, string to)
    {
        var db = RevenueFake.Quiet(new FakeDb());
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.ThrowsAny<HelperException>(() => Read(db, from, to)).Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-003.6 to가 9999-12-30이면 다음 날을 셀 수 있으므로 막지 않는다")]
    public void DayBeforeLastDateStillReads()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        Assert.Equal("9999-12-30", Assert.Single(Read(db, "9999-12-30", "9999-12-30").Days).Date);
        var codes = Assert.Single(db.Calls, call => call.Sql == RevenueSql.CodeAmounts);
        Assert.Equal("999912310000", codes.Args["@to"]);
    }

    // ---- AC-4101 날마다 처방별 금액(dayCodes) ---------------------------------------------------------

    /// <summary>dayCodes 한 줄을 글자로: 날짜|코드|건수|금액(null은 "null").</summary>
    private static string Line(object?[] row) =>
        string.Join("|", row.Select(cell => cell == null ? "null" : Convert.ToString(cell, CultureInfo.InvariantCulture)));

    private static string[] DayLines(FakeDb db, string from = First, string to = Last) => Read(db, from, to).DayCodes.Select(Line).ToArray();

    private static string CodeOf(object?[] row) => (string)row[1]!;

    private static string Json(object value) => System.Text.Json.JsonSerializer.Serialize(value);

    [Fact(DisplayName = "AC-4101.2 AC-6912.1 CodeAmountsByDay는 기간에 한 번만: @from = 첫날 0000, @to = 끝날 다음 날 0000, @hospital 셋뿐이고 날마다 문장은 5개")]
    public void ReadsDayCodesOncePerPeriod()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        Read(db, First, Last);

        var call = Assert.Single(db.Calls, c => c.Sql == RevenueSql.CodeAmountsByDay);
        Assert.Equal(3, call.Args.Count);
        Assert.Equal("202610300000", call.Args["@from"]);
        Assert.Equal("202611020000", call.Args["@to"]);
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(TimeSpan.FromSeconds(90), call.Timeout);
        foreach (var next in new[] { "20261031", "20261101", "20261102" }) Assert.Equal(5, RevenueFake.CallsOn(db, next).Count);

        var month = RevenueFake.Quiet(new FakeDb());
        Read(month, "2026-10-01", "2026-10-31");
        var monthCall = Assert.Single(month.Calls, c => c.Sql == RevenueSql.CodeAmountsByDay);
        Assert.Equal("202610010000", monthCall.Args["@from"]);
        Assert.Equal("202611010000", monthCall.Args["@to"]);
    }

    [Fact(DisplayName = "AC-4101.1 답은 days·codes·dayCodes이고 days·codes는 날 단위 줄이 있어도 지금과 같다")]
    public void DayCodesLeaveDaysAndCodesAlone()
    {
        var plain = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(plain, RevenueFake.Code("CARM1", 4, 12345.67m, name: "씨암"));
        var withDayCodes = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(withDayCodes, RevenueFake.Code("CARM1", 4, 12345.67m, name: "씨암"));
        RevenueFake.DayCodes(withDayCodes,
            RevenueFake.DayCode("20261030", "CARM1", 3, 10000.67m),
            RevenueFake.DayCode("20261031", "CARM1", 1, 2345m));

        var before = Read(plain, First, Last);
        var after = Read(withDayCodes, First, Last);

        Assert.Empty(before.DayCodes);
        Assert.Equal(new[] { "2026-10-30|CARM1|3|10000", "2026-10-31|CARM1|1|2345" }, after.DayCodes.Select(Line));
        Assert.Equal(Json(before.Days), Json(after.Days));
        Assert.Equal(Json(before.Codes), Json(after.Codes));
    }

    [Fact(DisplayName = "AC-4101.1 dayCodes 줄은 [날짜 YYYY-MM-DD, 코드, 건수, 금액]이고 날짜 차례·같은 날은 코드 글자(Ordinal) 차례다(DB 답 차례·금액 차례와 상관없이)")]
    public void DayCodesAreOrderedByDateThenCode()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db,
            RevenueFake.DayCode("20261101", "MM101", 1, 500m),
            RevenueFake.DayCode("20261030", "도수", 2, 90000m),
            RevenueFake.DayCode("20261030", "MM101", 3, 45000m),
            RevenueFake.DayCode("20261031", "a1", 1, 10m),
            RevenueFake.DayCode("20261030", "9X", 1, 1m),
            RevenueFake.DayCode("20261030", "CARM1", 5, 120000m),
            RevenueFake.DayCode("20261030", "a1", 4, 4000m));
        var rows = Read(db, First, Last).DayCodes;

        Assert.Equal(new[]
        {
            "2026-10-30|9X|1|1",
            "2026-10-30|CARM1|5|120000",
            "2026-10-30|MM101|3|45000",
            "2026-10-30|a1|4|4000",
            "2026-10-30|도수|2|90000",
            "2026-10-31|a1|1|10",
            "2026-11-01|MM101|1|500",
        }, rows.Select(Line));
        Assert.All(rows, row =>
        {
            Assert.Equal(4, row.Length);
            Assert.IsType<string>(row[0]);
            Assert.IsType<string>(row[1]);
            Assert.IsType<long>(row[2]);
            Assert.IsType<long>(row[3]);
        });
    }

    [Fact(DisplayName = "AC-4101.3 앞뒤 공백을 뺀 같은 코드는 그날 한 줄로 합친다(건수 합, 금액은 합친 값에서 원 미만 버림), 다른 날의 같은 코드는 따로")]
    public void MergesSameCodeWithinDay()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db,
            RevenueFake.DayCode("20261030", "도수", 2, 1000.6m),
            RevenueFake.DayCode("20261030", " 도수 ", 3, 2000.6m),
            RevenueFake.DayCode("20261031", "도수", 1, 10.9m));
        Assert.Equal(new[] { "2026-10-30|도수|5|3001", "2026-10-31|도수|1|10" }, DayLines(db));
    }

    [Fact(DisplayName = "AC-4101.3 모양이 틀린 코드·_REST는 그날의 _REST 한 줄로 합친다(날마다 따로, 실패하지 않음)")]
    public void BadShapesGoToThatDaysRest()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db,
            RevenueFake.DayCode("20261030", "A B", 1, 100m),
            RevenueFake.DayCode("20261030", "X!", 2, 200m),
            RevenueFake.DayCode("20261030", new string('C', 31), 3, 300m),
            RevenueFake.DayCode("20261030", "A\nB", 4, 400m),
            RevenueFake.DayCode("20261030", "", 5, 500m),
            RevenueFake.DayCode("20261030", null, 6, 600m),
            RevenueFake.DayCode("20261030", "_REST", 7, 700m),
            RevenueFake.DayCode("20261030", "OK-1", 1, 1m),
            RevenueFake.DayCode("20261030", new string('가', 30), 1, 2m),
            RevenueFake.DayCode("20261031", "X!", 2, 50.5m),
            RevenueFake.DayCode("20261031", "Y?", 2, 50.5m));

        Assert.Equal(new[]
        {
            "2026-10-30|OK-1|1|1",
            "2026-10-30|_REST|28|2800",
            "2026-10-30|" + new string('가', 30) + "|1|2",
            "2026-10-31|_REST|4|101",
        }, DayLines(db));
    }

    [Fact(DisplayName = "AC-4101.3 하루 300개까지는 _REST 없이 300줄 그대로")]
    public void NoDayRestUpTo300()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db, Enumerable.Range(1, 300).Select(i => RevenueFake.DayCode("20261030", "C" + i, 1, i)).ToArray());
        var rows = Read(db, First, First).DayCodes;

        Assert.Equal(300, rows.Count);
        Assert.DoesNotContain(rows, row => CodeOf(row) == "_REST");
    }

    [Fact(DisplayName = "AC-4101.3 하루 301개면 금액 큰 차례 299개 + 그날 _REST 한 줄로 300줄, 중복 없음, 다른 날은 그대로")]
    public void CutsDayAfter299ByAmount()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        var input = Enumerable.Range(1, 301).Select(i => RevenueFake.DayCode("20261030", "C" + i, 2, i * 10m)).ToList();
        input.Add(RevenueFake.DayCode("20261031", "C1", 1, 5m));
        RevenueFake.DayCodes(db, input.ToArray());
        var rows = Read(db, First, Middle).DayCodes;
        var first = rows.Where(row => (string)row[0]! == First).ToArray();

        Assert.Equal(300, first.Length);
        Assert.Equal(300, first.Select(CodeOf).Distinct().Count());
        Assert.DoesNotContain(first, row => CodeOf(row) == "C1" || CodeOf(row) == "C2");
        Assert.Contains(first, row => CodeOf(row) == "C3");
        Assert.Equal("2026-10-30|_REST|4|30", Line(first.Single(row => CodeOf(row) == "_REST")));
        Assert.Equal(new[] { "2026-10-31|C1|1|5" }, rows.Where(row => (string)row[0]! == Middle).Select(Line));
    }

    [Fact(DisplayName = "AC-4101.3 금액 null은 맨 뒤라서 먼저 그날 _REST로 가고, 그 _REST 금액도 null")]
    public void NullDayAmountGoesToRestFirst()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        var input = Enumerable.Range(1, 300).Select(i => RevenueFake.DayCode("20261030", "C" + i, 1, i)).ToList();
        input.Insert(0, RevenueFake.DayCode("20261030", "NOAMOUNT", 5, 99999m, missing: 1));
        RevenueFake.DayCodes(db, input.ToArray());
        var rows = Read(db, First, First).DayCodes;

        Assert.Equal(300, rows.Count);
        Assert.DoesNotContain(rows, row => CodeOf(row) == "NOAMOUNT" || CodeOf(row) == "C1");
        Assert.Equal("2026-10-30|_REST|6|null", Line(rows.Single(row => CodeOf(row) == "_REST")));
    }

    [Fact(DisplayName = "AC-4101.3 값이 빠진 줄(MissingValues ≠ 0)이 섞인 그날 그 코드의 금액은 null, 건수는 그대로 더함")]
    public void MissingValuesNullDayAmount()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db,
            RevenueFake.DayCode("20261030", "SONO1", 2, 5000m, missing: 1),
            RevenueFake.DayCode("20261030", "도수", 1, 100m),
            RevenueFake.DayCode("20261030", "도수 ", 2, 100m, missing: 1),
            RevenueFake.DayCode("20261031", "도수", 1, 100m));
        Assert.Equal(new[] { "2026-10-30|SONO1|2|null", "2026-10-30|도수|3|null", "2026-10-31|도수|1|100" }, DayLines(db));
    }

    [Fact(DisplayName = "AC-4101.3 웹이 받지 못하는 금액(음수·안전한 정수 넘음)은 그 줄만 null이고 실패하지 않는다, -0.5는 0")]
    public void UnrepresentableDayAmountIsNull()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db,
            RevenueFake.DayCode("20261030", "MINUS", 1, -100m),
            RevenueFake.DayCode("20261030", "HUGE", 1, 9007199254740992m),
            RevenueFake.DayCode("20261030", "MOST", 1, 9007199254740991m),
            RevenueFake.DayCode("20261030", "TINY", 1, -0.5m));
        Assert.Equal(
            new[] { "2026-10-30|HUGE|1|null", "2026-10-30|MINUS|1|null", "2026-10-30|MOST|1|9007199254740991", "2026-10-30|TINY|1|0" },
            DayLines(db, First, First));
    }

    [Fact(DisplayName = "AC-4101.3 31일 모두 하루 301개여도 dayCodes는 하루 300줄·모두 9,300줄(= 31 × 300)을 넘지 않는다")]
    public void DayCodesStayWithinLimits()
    {
        Assert.Equal(300, RevenueDays.MaxDayCodesPerDay);
        Assert.Equal(9300, RevenueDays.MaxDays * RevenueDays.MaxDayCodesPerDay);

        var db = RevenueFake.Quiet(new FakeDb());
        var start = D("2026-10-01");
        RevenueFake.DayCodes(db, Enumerable.Range(0, 31)
            .SelectMany(d => Enumerable.Range(1, 301).Select(i => RevenueFake.DayCode(start.AddDays(d).ToString("yyyyMMdd", CultureInfo.InvariantCulture), "C" + i, 1, i)))
            .ToArray());
        var rows = Read(db, "2026-10-01", "2026-10-31").DayCodes;

        Assert.Equal(9300, rows.Count);
        Assert.Equal(31, rows.Select(row => (string)row[0]!).Distinct().Count());
        Assert.All(rows.GroupBy(row => (string)row[0]!), day => Assert.Equal(300, day.Count()));
    }

    public static IEnumerable<object?[]> BadDays()
    {
        yield return new object?[] { "첫날 앞", "20261029" };
        yield return new object?[] { "끝날 뒤", "20261102" };
        yield return new object?[] { "7자", "2026103" };
        yield return new object?[] { "줄 그은 모양", "2026-10-30" };
        yield return new object?[] { "없는 날", "20261032" };
        yield return new object?[] { "빈칸 붙음", "20261030 " };
        yield return new object?[] { "NULL", null };
        yield return new object?[] { "글자 아님", 20261030L };
    }

    [Theory(DisplayName = "AC-4101.3 AC-4101.4 날 글자가 yyyyMMdd가 아니거나 기간 밖이면 일부만 답하지 않고 E-BIT-READ-FAILED")]
    [MemberData(nameof(BadDays))]
    public void BadDayIsReadFailed(string what, object? day)
    {
        Assert.NotEmpty(what);
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db, RevenueFake.DayCode("20261030", "OK", 1, 1m), RevenueFake.DayCode(day, "MM101", 1, 1m));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, Last)).Code);
    }

    [Fact(DisplayName = "AC-4101.4 CodeAmountsByDay가 실패하면 days·codes도 돌려주지 않고 E-BIT-READ-FAILED 하나")]
    public void DayCodesFailureThrows()
    {
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.Codes(db, RevenueFake.Code("CARM1", 1, 1m));
        db.Fail(RevenueSql.CodeAmountsByDay, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, Last)).Code);
        Assert.Single(db.Calls, call => call.Sql == RevenueSql.CodeAmountsByDay);
    }

    public static IEnumerable<object?[]> BrokenDayAnswers()
    {
        yield return new object?[] { "칸 모자람", new[] { new object?[] { "20261030", "C1", 1L, 1m } } };
        yield return new object?[] { "건수 숫자 아님", new[] { new object?[] { "20261030", "C1", "x", 1m, 0L } } };
        yield return new object?[] { "금액 숫자 아님", new[] { new object?[] { "20261030", "C1", 1L, "not a number", 0L } } };
        yield return new object?[] { "빠진 값 수 숫자 아님", new[] { new object?[] { "20261030", "C1", 1L, 1m, "x" } } };
    }

    [Theory(DisplayName = "AC-4101.4 날 단위 답의 모양이 틀리면 도우미가 죽지 않고 E-BIT-READ-FAILED")]
    [MemberData(nameof(BrokenDayAnswers))]
    public void BrokenDayAnswerIsReadFailed(string what, object?[][] rows)
    {
        Assert.NotEmpty(what);
        var db = RevenueFake.Quiet(new FakeDb());
        RevenueFake.DayCodes(db, rows);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db, First, First)).Code);
    }
}
