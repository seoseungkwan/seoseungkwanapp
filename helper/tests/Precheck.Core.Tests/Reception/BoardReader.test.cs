using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Cache 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Cache;

/// <summary>
/// 비트 읽기 묶음(BoardReader, design.md 3절). 오늘 접수 → 날 줄(BoardInput·VisitRow·RxItem).
/// AC-1403.4 읽기 한 번의 시간 제한 8초(문장마다 남은 시간), AC-1403.5 읽기 실패는 E-BIT-READ-FAILED,
/// AC-1403.6 그날(@from~@to)의 접수만 읽음, AC-1403.7 하루 이름표로 처방 이름을 붙임.
/// 가짜 DB·가짜 자료만 쓴다(차트번호 9로 시작하는 6자리, 내원번호 V+숫자, 처방 코드는 시안의 것).
/// </summary>
public class BoardReaderTests
{
    private static readonly DateTime Morning = BoardFake.Morning;

    private static readonly string[] Order =
    {
        ReceptionSql.RxNames, ReceptionSql.TodayVisits, ReceptionSql.TodayRx, ReceptionSql.TodayOrderTimes, ReceptionSql.PriorVisits, ReceptionSql.PriorSymptoms,
        ReceptionSql.TodayPeople, ReceptionSql.TodayMemos, ReceptionSql.TodayPaid,
    };

    /// <summary>증상 칸이 없을 때(칸 문장 PriorSymptoms를 돌리지 않음)의 차례.</summary>
    private static string[] OrderWithoutSymptoms() => Order.Where(sql => sql != ReceptionSql.PriorSymptoms).ToArray();

    private static (string Code, string? Name)[] Rx(params (string Code, string? Name)[] items) => items;

    private static (string Code, string? Name)[] Pairs(IEnumerable<RxItem> items) => items.Select(item => (item.Code, item.Name)).ToArray();

    // ---- AC-1403.6 그날의 접수만, 정해 둔 차례 -------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.6 이름표 → 오늘 접수 → 오늘 처방 → 지난 내원 → 지난 증상 차례로, 그날 @from·@to(yyyyMMdd0000 ~ 다음 날 0000)와 등록 범위만 넘긴다")]
    public void ReadsTodayInOrder()
    {
        var clock = new CacheClock(Morning);
        var db = BoardFake.Quiet(new FakeDb());

        BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now);

