using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Precheck.Core.Tests.Reception.Paper;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Detail 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Detail;

/// <summary>
/// 상세 읽기(HistoryReader, design.md 5절, REQ-1404). GET /api/visit/{k}/history?from=N 한 번 = 그 환자 한 명만 그때 읽기.
/// AC-1404.1 그 접수보다 앞선 완료 내원을 최근 순으로 처음 5번, 그 뒤 20번씩(HistoryCount → HistoryPage, @first·@last는 1부터 둘 다 포함).
/// AC-1404.2·AC-1404.4·AC-1410.4 증상 글은 VisitSymptoms(HistoryPage와 같은 매개변수, 같은 시간 제한)가 준 그 내원의 S 줄을
/// 비트가 준 차례대로 앞뒤 공백을 빼고 공백 하나로 이은 것이다(지난 내원마다 sym, 오늘 접수는 todaySym). 줄이 없으면 ""(칸 없음).
/// AC-1404.5 그날 열쇠표에 없는 열쇠·모양이 틀린 열쇠·음수나 숫자 아닌 시작 위치는 비트를 읽지 않고 환자 자료 없음(404).
/// from=0 읽기는 그 뒤에 종이 문장 다섯도 돈다(spec reception-paper, 시험은 PaperReader.test.cs). 여기서는 문장 차례·매개변수에만 넣어 센다.
/// 가짜 DB·가짜 자료만 쓴다(차트번호 9로 시작하는 6자리, 내원번호 V+숫자, 처방 코드는 시안의 것).
/// </summary>
public class HistoryReaderTests
{
    private static readonly DateTime Morning = DetailFake.Morning;

    private static string[] HistorySqls(FakeDb db) =>
        db.Sqls.Where(sql => sql == ReceptionSql.HistoryCount || sql == ReceptionSql.HistoryPage).ToArray();

    private static string[] Dates(JsonElement history) =>
        history.GetProperty("visits").EnumerateArray().Select(visit => visit.GetProperty("date").GetString()!).ToArray();

    private static int? Next(JsonElement history) =>
        history.GetProperty("next").ValueKind == JsonValueKind.Null ? null : history.GetProperty("next").GetInt32();

    /// <summary>오늘 접수를 아는 가짜 접수 현황(읽기 횟수를 센다).</summary>
    private sealed class BoardSource
    {
        private readonly BoardResult result;

        public BoardSource(BoardResult result)
        {
            this.result = result;
        }

        public int Calls { get; private set; }

        public BoardResult Get()
        {
            Calls++;
            return result;
        }
    }

    private static Rig NewRig(int earlier = DetailFake.Earlier)
    {
        var rig = new Rig().Registered();
        rig.Today = Morning.Date;
        DetailFake.Answer(rig.Session, earlier);
        return rig;
    }

    private static (VisitKeys Keys, string Key) KeysFor(string visitId = DetailFake.TodayId, string day = DetailFake.Day)
    {
        var keys = new VisitKeys();
        return (keys, keys.KeyOf(day, visitId));
    }

    private static void NothingRead(Rig rig, BoardSource board)
    {
        Assert.Equal(0, board.Calls);
        Assert.Equal(0, rig.Locator.Calls);
        Assert.Empty(rig.Connector.Opened);
        Assert.Empty(rig.Session.Calls);
    }

    private static void NotFound(DetailApi.Answer answer)
    {
        Assert.Equal("NotFound", answer.State);
        Assert.Null(answer.Error);
        Assert.Null(answer.Json);
    }

    private static JsonElement Ok(DetailApi.Answer answer)
    {
        Assert.True(answer.State == "Ok", $"{answer.State} {answer.Error}");
        Assert.Null(answer.Error);
        Assert.NotNull(answer.Json);
        return answer.Json!.Value;
    }

    // ---- AC-1404.1 처음 5번, 그 뒤 20번씩, 그 환자 한 명만 ---------------------------------------------------

