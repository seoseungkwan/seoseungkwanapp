using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>InputRunner: 가짜 비트 화면(IChartUi)과 가짜 확인 창으로 AC-017.1~017.9를 본다. 진짜 창에는 아무것도 쓰지 않는다.</summary>
public class InputRunnerTests
{
    private static InputResult Of(InputOutcome outcome, string visitKey) => RunnerRig.ResultOf(outcome, visitKey);

    // AC-017.1 · AC-017.2 : 입력 전

    [Fact(DisplayName = "AC-017.1 지문 확인 → 묶음 검사 → 확인 창 차례. 묶음이 틀리면 확인 창도 비트 조작도 없다")]
    public void BadBatchTouchesNothing()
    {
        var rig = new RunnerRig();
        var error = Assert.ThrowsAny<HelperException>(() => rig.Run(new[] { Sample.Item(1, chart: "abc") }));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(new[] { "fingerprint" }, rig.Ui.Calls);
        Assert.Empty(rig.Journal.Marks);
    }

    [Fact(DisplayName = "AC-017.1 같은 환자가 같은 날 두 번 진료받은 묶음은 통째로 거절한다: 둘째가 첫째 화면을 열어 이미 입력됨으로 보이는 일이 없다")]
    public void SameDayTwoVisitsRejected()
    {
        var rig = new RunnerRig();
        var error = Assert.ThrowsAny<HelperException>(() => rig.Run(new[] { Sample.Item(1, visitKey: "v1", memo: "같은 메모"), Sample.Item(1, visitKey: "v2", memo: "같은 메모") }));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(rig.Journal.Marks);
    }

    [Fact(DisplayName = "AC-017.2 확인 창은 도우미가 만든 글을 5분으로 띄우고, [확인] 전에는 지문 읽기 말고 비트를 건드리지 않는다")]
    public void ConfirmFirst()
    {
        var rig = new RunnerRig();
        rig.Confirm.Behavior = _ =>
        {
            Assert.Equal(new[] { "fingerprint" }, rig.Ui.Calls);
            return false;
        };
        rig.Run(new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-29") });
        var (text, timeout) = Assert.Single(rig.Confirm.Shown);
        Assert.Contains("10/27~10/29, 2명 입력할까요?", text, StringComparison.Ordinal);
        Assert.Contains("기관기호 1234****", text, StringComparison.Ordinal);
        Assert.Equal(TimeSpan.FromMinutes(5), timeout);
    }

    [Fact(DisplayName = "AC-017.2 [취소]·창 닫기·5분 지남(모두 false)이면 하나도 입력하지 않고 cancelled")]
    public void Cancel()
    {
        var rig = new RunnerRig();
        rig.Confirm.Answer = false;
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Cancelled, outcome.Status);
        Assert.Null(outcome.Code);
        Assert.Empty(outcome.Results);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(rig.Journal.Marks);
        Assert.Empty(rig.Progress.Reports);
    }

    // AC-017.3 : 사람 하나의 차례

    [Fact(DisplayName = "AC-017.3 열기 → 이름·차트번호·내원일 검사 → 메모 다시 읽기 → 쓰기 → 다시 읽기 → 검사 → 저장 → 다시 읽기(원본 Apply 차례)")]
    public void Order()
    {
        var rig = new RunnerRig();
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(
            new[] { "open", "locate", "target", "read", "editable", "target", "read", "select", "target", "read", "replace", "read", "target", "save", "read" },
            rig.Ui.Calls.Where(call => call != "fingerprint" && call != "unsaved" && call != "filter"));
        var result = Of(outcome, "v1");
        Assert.Equal(InputResults.Done, result.Result);
        Assert.Equal("입력", result.Reason);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
    }

    [Fact(DisplayName = "AC-017.3 비트에 같은 메모가 있으면 쓰지 않고 완료(이미 입력됨)")]
    public void AlreadySame()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900001"] = "첫 줄\r\n둘째 줄";
        var outcome = rig.Run(new[] { Sample.Item(1, memo: "첫 줄\n둘째 줄") });
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("이미 입력됨", Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.3 비트에 다른 메모가 있으면 덮어쓰지 않고 건너뜀 '이미 있음'")]
    public void AlreadyOther()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900001"] = "직원이 쓴 메모";
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal("이미 있음", Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal("직원이 쓴 메모", rig.Ui.Bit["900001"]);
    }

    [Fact(DisplayName = "AC-017.3 공백만 있는 칸은 빈칸으로 보고 쓴다(원본 Norm)")]
    public void WhitespaceOnly()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900001"] = "  \r\n ";
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
    }

    [Fact(DisplayName = "AC-017.3 메모는 윈도우 줄바꿈으로 쓴다(앞뒤 공백 그대로, 원본 ToWin)")]
    public void WritesWinNewlines()
    {
        var rig = new RunnerRig();
        rig.Run(new[] { Sample.Item(1, memo: "첫 줄\n둘째 줄 ") });
        Assert.Equal("첫 줄\r\n둘째 줄 ", Assert.Single(rig.Ui.Written));
    }

