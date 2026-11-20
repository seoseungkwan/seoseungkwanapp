using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// [엑스레이]를 누르면 넣을 경과 글(AC-7505.3, 2026-11-20 오후 바꿈: 주사 차수와 따로).
/// 칸 글의 마지막 '/' 뒤 조각에 주사 'N차'가 있고 그 조각 부위가 하나이며 경과면 그 뒤에 띄어 'xr1년경과', 다른 경과 부위는 '어깨 xr2년경과'를 띄어 나온 차례대로.
/// 마지막 조각이 주사 차수가 아니면 MemoMerge 규칙(빈 칸 그대로, 글이 있으면 '/'). 칸에 이미 'xr'이 있으면 XrayAlreadyHas, 경과가 없으면 XrayNone.
/// 칸 글과 합쳐 50자를 넘으면 뒤쪽 경과 조각부터 빼고, 하나도 안 들어가면 전부를 그대로 돌려준다(칸에 못 쳐서 '넣지 못함'으로 직접 적을 글).
/// </summary>
public static class MemoCompose
{
    /// <summary>비트 '접수메모(당일)' 칸 최대 글자 수.</summary>
    public const int MaxLength = 50;

    private static readonly Regex SideHead = new Regex(@"^(오|왼|양)\)", RegexOptions.Compiled);

    /// <summary>칸 글에 'xr'(대소문자 무시)이 있는지.</summary>
    public static bool HasXray(string? memo) => (memo ?? "").IndexOf("xr", StringComparison.OrdinalIgnoreCase) >= 0;

    public static MemoResult ComposeXray(string? currentMemo, IReadOnlyList<XrayDue>? due)
    {
        var memo = currentMemo ?? "";
        if (HasXray(memo)) return new MemoResult(MemoResultKind.XrayAlreadyHas);
        if (due == null || due.Count == 0) return new MemoResult(MemoResultKind.XrayNone);

        var slash = memo.LastIndexOf('/');
        var last = (slash >= 0 ? memo.Substring(slash + 1) : memo).Trim();
        var afterInjection = last.Length > 0 && MemoMerge.HasInjectionCount(last);

        var rest = due.ToList();
        var pieces = new List<string>();
        if (afterInjection)
        {
            var own = PartsOfText(last);
            var same = own.Count == 1 ? rest.FirstOrDefault(d => d.Part == own[0]) : null;
            if (same != null)
            {
                pieces.Add(Suffix(same.Years));
                rest.Remove(same);
            }
        }
        pieces.AddRange(rest.Select(d => d.Part + " " + Suffix(d.Years)));

        string? first = null;
        string? firstAppend = null;
        while (pieces.Count > 0)
        {
            var text = string.Join(" ", pieces);
            var append = afterInjection ? (memo.EndsWith(" ", StringComparison.Ordinal) ? text : " " + text) : MemoMerge.AppendText(memo, text);
            first ??= text;
            firstAppend ??= append;
            if (memo.Length + append.Length <= MaxLength) return new MemoResult(MemoResultKind.Insert, text, append: append);
            pieces.RemoveAt(pieces.Count - 1);
        }
        return new MemoResult(MemoResultKind.Insert, first, append: firstAppend);
    }

    private static string Suffix(int years) => "xr" + years + "년경과";

    // 주사 글('오)무릎,발목 DNA 2차'·'오)무릎관절 3차')의 메모 부위들 — 경과 부위와 같은 방법(표의 다른 말도 같은 부위로)
    private static List<string> PartsOfText(string text)
    {
        var result = new List<string>();
        foreach (var hit in InjectionRule.PartHits(SideHead.Replace(text ?? "", ""), loose: true).OrderBy(hit => hit.Index))
        {
            var part = XrayParts.MemoPartOf(hit.Part);
            if (part != null && !result.Contains(part)) result.Add(part);
        }
        return result;
    }
}
