using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using Precheck.Core.Reception.Http;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 HttpGate 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.HttpGate;

/// <summary>
/// 작은 웹 서버의 문 지키기(ClientGuard, design.md 7절, REQ-1406).
/// AC-1406.1 사설 IPv4(10/8·172.16/12·192.168/16)와 이 PC 자신(127/8·::1)만 받는다. IPv4가 섞인 IPv6(::ffff:a.b.c.d)는 풀어서 본다.
/// AC-1406.2 Host는 이 PC의 지금 사설 IPv4 하나 + :47200(이 PC 자신이면 127.0.0.1:47200·localhost:47200)만 받는다.
/// AC-1406.3 쓰기는 Origin = http://{Host}, X-Reception: 1, Content-Type: application/json, 몸이 읽기 한도(8192바이트, spec reception-arrange-tune AC-3603.5) 이하일 때만.
/// 주소는 모두 가짜(사설·문서용) 주소다.
/// </summary>
public class ClientGuardTests
{
    private const int Port = 47200;
    private static readonly IPAddress Phone = IPAddress.Parse("192.168.0.40");
    private static readonly IPAddress Self = IPAddress.Parse("127.0.0.1");
    private static readonly IReadOnlyList<IPAddress> Mine = new[] { IPAddress.Parse("192.168.0.23"), IPAddress.Parse("10.0.0.5") };

    // ---- AC-1406.1 보낸 쪽 주소 ----

