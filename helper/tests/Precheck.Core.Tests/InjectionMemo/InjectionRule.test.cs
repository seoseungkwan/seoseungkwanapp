using System;
using Precheck.Core.InjectionMemo;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>
/// spec injection-memo REQ-7501 차수 규칙(InjectionRule.Decide). 오늘은 2026-11-20, 증상 글·메모는 모두 지어낸 것(모양만 notes 그대로).
/// </summary>
public class InjectionRuleTests
{
    // ── AC-7501.1 메모 글 모양 ─────────────────────────────

    [Fact(DisplayName = "AC-7501.1 '<좌우>)<부위> N차': '주사' 말·차수 뒤 덧붙이('+ FNB')는 빼고 오른쪽 → 오)")]
    public void DropsInjectionWordAndTrailer()
    {
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "오른쪽 무릎 2차 주사 + FNB")));
        Assert.Equal("오)어깨 2차", Inserted(Visit(7, "", "오른쪽 어깨 1차 + SSNB")));
    }

    [Fact(DisplayName = "AC-7501.1 좌우: 오른쪽·Rt → 오), 왼쪽·Lt → 왼), 양측·양 → 양)")]
    public void Sides()
    {
        Assert.Equal("왼)어깨 3차", Inserted(Visit(7, "", "왼쪽 어깨 2차")));
        Assert.Equal("왼)어깨 2차", Inserted(Visit(7, "", "Lt shoulder 1차")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt knee 2차 주사")));
        Assert.Equal("양)무릎 2차", Inserted(Visit(7, "", "양측 무릎 1차 주사")));
        Assert.Equal("양)아라간 2차", Inserted(Visit(7, "", "양 아라간 1차 + FNB")));
    }

    [Fact(DisplayName = "AC-7501.1 목·허리처럼 가운데 부위만이면 좌우 없음, 영어 부위 말은 우리말(neck → 목)")]
    public void AxialPartsHaveNoSide()
    {
        Assert.Equal("목 3차", Inserted(Visit(7, "", "neck 2차 주사 시행")));
        Assert.Equal("허리 4차", Inserted(Visit(7, "", "허리 MBB 3차")));
        Assert.Equal("허리 2차", Inserted(Visit(7, "", "Rt L5 SNB 1차 주사")));
    }

    [Fact(DisplayName = "AC-7501.1 영어 부위 말: shoulder → 어깨, knee·OA → 무릎, elbow → 팔꿈치, wrist → 손목, ankle → 발목, LBP → 허리")]
    public void EnglishParts()
    {
        Assert.Equal("왼)어깨 2차", Inserted(Visit(7, "", "Lt shoulder 1차")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(7, "", "Rt knee 1차")));
        Assert.Equal("왼)팔꿈치 2차", Inserted(Visit(7, "", "Lt elbow 1차")));
        Assert.Equal("오)손목 2차", Inserted(Visit(7, "", "Rt wrist 1차")));
        Assert.Equal("왼)발목 2차", Inserted(Visit(7, "", "Lt ankle 1차")));
        Assert.Equal("허리 2차", Inserted(Visit(7, "", "LBP 1차")));
    }

    [Fact(DisplayName = "AC-7501.1 신경차단 이름(FNB·SNB·MBB·SSNB·ANB·TPI)은 빼고 부위는 그 줄·다른 줄에서(SSNB → 어깨)")]
    public void NerveBlockNamesAreDropped()
    {
        Assert.Equal("오)어깨 2차", Inserted(Visit(7, "", "Rt SSNB 1차")));
        Assert.Equal("왼)무릎 2차", Inserted(Visit(7, "", "Lt knee pain", "SNB 1차")));
        Assert.Equal("왼)무릎 2차", Inserted(Visit(7, "", "Lt knee pain", "TPI 1차")));
    }

    [Fact(DisplayName = "AC-7501.1 약 이름만 있는 줄은 약 이름만(양측 아라간 1차 → 양)아라간 2차, + DNA 2차 → DNA 3차)")]
    public void DrugOnlyLines()
    {
        Assert.Equal("양)아라간 2차", Inserted(Visit(7, "", "양측 아라간 1차")));
        Assert.Equal("DNA 3차", Inserted(Visit(7, "", "+ DNA 2차")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt knee injection 2차")));
    }

    [Fact(DisplayName = "AC-7501.1 한 줄에 부위와 약 이름이 같이 있으면 부위 뒤에 띄어 씀(Lt knee DNA 1차 → 왼)무릎 DNA 2차, 2026-11-20 사용자)")]
    public void PartThenDrugWithSpace()
    {
        Assert.Equal("왼)무릎 DNA 2차", Inserted(Visit(7, "", "Lt knee DNA 1차")));
        Assert.Equal("오)무릎 DNA 2차", Inserted(Visit(7, "", "우측 무릎 DNA 1차")));
        Assert.Equal("양)무릎,발목 DNA 2차", Inserted(Visit(7, "", "양측 무릎 발목 DNA 2차 주사 합니다")));
        Assert.Equal("오)어깨 PDRN 3차", Inserted(Visit(7, "", "Rt shoulder PDRN 2차")));
        Assert.Equal("DNA 2차", Inserted(Visit(7, "", "DNA 1차")));
        Assert.Equal("오)DNA 2차", Inserted(Visit(7, "", "Rt DNA 1차")));
    }

    [Fact(DisplayName = "AC-7501.1 좌우 줄임말 뒤 점('Rt.'·'Lt.')에서 조각을 나누지 않음(Rt. knee 2차 주사 → 오)무릎 3차)")]
    public void SideAbbreviationDot()
    {
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee 2차 주사")));
        Assert.Equal("왼)어깨 2차", Inserted(Visit(7, "", "Lt. 어깨 1차 주사")));
        Assert.Equal("양)무릎 2차", Inserted(Visit(7, "", "Bil. knee inj. 1차")));
    }

    // ── AC-7501.2 번호 ─────────────────────────────

    [Fact(DisplayName = "AC-7501.2 그날 한 것은 +1 ('양 아라간 1차 + FNB' → 2차, '2차 주사 시행' → 3차)")]
    public void DoneTodayAddsOne()
    {
        Assert.Equal("양)아라간 2차", Inserted(Visit(7, "", "양 아라간 1차 + FNB")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee OA", "2차 주사 시행")));
    }

    [Fact(DisplayName = "AC-7501.2 다음 계획은 그대로: 'N차 주사 합니다'·간격('1주뒤'·'1주일 뒤'·'1개월 뒤')·요일('다음주 화'·'금')·'다음'")]
    public void PlansKeepNumber()
    {
        Assert.Equal("왼)어깨 3차", Inserted(Visit(7, "", "Lt. shoulder pain", "3차 주사 합니다")));
        Assert.Equal("왼)무릎 2차", Inserted(Visit(7, "", "Lt. knee pain", "1주뒤 2차 주사")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(7, "", "Rt. knee OA", "1주일 뒤 2차 주사")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(30, "", "Rt. knee OA", "1개월 뒤 2차 주사")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee OA", "다음주 화 3차")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee OA", "금 3차")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee OA", "다음 3차 주사 예정")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "Rt. knee OA", "다음주 월/목 3차주")));
    }

    [Fact(DisplayName = "AC-7501.2 번호가 둘이면 앞 번호('금요일 2차/다음주 화 3차' → 2차), 계획이 앞이면 계획 번호")]
    public void TwoNumbersTakeTheFirst()
    {
        Assert.Equal("오)무릎 2차", Inserted(Visit(7, "", "Rt. knee OA", "금요일 2차/다음주 화 3차")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(7, "", "Rt. knee OA", "금 2차, 화 3차")));
        // 앞 번호(다음 계획 4차)가 뒤 줄의 그날 한 것(2차 → 3차)보다 먼저다
        Assert.Equal("오)무릎 4차", Inserted(Visit(7, "", "다음주 금 4차", "오른쪽 무릎 2차 시행")));
        // 앞이 그날 한 것이면 +1
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "오른쪽 무릎 2차 시행", "다음주 금 4차")));
    }

    [Fact(DisplayName = "AC-7501.2 'N차까지'만이면 30일 안 지난 접수 메모의 주사 차수 +1, N을 넘으면 끝남(N), 지난 메모에 번호 없으면 기록 없음")]
    public void UntilUsesLastMemo()
    {
        Assert.Equal("오)무릎 3차", Inserted(Visit(14, "오)무릎 2차", "Rt. knee OA", "1주간격 5차까지 주사합니다")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(21, "오)무릎 2차 주사", "Rt. knee OA"), Visit(14, "", "Rt. knee OA", "1주간격 5차까지 주사합니다")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(14, "물리치료/오)무릎 2차", "Rt. knee OA", "5차까지 주사")));

        var finished = Decide(Visit(14, "오)무릎 5차", "Rt. knee OA", "1주간격 5차까지 주사합니다"));
        Assert.Equal(MemoResultKind.Finished, finished.Kind);
        Assert.Equal(5, finished.UntilNumber);
        Assert.Equal("", finished.Text);

        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(14, "물리치료", "Rt. knee OA", "1주간격 5차까지 주사합니다")).Kind);
        // 지난 메모의 ESWT·도수 차수는 주사 번호가 아니다
        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(14, "ESWT 2차", "Rt. knee OA", "1주간격 5차까지 주사합니다")).Kind);
    }

    [Fact(DisplayName = "AC-7501.2 'N차까지'와 다른 차수가 함께 있으면 다른 차수를 쓴다(뒤에 있어도)")]
    public void UntilOnlyWhenAlone()
    {
        Assert.Equal("오)무릎 2차", Inserted(Visit(14, "", "오른쪽 무릎 1차 주사 시행. 1주간격 5차까지")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(14, "", "Rt. knee OA", "5차까지 주사", "2차 시행")));
    }

    [Fact(DisplayName = "AC-7501.2 'N차까지'의 지난 메모는 30일 안 메모 중 마지막(차수 기록 내원 뒤에 온 내원 메모도 본다)")]
    public void UntilUsesLatestMemoInWindow()
    {
        Assert.Equal("오)무릎 4차", Inserted(
            Visit(14, "오)무릎 2차", "Rt. knee OA", "1주간격 5차까지 주사합니다"),
            Visit(7, "오)무릎 3차", "물리치료 시행")));
        Assert.Equal(MemoResultKind.Finished, Decide(
            Visit(14, "오)무릎 4차", "Rt. knee OA", "1주간격 5차까지 주사합니다"),
            Visit(7, "오)무릎 5차", "물리치료 시행")).Kind);
        // 30일 넘은 메모는 안 본다
        Assert.Equal(MemoResultKind.NoRecord, Decide(
            Visit(40, "오)무릎 2차", "물리치료 시행"),
            Visit(14, "", "Rt. knee OA", "1주간격 5차까지 주사합니다")).Kind);
    }

    // ── AC-7501.3 어느 내원·부위 ─────────────────────────────

    [Fact(DisplayName = "AC-7501.3 주사 차수가 적힌 마지막 내원 하나를 쓴다(뒤 내원에 차수가 없으면 그 앞)")]
    public void LastVisitWithCount()
    {
        Assert.Equal("왼)어깨 3차", Inserted(
            Visit(20, "", "오른쪽 무릎 1차 주사"),
            Visit(10, "", "왼쪽 어깨 2차 주사"),
            Visit(5, "", "물리치료 시행")));
        // 날짜순이 아니어도 날짜가 늦은 내원
        Assert.Equal("왼)어깨 3차", Inserted(Visit(10, "", "왼쪽 어깨 2차 주사"), Visit(20, "", "오른쪽 무릎 1차 주사")));
    }

    [Fact(DisplayName = "AC-7501.3 ESWT·도수·충격파 차수는 빼고 그 앞 주사 차수")]
    public void NonInjectionCountsAreSkipped()
    {
        Assert.Equal("오)무릎 2차", Inserted(
            Visit(10, "", "오른쪽 무릎 1차 주사"),
            Visit(5, "", "ESWT 3차"),
            Visit(4, "", "3차 ESWT"),
            Visit(3, "", "도수 2차"),
            Visit(2, "", "충격파 4차")));
    }

    [Fact(DisplayName = "AC-7501.3 30일 안에 주사 차수가 없으면 기록 없음(31일 앞·오늘 내원은 안 봄, 30일 앞은 봄)")]
    public void NoRecord()
    {
        Assert.Equal(MemoResultKind.NoRecord, Decide().Kind);
        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(5, "오)무릎 2차", "물리치료 시행")).Kind);
        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(31, "", "오른쪽 무릎 1차 주사")).Kind);
        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(0, "", "오른쪽 무릎 1차 주사")).Kind);
        Assert.Equal(MemoResultKind.NoRecord, Decide(Visit(5, "", "ESWT 3차", "도수 2차")).Kind);
        Assert.Equal("오)무릎 2차", Inserted(Visit(30, "", "오른쪽 무릎 1차 주사")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(7, "", "오른쪽 무릎 2차 주사"), Visit(0, "", "오른쪽 무릎 5차 주사")));
        Assert.Equal("", Decide().Text);
        Assert.Null(Decide().PlannedDate);
    }

    [Fact(DisplayName = "AC-7501.3 부위: 차수 줄 앞말이 먼저(다른 줄 부위는 안 붙임)")]
    public void PrefixPartFirst()
    {
        Assert.Equal("오)어깨 3차", Inserted(Visit(7, "", "Lt. knee pain", "오른쪽 어깨 2차 주사")));
    }

    [Fact(DisplayName = "AC-7501.3 부위: 앞말이 없으면 같은 내원의 주사 말이 든 줄, 그래도 없으면 다른 줄, 여러 개면 쉼표로")]
    public void PartFromOtherLines()
    {
        Assert.Equal("오)어깨 3차", Inserted(Visit(7, "", "Lt. knee pain", "Rt. shoulder 아라간 주사", "2차 시행")));
        Assert.Equal("오)어깨,목 3차", Inserted(Visit(7, "", "Rt. shoulder pain", "neck pain", "2차 주사 시행")));
        Assert.Equal("목,허리 3차", Inserted(Visit(7, "", "neck pain", "LBP", "2차 주사 시행")));
    }

    // ── AC-7501.4 간격·일찍 옴 ─────────────────────────────

    [Fact(DisplayName = "AC-7501.4 '1주뒤' 계획보다 3일 넘게 일찍 오면 일찍 옴(계획 날짜와 함께), 3일 안이면 넣음")]
    public void TooEarlyWithThreeDaysGrace()
    {
        var early = Decide(Visit(2, "", "Rt. knee OA", "1주뒤 2차 주사"));
        Assert.Equal(MemoResultKind.TooEarly, early.Kind);
        Assert.Equal(Day(11, 25), early.PlannedDate);
        Assert.Equal("", early.Text);

        var stillEarly = Decide(Visit(3, "", "Rt. knee OA", "1주뒤 2차 주사"));
        Assert.Equal(MemoResultKind.TooEarly, stillEarly.Kind);
        Assert.Equal(Day(11, 24), stillEarly.PlannedDate);

        // 계획 11-23, 오늘 11-20 = 3일 일찍 → 넣음
        Assert.Equal("오)무릎 2차", Inserted(Visit(4, "", "Rt. knee OA", "1주뒤 2차 주사")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(10, "", "Rt. knee OA", "1주뒤 2차 주사")));
    }

    [Fact(DisplayName = "AC-7501.4 간격 말: 숫자 + 주·주일·일·개월·달·wk·week + 뒤·후·간격·마다")]
    public void GapWords()
    {
        Assert.Equal(Day(11, 24), Decide(Visit(10, "", "Rt. knee OA", "2주 후 3차 주사")).PlannedDate);
        Assert.Equal(Day(11, 24), Decide(Visit(1, "", "Rt. knee OA", "5일 뒤 3차 주사")).PlannedDate);
        Assert.Equal(Day(11, 30), Decide(Visit(20, "", "Rt. knee OA", "1개월 뒤 3차 주사")).PlannedDate);
        Assert.Equal(Day(11, 29), Decide(Visit(5, "", "Rt. knee OA", "2wk 후 3차 주사")).PlannedDate);
        Assert.Equal(Day(11, 25), Decide(Visit(2, "", "Rt. knee OA", "1주마다 3차 주사")).PlannedDate);
        Assert.Equal(Day(11, 25), Decide(Visit(2, "", "Rt. knee OA", "1 week 간격 3차 주사")).PlannedDate);
        Assert.Equal(new[] { "TooEarly", "TooEarly", "TooEarly", "TooEarly", "TooEarly" }, Kinds(
            Decide(Visit(10, "", "Rt. knee OA", "2주 후 3차 주사")),
            Decide(Visit(1, "", "Rt. knee OA", "5일 뒤 3차 주사")),
            Decide(Visit(20, "", "Rt. knee OA", "1개월 뒤 3차 주사")),
            Decide(Visit(5, "", "Rt. knee OA", "2wk 후 3차 주사")),
            Decide(Visit(2, "", "Rt. knee OA", "1주마다 3차 주사"))));
        // 계획 날짜 - 3일 이후면 넣음
        Assert.Equal("오)무릎 3차", Inserted(Visit(28, "", "Rt. knee OA", "1달 후 3차 주사")));
        Assert.Equal("오)무릎 3차", Inserted(Visit(6, "", "Rt. knee OA", "1주일 간격 3차 주사")));
    }

    [Fact(DisplayName = "AC-7501.4 간격이 차수 조각에 없으면 그 증상 줄 전체에서 찾는다")]
    public void GapFromWholeLine()
    {
        var early = Decide(Visit(5, "", "Rt knee 2차 주사 시행. 2주 후 f/u"));
        Assert.Equal(MemoResultKind.TooEarly, early.Kind);
        Assert.Equal(Day(11, 29), early.PlannedDate);
        Assert.Equal("오)무릎 3차", Inserted(Visit(12, "", "Rt knee 2차 주사 시행. 2주 후 f/u")));
    }

    [Fact(DisplayName = "AC-7501.4 간격이 없으면 다음 날 와도 넣고, 'N주째'(지난 기간)는 간격이 아니다")]
    public void NoGapAlwaysInserts()
    {
        Assert.Equal("오)무릎 3차", Inserted(Visit(1, "", "오른쪽 무릎 2차 주사")));
        Assert.Equal("오)무릎 2차", Inserted(Visit(1, "", "Rt. knee OA", "3주째 2차 주사")));
    }

    [Fact(DisplayName = "AC-7501.4 여유 날 수는 바꿀 수 있다(0일이면 계획 날 전에는 일찍 옴)")]
    public void GraceDaysParameter()
    {
        var visits = new[] { Visit(4, "", "Rt. knee OA", "1주뒤 2차 주사") };
        Assert.Equal(MemoResultKind.Insert, InjectionRule.Decide(visits, Today).Kind);
        Assert.Equal(MemoResultKind.Insert, InjectionRule.Decide(visits, Today, 3).Kind);
        Assert.Equal(MemoResultKind.TooEarly, InjectionRule.Decide(visits, Today, 0).Kind);
        Assert.Equal(3, InjectionRule.DefaultGraceDays);
        Assert.Equal(30, InjectionRule.WindowDays);
    }

    // ── AC-7501.5 모양별 지어낸 예 ─────────────────────────────

    [Theory(DisplayName = "AC-7501.5 시안 '기록 → 메모 글' 4줄(11-13 기록, 오늘 11-20)")]
    [InlineData("오른쪽 무릎 2차 주사 + FNB", "오)무릎 3차")]
    [InlineData("Lt. shoulder pain|3차 주사 합니다", "왼)어깨 3차")]
    [InlineData("neck 2차 주사 시행", "목 3차")]
    [InlineData("양측 아라간 1차", "양)아라간 2차")]
    public void MockupExamples(string lines, string expected)
    {
        Assert.Equal(expected, Inserted(Lines(7, "", lines)));
    }

    [Theory(DisplayName = "AC-7501.5 30일 대조 모양(notes): 넣는 글")]
    [InlineData("양 아라간 1차 + FNB", "", "양)아라간 2차")]
    [InlineData("Lt. knee pain|1주뒤 2차 주사", "", "왼)무릎 2차")]
    [InlineData("Lt. shoulder pain|2차 주사 합니다", "", "왼)어깨 2차")]
    [InlineData("+ DNA 2차", "", "DNA 3차")]
    [InlineData("Rt. knee OA|금요일 2차/다음주 화 3차", "", "오)무릎 2차")]
    [InlineData("Rt. knee OA|1주간격 5차까지 주사합니다", "오)무릎 2차", "오)무릎 3차")]
    [InlineData("Rt. knee OA|다음주 월/목 3차주", "", "오)무릎 3차")]
    [InlineData("Rt. knee OA|금 3차", "", "오)무릎 3차")]
    [InlineData("Rt. shoulder pain|neck pain|2차 주사 시행", "", "오)어깨,목 3차")]
    public void NoteShapes(string lines, string memo, string expected)
    {
        Assert.Equal(expected, Inserted(Lines(7, memo, lines)));
    }

    [Theory(DisplayName = "AC-7501.5 30일 대조 모양(notes): 넣지 않는 것")]
    [InlineData("ESWT 3차", "", MemoResultKind.NoRecord)]
    [InlineData("도수 2차", "", MemoResultKind.NoRecord)]
    [InlineData("충격파 4차", "", MemoResultKind.NoRecord)]
    [InlineData("물리치료 시행", "오)무릎 2차", MemoResultKind.NoRecord)]
    [InlineData("Rt. knee OA|1주간격 3차까지 주사합니다", "오)무릎 3차", MemoResultKind.Finished)]
    [InlineData("Rt. knee OA|1주간격 3차까지 주사합니다", "", MemoResultKind.NoRecord)]
    public void NoteShapesNotInserted(string lines, string memo, MemoResultKind expected)
    {
        Assert.Equal(expected, Decide(Lines(7, memo, lines)).Kind);
    }

    [Fact(DisplayName = "AC-7501.5 일찍 옴 모양: '1주뒤 N차' 기록 이틀 뒤")]
    public void NoteShapeTooEarly()
    {
        var result = Decide(Lines(2, "", "Lt. knee pain|1주뒤 2차 주사"));
        Assert.Equal(MemoResultKind.TooEarly, result.Kind);
        Assert.Equal(Day(11, 25), result.PlannedDate);
    }

    [Fact(DisplayName = "AC-7501.5 내원 기록은 비어도 된다(빈 줄·null 줄·null 메모)")]
    public void NullSafe()
    {
        Assert.Equal(MemoResultKind.NoRecord, InjectionRule.Decide(new[] { new VisitNote(Today.AddDays(-3), new string[0], null!) }, Today).Kind);
        Assert.Equal("오)무릎 3차", InjectionRule.Decide(new[] { new VisitNote(Today.AddDays(-3), new[] { null!, "", "오른쪽 무릎 2차 주사" }, null!) }, Today).Text);
        Assert.Equal(MemoResultKind.NoRecord, InjectionRule.Decide(new[] { new VisitNote(Today.AddDays(-3), null!, "") }, Today).Kind);
        Assert.Throws<ArgumentNullException>(() => InjectionRule.Decide(null!, Today));
    }
}
