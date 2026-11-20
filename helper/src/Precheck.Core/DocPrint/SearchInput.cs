using System.Linq;

namespace Precheck.Core.DocPrint;

/// <summary>찾기 글 종류.</summary>
public enum SearchKind
{
    /// <summary>아무것도 안 쳤거나 빈칸뿐.</summary>
    Empty,

    /// <summary>숫자만: 앞 0을 뺀 1~14자리 차트번호.</summary>
    Chart,

    /// <summary>글자가 있음: 앞뒤 빈칸을 뺀 2~20글자 이름.</summary>
    Name,

    /// <summary>위 어디에도 맞지 않음(DB에 묻지 않는다).</summary>
    Invalid,
}

/// <summary>찾기 칸 글 하나(AC-7402.2): 숫자만이면 차트번호, 글자가 있으면 이름.</summary>
public sealed class SearchInput
{
    public const int MaxDigits = 14;
    public const int MinName = 2;
    public const int MaxName = 20;

    private SearchInput(SearchKind kind, string value)
    {
        Kind = kind;
        Value = value;
    }

    public SearchKind Kind { get; }

    /// <summary>Chart면 정리한 번호, Name이면 앞뒤 빈칸을 뺀 이름, 그 밖은 빈 글.</summary>
    public string Value { get; }

    public static SearchInput Parse(string? text)
    {
        var trimmed = (text ?? "").Trim();
        if (trimmed.Length == 0) return new SearchInput(SearchKind.Empty, "");
        if (trimmed.All(c => c >= '0' && c <= '9'))
        {
            var number = trimmed.TrimStart('0');
            return number.Length >= 1 && number.Length <= MaxDigits ? new SearchInput(SearchKind.Chart, number) : Invalid();
        }
        if (trimmed.Any(char.IsLetter))
        {
            return trimmed.Length >= MinName && trimmed.Length <= MaxName ? new SearchInput(SearchKind.Name, trimmed) : Invalid();
        }
        return Invalid();
    }

    private static SearchInput Invalid() => new SearchInput(SearchKind.Invalid, "");
}
