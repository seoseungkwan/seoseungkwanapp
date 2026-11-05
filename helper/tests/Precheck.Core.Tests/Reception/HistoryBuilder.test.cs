using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Detail 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Detail;

/// <summary>
/// 상세 글 만들기(HistoryBuilder, design.md 5절, REQ-1404). 읽은 날 줄(HistoryInput) → 휴대폰 JSON.
/// AC-1404.2 날짜 글·N일 전·증상 글·처방 목록, AC-1404.3 모두 N번·처음 온 날·더 보기(next·more),
/// AC-1404.4 오늘 카드(제목·이름표 넷·처방 없을 때 글·오늘 증상). 가짜 자료만 쓴다.
/// </summary>
public class HistoryBuilderTests
{
    private const string Today = "20261105";

    private static readonly IReadOnlyDictionary<string, string> Names = DetailFake.Names;

    private static IReadOnlyList<RxItem> Rx(params string[] codes) => RxItem.Of(codes, Names);

    private static HistoryVisit Visit(string id, string? day, string? symptom = null, params string[] codes) =>
        new HistoryVisit(id, day, Rx(codes), symptom);

    private static JsonElement[] Visits(JsonElement history) => history.GetProperty("visits").EnumerateArray().ToArray();

    private static string Text(JsonElement element, string name) => element.GetProperty(name).GetString()!;

    private static int? Next(JsonElement history) =>
        history.GetProperty("next").ValueKind == JsonValueKind.Null ? null : history.GetProperty("next").GetInt32();

    // ---- AC-1404.2 날짜 글·N일 전·증상·처방 ------------------------------------------------------------------

    [Fact(DisplayName = "AC-1404.2 날짜 글: 올해면 \"10월 29일\"(앞 0 없음), 다른 해면 \"2024년 3월 12일\"")]
    public void DateText()
    {
        var history = DetailApi.Build(Today, 0, 4, "20240312", new[]
        {
            Visit("V0204", "20261029"),
            Visit("V0203", "20260103"),
            Visit("V0202", "20251231"),
            Visit("V0201", "20240312"),
        }, null);

        Assert.Equal(new[] { "10월 29일", "1월 3일", "2025년 12월 31일", "2024년 3월 12일" }, Visits(history).Select(visit => Text(visit, "date")));
    }

    [Fact(DisplayName = "AC-1404.2 \"N일 전\": 7일 전·1일 전, 같은 날은 \"오늘\", 달·해를 넘어도 날 수로 센다")]
    public void AgoText()
    {
        var history = DetailApi.Build(Today, 0, 5, "20240229", new[]
        {
            Visit("V0205", "20261105"),
            Visit("V0204", "20261104"),
            Visit("V0203", "20261029"),
            Visit("V0202", "20251105"),
            Visit("V0201", "20240229"),
        }, null);
        Assert.Equal(new[] { "오늘", "1일 전", "7일 전", "365일 전", "980일 전" }, Visits(history).Select(visit => Text(visit, "ago")));

        var newYear = DetailApi.Build("20260103", 0, 1, "20251230", new[] { Visit("V0201", "20251230") }, null);
        Assert.Equal("2025년 12월 30일", Text(Visits(newYear)[0], "date"));
        Assert.Equal("4일 전", Text(Visits(newYear)[0], "ago"));
    }

    [Fact(DisplayName = "AC-1404.2 읽지 못한 날짜(빈·null·모양 틀림)는 날짜 글·N일 전을 지어내지 않고 \"\", 오늘보다 뒤인 날은 N일 전만 \"\"")]
    public void UnknownDates()
    {
        var history = DetailApi.Build(Today, 0, 4, "20240312", new[]
        {
            Visit("V0204", null),
            Visit("V0203", ""),
            Visit("V0202", "2026-10-29"),
            Visit("V0201", "20261106"),
        }, null);

        var visits = Visits(history);
        Assert.All(visits.Take(3), visit =>
        {
            Assert.Equal("", Text(visit, "date"));
            Assert.Equal("", Text(visit, "ago"));
        });
        Assert.Equal("11월 6일", Text(visits[3], "date"));
        Assert.Equal("", Text(visits[3], "ago"));
    }

