using System;
using System.Collections.Generic;
using Precheck.Core.PtSlip;
using Xunit;

namespace Precheck.Core.Tests.PtSlip;

/// <summary>
/// spec pt-slip REQ-6403: 종이 칸 나누기(SlipLayout), 종이 글(SlipText), 칸에 글 맞추기(SlipFitter), 비트 창 버튼 자리(SlipButton).
/// 글 폭은 가짜 재기(글자 수 × pt × 0.2mm)로 본다. 실제 글꼴 재기는 윈도우 층(SlipDrawer)이 넘긴다.
/// </summary>
public class SlipPaperTests
{
    private const float Tolerance = 0.001f;

    /// <summary>가짜 글 폭: 한 글자에 pt × 0.2mm.</summary>
    private static readonly Func<string, float, float> Width = (text, pt) => text.Length * pt * 0.2f;

    private static void Near(float expected, float actual, string what) =>
        Assert.True(Math.Abs(expected - actual) < Tolerance, what + ": " + expected + " ≠ " + actual);

    private static void Box(SlipBox box, float x, float y, float width, float height, string what)
    {
        Near(x, box.X, what + " X");
        Near(y, box.Y, what + " Y");
        Near(width, box.Width, what + " Width");
        Near(height, box.Height, what + " Height");
    }

    // ── AC-6403.1 종이 칸·글 ─────────────────────────────

    [Fact(DisplayName = "AC-6403.1 폭 100·길이 60mm: 여백 4mm 표, 머리 26%·부위 20%·항목 20%·특이사항 나머지, 이름표 칸 30%")]
    public void LayoutFor60()
    {
        var layout = SlipLayout.Of(100, 60);
        Box(layout.Table, 4, 4, 92, 52, "Table");
        Box(layout.Head, 4, 4, 92, 13.52f, "Head");
        Assert.Equal(3, layout.Labels.Length);
        Assert.Equal(3, layout.Values.Length);
        Box(layout.Labels[0], 4, 17.52f, 27.6f, 10.4f, "부위 이름표");
        Box(layout.Values[0], 31.6f, 17.52f, 64.4f, 10.4f, "부위 값");
        Box(layout.Labels[1], 4, 27.92f, 27.6f, 10.4f, "항목 이름표");
        Box(layout.Values[1], 31.6f, 27.92f, 64.4f, 10.4f, "항목 값");
        Box(layout.Labels[2], 4, 38.32f, 27.6f, 17.68f, "특이사항 이름표");
        Box(layout.Values[2], 31.6f, 38.32f, 64.4f, 17.68f, "특이사항 값");
    }

    [Theory(DisplayName = "AC-6403.1 다른 길이도 같은 비율로 나누고, 줄은 빈틈 없이 이어져 표 아래 끝까지 간다")]
    [InlineData(100, 40)]
    [InlineData(100, 80)]
    [InlineData(100, 150)]
    [InlineData(80, 60)]
    public void LayoutScales(float width, float length)
    {
        var layout = SlipLayout.Of(width, length);
        var table = layout.Table;
        Box(table, 4, 4, width - 8, length - 8, "Table");
        Near(table.Height * 0.26f, layout.Head.Height, "Head 높이");
        Near(table.Height * 0.20f, layout.Labels[0].Height, "부위 높이");
        Near(table.Height * 0.20f, layout.Labels[1].Height, "항목 높이");
        Near(table.Height * 0.34f, layout.Labels[2].Height, "특이사항 높이");

        var top = layout.Head.Y + layout.Head.Height;
        for (var row = 0; row < 3; row++)
        {
            Near(top, layout.Labels[row].Y, "줄 " + row + " 위");
            Near(layout.Labels[row].Y, layout.Values[row].Y, "줄 " + row + " 값 위");
            Near(layout.Labels[row].Height, layout.Values[row].Height, "줄 " + row + " 값 높이");
            Near(table.X, layout.Labels[row].X, "줄 " + row + " 이름표 왼쪽");
            Near(table.Width * 0.3f, layout.Labels[row].Width, "줄 " + row + " 이름표 폭");
            Near(table.X + table.Width * 0.3f, layout.Values[row].X, "줄 " + row + " 값 왼쪽");
            Near(table.Width * 0.7f, layout.Values[row].Width, "줄 " + row + " 값 폭");
            top += layout.Labels[row].Height;
        }
        Near(table.Y + table.Height, top, "표 아래 끝");
    }

