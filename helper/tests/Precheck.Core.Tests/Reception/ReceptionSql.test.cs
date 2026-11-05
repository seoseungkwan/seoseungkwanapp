using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using static Precheck.Core.Reception.ReceptionSql;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Reception;

/// <summary>
/// AC-1403.1 접수 현황 문장(ReceptionSql)은 모두 매개변수를 받는 SELECT 하나이고, Sql.IsAllowed가 받으며, 정해 둔 매개변수 표와 함께만
/// ReadOnlyGuard를 지난다. 내원은 등록 병원 범위 안에서만 읽고, 표·칸은 이 저장소의 다른 허용 문장이 이미 읽는 것뿐이다.
/// AC-1403.7 처방 이름표는 SeeMst에서 코드마다 적용일이 가장 늦은 이름(RevenueSql과 같은 규칙)이다.
/// AC-1404.6 SQL Server 2008 R2에서 도는 글(OFFSET·FETCH 없이 ROW_NUMBER())이고, 차트번호 칸은 함수 없이 견준다.
/// </summary>
public class ReceptionSqlTests
{
    /// <summary>설계 표의 이름 → 문장.</summary>
    private static readonly Dictionary<string, string> Statements = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = ReceptionSql.TodayVisits,
        ["TodayRx"] = ReceptionSql.TodayRx,
        ["PriorVisits"] = ReceptionSql.PriorVisits,
        ["PriorRx"] = ReceptionSql.PriorRx,
        ["RxNames"] = ReceptionSql.RxNames,
        ["HistoryCount"] = ReceptionSql.HistoryCount,
        ["HistoryPage"] = ReceptionSql.HistoryPage,
    };

    // ---- 설계 표(design.md 3절) ----------------------------------------------------------------------

    /// <summary>문장 이름 → 결과 칸(순서대로).</summary>
    private static readonly Dictionary<string, string[]> Columns = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = new[] { "VisitId", "PatientId", "AcceptedAt", "Status", "Rsu" },
        ["TodayRx"] = new[] { "VisitId", "RxCode" },
        ["PriorVisits"] = new[] { "TodayVisitId", "EarlierCount", "LastVisitId", "LastDay" },
        ["PriorRx"] = new[] { "LastVisitId", "RxCode" },
        ["RxNames"] = new[] { "Code", "Name", "AdpDte" },
        ["HistoryCount"] = new[] { "Count", "FirstDay" },
        ["HistoryPage"] = new[] { "VisitId", "VisitDay", "RxCode" },
    };

    private static readonly string[] TodayParams = { "@from", "@to", "@hospital" };
    private static readonly string[] HistoryParams = { "@chart", "@before", "@hospital" };

    /// <summary>문장 이름 → 받는 매개변수.</summary>
    private static readonly Dictionary<string, string[]> Named = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = TodayParams,
        ["TodayRx"] = TodayParams,
        ["PriorVisits"] = TodayParams,
        ["PriorRx"] = TodayParams,
        ["RxNames"] = new string[0],
        ["HistoryCount"] = HistoryParams,
        ["HistoryPage"] = HistoryParams.Concat(new[] { "@first", "@last" }).ToArray(),
    };

    private static readonly Dictionary<string, string> Kinds = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["@from"] = "Char:12",
        ["@to"] = "Char:12",
        ["@hospital"] = "VarChar:32",
        ["@chart"] = "VarChar:14",
        ["@before"] = "VarChar:20",
        ["@first"] = "Int:0",
        ["@last"] = "Int:0",
    };

    /// <summary>내원을 읽는 곳마다 붙는 병원 범위 조건(Sql.HistoryVisitSql과 같은 글).</summary>
    private const string InHospital =
        "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>완료 외래 내원 조건(Sql.HistoryVisitSql의 V와 같은 글).</summary>
    private const string DoneVisit = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')";

    /// <summary>처방 줄 조건(Sql.HistoryCodeSql과 같은 글).</summary>
    private const string RxRow = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    /// <summary>차트번호에 함수를 씌운 글(답 칸으로 내는 RTRIM 하나만 따로 본다).</summary>
    private static readonly Regex WrappedChart = new Regex(
        @"\b(?:RTRIM|LTRIM|LEFT|RIGHT|SUBSTRING|ISNULL|NULLIF|COALESCE|UPPER|LOWER|CAST|CONVERT|REPLACE|LEN|DATALENGTH)\s*\([^()]*OcmChtNum",
        RegexOptions.IgnoreCase);

    /// <summary>비트 표·칸 이름 모양(세 글자 마디 둘 이상: OcmChtNum, SeeMst …).</summary>
    private static readonly Regex BitName = new Regex(@"\b[A-Z][a-z]{2}(?:[A-Z][a-z]{2})+\b");

    private static Dictionary<string, string> All()
    {
        Assert.Equal(Columns.Keys.OrderBy(name => name, StringComparer.Ordinal), Statements.Keys.OrderBy(name => name, StringComparer.Ordinal));
        return Statements;
    }

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    private static object? ValidValue(SqlParam parameter) => parameter.Name switch
    {
        "@from" => "202611050000",
        "@to" => "202611060000",
        "@hospital" => Synthetic.Scope,
        "@chart" => "900001",
        "@before" => "20261105104233",
        "@first" => 1,
        "@last" => 5,
        _ => throw new InvalidOperationException(parameter.Name),
    };

    private static Dictionary<string, object?> ValidArgs(string sql) =>
        Parameters[sql].ToDictionary(parameter => parameter.Name, ValidValue, StringComparer.Ordinal);

    /// <summary>괄호 밖(깊이 0)의 SELECT 하나의 결과 칸 이름. WITH 문장의 CTE는 괄호 안이라 빠진다.</summary>
    private static string[] OuterColumns(string sql)
    {
        var text = Squash(sql);
        var depth = 0;
        int start = -1, end = -1;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == '(') depth++;
            else if (text[i] == ')') depth--;
            else if (depth == 0 && start < 0 && string.CompareOrdinal(text, i, "SELECT ", 0, 7) == 0) start = i + 7;
            else if (depth == 0 && start >= 0 && string.CompareOrdinal(text, i, " FROM ", 0, 6) == 0) { end = i; break; }
        }
        Assert.True(start >= 0 && end > start, "괄호 밖 SELECT … FROM을 찾지 못했다");

        var items = new List<string>();
        var item = new System.Text.StringBuilder();
        depth = 0;
        foreach (var ch in text.Substring(start, end - start))
        {
            if (ch == '(') depth++;
            if (ch == ')') depth--;
            if (ch == ',' && depth == 0) { items.Add(item.ToString()); item.Clear(); }
            else item.Append(ch);
        }
        items.Add(item.ToString());
        return items.Select(part =>
        {
            var last = part.Trim().Split(' ').Last();
            return last.Substring(last.LastIndexOf('.') + 1);
        }).ToArray();
    }

    // ---- AC-1403.1 읽기 문장 하나·허용 목록 --------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.1 문장은 설계 표의 7개이고 매개변수 표와 같으며, 모두 읽기 문장 하나다(SELECT·WITH 시작, ;·주석·쓰기 낱말 없음)")]
    public void StatementsAreSingleReads()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|DECLARE|SET)\b|xp_|sp_", RegexOptions.IgnoreCase);
        var all = All();
        Assert.Equal(7, all.Values.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(all.Values.OrderBy(sql => sql, StringComparer.Ordinal), Parameters.Keys.OrderBy(sql => sql, StringComparer.Ordinal));
        foreach (var sql in all.Values)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
            Assert.DoesNotMatch(forbidden, sql);
        }
    }

    [Fact(DisplayName = "AC-1403.1 결과 칸은 설계 표(design.md 3절) 그대로다")]
    public void ColumnsMatchDesignTable()
    {
        foreach (var pair in All()) Assert.Equal(Columns[pair.Key], OuterColumns(pair.Value));
    }

    [Fact(DisplayName = "AC-1403.1 매개변수 표 = 문장 속 @이름, @from·@to Char 12, @hospital VarChar 32, @chart VarChar 14, @before VarChar 20, @first·@last Int, RxNames는 없음")]
    public void ParameterTableMatchesStatements()
    {
        foreach (var pair in All())
        {
            var named = Regex.Matches(pair.Value, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(name => name, StringComparer.Ordinal).ToArray();
            var declared = Parameters[pair.Value];
            Assert.Equal(Named[pair.Key].OrderBy(name => name, StringComparer.Ordinal), named);
            Assert.Equal(named, declared.Select(p => p.Name).OrderBy(name => name, StringComparer.Ordinal));
            foreach (var parameter in declared) Assert.Equal(Kinds[parameter.Name], parameter.Kind + ":" + parameter.Size);
        }
        Assert.Empty(Parameters[RxNames]);
    }

    [Fact(DisplayName = "AC-1403.1 Sql.IsAllowed가 받고, ReadOnlyGuard는 정해 둔 매개변수와 함께 통과시키며, Sql.ParametersOf는 같은 표를 준다")]
    public void GuardPassesReceptionStatements()
    {
        foreach (var sql in All().Values)
        {
            Assert.True(Sql.IsAllowed(sql));
            ReadOnlyGuard.Require(sql);
            ReadOnlyGuard.Require(sql, ValidArgs(sql));
            Assert.Same(Parameters[sql], Sql.ParametersOf(sql));
        }
    }

    [Fact(DisplayName = "AC-1403.1 글자를 고친 문장(끝 공백·덧붙인 DELETE·소문자·병원 값을 글로 박음)은 E-BIT-READ-FAILED로 막는다")]
    public void GuardRefusesChangedStatements()
    {
        foreach (var sql in All().Values)
        {
            var changed = new List<string> { sql + " ", sql + "; DELETE FROM dbo.OcmInf", sql.ToLowerInvariant() };
            if (sql.Contains("@hospital")) changed.Add(sql.Replace("@hospital", "'SYNTHETIC'"));
            foreach (var bad in changed)
            {
                Assert.False(Sql.IsAllowed(bad));
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(bad)).Code);
            }
        }
    }

    [Fact(DisplayName = "AC-1403.1 매개변수가 빠지거나·더해지거나·종류가 틀리거나·길면 막고, 딱 맞는 길이는 지난다")]
    public void GuardRefusesBadArguments()
    {
        foreach (var sql in All().Values)
        {
            var extra = ValidArgs(sql);
            extra["@today"] = "20261105";
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);

            foreach (var parameter in Parameters[sql])
            {
                var missing = ValidArgs(sql);
                missing.Remove(parameter.Name);
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, missing)).Code);

                var wrongKind = ValidArgs(sql);
                wrongKind[parameter.Name] = parameter.Kind == SqlParamKind.Int ? (object)"1" : 900001;
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, wrongKind)).Code);

                if (parameter.Kind == SqlParamKind.Int) continue;
                var fits = ValidArgs(sql);
                fits[parameter.Name] = new string('9', parameter.Size);
                ReadOnlyGuard.Require(sql, fits);

                var tooLong = ValidArgs(sql);
                tooLong[parameter.Name] = new string('9', parameter.Size + 1);
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong)).Code);
            }
        }
    }

    [Fact(DisplayName = "AC-1403.1 내원(OcmInf)을 읽는 곳마다 등록 병원 범위(DepMst.DepHspNum=@hospital) 조건이 있고, 처방(OdrInf)은 그 내원에 붙여서만 읽는다")]
    public void EveryVisitReadIsScopedToHospital()
    {
        Assert.Contains(InHospital, Squash(Sql.HistoryVisitSql), StringComparison.Ordinal);
        foreach (var pair in All())
        {
            var sql = Squash(pair.Value);
            var visitReads = Count(sql, "dbo.OcmInf");
            Assert.Equal(visitReads, Count(sql, "FROM dbo.OcmInf c ") + Count(sql, "JOIN dbo.OcmInf c "));
            Assert.Equal(visitReads, Count(sql, InHospital));

            var rxReads = Count(sql, "dbo.OdrInf");
            Assert.Equal(rxReads, Regex.Matches(sql, @"FROM dbo\.OdrInf o JOIN ([TPH]) ON \1\.OcmNum=o\.OdrOcmNum WHERE ").Count);

            if (pair.Key == "RxNames")
            {
                Assert.Equal(0, visitReads);
                Assert.DoesNotContain("@hospital", sql, StringComparison.Ordinal);
            }
            else
            {
                Assert.True(visitReads > 0, pair.Key);
                Assert.Contains("d.DepHspNum=@hospital", sql, StringComparison.Ordinal);
            }
        }
    }

    [Fact(DisplayName = "AC-1403.1 오늘 접수는 상태로 거르지 않고(외래·병원 범위만), 지난 내원은 HistoryVisitSql과 같은 완료 조건, 처방 줄은 HistoryCodeSql과 같은 조건이다")]
    public void ConditionsMatchExistingStatements()
    {
        Assert.Contains(DoneVisit, Squash(Sql.HistoryVisitSql), StringComparison.Ordinal);
        Assert.Contains(RxRow, Squash(Sql.HistoryCodeSql), StringComparison.Ordinal);

        foreach (var sql in new[] { TodayVisits, TodayRx })
        {
            var squashed = Squash(sql);
            Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND " + InHospital, squashed, StringComparison.Ordinal);
            Assert.DoesNotContain("OcmComStt IN", squashed, StringComparison.Ordinal);
            Assert.DoesNotContain("OcmRsuYon<>", squashed, StringComparison.Ordinal);
        }
        Assert.Equal(1, Count(Squash(PriorVisits), DoneVisit));
        Assert.Equal(1, Count(Squash(PriorRx), DoneVisit));
        Assert.Equal(1, Count(Squash(HistoryCount), DoneVisit));
        Assert.Equal(1, Count(Squash(HistoryPage), DoneVisit));
        foreach (var sql in new[] { TodayRx, PriorRx, HistoryPage }) Assert.Equal(1, Count(Squash(sql), RxRow));

        // 앞선 내원 = 그 접수 시각보다 앞(같은 내원은 빠진다). 오늘 접수 시각은 원값 그대로 낸다(design.md 3절)
        Assert.Contains("c.OcmAcpDtm<T.OcmAcpDtm", Squash(PriorVisits), StringComparison.Ordinal);
        Assert.Contains("c.OcmAcpDtm<@before", Squash(HistoryCount), StringComparison.Ordinal);
        Assert.Contains("c.OcmAcpDtm<@before", Squash(HistoryPage), StringComparison.Ordinal);
        Assert.Contains("T.OcmAcpDtm AcceptedAt", Squash(TodayVisits), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1403.1 읽는 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql)이 이미 읽는 것뿐이다(목록 대조)")]
    public void ReadsOnlyColumnsAlreadyUsed()
    {
        var existingStatements = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).ToArray();
        var existing = new HashSet<string>(existingStatements.SelectMany(sql => BitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        var resultNames = new HashSet<string>(Columns.Values.SelectMany(names => names), StringComparer.Ordinal);

        var used = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sql in All().Values)
        {
            Assert.DoesNotContain(sql, existingStatements);
            foreach (Match m in BitName.Matches(sql)) if (!resultNames.Contains(m.Value)) used.Add(m.Value);
        }

        // 시험이 빈 곳을 보지 않는지: 꼭 읽는 칸이 목록에 잡혔다
        foreach (var name in new[] { "OcmInf", "OcmChtNum", "OcmAcpDtm", "OcmComStt", "OcmRsuYon", "OdrInf", "OdrCod", "SeeMst", "SeeKorNam", "SeeAdpDte" }) Assert.Contains(name, used);
        Assert.Empty(used.Where(name => !existing.Contains(name)).OrderBy(name => name, StringComparer.Ordinal));
        Assert.Empty(used.Where(name => name.EndsWith("Inf", StringComparison.Ordinal) || name.EndsWith("Mst", StringComparison.Ordinal))
            .Except(new[] { "OcmInf", "OdrInf", "DepMst", "SeeMst" }));
    }

    // ---- AC-1403.7 처방 이름표 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.7 RxNames는 SeeMst만 읽고, 코드마다 적용일(SeeAdpDte)이 가장 늦은 이름 한 줄이다(RevenueSql과 같은 규칙), 코드 모양은 처방 문장과 같다")]
    public void RxNamesPicksLatestNamePerCode()
    {
        var sql = Squash(RxNames);
        Assert.Contains("ORDER BY s.SeeAdpDte DESC", Squash(RevenueSql.CodeAmounts), StringComparison.Ordinal);

        Assert.Equal(new[] { "SeeMst" }, BitName.Matches(sql).Cast<Match>().Select(m => m.Value).Where(name => name.EndsWith("Inf", StringComparison.Ordinal) || name.EndsWith("Mst", StringComparison.Ordinal)).Distinct());
        Assert.Contains("UPPER(RTRIM(s.SeeOdrCod)) Code,RTRIM(s.SeeKorNam) Name,s.SeeAdpDte AdpDte", sql, StringComparison.Ordinal);
        Assert.Contains("ROW_NUMBER() OVER (PARTITION BY UPPER(RTRIM(s.SeeOdrCod)) ORDER BY s.SeeAdpDte DESC", sql, StringComparison.Ordinal);
        Assert.EndsWith("WHERE N.Seq=1", sql, StringComparison.Ordinal);
        Assert.Empty(Parameters[RxNames]);

        // 이름표 열쇠(UPPER(RTRIM(코드)))와 처방 문장의 RxCode가 같은 모양이라 그대로 맞춰 볼 수 있다
        foreach (var rx in new[] { TodayRx, PriorRx, HistoryPage }) Assert.Contains("UPPER(RTRIM(o.OdrCod)) RxCode", Squash(rx), StringComparison.Ordinal);
    }

    // ---- AC-1404.6 SQL Server 2008 R2·차트번호 -------------------------------------------------------

    [Fact(DisplayName = "AC-1404.6 모든 문장에 OFFSET·FETCH와 2012 뒤에 생긴 글이 없고, 상세 쪽은 ROW_NUMBER() 창으로 @first~@last를 자른다")]
    public void RunsOnSqlServer2008R2()
    {
        var newer = new Regex(@"\b(OFFSET|FETCH|IIF|CONCAT|FORMAT|TRY_CONVERT|TRY_CAST|TRY_PARSE|LAG|LEAD|FIRST_VALUE|LAST_VALUE|EOMONTH|DATEFROMPARTS|STRING_AGG|STRING_SPLIT|ROWS|RANGE)\b", RegexOptions.IgnoreCase);
        var aggregateWithOrder = new Regex(@"\b(COUNT|COUNT_BIG|SUM|MIN|MAX|AVG)\s*\([^()]*\)\s*OVER\s*\([^)]*ORDER BY", RegexOptions.IgnoreCase);
        foreach (var sql in All().Values)
        {
            Assert.DoesNotMatch(newer, sql);
            Assert.DoesNotMatch(aggregateWithOrder, sql);
        }

        var page = Squash(HistoryPage);
        Assert.Contains("ROW_NUMBER() OVER (ORDER BY c.OcmAcpDtm DESC,c.OcmNum DESC) Seq", page, StringComparison.Ordinal);
        Assert.Equal(2, Count(page, "H.Seq BETWEEN @first AND @last"));
        Assert.Contains("ORDER BY H.Seq,R.RxCode", page, StringComparison.Ordinal);
        Assert.Contains("LEFT JOIN R ON R.OdrOcmNum=H.OcmNum", page, StringComparison.Ordinal);
        Assert.Contains("ROW_NUMBER() OVER (PARTITION BY T.OcmNum ORDER BY c.OcmAcpDtm DESC,c.OcmNum DESC) Seq", Squash(PriorVisits), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1404.6 차트번호 칸은 함수 없이 견준다(c.OcmChtNum=@chart, c.OcmChtNum=T.OcmChtNum), 함수는 답 칸 RTRIM(T.OcmChtNum) PatientId 하나뿐")]
    public void ChartIsComparedBare()
    {
        Assert.Contains("c.OcmChtNum=@chart AND ", Squash(HistoryCount), StringComparison.Ordinal);
        Assert.Contains("c.OcmChtNum=@chart AND ", Squash(HistoryPage), StringComparison.Ordinal);
        Assert.Contains("JOIN dbo.OcmInf c ON c.OcmChtNum=T.OcmChtNum WHERE T.OcmChtNum<>'' AND ", Squash(PriorVisits), StringComparison.Ordinal);
        Assert.Contains("JOIN dbo.OcmInf c ON c.OcmChtNum=T.OcmChtNum WHERE T.OcmChtNum<>'' AND ", Squash(PriorRx), StringComparison.Ordinal);

        const string Output = "RTRIM(T.OcmChtNum) PatientId";
        Assert.Equal(1, Count(Squash(TodayVisits), Output));
        foreach (var sql in All().Values)
        {
            Assert.DoesNotMatch(WrappedChart, Squash(sql).Replace(Output, "PatientId"));
        }
        // 시험이 빈 곳을 보지 않는지: 씌운 글은 잡는다
        Assert.Matches(WrappedChart, "WHERE NULLIF(RTRIM(c.OcmChtNum),'')=@chart");
        Assert.Matches(WrappedChart, Squash(TodayVisits));
    }
}
