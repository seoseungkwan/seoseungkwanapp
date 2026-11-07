using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Stats;
using Precheck.Core.Tests.BitReadSpeed;
using Xunit;

namespace Precheck.Core.Tests.Stats;

/// <summary>
/// AC-1001.3 사본은 고치지 않는다. 첫 내원 연결 조건 글 하나(FirstVisitJoin)만 바꾼 사본과 견주고, 아래 "공백만 다르다"는 그 바꾼 사본 기준이다.
/// AC-503.2 통계 SQL(StatsSql)은 원본 문장 사본(original-sql/*.sql)과 공백만 다르다. 진료 줄 SQL만 원본 RowsSql에서
/// 처방 코드 거르기 한 덩어리를 뺐다. 모두 매개변수를 받는 SELECT이고 ReadOnlyGuard를 지난다. 청구 Sql.All은 그대로다.
/// AC-504.4 보고 SQL도 원본 사본과 공백만 다르다(끝의 ;와 원본 주석도 그대로). @daily는 Char(1)로 관문을 지난다.
/// AC-503.5 접수 줄 SQL은 원본에 없는 새 문장이라 사본 대조는 그 Visits 부분에만 하고, 뒤의 SELECT는 정해 둔 글과 견준다.
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

    /// <summary>원본 OperationalReportSql 사본 이름 → StatsSql 상수(TASK-4).</summary>
    private static readonly Dictionary<string, string> ReportOriginals = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["report-unsupported-finance.sql"] = StatsSql.UnsupportedFinanceSql,
        ["report-patients.sql"] = StatsSql.PatientsSql,
        ["report-treatments.sql"] = StatsSql.TreatmentsSql,
        ["report-la-codes.sql"] = StatsSql.LaCodesSql,
        ["report-finance-normal.sql"] = StatsSql.FinanceNormalSql,
        ["report-finance-receivable.sql"] = StatsSql.FinanceReceivableSql,
        ["report-finance-multiplicity.sql"] = StatsSql.FinanceMultiplicitySql,
        ["report-receivable-multiplicity.sql"] = StatsSql.ReceivableMultiplicitySql,
    };

    private const string RowsOriginal = "rx-visit-split-visits-rows.sql";

    // 원본 RowsSql에서 빼는 한 덩어리의 처음과 끝(공백을 한 칸으로 줄인 글 기준)
    private const string BlockStart = "AND (UPPER(RTRIM(o.OdrCod)) IN (@c0,";
    private const string BlockEnd = "OR (@eswt=1 AND CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0))";

    // 사본에서 Visits 부분이 끝나고 처방 쪽이 시작하는 자리(공백을 한 칸으로 줄인 글 기준)
    private const string OrdersStart = ", Orders AS (";

    // AC-503.5의 SELECT 글(공백을 한 칸으로 줄인 글 기준)
    private const string PatientDaysSelect = "SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId WHERE v.PatientId IS NOT NULL GROUP BY v.PatientId,v.VisitDay,f.FirstDtm ORDER BY v.PatientId,v.VisitDay";

    private static readonly string[] Constants =
    {
        StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql, StatsSql.HistoryGuardSql,
    };

    // 원본 그대로라 남긴 글(AC-504.4 공백만 다름). 이 밖의 ;·주석은 어느 문장에도 없어야 한다
    private static readonly string[] EndsWithSemicolon = { StatsSql.FinanceNormalSql, StatsSql.FinanceReceivableSql, StatsSql.ReceivableMultiplicitySql };
    private const string KeptComment = "-- Equivalent to the original inner/outer grouped financial projection's -- keys. Original MAX date deliberately ranges beyond the selected period.";

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

    /// <summary>사본 글: 머리의 설명 주석 줄만 뺀다(원본 문장 안의 주석은 원본 글이라 남긴다).</summary>
    private static string ReadOriginal(string file) =>
        string.Join("\n", File.ReadAllLines(Path.Combine(OriginalDirectory(), file)).SkipWhile(line => line.TrimStart().StartsWith("--", StringComparison.Ordinal)));

    /// <summary>원본 그대로라 남긴 ; 와 주석만 정확히 뺀 글. 이 글에는 ;·주석이 하나도 없어야 한다.</summary>
    private static string WithoutKeptOriginalText(string sql)
    {
        var text = Squash(sql);
        if (sql == StatsSql.FinanceMultiplicitySql)
        {
            Assert.Equal(1, Count(text, KeptComment));
            text = text.Replace(KeptComment, "");
        }
        if (EndsWithSemicolon.Contains(sql))
        {
            Assert.EndsWith(";", text);
            text = text.Substring(0, text.Length - 1);
        }
        return text;
    }

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

    [Fact(DisplayName = "AC-503.2 AC-1001.3 기간 합계·날짜별·처방 이름·과거 자료 확인 SQL은 연결 조건 한 가지만 바꾼 원본 사본과 공백만 다르다")]
    public void ConstantsMatchOriginalCopies()
    {
        var files = Directory.GetFiles(OriginalDirectory(), "*.sql").Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.Equal(Originals.Keys.Concat(ReportOriginals.Keys).Append(RowsOriginal).OrderBy(name => name, StringComparer.Ordinal).ToArray(), files);
        foreach (var pair in Originals) Assert.Equal(Squash(FirstVisitJoin.ApplyTo(pair.Key, ReadOriginal(pair.Key))), Squash(pair.Value));
    }

    [Fact(DisplayName = "AC-503.2 AC-1001.3 진료 줄 SQL은 연결 조건 한 가지만 바꾼 원본 Visits + RowsSql에서 처방 코드 거르기 한 덩어리만 뺀 글이다")]
    public void VisitRowsIsOriginalWithoutCodeFilter()
    {
        var original = Squash(FirstVisitJoin.ApplyTo(RowsOriginal, ReadOriginal(RowsOriginal)));
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

    [Fact(DisplayName = "AC-503.5 AC-1001.3 접수 줄 SQL은 연결 조건 한 가지만 바꾼 원본 사본의 Visits 부분(공백만 다름) 뒤에 정해 둔 SELECT를 이은 글이고 처방 표 OdrInf를 잇지 않는다")]
    public void PatientDaysIsVisitsPlusSelect()
    {
        var original = Squash(FirstVisitJoin.ApplyTo(RowsOriginal, ReadOriginal(RowsOriginal)));
        Assert.Equal(1, Count(original, OrdersStart));
        var visits = original.Substring(0, original.IndexOf(OrdersStart, StringComparison.Ordinal));
        foreach (var part in new[] { "WITH PeriodVisits AS (", "), Patients AS (", "), FirstVisits AS (" }) Assert.Equal(1, Count(visits, part));

        var sql = StatsSql.PatientDaysSql;
        Assert.Equal(visits + " " + PatientDaysSelect, Squash(sql));
        Assert.DoesNotContain("OdrInf", sql);
    }

    [Fact(DisplayName = "AC-503.5 접수 줄 SQL은 매개변수를 받는 SELECT로 ReadOnlyGuard를 지나고(@from·@to Char(12)·@hospital VarChar(32)) 청구 Sql.All에는 없다")]
    public void PatientDaysPassesTheGuard()
    {
        var sql = StatsSql.PatientDaysSql;
        ReadOnlyGuard.Require(sql, VisitArgs());
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", string.Join(" ", StatsSql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")")));
        Assert.Contains(sql, StatsSql.All);
        Assert.True(Sql.IsAllowed(sql));
        Assert.DoesNotContain(sql, Sql.All);

        // 고친 글·표에 없는 매개변수는 막는다
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql + " ", VisitArgs())).Code);
        var withCode = VisitArgs();
        withCode["@c0"] = "MM042";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, withCode)).Code);
    }

    [Fact(DisplayName = "AC-503.2 통계 SQL은 모두 SELECT 하나뿐(; · 주석 · 쓰기·실행 낱말 없음)이고 환자 신상 표를 읽지 않는다")]
    public void StatementsAreSingleSelects()
    {
        var readable = new HashSet<string>(StringComparer.Ordinal) { "dbo.OcmInf", "dbo.OdrInf", "dbo.DepMst", "dbo.SeeMst" };
        Assert.Equal(Constants.Concat(ReportOriginals.Values).OrderBy(sql => sql, StringComparer.Ordinal), StatsSql.All.OrderBy(sql => sql, StringComparer.Ordinal));
        foreach (var sql in Constants)
        {
            AssertSingleSelect(sql, sql);
            // 읽는 표는 내원·처방·진료과·처방 목록뿐(이름·전화·주민번호·주소가 있는 환자 표를 읽지 않는다)
            foreach (Match table in Regex.Matches(sql, @"dbo\.[A-Za-z]+")) Assert.Contains(table.Value, readable);
        }
    }

    private static void AssertSingleSelect(string sql, string body)
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal), "SELECT 또는 WITH … SELECT");
        Assert.DoesNotContain(";", body);
        Assert.DoesNotContain("--", body);
        Assert.DoesNotContain("/*", body);
        Assert.DoesNotMatch(forbidden, body);
    }

    [Fact(DisplayName = "AC-504.4 AC-1001.3 보고 SQL은 연결 조건 한 가지만 바꾼 원본 사본과 공백만 다르다(끝의 ;와 원본 주석도 그대로)")]
    public void ReportConstantsMatchOriginalCopies()
    {
        foreach (var pair in ReportOriginals) Assert.Equal(Squash(FirstVisitJoin.ApplyTo(pair.Key, ReadOriginal(pair.Key))), Squash(pair.Value));
        // 원본 주석 줄은 뒤 줄을 먹지 않게 줄바꿈을 그대로 둔다
        Assert.Contains("projection's\n", StatsSql.FinanceMultiplicitySql.Replace("\r\n", "\n"));
        Assert.Contains("selected period.\n", StatsSql.FinanceMultiplicitySql.Replace("\r\n", "\n"));
    }

    [Fact(DisplayName = "AC-504.4 보고 SQL은 모두 SELECT 하나뿐이고(원본의 끝 ; 셋과 주석 하나 밖에는 없음) 합계만 내며 환자 표는 차트번호 연결에만 쓴다")]
    public void ReportStatementsAreSingleSelects()
    {
        var readable = new HashSet<string>(StringComparer.Ordinal)
        {
            "dbo.OcmInf", "dbo.OdrInf", "dbo.DepMst", "dbo.OrcInf", "dbo.OrpInf", "dbo.IrcInf",
            "dbo.PbsInf", "dbo.InsMst", "dbo.DtlMst", "dbo.UidMst", "dbo.OdlInf", "dbo.PmdInf",
        };
        foreach (var sql in ReportOriginals.Values)
        {
            AssertSingleSelect(sql, WithoutKeptOriginalText(sql));
            foreach (Match table in Regex.Matches(sql, @"dbo\.[A-Za-z]+")) Assert.Contains(table.Value, readable);
            foreach (Match column in Regex.Matches(sql, @"\bPbs[A-Za-z]+")) Assert.Contains(column.Value, new[] { "PbsInf", "PbsChtNum" });
        }
    }

    [Fact(DisplayName = "AC-504.4 보고 SQL 매개변수 표: @day·@nextDay Char(8), @from·@to Char(12), @hospital VarChar(32), @daily Char(1) 중 문장에 나오는 것만")]
    public void ReportParameterTables()
    {
        string Shape(string sql) => string.Join(" ", StatsSql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

        Assert.Equal("@day:Char(8) @nextDay:Char(8) @from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(StatsSql.UnsupportedFinanceSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(StatsSql.PatientsSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32) @daily:Char(1)", Shape(StatsSql.TreatmentsSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(StatsSql.LaCodesSql));
        foreach (var sql in new[] { StatsSql.FinanceNormalSql, StatsSql.FinanceReceivableSql, StatsSql.FinanceMultiplicitySql, StatsSql.ReceivableMultiplicitySql })
        {
            Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(sql));
        }
    }

    [Fact(DisplayName = "AC-504.4 @daily는 원본 Bit 대신 Char(1) '1'·'0'으로 관문을 지난다(참·거짓 값과 두 글자는 막는다)")]
    public void DailyIsOneCharThroughTheGuard()
    {
        Dictionary<string, object?> Treatment(object? daily) =>
            Args(("@from", "202611010000"), ("@to", "202611160000"), ("@hospital", "SYNTHETIC"), ("@daily", daily));

        ReadOnlyGuard.Require(StatsSql.TreatmentsSql, Treatment("1"));
        ReadOnlyGuard.Require(StatsSql.TreatmentsSql, Treatment("0"));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.TreatmentsSql, Treatment(true))).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.TreatmentsSql, Treatment("10"))).Code);
        Assert.True(Sql.IsAllowed(StatsSql.TreatmentsSql));
        foreach (var sql in ReportOriginals.Values)
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);
        }
    }

    [Fact(DisplayName = "AC-503.2 매개변수 표: 진료 SQL은 @from·@to Char(12)·@hospital VarChar(32), 처방 이름은 Char(8) 넷, 과거 자료 확인은 없음")]
    public void ParameterTables()
    {
        string Shape(string sql) => string.Join(" ", StatsSql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

        foreach (var sql in new[] { StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql })
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
        // 이 세 문장은 매출 표(RevenueSql)에도 글자 그대로 있어 합친 뒤에는 Sql.ParametersOf가 매출 표를 먼저 답한다.
        // RevenueSql.test.cs가 같은 문장에 매출 표와의 Assert.Same을 못 박았으므로, 이 셋만 값으로 견준다(두 표의 칸이 어긋나면 실패).
        // 그 밖의 통계 문장은 Assert.Same 그대로이고, 겹치는 문장이 새로 생기면 여기서 실패한다
        var sharedWithRevenue = new[] { StatsSql.HistoryGuardSql, StatsSql.UnsupportedFinanceSql, StatsSql.PatientsSql };
        string ParameterShape(IEnumerable<SqlParam> parameters) => string.Join(" ", parameters.Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));
        foreach (var sql in StatsSql.All)
        {
            Assert.True(Sql.IsAllowed(sql));
            if (sharedWithRevenue.Contains(sql))
            {
                Assert.True(Precheck.Core.Revenue.RevenueSql.Parameters.ContainsKey(sql));
                Assert.Equal(ParameterShape(StatsSql.ParametersOf(sql)), ParameterShape(Sql.ParametersOf(sql)));
            }
            else
            {
                Assert.Same(StatsSql.ParametersOf(sql), Sql.ParametersOf(sql));
            }
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

    // ---- stats-bit-sections: 비트 전용 세 칸 문장 다섯(REQ-2701) ------------------------------------

    // 새 SELECT 글(공백을 한 칸으로 줄인 글 기준). 앞의 Visits 부분은 접수 줄 SQL과 같은 원본 사본 글이다
    private const string VisitLinesSelect = "SELECT v.PatientId,v.VisitDay,SUBSTRING(c.OcmAcpDtm,9,4) VisitTime,RTRIM(i.InsCodNam) Insurance,NULLIF(RTRIM(c.OcmDtrCod),'') DoctorId"
        + " FROM PeriodVisits v JOIN dbo.OcmInf c ON c.OcmNum=v.VisitId"
        + " OUTER APPLY (SELECT TOP 1 m.InsCodNam FROM dbo.InsMst m WHERE m.InsCod=c.OcmInsCod AND m.InsAdpDte<=v.VisitDay ORDER BY m.InsAdpDte DESC,m.InsCodNam) i"
        + " ORDER BY v.PatientId,v.VisitDay,VisitTime";

    // reception-paper PaperVisit과 같은 보험 이름 고르기(접수 날은 VisitDay = LEFT(c.OcmAcpDtm,8))
    private const string InsuranceApply = "OUTER APPLY (SELECT TOP 1 m.InsCodNam FROM dbo.InsMst m WHERE m.InsCod=c.OcmInsCod AND m.InsAdpDte<=v.VisitDay ORDER BY m.InsAdpDte DESC,m.InsCodNam) i";

    private const string PeopleSelect = "SELECT p.PatientId,b.PbsBirDte,b.PbsDtlAdr FROM Patients p LEFT JOIN dbo.PbsInf b ON NULLIF(RTRIM(b.PbsChtNum),'')=p.PatientId ORDER BY p.PatientId";

    private static readonly string DoctorNamesText = "SELECT RTRIM(u.UidCod) Code,RTRIM(u.UidNam) Name,u.UidExpDte FROM dbo.UidMst u WHERE RTRIM(u.UidCod) IN ("
        + string.Join(",", Enumerable.Range(0, 50).Select(i => "@d" + i)) + ") ORDER BY Code,u.UidExpDte";

    // 원래 도구 BusinessStats.ByDoctor와 같은 두 곳: NativeRows 줄 머리에 칸을 더하고, 끝 SELECT SUM(…) … ; 를 묶음 SELECT로
    private const string MoneyRowStart = "SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt";
    private const string MoneyRowStartByDoctorDay = "SELECT p.OrpOcmNum,p.OrpChtNum,RTRIM(p.OrpDtrCod) DoctorId,LEFT(p.OrpAccDte,8) PaidDay,p.OrpTotAmt";
    private const string MoneyTail = "SELECT PaidDay,DoctorId,SUM(OrpTotAmt) FROM NativeRows GROUP BY PaidDay,DoctorId";

    /// <summary>원본 사본의 Visits 부분(연결 조건 한 가지만 바꾼 글, 공백을 한 칸으로 줄인 글).</summary>
    private static string VisitsOfCopy()
    {
        var original = Squash(FirstVisitJoin.ApplyTo(RowsOriginal, ReadOriginal(RowsOriginal)));
        return original.Substring(0, original.IndexOf(OrdersStart, StringComparison.Ordinal));
    }

    private static Dictionary<string, object?> MoneyArgs() =>
        Args(("@day", "20260901"), ("@nextDay", "20261001"), ("@hospital", "SYNTHETIC"));

    private static Dictionary<string, object?> NameArgs(string code) =>
        Enumerable.Range(0, 50).ToDictionary(i => "@d" + i, _ => (object?)code);

    [Fact(DisplayName = "AC-2701.1 접수 줄 SQL은 원본 사본의 Visits 부분(공백만 다름) 뒤에 접수 시각(OcmAcpDtm 9~12번째 글자)·보험 이름·진료의 코드를 읽는 정해 둔 SELECT를 이은 글이다")]
    public void VisitLinesIsVisitsPlusSelect()
    {
        Assert.Equal(VisitsOfCopy() + " " + VisitLinesSelect, Squash(StatsSql.VisitLinesSql));
        Assert.DoesNotContain("OdrInf", StatsSql.VisitLinesSql);
    }

    [Fact(DisplayName = "AC-2701.2 보험 이름은 InsMst에서 그 코드의 줄 중 InsAdpDte가 접수 날 이하인 가장 늦은 줄(같은 날이면 이름 차례 첫 줄) 하나를 OUTER APPLY로 고른다")]
    public void InsuranceIsLatestApplicableRow()
    {
        Assert.Equal(1, Count(Squash(StatsSql.VisitLinesSql), InsuranceApply));
        Assert.Contains("RTRIM(i.InsCodNam) Insurance", StatsSql.VisitLinesSql);
    }

    [Fact(DisplayName = "AC-2701.3 사람 줄 SQL은 원본 사본의 Visits 부분 뒤에 정해 둔 SELECT를 이은 글이고 환자 표에서는 차트번호·생년월일·주소(PbsDtlAdr)만 읽는다")]
    public void PeopleIsVisitsPlusSelect()
    {
        var sql = StatsSql.PeopleSql;
        Assert.Equal(VisitsOfCopy() + " " + PeopleSelect, Squash(sql));

        // 이름·전화·주민번호·상세주소(PbsAdrSta)·성별 칸은 읽지 않는다
        var columns = Regex.Matches(sql, @"\bPbs[A-Za-z]+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(new[] { "PbsBirDte", "PbsChtNum", "PbsDtlAdr", "PbsInf" }, columns);
        Assert.DoesNotContain("PbsAdrSta", sql);
        Assert.DoesNotContain("PbsSexTyp", sql);
    }

    [Fact(DisplayName = "AC-2701.4 원장님 이름 SQL은 UidMst에서 코드 50자리(@d0~@d49) 안의 줄을 코드·UidExpDte 차례로 읽는다")]
    public void DoctorNamesIsFixedText()
    {
        // 코드 자리는 열 개씩 줄을 바꿔 적었다(줄바꿈 뒤 빈칸만 뺀다)
        Assert.Equal(DoctorNamesText, Squash(StatsSql.DoctorNamesSql).Replace(", @d", ",@d"));
        Assert.Equal(50, StatsSql.DoctorCodeSlots);
    }

    public static IEnumerable<object[]> MoneyPairs() => new[]
    {
        new object[] { "report-finance-normal.sql", "normal" },
        new object[] { "report-finance-receivable.sql", "receivable" },
    };

    [Theory(DisplayName = "AC-2701.5 날·원장님 금액 SQL은 원본 FinanceNormal·FinanceReceivable 사본에서 NativeRows 줄에 진료의·수납일 칸을 더하고 끝 SELECT를 수납일·진료의 묶음 합으로 바꾼 두 곳만 다르다")]
    [MemberData(nameof(MoneyPairs))]
    public void MoneyIsFinanceByDoctorDay(string file, string kind)
    {
        var sql = kind == "normal" ? StatsSql.DoctorMoneyNormalSql : StatsSql.DoctorMoneyReceivableSql;
        var original = Squash(FirstVisitJoin.ApplyTo(file, ReadOriginal(file)));
        Assert.Equal(1, Count(original, MoneyRowStart));
        var last = original.LastIndexOf("SELECT SUM(", StringComparison.Ordinal);
        Assert.EndsWith("FROM NativeRows;", original);

        var expected = original.Substring(0, last).Replace(MoneyRowStart, MoneyRowStartByDoctorDay) + MoneyTail;
        Assert.Equal(expected, Squash(sql));
        Assert.EndsWith(MoneyTail, Squash(sql));
        Assert.Equal(1, Count(Squash(sql), MoneyRowStartByDoctorDay));
    }

    [Fact(DisplayName = "AC-2701.6 새 문장 다섯은 모두 매개변수를 받는 SELECT 하나(; · 주석 · 쓰기·실행 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 지나며 청구 Sql.All에는 없다")]
    public void SectionStatementsAreGuardedSelects()
    {
        var readable = new HashSet<string>(StringComparer.Ordinal)
        {
            "dbo.OcmInf", "dbo.DepMst", "dbo.InsMst", "dbo.PbsInf", "dbo.UidMst", "dbo.OrcInf", "dbo.OrpInf", "dbo.IrcInf", "dbo.DtlMst",
        };
        var sections = new[] { StatsSql.VisitLinesSql, StatsSql.PeopleSql, StatsSql.DoctorNamesSql, StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql };
        Assert.Equal(sections.OrderBy(sql => sql, StringComparer.Ordinal), StatsSql.Sections.OrderBy(sql => sql, StringComparer.Ordinal));

        foreach (var sql in StatsSql.Sections)
        {
            AssertSingleSelect(sql, sql);
            foreach (Match table in Regex.Matches(sql, @"dbo\.[A-Za-z]+")) Assert.Contains(table.Value, readable);
            Assert.True(StatsSql.IsAllowed(sql));
            Assert.True(Sql.IsAllowed(sql));
            Assert.Same(StatsSql.ParametersOf(sql), Sql.ParametersOf(sql));
            Assert.DoesNotContain(sql, Sql.All);

            // 문장에 나오는 @이름 = 매개변수 표의 이름
            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(StatsSql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), used);

            // 고친 글은 막는다
            Assert.False(Sql.IsAllowed(sql + " "));
        }

        ReadOnlyGuard.Require(StatsSql.VisitLinesSql, VisitArgs());
        ReadOnlyGuard.Require(StatsSql.PeopleSql, VisitArgs());
        ReadOnlyGuard.Require(StatsSql.DoctorMoneyNormalSql, MoneyArgs());
        ReadOnlyGuard.Require(StatsSql.DoctorMoneyReceivableSql, MoneyArgs());
        ReadOnlyGuard.Require(StatsSql.DoctorNamesSql, NameArgs("D001"));
    }

    [Fact(DisplayName = "AC-2701.6 새 문장 매개변수 표: 접수·사람 줄은 @from·@to Char(12)·@hospital VarChar(32), 금액은 @day·@nextDay Char(8)·@hospital VarChar(32), 이름은 @d0~@d49 VarChar(40)")]
    public void SectionParameterTables()
    {
        string Shape(string sql) => string.Join(" ", StatsSql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(StatsSql.VisitLinesSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(StatsSql.PeopleSql));
        Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(StatsSql.DoctorMoneyNormalSql));
        Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(StatsSql.DoctorMoneyReceivableSql));
        Assert.Equal(string.Join(" ", Enumerable.Range(0, 50).Select(i => "@d" + i + ":VarChar(40)")), Shape(StatsSql.DoctorNamesSql));

        // 이름 SQL: 빈 자리 NULL·41자 코드·모자란 자리는 관문이 막는다
        var withNull = NameArgs("D001");
        withNull["@d49"] = null;
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.DoctorNamesSql, withNull)).Code);
        var tooLong = NameArgs("D001");
        tooLong["@d0"] = new string('D', 41);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.DoctorNamesSql, tooLong)).Code);
        var missing = NameArgs("D001");
        missing.Remove("@d49");
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.DoctorNamesSql, missing)).Code);
        // 금액 SQL에 기간(@from) 매개변수는 없다
        var withFrom = MoneyArgs();
        withFrom["@from"] = "202609010000";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(StatsSql.DoctorMoneyNormalSql, withFrom)).Code);
    }

    [Fact(DisplayName = "AC-2701.7 새 문장은 StatsSql.Sections에만 있고 지금 통계 SQL 목록(StatsSql.All)과 그 문장 글은 그대로다")]
    public void SectionsAreSeparateFromAll()
    {
        Assert.Equal(5, StatsSql.Sections.Count);
        Assert.Empty(StatsSql.Sections.Intersect(StatsSql.All));
        Assert.Equal(14, StatsSql.All.Count);
        // 금액 SQL은 보고 금액 SQL 글을 고치지 않고 따로 만든 글이다
        Assert.EndsWith("FROM NativeRows;", Squash(StatsSql.FinanceNormalSql));
        Assert.EndsWith("FROM NativeRows;", Squash(StatsSql.FinanceReceivableSql));
        Assert.Equal(1, Count(Squash(StatsSql.FinanceNormalSql), MoneyRowStart));
        Assert.Equal(1, Count(Squash(StatsSql.FinanceReceivableSql), MoneyRowStart));
    }
}