    [Fact(DisplayName = "AC-6403.1 종이 글: 머리 'PT 후 진료 ( <차트번호> / <이름> )', 부위·항목은 고른 차례, 특이사항은 늘 빈칸")]
    public void SlipTextFromPicks()
    {
        var picks = new SlipPicks();
        picks.ToggleItem("HP");
        picks.ToggleItem("ICT");
        picks.ToggleItem("견인");
        picks.ToggleSide("오른");
        picks.AddPart("어깨");
        picks.AddPart("허리");

        var text = SlipText.Of("90001", "가상환자01", picks);
        Assert.Equal("PT 후 진료 ( 90001 / 가상환자01 )", text.Head);
        Assert.Equal("오른 어깨, 허리", text.Parts);
        Assert.Equal("HP, ICT, 견인", text.Items);
        Assert.Equal("", text.Note);
        Assert.Equal(new[] { "치료부위", "치료항목", "특이사항" }, SlipText.LabelTexts);
    }

    [Fact(DisplayName = "AC-6403.1 [시험 1장]은 빈 양식: 머리 'PT 후 진료 (      /      )', 나머지 칸 빈칸")]
    public void BlankSlip()
    {
        var blank = SlipText.Blank;
        Assert.Equal("PT 후 진료 (" + new string(' ', 6) + "/" + new string(' ', 6) + ")", blank.Head);
        Assert.Equal("", blank.Parts);
        Assert.Equal("", blank.Items);
        Assert.Equal("", blank.Note);
    }

    // ── AC-6403.2 칸에 글 맞추기 ─────────────────────────────

