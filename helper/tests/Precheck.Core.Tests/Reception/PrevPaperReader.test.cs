using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Xunit;
using Prev = Precheck.Core.Reception.PrevPaper;

// 이 TASK의 시험만 한 거르기로 돌리려고 PrevPaper 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PrevPaper;

/// <summary>
/// 직전 진료기록부 읽기(PrevPaperReader, spec reception-arrange design.md 9절, REQ-3307).
/// AC-3307.1 그 접수의 가장 최근 지난 완료 내원(LastVisitId) 하나의 종이 자료 { date, ago, room, ins, sym, dx, rx, out }, 지난 내원이 없으면 prev null.
/// AC-3307.3 읽기 실패는 예외로 올라간다(라우터가 503). AC-3307.4 증상·처방 글은 reception-paper와 같은 규칙.
/// 가짜 DB·가짜 자료만 쓴다(차트번호 9로 시작하는 6자리, 내원번호 V+숫자).
/// </summary>
public class PrevPaperReaderTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 5, 10, 0, 0);

    private static VisitRow Visit(string? lastVisitId, string chart = "900101") =>
        new VisitRow("V1001", chart, "20261105091230", "S1", "N", lastVisitId: lastVisitId, lastDay: lastVisitId == null ? null : "20261029");

    private static BoardInput Board(VisitRow visit) =>
        new BoardInput("20261105", Today, new[] { visit }, new Dictionary<string, string>(StringComparer.Ordinal) { ["PT01"] = "표층열치료" });

    private static FakeDb Answered()
    {
        var db = new FakeDb();
        db.Answer(ReceptionSql.PrevPaperVisit, _ => new[] { new object?[] { "20261029", " 정형외과 1진료실 ", "건강보험" } });
        db.Answer(ReceptionSql.PrevPaperSymptoms, _ => new[] { new object?[] { "  허리 통증  " }, new object?[] { "" }, new object?[] { "밤에 아픔" } });
        db.Answer(ReceptionSql.PrevPaperDx, _ => new[] { new object?[] { "M545", "요통", "1" }, new object?[] { "M791", "근육통", "" } });
        db.Answer(ReceptionSql.PrevPaperOrders, _ => new[]
        {
            new object?[] { "PT01", "", 1.000m, 1m, 1m, "" },
            new object?[] { "ESWT7", "체외충격파", "2.500", 1, 1, " " },
            new object?[] { "641901440", "타이레놀정", 1.0, 3, 5, "XX" },
        });
        return db;
    }

    private static Prev? Read(FakeDb db, VisitRow visit) =>
        PrevPaperReader.Read(db, Synthetic.Scope, visit, Board(visit), Today, new CacheClock(Today).Now, Today.AddSeconds(8));

    [Fact(DisplayName = "AC-3307.1 가장 최근 지난 완료 내원 하나를 @chart(끝 공백만 뺌)·@visit(LastVisitId)·@hospital로 직전 종이 넷 차례로 읽는다")]
    public void ReadsLastVisit()
    {
        var db = Answered();

        var prev = Read(db, Visit("V0901", " 900101 "));

        Assert.NotNull(prev);
        Assert.Equal(new[] { ReceptionSql.PrevPaperVisit, ReceptionSql.PrevPaperSymptoms, ReceptionSql.PrevPaperDx, ReceptionSql.PrevPaperOrders }, db.Sqls);
        Assert.All(db.Calls, call =>
        {
            Assert.Equal(" 900101", call.Args["@chart"]);
            Assert.Equal("V0901", call.Args["@visit"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.True(call.Timeout > TimeSpan.Zero && call.Timeout <= TimeSpan.FromSeconds(8));
        });
    }

    [Fact(DisplayName = "AC-3307.1 답은 date(yyyy-MM-dd)·ago(N일 전)·room·ins·sym·dx·rx·out이고 원외처방(XX)은 out으로 간다")]
    public void PrevShape()
    {
        var prev = Read(Answered(), Visit("V0901"))!;

        Assert.Equal(("2026-10-29", "7일 전", "정형외과 1진료실", "건강보험"), (prev.Date, prev.Ago, prev.Room, prev.Ins));
        Assert.Equal(new[] { ("M545", "요통", true), ("M791", "근육통", false) }, prev.Dx.Select(d => (d.Code, d.Name, d.Main)));
        Assert.Equal(new[] { "PT01", "ESWT7" }, prev.Rx.Select(o => o.Code));
        Assert.Equal(new[] { "641901440" }, prev.Out.Select(o => o.Code));
    }

    [Fact(DisplayName = "AC-3307.1 지난 내원이 없으면(LastVisitId null) 비트를 읽지 않고 null, 그 내원 줄이 없어도 null이다")]
    public void NoLastVisit()
    {
        var db = Answered();
        Assert.Null(Read(db, Visit(null)));
        Assert.Empty(db.Calls);

        var empty = Answered();
        empty.Answer(ReceptionSql.PrevPaperVisit, _ => new object?[0][]);
        Assert.Null(Read(empty, Visit("V0901")));
    }

    [Fact(DisplayName = "AC-3307.1 JSON은 {\"prev\": {date, ago, room, ins, sym, dx[{code,name,main}], rx[{code,name,qty,tms,day}], out}} 또는 {\"prev\": null}이고 사람 칸은 없다")]
    public void Json()
    {
        using var document = JsonDocument.Parse(Prev.ToJson(Read(Answered(), Visit("V0901"))));
        var prev = document.RootElement.GetProperty("prev");
        Assert.Equal(new[] { "prev" }, document.RootElement.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "date", "ago", "room", "ins", "sym", "dx", "rx", "out" }, prev.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "code", "name", "main" }, prev.GetProperty("dx")[0].EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "code", "name", "qty", "tms", "day" }, prev.GetProperty("rx")[0].EnumerateObject().Select(p => p.Name));
        foreach (var person in new[] { "res", "addr", "tel", "cel", "special" }) Assert.False(prev.TryGetProperty(person, out _));

        Assert.Equal("{\"prev\":null}", Prev.ToJson(null));
    }

    [Fact(DisplayName = "AC-3307.4 증상 글은 줄마다 정리해 reception-paper와 같은 규칙(RtfText.Tidy)이고, 처방 이름은 그날 처방 줄의 이름(비면 그날 이름표), 용량은 0.#### 글이다")]
    public void TextRules()
    {
        var prev = Read(Answered(), Visit("V0901"))!;

        Assert.Equal(RtfText.Tidy("  허리 통증  \n\n밤에 아픔"), prev.Sym);
        var first = prev.Rx[0];
        Assert.Equal(("표층열치료", "1", "1", "1"), (first.Name, first.Qty, first.Tms, first.Day));
        Assert.Equal(("체외충격파", "2.5"), (prev.Rx[1].Name, prev.Rx[1].Qty));
    }

    [Fact(DisplayName = "AC-3307.3 문장이 실패하거나 칸이 모자라면 일부만 주지 않고 E-BIT-READ-FAILED가 올라간다")]
    public void Failures()
    {
        var failing = Answered().Fail(ReceptionSql.PrevPaperDx, BitErrors.ReadFailed);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(failing, Visit("V0901"))).Code);

        var shortRow = Answered();
        shortRow.Answer(ReceptionSql.PrevPaperVisit, _ => new[] { new object?[] { "20261029", "1진료실" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(shortRow, Visit("V0901"))).Code);
    }
}
