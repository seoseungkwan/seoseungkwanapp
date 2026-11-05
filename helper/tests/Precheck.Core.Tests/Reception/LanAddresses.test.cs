using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Lan 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Lan;

/// <summary>
/// 이 PC 주소(LanAddresses·LanAddressWatch, design.md 8절, TASK-24).
/// AC-1411.4 주소 부분: 켜져 있고 기본 게이트웨이가 있는 어댑터의 사설 IPv4만, 순서 고정. 휴대폰 주소 글 http://{주소}:47200.
/// AC-1406.2 Host 검사에 넘기는 "이 PC의 지금 사설 IPv4"를 30초마다(요청 때만, 주입한 시계) 새로 본다. 동시에 불러도 안전.
/// 주소는 모두 가짜(사설·문서용) 주소다.
/// </summary>
public class LanAddressesTests
{
    // ---- 가짜 어댑터 ----

    private static NicInfo Nic(bool up, IEnumerable<IPAddress>? gateways, IEnumerable<IPAddress>? addresses) =>
        new NicInfo(up, gateways, addresses);

    private static IReadOnlyList<IPAddress> Pick(params NicInfo[] nics) => LanAddresses.Pick(nics);

    private static IPAddress Ip(string text) => IPAddress.Parse(text);

    private static IPAddress[] Ips(params string[] texts) => texts.Select(IPAddress.Parse).ToArray();

    private static readonly IPAddress[] Router = Ips("192.168.0.1");

    /// <summary>켜져 있고 공유기(게이트웨이)가 있는 어댑터</summary>
    private static NicInfo Lan(params string[] addresses) => Nic(true, Router, Ips(addresses));

    private static string[] Texts(IEnumerable<IPAddress> list) => list.Select(a => a.ToString()).ToArray();

    // ---- AC-1411.4 어댑터 걸러내기 ----

    [Fact(DisplayName = "AC-1411.4 켜져 있고 게이트웨이가 있는 어댑터의 사설 IPv4만 고른다(꺼진 것·가상 어댑터·공인·링크 로컬·IPv6·루프백은 뺀다)")]
    public void PicksUpGatewayPrivateIPv4()
    {
        var picked = Pick(
            Nic(true, Router, Ips("192.168.0.23", "fe80::1234", "169.254.10.2")), // 와이파이: 사설 IPv4 하나만
            Nic(false, Ips("10.0.0.1"), Ips("10.0.0.9")),                        // 꺼진 랜선
            Nic(true, Array.Empty<IPAddress>(), Ips("192.168.56.1")),             // 가상 어댑터(게이트웨이 없음)
            Nic(true, Ips("203.0.113.1"), Ips("203.0.113.5")),                    // 공인 주소
            Nic(true, Array.Empty<IPAddress>(), Ips("127.0.0.1", "::1")));        // 루프백

        Assert.Equal(new[] { "192.168.0.23" }, Texts(picked));
        Assert.All(picked, a => Assert.Equal(AddressFamily.InterNetwork, a.AddressFamily));
    }