    [Theory(DisplayName = "AC-017.3 환자·진료일 검사가 틀리면 쓰지 않고 원본 문구로 건너뜀")]
    [InlineData("identity", "환자 불일치 - 자동입력을 중단했습니다. (가짜 이유)")]
    [InlineData("owner", "등록된 병원 프로그램의 입력 위치를 확인하지 못했습니다.")]
    [InlineData("workdate", "진료일 불일치 - 열린 내원(2026-10-28)이 입력할 내원(2026-10-27)과 다릅니다.")]
    [InlineData("unreadable", "진료일 확인 불가 - 자동입력을 중단했습니다. (외래진료실 진료일을 읽지 못했습니다)")]
    public void CheckFails(string kind, string reason)
    {
        var rig = new RunnerRig();
        switch (kind)
        {
            case "identity": rig.Ui.IdentityError = "가짜 이유"; break;
            case "owner": rig.Ui.Owned = false; break;
            case "workdate": rig.Ui.FixedWorkDate = "2026-10-28"; break;
            default: rig.Ui.WorkDateError = "외래진료실 진료일을 읽지 못했습니다"; break;
        }
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal(reason, Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.3 메모 칸이 편집할 수 없으면(조회모드 등) 쓰지 않고 원본 문구로 건너뜀")]
    public void NotEditable()
    {
        var rig = new RunnerRig();
        rig.Ui.Editable = false;
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal("청구메모 칸이 편집할 수 없는 상태입니다.", Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.3 메모를 읽지 못하면 빈칸으로 보지 않고 쓰지 않은 채 멈춘다")]
    public void CannotRead()
    {
        var rig = new RunnerRig();
        rig.Ui.ReadFails = true;
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.All(outcome.Results, result => Assert.Equal(InputResults.Check, result.Result));
    }

    [Fact(DisplayName = "AC-017.3 비교기가 읽기 실패(null)를 빈칸으로 돌려줘도 빈칸으로 보지 않고 쓰지 않은 채 멈춘다")]
    public void CannotReadThoughMatcherSaysAbsent()
    {
        var rig = new RunnerRig { Matcher = new BlankIsAbsentMatcher() };
        // 첫 읽기만 실패한다: 뒤 읽기는 빈칸이라, 넘어가면 쓰기까지 간다
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "read") rig.Ui.ReadFails = number == 1;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal("청구메모 칸을 읽지 못해 입력하지 않았습니다. 비트 화면을 확인해 주세요.", outcome.Reason);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v1"));
    }

    // 여러 날 묶음 (원본 range_bridge)

    [Fact(DisplayName = "AC-017.3 여러 날 묶음: 내원내역 기간이 묶음을 모두 포함하면 사람마다 그날 내원으로 입력하고, 내원내역 날짜를 바꾸지 않는다")]
    public void MultiDayBatch()
    {
        var rig = new RunnerRig();
        rig.Ui.Filter = new ListFilter("2026-10-27", "2026-10-29", "", false, null);
        var outcome = rig.Run(new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-28"), Sample.Item(3, date: "2026-10-29") });
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.All(outcome.Results, result => Assert.Equal(InputResults.Done, result.Result));
        Assert.Equal(3, rig.Ui.Saves);
        // IChartUi에는 내원내역 기간을 고치는 일이 없다: 읽기만 한다
        Assert.DoesNotContain(typeof(IChartUi).GetMethods(), method => method.Name.IndexOf("SetList", StringComparison.Ordinal) >= 0);
    }

    [Fact(DisplayName = "AC-017.3 내원내역 기간이 묶음을 다 포함하지 않으면 [확인] 뒤 첫 사람을 열기 전에 원본 문구로 멈춘다(모두 미처리)")]
    public void PeriodDoesNotCover()
    {
        var rig = new RunnerRig();
        rig.Ui.Filter = new ListFilter("2026-10-28", "2026-10-29", "", false, null);
        var outcome = rig.Run(new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-29") });
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.StartsWith("기간이 다릅니다.", outcome.Reason, StringComparison.Ordinal);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.All(outcome.Results, result => Assert.Equal("미처리", result.Reason));
    }

    [Fact(DisplayName = "AC-017.3 내원내역 처방코드 칸에 글자가 있으면 시작하지 않는다(묶음에 처방코드가 없어 원본의 '같은 코드' 확인을 '비워 두기'로)")]
    public void ListCodeFilled()
    {
        var rig = new RunnerRig();
        rig.Ui.Filter = new ListFilter("2026-10-01", "2026-10-31", "LA358", false, null);
        var outcome = rig.Run(Sample.Items(1));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Contains("처방코드 칸(LA358)", outcome.Reason, StringComparison.Ordinal);
        Assert.Equal(0, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 묶음 도중 내원내역 기간이 바뀌어 기간 밖이 되면(원본 '기간' fatal 문구) 그 자리에서 멈춘다")]
    public void PeriodChangedDuringRun()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (chart, name, date) => date == "2026-10-28"
            ? ChartOpenResult.Failed("U차트 내원내역 기간(2026-10-27 ~ 2026-10-27) 밖의 내원일(2026-10-28)입니다. 내원내역 기간을 맞춰 주세요.")
            : null;
        var outcome = rig.Run(new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-28"), Sample.Item(3, date: "2026-10-29") });
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal(InputResults.Check, Of(outcome, "v2").Result);
        Assert.StartsWith("미처리", Of(outcome, "v2").Reason, StringComparison.Ordinal);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
        Assert.Equal(2, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 내원내역 기간을 읽다 뜻밖의 예외가 나면 아무도 열지 않고 멈춘다(모두 미처리, 예외 글은 남기지 않음)")]
    public void ListFilterThrows()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "filter") throw new InvalidOperationException("가상환자01 비밀 글");
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.All(outcome.Results, result => Assert.Equal("미처리", result.Reason));
        Assert.DoesNotContain("비밀 글", outcome.ToJson(), StringComparison.Ordinal);
    }

    // AC-017.4 : 지문

    [Fact(DisplayName = "AC-017.4 칸이 없거나 여럿이면 입력을 시작하지 않고 E-BIT-UI-CHANGED와 칸 ID 목록(확인 창도 안 뜸)")]
    public void FingerprintAtStart()
    {
        var rig = new RunnerRig();
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0), ("ctgMain", 2));
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-BIT-UI-CHANGED", outcome.Code);
        Assert.Equal(new[] { "txtBilCmt", "ctgMain" }, outcome.Fields);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(outcome.Results);
        Assert.Equal(new[] { "fingerprint" }, rig.Ui.Calls);
    }

    [Theory(DisplayName = "AC-017.4 지문의 어느 칸이든(프로세스·창 포함) 하나만 달라도 시작하지 않는다")]
    [InlineData("BITDoctorOrder.exe")]
    [InlineData("외래진료실")]
    [InlineData("내원내역")]
    [InlineData("txtChtNum")]
    [InlineData("lbPatName")]
    [InlineData("txtBilCmt")]
    [InlineData("btnBilCmtModify")]
    [InlineData("cbSch")]
    [InlineData("txtSch")]
    [InlineData("btnSch")]
    [InlineData("ctgMain")]
    [InlineData("dtpWorkDate")]
    public void EveryField(string field)
    {
        var rig = new RunnerRig();
        rig.Ui.FingerprintAt = _ => Sample.With((field, 0));
        var outcome = rig.Run(Sample.Items(1));
        Assert.Equal(new[] { field }, outcome.Fields);
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-017.4 도중에 칸이 달라지면 그 사람에서 멈추고 E-BIT-UI-CHANGED와 칸 ID 목록, 그 사람과 남은 사람은 미처리")]
    public void FingerprintMidRun()
    {
        var rig = new RunnerRig();
        rig.Ui.FingerprintAt = number => number >= 3 ? Sample.With(("btnSch", 2)) : Sample.AllFound();
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-BIT-UI-CHANGED", outcome.Code);
        Assert.Equal(new[] { "btnSch" }, outcome.Fields);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.4 환자를 연 뒤 칸을 못 찾아도(Locate) E-BIT-UI-CHANGED로 멈추고 쓰지 않는다")]
    public void LocateMissing()
    {
        var rig = new RunnerRig();
        rig.Ui.LocateResult = ChartLocate.Missing("U차트에서 칸을 찾지 못했거나 여러 개라 판단할 수 없습니다: 청구메모(txtBilCmt)", new[] { "txtBilCmt" });
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-BIT-UI-CHANGED", outcome.Code);
        Assert.Equal(new[] { "txtBilCmt" }, outcome.Fields);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.4 내원내역 칸을 못 찾아 열기 실패면 E-BIT-UI-CHANGED로 멈춘다(짐작해서 누르지 않음)")]
    public void OpenMissingFields()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.UiChanged("내원내역 창에서 칸을 찾지 못했습니다: cbSch", new[] { "cbSch" });
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-BIT-UI-CHANGED", outcome.Code);
        Assert.Equal(new[] { "cbSch" }, outcome.Fields);
        Assert.Equal(1, rig.Ui.Opens);
    }

    // AC-017.5 : 멈춤

    [Fact(DisplayName = "AC-017.5 저장 안 한 처방 창이 사람 시작 때 있으면 열지 않고 E-BIT-UNSAVED-RX, 남은 사람 미처리")]
    public void UnsavedAtStart()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "open" && number == 1) rig.Ui.AfterSave = () => rig.Ui.Unsaved = true;
        };
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-BIT-UNSAVED-RX", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 환자를 여는 중 저장 안 한 처방 창이 뜨면(열기 결과) E-BIT-UNSAVED-RX로 멈추고 쓰지 않는다")]
    public void UnsavedWhileOpening()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.UnsavedRx("환자 열기를 중단했습니다.");
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-BIT-UNSAVED-RX", outcome.Code);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 쓰기 바로 앞에 저장 안 한 처방 창이 뜨면 쓰지 않고 멈춘다")]
    public void UnsavedBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "editable") rig.Ui.Unsaved = true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-BIT-UNSAVED-RX", outcome.Code);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.5 원본 fatal 문구면 그 자리에서 E-INPUT-STOPPED, 이유는 원본 문구, 남은 사람은 미처리이고 더 열지 않는다")]
    public void FatalMessage()
    {
        var rig = new RunnerRig();
        const string message = "U차트 내원내역 목록이 다른 창에 가려져 있습니다. 목록이 보이게 해 주세요.";
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.Failed(message);
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(message, outcome.Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Contains(message, Of(outcome, "v1").Reason, StringComparison.Ordinal);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
    }

    [Fact(DisplayName = "AC-017.5 내원내역 목록의 키보드 초점을 잃으면 문구대로 그 자리에서 멈추고 다음 사람을 누르지 않는다")]
    public void FocusLostStops()
    {
        var rig = new RunnerRig();
        const string message = "U차트 내원내역 목록에 키보드 초점을 맞추지 못해 멈췄습니다. 비트 화면을 확인해 주세요.";
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.Failed(message);
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(message, outcome.Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("미처리 · " + message, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
    }

    [Fact(DisplayName = "AC-017.5 '환자 열기를 중단했습니다'면 문구대로 그 자리에서 멈추고 다음 사람을 열지 않는다")]
    public void BlockedStops()
    {
        var rig = new RunnerRig();
        const string message = "환자 열기를 중단했습니다. 비트의 확인 창이나 미저장 처방을 직접 확인한 뒤 다시 실행해 주세요.";
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.Failed(message);
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(message, outcome.Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("미처리 · " + message, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
    }

    [Fact(DisplayName = "AC-017.5 비트 칸을 못 찾음(Locate 실패, 칸 목록 없음)도 원본처럼 그 자리에서 멈춘다")]
    public void LocateFatal()
    {
        var rig = new RunnerRig();
        rig.Ui.LocateResult = ChartLocate.NotFound("U차트 외래진료실 창을 찾지 못했습니다. U차트 본 화면이 열려 있는지 확인해 주세요.");
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.5 3번 잇따른 실패면 E-INPUT-STOPPED(원본 문구), 4번째 사람은 열지 않고 미처리")]
    public void ThreeFailures()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.Failed("검색 결과 수를 읽지 못했습니다.");
        var outcome = rig.Run(Sample.Items(5));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal("연속 3명 실패 — 설정 문제일 수 있어 멈췄습니다. 마지막 사유: 검색 결과 수를 읽지 못했습니다.", outcome.Reason);
        Assert.Equal(3, rig.Ui.Opens);
        Assert.Equal(InputResults.Skipped, Of(outcome, "v3").Result);
        Assert.Equal("미처리", Of(outcome, "v4").Reason);
        Assert.Equal("미처리", Of(outcome, "v5").Reason);
    }

    [Fact(DisplayName = "AC-017.5 중간에 성공하면 실패 수를 다시 센다(원본 skipRun)")]
    public void SuccessResets()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (chart, _, __) => chart == "900003" ? null : ChartOpenResult.Failed("검색 결과 수를 읽지 못했습니다.");
        var outcome = rig.Run(Sample.Items(5));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(5, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 그 환자만의 사정은 3번 실패에 세지 않는다(줄을 다 열어봄)")]
    public void PatientSkipsDoNotCount()
    {
        var rig = new RunnerRig();
        rig.Ui.OpenOverride = (_, __, ___) => ChartOpenResult.Failed("검색된 2줄을 모두 열어봤지만 이 환자의 2026-10-27 내원이 없었습니다. 직접 확인해 주세요.");
        var outcome = rig.Run(Sample.Items(5));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(5, rig.Ui.Opens);
        Assert.All(outcome.Results, result => Assert.Equal(InputResults.Skipped, result.Result));
    }

    [Fact(DisplayName = "AC-017.5 '이미 있음' 건너뜀은 그것만으로 멈추지 않는다(원본 review)")]
    public void AlreadyDoesNotStop()
    {
        var rig = new RunnerRig();
        foreach (var item in Sample.Items(5)) rig.Ui.Bit[item.Chart] = "직원이 쓴 메모";
        var outcome = rig.Run(Sample.Items(5));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.All(outcome.Results, result => Assert.Equal("이미 있음", result.Reason));
    }

    [Fact(DisplayName = "AC-017.5 쓴 뒤 값이 달라 확인 필요가 되면 3번을 기다리지 않고 첫 사람에서 멈춘다")]
    public void CheckCounts()
    {
        var rig = new RunnerRig { Ui = { ReplaceWorks = false, ValueWorks = false } };
        var outcome = rig.Run(Sample.Items(5));
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Saves);
    }

    private static void ArrangeUnconfirmedWrite(RunnerRig rig, string kind)
    {
        switch (kind)
        {
            case "written-different":
                rig.Ui.ReplaceWorks = false;
                rig.Ui.ValueWorks = false;
                break;
            case "changed-after":
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "replace") rig.Ui.OpenName = "가상환자99";
                };
                break;
            case "save-not-pressed":
                rig.Ui.SaveWorks = false;
                break;
            default:
                rig.Ui.AfterSave = () => rig.Ui.Editor = "비트가 바꾼 글";
                break;
        }
    }

    [Theory(DisplayName = "AC-017.5 쓰기 뒤 저장을 확인하지 못하면 우리 글이 칸에 남았을 수 있어 그 사람은 확인 필요(원본 문구)로 두고 바로 멈춘다. 목록을 다시 누르지 않고 남은 사람은 미처리")]
    [InlineData("written-different", "청구메모 입력을 확인하지 못해 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.", 0)]
    [InlineData("changed-after", "입력 후 U차트 화면이 바뀌어 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.", 0)]
    [InlineData("save-not-pressed", "입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.", 1)]
    [InlineData("save-differs", "임시저장을 눌렀지만 메모 칸 내용이 달라 보입니다. U차트 화면을 확인해 주세요.", 1)]
    public void UnconfirmedWriteStops(string kind, string reason, int saves)
    {
        var rig = new RunnerRig();
        ArrangeUnconfirmedWrite(rig, kind);
        var outcome = rig.Run(Sample.Items(3));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(reason, outcome.Reason);
        Assert.Equal(new[] { "v1", "v2", "v3" }, outcome.Results.Select(result => result.VisitKey));
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(reason, Of(outcome, "v1").Reason);
        Assert.Equal(new[] { JournalState.Writing, JournalState.WriteUnconfirmed }, rig.Journal.Of("v1"));

        foreach (var rest in new[] { "v2", "v3" })
        {
            Assert.Equal(InputResults.Check, Of(outcome, rest).Result);
            Assert.Equal("미처리", Of(outcome, rest).Reason);
            Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of(rest));
        }

        // 멈춘 뒤에는 목록을 누르거나 Enter를 보내는 일이 없다: 열기는 첫 사람 한 번뿐
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(saves, rig.Ui.Saves);
        Assert.Equal(new[] { (0, 3), (1, 3) }, rig.Progress.Reports);
    }

    [Theory(DisplayName = "AC-017.5 쓰기 뒤 멈춰도 앞사람 결과는 그대로 남는다")]
    [InlineData("written-different")]
    [InlineData("changed-after")]
    [InlineData("save-not-pressed")]
    [InlineData("save-differs")]
    public void UnconfirmedWriteKeepsEarlierResults(string kind)
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "open" && number == 2) ArrangeUnconfirmedWrite(rig, kind);
        };
        var outcome = rig.Run(Sample.Items(3));

        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("입력", Of(outcome, "v1").Reason);
        Assert.Equal(new[] { JournalState.Writing, JournalState.Done }, rig.Journal.Of("v1"));
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(InputResults.Check, Of(outcome, "v2").Result);
        Assert.NotEqual("미처리", Of(outcome, "v2").Reason);
        Assert.Equal("미처리", Of(outcome, "v3").Reason);
        Assert.Equal(2, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 쓰기 바로 앞 확인에서 막혀 아무것도 쓰지 않았으면 칸에 우리 글이 없으니 건너뛰고 다음 사람으로 간다")]
    public void NotWrittenMovesOn()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "select" && number == 1) rig.Ui.Editor = "그사이 직원이 쓴 메모";
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
        Assert.Equal(2, rig.Ui.Opens);
        Assert.Equal(1, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.6 쓰기 바로 앞 확인에서 막히면 그 사람에게 아무것도 입력하지 않았다고 그대로 말한다")]
    public void NotWrittenSaysNothingEntered()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "select" && number == 1) rig.Ui.Editor = "그사이 직원이 쓴 메모";
        };
        var outcome = rig.Run(Sample.Items(1));
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal("이 환자에게는 아무것도 입력하지 않았습니다. 입력 직전에 비트 화면이나 메모 칸이 바뀌었으니 확인한 뒤 다시 실행해 주세요.", Of(outcome, "v1").Reason);
    }

    [Fact(DisplayName = "AC-017.5 메모 칸이 입력을 받지 않는 상태(편집 불가)면 쓰기를 시작하지 않았으니 멈추지 않고 다음 사람으로 간다")]
    public void NotEditableMovesOn()
    {
        var rig = new RunnerRig();
        rig.Ui.Editable = false;
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "open" && number == 2) rig.Ui.Editable = true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal(new[] { JournalState.Skipped }, rig.Journal.Of("v1"));
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
        Assert.Equal(2, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 [멈추기]면 지금 사람까지 하고 멈춘다. 남은 사람은 미처리")]
    public void StopButton()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "save") rig.Stop = true;
        };
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Saves);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.5 비트 조작에서 뜻밖의 예외가 나면 짐작하지 않고 멈춘다(쓰기 전이면 미처리, 예외 글은 남기지 않음)")]
    public void UnexpectedBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "open") throw new InvalidOperationException("가상환자01 비밀 글");
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal("미처리", Of(outcome, "v1").Reason.Substring(0, 3));
        Assert.DoesNotContain("비밀 글", outcome.ToJson(), StringComparison.Ordinal);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.5 쓰기를 시작한 뒤 예외가 나면 확인 필요로 두고 멈춘다(저장을 짐작해서 누르지 않음)")]
    public void UnexpectedAfterWrite()
    {
        var rig = new RunnerRig();
        var targets = 0;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") targets = 1;
            if (call == "target" && targets == 1) throw new InvalidOperationException("가짜");
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        // 미처리로 읽히면 아무것도 안 쓴 줄 안다: 쓰기를 시작했으니 실제 메모를 확인하라고 알린다
        Assert.Equal("입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.", Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(new[] { JournalState.Writing, JournalState.WriteUnconfirmed }, rig.Journal.Of("v1"));
    }

    // AC-017.6 : 결과

    [Fact(DisplayName = "AC-017.6 쓴 뒤 다시 읽은 값이 다르면 저장을 누르지 않고 확인 필요(원본 문구)")]
    public void ReadBackDiffers()
    {
        var rig = new RunnerRig { Ui = { ReplaceWorks = false, ValueWorks = false } };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("청구메모 입력을 확인하지 못해 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.", Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.6 쓴 뒤 화면이 바뀌면 저장을 누르지 않고 확인 필요(원본 문구)")]
    public void ChangedAfterWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") rig.Ui.OpenName = "가상환자99";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("입력 후 U차트 화면이 바뀌어 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.", Of(outcome, "v1").Reason);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.6 저장 단추를 못 누르면 확인 필요(원본 문구)")]
    public void SaveFails()
    {
        var rig = new RunnerRig { Ui = { SaveWorks = false } };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.", Of(outcome, "v1").Reason);
    }

    [Fact(DisplayName = "AC-017.6 저장 뒤 다시 읽은 값이 다르면 확인 필요(원본 문구)")]
    public void AfterSaveDiffers()
    {
        var rig = new RunnerRig();
        rig.Ui.AfterSave = () => rig.Ui.Editor = "비트가 바꾼 글";
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("임시저장을 눌렀지만 메모 칸 내용이 달라 보입니다. U차트 화면을 확인해 주세요.", Of(outcome, "v1").Reason);
    }

    [Fact(DisplayName = "AC-017.6 쓴 뒤 대조는 원본 Same: 비트가 앞뒤 공백만 다듬으면 완료")]
    public void TrimmedByBit()
    {
        var rig = new RunnerRig();
        rig.Ui.AfterSave = () => rig.Ui.Editor = rig.Ui.Editor.Trim();
        var outcome = rig.Run(new[] { Sample.Item(1, memo: "가짜 메모 ") });
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
    }

    [Fact(DisplayName = "AC-017.6 결과는 완료·확인 필요·건너뜀 셋 중 하나이고 사람마다 하나, 차례대로. 진행은 숫자만 0부터")]
    public void ResultsAndProgress()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900002"] = "직원이 쓴 메모";
        rig.Ui.Bit["900003"] = "가짜 메모 3";
        var outcome = rig.Run(Sample.Items(4));
        Assert.Equal(new[] { "v1", "v2", "v3", "v4" }, outcome.Results.Select(result => result.VisitKey));
        Assert.Equal(new[] { InputResults.Done, InputResults.Skipped, InputResults.Done, InputResults.Done }, outcome.Results.Select(result => result.Result));
        Assert.Equal(new[] { (0, 4), (1, 4), (2, 4), (3, 4), (4, 4) }, rig.Progress.Reports);
    }

    // AC-017.7 : 입력 기록·이어서 하기

    [Fact(DisplayName = "AC-017.7 쓰기 전 writing을 남기고 확인 뒤 done·skipped·check를 남긴다")]
    public void JournalStates()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900002"] = "직원이 쓴 메모";
        rig.Ui.Bit["900003"] = "가짜 메모 3";
        rig.Ui.AfterSave = () =>
        {
            if (rig.Ui.OpenChart == "900004") rig.Ui.Editor = "비트가 바꾼 글";
        };
        rig.Run(Sample.Items(4));
        Assert.Equal(new[] { JournalState.Writing, JournalState.Done }, rig.Journal.Of("v1"));
        Assert.Equal(new[] { JournalState.Skipped }, rig.Journal.Of("v2"));
        Assert.Equal(new[] { JournalState.Done }, rig.Journal.Of("v3"));
        Assert.Equal(new[] { JournalState.Writing, JournalState.WriteUnconfirmed }, rig.Journal.Of("v4"));
    }

    [Fact(DisplayName = "AC-017.7 입력 기록에 진료 날짜가 함께 간다(달을 넘기는 묶음은 달마다 다른 작업 파일)")]
    public void JournalKnowsTheMonth()
    {
        var rig = new RunnerRig();
        rig.Run(new[] { Sample.Item(1, date: "2026-10-30"), Sample.Item(2, date: "2026-11-02") });
        Assert.Equal("2026-10-30", rig.Journal.Dates["v1"]);
        Assert.Equal("2026-11-02", rig.Journal.Dates["v2"]);
    }

    [Fact(DisplayName = "AC-017.7 writing 기록은 쓰기보다 먼저다")]
    public void WritingBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") Assert.Equal(new[] { JournalState.Writing }, rig.Journal.Of("v1"));
        };
        rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(1, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.7 writing을 남기지 못하면(E-STORE-FAILED) 쓰지 않고 멈춘다")]
    public void JournalFailsBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Journal.FailWhen = (_, state) => state == JournalState.Writing;
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-STORE-FAILED", outcome.Code);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
    }

    [Fact(DisplayName = "AC-017.7 확인 뒤 기록을 못 남겨도 저장까지 마친 결과는 잃지 않고 멈춘다(E-STORE-FAILED)")]
    public void JournalFailsAfterWrite()
    {
        var rig = new RunnerRig();
        rig.Journal.FailWhen = (_, state) => state == JournalState.Done;
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-STORE-FAILED", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.7 확인 뒤 기록에서 뜻밖의 예외가 나도 저장까지 마친 결과는 잃지 않고 멈춘다(E-INPUT-STOPPED)")]
    public void JournalThrowsAfterWrite()
    {
        var rig = new RunnerRig();
        rig.Journal.ThrowWhen = (_, state) => state == JournalState.Done;
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-017.7 입력 기록이 없는 진료를 다시 열면 비트 메모와 비교: 우리 글과 같으면 완료, 비었으면 입력, 다르면 건너뜀(이미 있음). 쓰다 멈춘 기록이 있으면 아래 Leftover 시험")]
    [InlineData("가짜 메모 1", "완료", "이미 입력됨", 0)]
    [InlineData("", "완료", "입력", 1)]
    [InlineData("쓰다 만 글", "건너뜀", "이미 있음", 0)]
    public void Resume(string inBit, string result, string reason, int writes)
    {
        var first = new RunnerRig();
        first.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") throw new InvalidOperationException("가짜: 입력 중 도우미가 끝남");
        };
        first.Run(new[] { Sample.Item(1) });
        Assert.Equal(JournalState.Writing, first.Journal.Of("v1")[0]);

        var again = new RunnerRig();
        again.Ui.Bit["900001"] = inBit;
        var outcome = again.Run(new[] { Sample.Item(1) });
        Assert.Equal(result, Of(outcome, "v1").Result);
        Assert.Equal(reason, Of(outcome, "v1").Reason);
        Assert.Equal(writes, again.Ui.Writes);
    }

    // AC-017.7 : 쓰다 멈춘 사람을 다시 실행. 진짜 OpenPatient는 이미 열린 내원의 칸을 건드리지 않는다(가짜의 KeepsOpenVisit)

    private const string CheckMemoBox = "이전 입력이 끝나지 않았고 메모 칸 내용이 입력할 글과 다릅니다. 이 환자의 청구메모 칸을 직접 확인해 주세요.";
    private const string WriteUnknown = "입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.";

    /// <summary>쓰다 멈춘 자리: 그 사람의 내원이 열려 있고 칸에 box가 남았으며, 입력 기록의 마지막은 last다.</summary>
    private static RunnerRig LeftOpen(InputItem item, string box, JournalState last)
    {
        var rig = new RunnerRig { Ui = { KeepsOpenVisit = true, OpenChart = item.Chart, OpenName = item.Name, OpenDate = item.Date, Editor = box } };
        rig.Journal.Mark(item, last);
        return rig;
    }

    [Fact(DisplayName = "AC-017.7 저장을 못 눌러 멈춘 뒤 다시 실행: 칸에 우리 글이 남아 있으면 '이미 입력됨'으로 끝내지 않고, 저장을 눌러 다시 읽은 뒤에만 완료")]
    public void RerunSavesLeftoverText()
    {
        var rig = new RunnerRig { Ui = { SaveWorks = false, KeepsOpenVisit = true } };
        var first = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal("E-INPUT-STOPPED", first.Code);
        Assert.Equal("가짜 메모 1", rig.Ui.Editor);
        Assert.False(rig.Ui.Bit.ContainsKey("900001"));
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));

        rig.Ui.SaveWorks = true;
        rig.Ui.Calls.Clear();
        var writes = rig.Ui.Writes;
        var outcome = rig.Run(new[] { Sample.Item(1) });

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("입력", Of(outcome, "v1").Reason);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(writes, rig.Ui.Writes);
        Assert.Equal(
            new[] { "open", "locate", "target", "read", "unsaved", "target", "save", "read" },
            rig.Ui.Calls.Skip(rig.Ui.Calls.IndexOf("open")));
        Assert.Equal(JournalState.Done, rig.Journal.Last("v1"));
    }

    [Fact(DisplayName = "AC-017.7 반만 들어가 멈춘 뒤 다시 실행: '이미 있음'으로 건너뛰고 다음 사람을 여는 대신 멈추고 직원에게 칸을 확인하라고 한다")]
    public void RerunStopsOnHalfWrittenText()
    {
        var rig = new RunnerRig { Ui = { KeepsOpenVisit = true } };
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "read" && rig.Ui.Written.Count == 1) rig.Ui.Editor = "반만 들어간 글";
        };
        var first = rig.Run(Sample.Items(2));
        Assert.Equal("E-INPUT-STOPPED", first.Code);
        Assert.Equal("반만 들어간 글", rig.Ui.Editor);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));

        rig.Ui.OnCall = null;
        rig.Ui.Calls.Clear();
        var writes = rig.Ui.Writes;
        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(CheckMemoBox, outcome.Reason);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(CheckMemoBox, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(writes, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal("반만 들어간 글", rig.Ui.Editor);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-017.7 마지막 기록이 쓰는 중(writing, 도우미가 끝남)이어도 같게 다룬다: 칸이 같으면 저장을 눌러 확인한 뒤 완료")]
    [InlineData(JournalState.Writing)]
    [InlineData(JournalState.WriteUnconfirmed)]
    public void LeftoverSameIsSaved(JournalState last)
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", last);
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("입력", Of(outcome, "v1").Reason);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(JournalState.Done, rig.Journal.Last("v1"));
        Assert.Equal(InputResults.Done, Of(outcome, "v2").Result);
    }

    [Theory(DisplayName = "AC-017.7 마지막 기록이 쓰는 중(writing, 도우미가 끝남)이어도 같게 다룬다: 칸이 다르면 멈추고 다음 사람을 열지 않는다")]
    [InlineData(JournalState.Writing)]
    [InlineData(JournalState.WriteUnconfirmed)]
    public void LeftoverDifferentStops(JournalState last)
    {
        var rig = LeftOpen(Sample.Item(1), "반만 들어간 글", last);
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(CheckMemoBox, outcome.Reason);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(CheckMemoBox, Of(outcome, "v1").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-017.7 쓰다 멈춘 사람의 저장 잇기가 실패하면 쓰기 뒤 멈춤과 똑같이: 그 사람은 확인 필요, 다음 사람을 열지 않고 기록은 그대로")]
    [InlineData("save-not-pressed", "입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.", 1)]
    [InlineData("save-differs", "임시저장을 눌렀지만 메모 칸 내용이 달라 보입니다. U차트 화면을 확인해 주세요.", 1)]
    [InlineData("changed-after", "입력 후 U차트 화면이 바뀌어 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.", 0)]
    public void LeftoverSaveFails(string kind, string reason, int saves)
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        switch (kind)
        {
            case "save-not-pressed":
                rig.Ui.SaveWorks = false;
                break;
            case "save-differs":
                rig.Ui.AfterSave = () => rig.Ui.Editor = "비트가 바꾼 글";
                break;
            default:
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "read") rig.Ui.OpenName = "가상환자99";
                };
                break;
        }
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(reason, outcome.Reason);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(reason, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(saves, rig.Ui.Saves);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Fact(DisplayName = "AC-017.7 쓰다 멈춘 사람의 저장 단추에서 뜻밖의 예외가 나면 확인 필요로 두고 멈춘다(기록은 그대로)")]
    public void LeftoverSaveThrows()
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "save") throw new InvalidOperationException("가상환자01 비밀 글");
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(WriteUnknown, Of(outcome, "v1").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
        Assert.DoesNotContain("비밀 글", outcome.ToJson(), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-017.7 쓰다 멈춘 사람의 칸이 비어 있으면(화면을 다시 불러 사라짐) 처음처럼 입력한다")]
    public void LeftoverBlankIsWritten()
    {
        var rig = LeftOpen(Sample.Item(1), "", JournalState.WriteUnconfirmed);
        var outcome = rig.Run(Sample.Items(1));
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal("입력", Of(outcome, "v1").Reason);
        Assert.Equal(1, rig.Ui.Writes);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(new[] { JournalState.WriteUnconfirmed, JournalState.Writing, JournalState.Done }, rig.Journal.Of("v1"));
    }

    [Fact(DisplayName = "AC-017.7 쓰다 멈춘 사람의 칸이 우리 글과 같아도 저장 안 한 처방 창이 떠 있으면 저장을 누르지 않고 E-BIT-UNSAVED-RX로 멈춘다(기록은 그대로)")]
    public void LeftoverUnsavedRxNotSaved()
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "read") rig.Ui.Unsaved = true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-BIT-UNSAVED-RX", outcome.Code);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(WriteUnknown, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-017.7 쓰다 멈춘 사람을 확인하지 못하면 건너뛰지 않고 멈춘다: 다음 사람을 열지 않고 기록은 그대로")]
    [InlineData("open-failed", "검색 결과 수를 읽지 못했습니다.")]
    [InlineData("wrong-patient", "환자 불일치 - 자동입력을 중단했습니다.")]
    [InlineData("not-editable", "청구메모 칸이 편집할 수 없는 상태입니다.")]
    [InlineData("unreadable", "청구메모 칸을 읽지 못해 입력하지 않았습니다. 비트 화면을 확인해 주세요.")]
    [InlineData("box-changed", WriteUnknown)]
    [InlineData("target-changed", "환자 불일치 - 자동입력을 중단했습니다. (입력 직전 화면이 바뀜)")]
    [InlineData("memo-changed", "입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.")]
    public void LeftoverUnverifiedStops(string kind, string reason)
    {
        var rig = LeftOpen(Sample.Item(1), kind is "not-editable" or "box-changed" or "target-changed" or "memo-changed" ? "" : "가짜 메모 1", JournalState.WriteUnconfirmed);
        switch (kind)
        {
            case "target-changed":
                // 비어 있어 처음처럼 입력하려는데, 쓰기 앞 검사 직전에 화면이 다른 환자로 바뀐다
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "editable") rig.Ui.OpenName = "가상환자99";
                };
                break;
            case "memo-changed":
                // 비어 있어 처음처럼 입력하려는데, 쓰기 앞 검사 직전에 칸이 바뀐다
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "editable") rig.Ui.Editor = "그사이 직원이 쓴 메모";
                };
                break;
            case "box-changed":
                // 비어 있어 처음처럼 입력하려는데, 쓰기 바로 앞에 칸이 바뀐다
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "select") rig.Ui.Editor = "그사이 직원이 쓴 메모";
                };
                break;
            case "open-failed":
                rig.Ui.OpenOverride = (chart, _, __) => chart == "900001" ? ChartOpenResult.Failed(reason) : null;
                break;
            case "wrong-patient":
                rig.Ui.OpenOverride = (chart, _, __) => chart == "900001" ? ChartOpenResult.Opened("U차트에 이미 열려 있습니다.") : null;
                rig.Ui.OpenName = "가상환자99";
                break;
            case "not-editable":
                rig.Ui.Editable = false;
                break;
            default:
                rig.Ui.ReadFails = true;
                break;
        }
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-INPUT-STOPPED", outcome.Code);
        Assert.Equal(reason, outcome.Reason);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(WriteUnknown, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
    }

    [Theory(DisplayName = "AC-017.7 그 사람을 처리하기 전에 묶음이 멈춰도 '쓰다 멈춤' 기록을 미처리로 덮지 않는다(덮으면 다음 실행에 거짓 완료)")]
    [InlineData("fingerprint", "E-BIT-UI-CHANGED")]
    [InlineData("unsaved", "E-BIT-UNSAVED-RX")]
    [InlineData("period", "E-INPUT-STOPPED")]
    [InlineData("stop-button", "E-INPUT-STOPPED")]
    public void LeftoverKeptWhenNotReached(string kind, string code)
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        switch (kind)
        {
            case "fingerprint":
                rig.Ui.FingerprintAt = number => number >= 2 ? Sample.With(("btnSch", 2)) : Sample.AllFound();
                break;
            case "unsaved":
                rig.Ui.Unsaved = true;
                break;
            case "period":
                rig.Ui.Filter = new ListFilter("2026-11-01", "2026-11-02", "", false, null);
                break;
            default:
                rig.Ui.OnCall = (call, _) =>
                {
                    if (call == "filter") rig.Stop = true;
                };
                break;
        }
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(code, outcome.Code);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(WriteUnknown, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Journal.Last("v1"));
        Assert.Equal(JournalState.Check, rig.Journal.Last("v2"));
    }

    [Fact(DisplayName = "AC-017.7 쓰다 멈춘 사람이 묶음 뒤쪽에 있어도 먼저 처리한다: 칸에 저장 안 된 글이 있는 채 다른 사람 줄을 열지 않는다")]
    public void LeftoverGoesFirst()
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        var opened = new List<string>();
        rig.Ui.OpenOverride = (chart, _, __) =>
        {
            opened.Add(chart);
            return null;
        };
        var outcome = rig.Run(new[] { Sample.Item(2), Sample.Item(1) });
        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(new[] { "900001", "900002" }, opened);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal("가짜 메모 2", rig.Ui.Bit["900002"]);
    }

    [Fact(DisplayName = "AC-017.7 쓰다 멈춘 사람이 묶음 뒤쪽에 있고 칸이 다르면 앞사람을 열지 않고 멈춘다")]
    public void LeftoverDifferentStopsBeforeOthers()
    {
        var rig = LeftOpen(Sample.Item(1), "반만 들어간 글", JournalState.WriteUnconfirmed);
        var outcome = rig.Run(new[] { Sample.Item(2), Sample.Item(1) });
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(CheckMemoBox, Of(outcome, "v1").Reason);
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-017.9 쓰다 멈춘 사람의 저장 잇기 중 멈춤 신호가 서도 그 사람의 저장·다시 읽기는 마친다")]
    public void LeftoverFinishesDespiteStop()
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "read") rig.Stop = true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(JournalState.Done, rig.Journal.Last("v1"));
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-017.7 전 확인 필요가 쓰기 없이 끝난 사람(미처리)은 지금까지와 같다: 같으면 이미 입력됨, 다르면 이미 있음으로 건너뛰고 다음 사람으로, 비었으면 입력")]
    [InlineData("가짜 메모 1", "완료", "이미 입력됨", 0, 0)]
    [InlineData("직원이 쓴 메모", "건너뜀", "이미 있음", 0, 0)]
    [InlineData("", "완료", "입력", 1, 1)]
    public void EarlierCheckWithoutWrite(string inBit, string result, string reason, int writes, int saves)
    {
        var rig = new RunnerRig();
        rig.Ui.Filter = new ListFilter("2026-11-01", "2026-11-02", "", false, null);
        var first = rig.Run(Sample.Items(2));
        Assert.Equal("미처리", Of(first, "v1").Reason);
        Assert.Equal(JournalState.Check, rig.Journal.Last("v1"));

        rig.Ui.Filter = new ListFilter("2026-01-01", "2026-12-31", "", false, null);
        rig.Ui.Bit["900001"] = inBit;
        var outcome = rig.Run(Sample.Items(2));

        Assert.Equal(InputStatus.Finished, outcome.Status);
        Assert.Equal(result, Of(outcome, "v1").Result);
        Assert.Equal(reason, Of(outcome, "v1").Reason);
        // 둘째 사람은 빈칸이라 쓰기·저장이 한 번씩 더 있다
        Assert.Equal(writes + 1, rig.Ui.Writes);
        Assert.Equal(saves + 1, rig.Ui.Saves);
        Assert.Equal(2, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-017.7 쓰다 멈춘 기록이 아니면 지금까지와 같다: 칸이 같으면 저장을 누르지 않고 이미 입력됨, 다르면 건너뛰고 다음 사람으로")]
    [InlineData(JournalState.Done)]
    [InlineData(JournalState.Skipped)]
    [InlineData(JournalState.Check)]
    public void OtherEarlierStatesUnchanged(JournalState last)
    {
        var same = LeftOpen(Sample.Item(1), "가짜 메모 1", last);
        var sameOutcome = same.Run(Sample.Items(1));
        Assert.Equal("이미 입력됨", Of(sameOutcome, "v1").Reason);
        Assert.Equal(0, same.Ui.Saves);

        var different = LeftOpen(Sample.Item(1), "직원이 쓴 메모", last);
        var differentOutcome = different.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Finished, differentOutcome.Status);
        Assert.Equal("이미 있음", Of(differentOutcome, "v1").Reason);
        Assert.Equal(2, different.Ui.Opens);
    }

    [Theory(DisplayName = "AC-017.7 입력 기록을 읽지 못하면 '기록 없음'으로 보지 않고 아무도 열지 않은 채 멈춘다. 기록도 덮지 않는다")]
    [InlineData(true, "E-STORE-FAILED")]
    [InlineData(false, "E-INPUT-STOPPED")]
    public void JournalReadFailureStops(bool storeError, string code)
    {
        var rig = new RunnerRig();
        if (storeError) rig.Journal.ReadFailWhen = visitKey => visitKey == "v2";
        else rig.Journal.ReadThrowWhen = visitKey => visitKey == "v2";
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(code, outcome.Code);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(new[] { "v1", "v2", "v3" }, outcome.Results.Select(result => result.VisitKey));
        Assert.All(outcome.Results, result =>
        {
            Assert.Equal(InputResults.Check, result.Result);
            Assert.Equal("미처리", result.Reason);
        });
        Assert.Empty(rig.Journal.Marks);
        Assert.DoesNotContain("비밀 글", outcome.ToJson(), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-017.7 입력 기록을 못 읽으면 칸에 우리 글이 있어도 이미 입력됨이라 하지 않고, '쓰다 멈춤' 기록은 그대로다")]
    public void JournalReadFailureNeverReportsDone()
    {
        var rig = LeftOpen(Sample.Item(1), "가짜 메모 1", JournalState.WriteUnconfirmed);
        rig.Journal.ReadFailWhen = _ => true;
        var outcome = rig.Run(Sample.Items(1));
        Assert.Equal("E-STORE-FAILED", outcome.Code);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.False(rig.Ui.Bit.ContainsKey("900001"));
        Assert.Equal(new[] { JournalState.WriteUnconfirmed }, rig.Journal.Of("v1"));
    }

    // AC-017.8 : 원본 입력 보호 사례를 가짜 IChartUi로

    [Fact(DisplayName = "AC-017.8 changed-immediately-before-write: 쓰기 바로 앞에 메모가 바뀌면 쓰지 않는다")]
    public void MemoChangedRightBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "select") rig.Ui.Editor = "그사이 직원이 쓴 메모";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
        Assert.Equal(new[] { JournalState.Writing, JournalState.Skipped }, rig.Journal.Of("v1"));
    }

    [Fact(DisplayName = "AC-017.8 입력 직전 기존 메모가 바뀌면(둘째 읽기) 원본 문구로 건너뛰고 쓰지 않는다")]
    public void MemoChangedBeforeApproval()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "editable") rig.Ui.Editor = "그사이 직원이 쓴 메모";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal("입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.", Of(outcome, "v1").Reason);
        Assert.DoesNotContain(JournalState.Writing, rig.Journal.Of("v1"));
    }

    [Fact(DisplayName = "AC-017.8 patient-changed-before-write: 쓰기 바로 앞에 환자가 바뀌면 쓰지 않는다")]
    public void PatientChangedRightBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "select") rig.Ui.OpenChart = "900099";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(InputResults.Skipped, Of(outcome, "v1").Result);
    }

    [Fact(DisplayName = "AC-017.8 입력 직전 검사에서 환자가 달라지면 원본 문구로 건너뛴다")]
    public void PatientChangedAtSecondCheck()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "editable") rig.Ui.OpenChart = "900099";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal("환자 불일치 - 자동입력을 중단했습니다. (입력 직전 화면이 바뀜)", Of(outcome, "v1").Reason);
    }

    [Fact(DisplayName = "AC-017.8 EM_REPLACESEL이 안 먹으면 ValuePattern으로 다시, 그 앞에 대상·내용을 또 확인한다")]
    public void FallsBackToValuePattern()
    {
        var rig = new RunnerRig { Ui = { ReplaceWorks = false } };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        var calls = rig.Ui.Calls;
        var value = calls.IndexOf("value");
        Assert.True(value > 0);
        Assert.Equal("read", calls[value - 1]);
        Assert.Equal("target", calls[value - 2]);
    }

    [Fact(DisplayName = "AC-017.8 첫 쓰기가 들어간 뒤 값이 다르면 다시 쓰지 않는다(바뀐 값은 다시 시도하지 않음)")]
    public void NoSecondWriteAfterPartial()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "read" && rig.Ui.Written.Count == 1) rig.Ui.Editor = "반만 들어간 글";
        };
        var outcome = rig.Run(new[] { Sample.Item(1) });
        Assert.Equal(1, rig.Ui.Writes);
        Assert.Equal(InputResults.Check, Of(outcome, "v1").Result);
        Assert.Equal(0, rig.Ui.Saves);
    }

    [Fact(DisplayName = "AC-017.8 ValuePattern이 없거나 예외여도 다시 읽어 판단한다(원본 catch)")]
    public void ValuePatternMissingOrThrows()
    {
        var missing = new RunnerRig { Ui = { ReplaceWorks = false, ValueSupported = false } };
        Assert.Equal(InputResults.Check, Of(missing.Run(new[] { Sample.Item(1) }), "v1").Result);
        var throws = new RunnerRig { Ui = { ReplaceWorks = false, ValueThrows = true } };
        Assert.Equal(InputResults.Check, Of(throws.Run(new[] { Sample.Item(1) }), "v1").Result);
        Assert.Equal(0, throws.Ui.Saves);
    }

    // AC-017.9 : 표준 입력 닫힘

    [Fact(DisplayName = "AC-017.9 확인 창이 떠 있는 중 닫히면 [취소]와 같다. 창이 닫힘 신호를 받는다")]
    public void ClosedDuringConfirm()
    {
        var rig = new RunnerRig();
        rig.Confirm.Behavior = closeRequested =>
        {
            Assert.False(closeRequested());
            rig.Stop = true;
            return !closeRequested();
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Cancelled, outcome.Status);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.9 [확인]과 같은 때 닫혀도 하나도 입력하지 않는다")]
    public void ClosedRightAfterConfirm()
    {
        var rig = new RunnerRig();
        rig.Confirm.Behavior = _ =>
        {
            rig.Stop = true;
            return true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Cancelled, outcome.Status);
        Assert.Equal(0, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.9 확인 창을 띄우기 전에 이미 닫혔으면 창을 띄우지 않고 cancelled")]
    public void ClosedBeforeConfirm()
    {
        var rig = new RunnerRig { Stop = true };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Cancelled, outcome.Status);
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-017.9 쓰기 전에 닫힘 신호가 서면 쓰지 않고, 그 사람과 남은 사람은 미처리로 Journal에 남는다")]
    public void ClosedBeforeWrite()
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == "editable") rig.Stop = true;
        };
        var outcome = rig.Run(Sample.Items(2));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v1"));
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v2"));
        Assert.Equal("미처리", Of(outcome, "v1").Reason.Substring(0, 3));
        Assert.Equal("미처리", Of(outcome, "v2").Reason);
    }

    [Theory(DisplayName = "AC-017.9 쓰기를 시작했으면 신호가 서도 그 사람의 쓰기 → 다시 읽기 → 저장 → 다시 읽기를 마친 뒤 멈춘다")]
    [InlineData("replace")]
    [InlineData("save")]
    public void ClosedDuringWrite(string at)
    {
        var rig = new RunnerRig();
        rig.Ui.OnCall = (call, number) =>
        {
            if (call == at) rig.Stop = true;
        };
        var outcome = rig.Run(Sample.Items(3));
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal(InputResults.Done, Of(outcome, "v1").Result);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit["900001"]);
        Assert.Equal(1, rig.Ui.Saves);
        var after = rig.Ui.Calls.Skip(rig.Ui.Calls.IndexOf("save")).ToArray();
        Assert.Equal(new[] { "save", "read" }, after);
        Assert.Equal(new[] { JournalState.Writing, JournalState.Done }, rig.Journal.Of("v1"));
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v2"));
        Assert.Equal(new[] { JournalState.Check }, rig.Journal.Of("v3"));
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-017.1 비트 화면에 진짜 쓰는 길은 가짜 IChartUi의 두 메서드뿐이다: 거절이면 Written이 비어 있다(AC-017.8 가짜 화면에만 씀)")]
    public void OnlyTheFakeIsWritten()
    {
        var rig = new RunnerRig();
        rig.Ui.Bit["900001"] = "직원이 쓴 메모";
        rig.Run(new[] { Sample.Item(1) });
        Assert.Empty(rig.Ui.Written);
    }
}
