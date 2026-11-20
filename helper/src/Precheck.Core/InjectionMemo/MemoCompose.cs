using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 주사 차수 결과에 엑스레이 경과를 합친다(AC-7505.3).
/// 주사 글 부위가 하나이고 경과면 '오)무릎 3차 xr1년경과', 다른 경과 부위는 '어깨 xr2년경과'를 띄어 나온 차례대로.
/// 주사 글이 안 들어가는 경우에도 경과만 넣고 그 주사 쪽 결과는 Reason에 둔다. 칸에 이미 'xr'이 있으면 그대로.
/// 칸 글과 합쳐 50자를 넘으면 뒤쪽 경과 조각부터 뺀다(주사 글은 남김).
/// </summary>
public static class MemoCompose
{
    /// <summary>비트 '접수메모(당일)' 칸 최대 글자 수.</summary>
    public const int MaxLength = 50;

    private static readonly Regex SideHead = new Regex(@"^(오|왼|양)\)", RegexOptions.Compiled);

    /// <summary>칸 글에 'xr'(대소문자 무시)이 있는지.</summary>
    public static bool HasXray(string? memo) => (memo ?? "").IndexOf("xr", StringComparison.OrdinalIgnoreCase) >= 0;

    public static MemoResult Compose(MemoResult injection, IReadOnlyList<XrayDue>? due, string? currentMemo)
    {
        if (injection == null) throw new ArgumentNullException(nameof(injection));
        if (injection.Kind == MemoResultKind.NoPatient || injection.Kind == MemoResultKind.Failed) return injection;
        if (due == null || due.Count == 0 || HasXray(currentMemo)) return injection;

        var memo = currentMemo ?? "";
        var insert = injection.Kind == MemoResultKind.Insert;
        var head = insert ? injection.Text : "";
        var rest = due.ToList();
        var pieces = new List<string>();

        if (insert)
        {
            var own = PartsOfText(head);
            var same = own.Count == 1 ? rest.FirstOrDefault(d => d.Part == own[0]) : null;
            if (same != null)
            {
                pieces.Add(Suffix(same.Years));
                rest.Remove(same);
            }
        }
        pieces.AddRange(rest.Select(d => d.Part + " " + Suffix(d.Years)));

        while (pieces.Count > 0)
        {
            var text = string.Join(" ", new[] { head }.Concat(pieces).Where(piece => piece.Length > 0));
            var append = MemoMerge.AppendText(memo, text);
            if (memo.Length + append.Length <= MaxLength)
            {
                return insert
                    ? new MemoResult(MemoResultKind.Insert, text, append: append)
                    : new MemoResult(MemoResultKind.Insert, text, append: append, reason: injection);
            }
            pieces.RemoveAt(pieces.Count - 1);
        }
        return injection;
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
