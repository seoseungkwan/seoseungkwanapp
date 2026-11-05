using System;
using Precheck.Core.Reception.Check;
using Xunit;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 확인 로그인 창 기다리기(spec reception-phone TASK-32, AC-1401.15): 주입한 시계·쉼으로 본다.
/// 창이 60초 안에 하나도 안 뜨면 LoginWindowMissingException, 떠도 5분 안에 안 끝나면 LoginTooLongException,
/// 창 없이 끝난 로그인(자동 로그인·취소)은 그대로 받는다. 창을 가운데에 둘 자리(WindowPlace)도 여기서 본다.
/// </summary>
public class CheckLoginWaitTests
{
    private static readonly DateTime Start = new DateTime(2026, 11, 5, 10, 0, 0);

    private sealed class Clock
    {
        public DateTime Now = Start;

        public TimeSpan Spent => Now - Start;

        public int Sleeps;
    }

    /// <summary>LoginWait.Until(finished, windowShown, now, sleep). 쉼은 시계를 민다.</summary>
    private static Exception? Until(Clock clock, Func<TimeSpan, bool> finished, Func<TimeSpan, bool> shown) =>
        Record.Exception(() => LoginWait.Until(() => finished(clock.Spent), () => shown(clock.Spent), () => clock.Now, span =>
        {
            Assert.True(span > TimeSpan.Zero && span <= TimeSpan.FromSeconds(1), "쉼은 1초 이하");
            clock.Sleeps++;
            clock.Now += span;
        }));

    [Fact(DisplayName = "AC-1401.15 기다림 한도: 창 없음 60초, 전체 5분")]
    public void Limits()
    {
        Assert.Equal(TimeSpan.FromSeconds(60), LoginWait.ShowLimit);
        Assert.Equal(TimeSpan.FromMinutes(5), LoginWait.TotalLimit);
    }

    [Fact(DisplayName = "AC-1401.15 60초 안에 보이는 창이 하나도 없고 로그인도 안 끝나면 LoginWindowMissingException(시간 초과 형)")]
    public void NoWindowWithinSixtySeconds()
    {
        var clock = new Clock();
        var shownCalls = 0;

        var error = Until(clock, _ => false, _ =>
        {
            shownCalls++;
            return false;
        });

        Assert.IsType<LoginWindowMissingException>(error);
        Assert.IsAssignableFrom<TimeoutException>(error);
        Assert.True(clock.Spent >= TimeSpan.FromSeconds(60), clock.Spent.ToString());
        Assert.True(clock.Spent <= TimeSpan.FromSeconds(61), clock.Spent.ToString());
        // 기다리는 동안 창을 계속 찾는다(새 창마다 가운데·맨 위로 두려고)
        Assert.True(shownCalls >= 60, shownCalls.ToString());
    }

    [Fact(DisplayName = "AC-1401.15 창이 59초에 뜨면 60초에 끊지 않고, 로그인이 끝나면 그대로 돌아온다")]
    public void WindowJustInTime()
    {
        var clock = new Clock();

        var error = Until(clock, spent => spent >= TimeSpan.FromSeconds(100), spent => spent >= TimeSpan.FromSeconds(59));

        Assert.Null(error);
        Assert.True(clock.Spent >= TimeSpan.FromSeconds(100) && clock.Spent <= TimeSpan.FromSeconds(101), clock.Spent.ToString());
    }

    [Fact(DisplayName = "AC-1401.15 창이 한 번 떴다 닫혀도(다음 창 사이) 창 없음으로 끊지 않는다")]
    public void WindowSeenThenClosed()
    {
        var clock = new Clock();

        var error = Until(clock, spent => spent >= TimeSpan.FromSeconds(90),
            spent => spent >= TimeSpan.FromSeconds(10) && spent < TimeSpan.FromSeconds(20));

        Assert.Null(error);
    }

    [Fact(DisplayName = "AC-1401.15 창이 떠도 5분 안에 로그인이 끝나지 않으면 LoginTooLongException(시간 초과 형)")]
    public void WindowButTooLong()
    {
        var clock = new Clock();

        var error = Until(clock, _ => false, spent => spent >= TimeSpan.FromSeconds(5));

        Assert.IsType<LoginTooLongException>(error);
        Assert.IsAssignableFrom<TimeoutException>(error);
        Assert.True(clock.Spent >= TimeSpan.FromMinutes(5) && clock.Spent <= TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1), clock.Spent.ToString());
    }

    [Fact(DisplayName = "AC-1401.15 창 없이 바로 끝난 로그인(자동 로그인·취소)은 쉬지 않고 그대로 받는다")]
    public void FinishedWithoutWindow()
    {
        var clock = new Clock();

        var error = Until(clock, _ => true, _ => false);

        Assert.Null(error);
        Assert.Equal(0, clock.Sleeps);
    }

    [Fact(DisplayName = "AC-1401.15 창 없이 30초에 끝난 로그인도 그대로 받는다(60초 한도 안)")]
    public void FinishedLaterWithoutWindow()
    {
        var clock = new Clock();

        var error = Until(clock, spent => spent >= TimeSpan.FromSeconds(30), _ => false);

        Assert.Null(error);
        Assert.True(clock.Spent < TimeSpan.FromSeconds(31), clock.Spent.ToString());
    }

    [Fact(DisplayName = "AC-1401.15 기다리는 함수들이 null이면 ArgumentNullException")]
    public void NullArguments()
    {
        Func<bool> no = () => false;
        Func<DateTime> now = () => Start;
        Action<TimeSpan> sleep = _ => { };
        Assert.Throws<ArgumentNullException>(() => LoginWait.Until(null!, no, now, sleep));
        Assert.Throws<ArgumentNullException>(() => LoginWait.Until(no, null!, now, sleep));
        Assert.Throws<ArgumentNullException>(() => LoginWait.Until(no, no, null!, sleep));
        Assert.Throws<ArgumentNullException>(() => LoginWait.Until(no, no, now, null!));
    }

    // ── 가운데 자리 ─────────────────────────────────────────────

    [Theory(DisplayName = "AC-1401.15 창을 작업 영역 가운데에 두고, 작업 영역보다 크면 왼쪽 위 모서리를 작업 영역 안에 둔다")]
    [InlineData(400, 300, 0, 0, 1920, 1040, 760, 370)]
    [InlineData(401, 301, 0, 0, 1920, 1040, 759, 369)]
    [InlineData(400, 300, 1920, 0, 1280, 984, 2360, 342)]
    [InlineData(400, 300, -1280, 40, 1280, 984, -840, 382)]
    [InlineData(2000, 1200, 0, 0, 1920, 1040, 0, 0)]
    [InlineData(2000, 300, 100, 50, 1920, 1040, 100, 420)]
    public void CenterInWorkArea(int width, int height, int workLeft, int workTop, int workWidth, int workHeight, int left, int top) =>
        Assert.Equal((left, top), WindowPlace.Center(width, height, workLeft, workTop, workWidth, workHeight));
}
