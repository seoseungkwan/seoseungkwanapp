using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.Registration;

/// <summary>병원 고르기 창의 줄 하나(AC-005.19): 비트 병원 범위, 그날 8자리 기관기호(없거나 둘이면 빈 값), 최근 30일 외래 건수, 로그인 계정의 범위인지.</summary>
public sealed class HospitalChoice
{
    public HospitalChoice(string scope, string institutionCode, long recentVisits, bool mine)
    {
        Scope = scope ?? throw new ArgumentNullException(nameof(scope));
        InstitutionCode = institutionCode ?? "";
        RecentVisits = recentVisits < 0 ? 0 : recentVisits;
        Mine = mine;
    }

    public string Scope { get; }

    public string InstitutionCode { get; }

    public long RecentVisits { get; }

    public bool Mine { get; }
}

/// <summary>
/// 병원 고르기 창에 보일 것(AC-005.19, 승인 시안 docs/mockups/reg-pick). 글은 도우미가 비트에서 읽은 값으로만 만든다.
/// 고르기 창의 기관기호는 앞자리가 같은 번호끼리 구별하려고 다 보인다(PC 확인 창의 뒤 4자리 가림은 그대로). 병원 이름은 없다(AC-005.9).
/// </summary>
public sealed class HospitalPickView
{
    public HospitalPickView(IReadOnlyList<HospitalChoice> choices, BitTarget target, HospitalRegistration? previous)
    {
        if (choices == null) throw new ArgumentNullException(nameof(choices));
        if (target == null) throw new ArgumentNullException(nameof(target));
        Choices = choices.ToList();
        Target = target;
        Previous = previous;
        Preselected = HospitalPick.Preselect(Choices);
    }

    public IReadOnlyList<HospitalChoice> Choices { get; }

    public BitTarget Target { get; }

    /// <summary>다시 등록이면 전 등록(처음 등록이면 null).</summary>
    public HospitalRegistration? Previous { get; }

    /// <summary>미리 골라 둘 줄 번호(AC-005.18 ①·② 차례). 못 정하면 null — 줄을 고르기 전에는 [확인]이 눌리지 않는다.</summary>
    public int? Preselected { get; }

    /// <summary>다시 등록이면 '지금 등록: 요양기관번호 {전 번호}', 처음 등록이면 null.</summary>
    public string? PreviousLine => Previous == null ? null : "지금 등록: " + Number(Previous.InstitutionCode);

    /// <summary>줄의 굵은 글: '요양기관번호 {번호}', 못 찾으면 '요양기관번호 못 찾음 (비트 병원 범위 {범위})'.</summary>
    public string Title(int index)
    {
        var choice = Choices[index];
        return choice.InstitutionCode.Length == 0
            ? "요양기관번호 못 찾음 (비트 병원 범위 " + choice.Scope + ")"
            : Number(choice.InstitutionCode);
    }

    /// <summary>로그인 계정의 범위면 꼬리표 글, 아니면 null.</summary>
    public string? Tag(int index) => Choices[index].Mine ? HospitalPick.MineTag : null;

    /// <summary>줄의 둘째 글: '최근 30일 외래 {건수}건'(천 단위 쉼표).</summary>
    public string Detail(int index) =>
        "최근 " + HospitalCheck.RecentDays.ToString(CultureInfo.InvariantCulture) + "일 외래 "
        + Choices[index].RecentVisits.ToString("#,0", CultureInfo.InvariantCulture) + "건";

    public string InstallLine => "비트 설치 위치: " + Target.InstallPath;

    public string DatabaseLine => "비트 DB: " + Target.Server + " / " + Target.Database;

    private static string Number(string code) => "요양기관번호 " + (string.IsNullOrEmpty(code) ? "못 찾음" : code);
}

/// <summary>병원 고르기(AC-005.19): 창 글자와 비트에서 줄 읽기·미리 고를 줄.</summary>
public static class HospitalPick
{
    public const string Question = "비트에 병원이 여러 개 있어요. 이 PC에서 쓸 병원을 골라 주세요.";

    public const string MineTag = "지금 로그인한 계정의 병원";

    public const string Warning = "양도양수로 번호가 바뀌었으면 지금 쓰는 번호를 고르세요. 다른 번호를 고르면 그 병원 자료를 읽어요.";

    /// <summary>
    /// 미리 골라 둘 줄(AC-005.18 차례): ① 로그인 계정의 범위 줄 ② 아니면 최근 30일 외래가 있는 줄이 하나일 때 그 줄 ③ 못 정하면 null.
    /// </summary>
    public static int? Preselect(IReadOnlyList<HospitalChoice> choices)
    {
        if (choices == null) throw new ArgumentNullException(nameof(choices));
        for (var i = 0; i < choices.Count; i++)
        {
            if (choices[i].Mine) return i;
        }
        var active = Enumerable.Range(0, choices.Count).Where(i => choices[i].RecentVisits > 0).ToList();
        return active.Count == 1 ? active[0] : null;
    }

    /// <summary>
    /// 범위마다 줄을 읽는다(DB 범위 차례): 로그인 계정의 범위(모양이 틀리면 없음) → 최근 30일 외래 건수(AC-005.18 ②와 같은 SQL) →
    /// 범위마다 오늘 8자리 기관기호(서로 다른 값이 하나면 그것, 아니면 빈 값). 읽기가 실패하면 그 번호로 멈춘다.
    /// </summary>
    public static HospitalPickView Read(IBitDb db, IReadOnlyList<string> scopes, VendorUser user, DateTime today, BitTarget target, HospitalRegistration? previous)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (scopes == null) throw new ArgumentNullException(nameof(scopes));
        var mine = HospitalCheck.UserScopeOrNull(db, user);
        var counts = HospitalCheck.ReadActiveCounts(db, today);
        var choices = new List<HospitalChoice>();
        foreach (var scope in scopes)
        {
            var codes = HospitalCheck.ReadCodes(db, scope, today.Date);
            choices.Add(new HospitalChoice(
                scope,
                codes.Count == 1 ? codes[0] : "",
                counts.TryGetValue(scope, out var visits) ? visits : 0,
                mine != null && string.Equals(mine, scope, StringComparison.Ordinal)));
        }
        return new HospitalPickView(choices, target, previous);
    }
}
