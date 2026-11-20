using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 엑스레이 부위 표(AC-7505.1·.2). 표는 specs/injection-memo/notes/xray-parts.md 그대로:
/// '메모에 쓰는 부위' → 기한(무릎 1년·그 밖 2년)과 인정하는 영상 처방 코드 앞 3글자, 부위 말(주사 차수 글의 부위를 같은 부위로 볼 때).
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
        part != null && ByPart.TryGetValue(part, out var entry) ? entry.Years : 2;

    /// <summary>부위 말(우리말, 영어는 규칙이 바꾼 말) → 메모에 쓰는 부위. 표에 없으면 null.</summary>
    internal static string? MemoPartOf(string? word) =>
        word != null && ByWord.TryGetValue(word, out var entry) ? entry.Part : null;
}

/// <summary>[엑스레이] 창 줄 하나(AC-7505.1·.2): 부위, 마지막 날짜(null = 찍은 적 없음), 기한(년), 경과인지.</summary>
public sealed class XrayItem
{
    public XrayItem(string part, DateTime? last, int years, bool overdue)
    {
        Part = part ?? "";
        Last = last?.Date;
        Years = years;
        Overdue = overdue;
    }

    public string Part { get; }

    public DateTime? Last { get; }

    public int Years { get; }

    public bool Overdue { get; }

    /// <summary>기한·경과만(부위·날짜는 환자 값이라 뺀다).</summary>
    public override string ToString() => "XrayItem(" + Years + "," + (Overdue ? "overdue" : "ok") + ")";
}

/// <summary>[엑스레이] 창 목록(AC-7505.1·.2): 찍은 부위 전부 + 설정에서 고른 부위 가운데 찍은 적 없는 것.</summary>
public static class XrayList
{
    /// <summary>영상 처방은 오늘 앞 이만큼(년) 읽는다(이 PC 영상 처방은 2022년부터라 사실상 전부, AC-7506.1).</summary>
    public const int ReadYears = 20;

    /// <summary>
    /// 표 20부위마다 인정 코드의 마지막 날짜가 있으면 찍은 부위 줄(설정과 상관없이), 없고 chosen에 있으면 찍은 적 없음 줄.
    /// 경과 = 기한 날(오늘 − N년)보다 뒤에 인정 코드가 없음(찍은 적 없음도 경과). 차례: 찍은 부위(경과 먼저, 그 안에서 마지막 날짜가 오래된 것부터, 같으면 표 차례) → 찍은 적 없음(표 차례).
    /// </summary>
    public static IReadOnlyList<XrayItem> Of(IReadOnlyDictionary<string, DateTime>? lastByCode3, IReadOnlyCollection<string>? chosen, DateTime today)
    {
        var picked = new HashSet<string>(chosen ?? Array.Empty<string>(), StringComparer.Ordinal);
        var shot = new List<(int Order, XrayItem Item)>();
        var never = new List<XrayItem>();
        var order = 0;
        foreach (var part in XrayParts.All)
        {
            var years = XrayParts.YearsOf(part);
            DateTime? last = null;
            foreach (var code in XrayParts.CodesOf(part))
            {
                if (lastByCode3 != null && lastByCode3.TryGetValue(code, out var day) && (last == null || day.Date > last.Value)) last = day.Date;
            }
            if (last != null) shot.Add((order, new XrayItem(part, last, years, last.Value <= today.Date.AddYears(-years))));
            else if (picked.Contains(part)) never.Add(new XrayItem(part, null, years, true));
            order++;
        }
        return shot
            .OrderBy(pair => pair.Item.Overdue ? 0 : 1)
            .ThenBy(pair => pair.Item.Last)
            .ThenBy(pair => pair.Order)
            .Select(pair => pair.Item)
            .Concat(never)
            .ToArray();
    }

    /// <summary>지난 기간 글(AC-7505.2): 달 수(날짜가 덜 찼으면 한 달 뺌) ≥ 1이면 'N년 M달 전'('M달 전'·'N년 전'), 0이면 'N일 전'.</summary>
    public static string AgoText(DateTime last, DateTime today)
    {
        var from = last.Date;
        var to = today.Date;
        var months = (to.Year - from.Year) * 12 + to.Month - from.Month;
        if (to.Day < from.Day) months--;
        if (months < 1) return (to - from).Days.ToString(CultureInfo.InvariantCulture) + "일 전";
        var y = months / 12;
        var m = months % 12;
        if (y == 0) return m.ToString(CultureInfo.InvariantCulture) + "달 전";
        if (m == 0) return y.ToString(CultureInfo.InvariantCulture) + "년 전";
        return y.ToString(CultureInfo.InvariantCulture) + "년 " + m.ToString(CultureInfo.InvariantCulture) + "달 전";
    }
}

/// <summary>[엑스레이]를 누른 결과 종류(AC-7505.4·7506.1).</summary>
public enum XrayListKind
{
    /// <summary>목록을 만들었다(비어 있으면 창에 '찍은 엑스레이가 없어요.').</summary>
    Ok,

    /// <summary>접수 화면 차트번호 칸이 비었거나 차트번호가 아니다(DB에 묻지 않음).</summary>
    NoPatient,

    /// <summary>비트 DB를 읽지 못했다(실패·5초 넘음).</summary>
    Failed,
}

/// <summary>[엑스레이] 결과: 종류와 목록(Ok일 때만).</summary>
public sealed class XrayListResult
{
    public XrayListResult(XrayListKind kind, IReadOnlyList<XrayItem>? items = null)
    {
        Kind = kind;
        Items = kind == XrayListKind.Ok && items != null ? items : Array.Empty<XrayItem>();
    }

    public XrayListKind Kind { get; }

    public IReadOnlyList<XrayItem> Items { get; }

    /// <summary>종류와 줄 수만.</summary>
    public override string ToString() => "XrayListResult(" + Kind + "," + Items.Count + ")";
}
