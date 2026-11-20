using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Detail;

/// <summary>진료비 세부내역서(spec doc-print TASK-5, 비트 기간 출력 모양). 지금은 빈 껍데기다(TASK-5가 채운다).</summary>
public sealed class DetailSource : IDocSource
{
    public DocKind Kind => DocKind.Detail;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx) => Array.Empty<DocPage>();
}
