using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;

namespace Precheck.Core.Sheet;

/// <summary>
/// 웹 설정 JSON(design.md 10-2 GsheetSettings) ↔ 비트시트 Settings(spec google-link TASK-9, AC-8510.2).
/// 없는 칸은 비트시트 기본값, 그 뒤 비트시트 Normalize로 깨진 값을 고친다. 주소·메일·비밀 글자 열쇠는 받지 않는다(그 PC sheet.dat에만).
/// </summary>
public static class SheetSettingsJson
{
    /// <summary>설정 JSON 크기 한도(design.md 9-2: 16KB까지).</summary>
    public const int MaxBytes = 16 * 1024;

    /// <summary>웹 설정에 있으면 거절하는 열쇠(주소·메일·비밀 글자는 웹에서 오지 않는다).</summary>
    private static readonly string[] Refused = { "url", "scriptUrl", "webAppUrl", "shareWith", "token", "secret" };

    private static readonly IReadOnlyList<KeyValuePair<string, FreeRule>> FreeNames = new[]
    {
        new KeyValuePair<string, FreeRule>("discount", FreeRule.DiscountFree),
        new KeyValuePair<string, FreeRule>("paid-zero", FreeRule.OwedNotPaid),
        new KeyValuePair<string, FreeRule>("nhis-zero", FreeRule.OwnZeroInsured),
        new KeyValuePair<string, FreeRule>("own-zero", FreeRule.OwnZeroAny),
        new KeyValuePair<string, FreeRule>("total-zero", FreeRule.TotalZero),
        new KeyValuePair<string, FreeRule>("none", FreeRule.None),
    };

    private static readonly int[] DefaultCar = { 21, 22 };
    private static readonly int[] DefaultAid = { 51, 52 };

