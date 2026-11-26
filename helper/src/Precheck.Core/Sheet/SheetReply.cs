using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Precheck.Core.Sheet;

/// <summary>
/// 구글 코드 답 읽기(spec google-link TASK-9, AC-8510.5). 비트시트 WebAppClient.Parse를 옮기되 숫자·참거짓·칸 주소('23!J9' 꼴, 20개까지)와
/// 모양을 본 파일 id·판·원본 이름·gid·mac만 남긴다(fileUrl·error 글은 버림). 오류 답은 design.md 9-3 번호 하나(SheetException)로 바꾼다.
/// </summary>
public static class SheetReply
{
    public const int MaxCells = 20;
    public const int MaxMonths = 13;
    public const int MaxTitle = 200;

    /// <summary>이 판부터 hello·months를 안다(7판 비트시트 코드는 모른다).</summary>
    public const int HelloVersion = 8;

    private const RegexOptions Plain = RegexOptions.CultureInvariant;
    private static readonly Regex CellShape = new Regex(@"^[^!]{1,31}![A-Z]{1,3}[0-9]{1,4}\z", Plain);
    private static readonly Regex FileIdShape = new Regex(@"^[A-Za-z0-9_-]{20,100}\z", Plain);
    private static readonly Regex VersionShape = new Regex(@"^[0-9]{1,4}\z", Plain);
    private static readonly Regex MacShape = new Regex(@"^[A-Za-z0-9_-]{16,128}\z", Plain);
    private static readonly Regex MonthShape = new Regex(@"^[0-9]{4}-(0[1-9]|1[0-2])\z", Plain);
    private static readonly Regex DayShape = new Regex(@"^([1-9]|[12][0-9]|3[01])\z", Plain);

    /// <summary>
    /// 답 글 → 결과. JSON 객체가 아니면(로그인·안내 화면 HTML 등) E-GSHEET-LOGIN, ok가 참이 아니면 code에 맞는 번호.
    /// action(write·ping·months·hello)은 옛 판 코드를 알아보는 데 쓴다: months의 bad_request·hello의 bad_token은 7판이 그 action을 몰라서 낸 것.
    /// </summary>
    public static WebAppReply Parse(string? body, string action = "write")
    {
        var text = (body ?? "").Trim();
        if (text.Length == 0 || text[0] != '{') throw new SheetException(SheetErrors.Login);
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(text);
        }
        catch (JsonException)
        {
            throw new SheetException(SheetErrors.Login);
        }
        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new SheetException(SheetErrors.Login);
            if (!Bool(root, "ok")) throw new SheetException(ErrorCode(Str(root, "code"), action));

