using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Stats;

/// <summary>기간 합계(원본 RxVisitSplit SummarySql의 여섯 칸).</summary>
public sealed class StatsSummary
{
    public StatsSummary(long visits, long patients, long newPatients, long noChart, long duplicate, long noFirst)
    {
        Visits = visits;
        Patients = patients;
        NewPatients = newPatients;
        NoChart = noChart;
        Duplicate = duplicate;
        NoFirst = noFirst;
    }

    public long Visits { get; }

    public long Patients { get; }

    public long NewPatients { get; }

    /// <summary>차트번호 없는 내원.</summary>
    public long NoChart { get; }

    /// <summary>중복 내원(같은 내원 번호가 두 번 이상).</summary>
    public long Duplicate { get; }

    /// <summary>첫 내원을 찾지 못한 환자.</summary>
    public long NoFirst { get; }
}

/// <summary>날짜별 합계 한 줄(원본 DaysSql). 날짜는 원본 글자 yyyyMMdd 그대로.</summary>
public sealed class StatsDay
{
    public StatsDay(string day, long visits, long patients, long newPatients)
    {
        Day = day;
        Visits = visits;
        Patients = patients;
        NewPatients = newPatients;
    }

    public string Day { get; }

    public long Visits { get; }

    public long Patients { get; }

    public long NewPatients { get; }
}

/// <summary>진료 줄에 나온 처방코드와 그 이름(원본 처방 목록의 첫 이름, 비면 코드).</summary>
public sealed class StatsCode
{
    public StatsCode(string code, string name)
    {
        Code = code;
        Name = name;
    }

    public string Code { get; }

    public string Name { get; }
}

/// <summary>진료 줄 [차트번호, 진료일, 처방코드, 첫 내원일]. 글자는 앞뒤 공백만 없앤 원본 값, 첫 내원일이 없으면 null.</summary>
public sealed class StatsVisitRow
{
    public StatsVisitRow(string? chart, string? day, string? code, string? firstDay)
    {
        Chart = chart;
        Day = day;
        Code = code;
        FirstDay = firstDay;
    }

    public string? Chart { get; }

    public string? Day { get; }

    public string? Code { get; }

    public string? FirstDay { get; }
}

/// <summary>
/// 접수 줄 [차트번호, 진료일, 접수 건수, 첫 내원일, 90일초진 접수 수, 신환 표시 접수 수], 환자·날마다 한 줄. 글자는 앞뒤 공백만 없앤 원본 값, 첫 내원일이 없으면 null.
/// 90일초진 접수 수(spec first90 AC-4401.1)는 그 환자·날 접수 가운데 내원 구분 '3'인 수이고, 첫 내원일인 날도 고치지 않는다(AC-4401.3).
/// 신환 표시 접수 수(spec new-mark AC-6201.1)는 그 환자·날 접수 가운데 내원 구분 '1'인 수다(신환인지는 웹이 정한다).
/// </summary>
public sealed class StatsPatientDay
{
    public StatsPatientDay(string? chart, string? day, long visits, string? firstDay, long first90, long newMark)
    {
        Chart = chart;
        Day = day;
        Visits = visits;
        FirstDay = firstDay;
        First90 = first90;
        NewMark = newMark;
    }

    public string? Chart { get; }

    public string? Day { get; }

    public long Visits { get; }

    public string? FirstDay { get; }

    /// <summary>그 환자·날의 90일초진('3') 접수 수.</summary>
    public long First90 { get; }

    /// <summary>그 환자·날의 신환 표시('1') 접수 수.</summary>
    public long NewMark { get; }
}

/// <summary>stats.rows가 비트에서 읽은 통계 줄 전부(보고 숫자는 StatsReport).</summary>
public sealed class StatsRowsResult
{
    public StatsRowsResult(StatsSummary summary, IReadOnlyList<StatsDay> days, IReadOnlyList<StatsPatientDay> patientDays, IReadOnlyList<StatsCode> codes, IReadOnlyList<StatsVisitRow> rows)
    {
        Summary = summary ?? throw new ArgumentNullException(nameof(summary));
        Days = days ?? throw new ArgumentNullException(nameof(days));
        PatientDays = patientDays ?? throw new ArgumentNullException(nameof(patientDays));
        Codes = codes ?? throw new ArgumentNullException(nameof(codes));
        Rows = rows ?? throw new ArgumentNullException(nameof(rows));
    }

