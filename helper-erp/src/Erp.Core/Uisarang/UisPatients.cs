using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

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

    /// <summary>예약 아래쪽 표 예약일 칸(칸 안 어디서든 날짜를 찾는다 — RsvDate, AC-4208.1·design 2-1 고침 15).</summary>
    public const string RsvDayColumn = "예약일";

    /// <summary>예약 아래쪽 표 방문 표시 칸과 그 값.</summary>
    public const string VisitColumn = "방문여부";

    public const string VisitValue = "방문";

    /// <summary>차트번호 자리 수 끝(1~12자리).</summary>
    public const int ChartDigits = 12;

    private const double ChartLimit = 1e12;

    /// <summary>엑셀 날짜 숫자로 보는 범위(1954-10-03 ~ 2119-01-10쯤). 밖이면 날짜가 아니다.</summary>
    private const double OaFrom = 20000;

    private const double OaTo = 80000;

    // 예약일 글 칸에서 찾는 날짜 꼴(차례대로 첫 것, RsvDate). 앞뒤에 숫자가 붙은 조각은 날짜가 아니다
    private static readonly Regex FullDate = new Regex(
        @"(?<![0-9])([0-9]{4})\s*[-./년]\s*([0-9]{1,2})\s*[-./월]\s*([0-9]{1,2})(?![0-9])", RegexOptions.CultureInvariant);

    private static readonly Regex EightDigits = new Regex(@"(?<![0-9])([0-9]{4})([0-9]{2})([0-9]{2})(?![0-9])", RegexOptions.CultureInvariant);

    private static readonly Regex ShortYear = new Regex(
        @"(?<![0-9])([0-9]{2})\s*[-./년]\s*([0-9]{1,2})\s*[-./월]\s*([0-9]{1,2})(?![0-9])", RegexOptions.CultureInvariant);

    private static readonly Regex MonthDay = new Regex(@"(?<![0-9])([0-9]{1,2})\s*[-./월]\s*([0-9]{1,2})(?![0-9])", RegexOptions.CultureInvariant);

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
    /// 환자 줄 예약일에서 찾은 날짜(RsvDate)가 모두 마감 일자인가(하나라도 아니면 false = otherDate).
    /// 날짜를 못 찾은 칸은 판단에서 뺀다 — 환자 줄이 없거나 어느 줄에서도 못 찾으면 true(그때 UisDay가 조회일 라벨로 본다, AC-4208.4).
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
            if (RsvDate(UisReport.Value(sheet, row, RsvDayColumn), day.Year) is DateTime date && date != day.Date) facts.AllOnDay = false;
        }
        facts.DistinctCharts = charts.Count;
        return facts;
    }

    /// <summary>
    /// 예약 아래쪽 표 환자 줄(차트번호 꼴인 줄)의 예약일 칸에서 찾은 날짜들(줄 차례, 못 찾은 줄은 뺌, AC-4208.4).
    /// 날짜만 낸다(칸 글자는 내지 않는다). 연도 없는 월-일은 마감 일자의 연도.
    /// </summary>
    public static IReadOnlyList<DateTime> RsvDays(UisSheet sheet, DateTime day)
    {
        Need(sheet, UisKind.RsvPatients);
        var days = new List<DateTime>();
        foreach (var row in sheet.Rows)
        {
            if (Chart(UisReport.Value(sheet, row, ChartColumn)) == null) continue;
            if (RsvDate(UisReport.Value(sheet, row, RsvDayColumn), day.Year) is DateTime date) days.Add(date);
        }
        return days;
    }

    /// <summary>
    /// 예약일 칸 하나의 날짜(design 2-1 고침 15, AC-4208.1). 못 찾으면 null(판단에서 뺀다).
    /// - 숫자 칸: 엑셀 날짜 숫자(20000~80000)면 그 날(시각은 버림)
    /// - 글 칸: 어디서든 ① 네 자리 연도-월-일(구분 '-'·'.'·'/'·'년'·'월', 사이 빈칸 허용) ② 여덟 자리 연월일
    ///   ③ 두 자리 연도-월-일(2000년대) ④ 연도 없는 월-일(구분 '-'·'.'·'/'·'월', year의 해) 차례로, 달력에 있는 첫 것.
    ///   앞뒤에 숫자가 붙은 조각은 아니다. 시각('14:30'·'오후 2:30')·요일 등 나머지 글은 보지 않는다
    /// </summary>
    public static DateTime? RsvDate(XlsCell cell, int year)
    {
        if (cell.Number is double number)
        {
            if (!(number >= OaFrom && number <= OaTo)) return null;
            return DateTime.FromOADate(number).Date;
        }
        var text = cell.Text;
        if (string.IsNullOrEmpty(text)) return null;
        return Find(FullDate, text!, match => Day(Int(match, 1), Int(match, 2), Int(match, 3)))
            ?? Find(EightDigits, text!, match => Day(Int(match, 1), Int(match, 2), Int(match, 3)))
            ?? Find(ShortYear, text!, match => Day(2000 + Int(match, 1), Int(match, 2), Int(match, 3)))
            ?? Find(MonthDay, text!, match => Day(year, Int(match, 1), Int(match, 2)));
    }

    private static DateTime? Find(Regex pattern, string text, Func<Match, DateTime?> date)
    {
        for (var match = pattern.Match(text); match.Success; match = match.NextMatch())
        {
            if (date(match) is DateTime found) return found;
        }
        return null;
    }

    private static int Int(Match match, int group) => int.Parse(match.Groups[group].Value, NumberStyles.None, CultureInfo.InvariantCulture);

    /// <summary>달력에 있는 날이면 그 날, 아니면 null.</summary>
    private static DateTime? Day(int year, int month, int date)
    {
        if (year < 1 || year > 9999 || month < 1 || month > 12 || date < 1 || date > DateTime.DaysInMonth(year, month)) return null;
        return new DateTime(year, month, date);
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

    private static void Need(UisSheet sheet, UisKind kind)
    {
        if (sheet == null) throw new ArgumentNullException(nameof(sheet));
        if (sheet.Kind != kind) throw new ArgumentException("환자별 표 종류가 맞지 않는 시트다", nameof(sheet));
    }
}
