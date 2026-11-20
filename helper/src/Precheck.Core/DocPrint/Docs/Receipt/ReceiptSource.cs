using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>
/// 진료비 영수증(spec doc-print TASK-4): 고른 날의 영수증(내원)마다 A4 한 장, 날짜순(같은 날은 접수 차례).
/// 수납 전(그 내원 OrpInf 줄 없음)인 내원은 건너뛴다. 자료는 ReceiptData(ReceiptSql 두 문장을 한 번씩), 그리기는 ReceiptLayout.
/// </summary>
public sealed class ReceiptSource : IDocSource
{
    public DocKind Kind => DocKind.Receipt;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx)
    {
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        return ReceiptData.Read(db, ctx).Select(visit => ReceiptLayout.Draw(visit, ctx)).ToArray();
    }
}
