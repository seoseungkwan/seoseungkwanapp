using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception.Http;
using Xunit;
using Xunit.Sdk;

// 이 TASK의 시험만 한 거르기로 돌리려고 Serve 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Serve;

/// <summary>
/// 작은 웹 서버(ReceptionServer, design.md 7절, REQ-1406). 루프백(127.0.0.1)의 빈 문(0)에 진짜 소켓을 열어 끝까지 본다.
/// AC-1406.4 요청 줄·머리가 크면 431, 정한 시간 안에 다 오지 않으면 408, 아무것도 안 오면 답 없이 끊고, 동시에 32개를 넘는 연결은 그것만 끊으며 서버는 계속 돈다.
/// AC-1406.5 정해 둔 길(화면 파일·/api/board·상세·찍음 표시)과 404·405·503이 소켓 너머에서도 같다.
/// AC-1403.8 /api/board?fresh=1만 8초 묶음을 건너뛴다. AC-1406.7 기록에는 번호와 건수만 남는다.
/// 시험 시간을 줄이려고 읽기 시간 제한은 주입한 짧은 값이다(기본은 5초).
/// </summary>
public class ReceptionServerTests
{
    private static readonly TimeSpan Short = TimeSpan.FromMilliseconds(600);

    /// <summary>서버 한 벌: ServeRig의 라우터를 127.0.0.1:빈 문에 연다.</summary>
    private sealed class Live : IDisposable
    {
        public Live(bool registered = true, TimeSpan? readTimeout = null)
        {
            Rig = new ServeRig(registered);
            Server = new ReceptionServer(Rig.Router, Rig.Log, readTimeout ?? TimeSpan.FromSeconds(10));
            Server.Start(IPAddress.Loopback, 0);
            Port = Server.Port;
        }

        public ServeRig Rig { get; }
        public ReceptionServer Server { get; }
        public int Port { get; }
        public string Host => "127.0.0.1:" + Port;

        public int Connections => Server.Connections;

        public Reply Get(string target) => Wire.Exchange(Port, "GET " + target + " HTTP/1.1\r\nHost: " + Host + "\r\n\r\n");

        public void Dispose()
        {
            Server.Dispose();
            Rig.Dispose();
        }
    }

    // ---- AC-1406.4 길이·시간·연결 수 -----------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.4 요청 줄이 1KB를 넘으면 431로 답하고 그 연결만 닫으며, 서버는 다음 요청에 그대로 답한다")]
    public void LongRequestLine()
    {
        using var live = new Live();
        var reply = Wire.Exchange(live.Port, "GET /" + new string('a', 2000) + " HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n");
        Assert.Equal(431, reply.Status);
        Assert.Equal("close", reply.Header("Connection"));
        Assert.Equal(200, live.Get("/").Status);
    }

    [Fact(DisplayName = "AC-1406.4 머리가 8KB를 넘으면 431, 모양이 틀리면 400, 몸이 8192바이트(/api/xray는 256바이트, AC-3603.5)를 넘으면 413이고 서버는 계속 돈다")]
    public void BadRequestsAnswered()
    {
        using var live = new Live();
        var bigHeader = "GET / HTTP/1.1\r\nHost: " + live.Host + "\r\nX-Pad: " + new string('b', 9000) + "\r\n\r\n";
        Assert.Equal(431, Wire.Exchange(live.Port, bigHeader).Status);
        Assert.Equal(400, Wire.Exchange(live.Port, "get / HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n").Status);
        var bigBody = "POST /api/xray HTTP/1.1\r\nHost: " + live.Host + "\r\nContent-Length: 300\r\n\r\n" + new string('c', 300);
        Assert.Equal(413, Wire.Exchange(live.Port, bigBody).Status);
        var hugeBody = "POST /api/xray HTTP/1.1\r\nHost: " + live.Host + "\r\nContent-Length: 9000\r\n\r\n" + new string('d', 9000);
        Assert.Equal(413, Wire.Exchange(live.Port, hugeBody).Status);
        Assert.Equal(200, live.Get("/").Status);
    }

    [Fact(DisplayName = "AC-1406.4 정한 시간 안에 요청이 다 오지 않으면 408로 답하고 닫으며, 그동안 다른 연결은 막히지 않는다")]
    public void SlowRequestTimesOut()
    {
        using var live = new Live(readTimeout: TimeSpan.FromSeconds(3));
        using var slow = Wire.Connect(live.Port);
        Wire.Send(slow, "GET / HTTP/1.1\r\nHost: " + live.Host + "\r\n");
        var watch = Stopwatch.StartNew();

        Assert.Equal(200, live.Get("/").Status);
        Assert.False(slow.Client.Poll(0, SelectMode.SelectRead), "느린 연결에 벌써 답했다");

        var reply = Wire.Parse(Wire.ReadToEnd(slow, TimeSpan.FromSeconds(10)));
        Assert.Equal(408, reply.Status);
        Assert.True(watch.Elapsed >= TimeSpan.FromSeconds(2), $"너무 빨리 끊었다: {watch.Elapsed}");
        Assert.Equal(200, live.Get("/").Status);
    }

