using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Revenue;

/// <summary>revenue.days 처리기: 관문 → 읽기 → result 하나. 실패면 error 하나(AC-003.6). 답·기록에 환자 글자 없음(AC-003.7).</summary>
public class RevenueCommandsTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static readonly string[] DayKeys =
    {
        "date", "visits", "newPatients", "returnVisits",
        "total", "insurer", "noncovered", "copay", "otherTotal", "cash", "card", "transfer", "receivableIn",
        "unconfirmed", "splitUnconfirmed",
    };

    private static readonly string[] MoneyKeys = { "total", "insurer", "noncovered", "copay", "otherTotal", "cash", "card", "transfer", "receivableIn" };

    private static readonly string[] SplitKeys = { "insurer", "noncovered", "copay", "otherTotal" };

    private static readonly string[] RemainingKeys = { "total", "cash", "card", "transfer", "receivableIn" };

    private sealed class Outcome
    {
        public ListSink Sink { get; } = new ListSink();

        public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();

        public string Text => string.Concat(Sink.Messages.Select(Encoding.UTF8.GetString));
    }

    private static Outcome Handle(Rig rig, string from = "2026-10-30", string to = "2026-11-01")
    {
        var outcome = new Outcome();
        var dispatcher = new Dispatcher(Table, (name, code) => outcome.Log.Add((name, code)));
        RevenueCommands.Register(dispatcher, rig.Services);
        var args = "{\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("revenue.days", args)), outcome.Sink);
        return outcome;
    }

    private static Rig Ready()
    {
        var rig = new Rig().Registered();
        RevenueFake.Quiet(rig.Session);
        return rig;
    }

    private static void AssertOneError(Outcome outcome, string code)
    {
        var reply = Assert.Single(outcome.Sink.Replies);
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        Assert.Equal(code, reply.GetProperty("code").GetString());
    }

    [Fact(DisplayName = "AC-003.1 처리기 맨 처음에 등록 확인 관문을 지나고, 등록 범위로 읽는다")]
    public void GateComesFirst()
    {
        using var rig = Ready();
        var outcome = Handle(rig);

        Assert.Equal("result", Assert.Single(outcome.Sink.Replies).GetProperty("type").GetString());
        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, RevenueSql.HistoryGuard }, rig.Session.Sqls.Take(3));
        Assert.All(rig.Session.Calls.Skip(3).Where(call => call.Args.ContainsKey("@hospital")), call => Assert.Equal(Synthetic.Scope, call.Args["@hospital"]));
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-003.6 등록 안 됨이면 비트를 열지 않고 E-BIT-NOT-REGISTERED 오류 답 하나")]
    public void NotRegistered()
    {
        using var rig = new Rig();
        var outcome = Handle(rig);

        AssertOneError(outcome, "E-BIT-NOT-REGISTERED");
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-003.6 등록과 다른 병원이면 매출 문장을 돌리지 않고 E-BIT-HOSPITAL-MISMATCH 오류 답 하나")]
    public void HospitalMismatch()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        RevenueFake.Quiet(rig.Session);
        var outcome = Handle(rig);

        AssertOneError(outcome, "E-BIT-HOSPITAL-MISMATCH");
        Assert.DoesNotContain(rig.Session.Sqls, RevenueSql.Parameters.ContainsKey);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-003.6 둘째 날 읽기 실패·시간 초과면 결과 없이 E-BIT-READ-FAILED 오류 답 하나, 세션은 닫음")]
    public void ReadFailureIsOneError()
    {
        using var rig = Ready();
        rig.Session.Answer(RevenueSql.Patients, args =>
            (string)args["@from"]! == "202610310000" ? throw new BitException(BitErrors.ReadFailed) : new[] { new object?[] { 10L, 3L, 0L, 0L, 0L } });
        var outcome = Handle(rig);

        AssertOneError(outcome, "E-BIT-READ-FAILED");
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Theory(DisplayName = "AC-003.6 to가 9999-12-31이면 명령 표를 지나도 도우미가 멈추지 않고 E-HELPER-BAD-MESSAGE 오류 답 하나, 매출 문장은 돌리지 않음")]
    [InlineData("9999-12-31", "9999-12-31")]
    [InlineData("9999-12-01", "9999-12-31")]
    public void LastDateIsOneError(string from, string to)
    {
        using var rig = Ready();
        var outcome = Handle(rig, from, to);

        AssertOneError(outcome, "E-HELPER-BAD-MESSAGE");
        Assert.DoesNotContain(rig.Session.Sqls, RevenueSql.Parameters.ContainsKey);
        Assert.Equal(1, rig.Session.Disposed);
        Assert.Equal(("revenue.days", (string?)"E-HELPER-BAD-MESSAGE"), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-003.6 명령 표가 32일 기간을 먼저 막는다(E-HELPER-BAD-MESSAGE, 비트를 열지 않음)")]
    public void TableRefusesLongPeriod()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "2026-10-01", "2026-11-01");

        AssertOneError(outcome, "E-HELPER-BAD-MESSAGE");
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-003.7 AC-4101.1 AC-4405.1 AC-6912.6 답의 칸은 AC-002.2와 같다: {days, codes, dayCodes}, 날 줄 15칸(금액이 음수라 확인 필요한 날만 roughTotal을 더해 16칸), 코드 줄 4칸, 칸 이름 camelCase, null 그대로")]
    public void ReplyHasExactFields()
    {
        using var rig = Ready();
        RevenueFake.RowOn(rig.Session, RevenueSql.FinanceNormal, "20261031", RevenueFake.NegativeCash, RevenueFake.Normal);
        RevenueFake.Codes(rig.Session,
            RevenueFake.Code("도수", 4, 12345.67m, name: "도수치료"),
            RevenueFake.Code("NONAME", 1, null, missing: 1));
        var reply = Assert.Single(Handle(rig).Sink.Replies);

        Assert.Equal(new[] { "v", "id", "type", "data" }, Json.Keys(reply));
        var data = reply.GetProperty("data");
        Assert.Equal(new[] { "days", "codes", "dayCodes" }, Json.Keys(data));

        var days = data.GetProperty("days").EnumerateArray().ToArray();
        Assert.Equal(3, days.Length);
        Assert.Equal(DayKeys, Json.Keys(days[0]));
        Assert.Equal(DayKeys.Append("roughTotal"), Json.Keys(days[1]));
        Assert.Equal(DayKeys, Json.Keys(days[2]));
        Assert.Equal(RevenueFake.Rough, days[1].GetProperty("roughTotal").GetInt64());
        Assert.Equal("2026-10-30", days[0].GetProperty("date").GetString());
        Assert.Equal(1050000, days[0].GetProperty("total").GetInt64());
        Assert.False(days[0].GetProperty("unconfirmed").GetBoolean());
        Assert.False(days[0].GetProperty("splitUnconfirmed").GetBoolean());
        Assert.True(days[1].GetProperty("unconfirmed").GetBoolean());
        Assert.False(days[1].GetProperty("splitUnconfirmed").GetBoolean());
        Assert.All(MoneyKeys, key => Assert.Equal(JsonValueKind.Null, days[1].GetProperty(key).ValueKind));
        Assert.Equal(10, days[1].GetProperty("visits").GetInt64());

        var codes = data.GetProperty("codes").EnumerateArray().ToArray();
        Assert.All(codes, code => Assert.Equal(new[] { "code", "name", "count", "amount" }, Json.Keys(code)));
        Assert.Equal("도수", codes[0].GetProperty("code").GetString());
        Assert.Equal("도수치료", codes[0].GetProperty("name").GetString());
        Assert.Equal(4, codes[0].GetProperty("count").GetInt64());
        Assert.Equal(12345, codes[0].GetProperty("amount").GetInt64());
        Assert.Equal(JsonValueKind.Null, codes[1].GetProperty("name").ValueKind);
        Assert.Equal(JsonValueKind.Null, codes[1].GetProperty("amount").ValueKind);
    }

    [Fact(DisplayName = "AC-003.7 AC-4405.2 splitUnconfirmed인 날의 답: 나눔 네 칸만 null, 남는 다섯 칸은 숫자, unconfirmed는 거짓, roughTotal 열쇠 없음")]
    public void SplitDayReply()
    {
        using var rig = Ready();
        RevenueFake.RowOn(rig.Session, RevenueSql.FinanceNormalExtra, "20261031", new object?[] { 450001m, 150000m }, RevenueFake.NormalExtra);
        var reply = Assert.Single(Handle(rig).Sink.Replies);
        var days = reply.GetProperty("data").GetProperty("days").EnumerateArray().ToArray();

        Assert.All(days, day => Assert.Equal(DayKeys, Json.Keys(day)));
        Assert.True(days[1].GetProperty("splitUnconfirmed").GetBoolean());
        Assert.False(days[1].GetProperty("unconfirmed").GetBoolean());
        Assert.All(SplitKeys, key => Assert.Equal(JsonValueKind.Null, days[1].GetProperty(key).ValueKind));
        Assert.All(RemainingKeys, key => Assert.Equal(JsonValueKind.Number, days[1].GetProperty(key).ValueKind));
        Assert.False(days[0].GetProperty("splitUnconfirmed").GetBoolean());
        Assert.All(MoneyKeys, key => Assert.Equal(JsonValueKind.Number, days[0].GetProperty(key).ValueKind));
    }

    [Fact(DisplayName = "AC-6912.1 AC-6912.6 세 검사에 걸리던 날(가짜 DB가 세 검사에 1을 답함)의 답도 보통 날과 같다: 날 줄 15칸, 금액 아홉 칸 숫자, unconfirmed·splitUnconfirmed 거짓, roughTotal 열쇠 없음")]
    public void CaughtDayReplyIsPlain()
    {
        using var rig = Ready();
        RevenueFake.ChecksCaught(rig.Session);
        var reply = Assert.Single(Handle(rig).Sink.Replies);
        var days = reply.GetProperty("data").GetProperty("days").EnumerateArray().ToArray();

        Assert.Equal(3, days.Length);
        Assert.All(days, day =>
        {
            Assert.Equal(DayKeys, Json.Keys(day));
            Assert.False(day.GetProperty("unconfirmed").GetBoolean());
            Assert.False(day.GetProperty("splitUnconfirmed").GetBoolean());
            Assert.All(MoneyKeys, key => Assert.Equal(JsonValueKind.Number, day.GetProperty(key).ValueKind));
            Assert.Equal(1050000, day.GetProperty("total").GetInt64());
        });
        Assert.DoesNotContain(rig.Session.Sqls, RevenueFake.Checks.Contains);
    }

    [Fact(DisplayName = "AC-003.7 가짜 DB가 준 가짜 차트번호·이름이 답·진단 기록 어디에도 없다")]
    public void NoPatientTextAnywhere()
    {
        using var rig = Ready();
        // 뒤쪽 칸에 환자 글자가 섞여 와도 읽는 칸만 본다
        RevenueFake.Row(rig.Session, RevenueSql.Patients, 10L, 3L, 0L, 0L, 0L, Fake.Chart, Fake.Name);
        RevenueFake.Row(rig.Session, RevenueSql.FinanceNormal, 1000000m, 300000m, 400000m, 200000m, 300000m, 100000m, Fake.Chart);
        RevenueFake.Row(rig.Session, RevenueSql.FinanceReceivableExtra, 15000m, 5000m, Fake.Name);
        var outcome = Handle(rig);

        Assert.Equal("result", Assert.Single(outcome.Sink.Replies).GetProperty("type").GetString());
        Assert.DoesNotContain(Fake.Chart, outcome.Text);
        Assert.DoesNotContain(Fake.Name, outcome.Text);
        Assert.Equal(("revenue.days", (string?)null), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-003.7 실패해도 진단 기록에는 명령 이름과 오류 번호만 남는다")]
    public void FailureLogHasOnlyNameAndCode()
    {
        using var rig = Ready();
        rig.Session.Fail(RevenueSql.Patients, BitErrors.ReadFailed);
        var outcome = Handle(rig);

        Assert.Equal(("revenue.days", (string?)"E-BIT-READ-FAILED"), Assert.Single(outcome.Log));
        Assert.DoesNotContain(Fake.Chart, outcome.Text);
    }

    [Fact(DisplayName = "AC-003.5 짝 없는 대리쌍·제어 문자가 든 이름도 답을 깨지 않는다(도우미가 죽지 않음)")]
    public void BrokenNamesStillSerialize()
    {
        using var rig = Ready();
        RevenueFake.Codes(rig.Session, RevenueFake.Code("LONE", 1, 1m, name: "도수\uD83D\n치료"));
        var reply = Assert.Single(Handle(rig).Sink.Replies);

        Assert.Equal("result", reply.GetProperty("type").GetString());
        var code = Assert.Single(reply.GetProperty("data").GetProperty("codes").EnumerateArray().ToArray());
        Assert.Equal("도수 치료", code.GetProperty("name").GetString());
    }

    // ---- AC-4101 날마다 처방별 금액(dayCodes) ---------------------------------------------------------

    [Fact(DisplayName = "AC-4101.1 답 JSON은 {\"days\":…,\"codes\":…,\"dayCodes\":[[\"2026-10-01\",\"MM101\",3,45000],…]} 모양: 줄마다 [날짜, 코드, 건수, 금액|null], 날짜·코드 차례")]
    public void DayCodesReplyShape()
    {
        using var rig = Ready();
        RevenueFake.Codes(rig.Session, RevenueFake.Code("MM101", 4, 46200.9m, name: "가상 처방"));
        RevenueFake.DayCodes(rig.Session,
            RevenueFake.DayCode("20261002", "MM101", 1, 1200.9m),
            RevenueFake.DayCode("20261001", "MM101", 3, 45000.4m),
            RevenueFake.DayCode("20261001", "CARM1", 2, null, missing: 1));
        var outcome = Handle(rig, "2026-10-01", "2026-10-02");
        var data = Assert.Single(outcome.Sink.Replies).GetProperty("data");

        Assert.Equal(new[] { "days", "codes", "dayCodes" }, Json.Keys(data));
        Assert.Equal("[[\"2026-10-01\",\"CARM1\",2,null],[\"2026-10-01\",\"MM101\",3,45000],[\"2026-10-02\",\"MM101\",1,1200]]", data.GetProperty("dayCodes").GetRawText());
        Assert.StartsWith("{\"days\":[{\"date\":\"2026-10-01\"", data.GetRawText(), System.StringComparison.Ordinal);
        Assert.Contains("],\"codes\":[{\"code\":\"MM101\",\"name\":\"가상 처방\",\"count\":4,\"amount\":46200}],\"dayCodes\":[[", data.GetRawText(), System.StringComparison.Ordinal);
        Assert.Equal(("revenue.days", (string?)null), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-4101.2 날 단위 답의 뒤쪽 칸에 가짜 차트번호·이름이 섞여 와도 읽는 다섯 칸만 보고 답·진단 기록에 없다")]
    public void DayCodesCarryNoPatientText()
    {
        using var rig = Ready();
        RevenueFake.DayCodes(rig.Session, new object?[] { "20261030", "MM101", 1L, 100m, 0L, Fake.Chart, Fake.Name });
        var outcome = Handle(rig);

        Assert.Equal("result", Assert.Single(outcome.Sink.Replies).GetProperty("type").GetString());
        Assert.DoesNotContain(Fake.Chart, outcome.Text);
        Assert.DoesNotContain(Fake.Name, outcome.Text);
    }

    [Fact(DisplayName = "AC-4101.4 날 단위 문장(CodeAmountsByDay)이 실패하면 days·codes도 보내지 않고 E-BIT-READ-FAILED 오류 답 하나, 세션은 닫음")]
    public void DayCodesFailureIsOneError()
    {
        using var rig = Ready();
        RevenueFake.Codes(rig.Session, RevenueFake.Code("MM101", 1, 1m));
        rig.Session.Fail(RevenueSql.CodeAmountsByDay, BitErrors.ReadFailed);
        var outcome = Handle(rig);

        AssertOneError(outcome, "E-BIT-READ-FAILED");
        Assert.DoesNotContain("\"days\"", outcome.Text);
        Assert.Equal(1, rig.Session.Disposed);
        Assert.Equal(("revenue.days", (string?)"E-BIT-READ-FAILED"), Assert.Single(outcome.Log));
    }

    [Fact(DisplayName = "AC-4101.5 AC-4405.3 AC-6912.6 도우미 판은 0.13.1이고 명령 표의 revenue.days는 그대로다(새 명령·새 인자 없음: from·to 날짜, 31일, 환자 아님)")]
    public void VersionAndCommandTableStay()
    {
        Assert.Equal("0.13.1", HelperVersion.Value);

        using var table = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        var commands = table.RootElement.GetProperty("commands");
        Assert.Equal(13, commands.EnumerateObject().Count());
        Assert.Equal(
            "{\"patient\":false,\"maxDays\":31,\"args\":{\"from\":{\"type\":\"date\"},\"to\":{\"type\":\"date\"}}}",
            JsonSerializer.Serialize(commands.GetProperty("revenue.days")));
        Assert.Equal(1, table.RootElement.GetProperty("protocol").GetInt32());
    }

    [Fact(DisplayName = "AC-6912.6 도우미 판은 0.13.1이고 revenue.days 답의 칸 이름은 그대로다: {days, codes, dayCodes}, 날 줄 15칸, 코드 줄 4칸(새 칸 없음), 명령 13개·protocol 1")]
    public void VersionAndReplyKeysStay()
    {
        Assert.Equal("0.13.1", HelperVersion.Value);

        using var rig = Ready();
        RevenueFake.Codes(rig.Session, RevenueFake.Code("MM101", 1, 1m, name: "가상 처방"));
        var data = Assert.Single(Handle(rig).Sink.Replies).GetProperty("data");
        Assert.Equal(new[] { "days", "codes", "dayCodes" }, Json.Keys(data));
        Assert.All(data.GetProperty("days").EnumerateArray(), day => Assert.Equal(DayKeys, Json.Keys(day)));
        Assert.All(data.GetProperty("codes").EnumerateArray(), code => Assert.Equal(new[] { "code", "name", "count", "amount" }, Json.Keys(code)));

        using var table = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        Assert.Equal(13, table.RootElement.GetProperty("commands").EnumerateObject().Count());
        Assert.Equal(1, table.RootElement.GetProperty("protocol").GetInt32());
    }

    // ---- AC-4405 확인 필요한 날의 참고 금액(roughTotal)·판 0.7.0 ------------------------------------------

    [Fact(DisplayName = "AC-4405.2 AC-6912.2 답 JSON: 금액이 음수라 확인 필요한 날 줄 끝에만 \"roughTotal\":정수(음수 그대로)가 붙고 확인된 날 줄에는 열쇠가 없다, 다른 칸·차례는 그대로")]
    public void RoughTotalReplyShape()
    {
        using var rig = Ready();
        RevenueFake.RowOn(rig.Session, RevenueSql.FinanceNormal, "20261030", RevenueFake.NegativeCash, RevenueFake.Normal);
        RevenueFake.RoughRows(rig.Session, new[] { RevenueFake.RoughLine("D001", 1000.9m) }, new[] { RevenueFake.RoughLine("D002", -3000.9m) });
        var days = Assert.Single(Handle(rig, "2026-10-30", "2026-10-31").Sink.Replies).GetProperty("data").GetProperty("days").EnumerateArray().ToArray();

        Assert.Equal(
            "{\"date\":\"2026-10-30\",\"visits\":10,\"newPatients\":3,\"returnVisits\":7,\"total\":null,\"insurer\":null,\"noncovered\":null,\"copay\":null,"
            + "\"otherTotal\":null,\"cash\":null,\"card\":null,\"transfer\":null,\"receivableIn\":null,\"unconfirmed\":true,\"splitUnconfirmed\":false,\"roughTotal\":-2000}",
            days[0].GetRawText());
        Assert.Equal(JsonValueKind.Number, days[0].GetProperty("roughTotal").ValueKind);
        Assert.False(days[1].TryGetProperty("roughTotal", out _));
        Assert.Equal(DayKeys, Json.Keys(days[1]));
    }

    [Fact(DisplayName = "AC-4405.3 AC-6912.6 판은 0.13.1이고 명령 목록은 그대로다(명령 13개·protocol 1, stats.rows·revenue.days 새 인자 없음)")]
    public void VersionIsZeroSevenAndCommandsStay()
    {
        Assert.Equal("0.13.1", HelperVersion.Value);

        using var table = JsonDocument.Parse(CommandTable.EmbeddedBytes());
        var commands = table.RootElement.GetProperty("commands");
        Assert.Equal(13, commands.EnumerateObject().Count());
        Assert.True(commands.TryGetProperty("stats.rows", out _));
        Assert.True(commands.TryGetProperty("revenue.days", out _));
        Assert.Equal(1, table.RootElement.GetProperty("protocol").GetInt32());
    }
}