        Assert.Equal(Order, db.Sqls);
        Assert.Empty(db.Calls[0].Args);
        foreach (var call in db.Calls.Skip(1))
        {
            Assert.Equal(3, call.Args.Count);
            Assert.Equal("202611050000", call.Args["@from"]);
            Assert.Equal("202611060000", call.Args["@to"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        }
    }

    [Fact(DisplayName = "AC-1403.6 날·달·해가 바뀌면 그 새 날의 @from·@to로 읽고, 날 줄의 Day·ReadAt은 읽은 때다")]
    public void NewDayRange()
    {
        foreach (var (now, from, to) in new[]
        {
            (new DateTime(2026, 11, 6, 0, 0, 5), "202611060000", "202611070000"),
            (new DateTime(2026, 11, 30, 23, 59, 59), "202611300000", "202612010000"),
            (new DateTime(2026, 12, 31, 8, 30, 0), "202612310000", "202701010000"),
        })
        {
            var db = BoardFake.Quiet(new FakeDb());
            var input = BoardReader.Read(db, Synthetic.Scope, now, new CacheClock(now).Now);
            Assert.Equal(from.Substring(0, 8), input.Day);
            Assert.Equal(now, input.ReadAt);
            Assert.All(db.Calls.Skip(1), call => Assert.Equal(from, call.Args["@from"]));
            Assert.All(db.Calls.Skip(1), call => Assert.Equal(to, call.Args["@to"]));
        }
    }

    [Fact(DisplayName = "AC-1403.6 오늘 접수 줄 → VisitRow: 내원번호·차트번호·접수 시각 원값·상태·OcmRsuYon, 오늘 처방, 앞선 완료 내원 수·가장 최근 내원·그 증상")]
    public void MapsRows()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "V1001", "V1002", "V1003" }, input.Visits.Select(row => row.VisitId));

        var first = input.Visits[0];
        Assert.Equal("900101", first.PatientId);
        Assert.Equal("20261105091230", first.AcceptedAt);
        Assert.Equal("S1", first.Status);
        Assert.Equal("N", first.Rsu);
        Assert.Equal(Rx(("DS20", "도수치료 20분"), ("ESWT7", "체외충격파")), Pairs(first.TodayRx));
        Assert.Equal(3L, first.EarlierCount);
        Assert.Equal("V0901", first.LastVisitId);
        Assert.Equal("20261029", first.LastDay);
        Assert.Equal("허리 통증 조금 줄었음 밤에 아픔", first.LastSymptom);

        var second = input.Visits[1];
        Assert.Empty(second.TodayRx);
        Assert.Equal(1L, second.EarlierCount);
        Assert.Equal("V0802", second.LastVisitId);
        Assert.Equal("20261001", second.LastDay);
        Assert.Null(second.LastSymptom);

        var third = input.Visits[2];
        Assert.Equal("20261105101500 ", third.AcceptedAt);
        Assert.Equal(0L, third.EarlierCount);
        Assert.Null(third.LastVisitId);
        Assert.Null(third.LastDay);
        Assert.Null(third.LastSymptom);
    }

    [Fact(DisplayName = "AC-1403.6 차트번호는 비트 칸(char 14) 그대로 오른쪽 공백만 뺀다: 앞이 공백으로 채워진 번호도 앞 공백을 지우지 않는다(상세 @chart가 같은 줄을 찾게)")]
    public void ChartKeepsLeadingSpaces()
    {
        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.TodayVisits, _ => new[]
        {
            BoardFake.Visit("V1001", "        900101", "202611050912", "PN"),
            BoardFake.Visit("V1002", "900102        ", "202611050930", "PN"),
            BoardFake.Visit("V1003", "              ", "202611051015", "WN"),
        });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "        900101", "900102", "" }, input.Visits.Select(row => row.PatientId));
    }

    [Fact(DisplayName = "AC-1402.7 칸이 채워지기 전(ColumnPlan 없음)에는 칸 문장을 돌리지 않고 이름·생년월일·성별·메모·수납 시각만 빈 값(null), 줄은 그대로다")]
    public void PersonColumnsEmptyBeforeFill()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now, null, null);

        // 기본 문장 다섯: 이름표·오늘 접수·오늘 처방·오늘 처방 시각(reception-arrange AC-3303.3)·지난 내원
        Assert.Equal(OrderWithoutSymptoms().Take(5), db.Sqls);
        Assert.Equal(new[] { "V1001", "V1002", "V1003" }, input.Visits.Select(row => row.VisitId));
        Assert.All(input.Visits, row =>
        {
            Assert.Null(row.Name);
            Assert.Null(row.BirthDate);
            Assert.Null(row.Sex);
            Assert.Null(row.Memo);
            Assert.Null(row.PaidAt);
            Assert.Null(row.LastSymptom);
        });
    }

    [Fact(DisplayName = "AC-1402.7 찾지 못한 칸(ColumnPlan의 null)은 그 문장을 돌리지 않고 그 값만 비운다")]
    public void MissingColumnsStayEmpty()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var plan = ReceptionMap.Columns!;
        var partial = new ColumnPlan(plan.Name, plan.BirthDate, null, null, null, null);

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now, null, partial);

        Assert.Equal(OrderWithoutSymptoms().Take(6), db.Sqls);
        var first = input.Visits[0];
        Assert.Equal("가상환자01", first.Name);
        Assert.Equal("19720304", first.BirthDate);
        Assert.Null(first.Sex);
        Assert.Null(first.Memo);
        Assert.Null(input.Visits[1].PaidAt);
    }

    [Fact(DisplayName = "AC-1410.3 채운 칸(ReceptionMap.Columns)으로 이름·생년월일·성별·접수 메모·수납 시각을 읽어 줄에 붙인다(빈 글·줄 없는 내원은 null)")]
    public void ReadsFilledColumns()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(Order, db.Sqls);
        var (first, second, third) = (input.Visits[0], input.Visits[1], input.Visits[2]);
        Assert.Equal(("가상환자01", "19720304", "F", "허리 통증 재진", (string?)null), (first.Name, first.BirthDate, first.Sex, first.Memo, first.PaidAt));
        Assert.Equal(("가상환자02", "19900101", "M", (string?)null, "202611050945"), (second.Name, second.BirthDate, second.Sex, second.Memo, second.PaidAt));
        Assert.Equal(((string?)null, (string?)null, (string?)null, (string?)null, (string?)null), (third.Name, third.BirthDate, third.Sex, third.Memo, third.PaidAt));
    }

    // ---- AC-1402.6 목록 줄의 지난번 증상 (TASK-37) --------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.6 지난 증상(PriorSymptoms)은 가장 최근 지난 내원마다 줄 앞뒤 공백을 빼 비트 차례대로 공백 하나로 잇고, 빈 줄·빈 내원번호·모르는 내원 줄은 버린다")]
    public void LastSymptomJoined()
    {
        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.PriorSymptoms, _ => new[]
        {
            new object?[] { "V0802", "  어깨 결림  " },
            new object?[] { "V0901", "첫 줄" },
            new object?[] { "V0802", "   " },
            new object?[] { "", "빈 번호 줄" },
            new object?[] { "V7777", "모르는 내원 줄" },
            new object?[] { "V0802", "\r\n손 저림\t" },
            new object?[] { "V0901", null },
        });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal("첫 줄", input.Visits[0].LastSymptom);
        Assert.Equal("어깨 결림 손 저림", input.Visits[1].LastSymptom);
        Assert.Null(input.Visits[2].LastSymptom);
    }

    [Fact(DisplayName = "AC-1402.6 증상 칸(ColumnPlan.Symptom)이 없으면 PriorSymptoms를 돌리지 않고 지난 증상은 null이며, 칸이 모자란 증상 줄은 E-BIT-READ-FAILED")]
    public void LastSymptomNeedsColumn()
    {
        var plan = ReceptionMap.Columns!;
        var noSymptom = new ColumnPlan(plan.Name, plan.BirthDate, plan.Sex, plan.Memo, plan.PaidAt, null);
        var db = BoardFake.Quiet(new FakeDb());

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now, null, noSymptom);

        Assert.Equal(OrderWithoutSymptoms(), db.Sqls);
        Assert.All(input.Visits, row => Assert.Null(row.LastSymptom));

        var shortRow = BoardFake.Quiet(new FakeDb());
        shortRow.Answer(ReceptionSql.PriorSymptoms, _ => new[] { new object?[] { "V0901" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(shortRow, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);
    }

    [Fact(DisplayName = "AC-1402.6 읽은 지난 증상으로 목록 줄은 지난번·그 증상 글, 지난 내원에 증상이 없으면 적힌 증상이 없어요, 오늘 처방이 있으면 오늘 처방이다")]
    public void BoardShowsLastSymptom()
    {
        var board = BuildBoard();

        var first = Row(board, "900101");
        Assert.Equal(("오늘", "도수치료 20분(DS20) · 체외충격파(ESWT7)"), (first.RxLabel, first.Rx));
        var second = Row(board, "900102");
        Assert.Equal(("지난번", "적힌 증상이 없어요"), (second.RxLabel, second.Rx));

        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.PriorSymptoms, _ => new[] { new object?[] { "V0802", "오른쪽 어깨 통증 조금 줄었음" } });
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);
        var map = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["S1"] = Lane.Wait, ["S2"] = Lane.Done };
        var withSymptom = BoardBuilder.Build(input, map, new string[0], new Dictionary<string, string>(StringComparer.Ordinal), new VisitKeys(), Morning);
        Assert.Equal(("지난번", "오른쪽 어깨 통증 조금 줄었음"), (Row(withSymptom, "900102").RxLabel, Row(withSymptom, "900102").Rx));
    }

    [Fact(DisplayName = "AC-1402.5 읽은 생년월일(yyyyMMdd)·성별(F/M)·지난 완료 내원 수로 정보 글이 '54세 · 여 · 재진' 모양이고, 모르는 값은 빼며 지난 내원이 없으면 신환이다")]
    public void InfoFromReadColumns()
    {
        var board = BuildBoard();

        Assert.Equal("54세 · 여 · 재진", Row(board, "900101").Info);
        Assert.Equal("36세 · 남 · 재진", Row(board, "900102").Info);
        Assert.Equal("신환", Row(board, "900103").Info);
    }

    [Fact(DisplayName = "AC-1410.5 [의원 PC] 휴대폰 줄의 이름·접수 메모·수납 시각 글은 비트에서 읽은 값 그대로다(실제 대조는 의원 PC)")]
    public void BoardShowsReadValues()
    {
        var board = BuildBoard();

        var first = Row(board, "900101");
        Assert.Equal("가상환자01", first.Name);
        Assert.Equal("허리 통증 재진", first.Memo);
        var second = Row(board, "900102");
        Assert.Equal("가상환자02", second.Name);
        Assert.Equal("", second.Memo);
        Assert.Equal("09:45 수납", second.Waited);
        Assert.Equal("", Row(board, "900103").Name);
    }

    private static Board BuildBoard()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);
        var map = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["S1"] = Lane.Wait, ["S2"] = Lane.Done };
        return BoardBuilder.Build(input, map, new string[0], new Dictionary<string, string>(StringComparer.Ordinal), new VisitKeys(), Morning);
    }

    private static BoardRow Row(Board board, string chart) =>
        board.Wait.Concat(board.Done).Single(row => row.Chart == chart);

    [Fact(DisplayName = "AC-1403.6 내원번호가 빈 줄은 빼고, 같은 내원은 한 줄, 모르는 내원의 처방·지난 내원 줄은 붙이지 않는다")]
    public void SkipsOddRows()
    {
        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.TodayVisits, _ => new[]
        {
            BoardFake.Visit("V1001", "900101", "20261105091230", "S1"),
            BoardFake.Visit("", "900109", "20261105091500", "S1"),
            BoardFake.Visit(null, "900108", "20261105091600", "S1"),
            BoardFake.Visit("V1001", "900101", "20261105091230", "S1"),
        });
        db.Answer(ReceptionSql.TodayRx, _ => new[] { new object?[] { "V1001", "ESWT7" }, new object?[] { "V7777", "DS20" } });
        db.Answer(ReceptionSql.PriorVisits, _ => new[] { new object?[] { "V7777", 4L, "V0700", "20261020" } });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        var only = Assert.Single(input.Visits);
        Assert.Equal("V1001", only.VisitId);
        Assert.Equal(Rx(("ESWT7", "체외충격파")), Pairs(only.TodayRx));
        Assert.Equal(0L, only.EarlierCount);
    }

    // ---- AC-1403.7 하루 이름표 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.7 이름표(SeeMst, 코드마다 가장 늦은 적용일 이름)로 이름을 붙이고 코드 순, 이름표에 없는 코드는 코드만(이름 null)")]
    public void NamesFromTable()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(Rx(("XR2", "엑스레이 촬영"), ("ZZ9", null)), Pairs(input.Visits[2].TodayRx));
        Assert.Equal("체외충격파", input.RxNames["ESWT7"]);
        Assert.Equal(5, input.RxNames.Count);
    }

    [Fact(DisplayName = "AC-1403.7 그날 이름표를 주면 이름표를 다시 읽지 않고 준 이름을 쓴다")]
    public void GivenNamesNotReread()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var names = new Dictionary<string, string>(StringComparer.Ordinal) { ["ESWT7"] = "충격파 7" };

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now, names);

        Assert.Equal(Order.Skip(1), db.Sqls);
        Assert.Equal(Rx(("DS20", null), ("ESWT7", "충격파 7")), Pairs(input.Visits[0].TodayRx));
        Assert.Same(names, input.RxNames);
    }

    [Fact(DisplayName = "AC-1403.7 이름표의 빈 코드·빈 이름 줄은 버리고 앞뒤 공백은 뺀다")]
    public void NameTableTidy()
    {
        var db = BoardFake.Quiet(new FakeDb());
        db.Answer(ReceptionSql.RxNames, _ => new[]
        {
            new object?[] { " ESWT7 ", " 체외충격파 ", "20240101" },
            new object?[] { "DS20", "  ", "20240101" },
            new object?[] { null, "이름만", "20240101" },
        });

        var input = BoardReader.Read(db, Synthetic.Scope, Morning, new CacheClock(Morning).Now);

        Assert.Equal(new[] { "ESWT7" }, input.RxNames.Keys);
        Assert.Equal("체외충격파", input.RxNames["ESWT7"]);
        Assert.Equal(Rx(("DS20", null), ("ESWT7", "체외충격파")), Pairs(input.Visits[0].TodayRx));
    }

    // ---- AC-1403.4 읽기 한 번 8초 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.4 시계가 멈춰 있으면 문장마다 시간 제한 8초, 시계가 가면 남은 시간만 준다")]
    public void StatementTimeouts()
    {
        var clock = new CacheClock(Morning);
        var db = BoardFake.Quiet(new FakeDb());
        BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now);
        Assert.All(db.Calls, call => Assert.Equal(TimeSpan.FromSeconds(8), call.Timeout));

        var slow = BoardFake.Quiet(new FakeDb());
        BoardFake.Slow(slow, ReceptionSql.TodayVisits, clock, TimeSpan.FromSeconds(3));
        BoardReader.Read(slow, Synthetic.Scope, clock.Now(), clock.Now);
        Assert.Equal(TimeSpan.FromSeconds(8), slow.Calls[1].Timeout);
        Assert.All(slow.Calls.Skip(2), call => Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout));
    }

    [Fact(DisplayName = "AC-1403.4 8초를 다 쓰면 다음 문장을 돌리지 않고 E-BIT-READ-FAILED(시간 지남)")]
    public void BudgetSpent()
    {
        var clock = new CacheClock(Morning);
        var db = BoardFake.Quiet(new FakeDb());
        BoardFake.Slow(db, ReceptionSql.TodayRx, clock, TimeSpan.FromSeconds(8));

        var error = Assert.Throws<BitException>(() => BoardReader.Read(db, Synthetic.Scope, Morning, clock.Now));

        Assert.Equal(BitErrors.ReadFailed, error.Code);
        Assert.Equal(Order.Take(3), db.Sqls);
    }

    // ---- AC-1403.5 읽기 실패 --------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.5 문장이 실패하면 그 번호 그대로, 칸이 모자란 줄·숫자 아닌 내원 수는 E-BIT-READ-FAILED(일부만 주지 않음)")]
    public void ReadFailures()
    {
        var failing = BoardFake.Quiet(new FakeDb()).Fail(ReceptionSql.PriorSymptoms, BitErrors.ReadFailed);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(failing, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);

        var shortRow = BoardFake.Quiet(new FakeDb());
        shortRow.Answer(ReceptionSql.TodayVisits, _ => new[] { new object?[] { "V1001", "900101", "20261105091230", "S1" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(shortRow, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);

        var badCount = BoardFake.Quiet(new FakeDb());
        badCount.Answer(ReceptionSql.PriorVisits, _ => new[] { new object?[] { "V1001", "많음", "V0901", "20261029" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(badCount, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);

        var negative = BoardFake.Quiet(new FakeDb());
        negative.Answer(ReceptionSql.PriorVisits, _ => new[] { new object?[] { "V1001", -1L, "V0901", "20261029" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => BoardReader.Read(negative, Synthetic.Scope, Morning, new CacheClock(Morning).Now)).Code);
    }

    [Fact(DisplayName = "AC-1403.5 모든 문장은 ReadOnlyGuard를 지난다: 범위 글자가 정해 둔 길이(32)를 넘으면 DB에 닿기 전에 E-BIT-READ-FAILED")]
    public void GuardFirst()
    {
        var db = BoardFake.Quiet(new FakeDb());
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        var error = Assert.Throws<BitException>(() => BoardReader.Read(db, new string('S', 33), Morning, new CacheClock(Morning).Now, names));
        Assert.Equal(BitErrors.ReadFailed, error.Code);
        Assert.Empty(db.Calls);
    }
}

/// <summary>접수 현황 읽기 시험이 같이 쓰는 가짜 비트 자료. 모두 지어낸 것이다.</summary>
internal static class BoardFake
{
    public static readonly DateTime Morning = new DateTime(2026, 11, 5, 10, 0, 0);

    public static object?[] Visit(string? id, string chart, string acceptedAt, string status, string rsu = "N") =>
        new object?[] { id, chart, acceptedAt, status, rsu };

    /// <summary>오늘 접수 셋: V1001(오늘 처방 둘, 지난 내원 3번·그 증상 두 줄, 메모), V1002(오늘 처방 없음, 지난 내원 1번·증상 없음, 수납 09:45), V1003(첫 방문, 이름 없는 코드, 사람 줄 없음).</summary>
    public static T Quiet<T>(T db) where T : FakeDb
    {
        db.Answer(ReceptionSql.RxNames, _ => new[]
        {
            new object?[] { "ESWT7", "체외충격파", "20240101" },
            new object?[] { "DS20", "도수치료 20분", "20240101" },
            new object?[] { "PT01", "표층열치료", "20230301" },
            new object?[] { "PT03", "간섭파치료", "20230301" },
            new object?[] { "XR2", "엑스레이 촬영", "20250101" },
        });
        db.Answer(ReceptionSql.TodayVisits, _ => TodayRows);
        db.Answer(ReceptionSql.TodayRx, _ => new[]
        {
            new object?[] { "V1001", "ESWT7" },
            new object?[] { "V1001", "DS20" },
            new object?[] { "V1003", "ZZ9" },
            new object?[] { "V1003", "XR2" },
        });
        // 오늘 처방 시각(spec reception-arrange AC-3303.3). 시각을 보는 시험은 BoardOrders.test.cs가 따로 답을 준다
        db.Answer(ReceptionSql.TodayOrderTimes, _ => new object?[0][]);
        db.Answer(ReceptionSql.PriorVisits, _ => new[]
        {
            new object?[] { "V1001", 3L, "V0901", "20261029" },
            new object?[] { "V1002", 1L, "V0802", "20261001" },
        });
        // 가장 최근 지난 내원의 증상 줄(EmrInf S, 비트 차례). V0802(V1002의 지난 내원)는 줄이 없다
        db.Answer(ReceptionSql.PriorSymptoms, _ => new[]
        {
            new object?[] { "V0901", " 허리 통증 조금 줄었음 " },
            new object?[] { "V0901", "밤에 아픔" },
        });
        // 확인 결과로 채운 칸(이름·생년월일·성별, 접수 메모, 수납 시각). V1003은 PbsInf 줄이 없다
        db.Answer(ReceptionSql.TodayPeople, _ => new[]
        {
            new object?[] { "V1001", "가상환자01", "19720304", "F" },
            new object?[] { "V1002", "가상환자02", "19900101", "M" },
            new object?[] { "V7777", "가상환자77", "19800101", "F" },
        });
        db.Answer(ReceptionSql.TodayMemos, _ => new[]
        {
            new object?[] { "V1001", "허리 통증 재진" },
            new object?[] { "V1002", "   " },
            new object?[] { "V1003", null },
        });
        db.Answer(ReceptionSql.TodayPaid, _ => new[] { new object?[] { "V1002", "202611050945" } });
        return db;
    }

    public static readonly object?[][] TodayRows =
    {
        Visit("V1001", "900101", "20261105091230", "S1"),
        Visit("V1002", "900102", "20261105093005", "S2"),
        Visit("V1003", "900103", "20261105101500 ", "S1"),
    };

    /// <summary>이 문장이 돌 때 시계를 took만큼 보낸다(오래 걸린 읽기 흉내). 답은 그대로.</summary>
    public static void Slow(FakeDb db, string sql, CacheClock clock, TimeSpan took)
    {
        var fresh = Quiet(new FakeDb());
        db.Answer(sql, args =>
        {
            clock.Advance(took);
            return fresh.Query(sql, args, TimeSpan.FromSeconds(8)).Select(row => row.ToArray()).ToArray();
        });
    }
}

/// <summary>여러 작업이 함께 읽고 보내도 되는 가짜 시계.</summary>
internal sealed class CacheClock
{
    private long ticks;

    public CacheClock(DateTime start)
    {
        ticks = start.Ticks;
    }

    public DateTime Now() => new DateTime(Interlocked.Read(ref ticks));

    public void Advance(TimeSpan by) => Interlocked.Add(ref ticks, by.Ticks);

    public void Set(DateTime at) => Interlocked.Exchange(ref ticks, at.Ticks);
}
