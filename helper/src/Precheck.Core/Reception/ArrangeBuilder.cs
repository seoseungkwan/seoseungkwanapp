using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Reception;

/// <summary>
/// 어레인지 칸 하나(AC-3305.4): 단계(todo·ready·done), 칸 글, 부위(SONO는 줄을 "|"로 이음), 이름표(같이 하는 것·약재, spec reception-pick-lists AC-3502.2),
/// 보일 시각, SONO·C-ARM 순서, 직접 넣음.
/// </summary>
public sealed class ArrangeCell
{
    private static readonly IReadOnlyList<string> NoTags = Array.AsReadOnly(new string[0]);

    public ArrangeCell(ArrangeStep st, string det, string? part, string? at, int? ord, bool manual, IReadOnlyList<string>? tags = null)
    {
        St = st;
        Det = det ?? "";
        Part = part;
        At = at;
        Ord = ord;
        Manual = manual;
        Tags = tags == null || tags.Count == 0 ? NoTags : Array.AsReadOnly(tags.ToArray());
    }

    public ArrangeStep St { get; }

    public string Det { get; }

    public string? Part { get; }

    /// <summary>단계에 따라 처방(넣은) 시각·준비완료 시각·완료 시각.</summary>
    public string? At { get; }

    /// <summary>단계 3 처방 칸(우리 의원은 SONO·C-ARM)의 끝나지 않은 칸 순서(1부터). 그 밖은 null.</summary>
    public int? Ord { get; }

    public bool Manual { get; }

    /// <summary>표시의 이름표(처방에서만 온 칸·다른 칸은 빈 목록).</summary>
    public IReadOnlyList<string> Tags { get; }

    internal ArrangeCell WithOrd(int? ord) => new ArrangeCell(St, Det, Part, At, ord, Manual, Tags);
}

/// <summary>
/// 어레인지 줄 하나(AC-3305.3). 이름·차트번호·메모·상태·접수 시각은 화면이 같은 열쇠의 목록 줄에서 가져온다.
/// 돌아온 시각·돌아온 뒤 기다린 글(spec reception-arrange-tune AC-3601.4)도 있다.
/// </summary>
public sealed class ArrangeRow
{
    public ArrangeRow(
        string key, string? away, PtFirst? ptf, string last, IReadOnlyDictionary<string, ArrangeCell> cells, string? back = null, string? backWait = null)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        Away = away;
        Ptf = ptf;
        Last = last ?? "";
        Cells = cells ?? throw new ArgumentNullException(nameof(cells));
        Back = back;
        BackWait = backWait;
    }

    public string Key { get; }

    public string? Away { get; }

    /// <summary>자리비움을 푼(돌아온) 시각 "HH:MM". 없으면 null.</summary>
    public string? Back { get; }

    /// <summary>돌아온 뒤 기다린 글("12분째"). 돌아왔고 아직 칸 쓰기가 없을 때만, 아니면 null.</summary>
    public string? BackWait { get; }

    public PtFirst? Ptf { get; }

    /// <summary>가장 최근 지난 완료 내원의 증상 글(없으면 "").</summary>
    public string Last { get; }

    /// <summary>있는 칸만(칸 열쇠 → 칸, 보이는 칸 가운데). 없는 칸은 JSON에서 null.</summary>
    public IReadOnlyDictionary<string, ArrangeCell> Cells { get; }

    /// <summary>칸이 하나 이상이고 모두 완료(AC-3305.8).</summary>
    public bool AllDone => Cells.Count > 0 && Cells.Values.All(cell => cell.St == ArrangeStep.Done);
}

/// <summary>
/// 표에서 빠진 줄(AC-3305.9·AC-3305.10): [치료 종료]로 뺀 줄(paid 거짓, 누른 시각) 또는 수납완료로 저절로 빠진 줄(paid 참, 수납 시각·모르면 null).
/// </summary>
public sealed class ArrangeEnded
{
    public ArrangeEnded(string key, string? endedAt, bool paid = false)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        if (endedAt == null && !paid) throw new ArgumentNullException(nameof(endedAt));
        EndedAt = endedAt;
        Paid = paid;
    }

    public string Key { get; }

    /// <summary>"HH:MM". 수납완료로 빠졌고 수납 시각을 모르면 null.</summary>
    public string? EndedAt { get; }

    /// <summary>수납완료로 저절로 빠짐.</summary>
    public bool Paid { get; }
}

