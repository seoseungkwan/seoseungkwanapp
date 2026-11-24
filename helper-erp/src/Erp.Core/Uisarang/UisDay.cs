using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Protocol;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑 closing.day 한 번 읽기(spec erp-uisarang design.md 4-2·5-5·6-1·6-2, REQ-4202·REQ-4206·REQ-4207·REQ-4210, TASK-13).
/// 1. 묶음 검사(Check) — 폴더에 닿기 전. 오늘 뒤 날짜는 부르는 쪽(UisCommands)이 폴더를 열기 전에 막는다
/// 2. 첫째 돌기: 모든 파일 IsOpen. 하나라도 열려 있으면 아무것도 읽거나 지우지 않고 uis.open + 모아 둔 값만으로 답한다
/// 3. 둘째 돌기(이름 차례, UisPass): 20MB 넘음·깨짐·종류 모름은 곧바로 지움. 환자별은 알아본 바로 뒤 지우고 숫자만 남김. 합계는 들고 있다가
/// 4. 종류마다 고르기: 0개 missing · 1개 그것 · 여럿이면 조회일이 마감 일자 하루인 것이 꼭 하나면 그것, 아니면 twice(환자별 여럿은 twice).
///    지우기(합계): 조건이 '전체'가 아닌 엑셀과 읽은(ok) 엑셀은 지우고, 날짜 다름·같은 날 둘은 남긴다 — 모두 다 읽은 뒤 한 번에
/// 5. 모아 둔 값: 이번 ok 보고서를 그날 값에 덮어 쓰고, 이번에 missing인 보고서는 그날 모아 둔 값(cached). 못 쓰면 번호만 기록(note)
/// 6. 셈 → 답(비트 답 칸 이름 + source·uis, 의사랑이 모르는 숫자·음수·소수는 null)
/// 답·기록·예외 글에 파일 이름·칸 글자를 넣지 않는다(AC-4209.1·AC-4209.4). 디스크는 IUisFolder·UisCache로만 닿는다(AC-4210.5).
/// </summary>
public static class UisDay
{
    /// <summary>이보다 큰 파일은 읽지 않고 지운다(4-2).</summary>
    public const long MaxFileBytes = 20L * 1024 * 1024;

    /// <summary>묶음 하나 코드 수·코드 글자 수(commands.json closing.day codes).</summary>
    public const int MaxCodes = 20;
    public const int MaxCodeLength = 20;

    /// <summary>모아 둔 값을 쓰지 못했을 때 기록에만 남기는 번호(답은 오류가 아니다, design.md 3-5).</summary>
    public const string CacheFailed = "E-UIS-CACHE";

    /// <summary>건수로 셀 묶음 key(확장 UIS_COUNT_KEYS) — 의사랑 closing.day groups는 이 13개만.</summary>
    public static readonly IReadOnlyList<string> CountKeys = new[]
    {
        "carm", "sono", "arthro", "manual", "eswt", "manualConsult", "lipus", "nail", "ct", "surgery", "eswtStd", "eswtRadial", "ptVisit",
    };

    /// <summary>매출로 셀 묶음 key(확장 UIS_SALES_KEYS, commands.json sales key).</summary>
    public static readonly IReadOnlyList<string> SalesKeys = new[]
    {
        "carm", "sono", "arthro", "manual", "eswt", "pt", "etc1", "etc2", "etc3", "etc4",
    };

    public const string PtVisitKey = "ptVisit";

    /// <summary>uis.negative 값: 재진 · 진찰료 산정안함.</summary>
    public const string NegativeReturn = "return";
    public const string NegativeNoExamFee = "noExamFee";

    // 코드 꼴(commands.json pattern ^\S(?: ?\S)*$와 같다)
    private static readonly Regex CodeShape = new Regex(@"^\S(?: ?\S)*\z", RegexOptions.CultureInvariant);

    private static readonly string[] Bands = { "0", "10", "20", "30", "40", "50", "60", "70", "80", "90" };

    private static readonly UisKind[] SumKinds = { UisKind.Income, UisKind.Rx, UisKind.Visits, UisKind.Rsv };

    private const string DayFormat = "yyyy-MM-dd";

