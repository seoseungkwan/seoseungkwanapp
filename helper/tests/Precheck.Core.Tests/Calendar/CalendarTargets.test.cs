using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;
using Precheck.Core.Sunap;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Contact.Read;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Calendar;

/// <summary>
/// 예약 탭 도우미 읽기(spec clinic-calendar REQ-5903) calfind·calday의 가짜 비트 SQL 답. 모두 지어낸 것이다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리,
/// 생일 19650312처럼 지어낸 날. 줄 모양은 SQL 문장의 칸 차례 그대로다(비트 char 칸처럼 뒤에 빈칸이 붙은 값도 섞는다). 가짜 오늘은 2026-10-30(Synthetic.Today)이다.
/// SQL 글자는 design.md '도우미 답' 그대로 여기 적고, 시험은 이 글자로 가짜 답을 정한다(문장이 한 글자라도 달라지면 RED). 줄바꿈은 "\n"(윈도우 받기 CRLF와 상관없게).
/// </summary>
internal static class CalData
{
    public const string Today = "2026-10-30";

    private const string FindHead =
        "SELECT TOP 21 RTRIM(b.PbsChtNum),b.PbsPatNam,b.PbsSexTyp,b.PbsBirDte,l.LastDay\n"
        + "FROM dbo.PbsInf b\n"
        + "OUTER APPLY (SELECT MAX(LEFT(c.OcmAcpDtm,8)) LastDay FROM dbo.OcmInf c\n"
        + " WHERE c.OcmChtNum=b.PbsChtNum AND c.OcmAcpDtm<@until AND c.OcmPatTyp='O'\n"
        + "  AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) l\n";

    private const string FindTail =
        " AND EXISTS(SELECT 1 FROM dbo.OcmInf w WHERE w.OcmChtNum=b.PbsChtNum\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=w.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(w.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))\n"
        + "ORDER BY l.LastDay DESC,b.PbsChtNum";

    /// <summary>차트번호 찾기(q가 숫자 1~10자리): 차트번호가 같은 환자.</summary>
    public const string FindChartSqlText = FindHead + "WHERE RTRIM(b.PbsChtNum)=@q\n" + FindTail;

    /// <summary>이름 찾기(q 두 글자 이상): 이름이 q로 시작하는 환자. q에는 LIKE 특수 글자(% _ [)가 없다(도우미가 거부).</summary>
    public const string FindNameSqlText = FindHead + "WHERE b.PbsPatNam LIKE @q + '%'\n" + FindTail;

    /// <summary>calday 접수: 기간 센 접수(통계 Visits 조건)의 [날, 차트번호], 중복 없음, 빈 차트번호 뺌.</summary>
    public const string CameSqlText =
        "SELECT DISTINCT LEFT(c.OcmAcpDtm,8),RTRIM(c.OcmChtNum)\n"
        + "FROM dbo.OcmInf c\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'\n"
        + "  AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)\n"
        + "  AND RTRIM(ISNULL(c.OcmChtNum,''))<>''";

    /// <summary>calday 비트 예약: 수납일지 다음 예약(SunapSql.NextReservationSql)과 같은 조건의 기간 접수 [차트번호, 이름, 접수 시각].</summary>
    public const string RsvSqlText =
        "SELECT RTRIM(c.OcmChtNum),b.PbsPatNam,c.OcmAcpDtm\n"
        + "FROM dbo.OcmInf c\n"
        + "LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum\n"
        + "OUTER APPLY (SELECT TOP 1 1 Found FROM dbo.RsvInf x\n"
        + "  WHERE x.RsvOcmNum=c.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND ISNULL(c.OcmComStt,'')<>'CN'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)\n"
        + "  AND (r.Found=1 OR c.OcmComStt IN ('WR','NR','CR'))\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    /// <summary>CalendarSql의 상수 이름 → 이 글자.</summary>
    public static readonly (string Field, string Text)[] Sqls =
    {
        ("FindChartSql", FindChartSqlText), ("FindNameSql", FindNameSqlText), ("CameSql", CameSqlText), ("RsvSql", RsvSqlText),
    };

    /// <summary>찾기 SQL 한 줄: 차트번호·이름·성별(PbsSexTyp)·생일(PbsBirDte)·마지막 내원일.</summary>
    public static object?[] Found(string? chart, string? name, string? sex, string? birth, string? last) => new object?[] { chart, name, sex, birth, last };

