using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Stats;

/// <summary>
/// 비트 전용 세 칸(stats-bit-sections)의 가짜 자료. 차트번호는 StatsFake.Chart, 보험·주소·원장님 이름은 모두 지어낸 값이다.
/// 접수 줄은 여섯째 칸, 사람 줄은 넷째 칸에 가짜 이름·전화를 일부러 넣는다(싣지 않아야 한다).
/// 금액은 달마다 그 달 첫 수납일에 정상수납 D001 50,000원, 미수입금 D002 1,000원이다.
/// </summary>
internal static class StatsExtraFake
{
    public const string HouseNumber = "12-3";

    public static IEnumerable<object?[]> None() => new object?[0][];

    public static void Answer(FakeDb db)
    {
        db.Answer(StatsSql.VisitLinesSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D001", Fake.Name },
            new object?[] { StatsFake.Chart(2) + " ", "20260902", "1430", " 가짜보험 나 ", "D002 ", Fake.Phone },
            new object?[] { null, "20260903", "0830", null, null, null },
        });
        db.Answer(StatsSql.PeopleSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "19800101", "가짜도 가짜시 가짜구 가짜동 " + HouseNumber + " 가짜빌라", Fake.Name },
            new object?[] { StatsFake.Chart(2) + " ", null, null, Fake.Phone },
        });
        db.Answer(StatsSql.DoctorMoneyNormalSql, args => new[] { new object?[] { (string?)args["@day"], "D001 ", 50000m } });
        db.Answer(StatsSql.DoctorMoneyReceivableSql, args => new[] { new object?[] { (string?)args["@day"], "D002", 1000m } });
        db.Answer(StatsSql.DoctorNamesSql, _ => new[]
        {
            new object?[] { "D001", "가짜원장 옛이름", "20201231" },
            new object?[] { "D001", " 가짜원장 가 ", "99991231" },
            new object?[] { "D002", "가짜원장 나", "99991231" },
        });
        db.Answer(StatsPayFake.NormalSql, args => new[] { new object?[] { StatsFake.Chart(1) + " ", (string?)args["@day"], 30000m } });
        db.Answer(StatsPayFake.ReceivableSql, args => new[] { new object?[] { StatsFake.Chart(2), (string?)args["@day"], 2000m } });
    }

    /// <summary>접수 줄 n개(모두 같은 가짜 값). 큰 자료 시험용.</summary>
    public static IEnumerable<object?[]> ManyLines(int n)
    {
        var row = new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D001" };
        for (var i = 0; i < n; i++) yield return row;
    }

    /// <summary>
    /// 환자·날 금액 줄 n개(차트번호가 모두 다른 지어낸 7자리 번호, 그 달 첫 수납일, 1,000원). 큰 자료 시험용(spec stats-insights AC-6106.6).
    /// 기본 가짜 차트번호(StatsFake.Chart, 6자리)와 겹치지 않는다.
    /// </summary>
    public static IEnumerable<object?[]> ManyPays(int n, string? day)
    {
        for (var i = 0; i < n; i++) yield return new object?[] { (1_000_000 + i).ToString(System.Globalization.CultureInfo.InvariantCulture), day, 1000m };
    }
}

/// <summary>
/// 환자·날 금액 SQL 둘(spec stats-insights AC-6106.1)의 글. 보고 금액 SQL(정상수납·미수입금)에서 원장님별 금액(ByDoctorDay)과 같은 두 곳만 바꾼다:
/// NativeRows 줄 머리에 수납일(OrpAccDte 앞 8자) 칸을 더하고, 끝 SELECT를 차트번호·수납일로 묶은 OrpTotAmt 합으로. 원본 사본과의 대조는 StatsSql.test.cs가 한다.
/// 기본 가짜 금액(StatsExtraFake.Answer)은 달마다 그 달 첫 수납일에 정상수납 차트 1 30,000원, 미수입금 차트 2 2,000원이다.
/// </summary>
internal static class StatsPayFake
{
    public const string RowStart = "SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt";
    public const string RowStartByPatientDay = "SELECT p.OrpOcmNum,p.OrpChtNum,LEFT(p.OrpAccDte,8) PaidDay,p.OrpTotAmt";
    public const string Tail = "SELECT OrpChtNum,PaidDay,SUM(OrpTotAmt) FROM NativeRows GROUP BY OrpChtNum,PaidDay";

    public static readonly string NormalSql = ByPatientDay(StatsSql.FinanceNormalSql);

    public static readonly string ReceivableSql = ByPatientDay(StatsSql.FinanceReceivableSql);

    private static string ByPatientDay(string sql)
    {
        var text = sql.Replace(RowStart, RowStartByPatientDay);
        return text.Substring(0, text.LastIndexOf("SELECT SUM(", StringComparison.Ordinal)) + Tail;
    }
}

/// <summary>
/// REQ-2701 도우미가 비트 전용 세 칸 자료(접수 줄·사람 줄·원장님 이름·날·원장님 금액)를 읽는다(TASK-1).
/// SQL 글 자체는 StatsSql.test.cs가 못 박고, 여기서는 가짜 DB로 줄 모양·값 고르기·읽는 차례를 본다.
/// </summary>
public class StatsExtraReadTests
{
    private const string From = "2026-09-01";
    private const string To = "2026-09-30";

    private static FakeDb Db()
    {
        var db = new FakeDb();
        StatsExtraFake.Answer(db);
        return db;
    }

    private static StatsExtraResult Read(FakeDb db, string from = From, string to = To) => StatsExtra.Read(db, Synthetic.Scope, from, to);

    private static string Cell(string? text) => text ?? "null";

    private static string[][] Visits(StatsExtraResult result) =>
        result.Visits.Select(v => new[] { Cell(v.Chart), Cell(v.Day), Cell(v.Time), Cell(v.Insurance), Cell(v.Doctor) }).ToArray();

    private static string[][] People(StatsExtraResult result) =>
        result.People.Select(p => new[] { p.Chart, Cell(p.Birth), Cell(p.Area) }).ToArray();

    private static string[][] Doctors(StatsExtraResult result) =>
        result.Doctors.Select(d => new[] { d.Code, Cell(d.Name) }).ToArray();