    /// <summary>
    /// 묶음 검사(AC-4210.3): groups는 건수 key 13개, sales는 매출 key 10개 가운데. 같은 key 둘·모르는 key·코드 0개나 21개·코드 꼴 틀림(21자 등)은
    /// E-HELPER-BAD-MESSAGE. 코드는 UisRules.Code 꼴(앞뒤 빈칸 뗌·가운데 빈칸 하나·대문자)로 바꾸고 겹침을 뺀다(받은 차례).
    /// </summary>
    public static UisArgs Check(UisArgs args)
    {
        if (args == null || args.Groups == null || args.Sales == null) throw Bad();
        return new UisArgs(CheckList(args.Groups, CountKeys), CheckList(args.Sales, SalesKeys));
    }

    /// <summary>실제 .xls 읽기(XlsRows)로 한 번 읽기.</summary>
    public static UisDayResult Read(IUisFolder folder, UisCache cache, DateTime day, UisArgs args, UisFolderKind folderKind, Action<string>? note = null) =>
        Read(folder, cache, day, args, folderKind, XlsRows.Read, note);

    /// <summary>바이트 → 줄 읽기를 바꿔 끼울 수 있는 입구(시험이 시험 안에서 만든 줄을 넣는다). 나머지는 위와 같다.</summary>
    public static UisDayResult Read(
        IUisFolder folder, UisCache cache, DateTime day, UisArgs args, UisFolderKind folderKind,
        Func<byte[], IReadOnlyList<IReadOnlyList<XlsCell>>> rows, Action<string>? note)
    {
        if (folder == null) throw new ArgumentNullException(nameof(folder));
        if (cache == null) throw new ArgumentNullException(nameof(cache));
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        var wanted = Check(args);
        day = day.Date;

        var pass = new UisPass(folder, rows);
        var files = folder.List();
        var open = pass.OpenKinds(files);
        var picks = UisKinds.All.ToDictionary(kind => kind, _ => new Pick());
        var fresh = new UisFactsSet();
        if (open.Count == 0) ReadFiles(pass, files, day, picks, fresh);

        // 모아 둔 값(4-4): 이번 ok는 덮어 쓰고, 이번에 missing이면 그날 값
        var loaded = cache.Load(day);
        var facts = Merge(day, picks, fresh, loaded);
        if (open.Count == 0)
        {
            var saved = true;
            if (HasAny(fresh)) saved = cache.Save(day, fresh);
            // 그날 값이 없으면(다른 날 값·24시간 넘음·깨짐) 빈 그날 값으로 바꿔 앞 날짜 값을 버린다
            else if (loaded == null) saved = cache.Save(day, new UisFactsSet());
            if (!saved) note?.Invoke(CacheFailed);
        }

        return Answer(day, wanted, folderKind, picks, facts, pass, open);
    }

    // ---- 읽기·고르기·지우기(4-2·5-5) ------------------------------------------------------------------

    /// <summary>보고서 하나의 이번 결과(답 reports[] 한 줄).</summary>
    private sealed class Pick
    {
        public UisState State { get; set; } = UisState.Missing;

        public bool Cached { get; set; }

        public string? From { get; set; }

        public string? To { get; set; }

        public string? Value { get; set; }
    }

    /// <summary>환자별 엑셀 하나에서 남긴 것(시트는 들고 있지 않는다).</summary>
    private sealed class PatientRead
    {
        public PatientRead(UisKind kind, Pick pick, VisitPatientFacts? visits, RsvPatientFacts? rsv)
        {
            Kind = kind;
            Pick = pick;
            Visits = visits;
            Rsv = rsv;
        }

        public UisKind Kind { get; }

        public Pick Pick { get; }

        public VisitPatientFacts? Visits { get; }

        public RsvPatientFacts? Rsv { get; }
    }

