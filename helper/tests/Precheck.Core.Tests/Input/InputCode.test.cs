using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// 처방코드 입력·조회 모드(TASK-36, REQ-036). 가짜 비트 화면으로만 본다. 안내창을 누르는 길과 진짜 칸은 Windows 시험·의원 PC 시험이다.
/// 자료는 모두 지어낸 것이다.
/// </summary>
public class InputCodeTests
{
    private const string Code = "LA358";
    private const string UncheckExcept = "U차트 내원내역의 처방 '제외' 체크를 풀어 주세요.";
    private const string CodeDiffers = "U차트 내원내역의 처방코드 칸(KK010)이 입력할 코드(LA358)와 다릅니다. 같은 코드로 맞추거나 비워 주세요.";
    private const string ClearLa = "U차트 내원내역의 처방코드 칸(LA358)을 비워 주세요.";
    private const string ClearKk = "U차트 내원내역의 처방코드 칸(KK010)을 비워 주세요.";
    private const string NotAccepted = "메모 칸이 입력을 받지 않아 입력하지 못했습니다";
    private const string WriteUnknown = "입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.";
    private const string WriteNotConfirmed = "청구메모 입력을 확인하지 못해 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.";
    private const string NoWrite = "청구메모 칸이 편집할 수 없는 상태입니다.";

    private static InputResult Of(InputOutcome outcome, string visitKey) => RunnerRig.ResultOf(outcome, visitKey);

    private static ListFilter Box(string? code, bool? except) => new ListFilter("2026-01-01", "2026-12-31", code, except, null);

    /// <summary>안내창을 눌러 열었고 칸이 글을 받지 않는다. 메모는 건드리지 않는다.</summary>
    private static void NotAcceptingBox(RunnerRig rig)
    {
        rig.Ui.OpensInViewMode = true;
        rig.Ui.ReplaceWorks = false;
        rig.Ui.ValueWorks = false;
    }

    /// <summary>둘째로 여는 사람부터는 보통 화면이다.</summary>
    private static void NormalFromSecondOpen(RunnerRig rig)
    {
        rig.Ui.OnCall = (call, number) =>
        {
            if (call != "open" || number != 2) return;
            rig.Ui.OpensInViewMode = false;
            rig.Ui.Editable = true;
            rig.Ui.ReplaceWorks = true;
            rig.Ui.ValueWorks = true;
        };
    }

    // AC-036.1 : 고른 코드의 모양

    [Theory(DisplayName = "AC-036.1 코드는 없어도 되고, 있으면 도우미가 처방 코드를 읽을 때 쓰는 것과 같은 허용 목록이면 받는다(영문 대문자·숫자로 시작, 20자까지)")]
    [InlineData(null)]
    [InlineData("LA358")]
    [InlineData("0")]
    [InlineData("A")]
    [InlineData("1.2-3")]
    [InlineData("ABCDEFGHIJ0123456789")]
    public void GoodCode(string? code) => BatchCheck.ValidateCode(code);

    [Theory(DisplayName = "AC-036.1 코드 모양이 틀리면 E-HELPER-BAD-MESSAGE: 빈 글자·소문자·한글·공백·제어 문자·끝 줄바꿈·21자")]
    [InlineData("")]
    [InlineData("la358")]
    [InlineData("처방코드")]
    [InlineData(" LA358")]
    [InlineData("LA358 ")]
    [InlineData("LA 358")]
    [InlineData(".LA358")]
    [InlineData("-LA358")]
    [InlineData("LA358\n")]
    [InlineData("LA358\r\n")]
    [InlineData("LA\u0007358")]
    [InlineData("ABCDEFGHIJ0123456789X")]
    public void BadCode(string code)
    {
        var error = Assert.ThrowsAny<HelperException>(() => BatchCheck.ValidateCode(code));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
    }

