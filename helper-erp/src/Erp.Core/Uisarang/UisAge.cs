using System;

namespace Erp.Core.Uisarang;

/// <summary>
/// 주민등록번호 꼴 글자에서 마감 일자 기준 만 나이와 10살 구간(spec erp-uisarang design.md 6-4, AC-4207.2).
/// 글자는 셈에만 쓰고 어디에도 남기지 않는다(답·기록·예외 글에 넣지 않음, AC-4209.1).
/// </summary>
public static class UisAge
{
    /// <summary>
    /// 만 나이. 빈칸·'-'를 뺀 앞 7글자가 모두 숫자(0~9)일 때만 센다(8번째부터는 보지 않는다 — '*'로 가려져도 된다).
    /// 7번째 숫자 1·2·5·6 = 1900년대, 3·4·7·8 = 2000년대, 9·0 = 1800년대. 생년월일이 달력에 없거나 마감 일자보다 뒤면 null.
    /// 만 나이 = (마감 일자 yyyymmdd − 생년월일 yyyymmdd) / 10000(정수). 마감 일자의 시각은 보지 않는다.
    /// </summary>
    public static int? Age(string? rrn, DateTime day)
    {
        if (rrn == null) return null;
        var digits = new int[7];
        var count = 0;
        foreach (var c in rrn)
        {
            if (count == digits.Length) break;
            if (c == '-' || char.IsWhiteSpace(c)) continue;
            if (c < '0' || c > '9') return null;
            digits[count++] = c - '0';
        }
        if (count < digits.Length) return null;

        int century;
        switch (digits[6])
        {
            case 1: case 2: case 5: case 6: century = 1900; break;
            case 3: case 4: case 7: case 8: century = 2000; break;
            default: century = 1800; break;
        }
        var year = century + digits[0] * 10 + digits[1];
        var month = digits[2] * 10 + digits[3];
        var date = digits[4] * 10 + digits[5];
        if (month < 1 || month > 12 || date < 1 || date > DateTime.DaysInMonth(year, month)) return null;

        var birth = year * 10000 + month * 100 + date;
        var closing = day.Year * 10000 + day.Month * 100 + day.Day;
        if (birth > closing) return null;
        return (closing - birth) / 10000;
    }

    /// <summary>10살 구간 = min(나이 / 10 × 10, 90): 0·10·…·90(90 이상). 0보다 작은 나이는 ArgumentOutOfRangeException.</summary>
    public static int Band(int age)
    {
        if (age < 0) throw new ArgumentOutOfRangeException(nameof(age));
        return Math.Min(age / 10 * 10, 90);
    }
}
