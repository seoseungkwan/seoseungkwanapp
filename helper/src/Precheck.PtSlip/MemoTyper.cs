using System;
using System.Runtime.InteropServices;
using FlaUI.UIA3;

namespace Precheck.PtSlip;

/// <summary>MemoTyper.Append 결과</summary>
public enum MemoTypeResult
{
    /// <summary>칸 끝에 글이 다 들어갔다(다시 읽어 확인)</summary>
    Typed,

    /// <summary>칸이 없거나 꺼졌거나 읽기 전용이라 넣지 않았다</summary>
    NotEditable,

    /// <summary>넣으면 칸 최대 글자 수(비트 '접수메모(당일)'은 50자)를 넘어 넣지 않았다(잘린 글이 들어가지 않게)</summary>
    TooLong,

    /// <summary>
    /// 윈도우가 막아 넣지 못했다(ERROR_ACCESS_DENIED): 비트가 관리자 권한으로 돌고 이 프로그램은 아니면
    /// 칸 읽기(WM_GETTEXT)는 되지만 커서 옮기기·글 넣기(EM_*)는 막힌다(2026-11-20 이 PC 확인). 칸은 그대로다
    /// </summary>
    Blocked,

    /// <summary>칸을 못 읽었거나 메시지가 안 갔거나 넣은 뒤 글이 예상과 다르다(무엇이 들어갔는지 모를 때는 다시 넣지 않는다)</summary>
    Failed,
}

/// <summary>
/// 비트 '접수메모(당일)' 칸 끝에 글자를 넣는다(AC-7503.2). 청구 메모 도우미 UChartAutomation과 같은 길: 칸 끝으로 커서(EM_SETSEL 끝, 끝) → EM_REPLACESEL.
/// 칸이 그 메시지를 받고도 글이 그대로면 UI Automation ValuePattern으로 (있던 글 + 새 글)을 넣는다.
/// 비트 DB에 쓰지 않고 저장 단추를 누르지 않는다(저장은 직원). 확인 창 없음. 칸 글은 저장·로그·예외 글에 넣지 않는다.
/// 무엇을 넣을지('/' 붙이기·이미 있음)는 부르는 쪽(Core MemoMerge)이 정하고, 여기는 받은 글을 끝에 붙이기만 한다.
/// 칸 핸들이 있는 스레드와 상관없이 부를 수 있지만 AppendByValue는 UI Automation(COM)이라 STA 스레드(창 스레드)에서 부른다.
/// </summary>
public static class MemoTyper
{
    private const uint EmSetSel = 0x00B1;
    private const uint EmScrollCaret = 0x00B7;
    private const uint EmReplaceSel = 0x00C2;
    private const uint EmGetLimitText = 0x00D5;
    private const uint SmtoAbortIfHung = 0x0002;
    private const uint SelTimeoutMs = 1000;
    private const uint TypeTimeoutMs = 2000;
    private const int GwlStyle = -16;
    private const int EsReadOnly = 0x0800;
    private const int ErrorAccessDenied = 5;
    /// <summary>비트 '접수메모(당일)' 칸 최대 글자 수(2026-11-20 이 PC 확인). 칸이 한도를 알려 주지 않거나 더 크게 알려 줘도 이것을 넘기지 않는다</summary>
    public const int MemoMaxLength = 50;

    /// <summary>칸이 살아 있고 켜져 있고 읽기 전용이 아닌가(UChartAutomation.IsMemoEditable과 같다)</summary>
    public static bool IsEditable(IntPtr box) =>
        box != IntPtr.Zero && IsWindow(box) && IsWindowEnabled(box) && (GetWindowLong(box, GwlStyle) & EsReadOnly) == 0;

