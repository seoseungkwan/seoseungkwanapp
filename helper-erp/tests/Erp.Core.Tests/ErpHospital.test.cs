using System;
using System.Linq;
using Erp.Core;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3807.1·AC-3807.2 ERP 도우미 등록·등록 확인(spec erp-bit-anywhere REQ-3807): 기존 RegisterFlow.Run·HospitalGate.Open과 같은 차례이고,
/// 범위 확인만 'DB 안 범위가 등록 범위 하나뿐' 대신 'DB 안 범위에 등록 범위가 들어 있음'이다. 기존 시험의 가짜(Rig·FakeSession·Synthetic)로 본다.
/// </summary>
public class ErpHospitalTests
{
    /// <summary>막혔을 때: 그 번호이고, 확인 창을 띄우지 않고, 저장하지 않고, 세션을 닫았다</summary>
    private static void RegisterStops(Rig rig, string code)
    {
        Assert.Equal(code, Assert.Throws<BitException>(() => ErpHospital.Register(rig.Services)).Code);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Null(rig.Store.Load());
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-3807.1 범위 하나: 기존 등록과 같이 비트 로그인 → 계정 범위 → 기관기호 → 범위 확인 → 확인 창 → 저장(세션은 확인 창 전에 닫음)")]
    public void RegisterSingleScope()
    {
        using var rig = new Rig();
        Assert.True(ErpHospital.Register(rig.Services));
        var saved = rig.Store.Load()!;
        Assert.Equal(Synthetic.Institution, saved.InstitutionCode);
        Assert.Equal(Synthetic.Scope, saved.Scope);
        Assert.Equal(Synthetic.Root, saved.InstallPath);
        Assert.Equal(Synthetic.Server, saved.Server);
        Assert.Equal(Synthetic.Database, saved.Database);
        Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
        var shown = Assert.Single(rig.Confirm.Shown);
        Assert.Equal(RegisterPrompt.Build(saved), shown.Text);
        Assert.Equal(RegisterFlow.ConfirmTimeout, shown.Timeout);
        Assert.Equal(new[] { Synthetic.Root }, rig.Login.Calls);
        Assert.Equal(new[] { Sql.UserScopeSql, Sql.InstitutionSql, Sql.ScopesSql }, rig.Session.Sqls);
        Assert.All(rig.Session.Sqls, sql => Assert.True(ErpReadGuard.IsAllowed(sql)));
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-3807.1 DB 안 범위가 여럿이어도(빈 값·NULL 줄 무시) 로그인 계정의 범위가 들어 있으면 그 범위로 등록한다")]
    public void RegisterManyScopes()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, "FOREIGN", Synthetic.Scope + " ", "", null, "OTHER");
            Assert.True(ErpHospital.Register(rig.Services));
            Assert.Equal(Synthetic.Scope, rig.Store.Load()!.Scope);
            Assert.Single(rig.Confirm.Shown);
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql, "FOREIGN ");
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            Assert.True(ErpHospital.Register(rig.Services));
            Assert.Equal("FOREIGN", rig.Store.Load()!.Scope);
        }
    }

    [Fact(DisplayName = "AC-3807.1 DB 안에 계정 범위가 없거나(대소문자도 같아야 함), 계정 범위가 없거나 둘이거나, 기관기호가 8자리가 아니면 E-BIT-HOSPITAL-MISMATCH(확인 창·저장 없음)")]
    public void RegisterStopsWhenScopeMissing()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, "FOREIGN", "OTHER", "");
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, "synthetic", "FOREIGN");
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql);
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql);
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope, "FOREIGN");
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.InstitutionSql, "1234567");
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
    }

    [Fact(DisplayName = "AC-3807.1 비트 로그인 취소·[취소]면 false이고 저장하지 않는다, 비트를 못 찾거나 DB에 못 붙으면 그 번호로 멈춘다(로그인 창 없음)")]
    public void RegisterCancelAndFailures()
    {
        using (var rig = new Rig())
        {
            rig.Login.User = null;
            Assert.False(ErpHospital.Register(rig.Services));
            Assert.Empty(rig.Confirm.Shown);
            Assert.Null(rig.Store.Load());
        }
        using (var rig = new Rig())
        {
            rig.Confirm.Answer = false;
            Assert.False(ErpHospital.Register(rig.Services));
            Assert.Single(rig.Confirm.Shown);
            Assert.Null(rig.Store.Load());
        }
        using (var rig = new Rig())
        {
            rig.Locator.FailCode = BitErrors.NotFound;
            Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => ErpHospital.Register(rig.Services)).Code);
            Assert.Empty(rig.Login.Calls);
        }
        using (var rig = new Rig())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            Assert.Equal("E-BIT-DB-FAILED", Assert.Throws<BitException>(() => ErpHospital.Register(rig.Services)).Code);
            Assert.Empty(rig.Login.Calls);
        }
    }

    [Fact(DisplayName = "AC-3807.1 작업일이 오늘이 아니면 그날과 오늘의 기관기호를 모두 확인한다(기존 등록과 같음)")]
    public void RegisterChecksWorkDayAndToday()
    {
        using (var rig = new Rig())
        {
            rig.Login.User = new VendorUser("SYNUSER", "20261029");
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            Assert.True(ErpHospital.Register(rig.Services));
            var days = rig.Session.Calls.Where(c => c.Sql == Sql.InstitutionSql).Select(c => (string)c.Args["@day"]!).ToArray();
            Assert.Equal(new[] { "20261029", "20261030" }, days);
        }
        using (var rig = new Rig())
        {
            rig.Login.User = new VendorUser("SYNUSER", "20261029");
            rig.Session.Answer(Sql.InstitutionSql, args => new[] { new object?[] { (string)args["@day"]! == "20261029" ? Synthetic.Institution : Synthetic.OtherInstitution } });
            RegisterStops(rig, "E-BIT-HOSPITAL-MISMATCH");
        }
    }

    [Fact(DisplayName = "AC-3807.1 다시 등록: 기관기호가 같으면 프로필 ID를 그대로 두고 확인 창에 전 값을 함께 보인다, 다르면 새 프로필 ID")]
    public void ReRegister()
    {
        using (var rig = new Rig().Registered(Synthetic.Registration(server: "192.168.0.10")))
        {
            var previous = rig.Store.Load()!;
            Assert.True(ErpHospital.Register(rig.Services));
            var saved = rig.Store.Load()!;
            Assert.Equal(previous.ProfileId, saved.ProfileId);
            Assert.Empty(rig.IssuedIds);
            Assert.Equal(RegisterPrompt.Build(saved, previous), Assert.Single(rig.Confirm.Shown).Text);
        }
        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            Assert.True(ErpHospital.Register(rig.Services));
            Assert.Equal(rig.IssuedIds.Single(), rig.Store.Load()!.ProfileId);
        }
    }

    [Fact(DisplayName = "AC-3807.1 깨진 등록 파일·깨진 .bak이면 전 등록 없이 처음 등록처럼 한다(새 프로필 ID)")]
    public void BrokenPreviousRegistersFresh()
    {
        using var rig = new Rig();
        System.IO.Directory.CreateDirectory(rig.Folder);
        var dat = System.IO.Path.Combine(rig.Folder, "registration.dat");
        System.IO.File.WriteAllBytes(dat, System.Text.Encoding.ASCII.GetBytes("broken-dat"));
        System.IO.File.WriteAllBytes(dat + ".bak", System.Text.Encoding.ASCII.GetBytes("broken-bak"));
        Assert.True(ErpHospital.Register(rig.Services));
        var saved = rig.Store.Load()!;
        Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
        Assert.Equal(RegisterPrompt.Build(saved), Assert.Single(rig.Confirm.Shown).Text);
    }

    [Fact(DisplayName = "AC-3807.2 등록이 없으면 비트를 찾거나 열지 않고 E-BIT-NOT-REGISTERED")]
    public void OpenNotRegistered()
    {
        using var rig = new Rig();
        Assert.Equal("E-BIT-NOT-REGISTERED", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
        Assert.Equal(0, rig.Locator.Calls);
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-3807.2 등록 병원과 같으면 열린 세션과 등록을 넘긴다: 범위가 하나이든 여럿이든(빈 값·NULL 무시) 등록 범위가 들어 있으면 통과, 오늘 기관기호를 확인")]
    public void OpenPasses()
    {
        foreach (var scopes in new[] { new[] { Synthetic.Scope }, new[] { "FOREIGN", Synthetic.Scope + " ", "", null, "OTHER" } })
        {
            using var rig = new Rig().Registered();
            rig.Session.Answer(Sql.ScopesSql, scopes);
            using (var hospital = ErpHospital.Open(rig.Services))
            {
                Assert.Same(rig.Session, hospital.Db);
                Assert.Equal(Synthetic.Institution, hospital.Registration.InstitutionCode);
                Assert.Equal(Synthetic.Scope, hospital.Registration.Scope);
                Assert.Equal(0, rig.Session.Disposed);
                Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, rig.Session.Sqls);
                Assert.Equal("20261030", rig.Session.Calls[1].Args["@day"]);
                Assert.Equal(Synthetic.Scope, rig.Session.Calls[1].Args["@scope"]);
            }
            Assert.Equal(1, rig.Session.Disposed);
        }
    }

    [Fact(DisplayName = "AC-3807.2 DB 안에 등록 범위가 없거나, 오늘 기관기호·설치 위치·서버·DB 이름이 등록과 다르면 E-BIT-HOSPITAL-MISMATCH, 세션은 닫음")]
    public void OpenMismatch()
    {
        using (var rig = new Rig().Registered())
        {
            rig.Session.Answer(Sql.ScopesSql, "FOREIGN", "OTHER");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
            Assert.Equal(1, rig.Session.Disposed);
            Assert.DoesNotContain(Sql.InstitutionSql, rig.Session.Sqls);
        }
        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
            Assert.Equal(1, rig.Session.Disposed);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Today = new DateTime(2026, 11, 2);
            rig.Session.Answer(Sql.InstitutionSql, args => (string)args["@day"]! == "20261102" ? new object?[0][] : new[] { new object?[] { Synthetic.Institution } });
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
        }
        foreach (var registration in new[]
        {
            Synthetic.Registration(install: @"D:\Elsewhere"),
            Synthetic.Registration(server: "192.168.0.99"),
            Synthetic.Registration(database: "OTHERDB"),
        })
        {
            using var rig = new Rig().Registered(registration);
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
            Assert.Empty(rig.Session.Sqls);
            Assert.Equal(1, rig.Session.Disposed);
        }
    }

    [Fact(DisplayName = "AC-3807.2 비트를 못 찾거나 DB에 못 붙으면 그 번호로 막는다, 등록 파일이 깨지고 .bak이 없으면 비트를 열지 않고 E-STORE-BROKEN")]
    public void OpenFailures()
    {
        using (var rig = new Rig().Registered())
        {
            rig.Locator.FailCode = BitErrors.NotFound;
            Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
        }
        using (var rig = new Rig().Registered())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            Assert.Equal("E-BIT-DB-FAILED", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
        }
        using (var rig = new Rig())
        {
            System.IO.Directory.CreateDirectory(rig.Folder);
            System.IO.File.WriteAllBytes(System.IO.Path.Combine(rig.Folder, "registration.dat"), System.Text.Encoding.ASCII.GetBytes("broken"));
            Assert.Equal("E-STORE-BROKEN", Assert.Throws<BitException>(() => ErpHospital.Open(rig.Services)).Code);
            Assert.Equal(0, rig.Locator.Calls);
            Assert.Empty(rig.Connector.Opened);
        }
    }
}
