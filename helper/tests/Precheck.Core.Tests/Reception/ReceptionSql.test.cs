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
/// AC-1410.4 증상 문장(VisitSymptoms)은 그 쪽 지난 내원과 그 접수의 EmrInf(내원번호 칸 EmrOcmNum) 중 EmrShtTyp='S'이고 빈 글 아닌 EmrShtVal 줄을 EmrUpdDtm 순으로 준다.
/// </summary>
public class ReceptionSqlTests
{
    /// <summary>설계 표의 이름 → 문장.</summary>
    private static readonly Dictionary<string, string> Statements = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = ReceptionSql.TodayVisits,
        ["TodayRx"] = ReceptionSql.TodayRx,
        ["PriorVisits"] = ReceptionSql.PriorVisits,
        ["PriorSymptoms"] = ReceptionSql.PriorSymptoms,
        ["RxNames"] = ReceptionSql.RxNames,
        ["HistoryCount"] = ReceptionSql.HistoryCount,
        ["HistoryPage"] = ReceptionSql.HistoryPage,
        ["TodayPeople"] = ReceptionSql.TodayPeople,
        ["TodayMemos"] = ReceptionSql.TodayMemos,
        ["TodayPaid"] = ReceptionSql.TodayPaid,
        ["VisitSymptoms"] = ReceptionSql.VisitSymptoms,
    };

    // ---- 설계 표(design.md 3절) ----------------------------------------------------------------------

    /// <summary>문장 이름 → 결과 칸(순서대로).</summary>
    private static readonly Dictionary<string, string[]> Columns = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = new[] { "VisitId", "PatientId", "AcceptedAt", "Status", "Rsu", "Nfs" },
        ["TodayRx"] = new[] { "VisitId", "RxCode" },
        ["PriorVisits"] = new[] { "TodayVisitId", "EarlierCount", "LastVisitId", "LastDay" },
        ["PriorSymptoms"] = new[] { "LastVisitId", "Line" },
        ["RxNames"] = new[] { "Code", "Name", "AdpDte" },
        ["HistoryCount"] = new[] { "Count", "FirstDay" },
        ["HistoryPage"] = new[] { "VisitId", "VisitDay", "RxCode" },
        ["TodayPeople"] = new[] { "VisitId", "Name", "BirthDate", "Sex" },
        ["TodayMemos"] = new[] { "VisitId", "Memo" },
        ["TodayPaid"] = new[] { "VisitId", "PaidAt" },
        ["VisitSymptoms"] = new[] { "VisitId", "Line" },
    };

    private static readonly string[] TodayParams = { "@from", "@to", "@hospital" };
    private static readonly string[] HistoryParams = { "@chart", "@before", "@hospital" };

    /// <summary>문장 이름 → 받는 매개변수.</summary>
    private static readonly Dictionary<string, string[]> Named = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayVisits"] = TodayParams,
        ["TodayRx"] = TodayParams,
        ["PriorVisits"] = TodayParams,
        ["PriorSymptoms"] = TodayParams,
        ["RxNames"] = new string[0],
        ["HistoryCount"] = HistoryParams,
        ["HistoryPage"] = HistoryParams.Concat(new[] { "@first", "@last" }).ToArray(),
        ["TodayPeople"] = TodayParams,
        ["TodayMemos"] = TodayParams,
        ["TodayPaid"] = TodayParams,
        ["VisitSymptoms"] = HistoryParams.Concat(new[] { "@first", "@last" }).ToArray(),
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

    /// <summary>매개변수 표에 함께 있는 종이 기록부 문장 다섯(spec reception-paper AC-1501.8, 시험은 PaperSql.test.cs).</summary>
    private static readonly string[] PaperStatements = { PaperPerson, PaperVisit, PaperSymptoms, PaperDx, PaperOrders };

    /// <summary>매개변수 표에 함께 있는 어레인지 문장 다섯(spec reception-arrange AC-3303.1·AC-3307.2, 시험은 ArrangeSql.test.cs).</summary>
    private static readonly string[] ArrangeStatements = { TodayOrderTimes, PrevPaperVisit, PrevPaperSymptoms, PrevPaperDx, PrevPaperOrders };

    /// <summary>매개변수 표에 함께 있는 지난 종이 문장 넷(spec reception-memo-papers AC-3404.2, 시험은 PastPaperSql.test.cs).</summary>
    private static readonly string[] PastPaperStatements = { PastPaperVisits, PastPaperSymptoms, PastPaperDx, PastPaperOrders };

    /// <summary>매개변수 표에 함께 있는 설정 화면 문장 둘(spec reception-other-clinic AC-5705.4, 시험은 CodesReader.test.cs).</summary>
    private static readonly string[] CodesStatements = { RecentCodes, CodeName };

    [Fact(DisplayName = "AC-1403.1 문장은 설계 표의 11개(확인 칸 문장 넷 포함)이고 매개변수 표는 이 11개와 종이 기록부 문장 다섯(spec reception-paper)·어레인지 문장 다섯(spec reception-arrange)·지난 종이 문장 넷(spec reception-memo-papers)·설정 화면 문장 둘(spec reception-other-clinic AC-5705.4)뿐이며, 모두 읽기 문장 하나다(SELECT·WITH 시작, ;·주석·쓰기 낱말 없음)")]
    public void StatementsAreSingleReads()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|DECLARE|SET)\b|xp_|sp_", RegexOptions.IgnoreCase);
        var all = All();
        Assert.Equal(11, all.Values.Distinct(StringComparer.Ordinal).Count());
        Assert.Empty(PaperStatements.Intersect(all.Values, StringComparer.Ordinal));
        Assert.Empty(ArrangeStatements.Intersect(all.Values.Concat(PaperStatements), StringComparer.Ordinal));
        Assert.Equal(5, ArrangeStatements.Distinct(StringComparer.Ordinal).Count());
        Assert.Empty(PastPaperStatements.Intersect(all.Values.Concat(PaperStatements).Concat(ArrangeStatements), StringComparer.Ordinal));
        Assert.Equal(4, PastPaperStatements.Distinct(StringComparer.Ordinal).Count());
        Assert.Empty(CodesStatements.Intersect(all.Values.Concat(PaperStatements).Concat(ArrangeStatements).Concat(PastPaperStatements), StringComparer.Ordinal));
        Assert.Equal(2, CodesStatements.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(
            all.Values.Concat(PaperStatements).Concat(ArrangeStatements).Concat(PastPaperStatements).Concat(CodesStatements).OrderBy(sql => sql, StringComparer.Ordinal),
            Parameters.Keys.OrderBy(sql => sql, StringComparer.Ordinal));
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

        foreach (var sql in new[] { TodayVisits, TodayRx, TodayPeople, TodayMemos, TodayPaid })
        {
            var squashed = Squash(sql);
            Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND " + InHospital, squashed, StringComparison.Ordinal);
            Assert.DoesNotContain("OcmComStt IN", squashed, StringComparison.Ordinal);
            Assert.DoesNotContain("OcmRsuYon<>", squashed, StringComparison.Ordinal);
        }
        Assert.Equal(1, Count(Squash(PriorVisits), DoneVisit));
        Assert.Equal(1, Count(Squash(PriorSymptoms), DoneVisit));
        Assert.Equal(1, Count(Squash(HistoryCount), DoneVisit));
        Assert.Equal(1, Count(Squash(HistoryPage), DoneVisit));
        foreach (var sql in new[] { TodayRx, HistoryPage }) Assert.Equal(1, Count(Squash(sql), RxRow));

        // 앞선 내원 = 그 접수 시각보다 앞(같은 내원은 빠진다). 오늘 접수 시각은 원값 그대로 낸다(design.md 3절)
        Assert.Contains("c.OcmAcpDtm<T.OcmAcpDtm", Squash(PriorVisits), StringComparison.Ordinal);
        Assert.Contains("c.OcmAcpDtm<@before", Squash(HistoryCount), StringComparison.Ordinal);
        Assert.Contains("c.OcmAcpDtm<@before", Squash(HistoryPage), StringComparison.Ordinal);
        Assert.Contains("T.OcmAcpDtm AcceptedAt", Squash(TodayVisits), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1403.1 읽는 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql)이 이미 읽는 것과 확인 결과로 채운 칸(ReceptionMap.Columns)뿐이다(목록 대조)")]
    public void ReadsOnlyColumnsAlreadyUsed()
    {
        var existingStatements = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).ToArray();
        var existing = new HashSet<string>(existingStatements.SelectMany(sql => BitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        var resultNames = new HashSet<string>(Columns.Values.SelectMany(names => names), StringComparer.Ordinal);
        var filled = FilledColumns().SelectMany(c => new[] { c.Table, c.Column }).ToArray();
        Assert.NotEmpty(filled);
        existing.UnionWith(filled);
        existing.UnionWith(SymptomLinkColumns);

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
            .Except(new[] { "OcmInf", "OdrInf", "DepMst", "SeeMst" }.Concat(FilledColumns().Select(c => c.Table))));
    }

    /// <summary>
    /// 증상 줄(Columns.Symptom = EmrInf.EmrShtVal)을 읽을 때 함께 쓰는 EmrInf 칸(docs/reception/check-result.md 3회차 '증상 칸 이어 붙이기'):
    /// 내원번호 칸 EmrOcmNum, 기록지 종류 칸 EmrShtTyp, 줄 순서 칸 EmrUpdDtm. 이 셋 말고 다른 칸은 읽지 않는다.
    /// </summary>
    private static readonly string[] SymptomLinkColumns = { "EmrOcmNum", "EmrShtTyp", "EmrUpdDtm" };

    /// <summary>확인 결과로 채운 칸(ReceptionMap.Columns에서 찾은 것만).</summary>
    private static ColumnRef[] FilledColumns()
    {
        var plan = ReceptionMap.Columns;
        if (plan == null) return new ColumnRef[0];
        return new[] { plan.Name, plan.BirthDate, plan.Sex, plan.Memo, plan.PaidAt, plan.Symptom }.Where(c => c != null).Select(c => c!).ToArray();
    }

    // ---- AC-1410.3 확인 결과로 채운 칸 문장 -----------------------------------------------------------------

    [Fact(DisplayName = "AC-1410.3 채운 칸(ReceptionMap.Columns)은 이름 PbsInf.PbsPatNam·생년월일 PbsBirDte·성별 PbsSexTyp·접수 메모 OcmInf.OcmRefCmt·수납 시각 OrcInf.OrcUpdDtm·증상 EmrInf.EmrShtVal이다")]
    public void FilledColumnsMatchReport()
    {
        var plan = ReceptionMap.Columns;
        Assert.NotNull(plan);
        string Of(ColumnRef? c) => c == null ? "" : c.Table + "." + c.Column;
        Assert.Equal("PbsInf.PbsPatNam", Of(plan!.Name));
        Assert.Equal("PbsInf.PbsBirDte", Of(plan.BirthDate));
        Assert.Equal("PbsInf.PbsSexTyp", Of(plan.Sex));
        Assert.Equal("OcmInf.OcmRefCmt", Of(plan.Memo));
        Assert.Equal("OrcInf.OrcUpdDtm", Of(plan.PaidAt));
        Assert.Equal("EmrInf.EmrShtVal", Of(plan.Symptom));
    }

    [Fact(DisplayName = "AC-1410.3 칸 문장(TodayPeople·TodayMemos·TodayPaid)은 허용 목록의 상수이고 채운 칸 이름 그대로 읽는다(사람은 차트번호로, 수납은 내원번호로 잇는다)")]
    public void FilledStatementsReadPlanColumns()
    {
        var plan = ReceptionMap.Columns!;
        foreach (var sql in new[] { TodayPeople, TodayMemos, TodayPaid }) Assert.True(Sql.IsAllowed(sql));

        var people = Squash(TodayPeople);
        Assert.Contains("SELECT T.OcmNum VisitId,RTRIM(p." + plan.Name!.Column + ") Name,RTRIM(p." + plan.BirthDate!.Column + ") BirthDate,RTRIM(p." + plan.Sex!.Column + ") Sex FROM T", people, StringComparison.Ordinal);
        Assert.Contains("JOIN dbo." + plan.Name.Table + " p ON p.PbsChtNum=T.OcmChtNum WHERE T.OcmChtNum<>''", people, StringComparison.Ordinal);

        var memos = Squash(TodayMemos);
        Assert.StartsWith("SELECT c.OcmNum VisitId,RTRIM(CAST(c." + plan.Memo!.Column + " AS nvarchar(max))) Memo FROM dbo." + plan.Memo.Table + " c WHERE ", memos, StringComparison.Ordinal);

        var paid = Squash(TodayPaid);
        Assert.Contains("FROM dbo." + plan.PaidAt!.Table + " r JOIN T ON T.OcmNum=r.OrcOcmNum", paid, StringComparison.Ordinal);
        Assert.Contains("r." + plan.PaidAt.Column, paid, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1410.3 수납 시각은 내원마다 가장 늦은 OrcInf.OrcUpdDtm 하나다(MAX, 내원번호로 묶음)")]
    public void PaidIsLatestPerVisit()
    {
        Assert.EndsWith("SELECT r.OrcOcmNum VisitId,MAX(r.OrcUpdDtm) PaidAt FROM dbo.OrcInf r JOIN T ON T.OcmNum=r.OrcOcmNum GROUP BY r.OrcOcmNum", Squash(TodayPaid), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1410.3 주민번호 칸은 읽지 않는다(생년·성별은 생년월일·성별 칸으로, 주민번호 모양 칸을 읽을 때만 LEFT(…,7))")]
    public void NoResidentNumber()
    {
        foreach (var sql in All().Values) Assert.DoesNotContain("ResNum", sql, StringComparison.Ordinal);
    }

    // ---- AC-1410.4 증상 문장 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1410.4 VisitSymptoms는 허용 목록의 상수이고 HistoryPage와 같은 매개변수(@chart·@before·@hospital·@first·@last)를 받으며, 결과 칸은 VisitId·Line이다")]
    public void SymptomStatementIsAllowed()
    {
        Assert.True(Sql.IsAllowed(VisitSymptoms));
        Assert.Same(Parameters[VisitSymptoms], Sql.ParametersOf(VisitSymptoms));
        Assert.Equal(
            Parameters[HistoryPage].Select(p => p.Name + ":" + p.Kind + ":" + p.Size),
            Parameters[VisitSymptoms].Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        Assert.Equal(new[] { "VisitId", "Line" }, OuterColumns(VisitSymptoms));
    }

    [Fact(DisplayName = "AC-1410.4 증상 내원은 HistoryPage와 같은 H 창의 최근 순 @first~@last번째 지난 내원과, 그 접수(같은 차트번호·OcmAcpDtm=@before 원값·외래·병원 범위)다")]
    public void SymptomVisitsArePageAndToday()
    {
        var sql = Squash(VisitSymptoms);
        var historyCte = Squash(HistoryPage.Substring(0, HistoryPage.IndexOf(", R AS (", StringComparison.Ordinal)));
        Assert.StartsWith(historyCte + ", V AS ( SELECT H.OcmNum FROM H WHERE H.Seq BETWEEN @first AND @last UNION ALL ", sql, StringComparison.Ordinal);
        Assert.Equal(1, Count(sql, DoneVisit));
        Assert.Contains(
            "UNION ALL SELECT c.OcmNum FROM dbo.OcmInf c WHERE c.OcmChtNum=@chart AND c.OcmAcpDtm=@before AND c.OcmPatTyp='O' AND " + InHospital + " )",
            sql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1410.4 증상 줄은 그 내원(V.OcmNum)에 내원번호 칸 EmrOcmNum으로 이은 EmrInf에서 EmrShtTyp='S'이고 빈 글 아닌 EmrShtVal 줄만, 내원마다 EmrUpdDtm 순이다(잇기는 도우미가 한다)")]
    public void SymptomLinesFromSheetS()
    {
        var plan = ReceptionMap.Columns!;
        var symptom = plan.Symptom!;
        var sql = Squash(VisitSymptoms);
        Assert.Contains(
            "SELECT V.OcmNum VisitId,CAST(e." + symptom.Column + " AS nvarchar(max)) Line FROM V JOIN dbo." + symptom.Table + " e ON e.EmrOcmNum=V.OcmNum",
            sql, StringComparison.Ordinal);
        Assert.Contains("WHERE e.EmrShtTyp='S' AND LEN(LTRIM(CAST(e." + symptom.Column + " AS nvarchar(max))))>0", sql, StringComparison.Ordinal);
        Assert.EndsWith("ORDER BY V.OcmNum,e.EmrUpdDtm", sql, StringComparison.Ordinal);
        // SQL Server 2008 R2: 줄 잇기(STRING_AGG·FOR XML PATH)는 문장에 없다
        Assert.DoesNotContain("FOR XML", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("STRING_AGG", sql, StringComparison.OrdinalIgnoreCase);
        // 표에서 읽는 칸은 증상 칸과 확인 보고서의 세 칸뿐이다
        var emr = BitName.Matches(sql).Cast<Match>().Select(m => m.Value).Where(name => name.StartsWith("Emr", StringComparison.Ordinal)).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(new[] { symptom.Table, symptom.Column }.Concat(SymptomLinkColumns).OrderBy(n => n, StringComparer.Ordinal), emr);
    }

    // ---- AC-1402.6·AC-1410.4 목록 줄의 지난번 증상 (PriorSymptoms, TASK-37) ---------------------------------

    [Fact(DisplayName = "AC-1402.6 지난 처방 문장(PriorRx)은 없고, 목록 줄의 지난번 글은 PriorSymptoms(오늘 매개변수 @from·@to·@hospital, 결과 칸 LastVisitId·Line)가 준다")]
    public void PriorSymptomsReplacesPriorRx()
    {
        Assert.Null(typeof(ReceptionSql).GetField("PriorRx"));
        Assert.True(Sql.IsAllowed(PriorSymptoms));
        Assert.Same(Parameters[PriorSymptoms], Sql.ParametersOf(PriorSymptoms));
        Assert.Equal(
            Parameters[TodayVisits].Select(p => p.Name + ":" + p.Kind + ":" + p.Size),
            Parameters[PriorSymptoms].Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        Assert.Equal(new[] { "LastVisitId", "Line" }, OuterColumns(PriorSymptoms));
        Assert.DoesNotContain("dbo.OdrInf", PriorSymptoms, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1410.4 PriorSymptoms는 PriorVisits와 같은 P 창의 가장 최근 지난 내원(P.Seq=1)마다 EmrInf(EmrOcmNum)에서 EmrShtTyp='S'이고 빈 글 아닌 EmrShtVal 줄을 EmrUpdDtm 순으로 주고, IN이라 같은 지난 내원 줄이 겹치지 않는다")]
    public void PriorSymptomLinesFromSheetS()
    {
        var symptom = ReceptionMap.Columns!.Symptom!;
        var sql = Squash(PriorSymptoms);
        var priorCte = Squash(PriorVisits.Substring(0, PriorVisits.LastIndexOf("SELECT P.TodayVisitId", StringComparison.Ordinal)));
        Assert.StartsWith(priorCte + " SELECT ", sql, StringComparison.Ordinal);
        Assert.Contains(
            "SELECT e.EmrOcmNum LastVisitId,CAST(e." + symptom.Column + " AS nvarchar(max)) Line FROM dbo." + symptom.Table
            + " e WHERE e.EmrOcmNum IN (SELECT P.OcmNum FROM P WHERE P.Seq=1)",
            sql, StringComparison.Ordinal);
        // 증상 줄 조건은 상세의 VisitSymptoms와 같은 글이다
        const string SheetS = "e.EmrShtTyp='S' AND LEN(LTRIM(CAST(e.EmrShtVal AS nvarchar(max))))>0";
        Assert.Contains(SheetS, Squash(VisitSymptoms), StringComparison.Ordinal);
        Assert.Contains(" AND " + SheetS, sql, StringComparison.Ordinal);
        Assert.EndsWith("ORDER BY e.EmrOcmNum,e.EmrUpdDtm", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("FOR XML", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("STRING_AGG", sql, StringComparison.OrdinalIgnoreCase);
        var emr = BitName.Matches(sql).Cast<Match>().Select(m => m.Value).Where(name => name.StartsWith("Emr", StringComparison.Ordinal)).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(new[] { symptom.Table, symptom.Column }.Concat(SymptomLinkColumns).OrderBy(n => n, StringComparer.Ordinal), emr);
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
        foreach (var rx in new[] { TodayRx, HistoryPage }) Assert.Contains("UPPER(RTRIM(o.OdrCod)) RxCode", Squash(rx), StringComparison.Ordinal);
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
        Assert.Contains("JOIN dbo.OcmInf c ON c.OcmChtNum=T.OcmChtNum WHERE T.OcmChtNum<>'' AND ", Squash(PriorSymptoms), StringComparison.Ordinal);

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

    // ---- spec new-mark REQ-6205 신환 표시 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-6205.1 오늘 접수 T는 내원 구분 c.OcmDgsNfs(매출·통계 문장이 이미 읽는 칸)도 읽고, TodayVisits는 끝 칸으로 RTRIM(T.OcmDgsNfs) Nfs를 낸다(다른 오늘 문장의 결과 칸은 그대로)")]
    public void TodayVisitsGivesVisitMark()
    {
        var today = Squash(TodayVisits);
        Assert.Contains("SELECT c.OcmNum,c.OcmChtNum,c.OcmAcpDtm,c.OcmComStt,c.OcmRsuYon,c.OcmDgsNfs FROM dbo.OcmInf c", today, StringComparison.Ordinal);
        Assert.EndsWith(",RTRIM(T.OcmRsuYon) Rsu,RTRIM(T.OcmDgsNfs) Nfs FROM T", today, StringComparison.Ordinal);
        Assert.Equal("Nfs", OuterColumns(TodayVisits).Last());
        Assert.Contains(RevenueSql.Parameters.Keys.Concat(StatsSql.All), sql => sql.IndexOf("c.OcmDgsNfs", StringComparison.Ordinal) >= 0);
        foreach (var sql in new[] { TodayRx, PriorVisits, PriorSymptoms, TodayPeople, TodayPaid, TodayOrderTimes })
        {
            Assert.DoesNotContain(" Nfs", Squash(sql), StringComparison.Ordinal);
        }
    }
}
