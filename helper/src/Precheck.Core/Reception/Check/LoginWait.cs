using System;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 확인 명령의 비트 로그인 창 기다리기(spec reception-phone TASK-32, AC-1401.15). 시계와 쉼은 주입한다(시험은 가짜 시계).
/// 로그인은 다른 스레드에서 돌고, 여기서는 끝났는가·이 프로세스에 보이는 창이 있는가만 쉼마다 묻는다
/// (창을 찾는 쪽이 새 창을 가운데·맨 위로 둔다). 창이 60초 안에 하나도 안 뜨면 LoginWindowMissingException,
/// 창이 떠도 5분 안에 안 끝나면 LoginTooLongException. 창 없이 끝난 로그인(자동 로그인·취소)은 그대로 돌아온다.
/// 던져도 로그인 스레드는 멈추지 않는다(부른 쪽이 배경 스레드로 둔다).
/// </summary>
public static class LoginWait
{
    /// <summary>보이는 창이 하나도 없을 때 기다리는 한도.</summary>
    public static readonly TimeSpan ShowLimit = TimeSpan.FromSeconds(60);

    /// <summary>창이 떠도 로그인을 기다리는 전체 한도.</summary>
    public static readonly TimeSpan TotalLimit = TimeSpan.FromMinutes(5);

    /// <summary>한 번 쉬는 시간.</summary>
    public static readonly TimeSpan Poll = TimeSpan.FromMilliseconds(250);

    /// <param name="finished">로그인이 끝났는가(돌려줬거나 던졌거나).</param>
    /// <param name="windowShown">지금 이 프로세스에 보이는 창이 있는가. 쉼마다 부른다.</param>
    public static void Until(Func<bool> finished, Func<bool> windowShown, Func<DateTime> now, Action<TimeSpan> sleep)
    {
        if (finished == null) throw new ArgumentNullException(nameof(finished));
        if (windowShown == null) throw new ArgumentNullException(nameof(windowShown));
        if (now == null) throw new ArgumentNullException(nameof(now));
        if (sleep == null) throw new ArgumentNullException(nameof(sleep));

        var started = now();
        var seen = false;
        while (!finished())
        {
            if (windowShown()) seen = true;
            var spent = now() - started;
            if (!seen && spent >= ShowLimit) throw new LoginWindowMissingException();
            if (spent >= TotalLimit) throw new LoginTooLongException();
            sleep(Poll);
        }
    }
}

/// <summary>로그인 창이 60초 안에 보이지 않았다. 보고서에는 형 이름만 간다(CheckField.Failed).</summary>
public sealed class LoginWindowMissingException : TimeoutException
{
}

/// <summary>로그인 창이 떴지만 5분 안에 로그인이 끝나지 않았다. 보고서에는 형 이름만 간다.</summary>
public sealed class LoginTooLongException : TimeoutException
{
}

/// <summary>창을 작업 영역 가운데에 둘 자리(AC-1401.15). 창이 작업 영역보다 크면 왼쪽 위 모서리를 작업 영역 안에 둔다.</summary>
public static class WindowPlace
{
    public static (int Left, int Top) Center(int width, int height, int workLeft, int workTop, int workWidth, int workHeight) =>
        (workLeft + Math.Max(0, (workWidth - width) / 2), workTop + Math.Max(0, (workHeight - height) / 2));
}
