using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Reception;

/// <summary>처방 코드 하나와 그날 이름표의 이름(이름표에 없으면 null — 화면은 코드만 쓴다, AC-1402.6).</summary>
public sealed class RxItem
{
    private static readonly IReadOnlyList<RxItem> Empty = new RxItem[0];

    public RxItem(string code, string? name)
    {
        Code = code ?? throw new ArgumentNullException(nameof(code));
        Name = name;
    }

    public string Code { get; }
    public string? Name { get; }

    /// <summary>코드들 → 처방 목록: 앞뒤 공백을 빼고 빈 코드는 버리며, 한 번씩, 코드 순(Ordinal)으로, 이름표(names)의 이름을 붙인다(AC-1403.7).</summary>
    public static IReadOnlyList<RxItem> Of(IEnumerable<string?> codes, IReadOnlyDictionary<string, string> names)
    {
        if (codes == null) throw new ArgumentNullException(nameof(codes));
        if (names == null) throw new ArgumentNullException(nameof(names));
        var list = codes
            .Select(code => code?.Trim() ?? "")
            .Where(code => code.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(code => code, StringComparer.Ordinal)
            .Select(code => new RxItem(code, names.TryGetValue(code, out var name) ? name : null))
            .ToArray();
        return list.Length == 0 ? Empty : list;
    }
}

/// <summary>
/// 오늘 처방 하나의 시각(spec reception-arrange design.md 5절, AC-3303.3): 코드(대문자), 가장 이른 처방 시각 "HH:MM"(모양이 틀린 원값이면 null),
/// SONO·C-ARM 부위(지도의 PartColumn을 모르면 null). 어레인지 칸 나누기는 ArrangeBuilder가 한다.
/// </summary>
public sealed class OrderItem
{
    public OrderItem(string code, string? at, string? part)
    {
        if (string.IsNullOrEmpty(code)) throw new ArgumentException("처방 코드가 비었다", nameof(code));
        Code = code;
        At = at;
        Part = part;
    }

    public string Code { get; }

    public string? At { get; }

    public string? Part { get; }
}

/// <summary>
/// 오늘 외래 접수 한 줄(비트 날 줄, design.md 3절). 상태로 거르지 않은 그대로이고, 칸 나누기·글 만들기는 BoardBuilder(TASK-11)가 한다.
/// 이름·생년월일(yyyyMMdd)·성별(F/M)·접수 메모·수납 시각(yyyyMMddHHmm)은 의원 PC 확인 결과로 채운 칸(REQ-1410, TASK-29)에서 BoardReader가 읽는다.
/// 찾지 못한 칸·줄이 없는 내원·빈 글은 지어내지 않고 null로 둔다(AC-1402.7).
/// </summary>
public sealed class VisitRow
{
    private static readonly IReadOnlyList<RxItem> NoRx = new RxItem[0];

    private static readonly IReadOnlyList<OrderItem> NoOrders = new OrderItem[0];

    public VisitRow(
        string visitId,
        string patientId,
        string acceptedAt,
        string? status,
        string? rsu,
        IReadOnlyList<RxItem>? todayRx = null,
        long earlierCount = 0,
        string? lastVisitId = null,
        string? lastDay = null,
        string? lastSymptom = null,
        string? name = null,
        string? birthDate = null,
        string? sex = null,
        string? memo = null,
        string? paidAt = null,
        IReadOnlyList<OrderItem>? orders = null)
    {
        if (string.IsNullOrEmpty(visitId)) throw new ArgumentException("내원번호가 비었다", nameof(visitId));
        if (earlierCount < 0) throw new ArgumentOutOfRangeException(nameof(earlierCount));
        VisitId = visitId;
        PatientId = patientId ?? "";
        AcceptedAt = acceptedAt ?? "";
        Status = status;
        Rsu = rsu;
        TodayRx = todayRx ?? NoRx;
        EarlierCount = earlierCount;
        LastVisitId = lastVisitId;
        LastDay = lastDay;
        LastSymptom = lastSymptom;
        Name = name;
        BirthDate = birthDate;
        Sex = sex;
        Memo = memo;
        PaidAt = paidAt;
        Orders = orders ?? NoOrders;
    }

