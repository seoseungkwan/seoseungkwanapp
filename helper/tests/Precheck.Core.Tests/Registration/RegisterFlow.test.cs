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
        Assert.Contains(Sql.UserScopeSql, rig.Session.Sqls);
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

    [Fact(DisplayName = "AC-005.5 범위가 하나가 아니거나 기관기호가 8자리가 아니면 확인 창 없이 E-BIT-HOSPITAL-MISMATCH")]
    public void BadHospitalStops()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope, "FOREIGN");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", ErrorCode(Handle(rig)));
            Assert.Empty(rig.Confirm.Shown);
            Assert.Null(rig.Store.Load());
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", ErrorCode(Handle(rig)));
            Assert.Empty(rig.Confirm.Shown);
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.InstitutionSql, "1234567");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", ErrorCode(Handle(rig)));
            Assert.Empty(rig.Confirm.Shown);
            Assert.Equal(1, rig.Session.Disposed);
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

    [Fact(DisplayName = "AC-005.5 비트 작업일이 오늘과 다르면 그날과 오늘의 기관기호를 모두 확인한다(원본 Authorize)")]
    public void ChecksWorkDayAndToday()
    {
        using var rig = new Rig();
        rig.Login.User = new VendorUser("SYNUSER", "20261029");
        Assert.True(Registered(Handle(rig)));
        var days = rig.Session.Calls.Where(c => c.Sql == Sql.InstitutionSql).Select(c => (string)c.Args["@day"]!).ToArray();
        Assert.Equal(new[] { "20261029", "20261030" }, days);

        using var other = new Rig();
        other.Login.User = new VendorUser("SYNUSER", "20261029");
        other.Session.Answer(Sql.InstitutionSql, args => new[] { new object?[] { (string)args["@day"]! == "20261029" ? Synthetic.Institution : Synthetic.OtherInstitution } });
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", ErrorCode(Handle(other)));
        Assert.Empty(other.Confirm.Shown);
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
