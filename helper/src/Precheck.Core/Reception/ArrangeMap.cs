using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Reception;

/// <summary>어레인지 표의 치료 칸. JSON 이름은 소문자(xray·sono·carm·pt·ds·eswt·trac, <see cref="ArrangeMap.KeyOf"/>).</summary>
public enum ArrangeCol { Xray, Sono, Carm, Pt, Ds, Eswt, Trac }

/// <summary>처방 코드·이름 맞춤 하나 → 처방 칸(xray·sono·carm). 코드는 앞뒤 공백을 뺀 대문자로 견준다.</summary>
public sealed class ArrangeRule
{
    private enum Kind { Code, CodeContains, CodePattern, NameContains }

    private readonly Kind _kind;
    private readonly string _text;
    private readonly Regex? _pattern;

    private ArrangeRule(Kind kind, string text, ArrangeCol col)
    {
        _kind = kind;
        _text = text;
        Col = col;
        if (kind == Kind.CodePattern) _pattern = new Regex(text, RegexOptions.CultureInvariant);
    }

    /// <summary>이 규칙이 넣는 칸.</summary>
    public ArrangeCol Col { get; }

    /// <summary>코드가 똑같다(앞뒤 공백·대소문자 무시).</summary>
    public static ArrangeRule Code(string code, ArrangeCol col) => new ArrangeRule(Kind.Code, NormalizeCode(Need(code, nameof(code))), col);

    /// <summary>코드에 이 글이 든다(대소문자 무시).</summary>
    public static ArrangeRule CodeContains(string part, ArrangeCol col) => new ArrangeRule(Kind.CodeContains, NormalizeCode(Need(part, nameof(part))), col);

    /// <summary>앞뒤 공백 뺀 대문자 코드가 이 정규식에 맞는다(예: ^G\d{4}$, 확인 뒤에만). 틀린 정규식은 여기서 멈춘다.</summary>
    public static ArrangeRule CodePattern(string regex, ArrangeCol col) => new ArrangeRule(Kind.CodePattern, Need(regex, nameof(regex)), col);

    /// <summary>코드 사전의 처방 이름에 이 글이 든다.</summary>
    public static ArrangeRule NameContains(string part, ArrangeCol col) => new ArrangeRule(Kind.NameContains, Need(part, nameof(part)).Trim(), col);

    /// <summary>앞뒤 공백 뺀 대문자 코드·처방 이름이 이 규칙에 맞나.</summary>
    internal bool Matches(string code, string? name) => _kind switch
    {
        Kind.Code => code == _text,
        Kind.CodeContains => code.IndexOf(_text, StringComparison.Ordinal) >= 0,
        Kind.CodePattern => _pattern!.IsMatch(code),
        _ => name != null && name.IndexOf(_text, StringComparison.Ordinal) >= 0,
    };

    /// <summary>같은 규칙인지 견주는 열쇠(종류 + 글).</summary>
    internal string Identity => $"{_kind}:{_text}";

    /// <summary>문제 글에 보이는 규칙 글.</summary>
    internal string Text => _text;

    internal static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    private static string Need(string value, string name) => value ?? throw new ArgumentNullException(name);
}

/// <summary>
/// 한 곳(spec reception-arrange design.md 2절, REQ-3301): 처방 코드·이름 → 처방 칸 규칙, 처방을 보지 않는 직접 칸,
/// 확인 답이 아직 없는 칸, SONO·C-ARM 부위를 읽는 비트 칸.
/// 모르는 값은 추측하지 않는다. 처음에는 통계 도구가 이미 쓰는 코드(SONO1·CARM1)만 두었고, 의원 PC 확인 보고서
/// (REQ-3302, 4회차 2026-11-09 build=0.4.0+check5, docs/reception/check-result.md)의 코드 표와 그것을 본 사용자 결정(2026-11-09)으로 채웠다(REQ-3311).
/// PT·도수·충격파·견인은 사용자 결정(2026-11-09)으로 처방을 보지 않는 직접 칸이라 규칙이 없다.
/// </summary>
public static class ArrangeMap
{
    /// <summary>처방 칸 규칙. 차례대로 보고 처음 맞는 규칙 하나를 쓴다.</summary>
    public static IReadOnlyList<ArrangeRule> Rules { get; } = Array.AsReadOnly(new[]
    {
        // X-RAY: 단순촬영 G 코드(보고서의 '부위 N매' 38개가 모두 G1~G8로 시작하는 숫자 4자리, 전척추만 세부 3자리가 더 붙은 7자리).
        // G0400(C-Arm형 영상증폭장치이용료)처럼 G0으로 시작하는 코드는 촬영이 아니라 들지 않는다
        ArrangeRule.CodePattern(@"^G[1-8][0-9]{3}([0-9]{3})?$", ArrangeCol.Xray),
        ArrangeRule.Code("SONO1", ArrangeCol.Sono),
        // 사용자 결정(2026-11-09): 이름 없는 SONO, 급여 초음파(흉부 EB422·견관절 EB466), 관절조영(HA280)도 SONO 칸에 적는다
        ArrangeRule.Code("SONO", ArrangeCol.Sono),
        ArrangeRule.Code("EB422", ArrangeCol.Sono),
        ArrangeRule.Code("EB466", ArrangeCol.Sono),
        ArrangeRule.Code("HA280", ArrangeCol.Sono),
        ArrangeRule.Code("CARM1", ArrangeCol.Carm),
        // 사용자 결정(2026-11-09): C-Arm형 영상증폭장치이용료도 C-ARM 칸에 적는다
        ArrangeRule.Code("G0400", ArrangeCol.Carm),
    });

