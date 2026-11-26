using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Sheet;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Sheet;

/// <summary>
/// 수납 구글 시트의 윈도우 부분(spec google-link TASK-10, AC-8511.2·AC-8511.3): 진짜 HTTP(HttpWebRequest, 넘김을 따라가지 않음, 남은 시간 한도)와
/// sheet.dat 실제 DPAPI 왕복. 진짜 구글에는 붙지 않는다 — 이 PC 안 127.0.0.1의 작은 가짜 서버(TcpListener)만 쓴다. 비밀 글자·주소는 지어낸 것이다.
/// </summary>
public class SheetWindowsTests
{
    private const string Secret = "FAKEsecretFAKEsecretFAKEsecret0123456789abc";

    /// <summary>요청 하나를 받아 정해 둔 답을 쓰는 가짜 서버. 받은 요청 글을 모아 둔다.</summary>
    private sealed class OneShotServer : IDisposable
    {
        private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        private readonly Task serving;

        public OneShotServer(string response, TimeSpan delay = default, int requests = 1)
        {
            listener.Start();
            serving = Task.Run(() =>
            {
                for (var i = 0; i < requests; i++)
                {
                    using var client = listener.AcceptTcpClient();
                    using var stream = client.GetStream();
                    Received.Add(ReadRequest(stream));
                    if (delay > TimeSpan.Zero) Thread.Sleep(delay);
                    var bytes = Encoding.UTF8.GetBytes(response);
                    try
                    {
                        stream.Write(bytes, 0, bytes.Length);
                    }
                    catch (IOException)
                    {
                        // 받는 쪽이 시간이 지나 끊었다
                    }
                }
            });
        }

        public List<string> Received { get; } = new List<string>();

        public string Url(string path = "/exec") => "http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port + path;

        private static string ReadRequest(NetworkStream stream)
        {
            var head = new List<byte>();
            while (!(head.Count >= 4 && head[head.Count - 4] == '\r' && head[head.Count - 3] == '\n' && head[head.Count - 2] == '\r' && head[head.Count - 1] == '\n'))
            {
                var b = stream.ReadByte();
                if (b < 0) break;
                head.Add((byte)b);
            }
            var text = Encoding.ASCII.GetString(head.ToArray());
            var length = text.Split('\n').Select(l => l.Trim()).Where(l => l.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                .Select(l => int.Parse(l.Substring("Content-Length:".Length).Trim(), System.Globalization.CultureInfo.InvariantCulture)).FirstOrDefault();
            var body = new byte[length];
            var read = 0;
            while (read < length)
            {
                var n = stream.Read(body, read, length - read);
                if (n <= 0) break;
                read += n;
            }
            return text + Encoding.UTF8.GetString(body, 0, read);
        }

        public void Dispose()
        {
            listener.Stop();
            try
            {
                serving.Wait(TimeSpan.FromSeconds(5));
            }
            catch (AggregateException)
            {
                // 멈춘 서버
            }
        }
    }

    private static string Response(int status, string reason, string body = "", string? location = null) =>
        "HTTP/1.1 " + status + " " + reason + "\r\n"
        + (location != null ? "Location: " + location + "\r\n" : "")
        + "Content-Type: application/json; charset=utf-8\r\nContent-Length: " + Encoding.UTF8.GetByteCount(body) + "\r\nConnection: close\r\n\r\n" + body;

