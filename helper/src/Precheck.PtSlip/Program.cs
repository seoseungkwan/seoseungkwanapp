using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.InjectionMemo;
using Precheck.Core.PtSlip;
using Precheck.Windows;

namespace Precheck.PtSlip;

/// <summary>
/// PT 후 진료 종이 프로그램 입구(specs/pt-slip, AC-6403.5). 이 윈도우 로그인에서 하나만 돈다.
/// 비트 창 옆 [PT 먼저] 단추에 더해, 비트 접수 화면 '접수메모(당일)' 옆 [주사 차수] 단추·단축키도 띄운다(specs/injection-memo).
/// 오류 글에는 환자 값(차트번호·이름·메모)을 넣지 않는다. 파일·로그도 남기지 않는다.
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

    /// <summary>진단: 종이 대신 파일로 보내 드라이버가 프린터에 보내는 명령을 글로 남긴다(프린터명령저장.cmd)</summary>
    private const string CaptureArg = "--capture";
    private const string CaptureFileName = "PT종이-프린터명령.txt";

    [STAThread]
    private static void Main(string[] args)
    {
        // 창 좌표(GetWindowRect)와 우리 창 자리를 같은 물리 픽셀로 맞춘다. 화면 배율이 100%가 아니어도 버튼이 비트 창에 붙게
        SetProcessDPIAware();

        // 진단은 버튼 프로그램이 돌고 있어도 따로 한 번 돌고 끝난다(하나만 규칙 밖)
        if (args.Length > 0 && args[0] == CaptureArg)
        {
            Capture();
            return;
        }

        using var single = OpenSingle(out var first);
        if (single == null || !first) return;

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (sender, e) => Crash();
        AppDomain.CurrentDomain.UnhandledException += (sender, e) => ShowCrashOnce();

        try
        {
            // [PT 먼저] 버튼 창은 비트 창이 맨 앞일 때만 스스로 뜬다(처음부터 띄우지 않게 주 창으로 넘기지 않는다).
            // 오른쪽 클릭 [끝내기]가 Application.Exit로 이 고리를 끝낸다
            using var button = new ButtonForm();

            // [주사 차수] 단추·단축키(spec injection-memo): 이 창 스레드에서 만든다. 비트 접수 화면이 맨 앞일 때만 단추가 뜨고 단축키를 잡는다.
            // 끝날 때 단추 → 단축키 차례로 없앤다(using은 거꾸로 닫힌다)
            var memoSettings = MemoSettings.FromJson(MemoSettingsFile.ReadText());
            using var hotKeys = new HotKeys(HotKeys.KeyOf(memoSettings.HotKey) ?? Keys.F8);
            var reception = new ReceptionWindows();
            using var memoButton = new MemoButtonForm(reception.FindForeground, hotKeys, memoSettings, ComputeMemo, ReadXray);
            hotKeys.Pressed += (sender, e) => memoButton.Press();
            SettingsForm.MemoButton = memoButton;

            Application.Run(new ApplicationContext());
            SettingsForm.MemoButton = null;
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

    /// <summary>
    /// 진단: [시험 1장]과 같은 빈 양식을 프린터 대신 파일로 보낸다(종이는 안 나온다). 드라이버가 만든 프린터 명령을
    /// 읽을 수 있는 글로 바꿔 바탕화면 PT종이-프린터명령.txt에 두고 메모장으로 연다. 빈 양식이라 환자 값은 없다.
    /// </summary>
    private static void Capture()
    {
        try
        {
            var settings = SlipSettingsRules.FromJson(SettingsFile.ReadText());
            var printer = Printers.Choose(settings.PrinterName);
            if (printer == null)
            {
                MessageBox.Show("설정한 프린터를 찾지 못했어요. 설정에서 프린터를 골라 저장한 뒤 다시 해 주세요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            Directory.CreateDirectory(SettingsFile.Folder);
            var raw = Path.Combine(SettingsFile.Folder, "capture.prn");
            if (File.Exists(raw)) File.Delete(raw);
            var length = settings.PaperLengthMm;
            SlipPrintJob.Send(printer, SlipDrawer.PaperWidthMm, length, g => SlipDrawer.Draw(g, SlipText.Blank, SlipDrawer.PaperWidthMm, length), raw);
            var bytes = WaitForFile(raw);
            var text = new StringBuilder()
                .Append("프린터: ").Append(printer).Append("\r\n")
                .Append("종이 길이 설정: ").Append(length).Append("mm\r\n")
                .Append("[프린터 종이 설정] 저장됨: ").Append(SettingsFile.ReadDriverSettings(printer) != null ? "예" : "아니오").Append("\r\n")
                .Append("명령 크기: ").Append(bytes.Length).Append("바이트\r\n\r\n")
                .Append(Readable(bytes))
                .ToString();
            var target = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), CaptureFileName);
            File.WriteAllText(target, text, new UTF8Encoding(true));
            Process.Start("notepad.exe", "\"" + target + "\"");
        }
        catch (Exception)
        {
            MessageBox.Show("프린터 명령을 저장하지 못했어요.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    /// <summary>스풀러가 파일을 다 쓸 때까지(크기가 멈출 때까지) 20초까지 기다린다</summary>
    private static byte[] WaitForFile(string path)
    {
        long last = -1;
        for (var i = 0; i < 40; i++)
        {
            Thread.Sleep(500);
            if (!File.Exists(path)) continue;
            try
            {
                var size = new FileInfo(path).Length;
                if (size > 0 && size == last) return File.ReadAllBytes(path);
                last = size;
            }
            catch (IOException)
            {
                // 아직 쓰는 중
            }
        }
        return File.Exists(path) ? File.ReadAllBytes(path) : new byte[0];
    }

    /// <summary>글자(ASCII)와 줄바꿈은 그대로, 나머지 바이트 덩어리는 &lt;이진 N바이트&gt;로. 앞 8000자 + 끝 3000자</summary>
    private static string Readable(byte[] bytes)
    {
        var text = new StringBuilder();
        var binary = 0;
        foreach (var b in bytes)
        {
            if ((b >= 32 && b < 127) || b == 10 || b == 13)
            {
                if (binary > 0) text.Append("<이진 ").Append(binary).Append("바이트>");
                binary = 0;
                text.Append((char)b);
            }
            else
            {
                binary++;
            }
        }
        if (binary > 0) text.Append("<이진 ").Append(binary).Append("바이트>");
        const int Head = 8000, Tail = 3000;
        if (text.Length <= Head + Tail) return text.ToString();
        return text.ToString(0, Head) + "\r\n\r\n…(가운데 " + (text.Length - Head - Tail) + "자 줄임)…\r\n\r\n" + text.ToString(text.Length - Tail, Tail);
    }

    /// <summary>
    /// 이 로그인에서 하나만(처음이면 first = true). 높은 권한(로그온 예약 작업)으로 켜진 PtSlip이 만든 Mutex는 일반 권한으로 띄운
    /// 두 번째 PtSlip(exe를 또 누름 등)이 열면 접근 거부다 — 그때는 이미 켜져 있는 것으로 보고 null(조용히 끝낸다)
    /// </summary>
    private static Mutex? OpenSingle(out bool first)
    {
        try
        {
            return new Mutex(true, MutexName, out first);
        }
        catch (UnauthorizedAccessException)
        {
            first = false;
            return null;
        }
    }

    /// <summary>찾은 비트 설치 위치(NameSource와 같다: 한 번 찾으면 다시 훑지 않고, 읽기에 실패하면 잊고 다음에 다시 찾는다)</summary>
    private static volatile string? memoInstallPath;

    /// <summary>
    /// [주사 차수] 한 번(백그라운드 스레드): 원래 PT 종이가 비트 DB를 여는 길(InstallationLocator → SqlBitConnector.Open, 되돌리는 읽기 트랜잭션)
    /// 그대로 열어 Core InjectionMemoService가 판단한다. 차트번호가 아니거나 메모에 이미 있으면 Core가 DB에 묻지 않으므로 DB도 열지 않는다(LazyBitDb).
    /// 무엇이 잘못되든 '읽기 실패'(Failed). 차트번호·메모 글은 어디에도 남기지 않는다.
    /// </summary>
    private static MemoResult ComputeMemo(string? chart, string? memo, DateTime today)
    {
        using var db = new LazyBitDb();
        MemoResult result;
        try
        {
            result = InjectionMemoService.Compute(db, chart, memo, today);
        }
        catch (Exception)
        {
            result = new MemoResult(MemoResultKind.Failed);
        }
        if (result.Kind == MemoResultKind.Failed) memoInstallPath = null;
        return result;
    }

    /// <summary>
    /// [엑스레이] 한 번(백그라운드 스레드): [주사 차수]와 같은 길로 DB를 열어 Core InjectionMemoService.ReadXrayList가 목록을 만든다
    /// (찍은 부위 전부 + 고른 부위 가운데 찍은 적 없는 것). 차트번호가 아니면 DB를 열지 않는다. 무엇이 잘못되든 Failed.
    /// </summary>
    private static XrayListResult ReadXray(string? chart, DateTime today, IReadOnlyList<string> chosen)
    {
        using var db = new LazyBitDb();
        XrayListResult result;
        try
        {
            result = InjectionMemoService.ReadXrayList(db, chart, today, chosen);
        }
        catch (Exception)
        {
            result = new XrayListResult(XrayListKind.Failed);
        }
        if (result.Kind == XrayListKind.Failed) memoInstallPath = null;
        return result;
    }

    /// <summary>처음 읽을 때 비트 DB를 연다(되돌리는 트랜잭션, 닫으면 되돌린다). 열지 못하면 그 읽기가 예외 → Core가 Failed로 바꾼다</summary>
    private sealed class LazyBitDb : IBitDb, IDisposable
    {
        private IBitSession? session;

        public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
        {
            if (session == null)
            {
                var path = memoInstallPath ?? new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory).Find();
                session = new SqlBitConnector().Open(path);
                memoInstallPath = path;
            }
            return session.Query(sql, args, timeout);
        }

        public void Dispose() => session?.Dispose();
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
