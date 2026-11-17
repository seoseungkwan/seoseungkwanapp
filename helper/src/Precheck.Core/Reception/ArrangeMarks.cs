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

/// <summary>어레인지 칸의 단계: 준비(todo) → 준비완료(ready, 단계 3 칸만, spec reception-other-clinic AC-5703.2) → 완료(done). gone은 처방에서 온 칸을 표에서 뺀 것.</summary>
public enum ArrangeStep { Todo, Ready, Done, Gone }

/// <summary>
/// 칸 하나의 표시(AC-3304.2). det는 PT·도수·충격파·견인·더한 칸 글(모양만 본다, spec reception-arrange-tune AC-3603.4, 여러 개는 "|"로 이음), SONO·C-ARM part는 줄을 "|"로 이은 글이고 tags는 이름표(같이 하는 것·약재) 목록이다
/// (spec reception-pick-lists AC-3502.1). 시각은 "HH:MM".
/// </summary>
public sealed class CellMark
{
    private static readonly IReadOnlyList<string> NoTags = Array.AsReadOnly(new string[0]);

    public CellMark(ArrangeStep st, bool manual, string det, string? part, string? readyAt, string? doneAt, string? addedAt, IReadOnlyList<string>? tags = null)
    {
        St = st;
        Manual = manual;
        Det = det ?? throw new ArgumentNullException(nameof(det));
        Part = part;
        ReadyAt = readyAt;
        DoneAt = doneAt;
        AddedAt = addedAt;
        Tags = tags == null || tags.Count == 0 ? NoTags : Array.AsReadOnly(tags.ToArray());
    }

    public ArrangeStep St { get; }

    /// <summary>처방이 아니라 직접 넣은 칸.</summary>
    public bool Manual { get; }

    /// <summary>칸 글(PT의 ICE·HP 등, 여러 개는 "|"로 이음). X-RAY·SONO·C-ARM과 처방에서만 온 칸은 "".</summary>
    public string Det { get; }

    /// <summary>SONO·C-ARM 부위·시술(SONO는 줄을 "|"로 이음). 다른 칸은 null.</summary>
    public string? Part { get; }

    public string? ReadyAt { get; }

    public string? DoneAt { get; }

    public string? AddedAt { get; }

    /// <summary>SONO 같이 하는 것·C-ARM 약재 이름표. 없으면(다른 칸 포함) 빈 목록.</summary>
    public IReadOnlyList<string> Tags { get; }
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

/// <summary>
/// 내원 하나의 어레인지 표시(AC-3304.2·AC-3304.5): 칸마다 표시, 자리비움 시각, PT 먼저, 치료 종료 시각, 수납완료 줄을 다시 넣음,
/// 돌아온 시각과 돌아온 뒤 기다린 시간을 센 것을 멈춘 시각(spec reception-arrange-tune AC-3601.1). 이름·차트번호·메모·증상은 없다.
/// </summary>
public sealed class VisitMark
{
    private static readonly IReadOnlyDictionary<string, CellMark> NoCells =
        new ReadOnlyDictionary<string, CellMark>(new Dictionary<string, CellMark>(StringComparer.Ordinal));

    /// <param name="cells">칸 열쇠(ArrangeKeys, 더한 칸·모르는 열쇠 포함) → 표시.</param>
    public VisitMark(
        IReadOnlyDictionary<string, CellMark>? cells = null, string? away = null, PtFirst? ptf = null, string? endedAt = null, bool kept = false,
        string? back = null, string? backStop = null)
    {
        Cells = cells == null || cells.Count == 0
            ? NoCells
            : new ReadOnlyDictionary<string, CellMark>(cells.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal));
        Away = away;
        Ptf = ptf;
        EndedAt = endedAt;
        Kept = kept;
        Back = back;
        BackStop = backStop;
    }

    /// <summary>칸 열쇠 → 표시. 설정에 없는(지운) 칸 열쇠도 그대로 남는다(판에는 쓰지 않음, AC-5703.5).</summary>
    public IReadOnlyDictionary<string, CellMark> Cells { get; }

    /// <summary>자리비움 시각.</summary>
    public string? Away { get; }

    public PtFirst? Ptf { get; }

    /// <summary>[치료 종료] 시각.</summary>
    public string? EndedAt { get; }

