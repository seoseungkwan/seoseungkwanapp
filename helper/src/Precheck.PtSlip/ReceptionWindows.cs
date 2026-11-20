using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 비트 접수 화면 칸 라벨. 비트 판이 바뀌어 글이 달라지면 여기만 고친다.
/// **2026-11-20 이 PC 확인**(BITRegistrations.exe, 맨 위 창 이름 '접수', WinForms):
/// · 한 줄 = 패널(WindowsForms10.Window.8…) 안에 STATIC 라벨 + 한 줄 EDIT(WindowsForms10.EDIT…)
/// · '차트번호(F1)(엔터)' 라벨(창 글에는 단축 글자 '&amp;'가 든다) + 바로 오른쪽 한 줄 칸(값은 14자리 고정 길이, 앞뒤 빈칸이 들 수 있다).
///   같은 패널 오른쪽에 다른 라벨·칸 한 쌍이 더 있다
/// · '접수메모(당일)' 라벨 + 한 줄 칸(패널에 칸 하나, 최대 50자). 바로 아래 '접수메모(연속)'(여러 줄 칸)은 건드리지 않는다(범위 밖)
/// · 칸 이름(AutomationId = WinForms Name txtChtNum·txtMemoN)은 쓰지 않는다: 비트가 관리자 권한으로 돌면 UI Automation에
///   이름 대신 창 핸들 숫자가 나와 실행마다 바뀐다
/// </summary>
public static class ReceptionFields
{
    /// <summary>차트번호 칸 라벨이 이 글로 시작한다(빈칸·줄바꿈·단축 글자 '&amp;' 뺀 뒤, 실제 글 '차트번호(F1)(엔터)')</summary>
    public const string ChartLabelPrefix = "차트번호(F1)";

    /// <summary>메모 칸 라벨(빈칸·줄바꿈·단축 글자 '&amp;' 뺀 뒤 이 글과 같음)</summary>
    public const string MemoLabel = "접수메모(당일)";
}

/// <summary>
/// 찾아 둔 비트 접수 화면 하나(맨 위 창과 두 칸의 핸들). 칸 글은 읽어 돌려주기만 하고 이 개체에도 들지 않는다.
/// 부르는 쪽도 칸 글(차트번호·메모)을 파일·로그·예외 글에 넣지 않는다(AC-7503.3).
/// </summary>
public sealed class ReceptionScreen
{
    internal ReceptionScreen(IntPtr root, IntPtr chartBox, IntPtr memoBox, bool foundByPosition)
    {
        Root = root;
        ChartBox = chartBox;
        MemoBox = memoBox;
        FoundByPosition = foundByPosition;
    }

    /// <summary>접수 화면의 맨 위 창</summary>
    public IntPtr Root { get; }

    /// <summary>차트번호 칸</summary>
    public IntPtr ChartBox { get; }

    /// <summary>'접수메모(당일)' 칸(MemoTyper.Append에 넘긴다)</summary>
    public IntPtr MemoBox { get; }

    /// <summary>라벨과 같은 패널에서 못 찾아 창 전체의 라벨 오른쪽 같은 줄 자리로 찾았나(비트 판이 바뀌었다는 뜻일 수 있다)</summary>
    public bool FoundByPosition { get; }

    /// <summary>차트번호 칸 글 그대로(14자리 고정 길이, 앞뒤 빈칸이 들 수 있어 부르는 쪽이 다듬는다). 못 읽으면 null</summary>
    public string? ReadChart() => ReceptionWindows.ReadText(ChartBox);

    /// <summary>메모 칸 글(빈 글일 수 있음). 못 읽으면 null</summary>
    public string? ReadMemo() => ReceptionWindows.ReadText(MemoBox);

    /// <summary>메모 칸의 화면 사각형(물리 픽셀, Program이 SetProcessDPIAware를 부른다). 못 읽으면 null</summary>
    public Rectangle? MemoBounds() => ReceptionWindows.BoundsOf(MemoBox);
}

