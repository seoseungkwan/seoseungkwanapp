using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Reception;

/// <summary>어레인지 칸의 단계: 준비(todo) → 준비완료(ready, SONO·C-ARM만) → 완료(done). gone은 처방에서 온 칸을 표에서 뺀 것.</summary>
public enum ArrangeStep { Todo, Ready, Done, Gone }

/// <summary>칸 하나의 표시(AC-3304.2). det·part는 고르기 목록(ArrangeChoices)의 글, 시각은 "HH:MM".</summary>
public sealed class CellMark
{
    public CellMark(ArrangeStep st, bool manual, string det, string? part, string? readyAt, string? doneAt, string? addedAt)
    {
        St = st;
        Manual = manual;
        Det = det ?? throw new ArgumentNullException(nameof(det));
        Part = part;
        ReadyAt = readyAt;
        DoneAt = doneAt;
        AddedAt = addedAt;
    }

    public ArrangeStep St { get; }

    /// <summary>처방이 아니라 직접 넣은 칸.</summary>
    public bool Manual { get; }

    /// <summary>칸 글(PT의 ICE·HP 등). 처방 칸(X-RAY·SONO·C-ARM)은 "".</summary>
    public string Det { get; }

    /// <summary>SONO·C-ARM 부위. 다른 칸은 null.</summary>
    public string? Part { get; }

    public string? ReadyAt { get; }

    public string? DoneAt { get; }

    public string? AddedAt { get; }
}

/// <summary>PT 먼저(물리치료를 진료 전에): up(올라감)·down(내려옴)과 그 시각.</summary>
public sealed class PtFirst
{
    public PtFirst(string st, string at)
    {
        St = st ?? throw new ArgumentNullException(nameof(st));
        At = at ?? throw new ArgumentNullException(nameof(at));
    }

    public string St { get; }

    public string At { get; }
}

/// <summary>내원 하나의 어레인지 표시(AC-3304.2·AC-3304.5): 칸마다 표시, 자리비움 시각, PT 먼저, 치료 종료 시각, 수납완료 줄을 다시 넣음. 이름·차트번호·메모·증상은 없다.</summary>
public sealed class VisitMark
{
    private static readonly IReadOnlyDictionary<ArrangeCol, CellMark> NoCells =
        new ReadOnlyDictionary<ArrangeCol, CellMark>(new Dictionary<ArrangeCol, CellMark>());

    public VisitMark(IReadOnlyDictionary<ArrangeCol, CellMark>? cells = null, string? away = null, PtFirst? ptf = null, string? endedAt = null, bool kept = false)
    {
        Cells = cells == null || cells.Count == 0 ? NoCells : new ReadOnlyDictionary<ArrangeCol, CellMark>(cells.ToDictionary(p => p.Key, p => p.Value));
        Away = away;
        Ptf = ptf;
        EndedAt = endedAt;
        Kept = kept;
    }

    public IReadOnlyDictionary<ArrangeCol, CellMark> Cells { get; }

    /// <summary>자리비움 시각.</summary>
    public string? Away { get; }

    public PtFirst? Ptf { get; }

    /// <summary>[치료 종료] 시각.</summary>
    public string? EndedAt { get; }

    /// <summary>수납완료 줄을 [다시 넣기]함: 그날 다시 저절로 빠지지 않는다(AC-3305.10·AC-3306.7).</summary>
    public bool Kept { get; }

    /// <summary>표시가 하나도 없다(저장할 때 그 내원을 지운다).</summary>
    public bool IsEmpty => Cells.Count == 0 && Away == null && Ptf == null && EndedAt == null && !Kept;

    /// <summary>그 칸만 바꾼(null이면 지운) 새 표시.</summary>
    public VisitMark WithCell(ArrangeCol col, CellMark? cell)
    {
        var cells = Cells.ToDictionary(p => p.Key, p => p.Value);
        if (cell == null) cells.Remove(col);
        else cells[col] = cell;
        return new VisitMark(cells, Away, Ptf, EndedAt, Kept);
    }

    public VisitMark WithAway(string? away) => new VisitMark(Cells, away, Ptf, EndedAt, Kept);

    public VisitMark WithPtf(PtFirst? ptf) => new VisitMark(Cells, Away, ptf, EndedAt, Kept);