    [Fact(DisplayName = "AC-1404.1 처음(from=0)은 그 환자 차트번호·그 접수 시각 원값(@before)·등록 범위로 수·첫날을 읽고, 최근 순 1~5번째만 읽어 5번을 준다(next 5·more 31·total 37)")]
    public void FirstChunk()
    {
        var db = DetailFake.Answer(new FakeDb());
        var clock = new CacheClock(Morning);

        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, clock.Now);

        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage, ReceptionSql.VisitSymptoms }.Concat(PaperFake.Sqls), db.Sqls);
        Assert.Equal(
            new Dictionary<string, object?> { ["@chart"] = "900101", ["@before"] = "20261105091230", ["@hospital"] = Synthetic.Scope },
            db.Calls[0].Args);
        Assert.Equal(
            new Dictionary<string, object?>
            {
                ["@chart"] = "900101", ["@before"] = "20261105091230", ["@hospital"] = Synthetic.Scope, ["@first"] = 1, ["@last"] = 5,
            },
            db.Calls[1].Args);
        Assert.Equal(new[] { "10월 29일", "10월 15일", "10월 1일", "9월 17일", "9월 3일" }, Dates(history));
        Assert.Equal(5, Next(history));
        Assert.Equal(31, history.GetProperty("more").GetInt64());
        Assert.Equal(37, history.GetProperty("total").GetInt64());
        Assert.Equal("2025년 6월 26일", history.GetProperty("first").GetString());
    }

    [Fact(DisplayName = "AC-1404.1 접수 시각은 길이를 짐작하지 않고 원값 그대로(@before, 끝 공백 포함) 넘긴다")]
    public void BeforeIsRaw()
    {
        var db = DetailFake.Answer(new FakeDb());
        var visit = DetailFake.Today(accepted: "20261105101500 ");

        DetailApi.Read(db, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);

        // 종이 사람 문장(PaperPerson)만 @before가 없다(그 환자 한 줄, 매개변수는 @chart 하나)
        Assert.Equal(8, db.Calls.Count);
        Assert.All(db.Calls.Where(call => call.Sql != ReceptionSql.PaperPerson), call => Assert.Equal("20261105101500 ", call.Args["@before"]));
        Assert.False(db.Calls.Single(call => call.Sql == ReceptionSql.PaperPerson).Args.ContainsKey("@before"));
    }

    [Fact(DisplayName = "AC-1404.1 차트번호는 접수 현황 줄의 값 그대로(@chart, 앞 공백 포함) 넘긴다: 앞을 공백으로 채운 char(14) 번호도 지우지 않는다")]
    public void ChartIsRaw()
    {
        var db = DetailFake.Answer(new FakeDb());
        var visit = DetailFake.Today(chart: "        900101");

        DetailApi.Read(db, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);

        Assert.Equal(8, db.Calls.Count);
        Assert.All(db.Calls, call => Assert.Equal("        900101", call.Args["@chart"]));
    }

    [Fact(DisplayName = "AC-1404.1 [회귀] 실제 칸 모양(차트번호 char 14 앞 공백 채움·내원번호 char 10·접수 시각 char 12)의 가짜 DB에서 접수 현황이 재진(앞선 완료 내원 2번)인 환자는 상세도 2번·그 증상·오늘 증상을 준다")]
    public void RealShapesMatchBoard()
    {
        var db = RealShapeBit.Answer(BoardFake.Quiet(new FakeDb()));
        var clock = new CacheClock(Morning);

        var board = BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now);
        var visit = board.Visits.Single(row => row.VisitId == RealShapeBit.TodayId);
        Assert.Equal(2L, visit.EarlierCount);

        var read = HistoryReader.Read(db, Synthetic.Scope, board, visit, 0, clock.Now);

        Assert.Equal(visit.EarlierCount, read.EarlierCount);
        Assert.Equal("20261015", read.FirstDay);
        Assert.Equal(new[] { "V2902", "V2901" }, read.Visits.Select(v => v.VisitId));
        Assert.Equal(new[] { "20261029", "20261015" }, read.Visits.Select(v => v.Day));
        Assert.Equal("어깨 통증 밤에 더 아픔", read.Visits[0].Symptom);
        Assert.Null(read.Visits[1].Symptom);
        Assert.Equal("오늘 다시 아파서 옴", read.TodaySymptom);
    }

    [Fact(DisplayName = "AC-1404.1 더 보기(from=5)는 6~25번째 20번(next 25·more 11), from=25는 26~36번째 남은 11번(next null·more 0)")]
    public void NextChunks()
    {
        var db = DetailFake.Answer(new FakeDb());
        var second = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 5, new CacheClock(Morning).Now);
        Assert.Equal(6, db.Calls[1].Args["@first"]);
        Assert.Equal(25, db.Calls[1].Args["@last"]);
        Assert.Equal(20, Dates(second).Length);
        Assert.Equal("8월 20일", Dates(second)[0]);
        Assert.Equal("2025년 11월 27일", Dates(second)[19]);
        Assert.Equal(25, Next(second));
        Assert.Equal(11, second.GetProperty("more").GetInt64());
        Assert.Equal(37, second.GetProperty("total").GetInt64());

        var lastDb = DetailFake.Answer(new FakeDb());
        var last = DetailApi.Read(lastDb, DetailFake.Board(), DetailFake.Today(), 25, new CacheClock(Morning).Now);
        Assert.Equal(26, lastDb.Calls[1].Args["@first"]);
        Assert.Equal(45, lastDb.Calls[1].Args["@last"]);
        Assert.Equal(11, Dates(last).Length);
        Assert.Equal("2025년 6월 26일", Dates(last)[10]);
        Assert.Null(Next(last));
        Assert.Equal(0, last.GetProperty("more").GetInt64());
    }

    [Fact(DisplayName = "AC-1404.1 시작 위치가 지난 내원 수 이상이면 쪽 문장을 돌리지 않고 빈 목록(next null·more 0), 아주 큰 시작 위치도 넘치지 않는다")]
    public void PastTheEnd()
    {
        foreach (var from in new[] { 36, 100, int.MaxValue })
        {
            var db = DetailFake.Answer(new FakeDb());
            var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), from, new CacheClock(Morning).Now);
            Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.VisitSymptoms }, db.Sqls);
            Assert.Empty(Dates(history));
            Assert.Null(Next(history));
            Assert.Equal(0, history.GetProperty("more").GetInt64());
            Assert.Equal(37, history.GetProperty("total").GetInt64());
        }

        var huge = new FakeDb();
        huge.Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { 3_000_000_000L, "20000101" } });
        huge.Answer(ReceptionSql.HistoryPage, _ => new object?[0][]);
        huge.Answer(ReceptionSql.VisitSymptoms, _ => new object?[0][]);
        DetailApi.Read(huge, DetailFake.Board(), DetailFake.Today(), int.MaxValue - 3, new CacheClock(Morning).Now);
        Assert.Equal(int.MaxValue - 2, huge.Calls[1].Args["@first"]);
        Assert.Equal(int.MaxValue, huge.Calls[1].Args["@last"]);
    }

    [Fact(DisplayName = "AC-1404.1 쪽 줄은 내원마다 묶어 비트가 준 차례(최근 순) 그대로, 처방 없는 내원(RxCode NULL)은 빈 처방, 내원번호가 빈 줄은 버리고 한 쪽보다 많이 주지 않는다")]
    public void GroupsPageRows()
    {
        var db = PaperFake.Answer(new FakeDb());
        db.Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { 9L, "20240312" } });
        db.Answer(ReceptionSql.HistoryPage, _ => new[]
        {
            new object?[] { "V0209", "20261029", "DS20" },
            new object?[] { "V0209", "20261029", "ESWT7" },
            new object?[] { "V0208", "20261022", null },
            new object?[] { " ", "20261020", "PT01" },
            new object?[] { "V0207", "20261015", "PT01" },
            new object?[] { "V0206", "20261008", "PT01" },
            new object?[] { "V0205", "20261001", "PT01" },
            new object?[] { "V0204", "20260924", "PT01" },
        });
        db.Answer(ReceptionSql.VisitSymptoms, _ => new object?[0][]);

        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "10월 29일", "10월 22일", "10월 15일", "10월 8일", "10월 1일" }, Dates(history));
        var visits = history.GetProperty("visits").EnumerateArray().ToArray();
        Assert.Equal(new[] { "DS20", "ESWT7" }, visits[0].GetProperty("rx").EnumerateArray().Select(rx => rx.GetProperty("code").GetString()));
        Assert.Equal(new[] { "도수치료 20분", "체외충격파" }, visits[0].GetProperty("rx").EnumerateArray().Select(rx => rx.GetProperty("name").GetString()));
        Assert.Empty(visits[1].GetProperty("rx").EnumerateArray());
        Assert.Equal(5, Next(history));
        Assert.Equal(4, history.GetProperty("more").GetInt64());
        Assert.Equal("2024년 3월 12일", history.GetProperty("first").GetString());
    }

    [Fact(DisplayName = "AC-1404.1 처방 이름은 그날 이름표(BoardInput.RxNames)로 붙이고 코드 순, 이름표에 없는 코드는 이름 \"\"")]
    public void NamesFromBoard()
    {
        var db = DetailFake.Answer(new FakeDb());
        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now);

        var visits = history.GetProperty("visits").EnumerateArray().ToArray();
        (string?, string?)[] Rx(JsonElement visit) =>
            visit.GetProperty("rx").EnumerateArray().Select(rx => (rx.GetProperty("name").GetString(), rx.GetProperty("code").GetString())).ToArray();
        Assert.Equal(new (string?, string?)[] { ("도수치료 20분", "DS20"), ("체외충격파", "ESWT7") }, Rx(visits[0]));
        Assert.Equal(new (string?, string?)[] { ("체외충격파", "ESWT7"), ("표층열치료", "PT01") }, Rx(visits[1]));
        Assert.Empty(Rx(visits[2]));
        Assert.Equal(new (string?, string?)[] { ("간섭파치료", "PT03"), ("", "ZZ9") }, Rx(visits[3]));
    }

    [Fact(DisplayName = "AC-1404.1 읽기 한 번의 시간 제한 8초: 문장마다 남은 시간을 주고, 다 쓰면 다음 문장을 돌리지 않고 E-BIT-READ-FAILED")]
    public void OneBudget()
    {
        var clock = new CacheClock(Morning);
        var db = DetailFake.Answer(new FakeDb());
        db.Answer(ReceptionSql.HistoryCount, _ =>
        {
            clock.Advance(TimeSpan.FromSeconds(3));
            return new[] { new object?[] { 36L, "20250626" } };
        });
        db.Answer(ReceptionSql.HistoryPage, args =>
        {
            clock.Advance(TimeSpan.FromSeconds(2));
            return DetailFake.Page(args, DetailFake.Earlier);
        });
        DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, clock.Now);
        Assert.Equal(TimeSpan.FromSeconds(8), db.Calls[0].Timeout);
        Assert.Equal(TimeSpan.FromSeconds(5), db.Calls[1].Timeout);
        Assert.Equal(TimeSpan.FromSeconds(3), db.Calls[2].Timeout);

        var spent = DetailFake.Answer(new FakeDb());
        spent.Answer(ReceptionSql.HistoryCount, _ =>
        {
            clock.Advance(TimeSpan.FromSeconds(8));
            return new[] { new object?[] { 36L, "20250626" } };
        });
        var error = Assert.Throws<BitException>(() => DetailApi.Read(spent, DetailFake.Board(), DetailFake.Today(), 0, clock.Now));
        Assert.Equal(BitErrors.ReadFailed, error.Code);
        Assert.Equal(new[] { ReceptionSql.HistoryCount }, spent.Sqls);
    }

    [Fact(DisplayName = "AC-1404.1 칸이 모자란 줄·숫자 아닌 수·음수·수 줄 없음·문장 실패는 일부만 주지 않고 E-BIT-READ-FAILED")]
    public void ReadFailures()
    {
        var cases = new List<FakeDb>
        {
            DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { 36L } }),
            DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { "많음", "20250626" } }),
            DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { -1L, "20250626" } }),
            DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.HistoryCount, _ => new object?[0][]),
            DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.HistoryPage, _ => new[] { new object?[] { "V0201", "20261029" } }),
            DetailFake.Answer(new FakeDb()).Fail(ReceptionSql.HistoryPage, BitErrors.ReadFailed),
        };
        foreach (var db in cases)
        {
            var error = Assert.Throws<BitException>(() => DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now));
            Assert.Equal(BitErrors.ReadFailed, error.Code);
        }
    }

    [Fact(DisplayName = "AC-1404.1 차트번호가 빈 접수는 다른 환자를 읽지 않게 상세 문장을 돌리지 않고 지난 진료 없음(total 1, 처음 온 날 오늘)")]
    public void BlankChartReadsNothing()
    {
        var db = DetailFake.Answer(new FakeDb());
        var visit = DetailFake.Today(chart: "");

        var history = DetailApi.Read(db, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);

        Assert.Empty(db.Calls);
        Assert.Empty(Dates(history));
        Assert.Equal(1, history.GetProperty("total").GetInt64());
        Assert.Equal("2026년 11월 5일", history.GetProperty("first").GetString());
    }

    [Fact(DisplayName = "AC-1404.1 그 환자 한 명만 그때 읽는다: 등록 확인 뒤 상세 문장 둘만 돌고(오늘 접수 문장 없음), 다시 열면 다시 읽는다(서버에 쌓지 않음)")]
    public void OnePatientEachTime()
    {
        using var rig = NewRig();
        var (keys, key) = KeysFor();
        var board = new BoardSource(BoardResult.Ok(DetailFake.Board(DetailFake.Today(), DetailFake.Today("V1002", "900102", "20261105093005"))));
        var clock = new CacheClock(Morning);

        var first = Ok(DetailApi.Get(rig.Services, keys, board.Get, key, "0", clock.Now));
        var again = Ok(DetailApi.Get(rig.Services, keys, board.Get, key, "0", clock.Now));

        Assert.Equal(Dates(first), Dates(again));
        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage, ReceptionSql.HistoryCount, ReceptionSql.HistoryPage }, HistorySqls(rig.Session));
        Assert.DoesNotContain(rig.Session.Sqls, sql => sql == ReceptionSql.TodayVisits || sql == ReceptionSql.PriorVisits);
        Assert.All(rig.Session.Calls.Where(call => call.Sql == ReceptionSql.HistoryCount), call => Assert.Equal("900101", call.Args["@chart"]));
        Assert.Equal(2, rig.Connector.Opened.Count);
        Assert.Equal(2, rig.Session.Disposed);
        Assert.Equal(2, board.Calls);
    }

    [Fact(DisplayName = "AC-1404.1 올바른 시작 위치(\"0\"·\"5\"·앞 0 \"05\"·int 끝)만 그 위치부터 읽는다")]
    public void GoodFromReads()
    {
        foreach (var (from, first) in new[] { ("0", 1), ("5", 6), ("05", 6), ("25", 26) })
        {
            using var rig = NewRig();
            var (keys, key) = KeysFor();
            var board = new BoardSource(BoardResult.Ok(DetailFake.Board()));
            Ok(DetailApi.Get(rig.Services, keys, board.Get, key, from, new CacheClock(Morning).Now));
            var page = rig.Session.Calls.Single(call => call.Sql == ReceptionSql.HistoryPage);
            Assert.Equal(first, page.Args["@first"]);
        }

        using var end = NewRig();
        var (endKeys, endKey) = KeysFor();
        var endHistory = Ok(DetailApi.Get(end.Services, endKeys, new BoardSource(BoardResult.Ok(DetailFake.Board())).Get, endKey, "2147483647", new CacheClock(Morning).Now));
        Assert.Empty(Dates(endHistory));
    }

    [Fact(DisplayName = "AC-1404.1 볼 수 없음(번호만, 환자 자료 없음): 등록 없음 E-BIT-NOT-REGISTERED·병원 다름·문장 실패 E-BIT-READ-FAILED·접수 현황을 못 읽음은 그 번호")]
    public void Unavailable()
    {
        var (keys, key) = KeysFor();

        using (var unregistered = new Rig())
        {
            unregistered.Today = Morning.Date;
            var answer = DetailApi.Get(unregistered.Services, keys, new BoardSource(BoardResult.Ok(DetailFake.Board())).Get, key, "0", new CacheClock(Morning).Now);
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.NotRegistered, answer.Error);
            Assert.Null(answer.Json);
        }

        using (var other = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            other.Today = Morning.Date;
            DetailFake.Answer(other.Session);
            var answer = DetailApi.Get(other.Services, keys, new BoardSource(BoardResult.Ok(DetailFake.Board())).Get, key, "0", new CacheClock(Morning).Now);
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.HospitalMismatch, answer.Error);
            Assert.DoesNotContain(other.Session.Sqls, sql => sql == ReceptionSql.HistoryCount);
            Assert.Equal(1, other.Session.Disposed);
        }

        using (var failing = NewRig())
        {
            failing.Session.Fail(ReceptionSql.HistoryPage, BitErrors.ReadFailed);
            var answer = DetailApi.Get(failing.Services, keys, new BoardSource(BoardResult.Ok(DetailFake.Board())).Get, key, "0", new CacheClock(Morning).Now);
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.ReadFailed, answer.Error);
            Assert.Null(answer.Json);
            Assert.Equal(1, failing.Session.Disposed);
        }

        using (var noBoard = NewRig())
        {
            var board = new BoardSource(BoardResult.Unavailable(BitErrors.NotRegistered));
            var answer = DetailApi.Get(noBoard.Services, keys, board.Get, key, "0", new CacheClock(Morning).Now);
            Assert.Equal("Unavailable", answer.State);
            Assert.Equal(BitErrors.NotRegistered, answer.Error);
            Assert.Empty(noBoard.Connector.Opened);
        }
    }

    // ---- AC-1404.2·AC-1404.4·AC-1410.4 증상 (VisitSymptoms) ------------------------------------------------

    private static string[] Syms(JsonElement history) =>
        history.GetProperty("visits").EnumerateArray().Select(visit => visit.GetProperty("sym").GetString()!).ToArray();

    [Fact(DisplayName = "AC-1410.4 증상 문장 VisitSymptoms는 쪽 문장 뒤에 한 번, HistoryPage와 같은 매개변수(@chart·@before·@hospital·@first·@last)로 돈다")]
    public void SymptomsReadOnceWithPageArgs()
    {
        var db = DetailFake.Answer(new FakeDb());
        DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 5, new CacheClock(Morning).Now);

        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage, ReceptionSql.VisitSymptoms }, db.Sqls);
        Assert.Equal(db.Calls[1].Args, db.Calls[2].Args);
        Assert.Equal(6, db.Calls[2].Args["@first"]);
        Assert.Equal(25, db.Calls[2].Args["@last"]);
    }

    [Fact(DisplayName = "AC-1404.2 지난 내원마다 증상 글은 그 내원의 S 줄을 비트가 준 차례(EmrUpdDtm 순)대로 앞뒤 공백을 빼고 공백 하나로 이은 것이고, 줄이 없는 내원은 \"\"(칸 없음)")]
    public void PastVisitSymptoms()
    {
        var db = DetailFake.Answer(new FakeDb());
        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "오른쪽 어깨 통증 밤에 더 아픔 팔 들 때 걸림", "어깨 조금 나아짐", "", "", "" }, Syms(history));
    }

    [Fact(DisplayName = "AC-1410.4 이은 글: 줄 사이는 공백 하나, 빈 글·공백만 있는 줄은 잇지 않고, 다른 내원·빈 내원번호 줄은 버리며, 내원마다 따로 모은다")]
    public void JoinsLinesPerVisit()
    {
        var db = DetailFake.Answer(new FakeDb());
        db.Answer(ReceptionSql.VisitSymptoms, _ => new[]
        {
            new object?[] { "V2001", "  목 뻐근함\r\n" },
            new object?[] { "V2002", "허리" },
            new object?[] { "V2001", "   " },
            new object?[] { "V2001", null },
            new object?[] { "V2001", "" },
            new object?[] { "V9999", "다른 내원" },
            new object?[] { " ", "빈 내원번호" },
            new object?[] { null, "빈 내원번호" },
            new object?[] { "V2002", "\t왼쪽 " },
            new object?[] { "V2001", "고개 돌릴 때 아픔" },
            new object?[] { " V2004 ", "무릎" },
        });

        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "목 뻐근함 고개 돌릴 때 아픔", "허리 왼쪽", "", "무릎", "" }, Syms(history));
        Assert.Equal("", history.GetProperty("todaySym").GetString());
    }

    [Fact(DisplayName = "AC-1404.4 오늘 증상(todaySym)은 오늘 접수 내원의 S 줄을 이은 글이다(상세를 열 때 읽음)")]
    public void TodaySymptom()
    {
        using var rig = NewRig();
        var (keys, key) = KeysFor();
        var history = Ok(DetailApi.Get(rig.Services, keys, new BoardSource(BoardResult.Ok(DetailFake.Board())).Get, key, "0", new CacheClock(Morning).Now));

        Assert.Equal("어깨가 다시 아파서 옴 오늘 주사 원함", history.GetProperty("todaySym").GetString());
        Assert.Contains(ReceptionSql.VisitSymptoms, rig.Session.Sqls);
    }

    [Fact(DisplayName = "AC-1404.4 지난 내원이 더 없는 쪽(from이 수 이상)이어도 오늘 증상은 읽는다, 차트번호가 빈 접수는 증상 문장도 돌리지 않아 \"\"")]
    public void TodaySymptomWithoutPage()
    {
        var db = DetailFake.Answer(new FakeDb());
        var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 36, new CacheClock(Morning).Now);
        Assert.Equal("어깨가 다시 아파서 옴 오늘 주사 원함", history.GetProperty("todaySym").GetString());

        var blank = DetailFake.Answer(new FakeDb());
        var visit = DetailFake.Today(chart: "");
        var none = DetailApi.Read(blank, DetailFake.Board(visit), visit, 0, new CacheClock(Morning).Now);
        Assert.Empty(blank.Calls);
        Assert.Equal("", none.GetProperty("todaySym").GetString());
    }

    [Fact(DisplayName = "AC-1404.2 증상 칸(ReceptionMap.Columns.Symptom)이 없으면 증상 문장을 돌리지 않고 내원마다 sym·todaySym은 \"\"(칸 없음)")]
    public void NoSymptomColumnReadsNothing()
    {
        var plan = ReceptionMap.Columns!;
        var noSymptom = new ColumnPlan(plan.Name, plan.BirthDate, plan.Sex, plan.Memo, plan.PaidAt, symptom: null);
        foreach (var columns in new[] { noSymptom, null })
        {
            var db = DetailFake.Answer(new FakeDb());
            var history = DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, new CacheClock(Morning).Now, columns);

            Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage }.Concat(PaperFake.Sqls), db.Sqls);
            Assert.DoesNotContain(ReceptionSql.VisitSymptoms, db.Sqls);
            Assert.All(Syms(history), sym => Assert.Equal("", sym));
            Assert.Equal("", history.GetProperty("todaySym").GetString());
        }
    }

    [Fact(DisplayName = "AC-1410.4 증상 문장이 실패하거나·칸이 모자라거나·시간이 다 가면 일부만 주지 않고 E-BIT-READ-FAILED")]
    public void SymptomFailures()
    {
        var clock = new CacheClock(Morning);
        var spent = DetailFake.Answer(new FakeDb());
        spent.Answer(ReceptionSql.HistoryPage, args =>
        {
            clock.Advance(TimeSpan.FromSeconds(8));
            return DetailFake.Page(args, DetailFake.Earlier);
        });
        var cases = new[]
        {
            (Db: DetailFake.Answer(new FakeDb()).Fail(ReceptionSql.VisitSymptoms, BitErrors.ReadFailed), Clock: new CacheClock(Morning)),
            (Db: DetailFake.Answer(new FakeDb()).Answer(ReceptionSql.VisitSymptoms, _ => new[] { new object?[] { "V2001" } }), Clock: new CacheClock(Morning)),
            (Db: spent, Clock: clock),
        };
        foreach (var (db, at) in cases)
        {
            var error = Assert.Throws<BitException>(() => DetailApi.Read(db, DetailFake.Board(), DetailFake.Today(), 0, at.Now));
            Assert.Equal(BitErrors.ReadFailed, error.Code);
        }
        Assert.Equal(new[] { ReceptionSql.HistoryCount, ReceptionSql.HistoryPage }, spent.Sqls);
    }

    // ---- AC-1404.5 틀린 열쇠·시작 위치는 비트를 읽지 않는다 ------------------------------------------------

    [Fact(DisplayName = "AC-1404.5 그날 열쇠표에 없는 열쇠·모양이 틀린 열쇠(대문자·15자리·17자리·16진수 아님·빈 글·null)·다른 날 열쇠는 비트도 접수 현황도 읽지 않고 환자 자료 없음")]
    public void WrongKeyReadsNothing()
    {
        var (keys, key) = KeysFor();
        var unknown = key == "0123456789abcdef" ? "fedcba9876543210" : "0123456789abcdef";
        var wrongKeys = new[] { unknown, key.ToUpperInvariant(), key.Substring(1), key + "0", "g123456789abcdef", "", " " + key.Substring(1), null };
        Assert.NotEqual(key, key.ToUpperInvariant());

        foreach (var wrong in wrongKeys)
        {
            using var rig = NewRig();
            var board = new BoardSource(BoardResult.Ok(DetailFake.Board()));
            NotFound(DetailApi.Get(rig.Services, keys, board.Get, wrong, "0", new CacheClock(Morning).Now));
            NothingRead(rig, board);
        }

        var yesterday = new VisitKeys();
        var oldKey = yesterday.KeyOf("20261104", DetailFake.TodayId);
        using (var rig = NewRig())
        {
            var board = new BoardSource(BoardResult.Ok(DetailFake.Board()));
            NotFound(DetailApi.Get(rig.Services, yesterday, board.Get, oldKey, "0", new CacheClock(Morning).Now));
            NothingRead(rig, board);
        }
    }

    [Fact(DisplayName = "AC-1404.5 음수·숫자 아닌·빈·소수·공백·부호·int를 넘는 시작 위치는 올바른 열쇠라도 비트도 접수 현황도 읽지 않고 환자 자료 없음")]
    public void BadFromReadsNothing()
    {
        var (keys, key) = KeysFor();
        foreach (var from in new[] { "-1", "-0", "abc", "", " ", null, "1.5", " 5", "5 ", "+5", "1e3", "0x10", "2147483648", "99999999999", "５" })
        {
            using var rig = NewRig();
            var board = new BoardSource(BoardResult.Ok(DetailFake.Board()));
            NotFound(DetailApi.Get(rig.Services, keys, board.Get, key, from, new CacheClock(Morning).Now));
            NothingRead(rig, board);
        }
    }

    [Fact(DisplayName = "AC-1404.5 열쇠는 있으나 그날 접수 현황에 그 내원이 없거나 날이 다르면 등록 확인·상세 문장을 돌리지 않고 환자 자료 없음")]
    public void VisitGoneReadsNothing()
    {
        var (keys, key) = KeysFor();

        using (var rig = NewRig())
        {
            var board = new BoardSource(BoardResult.Ok(DetailFake.Board(DetailFake.Today("V1002", "900102", "20261105093005"))));
            NotFound(DetailApi.Get(rig.Services, keys, board.Get, key, "0", new CacheClock(Morning).Now));
            Assert.Empty(rig.Connector.Opened);
            Assert.Empty(rig.Session.Calls);
        }

        using (var rig = NewRig())
        {
            var other = new BoardInput("20261104", Morning.AddDays(-1), new[] { DetailFake.Today() }, DetailFake.Names);
            var board = new BoardSource(BoardResult.Ok(other));
            NotFound(DetailApi.Get(rig.Services, keys, board.Get, key, "0", new CacheClock(Morning).Now));
            Assert.Empty(rig.Connector.Opened);
            Assert.Empty(rig.Session.Calls);
        }
    }
}

