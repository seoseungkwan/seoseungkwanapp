using System;
using System.IO;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class OriginGuardTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    [Fact(DisplayName = "AC-001.3 첫 인자가 chrome-extension://<EXTENSION_ID>/이면 받는다(윈도우의 --parent-window 인자는 함께 와도 됨)")]
    public void AllowsOurExtension()
    {
        Assert.True(OriginGuard.IsAllowed(new[] { Requests.Allowed(Table) }, Table));
        Assert.True(OriginGuard.IsAllowed(new[] { Requests.Allowed(Table), "--parent-window=1234" }, Table));
    }

    // InlineData(new[] { … })는 xUnit이 문자열 배열을 인자 목록으로 풀어 버려서 TheoryData로 준다
    public static TheoryData<string[]> OtherOrigins => new TheoryData<string[]>
    {
        new string[0],
        new[] { "" },
        new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" },
        new[] { "chrome-extension://{id}" },
        new[] { "chrome-extension://{id}/x" },
        new[] { "chrome-extension://{ID}/" },
        new[] { " chrome-extension://{id}/" },
        new[] { "chrome-extension://{id}/ " },
        new[] { "https://seoseungkwanapp.vercel.app" },
        new[] { "https://seoseungkwanapp.vercel.app/" },
        new[] { "moz-extension://{id}/" },
        new[] { "--parent-window=1234", "chrome-extension://{id}/" },
        new[] { "chrome-extension://*/" },
    };

    public static TheoryData<string[]> SomeOtherOrigins => new TheoryData<string[]>
    {
        new string[0],
        new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" },
        new[] { "https://seoseungkwanapp.vercel.app" },
    };

    [Theory(DisplayName = "AC-001.3 호출 origin이 우리 확장이 아니면 거절한다")]
    [MemberData(nameof(OtherOrigins))]
    public void RejectsOtherOrigins(string[] template)
    {
        Assert.False(OriginGuard.IsAllowed(Fill(template), Table));
    }

    [Theory(DisplayName = "AC-001.3 origin이 틀리면 메시지를 하나도 읽거나 처리하지 않고 끝난다")]
    [MemberData(nameof(SomeOtherOrigins))]
    public void LoopEndsWithoutProcessing(string[] template)
    {
        var input = new MemoryStream(Frames.Frame(Requests.Envelope("hello", "{}")));
        var output = new MemoryStream();
        var handled = 0;
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("hello", (request, sink) => handled++);

        var code = MessageLoop.Run(Fill(template), input, output, Table, dispatcher, null);

        Assert.NotEqual(0, code);
        Assert.Equal(0, input.Position);
        Assert.Equal(0, output.Length);
        Assert.Equal(0, handled);
    }

    private static string[] Fill(string[] template)
    {
        var filled = new string[template.Length];
        for (var i = 0; i < template.Length; i++)
        {
            filled[i] = template[i].Replace("{id}", Table.ExtensionId).Replace("{ID}", Table.ExtensionId.ToUpperInvariant())
                .Replace("{erp}", ErpId).Replace("{ERP}", ErpId.ToUpperInvariant());
        }
        return filled;
    }

    // ---- 새 확장 'ERP 마감일지 채우기'(spec erp-closing-fill, design.md 3-1) ------------------------------

    private static string ErpId => Table.ErpExtensionId ?? throw new InvalidOperationException("명령 표에 erp 구역이 없다");

    private static string ErpOrigin => "chrome-extension://" + ErpId + "/";

    [Fact(DisplayName = "AC-3601.3 CallerOf: 기존 확장 origin이면 Caller.Web, 새 확장 origin이면 Caller.Erp(--parent-window 인자는 함께 와도 됨)")]
    public void CallerOfOurExtensions()
    {
        Assert.Equal(Caller.Web, OriginGuard.CallerOf(new[] { Requests.Allowed(Table) }, Table));
        Assert.Equal(Caller.Web, OriginGuard.CallerOf(new[] { Requests.Allowed(Table), "--parent-window=1234" }, Table));
        Assert.Equal(Caller.Erp, OriginGuard.CallerOf(new[] { ErpOrigin }, Table));
        Assert.Equal(Caller.Erp, OriginGuard.CallerOf(new[] { ErpOrigin, "--parent-window=1234" }, Table));
        Assert.True(OriginGuard.IsAllowed(new[] { ErpOrigin }, Table));
    }

    public static TheoryData<string[]> NotOurOrigins => new TheoryData<string[]>
    {
        new string[0],
        new[] { "" },
        new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" },
        new[] { "chrome-extension://{erp}" },
        new[] { "chrome-extension://{erp}/x" },
        new[] { "chrome-extension://{ERP}/" },
        new[] { " chrome-extension://{erp}/" },
        new[] { "chrome-extension://{erp}/ " },
        new[] { "chrome-extension://{ID}/" },
        new[] { "https://erp.minesolution.com" },
        new[] { "https://erp.minesolution.com/" },
        new[] { "moz-extension://{erp}/" },
        new[] { "--parent-window=1234", "chrome-extension://{erp}/" },
        new[] { "chrome-extension://{id}{erp}/" },
        new[] { "chrome-extension://*/" },
    };

    [Theory(DisplayName = "AC-3601.3 CallerOf: 두 확장의 origin이 아니면 null")]
    [MemberData(nameof(NotOurOrigins))]
    public void CallerOfOthersIsNull(string[] template)
    {
        Assert.Null(OriginGuard.CallerOf(Fill(template), Table));
        Assert.False(OriginGuard.IsAllowed(Fill(template), Table));
    }

    [Fact(DisplayName = "AC-3601.3 CallerOf: args가 null이면 null, 표가 없으면 ArgumentNullException")]
    public void CallerOfNullArgs()
    {
        Assert.Null(OriginGuard.CallerOf(null, Table));
        Assert.Throws<ArgumentNullException>(() => OriginGuard.CallerOf(new[] { ErpOrigin }, null!));
    }

    [Fact(DisplayName = "AC-3601.3 erp 구역이 없는 표면 기존 확장만 Caller.Web이고 그 밖은 null")]
    public void CallerOfWithoutErpSection()
    {
        var table = CommandTable.Parse(System.Text.Encoding.UTF8.GetBytes(@"{
  ""protocol"": 1, ""hostName"": ""com.seoseungkwan.precheck"", ""origin"": ""https://seoseungkwanapp.vercel.app"",
  ""extensionId"": ""abcdefghijklmnopabcdefghijklmnop"", ""extensionKey"": ""AAAA"",
  ""commands"": { ""hello"": { ""patient"": false, ""args"": {} } }
}"));

        Assert.Equal(Caller.Web, OriginGuard.CallerOf(new[] { "chrome-extension://abcdefghijklmnopabcdefghijklmnop/" }, table));
        Assert.Null(OriginGuard.CallerOf(new[] { ErpOrigin }, table));
        Assert.Null(OriginGuard.CallerOf(new[] { "chrome-extension:///" }, table));
    }

    public static TheoryData<string[]> SomeNotOurOrigins => new TheoryData<string[]>
    {
        new[] { "chrome-extension://{ERP}/" },
        new[] { "chrome-extension://{erp}" },
        new[] { "https://erp.minesolution.com/" },
    };

    [Theory(DisplayName = "AC-3601.3 두 확장 origin이 아니면 지금처럼 메시지를 하나도 읽거나 처리하지 않고 끝난다")]
    [MemberData(nameof(SomeNotOurOrigins))]
    public void LoopEndsForOtherOrigins(string[] template)
    {
        var input = new MemoryStream(Frames.Frame(Requests.Envelope("closing.codes", "{}")));
        var output = new MemoryStream();
        var handled = 0;
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("closing.codes", (request, sink) => handled++);
        dispatcher.Register("hello", (request, sink) => handled++);

        var code = MessageLoop.Run(Fill(template), input, output, Table, dispatcher, null);

        Assert.Equal(MessageLoop.ExitRejected, code);
        Assert.Equal(0, input.Position);
        Assert.Equal(0, output.Length);
        Assert.Equal(0, handled);
    }
}
