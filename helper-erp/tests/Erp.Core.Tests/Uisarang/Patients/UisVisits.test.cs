using System;
using System.Collections.Generic;
using System.Linq;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Patients;

/// <summary>
/// spec erp-uisarang TASK-8 REQ-4207·REQ-4208: 위쪽 표 두 개(내원일별환자현황·예약환자통계, 선택)의 합계(또는 그날) 줄 UisVisits와
/// 아래쪽 표와 맞춰 보기(design.md 5-3·6-1·6-2). 위쪽 표는 없어도 되고, 있으면 아래쪽 표 줄 수·신규·방문 수와 견줘 다르면 경고만 한다.
/// 가짜 의사랑 엑셀(fixtures/fake-uisarang, 12-1)과 시험 안에서 만든 줄로 본다. 숫자는 지은 값이다.
/// </summary>
public class UisVisitsTests
{
    private static readonly DateTime Day = FakeUisFiles.Day;

    private static XlsCell C(object? value) => value switch
    {
        null => XlsCell.Empty,
        string text => new XlsCell(text),
        int number => new XlsCell(number),
        double number => new XlsCell(number),
        _ => throw new ArgumentException("칸 값은 글자·숫자·null만"),
    };

    private static IReadOnlyList<XlsCell> Row(params object?[] cells) => cells.Select(C).ToArray();

    private static UisSheet Fake(string name) => UisReport.Read(FakeUisFiles.Rows(name));

    private static UisSheet Top(string[] header, params IReadOnlyList<XlsCell>[] rows)
    {
        var all = new List<IReadOnlyList<XlsCell>> { Row("[조 회 일] 2026-11-23 ~ 2026-11-23"), header.Select(name => new XlsCell(name)).ToArray() };
        all.AddRange(rows);
        return UisReport.Read(all);
    }

    private static readonly string[] VisitsHeader = { "내원일", "인원수", "신규환자", "초진", "재진" };

    private static readonly string[] RsvHeader = { "예약일", "예약건수", "이행건수", "취소건수" };

    private static UisSheet VisitsSheet(params IReadOnlyList<XlsCell>[] rows)
    {
        var sheet = Top(VisitsHeader, rows);
        Assert.Equal(UisKind.Visits, sheet.Kind);
        return sheet;
    }

    private static UisSheet RsvSheet(params IReadOnlyList<XlsCell>[] rows)
    {
        var sheet = Top(RsvHeader, rows);
        Assert.Equal(UisKind.Rsv, sheet.Kind);
        return sheet;
    }

    private static VisitPatientFacts Bottom(int rows, int newRows, bool hasDate = true) =>
        new VisitPatientFacts { Rows = rows, NewRows = newRows, HasDate = hasDate };

    private static RsvPatientFacts RsvBottom(int rows, int visited, int distinct) =>
        new RsvPatientFacts { Rows = rows, Visited = visited, DistinctCharts = distinct, AllOnDay = true };

    // ---- AC-4207.3 내원 위쪽 표 합계(또는 그날) 줄 -----------------------------------------------------

    [Fact(DisplayName = "AC-4207.3 가짜 visits.xls: 합계 줄 인원수 97 · 신규환자 7이고 아래쪽 표(visit-patients.xls) 환자 줄 97 · 신규 7과 같다")]
    public void FakeVisits()
    {
        var facts = UisVisits.Read(Fake("visits.xls"), Day);
        Assert.Equal(97, facts.People);
        Assert.Equal(7, facts.New);
        Assert.Empty(facts.Columns);

        var bottom = UisPatients.ReadVisits(Fake("visit-patients.xls"), Day);
        Assert.Equal(facts.People, bottom.Rows);
        Assert.Equal(facts.New, bottom.NewRows);
    }

    [Fact(DisplayName = "AC-4207.3 내원일이 '합계'(빈칸 뺀 글자)인 줄이 있으면 그 줄을 쓴다(그날 줄보다 먼저)")]
    public void VisitsSumRowFirst()
    {
        var facts = UisVisits.Read(VisitsSheet(
            Row("2026-11-23", 50, 5, 1, 49),
            Row(" 합 계 ", 60, 6, 2, 58)), Day);
        Assert.Equal(60, facts.People);
        Assert.Equal(6, facts.New);
        Assert.Empty(facts.Columns);
    }