    /// <summary>수납완료 줄을 [다시 넣기]함: 그날 다시 저절로 빠지지 않는다(AC-3305.10·AC-3306.7).</summary>
    public bool Kept { get; }

    /// <summary>자리비움을 푼(돌아온) 시각 "HH:MM". 없으면 null.</summary>
    public string? Back { get; }

    /// <summary>돌아온 뒤 첫 칸 쓰기로 기다린 시간 세기를 멈춘 시각 "HH:MM". 없으면 null(Back 없이 있으면 안 된다).</summary>
    public string? BackStop { get; }

    /// <summary>표시가 하나도 없다(저장할 때 그 내원을 지운다).</summary>
    public bool IsEmpty => Cells.Count == 0 && Away == null && Ptf == null && EndedAt == null && !Kept && Back == null && BackStop == null;

    /// <summary>그 칸만 바꾼(null이면 지운) 새 표시.</summary>
    public VisitMark WithCell(string col, CellMark? cell)
    {
        if (col == null) throw new ArgumentNullException(nameof(col));
        var cells = Cells.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
        if (cell == null) cells.Remove(col);
        else cells[col] = cell;
        return new VisitMark(cells, Away, Ptf, EndedAt, Kept, Back, BackStop);
    }

    public VisitMark WithAway(string? away) => new VisitMark(Cells, away, Ptf, EndedAt, Kept, Back, BackStop);

    public VisitMark WithPtf(PtFirst? ptf) => new VisitMark(Cells, Away, ptf, EndedAt, Kept, Back, BackStop);

    public VisitMark WithEnded(string? endedAt) => new VisitMark(Cells, Away, Ptf, endedAt, Kept, Back, BackStop);

    public VisitMark WithKept(bool kept) => new VisitMark(Cells, Away, Ptf, EndedAt, kept, Back, BackStop);

    public VisitMark WithBack(string? back, string? backStop) => new VisitMark(Cells, Away, Ptf, EndedAt, Kept, back, backStop);
}

/// <summary>
/// 넣기 글과 칸 글 검사(spec reception-arrange design.md 4절 · spec reception-arrange-tune design.md 2절 · spec reception-other-clinic design.md 2절).
/// 넣기(add·part) 글은 지금 고르기 목록(PickLists, 설정의 picks)으로 본다(IsAdd, AC-5703.4). 특별한 모양은 칸 종류가 아니라 열쇠를 따른다.
/// 표시의 det·part·tags는 목록에 있는지가 아니라 모양만 본다(목록을 고친 뒤에도 이미 넣은 칸은 그대로 보이게, AC-3502.1·AC-3603.4·AC-5703.5).
/// </summary>
public static class ArrangeChoices
{
    /// <summary>SONO part 한 줄의 글자 한도: 쪽 글(오른·왼·양) + 빈칸 + 이름 10글자.</summary>
    private const int MaxPartLine = 13;

    /// <summary>칸 글 한 조각의 글자 한도: 옛 충격파 "{타수} {부위 수}"(이름 10글자 + 빈칸 + 이름 10글자).</summary>
    private const int MaxDetail = PickLists.MaxName * 2 + 1;

    /// <summary>칸 글 조각 수 한도: 충격파 타수 8 + 부위 수 8(AC-5703.5).</summary>
    private const int MaxPieces = PickLists.MaxEswtHits + PickLists.MaxEswtCounts;

    /// <summary>C-ARM part 줄 한도 = 시술 목록 한도(AC-5703.5).</summary>
    private const int MaxCarmLines = PickLists.MaxProcs;

    /// <summary>한 줄 목록 칸(PT·도수·견인·더한 칸)에 한 번에 넣는 이름 수 한도(AC-5703.4).</summary>
    private const int MaxPicks = 8;

    /// <summary>X-RAY 직접 넣기 글(칸 글은 "").</summary>
    public const string XrayShot = "X-ray 찍기";