/// <summary>
/// 상세 시험이 같이 쓰는 가짜 비트 자료. 모두 지어낸 것이다.
/// 오늘 접수 V1001(차트 900101, 2026-11-05 09:12:30 접수)의 앞선 완료 내원 36번: 최근 순 k번째는 내원번호 V(2000+k), 날짜는 2026-10-29에서 14일씩 앞.
/// 처방: 1번째 ESWT7·DS20, 2번째 PT01·ESWT7, 3번째 없음, 4번째 ZZ9(이름표에 없음)·PT03, 나머지 PT01.
/// 증상 줄(VisitSymptoms): 1번째 세 줄, 2번째 한 줄, 나머지 없음, 오늘 접수(같은 차트·같은 접수 시각) 두 줄.
/// 종이 문장 다섯(from=0에서만 돈다)의 줄은 PaperFake가 준다.
/// </summary>
internal static class DetailFake
{
    public const string Day = "20261105";
    public const string TodayId = "V1001";
    public const string Chart = "900101";
    public const string Accepted = "20261105091230";
    public const int Earlier = 36;

    public static readonly DateTime Morning = BoardFake.Morning;

    public static readonly IReadOnlyDictionary<string, string> Names = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["ESWT7"] = "체외충격파",
        ["DS20"] = "도수치료 20분",
        ["PT01"] = "표층열치료",
        ["PT03"] = "간섭파치료",
    };

    public static VisitRow Today(string visitId = TodayId, string chart = Chart, string accepted = Accepted) =>
        new VisitRow(visitId, chart, accepted, "S1", "N", earlierCount: Earlier);

    public static BoardInput Board(params VisitRow[] rows) =>
        new BoardInput(Day, Morning, rows.Length == 0 ? new[] { Today() } : rows, Names);

    public static string VisitId(int seq) => "V" + (2000 + seq).ToString(CultureInfo.InvariantCulture);

    public static string DayOf(int seq) =>
        new DateTime(2026, 10, 29).AddDays(-14 * (seq - 1)).ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    public static string[] CodesOf(int seq) => seq switch
    {
        1 => new[] { "ESWT7", "DS20" },
        2 => new[] { "PT01", "ESWT7" },
        3 => new string[0],
        4 => new[] { "ZZ9", "PT03" },
        _ => new[] { "PT01" },
    };

    /// <summary>HistoryPage 흉내: 최근 순 @first~@last번째(둘 다 포함) 내원의 처방 줄, 처방이 없으면 RxCode NULL 한 줄(문장처럼 Seq·코드 순).</summary>
    public static object?[][] Page(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var first = (int)args["@first"]!;
        var last = Math.Min((int)args["@last"]!, earlier);
        var rows = new List<object?[]>();
        for (var seq = first; seq <= last; seq++)
        {
            var codes = CodesOf(seq).OrderBy(code => code, StringComparer.Ordinal).ToArray();
            if (codes.Length == 0) rows.Add(new object?[] { VisitId(seq), DayOf(seq), null });
            foreach (var code in codes) rows.Add(new object?[] { VisitId(seq), DayOf(seq), code });
        }
        return rows.ToArray();
    }

    public static string[] SymptomLinesOf(int seq) => seq switch
    {
        1 => new[] { "오른쪽 어깨 통증 ", " 밤에 더 아픔", "팔 들 때 걸림" },
        2 => new[] { "어깨 조금 나아짐" },
        _ => new string[0],
    };

    public static readonly string[] TodaySymptomLines = { "어깨가 다시 아파서 옴", "오늘 주사 원함" };

    /// <summary>VisitSymptoms 흉내: 최근 순 @first~@last번째 지난 내원과 그 접수(차트·접수 시각이 같은 오늘 접수)의 S 줄(VisitId, Line), 내원마다 줄 차례대로.</summary>
    public static object?[][] Symptoms(IReadOnlyDictionary<string, object?> args, int earlier)
    {
        var first = (int)args["@first"]!;
        var last = Math.Min((int)args["@last"]!, earlier);
        var rows = new List<object?[]>();
        for (var seq = first; seq <= last; seq++)
            foreach (var line in SymptomLinesOf(seq)) rows.Add(new object?[] { VisitId(seq), line });
        if (Equals(args["@chart"], Chart) && Equals(args["@before"], Accepted))
            foreach (var line in TodaySymptomLines) rows.Add(new object?[] { TodayId, line });
        return rows.ToArray();
    }

    public static T Answer<T>(T db, int earlier = Earlier) where T : FakeDb
    {
        db.Answer(ReceptionSql.HistoryCount, _ => new[] { new object?[] { (long)earlier, earlier == 0 ? null : DayOf(earlier) } });
        db.Answer(ReceptionSql.HistoryPage, args => Page(args, earlier));
        db.Answer(ReceptionSql.VisitSymptoms, args => Symptoms(args, earlier));
        return PaperFake.Answer(db);
    }
}

