using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;

namespace Precheck.Core.Claim;

/// <summary>한 달 자료 읽기가 같이 쓰는 글자·날짜 다루기(원본 각 파일의 Clean·Text·Key 그대로).</summary>
internal static class ClaimText
{
    /// <summary>원본 ClaimMemoHistory.Clean: 줄바꿈은 \n 하나로, 그 밖의 제어 문자(탭 제외)는 빼고 앞뒤 공백을 지운다.</summary>
    public static string CleanMemo(string? value)
    {
        var output = new StringBuilder();
        foreach (var character in (value ?? "").Replace("\r\n", "\n").Replace('\r', '\n'))
        {
            if (character == '\n' || character == '\t' || !char.IsControl(character)) output.Append(character);
        }
        return output.ToString().Trim();
    }

    /// <summary>원본 RxDiagnosisTrend.Clean: 제어 문자를 빼고 앞뒤 공백을 지운 뒤 limit자까지.</summary>
    public static string CleanName(string? value, int limit)
    {
        var text = new string((value ?? "").Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        return text.Length > limit ? text.Substring(0, limit) : text;
    }

    /// <summary>원본 Text(reader, i): DB NULL은 빈 글자, 아니면 글자로 바꿔 앞뒤 공백을 지운다.</summary>
    public static string Cell(IReadOnlyList<object?> row, int index)
    {
        var value = row != null && row.Count > index ? row[index] : null;
        return value == null ? "" : (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "").Trim();
    }

    /// <summary>DB 값 그대로(NULL은 null).</summary>
    public static object? Raw(IReadOnlyList<object?> row, int index) => row != null && row.Count > index ? row[index] : null;

    /// <summary>yyyyMMdd(원본 Key).</summary>
    public static string Day(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    /// <summary>원본 SQL 시각 매개변수 모양: yyyyMMdd + "0000"(그날 0시, Char 12).</summary>
    public static string Stamp(DateTime day) => Day(day) + "0000";

    /// <summary>YYYY-MM-DD.</summary>
    public static string Iso(DateTime day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>
    /// JSON에 넣을 글자: 짝 없는 대리쌍을 U+FFFD로 바꾼다(그대로면 JSON을 만들 수 없다). 바른 글자는 그대로다.
    /// </summary>
    public static string Safe(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var text = value!;
        var output = new StringBuilder(text.Length);
        var changed = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (char.IsHighSurrogate(ch) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                output.Append(ch).Append(text[++i]);
            }
            else if (char.IsSurrogate(ch))
            {
                output.Append('\uFFFD');
                changed = true;
            }
            else
            {
                output.Append(ch);
            }
        }
        return changed ? output.ToString() : text;
    }

    /// <summary>원본 Convert.ToInt64(reader[i]). 바꿀 수 없으면 E-BIT-READ-FAILED.</summary>
    public static long Long(IReadOnlyList<object?> row, int index)
    {
        try
        {
            return Convert.ToInt64(Raw(row, index), CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }
}
