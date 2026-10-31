using System;
using System.IO;

namespace Precheck.Core.Protocol;

/// <summary>크롬 네이티브 메시징 틀: 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON (design.md 4-1, AC-001.1).</summary>
public static class Framing
{
    /// <summary>크롬 → 도우미 한 메시지의 최대 본문 길이(크롬 규칙 64MiB).</summary>
    public const int MaxIncoming = 64 * 1024 * 1024;

    /// <summary>도우미 → 크롬 한 메시지의 최대 길이. 4바이트 머리를 포함한다(크롬 한도 1MB).</summary>
    public const int MaxOutgoing = 1_000_000;

    public const int HeaderSize = 4;

    /// <summary>
    /// 메시지 하나를 읽는다. null = 표준 입력이 닫힘(메시지 사이에서 끝남).
    /// 길이 0이면 ProtocolException(E-HELPER-BAD-MESSAGE): 머리만 읽었으므로 다음 메시지를 이어서 읽을 수 있다.
    /// 길이가 64MiB를 넘거나 중간에 끊기면 FramingBrokenException: 본문을 읽지 않는다(다음 자리를 알 수 없음).
    /// </summary>
    public static byte[]? ReadMessage(Stream input)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));

        var header = new byte[HeaderSize];
        var got = ReadFully(input, header, HeaderSize);
        if (got == 0) return null;
        if (got < HeaderSize) throw new FramingBrokenException();

        var length = header[0] | ((uint)header[1] << 8) | ((uint)header[2] << 16) | ((uint)header[3] << 24);
        if (length == 0) throw new ProtocolException(ErrorCodes.BadMessage);
        if (length > MaxIncoming) throw new FramingBrokenException();

        var body = new byte[length];
        if (ReadFully(input, body, body.Length) < body.Length) throw new FramingBrokenException();
        return body;
    }

    /// <summary>메시지 하나를 쓴다. 머리 포함 MaxOutgoing을 넘으면 아무것도 쓰지 않고 던진다.</summary>
    public static void WriteMessage(Stream output, byte[] utf8Json)
    {
        if (output == null) throw new ArgumentNullException(nameof(output));
        if (utf8Json == null) throw new ArgumentNullException(nameof(utf8Json));
        if ((long)HeaderSize + utf8Json.Length > MaxOutgoing)
        {
            throw new ArgumentException("메시지가 머리 포함 1,000,000바이트를 넘는다", nameof(utf8Json));
        }

        // 머리와 본문을 한 번에 쓴다(반쪽 틀이 나가지 않게)
        var frame = new byte[HeaderSize + utf8Json.Length];
        var length = (uint)utf8Json.Length;
        frame[0] = (byte)(length & 0xFF);
        frame[1] = (byte)((length >> 8) & 0xFF);
        frame[2] = (byte)((length >> 16) & 0xFF);
        frame[3] = (byte)((length >> 24) & 0xFF);
        Buffer.BlockCopy(utf8Json, 0, frame, HeaderSize, utf8Json.Length);
        output.Write(frame, 0, frame.Length);
        output.Flush();
    }

    private static int ReadFully(Stream input, byte[] buffer, int count)
    {
        var total = 0;
        while (total < count)
        {
            var read = input.Read(buffer, total, count - total);
            if (read <= 0) break;
            total += read;
        }
        return total;
    }
}
