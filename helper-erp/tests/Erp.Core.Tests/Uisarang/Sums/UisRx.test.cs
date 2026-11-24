using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Erp.Core.Uisarang;
using Xunit;
using static Erp.Core.Tests.Uisarang.Sums.SumSheets;

namespace Erp.Core.Tests.Uisarang.Sums;

/// <summary>
/// spec erp-uisarang TASK-7 REQ-4206: 기간별처방통계 코드별 합(UisRx.Read)·합계 줄 대조(UisRx.Check)·코드 목록(UisRx.List), design.md 3-3·5-3·6-2.
/// 묶음 합(건수·매출)·재진·산정안함은 TASK-13(UisDay)이 이 Facts로 센다 — 여기서는 Facts가 맞는지만 본다.
/// 가짜 rx*.xls(12-1)와 시험 안에서 만든 줄로 본다. 코드·숫자는 지은 값이다.
/// </summary>
public class UisRxTests
{
    private static RxCode Code(RxFacts facts, string code)
    {
        Assert.True(facts.Codes.ContainsKey(code), $"코드 {code}가 없다");
        return facts.Codes[code];
    }

    private static long CodeSum(RxFacts facts) => facts.Codes.Values.Sum(code => code.Amount);

    // ---- AC-4206.1 코드별 합 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-4206.1 가짜 rx.xls: 쪽마다 되풀이한 머리글·빈 줄·합계 줄은 코드 줄이 아니고, 코드 꼴 정리한 코드 열 개의 총투여량·총액 합이다")]
    public void ReadsFakeRx()
    {
        var facts = UisRx.Read(Fake("rx.xls"));
        Assert.Equal(
            new[] { "AA222", "CA100", "ES100", "ES200", "KK090", "LA357", "MM300", "PROLO C", "PT100", "SO100" },
            facts.Codes.Keys.OrderBy(code => code, StringComparer.Ordinal).ToArray());
        Assert.Equal(31d, Code(facts, "AA222").Qty);
        Assert.Equal(37200L, Code(facts, "AA222").Amount);
        Assert.Equal(4d, Code(facts, "CA100").Qty);
        Assert.Equal(220000L, Code(facts, "CA100").Amount);
        Assert.Equal(40d, Code(facts, "PT100").Qty);
        Assert.Equal(63200L, Code(facts, "PT100").Amount);
        Assert.Equal(2d, Code(facts, "ES200").Qty);
        Assert.Equal(80000L, Code(facts, "ES200").Amount);
        Assert.Empty(facts.Columns);
    }

    [Fact(DisplayName = "AC-4206.1 가짜 rx.xls: 같은 코드 여러 줄(쪽이 달라도, ' mm300 ' 앞뒤 빈칸·소문자)은 모두 더하고, 'PROLO  C' 가운데 빈칸은 하나로 줄인다")]
    public void SameCodeRowsAreAdded()
    {
        var facts = UisRx.Read(Fake("rx.xls"));
        Assert.Equal(10d, Code(facts, "MM300").Qty);
        Assert.Equal(600000L, Code(facts, "MM300").Amount);
        Assert.Equal(3d, Code(facts, "PROLO C").Qty);
        Assert.Equal(99999L, Code(facts, "PROLO C").Amount);
        Assert.False(facts.Codes.ContainsKey("mm300"));
        Assert.False(facts.Codes.ContainsKey("PROLO  C"));
    }

    [Fact(DisplayName = "AC-4206.1 코드는 앞뒤 빈칸을 떼고 가운데 이어진 빈칸(탭·전각 빈칸 포함)을 하나로 줄여 대문자로 견준다(UisRules.Code)")]
    public void CodesAreNormalized()
    {
        var facts = UisRx.Read(Rx(
            L(" ab  12 ", "가", 1, 100),
            L("AB 12", "가", 2, 200),
            L("Ab\t12", "가", 3, 300),
            L("ab　12", "가", 4, 400)));
        Assert.Equal(new[] { "AB 12" }, facts.Codes.Keys.ToArray());
        Assert.Equal(10d, Code(facts, "AB 12").Qty);
        Assert.Equal(1000L, Code(facts, "AB 12").Amount);
    }

