using System.Data.SqlClient;
using Precheck.Core.Bit;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Connect;

/// <summary>AC-005.2 비트 접속 글자 굳히기: ConnectTimeout=10, 보안 정보 남기지 않음, 내 PC·사설 IP 서버만. 윈도우에서만 돈다.</summary>
public class ReadOnlyConnectionTests
{
    private const string Root = @"C:\DrBIT50";

    [Fact(DisplayName = "AC-005.2 비트 접속 정보는 ConnectTimeout=10·PersistSecurityInfo=false로 굳히고 서버·DB 이름을 대상에 둔다")]
    public void Hardens()
    {
        var info = ReadOnlyConnection.Harden(@"Data Source=.\SQLEXPRESS;Initial Catalog=DRBIT;User ID=synthetic;Password=synthetic;Connect Timeout=60;Persist Security Info=True", Root, "BITPC");
        var options = new SqlConnectionStringBuilder(info.ConnectionString);

        Assert.Equal(10, options.ConnectTimeout);
        Assert.False(options.PersistSecurityInfo);
        Assert.Equal(ReadOnlyConnection.ApplicationName, options.ApplicationName);
        Assert.Equal(@".\SQLEXPRESS", info.Target.Server);
        Assert.Equal("DRBIT", info.Target.Database);
        Assert.Equal(Root, info.Target.InstallPath);
    }

    [Theory(DisplayName = "AC-005.2 공용 IP·모르는 호스트·named pipe·DB 이름 없음·틀린 접속 글자는 붙기 전에 E-BIT-DB-FAILED")]
    [InlineData("Data Source=8.8.8.8;Initial Catalog=DRBIT;Integrated Security=True")]
    [InlineData("Data Source=db.example.com;Initial Catalog=DRBIT;Integrated Security=True")]
    [InlineData(@"Data Source=np:\\server\pipe\sql\query;Initial Catalog=DRBIT;Integrated Security=True")]
    [InlineData(@"Data Source=.\SQLEXPRESS;Integrated Security=True")]
    [InlineData("this is not a connection string")]
    public void Refuses(string source)
    {
        Assert.Equal("E-BIT-DB-FAILED", Assert.Throws<BitException>(() => ReadOnlyConnection.Harden(source, Root, "BITPC")).Code);
    }
}