    /// <summary>접수 SQL 한 줄: 날 yyyyMMdd·차트번호.</summary>
    public static object?[] Came(string? day, string? chart) => new object?[] { day, chart };

    /// <summary>비트 예약 SQL 한 줄: 차트번호·이름·접수 시각 yyyyMMddHHmm.</summary>
    public static object?[] Rsv(string? chart, string? name, string? at) => new object?[] { chart, name, at };

    /// <summary>네 SQL 모두 빈 답.</summary>
    public static void Defaults(FakeDb db)
    {
        foreach (var (_, text) in Sqls) db.Answer(text, _ => new object?[0][]);
    }

    /// <summary>도우미의 Precheck.Core.Calendar.CalendarSql 상수 값(없으면 null). 시험은 새 클래스를 직접 부르지 않아 구현 전에도 빌드된다.</summary>
    public static object? Real(string field) =>
        typeof(Sql).Assembly.GetType("Precheck.Core.Calendar.CalendarSql")?.GetField(field, BindingFlags.Public | BindingFlags.Static)?.GetValue(null);

    public static string Find(string q) => "{\"kind\":\"calfind\",\"from\":\"" + Today + "\",\"to\":\"" + Today + "\",\"q\":" + JsonSerializer.Serialize(q) + "}";

    public static string Day(string from, string to) => "{\"kind\":\"calday\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
}

/// <summary>
/// REQ-5903 도우미 0.10.0 — 예약 탭 비트 찾기(calfind)·접수와 비트 예약(calday). 명령 contact.targets를 실제 명령 표·Dispatcher로 지나 chunk … end까지 본다(ContactRig).
/// 비트 DB는 가짜(FakeSession)라 SQL의 뜻은 문장 글자로 못 박는다.
/// </summary>
public class CalendarTargetsTests
{
    private static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(150);

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    private static ContactRig NewRig(bool registered = true)
    {
        var rig = new ContactRig(registered);
        CalData.Defaults(rig.Db);
        return rig;
    }

    private static string Reply(ContactRig rig, string args) => Replies.Canon(Replies.Join(rig.SendArgs(args)));

    private static string Rows(params string[] rows) => "[" + string.Join(",", rows) + "]";

    // ── AC-5903.1 calfind ─────────────────────────────────────────────