/// <summary>
/// 맨 앞 창이 비트 접수 화면인지 보고 차트번호 칸·'접수메모(당일)' 칸을 찾는다(AC-7503.2의 윈도우 쪽). 읽기만 하고 칸을 바꾸지 않는다.
/// 찾는 길: 보이는 STATIC 라벨 가운데 글이 맞는 것(ReceptionFields) → 그 라벨과 같은 부모(패널)의 보이는 한 줄 EDIT
/// (여럿이면 라벨 오른쪽 같은 줄의 가장 가까운 것). 패널에서 못 고르면 창 전체에서 라벨 오른쪽 같은 줄의 가장 가까운 한 줄 EDIT.
/// 맞는 칸이 둘 이상으로 갈리면 고르지 않는다(엉뚱한 칸에 넣지 않게).
/// 두 칸을 다 찾아야 접수 화면으로 본다. Win32만 쓴다(라벨 글은 GetWindowText라 비트가 멈춰도 기다리지 않는다).
/// 찾은 화면은 기억해 두어 0.25초마다 불러도 다시 훑지 않고, 접수 화면이 아닌 비트 창은 1.5초 동안 다시 훑지 않는다.
/// 만든 스레드에서만 부른다. 칸 글은 저장·로그·예외 글에 넣지 않는다.
/// </summary>
public sealed class ReceptionWindows
{
    private const uint GaRoot = 2;
    private const uint WmGetText = 0x000D;
    private const uint WmGetTextLength = 0x000E;
    private const uint SmtoAbortIfHung = 0x0002;
    private const uint TextTimeoutMs = 500;
    private const int EsMultiline = 0x0004;
    private const int GwlStyle = -16;
    /// <summary>칸 글은 이만큼까지만 읽고 더 길면 못 읽은 것으로 본다(메모 칸 50자, 차트번호 칸 14자. 잘린 글로 커서 자리를 잡지 않게)</summary>
    private const int MaxTextLength = 2000;
    /// <summary>자식 창을 이만큼까지만 본다(BitWindows와 같다. 이 PC 접수 화면은 515개)</summary>
    private const int MaxChildren = 4000;
    /// <summary>접수 화면이 아닌 창을 다시 훑기까지(ms)</summary>
    private const int MissRetryMs = 1500;
    /// <summary>대비 길: 라벨 오른쪽 끝과 칸 사이 가장 먼 틈(px)·겹침 여유(px)</summary>
    private const int MaxLabelGapPx = 200;
    private const int LabelSlackPx = 4;
    /// <summary>대비 길: 라벨과 칸의 세로 가운데 차가 이만큼(px) 또는 라벨 높이 절반 안이면 같은 줄</summary>
    private const int SameRowPx = 5;

    private readonly Func<string, bool> isBitProcess;
    private ReceptionScreen? cached;
    private IntPtr missRoot;
    private int missAt;

    /// <summary>비트 프로그램 판단은 [PT 먼저] 단추와 같다(SlipButton.IsBitProcess)</summary>
    public ReceptionWindows()
        : this(SlipButton.IsBitProcess)
    {
    }

    public ReceptionWindows(Func<string, bool> isBitProcess)
    {
        this.isBitProcess = isBitProcess ?? throw new ArgumentNullException(nameof(isBitProcess));
    }

    /// <summary>
    /// 맨 앞 창이 비트 접수 화면이면 그 화면, 아니면 null(비트가 아님·최소화·숨음·두 칸 중 하나라도 못 찾음).
    /// 이 프로그램 창(단추·알림)이 맨 앞이어도 null이다 — 그때 단추를 그대로 둘지는 부르는 쪽(BitWindows.IsOwnProcess)이 정한다.
    /// </summary>
    public ReceptionScreen? FindForeground()
    {
        var front = BitWindows.ReadForeground();
        if (front == null || front.Minimized || !front.Visible) return null;
        if (!isBitProcess(front.ProcessName)) return null;
        return Inspect(front.Handle);
    }

    /// <summary>그 맨 위 창 아래에서 두 칸을 찾는다(맨 앞인지·비트인지는 보지 않는다). 못 찾으면 null</summary>
    public ReceptionScreen? Inspect(IntPtr root)
    {
        if (root == IntPtr.Zero || !IsWindow(root)) return null;
        var known = cached;
        if (known != null && known.Root == root && IsAlive(known)) return known;
        if (root == missRoot && unchecked(Environment.TickCount - missAt) < MissRetryMs) return null;

        var found = Scan(root);
        if (found == null)
        {
            missRoot = root;
            missAt = Environment.TickCount;
            if (known != null && known.Root == root) cached = null;
            return null;
        }
        cached = found;
        missRoot = IntPtr.Zero;
        return found;
    }

