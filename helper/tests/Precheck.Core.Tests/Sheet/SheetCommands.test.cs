using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Sheet;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// 도우미 0.14.0 수납 명령(spec google-link TASK-10, design.md 9-2): sheet.status·sheet.code·sheet.import·sheet.ping·sheet.catalog·sheet.months,
/// 명령 표 모양, 비트 읽기 허용 목록, 기록 줄. sheet.link는 SheetCommandsLinkTests, sheet.fill은 SheetCommandsFillTests.
/// 비밀 글자·주소·메일·이름·차트번호는 모두 지어낸 것이다.
/// </summary>
public class SheetCommandsTests
{
    private static readonly string[] SheetNames =
    {
        "sheet.status", "sheet.code", "sheet.link", "sheet.import", "sheet.ping", "sheet.catalog", "sheet.months", "sheet.fill",
    };

    private static void NoSecretsIn(string text)
    {
        Assert.DoesNotContain(SheetRig.Secret, text, StringComparison.Ordinal);
        Assert.DoesNotContain("AKfycb", text, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.Mail, text, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.PatientName, text, StringComparison.Ordinal);
    }

    // ── AC-8511.1 명령 표 ───────────────────────────────────────

    [Fact(DisplayName = "AC-8511.1 명령 표에 sheet.* 여덟이 있고 모두 patient:false, confirm은 sheet.link 하나, 주소·메일 칸은 sheet.link 밖에 없다")]
    public void TableHasEightSheetCommands()
    {
        var table = CommandTable.LoadEmbedded();
        using var doc = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        var commands = doc.RootElement.GetProperty("commands");
        foreach (var name in SheetNames)
        {
            Assert.True(table.Has(name), name);
            Assert.False(table.IsPatient(name), name);
            Assert.False(table.IsSend(name), name);
            var spec = commands.GetProperty(name);
            Assert.Equal(name == "sheet.link", spec.TryGetProperty("confirm", out var confirm) && confirm.GetBoolean());
            var args = Json.Keys(spec.GetProperty("args"));
            if (name != "sheet.link")
            {
                Assert.DoesNotContain("url", args);
                Assert.DoesNotContain("shareWith", args);
                Assert.DoesNotContain("scriptUrl", args);
            }
        }
        string ArgsOf(string name) => JsonSerializer.Serialize(commands.GetProperty(name).GetProperty("args"));
        Assert.Equal("{}", ArgsOf("sheet.status"));
        Assert.Equal("{}", ArgsOf("sheet.code"));
        Assert.Equal("{}", ArgsOf("sheet.import"));
        Assert.Equal(new[] { "url", "shareWith" }, Json.Keys(commands.GetProperty("sheet.link").GetProperty("args")));
        Assert.Equal(new[] { "settings" }, Json.Keys(commands.GetProperty("sheet.ping").GetProperty("args")));
        Assert.Equal(new[] { "hospital" }, Json.Keys(commands.GetProperty("sheet.catalog").GetProperty("args")));
        Assert.Equal(new[] { "settings", "months" }, Json.Keys(commands.GetProperty("sheet.months").GetProperty("args")));
        Assert.Equal(new[] { "day", "mode", "auto", "settings" }, Json.Keys(commands.GetProperty("sheet.fill").GetProperty("args")));
        Assert.Equal("{\"type\":\"json\",\"of\":\"object\"}", JsonSerializer.Serialize(commands.GetProperty("sheet.fill").GetProperty("args").GetProperty("settings")));
        Assert.Equal("[\"fillEmpty\",\"overwrite\"]", JsonSerializer.Serialize(commands.GetProperty("sheet.fill").GetProperty("args").GetProperty("mode").GetProperty("values")));
    }

    [Fact(DisplayName = "AC-8511.1 도우미 판은 0.15.0이다(Directory.Build.props 한 곳)")]
    public void HelperVersionIsZeroFourteen() => Assert.Equal("0.15.0", HelperVersion.Value);