    private static void ReadFiles(UisPass pass, IReadOnlyList<UisFile> files, DateTime day, Dictionary<UisKind, Pick> picks, UisFactsSet fresh)
    {
        var patients = new List<PatientRead>();
        var sums = pass.Sweep(files, _ => true, sheet => patients.Add(ReadPatient(sheet, day)));

        // 환자별: 하나면 그것, 여럿이면 twice(모두 이미 지웠다)
        foreach (var kind in new[] { UisKind.VisitPatients, UisKind.RsvPatients })
        {
            var found = patients.Where(read => read.Kind == kind).ToList();
            if (found.Count == 0) continue;
            if (found.Count > 1)
            {
                picks[kind].State = UisState.Twice;
                continue;
            }
            picks[kind] = found[0].Pick;
            if (found[0].Pick.State != UisState.Ok) continue;
            if (kind == UisKind.VisitPatients) fresh.VisitPatients = found[0].Visits;
            else fresh.RsvPatients = found[0].Rsv;
        }

        // 합계: 고르고, 지울 것을 모아 다 읽은 뒤 한 번에 지운다
        var remove = new HashSet<UisHeld>();
        foreach (var kind in SumKinds)
        {
            var mine = sums.Where(held => held.Sheet.Kind == kind).ToList();
            if (mine.Count == 0) continue;

            UisHeld? chosen = null;
            if (mine.Count == 1) chosen = mine[0];
            else
            {
                var onDay = mine.Where(held => UisReport.IsOnDay(held.Sheet, day)).ToList();
                if (onDay.Count == 1) chosen = onDay[0];
            }

            var pick = picks[kind];
            if (chosen == null)
            {
                pick.State = UisState.Twice;
            }
            else
            {
                pick.State = UisReport.State(chosen.Sheet, day);
                var range = UisReport.Range(chosen.Sheet);
                pick.From = range?.FromText;
                pick.To = range?.ToText;
                pick.Value = UisReport.Condition(chosen.Sheet)?.Value;
                if (pick.State == UisState.Ok) SetSum(fresh, chosen.Sheet, day);
            }

            foreach (var held in mine)
            {
                // 조건이 '전체'가 아닌 엑셀은 어느 날에도 못 쓰니 지우고, 읽은 엑셀도 지운다. 날짜 다름·같은 날 둘은 남긴다
                var drop = UisReport.Condition(held.Sheet) != null || (ReferenceEquals(held, chosen) && pick.State == UisState.Ok);
                if (drop) remove.Add(held);
                else pass.Keep();
            }
        }
        foreach (var held in sums)
        {
            if (remove.Contains(held)) pass.Remove(held.Entry, unknown: false);
        }
    }

    /// <summary>
    /// 환자별 엑셀(이미 지움)에서 상태·조회일·숫자만 남긴다. 내원 표는 조회일 라벨이 있을 때만 날짜를 보고(없으면 ok + noDate),
    /// 예약 표는 예약일 칸에서 찾은 날짜(UisPatients.RsvDate)가 하나라도 마감 일자가 아니면 otherDate이고 from·to = 찾은 날짜 처음·끝.
    /// 환자 줄은 있는데 어느 줄에서도 날짜를 못 찾으면 조회일 라벨로 본다(AC-4208.4, design 2-1 고침 15): 라벨이 마감 일자 하루면 ok,
    /// 다르면 otherDate(from·to = 라벨), 라벨이 없으면 ok(from·to = null). 이미 ok가 아닌 상태(notAll)는 그대로.
    /// </summary>
    private static PatientRead ReadPatient(UisSheet sheet, DateTime day)
    {
        var kind = sheet.Kind ?? throw new ArgumentException("종류 모름 시트", nameof(sheet));
        var pick = new Pick { State = UisReport.State(sheet, day), Value = UisReport.Condition(sheet)?.Value };
        if (kind == UisKind.VisitPatients)
        {
            var range = UisReport.Range(sheet);
            pick.From = range?.FromText;
            pick.To = range?.ToText;
            return new PatientRead(kind, pick, UisPatients.ReadVisits(sheet, day), null);
        }

        var rsv = UisPatients.ReadRsv(sheet, day);
        if (pick.State == UisState.Ok && !rsv.AllOnDay) pick.State = UisState.OtherDate;
        var days = UisPatients.RsvDays(sheet, day);
        if (days.Count > 0)
        {
            pick.From = days.Min().ToString(DayFormat, CultureInfo.InvariantCulture);
            pick.To = days.Max().ToString(DayFormat, CultureInfo.InvariantCulture);
        }
        else if (rsv.Rows > 0)
        {
            var range = UisReport.Range(sheet);
            pick.From = range?.FromText;
            pick.To = range?.ToText;
            if (pick.State == UisState.Ok && range != null && !UisReport.IsOnDay(sheet, day)) pick.State = UisState.OtherDate;
        }
        return new PatientRead(kind, pick, null, rsv);
    }

