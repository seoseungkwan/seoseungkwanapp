using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.SqlServer.TransactSql.ScriptDom;
using Precheck.Core.Bit;
using Precheck.Core.Diag;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.Diag;

/// <summary>
/// 측정 문장(specs/diag-read-speed). 실제 DB에 닿을 수 없어서 T-SQL 해석기로 문법과 읽기 전용을 본다.
/// SQL Server 2008 문법(TSql100Parser)으로 읽어 의원 PC의 옛 판에서도 문법 오류가 나지 않게 한다.
/// </summary>
public class DiagSqlTests
{
    private static readonly Dictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    private static Dictionary<string, object?> VisitArgs() => new Dictionary<string, object?>(StringComparer.Ordinal)
    {
        ["@from"] = "202607240000",
        ["@to"] = "202611030000",
        ["@hospital"] = "SYNTHETIC",
    };

    private static TSqlScript Parse(string sql)
    {
        var fragment = new TSql100Parser(true).Parse(new StringReader(sql), out var errors);
        Assert.Empty(errors);
        return Assert.IsType<TSqlScript>(fragment);
    }

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private sealed class Tables : TSqlFragmentVisitor
    {
        public List<(string? Schema, string Name)> Named { get; } = new List<(string? Schema, string Name)>();

        public override void Visit(NamedTableReference node)
        {
            Named.Add((node.SchemaObject.SchemaIdentifier?.Value, node.SchemaObject.BaseIdentifier.Value));
        }
    }

    private static List<(string? Schema, string Name)> TablesOf(string sql)
    {
        var visitor = new Tables();
        Parse(sql).Accept(visitor);
        return visitor.Named;
    }

