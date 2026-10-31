using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Precheck.Core.Protocol;

/// <summary>
/// 환자 자료 답 나누기 (AC-001.5): 다 만든 JSON 글자를 chunk(seq 0부터) … end {count, bytes, sha256}로 보낸다.
/// 크기는 봉투까지 직렬화한 뒤 바이트로 잰다(이스케이프 때문에 글자 수·원래 바이트 수와 다르다).
/// 자르는 자리는 UTF-16 대리쌍 가운데가 아니다(= UTF-8 글자 가운데가 아니다). 작아도 chunk 하나 + end.
/// </summary>
public static class Chunker
{
    /// <summary>나눈 메시지들. 마지막이 end. id·글자를 먼저 검사한다(틀리면 바로 던진다).</summary>
    public static IEnumerable<byte[]> Split(string id, string json)
    {
        Envelope.RequireId(id);
        if (json == null) throw new ArgumentNullException(nameof(json));
        if (!FieldSpec.IsWellFormedUtf16(json)) throw new ArgumentException("짝 없는 대리쌍이 있다", nameof(json));

        var bytes = Encoding.UTF8.GetBytes(json);
        string sha256;
        using (var sha = SHA256.Create())
        {
            sha256 = ToLowerHex(sha.ComputeHash(bytes));
        }
        return Iterate(id, json, bytes.LongLength, sha256);
    }

    /// <summary>나눈 메시지를 sink에 차례로 보낸다.</summary>
    public static void Send(IReplySink sink, string id, string json)
    {
        if (sink == null) throw new ArgumentNullException(nameof(sink));
        foreach (var message in Split(id, json)) sink.Send(message);
    }

    private static IEnumerable<byte[]> Iterate(string id, string json, long byteCount, string sha256)
    {
        var costs = new EscapedCost();
        var pos = 0;
        var seq = 0;
        do
        {
            // 봉투(빈 data)의 바이트 + 글자마다 이스케이프한 바이트 ≤ 한도 - 머리
            var budget = Framing.MaxOutgoing - Framing.HeaderSize - BuildChunk(id, seq, string.Empty).Length;
            var end = pos;
            long used = 0;
            while (end < json.Length)
            {
                var width = char.IsHighSurrogate(json[end]) ? 2 : 1;
                var cost = costs.Of(json, end, width);
                if (used + cost > budget) break;
                used += cost;
                end += width;
            }
            if (end == pos && pos < json.Length) throw new InvalidOperationException("글자 하나도 조각에 들어가지 않는다");

            var message = BuildChunk(id, seq, json.Substring(pos, end - pos));
            // 어림과 실제 직렬화가 다르면(일어나지 않아야 함) 실제 바이트가 한도 안에 들 때까지 줄인다
            while (Framing.HeaderSize + message.Length > Framing.MaxOutgoing)
            {
                end = Shrink(json, pos, end);
                message = BuildChunk(id, seq, json.Substring(pos, end - pos));
            }

            yield return message;
            pos = end;
            seq++;
        }
        while (pos < json.Length);

        yield return BuildEnd(id, seq, byteCount, sha256);
    }

    private static int Shrink(string json, int pos, int end)
    {
        var shorter = pos + Math.Max(1, (end - pos) * 15 / 16);
        if (shorter >= end) shorter = end - 1;
        if (shorter > pos && char.IsLowSurrogate(json[shorter])) shorter--;
        if (shorter <= pos) throw new InvalidOperationException("조각을 더 줄일 수 없다");
        return shorter;
    }

    private static byte[] BuildChunk(string id, int seq, string data) => Envelope.Write(writer =>
    {
        Envelope.WriteHead(writer, id, "chunk");
        writer.WriteNumber("seq", seq);
        writer.WriteString("data", data);
    });

    private static byte[] BuildEnd(string id, int count, long bytes, string sha256) => Envelope.Write(writer =>
    {
        Envelope.WriteHead(writer, id, "end");
        writer.WriteNumber("count", count);
        writer.WriteNumber("bytes", bytes);
        writer.WriteString("sha256", sha256);
    });

    private static string ToLowerHex(byte[] hash)
    {
        var text = new StringBuilder(hash.Length * 2);
        foreach (var b in hash) text.Append(b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
        return text.ToString();
    }

    /// <summary>글자(스칼라) 하나를 답과 같은 인코더로 이스케이프했을 때의 UTF-8 바이트 수. 글자마다 한 번만 잰다.</summary>
    private sealed class EscapedCost
    {
        private readonly int[] ascii = new int[128];
        private readonly Dictionary<int, int> others = new Dictionary<int, int>();

        public int Of(string json, int index, int width)
        {
            int scalar = width == 2 ? char.ConvertToUtf32(json[index], json[index + 1]) : json[index];
            if (scalar < 128)
            {
                var known = ascii[scalar];
                if (known == 0) ascii[scalar] = known = Measure(json.Substring(index, 1));
                return known;
            }
            if (!others.TryGetValue(scalar, out var cost))
            {
                cost = Measure(json.Substring(index, width));
                others[scalar] = cost;
            }
            return cost;
        }

        private static int Measure(string text) =>
            JsonEncodedText.Encode(text, Envelope.WriterOptions.Encoder).EncodedUtf8Bytes.Length;
    }
}