/// <summary>
/// 의원 PC 확인 보고서의 칸 모양을 흉내 낸 가짜 비트(모두 지어낸 자료): OcmNum char(10)(값은 왼쪽, 뒤 공백), OcmChtNum char(14)(번호는 오른쪽, 앞 공백),
/// OcmAcpDtm char(12). 문장마다 SQL Server처럼 답한다: 글자 칸 비교(=·&lt;)는 짧은 쪽 끝에 공백을 채워 견주고(끝 공백은 무시, 앞 공백은 글자),
/// RTRIM은 끝 공백만, 내원번호(T.OcmNum·H.OcmNum)는 원값(뒤 공백 포함)으로 준다. 종이 문장 다섯도 같은 견주기로 답한다.
/// </summary>
internal static class RealShapeBit
{
    public const string TodayId = "V3001";

    private sealed class Row
    {
        public Row(string id, string chart, string accepted, string status)
        {
            Id = id.PadRight(10);
            Chart = chart.PadLeft(14);
            Accepted = accepted;
            Status = status;
        }

        public string Id { get; }
        public string Chart { get; }
        public string Accepted { get; }
        public string Status { get; }
    }

    private static readonly string[] Done = { "HN", "PN", "TN", "VN", "OE", "WN", "OB" };

    private static readonly Row[] OcmInf =
    {
        new Row("V2901", "900201", "202610150930", "PN"),
        new Row("V2902", "900201", "202610290940", "PN"),
        new Row("V2903", "900201", "202611010900", "CN"),
        new Row("V2801", "900202", "202609010900", "PN"),
        new Row(TodayId, "900201", "202611050912", "TN"),
        new Row("V3002", "900203", "202611050930", "WN"),
    };

