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
/// 모르는 값은 추측하지 않는다. 상태 표는 의원 PC 확인 보고서(docs/reception/check-result.md)의 답이 있는 코드만 담고(TASK-28),
/// 답이 없는 칸은 Unconfirmed에 둔다. 다음 확인이 더 답하면 이 파일에서 다시 채운다. 칸(Columns)이 null이면 칸을 읽는 문장은 돌지 않는다(TASK-29·30이 채운다).
/// 이미 아는 완료 코드는 지난 내원을 셀 때 쓰고, 오늘 줄을 칸에 나누는 일에는 확인 답(Statuses)만 쓴다.
/// </summary>
public static class ReceptionMap
{
    /// <summary>이미 아는 완료 코드(원본 RxHistory·ClaimDates 조건, ReceptionSql의 완료 내원 조건과 같음).</summary>
    public static IReadOnlyList<string> KnownDoneCodes { get; } = new[] { "HN", "PN", "TN", "VN", "OE", "WN", "OB" };

    // 상태 코드 → 칸. 확인 보고서 3회차(30일 상태 내력)의 답 그대로(TASK-28, 2회차 표를 고침). 답이 없는 코드(VN·OE·OB 등)는 넣지 않는다.
    // 같은 코드를 두 번 적으면 형 초기화에서 멈춘다
    private static readonly (string Code, Lane Lane)[] StatusTable =
    {
        ("WR", Lane.Hidden), // 예약(1회차: RsvInf 7줄·비트 예약 대기 7명)
        ("CR", Lane.Hidden), // 예약 취소(3회차: 처방·수납 한 번도 없음)
        ("CN", Lane.Hidden), // 접수 취소(3회차: 처방·수납 한 번도 없음, 2회차 수납대기 답은 잘못 고른 것)
        ("WN", Lane.Wait),   // 진료대기(1·2·3회차)
        ("HN", Lane.Hold),   // 진료보류(3회차)
        ("TN", Lane.Pay),    // 진료 끝, 수납 전(3회차, 2회차 TN→PN과 맞음)
        ("PN", Lane.Done),   // 수납완료(3회차 확정: 30일 2029건 모두 수납·처방 있음)
    };

    /// <summary>상태 코드 → 칸(확인 답이 있는 코드만).</summary>
    public static IReadOnlyDictionary<string, Lane> Statuses { get; } =
        StatusTable.ToDictionary(entry => entry.Code, entry => entry.Lane, StringComparer.Ordinal);

    /// <summary>확인 답이 아직 없는 칸(비어 있어도 문제 아님, AC-1410.2). 3회차에 네 칸 모두 답이 있어 비어 있다.</summary>
    public static IReadOnlyCollection<Lane> Unconfirmed { get; } = Array.AsReadOnly(new Lane[0]);

    /// <summary>숨기는 OcmRsuYon 값. 확인에서 오늘 줄이 모두 비어 있어 숨기는 값이 없다.</summary>
    public static IReadOnlyCollection<string> HiddenRsu { get; } = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>
    /// 이름·생년월일·성별·접수 메모·수납 시각·증상을 읽는 칸(확인 보고서 1·2회차, TASK-29). ReceptionSql의 TodayPeople·TodayMemos·TodayPaid가 이 이름을 읽는다.
    /// 생년월일은 yyyyMMdd, 성별은 F/M이라 주민번호 칸은 읽지 않는다. 수납 시각은 OrcInf.OrcOcmNum으로 내원에 잇는다. 증상은 아직 없다(TASK-30).
    /// </summary>
    public static ColumnPlan? Columns { get; } = new ColumnPlan(
        name: new ColumnRef("PbsInf", "PbsPatNam"),
        birthDate: new ColumnRef("PbsInf", "PbsBirDte"),
        sex: new ColumnRef("PbsInf", "PbsSexTyp"),
        memo: new ColumnRef("OcmInf", "OcmRefCmt"),
        paidAt: new ColumnRef("OrcInf", "OrcUpdDtm"),
        symptom: null);

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
    /// 진료대기·진료보류·수납대기·끝남 가운데 unconfirmed가 아닌데 코드가 없는 칸, unconfirmed인데 코드가 든 칸, 표에 든 숨김 아는 완료 코드를 알린다.
    /// 확인 답이 없어 표에 없는 코드는 문제가 아니다(AC-1402.1대로 숨김 건수로만 센다).
    /// </summary>
    public static IReadOnlyList<string> Validate(IReadOnlyDictionary<string, Lane> statuses, IReadOnlyCollection<Lane> unconfirmed)
    {
        if (statuses == null) throw new ArgumentNullException(nameof(statuses));
        if (unconfirmed == null) throw new ArgumentNullException(nameof(unconfirmed));
        var problems = new List<string>();

        foreach (var group in statuses.GroupBy(entry => Normalize(entry.Key), StringComparer.Ordinal).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            var lanes = group.Select(entry => entry.Value).Distinct().OrderBy(lane => lane).ToArray();
            if (lanes.Length > 1)
                problems.Add($"코드 {group.Key}가 두 칸 이상에 들어 있어요({string.Join("·", lanes.Select(NameOf))})");
        }

        foreach (var lane in new[] { Lane.Wait, Lane.Hold, Lane.Pay, Lane.Done })
        {
            var has = statuses.Values.Contains(lane);
            if (unconfirmed.Contains(lane))
            {
                if (has) problems.Add($"{NameOf(lane)} 칸은 아직 확인 안 됐는데 코드가 있어요");
            }
            else if (!has)
            {
                problems.Add($"{NameOf(lane)} 칸에 코드가 없어요");
            }
        }

        foreach (var code in KnownDoneCodes)
        {
            if (statuses.Any(entry => Normalize(entry.Key) == code && entry.Value == Lane.Hidden)) problems.Add($"완료 코드 {code}가 숨김이에요");
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
