using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception.Check;

namespace Precheck.Windows;

/// <summary>
/// 의원 PC 확인 명령의 입구(spec reception-phone REQ-1401). reception-check.cmd → PrecheckHelper.exe --reception-check로만 온다(CheckMode).
/// 확인 모드에서는 표준 출력이 크롬 통로가 아니라 사람이 보는 콘솔이라 여기서만 Console을 쓴다(일반 시작 길에는 이 코드가 없다).
/// 차례·시간 제한·보고서 거르기는 Core의 CheckRunner가 한다. 여기는 진짜 부품(콘솔·확인 세션 CheckBitDb·비트 로그인 창·화면 83·보고서 파일)을
/// 잇고, 끝나면 보고서를 메모장으로 연다. 콘솔에 직접 쓰는 것은 고정 글·보고서 경로·예외 형 이름뿐이다.
/// 설치한 도우미의 프로그램 파일과 레지스트리는 건드리지 않는다(등록 파일을 읽기만 한다).
/// </summary>
public static class ReceptionCheckEntry
{
    private const int ExitFailed = 1;

    private const int StandardInputHandle = -10;
    private const uint QuickEditMode = 0x0040;
    private const uint ExtendedFlags = 0x0080;

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
        CheckReport? report = null;
        try
        {
            // 비트 DLL(log4net 등)이 표준 오류에 쓰는 글이 콘솔에 섞이지 않게 버린다(AC-1401.16). 확인 코드는 표준 오류를 쓰지 않는다
            Console.SetError(TextWriter.Null);
            UseKoreanConsole();
            TurnOffQuickEdit();

            var services = createServices();
            var screen = new Screen83(services);
            // 보고서 자리(AC-1401.11): 푼 폴더(app의 부모)가 먼저, 못 쓰면 임시 폴더. 줄마다 디스크에 남는다
            report = CheckReport.Create(AppDomain.CurrentDomain.BaseDirectory, Path.GetTempPath(), DateTime.Now);
            new CheckRunner(new WindowConsole(), () => CheckBitDb.OpenVerified(services), screen.Login, screen.Read, report, () => DateTime.Now,
                HelperVersion.Value).Run();

            // 메모장이 열 수 있게 먼저 닫는다
            report.Dispose();
            OpenNotepad(report.FilePath);

            // 도는 동안 눌린 엔터가 쌓여 있으면 이 안내가 보이자마자 창이 닫힌다. 입력이 콘솔임은 CheckMode가 보장한다
            while (Console.KeyAvailable) Console.ReadKey(true);
            Console.WriteLine("엔터를 누르면 이 창이 닫혀요.");
            Console.ReadLine();
            return 0;
        }
        catch (Exception e)
        {
            // 보고서는 줄마다 디스크에 있으므로 여기까지의 결과는 남는다. 예외 글은 쓰지 않는다
            report?.Dispose();
            Console.WriteLine();
            Console.WriteLine("확인을 끝내지 못했어요. 이 창을 사진으로 찍어 보내 주세요. 오류 종류: " + e.GetType().Name);
            if (report != null) Console.WriteLine("지금까지 보고서: " + report.FilePath);
            return ExitFailed;
        }
    }

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

    /// <summary>
    /// 빠른 편집을 끈다. 켜져 있으면 창 안을 한 번 누를 때 선택 모드가 되어 콘솔 쓰기가 막히고 확인이 그 자리에서 멈춘다.
    /// 못 꺼도 확인은 계속한다.
    /// </summary>
    private static void TurnOffQuickEdit()
    {
        var input = GetStdHandle(StandardInputHandle);
        if (GetConsoleMode(input, out var mode)) SetConsoleMode(input, (mode & ~QuickEditMode) | ExtendedFlags);
    }

    /// <summary>한글 윈도우(코드 페이지 949)면 그대로, 아니면 UTF-8로 바꾼다. 못 바꿔도 글자가 깨질 뿐 확인은 된다.</summary>
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

    /// <summary>CheckRunner의 콘솔: CheckRunner가 준 줄(안내·숫자·걸러진 코드)만 쓰고, 사람이 친 줄을 그대로 돌려준다.</summary>
    private sealed class WindowConsole : ICheckConsole
    {
        public void Write(string line) => Console.WriteLine(line);

        public string? ReadLine() => Console.ReadLine();
    }

    /// <summary>
    /// 비트 로그인 창과 화면 83(증상) 하루 읽기. 로그인한 뒤 도우미와 같은 규칙(StatsAccess: 로그인 사용자의 병원 범위가 등록 범위와 같고
    /// 화면 83 권한이 있음)을 확인 세션으로 본 다음에만 화면을 읽는다(contact.targets와 같은 차례). 화면은 지금의 VendorGridExport 그대로다.
    /// </summary>
    private sealed class Screen83
    {
        private static readonly string[] Keys = { StatsScreens.Symptoms };

        private readonly BitServices services;
        private string? install;

        public Screen83(BitServices services)
        {
            this.services = services;
        }

        /// <summary>
        /// 비트 로그인 창. 취소하면 null. 권한·병원이 안 맞으면 BitException(보고서에 번호만). 창은 CheckLoginWindow가 가운데·맨 위로 두고,
        /// 60초 안에 안 뜨거나 5분 안에 안 끝나면 그 예외(AC-1401.15)가 CheckRunner로 간다.
        /// </summary>
        public VendorUser? Login()
        {
            install = null;
            var root = services.Locator.Find();
            var user = CheckLoginWindow.Run(() => services.Login.Login(root));
            if (user == null) return null;

            var screens = services.Screens ?? throw new BitException(BitErrors.ExportFailed);
            var menu = StatsMenu.Parse(screens.ReadMenu(root));
            using (var db = CheckBitDb.OpenVerified(services))
            {
                StatsAccess.Check(db, user, db.Hospital, menu, Keys);
            }
            install = root;
            return user;
        }

        /// <summary>화면 83을 그날 하루(0시~23:59)로 조회한 표(머리 줄 포함).</summary>
        public IReadOnlyList<IReadOnlyList<string>> Read(VendorUser user, DateTime day)
        {
            var screens = services.Screens;
            if (screens == null || install == null) throw new BitException(BitErrors.ExportFailed);
            return screens.Read(install, user, StatsScreens.Of(StatsScreens.Symptoms), day, day, StatsScreens.ReadTimeout);
        }
    }
}
