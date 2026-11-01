namespace Precheck.Core.Input;

/// <summary>자동 입력 오류 번호(design.md 4-5). 문구는 웹 lib/errors.ts 한 곳에 있다.</summary>
public static class InputErrors
{
    /// <summary>비트 화면 지문이 다르다: 프로세스·창·칸이 없거나 여럿(AC-017.4).</summary>
    public const string UiChanged = "E-BIT-UI-CHANGED";

    /// <summary>저장 안 한 처방 창이 떠 있다. 누르지 않고 멈췄다(AC-017.5).</summary>
    public const string UnsavedRx = "E-BIT-UNSAVED-RX";

    /// <summary>원본 fatal 문구·3번 잇따른 실패·[멈추기]·표준 입력 닫힘으로 멈췄다(AC-017.5·AC-017.9).</summary>
    public const string Stopped = "E-INPUT-STOPPED";

    /// <summary>다른 도우미 프로세스가 작업 잠금을 쥐고 있다(AC-017.10).</summary>
    public const string Busy = "E-BRIDGE-BUSY";
}
