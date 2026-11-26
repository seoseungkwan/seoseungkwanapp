using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>가짜 보내기(ISheetTransport): 부른 차례를 적고 정해 둔 답을 준다. 진짜 HTTP는 TASK-10.</summary>
internal sealed class FakeSheetTransport : ISheetTransport
{
    public readonly List<string> Calls = new List<string>();
    public readonly List<string?> Bodies = new List<string?>();
    public Func<string, string, SheetHttpReply> Answer = (m, u) => new SheetHttpReply { Status = 200, Body = "{\"ok\":true}" };

    public SheetHttpReply Send(string method, string url, string? jsonBody)
    {
        Calls.Add(method + " " + url + (jsonBody == null ? "" : " +body"));
        Bodies.Add(jsonBody);
        return Answer(method, url);
    }
}

/// <summary>
/// 구글 코드 답 읽기(spec google-link TASK-9, AC-8510.5). 비트시트 WebTests를 번호 오류·주소 꼴·넘겨받기 host 검사 뜻으로 옮겼다:
/// 비트시트는 구글이 준 한국어 글을 그대로 보였지만, 도우미는 숫자·참거짓·칸 주소만 남기고 오류는 design.md 9-3 번호 하나로 바꾼다.
/// 주소·파일 id·이름은 지어낸 것이다.
/// </summary>
public class SheetReplyTests
{
    private const string Script = "https://script.google.com/macros/s/AKfycFAKE0123456789/exec";
    private const string Echo = "https://script.googleusercontent.com/macros/echo?user_content_key=FAKEabc";
    private const string FileId = "1FAKEfileFAKEfileFAKEfile_0123456789";

    private static Dictionary<string, object> Req() => new Dictionary<string, object> { ["token"] = "t", ["action"] = "write" };

    private static string Code(Action act) => Assert.Throws<SheetException>(act).Code;

    [Fact(DisplayName = "AC-8510.5 POST 한 번 → 302 googleusercontent → GET, 답의 숫자·참거짓만 읽는다(비트시트 PostThen302ThenGet)")]
    public void PostThen302ThenGet()
    {
        var http = new FakeSheetTransport
        {
            Answer = (m, u) => m == "POST"
                ? new SheetHttpReply { Status = 302, Location = Echo }
                : new SheetHttpReply { Status = 200, Body = "{\"ok\":true,\"fileId\":\"" + FileId + "\",\"fileUrl\":\"https://docs.google.com/x#gid=1\",\"created\":true,\"added\":3,\"filled\":2,\"overwritten\":0,\"skipped\":1,\"full\":false,\"shareFailed\":1,\"cancelCleared\":4,\"cancelKept\":5,\"freeFixed\":6,\"inserted\":7,\"cleaned\":8,\"version\":\"8\",\"sheetGid\":123456789}" },
        };
        var r = new WebAppClient(http).Call(Script, Req());
        Assert.Equal("POST " + Script + " +body|GET " + Echo, string.Join("|", http.Calls));
        Assert.Equal("{\"token\":\"t\",\"action\":\"write\"}", http.Bodies[0]);
        Assert.True(r.Ok && r.Created && !r.Full, "flags");
        Assert.Equal(3, r.Added); Assert.Equal(2, r.Filled); Assert.Equal(1, r.Skipped); Assert.Equal(1, r.ShareFailed);
        Assert.Equal(4, r.CancelCleared); Assert.Equal(5, r.CancelKept); Assert.Equal(6, r.FreeFixed); Assert.Equal(7, r.Inserted); Assert.Equal(8, r.Cleaned);
        Assert.Equal("8", r.Version);
        Assert.Equal(FileId, r.FileId);
        Assert.Equal(123456789L, r.SheetGid);
        Assert.Equal("새 달 파일 날짜 시트에 남아 있던 글자 8칸을 지웠어요 (원본은 그대로)", RunNotes.CleanedLine(r));
        Assert.Equal("", RunNotes.CleanedLine(new WebAppReply()));
        Assert.Empty(RunNotes.Warnings(new WebAppReply { Version = WebAppClient.CodeVersion, Cleaned = 3 }));
        Assert.Equal("8", WebAppClient.CodeVersion);
    }