            var r = new WebAppReply
            {
                Ok = true,
                FileId = Shaped(root, "fileId", FileIdShape),
                Created = Bool(root, "created"),
                Added = Int(root, "added"),
                Filled = Int(root, "filled"),
                Overwritten = Int(root, "overwritten"),
                Skipped = Int(root, "skipped"),
                Full = Bool(root, "full"),
                CancelCleared = Int(root, "cancelCleared"),
                CancelKept = Int(root, "cancelKept"),
                FreeFixed = Int(root, "freeFixed"),
                Inserted = Int(root, "inserted"),
                Cleaned = Int(root, "cleaned"),
                TemplateTitle = Title(Str(root, "templateTitle")),
                Version = Shaped(root, "version", VersionShape),
                ShareFailed = Int(root, "shareFailed"),
                SheetGid = Long(root, "sheetGid"),
                HasSheetGid = root.TryGetProperty("sheetGid", out var gid) && gid.ValueKind == JsonValueKind.Number && gid.TryGetInt64(out var g) && g >= 0,
                Mac = Shaped(root, "mac", MacShape),
            };
            if (root.TryGetProperty("ratioFormulas", out var ratio) && ratio.ValueKind == JsonValueKind.Object)
            {
                r.RatioFixed = Int(ratio, "fixed");
                r.RatioSkipped = Int(ratio, "skippedCount");
                r.RatioFailed = Bool(ratio, "failed");
                if (ratio.TryGetProperty("skipped", out var cells) && cells.ValueKind == JsonValueKind.Array)
                {
                    r.RatioSkippedCells = cells.EnumerateArray()
                        .Where(c => c.ValueKind == JsonValueKind.String)
                        .Select(c => c.GetString() ?? "")
                        .Where(IsCell)
                        .Take(MaxCells)
                        .ToList();
                }
            }
            if (root.TryGetProperty("months", out var months) && months.ValueKind == JsonValueKind.Array)
            {
                foreach (var m in months.EnumerateArray())
                {
                    if (r.Months.Count >= MaxMonths) break;
                    var month = Month(m);
                    if (month != null) r.Months.Add(month);
                }
            }
            if ((action == "hello" || action == "months") && !KnowsHello(r.Version)) throw new SheetException(SheetErrors.Old);
            return r;
        }
    }

    /// <summary>칸 주소 'sheet!A1' 꼴(시트 이름 31자까지·제어 글자 없음, 칸 A~ZZZ, 줄 1~9999)인가.</summary>
    public static bool IsCell(string? cell) => cell != null && CellShape.IsMatch(cell) && !cell.Any(char.IsControl);

    /// <summary>구글 코드 오류 code → design.md 9-3 번호 하나.</summary>
    public static string ErrorCode(string? code, string? action)
    {
        var c = (code ?? "").Trim();
        if (action == "hello" && c == "bad_token") return SheetErrors.Old; // 7판은 hello를 몰라 token 검사에서 막는다
        if (action == "months" && c == "bad_request") return SheetErrors.Old; // 7판은 months를 몰라 action 검사에서 막는다
        switch (c)
        {
            case "token_not_set": return SheetErrors.NoKey;
            case "bad_token": return SheetErrors.Key;
            case "busy": return SheetErrors.Busy;
            case "template": return SheetErrors.Template;
            case "folder": return SheetErrors.Folder;
            case "no_sheet": return SheetErrors.Day;
            case "layout": return SheetErrors.Layout;
            case "bad_request": return SheetErrors.Shape;
            default: return SheetErrors.Failed; // clean·google·모름
        }
    }

    /// <summary>판 글자가 hello·months를 아는 8판 이상인가(옛 7판·판 없음이면 거짓 — sheet.fill 답의 oldCode).</summary>
    public static bool IsCurrent(string? version) => KnowsHello(version ?? "");

    private static bool KnowsHello(string version) =>
        int.TryParse(version, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var v) && v >= HelloVersion;

    private static SheetMonth? Month(JsonElement m)
    {
        if (m.ValueKind != JsonValueKind.Object) return null;
        var ym = Str(m, "ym");
        if (!MonthShape.IsMatch(ym)) return null;
        var month = new SheetMonth { Ym = ym, FileId = Shaped(m, "fileId", FileIdShape) };
        if (m.TryGetProperty("gids", out var gids) && gids.ValueKind == JsonValueKind.Object)
        {
            foreach (var g in gids.EnumerateObject())
            {
                if (!DayShape.IsMatch(g.Name) || g.Value.ValueKind != JsonValueKind.Number || !g.Value.TryGetInt64(out var gid) || gid < 0) continue;
                month.Gids[int.Parse(g.Name, System.Globalization.CultureInfo.InvariantCulture)] = gid;
            }
        }
        return month;
    }

    private static string Title(string text)
    {
        var clean = new string(text.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (clean.Length <= MaxTitle) return clean;
        var cut = char.IsHighSurrogate(clean[MaxTitle - 1]) ? MaxTitle - 1 : MaxTitle;
        return clean.Substring(0, cut);
    }

    private static string Shaped(JsonElement e, string name, Regex shape)
    {
        var v = Str(e, name);
        return shape.IsMatch(v) ? v : "";
    }

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

    private static bool Bool(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    private static int Int(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) && n >= 0 ? n : 0;

    private static long Long(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) && n >= 0 ? n : 0;
}
