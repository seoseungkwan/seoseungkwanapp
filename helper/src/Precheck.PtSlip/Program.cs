using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Precheck.PtSlip;

/// <summary>
/// PT 후 진료 종이 프로그램 입구(specs/pt-slip, AC-6403.5). 이 윈도우 로그인에서 하나만 돈다.
/// 오류 글에는 환자 값(차트번호·이름)을 넣지 않는다. 파일·로그도 남기지 않는다.
/// </summary>
internal static class Program
{
    /// <summary>이 윈도우 로그인(세션) 안에서만 하나. 두 번째로 켜면 아무것도 띄우지 않고 끝난다</summary>
    private const string MutexName = @"Local\SeoseungkwanPtSlip";

    private const string CrashText = "PT 후 진료 종이 프로그램에 문제가 생겨 끝냈어요. 프로그램을 다시 켜 주세요.";
    private const string Title = "PT 후 진료 종이";

    /// <summary>알림은 한 번만(타이머가 같은 오류를 계속 내도 창이 쌓이지 않게)</summary>
    private static int crashed;

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    private static void Main()
    {
        // 창 좌표(GetWindowRect)와 우리 창 자리를 같은 물리 픽셀로 맞춘다. 화면 배율이 100%가 아니어도 버튼이 비트 창에 붙게
        SetProcessDPIAware();

        using var single = new Mutex(true, MutexName, out var first);
        if (!first) return;

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (sender, e) => Crash();
        AppDomain.CurrentDomain.UnhandledException += (sender, e) => ShowCrashOnce();

        try
        {
            // TASK-3: 여기에 [PT 먼저] 버튼 창(ButtonForm)을 넣는다. 지금은 빈 메시지 고리만 돈다
            Application.Run(new ApplicationContext());
        }
        catch (Exception)
        {
            ShowCrashOnce();
        }
        finally
        {
            single.ReleaseMutex();
        }
    }

    /// <summary>화면 스레드 예외: 짧은 글을 한 번 보이고 프로그램을 끝낸다</summary>
    private static void Crash()
    {
        ShowCrashOnce();
        Application.Exit();
    }

    /// <summary>예외 내용(환자 값이 섞일 수 있다)은 보이지 않고 짧은 글만</summary>
    private static void ShowCrashOnce()
    {
        if (Interlocked.Exchange(ref crashed, 1) != 0) return;
        try
        {
            MessageBox.Show(CrashText, Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        catch (Exception)
        {
            // 알림 창도 못 띄우면 조용히 끝난다
        }
    }
}
