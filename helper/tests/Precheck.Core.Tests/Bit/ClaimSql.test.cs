using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-008.2 한 달 자료 읽기(TASK-8)의 SQL: 12개월 이력·이미 있는 메모·상병 추세·처방 목록·기간 기관기호는 원본과 공백만 다르다
/// (사본 original-sql/*.sql). claim.dates의 세기 SQL은 원본 방문 조건과 메모 조건을 그대로 쓴 새 SELECT다.
/// </summary>
public class ClaimSqlTests
{
    private static readonly Dictionary<string, string> ClaimOriginals = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["history-visits.sql"] = Sql.HistoryVisitSql,
        ["history-codes.sql"] = Sql.HistoryCodeSql,
        ["memo-rows.sql"] = Sql.MemoRowsSql,
        ["trend-count.sql"] = Sql.TrendCountSql,
        ["trend-totals.sql"] = Sql.TrendTotalsSql,
        ["trend-pairs.sql"] = Sql.TrendPairsSql,
        ["trend-visit-rx.sql"] = Sql.TrendVisitRxSql,
        ["trend-visit-dx.sql"] = Sql.TrendVisitDxSql,
        ["prescription-catalog.sql"] = Sql.PrescriptionCatalogSql,
        ["la-catalog.sql"] = Sql.LaCatalogSql,
        ["period-identity.sql"] = Sql.PeriodIdentitySql,
        ["user-permissions.sql"] = Sql.UserPermissionsSql,
    };

    private static string Squash(string sql) => ReadOnlyGuardTests.Squash(sql);

    private static string Original(string file) => Squash(ReadOnlyGuardTests.ReadOriginal(file));

    private static string Params(string sql) =>
        string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));

    [Fact(DisplayName = "AC-008.2 이력(VisitSql·CodeSql)·이미 있는 메모(RowsSql)·상병 추세·처방 목록·기간 기관기호 SQL은 원본 사본과 공백만 다르다")]
    public void MatchOriginalCopies()
    {
        foreach (var pair in ClaimOriginals)
        {
            Assert.Equal(Original(pair.Key), Squash(pair.Value));
            Assert.True(Sql.IsAllowed(pair.Value), pair.Key);
        }
    }

    [Fact(DisplayName = "AC-008.2 claim.dates 세기 SQL은 원본 방문 조건(외래 O·접수 취소 아님·진료 완료 상태·병원 범위)과 메모 조건(OcmBilCmt)을 그대로 쓴 SELECT 하나")]
    public void ClaimDatesUsesOriginalConditions()
    {
        var sql = Squash(Sql.ClaimDatesSql);
        Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);

        // 원본 RxDiagnosisTrend V(= RxHistory V의 방문 조건)의 WHERE 그대로
        var trend = Original("trend-count.sql");
        var start = trend.IndexOf("WHERE c.OcmAcpDtm>=@from", StringComparison.Ordinal);
        var end = trend.IndexOf("d.DepExpDte)", start, StringComparison.Ordinal) + "d.DepExpDte)".Length;
        var visitCondition = trend.Substring(start, end - start);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'", visitCondition, StringComparison.Ordinal);
        Assert.Contains("d.DepHspNum=@hospital", visitCondition, StringComparison.Ordinal);
        Assert.Contains(visitCondition, sql, StringComparison.Ordinal);

        // 원본 ClaimMemoHistory.RowsSql의 '메모가 있음' 조건 그대로
        Assert.Contains("c.OcmBilCmt IS NOT NULL AND c.OcmBilCmt<>''", Original("memo-rows.sql"), StringComparison.Ordinal);
        Assert.Contains("c.OcmBilCmt IS NOT NULL AND c.OcmBilCmt<>''", sql, StringComparison.Ordinal);

        // 날짜별 수만 센다(칸: 날짜·진료 수·메모 있는 진료 수). 차트번호·이름·메모 글은 읽지 않는다
        Assert.EndsWith("GROUP BY LEFT(c.OcmAcpDtm,8)", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmChtNum", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("c.OcmBilCmt Memo", sql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-008.2 새 SQL의 매개변수 표는 원본 Parameters.Add 그대로(@from·@focus·@to Char 12, @hospital VarChar 32, @minimum Int 등)")]
    public void ParameterTablesMatchOriginal()
    {
        Assert.Equal("@from:Char:12 @focus:Char:12 @to:Char:12 @hospital:VarChar:32", Params(Sql.HistoryVisitSql));
        Assert.Equal("@from:Char:12 @focus:Char:12 @to:Char:12 @hospital:VarChar:32", Params(Sql.HistoryCodeSql));
        Assert.Equal("@from:Char:12 @to:Char:12 @hospital:VarChar:32", Params(Sql.MemoRowsSql));
        foreach (var sql in new[] { Sql.TrendCountSql, Sql.TrendTotalsSql, Sql.TrendVisitRxSql, Sql.TrendVisitDxSql, Sql.ClaimDatesSql })
        {
            Assert.Equal("@from:Char:12 @to:Char:12 @hospital:VarChar:32", Params(sql));
        }
        Assert.Equal("@from:Char:12 @to:Char:12 @hospital:VarChar:32 @minimum:Int:0", Params(Sql.TrendPairsSql));
        Assert.Equal("@today:Char:8", Params(Sql.PrescriptionCatalogSql));
        Assert.Equal("@today:Char:8 @prefix:VarChar:8", Params(Sql.LaCatalogSql));
        Assert.Equal("@scope:VarChar:32 @institution:Char:8 @firstDay:Char:8 @lastDay:Char:8", Params(Sql.PeriodIdentitySql));
        Assert.Equal("@user:VarChar:100", Params(Sql.UserPermissionsSql));
    }

    [Fact(DisplayName = "AC-008.2 시간 제한은 원본 CommandTimeout 값(메타 15초·이력 150초·메모 120초·추세 240초·처방 목록 25초·LA 20초)")]
    public void TimeoutsMatchOriginal()
    {
        Assert.Equal(TimeSpan.FromSeconds(15), Sql.MetaTimeout);
        Assert.Equal(TimeSpan.FromSeconds(150), Sql.HistoryTimeout);
        Assert.Equal(TimeSpan.FromSeconds(120), Sql.MemoTimeout);
        Assert.Equal(TimeSpan.FromSeconds(240), Sql.TrendTimeout);
        Assert.Equal(TimeSpan.FromSeconds(25), Sql.PrescriptionCatalogTimeout);
        Assert.Equal(TimeSpan.FromSeconds(20), Sql.LaCatalogTimeout);
    }

    [Fact(DisplayName = "AC-008.2 @minimum 같은 정수 매개변수는 int 값만 통과한다(글자·빠짐은 E-BIT-READ-FAILED)")]
    public void IntegerParameter()
    {
        var args = new Dictionary<string, object?>
        {
            ["@from"] = "202510010000",
            ["@to"] = "202611010000",
            ["@hospital"] = Synthetic.Scope,
            ["@minimum"] = 2,
        };
        ReadOnlyGuard.Require(Sql.TrendPairsSql, args);

        args["@minimum"] = "2";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(Sql.TrendPairsSql, args)).Code);
        args["@minimum"] = 2L;
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(Sql.TrendPairsSql, args)).Code);
        args.Remove("@minimum");
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(Sql.TrendPairsSql, args)).Code);
    }
}