    [Fact(DisplayName = "AC-8510.5 답 결과에는 숫자·참거짓·칸 주소(와 모양을 본 파일 id·판·원본 이름·gid·mac)만 — 주소·오류 글·이름 칸은 없다")]
    public void ReplyKeepsOnlyNumbersFlagsAndCells()
    {
        var allowed = new HashSet<Type> { typeof(bool), typeof(int), typeof(long), typeof(string), typeof(List<string>), typeof(List<SheetMonth>) };
        var props = typeof(WebAppReply).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        Assert.All(props, p => Assert.Contains(p.PropertyType, allowed));
        Assert.Equal(
            "FileId,Mac,TemplateTitle,Version",
            string.Join(",", props.Where(p => p.PropertyType == typeof(string)).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal)));
        Assert.DoesNotContain(props, p => p.Name is "FileUrl" or "Error" or "Code" or "Name" or "Key");

        var r = SheetReply.Parse("{\"ok\":true,\"fileId\":\"https://docs.google.com/spreadsheets/d/x\",\"version\":\"<b>8</b>\",\"added\":-3,\"filled\":1.5,\"skipped\":\"4\",\"full\":\"yes\",\"created\":1,"
            + "\"templateTitle\":\"가짜\\u0007원본\\n시트\",\"mac\":\"not base64url!\",\"sheetGid\":-1,\"error\":\"홍길동 12345\"}");
        Assert.Equal("", r.FileId);
        Assert.Equal("", r.Version);
        Assert.Equal(0, r.Added);
        Assert.Equal(0, r.Filled);
        Assert.Equal(0, r.Skipped);
        Assert.False(r.Full);
        Assert.False(r.Created);
        Assert.Equal("가짜원본시트", r.TemplateTitle);
        Assert.Equal("", r.Mac);
        Assert.Equal(0L, r.SheetGid);

