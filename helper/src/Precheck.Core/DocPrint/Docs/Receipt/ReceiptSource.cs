using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>진료비 영수증(spec doc-print TASK-4): 고른 날마다 한 장. 지금은 빈 껍데기다(TASK-4가 채운다).</summary>
public sealed class ReceiptSource : IDocSource
{
    public DocKind Kind => DocKind.Receipt;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx) => Array.Empty<DocPage>();
}
