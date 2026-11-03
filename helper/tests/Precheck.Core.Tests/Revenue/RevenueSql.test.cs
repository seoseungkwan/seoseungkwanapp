using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.BitReadSpeed;
using Xunit;

namespace Precheck.Core.Tests.Revenue;

/// <summary>
/// AC-1001.3 사본은 고치지 않는다. 첫 내원 연결 조건 글 하나(FirstVisitJoin)만 바꾼 사본과 견준다.
/// AC-003.1 원본 문장은 사본과 공백·끝 ;·-- 줄만 다르고, Extra 둘은 원본과 정해 둔 줄만 다르다.
/// AC-003.8 ReadOnlyGuard는 매출 문장 10개를 정해 둔 매개변수와 함께만 통과시킨다. 기존 Sql 상수·시험은 그대로.
/// </summary>
public class RevenueSqlTests
{
    private const string NormalEnd = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows";
    private const string ReceivableEnd = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows";
    private const string ExtraEnd = "SELECT SUM(OrpInsAmt),SUM(OrpInsOwn) FROM NativeRows";

    /// <summary>original-sql 사본 이름 → RevenueSql 상수.</summary>
    private static readonly Dictionary<string, string> Originals = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["history-guard.sql"] = RevenueSql.HistoryGuard,
        ["unsupported-finance.sql"] = RevenueSql.UnsupportedFinance,
        ["finance-multiplicity.sql"] = RevenueSql.FinanceMultiplicity,
        ["receivable-multiplicity.sql"] = RevenueSql.ReceivableMultiplicity,
        ["finance-normal.sql"] = RevenueSql.FinanceNormal,
        ["finance-receivable.sql"] = RevenueSql.FinanceReceivable,
        ["patients.sql"] = RevenueSql.Patients,
    };

    private static readonly string[] Ten = Originals.Values
        .Concat(new[] { RevenueSql.CodeAmounts, RevenueSql.FinanceNormalExtra, RevenueSql.FinanceReceivableExtra })
        .ToArray();

    private static string OriginalDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "Revenue", "original-sql");
            if (Directory.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Revenue/original-sql 폴더를 찾지 못했다");
    }

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim().TrimEnd(';').TrimEnd();

    private static string NoSpace(string sql) => Regex.Replace(sql, @"\s+", "");

    private static string ReadOriginal(string file) =>
        string.Join("\n", File.ReadAllLines(Path.Combine(OriginalDirectory(), file))
            .Where(line => !line.TrimStart().StartsWith("--", StringComparison.Ordinal)));

    private static Dictionary<string, object?> ValidArgs(string sql) =>
        RevenueSql.Parameters[sql].ToDictionary(
            parameter => parameter.Name,
            parameter => (object?)(parameter.Size == 8 ? "20261030" : parameter.Size == 12 ? "202610300000" : Synthetic.Scope));

    // ---- AC-003.1 사본 비교 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.1 AC-1001.3 원본 일곱 문장은 연결 조건 한 가지만 바꾼 사본(original-sql/*.sql)과 공백·끝 ;·-- 줄만 다르다")]
    public void OriginalsMatchCopies()
    {
        var files = Directory.GetFiles(OriginalDirectory(), "*.sql").Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.Equal(Originals.Keys.OrderBy(name => name, StringComparer.Ordinal).ToArray(), files);
        foreach (var pair in Originals) Assert.Equal(Squash(FirstVisitJoin.ApplyTo(pair.Key, ReadOriginal(pair.Key))), Squash(pair.Value));
    }

    [Fact(DisplayName = "AC-003.1 사본 맨 위에 출처 한 줄이 있다(원본 커밋 c66488e)")]
    public void CopiesNameTheirSource()
    {
        foreach (var file in Originals.Keys)
        {
            var head = File.ReadAllLines(Path.Combine(OriginalDirectory(), file))[0];
            Assert.StartsWith("-- 출처: ", head, StringComparison.Ordinal);
            Assert.Contains("c66488e", head, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-003.1 FinanceNormalExtra는 원본 FinanceNormal과 마지막 SELECT 줄만 다르다")]
    public void NormalExtraDiffersOnlyInLastLine()
    {
        var original = Squash(ReadOriginal("finance-normal.sql"));
        Assert.EndsWith(NormalEnd, original, StringComparison.Ordinal);
        Assert.Equal(original.Substring(0, original.Length - NormalEnd.Length) + ExtraEnd, Squash(RevenueSql.FinanceNormalExtra));
    }

    [Fact(DisplayName = "AC-003.1 FinanceReceivableExtra는 원본 FinanceReceivable과 마지막 SELECT 줄·NativeRows 칸(p.OrpInsAmt,p.OrpInsOwn)만 다르다")]
    public void ReceivableExtraDiffersOnlyInLastLineAndColumns()
    {
        var original = Squash(ReadOriginal("finance-receivable.sql"));
        const string Columns = "p.OrpNonAmt, r.AllCorAmt";
        Assert.EndsWith(ReceivableEnd, original, StringComparison.Ordinal);
        Assert.Single(Regex.Matches(original, Regex.Escape(Columns)).Cast<Match>());

        var expected = original.Substring(0, original.Length - ReceivableEnd.Length).Replace(Columns, "p.OrpNonAmt, p.OrpInsAmt,p.OrpInsOwn, r.AllCorAmt") + ExtraEnd;
        Assert.Equal(expected, Squash(RevenueSql.FinanceReceivableExtra));
    }

    /// <summary>
    /// 문장 글자만 본다. 상태 코드의 뜻은 저장소에 적혀 있지 않아 접수취소가 빠진다는 증명이 아니다(증명은 의원 PC 확인표 ②, design.md 2절 5).
    /// 입원 쪽 줄(FirstVisits)에 VC·CN·CR이 있으므로 문장 전체가 아니라 PeriodVisits 안만 본다.
    /// </summary>
    [Fact(DisplayName = "AC-003.4 RevenueSql.Patients의 PeriodVisits에 세 조건이 있고, 허용 목록은 WN·HN·TN·PN뿐이라 VC·CN·CR이 없다")]
    public void PeriodVisitsPinsThreeConditions()
    {
        var sql = Squash(RevenueSql.Patients);
        const string Open = "WITH PeriodVisits AS (";
        var end = sql.IndexOf("), Patients AS (", StringComparison.Ordinal);
        Assert.StartsWith(Open, sql, StringComparison.Ordinal);
        Assert.True(end > Open.Length);
        var periodVisits = sql.Substring(Open.Length, end - Open.Length);

        Assert.Contains("c.OcmPatTyp='O'", periodVisits, StringComparison.Ordinal);
        Assert.Contains("c.OcmComStt IN ('WN','HN','TN','PN')", periodVisits, StringComparison.Ordinal);
        Assert.Contains("c.OcmRsuYon<>'O'", periodVisits, StringComparison.Ordinal);

        var allowed = Assert.Single(Regex.Matches(periodVisits, @"OcmComStt\s+(?:NOT\s+)?IN\s*\(([^)]*)\)").Cast<Match>()).Groups[1].Value;
        Assert.Equal(new[] { "'WN'", "'HN'", "'TN'", "'PN'" }, allowed.Split(','));
        foreach (var excluded in new[] { "VC", "CN", "CR" }) Assert.DoesNotContain(excluded, periodVisits, StringComparison.Ordinal);

        // 시험이 빈 곳을 보지 않는지: 입원 쪽 줄의 글자는 문장 전체에는 그대로 있다
        Assert.Contains("OcmComStt NOT IN ('VC','CN','CR')", sql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-003.4 RevenueSql.Patients의 첫째 칸은 PeriodVisits 줄 수다(DISTINCT 없음, 같은 사람의 여러 접수는 여러 건)")]
    public void FirstColumnCountsPeriodVisitRows()
    {
        var sql = Squash(RevenueSql.Patients);
        Assert.Contains(") SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits), (SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from),", sql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-003.5 CodeAmounts는 원본 TrendDataSource 금액 식(일수 × 수량 × 단가, MissingValues)과 SeeMst 이름을 쓴다")]
    public void CodeAmountsUsesOriginalFormula()
    {
        var sql = NoSpace(RevenueSql.CodeAmounts);
        Assert.Contains(NoSpace("CAST(SUM(CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc) AS decimal(28,5)) AS Amount"), sql, StringComparison.Ordinal);
        Assert.Contains(NoSpace("SUM(CASE WHEN o.OdrDay IS NULL OR o.OdrPrc IS NULL OR (CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END) IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS MissingValues"), sql, StringComparison.Ordinal);
        Assert.Contains(NoSpace("o.OdrDelFlg = 'N' AND o.OdrCanYon = 'N' AND o.OdrOspTyp = 'I' AND o.OdrOutCod <> '99'"), sql, StringComparison.Ordinal);
        Assert.Contains(NoSpace("(SELECT TOP 1 RTRIM(s.SeeKorNam) FROM dbo.SeeMst s WHERE RTRIM(s.SeeOdrCod) = c.Code ORDER BY s.SeeAdpDte DESC) AS Name"), sql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-003.7 새 문장은 차트번호 칸을 답으로 내지 않는다(합계·건수·처방 코드뿐)")]
    public void NewStatementsDoNotSelectCharts()
    {
        Assert.DoesNotContain("Cht", NoSpace(RevenueSql.CodeAmounts), StringComparison.Ordinal);
        Assert.EndsWith(ExtraEnd, Squash(RevenueSql.FinanceNormalExtra), StringComparison.Ordinal);
        Assert.EndsWith(ExtraEnd, Squash(RevenueSql.FinanceReceivableExtra), StringComparison.Ordinal);
    }

    // ---- AC-003.8 허용 목록 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-003.8 매출 문장은 10개이고 모두 읽기 문장 하나다(SELECT·WITH 시작, ;·주석·쓰기 낱말 없음)")]
    public void StatementsAreSingleReads()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.Equal(10, Ten.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(Ten.OrderBy(sql => sql, StringComparer.Ordinal), RevenueSql.Parameters.Keys.OrderBy(sql => sql, StringComparer.Ordinal));
        foreach (var sql in Ten)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
            Assert.DoesNotMatch(forbidden, sql);
        }
    }

    [Fact(DisplayName = "AC-003.8 매개변수 표 = 문장 속 @이름, 종류·길이는 @day·@nextDay Char 8, @from·@to Char 12, @hospital VarChar 32")]
    public void ParameterTableMatchesStatements()
    {
        var kinds = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["@day"] = "Char:8",
            ["@nextDay"] = "Char:8",
            ["@from"] = "Char:12",
            ["@to"] = "Char:12",
            ["@hospital"] = "VarChar:32",
        };
        foreach (var sql in Ten)
        {
            var named = Regex.Matches(sql, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(name => name, StringComparer.Ordinal);
            var declared = RevenueSql.Parameters[sql];
            Assert.Equal(named, declared.Select(p => p.Name).OrderBy(name => name, StringComparer.Ordinal));
            foreach (var parameter in declared) Assert.Equal(kinds[parameter.Name], parameter.Kind + ":" + parameter.Size);
        }
        Assert.Empty(RevenueSql.Parameters[RevenueSql.HistoryGuard]);
    }

    [Fact(DisplayName = "AC-003.8 ReadOnlyGuard는 매출 문장을 정해 둔 매개변수와 함께 통과시키고 표를 돌려준다")]
    public void GuardPassesRevenueStatements()
    {
        foreach (var sql in Ten)
        {
            Assert.True(Sql.IsAllowed(sql));
            ReadOnlyGuard.Require(sql);
            ReadOnlyGuard.Require(sql, ValidArgs(sql));
            Assert.Same(RevenueSql.Parameters[sql], Sql.ParametersOf(sql));
        }
    }

    public static IEnumerable<object?[]> BadStatements()
    {
        yield return new object?[] { RevenueSql.Patients + " " };
        yield return new object?[] { RevenueSql.CodeAmounts + "; DELETE FROM dbo.OdrInf" };
        yield return new object?[] { RevenueSql.Patients.ToLowerInvariant() };
        yield return new object?[] { RevenueSql.CodeAmounts.Replace("@hospital", "'SYNTHETIC'") };
    }

    [Theory(DisplayName = "AC-003.8 글자를 고친 매출 문장은 E-BIT-READ-FAILED로 막는다")]
    [MemberData(nameof(BadStatements))]
    public void GuardRefusesChangedStatements(string sql)
    {
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql)).Code);
    }

    [Fact(DisplayName = "AC-003.8 매개변수가 빠지거나·더해지거나·글자가 아니거나·길면 막는다")]
    public void GuardRefusesBadArguments()
    {
        foreach (var sql in Ten.Where(sql => RevenueSql.Parameters[sql].Length > 0))
        {
            var missing = ValidArgs(sql);
            missing.Remove(missing.Keys.First());
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, missing)).Code);

            var extra = ValidArgs(sql);
            extra["@daily"] = "1";
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);

            var notText = ValidArgs(sql);
            notText[notText.Keys.First()] = 20261030;
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, notText)).Code);

            var tooLong = ValidArgs(sql);
            tooLong[tooLong.Keys.First()] = new string('1', 33);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong)).Code);
        }
        var history = new Dictionary<string, object?> { ["@day"] = "20261030" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(RevenueSql.HistoryGuard, history)).Code);
    }

    [Fact(DisplayName = "AC-003.8 기존 Sql 상수는 그대로다(Sql.All은 원본 4개, 매출 문장은 끼지 않음)")]
    public void ExistingListUntouched()
    {
        Assert.Equal(
            new[] { Sql.UserScopeSql, Sql.ScopesSql, Sql.InstitutionSql, Sql.SnapshotStateSql }.OrderBy(sql => sql, StringComparer.Ordinal),
            Sql.All.OrderBy(sql => sql, StringComparer.Ordinal));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Sql.ParametersOf("SELECT 1")).Code);
    }
}
