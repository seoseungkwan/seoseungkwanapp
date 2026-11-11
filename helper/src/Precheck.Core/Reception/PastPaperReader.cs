using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Reception;

/// <summary>지난 진료기록부 한 쪽의 크기(spec reception-memo-papers AC-3404.1): 처음 쪽(from=0)은 2장, 그 뒤는 3장씩.</summary>
public static class PaperChunk
{
    public const int First = 2;

    public const int Next = 3;

    /// <summary>시작 위치 from에서 이번에 주는 장 수.</summary>
    public static int SizeAt(int from) => from == 0 ? First : Next;
}

/// <summary>
/// 지난 진료기록부 한 쪽(spec reception-memo-papers design.md 4절, AC-3404.1). 종이 칸은 직전 기록부(PrevPaper)와 같고 사람 칸·내원번호는 없다.
/// 요청마다 만들고 서버에 쌓지 않는다.
/// </summary>
public sealed class PastPapers
{
    /// <summary>지난 내원이 없거나 읽을 것이 없는 쪽.</summary>
    public static readonly PastPapers Empty = new PastPapers(new PrevPaper[0], 0, null);

    public PastPapers(IReadOnlyList<PrevPaper> papers, long total, int? next)
    {
        Papers = papers ?? throw new ArgumentNullException(nameof(papers));
        if (total < 0) throw new ArgumentOutOfRangeException(nameof(total));
        if (next < 0) throw new ArgumentOutOfRangeException(nameof(next));
        Total = total;
        Next = next;
    }

    /// <summary>이번 쪽의 종이(최근 순).</summary>
    public IReadOnlyList<PrevPaper> Papers { get; }

    /// <summary>그 접수보다 앞선 이 병원 완료 외래 내원 수(상세 HistoryCount와 같은 수).</summary>
    public long Total { get; }

    /// <summary>더 있으면 다음 시작 위치(앞에서 준 장 수), 없으면 null.</summary>
    public int? Next { get; }

    /// <summary>
    /// 태블릿·폰에 보내는 JSON: <c>{"papers":[{date, ago, room, ins, sym, dx:[{code, name, main}], rx:[{code, name, qty, tms, day}], out:[…]}], "total": N, "next": N|null}</c>.
    /// 글자 설정은 직전 기록부·상세 답과 같다.
    /// </summary>
    public string ToJson() => PrevPaper.Write(writer =>
    {
        writer.WriteStartObject();
        writer.WriteStartArray("papers");
        foreach (var paper in Papers)
        {
            writer.WriteStartObject();
            paper.WriteFields(writer);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteNumber("total", Total);
        if (Next is int next) writer.WriteNumber("next", next);
        else writer.WriteNull("next");
        writer.WriteEndObject();
    });
}

/// <summary>지난 진료기록부 답. State는 상세 답과 같은 셋(200·404·503). Error는 볼 수 없게 된 까닭의 오류 번호만(기록용).</summary>
public sealed class PastResult
{
    private PastResult(HistoryState state, PastPapers? papers, string? error)
    {
        State = state;
        Papers = papers;
        Error = error;
    }

    public static PastResult Ok(PastPapers papers) =>
        new PastResult(HistoryState.Ok, papers ?? throw new ArgumentNullException(nameof(papers)), null);

    public static PastResult NotFound() => new PastResult(HistoryState.NotFound, null, null);

    public static PastResult Unavailable(string? error) => new PastResult(HistoryState.Unavailable, null, error);

    public HistoryState State { get; }

    /// <summary>State가 Ok일 때만 있다. JSON은 Papers.ToJson().</summary>
    public PastPapers? Papers { get; }

