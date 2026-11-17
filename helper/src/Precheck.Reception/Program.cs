using System;
using System.Diagnostics;
using System.Threading;
using Precheck.Core.Reception;

namespace Precheck.Reception;

/// <summary>
/// 늘 켜 두는 접수 현황 프로그램 PrecheckReception.exe의 입구(design.md 9절, REQ-1411). 창 없는 윈도우 프로그램(WinExe)이라 화면에 아무것도 띄우지 않는다.
/// 켜는 차례는 Core ReceptionStart가 하고, 여기는 진짜 부품(뮤텍스 SingleInstance · 서버 ReceptionServices · 셸 브라우저 열기 · 끝없이 기다리기 · 기록)을 잇기만 한다.
/// 켜지는 때: 윈도우 로그인(HKCU Run 시작 항목, 인자 없음)과 바탕 화면 "접수 현황 주소" 바로 가기(--link). 둘 다 install.ps1이 만든다.
/// 혼자 설치(spec reception-other-clinic AC-5707.1): install-reception.ps1이 등록 없는 PC에서 --register로 켜면 서버 없이 RegisterEntry만 돈다.
/// 끄기는 install.ps1·uninstall.ps1이 프로세스를 끄고, 로그오프 때는 윈도우가 끈다.
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        var log = ReceptionServices.OpenLog();
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            log.Note(ReceptionErrors.Failed);
            log.Flush();
        };

        var code = new ReceptionStart(SingleInstance.TryClaim, () => ReceptionServices.Listen(log), OpenBrowser, WaitForever, log.Note, RegisterEntry.Run).Run(args);
        log.Flush();
        return code;
    }

    /// <summary>이 PC의 기본 브라우저로 연다(셸이 연다). 주소는 ReceptionStart가 주는 이 PC 자신의 /link뿐이다.</summary>
    private static void OpenBrowser(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose();

    /// <summary>프로세스가 꺼질 때까지 기다린다. 서버는 뒤 실행 줄에서 돈다.</summary>
    private static void WaitForever() => Thread.Sleep(Timeout.Infinite);
}
