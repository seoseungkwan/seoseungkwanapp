using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Tests.Reception.PickChoices;
using Xunit;

// 이 기능(reception-other-clinic TASK-1)의 시험만 한 거르기로 돌리려고 Settings 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Settings;

/// <summary>시험 공용: 설정 문서를 JSON 글·JSON 노드로, 노드를 다시 읽기.</summary>
internal static class Docs
{
    private static readonly JsonWriterOptions Relaxed = new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>짝 없는 대리쌍을 JSON 노드로는 만들 수 없어 글 자리표를 두고 글에서 바꾼다.</summary>
    public const string LoneMark = "__LONE__";

    public static string Json(ReceptionSettings settings)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Relaxed)) settings.Write(writer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    public static byte[] Bytes(string json) => Encoding.UTF8.GetBytes(json);

    public static JsonObject Node(ReceptionSettings settings) => JsonNode.Parse(Json(settings))!.AsObject();

    /// <summary>바른 문서 하나(우리 의원 처음 값, 기본 목록).</summary>
    public static JsonObject Valid() => Node(ReceptionSettings.Ours(PickLists.Defaults));

    public static string Raw(JsonNode node) => node.ToJsonString().Replace(LoneMark, "가\\ud800");

    public static bool Parses(JsonNode node) => ReceptionSettings.TryParse(Bytes(Raw(node)), out _);

    public static ReceptionSettings Parse(JsonNode node) =>
        ReceptionSettings.TryParse(Bytes(Raw(node)), out var settings) ? settings : throw new InvalidOperationException("시험 문서가 틀렸다: " + Raw(node));

    public static JsonArray Cols(JsonObject doc) => doc["cols"]!.AsArray();

    public static JsonObject Col(JsonObject doc, string k) => Cols(doc).First(c => (string)c!["k"]! == k)!.AsObject();

    public static JsonObject Extra(JsonObject doc) => doc["picks"]!["extra"]!.AsObject();

    /// <summary>더한 칸(직접 칸, 이름 "더한{번호}")을 맨 끝에 넣고 extra에 빈 목록, nextX는 가장 큰 번호 + 1.</summary>
    public static JsonObject WithAdded(JsonObject doc, params int[] numbers)
    {
        foreach (var n in numbers)
        {
            Cols(doc).Add(AddedCol("x" + n, "더한" + n));
            Extra(doc).Add("x" + n, new JsonArray());
        }
        if (numbers.Length > 0) doc["nextX"] = numbers.Max() + 1;
        return doc;
    }

    public static JsonObject AddedCol(string k, string name) => new JsonObject
    {
        ["k"] = k,
        ["name"] = name,
        ["kind"] = "mn",
        ["steps"] = 2,
        ["show"] = true,
        ["added"] = true,
        ["codes"] = new JsonArray(),
    };

    public static JsonArray Strings(IEnumerable<string> values) => new JsonArray(values.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray());

    public static string[] Names(JsonNode? array) => array!.AsArray().Select(v => (string)v!).ToArray();
}

