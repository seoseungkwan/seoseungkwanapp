using System;
using System.Collections.Generic;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>
/// 진료기록부 글 맞추기: 글씨 크기는 그대로 두고 칸 폭(mm) 안에서 줄을 나눈다. 폭은 DocContext.WidthMm(글, pt → mm)로 잰다.
/// 나눔은 들어가는 가장 긴 앞부분에서, 그 안에 빈칸이 있으면 마지막 빈칸에서(빈칸은 버림), 없으면 글자에서. 글자를 잃지 않는다.
/// </summary>
public static class ChartText
{
    private const float Epsilon = 0.001f;
    private const string Ellipsis = "…";

    /// <summary>글을 줄들로. 끝 빈칸은 뺀다. 빈 글은 빈 줄 하나. 한 글자도 안 들어가는 칸이면 한 글자씩.</summary>
    public static IReadOnlyList<string> Wrap(string? text, float widthMm, float pt, Func<string, float, float> measure)
    {
        if (measure == null) throw new ArgumentNullException(nameof(measure));
        var rest = (text ?? "").Replace("\r", "").Replace("\n", " ").Replace("\t", " ").TrimEnd();
        var lines = new List<string>();
        while (rest.Length > 0)
        {
            if (Fits(rest, widthMm, pt, measure))
            {
                lines.Add(rest);
                break;
            }
            var take = Longest(rest, widthMm, pt, measure);
            var cut = rest[take] == ' ' ? take : rest.LastIndexOf(' ', take - 1, take);
            if (cut > 0 && rest.Substring(0, cut).Trim().Length > 0)
            {
                lines.Add(rest.Substring(0, cut).TrimEnd());
                rest = rest.Substring(cut + 1).TrimStart();
            }
            else
            {
                lines.Add(rest.Substring(0, take));
                rest = rest.Substring(take).TrimStart();
            }
        }
        if (lines.Count == 0) lines.Add("");
        return lines;
    }

    /// <summary>들어가면 그대로, 아니면 끝을 줄이고 '…'를 붙인 들어가는 가장 긴 글(한 줄 칸용: 머리·쪽 아래).</summary>
    public static string Shorten(string? text, float widthMm, float pt, Func<string, float, float> measure)
    {
        if (measure == null) throw new ArgumentNullException(nameof(measure));
        var line = (text ?? "").Replace("\r", "").Replace("\n", " ").TrimEnd();
        if (Fits(line, widthMm, pt, measure)) return line;
        for (var take = line.Length - 1; take > 0; take--)
        {
            var candidate = line.Substring(0, take).TrimEnd() + Ellipsis;
            if (Fits(candidate, widthMm, pt, measure)) return candidate;
        }
        return "";
    }

    private static bool Fits(string line, float widthMm, float pt, Func<string, float, float> measure) => measure(line, pt) <= widthMm + Epsilon;

    /// <summary>들어가는 가장 긴 앞부분 글자 수(1 이상, 글 길이보다 짧음). 폭은 글자가 늘면 줄지 않는다고 보고 반씩 좁혀 찾는다.</summary>
    private static int Longest(string text, float widthMm, float pt, Func<string, float, float> measure)
    {
        var low = 1;
        var high = text.Length - 1;
        if (!Fits(text.Substring(0, 1), widthMm, pt, measure)) return 1;
        while (low < high)
        {
            var mid = (low + high + 1) / 2;
            if (Fits(text.Substring(0, mid), widthMm, pt, measure)) low = mid;
            else high = mid - 1;
        }
        return low;
    }
}