    [Fact(DisplayName = "AC-1404.2 증상 글: 있으면 앞뒤 공백을 뺀 그대로, 없으면(null·빈 글·공백) \"\"(칸 없음)")]
    public void SymptomText()
    {
        var history = DetailApi.Build(Today, 0, 4, "20261001", new[]
        {
            Visit("V0204", "20261029", "  오른쪽 어깨 통증 조금 줄었음, 밤에 아픔 "),
            Visit("V0203", "20261022", null),
            Visit("V0202", "20261015", ""),
            Visit("V0201", "20261008", "   "),
        }, null);

        Assert.Equal(new[] { "오른쪽 어깨 통증 조금 줄었음, 밤에 아픔", "", "", "" }, Visits(history).Select(visit => Text(visit, "sym")));
    }

    [Fact(DisplayName = "AC-1404.2 처방 목록: 이름·코드를 코드 순으로, 이름표에 없는 코드는 이름 \"\", 처방 없는 내원은 빈 목록")]
    public void RxList()
    {
        var history = DetailApi.Build(Today, 0, 2, "20261022", new[]
        {
            Visit("V0202", "20261029", null, "PT01", "ZZ9", "DS20", "ESWT7"),
            Visit("V0201", "20261022", null),
        }, null);

        var visits = Visits(history);
        Assert.Equal(
            new (string, string)[] { ("도수치료 20분", "DS20"), ("체외충격파", "ESWT7"), ("표층열치료", "PT01"), ("", "ZZ9") },
            visits[0].GetProperty("rx").EnumerateArray().Select(rx => (Text(rx, "name"), Text(rx, "code"))).ToArray());
        Assert.Empty(visits[1].GetProperty("rx").EnumerateArray());
    }

    [Fact(DisplayName = "AC-1404.2 JSON 모양(design.md 5절): visits[date·ago·sym·rx[name·code]]·next·more·first·total·todaySym 차례, 환자 글의 <>&'\"는 \\u 글자로")]
    public void JsonShape()
    {
        var text = DetailApi.BuildText(Today, 0, 6, "20240312", new[] { Visit("V0206", "20261029", "<b>어깨</b> & \"목\" '팔'", "ESWT7") }, "오늘 <i>허리</i>");

        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        Assert.Equal(new[] { "visits", "next", "more", "first", "total", "todaySym" }, root.EnumerateObject().Select(property => property.Name));
        var visit = root.GetProperty("visits")[0];
        Assert.Equal(new[] { "date", "ago", "sym", "rx" }, visit.EnumerateObject().Select(property => property.Name));
        Assert.Equal(new[] { "name", "code" }, visit.GetProperty("rx")[0].EnumerateObject().Select(property => property.Name));
        Assert.Equal("<b>어깨</b> & \"목\" '팔'", Text(visit, "sym"));
        Assert.Equal("오늘 <i>허리</i>", Text(root, "todaySym"));
        Assert.DoesNotContain("<", text);
        Assert.DoesNotContain(">", text);
        Assert.DoesNotContain("&", text);
        Assert.DoesNotContain("'", text);
        Assert.Contains("\\u003Cb\\u003E", text);
        Assert.Contains("어깨", text);
        Assert.DoesNotContain("V0206", text);
    }

    // ---- AC-1404.3 모두 N번·처음 온 날·더 보기 --------------------------------------------------------------

    [Fact(DisplayName = "AC-1404.3 모두 n+1번(오늘 접수 포함), 처음 온 날은 가장 이른 완료 내원일 \"YYYY년 M월 D일\"(올해여도 해를 쓴다)")]
    public void TotalAndFirst()
    {
        var history = DetailApi.Build(Today, 0, 36, "20260105", new[] { Visit("V0236", "20261029") }, null);
        Assert.Equal(37, history.GetProperty("total").GetInt64());
        Assert.Equal("2026년 1월 5일", Text(history, "first"));

        var older = DetailApi.Build(Today, 0, 1, "20240312", new[] { Visit("V0201", "20240312") }, null);
        Assert.Equal(2, older.GetProperty("total").GetInt64());
        Assert.Equal("2024년 3월 12일", Text(older, "first"));
    }

    [Fact(DisplayName = "AC-1404.3 지난 내원이 없으면 처음 온 날은 오늘·모두 1번·지난 진료 없음(visits 빈 목록, next null, more 0)")]
    public void FirstVisit()
    {
        var history = DetailApi.Build(Today, 0, 0, null, new HistoryVisit[0], null);
        Assert.Empty(Visits(history));
        Assert.Null(Next(history));
        Assert.Equal(0, history.GetProperty("more").GetInt64());
        Assert.Equal(1, history.GetProperty("total").GetInt64());
        Assert.Equal("2026년 11월 5일", Text(history, "first"));
    }

