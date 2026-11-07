using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Precheck.Core.Tests.Reception.Detail;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Paper 이름 공간에 둔다(PaperSql·PaperRtf와 따로)
namespace Precheck.Core.Tests.Reception.Paper;

/// <summary>
/// 상세의 종이 진료기록부 자료(PaperReader, spec reception-paper design.md 2·3절, REQ-1501).
/// AC-1501.1 from=0 상세 답에만 paper 칸(todaySym 뒤), from&gt;0에는 없다. 나머지 칸은 그대로.
/// AC-1501.2 사람 칸(res·addr·tel·cel·special), AC-1501.4 진료실·보험, AC-1501.5 증상, AC-1501.6 상병, AC-1501.7 처방·원외처방.
/// AC-1501.9 종이 문장 하나라도 실패·시간 지남이면 상세 전체가 볼 수 없음, from&gt;0은 종이 문장을 돌리지 않는다.
/// 가짜 DB·지어낸 자료만 쓴다(차트번호 9로 시작하는 6자리, 주소·전화·특이사항은 지어낸 글).
/// </summary>
public class PaperReaderTests
{
    private static readonly DateTime Morning = DetailFake.Morning;

    /// <summary>오늘 접수(DetailFake.Today) 환자의 종이 자료를 8초 안에서 읽는다.</summary>
    private static PaperRecord Read(FakeDb db, VisitRow? visit = null)
    {
        var row = visit ?? DetailFake.Today();
        var clock = new CacheClock(Morning);
        return PaperReader.Read(db, Synthetic.Scope, row, DetailFake.Board(row), clock.Now, Morning + HistoryReader.Timeout);
    }

    /// <summary>기본 가짜 줄에서 문장 하나의 줄만 바꾼 가짜 DB.</summary>
    private static FakeDb With(string sql, params object?[][] rows) => PaperFake.Answer(new FakeDb()).Answer(sql, _ => rows);

    private static object?[] Person(object? res = null, object? addr = null, object? rest = null, object? tel = null, object? cel = null, object? special = null) =>
        new[] { res, addr, rest, tel, cel, special };

    private static object?[] Order(object? code, object? name, object? qty = null, object? tms = null, object? day = null, object? outCod = null) =>
        new[] { code, name, qty, tms, day, outCod };

