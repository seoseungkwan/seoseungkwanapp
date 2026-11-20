using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>
/// 진료기록부(spec doc-print TASK-7): 고른 날의 외래 내원을 날짜·접수 차례로 이어 쓰는 외래진료기록부 A4 쪽들.
/// 값은 ChartRecord(ChartSql 문장, 읽기만), 모양은 ChartLayout. 도장 그림은 넣지 않는다(직원이 손으로 찍음, 사용자 결정).
/// 고른 날이 없으면 DB에 묻지 않고, 읽을 내원이 없으면 0쪽. 읽기 실패는 BitException 그대로 올린다.
/// </summary>
public sealed class ChartSource : IDocSource
{
    public DocKind Kind => DocKind.Chart;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        if (ctx.Days.Count == 0) return Array.Empty<DocPage>();
        var (visits, resHead) = ChartRecord.Read(db, ctx);
        return visits.Count == 0 ? Array.Empty<DocPage>() : ChartLayout.Draw(visits, resHead, ctx);
    }
}
