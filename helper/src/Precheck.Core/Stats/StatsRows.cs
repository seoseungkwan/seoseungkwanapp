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

/// <summary>접수 줄 [차트번호, 진료일, 접수 건수, 첫 내원일], 환자·날마다 한 줄. 글자는 앞뒤 공백만 없앤 원본 값, 첫 내원일이 없으면 null.</summary>
public sealed class StatsPatientDay
{
    public StatsPatientDay(string? chart, string? day, long visits, string? firstDay)
    {
        Chart = chart;
        Day = day;
        Visits = visits;
        FirstDay = firstDay;
    }

    public string? Chart { get; }

    public string? Day { get; }

    public long Visits { get; }

    public string? FirstDay { get; }
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
            patientDays.Add(new StatsPatientDay(Text(Cell(row, 0)), Text(Cell(row, 1)), Number(Cell(row, 2)), FirstDay(Cell(row, 3))));
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
