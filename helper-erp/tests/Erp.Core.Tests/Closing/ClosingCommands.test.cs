using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Erp.Core;
using Erp.Core.Closing;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Revenue;
using Xunit;

namespace Erp.Core.Tests.Closing;

/// <summary>
/// TASK-6 closing.codes·closing.day 처리기(design.md 3-4): ERP 도우미에 실린 명령 표(ErpCommandTable)로 기존 Dispatcher에 붙여 관문 → 읽기 → result 하나.
/// 막히면 error 하나, 진단 기록은 명령 이름·오류 번호뿐. 기존 도우미(웹 명령 표 commands.json)는 closing.*를 모른다(TASK-11).
/// 진료번호·코드·금액은 지어낸 것이고 차트번호·이름은 가짜 글자다.
/// </summary>
public class ClosingCommandsTests
{
    /// <summary>ERP 도우미 명령 표(helper-erp/commands.json).</summary>
    private static readonly CommandTable Table = ErpCommandTable.Load();

    /// <summary>기존 도우미 명령 표(src/lib/bridge/commands.json, 1a721ef 그대로). revenue.days와 같은 번호인지 견줄 때만 쓴다.</summary>
    private static readonly CommandTable WebTable = CommandTable.LoadEmbedded();

    private const string BirthDate = "19860101";

    private sealed class Outcome
    {
        public ListSink Sink { get; } = new ListSink();

        public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();

        public string Text => string.Concat(Sink.Messages.Select(Encoding.UTF8.GetString));
    }