    /// <summary>
    /// 빈 칸에 직접 넣는(add) 글·SONO·C-ARM 고르기(part) 글이 맞나(AC-5703.4, 목록은 layout.Picks):
    /// xray = "X-ray 찍기"(t 없음) · sono = 지금 규칙(PickLists.IsSono: 1~6줄 + 같이 하는 것) ·
    /// carm = 시술 1개 이상 "|"(목록 차례, 겹침 없음) + t 약재 0개 이상(목록 차례, 겹침 없음, 고른 시술이 모두 약재 없음이면 t 없음) ·
    /// eswt = 타수 0개 이상 + 부위 수 1개 이상 "|"(타수 먼저, 각각 목록 차례, t 없음) ·
    /// pt·ds·trac·더한 칸 = 그 칸 목록 이름 1~8개 "|"(목록 차례, 겹침 없음, t 없음), 목록이 빈 더한 칸은 ""만.
    /// 보이는 칸인지는 보지 않는다(ArrangeWrite가 먼저 본다). "부위는 나중에"는 받지 않는다.
    /// </summary>
    public static bool IsAdd(ArrangeLayout layout, string col, string v, string? t)
    {
        if (layout == null) throw new ArgumentNullException(nameof(layout));
        if (col == null || v == null) return false;
        var lists = layout.Picks;
        switch (col)
        {
            case ArrangeKeys.Xray:
                return t == null && v == XrayShot;
            case ArrangeKeys.Sono:
                return lists.IsSono(v, t);
            case ArrangeKeys.Carm:
                return IsCarm(lists, v, t);
            case ArrangeKeys.Eswt:
                return t == null && IsEswt(lists, v);
            case ArrangeKeys.Pt:
            case ArrangeKeys.Ds:
            case ArrangeKeys.Trac:
                return t == null && IsListPick(layout.ListOf(col), v, false);
        }
        return t == null && ArrangeKeys.IsAddedKey(col) && IsListPick(layout.ListOf(col), v, true);
    }

    /// <summary>
    /// 그 칸의 det로 받는 글인가(AC-3603.4·AC-5703.5): X-RAY·SONO·C-ARM은 "", 다른 칸(더한 칸·모르는 열쇠 포함)은 "" 또는
    /// "|"로 나눈 1~16조각이고 조각마다 1~21글자·제어 글자·짝 없는 대리쌍이 없는 글(옛 "3000타 2부위"도). 목록에 있는지는 보지 않는다.
    /// </summary>
    public static bool IsDetail(string col, string? det)
    {
        if (det == null || col == null) return false;
        if (IsFixed(col)) return det.Length == 0;
        if (det.Length == 0) return true;
        var pieces = det.Split(PickLists.Joiner);
        return pieces.Length <= MaxPieces && pieces.All(piece => IsText(piece, MaxDetail));
    }

    /// <summary>
    /// 그 칸의 part로 받는 글인가(AC-3502.1·AC-5703.5): SONO는 null 또는 줄을 "|"로 이은 1~6줄, C-ARM은 null 또는 1~12줄(줄마다 1~13글자, 제어 글자 없음),
    /// 다른 칸은 null. 목록에 있는지는 보지 않는다(목록을 고친 뒤에도 이미 넣은 칸은 그대로 보이게).
    /// </summary>
    public static bool IsPart(string col, string? part)
    {
        if (part == null) return true;
        var max = col == ArrangeKeys.Sono ? PickLists.MaxLines : col == ArrangeKeys.Carm ? MaxCarmLines : 0;
        if (max == 0) return false;
        var lines = part.Split(PickLists.Joiner);
        return lines.Length <= max && lines.All(line => IsText(line, MaxPartLine));
    }

    /// <summary>그 칸의 tags로 받는 목록인가(AC-3502.1): SONO·C-ARM만 이름표 0~12개(이름표마다 1~10글자, "|"·제어 글자 없음), 다른 칸은 빈 목록.</summary>
    public static bool IsTags(string col, IReadOnlyList<string>? tags)
    {
        if (tags == null || tags.Count == 0) return true;
        return IsShaped(col) && tags.Count <= PickLists.MaxWiths && tags.All(tag => tag != null && IsText(tag, PickLists.MaxName));
    }

    /// <summary>부위(part)·이름표(tags)를 갖는 칸: SONO·C-ARM(종류가 아니라 열쇠로 정한다).</summary>
    internal static bool IsShaped(string? col) => col == ArrangeKeys.Sono || col == ArrangeKeys.Carm;