    [Fact(DisplayName = "AC-1406.4 연결만 하고 아무것도 보내지 않으면 정한 시간 뒤 답 없이 끊는다")]
    public void SilentConnectionClosed()
    {
        using var live = new Live(readTimeout: Short);
        using var silent = Wire.Connect(live.Port);
        var watch = Stopwatch.StartNew();
        var bytes = Wire.ReadToEnd(silent, TimeSpan.FromSeconds(10));
        Assert.Empty(bytes);
        Assert.True(watch.Elapsed >= TimeSpan.FromMilliseconds(400), $"너무 빨리 끊었다: {watch.Elapsed}");
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(8), $"끊지 않았다: {watch.Elapsed}");
        Wire.WaitUntil(() => live.Connections == 0, "닫은 연결이 남아 있다");
    }

    [Fact(DisplayName = "AC-1406.4 동시에 32개가 열려 있으면 33번째 연결만 답 없이 끊고, 앞 연결이 닫히면 다시 받는다(서버는 계속 돈다)")]
    public void ConnectionLimit()
    {
        using var live = new Live(readTimeout: TimeSpan.FromSeconds(20));
        var idle = new List<TcpClient>();
        try
        {
            for (var i = 0; i < 32; i++) idle.Add(Wire.Connect(live.Port));
            Wire.WaitUntil(() => live.Connections == 32, "32개를 받지 않았다");

            using (var extra = Wire.Connect(live.Port))
            {
                Wire.TrySend(extra, "GET / HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n");
                var bytes = Wire.ReadToEnd(extra, TimeSpan.FromSeconds(10));
                Assert.DoesNotContain("HTTP/1.1", Encoding.ASCII.GetString(bytes), StringComparison.Ordinal);
            }
            Assert.Equal(32, live.Connections);

            foreach (var client in idle.Take(4)) client.Close();
            Wire.WaitUntil(() => live.Connections <= 28, "닫힌 연결을 풀지 않았다");
            Assert.Equal(200, live.Get("/").Status);
        }
        finally
        {
            foreach (var client in idle) client.Close();
        }
        Wire.WaitUntil(() => live.Connections == 0, "닫은 연결이 남아 있다");
        var lines = live.Rig.LogLines();
        Assert.Contains(lines, line => line.Contains(" E-RECEPTION-BUSY "));
    }

    [Fact(DisplayName = "AC-1406.4 같은 문을 다른 프로그램이 쓰고 있으면 Start는 E-RECEPTION-PORT-BUSY로 멈추고 기록에 번호만 남긴다(다른 문으로 바꾸지 않는다)")]
    public void PortBusy()
    {
        var taken = new TcpListener(IPAddress.Loopback, 0);
        taken.Start();
        try
        {
            var port = ((IPEndPoint)taken.LocalEndpoint).Port;
            using var rig = new ServeRig();
            var server = new ReceptionServer(rig.Router, rig.Log);
            try
            {
                var error = Assert.ThrowsAny<HelperException>(() => server.Start(IPAddress.Loopback, port));
                Assert.Equal("E-RECEPTION-PORT-BUSY", error.Code);
                Assert.Equal("E-RECEPTION-PORT-BUSY", error.Message);
            }
            finally
            {
                server.Dispose();
            }
            var lines = rig.LogLines();
            Assert.Contains(lines, line => line.EndsWith(" - E-RECEPTION-PORT-BUSY 1", StringComparison.Ordinal));
            LogAssert.Clean(lines);
        }
        finally
        {
            taken.Stop();
        }
    }

    // ---- AC-1406.5 소켓 너머의 길 ------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.5 소켓 너머: / 는 화면 HTML(보안 머리·Connection: close), /api/board는 JSON, 없는 길 404, 다른 방법 405")]
    public void RoutesOverSocket()
    {
        using var live = new Live();
        var page = live.Get("/");
        Assert.Equal(200, page.Status);
        Assert.Equal("text/html; charset=utf-8", page.Header("Content-Type"));
        Assert.Equal("close", page.Header("Connection"));
        Assert.Equal("nosniff", page.Header("X-Content-Type-Options"));
        Assert.Equal(HttpResponseCsp, page.Header("Content-Security-Policy"));
        Assert.Equal(FakeStatic.BytesOf("reception/index.html"), page.Body);

        var board = live.Get("/api/board");
        Assert.Equal(200, board.Status);
        Assert.Contains("\"state\":\"ok\"", Encoding.UTF8.GetString(board.Body), StringComparison.Ordinal);

        Assert.Equal(404, live.Get("/nothing").Status);
        var post = Wire.Exchange(live.Port, "POST /api/board HTTP/1.1\r\nHost: " + live.Host + "\r\nContent-Length: 0\r\n\r\n");
        Assert.Equal(405, post.Status);
        Assert.Equal("GET", post.Header("Allow"));
        var options = Wire.Exchange(live.Port, "OPTIONS /api/xray HTTP/1.1\r\nHost: " + live.Host + "\r\nOrigin: http://evil.example\r\n\r\n");
        Assert.Equal(405, options.Status);
        Assert.Null(options.Header("Access-Control-Allow-Origin"));
    }

    [Fact(DisplayName = "AC-1406.5 소켓 너머: 비트를 볼 수 없으면 /api/board는 503 {\"state\":\"unavailable\"}이고, Host가 다른 이름이면 403이다")]
    public void UnavailableOverSocket()
    {
        using var live = new Live(registered: false);
        var reply = live.Get("/api/board");
        Assert.Equal(503, reply.Status);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(reply.Body));
        Assert.Equal(403, Wire.Exchange(live.Port, "GET / HTTP/1.1\r\nHost: evil.example:" + live.Port + "\r\n\r\n").Status);
    }

    [Fact(DisplayName = "AC-1406.5 소켓 너머: 진료보류 줄의 찍음 표시 POST /api/xray는 204, 같은 몸이라도 진료대기 줄이면 404다")]
    public void XrayOverSocket()
    {
        using var live = new Live();
        var hold = live.Rig.KeyOfChart("900102");
        var wait = live.Rig.KeyOfChart("900101");
        Assert.Equal(204, Wire.Exchange(live.Port, XrayRequest(live, hold)).Status);
        Assert.Equal(404, Wire.Exchange(live.Port, XrayRequest(live, wait)).Status);
        Assert.Equal("10:00", live.Rig.HoldXrayAt());
    }

    // ---- AC-1403.8 새로 고침 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.8 소켓 너머: /api/board는 8초 안이면 다시 읽지 않고, /api/board?fresh=1은 바로 읽으며, ?fresh=0은 404다")]
    public void FreshOverSocket()
    {
        using var live = new Live();
        Assert.Equal(200, live.Get("/api/board").Status);
        live.Rig.Clock.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(200, live.Get("/api/board").Status);
        Assert.Equal(1, live.Rig.BoardReads);
        Assert.Equal(200, live.Get("/api/board?fresh=1").Status);
        Assert.Equal(2, live.Rig.BoardReads);
        live.Rig.Clock.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(404, live.Get("/api/board?fresh=0").Status);
        Assert.Equal(2, live.Rig.BoardReads);
    }

    // ---- AC-1406.7 기록 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.7 소켓 너머의 431·400·408·403·503은 기록에 '시각 - 번호 건수'만 남기고 주소·경로·환자 글·예외 글이 없다")]
    public void ServerLogIsClean()
    {
        using var live = new Live(registered: false, readTimeout: TimeSpan.FromSeconds(1.5));
        Wire.Exchange(live.Port, "GET /api/visit/" + new string('9', 1200) + " HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n");
        Wire.Exchange(live.Port, "GET /가상환자01 HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n");
        Wire.Exchange(live.Port, "GET /api/board HTTP/1.1\r\nHost: 192.168.0.99:" + live.Port + "\r\n\r\n");
        Wire.Exchange(live.Port, "GET /api/board HTTP/1.1\r\nHost: " + live.Host + "\r\n\r\n");
        using (var slow = Wire.Connect(live.Port))
        {
            Wire.Send(slow, "GET /api/board?name=900101 HTTP/1.1\r\n");
            Wire.ReadToEnd(slow, TimeSpan.FromSeconds(10));
        }
        live.Server.Dispose();

        var lines = live.Rig.LogLines();
        foreach (var code in new[] { "E-RECEPTION-HTTP-431", "E-RECEPTION-HTTP-400", "E-RECEPTION-HTTP-408", "E-RECEPTION-HOST", BitErrors.NotRegistered })
            Assert.Contains(lines, line => line.Contains(" - " + code + " "));
        LogAssert.Clean(lines);
    }

    [Fact(DisplayName = "AC-1406.4 Dispose는 받기를 멈추고 열린 연결을 닫는다(다음 연결은 받지 않는다)")]
    public void DisposeStops()
    {
        var live = new Live();
        var port = live.Port;
        using var idle = Wire.Connect(port);
        Wire.WaitUntil(() => live.Connections == 1, "연결을 받지 않았다");
        live.Dispose();
        Assert.Empty(Wire.ReadToEnd(idle, TimeSpan.FromSeconds(5)));
        Assert.Equal(0, live.Server.Connections);
        Assert.ThrowsAny<SocketException>(() =>
        {
            using var late = new TcpClient();
            late.Connect(IPAddress.Loopback, port);
            Wire.Send(late, "GET / HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\n\r\n");
            if (Wire.ReadToEnd(late, TimeSpan.FromSeconds(3)).Length == 0) throw new SocketException((int)SocketError.ConnectionRefused);
        });
    }

    private const string HttpResponseCsp =
        "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

    private static string XrayRequest(Live live, string key)
    {
        var body = "{\"k\":\"" + key + "\",\"on\":true}";
        return "POST /api/xray HTTP/1.1\r\nHost: " + live.Host + "\r\nOrigin: http://" + live.Host + "\r\nX-Reception: 1\r\n"
            + "Content-Type: application/json\r\nContent-Length: " + Encoding.UTF8.GetByteCount(body) + "\r\n\r\n" + body;
    }
}

