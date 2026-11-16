using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 기능(reception-pick-lists)의 시험만 한 거르기로 돌리려고 PickChoices 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PickChoices;

/// <summary>시험 공용: 목록을 JSON 글로(견주기용), 글 목록을 목록으로.</summary>
internal static class Picks
{
    private static readonly JsonWriterOptions Relaxed = new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static string Json(PickLists lists)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Relaxed)) lists.Write(writer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    public static byte[] Bytes(string json) => Encoding.UTF8.GetBytes(json);

    /// <summary>
    /// 각 무리를 바꾼 목록 JSON { carm, sono, pt, ds, eswt: { hits, counts }, trac }(spec reception-arrange-tune AC-3603.2).
    /// 바꾸지 않은 SONO·C-ARM 무리는 작은 시험 목록, 새 무리(pt·ds·eswt·trac)는 기본값과 같은 글이다.
    /// </summary>
    public static string Body(
        string? procs = null, string? drugs = null, string? parts = null, string? plains = null, string? withs = null,
        string? pt = null, string? ds = null, string? hits = null, string? counts = null, string? trac = null)
    {
        var old = OldBody(procs, drugs, parts, plains, withs);
        return old.Substring(0, old.Length - 1)
            + ",\"pt\":" + (pt ?? "[\"ICE\",\"HP\"]") + ",\"ds\":" + (ds ?? "[\"30분\",\"50분\"]")
            + ",\"eswt\":{\"hits\":" + (hits ?? "[\"2000타\",\"3000타\",\"4000타\",\"6000타\"]")
            + ",\"counts\":" + (counts ?? "[\"1부위\",\"2부위\",\"3부위\",\"4부위\"]") + "}"
            + ",\"trac\":" + (trac ?? "[\"목\",\"허리\"]") + "}";
    }

    /// <summary>새 무리 넷이 없는 옛 목록 JSON { carm, sono }(reception-pick-lists 모양).</summary>
    public static string OldBody(string? procs = null, string? drugs = null, string? parts = null, string? plains = null, string? withs = null) =>
        "{\"carm\":{\"procs\":" + (procs ?? "[{\"n\":\"목\",\"noDrug\":false},{\"n\":\"리덕션\",\"noDrug\":true}]")
        + ",\"drugs\":" + (drugs ?? "[\"TP\"]") + "},\"sono\":{\"parts\":" + (parts ?? "[\"어깨\",\"무릎\"]")
        + ",\"plains\":" + (plains ?? "[\"소독\"]") + ",\"withs\":" + (withs ?? "[\"DNA\"]") + "}}";

    /// <summary>Body() 끝에 맨 위 칸 하나를 더한 글.</summary>
    public static string BodyWith(string extra)
    {
        var body = Body();
        return body.Substring(0, body.Length - 1) + "," + extra + "}";
    }

    public static string Strings(IEnumerable<string> names) => "[" + string.Join(",", names.Select(n => JsonSerializer.Serialize(n))) + "]";

    public static string Procs(int count) =>
        "[" + string.Join(",", Enumerable.Range(1, count).Select(i => "{\"n\":\"시술" + i + "\",\"noDrug\":false}")) + "]";

    public static IEnumerable<string> Names(string prefix, int count) => Enumerable.Range(1, count).Select(i => prefix + i);
}

/// <summary>
/// 고르기 목록 모양(PickLists, spec reception-pick-lists design.md 1절, AC-3501.1·AC-3501.2)과 그 목록으로 보는 쓰기 검사(IsCarm·IsSono, AC-3502.3).
/// </summary>
public class PickListsTests
{
    private static readonly string[] MockParts =
    {
        "목", "등", "허리", "어깨", "위팔", "팔꿈치", "아래팔", "손목", "손가락", "늑골",
        "골반", "고관절", "허벅지", "무릎", "종아리", "발목", "발바닥", "발가락", "아킬레스", "기타",
    };

