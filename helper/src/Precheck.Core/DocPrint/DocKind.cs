using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.DocPrint;

/// <summary>서류 4종(spec doc-print). 인쇄 차례도 이 순서다: 영수증 → 세부내역서 → 처방전 사본 → 진료기록부.</summary>
public enum DocKind
{
    Receipt,
    Detail,
    RxCopy,
    Chart,
}

/// <summary>서류 이름(시안 글 그대로)과 서류 차례.</summary>
public static class DocNames
{
    /// <summary>서류 4종, 인쇄 차례대로.</summary>
    public static IReadOnlyList<DocKind> All { get; } = new[] { DocKind.Receipt, DocKind.Detail, DocKind.RxCopy, DocKind.Chart };

    public static string Of(DocKind kind)
    {
        switch (kind)
        {
            case DocKind.Receipt: return "진료비 영수증";
            case DocKind.Detail: return "진료비 세부내역서";
            case DocKind.RxCopy: return "처방전 사본";
            case DocKind.Chart: return "진료기록부";
            default: throw new ArgumentOutOfRangeException(nameof(kind));
        }
    }

    /// <summary>이름 → 서류(글자가 똑같을 때만). 모르는 이름은 null.</summary>
    public static DocKind? Find(string? name)
    {
        foreach (var kind in All)
        {
            if (string.Equals(Of(kind), name, StringComparison.Ordinal)) return kind;
        }
        return null;
    }

    /// <summary>정해 둔 서류만, 겹침 없이, 서류 차례로.</summary>
    internal static DocKind[] Normalize(IEnumerable<DocKind>? kinds)
    {
        var set = new HashSet<DocKind>(kinds ?? Enumerable.Empty<DocKind>());
        return All.Where(set.Contains).ToArray();
    }
}
