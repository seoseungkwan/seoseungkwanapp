using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Precheck.Core.Protocol;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;

namespace Precheck.Core.Reception;

/// <summary>
/// 주소 보내기 화면(/link, design.md 8절, AC-1411.4). 이 PC 자신(루프백)만 연다(라우터가 막는다, AC-1406.8). QR 그림은 없다:
/// 휴대폰 첫 열기는 카카오톡 링크로만이라, 주소마다 큰 글자의 전체 주소 링크와 [주소 복사] 단추를 둔다.
/// - CSP(AC-1406.6)가 인라인 스타일·스크립트를 막으므로 HTML에 style·인라인 스크립트·on…= 이 없고,
///   /theme.css(토큰)·/link.css(모양)를 link로, /link.js(복사 단추)를 script src 하나로 부른다.
/// - 주소는 LanAddresses.PhoneUrl 글 그대로(문 번호까지, 카카오톡이 링크로 바꾸게). IPv4가 아닌 주소는 건너뛴다(던지지 않는다).
/// - 사설 주소가 없으면 주소 카드 없이 연결 안내를 둔다. 글은 모두 HTML 이스케이프한다.
/// - 머리 로고는 그 병원 설정을 따른다(spec reception-other-clinic AC-5715.1, 폰 머리 AC-5709.1과 같은 규칙): 그릴 때마다 설정 logo를 읽어
///   pic이고 로고 파일이 읽히면 그 그림을 data: URL로(CSP img-src 'self' data:, 따로 길이 필요 없다), text면 그 글자, 그 밖(none·파일 없음·깨짐·읽지 못함·설정 없음)은 로고 없이 제목만.
///   우리 의원 로고(/logo-wordmark.png)·이름을 박아 두지 않는다. 탭 아이콘은 중립 아이콘 /icon.png다(AC-5715.2).
/// </summary>
public static class LinkPage
{
    public const string Title = "접수 현황 주소 보내기";
    public const string CopyLabel = "주소 복사";
    public const string Safe = "이 주소는 병원 와이파이에서만 열려요. 밖에서는 열리지 않아 환자 정보가 보이지 않아요";
    public const string NoLan = "이 PC가 병원 와이파이에 연결되어 있지 않아요"; // AC-5718.3
    public const string NoLanSub = "와이파이에 연결한 뒤 이 창을 다시 열어 주세요";

    private const string ContentType = "text/html; charset=utf-8";

    /// <summary>그림 로고의 대체 글(폰 머리 board.js LOGO_ALT와 같다).</summary>
    private const string LogoAlt = "병원 로고";

    /// <summary>쉬운 순서 넷(번호와 글)</summary>
    private static readonly (string No, string Text)[] Steps =
    {
        ("1.", "직원 단톡방에 붙여 넣어 보내요"),
        ("2.", "직원은 병원 와이파이에서 주소를 눌러요"),
        ("3.", "카카오톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기'"),
        ("4.", "홈 화면에 추가해요"),
    };

    /// <summary>
    /// 부를 때마다 지금 주소(addresses())·지금 설정(settings())·로고 파일(logo)로 그린 답. 라우터의 linkPage 자리에 넘긴다.
    /// settings·logo는 라우터에 넘긴 것과 같은 SettingsStore.Current·LogoStore다(없으면 로고 없이 제목만).
    /// </summary>
    public static Func<HttpResponse> For(Func<IReadOnlyList<IPAddress>> addresses, Func<ReceptionSettings>? settings = null, LogoStore? logo = null)
    {
        if (addresses == null) throw new ArgumentNullException(nameof(addresses));
        return () => Answer(addresses(), settings?.Invoke(), logo);
    }

    /// <summary>200 text/html 답(보안 머리는 HttpResponse가 단다).</summary>
    public static HttpResponse Answer(IReadOnlyList<IPAddress> addresses, ReceptionSettings? settings = null, LogoStore? logo = null) =>
        HttpResponse.Bytes(ContentType, Encoding.UTF8.GetBytes(Html(addresses, settings, logo)));