    public string? Error { get; }
}

/// <summary>
/// 지난 진료기록부 여러 장 읽기(spec reception-memo-papers design.md 4절, REQ-3404). 상세를 열 때와 [더 보기]를 누를 때만 그 환자 한 명의 지난 종이 한 쪽을 읽는다.
/// 시작 위치·열쇠가 틀리거나 그날 판에 그 내원이 없으면 비트를 읽지 않고 404다(HistoryReader와 같은 확인). 지난 내원이 없으면 비트를 열지 않고 빈 쪽이다.
/// 읽기는 등록 확인(HospitalGate)을 지난 세션에서 ReceptionSql.HistoryCount → PastPaperVisits → PastPaperSymptoms → PastPaperDx → PastPaperOrders만
/// ReadOnlyGuard를 지나 차례로 돌린다(시간 제한 8초, 문장마다 남은 시간). 하나라도 실패하면 일부만 주지 않는다.
/// 종이 칸·글 정리는 직전 기록부(PrevPaperReader.Paper)와 같다(AC-3404.2).
/// </summary>
public static class PastPaperReader
{
    /// <summary>
    /// `GET /api/visit/{key}/papers?from={from}` 한 번(서버가 부르는 곳). 던지지 않는다.
    /// 시작 위치가 0 이상 정수 글이 아니거나, 열쇠가 그날 열쇠표에 없거나, 그날 접수 현황(board, 보통 BoardCache.Get)에 그 내원이 없으면 NotFound.
    /// 접수 현황을 볼 수 없거나 등록 확인·읽기가 실패하면 Unavailable(번호만). clock은 이 PC의 시계(오늘과 시간 제한).
    /// </summary>
    public static PastResult Get(
        BitServices services, VisitKeys keys, Func<BoardResult> board, string? key, string? from, Func<DateTime>? clock = null)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (keys == null) throw new ArgumentNullException(nameof(keys));
        if (board == null) throw new ArgumentNullException(nameof(board));
        var now = clock ?? (() => DateTime.Now);

        try
        {
            if (!HistoryReader.TryFrom(from, out var start)) return PastResult.NotFound();
            var today = now();
            var found = keys.Find(today.ToString("yyyyMMdd", CultureInfo.InvariantCulture), key);
            if (found == null) return PastResult.NotFound();

            var current = board();
            if (current == null || !current.IsOk) return PastResult.Unavailable(current?.Error ?? BitErrors.ReadFailed);
            var input = current.Input!;
            if (!string.Equals(input.Day, found.Day, StringComparison.Ordinal)) return PastResult.NotFound();
            var visit = input.Visits.FirstOrDefault(row => string.Equals(row.VisitId, found.VisitId, StringComparison.Ordinal));
            if (visit == null) return PastResult.NotFound();

            // 지난 내원이 없으면(첫 방문) 비트를 열지도 않는다(직전 기록부와 같다)
            if (string.IsNullOrWhiteSpace(visit.LastVisitId)) return PastResult.Ok(PastPapers.Empty);

            using var hospital = HospitalGate.Open(services);
            var deadline = now() + HistoryReader.Timeout;
            return PastResult.Ok(Read(hospital.Db, hospital.Registration.Scope, visit, input, start, today, now, deadline));
        }
        catch (Exception e)
        {
            return PastResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }
    }

    /// <summary>
    /// 그날 접수(visit) 환자의 지난 완료 내원 중 최근 순 from+1 ~ from+PaperChunk.SizeAt(from)번째의 종이를 읽는다(AC-3404.1).
    /// 등록 확인을 마친 세션(db)·등록 범위(hospitalScope)·읽기 한 번의 끝 시각(deadline)으로 부른다.
    /// @chart는 접수 현황 줄의 차트번호에서 끝 공백만 뺀 값(앞 공백은 char(14) 칸의 글자라 그대로), @before는 접수 시각 원값, @hospital은 등록 범위.
    /// 수(HistoryCount)를 읽고 from이 그 수보다 작을 때만 문장 넷을 돌린다. 줄은 첫 칸 내원번호(앞뒤 공백 무시)로 내원마다 묶고,
    /// 내원 줄은 첫 줄만, 한 쪽보다 많이 두지 않는다. 차트번호나 접수 시각이 비면 다른 환자를 읽지 않게 아무 문장도 돌리지 않고 빈 쪽이다.
    /// 처방 이름이 빈 줄은 그날 이름표(board.RxNames)로 채운다. "N일 전"은 today의 날로 센다.
    /// </summary>
    public static PastPapers Read(
        IBitDb db, string hospitalScope, VisitRow visit, BoardInput board, int from, DateTime today, Func<DateTime> clock, DateTime deadline)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (visit == null) throw new ArgumentNullException(nameof(visit));
        if (board == null) throw new ArgumentNullException(nameof(board));
        if (clock == null) throw new ArgumentNullException(nameof(clock));
        if (from < 0) throw new ArgumentOutOfRangeException(nameof(from));