    private static readonly (string Visit, string Line)[] EmrS =
    {
        ("V2902", "어깨 통증"), ("V2902", " 밤에 더 아픔 "), ("V2801", "다른 환자 증상"), (TodayId, "오늘 다시 아파서 옴"),
    };

    /// <summary>SQL Server의 글자 비교: 짧은 쪽 끝에 공백을 채워 서수로 견준다.</summary>
    private static int Compare(string a, string b)
    {
        var width = Math.Max(a.Length, b.Length);
        return string.CompareOrdinal(a.PadRight(width), b.PadRight(width));
    }

    private static bool Same(string a, object? b) => b is string text && Compare(a, text) == 0;

    private static IEnumerable<Row> EarlierDone(object? chart, object? before) =>
        OcmInf.Where(c => Same(c.Chart, chart) && before is string at && Compare(c.Accepted, at) < 0 && Done.Contains(c.Status))
            .OrderByDescending(c => c.Accepted, StringComparer.Ordinal)
            .ThenByDescending(c => c.Id, StringComparer.Ordinal);

    private static IEnumerable<Row> Window(IReadOnlyDictionary<string, object?> args) =>
        EarlierDone(args["@chart"], args["@before"]).Skip((int)args["@first"]! - 1).Take((int)args["@last"]! - (int)args["@first"]! + 1);

