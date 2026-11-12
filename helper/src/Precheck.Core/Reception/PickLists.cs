using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace Precheck.Core.Reception;

/// <summary>C-ARM 시술 하나: 이름과 약재 없음 표시(리덕션처럼 약재를 쓰지 않는 시술).</summary>
public sealed class PickProc
{
    public PickProc(string n, bool noDrug)
    {
        N = n ?? throw new ArgumentNullException(nameof(n));
        NoDrug = noDrug;
    }

    public string N { get; }

    public bool NoDrug { get; }
}

/// <summary>
/// SONO·C-ARM 고르기 목록(spec reception-pick-lists design.md 1절, REQ-3501). 총괄 PC에 저장하고(ReceptionLists) 판 맨 위 picks로 나눠 준다.
/// 모양 규칙(AC-3501.2): 이름은 앞뒤 빈칸을 뺀 1~10글자(UTF-16 단위, 화면 글의 length와 같다)이고 "|"·제어 글자(C0·DEL·C1·U+2028·U+2029)·짝 없는 대리쌍이 없으며
/// 무리 안에서 겹치지 않는다. SONO 부위와 부위 없이는 서로 겹치지 않는다. 개수는 시술 1~12·약재 0~12·부위 0~40·부위 없이 0~12(둘 합 1 이상)·같이 0~12.
/// 약재 없음 표시는 시술에만 있다. 쪽 글(오른·왼·양)은 목록이 아니라 고정이다.
/// 쓰기 검사(AC-3502.3)는 IsCarm·IsSono가 이 목록으로 본다.
/// </summary>
public sealed class PickLists
{
    public const int MaxName = 10;
    public const int MaxProcs = 12;
    public const int MaxDrugs = 12;
    public const int MaxParts = 40;
    public const int MaxPlains = 12;
    public const int MaxWiths = 12;

    /// <summary>SONO 칸 한 개에 담는 줄 수 한도.</summary>
    public const int MaxLines = 6;

    /// <summary>줄·이름표를 잇는 글자. 이름에는 쓸 수 없다.</summary>
    public const char Joiner = '|';

    /// <summary>옛 넣기 창의 글. 목록에 있어도 쓰기에서는 받지 않는다(AC-3502.3).</summary>
    private const string PartLater = "부위는 나중에";

    /// <summary>SONO 쪽 글(고정): "오른 어깨"처럼 쪽 글 + 빈칸 + 부위.</summary>
    public static IReadOnlyList<string> Sides { get; } = Array.AsReadOnly(new[] { "오른", "왼", "양" });

    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    // 맨 위 객체 → carm·sono → procs 배열 → 시술 객체
    private static readonly JsonDocumentOptions BodyJson = new JsonDocumentOptions { MaxDepth = 4 };

    /// <summary>목록 파일이 없을 때(AC-3501.1): 시안 목록 그대로.</summary>
    public static PickLists Defaults { get; } = new PickLists(
        new[] { new PickProc("목", false), new PickProc("등", false), new PickProc("허리", false), new PickProc("리덕션", true) },
        new[] { "TP", "하프", "기본" },
        new[]
        {
            "목", "등", "허리", "어깨", "위팔", "팔꿈치", "아래팔", "손목", "손가락", "늑골",
            "골반", "고관절", "허벅지", "무릎", "종아리", "발목", "발바닥", "발가락", "아킬레스", "기타",
        },
        new[] { "소독", "S/O", "봉합" },
        new[] { "DNA", "채혈" });

    /// <summary>모양 규칙에 어긋나면 ArgumentException(null이면 ArgumentNullException). 이름은 앞뒤 빈칸을 뺀 글로 남는다.</summary>
    public PickLists(IEnumerable<PickProc> procs, IEnumerable<string> drugs, IEnumerable<string> parts, IEnumerable<string> plains, IEnumerable<string> withs)
    {
        if (procs == null) throw new ArgumentNullException(nameof(procs));
        var procList = procs.Select(p => p == null ? throw new ArgumentNullException(nameof(procs)) : new PickProc(Clean(p.N, nameof(procs)), p.NoDrug)).ToArray();
        CheckGroup(procList.Select(p => p.N).ToArray(), 1, MaxProcs, nameof(procs));
        Procs = Array.AsReadOnly(procList);
        Drugs = Group(drugs, MaxDrugs, nameof(drugs));
        Parts = Group(parts, MaxParts, nameof(parts));
        Plains = Group(plains, MaxPlains, nameof(plains));
        Withs = Group(withs, MaxWiths, nameof(withs));
        if (Parts.Count + Plains.Count == 0) throw new ArgumentException("SONO 부위·부위 없이가 모두 비었다", nameof(parts));
        if (Parts.Intersect(Plains, StringComparer.Ordinal).Any()) throw new ArgumentException("SONO 부위와 부위 없이가 겹친다", nameof(plains));
    }

