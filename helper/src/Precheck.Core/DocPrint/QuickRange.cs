using System;
using System.Collections.Generic;

namespace Precheck.Core.DocPrint;

/// <summary>기간 빠른 단추(시안 차례).</summary>
public enum QuickKind
{
    Today,
    ThisMonth,
    LastMonth,
    Last3Months,
    All,
}

/// <summary>기간 빠른 단추(spec doc-print AC-7403.1). 날만 본다(시각은 버림), 끝 날 포함.</summary>
public static class QuickRange
{
    /// <summary>창을 열면 골라져 있는 단추.</summary>
    public const QuickKind Default = QuickKind.ThisMonth;

    /// <summary>단추 차례.</summary>
    public static IReadOnlyList<QuickKind> Kinds { get; } = new[] { QuickKind.Today, QuickKind.ThisMonth, QuickKind.LastMonth, QuickKind.Last3Months, QuickKind.All };

    public static string NameOf(QuickKind kind)
    {
        switch (kind)
        {
            case QuickKind.Today: return "오늘";
            case QuickKind.ThisMonth: return "이번 달";
            case QuickKind.LastMonth: return "지난 달";
            case QuickKind.Last3Months: return "최근 3개월";
            case QuickKind.All: return "전체";
            default: throw new ArgumentOutOfRangeException(nameof(kind));
        }
    }

    /// <summary>
    /// 오늘 = 오늘~오늘, 이번 달 = 1일~오늘, 지난 달 = 지난 달 1일~말일, 최근 3개월 = 오늘의 3개월 전 다음 날~오늘,
    /// 전체 = 첫 내원~오늘(첫 내원을 모르거나 오늘보다 늦으면 오늘~오늘).
    /// </summary>
    public static (DateTime From, DateTime To) Of(QuickKind kind, DateTime today, DateTime? firstVisit)
    {
        var day = today.Date;
        var monthStart = new DateTime(day.Year, day.Month, 1);
        switch (kind)
        {
            case QuickKind.Today: return (day, day);
            case QuickKind.ThisMonth: return (monthStart, day);
            case QuickKind.LastMonth: return (monthStart.AddMonths(-1), monthStart.AddDays(-1));
            case QuickKind.Last3Months: return (day.AddMonths(-3).AddDays(1), day);
            case QuickKind.All:
                var first = firstVisit?.Date;
                return (first == null || first.Value > day ? day : first.Value, day);
            default: throw new ArgumentOutOfRangeException(nameof(kind));
        }
    }
}
