using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Patients;

/// <summary>
/// spec erp-uisarang TASK-8 REQ-4207·REQ-4208·REQ-4209: 환자별 아래쪽 표 두 개(내원일별환자현황·예약환자통계)에서 숫자만 남기는 UisPatients
/// (design.md 5-3·6-1·6-4). 가짜 의사랑 엑셀(fixtures/fake-uisarang, 12-1)과 시험 안에서 만든 줄로 본다.
/// 환자 칸 글자는 모두 design.md 12-2 표시 글자 꼴의 지은 값이다(주민번호는 앞 7자리만 숫자, 차트번호는 9000001~).
/// </summary>
public class UisPatientsTests
{
    private static readonly DateTime Day = FakeUisFiles.Day;

    /// <summary>design.md 12-2 표시 글자: 결과·예외 글 어디에도 없어야 한다(AC-4209.1·AC-4209.3).</summary>
    private static readonly string[] Markers = { "가짜환자", "800101", "010-0000", "가짜시", "9000001" };

    private static XlsCell C(object? value) => value switch
    {
        null => XlsCell.Empty,
        string text => new XlsCell(text),
        int number => new XlsCell(number),
        long number => new XlsCell(number),
        double number => new XlsCell(number),
        _ => throw new ArgumentException("칸 값은 글자·숫자·null만"),
    };

    private static IReadOnlyList<XlsCell> Row(params object?[] cells) => cells.Select(C).ToArray();

    private static UisSheet Fake(string name) => UisReport.Read(FakeUisFiles.Rows(name));

    /// <summary>조회일 라벨(마감 일자 하루) + 내원 아래쪽 표 머리글(차트번호·주민등록번호·신규환자) + 자료 줄.</summary>
    private static UisSheet VisitSheet(params IReadOnlyList<XlsCell>[] rows)
    {
        var all = new List<IReadOnlyList<XlsCell>>
        {
            Row("내원일별환자현황 (환자별)"),
            Row("[조 회 일] 2026-11-23 ~ 2026-11-23"),
            Row("차트번호", "주민등록번호", "신규환자"),
        };
        all.AddRange(rows);
        var sheet = UisReport.Read(all);
        Assert.Equal(UisKind.VisitPatients, sheet.Kind);
        return sheet;
    }

    /// <summary>예약 아래쪽 표 머리글(예약일·차트번호·방문여부) + 자료 줄.</summary>
    private static UisSheet RsvSheet(params IReadOnlyList<XlsCell>[] rows)
    {
        var all = new List<IReadOnlyList<XlsCell>>
        {
            Row("예약환자통계 (환자별)"),
            Row("[조 회 일] 2026-11-23 ~ 2026-11-23"),
            Row("예약일", "차트번호", "방문여부"),
        };
        all.AddRange(rows);
        var sheet = UisReport.Read(all);
        Assert.Equal(UisKind.RsvPatients, sheet.Kind);
        return sheet;
    }

    private static void NoMarkers(string text)
    {
        foreach (var marker in Markers) Assert.DoesNotContain(marker, text);
    }

    // ---- AC-4207.1 내원 아래쪽 표: 환자 줄·신규·나이 구간·나이 못 셈 ------------------------------------

