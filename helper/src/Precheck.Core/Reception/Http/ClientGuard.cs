using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Sockets;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 의원 와이파이 문 지키기(design.md 7절, REQ-1406). 서버와 길 나누기가 요청마다 차례로 부른다.
/// - <see cref="IsPrivateClient"/>: 보낸 쪽이 사설 IPv4 또는 이 PC 자신인가(아니면 답 없이 끊는다, AC-1406.1).
/// - <see cref="HostOk"/>: Host가 이 PC의 지금 사설 주소(이 PC 자신이면 127.0.0.1·localhost)인가(아니면 403, AC-1406.2).
///   다른 사이트가 자기 이름을 이 PC 주소로 바꿔 끼우는 공격(DNS 바꿔치기)을 막는다.
/// - <see cref="WriteOk"/>: 쓰기 요청이 우리 화면에서 왔나(Origin·X-Reception·JSON·몸 크기, AC-1406.3).
///   다른 사이트가 이런 요청을 보내려면 사전 확인(OPTIONS)이 필요한데 서버는 405로 답한다.
/// 모두 같음 검사만 한다(주소 글을 풀어 읽지 않는다). 그래서 0xc0.0xa8… 같은 다른 모양·두 번 온 머리는 떨어진다.
/// </summary>
public static class ClientGuard
{
    public static bool IsPrivateClient(IPAddress a)
    {
        if (a == null) return false;
        if (IsLoopback(a)) return true;
        var v4 = AsIPv4(a);
        return v4 != null && IsPrivateLan(v4);
    }

    public static bool HostOk(string? host, IPAddress client, IReadOnlyList<IPAddress> mine, int port)
    {
        if (string.IsNullOrEmpty(host) || client == null || mine == null) return false;
        var suffix = ":" + port.ToString(CultureInfo.InvariantCulture);
        if (host!.Length <= suffix.Length || !host.EndsWith(suffix, StringComparison.Ordinal)) return false;
        var name = host.Substring(0, host.Length - suffix.Length);

        if (IsLoopback(client) && (name == "127.0.0.1" || string.Equals(name, "localhost", StringComparison.OrdinalIgnoreCase))) return true;
        foreach (var address in mine)
        {
            var v4 = address == null ? null : AsIPv4(address);
            if (v4 != null && IsPrivateLan(v4) && string.Equals(name, v4.ToString(), StringComparison.Ordinal)) return true;
        }
        return false;
    }

    public static bool WriteOk(HttpRequest r)
    {
        if (r == null || r.Method != "POST") return false;
        var host = r.Header("Host");
        if (string.IsNullOrEmpty(host)) return false;
        if (!string.Equals(r.Header("Origin"), "http://" + host, StringComparison.Ordinal)) return false;
        if (!string.Equals(r.Header("X-Reception"), "1", StringComparison.Ordinal)) return false;
        if (!IsJson(r.Header("Content-Type"))) return false;
        return r.Body.Length <= HttpRequestReader.MaxBody;
    }

    /// <summary>형식 본체(; 앞)가 application/json인가. charset 같은 덧붙임은 받는다(폼이 보낼 수 있는 형식이 아니다)</summary>
    private static bool IsJson(string? contentType)
    {
        if (contentType == null) return false;
        var semicolon = contentType.IndexOf(';');
        var essence = (semicolon < 0 ? contentType : contentType.Substring(0, semicolon)).Trim(' ', '\t');
        return string.Equals(essence, "application/json", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>IPv4면 그대로, IPv4가 섞인 IPv6(::ffff:a.b.c.d)면 푼 IPv4, 그 밖은 null</summary>
    private static IPAddress? AsIPv4(IPAddress a)
    {
        if (a.AddressFamily == AddressFamily.InterNetwork) return a;
        if (a.AddressFamily == AddressFamily.InterNetworkV6 && a.IsIPv4MappedToIPv6) return a.MapToIPv4();
        return null;
    }

    /// <summary>127.0.0.0/8(섞인 IPv6 포함) 또는 ::1</summary>
    private static bool IsLoopback(IPAddress a)
    {
        var v4 = AsIPv4(a);
        if (v4 != null) return v4.GetAddressBytes()[0] == 127;
        if (a.AddressFamily != AddressFamily.InterNetworkV6) return false;
        var bytes = a.GetAddressBytes();
        for (var i = 0; i < 15; i++)
        {
            if (bytes[i] != 0) return false;
        }
        return bytes[15] == 1;
    }

    /// <summary>10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16 (IPv4만)</summary>
    private static bool IsPrivateLan(IPAddress v4)
    {
        var b = v4.GetAddressBytes();
        return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
    }
}