    private static string[][] Money(StatsExtraResult result) =>
        result.DoctorDays.Select(d => new[] { d.Day, d.Doctor, d.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture) }).ToArray();

    /// <summary>그 SQL을 받은 부름들의 매개변수 값(이름 순서대로 글자로).</summary>
    private static string[] Windows(FakeDb db, string sql, params string[] names) =>
        db.Calls.Where(call => call.Sql == sql).Select(call => string.Join(" ", names.Select(name => (string?)call.Args[name]))).ToArray();

    private static void OneVisit(FakeDb db, params object?[] row) => db.Answer(StatsSql.VisitLinesSql, _ => new[] { row });

    // ---- AC-2701.1 접수 줄 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-2701.1 접수 줄은 접수마다 [차트번호|null, 진료일, 접수 시각 HHmm|null, 보험 이름|null, 진료의 코드|null]이고 글자는 앞뒤 공백만 뺀다(DB가 더 준 칸은 싣지 않음)")]
    public void VisitLineShape()
    {
        var result = Read(Db());

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D001" },
            new[] { StatsFake.Chart(2), "20260902", "1430", "가짜보험 나", "D002" },
            new[] { "null", "20260903", "0830", "null", "null" },
        }, Visits(result));
        Assert.Null(result.Visits[2].Chart);
        Assert.DoesNotContain(result.Visits, v => v.Chart == Fake.Name || v.Doctor == Fake.Phone);
    }

    [Theory(DisplayName = "AC-2701.1 접수 시각은 OcmAcpDtm 9~12번째 글자이고 네 자리 숫자(0000~2359)가 아니면 null이다")]
    [InlineData("0000", "0000")]
    [InlineData("0905", "0905")]
    [InlineData("2359", "2359")]
    [InlineData("2400", null)]
    [InlineData("9999", null)]
    [InlineData("093", null)]
    [InlineData("09:5", null)]
    [InlineData("-123", null)]
    [InlineData("０９０５", null)]
    [InlineData(" 905", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void ReceiptTime(string? cell, string? expected)
    {
        var db = Db();
        OneVisit(db, StatsFake.Chart(1), "20260901", cell, "가짜보험 가", "D001");
        Assert.Equal(expected, Assert.Single(Read(db).Visits).Time);
    }

    [Fact(DisplayName = "AC-2701.1 차트번호·진료의 코드가 비었거나 공백뿐이면 null이고, 보험 이름이 비었거나 없어도 null이다")]
    public void BlankCellsAreNull()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => new[]
        {
            new object?[] { "   ", "20260901", "0905", "  ", "   " },
            new object?[] { "", "20260902", "1000", "", "" },
        });
        var result = Read(db);

        Assert.Equal(new[]
        {
            new[] { "null", "20260901", "0905", "null", "null" },
            new[] { "null", "20260902", "1000", "null", "null" },
        }, Visits(result));
        // 차트번호 없는 접수는 사람 줄에 아무것도 더하지 않는다
        Assert.DoesNotContain(result.People, p => p.Chart.Trim() == "");
    }

    [Fact(DisplayName = "AC-2701.1 접수 줄은 지금 통계와 같은 기간·병원 매개변수(@from·@to Char(12), 끝은 다음 날 0시)로 한 번 읽는다")]
    public void VisitLineParameters()
    {
        var db = Db();
        Read(db, "2026-09-01", "2026-12-31");

        var call = Assert.Single(db.Calls, c => c.Sql == StatsSql.VisitLinesSql);
        Assert.Equal(new Dictionary<string, object?>
        {
            ["@from"] = "202609010000", ["@to"] = "202701010000", ["@hospital"] = Synthetic.Scope,
        }.OrderBy(p => p.Key), call.Args.OrderBy(p => p.Key));
        var people = Assert.Single(db.Calls, c => c.Sql == StatsSql.PeopleSql);
        Assert.Equal(call.Args.OrderBy(p => p.Key), people.Args.OrderBy(p => p.Key));
    }

    [Fact(DisplayName = "AC-2701.1 접수 줄이 700,000줄이면 다 싣는다(한도 안)")]
    public void VisitLinesUpToTheLimit()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => StatsExtraFake.ManyLines(StatsRows.MaxRows));
        Assert.Equal(700_000, Read(db).Visits.Count);
    }

    [Fact(DisplayName = "AC-2701.1 접수 줄이 700,001줄이면 E-STATS-TOO-BIG이고 뒤 SQL을 돌리지 않는다")]
    public void TooManyVisitLines()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => StatsExtraFake.ManyLines(StatsRows.MaxRows + 1));
        var error = Assert.Throws<BitException>(() => Read(db));
        Assert.Equal("E-STATS-TOO-BIG", error.Code);
        Assert.Equal("E-STATS-TOO-BIG", error.Message);
        Assert.Equal(new[] { StatsSql.VisitLinesSql }, db.Sqls);
    }

    [Theory(DisplayName = "AC-2701.1 기간 날짜가 틀리면 E-HELPER-BAD-MESSAGE이고 SQL을 돌리지 않는다")]
    [InlineData("2026-13-01", "2026-13-02")]
    [InlineData("2026-09-01", "9999-12-31")]
    public void BadDates(string from, string to)
    {
        var db = Db();
        var error = Assert.Throws<HelperException>(() => Read(db, from, to));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(db.Calls);
    }

    // ---- AC-2701.2 보험 이름 ----------------------------------------------------------------------

    [Theory(DisplayName = "AC-2701.2 보험 이름은 SQL이 고른 InsCodNam의 앞뒤 빈칸을 뺀 글이고, 비었거나 없으면 null이다")]
    [InlineData("가짜보험 가", "가짜보험 가")]
    [InlineData("  가짜보험 차상위 1종  ", "가짜보험 차상위 1종")]
    [InlineData("   ", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void InsuranceName(string? cell, string? expected)
    {
        var db = Db();
        OneVisit(db, StatsFake.Chart(1), "20260901", "0905", cell, "D001");
        Assert.Equal(expected, Assert.Single(Read(db).Visits).Insurance);
    }

    [Theory(DisplayName = "AC-2701.2 보험 이름이 100자를 넘으면 100자까지 자르고(웹 검사 한도와 같다), 100자까지는 그대로다")]
    [InlineData(100, 100)]
    [InlineData(101, 100)]
    [InlineData(150, 100)]
    public void LongInsuranceName(int length, int expectedLength)
    {
        var name = new string('보', length);
        var db = Db();
        OneVisit(db, StatsFake.Chart(1), "20260901", "0905", name, "D001");
        Assert.Equal(name.Substring(0, expectedLength), Assert.Single(Read(db).Visits).Insurance);
    }

    // ---- AC-2701.3 사람 줄 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-2701.3 사람 줄은 환자마다 [차트번호, 생년월일|null, 주소 앞부분|null]이고 번지·DB가 더 준 칸(이름·전화)은 싣지 않는다")]
    public void PersonShape()
    {
        var result = Read(Db());

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "19800101", "가짜도 가짜시 가짜구 가짜동" },
            new[] { StatsFake.Chart(2), "null", "null" },
        }, People(result));
        Assert.DoesNotContain(result.People, p => (p.Area ?? "").Contains(StatsExtraFake.HouseNumber));
        Assert.DoesNotContain(result.People, p => p.Chart == Fake.Name || p.Area == Fake.Name || p.Area == Fake.Phone);
    }

    [Theory(DisplayName = "AC-2701.3 생년월일은 PbsBirDte가 있는 날짜 8자리일 때만이고 아니면 null이다")]
    [InlineData("19800101", "19800101")]
    [InlineData("20240229", "20240229")]
    [InlineData(" 19800101 ", "19800101")]
    [InlineData("20230229", null)]
    [InlineData("19801301", null)]
    [InlineData("1980010", null)]
    [InlineData("198001011", null)]
    [InlineData("1980-01-01", null)]
    [InlineData("00000000", null)]
    [InlineData("00990101", null)] // 웹(dates.ts isYmd)은 0~99년을 날짜로 보지 않는다
    [InlineData("１９８００１０１", null)]
    [InlineData("        ", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void BirthDate(string? cell, string? expected)
    {
        var db = Db();
        db.Answer(StatsSql.PeopleSql, _ => new[] { new object?[] { StatsFake.Chart(1), cell, null }, new object?[] { StatsFake.Chart(2), null, null } });
        Assert.Equal(expected, Read(db).People[0].Birth);
    }

    private static readonly string Long90 = new string('가', 90);
    private static readonly string Word39A = new string('나', 39);
    private static readonly string Word39B = new string('다', 39);

    public static IEnumerable<object?[]> Addresses() => new[]
    {
        new object?[] { "가짜도 가짜시 가짜구 가짜동 12-3 가짜빌라 101호", "가짜도 가짜시 가짜구 가짜동" },
        new object?[] { "가짜도 가짜시 가짜구 가짜동 가짜마을 가짜아파트 101동", "가짜도 가짜시 가짜구 가짜동 가짜마을" },
        new object?[] { "가짜시 가짜구 가짜로 45", "가짜시 가짜구 가짜로" },
        new object?[] { "  가짜시\t가짜구   가짜로  ", "가짜시 가짜구 가짜로" },
        new object?[] { "가짜시　가짜구 가짜동", "가짜시 가짜구 가짜동" },
        new object?[] { "가짜시 가짜구 가짜로 ４５", "가짜시 가짜구 가짜로" },
        new object?[] { "가짜시 가짜구 (가짜동)", "가짜시 가짜구 (가짜동)" },
        new object?[] { "12 가짜로", null },
        new object?[] { Long90, new string('가', 80) },
        new object?[] { Word39A + " " + Word39B + " 라", Word39A + " " + Word39B }, // 80자에서 자른 끝 빈칸은 뺀다
        new object?[] { "   ", null },
        new object?[] { "", null },
        new object?[] { null, null },
    };

    [Theory(DisplayName = "AC-2701.3 주소 앞부분은 빈칸으로 나눈 앞 낱말 다섯 개까지, 숫자로 시작하는 낱말 앞에서 멈추고, 80자를 넘으면 자르며, 남는 것이 없으면 null이다")]
    [MemberData(nameof(Addresses))]
    public void AddressHead(string? address, string? expected)
    {
        var head = StatsExtra.AddressHead(address);
        Assert.Equal(expected, head);
        Assert.True(head == null || head.Length <= 80);
    }

    [Fact(DisplayName = "AC-2701.3 사람 줄의 주소 칸은 AddressHead로 줄인 값이다")]
    public void PersonAreaUsesAddressHead()
    {
        var db = Db();
        db.Answer(StatsSql.PeopleSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "19800101", "  가짜시   가짜구 가짜로 45 가짜동 101호 " },
            new object?[] { StatsFake.Chart(2), "19900101", "45 가짜로" },
        });
        Assert.Equal(new[] { "가짜시 가짜구 가짜로", "null" }, Read(db).People.Select(p => Cell(p.Area)).ToArray());
    }

    [Fact(DisplayName = "AC-2701.3 같은 차트번호(앞뒤 공백 무시) 사람 줄은 첫 줄만, 공백뿐인 차트번호 줄은 빼고, 접수 줄에만 있는 환자는 [차트번호, null, null]로 더한다")]
    public void PeopleAreOnePerChart()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D001" },
            new object?[] { StatsFake.Chart(3), "20260902", "0905", "가짜보험 가", "D001" }, // 사람 줄을 읽기 전에 접수가 바뀐 환자
            new object?[] { StatsFake.Chart(3), "20260903", "0905", "가짜보험 가", "D001" },
        });
        db.Answer(StatsSql.PeopleSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "19800101", "가짜시 가짜구" },
            new object?[] { StatsFake.Chart(1) + " ", "19700101", "가짜시 다른구" },
            new object?[] { "  ", "19600101", "가짜시 빈구" },
            new object?[] { StatsFake.Chart(2), null, "가짜시 가짜구" }, // 접수 줄에 없는 환자도 그대로 둔다
        });

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "19800101", "가짜시 가짜구" },
            new[] { StatsFake.Chart(2), "null", "가짜시 가짜구" },
            new[] { StatsFake.Chart(3), "null", "null" },
        }, People(Read(db)));
    }

    [Fact(DisplayName = "AC-2701.3 사람 줄이 700,001줄이면 E-STATS-TOO-BIG이다")]
    public void TooManyPeople()
    {
        var db = Db();
        var row = new object?[] { StatsFake.Chart(1), "19800101", "가짜시" };
        db.Answer(StatsSql.PeopleSql, _ => Enumerable.Repeat(row, StatsRows.MaxRows + 1));
        Assert.Equal("E-STATS-TOO-BIG", Assert.Throws<BitException>(() => Read(db)).Code);
        Assert.Equal(new[] { StatsSql.VisitLinesSql, StatsSql.PeopleSql }, db.Sqls);
    }

    // ---- AC-2701.4 원장님 이름 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-2701.4 원장님 줄은 접수 줄·날·원장님 금액에 나온 진료의 코드마다 [코드, 이름|null](코드 차례)이고 이름은 UidExpDte가 가장 늦은 줄의 UidNam(앞뒤 빈칸 뺌, 40자까지)이다")]
    public void DoctorNames()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D002" },
            new object?[] { StatsFake.Chart(1), "20260902", "0905", "가짜보험 가", "D001" },
            new object?[] { StatsFake.Chart(1), "20260903", "0905", "가짜보험 가", "D004" },
            new object?[] { StatsFake.Chart(1), "20260904", "0905", "가짜보험 가", null },
        });
        db.Answer(StatsSql.DoctorMoneyNormalSql, _ => new[] { new object?[] { "20260901", "D003", 1000m } }); // 접수 없이 매출만 있는 원장님
        db.Answer(StatsSql.DoctorMoneyReceivableSql, _ => StatsExtraFake.None());
        // SQL은 코드·UidExpDte 차례로 준다: 코드마다 마지막 줄이 가장 늦은 줄
        db.Answer(StatsSql.DoctorNamesSql, _ => new[]
        {
            new object?[] { "D001", "가짜원장 옛이름", "20201231" },
            new object?[] { "D001", "  가짜원장 가  ", "99991231" },
            new object?[] { "D002", new string('나', 41), "99991231" },
            new object?[] { "D004", "가짜원장 라", "20201231" },
            new object?[] { "D004", "   ", "99991231" },  // 가장 늦은 줄의 이름이 비었다
            new object?[] { "D999", "가짜원장 안 부른 코드", "99991231" },
        });

        Assert.Equal(new[]
        {
            new[] { "D001", "가짜원장 가" },
            new[] { "D002", new string('나', 40) },
            new[] { "D003", "null" },   // UidMst에 없음
            new[] { "D004", "null" },
        }, Doctors(Read(db)));
    }

    [Fact(DisplayName = "AC-2701.4 원장님 이름 SQL은 코드 50자리(@d0~@d49)를 다 채워 부르고(빈 자리는 그 묶음의 첫 코드) 150초 제한이다")]
    public void DoctorNameSlots()
    {
        var db = Db();
        Read(db);

        var call = Assert.Single(db.Calls, c => c.Sql == StatsSql.DoctorNamesSql);
        Assert.Equal(50, StatsSql.DoctorCodeSlots);
        Assert.Equal(50, call.Args.Count);
        Assert.Equal("D001", call.Args["@d0"]);
        Assert.Equal("D002", call.Args["@d1"]);
        for (var i = 2; i < 50; i++) Assert.Equal("D001", call.Args["@d" + i]);
        Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
    }

    [Fact(DisplayName = "AC-2701.4 진료의 코드가 50개를 넘으면 50개씩 나눠 부르고, 코드가 하나도 없으면 이름 SQL을 부르지 않는다")]
    public void DoctorNameBatches()
    {
        var db = Db();
        var codes = Enumerable.Range(0, 51).Select(i => "C" + i.ToString("D3", System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        db.Answer(StatsSql.VisitLinesSql, _ => codes.Select(code => new object?[] { StatsFake.Chart(1), "20260901", "0905", null, code }));
        db.Answer(StatsSql.DoctorMoneyNormalSql, _ => StatsExtraFake.None());
        db.Answer(StatsSql.DoctorMoneyReceivableSql, _ => StatsExtraFake.None());
        db.Answer(StatsSql.DoctorNamesSql, args => new[] { new object?[] { (string?)args["@d0"], "가짜원장", "99991231" } });
        var result = Read(db);

        var calls = db.Calls.Where(c => c.Sql == StatsSql.DoctorNamesSql).ToArray();
        Assert.Equal(2, calls.Length);
        Assert.Equal(codes.Take(50), Enumerable.Range(0, 50).Select(i => (string?)calls[0].Args["@d" + i]));
        Assert.Equal(Enumerable.Repeat("C050", 50), Enumerable.Range(0, 50).Select(i => (string?)calls[1].Args["@d" + i]));
        Assert.Equal(codes, result.Doctors.Select(d => d.Code));
        Assert.Equal(new[] { "C000", "C050" }, result.Doctors.Where(d => d.Name != null).Select(d => d.Code));

        var none = Db();
        none.Answer(StatsSql.VisitLinesSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", "0905", null, null } });
        none.Answer(StatsSql.DoctorMoneyNormalSql, _ => StatsExtraFake.None());
        none.Answer(StatsSql.DoctorMoneyReceivableSql, _ => StatsExtraFake.None());
        Assert.Empty(Read(none).Doctors);
        Assert.DoesNotContain(StatsSql.DoctorNamesSql, none.Sqls);
    }

    // ---- AC-2701.5 날·원장님 금액 ------------------------------------------------------------------

    public static IEnumerable<object[]> MonthWindows() => new[]
    {
        new object[] { "2026-09-15", "2026-11-10", new[] { "20260915 20261001", "20261001 20261101", "20261101 20261111" } },
        new object[] { "2026-12-20", "2027-01-05", new[] { "20261220 20270101", "20270101 20270106" } },
        new object[] { "2024-02-10", "2024-03-01", new[] { "20240210 20240301", "20240301 20240302" } },
        new object[] { "2026-09-30", "2026-09-30", new[] { "20260930 20261001" } },
    };

    [Theory(DisplayName = "AC-2701.5 날·원장님 금액은 불러온 기간을 달로 나눠(첫 달은 시작일부터, 끝 달은 끝 날까지) 달마다 정상수납 → 미수입금 차례로 @day·@nextDay·@hospital을 넣어 읽는다")]
    [MemberData(nameof(MonthWindows))]
    public void MoneyByMonth(string from, string to, string[] windows)
    {
        var db = Db();
        Read(db, from, to);

        Assert.Equal(windows, Windows(db, StatsSql.DoctorMoneyNormalSql, "@day", "@nextDay"));
        Assert.Equal(windows, Windows(db, StatsSql.DoctorMoneyReceivableSql, "@day", "@nextDay"));
        var money = db.Calls.Where(c => c.Sql == StatsSql.DoctorMoneyNormalSql || c.Sql == StatsSql.DoctorMoneyReceivableSql).ToArray();
        Assert.Equal(Enumerable.Range(0, windows.Length).SelectMany(_ => new[] { StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql }), money.Select(c => c.Sql));
        Assert.All(money, call =>
        {
            Assert.Equal(3, call.Args.Count);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        });
    }

    [Fact(DisplayName = "AC-2701.5 같은 (수납일, 진료의)는 정상수납과 미수입금을 더한 뒤 원 미만을 버리고(반올림하지 않음) 0원 줄은 싣지 않으며 수납일·진료의 차례다")]
    public void MoneyIsSummedAndTruncated()
    {
        var db = Db();
        db.Answer(StatsSql.DoctorMoneyNormalSql, _ => new[]
        {
            new object?[] { "20260902", "D001", -300.9m },   // 환불이 더 큰 날: 0 쪽으로 버린다
            new object?[] { "20260901", "D001 ", 1000.7m },
            new object?[] { "20260901", "D002", 0.4m },
            new object?[] { "20260903", "D002", null },      // DB NULL은 0
            new object?[] { "20260904", "D001", 25000L },
        });
        db.Answer(StatsSql.DoctorMoneyReceivableSql, _ => new[]
        {
            new object?[] { "20260901", "D001", 0.6m },
            new object?[] { "20260904", "D001", -25000m },  // 더해서 0원
        });
        var result = Read(db);

        Assert.Equal(new[]
        {
            new[] { "20260901", "D001", "1001" },
            new[] { "20260902", "D001", "-300" },
        }, Money(result));
        Assert.All(result.DoctorDays, day => Assert.IsType<long>(day.Amount));
        // 0원 줄의 진료의(D002)도 접수 줄에 있으니 원장님 줄에는 있다
        Assert.Equal(new[] { "D001", "D002" }, result.Doctors.Select(d => d.Code));
    }

    [Fact(DisplayName = "AC-2701.5 수납 진료의 코드가 비었거나 없는 금액 줄은 원장님 줄이 없어 싣지 않는다")]
    public void MoneyWithoutDoctorIsSkipped()
    {
        var db = Db();
        db.Answer(StatsSql.DoctorMoneyNormalSql, _ => new[]
        {
            new object?[] { "20260901", "   ", 5000m },
            new object?[] { "20260901", null, 7000m },
            new object?[] { "20260901", "D001", 3000m },
        });
        db.Answer(StatsSql.DoctorMoneyReceivableSql, _ => StatsExtraFake.None());

        Assert.Equal(new[] { new[] { "20260901", "D001", "3000" } }, Money(Read(db)));
    }

    [Fact(DisplayName = "AC-2701.5 기본 가짜 자료: 달마다 그 달 첫 수납일의 D001·D002 금액이 각각 한 줄이다")]
    public void MoneyFromDefaultFake()
    {
        Assert.Equal(new[]
        {
            new[] { "20260915", "D001", "50000" },
            new[] { "20260915", "D002", "1000" },
            new[] { "20261001", "D001", "50000" },
            new[] { "20261001", "D002", "1000" },
        }, Money(Read(Db(), "2026-09-15", "2026-10-20")));
    }

    public static IEnumerable<object[]> MalformedValues() => new[]
    {
        new object[] { StatsSql.DoctorMoneyNormalSql, new object?[] { "20260901", "D001", "x" } },
        new object[] { StatsSql.DoctorMoneyNormalSql, new object?[] { "20260901", "D001" } },
        new object[] { StatsSql.DoctorMoneyNormalSql, new object?[] { "20260901", new string('D', 41), 1000m } },
        new object[] { StatsSql.DoctorMoneyNormalSql, new object?[] { null, "D001", 1000m } },
        new object[] { StatsSql.DoctorMoneyReceivableSql, new object?[] { "20260901", "D001", 100000000000000000000m } }, // long에 안 들어감
        new object[] { StatsSql.VisitLinesSql, new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가" } },
        new object[] { StatsSql.VisitLinesSql, new object?[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", new string('D', 41) } },
        new object[] { StatsSql.PeopleSql, new object?[] { StatsFake.Chart(1), "19800101" } },
        new object[] { StatsSql.DoctorNamesSql, new object?[] { "D001" } },
    };

    [Theory(DisplayName = "AC-2701.5 값 모양이 틀리면(숫자가 아님·칸이 모자람·41자 진료의 코드·없는 수납일) 도우미를 멈추지 않고 번호뿐인 E-BIT-READ-FAILED다")]
    [MemberData(nameof(MalformedValues))]
    public void Malformed(string sql, object?[] row)
    {
        var db = Db();
        db.Answer(sql, _ => new[] { row });
        var error = Assert.Throws<BitException>(() => Read(db));
        Assert.Equal("E-BIT-READ-FAILED", error.Code);
        Assert.Equal("E-BIT-READ-FAILED", error.Message);
    }

    // ---- AC-6106.1 환자·날 금액(spec stats-insights) ------------------------------------------------

    [Theory(DisplayName = "AC-6106.1 환자·날 금액은 원장님별 금액과 같은 달 나누기로(첫 달은 시작일부터, 끝 달은 끝 날까지) 원장님 이름을 읽은 뒤 달마다 정상수납 → 미수입금 차례로 @day·@nextDay·@hospital을 넣어 150초 제한으로 읽는다")]
    [MemberData(nameof(MonthWindows))]
    public void PaysByMonth(string from, string to, string[] windows)
    {
        var db = Db();
        Read(db, from, to);

        Assert.Equal(windows, Windows(db, StatsPayFake.NormalSql, "@day", "@nextDay"));
        Assert.Equal(windows, Windows(db, StatsPayFake.ReceivableSql, "@day", "@nextDay"));
        var sqls = db.Sqls.ToList();
        Assert.Equal(
            Enumerable.Range(0, windows.Length).SelectMany(_ => new[] { StatsPayFake.NormalSql, StatsPayFake.ReceivableSql }),
            sqls.Skip(sqls.LastIndexOf(StatsSql.DoctorNamesSql) + 1));
        var pays = db.Calls.Where(c => c.Sql == StatsPayFake.NormalSql || c.Sql == StatsPayFake.ReceivableSql).ToArray();
        Assert.All(pays, call =>
        {
            Assert.Equal(3, call.Args.Count);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
            ReadOnlyGuard.Require(call.Sql, call.Args);
        });
    }

    [Fact(DisplayName = "AC-6106.1 진료의 코드가 하나도 없어 원장님 이름을 읽지 않아도 환자·날 금액은 달마다 금액 둘 뒤에 읽는다")]
    public void PaysWithoutDoctorNames()
    {
        var db = Db();
        db.Answer(StatsSql.VisitLinesSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", "0905", null, null } });
        db.Answer(StatsSql.DoctorMoneyNormalSql, _ => StatsExtraFake.None());
        db.Answer(StatsSql.DoctorMoneyReceivableSql, _ => StatsExtraFake.None());
        Read(db);

        Assert.Equal(new[]
        {
            StatsSql.VisitLinesSql, StatsSql.PeopleSql, StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql, StatsPayFake.NormalSql, StatsPayFake.ReceivableSql,
        }, db.Sqls);
    }

    public static IEnumerable<object[]> MalformedPays() => new[]
    {
        new object[] { StatsPayFake.NormalSql, new object?[] { StatsFake.Chart(1), "20260901", "x" } },
        new object[] { StatsPayFake.NormalSql, new object?[] { StatsFake.Chart(1), "20260901" } },
        new object[] { StatsPayFake.NormalSql, new object?[] { StatsFake.Chart(1), null, 1000m } },
        new object[] { StatsPayFake.ReceivableSql, new object?[] { StatsFake.Chart(1), "20260901", 100000000000000000000m } }, // long에 안 들어감
    };

    [Theory(DisplayName = "AC-6106.1 환자·날 금액 값 모양이 틀리면(숫자가 아님·칸이 모자람·없는 수납일·long에 안 들어감) 도우미를 멈추지 않고 번호뿐인 E-BIT-READ-FAILED다")]
    [MemberData(nameof(MalformedPays))]
    public void MalformedPay(string sql, object?[] row)
    {
        var db = Db();
        db.Answer(sql, _ => new[] { row });
        var error = Assert.Throws<BitException>(() => Read(db));
        Assert.Equal("E-BIT-READ-FAILED", error.Code);
        Assert.Equal("E-BIT-READ-FAILED", error.Message);
    }

    // ---- AC-6106.6 환자·날 금액 줄 수 상한(spec stats-insights, 2026-11-18 검토 고침) -------------------

    [Fact(DisplayName = "AC-6106.6 환자·날 금액 줄이 다른 줄과 같은 상한(StatsRows.MaxRows 700,000줄)이면 다 싣는다(한도 안)")]
    public void PaysUpToTheLimit()
    {
        var db = Db();
        db.Answer(StatsPayFake.NormalSql, args => StatsExtraFake.ManyPays(StatsRows.MaxRows, (string?)args["@day"]));
        db.Answer(StatsPayFake.ReceivableSql, _ => StatsExtraFake.None());
        Assert.Equal(700_000, Read(db).Pays.Count);
    }

    [Fact(DisplayName = "AC-6106.6 정상수납·미수입금을 묶은 환자·날 금액 줄이 700,001줄이면 다른 줄과 같은 E-STATS-TOO-BIG(번호뿐)이다")]
    public void TooManyPays()
    {
        var db = Db();
        // 정상수납 700,000줄 + 미수입금 기본 가짜 자료(다른 차트번호 한 줄) = 묶은 줄 700,001줄
        db.Answer(StatsPayFake.NormalSql, args => StatsExtraFake.ManyPays(StatsRows.MaxRows, (string?)args["@day"]));
        var error = Assert.Throws<BitException>(() => Read(db));
        Assert.Equal("E-STATS-TOO-BIG", error.Code);
        Assert.Equal("E-STATS-TOO-BIG", error.Message);
        Assert.Equal(StatsErrors.TooBig, error.Code);
    }

    [Fact(DisplayName = "AC-6106.6 0원이라 싣지 않는 환자·날 금액 줄은 상한에 세지 않는다")]
    public void ZeroPaysDoNotCount()
    {
        var db = Db();
        db.Answer(StatsPayFake.NormalSql, args => StatsExtraFake.ManyPays(StatsRows.MaxRows, (string?)args["@day"]));
        // 미수입금이 기본 차트 2의 2,000원을 지우는(−2,000원) 줄 → 그 환자·날은 0원이라 싣지 않는다
        db.Answer(StatsPayFake.ReceivableSql, args => new[]
        {
            new object?[] { StatsFake.Chart(2), (string?)args["@day"], 2000m },
            new object?[] { StatsFake.Chart(2), (string?)args["@day"], -2000m },
        });
        Assert.Equal(700_000, Read(db).Pays.Count);
    }

    // ---- AC-2701.6 읽는 차례·시간 제한 ------------------------------------------------------------

    private static readonly string[] Order =
    {
        StatsSql.VisitLinesSql, StatsSql.PeopleSql, StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql, StatsSql.DoctorNamesSql,
        StatsPayFake.NormalSql, StatsPayFake.ReceivableSql,
    };

    [Fact(DisplayName = "AC-2701.6 AC-6106.1 새 읽기는 접수 줄 → 사람 줄 → 달마다 금액 둘 → 원장님 이름 → 달마다 환자·날 금액 둘 차례이고 모두 관문을 지나 150초 제한으로 돈다")]
    public void ReadOrderAndTimeout()
    {
        var db = Db();
        Read(db);

        Assert.Equal(Order, db.Sqls);
        Assert.All(db.Calls, call =>
        {
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
            ReadOnlyGuard.Require(call.Sql, call.Args);
        });
    }

    public static IEnumerable<object[]> EachSql() => Enumerable.Range(0, 7).Select(i => new object[] { i });

    [Theory(DisplayName = "AC-2701.6 AC-6106.1 새 읽기 SQL 하나라도 실패하면(환자·날 금액 둘 포함) 반쪽 자료 없이 그 번호로 멈춘다")]
    [MemberData(nameof(EachSql))]
    public void AnySqlFails(int index)
    {
        var db = Db();
        db.Fail(Order[index], BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Read(db)).Code);
        Assert.Equal(Order.Take(index + 1), db.Sqls);
    }

    // ---- AC-2701.7 지금 읽기는 그대로 --------------------------------------------------------------

    [Fact(DisplayName = "AC-2701.7 지금 통계 줄 읽기(StatsRows.Read)는 새 문장을 돌리지 않고 지금 차례 그대로다")]
    public void StatsRowsReadIsUnchanged()
    {
        using var rig = StatsFake.Clinic();
        StatsRows.Read(rig.Session, Synthetic.Scope, From, To);

        Assert.Equal(new[]
        {
            StatsSql.HistoryGuardSql, StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql,
        }, rig.Session.Sqls);
        Assert.DoesNotContain(rig.Session.Sqls, sql => StatsSql.Sections.Contains(sql));
    }
}

/// <summary>
/// REQ-2701 stats.rows 답 v3(TASK-2): v2 열쇠 뒤에 visits·people·doctors·doctorDays를 이 차례로 싣는다.
/// 새 자료는 보고 네 벌을 읽은 뒤 같은 세션에서 읽고, 하나라도 막히면 반쪽 자료 없이 error만 간다.
/// </summary>
public class StatsExtraPayloadTests
{
    private const string September = "{\"from\":\"2026-09-01\",\"to\":\"2026-09-30\"}";

    private static readonly string[] V2Keys = { "v", "from", "to", "summary", "days", "patientDays", "codes", "rows", "report" };

    private static readonly string[] SectionOrder =
    {
        StatsSql.VisitLinesSql, StatsSql.PeopleSql, StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql, StatsSql.DoctorNamesSql,
        StatsPayFake.NormalSql, StatsPayFake.ReceivableSql,
    };

    private static string Reply(Rig rig) => StatsRowsTests.Assemble(StatsRowsTests.Handle(rig, September));

    private static string[] Strings(JsonElement array) => array.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.Null ? "null" : item.ToString()).ToArray();

    private static string[][] Table(JsonElement array) => array.EnumerateArray().Select(Strings).ToArray();

    [Fact(DisplayName = "AC-2701.1 AC-4401.1 AC-6201.1 AC-6106.1 stats.rows 답은 v 5(v3 열쇠 그대로, patientDays만 여섯 칸)이고 v2 열쇠 뒤에 visits·people·doctors·doctorDays·pays를 이 차례로 싣는다")]
    public void VersionAndKeys()
    {
        using var rig = StatsFake.Clinic();
        var root = Json.Parse(Reply(rig));

        Assert.Equal(5, root.GetProperty("v").GetInt32());
        Assert.Equal(5, StatsPayload.Version);
        Assert.Equal(V2Keys.Concat(new[] { "visits", "people", "doctors", "doctorDays", "pays" }), Json.Keys(root));
        Assert.Equal(1, rig.Session.Disposed);
    }

    // ---- AC-6106.1 환자·날 금액 줄 pays(spec stats-insights) -----------------------------------------

    [Fact(DisplayName = "AC-6106.1 stats.rows 답 v는 5 그대로이고 doctorDays 바로 뒤 마지막 열쇠 pays에 환자·날 금액 줄을 더한다, 그 밖의 열쇠·값은 그대로다")]
    public void PaysIsLastKeyOfV5()
    {
        using var rig = StatsFake.Clinic();
        var root = Json.Parse(Reply(rig));

        Assert.Equal(5, root.GetProperty("v").GetInt32());
        var keys = Json.Keys(root).ToArray();
        Assert.Equal("pays", keys[keys.Length - 1]);
        Assert.Equal("doctorDays", keys[keys.Length - 2]);
        Assert.Equal(new[] { new[] { "20260901", "D001", "50000" }, new[] { "20260901", "D002", "1000" } }, Table(root.GetProperty("doctorDays")));
    }

    [Fact(DisplayName = "AC-6106.1 pays 줄은 세 칸 [차트번호, 수납일, 금액(원 단위 정수)]이고 기본 가짜 자료는 정상수납 차트 1·미수입금 차트 2 한 줄씩(차트번호 앞뒤 빈칸 뺌)이다")]
    public void PaysJson()
    {
        using var rig = StatsFake.Clinic();
        var pays = Json.Parse(Reply(rig)).GetProperty("pays");

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "30000" },
            new[] { StatsFake.Chart(2), "20260901", "2000" },
        }, Table(pays));
        Assert.All(pays.EnumerateArray(), pay =>
        {
            Assert.Equal(3, pay.GetArrayLength());
            Assert.Equal(JsonValueKind.String, pay[0].ValueKind);
            Assert.Equal(JsonValueKind.String, pay[1].ValueKind);
            Assert.Equal(JsonValueKind.Number, pay[2].ValueKind);
            Assert.True(pay[2].TryGetInt64(out _));
        });
    }

    [Fact(DisplayName = "AC-6106.1 같은 (차트번호, 수납일)은 정상수납과 미수입금을 더한 뒤 원 미만을 버리고(반올림하지 않음) 0원 줄은 싣지 않으며 음수(환불이 더 큰 날)는 그대로, 차트번호·수납일 차례다")]
    public void PaysAreSummedAndTruncated()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsPayFake.NormalSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(2), "20260905", -300.9m },      // 환불이 더 큰 날: 0 쪽으로 버리고 음수 그대로
            new object?[] { StatsFake.Chart(1) + " ", "20260901", 1000.7m },
            new object?[] { StatsFake.Chart(1), "20260902", 0.4m },         // 원 미만뿐: 0원 줄은 뺀다
            new object?[] { StatsFake.Chart(3), "20260903", null },         // DB NULL은 0
            new object?[] { StatsFake.Chart(1), "20260904", 25000L },
        });
        rig.Session.Answer(StatsPayFake.ReceivableSql, _ => new[]
        {
            new object?[] { " " + StatsFake.Chart(1), "20260901", 0.6m },   // 같은 (차트번호, 수납일): 더한 뒤 버린다
            new object?[] { StatsFake.Chart(1), "20260904", -25000m },      // 더해서 0원
            new object?[] { StatsFake.Chart(2), "20260906", -0.5m },        // 0 쪽으로 버려 0원
        });
        var pays = Json.Parse(Reply(rig)).GetProperty("pays");

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "1001" },
            new[] { StatsFake.Chart(2), "20260905", "-300" },
        }, Table(pays));
    }

    [Fact(DisplayName = "AC-6106.1 차트번호가 비었거나 공백뿐이거나 없는 금액 줄은 환자가 없어 싣지 않는다")]
    public void PaysWithoutChartAreSkipped()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsPayFake.NormalSql, _ => new[]
        {
            new object?[] { "   ", "20260901", 5000m },
            new object?[] { "", "20260901", 6000m },
            new object?[] { null, "20260901", 7000m },
            new object?[] { StatsFake.Chart(1), "20260901", 3000m },
        });
        rig.Session.Answer(StatsPayFake.ReceivableSql, _ => StatsExtraFake.None());

        Assert.Equal(new[] { new[] { StatsFake.Chart(1), "20260901", "3000" } }, Table(Json.Parse(Reply(rig)).GetProperty("pays")));
    }

    [Fact(DisplayName = "AC-6106.1 금액 줄이 하나도 없으면 pays는 빈 배열이다")]
    public void NoPaysIsEmptyArray()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsPayFake.NormalSql, _ => StatsExtraFake.None());
        rig.Session.Answer(StatsPayFake.ReceivableSql, _ => StatsExtraFake.None());
        var pays = Json.Parse(Reply(rig)).GetProperty("pays");

        Assert.Equal(JsonValueKind.Array, pays.ValueKind);
        Assert.Equal(0, pays.GetArrayLength());
    }

    [Fact(DisplayName = "AC-6106.1 도우미 판은 0.12.0이다(웹 LATEST_HELPER·VALUE_HELPER 0.11.0, MIN_HELPER 0.3.0 그대로는 handshake.test.ts가 본다)")]
    public void HelperVersionIsZeroEleven() => Assert.Equal("0.12.0", HelperVersion.Value);

    [Fact(DisplayName = "AC-2701.1 visits 줄은 다섯 칸 [차트번호|null, 진료일, 접수 시각|null, 보험 이름|null, 진료의 코드|null]이고 빈 칸은 JSON null이다")]
    public void VisitsJson()
    {
        using var rig = StatsFake.Clinic();
        var visits = Json.Parse(Reply(rig)).GetProperty("visits");

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "0905", "가짜보험 가", "D001" },
            new[] { StatsFake.Chart(2), "20260902", "1430", "가짜보험 나", "D002" },
            new[] { "null", "20260903", "0830", "null", "null" },
        }, Table(visits));
        Assert.All(visits.EnumerateArray(), line =>
        {
            Assert.Equal(5, line.GetArrayLength());
            Assert.All(line.EnumerateArray(), cell => Assert.Contains(cell.ValueKind, new[] { JsonValueKind.String, JsonValueKind.Null }));
        });
        Assert.Equal(JsonValueKind.Null, visits[2][0].ValueKind);
        Assert.Equal(JsonValueKind.Null, visits[2][3].ValueKind);
        Assert.Equal(JsonValueKind.Null, visits[2][4].ValueKind);
    }

    [Fact(DisplayName = "AC-2701.1 접수 시각을 모르는 접수는 시각 칸이 JSON null이다")]
    public void UnknownTimeIsNull()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitLinesSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", "2400", "가짜보험 가", "D001" } });
        var visits = Json.Parse(Reply(rig)).GetProperty("visits");
        Assert.Equal(JsonValueKind.Null, Assert.Single(visits.EnumerateArray())[2].ValueKind);
    }

    [Fact(DisplayName = "AC-2701.3 people 줄은 세 칸 [차트번호, 생년월일|null, 주소 앞부분|null]이고 이름·전화·번지는 답에 없다")]
    public void PeopleJson()
    {
        using var rig = StatsFake.Clinic();
        var json = Reply(rig);
        var people = Json.Parse(json).GetProperty("people");

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "19800101", "가짜도 가짜시 가짜구 가짜동" },
            new[] { StatsFake.Chart(2), "null", "null" },
        }, Table(people));
        Assert.All(people.EnumerateArray(), person =>
        {
            Assert.Equal(3, person.GetArrayLength());
            Assert.Equal(JsonValueKind.String, person[0].ValueKind);
        });
        Assert.Equal(JsonValueKind.Null, people[1][1].ValueKind);
        Assert.Equal(JsonValueKind.Null, people[1][2].ValueKind);

        Assert.DoesNotContain(Fake.Name, json);
        Assert.DoesNotContain(Fake.Phone, json);
        Assert.DoesNotContain(StatsExtraFake.HouseNumber, json);
        Assert.DoesNotContain("가짜빌라", json);
    }

    [Fact(DisplayName = "AC-2701.4 doctors 줄은 두 칸 [코드, 이름|null]이고 visits·doctorDays의 진료의 코드가 모두 있다")]
    public void DoctorsJson()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.DoctorNamesSql, _ => new[] { new object?[] { "D001", " 가짜원장 가 ", "99991231" } });
        var root = Json.Parse(Reply(rig));
        var doctors = root.GetProperty("doctors");

        Assert.Equal(new[]
        {
            new[] { "D001", "가짜원장 가" },
            new[] { "D002", "null" },
        }, Table(doctors));
        Assert.Equal(JsonValueKind.Null, doctors[1][1].ValueKind);

        var codes = doctors.EnumerateArray().Select(d => d[0].GetString()).ToArray();
        Assert.All(root.GetProperty("visits").EnumerateArray().Where(v => v[4].ValueKind != JsonValueKind.Null), v => Assert.Contains(v[4].GetString(), codes));
        Assert.All(root.GetProperty("doctorDays").EnumerateArray(), d => Assert.Contains(d[1].GetString(), codes));
    }

    [Fact(DisplayName = "AC-2701.5 doctorDays 줄은 [수납일, 진료의 코드, 총진료비(원 단위 정수)]이다")]
    public void DoctorDaysJson()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.DoctorMoneyNormalSql, _ => new[]
        {
            new object?[] { "20260901", "D001", 50000.9m },
            new object?[] { "20260905", "D002", -300.5m },
        });
        var days = Json.Parse(Reply(rig)).GetProperty("doctorDays");

        Assert.Equal(new[]
        {
            new[] { "20260901", "D001", "50000" },
            new[] { "20260901", "D002", "1000" },
            new[] { "20260905", "D002", "-300" },
        }, Table(days));
        Assert.All(days.EnumerateArray(), day =>
        {
            Assert.Equal(3, day.GetArrayLength());
            Assert.Equal(JsonValueKind.String, day[0].ValueKind);
            Assert.Equal(JsonValueKind.String, day[1].ValueKind);
            Assert.Equal(JsonValueKind.Number, day[2].ValueKind);
            Assert.True(day[2].TryGetInt64(out _));
        });
    }

    [Fact(DisplayName = "AC-2701.7 새 자료는 보고 네 벌을 읽은 뒤 같은 세션에서 읽고, 지금 읽기 차례(진료 줄 → … → 보고)는 그대로다")]
    public void ReadAfterReport()
    {
        using var rig = StatsFake.Clinic();
        Reply(rig);
        var sqls = rig.Session.Sqls.ToList();

        Assert.Equal(new[]
        {
            Sql.ScopesSql, Sql.InstitutionSql,
            StatsSql.HistoryGuardSql, StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql,
            Sql.SnapshotStateSql,
        }, sqls.Take(9));
        var at = sqls.IndexOf(StatsSql.VisitLinesSql);
        Assert.Equal(StatsSql.FinanceReceivableSql, sqls[at - 1]); // 보고 마지막 벌의 마지막 SQL
        Assert.DoesNotContain(sqls.Take(at), sql => StatsSql.Sections.Contains(sql));
        Assert.Equal(SectionOrder, sqls.Skip(at));
        Assert.Equal(1, rig.Session.Disposed);
    }

    public static IEnumerable<object[]> EachSql() => Enumerable.Range(0, 7).Select(i => new object[] { i });

    [Theory(DisplayName = "AC-2701.1 AC-6106.1 새 자료 SQL이 하나라도 실패하면(환자·날 금액 둘 포함) 반쪽 자료 없이 E-BIT-READ-FAILED만 보낸다")]
    [MemberData(nameof(EachSql))]
    public void AnySectionSqlFails(int index)
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Fail(SectionOrder[index], BitErrors.ReadFailed);
        StatsRowsTests.AssertOnlyError(StatsRowsTests.Handle(rig, September), "E-BIT-READ-FAILED");
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-2701.1 접수 줄이 700,000줄을 넘으면 E-STATS-TOO-BIG만 보낸다(chunk 없음)")]
    public void TooManyVisitLines()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitLinesSql, _ => StatsExtraFake.ManyLines(StatsRows.MaxRows + 1));
        StatsRowsTests.AssertOnlyError(StatsRowsTests.Handle(rig, September), "E-STATS-TOO-BIG");
        Assert.DoesNotContain(StatsSql.PeopleSql, rig.Session.Sqls);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-6106.6 환자·날 금액 줄(pays)이 700,000줄을 넘으면 다른 줄과 같이 E-STATS-TOO-BIG만 보낸다(chunk 없음 — 웹이 답 전체를 모양 오류로 거절하지 않게)")]
    public void TooManyPays()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsPayFake.NormalSql, args => StatsExtraFake.ManyPays(StatsRows.MaxRows + 1, (string?)args["@day"]));
        StatsRowsTests.AssertOnlyError(StatsRowsTests.Handle(rig, September), "E-STATS-TOO-BIG");
        Assert.Equal(1, rig.Session.Disposed);
    }
}
