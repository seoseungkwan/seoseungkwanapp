using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Reception.Http;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 HttpGate 이름 공간에 둔다(같은 Http 폴더의 길 나누기·서버 시험과 따로 돈다)
namespace Precheck.Core.Tests.Reception.HttpGate;

/// <summary>
/// 작은 웹 서버의 요청 읽기(HttpRequestReader, design.md 7절, REQ-1406).
/// AC-1406.4 요청 줄 1KB·머리 8KB를 넘으면 431, 5초(주입한 시간) 안에 다 오지 않으면 408, 아무것도 안 오거나 끊기면 답 없이 끊는다.
///           모양이 틀린 요청은 400이고 그 연결만 끝난다(읽기 틀에 남는 상태가 없다).
/// AC-1406.2 Host 머리를 읽는다(대소문자 무시, 두 번 오면 이어 붙여 ClientGuard 검사에서 떨어진다).
/// AC-1406.3 쓰기 요청의 몸은 8192바이트까지(넘으면 413, spec reception-arrange-tune AC-3603.5), Content-Length만 받는다(Transfer-Encoding은 400), OPTIONS도 읽는다.
/// 메모리 스트림과 가짜 연결(조각마다 기다림·영영 기다림)만 쓴다. 주소는 가짜 사설 주소다.
/// </summary>
public class HttpRequestReaderTests
{
    private static readonly TimeSpan Long = TimeSpan.FromSeconds(20);
    private const string HostLine = "Host: 192.168.0.23:47200";

    private static byte[] Ascii(string text) => Encoding.ASCII.GetBytes(text);

    /// <summary>요청 줄 + 머리 줄들 + 빈 줄(CRLF)</summary>
    private static string Head(string line, params string[] headers)
    {
        var text = new StringBuilder(line).Append("\r\n");
        foreach (var header in headers) text.Append(header).Append("\r\n");
        return text.Append("\r\n").ToString();
    }

    private static HttpRequest? ReadAll(byte[] bytes, TimeSpan? timeout = null) =>
        HttpRequestReader.Read(new MemoryStream(bytes), timeout ?? Long);

    private static HttpRequest Must(HttpRequest? request)
    {
        Assert.NotNull(request);
        return request!;
    }

    private static int StatusOf(Func<HttpRequest?> read) => Assert.Throws<HttpReadException>(() => read()).Status;

    /// <summary>"GET /aaa… HTTP/1.1"을 꼭 length 바이트로 만든다</summary>
    private static string LineOf(int length) => "GET /" + new string('a', length - "GET / HTTP/1.1".Length) + " HTTP/1.1";

    /// <summary>Host 줄 + X-Pad 줄의 머리 바이트(줄 끝 CRLF 포함, 끝 빈 줄 뺌)가 꼭 total이 되게</summary>
    private static string[] HeadersOf(int total)
    {
        var pad = total - (HostLine.Length + 2) - ("X-Pad: ".Length + 2);
        return new[] { HostLine, "X-Pad: " + new string('b', pad) };
    }

    // ---- AC-1406.4 길이 제한 ----

    [Fact(DisplayName = "AC-1406.4 제한 값: 요청 줄 1024바이트, 머리 8192바이트, 몸 8192바이트(AC-3603.5), 기본 시간 5초")]
    public void Limits()
    {
        Assert.Equal(1024, HttpRequestReader.MaxRequestLine);
        Assert.Equal(8192, HttpRequestReader.MaxHeaderBytes);
        Assert.Equal(8192, HttpRequestReader.MaxBody);
        Assert.Equal(TimeSpan.FromSeconds(5), HttpRequestReader.DefaultTimeout);
    }

    [Fact(DisplayName = "AC-1406.4 요청 줄이 꼭 1024바이트면 읽는다")]
    public void RequestLineAtLimit()
    {
        var line = LineOf(1024);
        Assert.Equal(1024, line.Length);
        var request = Must(ReadAll(Ascii(Head(line, HostLine))));
        Assert.Equal("GET", request.Method);
        Assert.Equal(line.Substring(4, line.Length - 4 - " HTTP/1.1".Length), request.Target);
    }