    /// <summary>종이 문장의 '그 접수': 같은 차트번호·같은 접수 시각(둘 다 SQL Server 글자 비교).</summary>
    private static IEnumerable<Row> ThisVisit(IReadOnlyDictionary<string, object?> args) =>
        OcmInf.Where(c => Same(c.Chart, args["@chart"]) && Same(c.Accepted, args["@before"]));

    public static T Answer<T>(T db) where T : FakeDb
    {
        db.Answer(ReceptionSql.TodayVisits, args => OcmInf
            .Where(c => Compare(c.Accepted, (string)args["@from"]!) >= 0 && Compare(c.Accepted, (string)args["@to"]!) < 0)
            .Select(c => new object?[] { c.Id, c.Chart.TrimEnd(' '), c.Accepted, c.Status, "" })
            .ToArray());
        db.Answer(ReceptionSql.TodayRx, _ => new object?[0][]);
        db.Answer(ReceptionSql.TodayOrderTimes, _ => new object?[0][]);
        db.Answer(ReceptionSql.PriorVisits, args => OcmInf
            .Where(t => Compare(t.Accepted, (string)args["@from"]!) >= 0 && Compare(t.Accepted, (string)args["@to"]!) < 0 && t.Chart.Trim().Length > 0)
            .Select(t => (Today: t, Earlier: EarlierDone(t.Chart, t.Accepted).ToArray()))
            .Where(p => p.Earlier.Length > 0)
            .Select(p => new object?[] { p.Today.Id, (long)p.Earlier.Length, p.Earlier[0].Id, p.Earlier[0].Accepted.Substring(0, 8) })
            .ToArray());
        db.Answer(ReceptionSql.PriorSymptoms, _ => new object?[0][]);
        db.Answer(ReceptionSql.HistoryCount, args =>
        {
            var earlier = EarlierDone(args["@chart"], args["@before"]).ToArray();
            var first = earlier.Length == 0 ? null : earlier.Min(c => c.Accepted)!.Substring(0, 8);
            return new[] { new object?[] { (long)earlier.Length, first } };
        });
        db.Answer(ReceptionSql.HistoryPage, args => Window(args)
            .Select(c => new object?[] { c.Id, c.Accepted.Substring(0, 8), null })
            .ToArray());
        db.Answer(ReceptionSql.VisitSymptoms, args =>
        {
            var visits = Window(args).Select(c => c.Id)
                .Concat(OcmInf.Where(c => Same(c.Chart, args["@chart"]) && Same(c.Accepted, args["@before"])).Select(c => c.Id))
                .ToArray();
            return visits.SelectMany(id => EmrS.Where(e => Same(id, e.Visit)).Select(e => new object?[] { id, e.Line })).ToArray();
        });
        // 종이 문장(spec reception-paper): 사람 줄은 그 차트번호, 내원·증상 줄은 그 접수만. 상병·처방 줄은 없다
        db.Answer(ReceptionSql.PaperPerson, args => OcmInf.Any(c => Same(c.Chart, args["@chart"]))
            ? new[] { new object?[] { "910203", "가상시 가상로 7", null, null, "010-0000-0003", null } }
            : new object?[0][]);
        db.Answer(ReceptionSql.PaperVisit, args => ThisVisit(args).Select(c => new object?[] { c.Id, "2진료실", "의료급여" }).ToArray());
        db.Answer(ReceptionSql.PaperSymptoms, args => ThisVisit(args)
            .SelectMany(c => EmrS.Where(e => Same(c.Id, e.Visit)).Select(e => new object?[] { c.Id, e.Line }))
            .ToArray());
        db.Answer(ReceptionSql.PaperDx, _ => new object?[0][]);
        db.Answer(ReceptionSql.PaperOrders, _ => new object?[0][]);
        return db;
    }
}

