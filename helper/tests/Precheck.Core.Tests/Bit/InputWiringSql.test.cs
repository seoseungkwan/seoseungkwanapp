using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>AC-035.1 내원 수 SQL. 원본에 없는 새 SELECT라 사본 대신 조건을 글자로 본다.</summary>
public class InputWiringSqlTests
{
    private static string Squash(string sql) => ReadOnlyGuardTests.Squash(sql);

    [Fact(DisplayName = "AC-035.1 InputVisitCountSql은 허용 목록의 SELECT 하나이고 기간만 걸러 OcmInf 줄을 차트번호·내원일마다 모두 센다")]
    public void CountsEveryRowInPeriod()
    {
        var sql = Squash(Sql.InputVisitCountSql);

        Assert.True(Sql.IsAllowed(Sql.InputVisitCountSql));
        Assert.Contains(Sql.InputVisitCountSql, ReadOnlyGuardTests.Derived);
        Assert.Equal(
            "SELECT RTRIM(c.OcmChtNum) PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,COUNT_BIG(*) Visits FROM dbo.OcmInf c " +
            "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to GROUP BY RTRIM(c.OcmChtNum),LEFT(c.OcmAcpDtm,8)",
            sql);
    }

    [Theory(DisplayName = "AC-035.1 ClaimDatesSql의 방문 조건을 쓰지 않고, 이름·메모를 읽지 않는다")]
    [InlineData("OcmPatTyp")]
    [InlineData("OcmRsuYon")]
    [InlineData("OcmComStt")]
    [InlineData("DepMst")]
    [InlineData("OcmBilCmt")]
    [InlineData("Nam")]
    [InlineData("PatMst")]
    public void NothingElseIsRead(string word)
    {
        Assert.DoesNotContain(word, Sql.InputVisitCountSql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.1 매개변수는 기간 둘뿐이다(@from·@to Char 12). 그 밖이면 관문이 E-BIT-READ-FAILED로 막는다")]
    public void ParametersArePeriodOnly()
    {
        Assert.Equal(new[] { "@from:Char:12", "@to:Char:12" }, Sql.ParametersOf(Sql.InputVisitCountSql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));

        ReadOnlyGuard.Require(Sql.InputVisitCountSql, new Dictionary<string, object?> { ["@from"] = "202610270000", ["@to"] = "202610280000" });
        var extra = new Dictionary<string, object?> { ["@from"] = "202610270000", ["@to"] = "202610280000", ["@hospital"] = Synthetic.Scope };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(Sql.InputVisitCountSql, extra)).Code);
    }
}
