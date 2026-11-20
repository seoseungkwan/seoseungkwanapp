using System.Collections.Generic;
using Precheck.Core.DocPrint.Docs.Chart;
using Precheck.Core.DocPrint.Docs.Detail;
using Precheck.Core.DocPrint.Docs.Receipt;
using Precheck.Core.DocPrint.Docs.RxCopy;

namespace Precheck.Core.DocPrint;

/// <summary>서류 4종(인쇄 차례). 창(DocForm)은 이 목록을 DocPlan.Build에 넘긴다.</summary>
public static class DocSources
{
    public static IReadOnlyList<IDocSource> All { get; } = new IDocSource[] { new ReceiptSource(), new DetailSource(), new RxCopySource(), new ChartSource() };
}
