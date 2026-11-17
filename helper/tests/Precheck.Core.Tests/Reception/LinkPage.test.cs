using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Reception.Serve;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;
// 시험용 가짜 그림 바이트(서명·크기만 맞음). 이름 공간 Reception.Settings를 통째로 열면 Settings 낱말이 헷갈린다
using LogoBytes = Precheck.Core.Tests.Reception.Settings.LogoBytes;

// 이 TASK의 시험만 한 거르기로 돌리려고 Link 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Link;

/// <summary>
/// 주소 보내기 화면(LinkPage, design.md 8절, TASK-25). QR 그림은 없다(휴대폰 첫 열기는 카카오톡 링크로만).
/// AC-1411.4 이 PC의 사설 IPv4 주소마다 큰 글자의 전체 주소 링크 http://{주소}:47200 + [주소 복사] 단추, 순서 넷, 와이파이 안내가
///           8절 글 그대로 나온다. 사설 주소가 없으면 "이 PC가 의원 와이파이에 연결되어 있지 않아요" 안내다.
///           CSP(AC-1406.6) 때문에 HTML에 style·인라인 스크립트·on…= 이 없고 /theme.css·/link.css·/link.js만 부른다. 글은 HTML 이스케이프한다.
/// AC-1406.8 라우터에 이으면 이 PC 자신(루프백)의 GET /link만 이 화면이고, 다른 곳은 404다. /qr 길은 없다.
/// 주소는 모두 가짜(사설) 주소다.
/// </summary>
public class LinkPageTests
{
    private const string Title = "접수 현황 주소 보내기";
    private const string CopyLabel = "주소 복사";
    private const string Safe = "이 주소는 병원 와이파이에서만 열려요. 밖에서는 열리지 않아 환자 정보가 보이지 않아요";
    private const string NoLan = "이 PC가 의원 와이파이에 연결되어 있지 않아요";
    private const string NoLanSub = "와이파이에 연결한 뒤 이 창을 다시 열어 주세요";

    private static readonly string[] Steps =
    {
        "1. 직원 단톡방에 붙여 넣어 보내요",
        "2. 직원은 병원 와이파이에서 주소를 눌러요",
        "3. 카톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기'",
        "4. 홈 화면에 추가해요",
    };

    private static readonly IPAddress ThisPc = IPAddress.Parse("192.168.0.23");
    private static readonly IPAddress Second = IPAddress.Parse("10.0.0.8");

