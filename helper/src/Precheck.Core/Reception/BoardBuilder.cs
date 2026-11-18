using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Reception;

/// <summary>
/// 비트 날 줄(BoardInput) → 휴대폰 줄(Board) (design.md 4절, REQ-1402). 글은 모두 여기서 만들고 화면은 그대로 그린다.
/// 칸은 상태 표(지도)로만 나눈다(ReceptionMap.LaneOf). 지도·숨기는 OcmRsuYon 값·X-ray 완료 표시·열쇠표·지금 시각은 인자로 받아
/// 시험은 가짜를 쓴다. 기다린 분은 모든 칸에서 접수 시각부터 센다. 모르는 값은 지어내지 않고 비우거나 뺀다(AC-1402.7).
/// </summary>
public static class BoardBuilder
{
    /// <summary>진료대기·진료보류가 이 분 이상 기다리면 오래 기다림(주황) 표시(AC-1402.4).</summary>
    public const int LongWaitMinutes = 60;

    private const string Joiner = " · ";

    private static readonly Regex FullDate = new Regex(@"^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:$|[\sT])", RegexOptions.CultureInvariant);
    private static readonly Regex ResidentPrefix = new Regex(@"^(\d{2})(\d{2})(\d{2})-?(\d)$", RegexOptions.CultureInvariant);
    private static readonly Regex StampTime = new Regex(@"^\d{8}(\d{2})(\d{2})\d*$", RegexOptions.CultureInvariant);
    private static readonly Regex DateTimeText = new Regex(@"^\d{4}[-./]\d{2}[-./]\d{2}[\sT]+(\d{2}):(\d{2})", RegexOptions.CultureInvariant);
    private static readonly Regex ClockText = new Regex(@"^(\d{2}):?(\d{2})(?::?\d{2})?$", RegexOptions.CultureInvariant);
    private static readonly Regex MarkShape = new Regex(@"^([01]\d|2[0-3]):[0-5]\d$", RegexOptions.CultureInvariant);

    /// <summary>
    /// 한 판을 만든다. map·hiddenRsu는 ReceptionMap.Statuses·HiddenRsu(시험은 가짜), marks는 XrayMarks.Today()(내원번호 → "HH:MM"),
    /// keys는 그날 열쇠표(input.Day로 부른다), now는 기다린 분과 만 나이의 기준 시각이다. "at"은 input.ReadAt이고,
    /// "every"(화면이 저절로 다시 읽는 간격)는 판마다 같은 ReceptionTiming.PollSeconds라 Board.ToJson이 쓴다(AC-1403.9).
    /// </summary>
    public static Board Build(
        BoardInput input,
        IReadOnlyDictionary<string, Lane> map,
        IEnumerable<string> hiddenRsu,
        IReadOnlyDictionary<string, string> marks,
        VisitKeys keys,
        DateTime now)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        if (map == null) throw new ArgumentNullException(nameof(map));
        if (hiddenRsu == null) throw new ArgumentNullException(nameof(hiddenRsu));
        if (marks == null) throw new ArgumentNullException(nameof(marks));
        if (keys == null) throw new ArgumentNullException(nameof(keys));

        var hidden = new HashSet<string>(hiddenRsu, StringComparer.Ordinal);
        var shown = new List<(VisitRow Visit, Lane Lane)>();
        var hiddenCount = 0;
        foreach (var visit in input.Visits)
        {
            var lane = ReceptionMap.LaneOf(map, hidden, visit.Status, visit.Rsu);
            if (lane == Lane.Hidden) hiddenCount++;
            else shown.Add((visit, lane));
        }

        // 접수 빠른 순(같으면 내원번호 순)으로 한 번 줄 세운 뒤 칸마다 나눈다
        var rows = shown
            .OrderBy(entry => entry.Visit, AcceptedOrder.Instance)
            .Select(entry => MakeRow(entry.Visit, entry.Lane, input, marks, keys, now))
            .ToArray();

        IReadOnlyList<BoardRow> In(Lane lane) => rows.Where(row => row.Lane == lane).ToArray();
        var queue = rows
            .Where(row => row.Lane == Lane.Wait || row.Lane == Lane.Hold)
            .Select((row, index) => row.WithPos(index + 1))
            .ToArray();
        var done = rows.Where(row => row.Lane == Lane.Done).Reverse().ToArray();

