using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>맨 앞 창 하나의 모습(핸들·프로세스·물리 픽셀 사각형·최소화·보임). 창 제목은 들지 않는다(환자 이름이 들 수 있다)</summary>
public sealed class ForegroundWindow
{
    public ForegroundWindow(IntPtr handle, int processId, string processName, Rectangle bounds, bool minimized, bool visible)
    {
        Handle = handle;
        ProcessId = processId;
        ProcessName = processName;
        Bounds = bounds;
        Minimized = minimized;
        Visible = visible;
    }

    public IntPtr Handle { get; }
    public int ProcessId { get; }
    /// <summary>확장자 없는 이름(예: DrBIT50)</summary>
    public string ProcessName { get; }
    /// <summary>GetWindowRect 사각형(물리 픽셀, Program이 SetProcessDPIAware를 부른다)</summary>
    public Rectangle Bounds { get; }
    public bool Minimized { get; }
    public bool Visible { get; }
}

/// <summary>
/// 비트 창 찾기(AC-6403.3의 윈도우 쪽). 비트 프로그램인지는 부르는 쪽이 준 조건(Core의 SlipButton.IsBitProcess)으로만 정한다.
/// 읽기만 하고 다른 창을 건드리지 않는다. 창 제목은 ReadChartTitle만 읽고(AC-7402.1), 그 글은 돌려주기만 한다.
/// </summary>
public static class BitWindows
{
    private const uint GaRoot = 2;
    /// <summary>창 제목에서 찾는 글(비트 접수 창 제목 "… 환자정보 - 차트번호 : …", specs/doc-print/notes/bit-docs.md §8)</summary>
    public const string ChartMark = "차트번호";
    /// <summary>자식 창을 이만큼까지만 본다(비트 창이 아무리 커도 0.1초 안에 끝나게)</summary>
    private const int MaxChildren = 4000;

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr param);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr param);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    // 다른 프로세스 창이면 메시지를 보내지 않고 윈도우가 들고 있는 제목만 준다(비트가 멈춰 있어도 기다리지 않는다)
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr hwnd, out NativeRect rect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsIconic(IntPtr hwnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    /// <summary>지금 맨 앞(포커스) 창의 맨 위 창. 없거나 읽지 못하면 null</summary>
    public static ForegroundWindow? ReadForeground()
    {
        try
        {
            var focused = GetForegroundWindow();
            if (focused == IntPtr.Zero) return null;
            var root = GetAncestor(focused, GaRoot);
            if (root == IntPtr.Zero) root = focused;

            if (GetWindowThreadProcessId(root, out var pid) == 0 || pid == 0) return null;
            string name;
            using (var process = Process.GetProcessById(unchecked((int)pid)))
            {
                name = process.ProcessName;
            }
            if (!GetWindowRect(root, out var rect)) return null;
            var bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
            return new ForegroundWindow(root, unchecked((int)pid), name, bounds, IsIconic(root), IsWindowVisible(root));
        }
        catch (Exception e) when (e is ArgumentException || e is InvalidOperationException || e is System.ComponentModel.Win32Exception)
        {
            // 그 사이 프로세스가 끝났거나 이름을 못 읽음
            return null;
        }
    }

    /// <summary>
    /// 맨 앞 창이 비트 프로그램(isBitProcess)이고 보이며 최소화가 아니고 가로가 minWidth 이상이면 그 창, 아니면 null.
    /// (비트의 작은 알림·대화 창에는 버튼을 붙이지 않는다)
    /// </summary>
    public static ForegroundWindow? FindBitWindow(Func<string, bool> isBitProcess, int minWidth = 600)
    {
        if (isBitProcess == null) throw new ArgumentNullException(nameof(isBitProcess));
        var window = ReadForeground();
        if (window == null) return null;
        if (window.Minimized || !window.Visible) return null;
        if (window.Bounds.Width < minWidth) return null;
        return isBitProcess(window.ProcessName) ? window : null;
    }

    /// <summary>
    /// 맨 앞 비트 창(FindBitWindow + SlipButton.IsBitProcess, 단추를 붙이는 판단 그대로)과 그 자식 창들의 제목 가운데
    /// '차트번호'가 든 첫 글. 비트가 맨 앞이 아니거나 그런 제목이 없거나 못 읽으면 null.
    /// 제목에는 환자 이름이 들 수 있다: 부르는 쪽은 숫자만 꺼내고(Core CurrentChart) 글은 파일·로그·화면에 남기지 않는다.
    /// </summary>
    public static string? ReadChartTitle() => ReadChartTitle(SlipButton.IsBitProcess);

    /// <summary>ReadChartTitle의 비트 판단을 받아서</summary>
    public static string? ReadChartTitle(Func<string, bool> isBitProcess)
    {
        var bit = FindBitWindow(isBitProcess);
        if (bit == null) return null;
        var own = TitleOf(bit.Handle);
        if (HasChartMark(own)) return own;

        string? found = null;
        var seen = 0;
        EnumWindowsProc visit = (hwnd, param) =>
        {
            var title = TitleOf(hwnd);
            if (HasChartMark(title))
            {
                found = title;
                return false;
            }
            return ++seen < MaxChildren;
        };
        EnumChildWindows(bit.Handle, visit, IntPtr.Zero);
        GC.KeepAlive(visit);
        return found;
    }

    private static bool HasChartMark(string? title) => title != null && title.IndexOf(ChartMark, StringComparison.Ordinal) >= 0;

    /// <summary>창 제목(GetWindowText). 없거나 못 읽으면 null</summary>
    private static string? TitleOf(IntPtr hwnd)
    {
        var length = GetWindowTextLength(hwnd);
        if (length <= 0) return null;
        var text = new StringBuilder(length + 1);
        return GetWindowText(hwnd, text, text.Capacity) > 0 ? text.ToString() : null;
    }

    /// <summary>그 창이 이 프로그램(PtSlip) 것인지 — 우리 버튼·창이 맨 앞일 때 버튼을 숨기지 않으려고</summary>
    public static bool IsOwnProcess(ForegroundWindow window)
    {
        if (window == null) throw new ArgumentNullException(nameof(window));
        using var self = Process.GetCurrentProcess();
        return window.ProcessId == self.Id;
    }
}