    public StatsSummary Summary { get; }

    public IReadOnlyList<StatsDay> Days { get; }

    public IReadOnlyList<StatsPatientDay> PatientDays { get; }

    public IReadOnlyList<StatsCode> Codes { get; }

    public IReadOnlyList<StatsVisitRow> Rows { get; }
}

/// <summary>
/// 통계 줄 읽기(AC-503.1·AC-503.3). 등록 확인(HospitalGate.Open)을 마친 세션과 등록 범위로 원본 순서대로 읽는다:
/// HistoryGuard(1이면 E-STATS-HISTORY) → 진료 줄 → 접수 줄(둘 다 MaxRows를 넘으면 E-STATS-TOO-BIG) → 기간 합계 → 날짜별 → 처방 이름.
/// SQL은 StatsSql 상수만 ReadOnlyGuard로 돌린다. 하나라도 막히면 BitException(번호만)으로 멈춘다: 반쪽 자료를 돌려주지 않는다.
/// 값 모양이 틀리면(숫자가 아님·칸이 모자람) E-BIT-READ-FAILED다. 이름·전화·주민번호·주소는 SQL도 읽지 않는다.
/// 처방코드가 비었거나(NULL·공백뿐) 40자를 넘는 진료 줄은 답의 rows·codes에 넣지 않는다(AC-503.1). 줄 수 한도는 건너뛰기 전 줄 수로 본다.
/// </summary>
public static class StatsRows
{
    /// <summary>진료 줄·접수 줄 각각의 한도(design.md '줄 수·크기': 700,000줄 ≈ 28MB → 조각 약 30개).</summary>
    public const int MaxRows = 700_000;

    /// <summary>처방코드 길이 한도. Worker MAX_CODE(src/workers/stats/helperData.ts)와 같다.</summary>
    private const int MaxCodeLength = 40;

    /// <param name="from">기간 첫날 YYYY-MM-DD(명령 표가 검사한 값)</param>
    /// <param name="to">기간 끝날 YYYY-MM-DD(그날 포함)</param>
    public static StatsRowsResult Read(IBitDb db, string hospitalScope, string from, string to)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var first = Day(from);
        var last = Day(to);
        if (last == DateTime.MaxValue.Date) throw new HelperException(ErrorCodes.BadMessage);

