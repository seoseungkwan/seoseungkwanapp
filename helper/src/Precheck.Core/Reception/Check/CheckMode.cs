using System;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 의원 PC 확인 명령으로 켜졌는가(spec reception-phone AC-1401.1). 인자가 정확히 --reception-check 하나(대소문자·공백까지 같게)이고
/// 표준 입력이 콘솔일 때만이다. 크롬은 첫 인자로 호출 origin(때로 --parent-window=)을 넘기고 표준 입력을 파이프로 잇기 때문에
/// 크롬이 켠 도우미는 여기 들 수 없다. 아니면 Program.cs는 지금의 메시지 통로를 그대로 돈다.
/// </summary>
public static class CheckMode
{
    public const string Flag = "--reception-check";

    public static bool IsRequested(string[]? args, bool stdinIsConsole) =>
        stdinIsConsole && args != null && args.Length == 1 && string.Equals(args[0], Flag, StringComparison.Ordinal);
}
