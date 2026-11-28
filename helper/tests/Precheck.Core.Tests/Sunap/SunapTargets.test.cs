using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Sunap;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Contact.Read;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Sunap;

/// <summary>
/// contact.targets kind 'sunap'(spec sunap-ilji REQ-4902)의 가짜 비트 SQL 답. 모두 지어낸 것이다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리,
/// 내원번호 V+숫자, 처방코드 MM110·KK020…, 예약 메모 '주사 오전'처럼 짧은 말, 진료의 코드 D001…·원장님 이름 '가짜원장 가'. 줄 모양은 SunapSql 문장의 칸 차례 그대로다.
/// 가짜 오늘은 2026-10-30(Synthetic.Today)이고 장부 날도 기본은 그날이다.
/// </summary>
internal static class SunapData
{
    public const string Day = "2026-10-30";

    /// <summary>
    /// PatientsSql 한 줄: 차트번호·이름·그날 첫 접수 시각(yyyyMMddHHmm)·첫 내원일(yyyyMMdd)·그날 90일초진 접수 수·진료의 코드(sunap-doctors)·
    /// 그날 신환 표시('1') 접수 수(spec new-mark AC-6204.1, 안 주면 0).
    /// </summary>
    public static object?[] Patient(string? chart, string? name, string? firstAcp, string? firstDay, object? first90, string? doctor = null, object? newMark = null) =>
        new object?[] { chart, name, firstAcp, firstDay, first90, doctor, newMark ?? 0L };

    /// <summary>원장님 이름 SQL(StatsSql.DoctorNamesSql) 한 줄: 코드·이름·UidExpDte. SQL이 코드·UidExpDte 차례로 준다.</summary>
    public static object?[] DoctorName(string? code, string? name, string? expires) => new object?[] { code, name, expires };

    /// <summary>CodesSql 한 줄: 차트번호·처방코드.</summary>
    public static object?[] Code(string? chart, string? code) => new object?[] { chart, code };

    /// <summary>NextReservationSql 한 줄: 차트번호·예약 시각(yyyyMMddHHmm)·메모 앞 40자.</summary>
    public static object?[] Rsv(string? chart, string? at, string? memo) => new object?[] { chart, at, memo };

    /// <summary>MoneySql 한 줄(내원 하나): 내원번호·차트번호·총진료비·현금·카드·계좌·본인부담 총액.</summary>
    public static object?[] Money(string visit, string? chart, object? total, object? cash, object? card, object? check, object? own) =>
        new object?[] { visit, chart, total, cash, card, check, own };

    /// <summary>PaidSql 한 줄(환자 하나): 차트번호·이름·수납 시각·총진료비·미수입금 현금·카드·계좌.</summary>
    public static object?[] Paid(string? chart, string? name, string? at, object? total, object? cash, object? card, object? check) =>
        new object?[] { chart, name, at, total, cash, card, check };

    /// <summary>
    /// 건강생활유지비 SQL(spec sunap-health design.md 글 그대로, SunapSql.HealthSql): 그날 수납한 비트 OrcInf의 OrcCod='QCV' 줄 OrcNewAmt를 내원·차트별로 더한다.
    /// 시험은 이 글자로 답을 정하므로 문장이 한 글자라도 달라지면 RED다.
    /// </summary>
    public const string HealthSqlText =
        "SELECT o.OrcOcmNum,o.OrcChtNum,SUM(o.OrcNewAmt)\n"
        + "FROM dbo.OrcInf o\n"
        + "WHERE o.OrcCod='QCV' AND o.OrcAccDte>=@day AND o.OrcAccDte<@nextDay\n"
        + "GROUP BY o.OrcOcmNum,o.OrcChtNum";

    /// <summary>HealthSql 한 줄(내원 하나): 내원번호·차트번호·그 내원 QCV OrcNewAmt 합.</summary>
    public static object?[] Health(string? visit, string? chart, object? amount) => new object?[] { visit, chart, amount };

    public static DateTime Date(string ymd) => DateTime.ParseExact(ymd, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>확인 필요 검사 셋(매출 revenue.days와 같은 문장·같은 차례).</summary>
    public static readonly string[] Checks = { RevenueSql.UnsupportedFinance, RevenueSql.FinanceMultiplicity, RevenueSql.ReceivableMultiplicity };

    /// <summary>검사는 모두 0, 자료 문장·원장님 이름 문장은 빈 답.</summary>
    public static void Defaults(FakeDb db)
    {
        foreach (var check in Checks) db.Answer(check, _ => new[] { new object?[] { 0L } });
        foreach (var sql in SunapSql.All) db.Answer(sql, _ => new object?[0][]);
        db.Answer(StatsSql.DoctorNamesSql, _ => new object?[0][]);
    }
}

/// <summary>가짜 비트(Rig, 등록됨) + 수납일지 SQL 답. Build를 바로 부르고 답 JSON을 돌려준다(명령 연결은 ContactRig).</summary>
internal sealed class SunapRig : IDisposable
{
    public SunapRig(bool registered = true)
    {
        Rig = registered ? new Rig().Registered() : new Rig();
        SunapData.Defaults(Db);
    }

    public Rig Rig { get; }

    public FakeSession Db => Rig.Session;

    public bool BitTouched => Rig.Locator.Calls > 0 || Rig.Connector.Opened.Count > 0 || Rig.Screens.Calls.Count > 0 || Rig.Login.Calls.Count > 0;

    public SunapRig Answer(string sql, params object?[][] rows)
    {
        Db.Answer(sql, _ => rows);
        return this;
    }

    public SunapRig Check(int index, object? value)
    {
        Db.Answer(SunapData.Checks[index], _ => new[] { new object?[] { value } });
        return this;
    }

    public JsonElement Build(string from = SunapData.Day, string? to = null) =>
        Json.Parse(SunapTargets.Build(Rig.Services, SunapData.Date(from), SunapData.Date(to ?? from)));

    /// <summary>답 rows(또는 paid)의 줄마다 칸을 JSON 글자로.</summary>
    public static string[] Lines(JsonElement json, string name) => json.GetProperty(name).EnumerateArray().Select(Replies.Canon).ToArray();

    public void Dispose() => Rig.Dispose();
}

/// <summary>
/// REQ-4902 도우미 하루 장부 읽기(SunapTargets·SunapSql). 비트 DB는 가짜(FakeSession)라 SQL의 뜻은 문장 글자로 못 박는다.
/// 명령(contact.targets)에 붙여 chunk … end로 보내는 것은 ContactRig로 본다.
/// </summary>
public class SunapTargetsTests
{
    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // 통계 VisitRowsSql의 Visits 글(PeriodVisits·Patients·FirstVisits). 수납일지의 센 내원·첫 내원은 이 글 그대로다
    private static string StatsVisits => StatsSql.VisitRowsSql.Substring(0, StatsSql.VisitRowsSql.IndexOf(", Orders AS (", StringComparison.Ordinal));

    private static string Hospital(string alias) =>
        "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=" + alias + ".OcmDepCod AND d.DepHspNum=@hospital AND LEFT(" + alias + ".OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    private static string Rest(string sql, string head)
    {
        var squashed = Squash(sql);
        var start = Squash(head);
        Assert.StartsWith(start, squashed, StringComparison.Ordinal);
        return squashed.Substring(start.Length).Trim();
    }

    // ── AC-4902.1 하루 하나 · 모양 · 범위 ──────────────────────────────────────────

