using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Precheck.Core.Sheet;

/// <summary>
/// 수납 구글 코드(google-code/sheet/Code.gs, 판 8)의 비밀 글자(spec google-link design.md 5절). 비트시트 Token.cs를 옮기되
/// 새 비밀 글자는 32바이트 무작위 → base64url 43자, 비트시트에서 가져온 32자 영문·숫자도 맞는 모양으로 받는다.
/// </summary>
public static class SheetCode
{
    /// <summary>Code.gs의 비밀 글자 자리(파일에 꼭 한 번).</summary>
    public const string Placeholder = "__TOKEN__";

    /// <summary>Precheck.Core에 싣는 Code.gs의 리소스 이름(csproj LogicalName, TASK-10이 싣는다).</summary>
    public const string ResourceName = "SheetCode.gs";

    private static readonly Regex SecretShape = new Regex(@"^[A-Za-z0-9_-]{16,128}\z", RegexOptions.CultureInvariant);

    /// <summary>새 비밀 글자: 32바이트 무작위 → base64url(덧붙임 없음) 43자.</summary>
    public static string NewSecret()
    {
        var bytes = new byte[32];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        var text = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        Array.Clear(bytes, 0, bytes.Length);
        return text;
    }

    /// <summary>16~128자 [A-Za-z0-9_-]인가(따옴표·역빗금 없음 → Code.gs 글 안에 그대로 넣을 수 있다).</summary>
    public static bool IsValidSecret(string? secret) => secret != null && SecretShape.IsMatch(secret);

    /// <summary>서버·웹에 가는 비밀 글자 표시: SHA-256(비밀 글자) 16진수 앞 16자.</summary>
    public static string Tag(string secret)
    {
        if (secret == null) throw new ArgumentNullException(nameof(secret));
        using (var sha = SHA256.Create())
        {
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(secret));
            return string.Concat(hash.Take(8).Select(b => b.ToString("x2", CultureInfo.InvariantCulture)));
        }
    }

    /// <summary>코드의 비밀 글자 자리를 바꾼다. 자리가 꼭 한 번이 아니면 InvalidOperationException, 비밀 글자 모양이 틀리면 ArgumentException.</summary>
    public static string Inject(string code, string secret)
    {
        if (code == null) throw new ArgumentNullException(nameof(code));
        if (!IsValidSecret(secret)) throw new ArgumentException("비밀 글자 모양이 틀렸다", nameof(secret));
        var first = code.IndexOf(Placeholder, StringComparison.Ordinal);
        if (first < 0 || code.IndexOf(Placeholder, first + Placeholder.Length, StringComparison.Ordinal) >= 0)
        {
            throw new InvalidOperationException("구글 코드의 비밀 글자 자리가 한 번이 아니다");
        }
        return code.Substring(0, first) + secret + code.Substring(first + Placeholder.Length);
    }

    /// <summary>실린 Code.gs 글. 아직 싣지 않았으면 null.</summary>
    public static string? Load()
    {
        using (var stream = typeof(SheetCode).Assembly.GetManifestResourceStream(ResourceName))
        {
            if (stream == null) return null;
            using (var reader = new StreamReader(stream, new UTF8Encoding(false, true))) return reader.ReadToEnd();
        }
    }
}