/// <summary>
/// 설정 문서 모양(ReceptionSettings, spec reception-other-clinic design.md 1절, AC-5701.1~4)과 처음 값 둘(Ours·Fresh, AC-5701.5·6),
/// 바꿀 수 없는 것(ChangeProblem, AC-5701.7 저장 규칙 · AC-5704.2가 400으로 답하는 것).
/// </summary>
public class ReceptionSettingsTests
{
    private static readonly string[] Originals = { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" };

    // ---- AC-5701.1 맨 위 모양 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.1 Write는 { rev, logo: { mode, text, ver }, tab, setup: { logo, tab, done }, nextX, cols, picks }를 이 차례로 쓰고, 다시 읽으면 같은 글이다")]
    public void WriteShapeAndRoundTrip()
    {
        foreach (var settings in new[] { ReceptionSettings.Ours(PickLists.Defaults), ReceptionSettings.Fresh() })
        {
            var doc = Docs.Node(settings);
            Assert.Equal(new[] { "rev", "logo", "tab", "setup", "nextX", "cols", "picks" }, doc.Select(p => p.Key).ToArray());
            Assert.Equal(new[] { "mode", "text", "ver" }, doc["logo"]!.AsObject().Select(p => p.Key).ToArray());
            Assert.Equal(new[] { "logo", "tab", "done" }, doc["setup"]!.AsObject().Select(p => p.Key).ToArray());
            Assert.True(ReceptionSettings.TryParse(Docs.Bytes(Docs.Json(settings)), out var read));
            Assert.Equal(Docs.Json(settings), Docs.Json(read));
        }
    }

    [Fact(DisplayName = "AC-5701.1 칸마다 { k, name, kind, steps, show, added, (xray만 rule), codes }를 쓴다")]
    public void WriteColShape()
    {
        var doc = Docs.Node(ReceptionSettings.Ours(PickLists.Defaults));
        foreach (var col in Docs.Cols(doc))
        {
            var keys = col!.AsObject().Select(p => p.Key).ToArray();
            if ((string)col["k"]! == "xray") Assert.Equal(new[] { "k", "name", "kind", "steps", "show", "added", "rule", "codes" }, keys);
            else Assert.Equal(new[] { "k", "name", "kind", "steps", "show", "added", "codes" }, keys);
        }
    }

    [Fact(DisplayName = "AC-5701.1 바른 값은 받는다: rev·ver·nextX 큰 정수, mode text + 앞뒤 빈칸을 뺀 1~20글자 text, mode pic·none에 text가 남아 있어도 된다")]
    public void AcceptsTopValues()
    {
        var doc = Docs.Valid();
        doc["rev"] = 9007199254740991L;
        doc["logo"]!["ver"] = 2000000;
        doc["nextX"] = 50;
        doc["logo"]!["mode"] = "text";
        doc["logo"]!["text"] = "  가나다정형외과  ";
        var read = Docs.Parse(doc);
        Assert.Equal(9007199254740991L, read.Rev);
        Assert.Equal(2000000, read.Logo.Ver);
        Assert.Equal(50, read.NextX);
        Assert.Equal("text", read.Logo.Mode);
        Assert.Equal("가나다정형외과", read.Logo.Text);

        doc["logo"]!["text"] = "가나다라마바사아자차카타파하가나다라마바";
        Assert.Equal(20, Docs.Parse(doc).Logo.Text!.Length);
        doc["logo"]!["mode"] = "none";
        Assert.Equal("none", Docs.Parse(doc).Logo.Mode);
        doc["logo"]!["mode"] = "pic";
        doc["logo"]!["text"] = "😀병원";
        Assert.Equal("😀병원", Docs.Parse(doc).Logo.Text);
        doc["rev"] = 0;
        doc["logo"]!["ver"] = 0;
        doc["nextX"] = 0;
        Assert.True(Docs.Parses(doc));
    }

    private static readonly Dictionary<string, Action<JsonObject>> BadTops = new Dictionary<string, Action<JsonObject>>(StringComparer.Ordinal)
    {
        ["rev 없음"] = d => d.Remove("rev"),
        ["logo 없음"] = d => d.Remove("logo"),
        ["tab 없음"] = d => d.Remove("tab"),
        ["setup 없음"] = d => d.Remove("setup"),
        ["nextX 없음"] = d => d.Remove("nextX"),
        ["cols 없음"] = d => d.Remove("cols"),
        ["picks 없음"] = d => d.Remove("picks"),
        ["모르는 맨 위 칸"] = d => d.Add("lists", new JsonObject()),
        ["rev 음수"] = d => d["rev"] = -1,
        ["rev 소수"] = d => d["rev"] = 1.5,
        ["rev 글"] = d => d["rev"] = "1",
        ["rev null"] = d => d["rev"] = null,
        ["nextX 음수"] = d => d["nextX"] = -1,
        ["nextX 소수"] = d => d["nextX"] = 1.5,
        ["nextX 글"] = d => d["nextX"] = "1",
        ["logo가 글"] = d => d["logo"] = "pic",
        ["logo mode 없음"] = d => d["logo"]!.AsObject().Remove("mode"),
        ["logo text 없음"] = d => d["logo"]!.AsObject().Remove("text"),
        ["logo ver 없음"] = d => d["logo"]!.AsObject().Remove("ver"),
        ["logo 모르는 칸"] = d => d["logo"]!.AsObject().Add("url", "x"),
        ["ver 음수"] = d => d["logo"]!["ver"] = -1,
        ["ver 소수"] = d => d["logo"]!["ver"] = 0.5,
        ["ver 글"] = d => d["logo"]!["ver"] = "1",
        ["mode 모르는 값"] = d => d["logo"]!["mode"] = "image",
        ["mode 대문자"] = d => d["logo"]!["mode"] = "PIC",
        ["mode 빈 글"] = d => d["logo"]!["mode"] = "",
        ["mode null"] = d => d["logo"]!["mode"] = null,
        ["mode text인데 text null"] = d => { d["logo"]!["mode"] = "text"; d["logo"]!["text"] = null; },
        ["text 빈 글"] = d => d["logo"]!["text"] = "",
        ["text 빈칸뿐"] = d => d["logo"]!["text"] = "   ",
        ["text 21글자"] = d => d["logo"]!["text"] = "가나다라마바사아자차카타파하가나다라마바사",
        ["text 줄바꿈"] = d => d["logo"]!["text"] = "가나\n다",
        ["text 탭"] = d => d["logo"]!["text"] = "가나\t다",
        ["text DEL"] = d => d["logo"]!["text"] = "가나\u007f",
        ["text C1 제어 글자"] = d => d["logo"]!["text"] = "가\u0085나",
        ["text 줄 구분 글자"] = d => d["logo"]!["text"] = "가\u2028나",
        ["text 짝 없는 대리쌍"] = d => d["logo"]!["text"] = Docs.LoneMark,
        ["text 숫자"] = d => d["logo"]!["text"] = 1,
        ["tab 글"] = d => d["tab"] = "true",
        ["tab null"] = d => d["tab"] = null,
        ["setup이 배열"] = d => d["setup"] = new JsonArray(),
        ["setup logo 없음"] = d => d["setup"]!.AsObject().Remove("logo"),
        ["setup tab 없음"] = d => d["setup"]!.AsObject().Remove("tab"),
        ["setup done 없음"] = d => d["setup"]!.AsObject().Remove("done"),
        ["setup 모르는 칸"] = d => d["setup"]!.AsObject().Add("codes", true),
        ["setup done 숫자"] = d => d["setup"]!["done"] = 1,
        ["cols가 객체"] = d => d["cols"] = new JsonObject(),
        ["picks가 배열"] = d => d["picks"] = new JsonArray(),
    };

    public static IEnumerable<object[]> BadTopNames() => BadTops.Keys.Select(k => new object[] { k });

    [Theory(DisplayName = "AC-5701.1 맨 위·logo·setup 모양이 틀리면(빠짐·더 있음·값 모양) 받지 않는다")]
    [MemberData(nameof(BadTopNames))]
    public void RejectsBadTops(string why)
    {
        var doc = Docs.Valid();
        BadTops[why](doc);
        Assert.False(Docs.Parses(doc), why);
    }

    [Fact(DisplayName = "AC-5701.1 같은 맨 위 칸 두 번·JSON 아님·배열·null·틀린 UTF-8·빈 몸은 받지 않는다(던지지 않음)")]
    public void RejectsBadBytes()
    {
        var json = Docs.Json(ReceptionSettings.Fresh());
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes(json.Substring(0, json.Length - 1) + ",\"tab\":false}"), out _));
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes("not json"), out _));
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes("[]"), out _));
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes("null"), out _));
        Assert.False(ReceptionSettings.TryParse(new byte[] { 0x7B, 0xC3, 0x28, 0x7D }, out _));
        Assert.False(ReceptionSettings.TryParse(new byte[0], out _));
        Assert.False(ReceptionSettings.TryParse(null!, out _));
    }

    // ---- AC-5701.2 칸 목록 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.2 처음 일곱 칸은 차례가 자유이고, 더한 칸 x1~x99는 nextX보다 작으면 받으며, 칸은 12개까지다")]
    public void AcceptsColOrderAndAdded()
    {
        var doc = Docs.Valid();
        var cols = Docs.Cols(doc);
        var reversed = cols.Select(c => c!.DeepClone()).Reverse().ToArray();
        cols.Clear();
        foreach (var col in reversed) cols.Add(col);
        Docs.WithAdded(doc, 1, 9, 10, 99, 42);
        Assert.Equal(12, Docs.Cols(doc).Count);
        var read = Docs.Parse(doc);
        Assert.Equal(new[] { "trac", "eswt", "ds", "pt", "carm", "sono", "xray", "x1", "x9", "x10", "x99", "x42" }, read.Cols.Select(c => c.K).ToArray());
        Assert.Equal(100, read.NextX);
        Assert.All(read.Cols.Take(7), c => Assert.False(c.Added));
        Assert.All(read.Cols.Skip(7), c => Assert.True(c.Added));
    }

    [Fact(DisplayName = "AC-5701.2 보이는 칸이 하나뿐이어도 되고, 이름은 앞뒤 빈칸을 뺀 글로 남으며 종류·단계는 처음 일곱 칸도 바꿀 수 있다")]
    public void AcceptsColValues()
    {
        var doc = Docs.Valid();
        foreach (var col in Docs.Cols(doc)) col!["show"] = false;
        Docs.Col(doc, "eswt")["show"] = true;
        Docs.Col(doc, "pt")["name"] = "  물리치료  ";
        Docs.Col(doc, "pt")["kind"] = "rx";
        Docs.Col(doc, "pt")["steps"] = 3;
        Docs.Col(doc, "sono")["kind"] = "mn";
        Docs.Col(doc, "sono")["steps"] = 2;
        Docs.Col(doc, "xray")["rule"] = false;
        Docs.Col(doc, "ds")["name"] = "가나다라마바사아자차";
        var read = Docs.Parse(doc);
        Assert.Equal(new[] { "eswt" }, read.Cols.Where(c => c.Show).Select(c => c.K).ToArray());
        var pt = read.Cols.Single(c => c.K == "pt");
        Assert.Equal(("물리치료", "rx", 3), (pt.Name, pt.Kind, pt.Steps));
        var sono = read.Cols.Single(c => c.K == "sono");
        Assert.Equal(("mn", 2), (sono.Kind, sono.Steps));
        Assert.False(read.Cols.Single(c => c.K == "xray").Rule);
        Assert.All(read.Cols.Where(c => c.K != "xray"), c => Assert.Null(c.Rule));
    }

    private static readonly Dictionary<string, Action<JsonObject>> BadCols = new Dictionary<string, Action<JsonObject>>(StringComparer.Ordinal)
    {
        ["처음 칸 하나 빠짐(trac)"] = d => Docs.Cols(d).Remove(Docs.Col(d, "trac")),
        ["처음 칸 두 번(pt)"] = d => Docs.Cols(d).Add(Docs.Col(d, "pt").DeepClone()),
        ["모르는 칸 열쇠"] = d => Docs.Col(d, "pt")["k"] = "ims",
        ["열쇠 대문자"] = d => Docs.Col(d, "pt")["k"] = "PT",
        ["열쇠 숫자"] = d => Docs.Col(d, "pt")["k"] = 1,
        ["더한 칸 x0"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["k"] = "x0"; Docs.Extra(d).Remove("x1"); Docs.Extra(d).Add("x0", new JsonArray()); },
        ["더한 칸 x01"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["k"] = "x01"; Docs.Extra(d).Remove("x1"); Docs.Extra(d).Add("x01", new JsonArray()); },
        ["더한 칸 x100"] = d => { Docs.WithAdded(d, 1); d["nextX"] = 101; Docs.Col(d, "x1")["k"] = "x100"; Docs.Extra(d).Remove("x1"); Docs.Extra(d).Add("x100", new JsonArray()); },
        ["더한 칸 X1"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["k"] = "X1"; Docs.Extra(d).Remove("x1"); Docs.Extra(d).Add("X1", new JsonArray()); },
        ["더한 칸 y1"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["k"] = "y1"; Docs.Extra(d).Remove("x1"); Docs.Extra(d).Add("y1", new JsonArray()); },
        ["더한 칸 번호 = nextX"] = d => { Docs.WithAdded(d, 3); d["nextX"] = 3; },
        ["더한 칸 번호 > nextX"] = d => { Docs.WithAdded(d, 5); d["nextX"] = 2; },
        ["더한 칸 겹침"] = d => { Docs.WithAdded(d, 1); Docs.Cols(d).Add(Docs.AddedCol("x1", "다른이름")); },
        ["칸 13개"] = d => Docs.WithAdded(d, 1, 2, 3, 4, 5, 6),
        ["보이는 칸 없음"] = d => { foreach (var col in Docs.Cols(d)) col!["show"] = false; },
        ["이름 빈 글"] = d => Docs.Col(d, "ds")["name"] = "",
        ["이름 빈칸뿐"] = d => Docs.Col(d, "ds")["name"] = "   ",
        ["이름 11글자"] = d => Docs.Col(d, "ds")["name"] = "가나다라마바사아자차카",
        ["이름에 |"] = d => Docs.Col(d, "ds")["name"] = "도|수",
        ["이름에 줄바꿈"] = d => Docs.Col(d, "ds")["name"] = "도\n수",
        ["이름에 C1 제어 글자"] = d => Docs.Col(d, "ds")["name"] = "도\u0085수",
        ["이름에 짝 없는 대리쌍"] = d => Docs.Col(d, "ds")["name"] = Docs.LoneMark,
        ["이름 숫자"] = d => Docs.Col(d, "ds")["name"] = 1,
        ["이름 겹침(처음 칸끼리)"] = d => Docs.Col(d, "ds")["name"] = "PT",
        ["이름 겹침(앞뒤 빈칸을 빼면)"] = d => Docs.Col(d, "ds")["name"] = " PT ",
        ["이름 겹침(더한 칸)"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["name"] = "견인"; },
        ["kind 모르는 값"] = d => Docs.Col(d, "pt")["kind"] = "auto",
        ["kind 대문자"] = d => Docs.Col(d, "pt")["kind"] = "RX",
        ["steps 1"] = d => Docs.Col(d, "pt")["steps"] = 1,
        ["steps 4"] = d => Docs.Col(d, "pt")["steps"] = 4,
        ["steps 글"] = d => Docs.Col(d, "pt")["steps"] = "2",
        ["steps 소수"] = d => Docs.Col(d, "pt")["steps"] = 2.5,
        ["show 글"] = d => Docs.Col(d, "pt")["show"] = "true",
        ["added 숫자"] = d => Docs.Col(d, "pt")["added"] = 0,
        ["처음 칸 added 참"] = d => Docs.Col(d, "pt")["added"] = true,
        ["더한 칸 added 거짓"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1")["added"] = false; },
        ["xray rule 없음"] = d => Docs.Col(d, "xray").Remove("rule"),
        ["xray rule null"] = d => Docs.Col(d, "xray")["rule"] = null,
        ["xray rule 글"] = d => Docs.Col(d, "xray")["rule"] = "true",
        ["다른 칸 rule"] = d => Docs.Col(d, "sono").Add("rule", true),
        ["더한 칸 rule"] = d => { Docs.WithAdded(d, 1); Docs.Col(d, "x1").Add("rule", false); },
        ["칸 모르는 값"] = d => Docs.Col(d, "pt").Add("color", "red"),
        ["칸 codes 없음"] = d => Docs.Col(d, "pt").Remove("codes"),
        ["칸 name 없음"] = d => Docs.Col(d, "pt").Remove("name"),
        ["칸 show 없음"] = d => Docs.Col(d, "pt").Remove("show"),
        ["칸이 글"] = d => Docs.Cols(d).Add("pt"),
        ["칸 null"] = d => Docs.Cols(d).Add(null),
    };

    public static IEnumerable<object[]> BadColNames() => BadCols.Keys.Select(k => new object[] { k });

    [Theory(DisplayName = "AC-5701.2 칸 목록 규칙에 어긋나면(일곱 칸·더한 칸 열쇠·nextX·12칸·보이는 칸·이름·kind·steps·show·added·rule) 받지 않는다")]
    [MemberData(nameof(BadColNames))]
    public void RejectsBadCols(string why)
    {
        var doc = Docs.Valid();
        BadCols[why](doc);
        Assert.False(Docs.Parses(doc), why);
    }

    [Fact(DisplayName = "AC-5701.2 같은 칸에 같은 열쇠가 두 번 있으면 받지 않는다")]
    public void RejectsDuplicateColProperty()
    {
        var json = Docs.Json(ReceptionSettings.Fresh()).Replace("{\"k\":\"pt\",", "{\"k\":\"pt\",\"k\":\"pt\",");
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes(json), out _));
    }

    // ---- AC-5701.3 칸의 codes --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.3 codes는 대문자로 바꿔 남고(한글·_·숫자, 16자), 칸마다 40개까지이며 같은 코드가 여러 칸에 있어도 되고 직접 칸 codes도 남는다")]
    public void AcceptsCodes()
    {
        var doc = Docs.Valid();
        Docs.Col(doc, "sono")["codes"] = Docs.Strings(new[] { "sono1", "Eb422", "가나_12", "ABCDEFGHIJ123456", "G0400" });
        Docs.Col(doc, "carm")["codes"] = Docs.Strings(Enumerable.Range(1, 40).Select(i => "C" + i));
        Docs.Col(doc, "xray")["codes"] = Docs.Strings(new[] { "g0400" });
        Docs.Col(doc, "pt")["codes"] = Docs.Strings(new[] { "mm301" });
        var read = Docs.Parse(doc);
        Assert.Equal(new[] { "SONO1", "EB422", "가나_12", "ABCDEFGHIJ123456", "G0400" }, read.Cols.Single(c => c.K == "sono").Codes);
        Assert.Equal(40, read.Cols.Single(c => c.K == "carm").Codes.Count);
        Assert.Equal(new[] { "G0400" }, read.Cols.Single(c => c.K == "xray").Codes);
        Assert.Equal(new[] { "MM301" }, read.Cols.Single(c => c.K == "pt").Codes);
        Assert.Contains("\"codes\":[\"MM301\"]", Docs.Json(read));
    }

    private static readonly Dictionary<string, string[]> BadCodes = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["빈 글"] = new[] { "" },
        ["17자"] = new[] { "ABCDEFGHIJ1234567" },
        ["빼기 글자"] = new[] { "A-1" },
        ["가운데 빈칸"] = new[] { "A 1" },
        ["앞 빈칸"] = new[] { " A1" },
        ["뒤 빈칸"] = new[] { "A1 " },
        ["점"] = new[] { "A.1" },
        ["한글 낱자"] = new[] { "ㄱ1" },
        ["줄바꿈 끝"] = new[] { "A1\n" },
        ["겹침"] = new[] { "SONO1", "SONO1" },
        ["대문자로 바꾸면 겹침"] = new[] { "sono1", "SONO1" },
        ["41개"] = Enumerable.Range(1, 41).Select(i => "C" + i).ToArray(),
    };

    public static IEnumerable<object[]> BadCodeNames() => BadCodes.Keys.Select(k => new object[] { k });

    [Theory(DisplayName = "AC-5701.3 codes 규칙에 어긋나면(모양·칸 안 겹침·41개) 받지 않는다")]
    [MemberData(nameof(BadCodeNames))]
    public void RejectsBadCodes(string why)
    {
        var doc = Docs.Valid();
        Docs.Col(doc, "sono")["codes"] = Docs.Strings(BadCodes[why]);
        Assert.False(Docs.Parses(doc), why);
    }

    [Fact(DisplayName = "AC-5701.3 codes가 배열이 아니거나 글이 아닌 값이 있으면 받지 않는다")]
    public void RejectsCodeTypes()
    {
        var doc = Docs.Valid();
        Docs.Col(doc, "sono")["codes"] = "SONO1";
        Assert.False(Docs.Parses(doc));
        Docs.Col(doc, "sono")["codes"] = new JsonArray(1);
        Assert.False(Docs.Parses(doc));
        Docs.Col(doc, "sono")["codes"] = new JsonArray((JsonNode?)null);
        Assert.False(Docs.Parses(doc));
    }

    // ---- AC-5701.4 picks ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.4 picks는 지금 고르기 목록 모양 + extra이고, extra는 더한 칸마다 이름 0~8개(앞뒤 빈칸을 뺀 글)다")]
    public void AcceptsPicksWithExtra()
    {
        var doc = Docs.WithAdded(Docs.Valid(), 1, 2);
        Docs.Extra(doc)["x1"] = Docs.Strings(new[] { " 목", "어깨", "허리 ", "무릎", "등", "팔", "손", "발" });
        var read = Docs.Parse(doc);
        Assert.Equal(new[] { "x1", "x2" }, read.Picks.Extra.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal(new[] { "목", "어깨", "허리", "무릎", "등", "팔", "손", "발" }, read.Picks.Extra["x1"]);
        Assert.Empty(read.Picks.Extra["x2"]);
        var picks = JsonNode.Parse(Docs.Json(read))!["picks"]!.AsObject();
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac", "extra" }, picks.Select(p => p.Key).ToArray());
        Assert.Equal(new[] { "목", "어깨", "허리", "무릎", "등", "팔", "손", "발" }, Docs.Names(picks["extra"]!["x1"]));
    }

    private static readonly Dictionary<string, Action<JsonObject>> BadPicks = new Dictionary<string, Action<JsonObject>>(StringComparer.Ordinal)
    {
        ["extra 없음"] = d => d["picks"]!.AsObject().Remove("extra"),
        ["extra가 배열"] = d => d["picks"]!["extra"] = new JsonArray(),
        ["extra null"] = d => d["picks"]!["extra"] = null,
        ["더한 칸의 extra 없음"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d).Remove("x1"); },
        ["없는 칸의 extra"] = d => Docs.Extra(d).Add("x1", new JsonArray()),
        ["처음 칸 열쇠의 extra"] = d => Docs.Extra(d).Add("pt", new JsonArray()),
        ["extra 이름 9개"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = Docs.Strings(Enumerable.Range(1, 9).Select(i => "이름" + i)); },
        ["extra 이름 11글자"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = Docs.Strings(new[] { "가나다라마바사아자차카" }); },
        ["extra 이름에 |"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = Docs.Strings(new[] { "목|등" }); },
        ["extra 이름 빈 글"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = Docs.Strings(new[] { "" }); },
        ["extra 이름 겹침"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = Docs.Strings(new[] { "목", " 목" }); },
        ["extra 이름이 숫자"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = new JsonArray(1); },
        ["extra 값이 글"] = d => { Docs.WithAdded(d, 1); Docs.Extra(d)["x1"] = "목"; },
        ["picks 모르는 칸"] = d => d["picks"]!.AsObject().Add("x1", new JsonArray()),
        ["picks pt 비었음"] = d => d["picks"]!["pt"] = new JsonArray(),
        ["picks sono 없음"] = d => d["picks"]!.AsObject().Remove("sono"),
        ["picks 옛 모양(새 무리 없음)"] = d => { foreach (var k in new[] { "pt", "ds", "eswt", "trac" }) d["picks"]!.AsObject().Remove(k); },
    };

    public static IEnumerable<object[]> BadPickNames() => BadPicks.Keys.Select(k => new object[] { k });

    [Theory(DisplayName = "AC-5701.4 picks 규칙에 어긋나면(extra 빠짐·열쇠가 더한 칸과 다름·이름 규칙·지금 목록 모양) 받지 않는다")]
    [MemberData(nameof(BadPickNames))]
    public void RejectsBadPicks(string why)
    {
        var doc = Docs.Valid();
        BadPicks[why](doc);
        Assert.False(Docs.Parses(doc), why);
    }

    [Fact(DisplayName = "AC-5701.4 같은 extra 열쇠가 두 번 있으면 받지 않는다")]
    public void RejectsDuplicateExtraKey()
    {
        var doc = Docs.WithAdded(Docs.Valid(), 1);
        var json = Docs.Raw(doc).Replace("\"extra\":{\"x1\":[]}", "\"extra\":{\"x1\":[],\"x1\":[]}");
        Assert.Contains("\"x1\":[],\"x1\":[]", json);
        Assert.False(ReceptionSettings.TryParse(Docs.Bytes(json), out _));
    }

    [Fact(DisplayName = "AC-5701.4 옛 목록 읽기 규칙은 그대로다: PickLists.TryParse·TryParseStored는 extra를 받지 않고 extra 없이 받으며, Write는 extra 없이 쓴다")]
    public void OldListRulesStay()
    {
        var withExtra = Picks.BodyWith("\"extra\":{}");
        Assert.False(PickLists.TryParse(Picks.Bytes(withExtra), out _));
        Assert.False(PickLists.TryParseStored(Picks.Bytes(withExtra), out _));
        Assert.True(PickLists.TryParse(Picks.Bytes(Picks.Body()), out var body));
        Assert.Empty(body.Extra);
        Assert.True(PickLists.TryParseStored(Picks.Bytes(Picks.OldBody()), out var old));
        Assert.Empty(old.Extra);
        Assert.Empty(PickLists.Defaults.Extra);
        var doc = Docs.WithAdded(Docs.Valid(), 1);
        Docs.Extra(doc)["x1"] = Docs.Strings(new[] { "목" });
        var picks = Docs.Parse(doc).Picks;
        using var document = JsonDocument.Parse(Picks.Json(picks));
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac" }, document.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
    }

    [Fact(DisplayName = "AC-5701.4 extra를 바꾼 목록(WithExtra)은 나머지 무리가 같고, 열쇠·이름 규칙에 어긋나면 ArgumentException")]
    public void WithExtraChecksRules()
    {
        var changed = PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x3"] = new[] { " 목 ", "허리" } });
        Assert.Equal(new[] { "목", "허리" }, changed.Extra["x3"]);
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(changed));
        Assert.Empty(PickLists.Defaults.Extra);
        Assert.ThrowsAny<ArgumentException>(() => PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["pt"] = new string[0] }));
        Assert.ThrowsAny<ArgumentException>(() => PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x0"] = new string[0] }));
        Assert.ThrowsAny<ArgumentException>(() => PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x1"] = new[] { "a|b" } }));
        Assert.ThrowsAny<ArgumentException>(() => PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x1"] = Enumerable.Range(1, 9).Select(i => "n" + i).ToArray() }));
        Assert.ThrowsAny<ArgumentException>(() => PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x1"] = new[] { "목", "목" } }));
    }

    // ---- AC-5701.5·5701.6 처음 값 ------------------------------------------------------------------------

    private static void AssertSevenCols(ReceptionSettings settings, string[] sonoCodes, string[] carmCodes)
    {
        Assert.Equal(Originals, settings.Cols.Select(c => c.K).ToArray());
        Assert.Equal(new[] { "X-RAY", "SONO", "C-ARM", "PT", "도수", "충격파", "견인" }, settings.Cols.Select(c => c.Name).ToArray());
        Assert.Equal(new[] { "rx", "rx", "rx", "mn", "mn", "mn", "mn" }, settings.Cols.Select(c => c.Kind).ToArray());
        Assert.Equal(new[] { 2, 3, 3, 2, 2, 2, 2 }, settings.Cols.Select(c => c.Steps).ToArray());
        Assert.All(settings.Cols, c => Assert.True(c.Show));
        Assert.All(settings.Cols, c => Assert.False(c.Added));
        Assert.True(settings.Cols[0].Rule);
        Assert.Empty(settings.Cols[0].Codes);
        Assert.Equal(sonoCodes, settings.Cols[1].Codes);
        Assert.Equal(carmCodes, settings.Cols[2].Codes);
        Assert.All(settings.Cols.Skip(3), c => Assert.Empty(c.Codes));
        Assert.Equal(1, settings.NextX);
        Assert.Empty(settings.Picks.Extra);
    }

    [Fact(DisplayName = "AC-5701.5 우리 의원 처음 값: 로고 pic(text null·ver 1)·탭 켜짐·setup 셋 다 참·일곱 칸(X-RAY 규칙 켜짐, SONO SONO1·SONO·EB422·EB466·HA280, C-ARM CARM1·G0400)·picks는 받은 목록 + extra {}")]
    public void OursValues()
    {
        Assert.True(PickLists.TryParse(Picks.Bytes(Picks.Body(parts: "[\"꼬리뼈\"]", pt: "[\"ICE\",\"HP\",\"TENS\"]")), out var lists));
        var ours = ReceptionSettings.Ours(lists);
        Assert.Equal(0, ours.Rev);
        Assert.Equal(("pic", (string?)null, 1), (ours.Logo.Mode, ours.Logo.Text, ours.Logo.Ver));
        Assert.True(ours.Tab);
        Assert.Equal((true, true, true), (ours.Setup.Logo, ours.Setup.Tab, ours.Setup.Done));
        AssertSevenCols(ours, new[] { "SONO1", "SONO", "EB422", "EB466", "HA280" }, new[] { "CARM1", "G0400" });
        Assert.Equal(Picks.Json(lists), Picks.Json(ours.Picks));
        Assert.Equal(new[] { "꼬리뼈" }, ours.Picks.Parts);
        Assert.Equal(new[] { "ICE", "HP", "TENS" }, ours.Picks.Pt);
    }

    [Fact(DisplayName = "AC-5701.5 우리 의원 처음 값은 받은 목록에 extra가 있어도 extra {}다(더한 칸이 없다)")]
    public void OursDropsExtra()
    {
        var lists = PickLists.Defaults.WithExtra(new Dictionary<string, IReadOnlyList<string>> { ["x1"] = new[] { "목" } });
        Assert.Empty(ReceptionSettings.Ours(lists).Picks.Extra);
        Assert.Throws<ArgumentNullException>(() => ReceptionSettings.Ours(null!));
    }

    [Fact(DisplayName = "AC-5701.6 새 병원 처음 값: 로고 none·text null·ver 0·탭 켜짐·setup 셋 다 거짓·일곱 칸은 우리 의원과 같되 SONO·C-ARM codes 없음·picks는 기본 목록 + extra {}")]
    public void FreshValues()
    {
        var fresh = ReceptionSettings.Fresh();
        Assert.Equal(0, fresh.Rev);
        Assert.Equal(("none", (string?)null, 0), (fresh.Logo.Mode, fresh.Logo.Text, fresh.Logo.Ver));
        Assert.True(fresh.Tab);
        Assert.Equal((false, false, false), (fresh.Setup.Logo, fresh.Setup.Tab, fresh.Setup.Done));
        AssertSevenCols(fresh, new string[0], new string[0]);
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(fresh.Picks));
    }

    // ---- 바꿀 수 없는 것(AC-5701.7 저장 규칙, AC-5704.2가 400으로 답함) --------------------------------------

    [Fact(DisplayName = "AC-5701.7 ChangeProblem: 이름·종류·단계·처방·목록·탭·로고 글을 바꾸거나 nextX를 늘리고 칸을 더하거나 빼는 것은 문제가 없다")]
    public void ChangeProblemAllowsEdits()
    {
        var stored = Docs.Parse(Docs.WithAdded(Docs.Valid(), 1));
        var doc = Docs.Node(stored);
        Docs.Col(doc, "pt")["name"] = "물리";
        Docs.Col(doc, "pt")["kind"] = "rx";
        Docs.Col(doc, "sono")["codes"] = Docs.Strings(new[] { "NEW1" });
        Docs.Col(doc, "sono")["show"] = false;
        doc["tab"] = false;
        doc["logo"]!["mode"] = "text";
        doc["logo"]!["text"] = "병원";
        Assert.Null(stored.ChangeProblem(Docs.Parse(doc)));

        var removed = Docs.Node(stored);
        Docs.Cols(removed).Remove(Docs.Col(removed, "x1"));
        Docs.Extra(removed).Remove("x1");
        var afterRemove = Docs.Parse(removed);
        Assert.Null(stored.ChangeProblem(afterRemove));
        // [되돌리기]로 뺀 칸을 같은 열쇠로 되살린다
        Assert.Null(afterRemove.ChangeProblem(stored));
        Assert.Null(stored.ChangeProblem(Docs.Parse(Docs.WithAdded(Docs.Node(stored), 2))));
    }

    [Fact(DisplayName = "AC-5701.7 ChangeProblem: nextX 줄이기·logo.ver 바꾸기·ver 0인데 mode pic은 문제다(바꿀 수 없는 것)")]
    public void ChangeProblemFindsForbidden()
    {
        var stored = Docs.Parse(Docs.WithAdded(Docs.Valid(), 3));
        Assert.Equal(4, stored.NextX);

        var smaller = Docs.Node(stored);
        Docs.Cols(smaller).Remove(Docs.Col(smaller, "x3"));
        Docs.Extra(smaller).Remove("x3");
        smaller["nextX"] = 3;
        Assert.Contains("nextX", stored.ChangeProblem(Docs.Parse(smaller)) ?? new string[0]);

        var ver = Docs.Node(stored);
        ver["logo"]!["ver"] = 2;
        Assert.Contains("logo.ver", stored.ChangeProblem(Docs.Parse(ver)) ?? new string[0]);

        var fresh = ReceptionSettings.Fresh();
        var pic = Docs.Node(fresh);
        pic["logo"]!["mode"] = "pic";
        Assert.Contains("logo.mode", fresh.ChangeProblem(Docs.Parse(pic)) ?? new string[0]);
        Assert.Throws<ArgumentNullException>(() => fresh.ChangeProblem(null!));
    }

    [Fact(DisplayName = "AC-5701.7 WithRev·WithLogo·WithSetup은 그것만 바꾼 사본이고 앞 문서는 그대로다")]
    public void WithCopies()
    {
        var fresh = ReceptionSettings.Fresh();
        var before = Docs.Json(fresh);
        var changed = fresh.WithRev(5).WithLogo(new LogoSetting("text", "병원", 0)).WithSetup(new SetupState(true, false, true));
        Assert.Equal(before, Docs.Json(fresh));
        Assert.Equal(5, changed.Rev);
        Assert.Equal(("text", "병원", 0), (changed.Logo.Mode, changed.Logo.Text, changed.Logo.Ver));
        Assert.Equal((true, false, true), (changed.Setup.Logo, changed.Setup.Tab, changed.Setup.Done));
        Assert.Equal(Docs.Json(fresh).Substring(Docs.Json(fresh).IndexOf("\"cols\"", StringComparison.Ordinal)),
            Docs.Json(changed).Substring(Docs.Json(changed).IndexOf("\"cols\"", StringComparison.Ordinal)));
        Assert.ThrowsAny<ArgumentException>(() => fresh.WithRev(-1));
        Assert.ThrowsAny<ArgumentException>(() => new LogoSetting("text", null, 0));
        Assert.ThrowsAny<ArgumentException>(() => new LogoSetting("gif", null, 0));
        Assert.ThrowsAny<ArgumentException>(() => new LogoSetting("none", null, -1));
    }
}
