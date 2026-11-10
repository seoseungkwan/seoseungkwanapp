using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Erp.Core;
using Erp.Core.Closing;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3601.4 ERP 도우미에 실린 명령 표 helper-erp/commands.json(TASK-11, design.md 2절): 기존 CommandTable.Parse가 고치지 않고 그대로 읽고,
/// 명령은 closing.codes·closing.day 둘뿐(patient: false), 맨 위 칸은 ERP 도우미·새 확장의 것이다.
/// 기존 도우미·웹이 읽는 src/lib/bridge/commands.json은 1a721ef 그대로다(웹 표에는 closing.*가 없다).
/// </summary>
public class ErpCommandTableTests
{
    private const string NewExtensionId = "lkancaiekmoieooheifdimahhkejfmjc";

    private static readonly CommandTable Table = ErpCommandTable.Load();

    /// <summary>기존 도우미 명령 표(1a721ef 그대로).</summary>
    private static readonly CommandTable WebTable = CommandTable.LoadEmbedded();

    /// <summary>크롬 규칙: 공개키(DER) SHA-256 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID.</summary>
    private static string ExtensionIdOf(string key)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Convert.FromBase64String(key));
        var hex = string.Concat(hash.Take(16).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
        return new string(hex.Select(c => (char)('a' + Convert.ToInt32(c.ToString(), 16))).ToArray());
    }

    private static string ManifestKey()
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Repo.PathOf("extension-erp", "manifest.json"), Encoding.UTF8));
        return manifest.RootElement.GetProperty("key").GetString()!;
    }

    private static string Group(string key, params string[] codes) =>
        "{\"key\":\"" + key + "\",\"codes\":[" + string.Join(",", codes.Select(code => "\"" + code + "\"")) + "]}";

    private static string Day(string date, params string[] groups) =>
        "{\"date\":\"" + date + "\",\"groups\":[" + string.Join(",", groups) + "]}";

    private static void Accepts(string cmd, string args) => Table.Validate(Requests.Make(cmd, args));

    private static void Refuses(string cmd, string args, string code = ErrorCodes.BadMessage)
    {
        var error = Assert.Throws<ProtocolException>(() => Table.Validate(Requests.Make(cmd, args)));
        Assert.Equal(code, error.Code);
    }

    [Fact(DisplayName = "AC-3601.4 실린 ERP 명령 표는 helper-erp/commands.json 바이트 그대로이고 기존 CommandTable.Parse가 그대로 읽는다")]
    public void EmbeddedIsTheFile()
    {
        var file = File.ReadAllBytes(Repo.PathOf("helper-erp", "commands.json"));
        Assert.Equal(file, ErpCommandTable.EmbeddedBytes());
        var parsed = CommandTable.Parse(file);
        Assert.Equal(parsed.Names, Table.Names);
        Assert.Equal(parsed.ExtensionId, Table.ExtensionId);
    }

    [Fact(DisplayName = "AC-3601.4 명령은 closing.codes·closing.day 둘뿐이고 둘 다 patient:false(보내기·확인 창 없음), 기존 명령(hello·claim.month·revenue.days)은 없다")]
    public void OnlyTwoCommands()
    {
        Assert.Equal(new[] { ClosingCommands.CodesName, ClosingCommands.DayName }, Table.Names);
        foreach (var name in Table.Names)
        {
            Assert.False(Table.IsPatient(name), name);
            Assert.False(Table.IsSend(name), name);
            Assert.False(Table.NeedsConfirm(name), name);
        }
        foreach (var name in new[] { "hello", "claim.month", "revenue.days", "bit.register", "store.save" }) Assert.False(Table.Has(name), name);

        // 웹 표(기존 도우미)에는 closing.*가 없다
        Assert.False(WebTable.Has(ClosingCommands.CodesName));
        Assert.False(WebTable.Has(ClosingCommands.DayName));
    }

    [Fact(DisplayName = "AC-3601.4 맨 위 칸: protocol 1, hostName com.seoseungkwan.erp_helper, origin https://erp.minesolution.com, extensionId = 새 확장(기존 확장과 다름)")]
    public void RootFields()
    {
        Assert.Equal(1, Table.Protocol);
        Assert.Equal(WebTable.Protocol, Table.Protocol);
        Assert.Equal("com.seoseungkwan.erp_helper", Table.HostName);
        Assert.Equal("https://erp.minesolution.com", Table.Origin);
        Assert.Equal(NewExtensionId, Table.ExtensionId);
        Assert.NotEqual(WebTable.ExtensionId, Table.ExtensionId);
        Assert.NotEqual(WebTable.HostName, Table.HostName);
    }

    [Fact(DisplayName = "AC-3601.4 extensionKey는 extension-erp/manifest.json key와 같고 그 key로 계산한 ID가 extensionId다")]
    public void KeyMatchesManifest()
    {
        var key = ManifestKey();
        Assert.Equal(key, Table.ExtensionKey);
        Assert.Equal(Table.ExtensionId, ExtensionIdOf(key));
        Assert.Equal(WebTable.ExtensionId, ExtensionIdOf(WebTable.ExtensionKey));
    }

    [Fact(DisplayName = "AC-3601.4 args 모양(design.md 2절): closing.codes는 빈 칸, closing.day는 date와 groups(묶음 0~19개, key 19개 가운데 하나, 코드 1~20개)")]
    public void ArgsShapeAccepts()
    {
        Accepts("closing.codes", "{}");
        Accepts("closing.day", Day("2026-11-09"));
        Accepts("closing.day", Day("2026-11-09", Group("carm", "CARM1"), Group("ptVisit", "AA222")));
        Accepts("closing.day", Day("2026-11-09", ClosingDay.GroupKeys.Select(key => Group(key, "X1")).ToArray()));
        Accepts("closing.day", Day("2026-11-09", Group("eswt", Enumerable.Range(0, 20).Select(i => "ESWT" + i).ToArray())));
        Accepts("closing.day", Day("2026-11-09", Group("manual", new string('M', 20), "도수")));
    }

    public static TheoryData<string, string> BadArgs => new TheoryData<string, string>
    {
        { "closing.codes", "{\"date\":\"2026-11-09\"}" },
        { "closing.day", "{}" },
        { "closing.day", "{\"date\":\"2026-11-09\"}" },
        { "closing.day", "{\"groups\":[]}" },
        { "closing.day", Day("2026/11/09") },
        { "closing.day", Day("2026-02-30") },
        { "closing.day", Day("2026-11-09", Group("massage", "X1")) },
        { "closing.day", Day("2026-11-09", Group("carm")) },
        { "closing.day", Day("2026-11-09", Group("carm", Enumerable.Range(0, 21).Select(i => "C" + i).ToArray())) },
        { "closing.day", Day("2026-11-09", Group("carm", new string('C', 21))) },
        { "closing.day", Day("2026-11-09", Group("carm", "CA RM1")) },
        { "closing.day", Day("2026-11-09", Group("carm", "")) },
        { "closing.day", Day("2026-11-09", ClosingDay.GroupKeys.Select(key => Group(key, "X1")).Concat(new[] { Group("carm", "X2") }).ToArray()) },
        { "closing.day", "{\"date\":\"2026-11-09\",\"groups\":[],\"chart\":\"900001\"}" },
        { "closing.day", Day("2026-11-09", "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"name\":\"x\"}") },
    };

    [Theory(DisplayName = "AC-3601.4 표 밖 args(모르는 칸·key·코드 수·코드 꼴·묶음 수·날짜 꼴)는 기존 Validate가 E-HELPER-BAD-MESSAGE로 막는다")]
    [MemberData(nameof(BadArgs))]
    public void ArgsShapeRefuses(string cmd, string args) => Refuses(cmd, args);

    [Fact(DisplayName = "AC-3601.4 표에 없는 명령은 기존 Validate가 E-HELPER-UNKNOWN-COMMAND로 막는다")]
    public void UnknownCommand()
    {
        Refuses("hello", "{}", ErrorCodes.UnknownCommand);
        Refuses("claim.month", "{\"month\":\"2026-10\"}", ErrorCodes.UnknownCommand);
        Refuses("revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}", ErrorCodes.UnknownCommand);
    }
}