    [Theory(DisplayName = "AC-1411.4 사설 범위(10/8·172.16/12·192.168/16)는 경계값까지 고른다")]
    [InlineData("10.0.0.0")]
    [InlineData("10.255.255.255")]
    [InlineData("172.16.0.0")]
    [InlineData("172.20.10.2")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.0.0")]
    [InlineData("192.168.255.255")]
    public void PicksPrivateRange(string address)
    {
        Assert.Equal(new[] { address }, Texts(Pick(Lan(address))));
    }

    [Theory(DisplayName = "AC-1411.4 사설 범위 밖·링크 로컬·CGNAT·루프백·IPv6(섞인 모양 포함)은 고르지 않는다")]
    [InlineData("9.255.255.255")]
    [InlineData("11.0.0.1")]
    [InlineData("172.15.255.255")]
    [InlineData("172.32.0.0")]
    [InlineData("192.167.255.255")]
    [InlineData("192.169.0.1")]
    [InlineData("169.254.1.1")]
    [InlineData("100.64.0.1")]
    [InlineData("127.0.0.1")]
    [InlineData("0.0.0.0")]
    [InlineData("::ffff:192.168.0.5")]
    [InlineData("fd00::5")]
    public void SkipsNonPrivate(string address)
    {
        Assert.Empty(Pick(Lan(address)));
    }

    [Fact(DisplayName = "AC-1411.4 게이트웨이가 0.0.0.0·::뿐이거나 목록이 없으면 게이트웨이가 없는 것으로 본다")]
    public void UnspecifiedGatewayIsNone()
    {
        Assert.Empty(Pick(Nic(true, Ips("0.0.0.0", "::"), Ips("192.168.0.23"))));
        Assert.Empty(Pick(Nic(true, null, Ips("192.168.0.23"))));
        Assert.Equal(new[] { "192.168.0.23" }, Texts(Pick(Nic(true, Ips("0.0.0.0", "fe80::1"), Ips("192.168.0.23")))));
    }

    [Fact(DisplayName = "AC-1411.4 순서 고정: 어댑터·주소가 어떤 차례로 와도 주소 작은 순, 같은 주소는 한 번")]
    public void FixedOrder()
    {
        var a = Pick(Lan("192.168.0.23", "10.0.0.5"), Lan("172.20.10.2"), Lan("10.0.0.5"));
        var b = Pick(Lan("172.20.10.2"), Lan("10.0.0.5"), Lan("192.168.0.23"));

        Assert.Equal(new[] { "10.0.0.5", "172.20.10.2", "192.168.0.23" }, Texts(a));
        Assert.Equal(Texts(a), Texts(b));
        Assert.Equal(new[] { "192.168.0.9", "192.168.0.23", "192.168.1.2" }, Texts(Pick(Lan("192.168.1.2", "192.168.0.23", "192.168.0.9"))));
    }

    [Fact(DisplayName = "AC-1411.4 사설 주소가 없으면 빈 목록(없음이 아님), 빈 어댑터·주소 목록이 없는 어댑터도 던지지 않는다")]
    public void EmptyWhenNone()
    {
        Assert.Empty(Pick());
        Assert.Empty(Pick(Nic(true, Router, null), Nic(true, Router, Array.Empty<IPAddress>())));
        Assert.Throws<ArgumentNullException>(() => LanAddresses.Pick(null!));
    }

    [Fact(DisplayName = "AC-1411.4 휴대폰 주소 글 PhoneUrl = http://{주소}:47200 (ReceptionPorts.Http)")]
    public void PhoneUrlText()
    {
        Assert.Equal("http://192.168.0.23:47200", LanAddresses.PhoneUrl(Ip("192.168.0.23")));
        Assert.Equal("http://10.0.0.5:" + ReceptionPorts.Http, LanAddresses.PhoneUrl(Ip("10.0.0.5")));
        Assert.Throws<ArgumentNullException>(() => LanAddresses.PhoneUrl(null!));
        Assert.Throws<ArgumentException>(() => LanAddresses.PhoneUrl(Ip("fe80::1")));
    }

    [Fact(DisplayName = "AC-1411.4 이 PC의 NetworkInterface를 읽어도 던지지 않고, 고른 것은 모두 사설 IPv4다")]
    public void ReadsThisMachine()
    {
        var picked = LanAddresses.Pick(LanAddresses.ReadSystem());
        Assert.All(picked, a =>
        {
            Assert.Equal(AddressFamily.InterNetwork, a.AddressFamily);
            Assert.True(ClientGuard.IsPrivateClient(a) && !IPAddress.IsLoopback(a), a.ToString());
        });
    }

    // ---- AC-1406.2 지금 주소를 30초마다 새로 본다 ----

    /// <summary>바꿀 수 있는 가짜 시계와 부른 횟수를 세는 가짜 어댑터 읽기</summary>
    private sealed class Fake
    {
        public DateTime Now = new DateTime(2026, 11, 5, 9, 0, 0);
        public NicInfo[] Nics = { Lan("192.168.0.23") };
        public int Reads;
        public Exception? Throw;

        public IEnumerable<NicInfo> Read()
        {
            Interlocked.Increment(ref Reads);
            if (Throw != null) throw Throw;
            return Nics;
        }
    }

    private static (Fake fake, LanAddressWatch watch) Watch()
    {
        var fake = new Fake();
        return (fake, new LanAddressWatch(fake.Read, () => fake.Now));
    }

    [Fact(DisplayName = "AC-1406.2 만들기만 해서는 읽지 않고(타이머 없음) 처음 Current()에서 읽어 고른 주소를 준다")]
    public void ReadsOnFirstRequest()
    {
        var (fake, watch) = Watch();
        fake.Now = fake.Now.AddMinutes(5);
        Assert.Equal(0, fake.Reads);

        Assert.Equal(new[] { "192.168.0.23" }, Texts(watch.Current()));
        Assert.Equal(1, fake.Reads);
    }

    [Fact(DisplayName = "AC-1406.2 30초 안에는 다시 읽지 않고, 30초가 지나면 다시 읽어 바뀐 주소를 준다")]
    public void RereadsAfterThirtySeconds()
    {
        var (fake, watch) = Watch();
        var first = fake.Now;
        watch.Current();
        fake.Nics = new[] { Lan("192.168.0.77") };

        fake.Now = first.AddSeconds(30).AddTicks(-1);
        Assert.Equal(new[] { "192.168.0.23" }, Texts(watch.Current()));
        Assert.Equal(1, fake.Reads);

        fake.Now = first.AddSeconds(30); // 처음 읽은 뒤 꼭 30초
        Assert.Equal(new[] { "192.168.0.77" }, Texts(watch.Current()));
        Assert.Equal(2, fake.Reads);

        fake.Now = fake.Now.AddSeconds(10);
        watch.Current();
        Assert.Equal(2, fake.Reads); // 다시 읽은 때부터 30초를 센다
    }

    [Fact(DisplayName = "AC-1406.2 시계가 뒤로 가면 기다리지 않고 다시 읽는다")]
    public void RereadsWhenClockGoesBack()
    {
        var (fake, watch) = Watch();
        watch.Current();
        fake.Nics = new[] { Lan("10.0.0.5") };
        fake.Now = fake.Now.AddHours(-1);

        Assert.Equal(new[] { "10.0.0.5" }, Texts(watch.Current()));
        Assert.Equal(2, fake.Reads);
    }

    [Fact(DisplayName = "AC-1406.2 읽기가 던지면 Current()는 던지지 않고 지난 목록을 주며, 30초 뒤에 다시 읽는다")]
    public void KeepsLastListWhenReadFails()
    {
        var (fake, watch) = Watch();
        fake.Throw = new InvalidOperationException("가짜 실패");
        Assert.Empty(watch.Current()); // 아직 본 적이 없으면 빈 목록
        fake.Throw = null;
        fake.Now = fake.Now.AddSeconds(30);
        Assert.Equal(new[] { "192.168.0.23" }, Texts(watch.Current()));

        fake.Throw = new InvalidOperationException("가짜 실패");
        fake.Now = fake.Now.AddSeconds(30);
        Assert.Equal(new[] { "192.168.0.23" }, Texts(watch.Current()));
        Assert.Equal(3, fake.Reads);
        watch.Current();
        Assert.Equal(3, fake.Reads); // 실패한 때부터도 30초를 기다린다
    }

    [Fact(DisplayName = "AC-1406.2 여러 작업이 동시에 불러도 한 번만 읽고 모두 같은 목록을 받는다")]
    public async Task ThreadSafe()
    {
        var fake = new Fake();
        var reads = 0;
        var watch = new LanAddressWatch(() =>
        {
            Interlocked.Increment(ref reads);
            Thread.Sleep(50); // 읽는 동안 다른 작업이 들어온다
            return fake.Nics;
        }, () => fake.Now);

        const int Workers = 16;
        var start = new Barrier(Workers);
        var results = new IReadOnlyList<IPAddress>[Workers];
        var tasks = Enumerable.Range(0, Workers).Select(i => Task.Factory.StartNew(() =>
        {
            start.SignalAndWait();
            results[i] = watch.Current();
        }, TaskCreationOptions.LongRunning)).ToArray();
        await Task.WhenAll(tasks);

        Assert.Equal(1, reads);
        Assert.All(results, r => Assert.Equal(new[] { "192.168.0.23" }, Texts(r)));
    }

    [Fact(DisplayName = "AC-1406.2 돌려준 목록은 바꿀 수 없다(부른 쪽이 Host 검사 목록을 망치지 못한다)")]
    public void ReadOnlyList()
    {
        var (_, watch) = Watch();
        var list = watch.Current();
        Assert.Throws<NotSupportedException>(() => ((IList<IPAddress>)list).Add(Ip("203.0.113.5")));
        Assert.Throws<NotSupportedException>(() => ((IList<IPAddress>)Pick(Lan("10.0.0.5")))[0] = Ip("203.0.113.5"));
    }

    [Fact(DisplayName = "AC-1406.2 Watch가 준 목록으로 ClientGuard.HostOk는 이 PC의 지금 사설 주소:47200만 받는다")]
    public void HostCheckFollowsWatch()
    {
        var (fake, watch) = Watch();
        fake.Nics = new[] { Lan("192.168.0.23"), Nic(true, Array.Empty<IPAddress>(), Ips("192.168.56.1")) };
        var phone = Ip("192.168.0.40");
        bool Ok(string host) => ClientGuard.HostOk(host, phone, watch.Current(), ReceptionPorts.Http);

        Assert.True(Ok("192.168.0.23:47200"));
        Assert.False(Ok("192.168.56.1:47200")); // 가상 어댑터 주소는 이 PC의 와이파이 주소가 아니다
        Assert.False(Ok("192.168.0.23:47201"));

        fake.Nics = new[] { Lan("192.168.0.77") }; // 공유기가 주소를 바꿈
        fake.Now = fake.Now.AddSeconds(30);
        Assert.True(Ok("192.168.0.77:47200"));
        Assert.False(Ok("192.168.0.23:47200"));
    }

    [Fact(DisplayName = "AC-1406.2 읽기·시계가 없으면 만들 때 ArgumentNullException")]
    public void NullArguments()
    {
        Assert.Throws<ArgumentNullException>(() => new LanAddressWatch(null!, () => DateTime.Now));
        Assert.Throws<ArgumentNullException>(() => new LanAddressWatch(() => Array.Empty<NicInfo>(), null!));
    }
}
