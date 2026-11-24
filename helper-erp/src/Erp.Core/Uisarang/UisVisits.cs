using System;
using System.Collections.Generic;
using System.Linq;

namespace Erp.Core.Uisarang;

/// <summary>
/// 위쪽 표 두 개(내원일별환자현황·예약환자통계 — 선택, 환자 정보 없음)의 합계(또는 그날) 줄과 아래쪽 표와 맞춰 보기
/// (spec erp-uisarang design.md 5-3·6-1·6-2, REQ-4207·REQ-4208, TASK-8).
/// - Read·ReadRsv: 날짜 칸이 '합계'(빈칸 뺀 글자)인 줄이 꼭 하나면 그 줄, 없으면 날짜 칸 = 마감 일자인 줄이 꼭 하나면 그 줄.
///   그 밖(없음·둘)이면 값은 모두 null이고 Columns에 '합계'. 숫자 칸 값은 0 이상 정수만(빈 칸·글·소수·음수는 null)
/// - New·Total·Reservations·Checks: 한 번 읽기(UisDay, TASK-13)가 넘긴 Facts로 답 칸을 정한다.
///   위쪽 표 Facts는 그 보고서가 ok(cached 포함)일 때만, 아래쪽 표 Facts도 ok일 때만 넘기고 아니면 null을 넘긴다
/// 줄만 받는다(파일·네트워크·기록에 닿지 않음).
/// </summary>
public static class UisVisits
{
    public const string VisitDayColumn = "내원일";
    public const string PeopleColumn = "인원수";
    public const string NewColumn = "신규환자";
    public const string RsvDayColumn = "예약일";
    public const string RsvTotalColumn = "예약건수";
    public const string RsvVisitedColumn = "이행건수";

    /// <summary>내원일별환자현황 위쪽 표(AC-4207.3): 합계(또는 그날) 줄 인원수·신규환자.</summary>
    public static VisitsFacts Read(UisSheet sheet, DateTime day)
    {
        Need(sheet, UisKind.Visits);
        var row = SumOrDayRow(sheet, VisitDayColumn, day);
        return new VisitsFacts
        {
            People = row == null ? null : Count(sheet, row, PeopleColumn),
            New = row == null ? null : Count(sheet, row, NewColumn),
            Columns = Columns(sheet, row),
        };
    }

    /// <summary>예약환자통계 위쪽 표(AC-4208.2): 합계(또는 그날) 줄 예약건수·이행건수.</summary>
    public static RsvFacts ReadRsv(UisSheet sheet, DateTime day)
    {
        Need(sheet, UisKind.Rsv);
        var row = SumOrDayRow(sheet, RsvDayColumn, day);
        return new RsvFacts
        {
            Total = row == null ? null : Count(sheet, row, RsvTotalColumn),
            Visited = row == null ? null : Count(sheet, row, RsvVisitedColumn),
            Columns = Columns(sheet, row),
        };
    }

    // ---- 답 칸(6-1·6-2) ---------------------------------------------------------------------------

    /// <summary>신환(AC-4207.3): 위쪽 표가 있으면 그 신규환자(못 읽었으면 null), 없으면 아래쪽 표 신규 줄 수, 둘 다 없으면 null.</summary>
    public static long? New(VisitsFacts? visits, VisitPatientFacts? visitPatients) =>
        visits != null ? visits.New : visitPatients?.NewRows;

    /// <summary>환자 합계(AC-4207.3): 위쪽 표가 있으면 그 인원수(못 읽었으면 null), 없으면 아래쪽 표 환자 줄 수, 둘 다 없으면 null.</summary>
    public static long? Total(VisitsFacts? visits, VisitPatientFacts? visitPatients) =>
        visits != null ? visits.People : visitPatients?.Rows;