/// <summary>답 하나(상태 줄·머리·몸). 아무것도 오지 않았으면 Status 0.</summary>
internal sealed class Reply
{
    public Reply(int status, IReadOnlyDictionary<string, string> headers, byte[] body)
    {
        Status = status;
        Headers = headers;
        Body = body;
    }

    public int Status { get; }
    public IReadOnlyDictionary<string, string> Headers { get; }
    public byte[] Body { get; }

    public string? Header(string name) => Headers.TryGetValue(name, out var value) ? value : null;
}

/// <summary>시험 쪽 연결: 루프백에만 붙는다.</summary>
internal static class Wire
{
    public static TcpClient Connect(int port)
    {
        var client = new TcpClient { NoDelay = true };
        client.Connect(IPAddress.Loopback, port);
        return client;
    }

    public static void Send(TcpClient client, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        client.GetStream().Write(bytes, 0, bytes.Length);
        client.GetStream().Flush();
    }

    /// <summary>서버가 이미 끊었을 수 있는 연결에 보낸다(실패는 무시).</summary>
    public static void TrySend(TcpClient client, string text)
    {
        try
        {
            Send(client, text);
        }
        catch (IOException)
        {
        }
        catch (SocketException)
        {
        }
    }

    /// <summary>상대가 닫을 때까지 받은 바이트. 상대가 끊어 버리면(RST) 그때까지 받은 것. max 안에 닫지 않으면 실패.</summary>
    public static byte[] ReadToEnd(TcpClient client, TimeSpan max)
    {
        var buffer = new MemoryStream();
        var chunk = new byte[8192];
        var deadline = DateTime.UtcNow + max;
        while (true)
        {
            var left = deadline - DateTime.UtcNow;
            if (left <= TimeSpan.Zero) throw new XunitException("서버가 연결을 닫지 않았다");
            int n;
            try
            {
                if (!client.Client.Poll((int)Math.Min(left.TotalMilliseconds * 1000, 250_000), SelectMode.SelectRead)) continue;
                n = client.Client.Receive(chunk);
            }
            catch (SocketException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            if (n == 0) break;
            buffer.Write(chunk, 0, n);
        }
        return buffer.ToArray();
    }

    public static Reply Parse(byte[] bytes)
    {
        var text = Encoding.ASCII.GetString(bytes);
        var end = text.IndexOf("\r\n\r\n", StringComparison.Ordinal);
        if (bytes.Length == 0 || end < 0) return new Reply(0, new Dictionary<string, string>(), bytes);
        var lines = text.Substring(0, end).Split(new[] { "\r\n" }, StringSplitOptions.None);
        var status = int.Parse(lines[0].Split(' ')[1], System.Globalization.CultureInfo.InvariantCulture);
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var colon = line.IndexOf(':');
            headers[line.Substring(0, colon)] = line.Substring(colon + 1).Trim();
        }
        return new Reply(status, headers, bytes.Skip(end + 4).ToArray());
    }

    public static Reply Exchange(int port, string request)
    {
        using var client = Connect(port);
        TrySend(client, request);
        return Parse(ReadToEnd(client, TimeSpan.FromSeconds(15)));
    }

    public static void WaitUntil(Func<bool> condition, string message)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(10);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline) throw new XunitException(message);
            Thread.Sleep(20);
        }
    }
}
