using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace Precheck.Core.Reception;

/// <summary>POST /api/arrange 몸 하나(AC-3306.1): 열쇠, op, 칸(있으면), 글(있으면).</summary>
public sealed class ArrangeOp
{
    public ArrangeOp(string key, string op, ArrangeCol? col, string? v)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        Op = op ?? throw new ArgumentNullException(nameof(op));
        Col = col;
        V = v;
    }

    public string Key { get; }

    public string Op { get; }

    public ArrangeCol? Col { get; }

    public string? V { get; }
}

/// <summary>
/// 쓰기 하나의 결과: 상태(204·400·404), 어레인지 표시를 바꾸면 ChangesMarks와 새 표시(Next, null이면 그 내원 표시를 지움),
/// X-ray 완료 표시를 켜거나 끄면 Xray(true·false, 건드리지 않으면 null, AC-3306.4).
/// </summary>
public sealed class ArrangeWriteResult
{
    private ArrangeWriteResult(int status, bool changesMarks, VisitMark? next, bool? xray)
    {
        Status = status;
        ChangesMarks = changesMarks;
        Next = next;
        Xray = xray;
    }

    public int Status { get; }

    public bool ChangesMarks { get; }

    public VisitMark? Next { get; }

    public bool? Xray { get; }

    internal static ArrangeWriteResult Refused(int status) => new ArrangeWriteResult(status, false, null, null);

    internal static ArrangeWriteResult Marks(VisitMark next, bool? xray = null) =>
        new ArrangeWriteResult(204, true, next.IsEmpty ? null : next, xray);

    internal static ArrangeWriteResult XrayOnly(bool on) => new ArrangeWriteResult(204, false, null, on);
}

/// <summary>
/// 어레인지 쓰기 계산(spec reception-arrange design.md 8절, REQ-3306). 라우터가 지금 판으로 만든 그 줄의 칸 상태와 지금 표시를 주면
/// 새 표시(또는 X-ray 완료 표시)를 정한다. 시각은 서버 시계의 "HH:MM"(hhmm)이다(AC-3306.3).
/// op: step(다음 단계) · set(v = todo·ready·done) · add(빈 칸에 목록 글) · remove(직접 넣은 칸 빼기) · part(SONO·C-ARM 부위) ·
/// away(on·off) · ptf(up·down·off) · end(on·off).
/// </summary>
public static class ArrangeWrite
{
    private const string Step = "step";
    private const string Set = "set";
    private const string Add = "add";
    private const string Remove = "remove";
    private const string Part = "part";
    private const string Away = "away";
    private const string PtFirstOp = "ptf";
    private const string End = "end";