    [Fact(DisplayName = "AC-802.1 측정 문장은 모두 문법 오류가 없는 SELECT 한 문장이고 INTO·임시 표·쓰기·실행·;·주석이 없다")]
    public void AllAreSingleSelects()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|SET|DECLARE|USE)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.NotEmpty(DiagSql.All);
        foreach (var sql in DiagSql.All)
        {
            var script = Parse(sql);
            var batch = Assert.Single(script.Batches);
            var statement = Assert.IsType<SelectStatement>(Assert.Single(batch.Statements));
            Assert.Null(statement.Into);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("#", sql);
            Assert.DoesNotMatch(forbidden, sql);
        }
    }

    [Fact(DisplayName = "AC-802.2 환경 문장은 sys.*만 읽고 dbo 표를 읽지 않는다")]
    public void EnvironmentStatementsReadOnlySys()
    {
        Assert.NotEmpty(DiagSql.Environment);
        foreach (var sql in DiagSql.Environment)
        {
            Assert.All(TablesOf(sql), table => Assert.Equal("sys", table.Schema));
            Assert.DoesNotContain("dbo.", sql);
        }
    }

    [Fact(DisplayName = "AC-802.2 조각 문장은 dbo.OcmInf·OdrInf·DepMst만 읽고 답은 건수 숫자뿐이다(SELECT 목록이 COUNT만)")]
    public void PiecesReturnOnlyCounts()
    {
        var cte = new[] { "PeriodVisits", "Patients", "FirstVisits", "Orders" };
        var allowed = new[] { "OcmInf", "OdrInf", "DepMst" };
        Assert.Equal(4, DiagSql.Pieces.Count);
        foreach (var sql in DiagSql.Pieces)
        {
            foreach (var table in TablesOf(sql))
            {
                if (table.Schema == null) Assert.Contains(table.Name, cte);
                else
                {
                    Assert.Equal("dbo", table.Schema);
                    Assert.Contains(table.Name, allowed);
                }
            }

            var select = Assert.IsType<SelectStatement>(Parse(sql).Batches[0].Statements[0]);
            var query = Assert.IsType<QuerySpecification>(select.QueryExpression);
            Assert.All(query.SelectElements, element =>
            {
                var scalar = Assert.IsType<SelectScalarExpression>(element);
                var call = Assert.IsType<FunctionCall>(scalar.Expression);
                Assert.Contains(call.FunctionName.Value.ToUpperInvariant(), new[] { "COUNT", "COUNT_BIG" });
            });
        }
        Assert.Empty(DiagSql.Pieces.Intersect(DiagSql.Environment));
        Assert.Equal(DiagSql.Environment.Count + DiagSql.Pieces.Count, DiagSql.All.Count);
    }

    [Fact(DisplayName = "AC-802.3 측정 문장은 정해 둔 매개변수와 함께만 ReadOnlyGuard를 지나고, 제품 목록은 그대로다")]
    public void GuardRoute()
    {
        foreach (var sql in DiagSql.Environment)
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.Empty(Sql.ParametersOf(sql));
            ReadOnlyGuard.Require(sql, NoArgs);
            Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, VisitArgs()));
        }

        foreach (var sql in DiagSql.Pieces)
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.Equal(
                new[] { "@from:Char:12", "@to:Char:12", "@hospital:VarChar:32" },
                Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
            ReadOnlyGuard.Require(sql, VisitArgs());
            Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, NoArgs));
            var tooLong = VisitArgs();
            tooLong["@hospital"] = new string('X', 33);
            Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong));
            Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql + " ", VisitArgs()));
        }

        // 제품 목록에는 들어가지 않는다(원본 시험들이 고정한 값 그대로)
        foreach (var sql in DiagSql.All)
        {
            Assert.DoesNotContain(sql, Sql.All);
            Assert.DoesNotContain(sql, StatsSql.All);
            Assert.False(RevenueSql.Parameters.ContainsKey(sql));
        }
        Assert.Equal(4, Sql.All.Count);
    }

    [Fact(DisplayName = "AC-802.4 조각의 CTE 글은 StatsSql.VisitRowsSql 앞부분과 공백만 다르다")]
    public void PiecesFollowTheProductStatement()
    {
        var product = Squash(StatsSql.VisitRowsSql);
        Assert.StartsWith(Squash(DiagSql.Visits), product, StringComparison.Ordinal);
        Assert.StartsWith(Squash(DiagSql.Visits + DiagSql.OrdersCte), product, StringComparison.Ordinal);
        Assert.StartsWith(Squash(DiagSql.Visits), Squash(DiagSql.PeriodVisitsCount), StringComparison.Ordinal);
        Assert.StartsWith(Squash(DiagSql.Visits), Squash(DiagSql.FirstVisitsAsWritten), StringComparison.Ordinal);
        Assert.StartsWith(Squash(DiagSql.Visits + DiagSql.OrdersCte), Squash(DiagSql.OrdersCount), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-802.4 바꾼 조인 문장은 조인 조건 한 곳만 다르다")]
    public void PlainJoinDiffersInOnePlace()
    {
        const string asWritten = "NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId";
        const string plain = "c.OcmChtNum=p.PatientId";
        Assert.Contains(asWritten, DiagSql.FirstVisitsAsWritten);
        Assert.DoesNotContain(asWritten, DiagSql.FirstVisitsPlainJoin);
        Assert.Contains("ON " + plain, DiagSql.FirstVisitsPlainJoin);
        Assert.Equal(Squash(DiagSql.FirstVisitsAsWritten), Squash(DiagSql.FirstVisitsPlainJoin).Replace("ON " + plain, "ON " + asWritten));
    }

    [Fact(DisplayName = "AC-807.2 문장에 표 여섯과 칸 여섯 이름이 있다")]
    public void NamesTheRequestedTablesAndColumns()
    {
        foreach (var table in DiagSql.ReportedTables)
        {
            Assert.Contains("'" + table + "'", DiagSql.TableRows);
            Assert.Contains("'" + table + "'", DiagSql.Indexes);
        }
        Assert.Equal(new[] { "DepMst", "OcmInf", "OdrInf", "OrcInf", "OrpInf", "SeeMst" }, DiagSql.ReportedTables.OrderBy(name => name, StringComparer.Ordinal));
        Assert.Equal(6, DiagSql.ReportedColumns.Count);
        foreach (var column in DiagSql.ReportedColumns)
        {
            Assert.Contains("'" + column.Table + "'", DiagSql.ColumnTypes);
            Assert.Contains("'" + column.Column + "'", DiagSql.ColumnTypes);
        }
        Assert.Equal(new[] { "OcmChtNum", "OcmAcpDtm", "OcmNum", "OcmDepCod", "OdrOcmNum", "DepCod" }, DiagSql.ReportedColumns.Select(column => column.Column));
    }

    [Fact(DisplayName = "AC-807.7 허용 목록의 모든 문장에 이름이 있고 표에 없는 문장은 ?다")]
    public void LabelsCoverEveryAllowedStatement()
    {
        var everything = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Concat(DiagSql.All).Distinct(StringComparer.Ordinal).ToList();
        foreach (var sql in everything)
        {
            Assert.NotEqual(DiagLabels.Unknown, DiagLabels.Of(sql));
            Assert.Matches(@"^[A-Za-z][A-Za-z0-9_.\-]*\z", DiagLabels.Of(sql));
        }

        // 글자가 다른 문장은 이름도 다르다(같은 글자는 한 이름으로 합친다)
        Assert.Equal(everything.Count, everything.Select(DiagLabels.Of).Distinct(StringComparer.Ordinal).Count());

        Assert.Equal("?", DiagLabels.Unknown);
        Assert.Equal(DiagLabels.Unknown, DiagLabels.Of("SELECT '900001'"));
        Assert.Equal(DiagLabels.Unknown, DiagLabels.Of(StatsSql.VisitRowsSql + " "));
        Assert.Equal(DiagLabels.Unknown, DiagLabels.Of(null));
        Assert.Equal(DiagLabels.Of(StatsSql.HistoryGuardSql), DiagLabels.Of(RevenueSql.HistoryGuard));
    }

    [Fact(DisplayName = "AC-807.8 비용·대기 문장은 자기 세션(session_id=@@SPID)만 보고 대기는 상위 3개다")]
    public void CostStatementsLookAtOwnSession()
    {
        Assert.Contains("session_id=@@SPID", DiagSql.SessionCost);
        Assert.Contains("session_id=@@SPID", DiagSql.SessionWaits);
        Assert.Contains("TOP 3", DiagSql.SessionWaits);
        Assert.Contains(DiagSql.SessionCost, DiagSql.Environment);
        Assert.Contains(DiagSql.SessionWaits, DiagSql.Environment);
    }
}