    /// <summary>칸 글(det)이 늘 ""인 칸: X-RAY·SONO·C-ARM.</summary>
    private static bool IsFixed(string col) => col == ArrangeKeys.Xray || IsShaped(col);

    /// <summary>C-ARM: 시술 1개 이상(목록 차례·겹침 없음·"부위는 나중에" 아님), 약재 0개 이상(목록 차례·겹침 없음), 고른 시술이 모두 약재 없음이면 약재 없음.</summary>
    private static bool IsCarm(PickLists lists, string v, string? t)
    {
        if (v.Length == 0) return false;
        var names = lists.Procs.Select(proc => proc.N).ToArray();
        var last = -1;
        var noDrugOnly = true;
        foreach (var name in v.Split(PickLists.Joiner))
        {
            // 시술 하나씩 지금 규칙(목록에 있음·"부위는 나중에" 아님)으로 본다
            if (!lists.IsCarm(name, null)) return false;
            var at = IndexOf(names, name);
            if (at <= last) return false;
            last = at;
            noDrugOnly &= lists.Procs[at].NoDrug;
        }
        var drugs = PickLists.TagsOf(t);
        if (drugs.Count == 0) return true;
        return !noDrugOnly && InOrder(lists.Drugs, drugs);
    }

    /// <summary>충격파: 타수 0개 이상 + 부위 수 1개 이상, 타수 먼저, 각각 목록 차례·겹침 없음.</summary>
    private static bool IsEswt(PickLists lists, string v)
    {
        var pieces = v.Split(PickLists.Joiner);
        for (var hits = 0; hits < pieces.Length; hits++)
        {
            if (InOrder(lists.EswtHits, pieces.Take(hits).ToArray()) && InOrder(lists.EswtCounts, pieces.Skip(hits).ToArray())) return true;
        }
        return false;
    }

    /// <summary>한 줄 목록: 목록 이름 1~8개(목록 차례·겹침 없음). emptyOk면 목록이 빈 칸은 ""만 받는다.</summary>
    private static bool IsListPick(IReadOnlyList<string> names, string v, bool emptyOk)
    {
        if (names.Count == 0) return emptyOk && v.Length == 0;
        var pieces = v.Split(PickLists.Joiner);
        return pieces.Length <= MaxPicks && InOrder(names, pieces);
    }

    /// <summary>조각이 모두 목록에 있고 목록 차례대로(뒤 조각이 앞 조각보다 목록 뒤라 겹침도 없음)인가. 조각이 없으면 참.</summary>
    private static bool InOrder(IReadOnlyList<string> names, IReadOnlyList<string> pieces)
    {
        var last = -1;
        foreach (var piece in pieces)
        {
            var at = IndexOf(names, piece);
            if (at <= last) return false;
            last = at;
        }
        return true;
    }

    private static int IndexOf(IReadOnlyList<string> names, string name)
    {
        for (var i = 0; i < names.Count; i++)
        {
            if (string.Equals(names[i], name, StringComparison.Ordinal)) return i;
        }
        return -1;
    }

    /// <summary>1~max글자이고 "|"·제어 글자(C0·DEL·C1·U+2028·U+2029)·짝 없는 대리쌍이 없다.</summary>
    private static bool IsText(string text, int max)
    {
        if (text.Length == 0 || text.Length > max) return false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (c == PickLists.Joiner || char.IsControl(c) || c == '\u2028' || c == '\u2029') return false;
            if (char.IsHighSurrogate(c) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                i++;
                continue;
            }
            if (char.IsSurrogate(c)) return false;
        }
        return true;
    }
}