    /// <summary>C-ARM 시술(목록 차례).</summary>
    public IReadOnlyList<PickProc> Procs { get; }

    /// <summary>C-ARM 약재.</summary>
    public IReadOnlyList<string> Drugs { get; }

    /// <summary>SONO 부위(쪽 글을 붙일 수 있다).</summary>
    public IReadOnlyList<string> Parts { get; }

    /// <summary>SONO 부위 없이(소독·S/O·봉합 등, 쪽 글 없음).</summary>
    public IReadOnlyList<string> Plains { get; }

    /// <summary>SONO 같이 하는 것(이름표).</summary>
    public IReadOnlyList<string> Withs { get; }

    /// <summary>
    /// 몸(또는 파일 글)이 { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs } }뿐인 바른 UTF-8 JSON이고(칸 차례 무관, 같은 칸 두 번·다른 칸은 틀림)
    /// 목록 규칙을 지키나(AC-3501.2). 아니면 false이고 lists는 기본값이다. 던지지 않는다.
    /// </summary>
    public static bool TryParse(byte[] json, out PickLists lists)
    {
        lists = Defaults;
        if (json == null) return false;
        try
        {
            using var document = JsonDocument.Parse(StrictUtf8.GetString(json), BodyJson);
            var root = document.RootElement;
            if (!HasExactly(root, "carm", "sono")) return false;
            var carm = root.GetProperty("carm");
            var sono = root.GetProperty("sono");
            if (!HasExactly(carm, "procs", "drugs") || !HasExactly(sono, "parts", "plains", "withs")) return false;

            var procsValue = carm.GetProperty("procs");
            if (procsValue.ValueKind != JsonValueKind.Array || procsValue.GetArrayLength() > MaxProcs) return false;
            var procs = new List<PickProc>();
            foreach (var proc in procsValue.EnumerateArray())
            {
                if (!HasExactly(proc, "n", "noDrug")) return false;
                var n = proc.GetProperty("n");
                var noDrug = proc.GetProperty("noDrug");
                if (n.ValueKind != JsonValueKind.String || (noDrug.ValueKind != JsonValueKind.True && noDrug.ValueKind != JsonValueKind.False)) return false;
                procs.Add(new PickProc(n.GetString()!, noDrug.ValueKind == JsonValueKind.True));
            }
            if (!TryStrings(carm.GetProperty("drugs"), MaxDrugs, out var drugs)
                || !TryStrings(sono.GetProperty("parts"), MaxParts, out var parts)
                || !TryStrings(sono.GetProperty("plains"), MaxPlains, out var plains)
                || !TryStrings(sono.GetProperty("withs"), MaxWiths, out var withs)) return false;

            lists = new PickLists(procs, drugs, parts, plains, withs);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            // 짝 없는 대리쌍 이스케이프처럼 글로 풀 수 없는 값
            return false;
        }
        catch (ArgumentException)
        {
            // 잘못된 UTF-8(DecoderFallbackException) 또는 목록 규칙에 어긋남
            return false;
        }
    }

