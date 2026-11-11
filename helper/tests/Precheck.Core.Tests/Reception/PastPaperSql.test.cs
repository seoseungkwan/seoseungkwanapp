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

// 이 기능의 지난 종이 시험만 한 거르기로 돌리려고 PastPaper 이름 공간에 둔다(PastPaperReader·길 시험과 같은 감싸개)
namespace Precheck.Core.Tests.Reception.PastPaper;

/// <summary>
/// 지난 진료기록부 여러 장의 비트 문장(spec reception-memo-papers design.md 4절, TASK-2).
/// AC-3404.2 PastPaperVisits·PastPaperSymptoms·PastPaperDx·PastPaperOrders는 @chart·@before·@hospital·@first·@last를 받는 SELECT 상수이고
/// Sql.IsAllowed가 받는다. 상세 HistoryCount·HistoryPage와 같은 지난 내원(H 창: 그 접수보다 앞선 완료 내원·병원 범위)의 Seq 범위 줄만
/// 내원번호(첫 칸 VisitId)와 함께 준다. 사람 칸(주민번호·주소·전화·특이사항)은 읽지 않고, 줄 조건·차례는 직전 종이(/prev)와 같다.
/// </summary>
public class PastPaperSqlTests
{
    /// <summary>이름 → 문장.</summary>
    private static readonly Dictionary<string, string> Statements = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["PastPaperVisits"] = ReceptionSql.PastPaperVisits,
        ["PastPaperSymptoms"] = ReceptionSql.PastPaperSymptoms,
        ["PastPaperDx"] = ReceptionSql.PastPaperDx,
        ["PastPaperOrders"] = ReceptionSql.PastPaperOrders,
    };

    /// <summary>이름 → 결과 칸(순서대로). TASK-3(PastPaperReader)과의 약속이라 이름·순서가 그대로여야 한다.</summary>
    private static readonly Dictionary<string, string[]> Columns = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["PastPaperVisits"] = new[] { "VisitId", "Day", "Room", "Ins" },
        ["PastPaperSymptoms"] = new[] { "VisitId", "Line" },
        ["PastPaperDx"] = new[] { "VisitId", "Code", "Name", "Pri" },
        ["PastPaperOrders"] = new[] { "VisitId", "Code", "Name", "Qty", "Tms", "Day", "OutCod" },
    };

    /// <summary>모두 같은 매개변수(이름:종류:크기, 표 순서대로) — HistoryPage와 같다.</summary>
    private static readonly string[] Named = { "@chart:VarChar:14", "@before:VarChar:20", "@hospital:VarChar:32", "@first:Int:0", "@last:Int:0" };

    private const string InHospital =
        "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    private const string RxRow = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    private const string Range = "H.Seq BETWEEN @first AND @last";

    private static readonly Regex BitName = new Regex(@"\b[A-Z][a-z]{2}(?:[A-Z][a-z]{2})+\b");

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
        "@hospital" => Synthetic.Scope,
        "@chart" => "900001",
        "@before" => "20261105091230",
        "@first" => 1,
        "@last" => 2,
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

    /// <summary>HistoryPage의 H 창 머리 글("WITH H AS ( … )", 공백 하나로 줄인 것).</summary>
    private static string HistoryHead()
    {
        var page = Squash(ReceptionSql.HistoryPage);
        return page.Substring(0, page.IndexOf(" ), R AS (", StringComparison.Ordinal) + 2);
    }

    /// <summary>H 창 뒤 글(괄호 밖 SELECT부터).</summary>
    private static string Tail(string sql)
    {
        var text = Squash(sql);
        return text.Substring(HistoryHead().Length).Trim();
    }

    // ---- 상수·읽기 문장 하나·허용 목록 -------------------------------------------------------------------

    [Theory(DisplayName = "AC-3404.2 지난 종이 넷은 ReceptionSql의 public const string이고 읽기 문장 하나다(WITH 시작, 괄호 밖 SELECT 하나, ;·주석·쓰기 낱말·2012 뒤 글 없음), 결과 칸 첫 칸은 VisitId")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
    public void PublicConstSingleSelect(string name)
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR|DECLARE|SET|UNION|EXCEPT|INTERSECT|OFFSET|FETCH|STRING_AGG|STRING_SPLIT|CONCAT|CONCAT_WS|TRY_CONVERT|TRY_CAST|IIF|FORMAT|LAG|LEAD)\b|xp_|sp_|FOR XML", RegexOptions.IgnoreCase);
        var field = typeof(ReceptionSql).GetField(name, BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(field);
        Assert.True(field!.IsLiteral && !field.IsInitOnly, name + "는 const가 아니다");
        var sql = (string)field.GetRawConstantValue()!;
        Assert.Equal(Statements[name], sql);
        Assert.StartsWith("WITH ", sql, StringComparison.Ordinal);
        Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
        Assert.DoesNotMatch(forbidden, sql);
        Assert.Single(TopLevel(Squash(sql), "SELECT "));
        Assert.Equal(Columns[name], OuterColumns(sql));
        Assert.StartsWith("H.OcmNum VisitId,", OuterSelectList(sql), StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-3404.2 매개변수 표 = 문장 속 @이름(@chart VarChar 14·@before VarChar 20·@hospital VarChar 32·@first·@last Int, HistoryPage와 같은 표)")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
    public void ParameterTable(string name)
    {
        var sql = Statements[name];
        Assert.True(ReceptionSql.Parameters.ContainsKey(sql), name);
        var declared = ReceptionSql.Parameters[sql].Select(p => p.Name + ":" + p.Kind + ":" + p.Size).ToArray();
        Assert.Equal(Named, declared);
        Assert.Equal(
            ReceptionSql.Parameters[ReceptionSql.HistoryPage].Select(p => p.Name + ":" + p.Kind + ":" + p.Size),
            declared);
        var inText = Regex.Matches(sql, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(ReceptionSql.Parameters[sql].Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), inText);
    }

    [Theory(DisplayName = "AC-3404.2 Sql.IsAllowed가 받고 Sql.ParametersOf는 같은 표를 주며, ReadOnlyGuard는 그 매개변수와 함께만 지나고 고친 글·틀린 매개변수는 막는다")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
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
        extra["@visit"] = "V0901";
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);
        foreach (var parameter in ReceptionSql.Parameters[sql])
        {
            var missing = ValidArgs(sql);
            missing.Remove(parameter.Name);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, missing)).Code);
            if (parameter.Kind == SqlParamKind.Int) continue;
            var tooLong = ValidArgs(sql);
            tooLong[parameter.Name] = new string('9', parameter.Size + 1);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, tooLong)).Code);
        }
    }

    [Theory(DisplayName = "AC-3404.2 읽는 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql·지금 ReceptionSql)이 이미 읽는 것뿐이다")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
    public void ReadsOnlyColumnsAlreadyUsed(string name)
    {
        var mine = new HashSet<string>(Statements.Values, StringComparer.Ordinal);
        var others = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Concat(ReceptionSql.Parameters.Keys.Where(sql => !mine.Contains(sql)));
        var existing = new HashSet<string>(others.SelectMany(sql => BitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        var results = new HashSet<string>(Columns.Values.SelectMany(c => c), StringComparer.Ordinal);
        var unknown = BitName.Matches(Statements[name]).Cast<Match>().Select(m => m.Value).Where(n => !results.Contains(n) && !existing.Contains(n)).Distinct();
        Assert.Empty(unknown);
    }

    // ---- 지난 내원 창: 상세(HistoryCount·HistoryPage)와 같은 H ---------------------------------------------

    [Theory(DisplayName = "AC-3404.2 넷 모두 HistoryPage와 같은 H 창(그 접수보다 앞선 완료 외래 내원·병원 범위, 최근 순 Seq)으로 시작하고, 괄호 밖에서 H.Seq BETWEEN @first AND @last 줄만 H.Seq 순으로 준다")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
    public void SameHistoryWindow(string name)
    {
        var sql = Squash(Statements[name]);
        var head = HistoryHead();
        Assert.StartsWith(head, sql, StringComparison.Ordinal);
        Assert.Contains("c.OcmChtNum=@chart AND c.OcmAcpDtm<@before AND ", head, StringComparison.Ordinal);
        Assert.Contains(InHospital, head, StringComparison.Ordinal);
        Assert.Contains("ROW_NUMBER() OVER (ORDER BY c.OcmAcpDtm DESC,c.OcmNum DESC) Seq", head, StringComparison.Ordinal);
        // HistoryCount와 같은 내원 조건(차트·접수 시각·완료 외래·병원 범위)
        var count = Squash(ReceptionSql.HistoryCount);
        var where = count.Substring(count.IndexOf(" WHERE ", StringComparison.Ordinal) + " WHERE ".Length);
        Assert.Contains(where, head, StringComparison.Ordinal);

        var tail = Tail(Statements[name]);
        Assert.StartsWith("SELECT H.OcmNum VisitId,", tail, StringComparison.Ordinal);
        Assert.Equal(1, Count(tail, Range));
        Assert.Contains(" WHERE " + Range, tail, StringComparison.Ordinal);
        Assert.Matches(new Regex(@" ORDER BY H\.Seq(,[a-z]\.\w+)?$"), tail);
    }

    [Fact(DisplayName = "AC-3404.2 PastPaperVisits는 H의 그 내원(같은 차트번호)의 날(yyyyMMdd)·진료실(이 병원 DepMst JOIN = 병원 범위)·보험(PaperVisit·PrevPaperVisit과 같은 OUTER APPLY)이다")]
    public void VisitsShape()
    {
        var visits = Squash(ReceptionSql.PastPaperVisits);
        Assert.Equal("H.OcmNum VisitId,LEFT(H.OcmAcpDtm,8) Day,RTRIM(d.DepKorNam) Room,RTRIM(i.InsCodNam) Ins", OuterSelectList(ReceptionSql.PastPaperVisits));
        Assert.Contains(" FROM H JOIN dbo.OcmInf c ON c.OcmNum=H.OcmNum AND c.OcmChtNum=@chart JOIN dbo.DepMst d ", visits, StringComparison.Ordinal);
        // 진료실 JOIN·보험 OUTER APPLY는 오늘 종이와 같은 글
        var paper = Squash(ReceptionSql.PaperVisit);
        var join = paper.Substring(paper.IndexOf(" JOIN dbo.DepMst d ", StringComparison.Ordinal), paper.LastIndexOf(" WHERE ", StringComparison.Ordinal) - paper.IndexOf(" JOIN dbo.DepMst d ", StringComparison.Ordinal));
        Assert.Contains(join + " WHERE " + Range + " ORDER BY H.Seq", visits, StringComparison.Ordinal);
        Assert.Contains("d.DepHspNum=@hospital", Tail(ReceptionSql.PastPaperVisits), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-3404.2 증상·상병·처방은 H에 내원번호 칸으로만 붙여 읽고, 줄 조건·차례는 직전 종이와 같다(증상 'S' 줄 전부 EmrShtSeq 순, 상병 OicSeq 순, 처방 RxRow OdrSeq 순)")]
    public void RowsLikePrev()
    {
        Assert.Equal(
            "SELECT H.OcmNum VisitId,CAST(e.EmrShtVal AS nvarchar(max)) Line FROM dbo.EmrInf e JOIN H ON H.OcmNum=e.EmrOcmNum WHERE " + Range + " AND e.EmrShtTyp='S' ORDER BY H.Seq,e.EmrShtSeq",
            Tail(ReceptionSql.PastPaperSymptoms));
        Assert.Equal(
            "SELECT H.OcmNum VisitId,RTRIM(x.OicElcCod) Code,RTRIM(x.OicIcdNam) Name,RTRIM(ISNULL(x.OicIcdPri,'')) Pri FROM dbo.OicInf x JOIN H ON H.OcmNum=x.OicOcmNum WHERE " + Range + " ORDER BY H.Seq,x.OicSeq",
            Tail(ReceptionSql.PastPaperDx));
        Assert.Equal(
            "SELECT H.OcmNum VisitId,RTRIM(o.OdrCod) Code,RTRIM(o.OdrCodNam) Name,o.OdrQty Qty,o.OdrTms Tms,o.OdrDay Day,RTRIM(ISNULL(o.OdrOutCod,'')) OutCod FROM dbo.OdrInf o JOIN H ON H.OcmNum=o.OdrOcmNum WHERE " + Range + " AND " + RxRow + " ORDER BY H.Seq,o.OdrSeq",
            Tail(ReceptionSql.PastPaperOrders));

        // 칸 글은 직전 종이와 같다(앞에 VisitId 칸만 더함)
        string Columns(string sql) => OuterSelectList(sql);
        Assert.Equal("H.OcmNum VisitId," + Columns(ReceptionSql.PrevPaperSymptoms), Columns(ReceptionSql.PastPaperSymptoms));
        Assert.Equal("H.OcmNum VisitId," + Columns(ReceptionSql.PrevPaperDx), Columns(ReceptionSql.PastPaperDx));
        Assert.Equal("H.OcmNum VisitId," + Columns(ReceptionSql.PrevPaperOrders), Columns(ReceptionSql.PastPaperOrders));
        Assert.Contains("WHERE e.EmrShtTyp='S' ORDER BY e.EmrShtSeq", Squash(ReceptionSql.PrevPaperSymptoms), StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-3404.2 지난 종이는 사람 칸(PbsInf·주민번호·주소·전화·특이사항 PbsCmtInf)을 읽지 않고, 차트번호는 함수 없이 =@chart로 견주며, 내원(OcmInf)을 읽는 곳마다 병원 범위가 있다")]
    [InlineData("PastPaperVisits")]
    [InlineData("PastPaperSymptoms")]
    [InlineData("PastPaperDx")]
    [InlineData("PastPaperOrders")]
    public void NoPersonColumnsAndScoped(string name)
    {
        var sql = Squash(Statements[name]);
        Assert.DoesNotMatch(new Regex(@"\bPbs\w*"), sql);
        Assert.Contains("c.OcmChtNum=@chart", sql, StringComparison.Ordinal);
        Assert.DoesNotMatch(WrappedChart, sql);
        // H 창의 OcmInf는 EXISTS 병원 범위, PastPaperVisits의 다시 읽기는 이 병원 DepMst JOIN이 병원 범위다
        var reads = Count(sql, "dbo.OcmInf c");
        Assert.Equal(name == "PastPaperVisits" ? 2 : 1, reads);
        Assert.Equal(1, Count(sql, InHospital));
        Assert.Equal(name == "PastPaperVisits" ? 2 : 1, Count(sql, "d.DepHspNum=@hospital"));
        // 처방은 그 내원(H)에 붙여서만
        Assert.Equal(Count(sql, "dbo.OdrInf"), Count(sql, "FROM dbo.OdrInf o JOIN H ON H.OcmNum=o.OdrOcmNum WHERE "));
    }
}