    [Fact(DisplayName = "AC-4206.1 총액은 줄마다 원 미만을 버린 뒤 더한다(0.9 + 0.9 = 0, 100.5 + 200.7 = 300), 쉼표 든 글자는 숫자로")]
    public void AmountTruncatedPerRow()
    {
        var facts = UisRx.Read(Rx(
            L("T1", "가", 1, 0.9),
            L("T1", "가", 1, 0.9),
            L("T2", "가", 1, 100.5),
            L("T2", "가", 1, 200.7),
            L("T3", "가", "1,000", "12,345.9")));
        Assert.Equal(0L, Code(facts, "T1").Amount);
        Assert.Equal(300L, Code(facts, "T2").Amount);
        Assert.Equal(1000d, Code(facts, "T3").Qty);
        Assert.Equal(12345L, Code(facts, "T3").Amount);
    }

    [Fact(DisplayName = "AC-4206.1 합계 줄(코드 또는 처방명칭 칸이 '합계', 빈칸 뺀 글자)은 코드 줄이 아니고, 코드 칸이 빈 줄(이어진 이름 줄)은 건너뛴다")]
    public void SumAndBlankCodeRowsAreNotCodes()
    {
        var byName = UisRx.Read(Rx(L("A1", "가", 1, 100), L(null, "이어진 이름", 5, 500), L("   ", "빈칸 코드", 6, 600), L(null, "합 계", 1, 100)));
        Assert.Equal(new[] { "A1" }, byName.Codes.Keys.ToArray());
        Assert.Equal(100L, byName.TotalAmount);

        var byCode = UisRx.Read(Rx(L("A1", "가", 1, 100), L(" 합계 ", null, 1, 100)));
        Assert.Equal(new[] { "A1" }, byCode.Codes.Keys.ToArray());
        Assert.Equal(100L, byCode.TotalAmount);
    }

    [Fact(DisplayName = "AC-4206.1 숫자 칸으로 읽힌 코드는 그 숫자 글자가 코드다(12345 → '12345')")]
    public void NumberCodeCell()
    {
        var facts = UisRx.Read(Rx(L(12345, "숫자 코드", 2, 100), L("12345", "숫자 코드", 1, 50)));
        Assert.Equal(new[] { "12345" }, facts.Codes.Keys.ToArray());
        Assert.Equal(3d, Code(facts, "12345").Qty);
        Assert.Equal(150L, Code(facts, "12345").Amount);
    }

    [Fact(DisplayName = "AC-4206.1 코드 줄의 빈 칸·숫자 꼴 아닌 글자는 그 줄 몫을 더하지 않는다(0이 아니라 없음), 그날 없는 코드는 목록에 없다")]
    public void EmptyCellsAddNothing()
    {
        var facts = UisRx.Read(Rx(L("Q1", "가", null, "-"), L("Q1", "가", 2, 100), L("Q2", "나", "", null)));
        Assert.Equal(2d, Code(facts, "Q1").Qty);
        Assert.Equal(100L, Code(facts, "Q1").Amount);
        Assert.Equal(0d, Code(facts, "Q2").Qty);
        Assert.Equal(0L, Code(facts, "Q2").Amount);
        Assert.False(facts.Codes.ContainsKey("ZZ999"));
    }

    [Fact(DisplayName = "AC-4206.1 총투여량 칸이 없거나 둘이면 columns에 '총투여량'이 들고(건수는 TASK-13이 null로), 총액은 읽는다")]
    public void MissingQtyColumn()
    {
        var facts = UisRx.Read(With(new[] { "코드", "처방명칭", "총액" }, L("A1", "가", 100), L("합계", null, 100)));
        Assert.Equal(new[] { "총투여량" }, facts.Columns);
        Assert.Equal(100L, Code(facts, "A1").Amount);
        Assert.Equal(100L, facts.TotalAmount);
    }

    [Fact(DisplayName = "AC-4206.1 처방통계가 아닌 시트(일일수입통계·종류 모름)는 ArgumentException이고 글에 칸 값이 없다")]
    public void OtherKindThrows()
    {
        var income = Assert.Throws<ArgumentException>(() => UisRx.Read(Fake("income.xls")));
        Assert.DoesNotContain("건강보험", income.Message);
        Assert.Throws<ArgumentException>(() => UisRx.Read(Fake("other-report.xls")));
        Assert.Throws<ArgumentException>(() => UisRx.List(Fake("income.xls")));
        Assert.Throws<ArgumentNullException>(() => UisRx.Read(null!));
        Assert.Throws<ArgumentNullException>(() => UisRx.List(null!));
    }

