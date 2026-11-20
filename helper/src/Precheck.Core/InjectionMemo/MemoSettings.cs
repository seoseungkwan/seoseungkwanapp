using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 주사 차수 단축키·단추 자리(AC-7504.1). 파일은 %LOCALAPPDATA%\PtSlip\memo-settings.json(쓰고 읽기는 윈도우 층 MemoSettingsFile),
/// PT 종이 settings.json과 따로 둔다. 환자 값은 담지 않는다.
/// </summary>
public sealed class MemoSettings
{
    public const string FileName = "memo-settings.json";

    /// <summary>단추 자리 -400~400px(+는 오른쪽으로, 설정 창 ◀ ▶ 한 번에 ButtonOffsetStep).</summary>
    public const int MaxButtonOffset = 400;

    public const int ButtonOffsetStep = 20;

    /// <summary>고를 수 있는 단축키(비트가 쓰는 F1·F2·F3·F5·F6·F7·F9·F12 빼고).</summary>
    public static IReadOnlyList<string> AllowedKeys { get; } = new[] { "F4", "F8", "F10", "F11" };

    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Indented = false,
    };

    /// <summary>값이 규칙 밖이면 ArgumentException.</summary>
    public MemoSettings(string hotKey, int buttonOffsetPx)
    {
        if (!IsAllowedKey(hotKey)) throw new ArgumentException("hot key must be F4, F8, F10 or F11", nameof(hotKey));
        if (!IsButtonOffset(buttonOffsetPx)) throw new ArgumentException("button offset must be -400..400", nameof(buttonOffsetPx));
        HotKey = hotKey;
        ButtonOffsetPx = buttonOffsetPx;
    }

    /// <summary>설정이 없을 때: 단축키 F8, 단추 자리 0.</summary>
    public static MemoSettings Defaults { get; } = new MemoSettings("F8", 0);

    public string HotKey { get; }

    public int ButtonOffsetPx { get; }

    /// <summary>F4·F8·F10·F11 글자와 똑같은가(대소문자·빈칸까지).</summary>
    public static bool IsAllowedKey(string? key) => key != null && AllowedKeys.Contains(key, StringComparer.Ordinal);

    /// <summary>단추 자리 -400~400px.</summary>
    public static bool IsButtonOffset(int px) => px >= -MaxButtonOffset && px <= MaxButtonOffset;

    /// <summary>설정 → 파일 글 {"hotKey":"F8","buttonOffset":0} (한 줄).</summary>
    public string ToJson()
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("hotKey", HotKey);
            writer.WriteNumber("buttonOffset", ButtonOffsetPx);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    /// <summary>파일 글 → 설정. 파일이 없거나(null) 깨졌거나 한 칸이라도 없거나 규칙에 어긋나면 기본값(모르는 칸은 무시).</summary>
    public static MemoSettings FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Defaults;
        try
        {
            using var document = JsonDocument.Parse(json!);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return Defaults;
            if (!root.TryGetProperty("hotKey", out var key) || key.ValueKind != JsonValueKind.String) return Defaults;
            if (!root.TryGetProperty("buttonOffset", out var offset) || offset.ValueKind != JsonValueKind.Number || !offset.TryGetInt32(out var px)) return Defaults;
            var hotKey = key.GetString();
            return IsAllowedKey(hotKey) && IsButtonOffset(px) ? new MemoSettings(hotKey!, px) : Defaults;
        }
        catch (JsonException)
        {
            return Defaults;
        }
    }
}
