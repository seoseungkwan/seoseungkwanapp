using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Tests.Protocol;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Serve 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Serve;

/// <summary>
/// 환자 자료는 의원 안에서만(REQ-1413). 접수 현황 프로그램 글자(helper/src/Precheck.Core/Reception/**, 생기면 helper/src/Precheck.Reception/**)에
/// 비트 DB 말고 바깥으로 나가는 연결 API가 없다(AC-1413.1). 서버는 받기만 한다(TcpListener + 받은 소켓). 바깥으로 붙는 길(HTTP 부르기·
/// 웹 부르기·TCP·UDP 붙기·소켓 만들어 붙기·이름 풀기·웹소켓·메일)이 글자에 나오면 떨어진다.
/// </summary>
public class ReceptionTextTests
{
    private static readonly (string Name, Regex Pattern)[] Outbound =
    {
        ("HttpClient", new Regex(@"\bHttpClient\b")),
        ("HttpMessageHandler", new Regex(@"\b(HttpMessageHandler|SocketsHttpHandler|HttpClientHandler)\b")),
        ("System.Net.Http", new Regex(@"\bSystem\.Net\.Http\b")),
        ("WebClient", new Regex(@"\bWebClient\b")),
        ("WebRequest", new Regex(@"\b(Http|Ftp|File)?WebRequest\b")),
        ("TcpClient", new Regex(@"\bTcpClient\b")),
        ("UdpClient", new Regex(@"\bUdpClient\b")),
        ("WebSocket", new Regex(@"\b(Client)?WebSocket\b")),
        ("SmtpClient", new Regex(@"\bSmtpClient\b")),
        ("Dns", new Regex(@"\bDns\s*\.")),
        ("Connect", new Regex(@"\.\s*(Connect|ConnectAsync|BeginConnect)\s*\(")),
        ("new Socket", new Regex(@"\bnew\s+Socket\s*\(")),
    };

    private static IEnumerable<string> Roots()
    {
        yield return Repo.PathOf("helper", "src", "Precheck.Core", "Reception");
        var app = Repo.PathOf("helper", "src", "Precheck.Reception");
        if (Directory.Exists(app)) yield return app;
    }

    private static string[] SourceFiles() =>
        Roots()
            .SelectMany(root => Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories))
            .Where(file => !file.Split(Path.DirectorySeparatorChar, '/').Any(part => part == "bin" || part == "obj"))
            .OrderBy(file => file, StringComparer.Ordinal)
            .ToArray();

    private static IEnumerable<string> Hits(string text) =>
        Outbound.Where(rule => rule.Pattern.IsMatch(text)).Select(rule => rule.Name);

    [Fact(DisplayName = "AC-1413.1 접수 현황 프로그램 글자(Precheck.Core/Reception/**, Precheck.Reception/**)에 바깥으로 나가는 연결 API가 없다")]
    public void NoOutboundConnections()
    {
        var files = SourceFiles();
        var names = files.Select(file => Path.GetFileName(file)).ToArray();
        Assert.Contains("ReceptionServer.cs", names);
        Assert.Contains("ReceptionRouter.cs", names);
        Assert.Contains("StaticFiles.cs", names);
        Assert.Contains("ReceptionLog.cs", names);

        var problems = new List<string>();
        foreach (var file in files)
        {
            var text = File.ReadAllText(file, Encoding.UTF8);
            foreach (var hit in Hits(text)) problems.Add(Path.GetFileName(file) + ": " + hit);
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact(DisplayName = "AC-1413.1 서버는 받기만 한다: ReceptionServer.cs는 TcpListener로 받은 소켓만 쓴다")]
    public void ServerOnlyListens()
    {
        var server = SourceFiles().Single(file => Path.GetFileName(file) == "ReceptionServer.cs");
        var text = File.ReadAllText(server, Encoding.UTF8);
        Assert.Contains("TcpListener", text, StringComparison.Ordinal);
        Assert.Empty(Hits(text));
    }

    [Theory(DisplayName = "AC-1413.1 살피기 규칙은 바깥 연결 글자를 잡는다(규칙이 헛돌지 않는다)")]
    [InlineData("using var http = new HttpClient();")]
    [InlineData("using System.Net.Http;")]
    [InlineData("var web = new WebClient();")]
    [InlineData("var r = (HttpWebRequest)WebRequest.Create(url);")]
    [InlineData("var tcp = new TcpClient(\"example.com\", 80);")]
    [InlineData("var udp = new UdpClient();")]
    [InlineData("socket.Connect(endPoint);")]
    [InlineData("await socket.ConnectAsync(host, 443);")]
    [InlineData("var s = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);")]
    [InlineData("var ip = Dns.GetHostAddresses(name);")]
    [InlineData("var ws = new ClientWebSocket();")]
    public void RulesCatchOutbound(string line)
    {
        Assert.NotEmpty(Hits(line));
    }

    [Theory(DisplayName = "AC-1413.1 받기만 하는 글자(TcpListener·AcceptSocket·IPAddress)는 잡지 않는다")]
    [InlineData("var listener = new TcpListener(IPAddress.Any, ReceptionPorts.Http);")]
    [InlineData("var socket = listener.AcceptSocket();")]
    [InlineData("socket.Shutdown(SocketShutdown.Send);")]
    public void RulesAllowListening(string line)
    {
        Assert.Empty(Hits(line));
    }
}
