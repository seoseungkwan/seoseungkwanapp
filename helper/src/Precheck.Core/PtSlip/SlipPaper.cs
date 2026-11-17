using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.PtSlip;

/// <summary>종이 위 네모 하나(mm, 왼쪽 위 기준).</summary>
public readonly struct SlipBox
{
    public SlipBox(float x, float y, float width, float height)
    {
        X = x;
        Y = y;
        Width = width;
        Height = height;
    }

    public float X { get; }

    public float Y { get; }

    public float Width { get; }

    public float Height { get; }

    public float Right => X + Width;

    public float Bottom => Y + Height;
}

/// <summary>
/// 종이 칸 나누기(AC-6403.1): 여백 4mm 안의 표, 줄 높이 머리 26%·부위 20%·항목 20%·특이사항 나머지, 이름표 칸은 표 폭 30%.
/// Labels·Values 차례는 0 부위·1 항목·2 특이사항(SlipText.LabelTexts와 같음). 미리보기와 인쇄가 같은 값을 쓴다.
/// </summary>
public sealed class SlipLayout
{
    public const float MarginMm = 4;
    public const float HeadShare = 0.26f;
    public const float RowShare = 0.20f;
    public const float LabelShare = 0.30f;

    private SlipLayout(SlipBox table, SlipBox head, SlipBox[] labels, SlipBox[] values)
    {
        Table = table;
        Head = head;
        Labels = labels;
        Values = values;
    }

    public SlipBox Table { get; }

    public SlipBox Head { get; }

    public SlipBox[] Labels { get; }

    public SlipBox[] Values { get; }

    public static SlipLayout Of(float widthMm, float lengthMm)
    {
        var table = new SlipBox(MarginMm, MarginMm, widthMm - 2 * MarginMm, lengthMm - 2 * MarginMm);
        var head = new SlipBox(table.X, table.Y, table.Width, table.Height * HeadShare);
        var labelWidth = table.Width * LabelShare;
        var labels = new SlipBox[3];
        var values = new SlipBox[3];
        var top = head.Bottom;
        for (var row = 0; row < 3; row++)
        {
            var height = row < 2 ? table.Height * RowShare : table.Bottom - top;
            labels[row] = new SlipBox(table.X, top, labelWidth, height);
            values[row] = new SlipBox(table.X + labelWidth, top, table.Right - (table.X + labelWidth), height);
            top += height;
        }
        return new SlipLayout(table, head, labels, values);
    }
}

/// <summary>종이에 찍을 글(AC-6403.1). 특이사항은 늘 빈칸(손으로 씀). 환자 값이 들어가므로 파일·로그에 남기지 않는다.</summary>
public sealed class SlipText
{
    private SlipText(string head, string parts, string items)
    {
        Head = head;
        Parts = parts;
        Items = items;
        Note = "";
    }

    /// <summary>이름표 글: 0 부위·1 항목·2 특이사항(SlipLayout.Labels 차례).</summary>
    public static IReadOnlyList<string> LabelTexts { get; } = new[] { "치료부위", "치료항목", "특이사항" };

    /// <summary>[시험 1장]용 빈 양식: 머리 괄호 안은 빈칸 6개씩.</summary>
    public static SlipText Blank { get; } = new SlipText("PT 후 진료 (      /      )", "", "");

    public string Head { get; }

    public string Parts { get; }

    public string Items { get; }

    public string Note { get; }

    public static SlipText Of(string chart, string name, SlipPicks picks)
    {
        if (picks == null) throw new ArgumentNullException(nameof(picks));
        return new SlipText("PT 후 진료 ( " + chart + " / " + name + " )", picks.PartsText, picks.ItemsText);
    }
}

/// <summary>칸에 맞춘 글: 글씨 크기(pt)와 줄(0~2줄).</summary>
public sealed class SlipFit
{
    public SlipFit(float sizePt, IReadOnlyList<string> lines)
    {
        SizePt = sizePt;
        Lines = lines ?? Array.Empty<string>();
    }

    public float SizePt { get; }

    public IReadOnlyList<string> Lines { get; }
}

/// <summary>
/// 칸에 글 맞추기(AC-6403.2): maxPt부터 0.5pt씩 줄여 한 줄에 들어가는 첫 크기. 없으면 다시 maxPt부터 두 줄(낱말 단위, 낱말 하나가 한 줄보다 길면 글자 단위).
/// 그래도 없으면 minPt 두 줄에 둘째 줄 끝을 '…'로 줄인다. 줄 높이 = pt × 1.2 × 0.3528mm. 글 폭은 widthMm(글, pt)이 잰다(윈도우 층의 실제 글꼴).
/// </summary>
public static class SlipFitter
{
    public const float StepPt = 0.5f;
    public const float LineSpacing = 1.2f;
    public const float MmPerPt = 0.3528f;
    private const float Epsilon = 0.001f;
    private const string Ellipsis = "…";

    public static float LineHeightMm(float pt) => pt * LineSpacing * MmPerPt;