    // ---- AC-4206.2 소수 총투여량 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-4206.2 가짜 rx.xls: 소수 총투여량(LA357 0.5)은 버리거나 반올림하지 않고 그대로 둔다(묶음 건수 null·fractional은 TASK-13)")]
    public void FractionalQtyKept()
    {
        var facts = UisRx.Read(Fake("rx.xls"));
        Assert.Equal(0.5d, Code(facts, "LA357").Qty);
        Assert.Equal(4900L, Code(facts, "LA357").Amount);
    }

    [Fact(DisplayName = "AC-4206.2 소수 총투여량은 줄끼리 더해도 소수 셈 오차가 없다(0.1 + 0.2 = 0.3, 0.25 + 0.75 = 1 정수)")]
    public void FractionalSumsAreExact()
    {
        var facts = UisRx.Read(Rx(L("F1", "가", 0.1, 1), L("F1", "가", 0.2, 1), L("F2", "가", 0.25, 1), L("F2", "가", 0.75, 1)));
        Assert.Equal(0.3d, Code(facts, "F1").Qty);
        Assert.Equal(1d, Code(facts, "F2").Qty);
        Assert.Equal(0d, Code(facts, "F2").Qty % 1);
    }

    // ---- AC-4206.4 합계 줄 대조 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-4206.4 가짜 rx.xls: 합계 줄 총액 = 코드 줄 총액 합(줄마다 버림)이라 checks.rxTotal이 null이다")]
    public void FakeRxTotalMatches()
    {
        var facts = UisRx.Read(Fake("rx.xls"));
        Assert.Equal(1607644L, facts.TotalAmount);
        Assert.Equal(1607644L, CodeSum(facts));
        var checks = new UisDayChecks();
        UisRx.Check(facts, checks);
        Assert.Null(checks.RxTotal);
    }

    [Fact(DisplayName = "AC-4206.4 합계 줄 총액(원 미만 버림)과 코드 줄 총액 합이 다르면 rxTotal에 [합계 줄, 코드 줄 합]을 담고 값은 그대로다")]
    public void RxTotalMismatch()
    {
        var facts = UisRx.Read(Rx(L("A1", "가", 1, 100), L("B1", "나", 1, 200.9), L("합계", null, 2, 350.7)));
        Assert.Equal(350L, facts.TotalAmount);
        var checks = new UisDayChecks { TotalFee = new[] { 1L, 2L }, NoDate = true };
        UisRx.Check(facts, checks);
        Assert.Equal(new[] { 350L, 300L }, checks.RxTotal);
        Assert.Equal(new[] { 1L, 2L }, checks.TotalFee);
        Assert.True(checks.NoDate);
        Assert.Equal(200L, Code(facts, "B1").Amount);
    }

    [Fact(DisplayName = "AC-4206.4 합계 줄이 없거나 둘이면 TotalAmount는 null이고 rxTotal도 null(견주지 않음)")]
    public void NoOrTwoSumRows()
    {
        var none = UisRx.Read(Rx(L("A1", "가", 1, 100)));
        Assert.Null(none.TotalAmount);
        var checks = new UisDayChecks { RxTotal = new[] { 9L, 9L } };
        UisRx.Check(none, checks);
        Assert.Null(checks.RxTotal);

        var two = UisRx.Read(Rx(L("A1", "가", 1, 100), L("합계", null, 1, 100), L(null, "합계", 1, 999)));
        Assert.Null(two.TotalAmount);
        Assert.Equal(100L, Code(two, "A1").Amount);
    }

    [Fact(DisplayName = "AC-4206.4 코드 칸을 못 찾으면(같은 이름 둘) 코드 줄 합을 알 수 없어 rxTotal은 null, columns에 '코드'")]
    public void NoCodeColumnSkipsCheck()
    {
        var facts = UisRx.Read(With(new[] { "코드", "처방명칭", "총투여량", "총액", "코드" }, L("A1", "가", 1, 100, "A1"), L(null, "합계", 1, 999, null)));
        Assert.Empty(facts.Codes);
        Assert.Equal(999L, facts.TotalAmount);
        Assert.Contains("코드", facts.Columns);
        var checks = new UisDayChecks();
        UisRx.Check(facts, checks);
        Assert.Null(checks.RxTotal);
    }

