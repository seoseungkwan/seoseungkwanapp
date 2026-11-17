using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 SettingsRoutes 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.SettingsRoutes;

/// <summary>한 번 읽을 때 정한 바이트까지만 주는 가짜 연결(몸이 여러 조각으로 오는 것).</summary>
internal sealed class TrickleStream : Stream
{
    private readonly byte[] data;
    private readonly int chunk;
    private int at;

    public TrickleStream(byte[] data, int chunk)
    {
        this.data = data;
        this.chunk = chunk;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => data.Length;
    public override long Position { get => at; set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count)
    {
        var n = Math.Min(Math.Min(count, chunk), data.Length - at);
        Array.Copy(data, at, buffer, offset, n);
        at += n;
        return n;
    }
}

/// <summary>
/// 길마다 몸 한도(BodyLimits, spec reception-other-clinic design.md 4절, AC-5704.2·AC-5706.1): 기본 8192 · POST /api/settings 32768 · POST /api/logo 2097152.
/// 읽기(HttpRequestReader)는 요청 줄의 길로 한도를 정해 넘으면 몸을 읽지 않고 413, 쓰기 검사(ClientGuard)도 같은 표를 본다.
/// 8192를 박아 둔 옛 시험(AC-1406.3·AC-3502.4·AC-3603.5)은 그대로 통과한다.
/// </summary>
public class BodyLimitsTests
{
    private static readonly TimeSpan Long = TimeSpan.FromSeconds(10);

    private static byte[] Request(string method, string target, int length, int? declared = null, string? contentType = null)
    {
        var head = new StringBuilder(method).Append(' ').Append(target).Append(" HTTP/1.1\r\nHost: 192.168.0.23:47200\r\n");
        if (contentType != null) head.Append("Content-Type: ").Append(contentType).Append("\r\n");
        head.Append("Content-Length: ").Append(declared ?? length).Append("\r\n\r\n");
        var bytes = Encoding.ASCII.GetBytes(head.ToString());
        return bytes.Concat(Enumerable.Repeat((byte)'x', length)).ToArray();
    }

    private static HttpRequest? Read(byte[] raw, int chunk = int.MaxValue) => HttpRequestReader.Read(new TrickleStream(raw, chunk), Long);

    private static int StatusOf(byte[] raw) => Assert.Throws<HttpReadException>(() => Read(raw)).Status;

    private static HttpRequest Write(string path, int length, string? contentType = "application/json", string? origin = "http://192.168.0.23:47200", string? reception = "1", string method = "POST")
    {
        var headers = new Dictionary<string, string> { ["Host"] = "192.168.0.23:47200" };
        if (origin != null) headers["Origin"] = origin;
        if (reception != null) headers["X-Reception"] = reception;
        if (contentType != null) headers["Content-Type"] = contentType;
        return new HttpRequest(method, path, headers, new byte[length]);
    }

    // ---- 표 ---------------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5704.2 몸 한도 표는 BodyLimits 한 곳: 기본 8192(= HttpRequestReader.MaxBody) · POST /api/settings 32768 · POST /api/logo 2097152(= LogoImage.MaxBytes), 다른 방법·길은 기본")]
    public void Table()
    {
        Assert.Equal(8192, BodyLimits.Default);
        Assert.Equal(8192, HttpRequestReader.MaxBody);
        Assert.Equal(32768, BodyLimits.Settings);
        Assert.Equal(2097152, BodyLimits.Logo);
        Assert.Equal(LogoImage.MaxBytes, BodyLimits.Logo);
        Assert.Equal("/api/settings", BodyLimits.SettingsPath);
        Assert.Equal("/api/logo", BodyLimits.LogoPath);

        Assert.Equal(32768, BodyLimits.Of("POST", "/api/settings"));
        Assert.Equal(2097152, BodyLimits.Of("POST", "/api/logo"));
        foreach (var (method, path) in new[]
        {
            ("GET", "/api/settings"), ("GET", "/api/logo"), ("PUT", "/api/settings"), ("POST", "/api/lists"), ("POST", "/api/xray"),
            ("POST", "/api/arrange"), ("POST", "/api/settings/"), ("POST", "/API/LOGO"), ("POST", "/api/logos"), ("GET", "/"),
        })
        {
            Assert.Equal(8192, BodyLimits.Of(method, path));
        }
    }