    [Fact(DisplayName = "AC-4902.1 sunap: 등록 병원 확인 → 확인 필요 검사 셋 → 환자·처방·다음 예약·금액·건강생활유지비(sunap-health)·미수 입금 SQL(그날 0시~다음 날 0시·병원 범위, 150초), 답은 {v:3, day, unsure, rows, paid, doctors}(sunap-doctors, v:3 = clinic-calendar 건강생활 칸)")]
    public void ReadsOneDayAfterHospitalCheck()
    {
        using var rig = new SunapRig();
        var json = rig.Build();

        Assert.Equal(new[] { "v", "day", "unsure", "rows", "paid", "doctors" }, Json.Keys(json));
        Assert.Equal(3, json.GetProperty("v").GetInt32());
        Assert.Equal("2026-10-30", json.GetProperty("day").GetString());
        Assert.False(json.GetProperty("unsure").GetBoolean());
        Assert.Empty(SunapRig.Lines(json, "rows"));
        Assert.Empty(SunapRig.Lines(json, "paid"));
        Assert.Empty(SunapRig.Lines(json, "doctors"));

        Assert.Equal(new[]
        {
            Sql.ScopesSql, Sql.InstitutionSql,
            RevenueSql.UnsupportedFinance, RevenueSql.FinanceMultiplicity, RevenueSql.ReceivableMultiplicity,
            SunapSql.PatientsSql, SunapSql.CodesSql, SunapSql.NextReservationSql, SunapSql.MoneySql, SunapData.HealthSqlText, SunapSql.PaidSql,
        }, rig.Db.Sqls);

        var visits = new Dictionary<string, object?> { ["@from"] = "202610300000", ["@to"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        var money = new Dictionary<string, object?> { ["@day"] = "20261030", ["@nextDay"] = "20261031", ["@hospital"] = Synthetic.Scope };
        var unsupported = new Dictionary<string, object?>(money) { ["@from"] = "202610300000", ["@to"] = "202610310000" };
        var expected = new[] { unsupported, money, money, visits, visits, visits, money, money, money };
        for (var i = 0; i < expected.Length; i++)
        {
            var call = rig.Db.Calls[i + 2];
            Assert.Equal(expected[i].OrderBy(p => p.Key, StringComparer.Ordinal), call.Args.OrderBy(p => p.Key, StringComparer.Ordinal));
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        }
        Assert.Equal(1, rig.Db.Disposed);

        // 통계 화면·비트 로그인 창은 쓰지 않는다
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Empty(rig.Rig.Screens.Calls);
        Assert.Empty(rig.Rig.Screens.MenuReads);
    }

    [Theory(DisplayName = "AC-4902.1 sunap: from ≠ to·오늘−62일보다 이름·오늘보다 늦음이면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("2026-10-29", "2026-10-30")]   // 이틀
    [InlineData("2026-10-30", "2026-10-29")]   // 거꾸로
    [InlineData("2026-08-28", "2026-08-28")]   // 오늘−63일
    [InlineData("2026-10-31", "2026-10-31")]   // 내일
    [InlineData("2027-10-30", "2027-10-30")]
    public void RejectsBadDay(string from, string to)
    {
        using var rig = new SunapRig();
        var error = Assert.Throws<ProtocolException>(() => SunapTargets.Build(rig.Rig.Services, SunapData.Date(from), SunapData.Date(to)));
        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
        Assert.Equal(62, SunapTargets.BackDays);
        Assert.Equal("sunap", SunapTargets.Kind);
    }

    [Theory(DisplayName = "AC-4902.1 sunap: 오늘·어제·오늘−62일은 된다")]
    [InlineData("2026-10-30", "202610300000", "202610310000")]
    [InlineData("2026-10-29", "202610290000", "202610300000")]
    [InlineData("2026-08-29", "202608290000", "202608300000")]
    public void AcceptsDaysInRange(string day, string from, string to)
    {
        using var rig = new SunapRig();
        var json = rig.Build(day);
        Assert.Equal(day, json.GetProperty("day").GetString());
        var call = rig.Db.Calls.First(c => c.Sql == SunapSql.PatientsSql);
        Assert.Equal(from, call.Args["@from"]);
        Assert.Equal(to, call.Args["@to"]);
    }

    [Fact(DisplayName = "AC-4902.1 명령 contact.targets {kind:'sunap', from:D, to:D}: design.md '도우미 답' 모양 하나를 chunk … end로 보낸다(통계 화면·비트 로그인 없음)")]
    public void CommandSendsOneReplyInChunks()
    {
        using var rig = new ContactRig();
        SunapData.Defaults(rig.Db);
        rig.Db.Answer(SunapSql.PatientsSql, _ => new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L) });
        rig.Db.Answer(SunapSql.CodesSql, _ => new[] { SunapData.Code("900001", "MM110"), SunapData.Code("900001", "KK020") });
        rig.Db.Answer(SunapSql.NextReservationSql, _ => new[] { SunapData.Rsv("900001", "202611021030", "주사 오전") });
        rig.Db.Answer(SunapSql.MoneySql, _ => new[] { SunapData.Money("V1", "900001", 20000m, 0m, 15000m, 0m, 15000m) });
        rig.Db.Answer(SunapSql.PaidSql, _ => new[] { SunapData.Paid("900002", "가상환자02", "20261030112000", 30000m, 10000m, 0m, 0m) });

        var json = Replies.Join(rig.Send("sunap", SunapData.Day, SunapData.Day));

        Assert.Equal(
            "{\"v\":3,\"day\":\"2026-10-30\",\"unsure\":false,\"rows\":[[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,15000,0,0,[\"KK020\",\"MM110\"],[\"202611021030\",\"주사 오전\"],null,0]],"
            + "\"paid\":[[\"900002\",\"가상환자02\",\"11:20\",10000,0]],\"doctors\":[]}",
            Replies.Canon(json));
        Assert.Empty(rig.Screens.Calls);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Fact(DisplayName = "AC-4902.1 sunap이 막히면 error 하나만(chunk·end 없음): 날이 틀리면 E-HELPER-BAD-MESSAGE(비트를 건드리지 않음), 등록 없음·읽기 실패는 그 번호, 기록·답에 환자 값 없음")]
    public void CommandFailsWithOneError()
    {
        foreach (var (from, to) in new[] { ("2026-10-29", "2026-10-30"), ("2026-08-28", "2026-08-28"), ("2026-10-31", "2026-10-31") })
        {
            using var rig = new ContactRig();
            SunapData.Defaults(rig.Db);
            Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.Send("sunap", from, to)));
            Assert.False(rig.BitTouched);
            Assert.Empty(rig.Db.Calls);
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-HELPER-BAD-MESSAGE") }, rig.Log);
        }

        using (var rig = new ContactRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Replies.OnlyError(rig.Send("sunap", SunapData.Day, SunapData.Day)));
            Assert.False(rig.BitTouched);
        }

