using System;
using System.Collections.Generic;
using System.Text;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>
/// 영수증 쪽 그리기 글 모으기(mm). 글은 칸 안 좌우 여백(Pad)을 뺀 폭에 맞춘다: 글씨를 StepPt씩 줄이다 MinPt에서도 길면 끝을 '…'로 줄인다.
/// 폭은 DocContext.WidthMm(윈도우 층의 실제 맑은 고딕)으로 잰다. 여러 줄 글(Paragraphs)은 낱말 단위로 나누고, 낱말 하나가 길면 글자 단위로 나눈다.
/// </summary>
internal sealed class PageBuilder
{
    public const float Pad = 0.8f;
    public const float MinPt = 4.5f;
    public const float StepPt = 0.25f;
    public const float Thin = 0.15f;
    public const float Normal = 0.25f;
    public const float Thick = 0.4f;
    private const float MmPerPt = 0.3528f;
    private const string Ellipsis = "…";

    private readonly Func<string, float, float> width;
    private readonly List<DocOp> ops = new List<DocOp>();

    public PageBuilder(Func<string, float, float> width)
    {
        this.width = width ?? throw new ArgumentNullException(nameof(width));
    }

    public IReadOnlyList<DocOp> Ops => ops;

    public void Line(float x1, float y1, float x2, float y2, float stroke) => ops.Add(DocOp.Line(x1, y1, x2, y2, stroke));

    public void Box(float x, float y, float w, float h, float stroke) => ops.Add(DocOp.Box(x, y, w, h, stroke));

    public void Image(float x, float y, float w, float h, string key) => ops.Add(DocOp.Image(x, y, w, h, key));

    /// <summary>칸(x,y,w,h) 안에 한 줄. 빈 글은 그리지 않는다.</summary>
    public void Text(float x, float y, float w, float h, string? text, float pt, bool bold = false, DocAlign align = DocAlign.Center)
    {
        var value = (text ?? "").Trim();
        if (value.Length == 0) return;
        var room = w - (2 * Pad);
        var fit = Fit(value, room, pt);
        ops.Add(DocOp.Text(x + Pad, y, room, h, fit.Text, fit.Pt, bold, align));
    }

    /// <summary>세로로 한 글자씩(칸 가운데에 모아서).</summary>
    public void Stack(float x, float y, float w, float h, string text, float pt)
    {
        var cell = Math.Min(h / Math.Max(1, text.Length), pt * MmPerPt * 1.7f);
        var top = y + ((h - (cell * text.Length)) / 2);
        for (var i = 0; i < text.Length; i++) Text(x, top + (i * cell), w, cell, text[i].ToString(), pt);
    }

    /// <summary>문단들을 칸 폭에 맞춰 줄 나눔해 위에서부터. 바닥(bottom)을 넘으면 글씨를 줄여 다시 하고, MinPt에서도 넘는 줄은 그리지 않는다.</summary>
    public void Paragraphs(float x, float y, float w, float bottom, IEnumerable<string> paragraphs, float pt)
    {
        var room = w - (2 * Pad);
        var texts = new List<string>(paragraphs);
        var size = pt;
        List<string> lines;
        while (true)
        {
            lines = new List<string>();
            foreach (var paragraph in texts) lines.AddRange(Wrap(paragraph, room, size));
            if (y + (lines.Count * LineHeight(size)) <= bottom || size - StepPt < MinPt) break;
            size -= StepPt;
        }
        var line = y;
        foreach (var text in lines)
        {
            var h = LineHeight(size);
            if (line + h > bottom) break;
            ops.Add(DocOp.Text(x + Pad, line, room, h, text, size));
            line += h;
        }
    }

    /// <summary>여러 줄 글 줄 높이: 맑은 고딕 한 줄 높이(약 1.33em)보다 넉넉히(칸이 글 높이보다 낮으면 GDI+가 글을 잘라 안 그린다).</summary>
    private static float LineHeight(float pt) => pt * MmPerPt * 1.4f;

    private (string Text, float Pt) Fit(string text, float room, float maxPt)
    {
        for (var pt = maxPt; pt >= MinPt - 0.001f; pt -= StepPt)
        {
            if (width(text, pt) <= room) return (text, pt);
        }
        var cut = text.Length;
        while (cut > 0 && width(text.Substring(0, cut).TrimEnd() + Ellipsis, MinPt) > room) cut--;
        return (cut == 0 ? Ellipsis : text.Substring(0, cut).TrimEnd() + Ellipsis, MinPt);
    }

    /// <summary>낱말 단위 줄 나눔(빈칸에서), 한 줄보다 긴 낱말은 글자 단위로.</summary>
    private List<string> Wrap(string text, float room, float pt)
    {
        var lines = new List<string>();
        var current = new StringBuilder();
        foreach (var word in (text ?? "").Split(' '))
        {
            if (word.Length == 0) continue;
            var candidate = current.Length == 0 ? word : current + " " + word;
            if (width(candidate, pt) <= room)
            {
                current.Clear().Append(candidate);
                continue;
            }
            if (current.Length > 0) lines.Add(current.ToString());
            current.Clear();
            var rest = word;
            while (width(rest, pt) > room && rest.Length > 1)
            {
                var take = rest.Length - 1;
                while (take > 1 && width(rest.Substring(0, take), pt) > room) take--;
                lines.Add(rest.Substring(0, take));
                rest = rest.Substring(take);
            }
            current.Append(rest);
        }
        if (current.Length > 0) lines.Add(current.ToString());
        return lines;
    }
}