    /// <summary>
    /// 칸 끝에 text를 넣는다. 지금 칸 글을 읽고 → 최대 글자 수 보기 → 끝으로 커서 → EM_REPLACESEL(되돌리기 가능) → 다시 읽어 (있던 글 + text)인지 본다.
    /// EM_REPLACESEL이 받아졌는데 글이 그대로면 ValuePattern으로 한 번 더(AppendByValue). 메시지가 시간 안에 안 갔으면 다시 넣지 않고 Failed.
    /// 넣으면 칸 최대 글자 수를 넘으면 아무것도 넣지 않고 TooLong. 윈도우가 메시지를 막으면(권한 다름) 넣지 않고 Blocked.
    /// </summary>
    public static MemoTypeResult Append(IntPtr box, string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (!IsEditable(box)) return MemoTypeResult.NotEditable;
        var before = ReceptionWindows.ReadText(box);
        if (before == null) return MemoTypeResult.Failed;
        if (text.Length == 0) return MemoTypeResult.Typed;

        var limit = Send(box, EmGetLimitText, IntPtr.Zero, IntPtr.Zero, SelTimeoutMs);
        if (limit.Denied) return MemoTypeResult.Blocked;
        // 한도 답이 안 와도(시간 지남) 50자를 넘기지 않는다: 넘기면 칸이 잘린 글을 받아 반쪽 글이 남는다
        var max = limit.Sent && limit.Result > 0 ? (int)Math.Min(limit.Result, MemoMaxLength) : MemoMaxLength;
        if (before.Length + text.Length > max) return MemoTypeResult.TooLong;

        var caret = Send(box, EmSetSel, (IntPtr)before.Length, (IntPtr)before.Length, SelTimeoutMs);
        if (caret.Denied) return MemoTypeResult.Blocked;
        if (!caret.Sent) return MemoTypeResult.Failed;

        if (SendMessageTimeoutText(box, EmReplaceSel, (IntPtr)1, text, SmtoAbortIfHung, TypeTimeoutMs, out _) == IntPtr.Zero)
        {
            // 막혔으면 칸은 그대로다. 시간 안에 안 갔으면 비트가 나중에 받을 수 있으니 다른 길로 다시 넣지 않는다
            return Marshal.GetLastWin32Error() == ErrorAccessDenied ? MemoTypeResult.Blocked : MemoTypeResult.Failed;
        }
        var after = ReceptionWindows.ReadText(box);
        if (after == null) return MemoTypeResult.Failed;
        if (after == before + text)
        {
            Send(box, EmScrollCaret, IntPtr.Zero, IntPtr.Zero, SelTimeoutMs);
            return MemoTypeResult.Typed;
        }
        // 무언가 바뀌었는데 예상과 다르면 두 번 넣지 않는다. 그대로일 때만 ValuePattern
        return after == before ? AppendByValue(box, text, max) : MemoTypeResult.Failed;
    }

    /// <summary>
    /// 대비 길: UI Automation ValuePattern으로 칸 글을 (있던 글 + text)로 바꾸고 커서를 끝에 둔다. 다시 읽어 맞으면 Typed.
    /// (Append가 EM_REPLACESEL이 안 먹을 때만 부른다. ValuePattern은 칸 한도를 지키지 않으므로 Append가 정한 max를 여기서도 본다)
    /// </summary>
    private static MemoTypeResult AppendByValue(IntPtr box, string text, int max)
    {
        if (!IsEditable(box)) return MemoTypeResult.NotEditable;
        var before = ReceptionWindows.ReadText(box);
        if (before == null) return MemoTypeResult.Failed;

        var wanted = before + text;
        if (wanted.Length > max) return MemoTypeResult.TooLong;
        try
        {
            using var uia = new UIA3Automation();
            // UChartAutomation과 같은 2초 제한: 비트가 멈춰도 오래 붙잡히지 않게
            uia.ConnectionTimeout = TimeSpan.FromSeconds(2.0);
            uia.TransactionTimeout = TimeSpan.FromSeconds(2.0);
            var value = uia.FromHandle(box).Patterns.Value;
            if (!value.IsSupported) return MemoTypeResult.Failed;
            if (value.Pattern.IsReadOnly.ValueOrDefault) return MemoTypeResult.NotEditable;
            value.Pattern.SetValue(wanted);
        }
        catch (UnauthorizedAccessException)
        {
            return MemoTypeResult.Blocked;
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return MemoTypeResult.Failed;
        }
        var after = ReceptionWindows.ReadText(box);
        if (after != wanted) return MemoTypeResult.Failed;
        Send(box, EmSetSel, (IntPtr)wanted.Length, (IntPtr)wanted.Length, SelTimeoutMs);
        return MemoTypeResult.Typed;
    }

    /// <summary>메시지 하나를 시간 제한으로 보낸다. Sent = 갔다, Denied = 윈도우가 막았다(권한 다름)</summary>
    private static (bool Sent, bool Denied, long Result) Send(IntPtr box, uint msg, IntPtr wParam, IntPtr lParam, uint timeoutMs)
    {
        if (SendMessageTimeout(box, msg, wParam, lParam, SmtoAbortIfHung, timeoutMs, out var result) != IntPtr.Zero) return (true, false, result.ToInt64());
        return (false, Marshal.GetLastWin32Error() == ErrorAccessDenied, 0);
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowEnabled(IntPtr hwnd);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll", SetLastError = true, EntryPoint = "SendMessageTimeoutW")]
    private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
    private static extern IntPtr SendMessageTimeoutText(IntPtr hwnd, uint msg, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);
}
