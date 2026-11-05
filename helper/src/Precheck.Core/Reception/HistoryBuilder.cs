using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;

namespace Precheck.Core.Reception;

/// <summary>상세 한 번에 주는 지난 내원 수(design.md 5절): 처음(from=0) 5번(승인 시안), 그 뒤 [더 보기]마다 20번.</summary>
public static class HistoryChunk
{
    public const int First = 5;

    public const int Next = 20;

    /// <summary>시작 위치 from에서 이번에 주는 수.</summary>
    public static int SizeAt(int from) => from == 0 ? First : Next;
}

/// <summary>상세의 지난 내원 카드 하나(휴대폰 글). 내원번호는 없다(AC-1402.9).</summary>
public sealed class HistoryCard
{
    public HistoryCard(string date, string ago, string sym, IReadOnlyList<RxItem> rx)
    {
        Date = date ?? "";
        Ago = ago ?? "";
        Sym = sym ?? "";
        Rx = rx ?? throw new ArgumentNullException(nameof(rx));
    }

    /// <summary>"10월 29일"(올해) 또는 "2024년 3월 12일"(다른 해). 날짜를 읽지 못했으면 "".</summary>
    public string Date { get; }

    /// <summary>"7일 전", 같은 날이면 "오늘". 날짜를 읽지 못했거나 오늘보다 뒤면 "".</summary>
    public string Ago { get; }

    /// <summary>증상 글. 없으면 ""(화면은 증상 칸을 그리지 않는다).</summary>
    public string Sym { get; }

    /// <summary>처방(코드 순). 이름표에 없는 코드는 이름이 null이고 JSON에는 ""로 간다.</summary>
    public IReadOnlyList<RxItem> Rx { get; }
}

/// <summary>
/// 휴대폰이 받는 상세 한 쪽(design.md 5절, `GET /api/visit/{k}/history?from=N` 200). 요청마다 HistoryBuilder가 만들고 서버에 쌓지 않는다.
/// 오늘 카드의 상태·오늘 처방은 화면이 가진 접수 현황 줄로 그리고(10초마다 바뀜), 여기에는 오늘 증상(TodaySym)만 있다.
/// </summary>
public sealed class VisitHistory
{
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        // 한국어는 그대로 두고, HTML에서 뜻이 있는 글자(<>&'")와 제어 글자는 \u 로 쓴다
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
    };

    public VisitHistory(IReadOnlyList<HistoryCard> visits, int? next, long more, string first, long total, string todaySym)
    {
        Visits = visits ?? throw new ArgumentNullException(nameof(visits));
        if (more < 0) throw new ArgumentOutOfRangeException(nameof(more));
        if (total < 1) throw new ArgumentOutOfRangeException(nameof(total));
        Next = next;
        More = more;
        First = first ?? "";
        Total = total;
        TodaySym = todaySym ?? "";
    }

    /// <summary>이번 쪽의 지난 내원(최근 순).</summary>
    public IReadOnlyList<HistoryCard> Visits { get; }

    /// <summary>[더 보기]가 보낼 다음 시작 위치. 더 없으면 null(단추 없음).</summary>
    public int? Next { get; }

    /// <summary>아직 안 준 지난 내원 수(Next가 null이면 0).</summary>
    public long More { get; }

    /// <summary>처음 온 날 "YYYY년 M월 D일"(지난 내원이 없으면 오늘). 읽지 못했으면 "".</summary>
    public string First { get; }

    /// <summary>모두 온 수 = 앞선 완료 내원 수 + 1(오늘 접수).</summary>
    public long Total { get; }

    /// <summary>오늘 접수의 증상 글. 없으면 "".</summary>
    public string TodaySym { get; }

    /// <summary>
    /// 휴대폰에 보내는 JSON(design.md 5절):
    /// <c>{ "visits":[{date, ago, sym, rx:[{name, code}]}], "next", "more", "first", "total", "todaySym" }</c>.
    /// </summary>
    public string ToJson()
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteStartArray("visits");
            foreach (var visit in Visits)
            {
                writer.WriteStartObject();
                writer.WriteString("date", visit.Date);
                writer.WriteString("ago", visit.Ago);
                writer.WriteString("sym", visit.Sym);
                writer.WriteStartArray("rx");
                foreach (var rx in visit.Rx)
                {
                    writer.WriteStartObject();
                    writer.WriteString("name", rx.Name ?? "");
                    writer.WriteString("code", rx.Code);
                    writer.WriteEndObject();
                }
                writer.WriteEndArray();
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            if (Next is int next) writer.WriteNumber("next", next);
            else writer.WriteNull("next");
            writer.WriteNumber("more", More);
            writer.WriteString("first", First);
            writer.WriteNumber("total", Total);
            writer.WriteString("todaySym", TodaySym);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}

