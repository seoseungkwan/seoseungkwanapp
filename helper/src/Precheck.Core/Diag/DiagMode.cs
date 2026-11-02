using System;

namespace Precheck.Core.Diag;

/// <summary>
/// 측정 모드로 켜졌는가(specs/diag-read-speed). 인자가 정확히 --diag-read-speed 하나이고 표준 입력이 콘솔일 때만이다.
/// 크롬은 첫 인자로 호출 origin을 넘기고 표준 입력을 파이프로 잇기 때문에 크롬이 켠 도우미는 여기 들 수 없다.
/// 인자가 안 맞으면 콘솔 쪽 값을 묻지 않아 일반 시작에 아무것도 더하지 않는다.
/// </summary>
public static class DiagMode
{
    public const string Flag = "--diag-read-speed";

    public static bool IsRequested(string[]? args, Func<bool> inputRedirected)
    {
        if (inputRedirected == null) throw new ArgumentNullException(nameof(inputRedirected));
        return args != null && args.Length == 1 && string.Equals(args[0], Flag, StringComparison.Ordinal) && !inputRedirected();
    }
}
