using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Reception.Settings;

namespace Precheck.Core.Reception;

/// <summary>
/// 어레인지 칸 열쇠(spec reception-other-clinic design.md 2절, REQ-5703). 칸은 열쇠 글이다: 처음 일곱 칸(xray·sono·carm·pt·ds·eswt·trac, JSON 이름 그대로)과
/// 병원이 더한 칸 x1~x99. 특별한 모양(X-RAY 완료 표시·SONO 부위·C-ARM 시술과 약재·충격파 타수와 부위 수)은 칸 종류가 아니라 열쇠를 따른다.
/// </summary>
public static class ArrangeKeys
{
    public const string Xray = ReceptionSettings.XrayKey;
    public const string Sono = ReceptionSettings.SonoKey;
    public const string Carm = ReceptionSettings.CarmKey;
    public const string Pt = "pt";
    public const string Ds = "ds";
    public const string Eswt = "eswt";
    public const string Trac = "trac";

    /// <summary>칸 표시 파일이 받는 열쇠 모양(AC-5703.5). 모르는 열쇠도 이 모양이면 파일에 그대로 둔다.</summary>
    private static readonly Regex MarkKey = new Regex(@"^[a-z][a-z0-9]{0,7}\z", RegexOptions.CultureInvariant);

    /// <summary>처음 일곱 칸(지금 표 차례).</summary>
    public static IReadOnlyList<string> Originals => ReceptionSettings.OriginalKeys;

    /// <summary>열쇠 차례: 처음 일곱 칸(표 차례) → 더한 칸(번호 차례) → 그 밖(글자 차례). 파일·문제 글에 쓰는 차례다.</summary>
    public static IComparer<string> Order { get; } = new KeyOrder();

    public static bool IsOriginal(string? k) => k != null && Originals.Contains(k, StringComparer.Ordinal);

    /// <summary>더한 칸 열쇠 모양(x1~x99)인가.</summary>
    public static bool IsAddedKey(string? k) => SettingsCol.IsAddedKey(k);

    /// <summary>쓰기 몸(POST /api/arrange)의 col로 받는 열쇠: 처음 일곱 칸 또는 더한 칸 모양. 보이는 칸인지는 ArrangeLayout이 본다.</summary>
    public static bool IsKnown(string? k) => IsOriginal(k) || IsAddedKey(k);

    /// <summary>칸 표시 파일의 열쇠 모양(^[a-z][a-z0-9]{0,7}$, AC-5703.5)인가.</summary>
    public static bool IsMarkKey(string? k) => k != null && MarkKey.IsMatch(k);

    private sealed class KeyOrder : IComparer<string>
    {
        public int Compare(string? a, string? b)
        {
            if (ReferenceEquals(a, b)) return 0;
            if (a == null) return -1;
            if (b == null) return 1;
            var byGroup = GroupOf(a).CompareTo(GroupOf(b));
            if (byGroup != 0) return byGroup;
            var byRank = RankOf(a).CompareTo(RankOf(b));
            return byRank != 0 ? byRank : string.CompareOrdinal(a, b);
        }

        private static int GroupOf(string k) => IsOriginal(k) ? 0 : IsAddedKey(k) ? 1 : 2;

        private static int RankOf(string k)
        {
            for (var i = 0; i < Originals.Count; i++)
            {
                if (string.Equals(Originals[i], k, StringComparison.Ordinal)) return i;
            }
            return SettingsCol.NumberOf(k);
        }
    }
}

/// <summary>
/// 설정(ReceptionSettings)에서 만든 어레인지 표의 칸 모양(spec reception-other-clinic design.md 2절, REQ-5702·REQ-5703).
/// 보이는 칸(Cols·Keys, 설정 차례), 칸마다 단계(StepsOf)·종류, 처방 맞춤(RxMatch, 한 처방이 보이는 rx 칸 여럿에 들 수 있다),
/// 직접 칸 목록(ListOf), 판에 보내는 고르기 목록(BoardPicks = 지금 목록 + 보이는 더한 칸 extra).
/// 시험·옛 부르는 곳은 우리 의원 처음 값(Ours = ReceptionSettings.Ours(PickLists.Defaults))을 쓴다. 고칠 수 없는 값이다.
/// </summary>
public sealed class ArrangeLayout
{
    private static readonly Regex XrayCode = new Regex(ArrangeMap.XrayPattern, RegexOptions.CultureInvariant);
    private static readonly IReadOnlyList<string> NoNames = Array.AsReadOnly(new string[0]);

    private readonly Dictionary<string, SettingsCol> visible;

    private ArrangeLayout(ReceptionSettings settings)
    {
        Settings = settings;
        var cols = settings.Cols.Where(col => col.Show).ToArray();
        Cols = Array.AsReadOnly(cols);
        Keys = Array.AsReadOnly(cols.Select(col => col.K).ToArray());
        visible = cols.ToDictionary(col => col.K, col => col, StringComparer.Ordinal);
        BoardPicks = settings.Picks.WithExtra(cols
            .Where(col => col.Added)
            .Select(col => new KeyValuePair<string, IReadOnlyList<string>>(col.K, ListOf(col.K))));
    }

