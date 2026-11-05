using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 칸 하나의 모양(AC-1401.7). 숫자와, 조건에 맞을 때만 작은 값 목록을 갖는다. 그 밖의 값 글은 들고 있지 않다.
/// %는 내림한 정수이고 하나라도 있으면 1 이상, 하나라도 빠지면 99 이하다(0은 "하나도 없음", 100은 "모두"만 뜻한다).
/// </summary>
public sealed class ShapeLine
{
    public ShapeLine(int rows, int nonEmptyPercent, int? minLength, int? maxLength,
                     int date8Percent, int date6Percent, int digits13Percent, IReadOnlyList<string>? values)
    {
        Rows = rows;
        NonEmptyPercent = nonEmptyPercent;
        MinLength = minLength;
        MaxLength = maxLength;
        Date8Percent = date8Percent;
        Date6Percent = date6Percent;
        Digits13Percent = digits13Percent;
        Values = values;
    }

    /// <summary>받은 값 수.</summary>
    public int Rows { get; }

    /// <summary>빈 값(null·DBNull·공백만인 글·빈 바이트)이 아닌 값의 %.</summary>
    public int NonEmptyPercent { get; }

    /// <summary>빈 값이 아닌 값의 가장 짧은 길이(앞뒤 공백 뺀 글자 수, 바이트는 바이트 수). 값이 없으면 null.</summary>
    public int? MinLength { get; }

    /// <summary>빈 값이 아닌 값의 가장 긴 길이. 값이 없으면 null.</summary>
    public int? MaxLength { get; }

    /// <summary>빈 값이 아닌 값 가운데 8자리 날짜 모양(yyyyMMdd, 1900~2099년의 있는 날)의 %.</summary>
    public int Date8Percent { get; }

    /// <summary>빈 값이 아닌 값 가운데 6자리 날짜 모양(yyMMdd, 있는 날. 윤일은 20yy로 본다)의 %.</summary>
    public int Date6Percent { get; }

    /// <summary>빈 값이 아닌 값 가운데 13자리 숫자 모양(숫자 13개, 또는 숫자 6개-숫자 7개)의 %.</summary>
    public int Digits13Percent { get; }

    /// <summary>
    /// 서로 다른 값이 <see cref="ColumnShape.MaxValues"/>가지 이하이고 모두 <see cref="ColumnShape.MaxValueLength"/>글자 이하일 때만
    /// 그 값들(앞뒤 공백 뺌, 서수 순). 바이트 값이 하나라도 있으면 null. 값이 하나도 없으면 빈 목록.
    /// </summary>
    public IReadOnlyList<string>? Values { get; }
}

/// <summary>확인 명령의 모양 단계(AC-1401.7). 순수 계산이다. 값은 고정 문화(InvariantCulture)의 글로 보고 앞뒤 공백을 뺀다.</summary>
public static class ColumnShape
{
    /// <summary>값 목록을 적는 서로 다른 값의 최대 가짓수.</summary>
    public const int MaxValues = 4;

    /// <summary>값 목록을 적는 값 하나의 최대 글자 수.</summary>
    public const int MaxValueLength = 2;

    public static ShapeLine Of(IEnumerable<object?> values)
    {
        if (values == null) throw new ArgumentNullException(nameof(values));

        int rows = 0, nonEmpty = 0, date8 = 0, date6 = 0, digits13 = 0;
        int? minLength = null, maxLength = null;
        var distinct = new SortedSet<string>(StringComparer.Ordinal);
        var listable = true;

        foreach (var value in values)
        {
            rows++;
            if (value is byte[] bytes)
            {
                if (bytes.Length == 0) continue;
                nonEmpty++;
                listable = false;
                Widen(ref minLength, ref maxLength, bytes.Length);
                continue;
            }

            var text = TextOf(value);
            if (text.Length == 0) continue;
            nonEmpty++;
            Widen(ref minLength, ref maxLength, text.Length);
            if (IsDate8(text)) date8++;
            if (IsDate6(text)) date6++;
            if (IsDigits13(text)) digits13++;
            if (listable)
            {
                distinct.Add(text);
                if (text.Length > MaxValueLength || distinct.Count > MaxValues) listable = false;
            }
        }

        return new ShapeLine(
            rows,
            Percent(nonEmpty, rows),
            minLength,
            maxLength,
            Percent(date8, nonEmpty),
            Percent(date6, nonEmpty),
            Percent(digits13, nonEmpty),
            listable ? distinct.ToList() : null);
    }

    private static int Percent(int part, int whole)
    {
        if (whole <= 0 || part <= 0) return 0;
        if (part >= whole) return 100;
        var floored = (int)((long)part * 100 / whole);
        return Math.Min(99, Math.Max(1, floored));
    }

    private static void Widen(ref int? min, ref int? max, int length)
    {
        min = min.HasValue ? Math.Min(min.Value, length) : length;
        max = max.HasValue ? Math.Max(max.Value, length) : length;
    }

    /// <summary>null·DBNull은 빈 글. 날짜는 yyyy-MM-dd HH:mm:ss, 숫자 등은 고정 문화의 글. 앞뒤 공백을 뺀다.</summary>
    private static string TextOf(object? value)
    {
        switch (value)
        {
            case null:
            case DBNull _:
                return "";
            case string text:
                return text.Trim();
            case DateTime date:
                return date.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
            case IFormattable formattable:
                return formattable.ToString(null, CultureInfo.InvariantCulture).Trim();
            default:
                return (value.ToString() ?? "").Trim();
        }
    }

    private static bool IsAsciiDigits(string text, int start, int count)
    {
        for (var i = start; i < start + count; i++)
        {
            if (text[i] < '0' || text[i] > '9') return false;
        }
        return true;
    }

    private static int Number(string text, int start, int count)
        => int.Parse(text.Substring(start, count), NumberStyles.None, CultureInfo.InvariantCulture);

    private static bool IsDay(int year, int month, int day)
        => month >= 1 && month <= 12 && day >= 1 && day <= DateTime.DaysInMonth(year, month);

    private static bool IsDate8(string text)
    {
        if (text.Length != 8 || !IsAsciiDigits(text, 0, 8)) return false;
        var year = Number(text, 0, 4);
        return year >= 1900 && year <= 2099 && IsDay(year, Number(text, 4, 2), Number(text, 6, 2));
    }

    private static bool IsDate6(string text)
    {
        if (text.Length != 6 || !IsAsciiDigits(text, 0, 6)) return false;
        return IsDay(2000 + Number(text, 0, 2), Number(text, 2, 2), Number(text, 4, 2));
    }

    private static bool IsDigits13(string text)
    {
        if (text.Length == 13) return IsAsciiDigits(text, 0, 13);
        return text.Length == 14 && text[6] == '-' && IsAsciiDigits(text, 0, 6) && IsAsciiDigits(text, 7, 7);
    }
}