    // ---- AC-1411.4 주소 카드 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1411.4 주소마다 카드 하나: 큰 글자의 전체 주소 링크 <a href=\"http://{주소}:47200/\">http://{주소}:47200</a>와 [주소 복사] 단추(button type=button, data-url에 그 주소), 받은 주소 차례 그대로")]
    public void CardPerAddress()
    {
        var html = Html(ThisPc, Second);
        var cards = Cards(html);
        Assert.Equal(2, cards.Length);

        var expected = new[] { "http://192.168.0.23:47200", "http://10.0.0.8:47200" };
        for (var i = 0; i < expected.Length; i++)
        {
            var url = expected[i];
            Assert.Equal(url, LanAddresses.PhoneUrl(i == 0 ? ThisPc : Second));
            Assert.Contains("<a class=\"link-url\" href=\"" + url + "/\">" + url + "</a>", cards[i], StringComparison.Ordinal);
            Assert.Contains("<button type=\"button\" class=\"link-copy\" data-url=\"" + url + "\">" + CopyLabel + "</button>", cards[i], StringComparison.Ordinal);
            Assert.Contains("class=\"link-help\"", cards[i], StringComparison.Ordinal);
        }
        Assert.True(html.IndexOf("192.168.0.23", StringComparison.Ordinal) < html.IndexOf("10.0.0.8", StringComparison.Ordinal));
        Assert.Equal(2, Count(html, "class=\"link-copy\""));
        Assert.DoesNotContain(NoLan, Text(html), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1411.4 머리 제목은 \"접수 현황 주소 보내기\"이고(머리 로고는 설정을 따른다, AC-5715.1), 쉬운 순서 넷과 와이파이 안내가 design.md 8절 글 그대로 차례대로 나온다")]
    public void TextsAsDesigned()
    {
        var html = Html(ThisPc);
        Assert.StartsWith("<!doctype html>", html, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"ko\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta charset=\"utf-8\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">", html, StringComparison.Ordinal);
        Assert.Contains("<title>" + Title + "</title>", html, StringComparison.Ordinal);
        Assert.Contains("<h1 class=\"link-title\">" + Title + "</h1>", html, StringComparison.Ordinal);
        Assert.Contains("class=\"link-page\"", html, StringComparison.Ordinal);

        Assert.Equal(Steps, Items(html));
        Assert.Contains(Safe, Text(html), StringComparison.Ordinal);
        // 차례는 글자 줄로 본다(번호 span처럼 줄 안 태그를 뺀 글)
        var text = Flat(html);
        Assert.True(text.IndexOf(Title, StringComparison.Ordinal) < text.IndexOf("http://192.168.0.23:47200", StringComparison.Ordinal));
        Assert.True(text.IndexOf("http://192.168.0.23:47200", StringComparison.Ordinal) < text.IndexOf(Steps[0], StringComparison.Ordinal));
        Assert.True(text.IndexOf(Steps[3], StringComparison.Ordinal) < text.IndexOf(Safe, StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1411.4 사설 주소가 없으면 주소 카드·복사 단추 없이 \"이 PC가 의원 와이파이에 연결되어 있지 않아요\" + \"와이파이에 연결한 뒤 이 창을 다시 열어 주세요\"이고 제목·순서·안내는 그대로다")]
    public void NoPrivateAddress()
    {
        var html = Html();
        Assert.Empty(Cards(html));
        Assert.DoesNotContain("link-copy", html, StringComparison.Ordinal);
        Assert.DoesNotContain("link-url", html, StringComparison.Ordinal);
        Assert.DoesNotContain(":47200", html, StringComparison.Ordinal);
        Assert.Contains("<h2 class=\"link-none-title\">" + NoLan + "</h2>", html, StringComparison.Ordinal);
        Assert.Contains("<p class=\"link-none-sub\">" + NoLanSub + "</p>", html, StringComparison.Ordinal);
        Assert.Contains("<title>" + Title + "</title>", html, StringComparison.Ordinal);
        Assert.Equal(Steps, Items(html));
        Assert.Contains(Safe, Text(html), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1411.4 IPv4가 아닌 주소(IPv6)는 카드를 만들지 않고 던지지 않는다. 그것뿐이면 사설 주소 없음 안내다")]
    public void SkipsNonIPv4()
    {
        var html = Html(IPAddress.Parse("fe80::1"), ThisPc);
        Assert.Single(Cards(html));
        Assert.Contains("http://192.168.0.23:47200", html, StringComparison.Ordinal);
        Assert.DoesNotContain("fe80", html, StringComparison.Ordinal);

        var only6 = Html(IPAddress.Parse("fe80::1"));
        Assert.Empty(Cards(only6));
        Assert.Contains(NoLan, Text(only6), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1411.4 QR 그림이 없다: 설정을 넘기지 않으면 그림이 하나도 없고(머리 로고는 AC-5715.1) canvas·svg·QR 글자가 없다")]
    public void NoQr()
    {
        foreach (var html in new[] { Html(ThisPc, Second), Html() })
        {
            Assert.Equal(0, Count(html, "<img"));
            Assert.DoesNotContain("<canvas", html, StringComparison.Ordinal);
            Assert.DoesNotContain("<svg", html, StringComparison.Ordinal);
            Assert.DoesNotMatch(new Regex("qr", RegexOptions.IgnoreCase), html);
        }
    }

    // ---- AC-1411.4 CSP·이스케이프 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-1411.4 CSP(AC-1406.6)에 맞는다: <style>·style=·on…= 없음, /theme.css → /link.css 차례의 <link>, <script type=\"module\" src=\"/link.js\"> 하나(몸 없음), 주소 링크 말고 모든 href·src는 / 로 시작")]
    public void CspSafe()
    {
        foreach (var html in new[] { Html(ThisPc, Second), Html() })
        {
            Assert.DoesNotMatch(new Regex(@"<style|\sstyle\s*=|\son[a-z]+\s*=", RegexOptions.IgnoreCase), html);
            var theme = html.IndexOf("<link rel=\"stylesheet\" href=\"/theme.css\">", StringComparison.Ordinal);
            var link = html.IndexOf("<link rel=\"stylesheet\" href=\"/link.css\">", StringComparison.Ordinal);
            Assert.True(theme > 0, "/theme.css가 없다");
            Assert.True(link > theme, "/link.css가 /theme.css 뒤에 없다");
            Assert.DoesNotContain("/style.css", html, StringComparison.Ordinal);

            var scripts = Regex.Matches(html, @"<script\b([^>]*)>([\s\S]*?)</script>").Cast<Match>().ToArray();
            Assert.Single(scripts);
            Assert.Equal(" type=\"module\" src=\"/link.js\"", scripts[0].Groups[1].Value);
            Assert.Equal("", scripts[0].Groups[2].Value);
            Assert.Equal(1, Count(html, "<script"));

            foreach (Match m in Regex.Matches(html, "\\b(?:src|href)=\"([^\"]*)\""))
            {
                var value = m.Groups[1].Value;
                if (Regex.IsMatch(value, @"^http://(?:\d{1,3}\.){3}\d{1,3}:47200/$")) continue;
                Assert.Matches("^/(?![/\\\\])", value);
            }
        }
    }

    [Fact(DisplayName = "AC-1411.4 글은 HTML 이스케이프한다: & < > \" ' 를 바꾸고, 순서 3의 작은따옴표도 &#39;로 나가며 날 글자 '·<·> 가 글에 남지 않는다")]
    public void EscapesText()
    {
        Assert.Equal("&lt;b&gt; &amp; &quot;가&quot; &#39;나&#39;", Escape("<b> & \"가\" '나'"));
        Assert.Equal("", Escape(""));
        Assert.Equal("접수 현황 → 1", Escape("접수 현황 → 1"));

        var html = Html(ThisPc);
        Assert.Contains("<span class=\"link-step-no\">3.</span> 카톡 안에서 열리면 오른쪽 위 메뉴 → &#39;다른 브라우저로 열기&#39;</li>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("'", html, StringComparison.Ordinal);
        foreach (Match m in Regex.Matches(html, ">([^<]*)<")) Assert.DoesNotContain(">", m.Groups[1].Value, StringComparison.Ordinal);
    }

    // ---- AC-1411.4 답 ----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1411.4 답은 200 text/html; charset=utf-8(UTF-8 몸 = Html)이고 보안 머리(CSP·nosniff·no-store)가 달린다. For는 부를 때마다 지금 주소를 다시 읽는다")]
    public void AnswerShape()
    {
        var answer = Answer(ThisPc);
        Assert.Equal(200, answer.Status);
        Assert.Equal("text/html; charset=utf-8", answer.ContentType);
        Assert.Equal(Html(ThisPc), Encoding.UTF8.GetString(answer.Body));
        Assert.Equal(HttpResponse.ContentSecurityPolicy, answer.Header("Content-Security-Policy"));
        Assert.Equal("nosniff", answer.Header("X-Content-Type-Options"));
        Assert.Equal("no-store", answer.Header("Cache-Control"));

        IReadOnlyList<IPAddress> now = new[] { ThisPc };
        var reads = 0;
        var page = For(() => { reads++; return now; });
        Assert.Equal(0, reads);
        Assert.Contains("192.168.0.23", Encoding.UTF8.GetString(page().Body), StringComparison.Ordinal);
        now = new[] { Second };
        var again = Encoding.UTF8.GetString(page().Body);
        Assert.Contains("10.0.0.8", again, StringComparison.Ordinal);
        Assert.DoesNotContain("192.168.0.23", again, StringComparison.Ordinal);
        now = new IPAddress[0];
        Assert.Contains(NoLan, Text(Encoding.UTF8.GetString(page().Body)), StringComparison.Ordinal);
        Assert.Equal(3, reads);
    }

    // ---- AC-1406.8 라우터에 이은 /link ------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.8 라우터에 이은 /link: 이 PC 자신(127.0.0.1·::1)의 GET /link는 주소 보내기 화면이고, 직원 폰(사설 주소)의 /link는 어떤 방법이든 404, /qr은 이 PC 자신에게도 404다")]
    public void RoutedOnlyForThisPc()
    {
        using var rig = new ServeRig(link: For(() => new[] { ServeRig.ThisPc }));
        var page = rig.Get("/link", IPAddress.Loopback, "127.0.0.1:47200");
        Assert.Equal(200, page.Status);
        Assert.Equal("text/html; charset=utf-8", page.ContentType);
        var html = Encoding.UTF8.GetString(page.Body);
        Assert.Equal(Html(ServeRig.ThisPc), html);
        Assert.Contains("http://192.168.0.23:47200", html, StringComparison.Ordinal);
        Assert.Equal(200, rig.Get("/link", IPAddress.IPv6Loopback, "localhost:47200").Status);

        Assert.Equal(404, rig.Get("/link").Status);
        Assert.Equal(404, rig.Send("POST", "/link").Status);
        Assert.Equal(404, rig.Get("/link", IPAddress.Parse("10.0.0.8")).Status);
        Assert.Empty(rig.Get("/link").Body);

        Assert.Equal(404, rig.Get("/qr", IPAddress.Loopback, "127.0.0.1:47200").Status);
        Assert.Equal(404, rig.Get("/qr").Status);

        // 화면 파일 /link.css·/link.js는 품은 파일 길이라 /link와 다르다(가짜 원천에는 없어 404)
        Assert.Equal(404, rig.Get("/link.js", IPAddress.Loopback, "127.0.0.1:47200").Status);
    }

    // ---- 도움 -------------------------------------------------------------------------------------

    private static string Html(params IPAddress[] addresses) => LinkPage.Html(addresses);

    private static HttpResponse Answer(params IPAddress[] addresses) => LinkPage.Answer(addresses);

    private static Func<HttpResponse> For(Func<IReadOnlyList<IPAddress>> addresses) => LinkPage.For(addresses);

    private static string Escape(string text) => LinkPage.Escape(text);

    /// <summary>주소 카드(section.link-card) 하나하나의 HTML</summary>
    private static string[] Cards(string html) =>
        Regex.Matches(html, "<section class=\"link-card\">([\\s\\S]*?)</section>").Cast<Match>().Select(m => m.Groups[1].Value).ToArray();

    /// <summary>순서 목록(ol.link-steps)의 li 글(태그를 빼고 이스케이프를 푼 것)</summary>
    private static string[] Items(string html)
    {
        var list = Regex.Match(html, "<ol class=\"link-steps\">([\\s\\S]*?)</ol>");
        Assert.True(list.Success, "ol.link-steps가 없다");
        return Regex.Matches(list.Groups[1].Value, "<li\\b[^>]*>([\\s\\S]*?)</li>").Cast<Match>().Select(m => Plain(m.Groups[1].Value)).ToArray();
    }

    /// <summary>body 안 글 전부(태그 자리는 줄바꿈, 이스케이프를 푼 것)</summary>
    private static string Text(string html)
    {
        var body = Regex.Match(html, "<body>([\\s\\S]*)</body>");
        Assert.True(body.Success, "body가 없다");
        return WebUtility.HtmlDecode(Regex.Replace(body.Groups[1].Value, "<[^>]*>", "\n"));
    }

    /// <summary>body 안 글을 한 줄로(태그를 빼고 이스케이프를 푼 뒤 빈칸을 하나로)</summary>
    private static string Flat(string html)
    {
        var body = Regex.Match(html, "<body>([\\s\\S]*)</body>");
        Assert.True(body.Success, "body가 없다");
        return Plain(body.Groups[1].Value);
    }

    private static string Plain(string fragment) => Regex.Replace(WebUtility.HtmlDecode(Regex.Replace(fragment, "<[^>]*>", "")), "\\s+", " ").Trim();

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }
}

/// <summary>
/// 주소 보내기 화면의 머리 로고(spec reception-other-clinic REQ-5715, 명세 고침 2026-11-17 "그 병원 설정 따르기").
/// AC-5715.1 머리는 설정 logo를 따른다: pic + 읽히는 로고 파일 → img.link-logo(data: URL, 로고 파일 형식, alt "병원 로고"), text → span.link-logo-text(이스케이프),
///           none·로고 파일 없음·깨짐·읽지 못함·설정 없음 → 로고 없이 제목만. 어느 경우든 "양지바른정형외과"·/logo-wordmark.png가 없다.
/// AC-5715.2 탭 아이콘은 /icon.png이고 /logo-mark.png를 부르지 않는다. CSP(AC-1406.6)는 그대로.
/// AC-5715.3 우리 의원 처음 값(품은 로고를 로고 파일로 옮김)이면 지금처럼 우리 로고 그림, 새 병원 처음 값이면 제목만(SettingsStore.Current() 규칙 그대로).
/// 로고 파일은 진짜 LogoStore(임시 폴더 + 가짜 암호화)이고 그림은 서명·크기만 맞는 가짜 바이트다.
/// </summary>
public sealed class LinkLogoTests : IDisposable
{
    private const string Title = "접수 현황 주소 보내기";
    private const string OurName = "양지바른정형외과";
    private const string OurWordmark = "/logo-wordmark.png";
    private const string TitleLine = "<h1 class=\"link-title\">" + Title + "</h1>\n";
    private const string WordmarkName = "reception/logo-wordmark.png";

    private static readonly IPAddress ThisPc = IPAddress.Parse("192.168.0.23");

    private readonly TempFolder data = new TempFolder();
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose() => data.Dispose();

    private StoreFolder Folder => new StoreFolder(data.Path);

    private string LogoFile => Path.Combine(data.Path, LogoStore.FileName);

    private LogoStore Logo() => new LogoStore(Folder, protector, code => { lock (reports) reports.Add(code); });

    /// <summary>로고 모양만 바꾼 새 병원 설정(pic이면 ver 1).</summary>
    private static ReceptionSettings With(string mode, string? text = null) =>
        ReceptionSettings.Fresh().WithLogo(new LogoSetting(mode, text, mode == LogoModes.Pic ? 1 : 0));

    private static string Page(Func<HttpResponse> page)
    {
        var answer = page();
        Assert.Equal(200, answer.Status);
        Assert.Equal("text/html; charset=utf-8", answer.ContentType);
        return Encoding.UTF8.GetString(answer.Body);
    }

    private static string Page(Func<ReceptionSettings>? settings, LogoStore? logo) => Page(LinkPage.For(() => new[] { ThisPc }, settings, logo));

    /// <summary>header.link-top 안 HTML(여는 태그 줄바꿈 뒤부터 닫는 태그 앞까지).</summary>
    private static string Head(string html)
    {
        var head = Regex.Match(html, "<header class=\"link-top\">\n([\\s\\S]*?)</header>");
        Assert.True(head.Success, "header.link-top이 없다");
        return head.Groups[1].Value;
    }

    private static string PicLine(string type, byte[] bytes) =>
        "<img class=\"link-logo\" src=\"data:" + type + ";base64," + Convert.ToBase64String(bytes) + "\" alt=\"병원 로고\">\n";

    /// <summary>로고 없이 제목만이고 우리 의원 이름·그림 주소가 없다.</summary>
    private static void TitleOnly(string html, string why)
    {
        Assert.True(Head(html) == TitleLine, why + ": 머리가 제목만이 아니다\n" + Head(html));
        Assert.True(!html.Contains("<img"), why + ": 그림이 있다");
        Assert.True(!html.Contains("link-logo"), why + ": 로고 자리가 있다");
        NotOurs(html);
    }

    private static void NotOurs(string html)
    {
        Assert.DoesNotContain(OurName, html, StringComparison.Ordinal);
        Assert.DoesNotContain(OurWordmark, html, StringComparison.Ordinal);
    }

    // ---- AC-5715.1 머리 로고 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5715.1 설정 logo pic이고 로고 파일(PNG)이 읽히면 머리는 그 그림(img.link-logo, src data:image/png;base64, alt \"병원 로고\") 하나 + 제목이고, \"양지바른정형외과\"·/logo-wordmark.png가 없다")]
    public void PictureLogo()
    {
        var png = LogoBytes.Png(862, 132);
        var logo = Logo();
        logo.Save(LogoKind.Png, png);

        var html = Page(() => With(LogoModes.Pic), logo);
        Assert.Equal(PicLine("image/png", png) + TitleLine, Head(html));
        Assert.Single(Regex.Matches(html, "<img").Cast<Match>());
        Assert.DoesNotContain("link-logo-text", html, StringComparison.Ordinal);
        NotOurs(html);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-5715.1 로고 파일이 JPEG면 data:image/jpeg이고, 로고를 다시 올리면 다음 /link부터 새 그림이다(그릴 때마다 로고 파일을 읽는다)")]
    public void PictureFollowsFile()
    {
        var logo = Logo();
        var page = LinkPage.For(() => new[] { ThisPc }, () => With(LogoModes.Pic), logo);
        var jpeg = LogoBytes.Jpeg(400, 100);
        logo.Save(LogoKind.Jpeg, jpeg);
        Assert.Equal(PicLine("image/jpeg", jpeg) + TitleLine, Head(Page(page)));

        var png = LogoBytes.Png(300, 60);
        logo.Save(LogoKind.Png, png);
        Assert.Equal(PicLine("image/png", png) + TitleLine, Head(Page(page)));
    }

    [Fact(DisplayName = "AC-5715.1 설정 logo text면 머리는 그 글자(span.link-logo-text, HTML 이스케이프) + 제목이고 그림이 없다: 로고 파일이 있어도 그림을 쓰지 않는다")]
    public void TextLogo()
    {
        var logo = Logo();
        logo.Save(LogoKind.Png, LogoBytes.Png(100, 50));

        var html = Page(() => With(LogoModes.Text, "<새봄&\"의원'>"), logo);
        Assert.Equal("<span class=\"link-logo-text\">&lt;새봄&amp;&quot;의원&#39;&gt;</span>\n" + TitleLine, Head(html));
        Assert.DoesNotContain("<img", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<새봄", html, StringComparison.Ordinal);
        NotOurs(html);

        // 로고 저장소를 넘기지 않아도 글자 로고는 그대로다
        Assert.Equal("<span class=\"link-logo-text\">새봄의원</span>\n" + TitleLine, Head(Page(() => With(LogoModes.Text, "새봄의원"), null)));
    }

    [Fact(DisplayName = "AC-5715.1 로고 없이 제목만: logo none(로고 파일이 있어도)·pic인데 로고 파일 없음·pic인데 깨진 로고 파일·pic인데 로고 저장소를 넘기지 않음·설정을 넘기지 않음(For 인자 하나·Html)")]
    public void NoLogo()
    {
        var logo = Logo();
        TitleOnly(Page(() => With(LogoModes.Pic), logo), "pic인데 로고 파일 없음");
        Assert.False(File.Exists(LogoFile));

        logo.Save(LogoKind.Png, LogoBytes.Png(100, 50));
        TitleOnly(Page(() => With(LogoModes.None), logo), "none(로고 파일 있음)");
        TitleOnly(Page(() => With(LogoModes.Pic), null), "pic인데 로고 저장소 없음");
        TitleOnly(Page(null, logo), "설정 없음");
        TitleOnly(Page(LinkPage.For(() => new[] { ThisPc })), "For 인자 하나");
        TitleOnly(LinkPage.Html(new[] { ThisPc }), "Html 인자 하나");

        File.WriteAllBytes(LogoFile, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        TitleOnly(Page(() => With(LogoModes.Pic), Logo()), "pic인데 깨진 로고 파일");
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.Distinct().ToArray());
    }

    [Fact(DisplayName = "AC-5715.1 로고 파일을 읽지 못해도(잠김) 이 PC의 GET /link는 200·로고 없이 제목만이고 던지지 않으며, 기록에는 오류 번호만 간다(그림 바이트 없음). 풀리면 다음 /link에 그림이 나온다")]
    public void UnreadableLogoFile()
    {
        var png = LogoBytes.Png(100, 50);
        var logo = Logo();
        logo.Save(LogoKind.Png, png);
        using var rig = new ServeRig(link: LinkPage.For(() => new[] { ServeRig.ThisPc }, () => With(LogoModes.Pic), logo));
        using (new FileStream(LogoFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            var locked = rig.Get("/link", IPAddress.Loopback, "127.0.0.1:47200");
            Assert.Equal(200, locked.Status);
            var html = Encoding.UTF8.GetString(locked.Body);
            TitleOnly(html, "잠긴 로고 파일");
            Assert.Contains("http://192.168.0.23:47200", html, StringComparison.Ordinal);
        }
        var again = rig.Get("/link", IPAddress.Loopback, "127.0.0.1:47200");
        Assert.Equal(200, again.Status);
        Assert.Equal(PicLine("image/png", png) + TitleLine, Head(Encoding.UTF8.GetString(again.Body)));

        var picture = Convert.ToBase64String(png);
        Assert.All(reports, code => Assert.Matches("^E-[A-Z0-9-]+$", code));
        Assert.All(reports, code => Assert.DoesNotContain(picture, code, StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-5715.1 그릴 때마다 지금 설정을 읽는다: none → text → pic → none으로 바꾸면 바로 다음 /link가 따른다(For는 부를 때만 설정을 읽는다)")]
    public void ReadsSettingsEachTime()
    {
        var png = LogoBytes.Png(100, 50);
        var logo = Logo();
        logo.Save(LogoKind.Png, png);
        var now = With(LogoModes.None);
        var reads = 0;
        var page = LinkPage.For(() => new[] { ThisPc }, () => { reads++; return now; }, logo);
        Assert.Equal(0, reads);

        TitleOnly(Page(page), "none");
        now = With(LogoModes.Text, "새봄의원");
        Assert.Equal("<span class=\"link-logo-text\">새봄의원</span>\n" + TitleLine, Head(Page(page)));
        now = With(LogoModes.Pic);
        Assert.Equal(PicLine("image/png", png) + TitleLine, Head(Page(page)));
        now = With(LogoModes.None);
        TitleOnly(Page(page), "다시 none");
        Assert.Equal(4, reads);
    }

    // ---- AC-5715.2 탭 아이콘·CSP --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5715.2 탭 아이콘은 <link rel=\"icon\" href=\"/icon.png\" type=\"image/png\"> 하나이고 /logo-mark.png를 부르지 않는다(로고가 그림·글자·없음·설정 없음 어느 것이든)")]
    public void NeutralIcon()
    {
        var logo = Logo();
        logo.Save(LogoKind.Png, LogoBytes.Png(100, 50));
        foreach (var html in new[]
        {
            Page(() => With(LogoModes.Pic), logo),
            Page(() => With(LogoModes.Text, "새봄의원"), logo),
            Page(() => With(LogoModes.None), logo),
            LinkPage.Html(new[] { ThisPc }),
        })
        {
            Assert.Contains("<link rel=\"icon\" href=\"/icon.png\" type=\"image/png\">", html, StringComparison.Ordinal);
            var icons = Regex.Matches(html, "<link rel=\"(?:icon|apple-touch-icon|shortcut icon)\" href=\"([^\"]+)\"").Cast<Match>().Select(m => m.Groups[1].Value).ToArray();
            Assert.Equal(new[] { "/icon.png" }, icons);
            Assert.DoesNotContain("logo-mark", html, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-5715.2 어느 로고 모양이든 CSP(AC-1406.6)에 맞는다: <style>·style=·on…= 없음, 스크립트는 /link.js 하나, src·href는 / 로 시작하고(주소 링크 말고) data:는 img.link-logo의 image/png·jpeg base64뿐, QR 글자 없음")]
    public void CspSafeForEveryLogo()
    {
        var logo = Logo();
        logo.Save(LogoKind.Jpeg, LogoBytes.Jpeg(400, 100));
        foreach (var html in new[]
        {
            Page(() => With(LogoModes.Pic), logo),
            // 병원 이름 글자에 태그 모양을 넣어도 글로만 나간다(스크립트가 하나 더 생기지 않는다)
            Page(() => With(LogoModes.Text, "<script>새봄</script>"), logo),
            Page(() => With(LogoModes.None), logo),
        })
        {
            Assert.DoesNotMatch(new Regex(@"<style|\sstyle\s*=|\son[a-z]+\s*=", RegexOptions.IgnoreCase), html);
            var scripts = Regex.Matches(html, @"<script\b([^>]*)>([\s\S]*?)</script>").Cast<Match>().ToArray();
            Assert.Single(scripts);
            Assert.Equal(" type=\"module\" src=\"/link.js\"", scripts[0].Groups[1].Value);
            Assert.Equal("", scripts[0].Groups[2].Value);

            foreach (Match m in Regex.Matches(html, "<(\\w+)\\b[^>]*?\\b(src|href)=\"([^\"]*)\""))
            {
                var value = m.Groups[3].Value;
                if (Regex.IsMatch(value, @"^http://(?:\d{1,3}\.){3}\d{1,3}:47200/$")) continue;
                if (value.StartsWith("data:", StringComparison.Ordinal))
                {
                    Assert.Equal(("img", "src"), (m.Groups[1].Value, m.Groups[2].Value));
                    Assert.Matches("^data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$", value);
                    continue;
                }
                Assert.Matches("^/(?![/\\\\])", value);
            }
            Assert.DoesNotMatch(new Regex("qr", RegexOptions.IgnoreCase), Regex.Replace(html, "src=\"data:[^\"]*\"", "src=\"\""));
            NotOurs(html);
        }
    }

    // ---- AC-5715.3 우리 의원·새 병원 처음 값 ---------------------------------------------------------------

    /// <summary>ReceptionServices와 같이: 같은 폴더·같은 암호화의 LogoStore·SettingsStore(품은 logo-wordmark.png), 켤 때 설정 한 번 읽기.</summary>
    private (SettingsStore Settings, LogoStore Logo) Start()
    {
        var logo = Logo();
        var settings = new SettingsStore(Folder, protector, () => EmbeddedStaticSource.Core().Read(WordmarkName), logo, code => { lock (reports) reports.Add(code); });
        settings.Current();
        return (settings, logo);
    }

    [Fact(DisplayName = "AC-5715.3 우리 의원 처음 값(접수 현황을 쓴 흔적이 있는 data 폴더 → 로고 pic, 품은 logo-wordmark.png를 로고 파일로 옮김)이면 /link 머리는 지금처럼 우리 로고 그림(그 PNG 바이트)이다")]
    public void OursShowsOurLogo()
    {
        new ReceptionLists(Folder, protector).Save(PickLists.Defaults);
        var (settings, logo) = Start();
        Assert.Equal(LogoModes.Pic, settings.Current().Logo.Mode);
        var wordmark = File.ReadAllBytes(Repo.PathOf("reception", "www", "logo-wordmark.png"));
        Assert.Equal(wordmark, EmbeddedStaticSource.Core().Read(WordmarkName));

        var html = Page(settings.Current, logo);
        Assert.Equal(PicLine("image/png", wordmark) + TitleLine, Head(html));
        NotOurs(html);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-5715.3 새 병원 처음 값(빈 data 폴더 → 로고 none)이면 /link는 로고 없이 제목만이고 로고 파일도 만들지 않는다. 그 뒤 로고를 올려 pic이 되면 그 그림이다")]
    public void FreshShowsTitleOnly()
    {
        var (settings, logo) = Start();
        Assert.Equal(LogoModes.None, settings.Current().Logo.Mode);
        TitleOnly(Page(settings.Current, logo), "새 병원");
        Assert.False(File.Exists(LogoFile));

        var jpeg = LogoBytes.Jpeg(400, 100);
        logo.Save(LogoKind.Jpeg, jpeg);
        settings.Update(s => s.WithLogo(new LogoSetting(LogoModes.Pic, s.Logo.Text, s.Logo.Ver + 1)));
        Assert.Equal(PicLine("image/jpeg", jpeg) + TitleLine, Head(Page(settings.Current, logo)));
        Assert.Empty(reports);
    }
}
