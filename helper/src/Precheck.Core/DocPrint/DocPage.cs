using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.DocPrint;

/// <summary>그리기 글 종류.</summary>
public enum DocOpKind
{
    Text,
    Line,
    Box,
    Image,
}

/// <summary>글 가로 맞춤(칸 안).</summary>
public enum DocAlign
{
    Left,
    Center,
    Right,
}

/// <summary>
/// 쪽 위 그리기 글 하나(spec doc-print). 자리는 모두 mm, A4 왼쪽 위 기준. 윈도우 층 DocDrawer가 그대로 그린다(맑은 고딕).
/// Text: 칸(X,Y,Width,Height) 안에 한 줄, 세로 가운데·가로 Align, 글씨 Pt·Bold. 줄 나눔·글씨 줄이기는 Core가 미리 한다(DocContext.WidthMm로 재서).
/// Line: (X,Y)→(X2,Y2), 굵기 StrokeMm. Box: 테두리만, 굵기 StrokeMm. Image: 칸에 맞춰 그 쪽 Images[Key] 그림(없으면 안 그림).
/// </summary>
public sealed class DocOp
{
    private DocOp(DocOpKind kind, float x, float y, float x2, float y2, string value, float pt, bool bold, DocAlign align, float strokeMm, string key)
    {
        Kind = kind;
        X = x;
        Y = y;
        X2 = x2;
        Y2 = y2;
        Value = value ?? "";
        Pt = pt;
        Bold = bold;
        Align = align;
        StrokeMm = strokeMm;
        Key = key ?? "";
    }

    public DocOpKind Kind { get; }

    public float X { get; }

    public float Y { get; }

    /// <summary>Line은 끝 점, 그 밖은 칸 오른쪽(X + Width).</summary>
    public float X2 { get; }

    /// <summary>Line은 끝 점, 그 밖은 칸 아래(Y + Height).</summary>
    public float Y2 { get; }

    public float Width => X2 - X;

    public float Height => Y2 - Y;

    /// <summary>Text의 글(그 밖은 빈 글).</summary>
    public string Value { get; }

    public float Pt { get; }

    public bool Bold { get; }

    public DocAlign Align { get; }

    /// <summary>Line·Box 선 굵기(mm).</summary>
    public float StrokeMm { get; }

    /// <summary>Image가 찾을 그림 이름(DocPage.Images의 열쇠).</summary>
    public string Key { get; }

    public static DocOp Text(float x, float y, float width, float height, string text, float pt, bool bold = false, DocAlign align = DocAlign.Left) =>
        new DocOp(DocOpKind.Text, x, y, x + width, y + height, text, pt, bold, align, 0, "");

    public static DocOp Line(float x1, float y1, float x2, float y2, float widthMm) =>
        new DocOp(DocOpKind.Line, x1, y1, x2, y2, "", 0, false, DocAlign.Left, widthMm, "");

    public static DocOp Box(float x, float y, float width, float height, float widthMm) =>
        new DocOp(DocOpKind.Box, x, y, x + width, y + height, "", 0, false, DocAlign.Left, widthMm, "");

    public static DocOp Image(float x, float y, float width, float height, string key) =>
        new DocOp(DocOpKind.Image, x, y, x + width, y + height, "", 0, false, DocAlign.Left, 0, key);
}

/// <summary>A4 한 쪽(210×297mm): 그리기 글 차례대로와 그 쪽이 쓰는 그림(열쇠 → 그림 파일 바이트, 예: DocContext.SealKey → 병원 직인).</summary>
public sealed class DocPage
{
    public const float WidthMm = 210f;
    public const float HeightMm = 297f;

    private static readonly IReadOnlyDictionary<string, byte[]> NoImages = new Dictionary<string, byte[]>(StringComparer.Ordinal);

    public DocPage(IEnumerable<DocOp> ops, IReadOnlyDictionary<string, byte[]>? images = null)
    {
        Ops = (ops ?? Enumerable.Empty<DocOp>()).Where(op => op != null).ToArray();
        Images = images ?? NoImages;
    }

    public IReadOnlyList<DocOp> Ops { get; }

    public IReadOnlyDictionary<string, byte[]> Images { get; }

    /// <summary>그 열쇠의 그림, 없으면 null.</summary>
    public byte[]? ImageOf(string key) => key != null && Images.TryGetValue(key, out var image) ? image : null;
}
