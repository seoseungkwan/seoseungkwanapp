using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Precheck.Core.Reception.Http;

namespace Precheck.Core.Reception;

/// <summary>
/// 주소 보내기 화면(/link, design.md 8절, AC-1411.4). 이 PC 자신(루프백)만 연다(라우터가 막는다, AC-1406.8). QR 그림은 없다:
/// 휴대폰 첫 열기는 카카오톡 링크로만이라, 주소마다 큰 글자의 전체 주소 링크와 [주소 복사] 단추를 둔다.
/// - CSP(AC-1406.6)가 인라인 스타일·스크립트를 막으므로 HTML에 style·인라인 스크립트·on…= 이 없고,
///   /theme.css(토큰)·/link.css(모양)를 link로, /link.js(복사 단추)를 script src 하나로 부른다.
/// - 주소는 LanAddresses.PhoneUrl 글 그대로(문 번호까지, 카카오톡이 링크로 바꾸게). IPv4가 아닌 주소는 건너뛴다(던지지 않는다).
/// - 사설 주소가 없으면 주소 카드 없이 연결 안내를 둔다. 글은 모두 HTML 이스케이프한다.
/// </summary>
public static class LinkPage
{
    public const string Title = "접수 현황 주소 보내기";
    public const string CopyLabel = "주소 복사";
    public const string Safe = "이 주소는 병원 와이파이에서만 열려요. 밖에서는 열리지 않아 환자 정보가 보이지 않아요";
    public const string NoLan = "이 PC가 의원 와이파이에 연결되어 있지 않아요";
    public const string NoLanSub = "와이파이에 연결한 뒤 이 창을 다시 열어 주세요";

    private const string ContentType = "text/html; charset=utf-8";
    private const string LogoAlt = "양지바른정형외과";

    /// <summary>쉬운 순서 넷(번호와 글)</summary>
    private static readonly (string No, string Text)[] Steps =
    {
        ("1.", "직원 단톡방에 붙여 넣어 보내요"),
        ("2.", "직원은 병원 와이파이에서 주소를 눌러요"),
        ("3.", "카톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기'"),
        ("4.", "홈 화면에 추가해요"),
    };

    /// <summary>부를 때마다 지금 주소(addresses())로 그린 답. 라우터의 linkPage 자리에 넘긴다.</summary>
    public static Func<HttpResponse> For(Func<IReadOnlyList<IPAddress>> addresses)
    {
        if (addresses == null) throw new ArgumentNullException(nameof(addresses));
        return () => Answer(addresses());
    }

    /// <summary>200 text/html 답(보안 머리는 HttpResponse가 단다).</summary>
    public static HttpResponse Answer(IReadOnlyList<IPAddress> addresses) =>
        HttpResponse.Bytes(ContentType, Encoding.UTF8.GetBytes(Html(addresses)));

    /// <summary>화면 HTML 전부. addresses가 null이면 빈 목록으로 본다.</summary>
    public static string Html(IReadOnlyList<IPAddress> addresses)
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
            .Append("<link rel=\"icon\" href=\"/logo-mark.png\" type=\"image/png\">\n")
            .Append("<link rel=\"stylesheet\" href=\"/theme.css\">\n")
            .Append("<link rel=\"stylesheet\" href=\"/link.css\">\n")
            .Append("<script type=\"module\" src=\"/link.js\"></script>\n")
            .Append("</head>\n<body>\n<div class=\"link-page\">\n")
            .Append("<header class=\"link-top\">\n")
            .Append("<img class=\"link-logo\" src=\"/logo-wordmark.png\" alt=\"").Append(Escape(LogoAlt)).Append("\">\n")
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
