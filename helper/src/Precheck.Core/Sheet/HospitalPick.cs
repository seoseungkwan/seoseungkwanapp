// 비트시트 app/src/Core/HospitalPick.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로, 바뀐 것은 이름공간·nullable 표시.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.Sheet;

/// <summary>비트 DB 안의 병원 하나(DepMst.DepHspNum = HspMst.HspCod)와 최근 센 내원 수.</summary>
public sealed class HospitalOption
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int Visits { get; set; }
}

/// <summary>비트에 병원이 여럿일 때 고르기. 최근 내원이 있는 병원이 딱 하나면 그것을 쓴다.</summary>
public static class HospitalPick
{
    /// <summary>최근 내원 수를 세는 날 수.</summary>
    public const int RecentDays = 30;

    /// <summary>하나뿐이면 그것, 최근 내원이 있는 병원이 딱 하나면 그것. 아니면 null(사람이 고른다).</summary>
    public static HospitalOption? Auto(IList<HospitalOption>? options)
    {
        if (options == null || options.Count == 0) return null;
        if (options.Count == 1) return options[0];
        var active = options.Where(o => o.Visits > 0).ToList();
        return active.Count == 1 ? active[0] : null;
    }

    /// <summary>고르기 창에 보일 글: 이름 · 최근 30일 내원 n명 (코드).</summary>
    public static string Label(HospitalOption o)
    {
        var name = (o.Name ?? "").Trim();
        if (name.Length == 0) name = "이름 없는 병원";
        return name + " · 최근 " + RecentDays + "일 환자 " + o.Visits.ToString("N0", CultureInfo.InvariantCulture) + "명 (코드 " + o.Code + ")";
    }

    /// <summary>내원이 많은 차례로(같으면 코드 차례).</summary>
    public static List<HospitalOption> Sorted(IEnumerable<HospitalOption> options) =>
        (options ?? Enumerable.Empty<HospitalOption>()).OrderByDescending(o => o.Visits).ThenBy(o => o.Code, StringComparer.Ordinal).ToList();
}
