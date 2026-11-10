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
            filled[i] = template[i].Replace("{id}", Table.ExtensionId).Replace("{ID}", Table.ExtensionId.ToUpperInvariant());
        }
        return filled;
    }
}
