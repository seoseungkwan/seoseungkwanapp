using System;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class EnvelopeTests
{
    [Fact(DisplayName = "AC-001.1 봉투 {v, id, cmd, args}로 푼다")]
    public void ParsesEnvelope()
    {
        var request = Envelope.Parse(Encoding.UTF8.GetBytes(
            "{\"v\":1,\"id\":\"3f2b8c1e-7d4a-4b9e-a1c2-0d9e8f7a6b5c\",\"cmd\":\"claim.month\",\"args\":{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\"}}"));

        Assert.Equal(1, request.V);
        Assert.Equal("3f2b8c1e-7d4a-4b9e-a1c2-0d9e8f7a6b5c", request.Id);
        Assert.Equal("claim.month", request.Cmd);
        Assert.Equal(JsonValueKind.Object, request.Args.ValueKind);
        Assert.Equal("2026-10-01", request.Args.GetProperty("from").GetString());
    }

    [Fact(DisplayName = "AC-001.1 푼 args는 원래 바이트 배열과 상관없이 남는다")]
    public void ArgsOutliveInputBuffer()
    {
        var bytes = Encoding.UTF8.GetBytes("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{\"k\":\"v\"}}");
        var request = Envelope.Parse(bytes);
        Array.Clear(bytes, 0, bytes.Length);

        Assert.Equal("v", request.Args.GetProperty("k").GetString());
    }

    [Theory(DisplayName = "AC-001.1 JSON·봉투 모양이 틀리면 E-HELPER-BAD-MESSAGE")]
    [InlineData("not json")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}")]
    [InlineData("[]")]
    [InlineData("\"hello\"")]
    [InlineData("null")]
    [InlineData("{\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\"}")]
    [InlineData("{\"v\":\"1\",\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1.5,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":7,\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"a b\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"cmd\":\"hello\",\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":null,\"args\":{}}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":[]}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":\"{}\"}")]
    [InlineData("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{},\"extra\":1}")]
    [InlineData("{\"v\":1,\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}}")]
    public void RejectsBadEnvelope(string json)
    {
        var error = Assert.Throws<ProtocolException>(() => Envelope.Parse(Encoding.UTF8.GetBytes(json)));
        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
    }

    [Fact(DisplayName = "AC-001.1 UTF-8이 아닌 바이트면 E-HELPER-BAD-MESSAGE")]
    public void RejectsInvalidUtf8()
    {
        var bytes = Frames.Concat(Encoding.UTF8.GetBytes("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{\"x\":\""),
            new byte[] { 0xC3, 0x28 }, Encoding.UTF8.GetBytes("\"}}"));

        var error = Assert.Throws<ProtocolException>(() => Envelope.Parse(bytes));
        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
    }

    // JSON 문법으로는 맞지만 글자로 풀 수 없는 짝 없는 대리쌍(\uD800 등). JS JSON.stringify가 이모지 중간에서
    // 잘린 글을 이렇게 내보낸다. 풀다가 멈추지 말고 E-HELPER-BAD-MESSAGE로 막아야 한다
    [Theory(DisplayName = "AC-001.1 id·cmd·열쇠에 짝 없는 대리쌍 이스케이프가 있으면 E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"v\":1,\"id\":\"\\uD800\",\"cmd\":\"hello\",\"args\":{}}", null)]
    [InlineData("{\"v\":1,\"id\":\"ls-1\\uDE00\",\"cmd\":\"hello\",\"args\":{}}", null)]
    [InlineData("{\"v\":1,\"id\":\"ls-2\",\"cmd\":\"\\uDE00\",\"args\":{}}", "ls-2")]
    [InlineData("{\"v\":1,\"id\":\"ls-3\",\"cmd\":\"hello\\ud83d\",\"args\":{}}", "ls-3")]
    [InlineData("{\"v\":1,\"id\":\"ls-4\",\"cmd\":\"hello\",\"\\ud83d\":1,\"args\":{}}", null)]
    public void RejectsLoneSurrogateEscapes(string json, string? id)
    {
        var error = Assert.Throws<ProtocolException>(() => Envelope.Parse(Encoding.UTF8.GetBytes(json)));

        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
        Assert.Equal(id, error.RequestId);
    }

    [Fact(DisplayName = "AC-001.1 봉투가 틀려도 id가 바르면 오류 답에 그 id를 싣는다")]
    public void BadEnvelopeKeepsValidId()
    {
        var error = Assert.Throws<ProtocolException>(() =>
            Envelope.Parse(Encoding.UTF8.GetBytes("{\"v\":1,\"id\":\"req-9\",\"cmd\":\"hello\"}")));

        Assert.Equal("req-9", error.RequestId);
    }

    [Fact(DisplayName = "AC-001.4 result 봉투는 {v:1, id, type:'result', data}")]
    public void BuildsResult()
    {
        var reply = Json.Parse(Envelope.Result("req-1", new { saved = true }));

        Assert.Equal(new[] { "v", "id", "type", "data" }, Json.Keys(reply));
        Assert.Equal(1, reply.GetProperty("v").GetInt32());
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        Assert.Equal("result", reply.GetProperty("type").GetString());
        Assert.True(reply.GetProperty("data").GetProperty("saved").GetBoolean());
    }

    [Fact(DisplayName = "AC-001.2 error 봉투는 {v:1, id, type:'error', code}")]
    public void BuildsError()
    {
        var reply = Json.Parse(Envelope.Error("req-1", "E-HELPER-UNKNOWN-COMMAND"));

        Assert.Equal(new[] { "v", "id", "type", "code" }, Json.Keys(reply));
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal("E-HELPER-UNKNOWN-COMMAND", reply.GetProperty("code").GetString());
    }

    [Theory(DisplayName = "AC-001.6 오류 번호는 'E-…' 모양만 싣는다(다른 글자를 답에 넣지 않음)")]
    [InlineData("")]
    [InlineData("oops")]
    [InlineData("E-")]
    [InlineData("E-bad-lower")]
    [InlineData("E-HELPER 가상환자01")]
    public void ErrorRejectsNonCode(string code)
    {
        Assert.Throws<ArgumentException>(() => Envelope.Error("req-1", code));
    }

    [Fact(DisplayName = "AC-001.1 progress 봉투는 {v:1, id, type:'progress', done, total}")]
    public void BuildsProgress()
    {
        var reply = Json.Parse(Envelope.Progress("req-1", 3, 10));

        Assert.Equal(new[] { "v", "id", "type", "done", "total" }, Json.Keys(reply));
        Assert.Equal(3, reply.GetProperty("done").GetInt32());
        Assert.Equal(10, reply.GetProperty("total").GetInt32());
    }

    [Theory(DisplayName = "AC-001.1 progress 숫자는 0 ≤ done ≤ total ≤ 500")]
    [InlineData(-1, 10)]
    [InlineData(11, 10)]
    [InlineData(0, 501)]
    public void ProgressRejectsOutOfRange(int done, int total)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Envelope.Progress("req-1", done, total));
    }

    [Fact(DisplayName = "AC-001.6 오류 예외의 메시지에는 오류 번호만 들어간다")]
    public void ExceptionMessageIsCodeOnly()
    {
        var error = new ProtocolException("E-HELPER-BAD-MESSAGE", "req-1");

        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Message);
        Assert.Equal("E-BIT-READ-FAILED", new HelperException("E-BIT-READ-FAILED").Message);
    }
}