    [Fact(DisplayName = "AC-8511.1 처리기를 붙이면 sheet.* 여덟 모두 답한다(모르는 명령이 아님)")]
    public void AllEightAreRegistered()
    {
        using var rig = new SheetRig();
        foreach (var name in SheetNames)
        {
            var reply = Assert.Single(rig.Send(name, "{}"));
            if (reply.GetProperty("type").GetString() == "error")
            {
                Assert.NotEqual(ErrorCodes.UnknownCommand, reply.GetProperty("code").GetString());
            }
        }
    }

    // ── AC-8511.4 비트 읽기 허용 목록 ───────────────────────────

    [Fact(DisplayName = "AC-8511.4 SheetSql 문장 열 개는 ReadOnlyGuard(Bit/Sql.cs 허용 목록)를 지나고, 다른 매개변수가 붙으면 막힌다")]
    public void SheetSqlPassesReadOnlyGuard()
    {
        var range = new Dictionary<string, object?> { ["@from"] = "202610300000", ["@to"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        var cases = new List<(string Sql, Dictionary<string, object?> Args)>
        {
            (SheetSql.VisitsSql, range),
            (SheetSql.CodesSql, range),
            (SheetSql.CancelledSql, range),
            (SheetSql.BillsSql, range),
            (SheetSql.CodeUsageSql, range),
            (SheetSql.DeptUsageSql, range),
            (SheetSql.PaymentsSql, new Dictionary<string, object?> { ["@day"] = "20261030", ["@hospital"] = Synthetic.Scope }),
            (SheetSql.HospitalsSql, new Dictionary<string, object?> { ["@today"] = "20261030" }),
            (SheetSql.HospitalVisitsSql, new Dictionary<string, object?> { ["@from"] = "202610010000", ["@to"] = "202610310000" }),
            (SheetSql.DepartmentsSql, new Dictionary<string, object?> { ["@hospital"] = Synthetic.Scope }),
        };
        foreach (var (sql, args) in cases)
        {
            Assert.True(Sql.IsAllowed(sql), sql);
            ReadOnlyGuard.Require(sql, args);
            var extra = new Dictionary<string, object?>(args) { ["@q"] = "가상" };
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, extra)).Code);
        }
    }

    // ── AC-8511.5 sheet.status ─────────────────────────────────

    [Fact(DisplayName = "AC-8511.5 sheet.status: sheet.dat가 없으면 {v, secretTag:null, bitsheet, codeVersion:'8', url:null, shareWith:[], verified:false}, 비트를 건드리지 않는다")]
    public void StatusWithoutSheetDat()
    {
        using var rig = new SheetRig();
        var data = rig.Result("sheet.status", "{}");

        Assert.Equal(new[] { "v", "secretTag", "bitsheet", "codeVersion", "url", "shareWith", "verified" }, Json.Keys(data));
        Assert.Equal(1, data.GetProperty("v").GetInt32());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("secretTag").ValueKind);
        Assert.False(data.GetProperty("bitsheet").GetBoolean());
        Assert.Equal("8", data.GetProperty("codeVersion").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("url").ValueKind);
        Assert.Equal(0, data.GetProperty("shareWith").GetArrayLength());
        Assert.False(data.GetProperty("verified").GetBoolean());
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.status: 둔 비밀 글자는 표시(SHA-256 앞 16자)만, 주소·메일은 설정 칸 보이기용으로, 비트시트 설정이 있으면 bitsheet 참")]
    public void StatusWithSheetDat()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail, SheetRig.OtherMail);
        rig.HasBitSheet = true;
        var data = rig.Result("sheet.status", "{}");

        Assert.Equal(SheetCode.Tag(SheetRig.Secret), data.GetProperty("secretTag").GetString());
        Assert.Matches("^[0-9a-f]{16}$", data.GetProperty("secretTag").GetString());
        Assert.True(data.GetProperty("bitsheet").GetBoolean());
        Assert.Equal(SheetRig.Url, data.GetProperty("url").GetString());
        Assert.Equal(new[] { SheetRig.Mail, SheetRig.OtherMail }, data.GetProperty("shareWith").EnumerateArray().Select(m => m.GetString()));
        Assert.True(data.GetProperty("verified").GetBoolean());
        Assert.DoesNotContain(SheetRig.Secret, rig.RawReplies, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.status: sheet.dat를 풀지 못하면(다른 윈도 계정·깨짐) 오류 없이 비밀 글자·주소 없음으로 답한다(새로 만들게)")]
    public void StatusWithBrokenSheetDat()
    {
        using var rig = new SheetRig();
        Directory.CreateDirectory(Path.GetDirectoryName(rig.Store.FilePath)!);
        File.WriteAllBytes(rig.Store.FilePath, Encoding.ASCII.GetBytes("PRECHECK-STORE-1\nnot-a-cipher"));

        var data = rig.Result("sheet.status", "{}");

        Assert.Equal(JsonValueKind.Null, data.GetProperty("secretTag").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("url").ValueKind);
        Assert.False(data.GetProperty("verified").GetBoolean());
        Assert.Equal("E-GSHEET-SECRET", rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}").GetProperty("code").GetString());
        Assert.Equal("E-GSHEET-SECRET", rig.Error("sheet.fill", SheetRig.FillArgs()));
        Assert.Empty(rig.Google.Calls);
    }

    // ── AC-8511.2 sheet.code ───────────────────────────────────

    [Fact(DisplayName = "AC-8511.2 sheet.code: 새 비밀 글자(43자 base64url)를 sheet.dat(DPAPI)에 두고 __TOKEN__을 바꾼 Code.gs를 클립보드에, 답은 {v, secretTag, codeVersion}뿐")]
    public void CodePutsCodeOnClipboard()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        var data = rig.Result("sheet.code", "{}");

        Assert.Equal(new[] { "v", "secretTag", "codeVersion" }, Json.Keys(data));
        Assert.Equal("8", data.GetProperty("codeVersion").GetString());
        var state = rig.Store.Load();
        var secret = state.Secret!;
        Assert.Matches("^[A-Za-z0-9_-]{43}$", secret);
        Assert.NotEqual(SheetRig.Secret, secret);
        Assert.Equal(SheetCode.Tag(secret), data.GetProperty("secretTag").GetString());
        // 주소·메일은 그대로, 확인은 다시(새 비밀 글자를 구글에 붙였는지 hello로 본다)
        Assert.Equal(SheetRig.Url, state.Url);
        Assert.Equal(new[] { SheetRig.Mail }, state.ShareWith);
        Assert.False(state.Verified);

        var code = Assert.Single(rig.Clipboard.Texts);
        Assert.Equal(SheetCode.Inject(SheetCode.Load()!, secret), code);
        Assert.Contains("const TOKEN = '" + secret + "'", code, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetCode.Placeholder, code, StringComparison.Ordinal);

        // 비밀 글자는 답·기록·sheet.dat 평문 어디에도 없다
        Assert.DoesNotContain(secret, rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, Encoding.UTF8.GetString(File.ReadAllBytes(rig.Store.FilePath)), StringComparison.Ordinal);
        Assert.StartsWith("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(File.ReadAllBytes(rig.Store.FilePath)), StringComparison.Ordinal);
        Assert.All(rig.Log, line => Assert.True(line.Name == "sheet.code" && line.Code == null, line.ToString()));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.2 sheet.code를 두 번 하면 비밀 글자가 다르다(무작위 32바이트), 깨진 sheet.dat는 지우지 않고 이름을 바꿔 둔다")]
    public void CodeTwiceGivesNewSecret()
    {
        using var rig = new SheetRig();
        Directory.CreateDirectory(Path.GetDirectoryName(rig.Store.FilePath)!);
        File.WriteAllBytes(rig.Store.FilePath, Encoding.ASCII.GetBytes("broken"));

        var first = rig.Result("sheet.code", "{}").GetProperty("secretTag").GetString();
        var second = rig.Result("sheet.code", "{}").GetProperty("secretTag").GetString();

        Assert.NotEqual(first, second);
        Assert.Equal(2, rig.Clipboard.Texts.Distinct().Count());
        Assert.Single(Directory.GetFiles(Path.GetDirectoryName(rig.Store.FilePath)!, "sheet.dat.broken-*"));
    }

    [Fact(DisplayName = "AC-8511.2 sheet.code: 클립보드에 넣지 못하면 E-STORE-FAILED(비밀 글자는 답에 없음)")]
    public void CodeClipboardFails()
    {
        using var rig = new SheetRig();
        rig.Clipboard.Fail = true;
        Assert.Equal("E-STORE-FAILED", rig.Error("sheet.code", "{}"));
        var secret = rig.Store.Load().Secret;
        if (secret != null) Assert.DoesNotContain(secret, rig.RawReplies, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-8511.2 sheet.code: 클립보드에 못 넣으면 sheet.dat는 그대로다(쓰던 비밀 글자·주소·확인 표시가 지워지지 않음)")]
    public void CodeClipboardFailsKeepsOld()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        rig.Clipboard.Fail = true;
        Assert.Equal("E-STORE-FAILED", rig.Error("sheet.code", "{}"));
        var state = rig.Store.Load();
        Assert.Equal(SheetRig.Secret, state.Secret);
        Assert.Equal(SheetRig.Url, state.Url);
        Assert.True(state.Verified);
    }

    // ── AC-8511.5 sheet.import ─────────────────────────────────

    private static BitSheetImported Imported(string url = SheetRig.Url)
    {
        var settings = new Settings { TemplateUrl = SheetRig.Template, HospitalName = "가짜정형외과의원" };
        return new BitSheetImported(settings, SheetSettingsJson.ToJson(settings), SheetRig.Secret, url, new[] { SheetRig.Mail });
    }

    [Fact(DisplayName = "AC-8511.5 sheet.import: 확인 창 없이 비트시트 비밀 글자·주소·메일을 sheet.dat로(verified 참), 답은 {v, secretTag, settings}이고 주소·메일·비밀 글자가 없다")]
    public void ImportMovesBitSheet()
    {
        using var rig = new SheetRig();
        rig.HasBitSheet = true;
        rig.BitSheet = Imported();

        var data = rig.Result("sheet.import", "{}");

        Assert.Equal(new[] { "v", "secretTag", "settings" }, Json.Keys(data));
        Assert.Equal(SheetCode.Tag(SheetRig.Secret), data.GetProperty("secretTag").GetString());
        Assert.Equal(JsonValueKind.Object, data.GetProperty("settings").ValueKind);
        Assert.Equal(SheetRig.Template, data.GetProperty("settings").GetProperty("templateUrl").GetString());
        NoSecretsIn(rig.RawReplies);
        Assert.Empty(rig.Confirm.Shown);
        var state = rig.Store.Load();
        Assert.Equal(SheetRig.Secret, state.Secret);
        Assert.Equal(SheetRig.Url, state.Url);
        Assert.Equal(new[] { SheetRig.Mail }, state.ShareWith);
        Assert.True(state.Verified);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.import: 비트시트 설정이 없거나 비밀 글자를 못 풀면 E-GSHEET-SECRET, sheet.dat는 그대로")]
    public void ImportWithoutBitSheet()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.WorkspaceUrl);
        Assert.Equal("E-GSHEET-SECRET", rig.Error("sheet.import", "{}"));
        rig.BitSheetFails = new SheetException(SheetErrors.Secret);
        Assert.Equal("E-GSHEET-SECRET", rig.Error("sheet.import", "{}"));
        rig.BitSheetFails = new SheetException(BitErrors.StoreBroken);
        Assert.Equal("E-STORE-BROKEN", rig.Error("sheet.import", "{}"));
        Assert.Equal(SheetRig.WorkspaceUrl, rig.Store.Load().Url);
        Assert.Equal(SheetRig.Secret, rig.Store.Load().Secret);
    }

    // ── AC-8511.5 sheet.ping ───────────────────────────────────

    [Fact(DisplayName = "AC-8511.5 sheet.ping: sheet.dat 주소로만 보내고(넘김은 googleusercontent만) {v, ok:true, templateTitle, version}, 비트를 건드리지 않는다")]
    public void PingUsesSheetDatUrl()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        var data = rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");

        Assert.Equal(new[] { "v", "ok", "templateTitle", "version" }, Json.Keys(data));
        Assert.True(data.GetProperty("ok").GetBoolean());
        Assert.Equal("가짜 원본 시트", data.GetProperty("templateTitle").GetString());
        Assert.Equal("8", data.GetProperty("version").GetString());
        Assert.Equal(new[] { ("POST", SheetRig.Url), ("GET", FakeGoogle.Echo) }, rig.Google.Calls.Select(c => (c.Method, c.Url)));
        Assert.Equal(new[] { "ping" }, rig.Google.Actions);
        Assert.False(rig.BitTouched);
    }

    [Fact(DisplayName = "AC-8511.5 AC-8511.3 sheet.ping: 확인 전(verified 거짓)이면 hello로 먼저 맞춰 보고, 구글 오류는 {v, ok:false, code}(token_not_set → NOKEY, bad_token → KEY)")]
    public void PingErrorsAsCode()
    {
        using var rig = new SheetRig().Linked(false);
        var data = rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");
        Assert.True(data.GetProperty("ok").GetBoolean());
        Assert.Equal(new[] { "hello", "ping" }, rig.Google.Actions);
        Assert.True(rig.Store.Load().Verified);

        rig.Google.Token = "FAKEotherTokenFAKEotherToken0123";
        data = rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");
        Assert.Equal(new[] { "v", "ok", "code" }, Json.Keys(data));
        Assert.False(data.GetProperty("ok").GetBoolean());
        Assert.Equal("E-GSHEET-KEY", data.GetProperty("code").GetString());

        rig.Google.TokenNotSet = true;
        data = rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");
        Assert.Equal("E-GSHEET-NOKEY", data.GetProperty("code").GetString());
    }

    [Fact(DisplayName = "AC-8511.3 sheet.ping: 설정에 url·scriptUrl·shareWith 열쇠가 오면 E-HELPER-BAD-MESSAGE이고 구글을 부르지 않는다")]
    public void PingRefusesUrlKeys()
    {
        using var rig = new SheetRig().Linked();
        foreach (var key in new[] { "url", "scriptUrl", "webAppUrl", "shareWith", "token", "secret" })
        {
            var settings = SheetRig.SettingsJson().TrimEnd('}') + ",\"" + key + "\":\"" + SheetRig.WorkspaceUrl + "\"}";
            Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.ping", "{\"settings\":" + settings + "}"));
        }
        Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.ping", "{\"settings\":{},\"url\":\"" + SheetRig.WorkspaceUrl + "\"}"));
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.ping: 비밀 글자·주소·원본 시트가 없으면 구글을 부르지 않고 {ok:false, code}(SECRET·NOURL·NOTEMPLATE)")]
    public void PingBlockers()
    {
        using var rig = new SheetRig();
        Assert.Equal("E-GSHEET-SECRET", rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}").GetProperty("code").GetString());
        rig.Store.Save(new SheetState { Secret = SheetRig.Secret });
        Assert.Equal("E-GSHEET-NOURL", rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}").GetProperty("code").GetString());
        rig.Linked();
        Assert.Equal("E-GSHEET-NOTEMPLATE", rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson(s => s.TemplateUrl = "") + "}").GetProperty("code").GetString());
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.ping: 넘겨받는 곳이 script.googleusercontent.com이 아니면 따라가지 않고 멈춘다(E-GSHEET-LOGIN)")]
    public void PingStopsAtForeignRedirect()
    {
        using var rig = new SheetRig().Linked();
        rig.Google.Redirect = "https://accounts.google.com/ServiceLogin?continue=x";
        var data = rig.Result("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");
        Assert.Equal("E-GSHEET-LOGIN", data.GetProperty("code").GetString());
        Assert.Equal(new[] { "POST" }, rig.Google.Calls.Select(c => c.Method));
    }

    // ── AC-8511.5 sheet.catalog ────────────────────────────────

    private static void CatalogDb(FakeDb db)
    {
        db.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { Synthetic.Scope + " ", "가짜정형외과의원" } });
        db.Answer(SheetSql.HospitalVisitsSql, _ => new[] { new object?[] { Synthetic.Scope, 321 } });
        db.Answer(SheetSql.DepartmentsSql, _ => new[]
        {
            new object?[] { "OS", "정형외과", "20200101", "99991231" },
            new object?[] { "OLD", "옛 진료과", "20100101", "20151231" },
        });
        db.Answer(SheetSql.DeptUsageSql, _ => new[] { new object?[] { "OS", 900 } });
        db.Answer(SheetSql.CodeUsageSql, _ => new[]
        {
            new object?[] { "LA221", 120, "가짜 신경차단", "05", "1" },
            new object?[] { "MM001", 80, "가짜 물리치료", "06", "1" },
            new object?[] { "AA154", 300, "가짜 진찰료", "01", "1" },
        });
    }

    [Fact(DisplayName = "AC-8511.5 sheet.catalog: {v, hospitals[{code,name,recent}], depts[{code,name,n90,today}], rx[{code,name,cls,n90}], hospitalName} — 환자 값 없음")]
    public void CatalogShape()
    {
        using var rig = new SheetRig();
        CatalogDb(rig.Bit.Session);
        var data = rig.Result("sheet.catalog", "{}");

        Assert.Equal(new[] { "v", "hospitals", "depts", "rx", "hospitalName" }, Json.Keys(data));
        var hospital = Assert.Single(data.GetProperty("hospitals").EnumerateArray());
        Assert.Equal("{\"code\":\"SYNTHETIC\",\"name\":\"가짜정형외과의원\",\"recent\":321}", hospital.GetRawText());
        Assert.Equal(
            "[{\"code\":\"OS\",\"name\":\"정형외과\",\"n90\":900,\"today\":true},{\"code\":\"OLD\",\"name\":\"옛 진료과\",\"n90\":0,\"today\":false}]",
            data.GetProperty("depts").GetRawText());
        Assert.Equal(
            "[{\"code\":\"LA221\",\"name\":\"가짜 신경차단\",\"cls\":\"block\",\"n90\":120},"
            + "{\"code\":\"MM001\",\"name\":\"가짜 물리치료\",\"cls\":\"therapy\",\"n90\":80},"
            + "{\"code\":\"AA154\",\"name\":\"가짜 진찰료\",\"cls\":\"\",\"n90\":300}]",
            data.GetProperty("rx").GetRawText());
        Assert.Equal("가짜정형외과의원", data.GetProperty("hospitalName").GetString());
        Assert.Empty(rig.Google.Calls);
        Assert.Equal(1, rig.Bit.Session.Disposed);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.catalog: 등록 안 된 PC는 E-BIT-NOT-REGISTERED(비트를 건드리지 않음), 고른 병원이 없으면 E-BIT-REG-NONE")]
    public void CatalogNeedsRegistration()
    {
        using (var rig = new SheetRig(registered: false))
        {
            Assert.Equal(BitErrors.NotRegistered, rig.Error("sheet.catalog", "{}"));
            Assert.False(rig.BitTouched);
        }
        using (var rig = new SheetRig())
        {
            CatalogDb(rig.Bit.Session);
            Assert.Equal(BitErrors.RegisterNone, rig.Error("sheet.catalog", "{\"hospital\":\"NOPE\"}"));
        }
    }

    // ── AC-8511.5 sheet.months ─────────────────────────────────

    [Fact(DisplayName = "AC-8511.5 sheet.months: sheet.dat 주소로 {token, action:'months', month:{templateId, folderId}, names[{ym, fileName}]}, 답은 {v, version, months[{ym, fileId|null, gids}]}")]
    public void MonthsShape()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail);
        var settings = SheetRig.SettingsJson(s => s.HospitalName = "가짜의원");
        var data = rig.Result("sheet.months", "{\"settings\":" + settings + ",\"months\":[\"2026-10\",\"2026-09\"]}");

        Assert.Equal(new[] { "v", "version", "months" }, Json.Keys(data));
        Assert.Equal("8", data.GetProperty("version").GetString());
        Assert.Equal(
            "[{\"ym\":\"2026-10\",\"fileId\":\"" + FakeGoogle.FileId + "\",\"gids\":{\"1\":11,\"30\":40}},{\"ym\":\"2026-09\",\"fileId\":null,\"gids\":{}}]",
            data.GetProperty("months").GetRawText());

        var post = rig.Google.Calls[0];
        Assert.Equal(("POST", SheetRig.Url), (post.Method, post.Url));
        using var body = JsonDocument.Parse(post.Body!);
        Assert.Equal(new[] { "token", "action", "month", "names" }, Json.Keys(body.RootElement));
        Assert.Equal(new[] { "templateId", "folderId" }, Json.Keys(body.RootElement.GetProperty("month")));
        Assert.Equal(
            "[{\"ym\":\"2026-10\",\"fileName\":\"가짜의원 일일수납일지 2026년 10월\"},{\"ym\":\"2026-09\",\"fileName\":\"가짜의원 일일수납일지 2026년 9월\"}]",
            body.RootElement.GetProperty("names").GetRawText());
        NoSecretsIn(rig.RawReplies);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.months: 7판 구글 코드(months를 모름)면 E-GSHEET-OLD, 달은 1~13개")]
    public void MonthsOldCode()
    {
        using var rig = new SheetRig().Linked();
        rig.Google.Version = "7";
        var settings = SheetRig.SettingsJson(s => s.HospitalName = "가짜의원");
        Assert.Equal("E-GSHEET-OLD", rig.Error("sheet.months", "{\"settings\":" + settings + ",\"months\":[\"2026-10\"]}"));
        Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.months", "{\"settings\":" + settings + ",\"months\":[]}"));
        var many = string.Join(",", Enumerable.Range(1, 14).Select(i => "\"2025-" + (i <= 12 ? i : 12).ToString("00", System.Globalization.CultureInfo.InvariantCulture) + "\""));
        Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.months", "{\"settings\":" + settings + ",\"months\":[" + many + "]}"));
    }

    [Fact(DisplayName = "AC-8511.5 sheet.months: 설정에 병원 이름이 없으면 비트에서 읽은 병원 이름으로 파일 이름을 만든다")]
    public void MonthsReadsHospitalNameFromBit()
    {
        using var rig = new SheetRig().Linked();
        rig.Bit.Session.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { Synthetic.Scope, "가짜비트의원" } });
        rig.Result("sheet.months", "{\"settings\":" + SheetRig.SettingsJson() + ",\"months\":[\"2026-10\"]}");
        Assert.Contains("가짜비트의원 일일수납일지 2026년 10월", rig.Google.Calls[0].Body, StringComparison.Ordinal);
    }

    // ── AC-8511.7 기록 줄 ───────────────────────────────────────

    [Fact(DisplayName = "AC-8511.7 수납 명령을 돌리면 기록 줄은 (명령 이름, 오류 번호)뿐이고 이름·차트번호·비밀 글자·주소·메일이 없다")]
    public void LogHasOnlyNamesAndCodes()
    {
        using var rig = new SheetRig().Linked(false, SheetRig.Url, SheetRig.Mail).OnePatientDay();
        rig.HasBitSheet = true;
        rig.BitSheet = Imported();
        CatalogDb(rig.Bit.Session);
        rig.OnePatientDay();
        rig.Send("sheet.status", "{}");
        rig.Send("sheet.ping", "{\"settings\":" + SheetRig.SettingsJson() + "}");
        rig.Send("sheet.months", "{\"settings\":" + SheetRig.SettingsJson() + ",\"months\":[\"2026-10\"]}");
        rig.Send("sheet.fill", SheetRig.FillArgs());
        rig.Send("sheet.catalog", "{}");
        rig.Send("sheet.link", "{\"url\":\"http://example.test/exec\",\"shareWith\":[]}");
        rig.Google.Token = "FAKEotherTokenFAKEotherToken0123";
        rig.Send("sheet.fill", SheetRig.FillArgs());
        rig.Send("sheet.import", "{}");
        rig.Send("sheet.code", "{}");

        Assert.True(rig.Log.Count >= 9);
        foreach (var (name, code) in rig.Log)
        {
            Assert.StartsWith("sheet.", name, StringComparison.Ordinal);
            if (code != null) Assert.Matches("^E-[A-Z-]+$", code);
        }
        var logText = string.Join("\n", rig.Log.Select(l => l.Name + " " + l.Code));
        NoSecretsIn(logText);
        Assert.DoesNotContain(SheetRig.Chart, logText, StringComparison.Ordinal);
        Assert.Contains(rig.Log, l => l.Name == "sheet.link" && l.Code == "E-GSHEET-URL");
        Assert.Contains(rig.Log, l => l.Name == "sheet.fill" && l.Code == "E-GSHEET-KEY");
    }
}
