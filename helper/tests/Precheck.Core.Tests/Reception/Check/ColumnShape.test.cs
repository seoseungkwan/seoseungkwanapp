using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Precheck.Core.Reception.Check;
using Xunit;

// ProbeMatch.test.cs와 같은 Probe 이름 공간(이 TASK의 시험만 한 거르기로 돈다)
namespace Precheck.Core.Tests.Reception.Check.Probe;

/// <summary>
/// AC-1401.7 모양(ColumnShape): 칸 하나의 값들에서 빈 값 아님 %, 길이 범위, 8자리 날짜 모양 %, 6자리 날짜 모양 %, 13자리 숫자 모양 %,
/// 값이 4가지 이하이고 모두 두 글자 이하일 때만 그 값 목록.
/// 빈 값 = null·DBNull·앞뒤 공백을 뺀 빈 글. 길이·모양·값은 앞뒤 공백을 뺀 글로 본다. 모양 %는 빈 값이 아닌 값 가운데의 %다.
/// %는 내림한 정수이고, 하나라도 있으면 0이 아니고 하나라도 빠지면 100이 아니다(1~99로 묶음).
/// </summary>
public class ColumnShapeTests
{
    private static object?[] Repeat(object? value, int count) => Enumerable.Repeat(value, count).ToArray();

    [Fact(DisplayName = "AC-1401.7 빈 값 아님 %: null·DBNull·공백만인 글은 빈 값, 줄 수는 받은 값 모두")]
    public void CountsNonEmpty()
    {
        var shape = ColumnShape.Of(new object?[] { "가", null, DBNull.Value, "  \r\n", "나" });

        Assert.Equal(5, shape.Rows);
        Assert.Equal(40, shape.NonEmptyPercent);
    }

    [Theory(DisplayName = "AC-1401.7 %는 내림한 정수, 하나라도 있으면 1 이상, 하나라도 빠지면 99 이하")]
    [InlineData(0, 300, 0)]
    [InlineData(1, 300, 1)]
    [InlineData(299, 300, 99)]
    [InlineData(300, 300, 100)]
    [InlineData(2, 3, 66)]
    [InlineData(1, 2, 50)]
    [InlineData(0, 0, 0)]
    public void PercentIsFlooredAndHonest(int filled, int rows, int expected)
    {
        var values = Repeat("Y", filled).Concat(Repeat(null, rows - filled));

        var shape = ColumnShape.Of(values);

        Assert.Equal(rows, shape.Rows);
        Assert.Equal(expected, shape.NonEmptyPercent);
    }

    [Fact(DisplayName = "AC-1401.7 길이 범위는 빈 값이 아닌 값의 앞뒤 공백을 뺀 글자 수, 값이 없으면 둘 다 null")]
    public void LengthRange()
    {
        var shape = ColumnShape.Of(new object?[] { "ab", " abcd ", "abc", null, "  " });
        Assert.Equal(2, shape.MinLength);
        Assert.Equal(4, shape.MaxLength);

        var empty = ColumnShape.Of(new object?[] { null, DBNull.Value, "" });
        Assert.Null(empty.MinLength);
        Assert.Null(empty.MaxLength);
    }

    [Fact(DisplayName = "AC-1401.7 8자리 날짜 모양: 숫자 8개이고 1900~2099년의 있는 날짜(yyyyMMdd)")]
    public void EightDigitDates()
    {
        var shape = ColumnShape.Of(new object?[]
        {
            "20261105", "20260230", "19991231", "2026110", "2026-11-05", "99991231", "18991231", "20240229", "20250229",
        });

        Assert.Equal(33, shape.Date8Percent); // 20261105·19991231·20240229 = 3/9
        Assert.Equal(0, shape.Date6Percent);
        Assert.Equal(0, shape.Digits13Percent);
    }

    [Fact(DisplayName = "AC-1401.7 6자리 날짜 모양: 숫자 6개이고 있는 날짜(yyMMdd, 윤일은 20yy로 본다)")]
    public void SixDigitDates()
    {
        var shape = ColumnShape.Of(new object?[] { "261105", "260230", "991231", "900101", "123456", "240229", "250229", "26110" });

        Assert.Equal(50, shape.Date6Percent); // 261105·991231·900101·240229 = 4/8
        Assert.Equal(0, shape.Date8Percent);
    }