    // ---- AC-3501.1 기본값 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.1 기본값은 시안 목록이다: C-ARM 시술 목·등·허리·리덕션(리덕션만 약재 없음)·약재 TP·하프·기본, SONO 부위 20개(시안 차례)·부위 없이 소독·S/O·봉합·같이 DNA·채혈")]
    public void DefaultsAreMockupLists()
    {
        var lists = PickLists.Defaults;
        Assert.Equal(new[] { ("목", false), ("등", false), ("허리", false), ("리덕션", true) }, lists.Procs.Select(p => (p.N, p.NoDrug)).ToArray());
        Assert.Equal(new[] { "TP", "하프", "기본" }, lists.Drugs);
        Assert.Equal(MockParts, lists.Parts);
        Assert.Equal(20, lists.Parts.Count);
        Assert.Equal(new[] { "소독", "S/O", "봉합" }, lists.Plains);
        Assert.Equal(new[] { "DNA", "채혈" }, lists.Withs);
    }

    [Fact(DisplayName = "AC-3501.1 기본값은 고칠 수 없는 목록이고 목록 규칙을 지킨다(Write → TryParse가 같은 글)")]
    public void DefaultsAreReadOnlyAndValid()
    {
        var lists = PickLists.Defaults;
        Assert.False(lists.Procs is IList<PickProc> procs && !procs.IsReadOnly, "시술 목록을 고칠 수 있다");
        foreach (var names in new[] { lists.Drugs, lists.Parts, lists.Plains, lists.Withs })
            Assert.False(names is IList<string> list && !list.IsReadOnly, "글 목록을 고칠 수 있다");
        Assert.True(PickLists.TryParse(Picks.Bytes(Picks.Json(lists)), out var read));
        Assert.Equal(Picks.Json(lists), Picks.Json(read));
    }

    // ---- AC-3501.2 모양 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.2 Write는 { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs } }(뒤에 새 무리, spec reception-arrange-tune AC-3603.2)를 목록 차례 그대로 쓴다")]
    public void WriteShape()
    {
        using var document = JsonDocument.Parse(Picks.Json(PickLists.Defaults));
        var root = document.RootElement;
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac" }, root.EnumerateObject().Select(p => p.Name).ToArray());
        var carm = root.GetProperty("carm");
        Assert.Equal(new[] { "procs", "drugs" }, carm.EnumerateObject().Select(p => p.Name).ToArray());
        var procs = carm.GetProperty("procs").EnumerateArray().ToArray();
        Assert.All(procs, p => Assert.Equal(new[] { "n", "noDrug" }, p.EnumerateObject().Select(x => x.Name).ToArray()));
        Assert.Equal(new[] { "목", "등", "허리", "리덕션" }, procs.Select(p => p.GetProperty("n").GetString()).ToArray());
        Assert.Equal(new[] { false, false, false, true }, procs.Select(p => p.GetProperty("noDrug").GetBoolean()).ToArray());
        Assert.Equal(new[] { "TP", "하프", "기본" }, carm.GetProperty("drugs").EnumerateArray().Select(d => d.GetString()).ToArray());
        var sono = root.GetProperty("sono");
        Assert.Equal(new[] { "parts", "plains", "withs" }, sono.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(MockParts, sono.GetProperty("parts").EnumerateArray().Select(d => d.GetString()).ToArray());
        Assert.Equal(new[] { "소독", "S/O", "봉합" }, sono.GetProperty("plains").EnumerateArray().Select(d => d.GetString()).ToArray());
        Assert.Equal(new[] { "DNA", "채혈" }, sono.GetProperty("withs").EnumerateArray().Select(d => d.GetString()).ToArray());
    }

    [Fact(DisplayName = "AC-3501.2 바른 목록은 받는다: 칸 차례는 상관없고, 이름은 앞뒤 빈칸을 뺀 글로 남는다(가운데 빈칸·10글자는 그대로)")]
    public void AcceptsAndTrims()
    {
        var body = "{\"trac\":[\"목\"],\"sono\":{\"withs\":[\" DNA\"],\"plains\":[\"소독 \"],\"parts\":[\"  어깨\",\"위 팔\"]},\"eswt\":{\"counts\":[\"1부위\"],\"hits\":[]},"
            + "\"carm\":{\"drugs\":[\"TP\",\"가나다라마바사아자차\"],\"procs\":[{\"noDrug\":true,\"n\":\" 리덕션 \"},{\"n\":\"허리\",\"noDrug\":false}]},\"ds\":[\"30분\"],\"pt\":[\"HP\"]}";
        Assert.True(PickLists.TryParse(Picks.Bytes(body), out var lists));
        Assert.Equal(new[] { ("리덕션", true), ("허리", false) }, lists.Procs.Select(p => (p.N, p.NoDrug)).ToArray());
        Assert.Equal(new[] { "TP", "가나다라마바사아자차" }, lists.Drugs);
        Assert.Equal(new[] { "어깨", "위 팔" }, lists.Parts);
        Assert.Equal(new[] { "소독" }, lists.Plains);
        Assert.Equal(new[] { "DNA" }, lists.Withs);
    }

    public static IEnumerable<object[]> EdgeCounts() => new[]
    {
        new object[] { "시술 1개", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":false}]") },
        new object[] { "시술 12개", Picks.Body(procs: Picks.Procs(12)) },
        new object[] { "약재 0개", Picks.Body(drugs: "[]") },
        new object[] { "약재 12개", Picks.Body(drugs: Picks.Strings(Picks.Names("약", 12))) },
        new object[] { "부위 0개 + 부위 없이 1개", Picks.Body(parts: "[]", plains: "[\"소독\"]") },
        new object[] { "부위 1개 + 부위 없이 0개", Picks.Body(parts: "[\"어깨\"]", plains: "[]") },
        new object[] { "부위 40개", Picks.Body(parts: Picks.Strings(Picks.Names("부", 40))) },
        new object[] { "부위 없이 12개", Picks.Body(plains: Picks.Strings(Picks.Names("처", 12))) },
        new object[] { "같이 0개", Picks.Body(withs: "[]") },
        new object[] { "같이 12개", Picks.Body(withs: Picks.Strings(Picks.Names("같", 12))) },
        new object[] { "모두 약재 없음 시술", Picks.Body(procs: "[{\"n\":\"리덕션\",\"noDrug\":true}]") },
        new object[] { "무리가 달라 같은 이름(시술·약재·같이)", Picks.Body(procs: "[{\"n\":\"TP\",\"noDrug\":false}]", drugs: "[\"TP\"]", withs: "[\"어깨\"]") },
    };