    /// <summary>ERP 도우미처럼 ERP 명령 표에 closing.*만 붙인 Dispatcher로 메시지 하나를 처리한다(hello는 붙이지 않는다).</summary>
    private static Outcome Handle(Rig rig, string cmd, string args)
    {
        var outcome = new Outcome();
        var dispatcher = new Dispatcher(Table, (name, code) => outcome.Log.Add((name, code)));
        ClosingCommands.Register(dispatcher, rig.Services);
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), outcome.Sink);
        return outcome;
    }

    /// <summary>기존 도우미처럼 웹 명령 표에 hello·revenue.days를 붙인 Dispatcher로 메시지 하나를 처리한다.</summary>
    private static Outcome HandleWeb(Rig rig, string cmd, string args)
    {
        var outcome = new Outcome();
        var dispatcher = new Dispatcher(WebTable, (name, code) => outcome.Log.Add((name, code)));
        Hello.Register(dispatcher, WebTable);
        RevenueCommands.Register(dispatcher, rig.Services);
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), outcome.Sink);
        return outcome;
    }

    private static string G(string key, params string[] codes) =>
        "{\"key\":\"" + key + "\",\"codes\":[" + string.Join(",", codes.Select(code => "\"" + code + "\"")) + "]}";

    private static string DayArgs(string date, params string[] groups) =>
        "{\"date\":\"" + date + "\",\"groups\":[" + string.Join(",", groups) + "]}";

    private static readonly string Usual = DayArgs(ClosingFake.DayText, G("carm", "CARM1"), G("pt", "MM010"), G("ptVisit", "AA222"));

    /// <summary>CodeNamesSql 한 줄: 코드·이름 뒤 칸들(원본 차례).</summary>
    private static object?[] CodeName(string code, string? name) => new object?[] { code, name, "", "20200101", "99991231", "1", "", false };

    /// <summary>
    /// 등록된 PC. 그날 진료 둘: 신환 V001(씨암 줄 30,000) · 재진 V002(물리치료내원 AA222 줄 0 · 물리치료 MM010 두 줄 20,000).
    /// 처방 줄 뒤 칸은 금액(TASK-14). 줄 뒤쪽 칸에 가짜 차트번호·이름·생년월일이 섞여 와도 처리기는 읽는 칸만 본다.
    /// </summary>
    private static Rig Ready()
    {
        var rig = new Rig().Registered();
        var db = rig.Session;
        ClosingFake.Quiet(db);
        db.Answer(ClosingSql.DayVisitsSql, _ => new[]
        {
            new object?[] { "V001", 1L, "1", 40, 30000m, Fake.Chart, Fake.Name, BirthDate },
            new object?[] { "V002", 2L, "4", 52, 20000m, Fake.Chart, Fake.Name, BirthDate },
        });
        db.Answer(ClosingSql.DayCodesSql, _ => new[]
        {
            new object?[] { "V001", "CARM1", 1L, 30000m },
            new object?[] { "V002", "AA222", 1L, 0m },
            new object?[] { "V002", "MM010", 2L, 20000m },
        });
        db.Answer(Sql.TrendTotalsSql, _ => new[]
        {
            new object?[] { "CARM1", 12L, Fake.Chart },
            new object?[] { "sono1 ", 7L, Fake.Name },
        });
        db.Answer(StatsSql.CodeNamesSql, _ => new[] { CodeName("CARM1", "C-arm 유도"), CodeName("SONO1", "비급여초음파") });
        db.Answer(ClosingSql.MemoKindsSql, _ => new[] { new object?[] { "Memo1", "충격파", Fake.Chart } });
        return rig;
    }

    private static JsonElement One(Outcome outcome, string type)
    {
        var reply = Assert.Single(outcome.Sink.Replies);
        Assert.Equal(type, reply.GetProperty("type").GetString());
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        return reply;
    }

    private static string ErrorOf(Outcome outcome) => One(outcome, "error").GetProperty("code").GetString()!;

    private static IEnumerable<string> ReadStatements() =>
        ClosingFake.Statements.Concat(RevenueFake.EightStatements).Concat(new[] { RevenueSql.HistoryGuard, Sql.TrendTotalsSql, StatsSql.CodeNamesSql });

    // ---- 이어 붙이기(AC-3603.1·AC-3601.3) ---------------------------------------------------------

    [Fact(DisplayName = "AC-3603.1 AC-3601.3 새 확장이 closing.day를 부르면 관문 → 읽기 → chunk 없이 result 하나, 묶음은 args 차례")]
    public void DayIsOneResult()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", Usual);

        var data = One(outcome, "result").GetProperty("data");
        Assert.Equal(ClosingFake.DayText, data.GetProperty("date").GetString());
        Assert.Equal(new[] { "carm", "pt", "ptVisit" }, data.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("key").GetString()));
        var groups = data.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(1, groups[0].GetProperty("patients").GetInt64());
        Assert.Equal(30000, groups[0].GetProperty("total").GetInt64());
        Assert.Equal(1, groups[1].GetProperty("patients").GetInt64());
        Assert.Equal(20000, groups[1].GetProperty("total").GetInt64());
        var patients = data.GetProperty("patients");
        Assert.Equal(1, patients.GetProperty("new").GetInt64());
        Assert.Equal(1, patients.GetProperty("ptVisit").GetInt64());
        Assert.Equal(0, patients.GetProperty("return").GetInt64());
        Assert.Equal(2, patients.GetProperty("total").GetInt64());
        Assert.Equal(1050000, data.GetProperty("money").GetProperty("total").GetInt64());

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, rig.Session.Sqls.Take(2));
        Assert.Contains(ClosingSql.DayVisitsSql, rig.Session.Sqls);
        Assert.All(rig.Session.Calls.Skip(2).Where(call => call.Args.ContainsKey("@hospital")), call => Assert.Equal(Synthetic.Scope, call.Args["@hospital"]));
        Assert.Equal(1, rig.Session.Disposed);
        Assert.Equal(("closing.day", (string?)null), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-3601.3 새 확장이 closing.codes를 부르면 관문 → 어제까지 1년 코드·예약 메모 목록 → result 하나(오늘은 도우미 PC 날짜)")]
    public void CodesIsOneResult()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.codes", "{}");

        var data = One(outcome, "result").GetProperty("data");
        var codes = data.GetProperty("codes").EnumerateArray().ToArray();
        Assert.Equal(new[] { "CARM1", "SONO1" }, codes.Select(code => code.GetProperty("code").GetString()));
        Assert.Equal(new long[] { 12, 7 }, codes.Select(code => code.GetProperty("visits").GetInt64()));
        Assert.Equal("C-arm 유도", codes[0].GetProperty("name").GetString());
        var kind = Assert.Single(data.GetProperty("kinds").EnumerateArray().ToArray());
        Assert.Equal("1", kind.GetProperty("kind").GetString());
        Assert.Equal("충격파", kind.GetProperty("name").GetString());

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, rig.Session.Sqls.Take(2));
        var totals = Assert.Single(rig.Session.Calls, call => call.Sql == Sql.TrendTotalsSql);
        Assert.Equal("202610300000", totals.Args["@to"]);
        Assert.Equal(Synthetic.Scope, totals.Args["@hospital"]);
        Assert.Equal(1, rig.Session.Disposed);
        Assert.Equal(("closing.codes", (string?)null), Assert.Single(outcome.Log));
    }

    // ---- 인자 검사(AC-3603.1) ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.1 같은 key 두 번이면 E-HELPER-BAD-MESSAGE 오류 하나, 마감·매출 문장을 돌리지 않고 연 세션은 닫음")]
    public void SameKeyTwice()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", DayArgs(ClosingFake.DayText, G("carm", "CARM1"), G("sono", "SONO1"), G("carm", "SONO1")));

        Assert.Equal(ErrorCodes.BadMessage, ErrorOf(outcome));
        Assert.DoesNotContain(rig.Session.Sqls, ReadStatements().Contains);
        Assert.Equal(rig.Connector.Opened.Count, rig.Session.Disposed);
        Assert.Equal(("closing.day", (string?)ErrorCodes.BadMessage), Assert.Single(outcome.Log));
    }

    public static IEnumerable<object[]> TableRefuses()
    {
        var all = ClosingDay.GroupKeys.Select(key => G(key, "X1")).ToArray();
        yield return new object[] { "모르는 key", DayArgs(ClosingFake.DayText, G("massage", "CARM1")) };
        yield return new object[] { "key 대소문자", DayArgs(ClosingFake.DayText, G("Carm", "CARM1")) };
        yield return new object[] { "코드 0개", DayArgs(ClosingFake.DayText, G("carm")) };
        yield return new object[] { "코드 21개", DayArgs(ClosingFake.DayText, G("carm", Enumerable.Range(0, 21).Select(i => "C" + i).ToArray())) };
        yield return new object[] { "코드 21자", DayArgs(ClosingFake.DayText, G("carm", new string('C', 21))) };
        yield return new object[] { "가운데 공백", DayArgs(ClosingFake.DayText, G("carm", "CA RM1")) };
        yield return new object[] { "빈 코드", DayArgs(ClosingFake.DayText, G("carm", "")) };
        yield return new object[] { "묶음 20개", DayArgs(ClosingFake.DayText, all.Concat(new[] { G("carm", "X2") }).ToArray()) };
        yield return new object[] { "날짜 빗금", DayArgs("2026/11/09", G("carm", "CARM1")) };
        yield return new object[] { "없는 날", DayArgs("2026-11-31", G("carm", "CARM1")) };
        yield return new object[] { "날짜 붙여 씀", DayArgs("20261109", G("carm", "CARM1")) };
        yield return new object[] { "groups 없음", "{\"date\":\"2026-11-09\"}" };
        yield return new object[] { "모르는 칸", "{\"date\":\"2026-11-09\",\"groups\":[],\"chart\":\"" + Fake.Chart + "\"}" };
        yield return new object[] { "묶음에 모르는 칸", DayArgs(ClosingFake.DayText, "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"name\":\"x\"}") };
    }

    [Theory(DisplayName = "AC-3603.1 명령 표가 먼저 막는다(틀린 key·코드 수·코드 꼴·묶음 수·날짜 꼴·모르는 칸) → E-HELPER-BAD-MESSAGE 하나, 비트를 열지 않음")]
    [MemberData(nameof(TableRefuses))]
    public void TableRefusesBadArgs(string why, string args)
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", args);

        Assert.True(ErrorOf(outcome) == ErrorCodes.BadMessage, why);
        Assert.Empty(rig.Connector.Opened);
        Assert.Equal(("closing.day", (string?)ErrorCodes.BadMessage), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-3603.1 closing.codes에 칸이 하나라도 있으면 E-HELPER-BAD-MESSAGE, 비트를 열지 않음")]
    public void CodesTakesNoArgs()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.codes", "{\"date\":\"2026-11-09\"}");

        Assert.Equal(ErrorCodes.BadMessage, ErrorOf(outcome));
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-3603.1 9999-12-31은 명령 표를 지나도 도우미가 멈추지 않고 E-HELPER-BAD-MESSAGE 하나, 마감 문장은 돌리지 않음")]
    public void LastDateIsOneError()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", DayArgs("9999-12-31", G("carm", "CARM1")));

        Assert.Equal(ErrorCodes.BadMessage, ErrorOf(outcome));
        Assert.DoesNotContain(rig.Session.Sqls, ReadStatements().Contains);
        Assert.Equal(rig.Connector.Opened.Count, rig.Session.Disposed);
    }

    // ---- 부른 쪽(AC-3601.3) ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3601.3 기존 도우미(웹 명령 표)는 closing.*를 모른다: 처리기를 붙일 수 없고 부르면 E-HELPER-UNKNOWN-COMMAND, 비트를 열지 않음")]
    public void WebCannotCallClosing()
    {
        using var rig = Ready();

        Assert.Throws<ArgumentException>(() => ClosingCommands.Register(new Dispatcher(WebTable), rig.Services));
        Assert.Equal(ErrorCodes.UnknownCommand, ErrorOf(HandleWeb(rig, "closing.day", Usual)));
        Assert.Equal(ErrorCodes.UnknownCommand, ErrorOf(HandleWeb(rig, "closing.codes", "{}")));
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-3601.3 ERP 도우미에 revenue.days·hello·claim.month를 부르면 E-HELPER-UNKNOWN-COMMAND, 비트를 열지 않음")]
    public void ErpCannotCallWebCommands()
    {
        using var rig = Ready();

        Assert.Equal(ErrorCodes.UnknownCommand, ErrorOf(Handle(rig, "revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}")));
        Assert.Equal(ErrorCodes.UnknownCommand, ErrorOf(Handle(rig, "hello", "{}")));
        Assert.Equal(ErrorCodes.UnknownCommand, ErrorOf(Handle(rig, "claim.month", "{\"month\":\"2026-10\"}")));
        Assert.Empty(rig.Connector.Opened);
    }

    // ---- 막힘·기록(AC-3606.3) ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.3 등록 안 된 PC는 두 명령 모두 revenue.days와 같은 번호(E-BIT-NOT-REGISTERED)로 막히고 비트를 열지 않음")]
    public void NotRegisteredLikeRevenue()
    {
        using var rig = new Rig();
        ClosingFake.Quiet(rig.Session);

        var revenue = ErrorOf(HandleWeb(rig, "revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}"));
        Assert.Equal("E-BIT-NOT-REGISTERED", revenue);
        Assert.Equal(revenue, ErrorOf(Handle(rig, "closing.day", Usual)));
        Assert.Equal(revenue, ErrorOf(Handle(rig, "closing.codes", "{}")));
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-3606.3 등록과 다른 병원이면 두 명령 모두 revenue.days와 같은 번호(E-BIT-HOSPITAL-MISMATCH), 읽기 문장은 돌리지 않고 세션은 닫음")]
    public void HospitalMismatchLikeRevenue()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        ClosingFake.Quiet(rig.Session);

        var revenue = ErrorOf(HandleWeb(rig, "revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}"));
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", revenue);
        Assert.Equal(revenue, ErrorOf(Handle(rig, "closing.day", Usual)));
        Assert.Equal(revenue, ErrorOf(Handle(rig, "closing.codes", "{}")));
        Assert.DoesNotContain(rig.Session.Sqls, ReadStatements().Contains);
        Assert.Equal(3, rig.Session.Disposed);
    }

    public static IEnumerable<object?[]> LoggedRuns()
    {
        yield return new object?[] { "closing.day", null, null };
        yield return new object?[] { "closing.codes", null, null };
        yield return new object?[] { "closing.day", ClosingSql.DayVisitsSql, BitErrors.ReadFailed };
        yield return new object?[] { "closing.day", RevenueSql.FinanceNormal, BitErrors.ReadFailed };
        yield return new object?[] { "closing.codes", Sql.TrendTotalsSql, BitErrors.ReadFailed };
        yield return new object?[] { "closing.codes", ClosingSql.MemoKindsSql, BitErrors.ReadFailed };
    }

    [Theory(DisplayName = "AC-3606.3 성공·실패 모두 진단 기록은 (명령 이름, 오류 번호) 한 줄뿐이고 기록 글은 '시각 명령이름 오류번호' 세 토막, 실패면 일부 없이 error 하나·세션 닫음")]
    [MemberData(nameof(LoggedRuns))]
    public void LogHasOnlyNameAndCode(string cmd, string? failing, string? code)
    {
        using var rig = Ready();
        if (failing != null) rig.Session.Fail(failing, code!);
        var outcome = Handle(rig, cmd, cmd == "closing.day" ? Usual : "{}");

        if (code == null) One(outcome, "result");
        else Assert.Equal(code, ErrorOf(outcome));
        Assert.Equal(1, rig.Session.Disposed);

        var (name, logged) = Assert.Single(outcome.Log);
        Assert.Equal(cmd, name);
        Assert.Equal(code, logged);
        // ERP 도우미 기록 줄(ErpLogLine: 기존 LogLine과 같은 모양, 명령 이름은 ERP 명령 표로 본다)
        var line = ErpLogLine.Format(new DateTimeOffset(2026, 11, 10, 9, 0, 0, TimeSpan.FromHours(9)), name, logged);
        Assert.Equal(new[] { "2026-11-10T09:00:00.000+09:00", cmd, code ?? "-" }, line.Split(' '));
        Assert.DoesNotContain(Fake.Chart, line);
        Assert.DoesNotContain(Fake.Name, line);
    }

    // ---- 답에는 숫자만(AC-3606.2) --------------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.2 두 명령의 답은 봉투 {v, id, type, data}에 design.md 2절 칸만 있고, DB 줄에 섞인 차트번호·이름·생년월일이 어디에도 없다")]
    public void RepliesHaveOnlyNumbers()
    {
        using var rig = Ready();
        var day = Handle(rig, "closing.day", Usual);
        var codes = Handle(rig, "closing.codes", "{}");

        foreach (var outcome in new[] { day, codes })
        {
            Assert.Equal(new[] { "v", "id", "type", "data" }, Json.Keys(One(outcome, "result")));
            Assert.DoesNotContain(Fake.Chart, outcome.Text);
            Assert.DoesNotContain(Fake.Name, outcome.Text);
            Assert.DoesNotContain(BirthDate, outcome.Text);
            Assert.DoesNotContain("V001", outcome.Text);
        }

        Assert.Equal(
            ClosingFake.Sorted("date", "patients", "groups", "ages", "money", "inpatientVisits", "reservations", "injection", "warnings"),
            ClosingFake.Keys(One(day, "result").GetProperty("data")));
        var codeData = One(codes, "result").GetProperty("data");
        Assert.Equal(ClosingFake.Sorted("codes", "kinds"), ClosingFake.Keys(codeData));
        Assert.All(codeData.GetProperty("codes").EnumerateArray(), code => Assert.Equal(ClosingFake.Sorted("code", "name", "visits"), ClosingFake.Keys(code)));
        Assert.All(codeData.GetProperty("kinds").EnumerateArray(), kind => Assert.Equal(ClosingFake.Sorted("kind", "name"), ClosingFake.Keys(kind)));
    }
}