/// <summary>상세 공개 길(HistoryReader·HistoryBuilder)을 시험이 부르는 곳: 답을 (상태, 오류 번호, JSON)으로 바꿔 견주기 쉽게 한다.</summary>
internal static class DetailApi
{
    public sealed class Answer
    {
        public Answer(string state, string? error, JsonElement? json)
        {
            State = state;
            Error = error;
            Json = json;
        }

        public string State { get; }
        public string? Error { get; }
        public JsonElement? Json { get; }
    }

    /// <summary>HistoryReader.Get(services, keys, board, key, from, clock) → (상태, 오류 번호, JSON).</summary>
    public static Answer Get(BitServices services, VisitKeys keys, Func<BoardResult> board, string? key, string? from, Func<DateTime> clock)
    {
        var result = HistoryReader.Get(services, keys, board, key, from, clock);
        return new Answer(result.State.ToString(), result.Error, result.History == null ? null : Parse(result.History.ToJson()));
    }

    /// <summary>HistoryReader.Read(db, 등록 범위, board, visit, from, clock) → HistoryBuilder.Build → JSON.</summary>
    public static JsonElement Read(IBitDb db, BoardInput board, VisitRow visit, int from, Func<DateTime> clock) =>
        Parse(HistoryBuilder.Build(HistoryReader.Read(db, Synthetic.Scope, board, visit, from, clock)).ToJson());

    /// <summary>칸(columns, 보통 ReceptionMap.Columns)을 정해 읽기: HistoryReader.Read(db, 등록 범위, board, visit, from, clock, columns) → JSON.</summary>
    public static JsonElement Read(IBitDb db, BoardInput board, VisitRow visit, int from, Func<DateTime> clock, ColumnPlan? columns) =>
        Parse(HistoryBuilder.Build(HistoryReader.Read(db, Synthetic.Scope, board, visit, from, clock, columns)).ToJson());

    /// <summary>HistoryInput(오늘, 시작 위치, 앞선 완료 내원 수, 첫날, 이 쪽 내원들, 오늘 증상) → HistoryBuilder.Build → ToJson 글.</summary>
    public static string BuildText(string day, int from, long earlier, string? firstDay, IEnumerable<HistoryVisit> visits, string? todaySymptom) =>
        HistoryBuilder.Build(new HistoryInput(day, from, earlier, firstDay, visits.ToArray(), todaySymptom)).ToJson();

    public static JsonElement Build(string day, int from, long earlier, string? firstDay, IEnumerable<HistoryVisit> visits, string? todaySymptom) =>
        Parse(BuildText(day, from, earlier, firstDay, visits, todaySymptom));

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