    [Fact(DisplayName = "AC-1406.4 요청 줄이 1025바이트면 431")]
    public void RequestLineOverLimit()
    {
        Assert.Equal(431, StatusOf(() => ReadAll(Ascii(Head(LineOf(1025), HostLine)))));
    }

    [Fact(DisplayName = "AC-1406.4 요청 줄이 끝나지 않은 채 1KB를 넘으면 줄 끝·시간을 기다리지 않고 바로 431")]
    public void RequestLineNeverEnds()
    {
        using var stream = new ScriptedStream(hangAtEnd: true).Then(Ascii(new string('a', 1100)));
        Assert.Equal(431, StatusOf(() => HttpRequestReader.Read(stream, Long)));
    }

    [Fact(DisplayName = "AC-1406.4 머리가 꼭 8192바이트면 읽는다")]
    public void HeadersAtLimit()
    {
        var headers = HeadersOf(8192);
        Assert.Equal(8192, headers.Sum(h => h.Length + 2));
        var request = Must(ReadAll(Ascii(Head("GET / HTTP/1.1", headers))));
        Assert.Equal(headers[1].Length - "X-Pad: ".Length, request.Header("X-Pad")!.Length);
    }

    [Fact(DisplayName = "AC-1406.4 머리가 8193바이트면 431")]
    public void HeadersOverLimit()
    {
        Assert.Equal(431, StatusOf(() => ReadAll(Ascii(Head("GET / HTTP/1.1", HeadersOf(8193))))));
    }

    [Fact(DisplayName = "AC-1406.4 작은 머리가 많아 모두 8KB를 넘어도 431")]
    public void ManySmallHeaders()
    {
        var headers = Enumerable.Range(0, 800).Select(i => "X-" + i.ToString("D4") + ": v").ToArray();
        Assert.True(headers.Sum(h => h.Length + 2) > 8192);
        Assert.Equal(431, StatusOf(() => ReadAll(Ascii(Head("GET / HTTP/1.1", headers)))));
    }

    [Fact(DisplayName = "AC-1406.4 머리가 끝나지 않은 채 8KB를 넘으면 빈 줄·시간을 기다리지 않고 바로 431")]
    public void HeadersNeverEnd()
    {
        using var stream = new ScriptedStream(hangAtEnd: true).Then(Ascii("GET / HTTP/1.1\r\n" + HostLine + "\r\nX-Pad: " + new string('b', 8300)));
        Assert.Equal(431, StatusOf(() => HttpRequestReader.Read(stream, Long)));
    }

    // ---- AC-1406.4 시간 제한 ----

    [Fact(DisplayName = "AC-1406.4 요청이 일부만 오고 멈추면 정한 시간이 지나 408")]
    public void StallsMidRequest()
    {
        using var stream = new ScriptedStream(hangAtEnd: true).Then(Ascii("GET /api/board HTTP/1.1\r\nHo"));
        var watch = Stopwatch.StartNew();
        Assert.Equal(408, StatusOf(() => HttpRequestReader.Read(stream, TimeSpan.FromMilliseconds(200))));
        Assert.True(watch.Elapsed >= TimeSpan.FromMilliseconds(150), $"시간보다 일찍 끝났다: {watch.Elapsed}");
    }

    [Fact(DisplayName = "AC-1406.4 조금씩 계속 와도 시간은 요청 전체에 걸린다(한 바이트씩 느리게 오면 408)")]
    public void SlowDripHitsTotalDeadline()
    {
        var stream = new ScriptedStream(hangAtEnd: false);
        foreach (var b in Ascii(Head("GET /api/board HTTP/1.1", HostLine))) stream.Then(new[] { b }, TimeSpan.FromMilliseconds(40));
        using (stream)
        {
            Assert.Equal(408, StatusOf(() => HttpRequestReader.Read(stream, TimeSpan.FromMilliseconds(300))));
        }
    }

    [Fact(DisplayName = "AC-1406.4 몸이 Content-Length보다 덜 오고 멈추면 408")]
    public void StallsInBody()
    {
        using var stream = new ScriptedStream(hangAtEnd: true)
            .Then(Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Content-Length: 20") + "{\"v\":"));
        Assert.Equal(408, StatusOf(() => HttpRequestReader.Read(stream, TimeSpan.FromMilliseconds(200))));
    }