    /// <summary>기억해 둔 화면을 잊는다(다음 부름에서 다시 훑는다)</summary>
    public void Forget()
    {
        cached = null;
        missRoot = IntPtr.Zero;
    }

    /// <summary>
    /// 칸 글(WM_GETTEXT, 0.5초까지 기다림, 비트가 멈췄으면 바로 포기. 비트가 관리자 권한이어도 읽힌다).
    /// 빈 칸이면 "", 못 읽거나 2000자보다 길면 null
    /// </summary>
    public static string? ReadText(IntPtr box)
    {
        if (box == IntPtr.Zero) return null;
        if (SendMessageTimeout(box, WmGetTextLength, IntPtr.Zero, IntPtr.Zero, SmtoAbortIfHung, TextTimeoutMs, out var lengthResult) == IntPtr.Zero) return null;
        var length = lengthResult.ToInt64();
        if (length <= 0) return "";
        if (length > MaxTextLength) return null;
        var text = new StringBuilder((int)length + 1);
        if (SendMessageTimeoutText(box, WmGetText, (IntPtr)(length + 1), text, SmtoAbortIfHung, TextTimeoutMs, out _) == IntPtr.Zero) return null;
        return text.ToString();
    }

    /// <summary>칸의 화면 사각형(GetWindowRect). 없거나 크기가 0이면 null</summary>
    public static Rectangle? BoundsOf(IntPtr box)
    {
        if (box == IntPtr.Zero || !GetWindowRect(box, out var rect)) return null;
        var bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
        return bounds.Width > 0 && bounds.Height > 0 ? bounds : null;
    }