        // HistoryReader와 같은 까닭으로 차트번호의 앞 공백은 지우지 않는다
        var chart = visit.PatientId.TrimEnd(' ');
        if (chart.Trim().Length == 0 || visit.AcceptedAt.Trim().Length == 0) return PastPapers.Empty;

        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@chart"] = chart,
            ["@before"] = visit.AcceptedAt,
            ["@hospital"] = hospitalScope,
        };
        var total = Count(HistoryReader.Query(db, ReceptionSql.HistoryCount, args, clock, deadline));
        if (from >= total) return new PastPapers(new PrevPaper[0], total, null);

        var size = PaperChunk.SizeAt(from);
        var page = new Dictionary<string, object?>(args, StringComparer.Ordinal)
        {
            ["@first"] = (int)Math.Min((long)from + 1, int.MaxValue),
            ["@last"] = (int)Math.Min((long)from + size, int.MaxValue),
        };
        var visits = PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PastPaperVisits, page, clock, deadline), 4);
        var symptoms = ByVisit(PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PastPaperSymptoms, page, clock, deadline), 2));
        var diagnoses = ByVisit(PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PastPaperDx, page, clock, deadline), 4));
        var orders = ByVisit(PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PastPaperOrders, page, clock, deadline), 7));

        var papers = new List<PrevPaper>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in visits)
        {
            var id = Id(row[0]);
            // 내원 줄은 첫 줄만(겹친 DepMst 줄 때문에 여럿일 수 있다). 한 쪽보다 많이 두지 않는다
            if (id == null || !seen.Add(id)) continue;
            if (papers.Count == size) break;
            papers.Add(PrevPaperReader.Paper(
                Rest(row),
                RowsOf(symptoms, id).Select(line => line[0]),
                RowsOf(diagnoses, id),
                RowsOf(orders, id),
                board.RxNames,
                today));
        }

        var shown = (long)from + papers.Count;
        int? next = papers.Count > 0 && shown < total && shown <= int.MaxValue ? (int)shown : null;
        return new PastPapers(papers, total, next);
    }

    /// <summary>줄(VisitId, …) → 내원번호(앞뒤 공백 뺌) → 내원번호 칸을 뺀 줄들(비트가 준 차례). 내원번호가 빈 줄은 버린다.</summary>
    private static Dictionary<string, List<IReadOnlyList<object?>>> ByVisit(IEnumerable<IReadOnlyList<object?>> rows)
    {
        var groups = new Dictionary<string, List<IReadOnlyList<object?>>>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var id = Id(row[0]);
            if (id == null) continue;
            if (!groups.TryGetValue(id, out var list))
            {
                list = new List<IReadOnlyList<object?>>();
                groups.Add(id, list);
            }
            list.Add(Rest(row));
        }
        return groups;
    }

    private static IReadOnlyList<IReadOnlyList<object?>> RowsOf(Dictionary<string, List<IReadOnlyList<object?>>> groups, string id) =>
        groups.TryGetValue(id, out var rows) ? rows : (IReadOnlyList<IReadOnlyList<object?>>)new IReadOnlyList<object?>[0];

    /// <summary>첫 칸(내원번호)을 뺀 줄.</summary>
    private static IReadOnlyList<object?> Rest(IReadOnlyList<object?> row) => row.Skip(1).ToArray();

    /// <summary>내원번호 칸: 앞뒤 공백을 빼고, 비면 null.</summary>
    private static string? Id(object? cell)
    {
        var text = HistoryReader.Text(cell)?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    /// <summary>수 줄(Count, FirstDay) 하나 → 앞선 완료 내원 수. 줄이 없거나 수가 숫자가 아니거나 음수면 읽기 실패(HistoryReader와 같은 규칙).</summary>
    private static long Count(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = HistoryReader.Cells(rows, 2).FirstOrDefault() ?? throw ReadFailed();
        if (row[0] == null) return 0;
        long count;
        try
        {
            count = Convert.ToInt64(row[0], CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw ReadFailed();
        }
        if (count < 0) throw ReadFailed();
        return count;
    }

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}
