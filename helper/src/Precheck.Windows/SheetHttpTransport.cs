using System;
using System.IO;
using System.Net;
using System.Text;
using Precheck.Core.Sheet;

namespace Precheck.Windows;

/// <summary>
/// 수납 구글 코드 HTTP 한 번(spec google-link TASK-10, design.md 9-2): HttpWebRequest, TLS 1.2, 넘김은 따라가지 않는다(AllowAutoRedirect = false —
/// WebAppClient가 script.googleusercontent.com만 손으로 따라간다). 시간 한도는 60초와 넘겨받은 남은 시간 중 짧은 것.
/// 답 번호가 4xx·5xx여도 던지지 않고 돌려준다(번호 → 오류는 WebAppClient). 연결이 안 되면 E-GSHEET-NET, 시간이 지나면 E-GSHEET-TIMEOUT,
/// 중간에 끊기면 E-GSHEET-CUT. 보낸 글·받은 글은 어디에도 적지 않는다.
/// </summary>
public sealed class SheetHttpTransport : ISheetTransport
{
    /// <summary>HTTP 한 번의 가장 긴 시간.</summary>
    public static readonly TimeSpan MaxTimeout = TimeSpan.FromSeconds(60);

    /// <summary>답 글 한도(구글 코드 답은 몇 KB). 넘으면 E-GSHEET-SERVER.</summary>
    public const int MaxBody = 2 * 1024 * 1024;

    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private readonly Func<TimeSpan> left;

    public SheetHttpTransport(Func<TimeSpan> left)
    {
        this.left = left ?? throw new ArgumentNullException(nameof(left));
    }

    public SheetHttpReply Send(string method, string url, string? jsonBody)
    {
        if (method == null) throw new ArgumentNullException(nameof(method));
        if (url == null) throw new ArgumentNullException(nameof(url));
        var remaining = left();
        if (remaining <= TimeSpan.Zero) throw new SheetException(SheetErrors.Timeout);
        var timeout = remaining < MaxTimeout ? remaining : MaxTimeout;
        var ms = (int)Math.Max(1, Math.Ceiling(timeout.TotalMilliseconds));

        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        HttpWebRequest request;
        try
        {
            request = (HttpWebRequest)WebRequest.Create(url);
        }
        catch (Exception e) when (e is UriFormatException || e is NotSupportedException || e is InvalidCastException)
        {
            throw new SheetException(SheetErrors.Url);
        }
        request.Method = method;
        request.AllowAutoRedirect = false;
        request.Timeout = ms;
        request.ReadWriteTimeout = ms;
        request.KeepAlive = false;
        request.ServicePoint.Expect100Continue = false;
        request.Accept = "application/json";
        request.UserAgent = "PrecheckHelper";
        request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

        HttpWebResponse response;
        try
        {
            if (jsonBody != null)
            {
                var bytes = Utf8.GetBytes(jsonBody);
                request.ContentType = "application/json; charset=utf-8";
                request.ContentLength = bytes.Length;
                using (var body = request.GetRequestStream()) body.Write(bytes, 0, bytes.Length);
            }
            response = (HttpWebResponse)request.GetResponse();
        }
        catch (WebException e) when (e.Response is HttpWebResponse answered)
        {
            response = answered;
        }
        catch (WebException e)
        {
            throw new SheetException(CodeOf(e.Status));
        }
        catch (IOException)
        {
            throw new SheetException(SheetErrors.Cut);
        }

        using (response)
        {
            try
            {
                return new SheetHttpReply
                {
                    Status = (int)response.StatusCode,
                    Location = response.Headers[HttpResponseHeader.Location] ?? "",
                    ContentType = response.ContentType ?? "",
                    Body = ReadBody(response),
                };
            }
            catch (WebException e)
            {
                throw new SheetException(CodeOf(e.Status));
            }
            catch (IOException)
            {
                throw new SheetException(left() <= TimeSpan.Zero ? SheetErrors.Timeout : SheetErrors.Cut);
            }
        }
    }

    private static string ReadBody(HttpWebResponse response)
    {
        using (var stream = response.GetResponseStream())
        using (var copy = new MemoryStream())
        {
            if (stream == null) return "";
            var buffer = new byte[16 * 1024];
            int read;
            while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
            {
                if (copy.Length + read > MaxBody) throw new SheetException(SheetErrors.Server);
                copy.Write(buffer, 0, read);
            }
            return Utf8.GetString(copy.ToArray());
        }
    }

    private static string CodeOf(WebExceptionStatus status)
    {
        switch (status)
        {
            case WebExceptionStatus.Timeout:
                return SheetErrors.Timeout;
            case WebExceptionStatus.ConnectionClosed:
            case WebExceptionStatus.ReceiveFailure:
            case WebExceptionStatus.SendFailure:
            case WebExceptionStatus.KeepAliveFailure:
            case WebExceptionStatus.PipelineFailure:
            case WebExceptionStatus.RequestCanceled:
            case WebExceptionStatus.MessageLengthLimitExceeded:
                return SheetErrors.Cut;
            default:
                // ConnectFailure·NameResolutionFailure·ProxyNameResolutionFailure·SecureChannelFailure·TrustFailure 등
                return SheetErrors.Net;
        }
    }
}
