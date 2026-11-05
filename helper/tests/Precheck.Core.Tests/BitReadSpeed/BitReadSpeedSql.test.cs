using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.BitReadSpeed;

/// <summary>
/// 원본 사본과 상수 사이에 허용하는 바꿈 한 가지(AC-1001.3): 첫 내원 연결 조건 글 하나. 사본은 고치지 않고, 견주기 전에 이 바꿈만 더한다.
/// 옛 글이 있어야 할 사본에 정확히 한 번 있고 다른 사본에는 없는지도 함께 본다.
/// </summary>
internal static class FirstVisitJoin
{
    public const string OldJoin = "NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId";
    public const string NewJoin = "c.OcmChtNum=p.PatientId";

    private static readonly HashSet<string> CopiesWithOldJoin = new HashSet<string>(StringComparer.Ordinal)
    {
        "rx-visit-split-summary.sql",
        "rx-visit-split-days.sql",
        "rx-visit-split-visits-rows.sql",
        "report-patients.sql",
        "patients.sql",
    };

    public static string ApplyTo(string file, string original)
    {
        Assert.Equal(CopiesWithOldJoin.Contains(file) ? 1 : 0, Count(original, OldJoin));
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
/// REQ-1001 첫 내원 연결 조건만 색인을 쓸 수 있는 글로 바꿨고, 나머지 글·매개변수는 그대로다.
/// 사본 대조(AC-1001.3)는 StatsSql.test.cs·RevenueSql.test.cs의 기존 시험에 있다. 실제 숫자 대조는 의원에서 한다(design.md).
/// </summary>
public class BitReadSpeedSqlTests
{
    private const string VisitShape = "@from:Char(12) @to:Char(12) @hospital:VarChar(32)";
    private const string WrappedChart = "NULLIF(RTRIM(c.OcmChtNum),'')";

    private static readonly string[] VisitStatements =
    {
        StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql,
    };

    private static readonly string[] ChangedStatements =
        VisitStatements.Concat(new[] { StatsSql.PatientsSql, RevenueSql.Patients }).ToArray();

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string NoSpace(string sql) => Regex.Replace(sql, @"\s+", "");

    private static string Shape(IEnumerable<SqlParam> parameters) =>
        string.Join(" ", parameters.Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    [Fact(DisplayName = "AC-1001.1 허용된 모든 문장의 = 어느 쪽에도 함수를 씌운 차트번호가 없다")]
    public void NoAllowedStatementComparesWrappedChart()
    {
        var allowed = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Distinct().ToArray();
        Assert.Contains(StatsSql.VisitRowsSql, allowed);
        Assert.Contains(RevenueSql.Patients, allowed);
        foreach (var sql in allowed)
        {
            var text = NoSpace(sql);
            Assert.Equal(-1, text.IndexOf(WrappedChart + "=", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(-1, text.IndexOf("=" + WrappedChart, StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact(DisplayName = "AC-1001.1 옛 연결 조건을 넣은 글은 허용 목록이 거절한다")]
    public void GuardRefusesOldJoinText()
    {
        foreach (var sql in ChangedStatements)
        {
            var withOldJoin = sql.Replace(FirstVisitJoin.NewJoin, FirstVisitJoin.OldJoin);
            Assert.NotEqual(sql, withOldJoin);
            Assert.False(Sql.IsAllowed(withOldJoin));
        }
    }

    [Fact(DisplayName = "AC-1001.2 여섯 문장에 새 연결 조건이 한 번씩 있고 PatientId 계산과 NULL 거르기는 그대로다")]
    public void ChangedStatementsHoldNewJoinOnce()
    {
        foreach (var sql in ChangedStatements)
        {
            var text = Squash(sql);
            Assert.Equal(1, FirstVisitJoin.Count(text, "JOIN dbo.OcmInf c ON " + FirstVisitJoin.NewJoin));
            Assert.Equal(1, FirstVisitJoin.Count(text, WrappedChart + " PatientId"));
            Assert.Equal(1, FirstVisitJoin.Count(text, "SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL"));
        }
    }

    [Fact(DisplayName = "AC-1001.4 세 매개변수 표는 @from·@to Char(12)·@hospital VarChar(32) 그대로이고 관문을 지나며 두 Patients 문장은 글자까지 같다")]
    public void ParameterShapesAreUnchanged()
    {
        foreach (var sql in VisitStatements) Assert.Equal(VisitShape, Shape(StatsSql.ParametersOf(sql)));
        Assert.Equal(VisitShape, Shape(StatsSql.ParametersOf(StatsSql.PatientsSql)));
        Assert.Equal(VisitShape, Shape(RevenueSql.Parameters[RevenueSql.Patients]));

        var args = new Dictionary<string, object?>
        {
            ["@from"] = "202609010000",
            ["@to"] = "202610010000",
            ["@hospital"] = "SYNTHETIC",
        };
        foreach (var sql in ChangedStatements)
        {
            Assert.Equal(VisitShape, Shape(Sql.ParametersOf(sql)));
            ReadOnlyGuard.Require(sql, args);
        }

        Assert.Equal(RevenueSql.Patients, StatsSql.PatientsSql);
    }
}