    [Fact(DisplayName = "AC-1406.4 아무것도 오지 않고 시간이 지나면 답 없이 끊는다(null)")]
    public void NothingArrives()
    {
        using var stream = new ScriptedStream(hangAtEnd: true);
        Assert.Null(HttpRequestReader.Read(stream, TimeSpan.FromMilliseconds(150)));
    }

    [Fact(DisplayName = "AC-1406.4 시간 안이면 여러 조각으로 나눠 와도 읽는다")]
    public void ChunksWithinDeadline()
    {
        var raw = Ascii(Head("GET /api/board?fresh=1 HTTP/1.1", HostLine, "X-Reception: 1"));
        var stream = new ScriptedStream(hangAtEnd: true);
        for (var i = 0; i < raw.Length; i += 9) stream.Then(raw.Skip(i).Take(9).ToArray(), TimeSpan.FromMilliseconds(5));
        using (stream)
        {
            var request = Must(HttpRequestReader.Read(stream, TimeSpan.FromSeconds(10)));
            Assert.Equal("/api/board", request.Path);
            Assert.Equal("fresh=1", request.Query);
            Assert.Equal("1", request.Header("X-Reception"));
        }
    }

    [Fact(DisplayName = "AC-1406.4 한 바이트씩 와도 한 번에 온 것과 같게 읽는다(몸 포함)")]
    public void OneByteAtATime()
    {
        var body = "{\"visit\":\"0123456789abcdef\",\"on\":true}";
        var raw = Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Origin: http://192.168.0.23:47200", "Content-Type: application/json",
            "X-Reception: 1", "Content-Length: " + body.Length) + body);
        var stream = new ScriptedStream(hangAtEnd: true);
        foreach (var b in raw) stream.Then(new[] { b });
        using (stream)
        {
            var slow = Must(HttpRequestReader.Read(stream, TimeSpan.FromSeconds(10)));
            var fast = Must(ReadAll(raw));
            Assert.Equal(fast.Method, slow.Method);
            Assert.Equal(fast.Target, slow.Target);
            Assert.Equal(fast.Headers.OrderBy(h => h.Key, StringComparer.Ordinal), slow.Headers.OrderBy(h => h.Key, StringComparer.Ordinal));
            Assert.Equal(Ascii(body), slow.Body);
            Assert.Equal(Ascii(body), fast.Body);
        }
    }

    [Fact(DisplayName = "AC-1406.4 끝까지 다 오기 전에 연결이 끊기면 답 없이 끊는다(null)")]
    public void ClosedMidRequest()
    {
        Assert.Null(ReadAll(Ascii("GET /api/board HTTP/1.1\r\nHost: 192.")));
        Assert.Null(ReadAll(Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Content-Length: 10") + "{}")));
        Assert.Null(ReadAll(new byte[0]));
    }

    [Fact(DisplayName = "AC-1406.4 연결에서 읽다 오류가 나면 답 없이 끊는다(null, 예외가 서버로 번지지 않는다)")]
    public void BrokenConnection()
    {
        using var stream = new BrokenStream();
        Assert.Null(HttpRequestReader.Read(stream, Long));
    }

    [Fact(DisplayName = "AC-1406.4 한 연결이 431·408·400이어도 다음 연결은 그대로 읽는다(읽기 틀에 남는 상태가 없다)")]
    public void NextConnectionUnaffected()
    {
        Assert.Equal(431, StatusOf(() => ReadAll(Ascii(Head(LineOf(1025), HostLine)))));
        using (var stalled = new ScriptedStream(hangAtEnd: true).Then(Ascii("GET / HTTP/1.1\r\n")))
        {
            Assert.Equal(408, StatusOf(() => HttpRequestReader.Read(stalled, TimeSpan.FromMilliseconds(100))));
        }
        Assert.Equal(400, StatusOf(() => ReadAll(Ascii(Head("BAD")))));
        Assert.Equal("/api/board", Must(ReadAll(Ascii(Head("GET /api/board HTTP/1.1", HostLine)))).Path);
    }

    [Fact(DisplayName = "AC-1406.4 연결이 없거나 시간이 0 이하면 ArgumentException")]
    public void Arguments()
    {
        Assert.Throws<ArgumentNullException>(() => HttpRequestReader.Read(null!, Long));
        Assert.Throws<ArgumentOutOfRangeException>(() => HttpRequestReader.Read(new MemoryStream(), TimeSpan.Zero));
        Assert.Throws<ArgumentOutOfRangeException>(() => HttpRequestReader.Read(new MemoryStream(), TimeSpan.FromSeconds(-1)));
    }

    // ---- AC-1406.4 모양이 틀린 요청은 400 ----

    [Theory(DisplayName = "AC-1406.4 요청 줄 모양이 틀리면 400")]
    [InlineData("")]
    [InlineData("GET")]
    [InlineData("GET /")]
    [InlineData("GET  / HTTP/1.1")]
    [InlineData("GET / HTTP/1.1 more")]
    [InlineData("GET / HTTP/2.0")]
    [InlineData("GET / http/1.1")]
    [InlineData("get / HTTP/1.1")]
    [InlineData("G3T / HTTP/1.1")]
    [InlineData("GET http://evil.example/ HTTP/1.1")]
    [InlineData("OPTIONS * HTTP/1.1")]
    [InlineData("GET api/board HTTP/1.1")]
    [InlineData("GET /a#b HTTP/1.1")]
    [InlineData("GET /a\tb HTTP/1.1")]
    [InlineData("GET /a\u0001b HTTP/1.1")]
    [InlineData("GET /a\u007fb HTTP/1.1")]
    [InlineData("GETTINGVERYLONGMETHOD / HTTP/1.1")]
    public void BadRequestLine(string line)
    {
        Assert.Equal(400, StatusOf(() => ReadAll(Ascii(Head(line, HostLine)))));
    }

    [Fact(DisplayName = "AC-1406.4 요청 줄에 ASCII가 아닌 글자가 있으면 400")]
    public void NonAsciiTarget()
    {
        var raw = Encoding.UTF8.GetBytes(Head("GET /가상환자01 HTTP/1.1", HostLine));
        Assert.Equal(400, StatusOf(() => ReadAll(raw)));
    }

    [Theory(DisplayName = "AC-1406.4 머리 줄 모양이 틀리면 400")]
    [InlineData("NoColon")]
    [InlineData(": empty-name")]
    [InlineData("Bad Name: x")]
    [InlineData("Name : x")]
    [InlineData(" folded-continuation")]
    [InlineData("\tfolded-continuation")]
    [InlineData("X-Nul: a\u0000b")]
    [InlineData("X-Bel: a\u0007b")]
    [InlineData("X-Cr: a\rb")]
    [InlineData("X(Bad): x")]
    public void BadHeaderLine(string header)
    {
        Assert.Equal(400, StatusOf(() => ReadAll(Ascii(Head("GET / HTTP/1.1", HostLine, header)))));
    }

    // ---- AC-1406.2 머리 읽기(Host) ----

    [Fact(DisplayName = "AC-1406.2 요청 줄·경로·질의·머리를 읽고 머리 이름은 대소문자를 가리지 않으며 값 앞뒤 빈칸은 뗀다")]
    public void ReadsGet()
    {
        var request = Must(ReadAll(Ascii(Head("GET /api/board?fresh=1 HTTP/1.1", "host: 192.168.0.23:47200", "X-RECEPTION: \t 1 \t", "Accept:"))));
        Assert.Equal("GET", request.Method);
        Assert.Equal("/api/board?fresh=1", request.Target);
        Assert.Equal("/api/board", request.Path);
        Assert.Equal("fresh=1", request.Query);
        Assert.Equal("192.168.0.23:47200", request.Header("Host"));
        Assert.Equal("192.168.0.23:47200", request.Header("HOST"));
        Assert.Equal("1", request.Header("x-reception"));
        Assert.Equal("", request.Header("Accept"));
        Assert.Null(request.Header("Origin"));
        Assert.Empty(request.Body);
    }

    [Fact(DisplayName = "AC-1406.2 질의가 없으면 Query는 null, 빈 질의는 빈 글, 경로는 퍼센트 글자를 풀지 않는다")]
    public void PathAndQuery()
    {
        var plain = Must(ReadAll(Ascii(Head("GET /api/visit/0123456789abcdef/history HTTP/1.1", HostLine))));
        Assert.Equal("/api/visit/0123456789abcdef/history", plain.Path);
        Assert.Null(plain.Query);

        var empty = Must(ReadAll(Ascii(Head("GET /api/board? HTTP/1.1", HostLine))));
        Assert.Equal("/api/board", empty.Path);
        Assert.Equal("", empty.Query);

        var encoded = Must(ReadAll(Ascii(Head("GET /%2e%2e/app.js?from=5&x=%2F HTTP/1.0", HostLine))));
        Assert.Equal("/%2e%2e/app.js", encoded.Path);
        Assert.Equal("from=5&x=%2F", encoded.Query);
    }

    [Fact(DisplayName = "AC-1406.2 줄 끝이 LF 하나여도 읽는다")]
    public void BareLineFeeds()
    {
        var request = Must(ReadAll(Ascii("GET /api/board HTTP/1.1\n" + HostLine + "\n\n")));
        Assert.Equal("/api/board", request.Path);
        Assert.Equal("192.168.0.23:47200", request.Header("Host"));
    }

    [Fact(DisplayName = "AC-1406.2 같은 머리가 두 번 오면 \", \"로 이어 붙인 한 값이 되어 Host 검사에서 떨어진다")]
    public void DuplicateHost()
    {
        var request = Must(ReadAll(Ascii(Head("GET /api/board HTTP/1.1", HostLine, "Host: evil.example:47200"))));
        Assert.Equal("192.168.0.23:47200, evil.example:47200", request.Header("Host"));
        var mine = new[] { IPAddress.Parse("192.168.0.23") };
        Assert.False(ClientGuard.HostOk(request.Header("Host"), IPAddress.Parse("192.168.0.40"), mine, 47200));
    }

    [Fact(DisplayName = "AC-1406.2 HttpRequest를 직접 만들 때도 같은 이름 머리를 이어 붙이고 경로는 / 로 시작해야 한다")]
    public void ConstructorRules()
    {
        var request = new HttpRequest("GET", "/api/board", new[]
        {
            new KeyValuePair<string, string>("Accept", "a"),
            new KeyValuePair<string, string>("accept", "b"),
        }, new byte[0]);
        Assert.Equal("a, b", request.Header("ACCEPT"));
        Assert.Single(request.Headers);
        Assert.Throws<ArgumentException>(() => new HttpRequest("GET", "api/board", new KeyValuePair<string, string>[0], new byte[0]));
        Assert.Throws<ArgumentNullException>(() => new HttpRequest("GET", "/", new KeyValuePair<string, string>[0], null!));
    }

    // ---- AC-1406.3 쓰기 요청의 몸 ----

    [Fact(DisplayName = "AC-1406.3 POST 몸은 Content-Length만큼만 읽고 뒤에 더 온 바이트는 버린다")]
    public void ReadsBody()
    {
        var body = "{\"visit\":\"0123456789abcdef\",\"on\":true}";
        var raw = Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Content-Type: application/json", "Content-Length: " + body.Length) + body + "GET / HTTP/1.1\r\n");
        var request = Must(ReadAll(raw));
        Assert.Equal("POST", request.Method);
        Assert.Equal(Ascii(body), request.Body);
    }

    [Fact(DisplayName = "AC-1406.3 몸이 꼭 8192바이트면 읽는다")]
    public void BodyAtLimit()
    {
        var body = new string('x', 8192);
        var request = Must(ReadAll(Ascii(Head("POST /api/lists HTTP/1.1", HostLine, "Content-Length: 8192") + body)));
        Assert.Equal(8192, request.Body.Length);
    }

    [Theory(DisplayName = "AC-1406.3 Content-Length가 8192를 넘으면 몸을 읽지 않고 413")]
    [InlineData("8193")]
    [InlineData("10000")]
    [InlineData("1000000")]
    [InlineData("99999999999999999999999999")]
    public void BodyOverLimit(string length)
    {
        using var stream = new ScriptedStream(hangAtEnd: true).Then(Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Content-Length: " + length)));
        Assert.Equal(413, StatusOf(() => HttpRequestReader.Read(stream, Long)));
    }

    [Theory(DisplayName = "AC-1406.3 Content-Length 모양이 틀리거나 두 번 오거나 Transfer-Encoding이 있으면 400")]
    [InlineData("Content-Length: abc")]
    [InlineData("Content-Length: -1")]
    [InlineData("Content-Length: +5")]
    [InlineData("Content-Length: 5 5")]
    [InlineData("Content-Length:")]
    [InlineData("Transfer-Encoding: chunked")]
    public void BadBodyFraming(string header)
    {
        Assert.Equal(400, StatusOf(() => ReadAll(Ascii(Head("POST /api/xray HTTP/1.1", HostLine, header) + "{}"))));
    }

    [Fact(DisplayName = "AC-1406.3 Content-Length가 두 번 오면 400")]
    public void DuplicateContentLength()
    {
        Assert.Equal(400, StatusOf(() => ReadAll(Ascii(Head("POST /api/xray HTTP/1.1", HostLine, "Content-Length: 2", "Content-Length: 2") + "{}"))));
    }

    [Fact(DisplayName = "AC-1406.3 사전 확인 OPTIONS도 읽어서 길 나누기가 405로 답할 수 있다(쓰기 검사는 떨어진다)")]
    public void ReadsPreflight()
    {
        var request = Must(ReadAll(Ascii(Head("OPTIONS /api/xray HTTP/1.1", HostLine, "Origin: http://evil.example",
            "Access-Control-Request-Method: POST", "Access-Control-Request-Headers: content-type, x-reception"))));
        Assert.Equal("OPTIONS", request.Method);
        Assert.Equal("/api/xray", request.Path);
        Assert.False(ClientGuard.WriteOk(request));
    }
}

/// <summary>
/// 미리 정한 조각을 차례로 주는 가짜 연결. 조각마다 앞에 기다림을 둘 수 있고, 조각이 다 떨어지면
/// 끝(0)을 주거나(hangAtEnd = false) 닫힐 때까지 영영 기다린다(hangAtEnd = true, 멈춘 휴대폰).
/// 기다림은 Task.Delay라 스레드를 잡지 않는다.
/// </summary>
internal sealed class ScriptedStream : Stream
{
    private readonly bool hangAtEnd;
    private readonly Queue<(TimeSpan Delay, byte[] Bytes)> chunks = new Queue<(TimeSpan Delay, byte[] Bytes)>();
    private readonly TaskCompletionSource<int> closed = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
    private byte[] pending = new byte[0];

    public ScriptedStream(bool hangAtEnd)
    {
        this.hangAtEnd = hangAtEnd;
    }

    public ScriptedStream Then(byte[] bytes, TimeSpan delay = default)
    {
        lock (chunks) chunks.Enqueue((delay, bytes));
        return this;
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        if (pending.Length == 0)
        {
            (TimeSpan Delay, byte[] Bytes) next;
            lock (chunks)
            {
                if (chunks.Count == 0)
                {
                    next = (TimeSpan.Zero, new byte[0]);
                }
                else
                {
                    next = chunks.Dequeue();
                }
            }
            if (next.Bytes.Length == 0)
            {
                return hangAtEnd ? await closed.Task.ConfigureAwait(false) : 0;
            }
            if (next.Delay > TimeSpan.Zero) await Task.Delay(next.Delay).ConfigureAwait(false);
            pending = next.Bytes;
        }
        var n = Math.Min(count, pending.Length);
        Array.Copy(pending, 0, buffer, offset, n);
        pending = pending.Skip(n).ToArray();
        return n;
    }

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException("읽기 틀은 ReadAsync만 쓴다");

    protected override void Dispose(bool disposing)
    {
        closed.TrySetResult(0);
        base.Dispose(disposing);
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

/// <summary>읽을 때마다 IOException을 내는 가짜 연결(휴대폰이 와이파이에서 빠짐).</summary>
internal sealed class BrokenStream : Stream
{
    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        Task.FromException<int>(new IOException("connection reset"));

    public override int Read(byte[] buffer, int offset, int count) => throw new IOException("connection reset");

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