    /// <summary>화면 HTML 전부. addresses가 null이면 빈 목록으로 본다. 머리 로고는 settings.Logo를 따른다(LogoHtml).</summary>
    public static string Html(IReadOnlyList<IPAddress> addresses, ReceptionSettings? settings = null, LogoStore? logo = null)
    {
        var urls = new List<string>();
        foreach (var address in addresses ?? Array.Empty<IPAddress>())
        {
            if (address != null && address.AddressFamily == AddressFamily.InterNetwork) urls.Add(LanAddresses.PhoneUrl(address));
        }

        var html = new StringBuilder()
            .Append("<!doctype html>\n<html lang=\"ko\">\n<head>\n")
            .Append("<meta charset=\"utf-8\">\n")
            .Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
            .Append("<meta name=\"referrer\" content=\"no-referrer\">\n")
            .Append("<title>").Append(Escape(Title)).Append("</title>\n")
            .Append("<link rel=\"icon\" href=\"/icon.png\" type=\"image/png\">\n")
            .Append("<link rel=\"stylesheet\" href=\"/theme.css\">\n")
            .Append("<link rel=\"stylesheet\" href=\"/link.css\">\n")
            .Append("<script type=\"module\" src=\"/link.js\"></script>\n")
            .Append("</head>\n<body>\n<div class=\"link-page\">\n")
            .Append("<header class=\"link-top\">\n")
            .Append(LogoHtml(settings, logo))
            .Append("<h1 class=\"link-title\">").Append(Escape(Title)).Append("</h1>\n")
            .Append("</header>\n<main class=\"link-main\">\n");

        if (urls.Count == 0)
        {
            html.Append("<section class=\"link-none\">\n")
                .Append("<h2 class=\"link-none-title\">").Append(Escape(NoLan)).Append("</h2>\n")
                .Append("<p class=\"link-none-sub\">").Append(Escape(NoLanSub)).Append("</p>\n")
                .Append("</section>\n");
        }
        foreach (var url in urls)
        {
            var text = Escape(url);
            html.Append("<section class=\"link-card\">\n")
                .Append("<a class=\"link-url\" href=\"").Append(text).Append("/\">").Append(text).Append("</a>\n")
                .Append("<button type=\"button\" class=\"link-copy\" data-url=\"").Append(text).Append("\">").Append(Escape(CopyLabel)).Append("</button>\n")
                .Append("<p class=\"link-help\" role=\"status\" aria-live=\"polite\" hidden></p>\n")
                .Append("</section>\n");
        }

        html.Append("<ol class=\"link-steps\">\n");
        foreach (var (no, step) in Steps)
        {
            html.Append("<li class=\"link-step\"><span class=\"link-step-no\">").Append(Escape(no)).Append("</span> ")
                .Append(Escape(step)).Append("</li>\n");
        }
        html.Append("</ol>\n")
            .Append("<p class=\"link-safe\">").Append(Escape(Safe)).Append("</p>\n")
            .Append("</main>\n</div>\n</body>\n</html>\n");
        return html.ToString();
    }

    /// <summary>
    /// 머리 로고 한 줄(AC-5715.1): pic이고 로고 파일이 읽히면 img.link-logo(src data:{형식};base64,…, alt "병원 로고"), text면 span.link-logo-text(이스케이프),
    /// 그 밖은 빈 글(로고 없이 제목만). 로고 파일을 읽지 못해도(잠김·권한) 던지지 않고 빈 글이다. 기록은 LogoStore가 오류 번호만 남긴다(그림 바이트 없음).
    /// </summary>
    private static string LogoHtml(ReceptionSettings? settings, LogoStore? logo)
    {
        var setting = settings?.Logo;
        if (setting == null) return "";
        if (setting.Mode == LogoModes.Text)
        {
            var text = setting.Text?.Trim();
            return string.IsNullOrEmpty(text) ? "" : "<span class=\"link-logo-text\">" + Escape(text!) + "</span>\n";
        }
        if (setting.Mode != LogoModes.Pic || logo == null) return "";
        LogoPicture? picture;
        try
        {
            picture = logo.Read();
        }
        catch (HelperException)
        {
            return "";
        }
        if (picture == null || picture.Bytes.Length == 0) return "";
        return "<img class=\"link-logo\" src=\"data:" + picture.ContentType + ";base64," + Convert.ToBase64String(picture.Bytes)
            + "\" alt=\"" + Escape(LogoAlt) + "\">\n";
    }

    /// <summary>HTML 글·속성 값 이스케이프(&amp; &lt; &gt; &quot; &#39;)</summary>
    public static string Escape(string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var escaped = new StringBuilder(text.Length);
        foreach (var c in text)
        {
            switch (c)
            {
                case '&': escaped.Append("&amp;"); break;
                case '<': escaped.Append("&lt;"); break;
                case '>': escaped.Append("&gt;"); break;
                case '"': escaped.Append("&quot;"); break;
                case '\'': escaped.Append("&#39;"); break;
                default: escaped.Append(c); break;
            }
        }
        return escaped.ToString();
    }
}
