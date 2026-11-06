using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Reception;

/// <summary>상세 한 쪽의 지난 내원 하나(비트 날 줄). 내원번호는 휴대폰에 가지 않는다.</summary>
public sealed class HistoryVisit
{
    public HistoryVisit(string visitId, string? day, IReadOnlyList<RxItem> rx, string? symptom)
    {
        if (string.IsNullOrEmpty(visitId)) throw new ArgumentException("내원번호가 비었다", nameof(visitId));
        VisitId = visitId;
        Day = day;
        Rx = rx ?? throw new ArgumentNullException(nameof(rx));
        Symptom = symptom;
    }

    /// <summary>내원번호(OcmNum).</summary>
    public string VisitId { get; }

    /// <summary>내원 날(LEFT(OcmAcpDtm,8), yyyyMMdd 원값).</summary>
    public string? Day { get; }

    /// <summary>그 내원의 처방(코드 순, 그날 이름표의 이름).</summary>
    public IReadOnlyList<RxItem> Rx { get; }

    /// <summary>증상 글(그 내원의 S 줄을 공백 하나로 이은 것). 줄이 없거나 증상 칸이 없으면 null.</summary>
    public string? Symptom { get; }
}

/// <summary>상세 한 번 읽은 날 줄(HistoryBuilder가 글로 바꾼다).</summary>
public sealed class HistoryInput
{
    public HistoryInput(string day, int from, long earlierCount, string? firstDay, IReadOnlyList<HistoryVisit> visits, string? todaySymptom)
    {
        Day = day ?? throw new ArgumentNullException(nameof(day));
        if (from < 0) throw new ArgumentOutOfRangeException(nameof(from));
        if (earlierCount < 0) throw new ArgumentOutOfRangeException(nameof(earlierCount));
        From = from;
        EarlierCount = earlierCount;
        FirstDay = firstDay;
        Visits = visits ?? throw new ArgumentNullException(nameof(visits));
        TodaySymptom = todaySymptom;
    }

    /// <summary>오늘(yyyyMMdd, 접수 현황 날 줄의 날). 날짜 글·N일 전의 기준.</summary>
    public string Day { get; }

    /// <summary>이번 쪽의 시작 위치(앞에서 이미 준 지난 내원 수).</summary>
    public int From { get; }

    /// <summary>그 접수보다 앞선 이 병원 완료 외래 내원 수.</summary>
    public long EarlierCount { get; }

    /// <summary>가장 이른 완료 내원 날(yyyyMMdd). 없으면 null.</summary>
    public string? FirstDay { get; }

    /// <summary>이번 쪽의 지난 내원(최근 순).</summary>
    public IReadOnlyList<HistoryVisit> Visits { get; }

    /// <summary>오늘 접수의 증상 글(S 줄을 공백 하나로 이은 것). 줄이 없거나 증상 칸이 없으면 null.</summary>
    public string? TodaySymptom { get; }
}

/// <summary>상세 답의 종류: 200(자료), 404(환자 자료 없음), 503(볼 수 없음).</summary>
public enum HistoryState { Ok, NotFound, Unavailable }

/// <summary>상세 읽기 답. Error는 볼 수 없게 된 까닭의 오류 번호만(기록용). 환자 글자·예외 글은 없다.</summary>
public sealed class HistoryResult
{
    private HistoryResult(HistoryState state, VisitHistory? history, string? error)
    {
        State = state;
        History = history;
        Error = error;
    }

    public static HistoryResult Ok(VisitHistory history) =>
        new HistoryResult(HistoryState.Ok, history ?? throw new ArgumentNullException(nameof(history)), null);

    public static HistoryResult NotFound() => new HistoryResult(HistoryState.NotFound, null, null);

    public static HistoryResult Unavailable(string? error) => new HistoryResult(HistoryState.Unavailable, null, error);

    public HistoryState State { get; }

    /// <summary>State가 Ok일 때만 있다. JSON은 History.ToJson().</summary>
    public VisitHistory? History { get; }

    public string? Error { get; }
}

/// <summary>
/// 상세 읽기(design.md 5절, REQ-1404): 줄을 누르거나 [더 보기]를 누를 때만 그 환자 한 명의 지난 완료 내원을 비트에서 읽는다. 결과는 서버에 쌓지 않는다.
/// 열쇠(VisitKeys)·시작 위치가 틀리면 비트도 접수 현황도 읽지 않고 환자 자료 없음이다(AC-1404.5).
/// 읽기는 등록 확인(HospitalGate)을 지난 세션에서 ReceptionSql.HistoryCount → HistoryPage → VisitSymptoms만 ReadOnlyGuard를 지나 돌린다.
/// 읽기 한 번의 시간 제한은 8초이고(문장마다 남은 시간), 하나라도 실패하면 일부만 주지 않는다.
/// </summary>
public static class HistoryReader
{
    /// <summary>읽기 한 번의 시간 제한(접수 현황 읽기와 같은 값).</summary>
    public static readonly TimeSpan Timeout = BoardReader.Timeout;

