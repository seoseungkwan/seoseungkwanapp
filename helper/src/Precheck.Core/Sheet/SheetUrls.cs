using System;
using System.Text.RegularExpressions;

namespace Precheck.Core.Sheet;

/// <summary>수납 구글 코드 주소 꼴과 넘겨받기 주소 검사(spec google-link design.md 9-2, AC-8511.3).</summary>
public static class SheetUrls
{
    /// <summary>넘겨받기로 따라가도 되는 곳(구글 웹 앱 답이 나오는 곳) 하나.</summary>
    public const string ReplyHost = "script.googleusercontent.com";

    // design.md 9-2 정규식 그대로. .NET의 $는 끝 줄바꿈 앞에서도 맞으므로 \z로 끝을 잡는다
    private static readonly Regex ScriptShape = new Regex(
        @"^https://script\.google\.com/(a/macros/[A-Za-z0-9.-]{1,253}|macros)/s/[A-Za-z0-9_-]{10,200}/exec\z",
        RegexOptions.CultureInvariant);

    /// <summary>https://script.google.com/macros/s/{id}/exec 또는 회사 계정 꼴 /a/macros/{도메인}/s/{id}/exec 인가(앞뒤 빈칸도 틀림).</summary>
    public static bool IsScriptUrl(string? url) => url != null && url.Length <= 600 && ScriptShape.IsMatch(url);

    /// <summary>
    /// 넘겨받기 Location(절대·상대)을 지금 주소 기준으로 풀어, https · script.googleusercontent.com · 기본 포트 · 사용자 정보 없음일 때만 그 주소.
    /// 아니면 null(로그인 화면 등으로 보낸 것).
    /// </summary>
    public static string? Follow(string current, string? location)
    {
        var loc = (location ?? "").Trim();
        if (loc.Length == 0 || !Uri.TryCreate(current, UriKind.Absolute, out var baseUri)) return null;
        if (!Uri.TryCreate(baseUri, loc, out var next)) return null;
        if (!next.IsAbsoluteUri
            || !string.Equals(next.Scheme, "https", StringComparison.Ordinal)
            || !string.Equals(next.Host, ReplyHost, StringComparison.OrdinalIgnoreCase)
            || !next.IsDefaultPort
            || next.UserInfo.Length > 0)
        {
            return null;
        }
        return next.AbsoluteUri;
    }
}
