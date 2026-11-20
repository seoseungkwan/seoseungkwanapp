using System.Text.RegularExpressions;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 비트에서 보던 환자(spec doc-print AC-7402.1): 맨 앞 비트 창 제목의 "차트번호 :" 뒤 숫자. 제목에는 이름이 들 수 있어
/// 숫자만 꺼내고 제목 글은 저장·로그하지 않는다(창 제목 읽기는 윈도우 층 BitWindows).
/// </summary>
public static class CurrentChart
{
    public const int MaxDigits = 14;

    // ':' 앞뒤 빈칸(탭 포함)은 몇 개든 된다. 숫자는 ASCII 0~9만
    private static readonly Regex Pattern = new Regex(@"차트번호\s*:\s*([0-9]+)", RegexOptions.CultureInvariant);

    /// <summary>첫 "차트번호 :" 뒤 숫자를 앞 0 빼고 1~14자리면 그 번호, 아니면 null.</summary>
    public static string? FromTitle(string? title)
    {
        if (string.IsNullOrEmpty(title)) return null;
        var match = Pattern.Match(title);
        if (!match.Success) return null;
        var number = match.Groups[1].Value.TrimStart('0');
        return number.Length >= 1 && number.Length <= MaxDigits ? number : null;
    }
}
