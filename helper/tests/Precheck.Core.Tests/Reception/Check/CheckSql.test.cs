using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>확인 문장·틀 시험이 같이 쓰는 검사. 문장 글자만 본다(DB 없음).</summary>
internal static class CheckSqlAssert
{
    /// <summary>그날 외래 접수 + 등록 병원 범위(Sql.HistoryVisitsCte·ClaimDatesSql과 같은 조건 글).</summary>
    public const string TodayScope =
        "c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' " +
        "AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital " +
        "AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    public const string RangeShape = "@from:Char(12) @to:Char(12) @hospital:VarChar(32)";

    private static readonly string[] Forbidden =
    {
        "INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "ALTER", "CREATE", "EXEC", "EXECUTE", "TRUNCATE", "GRANT", "REVOKE", "DENY",
        "INTO", "OFFSET", "FETCH", "OPENROWSET", "OPENQUERY", "OPENDATASOURCE", "BULK", "WAITFOR", "SHUTDOWN", "DBCC", "BACKUP", "RESTORE",
    };

    public static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    public static string Shape(IEnumerable<SqlParam> parameters) =>
        string.Join(" ", parameters.Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    public static string[] NamesIn(string sql) =>
        Regex.Matches(sql, @"@[A-Za-z_][A-Za-z0-9_]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();

    /// <summary>SELECT 하나: 끝 ;·주석·쓰기 낱말·2008 R2에 없는 OFFSET·FETCH가 없고, 글의 @이름이 매개변수 표와 같다.</summary>
    public static void OneSelect(string sql, IReadOnlyList<SqlParam> parameters)
    {
        Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
        Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
        foreach (var word in Forbidden) Assert.False(Regex.IsMatch(sql, @"\b" + word + @"\b", RegexOptions.IgnoreCase), word + " 낱말이 있다");
        Assert.Equal(parameters.Select(p => p.Name).OrderBy(x => x, StringComparer.Ordinal).ToArray(), NamesIn(sql));
    }

    public static IReadOnlyList<object?>[] Rows(params object?[][] rows) => rows.Select(r => (IReadOnlyList<object?>)r).ToArray();
}

/// <summary>
/// AC-1401.2·3·8 확인 모드가 돌리는 고정 문장(CheckSql). AC-1401.9 CheckSql.IsAllowed는 이 문장만 받고, 도우미 허용 목록(Sql.IsAllowed)은 받지 않는다.
/// </summary>
public class CheckSqlTests
{
    private static string SelectList(string sql)
    {
        var text = CheckSqlAssert.Squash(sql);
        var from = text.IndexOf(" FROM ", StringComparison.Ordinal);
        return text.Substring("SELECT ".Length, from - "SELECT ".Length);
    }

    [Fact(DisplayName = "AC-1401.2 상태 짝 문장은 오늘 외래 접수를 (OcmComStt, OcmRsuYon)·접수 시:분마다 세는 SELECT 하나이고, 상태·접수 취소로 거르지 않으며 병원 범위가 있다")]
    public void StatusPairsCountsTodayByPairAndMinute()
    {
        var sql = CheckSql.StatusPairs;
        CheckSqlAssert.OneSelect(sql, CheckSql.ParametersOf(sql));
        var text = CheckSqlAssert.Squash(sql);
        Assert.Contains("FROM dbo.OcmInf c WHERE " + CheckSqlAssert.TodayScope, text, StringComparison.Ordinal);
        Assert.Contains("GROUP BY RTRIM(c.OcmComStt),RTRIM(c.OcmRsuYon),SUBSTRING(c.OcmAcpDtm,9,4)", text, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmComStt IN", text, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmRsuYon<>", text, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmRsuYon=", text, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmRsuYon IN", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.2 상태 짝 문장은 상태·수납 코드·시:분·건수만 읽는다(차트번호·이름·메모 칸 없음)")]
    public void StatusPairsReadsNoPatientColumns()
    {
        Assert.Equal("RTRIM(c.OcmComStt) Status,RTRIM(c.OcmRsuYon) Rsu,SUBSTRING(c.OcmAcpDtm,9,4) AcceptedHm,COUNT_BIG(*) Visits", SelectList(CheckSql.StatusPairs));
        foreach (var column in new[] { "OcmChtNum", "OcmNum", "OcmBilCmt", "PbsInf" })
            Assert.DoesNotContain(column, CheckSql.StatusPairs, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.2 상태 짝·처방 수 문장의 매개변수는 @from·@to Char(12)와 @hospital VarChar(32)이다")]
    public void TodayStatementsTakeRange()
    {
        Assert.Equal(CheckSqlAssert.RangeShape, CheckSqlAssert.Shape(CheckSql.ParametersOf(CheckSql.StatusPairs)));
        Assert.Equal(CheckSqlAssert.RangeShape, CheckSqlAssert.Shape(CheckSql.ParametersOf(CheckSql.RxByStatus)));
    }

    [Fact(DisplayName = "AC-1401.3 칸 문장은 INFORMATION_SCHEMA.COLUMNS에서 dbo의 OcmInf·PbsInf·OrcInf·OdrInf 칸 이름·형식·길이만 읽는다(자료 표 없음, 매개변수 없음)")]
    public void TableColumnsReadsSchemaOfFourTables()
    {
        var sql = CheckSql.TableColumns;
        Assert.Empty(CheckSql.ParametersOf(sql));
        CheckSqlAssert.OneSelect(sql, CheckSql.ParametersOf(sql));
        Assert.Equal(new[] { "OcmInf", "PbsInf", "OrcInf", "OdrInf" }, CheckSql.Tables);
        var text = CheckSqlAssert.Squash(sql);
        Assert.Equal("c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.CHARACTER_MAXIMUM_LENGTH", SelectList(sql));
        Assert.Contains("FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA='dbo' AND c.TABLE_NAME IN ('OcmInf','PbsInf','OrcInf','OdrInf')", text, StringComparison.Ordinal);
        Assert.EndsWith("ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION", text, StringComparison.Ordinal);
        Assert.DoesNotContain("dbo.", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.3 내원에 붙은 표 문장은 이름이 OcmNum으로 끝나는 칸을 가진 dbo 기본 표의 칸 이름·형식·길이만 읽는다")]
    public void LinkedColumnsReadsSchemaOfVisitTables()
    {
        var sql = CheckSql.LinkedColumns;
        Assert.Empty(CheckSql.ParametersOf(sql));
        CheckSqlAssert.OneSelect(sql, CheckSql.ParametersOf(sql));
        var text = CheckSqlAssert.Squash(sql);
        Assert.Equal("c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.CHARACTER_MAXIMUM_LENGTH", SelectList(sql));
        Assert.Contains("FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME AND t.TABLE_TYPE='BASE TABLE'", text, StringComparison.Ordinal);
        Assert.Contains("WHERE c.TABLE_SCHEMA='dbo' AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS k WHERE k.TABLE_SCHEMA='dbo' AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME LIKE '%OcmNum')", text, StringComparison.Ordinal);
        Assert.EndsWith("ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION", text, StringComparison.Ordinal);
        Assert.DoesNotContain("dbo.", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.3 ProbeSchema는 칸 문장 줄(표·칸·형식·길이)에서 표·칸·글자 칸을 읽고, 겹친 줄은 한 번, 모양이 틀린 이름은 버린다")]
    public void SchemaReadsInformationSchemaRows()
    {
        var schema = ProbeSchema.From(CheckSqlAssert.Rows(
            new object?[] { "OcmInf", "OcmNum", "char", 14 },
            new object?[] { "OcmInf", "OcmBilCmt", "varchar", 200 },
            new object?[] { "SymInf", "SymOcmNum", "char", 14 },
            new object?[] { "SymInf", "SymSeq", "int", null },
            new object?[] { "SymInf", "SymTxt", "NTEXT", -1 },
            new object?[] { "SymInf", "SymNam", "nvarchar", DBNull.Value },
            new object?[] { "SymInf", "SymCod", "nchar", 4 },
            new object?[] { "SymInf", "SymOld", "text", null },
            new object?[] { "OcmInf", "OcmNum", "char", 14 },
            new object?[] { "Sym Inf", "SymTxt", "varchar", 10 },
            new object?[] { "SymInf", "Sym]Txt", "varchar", 10 },
            new object?[] { null, "SymTxt", "varchar", 10 },
            new object?[] { "SymInf" }));
        Assert.Equal(new[] { "OcmInf", "SymInf" }, schema.Tables);
        Assert.Equal(new[] { "OcmNum", "OcmBilCmt" }, schema.Columns("OcmInf"));
        Assert.Equal(new[] { "SymOcmNum", "SymSeq", "SymTxt", "SymNam", "SymCod", "SymOld" }, schema.Columns("SymInf"));
        Assert.Equal(new[] { "SymOcmNum", "SymTxt", "SymNam", "SymCod", "SymOld" }, schema.TextColumns("SymInf"));
        Assert.Empty(schema.Columns("PbsInf"));
        Assert.True(schema.Has("SymInf", "SymTxt"));
        Assert.False(schema.Has("syminf", "SymTxt"));
        Assert.False(schema.Has("SymInf", "Sym]Txt"));
        Assert.False(schema.Has("Sym Inf", "SymTxt"));
    }

    [Fact(DisplayName = "AC-1401.8 처방 수 문장은 오늘 외래 접수를 상태 짝마다 세고, 그 가운데 처방 줄(HistoryCodeSql의 처방 조건)이 있는 접수를 따로 센다")]
    public void RxByStatusCountsVisitsWithRx()
    {
        const string RxRule = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";
        var sql = CheckSql.RxByStatus;
        CheckSqlAssert.OneSelect(sql, CheckSql.ParametersOf(sql));
        var text = CheckSqlAssert.Squash(sql);
        Assert.Contains(RxRule, CheckSqlAssert.Squash(Sql.HistoryCodeSql), StringComparison.Ordinal);
        Assert.Equal("RTRIM(c.OcmComStt) Status,RTRIM(c.OcmRsuYon) Rsu,COUNT_BIG(*) Visits,COUNT_BIG(r.Hit) WithRx", SelectList(sql));
        Assert.Contains("FROM dbo.OcmInf c OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OdrInf o WHERE o.OdrOcmNum=c.OcmNum AND " + RxRule + ") r", text, StringComparison.Ordinal);
        Assert.Contains("WHERE " + CheckSqlAssert.TodayScope + " GROUP BY RTRIM(c.OcmComStt),RTRIM(c.OcmRsuYon)", text, StringComparison.Ordinal);
        Assert.DoesNotContain("OcmChtNum", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.8 옛 자료 따로 있음은 이미 허용된 StatsSql.HistoryGuardSql로 읽는다(매개변수 없음), 확인 문장은 다섯 개뿐이다")]
    public void HistoryGuardIsAlreadyAllowed()
    {
        Assert.True(Sql.IsAllowed(StatsSql.HistoryGuardSql));
        Assert.Empty(Sql.ParametersOf(StatsSql.HistoryGuardSql));
        Assert.Equal(
            new[] { CheckSql.StatusPairs, CheckSql.TableColumns, CheckSql.LinkedColumns, CheckSql.RxByStatus, CheckSql.StatusHistory }.OrderBy(x => x, StringComparer.Ordinal),
            CheckSql.All.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.9 CheckSql.IsAllowed는 확인 문장 다섯 개만 받고, 도우미 문장·고친 글·빈 값은 받지 않으며 ParametersOf는 E-BIT-READ-FAILED")]
    public void CheckSqlAllowsOnlyItsStatements()
    {
        foreach (var sql in CheckSql.All)
        {
            Assert.True(CheckSql.IsAllowed(sql));
            Assert.False(CheckSql.IsAllowed(sql + " "));
            Assert.False(CheckSql.IsAllowed(sql.Replace("SELECT ", "SELECT  ")));
            Assert.False(CheckSql.IsAllowed(sql.Replace("FROM ", "from ")));
            if (sql.Contains("@hospital")) Assert.False(CheckSql.IsAllowed(sql.Replace("@hospital", "'X'")));
            Assert.False(Sql.IsAllowed(sql));
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql)).Code);
        }
        Assert.False(CheckSql.IsAllowed(null));
        Assert.False(CheckSql.IsAllowed(Sql.HistoryVisitSql));
        Assert.False(CheckSql.IsAllowed(StatsSql.HistoryGuardSql));
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => CheckSql.ParametersOf(Sql.HistoryVisitSql)).Code);
    }
}

/// <summary>
/// AC-1401.9 찾기 틀 세 가지(ProbeSql). 이름은 같은 실행의 INFORMATION_SCHEMA 답(ProbeSchema)에 있고 모양이 맞을 때만 [ ]로 감싸 넣는다.
/// 틀은 확인 모드 세션만 받는다: 도우미 허용 목록(Sql.IsAllowed)·ReadOnlyGuard·CheckSql은 받지 않는다. 표·칸 이름은 지어낸 것이다(SymInf 등).
/// </summary>
public class CheckSqlProbeTests
{
    private static ProbeSchema Schema() => ProbeSchema.From(CheckSqlAssert.Rows(
        new object?[] { "SymInf", "SymOcmNum", "char", 14 },
        new object?[] { "SymInf", "SymChtNum", "char", 9 },
        new object?[] { "SymInf", "SymTxt", "varchar", 2000 },
        new object?[] { "PbsInf", "PbsChtNum", "char", 9 },
        new object?[] { "PbsInf", "PbsNam", "varchar", 40 },
        new object?[] { "OcmInf", "OcmNum", "char", 14 },
        new object?[] { "OcmInf", "OcmBilCmt", "varchar", 200 },
        new object?[] { "OrcInf", "OrcOcmNum", "char", 14 },
        new object?[] { "OrcInf", "OrcAccDte", "char", 14 },
        new object?[] { "OdrInf", "OdrOcmNum", "char", 14 },
        new object?[] { "OdrInf", "OdrCod", "varchar", 20 }));

    private static string[] AllProbes(ProbeSchema schema) => new[]
    {
        ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", "SymTxt"),
        ProbeSql.ChartLinked(schema, "SymInf", "SymChtNum", "SymTxt"),
        ProbeSql.Sample(schema, "PbsInf", "PbsNam"),
        ProbeSql.Sample(schema, "OcmInf", "OcmBilCmt"),
        ProbeSql.Sample(schema, "OrcInf", "OrcAccDte"),
    };

    [Fact(DisplayName = "AC-1401.9 VisitLinked는 dbo 표·칸 이름을 [ ]로 감싸 그날 외래 내원(병원 범위)의 (내원번호, 글자)를 읽는다")]
    public void VisitLinkedReadsVisitText()
    {
        var sql = CheckSqlAssert.Squash(ProbeSql.VisitLinked(Schema(), "SymInf", "SymOcmNum", "SymTxt"));
        Assert.Equal(
            "SELECT t.[SymOcmNum],t.[SymTxt] FROM dbo.[SymInf] t WHERE t.[SymOcmNum] IN (SELECT c.OcmNum FROM dbo.OcmInf c WHERE " + CheckSqlAssert.TodayScope + ")",
            sql);
    }

    [Fact(DisplayName = "AC-1401.9 ChartLinked는 그날 외래 접수 환자(병원 범위)의 (차트번호, 글자)를 읽는다, 차트번호 칸에 함수가 없다")]
    public void ChartLinkedReadsPatientText()
    {
        var sql = CheckSqlAssert.Squash(ProbeSql.ChartLinked(Schema(), "PbsInf", "PbsChtNum", "PbsNam"));
        Assert.Equal(
            "SELECT t.[PbsChtNum],t.[PbsNam] FROM dbo.[PbsInf] t WHERE t.[PbsChtNum] IN (SELECT c.OcmChtNum FROM dbo.OcmInf c WHERE " + CheckSqlAssert.TodayScope + ")",
            sql);
    }

    [Fact(DisplayName = "AC-1401.9 Sample은 PbsInf·OcmInf·OrcInf만, 그날 외래 접수에 붙은 줄을 TOP 300으로 읽고 다른 표는 막힌다")]
    public void SampleReadsThreeTablesOnly()
    {
        var schema = Schema();
        Assert.Equal(new[] { "PbsInf", "OcmInf", "OrcInf" }, ProbeSql.SampleTables);
        string Expected(string table, string column, string key, string target) =>
            "SELECT TOP 300 t.[" + column + "] FROM dbo.[" + table + "] t WHERE t.[" + key + "] IN (SELECT c." + target + " FROM dbo.OcmInf c WHERE " + CheckSqlAssert.TodayScope + ")";
        Assert.Equal(Expected("PbsInf", "PbsNam", "PbsChtNum", "OcmChtNum"), CheckSqlAssert.Squash(ProbeSql.Sample(schema, "PbsInf", "PbsNam")));
        Assert.Equal(Expected("OcmInf", "OcmBilCmt", "OcmNum", "OcmNum"), CheckSqlAssert.Squash(ProbeSql.Sample(schema, "OcmInf", "OcmBilCmt")));
        Assert.Equal(Expected("OrcInf", "OrcAccDte", "OrcOcmNum", "OcmNum"), CheckSqlAssert.Squash(ProbeSql.Sample(schema, "OrcInf", "OrcAccDte")));
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.Sample(schema, "SymInf", "SymTxt")).Code);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.Sample(schema, "OdrInf", "OdrCod")).Code);
    }

    [Fact(DisplayName = "AC-1401.9 이 실행의 INFORMATION_SCHEMA 답에 없는 표·칸 이름은 문장을 만들기 전에 E-BIT-READ-FAILED로 막힌다")]
    public void NamesOutsideSchemaAreBlocked()
    {
        var schema = Schema();
        var blocked = new Func<string>[]
        {
            () => ProbeSql.VisitLinked(schema, "NoInf", "SymOcmNum", "SymTxt"),
            () => ProbeSql.VisitLinked(schema, "SymInf", "NoOcmNum", "SymTxt"),
            () => ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", "NoTxt"),
            () => ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", "PbsNam"),
            () => ProbeSql.VisitLinked(schema, "syminf", "SymOcmNum", "SymTxt"),
            () => ProbeSql.ChartLinked(schema, "SymInf", "PbsChtNum", "SymTxt"),
            () => ProbeSql.ChartLinked(schema, "PbsInf", "PbsChtNum", "NoNam"),
            () => ProbeSql.Sample(schema, "PbsInf", "NoNam"),
            () => ProbeSql.Sample(ProbeSchema.From(CheckSqlAssert.Rows(new object?[] { "PbsInf", "PbsNam", "varchar", 40 })), "PbsInf", "PbsNam"),
            () => ProbeSql.VisitLinked(ProbeSchema.From(CheckSqlAssert.Rows()), "SymInf", "SymOcmNum", "SymTxt"),
        };
        foreach (var make in blocked) Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => make()).Code);
    }

    [Fact(DisplayName = "AC-1401.9 이름 모양은 ^[A-Za-z][A-Za-z0-9_]{0,63}$뿐이고, 모양이 틀린 이름은 INFORMATION_SCHEMA 답에 있어도 막힌다")]
    public void BadShapedNamesAreBlocked()
    {
        foreach (var good in new[] { "A", "Sym_Txt1", "A" + new string('b', 63) }) Assert.True(ProbeSql.IsName(good), good);
        var bad = new[]
        {
            "", " ", "Sym]Txt", "Sym[Txt", "Sym'Txt", "Sym\"Txt", "SymTxt;", "Sym Txt", "SymTxt--", "Sym.Txt", "Sym-Txt", "1SymTxt", "_SymTxt",
            "가상칸", "SymTxt\n", "\tSymTxt", "A" + new string('b', 64), "SymTxt]; DROP TABLE dbo.OcmInf --",
        };
        foreach (var name in bad) Assert.False(ProbeSql.IsName(name), name);
        Assert.False(ProbeSql.IsName(null));

        var rows = new List<object?[]> { new object?[] { "SymInf", "SymOcmNum", "char", 14 }, new object?[] { "SymInf", "SymTxt", "varchar", 10 } };
        foreach (var name in bad)
        {
            rows.Add(new object?[] { "SymInf", name, "varchar", 10 });
            rows.Add(new object?[] { name, "SymTxt", "varchar", 10 });
        }
        var schema = ProbeSchema.From(CheckSqlAssert.Rows(rows.ToArray()));
        foreach (var name in bad)
        {
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", name)).Code);
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.VisitLinked(schema, name, "SymOcmNum", "SymTxt")).Code);
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.ChartLinked(schema, "SymInf", name, "SymTxt")).Code);
        }
    }

    [Fact(DisplayName = "AC-1401.9 IsProbe는 틀로 만든 문장만 받고, 한 글자라도 바꾼 글·이어 붙인 글·다른 문장은 받지 않는다")]
    public void IsProbeAcceptsOnlyBuiltText()
    {
        foreach (var sql in AllProbes(Schema()))
        {
            Assert.True(ProbeSql.IsProbe(sql));
            var changed = new[]
            {
                sql + " ", " " + sql, sql + ";", sql + " UNION ALL SELECT 1,1", sql.Replace("@hospital", "'X'"), sql.Replace("SELECT ", "select "),
                sql.Replace("c.OcmPatTyp='O'", "1=1"), sql.Replace("TOP 300", "TOP 3000"), sql.Replace("t.[", "t.[x] , t.["),
                sql.Replace("[SymTxt]", "[Sym]Txt]"), sql.Replace("[SymTxt]", "[1SymTxt]"), sql.Replace("[PbsNam]", "[가상칸]"),
                sql.Replace("dbo.[", "sys.["), sql.Replace("\n", " "),
            };
            foreach (var text in changed.Where(text => text != sql)) Assert.False(ProbeSql.IsProbe(text), text);
        }
        Assert.False(ProbeSql.IsProbe(null));
        Assert.False(ProbeSql.IsProbe(""));
        Assert.False(ProbeSql.IsProbe(CheckSql.StatusPairs));
        Assert.False(ProbeSql.IsProbe(Sql.HistoryVisitSql));
        Assert.False(ProbeSql.IsProbe(StatsSql.HistoryGuardSql));
    }

    [Fact(DisplayName = "AC-1401.9 도우미 허용 목록(Sql.IsAllowed)·ReadOnlyGuard·CheckSql.IsAllowed는 틀로 만든 문장을 받지 않는다")]
    public void HelperAllowListRejectsProbes()
    {
        foreach (var sql in AllProbes(Schema()))
        {
            Assert.False(Sql.IsAllowed(sql));
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql)).Code);
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Sql.ParametersOf(sql)).Code);
            Assert.False(CheckSql.IsAllowed(sql));
        }
    }

    [Fact(DisplayName = "AC-1401.9 틀 문장은 모두 SELECT 하나이고 매개변수는 @from·@to Char(12)·@hospital VarChar(32)이다")]
    public void ProbesAreOneSelectWithRange()
    {
        Assert.Equal(CheckSqlAssert.RangeShape, CheckSqlAssert.Shape(ProbeSql.Parameters));
        foreach (var sql in AllProbes(Schema())) CheckSqlAssert.OneSelect(sql, ProbeSql.Parameters);
    }
}
