using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Precheck.Core.Input;

namespace Precheck.Windows;

/// <summary>
/// 조회 모드 안내창의 [확인] 누르기(AC-036.4). 원본 medicore/bit_dialogs.py를 옮겼다. 판단은 Core ChartRules, 박자는 Core ViewModeWatch이고 여기는 창 찾기·누르기만 한다.
/// 환자를 여는 동안만(UChartAutomation.OpenPatient 안) 뒤 스레드로 돈다. 등록한 BITDoctorOrder.exe 프로세스의 보이는 #32770 창에서 안내창 글이 있을 때만 그 창의 Button [확인]을 누른다.
/// 저장 안 한 처방 창을 포함한 다른 대화 상자는 누르지 않는다(AC-017.5). 창 글을 기록·답·예외에 남기지 않는다(AC-001.6).
/// 못 보거나 못 누르면 그대로 끝난다: 안내창이 남으면 VisitOpener가 기다리다 그 사람을 건너뛴다.
/// </summary>
public sealed class ViewModeNotices : IDisposable
{
    private delegate bool EnumProc(nint hwnd, nint lParam);

    private const uint WM_GETTEXT = 13u;
    private const uint WM_COMMAND = 273u;
    private const uint SMTO_ABORTIFHUNG = 2u;
    private const int MaxText = 1024;

    private readonly NativeTarget target;
    private readonly ManualResetEventSlim done = new ManualResetEventSlim();
    private readonly Thread thread;
    private int pressed;

    private ViewModeNotices(NativeTarget target)
    {
        this.target = target;
        thread = new Thread(Run)
        {
            IsBackground = true,
            Name = "precheck-view-notice",
        };
    }

    /// <summary>보기 시작한다. 환자 열기가 끝나면 Dispose한다.</summary>
    public static ViewModeNotices Watch(NativeTarget target)
    {
        var watch = new ViewModeNotices(target ?? throw new ArgumentNullException(nameof(target)));
        watch.thread.Start();
        return watch;
    }

    /// <summary>지금까지 누른 수.</summary>
    public int Pressed => Volatile.Read(ref pressed);

    public void Dispose()
    {
        done.Set();
        if (thread.Join(TimeSpan.FromSeconds(2))) done.Dispose();
    }

    private void Run()
    {
        try
        {
            var pids = target.ProcessIds();
            if (pids.Count == 0) return;
            ViewModeWatch.Run(new StopClock(done), () => done.IsSet, left =>
            {
                var count = PressUpTo(pids, left);
                Interlocked.Add(ref pressed, count);
                return count;
            });
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // 뒤 스레드의 예외가 도우미를 끝내면 안 된다. 예외 글은 남기지 않는다
        }
    }

    private static int PressUpTo(HashSet<uint> pids, int left)
    {
        var count = 0;
        foreach (var dialog in VisibleDialogs(pids))
        {
            if (count >= left) break;
            if (PressConfirm(dialog)) count++;
        }
        return count;
    }

    private static List<nint> VisibleDialogs(HashSet<uint> pids)
    {
        var found = new List<nint>();
        EnumWindows((hwnd, _) =>
        {
            GetWindowThreadProcessId(hwnd, out var pid);
            if (pids.Contains(pid) && IsWindowVisible(hwnd) && ClassOf(hwnd) == "#32770") found.Add(hwnd);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    /// <summary>안내창이면 그 창의 [확인]을 누른다. 원본처럼 창에 단추의 WM_COMMAND를 보낸다(되돌아오기를 기다리지 않는다).</summary>
    private static bool PressConfirm(nint dialog)
    {
        var children = new List<nint>();
        EnumChildWindows(dialog, (hwnd, _) =>
        {
            children.Add(hwnd);
            return true;
        }, IntPtr.Zero);
        var labelled = children.Select(hwnd => (Hwnd: hwnd, Text: TextOf(hwnd))).ToList();
        if (!ChartRules.IsViewModeNotice(labelled.Select(child => (string?)child.Text))) return false;

        foreach (var child in labelled)
        {
            if (ClassOf(child.Hwnd) == "Button" && ChartRules.IsConfirmButton(child.Text))
            {
                return PostMessage(dialog, WM_COMMAND, GetDlgCtrlID(child.Hwnd) & 0xFFFF, child.Hwnd);
            }
        }
        return false;
    }

    private static string ClassOf(nint hwnd)
    {
        var name = new StringBuilder(64);
        GetClassName(hwnd, name, name.Capacity);
        return name.ToString();
    }

    private static string TextOf(nint hwnd)
    {
        var text = new StringBuilder(MaxText);
        return SendMessageTimeoutSb(hwnd, WM_GETTEXT, MaxText, text, SMTO_ABORTIFHUNG, 500u, out _) == IntPtr.Zero ? "" : text.ToString();
    }

    /// <summary>끝 신호가 오면 바로 깨는 시계: 환자마다 0.25초씩 묶이지 않게 한다.</summary>
    private sealed class StopClock : IWaitClock
    {
        private readonly ManualResetEventSlim stop;
        private readonly SystemWaitClock clock = new SystemWaitClock();

        public StopClock(ManualResetEventSlim stop)
        {
            this.stop = stop;
        }

        public long NowMs => clock.NowMs;

        public void Sleep(int ms) => stop.Wait(ms);
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc callback, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(nint parent, EnumProc callback, nint lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint hwnd, out uint pid);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(nint hwnd);

    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(nint hwnd);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(nint hwnd, uint msg, nint wParam, nint lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetClassNameW")]
    private static extern int GetClassName(nint hwnd, StringBuilder name, int max);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
    private static extern nint SendMessageTimeoutSb(nint hwnd, uint msg, nint wParam, StringBuilder lParam, uint flags, uint timeout, out nint result);
}
