using System;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Rules;

/// <summary>
/// spec erp-uisarang TASK-4 REQ-4207: 주민번호 꼴 글자에서 마감 일자 기준 만 나이(UisAge.Age)와 10살 구간(UisAge.Band), design.md 6-4.
/// 시험 값은 모두 지은 가짜 값이다: 뒷자리는 7번째(세기 숫자) 뒤로 '*'로 가렸고 생년월일은 1월 1일 같은 지은 날이다(design.md 12-2 꼴).
/// </summary>
public class UisAgeTests
{
    private static readonly DateTime Day = new DateTime(2026, 11, 23);

    [Theory(DisplayName = "AC-4207.2 세기 여섯 갈래: 7번째 숫자 1·2·5·6 = 1900년대, 3·4·7·8 = 2000년대, 9·0 = 1800년대")]
    [InlineData("800101-1******", 46)]
    [InlineData("800101-2******", 46)]
    [InlineData("800101-5******", 46)]
    [InlineData("800101-6******", 46)]
    [InlineData("100101-3******", 16)]
    [InlineData("100101-4******", 16)]
    [InlineData("100101-7******", 16)]
    [InlineData("100101-8******", 16)]
    [InlineData("990101-9******", 127)]
    [InlineData("990101-0******", 127)]
    public void Century(string rrn, int expected)
    {
        Assert.Equal(expected, UisAge.Age(rrn, Day));
    }

    [Theory(DisplayName = "AC-4207.2 만 나이 = (마감 일자 yyyymmdd − 생년월일 yyyymmdd) / 10000: 생일 전날 45, 생일 당일 46, 마감 일자에 태어나면 0")]
    [InlineData("801124-1******", 45)]
    [InlineData("801123-1******", 46)]
    [InlineData("801122-2******", 46)]
    [InlineData("261123-3******", 0)]
    [InlineData("251124-4******", 0)]
    [InlineData("251123-4******", 1)]
    public void FullAge(string rrn, int expected)
    {
        Assert.Equal(expected, UisAge.Age(rrn, Day));
    }

    [Theory(DisplayName = "AC-4207.2 가린 뒷자리: 빈칸·'-'를 빼고 앞 7글자만 본다(8번째부터 '*'로 가려져도·없어도·'-' 없이 붙어도 된다)")]
    [InlineData("800101-1******")]
    [InlineData("8001011******")]
    [InlineData("800101-1")]
    [InlineData(" 800101 - 1 ****** ")]
    [InlineData("80-01-01-1-***")]
    [InlineData("800101-1**xx**")]
    public void MaskedTail(string rrn)
    {
        Assert.Equal(46, UisAge.Age(rrn, Day));
    }

    [Fact(DisplayName = "AC-4207.2 2월 29일: 윤년(2000·2004) 생은 셈하고(2월 28일엔 아직 생일 전), 윤년 아닌 해(1900·1800·2001)의 2월 29일은 달력에 없어 null")]
    public void LeapDay()
    {
        Assert.Equal(25, UisAge.Age("000229-3******", new DateTime(2026, 2, 28)));
        Assert.Equal(26, UisAge.Age("000229-4******", new DateTime(2026, 3, 1)));
        Assert.Equal(22, UisAge.Age("040229-3******", Day));
        Assert.Null(UisAge.Age("000229-1******", Day));
        Assert.Null(UisAge.Age("000229-9******", Day));
        Assert.Null(UisAge.Age("010229-3******", Day));
    }

    [Theory(DisplayName = "AC-4207.2 생년월일이 달력에 없으면 null(13월·0월·0일·32일·4월 31일)")]
    [InlineData("801301-1******")]
    [InlineData("800001-1******")]
    [InlineData("800100-1******")]
    [InlineData("800132-1******")]
    [InlineData("800431-2******")]
    public void NotOnCalendar(string rrn)
    {
        Assert.Null(UisAge.Age(rrn, Day));
    }

    [Theory(DisplayName = "AC-4207.2 생년월일이 마감 일자보다 뒤면 null(하루 뒤·다음 해)")]
    [InlineData("261124-3******")]
    [InlineData("270101-4******")]
    [InlineData("991231-3******")]
    public void AfterDay(string rrn)
    {
        Assert.Null(UisAge.Age(rrn, Day));
    }

    [Theory(DisplayName = "AC-4207.2 앞 7글자에 숫자 아닌 글자가 섞이면 null(영문 O·'*'로 가린 세기 숫자·한글·전각 숫자)")]
    [InlineData("80O101-1******")]
    [InlineData("800101-*******")]
    [InlineData("가짜환자-1")]
    [InlineData("８００１０１-1******")]
    [InlineData("80010a-1******")]
    [InlineData("800101.1******")]
    public void MixedLetters(string rrn)
    {
        Assert.Null(UisAge.Age(rrn, Day));
    }

    [Theory(DisplayName = "AC-4207.2 빈칸·'-'를 뺀 글자가 7글자보다 짧으면 null(6자리·빈 글자·null·'-'만)")]
    [InlineData("800101")]
    [InlineData("800101-")]
    [InlineData("800101 - ")]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("-")]
    [InlineData(null)]
    public void TooShort(string? rrn)
    {
        Assert.Null(UisAge.Age(rrn, Day));
    }

    [Fact(DisplayName = "AC-4207.2 마감 일자의 시각은 보지 않는다(같은 날 0시·밤 11시 59분이 같은 나이)")]
    public void DayTimeIgnored()
    {
        Assert.Equal(45, UisAge.Age("801124-1******", new DateTime(2026, 11, 23, 23, 59, 59)));
        Assert.Equal(46, UisAge.Age("801123-1******", new DateTime(2026, 11, 23, 0, 0, 0)));
    }

    [Theory(DisplayName = "AC-4207.2 10살 구간 Band = min(나이 / 10 × 10, 90): 9 → 0, 10 → 10, 99 → 90, 100 → 90")]
    [InlineData(0, 0)]
    [InlineData(9, 0)]
    [InlineData(10, 10)]
    [InlineData(19, 10)]
    [InlineData(89, 80)]
    [InlineData(90, 90)]
    [InlineData(99, 90)]
    [InlineData(100, 90)]
    [InlineData(127, 90)]
    public void Band(int age, int expected)
    {
        Assert.Equal(expected, UisAge.Band(age));
    }

    [Fact(DisplayName = "AC-4207.2 Band에 0보다 작은 나이는 ArgumentOutOfRangeException(Age는 음수를 내지 않는다)")]
    public void NegativeBand()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => UisAge.Band(-1));
    }
}