    public VisitMark WithEnded(string? endedAt) => new VisitMark(Cells, Away, Ptf, endedAt, Kept);

    public VisitMark WithKept(bool kept) => new VisitMark(Cells, Away, Ptf, EndedAt, kept);
}

/// <summary>
/// 고르기 목록(spec reception-arrange design.md 4절, AC-3304.4). 화면(reception/www/arrange.js의 CHOICES)과 쓰기 검사가 같은 글을 쓴다
/// (화면 시험이 이 파일의 글을 읽어 견준다). 부위 목록은 시안 그대로.
/// </summary>
public static class ArrangeChoices
{
    /// <summary>SONO·C-ARM 부위.</summary>
    public static IReadOnlyList<string> Parts { get; } = Array.AsReadOnly(new[]
    {
        "목", "등", "허리", "오른 어깨", "왼 어깨", "양 어깨", "팔꿈치", "손목", "고관절", "오른 무릎", "왼 무릎", "양 무릎", "발목", "발바닥", "기타",
    });

    /// <summary>SONO·C-ARM 직접 넣기에서 부위를 나중에 고른다(부위 null).</summary>
    public const string PartLater = "부위는 나중에";

    /// <summary>X-RAY 직접 넣기 글(칸 글은 "").</summary>
    public const string XrayShot = "X-ray 찍기";

    private static readonly IReadOnlyList<string> Pt = Array.AsReadOnly(new[] { "ICE", "HP" });
    private static readonly IReadOnlyList<string> Ds = Array.AsReadOnly(new[] { "30분", "50분" });
    private static readonly IReadOnlyList<string> Eswt = Array.AsReadOnly(new[] { "1부위", "2부위", "3부위", "4부위" });
    private static readonly IReadOnlyList<string> Trac = Array.AsReadOnly(new[] { "목", "허리" });
    private static readonly IReadOnlyList<string> None = Array.AsReadOnly(new string[0]);
    private static readonly IReadOnlyList<string> Xray = Array.AsReadOnly(new[] { XrayShot });
    private static readonly IReadOnlyList<string> PartsOrLater = Array.AsReadOnly(Parts.Concat(new[] { PartLater }).ToArray());

    /// <summary>빈 칸에 직접 넣을 때(add) 고르는 글.</summary>
    public static IReadOnlyList<string> AddOf(ArrangeCol col) => col switch
    {
        ArrangeCol.Xray => Xray,
        ArrangeCol.Sono => PartsOrLater,
        ArrangeCol.Carm => PartsOrLater,
        _ => DetailsOf(col),
    };

    /// <summary>칸에 남는 글(det). 처방 칸(X-RAY·SONO·C-ARM)은 빈 목록(det는 "").</summary>
    public static IReadOnlyList<string> DetailsOf(ArrangeCol col) => col switch
    {
        ArrangeCol.Pt => Pt,
        ArrangeCol.Ds => Ds,
        ArrangeCol.Eswt => Eswt,
        ArrangeCol.Trac => Trac,
        _ => None,
    };

    /// <summary>그 칸의 det로 받는 글인가.</summary>
    public static bool IsDetail(ArrangeCol col, string? det)
    {
        var list = DetailsOf(col);
        return det != null && (list.Count == 0 ? det.Length == 0 : list.Contains(det));
    }

    /// <summary>그 칸의 part로 받는 글인가(SONO·C-ARM만 부위 목록 또는 null, 다른 칸은 null).</summary>
    public static bool IsPart(ArrangeCol col, string? part) =>
        part == null || ((col == ArrangeCol.Sono || col == ArrangeCol.Carm) && Parts.Contains(part));
}

/// <summary>
/// 어레인지 표시 저장(spec reception-arrange design.md 6절, REQ-3304). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다.
/// 파일 `reception-arrange.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼
/// JSON `{ "day": "yyyyMMdd", "visits": { "<내원번호>": { "cells": {…}, "away", "ptf", "endedAt"[, "kept": true] } } }`(kept는 참일 때만, AC-3304.5).
/// 규칙은 XrayMarks와 같다(두 파일은 서로 깨뜨리지 않게 따로 둔다): 잠금 하나로 한 번에 하나, 임시 파일 → 바꾸기, 처음 한 번 읽어 메모리에,
/// 날이 다르면 비움, 1MB를 넘거나 모양이 틀리면 빈 표시 + 기록에 E-STORE-BROKEN 한 번. 글 칸은 고르기 목록의 글과 "HH:MM"만 받는다(AC-3304.4).
/// 기록(report)에는 오류 번호만 간다.
/// </summary>
public sealed class ArrangeMarks
{
    public const string FileName = "reception-arrange.dat";

