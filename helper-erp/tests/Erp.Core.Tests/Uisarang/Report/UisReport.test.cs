using System;
using System.Collections.Generic;
using System.Linq;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Report;

/// <summary>
/// spec erp-uisarang TASK-3 REQ-4204: 보고서 알아보기·라벨(조회일·조건)·칸 찾기 UisReport(design.md 5-1~5-4).
/// 가짜 의사랑 엑셀(fixtures/fake-uisarang, 12-1)과 시험 안에서 만든 줄로 본다. 숫자는 지은 값이다.
/// </summary>
public class UisReportTests
{
    private static readonly DateTime Day = FakeUisFiles.Day;

    private static readonly string[] IncomeHeader =
    {
        "보험구분", "총진료비", "급여총액", "청구액", "진료수납액", "비급여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액",
    };

    private static XlsCell C(object? value) => value switch
    {
        null => XlsCell.Empty,
        string text => new XlsCell(text),
        int number => new XlsCell(number),
        double number => new XlsCell(number),
        _ => throw new ArgumentException("칸 값은 글자·숫자·null만"),
    };

    private static IReadOnlyList<XlsCell> Row(params object?[] cells) => cells.Select(C).ToArray();

    private static IReadOnlyList<XlsCell> Header(IEnumerable<string> names) => names.Select(name => new XlsCell(name)).ToArray();

    private static UisSheet Sheet(params IReadOnlyList<XlsCell>[] rows) => UisReport.Read(rows);

    private static UisSheet Fake(string name) => UisReport.Read(FakeUisFiles.Rows(name));

    /// <summary>라벨 줄 하나 + 일일수입통계 머리글 + 합계 줄.</summary>
    private static UisSheet IncomeWith(params IReadOnlyList<XlsCell>[] labelRows)
    {
        var rows = new List<IReadOnlyList<XlsCell>> { Row("일일수입통계") };
        rows.AddRange(labelRows);
        rows.Add(Header(IncomeHeader));
        rows.Add(Row("합계", 100, 80, 60, 40, 20, 1, 2, 3, 10, 30));
        return UisReport.Read(rows);
    }

    private static UisDateRange Must(UisDateRange? range)
    {
        Assert.True(range.HasValue, "조회일을 읽지 못했다");
        return range.GetValueOrDefault();
    }

    private static string[] ColumnList(UisSheet sheet) =>
        sheet.Columns.OrderBy(pair => pair.Value).Select(pair => $"{pair.Key}:{pair.Value}").ToArray();

    private static void Unknown(UisSheet sheet)
    {
        Assert.Null(sheet.Kind);
        Assert.Equal(-1, sheet.HeaderRow);
        Assert.Empty(sheet.Labels);
        Assert.Empty(sheet.Columns);
        Assert.Empty(sheet.MissingColumns);
        Assert.Empty(sheet.Rows);
    }

    // ---- AC-4204.1 알아보기 ------------------------------------------------------------------------

    [Theory(DisplayName = "AC-4204.1 가짜 엑셀을 파일 이름이 아니라 머리글 글자로 여섯 종류 가운데 하나로 알아보고 머리글 줄 번호를 안다")]
    [InlineData("income.xls", UisKind.Income, 3)]
    [InlineData("income-no-sum.xls", UisKind.Income, 3)]
    [InlineData("income-outpatient.xls", UisKind.Income, 3)]
    [InlineData("income-other-date.xls", UisKind.Income, 3)]
    [InlineData("rx.xls", UisKind.Rx, 2)]
    [InlineData("rx-3months.xls", UisKind.Rx, 2)]
    [InlineData("visits.xls", UisKind.Visits, 2)]
    [InlineData("visit-patients.xls", UisKind.VisitPatients, 2)]
    [InlineData("visit-patients-no-date.xls", UisKind.VisitPatients, 1)]
    [InlineData("rsv.xls", UisKind.Rsv, 2)]
    [InlineData("rsv-patients.xls", UisKind.RsvPatients, 2)]
    [InlineData("rsv-patients-other-day.xls", UisKind.RsvPatients, 2)]
    public void KnowsSixKinds(string name, UisKind kind, int headerRow)
    {
        var sheet = Fake(name);
        Assert.Equal(kind, sheet.Kind);
        Assert.Equal(headerRow, sheet.HeaderRow);
    }