    private const int MaxFromDigits = 10;

    private static readonly IReadOnlyDictionary<string, string> NoSymptoms = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>증상 줄 사이에 넣는 글(공백 하나, AC-1410.4).</summary>
    private const string SymptomGlue = " ";

    /// <summary>
    /// `GET /api/visit/{key}/history?from={from}` 한 번(서버가 부르는 곳). 던지지 않는다.
    /// 시작 위치가 0 이상 정수 글이 아니거나, 열쇠가 그날 열쇠표에 없거나, 그날 접수 현황(board, 보통 BoardCache.Get)에 그 내원이 없으면 NotFound.
    /// 접수 현황을 볼 수 없거나 등록 확인·읽기가 실패하면 Unavailable(번호만). clock은 이 PC의 시계(오늘과 시간 제한, 시험은 가짜 시계).
    /// </summary>
    public static HistoryResult Get(
        BitServices services, VisitKeys keys, Func<BoardResult> board, string? key, string? from, Func<DateTime>? clock = null)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (keys == null) throw new ArgumentNullException(nameof(keys));
        if (board == null) throw new ArgumentNullException(nameof(board));
        var now = clock ?? (() => DateTime.Now);

        try
        {
            if (!TryFrom(from, out var start)) return HistoryResult.NotFound();
            var found = keys.Find(Key(now()), key);
            if (found == null) return HistoryResult.NotFound();

            var current = board();
            if (current == null || !current.IsOk) return HistoryResult.Unavailable(current?.Error ?? BitErrors.ReadFailed);
            var input = current.Input!;
            if (!string.Equals(input.Day, found.Day, StringComparison.Ordinal)) return HistoryResult.NotFound();
            var visit = input.Visits.FirstOrDefault(row => string.Equals(row.VisitId, found.VisitId, StringComparison.Ordinal));
            if (visit == null) return HistoryResult.NotFound();

            using var hospital = HospitalGate.Open(services);
            var read = Read(hospital.Db, hospital.Registration.Scope, input, visit, start, now);
            return HistoryResult.Ok(HistoryBuilder.Build(read));
        }
        catch (Exception e)
        {
            return HistoryResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }
    }

    /// <summary>그날 접수(visit) 환자의 지난 완료 내원 한 쪽을 확인 결과로 채운 칸(ReceptionMap.Columns)으로 읽는다.</summary>
    public static HistoryInput Read(IBitDb db, string hospitalScope, BoardInput board, VisitRow visit, int from, Func<DateTime> clock) =>
        Read(db, hospitalScope, board, visit, from, clock, ReceptionMap.Columns);

    /// <summary>
    /// 그날 접수(visit) 환자의 지난 완료 내원 한 쪽을 읽는다(AC-1404.1). 등록 확인을 마친 세션(db)과 등록 범위(hospitalScope)로 부른다.
    /// 수·첫날(HistoryCount)을 읽고, from이 그 수보다 작을 때만 최근 순 from+1 ~ from+HistoryChunk.SizeAt(from)번째(HistoryPage)를 읽는다.
    /// columns(보통 ReceptionMap.Columns)에 증상 칸이 있으면 같은 매개변수로 VisitSymptoms를 돌려 이 쪽 내원과 오늘 접수의 증상 글을 붙인다(AC-1410.4).
    /// 처방 이름은 그날 이름표(board.RxNames)로 붙인다. 차트번호나 접수 시각이 비면 다른 환자를 읽지 않게 아무 문장도 돌리지 않는다.
    /// </summary>
    public static HistoryInput Read(
        IBitDb db, string hospitalScope, BoardInput board, VisitRow visit, int from, Func<DateTime> clock, ColumnPlan? columns)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (board == null) throw new ArgumentNullException(nameof(board));
        if (visit == null) throw new ArgumentNullException(nameof(visit));
        if (clock == null) throw new ArgumentNullException(nameof(clock));
        if (from < 0) throw new ArgumentOutOfRangeException(nameof(from));
        var deadline = clock() + Timeout;

        var chart = visit.PatientId.Trim();
        long count = 0;
        string? firstDay = null;
        var lines = new List<PageLine>();
        var symptoms = NoSymptoms;
        if (chart.Length > 0 && visit.AcceptedAt.Trim().Length > 0)
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@chart"] = chart,
                ["@before"] = visit.AcceptedAt,
                ["@hospital"] = hospitalScope,
            };
            (count, firstDay) = Count(Query(db, ReceptionSql.HistoryCount, args, clock, deadline));
            var size = HistoryChunk.SizeAt(from);
            var page = new Dictionary<string, object?>(args, StringComparer.Ordinal)
            {
                ["@first"] = (int)Math.Min((long)from + 1, int.MaxValue),
                ["@last"] = (int)Math.Min((long)from + size, int.MaxValue),
            };
            if (from < count) lines = Page(Query(db, ReceptionSql.HistoryPage, page, clock, deadline), size);
            if (columns?.Symptom != null)
            {
                var wanted = lines.Select(line => line.VisitId).Concat(new[] { visit.VisitId }).ToArray();
                symptoms = Symptoms(Query(db, ReceptionSql.VisitSymptoms, page, clock, deadline), wanted);
            }
        }

        var visits = lines
            .Select(line => new HistoryVisit(line.VisitId, line.Day, RxItem.Of(line.Codes, board.RxNames), SymptomOf(symptoms, line.VisitId)))
            .ToArray();
        return new HistoryInput(board.Day, from, count, firstDay, visits, SymptomOf(symptoms, visit.VisitId));
    }

    /// <summary>시작 위치 글(?from=N): 0 이상 int 범위의 아라비아 숫자 글자만(부호·공백·소수점·다른 숫자 글자 없음).</summary>
    public static bool TryFrom(string? text, out int from)
    {
        from = 0;
        if (string.IsNullOrEmpty(text) || text!.Length > MaxFromDigits) return false;
        foreach (var c in text)
            if (c < '0' || c > '9') return false;
        return int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out from);
    }

    /// <summary>
    /// 증상 줄(VisitId, Line) → 내원번호 → 증상 글(design.md '증상 원천', AC-1410.4). visitIds(이 쪽 내원 + 오늘 접수)의 줄만, 비트가 준 차례대로
    /// 줄마다 앞뒤 공백을 빼고 공백 하나로 잇는다. 빈 글·공백만 있는 줄과 내원번호가 빈 줄은 버리고, 칸이 모자란 줄은 읽기 실패로 본다.
    /// </summary>
    private static IReadOnlyDictionary<string, string> Symptoms(IReadOnlyList<IReadOnlyList<object?>> rows, IReadOnlyCollection<string> visitIds)
    {
        var wanted = new HashSet<string>(visitIds, StringComparer.Ordinal);
        var parts = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, 2))
        {
            var id = Id(row[0]);
            var line = Text(row[1])?.Trim();
            if (id == null || !wanted.Contains(id) || string.IsNullOrEmpty(line)) continue;
            if (!parts.TryGetValue(id, out var list))
            {
                list = new List<string>();
                parts.Add(id, list);
            }
            list.Add(line!);
        }
        return parts.ToDictionary(pair => pair.Key, pair => string.Join(SymptomGlue, pair.Value), StringComparer.Ordinal);
    }

    private static string? SymptomOf(IReadOnlyDictionary<string, string> symptoms, string visitId) =>
        symptoms.TryGetValue(visitId, out var symptom) ? symptom : null;

    /// <summary>쪽 줄 묶음: 내원 하나와 그 처방 코드들.</summary>
    private sealed class PageLine
    {
        public PageLine(string visitId, string? day)
        {
            VisitId = visitId;
            Day = day;
        }

        public string VisitId { get; }
        public string? Day { get; }
        public List<string?> Codes { get; } = new List<string?>();
    }

    /// <summary>수 줄(Count, FirstDay) 하나 → 앞선 완료 내원 수·첫날. 줄이 없거나 수가 숫자가 아니거나 음수면 읽기 실패.</summary>
    private static (long Count, string? FirstDay) Count(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = Cells(rows, 2).FirstOrDefault() ?? throw ReadFailed();
        return (Number(row[0]), Id(row[1]));
    }

    /// <summary>쪽 줄(VisitId, VisitDay, RxCode) → 내원마다 묶음(비트가 준 차례 그대로). 내원번호가 빈 줄은 버리고 한 쪽(size)보다 많이 두지 않는다.</summary>
    private static List<PageLine> Page(IReadOnlyList<IReadOnlyList<object?>> rows, int size)
    {
        var lines = new List<PageLine>();
        var byId = new Dictionary<string, PageLine>(StringComparer.Ordinal);
        foreach (var row in Cells(rows, 3))
        {
            var id = Id(row[0]);
            if (id == null) continue;
            if (!byId.TryGetValue(id, out var line))
            {
                if (lines.Count == size) continue;
                line = new PageLine(id, Id(row[1]));
                byId.Add(id, line);
                lines.Add(line);
            }
            line.Codes.Add(Text(row[2]));
        }
        return lines;
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

    /// <summary>번호·날 칸: 앞뒤 공백을 빼고, 비면 null.</summary>
    private static string? Id(object? cell)
    {
        var text = Text(cell)?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    /// <summary>내원 수. 숫자가 아니거나 음수면 읽기 실패.</summary>
    private static long Number(object? cell)
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

    private static string Key(DateTime at) => at.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}