    /// <summary>PaperRecord.WriteJson이 쓴 "paper" 칸(바깥 묶음 안에서 쓴다).</summary>
    private static JsonElement Json(PaperRecord record)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            record.WriteJson(writer);
            writer.WriteEndObject();
        }
        using var document = JsonDocument.Parse(buffer.ToArray());
        return document.RootElement.GetProperty("paper").Clone();
    }

    private static string Text(JsonElement element, string name) => element.GetProperty(name).GetString()!;

    private static Rig NewRig()
    {
        var rig = new Rig().Registered();
        rig.Today = Morning.Date;
        DetailFake.Answer(rig.Session);
        return rig;
    }

    private static (VisitKeys Keys, string Key) KeysFor()
    {
        var keys = new VisitKeys();
        return (keys, keys.KeyOf(DetailFake.Day, DetailFake.TodayId));
    }

    private static DetailApi.Answer Get(Rig rig, string from, Func<DateTime>? clock = null)
    {
        var (keys, key) = KeysFor();
        var board = BoardResult.Ok(DetailFake.Board());
        return DetailApi.Get(rig.Services, keys, () => board, key, from, clock ?? new CacheClock(Morning).Now);
    }

    private static string[] PaperCalls(FakeDb db) => db.Sqls.Where(sql => PaperFake.Sqls.Contains(sql)).ToArray();

    // ---- AC-1501.1 from=0 답에만 paper ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.1 from=0 상세 JSON은 todaySym 뒤에 paper 칸이 있고, 칸 이름·차례·종류가 design.md 2절 그대로다(글 여덟, dx[code·name·main 참거짓], rx·out[code·name·qty·tms·day 글])")]
    public void FirstAnswerHasPaper()
    {
        using var rig = NewRig();
        var answer = Get(rig, "0");
        Assert.True(answer.State == "Ok", $"{answer.State} {answer.Error}");
        var root = answer.Json!.Value;

        Assert.Equal(new[] { "visits", "next", "more", "first", "total", "todaySym", "paper" }, root.EnumerateObject().Select(p => p.Name));
        var paper = root.GetProperty("paper");
        Assert.Equal(JsonValueKind.Object, paper.ValueKind);
        Assert.Equal(
            new[] { "res", "addr", "tel", "cel", "special", "room", "ins", "sym", "dx", "rx", "out" },
            paper.EnumerateObject().Select(p => p.Name));
        foreach (var name in new[] { "res", "addr", "tel", "cel", "special", "room", "ins", "sym" })
            Assert.Equal(JsonValueKind.String, paper.GetProperty(name).ValueKind);

        var dx = paper.GetProperty("dx").EnumerateArray().ToArray();
        Assert.NotEmpty(dx);
        Assert.All(dx, item =>
        {
            Assert.Equal(new[] { "code", "name", "main" }, item.EnumerateObject().Select(p => p.Name));
            Assert.Equal(JsonValueKind.String, item.GetProperty("code").ValueKind);
            Assert.Equal(JsonValueKind.String, item.GetProperty("name").ValueKind);
            Assert.True(item.GetProperty("main").ValueKind == JsonValueKind.True || item.GetProperty("main").ValueKind == JsonValueKind.False);
        });
        foreach (var list in new[] { "rx", "out" })
        {
            var orders = paper.GetProperty(list).EnumerateArray().ToArray();
            Assert.NotEmpty(orders);
            Assert.All(orders, item =>
            {
                Assert.Equal(new[] { "code", "name", "qty", "tms", "day" }, item.EnumerateObject().Select(p => p.Name));
                Assert.All(item.EnumerateObject(), p => Assert.Equal(JsonValueKind.String, p.Value.ValueKind));
            });
        }

        Assert.Equal("730101-*******", Text(paper, "res"));
        Assert.Equal("가상시 가상구 가상로 12 가상아파트 101동 202호", Text(paper, "addr"));
        Assert.Equal("02-000-0001", Text(paper, "tel"));
        Assert.Equal("010-0000-0002", Text(paper, "cel"));
        Assert.Equal(PaperFake.SpecialText, Text(paper, "special"));
        Assert.Equal("1진료실", Text(paper, "room"));
        Assert.Equal("국민건강보험", Text(paper, "ins"));
        Assert.Equal("오른쪽 어깨 통증\n\n밤에 더 아픔", Text(paper, "sym"));
        Assert.Equal(new[] { ("M7501", "어깨 관절낭염", true), ("M2551", "어깨 관절통", false) },
            dx.Select(item => (Text(item, "code"), Text(item, "name"), item.GetProperty("main").GetBoolean())));
        Assert.Equal(new[] { ("AA157", "재진진찰료", "1", "1", "1"), ("ESWT7", "체외충격파", "1", "1", "1") },
            paper.GetProperty("rx").EnumerateArray().Select(item => (Text(item, "code"), Text(item, "name"), Text(item, "qty"), Text(item, "tms"), Text(item, "day"))));
        Assert.Equal(new[] { ("671800010", "가상진통정 50mg", "0.25", "2", "7") },
            paper.GetProperty("out").EnumerateArray().Select(item => (Text(item, "code"), Text(item, "name"), Text(item, "qty"), Text(item, "tms"), Text(item, "day"))));
    }

    [Fact(DisplayName = "AC-1501.1 from>0([더 보기] 5·25·지난 내원 수 이상 36) 답에는 paper 칸이 없고 칸은 visits·next·more·first·total·todaySym 그대로다")]
    public void LaterAnswersHaveNoPaper()
    {
        foreach (var from in new[] { "5", "25", "36" })
        {
            using var rig = NewRig();
            var answer = Get(rig, from);
            Assert.True(answer.State == "Ok", $"{answer.State} {answer.Error}");
            var root = answer.Json!.Value;
            Assert.Equal(new[] { "visits", "next", "more", "first", "total", "todaySym" }, root.EnumerateObject().Select(p => p.Name));
            Assert.False(root.TryGetProperty("paper", out _));
        }
    }

    [Fact(DisplayName = "AC-1501.1 paper가 붙어도 나머지 칸(visits·next·more·first·total·todaySym)의 글은 한 글자도 바뀌지 않는다(paper는 끝에 덧붙을 뿐)")]
    public void OtherFieldsUnchanged()
    {
        var withPaper = HistoryBuilder.Build(HistoryReader.Read(DetailFake.Answer(new FakeDb()), Synthetic.Scope, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now));
        var read = HistoryReader.Read(DetailFake.Answer(new FakeDb()), Synthetic.Scope, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now);
        Assert.NotNull(read.Paper);
        var withoutPaper = HistoryBuilder.Build(new HistoryInput(read.Day, read.From, read.EarlierCount, read.FirstDay, read.Visits, read.TodaySymptom));
        Assert.Null(withoutPaper.Paper);

        var full = withPaper.ToJson();
        var plain = withoutPaper.ToJson();
        Assert.EndsWith("}", plain);
        Assert.StartsWith(plain.Substring(0, plain.Length - 1) + ",\"paper\":{", full);
        Assert.DoesNotContain("\"paper\"", plain);
    }

    [Fact(DisplayName = "AC-1501.1 HistoryBuilder는 HistoryInput의 종이 기록(Paper)을 VisitHistory에 그대로 싣고, 없으면(null) paper 칸을 쓰지 않으며, 환자 글의 <>&'\"는 \\u 글자로 쓴다")]
    public void BuilderCarriesPaper()
    {
        var record = new PaperRecord(
            "730101-*******", "가상시 <가상로> 12", "02-000-0001", "", "주의 & \"보호자\" '먼저'", "1진료실", "국민건강보험", "어깨\n밤에 아픔",
            new[] { new PaperDiagnosis("M7501", "어깨 관절낭염", true) },
            new[] { new PaperOrder("AA157", "재진진찰료", "1", "1", "1") },
            new PaperOrder[0]);
        var input = new HistoryInput("20261105", 0, 0, null, new HistoryVisit[0], null, record);
        Assert.Same(record, input.Paper);

        var history = HistoryBuilder.Build(input);
        Assert.Same(record, history.Paper);
        var text = history.ToJson();
        using var document = JsonDocument.Parse(text);
        var paper = document.RootElement.GetProperty("paper");
        Assert.Equal("가상시 <가상로> 12", Text(paper, "addr"));
        Assert.Equal("주의 & \"보호자\" '먼저'", Text(paper, "special"));
        Assert.Equal("어깨\n밤에 아픔", Text(paper, "sym"));
        Assert.Empty(paper.GetProperty("out").EnumerateArray());
        Assert.DoesNotContain("<", text);
        Assert.DoesNotContain(">", text);
        Assert.DoesNotContain("&", text);
        Assert.DoesNotContain("'", text);
        Assert.Contains("가상시", text);

        var none = HistoryBuilder.Build(new HistoryInput("20261105", 0, 0, null, new HistoryVisit[0], null));
        Assert.Null(none.Paper);
        using var plain = JsonDocument.Parse(none.ToJson());
        Assert.False(plain.RootElement.TryGetProperty("paper", out _));
    }

    [Fact(DisplayName = "AC-1501.1 from=0 읽기는 상세 문장 셋 뒤에 종이 문장 다섯(사람·내원·증상·상병·처방)을 차례로 한 번씩, @chart(앞 공백 그대로)·@before 원값·@hospital 등록 범위로 돌린다(사람 문장은 @chart만)")]
    public void PaperStatementsAndArgs()
    {
        var db = DetailFake.Answer(new FakeDb());
        var visit = DetailFake.Today(chart: "        900101", accepted: "20261105091230 ");

        var read = HistoryReader.Read(db, Synthetic.Scope, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);

        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage, ReceptionSql.VisitSymptoms }.Concat(PaperFake.Sqls), db.Sqls);
        Assert.Equal(new Dictionary<string, object?> { ["@chart"] = "        900101" }, db.Calls[3].Args);
        foreach (var call in db.Calls.Skip(4))
        {
            Assert.Equal(
                new Dictionary<string, object?> { ["@chart"] = "        900101", ["@before"] = "20261105091230 ", ["@hospital"] = Synthetic.Scope },
                call.Args);
        }
        Assert.NotNull(read.Paper);
        Assert.Equal("1진료실", read.Paper!.Room);
    }

    [Fact(DisplayName = "AC-1501.1 GET /api/visit/{k}/history?from=0 한 번은 등록 확인을 지난 세션 하나에서 종이 문장 다섯을 돌리고 세션을 닫는다")]
    public void GetRunsPaperOnce()
    {
        using var rig = NewRig();
        var answer = Get(rig, "0");
        Assert.Equal("Ok", answer.State);
        Assert.Equal(PaperFake.Sqls, PaperCalls(rig.Session));
        Assert.Single(rig.Connector.Opened);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-1501.1 [회귀] 실제 칸 모양(차트번호 char 14 앞 공백 채움·접수 시각 char 12·내원번호 char 10)의 가짜 DB에서도 종이 문장이 그 접수의 진료실·보험·증상을 찾는다")]
    public void RealShapes()
    {
        var db = RealShapeBit.Answer(BoardFake.Quiet(new FakeDb()));
        var clock = new CacheClock(Morning);
        var board = BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now);
        var visit = board.Visits.Single(row => row.VisitId == RealShapeBit.TodayId);

        var read = HistoryReader.Read(db, Synthetic.Scope, board, visit, 0, clock.Now);

        Assert.NotNull(read.Paper);
        Assert.Equal("910203-*******", read.Paper!.Res);
        Assert.Equal("2진료실", read.Paper.Room);
        Assert.Equal("의료급여", read.Paper.Ins);
        Assert.Equal("오늘 다시 아파서 옴", read.Paper.Sym);
    }

    [Fact(DisplayName = "AC-1501.1 차트번호나 접수 시각이 빈 접수는 다른 환자를 읽지 않게 종이 문장을 돌리지 않고, from=0 답의 paper는 모든 칸이 빈 값이다")]
    public void BlankChartReadsNothing()
    {
        foreach (var visit in new[] { DetailFake.Today(chart: ""), DetailFake.Today(chart: "   "), DetailFake.Today(accepted: ""), DetailFake.Today(accepted: "  ") })
        {
            var db = DetailFake.Answer(new FakeDb());
            var record = Read(db, visit);
            Assert.Empty(db.Calls);
            Assert.All(new[] { record.Res, record.Addr, record.Tel, record.Cel, record.Special, record.Room, record.Ins, record.Sym }, value => Assert.Equal("", value));
            Assert.Empty(record.Dx);
            Assert.Empty(record.Rx);
            Assert.Empty(record.Out);

            var history = DetailApi.Read(db, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);
            Assert.Empty(db.Calls);
            var paper = history.GetProperty("paper");
            foreach (var name in new[] { "res", "addr", "tel", "cel", "special", "room", "ins", "sym" }) Assert.Equal("", Text(paper, name));
            foreach (var name in new[] { "dx", "rx", "out" }) Assert.Empty(paper.GetProperty(name).EnumerateArray());
        }
    }

    // ---- AC-1501.2 사람 칸 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.2 res는 PbsResNum 앞 6자리(앞뒤 공백 뺌)가 아라비아 숫자 6자리일 때만 \"NNNNNN-*******\"이고, 짧거나·길거나·숫자 아닌 글자·전각 숫자·빈 글·NULL이면 \"\"")]
    public void ResidentFront()
    {
        foreach (var (raw, expected) in new (object?, string)[]
        {
            ("730101", "730101-*******"),
            (" 991231 ", "991231-*******"),
            ("000000", "000000-*******"),
            ("73010", ""),
            ("7301011", ""),
            ("73O101", ""),
            ("73-101", ""),
            ("７３０１０１", ""),
            ("٧٣٠١٠١", ""),
            ("", ""),
            ("      ", ""),
            (null, ""),
        })
        {
            var record = Read(With(ReceptionSql.PaperPerson, Person(res: raw)));
            Assert.Equal(expected, record.Res);
            Assert.Equal(expected, Text(Json(record), "res"));
        }
    }

    [Fact(DisplayName = "AC-1501.2 addr는 PbsDtlAdr 뒤에 공백 하나와 PbsAdrSta(비지 않았으면), tel은 PbsPhnNum·cel은 PbsCelPhn, 모두 앞뒤 공백을 빼고 없으면 \"\"")]
    public void AddressAndPhones()
    {
        foreach (var (addr, rest, expected) in new (object?, object?, string)[]
        {
            (" 가상시 가상구 가상로 12 ", " 가상아파트 101동 202호 ", "가상시 가상구 가상로 12 가상아파트 101동 202호"),
            ("가상시 가상로 3", null, "가상시 가상로 3"),
            ("가상시 가상로 3", "   ", "가상시 가상로 3"),
            ("가상시 가상로 3", "", "가상시 가상로 3"),
            (null, "101동 202호", "101동 202호"),
            ("  ", "101동 202호", "101동 202호"),
            (null, null, ""),
        })
        {
            Assert.Equal(expected, Read(With(ReceptionSql.PaperPerson, Person(addr: addr, rest: rest))).Addr);
        }

        var phones = Read(With(ReceptionSql.PaperPerson, Person(tel: " 02-000-0001 ", cel: "\t010-0000-0002 ")));
        Assert.Equal("02-000-0001", phones.Tel);
        Assert.Equal("010-0000-0002", phones.Cel);
        var none = Read(With(ReceptionSql.PaperPerson, Person(tel: null, cel: "  ")));
        Assert.Equal("", none.Tel);
        Assert.Equal("", none.Cel);
    }

    [Fact(DisplayName = "AC-1501.2 special은 PbsSpcCmt를 RtfText.ToPlain으로 바꾼 글(AC-1501.3: RTF는 보통 글, RTF 아닌 글은 줄 정리만), NULL·빈 글이면 \"\"")]
    public void SpecialAsPlainText()
    {
        var rtf = Read(With(ReceptionSql.PaperPerson, Person(special: PaperFake.Special)));
        Assert.Equal(PaperFake.SpecialText, rtf.Special);
        Assert.Equal(RtfText.ToPlain(PaperFake.Special), rtf.Special);

        var plain = "  당뇨 있음  \r\n\r\n\r\n주사 전 확인\r\n";
        Assert.Equal("  당뇨 있음\n\n주사 전 확인", Read(With(ReceptionSql.PaperPerson, Person(special: plain))).Special);

        foreach (var empty in new object?[] { null, "", "  \r\n " })
            Assert.Equal("", Read(With(ReceptionSql.PaperPerson, Person(special: empty))).Special);
    }

    [Fact(DisplayName = "AC-1501.2 사람 줄이 없으면 res·addr·tel·cel·special은 지어내지 않고 \"\", 줄이 여럿이면 첫 줄만 쓴다")]
    public void PersonRows()
    {
        var none = Read(With(ReceptionSql.PaperPerson));
        Assert.All(new[] { none.Res, none.Addr, none.Tel, none.Cel, none.Special }, value => Assert.Equal("", value));
        Assert.Equal("1진료실", none.Room);

        var two = Read(With(ReceptionSql.PaperPerson, Person("730101", "가상시 첫 줄"), Person("820202", "가상시 둘째 줄")));
        Assert.Equal("730101-*******", two.Res);
        Assert.Equal("가상시 첫 줄", two.Addr);
    }

    // ---- AC-1501.4 진료실·보험 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.4 room은 그 접수 줄의 진료실(DepKorNam)·ins는 보험 이름(InsCodNam), 앞뒤 공백을 빼고, 줄이 없거나 NULL이면 \"\"")]
    public void RoomAndInsurance()
    {
        var record = Read(With(ReceptionSql.PaperVisit, new object?[] { "V1001", " 2진료실 ", " 국민건강보험 " }));
        Assert.Equal("2진료실", record.Room);
        Assert.Equal("국민건강보험", record.Ins);

        var none = Read(With(ReceptionSql.PaperVisit));
        Assert.Equal("", none.Room);
        Assert.Equal("", none.Ins);

        var nulls = Read(With(ReceptionSql.PaperVisit, new object?[] { "V1001", null, null }));
        Assert.Equal("", nulls.Room);
        Assert.Equal("", nulls.Ins);
    }

    [Fact(DisplayName = "AC-1501.4 내원 줄이 여럿(겹친 DepMst 줄)이면 지어내거나 잇지 않고 첫 줄의 진료실·보험만 쓴다")]
    public void FirstVisitRow()
    {
        var record = Read(With(ReceptionSql.PaperVisit,
            new object?[] { "V1001", "1진료실", "국민건강보험" },
            new object?[] { "V1001", "옛 1진료실", "산재보험" }));
        Assert.Equal("1진료실", record.Room);
        Assert.Equal("국민건강보험", record.Ins);
    }

    // ---- AC-1501.5 증상 --------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.5 sym은 증상 줄을 비트가 준 차례(EmrShtSeq 순)대로 \"\\n\"으로 잇고(NULL 줄은 빈 줄), 빈 줄은 지키되 여럿은 하나로, 줄 끝 공백과 앞뒤 빈 줄은 뺀다(RtfText.Tidy)")]
    public void SymptomLines()
    {
        var record = Read(With(ReceptionSql.PaperSymptoms,
            new object?[] { "V1001", "" },
            new object?[] { "V1001", "오른쪽 어깨 통증  " },
            new object?[] { "V1001", null },
            new object?[] { "V1001", "   " },
            new object?[] { "V1001", "" },
            new object?[] { "V1001", "  밤에 더 아픔" },
            new object?[] { "V1001", "팔 들 때 걸림\r\n" },
            new object?[] { "V1001", "" },
            new object?[] { "V1001", "어제부터" }));

        Assert.Equal("오른쪽 어깨 통증\n\n  밤에 더 아픔\n팔 들 때 걸림\n\n어제부터", record.Sym);
    }

    [Fact(DisplayName = "AC-1501.5 증상 줄이 없거나 모두 빈 줄·NULL이면 sym은 \"\"")]
    public void NoSymptoms()
    {
        Assert.Equal("", Read(With(ReceptionSql.PaperSymptoms)).Sym);
        Assert.Equal("", Read(With(ReceptionSql.PaperSymptoms, new object?[] { "V1001", "" }, new object?[] { "V1001", null }, new object?[] { "V1001", "  " })).Sym);
    }

    // ---- AC-1501.6 상병 --------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.6 dx는 상병 줄 차례(OicSeq 순) 그대로 {code, name, main}이고 code·name은 앞뒤 공백을 빼며, main은 OicIcdPri(앞뒤 공백 뺌)가 '1'일 때만 참")]
    public void Diagnoses()
    {
        var record = Read(With(ReceptionSql.PaperDx,
            new object?[] { " M7501 ", " 어깨 관절낭염 ", "1" },
            new object?[] { "M2551", "어깨 관절통", "0" },
            new object?[] { "S4340", "어깨 염좌", "" },
            new object?[] { "M1791", null, null },
            new object?[] { "M5456", "목 통증", " 1 " },
            new object?[] { "M7541", "어깨 힘줄염", 1 },
            new object?[] { "M2556", "무릎 관절통", "2" },
            new object?[] { "M2555", "엉덩 관절통", "11" }));

        Assert.Equal(
            new[]
            {
                ("M7501", "어깨 관절낭염", true), ("M2551", "어깨 관절통", false), ("S4340", "어깨 염좌", false), ("M1791", "", false),
                ("M5456", "목 통증", true), ("M7541", "어깨 힘줄염", true), ("M2556", "무릎 관절통", false), ("M2555", "엉덩 관절통", false),
            },
            record.Dx.Select(dx => (dx.Code, dx.Name, dx.Main)));
        var json = Json(record).GetProperty("dx").EnumerateArray().ToArray();
        Assert.Equal(JsonValueKind.True, json[0].GetProperty("main").ValueKind);
        Assert.Equal(JsonValueKind.False, json[1].GetProperty("main").ValueKind);
        Assert.Equal("M1791", Text(json[3], "code"));
        Assert.Equal("", Text(json[3], "name"));

        Assert.Empty(Read(With(ReceptionSql.PaperDx)).Dx);
    }

    // ---- AC-1501.7 처방·원외처방 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.7 처방 줄은 OdrSeq 순(비트가 준 차례) 그대로, OdrOutCod가 'XX'(원외처방)면 out, 그 밖('', 다른 코드)은 rx에 넣는다")]
    public void SplitsOutside()
    {
        var record = Read(With(ReceptionSql.PaperOrders,
            Order("AA157", "재진진찰료", 1m, 1, 1, ""),
            Order("671800010", "가상진통정 50mg", 0.25m, 2, 7, "XX"),
            Order("MM042", "관절강내 주사", 1m, 1, 1, "01"),
            Order("641900020", "가상위장약", 1m, 3, 7, " XX "),
            Order("PT01", "표층열치료", 1m, 1, 1, null)));

        Assert.Equal(new[] { "AA157", "MM042", "PT01" }, record.Rx.Select(rx => rx.Code));
        Assert.Equal(new[] { "671800010", "641900020" }, record.Out.Select(rx => rx.Code));
    }

    [Fact(DisplayName = "AC-1501.7 code는 OdrCod 앞뒤 공백만 빼고 대소문자 그대로, name은 OdrCodNam(앞뒤 공백 뺌), 비면 그날 이름표(코드를 대문자로 찾음), 그것도 없으면 \"\"")]
    public void CodesAndNames()
    {
        var record = Read(With(ReceptionSql.PaperOrders,
            Order(" eswt7 ", ""),
            Order("DS20", "   "),
            Order("PT01", " 핫팩 "),
            Order("ZZ9", null),
            Order("Pt03", null)));

        Assert.Equal(
            new[] { ("eswt7", "체외충격파"), ("DS20", "도수치료 20분"), ("PT01", "핫팩"), ("ZZ9", ""), ("Pt03", "간섭파치료") },
            record.Rx.Select(rx => (rx.Code, rx.Name)));
    }

    [Fact(DisplayName = "AC-1501.7 qty는 소수 아래 0 없이 비트 인쇄의 \"0.####\"(1.000→\"1\"·2.500→\"2.5\"·0.250→\"0.25\"), tms·day는 정수 글, 숫자 칸 종류(decimal·double·int·short·글)와 상관없이 문화권 없이, NULL은 \"\"")]
    public void Numbers()
    {
        var record = Read(With(ReceptionSql.PaperOrders,
            Order("A1", "", 1.000m, 1, 1),
            Order("A2", "", 2.500m, 3m, 14m),
            Order("A3", "", 0.250m, (short)2, (byte)7),
            Order("A4", "", 1.0, 3L, 30.0),
            Order("A5", "", 3, "2", " 7 "),
            Order("A6", "", "0.5", "3.0", "7"),
            Order("A7", "", " 1.5000 ", null, null),
            Order("A8", "", null, null, null),
            Order("A9", "", 0.33333m, 1, 1),
            Order("A10", "", 10m, 1, 90),
            Order("A11", "", "", " ", "")));

        Assert.Equal(
            new[]
            {
                ("1", "1", "1"), ("2.5", "3", "14"), ("0.25", "2", "7"), ("1", "3", "30"), ("3", "2", "7"), ("0.5", "3", "7"),
                ("1.5", "", ""), ("", "", ""), ("0.3333", "1", "1"), ("10", "1", "90"), ("", "", ""),
            },
            record.Rx.Select(rx => (rx.Qty, rx.Tms, rx.Day)));

        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("de-DE");
            var german = Read(With(ReceptionSql.PaperOrders, Order("A1", "", 2.5m, 1, 1), Order("A2", "", "0.25", 1, 1)));
            Assert.Equal(new[] { "2.5", "0.25" }, german.Rx.Select(rx => rx.Qty));
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact(DisplayName = "AC-1501.7 용량·횟수·일수 칸이 숫자가 아니면 지어내지 않고 읽기 실패(E-BIT-READ-FAILED)")]
    public void BadNumbers()
    {
        foreach (var order in new[] { Order("A1", "", "많이", 1, 1), Order("A1", "", 1m, "세 번", 1), Order("A1", "", 1m, 1, "1e3") })
        {
            var error = Assert.Throws<BitException>(() => Read(With(ReceptionSql.PaperOrders, order)));
            Assert.Equal(BitErrors.ReadFailed, error.Code);
        }
    }

    [Fact(DisplayName = "AC-1501.7 처방 줄이 없으면 rx·out은 빈 목록이고 JSON은 [](원외처방만·처방만 있어도 다른 쪽은 [])")]
    public void NoOrders()
    {
        var none = Read(With(ReceptionSql.PaperOrders));
        Assert.Empty(none.Rx);
        Assert.Empty(none.Out);
        var json = Json(none);
        Assert.Equal(JsonValueKind.Array, json.GetProperty("rx").ValueKind);
        Assert.Empty(json.GetProperty("rx").EnumerateArray());
        Assert.Empty(json.GetProperty("out").EnumerateArray());

        var onlyOut = Read(With(ReceptionSql.PaperOrders, Order("671800010", "가상진통정 50mg", 1m, 1, 1, "XX")));
        Assert.Empty(onlyOut.Rx);
        Assert.Single(onlyOut.Out);
    }

    // ---- AC-1501.9 일부만 주지 않음 · from>0은 종이 문장 없음 --------------------------------------------------

    [Fact(DisplayName = "AC-1501.9 from>0(5·25·36·int 끝) 읽기는 종이 문장을 하나도 돌리지 않는다")]
    public void LaterReadsRunNoPaper()
    {
        foreach (var from in new[] { 5, 25, 36, int.MaxValue })
        {
            var db = DetailFake.Answer(new FakeDb());
            var read = HistoryReader.Read(db, Synthetic.Scope, DetailFake.Board(), DetailFake.Today(), from, new CacheClock(Morning).Now);
            Assert.Empty(PaperCalls(db));
            Assert.Null(read.Paper);
        }

        using var rig = NewRig();
        Assert.Equal("Ok", Get(rig, "5").State);
        Assert.Empty(PaperCalls(rig.Session));
    }

    [Fact(DisplayName = "AC-1501.9 종이 문장 다섯 중 하나라도 실패하면 일부만 주지 않고 상세 전체가 볼 수 없음(503, E-BIT-READ-FAILED만, JSON 없음), 세션은 닫는다")]
    public void AnyStatementFails()
    {
        foreach (var sql in PaperFake.Sqls)
        {
            using var rig = NewRig();
            rig.Session.Fail(sql, BitErrors.ReadFailed);
            var answer = Get(rig, "0");
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.ReadFailed, answer.Error);
            Assert.Null(answer.Json);
            Assert.Equal(1, rig.Session.Disposed);
            Assert.Contains(sql, rig.Session.Sqls);
        }

        using var broken = NewRig();
        broken.Session.Fail(ReceptionSql.PaperDx, BitErrors.DbFailed);
        var dbFailed = Get(broken, "0");
        Assert.Equal("Unavailable", dbFailed.State);
        Assert.Equal(BitErrors.DbFailed, dbFailed.Error);
        Assert.Null(dbFailed.Json);
    }

    [Fact(DisplayName = "AC-1501.9 종이 줄의 칸이 모자라면(사람 6·내원 3·증상 2·상병 3·처방 6보다 적음, NULL 줄) 지어내지 않고 상세 전체가 볼 수 없음")]
    public void ShortRowsFail()
    {
        var cells = new Dictionary<string, int>
        {
            [ReceptionSql.PaperPerson] = 6,
            [ReceptionSql.PaperVisit] = 3,
            [ReceptionSql.PaperSymptoms] = 2,
            [ReceptionSql.PaperDx] = 3,
            [ReceptionSql.PaperOrders] = 6,
        };
        foreach (var sql in PaperFake.Sqls)
        {
            var row = Enumerable.Repeat<object?>("1", cells[sql] - 1).ToArray();
            var error = Assert.Throws<BitException>(() => Read(With(sql, row)));
            Assert.Equal(BitErrors.ReadFailed, error.Code);

            using var rig = NewRig();
            rig.Session.Answer(sql, _ => new[] { row });
            var answer = Get(rig, "0");
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.ReadFailed, answer.Error);
            Assert.Null(answer.Json);

            var nullRow = Assert.Throws<BitException>(() => Read(With(sql, new object?[][] { null! })));
            Assert.Equal(BitErrors.ReadFailed, nullRow.Code);
        }
    }

    [Fact(DisplayName = "AC-1501.9 읽기 한 번 8초(AC-1404.1) 안에서 종이 문장마다 남은 시간을 준다(상세 문장 셋 뒤 5·4·3·2·1초)")]
    public void OneBudget()
    {
        var clock = new CacheClock(Morning);
        var db = DetailFake.Answer(new FakeDb());
        foreach (var sql in new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage, ReceptionSql.VisitSymptoms }.Concat(PaperFake.Sqls))
        {
            var answer = PaperFake.AnswerOf(sql);
            db.Answer(sql, args =>
            {
                clock.Advance(TimeSpan.FromSeconds(1));
                return answer(args);
            });
        }

        HistoryReader.Read(db, Synthetic.Scope, DetailFake.Board(), DetailFake.Today(), 0, clock.Now);

        Assert.Equal(
            new[] { 8, 7, 6, 5, 4, 3, 2, 1 }.Select(seconds => TimeSpan.FromSeconds(seconds)),
            db.Calls.Select(call => call.Timeout));
    }

    [Fact(DisplayName = "AC-1501.9 시간이 다 가면 다음 종이 문장을 돌리지 않고 상세 전체가 볼 수 없음(E-BIT-READ-FAILED), 남은 시간이 없으면 PaperReader는 아무 문장도 돌리지 않는다")]
    public void DeadlineSpent()
    {
        var order = new[] { ReceptionSql.VisitSymptoms }.Concat(PaperFake.Sqls).ToArray();
        for (var i = 1; i < order.Length; i++)
        {
            var clock = new CacheClock(Morning);
            using var rig = NewRig();
            var spender = order[i - 1];
            var answer = PaperFake.AnswerOf(spender);
            rig.Session.Answer(spender, args =>
            {
                clock.Advance(TimeSpan.FromSeconds(8));
                return answer(args);
            });

            var result = Get(rig, "0", clock.Now);

            Assert.Equal("Unavailable", result.State);
            Assert.Equal(BitErrors.ReadFailed, result.Error);
            Assert.Null(result.Json);
            Assert.Contains(spender, rig.Session.Sqls);
            Assert.DoesNotContain(order[i], rig.Session.Sqls);
        }

        var spent = PaperFake.Answer(new FakeDb());
        var now = new CacheClock(Morning);
        var error = Assert.Throws<BitException>(() =>
            PaperReader.Read(spent, Synthetic.Scope, DetailFake.Today(), DetailFake.Board(), now.Now, Morning));
        Assert.Equal(BitErrors.ReadFailed, error.Code);
        Assert.Empty(spent.Calls);
    }
}