    /// <summary>처방을 보지 않고 표시(직접 넣기)로만 생기는 칸.</summary>
    public static IReadOnlyCollection<ArrangeCol> ManualOnly { get; } =
        Array.AsReadOnly(new[] { ArrangeCol.Pt, ArrangeCol.Ds, ArrangeCol.Eswt, ArrangeCol.Trac });

    /// <summary>확인 답이 아직 없어 규칙이 없는 처방 칸(그동안 그 칸은 직접 넣는다). 4회차 보고서로 X-RAY를 채워 지금은 없다.</summary>
    public static IReadOnlyCollection<ArrangeCol> Unconfirmed { get; } = Array.AsReadOnly(new ArrangeCol[0]);

    /// <summary>
    /// SONO·C-ARM 부위를 읽는 OdrInf 칸 이름. 모르면 null이고 부위 문장은 돌지 않는다(AC-3303.2).
    /// 4회차 보고서(arrangePart, SONO1·CARM1 줄 1149개)에서 값이 여럿인 글자 칸은 번호·시각·코드·사용자 칸뿐이라 부위 칸 근거가 없다. 부위는 직접 고른다.
    /// </summary>
    public static string? PartColumn { get; } = null;

    /// <summary>칸의 JSON 이름.</summary>
    public static string KeyOf(ArrangeCol col) => col switch
    {
        ArrangeCol.Xray => "xray",
        ArrangeCol.Sono => "sono",
        ArrangeCol.Carm => "carm",
        ArrangeCol.Pt => "pt",
        ArrangeCol.Ds => "ds",
        ArrangeCol.Eswt => "eswt",
        ArrangeCol.Trac => "trac",
        _ => throw new ArgumentOutOfRangeException(nameof(col)),
    };

    /// <summary>지금 지도(<see cref="Rules"/>)로 처방 하나가 드는 칸. 없으면 null.</summary>
    public static ArrangeCol? Match(string code, string? name) => Match(Rules, code, name);

    /// <summary>
    /// 주어진 지도로 처방 하나가 드는 칸(AC-3301.2). 직접 칸을 가리키는 규칙은 건너뛰어 어떤 코드도 직접 칸에 들지 않는다.
    /// </summary>
    public static ArrangeCol? Match(IReadOnlyList<ArrangeRule> rules, string code, string? name)
    {
        if (rules == null) throw new ArgumentNullException(nameof(rules));
        if (code == null) throw new ArgumentNullException(nameof(code));
        var normalized = ArrangeRule.NormalizeCode(code);
        var trimmedName = name?.Trim();
        foreach (var rule in rules)
        {
            if (ManualOnly.Contains(rule.Col)) continue;
            if (rule.Matches(normalized, trimmedName)) return rule.Col;
        }
        return null;
    }

    /// <summary>
    /// 지도의 문제 목록(AC-3301.4). 비어 있으면 문제 없음. 한 규칙(같은 종류·같은 글)이 두 칸에 듦, Unconfirmed 칸에 규칙이 있음,
    /// 직접 칸에 규칙이 있음, Unconfirmed가 아닌 처방 칸에 규칙이 없음을 알린다.
    /// </summary>
    public static IReadOnlyList<string> Validate(IReadOnlyList<ArrangeRule> rules, IReadOnlyCollection<ArrangeCol> unconfirmed)
    {
        if (rules == null) throw new ArgumentNullException(nameof(rules));
        if (unconfirmed == null) throw new ArgumentNullException(nameof(unconfirmed));
        var problems = new List<string>();

        foreach (var group in rules.GroupBy(rule => rule.Identity, StringComparer.Ordinal))
        {
            var cols = group.Select(rule => rule.Col).Distinct().OrderBy(col => col).ToArray();
            if (cols.Length > 1)
                problems.Add($"규칙 {group.First().Text}가 두 칸 이상에 들어 있어요({string.Join("·", cols.Select(NameOf))})");
        }

        foreach (var col in new[] { ArrangeCol.Xray, ArrangeCol.Sono, ArrangeCol.Carm })
        {
            var has = rules.Any(rule => rule.Col == col);
            if (unconfirmed.Contains(col))
            {
                if (has) problems.Add($"{NameOf(col)} 칸은 아직 확인 안 됐는데 규칙이 있어요");
            }
            else if (!has)
            {
                problems.Add($"{NameOf(col)} 칸에 규칙이 없어요");
            }
        }

        foreach (var col in ManualOnly.OrderBy(col => col))
        {
            if (rules.Any(rule => rule.Col == col)) problems.Add($"{NameOf(col)} 칸은 직접 칸인데 규칙이 있어요");
        }

        return problems;
    }

    private static string NameOf(ArrangeCol col) => col switch
    {
        ArrangeCol.Xray => "X-RAY",
        ArrangeCol.Sono => "SONO",
        ArrangeCol.Carm => "C-ARM",
        ArrangeCol.Pt => "PT",
        ArrangeCol.Ds => "도수",
        ArrangeCol.Eswt => "충격파",
        _ => "견인",
    };
}