    private static readonly string[] CellOps = { Step, Set, Add, Remove, Part };
    private static readonly string[] ValueOps = { Set, Add, Part, Away, PtFirstOp, End };
    private static readonly string[] Ops = { Step, Set, Add, Remove, Part, Away, PtFirstOp, End };
    private static readonly string[] Fields = { "k", "op", "col", "v" };

    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);
    private static readonly JsonDocumentOptions BodyJson = new JsonDocumentOptions { MaxDepth = 2 };

    private static readonly Dictionary<string, ArrangeCol> ColOfKey =
        Enum.GetValues(typeof(ArrangeCol)).Cast<ArrangeCol>().ToDictionary(ArrangeMap.KeyOf, col => col, StringComparer.Ordinal);

    /// <summary>
    /// 몸이 {k, op, col?, v?} 글 칸뿐인 바른 UTF-8 JSON이고(차례 무관, 같은 칸 두 번·다른 칸은 틀림) op·칸 이름이 정해 둔 것인가(AC-3306.1).
    /// 몸 크기(256바이트)는 HttpRequestReader가 먼저 막는다.
    /// </summary>
    public static bool TryParse(byte[] body, out ArrangeOp op)
    {
        op = new ArrangeOp("", "", null, null);
        if (body == null) return false;
        try
        {
            using var document = JsonDocument.Parse(StrictUtf8.GetString(body), BodyJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;
            var values = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var property in root.EnumerateObject())
            {
                if (!Fields.Contains(property.Name) || values.ContainsKey(property.Name) || property.Value.ValueKind != JsonValueKind.String) return false;
                values[property.Name] = property.Value.GetString()!;
            }
            if (!values.TryGetValue("k", out var key) || !values.TryGetValue("op", out var name) || !Ops.Contains(name)) return false;
            ArrangeCol? col = null;
            if (values.TryGetValue("col", out var colName))
            {
                if (!ColOfKey.TryGetValue(colName, out var found)) return false;
                col = found;
            }
            values.TryGetValue("v", out var v);
            op = new ArrangeOp(key, name, col, v);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    /// <summary>
    /// 쓰기 하나를 계산한다. current는 그 내원의 지금 어레인지 표시(없으면 null), cells는 지금 판으로 만든 그 줄의 칸(없는 칸은 빠짐).
    /// 칸·글이 op에 맞지 않으면 400, 처방도 표시도 없는 칸의 step·set·part·remove는 404(AC-3306.5).
    /// paid는 그 접수가 지금 수납완료(끝남 칸)인지: end off면 kept를 남겨 그날 다시 저절로 빠지지 않게 한다(AC-3306.7).
    /// </summary>
    public static ArrangeWriteResult Apply(ArrangeOp op, VisitMark? current, IReadOnlyDictionary<ArrangeCol, ArrangeCell> cells, string hhmm, bool paid = false)
    {
        if (op == null) throw new ArgumentNullException(nameof(op));
        if (cells == null) throw new ArgumentNullException(nameof(cells));
        if (hhmm == null) throw new ArgumentNullException(nameof(hhmm));
        if (CellOps.Contains(op.Op) != op.Col.HasValue || ValueOps.Contains(op.Op) != (op.V != null)) return ArrangeWriteResult.Refused(400);

        var mark = current ?? new VisitMark();
        switch (op.Op)
        {
            case Away:
                return OnOff(op.V, () => mark.WithAway(hhmm), () => mark.WithAway(null));
            case End:
                return OnOff(op.V, () => mark.WithEnded(hhmm), () => paid ? mark.WithEnded(null).WithKept(true) : mark.WithEnded(null));
            case PtFirstOp:
                if (op.V == "up" || op.V == "down") return ArrangeWriteResult.Marks(mark.WithPtf(new PtFirst(op.V, hhmm)));
                return op.V == "off" ? ArrangeWriteResult.Marks(mark.WithPtf(null)) : ArrangeWriteResult.Refused(400);
        }

        var col = op.Col!.Value;
        cells.TryGetValue(col, out var cell);
        switch (op.Op)
        {
            case Add:
                return AddCell(mark, col, cell, op.V!, hhmm);
            case Remove:
                return RemoveCell(mark, col, cell);
            case Part:
                if (!IsQueue(col) || !ArrangeChoices.Parts.Contains(op.V!)) return ArrangeWriteResult.Refused(400);
                if (cell == null) return ArrangeWriteResult.Refused(404);
                var based = BaseOf(mark, col, cell);
                return ArrangeWriteResult.Marks(mark.WithCell(col, new CellMark(based.St, based.Manual, based.Det, op.V, based.ReadyAt, based.DoneAt, based.AddedAt)));
            case Set:
                var target = StepOf(op.V!);
                if (target == null || (target == ArrangeStep.Ready && !IsQueue(col))) return ArrangeWriteResult.Refused(400);
                if (cell == null) return ArrangeWriteResult.Refused(404);
                return MoveTo(mark, col, cell, target.Value, hhmm);
            default: // step
                if (cell == null) return ArrangeWriteResult.Refused(404);
                if (cell.St == ArrangeStep.Done) return ArrangeWriteResult.Refused(400);
                var next = cell.St == ArrangeStep.Todo && IsQueue(col) ? ArrangeStep.Ready : ArrangeStep.Done;
                return MoveTo(mark, col, cell, next, hhmm);
        }
    }

    private static ArrangeWriteResult OnOff(string? v, Func<VisitMark> on, Func<VisitMark> off) =>
        v == "on" ? ArrangeWriteResult.Marks(on()) : v == "off" ? ArrangeWriteResult.Marks(off()) : ArrangeWriteResult.Refused(400);

    /// <summary>
    /// 단계 옮기기(AC-3306.3): 완료로 가면 doneAt = 지금, 준비완료로 가면 앞(준비) 쪽에서 오면 readyAt = 지금, 뒤(완료)에서 돌아오면 readyAt을 남기고 doneAt을 지움,
    /// 준비로 가면 두 시각을 지운다. X-RAY는 어레인지 표시 대신 X-ray 완료 표시를 켜고 끈다(AC-3306.4).
    /// </summary>
    private static ArrangeWriteResult MoveTo(VisitMark mark, ArrangeCol col, ArrangeCell cell, ArrangeStep target, string hhmm)
    {
        if (col == ArrangeCol.Xray) return ArrangeWriteResult.XrayOnly(target == ArrangeStep.Done);
        var based = BaseOf(mark, col, cell);
        string? readyAt = null, doneAt = null;
        if (target == ArrangeStep.Ready)
            readyAt = cell.St != ArrangeStep.Todo && based.ReadyAt != null ? based.ReadyAt : hhmm;
        else if (target == ArrangeStep.Done)
        {
            readyAt = based.ReadyAt;
            doneAt = hhmm;
        }
        return ArrangeWriteResult.Marks(mark.WithCell(col, new CellMark(target, based.Manual, based.Det, based.Part, readyAt, doneAt, based.AddedAt)));
    }

    /// <summary>빈 칸에만, 그 칸 목록의 글로 직접 넣는다: 직접 칸은 그 글이 칸 글, SONO·C-ARM은 부위(부위는 나중에면 없음), X-RAY는 칸 글 없음.</summary>
    private static ArrangeWriteResult AddCell(VisitMark mark, ArrangeCol col, ArrangeCell? cell, string v, string hhmm)
    {
        if (cell != null || !ArrangeChoices.AddOf(col).Contains(v)) return ArrangeWriteResult.Refused(400);
        var det = ArrangeMap.ManualOnly.Contains(col) ? v : "";
        var part = IsQueue(col) && v != ArrangeChoices.PartLater ? v : null;
        return ArrangeWriteResult.Marks(mark.WithCell(col, new CellMark(ArrangeStep.Todo, true, det, part, null, null, hhmm)));
    }

    /// <summary>직접 넣은 칸만 뺀다(처방에서 온 칸은 400). X-RAY가 완료였으면 X-ray 완료 표시도 끈다.</summary>
    private static ArrangeWriteResult RemoveCell(VisitMark mark, ArrangeCol col, ArrangeCell? cell)
    {
        if (cell == null) return ArrangeWriteResult.Refused(404);
        if (!cell.Manual) return ArrangeWriteResult.Refused(400);
        bool? xray = col == ArrangeCol.Xray && cell.St == ArrangeStep.Done ? false : (bool?)null;
        if (!mark.Cells.ContainsKey(col)) return xray.HasValue ? ArrangeWriteResult.XrayOnly(false) : ArrangeWriteResult.Refused(404);
        return ArrangeWriteResult.Marks(mark.WithCell(col, null), xray);
    }

    /// <summary>그 칸의 지금 표시. 처방에서만 온 칸이면 준비 단계의 빈 표시(처방 칸, 부위는 비트 것을 얼리지 않게 null).</summary>
    private static CellMark BaseOf(VisitMark mark, ArrangeCol col, ArrangeCell cell) =>
        mark.Cells.TryGetValue(col, out var marked) && marked.St != ArrangeStep.Gone
            ? marked
            : new CellMark(ArrangeStep.Todo, cell.Manual, "", null, null, null, null);

    private static ArrangeStep? StepOf(string v) => v switch
    {
        "todo" => ArrangeStep.Todo,
        "ready" => ArrangeStep.Ready,
        "done" => ArrangeStep.Done,
        _ => (ArrangeStep?)null,
    };

    private static bool IsQueue(ArrangeCol col) => col == ArrangeCol.Sono || col == ArrangeCol.Carm;
}