    [Fact(DisplayName = "AC-5903.1 calfind 이름: 앞뒤 빈칸을 뺀 q로 이름 앞부분 SQL 하나(@q·내일 0시 @until·병원 범위, 150초)를 등록 병원 확인 뒤 돌리고 {v:1, kind, today, more, rows}를 chunk … end로 보낸다(통계 화면·비트 로그인 없음)")]
    public void FindByNamePrefix()
    {
        using var rig = NewRig();
        rig.Db.Answer(CalData.FindNameSqlText, _ => new[]
        {
            CalData.Found("900001 ", " 가상환자01 ", "F", "19650312", "20261028"),
            CalData.Found("900002", "가상환자02", "M ", "19800101", null),
        });

        Assert.Equal(
            "{\"v\":1,\"kind\":\"calfind\",\"today\":\"2026-10-30\",\"more\":false,\"rows\":["
            + "[\"900001\",\"가상환자01\",\"F\",\"19650312\",\"20261028\"],[\"900002\",\"가상환자02\",\"M\",\"19800101\",null]]}",
            Reply(rig, CalData.Find(" 가상 ")));

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, CalData.FindNameSqlText }, rig.Db.Sqls);
        var call = rig.Db.Calls.Last();
        var expected = new Dictionary<string, object?> { ["@q"] = "가상", ["@until"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        Assert.Equal(expected.OrderBy(p => p.Key, StringComparer.Ordinal), call.Args.OrderBy(p => p.Key, StringComparer.Ordinal));
        Assert.Equal(ReadTimeout, call.Timeout);
        Assert.Equal(1, rig.Db.Disposed);
        Assert.Empty(rig.Screens.Calls);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Theory(DisplayName = "AC-5903.1 calfind 차트번호: q가 숫자 1~10자리면(앞뒤 빈칸 뺌) 차트번호가 같은 환자 SQL을 그 숫자로 부른다")]
    [InlineData("900001", "900001")]
    [InlineData(" 10231 ", "10231")]
    [InlineData("0000000001", "0000000001")]
    [InlineData("7", "7")]
    public void FindByChart(string q, string sent)
    {
        using var rig = NewRig();
        rig.Db.Answer(CalData.FindChartSqlText, _ => new[] { CalData.Found(sent, "가상환자01", "F", "19650312", "20261028") });

        Assert.Equal(
            "{\"v\":1,\"kind\":\"calfind\",\"today\":\"2026-10-30\",\"more\":false,\"rows\":[[\"" + sent + "\",\"가상환자01\",\"F\",\"19650312\",\"20261028\"]]}",
            Reply(rig, CalData.Find(q)));
        var call = rig.Db.Calls.Last();
        Assert.Equal(CalData.FindChartSqlText, call.Sql);
        Assert.Equal(sent, call.Args["@q"]);
        Assert.DoesNotContain(CalData.FindNameSqlText, rig.Db.Sqls);
    }

    [Fact(DisplayName = "AC-5903.1 calfind 칸: 성별 PbsSexTyp는 M·F(앞뒤 빈칸 뺌)만, 아니면 null. 생일·마지막 내원은 있는 날짜 yyyyMMdd만(0~99년 빼고), 아니면 null")]
    public void FindCellsAreChecked()
    {
        using var rig = NewRig();
        rig.Db.Answer(CalData.FindNameSqlText, _ => new[]
        {
            CalData.Found("900001", "가상환자01", " M ", "19650312", "20261028"),
            CalData.Found("900002", "가상환자02", "X", "19650230", "2026102"),
            CalData.Found("900003", "가상환자03", "", "00010101", "20261332"),
            CalData.Found("900004", "가상환자04", null, "1965-03-12", "2026-10-28"),
            CalData.Found("900005", "가상환자05", "m", null, null),
            CalData.Found("900006", "가상환자06", "1", "1965031a", "20260229"),
        });

        Assert.Equal(
            "{\"v\":1,\"kind\":\"calfind\",\"today\":\"2026-10-30\",\"more\":false,\"rows\":" + Rows(
                "[\"900001\",\"가상환자01\",\"M\",\"19650312\",\"20261028\"]",
                "[\"900002\",\"가상환자02\",null,null,null]",
                "[\"900003\",\"가상환자03\",null,null,null]",
                "[\"900004\",\"가상환자04\",null,null,null]",
                "[\"900005\",\"가상환자05\",null,null,null]",
                "[\"900006\",\"가상환자06\",null,null,null]") + "}",
            Reply(rig, CalData.Find("가상")));
    }

    [Fact(DisplayName = "AC-5903.1 calfind more: SQL은 21명까지 읽고, 21째가 있으면 앞 20명만 보내고 more가 참. 20명이면 거짓. 차례는 SQL 차례(마지막 내원 늦은 차례, 같으면 차트번호) 그대로")]
    public void FindSendsTwentyAndMore()
    {
        object?[] Person(int n) => CalData.Found((900000 + n).ToString(), "가상환자" + n.ToString("00"), "F", "19650312", "202610" + (30 - n).ToString("00"));

        using (var rig = NewRig())
        {
            rig.Db.Answer(CalData.FindNameSqlText, _ => Enumerable.Range(1, 21).Select(Person).ToArray());
            var json = Replies.JoinJson(rig.SendArgs(CalData.Find("가상")));
            Assert.True(json.GetProperty("more").GetBoolean());
            var rows = json.GetProperty("rows").EnumerateArray().Select(row => row[0].GetString()).ToArray();
            Assert.Equal(Enumerable.Range(1, 20).Select(n => (900000 + n).ToString()), rows);
        }
        using (var rig = NewRig())
        {
            rig.Db.Answer(CalData.FindNameSqlText, _ => Enumerable.Range(1, 20).Select(Person).ToArray());
            var json = Replies.JoinJson(rig.SendArgs(CalData.Find("가상")));
            Assert.False(json.GetProperty("more").GetBoolean());
            Assert.Equal(20, json.GetProperty("rows").GetArrayLength());
        }
    }

    [Fact(DisplayName = "AC-5903.1 calfind 이상한 줄 하나 때문에 찾기가 막히지 않게 그 줄만 건너뛴다(차트번호가 숫자 1~10자가 아님·이름 없음·이름 40자 넘음·같은 차트 두 줄은 앞 줄만)")]
    public void FindSkipsOddRows()
    {
        using var rig = NewRig();
        rig.Db.Answer(CalData.FindNameSqlText, _ => new[]
        {
            CalData.Found("", "가상환자01", "F", null, null),
            CalData.Found(null, "가상환자02", "F", null, null),
            CalData.Found("90000A", "가상환자03", "F", null, null),
            CalData.Found("12345678901", "가상환자04", "F", null, null),
            CalData.Found("900005", "   ", "F", null, null),
            CalData.Found("900006", null, "F", null, null),
            CalData.Found("900007", new string('가', 41), "F", null, null),
            CalData.Found("900008", new string('가', 40), "M", null, null),
            CalData.Found("900009", "가상환자09", "F", null, "20261028"),
            CalData.Found("900009 ", "가상환자09 다른 줄", "M", null, null),
        });

        Assert.Equal(
            "{\"v\":1,\"kind\":\"calfind\",\"today\":\"2026-10-30\",\"more\":false,\"rows\":" + Rows(
                "[\"900008\",\"" + new string('가', 40) + "\",\"M\",null,null]",
                "[\"900009\",\"가상환자09\",\"F\",null,\"20261028\"]") + "}",
            Reply(rig, CalData.Find("가상")));
    }

    [Fact(DisplayName = "AC-5903.1 calfind SQL: TOP 21, 이 병원 접수(상태 무관)가 한 번도 없는 환자는 빼고, 마지막 내원은 센 접수(외래·WN/HN/TN/PN·OcmRsuYon<>'O'·이 병원·내일 0시 전) 중 가장 늦은 날, 늦은 차례(같으면 차트번호)")]
    public void FindSqlMeaning()
    {
        Assert.Equal(CalData.FindNameSqlText, CalData.Real("FindNameSql"));
        Assert.Equal(CalData.FindChartSqlText, CalData.Real("FindChartSql"));
        foreach (var sql in new[] { CalData.FindNameSqlText, CalData.FindChartSqlText })
        {
            var text = Squash(sql);
            Assert.StartsWith("SELECT TOP 21 RTRIM(b.PbsChtNum),b.PbsPatNam,b.PbsSexTyp,b.PbsBirDte,l.LastDay FROM dbo.PbsInf b ", text, StringComparison.Ordinal);
            Assert.Contains(
                "OUTER APPLY (SELECT MAX(LEFT(c.OcmAcpDtm,8)) LastDay FROM dbo.OcmInf c WHERE c.OcmChtNum=b.PbsChtNum AND c.OcmAcpDtm<@until AND c.OcmPatTyp='O' "
                + "AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O' AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod "
                + "AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) l",
                text, StringComparison.Ordinal);
            Assert.Contains(
                "AND EXISTS(SELECT 1 FROM dbo.OcmInf w WHERE w.OcmChtNum=b.PbsChtNum AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=w.OcmDepCod "
                + "AND d.DepHspNum=@hospital AND LEFT(w.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))",
                text, StringComparison.Ordinal);
            Assert.EndsWith("ORDER BY l.LastDay DESC,b.PbsChtNum", text, StringComparison.Ordinal);
        }
        Assert.Contains("WHERE b.PbsPatNam LIKE @q + '%' AND EXISTS", Squash(CalData.FindNameSqlText), StringComparison.Ordinal);
        Assert.Contains("WHERE RTRIM(b.PbsChtNum)=@q AND EXISTS", Squash(CalData.FindChartSqlText), StringComparison.Ordinal);

        // 센 접수 조건은 통계 Visits 글(PeriodVisits)과 같다
        var stats = Squash(StatsSql.VisitRowsSql);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O' AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod "
            + "AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)", stats, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5903.1 AC-5903.3 새 SQL은 환자 표에서 차트번호·이름·성별·생일(찾기만)만 읽고 전화·주소·주민번호·메모는 읽지 않는다")]
    public void ReadsOnlyNeededColumns()
    {
        string[] Columns(string sql, string prefix) =>
            Regex.Matches(sql, @"\b" + prefix + @"[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();

        foreach (var (field, sql) in CalData.Sqls)
        {
            Assert.Equal(sql, CalData.Real(field));
            foreach (var dropped in new[] { "Phn", "Tel", "Hpn", "ResNum", "Adr", "RefCmt", "BilCmt", "Cmt", "Memo", "Emr", "RefMem" })
            {
                Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
            }
        }
        Assert.Equal(new[] { "PbsBirDte", "PbsChtNum", "PbsInf", "PbsPatNam", "PbsSexTyp" }, Columns(CalData.FindNameSqlText, "Pbs"));
        Assert.Equal(new[] { "PbsBirDte", "PbsChtNum", "PbsInf", "PbsPatNam", "PbsSexTyp" }, Columns(CalData.FindChartSqlText, "Pbs"));
        Assert.Empty(Columns(CalData.CameSqlText, "Pbs"));
        Assert.Equal(new[] { "PbsChtNum", "PbsInf", "PbsPatNam" }, Columns(CalData.RsvSqlText, "Pbs"));
        Assert.Equal(new[] { "RsvDivTyp", "RsvInf", "RsvOcmNum", "RsvSts" }, Columns(CalData.RsvSqlText, "Rsv"));
    }

    [Fact(DisplayName = "AC-5903.1 calfind가 막히면 error 하나만(chunk·end 없음): 등록 없음은 E-BIT-NOT-REGISTERED(비트 안 건드림), 읽기 실패는 E-BIT-READ-FAILED, 답·기록에 환자 값 없음")]
    public void FindFailsWithOneError()
    {
        using (var rig = NewRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Replies.OnlyError(rig.SendArgs(CalData.Find("가상"))));
            Assert.False(rig.BitTouched);
        }
        foreach (var (q, sql) in new[] { ("가상", CalData.FindNameSqlText), ("900001", CalData.FindChartSqlText) })
        {
            using var rig = NewRig();
            rig.Db.Fail(sql, "E-BIT-READ-FAILED");
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.SendArgs(CalData.Find(q))));
            Assert.DoesNotContain("가상", rig.RawReplies, StringComparison.Ordinal);
            Assert.DoesNotContain("900001", rig.RawReplies, StringComparison.Ordinal);
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-BIT-READ-FAILED") }, rig.Log);
            Assert.Equal(1, rig.Db.Disposed);
        }
    }

    // ── AC-5903.2 calfind 검사 ─────────────────────────────────────────

    [Theory(DisplayName = "AC-5903.2 calfind: from·to가 오늘이 아니거나 q가 없거나 21자 이상·빈 글·숫자와 다른 글자가 섞임·숫자 11자리·이름 한 글자·% _ [·제어 문자면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-29\",\"to\":\"2026-10-29\",\"q\":\"가상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-31\",\"q\":\"가상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-31\",\"to\":\"2026-10-31\",\"q\":\"가상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-29\",\"to\":\"2026-10-30\",\"q\":\"가상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가상가상가상가상가상가상가상가상가상가상가\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"   \"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가상1\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"9000a1\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"12 34\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"12345678901\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\" 가 \"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가%\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가_상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"[가상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":\"가\\t상\"}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":12345}")]
    [InlineData("{\"kind\":\"calfind\",\"from\":\"2026-10-30\",\"to\":\"2026-10-30\",\"q\":null}")]
    public void FindRejectsBadArgs(string args)
    {
        using var rig = NewRig();
        Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.SendArgs(args)));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-HELPER-BAD-MESSAGE") }, rig.Log);
    }

    [Theory(DisplayName = "AC-5903.2 calfind 밖의 kind(calday·sunap·reservation·lapsed·followup)에 q가 오면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("calday", "2026-10-26", "2026-10-31")]
    [InlineData("sunap", "2026-10-30", "2026-10-30")]
    [InlineData("reservation", "2026-10-26", "2026-10-31")]
    [InlineData("lapsed", "2026-09-01", "2026-09-30")]
    [InlineData("followup", "2026-10-01", "2026-10-28")]
    public void QOnlyForFind(string kind, string from, string to)
    {
        using var rig = NewRig();
        var args = "{\"kind\":\"" + kind + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"q\":\"가상\"}";
        Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.SendArgs(args)));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
    }

    // ── AC-5903.3 calday ─────────────────────────────────────────────

    [Fact(DisplayName = "AC-5903.3 calday: 등록 병원 확인 → 접수 SQL → 비트 예약 SQL(그 기간 0시 ~ 끝 다음 날 0시·병원 범위, 150초), 답 {v:1, kind, from, to, today, came, rsv}. came은 [날, 차트번호] 중복 없이 날·차트 차례, rsv는 [차트|null, 이름|null, 시각 12자리] SQL 차례")]
    public void DayReadsCameAndReservations()
    {
        using var rig = NewRig();
        rig.Db.Answer(CalData.CameSqlText, _ => new[]
        {
            CalData.Came("20261027", "900002"),
            CalData.Came("20261026", "900001"),
            CalData.Came("20261026", "900001 "),          // 같은 날 같은 차트(뒤 빈칸)
            CalData.Came("20261026", "900003"),
            CalData.Came("20261027", ""),                 // 빈 차트번호
            CalData.Came("20261027", null),
            CalData.Came("2026102", "900004"),            // 날 모양이 틀림
            CalData.Came("20261027", "90000A"),           // 차트번호가 숫자가 아님
            CalData.Came("20261101", "900005"),           // 기간 밖
            CalData.Came("20261025", "900006"),
        });
        rig.Db.Answer(CalData.RsvSqlText, _ => new[]
        {
            CalData.Rsv("900001", " 가상환자01 ", "202610281030"),
            CalData.Rsv("", null, "202610281100"),
            CalData.Rsv("  ", "가상환자09", "202610291400"),
            CalData.Rsv("900002", "가상환자02", "2026102814"),     // 시각 모양이 틀림
            CalData.Rsv("900002", "가상환자02", "202610281460"),   // 60분
            CalData.Rsv("900003", "가상환자03", "202611010900"),   // 끝 다음 날
            CalData.Rsv("900003", "가상환자03", "202610250900"),   // 시작 전 날
            CalData.Rsv("900001", "가상환자01", "202610281030"),   // 같은 줄 두 번
            CalData.Rsv("9000A1", "가상환자04", "202610301000"),   // 차트번호가 숫자가 아님
            CalData.Rsv("900005", new string('가', 41), "202610311700"),   // 이름 40자 넘음 → null
            CalData.Rsv("900006", "가상환자06", " 202610311200 "),
        });

        Assert.Equal(
            "{\"v\":1,\"kind\":\"calday\",\"from\":\"2026-10-26\",\"to\":\"2026-10-31\",\"today\":\"2026-10-30\","
            + "\"came\":[[\"20261026\",\"900001\"],[\"20261026\",\"900003\"],[\"20261027\",\"900002\"]],"
            + "\"rsv\":[[\"900001\",\"가상환자01\",\"202610281030\"],[null,null,\"202610281100\"],[null,\"가상환자09\",\"202610291400\"],"
            + "[\"900005\",null,\"202610311700\"],[\"900006\",\"가상환자06\",\"202610311200\"]]}",
            Reply(rig, CalData.Day("2026-10-26", "2026-10-31")));

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, CalData.CameSqlText, CalData.RsvSqlText }, rig.Db.Sqls);
        var expected = new Dictionary<string, object?> { ["@from"] = "202610260000", ["@to"] = "202611010000", ["@hospital"] = Synthetic.Scope };
        foreach (var call in rig.Db.Calls.Skip(2))
        {
            Assert.Equal(expected.OrderBy(p => p.Key, StringComparer.Ordinal), call.Args.OrderBy(p => p.Key, StringComparer.Ordinal));
            Assert.Equal(ReadTimeout, call.Timeout);
        }
        Assert.Equal(1, rig.Db.Disposed);
        Assert.Empty(rig.Screens.Calls);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Theory(DisplayName = "AC-5903.3 calday: 42일 안이고 오늘−62일 ≤ from, to ≤ 오늘+92일이면 된다")]
    [InlineData("2026-10-30", "2026-10-30")]
    [InlineData("2026-08-29", "2026-08-29")]   // 오늘−62일
    [InlineData("2026-08-29", "2026-10-09")]   // 42일
    [InlineData("2026-12-20", "2027-01-30")]   // 42일, 끝 = 오늘+92일
    [InlineData("2027-01-30", "2027-01-30")]
    public void DayAcceptsRange(string from, string to)
    {
        using var rig = NewRig();
        var json = Replies.JoinJson(rig.SendArgs(CalData.Day(from, to)));
        Assert.Equal(from, json.GetProperty("from").GetString());
        Assert.Equal(to, json.GetProperty("to").GetString());
        Assert.Equal(0, json.GetProperty("came").GetArrayLength());
        Assert.Equal(0, json.GetProperty("rsv").GetArrayLength());
    }

    [Theory(DisplayName = "AC-5903.3 calday: 43일 이상·오늘−62일보다 이름·오늘+92일보다 늦음·거꾸로면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("2026-08-28", "2026-08-28")]   // 오늘−63일
    [InlineData("2026-08-28", "2026-09-05")]
    [InlineData("2027-01-31", "2027-01-31")]   // 오늘+93일
    [InlineData("2027-01-20", "2027-01-31")]
    [InlineData("2026-10-01", "2026-11-12")]   // 43일
    [InlineData("2026-10-31", "2026-10-30")]   // 거꾸로
    public void DayRejectsRange(string from, string to)
    {
        using var rig = NewRig();
        Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.SendArgs(CalData.Day(from, to))));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
    }

    [Fact(DisplayName = "AC-5903.3 calday SQL: 접수는 통계 Visits 조건(외래·WN/HN/TN/PN·OcmRsuYon<>'O'·이 병원)에 빈 차트번호 뺌, 비트 예약은 수납일지 다음 예약 조건(RsvInf 'R'·'' 또는 WR·NR·CR, CN 아님, 외래·이 병원)")]
    public void DaySqlMeaning()
    {
        Assert.Equal(CalData.CameSqlText, CalData.Real("CameSql"));
        Assert.Equal(CalData.RsvSqlText, CalData.Real("RsvSql"));

        const string Counted = "c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O' "
            + "AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";
        Assert.Contains(Counted, Squash(StatsSql.VisitRowsSql), StringComparison.Ordinal);
        Assert.Equal("SELECT DISTINCT LEFT(c.OcmAcpDtm,8),RTRIM(c.OcmChtNum) FROM dbo.OcmInf c WHERE " + Counted + " AND RTRIM(ISNULL(c.OcmChtNum,''))<>''", Squash(CalData.CameSqlText));

        // 수납일지 다음 예약 글(w)을 c로 읽으면 같은 조건이다
        var next = Squash(SunapSql.NextReservationSql).Replace("w.", "c.");
        var rsv = Squash(CalData.RsvSqlText);
        foreach (var part in new[]
        {
            "x.RsvOcmNum=c.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts",
            "c.OcmPatTyp='O' AND ISNULL(c.OcmComStt,'')<>'CN'",
            "AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)",
            "AND (r.Found=1 OR c.OcmComStt IN ('WR','NR','CR'))",
        })
        {
            Assert.Contains(part, next, StringComparison.Ordinal);
            Assert.Contains(part, rsv, StringComparison.Ordinal);
        }
        Assert.Contains("WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'", rsv, StringComparison.Ordinal);
        Assert.Contains("LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum", rsv, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5903.3 calday가 막히면 error 하나만: 등록 없음 E-BIT-NOT-REGISTERED, 접수·예약 SQL 실패 E-BIT-READ-FAILED(답·기록에 환자 값 없음)")]
    public void DayFailsWithOneError()
    {
        using (var rig = NewRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Replies.OnlyError(rig.SendArgs(CalData.Day("2026-10-26", "2026-10-31"))));
            Assert.False(rig.BitTouched);
        }
        foreach (var failing in new[] { CalData.CameSqlText, CalData.RsvSqlText })
        {
            using var rig = NewRig();
            rig.Db.Answer(CalData.CameSqlText, _ => new[] { CalData.Came("20261026", "900001") });
            rig.Db.Answer(CalData.RsvSqlText, _ => new[] { CalData.Rsv("900001", "가상환자01", "202610281030") });
            rig.Db.Fail(failing, "E-BIT-READ-FAILED");
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.SendArgs(CalData.Day("2026-10-26", "2026-10-31"))));
            Assert.DoesNotContain("가상", rig.RawReplies, StringComparison.Ordinal);
            Assert.DoesNotContain("900001", rig.RawReplies, StringComparison.Ordinal);
            Assert.Equal(1, rig.Db.Disposed);
        }
    }

    // ── AC-5903.4 SQL·명령 표 ─────────────────────────────────────────

    [Fact(DisplayName = "AC-5903.4 새 SQL 넷(CalendarSql)은 매개변수를 받는 읽기 전용 SELECT 하나(; · 주석 · 쓰기 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다(청구 Sql.All 밖)")]
    public void NewSqlIsGuardedSelect()
    {
        var type = typeof(Sql).Assembly.GetType("Precheck.Core.Calendar.CalendarSql");
        Assert.NotNull(type);
        var all = (IEnumerable<string>?)type!.GetProperty("All", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        Assert.Equal(CalData.Sqls.Select(s => s.Text).OrderBy(s => s, StringComparer.Ordinal), all!.OrderBy(s => s, StringComparer.Ordinal));

        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        foreach (var (field, sql) in CalData.Sqls)
        {
            Assert.Equal(sql, CalData.Real(field));
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);
            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(Sql.IsAllowed(sql.Replace("\n", "\r\n")));

            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(Sql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), used);
        }
        Assert.Equal("@q:VarChar(20) @until:Char(12) @hospital:VarChar(32)", Shape(CalData.FindNameSqlText));
        Assert.Equal("@q:VarChar(20) @until:Char(12) @hospital:VarChar(32)", Shape(CalData.FindChartSqlText));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(CalData.CameSqlText));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(CalData.RsvSqlText));

        var find = new Dictionary<string, object?> { ["@q"] = new string('가', 20), ["@until"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        ReadOnlyGuard.Require(CalData.FindNameSqlText, find);
        var longer = new Dictionary<string, object?>(find) { ["@q"] = new string('가', 21) };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(CalData.FindNameSqlText, longer)).Code);
        var day = new Dictionary<string, object?> { ["@from"] = "202610260000", ["@to"] = "202611010000", ["@hospital"] = Synthetic.Scope };
        ReadOnlyGuard.Require(CalData.CameSqlText, day);
        var extra = new Dictionary<string, object?>(day) { ["@q"] = "가상" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(CalData.RsvSqlText, extra)).Code);
    }

    [Fact(DisplayName = "AC-5903.4 명령 표: contact.targets kind 값에 calfind·calday, args에 선택 칸 q(글자 1~20)만 더했고 명령 이름 목록(13개)·protocol 1은 그대로다")]
    public void CommandTableAddsKindsAndQ()
    {
        using var table = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        var commands = table.RootElement.GetProperty("commands");
        Assert.Equal(new[]
        {
            "bit.check", "bit.input", "bit.register", "claim.dates", "claim.memos", "claim.month", "contact.targets", "hello", "revenue.days", "sam.latest",
            "stats.rows", "store.load", "store.save",
        }, commands.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());
        var args = commands.GetProperty("contact.targets").GetProperty("args");
        Assert.Equal(new[] { "kind", "from", "to", "q" }, Json.Keys(args));
        Assert.Equal(new[] { "followup", "injection", "lapsed", "reservation", "sunap", "calfind", "calday" },
            args.GetProperty("kind").GetProperty("values").EnumerateArray().Select(v => v.GetString()).ToArray());
        Assert.Equal("{\"type\":\"string\",\"min\":1,\"max\":20,\"optional\":true}", JsonSerializer.Serialize(args.GetProperty("q")));
        Assert.Equal(1100, commands.GetProperty("contact.targets").GetProperty("maxDays").GetInt32());
        Assert.Equal(1, table.RootElement.GetProperty("protocol").GetInt32());
    }

    // ── AC-5903.5 판 ───────────────────────────────────────────────

    [Fact(DisplayName = "AC-5903.5 AC-6912.6 도우미 판은 0.13.2이다(예약 탭 비트 읽기는 0.10.0부터. 웹 LATEST_HELPER 0.13.2·CAL_HELPER 0.10.0, MIN·SUNAP·LIST 그대로는 handshake.test.ts가 본다)")]
    public void HelperVersionIsZeroEleven() => Assert.Equal("0.13.2", HelperVersion.Value);
}
