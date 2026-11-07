using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Reception.PaperSql;

/// <summary>
/// AC-1501.8 종이 자료 문장(ReceptionSql의 PaperPerson·PaperVisit·PaperSymptoms·PaperDx·PaperOrders, spec reception-paper design.md 3절)은
/// 모두 매개변수를 받는 SELECT 상수이고 Sql.IsAllowed가 받으며, 정해 둔 매개변수 표와 함께만 ReadOnlyGuard를 지난다.
/// 내원 문장은 병원 범위(DepMst.DepHspNum=@hospital) 조건이 있고, 차트번호는 함수 없이 견주며(=@chart), SQL Server 2008 R2에서 도는 글이다.
/// 주민번호는 LEFT(p.PbsResNum,6) 하나로만 읽는다(7번째 글자부터는 읽지 않는다). 결과 칸 이름·순서는 TASK-4(PaperReader)와의 약속이다.
/// </summary>
public class PaperSqlTests
{
    /// <summary>설계(design.md 3절)의 이름 → 문장.</summary>
    private static readonly Dictionary<string, string> Statements = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["PaperPerson"] = ReceptionSql.PaperPerson,
        ["PaperVisit"] = ReceptionSql.PaperVisit,
        ["PaperSymptoms"] = ReceptionSql.PaperSymptoms,
        ["PaperDx"] = ReceptionSql.PaperDx,
        ["PaperOrders"] = ReceptionSql.PaperOrders,
    };

    /// <summary>그 접수(내원) 하나를 읽는 문장. PaperPerson은 사람 줄만 읽는다(내원 없음).</summary>
    private static readonly string[] VisitStatements = { "PaperVisit", "PaperSymptoms", "PaperDx", "PaperOrders" };

    /// <summary>문장 이름 → 결과 칸(순서대로). TASK-4와의 약속이라 이름·순서가 그대로여야 한다.</summary>
    private static readonly Dictionary<string, string[]> Columns = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["PaperPerson"] = new[] { "ResFront", "Addr", "AddrRest", "Phone", "Mobile", "Special" },
        ["PaperVisit"] = new[] { "VisitId", "Room", "Insurance" },
        ["PaperSymptoms"] = new[] { "VisitId", "Line" },
        ["PaperDx"] = new[] { "Code", "Name", "Pri" },
        ["PaperOrders"] = new[] { "Code", "Name", "Qty", "Tms", "Day", "OutCod" },
    };

    /// <summary>문장 이름 → 결과 칸 글(괄호 밖 SELECT … FROM 사이, 공백 하나로 줄인 것).</summary>
    private static readonly Dictionary<string, string> SelectLists = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["PaperPerson"] = "LEFT(p.PbsResNum,6) ResFront,RTRIM(p.PbsDtlAdr) Addr,RTRIM(p.PbsAdrSta) AddrRest,RTRIM(p.PbsPhnNum) Phone,RTRIM(p.PbsCelPhn) Mobile,CAST(s.PbsSpcCmt AS varchar(max)) Special",
        ["PaperVisit"] = "c.OcmNum VisitId,RTRIM(d.DepKorNam) Room,RTRIM(i.InsCodNam) Insurance",
        ["PaperSymptoms"] = "e.EmrOcmNum VisitId,CAST(e.EmrShtVal AS nvarchar(max)) Line",
        ["PaperDx"] = "RTRIM(x.OicElcCod) Code,RTRIM(x.OicIcdNam) Name,RTRIM(ISNULL(x.OicIcdPri,'')) Pri",
        ["PaperOrders"] = "RTRIM(o.OdrCod) Code,RTRIM(o.OdrCodNam) Name,o.OdrQty Qty,o.OdrTms Tms,o.OdrDay Day,RTRIM(ISNULL(o.OdrOutCod,'')) OutCod",
    };

    /// <summary>문장 이름 → 받는 매개변수(이름:종류:크기, 표 순서대로).</summary>
    private static readonly Dictionary<string, string[]> Named = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["PaperPerson"] = new[] { "@chart:VarChar:14" },
        ["PaperVisit"] = new[] { "@chart:VarChar:14", "@before:VarChar:20", "@hospital:VarChar:32" },
        ["PaperSymptoms"] = new[] { "@chart:VarChar:14", "@before:VarChar:20", "@hospital:VarChar:32" },
        ["PaperDx"] = new[] { "@chart:VarChar:14", "@before:VarChar:20", "@hospital:VarChar:32" },
        ["PaperOrders"] = new[] { "@chart:VarChar:14", "@before:VarChar:20", "@hospital:VarChar:32" },
    };

    /// <summary>등록 병원 범위 조건의 몸(Sql.HistoryVisitSql·ReceptionSql의 InHospital과 같은 글).</summary>
    private const string HospitalBody = "d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte";

    private const string InHospital = "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE " + HospitalBody + ")";

    /// <summary>그 접수: 같은 차트번호·OcmAcpDtm=@before 원값·외래(VisitSymptoms의 오늘 쪽과 같은 글).</summary>
    private const string ThisVisit = "c.OcmChtNum=@chart AND c.OcmAcpDtm=@before AND c.OcmPatTyp='O'";

    /// <summary>그 접수(병원 범위 안)를 V로 두는 머리 글.</summary>
    private const string VisitHead = "WITH V AS ( SELECT c.OcmNum FROM dbo.OcmInf c WHERE " + ThisVisit + " AND " + InHospital + " ) SELECT ";

    /// <summary>살아 있는 처방 줄 조건(ReceptionSql RxRow·Sql.HistoryCodeSql과 같은 글).</summary>
    private const string RxRow = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    /// <summary>차트번호 칸(OcmChtNum·PbsChtNum …)에 함수를 씌운 글.</summary>
    private static readonly Regex WrappedChart = new Regex(
        @"\b(?:RTRIM|LTRIM|LEFT|RIGHT|SUBSTRING|ISNULL|NULLIF|COALESCE|UPPER|LOWER|CAST|CONVERT|REPLACE|LEN|DATALENGTH)\s*\([^()]*ChtNum",
        RegexOptions.IgnoreCase);

    /// <summary>비트 표·칸 이름 모양(세 글자 마디 둘 이상: OcmChtNum, PbsCmtInf …).</summary>
    private static readonly Regex BitName = new Regex(@"\b[A-Z][a-z]{2}(?:[A-Z][a-z]{2})+\b");

    /// <summary>
    /// 의원 PC에서 확인한 종이 자료 칸(design.md 1절·3절, 2026-11-07, 칸·형만 봄): 사람(PbsInf·PbsCmtInf)·진료실(DepKorNam)·보험(OcmInsCod → InsMst)·
    /// 증상 줄 순서(EmrShtSeq)·상병(OicInf)·처방 줄(OdrInf). 기존 허용 문장이 이미 읽는 칸 말고는 이것만 읽는다.
    /// </summary>
    private static readonly string[] Confirmed =
    {
        "PbsInf", "PbsChtNum", "PbsResNum", "PbsDtlAdr", "PbsAdrSta", "PbsPhnNum", "PbsCelPhn",
        "PbsCmtInf", "PbsSpcCmt",
        "DepMst", "DepKorNam", "OcmInsCod",
        "InsMst", "InsCod", "InsAdpDte", "InsCodNam",
        "EmrInf", "EmrOcmNum", "EmrShtTyp", "EmrShtSeq", "EmrShtVal",
        "OicInf", "OicOcmNum", "OicSeq", "OicElcCod", "OicIcdNam", "OicIcdPri",
        "OdrInf", "OdrOcmNum", "OdrSeq", "OdrCod", "OdrCodNam", "OdrQty", "OdrTms", "OdrDay", "OdrOutCod",
    };

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    private static object? ValidValue(SqlParam parameter) => parameter.Name switch
    {
        "@hospital" => Synthetic.Scope,
        "@chart" => "900001",
        "@before" => "20261107104233",
        _ => throw new InvalidOperationException(parameter.Name),
    };

    private static Dictionary<string, object?> ValidArgs(string sql) =>
        ReceptionSql.Parameters[sql].ToDictionary(parameter => parameter.Name, ValidValue, StringComparer.Ordinal);

    /// <summary>괄호 밖(깊이 0)에서 part가 나오는 자리들.</summary>
    private static List<int> TopLevel(string text, string part)
    {
        var at = new List<int>();
        var depth = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == '(') depth++;
            else if (text[i] == ')') depth--;
            else if (depth == 0 && string.CompareOrdinal(text, i, part, 0, part.Length) == 0) at.Add(i);
        }
        return at;
    }

    /// <summary>괄호 밖 SELECT 하나의 결과 칸 글(SELECT와 FROM 사이). WITH 문장의 CTE·OUTER APPLY 안은 괄호 안이라 빠진다.</summary>
    private static string OuterSelectList(string sql)
    {
        var text = Squash(sql);
        var selects = TopLevel(text, "SELECT ");
        Assert.Single(selects);
        var start = selects[0] + "SELECT ".Length;
        var end = TopLevel(text, " FROM ").FirstOrDefault(at => at > start);
        Assert.True(end > start, "괄호 밖 SELECT … FROM을 찾지 못했다");
        return text.Substring(start, end - start);
    }

    /// <summary>결과 칸 이름(각 칸 글의 마지막 낱말).</summary>
    private static string[] OuterColumns(string sql)
    {
        var items = new List<string>();
        var item = new System.Text.StringBuilder();
        var depth = 0;
        foreach (var ch in OuterSelectList(sql))
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

    // ---- 상수·읽기 문장 하나 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 종이 자료 문장 다섯은 ReceptionSql의 public const string이고, 저마다 다른 읽기 문장 하나다(SELECT·WITH 시작, 괄호 밖 SELECT 하나, ;·주석·쓰기 낱말 없음, 매개변수 있음)")]
    public void StatementsArePublicConstSingleSelects()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|DECLARE|SET|UNION|EXCEPT|INTERSECT)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.Equal(5, Statements.Values.Distinct(StringComparer.Ordinal).Count());
        foreach (var pair in Statements)
        {
            var field = typeof(ReceptionSql).GetField(pair.Key, BindingFlags.Public | BindingFlags.Static);
            Assert.NotNull(field);
            Assert.True(field!.IsLiteral && !field.IsInitOnly, pair.Key + "는 const가 아니다");
            Assert.Equal(typeof(string), field.FieldType);
            Assert.Equal(pair.Value, (string?)field.GetRawConstantValue());

            var sql = pair.Value;
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal), pair.Key);
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
            Assert.DoesNotMatch(forbidden, sql);
            Assert.Single(TopLevel(Squash(sql), "SELECT "));
            Assert.Matches(new Regex(@"@\w+"), sql);
        }
    }

    // ---- 허용 목록·매개변수 표 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 매개변수 표: PaperPerson은 @chart(VarChar 14) 하나, 내원 문장 넷은 @chart(VarChar 14)·@before(VarChar 20)·@hospital(VarChar 32)이고, 문장 속 @이름과 같다")]
    public void ParameterTableMatchesStatements()
    {
        foreach (var pair in Statements)
        {
            Assert.True(ReceptionSql.Parameters.ContainsKey(pair.Value), pair.Key);
            var declared = ReceptionSql.Parameters[pair.Value];
            Assert.Equal(Named[pair.Key], declared.Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
            var named = Regex.Matches(pair.Value, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(declared.Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), named);
        }
    }

    [Fact(DisplayName = "AC-1501.8 Sql.IsAllowed가 받고, Sql.ParametersOf는 ReceptionSql.Parameters의 그 표를 주며, ReadOnlyGuard는 그 표의 매개변수와 함께 통과시킨다")]
    public void GuardPassesWithExactParameters()
    {
        foreach (var sql in Statements.Values)
        {
            Assert.True(Sql.IsAllowed(sql));
            ReadOnlyGuard.Require(sql);
            ReadOnlyGuard.Require(sql, ValidArgs(sql));
            Assert.Same(ReceptionSql.Parameters[sql], Sql.ParametersOf(sql));
        }
    }

    [Fact(DisplayName = "AC-1501.8 ReadOnlyGuard는 매개변수가 빠지거나·더해지거나·다른 문장의 표이거나·종류가 틀리거나·길면 E-BIT-READ-FAILED로 막고, 딱 맞는 길이는 지난다")]
    public void GuardRefusesOtherArguments()
    {
        foreach (var sql in Statements.Values)
        {
            var extra = ValidArgs(sql);
            extra["@first"] = 1;
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);

            // 다른 종이 문장의 표(사람 ↔ 내원)로는 지나지 않는다
            var other = sql == ReceptionSql.PaperPerson ? ReceptionSql.PaperVisit : ReceptionSql.PaperPerson;
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, ValidArgs(other))).Code);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, new Dictionary<string, object?>())).Code);

            foreach (var parameter in ReceptionSql.Parameters[sql])
            {
                var missing = ValidArgs(sql);
                missing.Remove(parameter.Name);
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, missing)).Code);

                var wrongKind = ValidArgs(sql);
                wrongKind[parameter.Name] = 900001;
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, wrongKind)).Code);

                var fits = ValidArgs(sql);
                fits[parameter.Name] = new string('9', parameter.Size);
                ReadOnlyGuard.Require(sql, fits);

                var tooLong = ValidArgs(sql);
                tooLong[parameter.Name] = new string('9', parameter.Size + 1);
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong)).Code);
            }
        }
    }

    [Fact(DisplayName = "AC-1501.8 글자를 고친 문장(끝 공백·덧붙인 DELETE·소문자·차트번호나 병원 값을 글로 박음)은 Sql.IsAllowed가 받지 않고 ReadOnlyGuard가 막는다")]
    public void GuardRefusesChangedStatements()
    {
        foreach (var sql in Statements.Values)
        {
            var changed = new List<string> { sql + " ", sql + "; DELETE FROM dbo.PbsInf", sql.ToLowerInvariant(), sql.Replace("@chart", "'900001'") };
            if (sql.Contains("@hospital")) changed.Add(sql.Replace("@hospital", "'SYNTHETIC'"));
            foreach (var bad in changed)
            {
                Assert.NotEqual(sql, bad);
                Assert.False(Sql.IsAllowed(bad));
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(bad)).Code);
            }
        }
    }

    // ---- 그 접수·병원 범위 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 내원 문장(PaperVisit·PaperSymptoms·PaperDx·PaperOrders)은 그 접수(VisitSymptoms의 오늘 쪽과 같은 조건) 하나만 병원 범위(DepMst.DepHspNum=@hospital) 안에서 읽고, PaperPerson은 내원을 읽지 않는다")]
    public void VisitStatementsAreScopedToHospital()
    {
        // 기준 글이 기존 문장과 같다: 병원 범위 = Sql.HistoryVisitSql, 그 접수 = VisitSymptoms의 오늘 쪽
        Assert.Contains(InHospital, Squash(Sql.HistoryVisitSql), StringComparison.Ordinal);
        Assert.Contains("SELECT c.OcmNum FROM dbo.OcmInf c WHERE " + ThisVisit + " AND " + InHospital + " )", Squash(ReceptionSql.VisitSymptoms), StringComparison.Ordinal);

        foreach (var name in VisitStatements)
        {
            var sql = Squash(Statements[name]);
            Assert.Contains("d.DepHspNum=@hospital", sql, StringComparison.Ordinal);
            Assert.Equal(1, Count(sql, "dbo.OcmInf"));
            Assert.Equal(1, Count(sql, "FROM dbo.OcmInf c "));
            Assert.Equal(1, Count(sql, ThisVisit));
            Assert.Equal(1, Count(sql, "@before"));
        }

        // 증상·상병·처방은 그 접수(V, 병원 범위 안)에 내원번호 칸으로 붙여서만 읽는다
        Assert.StartsWith(VisitHead, Squash(ReceptionSql.PaperSymptoms), StringComparison.Ordinal);
        Assert.StartsWith(VisitHead, Squash(ReceptionSql.PaperDx), StringComparison.Ordinal);
        Assert.StartsWith(VisitHead, Squash(ReceptionSql.PaperOrders), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.EmrInf e JOIN V ON V.OcmNum=e.EmrOcmNum ", Squash(ReceptionSql.PaperSymptoms), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.OicInf x JOIN V ON V.OcmNum=x.OicOcmNum ", Squash(ReceptionSql.PaperDx), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum WHERE ", Squash(ReceptionSql.PaperOrders), StringComparison.Ordinal);
        foreach (var (name, table) in new[] { ("PaperSymptoms", "dbo.EmrInf"), ("PaperDx", "dbo.OicInf"), ("PaperOrders", "dbo.OdrInf") })
            Assert.Equal(1, Count(Squash(Statements[name]), table));

        // 진료실: 그 접수 c를 접수 날 유효한 이 병원 DepMst 줄에 잇는다(조건 글은 병원 범위와 같다)
        var visit = Squash(ReceptionSql.PaperVisit);
        Assert.StartsWith("SELECT " + SelectLists["PaperVisit"] + " FROM dbo.OcmInf c JOIN dbo.DepMst d ON " + HospitalBody + " OUTER APPLY (", visit, StringComparison.Ordinal);
        Assert.EndsWith(" WHERE " + ThisVisit, visit, StringComparison.Ordinal);
        Assert.DoesNotContain("LEFT JOIN dbo.DepMst", visit, StringComparison.Ordinal);

        // 사람 줄: 차트번호로 PbsInf 하나, 특이사항은 PbsCmtInf를 LEFT JOIN(없어도 사람 줄은 온다). 내원·병원 값 없음
        var person = Squash(ReceptionSql.PaperPerson);
        Assert.Equal("SELECT " + SelectLists["PaperPerson"] + " FROM dbo.PbsInf p LEFT JOIN dbo.PbsCmtInf s ON s.PbsChtNum=p.PbsChtNum WHERE p.PbsChtNum=@chart", person);
        Assert.DoesNotContain("OcmInf", person, StringComparison.Ordinal);
        Assert.DoesNotContain("@hospital", person, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1501.8 보험 이름은 OUTER APPLY TOP 1: OcmInsCod의 InsMst 줄 중 InsAdpDte가 접수 날 이하인 가장 늦은 줄(같으면 이름 순)이다")]
    public void InsuranceIsLatestOnOrBeforeVisitDay()
    {
        Assert.Contains(
            " OUTER APPLY (SELECT TOP 1 m.InsCodNam FROM dbo.InsMst m WHERE m.InsCod=c.OcmInsCod AND m.InsAdpDte<=LEFT(c.OcmAcpDtm,8) ORDER BY m.InsAdpDte DESC,m.InsCodNam) i WHERE ",
            Squash(ReceptionSql.PaperVisit), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1501.8 처방 줄은 기존 RxRow 조건(TodayRx·Sql.HistoryCodeSql과 같은 글)으로 거른 살아 있는 줄이다")]
    public void OrdersUseRxRow()
    {
        Assert.Contains(RxRow, Squash(Sql.HistoryCodeSql), StringComparison.Ordinal);
        Assert.Contains(RxRow, Squash(ReceptionSql.TodayRx), StringComparison.Ordinal);
        var orders = Squash(ReceptionSql.PaperOrders);
        Assert.Equal(1, Count(orders, RxRow));
        Assert.EndsWith("FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum WHERE " + RxRow + " ORDER BY o.OdrSeq", orders, StringComparison.Ordinal);
    }

    // ---- 차트번호·SQL Server 2008 R2 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 차트번호는 함수 없이 =@chart로 견준다(p.PbsChtNum=@chart, c.OcmChtNum=@chart), 차트번호 칸에 씌운 함수가 없다")]
    public void ChartIsComparedBare()
    {
        var bare = new Regex(@"(?<![\w(])[a-z]\.(?:Pbs|Ocm)ChtNum=@chart\b");
        foreach (var pair in Statements)
        {
            var sql = Squash(pair.Value);
            Assert.Equal(1, Count(sql, "@chart"));
            Assert.Single(bare.Matches(sql).Cast<Match>());
            Assert.DoesNotMatch(WrappedChart, sql);
        }
        Assert.Contains("WHERE p.PbsChtNum=@chart", Squash(ReceptionSql.PaperPerson), StringComparison.Ordinal);
        foreach (var name in VisitStatements) Assert.Contains("c.OcmChtNum=@chart AND ", Squash(Statements[name]), StringComparison.Ordinal);

        // 시험이 빈 곳을 보지 않는지: 씌운 글은 잡는다
        Assert.Matches(WrappedChart, "WHERE RTRIM(p.PbsChtNum)=@chart");
        Assert.Matches(WrappedChart, "WHERE LTRIM(RTRIM(c.OcmChtNum))=@chart");
        Assert.DoesNotMatch(bare, "WHERE RTRIM(p.PbsChtNum=@chart");
    }

    [Fact(DisplayName = "AC-1501.8 SQL Server 2008 R2에서 도는 글이다(OFFSET·FETCH·STRING_AGG·CONCAT_WS와 2012 뒤에 생긴 글, FOR XML 없음)")]
    public void RunsOnSqlServer2008R2()
    {
        var newer = new Regex(@"\b(OFFSET|FETCH|IIF|CONCAT|CONCAT_WS|FORMAT|TRY_CONVERT|TRY_CAST|TRY_PARSE|LAG|LEAD|FIRST_VALUE|LAST_VALUE|EOMONTH|DATEFROMPARTS|STRING_AGG|STRING_SPLIT|TRIM|ROWS|RANGE)\b", RegexOptions.IgnoreCase);
        var aggregateWithOrder = new Regex(@"\b(COUNT|COUNT_BIG|SUM|MIN|MAX|AVG)\s*\([^()]*\)\s*OVER\s*\([^)]*ORDER BY", RegexOptions.IgnoreCase);
        foreach (var sql in Statements.Values)
        {
            Assert.DoesNotMatch(newer, sql);
            Assert.DoesNotMatch(aggregateWithOrder, sql);
            Assert.DoesNotContain("FOR XML", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("STRING_AGG", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("CONCAT_WS", sql, StringComparison.OrdinalIgnoreCase);
        }
        // 시험이 빈 곳을 보지 않는지
        Assert.Matches(newer, "ORDER BY o.OdrSeq OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY");
        Assert.Matches(newer, "SELECT STRING_AGG(e.EmrShtVal,CHAR(10))");
        Assert.Matches(newer, "SELECT CONCAT_WS(' ',p.PbsDtlAdr,p.PbsAdrSta)");
    }

    // ---- 주민번호 --------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 주민번호(PbsResNum)는 PaperPerson의 LEFT(p.PbsResNum,6) ResFront 한 곳에서만 읽는다(7번째 글자부터는 어느 문장도 읽지 않는다)")]
    public void ResidentNumberOnlyFirstSix()
    {
        const string Front = "LEFT(p.PbsResNum,6)";
        var person = Squash(ReceptionSql.PaperPerson);
        Assert.Equal(1, Count(person, "ResNum"));
        Assert.Equal(1, Count(person, Front + " ResFront"));
        Assert.DoesNotContain("ResNum", person.Replace(Front, ""), StringComparison.Ordinal);

        // 접수 현황 문장 전부(reception-phone 것 포함)에서 주민번호 칸은 이 한 번뿐이다
        Assert.Equal(1, ReceptionSql.Parameters.Keys.Sum(sql => Count(sql, "ResNum")));
        foreach (var name in VisitStatements) Assert.DoesNotContain("ResNum", Statements[name], StringComparison.Ordinal);

        // 시험이 빈 곳을 보지 않는지: 뒤 글자를 읽는 글은 잡는다
        foreach (var bad in new[] { "SELECT p.PbsResNum ResFront", "SELECT LEFT(p.PbsResNum,7) ResFront", "SELECT LEFT(p.PbsResNum,6) ResFront,SUBSTRING(p.PbsResNum,7,7) Back" })
        {
            var text = Squash(bad);
            Assert.False(Count(text, "ResNum") == 1 && Count(text, Front + " ResFront") == 1 && !text.Replace(Front, "").Contains("ResNum"), bad);
        }
    }

    // ---- 결과 칸·차례 ----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 결과 칸 이름·순서는 TASK-4와의 약속 그대로다(PaperPerson ResFront…Special, PaperVisit VisitId·Room·Insurance, PaperSymptoms VisitId·Line, PaperDx Code·Name·Pri, PaperOrders Code·Name·Qty·Tms·Day·OutCod)")]
    public void ColumnsInContractOrder()
    {
        foreach (var pair in Statements)
        {
            Assert.Equal(Columns[pair.Key], OuterColumns(pair.Value));
            Assert.Equal(SelectLists[pair.Key], OuterSelectList(pair.Value));
        }
    }

    [Fact(DisplayName = "AC-1501.8 줄 차례: 증상 ORDER BY e.EmrShtSeq, 상병 ORDER BY x.OicSeq, 처방 ORDER BY o.OdrSeq(문장 끝), 사람·진료실 줄은 차례 없음")]
    public void OrderingColumns()
    {
        Assert.EndsWith(" ORDER BY e.EmrShtSeq", Squash(ReceptionSql.PaperSymptoms), StringComparison.Ordinal);
        Assert.EndsWith(" ORDER BY x.OicSeq", Squash(ReceptionSql.PaperDx), StringComparison.Ordinal);
        Assert.EndsWith(" ORDER BY o.OdrSeq", Squash(ReceptionSql.PaperOrders), StringComparison.Ordinal);
        foreach (var name in new[] { "PaperSymptoms", "PaperDx", "PaperOrders" })
            Assert.Single(TopLevel(Squash(Statements[name]), " ORDER BY "));
        Assert.Empty(TopLevel(Squash(ReceptionSql.PaperPerson), " ORDER BY "));
        Assert.Empty(TopLevel(Squash(ReceptionSql.PaperVisit), " ORDER BY "));
    }

    [Fact(DisplayName = "AC-1501.8 PaperSymptoms는 그 접수의 EmrShtTyp='S' 줄을 빈 줄까지 모두 준다(빈 글 거르기 없음, VisitSymptoms와 다름)")]
    public void SymptomsKeepBlankLines()
    {
        var sql = Squash(ReceptionSql.PaperSymptoms);
        Assert.EndsWith(" FROM dbo.EmrInf e JOIN V ON V.OcmNum=e.EmrOcmNum WHERE e.EmrShtTyp='S' ORDER BY e.EmrShtSeq", sql, StringComparison.Ordinal);
        var body = sql.Substring(sql.LastIndexOf(" SELECT ", StringComparison.Ordinal));
        foreach (var filter in new[] { "LEN(", "DATALENGTH", "LTRIM", "<>''", "IS NOT NULL", "NULLIF", "EmrShtVal<>", "EmrShtVal>" })
            Assert.DoesNotContain(filter, body, StringComparison.OrdinalIgnoreCase);

        // 견줌: 목록·지난 쪽 증상 문장은 빈 글을 거른다(이 시험이 거르기 글을 알아본다)
        Assert.Contains("LEN(LTRIM(CAST(e.EmrShtVal AS nvarchar(max))))>0", Squash(ReceptionSql.VisitSymptoms), StringComparison.Ordinal);
    }

    // ---- 읽는 표·칸 ------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.8 읽는 표·칸은 기존 허용 문장이 이미 읽는 것과 의원 PC에서 확인한 종이 자료 칸(design.md 1절·3절)뿐이다(목록 대조)")]
    public void ReadsOnlyKnownColumns()
    {
        var paper = new HashSet<string>(Statements.Values, StringComparer.Ordinal);
        var others = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Concat(ReceptionSql.Parameters.Keys.Where(sql => !paper.Contains(sql))).ToArray();
        var allowed = new HashSet<string>(others.SelectMany(sql => BitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        allowed.UnionWith(Confirmed);
        var resultNames = new HashSet<string>(Columns.Values.SelectMany(names => names), StringComparer.Ordinal);

        var used = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sql in Statements.Values)
            foreach (Match m in BitName.Matches(sql))
                if (!resultNames.Contains(m.Value)) used.Add(m.Value);

        // 시험이 빈 곳을 보지 않는지: 꼭 읽는 칸이 잡혔다
        foreach (var name in new[] { "PbsInf", "PbsCmtInf", "PbsSpcCmt", "PbsResNum", "OcmInf", "OcmChtNum", "DepMst", "DepKorNam", "InsMst", "InsCodNam", "EmrInf", "EmrShtSeq", "OicInf", "OicIcdPri", "OdrInf", "OdrOutCod" })
            Assert.Contains(name, used);
        Assert.Empty(used.Where(name => !allowed.Contains(name)).OrderBy(name => name, StringComparer.Ordinal));
        Assert.Empty(used.Where(name => name.EndsWith("Inf", StringComparison.Ordinal) || name.EndsWith("Mst", StringComparison.Ordinal))
            .Except(new[] { "PbsInf", "PbsCmtInf", "OcmInf", "DepMst", "InsMst", "EmrInf", "OicInf", "OdrInf" }));
    }
}
