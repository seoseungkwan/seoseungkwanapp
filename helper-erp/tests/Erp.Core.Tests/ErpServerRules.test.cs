using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using Erp.Core;
using Precheck.Core.Bit;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3804.1·AC-3804.2 ERP 도우미 비트 자료 서버 검사(spec erp-bit-anywhere REQ-3804): 기존 PrivateServer가 받는 값은 그대로 받고,
/// 컴퓨터 이름은 풀어서 나온 주소가 모두 병원 안 주소일 때만 받는다. 이름 풀이와 이 PC 카드 목록은 가짜로 넣는다(네트워크를 쓰지 않는다).
/// </summary>
public class ErpServerRulesTests
{
    private const string Machine = "CLINIC-PC";
    private static readonly IReadOnlyList<ErpLocalNetwork> NoCards = Array.Empty<ErpLocalNetwork>();

    /// <summary>정해 둔 이름만 답하고, 물어본 이름을 적어 두는 가짜 이름 풀이. 모르는 이름은 윈도우처럼 SocketException.</summary>
    private sealed class Resolver
    {
        private readonly Dictionary<string, string[]> answers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        public List<string> Asked { get; } = new List<string>();

        public Resolver Answer(string name, string addresses)
        {
            answers[name] = addresses.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            return this;
        }

        public IReadOnlyList<IPAddress> Resolve(string name)
        {
            Asked.Add(name);
            if (!answers.TryGetValue(name, out var list)) throw new SocketException(11001);
            return list.Select(IPAddress.Parse).ToArray();
        }
    }

    // ---- AC-3804.1 받는 값 -------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3804.1 기존 검사가 받는 값(이 PC·사설 숫자 주소)과 169.254 숫자 주소는 이름을 풀지 않고 받는다")]
    [InlineData(".")]
    [InlineData("(local)")]
    [InlineData("localhost")]
    [InlineData(@"CLINIC-PC\SQLEXPRESS")]
    [InlineData(@"192.168.0.10\SQLEXPRESS")]
    [InlineData("tcp:10.0.0.2,1433")]
    [InlineData("127.0.0.1")]
    [InlineData("169.254.1.1")]
    [InlineData("tcp:fe80::1")]
    public void AllowsKnownValuesWithoutResolving(string server)
    {
        var resolver = new Resolver();
        Assert.True(ErpServerRules.IsAllowed(server, Machine, resolver.Resolve, NoCards), server);
        Assert.Empty(resolver.Asked);
    }

    [Theory(DisplayName = "AC-3804.1 컴퓨터 이름이 병원 안 주소(사설 IPv4·127·169.254·::1·fe80·fc00·IPv4를 담은 IPv6)로만 풀리면 받는다")]
    [InlineData(@"SERVER\SQLEXPRESS", "SERVER", "192.168.0.5")]
    [InlineData("tcp:SERVER,1433", "SERVER", "10.0.0.2")]
    [InlineData("bit-db", "bit-db", "127.0.0.1")]
    [InlineData("SERVER", "SERVER", "192.168.0.5;fe80::1;fd00::1;::ffff:192.168.1.2;::1")]
    [InlineData(@" Server.local\BIT ", "Server.local", "172.16.3.4;169.254.7.7;172.31.255.255")]
    public void AllowsNameResolvingInside(string server, string name, string addresses)
    {
        var resolver = new Resolver().Answer(name, addresses);
        Assert.True(ErpServerRules.IsAllowed(server, Machine, resolver.Resolve, NoCards), server);
        Assert.Equal(new[] { name }, resolver.Asked);
    }