    /// <summary>내원번호(OcmNum). 휴대폰에는 가지 않고 VisitKeys 열쇠로 바뀐다(AC-1402.9).</summary>
    public string VisitId { get; }

    /// <summary>차트번호(OcmChtNum, 오른쪽 공백 뺌).</summary>
    public string PatientId { get; }

    /// <summary>접수 시각 OcmAcpDtm 원값 그대로(상세의 @before로 넘긴다). 시각 글은 앞 12글자(yyyyMMddHHmm)로 만든다.</summary>
    public string AcceptedAt { get; }

    /// <summary>비트 상태 코드(OcmComStt). 칸은 ReceptionMap이 정한다.</summary>
    public string? Status { get; }

    /// <summary>OcmRsuYon 값(숨김 판단, ReceptionMap.HiddenRsu).</summary>
    public string? Rsu { get; }

    /// <summary>오늘 처방(코드 순). 없으면 빈 목록.</summary>
    public IReadOnlyList<RxItem> TodayRx { get; }

    /// <summary>이 접수보다 앞선 이 병원 완료 외래 내원 수. 0이면 신환·첫 방문.</summary>
    public long EarlierCount { get; }

    /// <summary>가장 최근 지난 완료 내원의 내원번호. 없으면 null.</summary>
    public string? LastVisitId { get; }

    /// <summary>가장 최근 지난 완료 내원의 날짜(yyyyMMdd). 없으면 null.</summary>
    public string? LastDay { get; }

    /// <summary>가장 최근 지난 완료 내원의 증상 글(EmrInf S 줄을 공백 하나로 이은 것, AC-1402.6). 지난 내원이 없거나 증상 줄이 없거나 증상 칸을 모르면 null.</summary>
    public string? LastSymptom { get; }

    public string? Name { get; }

    /// <summary>생년월일(또는 주민번호 앞 7글자). 원값은 휴대폰에 가지 않는다(AC-1402.9).</summary>
    public string? BirthDate { get; }

    public string? Sex { get; }

    public string? Memo { get; }

    /// <summary>수납 시각 원값. 모르면 null(끝남 줄은 "끝남"만).</summary>
    public string? PaidAt { get; }

    /// <summary>오늘 처방마다 가장 이른 처방 시각(시각·코드 순, AC-3303.3). 없으면 빈 목록.</summary>
    public IReadOnlyList<OrderItem> Orders { get; }
}

/// <summary>
/// 한 번 읽은 비트 날 줄 묶음(BoardCache가 드는 것). 화면 JSON은 요청마다 BoardBuilder가 이것으로 만든다(찍음 표시가 바로 보이게).
/// </summary>
public sealed class BoardInput
{
    public BoardInput(string day, DateTime readAt, IReadOnlyList<VisitRow> visits, IReadOnlyDictionary<string, string> rxNames)
    {
        Day = day ?? throw new ArgumentNullException(nameof(day));
        ReadAt = readAt;
        Visits = visits ?? throw new ArgumentNullException(nameof(visits));
        RxNames = rxNames ?? throw new ArgumentNullException(nameof(rxNames));
    }

    /// <summary>읽은 날(yyyyMMdd). VisitKeys.KeyOf(Day, …)의 날이다.</summary>
    public string Day { get; }

    /// <summary>읽기를 시작한 때(화면의 "기준" 시각).</summary>
    public DateTime ReadAt { get; }

    /// <summary>오늘 외래 접수 줄(비트가 준 차례, 내원마다 한 줄).</summary>
    public IReadOnlyList<VisitRow> Visits { get; }

    /// <summary>그날 이름표: 처방 코드 → 이름(하루 한 번 읽음, AC-1403.7). 상세(TASK-13)도 이 표로 이름을 붙인다.</summary>
    public IReadOnlyDictionary<string, string> RxNames { get; }
}
