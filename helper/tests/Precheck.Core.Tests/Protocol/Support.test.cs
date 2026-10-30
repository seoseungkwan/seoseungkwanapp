using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;

namespace Precheck.Core.Tests.Protocol;

/// <summary>시험이 같이 쓰는 것: 저장소 경로, 틀 만들기·풀기, 답 모으기, 가짜 환자 글자.</summary>
internal static class Repo
{
    private static readonly Lazy<string> RootLazy = new Lazy<string>(FindRoot);

    public static string Root => RootLazy.Value;

    public static string PathOf(params string[] parts) =>
        parts.Aggregate(Root, (acc, part) => System.IO.Path.Combine(acc, part));

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var table = System.IO.Path.Combine(dir.FullName, "src", "lib", "bridge", "commands.json");
            var props = System.IO.Path.Combine(dir.FullName, "helper", "Directory.Build.props");
            if (File.Exists(table) && File.Exists(props)) return dir.FullName;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("저장소 뿌리(src/lib/bridge/commands.json)를 찾지 못했다");
    }
}

/// <summary>가짜 환자 글자. 실제 환자 자료가 아니다(design.md 10절 규칙: 가상환자NN, 9로 시작하는 6자리).</summary>
internal static class Fake
{
    public const string Name = "가상환자01";
    public const string Chart = "900001";
    public const string Phone = "010-0000-0001";
}

internal static class Frames
{
    public static byte[] Frame(byte[] body)
    {
        var output = new byte[4 + body.Length];
        WriteLength(output, (uint)body.Length);
        Buffer.BlockCopy(body, 0, output, 4, body.Length);
        return output;
    }

    public static byte[] Frame(string json) => Frame(Encoding.UTF8.GetBytes(json));

    /// <summary>본문 없이 길이 머리만.</summary>
    public static byte[] Header(uint length)
    {
        var output = new byte[4];
        WriteLength(output, length);
        return output;
    }

    public static byte[] Concat(params byte[][] parts)
    {
        var all = new List<byte>();
        foreach (var part in parts) all.AddRange(part);
        return all.ToArray();
    }

    /// <summary>출력 전체를 틀로 나눈다. 틀이 아닌 바이트가 하나라도 있으면 실패한다.</summary>
    public static List<byte[]> ReadAll(byte[] output)
    {
        var messages = new List<byte[]>();
        var pos = 0;
        while (pos < output.Length)
        {
            if (output.Length - pos < 4) throw new InvalidDataException("틀 머리가 잘렸다");
            var length = output[pos] | (output[pos + 1] << 8) | (output[pos + 2] << 16) | (output[pos + 3] << 24);
            if (length < 0 || output.Length - pos - 4 < length) throw new InvalidDataException("틀 본문이 잘렸다");
            var body = new byte[length];
            Buffer.BlockCopy(output, pos + 4, body, 0, length);
            messages.Add(body);
            pos += 4 + length;
        }
        return messages;
    }

    private static void WriteLength(byte[] target, uint length)
    {
        target[0] = (byte)(length & 0xFF);
        target[1] = (byte)((length >> 8) & 0xFF);
        target[2] = (byte)((length >> 16) & 0xFF);
        target[3] = (byte)((length >> 24) & 0xFF);
    }
}

internal static class Json
{
    private static readonly UTF8Encoding Strict = new UTF8Encoding(false, true);

    /// <summary>엄격한 UTF-8로 풀고(잘못된 바이트면 던짐) JSON 뿌리를 돌려준다.</summary>
    public static JsonElement Parse(byte[] utf8)
    {
        Strict.GetString(utf8);
        using var doc = JsonDocument.Parse(utf8);
        return doc.RootElement.Clone();
    }

    public static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static string[] Keys(JsonElement obj) => obj.EnumerateObject().Select(p => p.Name).ToArray();
}

internal sealed class ListSink : IReplySink
{
    public List<byte[]> Messages { get; } = new List<byte[]>();

    public void Send(byte[] utf8Json) => Messages.Add(utf8Json);

    public List<JsonElement> Replies => Messages.Select(Json.Parse).ToList();
}

/// <summary>Read 한 번에 1바이트씩만 주는 흐름(표준 입력이 조금씩 오는 경우).</summary>
internal sealed class TrickleStream : Stream
{
    private readonly MemoryStream inner;

    public TrickleStream(byte[] data) { inner = new MemoryStream(data); }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => inner.Length;
    public override long Position { get => inner.Position; set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, Math.Min(1, count));
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

internal static class Requests
{
    public static string Envelope(string cmd, string argsJson, string id = "req-1", int v = 1) =>
        "{\"v\":" + v + ",\"id\":\"" + id + "\",\"cmd\":\"" + cmd + "\",\"args\":" + argsJson + "}";

    public static Request Make(string cmd, string argsJson, string id = "req-1") =>
        new Request { V = 1, Id = id, Cmd = cmd, Args = Json.Parse(argsJson) };

    public static string Allowed(CommandTable table) => "chrome-extension://" + table.ExtensionId + "/";
}
