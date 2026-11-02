using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;
using System.Threading;
using Precheck.Core.Bit;
using Precheck.Core.Diag;

namespace Precheck.Windows;

/// <summary>
/// 측정 모드 입구(specs/diag-read-speed). speed-check.cmd → PrecheckHelper.exe --diag-read-speed로만 온다.
/// 측정 모드에서는 표준 출력이 크롬 통로가 아니라 사용자가 보는 콘솔이므로 여기서만 Console로 쓴다(일반 시작 길에는 이 코드가 없다).
/// 콘솔에 쓰는 것은 고정 글·보고서 경로·예외 형 이름뿐이다. 설치한 도우미의 프로그램 파일과 레지스트리는 건드리지 않는다
/// (등록 파일을 읽을 때 깨진 파일을 .bak으로 되살리는 것만 제품과 같은 동작으로 남는다).
/// </summary>
public static class DiagEntry
{
    private const int ExitFailed = 1;
    private const int ExitWatchdog = 3;

    private const int StandardInputHandle = -10;
    private const uint QuickEditMode = 0x0040;
    private const uint ExtendedFlags = 0x0080;

    private static readonly TimeSpan TickEvery = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan WatchdogAfter = TimeSpan.FromMinutes(45);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetConsoleMode(IntPtr handle, out uint mode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetConsoleMode(IntPtr handle, uint mode);

    public static int Run(Func<BitServices> createServices)
    {
        if (createServices == null) throw new ArgumentNullException(nameof(createServices));
        try
        {
            UseKoreanConsole();
            TurnOffQuickEdit();
            ShowNotice();
            Console.ReadLine();

            // 전체 40분·단계 끝·45분 감시·보고서 started는 모두 엔터를 누른 때부터 잰다
            var clock = Stopwatch.StartNew();
            var stream = DiagReportPath.Open(DiagReportPath.Folders(AppDomain.CurrentDomain.BaseDirectory, Path.GetTempPath()), DateTime.Now, out var path);
            var report = new DiagReport(stream);
            ShowPath(path);

            var progress = new DiagProgress(Console.Out, () => clock.Elapsed, DiagRunner.StepCount);
            using (new Timer(_ => progress.Tick(), null, TickEvery, TickEvery))
            using (new Timer(_ => Watchdog(report, stream, path), null, WatchdogAfter, Timeout.InfiniteTimeSpan))
            {
                new DiagRunner(createServices(), new DiagBitConnector(), report, progress, () => clock.Elapsed, () => DateTime.Now).Run();
            }

            stream.Dispose();
            Console.WriteLine();
            Console.WriteLine("다 끝났어요. 메모장에 열린 글을 모두 복사해서 채팅에 붙여 넣어 주세요.");
            ShowPath(path);
            OpenNotepad(path);

            // 재는 동안 눌린 엔터가 쌓여 있으면 이 안내가 보이자마자 창이 닫힌다. 입력이 콘솔임은 DiagMode가 보장한다
            while (Console.KeyAvailable) Console.ReadKey(true);
            Console.WriteLine("엔터를 누르면 이 창이 닫혀요.");
            Console.ReadLine();
            return 0;
        }
        catch (Exception e)
        {
            // 보고서는 줄마다 디스크에 있으므로 여기까지의 결과는 남는다. 예외 글은 쓰지 않는다
            Console.WriteLine();
            Console.WriteLine("측정을 끝내지 못했어요. 이 창을 사진으로 찍어 보내 주세요. 오류 종류: " + e.GetType().Name);
            return ExitFailed;
        }
    }

    private static void ShowNotice()
    {
        Console.WriteLine("비트 읽기 속도를 재는 프로그램이에요. 비트 자료를 읽기만 하고 아무것도 고치지 않아요.");
        Console.WriteLine("다 재는 데 최대 40분쯤 걸려요. 재는 동안 비트가 느려질 수 있어요.");
        Console.WriteLine();
        Console.WriteLine("  - 진료가 끝난 뒤 켜세요.");
        Console.WriteLine("  - 비트가 느려지면 이 창을 닫으세요. 지금까지 결과는 남아요.");
        Console.WriteLine("  - 크롬의 대시보드 탭은 닫아 두세요.");
        Console.WriteLine("  - 재는 동안 창 안을 누르지 마세요. 눌렀다면 엔터를 한 번 누르세요.");
        Console.WriteLine();
        Console.WriteLine("시작하려면 엔터를 누르세요.");
    }

    private static void ShowPath(string path) => Console.WriteLine("보고서 파일: " + path);

    private static void OpenNotepad(string path)
    {
        try
        {
            using var notepad = Process.Start("notepad.exe", "\"" + path + "\"");
        }
        catch (Exception e) when (e is Win32Exception || e is InvalidOperationException || e is FileNotFoundException)
        {
            Console.WriteLine("메모장을 열지 못했어요. 위 경로의 파일을 직접 열어 주세요.");
        }
    }

    /// <summary>문장 한도·전체 한도가 있어도 드라이버가 멈추면 끝나지 않을 수 있다. 45분이 지나면 지금까지의 결과를 닫고 끝낸다.</summary>
    private static void Watchdog(DiagReport report, Stream stream, string path)
    {
        try
        {
            report.Line("end watchdog");
            stream.Dispose();
        }
        catch (Exception e) when (e is IOException || e is ObjectDisposedException)
        {
            // 쓰던 파일에 문제가 있어도 있는 만큼 보여 준다
        }

        // 콘솔 쓰기가 막혀 있어도(창 안을 눌러 선택 모드) 메모장과 종료까지 가게 따로 돌리고 오래 기다리지 않는다
        var say = new Thread(() =>
        {
            Console.WriteLine();
            Console.WriteLine("시간이 너무 오래 걸려 여기서 멈출게요. 지금까지 결과를 채팅에 붙여 넣어 주세요.");
            ShowPath(path);
        })
        {
            IsBackground = true,
        };
        say.Start();
        say.Join(TimeSpan.FromSeconds(2));
        OpenNotepad(path);
        Environment.Exit(ExitWatchdog);
    }

    /// <summary>
    /// 빠른 편집을 끈다. 켜져 있으면 창 안을 한 번 누를 때 선택 모드가 되어 콘솔 쓰기가 막히고 측정이 그 자리에서 멈춘다(시계는 흐른다).
    /// 못 꺼도 측정은 계속한다: 시작 안내가 누르지 말라고 말한다.
    /// </summary>
    private static void TurnOffQuickEdit()
    {
        var input = GetStdHandle(StandardInputHandle);
        if (GetConsoleMode(input, out var mode)) SetConsoleMode(input, (mode & ~QuickEditMode) | ExtendedFlags);
    }

    /// <summary>한글 윈도우(코드 페이지 949)면 그대로, 아니면 UTF-8로 바꾼다. 못 바꿔도 글자가 깨질 뿐 측정은 된다.</summary>
    private static void UseKoreanConsole()
    {
        try
        {
            if (Console.OutputEncoding.CodePage != 949) Console.OutputEncoding = new UTF8Encoding(false);
        }
        catch (Exception e) when (e is IOException || e is SecurityException || e is ArgumentException)
        {
            // 그대로 간다
        }
    }
}
