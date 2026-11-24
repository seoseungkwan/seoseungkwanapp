using System;
using System.Linq;
using Erp.Core.Uisarang;
using Xunit;
using static Erp.Core.Tests.Uisarang.Sums.SumSheets;

namespace Erp.Core.Tests.Uisarang.Sums;

/// <summary>
/// spec erp-uisarang TASK-7 REQ-4205: 일일수입통계 '합계' 줄 숫자(UisIncome.Read)와 맞춰 보기 셋(UisIncome.Check, design.md 5-3·6-2).
/// 가짜 income*.xls(12-1)와 시험 안에서 만든 줄로 본다. 숫자는 지은 값이다.
/// </summary>
public class UisIncomeTests
{
    private static void AllNull(IncomeFacts facts)
    {
        Assert.Null(facts.TotalFee);
        Assert.Null(facts.Covered);
        Assert.Null(facts.Insurer);
        Assert.Null(facts.Received);
        Assert.Null(facts.Noncovered);
        Assert.Null(facts.First);
        Assert.Null(facts.Return);
        Assert.Null(facts.Headcount);
        Assert.Null(facts.Cash);
        Assert.Null(facts.Card);
    }

    // ---- AC-4205.1 '합계' 줄 하나만 ----------------------------------------------------------------

    [Fact(DisplayName = "AC-4205.1 가짜 income.xls: 보험구분 '합계' 줄 하나의 열 칸을 읽는다(쉼표 글자 진료수납액 포함, 못 찾은 칸 없음)")]
    public void ReadsFakeSumRow()
    {
        var facts = UisIncome.Read(Fake("income.xls"));
        Assert.Equal(5182300L, facts.TotalFee);
        Assert.Equal(3976300L, facts.Covered);
        Assert.Equal(3441200L, facts.Insurer);
        Assert.Equal(1741100L, facts.Received);
        Assert.Equal(1206000L, facts.Noncovered);
        Assert.Equal(9L, facts.First);
        Assert.Equal(88L, facts.Return);
        Assert.Equal(97L, facts.Headcount);
        Assert.Equal(352500L, facts.Cash);
        Assert.Equal(1388600L, facts.Card);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 보험구분 줄을 더하지 않는다: 보험구분 줄 합과 다른 '합계' 줄 값을 그대로 쓰고, 합계 줄이 가운데에 있어도 그 줄이다")]
    public void DoesNotAddInsuranceRows()
    {
        var facts = UisIncome.Read(Income(
            L("건강보험", 1000, 800, 600, 300, 200, 2, 8, 10, 100, 200),
            L("합계", 50, 40, 30, 20, 10, 1, 2, 3, 5, 15),
            L("일반", 7000, 0, 0, 7000, 7000, 3, 1, 4, 7000, 0)));
        Assert.Equal(50L, facts.TotalFee);
        Assert.Equal(40L, facts.Covered);
        Assert.Equal(30L, facts.Insurer);
        Assert.Equal(20L, facts.Received);
        Assert.Equal(10L, facts.Noncovered);
        Assert.Equal(1L, facts.First);
        Assert.Equal(2L, facts.Return);
        Assert.Equal(3L, facts.Headcount);
        Assert.Equal(5L, facts.Cash);
        Assert.Equal(15L, facts.Card);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 '합계' 줄은 보험구분 칸 글자에서 빈칸을 모두 뺀 글자로 본다('합 계'·앞뒤 빈칸)")]
    public void SumRowIgnoresSpaces()
    {
        Assert.Equal(7L, UisIncome.Read(Income(L(" 합 계 ", 7, 7, 7, 7, 0, 1, 1, 2, 3, 4))).TotalFee);
        Assert.Equal(7L, UisIncome.Read(Income(L("합　계", 7, 7, 7, 7, 0, 1, 1, 2, 3, 4))).TotalFee);
    }

    [Fact(DisplayName = "AC-4205.1 가짜 income-no-sum.xls처럼 '합계' 줄이 없으면 모든 값이 null이고 columns에 '합계'가 있다")]
    public void NoSumRowIsAllNull()
    {
        var facts = UisIncome.Read(Fake("income-no-sum.xls"));
        AllNull(facts);
        Assert.Equal(new[] { "합계" }, facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 '합계' 줄이 둘이면 모든 값이 null이고 columns에 '합계'가 있다")]
    public void TwoSumRowsAreAllNull()
    {
        var facts = UisIncome.Read(Income(
            L("합계", 10, 10, 10, 10, 0, 1, 1, 2, 5, 5),
            L("합계", 10, 10, 10, 10, 0, 1, 1, 2, 5, 5)));
        AllNull(facts);
        Assert.Equal(new[] { "합계" }, facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 찾는 칸이 없거나 둘이면 그 칸 값만 null이고 그 칸 이름이 columns에 든다(다른 칸은 읽음)")]
    public void MissingColumnOnlyNullsThatValue()
    {
        var header = IncomeHeader.Where(name => name != "카드수납액").Concat(new[] { "청구액" }).ToArray();
        var facts = UisIncome.Read(With(header, L("합계", 100, 70, 60, 50, 30, 1, 2, 3, 20, 999)));
        Assert.Null(facts.Card);
        Assert.Null(facts.Insurer);
        Assert.Equal(100L, facts.TotalFee);
        Assert.Equal(70L, facts.Covered);
        Assert.Equal(50L, facts.Received);
        Assert.Equal(20L, facts.Cash);
        Assert.Equal(new[] { "청구액", "카드수납액" }, facts.Columns.OrderBy(name => name, StringComparer.Ordinal).ToArray());
    }

    [Fact(DisplayName = "AC-4205.1 보험구분 칸이 둘이면 '합계' 줄을 찾을 수 없어 모든 값이 null이고 columns에 '보험구분'과 '합계'가 있다")]
    public void NoInsuranceColumnIsAllNull()
    {
        var header = IncomeHeader.Concat(new[] { "보험구분" }).ToArray();
        var facts = UisIncome.Read(With(header, L("합계", 100, 70, 60, 50, 30, 1, 2, 3, 20, 30, "합계")));
        AllNull(facts);
        Assert.Contains("보험구분", facts.Columns);
        Assert.Contains("합계", facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 숫자 칸 값: 쉼표 든 글자는 숫자로, 원 미만은 반올림 없이 버리고(음수도 0 쪽으로), 빈 칸·숫자 꼴 아닌 글자는 0이 아니라 null")]
    public void NumberCellsAreTruncated()
    {
        var facts = UisIncome.Read(Income(L("합계", 1234.9, "1,000.99", -10.7, null, "-", "12,345", 3.0, 0, "", 2.5)));
        Assert.Equal(1234L, facts.TotalFee);
        Assert.Equal(1000L, facts.Covered);
        Assert.Equal(-10L, facts.Insurer);
        Assert.Null(facts.Received);
        Assert.Null(facts.Noncovered);
        Assert.Equal(12345L, facts.First);
        Assert.Equal(3L, facts.Return);
        Assert.Equal(0L, facts.Headcount);
        Assert.Null(facts.Cash);
        Assert.Equal(2L, facts.Card);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4205.1 일일수입통계가 아닌 시트(처방통계·종류 모름)는 ArgumentException이고 글에 칸 값이 없다")]
    public void OtherKindThrows()
    {
        var rx = Assert.Throws<ArgumentException>(() => UisIncome.Read(Fake("rx.xls")));
        Assert.DoesNotContain("AA222", rx.Message);
        Assert.Throws<ArgumentException>(() => UisIncome.Read(Fake("other-report.xls")));
        Assert.Throws<ArgumentNullException>(() => UisIncome.Read(null!));
    }

    // ---- AC-4205.2 병합 총진료비 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-4205.2 가짜 income.xls: '합계' 줄 총진료비 칸이 비어 있고 바로 아래 줄 같은 칸의 숫자가 총진료비다(병합 칸)")]
    public void MergedTotalFeeFromRowBelow()
    {
        var sheet = Fake("income.xls");
        var sum = sheet.Rows.Single(row => UisReport.Squeeze(UisReport.Value(sheet, row, "보험구분").Text) == UisReport.SumRow);
        Assert.True(UisReport.Value(sheet, sum, "총진료비").IsEmpty);
        Assert.Equal(5182300L, UisIncome.Read(sheet).TotalFee);
    }

    [Fact(DisplayName = "AC-4205.2 '합계' 줄 총진료비 칸이 숫자면 그 값이다(아래 줄 숫자는 보지 않음)")]
    public void SumRowNumberWins()
    {
        var facts = UisIncome.Read(Income(L("합계", 300, 200, 150, 100, 100, 1, 1, 2, 50, 50), L(null, 999)));
        Assert.Equal(300L, facts.TotalFee);
    }

    [Fact(DisplayName = "AC-4205.2 '합계' 줄 총진료비가 비고 아래 줄 칸이 쉼표 든 숫자 글자면 그 값, 원 미만은 버림")]
    public void MergedTotalFeeTextBelow()
    {
        Assert.Equal(5182300L, UisIncome.Read(Income(L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0), L(null, "5,182,300"))).TotalFee);
        Assert.Equal(77L, UisIncome.Read(Income(L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0), L(null, 77.8))).TotalFee);
    }

    [Fact(DisplayName = "AC-4205.2 둘 다 숫자가 아니면 null: 아래 줄 칸이 빔·글자 · '합계' 줄이 마지막 줄 · '합계' 줄 칸이 숫자 꼴 아닌 글자(아래를 보지 않음)")]
    public void TotalFeeNullWhenNeitherIsNumber()
    {
        Assert.Null(UisIncome.Read(Income(L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0), L(null, null, 5))).TotalFee);
        Assert.Null(UisIncome.Read(Income(L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0), L(null, "-"))).TotalFee);
        Assert.Null(UisIncome.Read(Income(L("건강보험", 9, 9, 9, 9, 9, 9, 9, 9, 9, 9), L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0))).TotalFee);
        Assert.Null(UisIncome.Read(Income(L("합계", "-", 1, 1, 1, 1, 1, 1, 2, 1, 0), L(null, 500))).TotalFee);
        // 다른 값은 그대로 읽는다
        Assert.Equal(1L, UisIncome.Read(Income(L("합계", null, 1, 1, 1, 1, 1, 1, 2, 1, 0))).Covered);
    }

    // ---- AC-4205.3 맞춰 보기 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-4205.3 가짜 income.xls는 셋 다 맞아 checks totalFee·received·headcount가 null이다")]
    public void FakeIncomeChecksMatch()
    {
        var checks = new UisDayChecks();
        UisIncome.Check(UisIncome.Read(Fake("income.xls")), checks);
        Assert.Null(checks.TotalFee);
        Assert.Null(checks.Received);
        Assert.Null(checks.Headcount);
    }

    [Fact(DisplayName = "AC-4205.3 총진료비 ≠ 급여총액 + 비급여 · 진료수납액 ≠ 현금 + 카드 · 인원계 ≠ 초진수 + 재진수이면 [왼쪽, 오른쪽]을 담는다")]
    public void MismatchesArePairs()
    {
        var checks = new UisDayChecks();
        // 보험구분 총진료비 급여총액 청구액 진료수납액 비급여 초진수 재진수 인원계 현금 카드
        UisIncome.Check(UisIncome.Read(Income(L("합계", 100, 70, 60, 50, 20, 3, 5, 10, 20, 20))), checks);
        Assert.Equal(new[] { 100L, 90L }, checks.TotalFee);
        Assert.Equal(new[] { 50L, 40L }, checks.Received);
        Assert.Equal(new[] { 10L, 8L }, checks.Headcount);
    }

    [Fact(DisplayName = "AC-4205.3 세 값 가운데 하나라도 null이면 그 칸은 null(견주지 않음), 다른 칸은 견준다")]
    public void NullSideSkipsCheck()
    {
        var checks = new UisDayChecks();
        UisIncome.Check(UisIncome.Read(Income(L("합계", 100, 70, 60, 50, null, 3, "", 10, 20, 20))), checks);
        Assert.Null(checks.TotalFee);
        Assert.Null(checks.Headcount);
        Assert.Equal(new[] { 50L, 40L }, checks.Received);

        var none = new UisDayChecks();
        UisIncome.Check(UisIncome.Read(Fake("income-no-sum.xls")), none);
        Assert.Null(none.TotalFee);
        Assert.Null(none.Received);
        Assert.Null(none.Headcount);
    }

    [Fact(DisplayName = "AC-4205.3 맞춰 보기는 채우기를 막지 않는다: 값은 그대로이고 checks의 다른 칸(rxTotal·noDate 등)은 건드리지 않는다")]
    public void CheckTouchesOnlyIncomeFields()
    {
        var facts = UisIncome.Read(Income(L("합계", 100, 70, 60, 50, 20, 3, 5, 10, 20, 20)));
        var checks = new UisDayChecks { RxTotal = new[] { 1L, 2L }, VisitRows = new[] { 3L, 4L }, NoDate = true };
        UisIncome.Check(facts, checks);
        Assert.Equal(new[] { 1L, 2L }, checks.RxTotal);
        Assert.Equal(new[] { 3L, 4L }, checks.VisitRows);
        Assert.True(checks.NoDate);
        Assert.Equal(100L, facts.TotalFee);
        Assert.Equal(70L, facts.Covered);
        Assert.Equal(20L, facts.Noncovered);
    }
}
