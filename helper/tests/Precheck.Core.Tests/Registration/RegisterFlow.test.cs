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

    /// <summary>최근 30일 내원 답: (범위, 내원 수) 줄</summary>
    private static void Active(Rig rig, params (string? Scope, long Visits)[] rows) =>
        rig.Session.Answer(Sql.ActiveScopesSql, _ => rows.Select(row => new object?[] { row.Scope, row.Visits }).ToArray());

    [Fact(DisplayName = "AC-005.18 DB 안 범위가 여럿이면 로그인한 계정의 범위(DB 안에 있는 것)로 등록하고 최근 내원은 읽지 않는다")]
    public void ManyHospitalsUseAccountScope()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
            Assert.Contains(Sql.UserScopeSql, rig.Session.Sqls);
            Assert.DoesNotContain(Sql.ActiveScopesSql, rig.Session.Sqls);
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "", "FOREIGN ");
            rig.Session.Answer(Sql.UserScopeSql, "FOREIGN ");
            SavesWith(rig, "FOREIGN", Synthetic.Institution);
            Assert.DoesNotContain(Sql.ActiveScopesSql, rig.Session.Sqls);
        }
    }

    [Fact(DisplayName = "AC-005.18 계정 범위를 못 정하면(없음·둘·DB 밖·로그인 모양 틀림) 최근 30일 외래 내원이 있는 범위 하나로 등록한다(오늘 30일 전 0시 ~ 다음 날 0시)")]
    public void ManyHospitalsUseRecentVisits()
    {
        var accounts = new Action<Rig>[]
        {
            rig => rig.Session.Answer(Sql.UserScopeSql),
            rig => rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope, "FOREIGN"),
            rig => rig.Session.Answer(Sql.UserScopeSql, "ELSEWHERE"),
            rig => rig.Login.User = new VendorUser("NINECHARS", "20261030"),
        };
        foreach (var account in accounts)
        {
            using var rig = new Rig();
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            account(rig);
            Active(rig, ("FOREIGN ", 0), (Synthetic.Scope + " ", 812), ("ELSEWHERE", 5), ("", 9), (null, 4));
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            rig.Session.Answer(Sql.UserScopeSql);
            Active(rig, ("FOREIGN", 3));
            SavesWith(rig, "FOREIGN", Synthetic.Institution);
            var call = rig.Session.Calls.Single(c => c.Sql == Sql.ActiveScopesSql);
            Assert.Equal("202609300000", call.Args["@from"]);
            Assert.Equal("202610310000", call.Args["@to"]);
            Assert.Equal(Sql.MemoTimeout, call.Timeout);
            Assert.All(rig.Session.Sqls, sql => Assert.Contains(sql, Sql.All));
        }
    }

    [Fact(DisplayName = "AC-005.18 계정 범위도 최근 내원 범위도 하나로 못 정하면 E-BIT-REG-MANY, 읽기가 실패하면 그 번호로 멈춘다(저장 없음)")]
    public void ManyHospitalsStop()
    {
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            rig.Session.Answer(Sql.UserScopeSql);
            Active(rig, (Synthetic.Scope, 3), ("FOREIGN", 1));
            StopsWith(rig, "E-BIT-REG-MANY");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "", "FOREIGN ");
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope, "FOREIGN");
            Active(rig, (Synthetic.Scope, 0), ("", 9), (null, 4));
            StopsWith(rig, "E-BIT-REG-MANY");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            rig.Session.Answer(Sql.UserScopeSql);
            rig.Session.Fail(Sql.ActiveScopesSql, BitErrors.ReadFailed);
            StopsWith(rig, "E-BIT-READ-FAILED");
        }
        using (var rig = new Rig())
        {
            rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
            rig.Session.Fail(Sql.UserScopeSql, BitErrors.ReadFailed);
            StopsWith(rig, "E-BIT-READ-FAILED");
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

    // ── AC-005.19 병원 고르기 창(TASK-48): 범위가 둘 이상이고 고르기 창이 있으면 PC 확인 창 대신 고르기 창 ──

    /// <summary>범위 둘(SYNTHETIC·FOREIGN)과 범위마다 다른 오늘 기관기호</summary>
    private static Rig TwoHospitals()
    {
        var rig = new Rig(withPick: true);
        rig.Session.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
        rig.Session.Answer(Sql.InstitutionSql, args =>
            new[] { new object?[] { (string)args["@scope"]! == "FOREIGN" ? Synthetic.OtherInstitution : Synthetic.Institution } });
        return rig;
    }

    [Fact(DisplayName = "AC-005.19 범위가 둘 이상이면 고르기 창을 띄우고(PC 확인 창 없음, 5분), 고른 줄의 범위·기관기호로 저장한다(DB를 닫은 뒤 창)")]
    public void PickSaves()
    {
        using (var rig = TwoHospitals())
        {
            rig.Session.Answer(Sql.UserScopeSql);
            Active(rig, (Synthetic.Scope, 5));
            var disposedWhenShown = -1;
            rig.Pick.Answer = _ =>
            {
                disposedWhenShown = rig.Session.Disposed;
                return 1; // 미리 골라 둔 줄(0)이 아닌 줄을 사람이 고름
            };
            Assert.True(Registered(Handle(rig)));

            Assert.Empty(rig.Confirm.Shown);
            var shown = Assert.Single(rig.Pick.Shown);
            Assert.Equal(TimeSpan.FromMinutes(5), shown.Timeout);
            Assert.Equal(1, disposedWhenShown); // 창이 뜰 때 DB는 이미 닫혀 있다
            Assert.Equal(new[] { Synthetic.Scope, "FOREIGN" }, shown.View.Choices.Select(c => c.Scope));
            Assert.Equal(new[] { Synthetic.Institution, Synthetic.OtherInstitution }, shown.View.Choices.Select(c => c.InstitutionCode));
            Assert.Equal(0, shown.View.Preselected);
            Assert.Null(shown.View.PreviousLine);

            var saved = rig.Store.Load();
            Assert.NotNull(saved);
            Assert.Equal("FOREIGN", saved!.Scope);
            Assert.Equal(Synthetic.OtherInstitution, saved.InstitutionCode);
            Assert.Equal(Synthetic.Root, saved.InstallPath);
            Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
            Assert.Equal(1, rig.Session.Disposed);
            Assert.All(rig.Session.Sqls, sql => Assert.Contains(sql, Sql.All));
        }
        using (var rig = TwoHospitals())
        {
            // 계정 범위가 FOREIGN이면 그 줄을 미리 골라 둔다(처음 값 FakePick은 미리 고른 줄로 [확인])
            rig.Session.Answer(Sql.UserScopeSql, "FOREIGN ");
            Active(rig, (Synthetic.Scope, 812));
            Assert.True(Registered(Handle(rig)));
            Assert.Equal(1, rig.Pick.Shown.Single().View.Preselected);
            Assert.True(rig.Pick.Shown.Single().View.Choices[1].Mine);
            Assert.Equal("FOREIGN", rig.Store.Load()!.Scope);
        }
    }

    [Fact(DisplayName = "AC-005.19 계정 범위도 최근 내원도 못 정하면 아무 줄도 골라 두지 않은 채 창을 띄운다(E-BIT-REG-MANY로 막지 않음)")]
    public void PickWithoutPreselect()
    {
        using var rig = TwoHospitals();
        rig.Session.Answer(Sql.UserScopeSql);
        Active(rig, (Synthetic.Scope, 3), ("FOREIGN", 1));
        rig.Pick.Answer = view => view.Preselected == null ? 0 : -1;
        Assert.True(Registered(Handle(rig)));
        Assert.Null(rig.Pick.Shown.Single().View.Preselected);
        Assert.Equal(Synthetic.Scope, rig.Store.Load()!.Scope);
    }

    [Fact(DisplayName = "AC-005.19 고르기 창에서 [취소]·창 닫기·시간 지남이면 저장하지 않고 {registered: false}")]
    public void PickCancelDoesNotSave()
    {
        using var rig = TwoHospitals();
        rig.Session.Answer(Sql.UserScopeSql);
        Active(rig, (Synthetic.Scope, 3));
        rig.Pick.Answer = _ => null;
        Assert.False(Registered(Handle(rig)));
        Assert.Null(rig.Store.Load());
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-005.19 다시 등록: 지금 등록 줄을 보이고, 같은 범위·기관기호를 고르면 프로필 ID를 그대로 둔다")]
    public void PickReRegister()
    {
        using var rig = TwoHospitals();
        rig.Registered();
        rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope);
        Active(rig, (Synthetic.Scope, 3));
        Assert.True(Registered(Handle(rig)));
        Assert.Equal("지금 등록: 요양기관번호 12345678", rig.Pick.Shown.Single().View.PreviousLine);
        Assert.Equal(Synthetic.ProfileId, rig.Store.Load()!.ProfileId);
        Assert.Empty(rig.IssuedIds);
    }

    [Fact(DisplayName = "AC-005.19 범위가 하나면 고르기 창 없이 지금 PC 확인 창 그대로, 저장 모양이 틀리면 창을 띄우기 전에 E-BIT-REG-PLACE")]
    public void PickOnlyWhenMany()
    {
        using (var rig = new Rig(withPick: true))
        {
            SavesWith(rig, Synthetic.Scope, Synthetic.Institution);
            Assert.Empty(rig.Pick.Shown);
        }
        using (var rig = TwoHospitals())
        {
            rig.Session.Answer(Sql.UserScopeSql);
            Active(rig, (Synthetic.Scope, 3));
            rig.Session.Target = Synthetic.Target(server: "");
            Assert.Equal("E-BIT-REG-PLACE", ErrorCode(Handle(rig)));
            Assert.Null(rig.Store.Load());
            Assert.Empty(rig.Pick.Shown); // 고르기 창 없이 번호만(AC-005.13)
        }
    }

    // ── claim-learn AC-9317.3·AC-9317.4 다시 등록 때 전 병원 저장 파일 보관(도우미 0.15.0) ──

    private const string OldProfile = "fedcba9876543210fedcba9876543210";

    /// <summary>저장 폴더(등록 파일과 같은 곳)에 그 프로필의 작업 파일 하나를 심는다(가짜 암호화, 지어낸 내용).</summary>
    private static void PlantWork(Rig rig, string name, string profileId)
    {
        System.IO.Directory.CreateDirectory(rig.Folder);
        var json = "{\"profileId\":\"" + profileId + "\",\"drafts\":{\"900001|2026-10-27\":{\"memo\":\"가상환자01 메모\"}},\"done\":{},\"journal\":{}}";
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(rig.Folder, name),
            Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(rig.Protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static string[] Files(Rig rig) =>
        System.IO.Directory.GetFiles(rig.Folder).Select(file => System.IO.Path.GetFileName(file)!).OrderBy(name => name, StringComparer.Ordinal).ToArray();

    /// <summary>저장 폴더 안 보관 폴더(old-…)마다 파일 이름들.</summary>
    private static string[][] Archived(Rig rig) =>
        System.IO.Directory.GetDirectories(rig.Folder)
            .Select(dir =>
            {
                Assert.Matches(@"^old-[0-9]{8}-[0-9]{6}(-[0-9]+)?$", System.IO.Path.GetFileName(dir));
                return System.IO.Directory.GetFiles(dir).Select(file => System.IO.Path.GetFileName(file)!).OrderBy(name => name, StringComparer.Ordinal).ToArray();
            })
            .ToArray();

    [Fact(DisplayName = "AC-9317.3 AC-9317.4 다시 등록(기관기호 다름): 확인 창에 보관 한 줄, [확인]으로 저장한 뒤 전 병원 작업 파일을 old-…로 옮기고 불러오기가 막히지 않는다")]
    public void AC9317_3_ReRegisterArchivesFormerHospital()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        var previous = rig.Store.Load()!;
        PlantWork(rig, "work-2026-10.dat", previous.ProfileId);
        PlantWork(rig, "work-2026-10.dat.bak", previous.ProfileId);
        PlantWork(rig, "contact.dat", previous.ProfileId);

        // 옮기기 전에는 새 등록으로 읽으면 다른 병원 파일이라 막힌다(StoreBlockedCard)
        var foreign = new Precheck.Core.Store.WorkStore(new Precheck.Core.Store.StoreFolder(rig.Folder), rig.Protector, Synthetic.Registration(profileId: OldProfile), () => rig.Today);
        Assert.Equal(BitErrors.HospitalMismatch, Assert.ThrowsAny<HelperException>(() => foreign.Load(new[] { "2026-10" }, false, true)).Code);

        Assert.True(Registered(Handle(rig)));

        var saved = rig.Store.Load()!;
        Assert.Equal(Synthetic.Institution, saved.InstitutionCode);
        Assert.NotEqual(previous.ProfileId, saved.ProfileId);
        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Equal(RegisterPrompt.Build(saved, previous, 3), text);
        Assert.Contains("기관기호가 달라 전 병원의 작업은 읽지 않습니다.\r\n전에 쓰던 병원의 저장 파일 3개는 지우지 않고 따로 보관해요.\r\n", text);

        Assert.Equal(new[] { new[] { "contact.dat", "work-2026-10.dat", "work-2026-10.dat.bak" } }, Archived(rig));
        Assert.Equal(new[] { "registration.dat", "registration.dat.bak" }, Files(rig));

        // AC-9317.4: 새 등록으로 열면 막히지 않고 빈 채로 시작한다
        var store = Precheck.Core.Store.WorkStore.ForRegistered(new Precheck.Core.Store.StoreFolder(rig.Folder), rig.Protector, rig.Store, () => rig.Today);
        var loaded = Json.Parse(store.Load(new[] { "2026-10" }, true, true));
        Assert.Equal("{}", loaded.GetProperty("months").GetProperty("2026-10").GetProperty("drafts").GetRawText());
        Assert.Equal("{}", loaded.GetProperty("contact").GetRawText());
    }

    [Fact(DisplayName = "AC-9317.3 [취소]면 아무것도 옮기지 않고 확인 창 글에는 보관 한 줄이 있다")]
    public void AC9317_3_CancelMovesNothing()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
        var before = Files(rig).ToDictionary(name => name, name => System.IO.File.ReadAllBytes(System.IO.Path.Combine(rig.Folder, name)));
        rig.Confirm.Answer = false;

        Assert.False(Registered(Handle(rig)));
        Assert.Contains("전에 쓰던 병원의 저장 파일 1개는 지우지 않고 따로 보관해요.", Assert.Single(rig.Confirm.Shown).Text);
        Assert.Empty(System.IO.Directory.GetDirectories(rig.Folder));
        Assert.Equal(before.Keys.OrderBy(name => name, StringComparer.Ordinal), Files(rig));
        foreach (var pair in before) Assert.Equal(pair.Value, System.IO.File.ReadAllBytes(System.IO.Path.Combine(rig.Folder, pair.Key)));
        Assert.Equal(Synthetic.OtherInstitution, rig.Store.Load()!.InstitutionCode);
    }

    [Fact(DisplayName = "AC-9317.3 같은 병원으로 다시 등록(프로필 그대로)이면 이 병원 파일은 건드리지 않고, 다른 프로필 파일만 옮긴다(없으면 글 그대로)")]
    public void AC9317_3_SameHospitalKeepsOwnFiles()
    {
        using (var rig = new Rig().Registered(Synthetic.Registration(server: "192.168.0.10")))
        {
            var previous = rig.Store.Load()!;
            PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
            Assert.True(Registered(Handle(rig)));
            Assert.Equal(RegisterPrompt.Build(rig.Store.Load()!, previous), Assert.Single(rig.Confirm.Shown).Text);
            Assert.Empty(System.IO.Directory.GetDirectories(rig.Folder));
            Assert.Contains("work-2026-10.dat", Files(rig));
        }
        using (var rig = new Rig().Registered(Synthetic.Registration(server: "192.168.0.10")))
        {
            PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
            PlantWork(rig, "work-2026-09.dat", OldProfile);
            Assert.True(Registered(Handle(rig)));
            Assert.Contains("전에 쓰던 병원의 저장 파일 1개는 지우지 않고 따로 보관해요.", Assert.Single(rig.Confirm.Shown).Text);
            Assert.Equal(new[] { new[] { "work-2026-09.dat" } }, Archived(rig));
            Assert.Contains("work-2026-10.dat", Files(rig));
        }
    }

    [Fact(DisplayName = "AC-9317.3 처음 등록(등록 파일 없음)이어도 저장 폴더의 작업 파일은 새 프로필과 다르므로 보관 한 줄을 보이고 옮긴다")]
    public void AC9317_3_FirstRegistrationArchivesLeftovers()
    {
        using var rig = new Rig();
        PlantWork(rig, "work-2026-10.dat", OldProfile);
        Assert.True(Registered(Handle(rig)));
        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.StartsWith("이 병원으로 등록할까요?", text);
        Assert.Equal(RegisterPrompt.Build(rig.Store.Load()!, null, 1), text);
        Assert.Equal(new[] { new[] { "work-2026-10.dat" } }, Archived(rig));
    }

    [Fact(DisplayName = "AC-9317.3 옮기다 실패하면 등록은 그대로 두고 E-STORE-FAILED로 알린다(윈도우: 잠긴 파일)")]
    public void AC9317_3_MoveFailureKeepsRegistration()
    {
        if (!System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows)) return; // 잠긴 파일 옮기기는 윈도우에서만 막힌다
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
        JsonElement reply;
        using (new System.IO.FileStream(System.IO.Path.Combine(rig.Folder, "work-2026-10.dat"), System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.Read))
        {
            reply = Handle(rig);
        }
        Assert.Equal("E-STORE-FAILED", ErrorCode(reply));
        var saved = rig.Store.Load()!;
        Assert.Equal(Synthetic.Institution, saved.InstitutionCode); // 등록은 저장됐다
        Assert.Equal(rig.IssuedIds.Single(), saved.ProfileId);
        Assert.Contains("work-2026-10.dat", Files(rig));             // 지우지 않았다
    }

    [Fact(DisplayName = "AC-9317.3 고르기 창도 같은 글: 줄마다 옮길 파일 수(프로필을 그대로 두는 줄은 다른 프로필만), [확인]으로 저장한 뒤 고른 줄 기준으로 옮긴다")]
    public void AC9317_3_PickArchives()
    {
        using (var rig = TwoHospitals())
        {
            rig.Registered();
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope);
            Active(rig, (Synthetic.Scope, 3));
            PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
            PlantWork(rig, "work-2026-09.dat", OldProfile);
            rig.Pick.Answer = _ => 1; // 다른 병원(FOREIGN)을 고름 → 새 프로필

            Assert.True(Registered(Handle(rig)));
            var view = rig.Pick.Shown.Single().View;
            Assert.Equal(1, view.ArchiveCount(0));
            Assert.Equal(2, view.ArchiveCount(1));
            Assert.Equal("전에 쓰던 병원의 저장 파일 2개는 지우지 않고 따로 보관해요.", view.ArchiveLine(1));
            Assert.Equal("FOREIGN", rig.Store.Load()!.Scope);
            Assert.Equal(new[] { new[] { "work-2026-09.dat", "work-2026-10.dat" } }, Archived(rig));
        }
        using (var rig = TwoHospitals())
        {
            rig.Registered();
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope);
            Active(rig, (Synthetic.Scope, 3));
            PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
            PlantWork(rig, "work-2026-09.dat", OldProfile);

            Assert.True(Registered(Handle(rig))); // 미리 골라 둔 지금 병원 그대로
            Assert.Equal(Synthetic.ProfileId, rig.Store.Load()!.ProfileId);
            Assert.Equal(new[] { new[] { "work-2026-09.dat" } }, Archived(rig));
            Assert.Contains("work-2026-10.dat", Files(rig));
        }
        using (var rig = TwoHospitals())
        {
            rig.Registered();
            rig.Session.Answer(Sql.UserScopeSql, Synthetic.Scope);
            Active(rig, (Synthetic.Scope, 3));
            PlantWork(rig, "work-2026-10.dat", Synthetic.ProfileId);
            rig.Pick.Answer = _ => null; // [취소]
            Assert.False(Registered(Handle(rig)));
            Assert.Empty(System.IO.Directory.GetDirectories(rig.Folder));
            Assert.Contains("work-2026-10.dat", Files(rig));
        }
    }

    [Fact(DisplayName = "AC-9317.3 작업 파일 암호는 RegistrationStore의 internal 읽기(Protector)로 받는다 — RegisterFlow는 이름으로 찾는 리플렉션 필드를 두지 않는다")]
    public void AC9317_3_ProtectorReadIsInternal()
    {
        const System.Reflection.BindingFlags any = System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic;
        Assert.DoesNotContain(typeof(RegisterFlow).GetFields(any), field => typeof(System.Reflection.MemberInfo).IsAssignableFrom(field.FieldType));

        var read = typeof(RegistrationStore).GetProperty("Protector", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
        Assert.NotNull(read);
        Assert.Equal(typeof(Precheck.Core.Store.IProtector), read!.PropertyType);
        Assert.True(read.GetMethod!.IsAssembly); // internal: 밖(웹·확장 쪽 코드)에는 내놓지 않는다
        Assert.Null(read.SetMethod);
        using var rig = new Rig();
        Assert.Same(rig.Protector, read.GetValue(rig.Store));
    }
}
