using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing.Printing;
using System.Linq;

namespace Precheck.PtSlip;

/// <summary>이 PC에 설치된 프린터 이름과, 종이를 보낼 프린터 고르기(AC-6403.4)</summary>
public static class Printers
{
    /// <summary>빈칸 설정일 때 고르는 프린터 이름 조각(대소문자 무시)</summary>
    public const string DefaultNamePart = "BIXOLON";

    /// <summary>설치된 프린터 이름(윈도우가 주는 차례). 읽지 못하면 빈 목록</summary>
    public static IReadOnlyList<string> Installed()
    {
        try
        {
            return PrinterSettings.InstalledPrinters.Cast<string>().ToList();
        }
        catch (Win32Exception)
        {
            // 인쇄 스풀러가 꺼져 있으면 목록을 못 읽는다
            return Array.Empty<string>();
        }
    }

    /// <summary>
    /// 설정이 빈칸이 아니고 설치돼 있으면 그 프린터, 빈칸이면 이름에 BIXOLON이 든 첫 프린터, 없으면 null.
    /// (설정한 프린터가 지금 없으면 다른 프린터로 바꾸지 않고 null — 엉뚱한 프린터로 나가지 않게)
    /// </summary>
    public static string? Choose(string configured) => Choose(configured, Installed());

    /// <summary>Choose의 고르기 규칙(설치 목록을 받아서)</summary>
    public static string? Choose(string configured, IReadOnlyList<string> installed)
    {
        if (installed == null) throw new ArgumentNullException(nameof(installed));
        var wanted = (configured ?? "").Trim();
        if (wanted.Length > 0)
        {
            return installed.FirstOrDefault(name => string.Equals(name, wanted, StringComparison.OrdinalIgnoreCase));
        }
        return installed.FirstOrDefault(name => name.IndexOf(DefaultNamePart, StringComparison.OrdinalIgnoreCase) >= 0);
    }
}
