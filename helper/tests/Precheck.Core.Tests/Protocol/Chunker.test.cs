using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class ChunkerTests
{
    private const int Limit = 1_000_000;

    private static string Sha256Hex(byte[] bytes)
    {
        using var sha = SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }

    private sealed class SplitResult
    {
        public List<byte[]> Raw { get; } = new List<byte[]>();
        public List<string> Data { get; } = new List<string>();
        public JsonElement End { get; set; }
    }

    /// <summary>나눈 메시지를 모두 검사하고(모양·크기·순서·UTF-8) 조각 글자와 end를 돌려준다.</summary>
    private static SplitResult SplitAndCheck(string id, string json)
    {
        var result = new SplitResult();
        var messages = Chunker.Split(id, json).ToList();
        Assert.True(messages.Count >= 2, "chunk 하나 이상 + end");

        for (var i = 0; i < messages.Count; i++)
        {
            var raw = messages[i];
            Assert.True(4 + raw.Length <= Limit, "메시지 " + i + "가 머리 포함 " + (4 + raw.Length) + "바이트");
            var reply = Json.Parse(raw);
            Assert.Equal(1, reply.GetProperty("v").GetInt32());
            Assert.Equal(id, reply.GetProperty("id").GetString());

            if (i < messages.Count - 1)
            {
                Assert.Equal(new[] { "v", "id", "type", "seq", "data" }, Json.Keys(reply));
                Assert.Equal("chunk", reply.GetProperty("type").GetString());
                Assert.Equal(i, reply.GetProperty("seq").GetInt32());
                result.Raw.Add(raw);
                result.Data.Add(reply.GetProperty("data").GetString()!);
            }
            else
            {
                Assert.Equal(new[] { "v", "id", "type", "count", "bytes", "sha256" }, Json.Keys(reply));
                Assert.Equal("end", reply.GetProperty("type").GetString());
                result.End = reply;
            }
        }
        return result;
    }

    private static void AssertReassembles(string json, SplitResult result)
    {
        var joined = string.Concat(result.Data);
        var original = Encoding.UTF8.GetBytes(json);

        Assert.True(json == joined, "이은 글자가 원래 글자와 다르다");
        Assert.Equal(original, Encoding.UTF8.GetBytes(joined));
        Assert.Equal(result.Data.Count, result.End.GetProperty("count").GetInt32());
        Assert.Equal(original.LongLength, result.End.GetProperty("bytes").GetInt64());
        var sha = result.End.GetProperty("sha256").GetString()!;
        Assert.Matches("^[0-9a-f]{64}$", sha);
        Assert.Equal(Sha256Hex(original), sha);
    }

    [Fact(DisplayName = "AC-001.5 작은 답도 chunk(seq 0) 하나 + end {count, bytes, sha256}")]
    public void SmallReplyIsOneChunkAndEnd()
    {
        var json = "{\"rows\":[{\"name\":\"" + Fake.Name + "\",\"chart\":\"" + Fake.Chart + "\"}]}";

        var result = SplitAndCheck("c-1", json);

        Assert.Single(result.Data);
        AssertReassembles(json, result);
    }

    [Fact(DisplayName = "AC-001.5 빈 글도 chunk 하나(data '') + end(count 1, bytes 0, 빈 글의 SHA-256)")]
    public void EmptyReply()
    {
        var result = SplitAndCheck("c-0", "");

        Assert.Equal(new[] { "" }, result.Data);
        Assert.Equal(0, result.End.GetProperty("bytes").GetInt64());
        Assert.Equal("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", result.End.GetProperty("sha256").GetString());
        AssertReassembles("", result);
    }

    [Fact(DisplayName = "AC-001.5 3MB 영문 글: 메시지마다 머리 포함 1,000,000바이트 이하, 이으면 같음")]
    public void ThreeMegabyteAscii()
    {
        var json = "{\"memo\":\"" + new string('a', 3_000_000) + "\"}";

        var result = SplitAndCheck("c-2", json);

        Assert.True(result.Data.Count >= 4, "3MB는 1MB 조각 넷 이상");
        AssertReassembles(json, result);
    }

    [Fact(DisplayName = "AC-001.5 마지막이 아닌 조각은 한도 가까이 채운다(이스케이프한 뒤 바이트로 잰다)")]
    public void ChunksAreFilledCloseToLimit()
    {
        var json = string.Concat(Enumerable.Repeat("가😀\"\\\n\u0001<a", 400_000));

        var result = SplitAndCheck("c-3", json);

        foreach (var raw in result.Raw.Take(result.Raw.Count - 1))
        {
            Assert.InRange(4 + raw.Length, Limit - 16, Limit);
        }
        AssertReassembles(json, result);
    }

    [Fact(DisplayName = "AC-001.5 한글·이모지·따옴표·역슬래시가 조각 경계에 와도 이으면 원래 글자·바이트와 같다")]
    public void BoundariesOnEscapedAndMultibyteCharacters()
    {
        var unit = "한😀\"\\";
        var cutAt = new HashSet<string>();

        // 앞에 1바이트 글자를 하나씩 더 붙여 자르는 자리를 한 바이트씩 민다.
        // 32번 밀면 이스케이프한 한 묶음(unit) 길이보다 많이 밀어서 묶음 안 모든 자리가 경계에 한 번은 온다
        for (var shift = 0; shift < 32; shift++)
        {
            var json = new string('x', shift) + string.Concat(Enumerable.Repeat(unit, 120_000)) + "끝";
            var result = SplitAndCheck("b-" + shift, json);
            AssertReassembles(json, result);

            for (var i = 0; i < result.Data.Count; i++)
            {
                var data = result.Data[i];
                Assert.NotEqual(string.Empty, data);
                Assert.False(char.IsLowSurrogate(data[0]), "조각이 대리쌍 뒷 반쪽으로 시작");
                Assert.False(char.IsHighSurrogate(data[data.Length - 1]), "조각이 대리쌍 앞 반쪽으로 끝남");
                if (i > 0) cutAt.Add(char.IsHighSurrogate(data[0]) ? data.Substring(0, 2) : data.Substring(0, 1));
            }
        }

        Assert.Contains("한", cutAt);
        Assert.Contains("😀", cutAt);
        Assert.Contains("\"", cutAt);
        Assert.Contains("\\", cutAt);
    }

    [Fact(DisplayName = "AC-001.5 대리쌍이 짝 없이 있는 글은 나누지 않고 던진다(이으면 같다는 약속을 지킬 수 없음)")]
    public void RejectsLoneSurrogate()
    {
        Assert.Throws<ArgumentException>(() => Chunker.Split("c-4", "a\uD83Db").ToList());
        Assert.Throws<ArgumentException>(() => Chunker.Split("c-4", "a\uDE00").ToList());
    }

    [Fact(DisplayName = "AC-001.5 Send는 sink에 chunk… end를 차례로 보낸다")]
    public void SendWritesToSink()
    {
        var sink = new ListSink();
        var json = "{\"name\":\"" + Fake.Name + "\"}";

        Chunker.Send(sink, "s-1", json);

        var replies = sink.Replies;
        Assert.Equal(new[] { "chunk", "end" }, replies.Select(r => r.GetProperty("type").GetString()).ToArray());
        Assert.Equal(json, replies[0].GetProperty("data").GetString());
    }
}