    [Fact(DisplayName = "AC-1404.3 처음 온 날을 읽지 못했으면 지어내지 않고 \"\"")]
    public void FirstUnknown()
    {
        var history = DetailApi.Build(Today, 0, 2, "2024-03-12", new[] { Visit("V0202", "20261029"), Visit("V0201", "20261022") }, null);
        Assert.Equal("", Text(history, "first"));
        Assert.Equal(3, history.GetProperty("total").GetInt64());
    }

    [Fact(DisplayName = "AC-1404.3 안 보인 지난 내원 수 more와 다음 시작 next: 5번 주면 next 5·more 31, 다 주면 next null·more 0(단추 없음)")]
    public void MoreAndNext()
    {
        HistoryVisit[] Chunk(int from, int count) =>
            Enumerable.Range(from + 1, count).Select(seq => Visit(DetailFake.VisitId(seq), DetailFake.DayOf(seq))).ToArray();

        foreach (var (from, given, earlier, next, more) in new (int, int, long, int?, long)[]
        {
            (0, 5, 36, 5, 31),
            (5, 20, 36, 25, 11),
            (25, 11, 36, null, 0),
            (0, 5, 5, null, 0),
            (0, 3, 3, null, 0),
            (0, 5, 6, 5, 1),
            (36, 0, 36, null, 0),
            (40, 0, 36, null, 0),
        })
        {
            var history = DetailApi.Build(Today, from, earlier, "20250626", Chunk(from, given), null);
            Assert.Equal(given, Visits(history).Length);
            Assert.Equal(next, Next(history));
            Assert.Equal(more, history.GetProperty("more").GetInt64());
            Assert.Equal(earlier + 1, history.GetProperty("total").GetInt64());
        }
    }

    [Fact(DisplayName = "AC-1404.3 한 번에 주는 수(HistoryChunk): from=0이면 5번, 그 뒤는 20번")]
    public void Chunks()
    {
        Assert.Equal(5, HistoryChunk.First);
        Assert.Equal(20, HistoryChunk.Next);
        Assert.Equal(5, HistoryChunk.SizeAt(0));
        Assert.Equal(20, HistoryChunk.SizeAt(5));
        Assert.Equal(20, HistoryChunk.SizeAt(25));
    }

    // ---- AC-1404.4 오늘 카드 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1404.4 오늘 카드 제목은 \"M월 D일 · 오늘\"(앞 0 없음)")]
    public void TodayTitle()
    {
        Assert.Equal("11월 5일 · 오늘", HistoryBuilder.TodayTitle("20261105"));
        Assert.Equal("1월 1일 · 오늘", HistoryBuilder.TodayTitle("20270101"));
        Assert.Equal("12월 31일 · 오늘", HistoryBuilder.TodayTitle("20261231"));
    }

    [Fact(DisplayName = "AC-1404.4 오늘 이름표 네 가지: 진료대기 \"진료 전\"·진료보류 \"진료보류\"·수납대기 \"수납대기\"·끝남 \"수납완료\"(숨김 줄은 카드가 없다)")]
    public void TodayLabels()
    {
        Assert.Equal("진료 전", HistoryBuilder.TodayLabel(Lane.Wait));
        Assert.Equal("진료보류", HistoryBuilder.TodayLabel(Lane.Hold));
        Assert.Equal("수납대기", HistoryBuilder.TodayLabel(Lane.Pay));
        Assert.Equal("수납완료", HistoryBuilder.TodayLabel(Lane.Done));
        Assert.Throws<ArgumentOutOfRangeException>(() => HistoryBuilder.TodayLabel(Lane.Hidden));
    }

    [Fact(DisplayName = "AC-1404.4 오늘 처방이 없을 때 글은 \"아직 처방이 없어요. 진료가 끝나면 여기에 나와요.\"")]
    public void NoTodayRxText()
    {
        Assert.Equal("아직 처방이 없어요. 진료가 끝나면 여기에 나와요.", HistoryBuilder.NoTodayRx);
    }

    [Fact(DisplayName = "AC-1404.4 오늘 증상이 있으면 todaySym에 그 글(앞뒤 공백 뺌), 없으면 \"\"")]
    public void TodaySymptom()
    {
        var with = DetailApi.Build(Today, 0, 0, null, new HistoryVisit[0], " 오른쪽 어깨 통증 심해짐 ");
        Assert.Equal("오른쪽 어깨 통증 심해짐", Text(with, "todaySym"));

        foreach (var none in new[] { null, "", "  " })
        {
            var without = DetailApi.Build(Today, 0, 0, null, new HistoryVisit[0], none);
            Assert.Equal("", Text(without, "todaySym"));
        }
    }
}
