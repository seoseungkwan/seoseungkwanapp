using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Reception;

/// <summary>어레인지 칸 하나(AC-3305.4): 단계(todo·ready·done), 칸 글, 부위, 보일 시각, SONO·C-ARM 순서, 직접 넣음.</summary>
public sealed class ArrangeCell
{
    public ArrangeCell(ArrangeStep st, string det, string? part, string? at, int? ord, bool manual)
    {
        St = st;
        Det = det ?? "";
        Part = part;
        At = at;
        Ord = ord;
        Manual = manual;
    }

    public ArrangeStep St { get; }

    public string Det { get; }

    public string? Part { get; }

    /// <summary>단계에 따라 처방(넣은) 시각·준비완료 시각·완료 시각.</summary>
    public string? At { get; }

    /// <summary>SONO·C-ARM의 끝나지 않은 칸 순서(1부터). 그 밖은 null.</summary>
    public int? Ord { get; }

    public bool Manual { get; }

    internal ArrangeCell WithOrd(int? ord) => new ArrangeCell(St, Det, Part, At, ord, Manual);
}

/// <summary>어레인지 줄 하나(AC-3305.3). 이름·차트번호·메모·상태·접수 시각은 화면이 같은 열쇠의 목록 줄에서 가져온다.</summary>
public sealed class ArrangeRow
{
    public ArrangeRow(string key, string? away, PtFirst? ptf, string last, IReadOnlyDictionary<ArrangeCol, ArrangeCell> cells)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        Away = away;
        Ptf = ptf;
        Last = last ?? "";
        Cells = cells ?? throw new ArgumentNullException(nameof(cells));
    }

    public string Key { get; }

    public string? Away { get; }

    public PtFirst? Ptf { get; }

    /// <summary>가장 최근 지난 완료 내원의 증상 글(없으면 "").</summary>
    public string Last { get; }

    /// <summary>있는 칸만(없는 칸은 JSON에서 null).</summary>
    public IReadOnlyDictionary<ArrangeCol, ArrangeCell> Cells { get; }

    /// <summary>칸이 하나 이상이고 모두 완료(AC-3305.8).</summary>
    public bool AllDone => Cells.Count > 0 && Cells.Values.All(cell => cell.St == ArrangeStep.Done);
}

/// <summary>[치료 종료]로 표에서 뺀 줄(AC-3305.9).</summary>
public sealed class ArrangeEnded
{
    public ArrangeEnded(string key, string endedAt)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        EndedAt = endedAt ?? throw new ArgumentNullException(nameof(endedAt));
    }

    public string Key { get; }

    public string EndedAt { get; }
}

/// <summary>`/api/board` 답의 arrange(AC-3305.1).</summary>
public sealed class Arrange
{
    public Arrange(IReadOnlyList<ArrangeRow> rows, IReadOnlyList<ArrangeEnded> ended)
    {
        Rows = rows ?? throw new ArgumentNullException(nameof(rows));
        Ended = ended ?? throw new ArgumentNullException(nameof(ended));
    }

    public IReadOnlyList<ArrangeRow> Rows { get; }

    public IReadOnlyList<ArrangeEnded> Ended { get; }
}

/// <summary>
/// 비트 날 줄 + 지도 + 어레인지 표시 + X-ray 완료 표시 → 어레인지 자료(spec reception-arrange design.md 7절, REQ-3305).
/// 칸 하나: ① 오늘 처방을 지도로 처방 칸(xray·sono·carm)마다 모은다(가장 이른 시각, 첫 부위, AC-3301.3) ② 표시가 gone이면 칸 없음
/// ③ 표시가 있으면 단계·시각·부위·글을 덮는다(직접 넣은 칸은 표시만으로 생김, 직접 칸 pt·ds·eswt·trac은 표시로만, 늘 manual)
/// ④ X-RAY는 X-ray 완료 표시가 있으면 완료·그 시각(처방·표시가 없어도 직접 칸으로 생김, AC-3305.6).
/// 처방이 사라진 처방 칸(직접 넣지 않음)의 표시는 칸을 만들지 않는다.
/// </summary>
public static class ArrangeBuilder
{
    private static readonly ArrangeCol[] OrderCols = { ArrangeCol.Xray, ArrangeCol.Sono, ArrangeCol.Carm };
    private static readonly ArrangeCol[] QueueCols = { ArrangeCol.Sono, ArrangeCol.Carm };
    private static readonly Regex TimeShape = new Regex(@"^([01]\d|2[0-3]):[0-5]\d\z", RegexOptions.CultureInvariant);
    private static readonly IReadOnlyDictionary<ArrangeCol, ArrangeCell> NoCells =
        new ReadOnlyDictionary<ArrangeCol, ArrangeCell>(new Dictionary<ArrangeCol, ArrangeCell>());

