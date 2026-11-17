using System;
using Precheck.Core.Reception.Settings;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 길마다 몸 한도(spec reception-other-clinic design.md 4절, AC-5704.2·AC-5706.1). 한 곳에 두고
/// <see cref="HttpRequestReader"/>(요청 줄 뒤 Content-Length가 넘으면 몸을 읽지 않고 413)와
/// <see cref="ClientGuard.WriteOk"/>(쓰기 검사의 몸 길이)가 같이 본다.
/// POST /api/settings 32768 · POST /api/logo 2097152(= <see cref="LogoImage.MaxBytes"/>), 그 밖은 지금처럼 8192.
/// 길은 퍼센트 글자를 풀지 않은 ? 앞 경로 그대로 견준다(대소문자·끝 / 가 다르면 기본).
/// </summary>
public static class BodyLimits
{
    public const int Default = 8192;
    public const int Settings = 32768;
    public const int Logo = LogoImage.MaxBytes;

    public const string SettingsPath = "/api/settings";
    public const string LogoPath = "/api/logo";

    public static int Of(string? method, string? path)
    {
        if (!string.Equals(method, "POST", StringComparison.Ordinal)) return Default;
        if (string.Equals(path, SettingsPath, StringComparison.Ordinal)) return Settings;
        if (string.Equals(path, LogoPath, StringComparison.Ordinal)) return Logo;
        return Default;
    }

    /// <summary>요청 줄의 대상에서 ? 앞 경로(<see cref="HttpRequest.Path"/>와 같은 규칙)</summary>
    internal static string PathOf(string target)
    {
        var question = target.IndexOf('?');
        return question < 0 ? target : target.Substring(0, question);
    }
}
