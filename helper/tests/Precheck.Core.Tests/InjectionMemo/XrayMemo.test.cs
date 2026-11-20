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
/// spec injection-memo REQ-7505 엑스레이 경과·REQ-7506 영상 처방 읽기(XrayParts·XrayRule·MemoCompose·InjectionReader.ReadXray/ReadLastBefore).
/// 비트 DB는 가짜(FakeDb), 차트번호·내원 번호·글·날짜는 지어낸 것이다. 부위·코드 표는 specs/injection-memo/notes/xray-parts.md 그대로.
/// </summary>
public class XrayMemoTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static string[] PartsOf(params VisitNote[] visits) => XrayParts.Of(visits, null, Today).ToArray();

    private static string[] Due(IReadOnlyList<XrayDue> due) => due.Select(d => d.Part + d.Years).ToArray();

    private static XrayDue[] DueOf(params string[] partYears) =>
        partYears.Select(p => new XrayDue(p.Substring(0, p.Length - 1), p[p.Length - 1] - '0')).ToArray();

    private static Dictionary<string, DateTime> Shots(params (string Code3, DateTime Day)[] shots) =>
        shots.ToDictionary(s => s.Code3, s => s.Day, StringComparer.Ordinal);

    private static MemoResult Insert(string text, string? memo = "") => new MemoResult(MemoResultKind.Insert, text, append: MemoMerge.AppendText(memo, text));

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // ── AC-7505.1 부위 모으기 ─────────────────────────────

    [Fact(DisplayName = "AC-7505.1 부위: 최근 내원부터 나온 차례, 중복 없음, 좌우 안 가림, 영어 부위는 우리말, 표에 없는 부위(가슴 등)는 안 봄")]
    public void CollectsPartsInOrder()
    {
        Assert.Equal(new[] { "어깨", "무릎", "허리" }, PartsOf(
            Visit(20, "", "허리 통증", "Rt knee OA"),
            Visit(3, "", "왼쪽 어깨 아프다", "슬관절 2차 주사")));
        Assert.Equal(new[] { "목", "허리" }, PartsOf(Visit(5, "", "neck pain, L-spine", "가슴 답답, 늑골 통증")));
        Assert.Equal(new[] { "무릎" }, PartsOf(Visit(5, "", "Rt. knee OA", "Lt 무릎 2차 주사", "양측 슬관절")));
        Assert.Empty(PartsOf(Visit(5, "", "가슴 답답", "두통"), Visit(9, "물리치료")));
    }

    [Fact(DisplayName = "AC-7505.1 좌우 말·다른 부위에 붙여 쓴 부위도(양무릎·우측어깨·왼무릎·오른쪽무릎·발뒤꿈치·등허리)")]
    public void PartsGluedToSideOrPart()
    {
        Assert.Equal(new[] { "무릎", "어깨", "발" }, PartsOf(Visit(5, "", "양무릎 통증", "우측어깨 통증", "왼무릎 2차 주사", "오른쪽무릎", "Lt 발뒤꿈치 통증")));
        Assert.Equal(new[] { "등", "허리" }, PartsOf(Visit(5, "", "등허리 통증")));
        Assert.Empty(PartsOf(Visit(5, "", "관무릎", "사어깨")));
    }

    [Fact(DisplayName = "AC-7505.1 표의 말 → 메모에 쓰는 부위(견갑·회전근개→어깨, 경추→목, 흉추→등, 요추→허리, 천장관절→골반, 둔부→엉덩이, 사타구니→고관절 …)")]
    public void MapsWordsToMemoParts()
    {
        Assert.Equal(new[] { "어깨" }, PartsOf(Visit(5, "", "견갑 날개뼈 승모근 회전근개 견관절 어깨")));
        Assert.Equal(
            new[] { "목", "등", "허리", "골반", "엉덩이", "고관절", "꼬리뼈", "팔꿈치", "손목", "손", "손가락", "허벅지", "다리", "종아리", "발목", "발", "발가락", "팔" },
            PartsOf(Visit(5, "", "경추 흉추 요추 천장관절 둔부 사타구니 미추 주관절 수근관 손바닥 수지 허벅지 다리 종아리 족관절 족저 발가락 팔")));
        Assert.Equal(new[] { "팔꿈치", "손가락", "손", "발", "발목", "손목", "고관절" }, PartsOf(Visit(5, "", "엘보 엄지 손등 뒤꿈치 아킬레스 CTS hip")));
        Assert.Equal(new[] { "손가락", "발" }, PartsOf(Visit(5, "", "방아쇠 발등 발바닥")));
        Assert.Equal(new[] { "발가락" }, PartsOf(Visit(5, "", "엄지발가락 통증", "Rt 엄지 발가락")));
        Assert.Equal(new[] { "손가락" }, PartsOf(Visit(5, "", "엄지 통증")));
    }

    [Fact(DisplayName = "AC-7505.1 한 글자 부위(발·손·목·등·팔)는 부위 아닌 말(발생·손상·목요일·등록 …)이면 빼고, 붙여 쓴 '팔저림'·'목통증'은 부위, 주사 차수 부위에도 같이")]
    public void OneLetterPartsNeedParticle()
    {
        Assert.Empty(PartsOf(Visit(5, "", "2주 전 발생", "인대 손상", "목요일 예약", "등록함")));
        Assert.Empty(PartsOf(Visit(5, "", "발병 2주", "발현", "발작", "발급", "발견", "발적", "발열", "발기", "발전", "손해", "손톱", "등산", "등급", "등등", "목욕", "목발", "목적", "목표")));
        Assert.Equal(new[] { "팔", "목", "손", "등", "발" }, PartsOf(Visit(5, "", "팔저림", "목통증", "손저림 심함", "등으로 뻗침", "발시림")));
        Assert.Equal(new[] { "발", "손", "목", "어깨", "등", "허리", "팔" }, PartsOf(Visit(5, "", "발이 붓고", "손 저림", "목, 어깨", "등과 허리", "팔로 짚음")));
        Assert.Equal(new[] { "손", "발", "목", "등", "팔" }, PartsOf(Visit(5, "", "손은", "발에", "목의", "등쪽", "팔만")));

        // 주사 차수 부위: '발생'의 '발'이 섞이지 않는다
        Assert.Equal("왼)어깨 3차", Inserted(Lines(5, "", "3차 주사 합니다|어제 발생한 통증|Lt. shoulder pain")));
        Assert.Equal("목 3차", Inserted(Lines(5, "", "3차 주사 합니다|목통증 심함")));
    }

    [Fact(DisplayName = "AC-7505.1 30일 안에 증상 줄 있는 내원이 없으면 그 전 마지막 내원 기록, 있으면 그 전 기록은 안 봄")]
    public void FallsBackToLastVisitBefore()
    {
        Assert.Equal(new[] { "허리" }, XrayParts.Of(new[] { Visit(4, "물리치료") }, Visit(200, "", "허리 통증"), Today).ToArray());
        Assert.Equal(new[] { "허리" }, XrayParts.Of(new[] { Visit(4, "", " ", "") }, Visit(400, "", "허리 통증"), Today).ToArray());
        Assert.Equal(new[] { "목" }, XrayParts.Of(new[] { Visit(4, "", "목 통증") }, Visit(200, "", "허리 통증"), Today).ToArray());
        Assert.Empty(XrayParts.Of(Array.Empty<VisitNote>(), null, Today));
        Assert.Equal(new[] { "무릎" }, XrayParts.Of(Array.Empty<VisitNote>(), Visit(90, "", "knee pain"), Today).ToArray());
    }

    // ── AC-7505.2 경과 판정 ─────────────────────────────

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

    [Fact(DisplayName = "AC-7505.2 무릎은 오늘 − 1년, 그 밖은 오늘 − 2년보다 뒤에 인정 코드가 하나라도 있으면 경과 아님, 없으면(사진 기록 없어도) 경과")]
    public void DecidesOverdue()
    {
        var parts = new[] { "무릎", "어깨", "허리", "발" };
        Assert.Equal(new[] { "무릎1", "어깨2", "허리2", "발2" }, Due(XrayRule.Overdue(parts, Shots(), Today)));

        var shots = Shots(("G72", Today.AddMonths(-13)), ("G33", Today.AddMonths(-23)), ("G49", Today.AddMonths(-25)), ("G79", Today.AddDays(-10)));
        Assert.Equal(new[] { "무릎1", "허리2" }, Due(XrayRule.Overdue(parts, shots, Today)));

        // 경계: 딱 1년 전 날은 '뒤'가 아니라 경과, 그 다음 날이면 경과 아님
        Assert.Equal(new[] { "무릎1" }, Due(XrayRule.Overdue(new[] { "무릎" }, Shots(("G72", Today.AddYears(-1))), Today)));
        Assert.Empty(XrayRule.Overdue(new[] { "무릎" }, Shots(("G72", Today.AddYears(-1).AddDays(1))), Today));
        Assert.Equal(new[] { "목2" }, Due(XrayRule.Overdue(new[] { "목" }, Shots(("G41", Today.AddYears(-2))), Today)));

        // 다른 인정 코드: 무릎은 슬개골 G77·하지전장 G56, 목·등·허리는 전척추 G49
        Assert.Empty(XrayRule.Overdue(new[] { "무릎" }, Shots(("G77", Today.AddMonths(-2))), Today));
        Assert.Empty(XrayRule.Overdue(new[] { "무릎" }, Shots(("G56", Today.AddMonths(-11))), Today));
        Assert.Empty(XrayRule.Overdue(new[] { "목", "등", "허리" }, Shots(("G49", Today.AddMonths(-20))), Today));

        // 다른 부위 사진·C-Arm은 인정 안 함
        Assert.Equal(new[] { "무릎1" }, Due(XrayRule.Overdue(new[] { "무릎" }, Shots(("G74", Today.AddDays(-3)), ("G04", Today.AddDays(-3))), Today)));
    }

    // ── AC-7505.3 넣을 글 ─────────────────────────────

    [Fact(DisplayName = "AC-7505.3 주사 부위 하나가 경과면 주사 글 뒤에 띄어 'xrN년경과', 다른 경과 부위는 '<부위> xrN년경과'를 나온 차례대로")]
    public void AppendsToInjection()
    {
        var knee = Insert("오)무릎 3차");
        Assert.Equal("오)무릎 3차 xr1년경과", MemoCompose.Compose(knee, DueOf("무릎1"), "").Text);
        Assert.Equal("오)무릎 3차 xr1년경과 어깨 xr2년경과", MemoCompose.Compose(knee, DueOf("무릎1", "어깨2"), "").Text);
        Assert.Equal("오)무릎 3차 어깨 xr2년경과", MemoCompose.Compose(knee, DueOf("어깨2"), "").Text);
        Assert.Equal("오)무릎 3차 xr1년경과 어깨 xr2년경과", MemoCompose.Compose(knee, DueOf("어깨2", "무릎1"), "").Text);

        // 주사 글 부위가 둘이면 붙이지 않고 따로, 표의 다른 말(슬관절)도 같은 부위, 약 이름만이면 따로
        Assert.Equal("양)무릎,발목 DNA 2차 무릎 xr1년경과 발목 xr2년경과", MemoCompose.Compose(Insert("양)무릎,발목 DNA 2차"), DueOf("무릎1", "발목2"), "").Text);
        Assert.Equal("왼)슬관절 2차 xr1년경과", MemoCompose.Compose(Insert("왼)슬관절 2차"), DueOf("무릎1"), "").Text);
        Assert.Equal("왼)무릎 DNA 2차 xr1년경과", MemoCompose.Compose(Insert("왼)무릎 DNA 2차"), DueOf("무릎1"), "").Text);
        Assert.Equal("DNA 2차 무릎 xr1년경과", MemoCompose.Compose(Insert("DNA 2차"), DueOf("무릎1"), "").Text);
        Assert.Equal("목 3차 xr2년경과", MemoCompose.Compose(Insert("목 3차"), DueOf("목2"), "").Text);

        // 주사 글 부위를 붙여 썼어도 부위는 한 번만
        Assert.Equal("오)무릎관절 3차 xr1년경과", MemoCompose.Compose(Insert("오)무릎관절 3차"), DueOf("무릎1"), "").Text);
        Assert.Equal("허리디스크 3차 xr2년경과", MemoCompose.Compose(Insert("허리디스크 3차"), DueOf("허리2"), "").Text);

        // 칸에 글이 있으면 '/'로 붙임(Append), 넣는 글(Text)은 '/' 없이
        var merged = MemoCompose.Compose(Insert("오)무릎 3차", "물리치료만"), DueOf("무릎1"), "물리치료만");
        Assert.Equal(MemoResultKind.Insert, merged.Kind);
        Assert.Equal("/오)무릎 3차 xr1년경과", merged.Append);
        Assert.Null(merged.Reason);
    }

    [Fact(DisplayName = "AC-7505.3 주사 글이 안 들어가도(기록 없음·끝남·일찍 옴·이미 있음) 경과 부위만 넣고, 주사 쪽 결과는 Reason에")]
    public void XrayOnly()
    {
        var noRecord = MemoCompose.Compose(new MemoResult(MemoResultKind.NoRecord), DueOf("무릎1", "허리2"), "");
        Assert.Equal(MemoResultKind.Insert, noRecord.Kind);
        Assert.Equal("무릎 xr1년경과 허리 xr2년경과", noRecord.Text);
        Assert.Equal("무릎 xr1년경과 허리 xr2년경과", noRecord.Append);
        Assert.Equal(MemoResultKind.NoRecord, noRecord.Reason!.Kind);

        var early = MemoCompose.Compose(new MemoResult(MemoResultKind.TooEarly, plannedDate: Day(11, 27)), DueOf("무릎1"), "");
        Assert.Equal("무릎 xr1년경과", early.Text);
        Assert.Equal(MemoResultKind.TooEarly, early.Reason!.Kind);
        Assert.Equal(Day(11, 27), early.Reason.PlannedDate);

        var finished = MemoCompose.Compose(new MemoResult(MemoResultKind.Finished, untilNumber: 5), DueOf("어깨2"), "");
        Assert.Equal("어깨 xr2년경과", finished.Text);
        Assert.Equal(5, finished.Reason!.UntilNumber);

        var already = MemoCompose.Compose(new MemoResult(MemoResultKind.AlreadyHas), DueOf("무릎1"), "오)무릎 2차");
        Assert.Equal("무릎 xr1년경과", already.Text);
        Assert.Equal("/무릎 xr1년경과", already.Append);
        Assert.Equal(MemoResultKind.AlreadyHas, already.Reason!.Kind);
    }

    [Fact(DisplayName = "AC-7505.3 칸에 이미 'xr'(대소문자 무시)이 있거나 경과가 없으면 그대로, 환자 없음·읽기 실패도 그대로")]
    public void KeepsWhenNothingToAdd()
    {
        var knee = Insert("오)무릎 3차");
        Assert.Same(knee, MemoCompose.Compose(knee, DueOf("무릎1"), "XR 오늘"));
        Assert.Same(knee, MemoCompose.Compose(knee, DueOf("무릎1"), "허리 xr2년경과"));
        Assert.Same(knee, MemoCompose.Compose(knee, Array.Empty<XrayDue>(), ""));
        foreach (var kind in new[] { MemoResultKind.NoRecord, MemoResultKind.NoPatient, MemoResultKind.Failed })
        {
            var result = new MemoResult(kind);
            Assert.Same(result, MemoCompose.Compose(result, kind == MemoResultKind.NoRecord ? Array.Empty<XrayDue>() : DueOf("무릎1"), ""));
        }
        var noRecord = new MemoResult(MemoResultKind.NoRecord);
        Assert.Same(noRecord, MemoCompose.Compose(noRecord, DueOf("무릎1"), "Xr1년경과"));
    }

    [Fact(DisplayName = "AC-7505.3 칸 글과 합쳐 50자를 넘으면 뒤쪽 경과 조각부터 빼고, 주사 글은 남김(경과가 하나도 안 들어가면 원래 결과)")]
    public void FitsFiftyCharacters()
    {
        Assert.Equal(50, MemoCompose.MaxLength);
        var memo = new string('가', 20);
        var fit = MemoCompose.Compose(Insert("오)무릎 3차", memo), DueOf("무릎1", "어깨2", "허리2", "손목2"), memo);
        Assert.Equal("오)무릎 3차 xr1년경과 어깨 xr2년경과", fit.Text);
        Assert.Equal(45, memo.Length + fit.Append.Length);

        var exact = new string('가', 39);   // 39 + '/' + '무릎 xr1년경과'(10) = 50 → 들어감
        Assert.Equal("/무릎 xr1년경과", MemoCompose.Compose(new MemoResult(MemoResultKind.NoRecord), DueOf("무릎1"), exact).Append);

        var full = new string('가', 45);
        var knee = Insert("오)무릎 3차", full);
        var kept = MemoCompose.Compose(knee, DueOf("무릎1", "어깨2"), full);
        Assert.Equal("오)무릎 3차", kept.Text);
        var noRecord = new MemoResult(MemoResultKind.NoRecord);
        Assert.Same(noRecord, MemoCompose.Compose(noRecord, DueOf("무릎1"), full));
    }

    // ── AC-7506.1 영상 처방 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7506.1 문장: 읽기 전용 SELECT(영상 OdrInf OdrIncCod=30·삭제·취소 아님·@cht·@from~@to·코드 앞 3글자별 MAX, 그 전 마지막 내원 증상 줄), 허용 목록·매개변수 모양")]
    public void SqlIsGuardedSelect()
    {
        foreach (var sql in new[] { InjectionSql.XraySql, InjectionSql.LastBeforeSql })
        {
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(Forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.Contains(sql, InjectionSql.All);
            Assert.DoesNotContain(sql, Sql.All);
            Assert.False(Sql.IsAllowed(sql + " "));
        }

        var x = InjectionSql.XraySql;
        foreach (var part in new[] { "FROM dbo.OdrInf o", "LTRIM(RTRIM(o.OdrChtNum))=@cht", "o.OdrDtm>=@from", "o.OdrDtm<@to", "o.OdrIncCod=30", "o.OdrDelFlg='N'", "o.OdrCanYon='N'", "MAX(o.OdrDtm)", "GROUP BY LEFT(UPPER(RTRIM(o.OdrElcCod)),3)" })
            Assert.Contains(part, x);
        Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(x));

        var b = InjectionSql.LastBeforeSql;
        foreach (var part in new[] { "TOP 1", "LTRIM(RTRIM(b.PbsChtNum))=@cht", "OcmAcpDtm<@from", "OcmPatTyp='O'", "OcmRsuYon<>'O'", "EmrShtTyp='S'", "ORDER BY" })
            Assert.Contains(part, b);
        Assert.Equal("@cht:VarChar(14) @from:Char(12)", Shape(b));
        Assert.Equal(4, InjectionSql.All.Count);
    }

    [Fact(DisplayName = "AC-7506.1 ReadXray: @cht·@from(오늘 − 2년 0시)·@to(오늘 0시), 5초, 코드 앞 3글자 → 마지막 날짜(틀린 줄은 버림)")]
    public void ReadsXray()
    {
        var db = new FakeDb().Answer(InjectionSql.XraySql, _ => new[]
        {
            new object?[] { "G72", "202510011230" },
            new object?[] { " g33 ", "202401010900" },
            new object?[] { null, "202501010900" },
            new object?[] { "G41", "bad" },
            new object?[] { "G45" },
        });
        var shots = InjectionReader.ReadXray(db, Chart, new DateTime(2026, 11, 20, 15, 30, 0));
        Assert.Equal(new[] { "G33", "G72" }, shots.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal(new DateTime(2025, 10, 1), shots["G72"]);
        Assert.Equal(new DateTime(2024, 1, 1), shots["G33"]);
        var call = Assert.Single(db.Calls);
        Assert.Equal(new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "202411200000", ["@to"] = "202611200000" }, call.Args);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
    }

    [Fact(DisplayName = "AC-7506.1 ReadLastBefore: @cht·@from(오늘 30일 앞 0시), 그 내원의 증상 줄을 EmrShtSeq 차례로, 없으면 null")]
    public void ReadsLastBefore()
    {
        var db = new FakeDb().Answer(InjectionSql.LastBeforeSql, _ => new[]
        {
            new object?[] { "V9", "202605031000", 2, "Rt knee OA" },
            new object?[] { "V9", "202605031000", "1", "허리 통증" },
            new object?[] { "V9", "202605031000", 3, null },
        });
        var visit = InjectionReader.ReadLastBefore(db, Chart, Today);
        Assert.NotNull(visit);
        Assert.Equal(new DateTime(2026, 5, 3), visit!.Date);
        Assert.Equal(new[] { "허리 통증", "Rt knee OA", "" }, visit.SymptomLines.ToArray());
        var call = Assert.Single(db.Calls);
        Assert.Equal(new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "202610210000" }, call.Args);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);

        Assert.Null(InjectionReader.ReadLastBefore(new FakeDb().Answer(InjectionSql.LastBeforeSql, _ => new object?[][] { }), Chart, Today));
        Assert.Null(InjectionReader.ReadLastBefore(new FakeDb().Answer(InjectionSql.LastBeforeSql, _ => new[] { new object?[] { "V9", "bad", 1, "허리" } }), Chart, Today));
    }

    // ── 서비스 ─────────────────────────────

    private static FakeDb Db(object?[][] visits, object?[][] lines, object?[][]? xray = null, object?[][]? before = null) =>
        new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => visits)
            .Answer(InjectionSql.LinesSql, _ => lines)
            .Answer(InjectionSql.XraySql, _ => xray ?? new object?[][] { })
            .Answer(InjectionSql.LastBeforeSql, _ => before ?? new object?[][] { });

    [Fact(DisplayName = "AC-7505.3 서비스: 주사 결과 → (30일 안 증상 없으면 그 전 마지막 내원) → 영상 읽기 → 합치기")]
    public void ServiceComposes()
    {
        var visit = new[] { new object?[] { "V1", "202611131000", "" } };
        var knee = new[] { new object?[] { "V1", 1, "오른쪽 무릎 2차 주사" }, new object?[] { "V1", 2, "허리도 아프다" } };

        var db = Db(visit, knee, new[] { new object?[] { "G45", "202501020900" } });
        var result = InjectionMemoService.Compute(db, Chart, "", Today);
        Assert.Equal("오)무릎 3차 xr1년경과", result.Text);
        Assert.Equal(new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql, InjectionSql.XraySql }, db.Sqls.ToArray());

        var old = Db(visit, new object?[][] { }, before: new[] { new object?[] { "V0", "202604011000", 1, "허리 통증" } });
        var fromBefore = InjectionMemoService.Compute(old, Chart, "", Today);
        Assert.Equal(MemoResultKind.Insert, fromBefore.Kind);
        Assert.Equal("허리 xr2년경과", fromBefore.Text);
        Assert.Equal(MemoResultKind.NoRecord, fromBefore.Reason!.Kind);
        Assert.Equal(new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql, InjectionSql.LastBeforeSql, InjectionSql.XraySql }, old.Sqls.ToArray());

        var already = InjectionMemoService.Compute(Db(visit, knee), Chart, "오)무릎 2차", Today);
        Assert.Equal("무릎 xr1년경과 허리 xr2년경과", already.Text);
        Assert.Equal("/무릎 xr1년경과 허리 xr2년경과", already.Append);
        Assert.Equal(MemoResultKind.AlreadyHas, already.Reason!.Kind);
    }

    [Fact(DisplayName = "AC-7505.3 서비스: 칸에 주사 차수와 'xr'이 다 있으면 DB를 읽지 않고 이미 있음")]
    public void ServiceSkipsWhenMemoHasBoth()
    {
        var db = new FakeDb();
        Assert.Equal(MemoResultKind.AlreadyHas, InjectionMemoService.Compute(db, Chart, "오)무릎 2차 xr1년경과", Today).Kind);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-7503.3 경과 부위(XrayDue)도 ToString에 부위 글을 남기지 않음")]
    public void XrayDueHidesPart()
    {
        Assert.DoesNotContain("무릎", new XrayDue("무릎", 1).ToString());
    }

    [Fact(DisplayName = "AC-7506.1 서비스: 칸에 'xr'이 있거나 부위가 없으면 영상은 안 읽고, 영상·그 전 내원 읽기 실패는 전체가 읽기 실패")]
    public void ServiceSkipsAndFails()
    {
        var visit = new[] { new object?[] { "V1", "202611131000", "" } };
        var knee = new[] { new object?[] { "V1", 1, "오른쪽 무릎 2차 주사" } };

        var hasXr = Db(visit, knee);
        Assert.Equal("오)무릎 3차", InjectionMemoService.Compute(hasXr, Chart, "xr 오늘", Today).Text);
        Assert.Equal(new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql }, hasXr.Sqls.ToArray());

        var noPart = Db(visit, new[] { new object?[] { "V1", 1, "3차 주사 합니다" } });
        Assert.Equal("3차", InjectionMemoService.Compute(noPart, Chart, "", Today).Text);
        Assert.DoesNotContain(InjectionSql.XraySql, noPart.Sqls);

        var xrayFails = Db(visit, knee).Fail(InjectionSql.XraySql, BitErrors.ReadFailed);
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(xrayFails, Chart, "", Today).Kind);
        var beforeFails = Db(visit, new object?[][] { }).Fail(InjectionSql.LastBeforeSql, BitErrors.ReadFailed);
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(beforeFails, Chart, "", Today).Kind);
    }
}
