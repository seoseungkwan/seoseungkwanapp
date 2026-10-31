using System;
using System.Collections.Generic;

namespace Precheck.Core.Bit;

/// <summary>
/// 윈도우 로컬 경로(`X:\…`) 글자 다루기. 리눅스 System.IO.Path는 `\`를 구분자로 보지 않아, 비트 찾기 규칙을
/// 이 서버에서도 시험하려고 직접 다룬다. 원본 NativeEnvironmentGuard.TryNormalizeLocalPath처럼 `드라이브:\`로
/// 시작하는 경로만 받는다(UNC `\\…`·장치 `\\?\…`·상대·드라이브 상대 `C:foo`는 거절).
/// </summary>
public static class WinPath
{
    // 윈도우 경로에 올 수 없는 글자(Path.GetFullPath가 거절하는 것)
    private static readonly char[] InvalidChars = { '"', '<', '>', '|', '*', '?' };

    /// <summary>
    /// 앞뒤 공백·따옴표를 떼고 `/`를 `\`로, `.`·`..`·빈 마디를 정리한다. 드라이브 뿌리는 `C:\`, 그 밖은 끝 구분자 없음.
    /// 로컬 드라이브 경로가 아니면 false.
    /// </summary>
    public static bool TryNormalize(string? path, out string normalized)
    {
        normalized = "";
        if (path == null) return false;
        var value = path.Trim().Trim('"').Replace('/', '\\');
        if (value.Length < 3 || !IsAsciiLetter(value[0]) || value[1] != ':' || value[2] != '\\') return false;
        foreach (var c in value)
        {
            if (c < ' ' || Array.IndexOf(InvalidChars, c) >= 0) return false;
        }
        // 드라이브 글자 뒤의 ':'(대체 데이터 흐름 등)는 받지 않는다
        if (value.IndexOf(':', 2) >= 0) return false;

        var segments = new List<string>();
        foreach (var part in value.Substring(3).Split('\\'))
        {
            if (part.Length == 0 || part == ".") continue;
            if (part == "..")
            {
                if (segments.Count > 0) segments.RemoveAt(segments.Count - 1);
                continue;
            }
            segments.Add(part);
        }
        normalized = value.Substring(0, 3) + string.Join("\\", segments);
        return true;
    }

    /// <summary>정리한 경로의 드라이브 뿌리(`C:\`).</summary>
    public static string DriveRoot(string normalized) => normalized.Substring(0, 3);

    /// <summary>정리한 경로의 위 폴더. 드라이브 뿌리면 null.</summary>
    public static string? Parent(string normalized)
    {
        if (normalized == null || normalized.Length <= 3) return null;
        var index = normalized.LastIndexOf('\\');
        if (index < 2) return null;
        return index == 2 ? normalized.Substring(0, 3) : normalized.Substring(0, index);
    }

    /// <summary>정리한 경로 아래의 상대 경로(`EXE\BITStatistics.exe`).</summary>
    public static string Combine(string normalized, string relative) =>
        normalized.EndsWith("\\", StringComparison.Ordinal) ? normalized + relative : normalized + "\\" + relative;

    /// <summary>둘 다 로컬 경로이고 정리하면 같은가(대소문자 무시, 원본 SamePath).</summary>
    public static bool Same(string? first, string? second) =>
        TryNormalize(first, out var left) && TryNormalize(second, out var right) &&
        string.Equals(left, right, StringComparison.OrdinalIgnoreCase);

    private static bool IsAsciiLetter(char c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}