    public static SlipFit Fit(string text, float boxW, float boxH, float maxPt, float minPt, Func<string, float, float> widthMm)
    {
        if (widthMm == null) throw new ArgumentNullException(nameof(widthMm));
        if (string.IsNullOrWhiteSpace(text)) return new SlipFit(maxPt, Array.Empty<string>());
        var sizes = Sizes(maxPt, minPt);

        foreach (var pt in sizes)
        {
            if (LineHeightMm(pt) <= boxH + Epsilon && Fits(text, pt, boxW, widthMm)) return new SlipFit(pt, new[] { text });
        }

        foreach (var pt in sizes)
        {
            if (2 * LineHeightMm(pt) > boxH + Epsilon) continue;
            var (first, rest) = SplitFirst(text, pt, boxW, widthMm);
            if (rest.Length > 0 && Fits(rest, pt, boxW, widthMm)) return new SlipFit(pt, new[] { first, rest });
        }

        var (line1, line2) = SplitFirst(text, minPt, boxW, widthMm);
        return line2.Length == 0
            ? new SlipFit(minPt, new[] { line1 })
            : new SlipFit(minPt, new[] { line1, Shorten(line2, minPt, boxW, widthMm) });
    }

    private static bool Fits(string line, float pt, float boxW, Func<string, float, float> widthMm) => widthMm(line, pt) <= boxW + Epsilon;

    /// <summary>maxPt, maxPt-0.5, … minPt 이상까지(빼기를 쌓지 않고 매번 maxPt에서 센다).</summary>
    private static float[] Sizes(float maxPt, float minPt)
    {
        var steps = Math.Max(0, (int)Math.Floor((maxPt - minPt) / StepPt + 0.0001f));
        return Enumerable.Range(0, steps + 1).Select(k => maxPt - StepPt * k).ToArray();
    }

    /// <summary>
    /// 첫 줄에 들어가는 만큼(낱말 단위, 빈칸에서 나눠 ', '의 쉼표는 첫 줄에 남음)과 나머지. 낱말 하나가 한 줄보다 길면 그 낱말을 글자 단위로 나눈다.
    /// 첫 줄이 비면 적어도 한 글자는 넣는다.
    /// </summary>
    private static (string First, string Remainder) SplitFirst(string text, float pt, float boxW, Func<string, float, float> widthMm)
    {
        var words = text.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        var line = "";
        for (var i = 0; i < words.Length; i++)
        {
            var word = words[i];
            var candidate = line.Length == 0 ? word : line + " " + word;
            if (Fits(candidate, pt, boxW, widthMm))
            {
                line = candidate;
                continue;
            }
            if (line.Length > 0 && Fits(word, pt, boxW, widthMm)) return (line, string.Join(" ", words.Skip(i)));

            var prefix = line.Length == 0 ? "" : line + " ";
            var take = 0;
            while (take < word.Length && Fits(prefix + word.Substring(0, take + 1), pt, boxW, widthMm)) take++;
            if (take == 0)
            {
                if (line.Length > 0) return (line, string.Join(" ", words.Skip(i)));
                take = 1;
            }
            var rest = string.Join(" ", new[] { word.Substring(take) }.Concat(words.Skip(i + 1)).Where(part => part.Length > 0));
            return (prefix + word.Substring(0, take), rest);
        }
        return (line, "");
    }

    /// <summary>들어가면 그대로, 아니면 끝을 줄이고(끝 빈칸·쉼표 뺌) '…'를 붙여 들어가는 가장 긴 글.</summary>
    private static string Shorten(string line, float pt, float boxW, Func<string, float, float> widthMm)
    {
        if (Fits(line, pt, boxW, widthMm)) return line;
        for (var take = line.Length - 1; take > 0; take--)
        {
            var candidate = line.Substring(0, take).TrimEnd(' ', ',') + Ellipsis;
            if (Fits(candidate, pt, boxW, widthMm)) return candidate;
        }
        return Ellipsis;
    }
}

/// <summary>
/// 비트 창에 붙는 [PT 먼저] 버튼(AC-6403.3)의 판단. 비트 프로그램 이름 규칙은 Precheck.Windows.InstallationLocator.LooksLikeDrBitProcess와 같다.
/// 버튼은 가로 MinWindowWidth 이상인 비트 창이 맨 앞일 때만 보이고(창 찾기는 윈도우 층), 자리는 Place가 정한다.
/// </summary>
public static class SlipButton
{
    /// <summary>버튼을 붙이는 비트 창의 가장 작은 가로(px).</summary>
    public const int MinWindowWidth = 600;

    /// <summary>창 오른쪽 끝에서 비워 두는 폭(최소화·최대화·닫기 단추 자리, px).</summary>
    public const int RightGapPx = 150;

    /// <summary>창 위에서 내려오는 폭(px).</summary>
    public const int TopGapPx = 4;

    /// <summary>BIT로 시작, pBITNewMenu, DrBIT로 시작(DrBitExport로 시작하는 것은 뺌). 대소문자 무시.</summary>
    public static bool IsBitProcess(string? processName)
    {
        if (string.IsNullOrEmpty(processName)) return false;
        var name = processName!;
        return name.StartsWith("BIT", StringComparison.OrdinalIgnoreCase)
            || name.Equals("pBITNewMenu", StringComparison.OrdinalIgnoreCase)
            || (name.StartsWith("DrBIT", StringComparison.OrdinalIgnoreCase) && !name.StartsWith("DrBitExport", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>버튼 왼쪽 위(화면 px): 창 오른쪽 끝 - 150 - 버튼 폭 - 버튼 자리, 창 위 + 4. 버튼 자리 +는 왼쪽으로.</summary>
    public static (int X, int Y) Place(int windowRight, int windowTop, int buttonWidth, int offset) =>
        (windowRight - RightGapPx - buttonWidth - offset, windowTop + TopGapPx);
}