    [Fact(DisplayName = "AC-3804.1 인터넷 IPv6는 이 PC 카드 접두(길이 48~128) 안에 들 때만 병원 안으로 본다")]
    public void AllowsGlobalIpv6OnlyInsideLocalPrefix()
    {
        var cards = new[]
        {
            new ErpLocalNetwork(IPAddress.Parse("2001:db8:1::10"), 64),
            new ErpLocalNetwork(IPAddress.Parse("2001:db9::1"), 32),   // 너무 넓은 접두는 보지 않는다
            new ErpLocalNetwork(IPAddress.Parse("192.168.0.20"), 24),  // IPv4 카드 주소는 IPv6 규칙에 쓰지 않는다
        };
        var resolver = new Resolver()
            .Answer("SERVER", "192.168.0.5;2001:db8:1::5")
            .Answer("OTHER", "2001:db8:2::5;192.168.0.5")
            .Answer("WIDE", "2001:db9:5::5");
        Assert.True(ErpServerRules.IsAllowed("SERVER", Machine, resolver.Resolve, cards));
        Assert.False(ErpServerRules.IsAllowed("OTHER", Machine, resolver.Resolve, cards));
        Assert.False(ErpServerRules.IsAllowed("WIDE", Machine, resolver.Resolve, cards));

        Assert.True(ErpServerRules.IsInside(IPAddress.Parse("2001:db8:1::5"), cards));
        Assert.True(ErpServerRules.IsInside(IPAddress.Parse("2001:db8:1:0:ffff:ffff:ffff:ffff"), cards));
        Assert.False(ErpServerRules.IsInside(IPAddress.Parse("2001:db8:1:1::5"), cards));
        Assert.False(ErpServerRules.IsInside(IPAddress.Parse("2001:db8:1::5"), NoCards));
        Assert.False(ErpServerRules.IsInside(IPAddress.Parse("8.8.8.8"), cards));
    }

    [Theory(DisplayName = "AC-3804.1 병원 안 주소 = IPv4 10/8·172.16/12·192.168/16·127/8·169.254/16, IPv6 ::1·fe80::/10·fc00::/7·그 IPv4를 담은 것(카드 없음)")]
    [InlineData("10.0.0.1", true)]
    [InlineData("10.255.255.255", true)]
    [InlineData("172.16.0.1", true)]
    [InlineData("172.31.255.255", true)]
    [InlineData("172.15.0.1", false)]
    [InlineData("172.32.0.1", false)]
    [InlineData("192.168.1.1", true)]
    [InlineData("192.169.1.1", false)]
    [InlineData("127.0.0.1", true)]
    [InlineData("169.254.1.1", true)]
    [InlineData("169.253.1.1", false)]
    [InlineData("100.64.0.1", false)]
    [InlineData("8.8.8.8", false)]
    [InlineData("0.0.0.0", false)]
    [InlineData("::1", true)]
    [InlineData("fe80::1", true)]
    [InlineData("febf::1", true)]
    [InlineData("fec0::1", false)]
    [InlineData("fc00::1", true)]
    [InlineData("fdff::1", true)]
    [InlineData("::ffff:192.168.1.2", true)]
    [InlineData("::ffff:8.8.8.8", false)]
    [InlineData("2001:db8::1", false)]
    [InlineData("::", false)]
    public void KnowsInsideAddresses(string address, bool inside)
    {
        Assert.Equal(inside, ErpServerRules.IsInside(IPAddress.Parse(address), NoCards));
    }

    // ---- AC-3804.1 막는 값 -------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3804.1 풀린 주소에 밖 주소가 하나라도 섞이거나·밖 주소만이거나·주소가 없거나·풀이가 실패하면 막는다")]
    [InlineData("SERVER", "192.168.0.5;8.8.8.8")]
    [InlineData("SERVER", "8.8.8.8")]
    [InlineData("SERVER", "100.64.0.1")]
    [InlineData("SERVER", "2001:db8::1;192.168.0.5")]
    [InlineData("SERVER", "")]
    [InlineData("MISSING", null)]
    public void RefusesNameResolvingOutside(string name, string? addresses)
    {
        var resolver = new Resolver();
        if (addresses != null) resolver.Answer(name, addresses);
        Assert.False(ErpServerRules.IsAllowed(name + @"\SQLEXPRESS", Machine, resolver.Resolve, NoCards));
        Assert.Equal(new[] { name }, resolver.Asked);
    }

    [Fact(DisplayName = "AC-3804.1 풀이가 null을 주거나 SocketException이 아닌 예외를 던져도 막는다")]
    public void RefusesBrokenResolver()
    {
        Assert.False(ErpServerRules.IsAllowed("SERVER", Machine, _ => null!, NoCards));
        Assert.False(ErpServerRules.IsAllowed("SERVER", Machine, _ => throw new InvalidOperationException("x"), NoCards));
        Assert.False(ErpServerRules.IsAllowed("SERVER", Machine, _ => new IPAddress[] { null! }, NoCards));
    }

