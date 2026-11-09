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

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeSql 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeSql;

/// <summary>
/// 어레인지 탭의 새 비트 문장(spec reception-arrange design.md 5절, TASK-3).
/// AC-3303.1 TodayOrderTimes: 오늘 접수(TodayCte)의 처방 줄(RxRow)을 내원·코드(대문자)마다 가장 이른 처방 시각(MIN(o.OdrDtm)) 한 줄로 주는
/// 매개변수(@from·@to·@hospital) SELECT 상수이고 Sql.IsAllowed가 받는다.
/// AC-3307.2 직전 종이 넷(PrevPaperVisit·PrevPaperSymptoms·PrevPaperDx·PrevPaperOrders): @chart·@visit·@hospital을 받는 SELECT 상수이고,
/// "그 내원"은 c.OcmNum=@visit AND c.OcmChtNum=@chart와 완료 내원 조건·병원 범위다. 사람 칸(주민번호·주소·전화·특이사항)은 읽지 않는다.
/// </summary>
public class ArrangeSqlTests
{
    /// <summary>이름 → 문장.</summary>
    private static readonly Dictionary<string, string> Statements = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["TodayOrderTimes"] = ReceptionSql.TodayOrderTimes,
        ["PrevPaperVisit"] = ReceptionSql.PrevPaperVisit,
        ["PrevPaperSymptoms"] = ReceptionSql.PrevPaperSymptoms,
        ["PrevPaperDx"] = ReceptionSql.PrevPaperDx,
        ["PrevPaperOrders"] = ReceptionSql.PrevPaperOrders,
    };

    private static readonly string[] PrevNames = { "PrevPaperVisit", "PrevPaperSymptoms", "PrevPaperDx", "PrevPaperOrders" };

    /// <summary>이름 → 결과 칸(순서대로, design.md 5절 표).</summary>
    private static readonly Dictionary<string, string[]> Columns = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayOrderTimes"] = new[] { "VisitId", "RxCode", "FirstAt" },
        ["PrevPaperVisit"] = new[] { "Day", "Room", "Ins" },
        ["PrevPaperSymptoms"] = new[] { "Line" },
        ["PrevPaperDx"] = new[] { "Code", "Name", "Pri" },
        ["PrevPaperOrders"] = new[] { "Code", "Name", "Qty", "Tms", "Day", "OutCod" },
    };

    /// <summary>이름 → 받는 매개변수(이름:종류:크기, 표 순서대로).</summary>
    private static readonly Dictionary<string, string[]> Named = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["TodayOrderTimes"] = new[] { "@from:Char:12", "@to:Char:12", "@hospital:VarChar:32" },
        ["PrevPaperVisit"] = new[] { "@chart:VarChar:14", "@visit:VarChar:20", "@hospital:VarChar:32" },
        ["PrevPaperSymptoms"] = new[] { "@chart:VarChar:14", "@visit:VarChar:20", "@hospital:VarChar:32" },
        ["PrevPaperDx"] = new[] { "@chart:VarChar:14", "@visit:VarChar:20", "@hospital:VarChar:32" },
        ["PrevPaperOrders"] = new[] { "@chart:VarChar:14", "@visit:VarChar:20", "@hospital:VarChar:32" },
    };

    private const string InHospital =
        "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>완료 외래 내원 조건(Sql.HistoryVisitSql의 V·ReceptionSql DoneVisit과 같은 글).</summary>
    private const string DoneVisit = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')";

    /// <summary>그 지난 내원: 내원번호·차트번호(함수 없이)·완료 외래.</summary>
    private const string PrevVisit = "c.OcmNum=@visit AND c.OcmChtNum=@chart AND " + DoneVisit;

    private const string RxRow = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    private static readonly Regex BitName = new Regex(@"\b[A-Z][a-z]{2}(?:[A-Z][a-z]{2})+\b");

    /// <summary>차트번호 칸에 함수를 씌운 글(PaperSql 시험과 같은 모양).</summary>
    private static readonly Regex WrappedChart = new Regex(
        @"\b(?:RTRIM|LTRIM|LEFT|RIGHT|SUBSTRING|ISNULL|NULLIF|COALESCE|UPPER|LOWER|CAST|CONVERT|REPLACE|LEN|DATALENGTH)\s*\([^()]*ChtNum",
        RegexOptions.IgnoreCase);

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    private static object? ValidValue(SqlParam parameter) => parameter.Name switch
    {
        "@from" => "202611090000",
        "@to" => "202611100000",
        "@hospital" => Synthetic.Scope,
        "@chart" => "900001",
        "@visit" => "12345678",
        _ => throw new InvalidOperationException(parameter.Name),
    };

    private static Dictionary<string, object?> ValidArgs(string sql) =>
        ReceptionSql.Parameters[sql].ToDictionary(parameter => parameter.Name, ValidValue, StringComparer.Ordinal);

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

    // ---- 둘 다: 상수·읽기 문장 하나·허용 목록 -----------------------------------------------------------

    [Theory(DisplayName = "AC-3303.1 AC-3307.2 새 문장은 ReceptionSql의 public const string이고 읽기 문장 하나다(SELECT·WITH 시작, 괄호 밖 SELECT 하나, ;·주석·쓰기 낱말 없음)")]
    [InlineData("TodayOrderTimes")]
    [InlineData("PrevPaperVisit")]
    [InlineData("PrevPaperSymptoms")]
    [InlineData("PrevPaperDx")]
    [InlineData("PrevPaperOrders")]
    public void PublicConstSingleSelect(string name)
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|DECLARE|SET|UNION|EXCEPT|INTERSECT|OFFSET|FETCH|STRING_AGG|CONCAT_WS|TRY_CONVERT|IIF)\b|xp_|sp_|FOR XML", RegexOptions.IgnoreCase);
        var field = typeof(ReceptionSql).GetField(name, BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(field);
        Assert.True(field!.IsLiteral && !field.IsInitOnly, name + "는 const가 아니다");
        var sql = (string)field.GetRawConstantValue()!;
        Assert.Equal(Statements[name], sql);
        Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
        Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
        Assert.DoesNotMatch(forbidden, sql);
        Assert.Single(TopLevel(Squash(sql), "SELECT "));
        Assert.Equal(Columns[name], OuterColumns(sql));
    }

    [Theory(DisplayName = "AC-3303.1 AC-3307.2 매개변수 표 = 문장 속 @이름(오늘 처방 시각 @from·@to Char 12·@hospital VarChar 32, 직전 종이 @chart VarChar 14·@visit VarChar 20·@hospital VarChar 32)")]
    [InlineData("TodayOrderTimes")]
    [InlineData("PrevPaperVisit")]
    [InlineData("PrevPaperSymptoms")]
    [InlineData("PrevPaperDx")]
    [InlineData("PrevPaperOrders")]
    public void ParameterTable(string name)
    {
        var sql = Statements[name];
        Assert.True(ReceptionSql.Parameters.ContainsKey(sql), name);
        var declared = ReceptionSql.Parameters[sql].Select(p => p.Name + ":" + p.Kind + ":" + p.Size).ToArray();
        Assert.Equal(Named[name], declared);
        var inText = Regex.Matches(sql, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(ReceptionSql.Parameters[sql].Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), inText);
    }

    [Theory(DisplayName = "AC-3303.1 AC-3307.2 Sql.IsAllowed가 받고 Sql.ParametersOf는 같은 표를 주며, ReadOnlyGuard는 그 매개변수와 함께만 지나고 고친 글·틀린 매개변수는 막는다")]
    [InlineData("TodayOrderTimes")]
    [InlineData("PrevPaperVisit")]
    [InlineData("PrevPaperSymptoms")]
    [InlineData("PrevPaperDx")]
    [InlineData("PrevPaperOrders")]
    public void GuardPassesOnlyExact(string name)
    {
        var sql = Statements[name];
        Assert.True(Sql.IsAllowed(sql));
        Assert.Same(ReceptionSql.Parameters[sql], Sql.ParametersOf(sql));
        ReadOnlyGuard.Require(sql);
        ReadOnlyGuard.Require(sql, ValidArgs(sql));

        foreach (var bad in new[] { sql + " ", sql + "; DELETE FROM dbo.OcmInf", sql.ToLowerInvariant(), sql.Replace("@hospital", "'SYNTHETIC'") })
        {
            Assert.False(Sql.IsAllowed(bad));
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(bad)).Code);
        }

        var extra = ValidArgs(sql);
        extra["@before"] = "20261105104233";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);
        foreach (var parameter in ReceptionSql.Parameters[sql])
        {
            var missing = ValidArgs(sql);
            missing.Remove(parameter.Name);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, missing)).Code);
            var tooLong = ValidArgs(sql);
            tooLong[parameter.Name] = new string('9', parameter.Size + 1);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong)).Code);
        }
    }

    [Theory(DisplayName = "AC-3303.1 AC-3307.2 읽는 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql·지금 ReceptionSql)이 이미 읽는 것뿐이다")]
    [InlineData("TodayOrderTimes")]
    [InlineData("PrevPaperVisit")]
    [InlineData("PrevPaperSymptoms")]
    [InlineData("PrevPaperDx")]
    [InlineData("PrevPaperOrders")]
    public void ReadsOnlyColumnsAlreadyUsed(string name)
    {
        var mine = new HashSet<string>(Statements.Values, StringComparer.Ordinal);
        var others = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Concat(ReceptionSql.Parameters.Keys.Where(sql => !mine.Contains(sql)));
        var existing = new HashSet<string>(others.SelectMany(sql => BitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        var results = new HashSet<string>(Columns.Values.SelectMany(c => c), StringComparer.Ordinal);
        var unknown = BitName.Matches(Statements[name]).Cast<Match>().Select(m => m.Value).Where(n => !results.Contains(n) && !existing.Contains(n)).Distinct();
        Assert.Empty(unknown);
    }

    // ---- AC-3303.1 오늘 처방 시각 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-3303.1 TodayOrderTimes는 TodayRx와 같은 오늘 접수 창(TodayCte: 외래·병원 범위, 상태로 거르지 않음)에 붙인 처방 줄(RxRow)만 읽는다")]
    public void TodayOrderTimesUsesTodayWindow()
    {
        var times = Squash(ReceptionSql.TodayOrderTimes);
        var rx = Squash(ReceptionSql.TodayRx);
        var head = rx.Substring(0, rx.IndexOf(") SELECT ", StringComparison.Ordinal) + 2);
        Assert.StartsWith(head, times, StringComparison.Ordinal);
        Assert.Equal(1, Count(times, InHospital));
        Assert.DoesNotContain("OcmComStt IN", times, StringComparison.Ordinal);
        Assert.Contains("FROM dbo.OdrInf o JOIN T ON T.OcmNum=o.OdrOcmNum WHERE " + RxRow, times, StringComparison.Ordinal);
        Assert.Equal(1, Count(times, "dbo.OdrInf"));
    }

    [Fact(DisplayName = "AC-3303.1 TodayOrderTimes는 내원·코드(UPPER(RTRIM))마다 한 줄로 묶어 가장 이른 처방 시각 MIN(o.OdrDtm)을 원값으로 준다")]
    public void TodayOrderTimesGroupsByVisitAndCode()
    {
        var times = Squash(ReceptionSql.TodayOrderTimes);
        Assert.Equal("o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode,MIN(o.OdrDtm) FirstAt", OuterSelectList(ReceptionSql.TodayOrderTimes));
        Assert.EndsWith("GROUP BY o.OdrOcmNum,UPPER(RTRIM(o.OdrCod))", times, StringComparison.Ordinal);
        Assert.DoesNotContain("DISTINCT", times, StringComparison.Ordinal);
    }

    // ---- AC-3307.2 직전 종이 넷 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3307.2 직전 종이의 내원 셋(증상·상병·처방)은 그 내원(c.OcmNum=@visit AND c.OcmChtNum=@chart, 완료 외래)을 병원 범위 안에서 V로 두고 V에 내원번호 칸으로만 붙여 읽는다")]
    public void PrevVisitWindow()
    {
        var head = "WITH V AS ( SELECT c.OcmNum FROM dbo.OcmInf c WHERE " + PrevVisit + " AND " + InHospital + " ) SELECT ";
        Assert.StartsWith(head, Squash(ReceptionSql.PrevPaperSymptoms), StringComparison.Ordinal);
        Assert.StartsWith(head, Squash(ReceptionSql.PrevPaperDx), StringComparison.Ordinal);
        Assert.StartsWith(head, Squash(ReceptionSql.PrevPaperOrders), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.EmrInf e JOIN V ON V.OcmNum=e.EmrOcmNum", Squash(ReceptionSql.PrevPaperSymptoms), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.OicInf x JOIN V ON V.OcmNum=x.OicOcmNum", Squash(ReceptionSql.PrevPaperDx), StringComparison.Ordinal);
        Assert.Contains("FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum WHERE " + RxRow, Squash(ReceptionSql.PrevPaperOrders), StringComparison.Ordinal);
        foreach (var name in PrevNames) Assert.Equal(1, Count(Squash(Statements[name]), "dbo.OcmInf c"));
    }

    [Fact(DisplayName = "AC-3307.2 PrevPaperVisit은 그 내원의 날(yyyyMMdd)·진료실(이 병원 DepMst JOIN = 병원 범위)·보험(PaperVisit과 같은 OUTER APPLY)이다")]
    public void PrevPaperVisitShape()
    {
        var visit = Squash(ReceptionSql.PrevPaperVisit);
        var paper = Squash(ReceptionSql.PaperVisit);
        Assert.Equal("LEFT(c.OcmAcpDtm,8) Day,RTRIM(d.DepKorNam) Room,RTRIM(i.InsCodNam) Ins", OuterSelectList(ReceptionSql.PrevPaperVisit));
        // FROM부터 WHERE 앞까지(진료실 JOIN·보험 OUTER APPLY)는 오늘 종이와 같은 글
        string Middle(string sql) => sql.Substring(sql.IndexOf(" FROM dbo.OcmInf c ", StringComparison.Ordinal), sql.LastIndexOf(" WHERE ", StringComparison.Ordinal) - sql.IndexOf(" FROM dbo.OcmInf c ", StringComparison.Ordinal));
        Assert.Equal(Middle(paper), Middle(visit));
        Assert.Contains("d.DepHspNum=@hospital", visit, StringComparison.Ordinal);
        Assert.EndsWith("WHERE " + PrevVisit, visit, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-3307.2 직전 종이 증상·상병·처방은 오늘 종이와 같은 줄 조건·차례다(증상 'S' 줄 전부 EmrShtSeq 순, 상병 OicSeq 순, 처방 RxRow OdrSeq 순)")]
    public void PrevPaperRowsLikeToday()
    {
        string Tail(string sql) { var s = Squash(sql); return s.Substring(s.IndexOf(" ) SELECT ", StringComparison.Ordinal)); }
        string WithoutVisitId(string tail) => tail.Replace(" SELECT e.EmrOcmNum VisitId,", " SELECT ");
        Assert.Equal(WithoutVisitId(Tail(ReceptionSql.PaperSymptoms)), Tail(ReceptionSql.PrevPaperSymptoms));
        Assert.Equal(Tail(ReceptionSql.PaperDx), Tail(ReceptionSql.PrevPaperDx));
        Assert.Equal(Tail(ReceptionSql.PaperOrders), Tail(ReceptionSql.PrevPaperOrders));
    }

    [Fact(DisplayName = "AC-3307.2 직전 종이는 사람 칸(PbsInf·주민번호·주소·전화·특이사항 PbsCmtInf)을 읽지 않고, 차트번호는 함수 없이 =@chart로 견준다")]
    public void PrevPaperReadsNoPersonColumns()
    {
        foreach (var name in PrevNames)
        {
            var sql = Statements[name];
            Assert.DoesNotMatch(new Regex(@"\bPbs\w*"), sql);
            Assert.Contains("c.OcmChtNum=@chart", sql, StringComparison.Ordinal);
            Assert.DoesNotMatch(WrappedChart, sql);
        }
    }
}
