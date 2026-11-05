using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Reception;

/// <summary>접수 줄이 가는 칸: 진료대기·진료보류·수납대기·끝남·숨김(어느 칸에도 나오지 않음).</summary>
public enum Lane { Wait, Hold, Pay, Done, Hidden }

/// <summary>비트의 표·칸 이름 한 쌍(의원 PC 확인 보고서에서 찾은 것).</summary>
public sealed class ColumnRef
{
    public ColumnRef(string table, string column)
    {
        Table = table ?? throw new ArgumentNullException(nameof(table));
        Column = column ?? throw new ArgumentNullException(nameof(column));
    }

    public string Table { get; }
    public string Column { get; }
}

/// <summary>확인 결과로 채우는 읽는 칸. 찾지 못한 칸은 null이고 그 값은 빈 채로 둔다(AC-1402.7).</summary>
public sealed class ColumnPlan
{
    public ColumnPlan(ColumnRef? name, ColumnRef? birthDate, ColumnRef? sex, ColumnRef? memo, ColumnRef? paidAt, ColumnRef? symptom)
    {
        Name = name;
        BirthDate = birthDate;
        Sex = sex;
        Memo = memo;
        PaidAt = paidAt;
        Symptom = symptom;
    }

    public ColumnRef? Name { get; }
    public ColumnRef? BirthDate { get; }
    public ColumnRef? Sex { get; }
    public ColumnRef? Memo { get; }
    public ColumnRef? PaidAt { get; }
    public ColumnRef? Symptom { get; }
}

/// <summary>
/// 한 곳(spec reception-phone design.md 2절, REQ-1410): 비트 상태 코드 → 칸 표, 숨기는 OcmRsuYon 값, 이름·생년월일·성별·접수 메모·수납 시각·증상을 읽는 칸.
/// 모르는 값은 추측하지 않는다. 의원 PC 확인 보고서(docs/reception/check-result.md)가 오기 전에는 표가 비어 있어 목록이 비고(AC-1410.1),
/// 칸(Columns)이 null이라 칸을 읽는 문장은 돌지 않는다. 상태 표는 Phase 5 TASK-28, 칸은 TASK-29·30이 채운다.
/// 이미 아는 완료 코드는 지난 내원을 셀 때 쓰고, 오늘 줄을 칸에 나누는 일에는 확인 답(Statuses)만 쓴다.
/// </summary>
public static class ReceptionMap
{
    /// <summary>이미 아는 완료 코드(원본 RxHistory·ClaimDates 조건, ReceptionSql의 완료 내원 조건과 같음).</summary>
    public static IReadOnlyList<string> KnownDoneCodes { get; } = new[] { "HN", "PN", "TN", "VN", "OE", "WN", "OB" };

    // 상태 코드 → 칸. 확인 보고서의 상태 짝 답 그대로 채운다(TASK-28). 같은 코드를 두 번 적으면 형 초기화에서 멈춘다
    private static readonly (string Code, Lane Lane)[] StatusTable = { };

    /// <summary>상태 코드 → 칸. 채우기 전 비어 있다.</summary>
    public static IReadOnlyDictionary<string, Lane> Statuses { get; } =
        StatusTable.ToDictionary(entry => entry.Code, entry => entry.Lane, StringComparer.Ordinal);

    /// <summary>숨기는 OcmRsuYon 값. 채우기 전 비어 있다.</summary>
    public static IReadOnlyCollection<string> HiddenRsu { get; } = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>이름·생년월일·성별·접수 메모·수납 시각·증상을 읽는 칸. 채우기 전 null.</summary>
    public static ColumnPlan? Columns { get; } = null;

    /// <summary>
    /// 접수 줄 하나가 가는 칸(AC-1402.1). 숨기는 OcmRsuYon 값이면, 또 표에 없거나 숨김으로 정한 상태 코드면 Hidden(어느 칸에도 나오지 않음).
    /// 코드·값의 앞뒤 공백은 무시한다.
    /// </summary>
    public static Lane LaneOf(IReadOnlyDictionary<string, Lane> statuses, IEnumerable<string> hiddenRsu, string? status, string? rsu)
    {
        if (statuses == null) throw new ArgumentNullException(nameof(statuses));
        if (hiddenRsu == null) throw new ArgumentNullException(nameof(hiddenRsu));
        if (rsu != null && hiddenRsu.Contains(rsu.Trim())) return Lane.Hidden;
        return status != null && statuses.TryGetValue(status.Trim(), out var lane) ? lane : Lane.Hidden;
    }

    /// <summary>
    /// 상태 표의 문제 목록(AC-1410.2). 비어 있으면 문제 없음. 한 코드가 두 칸에 듦(대소문자·앞뒤 공백만 다른 열쇠),
    /// 진료대기·진료보류·수납대기·끝남 가운데 코드가 없는 칸, 숨김이거나 표에 없는(곧 숨김) 아는 완료 코드를 알린다.
    /// </summary>
    public static IReadOnlyList<string> Validate(IReadOnlyDictionary<string, Lane> statuses)
    {
        if (statuses == null) throw new ArgumentNullException(nameof(statuses));
        var problems = new List<string>();

        foreach (var group in statuses.GroupBy(entry => Normalize(entry.Key), StringComparer.Ordinal).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            var lanes = group.Select(entry => entry.Value).Distinct().OrderBy(lane => lane).ToArray();
            if (lanes.Length > 1)
                problems.Add($"코드 {group.Key}가 두 칸 이상에 들어 있어요({string.Join("·", lanes.Select(NameOf))})");
        }

        foreach (var lane in new[] { Lane.Wait, Lane.Hold, Lane.Pay, Lane.Done })
        {
            if (!statuses.Values.Contains(lane)) problems.Add($"{NameOf(lane)} 칸에 코드가 없어요");
        }

        foreach (var code in KnownDoneCodes)
        {
            var found = statuses.Where(entry => Normalize(entry.Key) == code).Select(entry => entry.Value).ToArray();
            if (found.Length == 0) problems.Add($"완료 코드 {code}가 표에 없어 숨김이 돼요");
            else if (found.Contains(Lane.Hidden)) problems.Add($"완료 코드 {code}가 숨김이에요");
        }

        return problems;
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();

    private static string NameOf(Lane lane) => lane switch
    {
        Lane.Wait => "진료대기",
        Lane.Hold => "진료보류",
        Lane.Pay => "수납대기",
        Lane.Done => "끝남",
        _ => "숨김",
    };
}
