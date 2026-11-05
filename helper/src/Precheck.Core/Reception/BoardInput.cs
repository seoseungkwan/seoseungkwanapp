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
/// 오늘 외래 접수 한 줄(비트 날 줄, design.md 3절). 상태로 거르지 않은 그대로이고, 칸 나누기·글 만들기는 BoardBuilder(TASK-11)가 한다.
/// 이름·생년월일(또는 주민번호 앞 7글자)·성별·접수 메모·수납 시각은 의원 PC 확인 결과로 읽는 칸(REQ-1410, TASK-29)이라 지금은 null이다.
/// 모르는 값은 지어내지 않고 null로 둔다(AC-1402.7).
/// </summary>
public sealed class VisitRow
{
    private static readonly IReadOnlyList<RxItem> NoRx = new RxItem[0];

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
        IReadOnlyList<RxItem>? lastRx = null,
        string? name = null,
        string? birthDate = null,
        string? sex = null,
        string? memo = null,
        string? paidAt = null)
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
        LastRx = lastRx ?? NoRx;
        Name = name;
        BirthDate = birthDate;
        Sex = sex;
        Memo = memo;
        PaidAt = paidAt;
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

    /// <summary>가장 최근 지난 완료 내원의 처방(코드 순). 지난 내원이 없거나 그 내원에 처방이 없으면 빈 목록.</summary>
    public IReadOnlyList<RxItem> LastRx { get; }

    public string? Name { get; }

    /// <summary>생년월일(또는 주민번호 앞 7글자). 원값은 휴대폰에 가지 않는다(AC-1402.9).</summary>
    public string? BirthDate { get; }

    public string? Sex { get; }

    public string? Memo { get; }

    /// <summary>수납 시각 원값. 모르면 null(끝남 줄은 "끝남"만).</summary>
    public string? PaidAt { get; }
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