    [Fact(DisplayName = "AC-4204.1 머리글 줄이 없는 시트(other-report.xls·빈 시트·제목만)는 종류 모름: 머리글 줄 -1, 라벨·칸·자료 줄 없음")]
    public void NoHeaderIsUnknown()
    {
        Unknown(Fake("other-report.xls"));
        Unknown(UisReport.Read(new IReadOnlyList<XlsCell>[0]));
        Unknown(Sheet(Row("일일수입통계"), Row("[조 회 일]", "2026-11-23"), Row()));
    }

    [Fact(DisplayName = "AC-4204.1 머리글 칸 글자는 빈칸을 모두 빼고 견준다(칸 안 빈칸·줄바꿈·앞뒤 빈칸·전각 빈칸)")]
    public void HeaderIgnoresSpaces()
    {
        var sheet = Sheet(
            Row(" 보험 구분 ", "총진료\n비", "급여총액", "청구액", "진료　수납액", "비 급 여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액"),
            Row("합계", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
        Assert.Equal(UisKind.Income, sheet.Kind);
        Assert.Equal(0, sheet.HeaderRow);
        Assert.Equal(0, sheet.Columns["보험구분"]);
        Assert.Equal(1, sheet.Columns["총진료비"]);
        Assert.Equal(4, sheet.Columns["진료수납액"]);
        Assert.Equal(5, sheet.Columns["비급여"]);
        Assert.Empty(sheet.MissingColumns);
    }

    [Fact(DisplayName = "AC-4204.1 머리글 이름은 칸 글자 전체가 같아야 맞는다(칸 글자 일부로만 들면 맞지 않음)")]
    public void HeaderNamesMatchWholeCell()
    {
        Unknown(Sheet(Row("보험구분명", "진료수납액"), Row("합계", 1)));
        Unknown(Sheet(Row("보험구분", "진료수납액합"), Row("합계", 1)));
    }

    [Fact(DisplayName = "AC-4204.1 두 종류의 있어야 하는 칸을 모두 품은 머리글 줄은 종류 모름")]
    public void TwoKindsIsUnknown()
    {
        Unknown(Sheet(Row("보험구분", "진료수납액", "코드", "처방명칭", "총액"), Row("합계", 1, "A", "B", 1)));
        Unknown(Sheet(Row("내원일", "인원수", "신규환자", "예약일", "예약건수"), Row("합계", 1, 1, "합계", 1)));
    }

    [Fact(DisplayName = "AC-4204.1 없어야 하는 칸이 있으면 그 종류가 아니다(차트번호가 든 내원 머리글 = 환자별 표, 예약일이 든 환자별 머리글은 방문여부가 없으면 종류 모름)")]
    public void ForbiddenColumnsRuleOutKind()
    {
        Assert.Equal(UisKind.VisitPatients, Sheet(Row("내원일", "인원수", "신규환자", "차트번호"), Row("9000001", 1, "신규", "9000001")).Kind);
        Unknown(Sheet(Row("예약일", "예약건수", "차트번호"), Row("2026-11-23", 1, "9000001")));
        Unknown(Sheet(Row("차트번호", "신규환자", "예약일"), Row("9000001", "신규", "2026-11-23")));
        Assert.Equal(UisKind.Rsv, Sheet(Row("예약일", "예약건수", "이행건수"), Row("합계", 3, 2)).Kind);
        Assert.Equal(UisKind.RsvPatients, Sheet(Row("예약일", "차트번호", "방문여부"), Row("2026-11-23", "9000001", "방문")).Kind);
        Assert.Equal(UisKind.Visits, Sheet(Row("내원일", "인원수", "신규환자"), Row("합계", 3, 1)).Kind);
    }

    [Fact(DisplayName = "AC-4204.1 머리글은 위에서 30줄 안에서만 찾는다(30번째 줄 = 알아봄, 31번째 줄 = 종류 모름)")]
    public void HeaderWithinThirtyRows()
    {
        IReadOnlyList<XlsCell>[] Filler(int count) => Enumerable.Range(0, count).Select(i => Row($"머리 줄 {i}")).ToArray();

        var at30 = Filler(29).Append(Header(IncomeHeader)).Append(Row("합계", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)).ToArray();
        var sheet = UisReport.Read(at30);
        Assert.Equal(UisKind.Income, sheet.Kind);
        Assert.Equal(29, sheet.HeaderRow);
        Assert.Single(sheet.Rows);

        var at31 = Filler(30).Append(Header(IncomeHeader)).Append(Row("합계", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)).ToArray();
        Unknown(UisReport.Read(at31));
    }

    [Fact(DisplayName = "AC-4204.1 맞는 첫 줄이 머리글 줄이고, 그 아래의 다른 종류 머리글 꼴 줄은 자료 줄이다")]
    public void FirstMatchingRowIsHeader()
    {
        var sheet = Sheet(Row("제목"), Header(IncomeHeader), Row("코드", "처방명칭", "총액"), Row("합계", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
        Assert.Equal(UisKind.Income, sheet.Kind);
        Assert.Equal(1, sheet.HeaderRow);
        Assert.Equal(2, sheet.Rows.Count);
    }

    [Theory(DisplayName = "AC-4204.1 5-4 열린 파일 이름 짐작 GuessByName 일곱 갈래(빈칸 뺀 이름에 든 낱말, 모르면 null)")]
    [InlineData("통계-일일수입통계.xls", UisKind.Income)]
    [InlineData("일일 수입 통계.XLS", UisKind.Income)]
    [InlineData("통계-기간별처방통계.xls", UisKind.Rx)]
    [InlineData("통계-내원일별환자현황(환자별).xls", UisKind.VisitPatients)]
    [InlineData("내원일별 아래.xls", UisKind.VisitPatients)]
    [InlineData("통계-내원일별환자현황.xls", UisKind.Visits)]
    [InlineData("통계-예약환자통계 (환자 별).xls", UisKind.RsvPatients)]
    [InlineData("예약 아래쪽.xls", UisKind.RsvPatients)]
    [InlineData("통계-예약환자통계.xls", UisKind.Rsv)]
    [InlineData("월별매출.xls", null)]
    [InlineData("통계-환자별.xls", null)]
    [InlineData("", null)]
    public void GuessesByFileName(string fileName, UisKind? kind)
    {
        Assert.Equal(kind, UisReport.GuessByName(fileName));
    }

    // ---- AC-4204.2 라벨: 조회일·조건 ---------------------------------------------------------------

    [Fact(DisplayName = "AC-4204.2 라벨 '[조 회 일]' 칸 뒤가 비면 같은 줄 오른쪽 첫 글자 칸이 값(income.xls), 이름은 괄호 안 빈칸을 뺀 글자")]
    public void LabelValueInNextCell()
    {
        var sheet = Fake("income.xls");
        Assert.Equal(new[] { "조회일", "외/입구분" }, sheet.Labels.Keys.ToArray());
        Assert.Equal("2026-11-23 ~ 2026-11-23", sheet.Labels["조회일"]);
        Assert.Equal("전체", sheet.Labels["외/입구분"]);
        var range = Must(UisReport.Range(sheet));
        Assert.Equal(Day, range.From);
        Assert.Equal(Day, range.To);
        Assert.Equal("2026-11-23", range.FromText);
        Assert.Equal("2026-11-23", range.ToText);
        Assert.True(UisReport.HasDateLabel(sheet));
        Assert.Null(UisReport.Condition(sheet));
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 라벨 값이 같은 칸 ']' 뒤 글자(rx.xls '[조 회 일] … ~ …' 한 칸·'[구 분] 전체')")]
    public void LabelValueInSameCell()
    {
        var sheet = Fake("rx.xls");
        Assert.Equal("2026-11-23 ~ 2026-11-23", sheet.Labels["조회일"]);
        Assert.Equal("전체", sheet.Labels["구분"]);
        Assert.Equal(Day, Must(UisReport.Range(sheet)).From);
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 조회일 물결 범위는 from·to, 석 달 처방통계(rx-3months.xls)는 마감 일자 하루가 아니라 otherDate")]
    public void RangeOfThreeMonths()
    {
        var sheet = Fake("rx-3months.xls");
        var range = Must(UisReport.Range(sheet));
        Assert.Equal(new DateTime(2026, 8, 24), range.From);
        Assert.Equal(Day, range.To);
        Assert.Equal("2026-08-24", range.FromText);
        Assert.Equal("2026-11-23", range.ToText);
        Assert.Equal(UisState.OtherDate, UisReport.State(sheet, Day));
    }

    [Theory(DisplayName = "AC-4204.2 조회일 구분 '-'·'.'·'/', 물결 앞뒤 빈칸 상관없음, 날짜 하나면 from = to")]
    [InlineData("2026-11-23 ~ 2026-11-23")]
    [InlineData("2026.11.23~2026.11.23")]
    [InlineData("2026/11/23 ~2026/11/23")]
    [InlineData("  2026-11-23   ~   2026-11-23  ")]
    [InlineData("2026-11-23")]
    [InlineData("2026.11.23")]
    public void RangeSeparators(string value)
    {
        foreach (var sheet in new[] { IncomeWith(Row("[조 회 일] " + value)), IncomeWith(Row("[조 회 일]", null, value)) })
        {
            var range = Must(UisReport.Range(sheet));
            Assert.Equal(Day, range.From);
            Assert.Equal(Day, range.To);
            Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
        }
    }

    [Theory(DisplayName = "AC-4204.2 조회일 값이 날짜가 아니면(달력에 없음·글자 섞임·빈 값) from·to = null이고 합계 엑셀은 otherDate")]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30 ~ 2026-02-30")]
    [InlineData("2026-11-23 ~ ")]
    [InlineData("2026-11-23 ~ 2026-11-23 ~ 2026-11-23")]
    [InlineData("2026-11-23 오전")]
    [InlineData("어제")]
    [InlineData("20261123")]
    [InlineData("")]
    public void RangeNotDate(string value)
    {
        var sheet = IncomeWith(Row("[조 회 일] " + value));
        Assert.True(UisReport.HasDateLabel(sheet));
        Assert.Null(UisReport.Range(sheet));
        Assert.Equal(UisState.OtherDate, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 합계 엑셀은 조회일이 다른 날(income-other-date.xls)이거나 조회일 라벨이 없으면 otherDate")]
    public void SumOtherDateOrNoDate()
    {
        var other = Fake("income-other-date.xls");
        Assert.Equal("2026-11-22", Must(UisReport.Range(other)).FromText);
        Assert.Equal(UisState.OtherDate, UisReport.State(other, Day));
        Assert.Equal(UisState.Ok, UisReport.State(other, new DateTime(2026, 11, 22)));

        var noLabel = IncomeWith();
        Assert.Empty(noLabel.Labels);
        Assert.False(UisReport.HasDateLabel(noLabel));
        Assert.Null(UisReport.Range(noLabel));
        Assert.Equal(UisState.OtherDate, UisReport.State(noLabel, Day));

        foreach (var name in new[] { "visits.xls", "rsv.xls" })
        {
            Assert.Equal(UisState.Ok, UisReport.State(Fake(name), Day));
            Assert.Equal(UisState.OtherDate, UisReport.State(Fake(name), Day.AddDays(1)));
        }
    }

    [Fact(DisplayName = "AC-4204.2 조회일이 아닌 라벨 값이 날짜 꼴도 '전체'도 아니면 notAll이고 그 값(income-outpatient.xls '외래')")]
    public void ConditionNotAll()
    {
        var sheet = Fake("income-outpatient.xls");
        var condition = UisReport.Condition(sheet);
        Assert.NotNull(condition);
        Assert.Equal("외/입구분", condition.Label);
        Assert.Equal("외래", condition.Value);
        Assert.Equal(UisState.NotAll, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 날짜 꼴 라벨(날짜 하나·범위)·'전체'(빈칸 든 '전 체')·값 없는 라벨은 조건이 아니다")]
    public void ConditionIgnoresDatesAllAndBlank()
    {
        var sheet = IncomeWith(
            Row("[조 회 일]", "2026-11-23 ~ 2026-11-23", null, "[출 력 일] 2026.11.24"),
            Row("[기간] 2026-11-01 ~ 2026-11-23", null, "[진료실]", " 전 체 ", "[담당의]"));
        Assert.Equal("2026.11.24", sheet.Labels["출력일"]);
        Assert.Equal("", sheet.Labels["담당의"]);
        Assert.Null(UisReport.Condition(sheet));
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 조건 라벨이 여럿이면 첫 것(줄 차례·칸 차례), 숫자 칸 값도 글자로 읽는다")]
    public void FirstConditionWins()
    {
        var sheet = IncomeWith(Row("[조 회 일] 2026-11-23", "[외/입 구분]", "외래", "[진료실]", 2));
        var condition = UisReport.Condition(sheet);
        Assert.NotNull(condition);
        Assert.Equal("외래", condition.Value);
        Assert.Equal("2", sheet.Labels["진료실"]);

        var numberFirst = IncomeWith(Row("[조 회 일] 2026-11-23", "[진료실]", 2), Row("[외/입 구분] 외래"));
        var first = UisReport.Condition(numberFirst);
        Assert.NotNull(first);
        Assert.Equal("진료실", first.Label);
        Assert.Equal("2", first.Value);
    }

    [Fact(DisplayName = "AC-4204.2 라벨 값 칸을 찾다 다음 라벨을 만나면 그 라벨의 값은 빈 글자이고, 다음 라벨은 따로 읽는다")]
    public void NextLabelStopsValueSearch()
    {
        var sheet = IncomeWith(Row("[조 회 일]", null, "[외/입 구분]", "외래"));
        Assert.Equal("", sheet.Labels["조회일"]);
        Assert.Equal("외래", sheet.Labels["외/입구분"]);
        Assert.Null(UisReport.Range(sheet));
    }

    [Fact(DisplayName = "AC-4204.2 조건과 날짜가 둘 다 틀리면 notAll(어느 날에도 쓸 수 없는 엑셀이라 지우는 쪽)")]
    public void NotAllBeforeOtherDate()
    {
        var sheet = IncomeWith(Row("[조 회 일] 2026-11-22", "[외/입 구분] 외래"));
        Assert.Equal(UisState.NotAll, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 라벨은 머리글 줄 위에서만 읽고, 이름이 같은 라벨은 첫 것만, '['로 시작하지 않거나 ']'가 없는 칸은 라벨이 아니다")]
    public void LabelsOnlyAboveHeader()
    {
        var rows = new[]
        {
            Row("제목 [조 회 일] 2026-11-01", "[외/입 구분 전체", "[조 회 일] 2026-11-23", "[조 회 일] 2026-11-22"),
            Header(IncomeHeader),
            Row("[메모] 외래", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
        };
        var sheet = UisReport.Read(rows);
        Assert.Equal(new[] { "조회일" }, sheet.Labels.Keys.ToArray());
        Assert.Equal("2026-11-23", sheet.Labels["조회일"]);
        Assert.Null(UisReport.Condition(sheet));
        Assert.Equal(UisState.Ok, UisReport.State(sheet, Day));
    }

    [Fact(DisplayName = "AC-4204.2 라벨이 없으면 조건은 보지 않고, 환자별 내원 표는 조회일 라벨이 없으면 날짜도 보지 않는다(visit-patients-no-date.xls = noDate)")]
    public void VisitPatientsWithoutDate()
    {
        var noDate = Fake("visit-patients-no-date.xls");
        Assert.Empty(noDate.Labels);
        Assert.False(UisReport.HasDateLabel(noDate));
        Assert.Null(UisReport.Condition(noDate));
        Assert.Equal(UisState.Ok, UisReport.State(noDate, Day));
        Assert.False(UisReport.IsOnDay(noDate, Day));

        var withDate = Fake("visit-patients.xls");
        Assert.True(UisReport.HasDateLabel(withDate));
        Assert.Equal(UisState.Ok, UisReport.State(withDate, Day));
        Assert.Equal(UisState.OtherDate, UisReport.State(withDate, Day.AddDays(-1)));
    }

    [Fact(DisplayName = "AC-4204.2 예약 환자별 표는 날짜를 조회일 라벨이 아니라 예약일 칸으로 본다(State는 라벨 날짜를 보지 않음), 조건은 본다")]
    public void RsvPatientsDateByColumn()
    {
        Assert.Equal(UisState.Ok, UisReport.State(Fake("rsv-patients.xls"), Day.AddDays(5)));
        var notAll = Sheet(Row("[조 회 일] 2026-11-22", "[구 분] 취소"), Row("예약일", "차트번호", "방문여부"), Row("2026-11-23", "9000001", "방문"));
        Assert.Equal(UisState.NotAll, UisReport.State(notAll, Day));
    }

    [Fact(DisplayName = "AC-4204.2 종류 모름 시트의 상태는 묻지 않는다(ArgumentException, 글에 칸 값 없음)")]
    public void StateOfUnknownThrows()
    {
        var error = Assert.Throws<ArgumentException>(() => UisReport.State(Fake("other-report.xls"), Day));
        Assert.DoesNotContain("월별매출", error.Message);
    }

    [Theory(DisplayName = "AC-4204.2 날짜 하나 TryDate: 'YYYY-MM-DD'(구분 '-'·'.'·'/'), 달력에 있는 날만")]
    [InlineData("2026-11-23", true)]
    [InlineData("2026.11.23", true)]
    [InlineData("2026/11/23", true)]
    [InlineData(" 2026-11-23 ", true)]
    [InlineData("2024-02-29", true)]
    [InlineData("2026-02-29", false)]
    [InlineData("2026-00-10", false)]
    [InlineData("0000-01-01", false)]
    [InlineData("26-11-23", false)]
    [InlineData("2026-11-23 14:30", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void TryDateForms(string? text, bool ok)
    {
        Assert.Equal(ok, UisReport.TryDate(text, out var day));
        if (ok) Assert.Equal(day.Date, day);
    }

    // ---- AC-4204.3 칸 찾기·자료 줄 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-4204.3 보고서마다 5-3 칸만 머리글 이름으로 찾는다(가짜 엑셀 여섯 종류, 환자별 표의 이름·전화·주소 칸은 찾지 않음)")]
    public void FindsColumnsPerKind()
    {
        Assert.Equal(
            new[] { "보험구분:0", "총진료비:1", "급여총액:2", "청구액:3", "진료수납액:5", "비급여:6", "초진수:7", "재진수:8", "인원계:9", "현금수납액:10", "카드수납액:11" },
            ColumnList(Fake("income.xls")));
        Assert.Equal(new[] { "코드:0", "처방명칭:1", "총투여량:3", "총액:5" }, ColumnList(Fake("rx.xls")));
        Assert.Equal(new[] { "내원일:0", "인원수:1", "신규환자:2" }, ColumnList(Fake("visits.xls")));
        Assert.Equal(new[] { "차트번호:0", "주민등록번호:2", "신규환자:3" }, ColumnList(Fake("visit-patients.xls")));
        Assert.Equal(new[] { "예약일:0", "예약건수:1", "이행건수:2" }, ColumnList(Fake("rsv.xls")));
        Assert.Equal(new[] { "예약일:0", "차트번호:2", "방문여부:6" }, ColumnList(Fake("rsv-patients.xls")));
        foreach (var name in new[] { "income.xls", "rx.xls", "visits.xls", "visit-patients.xls", "rsv.xls", "rsv-patients.xls" })
        {
            Assert.Empty(Fake(name).MissingColumns);
        }
    }

    [Fact(DisplayName = "AC-4204.3 칸 차례가 달라도 이름으로 찾는다(차례 아님)")]
    public void ColumnsByNameNotOrder()
    {
        var shuffled = IncomeHeader.Reverse().ToArray();
        var sheet = Sheet(Header(shuffled), Row(10, 9, 8, 7, 6, 5, 4, 3, 2, 1, "합계"));
        Assert.Equal(UisKind.Income, sheet.Kind);
        Assert.Equal(10, sheet.Columns["보험구분"]);
        Assert.Equal(0, sheet.Columns["카드수납액"]);
        Assert.Equal("합계", UisReport.Value(sheet, sheet.Rows[0], "보험구분").Text);
        Assert.Equal(1, UisReport.Number(UisReport.Value(sheet, sheet.Rows[0], "총진료비")));
    }

    [Fact(DisplayName = "AC-4204.3 칸이 없거나 같은 이름이 둘이면 그 칸 이름만 MissingColumns(5-3 차례)이고 그 칸 값만 없음, 나머지 칸은 찾는다(파일 전체를 멈추지 않음)")]
    public void MissingOrDuplicateColumns()
    {
        var header = IncomeHeader.Where(name => name != "카드수납액").Append("현금수납액").ToArray();
        var sheet = Sheet(Header(header), Row("합계", 100, 80, 60, "1,000", 20, 1, 2, 3, 400, 600));
        Assert.Equal(UisKind.Income, sheet.Kind);
        Assert.Equal(new[] { "현금수납액", "카드수납액" }, sheet.MissingColumns.ToArray());
        Assert.Equal(9, sheet.Columns.Count);
        Assert.False(sheet.Columns.ContainsKey("현금수납액"));
        Assert.False(sheet.Columns.ContainsKey("카드수납액"));

        var row = sheet.Rows[0];
        Assert.True(UisReport.Value(sheet, row, "현금수납액").IsEmpty);
        Assert.Null(UisReport.Number(UisReport.Value(sheet, row, "현금수납액")));
        Assert.True(UisReport.Value(sheet, row, "카드수납액").IsEmpty);
        Assert.Equal(1000, UisReport.Number(UisReport.Value(sheet, row, "진료수납액")));
        Assert.Equal(3, UisReport.Number(UisReport.Value(sheet, row, "인원계")));
        // 짧은 줄·찾지 않는 칸 이름도 빈 칸
        Assert.True(UisReport.Value(sheet, Row("합계"), "인원계").IsEmpty);
        Assert.True(UisReport.Value(sheet, row, "본인부담금").IsEmpty);

        // 알아보는 칸(보험구분)이 둘이어도 종류는 알아보고 그 칸만 못 찾음
        var twice = Sheet(Header(IncomeHeader.Append("보험구분")), Row("합계"));
        Assert.Equal(UisKind.Income, twice.Kind);
        Assert.Equal(new[] { "보험구분" }, twice.MissingColumns.ToArray());
    }

    [Fact(DisplayName = "AC-4204.3 쪽 나눔으로 되풀이한 머리글 줄과 빈 줄은 건너뛴다(visit-patients.xls 20줄마다 = 환자 97줄 + 끝 줄, rx.xls 쪽마다)")]
    public void SkipsRepeatedHeadersAndBlankRows()
    {
        var visits = Fake("visit-patients.xls");
        Assert.Equal(98, visits.Rows.Count);
        Assert.Equal("9000001", UisReport.Value(visits, visits.Rows[0], "차트번호").Text);
        Assert.Equal("9000021", UisReport.Value(visits, visits.Rows[20], "차트번호").Text);
        Assert.Equal("9000097", UisReport.Value(visits, visits.Rows[96], "차트번호").Text);
        Assert.Equal("합계", UisReport.Value(visits, visits.Rows[97], "차트번호").Text);
        Assert.DoesNotContain(visits.Rows, row => UisReport.Value(visits, row, "차트번호").Text == "차트번호");

        var rx = Fake("rx.xls");
        Assert.Equal(
            new[] { "AA222", "CA100", "SO100", "MM300", "ES100", "PT100", " mm300 ", "PROLO  C", "LA357", "KK090", "ES200", "합계" },
            rx.Rows.Select(row => UisReport.Value(rx, row, "코드").Text).ToArray());

        // 합계 줄 아래 병합 칸 줄(첫 칸이 빔)은 자료 줄이다
        var income = Fake("income.xls");
        Assert.Equal(6, income.Rows.Count);
        Assert.True(income.Rows[5][0].IsEmpty);
        Assert.Equal(5182300, UisReport.Number(UisReport.Value(income, income.Rows[5], "총진료비")));
    }

    [Fact(DisplayName = "AC-4204.3 되풀이 머리글은 칸 안 빈칸이 달라도 같은 줄로 보고, 빈칸 글자만 든 줄도 빈 줄이다")]
    public void RepeatedHeaderWithSpaces()
    {
        var spaced = IncomeHeader.Select(name => name == "보험구분" ? "보험 구분" : name);
        var sheet = Sheet(
            Header(IncomeHeader),
            Row("건강보험", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
            Row(" ", null, "\t"),
            Header(spaced),
            Row("합계", 2, 2, 2, 2, 2, 2, 2, 2, 2, 2));
        Assert.Equal(new[] { "건강보험", "합계" }, sheet.Rows.Select(row => row[0].Text).ToArray());
    }

    [Theory(DisplayName = "AC-4204.3 숫자 칸 값: 숫자 칸은 그 값, 글자 칸은 쉼표·빈칸을 떼고 숫자 꼴이면 그 값, 빈 칸·숫자 꼴 아닌 글자는 없음(0이 아님)")]
    [InlineData("1,741,100", 1741100.0)]
    [InlineData(" 1 234 ", 1234.0)]
    [InlineData("0.5", 0.5)]
    [InlineData("-3", -3.0)]
    [InlineData("+12", 12.0)]
    [InlineData("97명", null)]
    [InlineData("합계", null)]
    [InlineData("1,2a", null)]
    [InlineData("1.2.3", null)]
    [InlineData("-", null)]
    [InlineData(" ", null)]
    public void NumberOfTextCell(string text, double? expected)
    {
        Assert.Equal(expected, UisReport.Number(new XlsCell(text)));
    }

    [Fact(DisplayName = "AC-4204.3 숫자 칸 값: 숫자 칸(소수 포함)은 그대로, 빈 칸은 없음(null), income.xls 합계 줄 '1,741,100' 글자 칸은 1741100")]
    public void NumberOfNumberAndEmptyCell()
    {
        Assert.Equal(99999.9, UisReport.Number(new XlsCell(99999.9)));
        Assert.Equal(0, UisReport.Number(new XlsCell(0)));
        Assert.Null(UisReport.Number(XlsCell.Empty));
        var income = Fake("income.xls");
        var sum = income.Rows.Single(row => UisReport.Squeeze(UisReport.Value(income, row, "보험구분").Text) == "합계");
        Assert.Equal(1741100, UisReport.Number(UisReport.Value(income, sum, "진료수납액")));
        Assert.Null(UisReport.Number(UisReport.Value(income, sum, "총진료비")));
    }

    [Fact(DisplayName = "AC-4204.3 Squeeze: 빈칸(전각·탭·줄바꿈 포함)을 모두 뺀 글자, null은 빈 글자")]
    public void SqueezeRemovesAllSpaces()
    {
        Assert.Equal("조회일", UisReport.Squeeze(" 조 회\t일\n"));
        Assert.Equal("외/입구분", UisReport.Squeeze("외/입　구분"));
        Assert.Equal("", UisReport.Squeeze(null));
    }

    // ---- AC-4204.4 같은 종류 여럿 가운데 고르기(시트 하나로 정할 수 있는 부분) ------------------------------

    [Fact(DisplayName = "AC-4204.4 IsOnDay: 조회일 from = to = 마감 일자인 시트만 그날 하루 것(다른 날·석 달·조회일 없음은 아님, 조건은 보지 않음)")]
    public void IsOnDayPicksOneDay()
    {
        Assert.True(UisReport.IsOnDay(Fake("income.xls"), Day));
        Assert.True(UisReport.IsOnDay(Fake("income-outpatient.xls"), Day));
        Assert.True(UisReport.IsOnDay(Fake("rx.xls"), Day));
        Assert.False(UisReport.IsOnDay(Fake("income-other-date.xls"), Day));
        Assert.False(UisReport.IsOnDay(Fake("rx-3months.xls"), Day));
        Assert.False(UisReport.IsOnDay(Fake("income.xls"), Day.AddDays(1)));
        Assert.False(UisReport.IsOnDay(IncomeWith(), Day));
        Assert.False(UisReport.IsOnDay(IncomeWith(Row("[조 회 일] 어제")), Day));
    }

    [Fact(DisplayName = "AC-4204.4 IsOnDay는 마감 일자의 시각을 보지 않는다")]
    public void IsOnDayIgnoresTime()
    {
        Assert.True(UisReport.IsOnDay(Fake("income.xls"), Day.AddHours(15).AddMinutes(30)));
        Assert.Equal(UisState.Ok, UisReport.State(Fake("income.xls"), Day.AddHours(23)));
    }
}
