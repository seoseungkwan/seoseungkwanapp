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

    /// <summary>JSON 글자 배열(탭 같은 글자도 이스케이프로 실린다).</summary>
    private static string Arr(params string[] items) => "[" + string.Join(",", items.Select(item => JsonSerializer.Serialize(item))) + "]";

    /// <summary>코드·매출 규칙 칸(TASK-15). null이면 그 칸을 넣지 않는다.</summary>
    private static string RuleGroup(string key, string[] codes, string[]? prefixes, string[]? amountCodes = null) =>
        "{\"key\":\"" + key + "\",\"codes\":" + Arr(codes)
        + (prefixes == null ? "" : ",\"amountPrefixes\":" + Arr(prefixes))
        + (amountCodes == null ? "" : ",\"amountCodes\":" + Arr(amountCodes)) + "}";

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

    // spec erp-uisarang AC-4210.1(design.md 3-1·12-4): 의사랑 명령 둘(closing.source·closing.uisCodes)이 끝에 더해져 다섯이다
    [Fact(DisplayName = "AC-3601.4 AC-3708.1 AC-4210.1 명령은 closing.codes·closing.day·closing.findCodes·closing.source·closing.uisCodes 다섯뿐이고 모두 patient:false(보내기·확인 창 없음), 기존 명령(hello·claim.month·revenue.days)은 없다")]
    public void OnlyClosingCommands()
    {
        Assert.Equal(new[] { ClosingCommands.CodesName, ClosingCommands.DayName, ClosingCommands.FindCodesName, UisSourceName, UisCodesName }, Table.Names);
        Assert.Equal("closing.findCodes", ClosingCommands.FindCodesName);
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
        Assert.False(WebTable.Has(ClosingCommands.FindCodesName));
        Assert.False(WebTable.Has(UisSourceName));
        Assert.False(WebTable.Has(UisCodesName));
    }

    // ---- AC-4210.1 의사랑 명령 둘·closing.day sales(spec erp-uisarang design.md 3-1) -----------------------------
    // 처리기 상수(UisCommands.SourceName·CodesName)는 TASK-13이 만든다. 여기서는 표 글자로 본다

    private const string UisSourceName = "closing.source";
    private const string UisCodesName = "closing.uisCodes";

    /// <summary>'매출로 셀 코드' 묶음 key 10개(design.md 3-1 차례).</summary>
    private static readonly string[] SalesKeys = { "carm", "sono", "arthro", "manual", "eswt", "pt", "etc1", "etc2", "etc3", "etc4" };

    /// <summary>sales 칸에 JSON 값을 그대로 넣은 closing.day args(groups는 비트와 같은 꼴).</summary>
    private static string DayWithSales(string sales, params string[] groups) =>
        "{\"date\":\"2026-11-23\",\"groups\":[" + string.Join(",", groups) + "],\"sales\":" + sales + "}";

    private static string Sale(string key, params string[] codes) => "{\"key\":\"" + key + "\",\"codes\":" + Arr(codes) + "}";

    private static string Sales(params string[] items) => "[" + string.Join(",", items) + "]";

    [Fact(DisplayName = "AC-4210.1 명령 다섯은 closing.codes·closing.day·closing.findCodes·closing.source·closing.uisCodes 차례이고 새 둘도 patient:false·보내기 없음·확인 창 없음")]
    public void FiveCommands()
    {
        Assert.Equal(new[] { "closing.codes", "closing.day", "closing.findCodes", "closing.source", "closing.uisCodes" }, Table.Names);
        foreach (var name in new[] { UisSourceName, UisCodesName })
        {
            Assert.True(Table.Has(name), name);
            Assert.False(Table.IsPatient(name), name);
            Assert.False(Table.IsSend(name), name);
            Assert.False(Table.NeedsConfirm(name), name);
        }
    }

    public static TheoryData<string, string> BadEmptyArgs => new TheoryData<string, string>
    {
        { UisSourceName, "{\"date\":\"2026-11-23\"}" },
        { UisSourceName, "{\"source\":\"uisarang\"}" },
        { UisCodesName, "{\"date\":\"2026-11-23\"}" },
        { UisCodesName, "{\"folder\":\"desktop\"}" },
        { UisCodesName, "{\"codes\":[]}" },
    };

    [Fact(DisplayName = "AC-4210.1 closing.source·closing.uisCodes args는 빈 칸 {}을 받는다")]
    public void EmptyArgsAccepted()
    {
        Accepts(UisSourceName, "{}");
        Accepts(UisCodesName, "{}");
    }

    [Theory(DisplayName = "AC-4210.1 closing.source·closing.uisCodes에 칸이 하나라도 있으면 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadEmptyArgs))]
    public void EmptyArgsRefuseFields(string cmd, string args) => Refuses(cmd, args);

    [Fact(DisplayName = "AC-4210.1 closing.day 선택 칸 sales: 없음·빈 배열·매출 묶음 10개·코드 1~20개·가운데 빈칸 하나·20자 코드를 groups와 함께 받고, 나머지 칸은 그대로다")]
    public void SalesAccepted()
    {
        Accepts("closing.day", Day("2026-11-23", Group("ptVisit", "AA222")));
        Accepts("closing.day", DayWithSales("[]"));
        Accepts("closing.day", DayWithSales(Sales(Sale("manual", "MM300")), Group("manual", "MM300"), Group("ptVisit", "AA222")));
        Accepts("closing.day", DayWithSales(Sales(SalesKeys.Select(key => Sale(key, "X1")).ToArray())));
        Accepts("closing.day", DayWithSales(Sales(Sale("eswt", Enumerable.Range(0, 20).Select(i => "ES" + i).ToArray()))));
        Accepts("closing.day", DayWithSales(Sales(Sale("etc1", "PROLO C", new string('Z', 20), "도수", "mm300"))));
        // 비트 묶음 칸(매출 규칙·exclude)과 함께여도 된다(비트 처리기는 sales를 읽지 않는다)
        Accepts("closing.day", DayWithSales(Sales(Sale("carm", "CA100")),
            RuleGroup("carm", new[] { "CA100" }, new[] { "LA" }, new[] { "KK090" }),
            ExcludeGroup("sono", new[] { "SO100" }, ExRule("KK090", new[] { "CA100" }, true))));
    }

    public static TheoryData<string> BadSalesArgs => new TheoryData<string>
    {
        DayWithSales(Sales(Sale("manualConsult", "X1"))),                                                   // 건수 묶음 key(매출 묶음 밖)
        DayWithSales(Sales(Sale("ptVisit", "AA222"))),
        DayWithSales(Sales(Sale("injection", "X1"))),
        DayWithSales(Sales(Sale("eswtStd", "X1"))),
        DayWithSales(Sales(Sale("massage", "X1"))),
        DayWithSales(Sales(Sale("Manual", "X1"))),
        DayWithSales(Sales(Sale("manual"))),                                                                // 코드 0개
        DayWithSales(Sales(Sale("manual", Enumerable.Range(0, 21).Select(i => "M" + i).ToArray()))),       // 코드 21개
        DayWithSales(Sales(Sale("manual", "PROLO  C"))),
        DayWithSales(Sales(Sale("manual", " MM300"))),
        DayWithSales(Sales(Sale("manual", "MM300 "))),
        DayWithSales(Sales(Sale("manual", "MM\t300"))),
        DayWithSales(Sales(Sale("manual", new string('M', 21)))),
        DayWithSales(Sales(Sale("manual", ""))),
        DayWithSales(Sales(SalesKeys.Select(key => Sale(key, "X1")).Concat(new[] { Sale("carm", "X2") }).ToArray())),   // 11개
        DayWithSales("[{\"key\":\"manual\",\"codes\":[\"MM300\"],\"total\":1}]"),                            // 모르는 칸
        DayWithSales("[{\"codes\":[\"MM300\"]}]"),                                                           // key 없음
        DayWithSales("[{\"key\":\"manual\"}]"),                                                              // codes 없음
        DayWithSales("[{\"key\":\"manual\",\"codes\":\"MM300\"}]"),
        DayWithSales("[{\"key\":\"manual\",\"codes\":[1]}]"),
        DayWithSales("[{\"key\":1,\"codes\":[\"MM300\"]}]"),
        DayWithSales("[\"MM300\"]"),
        DayWithSales("[null]"),
        DayWithSales("{\"manual\":[\"MM300\"]}"),
        DayWithSales("\"manual\""),
        DayWithSales("null"),
    };

    [Theory(DisplayName = "AC-4210.1 sales key가 매출 묶음 10개 밖·코드 0개·21개·코드 꼴 아님(빈칸 두 칸·앞뒤 빈칸·탭·21자·빈 글자)·11개·모르는 칸·빠진 칸·배열 아님·null은 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadSalesArgs))]
    public void BadSalesRefused(string args) => Refuses("closing.day", args);

    // ---- AC-3708.1 closing.findCodes { text }(erp-closing-range design.md 10절) ------------------------------

    private static string Find(string text) => "{\"text\":" + JsonSerializer.Serialize(text) + "}";

    [Fact(DisplayName = "AC-3708.1 closing.findCodes { text }: 앞뒤 공백 없는 2~20자 글자를 받는다(가운데 빈칸·한글·%·_·[ 포함)")]
    public void FindCodesAccepts()
    {
        foreach (var text in new[] { "CA", "ca", "도수", "도수 치료", "LA_1", "50%", "A[1]", "x  y", new string('C', 20), "C-arm 유도 (편측)" })
        {
            Accepts("closing.findCodes", Find(text));
        }
    }

    public static TheoryData<string> BadFindArgs => new TheoryData<string>
    {
        Find(""),
        Find("C"),
        Find("가"),
        Find(new string('C', 21)),
        Find("  "),
        Find(" CA"),
        Find("CA "),
        Find("\tCA"),
        Find("CA\n"),
        "{}",
        "{\"text\":12}",
        "{\"text\":null}",
        "{\"text\":[\"CA\"]}",
        "{\"text\":\"CA\",\"day\":\"2026-11-09\"}",
    };

    [Theory(DisplayName = "AC-3708.1 closing.findCodes text가 빈 글자·1자·21자·빈칸뿐·앞뒤 공백·글자 아님·없음이거나 모르는 칸이 있으면 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadFindArgs))]
    public void FindCodesRefuses(string args) => Refuses("closing.findCodes", args);

    // ---- AC-3709.2 closing.day 묶음 exclude 규칙(erp-closing-range design.md 11절) ---------------------------

    /// <summary>규칙 하나 JSON { code, with, all? }. all이 null이면 그 칸을 넣지 않는다.</summary>
    private static string ExRule(string code, string[] with, bool? all = null) =>
        "{\"code\":" + JsonSerializer.Serialize(code) + ",\"with\":" + Arr(with) + (all == null ? "" : ",\"all\":" + (all.Value ? "true" : "false")) + "}";

    /// <summary>규칙 JSON들을 exclude에 담은 묶음.</summary>
    private static string ExcludeGroup(string key, string[] codes, params string[] rules) =>
        "{\"key\":\"" + key + "\",\"codes\":" + Arr(codes) + ",\"exclude\":[" + string.Join(",", rules) + "]}";

    /// <summary>exclude 칸에 JSON 값을 그대로 넣은 씨암 묶음.</summary>
    private static string RawExclude(string exclude) => "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"exclude\":" + exclude + "}";

    private static readonly string[] Carm = { "CARM1" };

    [Fact(DisplayName = "AC-3709.2 묶음 exclude는 선택 칸이고 규칙 0~20개 { code: 코드 꼴, with: 코드 꼴 1~5개, all?: 참/거짓 }을 받는다(매출 규칙 칸과 함께여도, 건수만 세는 묶음도)")]
    public void ExcludeAccepted()
    {
        Accepts("closing.day", Day("2026-11-09", ExcludeGroup("carm", Carm)));
        Accepts("closing.day", Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { "LA248" }))));
        Accepts("closing.day", Day("2026-11-09", ExcludeGroup("carm", Carm,
            ExRule("LA357", new[] { "LA248", "KK090", "PROLO C", "A1", new string('X', 20) }, true),
            ExRule("PROLO C", new[] { "LA248" }, false),
            ExRule(new string('L', 20), new[] { "LA248" }))));
        Accepts("closing.day", Day("2026-11-09", ExcludeGroup("pt", new[] { "MM010" }, Enumerable.Range(0, 20).Select(i => ExRule("X" + i, new[] { "MM010" })).ToArray())));
        Accepts("closing.day", Day("2026-11-09", ExcludeGroup("manualConsult", new[] { "MC1" }, ExRule("MC1", new[] { "MM010" }))));
        Accepts("closing.day", Day("2026-11-09",
            "{\"key\":\"sono\",\"codes\":[\"SONO1\"],\"amountPrefixes\":[],\"amountCodes\":[\"KK090\"],\"exclude\":[" + ExRule("KK090", new[] { "CARM1" }, true) + "]}",
            Group("carm", "CARM1")));
    }

    public static TheoryData<string> BadExcludeArgs => new TheoryData<string>
    {
        Day("2026-11-09", ExcludeGroup("carm", Carm, Enumerable.Range(0, 21).Select(i => ExRule("X" + i, new[] { "MM010" })).ToArray())),   // 규칙 21개
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new string[0]))),                                                      // with 0개
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { "A1", "A2", "A3", "A4", "A5", "A6" }))),                       // with 6개
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("", new[] { "LA248" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA  357", new[] { "LA248" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA\t357", new[] { "LA248" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule(" LA357", new[] { "LA248" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule(new string('L', 21), new[] { "LA248" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { "" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { "KK  090" }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { "LA248", "KK090 " }))),
        Day("2026-11-09", ExcludeGroup("carm", Carm, ExRule("LA357", new[] { new string('K', 21) }))),
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":[\"LA248\"],\"all\":\"true\"}]")),                                     // all 글자
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":[\"LA248\"],\"all\":1}]")),                                            // all 숫자
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":[\"LA248\"],\"all\":null}]")),                                         // all null
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":[\"LA248\"],\"why\":\"x\"}]")),                                        // 모르는 칸
        Day("2026-11-09", RawExclude("[{\"with\":[\"LA248\"]}]")),                                                                         // code 없음
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\"}]")),                                                                           // with 없음
        Day("2026-11-09", RawExclude("[{\"code\":1,\"with\":[\"LA248\"]}]")),
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":\"LA248\"}]")),
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":[1]}]")),
        Day("2026-11-09", RawExclude("[{\"code\":\"LA357\",\"with\":null}]")),
        Day("2026-11-09", RawExclude("[\"KK090\"]")),                                                                                      // TASK-10의 코드 배열 꼴
        Day("2026-11-09", RawExclude("[null]")),
        Day("2026-11-09", RawExclude("\"KK090\"")),
        Day("2026-11-09", RawExclude("null")),
    };

    [Theory(DisplayName = "AC-3709.2 규칙 21개·with 0개·6개·code/with 코드 꼴 아님·all이 참/거짓 아님·모르는 칸·빠진 칸·코드 배열 꼴(TASK-10)·배열 아님·null은 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadExcludeArgs))]
    public void BadExcludeRefused(string args) => Refuses("closing.day", args);

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
        { "closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CA  RM1" }, null)) },
        { "closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CA\tRM1" }, null)) },
        { "closing.day", Day("2026-11-09", RuleGroup("carm", new[] { " CARM1" }, null)) },
        { "closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1 " }, null)) },
        { "closing.day", Day("2026-11-09", Group("carm", "")) },
        { "closing.day", Day("2026-11-09", ClosingDay.GroupKeys.Select(key => Group(key, "X1")).Concat(new[] { Group("carm", "X2") }).ToArray()) },
        { "closing.day", "{\"date\":\"2026-11-09\",\"groups\":[],\"chart\":\"900001\"}" },
        { "closing.day", Day("2026-11-09", "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"name\":\"x\"}") },
    };

    [Theory(DisplayName = "AC-3601.4 표 밖 args(모르는 칸·key·코드 수·코드 꼴·묶음 수·날짜 꼴)는 기존 Validate가 E-HELPER-BAD-MESSAGE로 막는다")]
    [MemberData(nameof(BadArgs))]
    public void ArgsShapeRefuses(string cmd, string args) => Refuses(cmd, args);

    [Fact(DisplayName = "AC-3603.5 codes·amountCodes는 가운데 빈칸 하나인 코드('PROLO C'·'HYALU MINI', 20자까지)를 받는다(pattern ^\\S(?: ?\\S)*$)")]
    public void InnerSpaceCodesAccepted()
    {
        Accepts("closing.day", Day("2026-11-09", RuleGroup("manual", new[] { "PROLO C", "HYALU MINI", "A B C D E F G H I J" }, null)));
        Accepts("closing.day", Day("2026-11-09", RuleGroup("sono", new[] { "SONO1" }, new[] { "LA" }, new[] { "PROLO C", "HYALU MINI" })));
    }

    public static TheoryData<string> BadCodeShapes => new TheoryData<string>
    {
        "PROLO  C", "PROLO\tC", " PROLO C", "PROLO C ", "PROLO\u3000C", "", new string('P', 21), "PROLO\nC",
    };

    [Theory(DisplayName = "AC-3603.5 빈칸 두 칸·탭·앞뒤 공백·다른 빈칸 글자·빈 글자·21자·줄바꿈 코드는 codes·amountCodes 모두 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadCodeShapes))]
    public void BadCodeShapesRefused(string code)
    {
        Refuses("closing.day", Day("2026-11-09", RuleGroup("manual", new[] { code }, null)));
        Refuses("closing.day", Day("2026-11-09", RuleGroup("sono", new[] { "SONO1" }, new[] { "LA" }, new[] { code })));
    }

    [Fact(DisplayName = "AC-3604.6 매출 규칙 두 칸(design.md 2절): 둘 다 없어도 되고, 앞글자 0~5개(1~10자, 빈칸 없음)·더 셀 코드 0~20개를 받는다")]
    public void RuleFieldsAccepted()
    {
        Accepts("closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "LA" })));
        Accepts("closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, null, new[] { "KK090" })));
        Accepts("closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new string[0], new string[0])));
        Accepts("closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "LA", "KK", "A", "B", new string('Z', 10) },
            Enumerable.Range(0, 20).Select(i => "C" + i).ToArray())));
        Accepts("closing.day", Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "la" }), RuleGroup("sono", new[] { "SONO1" }, new[] { "LA" }, new[] { "kk090" })));
    }

    public static TheoryData<string> BadRuleArgs => new TheoryData<string>
    {
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "LA", "KK", "A", "B", "C", "D" })),
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "LA" }, Enumerable.Range(0, 21).Select(i => "C" + i).ToArray())),
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "" })),
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { "L A" })),
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { " LA" })),
        Day("2026-11-09", RuleGroup("carm", new[] { "CARM1" }, new[] { new string('L', 11) })),
        Day("2026-11-09", "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"amountPrefixes\":\"LA\"}"),
        Day("2026-11-09", "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"amountCodes\":[1]}"),
        Day("2026-11-09", "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"amountPrefixes\":null}"),
    };

    [Theory(DisplayName = "AC-3604.6 앞글자 6개·더 셀 코드 21개·빈 앞글자·앞글자 빈칸·11자·배열 아님·글자 아님·null은 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadRuleArgs))]
    public void BadRuleArgsRefused(string args) => Refuses("closing.day", args);

    [Fact(DisplayName = "AC-3601.4 표에 없는 명령은 기존 Validate가 E-HELPER-UNKNOWN-COMMAND로 막는다")]
    public void UnknownCommand()
    {
        Refuses("hello", "{}", ErrorCodes.UnknownCommand);
        Refuses("claim.month", "{\"month\":\"2026-10\"}", ErrorCodes.UnknownCommand);
        Refuses("revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}", ErrorCodes.UnknownCommand);
    }
}
