using System;
using System.IO;
using System.Text;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class FramingTests
{
    [Fact(DisplayName = "AC-001.1 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON을 읽는다")]
    public void ReadsLengthPrefixedMessage()
    {
        var first = Encoding.UTF8.GetBytes("{\"a\":\"가😀\"}");
        var second = Encoding.UTF8.GetBytes("{}");
        var input = new MemoryStream(Frames.Concat(Frames.Frame(first), Frames.Frame(second)));

        Assert.Equal(first, Framing.ReadMessage(input));
        Assert.Equal(second, Framing.ReadMessage(input));
        Assert.Null(Framing.ReadMessage(input));
    }

    [Fact(DisplayName = "AC-001.1 길이 머리는 리틀 엔디언이다(300바이트 = 2C 01 00 00)")]
    public void LengthIsLittleEndian()
    {
        var body = Encoding.UTF8.GetBytes("\"" + new string('a', 298) + "\"");
        var input = new MemoryStream(Frames.Concat(new byte[] { 0x2C, 0x01, 0x00, 0x00 }, body));

        Assert.Equal(body, Framing.ReadMessage(input));
    }

    [Fact(DisplayName = "AC-001.1 표준 입력이 조금씩 와도 한 메시지로 모은다")]
    public void ReadsTrickledInput()
    {
        var body = Encoding.UTF8.GetBytes("{\"v\":1,\"id\":\"a\",\"cmd\":\"hello\",\"args\":{}}");
        var input = new TrickleStream(Frames.Frame(body));

        Assert.Equal(body, Framing.ReadMessage(input));
        Assert.Null(Framing.ReadMessage(input));
    }

    [Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE, 그 뒤 다음 메시지를 읽는다")]
    public void ZeroLengthIsBadMessageThenContinues()
    {
        var next = Encoding.UTF8.GetBytes("{}");
        var input = new MemoryStream(Frames.Concat(Frames.Header(0), Frames.Frame(next)));

        var error = Assert.Throws<ProtocolException>(() => Framing.ReadMessage(input));
        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
        Assert.Equal(next, Framing.ReadMessage(input));
    }

    [Fact(DisplayName = "AC-001.1 받는 한도는 64MiB, 보내는 한도는 머리 포함 1,000,000바이트")]
    public void Limits()
    {
        Assert.Equal(64 * 1024 * 1024, Framing.MaxIncoming);
        Assert.Equal(1_000_000, Framing.MaxOutgoing);
    }

    [Theory(DisplayName = "AC-001.1 길이가 64MiB를 넘으면 본문을 읽지 않고 틀이 깨졌다고 알린다")]
    [InlineData(64u * 1024 * 1024 + 1)]
    [InlineData(uint.MaxValue)]
    [InlineData(0x80000000u)]
    public void OversizedLengthBreaksFramingWithoutReadingBody(uint length)
    {
        var input = new MemoryStream(Frames.Concat(Frames.Header(length), new byte[64], Frames.Frame("{}")));

        Assert.Throws<FramingBrokenException>(() => Framing.ReadMessage(input));
        Assert.Equal(4, input.Position);
    }

    [Fact(DisplayName = "AC-001.1 표준 입력이 닫히면 null(끝)")]
    public void ClosedInputReturnsNull()
    {
        Assert.Null(Framing.ReadMessage(new MemoryStream(new byte[0])));
    }

    [Theory(DisplayName = "AC-001.1 머리나 본문 중간에서 입력이 끝나면 틀이 깨진 것")]
    [InlineData(new byte[] { 0x05 })]
    [InlineData(new byte[] { 0x05, 0x00, 0x00 })]
    [InlineData(new byte[] { 0x05, 0x00, 0x00, 0x00, (byte)'{' })]
    public void TruncatedInputBreaksFraming(byte[] data)
    {
        Assert.Throws<FramingBrokenException>(() => Framing.ReadMessage(new MemoryStream(data)));
    }

    [Fact(DisplayName = "AC-001.1 쓰기: 4바이트 리틀 엔디언 길이 + 본문")]
    public void WritesLengthPrefixedMessage()
    {
        var body = Encoding.UTF8.GetBytes("{\"a\":\"가\"}");
        var output = new MemoryStream();

        Framing.WriteMessage(output, body);

        var written = output.ToArray();
        Assert.Equal(Frames.Frame(body), written);
        Assert.Equal((byte)body.Length, written[0]);
        Assert.Equal(0, written[1]);
    }

    [Fact(DisplayName = "AC-001.5 쓰기: 머리 포함 1,000,000바이트까지 쓰고, 넘으면 던지고 아무것도 쓰지 않는다")]
    public void WriteRejectsOversizedMessage()
    {
        var output = new MemoryStream();
        Framing.WriteMessage(output, new byte[1_000_000 - 4]);
        Assert.Equal(1_000_000, output.Length);

        var refused = new MemoryStream();
        Assert.Throws<ArgumentException>(() => Framing.WriteMessage(refused, new byte[1_000_000 - 3]));
        Assert.Equal(0, refused.Length);
    }
}