/// <summary>
/// 상세 글 만들기(design.md 5절, REQ-1404). 읽은 날 줄(HistoryInput) → 휴대폰 글(VisitHistory). 글은 여기 한 곳에서 만들고 화면은 그대로 그린다.
/// 날짜는 비트의 날(yyyyMMdd)끼리만 센다(휴대폰 시계를 쓰지 않는다). 모르는 값은 지어내지 않고 ""로 둔다(AC-1402.7).
/// </summary>
public static class HistoryBuilder
{
    /// <summary>오늘 카드에 오늘 처방이 없을 때 글(AC-1404.4, 승인 시안).</summary>
    public const string NoTodayRx = "아직 처방이 없어요. 진료가 끝나면 여기에 나와요.";

    private const string DayFormat = "yyyyMMdd";

    /// <summary>
    /// 지난 진료 한 쪽(AC-1404.2·AC-1404.3): 내원마다 날짜 글·N일 전·증상·처방, 다음 시작 위치(next)·안 보인 수(more),
    /// 처음 온 날(지난 내원이 없으면 오늘)·모두 N번(오늘 포함)·오늘 증상.
    /// </summary>
    public static VisitHistory Build(HistoryInput input)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        var today = DayOf(input.Day) ?? throw new ArgumentException("오늘 날짜 모양이 틀렸다", nameof(input));

        var cards = input.Visits
            .Select(visit =>
            {
                var day = DayOf(visit.Day);
                return new HistoryCard(DateText(day, today), AgoText(day, today), Clean(visit.Symptom), visit.Rx);
            })
            .ToArray();

        var shown = (long)input.From + cards.Length;
        int? next = cards.Length > 0 && shown < input.EarlierCount && shown <= int.MaxValue ? (int)shown : null;
        var more = next == null ? 0 : input.EarlierCount - shown;
        var first = input.EarlierCount == 0 ? FullDate(today) : DayOf(input.FirstDay) is DateTime firstDay ? FullDate(firstDay) : "";

        return new VisitHistory(cards, next, more, first, input.EarlierCount + 1, Clean(input.TodaySymptom));
    }

    /// <summary>오늘 카드 제목 "M월 D일 · 오늘"(AC-1404.4). day는 yyyyMMdd.</summary>
    public static string TodayTitle(string day)
    {
        var today = DayOf(day) ?? throw new ArgumentException("날짜 모양이 틀렸다", nameof(day));
        return ShortDate(today) + " · 오늘";
    }

    /// <summary>오늘 카드 오른쪽 이름표(AC-1404.4): 진료대기 "진료 전", 진료보류 "진료보류", 수납대기 "수납대기", 끝남 "수납완료". 숨김 줄은 카드가 없다.</summary>
    public static string TodayLabel(Lane lane) => lane switch
    {
        Lane.Wait => "진료 전",
        Lane.Hold => "진료보류",
        Lane.Pay => "수납대기",
        Lane.Done => "수납완료",
        _ => throw new ArgumentOutOfRangeException(nameof(lane)),
    };

    /// <summary>올해면 "10월 29일", 다른 해면 "2024년 3월 12일". 모르면 "".</summary>
    private static string DateText(DateTime? day, DateTime today) =>
        day is DateTime known ? (known.Year == today.Year ? ShortDate(known) : FullDate(known)) : "";

    /// <summary>"N일 전", 같은 날이면 "오늘". 모르거나 오늘보다 뒤면 "".</summary>
    private static string AgoText(DateTime? day, DateTime today)
    {
        if (!(day is DateTime known)) return "";
        var days = (today - known).Days;
        if (days < 0) return "";
        return days == 0 ? "오늘" : days.ToString(CultureInfo.InvariantCulture) + "일 전";
    }

    private static string ShortDate(DateTime day) =>
        day.Month.ToString(CultureInfo.InvariantCulture) + "월 " + day.Day.ToString(CultureInfo.InvariantCulture) + "일";

    private static string FullDate(DateTime day) => day.Year.ToString(CultureInfo.InvariantCulture) + "년 " + ShortDate(day);

    /// <summary>비트 날 글(yyyyMMdd, 앞뒤 공백 무시) → 날. 모양이 틀리면 null.</summary>
    private static DateTime? DayOf(string? text)
    {
        if (text == null) return null;
        return DateTime.TryParseExact(text.Trim(), DayFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ? day : (DateTime?)null;
    }

    private static string Clean(string? text) => text?.Trim() ?? "";
}