    private static void SetSum(UisFactsSet fresh, UisSheet sheet, DateTime day)
    {
        switch (sheet.Kind)
        {
            case UisKind.Income: fresh.Income = UisIncome.Read(sheet); break;
            case UisKind.Rx: fresh.Rx = UisRx.Read(sheet); break;
            case UisKind.Visits: fresh.Visits = UisVisits.Read(sheet, day); break;
            case UisKind.Rsv: fresh.Rsv = UisVisits.ReadRsv(sheet, day); break;
        }
    }

    // ---- 모아 둔 값 합치기(4-4) ----------------------------------------------------------------------

    /// <summary>쓸 숫자: 이번 ok는 이번 값, 이번에 missing이고 그날 모아 둔 값이 있으면 그것(state ok + cached, 조회일 = 마감 일자).</summary>
    private static UisFactsSet Merge(DateTime day, Dictionary<UisKind, Pick> picks, UisFactsSet fresh, UisFactsSet? loaded)
    {
        var facts = new UisFactsSet
        {
            Income = Use(picks[UisKind.Income], fresh.Income, loaded?.Income),
            Rx = Use(picks[UisKind.Rx], fresh.Rx, loaded?.Rx),
            Visits = Use(picks[UisKind.Visits], fresh.Visits, loaded?.Visits),
            VisitPatients = Use(picks[UisKind.VisitPatients], fresh.VisitPatients, loaded?.VisitPatients),
            Rsv = Use(picks[UisKind.Rsv], fresh.Rsv, loaded?.Rsv),
            RsvPatients = Use(picks[UisKind.RsvPatients], fresh.RsvPatients, loaded?.RsvPatients),
        };

        var text = day.ToString(DayFormat, CultureInfo.InvariantCulture);
        foreach (var pair in picks)
        {
            if (!pair.Value.Cached) continue;
            // 모아 둔 값은 그날 ok였던 것뿐이다. 조회일 라벨이 없던 내원 아래쪽 표만 날짜를 모른다
            var dated = pair.Key != UisKind.VisitPatients || facts.VisitPatients?.HasDate == true;
            pair.Value.From = dated ? text : null;
            pair.Value.To = dated ? text : null;
        }
        return facts;
    }

    private static T? Use<T>(Pick pick, T? now, T? stored) where T : class
    {
        if (pick.State == UisState.Ok) return now;
        if (pick.State != UisState.Missing || stored == null) return null;
        pick.State = UisState.Ok;
        pick.Cached = true;
        return stored;
    }

    private static bool HasAny(UisFactsSet facts) =>
        facts.Income != null || facts.Rx != null || facts.Visits != null || facts.VisitPatients != null || facts.Rsv != null || facts.RsvPatients != null;

    // ---- 셈(6-1·6-2) ---------------------------------------------------------------------------------

