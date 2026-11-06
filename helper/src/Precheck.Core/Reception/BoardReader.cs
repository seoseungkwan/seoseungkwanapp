using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.Reception;

/// <summary>
/// 오늘 접수 현황을 비트에서 한 번 읽는다(design.md 3절, REQ-1403). 등록 확인을 마친 세션(HospitalGate)에서 부른다.
/// 이름표(그날 처음이면) → 오늘 접수 → 오늘 처방 → 지난 내원 → 지난 처방 차례로 ReceptionSql 문장만 ReadOnlyGuard를 지나 돌리고 날 줄(BoardInput)로 바꾼다.
/// 읽기 한 번의 시간 제한은 8초다(AC-1403.4): 문장마다 남은 시간을 시간 제한으로 주고, 다 쓰면 다음 문장을 돌리지 않고 E-BIT-READ-FAILED.
/// 하나라도 실패하면 예외가 올라가 일부만 주는 일이 없다(AC-1403.5). 그 뒤 확인 결과로 채운 칸(이름·생년월일·성별, 접수 메모, 수납 시각)을 읽는다(TASK-29).
/// </summary>
public static class BoardReader
{
    /// <summary>읽기 한 번의 시간 제한(AC-1403.4).</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(8);

    private const string Midnight = "0000";

    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    /// <summary>
    /// now의 날(yyyyMMdd 0000 ~ 다음 날 0000) 이 병원(hospitalScope) 외래 접수를 읽는다. clock은 8초 시간 제한을 재는 시계다.
    /// names(그날 이름표)를 주면 이름표를 다시 읽지 않고, null이면 먼저 읽는다(AC-1403.7).
    /// </summary>
    public static BoardInput Read(IBitDb db, string hospitalScope, DateTime now, Func<DateTime> clock, IReadOnlyDictionary<string, string>? names = null) =>
        Read(db, hospitalScope, now, clock, names, ReceptionMap.Columns);

