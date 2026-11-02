namespace Precheck.Core.Stats;

/// <summary>통계 읽기 오류 번호(REQ-503). 문구는 웹 lib/errors.ts 한 곳에 있다. SQL 실패는 Bit의 E-BIT-READ-FAILED 그대로.</summary>
public static class StatsErrors
{
    /// <summary>과거 이관 자료가 따로 있어 신환을 확정할 수 없다(원본 HistoryGuard가 1, AC-503.3).</summary>
    public const string History = "E-STATS-HISTORY";

    /// <summary>진료 줄이 StatsRows.MaxRows(700,000줄)를 넘는다. 기간을 줄여 다시 읽는다(AC-503.3).</summary>
    public const string TooBig = "E-STATS-TOO-BIG";
}