    private static UisDayResult Answer(
        DateTime day, UisArgs wanted, UisFolderKind folderKind, Dictionary<UisKind, Pick> picks, UisFactsSet facts, UisPass pass, IReadOnlyList<string> open)
    {
        var income = facts.Income;
        var rx = facts.Rx;
        var visits = facts.Visits;
        var visitPatients = facts.VisitPatients;
        var rsv = facts.Rsv;
        var rsvPatients = facts.RsvPatients;
        var fractional = new List<string>();
        var negative = new List<string>();

        // 묶음: args groups 차례 { 건수, 같은 key 매출 } → sales에만 있는 key를 sales 차례로 { null, 매출 }
        var sales = wanted.Sales.ToDictionary(group => group.Key, group => group.Codes, StringComparer.Ordinal);
        var groups = new List<UisDayGroup>();
        long? ptVisit = null;
        var ptPicked = false;
        foreach (var group in wanted.Groups)
        {
            var count = Count(rx, group.Codes, out var fraction);
            if (fraction) fractional.Add(group.Key);
            groups.Add(new UisDayGroup { Key = group.Key, Patients = count, Total = sales.TryGetValue(group.Key, out var codes) ? Amount(rx, codes) : null });
            if (group.Key == PtVisitKey)
            {
                ptPicked = true;
                ptVisit = count;
            }
        }
        var counted = new HashSet<string>(wanted.Groups.Select(group => group.Key), StringComparer.Ordinal);
        foreach (var group in wanted.Sales)
        {
            if (!counted.Contains(group.Key)) groups.Add(new UisDayGroup { Key = group.Key, Patients = null, Total = Amount(rx, group.Codes) });
        }

        // 환자현황: 재진 = 재진수 − 물리치료내원(골랐을 때), 산정안함 = 환자 합계 − (초진수 + 재진수)
        var total = UisVisits.Total(visits, visitPatients);
        var visitReturn = income?.Return;
        if (ptPicked) visitReturn = visitReturn is long all && ptVisit is long pt ? Minus(all, pt) : null;
        if (visitReturn < 0)
        {
            visitReturn = null;
            negative.Add(NegativeReturn);
        }
        long? noExamFee = total is long people && income?.First is long first && income.Return is long again && Plus(first, again) is long seen
            ? Minus(people, seen)
            : null;
        if (noExamFee < 0)
        {
            noExamFee = null;
            negative.Add(NegativeNoExamFee);
        }

        var checks = new UisDayChecks();
        if (income != null) UisIncome.Check(income, checks);
        if (rx != null) UisRx.Check(rx, checks);
        UisVisits.Checks(checks, visits, visitPatients, rsv, rsvPatients);
        checks.TotalFee = Pair(checks.TotalFee);
        checks.Received = Pair(checks.Received);
        checks.Headcount = Pair(checks.Headcount);
        checks.RxTotal = Pair(checks.RxTotal);
        checks.VisitRows = Pair(checks.VisitRows);
        checks.VisitNew = Pair(checks.VisitNew);
        checks.RsvRows = Pair(checks.RsvRows);
        checks.RsvVisited = Pair(checks.RsvVisited);

        var reservations = UisVisits.Reservations(rsv, rsvPatients);
        if (reservations != null && (reservations.Total < 0 || reservations.Visited < 0)) reservations = null;

        return new UisDayResult
        {
            Date = day.ToString(DayFormat, CultureInfo.InvariantCulture),
            Patients = new UisDayPatients
            {
                New = Count(UisVisits.New(visits, visitPatients)),
                Return = visitReturn,
                PtVisit = ptVisit,
                NoExamFee = noExamFee,
                Total = Count(total),
            },
            Groups = groups,
            Ages = Bands.Select((band, i) => new UisDayAge
            {
                Band = band,
                New = visitPatients == null ? null : Count(visitPatients.AgeNew[i]),
                Return = visitPatients == null ? null : Count(visitPatients.AgeReturn[i]),
            }).ToList(),
            Money = new UisDayMoney
            {
                Total = Count(income?.TotalFee),
                Insurer = Count(income?.Insurer),
                Noncovered = Count(income?.Noncovered),
                Received = Count(income?.Received),
                Card = Count(income?.Card),
                Cash = Count(income?.Cash),
            },
            Reservations = new UisDayReservations { Patients = Count(rsvPatients?.DistinctCharts) },
            Warnings = new UisDayWarnings { UnknownAge = Math.Max(0, visitPatients?.UnknownAge ?? 0) },
            Uis = new UisDayInfo
            {
                Folder = folderKind,
                Reports = UisKinds.All.Select(kind => Report(kind, picks[kind], facts)).ToList(),
                Open = open,
                Deleted = pass.Deleted,
                Kept = pass.Kept,
                DeleteFailed = pass.DeleteFailed,
                UnknownFiles = pass.UnknownFiles,
                Checks = checks,
                Fractional = fractional,
                Negative = negative,
                Reservations = reservations,
            },
        };
    }

    private static UisDayReport Report(UisKind kind, Pick pick, UisFactsSet facts) => new UisDayReport
    {
        Kind = kind,
        State = pick.State,
        Cached = pick.Cached,
        From = pick.From,
        To = pick.To,
        Value = pick.Value,
        Columns = pick.State == UisState.Ok ? ColumnsOf(kind, facts) : new string[0],
    };

