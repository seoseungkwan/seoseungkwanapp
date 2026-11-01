using System;
using System.Diagnostics;
using System.Threading;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Input;

/// <summary>AC-017.2·AC-017.9 도우미 창. [확인]을 누르는 사람 없이 닫히는 길만 본다(누름은 의원 PC 시험).</summary>
[Collection("fake-bit")]
public class InputWindowsTests
{
    [Fact(DisplayName = "AC-017.9 확인 창이 떠 있는 중 표준 입력이 닫히면 [취소]처럼 닫혀 false")]
    public void ConfirmClosesOnSignal()
    {
        var watch = Stopwatch.StartNew();
        var closing = false;
        var timer = new Timer(_ => closing = true, null, 300, Timeout.Infinite);
        var answer = new ConfirmWindow().Ask("가짜 입력 확인", TimeSpan.FromMinutes(1), () => closing);
        timer.Dispose();
        Assert.False(answer);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30));
    }

    [Fact(DisplayName = "AC-017.2 5분이 지나는 경우처럼 시간이 다 되면 false, 시간이 없으면 창 없이 false")]
    public void ConfirmTimesOut()
    {
        Assert.False(new ConfirmWindow().Ask("가짜 입력 확인", TimeSpan.FromMilliseconds(300), () => false));
        Assert.False(new ConfirmWindow().Ask("가짜 입력 확인", TimeSpan.Zero, () => false));
    }

    [Fact(DisplayName = "AC-017.9 이미 닫힌 뒤면 확인 창이 바로 false")]
    public void ConfirmAlreadyClosed() => Assert.False(new ConfirmWindow().Ask("가짜 입력 확인", TimeSpan.FromMinutes(1), () => true));

    [Fact(DisplayName = "AC-017.5 진행 창: 누르기 전에는 멈춤이 아니고, 숫자를 바꾸고 닫아도 걸리지 않는다")]
    public void Progress()
    {
        var watch = Stopwatch.StartNew();
        using (var window = new ProgressWindow())
        {
            Assert.False(window.StopPressed);
            window.Update(0, 3);
            window.Update(1, 3);
            Assert.False(window.StopPressed);
        }
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30));
    }

    [Fact(DisplayName = "AC-017.5 진행 창의 멈춤 표시는 창이 받은 뒤 그대로 남는다")]
    public void ProgressStop()
    {
        using var window = new ProgressWindow();
        window.RequestStop();
        Assert.True(window.StopPressed);
        window.Update(1, 3);
        Assert.True(window.StopPressed);
    }
}
