using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 엑스레이 경과 부위(AC-7505.1·.2). 표는 specs/injection-memo/notes/xray-parts.md 그대로:
/// 증상 기록의 부위 말 → '메모에 쓰는 부위' → 기한(무릎 1년·그 밖 2년)과 인정하는 영상 처방 코드 앞 3글자.
/// 좌우는 가리지 않는다. C-Arm(G04)·관절조영(HA2)은 어느 부위에도 없다.
/// </summary>
public static class XrayParts
{
    private sealed class Entry
    {
        public Entry(string part, int years, string[] codes, string[] words)
        {
            Part = part;
            Years = years;
            Codes = codes;
            Words = words;
        }

        public string Part { get; }

        public int Years { get; }

        public string[] Codes { get; }

        public string[] Words { get; }
    }

    private static readonly Entry[] Table =
    {
        new Entry("무릎", 1, new[] { "G72", "G77", "G56" }, new[] { "무릎", "슬관절" }),
        new Entry("어깨", 2, new[] { "G33", "G32" }, new[] { "어깨", "견관절", "회전근개", "승모근", "견갑", "날개뼈" }),
        new Entry("목", 2, new[] { "G41", "G49" }, new[] { "목", "경추" }),
        new Entry("등", 2, new[] { "G43", "G49" }, new[] { "등", "흉추" }),
        new Entry("허리", 2, new[] { "G45", "G49" }, new[] { "허리", "요추" }),
        new Entry("골반", 2, new[] { "G51" }, new[] { "골반", "천장관절" }),
        new Entry("엉덩이", 2, new[] { "G51", "G52" }, new[] { "엉덩이", "둔부" }),
        new Entry("고관절", 2, new[] { "G52", "G51" }, new[] { "고관절", "사타구니" }),
        new Entry("꼬리뼈", 2, new[] { "G47" }, new[] { "꼬리뼈", "미추" }),
        new Entry("팔꿈치", 2, new[] { "G62" }, new[] { "팔꿈치", "주관절", "엘보" }),
        new Entry("팔", 2, new[] { "G61", "G63" }, new[] { "팔" }),
        new Entry("손목", 2, new[] { "G64" }, new[] { "손목", "수근관" }),
        new Entry("손", 2, new[] { "G66" }, new[] { "손", "손바닥", "손등" }),
        new Entry("손가락", 2, new[] { "G81", "G66" }, new[] { "손가락", "수지", "엄지", "방아쇠" }),
        new Entry("허벅지", 2, new[] { "G71" }, new[] { "허벅지" }),
        new Entry("다리", 2, new[] { "G71", "G73", "G56" }, new[] { "다리" }),
        new Entry("종아리", 2, new[] { "G73" }, new[] { "종아리" }),
        new Entry("발목", 2, new[] { "G74" }, new[] { "발목", "족관절", "아킬레스" }),
        new Entry("발", 2, new[] { "G75", "G79" }, new[] { "발", "발바닥", "족저", "뒤꿈치", "발등" }),
        new Entry("발가락", 2, new[] { "G82", "G75" }, new[] { "발가락", "엄지발가락" }),
    };

    private static readonly Dictionary<string, Entry> ByPart = Table.ToDictionary(entry => entry.Part, StringComparer.Ordinal);

    private static readonly Dictionary<string, Entry> ByWord =
        Table.SelectMany(entry => entry.Words.Select(word => (word, entry))).ToDictionary(pair => pair.word, pair => pair.entry, StringComparer.Ordinal);

    /// <summary>표의 '메모에 쓰는 부위' 모두.</summary>
    private static readonly string[] PartsInOrder = Table.Select(entry => entry.Part).ToArray();

    public static IReadOnlyList<string> All => PartsInOrder;

    /// <summary>인정하는 영상 처방 코드 앞 3글자. 표에 없는 부위는 빈 목록.</summary>
    public static IReadOnlyList<string> CodesOf(string part) =>
        part != null && ByPart.TryGetValue(part, out var entry) ? entry.Codes : Array.Empty<string>();

