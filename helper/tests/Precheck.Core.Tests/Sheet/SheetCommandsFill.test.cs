using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Sheet;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// sheet.fill(spec google-link TASK-10, AC-8511.4·AC-8511.3, design.md 9-2): 비트를 읽기만 해 줄을 만들고 sheet.dat 주소로 보내 숫자만 돌려준다.
/// 한국 오늘은 2026-10-30. 환자 이름·차트번호·비밀 글자·주소는 지어낸 것이다.
/// </summary>
public class SheetCommandsFillTests
{
    /// <summary>웹 lib/gsheet/reply.ts FILL_KEYS 차례(TASK-13 약속): v + 셈 18 + 참거짓 4 + ratioSkipped·notPut·fileId·sheetGid·version.</summary>
    private static readonly string[] FillKeys =
    {
        "v", "rows", "patients", "added", "filled", "overwritten", "skipped", "cancelCleared", "cancelKept", "freeFixed", "inserted", "cleaned",
        "shareFailed", "ratioFixed", "ratioSkippedCount", "split", "free", "paidOnly", "notes", "full", "created", "ratioFailed", "oldCode",
        "ratioSkipped", "notPut", "fileId", "sheetGid", "version",
    };

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 비트 하루를 읽어 sheet.dat 주소로 write를 보내고 답은 숫자 칸 27개(웹 FILL_KEYS 그대로)뿐")]
    public void FillSendsAndCounts()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url, SheetRig.Mail).OnePatientDay();
        var data = rig.Result("sheet.fill", SheetRig.FillArgs());

        Assert.Equal(FillKeys, Json.Keys(data));
        Assert.Equal(1, data.GetProperty("rows").GetInt32());
        Assert.Equal(1, data.GetProperty("patients").GetInt32());
        Assert.Equal(1, data.GetProperty("added").GetInt32());
        Assert.Equal(2, data.GetProperty("cleaned").GetInt32());
        Assert.Equal(1, data.GetProperty("ratioFixed").GetInt32());
        Assert.Equal(1, data.GetProperty("ratioSkippedCount").GetInt32());
        Assert.Equal("[\"30!J9\"]", data.GetProperty("ratioSkipped").GetRawText());
        Assert.True(data.GetProperty("created").GetBoolean());
        Assert.False(data.GetProperty("oldCode").GetBoolean());
        Assert.Equal("{\"noName\":0,\"unlinked\":0,\"negative\":0,\"noChart\":0}", data.GetProperty("notPut").GetRawText());
        Assert.Equal(FakeGoogle.FileId, data.GetProperty("fileId").GetString());
        Assert.Equal(777, data.GetProperty("sheetGid").GetInt64());
        Assert.Equal("8", data.GetProperty("version").GetString());

        Assert.Equal(new[] { "write" }, rig.Google.Actions);
        Assert.Equal(("POST", SheetRig.Url), (rig.Google.Calls[0].Method, rig.Google.Calls[0].Url));
        using var body = JsonDocument.Parse(rig.Google.Calls[0].Body!);
        Assert.Equal(SheetRig.Secret, body.RootElement.GetProperty("token").GetString());
        Assert.Equal("fillEmpty", body.RootElement.GetProperty("mode").GetString());
        Assert.Equal("30", body.RootElement.GetProperty("sheetName").GetString());
        // 함께 쓸 메일은 sheet.dat 것
        Assert.Equal("[\"desk@fake.test\"]", body.RootElement.GetProperty("month").GetProperty("shareWith").GetRawText());
        Assert.Contains(SheetRig.PatientName, rig.Google.Calls[0].Body, StringComparison.Ordinal);

        // 웹 답·기록에는 환자 값·비밀 글자·주소가 없다
        Assert.DoesNotContain(SheetRig.PatientName, rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.Chart, rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.Secret, rig.RawReplies, StringComparison.Ordinal);
        Assert.DoesNotContain("AKfycb", rig.RawReplies, StringComparison.Ordinal);
        Assert.Equal(new (string?, string?)[] { ("sheet.fill", null) }, rig.Log);
        // 비트는 읽기만, 다 쓰면 닫는다(구글에 보내기 전에)
        Assert.Equal(1, rig.Bit.Session.Disposed);
        Assert.All(rig.Bit.Session.Calls, c => Assert.True(Sql.IsAllowed(c.Sql)));
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 덮어쓰기는 손으로만 — auto이고 overwrite면 비트·구글을 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    public void AutoOverwriteRefused()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.fill", SheetRig.FillArgs(mode: "overwrite", auto: true)));
        Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.fill", SheetRig.FillArgs(mode: "replace")));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Google.Calls);

        rig.Result("sheet.fill", SheetRig.FillArgs(mode: "overwrite"));
        using var body = JsonDocument.Parse(rig.Google.Calls[0].Body!);
        Assert.Equal("overwrite", body.RootElement.GetProperty("mode").GetString());
    }

    [Theory(DisplayName = "AC-8511.4 sheet.fill: 날짜는 한국 오늘 − 62일 ~ 오늘만(밖이면 E-HELPER-BAD-MESSAGE)")]
    [InlineData("2026-08-29", true)]
    [InlineData("2026-10-30", true)]
    [InlineData("2026-08-28", false)]
    [InlineData("2026-10-31", false)]
    [InlineData("2026-1-30", false)]
    public void DayRange(string day, bool ok)
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        var reply = Assert.Single(rig.Send("sheet.fill", SheetRig.FillArgs(day: day)));
        if (ok)
        {
            Assert.Equal("result", reply.GetProperty("type").GetString());
        }
        else
        {
            Assert.Equal(ErrorCodes.BadMessage, reply.GetProperty("code").GetString());
            Assert.False(rig.BitTouched);
        }
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 저절로(auto)이고 지문이 지난번과 같으면 구글에 보내지 않고 정확히 {v, unchanged:true, rows}, 손 넣기는 지문을 보지 않는다")]
    public void SamePrintNotSent()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        rig.Result("sheet.fill", SheetRig.FillArgs(auto: true));
        Assert.Equal(new[] { "write" }, rig.Google.Actions);

        var again = rig.Result("sheet.fill", SheetRig.FillArgs(auto: true));
        Assert.Equal("{\"v\":1,\"unchanged\":true,\"rows\":1}", again.GetRawText());
        Assert.Equal(new[] { "write" }, rig.Google.Actions);

        rig.Result("sheet.fill", SheetRig.FillArgs(auto: false));
        Assert.Equal(new[] { "write", "write" }, rig.Google.Actions);

        // 줄이 바뀌면 다시 보낸다
        rig.Bit.Session.Answer(SheetSql.PaymentsSql, _ => new[] { new object?[] { "V1", SheetRig.Chart, "RCV", 7000m, 0m, 0m, "202610300920", 1, SheetRig.PatientName } });
        rig.Result("sheet.fill", SheetRig.FillArgs(auto: true));
        Assert.Equal(new[] { "write", "write", "write" }, rig.Google.Actions);
        // 지문은 sheet.dat에(날짜·SHA-256·줄 수, 환자 값 없음)
        var print = rig.Store.Load().Print!;
        Assert.Equal("2026-10-30", print.Day);
        Assert.Matches("^[0-9a-f]{64}$", print.Hash);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.fill: 주소를 바꾼 뒤(verified 거짓) hello mac이 맞을 때만 token·환자 줄을 보내고, 틀리면 E-GSHEET-KEY로 아무 줄도 보내지 않는다")]
    public void HelloBeforeRows()
    {
        using var rig = new SheetRig().Linked(false).OnePatientDay();
        rig.Google.WrongMac = true;

        Assert.Equal("E-GSHEET-KEY", rig.Error("sheet.fill", SheetRig.FillArgs()));
        Assert.Equal(new[] { "hello" }, rig.Google.Actions);
        Assert.DoesNotContain(SheetRig.Secret, rig.Google.AllBodies, StringComparison.Ordinal);
        Assert.DoesNotContain(SheetRig.PatientName, rig.Google.AllBodies, StringComparison.Ordinal);
        Assert.False(rig.Store.Load().Verified);

        rig.Google.WrongMac = false;
        rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.Equal(new[] { "hello", "hello", "write" }, rig.Google.Actions);
        Assert.True(rig.Store.Load().Verified);

        rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.Equal(new[] { "hello", "hello", "write", "write" }, rig.Google.Actions);
    }

    [Fact(DisplayName = "AC-8511.3 sheet.fill: 설정에 url·scriptUrl·shareWith 열쇠가 오면 거절(E-HELPER-BAD-MESSAGE), 늘 sheet.dat 주소로만 보낸다")]
    public void FillRefusesUrlKeys()
    {
        using var rig = new SheetRig().Linked(true, SheetRig.Url).OnePatientDay();
        foreach (var key in new[] { "url", "scriptUrl", "shareWith" })
        {
            var settings = SheetRig.SettingsJson().TrimEnd('}') + ",\"" + key + "\":\"" + SheetRig.WorkspaceUrl + "\"}";
            Assert.Equal(ErrorCodes.BadMessage, rig.Error("sheet.fill", SheetRig.FillArgs(settings: settings)));
        }
        Assert.Empty(rig.Google.Calls);
        rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.All(rig.Google.Calls.Where(c => c.Method == "POST"), c => Assert.Equal(SheetRig.Url, c.Url));
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 비밀 글자가 없으면 E-GSHEET-SECRET, 주소가 없으면 E-GSHEET-NOURL, 원본 시트가 없으면 E-GSHEET-NOTEMPLATE — 비트·구글을 건드리지 않는다")]
    public void FillBlockers()
    {
        using var rig = new SheetRig().OnePatientDay();
        Assert.Equal("E-GSHEET-SECRET", rig.Error("sheet.fill", SheetRig.FillArgs()));
        rig.Store.Save(new SheetState { Secret = SheetRig.Secret });
        Assert.Equal("E-GSHEET-NOURL", rig.Error("sheet.fill", SheetRig.FillArgs()));
        rig.Linked();
        Assert.Equal("E-GSHEET-NOTEMPLATE", rig.Error("sheet.fill", SheetRig.FillArgs(settings: SheetRig.SettingsJson(s => s.TemplateUrl = ""))));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 등록 안 된 PC는 E-BIT-NOT-REGISTERED")]
    public void FillNeedsRegistration()
    {
        using var rig = new SheetRig(registered: false).Linked();
        Assert.Equal(BitErrors.NotRegistered, rig.Error("sheet.fill", SheetRig.FillArgs()));
        Assert.Empty(rig.Google.Calls);
    }

    [Fact(DisplayName = "AC-8511.5 sheet.fill: 옛 7판 구글 코드도 넣고 답에 oldCode:true, sheetGid:null, version '7'")]
    public void OldCodeStillWrites()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        rig.Google.Version = "7";
        var data = rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.True(data.GetProperty("oldCode").GetBoolean());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("sheetGid").ValueKind);
        Assert.Equal("7", data.GetProperty("version").GetString());
        Assert.Equal(FillKeys, Json.Keys(data));
    }

    [Fact(DisplayName = "AC-8511.5 sheet.fill: 구글 답에 판 글자가 없으면 version '0'·oldCode 참, fileId가 없으면 null")]
    public void MissingVersion()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        rig.Google.WriteAnswer = _ => "{\"ok\":true,\"added\":1}";
        var data = rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.Equal("0", data.GetProperty("version").GetString());
        Assert.True(data.GetProperty("oldCode").GetBoolean());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("fileId").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("sheetGid").ValueKind);
        Assert.Equal("[]", data.GetProperty("ratioSkipped").GetRawText());
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 구글 token_not_set → E-GSHEET-NOKEY, bad_token → E-GSHEET-KEY")]
    public void GoogleKeyErrors()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        rig.Google.TokenNotSet = true;
        Assert.Equal("E-GSHEET-NOKEY", rig.Error("sheet.fill", SheetRig.FillArgs()));
        rig.Google.TokenNotSet = false;
        rig.Google.Token = "FAKEotherTokenFAKEotherToken0123";
        Assert.Equal("E-GSHEET-KEY", rig.Error("sheet.fill", SheetRig.FillArgs()));
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 비트 읽기가 20초를 넘으면 구글에 보내지 않고 E-GSHEET-TIMEOUT, 문장마다 시간 제한은 남은 시간까지")]
    public void BitReadTimeout()
    {
        using var rig = new SheetRig().Linked();
        rig.OnePatientDay(onVisits: () => rig.Clock.Advance(TimeSpan.FromSeconds(21)));

        Assert.Equal("E-GSHEET-TIMEOUT", rig.Error("sheet.fill", SheetRig.FillArgs()));
        Assert.Empty(rig.Google.Calls);
        Assert.All(rig.Bit.Session.Calls.Where(c => c.Sql.StartsWith("SELECT", StringComparison.Ordinal) && SheetSql.IsAllowed(c.Sql)),
            c => Assert.True(c.Timeout <= TimeSpan.FromSeconds(20), c.Timeout.ToString()));
        Assert.DoesNotContain(rig.Bit.Session.Calls, c => c.Sql == SheetSql.CancelledSql);
        Assert.Equal(1, rig.Bit.Session.Disposed);
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 구글 보내기는 45초(전체 60초) 안 — 넘으면 E-GSHEET-TIMEOUT, HTTP 시간 제한은 남은 시간")]
    public void GoogleTimeout()
    {
        using var rig = new SheetRig().Linked();
        rig.OnePatientDay(onVisits: () => rig.Clock.Advance(TimeSpan.FromSeconds(19)));
        rig.Google.PerCall = TimeSpan.FromSeconds(23);

        Assert.Equal("E-GSHEET-TIMEOUT", rig.Error("sheet.fill", SheetRig.FillArgs()));
        var left = Assert.Single(rig.TimeLeft);
        Assert.True(left() <= TimeSpan.Zero);
        // 비트에 19초를 썼으면 구글 몫은 60 − 19 = 41초
        Assert.Equal(2, rig.Google.Calls.Count);
    }

    [Fact(DisplayName = "AC-8511.4 sheet.fill: 비트가 빨리 끝나도 구글 몫은 45초까지")]
    public void GoogleBudgetIsFortyFive()
    {
        using var rig = new SheetRig().Linked().OnePatientDay();
        TimeSpan seen = TimeSpan.Zero;
        rig.Google.WriteAnswer = req =>
        {
            seen = rig.TimeLeft[0]();
            return "{\"ok\":true,\"version\":\"8\",\"sheetGid\":1}";
        };
        rig.Result("sheet.fill", SheetRig.FillArgs());
        Assert.Equal(TimeSpan.FromSeconds(45), seen);
    }
}