/// <summary>
/// 종이 기록부 시험이 같이 쓰는 가짜 비트 자료(모두 지어낸 것). DetailFake의 오늘 접수 V1001(차트 900101)의 종이 문장 다섯 줄:
/// 사람(주민번호 앞 6자리 730101·지어낸 주소·전화·RTF 특이사항), 내원(1진료실·국민건강보험), 증상 세 줄(빈 줄 둘),
/// 상병 둘(첫째가 주), 처방 셋(원외처방 하나, 이름 빈 ESWT7은 그날 이름표로).
/// </summary>
internal static class PaperFake
{
    /// <summary>종이 문장 다섯, 도는 차례.</summary>
    public static readonly string[] Sqls =
    {
        ReceptionSql.PaperPerson, ReceptionSql.PaperVisit, ReceptionSql.PaperSymptoms, ReceptionSql.PaperDx, ReceptionSql.PaperOrders,
    };

    /// <summary>ASCII 밖 글자를 \uN? 로 바꾼 RTF 글 조각(시험 RTF를 ASCII로 쓰려고).</summary>
    public static string Rtf(string text)
    {
        var output = new StringBuilder();
        foreach (var c in text)
        {
            if (c < 128) output.Append(c);
            else output.Append("\\u").Append(((int)c).ToString(CultureInfo.InvariantCulture)).Append('?');
        }
        return output.ToString();
    }

