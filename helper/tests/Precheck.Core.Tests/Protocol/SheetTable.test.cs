using System;
using System.Linq;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

/// <summary>
/// 명령 표의 수납 명령 여덟(spec google-link TASK-10, AC-8511.1, design.md 9-2): 도우미가 실은 commands.json을 읽어
/// 칸 모양을 처리기에 닿기 전에 거른다(주소·메일 칸은 sheet.link만, settings는 JSON 객체 16KB까지, months 1~13개, mode 둘).
/// </summary>
public class SheetTableTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static string? Problem(string cmd, string argsJson)
    {
        var sink = new ListSink();
        var dispatcher = new Dispatcher(Table);
        foreach (var name in Table.Names) dispatcher.Register(name, (request, s) => s.Send(Envelope.Result(request.Id, new { v = 1 })));
        dispatcher.Handle(System.Text.Encoding.UTF8.GetBytes(Requests.Envelope(cmd, argsJson)), sink);
        var reply = Assert.Single(sink.Replies);
        return reply.GetProperty("type").GetString() == "error" ? reply.GetProperty("code").GetString() : null;
    }

    [Fact(DisplayName = "AC-8511.1 sheet.*는 모두 patient:false·send 아님, confirm은 sheet.link만")]
    public void Flags()
    {
        var sheets = Table.Names.Where(n => n.StartsWith("sheet.", StringComparison.Ordinal)).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "sheet.catalog", "sheet.code", "sheet.fill", "sheet.import", "sheet.link", "sheet.months", "sheet.ping", "sheet.status" }, sheets);
        foreach (var name in sheets)
        {
            Assert.False(Table.IsPatient(name), name);
            Assert.False(Table.IsSend(name), name);
            Assert.Equal(name == "sheet.link", Table.NeedsConfirm(name));
        }
    }

    [Fact(DisplayName = "AC-8511.1 칸 거르기: 모르는 칸·url은 sheet.link 밖에서 거절, settings는 객체만, months 1~13개 YYYY-MM, mode는 fillEmpty·overwrite, auto는 참거짓")]
    public void ArgsAreChecked()
    {
        const string Settings = "{\"templateUrl\":\"x\"}";
        Assert.Null(Problem("sheet.status", "{}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.status", "{\"url\":\"x\"}"));
        Assert.Null(Problem("sheet.code", "{}"));
        Assert.Null(Problem("sheet.import", "{}"));
        Assert.Null(Problem("sheet.link", "{\"url\":\"https://script.google.com/macros/s/AKfycbFAKE0123456789/exec\",\"shareWith\":[\"desk@fake.test\"]}"));
        Assert.Null(Problem("sheet.link", "{\"url\":\"https://script.google.com/macros/s/AKfycbFAKE0123456789/exec\",\"shareWith\":[]}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.link", "{\"url\":\"" + new string('a', 601) + "\",\"shareWith\":[]}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.link", "{\"url\":\"x\",\"shareWith\":[\"desk@fake.test\"],\"token\":\"y\"}"));
        Assert.Null(Problem("sheet.ping", "{\"settings\":" + Settings + "}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.ping", "{\"settings\":[]}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.ping", "{\"settings\":" + Settings + ",\"url\":\"x\"}"));
        Assert.Null(Problem("sheet.catalog", "{}"));
        Assert.Null(Problem("sheet.catalog", "{\"hospital\":\"SYNTHETIC\"}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.catalog", "{\"hospital\":\"\"}"));
        Assert.Null(Problem("sheet.months", "{\"settings\":" + Settings + ",\"months\":[\"2026-10\"]}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.months", "{\"settings\":" + Settings + ",\"months\":[\"2026-13\"]}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.months", "{\"settings\":" + Settings + ",\"months\":[]}"));
        Assert.Null(Problem("sheet.fill", "{\"day\":\"2026-10-30\",\"mode\":\"fillEmpty\",\"auto\":true,\"settings\":" + Settings + "}"));
        Assert.Null(Problem("sheet.fill", "{\"day\":\"2026-10-30\",\"mode\":\"overwrite\",\"auto\":false,\"settings\":" + Settings + "}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.fill", "{\"day\":\"2026-10-30\",\"mode\":\"replace\",\"auto\":false,\"settings\":" + Settings + "}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.fill", "{\"day\":\"2026-10-30\",\"mode\":\"fillEmpty\",\"auto\":\"yes\",\"settings\":" + Settings + "}"));
        Assert.Equal(ErrorCodes.BadMessage, Problem("sheet.fill", "{\"day\":\"2026-10-30\",\"mode\":\"fillEmpty\",\"auto\":false,\"settings\":" + Settings + ",\"scriptUrl\":\"x\"}"));
    }
}
