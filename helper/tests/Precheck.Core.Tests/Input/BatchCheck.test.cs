using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>AC-017.1 묶음 검사. 규칙은 원본 medicore/secure_bridge.py validate_request(85줄) + 500명·같은 진료 두 번 없음.</summary>
public class BatchCheckTests
{
    private static void Rejected(params InputItem[] items) =>
        Assert.Equal(ErrorCodes.BadMessage, Assert.ThrowsAny<HelperException>(() => BatchCheck.Validate(items)).Code);

    [Fact(DisplayName = "AC-017.1 바른 묶음은 통과한다(줄바꿈·탭이 든 메모, 32,000자 메모, 100자 이름, 20자리 차트번호, 500명)")]
    public void Passes()
    {
        BatchCheck.Validate(new[] { Sample.Item(1) });
        BatchCheck.Validate(new[] { Sample.Item(1, memo: "첫 줄\r\n둘째\t줄\n") });
        BatchCheck.Validate(new[] { Sample.Item(1, memo: new string('가', 32000)) });
        BatchCheck.Validate(new[] { Sample.Item(1, name: new string('가', 100)) });
        BatchCheck.Validate(new[] { Sample.Item(1, chart: new string('9', 20)) });
        BatchCheck.Validate(Sample.Items(500));
    }

    [Fact(DisplayName = "AC-017.1 빈 묶음·501명이면 E-HELPER-BAD-MESSAGE")]
    public void Size()
    {
        Rejected();
        Rejected(Sample.Items(501).ToArray());
    }

    [Theory(DisplayName = "AC-017.1 차트번호가 숫자 1~20자리가 아니면 E-HELPER-BAD-MESSAGE(원본 [0-9]{1,20})")]
    [InlineData("")]
    [InlineData("90000A")]
    [InlineData("-900001")]
    [InlineData("900001\n")]
    [InlineData("٩٠٠٠٠١")]
    [InlineData("123456789012345678901")]
    public void Chart(string chart) => Rejected(Sample.Item(1, chart: chart));

    [Theory(DisplayName = "AC-017.1 이름이 비었거나 공백뿐이거나 제어 문자가 있거나 100자를 넘으면 E-HELPER-BAD-MESSAGE")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("가상\t환자")]
    [InlineData("가상\n환자")]
    [InlineData("가상\u0085환자")]
    [InlineData("가상\u007F환자")]
    public void Name(string name) => Rejected(Sample.Item(1, name: name));

    [Fact(DisplayName = "AC-017.1 이름 101자면 E-HELPER-BAD-MESSAGE")]
    public void NameTooLong() => Rejected(Sample.Item(1, name: new string('가', 101)));

    [Theory(DisplayName = "AC-017.1 날짜가 YYYY-MM-DD 진짜 날짜가 아니면 E-HELPER-BAD-MESSAGE")]
    [InlineData("")]
    [InlineData("2026-02-30")]
    [InlineData("2026-13-01")]
    [InlineData("20261027")]
    [InlineData("2026/10/27")]
    [InlineData("2026-10-27\n")]
    public void Date(string date) => Rejected(Sample.Item(1, date: date));

    [Fact(DisplayName = "AC-017.1 메모가 비었거나 32,000자를 넘거나 줄바꿈·탭 밖의 제어 문자가 있으면 E-HELPER-BAD-MESSAGE")]
    public void Memo()
    {
        Rejected(Sample.Item(1, memo: ""));
        Rejected(Sample.Item(1, memo: new string('가', 32001)));
        Rejected(Sample.Item(1, memo: "가짜\u0001메모"));
        Rejected(Sample.Item(1, memo: "가짜\u0090메모"));
        Rejected(Sample.Item(1, memo: "가짜\u007F메모"));
    }

    [Fact(DisplayName = "AC-017.1 같은 진료(visitKey)가 두 번이면 E-HELPER-BAD-MESSAGE")]
    public void Duplicate() => Rejected(Sample.Item(1, visitKey: "v1"), Sample.Item(2, visitKey: "v1"));

