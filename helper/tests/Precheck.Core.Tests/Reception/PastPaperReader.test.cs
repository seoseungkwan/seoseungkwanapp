using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Xunit;

// 이 기능의 지난 종이 시험만 한 거르기로 돌리려고 PastPaper 이름 공간에 둔다(문장·길 시험과 같은 감싸개)
namespace Precheck.Core.Tests.Reception.PastPaper;

/// <summary>
/// 지난 진료기록부 여러 장 읽기(PastPaperReader, spec reception-memo-papers design.md 4절, REQ-3404).
/// AC-3404.1 from=0이면 최근 순 1~2번째, from&gt;0이면 from+1~from+3번째 지난 완료 내원의 종이 { papers:[{date, ago, room, ins, sym, dx, rx, out}], total, next }.
/// AC-3404.2 상세와 같은 지난 내원(HistoryCount 수)의 Seq 범위만 문장 넷으로 읽고, 증상·처방 글은 /prev와 같은 규칙이다.
/// 가짜 DB·가짜 자료만 쓴다(차트번호 9로 시작하는 6자리, 내원번호 V+숫자).
/// </summary>
public class PastPaperReaderTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 5, 10, 0, 0);

    private static VisitRow Visit(string chart = "900101", string? lastVisitId = "V2001", string accepted = "20261105091230") =>
        new VisitRow("V1001", chart, accepted, "S1", "N", earlierCount: 4, lastVisitId: lastVisitId, lastDay: "20261029");

    private static BoardInput Board(VisitRow visit) =>
        new BoardInput("20261105", Today, new[] { visit }, new Dictionary<string, string>(StringComparer.Ordinal) { ["PT01"] = "표층열치료" });

    private static PastPapers Read(FakeDb db, VisitRow visit, int from) =>
        PastPaperReader.Read(db, Synthetic.Scope, visit, Board(visit), from, Today, new CacheClock(Today).Now, Today.AddSeconds(8));

    [Fact(DisplayName = "AC-3404.1 쪽 크기는 from=0이면 2장, 그 뒤는 3장이다(PaperChunk)")]
    public void ChunkSizes()
    {
        Assert.Equal((2, 3), (PaperChunk.First, PaperChunk.Next));
        Assert.Equal(2, PaperChunk.SizeAt(0));
        Assert.Equal(3, PaperChunk.SizeAt(2));
        Assert.Equal(3, PaperChunk.SizeAt(5));
    }

    [Fact(DisplayName = "AC-3404.1 AC-3404.2 from=0은 HistoryCount를 읽고 문장 넷을 @chart(끝 공백만 뺌)·@before(접수 시각 원값)·@hospital·@first=1·@last=2로 차례로 돌려 1~2번째 종이를 준다")]
    public void FirstPage()
    {
        var db = PastFake.Answer(new FakeDb(), 4);

        var papers = Read(db, Visit(" 900101 "), 0);

        Assert.Equal(new[] { ReceptionSql.HistoryCount }.Concat(PastFake.Sqls), db.Sqls);
        Assert.All(db.Calls, call =>
        {
            Assert.Equal(" 900101", call.Args["@chart"]);
            Assert.Equal("20261105091230", call.Args["@before"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.True(call.Timeout > TimeSpan.Zero && call.Timeout <= TimeSpan.FromSeconds(8));
        });
        Assert.All(db.Calls.Skip(1), call => Assert.Equal((1, 2), ((int)call.Args["@first"]!, (int)call.Args["@last"]!)));
        Assert.Equal(new[] { "2026-10-29", "2026-10-15" }, papers.Papers.Select(p => p.Date));
        Assert.Equal((4L, (int?)2), (papers.Total, papers.Next));
    }

    [Fact(DisplayName = "AC-3404.1 from>0은 from+1~from+3번째(3장)이고, 다 주면 next는 null, from이 수 이상이면 문장 넷을 돌리지 않고 빈 쪽이다")]
    public void LaterPages()
    {
        var db = PastFake.Answer(new FakeDb(), 7);
        var second = Read(db, Visit(), 2);
        Assert.All(db.Calls.Skip(1), call => Assert.Equal((3, 5), ((int)call.Args["@first"]!, (int)call.Args["@last"]!)));
        Assert.Equal(new[] { 3, 4, 5 }.Select(PastFake.DashedDay), second.Papers.Select(p => p.Date));
        Assert.Equal((7L, (int?)5), (second.Total, second.Next));

        var last = Read(PastFake.Answer(new FakeDb(), 7), Visit(), 5);
        Assert.Equal(new[] { 6, 7 }.Select(PastFake.DashedDay), last.Papers.Select(p => p.Date));
        Assert.Equal((7L, (int?)null), (last.Total, last.Next));

        var beyond = PastFake.Answer(new FakeDb(), 7);
        var empty = Read(beyond, Visit(), 7);
        Assert.Equal(new[] { ReceptionSql.HistoryCount }, beyond.Sqls);
        Assert.Empty(empty.Papers);
        Assert.Equal((7L, (int?)null), (empty.Total, empty.Next));
    }

    [Fact(DisplayName = "AC-3404.1 종이 칸은 /prev와 같다: date(yyyy-MM-dd)·ago(N일 전)·room·ins·sym·dx·rx·out, 원외처방(XX)은 out으로 가고 줄은 내원번호(앞뒤 공백 무시)로 제 종이에 붙는다")]
    public void PaperFields()
    {
        var papers = Read(PastFake.Answer(new FakeDb(), 4), Visit(), 0).Papers;

        var first = papers[0];
        Assert.Equal(("2026-10-29", "7일 전", "1진료실", "국민건강보험"), (first.Date, first.Ago, first.Room, first.Ins));
        Assert.Equal(RtfText.Tidy("  어깨 통증  \n\n밤에 아픔"), first.Sym);
        Assert.Equal(new[] { ("M545", "요통", true) }, first.Dx.Select(d => (d.Code, d.Name, d.Main)));
        Assert.Equal(new[] { "PT01" }, first.Rx.Select(o => o.Code));
        Assert.Equal(new[] { "641901440" }, first.Out.Select(o => o.Code));

        var second = papers[1];
        Assert.Equal(("2026-10-15", "21일 전"), (second.Date, second.Ago));
        Assert.Equal("허리 통증", second.Sym);
        Assert.Equal(new[] { ("M791", "근육통", false) }, second.Dx.Select(d => (d.Code, d.Name, d.Main)));
        Assert.Equal(new[] { "ESWT7" }, second.Rx.Select(o => o.Code));
        Assert.Empty(second.Out);
    }

    [Fact(DisplayName = "AC-3404.2 증상 글은 줄마다 정리해 /prev와 같은 규칙(RtfText.Tidy)이고, 처방 이름은 그 줄의 이름(비면 그날 이름표), 용량은 0.#### 글이다")]
    public void TextRulesLikePrev()
    {
        var first = Read(PastFake.Answer(new FakeDb(), 4), Visit(), 0).Papers[0];

        Assert.Equal(("표층열치료", "1", "1", "1"), (first.Rx[0].Name, first.Rx[0].Qty, first.Rx[0].Tms, first.Rx[0].Day));
        Assert.Equal(("타이레놀정", "2.5", "3", "5"), (first.Out[0].Name, first.Out[0].Qty, first.Out[0].Tms, first.Out[0].Day));
    }

    [Fact(DisplayName = "AC-3404.1 내원 줄이 겹쳐도(겹친 DepMst 줄) 첫 줄만 쓰고, 한 쪽보다 많이 주지 않으며, 증상·상병·처방 줄이 없는 내원은 빈 칸이다")]
    public void DuplicateAndMissingRows()
    {
        var db = PastFake.Answer(new FakeDb(), 4);
        db.Answer(ReceptionSql.PastPaperVisits, _ => new[]
        {
            new object?[] { PastFake.Id(1), PastFake.Day(1), "1진료실", "국민건강보험" },
            new object?[] { PastFake.Id(1), PastFake.Day(1), "옛 진료실", "옛 보험" },
            new object?[] { PastFake.Id(2), PastFake.Day(2), "2진료실", "" },
            new object?[] { PastFake.Id(3), PastFake.Day(3), "3진료실", "" },
        });
        db.Answer(ReceptionSql.PastPaperSymptoms, _ => new object?[0][]);
        db.Answer(ReceptionSql.PastPaperDx, _ => new object?[0][]);
        db.Answer(ReceptionSql.PastPaperOrders, _ => new object?[0][]);

        var papers = Read(db, Visit(), 0).Papers;

        Assert.Equal(new[] { "1진료실", "2진료실" }, papers.Select(p => p.Room));
        Assert.All(papers, p =>
        {
            Assert.Equal("", p.Sym);
            Assert.Empty(p.Dx);
            Assert.Empty(p.Rx);
            Assert.Empty(p.Out);
        });
    }

    [Fact(DisplayName = "AC-3404.1 차트번호나 접수 시각이 비면 다른 환자를 읽지 않게 아무 문장도 돌리지 않고 빈 쪽(total 0)이다")]
    public void BlankChartReadsNothing()
    {
        var db = PastFake.Answer(new FakeDb(), 4);
        var none = Read(db, Visit(chart: "   "), 0);
        var noTime = Read(db, Visit(accepted: " "), 0);

        Assert.Empty(db.Calls);
        Assert.Empty(none.Papers);
        Assert.Equal((0L, (int?)null), (none.Total, none.Next));
        Assert.Empty(noTime.Papers);
    }

    [Fact(DisplayName = "AC-3404.1 JSON은 {\"papers\":[{date, ago, room, ins, sym, dx[{code,name,main}], rx[{code,name,qty,tms,day}], out}], \"total\", \"next\"}이고 사람 칸·내원번호는 없다")]
    public void Json()
    {
        using var document = JsonDocument.Parse(Read(PastFake.Answer(new FakeDb(), 4), Visit(), 0).ToJson());
        var root = document.RootElement;
        Assert.Equal(new[] { "papers", "total", "next" }, root.EnumerateObject().Select(p => p.Name));
        Assert.Equal(4, root.GetProperty("total").GetInt64());
        Assert.Equal(2, root.GetProperty("next").GetInt32());
        var paper = root.GetProperty("papers")[0];
        Assert.Equal(new[] { "date", "ago", "room", "ins", "sym", "dx", "rx", "out" }, paper.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "code", "name", "main" }, paper.GetProperty("dx")[0].EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "code", "name", "qty", "tms", "day" }, paper.GetProperty("rx")[0].EnumerateObject().Select(p => p.Name));
        foreach (var hidden in new[] { "res", "addr", "tel", "cel", "special", "visitId", "VisitId" }) Assert.False(paper.TryGetProperty(hidden, out _));
        Assert.DoesNotContain("V2001", root.GetRawText(), StringComparison.Ordinal);

        Assert.Equal("{\"papers\":[],\"total\":0,\"next\":null}", PastPapers.Empty.ToJson());
    }

    [Fact(DisplayName = "AC-3404.1 읽기 한 번의 시간 제한 8초: 문장마다 남은 시간을 주고, 다 쓰면 다음 문장을 돌리지 않고 E-BIT-READ-FAILED")]
    public void OneBudget()
    {
        var clock = new CacheClock(Today);
        var db = PastFake.Answer(new FakeDb(), 4);
        db.Answer(ReceptionSql.PastPaperVisits, args =>
        {
            clock.Advance(TimeSpan.FromSeconds(8));
            return PastFake.Visits(args, 4);
        });

        var error = Assert.Throws<BitException>(() =>
            PastPaperReader.Read(db, Synthetic.Scope, Visit(), Board(Visit()), 0, Today, clock.Now, Today.AddSeconds(8)));

        Assert.Equal(BitErrors.ReadFailed, error.Code);
        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.PastPaperVisits }, db.Sqls);
    }

    [Fact(DisplayName = "AC-3404.1 문장이 실패하거나 칸이 모자라거나 수가 틀리면 일부만 주지 않고 E-BIT-READ-FAILED가 올라간다")]
    public void Failures()
    {
        var cases = new List<FakeDb>
        {
            PastFake.Answer(new FakeDb(), 4).Fail(ReceptionSql.PastPaperDx, BitErrors.ReadFailed),
            PastFake.Answer(new FakeDb(), 4).Answer(ReceptionSql.PastPaperVisits, _ => new[] { new object?[] { PastFake.Id(1), PastFake.Day(1), "1진료실" } }),
            PastFake.Answer(new FakeDb(), 4).Answer(ReceptionSql.PastPaperOrders, _ => new[] { new object?[] { PastFake.Id(1), "PT01", "", 1m, 1m, 1m } }),
            PastFake.Answer(new FakeDb(), 4).Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { "많음", "20250626" } }),
            PastFake.Answer(new FakeDb(), 4).Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { -1L, "20250626" } }),
            PastFake.Answer(new FakeDb(), 4).Answer(ReceptionSql.HistoryCount, _ => new object?[0][]),
        };
        foreach (var db in cases)
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(db, Visit(), 0)).Code);
    }
}

