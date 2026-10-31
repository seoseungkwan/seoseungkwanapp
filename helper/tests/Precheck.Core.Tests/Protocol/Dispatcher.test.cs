using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class DispatcherTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static JsonElement HandleOne(Dispatcher dispatcher, string envelopeJson)
    {
        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(envelopeJson), sink);
        return Assert.Single(sink.Replies);
    }

    private static void AssertError(JsonElement reply, string id, string code)
    {
        Assert.Equal(new[] { "v", "id", "type", "code" }, Json.Keys(reply));
        Assert.Equal(1, reply.GetProperty("v").GetInt32());
        Assert.Equal(id, reply.GetProperty("id").GetString());
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal(code, reply.GetProperty("code").GetString());
    }

    // ---- AC-001.4 hello ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-001.4 hello → result {helperVersion, protocol}")]
    public void HelloReturnsVersionAndProtocol()
    {
        var dispatcher = new Dispatcher(Table);
        Hello.Register(dispatcher, Table);

        var reply = HandleOne(dispatcher, Requests.Envelope("hello", "{}", id: "h-1"));

        Assert.Equal(new[] { "v", "id", "type", "data" }, Json.Keys(reply));
        Assert.Equal("h-1", reply.GetProperty("id").GetString());
        Assert.Equal("result", reply.GetProperty("type").GetString());
        var data = reply.GetProperty("data");
        Assert.Equal(new[] { "helperVersion", "protocol" }, Json.Keys(data));
        Assert.Equal(HelperVersion.Value, data.GetProperty("helperVersion").GetString());
        Assert.Equal(1, data.GetProperty("protocol").GetInt32());
    }

    [Fact(DisplayName = "AC-001.4 helperVersion은 helper/Directory.Build.props의 Version(이 한 곳)이다")]
    public void HelperVersionComesFromBuildProps()
    {
        var props = File.ReadAllText(Repo.PathOf("helper", "Directory.Build.props"));
        var versions = Regex.Matches(props, "<Version>([^<]+)</Version>").Cast<Match>().ToArray();

        var version = Assert.Single(versions).Groups[1].Value.Trim();
        Assert.Matches(@"^\d+\.\d+\.\d+$", version);
        Assert.Equal(version, HelperVersion.Value);
    }

    [Fact(DisplayName = "AC-001.4 hello의 protocol은 commands.json의 protocol(처음 1)이다")]
    public void HelloProtocolComesFromTable()
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(Repo.PathOf("src", "lib", "bridge", "commands.json")));
        var protocol = doc.RootElement.GetProperty("protocol").GetInt32();

        Assert.Equal(1, protocol);
        Assert.Equal(protocol, Table.Protocol);
    }

    // ---- AC-001.2 명령·칸 검사 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-001.2 표에 없는 cmd면 아무 처리기도 부르지 않고 E-HELPER-UNKNOWN-COMMAND")]
    public void UnknownCommandIsRejected()
    {
        var dispatcher = new Dispatcher(Table);
        var handled = 0;
        dispatcher.Register("hello", (request, sink) => handled++);

        AssertError(HandleOne(dispatcher, Requests.Envelope("nope", "{}", id: "u-1")), "u-1", "E-HELPER-UNKNOWN-COMMAND");
        Assert.Equal(0, handled);
    }

    [Fact(DisplayName = "AC-001.2 표에 있지만 처리기가 아직 없으면 E-HELPER-UNKNOWN-COMMAND")]
    public void CommandWithoutHandlerIsUnknown()
    {
        var dispatcher = new Dispatcher(Table);

        AssertError(HandleOne(dispatcher, Requests.Envelope("bit.check", "{}", id: "c-1")), "c-1", "E-HELPER-UNKNOWN-COMMAND");
    }

    [Fact(DisplayName = "AC-001.2 칸이 틀리면 처리기를 부르지 않고 E-HELPER-BAD-MESSAGE")]
    public void BadArgsDoNothing()
    {
        var dispatcher = new Dispatcher(Table);
        var handled = 0;
        dispatcher.Register("claim.month", (request, sink) => handled++);

        AssertError(HandleOne(dispatcher, Requests.Envelope("claim.month", "{\"from\":\"2026-10-01\",\"to\":\"2026-11-30\"}", id: "m-1")),
            "m-1", "E-HELPER-BAD-MESSAGE");
        Assert.Equal(0, handled);
    }

    [Fact(DisplayName = "AC-001.2 바른 요청이면 검사를 마친 Request로 처리기를 한 번 부른다")]
    public void ValidRequestReachesHandler()
    {
        var dispatcher = new Dispatcher(Table);
        Request? seen = null;
        dispatcher.Register("store.save", (request, sink) =>
        {
            seen = request;
            sink.Send(Envelope.Result(request.Id, new { saved = true }));
        });

        var reply = HandleOne(dispatcher, Requests.Envelope("store.save", "{\"payload\":\"{\\\"month\\\":\\\"2026-10\\\"}\"}", id: "s-1"));

        Assert.NotNull(seen);
        Assert.Equal("2026-10", seen!.Args.GetProperty("month").GetString());
        Assert.True(reply.GetProperty("data").GetProperty("saved").GetBoolean());
    }

    [Fact(DisplayName = "AC-001.1 v가 protocol과 다르면 E-HELPER-BAD-MESSAGE")]
    public void WrongVersionIsBadMessage()
    {
        var dispatcher = new Dispatcher(Table);
        Hello.Register(dispatcher, Table);

        AssertError(HandleOne(dispatcher, Requests.Envelope("hello", "{}", id: "v-2", v: 2)), "v-2", "E-HELPER-BAD-MESSAGE");
    }

    [Fact(DisplayName = "AC-001.1 깨진 JSON이면 id 없이(빈 글자) E-HELPER-BAD-MESSAGE로 답한다")]
    public void BrokenJsonIsBadMessage()
    {
        var dispatcher = new Dispatcher(Table);

        AssertError(HandleOne(dispatcher, "{\"v\":1,\"id\":"), "", "E-HELPER-BAD-MESSAGE");
    }

    [Fact(DisplayName = "AC-001.2 처리기가 오류 번호를 던지면 그 번호로 답한다")]
    public void HandlerErrorCodeIsReplied()
    {
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("stats.rows", (request, sink) => throw new HelperException("E-BIT-READ-FAILED"));

        var reply = HandleOne(dispatcher, Requests.Envelope("stats.rows", "{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\"}", id: "r-1"));

        AssertError(reply, "r-1", "E-BIT-READ-FAILED");
    }

    // ---- AC-001.5 환자 자료 명령의 답은 chunk … end (store.save만 result) -----------------------------

    private const string October = "{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\"}";

    private static readonly string BitInputArgs = "{\"payload\":" + JsonSerializer.Serialize(
        "{\"items\":[{\"visitKey\":\"v-1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-01\",\"memo\":\"가짜 메모\"}]}") + "}";

    public static TheoryData<string, string> PatientRequests => new TheoryData<string, string>
    {
        { "claim.month", October },
        { "claim.memos", October },
        { "store.load", "{\"months\":[\"2026-10\"]}" },
        { "bit.input", BitInputArgs },
        { "sam.latest", "{}" },
        { "contact.targets", "{\"kind\":\"followup\",\"from\":\"2026-07-01\",\"to\":\"2026-10-28\"}" },
        { "stats.rows", October },
    };

    [Fact(DisplayName = "AC-001.5 result 막기 시험은 store.save를 뺀 환자 자료 명령을 모두 다룬다")]
    public void PatientRequestsCoverTable()
    {
        var covered = PatientRequests.Select(row => (string)row[0]).OrderBy(n => n, StringComparer.Ordinal);
        var patient = Table.Names.Where(Table.IsPatient).Where(n => n != "store.save").OrderBy(n => n, StringComparer.Ordinal);

        Assert.Equal(patient, covered);
    }

    [Theory(DisplayName = "AC-001.5 환자 자료 명령이 result로 답하려 하면 내보내지 않고 E-BRIDGE-BAD-REPLY로 답한다")]
    [MemberData(nameof(PatientRequests))]
    public void PatientCommandsCannotReplyWithResult(string cmd, string args)
    {
        var dispatcher = new Dispatcher(Table);
        var continued = false;
        dispatcher.Register(cmd, (request, sink) =>
        {
            sink.Send(Envelope.Result(request.Id, new { name = Fake.Name, chart = Fake.Chart }));
            continued = true;
        });

        var reply = HandleOne(dispatcher, Requests.Envelope(cmd, args, id: "pr-1"));

        AssertError(reply, "pr-1", "E-BRIDGE-BAD-REPLY");
        Assert.False(continued);
        Assert.DoesNotContain(Fake.Name, reply.GetRawText());
    }

    [Fact(DisplayName = "AC-001.5 환자 자료 명령도 progress와 chunk … end는 그대로 내보낸다")]
    public void PatientCommandsSendProgressAndChunks()
    {
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("bit.input", (request, sink) =>
        {
            sink.Send(Envelope.Progress(request.Id, 1, 1));
            Chunker.Send(sink, request.Id, "{\"results\":[{\"name\":\"" + Fake.Name + "\"}]}");
        });
        var replies = new ListSink();

        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", BitInputArgs, id: "bi-1")), replies);

        Assert.Equal(new[] { "progress", "chunk", "end" }, replies.Replies.Select(r => r.GetProperty("type").GetString()).ToArray());
    }

    [Fact(DisplayName = "AC-001.5 store.save는 환자 자료 명령이지만 result {saved:true}로 답한다(AC-004.9 예외)")]
    public void StoreSaveMayReplyWithResult()
    {
        Assert.True(Table.IsPatient("store.save"));
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("store.save", (request, sink) => sink.Send(Envelope.Result(request.Id, new { saved = true })));

        var reply = HandleOne(dispatcher, Requests.Envelope("store.save", "{\"payload\":\"{}\"}", id: "ss-1"));

        Assert.Equal("result", reply.GetProperty("type").GetString());
        Assert.True(reply.GetProperty("data").GetProperty("saved").GetBoolean());
    }

    [Fact(DisplayName = "AC-001.5 숫자·상태 명령(claim.dates)은 result로 답한다")]
    public void NonPatientCommandsReplyWithResult()
    {
        var dispatcher = new Dispatcher(Table);
        dispatcher.Register("claim.dates", (request, sink) => sink.Send(Envelope.Result(request.Id, new { days = new object[0] })));

        var reply = HandleOne(dispatcher, Requests.Envelope("claim.dates", October, id: "cd-1"));

        Assert.Equal("result", reply.GetProperty("type").GetString());
    }

    [Fact(DisplayName = "AC-001.2 표에 없는 이름으로는 처리기를 붙일 수 없다")]
    public void RegisterRejectsUnknownName()
    {
        var dispatcher = new Dispatcher(Table);

        Assert.Throws<ArgumentException>(() => dispatcher.Register("nope", (request, sink) => { }));
    }
}