    private const int MaxFileBytes = 1024 * 1024;

    private const string DayField = "day";
    private const string VisitsField = "visits";
    private const string CellsField = "cells";
    private const string AwayField = "away";
    private const string PtfField = "ptf";
    private const string EndedField = "endedAt";
    private const string KeptField = "kept";
    private const string StField = "st";
    private const string AtField = "at";
    private const string ManualField = "manual";
    private const string DetField = "det";
    private const string PartField = "part";
    private const string ReadyField = "readyAt";
    private const string DoneField = "doneAt";
    private const string AddedField = "addedAt";

    private static readonly string[] VisitFields = { CellsField, AwayField, PtfField, EndedField };
    private static readonly string[] KeptVisitFields = { CellsField, AwayField, PtfField, EndedField, KeptField };
    private static readonly string[] CellFields = { StField, ManualField, DetField, PartField, ReadyField, DoneField, AddedField };
    private static readonly string[] PtfFields = { StField, AtField };
    private static readonly string[] PtfSteps = { "up", "down" };

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);
    private static readonly JsonDocumentOptions ReadOptions = new JsonDocumentOptions { MaxDepth = 6 };
    private static readonly IReadOnlyDictionary<string, VisitMark> None =
        new ReadOnlyDictionary<string, VisitMark>(new Dictionary<string, VisitMark>(StringComparer.Ordinal));

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly Func<DateTime> now;
    private readonly Action<string>? report;
    private readonly object gate = new object();

    private bool loaded;
    private string? day;
    private Dictionary<string, VisitMark> visits = new Dictionary<string, VisitMark>(StringComparer.Ordinal);

    /// <param name="folder">도우미 저장 폴더(`data\`).</param>
    /// <param name="protector">이 PC 윈도우 계정 암호화.</param>
    /// <param name="now">지금 시각(이 PC의 시계). 날짜 `yyyyMMdd`를 여기서 잡는다.</param>
    /// <param name="report">기록에 남길 오류 번호를 받는다('E-…'만).</param>
    public ArrangeMarks(IStoreFolder folder, IProtector protector, Func<DateTime> now, Action<string>? report = null)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.now = now ?? throw new ArgumentNullException(nameof(now));
        this.report = report;
    }

    private string FilePath => Path.Combine(folder.Path, FileName);

    /// <summary>
    /// 오늘 표시(내원번호 → 표시)의 사본. 지난 날 표시는 비운다. 파일을 읽지 못하면(잠김·권한) 기록에 E-STORE-FAILED를 남기고
    /// 이번에는 빈 표시로 답한 뒤 다음 읽기에서 다시 읽는다. 던지지 않는다.
    /// </summary>
    public IReadOnlyDictionary<string, VisitMark> Today()
    {
        lock (gate)
        {
            if (!TryLoad())
            {
                report?.Invoke(BitErrors.StoreFailed);
                return None;
            }
            if (!string.Equals(day, DayOf(now()), StringComparison.Ordinal) || visits.Count == 0) return None;
            return new ReadOnlyDictionary<string, VisitMark>(new Dictionary<string, VisitMark>(visits, StringComparer.Ordinal));
        }
    }

    /// <summary>
    /// 잠금 안에서 그 내원의 오늘 표시(없으면 null)를 change에 넘기고, 답(null·빈 표시면 지움)을 쓴다. 날이 바뀌었으면 지난 날 표시를 버린 새 날 파일을 쓴다.
    /// 답이 정해 둔 글·시각이 아니면 ArgumentException이고 쓰지 않는다(AC-3304.4). 바뀔 것이 없으면 쓰지 않는다.
    /// 읽거나 쓰지 못하면 BitException(E-STORE-FAILED)이고 표시는 그대로다.
    /// </summary>
    public void Update(string visitId, Func<VisitMark?, VisitMark?> change)
    {
        if (string.IsNullOrEmpty(visitId)) throw new ArgumentException("내원번호가 비었다", nameof(visitId));
        if (change == null) throw new ArgumentNullException(nameof(change));
        lock (gate)
        {
            if (!TryLoad()) throw new BitException(BitErrors.StoreFailed);
            var today = DayOf(now());
            var next = string.Equals(day, today, StringComparison.Ordinal)
                ? new Dictionary<string, VisitMark>(visits, StringComparer.Ordinal)
                : new Dictionary<string, VisitMark>(StringComparer.Ordinal);
            next.TryGetValue(visitId, out var current);
            var changed = change(current);
            if (changed != null && !IsValid(changed)) throw new ArgumentException("어레인지 표시에 정해 두지 않은 글이 있다", nameof(change));

            if (changed == null || changed.IsEmpty)
            {
                if (!next.Remove(visitId)) return;
            }
            else
            {
                next[visitId] = changed;
            }

            Write(today, next);
            day = today;
            visits = next;
        }
    }

    private static string DayOf(DateTime at) => at.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    // ── 검사 ─────────────────────────────────────────────────

    private static bool IsValid(VisitMark mark)
    {
        if (!IsTimeOrNull(mark.Away) || !IsTimeOrNull(mark.EndedAt)) return false;
        if (mark.Ptf != null && (!PtfSteps.Contains(mark.Ptf.St) || !IsTime(mark.Ptf.At))) return false;
        foreach (var pair in mark.Cells)
        {
            var cell = pair.Value;
            if (!Enum.IsDefined(typeof(ArrangeCol), pair.Key) || !Enum.IsDefined(typeof(ArrangeStep), cell.St)) return false;
            if (!ArrangeChoices.IsDetail(pair.Key, cell.Det) || !ArrangeChoices.IsPart(pair.Key, cell.Part)) return false;
            if (!IsTimeOrNull(cell.ReadyAt) || !IsTimeOrNull(cell.DoneAt) || !IsTimeOrNull(cell.AddedAt)) return false;
        }
        return true;
    }

    private static bool IsDay(string? text) =>
        text != null && text.Length == 8 && text.All(c => c >= '0' && c <= '9');

    private static bool IsTime(string? text) =>
        text != null && text.Length == 5 && text[2] == ':'
        && DateTime.TryParseExact(text, "HH':'mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static bool IsTimeOrNull(string? text) => text == null || IsTime(text);

    private static string StepName(ArrangeStep step) => step switch
    {
        ArrangeStep.Todo => "todo",
        ArrangeStep.Ready => "ready",
        ArrangeStep.Done => "done",
        _ => "gone",
    };

    private static ArrangeStep? StepOf(string? name) => name switch
    {
        "todo" => ArrangeStep.Todo,
        "ready" => ArrangeStep.Ready,
        "done" => ArrangeStep.Done,
        "gone" => ArrangeStep.Gone,
        _ => (ArrangeStep?)null,
    };

    private static readonly Dictionary<string, ArrangeCol> ColOfKey =
        Enum.GetValues(typeof(ArrangeCol)).Cast<ArrangeCol>().ToDictionary(ArrangeMap.KeyOf, col => col, StringComparer.Ordinal);

    // ── 읽기 ─────────────────────────────────────────────────

    /// <summary>아직이면 파일을 한 번 읽는다. 없으면 빈 표시, 깨졌으면 빈 표시 + 기록 E-STORE-BROKEN. 읽지 못하면 false(다음에 다시).</summary>
    private bool TryLoad()
    {
        if (loaded) return true;
        try
        {
            var stored = File.Exists(FilePath) ? ReadFile() : new Stored(null, new Dictionary<string, VisitMark>(StringComparer.Ordinal));
            if (stored == null)
            {
                report?.Invoke(BitErrors.StoreBroken);
                stored = new Stored(null, new Dictionary<string, VisitMark>(StringComparer.Ordinal));
            }
            day = stored.Day;
            visits = stored.Visits;
            loaded = true;
            return true;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>크기·머리·풀기·JSON·칸 검사로 읽는다. 깨졌으면 null. 읽지 못하면 IOException 그대로.</summary>
    private Stored? ReadFile()
    {
        if (new FileInfo(FilePath).Length > MaxFileBytes) return null;
        var data = File.ReadAllBytes(FilePath);
        if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return null;

        var cipher = new byte[data.Length - HeaderBytes.Length];
        Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
        byte[] clear;
        try
        {
            clear = protector.Unprotect(cipher);
        }
        catch (CryptographicException)
        {
            return null;
        }
        try
        {
            return Parse(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    private static Stored? Parse(byte[] clear)
    {
        try
        {
            StrictUtf8.GetCharCount(clear);
            using var document = JsonDocument.Parse(clear, ReadOptions);
            var root = document.RootElement;
            if (!HasExactly(root, DayField, VisitsField)) return null;
            var dayValue = root.GetProperty(DayField);
            if (dayValue.ValueKind != JsonValueKind.String || !IsDay(dayValue.GetString())) return null;
            var visitsValue = root.GetProperty(VisitsField);
            if (visitsValue.ValueKind != JsonValueKind.Object) return null;

            var read = new Dictionary<string, VisitMark>(StringComparer.Ordinal);
            foreach (var visit in visitsValue.EnumerateObject())
            {
                var mark = visit.Name.Length == 0 ? null : ParseVisit(visit.Value);
                if (mark == null || !IsValid(mark) || mark.IsEmpty) return null;
                read[visit.Name] = mark;
            }
            return new Stored(dayValue.GetString(), read);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static VisitMark? ParseVisit(JsonElement value)
    {
        // kept는 참일 때만 쓴다: 없으면 거짓(이 고침 전 파일도 그대로), 있으면 JSON true여야 한다(AC-3304.5)
        var kept = HasExactly(value, KeptVisitFields);
        if (!kept && !HasExactly(value, VisitFields)) return null;
        if (kept && value.GetProperty(KeptField).ValueKind != JsonValueKind.True) return null;
        var cellsValue = value.GetProperty(CellsField);
        if (cellsValue.ValueKind != JsonValueKind.Object) return null;
        var cells = new Dictionary<ArrangeCol, CellMark>();
        foreach (var cell in cellsValue.EnumerateObject())
        {
            if (!ColOfKey.TryGetValue(cell.Name, out var col) || cells.ContainsKey(col)) return null;
            var parsed = ParseCell(cell.Value);
            if (parsed == null) return null;
            cells[col] = parsed;
        }
        if (!TextOrNull(value.GetProperty(AwayField), out var away) || !TextOrNull(value.GetProperty(EndedField), out var ended)) return null;

        PtFirst? ptf = null;
        var ptfValue = value.GetProperty(PtfField);
        if (ptfValue.ValueKind != JsonValueKind.Null)
        {
            if (!HasExactly(ptfValue, PtfFields)) return null;
            if (!TextOrNull(ptfValue.GetProperty(StField), out var st) || !TextOrNull(ptfValue.GetProperty(AtField), out var at) || st == null || at == null) return null;
            ptf = new PtFirst(st, at);
        }
        return new VisitMark(cells, away, ptf, ended, kept);
    }

    private static CellMark? ParseCell(JsonElement value)
    {
        if (!HasExactly(value, CellFields)) return null;
        if (!TextOrNull(value.GetProperty(StField), out var stName) || !(StepOf(stName) is ArrangeStep st)) return null;
        var manual = value.GetProperty(ManualField);
        if (manual.ValueKind != JsonValueKind.True && manual.ValueKind != JsonValueKind.False) return null;
        if (!TextOrNull(value.GetProperty(DetField), out var det) || det == null) return null;
        if (!TextOrNull(value.GetProperty(PartField), out var part)
            || !TextOrNull(value.GetProperty(ReadyField), out var readyAt)
            || !TextOrNull(value.GetProperty(DoneField), out var doneAt)
            || !TextOrNull(value.GetProperty(AddedField), out var addedAt)) return null;
        return new CellMark(st, manual.ValueKind == JsonValueKind.True, det, part, readyAt, doneAt, addedAt);
    }

    /// <summary>객체이고 칸 이름이 정확히 그것들뿐(차례 무관, 겹침 없음)인가.</summary>
    private static bool HasExactly(JsonElement value, params string[] names)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = value.EnumerateObject().Select(p => p.Name).ToList();
        return seen.Count == names.Length && names.All(name => seen.Contains(name, StringComparer.Ordinal));
    }

    /// <summary>글 또는 null인 칸. 다른 형이면 false.</summary>
    private static bool TextOrNull(JsonElement value, out string? text)
    {
        text = null;
        if (value.ValueKind == JsonValueKind.Null) return true;
        if (value.ValueKind != JsonValueKind.String) return false;
        text = value.GetString();
        return true;
    }

    // ── 쓰기 ─────────────────────────────────────────────────

    /// <summary>임시 파일에 다 쓰고 디스크까지 내린 뒤 바꾼다. 실패하면 전 파일은 그대로이고 임시 파일은 지운다.</summary>
    private void Write(string today, Dictionary<string, VisitMark> next)
    {
        try
        {
            var data = Seal(today, next);
            Directory.CreateDirectory(folder.Path);
            var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(data, 0, data.Length);
                    output.Flush(true);
                }
                if (File.Exists(FilePath)) ReplaceFile(temporary);
                else File.Move(temporary, FilePath);
            }
            finally
            {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        }
        catch (IOException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (CryptographicException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }

    /// <summary>File.Replace. 전 파일을 옮긴 뒤 멈춰 파일이 없어졌으면 임시 파일을 그 자리로 옮긴다(XrayMarks와 같다).</summary>
    private void ReplaceFile(string temporary)
    {
        try
        {
            File.Replace(temporary, FilePath, null);
        }
        catch (IOException) when (!File.Exists(FilePath) && File.Exists(temporary))
        {
            File.Move(temporary, FilePath);
        }
    }

    /// <summary>머리 + 암호화한 { day, visits }. 내원번호 차례, 칸은 ArrangeCol 차례로 쓴다. 평문은 암호화한 뒤 지운다.</summary>
    private byte[] Seal(string today, Dictionary<string, VisitMark> next)
    {
        byte[] clear;
        using (var buffer = new MemoryStream())
        {
            using (var writer = new Utf8JsonWriter(buffer))
            {
                writer.WriteStartObject();
                writer.WriteString(DayField, today);
                writer.WriteStartObject(VisitsField);
                foreach (var visit in next.OrderBy(pair => pair.Key, StringComparer.Ordinal))
                {
                    writer.WriteStartObject(visit.Key);
                    writer.WriteStartObject(CellsField);
                    foreach (var cell in visit.Value.Cells.OrderBy(pair => pair.Key))
                    {
                        writer.WriteStartObject(ArrangeMap.KeyOf(cell.Key));
                        writer.WriteString(StField, StepName(cell.Value.St));
                        writer.WriteBoolean(ManualField, cell.Value.Manual);
                        writer.WriteString(DetField, cell.Value.Det);
                        WriteTextOrNull(writer, PartField, cell.Value.Part);
                        WriteTextOrNull(writer, ReadyField, cell.Value.ReadyAt);
                        WriteTextOrNull(writer, DoneField, cell.Value.DoneAt);
                        WriteTextOrNull(writer, AddedField, cell.Value.AddedAt);
                        writer.WriteEndObject();
                    }
                    writer.WriteEndObject();
                    WriteTextOrNull(writer, AwayField, visit.Value.Away);
                    if (visit.Value.Ptf == null)
                    {
                        writer.WriteNull(PtfField);
                    }
                    else
                    {
                        writer.WriteStartObject(PtfField);
                        writer.WriteString(StField, visit.Value.Ptf.St);
                        writer.WriteString(AtField, visit.Value.Ptf.At);
                        writer.WriteEndObject();
                    }
                    WriteTextOrNull(writer, EndedField, visit.Value.EndedAt);
                    if (visit.Value.Kept) writer.WriteBoolean(KeptField, true);
                    writer.WriteEndObject();
                }
                writer.WriteEndObject();
                writer.WriteEndObject();
            }
            clear = buffer.ToArray();
        }
        byte[] cipher;
        try
        {
            cipher = protector.Protect(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
        var output = new byte[HeaderBytes.Length + cipher.Length];
        Buffer.BlockCopy(HeaderBytes, 0, output, 0, HeaderBytes.Length);
        Buffer.BlockCopy(cipher, 0, output, HeaderBytes.Length, cipher.Length);
        return output;
    }

    private static void WriteTextOrNull(Utf8JsonWriter writer, string name, string? text)
    {
        if (text == null) writer.WriteNull(name);
        else writer.WriteString(name, text);
    }

    private sealed class Stored
    {
        public Stored(string? day, Dictionary<string, VisitMark> visits)
        {
            Day = day;
            Visits = visits;
        }

        public string? Day { get; }

        public Dictionary<string, VisitMark> Visits { get; }
    }
}
