using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using Precheck.Core.Bit;

namespace Erp.Core;

/// <summary>이 PC 네트워크 카드의 주소 하나와 그 접두 길이(spec erp-bit-anywhere AC-3804.1). 인터넷 IPv6가 이 PC와 같은 망인지 볼 때 쓴다.</summary>
public readonly struct ErpLocalNetwork
{
    public ErpLocalNetwork(IPAddress address, int prefixLength)
    {
        Address = address ?? throw new ArgumentNullException(nameof(address));
        PrefixLength = prefixLength;
    }

    public IPAddress Address { get; }

    public int PrefixLength { get; }
}

/// <summary>
/// ERP 도우미 비트 자료 서버 검사(spec erp-bit-anywhere REQ-3804, AC-3804.1·AC-3804.2).
/// 기존 PrivateServer(이 PC·사설 숫자 주소)가 받는 값은 그대로 받는다. 그 밖에는 컴퓨터 이름을 풀어, 나온 주소가 모두 병원 안 주소일 때만 받는다.
/// 병원 밖 인터넷 주소의 서버는 막는다(사용자 결정 2026-11-23). 접속 글자의 서버 값은 바꾸지 않는다(비트와 같은 이름으로 붙는다).
/// 이름 풀이와 이 PC 카드 목록은 부르는 쪽이 넣는다(시험은 가짜, 도우미는 Dns.GetHostAddresses·NetworkInterface).
/// </summary>
public static class ErpServerRules
{
    /// <summary>이 PC 카드 접두가 이보다 짧으면(넓으면) 같은 망으로 보지 않는다.</summary>
    public const int MinPrefixLength = 48;

    private const int MaxNameLength = 255;

    public static bool IsAllowed(string? server, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks)
    {
        if (resolve == null) throw new ArgumentNullException(nameof(resolve));
        if (localNetworks == null) throw new ArgumentNullException(nameof(localNetworks));
        if (PrivateServer.IsAllowed(server, machineName)) return true;

        // 서버 값 나누기는 PrivateServer와 같다: tcp:를 떼고, tcp: 없이 :가 들면(np:·lpc:·admin:·맨 IPv6) 막는다
        var value = (server ?? "").Trim();
        if (value.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase)) value = value.Substring(4);
        else if (value.IndexOf(':') >= 0) return false;

        var host = value.Split('\\')[0].Split(',')[0].Trim();
        if (host.Length == 0 || host.Length > MaxNameLength) return false;
        foreach (var letter in host)
        {
            if (char.IsWhiteSpace(letter) || char.IsControl(letter)) return false;
        }
        if (IPAddress.TryParse(host, out var literal)) return IsInside(literal, localNetworks);

        IReadOnlyList<IPAddress>? addresses;
        try
        {
            addresses = resolve(host);
        }
        catch (Exception)
        {
            // 풀이 실패(모르는 이름 등)는 막음. 예외 글은 버린다
            return false;
        }
        if (addresses == null || addresses.Count == 0) return false;
        foreach (var address in addresses)
        {
            if (address == null || !IsInside(address, localNetworks)) return false;
        }
        return true;
    }

    /// <summary>막는 값이면 BitException(E-BIT-DB-FAILED). 접속하기 전에 부른다.</summary>
    public static void Require(string? server, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks)
    {
        if (!IsAllowed(server, machineName, resolve, localNetworks)) throw new BitException(BitErrors.DbFailed);
    }

    /// <summary>
    /// 병원 안 주소: IPv4 10/8·172.16/12·192.168/16·127/8·169.254/16, IPv6 ::1·fe80::/10·fc00::/7·그 IPv4를 담은 것(::ffff:a.b.c.d),
    /// 그 밖 IPv6는 이 PC 카드 IPv6 접두(길이 MinPrefixLength~128) 안일 때만.
    /// </summary>
    public static bool IsInside(IPAddress address, IReadOnlyList<ErpLocalNetwork> localNetworks)
    {
        if (address == null) throw new ArgumentNullException(nameof(address));
        if (localNetworks == null) throw new ArgumentNullException(nameof(localNetworks));
        if (address.AddressFamily == AddressFamily.InterNetworkV6 && address.IsIPv4MappedToIPv6) address = address.MapToIPv4();

        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return bytes[0] == 10 || bytes[0] == 127 ||
                (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
                (bytes[0] == 192 && bytes[1] == 168) ||
                (bytes[0] == 169 && bytes[1] == 254);
        }
        if (address.AddressFamily != AddressFamily.InterNetworkV6) return false;
        if (IPAddress.IPv6Loopback.Equals(new IPAddress(bytes))) return true;
        if (bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80) return true;   // fe80::/10
        if ((bytes[0] & 0xfe) == 0xfc) return true;                      // fc00::/7

        foreach (var network in localNetworks)
        {
            if (network.Address == null || network.Address.AddressFamily != AddressFamily.InterNetworkV6) continue;
            if (network.PrefixLength < MinPrefixLength || network.PrefixLength > 128) continue;
            if (SamePrefix(bytes, network.Address.GetAddressBytes(), network.PrefixLength)) return true;
        }
        return false;
    }

    private static bool SamePrefix(byte[] left, byte[] right, int prefixLength)
    {
        var whole = prefixLength / 8;
        for (var i = 0; i < whole; i++)
        {
            if (left[i] != right[i]) return false;
        }
        var rest = prefixLength % 8;
        if (rest == 0) return true;
        var mask = (byte)(0xff << (8 - rest));
        return (left[whole] & mask) == (right[whole] & mask);
    }
}
