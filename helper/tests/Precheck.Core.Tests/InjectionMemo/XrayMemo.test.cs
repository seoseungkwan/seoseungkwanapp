using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.InjectionMemo;
using Precheck.Core.Tests.Bit;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>
/// spec injection-memo REQ-7505 엑스레이 목록 창·REQ-7506 영상 처방 읽기(XrayParts·XrayList·MemoCompose.ComposeXrayPart·InjectionReader.ReadXray·InjectionMemoService.ReadXrayList).
/// 비트 DB는 가짜(FakeDb), 차트번호·날짜·코드는 지어낸 것이다. 부위·코드 표는 specs/injection-memo/notes/xray-parts.md 그대로.
/// </summary>
public class XrayMemoTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static readonly string[] Chosen = MemoSettings.Defaults.XrayParts.ToArray();

    private static Dictionary<string, DateTime> Shots(params (string Code3, DateTime Day)[] shots) =>
        shots.ToDictionary(s => s.Code3, s => s.Day, StringComparer.Ordinal);

    private static DateTime D(int year, int month, int day) => new DateTime(year, month, day);

    // 줄 하나를 '부위 yyyy-MM-dd 경과|-' 또는 '부위 없음'으로
    private static string[] Rows(IReadOnlyList<XrayItem> items) =>
        items.Select(item => item.Last == null
            ? item.Part + " 없음"
            : item.Part + " " + item.Last.Value.ToString("yyyy-MM-dd") + (item.Overdue ? " 경과" : " -")).ToArray();

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // ── AC-7505.2 부위 표·경과 판정 ─────────────────────────────

    [Fact(DisplayName = "AC-7505.2 부위 표: 무릎 1년·그 밖 2년, 인정 코드 앞 3글자(notes/xray-parts.md), C-Arm G04·관절조영 HA2는 어디에도 없음")]
    public void PartTable()
    {
        var expected = new Dictionary<string, string>
        {
            ["무릎"] = "G72 G77 G56", ["어깨"] = "G33 G32", ["목"] = "G41 G49", ["등"] = "G43 G49", ["허리"] = "G45 G49",
            ["골반"] = "G51", ["엉덩이"] = "G51 G52", ["고관절"] = "G52 G51", ["꼬리뼈"] = "G47", ["팔꿈치"] = "G62", ["팔"] = "G61 G63",
            ["손목"] = "G64", ["손"] = "G66", ["손가락"] = "G81 G66", ["허벅지"] = "G71", ["다리"] = "G71 G73 G56", ["종아리"] = "G73",
            ["발목"] = "G74", ["발"] = "G75 G79", ["발가락"] = "G82 G75",
        };
        foreach (var pair in expected)
        {
            Assert.Equal(pair.Value, string.Join(" ", XrayParts.CodesOf(pair.Key)));
            Assert.Equal(pair.Key == "무릎" ? 1 : 2, XrayParts.YearsOf(pair.Key));
        }
        Assert.Equal(expected.Keys.OrderBy(k => k, StringComparer.Ordinal), XrayParts.All.OrderBy(k => k, StringComparer.Ordinal));
        Assert.DoesNotContain(XrayParts.All.SelectMany(XrayParts.CodesOf), c => c == "G04" || c == "HA2");
        Assert.Empty(XrayParts.CodesOf("가슴"));
    }

    [Fact(DisplayName = "AC-7505.2 무릎은 오늘 − 1년, 그 밖은 오늘 − 2년보다 뒤에 인정 코드가 하나라도 있으면 경과 아님, 없으면 경과(찍은 적 없음도 경과), 마지막 날짜는 인정 코드 가운데 가장 뒤")]
    public void DecidesOverdue()
    {
        XrayItem Knee(params (string, DateTime)[] shots) => XrayList.Of(Shots(shots), new[] { "무릎" }, Today).Single(item => item.Part == "무릎");

        // 경계: 딱 1년 전 날은 '뒤'가 아니라 경과, 그 다음 날이면 경과 아님
        Assert.True(Knee(("G72", Today.AddYears(-1))).Overdue);
        Assert.False(Knee(("G72", Today.AddYears(-1).AddDays(1))).Overdue);
        Assert.True(XrayList.Of(Shots(("G41", Today.AddYears(-2))), Chosen, Today).Single(item => item.Part == "목").Overdue);
        Assert.False(XrayList.Of(Shots(("G41", Today.AddYears(-2).AddDays(1))), Chosen, Today).Single(item => item.Part == "목").Overdue);

        // 무릎은 슬개골 G77·하지전장 G56도, 가장 뒤 날짜가 마지막
        var knee = Knee(("G72", D(2023, 1, 5)), ("G77", D(2026, 9, 1)));
        Assert.Equal(D(2026, 9, 1), knee.Last);
        Assert.False(knee.Overdue);
        Assert.Equal(1, knee.Years);
        Assert.False(Knee(("G56", Today.AddMonths(-11))).Overdue);

        // 찍은 적 없음: 마지막 날짜 없음, 경과
        var never = XrayList.Of(Shots(), new[] { "허리" }, Today).Single();
        Assert.Null(never.Last);
        Assert.True(never.Overdue);
        Assert.Equal(2, never.Years);
    }

    [Fact(DisplayName = "AC-7505.2 지난 기간 글: 달 수(날짜가 덜 찼으면 한 달 뺌) ≥ 1이면 'N년 M달 전'('M달 전'·'N년 전'), 0이면 'N일 전'")]
    public void AgoText()
    {
        Assert.Equal("3년 4달 전", XrayList.AgoText(D(2023, 7, 14), Today));
        Assert.Equal("1년 2달 전", XrayList.AgoText(D(2025, 9, 2), Today));
        Assert.Equal("5달 전", XrayList.AgoText(D(2026, 6, 11), Today));
        Assert.Equal("1년 전", XrayList.AgoText(D(2025, 11, 20), Today));
        Assert.Equal("11달 전", XrayList.AgoText(D(2025, 11, 21), Today));
        Assert.Equal("1달 전", XrayList.AgoText(D(2026, 10, 20), Today));
        Assert.Equal("30일 전", XrayList.AgoText(D(2026, 10, 21), Today));
        Assert.Equal("1일 전", XrayList.AgoText(D(2026, 11, 19), Today));
        Assert.Equal("28일 전", XrayList.AgoText(D(2026, 1, 31), D(2026, 2, 28)));
        Assert.Equal("2년 전", XrayList.AgoText(D(2024, 11, 20), new DateTime(2026, 11, 20, 15, 30, 0)));
    }

    // ── AC-7505.1 목록 ─────────────────────────────

    [Fact(DisplayName = "AC-7505.1 목록: 찍은 부위는 설정과 상관없이 다(경과 먼저, 그 안에서 오래된 것부터, 같으면 표 차례), 그 뒤 고른 부위 가운데 찍은 적 없는 것(표 차례), 좌우 안 가림")]
    public void ListsShotsThenNever()
    {
        var shots = Shots(("G45", D(2023, 7, 14)), ("G41", D(2023, 7, 14)), ("G72", D(2025, 9, 2)), ("G33", D(2026, 6, 11)));
        var items = XrayList.Of(shots, Chosen, Today);
        Assert.Equal(
            new[]
            {
                "목 2023-07-14 경과", "허리 2023-07-14 경과", "무릎 2025-09-02 경과", "어깨 2026-06-11 -",
                "등 없음", "골반 없음", "엉덩이 없음", "고관절 없음", "꼬리뼈 없음", "팔꿈치 없음", "손목 없음", "손 없음", "손가락 없음", "발목 없음", "발 없음", "발가락 없음",
            },
            Rows(items));

        // 경과 아닌 것들도 오래된 것부터
        Assert.Equal(new[] { "손목 2026-01-02 -", "어깨 2026-06-11 -" }, Rows(XrayList.Of(Shots(("G33", D(2026, 6, 11)), ("G64", D(2026, 1, 2))), Array.Empty<string>(), Today)));
    }

    [Fact(DisplayName = "AC-7505.1 전척추 G49는 목·등·허리, 하지전장 G56은 무릎·다리 — 고르지 않은 다리도 찍었으면 나옴, C-Arm·관절조영·표에 없는 코드는 안 봄")]
    public void SharedCodesAndUnchosen()
    {
        Assert.Equal(new[] { "목 2024-01-03 경과", "등 2024-01-03 경과", "허리 2024-01-03 경과" }, Rows(XrayList.Of(Shots(("G49", D(2024, 1, 3))), Array.Empty<string>(), Today)));
        Assert.Equal(new[] { "무릎 2026-03-03 -", "다리 2026-03-03 -" }, Rows(XrayList.Of(Shots(("G56", D(2026, 3, 3))), new[] { "무릎" }, Today)));
        Assert.Empty(XrayList.Of(Shots(("G04", D(2026, 3, 3)), ("HA2", D(2026, 3, 3)), ("G99", D(2026, 3, 3))), Array.Empty<string>(), Today));
        Assert.Empty(XrayList.Of(null, null, Today));
        Assert.Equal(new[] { "다리 없음" }, Rows(XrayList.Of(Shots(), new[] { "다리", "가슴", "다리" }, Today)));
    }

    [Fact(DisplayName = "AC-7505.1 목록 줄(XrayItem)의 ToString에는 부위·날짜를 남기지 않음")]
    public void ItemHidesValues()
    {
        var text = new XrayItem("무릎", D(2025, 9, 2), 1, true).ToString();
        Assert.DoesNotContain("무릎", text);
        Assert.DoesNotContain("2025", text);
    }

    // ── AC-7505.3 [넣기] 글 ─────────────────────────────

    private static MemoResult Put(string? memo, string part) => MemoCompose.ComposeXrayPart(memo, part, XrayParts.YearsOf(part));

    [Fact(DisplayName = "AC-7505.3 칸 끝 조각이 그 부위 하나의 주사 차수로 끝나면 띄어 'xrN년경과'만, 다른 부위는 띄어 '<부위> xrN년경과'")]
    public void AppendsAfterInjection()
    {
        var r = Put("오)무릎 3차", "무릎");
        Assert.Equal(MemoResultKind.Insert, r.Kind);
        Assert.Equal("xr1년경과", r.Text);
        Assert.Equal(" xr1년경과", r.Append);
        Assert.Equal(" 허리 xr2년경과", Put("오)무릎 3차", "허리").Append);
        Assert.Equal("허리 xr2년경과", Put("오)무릎 3차", "허리").Text);
        Assert.Equal(" 허리 xr2년경과", Put("오)무릎 3차 xr1년경과", "허리").Append);

        // 마지막 '/' 뒤 조각만 봄, 표의 다른 말(슬관절)·붙여 쓴 부위(무릎관절)도 같은 부위, 부위 둘·약 이름만이면 부위를 씀
        Assert.Equal(" xr1년경과", Put("물리치료/왼)슬관절 2차", "무릎").Append);
        Assert.Equal(" xr1년경과", Put("오)무릎관절 3차", "무릎").Append);
        Assert.Equal(" xr2년경과", Put("목 3차", "목").Append);
        Assert.Equal(" 무릎 xr1년경과", Put("양)무릎,발목 DNA 2차", "무릎").Append);
        Assert.Equal(" 무릎 xr1년경과", Put("DNA 2차", "무릎").Append);
        Assert.Equal("xr1년경과", Put("오)무릎 3차 ", "무릎").Append);
    }

    [Fact(DisplayName = "AC-7505.3 위 줄부터 눌러 다른 부위 경과가 먼저 붙었으면 그 부위도 '<부위> xrN년경과'로(주사 부위인데 이름 없이 붙지 않게)")]
    public void OwnPartAfterOtherXray()
    {
        Assert.Equal(" 무릎 xr1년경과", Put("오)무릎 3차 허리 xr2년경과", "무릎").Append);
        Assert.False(MemoCompose.HasXrayFor("오)무릎 3차 허리 xr2년경과", "무릎"));
    }

    [Fact(DisplayName = "AC-7505.3 칸 끝이 주사 차수가 아니면 '<부위> xrN년경과'를 빈 칸은 그대로, 글이 있으면 '/'로")]
    public void AppendsAsNewPiece()
    {
        Assert.Equal("등 xr2년경과", Put("", "등").Append);
        Assert.Equal("등 xr2년경과", Put("", "등").Text);
        Assert.Equal("무릎 xr1년경과", Put(null, "무릎").Append);
        Assert.Equal("/허리 xr2년경과", Put("물리치료만", "허리").Append);
        Assert.Equal("허리 xr2년경과", Put("물리치료만/", "허리").Append);
        Assert.Equal("/무릎 xr1년경과", Put("오)무릎 3차/물리치료", "무릎").Append);
        Assert.Equal("/무릎 xr1년경과", Put("XR 오늘", "무릎").Append);
    }

    [Fact(DisplayName = "AC-7505.3 칸에 그 부위 경과 글이 이미 있으면(<부위> xr·주사 차수 바로 뒤 xr, 대소문자 무시) 넣지 않고 넣음 — 다른 말에 붙은 부위(발목의 목)는 아님")]
    public void AlreadyHasThatPart()
    {
        Assert.Equal(MemoResultKind.XrayAlreadyHas, Put("허리 xr2년경과", "허리").Kind);
        Assert.Equal(MemoResultKind.XrayAlreadyHas, Put("물리치료/허리 XR2년경과", "허리").Kind);
        Assert.Equal(MemoResultKind.XrayAlreadyHas, Put("오)무릎 3차 xr1년경과", "무릎").Kind);
        Assert.Equal(MemoResultKind.XrayAlreadyHas, Put("오)무릎 3차 xr1년경과 허리 xr2년경과", "허리").Kind);
        Assert.Equal(MemoResultKind.XrayAlreadyHas, Put("오)무릎 3차 xr1년경과 허리 xr2년경과", "무릎").Kind);
        Assert.True(MemoCompose.HasXrayFor("오)무릎 3차 xr1년경과", "무릎"));
        Assert.False(MemoCompose.HasXrayFor("오)무릎 3차 xr1년경과", "허리"));
        Assert.False(MemoCompose.HasXrayFor("발목 xr2년경과", "목"));
        Assert.Equal(MemoResultKind.Insert, Put("발목 xr2년경과", "목").Kind);
        Assert.False(MemoCompose.HasXrayFor(null, "목"));
        Assert.Equal("", Put("허리 xr2년경과", "허리").Text);
    }

    [Fact(DisplayName = "AC-7505.3 칸 글과 합쳐 50자를 넘으면 넣을 글을 그대로(칸에 못 쳐서 넣지 못함으로 직접 적을 글)")]
    public void OverFiftyCharacters()
    {
        Assert.Equal(50, MemoCompose.MaxLength);
        var exact = new string('가', 40);   // 40 + '/' + '무릎 xr1년경과'(9) = 50 → 들어감
        Assert.Equal(50, exact.Length + Put(exact, "무릎").Append.Length);

        var full = new string('가', 45);
        var over = Put(full, "무릎");
        Assert.Equal(MemoResultKind.Insert, over.Kind);
        Assert.Equal("무릎 xr1년경과", over.Text);
        Assert.True(full.Length + over.Append.Length > MemoCompose.MaxLength);
    }

    // ── AC-7506.1 영상 처방 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7506.1 문장: 읽기 전용 SELECT 하나(영상 OdrInf OdrIncCod=30·삭제·취소 아님·@cht·@from~@to·코드 앞 3글자별 MAX), 허용 목록·매개변수 모양, 그 전 마지막 내원 문장은 없음")]
    public void SqlIsGuardedSelect()
    {
        var x = InjectionSql.XraySql;
        Assert.StartsWith("SELECT ", x, StringComparison.Ordinal);
        Assert.DoesNotContain(";", x);
        Assert.DoesNotContain("--", x);
        Assert.DoesNotContain("/*", x);
        Assert.DoesNotContain("\r", x);
        Assert.DoesNotMatch(Forbidden, x);
        Assert.True(Sql.IsAllowed(x));
        Assert.Contains(x, InjectionSql.All);
        Assert.DoesNotContain(x, Sql.All);
        Assert.False(Sql.IsAllowed(x + " "));
        foreach (var part in new[] { "FROM dbo.OdrInf o", "LTRIM(RTRIM(o.OdrChtNum))=@cht", "o.OdrDtm>=@from", "o.OdrDtm<@to", "o.OdrIncCod=30", "o.OdrDelFlg='N'", "o.OdrCanYon='N'", "MAX(o.OdrDtm)", "GROUP BY LEFT(UPPER(RTRIM(o.OdrElcCod)),3)" })
            Assert.Contains(part, x);
        Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(x));
        Assert.Equal(4, InjectionSql.All.Count);
        Assert.DoesNotContain(InjectionSql.All, sql => sql.Contains("EmrInf") && sql.Contains("TOP 1"));
    }

    [Fact(DisplayName = "AC-7506.1 ReadXray: @cht·@from(오늘 − 20년 0시)·@to(오늘 0시), 5초, 코드 앞 3글자 → 마지막 날짜(틀린 줄은 버림)")]
    public void ReadsXray()
    {
        Assert.Equal(20, XrayList.ReadYears);
        var db = new FakeDb().Answer(InjectionSql.XraySql, _ => new[]
        {
            new object?[] { "G72", "202510011230" },
            new object?[] { " g33 ", "202301010900" },
            new object?[] { null, "202501010900" },
            new object?[] { "G41", "bad" },
            new object?[] { "G45" },
        });
        var shots = InjectionReader.ReadXray(db, Chart, new DateTime(2026, 11, 20, 15, 30, 0));
        Assert.Equal(new[] { "G33", "G72" }, shots.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal(D(2025, 10, 1), shots["G72"]);
        Assert.Equal(D(2023, 1, 1), shots["G33"]);
        var call = Assert.Single(db.Calls);
        Assert.Equal(new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "200611200000", ["@to"] = "202611200000" }, call.Args);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
    }

    // ── 서비스 ─────────────────────────────

    [Fact(DisplayName = "AC-7505.1 [엑스레이](ReadXrayList): 영상 처방만 읽고(증상 줄·내원·주상병 안 읽음) 목록을 만든다")]
    public void ServiceListsXray()
    {
        var db = new FakeDb().Answer(InjectionSql.XraySql, _ => new[] { new object?[] { "G45", "202307140900" }, new object?[] { "G72", "202606110900" } });
        var result = InjectionMemoService.ReadXrayList(db, " 90001 ", Today, new[] { "무릎", "허리", "어깨" });
        Assert.Equal(XrayListKind.Ok, result.Kind);
        Assert.Equal(new[] { "허리 2023-07-14 경과", "무릎 2026-06-11 -", "어깨 없음" }, Rows(result.Items));
        Assert.Equal(new[] { InjectionSql.XraySql }, db.Sqls.ToArray());
        Assert.Equal("90001", Assert.Single(db.Calls).Args["@cht"]);

        var empty = InjectionMemoService.ReadXrayList(new FakeDb().Answer(InjectionSql.XraySql, _ => new object?[][] { }), Chart, Today, Array.Empty<string>());
        Assert.Equal(XrayListKind.Ok, empty.Kind);
        Assert.Empty(empty.Items);
    }

    [Fact(DisplayName = "AC-7506.1 [엑스레이]: 환자 없음은 DB에 안 묻고 NoPatient, 읽기 실패·시간 지남은 Failed(목록 없음)")]
    public void ServiceSkipsAndFails()
    {
        var none = new FakeDb();
        Assert.Equal(XrayListKind.NoPatient, InjectionMemoService.ReadXrayList(none, " ", Today, Chosen).Kind);
        Assert.Equal(XrayListKind.NoPatient, InjectionMemoService.ReadXrayList(none, null, Today, Chosen).Kind);
        Assert.Empty(none.Calls);

        var failed = InjectionMemoService.ReadXrayList(new FakeDb().Fail(InjectionSql.XraySql, BitErrors.ReadFailed), Chart, Today, Chosen);
        Assert.Equal(XrayListKind.Failed, failed.Kind);
        Assert.Empty(failed.Items);
        Assert.Throws<ArgumentNullException>(() => InjectionMemoService.ReadXrayList(null!, Chart, Today, Chosen));
    }

    [Fact(DisplayName = "AC-7505.4 [주사 차수](Compute)는 엑스레이를 보지 않고 주사 차수(와 골절 fx)만, 칸에 차수와 fx가 다 있으면 DB에 묻지 않고 이미 있음")]
    public void InjectionButtonIgnoresXray()
    {
        var visit = new[] { new object?[] { "V1", "202611131000", "" } };
        var knee = new[] { new object?[] { "V1", 1, "오른쪽 무릎 2차 주사 시행" }, new object?[] { "V1", 2, "허리도 아프다" } };
        FakeDb Db() => new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => visit)
            .Answer(InjectionSql.LinesSql, _ => knee)
            .Answer(InjectionSql.XraySql, _ => new object?[][] { })
            .Answer(InjectionSql.DiagnosisSql, _ => new object?[][] { });
        var db = Db();
        Assert.Equal("오)무릎 3차", InjectionMemoService.Compute(db, Chart, "", Today).Text);
        Assert.Equal(new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql, InjectionSql.DiagnosisSql }, db.Sqls.ToArray());

        var none = new FakeDb();
        Assert.Equal(MemoResultKind.AlreadyHas, InjectionMemoService.Compute(none, Chart, "오)무릎 2차/오)발 fx", Today).Kind);
        Assert.Empty(none.Calls);
        Assert.Equal(MemoResultKind.AlreadyHas, InjectionMemoService.Compute(Db(), Chart, "오)무릎 2차", Today).Kind);
    }

    [Fact(DisplayName = "AC-7501.1 주사 차수 부위: 한 글자 부위는 부위 아닌 말('발생')이면 빼고, 붙여 쓴 '목통증'은 부위")]
    public void OneLetterInjectionParts()
    {
        Assert.Equal("왼)어깨 3차", Inserted(Lines(5, "", "3차 주사 합니다|어제 발생한 통증|Lt. shoulder pain")));
        Assert.Equal("목 3차", Inserted(Lines(5, "", "3차 주사 합니다|목통증 심함")));
    }
}
