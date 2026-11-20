using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Precheck.Core.DocPrint;

/// <summary>묶음 하나: 이름과 서류들(겹침 없이 서류 차례로 정리해 둔다). 이름 정리·검사는 DocSettingsRules.Check가 한다.</summary>
public sealed class DocBundle
{
    public DocBundle(string name, IEnumerable<DocKind> kinds)
    {
        Name = name ?? "";
        Kinds = DocNames.Normalize(kinds);
    }

    public string Name { get; }

    public IReadOnlyList<DocKind> Kinds { get; }
}

/// <summary>
/// 서류 인쇄 설정(spec doc-print AC-7401.1): 서류 프린터 이름(빈칸 = 윈도우 기본 프린터)과 묶음들.
/// PT 종이 설정(SlipSettings, settings.json)과 따로 doc-settings.json에 둔다. 환자 값은 담지 않는다.
/// </summary>
public sealed class DocSettings
{
    public DocSettings(string printerName, IEnumerable<DocBundle> bundles)
    {
        PrinterName = printerName ?? "";
        Bundles = (bundles ?? Enumerable.Empty<DocBundle>()).ToArray();
    }

    /// <summary>처음 값: 프린터 빈칸, 묶음 실손보험용 = [진료비 영수증, 진료비 세부내역서] 하나.</summary>
    public static DocSettings Defaults { get; } = new DocSettings("", new[] { new DocBundle("실손보험용", new[] { DocKind.Receipt, DocKind.Detail }) });

    public string PrinterName { get; }

    public IReadOnlyList<DocBundle> Bundles { get; }
}

/// <summary>묶음 검사 결과. Ok면 Bundles(이름 앞뒤 빈칸을 뺀 묶음들)·Error 빈칸, 아니면 Bundles 빈 목록·Error에 사람이 읽을 글.</summary>
public sealed class BundleCheck
{
    public BundleCheck(bool ok, IReadOnlyList<DocBundle> bundles, string error)
    {
        Ok = ok;
        Bundles = bundles ?? Array.Empty<DocBundle>();
        Error = error ?? "";
    }

    public bool Ok { get; }

    public IReadOnlyList<DocBundle> Bundles { get; }

    public string Error { get; }
}

/// <summary>묶음 규칙(AC-7401.2)과 설정 파일 글(JSON, PT 종이 SlipSettingsRules와 같은 방식).</summary>
public static class DocSettingsRules
{
    public const int MaxNameLength = 10;
    public const int MaxBundles = 8;

    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Indented = false,
    };

    /// <summary>파일 글 안 서류 이름(바꾸지 않는다).</summary>
    private static readonly Dictionary<DocKind, string> Codes = new Dictionary<DocKind, string>
    {
        [DocKind.Receipt] = "receipt",
        [DocKind.Detail] = "detail",
        [DocKind.RxCopy] = "rxCopy",
        [DocKind.Chart] = "chart",
    };

    /// <summary>
    /// 묶음마다 차례대로: 이름 앞뒤 빈칸을 빼고 1~10글자, 앞 묶음과 이름이 겹치지 않음, 서류 1개 이상. 그다음 묶음 수 1~8개.
    /// 어긋나면 사용자가 본 차례(1부터)와 함께 거절한다.
    /// </summary>
    public static BundleCheck Check(IReadOnlyList<DocBundle>? bundles)
    {
        var list = bundles ?? Array.Empty<DocBundle>();
        var result = new List<DocBundle>();
        var names = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < list.Count; i++)
        {
            var number = i + 1;
            var bundle = list[i];
            var name = (bundle?.Name ?? "").Trim();
            if (bundle == null || name.Length < 1 || name.Length > MaxNameLength) return Fail(number + "번째 묶음 이름은 1~10글자로 써 주세요");
            if (!names.Add(name)) return Fail(number + "번째 묶음 이름이 앞 묶음과 같아요");
            if (bundle.Kinds.Count == 0) return Fail(number + "번째 묶음에 서류를 하나 이상 골라 주세요");
            result.Add(new DocBundle(name, bundle.Kinds));
        }
        if (result.Count < 1 || result.Count > MaxBundles) return Fail("묶음은 1~8개까지 만들 수 있어요");
        return new BundleCheck(true, result.ToArray(), "");
    }

    /// <summary>설정 → 파일 글 {"printer":"","bundles":[{"name":"실손보험용","kinds":["receipt","detail"]}]} (한 줄).</summary>
    public static string ToJson(DocSettings settings)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("printer", settings.PrinterName);
            writer.WriteStartArray("bundles");
            foreach (var bundle in settings.Bundles)
            {
                writer.WriteStartObject();
                writer.WriteString("name", bundle.Name);
                writer.WriteStartArray("kinds");
                foreach (var kind in bundle.Kinds) writer.WriteStringValue(Codes[kind]);
                writer.WriteEndArray();
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    /// <summary>파일 글 → 설정. 파일이 없거나(null) 깨졌거나 한 칸이라도 규칙에 어긋나면 기본값(모르는 칸은 무시).</summary>
    public static DocSettings FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return DocSettings.Defaults;
        try
        {
            using var document = JsonDocument.Parse(json!);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return DocSettings.Defaults;
            if (!root.TryGetProperty("printer", out var printer) || printer.ValueKind != JsonValueKind.String) return DocSettings.Defaults;
            if (!root.TryGetProperty("bundles", out var array) || array.ValueKind != JsonValueKind.Array) return DocSettings.Defaults;
            var bundles = new List<DocBundle>();
            foreach (var element in array.EnumerateArray())
            {
                var bundle = ReadBundle(element);
                if (bundle == null) return DocSettings.Defaults;
                bundles.Add(bundle);
            }
            var check = Check(bundles);
            return check.Ok ? new DocSettings(printer.GetString() ?? "", check.Bundles) : DocSettings.Defaults;
        }
        catch (JsonException)
        {
            return DocSettings.Defaults;
        }
    }

    private static BundleCheck Fail(string error) => new BundleCheck(false, Array.Empty<DocBundle>(), error);

    /// <summary>{"name":글,"kinds":[정해 둔 서류 이름, …]}만. 모르는 서류 이름이 하나라도 있으면 null.</summary>
    private static DocBundle? ReadBundle(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) return null;
        if (!element.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String) return null;
        if (!element.TryGetProperty("kinds", out var kinds) || kinds.ValueKind != JsonValueKind.Array) return null;
        var list = new List<DocKind>();
        foreach (var code in kinds.EnumerateArray())
        {
            if (code.ValueKind != JsonValueKind.String) return null;
            var text = code.GetString();
            var match = Codes.Where(pair => string.Equals(pair.Value, text, StringComparison.Ordinal)).Select(pair => (DocKind?)pair.Key).FirstOrDefault();
            if (match == null) return null;
            list.Add(match.Value);
        }
        return new DocBundle(name.GetString() ?? "", list);
    }
}