        // 원본 RxVisitSplit.Command: 끝은 마지막 날의 다음 날 0시(반열린 기간)
        var visitArgs = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Key(first) + "0000",
            ["@to"] = Key(last.AddDays(1)) + "0000",
            ["@hospital"] = hospitalScope,
        };
        // 원본 TrendDataSource.LoadCodesForRange: 비교 기간 = 같은 기간, 날짜는 Char(8)이고 끝은 마지막 날
        var codeArgs = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Key(first),
            ["@to"] = Key(last),
            ["@priorFrom"] = Key(first),
            ["@priorTo"] = Key(last),
        };

        var history = ReadOnlyGuard.Query(db, StatsSql.HistoryGuardSql, new Dictionary<string, object?>(), Sql.MetaTimeout);
        if (Number(Cell(Single(history), 0)) != 0) throw new BitException(StatsErrors.History);

        var visitRows = ReadOnlyGuard.Query(db, StatsSql.VisitRowsSql, visitArgs, StatsSql.DataTimeout);
        if (visitRows.Count > MaxRows) throw new BitException(StatsErrors.TooBig);
        var rows = new List<StatsVisitRow>(visitRows.Count);
        foreach (var row in visitRows)
        {
            var visit = new StatsVisitRow(Text(Cell(row, 0)), Text(Cell(row, 1)), Text(Cell(row, 2)), FirstDay(Cell(row, 3)));
            if (IsUsableCode(visit.Code)) rows.Add(visit);
        }

        var patientRows = ReadOnlyGuard.Query(db, StatsSql.PatientDaysSql, visitArgs, StatsSql.DataTimeout);
        if (patientRows.Count > MaxRows) throw new BitException(StatsErrors.TooBig);
        var patientDays = new List<StatsPatientDay>(patientRows.Count);
        foreach (var row in patientRows)
        {
            patientDays.Add(new StatsPatientDay(Text(Cell(row, 0)), Text(Cell(row, 1)), Number(Cell(row, 2)), FirstDay(Cell(row, 3)), Number(Cell(row, 4)), Number(Cell(row, 5))));
        }

        var total = Single(ReadOnlyGuard.Query(db, StatsSql.VisitSummarySql, visitArgs, StatsSql.DataTimeout));
        var summary = new StatsSummary(
            Number(Cell(total, 0)), Number(Cell(total, 1)), Number(Cell(total, 2)),
            Number(Cell(total, 3)), Number(Cell(total, 4)), Number(Cell(total, 5)));

        var days = ReadOnlyGuard.Query(db, StatsSql.VisitDaysSql, visitArgs, StatsSql.DataTimeout)
            .Select(row => new StatsDay(Text(Cell(row, 0)) ?? "", Number(Cell(row, 1)), Number(Cell(row, 2)), Number(Cell(row, 3))))
            .ToList();

        var catalog = ReadOnlyGuard.Query(db, StatsSql.CodeNamesSql, codeArgs, StatsSql.DataTimeout);
        return new StatsRowsResult(summary, days, patientDays, CodeNames(catalog, rows), rows);
    }

    private static bool IsUsableCode(string? code) => !string.IsNullOrWhiteSpace(code) && code!.Length <= MaxCodeLength;

    /// <summary>첫 내원일 칸: 앞뒤 공백을 없앤 글자, 없거나 비면 null.</summary>
    private static string? FirstDay(object? value)
    {
        var text = Text(value);
        return text == "" ? null : text;
    }

    /// <summary>
    /// 원본 LoadCodes처럼 코드마다(대소문자 무시) 원본 정렬의 첫 줄 이름을 쓰고 이름이 비면 코드를 쓴다.
    /// 진료 줄에 나온 코드만 남긴다(코드 글자는 진료 줄 그대로, 코드 순).
    /// </summary>
    private static List<StatsCode> CodeNames(IReadOnlyList<IReadOnlyList<object?>> catalog, List<StatsVisitRow> rows)
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in catalog)
        {
            var code = Text(Cell(row, 0));
            if (string.IsNullOrWhiteSpace(code) || names.ContainsKey(code!)) continue;
            var name = Text(Cell(row, 1));
            names.Add(code!, string.IsNullOrWhiteSpace(name) ? code! : name!);
        }

        var used = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            if (row.Code != null) used.Add(row.Code);
        }
        var codes = new List<StatsCode>();
        foreach (var code in used)
        {
            if (names.TryGetValue(code, out var name)) codes.Add(new StatsCode(code, name));
        }
        return codes;
    }

    internal static DateTime Day(string text)
    {
        if (!FieldSpec.TryParseDate(text, out var day)) throw new HelperException(ErrorCodes.BadMessage);
        return day.Date;
    }

    internal static string Key(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static IReadOnlyList<object?> Single(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        if (rows.Count != 1) throw new BitException(BitErrors.ReadFailed);
        return rows[0];
    }

    internal static object? Cell(IReadOnlyList<object?> row, int index)
    {
        if (row == null || index >= row.Count) throw new BitException(BitErrors.ReadFailed);
        return row[index];
    }

    private static string? Text(object? value) => value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();

    /// <summary>원본 Number: DB NULL은 0. 숫자로 읽을 수 없으면 E-BIT-READ-FAILED(값을 예외 글에 싣지 않는다).</summary>
    internal static long Number(object? value)
    {
        if (value == null) return 0;
        try
        {
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }
}

/// <summary>접수 줄 [차트번호|null, 진료일, 접수 시각 HHmm|null, 보험 이름|null, 진료의 코드|null], 접수마다 한 줄(AC-2701.1).</summary>
public sealed class StatsVisitLine
{
    public StatsVisitLine(string? chart, string? day, string? time, string? insurance, string? doctor)
    {
        Chart = chart;
        Day = day;
        Time = time;
        Insurance = insurance;
        Doctor = doctor;
    }

    public string? Chart { get; }

    public string? Day { get; }

    public string? Time { get; }

    public string? Insurance { get; }

    public string? Doctor { get; }
}

/// <summary>사람 줄 [차트번호, 생년월일 YYYYMMDD|null, 주소 앞부분|null], 환자마다 한 줄(AC-2701.3).</summary>
public sealed class StatsPerson
{
    public StatsPerson(string chart, string? birth, string? area)
    {
        Chart = chart;
        Birth = birth;
        Area = area;
    }

    public string Chart { get; }

    public string? Birth { get; }

    public string? Area { get; }
}

/// <summary>원장님 줄 [코드, 이름|null](AC-2701.4).</summary>
public sealed class StatsDoctor
{
    public StatsDoctor(string code, string? name)
    {
        Code = code;
        Name = name;
    }

    public string Code { get; }

    public string? Name { get; }
}

/// <summary>날·원장님 금액 [수납일 YYYYMMDD, 진료의 코드, 총진료비(원)](AC-2701.5).</summary>
public sealed class StatsDoctorDay
{
    public StatsDoctorDay(string day, string doctor, long amount)
    {
        Day = day;
        Doctor = doctor;
        Amount = amount;
    }

    public string Day { get; }

    public string Doctor { get; }

    public long Amount { get; }
}

/// <summary>환자·날 금액 [차트번호, 수납일 YYYYMMDD, 총진료비(원, 환불이 더 큰 날은 음수)](spec stats-insights AC-6106.1).</summary>
public sealed class StatsPatientPay
{
    public StatsPatientPay(string chart, string day, long amount)
    {
        Chart = chart;
        Day = day;
        Amount = amount;
    }

    public string Chart { get; }

    public string Day { get; }

    public long Amount { get; }
}

/// <summary>비트 전용 세 칸 자료 전부(stats.rows v3의 visits·people·doctors·doctorDays)와 v5의 환자·날 금액 pays.</summary>
public sealed class StatsExtraResult
{
    public StatsExtraResult(IReadOnlyList<StatsVisitLine> visits, IReadOnlyList<StatsPerson> people, IReadOnlyList<StatsDoctor> doctors, IReadOnlyList<StatsDoctorDay> doctorDays, IReadOnlyList<StatsPatientPay> pays)
    {
        Visits = visits ?? throw new ArgumentNullException(nameof(visits));
        People = people ?? throw new ArgumentNullException(nameof(people));
        Doctors = doctors ?? throw new ArgumentNullException(nameof(doctors));
        DoctorDays = doctorDays ?? throw new ArgumentNullException(nameof(doctorDays));
        Pays = pays ?? throw new ArgumentNullException(nameof(pays));
    }

    public IReadOnlyList<StatsVisitLine> Visits { get; }

    public IReadOnlyList<StatsPerson> People { get; }

    public IReadOnlyList<StatsDoctor> Doctors { get; }

    public IReadOnlyList<StatsDoctorDay> DoctorDays { get; }

    public IReadOnlyList<StatsPatientPay> Pays { get; }
}

/// <summary>
/// 비트 전용 세 칸 자료 읽기(REQ-2701). 등록 확인을 마친 세션으로 접수 줄 → 사람 줄 → 달마다 날·원장님 금액(정상수납 → 미수입금) → 원장님 이름
/// → 달마다 환자·날 금액(정상수납 → 미수입금, spec stats-insights AC-6106.1) 차례로 읽는다.
/// SQL은 StatsSql.Sections 문장만 ReadOnlyGuard로, 시간 제한은 지금 통계 자료 SQL과 같은 150초다.
/// 하나라도 막히면 BitException(번호만)으로 멈춘다: 반쪽 자료를 돌려주지 않는다. 값 모양이 틀리면 E-BIT-READ-FAILED다.
/// 환자 표에서는 차트번호·생년월일·주소만 읽고, 주소는 앞부분(AddressHead)만 남긴다.
/// </summary>
public static class StatsExtra
{
    /// <summary>진료의 코드 길이 한도. Worker isCode(src/workers/stats/helperData.ts)와 같다.</summary>
    private const int MaxCodeLength = 40;

    /// <summary>원장님 이름 길이 한도(Worker MAX_DOCTOR_NAME과 같다).</summary>
    private const int MaxNameLength = 40;

    /// <summary>보험 이름 길이 한도(Worker MAX_INSURANCE와 같다). 긴 이름 한 줄 때문에 답 전체가 막히지 않게 자른다(AC-2701.2).</summary>
    private const int MaxInsuranceLength = 100;

    private const int MaxAddressWords = 5;

    private const int MaxAddressLength = 80;

    /// <summary>접수 시각 HHmm의 가장 큰 값(Worker LAST_TIME과 같다).</summary>
    private const int LastTime = 2359;

    /// <param name="from">기간 첫날 YYYY-MM-DD(명령 표가 검사한 값)</param>
    /// <param name="to">기간 끝날 YYYY-MM-DD(그날 포함)</param>
    public static StatsExtraResult Read(IBitDb db, string hospitalScope, string from, string to)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var first = StatsRows.Day(from);
        var last = StatsRows.Day(to);
        if (last == DateTime.MaxValue.Date) throw new HelperException(ErrorCodes.BadMessage);

        // 지금 통계 Visits와 같은 매개변수: 끝은 마지막 날의 다음 날 0시(반열린 기간)
        var visitArgs = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = StatsRows.Key(first) + "0000",
            ["@to"] = StatsRows.Key(last.AddDays(1)) + "0000",
            ["@hospital"] = hospitalScope,
        };

        var lineRows = ReadOnlyGuard.Query(db, StatsSql.VisitLinesSql, visitArgs, StatsSql.DataTimeout);
        if (lineRows.Count > StatsRows.MaxRows) throw new BitException(StatsErrors.TooBig);
        var visits = new List<StatsVisitLine>(lineRows.Count);
        foreach (var row in lineRows)
        {
            visits.Add(new StatsVisitLine(
                OrNull(Text(StatsRows.Cell(row, 0))), Text(StatsRows.Cell(row, 1)), ReceiptTime(StatsRows.Cell(row, 2)),
                Cut(OrNull(Text(StatsRows.Cell(row, 3))), MaxInsuranceLength), Code(StatsRows.Cell(row, 4))));
        }

        var personRows = ReadOnlyGuard.Query(db, StatsSql.PeopleSql, visitArgs, StatsSql.DataTimeout);
        if (personRows.Count > StatsRows.MaxRows) throw new BitException(StatsErrors.TooBig);
        var people = new List<StatsPerson>(personRows.Count);
        var charts = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in personRows)
        {
            var chart = OrNull(Text(StatsRows.Cell(row, 0)));
            var birth = Birth(StatsRows.Cell(row, 1));
            var area = AddressHead(Text(StatsRows.Cell(row, 2)));
            // 환자마다 한 줄: 같은 차트번호 줄이 또 오면(환자 표 중복) 첫 줄만 둔다
            if (chart == null || !charts.Add(chart)) continue;
            people.Add(new StatsPerson(chart, birth, area));
        }
        // 두 SQL 사이에 접수가 바뀌어 접수 줄에만 있는 환자도 사람 줄이 있어야 한다(Worker가 없는 차트번호를 받지 않음)
        foreach (var visit in visits)
        {
            if (visit.Chart != null && charts.Add(visit.Chart)) people.Add(new StatsPerson(visit.Chart, null, null));
        }

        var doctorDays = DoctorMoney(db, hospitalScope, first, last);

        var codes = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var visit in visits)
        {
            if (visit.Doctor != null) codes.Add(visit.Doctor);
        }
        foreach (var day in doctorDays) codes.Add(day.Doctor);
        var doctors = DoctorNames(db, codes);

        // 지금 읽기 차례를 바꾸지 않으려고 환자·날 금액은 맨 끝에 읽는다
        return new StatsExtraResult(visits, people, doctors, doctorDays, PatientPays(db, hospitalScope, first, last));
    }

    /// <summary>
    /// 주소 앞부분(AC-2701.3): 빈칸으로 나눈 앞 낱말 다섯 개까지. 숫자로 시작하는 낱말(번지·동호수)이 나오면 그 앞에서 멈추고,
    /// 80자를 넘으면 자른다(자른 끝 빈칸은 뺀다). 남는 것이 없으면 null.
    /// </summary>
    public static string? AddressHead(string? address)
    {
        if (address == null) return null;
        var words = new List<string>(MaxAddressWords);
        foreach (var word in address.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            if (words.Count == MaxAddressWords || char.IsDigit(word[0])) break;
            words.Add(word);
        }
        var head = string.Join(" ", words);
        if (head.Length > MaxAddressLength) head = head.Substring(0, MaxAddressLength).TrimEnd();
        return head.Length == 0 ? null : head;
    }

    /// <summary>
    /// 날·원장님 금액(AC-2701.5): 원래 도구 경영 통계처럼 기간을 달로 나눠(첫 달은 시작일부터, 끝 달은 끝 날까지) 달마다 정상수납 → 미수입금을 읽는다.
    /// 같은 (수납일, 진료의)는 decimal로 다 더한 뒤 원 미만을 버리고(반올림하지 않음) 0원 줄은 뺀다. 수납 진료의가 비어 있으면 원장님 줄이 없어 뺀다.
    /// </summary>
    private static List<StatsDoctorDay> DoctorMoney(IBitDb db, string hospitalScope, DateTime first, DateTime last)
    {
        var sums = new Dictionary<(string Day, string Doctor), decimal>();
        foreach (var args in MonthArgs(hospitalScope, first, last))
        {
            foreach (var sql in new[] { StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql })
            {
                foreach (var row in ReadOnlyGuard.Query(db, sql, args, StatsSql.DataTimeout))
                {
                    var day = Text(StatsRows.Cell(row, 0)) ?? throw new BitException(BitErrors.ReadFailed);
                    var doctor = Code(StatsRows.Cell(row, 1));
                    var amount = Amount(StatsRows.Cell(row, 2));
                    if (doctor == null) continue;
                    AddTo(sums, (day, doctor), amount);
                }
            }
        }

        var days = new List<StatsDoctorDay>(sums.Count);
        foreach (var pair in sums.OrderBy(p => p.Key.Day, StringComparer.Ordinal).ThenBy(p => p.Key.Doctor, StringComparer.Ordinal))
        {
            var won = Won(pair.Value);
            if (won != 0) days.Add(new StatsDoctorDay(pair.Key.Day, pair.Key.Doctor, won));
        }
        return days;
    }

    /// <summary>
    /// 환자·날 금액(spec stats-insights AC-6106.1): 날·원장님 금액과 같은 달 나누기로 달마다 정상수납 → 미수입금을 읽는다(같은 기준 줄의 OrpTotAmt).
    /// 같은 (차트번호, 수납일)은 decimal로 다 더한 뒤 원 미만을 버리고(반올림하지 않음, 0 쪽으로) 0원 줄은 뺀다. 환불이 더 큰 날의 음수는 그대로 둔다.
    /// 차트번호가 비어 있으면 환자가 없어 뺀다. 차트번호·수납일 차례.
    /// 싣는 줄이 다른 줄과 같은 상한(StatsRows.MaxRows)을 넘으면 같은 E-STATS-TOO-BIG이다(AC-6106.6 — 웹이 답 전체를 모양 오류로 거절하지 않게).
    /// </summary>
    private static List<StatsPatientPay> PatientPays(IBitDb db, string hospitalScope, DateTime first, DateTime last)
    {
        var sums = new Dictionary<(string Chart, string Day), decimal>();
        foreach (var args in MonthArgs(hospitalScope, first, last))
        {
            foreach (var sql in new[] { StatsSql.PatientPayNormalSql, StatsSql.PatientPayReceivableSql })
            {
                foreach (var row in ReadOnlyGuard.Query(db, sql, args, StatsSql.DataTimeout))
                {
                    var chart = OrNull(Text(StatsRows.Cell(row, 0)));
                    var day = Text(StatsRows.Cell(row, 1)) ?? throw new BitException(BitErrors.ReadFailed);
                    var amount = Amount(StatsRows.Cell(row, 2));
                    if (chart == null) continue;
                    AddTo(sums, (chart, day), amount);
                }
            }
        }

        var pays = new List<StatsPatientPay>(sums.Count);
        foreach (var pair in sums.OrderBy(p => p.Key.Chart, StringComparer.Ordinal).ThenBy(p => p.Key.Day, StringComparer.Ordinal))
        {
            var won = Won(pair.Value);
            if (won != 0) pays.Add(new StatsPatientPay(pair.Key.Chart, pair.Key.Day, won));
        }
        if (pays.Count > StatsRows.MaxRows) throw new BitException(StatsErrors.TooBig);
        return pays;
    }

    /// <summary>원래 도구 경영 통계처럼 기간을 달로 나눈 금액 SQL 매개변수(첫 달은 시작일부터, 끝 달은 끝 날까지, @nextDay는 그 다음 날).</summary>
    private static IEnumerable<Dictionary<string, object?>> MonthArgs(string hospitalScope, DateTime first, DateTime last)
    {
        var start = first;
        while (start <= last)
        {
            var monthEnd = start.AddDays(DateTime.DaysInMonth(start.Year, start.Month) - start.Day);
            var end = monthEnd < last ? monthEnd : last;
            yield return new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@day"] = StatsRows.Key(start),
                ["@nextDay"] = StatsRows.Key(end.AddDays(1)),
                ["@hospital"] = hospitalScope,
            };
            start = end.AddDays(1);
        }
    }

    private static void AddTo<TKey>(Dictionary<TKey, decimal> sums, TKey key, decimal amount)
    {
        sums.TryGetValue(key, out var sum);
        try
        {
            sums[key] = sum + amount;
        }
        catch (OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }

    /// <summary>
    /// 원장님 이름(AC-2701.4): 코드 50개씩 이름 SQL을 부른다(빈 자리는 그 묶음의 첫 코드). SQL이 코드·UidExpDte 차례로 주므로
    /// 코드마다 마지막 줄(가장 늦은 줄)의 이름을 쓴다. 앞뒤 빈칸을 빼고 40자까지, 비었거나 UidMst에 없으면 null.
    /// </summary>
    internal static List<StatsDoctor> DoctorNames(IBitDb db, SortedSet<string> codes)
    {
        var list = codes.ToList();
        var names = new Dictionary<string, string?>(StringComparer.Ordinal);
        for (var at = 0; at < list.Count; at += StatsSql.DoctorCodeSlots)
        {
            var batch = list.Skip(at).Take(StatsSql.DoctorCodeSlots).ToList();
            var args = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (var i = 0; i < StatsSql.DoctorCodeSlots; i++)
            {
                args["@d" + i.ToString(CultureInfo.InvariantCulture)] = i < batch.Count ? batch[i] : batch[0];
            }
            foreach (var row in ReadOnlyGuard.Query(db, StatsSql.DoctorNamesSql, args, StatsSql.DataTimeout))
            {
                var code = Text(StatsRows.Cell(row, 0));
                var name = OrNull(Text(StatsRows.Cell(row, 1)));
                if (code == null || !codes.Contains(code)) continue;
                names[code] = Cut(name, MaxNameLength);
            }
        }
        return list.Select(code => new StatsDoctor(code, names.TryGetValue(code, out var name) ? name : null)).ToList();
    }

    /// <summary>접수 시각: 네 자리 ASCII 숫자이고 0000~2359일 때만 그 글자, 아니면 null.</summary>
    private static string? ReceiptTime(object? value)
    {
        var text = Text(value);
        if (text == null || text.Length != 4 || !IsAsciiDigits(text)) return null;
        return int.Parse(text, NumberStyles.None, CultureInfo.InvariantCulture) <= LastTime ? text : null;
    }

    /// <summary>생년월일: 있는 날짜 8자리 YYYYMMDD일 때만 그 글자, 아니면 null. Worker(dates.ts isYmd)가 날짜로 보지 않는 0~99년도 null.</summary>
    private static string? Birth(object? value)
    {
        var text = Text(value);
        if (text == null || text.Length != 8 || !IsAsciiDigits(text)) return null;
        if (!DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) || day.Year < 100) return null;
        return text;
    }

    /// <summary>진료의 코드: 앞뒤 공백을 뺀 글자, 비면 null. 40자를 넘으면 E-BIT-READ-FAILED(Worker가 받지 않는 모양).</summary>
    private static string? Code(object? value)
    {
        var code = OrNull(Text(value));
        if (code != null && code.Length > MaxCodeLength) throw new BitException(BitErrors.ReadFailed);
        return code;
    }

    private static bool IsAsciiDigits(string text)
    {
        foreach (var c in text)
        {
            if (c < '0' || c > '9') return false;
        }
        return true;
    }

    /// <summary>금액 칸: DB NULL은 0. 숫자로 읽을 수 없으면 E-BIT-READ-FAILED(값을 예외 글에 싣지 않는다).</summary>
    private static decimal Amount(object? value)
    {
        if (value == null) return 0m;
        try
        {
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }

    /// <summary>원 미만만 버린다(지금 보고 금액과 같다: Floor가 아니라 0 쪽으로, -0.5 → 0).</summary>
    private static long Won(decimal amount)
    {
        try
        {
            return (long)Math.Truncate(amount);
        }
        catch (OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }

    private static string? Text(object? value) => value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();

    private static string? OrNull(string? text) => string.IsNullOrEmpty(text) ? null : text;

    private static string? Cut(string? text, int max) => text != null && text.Length > max ? text.Substring(0, max) : text;
}