    [Theory(DisplayName = "AC-3501.2 개수 한도 안이면 받는다: 시술 1~12·약재 0~12·부위 0~40·부위 없이 0~12(둘 합 1 이상)·같이 0~12")]
    [MemberData(nameof(EdgeCounts))]
    public void AcceptsEdgeCounts(string why, string body)
    {
        Assert.True(PickLists.TryParse(Picks.Bytes(body), out var lists), why);
        Assert.True(PickLists.TryParse(Picks.Bytes(Picks.Json(lists)), out var again), why);
        Assert.Equal(Picks.Json(lists), Picks.Json(again));
    }

    public static IEnumerable<object[]> BadBodies() => new[]
    {
        new object[] { "JSON 아님", "not json" },
        new object[] { "배열", "[]" },
        new object[] { "null", "null" },
        new object[] { "carm 없음", "{\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}" },
        new object[] { "sono 없음", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]}}" },
        new object[] { "모르는 맨 위 칸", Picks.BodyWith("\"x\":1") },
        new object[] { "같은 칸 두 번", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]},\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}" },
        new object[] { "carm에 모르는 칸", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[],\"x\":[]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}" },
        new object[] { "drugs 없음", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}" },
        new object[] { "withs 없음", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[]}}" },
        new object[] { "sono가 배열", "{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]},\"sono\":[]}" },
        new object[] { "parts가 글", Picks.Body(parts: "\"어깨\"") },
        new object[] { "시술 noDrug 없음", Picks.Body(procs: "[{\"n\":\"목\"}]") },
        new object[] { "시술 noDrug가 글", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":\"false\"}]") },
        new object[] { "시술 noDrug가 null", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":null}]") },
        new object[] { "시술 n이 숫자", Picks.Body(procs: "[{\"n\":1,\"noDrug\":false}]") },
        new object[] { "시술에 모르는 칸", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":false,\"x\":1}]") },
        new object[] { "시술이 글", Picks.Body(procs: "[\"목\"]") },
        new object[] { "약재에 약재 없음 표시", Picks.Body(drugs: "[{\"n\":\"TP\",\"noDrug\":true}]") },
        new object[] { "부위에 약재 없음 표시", Picks.Body(parts: "[{\"n\":\"어깨\",\"noDrug\":false}]") },
        new object[] { "같이에 약재 없음 표시", Picks.Body(withs: "[{\"n\":\"DNA\",\"noDrug\":true}]") },
        new object[] { "약재가 숫자", Picks.Body(drugs: "[1]") },
        new object[] { "약재가 null", Picks.Body(drugs: "[null]") },
        new object[] { "빈 이름", Picks.Body(drugs: "[\"\"]") },
        new object[] { "빈칸뿐인 이름", Picks.Body(withs: "[\"   \"]") },
        new object[] { "11글자 이름", Picks.Body(parts: "[\"가나다라마바사아자차카\"]") },
        new object[] { "앞뒤 빈칸을 빼도 11글자", Picks.Body(plains: "[\" 가나다라마바사아자차카 \"]") },
        new object[] { "| 든 이름", Picks.Body(parts: "[\"어깨|무릎\"]") },
        new object[] { "줄바꿈 든 이름", Picks.Body(procs: "[{\"n\":\"목\\n등\",\"noDrug\":false}]") },
        new object[] { "탭 든 이름", Picks.Body(drugs: "[\"T\\tP\"]") },
        new object[] { "C1 제어 글자 든 이름", Picks.Body(plains: "[\"소\\u0085독\"]") },
        new object[] { "DEL 든 이름", Picks.Body(withs: "[\"DNA\\u007f\"]") },
        new object[] { "줄 구분 글자 든 이름", Picks.Body(parts: "[\"어\\u2028깨\"]") },
        new object[] { "짝 없는 대리쌍", Picks.Body(parts: "[\"어\\ud800깨\"]") },
        new object[] { "시술 겹침", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":false},{\"n\":\"목\",\"noDrug\":true}]") },
        new object[] { "앞뒤 빈칸을 빼면 시술 겹침", Picks.Body(procs: "[{\"n\":\"목\",\"noDrug\":false},{\"n\":\" 목\",\"noDrug\":false}]") },
        new object[] { "약재 겹침", Picks.Body(drugs: "[\"TP\",\"TP\"]") },
        new object[] { "부위 겹침", Picks.Body(parts: "[\"어깨\",\"무릎\",\"어깨\"]") },
        new object[] { "부위 없이 겹침", Picks.Body(plains: "[\"소독\",\"소독 \"]") },
        new object[] { "같이 겹침", Picks.Body(withs: "[\"DNA\",\"DNA\"]") },
        new object[] { "부위와 부위 없이가 겹침", Picks.Body(parts: "[\"어깨\",\"소독\"]", plains: "[\"소독\"]") },
        new object[] { "시술 0개", Picks.Body(procs: "[]") },
        new object[] { "시술 13개", Picks.Body(procs: Picks.Procs(13)) },
        new object[] { "약재 13개", Picks.Body(drugs: Picks.Strings(Picks.Names("약", 13))) },
        new object[] { "부위 41개", Picks.Body(parts: Picks.Strings(Picks.Names("부", 41))) },
        new object[] { "부위 없이 13개", Picks.Body(plains: Picks.Strings(Picks.Names("처", 13))) },
        new object[] { "부위·부위 없이 둘 다 0개", Picks.Body(parts: "[]", plains: "[]") },
        new object[] { "같이 13개", Picks.Body(withs: Picks.Strings(Picks.Names("같", 13))) },
    };

    [Theory(DisplayName = "AC-3501.2 목록 규칙에 어긋나면 받지 않는다(모양·이름·겹침·개수·약재 없음 자리)")]
    [MemberData(nameof(BadBodies))]
    public void RejectsBadBodies(string why, string body)
    {
        Assert.False(PickLists.TryParse(Picks.Bytes(body), out _), why);
    }

    [Fact(DisplayName = "AC-3501.2 틀린 UTF-8·null 몸은 받지 않는다(던지지 않음)")]
    public void RejectsBadBytes()
    {
        Assert.False(PickLists.TryParse(new byte[] { 0x7B, 0xC3, 0x28, 0x7D }, out _));
        Assert.False(PickLists.TryParse(null!, out _));
        Assert.False(PickLists.TryParse(new byte[0], out _));
    }

    [Fact(DisplayName = "AC-3501.2 목록을 직접 만들 때도 같은 규칙이다(어긋나면 ArgumentException, 이름은 앞뒤 빈칸을 뺀 글)")]
    public void ConstructorChecksRules()
    {
        var made = new PickLists(new[] { new PickProc(" 목 ", false) }, new string[0], new[] { "어깨" }, new string[0], new string[0]);
        Assert.Equal("목", Assert.Single(made.Procs).N);
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(new PickProc[0], new string[0], new[] { "어깨" }, new string[0], new string[0]));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(new[] { new PickProc("목", false) }, new[] { "a|b" }, new[] { "어깨" }, new string[0], new string[0]));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(new[] { new PickProc("목", false) }, new string[0], new[] { "소독" }, new[] { "소독" }, new string[0]));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(new[] { new PickProc("목", false) }, new string[0], new string[0], new string[0], new string[0]));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(new[] { new PickProc("목", false) }, new[] { (string)null! }, new[] { "어깨" }, new string[0], new string[0]));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(null!, new string[0], new[] { "어깨" }, new string[0], new string[0]));
    }

    // ---- AC-3502.3 지금 목록으로 보는 쓰기 검사 -----------------------------------------------------------

    public static IEnumerable<object?[]> CarmCases() => new[]
    {
        new object?[] { "허리", "TP", true },
        new object?[] { "목", "기본", true },
        new object?[] { "허리", null, true },
        new object?[] { "허리", "", true },
        new object?[] { "리덕션", null, true },
        new object?[] { "리덕션", "", true },
        new object?[] { "리덕션", "TP", false },
        new object?[] { "허리", "TP|하프", false },
        new object?[] { "허리", "TP|TP", false },
        new object?[] { "허리", "없는약", false },
        new object?[] { "허리", "DNA", false },
        new object?[] { "허리", "|", false },
        new object?[] { "허리", "TP|", false },
        new object?[] { "어깨", null, false },
        new object?[] { "허리|목", null, false },
        new object?[] { " 허리", null, false },
        new object?[] { "", null, false },
        new object?[] { null, null, false },
        new object?[] { "부위는 나중에", null, false },
    };

    [Theory(DisplayName = "AC-3502.3 C-ARM은 v = 지금 목록의 시술 하나·t = 약재 0~1개(약재 없음 시술이면 t 없음)")]
    [MemberData(nameof(CarmCases))]
    public void CarmCheck(string? v, string? t, bool ok)
    {
        Assert.Equal(ok, PickLists.Defaults.IsCarm(v!, t));
    }

    public static IEnumerable<object?[]> SonoCases() => new[]
    {
        new object?[] { "오른 어깨|왼 무릎", "DNA", true },
        new object?[] { "어깨", null, true },
        new object?[] { "양 무릎", "", true },
        new object?[] { "소독", null, true },
        new object?[] { "S/O|오른 어깨", "DNA|채혈", true },
        new object?[] { "채혈|DNA", null, false },
        new object?[] { "어깨", "채혈|DNA", true },
        new object?[] { "목|등|허리|어깨|위팔|팔꿈치", null, true },
        new object?[] { "목|등|허리|어깨|위팔|팔꿈치|손목", null, false },
        new object?[] { "오른 어깨|왼 어깨|양 어깨", null, true },
        new object?[] { "어깨|어깨", null, false },
        new object?[] { "오른 어깨|오른 어깨", null, false },
        new object?[] { "어깨|", null, false },
        new object?[] { "|어깨", null, false },
        new object?[] { "", null, false },
        new object?[] { null, null, false },
        new object?[] { "오른쪽 어깨", null, false },
        new object?[] { "오른어깨", null, false },
        new object?[] { "오른  어깨", null, false },
        new object?[] { "오른 ", null, false },
        new object?[] { "오른", null, false },
        new object?[] { "오른 소독", null, false },
        new object?[] { "위 어깨", null, false },
        new object?[] { "리덕션", null, false },
        new object?[] { "어깨", "DNA|DNA", false },
        new object?[] { "어깨", "TP", false },
        new object?[] { "어깨", "DNA|", false },
        new object?[] { "어깨 ", null, false },
        new object?[] { "부위는 나중에", null, false },
    };

    [Theory(DisplayName = "AC-3502.3 SONO는 v = 겹침 없는 1~6줄(부위 없이 글·부위·오른|왼|양 + 빈칸 + 부위)·t = 같이 하는 것의 겹침 없는 일부")]
    [MemberData(nameof(SonoCases))]
    public void SonoCheck(string? v, string? t, bool ok)
    {
        Assert.Equal(ok, PickLists.Defaults.IsSono(v!, t));
    }

    [Fact(DisplayName = "AC-3502.3 쓰기 검사는 그 목록을 본다: 더한 이름은 받고 뺀 이름은 받지 않으며, 목록에 있어도 \"부위는 나중에\"는 받지 않는다")]
    public void ChecksFollowLists()
    {
        var body = Picks.Body(
            procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false},{\"n\":\"부위는 나중에\",\"noDrug\":true}]",
            drugs: "[\"새약\"]",
            parts: "[\"꼬리뼈\"]",
            plains: "[\"드레싱\",\"부위는 나중에\"]",
            withs: "[\"주사\"]");
        Assert.True(PickLists.TryParse(Picks.Bytes(body), out var lists));
        Assert.True(lists.IsCarm("꼬리뼈", "새약"));
        Assert.False(lists.IsCarm("허리", null));
        Assert.False(lists.IsCarm("꼬리뼈", "TP"));
        Assert.False(lists.IsCarm("부위는 나중에", null));
        Assert.True(lists.IsSono("왼 꼬리뼈|드레싱", "주사"));
        Assert.False(lists.IsSono("어깨", null));
        Assert.False(lists.IsSono("드레싱", "DNA"));
        Assert.False(lists.IsSono("부위는 나중에", null));
    }

    [Fact(DisplayName = "AC-3502.3 t는 \"|\"로 나눈 글 목록이다(null·빈 글은 빈 목록)")]
    public void TagsOfSplits()
    {
        Assert.Empty(PickLists.TagsOf(null));
        Assert.Empty(PickLists.TagsOf(""));
        Assert.Equal(new[] { "DNA" }, PickLists.TagsOf("DNA"));
        Assert.Equal(new[] { "DNA", "채혈" }, PickLists.TagsOf("DNA|채혈"));
    }
}