    [Theory(DisplayName = "AC-036.1 코드가 틀린 묶음은 창도 비트 조작도 기록도 없다(끝에 줄바꿈이 붙은 코드 포함): 창 글에 닿지 않는다")]
    [InlineData("LA358\n")]
    [InlineData("la358")]
    [InlineData("처방코드")]
    public void BadCodeTouchesNothing(string code)
    {
        var rig = new RunnerRig();
        var error = Assert.ThrowsAny<HelperException>(() => rig.Run(Sample.Items(1), code));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(new[] { "fingerprint" }, rig.Ui.Calls);
        Assert.Empty(rig.Journal.Marks);
    }

    public static IEnumerable<object?[]> BadCodeValues()
    {
        yield return new object?[] { "LA358\n" };
        yield return new object?[] { "la358" };
        yield return new object?[] { "" };
        yield return new object?[] { "처방코드" };
        yield return new object?[] { null };
        yield return new object?[] { 358 };
    }

    [Theory(DisplayName = "AC-036.1 명령부터: 틀린 코드(끝 줄바꿈·소문자·빈 글자·한글·null·숫자)는 잠금도 등록 확인도 창도 없이 E-HELPER-BAD-MESSAGE 하나로 답한다")]
    [MemberData(nameof(BadCodeValues))]
    public void BadCodeFromWeb(object? code)
    {
        using var rig = new WiringRig { EditPayload = payload => payload["code"] = code };

        var reply = Assert.Single(rig.Send(new[] { Sample.Item(1) }, null));

        Assert.Equal(ErrorCodes.BadMessage, reply.GetProperty("code").GetString());
        Assert.Empty(rig.Steps);
        Assert.Empty(rig.Bit.Connector.Opened);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
    }

    [Fact(DisplayName = "AC-036.1 도우미는 코드로 진료를 다시 거르지 않는다: 받은 사람을 모두 연다")]
    public void CodeDoesNotFilterPeople()
    {
        var rig = new RunnerRig();
        var outcome = rig.Run(Sample.Items(3), Code);
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(3, rig.Ui.Opens);
        Assert.All(outcome.Results, result => Assert.Equal(InputResults.Done, result.Result));
    }

    // AC-036.2 : 내원내역 칸

    [Theory(DisplayName = "AC-036.2 처방코드 칸(null·빈칸·같음·다름) × 고른 코드(있음·없음) × 제외(켜짐·꺼짐·못 읽음)")]
    // 코드 있음
    [InlineData(null, Code, true, UncheckExcept)]
    [InlineData(null, Code, false, null)]
    [InlineData(null, Code, null, null)]
    [InlineData("", Code, true, UncheckExcept)]
    [InlineData("", Code, false, null)]
    [InlineData("", Code, null, null)]
    [InlineData("la358", Code, true, UncheckExcept)]
    [InlineData("la358", Code, false, null)]
    [InlineData("la358", Code, null, UncheckExcept)]
    [InlineData("KK010", Code, true, CodeDiffers)]
    [InlineData("KK010", Code, false, CodeDiffers)]
    [InlineData("KK010", Code, null, CodeDiffers)]
    // 코드 없음
    [InlineData(null, null, true, UncheckExcept)]
    [InlineData(null, null, false, null)]
    [InlineData(null, null, null, null)]
    [InlineData("", null, true, UncheckExcept)]
    [InlineData("", null, false, null)]
    [InlineData("", null, null, null)]
    [InlineData("LA358", null, true, ClearLa)]
    [InlineData("LA358", null, false, ClearLa)]
    [InlineData("LA358", null, null, ClearLa)]
    [InlineData("KK010", null, true, ClearKk)]
    [InlineData("KK010", null, false, ClearKk)]
    [InlineData("KK010", null, null, ClearKk)]
    public void ListBox(string? box, string? code, bool? except, string? expected) =>
        Assert.Equal(expected, ChartRules.ListProblem(Box(box, except), Sample.Items(2), code));

    [Fact(DisplayName = "AC-036.2 칸 글은 앞뒤 공백을 떼고 견주고(공백뿐이면 빈칸), 글자 그대로의 대문자도 같은 코드다")]
    public void ListBoxTrims()
    {
        Assert.Null(ChartRules.ListProblem(Box("  ", null), Sample.Items(1), Code));
        Assert.Null(ChartRules.ListProblem(Box(" LA358 ", false), Sample.Items(1), Code));
        Assert.Null(ChartRules.ListProblem(Box("LA358", false), Sample.Items(1), Code));
        Assert.Equal(ClearLa, ChartRules.ListProblem(Box(" LA358 ", false), Sample.Items(1)));
    }