    /// <summary>우리 의원 처음 값(기본 목록): 지금 화면 그대로의 일곱 칸(AC-5702.2).</summary>
    public static ArrangeLayout Ours { get; } = From(ReceptionSettings.Ours(PickLists.Defaults));

    public static ArrangeLayout From(ReceptionSettings settings) =>
        new ArrangeLayout(settings ?? throw new ArgumentNullException(nameof(settings)));

    /// <summary>우리 의원 처음 값의 칸에 넘긴 고르기 목록(설정 파일을 쓰기 전의 ReceptionLists 목록 등).</summary>
    public static ArrangeLayout OursWith(PickLists picks) =>
        From(ReceptionSettings.Ours(picks ?? throw new ArgumentNullException(nameof(picks))));

    public ReceptionSettings Settings { get; }

    /// <summary>보이는 칸(설정 차례). 숨긴 칸은 없다.</summary>
    public IReadOnlyList<SettingsCol> Cols { get; }

    /// <summary>보이는 칸 열쇠(설정 차례) = 판 cells의 열쇠 = cfg.cols의 k.</summary>
    public IReadOnlyList<string> Keys { get; }

    /// <summary>지금 고르기 목록(설정의 picks).</summary>
    public PickLists Picks => Settings.Picks;

    /// <summary>판에 보내는 고르기 목록: 지금 목록 + extra(보이는 더한 칸만, 설정 차례, AC-5703.6).</summary>
    public PickLists BoardPicks { get; }

    /// <summary>어레인지 탭을 쓰나(거짓이면 판에 arrange·picks가 없다).</summary>
    public bool Tab => Settings.Tab;

    /// <summary>처음 설정 안내를 보이나(setup.done의 반대).</summary>
    public bool Guide => !Settings.Setup.Done;

    public LogoSetting Logo => Settings.Logo;

    /// <summary>보이는 칸 열쇠인가.</summary>
    public bool IsVisible(string? k) => k != null && visible.ContainsKey(k);

    /// <summary>보이는 칸 설정. 없거나 숨긴 칸이면 null.</summary>
    public SettingsCol? ColOf(string? k) => k != null && visible.TryGetValue(k, out var col) ? col : null;

    /// <summary>보이는 칸의 단계(2·3). 보이는 칸이 아니면 0.</summary>
    public int StepsOf(string k) => ColOf(k)?.Steps ?? 0;

    /// <summary>보이는 처방 칸(rx)인가.</summary>
    public bool IsRx(string k) => ColOf(k)?.Kind == ColKinds.Rx;

    /// <summary>순서 번호(ord)를 매기는 칸: 단계 3인 처방 칸(AC-5703.2, 사용자 결정 2026-11-17).</summary>
    public bool HasOrd(string k) => IsRx(k) && StepsOf(k) == 3;

    /// <summary>처방이 들 수 없는 처방 칸(cfg empty, AC-5703.1): rx인데 codes가 비고, xray면 rule도 거짓.</summary>
    public bool IsEmpty(string k)
    {
        var col = ColOf(k);
        return col != null && col.Kind == ColKinds.Rx && col.Codes.Count == 0 && !(col.K == ArrangeKeys.Xray && col.Rule == true);
    }

    /// <summary>
    /// 처방 하나가 드는 칸 모두(AC-5702.1, 설정 차례): 보이는 rx 칸 가운데 codes에 그 코드(앞뒤 공백 뺀 대문자)가 있는 칸,
    /// xray가 rx이고 rule이 참이면 단순 촬영 G 코드(ArrangeMap.XrayPattern)도 xray. mn 칸·숨긴 칸에는 들지 않는다.
    /// name(코드 사전의 처방 이름)은 지금 규칙에 쓰지 않는다.
    /// </summary>
    public IReadOnlyList<string> RxMatch(string? code, string? name = null)
    {
        if (code == null) return NoNames;
        var normalized = ArrangeRule.NormalizeCode(code);
        if (normalized.Length == 0) return NoNames;
        var hits = new List<string>();
        foreach (var col in Cols)
        {
            if (col.Kind != ColKinds.Rx) continue;
            var ruled = col.K == ArrangeKeys.Xray && col.Rule == true && XrayCode.IsMatch(normalized);
            if (ruled || col.Codes.Contains(normalized, StringComparer.Ordinal)) hits.Add(col.K);
        }
        return hits.Count == 0 ? NoNames : hits.AsReadOnly();
    }

    /// <summary>한 줄 목록 칸의 이름(pt·ds·trac·더한 칸, 목록 차례). 그 밖의 칸은 빈 목록.</summary>
    public IReadOnlyList<string> ListOf(string k)
    {
        switch (k)
        {
            case ArrangeKeys.Pt:
                return Picks.Pt;
            case ArrangeKeys.Ds:
                return Picks.Ds;
            case ArrangeKeys.Trac:
                return Picks.Trac;
        }
        return ArrangeKeys.IsAddedKey(k) && Picks.Extra.TryGetValue(k, out var names) ? names : NoNames;
    }
}