    [Theory(DisplayName = "AC-4207.3 합계 줄이 없으면 내원일 = 마감 일자인 줄 하나(구분 -./)를 쓴다")]
    [InlineData("2026-11-23")]
    [InlineData("2026.11.23")]
    [InlineData("2026/11/23")]
    [InlineData(" 2026-11-23 ")]
    public void VisitsDayRow(string day)
    {
        var facts = UisVisits.Read(VisitsSheet(
            Row("2026-11-22", 10, 1, 1, 9),
            Row(day, 20, 2, 2, 18),
            Row("2026-11-24", 30, 3, 3, 27)), Day);
        Assert.Equal(20, facts.People);
        Assert.Equal(2, facts.New);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4207.3 합계 줄도 그날 줄도 없거나, 합계 줄이 둘이거나, 합계 없이 그날 줄이 둘이면 값은 null이고 Columns에 '합계'")]
    public void VisitsNoRow()
    {
        var sheets = new[]
        {
            VisitsSheet(Row("2026-11-22", 10, 1, 1, 9)),
            VisitsSheet(Row("합계", 10, 1, 1, 9), Row("합계", 20, 2, 2, 18)),
            VisitsSheet(Row("2026-11-23", 10, 1, 1, 9), Row("2026-11-23", 20, 2, 2, 18)),
            VisitsSheet(),
        };
        foreach (var sheet in sheets)
        {
            var facts = UisVisits.Read(sheet, Day);
            Assert.Null(facts.People);
            Assert.Null(facts.New);
            Assert.Equal(new[] { UisReport.SumRow }, facts.Columns);
        }
    }

    [Fact(DisplayName = "AC-4207.3 줄의 숫자 칸: 숫자·'1,234' 글자는 그 값, 빈 칸·숫자 아닌 글·소수·음수는 null(0이 아님)")]
    public void VisitsCellValues()
    {
        var comma = UisVisits.Read(VisitsSheet(Row("합계", "1,234", 7.0)), Day);
        Assert.Equal(1234, comma.People);
        Assert.Equal(7, comma.New);

        foreach (var bad in new object?[] { null, "많음", 97.5, -1, "-3" })
        {
            var facts = UisVisits.Read(VisitsSheet(Row("합계", bad, bad)), Day);
            Assert.Null(facts.People);
            Assert.Null(facts.New);
            Assert.Empty(facts.Columns);
        }
    }

    [Fact(DisplayName = "AC-4207.3 인원수 칸이 없으면(같은 이름 둘) 인원수만 null이고 Columns에 '인원수', 신규환자는 그대로 읽는다")]
    public void VisitsMissingColumn()
    {
        var sheet = UisReport.Read(new[]
        {
            Row("내원일", "인원수", "신규환자", "인원수"),
            Row("합계", 97, 7, 97),
        });
        var facts = UisVisits.Read(sheet, Day);
        Assert.Null(facts.People);
        Assert.Equal(7, facts.New);
        Assert.Equal(new[] { "인원수" }, facts.Columns);
    }

    [Fact(DisplayName = "AC-4207.3 위쪽 표가 ok면 신환 = 신규환자 · 환자 합계 = 인원수, 없으면(null) 신환 = 아래쪽 신규 줄 수 · 환자 합계 = 환자 줄 수, 둘 다 없으면 null")]
    public void VisitsNewAndTotal()
    {
        var top = new VisitsFacts { People = 97, New = 7 };
        var bottom = Bottom(95, 6);
        Assert.Equal(7, UisVisits.New(top, bottom));
        Assert.Equal(97, UisVisits.Total(top, bottom));
        Assert.Equal(7, UisVisits.New(top, null));
        Assert.Equal(97, UisVisits.Total(top, null));
        Assert.Equal(6, UisVisits.New(null, bottom));
        Assert.Equal(95, UisVisits.Total(null, bottom));
        Assert.Null(UisVisits.New(null, null));
        Assert.Null(UisVisits.Total(null, null));
        // 위쪽 표가 ok인데 그 칸을 못 읽었으면 그 값은 못 읽음(null, 아래쪽 표로 바꾸지 않는다)
        Assert.Null(UisVisits.New(new VisitsFacts { People = 97, New = null }, bottom));
        Assert.Null(UisVisits.Total(new VisitsFacts { People = null, New = 7 }, bottom));
    }

    [Fact(DisplayName = "AC-4207.3 맞춰 보기: 아래쪽 환자 줄 ≠ 위쪽 인원수면 visitRows = [아래쪽, 위쪽], 신규 줄 ≠ 신규환자면 visitNew, 같거나 한쪽이 없으면 null(경고만)")]
    public void VisitsChecks()
    {
        var checks = new UisDayChecks();
        UisVisits.Checks(checks, new VisitsFacts { People = 97, New = 7 }, Bottom(95, 6), null, null);
        Assert.Equal(new long[] { 95, 97 }, checks.VisitRows);
        Assert.Equal(new long[] { 6, 7 }, checks.VisitNew);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, new VisitsFacts { People = 97, New = 7 }, Bottom(97, 7), null, null);
        Assert.Null(checks.VisitRows);
        Assert.Null(checks.VisitNew);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, new VisitsFacts { People = null, New = 7 }, Bottom(95, 6), null, null);
        Assert.Null(checks.VisitRows);
        Assert.Equal(new long[] { 6, 7 }, checks.VisitNew);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, Bottom(95, 6), null, null);
        Assert.Null(checks.VisitRows);
        Assert.Null(checks.VisitNew);
        UisVisits.Checks(checks, new VisitsFacts { People = 97, New = 7 }, null, null, null);
        Assert.Null(checks.VisitRows);
        Assert.Null(checks.VisitNew);
    }

    [Fact(DisplayName = "AC-4207.5 맞춰 보기: 아래쪽 내원 표에 조회일 라벨이 없으면 noDate = true, 있거나 아래쪽 표가 없으면 false")]
    public void VisitsNoDate()
    {
        var checks = new UisDayChecks();
        UisVisits.Checks(checks, null, Bottom(5, 1, hasDate: false), null, null);
        Assert.True(checks.NoDate);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, Bottom(5, 1, hasDate: true), null, null);
        Assert.False(checks.NoDate);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, null, null, null);
        Assert.False(checks.NoDate);

        Assert.True(UisPatients.ReadVisits(Fake("visit-patients.xls"), Day).HasDate);
        Assert.False(UisPatients.ReadVisits(Fake("visit-patients-no-date.xls"), Day).HasDate);
    }

    // ---- AC-4208.2 예약 위쪽 표 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-4208.2 가짜 rsv.xls: 합계 줄 예약건수 32 · 이행건수 25이고 아래쪽 표(rsv-patients.xls) 줄 32 · 방문 25와 같다")]
    public void FakeRsv()
    {
        var facts = UisVisits.ReadRsv(Fake("rsv.xls"), Day);
        Assert.Equal(32, facts.Total);
        Assert.Equal(25, facts.Visited);
        Assert.Empty(facts.Columns);

        var bottom = UisPatients.ReadRsv(Fake("rsv-patients.xls"), Day);
        Assert.Equal(facts.Total, bottom.Rows);
        Assert.Equal(facts.Visited, bottom.Visited);
    }

    [Fact(DisplayName = "AC-4208.2 예약일이 '합계'인 줄을 먼저, 없으면 예약일 = 마감 일자인 줄 하나, 둘 다 아니면 null + Columns '합계'")]
    public void RsvRows()
    {
        var sum = UisVisits.ReadRsv(RsvSheet(Row("2026-11-23", 10, 8, 1), Row("합계", 12, 9, 1)), Day);
        Assert.Equal(12, sum.Total);
        Assert.Equal(9, sum.Visited);

        var day = UisVisits.ReadRsv(RsvSheet(Row("2026-11-22", 10, 8, 1), Row("2026.11.23", 20, 15, 2)), Day);
        Assert.Equal(20, day.Total);
        Assert.Equal(15, day.Visited);
        Assert.Empty(day.Columns);

        foreach (var sheet in new[]
        {
            RsvSheet(Row("2026-11-22", 10, 8, 1)),
            RsvSheet(Row("합계", 10, 8, 1), Row("합계", 10, 8, 1)),
            RsvSheet(Row("2026-11-23", 10, 8, 1), Row("2026-11-23", 10, 8, 1)),
        })
        {
            var none = UisVisits.ReadRsv(sheet, Day);
            Assert.Null(none.Total);
            Assert.Null(none.Visited);
            Assert.Equal(new[] { UisReport.SumRow }, none.Columns);
        }
    }

    [Fact(DisplayName = "AC-4208.2 이행건수 칸이 없으면 이행건수만 null이고 Columns에 '이행건수'")]
    public void RsvMissingColumn()
    {
        var facts = UisVisits.ReadRsv(Top(new[] { "예약일", "예약건수" }, Row("합계", 32)), Day);
        Assert.Equal(32, facts.Total);
        Assert.Null(facts.Visited);
        Assert.Equal(new[] { "이행건수" }, facts.Columns);
    }

    [Fact(DisplayName = "AC-4208.2 맞춰 보기: 아래쪽 줄 ≠ 위쪽 예약건수면 rsvRows = [아래쪽, 위쪽], 방문 줄 ≠ 이행건수면 rsvVisited, 같거나 한쪽이 없으면 null(경고만)")]
    public void RsvChecks()
    {
        var checks = new UisDayChecks();
        UisVisits.Checks(checks, null, null, new RsvFacts { Total = 32, Visited = 25 }, RsvBottom(30, 24, 29));
        Assert.Equal(new long[] { 30, 32 }, checks.RsvRows);
        Assert.Equal(new long[] { 24, 25 }, checks.RsvVisited);
        Assert.Null(checks.VisitRows);
        Assert.False(checks.NoDate);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, null, new RsvFacts { Total = 32, Visited = 25 }, RsvBottom(32, 25, 31));
        Assert.Null(checks.RsvRows);
        Assert.Null(checks.RsvVisited);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, null, new RsvFacts { Total = 32, Visited = null }, RsvBottom(30, 24, 29));
        Assert.Equal(new long[] { 30, 32 }, checks.RsvRows);
        Assert.Null(checks.RsvVisited);

        checks = new UisDayChecks();
        UisVisits.Checks(checks, null, null, null, RsvBottom(30, 24, 29));
        Assert.Null(checks.RsvRows);
        Assert.Null(checks.RsvVisited);
    }

    [Fact(DisplayName = "AC-4208.2 uis.reservations: 위쪽 표가 ok면 { 예약건수, 이행건수 }, 아니면 아래쪽 표 { 줄 수, 방문 줄 수 }, 둘 다 없으면 null")]
    public void RsvReservations()
    {
        var top = new RsvFacts { Total = 32, Visited = 25 };
        var bottom = RsvBottom(30, 24, 29);

        var fromTop = UisVisits.Reservations(top, bottom);
        Assert.NotNull(fromTop);
        Assert.Equal(32, fromTop!.Total);
        Assert.Equal(25, fromTop.Visited);

        var fromBottom = UisVisits.Reservations(null, bottom);
        Assert.NotNull(fromBottom);
        Assert.Equal(30, fromBottom!.Total);
        Assert.Equal(24, fromBottom.Visited);

        Assert.Null(UisVisits.Reservations(null, null));

        // 위쪽 표 숫자를 못 읽었으면(참고 숫자라 빈 칸이 없는 모양) 아래쪽 표 숫자, 아래쪽 표도 없으면 null
        var unread = new RsvFacts { Total = 32, Visited = null };
        var fallback = UisVisits.Reservations(unread, bottom);
        Assert.NotNull(fallback);
        Assert.Equal(30, fallback!.Total);
        Assert.Equal(24, fallback.Visited);
        Assert.Null(UisVisits.Reservations(unread, null));
    }

    [Fact(DisplayName = "AC-4208.2 다른 종류 시트·null을 넘기면 예외")]
    public void WrongSheetThrows()
    {
        Assert.ThrowsAny<ArgumentException>(() => UisVisits.Read(Fake("rsv.xls"), Day));
        Assert.ThrowsAny<ArgumentException>(() => UisVisits.ReadRsv(Fake("visits.xls"), Day));
        Assert.ThrowsAny<ArgumentException>(() => UisVisits.Read(Fake("other-report.xls"), Day));
        Assert.Throws<ArgumentNullException>(() => UisVisits.Read(null!, Day));
        Assert.Throws<ArgumentNullException>(() => UisVisits.ReadRsv(null!, Day));
        Assert.Throws<ArgumentNullException>(() => UisVisits.Checks(null!, null, null, null, null));
    }
}
