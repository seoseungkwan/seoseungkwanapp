using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Precheck.Core.PtSlip;

/// <summary>
/// PT 후 진료 종이 프로그램의 설정(spec pt-slip REQ-6401): 항목·부위 목록, 프린터 이름(빈칸이면 BIXOLON 든 첫 프린터),
/// 종이 길이(mm), 버튼 자리(px, +는 왼쪽으로). 규칙 검사는 SlipSettingsRules가 한다. 환자 값은 담지 않는다.
/// </summary>
public sealed class SlipSettings
{
    public SlipSettings(IEnumerable<string> items, IEnumerable<string> parts, string printerName, int paperLengthMm, int buttonOffsetPx)
    {
        Items = (items ?? Enumerable.Empty<string>()).ToArray();
        Parts = (parts ?? Enumerable.Empty<string>()).ToArray();
        PrinterName = printerName ?? "";
        PaperLengthMm = paperLengthMm;
        ButtonOffsetPx = buttonOffsetPx;
    }

    /// <summary>처음 값(AC-6401.1): 시안 메모의 처음 목록, 프린터 빈칸, 종이 60mm, 버튼 자리 0.</summary>
    public static SlipSettings Defaults { get; } = new SlipSettings(
        new[] { "HP", "ICE", "ICT", "초음파", "레이저", "견인", "도수", "충격파" },
        new[] { "목", "어깨", "팔꿈치", "손목", "허리", "골반", "무릎", "발목" },
        "",
        60,
        0);

    public IReadOnlyList<string> Items { get; }

    public IReadOnlyList<string> Parts { get; }

    public string PrinterName { get; }

    public int PaperLengthMm { get; }

    public int ButtonOffsetPx { get; }
}

/// <summary>목록 종류. 부위 목록에는 쪽 이름(오른·왼·양)을 넣을 수 없다.</summary>
public enum SlipListKind
{
    Items,
    Parts,
}

/// <summary>목록 글 읽은 결과. Ok면 Names(정리한 이름들)·Error 빈칸, 아니면 Names 빈 목록·Error에 사람이 읽을 글.</summary>
public sealed class SlipListParse
{
    public SlipListParse(bool ok, IReadOnlyList<string> names, string error)
    {
        Ok = ok;
        Names = names ?? Array.Empty<string>();
        Error = error ?? "";
    }

    public bool Ok { get; }

    public IReadOnlyList<string> Names { get; }

    public string Error { get; }
}