        foreach (var failing in SunapSql.All.Concat(SunapData.Checks))
        {
            using var rig = new ContactRig();
            SunapData.Defaults(rig.Db);
            rig.Db.Answer(SunapSql.PatientsSql, _ => new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L) });
            rig.Db.Answer(SunapSql.PaidSql, _ => new[] { SunapData.Paid("900002", "가상환자02", "20261030112000", 0m, 10000m, 0m, 0m) });
            rig.Db.Fail(failing, "E-BIT-READ-FAILED");
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.Send("sunap", SunapData.Day, SunapData.Day)));
            foreach (var value in new[] { "가상환자", "900001", "900002" }) Assert.DoesNotContain(value, rig.RawReplies, StringComparison.Ordinal);
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-BIT-READ-FAILED") }, rig.Log);
            Assert.Equal(1, rig.Db.Disposed);
        }
    }

    [Fact(DisplayName = "AC-4902.1 새 SQL 다섯(+ sunap-health 건강생활유지비 하나)은 매개변수를 받는 SELECT 하나(; · 주석 · 쓰기 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다(청구 Sql.All 밖)")]
    public void NewSqlIsGuardedSelect()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.Equal(
            new[] { SunapSql.PatientsSql, SunapSql.CodesSql, SunapSql.NextReservationSql, SunapSql.MoneySql, SunapData.HealthSqlText, SunapSql.PaidSql }.OrderBy(s => s, StringComparer.Ordinal),
            SunapSql.All.OrderBy(s => s, StringComparer.Ordinal));

        foreach (var sql in SunapSql.All)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotMatch(forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.True(SunapSql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);

            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();
            // 건강생활유지비 SQL만 @hospital을 글에 쓰지 않고 같은 날 묶음을 받는다(sunap-health design.md). 병원은 MoneySql 내원 번호로 거른다
            var declared = Sql.ParametersOf(sql).Select(p => p.Name).Where(n => sql != SunapData.HealthSqlText || n != "@hospital");
            Assert.Equal(declared.OrderBy(n => n, StringComparer.Ordinal), used);

            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(SunapSql.IsAllowed(sql.Replace(used[0], "'X'")));
        }
        Assert.False(SunapSql.IsAllowed(null));
        Assert.False(SunapSql.IsAllowed(Sql.ScopesSql));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SunapSql.ParametersOf(Sql.ScopesSql)).Code);

        foreach (var sql in new[] { SunapSql.PatientsSql, SunapSql.CodesSql, SunapSql.NextReservationSql })
        {
            Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(sql));
        }
        foreach (var sql in new[] { SunapSql.MoneySql, SunapData.HealthSqlText, SunapSql.PaidSql })
        {
            Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(sql));
        }

        var visitArgs = new Dictionary<string, object?> { ["@from"] = "202610300000", ["@to"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        var dayArgs = new Dictionary<string, object?> { ["@day"] = "20261030", ["@nextDay"] = "20261031", ["@hospital"] = Synthetic.Scope };
        ReadOnlyGuard.Require(SunapSql.PatientsSql, visitArgs);
        ReadOnlyGuard.Require(SunapSql.MoneySql, dayArgs);
        var longer = new Dictionary<string, object?>(dayArgs) { ["@day"] = "202610300000" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(SunapSql.MoneySql, longer)).Code);
        var extra = new Dictionary<string, object?>(visitArgs) { ["@next"] = "202610310000" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(SunapSql.NextReservationSql, extra)).Code);
    }

    [Fact(DisplayName = "AC-4902.1 새 SQL은 이름(PbsPatNam)·차트번호만 환자 표에서 읽고 전화·주민번호·주소·청구 메모는 읽지 않는다. 메모 칸은 다음 예약 문장의 RsvRefCmt 하나뿐이다")]
    public void ReadsOnlyNeededColumns()
    {
        string[] Columns(string sql, string prefix) =>
            Regex.Matches(sql, @"\b" + prefix + @"[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();

        foreach (var sql in SunapSql.All)
        {
            Assert.Empty(Columns(sql, "Pbs").Except(new[] { "PbsChtNum", "PbsInf", "PbsPatNam" }));
            foreach (var dropped in new[] { "PbsCelPhn", "PbsPhnNum", "ResNum", "Adr", "BirDte", "OcmRefCmt", "OcmBilCmt", "RefMem", "Emr" })
            {
                Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
            }
        }
        Assert.Equal(new[] { SunapSql.NextReservationSql }, SunapSql.All.Where(sql => sql.IndexOf("RefCmt", StringComparison.Ordinal) >= 0).ToArray());
    }

    // ── AC-4902.2 환자마다 한 줄 ─────────────────────────────────────────────

    [Fact(DisplayName = "AC-4902.2 AC-6204.1 rows: 환자마다 [차트, 이름, 첫 접수 HH:mm, 구분, 현금, 카드, 계좌, 미수, 처방코드, 예약], 첫 접수 차례. 구분은 그날 신환 표시 접수가 있으면 new, 아니고 90일초진 접수가 있으면 d90, 아니면 re")]
    public void RowsPerPatient()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001 ", " 가상환자01 ", "202610300902", "20240105", 0L),
            SunapData.Patient("900002", "가상환자02", "202610300915", "20261030", 0, newMark: 1),
            SunapData.Patient("900003", "가상환자03", "202610300930", "20250101", 2L),
            SunapData.Patient("900004", null, "202610300945", "20261030", 1, newMark: 1L),  // 신환이 90일초진보다 앞선다
            SunapData.Patient("900005", "가상환자05", "202610300850", null, null));       // 첫 내원을 못 찾음 → 재진
        rig.Answer(SunapSql.CodesSql,
            SunapData.Code("900001", "MM110"), SunapData.Code("900001", "KK020"), SunapData.Code("900001 ", "MM110"),
            SunapData.Code("900001", " kk030 "), SunapData.Code("900001", ""), SunapData.Code("900001", null),
            SunapData.Code("900003", "AA100"), SunapData.Code("900099", "ZZ999"));
        rig.Answer(SunapSql.MoneySql,
            SunapData.Money("V1", "900001", 30000m, 7000.6m, 0m, 0m, 20000m),
            SunapData.Money("V2", "900001 ", 12000m, 0.6m, 8000m, 0m, 10000m),      // 같은 환자 두 내원: 더한 뒤 원 미만 버림
            SunapData.Money("V3", "900002", 50000L, 0L, 0L, 25000L, 25000L),
            SunapData.Money("V4", "900003", 40000m, null, null, null, 16300m),
            SunapData.Money("V5", "900004", 0m, 0m, 0m, 0m, 0m),
            SunapData.Money("V9", "900099", 5000m, 5000m, 0m, 0m, 5000m));          // 그날 센 내원이 없는 차트의 금액은 줄을 만들지 않는다
        var json = rig.Build();

        Assert.Equal(new[]
        {
            "[\"900005\",\"가상환자05\",\"08:50\",\"re\",0,0,0,0,[],null,null,0]",
            "[\"900001\",\"가상환자01\",\"09:02\",\"re\",7001,8000,0,14998,[\"KK020\",\"KK030\",\"MM110\"],null,null,0]",
            "[\"900002\",\"가상환자02\",\"09:15\",\"new\",0,0,25000,0,[],null,null,0]",
            "[\"900003\",\"가상환자03\",\"09:30\",\"d90\",0,0,0,16300,[\"AA100\"],null,null,0]",
            "[\"900004\",\"\",\"09:45\",\"new\",0,0,0,0,[],null,null,0]",
        }, SunapRig.Lines(json, "rows"));
        Assert.False(json.GetProperty("unsure").GetBoolean());
    }

    [Fact(DisplayName = "AC-4902.2 미수 = 그 환자 그날 내원들의 본인부담 총액 − (현금 + 카드 + 계좌), 0보다 작으면 0")]
    public void UnpaidIsOwnMinusPaid()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L),
            SunapData.Patient("900002", "가상환자02", "202610300903", "20240105", 0L));
        rig.Answer(SunapSql.MoneySql,
            SunapData.Money("V1", "900001", 30000m, 1000m, 2000m, 3000m, 10000m),
            SunapData.Money("V2", "900002", 30000m, 9000m, 0m, 0m, 5000m));         // 더 냈다 → 미수 0
        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"09:02\",\"re\",1000,2000,3000,4000,[],null,null,0]",
            "[\"900002\",\"가상환자02\",\"09:03\",\"re\",9000,0,0,0,[],null,null,0]",
        }, SunapRig.Lines(rig.Build(), "rows"));
    }

    [Fact(DisplayName = "AC-4902.2 환자 줄이 틀리면(차트번호 없음·같은 차트 두 줄·첫 접수가 그날 HHmm이 아님·숫자 아님·칸 모자람) 일부만 보내지 않고 E-BIT-READ-FAILED, 세션은 닫는다")]
    public void BadPatientRowsAreReadFailed()
    {
        var good = SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L);
        var cases = new[]
        {
            new[] { SunapData.Patient("  ", "가상환자01", "202610300902", "20240105", 0L) },
            new[] { SunapData.Patient(null, "가상환자01", "202610300902", "20240105", 0L) },
            new[] { good, SunapData.Patient("900001 ", "가상환자01", "202610300930", "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", "2026103009", "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", "202610302460", "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", "202610300960", "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", "202610290902", "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", null, "20240105", 0L) },
            new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", "가상") },
            new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", "가상", newMark: 1L) },    // 신환이어도 90일초진 칸을 본다
            new[] { good.Take(4).ToArray() },
        };
        foreach (var rows in cases)
        {
            using var rig = new SunapRig();
            rig.Answer(SunapSql.PatientsSql, rows);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
            Assert.Equal(1, rig.Db.Disposed);
        }

        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql, good).Answer(SunapSql.MoneySql, SunapData.Money("V1", "900001", 1000m, "가상", 0m, 0m, 0m));
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
        }
        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql, Enumerable.Repeat(good, ContactTargets.MaxRows + 1).ToArray());
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
        }
    }

    [Fact(DisplayName = "AC-4902.2 AC-5002.1 AC-6204.1 환자 SQL: 통계 Visits 글(외래·WN/HN/TN/PN·OcmRsuYon<>'O'·이 병원, 첫 내원 FirstVisits) 그대로 + 환자마다 이름·첫 접수·첫 내원일·OcmDgsNfs='3' 접수 수·빈 값 뺀 가장 작은 진료의 코드·OcmDgsNfs='1'(신환 표시) 접수 수")]
    public void PatientsSqlUsesStatsVisits()
    {
        var visits = Squash(StatsVisits);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O' AND " + Hospital("c"), visits, StringComparison.Ordinal);
        Assert.Contains("FirstVisits AS ( SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON c.OcmChtNum=p.PatientId", visits, StringComparison.Ordinal);

        Assert.Equal(
            "SELECT v.PatientId,MAX(b.PbsPatNam) PatName,MIN(c.OcmAcpDtm) FirstAcp,LEFT(MIN(f.FirstDtm),8) FirstDay, "
            + "SUM(CASE WHEN c.OcmDgsNfs='3' THEN 1 ELSE 0 END) First90,MIN(NULLIF(RTRIM(c.OcmDtrCod),'')) DoctorId,"
            + "SUM(CASE WHEN c.OcmDgsNfs='1' THEN 1 ELSE 0 END) NewMark "
            + "FROM PeriodVisits v JOIN dbo.OcmInf c ON c.OcmNum=v.VisitId LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId "
            + "LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=v.PatientId WHERE v.PatientId IS NOT NULL GROUP BY v.PatientId",
            Rest(SunapSql.PatientsSql, StatsVisits));
    }

    // ── AC-6204.1 수납일지 신환은 비트 신환 표시로 (spec new-mark) ─────────────────────────

    [Fact(DisplayName = "AC-6204.1 구분은 그날 신환 표시('1') 센 접수가 있으면 new, 아니면 90일초진 접수가 있으면 d90, 아니면 re다(첫 내원일이 그날이어도 신환 표시가 없으면 new가 아니다)")]
    public void KindFollowsNewMark()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300901", "20240105", 0L, newMark: 1L),   // 예전 접수가 있어도 신환 표시 → new
            SunapData.Patient("900002", "가상환자02", "202610300902", "20261030", 0L),                // 첫 내원일이 그날이지만 표시 없음 → re
            SunapData.Patient("900003", "가상환자03", "202610300903", "20261030", 1),                 // 첫 내원일이 그날, 90일초진 → d90
            SunapData.Patient("900004", "가상환자04", "202610300904", "20250101", 2L, newMark: 1),    // 신환 표시가 90일초진보다 앞선다 → new
            SunapData.Patient("900005", "가상환자05", "202610300905", null, 0L, newMark: 2L),          // 첫 내원을 못 찾아도 표시 두 건 → new
            SunapData.Patient("900006", "가상환자06", "202610300906", "20250101", 0L, "D001", 0L));   // 아무 표시 없음 → re
        var kinds = rig.Build().GetProperty("rows").EnumerateArray().Select(row => row[0].GetString() + ":" + row[3].GetString()).ToArray();

        Assert.Equal(new[]
        {
            "900001:new", "900002:re", "900003:d90", "900004:new", "900005:new", "900006:re",
        }, kinds);
    }

    [Fact(DisplayName = "AC-6204.1 환자 줄에 신환 표시 칸(일곱째)이 없거나(옛 여섯 칸) 숫자가 아니면 일부만 보내지 않고 E-BIT-READ-FAILED, DB NULL은 0이다")]
    public void NewMarkCellMustBeANumber()
    {
        var good = SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D001");
        foreach (var row in new[] { good.Take(6).ToArray(), SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D001", "가상") })
        {
            using var rig = new SunapRig();
            rig.Answer(SunapSql.PatientsSql, row);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
            Assert.Equal(1, rig.Db.Disposed);
        }

        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql, good.Take(6).Append(null).ToArray());
            Assert.Equal(new[] { "900001:re" }, rig.Build().GetProperty("rows").EnumerateArray().Select(row => row[0].GetString() + ":" + row[3].GetString()).ToArray());
        }
    }

    [Fact(DisplayName = "AC-4902.2 처방 SQL: 통계 VisitRowsSql의 Orders 줄(그날 센 내원의 처방, 삭제·취소·원외 99 뺌) 그대로이고 끝 SELECT만 [차트번호, 처방코드]다")]
    public void CodesSqlIsVisitRowsOrders()
    {
        var rows = StatsSql.VisitRowsSql;
        var orders = rows.Substring(0, rows.IndexOf("SELECT o.PatientId,o.VisitDay,o.Code", StringComparison.Ordinal));
        Assert.Contains("o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'", Squash(orders), StringComparison.Ordinal);
        Assert.Equal("SELECT o.PatientId,o.Code FROM Orders o", Rest(SunapSql.CodesSql, orders));
    }

    [Fact(DisplayName = "AC-4902.2 금액 SQL: 매출 FinanceNormal 글에서 끝 SELECT만 내원(OrpOcmNum)별 [내원, 차트, 총진료비, 현금 CashAmt, 카드 CardAmt, 계좌 CheckAmt, 본인부담 총액 OrpTotOwn]으로 바꿨다")]
    public void MoneySqlIsFinanceNormalByVisit()
    {
        const string total = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows";
        var normal = RevenueSql.FinanceNormal;
        Assert.EndsWith(total, normal, StringComparison.Ordinal);
        var expected = normal.Substring(0, normal.Length - total.Length)
            + "SELECT OrpOcmNum,OrpChtNum,SUM(OrpTotAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt),MAX(OrpTotOwn) FROM NativeRows GROUP BY OrpOcmNum,OrpChtNum";
        Assert.Equal(expected, SunapSql.MoneySql);
    }

    [Fact(DisplayName = "AC-4902.2 AC-4902.4 원본 글(통계 VisitRowsSql·매출 FinanceNormal·FinanceReceivable)이 바뀌어 바꿀 자리가 정확히 한 군데가 아니면 바로 멈춘다")]
    public void DerivationFailsLoudly()
    {
        var replace = typeof(SunapSql).GetMethod("ReplaceOnce", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(replace);
        foreach (var (text, part) in new[] { ("SELECT a FROM b", "SELECT c"), ("SELECT c, SELECT c", "SELECT c") })
        {
            var error = Assert.Throws<TargetInvocationException>(() => replace!.Invoke(null, new object[] { text, part, "x" }));
            Assert.IsType<InvalidOperationException>(error.InnerException);
        }
        Assert.Equal("SELECT x FROM b", replace!.Invoke(null, new object[] { "SELECT a FROM b", "a", "x" }));
    }

    // ── AC-4902.3 다음 예약 ─────────────────────────────────────────────

    [Fact(DisplayName = "AC-4902.3 rsv: 가장 이른 다음 예약 [yyyyMMddHHmm, 메모 앞 40자(없으면 \"\")], 없거나 시각이 틀리면 null. 메모의 줄바꿈·제어 문자는 빈칸, 앞뒤 빈칸 뺌")]
    public void NextReservation()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql, Enumerable.Range(1, 7).Select(n =>
            SunapData.Patient("90000" + n, "가상환자0" + n, "2026103009" + (10 + n), "20240105", 0L)).ToArray());
        var memo45 = new string('가', 45);
        rig.Answer(SunapSql.NextReservationSql,
            SunapData.Rsv("900001", "202611021030", "주사 오전"),
            SunapData.Rsv("900002", " 202611051400 ", null),
            SunapData.Rsv("900003", "2026110514", "경과"),
            SunapData.Rsv("900004", "202611311000", "경과"),
            SunapData.Rsv("900005", "202611061100", "  진료\r\n경과 보기  "),
            SunapData.Rsv("900006", "202611071200", memo45));

        var rsv = rig.Build().GetProperty("rows").EnumerateArray().Select(row => Replies.Canon(row[9])).ToArray();
        Assert.Equal(new[]
        {
            "[\"202611021030\",\"주사 오전\"]",
            "[\"202611051400\",\"\"]",
            "null",
            "null",
            "[\"202611061100\",\"진료  경과 보기\"]",
            "[\"202611071200\",\"" + new string('가', 40) + "\"]",
            "null",
        }, rsv);
        Assert.Equal(40, SunapTargets.MemoLength);
    }

    [Fact(DisplayName = "AC-4902.3 다음 예약 SQL: 그날 센 내원 환자마다 같은 차트번호, 다음 날 0시(@to) 이후 이 병원 외래 접수 중 RsvInf 예약 줄('R'·빈 값) 또는 WR·NR·CR, CN 빼고 가장 이른 것 하나, 메모는 RTRIM(RsvRefCmt) 앞 40자")]
    public void NextReservationSqlConditions()
    {
        Assert.Equal(
            "SELECT p.PatientId,n.OcmAcpDtm,n.Memo FROM Patients p "
            + "CROSS APPLY (SELECT TOP 1 w.OcmAcpDtm,LEFT(RTRIM(CONVERT(nvarchar(4000),r.RsvRefCmt)),40) Memo FROM dbo.OcmInf w "
            + "OUTER APPLY (SELECT TOP 1 1 Found,x.RsvRefCmt FROM dbo.RsvInf x WHERE x.RsvOcmNum=w.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r "
            + "WHERE w.OcmChtNum=p.PatientId AND w.OcmAcpDtm>=@to AND w.OcmPatTyp='O' AND ISNULL(w.OcmComStt,'')<>'CN' AND " + Hospital("w") + " "
            + "AND (r.Found=1 OR w.OcmComStt IN ('WR','NR','CR')) ORDER BY w.OcmAcpDtm,w.OcmNum) n",
            Rest(SunapSql.NextReservationSql, StatsVisits));

        // 환자 탭 예약 명단 문장은 그대로 메모를 읽지 않는다(patients-bit-lists AC-2801.4)
        Assert.DoesNotContain("RefCmt", ListSql.ReservationsSql, StringComparison.Ordinal);
    }

    // ── AC-4902.4 미수 입금 · 확인 필요 ─────────────────────────────────

    [Fact(DisplayName = "AC-4902.4 paid: 그날 예전 미수를 낸 환자마다 [차트, 이름, 시각 HH:mm, 현금, 카드+계좌], 시각 차례. 0원 줄은 싣지 않고, 수납 시각에 시각이 없으면 \"\"")]
    public void PaidRows()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PaidSql,
            SunapData.Paid("900010", "가상환자10", "20261030112000", 30000m, 10000m, 0m, 0m),
            SunapData.Paid("900011 ", " 가상환자11 ", "202610300905", 20000m, 0m, 12000.7m, 3000m),
            SunapData.Paid("900012", "가상환자12", "202610301000", 0m, 0m, 0m, 0m),
            SunapData.Paid("900013", null, "20261030", 5000L, 5000L, null, null));
        var json = rig.Build();

        Assert.Equal(new[]
        {
            "[\"900013\",\"\",\"\",5000,0]",
            "[\"900011\",\"가상환자11\",\"09:05\",0,15000]",
            "[\"900010\",\"가상환자10\",\"11:20\",10000,0]",
        }, SunapRig.Lines(json, "paid"));
        Assert.Empty(SunapRig.Lines(json, "rows"));      // 미수 입금은 내원 줄이 아니다
        Assert.False(json.GetProperty("unsure").GetBoolean());
    }

    [Fact(DisplayName = "AC-4902.4 미수 입금 SQL: 매출 FinanceReceivable 글에서 NativeRows 줄 머리에 이름·수납 시각을 더하고 끝 SELECT만 환자(OrpChtNum)별 [차트, 이름, 수납 시각, 총진료비, CorAmt, CorCrdAmt, CorChkAmt]로 바꿨다")]
    public void PaidSqlIsFinanceReceivableByPatient()
    {
        const string head = "SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt";
        const string total = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows";
        var receivable = RevenueSql.FinanceReceivable;
        Assert.Single(Regex.Matches(receivable, Regex.Escape(head)).Cast<Match>());
        Assert.EndsWith(total, receivable, StringComparison.Ordinal);
        var expected = receivable.Replace(head, "SELECT p.OrpOcmNum,p.OrpChtNum,pb.PbsPatNam PatName,p.OrpAccDte PaidAt,p.OrpTotAmt");
        expected = expected.Substring(0, expected.Length - total.Length)
            + "SELECT OrpChtNum,MAX(PatName),MIN(PaidAt),SUM(OrpTotAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows GROUP BY OrpChtNum";
        Assert.Equal(expected, SunapSql.PaidSql);
    }

    [Theory(DisplayName = "AC-4902.4 unsure: 매출 확인 필요 검사(환불·변경수납·예치금, 정상수납 중복, 미수입금 중복) 중 하나라도 0이 아니면 참이고 남은 검사는 돌리지 않는다. 장부 줄은 그대로 보낸다")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void UnsureWhenRevenueCheckFires(int index)
    {
        using var rig = new SunapRig();
        rig.Check(index, 1L);
        rig.Answer(SunapSql.PatientsSql, SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L));
        var json = rig.Build();

        Assert.True(json.GetProperty("unsure").GetBoolean());
        Assert.Single(SunapRig.Lines(json, "rows"));
        Assert.Equal(SunapData.Checks.Take(index + 1), rig.Db.Sqls.Skip(2).Take(index + 1));
        Assert.Equal(new[] { SunapSql.PatientsSql, SunapSql.CodesSql, SunapSql.NextReservationSql, SunapSql.MoneySql, SunapData.HealthSqlText, SunapSql.PaidSql }, rig.Db.Sqls.Skip(3 + index));
    }

    [Fact(DisplayName = "AC-4902.4 unsure: 매출처럼 그날 총진료비·현금·카드·계좌·미수입금 합이 음수여도 참. 음수 칸은 0으로 보낸다. 모두 0 이상이면 거짓")]
    public void UnsureWhenDaySumsAreNegative()
    {
        var patient = SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L);
        var cases = new (object?[][] Money, object?[][] Paid, bool Unsure)[]
        {
            (new[] { SunapData.Money("V1", "900001", 10000m, 5000m, 0m, 0m, 5000m), SunapData.Money("V2", "900001", 0m, -0.6m, 0m, 0m, 0m) }, new object?[0][], false),
            (new[] { SunapData.Money("V1", "900001", 10000m, -1000m, 0m, 0m, 0m) }, new object?[0][], true),
            (new[] { SunapData.Money("V1", "900001", 10000m, 0m, -1m, 0m, 0m) }, new object?[0][], true),
            (new[] { SunapData.Money("V1", "900001", 10000m, 0m, 0m, -1m, 0m) }, new object?[0][], true),
            (new[] { SunapData.Money("V1", "900001", -20000m, 0m, 0m, 0m, 0m) }, new[] { SunapData.Paid("900002", "가상환자02", "202610301100", 10000m, 1000m, 0m, 0m) }, true),
            (new object?[0][], new[] { SunapData.Paid("900002", "가상환자02", "202610301100", 0m, -1000m, 0m, 0m) }, true),
        };
        foreach (var (money, paid, unsure) in cases)
        {
            using var rig = new SunapRig();
            rig.Answer(SunapSql.PatientsSql, patient).Answer(SunapSql.MoneySql, money).Answer(SunapSql.PaidSql, paid);
            var json = rig.Build();
            Assert.Equal(unsure, json.GetProperty("unsure").GetBoolean());
            foreach (var row in json.GetProperty("rows").EnumerateArray())
            {
                for (var cell = 4; cell <= 7; cell++) Assert.True(row[cell].GetInt64() >= 0);
            }
            foreach (var row in json.GetProperty("paid").EnumerateArray())
            {
                Assert.True(row[3].GetInt64() >= 0 && row[4].GetInt64() >= 0);
            }
        }
    }

    // ── AC-5002 장부 줄에 원장님 (spec sunap-doctors) ─────────────────────────

    [Fact(DisplayName = "AC-5002.1 sunap v:2(0.10.0부터 v:3): rows 줄마다 끝에 진료의 코드 한 칸(그날 센 내원들의 OcmDtrCod 중 빈 값 뺀 가장 작은 것, 앞뒤 빈칸 뺌, 40자까지), 없으면 null")]
    public void RowsEndWithDoctorCode()
    {
        using var rig = new SunapRig();
        var code40 = "D" + new string('9', 39);
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D002"),
            SunapData.Patient("900002", "가상환자02", "202610300915", "20261030", 0L, " D001 "),
            SunapData.Patient("900003", "가상환자03", "202610300930", "20240105", 1L, "   "),
            SunapData.Patient("900004", "가상환자04", "202610300945", "20240105", 0L, null),
            SunapData.Patient("900005", "가상환자05", "202610300950", "20240105", 0L, code40));
        var json = rig.Build();

        Assert.Equal(3, json.GetProperty("v").GetInt32());
        Assert.Equal(3, SunapTargets.Version);
        var rows = json.GetProperty("rows").EnumerateArray().ToArray();
        Assert.All(rows, row => Assert.Equal(12, row.GetArrayLength()));
        Assert.Equal(new[] { "\"D002\"", "\"D001\"", "null", "null", "\"" + code40 + "\"" }, rows.Select(row => Replies.Canon(row[10])).ToArray());
    }

    [Fact(DisplayName = "AC-5002.1 진료의 코드가 40자를 넘거나 환자 줄에 코드 칸이 없으면(옛 다섯 칸) 일부만 보내지 않고 E-BIT-READ-FAILED, 세션은 닫고 이름 SQL은 부르지 않는다")]
    public void BadDoctorCodeIsReadFailed()
    {
        var cases = new[]
        {
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D" + new string('9', 40)),
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L).Take(5).ToArray(),
        };
        foreach (var row in cases)
        {
            using var rig = new SunapRig();
            rig.Answer(SunapSql.PatientsSql, row);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
            Assert.Equal(1, rig.Db.Disposed);
            Assert.DoesNotContain(StatsSql.DoctorNamesSql, rig.Db.Sqls);
        }
    }

    [Fact(DisplayName = "AC-5002.2 doctors: rows에 나온 코드마다 한 번 [코드, 이름|null], 코드 차례. 이름은 통계 원장님 이름 규칙(UidMst 가장 늦은 줄, 앞뒤 빈칸 뺌, 40자까지, 없으면 null)이고 이름 SQL은 미수 입금 다음에 한 번(코드 50자리, 150초)")]
    public void DoctorsNamedOncePerCode()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D003"),
            SunapData.Patient("900002", "가상환자02", "202610300915", "20261030", 0L, "D001"),
            SunapData.Patient("900003", "가상환자03", "202610300930", "20240105", 0L, "D001"),
            SunapData.Patient("900004", "가상환자04", "202610300945", "20240105", 0L, "D002"),
            SunapData.Patient("900005", "가상환자05", "202610300950", "20240105", 0L, "D004"),
            SunapData.Patient("900006", "가상환자06", "202610300955", "20240105", 0L, null));
        rig.Answer(StatsSql.DoctorNamesSql,
            SunapData.DoctorName("D001", "가짜원장 옛이름", "20201231"),
            SunapData.DoctorName("D001", "  가짜원장 가  ", "99991231"),
            SunapData.DoctorName("D002", new string('나', 41), "99991231"),
            SunapData.DoctorName("D004", "가짜원장 라", "20201231"),
            SunapData.DoctorName("D004", "   ", "99991231"),                 // 가장 늦은 줄의 이름이 비었다
            SunapData.DoctorName("D999", "가짜원장 안 부른 코드", "99991231"));
        var json = rig.Build();

        Assert.Equal(new[]
        {
            "[\"D001\",\"가짜원장 가\"]",
            "[\"D002\",\"" + new string('나', 40) + "\"]",
            "[\"D003\",null]",                                                 // UidMst에 없음
            "[\"D004\",null]",
        }, SunapRig.Lines(json, "doctors"));

        Assert.Equal(new[]
        {
            SunapSql.PatientsSql, SunapSql.CodesSql, SunapSql.NextReservationSql, SunapSql.MoneySql, SunapData.HealthSqlText, SunapSql.PaidSql, StatsSql.DoctorNamesSql,
        }, rig.Db.Sqls.Skip(5));
        var call = rig.Db.Calls.Last();
        Assert.Equal(50, call.Args.Count);
        Assert.Equal(new[] { "D001", "D002", "D003", "D004" }, Enumerable.Range(0, 4).Select(i => (string?)call.Args["@d" + i]).ToArray());
        for (var i = 4; i < 50; i++) Assert.Equal("D001", call.Args["@d" + i]);
        Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
    }

    [Fact(DisplayName = "AC-5002.2 rows에 코드가 하나도 없으면 doctors는 []이고 이름 SQL을 부르지 않는다. 이름 SQL이 막히면 일부만 보내지 않고 error 하나(E-BIT-READ-FAILED, 답·기록에 환자 값 없음)")]
    public void DoctorsEmptyWithoutCodesAndNameFailureIsReadFailed()
    {
        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql, SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L));
            var json = rig.Build();
            Assert.Empty(SunapRig.Lines(json, "doctors"));
            Assert.DoesNotContain(StatsSql.DoctorNamesSql, rig.Db.Sqls);
        }

        using var command = new ContactRig();
        SunapData.Defaults(command.Db);
        command.Db.Answer(SunapSql.PatientsSql, _ => new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D001") });
        command.Db.Fail(StatsSql.DoctorNamesSql, "E-BIT-READ-FAILED");
        Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(command.Send("sunap", SunapData.Day, SunapData.Day)));
        foreach (var value in new[] { "가상환자", "900001", "D001" }) Assert.DoesNotContain(value, command.RawReplies, StringComparison.Ordinal);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-BIT-READ-FAILED") }, command.Log);
        Assert.Equal(1, command.Db.Disposed);
    }

    [Fact(DisplayName = "AC-5002.2 명령 contact.targets sunap 답 v:3: rows 끝 칸 코드와 맨 위 doctors [[코드, 이름|null]]가 한 JSON으로 chunk … end에 실린다")]
    public void CommandSendsDoctors()
    {
        using var rig = new ContactRig();
        SunapData.Defaults(rig.Db);
        rig.Db.Answer(SunapSql.PatientsSql, _ => new[]
        {
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D002"),
            SunapData.Patient("900002", "가상환자02", "202610300910", "20261030", 0L, "D001", 1L),
        });
        rig.Db.Answer(StatsSql.DoctorNamesSql, _ => new[] { SunapData.DoctorName("D001", "가짜원장 가", "99991231") });

        var json = Replies.Join(rig.Send("sunap", SunapData.Day, SunapData.Day));

        Assert.Equal(
            "{\"v\":3,\"day\":\"2026-10-30\",\"unsure\":false,\"rows\":["
            + "[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,0,0,0,[],null,\"D002\",0],"
            + "[\"900002\",\"가상환자02\",\"09:10\",\"new\",0,0,0,0,[],null,\"D001\",0]],"
            + "\"paid\":[],\"doctors\":[[\"D001\",\"가짜원장 가\"],[\"D002\",null]]}",
            Replies.Canon(json));
    }

    [Fact(DisplayName = "AC-5002.3 AC-6912.6 도우미 판은 0.14.1이다(웹 LATEST_HELPER 0.14.1·CAL_HELPER 0.10.0·MIN_HELPER·SUNAP_HELPER 그대로는 handshake.test.ts가 본다)")]
    public void HelperVersionIsZeroNine() => Assert.Equal("0.14.1", HelperVersion.Value);

    // ── AC-4902.6 판 ───────────────────────────────────────────────

    [Fact(DisplayName = "AC-4902.6 AC-6912.6 도우미 판은 0.14.1이고 명령 이름 목록은 그대로다(명령 21개·protocol 1, contact.targets 칸은 kind·from·to + 선택 q(clinic-calendar))")]
    public void SunapVersionAndCommandNamesStay()
    {
        Assert.Equal("0.14.1", HelperVersion.Value);
        CommandNamesStay();
    }

    // ── AC-5401 장부 미수에서 건강생활유지비(QCV)를 뺀다 (spec sunap-health) ─────────────

    [Fact(DisplayName = "AC-5401.1 sunap 미수 = 본인부담 총액 − (현금 + 카드 + 계좌 + 그 내원들의 QCV OrcNewAmt 합), 0보다 작으면 0. 현금·카드·계좌 칸은 그대로다")]
    public void UnpaidSubtractsHealthAllowance()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L),
            SunapData.Patient("900002", "가상환자02", "202610300903", "20240105", 0L),
            SunapData.Patient("900003", "가상환자03", "202610300904", "20240105", 0L),
            SunapData.Patient("900004", "가상환자04", "202610300905", "20240105", 0L));
        rig.Answer(SunapSql.MoneySql,
            SunapData.Money("V1", "900001", 15000m, 0m, 0m, 0m, 1500m),             // 1,500원을 모두 건강생활잔액으로 → 미수 0
            SunapData.Money("V2", "900002", 40000m, 3000m, 2000m, 1000m, 10000m),
            SunapData.Money("V3", "900002", 10000m, 0m, 0m, 0m, 1000m),             // 두 내원의 QCV를 더한다
            SunapData.Money("V4", "900003", 10000m, 600m, 0m, 0m, 1000m),           // 현금 + QCV가 더 많다 → 0
            SunapData.Money("V5", "900004", 20000m, 0m, 0m, 0m, 5000m));            // QCV 없음 → 지금과 같다
        rig.Answer(SunapData.HealthSqlText,
            SunapData.Health("V1", "900001", 1500m),
            SunapData.Health("V2", "900002", 1000m),
            SunapData.Health("V3", "900002", 500L),
            SunapData.Health("V4", "900003", 1000m));
        var json = rig.Build();

        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,0,0,0,[],null,null,1500]",
            "[\"900002\",\"가상환자02\",\"09:03\",\"re\",3000,2000,1000,3500,[],null,null,1500]",
            "[\"900003\",\"가상환자03\",\"09:04\",\"re\",600,0,0,0,[],null,null,1000]",
            "[\"900004\",\"가상환자04\",\"09:05\",\"re\",0,0,0,5000,[],null,null,0]",
        }, SunapRig.Lines(json, "rows"));
        Assert.False(json.GetProperty("unsure").GetBoolean());
    }

    [Fact(DisplayName = "AC-5401.1 내원 하나의 QCV 합이 음수(취소)거나 NULL이면 0으로 보고 빼지 않는다(미수가 늘지 않음). 같은 환자의 다른 내원 QCV는 센다. unsure는 그대로")]
    public void NegativeHealthCountsAsZero()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L),
            SunapData.Patient("900002", "가상환자02", "202610300903", "20240105", 0L));
        rig.Answer(SunapSql.MoneySql,
            SunapData.Money("V1", "900001", 20000m, 1000m, 0m, 0m, 5000m),
            SunapData.Money("V2", "900002", 10000m, 0m, 0m, 0m, 3000m),
            SunapData.Money("V3", "900002", 10000m, 0m, 0m, 0m, 2000m),
            SunapData.Money("V4", "900002", 10000m, 0m, 0m, 0m, 1000m));
        rig.Answer(SunapData.HealthSqlText,
            SunapData.Health("V1", "900001", -1500m),
            SunapData.Health("V2", "900002", -1000m),
            SunapData.Health("V3", "900002", 1500m),
            SunapData.Health("V4", "900002", null));
        var json = rig.Build();

        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"09:02\",\"re\",1000,0,0,4000,[],null,null,0]",
            "[\"900002\",\"가상환자02\",\"09:03\",\"re\",0,0,0,4500,[],null,null,1500]",
        }, SunapRig.Lines(json, "rows"));
        Assert.False(json.GetProperty("unsure").GetBoolean());
    }

    [Fact(DisplayName = "AC-5401.1 AC-5908.1 명령 contact.targets {kind:'sunap'}: 건강생활잔액으로 낸 1,500원은 미수 0으로 실리고 답 모양은 v:3·rows 열두 칸(끝 칸 건강생활 1,500, AC-5908.1)·paid·doctors다")]
    public void CommandSendsHealthAsNotUnpaid()
    {
        using var rig = new ContactRig();
        SunapData.Defaults(rig.Db);
        rig.Db.Answer(SunapSql.PatientsSql, _ => new[] { SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L) });
        rig.Db.Answer(SunapSql.MoneySql, _ => new[] { SunapData.Money("V1", "900001", 15000m, 0m, 0m, 0m, 1500m) });
        rig.Db.Answer(SunapData.HealthSqlText, _ => new[] { SunapData.Health("V1", "900001", 1500m) });

        var json = Replies.Join(rig.Send("sunap", SunapData.Day, SunapData.Day));

        Assert.Equal(
            "{\"v\":3,\"day\":\"2026-10-30\",\"unsure\":false,\"rows\":[[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,0,0,0,[],null,null,1500]],\"paid\":[],\"doctors\":[]}",
            Replies.Canon(json));
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Fact(DisplayName = "AC-5401.2 QCV는 그날 금액 SQL(MoneySql)에 나온 그 차트의 내원 번호 것만 뺀다(다른 날·다른 병원·센 내원이 아닌 내원·다른 차트의 같은 번호는 빼지 않음, 줄 없는 차트는 줄을 만들지 않음). 원 미만은 버리고, 숫자가 아니면 E-BIT-READ-FAILED")]
    public void HealthCountsOnlyMoneyVisitsOfSameChart()
    {
        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql,
                SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L),
                SunapData.Patient("900002", "가상환자02", "202610300910", "20240105", 0L));
            rig.Answer(SunapSql.MoneySql,
                SunapData.Money("V1", "900001", 30000m, 0m, 0m, 0m, 3000m),
                SunapData.Money("V2", "900002", 20000m, 0m, 0m, 0m, 2000.5m),
                SunapData.Money("V9", "900099", 5000m, 0m, 0m, 0m, 1500m));          // 그날 센 내원이 없는 차트
            rig.Answer(SunapData.HealthSqlText,
                SunapData.Health("V1", "900001", 1000m),
                SunapData.Health("V7", "900001", 1500m),          // 금액 SQL에 없는 내원(다른 날·다른 병원·센 내원 아님)
                SunapData.Health("V1", "900002", 700m),           // 같은 내원 번호, 다른 차트
                SunapData.Health(" V2 ", "900002 ", 999.7m),      // 앞뒤 빈칸 뺌. 2000.5 − 999.7 = 1000.8 → 원 미만 버림
                SunapData.Health("V9", "900099", 1500m));
            var json = rig.Build();

            Assert.Equal(new[]
            {
                "[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,0,0,2000,[],null,null,1000]",
                "[\"900002\",\"가상환자02\",\"09:10\",\"re\",0,0,0,1000,[],null,null,999]",
            }, SunapRig.Lines(json, "rows"));

            var call = rig.Db.Calls.Single(c => c.Sql == SunapData.HealthSqlText);
            var dayArgs = new Dictionary<string, object?> { ["@day"] = "20261030", ["@nextDay"] = "20261031", ["@hospital"] = Synthetic.Scope };
            Assert.Equal(dayArgs.OrderBy(p => p.Key, StringComparer.Ordinal), call.Args.OrderBy(p => p.Key, StringComparer.Ordinal));
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        }

        using (var rig = new SunapRig())
        {
            rig.Answer(SunapSql.PatientsSql, SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L))
                .Answer(SunapSql.MoneySql, SunapData.Money("V1", "900001", 30000m, 0m, 0m, 0m, 3000m))
                .Answer(SunapData.HealthSqlText, SunapData.Health("V1", "900001", "가상"));
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => rig.Build()).Code);
            Assert.Equal(1, rig.Db.Disposed);
        }
    }

    [Fact(DisplayName = "AC-5401.2 건강생활유지비 SQL(SunapSql.HealthSql)은 design.md 글 그대로인 읽기 전용 SELECT 하나(OrcInf의 OrcCod='QCV'·OrcAccDte @day~@nextDay, 내원·차트별 OrcNewAmt 합)이고 허용 목록에 날 묶음 매개변수와 함께 든다")]
    public void HealthSqlIsGuardedSelect()
    {
        var field = typeof(SunapSql).GetField("HealthSql", BindingFlags.Public | BindingFlags.Static);
        Assert.Equal(SunapData.HealthSqlText, field?.GetValue(null));
        Assert.Contains(SunapData.HealthSqlText, SunapSql.All);
        Assert.True(SunapSql.IsAllowed(SunapData.HealthSqlText));
        Assert.True(Sql.IsAllowed(SunapData.HealthSqlText));
        Assert.DoesNotContain(SunapData.HealthSqlText, Sql.All);
        Assert.False(SunapSql.IsAllowed(SunapData.HealthSqlText.Replace("'QCV'", "'RCV'")));
        Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(SunapData.HealthSqlText));

        var dayArgs = new Dictionary<string, object?> { ["@day"] = "20261030", ["@nextDay"] = "20261031", ["@hospital"] = Synthetic.Scope };
        ReadOnlyGuard.Require(SunapData.HealthSqlText, dayArgs);
        var noHospital = new Dictionary<string, object?>(dayArgs);
        noHospital.Remove("@hospital");
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(SunapData.HealthSqlText, noHospital)).Code);

        // 비트 OrcInf에서 읽는 칸은 내원·차트·금액과 거르는 코드·수납일뿐이다
        var columns = Regex.Matches(SunapData.HealthSqlText, @"\bOrc[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(new[] { "OrcAccDte", "OrcChtNum", "OrcCod", "OrcInf", "OrcNewAmt", "OrcOcmNum" }, columns);
    }

    [Fact(DisplayName = "AC-5401.3 AC-6912.6 도우미 판은 0.14.1이고 답 v:3(clinic-calendar)·명령 이름 목록(명령 21개·protocol 1, contact.targets 칸 kind·from·to + 선택 q)이다(웹 LATEST_HELPER 0.14.1·CAL_HELPER 0.10.0·MIN_HELPER·SUNAP_HELPER 그대로는 handshake.test.ts가 본다)")]
    public void HealthVersionAndShapeStay()
    {
        Assert.Equal("0.14.1", HelperVersion.Value);
        Assert.Equal(3, SunapTargets.Version);
        CommandNamesStay();
    }

    // ── AC-5908 장부 줄 끝에 건강생활유지비 (spec clinic-calendar) ─────────────

    [Fact(DisplayName = "AC-5908.1 sunap 답 v:3: rows 줄마다 끝에 건강생활유지비 한 칸(미수에서 빼는 Health와 같은 값, 원 미만 버린 0 이상 정수)이 더해져 12칸이다. 미수 셈과 진료의 코드 등 다른 칸은 그대로다")]
    public void RowsEndWithHealth()
    {
        using var rig = new SunapRig();
        rig.Answer(SunapSql.PatientsSql,
            SunapData.Patient("900001", "가상환자01", "202610300902", "20240105", 0L, "D001"),
            SunapData.Patient("900002", "가상환자02", "202610300903", "20240105", 0L),
            SunapData.Patient("900003", "가상환자03", "202610300904", "20240105", 0L),
            SunapData.Patient("900004", "가상환자04", "202610300905", "20240105", 0L),
            SunapData.Patient("900005", "가상환자05", "202610300906", "20240105", 0L));
        rig.Answer(SunapSql.MoneySql,
            SunapData.Money("V1", "900001", 15000m, 0m, 0m, 0m, 1500m),             // 모두 건강생활유지비로 → 미수 0, 건강생활 1,500
            SunapData.Money("V2", "900002", 40000m, 1000m, 0m, 0m, 5000m),
            SunapData.Money("V3", "900002", 10000m, 0m, 0m, 0m, 2000m),             // 두 내원 999.7 + 500 = 1,499.7 → 1,499
            SunapData.Money("V4", "900003", 10000m, 0m, 0m, 0m, 1000m),             // 내원 합이 음수 → 0
            SunapData.Money("V5", "900004", 20000m, 2000m, 0m, 0m, 2000m),          // QCV 없음 → 0
            SunapData.Money("V6", "900005", 20000m, 0m, 0m, 0m, 3000m));            // 금액 SQL에 없는 내원의 QCV → 0
        rig.Answer(SunapData.HealthSqlText,
            SunapData.Health("V1", "900001", 1500m),
            SunapData.Health("V2", "900002", 999.7m),
            SunapData.Health("V3", "900002", 500L),
            SunapData.Health("V4", "900003", -700m),
            SunapData.Health("V9", "900005", 800m));
        rig.Answer(StatsSql.DoctorNamesSql, SunapData.DoctorName("D001", "가짜원장 가", "99991231"));
        var json = rig.Build();

        Assert.Equal(3, json.GetProperty("v").GetInt32());
        Assert.Equal(3, SunapTargets.Version);
        Assert.Equal(new[] { "v", "day", "unsure", "rows", "paid", "doctors" }, Json.Keys(json));
        Assert.All(json.GetProperty("rows").EnumerateArray(), row => Assert.Equal(12, row.GetArrayLength()));
        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"09:02\",\"re\",0,0,0,0,[],null,\"D001\",1500]",
            "[\"900002\",\"가상환자02\",\"09:03\",\"re\",1000,0,0,4500,[],null,null,1499]",
            "[\"900003\",\"가상환자03\",\"09:04\",\"re\",0,0,0,1000,[],null,null,0]",
            "[\"900004\",\"가상환자04\",\"09:05\",\"re\",2000,0,0,0,[],null,null,0]",
            "[\"900005\",\"가상환자05\",\"09:06\",\"re\",0,0,0,3000,[],null,null,0]",
        }, SunapRig.Lines(json, "rows"));
        Assert.All(json.GetProperty("rows").EnumerateArray(), row => Assert.Equal(JsonValueKind.Number, row[11].ValueKind));
        Assert.Equal(new[] { "[\"D001\",\"가짜원장 가\"]" }, SunapRig.Lines(json, "doctors"));
        Assert.False(json.GetProperty("unsure").GetBoolean());
    }

    private static void CommandNamesStay()
    {
        using var table = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        var commands = table.RootElement.GetProperty("commands");
        Assert.Equal(new[]
        {
            "bit.check", "bit.input", "bit.register", "claim.dates", "claim.memos", "claim.month", "contact.targets", "hello", "revenue.days", "sam.latest",
            "sheet.catalog", "sheet.code", "sheet.fill", "sheet.import", "sheet.link", "sheet.months", "sheet.ping", "sheet.status",
            "stats.rows", "store.load", "store.save",
        }, commands.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());
        Assert.Equal(new[] { "kind", "from", "to", "q" }, Json.Keys(commands.GetProperty("contact.targets").GetProperty("args")));
        Assert.Equal(1, table.RootElement.GetProperty("protocol").GetInt32());
    }
}
