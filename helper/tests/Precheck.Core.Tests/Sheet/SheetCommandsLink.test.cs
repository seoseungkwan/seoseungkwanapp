using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Sheet;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// sheet.link(spec google-link TASK-10, AC-8511.3, design.md 9-2·2절 표 17): 코드 주소·함께 쓸 메일은 이 PC 확인 창 [바꾸기]로만 바뀌고,
/// 바꾸기 전에 새 주소의 코드가 이 PC 비밀 글자를 아는지 hello(HMAC)로 본다. 주소·메일은 지어낸 것이다.
/// </summary>
public class SheetCommandsLinkTests
{
    private const string NewUrl = "https://script.google.com/macros/s/AKfycbNEWfakeNEWfake0123456789/exec";

    private static string LinkArgs(string url, params string[] mails) =>
        "{\"url\":\"" + url + "\",\"shareWith\":[" + string.Join(",", mails.Select(m => "\"" + m + "\"")) + "]}";

    [Theory(DisplayName = "AC-8511.3 sheet.link: 구글 웹 앱 /exec 꼴이 아닌 주소는 창 없이 E-GSHEET-URL이고 전 값 그대로")]
    [InlineData("http://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec")]
    [InlineData("https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/dev")]
    [InlineData("https://script.google.com.evil.test/macros/s/AKfycbFAKEfakeFAKE0123456789/exec")]
    [InlineData("https://evil.test/macros/s/AKfycbFAKEfakeFAKE0123456789/exec")]
    [InlineData("https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec?x=1")]
    [InlineData("https://script.google.com/macros/s/short/exec")]
    [InlineData("https://script.googleusercontent.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec")]
    [InlineData("https://script.google.com/a/macros/bad_domain/s/AKfycbFAKEfakeFAKE0123456789/exec")]
    public void BadUrlShapes(string url)
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        Assert.Equal("E-GSHEET-URL", rig.Error("sheet.link", LinkArgs(url)));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Google.Calls);
        Assert.Equal(SheetRig.Url, rig.Store.Load().Url);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: 메일 모양이 아니거나 11개 이상이면 E-HELPER-BAD-MESSAGE(창 없음)")]
    public void BadMails()
    {
        using var rig = new SheetRig().Linked();
        Assert.Equal("E-HELPER-BAD-MESSAGE", rig.Error("sheet.link", LinkArgs(NewUrl, "not-a-mail")));
        Assert.Equal("E-HELPER-BAD-MESSAGE", rig.Error("sheet.link", LinkArgs(NewUrl, Enumerable.Range(1, 11).Select(i => "d" + i + "@fake.test").ToArray())));
        Assert.Equal("E-HELPER-BAD-MESSAGE", rig.Error("sheet.link", "{\"url\":\"" + NewUrl + "\"}"));
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: 이 PC에 비밀 글자가 없으면 창 없이 E-GSHEET-SECRET")]
    public void NeedsSecret()
    {
        using var rig = new SheetRig();
        Assert.Equal("E-GSHEET-SECRET", rig.Error("sheet.link", LinkArgs(NewUrl)));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: 같은 주소·메일이면 창 없이 {v, ok:true, same:true}")]
    public void SameValuesNoWindow()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail, SheetRig.OtherMail);
        var data = rig.Result("sheet.link", LinkArgs(SheetRig.Url, SheetRig.Mail, SheetRig.OtherMail));
        Assert.Equal("{\"v\":1,\"ok\":true,\"same\":true}", data.GetRawText());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: [취소]·2분 지남이면 E-GSHEET-DECLINED이고 주소·메일·확인 여부 그대로, 구글을 부르지 않는다")]
    public void DeclinedKeepsOldValues()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        rig.Confirm.Answer = false;

        Assert.Equal("E-GSHEET-DECLINED", rig.Error("sheet.link", LinkArgs(NewUrl, SheetRig.OtherMail)));

        var shown = Assert.Single(rig.Confirm.Shown);
        Assert.Equal(TimeSpan.FromMinutes(2), shown.Timeout);
        var state = rig.Store.Load();
        Assert.Equal(SheetRig.Url, state.Url);
        Assert.Equal(new[] { SheetRig.Mail }, state.ShareWith);
        Assert.True(state.Verified);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: 창 글은 2절 표 17 그대로이고 새 주소와 메일이 다 보인다(메일이 없으면 '없음')")]
    public void WindowText()
    {
        Assert.Equal("수납일지 구글 코드 주소 바꾸기", SheetPrompt.Title);
        Assert.Equal("바꾸기", SheetPrompt.Change);
        Assert.Equal("취소", SheetPrompt.Cancel);
        Assert.Equal(
            "오늘 수납 환자 줄(이름·차트번호·금액)을 아래 구글 코드로 보내고, 새 달 파일을 아래 메일과 함께 써요. 병원 구글 계정에서 받은 주소가 맞으면 [바꾸기]를 눌러 주세요.\n\n"
            + "주소: " + NewUrl + "\n함께 쓸 직원 메일: desk@fake.test, boss@fake.test",
            SheetPrompt.Text(NewUrl, new[] { SheetRig.Mail, SheetRig.OtherMail }));
        Assert.EndsWith("함께 쓸 직원 메일: 없음", SheetPrompt.Text(NewUrl, Array.Empty<string>()), StringComparison.Ordinal);

        using var rig = new SheetRig().Linked();
        rig.Confirm.Answer = false;
        rig.Send("sheet.link", LinkArgs(SheetRig.WorkspaceUrl, SheetRig.OtherMail));
        Assert.Equal(SheetPrompt.Text(SheetRig.WorkspaceUrl, new[] { SheetRig.OtherMail }), Assert.Single(rig.Confirm.Shown).Text);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: [바꾸기] → 새 주소로 비밀 글자 없이 hello(nonce)를 먼저 보내 mac이 맞을 때만 sheet.dat에 주소·메일·verified 참 → {v, ok:true}")]
    public void ChangeAfterHello()
    {
        using var rig = new SheetRig().Linked(false, SheetRig.Url, SheetRig.Mail);
        // 창이 떠 있는 동안에는 아직 바뀌지 않았다
        rig.Confirm.While = () => Assert.Equal(SheetRig.Url, rig.Store.Load().Url);

        var data = rig.Result("sheet.link", LinkArgs(SheetRig.WorkspaceUrl, SheetRig.OtherMail));

        Assert.Equal("{\"v\":1,\"ok\":true}", data.GetRawText());
        Assert.Equal(new[] { "hello" }, rig.Google.Actions);
        var post = rig.Google.Calls[0];
        Assert.Equal(("POST", SheetRig.WorkspaceUrl), (post.Method, post.Url));
        Assert.Equal("{\"action\":\"hello\",\"nonce\":\"" + SheetRig.Nonce + "\"}", post.Body);
        Assert.DoesNotContain(SheetRig.Secret, rig.Google.AllBodies, StringComparison.Ordinal);
        Assert.All(rig.Google.Calls.Skip(1), c => Assert.StartsWith("https://script.googleusercontent.com/", c.Url, StringComparison.Ordinal));
        var state = rig.Store.Load();
        Assert.Equal(SheetRig.WorkspaceUrl, state.Url);
        Assert.Equal(new[] { SheetRig.OtherMail }, state.ShareWith);
        Assert.True(state.Verified);
        Assert.Equal(SheetRig.Secret, state.Secret);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: 메일만 바꿔도 창을 띄우고, 주소가 그대로이고 이미 확인했으면 hello 없이 적는다")]
    public void MailOnlyChange()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        var data = rig.Result("sheet.link", LinkArgs(SheetRig.Url, SheetRig.Mail, SheetRig.OtherMail));
        Assert.Equal("{\"v\":1,\"ok\":true}", data.GetRawText());
        Assert.Single(rig.Confirm.Shown);
        Assert.Empty(rig.Google.Calls);
        Assert.Equal(new[] { SheetRig.Mail, SheetRig.OtherMail }, rig.Store.Load().ShareWith);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: [바꾸기] 뒤 hello mac이 틀리면 E-GSHEET-KEY, 7판(hello 모름)이면 E-GSHEET-OLD — 전 값 그대로, token은 보내지 않음")]
    public void WrongMacKeepsOld()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        rig.Google.WrongMac = true;
        Assert.Equal("E-GSHEET-KEY", rig.Error("sheet.link", LinkArgs(NewUrl, SheetRig.OtherMail)));
        rig.Google.WrongMac = false;
        rig.Google.Version = "7";
        Assert.Equal("E-GSHEET-OLD", rig.Error("sheet.link", LinkArgs(NewUrl, SheetRig.OtherMail)));
        rig.Google.Version = "8";
        rig.Google.TokenNotSet = true;
        Assert.Equal("E-GSHEET-NOKEY", rig.Error("sheet.link", LinkArgs(NewUrl, SheetRig.OtherMail)));

        Assert.Equal(new[] { "hello", "hello", "hello" }, rig.Google.Actions);
        Assert.DoesNotContain(SheetRig.Secret, rig.Google.AllBodies, StringComparison.Ordinal);
        var state = rig.Store.Load();
        Assert.Equal(SheetRig.Url, state.Url);
        Assert.Equal(new[] { SheetRig.Mail }, state.ShareWith);
        Assert.True(state.Verified);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link: hello nonce는 무작위 24바이트(base64url 32자)이고 부를 때마다 다르다")]
    public void NonceIsRandom()
    {
        var a = SheetServices.NewNonce();
        var b = SheetServices.NewNonce();
        Assert.Matches("^[A-Za-z0-9_-]{32}$", a);
        Assert.NotEqual(a, b);
    }

    [Fact(DisplayName = "AC-8511.3 hello mac 비교는 HMAC-SHA256(비밀 글자, nonce) base64url(= 없음)과 같은 시간 비교")]
    public void MacCheck()
    {
        var mac = FakeGoogle.Mac(SheetRig.Secret, SheetRig.Nonce);
        Assert.Equal(43, mac.Length);
        Assert.True(SheetHello.Matches(SheetRig.Secret, SheetRig.Nonce, mac));
        Assert.False(SheetHello.Matches(SheetRig.Secret, SheetRig.Nonce, mac.Substring(1)));
        Assert.False(SheetHello.Matches(SheetRig.Secret, SheetRig.Nonce, FakeGoogle.Mac("FAKEotherFAKEother0123", SheetRig.Nonce)));
        Assert.False(SheetHello.Matches(SheetRig.Secret, SheetRig.Nonce, ""));
    }

    [Fact(DisplayName = "AC-8511.3 sheet.link 답·기록에 주소·메일·비밀 글자가 없다")]
    public void LinkReplyHasNoValues()
    {
        using var rig = new SheetRig().Linked(false);
        rig.Send("sheet.link", LinkArgs(NewUrl, SheetRig.OtherMail));
        Assert.DoesNotContain("AKfycb", rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.OtherMail, rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.Secret, rig.RawReplies, StringComparison.Ordinal);
        Assert.Equal(new (string?, string?)[] { ("sheet.link", null) }, rig.Log);
        using var doc = JsonDocument.Parse(rig.RawReplies);
        Assert.Equal("result", doc.RootElement.GetProperty("type").GetString());
    }
}
