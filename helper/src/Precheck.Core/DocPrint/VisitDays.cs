using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint;

/// <summary>왔던 날 한 줄: 날짜, 수납 전인지, 처방전이 있는지, 그날 센 내원 번호들(OcmNum, 접수 차례).</summary>
public sealed class VisitDay
{
    private static readonly string[] WeekDays = { "일", "월", "화", "수", "목", "금", "토" };

    public VisitDay(DateTime date, bool unpaid, bool hasRx, IEnumerable<string> visitNums)
    {
        Date = date.Date;
        Unpaid = unpaid;
        HasRx = hasRx;
        VisitNums = (visitNums ?? Enumerable.Empty<string>()).ToArray();
    }

    public DateTime Date { get; }

    /// <summary>그날 내원이 하나라도 수납 전(상태 PN 아님 또는 영수증 줄 없음). 처음엔 체크를 풀어 둔다.</summary>
    public bool Unpaid { get; }

    /// <summary>그날 내원에 처방전(OutInf 줄)이 하나라도 있음.</summary>
    public bool HasRx { get; }

    /// <summary>그날 센 내원 번호(OcmInf.OcmNum, 뒤 빈칸만 뺌). 서류 SQL에 @매개변수로 넘겨 '=' 로 견준다.</summary>
    public IReadOnlyList<string> VisitNums { get; }

    /// <summary>목록 글: yyyy-MM-dd (요일).</summary>
    public string DateText => Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + " (" + WeekDays[(int)Date.DayOfWeek] + ")";
}

/// <summary>
/// 그 기간에 왔던 날(spec doc-print AC-7403.2)과 첫 내원일(AC-7403.1 '전체'). 문장은 DocSql.VisitDaysSql·FirstVisitSql, ReadOnlyGuard를 지나 읽기만 한다.
/// 읽기 실패는 BitException 그대로 올린다(창이 오류 글을 보인다).
/// </summary>
public static class VisitDays
{
    /// <summary>from~to(날, 끝 날 포함)에 센 내원을 날마다 한 줄, 오래된 날부터. 틀린 차트번호·시작이 끝보다 늦으면 DB에 묻지 않고 빈 목록.</summary>
    public static IReadOnlyList<VisitDay> Read(IBitDb db, string chart, DateTime from, DateTime to)
    {
        if (!IsChart(chart) || from.Date > to.Date) return Array.Empty<VisitDay>();
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = chart,
            ["@from"] = Day(from.Date) + "0000",
            ["@to"] = Day(to.Date.AddDays(1)) + "0000",
        };
        var visits = new List<(DateTime Date, string Visit, bool Paid, bool Rx)>();
        foreach (var row in ReadOnlyGuard.Query(db, DocSql.VisitDaysSql, args, DocSql.ReadTimeout))
        {
            if (row == null || row.Count < 5 || !ParseDay(row[0], out var date)) continue;
            var paid = string.Equals(Text(row[2]), "PN", StringComparison.Ordinal) && IsOne(row[3]);
            // 내원 번호는 뒤 빈칸만 뺀다(앞 빈칸이 있으면 그대로 두어야 '=' 로 다시 찾을 수 있다)
            var visit = (Convert.ToString(row[1], CultureInfo.InvariantCulture) ?? "").TrimEnd();
            visits.Add((date, visit, paid, IsOne(row[4])));
        }
        return visits
            .GroupBy(visit => visit.Date)
            .OrderBy(group => group.Key)
            .Select(group => new VisitDay(group.Key, group.Any(v => !v.Paid), group.Any(v => v.Rx), group.Select(v => v.Visit)))
            .ToArray();
    }

    /// <summary>센 내원 중 가장 이른 날. 없거나 틀린 날·틀린 차트번호면 null.</summary>
    public static DateTime? FirstVisit(IBitDb db, string chart)
    {
        if (!IsChart(chart)) return null;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@cht"] = chart };
        var rows = ReadOnlyGuard.Query(db, DocSql.FirstVisitSql, args, DocSql.ReadTimeout);
        if (rows.Count == 0 || rows[0] == null || rows[0].Count == 0) return null;
        return ParseDay(rows[0][0], out var day) ? day : (DateTime?)null;
    }

    /// <summary>정리한 차트번호(앞 0 없는 숫자 1~14자리)인가.</summary>
    private static bool IsChart(string? chart) =>
        chart != null && chart.Length >= 1 && chart.Length <= SearchInput.MaxDigits && chart[0] != '0' && chart.All(c => c >= '0' && c <= '9');

    private static string Day(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static bool ParseDay(object? value, out DateTime day) =>
        DateTime.TryParseExact(Text(value), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    private static string Text(object? value) => (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "").Trim();

    private static bool IsOne(object? value)
    {
        try
        {
            return value != null && !(value is DBNull) && Convert.ToInt64(value, CultureInfo.InvariantCulture) == 1;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