    [Theory(DisplayName = "AC-1406.1 사설 IPv4와 이 PC 자신은 받는다(경계값 포함)")]
    [InlineData("10.0.0.0")]
    [InlineData("10.0.0.1")]
    [InlineData("10.255.255.255")]
    [InlineData("172.16.0.0")]
    [InlineData("172.16.0.1")]
    [InlineData("172.20.10.2")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.0.0")]
    [InlineData("192.168.0.40")]
    [InlineData("192.168.255.255")]
    [InlineData("127.0.0.1")]
    [InlineData("127.0.0.0")]
    [InlineData("127.255.255.255")]
    [InlineData("::1")]
    public void AcceptsPrivate(string address)
    {
        Assert.True(ClientGuard.IsPrivateClient(IPAddress.Parse(address)), address);
    }

    [Theory(DisplayName = "AC-1406.1 IPv4가 섞인 IPv6(::ffff:a.b.c.d)는 풀어서 사설·이 PC면 받는다")]
    [InlineData("::ffff:192.168.0.40")]
    [InlineData("::ffff:10.1.2.3")]
    [InlineData("::ffff:172.31.0.9")]
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::ffff:c0a8:0028")]
    public void AcceptsMappedPrivate(string address)
    {
        Assert.True(ClientGuard.IsPrivateClient(IPAddress.Parse(address)), address);
    }

    [Theory(DisplayName = "AC-1406.1 그 밖의 주소는 받지 않는다(172.15·172.32·169.254·공인·특수·IPv6)")]
    [InlineData("172.15.255.255")]
    [InlineData("172.32.0.0")]
    [InlineData("172.0.0.1")]
    [InlineData("169.254.0.1")]
    [InlineData("169.254.255.254")]
    [InlineData("9.255.255.255")]
    [InlineData("11.0.0.0")]
    [InlineData("192.167.255.255")]
    [InlineData("192.169.0.0")]
    [InlineData("8.8.8.8")]
    [InlineData("203.0.113.7")]
    [InlineData("100.64.0.1")]
    [InlineData("0.0.0.0")]
    [InlineData("255.255.255.255")]
    [InlineData("224.0.0.251")]
    [InlineData("126.255.255.255")]
    [InlineData("128.0.0.1")]
    [InlineData("::ffff:8.8.8.8")]
    [InlineData("::ffff:169.254.0.1")]
    [InlineData("::ffff:172.32.0.1")]
    [InlineData("::ffff:172.15.0.1")]
    [InlineData("::")]
    [InlineData("::2")]
    [InlineData("::10.0.0.1")]
    [InlineData("::127.0.0.1")]
    [InlineData("64:ff9b::a00:1")]
    [InlineData("fe80::1")]
    [InlineData("fc00::1")]
    [InlineData("fd12:3456:789a::1")]
    [InlineData("2001:db8::1")]
    [InlineData("::ffff:0:a00:1")]
    public void RejectsOthers(string address)
    {
        Assert.False(ClientGuard.IsPrivateClient(IPAddress.Parse(address)), address);
    }

    [Fact(DisplayName = "AC-1406.1 주소가 없으면(null) 받지 않는다")]
    public void RejectsNull()
    {
        Assert.False(ClientGuard.IsPrivateClient(null!));
    }

    // ---- AC-1406.2 Host ----

    [Theory(DisplayName = "AC-1406.2 이 PC의 지금 사설 IPv4 하나 + :47200이면 받는다")]
    [InlineData("192.168.0.23:47200")]
    [InlineData("10.0.0.5:47200")]
    public void HostMine(string host)
    {
        Assert.True(ClientGuard.HostOk(host, Phone, Mine, Port), host);
        Assert.True(ClientGuard.HostOk(host, Self, Mine, Port), host);
    }

    [Theory(DisplayName = "AC-1406.2 이 PC 자신(루프백)에서 온 요청은 127.0.0.1:47200·localhost:47200도 받는다")]
    [InlineData("127.0.0.1", "127.0.0.1:47200")]
    [InlineData("127.0.0.1", "localhost:47200")]
    [InlineData("127.0.0.1", "LocalHost:47200")]
    [InlineData("127.0.0.2", "127.0.0.1:47200")]
    [InlineData("::1", "localhost:47200")]
    [InlineData("::ffff:127.0.0.1", "127.0.0.1:47200")]
    public void HostLoopback(string client, string host)
    {
        Assert.True(ClientGuard.HostOk(host, IPAddress.Parse(client), Mine, Port), host);
    }

    [Theory(DisplayName = "AC-1406.2 휴대폰(다른 기기)이 127.0.0.1·localhost라고 보내면 받지 않는다")]
    [InlineData("127.0.0.1:47200")]
    [InlineData("localhost:47200")]
    public void LoopbackNamesFromPhone(string host)
    {
        Assert.False(ClientGuard.HostOk(host, Phone, Mine, Port), host);
    }

    [Theory(DisplayName = "AC-1406.2 다른 이름·다른 문·다른 모양의 Host는 받지 않는다(주소 바꿔 끼우기 막기)")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("192.168.0.23")]
    [InlineData("192.168.0.23:")]
    [InlineData("192.168.0.23:80")]
    [InlineData("192.168.0.23:8080")]
    [InlineData("192.168.0.23:047200")]
    [InlineData("192.168.0.23:47200:47200")]
    [InlineData("192.168.0.23:47200 ")]
    [InlineData(" 192.168.0.23:47200")]
    [InlineData("192.168.0.24:47200")]
    [InlineData("192.168.0.40:47200")]
    [InlineData("192.168.000.023:47200")]
    [InlineData("0xc0.0xa8.0.23:47200")]
    [InlineData("3232235543:47200")]
    [InlineData("192.168.0.23.:47200")]
    [InlineData("192.168.0.23.nip.io:47200")]
    [InlineData("evil.example:47200")]
    [InlineData("rebind.evil.example:47200")]
    [InlineData("user@192.168.0.23:47200")]
    [InlineData("[::ffff:192.168.0.23]:47200")]
    [InlineData("[::1]:47200")]
    [InlineData(":47200")]
    [InlineData("192.168.0.23:47200, evil.example:47200")]
    public void HostOthers(string? host)
    {
        Assert.False(ClientGuard.HostOk(host, Phone, Mine, Port), host ?? "(null)");
        Assert.False(ClientGuard.HostOk(host, Self, Mine, Port), host ?? "(null)");
    }

    [Fact(DisplayName = "AC-1406.2 이 PC 주소 목록에서 사설이 아니거나 IPv4가 아닌 것은 Host로 받지 않고, 섞인 IPv6는 풀어서 본다")]
    public void MineFiltering()
    {
        var mixed = new[] { IPAddress.Parse("8.8.8.8"), IPAddress.Parse("fe80::1"), IPAddress.Parse("::ffff:192.168.0.23"), IPAddress.Parse("127.0.0.1") };
        Assert.False(ClientGuard.HostOk("8.8.8.8:47200", Phone, mixed, Port));
        Assert.False(ClientGuard.HostOk("fe80::1:47200", Phone, mixed, Port));
        Assert.False(ClientGuard.HostOk("127.0.0.1:47200", Phone, mixed, Port));
        Assert.True(ClientGuard.HostOk("192.168.0.23:47200", Phone, mixed, Port));
    }

    [Fact(DisplayName = "AC-1406.2 지금 주소 목록만 본다: 주소가 바뀌면 옛 주소 Host는 떨어지고 목록이 비면 휴대폰은 모두 떨어진다")]
    public void FollowsCurrentAddresses()
    {
        var before = new[] { IPAddress.Parse("192.168.0.23") };
        var after = new[] { IPAddress.Parse("192.168.0.31") };
        Assert.True(ClientGuard.HostOk("192.168.0.23:47200", Phone, before, Port));
        Assert.False(ClientGuard.HostOk("192.168.0.23:47200", Phone, after, Port));
        Assert.True(ClientGuard.HostOk("192.168.0.31:47200", Phone, after, Port));
        Assert.False(ClientGuard.HostOk("192.168.0.31:47200", Phone, new IPAddress[0], Port));
        Assert.True(ClientGuard.HostOk("localhost:47200", Self, new IPAddress[0], Port));
    }

    [Fact(DisplayName = "AC-1406.2 문 번호는 받은 값과 견준다(다른 문 번호로 열면 그 번호만 받는다)")]
    public void PortParameter()
    {
        Assert.True(ClientGuard.HostOk("192.168.0.23:50000", Phone, Mine, 50000));
        Assert.False(ClientGuard.HostOk("192.168.0.23:47200", Phone, Mine, 50000));
    }

    [Fact(DisplayName = "AC-1406.2 보낸 쪽 주소나 주소 목록이 없으면 받지 않는다")]
    public void HostNullArguments()
    {
        Assert.False(ClientGuard.HostOk("192.168.0.23:47200", null!, Mine, Port));
        Assert.False(ClientGuard.HostOk("192.168.0.23:47200", Phone, null!, Port));
    }

    // ---- AC-1406.3 쓰기 요청 ----

    private static HttpRequest Parse(string raw)
    {
        var request = HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes(raw)), TimeSpan.FromSeconds(5));
        Assert.NotNull(request);
        return request!;
    }

    private const string Body = "{\"visit\":\"0123456789abcdef\",\"on\":true}";

    /// <summary>바른 쓰기 요청에서 머리 하나를 바꾸거나(값) 빼서(null) 만든다</summary>
    private static HttpRequest Write(string? origin = "http://192.168.0.23:47200", string? reception = "1", string? contentType = "application/json",
        string method = "POST", string? host = "192.168.0.23:47200", string body = Body, string? extra = null)
    {
        var text = new StringBuilder(method).Append(" /api/xray HTTP/1.1\r\n");
        if (host != null) text.Append("Host: ").Append(host).Append("\r\n");
        if (origin != null) text.Append("Origin: ").Append(origin).Append("\r\n");
        if (reception != null) text.Append("X-Reception: ").Append(reception).Append("\r\n");
        if (contentType != null) text.Append("Content-Type: ").Append(contentType).Append("\r\n");
        if (extra != null) text.Append(extra).Append("\r\n");
        text.Append("Content-Length: ").Append(Encoding.ASCII.GetByteCount(body)).Append("\r\n\r\n").Append(body);
        return Parse(text.ToString());
    }

    [Fact(DisplayName = "AC-1406.3 Origin = http://{Host}, X-Reception: 1, Content-Type: application/json, 몸 8192바이트 이하면 쓰기를 받는다")]
    public void WriteAccepted()
    {
        Assert.True(ClientGuard.WriteOk(Write()));
        Assert.True(ClientGuard.WriteOk(Write(origin: "http://localhost:47200", host: "localhost:47200")));
        Assert.True(ClientGuard.WriteOk(Write(body: new string('x', 8192))));
        Assert.True(ClientGuard.WriteOk(Write(body: "")));
    }

    [Theory(DisplayName = "AC-1406.3 Content-Type은 application/json이어야 한다(대소문자·charset 덧붙임은 받음)")]
    [InlineData("application/json; charset=utf-8")]
    [InlineData("Application/JSON")]
    [InlineData("application/json;charset=UTF-8")]
    public void WriteJsonVariants(string contentType)
    {
        Assert.True(ClientGuard.WriteOk(Write(contentType: contentType)), contentType);
    }

    [Theory(DisplayName = "AC-1406.3 Origin이 http://{Host}가 아니면 쓰기를 받지 않는다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("null")]
    [InlineData("http://evil.example")]
    [InlineData("http://evil.example:47200")]
    [InlineData("https://192.168.0.23:47200")]
    [InlineData("http://192.168.0.23:47200/")]
    [InlineData("http://192.168.0.23")]
    [InlineData("http://192.168.0.24:47200")]
    [InlineData("192.168.0.23:47200")]
    [InlineData("http://192.168.0.23:47200.evil.example")]
    public void WriteBadOrigin(string? origin)
    {
        Assert.False(ClientGuard.WriteOk(Write(origin: origin)), origin ?? "(null)");
    }

    [Theory(DisplayName = "AC-1406.3 X-Reception: 1이 없으면 쓰기를 받지 않는다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0")]
    [InlineData("true")]
    [InlineData("11")]
    public void WriteBadReceptionHeader(string? value)
    {
        Assert.False(ClientGuard.WriteOk(Write(reception: value)), value ?? "(null)");
    }

    [Theory(DisplayName = "AC-1406.3 Content-Type이 application/json이 아니면(다른 사이트 폼이 보낼 수 있는 것 포함) 쓰기를 받지 않는다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("text/plain")]
    [InlineData("text/plain; application/json")]
    [InlineData("application/x-www-form-urlencoded")]
    [InlineData("multipart/form-data; boundary=x")]
    [InlineData("application/jsonp")]
    [InlineData("application/json-patch+json")]
    [InlineData("text/json")]
    public void WriteBadContentType(string? contentType)
    {
        Assert.False(ClientGuard.WriteOk(Write(contentType: contentType)), contentType ?? "(null)");
    }

    [Fact(DisplayName = "AC-1406.3 같은 머리가 두 번 오면(이어 붙은 값) 쓰기를 받지 않는다")]
    public void WriteDuplicates()
    {
        Assert.False(ClientGuard.WriteOk(Write(extra: "X-Reception: 1")));
        Assert.False(ClientGuard.WriteOk(Write(extra: "Origin: http://192.168.0.23:47200")));
        Assert.False(ClientGuard.WriteOk(Write(extra: "Content-Type: application/json")));
    }

    [Fact(DisplayName = "AC-1406.3 Host가 없으면 쓰기를 받지 않는다")]
    public void WriteNoHost()
    {
        Assert.False(ClientGuard.WriteOk(Write(host: null)));
        Assert.False(ClientGuard.WriteOk(Write(host: null, origin: "http://")));
    }

    [Theory(DisplayName = "AC-1406.3 POST가 아니면(사전 확인 OPTIONS 포함) 쓰기 검사를 받지 않는다")]
    [InlineData("GET")]
    [InlineData("OPTIONS")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public void WriteNotPost(string method)
    {
        Assert.False(ClientGuard.WriteOk(Write(method: method)), method);
    }

    [Fact(DisplayName = "AC-1406.3 몸이 8192바이트를 넘으면(직접 만든 요청) 쓰기를 받지 않는다")]
    public void WriteBodyTooLarge()
    {
        var headers = new Dictionary<string, string>
        {
            ["Host"] = "192.168.0.23:47200",
            ["Origin"] = "http://192.168.0.23:47200",
            ["X-Reception"] = "1",
            ["Content-Type"] = "application/json",
        };
        Assert.True(ClientGuard.WriteOk(new HttpRequest("POST", "/api/lists", headers, new byte[8192])));
        Assert.False(ClientGuard.WriteOk(new HttpRequest("POST", "/api/lists", headers, new byte[8193])));
        Assert.False(ClientGuard.WriteOk(null!));
    }
}

/// <summary>
/// 작은 웹 서버의 답(HttpResponse, design.md 7절).
/// AC-1406.6 모든 답에 CSP·nosniff·no-referrer·no-store·Connection: close가 있다.
/// AC-1406.3 어떤 답에도 CORS 머리(Access-Control-*)가 없고, OPTIONS에 쓰는 405는 Allow만 단다.
/// </summary>
public class HttpResponseTests
{
    private const string Csp = "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

    private static readonly (string Name, string Value)[] Security =
    {
        ("Content-Security-Policy", Csp),
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "no-referrer"),
        ("Cache-Control", "no-store"),
        ("Connection", "close"),
    };

    private sealed class Wire
    {
        public string StatusLine = "";
        public List<(string Name, string Value)> Headers = new List<(string Name, string Value)>();
        public byte[] Body = new byte[0];

        public string? Get(string name) => Headers.Where(h => string.Equals(h.Name, name, StringComparison.OrdinalIgnoreCase)).Select(h => h.Value).SingleOrDefault();
    }

    /// <summary>답 바이트를 상태 줄·머리·몸으로 나눈다. 줄 끝은 모두 CRLF여야 한다</summary>
    private static Wire Split(byte[] bytes)
    {
        var end = -1;
        for (var i = 0; i + 3 < bytes.Length; i++)
        {
            if (bytes[i] == '\r' && bytes[i + 1] == '\n' && bytes[i + 2] == '\r' && bytes[i + 3] == '\n') { end = i; break; }
        }
        Assert.True(end > 0, "머리 끝(빈 줄)이 없다");
        var head = Encoding.ASCII.GetString(bytes, 0, end);
        Assert.DoesNotContain("\n", head.Replace("\r\n", ""));
        Assert.DoesNotContain("\r", head.Replace("\r\n", ""));
        var lines = head.Split(new[] { "\r\n" }, StringSplitOptions.None);
        var wire = new Wire { StatusLine = lines[0], Body = bytes.Skip(end + 4).ToArray() };
        foreach (var line in lines.Skip(1))
        {
            var colon = line.IndexOf(": ", StringComparison.Ordinal);
            Assert.True(colon > 0, "머리 줄 모양이 틀렸다: " + line);
            wire.Headers.Add((line.Substring(0, colon), line.Substring(colon + 2)));
        }
        return wire;
    }

    private static void AssertSecure(HttpResponse response)
    {
        var wire = Split(response.ToBytes());
        foreach (var (name, value) in Security)
        {
            Assert.Single(wire.Headers, h => h.Name == name);
            Assert.Equal(value, wire.Get(name));
            Assert.Equal(value, response.Header(name));
        }
        Assert.DoesNotContain(wire.Headers, h => h.Name.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(response.Headers, h => h.Key.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(wire.Headers.Count, wire.Headers.Select(h => h.Name.ToLowerInvariant()).Distinct().Count());
        Assert.Equal(wire.Headers, response.Headers.Select(h => (h.Key, h.Value)));
        Assert.Equal(response.Body, wire.Body);
    }

    [Fact(DisplayName = "AC-1406.6 CSP 값은 명세 그대로이고 보안 머리 다섯 개를 이 순서로 단다")]
    public void SecurityHeaderValues()
    {
        Assert.Equal(Csp, HttpResponse.ContentSecurityPolicy);
        Assert.Equal(Security, HttpResponse.SecurityHeaders.Select(h => (h.Key, h.Value)));
    }

    [Theory(DisplayName = "AC-1406.6 몸 없는 답(오류·204 포함) 모두에 보안 머리가 있다")]
    [InlineData(200, "200 OK")]
    [InlineData(204, "204 No Content")]
    [InlineData(400, "400 Bad Request")]
    [InlineData(403, "403 Forbidden")]
    [InlineData(404, "404 Not Found")]
    [InlineData(405, "405 Method Not Allowed")]
    [InlineData(408, "408 Request Timeout")]
    [InlineData(413, "413 Content Too Large")]
    [InlineData(431, "431 Request Header Fields Too Large")]
    [InlineData(500, "500 Internal Server Error")]
    [InlineData(503, "503 Service Unavailable")]
    public void EmptyResponses(int status, string statusText)
    {
        var response = HttpResponse.Empty(status);
        Assert.Equal(status, response.Status);
        Assert.Null(response.ContentType);
        Assert.Empty(response.Body);
        AssertSecure(response);
        var wire = Split(response.ToBytes());
        Assert.Equal("HTTP/1.1 " + statusText, wire.StatusLine);
        Assert.Null(wire.Get("Content-Type"));
        if (status == 204) Assert.Null(wire.Get("Content-Length"));
        else Assert.Equal("0", wire.Get("Content-Length"));
    }

    [Fact(DisplayName = "AC-1406.6 JSON 답: UTF-8 바이트 수가 Content-Length이고 보안 머리가 있다")]
    public void JsonResponse()
    {
        var json = "{\"rows\":[{\"name\":\"가상환자01\",\"chart\":\"912345\"}]}";
        var response = HttpResponse.Json(json);
        Assert.Equal(200, response.Status);
        Assert.Equal("application/json; charset=utf-8", response.ContentType);
        Assert.Equal(Encoding.UTF8.GetBytes(json), response.Body);
        AssertSecure(response);
        var wire = Split(response.ToBytes());
        Assert.Equal("HTTP/1.1 200 OK", wire.StatusLine);
        Assert.Equal("application/json; charset=utf-8", wire.Get("Content-Type"));
        Assert.Equal(Encoding.UTF8.GetByteCount(json).ToString(), wire.Get("Content-Length"));
        Assert.Equal(json, Encoding.UTF8.GetString(wire.Body));

        var unavailable = HttpResponse.Json("{\"unavailable\":true}", 503);
        Assert.Equal("HTTP/1.1 503 Service Unavailable", Split(unavailable.ToBytes()).StatusLine);
        AssertSecure(unavailable);
    }

    [Fact(DisplayName = "AC-1406.6 화면 파일 답(바이트·형식)에도 보안 머리가 있다")]
    public void BytesResponse()
    {
        var css = Encoding.UTF8.GetBytes(":root { --lime: var(--x); }");
        var response = HttpResponse.Bytes("text/css; charset=utf-8", css);
        Assert.Equal("text/css; charset=utf-8", response.ContentType);
        AssertSecure(response);
        var wire = Split(response.ToBytes());
        Assert.Equal("text/css; charset=utf-8", wire.Get("Content-Type"));
        Assert.Equal(css.Length.ToString(), wire.Get("Content-Length"));

        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF };
        var image = HttpResponse.Bytes("image/png", png);
        AssertSecure(image);
        Assert.Equal(png, Split(image.ToBytes()).Body);
    }

    [Fact(DisplayName = "AC-1406.3 OPTIONS에 쓰는 405는 Allow만 달고 CORS 머리가 없다(보안 머리는 있다)")]
    public void NotAllowed()
    {
        var response = HttpResponse.NotAllowed("GET", "POST");
        Assert.Equal(405, response.Status);
        AssertSecure(response);
        var wire = Split(response.ToBytes());
        Assert.Equal("HTTP/1.1 405 Method Not Allowed", wire.StatusLine);
        Assert.Equal("GET, POST", wire.Get("Allow"));
        Assert.Equal("0", wire.Get("Content-Length"));
        Assert.Throws<ArgumentException>(() => HttpResponse.NotAllowed());
        Assert.Throws<ArgumentException>(() => HttpResponse.NotAllowed("GET\r\nAccess-Control-Allow-Origin: *"));
        Assert.Throws<ArgumentException>(() => HttpResponse.NotAllowed("get"));
    }

    [Fact(DisplayName = "AC-1406.6 WriteTo는 ToBytes와 같은 바이트를 쓴다")]
    public void WriteToMatchesBytes()
    {
        var response = HttpResponse.Json("{\"ok\":true}");
        using var stream = new MemoryStream();
        response.WriteTo(stream);
        Assert.Equal(response.ToBytes(), stream.ToArray());
    }

    [Fact(DisplayName = "AC-1406.6 형식 글에 줄바꿈·제어 글자를 넣어 머리를 더할 수 없고, 정하지 않은 상태 번호·204의 몸은 거절한다")]
    public void RejectsInjection()
    {
        Assert.Throws<ArgumentException>(() => HttpResponse.Bytes("text/html\r\nAccess-Control-Allow-Origin: *", new byte[0]));
        Assert.Throws<ArgumentException>(() => HttpResponse.Bytes("text/html\nX: y", new byte[0]));
        Assert.Throws<ArgumentException>(() => HttpResponse.Bytes("text/\u0000html", new byte[0]));
        Assert.Throws<ArgumentException>(() => HttpResponse.Bytes("", new byte[0]));
        Assert.Throws<ArgumentNullException>(() => HttpResponse.Bytes("text/css", null!));
        Assert.Throws<ArgumentNullException>(() => HttpResponse.Json(null!));
        Assert.Throws<ArgumentOutOfRangeException>(() => HttpResponse.Empty(299));
        Assert.Throws<ArgumentOutOfRangeException>(() => HttpResponse.Empty(302));
        Assert.Throws<ArgumentOutOfRangeException>(() => HttpResponse.Json("{}", 0));
        Assert.Throws<ArgumentException>(() => HttpResponse.Bytes("text/plain", new byte[] { 1 }, 204));
    }
}