    // ---- 읽기 -------------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5704.2 POST /api/settings는 몸이 꼭 32768바이트면(조각으로 와도) 다 읽고, Content-Length가 32768을 넘으면 몸을 읽지 않고 413이다")]
    public void SettingsLimit()
    {
        var request = Read(Request("POST", "/api/settings", 32768), chunk: 1000)!;
        Assert.Equal(32768, request.Body.Length);
        Assert.Equal("/api/settings", request.Path);
        Assert.Equal(32768, Read(Request("POST", "/api/settings", 32768, contentType: "application/json"))!.Body.Length);
        Assert.Equal(20000, Read(Request("POST", "/api/settings?x=1", 20000))!.Body.Length);

        Assert.Equal(413, StatusOf(Request("POST", "/api/settings", 0, declared: 32769)));
        Assert.Equal(413, StatusOf(Request("POST", "/api/settings", 0, declared: 2097152)));
        foreach (var length in new[] { "99999999999", "0000000000000000032769", "99999999999999999999999999" })
        {
            var raw = Encoding.ASCII.GetBytes("POST /api/settings HTTP/1.1\r\nHost: a\r\nContent-Length: " + length + "\r\n\r\n");
            Assert.Equal(413, StatusOf(raw));
        }
        var padded = Encoding.ASCII.GetBytes("POST /api/settings HTTP/1.1\r\nHost: a\r\nContent-Length: 00032768\r\n\r\n").Concat(new byte[32768]).ToArray();
        Assert.Equal(32768, Read(padded)!.Body.Length);
    }

    [Fact(DisplayName = "AC-5706.1 POST /api/logo는 몸이 꼭 2097152바이트면(조각으로 와도) 다 읽고, Content-Length가 2097152를 넘으면 몸을 읽지 않고 413이다")]
    public void LogoLimit()
    {
        var request = Read(Request("POST", "/api/logo", 2097152, contentType: "image/png"), chunk: 65536)!;
        Assert.Equal(2097152, request.Body.Length);
        Assert.Equal("image/png", request.Header("Content-Type"));

        Assert.Equal(413, StatusOf(Request("POST", "/api/logo", 0, declared: 2097153)));
        Assert.Equal(413, StatusOf(Request("POST", "/api/logo", 0, declared: 99999999)));
        Assert.Equal(413, StatusOf(Request("POST", "/api/logo", 0, declared: 999999999)));
    }

    [Fact(DisplayName = "AC-5704.2 그 밖의 길(GET /api/settings·GET /api/logo·/api/lists·/api/xray·/api/arrange)은 지금처럼 8192바이트까지이고 넘으면 413이다")]
    public void OtherPathsKeep8192()
    {
        foreach (var (method, path) in new[] { ("GET", "/api/settings"), ("GET", "/api/logo"), ("POST", "/api/lists"), ("POST", "/api/xray"), ("POST", "/api/arrange"), ("PUT", "/api/logo") })
        {
            Assert.Equal(8192, Read(Request(method, path, 8192))!.Body.Length);
            Assert.Equal(413, StatusOf(Request(method, path, 0, declared: 8193)));
        }
    }

    [Fact(DisplayName = "AC-5704.2 몸 뒤에 더 온 바이트는 버리고(큰 한도 길도), 끝까지 오기 전에 끊기면 답할 상대가 없다(null)")]
    public void ExtraAndCut()
    {
        var raw = Request("POST", "/api/settings", 10000).Concat(Encoding.ASCII.GetBytes("GET / HTTP/1.1\r\n\r\n")).ToArray();
        Assert.Equal(10000, Read(raw)!.Body.Length);
        var cut = Request("POST", "/api/logo", 100000, declared: 200000);
        Assert.Null(Read(cut, chunk: 4096));
    }

    // ---- 쓰기 검사 ------------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5704.2 쓰기 검사(ClientGuard.WriteOk)의 몸 길이도 같은 표: /api/settings 32768까지, /api/lists·/api/xray는 8192까지이고 JSON만 받는다")]
    public void GuardUsesTable()
    {
        Assert.True(ClientGuard.WriteOk(Write("/api/settings", 32768)));
        Assert.False(ClientGuard.WriteOk(Write("/api/settings", 32769)));
        Assert.False(ClientGuard.WriteOk(Write("/api/settings", 10, contentType: "image/png")));
        Assert.False(ClientGuard.WriteOk(Write("/api/settings", 10, contentType: null)));
        Assert.True(ClientGuard.WriteOk(Write("/api/lists", 8192)));
        Assert.False(ClientGuard.WriteOk(Write("/api/lists", 8193)));
        Assert.False(ClientGuard.WriteOk(Write("/api/xray", 8193)));
        Assert.False(ClientGuard.WriteOk(Write("/api/settings", 10, origin: "http://evil.example")));
        Assert.False(ClientGuard.WriteOk(Write("/api/settings", 10, reception: null)));
    }