    /// <summary>라벨 글 견주기용: 빈칸·줄바꿈 같은 글자와 단축 글자 표시('&amp;', '&amp;&amp;'는 '&amp;' 하나)를 뺀다</summary>
    public static string NormalizeLabel(string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var kept = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (c == '&')
            {
                if (i + 1 < text.Length && text[i + 1] == '&')
                {
                    kept.Append('&');
                    i++;
                }
                continue;
            }
            if (!char.IsWhiteSpace(c) && !char.IsControl(c)) kept.Append(c);
        }
        return kept.ToString();
    }

    /// <summary>기억한 화면이 아직 그대로인가: 두 칸이 살아 있고, 그 맨 위 창 안에 있고, 보인다</summary>
    private static bool IsAlive(ReceptionScreen screen) =>
        IsWindow(screen.ChartBox) && IsWindow(screen.MemoBox)
        && GetAncestor(screen.MemoBox, GaRoot) == screen.Root && GetAncestor(screen.ChartBox, GaRoot) == screen.Root
        && IsWindowVisible(screen.MemoBox) && IsWindowVisible(screen.ChartBox);

    private static ReceptionScreen? Scan(IntPtr root)
    {
        var labels = new List<IntPtr>();
        var edits = new List<IntPtr>();
        foreach (var child in Children(root))
        {
            if (!IsWindowVisible(child)) continue;
            var kind = ClassOf(child);
            if (kind.IndexOf("STATIC", StringComparison.OrdinalIgnoreCase) >= 0) labels.Add(child);
            else if (kind.IndexOf("EDIT", StringComparison.OrdinalIgnoreCase) >= 0 && IsSingleLine(child)) edits.Add(child);
        }
        if (labels.Count == 0 || edits.Count == 0) return null;

        var (memo, memoByPosition) = BoxOf(labels, edits, text => text == ReceptionFields.MemoLabel);
        if (memo == IntPtr.Zero) return null;
        var others = edits.Where(h => h != memo).ToList();
        var (chart, chartByPosition) = BoxOf(labels, others, text => text.StartsWith(ReceptionFields.ChartLabelPrefix, StringComparison.Ordinal));
        if (chart == IntPtr.Zero) return null;
        return new ReceptionScreen(root, chart, memo, memoByPosition || chartByPosition);
    }

    /// <summary>
    /// 글이 맞는 라벨마다 그 칸을 고른다: 같은 패널의 칸이 하나면 그것, 여럿이면 그 가운데 라벨 오른쪽 같은 줄의 가장 가까운 칸
    /// (차트번호 줄 패널에는 오른쪽에 다른 라벨·칸이 하나 더 있다). 패널에서 못 고르면 창 전체에서 오른쪽 같은 줄 칸(대비 길, ByPosition).
    /// 고른 칸이 정확히 하나일 때만 그것(라벨이 여럿이어도 같은 칸을 가리키면 된다). 아니면 Zero
    /// </summary>
    private static (IntPtr Box, bool ByPosition) BoxOf(List<IntPtr> labels, List<IntPtr> edits, Func<string, bool> isLabel)
    {
        var picked = new HashSet<IntPtr>();
        var byPosition = false;
        foreach (var label in labels)
        {
            var text = TitleOf(label);
            if (text == null || !isLabel(NormalizeLabel(text))) continue;

            var panel = GetParent(label);
            var sameParent = edits.Where(h => GetParent(h) == panel).ToList();
            var inPanel = sameParent.Count == 1 ? sameParent[0] : RightOf(label, sameParent);
            if (inPanel != IntPtr.Zero)
            {
                picked.Add(inPanel);
                continue;
            }
            var right = RightOf(label, edits);
            if (right != IntPtr.Zero)
            {
                picked.Add(right);
                byPosition = true;
            }
        }
        return picked.Count == 1 ? (picked.First(), byPosition) : (IntPtr.Zero, false);
    }

    /// <summary>대비 길: 라벨 오른쪽(겹침 여유 4px, 틈 200px 안) 같은 줄(세로 가운데 차 5px 또는 라벨 높이 절반 안)의 가장 가까운 칸. 없으면 Zero</summary>
    private static IntPtr RightOf(IntPtr label, List<IntPtr> edits)
    {
        if (!(BoundsOf(label) is Rectangle l)) return IntPtr.Zero;
        var rowSlack = Math.Max(SameRowPx, l.Height / 2);
        var labelMiddle = l.Top + l.Height / 2;
        var best = IntPtr.Zero;
        var bestGap = int.MaxValue;
        foreach (var edit in edits)
        {
            if (!(BoundsOf(edit) is Rectangle e)) continue;
            if (e.Left < l.Right - LabelSlackPx) continue;
            if (Math.Abs(e.Top + e.Height / 2 - labelMiddle) > rowSlack) continue;
            var gap = e.Left - l.Right;
            if (gap > MaxLabelGapPx || gap >= bestGap) continue;
            best = edit;
            bestGap = gap;
        }
        return best;
    }

    private static List<IntPtr> Children(IntPtr root)
    {
        var found = new List<IntPtr>();
        EnumWindowsProc visit = (hwnd, param) =>
        {
            found.Add(hwnd);
            return found.Count < MaxChildren;
        };
        EnumChildWindows(root, visit, IntPtr.Zero);
        GC.KeepAlive(visit);
        return found;
    }

    private static string ClassOf(IntPtr hwnd)
    {
        var name = new StringBuilder(256);
        return GetClassName(hwnd, name, name.Capacity) > 0 ? name.ToString() : "";
    }

    /// <summary>창 글(GetWindowText: 다른 프로세스 창이면 메시지를 보내지 않고 윈도우가 들고 있는 글만 준다). 없으면 null</summary>
    private static string? TitleOf(IntPtr hwnd)
    {
        var length = GetWindowTextLength(hwnd);
        if (length <= 0 || length > MaxTextLength) return null;
        var text = new StringBuilder(length + 1);
        return GetWindowText(hwnd, text, text.Capacity) > 0 ? text.ToString() : null;
    }

    private static bool IsSingleLine(IntPtr hwnd) => (GetWindowLong(hwnd, GwlStyle) & EsMultiline) == 0;

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr param);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr param);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetClassNameW")]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowTextLengthW")]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowTextW")]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr hwnd, out NativeRect rect);

    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW")]
    private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
    private static extern IntPtr SendMessageTimeoutText(IntPtr hwnd, uint msg, IntPtr wParam, StringBuilder lParam, uint flags, uint timeout, out IntPtr result);
}