    [Fact(DisplayName = "AC-036.2 기간 문제가 있으면 기간 문구가 먼저다(원본 차례)")]
    public void PeriodFirst()
    {
        var problem = ChartRules.ListProblem(new ListFilter("2026-11-01", "2026-11-30", "KK010", true, null), Sample.Items(1), Code);
        Assert.StartsWith("기간이 다릅니다.", problem, StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-036.2 칸이나 제외 체크에 걸리면 아무도 열기 전에 멈춘다: 진행 숫자도 쓰기도 없고 모두 미처리")]
    [InlineData("KK010", false, Code, CodeDiffers)]
    [InlineData("LA358", false, null, ClearLa)]
    [InlineData("", true, Code, UncheckExcept)]
    [InlineData("", true, null, UncheckExcept)]
    [InlineData("LA358", null, Code, UncheckExcept)]
    public void ListBoxStopsBeforeAnyone(string box, bool? except, string? code, string expected)
    {
        var rig = new RunnerRig();
        rig.Ui.Filter = Box(box, except);

        var outcome = rig.Run(Sample.Items(2), code);

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(expected, outcome.Reason);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(rig.Progress.Reports);
        Assert.All(outcome.Results, result => Assert.Equal((InputResults.Check, "미처리"), (result.Result, result.Reason)));
    }

    [Fact(DisplayName = "AC-036.2 AC-036.3 명령부터 끝까지: 코드가 창 글과 내원내역 칸 검사에 닿는다")]
    public void CodeReachesWindowAndList()
    {
        using var rig = new WiringRig { EditPayload = payload => payload["code"] = Code };
        rig.Ui.Filter = Box("KK010", false);

        var (_, stopped) = rig.Run(Sample.Item(1));

        Assert.Equal("stopped", stopped.GetProperty("status").GetString());
        Assert.Equal(CodeDiffers, stopped.GetProperty("reason").GetString());
        Assert.Contains("처방코드 LA358", rig.Confirm.Shown[0].Text, StringComparison.Ordinal);
        Assert.Equal(0, rig.Ui.Opens);

        rig.Ui.Filter = Box("la358", false);
        var (_, finished) = rig.Run(Sample.Item(1));

        Assert.Equal("finished", finished.GetProperty("status").GetString());
        Assert.Equal(1, rig.Ui.Opens);
    }

    // AC-036.3 : PC 확인 창 글 · 묶음 순서

    [Fact(DisplayName = "AC-036.3 코드가 있으면 글에 '처방코드 {코드}'가 나오고 주의 줄은 '처방코드 칸은 비우거나 {코드}로 맞추고, 상병 검색칸은 비워 두세요'다")]
    public void PromptWithCode()
    {
        var text = InputPrompt.Build(Sample.Items(2), Sample.Registration, code: Code);
        Assert.Contains("처방코드 LA358\r\n", text, StringComparison.Ordinal);
        Assert.Contains("처방코드 칸은 비우거나 LA358로 맞추고, 상병 검색칸은 비워 두세요", text, StringComparison.Ordinal);
        Assert.DoesNotContain("처방코드·상병 검색칸은 비워 두세요", text, StringComparison.Ordinal);
        Assert.Contains("10/27, 2명 입력할까요?", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-036.3 AC-017.12 코드가 없으면 지금 글 그대로다(저장 안 한 처방 창 주의 줄만 더한다)")]
    public void PromptWithoutCode()
    {
        Assert.Equal(
            "비트에 청구메모를 입력할까요?\r\n\r\n10/27, 2명 입력할까요?\r\n기관기호 1234****\r\n\r\n주의\r\n"
            + "· 비트 내원내역 창을 10/27 기간이 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.\r\n"
            + "· 먼저 비트의 저장 안 한 작업을 마치세요. 내원내역 목록이 다른 창에 가려지면 멈춥니다.\r\n"
            + "· 저장하지 않은 처방 창이 뜨면 자동으로 [확인]을 누릅니다. 쓰던 처방이 있으면 먼저 저장해 주세요.\r\n"
            + "· 환자마다 열린 내원의 진료일이 맞을 때만 입력합니다.\r\n"
            + "· 비트에 다른 메모가 있으면 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 다만 불러온 뒤 달라진 메모, 우리 메모에 확인 표시가 남은 환자, [직접 확인했어요]를 누른 환자는 건너뜁니다.\r\n"
            + "· 입력하는 동안 마우스와 키보드를 쓰지 마세요.",
            InputPrompt.Build(Sample.Items(2), Sample.Registration));
    }

    [Fact(DisplayName = "AC-036.3 풀 사람만 있는 묶음의 창에도 코드가 나오고 입력을 묻는 글·주의 줄은 없다")]
    public void PromptReleaseOnlyWithCode()
    {
        var text = InputPrompt.Build(new InputItem[0], Sample.Registration, released: 2, code: Code);
        Assert.Contains("처방코드 LA358", text, StringComparison.Ordinal);
        Assert.Contains("직접 확인한 환자 2명의 입력 멈춤을 풀까요?", text, StringComparison.Ordinal);
        Assert.DoesNotContain("주의", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-036.3 창 글에 받은 코드 말고 환자 글자는 없다")]
    public void PromptHasNoPatientText()
    {
        var item = Sample.Item(1, memo: "가짜 메모 글자", visitKey: "visit-key-1");
        var text = InputPrompt.Build(new[] { item }, Sample.Registration, code: Code);
        foreach (var forbidden in new[] { item.Name, item.Chart, item.Memo, item.VisitKey })
        {
            Assert.DoesNotContain(forbidden, text, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-036.3 묶음 순서는 받은 차례 그대로다: 날짜나 코드로 다시 줄 세우지 않는다")]
    public void KeepsReceivedOrder()
    {
        var rig = new RunnerRig();
        var opened = new List<string>();
        rig.Ui.OpenOverride = (chart, _, __) =>
        {
            opened.Add(chart);
            return null;
        };
        var items = new[] { Sample.Item(3, date: "2026-10-29"), Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-28") };

        rig.Run(items, Code);

        Assert.Equal(items.Select(item => item.Chart), opened);
    }

    [Fact(DisplayName = "AC-036.3 AC-017.7 쓰다 멈춘 사람만 앞으로 오고 나머지는 받은 차례 그대로다")]
    public void OnlyStuckMovesFirst()
    {
        var rig = new RunnerRig();
        var opened = new List<string>();
        rig.Ui.OpenOverride = (chart, _, __) =>
        {
            opened.Add(chart);
            return null;
        };
        var items = new[] { Sample.Item(3, date: "2026-10-29"), Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-28") };
        rig.Journal.Mark(items[2], JournalState.WriteUnconfirmed);

        rig.Run(items, Code);

        Assert.Equal(new[] { items[2].Chart, items[0].Chart, items[1].Chart }, opened);
    }

    // AC-036.4 : 조회 모드 안내창의 판단

    [Fact(DisplayName = "AC-036.4 안내창: '현재 사용중입니다'와 '조회모드로 전환'이 함께 있을 때만이다(원본 test_only_the_in_use_view_mode_notice_is_recognised 사례, 공백 무시)")]
    public void RecognisesOnlyTheNotice()
    {
        const string notice = "[IP:0.0.0.0]DESKTOP-SYNTH '가상환자01' 환자는 '접수' 사용자가 'BITDoctorOrder' 에서 현재 사용중입니다. 조회모드로 전환합니다";
        Assert.True(ChartRules.IsViewModeNotice(new[] { "", notice, "확인" }));
        Assert.True(ChartRules.IsViewModeNotice(new[] { "현재 사용중 입니다.", "조회모드로  전환합니다" }));
        Assert.False(ChartRules.IsViewModeNotice(new[] { "저장되지 않은 처방이 있습니다.", "계속 진행하시겠습니까?" }));
        Assert.False(ChartRules.IsViewModeNotice(new[] { "현재 사용중입니다." }));
        Assert.False(ChartRules.IsViewModeNotice(new[] { "조회모드로 전환합니다" }));
        Assert.False(ChartRules.IsViewModeNotice(new string[0]));
        Assert.False(ChartRules.IsViewModeNotice(new string?[] { null }));
    }

    [Fact(DisplayName = "AC-036.4 AC-017.12 저장 안 한 처방 글이 든 창은 안내창 글이 함께 있어도 안내창이 아니다: 안내창 보기가 누르지 않는다")]
    public void UnsavedRxIsNeverTheNotice() =>
        Assert.False(ChartRules.IsViewModeNotice(new[] { "현재 사용중입니다. 조회모드로 전환합니다", "저장되지 않은 처방이 있습니다." }));

    [Theory(DisplayName = "AC-036.4 [확인] 단추: 원본 test_only_the_confirm_button_is_pressed 사례")]
    [InlineData("확인", true)]
    [InlineData("&확인", true)]
    [InlineData(" 확인 ", true)]
    [InlineData("확인(&O)", true)]
    [InlineData("취소", false)]
    [InlineData("확인하지 않음", false)]
    [InlineData("", false)]
    [InlineData("예", false)]
    [InlineData(null, false)]
    public void ConfirmButton(string? label, bool expected) => Assert.Equal(expected, ChartRules.IsConfirmButton(label));

    private sealed class StepClock : IWaitClock
    {
        public long NowMs { get; private set; }

        public void Sleep(int ms) => NowMs += ms;
    }

    [Fact(DisplayName = "AC-036.4 여는 동안 0.25초마다 보고 5번까지만 누른다(원본 interval·limit)")]
    public void WatchStopsAfterFive()
    {
        var clock = new StepClock();
        var seen = new List<long>();

        var pressed = ViewModeWatch.Run(clock, () => false, left =>
        {
            seen.Add(clock.NowMs);
            return 1;
        });

        Assert.Equal(5, pressed);
        Assert.Equal(new long[] { 250, 500, 750, 1000, 1250 }, seen);
    }

    [Fact(DisplayName = "AC-036.4 창이 여럿이어도 사람 하나에 5번을 넘겨 누르지 않는다: 남은 수만 넘긴다")]
    public void WatchPassesWhatIsLeft()
    {
        var left = new List<int>();

        var pressed = ViewModeWatch.Run(new StepClock(), () => false, remaining =>
        {
            left.Add(remaining);
            return Math.Min(remaining, 3);
        });

        Assert.Equal(5, pressed);
        Assert.Equal(new[] { 5, 2 }, left);
    }

    [Fact(DisplayName = "AC-036.4 환자 열기가 끝나면(멈춤 신호) 더 보지 않는다. 안내창이 없으면 누른 수는 0이다")]
    public void WatchStopsWhenOpenEnds()
    {
        var clock = new StepClock();
        var looks = 0;

        var pressed = ViewModeWatch.Run(clock, () => clock.NowMs > 750, _ =>
        {
            looks++;
            return 0;
        });

        Assert.Equal(0, pressed);
        Assert.Equal(3, looks);
    }

    [Fact(DisplayName = "AC-036.5 안내창을 눌렀다는 표시는 결과 종류·문구를 바꾸지 않는다")]
    public void ViewModeMark()
    {
        var plain = ChartOpenResult.Opened("가짜 문구");
        var marked = plain.InViewMode();
        Assert.False(plain.ViewMode);
        Assert.True(marked.ViewMode);
        Assert.Equal(ChartOpenKind.Opened, marked.Kind);
        Assert.Equal("가짜 문구", marked.Message);
    }

    // AC-036.5 : 조회 모드로 열린 진료

    [Fact(DisplayName = "AC-036.5 조회 모드 + 편집 불가: writeUnconfirmed 없이 그 사람만 확인 필요로 두고 다음 사람으로 간다")]
    public void ViewModeNotEditableMovesOn()
    {
        var rig = new RunnerRig();
        rig.Ui.OpensInViewMode = true;
        rig.Ui.Editable = false;
        NormalFromSecondOpen(rig);

        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal((InputResults.Check, NotAccepted), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v1"));
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
        Assert.Equal("가짜 메모 2", rig.Ui.Written.Single());
        Assert.Equal(1, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-036.5 조회 모드 + 입력을 받지 않는 가짜 칸(쓴 뒤 다시 읽어 쓰기 전과 같음): 묶음이 계속되고 기록은 check이며 저장을 누르지 않는다")]
    public void ViewModeUnchangedBoxMovesOn()
    {
        var rig = new RunnerRig();
        NotAcceptingBox(rig);
        NormalFromSecondOpen(rig);

        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Null(outcome.Code);
        Assert.Equal((InputResults.Check, NotAccepted), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(new[] { JournalState.Writing, JournalState.Check }, rig.Journal.Of("v1"));
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
        Assert.Equal(new[] { JournalState.Writing, JournalState.Done }, rig.Journal.Of("v2"));
        Assert.Equal(1, rig.Ui.Saves);
        Assert.False(rig.Ui.Bit.ContainsKey(Sample.Item(1).Chart));
    }

    [Fact(DisplayName = "AC-036.5 조회 모드 + 다른 글이 들어간 가짜 칸: 저장 안 된 글이 남았으므로 묶음을 멈추고 writeUnconfirmed다")]
    public void ViewModeDifferentTextStops()
    {
        var rig = new RunnerRig();
        rig.Ui.OpensInViewMode = true;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "read" && rig.Ui.Written.Count == 1) rig.Ui.Editor = "반만 들어간 글";
        };

        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal((InputResults.Check, WriteNotConfirmed), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-036.5 조회 모드 + 쓴 뒤 다시 읽기가 실패한 가짜 칸: 같음으로 치지 않고 writeUnconfirmed로 묶음을 멈춘다")]
    public void ViewModeUnreadableIsNotUnchanged()
    {
        var rig = new RunnerRig();
        NotAcceptingBox(rig);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") rig.Ui.ReadFails = true;
        };

        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal((InputResults.Check, WriteNotConfirmed), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-036.5 쓰다 멈춘 사람이 조회 모드로 열림: 다음 사람으로 가지 않고 확인 필요로 묶음을 멈추며 기록은 그대로다")]
    [InlineData("not-editable")]
    [InlineData("not-accepting")]
    [InlineData("same-text-not-editable")]
    public void StuckPersonInViewModeStops(string kind)
    {
        var item = Sample.Item(1);
        var rig = new RunnerRig();
        rig.Journal.Mark(item, JournalState.WriteUnconfirmed);
        rig.Ui.OpensInViewMode = true;
        switch (kind)
        {
            case "not-editable":
                rig.Ui.Editable = false;
                break;
            case "not-accepting":
                rig.Ui.ReplaceWorks = false;
                rig.Ui.ValueWorks = false;
                break;
            default:
                rig.Ui.Bit[item.Chart] = item.Memo;
                rig.Ui.Editable = false;
                break;
        }

        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(kind == "not-accepting" ? WriteNotConfirmed : WriteUnknown, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Fact(DisplayName = "AC-036.5 AC-017.7 쓰다 멈춘 사람이 조회 모드 + 같은 글 + 편집 불가로 멈춘 뒤 다시 실행: 내원이 열려 있어 안내창이 없어도 저장을 누르지 않고 또 멈추며, 칸이 입력을 받게 된 뒤에야 저장한다")]
    public void StuckPersonRetryInOpenVisitStillStops()
    {
        var item = Sample.Item(1);
        var rig = new RunnerRig();
        rig.Journal.Mark(item, JournalState.WriteUnconfirmed);
        rig.Ui.KeepsOpenVisit = true;
        rig.Ui.OpensInViewMode = true;
        rig.Ui.Editable = false;
        rig.Ui.Bit[item.Chart] = item.Memo;

        var first = rig.Run(new[] { item });
        Assert.Equal(InputStatus.Stopped, first.Status);
        Assert.Equal(WriteUnknown, Of(first, "v1").Reason);
        Assert.Equal(0, rig.Ui.Saves);

        var second = rig.Run(new[] { item });

        Assert.Equal(InputStatus.Stopped, second.Status);
        Assert.Equal("E-INPUT-STOPPED", second.Code);
        Assert.Equal((InputResults.Check, WriteUnknown), (Of(second, "v1").Result, Of(second, "v1").Reason));
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));

        rig.Ui.Editable = true;
        var third = rig.Run(new[] { item });

        Assert.Equal(InputStatus.Finished, third.Status);
        Assert.Equal(InputResults.Done, Of(third, "v1").Result);
        Assert.Equal(1, rig.Ui.Saves);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.Done, rig.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-036.5 AC-017.3 쓰다 멈춘 사람이 아니면 보통 모드의 편집 불가는 지금 그대로다: 같으면 이미 입력됨, 비었으면 건너뜀이고 저장을 누르지 않는다")]
    [InlineData(true)]
    [InlineData(false)]
    public void NormalModeNotEditableNotStuckUnchanged(bool sameText)
    {
        var item = Sample.Item(1);
        var rig = new RunnerRig();
        rig.Ui.Editable = false;
        if (sameText) rig.Ui.Bit[item.Chart] = item.Memo;

        var outcome = rig.Run(new[] { item });

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(
            sameText ? (InputResults.Done, "이미 입력됨") : (InputResults.Skipped, NoWrite),
            (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.7 AC-035.5 AC-036.5 보통 모드의 쓰다 멈춘 사람 + 같은 글 + 편집 불가: 저장을 누르지 않고 멈추며, 칸이 계속 편집 불가여도 직접 확인으로 풀린다(완료, 기록 Done)")]
    public void StuckNotEditableReleasedByHand()
    {
        var item = Sample.Item(1);
        var rig = new RunnerRig();
        rig.Journal.Mark(item, JournalState.WriteUnconfirmed);
        rig.Ui.KeepsOpenVisit = true;
        rig.Ui.Editable = false;
        rig.Ui.Bit[item.Chart] = item.Memo;

        var stopped = rig.Run(new[] { item });
        Assert.Equal(InputStatus.Stopped, stopped.Status);
        Assert.Equal((InputResults.Check, WriteUnknown), (Of(stopped, "v1").Result, Of(stopped, "v1").Reason));
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));

        var outcome = rig.Run(new[] { Sample.Item(1, checkedByHand: true) });

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal((InputResults.Done, "이미 입력됨"), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.Done, rig.Journal.Last("v1"));
    }

    [Fact(DisplayName = "AC-036.5 3번 잇따른 실패에는 원본처럼 센다: 셋째에서 멈추고 넷째는 미처리이며 아무도 쓰다 멈춤이 아니다")]
    public void ThreeInARowCounts()
    {
        var rig = new RunnerRig();
        NotAcceptingBox(rig);

        var outcome = rig.Run(Sample.Items(4));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("연속 3명 실패 — 설정 문제일 수 있어 멈췄습니다. 마지막 사유: " + NotAccepted, outcome.Reason);
        Assert.Equal(3, rig.Ui.Opens);
        Assert.Equal("미처리", Of(outcome, "v4").Reason);
        Assert.Equal(JournalState.Check, rig.Journal.Last("v1"));
        Assert.Equal(JournalState.Check, rig.Journal.Last("v3"));
    }

    [Fact(DisplayName = "AC-036.5 조회 모드 표시가 없으면 지금 그대로다: 편집 불가는 건너뜀, 쓴 뒤 같음은 묶음 멈춤")]
    public void WithoutNoticeNothingChanges()
    {
        var notEditable = new RunnerRig();
        notEditable.Ui.Editable = false;
        var skipped = notEditable.Run(Sample.Items(1));
        Assert.Equal((InputResults.Skipped, NoWrite), (Of(skipped, "v1").Result, Of(skipped, "v1").Reason));
        Assert.Equal(JournalState.Skipped, notEditable.Journal.Last("v1"));

        var unchanged = new RunnerRig { Ui = { ReplaceWorks = false, ValueWorks = false } };
        var stopped = unchanged.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, stopped.Status);
        Assert.Equal(WriteNotConfirmed, Of(stopped, "v1").Reason);
        Assert.Equal(JournalState.WriteUnconfirmed, unchanged.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-036.5 AC-035.5 직접 확인으로 온 사람이 조회 모드에서 입력을 못 받으면 칸에 글이 남지 않아 SkippedByHand이고 묶음은 계속된다")]
    [InlineData(false)]
    [InlineData(true)]
    public void ByHandInViewMode(bool wroteFirst)
    {
        var item = Sample.Item(1, checkedByHand: true);
        var rig = new RunnerRig();
        rig.Journal.Mark(item, JournalState.Writing);
        NotAcceptingBox(rig);
        if (!wroteFirst) rig.Ui.Editable = false;
        NormalFromSecondOpen(rig);

        var outcome = rig.Run(new[] { item, Sample.Item(2) });

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal((InputResults.Check, NotAccepted), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal(JournalState.SkippedByHand, rig.Journal.Last("v1"));
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
    }

    [Fact(DisplayName = "AC-036.5 AC-017.3 조회 모드라도 칸 글을 읽는 판단은 그대로다: 같으면 완료, 다르면 건너뜀이고 쓰지 않는다")]
    public void ViewModeStillComparesFirst()
    {
        var rig = new RunnerRig();
        var same = Sample.Item(1);
        var other = Sample.Item(2);
        rig.Ui.OpensInViewMode = true;
        rig.Ui.Editable = false;
        rig.Ui.Bit[same.Chart] = same.Memo;
        rig.Ui.Bit[other.Chart] = "직원이 쓴 가짜 메모";

        var outcome = rig.Run(new[] { same, other });

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal((InputResults.Done, "이미 입력됨"), (Of(outcome, "v1").Result, Of(outcome, "v1").Reason));
        Assert.Equal((InputResults.Skipped, "이미 있음"), (Of(outcome, "v2").Result, Of(outcome, "v2").Reason));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-036.5 진짜 입력 기록으로: 마지막 기록이 check이고 답에 unconfirmed가 없으며 다음 묶음이 막히지 않는다")]
    public void ViewModeLeavesNoStuckRecord()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        rig.Ui.OpensInViewMode = true;
        rig.Ui.ReplaceWorks = false;
        rig.Ui.ValueWorks = false;

        var (_, first) = rig.Run(item);

        Assert.Equal("finished", first.GetProperty("status").GetString());
        Assert.Equal((InputResults.Check, NotAccepted), WiringRig.Row(first, item.VisitKey));
        Assert.False(first.TryGetProperty("unconfirmed", out _));
        Assert.Equal(JournalState.Check, rig.Reopen().LastState(item));

        rig.Ui.OpensInViewMode = false;
        rig.Ui.ReplaceWorks = true;
        rig.Ui.ValueWorks = true;
        var (_, second) = rig.Run(Sample.Item(2), item);

        Assert.Equal("finished", second.GetProperty("status").GetString());
        Assert.Equal(InputResults.Done, WiringRig.Row(second, item.VisitKey).Result);
    }

    // AC-036.6 : 첫 progress는 첫 사람보다 앞이다(기다리기는 VisitOpener.test.cs)

    [Fact(DisplayName = "AC-036.6 AC-038.1 첫 진행 숫자(확장이 크롬 창을 내리는 신호)는 [확인]과 칸 검사 뒤, 첫 사람을 열기 전에 나간다")]
    public void FirstProgressBeforeFirstOpen()
    {
        var rig = new RunnerRig();
        var opensAtFirst = -1;
        var filtersAtFirst = -1;
        rig.Progress.OnReport = (done, _) =>
        {
            if (done != 0) return;
            opensAtFirst = rig.Ui.Opens;
            filtersAtFirst = rig.Ui.Calls.Count(call => call == "filter");
        };

        rig.Run(Sample.Items(1), Code);

        Assert.Equal(0, opensAtFirst);
        Assert.Equal(1, filtersAtFirst);
    }
}
