using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.6 등록 확인 관문: 뒤 TASK의 모든 읽기·입력 명령이 처음에 부른다(Commands/RequireHospital).
/// 등록이 없으면 E-BIT-NOT-REGISTERED, 다르면 E-BIT-HOSPITAL-MISMATCH로 그 명령을 하지 않는다.
/// </summary>
public class HospitalGateTests
{
    [Fact(DisplayName = "AC-005.6 등록이 없으면 비트를 찾거나 열지 않고 E-BIT-NOT-REGISTERED")]
    public void NotRegistered()
    {
        using var rig = new Rig();
        var error = Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services));
        Assert.Equal("E-BIT-NOT-REGISTERED", error.Code);
        Assert.Equal(0, rig.Locator.Calls);
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-005.6 등록 병원과 같으면 열린 세션과 등록을 넘긴다(오늘 날짜로 다시 확인)")]
    public void Passes()
    {
        using var rig = new Rig().Registered();
        using (var hospital = HospitalGate.Open(rig.Services))
        {
            Assert.Same(rig.Session, hospital.Db);
            Assert.Equal(Synthetic.Institution, hospital.Registration.InstitutionCode);
            Assert.Equal(0, rig.Session.Disposed);
            Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, rig.Session.Sqls);
            Assert.Equal("20261030", rig.Session.Calls[1].Args["@day"]);
        }
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-005.6 오늘의 기관기호·범위·설치 위치가 등록과 다르면 E-BIT-HOSPITAL-MISMATCH, 세션은 닫음")]
    public void Mismatch()
    {
        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
            Assert.Equal(1, rig.Session.Disposed);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Session.Answer(Sql.ScopesSql, "FOREIGN");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Today = new System.DateTime(2026, 11, 2);
            rig.Session.Answer(Sql.InstitutionSql, args => (string)args["@day"]! == "20261102" ? new object?[0][] : new[] { new object?[] { Synthetic.Institution } });
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Locator.Root = @"D:\DrBIT50";
            rig.Session.Target = Synthetic.Target(install: @"D:\DrBIT50");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
        }
    }

    [Fact(DisplayName = "AC-005.6 비트를 못 찾거나 DB에 못 붙으면 그 번호로 막는다")]
    public void FindOrDbFails()
    {
        using (var rig = new Rig().Registered())
        {
            rig.Locator.FailCode = BitErrors.NotFound;
            Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            Assert.Equal("E-BIT-DB-FAILED", Assert.Throws<BitException>(() => HospitalGate.Open(rig.Services)).Code);
        }
    }
}
