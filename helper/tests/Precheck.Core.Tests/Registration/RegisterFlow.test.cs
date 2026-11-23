using System;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.5 bit.register: 비트 로그인 → 범위(ValidateScope) → 기관기호(8자리) → PC 확인 창 [확인] → registration.dat.
/// [취소]·창 닫기·시간 지남이면 저장하지 않는다. 다시 등록은 같은 길, 기관기호가 같으면 프로필 ID를 그대로 둔다.
/// </summary>
public class RegisterFlowTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static JsonElement Handle(Rig rig, string argsJson = "{}")
    {
        var dispatcher = new Dispatcher(Table);
        BitCommands.Register(dispatcher, rig.Services);
        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.register", argsJson, id: "r-1")), sink);
        return Assert.Single(sink.Replies);
    }

    private static bool Registered(JsonElement reply)
    {
        Assert.Equal("result", reply.GetProperty("type").GetString());
        var data = reply.GetProperty("data");
        Assert.Equal(new[] { "registered" }, Json.Keys(data));
        return data.GetProperty("registered").GetBoolean();
    }

    private static string ErrorCode(JsonElement reply)
    {
        Assert.Equal("error", reply.GetProperty("type").GetString());
        return reply.GetProperty("code").GetString()!;
    }

    [Fact(DisplayName = "AC-005.5 [확인]이면 비트에서 읽은 병원 값을 registration.dat에 저장하고 {registered: true}")]
    public void ConfirmSaves()
    {
        using var rig = new Rig();
        Assert.True(Registered(Handle(rig)));

        var saved = rig.Store.Load();
        Assert.NotNull(saved);
        Assert.Equal(Synthetic.Institution, saved!.InstitutionCode);
        Assert.Equal(Synthetic.Scope, saved.Scope);
        Assert.Equal(Synthetic.Root, saved.InstallPath);
        Assert.Equal(Synthetic.Server, saved.Server);
        Assert.Equal(Synthetic.Database, saved.Database);
        Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
        Assert.Matches("^[0-9a-f]{32}$", saved.ProfileId);

        // 확인 창은 한 번, 글은 저장한 값으로 만든 것 그대로, 5분 뒤 취소
        var shown = Assert.Single(rig.Confirm.Shown);
        Assert.Equal(RegisterPrompt.Build(saved), shown.Text);
        Assert.Equal(TimeSpan.FromMinutes(5), shown.Timeout);

        // 비트 로그인 → 읽은 SQL은 모두 허용 목록 안, 세션은 닫음
        Assert.Equal(new[] { Synthetic.Root }, rig.Login.Calls);
        Assert.All(rig.Session.Sqls, sql => Assert.Contains(sql, Sql.All));
        Assert.DoesNotContain(Sql.UserScopeSql, rig.Session.Sqls); // 계정 범위는 읽지 않는다(AC-005.13)
        Assert.Contains(Sql.ScopesSql, rig.Session.Sqls);
        Assert.Contains(Sql.InstitutionSql, rig.Session.Sqls);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-005.5 [취소]·창 닫기·5분 지남이면 저장하지 않고 {registered: false}")]
    public void CancelDoesNotSave()
    {
        using var rig = new Rig();
        rig.Confirm.Answer = false;
        Assert.False(Registered(Handle(rig)));
        Assert.Null(rig.Store.Load());
        Assert.Single(rig.Confirm.Shown);
        Assert.Empty(System.IO.Directory.Exists(rig.Folder) ? System.IO.Directory.GetFiles(rig.Folder) : new string[0]);
    }

    [Fact(DisplayName = "AC-005.5 비트 로그인을 취소하면 확인 창 없이 {registered: false}")]
    public void LoginCancelled()
    {
        using var rig = new Rig();
        rig.Login.User = null;
        Assert.False(Registered(Handle(rig)));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Null(rig.Store.Load());
    }

    /// <summary>막혔을 때: 그 번호이고, 확인 창을 띄우지 않고, 저장하지 않고, 세션을 닫았다</summary>
    private static void StopsWith(Rig rig, string code)
    {
        Assert.Equal(code, ErrorCode(Handle(rig)));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Null(rig.Store.Load());
        Assert.Equal(1, rig.Session.Disposed);
    }

    /// <summary>등록됐을 때: 확인 창 한 번, 저장한 범위·기관기호가 그 값</summary>
    private static void SavesWith(Rig rig, string scope, string institution)
    {
        Assert.True(Registered(Handle(rig)));
        Assert.Single(rig.Confirm.Shown);
        var saved = rig.Store.Load();
        Assert.NotNull(saved);
        Assert.Equal(scope, saved!.Scope);
        Assert.Equal(institution, saved.InstitutionCode);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-005.13 로그인한 계정의 범위가 없거나 둘이어도, 계정·작업일 모양이 틀려도 DB 안 범위 하나로 등록한다(계정 범위를 읽지 않음)")]
    public void AccountDoesNotDecide()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql);
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
            Assert.DoesNotContain(Sql.UserScopeSql, rig.Session.Sqls);
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope, "FOREIGN");
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
        }
        foreach (var user in new[] { new VendorUser("", "20261030"), new VendorUser("NINECHARS", "20261030"), new VendorUser("SYNUSER", "2026-10-30"), new VendorUser("SYNUSER", "") })
        {
            using var rig = new Rig();
            rig.Login.User = user;
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
        }
    }

    [Fact(DisplayName = "AC-005.13 DB 안 범위에 빈 값·NULL 줄이 섞여 있어도 빼고 하나면 등록한다")]
    public void BlankScopesIgnored()
    {
        using var rig = new Rig();
        rig.Session.Answer(Sql.ScopesSql, "", Synthetic.Scope + " ", null, "   ");
        SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
    }

    [Fact(DisplayName = "AC-005.13 DB 안 범위가 (빈 값을 빼고) 없으면 E-BIT-REG-NONE")]
    public void NoHospitalStops()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql);
            StopsWith(rig, "E-BIT-REG-NONE");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, "", null, "  ");
            StopsWith(rig, "E-BIT-REG-NONE");
        }
    }

    [Fact(DisplayName = "AC-005.13 DB 안 병원 범위가 그것 하나가 아니면 E-BIT-REG-MANY")]
    public void ManyHospitalsStop()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            StopsWith(rig, "E-BIT-REG-MANY");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "", "FOREIGN ");
            StopsWith(rig, "E-BIT-REG-MANY");
        }
    }

    [Fact(DisplayName = "AC-005.13 그날 8자리 기관기호가 없거나 서로 다른 값이 둘이면 빈 기관기호로 등록한다(막지 않음, 확인 창은 '기관기호 못 찾음')")]
    public void InstitutionMissingStillRegisters()
    {
        foreach (var rows in new[] { new string?[] { "1234567" }, new string?[0], new string?[] { Synthetic.Institution, Synthetic.OtherInstitution } })
        {
            using var rig = new Rig();
            rig.Session.Answer(Sql.InstitutionSql, rows);
            SavesWith(rig, Synthetic.Scope, "");
            Assert.Contains("기관기호 못 찾음", rig.Confirm.Shown.Single().Text);
        }
    }

    [Fact(DisplayName = "AC-005.13 다시 등록: 기관기호가 같아도 범위가 다르면 새 프로필 ID, 기관기호가 둘 다 비었고 범위가 같으면 프로필 ID를 그대로 둔다")]
    public void ReRegisterNeedsSameScope()
    {
        var previous = Synthetic.Registration(scope: "OLDSCOPE");
        using (var rig = new Rig().Registered(previous))
        {
            Assert.True(Registered(Handle(rig)));
            Assert.Equal(rig.IssuedIds.Single(), rig.Store.Load()!.ProfileId);
            Assert.NotEqual(previous.ProfileId, rig.Store.Load()!.ProfileId);
        }
        var noCode = Synthetic.Registration(institution: "");
        using (var rig = new Rig().Registered(noCode))
        {
            rig.Session.Answer(Sql.InstitutionSql);
            Assert.True(Registered(Handle(rig)));
            Assert.Equal(noCode.ProfileId, rig.Store.Load()!.ProfileId);
            Assert.Empty(rig.IssuedIds);
        }
    }

    [Fact(DisplayName = "AC-005.13 오늘 기관기호 줄 가운데 8자리 숫자가 아닌 줄·빈 줄·같은 값 거듭은 빼고 하나면 등록한다")]
    public void InstitutionNoiseIgnored()
    {
        using var rig = new Rig();
        rig.Session.Answer(Sql.InstitutionSql, Synthetic.Institution, "1234567", null, "", Synthetic.Institution + " ", "ABCDEFGH");
        SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
    }

    [Fact(DisplayName = "AC-005.13 저장할 설치 위치·서버·DB 이름이 등록 모양에 맞지 않으면 E-BIT-REG-PLACE")]
    public void PlaceStops()
    {
        using var rig = new Rig();
        rig.Session.Target = Synthetic.Target(server: "");
        StopsWith(rig, "E-BIT-REG-PLACE");
    }

    [Fact(DisplayName = "AC-005.13 읽기 실패 같은 다른 번호는 그대로 낸다")]
    public void OtherCodesPassThrough()
    {
        using (var rig = new Rig())
        {
            rig.Session.Fail(Sql.ScopesSql, BitErrors.ReadFailed);
            StopsWith(rig, "E-BIT-READ-FAILED");
        }
        using (var rig = new Rig())
        {
            rig.Session.Fail(Sql.InstitutionSql, BitErrors.ReadFailed);
            StopsWith(rig, "E-BIT-READ-FAILED");
        }
    }

    [Fact(DisplayName = "AC-005.5 비트를 못 찾거나 DB에 못 붙으면 그 번호로 멈춘다(로그인 창을 띄우지 않음)")]
    public void FindOrDbFails()
    {
        using (var rig = new Rig())
        {
            rig.Locator.FailCode = BitErrors.NotFound;
            Assert.Equal("E-BIT-NOT-FOUND", ErrorCode(Handle(rig)));
            Assert.Empty(rig.Login.Calls);
        }
        using (var rig = new Rig())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            Assert.Equal("E-BIT-DB-FAILED", ErrorCode(Handle(rig)));
            Assert.Empty(rig.Login.Calls);
        }
    }

    [Fact(DisplayName = "AC-005.13 비트 작업일이 오늘과 달라도 오늘 날짜의 기관기호만 본다")]
    public void ChecksTodayOnly()
    {
        using var rig = new Rig();
        rig.Login.User = new VendorUser("SYNUSER", "20261029");
        rig.Session.Answer(Sql.InstitutionSql, args => new[] { new object?[] { (string)args["@day"]! == "20261030" ? Synthetic.Institution : Synthetic.OtherInstitution } });
        SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
        var days = rig.Session.Calls.Where(c => c.Sql == Sql.InstitutionSql).Select(c => (string)c.Args["@day"]!).ToArray();
        Assert.Equal(new[] { "20261030" }, days);
        Assert.Equal(Synthetic.Scope, rig.Session.Calls.Single(c => c.Sql == Sql.InstitutionSql).Args["@scope"]);
    }

    [Fact(DisplayName = "AC-005.5 다시 등록: 전 값과 새 값을 함께 보이고, 기관기호가 같으면 프로필 ID를 그대로 두고 바꿔 쓴다")]
    public void ReRegisterSameInstitutionKeepsProfile()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(server: "192.168.0.10"));
        var previous = rig.Store.Load()!;

        Assert.True(Registered(Handle(rig)));
        var saved = rig.Store.Load()!;
        Assert.Equal(previous.ProfileId, saved.ProfileId);
        Assert.Equal(Synthetic.Server, saved.Server);
        Assert.Empty(rig.IssuedIds);
        Assert.Equal(RegisterPrompt.Build(saved, previous), Assert.Single(rig.Confirm.Shown).Text);
    }

    [Fact(DisplayName = "AC-005.5 다시 등록: 기관기호가 다르면 새 프로필 ID, [취소]면 전 등록을 그대로 둔다")]
    public void ReRegisterOtherInstitution()
    {
        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            Assert.True(Registered(Handle(rig)));
            var saved = rig.Store.Load()!;
            Assert.Equal(Synthetic.Institution, saved.InstitutionCode);
            Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
            Assert.NotEqual(Synthetic.ProfileId, saved.ProfileId);
        }

        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            rig.Confirm.Answer = false;
            Assert.False(Registered(Handle(rig)));
            var kept = rig.Store.Load()!;
            Assert.Equal(Synthetic.OtherInstitution, kept.InstitutionCode);
            Assert.Equal(Synthetic.ProfileId, kept.ProfileId);
        }
    }

    [Fact(DisplayName = "AC-005.5 웹이 글을 보내도 받지 않는다: bit.register에 칸이 있으면 E-HELPER-BAD-MESSAGE, 창을 띄우지 않음")]
    public void WebTextIsNeverShown()
    {
        using var rig = new Rig();
        var reply = Handle(rig, "{\"text\":\"가상의원으로 등록\"}");
        Assert.Equal("E-HELPER-BAD-MESSAGE", ErrorCode(reply));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Login.Calls);
    }

    [Fact(DisplayName = "AC-005.9 저장한 등록에 병원 이름 칸이 없고, 확인 창 글에 범위 값이 이름 자리로 나오지 않는다")]
    public void SavedRegistrationHasNoName()
    {
        using var rig = new Rig();
        Assert.True(Registered(Handle(rig)));

        Assert.Null(typeof(HospitalRegistration).GetProperty("HospitalName"));
        var raw = System.IO.File.ReadAllBytes(rig.Store.FilePath);
        var json = Encoding.UTF8.GetString(rig.Protector.Unprotect(raw.Skip(RegistrationFile.Header.Length).ToArray()));
        Assert.DoesNotContain("hospitalName", json);
        Assert.Equal(1, json.Split(new[] { Synthetic.Scope }, StringSplitOptions.None).Length - 1);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Contains("\r\n\r\n기관기호 1234****\r\n비트 병원 범위: " + Synthetic.Scope + "\r\n", text);
        Assert.Equal(1, text.Split(new[] { Synthetic.Scope }, StringSplitOptions.None).Length - 1);
    }

    [Fact(DisplayName = "AC-005.12 깨진 registration.dat·깨진 .bak이면 처음 등록처럼(전 값 없이, 새 프로필 ID) 등록하고 깨진 두 파일은 이름을 바꿔 남긴다")]
    public void BrokenPreviousRegistersFresh()
    {
        using var rig = new Rig();
        System.IO.Directory.CreateDirectory(rig.Folder);
        var dat = System.IO.Path.Combine(rig.Folder, "registration.dat");
        System.IO.File.WriteAllBytes(dat, Encoding.ASCII.GetBytes("broken-dat"));
        System.IO.File.WriteAllBytes(dat + ".bak", Encoding.ASCII.GetBytes("broken-bak"));
        Assert.Equal("E-STORE-BROKEN", Assert.Throws<BitException>(() => rig.Store.Load()).Code);

        Assert.True(Registered(Handle(rig)));

        var saved = rig.Store.Load()!;
        Assert.Equal(Synthetic.Institution, saved.InstitutionCode);
        Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.StartsWith("이 병원으로 등록할까요?", text);
        Assert.Equal(RegisterPrompt.Build(saved), text);

        var names = System.IO.Directory.GetFiles(rig.Folder).Select(f => System.IO.Path.GetFileName(f)!).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(3, names.Length);
        Assert.Equal("registration.dat", names[0]);
        Assert.StartsWith("registration.dat.bak.broken-", names[1]);
        Assert.StartsWith("registration.dat.broken-", names[2]);
        Assert.Equal("broken-bak", System.IO.File.ReadAllText(System.IO.Path.Combine(rig.Folder, names[1])));
        Assert.Equal("broken-dat", System.IO.File.ReadAllText(System.IO.Path.Combine(rig.Folder, names[2])));
    }

    [Fact(DisplayName = "AC-005.12 깨진 registration.dat에서 [취소]면 아무 파일도 바꾸지 않는다")]
    public void BrokenPreviousCancelKeepsFiles()
    {
        using var rig = new Rig();
        rig.Confirm.Answer = false;
        System.IO.Directory.CreateDirectory(rig.Folder);
        System.IO.File.WriteAllBytes(rig.Store.FilePath, Encoding.ASCII.GetBytes("broken-dat"));

        Assert.False(Registered(Handle(rig)));
        Assert.StartsWith("이 병원으로 등록할까요?", Assert.Single(rig.Confirm.Shown).Text);
        Assert.Equal(new[] { "registration.dat" }, System.IO.Directory.GetFiles(rig.Folder).Select(System.IO.Path.GetFileName));
        Assert.Equal("broken-dat", System.IO.File.ReadAllText(rig.Store.FilePath));
    }
}