    [Fact(DisplayName = "AC-1401.7 13자리 숫자 모양: 숫자 13개, 또는 6개-7개(가운데 줄표 하나), 전각 숫자는 아님")]
    public void ThirteenDigits()
    {
        var shape = ColumnShape.Of(new object?[]
        {
            "9001011234567", "900101-1234567", "900101123456", "90010112345678", "900101-123456", " 9001011234567 ", "９００１０１１２３４５６７",
        });

        Assert.Equal(42, shape.Digits13Percent); // 3/7
    }

    [Fact(DisplayName = "AC-1401.7 모양 %는 빈 값이 아닌 값 가운데의 %다")]
    public void ShapePercentsOverNonEmpty()
    {
        var shape = ColumnShape.Of(new object?[] { "20261105", null, null, DBNull.Value });

        Assert.Equal(25, shape.NonEmptyPercent);
        Assert.Equal(100, shape.Date8Percent);
    }

    [Fact(DisplayName = "AC-1401.7 숫자·날짜 형 값은 고정 문화의 글로 본다(int 20261105는 8자리 날짜, long 13자리는 13자리 숫자, DateTime은 yyyy-MM-dd HH:mm:ss)")]
    public void NonTextValues()
    {
        var shape = ColumnShape.Of(new object?[] { 20261105, 9001011234567L, 12.5m, new DateTime(2026, 11, 5) });

        Assert.Equal(100, shape.NonEmptyPercent);
        Assert.Equal(25, shape.Date8Percent);
        Assert.Equal(25, shape.Digits13Percent);
        Assert.Equal(4, shape.MinLength);
        Assert.Equal(19, shape.MaxLength);
    }

    [Fact(DisplayName = "AC-1401.7 값 목록: 서로 다른 값이 4가지 이하이고 모두 두 글자 이하면 그 값들(앞뒤 공백 뺌, 글자 순)")]
    public void ListsSmallValueSets()
    {
        Assert.Equal(new[] { "1", "2", "N", "Y" }, ColumnShape.Of(new object?[] { "1", "2", "1", "Y", " N ", null, "" }).Values);
        Assert.Equal(new[] { "남", "여" }, ColumnShape.Of(new object?[] { "남", "여", "남" }).Values);
        Assert.Equal(new[] { "0", "1" }, ColumnShape.Of(new object?[] { 0, 1, 1 }).Values);
    }

    [Fact(DisplayName = "AC-1401.7 값 목록은 다섯 가지 이상·세 글자 이상인 값·이름 모양·바이트 값이 하나라도 있으면 없다(null)")]
    public void NoListOtherwise()
    {
        Assert.Null(ColumnShape.Of(new object?[] { "1", "2", "3", "4", "5" }).Values);
        Assert.Null(ColumnShape.Of(new object?[] { "Y", "N", "ABC" }).Values);
        Assert.Null(ColumnShape.Of(new object?[] { "가상환자01", "가상환자02" }).Values);
        Assert.Null(ColumnShape.Of(new object?[] { "Y", new byte[] { 1 } }).Values);
    }

    [Fact(DisplayName = "AC-1401.7 값이 하나도 없으면 값 목록은 빈 목록이다")]
    public void EmptyListWhenNoValues()
    {
        var values = ColumnShape.Of(new object?[] { null, "  " }).Values;
        Assert.NotNull(values);
        Assert.Empty(values!);
    }

    [Fact(DisplayName = "AC-1401.7 바이트 값은 빈 값이 아니고 길이는 바이트 수, 어떤 모양도 아니다")]
    public void BinaryValues()
    {
        var shape = ColumnShape.Of(new object?[] { new byte[] { 2, 0, 2, 6, 1, 1, 0, 5 }, Array.Empty<byte>() });

        Assert.Equal(50, shape.NonEmptyPercent);
        Assert.Equal(8, shape.MinLength);
        Assert.Equal(8, shape.MaxLength);
        Assert.Equal(0, shape.Date8Percent);
    }

    [Fact(DisplayName = "AC-1401.7 ShapeLine은 숫자와 값 목록만 갖는다, null 입력은 ArgumentNullException")]
    public void ShapeLineIsNumbersAndList()
    {
        var allowed = new[] { typeof(int), typeof(int?), typeof(IReadOnlyList<string>) };
        var properties = typeof(ShapeLine).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        Assert.NotEmpty(properties);
        Assert.All(properties, property => Assert.Contains(property.PropertyType, allowed));

        Assert.Throws<ArgumentNullException>(() => ColumnShape.Of(null!));
    }
}
