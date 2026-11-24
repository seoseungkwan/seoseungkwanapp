using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Erp.Core.Uisarang;

/// <summary>
/// 환자별 아래쪽 표 두 개(내원일별환자현황·예약환자통계)에서 숫자만 남긴다(spec erp-uisarang design.md 5-3·6-1·6-4, REQ-4207·REQ-4208, TASK-8).
/// - 환자 줄 = 차트번호 칸이 숫자 1~12자리인 줄(글자 칸은 앞뒤 빈칸 뗌, 숫자 칸은 0 이상 정수). 끝 '합계' 줄·쪽 머리 줄은 세지 않는다
/// - 주민등록번호는 만 나이 셈(UisAge)에만, 차트번호는 줄 가리기와 서로 다른 수 세기에만 메모리 안에서 쓴다(AC-4209.3).
///   그 밖의 환자 칸은 찾지 않는다(UisReport가 찾는 칸에도 없다). 결과는 숫자·참거짓·못 찾은 칸 이름뿐이다
/// 줄만 받는다(파일·네트워크·기록에 닿지 않음). 예외 글에 칸 값을 넣지 않는다(AC-4209.1).
/// </summary>
public static class UisPatients
{
    /// <summary>차트번호 칸(5-3).</summary>
    public const string ChartColumn = "차트번호";

    /// <summary>내원 아래쪽 표의 주민번호 칸 — 만 나이 셈에만(6-4).</summary>
    public const string RrnColumn = "주민등록번호";

    /// <summary>내원 아래쪽 표 신규 표시 칸과 그 값.</summary>
    public const string NewColumn = "신규환자";

    public const string NewValue = "신규";

    /// <summary>예약 아래쪽 표 예약일 칸(앞 10글자로 날짜를 본다, AC-4208.1).</summary>
    public const string RsvDayColumn = "예약일";

    /// <summary>예약 아래쪽 표 방문 표시 칸과 그 값.</summary>
    public const string VisitColumn = "방문여부";

    public const string VisitValue = "방문";

    /// <summary>차트번호 자리 수 끝(1~12자리).</summary>
    public const int ChartDigits = 12;

    private const double ChartLimit = 1e12;

    /// <summary>
    /// 내원일별환자현황 아래쪽 표(AC-4207.1·AC-4207.5): 환자 줄 수 · '신규' 줄 수 · 마감 일자 기준 만 나이 10살 구간(0·10·…·90)별 신규/그 밖 ·
    /// 만 나이를 셀 수 없는 줄 수 · 조회일 라벨이 있었나(날짜 판정은 UisReport.State). 주민등록번호 칸을 못 찾았으면 모든 환자 줄이 나이 못 셈.
    /// </summary>
    public static VisitPatientFacts ReadVisits(UisSheet sheet, DateTime day)
    {
        Need(sheet, UisKind.VisitPatients);
        var facts = new VisitPatientFacts
        {
            HasDate = UisReport.HasDateLabel(sheet),
            Columns = sheet.MissingColumns.ToArray(),
        };
        foreach (var row in sheet.Rows)
        {
            if (Chart(UisReport.Value(sheet, row, ChartColumn)) == null) continue;
            facts.Rows++;
            var isNew = UisReport.Squeeze(UisReport.Value(sheet, row, NewColumn).Text) == NewValue;
            if (isNew) facts.NewRows++;
            var age = UisAge.Age(UisReport.Value(sheet, row, RrnColumn).Text, day);
            if (age is int years)
            {
                var band = UisAge.Band(years) / 10;
                if (isNew) facts.AgeNew[band]++;
                else facts.AgeReturn[band]++;
            }
            else
            {
                facts.UnknownAge++;
            }
        }
        return facts;
    }

    /// <summary>
    /// 예약환자통계 아래쪽 표(AC-4208.1): 환자 줄 수 · '방문' 줄 수 · 서로 다른 차트번호 수(= 실예약환자수) ·
    /// 환자 줄 예약일(앞 10글자, '.'·'/'는 '-'로)이 모두 마감 일자인가(하나라도 아니면 false = otherDate, 환자 줄이 없으면 true).
    /// </summary>
    public static RsvPatientFacts ReadRsv(UisSheet sheet, DateTime day)
    {
        Need(sheet, UisKind.RsvPatients);
        var charts = new HashSet<long>();
        var facts = new RsvPatientFacts { AllOnDay = true, Columns = sheet.MissingColumns.ToArray() };
        foreach (var row in sheet.Rows)
        {
            if (!(Chart(UisReport.Value(sheet, row, ChartColumn)) is long chart)) continue;
            facts.Rows++;
            charts.Add(chart);
            if (UisReport.Squeeze(UisReport.Value(sheet, row, VisitColumn).Text) == VisitValue) facts.Visited++;
            if (!OnDay(UisReport.Value(sheet, row, RsvDayColumn), day)) facts.AllOnDay = false;
        }
        facts.DistinctCharts = charts.Count;
        return facts;
    }

    /// <summary>
    /// 차트번호 칸이 숫자 1~12자리면 그 수(서로 다른 수 세기용 — 글자로 두지 않는다), 아니면 null.
    /// 글자 칸은 앞뒤 빈칸을 떼고 0~9만이어야 한다. 숫자 칸은 0 이상 정수이고 12자리 이하여야 한다.
    /// </summary>
    private static long? Chart(XlsCell cell)
    {
        if (cell.Number is double number)
        {
            if (number < 0 || number >= ChartLimit || Math.Floor(number) != number) return null;
            return (long)number;
        }
        var text = cell.Text?.Trim();
        if (string.IsNullOrEmpty(text) || text!.Length > ChartDigits) return null;
        foreach (var c in text)
        {
            if (c < '0' || c > '9') return null;
        }
        return long.Parse(text, NumberStyles.None, CultureInfo.InvariantCulture);
    }

    /// <summary>예약일 칸 앞 10글자('.'·'/'는 '-'로)가 마감 일자인가. 빈 칸·숫자 칸·날짜 아닌 글은 아니다.</summary>
    private static bool OnDay(XlsCell cell, DateTime day)
    {
        var text = cell.Text?.Trim();
        if (string.IsNullOrEmpty(text)) return false;
        var head = (text!.Length > 10 ? text.Substring(0, 10) : text).Replace('.', '-').Replace('/', '-');
        return UisReport.TryDate(head, out var date) && date == day.Date;
    }

    private static void Need(UisSheet sheet, UisKind kind)
    {
        if (sheet == null) throw new ArgumentNullException(nameof(sheet));
        if (sheet.Kind != kind) throw new ArgumentException("환자별 표 종류가 맞지 않는 시트다", nameof(sheet));
    }
}