    private static string[] ColumnsOf(UisKind kind, UisFactsSet facts) => kind switch
    {
        UisKind.Income => facts.Income?.Columns,
        UisKind.Rx => facts.Rx?.Columns,
        UisKind.Visits => facts.Visits?.Columns,
        UisKind.VisitPatients => facts.VisitPatients?.Columns,
        UisKind.Rsv => facts.Rsv?.Columns,
        UisKind.RsvPatients => facts.RsvPatients?.Columns,
        _ => null,
    } ?? new string[0];

    /// <summary>
    /// 건수 묶음 = 고른 코드 총투여량 합(decimal로 더해 소수 판정 오차 없음, 그날 없는 코드는 0). 처방통계가 없거나 '코드'·'총투여량' 칸을 못 찾았으면 null.
    /// 합에 소수가 있으면 null + fraction(AC-4206.2), 0보다 작거나 셀 수 없이 크면 null.
    /// </summary>
    private static long? Count(RxFacts? rx, IReadOnlyList<string> codes, out bool fraction)
    {
        fraction = false;
        if (rx == null || rx.Columns.Contains("코드") || rx.Columns.Contains("총투여량")) return null;
        var sum = 0m;
        try
        {
            foreach (var code in codes)
            {
                if (!rx.Codes.TryGetValue(code, out var line)) continue;
                if (double.IsNaN(line.Qty) || double.IsInfinity(line.Qty) || Math.Abs(line.Qty) >= 7.9e27) return null;
                sum += (decimal)line.Qty;
            }
        }
        catch (OverflowException)
        {
            return null;
        }
        if (sum != decimal.Truncate(sum))
        {
            fraction = true;
            return null;
        }
        if (sum < 0 || sum > long.MaxValue) return null;
        return (long)sum;
    }

    /// <summary>매출 묶음 = 고른 코드 총액 합(원 정수, 그날 없는 코드는 0). 처방통계가 없거나 '코드'·'총액' 칸을 못 찾았으면 null, 0보다 작으면 null.</summary>
    private static long? Amount(RxFacts? rx, IReadOnlyList<string> codes)
    {
        if (rx == null || rx.Columns.Contains("코드") || rx.Columns.Contains("총액")) return null;
        long sum = 0;
        foreach (var code in codes)
        {
            if (!rx.Codes.TryGetValue(code, out var line)) continue;
            if (!(Plus(sum, line.Amount) is long next)) return null;
            sum = next;
        }
        return sum < 0 ? null : sum;
    }

    /// <summary>답 숫자 칸(0 이상 정수 또는 null): 음수는 null.</summary>
    private static long? Count(long? value) => value is long n && n >= 0 ? n : null;

    /// <summary>맞춰 보기 [왼쪽, 오른쪽]: 음수가 든 것은 견주지 않는다(답은 0 이상 정수 둘 또는 null).</summary>
    private static long[]? Pair(long[]? pair) => pair != null && pair.Length == 2 && pair[0] >= 0 && pair[1] >= 0 ? pair : null;

