using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Diag;

/// <summary>측정 문장 하나의 길: 관문을 지나지 못하면 세션에 닿지 않고, 세션이 던진 예외는 형 이름만 남긴 실패가 된다.</summary>
public static class DiagStatement
{
    public static DiagOutcome Run(IDiagSession session, string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout, Func<TimeSpan> elapsed)
    {
        if (session == null) throw new ArgumentNullException(nameof(session));
        if (elapsed == null) throw new ArgumentNullException(nameof(elapsed));
        try
        {
            ReadOnlyGuard.Require(sql, args);
        }
        catch (HelperException e)
        {
            return DiagOutcome.Failure(0, null, null, e.Code);
        }

        var started = elapsed();
        try
        {
            return session.Run(sql, args, timeout);
        }
        catch (Exception e)
        {
            return DiagOutcome.Failure((long)(elapsed() - started).TotalMilliseconds, null, null, e.GetType().Name);
        }
    }
}

/// <summary>
/// 제품 읽기(StatsRows·StatsReport·RevenueDays)에 끼우는 감싸개. 제품 코드가 보는 모양은 지금 세션과 같다:
/// 줄 값을 그대로 돌려주고 실패는 E-BIT-READ-FAILED다. 제품이 넘긴 시간 제한(150초·90초·15초)은 측정 한도로 바꾼다.
/// 기록에는 문장 이름과 결과만 넘긴다. 매개변수 값은 어디에도 남기지 않는다.
/// </summary>
public sealed class TimingBitDb : IBitDb
{
    private readonly IDiagSession session;
    private readonly DiagBudget budget;
    private readonly Func<TimeSpan> elapsed;
    private readonly Action<string, DiagOutcome> record;

    public TimingBitDb(IDiagSession session, DiagBudget budget, Func<TimeSpan> elapsed, Action<string, DiagOutcome> record)
    {
        this.session = session ?? throw new ArgumentNullException(nameof(session));
        this.budget = budget ?? throw new ArgumentNullException(nameof(budget));
        this.elapsed = elapsed ?? throw new ArgumentNullException(nameof(elapsed));
        this.record = record ?? throw new ArgumentNullException(nameof(record));
    }

    /// <summary>시작한 문장(성공·실패 모두).</summary>
    public HashSet<string> Attempted { get; } = new HashSet<string>(StringComparer.Ordinal);

    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        var limit = budget.NextLimit();
        Attempted.Add(sql);
        var outcome = DiagStatement.Run(session, sql, args, limit, elapsed);
        record(DiagLabels.Of(sql), outcome);
        if (!outcome.Ok) throw new BitException(BitErrors.ReadFailed);
        return outcome.Rows;
    }
}