    /// <summary>웹 설정 JSON 글 → Settings. 모양이 틀리면 E-HELPER-BAD-MESSAGE.</summary>
    public static Settings Parse(string? json)
    {
        if (json == null || json.Length == 0 || Encoding.UTF8.GetByteCount(json) > MaxBytes) throw Bad();
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            throw Bad();
        }
        using (doc) return FromElement(doc.RootElement);
    }

    /// <summary>명령 args의 settings 칸(이미 읽은 JSON) → Settings.</summary>
    public static Settings FromElement(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || Encoding.UTF8.GetByteCount(root.GetRawText()) > MaxBytes) throw Bad();
        foreach (var name in Refused)
        {
            if (root.TryGetProperty(name, out _)) throw Bad();
        }
        var s = new Settings();
        var c = s.Columns;
        var g = s.Signs;
        bool? noteCar = null, noteAid = null;
        foreach (var p in root.EnumerateObject())
        {
            var v = p.Value;
            switch (p.Name)
            {
                case "templateUrl": s.TemplateUrl = Str(v); break;
                case "namePattern": s.FileNamePattern = Str(v); break;
                case "hospitalLabel": s.HospitalName = Str(v); break;
                case "folderUrl": s.FolderUrl = Str(v); break;
                case "firstRow": s.FirstRow = Int(v); break;
                case "lastRow": s.LastRow = Int(v); break;
                case "cols": Columns(v, c); break;
                case "markValue": s.MarkValue = Str(v); break;
                case "signs": Signs(v, g); break;
                case "shiftCols": s.ShiftCols = Str(v); break;
                case "staffCols": s.StaffCols = Strs(v); break;
                case "bitHospital": s.HospitalCode = Str(v); break;
                case "deptRooms": s.DeptRooms = Rooms(v); break;
                case "deptRoomsHospital": s.DeptRoomsHospital = Str(v); break;
                case "firstKinds": s.FirstVisitKinds = Strs(v); break;
                case "day90Kinds": s.Day90Kinds = Strs(v); break;
                case "blockCodes": s.BlockCodes = Strs(v); break;
                case "therapyCodes": s.TherapyCodes = Strs(v); break;
                case "free": s.Free = FreeOf(Str(v)); break;
                case "freeInsurance": s.FreeInsurance = Ints(v); break;
                case "carInsurance": s.CarInsurance = Ints(v); break;
                case "aidInsurance": s.AidInsurance = Ints(v); break;
                case "noteCar": noteCar = Flag(v); break;
                case "noteAid": noteAid = Flag(v); break;
                case "autoOn": s.IntervalEnabled = Flag(v); break;
                case "everyMin": s.IntervalMinutes = Int(v); break;
                case "from": s.HoursStart = Str(v); break;
                case "to": s.HoursEnd = Str(v); break;
                case "eveningOn": s.EveningEnabled = Flag(v); break;
                case "evening": s.EveningTime = Str(v); break;
                default: break; // 모르는 칸은 본다(웹이 먼저 판을 올려도 넣기는 된다)
            }
        }
        // 비고 두 글 켜기·끄기: 끄면 그 보험 코드를 비운다(비트시트 RowBuilder는 코드가 없으면 그 글을 넣지 않는다)
        if (noteCar == false) s.CarInsurance = new List<int>();
        else if (s.CarInsurance.Count == 0) s.CarInsurance = DefaultCar.ToList();
        if (noteAid == false) s.AidInsurance = new List<int>();
        else if (s.AidInsurance.Count == 0) s.AidInsurance = DefaultAid.ToList();
        s.Normalize();
        s.Version = Settings.CurrentVersion;
        return s;
    }

    /// <summary>Settings → 웹 설정 JSON(design.md 10-2 차례, 주소·메일·비밀 글자 없음). 가져오기 답과 시험에 쓴다.</summary>
    public static string ToJson(Settings settings)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        var s = settings;
        var c = s.Columns ?? new ColumnSettings();
        var g = s.Signs ?? new SignSettings();
        var car = s.CarInsurance ?? new List<int>();
        var aid = s.AidInsurance ?? new List<int>();
        var buffer = new MemoryStream();
        using (var w = new Utf8JsonWriter(buffer, Envelope.WriterOptions))
        {
            w.WriteStartObject();
            w.WriteString("templateUrl", s.TemplateUrl ?? "");
            w.WriteString("namePattern", s.FileNamePattern ?? "");
            w.WriteString("hospitalLabel", s.HospitalName ?? "");
            w.WriteString("folderUrl", s.FolderUrl ?? "");
            w.WriteNumber("firstRow", s.FirstRow);
            w.WriteNumber("lastRow", s.LastRow);
            w.WriteStartObject("cols");
            w.WriteString("key", ColumnSettings.Norm(c.Key));
            w.WriteString("name", ColumnSettings.Norm(c.Name));
            w.WriteString("sign", ColumnSettings.Norm(c.Sign));
            w.WriteString("amount", ColumnSettings.Norm(c.Amount));
            w.WriteString("room", ColumnSettings.Norm(c.Room));
            w.WriteString("first", ColumnSettings.Norm(c.First));
            w.WriteString("day90", ColumnSettings.Norm(c.Day90));
            w.WriteString("block", ColumnSettings.Norm(c.Block));
            w.WriteString("therapy", ColumnSettings.Norm(c.Therapy));
            w.WriteString("note", ColumnSettings.Norm(c.Note));
            w.WriteEndObject();
            w.WriteString("markValue", s.MarkValue ?? "");
            w.WriteStartObject("signs");
            w.WriteNumber("cash", g.Cash);
            w.WriteNumber("card", g.Card);
            w.WriteNumber("recvCash", g.ReceivableCash);
            w.WriteNumber("recvCard", g.ReceivableCard);
            w.WriteNumber("transfer", g.Transfer);
            w.WriteNumber("recvTransfer", g.ReceivableTransfer);
            w.WriteNumber("free", g.Free);
            w.WriteEndObject();
            w.WriteString("shiftCols", s.ShiftCols ?? "");
            WriteStrings(w, "staffCols", s.StaffCols);
            w.WriteString("bitHospital", s.HospitalCode ?? "");
            w.WriteStartObject("deptRooms");
            foreach (var room in (s.DeptRooms ?? new Dictionary<string, int>()).OrderBy(p => p.Key, NaturalCode.Instance))
            {
                w.WriteNumber(room.Key, room.Value);
            }
            w.WriteEndObject();
            w.WriteString("deptRoomsHospital", s.DeptRoomsHospital ?? "");
            WriteStrings(w, "firstKinds", s.FirstVisitKinds);
            WriteStrings(w, "day90Kinds", s.Day90Kinds);
            WriteStrings(w, "blockCodes", s.BlockCodes);
            WriteStrings(w, "therapyCodes", s.TherapyCodes);
            w.WriteString("free", NameOf(s.Free));
            WriteInts(w, "freeInsurance", s.FreeInsurance);
            // 비트시트에서 보험 코드를 비웠으면 = 그 비고를 끈 것. 켜면 기본 코드로 다시 켠다
            WriteInts(w, "carInsurance", car.Count > 0 ? car : DefaultCar.ToList());
            WriteInts(w, "aidInsurance", aid.Count > 0 ? aid : DefaultAid.ToList());
            w.WriteBoolean("noteCar", car.Count > 0);
            w.WriteBoolean("noteAid", aid.Count > 0);
            w.WriteBoolean("autoOn", s.IntervalEnabled);
            w.WriteNumber("everyMin", s.IntervalMinutes);
            w.WriteString("from", s.HoursStart ?? "");
            w.WriteString("to", s.HoursEnd ?? "");
            w.WriteBoolean("eveningOn", s.EveningEnabled);
            w.WriteString("evening", s.EveningTime ?? "");
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// 넣기 전에 막는 까닭(비트시트와 같은 차례): 주소 없음 → 주소 꼴 → 원본 시트 없음 → 비밀 글자 → 칸 글자. 없으면 null.
    /// url·secret은 그 PC sheet.dat 값이다.
    /// </summary>
    public static string? Blocker(Settings settings, string? url, string? secret)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        if (string.IsNullOrWhiteSpace(url)) return SheetErrors.NoUrl;
        if (!SheetUrls.IsScriptUrl(url)) return SheetErrors.Url;
        if (GoogleIds.Spreadsheet(settings.TemplateUrl).Length == 0) return SheetErrors.NoTemplate;
        if (!SheetCode.IsValidSecret(secret)) return SheetErrors.Secret;
        if (settings.Columns == null || !settings.Columns.IsValid(out _)) return SheetErrors.Layout;
        return null;
    }

    public static string NameOf(FreeRule rule)
    {
        foreach (var pair in FreeNames)
        {
            if (pair.Value == rule) return pair.Key;
        }
        return "discount";
    }

    private static FreeRule FreeOf(string text)
    {
        foreach (var pair in FreeNames)
        {
            if (string.Equals(pair.Key, text, StringComparison.Ordinal)) return pair.Value;
        }
        throw Bad();
    }

    private static void Columns(JsonElement v, ColumnSettings c)
    {
        if (v.ValueKind != JsonValueKind.Object) throw Bad();
        foreach (var p in v.EnumerateObject())
        {
            switch (p.Name)
            {
                case "key": c.Key = Str(p.Value); break;
                case "name": c.Name = Str(p.Value); break;
                case "sign": c.Sign = Str(p.Value); break;
                case "amount": c.Amount = Str(p.Value); break;
                case "room": c.Room = Str(p.Value); break;
                case "first": c.First = Str(p.Value); break;
                case "day90": c.Day90 = Str(p.Value); break;
                case "block": c.Block = Str(p.Value); break;
                case "therapy": c.Therapy = Str(p.Value); break;
                case "note": c.Note = Str(p.Value); break;
                default: break;
            }
        }
    }

    private static void Signs(JsonElement v, SignSettings g)
    {
        if (v.ValueKind != JsonValueKind.Object) throw Bad();
        foreach (var p in v.EnumerateObject())
        {
            switch (p.Name)
            {
                case "cash": g.Cash = Int(p.Value); break;
                case "card": g.Card = Int(p.Value); break;
                case "recvCash": g.ReceivableCash = Int(p.Value); break;
                case "recvCard": g.ReceivableCard = Int(p.Value); break;
                case "transfer": g.Transfer = Int(p.Value); break;
                case "recvTransfer": g.ReceivableTransfer = Int(p.Value); break;
                case "free": g.Free = Int(p.Value); break;
                default: break;
            }
        }
    }

    private static Dictionary<string, int> Rooms(JsonElement v)
    {
        if (v.ValueKind != JsonValueKind.Object) throw Bad();
        var rooms = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in v.EnumerateObject()) rooms[p.Name] = Int(p.Value);
        return rooms;
    }

    private static string Str(JsonElement v) => v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : throw Bad();

    private static bool Flag(JsonElement v) =>
        v.ValueKind == JsonValueKind.True ? true : v.ValueKind == JsonValueKind.False ? false : throw Bad();

    private static int Int(JsonElement v) => v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : throw Bad();

    private static List<string> Strs(JsonElement v)
    {
        if (v.ValueKind != JsonValueKind.Array) throw Bad();
        return v.EnumerateArray().Select(Str).ToList();
    }

    private static List<int> Ints(JsonElement v)
    {
        if (v.ValueKind != JsonValueKind.Array) throw Bad();
        return v.EnumerateArray().Select(Int).ToList();
    }

    private static void WriteStrings(Utf8JsonWriter w, string name, IEnumerable<string>? values)
    {
        w.WriteStartArray(name);
        foreach (var value in values ?? Enumerable.Empty<string>()) w.WriteStringValue(value ?? "");
        w.WriteEndArray();
    }

    private static void WriteInts(Utf8JsonWriter w, string name, IEnumerable<int>? values)
    {
        w.WriteStartArray(name);
        foreach (var value in values ?? Enumerable.Empty<int>()) w.WriteNumberValue(value);
        w.WriteEndArray();
    }

    private static SheetException Bad() => new SheetException(ErrorCodes.BadMessage);
}