/// <summary>`/api/board` 답의 arrange(AC-3305.1). Cols는 줄 cells에 쓰는 칸 열쇠(보이는 칸, 설정 차례, 없으면 처음 일곱 칸).</summary>
public sealed class Arrange
{
    public Arrange(IReadOnlyList<ArrangeRow> rows, IReadOnlyList<ArrangeEnded> ended, IReadOnlyList<string>? cols = null)
    {
        Rows = rows ?? throw new ArgumentNullException(nameof(rows));
        Ended = ended ?? throw new ArgumentNullException(nameof(ended));
        Cols = cols ?? ArrangeKeys.Originals;
    }

    /// <summary>줄 cells의 칸 열쇠(차례 그대로 JSON에 쓴다).</summary>
    public IReadOnlyList<string> Cols { get; }

    public IReadOnlyList<ArrangeRow> Rows { get; }

    public IReadOnlyList<ArrangeEnded> Ended { get; }
}

/// <summary>
/// 비트 날 줄 + 칸 설정 + 어레인지 표시 + X-ray 완료 표시 → 어레인지 자료(spec reception-arrange design.md 7절, REQ-3305).
/// 칸은 설정의 보이는 칸이다(ArrangeLayout, spec reception-other-clinic design.md 2절). 숨긴 칸·설정에 없는 열쇠의 표시는 쓰지 않는다.
/// 칸 하나: ① 오늘 처방을 RxMatch로 처방 칸(rx)마다 모은다(한 처방이 여러 칸에 들 수 있음, 칸마다 가장 이른 시각·첫 부위, AC-3301.3·AC-5702.3) ② 표시가 gone이면 칸 없음
/// ③ 표시가 있으면 단계·시각·부위·이름표·글을 덮는다(직접 넣은 칸은 표시만으로 생김, 직접 칸(mn)은 표시로만, 늘 manual)
/// ④ X-RAY는 X-ray 완료 표시가 있으면 완료·그 시각(처방·표시가 없어도 직접 칸으로 생김, AC-3305.6).
/// 부위(part)·이름표(tags)는 SONO·C-ARM 칸에만 있다(열쇠로 정함). 순서 번호(ord)는 단계 3 처방 칸마다 따로다(AC-5703.2).
/// 처방이 사라진 처방 칸(직접 넣지 않음)의 표시는 칸을 만들지 않는다.
/// 줄 고르기: [치료 종료] 시각이 있거나, 수납완료(끝남 칸)인데 다시 넣지(kept) 않았으면 rows가 아니라 ended다(AC-3305.2·AC-3305.10).
/// </summary>
public static class ArrangeBuilder
{
    private static readonly Regex TimeShape = new Regex(@"^([01]\d|2[0-3]):[0-5]\d\z", RegexOptions.CultureInvariant);
    private static readonly IReadOnlyDictionary<string, ArrangeCell> NoCells =
        new ReadOnlyDictionary<string, ArrangeCell>(new Dictionary<string, ArrangeCell>(StringComparer.Ordinal));

    /// <summary>
    /// statuses·hiddenRsu는 ReceptionMap.Statuses·HiddenRsu, layout은 지금 설정의 칸(시험·옛 부르는 곳은 ArrangeLayout.Ours), marks는 ArrangeMarks.Today(),
    /// xray는 XrayMarks.Today()(내원번호 → "HH:MM"), keys는 그날 열쇠표(input.Day로 부른다).
    /// </summary>
    public static Arrange Build(
        BoardInput input,
        IReadOnlyDictionary<string, Lane> statuses,
        IEnumerable<string> hiddenRsu,
        ArrangeLayout layout,
        IReadOnlyDictionary<string, VisitMark> marks,
        IReadOnlyDictionary<string, string> xray,
        VisitKeys keys)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        if (statuses == null) throw new ArgumentNullException(nameof(statuses));
        if (hiddenRsu == null) throw new ArgumentNullException(nameof(hiddenRsu));
        if (layout == null) throw new ArgumentNullException(nameof(layout));
        if (marks == null) throw new ArgumentNullException(nameof(marks));
        if (xray == null) throw new ArgumentNullException(nameof(xray));
        if (keys == null) throw new ArgumentNullException(nameof(keys));

        var hidden = new HashSet<string>(hiddenRsu, StringComparer.Ordinal);
        var visits = input.Visits
            .Select(visit => (Visit: visit, Lane: ReceptionMap.LaneOf(statuses, hidden, visit.Status, visit.Rsu)))
            .Where(item => item.Lane != Lane.Hidden)
            .OrderBy(item => item.Visit, AcceptedOrder.Instance)
            .ToArray();

