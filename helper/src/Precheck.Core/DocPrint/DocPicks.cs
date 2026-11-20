using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 서류 4개 체크(spec doc-print AC-7404.1): 묶음을 누르면 그 묶음 서류만 켜지고(나머지는 풀림), 그 뒤 하나씩 켜고 끈다.
/// Kinds는 늘 서류 차례(누른 차례 아님)다.
/// </summary>
public sealed class DocPicks
{
    private readonly HashSet<DocKind> on = new HashSet<DocKind>();

    /// <summary>켜진 서류, 서류 차례로.</summary>
    public IReadOnlyList<DocKind> Kinds => DocNames.All.Where(on.Contains).ToArray();

    /// <summary>그 묶음 서류만 켠다. null이면 그대로.</summary>
    public void Apply(DocBundle bundle)
    {
        if (bundle == null) return;
        on.Clear();
        foreach (var kind in bundle.Kinds) on.Add(kind);
    }

    /// <summary>켜거나 끈다. 정해 둔 서류 밖은 무시한다.</summary>
    public void Toggle(DocKind kind)
    {
        if (!DocNames.All.Contains(kind)) return;
        if (!on.Remove(kind)) on.Add(kind);
    }

    public bool IsOn(DocKind kind) => on.Contains(kind);
}
