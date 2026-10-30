using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Precheck.Core.Protocol;

/// <summary>
/// 명령 표의 칸 하나(design.md 4-3). 종류는 작게 둔다:
/// date(YYYY-MM-DD 실제 있는 날) · month(YYYY-MM) · int{min,max} · string{min,max,pattern} · bool · enum{values}
/// · array{items,min,max} · object{fields} · json{of}(안쪽은 처리기가 검사) · payload{fields}(JSON 글자, 풀어서 fields로 검사).
/// 모든 칸은 optional이 아니면 꼭 있어야 한다. object·payload의 모르는 칸은 거절한다.
/// 글자 길이(string min·max)는 UTF-16 단위로 센다(웹 String.length와 같다).
/// </summary>
internal sealed class FieldSpec
{
    private static readonly Dictionary<string, string[]> KindKeys = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["date"] = new string[0],
        ["month"] = new string[0],
        ["bool"] = new string[0],
        ["int"] = new[] { "min", "max" },
        ["string"] = new[] { "min", "max", "pattern" },
        ["enum"] = new[] { "values" },
        ["array"] = new[] { "min", "max", "items" },
        ["object"] = new[] { "fields" },
        ["json"] = new[] { "of" },
        ["payload"] = new[] { "fields" },
    };

    private static readonly Dictionary<string, Func<JsonElement, bool>> JsonKinds = new Dictionary<string, Func<JsonElement, bool>>(StringComparer.Ordinal)
    {
        ["object"] = e => e.ValueKind == JsonValueKind.Object,
        ["array"] = e => e.ValueKind == JsonValueKind.Array,
        ["string"] = e => e.ValueKind == JsonValueKind.String,
        ["number"] = e => e.ValueKind == JsonValueKind.Number,
        ["boolean"] = e => e.ValueKind == JsonValueKind.True || e.ValueKind == JsonValueKind.False,
    };

    private static readonly Regex DateShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant);
    private static readonly Regex MonthShape = new Regex(@"^[0-9]{4}-[0-9]{2}\z", RegexOptions.CultureInvariant);

    private FieldSpec(string kind) { Kind = kind; }

    public string Kind { get; }
    public bool Optional { get; private set; }
    private long? min;
    private long? max;
    private Regex? pattern;
    private HashSet<string>? values;
    private FieldSpec? items;
    private Func<JsonElement, bool>? of;

    /// <summary>object·payload의 칸들.</summary>
    public Dictionary<string, FieldSpec>? Fields { get; private set; }

    // ---- 표 읽기 --------------------------------------------------------------------------------

    public static Dictionary<string, FieldSpec> ParseFields(JsonElement element, string where, bool allowPayload)
    {
        if (element.ValueKind != JsonValueKind.Object) throw Broken(where);
        var fields = new Dictionary<string, FieldSpec>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (property.Name.Length == 0 || fields.ContainsKey(property.Name)) throw Broken(where);
            fields[property.Name] = Parse(property.Value, where + "." + property.Name, allowPayload);
        }
        return fields;
    }

    public static FieldSpec Parse(JsonElement element, string where, bool allowPayload)
    {
        if (element.ValueKind != JsonValueKind.Object) throw Broken(where);
        if (!element.TryGetProperty("type", out var typeElement) || typeElement.ValueKind != JsonValueKind.String) throw Broken(where);
        var kind = typeElement.GetString() ?? "";
        if (!KindKeys.TryGetValue(kind, out var extraKeys)) throw Broken(where);
        if (kind == "payload" && !allowPayload) throw Broken(where);

        var spec = new FieldSpec(kind);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!seen.Add(property.Name)) throw Broken(where);
            var value = property.Value;
            switch (property.Name)
            {
                case "type":
                    break;
                case "optional":
                    spec.Optional = ReadBool(value, where);
                    break;
                case "min" when extraKeys.Contains("min"):
                    spec.min = ReadLong(value, where);
                    break;
                case "max" when extraKeys.Contains("max"):
                    spec.max = ReadLong(value, where);
                    break;
                case "pattern" when extraKeys.Contains("pattern"):
                    spec.pattern = ReadPattern(value, where);
                    break;
                case "values" when extraKeys.Contains("values"):
                    spec.values = ReadValues(value, where);
                    break;
                case "items" when extraKeys.Contains("items"):
                    spec.items = Parse(value, where + "[]", allowPayload: false);
                    break;
                case "fields" when extraKeys.Contains("fields"):
                    spec.Fields = ParseFields(value, where, allowPayload: false);
                    break;
                case "of" when extraKeys.Contains("of"):
                    if (value.ValueKind != JsonValueKind.String || !JsonKinds.TryGetValue(value.GetString() ?? "", out var check)) throw Broken(where);
                    spec.of = check;
                    break;
                default:
                    throw Broken(where);
            }
        }

        if (spec.min.HasValue && spec.max.HasValue && spec.min.Value > spec.max.Value) throw Broken(where);
        if ((kind == "string" || kind == "array") && (spec.min < 0 || spec.max < 0)) throw Broken(where);
        if (kind == "enum" && spec.values == null) throw Broken(where);
        if (kind == "array" && spec.items == null) throw Broken(where);
        if ((kind == "object" || kind == "payload") && spec.Fields == null) throw Broken(where);
        return spec;
    }

    // ---- 값 검사 --------------------------------------------------------------------------------

    /// <summary>object의 칸들을 검사한다: 모르는 칸·같은 칸 두 번·빠진 칸이면 false.</summary>
    public static bool CheckObject(JsonElement value, Dictionary<string, FieldSpec> fields)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in value.EnumerateObject())
        {
            if (!seen.Add(property.Name)) return false;
            if (!fields.TryGetValue(property.Name, out var spec)) return false;
            if (!spec.Check(property.Value)) return false;
        }
        foreach (var pair in fields)
        {
            if (!pair.Value.Optional && !seen.Contains(pair.Key)) return false;
        }
        return true;
    }

    public bool Check(JsonElement value)
    {
        switch (Kind)
        {
            // 글자 칸은 Envelope.TryGetString으로 꺼낸다: 짝 없는 대리쌍 이스케이프면 false
            case "date":
                return Envelope.TryGetString(value, out var date) && TryParseDate(date, out _);
            case "month":
                return Envelope.TryGetString(value, out var month) && IsMonth(month);
            case "bool":
                return value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False;
            case "int":
                return value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) && InRange(number);
            case "string":
                return Envelope.TryGetString(value, out var text) && CheckString(text);
            case "enum":
                return Envelope.TryGetString(value, out var choice) && values!.Contains(choice);
            case "array":
                return value.ValueKind == JsonValueKind.Array && InRange(value.GetArrayLength())
                    && value.EnumerateArray().All(item => items!.Check(item));
            case "object":
                return CheckObject(value, Fields!);
            case "json":
                return of == null || of(value);
            default:
                // payload는 보내는 명령의 맨 위 칸에만 있고 CommandTable.Validate가 따로 푼다
                return false;
        }
    }

    public static bool TryParseDate(string? text, out DateTime date)
    {
        date = default;
        return text != null && DateShape.IsMatch(text)
            && DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private static bool IsMonth(string? text) =>
        text != null && MonthShape.IsMatch(text)
        && DateTime.TryParseExact(text, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private bool InRange(long number) => (!min.HasValue || number >= min.Value) && (!max.HasValue || number <= max.Value);

    private bool CheckString(string text)
    {
        if (!InRange(text.Length) || !IsWellFormedUtf16(text)) return false;
        if (pattern == null) return true;
        // 글자 전체가 맞아야 한다(.NET의 $는 끝 줄바꿈 앞에서도 맞으므로 위치·길이로 확인)
        var match = pattern.Match(text);
        return match.Success && match.Index == 0 && match.Length == text.Length;
    }

    internal static bool IsWellFormedUtf16(string text)
    {
        for (var i = 0; i < text.Length; i++)
        {
            if (char.IsHighSurrogate(text[i]))
            {
                if (i + 1 >= text.Length || !char.IsLowSurrogate(text[i + 1])) return false;
                i++;
            }
            else if (char.IsLowSurrogate(text[i]))
            {
                return false;
            }
        }
        return true;
    }

    // ---- 표 읽기 도우미 ----------------------------------------------------------------------------

    private static bool ReadBool(JsonElement value, string where) =>
        value.ValueKind == JsonValueKind.True || (value.ValueKind == JsonValueKind.False ? false : throw Broken(where));

    private static long ReadLong(JsonElement value, string where) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) ? number : throw Broken(where);

    private static Regex ReadPattern(JsonElement value, string where)
    {
        if (value.ValueKind != JsonValueKind.String) throw Broken(where);
        try
        {
            return new Regex(value.GetString() ?? "", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
        }
        catch (ArgumentException)
        {
            throw Broken(where);
        }
    }

    private static HashSet<string> ReadValues(JsonElement value, string where)
    {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() == 0) throw Broken(where);
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || !set.Add(item.GetString() ?? "")) throw Broken(where);
        }
        return set;
    }

    internal static InvalidDataException Broken(string where) => new InvalidDataException("명령 표가 틀렸다: " + where);
}