    /// <summary>
    /// columns(확인 결과로 채운 칸, 보통 ReceptionMap.Columns)에 칸이 있을 때만 그 칸 문장을 돌린다: 이름·생년월일·성별 → TodayPeople,
    /// 접수 메모 → TodayMemos, 수납 시각 → TodayPaid. 찾지 못한 칸(null)은 돌리지 않고 그 값만 비운다(AC-1402.7).
    /// </summary>
    public static BoardInput Read(
        IBitDb db, string hospitalScope, DateTime now, Func<DateTime> clock, IReadOnlyDictionary<string, string>? names, ColumnPlan? columns)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (clock == null) throw new ArgumentNullException(nameof(clock));
        var deadline = clock() + Timeout;
        var day = now.Date;
        var today = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Key(day) + Midnight,
            ["@to"] = Key(day.AddDays(1)) + Midnight,
            ["@hospital"] = hospitalScope,
        };

        var table = names ?? Names(Query(db, ReceptionSql.RxNames, NoArgs, clock, deadline));
        var visits = Visits(Query(db, ReceptionSql.TodayVisits, today, clock, deadline));
        var todayRx = CodesBy(Query(db, ReceptionSql.TodayRx, today, clock, deadline));
        var prior = Prior(Query(db, ReceptionSql.PriorVisits, today, clock, deadline));
        var priorRx = CodesBy(Query(db, ReceptionSql.PriorRx, today, clock, deadline));
        var people = columns?.Name != null || columns?.BirthDate != null || columns?.Sex != null
            ? ByVisit(Query(db, ReceptionSql.TodayPeople, today, clock, deadline), 4)
            : NoRows;
        var memos = columns?.Memo != null ? ByVisit(Query(db, ReceptionSql.TodayMemos, today, clock, deadline), 2) : NoRows;
        var paid = columns?.PaidAt != null ? ByVisit(Query(db, ReceptionSql.TodayPaid, today, clock, deadline), 2) : NoRows;

        var rows = visits.Select(visit =>
        {
            todayRx.TryGetValue(visit.Id, out var codes);
            var last = prior.TryGetValue(visit.Id, out var found) ? found : null;
            List<string?>? lastCodes = null;
            if (last?.VisitId != null) priorRx.TryGetValue(last.VisitId, out lastCodes);
            var person = people.TryGetValue(visit.Id, out var p) ? p : null;
            return new VisitRow(
                visit.Id,
                visit.Chart,
                visit.AcceptedAt,
                visit.Status,
                visit.Rsu,
                todayRx: RxItem.Of(codes ?? Enumerable.Empty<string?>(), table),
                earlierCount: last?.Count ?? 0,
                lastVisitId: last?.VisitId,
                lastDay: last?.Day,
                lastRx: RxItem.Of(lastCodes ?? Enumerable.Empty<string?>(), table),
                name: columns?.Name != null ? Id(person?[1]) : null,
                birthDate: columns?.BirthDate != null ? Id(person?[2]) : null,
                sex: columns?.Sex != null ? Id(person?[3]) : null,
                memo: memos.TryGetValue(visit.Id, out var memo) ? Id(memo[1]) : null,
                paidAt: paid.TryGetValue(visit.Id, out var paidRow) ? Id(paidRow[1]) : null);
        }).ToArray();

        return new BoardInput(Key(day), now, rows, table);
    }

    private sealed class TodayLine
    {
        public TodayLine(string id, string chart, string acceptedAt, string? status, string? rsu)
        {
            Id = id;
            Chart = chart;
            AcceptedAt = acceptedAt;
            Status = status;
            Rsu = rsu;
        }

        public string Id { get; }
        public string Chart { get; }
        public string AcceptedAt { get; }
        public string? Status { get; }
        public string? Rsu { get; }
    }

    private sealed class PriorLine
    {
        public PriorLine(long count, string? visitId, string? day)
        {
            Count = count;
            VisitId = visitId;
            Day = day;
        }

        public long Count { get; }
        public string? VisitId { get; }
        public string? Day { get; }
    }

    /// <summary>이름표 줄(Code, Name, AdpDte) → 코드 → 이름. 빈 코드·빈 이름은 버리고 앞뒤 공백은 뺀다. 같은 코드는 처음 것(문장이 코드마다 한 줄을 준다).</summary>
    private static IReadOnlyDictionary<string, string> Names(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, 2))
        {
            var code = Id(row[0]);
            var name = Id(row[1]);
            if (code != null && name != null && !names.ContainsKey(code)) names.Add(code, name);
        }
        return names;
    }

    /// <summary>
    /// 오늘 접수 줄(VisitId, PatientId, AcceptedAt, Status, Rsu). 내원번호가 빈 줄은 빼고 같은 내원은 처음 줄만.
    /// 차트번호는 SQL RTRIM처럼 오른쪽 공백만 뺀다: char(14) 칸이 앞을 공백으로 채운 번호면 앞 공백까지 지운 글로는 상세의 c.OcmChtNum=@chart가 그 환자를 못 찾는다.
    /// </summary>
    private static List<TodayLine> Visits(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var visits = new List<TodayLine>();
        foreach (var row in Cells(rows, 5))
        {
            var id = Id(row[0]);
            if (id == null || !seen.Add(id)) continue;
            visits.Add(new TodayLine(id, Chart(row[1]), Text(row[2]) ?? "", Text(row[3]), Text(row[4])));
        }
        return visits;
    }

    /// <summary>차트번호 칸: 오른쪽 공백만 뺀 원값(앞 공백은 그대로). 공백뿐이거나 NULL이면 "".</summary>
    private static string Chart(object? cell)
    {
        var text = Text(cell)?.TrimEnd(' ') ?? "";
        return text.Trim().Length == 0 ? "" : text;
    }

    /// <summary>(내원번호, 처방 코드) 줄 → 내원번호 → 코드들.</summary>
    private static Dictionary<string, List<string?>> CodesBy(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var codes = new Dictionary<string, List<string?>>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, 2))
        {
            var id = Id(row[0]);
            if (id == null) continue;
            if (!codes.TryGetValue(id, out var list)) codes.Add(id, list = new List<string?>());
            list.Add(Text(row[1]));
        }
        return codes;
    }

    /// <summary>지난 내원 줄(TodayVisitId, EarlierCount, LastVisitId, LastDay) → 오늘 내원번호 → 앞선 내원 수·가장 최근 것.</summary>
    private static Dictionary<string, PriorLine> Prior(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var prior = new Dictionary<string, PriorLine>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, 4))
        {
            var id = Id(row[0]);
            if (id == null || prior.ContainsKey(id)) continue;
            prior.Add(id, new PriorLine(Count(row[1]), Id(row[2]), Id(row[3])));
        }
        return prior;
    }

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<object?>> NoRows = new Dictionary<string, IReadOnlyList<object?>>();

    /// <summary>(내원번호, 값…) 줄 → 내원번호 → 그 줄. 내원번호가 빈 줄은 빼고 같은 내원은 처음 줄만.</summary>
    private static IReadOnlyDictionary<string, IReadOnlyList<object?>> ByVisit(IReadOnlyList<IReadOnlyList<object?>> rows, int cells)
    {
        var byVisit = new Dictionary<string, IReadOnlyList<object?>>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, cells))
        {
            var id = Id(row[0]);
            if (id != null && !byVisit.ContainsKey(id)) byVisit.Add(id, row);
        }
        return byVisit;
    }

    /// <summary>정해 둔 문장을 남은 시간 안에서 돌린다. 시간이 다 갔으면 돌리지 않고 시간 지남(E-BIT-READ-FAILED).</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Query(
        IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, Func<DateTime> clock, DateTime deadline)
    {
        var left = deadline - clock();
        if (left <= TimeSpan.Zero) throw ReadFailed();
        return ReadOnlyGuard.Query(db, sql, args, left);
    }

    /// <summary>줄마다 칸이 모자라면 지어내지 않고 읽기 실패로 본다.</summary>
    private static IEnumerable<IReadOnlyList<object?>> Cells(IReadOnlyList<IReadOnlyList<object?>> rows, int cells)
    {
        foreach (var row in rows)
        {
            if (row == null || row.Count < cells) throw ReadFailed();
            yield return row;
        }
    }

    /// <summary>칸 글자 원값(DB NULL은 null). 글자가 아니면 문화권 없이 글자로.</summary>
    private static string? Text(object? cell) =>
        cell == null ? null : cell as string ?? Convert.ToString(cell, CultureInfo.InvariantCulture);

    /// <summary>번호·코드·이름 칸: 앞뒤 공백을 빼고, 비면 null.</summary>
    private static string? Id(object? cell)
    {
        var text = Text(cell)?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    /// <summary>앞선 내원 수. 숫자가 아니거나 음수면 읽기 실패.</summary>
    private static long Count(object? cell)
    {
        if (cell == null) return 0;
        long count;
        try
        {
            count = Convert.ToInt64(cell, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw ReadFailed();
        }
        if (count < 0) throw ReadFailed();
        return count;
    }

    private static string Key(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}
