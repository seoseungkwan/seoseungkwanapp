using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// [엑스레이] 창 [넣기] 한 번에 넣을 경과 글(AC-7505.3, 2026-11-20 오후 바꿈: 부위 하나씩).
/// 칸 글의 마지막 '/' 뒤 조각에 주사 'N차'가 있으면 띄어 붙인다. 그 조각의 주사 부위가 그 부위 하나이고 조각이 'N차'로 끝나면 'xrN년경과'만,
/// 아니면 '&lt;부위&gt; xrN년경과'(다른 부위 경과가 먼저 붙은 뒤라도 주사 부위가 이름 없이 붙지 않게). 마지막 조각이 주사 차수가 아니면 MemoMerge 규칙('/').
/// 칸에 그 부위 경과 글이 이미 있으면 XrayAlreadyHas. 칸 글과 합쳐 50자를 넘어도 글을 그대로 돌려준다(칸에 못 쳐서 '넣지 못함'으로 직접 적을 글).
/// </summary>
public static class MemoCompose
{
    /// <summary>비트 '접수메모(당일)' 칸 최대 글자 수.</summary>
    public const int MaxLength = 50;

    private static readonly Regex SideHead = new Regex(@"^(오|왼|양)\)", RegexOptions.Compiled);

    private static readonly Regex CountAt = new Regex(@"\d{1,2}\s*차", RegexOptions.Compiled);

    private static readonly Regex XrHead = new Regex(@"^\s*xr", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// 칸에 그 부위 경과 글이 있나: '&lt;부위&gt; xr'(부위 앞이 한글이 아님 — '발목'의 '목'은 아님, 대소문자 무시) 또는
    /// 마지막 조각이 그 부위 하나의 주사 차수이고 'N차' 바로 뒤가 'xr'.
    /// </summary>
    public static bool HasXrayFor(string? currentMemo, string part)
    {
        var memo = currentMemo ?? "";
        if (string.IsNullOrEmpty(part)) return false;
        if (Regex.IsMatch(memo, "(?<![가-힣])" + Regex.Escape(part) + @"\s*xr", RegexOptions.IgnoreCase)) return true;
        var own = OwnInjection(memo);
        return own != null && own.Value.Part == part && XrHead.IsMatch(own.Value.After);
    }

    public static MemoResult ComposeXrayPart(string? currentMemo, string part, int years)
    {
        var memo = currentMemo ?? "";
        if (HasXrayFor(memo, part)) return new MemoResult(MemoResultKind.XrayAlreadyHas);

        var slash = memo.LastIndexOf('/');
        var last = (slash >= 0 ? memo.Substring(slash + 1) : memo).Trim();
        if (last.Length == 0 || !MemoMerge.HasInjectionCount(last))
        {
            var piece = part + " " + Suffix(years);
            return new MemoResult(MemoResultKind.Insert, piece, append: MemoMerge.AppendText(memo, piece));
        }

        var own = OwnInjection(memo);
        var text = own != null && own.Value.Part == part && own.Value.After.Trim().Length == 0 ? Suffix(years) : part + " " + Suffix(years);
        var append = memo.EndsWith(" ", StringComparison.Ordinal) ? text : " " + text;
        return new MemoResult(MemoResultKind.Insert, text, append: append);
    }

    // 마지막 '/' 뒤 조각이 주사 차수면 'N차'까지의 주사 부위(하나일 때만, 아니면 "")와 'N차' 뒤 글. 주사 차수가 아니면 null
    private static (string Part, string After)? OwnInjection(string memo)
    {
        var slash = memo.LastIndexOf('/');
        var last = slash >= 0 ? memo.Substring(slash + 1) : memo;
        if (last.Trim().Length == 0 || !MemoMerge.HasInjectionCount(last)) return null;
        var count = CountAt.Match(last);
        if (!count.Success) return null;
        var parts = PartsOfText(last.Substring(0, count.Index + count.Length).Trim());
        return (parts.Count == 1 ? parts[0] : "", last.Substring(count.Index + count.Length));
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