    /// <summary>
    /// 예약 참고 숫자 uis.reservations(AC-4208.2): 위쪽 표 { 예약건수, 이행건수 }, 위쪽 표가 없거나 그 숫자를 못 읽었으면 아래쪽 표 { 줄 수, 방문 줄 수 },
    /// 둘 다 없으면 null.
    /// </summary>
    public static UisDayRsv? Reservations(RsvFacts? rsv, RsvPatientFacts? rsvPatients)
    {
        if (rsv?.Total is long total && rsv.Visited is long visited) return new UisDayRsv { Total = total, Visited = visited };
        if (rsvPatients != null) return new UisDayRsv { Total = rsvPatients.Rows, Visited = rsvPatients.Visited };
        return null;
    }

    /// <summary>
    /// 맞춰 보기(6-2, 경고만)의 내원·예약 칸을 채운다: visitRows = [아래쪽 환자 줄, 위쪽 인원수] · visitNew = [아래쪽 신규 줄, 위쪽 신규환자] ·
    /// rsvRows = [아래쪽 줄, 위쪽 예약건수] · rsvVisited = [아래쪽 방문 줄, 위쪽 이행건수] — 다를 때만, 한쪽이라도 없으면 null.
    /// noDate = 아래쪽 내원 표가 있고 조회일 라벨이 없음(AC-4207.5). 다른 칸(totalFee 등)은 건드리지 않는다.
    /// </summary>
    public static void Checks(
        UisDayChecks checks, VisitsFacts? visits, VisitPatientFacts? visitPatients, RsvFacts? rsv, RsvPatientFacts? rsvPatients)
    {
        if (checks == null) throw new ArgumentNullException(nameof(checks));
        checks.VisitRows = Mismatch(visitPatients?.Rows, visits?.People);
        checks.VisitNew = Mismatch(visitPatients?.NewRows, visits?.New);
        checks.RsvRows = Mismatch(rsvPatients?.Rows, rsv?.Total);
        checks.RsvVisited = Mismatch(rsvPatients?.Visited, rsv?.Visited);
        checks.NoDate = visitPatients != null && !visitPatients.HasDate;
    }

    /// <summary>둘 다 있고 다르면 [왼쪽, 오른쪽], 아니면 null.</summary>
    public static long[]? Mismatch(long? left, long? right) =>
        left is long a && right is long b && a != b ? new[] { a, b } : null;

    // ---- 안쪽 ---------------------------------------------------------------------------------------

    private static void Need(UisSheet sheet, UisKind kind)
    {
        if (sheet == null) throw new ArgumentNullException(nameof(sheet));
        if (sheet.Kind != kind) throw new ArgumentException("위쪽 표 종류가 맞지 않는 시트다", nameof(sheet));
    }

    /// <summary>날짜 칸 = '합계'인 줄이 꼭 하나면 그것, 없으면 날짜 칸 = 마감 일자인 줄이 꼭 하나면 그것, 아니면 null.</summary>
    private static IReadOnlyList<XlsCell>? SumOrDayRow(UisSheet sheet, string dayColumn, DateTime day)
    {
        var sums = sheet.Rows.Where(row => UisReport.Squeeze(UisReport.Value(sheet, row, dayColumn).Text) == UisReport.SumRow).Take(2).ToArray();
        if (sums.Length == 1) return sums[0];
        if (sums.Length > 1) return null;
        var days = sheet.Rows
            .Where(row => UisReport.TryDate(UisReport.Value(sheet, row, dayColumn).Text, out var date) && date == day.Date)
            .Take(2)
            .ToArray();
        return days.Length == 1 ? days[0] : null;
    }

    /// <summary>숫자 칸 값(5-3)이 0 이상 정수면 그 값, 아니면 null.</summary>
    private static long? Count(UisSheet sheet, IReadOnlyList<XlsCell> row, string column)
    {
        var number = UisReport.Number(UisReport.Value(sheet, row, column));
        if (!(number is double value) || value < 0 || Math.Floor(value) != value || value > long.MaxValue) return null;
        return (long)value;
    }

    /// <summary>못 찾은 칸 이름(5-3) + 쓸 줄이 없으면 '합계'.</summary>
    private static string[] Columns(UisSheet sheet, IReadOnlyList<XlsCell>? row)
    {
        var columns = sheet.MissingColumns.ToList();
        if (row == null) columns.Add(UisReport.SumRow);
        return columns.ToArray();
    }
}
