using System;
using System.IO;
using System.Linq;
using System.Threading;
using Precheck.Core.Input;
using Precheck.Core.Registration;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Input;

/// <summary>
/// 가짜 비트 프로세스(같은 칸 이름의 WinForms 창)에만 쓰는 시험. Actions 윈도우에서만 돈다. 진짜 비트는 의원 PC 시험이다.
/// 환자 줄을 마우스·키보드로 여는 길(OpenListRow)은 이 시험이 돌지 않는다: 이미 열린 환자로만 본다.
/// </summary>
[Collection("fake-bit")]
public class UChartAutomationTests
{
    private static readonly HospitalRegistration Registration =
        new HospitalRegistration("12345678", "SYNTHETIC", @"C:\DrBIT50", @".\SQLEXPRESS", "DRBIT", "0123456789abcdef0123456789abcdef");

    private static InputOutcome Run(UChartAutomation ui, ListJournal journal, string memo = "가짜 메모\n둘째 줄", string date = FakeBit.Date)
    {
        var runner = new InputRunner(ui, new YesConfirm(), new NoProgress(), journal, new ExactMatcher(), () => false);
        return runner.Run(new[] { new InputItem("v1", FakeBit.Chart, FakeBit.Name, date, memo) }, Registration);
    }

    private static string? WaitForFile(string path)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            if (File.Exists(path)) return File.ReadAllText(path);
            Thread.Sleep(100);
        }
        return null;
    }

    [Fact(DisplayName = "AC-017.4 정상 화면이면 프로세스·창·칸 지문이 모두 하나")]
    public void FingerprintOk()
    {
        using var bit = FakeBit.Start();
        using var ui = new UChartAutomation(bit.Root);
        var result = bit.WaitForWindows(ui);
        Assert.Empty(result.Problems);
    }

    [Fact(DisplayName = "AC-017.4 비트가 안 떠 있으면 프로세스와 창 지문이 없다(등록 위치 밖의 같은 이름은 세지 않음)")]
    public void FingerprintNoProcess()
    {
        using var other = FakeBit.Start();
        var root = FakeBit.NewRoot();
        Directory.CreateDirectory(root);
        try
        {
            using var ui = new UChartAutomation(root);
            var result = ui.CheckFingerprint();
            Assert.Contains(UiFingerprint.Process, result.Problems);
            Assert.Contains(UiFingerprint.OutpatientWindow, result.Problems);
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Fact(DisplayName = "AC-017.4 칸이 없으면 그 칸 ID가 목록에 나온다")]
    public void FingerprintMissing()
    {
        using var bit = FakeBit.Start("no-memo");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Equal(new[] { "txtBilCmt" }, bit.WaitForWindows(ui).Problems);
    }

    [Fact(DisplayName = "AC-017.4 같은 칸이 둘 다 보이면 그 칸 ID가 목록에 나오고 입력을 시작하지 않는다")]
    public void FingerprintTwo()
    {
        using var bit = FakeBit.Start("two-memos");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Equal(new[] { "txtBilCmt" }, bit.WaitForWindows(ui).Problems);
        var outcome = Run(ui, new ListJournal());
        Assert.Equal(InputStatus.Stopped, outcome.Status);
        Assert.Equal("E-BIT-UI-CHANGED", outcome.Code);
        Assert.False(File.Exists(bit.Record));
    }

    [Fact(DisplayName = "AC-017.4 같은 칸이 있어도 보이는 것이 하나면 원본 Locate처럼 그것을 쓴다")]
    public void FingerprintHiddenTwin()
    {
        using var bit = FakeBit.Start("hidden-memo");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        Assert.Equal(InputStatus.Finished, Run(ui, new ListJournal()).Status);
        Assert.Equal("가짜 메모\r\n둘째 줄", WaitForFile(bit.Record));
    }

    [Fact(DisplayName = "AC-017.4 진료일 칸(dtpWorkDate)이 없으면 시작하지 않는다")]
    public void FingerprintNoWorkDate()
    {
        using var bit = FakeBit.Start("no-workdate");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Equal(new[] { "dtpWorkDate" }, bit.WaitForWindows(ui).Problems);
    }

    [Fact(DisplayName = "AC-017.3 이미 열린 환자·진료일: 비었으면 쓰기 → 다시 읽기 → 저장 → 다시 읽기, 가짜 비트 저장 파일에만 들어간다")]
    public void WritesToFakeOnly()
    {
        using var bit = FakeBit.Start();
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        var journal = new ListJournal();
        var outcome = Run(ui, journal);
        Assert.Equal(InputStatus.Finished, outcome.Status);
        var result = Assert.Single(outcome.Results);
        Assert.Equal(InputResults.Done, result.Result);
        Assert.Equal("입력", result.Reason);
        Assert.Equal("가짜 메모\r\n둘째 줄", WaitForFile(bit.Record));
        Assert.Equal(new[] { JournalState.Writing, JournalState.Done }, journal.Marks.Select(mark => mark.State));
    }

    [Fact(DisplayName = "AC-017.3 비트에 다른 메모가 있으면 건너뜀 '이미 있음', 저장을 누르지 않는다")]
    public void KeepsOtherMemo()
    {
        using var bit = FakeBit.Start(memo: "직원이 쓴 메모");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        var result = Assert.Single(Run(ui, new ListJournal()).Results);
        Assert.Equal(InputResults.Skipped, result.Result);
        Assert.Equal("이미 있음", result.Reason);
        Thread.Sleep(500);
        Assert.False(File.Exists(bit.Record));
    }

    [Fact(DisplayName = "AC-017.3 비트에 같은 메모가 있으면 완료(이미 입력됨), 쓰지 않는다")]
    public void SameMemoDone()
    {
        using var bit = FakeBit.Start(memo: "같은 메모");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        var result = Assert.Single(Run(ui, new ListJournal(), memo: "같은 메모").Results);
        Assert.Equal("이미 입력됨", result.Reason);
        Thread.Sleep(500);
        Assert.False(File.Exists(bit.Record));
    }

    [Fact(DisplayName = "AC-017.3 내원내역 기간 밖의 내원일이면 열지 않고 원본 '기간' 문구로 멈춘다")]
    public void OutsidePeriod()
    {
        using var bit = FakeBit.Start(workDate: "2026-10-28");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        var opened = ui.OpenPatient(FakeBit.Chart, FakeBit.Name, "2026-11-30");
        Assert.Equal(ChartOpenKind.Failed, opened.Kind);
        Assert.Contains("기간", opened.Message, StringComparison.Ordinal);
        Assert.True(ChartRules.IsFatalOpenMessage(opened.Message));
    }

    [Fact(DisplayName = "AC-017.3 내원내역 기간은 dtpFrom·dtpTo에서 읽고 처방코드 칸이 없으면 비운 것으로 본다")]
    public void ReadsPeriod()
    {
        using var bit = FakeBit.Start(from: "2026-10-27", to: "2026-10-29");
        using var ui = new UChartAutomation(bit.Root);
        Assert.Empty(bit.WaitForWindows(ui).Problems);
        var filter = ui.ReadListFilter();
        Assert.Null(filter.Error);
        Assert.Equal(("2026-10-27", "2026-10-29"), (filter.From, filter.To));
        Assert.True(string.IsNullOrEmpty(filter.Code));
    }

    [Fact(DisplayName = "AC-017.5 저장 안 한 처방 창을 알아보고, 누르지 않는다(창이 그대로 떠 있고 입력하지 않음)")]
    public void UnsavedDialogIsNotPressed()
    {
        using var bit = FakeBit.Start("unsaved");
        using var ui = new UChartAutomation(bit.Root);
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (!ui.HasUnsavedRxDialog())
        {
            Assert.True(DateTime.UtcNow < deadline, "가짜 저장 안 한 처방 창이 뜨지 않았다");
            Thread.Sleep(200);
        }
        var outcome = Run(ui, new ListJournal());
        Assert.Equal("E-BIT-UNSAVED-RX", outcome.Code);
        Assert.False(File.Exists(bit.Record));
        Thread.Sleep(500);
        Assert.True(ui.HasUnsavedRxDialog());
        Assert.False(File.Exists(bit.Record + ".dialog-closed"));
    }
}
