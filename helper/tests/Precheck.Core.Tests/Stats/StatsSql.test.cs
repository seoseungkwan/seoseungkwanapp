using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.Stats;

/// <summary>
/// AC-503.2 통계 SQL(StatsSql)은 원본 문장 사본(original-sql/*.sql)과 공백만 다르다. 진료 줄 SQL만 원본 RowsSql에서
/// 처방 코드 거르기 한 덩어리를 뺐다. 모두 매개변수를 받는 SELECT이고 ReadOnlyGuard를 지난다. 청구 Sql.All은 그대로다.
/// </summary>
public class StatsSqlTests
{
    /// <summary>original-sql 사본 이름 → StatsSql 상수(진료 줄은 따로 견준다).</summary>
    private static readonly Dictionary<string, string> Originals = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["rx-visit-split-summary.sql"] = StatsSql.VisitSummarySql,
        ["rx-visit-split-days.sql"] = StatsSql.VisitDaysSql,
        ["trend-code-names.sql"] = StatsSql.CodeNamesSql,
        ["report-history-guard.sql"] = StatsSql.HistoryGuardSql,
    };

    private const string RowsOriginal = "rx-visit-split-visits-rows.sql";

    // 원본 RowsSql에서 빼는 한 덩어리의 처음과 끝(공백을 한 칸으로 줄인 글 기준)
    private const string BlockStart = "AND (UPPER(RTRIM(o.OdrCod)) IN (@c0,";
    private const string BlockEnd = "OR (@eswt=1 AND CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0))";

    private static readonly string[] Constants =
    {
        StatsSql.VisitRowsSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql, StatsSql.HistoryGuardSql,
    };

    private static string OriginalDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "Stats", "original-sql");
            if (Directory.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Stats/original-sql 폴더를 찾지 못했다");
    }

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string NoSpace(string sql) => Regex.Replace(sql, @"\s+", "");

    private static string ReadOriginal(string file) =>
        string.Join("\n", File.ReadAllLines(Path.Combine(OriginalDirectory(), file)).Where(line => !line.TrimStart().StartsWith("--", StringComparison.Ordinal)));

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    private static Dictionary<string, object?> Args(params (string Name, object? Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Name, pair => pair.Value);

    private static Dictionary<string, object?> VisitArgs() =>
        Args(("@from", "202609010000"), ("@to", "202610010000"), ("@hospital", "SYNTHETIC"));

    private static Dictionary<string, object?> CodeArgs() =>
        Args(("@from", "20260901"), ("@to", "20260930"), ("@priorFrom", "20260901"), ("@priorTo", "20260930"));

    [Fact(DisplayName = "AC-503.2 기간 합계·날짜별·처방 이름·과거 자료 확인 SQL은 원본 사본과 공백만 다르다")]
    public void ConstantsMatchOriginalCopies()
    {
        var files = Directory.GetFiles(OriginalDirectory(), "*.sql").Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.Equal(Originals.Keys.Append(RowsOriginal).OrderBy(name => name, StringComparer.Ordinal).ToArray(), files);
        foreach (var pair in Originals) Assert.Equal(Squash(ReadOriginal(pair.Key)), Squash(pair.Value));
    }

    [Fact(DisplayName = "AC-503.2 진료 줄 SQL은 원본 Visits + RowsSql에서 처방 코드 거르기 한 덩어리만 뺀 글이다")]
    public void VisitRowsIsOriginalWithoutCodeFilter()
    {
        var original = Squash(ReadOriginal(RowsOriginal));
        Assert.Equal(1, Count(original, BlockStart));
        Assert.Equal(1, Count(original, BlockEnd));

        var start = original.IndexOf(BlockStart, StringComparison.Ordinal);
        var end = original.IndexOf(BlockEnd, start, StringComparison.Ordinal) + BlockEnd.Length;
        var block = original.Substring(start, end - start);
        var expectedBlock = "AND (UPPER(RTRIM(o.OdrCod)) IN (" + string.Join(",", Enumerable.Range(0, 100).Select(i => "@c" + i)) + ")"
            + " OR (@eswt=1 AND CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0))";
        Assert.Equal(NoSpace(expectedBlock), NoSpace(block));

        Assert.Equal(Squash(original.Remove(start, end - start)), Squash(StatsSql.VisitRowsSql));
        Assert.DoesNotContain("@c0", StatsSql.VisitRowsSql);
        Assert.DoesNotContain("@eswt", StatsSql.VisitRowsSql);
    }

    [Fact(DisplayName = "AC-503.2 통계 SQL은 모두 SELECT 하나뿐(; · 주석 · 쓰기·실행 낱말 없음)이고 환자 신상 표를 읽지 않는다")]
    public void StatementsAreSingleSelects()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        var readable = new HashSet<string>(StringComparer.Ordinal) { "dbo.OcmInf", "dbo.OdrInf", "dbo.DepMst", "dbo.SeeMst" };
        Assert.Equal(Constants.OrderBy(sql => sql, StringComparer.Ordinal), StatsSql.All.OrderBy(sql => sql, StringComparer.Ordinal));
        foreach (var sql in StatsSql.All)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal), "SELECT 또는 WITH … SELECT");
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotMatch(forbidden, sql);
            // 읽는 표는 내원·처방·진료과·처방 목록뿐(이름·전화·주민번호·주소가 있는 환자 표를 읽지 않는다)
            foreach (Match table in Regex.Matches(sql, @"dbo\.[A-Za-z]+")) Assert.Contains(table.Value, readable);
        }
    }

    [Fact(DisplayName = "AC-503.2 매개변수 표: 진료 SQL은 @from·@to Char(12)·@hospital VarChar(32), 처방 이름은 Char(8) 넷, 과거 자료 확인은 없음")]
    public void ParameterTables()
    {
        string Shape(string sql) => string.Join(" ", StatsSql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

        foreach (var sql in new[] { StatsSql.VisitRowsSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql })
        {
            Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(sql));
        }
        Assert.Equal("@from:Char(8) @to:Char(8) @priorFrom:Char(8) @priorTo:Char(8)", Shape(StatsSql.CodeNamesSql));
        Assert.Equal("", Shape(StatsSql.HistoryGuardSql));

        // 문장에 나오는 @이름 = 매개변수 표의 이름
        foreach (var sql in StatsSql.All)
        {
            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(StatsSql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), used);
        }

        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => StatsSql.ParametersOf(Sql.ScopesSql)).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => StatsSql.ParametersOf(StatsSql.VisitRowsSql + " ")).Code);
        Assert.False(StatsSql.IsAllowed(null));
        Assert.False(StatsSql.IsAllowed(Sql.ScopesSql));
    }

    [Fact(DisplayName = "AC-503.2 통계 SQL은 ReadOnlyGuard를 정해 둔 매개변수와 함께만 지나고, 청구 Sql.All에는 들어가지 않는다")]
    public void GuardAcceptsStatsSqlWithoutTouchingClaimList()
    {
        ReadOnlyGuard.Require(StatsSql.VisitRowsSql, VisitArgs());
        ReadOnlyGuard.Require(StatsSql.VisitSummarySql, VisitArgs());
        ReadOnlyGuard.Require(StatsSql.VisitDaysSql, VisitArgs());
        ReadOnlyGuard.Require(StatsSql.CodeNamesSql, CodeArgs());
        ReadOnlyGuard.Require(StatsSql.HistoryGuardSql, new Dictionary<string, object?>());
        foreach (var sql in StatsSql.All)
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.Same(StatsSql.ParametersOf(sql), Sql.ParametersOf(sql));
            Assert.DoesNotContain(sql, Sql.All);
        }

        // 원본에서 뺀 처방 코드 매개변수·고친 글·긴 값은 막는다
        var withCode = VisitArgs();
        withCode["@c0"] = "MM042";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.VisitRowsSql, withCode)).Code);
        var longScope = VisitArgs();
        longScope["@hospital"] = new string('S', 33);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.VisitRowsSql, longScope)).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.VisitRowsSql + " ", VisitArgs())).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.CodeNamesSql, VisitArgs())).Code);
    }
}
