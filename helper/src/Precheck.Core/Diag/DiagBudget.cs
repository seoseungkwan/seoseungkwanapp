using System;

namespace Precheck.Core.Diag;

/// <summary>단계 끝이나 전체 끝이 지나 문장을 시작하지 않는다. 제품 읽기 안에서 던져 그 읽기를 그 자리에서 멈춘다.</summary>
public sealed class DiagStoppedException : Exception
{
}

/// <summary>
/// 측정 시간 한도. 문장 하나는 10분·그 단계 끝까지·전체 끝까지 중 가장 작은 시간까지만 돈다.
/// 시작만 막지 않고 도는 문장도 단계 끝에서 끊어서, 앞 단계가 시간을 다 써도 뒤 단계가 잰다.
/// 환경 문장과 끊긴 문장 뒤의 비용·대기 읽기는 ShortLimit이고 단계 끝·전체 끝을 보지 않는다(최악에도 약 40.5분).
/// 시계는 사용자가 엔터를 누른 때부터 잰다.
/// </summary>
public sealed class DiagBudget
{
    public static readonly TimeSpan StatementLimit = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan Ceiling = TimeSpan.FromMinutes(40);
    public static readonly TimeSpan ShortLimit = TimeSpan.FromSeconds(30);

    public static readonly TimeSpan PiecesEnd = TimeSpan.FromMinutes(25);
    public static readonly TimeSpan StatsRowsEnd = TimeSpan.FromMinutes(28);
    public static readonly TimeSpan RemainingEnd = TimeSpan.FromMinutes(30);
    public static readonly TimeSpan StatsReportEnd = TimeSpan.FromMinutes(35);
    public static readonly TimeSpan RevenueEnd = Ceiling;

    private readonly Func<TimeSpan> elapsed;
    private TimeSpan stepEnd = Ceiling;

    public DiagBudget(Func<TimeSpan> elapsed)
    {
        this.elapsed = elapsed ?? throw new ArgumentNullException(nameof(elapsed));
    }

    public bool CanStart => elapsed() < stepEnd;

    public void StartBy(TimeSpan end)
    {
        stepEnd = end < Ceiling ? end : Ceiling;
    }

    /// <summary>다음 문장의 시간 제한. 단계 끝이 지났으면 DiagStoppedException.</summary>
    public TimeSpan NextLimit()
    {
        var left = stepEnd - elapsed();
        if (left <= TimeSpan.Zero) throw new DiagStoppedException();
        return left < StatementLimit ? left : StatementLimit;
    }
}