        var longTitle = SheetReply.Parse("{\"ok\":true,\"templateTitle\":\"" + new string('가', 300) + "\",\"mac\":\"" + new string('A', 43) + "\"}");
        Assert.Equal(200, longTitle.TemplateTitle.Length);
        Assert.Equal(new string('A', 43), longTitle.Mac);
    }

    [Fact(DisplayName = "AC-8510.5 비율 식 칸 주소는 '23!J9' 꼴만, 20개까지(다른 모양·값은 버림)")]
    public void RatioCellsAreShapeCheckedAndCapped()
    {
        var cells = Enumerable.Range(1, 30).Select(i => "\"" + (i % 31 + 1) + "!J" + (i + 8) + "\"").ToList();
        cells.Insert(0, "\"홍길동\"");
        cells.Insert(1, "\"23!j9\"");
        cells.Insert(2, "\"23!J99999\"");
        cells.Insert(3, "\"23!J9!K9\"");
        cells.Insert(4, "12");
        cells.Insert(5, "\"" + new string('가', 32) + "!J9\"");
        var r = SheetReply.Parse("{\"ok\":true,\"ratioFormulas\":{\"fixed\":128,\"skipped\":[" + string.Join(",", cells) + "],\"skippedCount\":36,\"failed\":true}}");
        Assert.Equal(128, r.RatioFixed);
        Assert.Equal(36, r.RatioSkipped);
        Assert.True(r.RatioFailed);
        Assert.Equal(20, r.RatioSkippedCells.Count);
        Assert.Equal("2!J9", r.RatioSkippedCells[0]);
        Assert.All(r.RatioSkippedCells, c => Assert.Matches("^[^!]{1,31}![A-Z]{1,3}[0-9]{1,4}$", c));
        Assert.Equal("시트 1!AB12", SheetReply.Parse("{\"ok\":true,\"ratioFormulas\":{\"skipped\":[\"시트 1!AB12\"]}}").RatioSkippedCells.Single());
    }

    [Fact(DisplayName = "AC-8510.5 months 답: 달마다 ym·파일 id(없으면 빈 글)·날짜 시트 '1'~'31' gid만, 13달까지")]
    public void MonthsReply()
    {
        var body = "{\"ok\":true,\"version\":\"8\",\"months\":["
            + "{\"ym\":\"2026-11\",\"fileId\":\"" + FileId + "\",\"gids\":{\"1\":11,\"31\":31,\"32\":1,\"합계\":2,\"0\":3,\"2\":\"x\"}},"
            + "{\"ym\":\"2026-10\",\"fileId\":null,\"gids\":{}},"
            + "{\"ym\":\"2026-13\",\"fileId\":\"" + FileId + "\",\"gids\":{}},"
            + "{\"ym\":\"2026-09\",\"fileId\":\"bad id!\",\"gids\":null}"
            + string.Concat(Enumerable.Range(1, 15).Select(i => ",{\"ym\":\"2025-" + (i % 12 + 1).ToString("00", System.Globalization.CultureInfo.InvariantCulture) + "\",\"fileId\":null}"))
            + "]}";
        var r = SheetReply.Parse(body, "months");
        Assert.Equal(13, r.Months.Count);
        Assert.Equal("2026-11", r.Months[0].Ym);
        Assert.Equal(FileId, r.Months[0].FileId);
        Assert.Equal("1:11,31:31", string.Join(",", r.Months[0].Gids.Select(g => g.Key + ":" + g.Value)));
        Assert.Equal("2026-10", r.Months[1].Ym);
        Assert.Equal("", r.Months[1].FileId);
        Assert.Empty(r.Months[1].Gids);
        Assert.Equal("2026-09", r.Months[2].Ym);
        Assert.Equal("", r.Months[2].FileId);
        Assert.DoesNotContain(r.Months, m => m.Ym == "2026-13");
    }

    [Theory(DisplayName = "AC-8510.5 구글 오류 code → design.md 9-3 번호 하나(구글이 준 글은 버림)")]
    [InlineData("token_not_set", "write", "E-GSHEET-NOKEY")]
    [InlineData("bad_token", "write", "E-GSHEET-KEY")]
    [InlineData("busy", "write", "E-GSHEET-BUSY")]
    [InlineData("template", "ping", "E-GSHEET-TEMPLATE")]
    [InlineData("folder", "write", "E-GSHEET-FOLDER")]
    [InlineData("no_sheet", "write", "E-GSHEET-DAY")]
    [InlineData("layout", "write", "E-GSHEET-LAYOUT")]
    [InlineData("bad_request", "write", "E-GSHEET-SHAPE")]
    [InlineData("bad_request", "ping", "E-GSHEET-SHAPE")]
    [InlineData("clean", "write", "E-GSHEET-FAILED")]
    [InlineData("google", "write", "E-GSHEET-FAILED")]
    [InlineData("", "write", "E-GSHEET-FAILED")]
    [InlineData("zzz", "write", "E-GSHEET-FAILED")]
    [InlineData("bad_request", "months", "E-GSHEET-OLD")]
    [InlineData("bad_token", "hello", "E-GSHEET-OLD")]
    [InlineData("token_not_set", "hello", "E-GSHEET-NOKEY")]
    [InlineData("busy", "hello", "E-GSHEET-BUSY")]
    public void GoogleErrorsBecomeOneCode(string code, string action, string expected)
    {
        var e = Assert.Throws<SheetException>(() => SheetReply.Parse("{\"ok\":false,\"code\":\"" + code + "\",\"error\":\"구글 쪽 오류: 홍길동 12345\"}", action));
        Assert.Equal(expected, e.Code);
        Assert.Equal(expected, e.Message);
    }

    [Fact(DisplayName = "AC-8510.5 비트시트 ErrorReplyShowsKoreanSentence → 오류 답은 번호만(한국어 글은 웹 lib/errors.ts가 그린다)")]
    public void ErrorReplyGivesCodeOnly()
    {
        var http = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = 200, Body = "{\"ok\":false,\"code\":\"bad_token\",\"error\":\"비밀 글자가 맞지 않습니다.\"}" } };
        var e = Assert.Throws<SheetException>(() => new WebAppClient(http).Call(Script, Req()));
        Assert.Equal("E-GSHEET-KEY", e.Code);
        Assert.DoesNotContain("비밀", e.Message, StringComparison.Ordinal);
        Assert.Equal("E-GSHEET-FAILED", Code(() => SheetReply.Parse("{\"version\":\"8\"}")));
        Assert.Equal("E-GSHEET-FAILED", Code(() => SheetReply.Parse("{\"ok\":\"true\"}")));
    }

    [Fact(DisplayName = "AC-8510.5 HTML·JSON 아닌 답은 E-GSHEET-LOGIN, 빈 주소 E-GSHEET-NOURL, 꼴이 틀린 주소 E-GSHEET-URL(보내지 않음), 401·403 DENIED, 404 URL, 5xx·그 밖 SERVER")]
    public void HtmlAndStatusCodes()
    {
        var html = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = 200, Body = "<!DOCTYPE html><html>로그인</html>" } };
        Assert.Equal("E-GSHEET-LOGIN", Code(() => new WebAppClient(html).Call(Script, Req())));
        foreach (var body in new[] { "", "  ", "not json", "[1,2]", "\"ok\"", "{\"ok\":true", "null" })
        {
            Assert.Equal("E-GSHEET-LOGIN", Code(() => SheetReply.Parse(body)));
        }

        var none = new FakeSheetTransport();
        Assert.Equal("E-GSHEET-NOURL", Code(() => new WebAppClient(none).Call("", Req())));
        Assert.Equal("E-GSHEET-NOURL", Code(() => new WebAppClient(none).Call(null, Req())));
        Assert.Equal("E-GSHEET-URL", Code(() => new WebAppClient(none).Call("https://x/exec", Req())));
        Assert.Equal("E-GSHEET-URL", Code(() => new WebAppClient(none).Call("http://script.google.com/macros/s/AKfycFAKE0123456789/exec", Req())));
        Assert.Empty(none.Calls);

        foreach (var (status, code) in new[] { (401, "E-GSHEET-DENIED"), (403, "E-GSHEET-DENIED"), (404, "E-GSHEET-URL"), (500, "E-GSHEET-SERVER"), (503, "E-GSHEET-SERVER"), (204, "E-GSHEET-SERVER"), (400, "E-GSHEET-SERVER") })
        {
            var http = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = status, Body = "{\"ok\":true}" } };
            Assert.Equal(code, Code(() => new WebAppClient(http).Call(Script, Req())));
        }
    }

    [Fact(DisplayName = "AC-8510.5 넘겨받기는 https script.googleusercontent.com만 GET으로 따라가고(상대 주소 포함) POST는 한 번만, 다른 곳(로그인 화면 등)은 E-GSHEET-LOGIN, 5번 넘거나 Location 없으면 E-GSHEET-SERVER")]
    public void RedirectsOnlyToGoogleUserContent()
    {
        var n = 0;
        var http = new FakeSheetTransport
        {
            Answer = (m, u) => ++n == 1 ? new SheetHttpReply { Status = 302, Location = Echo }
                : n == 2 ? new SheetHttpReply { Status = 302, Location = "/macros/echo?user_content_key=FAKEnext" }
                : new SheetHttpReply { Status = 200, Body = "{\"ok\":true,\"version\":\"1\",\"templateTitle\":\"T\"}" },
        };
        var r = new WebAppClient(http).Call(Script, Req());
        Assert.Equal(1, http.Calls.Count(c => c.StartsWith("POST", StringComparison.Ordinal)));
        Assert.Equal("GET https://script.googleusercontent.com/macros/echo?user_content_key=FAKEnext", http.Calls[2]);
        Assert.Null(http.Bodies[1]);
        Assert.Equal("T", r.TemplateTitle);
        Assert.Equal("1", r.Version);

        foreach (var away in new[] { "https://accounts.google.com/ServiceLogin?continue=x", "https://other.example/final", "http://script.googleusercontent.com/macros/echo", "https://script.googleusercontent.com.evil.example/x", "https://evil.example/@script.googleusercontent.com", "/relative-from-script" })
        {
            var h = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = 302, Location = away } };
            Assert.Equal("E-GSHEET-LOGIN", Code(() => new WebAppClient(h).Call(Script, Req())));
            Assert.Single(h.Calls);
        }

        var loop = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = 302, Location = Echo } };
        Assert.Equal("E-GSHEET-SERVER", Code(() => new WebAppClient(loop).Call(Script, Req())));
        Assert.Equal(6, loop.Calls.Count);
        var empty = new FakeSheetTransport { Answer = (m, u) => new SheetHttpReply { Status = 302, Location = "" } };
        Assert.Equal("E-GSHEET-SERVER", Code(() => new WebAppClient(empty).Call(Script, Req())));
    }

    [Fact(DisplayName = "AC-8510.5 보내기 약속이 낸 연결 오류(NET·TIMEOUT·CUT)는 그대로 지나간다")]
    public void TransportCodesPassThrough()
    {
        foreach (var code in new[] { SheetErrors.Net, SheetErrors.Timeout, SheetErrors.Cut })
        {
            var http = new FakeSheetTransport { Answer = (m, u) => throw new SheetException(code) };
            Assert.Equal(code, Code(() => new WebAppClient(http).Call(Script, Req())));
        }
        Assert.Equal("E-GSHEET-NET,E-GSHEET-TIMEOUT,E-GSHEET-CUT", string.Join(",", SheetErrors.Net, SheetErrors.Timeout, SheetErrors.Cut));
    }

    [Fact(DisplayName = "AC-8510.5 hello 답: mac(base64url)·판만 읽는다, 옛 판(7)·판 없음 답이면 E-GSHEET-OLD")]
    public void HelloReply()
    {
        var mac = "FAKEmacFAKEmacFAKEmacFAKEmacFAKEmac0123456";
        var r = SheetReply.Parse("{\"ok\":true,\"version\":\"8\",\"mac\":\"" + mac + "\"}", "hello");
        Assert.Equal(mac, r.Mac);
        Assert.Equal("8", r.Version);
        Assert.Equal("E-GSHEET-OLD", Code(() => SheetReply.Parse("{\"ok\":true,\"version\":\"7\",\"mac\":\"" + mac + "\"}", "hello")));
        Assert.Equal("E-GSHEET-OLD", Code(() => SheetReply.Parse("{\"ok\":true,\"mac\":\"" + mac + "\"}", "months")));
        Assert.Equal("10", SheetReply.Parse("{\"ok\":true,\"version\":\"10\",\"months\":[]}", "months").Version);
        Assert.Equal("7", SheetReply.Parse("{\"ok\":true,\"version\":\"7\"}", "write").Version); // write는 옛 판도 받는다(oldCode는 TASK-10)
    }

    [Fact(DisplayName = "AC-8510.5 주소 꼴: script.google.com /macros/s/{id}/exec 또는 /a/macros/{도메인}/s/{id}/exec만")]
    public void ScriptUrlShape()
    {
        foreach (var ok in new[]
        {
            Script,
            "https://script.google.com/a/macros/fake-clinic.test/s/AKfycFAKE0123456789/exec",
            "https://script.google.com/macros/s/" + new string('a', 200) + "/exec",
        })
        {
            Assert.True(SheetUrls.IsScriptUrl(ok), ok);
        }
        foreach (var bad in new[]
        {
            null, "", " " + Script, Script + " ", Script + "\n", Script + "?x=1", Script + "/",
            "http://script.google.com/macros/s/AKfycFAKE0123456789/exec",
            "https://script.google.com/macros/s/AKfycFAKE0123456789/dev",
            "https://script.google.com/macros/s/short/exec",
            "https://script.google.com/macros/s/" + new string('a', 201) + "/exec",
            "https://script.google.com.evil.example/macros/s/AKfycFAKE0123456789/exec",
            "https://SCRIPT.google.com/macros/s/AKfycFAKE0123456789/exec",
            "https://script.google.com/a/macros/fake_clinic/s/AKfycFAKE0123456789/exec",
            "https://script.google.com/a/macros//s/AKfycFAKE0123456789/exec",
            "https://user@script.google.com/macros/s/AKfycFAKE0123456789/exec",
            "https://script.google.com/macros/s/AKfycFAKE0123456789/exec#x",
        })
        {
            Assert.False(SheetUrls.IsScriptUrl(bad), bad);
        }
    }

    [Fact(DisplayName = "AC-8510.5 넘겨받기 주소 풀기: 절대·상대 주소를 풀어 https script.googleusercontent.com(포트 없음)일 때만 돌려준다")]
    public void FollowShape()
    {
        Assert.Equal(Echo, SheetUrls.Follow(Script, Echo));
        Assert.Equal("https://script.googleusercontent.com/b?c=1", SheetUrls.Follow("https://script.googleusercontent.com/a/x", "/b?c=1"));
        Assert.Equal("https://script.googleusercontent.com/a/y", SheetUrls.Follow("https://script.googleusercontent.com/a/x", "y"));
        foreach (var bad in new[] { "", "  ", "/b", "https://accounts.google.com/x", "https://script.googleusercontent.com:8443/x", "https://a@script.googleusercontent.com/x", "ftp://script.googleusercontent.com/x", "javascript:alert(1)" })
        {
            Assert.Null(SheetUrls.Follow(Script, bad));
        }
    }
}