    // ---- AC-4206.5 코드 목록(UisRx.List 부분 — 상태·지우기는 TASK-13 UisCodes) ------------------------

    [Fact(DisplayName = "AC-4206.5 UisRx.List 가짜 rx-3months.xls: 코드마다 한 줄(꼴 정리로 합침), 처음 나온 처방명칭, 총투여량 합(소수 그대로)·총액 합, 총액 큰 차례")]
    public void ListsFakeThreeMonths()
    {
        var list = UisRx.List(Fake("rx-3months.xls"));
        Assert.Equal(
            new[] { "MM300", "ES100", "SO100", "CA100", "PROLO C", "ES200", "PT100", "AA222", "KK090", "LA357", "ZZ001", "MC100" },
            list.Select(row => row.Code).ToArray());
        var mm = list[0];
        Assert.Equal("도수치료 (가짜)", mm.Name);
        Assert.Equal(500d, mm.Qty);
        Assert.Equal(30000000L, mm.Amount);
        var la = list.Single(row => row.Code == "LA357");
        Assert.Equal(30.5d, la.Qty);
        Assert.Equal(298900L, la.Amount);
        Assert.Null(list.Single(row => row.Code == "ZZ001").Name);
        Assert.Equal(0L, list[list.Count - 1].Amount);
    }

    [Fact(DisplayName = "AC-4206.5 UisRx.List 총액이 같으면 코드 글자 차례, 처방명칭은 처음 나온 빈칸 아닌 이름(앞뒤 빈칸 뗌)")]
    public void ListTieOrderAndName()
    {
        var list = UisRx.List(Rx(
            L("B1", "", 1, 500),
            L("b1", " 이름 비 ", 1, 0),
            L("B1", "다른 이름", 1, 0),
            L("A1", "이름 가", 1, 500),
            L("C1", null, 1, 900)));
        Assert.Equal(new[] { "C1", "A1", "B1" }, list.Select(row => row.Code).ToArray());
        Assert.Equal("이름 비", list[2].Name);
        Assert.Equal(3d, list[2].Qty);
        Assert.Equal(500L, list[2].Amount);
        Assert.Null(list[0].Name);
    }

    [Fact(DisplayName = "AC-4206.5 UisRx.List 코드는 2,000개까지(총액 큰 것부터), 21자 넘는 코드도 목록에 든다")]
    public void ListLimitAndLongCodes()
    {
        var lines = Enumerable.Range(1, 2100)
            .Select(i => L("C" + i.ToString("0000", CultureInfo.InvariantCulture), "가", 1, i * 10))
            .Concat(new[] { L("ABCDEFGHIJKLMNOPQRSTU", "긴 코드", 1, 1_000_000), L("ABCDEFGHIJKLMNOPQRSTUVWXY", "더 긴 코드", 1, 999_999) })
            .ToArray();
        var list = UisRx.List(Rx(lines));
        Assert.Equal(2000, list.Count);
        Assert.Equal(UisRx.ListLimit, list.Count);
        Assert.Equal("ABCDEFGHIJKLMNOPQRSTU", list[0].Code);
        Assert.Equal("ABCDEFGHIJKLMNOPQRSTUVWXY", list[1].Code);
        Assert.Equal("C2100", list[2].Code);
        Assert.Equal("C0103", list[list.Count - 1].Code);
        Assert.DoesNotContain(list, row => row.Code == "C0102");
    }

    [Fact(DisplayName = "AC-4206.5 UisRx.List와 Read는 같은 코드 줄을 본다(코드·총투여량·총액이 같다), 합계 줄은 목록에 없다")]
    public void ListMatchesRead()
    {
        var sheet = Fake("rx.xls");
        var facts = UisRx.Read(sheet);
        var list = UisRx.List(sheet);
        Assert.Equal(facts.Codes.Count, list.Count);
        foreach (var row in list)
        {
            Assert.Equal(Code(facts, row.Code).Qty, row.Qty);
            Assert.Equal(Code(facts, row.Code).Amount, row.Amount);
        }
        Assert.DoesNotContain(list, row => row.Code == "합계");
        var expected = new List<long>(list.Select(row => row.Amount));
        Assert.Equal(expected.OrderByDescending(amount => amount).ToArray(), expected.ToArray());
    }
}
