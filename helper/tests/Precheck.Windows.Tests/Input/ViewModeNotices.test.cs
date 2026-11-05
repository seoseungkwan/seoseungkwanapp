using System;
using System.IO;
using System.Threading;
using Precheck.Core.Input;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Input;

/// <summary>
/// 조회 모드 안내창 누르기(AC-036.4)·제외 체크 읽기(AC-036.2)·메모 칸 편집 가능 여부(AC-036.5). 가짜 비트 프로세스의 진짜 #32770 창으로 Actions 윈도우에서만 돈다.
/// 진짜 비트의 창·칸 상태는 의원 PC 시험이다.
/// </summary>
[Collection("fake-bit")]
public class ViewModeNoticesTests
{
    private static FakeBit StartReady(string mode, out UChartAutomation ui)
    {
        var bit = FakeBit.Start(mode);
        ui = new UChartAutomation(bit.Root);
        bit.WaitForWindows(ui);
        return bit;
    }

    private static bool WaitFor(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline) return false;
            Thread.Sleep(100);
        }
        return true;
    }

    [Fact(DisplayName = "AC-036.4 등록한 프로세스의 안내창이면 [확인]을 눌러 닫고 누른 수를 센다")]
    public void PressesTheNotice()
    {
        using var bit = StartReady("view-mode", out var ui);
        using (ui)
        {
            var watch = ViewModeNotices.Watch(new NativeTarget(bit.Root));
            Assert.True(WaitFor(() => File.Exists(bit.Record + ".dialog-closed")), "가짜 안내창이 닫히지 않았다");
            watch.Dispose();
            Assert.InRange(watch.Pressed, 1, ViewModeWatch.MaxPresses);
        }
    }

    [Fact(DisplayName = "AC-036.4 AC-017.5 저장 안 한 처방 창은 단추 글이 [확인]이어도 누르지 않는다")]
    public void LeavesUnsavedRxDialog()
    {
        using var bit = StartReady("unsaved", out var ui);
        using (ui)
        {
            Assert.True(WaitFor(ui.HasUnsavedRxDialog), "가짜 저장 안 한 처방 창이 뜨지 않았다");
            var watch = ViewModeNotices.Watch(new NativeTarget(bit.Root));
            Thread.Sleep(1500);
            watch.Dispose();
            Assert.Equal(0, watch.Pressed);
            Assert.True(ui.HasUnsavedRxDialog());
            Assert.False(File.Exists(bit.Record + ".dialog-closed"));
        }
    }

    [Fact(DisplayName = "AC-036.4 안내창 글이어도 [확인]이 아닌 단추는 누르지 않는다")]
    public void LeavesOtherButton()
    {
        using var bit = StartReady("view-mode-no-confirm", out var ui);
        using (ui)
        {
            Assert.True(WaitFor(() => ui.ReadDialog() == DialogState.Dialog), "가짜 안내창이 뜨지 않았다");
            var watch = ViewModeNotices.Watch(new NativeTarget(bit.Root));
            Thread.Sleep(1500);
            watch.Dispose();
            Assert.Equal(0, watch.Pressed);
            Assert.Equal(DialogState.Dialog, ui.ReadDialog());
            Assert.False(File.Exists(bit.Record + ".dialog-closed"));
        }
    }

    [Fact(DisplayName = "AC-036.4 등록 위치가 다른 프로세스의 안내창은 누르지 않는다")]
    public void LeavesOtherInstallation()
    {
        using var bit = StartReady("view-mode", out var ui);
        var other = FakeBit.NewRoot();
        Directory.CreateDirectory(other);
        try
        {
            using (ui)
            {
                Assert.True(WaitFor(() => ui.ReadDialog() == DialogState.Dialog), "가짜 안내창이 뜨지 않았다");
                var watch = ViewModeNotices.Watch(new NativeTarget(other));
                Thread.Sleep(1000);
                watch.Dispose();
                Assert.Equal(0, watch.Pressed);
                Assert.False(File.Exists(bit.Record + ".dialog-closed"));
            }
        }
        finally
        {
            Directory.Delete(other, true);
        }
    }

    [Fact(DisplayName = "AC-036.2 내원내역의 처방코드 칸과 기본 모양 체크 칸의 제외 체크(Patterns.Toggle)를 읽는다")]
    public void ReadsCodeAndExcept()
    {
        using var bit = StartReady("code-filter", out var ui);
        using (ui)
        {
            var filter = ui.ReadListFilter();
            Assert.Null(filter.Error);
            Assert.Equal(FakeBit.CodeFilter, filter.Code);
            Assert.True(filter.CodeExcept);
        }
    }

    [Fact(DisplayName = "AC-036.2 제외 체크 칸이 없으면 못 읽음(null)이다")]
    public void MissingExceptIsUnread()
    {
        using var bit = StartReady("normal", out var ui);
        using (ui)
        {
            Assert.Null(ui.ReadListFilter().CodeExcept);
        }
    }

    [Theory(DisplayName = "AC-036.5 읽기 전용이나 꺼진 메모 칸은 편집 불가다(EM_REPLACESEL은 읽기 전용 칸에도 들어가므로 먼저 본다)")]
    [InlineData("read-only-memo", false)]
    [InlineData("disabled-memo", false)]
    [InlineData("normal", true)]
    public void MemoEditable(string mode, bool expected)
    {
        using var bit = StartReady(mode, out var ui);
        using (ui)
        {
            Assert.True(ui.Locate().Ok);
            Assert.Equal(expected, ui.IsMemoEditable());
        }
    }
}