/// <summary>
/// 어레인지 표시 저장(spec reception-arrange design.md 6절, REQ-3304). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다.
/// 파일 `reception-arrange.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼
/// JSON `{ "day": "yyyyMMdd", "visits": { "<내원번호>": { "cells": {…}, "away", "ptf", "endedAt"[, "kept": true][, "back"][, "backStop"] } } }`
/// (kept는 참일 때만, AC-3304.5. back·backStop은 값이 있을 때만이고 backStop은 back이 있을 때만, spec reception-arrange-tune AC-3601.1).
/// 칸은 { st, manual, det, part, readyAt, doneAt, addedAt[, tags: [글…]] }(tags는 비지 않을 때만, spec reception-pick-lists AC-3502.1).
/// 규칙은 XrayMarks와 같다(두 파일은 서로 깨뜨리지 않게 따로 둔다): 잠금 하나로 한 번에 하나, 임시 파일 → 바꾸기, 처음 한 번 읽어 메모리에,
/// 날이 다르면 비움, 1MB를 넘거나 모양이 틀리면 빈 표시 + 기록에 E-STORE-BROKEN 한 번. det는 모양만 보고(spec reception-arrange-tune AC-3603.4), 시각은 "HH:MM"만 받고(AC-3304.4)
/// SONO·C-ARM part·tags는 모양만 본다(AC-3502.1).
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
    private const string BackField = "back";
    private const string BackStopField = "backStop";
    private const string StField = "st";
    private const string AtField = "at";
    private const string ManualField = "manual";
    private const string DetField = "det";
    private const string PartField = "part";
    private const string ReadyField = "readyAt";
    private const string DoneField = "doneAt";
    private const string AddedField = "addedAt";
    private const string TagsField = "tags";

    private static readonly string[] VisitFields = { CellsField, AwayField, PtfField, EndedField };
    private static readonly string[] OptionalVisitFields = { KeptField, BackField, BackStopField };
    private static readonly string[] CellFields = { StField, ManualField, DetField, PartField, ReadyField, DoneField, AddedField };
    private static readonly string[] TaggedCellFields = { StField, ManualField, DetField, PartField, ReadyField, DoneField, AddedField, TagsField };
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
        // 돌아옴(spec reception-arrange-tune AC-3601.1): 둘 다 "HH:MM" 또는 없음, backStop은 back이 있을 때만
        if (!IsTimeOrNull(mark.Back) || !IsTimeOrNull(mark.BackStop) || (mark.BackStop != null && mark.Back == null)) return false;
        if (mark.Ptf != null && (!PtfSteps.Contains(mark.Ptf.St) || !IsTime(mark.Ptf.At))) return false;
        foreach (var pair in mark.Cells)
        {
            var cell = pair.Value;
            if (!ArrangeKeys.IsMarkKey(pair.Key) || !Enum.IsDefined(typeof(ArrangeStep), cell.St)) return false;
            if (!ArrangeChoices.IsDetail(pair.Key, cell.Det) || !ArrangeChoices.IsPart(pair.Key, cell.Part) || !ArrangeChoices.IsTags(pair.Key, cell.Tags)) return false;
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
        // kept는 참일 때만 쓴다: 없으면 거짓(이 고침 전 파일도 그대로), 있으면 JSON true여야 한다(AC-3304.5).
        // back·backStop도 값이 있을 때만 쓴다: 없으면 null(이 고침 전 파일도 그대로), 있으면 글이어야 하고 모양은 IsValid가 본다(AC-3601.1)
        if (!HasFields(value, VisitFields, OptionalVisitFields)) return null;
        var kept = value.TryGetProperty(KeptField, out var keptValue);
        if (kept && keptValue.ValueKind != JsonValueKind.True) return null;
        if (!OptionalText(value, BackField, out var back) || !OptionalText(value, BackStopField, out var backStop)) return null;
        var cellsValue = value.GetProperty(CellsField);
        if (cellsValue.ValueKind != JsonValueKind.Object) return null;
        // 칸 열쇠는 모양(^[a-z][a-z0-9]{0,7}$)만 본다: 더한 칸·지운 칸 열쇠도 그대로 읽어 다시 쓸 때 남긴다(AC-5703.5)
        var cells = new Dictionary<string, CellMark>(StringComparer.Ordinal);
        foreach (var cell in cellsValue.EnumerateObject())
        {
            if (!ArrangeKeys.IsMarkKey(cell.Name) || cells.ContainsKey(cell.Name)) return null;
            var parsed = ParseCell(cell.Value);
            if (parsed == null) return null;
            cells[cell.Name] = parsed;
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
        return new VisitMark(cells, away, ptf, ended, kept, back, backStop);
    }

    /// <summary>없으면 null로 true, 있으면 글일 때만 true(null 값·다른 형은 false).</summary>
    private static bool OptionalText(JsonElement value, string name, out string? text)
    {
        text = null;
        if (!value.TryGetProperty(name, out var found)) return true;
        if (found.ValueKind != JsonValueKind.String) return false;
        text = found.GetString();
        return true;
    }

    private static CellMark? ParseCell(JsonElement value)
    {
        // tags는 비지 않을 때만 쓴다: 없으면 빈 목록(이 고침 전 파일도 그대로), 있으면 글 하나 이상의 배열이어야 한다(AC-3502.1)
        var tagged = HasExactly(value, TaggedCellFields);
        if (!tagged && !HasExactly(value, CellFields)) return null;
        var tags = new List<string>();
        if (tagged)
        {
            var tagsValue = value.GetProperty(TagsField);
            if (tagsValue.ValueKind != JsonValueKind.Array || tagsValue.GetArrayLength() == 0) return null;
            foreach (var tag in tagsValue.EnumerateArray())
            {
                if (tag.ValueKind != JsonValueKind.String) return null;
                tags.Add(tag.GetString()!);
            }
        }
        if (!TextOrNull(value.GetProperty(StField), out var stName) || !(StepOf(stName) is ArrangeStep st)) return null;
        var manual = value.GetProperty(ManualField);
        if (manual.ValueKind != JsonValueKind.True && manual.ValueKind != JsonValueKind.False) return null;
        if (!TextOrNull(value.GetProperty(DetField), out var det) || det == null) return null;
        if (!TextOrNull(value.GetProperty(PartField), out var part)
            || !TextOrNull(value.GetProperty(ReadyField), out var readyAt)
            || !TextOrNull(value.GetProperty(DoneField), out var doneAt)
            || !TextOrNull(value.GetProperty(AddedField), out var addedAt)) return null;
        return new CellMark(st, manual.ValueKind == JsonValueKind.True, det, part, readyAt, doneAt, addedAt, tags);
    }

    /// <summary>객체이고 칸 이름이 정확히 그것들뿐(차례 무관, 겹침 없음)인가.</summary>
    private static bool HasExactly(JsonElement value, params string[] names)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = value.EnumerateObject().Select(p => p.Name).ToList();
        return seen.Count == names.Length && names.All(name => seen.Contains(name, StringComparer.Ordinal));
    }

    /// <summary>객체이고 required는 모두, 그 밖은 optional 안의 이름만 있으며(차례 무관) 같은 이름이 두 번 없는가.</summary>
    private static bool HasFields(JsonElement value, string[] required, string[] optional)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = value.EnumerateObject().Select(p => p.Name).ToList();
        if (seen.Distinct(StringComparer.Ordinal).Count() != seen.Count) return false;
        return required.All(name => seen.Contains(name, StringComparer.Ordinal))
            && seen.All(name => required.Contains(name, StringComparer.Ordinal) || optional.Contains(name, StringComparer.Ordinal));
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

    /// <summary>머리 + 암호화한 { day, visits }. 내원번호 차례, 칸은 열쇠 차례(ArrangeKeys.Order: 처음 일곱 칸 → 더한 칸 → 그 밖)로 쓴다. 평문은 암호화한 뒤 지운다.</summary>
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
                    foreach (var cell in visit.Value.Cells.OrderBy(pair => pair.Key, ArrangeKeys.Order))
                    {
                        writer.WriteStartObject(cell.Key);
                        writer.WriteString(StField, StepName(cell.Value.St));
                        writer.WriteBoolean(ManualField, cell.Value.Manual);
                        writer.WriteString(DetField, cell.Value.Det);
                        WriteTextOrNull(writer, PartField, cell.Value.Part);
                        WriteTextOrNull(writer, ReadyField, cell.Value.ReadyAt);
                        WriteTextOrNull(writer, DoneField, cell.Value.DoneAt);
                        WriteTextOrNull(writer, AddedField, cell.Value.AddedAt);
                        if (cell.Value.Tags.Count > 0)
                        {
                            writer.WriteStartArray(TagsField);
                            foreach (var tag in cell.Value.Tags) writer.WriteStringValue(tag);
                            writer.WriteEndArray();
                        }
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
                    if (visit.Value.Back != null) writer.WriteString(BackField, visit.Value.Back);
                    if (visit.Value.BackStop != null) writer.WriteString(BackStopField, visit.Value.BackStop);
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
