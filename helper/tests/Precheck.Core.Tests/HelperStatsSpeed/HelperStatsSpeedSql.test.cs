using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.HelperStatsSpeed;

/// <summary>
/// AC-3401.3 원본 사본은 고치지 않는다. 두 사본(기간 합계·날짜별)의 첫 내원 잇기 글 하나만 해시 잇기로 바꾼 글과 견준다.
/// 다른 사본은 그대로 돌려준다(진료 줄 사본은 같은 글이 있지만 이번에 바꾸지 않는다).
/// </summary>
internal static class FirstVisitHash
{
    public const string OldJoin = "LEFT JOIN FirstVisits";
    public const string NewJoin = "LEFT HASH JOIN FirstVisits";

    private static readonly HashSet<string> ChangedCopies = new HashSet<string>(StringComparer.Ordinal)
    {
        "rx-visit-split-summary.sql",
        "rx-visit-split-days.sql",
    };

    public static string ApplyTo(string file, string original)
    {
        if (!ChangedCopies.Contains(file)) return original;
        Assert.Equal(1, Count(original, OldJoin));
        return original.Replace(OldJoin, NewJoin);
    }

    public static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }
}

/// <summary>
/// REQ-3401 기간이 긴 통계 읽기에서 세 문장(접수 줄·기간 합계·날짜별)은 첫 내원 표를 해시 잇기로 한 번만 만든다.
/// 이 서버 시험은 글자·매개변수만 본다. 속도와 결과가 같음은 의원 비트 DB 실측으로 봤다(design.md).
/// </summary>
public class HelperStatsSpeedSqlTests
{
    private const string VisitShape = "@from:Char(12) @to:Char(12) @hospital:VarChar(32)";
    private const string HashJoin = "LEFT HASH JOIN FirstVisits f ON f.PatientId=";

    private static readonly string[] HashedStatements =
    {
        StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql,
    };

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string Shape(IEnumerable<SqlParam> parameters) =>
        string.Join(" ", parameters.Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    private static bool HasHashWord(string sql) => Regex.IsMatch(sql, @"\bHASH\b", RegexOptions.IgnoreCase);

    [Fact(DisplayName = "AC-3401.1 세 문장에 해시 잇기 글이 정확히 한 번 있고 힌트 없는 잇기·OPTION·;·주석은 없다")]
    public void ThreeStatementsUseHashJoinOnce()
    {
        foreach (var sql in HashedStatements)
        {
            var text = Squash(sql);
            Assert.Equal(1, FirstVisitHash.Count(text, HashJoin));
            Assert.Equal(0, FirstVisitHash.Count(text, FirstVisitHash.OldJoin));
            Assert.DoesNotContain("OPTION", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(";", text);
            Assert.DoesNotContain("--", text);
        }
    }

    [Fact(DisplayName = "AC-3401.2 그 밖의 비트 문장(진료 줄·보고 Patients·접수·사람 줄·매출 Patients·청구 목록)에는 HASH 낱말이 없다")]
    public void OtherStatementsHaveNoHashWord()
    {
        var others = Sql.All.Concat(StatsSql.All).Concat(StatsSql.Sections).Concat(RevenueSql.Parameters.Keys)
            .Where(sql => !HashedStatements.Contains(sql)).Distinct().ToArray();
        foreach (var named in new[] { StatsSql.VisitRowsSql, StatsSql.PatientsSql, StatsSql.VisitLinesSql, StatsSql.PeopleSql, RevenueSql.Patients })
        {
            Assert.Contains(named, others);
        }
        foreach (var sql in others) Assert.False(HasHashWord(sql));
        foreach (var sql in HashedStatements) Assert.True(HasHashWord(sql));
    }

    [Fact(DisplayName = "AC-3401.4 세 문장의 매개변수 표는 @from·@to Char(12)·@hospital VarChar(32)이고 허용 목록·관문을 지나며 청구 Sql.All에는 없다")]
    public void HashedStatementsPassTheGuard()
    {
        var args = new Dictionary<string, object?>
        {
            ["@from"] = "202609010000",
            ["@to"] = "202610010000",
            ["@hospital"] = "SYNTHETIC",
        };
        foreach (var sql in HashedStatements)
        {
            Assert.Equal(VisitShape, Shape(StatsSql.ParametersOf(sql)));
            Assert.Equal(VisitShape, Shape(Sql.ParametersOf(sql)));
            Assert.True(StatsSql.IsAllowed(sql));
            Assert.True(Sql.IsAllowed(sql));
            ReadOnlyGuard.Require(sql, args);
            Assert.Contains(sql, StatsSql.All);
            Assert.DoesNotContain(sql, Sql.All);
        }
    }
}