    [Fact(DisplayName = "AC-017.1 진료 키가 달라도 같은 차트번호·같은 내원일이 두 번이면 E-HELPER-BAD-MESSAGE(도우미가 가릴 수 있는 것은 차트번호·내원일까지라 둘째가 첫째 화면을 연다)")]
    public void SameChartSameDate()
    {
        // 메모가 같아도, 달라도, 이름이 달라도, 사이에 다른 사람이 있어도 거절한다
        Rejected(Sample.Item(1, visitKey: "v1"), Sample.Item(1, visitKey: "v2"));
        Rejected(Sample.Item(1, visitKey: "v1", memo: "가짜 메모 가"), Sample.Item(1, visitKey: "v2", memo: "가짜 메모 나"));
        Rejected(Sample.Item(1, visitKey: "v1", name: "가상환자01"), Sample.Item(1, visitKey: "v2", name: "가상환자02"));
        Rejected(Sample.Item(1, visitKey: "v1"), Sample.Item(2, visitKey: "v2"), Sample.Item(1, visitKey: "v3"));
    }

    [Fact(DisplayName = "AC-017.1 같은 환자의 다른 날·같은 날의 다른 환자는 받는다")]
    public void SameChartOtherDate()
    {
        BatchCheck.Validate(new[] { Sample.Item(1, visitKey: "v1", date: "2026-10-27"), Sample.Item(1, visitKey: "v2", date: "2026-10-28") });
        BatchCheck.Validate(new[] { Sample.Item(1, visitKey: "v1"), Sample.Item(2, visitKey: "v2") });
    }

    [Fact(DisplayName = "AC-017.1 날짜 표기를 바꿔 같은 날 검사를 비켜 갈 수 없다: YYYY-MM-DD 밖의 표기는 모양 검사에서 먼저 막힌다")]
    public void SameDateOtherFormat()
    {
        Rejected(Sample.Item(1, visitKey: "v1", date: "2026-10-27"), Sample.Item(1, visitKey: "v2", date: "20261027"));
        Rejected(Sample.Item(1, visitKey: "v1", date: "2026-10-27"), Sample.Item(1, visitKey: "v2", date: "2026/10/27"));
        Rejected(Sample.Item(1, visitKey: "v1", date: "2026-10-27"), Sample.Item(1, visitKey: "v2", date: "2026-10-27 "));
        Rejected(Sample.Item(1, visitKey: "v1", date: "2026-10-27"), Sample.Item(1, visitKey: "v2", date: "٢٠٢٦-١٠-٢٧"));
    }

    [Fact(DisplayName = "AC-017.1 앞자리 0만 다른 차트번호는 내원 찾기(원본 SamePatient: 숫자 글자 그대로 비교)도 다른 사람으로 보므로 묶음 검사도 다른 사람으로 본다")]
    public void LeadingZeroIsAnotherChart()
    {
        Assert.False(ChartRules.SamePatient("0900001", "가상환자01", "900001", "가상환자01"));
        BatchCheck.Validate(new[] { Sample.Item(1, visitKey: "v1", chart: "900001"), Sample.Item(1, visitKey: "v2", chart: "0900001") });
    }

    [Fact(DisplayName = "AC-017.1 진료 키가 비었거나 64자를 넘으면 E-HELPER-BAD-MESSAGE, 예외 글에 환자 글자가 없다")]
    public void VisitKeyAndNoPatientText()
    {
        Rejected(Sample.Item(1, visitKey: ""));
        Rejected(Sample.Item(1, visitKey: new string('a', 65)));
        var error = Assert.ThrowsAny<HelperException>(() => BatchCheck.Validate(new[] { Sample.Item(1, name: "가상환자\n99") }));
        Assert.DoesNotContain("가상환자", error.Message, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-017.1 null 항목이 섞이면 E-HELPER-BAD-MESSAGE")]
    public void NullItem() => Rejected(new InputItem[] { null! });
}