/// <summary>
/// 지난 종이 문장 흉내(모두 지어낸 자료): 지난 내원 seq(1이 가장 최근)마다 내원번호 V2000+seq(char 10처럼 뒤 공백),
/// 날은 2026-10-29부터 14일씩 앞. 문장처럼 @first~@last번째만, H.Seq 순으로 답한다.
/// </summary>
internal static class PastFake
{
    /// <summary>지난 종이 문장 넷, 도는 차례.</summary>
    public static readonly string[] Sqls =
    {
        ReceptionSql.PastPaperVisits, ReceptionSql.PastPaperSymptoms, ReceptionSql.PastPaperDx, ReceptionSql.PastPaperOrders,
    };

    public static string Id(int seq) => ("V" + (2000 + seq).ToString(CultureInfo.InvariantCulture)).PadRight(10);

    public static string Day(int seq) => new DateTime(2026, 10, 29).AddDays(-14 * (seq - 1)).ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    public static string DashedDay(int seq) => new DateTime(2026, 10, 29).AddDays(-14 * (seq - 1)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static IEnumerable<int> Range(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var first = (int)args["@first"]!;
        var last = Math.Min((int)args["@last"]!, earlier);
        for (var seq = first; seq <= last; seq++) yield return seq;
    }

    public static object?[][] Visits(IReadOnlyDictionary<string, object?> args, int earlier) =>
        Range(args, earlier).Select(seq => new object?[] { Id(seq), Day(seq), seq == 1 ? " 1진료실 " : seq + "진료실", seq == 1 ? "국민건강보험" : "" }).ToArray();

    /// <summary>증상 줄: 1번은 빈 줄을 낀 세 줄, 2번은 한 줄(내원번호 앞 공백), 그 밖은 없음. 1·2번 줄을 섞어 준다(묶기는 내원번호로).</summary>
    public static object?[][] Symptoms(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var seqs = new HashSet<int>(Range(args, earlier));
        var rows = new List<object?[]>();
        if (seqs.Contains(1)) rows.Add(new object?[] { Id(1), "  어깨 통증  " });
        if (seqs.Contains(2)) rows.Add(new object?[] { "  " + Id(2).Trim(), "허리 통증" });
        if (seqs.Contains(1)) rows.Add(new object?[] { Id(1), "" });
        if (seqs.Contains(1)) rows.Add(new object?[] { Id(1), "밤에 아픔" });
        return rows.ToArray();
    }

    public static object?[][] Dx(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var rows = new List<object?[]>();
        foreach (var seq in Range(args, earlier))
        {
            if (seq == 1) rows.Add(new object?[] { Id(1), "M545", "요통", "1" });
            if (seq == 2) rows.Add(new object?[] { Id(2), "M791", "근육통", "" });
        }
        return rows.ToArray();
    }

    public static object?[][] Orders(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var rows = new List<object?[]>();
        foreach (var seq in Range(args, earlier))
        {
            if (seq == 1)
            {
                rows.Add(new object?[] { Id(1), "PT01", "", 1.000m, 1m, 1m, "" });
                rows.Add(new object?[] { Id(1), "641901440", "타이레놀정", "2.500", 3, 5, "XX" });
            }
            if (seq == 2) rows.Add(new object?[] { Id(2), "ESWT7", "체외충격파", 1.0, 1, 1, " " });
        }
        return rows.ToArray();
    }

    /// <summary>HistoryCount(지난 내원 수·첫날)와 지난 종이 넷을 답하게 한다.</summary>
    public static T Answer<T>(T db, int earlier) where T : FakeDb
    {
        db.Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { (long)earlier, earlier == 0 ? null : Day(earlier) } });
        db.Answer(ReceptionSql.PastPaperVisits, args => Visits(args, earlier));
        db.Answer(ReceptionSql.PastPaperSymptoms, args => Symptoms(args, earlier));
        db.Answer(ReceptionSql.PastPaperDx, args => Dx(args, earlier));
        db.Answer(ReceptionSql.PastPaperOrders, args => Orders(args, earlier));
        return db;
    }
}
