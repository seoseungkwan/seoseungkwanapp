using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using Precheck.Core.DocPrint;

namespace Precheck.PtSlip;

/// <summary>
/// 서류 한 쪽 그리기(spec doc-print TASK-3): Core DocPage의 그리기 글(DocOp)을 차례대로 Graphics에 옮긴다.
/// g는 mm 단위이고 (0,0)이 종이 왼쪽 위다(DocPrintJob.Send가 그렇게 넘긴다). 글꼴은 맑은 고딕 하나.
/// Text는 칸 안 한 줄·세로 가운데·가로 Align, Line·Box는 StrokeMm 굵기, Image는 그 쪽 Images[Key] 그림을 칸에 맞춰(못 읽으면 건너뜀).
/// 줄 나눔·글씨 줄이기는 Core가 WidthMm(같은 글꼴·같은 글 모양으로 재는 함수)로 미리 한다. 환자 값은 그리기만 하고 남기지 않는다.
/// </summary>
public static class DocDrawer
{
    public const string FontName = "Malgun Gothic";

    /// <summary>글 폭을 재는 해상도. 레이저 프린터·PDF 드라이버(600dpi)와 같은 격자로 재야 인쇄한 글 폭과 맞는다</summary>
    private const float MeasureDpi = 600f;

    /// <summary>스레드마다 하나(쪽 계획은 백그라운드에서 만든다). 그 스레드가 끝날 때까지 둔다</summary>
    [ThreadStatic]
    private static Measurer? measurer;

    /// <summary>한 쪽을 그린다. 모르는 글 종류·빈 글·0 이하 크기는 건너뛴다.</summary>
    public static void Draw(Graphics g, DocPage page)
    {
        if (g == null) throw new ArgumentNullException(nameof(g));
        if (page == null) throw new ArgumentNullException(nameof(page));
        using var fonts = new FontSet();
        var formats = new Dictionary<DocAlign, StringFormat>();
        try
        {
            foreach (var op in page.Ops)
            {
                switch (op.Kind)
                {
                    case DocOpKind.Text:
                        if (!formats.TryGetValue(op.Align, out var format))
                        {
                            format = TextFormat(op.Align);
                            formats[op.Align] = format;
                        }
                        DrawText(g, fonts, format, op);
                        break;
                    case DocOpKind.Line:
                        using (var pen = new Pen(Color.Black, Math.Max(0f, op.StrokeMm)))
                        {
                            g.DrawLine(pen, op.X, op.Y, op.X2, op.Y2);
                        }
                        break;
                    case DocOpKind.Box:
                        using (var pen = new Pen(Color.Black, Math.Max(0f, op.StrokeMm)))
                        {
                            g.DrawRectangle(pen, Math.Min(op.X, op.X2), Math.Min(op.Y, op.Y2), Math.Abs(op.Width), Math.Abs(op.Height));
                        }
                        break;
                    case DocOpKind.Image:
                        DrawImage(g, page.ImageOf(op.Key), op);
                        break;
                }
            }
        }
        finally
        {
            foreach (var format in formats.Values) format.Dispose();
        }
    }

    /// <summary>
    /// 글 폭(mm): 그리기와 같은 맑은 고딕(보통 굵기)·같은 글 모양(GenericTypographic, 뒤 빈칸까지)으로 잰다. DocContext.WidthMm로 넘긴다.
    /// 아무 스레드에서나 불러도 된다(스레드마다 따로 잰다).
    /// </summary>
    public static float WidthMm(string text, float pt)
    {
        if (string.IsNullOrEmpty(text) || pt <= 0f) return 0f;
        var m = measurer ??= new Measurer();
        return m.Graphics.MeasureString(text, m.Fonts.Get(pt, false), PointF.Empty, m.Format).Width;
    }

    /// <summary>칸 세로 가운데에 한 줄. 그리는 칸은 글꼴 줄 높이보다 넉넉히 둔다(맑은 고딕 줄 높이가 칸보다 크면 GDI+가 그 줄을 그리지 않는다, SlipDrawer와 같다)</summary>
    private static void DrawText(Graphics g, FontSet fonts, StringFormat format, DocOp op)
    {
        if (string.IsNullOrEmpty(op.Value) || op.Pt <= 0f || op.Width <= 0f) return;
        var font = fonts.Get(op.Pt, op.Bold);
        var middle = op.Y + op.Height / 2f;
        var drawHeight = Math.Max(Math.Max(op.Height, 0f), font.GetHeight(g)) * 2f;
        g.DrawString(op.Value, font, Brushes.Black, new RectangleF(op.X, middle - drawHeight / 2f, op.Width, drawHeight), format);
    }

    /// <summary>그림 바이트 → 칸에 맞춰 그림. 비었거나 그림이 아니면 아무것도 그리지 않는다</summary>
    private static void DrawImage(Graphics g, byte[]? bytes, DocOp op)
    {
        if (bytes == null || bytes.Length == 0 || op.Width <= 0f || op.Height <= 0f) return;
        try
        {
            using var stream = new MemoryStream(bytes, false);
            using var image = Image.FromStream(stream, false, true);
            g.DrawImage(image, new RectangleF(op.X, op.Y, op.Width, op.Height));
        }
        catch (Exception e) when (e is ArgumentException || e is OutOfMemoryException || e is ExternalException || e is IOException)
        {
            // 읽지 못하는 그림은 건너뛴다(쪽의 나머지는 그대로 그린다)
        }
    }

    /// <summary>한 줄·안 접음·뒤 빈칸까지 재는 글 모양. 세로 가운데, 가로는 Align</summary>
    private static StringFormat TextFormat(DocAlign align)
    {
        var format = new StringFormat(StringFormat.GenericTypographic);
        format.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces | StringFormatFlags.NoWrap | StringFormatFlags.NoClip;
        format.Trimming = StringTrimming.None;
        format.LineAlignment = StringAlignment.Center;
        format.Alignment = align == DocAlign.Center ? StringAlignment.Center : align == DocAlign.Right ? StringAlignment.Far : StringAlignment.Near;
        return format;
    }

    /// <summary>글 폭 재기 도구(1×1 그림, 600dpi, mm 단위)</summary>
    private sealed class Measurer
    {
        public Measurer()
        {
            var bitmap = new Bitmap(1, 1);
            bitmap.SetResolution(MeasureDpi, MeasureDpi);
            Graphics = Graphics.FromImage(bitmap);
            Graphics.PageUnit = GraphicsUnit.Millimeter;
        }

        public Graphics Graphics { get; }

        public FontSet Fonts { get; } = new FontSet();

        public StringFormat Format { get; } = TextFormat(DocAlign.Left);
    }

    /// <summary>크기·굵기별 맑은 고딕(한 번 만들어 두고 끝나면 버린다)</summary>
    private sealed class FontSet : IDisposable
    {
        private readonly Dictionary<(float Pt, bool Bold), Font> made = new Dictionary<(float Pt, bool Bold), Font>();

        public Font Get(float pt, bool bold)
        {
            if (made.TryGetValue((pt, bold), out var font)) return font;
            font = new Font(FontName, pt, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
            made[(pt, bold)] = font;
            return font;
        }

        public void Dispose()
        {
            foreach (var font in made.Values) font.Dispose();
            made.Clear();
        }
    }
}
