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

    /// <summary>도우미 PC 오늘: 마감 일자(2026-11-09) 다음 날. 마감 일자가 오늘보다 뒤면 E-CLOSING-FUTURE-DATE(TASK-16)라 시험 PC 날짜를 정해 둔다.</summary>
    private static readonly DateTime Today = ClosingFake.Day.AddDays(1);

    /// <summary>오늘보다 뒤 날짜 오류 번호(design.md 2절, TASK-16).</summary>
    private const string FutureDate = "E-CLOSING-FUTURE-DATE";

    /// <summary>CodeListSql 한 줄: 코드·진료 수·이름(TASK-16).</summary>
    private static object?[] CodeRow(string code, long visits, string? name, params object?[] extra) =>
        new object?[] { code, visits, name }.Concat(extra).ToArray();

    /// <summary>
    /// 등록된 PC. 그날 진료 둘: 신환 V001(씨암 줄 30,000) · 재진 V002(물리치료내원 AA222 줄 0 · 물리치료 MM010 두 줄 20,000).
    /// 처방 줄 뒤 칸은 금액(TASK-14). 줄 뒤쪽 칸에 가짜 차트번호·이름·생년월일이 섞여 와도 처리기는 읽는 칸만 본다.
    /// </summary>
    private static Rig Ready()
    {
        var rig = new Rig { Today = Today }.Registered();
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
        db.Answer(ClosingFake.CodeListSql, _ => new[]
        {
            CodeRow("CARM1", 12L, "C-arm 유도", Fake.Chart),
            CodeRow("sono1 ", 7L, "비급여초음파", Fake.Name),
        });
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

    /// <summary>등록 저장소 폴더의 파일 이름과 바이트(읽기만 해도 깨진 파일을 옆으로 옮기므로, 그대로면 닿지 않은 것이다).</summary>
    private static string[] StoreFiles(Rig rig) =>
        System.IO.Directory.GetFiles(rig.Folder).Select(file => System.IO.Path.GetFileName(file) + ":" + Convert.ToBase64String(System.IO.File.ReadAllBytes(file)))
            .OrderBy(name => name, StringComparer.Ordinal).ToArray();

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
        var list = Assert.Single(rig.Session.Calls, call => call.Sql == ClosingFake.CodeListSql);
        Assert.Equal("202611100000", list.Args["@to"]);
        Assert.Equal(Synthetic.Scope, list.Args["@hospital"]);
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
        yield return new object[] { "가운데 빈칸 두 칸", DayArgs(ClosingFake.DayText, G("carm", "CA  RM1")) };
        yield return new object[] { "가운데 탭", DayArgs(ClosingFake.DayText, G("carm", "CA\\tRM1")) };
        yield return new object[] { "앞 공백", DayArgs(ClosingFake.DayText, G("carm", " CARM1")) };
        yield return new object[] { "뒤 공백", DayArgs(ClosingFake.DayText, G("carm", "CARM1 ")) };
        yield return new object[] { "빈 코드", DayArgs(ClosingFake.DayText, G("carm", "")) };
        yield return new object[] { "묶음 20개", DayArgs(ClosingFake.DayText, all.Concat(new[] { G("carm", "X2") }).ToArray()) };
        yield return new object[] { "날짜 빗금", DayArgs("2026/11/09", G("carm", "CARM1")) };
        yield return new object[] { "없는 날", DayArgs("2026-11-31", G("carm", "CARM1")) };
        yield return new object[] { "날짜 붙여 씀", DayArgs("20261109", G("carm", "CARM1")) };
        yield return new object[] { "groups 없음", "{\"date\":\"2026-11-09\"}" };
        yield return new object[] { "모르는 칸", "{\"date\":\"2026-11-09\",\"groups\":[],\"chart\":\"" + Fake.Chart + "\"}" };
        yield return new object[] { "묶음에 모르는 칸", DayArgs(ClosingFake.DayText, "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"name\":\"x\"}") };
    }

    [Theory(DisplayName = "AC-3603.1 명령 표가 먼저 막는다(틀린 key·코드 수·코드 꼴(빈칸 두 칸·탭·앞뒤 공백)·묶음 수·날짜 꼴·모르는 칸) → E-HELPER-BAD-MESSAGE 하나, 비트를 열지 않음")]
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

    [Fact(DisplayName = "AC-3603.1 9999-12-31은 명령 표를 지나도 도우미가 멈추지 않고 오류 하나(오늘보다 뒤라 E-CLOSING-FUTURE-DATE), 마감 문장은 돌리지 않음")]
    public void LastDateIsOneError()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", DayArgs("9999-12-31", G("carm", "CARM1")));

        Assert.Equal(FutureDate, ErrorOf(outcome));
        Assert.DoesNotContain(rig.Session.Sqls, ReadStatements().Contains);
        Assert.Equal(rig.Connector.Opened.Count, rig.Session.Disposed);
    }

    // ---- 가운데 빈칸 코드·매출 규칙(AC-3603.5·AC-3604.6·AC-3604.7) ---------------------------------------

    /// <summary>JSON 글자(따옴표·이스케이프 포함). 탭 같은 글자도 이스케이프로 실린다.</summary>
    private static string J(string text) => JsonSerializer.Serialize(text);

    private static string Arr(params string[] items) => "[" + string.Join(",", items.Select(J)) + "]";

    /// <summary>매출 규칙 칸이 있는 묶음 JSON. null이면 그 칸을 넣지 않는다.</summary>
    private static string RuleG(string key, string[] codes, string[]? prefixes, string[]? amountCodes = null) =>
        "{\"key\":" + J(key) + ",\"codes\":" + Arr(codes)
        + (prefixes == null ? "" : ",\"amountPrefixes\":" + Arr(prefixes))
        + (amountCodes == null ? "" : ",\"amountCodes\":" + Arr(amountCodes)) + "}";

    /// <summary>
    /// 씨암·SONO가 함께 있는 진료 V001(LA358 213,800 · KK090 32,610 · 'PROLO C' 50,000)과 SONO만 V002(LA274 31,670).
    /// 처방 코드는 비트처럼 UPPER(RTRIM()) 글자로 온다.
    /// </summary>
    private static Rig RuleDay()
    {
        var rig = Ready();
        rig.Session.Answer(ClosingSql.DayCodesSql, _ => new[]
        {
            new object?[] { "V001", "CARM1", 1L, 0m },
            new object?[] { "V001", "SONO1", 1L, 0m },
            new object?[] { "V001", "LA358", 1L, 213800m },
            new object?[] { "V001", "KK090", 1L, 32610m },
            new object?[] { "V001", "PROLO C", 1L, 50000m },
            new object?[] { "V002", "SONO1", 1L, 0m },
            new object?[] { "V002", "LA274", 1L, 31670m },
        });
        return rig;
    }

    [Fact(DisplayName = "AC-3603.5 가운데 빈칸 코드('PROLO C')는 명령 표 pattern과 처리기를 지나 result 하나, 대문자로 견준다")]
    public void InnerSpaceCodeIsOneResult()
    {
        using var rig = RuleDay();
        var outcome = Handle(rig, "closing.day", DayArgs(ClosingFake.DayText, RuleG("manual", new[] { "PROLO C", "HYALU MINI" }, null)));

        var group = Assert.Single(One(outcome, "result").GetProperty("data").GetProperty("groups").EnumerateArray());
        Assert.Equal("manual", group.GetProperty("key").GetString());
        Assert.Equal(1, group.GetProperty("patients").GetInt64());
        Assert.Equal(50000, group.GetProperty("total").GetInt64());
        Assert.Equal(("closing.day", (string?)null), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-3604.6 매출 규칙 두 칸(소문자 → 대문자)을 읽어 total을 그 규칙으로, AC-3604.7 둘 다 규칙이면 overlap을 답에 싣는다")]
    public void RulesAreReadAndAnswered()
    {
        using var rig = RuleDay();
        var args = DayArgs(ClosingFake.DayText,
            RuleG("carm", new[] { "CARM1" }, new[] { "la" }, new string[0]),
            RuleG("sono", new[] { "SONO1" }, new[] { "LA" }, new[] { "kk090", "prolo c" }));
        var data = One(Handle(rig, "closing.day", args), "result").GetProperty("data");

        var groups = data.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(213800, groups[0].GetProperty("total").GetInt64());
        Assert.Equal(213800 + 32610 + 50000 + 31670, groups[1].GetProperty("total").GetInt64());
        var overlap = data.GetProperty("overlap");
        Assert.Equal(1, overlap.GetProperty("visits").GetInt64());
        Assert.Equal(213800, overlap.GetProperty("carm").GetInt64());
        Assert.Equal(213800 + 32610 + 50000, overlap.GetProperty("sono").GetInt64());
    }

    [Fact(DisplayName = "AC-3604.6 규칙 두 칸이 없으면 지금(TASK-14) 그대로이고 overlap은 null")]
    public void NoRulesKeepsCodeTotal()
    {
        using var rig = RuleDay();
        var data = One(Handle(rig, "closing.day", DayArgs(ClosingFake.DayText, G("carm", "CARM1"), G("sono", "SONO1"))), "result").GetProperty("data");

        Assert.All(data.GetProperty("groups").EnumerateArray(), group => Assert.Equal(0, group.GetProperty("total").GetInt64()));
        Assert.Equal(JsonValueKind.Null, data.GetProperty("overlap").ValueKind);
    }

    public static IEnumerable<object[]> TableRefusesRules()
    {
        var carm = new[] { "CARM1" };
        yield return new object[] { "앞글자 6개", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA", "KK", "A", "B", "C", "D" })) };
        yield return new object[] { "더 셀 코드 21개", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA" }, Enumerable.Range(0, 21).Select(i => "C" + i).ToArray())) };
        yield return new object[] { "빈 앞글자", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "" })) };
        yield return new object[] { "앞글자 빈칸", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "L A" })) };
        yield return new object[] { "앞글자 11자", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { new string('L', 11) })) };
        yield return new object[] { "빈 더 셀 코드", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA" }, new[] { "" })) };
        yield return new object[] { "더 셀 코드 빈칸 두 칸", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA" }, new[] { "PROLO  C" })) };
        yield return new object[] { "더 셀 코드 탭", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA" }, new[] { "PROLO\tC" })) };
        yield return new object[] { "더 셀 코드 앞 공백", DayArgs(ClosingFake.DayText, RuleG("carm", carm, new[] { "LA" }, new[] { " KK090" })) };
        yield return new object[] { "앞글자가 배열 아님", DayArgs(ClosingFake.DayText, "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"amountPrefixes\":\"LA\"}") };
        yield return new object[] { "앞글자 칸이 숫자", DayArgs(ClosingFake.DayText, "{\"key\":\"carm\",\"codes\":[\"CARM1\"],\"amountPrefixes\":[1]}") };
    }

    [Theory(DisplayName = "AC-3604.6 매출 규칙 칸이 틀리면(앞글자 6개·더 셀 코드 21개·빈 글자·빈칸·11자·탭·앞 공백·배열 아님) 명령 표가 E-HELPER-BAD-MESSAGE 하나, 비트를 열지 않음")]
    [MemberData(nameof(TableRefusesRules))]
    public void TableRefusesBadRules(string why, string args)
    {
        using var rig = Ready();
        var outcome = Handle(rig, "closing.day", args);

        Assert.True(ErrorOf(outcome) == ErrorCodes.BadMessage, why);
        Assert.Empty(rig.Connector.Opened);
        Assert.Equal(("closing.day", (string?)ErrorCodes.BadMessage), Assert.Single(outcome.Log));
    }

    // ---- 오늘 뒤 날짜(AC-3616.2·AC-3612.1, TASK-16) ------------------------------------------------------

    [Fact(DisplayName = "AC-3616.2 date가 services.Today()보다 하루 뒤면 E-CLOSING-FUTURE-DATE 하나: 등록 저장소·비트 설치 찾기·DB에 한 번도 닿지 않고 기록은 (closing.day, 번호)뿐")]
    public void FutureDateRefusedBeforeAnything()
    {
        using var rig = Ready();
        rig.Today = ClosingFake.Day.AddDays(-1);
        // 등록 파일을 깨 둔다: 저장소가 한 번이라도 읽었다면 E-STORE-…로 답하거나 깨진 파일을 옆으로 옮겼을 것이다
        System.IO.File.WriteAllBytes(rig.Store.FilePath, new byte[] { 1, 2, 3 });
        var before = StoreFiles(rig);

        var outcome = Handle(rig, "closing.day", Usual);

        Assert.Equal(FutureDate, ErrorOf(outcome));
        Assert.Equal(before, StoreFiles(rig));
        Assert.Equal(0, rig.Locator.Calls);
        Assert.Empty(rig.Connector.Opened);
        Assert.Empty(rig.Session.Calls);
        Assert.Equal(("closing.day", (string?)FutureDate), Assert.Single(outcome.Log));
        var line = ErpLogLine.Format(new DateTimeOffset(2026, 11, 10, 9, 0, 0, TimeSpan.FromHours(9)), "closing.day", FutureDate);
        Assert.Equal(new[] { "2026-11-10T09:00:00.000+09:00", "closing.day", FutureDate }, line.Split(' '));
    }

    [Fact(DisplayName = "AC-3616.2 등록 안 된 PC라도 오늘보다 뒤 날짜는 등록 확인보다 먼저 E-CLOSING-FUTURE-DATE, 날짜가 맞으면 지금처럼 E-BIT-NOT-REGISTERED")]
    public void FutureDateBeforeRegistration()
    {
        using var rig = new Rig { Today = ClosingFake.Day.AddDays(-1) };
        ClosingFake.Quiet(rig.Session);

        Assert.Equal(FutureDate, ErrorOf(Handle(rig, "closing.day", Usual)));
        rig.Today = ClosingFake.Day;
        Assert.Equal("E-BIT-NOT-REGISTERED", ErrorOf(Handle(rig, "closing.day", Usual)));
        Assert.Empty(rig.Connector.Opened);
    }

    public static IEnumerable<object[]> ReadableDays()
    {
        yield return new object[] { "오늘", ClosingFake.Day };
        yield return new object[] { "오늘 밤 11시 59분(시각은 보지 않음)", ClosingFake.Day.AddHours(23).AddMinutes(59) };
        yield return new object[] { "어제가 마감 일자", ClosingFake.Day.AddDays(1) };
        yield return new object[] { "한 달 뒤", ClosingFake.Day.AddDays(30) };
    }

    [Theory(DisplayName = "AC-3616.2 마감 일자가 오늘·어제·더 지난 날이면 그대로 읽어 result 하나(오늘 시각은 보지 않고 날짜만 견줌)")]
    [MemberData(nameof(ReadableDays))]
    public void TodayAndPastAreRead(string why, DateTime today)
    {
        using var rig = Ready();
        rig.Today = today;
        var outcome = Handle(rig, "closing.day", Usual);

        Assert.True(One(outcome, "result").GetProperty("data").GetProperty("date").GetString() == ClosingFake.DayText, why);
        Assert.Contains(ClosingSql.DayVisitsSql, rig.Session.Sqls);
        Assert.Equal(("closing.day", (string?)null), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-3616.2 오늘 밤 11시 59분이어도 다음 날 날짜는 E-CLOSING-FUTURE-DATE, closing.codes는 날짜 검사가 없다")]
    public void NextDayAtMidnightIsFuture()
    {
        using var rig = Ready();
        rig.Today = ClosingFake.Day.AddDays(-1).AddHours(23).AddMinutes(59);

        Assert.Equal(FutureDate, ErrorOf(Handle(rig, "closing.day", Usual)));
        Assert.Empty(rig.Connector.Opened);
        One(Handle(rig, "closing.codes", "{}"), "result");
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
        using var rig = new Rig { Today = Today };
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
        using var rig = new Rig { Today = Today }.Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
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
        yield return new object?[] { "closing.codes", ClosingFake.CodeListSql, BitErrors.ReadFailed };
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
            ClosingFake.Sorted("date", "patients", "groups", "ages", "money", "inpatientVisits", "reservations", "injection", "overlap", "warnings"),
            ClosingFake.Keys(One(day, "result").GetProperty("data")));
        var codeData = One(codes, "result").GetProperty("data");
        Assert.Equal(ClosingFake.Sorted("codes", "kinds"), ClosingFake.Keys(codeData));
        Assert.All(codeData.GetProperty("codes").EnumerateArray(), code => Assert.Equal(ClosingFake.Sorted("code", "name", "visits"), ClosingFake.Keys(code)));
        Assert.All(codeData.GetProperty("kinds").EnumerateArray(), kind => Assert.Equal(ClosingFake.Sorted("kind", "name"), ClosingFake.Keys(kind)));
    }
}
