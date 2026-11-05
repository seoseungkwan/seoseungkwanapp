using System;
using System.Collections.Generic;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;

namespace Precheck.Windows;

/// <summary>
/// 확인 명령의 비트 로그인 창(spec reception-phone TASK-32, AC-1401.15). 의원 PC 1회차에서 콘솔로 켠 확인 명령의 로그인 창이
/// 보이지 않았다(창이 화면 밖·뒤에 뜨거나 아예 안 뜸). 그래서 확인 명령에서만:
/// 로그인(VendorLogin 그대로)을 이 확인 전용 배경 STA 스레드에서 돌리고, 기다리는 동안 이 프로세스의 보이는 최상위 창(콘솔 창 뺌)을
/// 찾아 새 창마다 한 번 작업 영역 가운데·맨 위로 두고 앞으로 부른다. 기다림 규칙(창 없음 60초·전체 5분)은 Core LoginWait다.
/// 한도를 넘으면 기다림만 멈추고 비트 창 스레드는 뒤에 둔다(배경 스레드라 확인이 끝나면 함께 끝난다).
/// 창을 옮기는 호출은 비동기(SWP_ASYNCWINDOWPOS·ShowWindowAsync)라 비트 창 스레드가 멈춰 있어도 기다림이 막히지 않는다.
/// 창 글자는 읽지 않는다. 도우미의 등록·통계 로그인(VendorLogin·Sta)은 이 코드를 쓰지 않는다.
/// </summary>
public static class CheckLoginWindow
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr data);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr data);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentProcessId();

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    /// <summary>HWND_TOPMOST: 맨 위 창으로 둔다.</summary>
    private static readonly IntPtr TopMost = new IntPtr(-1);

    private const uint NoSize = 0x0001;
    private const uint ShowWindowFlag = 0x0040;
    private const uint AsyncWindowPos = 0x4000;
    private const int RestoreCommand = 9;

    /// <summary>
    /// login을 배경 STA 스레드에서 돌리고 LoginWait로 기다린다. 끝나면 그 결과(취소면 null)를 주거나 그 예외를 그대로 던진다.
    /// 창이 60초 안에 안 뜨면 LoginWindowMissingException, 5분 안에 안 끝나면 LoginTooLongException.
    /// </summary>
    public static VendorUser? Run(Func<VendorUser?> login)
    {
        if (login == null) throw new ArgumentNullException(nameof(login));
        var attempt = new Attempt();
        var thread = new Thread(() =>
        {
            try
            {
                attempt.User = login();
            }
            catch (Exception e)
            {
                // 배경 스레드의 예외가 확인을 끝내지 않게 담아 둔다(기다림이 끝난 뒤에 와도)
                attempt.Failure = ExceptionDispatchInfo.Capture(e);
            }
            finally
            {
                attempt.Finish();
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();

        var finder = new Finder(GetCurrentProcessId(), GetConsoleWindow());
        LoginWait.Until(() => attempt.Done, finder.ShowAndFront, () => DateTime.Now, Thread.Sleep);
        attempt.Failure?.Throw();
        return attempt.User;
    }

    /// <summary>로그인 스레드의 결과. done을 마지막에 쓰고(volatile) 먼저 읽어 결과가 함께 보인다.</summary>
    private sealed class Attempt
    {
        private volatile bool done;

        public VendorUser? User { get; set; }

        public ExceptionDispatchInfo? Failure { get; set; }

        public bool Done => done;

        public void Finish() => done = true;
    }

    /// <summary>이 프로세스의 보이는 최상위 창 찾기. 새 창은 한 번만 가운데·맨 위로 둔다(사람이 옮긴 창을 다시 끌어오지 않게).</summary>
    private sealed class Finder
    {
        private readonly uint process;
        private readonly IntPtr console;
        private readonly HashSet<IntPtr> placed = new HashSet<IntPtr>();
        private readonly EnumWindowsProc visit;
        private bool any;

        public Finder(uint process, IntPtr console)
        {
            this.process = process;
            this.console = console;
            // EnumWindows가 도는 동안 대리자가 살아 있게 필드로 잡는다
            visit = Visit;
        }

        /// <summary>지금 보이는 창이 있는가. 새로 보인 창은 가운데·맨 위로 둔다.</summary>
        public bool ShowAndFront()
        {
            any = false;
            EnumWindows(visit, IntPtr.Zero);
            return any;
        }

        private bool Visit(IntPtr window, IntPtr data)
        {
            if (window == console || !IsWindowVisible(window)) return true;
            GetWindowThreadProcessId(window, out var owner);
            if (owner != process) return true;
            if (!GetWindowRect(window, out var rect) || rect.Right <= rect.Left || rect.Bottom <= rect.Top) return true;
            any = true;
            if (placed.Add(window)) Front(window, rect);
            return true;
        }

        private void Front(IntPtr window, Rect rect)
        {
            if (IsIconic(window))
            {
                // 내려 둔 창은 되살린 크기를 알 수 없어 다음 쉼에 다시 옮긴다
                ShowWindowAsync(window, RestoreCommand);
                placed.Remove(window);
                return;
            }
            var screen = console != IntPtr.Zero ? Screen.FromHandle(console) : Screen.PrimaryScreen;
            var area = screen.WorkingArea;
            var (left, top) = WindowPlace.Center(rect.Right - rect.Left, rect.Bottom - rect.Top, area.Left, area.Top, area.Width, area.Height);
            SetWindowPos(window, TopMost, left, top, 0, 0, NoSize | ShowWindowFlag | AsyncWindowPos);
            SetForegroundWindow(window);
        }
    }
}