        var live = new List<(VisitRow Visit, Dictionary<string, Built> Cells, VisitMark? Mark)>();
        var ended = new List<ArrangeEnded>();
        foreach (var (visit, lane) in visits)
        {
            marks.TryGetValue(visit.VisitId, out var mark);
            if (mark?.EndedAt != null)
            {
                ended.Add(new ArrangeEnded(keys.KeyOf(input.Day, visit.VisitId), mark.EndedAt));
                continue;
            }
            if (lane == Lane.Done && mark?.Kept != true)
            {
                // 수납완료는 남은 칸이 있어도 바로 뺀다(2026-11-10 사용자 고침). 시각은 목록 줄 "HH:MM 수납"과 같은 계산
                ended.Add(new ArrangeEnded(keys.KeyOf(input.Day, visit.VisitId), BoardBuilder.ClockOf(visit.PaidAt), paid: true));
                continue;
            }
            live.Add((visit, CellsOf(visit, mark, layout, input.RxNames, xray), mark));
        }

        // 순서(AC-3305.5·AC-5703.2): 단계 3 처방 칸마다 끝나지 않은 칸을 (처방·넣은 시각, 접수 순)으로. 시각을 모르면 뒤로
        var ords = new Dictionary<(int Row, string Col), int>();
        foreach (var col in layout.Keys.Where(layout.HasOrd))
        {
            var waiting = live
                .Select((entry, index) => (Index: index, Cell: entry.Cells.TryGetValue(col, out var cell) ? cell : null))
                .Where(item => item.Cell != null && item.Cell.Cell.St != ArrangeStep.Done)
                .OrderBy(item => item.Cell!.Since ?? "99:99", StringComparer.Ordinal)
                .ThenBy(item => item.Index)
                .ToArray();
            for (var i = 0; i < waiting.Length; i++) ords[(waiting[i].Index, col)] = i + 1;
        }

