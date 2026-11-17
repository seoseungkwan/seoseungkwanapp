using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 작은 웹 서버의 답 하나(design.md 7절). 만들 수 있는 머리는 Content-Type·Content-Length·Allow와 보안 머리뿐이다.
/// - 모든 답에 보안 머리 다섯 개(CSP·nosniff·no-referrer·no-store·Connection: close)를 단다(AC-1406.6).
/// - CORS 머리(Access-Control-*)를 더하는 길이 없다(AC-1406.3).
/// - 형식 글·Allow 글에 줄바꿈·제어 글자를 넣을 수 없다(머리 끼워 넣기 막기). 상태 번호는 쓰는 것만 받는다.
/// </summary>
public sealed class HttpResponse
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

    /// <summary>모든 답에 이 차례로 다는 보안 머리(AC-1406.6)</summary>
    public static IReadOnlyList<KeyValuePair<string, string>> SecurityHeaders { get; } = Array.AsReadOnly(new[]
    {
        new KeyValuePair<string, string>("Content-Security-Policy", ContentSecurityPolicy),
        new KeyValuePair<string, string>("X-Content-Type-Options", "nosniff"),
        new KeyValuePair<string, string>("Referrer-Policy", "no-referrer"),
        new KeyValuePair<string, string>("Cache-Control", "no-store"),
        new KeyValuePair<string, string>("Connection", "close"),
    });

    private static readonly Dictionary<int, string> Reasons = new Dictionary<int, string>
    {
        [200] = "OK",
        [204] = "No Content",
        [400] = "Bad Request",
        [403] = "Forbidden",
        [404] = "Not Found",
        [405] = "Method Not Allowed",
        [408] = "Request Timeout",
        [409] = "Conflict",
        [413] = "Content Too Large",
        [431] = "Request Header Fields Too Large",
        [500] = "Internal Server Error",
        [503] = "Service Unavailable",
    };

    private readonly IReadOnlyList<KeyValuePair<string, string>> _headers;

    private HttpResponse(int status, string? contentType, byte[] body, string? allow)
    {
        if (!Reasons.ContainsKey(status)) throw new ArgumentOutOfRangeException(nameof(status));
        if (status == 204 && body.Length > 0) throw new ArgumentException("204 답에는 몸이 없다", nameof(body));
        Status = status;
        ContentType = contentType;
        Body = body;

        var headers = new List<KeyValuePair<string, string>>();
        if (contentType != null) headers.Add(new KeyValuePair<string, string>("Content-Type", contentType));
        if (status != 204) headers.Add(new KeyValuePair<string, string>("Content-Length", body.Length.ToString(CultureInfo.InvariantCulture)));
        if (allow != null) headers.Add(new KeyValuePair<string, string>("Allow", allow));
        headers.AddRange(SecurityHeaders);
        _headers = headers.AsReadOnly();
    }

    /// <summary>몸 없는 답(204·오류 등)</summary>
    public static HttpResponse Empty(int status) => new HttpResponse(status, null, new byte[0], null);

    /// <summary>JSON 답(UTF-8)</summary>
    public static HttpResponse Json(string json, int status = 200)
    {
        if (json == null) throw new ArgumentNullException(nameof(json));
        return new HttpResponse(status, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json), null);
    }

    /// <summary>형식을 정한 바이트 답(화면 파일 등)</summary>
    public static HttpResponse Bytes(string contentType, byte[] body, int status = 200)
    {
        if (contentType == null) throw new ArgumentNullException(nameof(contentType));
        if (body == null) throw new ArgumentNullException(nameof(body));
        if (contentType.Length == 0 || !IsHeaderText(contentType)) throw new ArgumentException("형식 글 모양이 틀렸다", nameof(contentType));
        return new HttpResponse(status, contentType, body, null);
    }

    /// <summary>405 답. Allow에 받는 방법(대문자)만 적는다(OPTIONS 사전 확인에도 이것만 답한다)</summary>
    public static HttpResponse NotAllowed(params string[] allow)
    {
        if (allow == null || allow.Length == 0) throw new ArgumentException("받는 방법이 없다", nameof(allow));
        foreach (var method in allow)
        {
            if (string.IsNullOrEmpty(method)) throw new ArgumentException("방법이 비었다", nameof(allow));
            foreach (var c in method)
            {
                if (c < 'A' || c > 'Z') throw new ArgumentException("방법은 대문자만", nameof(allow));
            }
        }
        return new HttpResponse(405, null, new byte[0], string.Join(", ", allow));
    }

    public int Status { get; }

    public string? ContentType { get; }

    public byte[] Body { get; }

    /// <summary>상태 줄 다음에 쓰는 머리 전부(쓰는 차례 그대로)</summary>
    public IReadOnlyList<KeyValuePair<string, string>> Headers => _headers;

    /// <summary>그 이름(대소문자 무시)의 머리 값. 없으면 null</summary>
    public string? Header(string name)
    {
        foreach (var header in _headers)
        {
            if (string.Equals(header.Key, name, StringComparison.OrdinalIgnoreCase)) return header.Value;
        }
        return null;
    }

    /// <summary>연결에 쓸 바이트: 상태 줄 + 머리(CRLF) + 빈 줄 + 몸</summary>
    public byte[] ToBytes()
    {
        var head = new StringBuilder("HTTP/1.1 ")
            .Append(Status.ToString(CultureInfo.InvariantCulture)).Append(' ').Append(Reasons[Status]).Append("\r\n");
        foreach (var header in _headers) head.Append(header.Key).Append(": ").Append(header.Value).Append("\r\n");
        head.Append("\r\n");
        var headBytes = Encoding.ASCII.GetBytes(head.ToString());
        var bytes = new byte[headBytes.Length + Body.Length];
        Array.Copy(headBytes, bytes, headBytes.Length);
        Array.Copy(Body, 0, bytes, headBytes.Length, Body.Length);
        return bytes;
    }

    public void WriteTo(Stream s)
    {
        if (s == null) throw new ArgumentNullException(nameof(s));
        var bytes = ToBytes();
        s.Write(bytes, 0, bytes.Length);
        s.Flush();
    }

    /// <summary>머리 값으로 쓸 수 있는 글(보이는 ASCII와 빈칸만)</summary>
    private static bool IsHeaderText(string text)
    {
        foreach (var c in text)
        {
            if (c < 0x20 || c > 0x7E) return false;
        }
        return true;
    }
}
