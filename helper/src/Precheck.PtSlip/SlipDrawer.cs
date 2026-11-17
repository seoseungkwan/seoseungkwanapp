using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Linq;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 'PT 후 진료' 종이 한 장 그리기(AC-6403.1·AC-6403.2, 시안 ⑥). 미리보기와 인쇄가 같은 Draw를 쓴다.
/// 칸 자리는 Core SlipLayout, 글씨 크기·줄 나눔은 Core SlipFitter가 정한다. 여기는 선과 글자만 그린다.
/// g는 mm 단위(PageUnit=Millimeter)라고 본다: SlipPrintJob이 그렇게 넘기고, Preview도 그렇게 맞춘다.
/// </summary>
public static class SlipDrawer
{
    public const string FontName = "Malgun Gothic";
    public const int PaperWidthMm = 100;

    private const float OuterLineMm = 0.35f;
    private const float LineMm = 0.3f;
    private const float HeadMaxPt = 16f;
    private const float HeadMinPt = 8f;
    private const float ValueMaxPt = 14f;
    private const float ValueMinPt = 8f;
    private const float LabelPt = 11f;
    /// <summary>시안 .head padding 0 3mm</summary>
    private const float HeadPadMm = 3f;
    /// <summary>시안 .v2 padding 0 2.5mm</summary>
    private const float ValuePadMm = 2.5f;
    /// <summary>시안 .k2 letter-spacing 1.4mm ('치 료 부 위' 모양)</summary>
    private const float LabelGapMm = 1.4f;
    /// <summary>이름표 칸 양옆에 남길 틈(글자 사이를 줄여서라도 칸 안에 둔다)</summary>
    private const float LabelPadMm = 1f;

    private static readonly Color PaperColor = Color.FromArgb(0xFB, 0xFB, 0xF7);
    private static readonly Color PaperEdge = Color.FromArgb(0xB8, 0xB8, 0xB0);

    /// <summary>폭 widthMm·길이 lengthMm 종이에 text를 그린다. 특이사항 값은 늘 빈칸이다(SlipText.Note).</summary>
    public static void Draw(Graphics g, SlipText text, float widthMm, float lengthMm)
    {
        if (g == null) throw new ArgumentNullException(nameof(g));
        if (text == null) throw new ArgumentNullException(nameof(text));

        var layout = SlipLayout.Of(widthMm, lengthMm);
        using var fonts = new FontSet();
        using var format = new StringFormat(StringFormat.GenericTypographic);
        format.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces | StringFormatFlags.NoWrap | StringFormatFlags.NoClip;
        format.LineAlignment = StringAlignment.Center;
        format.Alignment = StringAlignment.Near;
        using var outer = new Pen(Color.Black, OuterLineMm);
        using var line = new Pen(Color.Black, LineMm);

        var table = Rect(layout.Table);
        g.DrawRectangle(outer, table.X, table.Y, table.Width, table.Height);
        for (var i = 0; i < layout.Labels.Length; i++)
        {
            var label = Rect(layout.Labels[i]);
            var value = Rect(layout.Values[i]);
            g.DrawLine(line, table.Left, label.Top, table.Right, label.Top);
            g.DrawLine(line, value.Left, label.Top, value.Left, label.Bottom);
        }

        var head = Rect(layout.Head);
        DrawFitted(g, fonts, format, text.Head, Inset(head, HeadPadMm), HeadMaxPt, HeadMinPt);

        var labels = SlipText.LabelTexts;
        var values = new[] { text.Parts, text.Items, text.Note };
        for (var i = 0; i < layout.Labels.Length; i++)
        {
            if (i < labels.Count) DrawSpaced(g, fonts.Regular(LabelPt), format, labels[i], Rect(layout.Labels[i]));
            if (i < values.Length) DrawFitted(g, fonts, format, values[i], Inset(Rect(layout.Values[i]), ValuePadMm), ValueMaxPt, ValueMinPt);
        }
    }

