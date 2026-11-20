using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 골절 fx(spec injection-memo REQ-7507): 오늘 앞 30일 외래 내원 가운데 주상병이 골절인 마지막 내원 → '&lt;좌우&gt;)&lt;부위&gt; fx'.
/// 부위는 진단 코드 표(notes/fracture.md, 직원 말), 좌우는 그 내원 fx·골절·fracture 줄 → 같은 내원 다른 줄 → 30일 안 다른 내원 fx 줄의 첫 좌우 말.
/// 환자 값은 돌려주기만 하고 파일·로그에 남기지 않는다.
/// </summary>
public static class FractureRule
{
    // 골절 진단 코드 앞(대문자, 점 없음): S02~S92(셋째 글자 2)·T02·T08·T10·T12·T14.2·M80·M48.4·M84
    private static readonly Regex Code = new Regex(@"^(S[0-9]2|T0[28]|T1[02]|T142|M80|M484|M84)", RegexOptions.Compiled);

    // fx 낱말(앞뒤가 영어 글자가 아님)·골절·fracture
    private static readonly Regex FxWord = new Regex(@"(?<![A-Za-z])fx(?![A-Za-z])|골절|fracture", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // '골절진단서 원하심' 같은 서류 말은 fx가 아니다
    private static readonly Regex DocWord = new Regex(@"골절\s*(진단서|소견서|확인서|서류)", RegexOptions.Compiled);

    // fx 줄의 좌우 말: 영어 줄임말, 여러 글자 우리말, 한 글자는 뒤가 빈칸·')'일 때만('양호'·'오래' 같은 말은 좌우가 아님)
    private static readonly Regex Side = new Regex(
        @"(?<![A-Za-z])(Rt|RT|rt|Lt|LT|lt|Both|both|BOTH|Bil|bil|BIL)(?![A-Za-z])|(?<![가-힣])(오른쪽|오른|우측|왼쪽|왼|좌측|양측|양쪽|[우좌오양](?=[\s\)]))",
        RegexOptions.Compiled);

    // 족지·수지 번호(AC-7507.5): '<1~5>st·nd·rd·th' 뒤 10글자 안에 손가락·발가락 말
    private static readonly Regex Ordinal = new Regex(
        @"(?<![0-9])([1-5])\s*(st|nd|rd|th)(?![A-Za-z])(?=.{0,10}?(?<![A-Za-z])(toe|finger|digit|phalan|MT|MC|metatars|metacarp))",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex First = new Regex(@"(?<![A-Za-z])(thumb|great\s*toe|big\s*toe|hallux)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex Fifth = new Regex(@"(?<![A-Za-z])(little|small)\s*(toe|finger)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // 좌우를 쓰지 않는 가운데 부위
    private static readonly HashSet<string> Axial = new HashSet<string>(StringComparer.Ordinal) { "목", "등", "흉골", "허리", "꼬리뼈", "골반" };

    /// <summary>골절 진단 코드인가(빈칸 빼고 대문자로 본다).</summary>
    public static bool IsFracture(string? code) => Code.IsMatch(Clean(code));

    /// <summary>골절 코드 → 메모에 쓰는 부위(notes/fracture.md 표). 골절이 아니거나 표에 없으면 "".</summary>
    public static string PartOf(string? code)
    {
        var c = Clean(code);
        if (!IsFracture(c)) return "";
        var d = c.Length >= 4 ? c[3] : '?';
        switch (c.Substring(0, 3))
        {
            case "S12": return "목";
            case "S22": return d == '0' || d == '1' ? "등" : d == '2' ? "흉골" : "늑골";
            case "S32": return d == '0' ? "허리" : d == '1' || d == '2' ? "꼬리뼈" : "골반";
            case "S42": return d == '0' ? "쇄골" : d >= '1' && d <= '3' ? "어깨" : d == '4' ? "팔꿈치" : "팔";
            case "S52": return d == '0' || d == '1' ? "팔꿈치" : d == '5' || d == '6' ? "손목" : "팔";
            case "S62": return d >= '0' && d <= '2' ? "손목" : d >= '5' && d <= '7' ? "수지" : "손";
            case "S72": return d >= '0' && d <= '2' ? "고관절" : "허벅지";
            case "S82": return d == '0' || d == '1' ? "무릎" : d == '5' || d == '6' || d == '8' ? "발목" : "다리";
            case "S92": return d == '4' || d == '5' ? "족지" : "발";
            default: return "";
        }
    }

    /// <summary>
    /// 날짜순 30일 내원 → 주상병이 골절인 마지막 내원의 '&lt;좌우&gt;)&lt;부위&gt; fx'·'&lt;부위&gt; fx'·'fx'. 그런 내원이 없으면 null.
    /// 족지·수지는 몇 번째를 앞에('오)4족지 fx', AC-7507.5).
    /// </summary>
    public static string? Text(IReadOnlyList<VisitNote>? last30Days)
    {
        var all = (last30Days ?? Array.Empty<VisitNote>()).Where(note => note != null).ToList();
        var visit = all
            .Where(note => IsFracture(note.MainDiagnosis))
            .OrderBy(note => note.Date)
            .LastOrDefault();
        if (visit == null) return null;
        var part = PartOf(visit.MainDiagnosis);
        if (part.Length == 0) return "fx";
        if (part == "족지" || part == "수지") part = DigitOf(visit, all) + part;
        var side = Axial.Contains(part) ? "" : SideOf(visit, all);
        return (side.Length > 0 ? side + ")" : "") + part + " fx";
    }

    // 엄지 코드(S92.4·S62.5)는 1, 그 밖은 골절 내원 줄 → 다른 내원(최근부터) 줄에서 번호가 처음 읽히는 줄의 번호들(작은 차례, 쉼표). 없으면 ""
    private static string DigitOf(VisitNote visit, IReadOnlyList<VisitNote> all)
    {
        var code = Clean(visit.MainDiagnosis);
        if (code.StartsWith("S924", StringComparison.Ordinal) || code.StartsWith("S625", StringComparison.Ordinal)) return "1";
        var lines = visit.SymptomLines.Concat(all.Where(note => !ReferenceEquals(note, visit)).OrderByDescending(note => note.Date).SelectMany(note => note.SymptomLines));
        foreach (var line in lines)
        {
            var text = line ?? "";
            var numbers = new SortedSet<int>();
            foreach (Match m in Ordinal.Matches(text)) numbers.Add(m.Groups[1].Value[0] - '0');
            if (First.IsMatch(text)) numbers.Add(1);
            if (Fifth.IsMatch(text)) numbers.Add(5);
            if (numbers.Count > 0) return string.Join(",", numbers);
        }
        return "";
    }

    /// <summary>메모 칸에 fx가 이미 있나: 'fx' 낱말(대소문자 무시)·서류 말이 아닌 '골절'·fracture.</summary>
    public static bool HasFx(string? memo) => FxWord.IsMatch(DocWord.Replace(memo ?? "", " "));

    // 좌우(AC-7507.2): 골절 내원 fx 줄 → 같은 내원 다른 줄(차례대로) → 30일 안 다른 내원 fx 줄(최근부터)의 첫 좌우 말
    private static string SideOf(VisitNote visit, IReadOnlyList<VisitNote> all)
    {
        var side = FirstSide(visit.SymptomLines, fxOnly: true);
        if (side.Length == 0) side = FirstSide(visit.SymptomLines, fxOnly: false);
        if (side.Length > 0) return side;
        foreach (var other in all.Where(note => !ReferenceEquals(note, visit)).OrderByDescending(note => note.Date))
        {
            side = FirstSide(other.SymptomLines, fxOnly: true);
            if (side.Length > 0) return side;
        }
        return "";
    }

    private static string FirstSide(IReadOnlyList<string> lines, bool fxOnly)
    {
        foreach (var line in lines)
        {
            var text = DocWord.Replace(line ?? "", " ");
            if (fxOnly && !FxWord.IsMatch(text)) continue;
            var m = Side.Match(text);
            if (m.Success) return SideOf(m.Value);
        }
        return "";
    }

    private static string SideOf(string word)
    {
        switch (word)
        {
            case "Rt":
            case "RT":
            case "rt":
            case "오른쪽":
            case "오른":
            case "우측":
            case "우":
            case "오":
                return "오";
            case "Lt":
            case "LT":
            case "lt":
            case "왼쪽":
            case "왼":
            case "좌측":
            case "좌":
                return "왼";
            default:
                return "양";
        }
    }

    private static string Clean(string? code) => (code ?? "").Trim().ToUpperInvariant();
}
