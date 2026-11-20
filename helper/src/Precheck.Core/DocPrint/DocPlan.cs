using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 인쇄할 쪽 계획(spec doc-print AC-7404.2·AC-7406.2): 고른 서류만 서류 차례(영수증 → 세부내역서 → 처방전 사본 → 진료기록부)로,
/// 서류 안은 그 서류가 준 쪽 차례 그대로 잇는다. 장 수는 서류가 실제로 그린 쪽 수다.
/// </summary>
public sealed class DocPlan
{
    private readonly Dictionary<DocKind, int> counts;

    private DocPlan(IReadOnlyList<DocPage> pages, IReadOnlyList<DocKind> kinds, Dictionary<DocKind, int> counts, bool hasDays)
    {
        Pages = pages;
        Kinds = kinds;
        this.counts = counts;
        CanPrint = hasDays && kinds.Count > 0 && pages.Count > 0;
    }

    /// <summary>인쇄 차례의 쪽 전부.</summary>
    public IReadOnlyList<DocPage> Pages { get; }

    /// <summary>고른 서류, 서류 차례로.</summary>
    public IReadOnlyList<DocKind> Kinds { get; }

    /// <summary>모두 N장.</summary>
    public int Total => Pages.Count;

    /// <summary>[인쇄]: 날짜 1개·서류 1개 이상이고 N &gt; 0.</summary>
    public bool CanPrint { get; }

    /// <summary>그 서류가 그린 쪽 수(안 고른 서류는 0).</summary>
    public int CountOf(DocKind kind) => counts.TryGetValue(kind, out var count) ? count : 0;

    /// <summary>
    /// 고른 서류마다 같은 종류의 첫 서류(sources 안 차례)를 한 번 불러 쪽을 받는다. 고른 날이 없으면 아무 서류도 부르지 않는다(빈 계획).
    /// 안 고른 서류·없는 종류는 부르지 않는다. 서류 읽기 실패(BitException 등)는 그대로 올린다.
    /// </summary>
    public static DocPlan Build(IReadOnlyList<IDocSource> sources, IBitDb db, DocContext ctx, IReadOnlyCollection<DocKind> kinds)
    {
        if (sources == null) throw new ArgumentNullException(nameof(sources));
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        var chosen = DocNames.Normalize(kinds);
        var counts = new Dictionary<DocKind, int>();
        var pages = new List<DocPage>();
        var hasDays = ctx.Days.Count > 0;
        if (hasDays)
        {
            foreach (var kind in chosen)
            {
                var source = sources.FirstOrDefault(s => s != null && s.Kind == kind);
                if (source == null) continue;
                var drawn = (source.Pages(db, ctx) ?? Array.Empty<DocPage>()).Where(page => page != null).ToArray();
                counts[kind] = drawn.Length;
                pages.AddRange(drawn);
            }
        }
        return new DocPlan(pages.ToArray(), chosen, counts, hasDays);
    }
}