    /// <summary>기한(년): 무릎 1, 그 밖 2.</summary>
    public static int YearsOf(string part) =>
        part != null && ByPart.TryGetValue(part, out var entry) ? entry.Years : XrayRule.LongestYears;

    /// <summary>부위 말(우리말, 영어는 규칙이 바꾼 말) → 메모에 쓰는 부위. 표에 없으면 null.</summary>
    internal static string? MemoPartOf(string? word) =>
        word != null && ByWord.TryGetValue(word, out var entry) ? entry.Part : null;

    /// <summary>오늘 앞 내원 가운데 증상 줄(빈칸 아닌 글)이 있는 내원이 있는지.</summary>
    public static bool HasSymptoms(IReadOnlyList<VisitNote>? visits, DateTime today) => WithSymptoms(visits, today).Any();

    /// <summary>
    /// 30일 안 증상 줄 있는 내원들(없으면 lastBefore 하나)의 증상 줄에서 표 부위를 최근 내원부터, 줄 차례·줄 안 자리 차례로 중복 없이 모은다.
    /// </summary>
    public static IReadOnlyList<string> Of(IReadOnlyList<VisitNote>? last30Days, VisitNote? lastBefore, DateTime today)
    {
        var visits = WithSymptoms(last30Days, today).OrderByDescending(visit => visit.Date).ToList();
        if (visits.Count == 0 && lastBefore != null) visits.Add(lastBefore);

        var result = new List<string>();
        foreach (var visit in visits)
        {
            foreach (var line in visit.SymptomLines)
            {
                foreach (var hit in InjectionRule.PartHits(line, loose: true).OrderBy(hit => hit.Index))
                {
                    var part = MemoPartOf(hit.Part);
                    if (part != null && !result.Contains(part)) result.Add(part);
                }
            }
        }
        return result;
    }

    private static IEnumerable<VisitNote> WithSymptoms(IReadOnlyList<VisitNote>? visits, DateTime today) =>
        (visits ?? Array.Empty<VisitNote>()).Where(visit => visit != null && visit.Date < today.Date && visit.SymptomLines.Any(line => !string.IsNullOrWhiteSpace(line)));
}

/// <summary>경과한 부위 하나와 그 기한(년).</summary>
public sealed class XrayDue
{
    public XrayDue(string part, int years)
    {
        Part = part ?? "";
        Years = years;
    }

    public string Part { get; }

    public int Years { get; }

    /// <summary>기한만(부위는 증상 기록에서 나온 환자 값이라 뺀다).</summary>
    public override string ToString() => "XrayDue(" + Years + ")";
}

/// <summary>경과 판정(AC-7505.2): 기한 날(오늘 − N년)보다 뒤에 인정 코드가 하나라도 있으면 경과 아님, 없으면(기록이 아예 없어도) 경과.</summary>
public static class XrayRule
{
    /// <summary>가장 긴 기한(년) — 영상 처방은 오늘 앞 이만큼만 읽는다.</summary>
    public const int LongestYears = 2;

    public static IReadOnlyList<XrayDue> Overdue(IReadOnlyList<string>? parts, IReadOnlyDictionary<string, DateTime>? lastByCode3, DateTime today)
    {
        var result = new List<XrayDue>();
        foreach (var part in (parts ?? Array.Empty<string>()).Distinct(StringComparer.Ordinal))
        {
            var codes = XrayParts.CodesOf(part);
            if (codes.Count == 0) continue;
            var years = XrayParts.YearsOf(part);
            var cutoff = today.Date.AddYears(-years);
            var recent = codes.Any(code => lastByCode3 != null && lastByCode3.TryGetValue(code, out var day) && day.Date > cutoff);
            if (!recent) result.Add(new XrayDue(part, years));
        }
        return result;
    }
}