    /// <summary>지어낸 특이사항 RTF(비트처럼 \ansicpg949·글꼴표·색표·{\*…}, 빈 줄 여럿).</summary>
    public static readonly string Special =
        @"{\rtf1\ansi\ansicpg949\deff0{\fonttbl{\f0\fnil\fcharset129 Gulim;}}{\colortbl ;\red0\green0\blue0;}" +
        @"{\*\generator Riched20 10.0.19041}\viewkind4\uc1\pard\lang1042\f0\fs20 " +
        Rtf("고혈압 약 복용 중") + @"\par " + Rtf("페니실린 주사 알레르기") + @"\par\par\par " + Rtf("보호자 먼저 연락") + @"\par" + "\r\n}";

    /// <summary>Special을 보통 글로 바꾼 것.</summary>
    public const string SpecialText = "고혈압 약 복용 중\n페니실린 주사 알레르기\n\n보호자 먼저 연락";

    public static object?[][] Person() => new[]
    {
        new object?[] { "730101", "가상시 가상구 가상로 12", "가상아파트 101동 202호", "02-000-0001", "010-0000-0002", Special },
    };

    public static object?[][] Visit() => new[] { new object?[] { DetailFake.TodayId, "1진료실", "국민건강보험" } };

    public static object?[][] Symptoms() => new[]
    {
        new object?[] { DetailFake.TodayId, "오른쪽 어깨 통증 " },
        new object?[] { DetailFake.TodayId, "" },
        new object?[] { DetailFake.TodayId, null },
        new object?[] { DetailFake.TodayId, "밤에 더 아픔" },
    };