    [Fact(DisplayName = "AC-4207.1 가짜 visit-patients.xls(머리글 20줄마다 되풀이·끝 줄 '합계'): 환자 줄 97 · 신규 7 · 나이 구간별 신환/재진 · 나이 못 셈 3")]
    public void FakeVisitPatients()
    {
        var facts = UisPatients.ReadVisits(Fake("visit-patients.xls"), Day);
        Assert.Equal(97, facts.Rows);
        Assert.Equal(7, facts.NewRows);
        // 신규 7명: 17·73·38·8·73·44·52살, 재진 87명, 나이 못 셈(달력에 없는 날·마감 일자 뒤·빈 칸) 3명
        Assert.Equal(new[] { 1, 1, 0, 1, 1, 1, 0, 2, 0, 0 }, facts.AgeNew);
        Assert.Equal(new[] { 6, 9, 9, 9, 11, 7, 13, 8, 9, 6 }, facts.AgeReturn);
        Assert.Equal(3, facts.UnknownAge);
        Assert.Equal(facts.Rows, facts.AgeNew.Sum() + facts.AgeReturn.Sum() + facts.UnknownAge);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4207.1 가짜 visit-patients-no-date.xls(5줄): 환자 줄 5 · 신규 1 · 구간 10살 신환 1, 10·20·40살 재진")]
    public void FakeVisitPatientsNoDate()
    {
        var facts = UisPatients.ReadVisits(Fake("visit-patients-no-date.xls"), Day);
        Assert.Equal(5, facts.Rows);
        Assert.Equal(1, facts.NewRows);
        Assert.Equal(new[] { 0, 1, 0, 0, 0, 0, 0, 0, 0, 0 }, facts.AgeNew);
        Assert.Equal(new[] { 0, 1, 1, 0, 2, 0, 0, 0, 0, 0 }, facts.AgeReturn);
        Assert.Equal(0, facts.UnknownAge);
    }

    [Fact(DisplayName = "AC-4207.1 환자 줄 = 차트번호 칸이 숫자 1~12자리(글자 칸은 앞뒤 빈칸 뗌, 숫자 칸은 0 이상 정수)인 줄만")]
    public void PatientRowsAreChartDigits()
    {
        var sheet = VisitSheet(
            Row("1", "800101-1******", null),
            Row("123456789012", "800101-1******", null),
            Row(9000001.0, "800101-1******", null),
            Row(999999999999.0, "800101-1******", null),
            Row(" 9000002 ", "800101-1******", null),
            Row("1234567890123", "800101-1******", "신규"),
            Row(1000000000000.0, "800101-1******", "신규"),
            Row("A9000003", "800101-1******", "신규"),
            Row("9000-004", "800101-1******", "신규"),
            Row("9000 005", "800101-1******", "신규"),
            Row(9000006.5, "800101-1******", "신규"),
            Row(-9000007.0, "800101-1******", "신규"),
            Row("-9000008", "800101-1******", "신규"),
            Row(null, "800101-1******", "신규"),
            Row("합계", "5명", null));
        var facts = UisPatients.ReadVisits(sheet, Day);
        Assert.Equal(5, facts.Rows);
        Assert.Equal(0, facts.NewRows);
        Assert.Equal(5, facts.AgeReturn[4]);
        Assert.Equal(0, facts.UnknownAge);
    }

    [Fact(DisplayName = "AC-4207.1 신규 = '신규환자' 칸이 '신규'(빈칸 뺀 글자)인 줄, 그 밖(빈 칸·재진·신규 아닌 글·숫자)은 재진으로 센다")]
    public void NewIsShinGyu()
    {
        var sheet = VisitSheet(
            Row("9000001", "800101-1******", "신규"),
            Row("9000002", "800101-1******", " 신 규 "),
            Row("9000003", "800101-1******", null),
            Row("9000004", "800101-1******", "재진"),
            Row("9000005", "800101-1******", "신규아님"),
            Row("9000006", "800101-1******", 1.0));
        var facts = UisPatients.ReadVisits(sheet, Day);
        Assert.Equal(6, facts.Rows);
        Assert.Equal(2, facts.NewRows);
        Assert.Equal(2, facts.AgeNew[4]);
        Assert.Equal(4, facts.AgeReturn[4]);
    }

    [Fact(DisplayName = "AC-4207.1 나이 구간: 9살 '0' · 10살 '10' · 0살 '0' · 99살과 100살 '90'(90 이상), 신환/재진 칸을 따로 센다")]
    public void AgeBands()
    {
        var sheet = VisitSheet(
            Row("9000001", "170101-3******", "신규"),
            Row("9000002", "160101-4******", "신규"),
            Row("9000003", "261123-3******", null),
            Row("9000004", "270101-1******", null),
            Row("9000005", "260101-2******", "신규"),
            Row("9000006", "991231-9******", null));
        var facts = UisPatients.ReadVisits(sheet, Day);
        Assert.Equal(new[] { 1, 1, 0, 0, 0, 0, 0, 0, 0, 1 }, facts.AgeNew);
        Assert.Equal(new[] { 1, 0, 0, 0, 0, 0, 0, 0, 0, 2 }, facts.AgeReturn);
        Assert.Equal(0, facts.UnknownAge);
    }

    [Fact(DisplayName = "AC-4207.1 만 나이를 셀 수 없는 환자 줄(빈 칸·글자 섞임·달력에 없는 날·마감 일자 뒤·6자리·숫자 칸)은 UnknownAge에만 센다")]
    public void UnknownAgeRows()
    {
        var sheet = VisitSheet(
            Row("9000001", null, "신규"),
            Row("9000002", "가짜-1******", null),
            Row("9000003", "800230-1******", null),
            Row("9000004", "261231-4******", "신규"),
            Row("9000005", "800101", null),
            Row("9000006", 8001011.0, null),
            Row("9000007", "800101-1******", null));
        var facts = UisPatients.ReadVisits(sheet, Day);
        Assert.Equal(7, facts.Rows);
        Assert.Equal(2, facts.NewRows);
        Assert.Equal(6, facts.UnknownAge);
        Assert.Equal(0, facts.AgeNew.Sum());
        Assert.Equal(new[] { 0, 0, 0, 0, 1, 0, 0, 0, 0, 0 }, facts.AgeReturn);
    }

    [Fact(DisplayName = "AC-4207.1 마감 일자로 만 나이를 센다(생일 전날 39살 '30', 생일 당일 40살 '40')")]
    public void AgeUsesClosingDay()
    {
        var sheet = VisitSheet(Row("9000001", "861124-1******", null), Row("9000002", "861123-2******", null));
        var onDay = UisPatients.ReadVisits(sheet, Day);
        Assert.Equal(1, onDay.AgeReturn[3]);
        Assert.Equal(1, onDay.AgeReturn[4]);
        Assert.Equal(2, UisPatients.ReadVisits(sheet, new DateTime(2026, 11, 22)).AgeReturn[3]);
        Assert.Equal(2, UisPatients.ReadVisits(sheet, new DateTime(2026, 11, 24)).AgeReturn[4]);
    }

    [Fact(DisplayName = "AC-4207.1 주민등록번호 칸이 없으면(같은 이름 둘) 환자 줄은 모두 UnknownAge이고 Columns에 '주민등록번호'")]
    public void NoRrnColumn()
    {
        var rows = new List<IReadOnlyList<XlsCell>>
        {
            Row("[조 회 일] 2026-11-23"),
            Row("차트번호", "주민등록번호", "신규환자", "주민등록번호"),
            Row("9000001", "800101-1******", "신규", "800101-1******"),
            Row("9000002", "800101-1******", null, "800101-1******"),
        };
        var facts = UisPatients.ReadVisits(UisReport.Read(rows), Day);
        Assert.Equal(2, facts.Rows);
        Assert.Equal(1, facts.NewRows);
        Assert.Equal(2, facts.UnknownAge);
        Assert.Equal(0, facts.AgeNew.Sum() + facts.AgeReturn.Sum());
        Assert.Equal(new[] { "주민등록번호" }, facts.Columns);
    }

    [Fact(DisplayName = "AC-4207.1 환자 줄이 없으면 모두 0(10칸 배열은 그대로 10칸)")]
    public void NoPatientRows()
    {
        var facts = UisPatients.ReadVisits(VisitSheet(Row("합계", "0명", null)), Day);
        Assert.Equal(0, facts.Rows);
        Assert.Equal(0, facts.NewRows);
        Assert.Equal(0, facts.UnknownAge);
        Assert.Equal(new int[10], facts.AgeNew);
        Assert.Equal(new int[10], facts.AgeReturn);
    }

    // ---- AC-4207.5 조회일 라벨 있음/없음 -----------------------------------------------------------

    [Fact(DisplayName = "AC-4207.5 조회일 라벨이 있으면 HasDate = true이고 날짜는 AC-4204.2 규칙(마감 일자 하루면 ok, 아니면 otherDate)")]
    public void WithDateLabel()
    {
        var sheet = Fake("visit-patients.xls");
        Assert.True(UisPatients.ReadVisits(sheet, Day).HasDate);
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
        Assert.Equal(UisState.OtherDate, UisReport.State(sheet, Day.AddDays(1)));

        var otherDay = UisReport.Read(new[]
        {
            Row("[조 회 일] 2026-11-22 ~ 2026-11-23"),
            Row("차트번호", "주민등록번호", "신규환자"),
            Row("9000001", "800101-1******", "신규"),
        });
        Assert.True(UisPatients.ReadVisits(otherDay, Day).HasDate);
        Assert.Equal(UisState.OtherDate, UisReport.State(otherDay, Day));
    }

    [Fact(DisplayName = "AC-4207.5 조회일 라벨이 없으면 HasDate = false(checks.noDate)이고 날짜는 보지 않는다(어느 날이든 ok, 줄은 그대로 센다)")]
    public void WithoutDateLabel()
    {
        var sheet = Fake("visit-patients-no-date.xls");
        var facts = UisPatients.ReadVisits(sheet, Day);
        Assert.False(facts.HasDate);
        Assert.Equal(5, facts.Rows);
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
        Assert.Equal(UisState.Ok, UisReport.State(sheet, new DateTime(2026, 1, 2)));
    }

    // ---- AC-4208.1 예약 아래쪽 표: 서로 다른 차트번호·방문·예약일 -----------------------------------------

    [Fact(DisplayName = "AC-4208.1 가짜 rsv-patients.xls: 줄 32 · 방문 25 · 서로 다른 차트번호 31(같은 사람 두 줄) · 예약일 꼴 넷(날짜만·시각 붙음·점·빗금)이 모두 마감 일자")]
    public void FakeRsvPatients()
    {
        var facts = UisPatients.ReadRsv(Fake("rsv-patients.xls"), Day);
        Assert.Equal(32, facts.Rows);
        Assert.Equal(25, facts.Visited);
        Assert.Equal(31, facts.DistinctCharts);
        Assert.True(facts.AllOnDay);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4208.1 가짜 rsv-patients-other-day.xls: 예약일이 다른 줄이 하나라도 있으면 AllOnDay = false(줄 셈은 그대로)")]
    public void FakeRsvPatientsOtherDay()
    {
        var facts = UisPatients.ReadRsv(Fake("rsv-patients-other-day.xls"), Day);
        Assert.Equal(10, facts.Rows);
        Assert.Equal(10, facts.Visited);
        Assert.Equal(10, facts.DistinctCharts);
        Assert.False(facts.AllOnDay);
        Assert.False(UisPatients.ReadRsv(Fake("rsv-patients-other-day.xls"), new DateTime(2026, 11, 24)).AllOnDay);
    }

    /// <summary>시험 글 → 예약일 칸 값: "" = 빈 칸, "oadate" = 2026-11-23 14:30의 엑셀 날짜 숫자, "n:값" = 숫자 칸, 나머지는 글자 칸.</summary>
    private static object? RsvCell(string text)
    {
        if (text.Length == 0) return null;
        if (text == "oadate") return new DateTime(2026, 11, 23, 14, 30, 0).ToOADate();
        if (text.StartsWith("n:", StringComparison.Ordinal)) return double.Parse(text.Substring(2), System.Globalization.CultureInfo.InvariantCulture);
        return text;
    }

    [Theory(DisplayName = "AC-4208.1 예약일 칸 어디서든 날짜를 찾으면 그날(design 2-1 고침 15): 시각·오전/오후·초·요일·'년월일'·시각 앞·두 자리 연도·여덟 자리·연도 없는 월-일·엑셀 날짜 숫자")]
    [InlineData("2026-11-23")]
    [InlineData("2026-11-23 14:30")]
    [InlineData("2026-11-23 오후 2:30")]
    [InlineData("2026/11/23 09:00:00")]
    [InlineData("2026.11.23")]
    [InlineData("2026.11.23(월) 14:30")]
    [InlineData("2026. 11. 23. 오후 2:30:00")]
    [InlineData("2026년 11월 23일 14:30")]
    [InlineData("14:30 2026-11-23")]
    [InlineData("26-11-23 14:30")]
    [InlineData("20261123")]
    [InlineData("20261123 1430")]
    [InlineData("11/23 14:30")]
    [InlineData("11-23(월) 오전 9:00")]
    [InlineData("11월 23일")]
    [InlineData("11/23/2026")]
    [InlineData("oadate")]
    [InlineData("n:46349")]
    public void RsvDayForms(string text)
    {
        Assert.Equal((DateTime?)Day, UisPatients.RsvDate(C(RsvCell(text)), Day.Year));
        var facts = UisPatients.ReadRsv(RsvSheet(Row("2026-11-23", "9000001", "방문"), Row(RsvCell(text), "9000002", "방문")), Day);
        Assert.Equal(2, facts.Rows);
        Assert.True(facts.AllOnDay);
    }

    [Theory(DisplayName = "AC-4208.1 환자 줄 하나라도 예약일에서 찾은 날짜가 마감 일자가 아니면 AllOnDay = false(다른 날·시각 붙은 다른 날·연도 없는 다른 날·엑셀 날짜 숫자 다른 날)")]
    [InlineData("2026-11-24", 2026, 11, 24)]
    [InlineData("2026-11-24 09:00", 2026, 11, 24)]
    [InlineData("2026-11-22 23:59", 2026, 11, 22)]
    [InlineData("11-24 오전 9:00", 2026, 11, 24)]
    [InlineData("n:46350.5", 2026, 11, 24)]
    public void RsvOtherDay(string text, int year, int month, int date)
    {
        Assert.Equal((DateTime?)new DateTime(year, month, date), UisPatients.RsvDate(C(RsvCell(text)), Day.Year));
        var facts = UisPatients.ReadRsv(RsvSheet(Row("2026-11-23", "9000001", "방문"), Row(RsvCell(text), "9000002", "방문")), Day);
        Assert.Equal(2, facts.Rows);
        Assert.False(facts.AllOnDay);
    }

    [Theory(DisplayName = "AC-4208.1 예약일 칸에서 날짜를 못 찾으면(빈 칸·'내일'·시각만·달력에 없는 날·숫자가 붙은 조각·엑셀 날짜 범위 밖 숫자) 판단에서 뺀다 — 다른 줄이 그날이면 AllOnDay = true")]
    [InlineData("")]
    [InlineData("내일")]
    [InlineData("14:30")]
    [InlineData("오후 2:30")]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30")]
    [InlineData("120261123")]
    [InlineData("2026-11-234")]
    [InlineData("n:5")]
    [InlineData("n:90000")]
    public void RsvNoDateLeftOut(string text)
    {
        Assert.Null(UisPatients.RsvDate(C(RsvCell(text)), Day.Year));
        var facts = UisPatients.ReadRsv(RsvSheet(Row("2026-11-23", "9000001", "방문"), Row(RsvCell(text), "9000002", "방문")), Day);
        Assert.Equal(2, facts.Rows);
        Assert.True(facts.AllOnDay);
        Assert.Equal(new[] { Day }, UisPatients.RsvDays(RsvSheet(Row("2026-11-23", "9000001", "방문"), Row(RsvCell(text), "9000002", "방문")), Day));

        var alone = RsvSheet(Row(RsvCell(text), "9000001", "방문"));
        Assert.True(UisPatients.ReadRsv(alone, Day).AllOnDay);
        Assert.Empty(UisPatients.RsvDays(alone, Day));
    }

    [Fact(DisplayName = "AC-4208.1 차트번호 꼴이 아닌 줄(끝 '합계' 줄 등)은 예약일을 보지 않고 세지도 않는다, 환자 줄이 없으면 AllOnDay = true")]
    public void RsvIgnoresNonPatientRows()
    {
        var facts = UisPatients.ReadRsv(RsvSheet(
            Row("2026-11-23", "9000001", "방문"),
            Row("합계", "1건", null),
            Row("2026-11-30", "가짜", "방문")), Day);
        Assert.Equal(1, facts.Rows);
        Assert.Equal(1, facts.Visited);
        Assert.Equal(1, facts.DistinctCharts);
        Assert.True(facts.AllOnDay);
        // 날짜를 찾은 줄 목록도 환자 줄만(차트번호 꼴이 아닌 줄의 '2026-11-30'은 없음)
        Assert.Equal(new[] { Day }, UisPatients.RsvDays(RsvSheet(
            Row("2026-11-23", "9000001", "방문"),
            Row("합계", "1건", null),
            Row("출력 2026-11-30 10:12", null, null),
            Row("2026-11-30", "가짜", "방문")), Day));

        var empty = UisPatients.ReadRsv(RsvSheet(Row("합계", "0건", null)), Day);
        Assert.Equal(0, empty.Rows);
        Assert.Equal(0, empty.DistinctCharts);
        Assert.True(empty.AllOnDay);
    }

    [Fact(DisplayName = "AC-4208.1 방문 = 방문여부 칸이 '방문'(빈칸 뺀 글자)인 줄만(미방문·방문취소·빈 칸은 아님)")]
    public void RsvVisited()
    {
        var facts = UisPatients.ReadRsv(RsvSheet(
            Row("2026-11-23", "9000001", "방문"),
            Row("2026-11-23", "9000002", " 방 문 "),
            Row("2026-11-23", "9000003", "미방문"),
            Row("2026-11-23", "9000004", "방문취소"),
            Row("2026-11-23", "9000005", null)), Day);
        Assert.Equal(5, facts.Rows);
        Assert.Equal(2, facts.Visited);
    }

    [Fact(DisplayName = "AC-4208.1 서로 다른 차트번호 수: 같은 번호 여러 줄은 하나(글자 칸·숫자 칸·앞 0·앞뒤 빈칸이 달라도 같은 번호)")]
    public void RsvDistinctCharts()
    {
        var facts = UisPatients.ReadRsv(RsvSheet(
            Row("2026-11-23", "9000001", "방문"),
            Row("2026-11-23", 9000001.0, "미방문"),
            Row("2026-11-23", " 9000001 ", "방문"),
            Row("2026-11-23", "09000001", "방문"),
            Row("2026-11-23", "9000002", "방문"),
            Row("2026-11-23", "1", "방문")), Day);
        Assert.Equal(6, facts.Rows);
        Assert.Equal(5, facts.Visited);
        Assert.Equal(3, facts.DistinctCharts);
    }

    [Fact(DisplayName = "AC-4208.1 방문여부 칸이 없으면(같은 이름 둘) 방문 0이고 Columns에 '방문여부', 줄·차트번호 셈은 그대로")]
    public void RsvNoVisitColumn()
    {
        var sheet = UisReport.Read(new[]
        {
            Row("예약일", "차트번호", "방문여부", "방문여부"),
            Row("2026-11-23", "9000001", "방문", "방문"),
            Row("2026-11-23", "9000002", "방문", "방문"),
        });
        var facts = UisPatients.ReadRsv(sheet, Day);
        Assert.Equal(2, facts.Rows);
        Assert.Equal(0, facts.Visited);
        Assert.Equal(2, facts.DistinctCharts);
        Assert.True(facts.AllOnDay);
        Assert.Equal(new[] { "방문여부" }, facts.Columns);
    }

    // ---- AC-4209.3 결과에 글자 칸 없음 · 환자 칸 글자를 남기지 않음 ------------------------------------------

    [Fact(DisplayName = "AC-4209.3 VisitPatientFacts·RsvPatientFacts 공개 칸은 숫자·참거짓·칸 이름(Columns)뿐이다(리플렉션)")]
    public void FactsHaveNoTextFields()
    {
        var allowed = new[] { typeof(int), typeof(int[]), typeof(bool) };
        foreach (var type in new[] { typeof(VisitPatientFacts), typeof(RsvPatientFacts) })
        {
            Assert.Empty(type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static));
            foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
            {
                if (property.Name == "Columns")
                {
                    Assert.Equal(typeof(string[]), property.PropertyType);
                    continue;
                }
                Assert.Contains(property.PropertyType, allowed);
            }
        }
    }

    [Fact(DisplayName = "AC-4209.3 가짜 환자별 엑셀 넷을 셈한 결과(JSON)에 12-2 표시 글자가 없고, Columns에는 찾는 칸 이름만 든다")]
    public void FactsHoldNoPatientText()
    {
        var wanted = new HashSet<string>(StringComparer.Ordinal) { "차트번호", "주민등록번호", "신규환자", "예약일", "방문여부" };
        var results = new List<object>
        {
            UisPatients.ReadVisits(Fake("visit-patients.xls"), Day),
            UisPatients.ReadVisits(Fake("visit-patients-no-date.xls"), Day),
            UisPatients.ReadRsv(Fake("rsv-patients.xls"), Day),
            UisPatients.ReadRsv(Fake("rsv-patients-other-day.xls"), Day),
            UisPatients.ReadVisits(UisReport.Read(new[]
            {
                Row("차트번호", "주민등록번호", "신규환자", "신규환자", "수진자명", "전화번호", "주소"),
                Row("9000001", "800101-1******", "신규", "신규", "가짜환자01", "010-0000-0001", "가짜시 가짜구 1"),
            }), Day),
        };
        foreach (var result in results)
        {
            var json = JsonSerializer.Serialize(result, result.GetType());
            NoMarkers(json);
            var columns = (string[])result.GetType().GetProperty("Columns")!.GetValue(result)!;
            Assert.All(columns, column => Assert.Contains(column, wanted));
        }
    }

    [Fact(DisplayName = "AC-4209.3 다른 종류 시트·null을 넘기면 예외이고 그 글에 12-2 표시 글자가 없다")]
    public void WrongSheetThrowsWithoutPatientText()
    {
        var rsv = Fake("rsv-patients.xls");
        var visits = Fake("visit-patients.xls");
        var unknown = UisReport.Read(new[] { Row("가짜환자01", "800101-1******", "9000001", "010-0000-0001", "가짜시 가짜구 1") });
        var errors = new List<Exception>
        {
            Assert.ThrowsAny<ArgumentException>(() => UisPatients.ReadVisits(rsv, Day)),
            Assert.ThrowsAny<ArgumentException>(() => UisPatients.ReadVisits(unknown, Day)),
            Assert.ThrowsAny<ArgumentException>(() => UisPatients.ReadRsv(visits, Day)),
            Assert.ThrowsAny<ArgumentException>(() => UisPatients.ReadRsv(unknown, Day)),
            Assert.Throws<ArgumentNullException>(() => UisPatients.ReadVisits(null!, Day)),
            Assert.Throws<ArgumentNullException>(() => UisPatients.ReadRsv(null!, Day)),
        };
        foreach (var error in errors) NoMarkers(error.ToString());
    }
}