    [Fact(DisplayName = "AC-6403.2 칸에 들어가면 가장 큰 글씨 한 줄")]
    public void ShortTextAtMaxSize()
    {
        var fit = SlipFitter.Fit("HP, ICT", 64.4f, 10.4f, 14, 8, Width);
        Near(14, fit.SizePt, "크기");
        Assert.Equal(new[] { "HP, ICT" }, fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 폭이 넘치면 0.5pt씩 줄여 한 줄에 들어가는 가장 큰 크기")]
    public void ShrinksForWidth()
    {
        // 20글자: 폭 = 4 × pt ≤ 50 → 12.5pt
        var fit = SlipFitter.Fit("aaaa, bbbb, cccc, dd", 50, 10.4f, 14, 8, Width);
        Near(12.5f, fit.SizePt, "크기");
        Assert.Equal(new[] { "aaaa, bbbb, cccc, dd" }, fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 줄 높이(pt × 1.2 × 0.3528mm)가 칸보다 높으면 그만큼 줄인다")]
    public void ShrinksForHeight()
    {
        // 칸 높이 5mm: 12pt = 5.08mm(넘침), 11.5pt = 4.87mm
        var fit = SlipFitter.Fit("HP", 64.4f, 5, 14, 8, Width);
        Near(11.5f, fit.SizePt, "크기");
        Assert.Equal(new[] { "HP" }, fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 한 줄로 안 되면 큰 글씨부터 두 줄(', ' 뒤에서 낱말 단위로 나눔, 두 줄 높이도 칸 안)")]
    public void TwoLinesAtWords()
    {
        // 한 줄은 8pt에서도 넘침(22글자 × 1.6 = 35.2 > 30). 두 줄 높이: 12.5pt = 10.58mm(넘침), 12pt = 10.16mm
        var fit = SlipFitter.Fit("aaaa, bbbb, cccc, dddd", 30, 10.4f, 14, 8, Width);
        Near(12, fit.SizePt, "크기");
        Assert.Equal(new[] { "aaaa, bbbb,", "cccc, dddd" }, fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 낱말 하나가 한 줄보다 길면 글자 단위로 나눈다")]
    public void TwoLinesAtLetters()
    {
        // 빈칸 없는 26글자. 12pt는 한 줄 12글자(두 줄 24 < 26), 11.5pt는 한 줄 13글자
        var fit = SlipFitter.Fit("abcdefghijklmnopqrstuvwxyz", 30.5f, 10.4f, 14, 8, Width);
        Near(11.5f, fit.SizePt, "크기");
        Assert.Equal(new[] { "abcdefghijklm", "nopqrstuvwxyz" }, fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 두 줄로도 넘치면 가장 작은 글씨 두 줄, 둘째 줄 끝을 '…'로 줄인다")]
    public void EllipsisAtMinSize()
    {
        // 8pt 한 줄 19글자(30.4mm). 첫 줄 'aaaa, bbbb, cccc,'(17), 둘째 줄은 '…'를 붙여 19글자 안
        var fit = SlipFitter.Fit("aaaa, bbbb, cccc, dddd, eeee, ffff, gggg, hhhh", 30.5f, 10.4f, 14, 8, Width);
        Near(8, fit.SizePt, "크기");
        Assert.Equal(2, fit.Lines.Count);
        Assert.Equal("aaaa, bbbb, cccc,", fit.Lines[0]);
        Assert.Equal("dddd, eeee, ffff…", fit.Lines[1]);
        Assert.All(fit.Lines, line => Assert.True(Width(line, 8) <= 30.5f, line));
    }

    [Fact(DisplayName = "AC-6403.2 빈 글은 가장 큰 크기·줄 없음")]
    public void EmptyText()
    {
        var fit = SlipFitter.Fit("", 64.4f, 10.4f, 14, 8, Width);
        Near(14, fit.SizePt, "크기");
        Assert.Empty(fit.Lines);
    }

    [Fact(DisplayName = "AC-6403.2 재는 함수는 줄 글과 pt를 받는다(실제 글꼴 재기를 넘길 수 있게)")]
    public void UsesGivenMeasure()
    {
        var asked = new List<(string Text, float Pt)>();
        Func<string, float, float> measure = (text, pt) =>
        {
            asked.Add((text, pt));
            return pt <= 10 ? 10 : 100;
        };
        var fit = SlipFitter.Fit("HP", 20, 10.4f, 14, 8, measure);
        Near(10, fit.SizePt, "크기");
        Assert.Equal(new[] { "HP" }, fit.Lines);
        Assert.Contains(("HP", 14f), asked);
        Assert.Contains(("HP", 10f), asked);
        Assert.DoesNotContain(asked, call => call.Pt < 10);
    }

    // ── AC-6403.3 비트 창 버튼 ─────────────────────────────

    [Theory(DisplayName = "AC-6403.3 비트 프로그램: BIT·DrBIT로 시작하거나 pBITNewMenu(대소문자 무시), DrBitExport는 아님")]
    [InlineData("BIT", true)]
    [InlineData("BITMain", true)]
    [InlineData("bitmenu", true)]
    [InlineData("pBITNewMenu", true)]
    [InlineData("PBITNEWMENU", true)]
    [InlineData("DrBIT", true)]
    [InlineData("DrBIT50", true)]
    [InlineData("drbitmain", true)]
    [InlineData("DrBitExport", false)]
    [InlineData("DRBITEXPORT2", false)]
    [InlineData("pBITNewMenu2", false)]
    [InlineData("xBIT", false)]
    [InlineData("notepad", false)]
    [InlineData("Dr", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void BitProcessNames(string? name, bool isBit)
    {
        Assert.Equal(isBit, SlipButton.IsBitProcess(name));
    }

    [Theory(DisplayName = "AC-6403.3 버튼 자리: 창 오른쪽 끝에서 150px + 버튼 폭 + 버튼 자리만큼 왼쪽, 창 위에서 4px 아래")]
    [InlineData(1920, 0, 80, 0, 1690, 4)]
    [InlineData(1000, 100, 90, 40, 720, 104)]
    [InlineData(1000, 100, 90, -40, 800, 104)]
    [InlineData(-200, -8, 80, 400, -830, -4)]
    public void ButtonPlace(int right, int top, int width, int offset, int x, int y)
    {
        var place = SlipButton.Place(right, top, width, offset);
        Assert.Equal(x, place.X);
        Assert.Equal(y, place.Y);
    }

    [Fact(DisplayName = "AC-6403.3 버튼은 가로 600px 이상인 비트 창에만 붙는다")]
    public void MinimumWindowWidth()
    {
        Assert.Equal(600, SlipButton.MinWindowWidth);
    }
}