    public static object?[][] Dx() => new[]
    {
        new object?[] { "M7501", "어깨 관절낭염", "1" },
        new object?[] { "M2551", "어깨 관절통", "" },
    };

    public static object?[][] Orders() => new[]
    {
        new object?[] { "AA157", "재진진찰료", 1.000m, 1, 1, "" },
        new object?[] { "671800010", "가상진통정 50mg", 0.250m, 2, 7, "XX" },
        new object?[] { "ESWT7", "", 1.000m, 1, 1, "" },
    };

    /// <summary>문장 하나의 기본 답(시간을 쓰게 감쌀 때). 상세 문장 셋(HistoryCount·HistoryPage·VisitSymptoms)은 DetailFake와 같은 답.</summary>
    public static Func<IReadOnlyDictionary<string, object?>, IEnumerable<object?[]>> AnswerOf(string sql)
    {
        if (sql == ReceptionSql.PaperPerson) return _ => Person();
        if (sql == ReceptionSql.PaperVisit) return _ => Visit();
        if (sql == ReceptionSql.PaperSymptoms) return _ => Symptoms();
        if (sql == ReceptionSql.PaperDx) return _ => Dx();
        if (sql == ReceptionSql.PaperOrders) return _ => Orders();
        if (sql == ReceptionSql.HistoryCount) return _ => new[] { new object?[] { (long)DetailFake.Earlier, DetailFake.DayOf(DetailFake.Earlier) } };
        if (sql == ReceptionSql.HistoryPage) return args => DetailFake.Page(args, DetailFake.Earlier);
        if (sql == ReceptionSql.VisitSymptoms) return args => DetailFake.Symptoms(args, DetailFake.Earlier);
        throw new ArgumentException("모르는 문장", nameof(sql));
    }

    public static T Answer<T>(T db) where T : FakeDb
    {
        foreach (var sql in Sqls) db.Answer(sql, AnswerOf(sql));
        return db;
    }
}