    /// <summary>
    /// statuses·hiddenRsu는 ReceptionMap.Statuses·HiddenRsu, map은 ArrangeMap.Rules(시험은 가짜), marks는 ArrangeMarks.Today(),
    /// xray는 XrayMarks.Today()(내원번호 → "HH:MM"), keys는 그날 열쇠표(input.Day로 부른다).
    /// </summary>
    public static Arrange Build(
        BoardInput input,
        IReadOnlyDictionary<string, Lane> statuses,
        IEnumerable<string> hiddenRsu,
        IReadOnlyList<ArrangeRule> map,
        IReadOnlyDictionary<string, VisitMark> marks,
        IReadOnlyDictionary<string, string> xray,
        VisitKeys keys)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        if (statuses == null) throw new ArgumentNullException(nameof(statuses));
        if (hiddenRsu == null) throw new ArgumentNullException(nameof(hiddenRsu));
        if (map == null) throw new ArgumentNullException(nameof(map));
        if (marks == null) throw new ArgumentNullException(nameof(marks));
        if (xray == null) throw new ArgumentNullException(nameof(xray));
        if (keys == null) throw new ArgumentNullException(nameof(keys));

        var hidden = new HashSet<string>(hiddenRsu, StringComparer.Ordinal);
        var visits = input.Visits
            .Where(visit => ReceptionMap.LaneOf(statuses, hidden, visit.Status, visit.Rsu) != Lane.Hidden)
            .OrderBy(visit => visit, AcceptedOrder.Instance)
            .ToArray();

        var live = new List<(VisitRow Visit, Dictionary<ArrangeCol, Built> Cells, VisitMark? Mark)>();
        var ended = new List<ArrangeEnded>();
        foreach (var visit in visits)
        {
            marks.TryGetValue(visit.VisitId, out var mark);
            if (mark?.EndedAt != null)
            {
                ended.Add(new ArrangeEnded(keys.KeyOf(input.Day, visit.VisitId), mark.EndedAt));
                continue;
            }
            live.Add((visit, CellsOf(visit, mark, map, input.RxNames, xray), mark));
        }

        // 순서(AC-3305.5): 칸마다 끝나지 않은 칸을 (처방·넣은 시각, 접수 순)으로. 시각을 모르면 뒤로
        var ords = new Dictionary<(int Row, ArrangeCol Col), int>();
        foreach (var col in QueueCols)
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
                : new ReadOnlyDictionary<ArrangeCol, ArrangeCell>(entry.Cells.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value.Cell.WithOrd(ords.TryGetValue((index, pair.Key), out var ord) ? ord : (int?)null)));
            return new ArrangeRow(keys.KeyOf(input.Day, entry.Visit.VisitId), entry.Mark?.Away, entry.Mark?.Ptf, Clean(entry.Visit.LastSymptom) ?? "", cells);
        }).ToArray();

        return new Arrange(rows, ended.OrderByDescending(e => e.EndedAt, StringComparer.Ordinal).ToArray());
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

    private static Dictionary<ArrangeCol, Built> CellsOf(
        VisitRow visit, VisitMark? mark, IReadOnlyList<ArrangeRule> map, IReadOnlyDictionary<string, string> names, IReadOnlyDictionary<string, string> xray)
    {
        // ① 처방 칸마다 모으기: 가장 이른 시각, 처음 빈 글 아닌 부위
        var fromOrders = new Dictionary<ArrangeCol, (string? At, string? Part)>();
        foreach (var order in visit.Orders)
        {
            names.TryGetValue(order.Code, out var name);
            if (!(ArrangeMap.Match(map, order.Code, name) is ArrangeCol col) || !OrderCols.Contains(col)) continue;
            var at = Time(order.At);
            var part = Clean(order.Part);
            if (fromOrders.TryGetValue(col, out var seen))
                fromOrders[col] = (Earlier(seen.At, at), seen.Part ?? part);
            else
                fromOrders[col] = (at, part);
        }

        var cells = new Dictionary<ArrangeCol, Built>();
        foreach (ArrangeCol col in Enum.GetValues(typeof(ArrangeCol)))
        {
            CellMark? marked = null;
            mark?.Cells.TryGetValue(col, out marked);
            var hasOrder = fromOrders.TryGetValue(col, out var order);
            var manualOnly = ArrangeMap.ManualOnly.Contains(col);
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
                built = new Built(new ArrangeCell(marked.St, marked.Det, part, AtOf(marked, since), null, manual), since);
            }
            else if (hasOrder && !manualOnly)
            {
                built = new Built(new ArrangeCell(ArrangeStep.Todo, "", IsQueue(col) ? order.Part : null, order.At, null, false), order.At);
            }

            // ④ X-ray 완료 표시
            if (col == ArrangeCol.Xray && xray.TryGetValue(visit.VisitId, out var shot) && Time(shot) is string shotAt)
            {
                built = built == null
                    ? new Built(new ArrangeCell(ArrangeStep.Done, "", null, shotAt, null, true), shotAt)
                    : new Built(new ArrangeCell(ArrangeStep.Done, built.Cell.Det, null, shotAt, null, built.Cell.Manual), built.Since);
            }

            if (built != null) cells[col] = built;
        }
        return cells;
    }

    /// <summary>표시의 단계에 따른 보일 시각: ready면 readyAt, done이면 doneAt, 그 밖·없으면 처방(넣은) 시각.</summary>
    private static string? AtOf(CellMark marked, string? since) => marked.St switch
    {
        ArrangeStep.Ready => Time(marked.ReadyAt) ?? since,
        ArrangeStep.Done => Time(marked.DoneAt) ?? since,
        _ => since,
    };

    private static bool IsQueue(ArrangeCol col) => col == ArrangeCol.Sono || col == ArrangeCol.Carm;

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