/// <summary>
/// 목록 저장(ReceptionLists, design.md 1절, AC-3501.1·AC-3501.3 파일 쪽). data\reception-lists.dat = 머리 + IProtector로 감싼 목록 JSON, 날짜와 상관없음.
/// 가짜 암호화(XorProtector)·임시 폴더만 쓴다.
/// </summary>
public class ReceptionListsTests : IDisposable
{
    private const string FileName = "reception-lists.dat";

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-lists-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private ReceptionLists Open(IProtector? with = null) =>
        new ReceptionLists(new StoreFolder(folder), with ?? protector, code => { lock (reports) reports.Add(code); });

    private string[] FolderFiles() => Directory.Exists(folder)
        ? Directory.GetFileSystemEntries(folder).Select(p => Path.GetFileName(p)!).OrderBy(n => n, StringComparer.Ordinal).ToArray()
        : new string[0];

    private static PickLists Changed() =>
        PickLists.TryParse(Picks.Bytes(Picks.Body(
            procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false},{\"n\":\"리덕션\",\"noDrug\":true}]",
            drugs: "[\"새약\",\"TP\"]",
            parts: "[\"꼬리뼈\",\"어깨\"]",
            plains: "[\"드레싱\"]",
            withs: "[]")), out var lists) ? lists : throw new InvalidOperationException("시험 목록이 틀렸다");

