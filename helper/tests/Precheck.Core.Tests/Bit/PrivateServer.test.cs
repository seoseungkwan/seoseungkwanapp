using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>AC-005.2 DB 서버 이름: 원본 HospitalSecurity.CheckPrivateServer(원본 HospitalSecurityTests 사례 포함).</summary>
public class PrivateServerTests
{
    [Theory(DisplayName = "AC-005.2 .·(local)·localhost·이 PC 이름·사설 IPv4(tcp: 앞붙임 허용)는 된다")]
    // 원본 HospitalSecurityTests 사례
    [InlineData(".")]
    [InlineData(@".\SQLEXPRESS")]
    [InlineData("localhost")]
    [InlineData("tcp:127.0.0.1,1433")]
    [InlineData("10.4.2.9")]
    [InlineData(@"172.16.0.1\BIT")]
    [InlineData("172.31.255.254")]
    [InlineData("192.168.50.2")]
    // 더한 사례
    [InlineData("(local)")]
    [InlineData(@"(LOCAL)\SQLEXPRESS")]
    [InlineData("LocalHost,1433")]
    [InlineData("BITPC")]
    [InlineData(@"bitpc\SQLEXPRESS")]
    [InlineData("tcp:BITPC,1433")]
    [InlineData("TCP:192.168.0.10")]
    [InlineData("  10.0.0.1  ")]
    public void AllowsLocalAndPrivate(string server)
    {
        Assert.True(PrivateServer.IsAllowed(server, Synthetic.MachineName));
        PrivateServer.Require(server, Synthetic.MachineName);
    }

    [Theory(DisplayName = "AC-005.2 공용 IP·확인 안 된 호스트 이름·named pipe·빈 이름은 E-BIT-DB-FAILED")]
    // 원본 HospitalSecurityTests 사례
    [InlineData("8.8.8.8")]
    [InlineData("172.15.0.1")]
    [InlineData("172.32.0.1")]
    [InlineData("192.169.1.1")]
    [InlineData("203.0.113.2")]
    [InlineData("db.example.com")]
    [InlineData(@"np:\\server\pipe\sql")]
    [InlineData("")]
    // 더한 사례
    [InlineData(null)]
    [InlineData("tcp:8.8.8.8,1433")]
    [InlineData("BITPC2")]
    [InlineData("lpc:BITPC")]
    [InlineData("::1")]
    [InlineData("tcp:::1")]
    [InlineData(@"\\BITPC\pipe\sql\query")]
    public void RefusesEverythingElse(string? server)
    {
        Assert.False(PrivateServer.IsAllowed(server, Synthetic.MachineName));
        var error = Assert.Throws<BitException>(() => PrivateServer.Require(server, Synthetic.MachineName));
        Assert.Equal("E-BIT-DB-FAILED", error.Code);
    }

    [Fact(DisplayName = "AC-005.2 접속 시간 제한은 ConnectTimeout=10초, 메타 읽기는 원본처럼 15초")]
    public void Timeouts()
    {
        Assert.Equal(10, Sql.ConnectTimeoutSeconds);
        Assert.Equal(15, Sql.MetaTimeout.TotalSeconds);
    }
}
