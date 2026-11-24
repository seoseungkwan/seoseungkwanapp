using System;
using System.Collections.Generic;
using System.Text;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑 작은 규칙(spec erp-uisarang design.md 4-1·4-3, TASK-4). 디스크·환경 값을 직접 보지 않는다:
/// 도우미 입구(Erp.Helper)가 로컬 고정 드라이브 뿌리·바탕화면·OneDrive 값·파일 있음 함수를 넘긴다.
/// </summary>
public static class UisRules
{
    /// <summary>엑셀 폴더 이름(바탕화면 또는 사용자 폴더 바로 아래, requirements '이미 정한 것' 2).</summary>
    public const string FolderName = "ERP마감";

    /// <summary>
    /// 의사랑 설치 폴더(AC-4201.1): 넘겨받은 뿌리 차례로 '&lt;뿌리&gt;\ysr2000\Exe\FStat.exe'를 물어 처음 있는 뿌리의 '&lt;뿌리&gt;\ysr2000', 없으면 null.
    /// 빈 뿌리는 건너뛰고 뿌리 끝 '\'·'/'는 떼고 붙인다('D:' → 'D:\ysr2000'). 대소문자는 fileExists(윈도우 File.Exists)에 맡긴다 — 이 함수는 가리지 않는다.
    /// </summary>
    public static string? FindUisarang(IEnumerable<string> fixedDriveRoots, Func<string, bool> fileExists)
    {
        if (fixedDriveRoots == null) throw new ArgumentNullException(nameof(fixedDriveRoots));
        if (fileExists == null) throw new ArgumentNullException(nameof(fileExists));
        foreach (var root in fixedDriveRoots)
        {
            if (string.IsNullOrWhiteSpace(root)) continue;
            var folder = root.Trim().TrimEnd('\\', '/') + @"\ysr2000";
            if (fileExists(folder + @"\Exe\FStat.exe")) return folder;
        }
        return null;
    }

    /// <summary>
    /// 엑셀 폴더 자리(AC-4202.1, 정함 1): 바탕화면이 클라우드 폴더(OneDrive·OneDriveCommercial·OneDriveConsumer 환경 값) 가운데 하나의 안이면
    /// Profile(사용자 폴더\ERP마감 — 환자 엑셀이 클라우드로 올라가지 않게), 바탕화면 값이 비었어도 Profile, 아니면 Desktop(바탕화면\ERP마감).
    /// '안'은 그 폴더 자체이거나 그 아래(대소문자·'/'·끝 '\' 무시). profile 값은 고르기에 쓰지 않는다(경로는 부르는 쪽이 FolderName을 붙여 만든다).
    /// </summary>
    public static UisFolderKind ChooseFolder(string? desktop, string profile, IEnumerable<string?> cloudRoots)
    {
        if (cloudRoots == null) throw new ArgumentNullException(nameof(cloudRoots));
        if (string.IsNullOrWhiteSpace(desktop)) return UisFolderKind.Profile;
        var place = Normal(desktop!);
        foreach (var cloud in cloudRoots)
        {
            if (string.IsNullOrWhiteSpace(cloud)) continue;
            var root = Normal(cloud!);
            if (string.Equals(place, root, StringComparison.OrdinalIgnoreCase)
                || place.StartsWith(root + @"\", StringComparison.OrdinalIgnoreCase))
            {
                return UisFolderKind.Profile;
            }
        }
        return UisFolderKind.Desktop;
    }

    /// <summary>
    /// 처방 코드 꼴(design.md 4-1, AC-4206.1이 견주는 꼴): 앞뒤 빈칸을 떼고 가운데 이어진 빈칸(탭·전각 빈칸 등 char.IsWhiteSpace)을 빈칸 하나로, 대문자(InvariantCulture).
    /// 빈 글자가 아니면 commands.json 코드 꼴 '^\S(?: ?\S)*$'이다.
    /// </summary>
    public static string Code(string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var result = new StringBuilder(text.Length);
        var gap = false;
        foreach (var c in text)
        {
            if (char.IsWhiteSpace(c))
            {
                gap = result.Length > 0;
                continue;
            }
            if (gap) result.Append(' ');
            gap = false;
            result.Append(c);
        }
        return result.ToString().ToUpperInvariant();
    }

    /// <summary>경로 견주기 꼴: 앞뒤 빈칸 뗌, '/' → '\', 끝 '\' 뗌.</summary>
    private static string Normal(string path) => path.Trim().Replace('/', '\\').TrimEnd('\\');
}
