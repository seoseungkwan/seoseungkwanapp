using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>진료기록부(spec doc-print TASK-7, 도장 그림 없음). 지금은 빈 껍데기다(TASK-7이 채운다).</summary>
public sealed class ChartSource : IDocSource
{
    public DocKind Kind => DocKind.Chart;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx) => Array.Empty<DocPage>();
}
