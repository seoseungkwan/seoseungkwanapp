using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.RxCopy;

/// <summary>처방전 사본(spec doc-print TASK-6): 처방 있는 날만. 지금은 빈 껍데기다(TASK-6이 채운다).</summary>
public sealed class RxCopySource : IDocSource
{
    public DocKind Kind => DocKind.RxCopy;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx) => Array.Empty<DocPage>();
}
