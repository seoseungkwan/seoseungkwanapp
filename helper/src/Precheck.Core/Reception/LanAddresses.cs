using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Precheck.Core.Reception.Http;

namespace Precheck.Core.Reception;

/// <summary>
/// 어댑터 하나에서 걸러내기에 쓰는 것만(design.md 8절). 윈도우에서는 <see cref="LanAddresses.ReadSystem"/>이
/// NetworkInterface로 채우고, 시험은 가짜로 만든다. 목록이 없으면(null) 빈 목록으로 본다.
/// </summary>
public sealed class NicInfo
{
    public NicInfo(bool up, IEnumerable<IPAddress>? gateways, IEnumerable<IPAddress>? addresses)
    {
        Up = up;
        Gateways = Copy(gateways);
        Addresses = Copy(addresses);
    }

    /// <summary>켜져 있다(OperationalStatus.Up)</summary>
    public bool Up { get; }

    /// <summary>기본 게이트웨이 주소들</summary>
    public IReadOnlyList<IPAddress> Gateways { get; }

    /// <summary>이 어댑터의 주소들(IPv4·IPv6 섞임)</summary>
    public IReadOnlyList<IPAddress> Addresses { get; }

    private static IReadOnlyList<IPAddress> Copy(IEnumerable<IPAddress>? list) =>
        new ReadOnlyCollection<IPAddress>((list ?? Enumerable.Empty<IPAddress>()).Where(a => a != null).ToArray());
}

/// <summary>
/// 이 PC 주소(design.md 8절, AC-1411.4). 휴대폰이 여는 주소와 Host 검사(AC-1406.2)가 받는 주소를 정한다.
/// - <see cref="Pick"/>: 켜져 있고 기본 게이트웨이가 있는 어댑터의 사설 IPv4만, 주소 작은 순·같은 주소는 한 번.
///   게이트웨이가 없는 가상 어댑터(가상 머신·VPN 다리 등)는 휴대폰이 닿지 못하므로 뺀다.
///   사설 범위는 문 지키기(<see cref="ClientGuard"/>)와 같은 규칙을 쓴다(루프백만 뺀다).
/// - <see cref="PhoneUrl"/>: 휴대폰 주소 글 http://{주소}:47200 (카카오톡이 누르는 링크로 바꾸게 문 번호까지 다 쓴다).
/// - <see cref="ReadSystem"/>: 이 PC의 NetworkInterface를 읽는다. 읽지 못한 어댑터는 건너뛰고 던지지 않는다.
/// </summary>
public static class LanAddresses
{
    public static IReadOnlyList<IPAddress> Pick(IEnumerable<NicInfo> nics)
    {
        if (nics == null) throw new ArgumentNullException(nameof(nics));
        var picked = nics
            .Where(n => n != null && n.Up && n.Gateways.Any(g => !IsUnspecified(g)))
            .SelectMany(n => n.Addresses)
            .Where(IsPrivateIPv4)
            .Select(ToNumber)
            .Distinct()
            .OrderBy(n => n)
            .Select(n => new IPAddress(new[] { (byte)(n >> 24), (byte)(n >> 16), (byte)(n >> 8), (byte)n }))
            .ToArray();
        return new ReadOnlyCollection<IPAddress>(picked);
    }

    public static string PhoneUrl(IPAddress ip)
    {
        if (ip == null) throw new ArgumentNullException(nameof(ip));
        if (ip.AddressFamily != AddressFamily.InterNetwork) throw new ArgumentException("IPv4 주소만 받는다", nameof(ip));
        return "http://" + ip + ":" + ReceptionPorts.Http.ToString(CultureInfo.InvariantCulture);
    }

    public static IEnumerable<NicInfo> ReadSystem()
    {
        NetworkInterface[] all;
        try
        {
            all = NetworkInterface.GetAllNetworkInterfaces();
        }
        catch (NetworkInformationException)
        {
            return Array.Empty<NicInfo>();
        }

        var list = new List<NicInfo>();
        foreach (var nic in all)
        {
            try
            {
                var props = nic.GetIPProperties();
                list.Add(new NicInfo(
                    nic.OperationalStatus == OperationalStatus.Up,
                    props.GatewayAddresses.Select(g => g.Address),
                    props.UnicastAddresses.Select(u => u.Address)));
            }
            catch (Exception e) when (e is NetworkInformationException || e is PlatformNotSupportedException || e is InvalidOperationException)
            {
                // 이 어댑터만 건너뛴다(그새 사라진 어댑터 등)
            }
        }
        return list;
    }

    /// <summary>IPv4(섞인 IPv6가 아닌 것)이고 10/8·172.16/12·192.168/16 안</summary>
    private static bool IsPrivateIPv4(IPAddress a) =>
        a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a) && ClientGuard.IsPrivateClient(a);

    /// <summary>IPv4 네 바이트를 앞에서부터 큰 자리로 둔 수(주소 작은 순으로 늘어놓고 같은 주소를 한 번만 두려고)</summary>
    private static uint ToNumber(IPAddress v4)
    {
        var b = v4.GetAddressBytes();
        return (uint)b[0] << 24 | (uint)b[1] << 16 | (uint)b[2] << 8 | b[3];
    }

    /// <summary>0.0.0.0·::는 게이트웨이가 없다는 뜻이다(윈도우가 이렇게 채우는 어댑터가 있다)</summary>
    private static bool IsUnspecified(IPAddress g) => g.Equals(IPAddress.Any) || g.Equals(IPAddress.IPv6Any);
}

/// <summary>
/// 이 PC의 지금 사설 IPv4 목록(design.md 7·8절, AC-1406.2). 라우터의 Host 검사가 요청마다 <see cref="Current"/>를 부른다.
/// 마지막으로 읽은 지 30초가 지났으면(시계가 뒤로 갔어도) read를 다시 불러 <see cref="LanAddresses.Pick"/>한다.
/// 요청 때만 읽는다(타이머 없음). 여러 작업이 동시에 불러도 한 번만 읽는다(잠금 하나).
/// 읽기가 던지면 지난 목록을 그대로 주고(처음이면 빈 목록), 그때부터 30초 뒤에 다시 읽는다. Current는 던지지 않는다.
/// </summary>
public sealed class LanAddressWatch
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    private static readonly IReadOnlyList<IPAddress> None = new ReadOnlyCollection<IPAddress>(Array.Empty<IPAddress>());

    private readonly Func<IEnumerable<NicInfo>> read;
    private readonly Func<DateTime> clock;
    private readonly object gate = new object();
    private IReadOnlyList<IPAddress> current = None;
    private DateTime? lastRead;

    public LanAddressWatch(Func<IEnumerable<NicInfo>> read, Func<DateTime> clock)
    {
        this.read = read ?? throw new ArgumentNullException(nameof(read));
        this.clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    public IReadOnlyList<IPAddress> Current()
    {
        lock (gate)
        {
            var now = clock();
            if (lastRead is DateTime last)
            {
                var elapsed = now - last;
                if (elapsed >= TimeSpan.Zero && elapsed < Interval) return current;
            }

            lastRead = now;
            try
            {
                current = LanAddresses.Pick(read());
            }
            catch (Exception)
            {
                // 지난 목록을 그대로 쓴다(어댑터 읽기가 잠깐 실패해도 휴대폰이 403을 받지 않게)
            }
            return current;
        }
    }
}