    [Fact(DisplayName = "AC-5706.1 POST /api/logo의 쓰기 검사는 Origin = http://{Host}·X-Reception: 1·몸 2097152바이트까지이고, 그림 형식(Content-Type)은 길이 본다(틀리면 400)")]
    public void GuardForLogo()
    {
        Assert.True(ClientGuard.WriteOk(Write("/api/logo", 2097152, contentType: "image/png")));
        Assert.True(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/jpeg")));
        Assert.True(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "application/json")));
        Assert.True(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: null)));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 2097153, contentType: "image/png")));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/png", origin: null)));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/png", origin: "http://evil.example")));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/png", reception: null)));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/png", reception: "0")));
        Assert.False(ClientGuard.WriteOk(Write("/api/logo", 10, contentType: "image/png", method: "GET")));
        Assert.False(ClientGuard.WriteOk(Write("/api/logos", 10, contentType: "image/png")));
    }

    // ---- 진짜 소켓 --------------------------------------------------------------------------------------------

    /// <summary>화면 파일 하나(index.html)만 있는 원천.</summary>
    private sealed class OnePage : IStaticSource
    {
        public IEnumerable<string> Names => new[] { "reception/index.html" };

        public byte[]? Read(string name) => name == "reception/index.html" ? Encoding.UTF8.GetBytes("<!doctype html>") : null;
    }

    /// <summary>루프백 빈 문에 연 서버. 새 길은 아직 라우터에 잇지 않았다(TASK-8): 다 읽은 요청은 404, 한도를 넘은 요청은 413.</summary>
    private sealed class Live : IDisposable
    {
        private readonly Rig bit = new Rig();
        private readonly TempFolder data = new TempFolder();

        public Live()
        {
            var now = new DateTime(2026, 11, 5, 10, 0, 0);
            var cache = new BoardCache(bit.Services, () => now);
            var marks = new XrayMarks(new StoreFolder(data.Path), bit.Protector, () => now);
            var router = new ReceptionRouter(bit.Services, cache, marks, new VisitKeys(), new StaticFiles(new OnePage()), () => new IPAddress[0]);
            Server = new ReceptionServer(router, null, TimeSpan.FromSeconds(20));
            Server.Start(IPAddress.Loopback, 0);
        }

        public ReceptionServer Server { get; }

        public string Host => "127.0.0.1:" + Server.Port;

        public Reply Send(string method, string path, int length, int? declared = null) =>
            Wire.Exchange(Server.Port, method + " " + path + " HTTP/1.1\r\nHost: " + Host + "\r\nContent-Length: " + (declared ?? length) + "\r\n\r\n" + new string('x', length));

        public void Dispose()
        {
            Server.Dispose();
            data.Dispose();
            bit.Dispose();
        }
    }

    [Fact(DisplayName = "AC-5704.2 AC-5706.1 진짜 소켓: /api/settings 32768·/api/logo 2097152바이트 몸은 다 읽어 길 나누기로 넘기고(아직 없는 길이라 404), 넘으면 413, 다른 길은 8192 그대로이며 서버는 계속 돈다")]
    public void LiveServer()
    {
        using var live = new Live();
        Assert.Equal(404, live.Send("POST", "/api/settings", 32768).Status);
        Assert.Equal(413, live.Send("POST", "/api/settings", 0, declared: 32769).Status);
        Assert.Equal(404, live.Send("POST", "/api/logo", 2097152).Status);
        Assert.Equal(413, live.Send("POST", "/api/logo", 0, declared: 2097153).Status);
        Assert.Equal(413, live.Send("POST", "/api/lists", 0, declared: 8193).Status);
        Assert.Equal(413, live.Send("GET", "/api/settings", 0, declared: 8193).Status);
        Assert.Equal(200, live.Send("GET", "/", 0).Status);
    }
}