    [Theory(DisplayName = "AC-3804.1 tcp: 없이 ':'가 든 값·밖 숫자 주소(tcp: 뒤 IPv6 포함)는 이름을 풀지 않고 막는다")]
    [InlineData("np:SERVER")]
    [InlineData(@"np:\\SERVER\pipe\sql\query")]
    [InlineData("lpc:.")]
    [InlineData("admin:SERVER")]
    [InlineData("fe80::1")]
    [InlineData(@"8.8.8.8\SQLEXPRESS")]
    [InlineData("tcp:8.8.8.8,1433")]
    [InlineData("100.64.0.1")]
    [InlineData("tcp:2001:db8:2::5")]
    public void RefusesWithoutResolving(string server)
    {
        var resolver = new Resolver().Answer("SERVER", "192.168.0.5");
        Assert.False(ErpServerRules.IsAllowed(server, Machine, resolver.Resolve, NoCards), server);
        Assert.Empty(resolver.Asked);
    }

    [Theory(DisplayName = "AC-3804.1 서버 이름이 비었거나 빈칸·제어 글자가 들면 풀지 않고 막는다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(@"\SQLEXPRESS")]
    [InlineData(",1433")]
    [InlineData("tcp:")]
    [InlineData("SER VER")]
    [InlineData("SER\tVER")]
    [InlineData("SERVER\u0001")]
    public void RefusesMalformedNames(string? server)
    {
        var resolver = new Resolver().Answer("SERVER", "192.168.0.5").Answer("SER VER", "192.168.0.5");
        Assert.False(ErpServerRules.IsAllowed(server, Machine, resolver.Resolve, NoCards), server ?? "(null)");
        Assert.Empty(resolver.Asked);
    }

    [Fact(DisplayName = "AC-3804.1 서버 이름은 255자까지 풀고, 256자면 풀지 않고 막는다")]
    public void LimitsNameLength()
    {
        var ok = new string('a', 255);
        var tooLong = new string('a', 256);
        var resolver = new Resolver().Answer(ok, "192.168.0.5").Answer(tooLong, "192.168.0.5");
        Assert.True(ErpServerRules.IsAllowed(ok, Machine, resolver.Resolve, NoCards));
        Assert.False(ErpServerRules.IsAllowed(tooLong, Machine, resolver.Resolve, NoCards));
        Assert.Equal(new[] { ok }, resolver.Asked);
    }

    // ---- AC-3804.2 Require -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3804.2 Require는 막는 값이면 BitException(E-BIT-DB-FAILED), 받는 값이면 아무 일도 없다")]
    public void RequireThrowsDbFailed()
    {
        var resolver = new Resolver().Answer("SERVER", "192.168.0.5").Answer("OUTSIDE", "8.8.8.8");
        ErpServerRules.Require(@"SERVER\SQLEXPRESS", Machine, resolver.Resolve, NoCards);
        ErpServerRules.Require(".", Machine, resolver.Resolve, NoCards);
        var error = Assert.Throws<BitException>(() => ErpServerRules.Require("OUTSIDE", Machine, resolver.Resolve, NoCards));
        Assert.Equal("E-BIT-DB-FAILED", error.Code);
        Assert.Equal(BitErrors.DbFailed, error.Code);
        Assert.Throws<BitException>(() => ErpServerRules.Require("np:SERVER", Machine, resolver.Resolve, NoCards));
    }

    [Fact(DisplayName = "AC-3804.2 이름 풀이·카드 목록·주소가 null이면 ArgumentNullException")]
    public void NullArguments()
    {
        var resolver = new Resolver();
        Assert.Throws<ArgumentNullException>(() => ErpServerRules.IsAllowed("SERVER", Machine, null!, NoCards));
        Assert.Throws<ArgumentNullException>(() => ErpServerRules.IsAllowed("SERVER", Machine, resolver.Resolve, null!));
        Assert.Throws<ArgumentNullException>(() => ErpServerRules.IsInside(null!, NoCards));
        Assert.Throws<ArgumentNullException>(() => ErpServerRules.IsInside(IPAddress.Loopback, null!));
        Assert.Throws<ArgumentNullException>(() => new ErpLocalNetwork(null!, 64));
    }
}