    [Fact(DisplayName = "AC-8511.3 SheetHttpTransport: POST는 JSON(UTF-8)으로 한 번, 302는 따라가지 않고 Location을 돌려준다")]
    public void PostDoesNotFollowRedirect()
    {
        using var server = new OneShotServer(Response(302, "Found", "", "https://script.googleusercontent.com/macros/echo?user_content_key=FAKE"));
        var transport = new SheetHttpTransport(() => TimeSpan.FromSeconds(10));

        var reply = transport.Send("POST", server.Url(), "{\"action\":\"hello\",\"nonce\":\"가상\"}");

        Assert.Equal(302, reply.Status);
        Assert.Equal("https://script.googleusercontent.com/macros/echo?user_content_key=FAKE", reply.Location);
        var request = Assert.Single(server.Received);
        Assert.StartsWith("POST /exec HTTP/1.1", request, StringComparison.Ordinal);
        Assert.Contains("Content-Type: application/json; charset=utf-8", request, StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith("{\"action\":\"hello\",\"nonce\":\"가상\"}", request, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-8511.3 SheetHttpTransport: GET 200 답 글을 UTF-8로 읽고, 500도 던지지 않고 번호로 돌려준다")]
    public void GetReadsBody()
    {
        using (var server = new OneShotServer(Response(200, "OK", "{\"ok\":true,\"templateTitle\":\"가짜 원본\"}")))
        {
            var reply = new SheetHttpTransport(() => TimeSpan.FromSeconds(10)).Send("GET", server.Url("/echo"), null);
            Assert.Equal(200, reply.Status);
            Assert.Equal("{\"ok\":true,\"templateTitle\":\"가짜 원본\"}", reply.Body);
            Assert.StartsWith("GET /echo HTTP/1.1", Assert.Single(server.Received), StringComparison.Ordinal);
        }
        using (var server = new OneShotServer(Response(500, "Internal Server Error", "oops")))
        {
            Assert.Equal(500, new SheetHttpTransport(() => TimeSpan.FromSeconds(10)).Send("GET", server.Url(), null).Status);
        }
    }

    [Fact(DisplayName = "AC-8511.4 SheetHttpTransport: 남은 시간 안에 답이 없으면 E-GSHEET-TIMEOUT, 남은 시간이 없으면 연결하지 않는다")]
    public void TimesOut()
    {
        using (var server = new OneShotServer(Response(200, "OK", "{}"), TimeSpan.FromSeconds(3)))
        {
            var e = Assert.Throws<SheetException>(() => new SheetHttpTransport(() => TimeSpan.FromMilliseconds(500)).Send("GET", server.Url(), null));
            Assert.Equal(SheetErrors.Timeout, e.Code);
        }
        Assert.Equal(SheetErrors.Timeout, Assert.Throws<SheetException>(() => new SheetHttpTransport(() => TimeSpan.Zero).Send("GET", "http://127.0.0.1:9/exec", null)).Code);
    }

    [Fact(DisplayName = "AC-8511.4 SheetHttpTransport: 연결이 안 되면 E-GSHEET-NET")]
    public void RefusedIsNet()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        var e = Assert.Throws<SheetException>(() => new SheetHttpTransport(() => TimeSpan.FromSeconds(5)).Send("GET", "http://127.0.0.1:" + port + "/exec", null));
        Assert.Equal(SheetErrors.Net, e.Code);
    }

    [Fact(DisplayName = "AC-8511.2 sheet.dat를 실제 DPAPI(CurrentUser + 도우미 저장 entropy)로 왕복하면 같고, 파일에는 머리만 보이고 비밀 글자·주소가 없다")]
    public void SheetDatRoundTrip()
    {
        var folder = Path.Combine(Path.GetTempPath(), "precheck-sheet-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new SheetStore(folder, new DpapiProtector());
            const string Url = "https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec";
            store.Save(new SheetState { Secret = Secret, Url = Url, ShareWith = new List<string> { "desk@fake.test" }, Verified = true });

            var back = new SheetStore(folder, new DpapiProtector()).Load();
            Assert.Equal(Secret, back.Secret);
            Assert.Equal(Url, back.Url);
            Assert.Equal(new[] { "desk@fake.test" }, back.ShareWith);
            Assert.True(back.Verified);

            var bytes = File.ReadAllBytes(store.FilePath);
            var text = Encoding.UTF8.GetString(bytes);
            Assert.StartsWith("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(bytes), StringComparison.Ordinal);
            Assert.DoesNotContain(Secret, text, StringComparison.Ordinal);
            Assert.DoesNotContain("AKfycb", text, StringComparison.Ordinal);
            Assert.DoesNotContain("desk@fake.test", text, StringComparison.Ordinal);

            // 다른 entropy(비트시트 가져오기용)로는 풀리지 않는다 → 비밀 글자 없음
            Assert.Null(new SheetStore(folder, new DpapiProtector(BitSheetImport.Entropy())).Load().Secret);
        }
        finally
        {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }

    [Fact(DisplayName = "AC-8511.3 SheetConfirmWindow는 ISheetConfirm이고, 시간이 0이면 창을 띄우지 않고 거짓([취소]와 같음)")]
    public void ConfirmWindowZeroTimeout()
    {
        ISheetConfirm window = new SheetConfirmWindow();
        Assert.False(window.Show(SheetPrompt.Text("https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec", new string[0]), TimeSpan.Zero));
    }
}
