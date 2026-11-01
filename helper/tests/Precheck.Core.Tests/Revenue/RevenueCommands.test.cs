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
        "date", "visits", "newPatients", "returnVisits", "patientsToDate",
        "total", "insurer", "noncovered", "copay", "otherTotal", "cash", "card", "transfer", "receivableIn",
        "unconfirmed",
    };

    private static readonly string[] MoneyKeys = { "total", "insurer", "noncovered", "copay", "otherTotal", "cash", "card", "transfer", "receivableIn" };

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

    [Fact(DisplayName = "AC-003.6 명령 표가 32일 기간을 먼저 막는다(E-HELPER-BAD-MESSAGE, 비트를 열지 않음)")]
    public void TableRefusesLongPeriod()
    {
        using var rig = Ready();
        var outcome = Handle(rig, "2026-10-01", "2026-11-01");

        AssertOneError(outcome, "E-HELPER-BAD-MESSAGE");
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-003.7 답의 칸은 AC-002.2와 같다: {days, codes}, 날 줄 15칸, 코드 줄 4칸, 칸 이름 camelCase, null 그대로")]
    public void ReplyHasExactFields()
    {
        using var rig = Ready();
        RevenueFake.RowOn(rig.Session, RevenueSql.UnsupportedFinance, "20261031", new object?[] { 1L }, new object?[] { 0L });
        RevenueFake.Codes(rig.Session,
            RevenueFake.Code("도수", 4, 12345.67m, name: "도수치료"),
            RevenueFake.Code("NONAME", 1, null, missing: 1));
        var reply = Assert.Single(Handle(rig).Sink.Replies);

        Assert.Equal(new[] { "v", "id", "type", "data" }, Json.Keys(reply));
        var data = reply.GetProperty("data");
        Assert.Equal(new[] { "days", "codes" }, Json.Keys(data));

        var days = data.GetProperty("days").EnumerateArray().ToArray();
        Assert.Equal(3, days.Length);
        Assert.All(days, day => Assert.Equal(DayKeys, Json.Keys(day)));
        Assert.Equal("2026-10-30", days[0].GetProperty("date").GetString());
        Assert.Equal(1050000, days[0].GetProperty("total").GetInt64());
        Assert.False(days[0].GetProperty("unconfirmed").GetBoolean());
        Assert.True(days[1].GetProperty("unconfirmed").GetBoolean());
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

    [Fact(DisplayName = "AC-003.7 가짜 DB가 준 가짜 차트번호·이름이 답·진단 기록 어디에도 없다")]
    public void NoPatientTextAnywhere()
    {
        using var rig = Ready();
        // 뒤쪽 칸에 환자 글자가 섞여 와도 읽는 칸만 본다
        RevenueFake.Row(rig.Session, RevenueSql.Patients, 10L, 3L, 0L, 0L, 0L, Fake.Chart, Fake.Name);
        RevenueFake.Row(rig.Session, RevenueSql.DistinctPatients, 8L, 0L, Fake.Chart);
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
}
