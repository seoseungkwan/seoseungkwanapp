using System;
using System.Collections.Generic;
using System.Linq;

namespace Erp.Core.Uisarang;

/// <summary>
/// 일일수입통계 셈(spec erp-uisarang design.md 5-3·6-2, REQ-4205, TASK-7).
/// - Read: 보험구분이 '합계'인 줄 하나만 읽는다(보험구분 줄을 더하지 않음). 합계 줄이 없거나 둘이면 모든 값 null + Columns에 '합계'
/// - 총진료비: 합계 줄 칸이 숫자면 그것, 비었으면 바로 아래 줄 같은 칸(병합 칸), 둘 다 아니면 null
/// - 숫자는 원 단위 정수(원 미만은 반올림 없이 버림, CLAUDE.md). 빈 칸·숫자 꼴 아닌 글자는 0이 아니라 null
/// - Check: 맞춰 보기 totalFee·received·headcount(경고만, 채우기는 막지 않음)
/// 시트만 받는다(파일·네트워크에 닿지 않음). 예외 글에 칸 값을 넣지 않는다(AC-4209.1).
/// </summary>
public static class UisIncome
{
    /// <summary>합계 줄이 없거나 둘일 때 Columns에 담는 이름(AC-4205.1).</summary>
    public const string SumColumn = UisReport.SumRow;

    public static IncomeFacts Read(UisSheet s)
    {
        if (s == null) throw new ArgumentNullException(nameof(s));
        if (s.Kind != UisKind.Income) throw new ArgumentException("일일수입통계 시트가 아니다", nameof(s));

        var columns = new List<string>(s.MissingColumns);
        var sums = new List<int>();
        for (var i = 0; i < s.Rows.Count; i++)
        {
            if (UisReport.Squeeze(UisReport.Value(s, s.Rows[i], "보험구분").Text) == UisReport.SumRow) sums.Add(i);
        }
        if (sums.Count != 1)
        {
            columns.Add(SumColumn);
            return new IncomeFacts { Columns = columns.ToArray() };
        }

        var at = sums[0];
        var sum = s.Rows[at];
        long? Of(string column) => Won(UisReport.Number(UisReport.Value(s, sum, column)));

        return new IncomeFacts
        {
            TotalFee = TotalFee(s, at),
            Covered = Of("급여총액"),
            Insurer = Of("청구액"),
            Received = Of("진료수납액"),
            Noncovered = Of("비급여"),
            First = Of("초진수"),
            Return = Of("재진수"),
            Headcount = Of("인원계"),
            Cash = Of("현금수납액"),
            Card = Of("카드수납액"),
            Columns = columns.ToArray(),
        };
    }

    /// <summary>
    /// 맞춰 보기(6-2): 총진료비 ≠ 급여총액 + 비급여 → totalFee, 진료수납액 ≠ 현금수납액 + 카드수납액 → received, 인원계 ≠ 초진수 + 재진수 → headcount에
    /// [왼쪽, 오른쪽]. 같거나 하나라도 null이면 null. checks의 다른 칸은 건드리지 않는다.
    /// </summary>
    public static void Check(IncomeFacts facts, UisDayChecks checks)
    {
        if (facts == null) throw new ArgumentNullException(nameof(facts));
        if (checks == null) throw new ArgumentNullException(nameof(checks));
        checks.TotalFee = Mismatch(facts.TotalFee, Add(facts.Covered, facts.Noncovered));
        checks.Received = Mismatch(facts.Received, Add(facts.Cash, facts.Card));
        checks.Headcount = Mismatch(facts.Headcount, Add(facts.First, facts.Return));
    }

    /// <summary>두 값이 다르면 [왼쪽, 오른쪽], 같거나 하나라도 null이면 null(6-2).</summary>
    public static long[]? Mismatch(long? left, long? right) =>
        left is long a && right is long b && a != b ? new[] { a, b } : null;

    /// <summary>숫자 칸 값을 원 단위 정수로: 원 미만은 반올림 없이 버린다(0 쪽으로). null·long 범위 밖은 null.</summary>
    internal static long? Won(double? value)
    {
        if (!(value is double number) || double.IsNaN(number) || double.IsInfinity(number)) return null;
        var whole = Math.Truncate(number);
        if (whole >= 9.2e18 || whole <= -9.2e18) return null;
        return (long)whole;
    }

    /// <summary>총진료비(5-3): 합계 줄 칸이 숫자면 그것, 비었으면 바로 아래 자료 줄 같은 칸(병합 칸), 둘 다 아니면 null.</summary>
    private static long? TotalFee(UisSheet s, int at)
    {
        var cell = UisReport.Value(s, s.Rows[at], "총진료비");
        if (!cell.IsEmpty) return Won(UisReport.Number(cell));
        if (at + 1 >= s.Rows.Count) return null;
        return Won(UisReport.Number(UisReport.Value(s, s.Rows[at + 1], "총진료비")));
    }

    private static long? Add(long? a, long? b) => a is long x && b is long y ? x + y : null;
}