    /// <summary>미리보기 그림(폭 pixelWidth px). 같은 Draw를 mm 단위로 부르고 종이 테두리만 점선으로 더한다.</summary>
    public static Bitmap Preview(SlipText text, float lengthMm, int pixelWidth)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (pixelWidth <= 0) throw new ArgumentOutOfRangeException(nameof(pixelWidth));
        var height = Math.Max(1, (int)Math.Round(lengthMm * pixelWidth / PaperWidthMm));
        // 그림의 해상도를 '폭 100mm = pixelWidth px'로 맞추면 mm·pt 단위가 그대로 줄어든다
        var dpi = pixelWidth * 25.4f / PaperWidthMm;
        var bitmap = new Bitmap(pixelWidth, height, PixelFormat.Format32bppArgb);
        try
        {
            bitmap.SetResolution(dpi, dpi);
            using var g = Graphics.FromImage(bitmap);
            g.Clear(PaperColor);
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.PageUnit = GraphicsUnit.Millimeter;
            Draw(g, text, PaperWidthMm, lengthMm);
            g.PageUnit = GraphicsUnit.Pixel;
            using var edge = new Pen(PaperEdge) { DashStyle = DashStyle.Dash };
            g.DrawRectangle(edge, 0, 0, pixelWidth - 1, height - 1);
            return bitmap;
        }
        catch
        {
            bitmap.Dispose();
            throw;
        }
    }

    /// <summary>값 글: 큰 글씨부터 줄여 한 줄, 안 되면 두 줄, 그래도 넘치면 최소 크기에서 '…'(Core SlipFitter). 칸 세로 가운데.</summary>
    private static void DrawFitted(Graphics g, FontSet fonts, StringFormat format, string? text, RectangleF box, float maxPt, float minPt)
    {
        if (string.IsNullOrEmpty(text) || box.Width <= 0 || box.Height <= 0) return;
        var fit = SlipFitter.Fit(text!, box.Width, box.Height, maxPt, minPt,
            (part, pt) => g.MeasureString(part, fonts.Bold(pt), PointF.Empty, format).Width);
        var font = fonts.Bold(fit.SizePt);
        var lineHeight = SlipFitter.LineHeightMm(fit.SizePt);
        var lines = fit.Lines;
        var top = box.Y + (box.Height - lineHeight * lines.Count) / 2f;
        // 줄 자리는 Core 줄 높이(1.2배)로 정하고, 그리는 칸은 글꼴 자체 줄 높이보다 넉넉히 둔다
        // (맑은 고딕 줄 높이는 약 1.33배라 1.2배 칸에 넣으면 GDI+가 그 줄을 그리지 않는다)
        var drawHeight = Math.Max(lineHeight, font.GetHeight(g)) * 2f;
        for (var i = 0; i < lines.Count; i++)
        {
            var middle = top + (i + 0.5f) * lineHeight;
            g.DrawString(lines[i], font, Brushes.Black, new RectangleF(box.X, middle - drawHeight / 2f, box.Width, drawHeight), format);
        }
    }

    /// <summary>이름표: 글자 사이를 띄워 칸 가운데에(시안 '치 료 부 위'). 칸이 좁으면 띄움만 줄인다.</summary>
    private static void DrawSpaced(Graphics g, Font font, StringFormat format, string label, RectangleF box)
    {
        var chars = (label ?? "").Where(c => !char.IsWhiteSpace(c)).Select(c => c.ToString()).ToArray();
        if (chars.Length == 0) return;
        var widths = chars.Select(c => g.MeasureString(c, font, PointF.Empty, format).Width).ToArray();
        var sum = widths.Sum();
        var gap = 0f;
        if (chars.Length > 1)
        {
            var room = (box.Width - 2 * LabelPadMm - sum) / (chars.Length - 1);
            gap = Math.Max(0f, Math.Min(LabelGapMm, room));
        }
        var x = box.X + (box.Width - (sum + gap * (chars.Length - 1))) / 2f;
        for (var i = 0; i < chars.Length; i++)
        {
            g.DrawString(chars[i], font, Brushes.Black, new RectangleF(x, box.Y, widths[i], box.Height), format);
            x += widths[i] + gap;
        }
    }

    private static RectangleF Rect(SlipBox box) => new RectangleF(box.X, box.Y, box.Width, box.Height);

    private static RectangleF Inset(RectangleF box, float sideMm) =>
        new RectangleF(box.X + sideMm, box.Y, Math.Max(0f, box.Width - 2 * sideMm), box.Height);

    /// <summary>한 번 그리는 동안 쓰는 맑은 고딕(크기별로 하나씩 만들어 두고 끝나면 버린다).</summary>
    private sealed class FontSet : IDisposable
    {
        private readonly Dictionary<(float Pt, bool Bold), Font> made = new Dictionary<(float Pt, bool Bold), Font>();

        public Font Bold(float pt) => Get(pt, true);

        public Font Regular(float pt) => Get(pt, false);

        private Font Get(float pt, bool bold)
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