    /// <summary>{ carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs } }를 값 하나로 쓴다(판 맨 위 picks·목록 파일).</summary>
    public void Write(Utf8JsonWriter writer)
    {
        if (writer == null) throw new ArgumentNullException(nameof(writer));
        writer.WriteStartObject();
        writer.WriteStartObject("carm");
        writer.WriteStartArray("procs");
        foreach (var proc in Procs)
        {
            writer.WriteStartObject();
            writer.WriteString("n", proc.N);
            writer.WriteBoolean("noDrug", proc.NoDrug);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        WriteStrings(writer, "drugs", Drugs);
        writer.WriteEndObject();
        writer.WriteStartObject("sono");
        WriteStrings(writer, "parts", Parts);
        WriteStrings(writer, "plains", Plains);
        WriteStrings(writer, "withs", Withs);
        writer.WriteEndObject();
        writer.WriteEndObject();
    }

    /// <summary>
    /// C-ARM 넣기·고르기 쓰기(AC-3502.3): v = 이 목록의 시술 하나, t = 약재 0~1개(null·빈 글은 0개). 약재 없음 시술이면 약재를 받지 않는다.
    /// "부위는 나중에"는 받지 않는다.
    /// </summary>
    public bool IsCarm(string v, string? t)
    {
        if (v == null || v == PartLater) return false;
        var proc = Procs.FirstOrDefault(p => string.Equals(p.N, v, StringComparison.Ordinal));
        if (proc == null || !TryTags(t, out var tags)) return false;
        if (proc.NoDrug) return tags.Count == 0;
        return tags.Count <= 1 && tags.All(tag => Drugs.Contains(tag, StringComparer.Ordinal));
    }

    /// <summary>
    /// SONO 넣기·고르기 쓰기(AC-3502.3): v = "|"로 이은 겹침 없는 1~6줄(줄마다 부위 없이 글·부위·쪽 글 + 빈칸 + 부위),
    /// t = 같이 하는 것의 겹침 없는 일부(null·빈 글은 없음). "부위는 나중에"는 받지 않는다.
    /// </summary>
    public bool IsSono(string v, string? t)
    {
        if (string.IsNullOrEmpty(v)) return false;
        var lines = v.Split(Joiner);
        if (lines.Length > MaxLines || lines.Distinct(StringComparer.Ordinal).Count() != lines.Length) return false;
        if (!lines.All(IsSonoLine) || !TryTags(t, out var tags)) return false;
        return tags.All(tag => Withs.Contains(tag, StringComparer.Ordinal));
    }

    /// <summary>쓰기 몸의 t(이름표를 "|"로 이음)를 이름표 목록으로. null·빈 글은 빈 목록.</summary>
    public static IReadOnlyList<string> TagsOf(string? t) =>
        string.IsNullOrEmpty(t) ? Array.AsReadOnly(new string[0]) : Array.AsReadOnly(t!.Split(Joiner));

    private bool IsSonoLine(string line)
    {
        if (line == PartLater) return false;
        if (Plains.Contains(line, StringComparer.Ordinal) || Parts.Contains(line, StringComparer.Ordinal)) return true;
        var space = line.IndexOf(' ');
        if (space <= 0) return false;
        return Sides.Contains(line.Substring(0, space), StringComparer.Ordinal) && Parts.Contains(line.Substring(space + 1), StringComparer.Ordinal);
    }

    /// <summary>t를 나눈 이름표: 빈 이름표·겹침이 있으면 false.</summary>
    private static bool TryTags(string? t, out IReadOnlyList<string> tags)
    {
        tags = TagsOf(t);
        return tags.All(tag => tag.Length > 0) && tags.Distinct(StringComparer.Ordinal).Count() == tags.Count;
    }

    private static IReadOnlyList<string> Group(IEnumerable<string> names, int max, string what)
    {
        if (names == null) throw new ArgumentNullException(what);
        var cleaned = names.Select(name => Clean(name, what)).ToArray();
        CheckGroup(cleaned, 0, max, what);
        return Array.AsReadOnly(cleaned);
    }

    private static void CheckGroup(string[] names, int min, int max, string what)
    {
        if (names.Length < min || names.Length > max) throw new ArgumentException("목록 개수가 한도 밖이다", what);
        if (names.Distinct(StringComparer.Ordinal).Count() != names.Length) throw new ArgumentException("목록 안에 같은 이름이 있다", what);
    }

    /// <summary>앞뒤 빈칸을 뺀 이름. 1~10글자가 아니거나 "|"·제어 글자·짝 없는 대리쌍이 있으면 ArgumentException.</summary>
    private static string Clean(string name, string what)
    {
        if (name == null) throw new ArgumentNullException(what);
        var trimmed = name.Trim();
        if (trimmed.Length == 0 || trimmed.Length > MaxName) throw new ArgumentException("이름 길이가 한도 밖이다", what);
        for (var i = 0; i < trimmed.Length; i++)
        {
            var c = trimmed[i];
            if (c == Joiner || char.IsControl(c) || c == '\u2028' || c == '\u2029') throw new ArgumentException("이름에 쓸 수 없는 글자가 있다", what);
            if (char.IsHighSurrogate(c) && i + 1 < trimmed.Length && char.IsLowSurrogate(trimmed[i + 1]))
            {
                i++;
                continue;
            }
            if (char.IsSurrogate(c)) throw new ArgumentException("이름에 짝 없는 대리쌍이 있다", what);
        }
        return trimmed;
    }

    private static bool TryStrings(JsonElement value, int max, out List<string> names)
    {
        names = new List<string>();
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > max) return false;
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) return false;
            names.Add(item.GetString()!);
        }
        return true;
    }

    /// <summary>객체이고 칸 이름이 정확히 그것들뿐(차례 무관, 겹침 없음)인가.</summary>
    private static bool HasExactly(JsonElement value, params string[] names)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = value.EnumerateObject().Select(p => p.Name).ToList();
        return seen.Count == names.Length && names.All(name => seen.Contains(name, StringComparer.Ordinal));
    }

    private static void WriteStrings(Utf8JsonWriter writer, string name, IReadOnlyList<string> values)
    {
        writer.WriteStartArray(name);
        foreach (var value in values) writer.WriteStringValue(value);
        writer.WriteEndArray();
    }
}