        return new Board(
            input.ReadAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
            queue,
            In(Lane.Wait),
            In(Lane.Hold),
            In(Lane.Pay),
            done,
            hiddenCount);
    }

    private static BoardRow MakeRow(VisitRow visit, Lane lane, BoardInput input, IReadOnlyDictionary<string, string> marks, VisitKeys keys, DateTime now)
    {
        var accepted = AcceptedMinute(visit.AcceptedAt);
        int? minutes = accepted == null ? (int?)null : Math.Max(1, (int)Math.Floor((now - accepted.Value).TotalMinutes));
        // 예전 접수가 있는지는 처방 칸(지난번 증상 / 첫 처방)만 정한다. 신환·재진은 내원 구분(InfoOf, spec new-mark AC-6205.3)
        var hasPrior = visit.EarlierCount > 0 || visit.LastVisitId != null;
        var (rxLabel, rx) = RxOf(visit, hasPrior, input.RxNames);

        return new BoardRow(
            keys.KeyOf(input.Day, visit.VisitId),
            lane,
            null,
            visit.PatientId.Trim(),
            Clean(visit.Name) ?? "",
            InfoOf(visit, now.Date),
            accepted == null ? "" : accepted.Value.ToString("HH:mm", CultureInfo.InvariantCulture) + " 접수",
            WaitedOf(lane, minutes, visit.PaidAt),
            (lane == Lane.Wait || lane == Lane.Hold) && minutes >= LongWaitMinutes,
            Clean(visit.Memo) ?? "",
            rxLabel,
            rx,
            lane == Lane.Hold ? new BoardXray(MarkOf(marks, visit.VisitId)) : null);
    }

    // ---- 기다린 글 (AC-1402.3) ------------------------------------------------------------------

    /// <summary>접수 원값 앞 12글자(yyyyMMddHHmm). 읽지 못하면 null.</summary>
    private static DateTime? AcceptedMinute(string acceptedAt)
    {
        var text = acceptedAt.Trim();
        if (text.Length < 12) return null;
        return DateTime.TryParseExact(text.Substring(0, 12), "yyyyMMddHHmm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var at)
            ? at
            : (DateTime?)null;
    }

    private static string WaitedOf(Lane lane, int? minutes, string? paidAt)
    {
        if (lane == Lane.Done)
        {
            var paid = ClockOf(paidAt);
            return paid == null ? "수납완료" : paid + " 수납";
        }
        if (minutes == null) return "";
        var span = Span(minutes.Value);
        return lane switch
        {
            Lane.Wait => span + "째 대기",
            Lane.Hold => "보류 " + span + "째",
            _ => "수납 " + span + "째",
        };
    }

    /// <summary>"18분"·"1시간 4분"·"2시간". 어레인지 돌아온 뒤 기다린 글(spec reception-arrange-tune AC-3601.4)도 쓴다.</summary>
    internal static string Span(int minutes)
    {
        if (minutes < 60) return minutes.ToString(CultureInfo.InvariantCulture) + "분";
        var hours = (minutes / 60).ToString(CultureInfo.InvariantCulture) + "시간";
        var rest = minutes % 60;
        return rest == 0 ? hours : hours + " " + rest.ToString(CultureInfo.InvariantCulture) + "분";
    }

    /// <summary>수납 시각 원값 → "HH:MM". yyyyMMddHHmm…·"yyyy-MM-dd HH:mm…"·"HH:mm"·"HHmm"을 읽고 아니면 null. 어레인지 수납완료 줄(AC-3305.10)도 쓴다.</summary>
    internal static string? ClockOf(string? raw)
    {
        var text = raw?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        var match = StampTime.Match(text);
        if (!match.Success) match = DateTimeText.Match(text);
        if (!match.Success) match = ClockText.Match(text);
        if (!match.Success) return null;
        var hour = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var minute = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        if (hour > 23 || minute > 59) return null;
        return hour.ToString("00", CultureInfo.InvariantCulture) + ":" + minute.ToString("00", CultureInfo.InvariantCulture);
    }

    // ---- 정보 글 (AC-1402.5) --------------------------------------------------------------------

    /// <summary>비트 내원 구분(OcmDgsNfs)의 신환 값(DtlMst FTDNFS '신환', spec new-mark).</summary>
    private const string NewMark = "1";

    /// <summary>"54세 · 여 · 재진": 만 나이·성별(모르면 뺀다)과 끝 조각. 끝 조각은 내원 구분이 '1'이면 신환, 아니면 재진이다(예전 접수와 상관없이, AC-6205.1·6205.2).</summary>
    private static string InfoOf(VisitRow visit, DateTime today)
    {
        var parts = new List<string>(3);
        var birth = BirthOf(visit.BirthDate);
        if (birth != null)
        {
            var age = FullAge(birth.Value.Date, today);
            if (age >= 0 && age <= 150) parts.Add(age.ToString(CultureInfo.InvariantCulture) + "세");
        }
        var sex = SexOf(visit.Sex) ?? birth?.Sex;
        if (sex != null) parts.Add(sex);
        parts.Add(visit.Nfs == NewMark ? "신환" : "재진");
        return string.Join(Joiner, parts);
    }

    /// <summary>만 나이: 올해 생일(2월 29일생은 평년에 3월 1일)이 아직 안 왔으면 한 살 뺀다.</summary>
    private static int FullAge(DateTime birth, DateTime today)
    {
        var age = today.Year - birth.Year;
        if (today.Month < birth.Month || (today.Month == birth.Month && today.Day < birth.Day)) age--;
        return age;
    }

    /// <summary>생년월일(yyyyMMdd·yyyy-MM-dd…) 또는 주민번호 앞 7글자(YYMMDD+성별 숫자, 가운데 - 허용). 읽지 못하면 null.</summary>
    private static (DateTime Date, string? Sex)? BirthOf(string? raw)
    {
        var text = raw?.Trim();
        if (string.IsNullOrEmpty(text)) return null;

        var resident = ResidentPrefix.Match(text);
        if (resident.Success)
        {
            var digit = resident.Groups[4].Value[0] - '0';
            var century = digit switch
            {
                1 or 2 or 5 or 6 => 1900,
                3 or 4 or 7 or 8 => 2000,
                _ => 1800,
            };
            var date = DateOf(century + Number(resident.Groups[1]), Number(resident.Groups[2]), Number(resident.Groups[3]));
            return date == null ? null : (date.Value, digit % 2 == 1 ? "남" : "여");
        }

        var full = FullDate.Match(text);
        if (full.Success)
        {
            var date = DateOf(Number(full.Groups[1]), Number(full.Groups[2]), Number(full.Groups[3]));
            return date == null ? null : (date.Value, (string?)null);
        }
        return null;
    }

    private static int Number(Group group) => int.Parse(group.Value, CultureInfo.InvariantCulture);

    private static DateTime? DateOf(int year, int month, int day)
    {
        if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > DateTime.DaysInMonth(year, month)) return null;
        return new DateTime(year, month, day);
    }

    /// <summary>성별 칸 → "남"·"여". M·F·남·여·1~4(주민번호 성별 숫자)를 읽고 아니면 null.</summary>
    private static string? SexOf(string? raw)
    {
        switch (raw?.Trim().ToUpperInvariant())
        {
            case "M": case "MALE": case "남": case "남자": case "1": case "3": return "남";
            case "F": case "FEMALE": case "여": case "여자": case "2": case "4": return "여";
            default: return null;
        }
    }

    // ---- 처방·지난번 증상 글 (AC-1402.6) ---------------------------------------------------------

    /// <summary>오늘 처방이 있으면 "오늘"과 오늘 처방, 없고 지난 내원이 있으면 "지난번"과 그 내원의 증상 글(처방이 아님, TASK-37), 둘 다 없으면 첫 방문 글.</summary>
    private static (string Label, string Text) RxOf(VisitRow visit, bool hasPrior, IReadOnlyDictionary<string, string> names)
    {
        var today = RxText(visit.TodayRx, names);
        if (today.Length > 0) return ("오늘", today);
        if (hasPrior) return ("지난번", Clean(visit.LastSymptom) ?? "적힌 증상이 없어요");
        return ("처방", "첫 방문이라 지난 처방이 없어요");
    }

    /// <summary>"이름(코드)"를 코드 순(Ordinal)으로 " · "로 잇는다. 이름을 모르면 코드만. 같은 코드는 한 번.</summary>
    private static string RxText(IReadOnlyList<RxItem> items, IReadOnlyDictionary<string, string> names)
    {
        var parts = items
            .Select(item => (Code: item.Code.Trim(), item.Name))
            .Where(item => item.Code.Length > 0)
            .GroupBy(item => item.Code, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group =>
            {
                var name = group.Select(item => Clean(item.Name)).FirstOrDefault(found => found != null)
                    ?? (names.TryGetValue(group.Key, out var known) ? Clean(known) : null);
                return name == null ? group.Key : name + "(" + group.Key + ")";
            });
        return string.Join(Joiner, parts);
    }

    // ---- 그 밖 ----------------------------------------------------------------------------------

    /// <summary>X-ray 완료 표시 "HH:MM"(AC-1402.8). 없거나 모양이 틀리면 null.</summary>
    private static string? MarkOf(IReadOnlyDictionary<string, string> marks, string visitId) =>
        marks.TryGetValue(visitId, out var at) && at != null && MarkShape.IsMatch(at) ? at : null;

    /// <summary>앞뒤 공백을 뺀 글. 비었으면 null.</summary>
    private static string? Clean(string? text)
    {
        var trimmed = text?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    /// <summary>접수 원값 빠른 순, 같으면 내원번호 순(길이 먼저라 V9 다음 V10).</summary>
    private sealed class AcceptedOrder : IComparer<VisitRow>
    {
        public static readonly AcceptedOrder Instance = new AcceptedOrder();

        public int Compare(VisitRow? a, VisitRow? b)
        {
            if (ReferenceEquals(a, b)) return 0;
            if (a == null) return -1;
            if (b == null) return 1;
            var byTime = string.CompareOrdinal(a.AcceptedAt.Trim(), b.AcceptedAt.Trim());
            if (byTime != 0) return byTime;
            var byLength = a.VisitId.Length.CompareTo(b.VisitId.Length);
            return byLength != 0 ? byLength : string.CompareOrdinal(a.VisitId, b.VisitId);
        }
    }
}
