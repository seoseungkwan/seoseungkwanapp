using System;

namespace Precheck.Core.Input;

/// <summary>
/// 환자를 여는 동안 조회 모드 안내창을 보는 박자(AC-036.4). 원본 medicore/bit_dialogs.py ViewModeNoticeWatcher의 interval·limit 그대로다.
/// 창을 찾아 누르는 일은 Precheck.Windows.ViewModeNotices가 하고, 어떤 창이 안내창인지는 ChartRules가 정한다.
/// </summary>
public static class ViewModeWatch
{
    public const int EveryMs = 250;
    public const int MaxPresses = 5;

    /// <param name="stopped">환자 열기가 끝났다.</param>
    /// <param name="press">남은 수까지만 누르고 누른 수를 돌려준다.</param>
    /// <returns>누른 수.</returns>
    public static int Run(IWaitClock clock, Func<bool> stopped, Func<int, int> press)
    {
        if (clock == null) throw new ArgumentNullException(nameof(clock));
        if (stopped == null) throw new ArgumentNullException(nameof(stopped));
        if (press == null) throw new ArgumentNullException(nameof(press));

        var pressed = 0;
        while (pressed < MaxPresses)
        {
            clock.Sleep(EveryMs);
            if (stopped()) break;
            pressed += press(MaxPresses - pressed);
        }
        return pressed;
    }
}
