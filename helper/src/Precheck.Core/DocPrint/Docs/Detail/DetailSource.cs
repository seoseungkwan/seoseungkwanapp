using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Detail;

/// <summary>
/// 진료비 세부내역서(spec doc-print TASK-5, 비트 기간 출력 모양): 고른 날 전체를 한 서류로. 자료는 DetailReader(OdrInf·OrpInf·OdlInf 저장 값),
/// 그리기는 DetailLayout(A4 세로, 길면 여러 쪽). 수납한 줄이 없으면 0쪽. 읽기 실패는 BitException 그대로.
/// </summary>
public sealed class DetailSource : IDocSource
{
    public DocKind Kind => DocKind.Detail;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx) => DetailLayout.Pages(DetailReader.Read(db, ctx), ctx);
}
