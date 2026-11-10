using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class CommandTableTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    /// <summary>검사가 통과하면 null, 막히면 오류 번호.</summary>
    private static string? Check(string cmd, string argsJson) => Check(Table, cmd, argsJson);

    private static string? Check(CommandTable table, string cmd, string argsJson)
    {
        try
        {
            table.Validate(Requests.Make(cmd, argsJson));
            return null;
        }
        catch (ProtocolException e)
        {
            return e.Code;
        }
    }

    private static string Period(string from, string to) => "{\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";

    private static string Payload(string innerJson) => "{\"payload\":" + JsonSerializer.Serialize(innerJson) + "}";

    private static string Item(string visitKey = "v-1", string chart = Fake.Chart, string name = Fake.Name,
        string date = "2026-10-01", string memo = "가짜 메모") =>
        "{\"visitKey\":" + JsonSerializer.Serialize(visitKey) + ",\"chart\":" + JsonSerializer.Serialize(chart)
        + ",\"name\":" + JsonSerializer.Serialize(name) + ",\"date\":" + JsonSerializer.Serialize(date)
        + ",\"memo\":" + JsonSerializer.Serialize(memo) + "}";

    private static string Items(params string[] items) => "{\"items\":[" + string.Join(",", items) + "]}";

    private static string ManyItems(int count) =>
        Items(Enumerable.Range(0, count).Select(i => Item(visitKey: "v-" + i)).ToArray());

    // ---- 명령 표 = src/lib/bridge/commands.json --------------------------------------------------

    [Fact(DisplayName = "AC-001.2 도우미가 싣는 명령 표는 src/lib/bridge/commands.json과 바이트까지 같다")]
    public void EmbeddedTableEqualsRepositoryFile()
    {
        var file = File.ReadAllBytes(Repo.PathOf("src", "lib", "bridge", "commands.json"));

        Assert.Equal(file, CommandTable.EmbeddedBytes());
    }

    [Fact(DisplayName = "AC-001.2 명령 표에는 design.md 4-3의 명령 12개가 있고 환자 자료 여부가 맞다")]
    public void TableHasTwelveCommands()
    {
        var patient = new[] { "claim.month", "claim.memos", "store.load", "store.save", "bit.input", "sam.latest", "contact.targets", "stats.rows" };
        var notPatient = new[] { "hello", "bit.check", "bit.register", "claim.dates",
            "revenue.days" };

        Assert.Equal(patient.Concat(notPatient).OrderBy(n => n, StringComparer.Ordinal),
            Table.Names.OrderBy(n => n, StringComparer.Ordinal));
        foreach (var name in patient) Assert.True(Table.IsPatient(name), name);
        foreach (var name in notPatient) Assert.False(Table.IsPatient(name), name);
        Assert.False(Table.Has("nope"));
        Assert.False(Table.IsPatient("nope"));
    }

    [Fact(DisplayName = "AC-001.2 보내는 명령은 store.save·bit.input이고 args는 {payload} 하나다")]
    public void SendCommandsTakePayloadOnly()
    {
        var send = Table.Names.Where(Table.IsSend).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "bit.input", "store.save" }, send);

        using var doc = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        foreach (var name in send)
        {
            var args = doc.RootElement.GetProperty("commands").GetProperty(name).GetProperty("args");
            Assert.Equal(new[] { "payload" }, Json.Keys(args));
            Assert.Equal("payload", args.GetProperty("payload").GetProperty("type").GetString());
        }
    }

    [Fact(DisplayName = "AC-001.3 표의 protocol·hostName·origin·extensionId가 정해 둔 값이다")]
    public void TableIdentity()
    {
        Assert.Equal(1, Table.Protocol);
        Assert.Equal("com.seoseungkwan.precheck", Table.HostName);
        Assert.Equal("https://seoseungkwanapp.vercel.app", Table.Origin);
        Assert.Matches("^[a-p]{32}$", Table.ExtensionId);
        Assert.DoesNotContain("*", Encoding.UTF8.GetString(CommandTable.EmbeddedBytes()));
    }

    [Fact(DisplayName = "AC-001.3 extensionId는 extensionKey(공개키 DER)의 SHA-256 앞 32자를 a~p로 바꾼 것이다")]
    public void ExtensionIdMatchesKey()
    {
        var der = Convert.FromBase64String(Table.ExtensionKey);
        using var sha = SHA256.Create();
        var hex = BitConverter.ToString(sha.ComputeHash(der)).Replace("-", "").ToLowerInvariant().Substring(0, 32);
        var id = new string(hex.Select(c => (char)('a' + Convert.ToInt32(c.ToString(), 16))).ToArray());

        Assert.Equal(id, Table.ExtensionId);
    }

    // ---- 명령 이름 ------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-001.2 표에 없는 cmd면 E-HELPER-UNKNOWN-COMMAND")]
    [InlineData("nope")]
    [InlineData("Hello")]
    [InlineData("hello ")]
    [InlineData("")]
    [InlineData(Fake.Name)]
    [InlineData("__proto__")]
    public void UnknownCommand(string cmd)
    {
        Assert.Equal("E-HELPER-UNKNOWN-COMMAND", Check(cmd, "{}"));
    }

    // ---- 칸 없음·모르는 칸 ------------------------------------------------------------------------

    [Theory(DisplayName = "AC-001.2 칸이 없는 명령은 빈 args만 받는다")]
    [InlineData("hello")]
    [InlineData("bit.check")]
    [InlineData("bit.register")]
    [InlineData("sam.latest")]
    public void EmptyArgsCommands(string cmd)
    {
        Assert.Null(Check(cmd, "{}"));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check(cmd, "{\"x\":1}"));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check(cmd, "{\"name\":\"" + Fake.Name + "\"}"));
    }

    [Theory(DisplayName = "AC-001.2 args에 모르는 칸·같은 칸 두 번·빠진 칸이 있으면 E-HELPER-BAD-MESSAGE")]
    [InlineData("claim.month", "{\"from\":\"2026-10-01\",\"to\":\"2026-10-31\",\"chart\":\"900001\"}")]
    [InlineData("claim.month", "{\"from\":\"2026-10-01\"}")]
    [InlineData("claim.month", "{\"to\":\"2026-10-31\"}")]
    [InlineData("claim.month", "{\"from\":\"2026-10-01\",\"from\":\"2026-10-02\",\"to\":\"2026-10-31\"}")]
    [InlineData("claim.dates", "{}")]
    [InlineData("store.load", "{\"months\":[\"2026-10\"],\"extra\":true}")]
    public void UnknownOrMissingFields(string cmd, string args)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check(cmd, args));
    }

    // ---- 날짜·기간 -------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-001.2 날짜 칸은 YYYY-MM-DD 실제 있는 날만 받는다")]
    [InlineData("2026-02-29")]
    [InlineData("2026-13-01")]
    [InlineData("2026-10-32")]
    [InlineData("2026-1-01")]
    [InlineData("20261001")]
    [InlineData("2026-10-01T00:00:00")]
    [InlineData("2026-10-01 ")]
    [InlineData("２０２６-10-01")]
    public void RejectsBadDates(string from)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("claim.month", Period(from, "2026-10-31")));
    }

    [Theory(DisplayName = "AC-001.2 날짜 칸이 글자가 아니면(틀린 종류) E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"from\":20261001,\"to\":\"2026-10-31\"}")]
    [InlineData("{\"from\":null,\"to\":\"2026-10-31\"}")]
    [InlineData("{\"from\":[\"2026-10-01\"],\"to\":\"2026-10-31\"}")]
    public void RejectsWrongDateKinds(string args)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("claim.month", args));
    }

    [Fact(DisplayName = "AC-001.2 2024-02-29처럼 윤날은 받는다")]
    public void AcceptsLeapDay()
    {
        Assert.Null(Check("claim.month", Period("2024-02-01", "2024-02-29")));
    }

    [Theory(DisplayName = "AC-001.2 기간은 from ≤ to, 시작·끝 날을 함께 세어 명령마다 최대 날 수 이하")]
    [InlineData("claim.month", "2026-10-01", "2026-11-04", null)]                       // 35일, 달을 넘김
    [InlineData("claim.month", "2026-10-01", "2026-11-05", "E-HELPER-BAD-MESSAGE")]     // 36일
    [InlineData("claim.month", "2026-10-15", "2026-10-15", null)]                       // 하루
    [InlineData("claim.month", "2026-10-02", "2026-10-01", "E-HELPER-BAD-MESSAGE")]     // from > to
    [InlineData("claim.month", "2026-12-15", "2027-01-18", null)]                       // 해를 넘김 35일
    [InlineData("claim.dates", "2025-10-01", "2026-11-04", null)]                       // 400일
    [InlineData("claim.dates", "2025-10-01", "2026-11-05", "E-HELPER-BAD-MESSAGE")]     // 401일
    [InlineData("claim.memos", "2025-10-01", "2026-11-04", null)]
    [InlineData("claim.memos", "2025-10-01", "2026-11-05", "E-HELPER-BAD-MESSAGE")]
    [InlineData("stats.rows", "2024-09-01", "2026-11-09", null)]                        // 800일
    [InlineData("stats.rows", "2024-09-01", "2026-11-10", "E-HELPER-BAD-MESSAGE")]      // 801일
    public void PeriodLimits(string cmd, string from, string to, string? expected)
    {
        Assert.Equal(expected, Check(cmd, Period(from, to)));
    }

    [Theory(DisplayName = "AC-001.2 contact.targets는 kind(followup·injection)와 1,100일 이하 기간")]
    [InlineData("followup", "2026-07-01", "2026-10-28", null)]
    [InlineData("injection", "2023-10-26", "2026-10-29", null)]                         // 1,100일
    [InlineData("injection", "2023-10-25", "2026-10-29", "E-HELPER-BAD-MESSAGE")]       // 1,101일
    [InlineData("other", "2026-07-01", "2026-10-28", "E-HELPER-BAD-MESSAGE")]
    [InlineData("Followup", "2026-07-01", "2026-10-28", "E-HELPER-BAD-MESSAGE")]
    public void ContactTargets(string kind, string from, string to, string? expected)
    {
        var args = "{\"kind\":\"" + kind + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
        Assert.Equal(expected, Check("contact.targets", args));
    }

    [Theory(DisplayName = "AC-2801.5 contact.targets kind에 lapsed·reservation을 더했다(1,100일 한도 그대로), 글자가 다르면 E-HELPER-BAD-MESSAGE")]
    [InlineData("lapsed", "2024-10-31", "2026-09-30", null)]
    [InlineData("lapsed", "2023-10-26", "2026-10-29", null)]                            // 1,100일
    [InlineData("lapsed", "2023-10-25", "2026-10-29", "E-HELPER-BAD-MESSAGE")]          // 1,101일
    [InlineData("reservation", "2026-09-30", "2026-11-13", null)]
    [InlineData("Reservation", "2026-09-30", "2026-11-13", "E-HELPER-BAD-MESSAGE")]
    [InlineData("reservations", "2026-09-30", "2026-11-13", "E-HELPER-BAD-MESSAGE")]
    [InlineData("lapsed ", "2024-10-31", "2026-09-30", "E-HELPER-BAD-MESSAGE")]
    public void ContactTargetsListKinds(string kind, string from, string to, string? expected)
    {
        var args = "{\"kind\":\"" + kind + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
        Assert.Equal(expected, Check("contact.targets", args));
    }

    [Fact(DisplayName = "AC-2801.5 commands.json의 contact.targets kind 값은 followup·injection·lapsed·reservation 넷이고 명령 이름·칸은 그대로다")]
    public void ContactTargetsKindValues()
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(Repo.PathOf("src", "lib", "bridge", "commands.json")));
        var targets = doc.RootElement.GetProperty("commands").GetProperty("contact.targets");
        var args = targets.GetProperty("args");
        Assert.Equal(new[] { "kind", "from", "to" }, args.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal("enum", args.GetProperty("kind").GetProperty("type").GetString());
        Assert.Equal(new[] { "followup", "injection", "lapsed", "reservation" }, args.GetProperty("kind").GetProperty("values").EnumerateArray().Select(v => v.GetString()).ToArray());
        Assert.True(targets.GetProperty("patient").GetBoolean());
        Assert.Equal(1100, targets.GetProperty("maxDays").GetInt32());
        Assert.True(Table.Has("contact.targets"));
        Assert.True(Table.IsPatient("contact.targets"));
    }

    [Fact(DisplayName = "AC-001.2 contact.targets에 kind가 없으면 E-HELPER-BAD-MESSAGE")]
    public void ContactTargetsNeedsKind()
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("contact.targets", Period("2026-07-01", "2026-10-28")));
    }

    // ---- store.load ---------------------------------------------------------------------------

    [Theory(DisplayName = "AC-001.2 store.load는 months(YYYY-MM 1~24개)·settings·contact(참·거짓)만, 모두 생략 가능")]
    [InlineData("{}", null)]
    [InlineData("{\"months\":[\"2026-10\"]}", null)]
    [InlineData("{\"months\":[\"2026-10\",\"2026-09\"],\"settings\":true,\"contact\":false}", null)]
    [InlineData("{\"months\":[]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"months\":[\"2026-13\"]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"months\":[\"2026-1\"]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"months\":[\"2026-10-01\"]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"months\":\"2026-10\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"months\":[202610]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"settings\":\"yes\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"contact\":1}", "E-HELPER-BAD-MESSAGE")]
    public void StoreLoad(string args, string? expected)
    {
        Assert.Equal(expected, Check("store.load", args));
    }

    [Fact(DisplayName = "AC-001.2 store.load months는 24개까지")]
    public void StoreLoadMonthCount()
    {
        string Months(int n) => "{\"months\":[" + string.Join(",", Enumerable.Range(0, n)
            .Select(i => "\"" + new DateTime(2024, 1, 1).AddMonths(i).ToString("yyyy-MM") + "\"")) + "]}";

        Assert.Null(Check("store.load", Months(24)));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("store.load", Months(25)));
    }

    // ---- 보내는 명령: payload ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-001.2 store.save payload를 풀어 안쪽 모양으로 검사하고 처리기에는 푼 값을 넘긴다")]
    public void StoreSavePayloadIsUnpacked()
    {
        var request = Requests.Make("store.save", Payload("{\"month\":\"2026-10\",\"drafts\":{\"v-1\":\"가짜 메모\"},\"done\":{}}"));

        Table.Validate(request);

        Assert.Equal(JsonValueKind.Object, request.Args.ValueKind);
        Assert.Equal("2026-10", request.Args.GetProperty("month").GetString());
        Assert.Equal("가짜 메모", request.Args.GetProperty("drafts").GetProperty("v-1").GetString());
        Assert.False(request.Args.TryGetProperty("payload", out _));
    }

    [Theory(DisplayName = "AC-001.2 store.save 안쪽 칸: month?·drafts?·done?·journal?·contact?·settings?")]
    [InlineData("{}", null)]
    [InlineData("{\"settings\":{\"rules\":{}}}", null)]
    [InlineData("{\"contact\":{\"x\":1},\"journal\":{\"y\":[1,2]}}", null)]
    [InlineData("{\"month\":\"2026-13\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"drafts\":[]}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"done\":\"x\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"chart\":\"900001\"}", "E-HELPER-BAD-MESSAGE")]
    public void StoreSaveInnerShape(string inner, string? expected)
    {
        Assert.Equal(expected, Check("store.save", Payload(inner)));
    }

    [Theory(DisplayName = "AC-001.2 payload가 글자가 아니거나 풀리지 않거나 객체가 아니면 E-HELPER-BAD-MESSAGE")]
    [InlineData("store.save", "{\"payload\":{\"month\":\"2026-10\"}}")]
    [InlineData("store.save", "{\"payload\":\"{\\\"month\\\":\"}")]
    [InlineData("store.save", "{\"payload\":\"not json\"}")]
    [InlineData("store.save", "{\"payload\":\"[]\"}")]
    [InlineData("store.save", "{\"payload\":\"null\"}")]
    [InlineData("store.save", "{\"payload\":\"\"}")]
    [InlineData("store.save", "{}")]
    [InlineData("store.save", "{\"payload\":\"{}\",\"month\":\"2026-10\"}")]
    [InlineData("store.save", "{\"month\":\"2026-10\"}")]
    [InlineData("bit.input", "{\"payload\":{\"items\":[]}}")]
    [InlineData("bit.input", "{\"payload\":\"{\\\"items\\\":[\"}")]
    public void BadPayload(string cmd, string args)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check(cmd, args));
    }

    [Fact(DisplayName = "AC-001.2 bit.input payload의 items를 풀어 처리기에 넘긴다")]
    public void BitInputPayloadIsUnpacked()
    {
        var request = Requests.Make("bit.input", Payload(Items(Item())));

        Table.Validate(request);

        var item = request.Args.GetProperty("items")[0];
        Assert.Equal(Fake.Chart, item.GetProperty("chart").GetString());
        Assert.Equal(Fake.Name, item.GetProperty("name").GetString());
    }

    [Fact(DisplayName = "AC-001.2 bit.input 묶음은 1~500개, 500개를 넘으면 E-HELPER-BAD-MESSAGE")]
    public void BitInputBatchSize()
    {
        Assert.Null(Check("bit.input", Payload(ManyItems(500))));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("bit.input", Payload(ManyItems(501))));
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("bit.input", Payload(Items())));
    }

    public static TheoryData<string> BadItems => new TheoryData<string>
    {
        Item(chart: "90000a"),
        Item(chart: "900001\n"),
        Item(chart: ""),
        Item(chart: new string('9', 21)),
        Item(chart: "９00001"),
        Item(name: ""),
        Item(name: new string('가', 101)),
        Item(date: "2026-02-29"),
        Item(date: "2026/10/01"),
        Item(memo: ""),
        Item(memo: new string('메', 32001)),
        Item(visitKey: ""),
        Item(visitKey: new string('k', 65)),
        "{\"visitKey\":\"v-1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-01\"}",
        "{\"visitKey\":\"v-1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-01\",\"memo\":\"m\",\"phone\":\"010-0000-0001\"}",
        "{\"visitKey\":\"v-1\",\"chart\":900001,\"name\":\"가상환자01\",\"date\":\"2026-10-01\",\"memo\":\"m\"}",
        "\"" + Fake.Chart + "\"",
    };

    [Theory(DisplayName = "AC-001.2 bit.input 항목 칸이 틀리면(차트번호 숫자 1~20자·이름 1~100자·날짜·메모 1~32,000자) E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadItems))]
    public void BitInputBadItem(string item)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check("bit.input", Payload(Items(Item(visitKey: "ok"), item))));
    }

    /// <summary>메모가 이모지 중간에서 잘려 짝 없는 대리쌍 이스케이프(\ud83d)로 온 항목 JSON.</summary>
    private const string LoneSurrogateMemoItem =
        "{\"visitKey\":\"v-1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-01\",\"memo\":\"가짜 메모\\ud83d\"}";

    public static TheoryData<string, string> LoneSurrogateArgs => new TheoryData<string, string>
    {
        { "bit.input", Payload(Items(LoneSurrogateMemoItem)) },
        { "bit.input", "{\"payload\":\"\\ud83d\"}" },
        { "store.save", Payload("{\"month\":\"\\ud83d\"}") },
        { "store.save", Payload("{\"drafts\":{},\"\\udfff\":{}}") },
        { "claim.month", "{\"from\":\"\\ud800\",\"to\":\"2026-10-31\"}" },
        { "contact.targets", "{\"kind\":\"followup\\udfff\",\"from\":\"2026-10-01\",\"to\":\"2026-10-02\"}" },
        { "hello", "{\"\\ud800\":1}" },
    };

    [Theory(DisplayName = "AC-001.2 args·payload 글자나 칸 이름에 짝 없는 대리쌍 이스케이프가 있으면 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(LoneSurrogateArgs))]
    public void LoneSurrogateEscapesAreBadMessage(string cmd, string args)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Check(cmd, args));
    }

    [Fact(DisplayName = "AC-001.2 bit.input 칸 경계값(차트 20자리·이름 100자·메모 32,000자·visitKey 64자)은 받는다")]
    public void BitInputBoundaries()
    {
        var item = Item(visitKey: new string('k', 64), chart: new string('9', 20), name: new string('가', 100),
            memo: new string('메', 32000));

        Assert.Null(Check("bit.input", Payload(Items(item))));
    }

    // ---- 칸 종류(작은 표로 시험) ---------------------------------------------------------------------

    private const string KindsTable = @"{
  ""protocol"": 1,
  ""hostName"": ""com.seoseungkwan.precheck"",
  ""origin"": ""https://seoseungkwanapp.vercel.app"",
  ""extensionId"": ""abcdefghijklmnopabcdefghijklmnop"",
  ""extensionKey"": ""AAAA"",
  ""commands"": {
    ""t.int"": { ""patient"": false, ""args"": { ""n"": { ""type"": ""int"", ""min"": 1, ""max"": 10 } } },
    ""t.bool"": { ""patient"": false, ""args"": { ""b"": { ""type"": ""bool"" } } },
    ""t.json"": { ""patient"": true, ""args"": { ""j"": { ""type"": ""json"" } } },
    ""t.obj"": { ""patient"": false, ""args"": { ""o"": { ""type"": ""object"", ""fields"": { ""a"": { ""type"": ""string"", ""min"": 1, ""max"": 3 }, ""b"": { ""type"": ""bool"", ""optional"": true } } } } }
  }
}";

    [Theory(DisplayName = "AC-001.2 칸 종류 int·bool·json·object를 종류와 범위로 검사한다")]
    [InlineData("t.int", "{\"n\":1}", null)]
    [InlineData("t.int", "{\"n\":10}", null)]
    [InlineData("t.int", "{\"n\":0}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.int", "{\"n\":11}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.int", "{\"n\":1.5}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.int", "{\"n\":\"1\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.int", "{\"n\":99999999999999999999}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.bool", "{\"b\":false}", null)]
    [InlineData("t.bool", "{\"b\":\"false\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.json", "{\"j\":[1,{\"x\":null}]}", null)]
    [InlineData("t.json", "{\"j\":null}", null)]
    [InlineData("t.json", "{}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.obj", "{\"o\":{\"a\":\"abc\"}}", null)]
    [InlineData("t.obj", "{\"o\":{\"a\":\"abc\",\"b\":true}}", null)]
    [InlineData("t.obj", "{\"o\":{\"a\":\"abcd\"}}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.obj", "{\"o\":{\"a\":\"a\",\"c\":1}}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.obj", "{\"o\":{}}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("t.obj", "{\"o\":[]}", "E-HELPER-BAD-MESSAGE")]
    public void FieldKinds(string cmd, string args, string? expected)
    {
        var table = CommandTable.Parse(Encoding.UTF8.GetBytes(KindsTable));

        Assert.Equal(expected, Check(table, cmd, args));
    }

    [Theory(DisplayName = "AC-001.2 명령 표 자체가 틀리면(모르는 종류·모르는 열쇠·틀린 확장 ID·와일드카드 origin) 싣지 않는다")]
    [InlineData("\"type\": \"int\"", "\"type\": \"integer\"")]
    [InlineData("\"min\": 1, \"max\": 10", "\"min\": 1, \"max\": 10, \"step\": 2")]
    [InlineData("abcdefghijklmnopabcdefghijklmnop", "abcdefghijklmnopabcdefghijklmnoq")]
    [InlineData("https://seoseungkwanapp.vercel.app", "https://*.vercel.app")]
    [InlineData("\"patient\": false, \"args\": { \"b\"", "\"args\": { \"b\"")]
    public void RejectsBrokenTable(string find, string replace)
    {
        var broken = KindsTable.Replace(find, replace);
        Assert.NotEqual(KindsTable, broken);

        Assert.Throws<InvalidDataException>(() => CommandTable.Parse(Encoding.UTF8.GetBytes(broken)));
    }

    // ---- erp 구역: 새 확장 'ERP 마감일지 채우기'의 명령 (spec erp-closing-fill, design.md 2절·3-1) ---------------

    private static string? CheckAs(CommandTable table, Caller caller, string cmd, string argsJson)
    {
        try
        {
            table.Validate(Requests.Make(cmd, argsJson), caller);
            return null;
        }
        catch (ProtocolException e)
        {
            return e.Code;
        }
    }

    private static string? CheckAs(Caller caller, string cmd, string argsJson) => CheckAs(Table, caller, cmd, argsJson);

    private const string UnknownCode = "E-HELPER-UNKNOWN-COMMAND";
    private const string BadCode = "E-HELPER-BAD-MESSAGE";

    private static readonly string[] GroupKeys =
    {
        "carm", "sono", "arthro", "manual", "eswt", "pt", "etc1", "etc2", "etc3", "etc4",
        "manualConsult", "lipus", "nail", "ct", "surgery", "eswtStd", "eswtRadial", "injection", "ptVisit",
    };

    private static string Group(string key, params string[] codes) =>
        "{\"key\":" + JsonSerializer.Serialize(key) + ",\"codes\":" + JsonSerializer.Serialize(codes) + "}";

    private static string ClosingDay(string date, params string[] groups) =>
        "{\"date\":" + JsonSerializer.Serialize(date) + ",\"groups\":[" + string.Join(",", groups) + "]}";

    /// <summary>design.md 2절의 erp.commands 그대로.</summary>
    private const string ErpCommandsDesign = @"{
  ""closing.codes"": { ""patient"": false, ""args"": {} },
  ""closing.day"": { ""patient"": false, ""args"": {
    ""date"": { ""type"": ""date"" },
    ""groups"": { ""type"": ""array"", ""min"": 0, ""max"": 19, ""items"": { ""type"": ""object"", ""fields"": {
      ""key"": { ""type"": ""enum"", ""values"": [""carm"",""sono"",""arthro"",""manual"",""eswt"",""pt"",""etc1"",""etc2"",""etc3"",""etc4"",
               ""manualConsult"",""lipus"",""nail"",""ct"",""surgery"",""eswtStd"",""eswtRadial"",""injection"",""ptVisit""] },
      ""codes"": { ""type"": ""array"", ""min"": 1, ""max"": 20,
                 ""items"": { ""type"": ""string"", ""min"": 1, ""max"": 20, ""pattern"": ""^\\S{1,20}$"" } } } } } } }
}";

    private static string Compact(JsonElement element) => JsonSerializer.Serialize(element);

    [Fact(DisplayName = "AC-3601.4 commands.json erp 구역은 extensionId·extensionKey·commands 셋이고 commands는 design.md 2절 그대로(closing.codes·closing.day, patient false)")]
    public void ErpSectionMatchesDesign()
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(Repo.PathOf("src", "lib", "bridge", "commands.json")));
        var erp = doc.RootElement.GetProperty("erp");
        using var design = JsonDocument.Parse(ErpCommandsDesign);

        Assert.Equal(new[] { "extensionId", "extensionKey", "commands" }, Json.Keys(erp));
        Assert.Equal(Compact(design.RootElement), Compact(erp.GetProperty("commands")));
        Assert.Equal(GroupKeys, erp.GetProperty("commands").GetProperty("closing.day").GetProperty("args").GetProperty("groups")
            .GetProperty("items").GetProperty("fields").GetProperty("key").GetProperty("values").EnumerateArray().Select(v => v.GetString()).ToArray());
    }

    [Fact(DisplayName = "AC-3601.4 새 명령 둘은 erp 구역에만 있다: Names는 지금 commands 구역 그대로, ErpNames는 closing.codes·closing.day, Has는 두 구역을 다 본다")]
    public void ErpNamesAreSeparate()
    {
        Assert.Equal(new[] { "closing.codes", "closing.day" }, Table.ErpNames.ToArray());
        Assert.DoesNotContain(Table.Names, name => name.StartsWith("closing.", StringComparison.Ordinal));
        Assert.Contains("hello", Table.Names);
        foreach (var name in Table.ErpNames)
        {
            Assert.True(Table.Has(name), name);
            Assert.False(Table.IsPatient(name), name);
            Assert.False(Table.IsSend(name), name);
            Assert.False(Table.NeedsConfirm(name), name);
        }

        using var doc = JsonDocument.Parse(File.ReadAllBytes(Repo.PathOf("src", "lib", "bridge", "commands.json")));
        Assert.False(doc.RootElement.GetProperty("commands").TryGetProperty("closing.codes", out _));
        Assert.False(doc.RootElement.GetProperty("commands").TryGetProperty("closing.day", out _));
    }

    [Fact(DisplayName = "AC-3601.1 erp.extensionId는 erp.extensionKey(공개키 DER)의 SHA-256 앞 32자를 a~p로 바꾼 것이고 기존 확장 ID와 다르다")]
    public void ErpExtensionIdMatchesKey()
    {
        var erpId = Assert.IsType<string>(Table.ErpExtensionId);
        var erpKey = Assert.IsType<string>(Table.ErpExtensionKey);
        var der = Convert.FromBase64String(erpKey);
        using var sha = SHA256.Create();
        var hex = BitConverter.ToString(sha.ComputeHash(der)).Replace("-", "").ToLowerInvariant().Substring(0, 32);
        var id = new string(hex.Select(c => (char)('a' + Convert.ToInt32(c.ToString(), 16))).ToArray());

        Assert.Matches("^[a-p]{32}$", erpId);
        Assert.Equal(id, erpId);
        Assert.NotEqual(Table.ExtensionId, erpId);
    }

    [Fact(DisplayName = "AC-3601.3 새 확장(Caller.Erp)이 부르면 commands 구역 명령(hello 포함)은 모두 E-HELPER-UNKNOWN-COMMAND, closing.*는 받는다")]
    public void ErpCallerSeesOnlyErpCommands()
    {
        foreach (var name in Table.Names) Assert.Equal(UnknownCode, CheckAs(Caller.Erp, name, "{}"));
        Assert.Equal(UnknownCode, CheckAs(Caller.Erp, "claim.month", Period("2026-10-01", "2026-10-31")));
        Assert.Equal(UnknownCode, CheckAs(Caller.Erp, "revenue.days", Period("2026-11-09", "2026-11-09")));
        Assert.Equal(UnknownCode, CheckAs(Caller.Erp, "nope", "{}"));

        Assert.Null(CheckAs(Caller.Erp, "closing.codes", "{}"));
        Assert.Null(CheckAs(Caller.Erp, "closing.day", ClosingDay("2026-11-09", Group("carm", "CARM1"))));
    }

    [Fact(DisplayName = "AC-3601.3 기존 확장(Caller.Web·두 인자 Validate)이 부르면 closing.*는 바른 args여도 E-HELPER-UNKNOWN-COMMAND이고 지금 명령은 그대로")]
    public void WebCallerDoesNotSeeErpCommands()
    {
        var day = ClosingDay("2026-11-09", Group("carm", "CARM1"));
        Assert.Equal(UnknownCode, Check("closing.codes", "{}"));
        Assert.Equal(UnknownCode, Check("closing.day", day));
        Assert.Equal(UnknownCode, CheckAs(Caller.Web, "closing.codes", "{}"));
        Assert.Equal(UnknownCode, CheckAs(Caller.Web, "closing.day", day));

        Assert.Null(CheckAs(Caller.Web, "hello", "{}"));
        Assert.Null(CheckAs(Caller.Web, "claim.month", Period("2026-10-01", "2026-10-31")));
        Assert.Null(CheckAs(Caller.Web, "revenue.days", Period("2026-11-09", "2026-11-09")));
        Assert.Equal(BadCode, CheckAs(Caller.Web, "claim.month", Period("2026-10-01", "2026-11-30")));
    }

    [Theory(DisplayName = "AC-3601.4 closing.codes는 빈 args만 받는다")]
    [InlineData("{}", null)]
    [InlineData("{\"x\":1}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"date\":\"2026-11-09\"}", "E-HELPER-BAD-MESSAGE")]
    [InlineData("[]", "E-HELPER-BAD-MESSAGE")]
    public void ClosingCodesArgs(string args, string? expected)
    {
        Assert.Equal(expected, CheckAs(Caller.Erp, "closing.codes", args));
    }

    public static TheoryData<string, string?> ClosingDayArgs => new TheoryData<string, string?>
    {
        { ClosingDay("2026-11-09"), null },
        { ClosingDay("2026-11-09", Group("carm", "CARM1"), Group("ptVisit", "AA222")), null },
        { ClosingDay("2026-11-09", Group("eswt", "ESWT7", "ESWT10", "ESWT12", "ESWT17")), null },
        { ClosingDay("2026-11-09", Group("manual", "도수")), null },
        { ClosingDay("2024-02-29", Group("pt", "MM010")), null },
        { ClosingDay("2026-11-09", Group("etc1", Enumerable.Range(0, 20).Select(i => "C" + i).ToArray())), null },
        { ClosingDay("2026-11-09", Group("etc1", Enumerable.Range(0, 21).Select(i => "C" + i).ToArray())), BadCode },
        { ClosingDay("2026-11-09", Group("etc1", new string('A', 20))), null },
        { ClosingDay("2026-11-09", Group("etc1", new string('A', 21))), BadCode },
        { ClosingDay("2026-11-09", Group("carm")), BadCode },
        { ClosingDay("2026-11-09", Group("carm", "")), BadCode },
        { ClosingDay("2026-11-09", Group("carm", "CA RM")), BadCode },
        { ClosingDay("2026-11-09", Group("carm", " CARM1")), BadCode },
        { ClosingDay("2026-11-09", Group("carm", "CARM1\n")), BadCode },
        { ClosingDay("2026-11-09", Group("Carm", "CARM1")), BadCode },
        { ClosingDay("2026-11-09", Group("other", "CARM1")), BadCode },
        { ClosingDay("2026-11-09", Group("ptvisit", "AA222")), BadCode },
        { ClosingDay("2026-02-29"), BadCode },
        { ClosingDay("20261109"), BadCode },
        { "{\"groups\":[]}", BadCode },
        { "{\"date\":\"2026-11-09\"}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":[],\"x\":1}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"name\":\"씨암\"}]}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":[{\"key\":\"carm\"}]}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":[{\"key\":\"carm\",\"codes\":\"CARM1\"}]}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":[{\"key\":\"carm\",\"codes\":[1]}]}", BadCode },
        { "{\"date\":\"2026-11-09\",\"groups\":{}}", BadCode },
    };

    [Theory(DisplayName = "AC-3601.4 closing.day args는 date(실제 날)와 groups(0~19개, key는 19개 가운데 하나, codes 1~20개·공백 없는 1~20자)뿐")]
    [MemberData(nameof(ClosingDayArgs))]
    public void ClosingDayArgsShape(string args, string? expected)
    {
        Assert.Equal(expected, CheckAs(Caller.Erp, "closing.day", args));
    }

    [Fact(DisplayName = "AC-3601.4 closing.day groups는 19개까지(design.md 2절 key 19개를 모두 담을 수 있다)")]
    public void ClosingDayGroupCount()
    {
        var all = GroupKeys.Select(key => Group(key, "X1")).ToArray();

        Assert.Null(CheckAs(Caller.Erp, "closing.day", ClosingDay("2026-11-09", all)));
        Assert.Equal(BadCode, CheckAs(Caller.Erp, "closing.day", ClosingDay("2026-11-09", all.Concat(new[] { Group("carm", "X2") }).ToArray())));
    }

    private const string ErpTable = @"{
  ""protocol"": 1,
  ""hostName"": ""com.seoseungkwan.precheck"",
  ""origin"": ""https://seoseungkwanapp.vercel.app"",
  ""extensionId"": ""abcdefghijklmnopabcdefghijklmnop"",
  ""extensionKey"": ""AAAA"",
  ""commands"": {
    ""t.web"": { ""patient"": false, ""args"": {} }
  },
  ""erp"": {
    ""extensionId"": ""ponmlkjihgfedcbaponmlkjihgfedcba"",
    ""extensionKey"": ""BBBB"",
    ""commands"": {
      ""t.erp"": { ""patient"": false, ""args"": { ""d"": { ""type"": ""date"" } } }
    }
  }
}";

    [Fact(DisplayName = "AC-3601.4 erp 구역을 읽어 ErpExtensionId·ErpNames로 두고, 부른 쪽 구역의 명령만 받는다")]
    public void ParsesErpSection()
    {
        var table = CommandTable.Parse(Encoding.UTF8.GetBytes(ErpTable));

        Assert.Equal("ponmlkjihgfedcbaponmlkjihgfedcba", table.ErpExtensionId);
        Assert.Equal("BBBB", table.ErpExtensionKey);
        Assert.Equal(new[] { "t.web" }, table.Names.ToArray());
        Assert.Equal(new[] { "t.erp" }, table.ErpNames.ToArray());
        Assert.True(table.Has("t.web"));
        Assert.True(table.Has("t.erp"));

        Assert.Null(CheckAs(table, Caller.Web, "t.web", "{}"));
        Assert.Equal(UnknownCode, CheckAs(table, Caller.Erp, "t.web", "{}"));
        Assert.Null(CheckAs(table, Caller.Erp, "t.erp", "{\"d\":\"2026-11-09\"}"));
        Assert.Equal(BadCode, CheckAs(table, Caller.Erp, "t.erp", "{\"d\":\"2026-11-31\"}"));
        Assert.Equal(UnknownCode, CheckAs(table, Caller.Web, "t.erp", "{\"d\":\"2026-11-09\"}"));
        Assert.Equal(UnknownCode, Check(table, "t.erp", "{\"d\":\"2026-11-09\"}"));
    }

    [Fact(DisplayName = "AC-3601.4 erp 구역이 없는 표도 읽는다(ErpExtensionId 없음, ErpNames 비어 있음, Caller.Erp는 모든 명령이 E-HELPER-UNKNOWN-COMMAND)")]
    public void TableWithoutErpSection()
    {
        var table = CommandTable.Parse(Encoding.UTF8.GetBytes(KindsTable));

        Assert.Null(table.ErpExtensionId);
        Assert.Null(table.ErpExtensionKey);
        Assert.Empty(table.ErpNames);
        Assert.Equal(UnknownCode, CheckAs(table, Caller.Erp, "t.bool", "{\"b\":true}"));
        Assert.Null(CheckAs(table, Caller.Web, "t.bool", "{\"b\":true}"));
    }

    [Theory(DisplayName = "AC-3601.4 erp 구역이 틀리면(모르는 열쇠·빠진 열쇠·commands와 겹친 이름·틀린 ID·기존 확장과 같은 ID·틀린 key·빈 commands) 표가 틀림")]
    [InlineData("\"extensionKey\": \"BBBB\",", "\"extensionKey\": \"BBBB\", \"origin\": \"https://erp.minesolution.com\",")]
    [InlineData("\"extensionKey\": \"BBBB\",", "\"extensionKey\": \"BBBB\", \"protocol\": 1,")]
    [InlineData("\"extensionKey\": \"BBBB\",", "")]
    [InlineData("\"extensionKey\": \"BBBB\",", "\"extensionKey\": \"not base64!\",")]
    [InlineData("\"extensionKey\": \"BBBB\",", "\"extensionKey\": \"\",")]
    [InlineData("\"t.erp\"", "\"t.web\"")]
    [InlineData("\"t.erp\": { \"patient\": false, \"args\": { \"d\": { \"type\": \"date\" } } }",
        "\"t.erp\": { \"patient\": false, \"args\": {} }, \"t.erp\": { \"patient\": false, \"args\": {} }")]
    [InlineData("\"t.erp\": { \"patient\": false, \"args\": { \"d\": { \"type\": \"date\" } } }", "")]
    [InlineData("\"type\": \"date\"", "\"type\": \"day\"")]
    [InlineData("ponmlkjihgfedcbaponmlkjihgfedcba", "ponmlkjihgfedcbaponmlkjihgfedcbq")]
    [InlineData("ponmlkjihgfedcbaponmlkjihgfedcba", "PONMLKJIHGFEDCBAPONMLKJIHGFEDCBA")]
    [InlineData("ponmlkjihgfedcbaponmlkjihgfedcba", "ponmlkjihgfedcba")]
    [InlineData("ponmlkjihgfedcbaponmlkjihgfedcba", "abcdefghijklmnopabcdefghijklmnop")]
    [InlineData("\"erp\": {", "\"erp2\": {")]
    [InlineData("\"erp\": {", "\"commands2\": {}, \"erp\": {")]
    public void RejectsBrokenErpSection(string find, string replace)
    {
        var broken = ErpTable.Replace(find, replace);
        Assert.NotEqual(ErpTable, broken);
        CommandTable.Parse(Encoding.UTF8.GetBytes(ErpTable));

        Assert.Throws<InvalidDataException>(() => CommandTable.Parse(Encoding.UTF8.GetBytes(broken)));
    }

    [Theory(DisplayName = "AC-3601.4 erp가 객체가 아니면 표가 틀림")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("\"ponmlkjihgfedcbaponmlkjihgfedcba\"")]
    public void RejectsNonObjectErp(string value)
    {
        var broken = KindsTable.TrimEnd().TrimEnd('}') + ", \"erp\": " + value + " }";

        Assert.Throws<InvalidDataException>(() => CommandTable.Parse(Encoding.UTF8.GetBytes(broken)));
    }
}