    private static long? Plus(long a, long b)
    {
        try
        {
            return checked(a + b);
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    private static long? Minus(long a, long b)
    {
        try
        {
            return checked(a - b);
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    // ---- 묶음 검사 -----------------------------------------------------------------------------------

    private static List<UisCodeGroup> CheckList(IReadOnlyList<UisCodeGroup> raw, IReadOnlyList<string> keys)
    {
        if (raw.Count > keys.Count) throw Bad();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var list = new List<UisCodeGroup>();
        foreach (var group in raw)
        {
            if (group == null || group.Key == null || !keys.Contains(group.Key, StringComparer.Ordinal) || !seen.Add(group.Key)) throw Bad();
            if (group.Codes == null || group.Codes.Count < 1 || group.Codes.Count > MaxCodes) throw Bad();
            var codes = new List<string>();
            foreach (var text in group.Codes)
            {
                if (text == null) throw Bad();
                var code = UisRules.Code(text);
                if (code.Length < 1 || code.Length > MaxCodeLength || !CodeShape.IsMatch(code)) throw Bad();
                if (!codes.Contains(code, StringComparer.Ordinal)) codes.Add(code);
            }
            list.Add(new UisCodeGroup(group.Key, codes));
        }
        return list;
    }

    private static HelperException Bad() => new HelperException(ErrorCodes.BadMessage);
}

/// <summary>둘째 돌기에서 들고 있는 합계 엑셀 하나(파일 + 알아본 시트). 환자별 시트는 들고 있지 않는다.</summary>
internal sealed class UisHeld
{
    public UisHeld(UisFile entry, UisSheet sheet)
    {
        Entry = entry;
        Sheet = sheet;
    }

    public UisFile Entry { get; }

    public UisSheet Sheet { get; }
}

/// <summary>
/// 엑셀 폴더 한 번 훑기(design.md 4-2 첫째·둘째 돌기, closing.day·closing.uisCodes가 같이 쓴다)와 지운·남긴·못 지운 수.
/// 깨짐·종류 모름·20MB 넘음은 곧바로 지우고(unknownFiles), 환자별 엑셀은 그 Read 바로 다음에 지운 뒤에야 숫자를 센다(AC-4209.2).
/// </summary>
internal sealed class UisPass
{
    private readonly IUisFolder folder;
    private readonly Func<byte[], IReadOnlyList<IReadOnlyList<XlsCell>>> rows;

    public UisPass(IUisFolder folder, Func<byte[], IReadOnlyList<IReadOnlyList<XlsCell>>> rows)
    {
        this.folder = folder;
        this.rows = rows;
    }

    public int Deleted { get; private set; }

    public int Kept { get; private set; }

    public int DeleteFailed { get; private set; }

    public int UnknownFiles { get; private set; }

    /// <summary>첫째 돌기: 모든 파일 IsOpen. 열린 파일의 보고서 JSON 이름(파일 이름으로 짐작, 모르면 'unknown', 겹침 없이 파일 차례). 비면 열린 파일 없음.</summary>
    public IReadOnlyList<string> OpenKinds(IReadOnlyList<UisFile> files)
    {
        var kinds = new List<string>();
        foreach (var file in files)
        {
            if (!folder.IsOpen(file)) continue;
            var name = UisReport.GuessByName(file.Name) is UisKind kind ? UisNames.Of(kind) : UisNames.Unknown;
            if (!kinds.Contains(name)) kinds.Add(name);
        }
        return kinds;
    }

    /// <summary>
    /// 둘째 돌기(파일 차례): 20MB 넘음은 읽지 않고 지움. 읽어 알아보고 깨짐(UisFileException)·종류 모름은 지움. 환자별은 곧바로 지운 뒤 patient(시트).
    /// 합계는 hold(종류)면 돌려주고, 아니면 건드리지 않는다. 읽은 바이트는 알아본 뒤 지운다(Array.Clear).
    /// </summary>
    public List<UisHeld> Sweep(IReadOnlyList<UisFile> files, Func<UisKind, bool> hold, Action<UisSheet>? patient)
    {
        var held = new List<UisHeld>();
        foreach (var file in files)
        {
            if (file.Length > UisDay.MaxFileBytes)
            {
                Remove(file, unknown: true);
                continue;
            }

            UisSheet? sheet = null;
            byte[]? bytes = null;
            try
            {
                bytes = folder.Read(file);
                sheet = UisReport.Read(rows(bytes));
            }
            catch (UisFileException)
            {
                sheet = null;
            }
            finally
            {
                if (bytes != null) Array.Clear(bytes, 0, bytes.Length);
            }

            if (sheet?.Kind is not UisKind kind)
            {
                Remove(file, unknown: true);
                continue;
            }
            if (UisKinds.IsPatient(kind))
            {
                // 셈하기 전·다음 파일을 읽기 전에 지운다
                Remove(file, unknown: false);
                patient?.Invoke(sheet);
                continue;
            }
            if (hold(kind)) held.Add(new UisHeld(file, sheet));
        }
        return held;
    }

    /// <summary>지운다. 지웠으면 deleted(종류 모름이면 unknownFiles도), 못 지웠으면 deleteFailed.</summary>
    public void Remove(UisFile file, bool unknown)
    {
        if (folder.Delete(file))
        {
            Deleted++;
            if (unknown) UnknownFiles++;
        }
        else
        {
            DeleteFailed++;
        }
    }

    /// <summary>남겨 둔 파일 하나(날짜 다름·같은 날 둘).</summary>
    public void Keep() => Kept++;
}
