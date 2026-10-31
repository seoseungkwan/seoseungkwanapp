using System;
using System.IO;

namespace Precheck.Core.Protocol;

/// <summary>답 봉투(UTF-8 JSON 한 메시지)를 받는 곳. 도우미에서는 표준 출력 틀, 시험에서는 목록.</summary>
public interface IReplySink
{
    void Send(byte[] utf8Json);
}

/// <summary>표준 출력에 메시지 틀로만 쓴다(AC-001.6).</summary>
internal sealed class StreamSink : IReplySink
{
    private readonly Stream output;

    public StreamSink(Stream output)
    {
        this.output = output ?? throw new ArgumentNullException(nameof(output));
    }

    public void Send(byte[] utf8Json) => Framing.WriteMessage(output, utf8Json);
}
