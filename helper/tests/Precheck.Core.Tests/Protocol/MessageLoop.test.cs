using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class MessageLoopTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private sealed class Outcome
    {
        public int Code { get; set; }
        public List<JsonElement> Replies { get; set; } = new List<JsonElement>();
        public List<string> Log { get; } = new List<string>();
        public long InputPosition { get; set; }
        public byte[] Output { get; set; } = new byte[0];
    }

    private static Outcome Run(Action<Dispatcher>? register, params byte[][] frames)
    {
        var outcome = new Outcome();
        var input = new MemoryStream(Frames.Concat(frames));
        var output = new MemoryStream();
        var at = new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.FromHours(9));
        Action<string?, string?> log = (cmd, code) => outcome.Log.Add(LogLine.Format(at, cmd, code));
        var dispatcher = new Dispatcher(Table, log);
        Precheck.Core.Protocol.Hello.Register(dispatcher, Table);
        register?.Invoke(dispatcher);

        outcome.Code = MessageLoop.Run(new[] { Requests.Allowed(Table), "--parent-window=0" }, input, output, Table, dispatcher, log);

        outcome.InputPosition = input.Position;
        outcome.Output = output.ToArray();
        outcome.Replies = Frames.ReadAll(outcome.Output).Select(Json.Parse).ToList();
        return outcome;
    }

    private static string Type(JsonElement reply) => reply.GetProperty("type").GetString()!;

    private static string Code(JsonElement reply) => reply.GetProperty("code").GetString()!;

    private static byte[] HelloFrame(string id = "h-1") => Frames.Frame(Requests.Envelope("hello", "{}", id));

    // ---- AC-001.1 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-001.1 길이 0 메시지에 E-HELPER-BAD-MESSAGE로 답하고 다음 메시지를 처리한다")]
    public void ZeroLengthThenContinues()
    {
        var outcome = Run(null, Frames.Header(0), HelloFrame());

        Assert.Equal(0, outcome.Code);
        Assert.Equal(2, outcome.Replies.Count);
        Assert.Equal("error", Type(outcome.Replies[0]));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[0]));
        Assert.Equal("", outcome.Replies[0].GetProperty("id").GetString());
        Assert.Equal("result", Type(outcome.Replies[1]));
    }

    [Theory(DisplayName = "AC-001.1 JSON·봉투가 틀린 메시지에 E-HELPER-BAD-MESSAGE로 답하고 끝나지 않는다")]
    [InlineData("not json")]
    [InlineData("{\"v\":1,\"id\":\"x\",\"cmd\":\"hello\"}")]
    [InlineData("{\"v\":1,\"id\":\"x\",\"cmd\":\"hello\",\"args\":{},\"more\":0}")]
    [InlineData("[1,2,3]")]
    public void BadMessagesThenContinue(string json)
    {
        var outcome = Run(null, Frames.Frame(json), HelloFrame("h-2"));

        Assert.Equal(0, outcome.Code);
        Assert.Equal(2, outcome.Replies.Count);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[0]));
        Assert.Equal("h-2", outcome.Replies[1].GetProperty("id").GetString());
    }

    public static TheoryData<string> LoneSurrogateMessages => new TheoryData<string>
    {
        "{\"v\":1,\"id\":\"\\uD800\",\"cmd\":\"hello\",\"args\":{}}",
        "{\"v\":1,\"id\":\"ls-2\",\"cmd\":\"\\uDE00\",\"args\":{}}",
        Requests.Envelope("bit.input", "{\"payload\":" + JsonSerializer.Serialize(
            "{\"items\":[{\"visitKey\":\"v-1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-01\",\"memo\":\"메모\\ud83d\"}]}") + "}", "ls-3"),
        Requests.Envelope("hello", "{\"\\ud83d\":1}", "ls-4"),
    };

    [Theory(DisplayName = "AC-001.1 짝 없는 대리쌍 이스케이프가 든 메시지에 E-HELPER-BAD-MESSAGE로 답하고 끝나지 않는다(다음 hello에 답함)")]
    [MemberData(nameof(LoneSurrogateMessages))]
    public void LoneSurrogatesDoNotEndLoop(string json)
    {
        var outcome = Run(null, Frames.Frame(json), HelloFrame("after"));

        Assert.Equal(0, outcome.Code);
        Assert.Equal(2, outcome.Replies.Count);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[0]));
        Assert.Equal("result", Type(outcome.Replies[1]));
        Assert.Equal("after", outcome.Replies[1].GetProperty("id").GetString());
    }

    [Fact(DisplayName = "AC-001.1 길이가 64MiB를 넘으면 본문을 읽지 않고 답 없이 바로 끝난다")]
    public void OversizedLengthEndsImmediately()
    {
        var outcome = Run(null, Frames.Header(64u * 1024 * 1024 + 1), new byte[100], HelloFrame());

        Assert.NotEqual(0, outcome.Code);
        Assert.Empty(outcome.Replies);
        Assert.Equal(4, outcome.InputPosition);
    }

    [Fact(DisplayName = "AC-001.1 표준 입력이 닫히면 끝난다")]
    public void ClosedInputEnds()
    {
        var outcome = Run(null);

        Assert.Equal(0, outcome.Code);
        Assert.Empty(outcome.Replies);
    }

    [Fact(DisplayName = "AC-001.1 메시지를 차례로 처리하고 입력이 끝나면 끝난다")]
    public void ProcessesInOrder()
    {
        var outcome = Run(null, HelloFrame("a"), HelloFrame("b"), HelloFrame("c"));

        Assert.Equal(0, outcome.Code);
        Assert.Equal(new[] { "a", "b", "c" }, outcome.Replies.Select(r => r.GetProperty("id").GetString()).ToArray());
    }

    // ---- AC-001.6 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-001.6 표준 출력에는 메시지 틀만, 진단 기록에는 시각·명령 이름·오류 번호만(가짜 환자 글자 없음)")]
    public void OutputIsFramesOnlyAndLogHasNoPatientText()
    {
        var patientJson = "{\"rows\":[{\"name\":\"" + Fake.Name + "\",\"chart\":\"" + Fake.Chart + "\",\"phone\":\"" + Fake.Phone + "\"}]}";
        var payload = JsonSerializer.Serialize("{\"items\":[{\"visitKey\":\"v-1\",\"chart\":\"" + Fake.Chart + "\",\"name\":\"" + Fake.Name
            + "\",\"date\":\"2026-10-01\",\"memo\":\"" + Fake.Name + " 메모\"}]}");

        var outcome = Run(
            dispatcher =>
            {
                dispatcher.Register("claim.month", (request, sink) => Chunker.Send(sink, request.Id, patientJson));
                dispatcher.Register("stats.rows", (request, sink) => throw new HelperException("E-BIT-READ-FAILED"));
                dispatcher.Register("contact.targets", (request, sink) =>
                    throw new InvalidOperationException(Fake.Name + " " + Fake.Chart + " " + Fake.Phone));
            },
            Frames.Frame(Requests.Envelope(Fake.Name, "{}", "p-1")),
            Frames.Frame(Requests.Envelope("hello", "{\"name\":\"" + Fake.Name + "\",\"chart\":\"" + Fake.Chart + "\"}", "p-2")),
            Frames.Frame("{\"v\":1,\"id\":\"p-3\",\"cmd\":\"hello\",\"args\":{\"name\":\"" + Fake.Name + "\""),
            Frames.Frame(Requests.Envelope("hello", "{}", Fake.Name + "-" + Fake.Chart)),
            Frames.Frame(Requests.Envelope("bit.input", "{\"payload\":" + payload + "}", "p-5")),
            Frames.Frame(Requests.Envelope("claim.month", "{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\"}", "p-6")),
            Frames.Frame(Requests.Envelope("stats.rows", "{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\"}", "p-7")),
            Frames.Frame(Requests.Envelope("contact.targets", "{\"kind\":\"followup\",\"from\":\"2026-07-01\",\"to\":\"2026-10-28\"}", "p-8")),
            HelloFrame("after-crash"));

        // 출력은 모두 메시지 틀이다(Frames.ReadAll이 틀 밖 바이트에서 던진다)
        var types = outcome.Replies.Select(Type).ToArray();
        Assert.Equal(new[] { "error", "error", "error", "error", "error", "chunk", "end", "error" }, types);
        Assert.Equal("E-HELPER-UNKNOWN-COMMAND", Code(outcome.Replies[0]));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[1]));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[2]));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(outcome.Replies[3]));
        Assert.Equal("", outcome.Replies[3].GetProperty("id").GetString());
        Assert.Equal("E-HELPER-UNKNOWN-COMMAND", Code(outcome.Replies[4]));
        Assert.Equal("E-BIT-READ-FAILED", Code(outcome.Replies[7]));

        // 뜻밖의 예외(처리기 버그)면 그 자리에서 끝난다: 그 뒤 메시지는 처리하지 않는다
        Assert.NotEqual(0, outcome.Code);

        // 환자 글자는 chunk 조각 안에만 있고, 다른 답·기록에는 없다
        var nonChunk = outcome.Replies.Where(r => Type(r) != "chunk").Select(r => r.GetRawText()).ToArray();
        foreach (var secret in new[] { Fake.Name, Fake.Chart, Fake.Phone })
        {
            Assert.DoesNotContain(nonChunk, text => text.IndexOf(secret, StringComparison.Ordinal) >= 0);
            Assert.DoesNotContain(outcome.Log, line => line.IndexOf(secret, StringComparison.Ordinal) >= 0);
        }

        Assert.NotEmpty(outcome.Log);
        foreach (var line in outcome.Log)
        {
            Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} ([a-z]+(\.[a-z]+)?|-) (E-[A-Z0-9]+(-[A-Z0-9]+)*|-)$", line);
        }
        Assert.Contains(outcome.Log, line => line.EndsWith(" unknown E-HELPER-UNKNOWN-COMMAND", StringComparison.Ordinal));
        Assert.Contains(outcome.Log, line => line.EndsWith(" claim.month -", StringComparison.Ordinal));
        Assert.Contains(outcome.Log, line => line.EndsWith(" stats.rows E-BIT-READ-FAILED", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-001.6 도우미 코드는 Console로 글을 쓰지 않고, 예외 내용을 기록하지 않는다")]
    public void HelperSourcesDoNotWriteToConsoleOrLogExceptionText()
    {
        var folders = new[]
        {
            Repo.PathOf("helper", "src", "Precheck.Helper"),
            Repo.PathOf("helper", "src", "Precheck.Core", "Protocol"),
        };
        var files = folders.SelectMany(dir => Directory.GetFiles(dir, "*.cs", SearchOption.AllDirectories))
            .Where(path => path.IndexOf(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar, StringComparison.Ordinal) < 0
                        && path.IndexOf(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar, StringComparison.Ordinal) < 0)
            .ToArray();
        Assert.Contains(files, path => path.EndsWith("Program.cs", StringComparison.Ordinal));
        Assert.Contains(files, path => path.EndsWith("DiagnosticLog.cs", StringComparison.Ordinal));

        foreach (var path in files)
        {
            var source = File.ReadAllText(path);
            Assert.DoesNotMatch(@"Console\s*\.\s*(Write|WriteLine|Out|Error)\b", source);
            Assert.DoesNotMatch(@"\.(Message|StackTrace)\b", source);
            Assert.DoesNotMatch(@"\b(Trace|Debug)\s*\.\s*Write", source);
        }
    }
}