        var rows = live.Select((entry, index) =>
        {
            var cells = entry.Cells.Count == 0
                ? NoCells
                : new ReadOnlyDictionary<string, ArrangeCell>(entry.Cells.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value.Cell.WithOrd(ords.TryGetValue((index, pair.Key), out var ord) ? ord : (int?)null),
                    StringComparer.Ordinal));
            var back = Time(entry.Mark?.Back);
            return new ArrangeRow(
                keys.KeyOf(input.Day, entry.Visit.VisitId), entry.Mark?.Away, entry.Mark?.Ptf, Clean(entry.Visit.LastSymptom) ?? "", cells,
                back, BackWaitOf(back, entry.Mark?.BackStop, input.ReadAt));
        }).ToArray();

        // 시각 늦은 순, 수납 시각을 모르는 줄(null)은 맨 뒤
        return new Arrange(rows, ended.OrderByDescending(e => e.EndedAt ?? "", StringComparer.Ordinal).ToArray(), layout.Keys);
    }

    /// <summary>만든 칸과 순서를 매길 시각(처방 또는 직접 넣은 시각).</summary>
    private sealed class Built
    {
        public Built(ArrangeCell cell, string? since)
        {
            Cell = cell;
            Since = since;
        }

        public ArrangeCell Cell { get; }

        public string? Since { get; }
    }

    private static Dictionary<string, Built> CellsOf(
        VisitRow visit, VisitMark? mark, ArrangeLayout layout, IReadOnlyDictionary<string, string> names, IReadOnlyDictionary<string, string> xray)
    {
        // ① 처방 칸마다 모으기(처방 하나가 맞는 칸 모두에): 칸마다 가장 이른 시각, 처음 빈 글 아닌 부위
        var fromOrders = new Dictionary<string, (string? At, string? Part)>(StringComparer.Ordinal);
        foreach (var order in visit.Orders)
        {
            names.TryGetValue(order.Code, out var name);
            var at = Time(order.At);
            var part = Clean(order.Part);
            foreach (var col in layout.RxMatch(order.Code, name))
            {
                if (fromOrders.TryGetValue(col, out var seen))
                    fromOrders[col] = (Earlier(seen.At, at), seen.Part ?? part);
                else
                    fromOrders[col] = (at, part);
            }
        }

        var cells = new Dictionary<string, Built>(StringComparer.Ordinal);
        foreach (var col in layout.Keys)
        {
            CellMark? marked = null;
            mark?.Cells.TryGetValue(col, out marked);
            var hasOrder = fromOrders.TryGetValue(col, out var order);
            var manualOnly = !layout.IsRx(col);
            Built? built = null;

            if (marked != null && marked.St == ArrangeStep.Gone)
            {
                built = null; // ② 표에서 뺀 칸
            }
            else if (marked != null && (manualOnly || marked.Manual || hasOrder))
            {
                // ③ 표시가 덮는다. 직접 칸은 늘 manual
                var manual = manualOnly || marked.Manual;
                var since = manual ? Time(marked.AddedAt) ?? order.At : order.At;
                var part = IsQueue(col) ? Clean(marked.Part) ?? order.Part : null;
                built = new Built(new ArrangeCell(marked.St, marked.Det, part, AtOf(marked, since), null, manual, IsQueue(col) ? marked.Tags : null), since);
            }
            else if (hasOrder && !manualOnly)
            {
                built = new Built(new ArrangeCell(ArrangeStep.Todo, "", IsQueue(col) ? order.Part : null, order.At, null, false), order.At);
            }

            // ④ X-ray 완료 표시
            if (col == ArrangeKeys.Xray && xray.TryGetValue(visit.VisitId, out var shot) && Time(shot) is string shotAt)
            {
                built = built == null
                    ? new Built(new ArrangeCell(ArrangeStep.Done, "", null, shotAt, null, true), shotAt)
                    : new Built(new ArrangeCell(ArrangeStep.Done, built.Cell.Det, null, shotAt, null, built.Cell.Manual), built.Since);
            }

            if (built != null) cells[col] = built;
        }
        return cells;
    }

    /// <summary>
    /// 돌아온 뒤 기다린 글(AC-3601.4): back이 있고 backStop이 없을 때만 "{시간}째". 분 = 판 시각(시:분) − back, 음수면 0.
    /// 시간 글은 목록 기다린 글과 같은 BoardBuilder.Span이다.
    /// </summary>
    private static string? BackWaitOf(string? back, string? backStop, DateTime boardAt)
    {
        if (back == null || backStop != null) return null;
        var minutes = boardAt.Hour * 60 + boardAt.Minute - MinuteOf(back);
        return BoardBuilder.Span(Math.Max(0, minutes)) + "째";
    }

    /// <summary>"HH:MM"(TimeShape로 본 글) → 그날 0시부터의 분.</summary>
    private static int MinuteOf(string hhmm) =>
        int.Parse(hhmm.Substring(0, 2), CultureInfo.InvariantCulture) * 60 + int.Parse(hhmm.Substring(3, 2), CultureInfo.InvariantCulture);

    /// <summary>표시의 단계에 따른 보일 시각: ready면 readyAt, done이면 doneAt, 그 밖·없으면 처방(넣은) 시각.</summary>
    private static string? AtOf(CellMark marked, string? since) => marked.St switch
    {
        ArrangeStep.Ready => Time(marked.ReadyAt) ?? since,
        ArrangeStep.Done => Time(marked.DoneAt) ?? since,
        _ => since,
    };

    /// <summary>부위·이름표를 갖는 칸(SONO·C-ARM, 열쇠로 정함).</summary>
    private static bool IsQueue(string col) => ArrangeChoices.IsShaped(col);

    private static string? Earlier(string? a, string? b) =>
        a == null ? b : b == null ? a : string.CompareOrdinal(a, b) <= 0 ? a : b;

    private static string? Time(string? text) => text != null && TimeShape.IsMatch(text) ? text : null;

    private static string? Clean(string? text)
    {
        var trimmed = text?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    /// <summary>접수 원값 빠른 순, 같으면 내원번호 순(길이 먼저라 V9 다음 V10). BoardBuilder의 줄 차례와 같다.</summary>
    private sealed class AcceptedOrder : IComparer<VisitRow>
    {
        public static readonly AcceptedOrder Instance = new AcceptedOrder();

        public int Compare(VisitRow? a, VisitRow? b)
        {
            if (ReferenceEquals(a, b)) return 0;
            if (a == null) return -1;
            if (b == null) return 1;
            var byTime = string.CompareOrdinal(a.AcceptedAt.Trim(), b.AcceptedAt.Trim());
            if (byTime != 0) return byTime;
            var byLength = a.VisitId.Length.CompareTo(b.VisitId.Length);
            return byLength != 0 ? byLength : string.CompareOrdinal(a.VisitId, b.VisitId);
        }
    }
}