    /// <summary>파일의 암호문만 바꾼다(머리는 그대로).</summary>
    private void WritePlain(byte[] plain)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(plain)).ToArray());
    }

    private static bool Contains(byte[] data, string text)
    {
        var needle = Encoding.UTF8.GetBytes(text);
        for (var i = 0; i + needle.Length <= data.Length; i++)
            if (data.Skip(i).Take(needle.Length).SequenceEqual(needle)) return true;
        return false;
    }

    // ---- AC-3501.1 없음·깨짐 --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.1 목록 파일이 없으면 기본값이고 기록·파일이 생기지 않는다")]
    public void MissingFileGivesDefaults()
    {
        var lists = Open();
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        Assert.Empty(reports);
        Assert.Empty(FolderFiles());
    }

    public static IEnumerable<object[]> BrokenPlains() => new[]
    {
        new object[] { "JSON 아님", Picks.Bytes("not json") },
        new object[] { "배열", Picks.Bytes("[]") },
        new object[] { "모르는 칸(날짜)", Picks.Bytes(Picks.BodyWith("\"day\":\"20261112\"")) },
        new object[] { "시술 0개", Picks.Bytes(Picks.Body(procs: "[]")) },
        new object[] { "| 든 이름", Picks.Bytes(Picks.Body(parts: "[\"a|b\"]")) },
        new object[] { "잘못된 UTF-8", new byte[] { 0x7B, 0xC3, 0x28, 0x7D } },
    };

    [Theory(DisplayName = "AC-3501.1 깨진 파일(풀면 모양이 틀림)은 기본값이고 기록에 E-STORE-BROKEN 번호만 한 번 남는다")]
    [MemberData(nameof(BrokenPlains))]
    public void BrokenShapeGivesDefaultsOnce(string why, byte[] plain)
    {
        Open().Save(Changed());
        WritePlain(plain);
        var lists = Open();
        Assert.True(Picks.Json(PickLists.Defaults) == Picks.Json(lists.Current()), why);
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    public static IEnumerable<object[]> BrokenFiles() => new[]
    {
        new object[] { "빈 파일", new byte[0] },
        new object[] { "머리만", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n") },
        new object[] { "쓰레기 바이트", Encoding.ASCII.GetBytes("garbage-bytes-0123456789") },
        new object[] { "아주 큰 파일", Enumerable.Repeat((byte)'x', 2 * 1024 * 1024).ToArray() },
    };

    [Theory(DisplayName = "AC-3501.1 깨진 파일(빈 파일·쓰레기·큰 파일)은 기본값 + E-STORE-BROKEN 한 번이고, 다음 저장은 새 파일로 바르게 쓴다")]
    [MemberData(nameof(BrokenFiles))]
    public void BrokenFileGivesDefaultsThenRecovers(string why, byte[] data)
    {
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(FilePath, data);
        var lists = Open();
        Assert.True(Picks.Json(PickLists.Defaults) == Picks.Json(lists.Current()), why);
        lists.Current();
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
        lists.Save(Changed());
        Assert.Equal(Picks.Json(Changed()), Picks.Json(lists.Current()));
        reports.Clear();
        Assert.Equal(Picks.Json(Changed()), Picks.Json(Open().Current()));
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3501.1 풀지 못하는 파일(다른 윈도우 계정의 DPAPI)은 기본값 + E-STORE-BROKEN 한 번")]
    public void UnreadableCipherGivesDefaults()
    {
        Open().Save(Changed());
        var lists = Open(new XorProtector(0x33));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        lists.Current();
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    // ---- AC-3501.3 파일 쪽(저장) -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.3 Save로 쓴 목록은 Current에 나오고, 저장 폴더를 새로 연 ReceptionLists(도우미를 다시 켬)도 같은 목록을 읽는다")]
    public void SaveThenRead()
    {
        var lists = Open();
        lists.Save(Changed());
        Assert.Equal(Picks.Json(Changed()), Picks.Json(lists.Current()));
        Assert.Equal(Picks.Json(Changed()), Picks.Json(Open().Current()));
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3501.3 파일은 저장 폴더의 reception-lists.dat 하나(임시 파일 없음)이고 머리 PRECHECK-STORE-1 뒤 IProtector 암호문이며, 푼 글은 목록 { carm, sono, pt, ds, eswt, trac }뿐이다(날짜 없음)")]
    public void OneEncryptedFileWithoutDay()
    {
        Open().Save(Changed());
        Assert.Equal(new[] { FileName }, FolderFiles());
        var data = File.ReadAllBytes(FilePath);
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        Assert.Equal(1, protector.ProtectCalls);
        foreach (var text in new[] { "꼬리뼈", "새약", "carm", "sono" }) Assert.False(Contains(data, text), text);
        using var document = JsonDocument.Parse(protector.LastPlain!);
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac" }, document.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.True(PickLists.TryParse(protector.LastPlain!, out var stored));
        Assert.Equal(Picks.Json(Changed()), Picks.Json(stored));
        Assert.NotEqual(XrayMarks.FileName, ReceptionLists.FileName);
        Assert.NotEqual(ArrangeMarks.FileName, ReceptionLists.FileName);
        Assert.Equal(FileName, ReceptionLists.FileName);
    }

    [Fact(DisplayName = "AC-3501.3 날짜와 상관없다: ReceptionLists는 저장 폴더·암호화·기록만 받고(시계 없음) Current·Save만 연다")]
    public void NoClockAndSmallSurface()
    {
        var type = typeof(ReceptionLists);
        var allowed = new[] { typeof(IStoreFolder), typeof(IProtector), typeof(Action<string>) };
        var constructors = type.GetConstructors(BindingFlags.Public | BindingFlags.Instance);
        Assert.Single(constructors);
        Assert.All(constructors[0].GetParameters(), p => Assert.Contains(p.ParameterType, allowed));
        foreach (var field in type.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
        {
            var name = field.FieldType.FullName ?? field.FieldType.Name;
            Assert.False(name.StartsWith("System.Net", StringComparison.Ordinal), $"{field.Name}이 네트워크를 든다");
            Assert.False(field.FieldType == typeof(Func<DateTime>), $"{field.Name}이 시계를 든다");
        }
        var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Select(m => m.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "Current", "Save" }, methods);
    }

    [Fact(DisplayName = "AC-3501.3 암호화하지 못하면 파일을 쓰지 않고 E-STORE-FAILED, 목록은 그대로다")]
    public void ProtectFailureKeepsLists()
    {
        var lists = Open();
        lists.Save(Changed());
        var before = File.ReadAllBytes(FilePath);
        protector.FailProtect = true;
        var error = Assert.Throws<BitException>(() => lists.Save(PickLists.Defaults));
        Assert.Equal(BitErrors.StoreFailed, error.Code);
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(Picks.Json(Changed()), Picks.Json(lists.Current()));
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-3501.3 쓰지 못하면(바꿀 자리를 못 씀) E-STORE-FAILED, 임시 파일이 남지 않고 목록은 그대로다")]
    public void WriteFailureLeavesNoTemp()
    {
        Directory.CreateDirectory(FilePath);
        var lists = Open();
        var error = Assert.Throws<BitException>(() => lists.Save(Changed()));
        Assert.Equal(BitErrors.StoreFailed, error.Code);
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        Assert.Equal(new[] { FileName }, FolderFiles());
        Assert.True(Directory.Exists(FilePath));
    }

    [Fact(DisplayName = "AC-3501.3 null 목록은 저장하지 않는다(ArgumentNullException, 파일 없음)")]
    public void SaveRejectsNull()
    {
        Assert.Throws<ArgumentNullException>(() => Open().Save(null!));
        Assert.Empty(FolderFiles());
    }

    [Fact(DisplayName = "AC-3501.3 앞 저장이 쓰는 중이면 뒤 저장은 기다렸다가 그 뒤에 쓴다(한 번에 하나), 뒤 저장이 이긴다")]
    public async Task SavesOneAtATime()
    {
        var lists = Open();
        using var entered = new ManualResetEventSlim(false);
        using var release = new ManualResetEventSlim(false);
        var first = true;
        protector.BeforeProtect = () =>
        {
            if (!first) return;
            first = false;
            entered.Set();
            release.Wait(TimeSpan.FromSeconds(20));
        };
        var a = Task.Run(() => lists.Save(Changed()));
        Assert.True(entered.Wait(TimeSpan.FromSeconds(20)), "앞 저장이 쓰기에 들어가지 않았다");
        var b = Task.Run(() => lists.Save(PickLists.Defaults));
        Thread.Sleep(300);
        Assert.False(b.IsCompleted, "뒤 저장이 앞 저장을 기다리지 않았다");
        release.Set();
        var both = Task.WhenAll(a, b);
        Assert.Same(both, await Task.WhenAny(both, Task.Delay(TimeSpan.FromSeconds(20))));
        await both;
        Assert.Equal(1, protector.MaxInside);
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(lists.Current()));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(Open().Current()));
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-3501.1 기록에는 오류 번호만 간다: 목록 글·경로가 없다")]
    public void ReportCarriesCodeOnly()
    {
        Open().Save(Changed());
        WritePlain(Picks.Bytes(Picks.Body(parts: "[\"꼬리|뼈\"]")));
        Open().Current();
        Assert.NotEmpty(reports);
        Assert.All(reports, code => Assert.Matches("^E-[A-Z]+(-[A-Z]+)*$", code));
    }
}