/// <summary>설정 규칙(AC-6401.2)과 설정 파일 글(JSON, AC-6401.3).</summary>
public static class SlipSettingsRules
{
    public const int MaxNameLength = 10;
    public const int MaxNames = 16;
    public const int MinPaperMm = 40;
    public const int MaxPaperMm = 150;
    public const int MaxButtonOffset = 400;
    public const int ButtonOffsetStep = 20;

    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Indented = false,
    };

    /// <summary>
    /// 한 줄에 하나인 목록 글 → 이름들. 앞뒤 빈칸을 빼고 빈 줄·겹친 이름(처음 것만 남김)은 뺀다.
    /// 1~10글자 아님·쉼표·(부위) 오른/왼/양인 줄은 사용자가 본 줄 번호(1부터)와 함께 거절하고, 남은 이름이 1~16개가 아니면 거절한다.
    /// </summary>
    public static SlipListParse ParseList(string text, SlipListKind kind)
    {
        var lines = (text ?? "").Split(new[] { "\r\n", "\n", "\r" }, StringSplitOptions.None);
        var names = new List<string>();
        for (var i = 0; i < lines.Length; i++)
        {
            var name = lines[i].Trim();
            if (name.Length == 0) continue;
            var error = LineError(name, kind, i + 1);
            if (error != null) return Fail(error);
            if (!names.Contains(name, StringComparer.Ordinal)) names.Add(name);
        }
        if (names.Count < 1 || names.Count > MaxNames) return Fail("1~16개까지 넣을 수 있어요");
        return new SlipListParse(true, names.ToArray(), "");
    }

    /// <summary>목록 → 설정 창 글 상자 글(한 줄에 하나, 줄 끝 \r\n).</summary>
    public static string ListText(IEnumerable<string> list) => string.Join("\r\n", list ?? Enumerable.Empty<string>());

    /// <summary>종이 길이 40~150mm.</summary>
    public static bool IsPaperLength(int mm) => mm >= MinPaperMm && mm <= MaxPaperMm;

    /// <summary>버튼 자리 -400~400px, 20px 단위(설정 창 ◀ ▶ 한 번에 20px).</summary>
    public static bool IsButtonOffset(int px) => px >= -MaxButtonOffset && px <= MaxButtonOffset && px % ButtonOffsetStep == 0;

    /// <summary>설정 → 파일 글 {"items":[],"parts":[],"printer":"","paperMm":60,"buttonOffset":0} (한 줄).</summary>
    public static string ToJson(SlipSettings settings)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, WriterOptions))
        {
            writer.WriteStartObject();
            WriteList(writer, "items", settings.Items);
            WriteList(writer, "parts", settings.Parts);
            writer.WriteString("printer", settings.PrinterName);
            writer.WriteNumber("paperMm", settings.PaperLengthMm);
            writer.WriteNumber("buttonOffset", settings.ButtonOffsetPx);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    /// <summary>파일 글 → 설정. 파일이 없거나(null) 깨졌거나 한 칸이라도 규칙에 어긋나면 기본값(모르는 칸은 무시).</summary>
    public static SlipSettings FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return SlipSettings.Defaults;
        try
        {
            using var document = JsonDocument.Parse(json!);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return SlipSettings.Defaults;
            var items = ReadList(root, "items", SlipListKind.Items);
            var parts = ReadList(root, "parts", SlipListKind.Parts);
            if (items == null || parts == null) return SlipSettings.Defaults;
            if (!root.TryGetProperty("printer", out var printer) || printer.ValueKind != JsonValueKind.String) return SlipSettings.Defaults;
            if (!ReadInt(root, "paperMm", out var paperMm) || !IsPaperLength(paperMm)) return SlipSettings.Defaults;
            if (!ReadInt(root, "buttonOffset", out var buttonOffset) || !IsButtonOffset(buttonOffset)) return SlipSettings.Defaults;
            return new SlipSettings(items, parts, printer.GetString() ?? "", paperMm, buttonOffset);
        }
        catch (JsonException)
        {
            return SlipSettings.Defaults;
        }
    }

    private static SlipListParse Fail(string error) => new SlipListParse(false, Array.Empty<string>(), error);

    private static string? LineError(string name, SlipListKind kind, int lineNumber)
    {
        if (name.Length > MaxNameLength) return lineNumber + "번째 줄은 1~10글자로 써 주세요";
        if (name.IndexOf(',') >= 0) return lineNumber + "번째 줄에 쉼표(,)는 쓸 수 없어요";
        if (kind == SlipListKind.Parts && SlipPicks.Sides.Contains(name, StringComparer.Ordinal)) return lineNumber + "번째 줄: 오른·왼·양은 부위 이름으로 쓸 수 없어요";
        return null;
    }

    private static void WriteList(Utf8JsonWriter writer, string key, IEnumerable<string> list)
    {
        writer.WriteStartArray(key);
        foreach (var name in list) writer.WriteStringValue(name);
        writer.WriteEndArray();
    }

    /// <summary>글 배열이고, 목록 규칙으로 정리해도 그대로인 것(앞뒤 빈칸·빈 이름·겹침·줄바꿈이 없음)만.</summary>
    private static string[]? ReadList(JsonElement root, string key, SlipListKind kind)
    {
        if (!root.TryGetProperty(key, out var array) || array.ValueKind != JsonValueKind.Array) return null;
        var names = new List<string>();
        foreach (var element in array.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.String) return null;
            names.Add(element.GetString() ?? "");
        }
        var parsed = ParseList(string.Join("\n", names), kind);
        return parsed.Ok && parsed.Names.SequenceEqual(names, StringComparer.Ordinal) ? names.ToArray() : null;
    }

    private static bool ReadInt(JsonElement root, string key, out int value)
    {
        value = 0;
        return root.TryGetProperty(key, out var number) && number.ValueKind == JsonValueKind.Number && number.TryGetInt32(out value);
    }
}
