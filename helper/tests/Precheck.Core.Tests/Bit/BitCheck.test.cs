using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-005.7 bit.check: 단계 find(비트 찾기) → db(DB 읽기) → registration(등록 확인)을 {name, ok, code?}로.
/// 실패한 단계 뒤는 모두 ok:false와 그 번호. 등록됐으면 병원 이름·기관기호도.
/// </summary>
public class BitCheckTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static string[] Steps(BitCheckResult result) =>
        result.Steps.Select(step => step.Name + ":" + (step.Ok ? "ok" : step.Code)).ToArray();

    private static JsonElement Reply(Rig rig, string cmd = "bit.check")
    {
        var dispatcher = new Dispatcher(Table);
        BitCommands.Register(dispatcher, rig.Services);
        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, "{}", id: "c-1")), sink);
        return Assert.Single(sink.Replies);
    }

    [Fact(DisplayName = "AC-005.7 모두 되면 세 단계 ok, 등록한 병원 이름·기관기호를 준다")]
    public void AllStepsPass()
    {
        using var rig = new Rig().Registered();
        var result = BitCheck.Run(rig.Services);

        Assert.Equal(new[] { "find:ok", "db:ok", "registration:ok" }, Steps(result));
        Assert.True(result.Registered);
        Assert.Equal(Synthetic.Scope, result.HospitalName);
        Assert.Equal(Synthetic.Institution, result.InstitutionCode);
        Assert.Equal(new[] { Synthetic.Root }, rig.Connector.Opened);
        Assert.Equal(1, rig.Session.Disposed);
        Assert.All(rig.Session.Sqls, sql => Assert.Contains(sql, Sql.All));
    }

    [Fact(DisplayName = "AC-005.7 비트를 못 찾으면 find부터 모두 ok:false·E-BIT-NOT-FOUND(DB를 열지 않음)")]
    public void FindFails()
    {
        using var rig = new Rig();
        rig.Locator.FailCode = BitErrors.NotFound;
        var result = BitCheck.Run(rig.Services);

        Assert.Equal(new[] { "find:E-BIT-NOT-FOUND", "db:E-BIT-NOT-FOUND", "registration:E-BIT-NOT-FOUND" }, Steps(result));
        Assert.All(result.Steps, step => Assert.False(step.Ok));
        Assert.False(result.Registered);
        Assert.Null(result.HospitalName);
        Assert.Null(result.InstitutionCode);
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-005.7 DB에 못 붙으면 db부터 E-BIT-DB-FAILED, 읽기가 실패하면 E-BIT-READ-FAILED")]
    public void DbFails()
    {
        using (var rig = new Rig())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            Assert.Equal(new[] { "find:ok", "db:E-BIT-DB-FAILED", "registration:E-BIT-DB-FAILED" }, Steps(BitCheck.Run(rig.Services)));
        }

        using (var rig = new Rig().Registered())
        {
            rig.Session.Fail(Sql.ScopesSql, BitErrors.ReadFailed);
            var result = BitCheck.Run(rig.Services);
            Assert.Equal(new[] { "find:ok", "db:E-BIT-READ-FAILED", "registration:E-BIT-READ-FAILED" }, Steps(result));
            Assert.Equal(1, rig.Session.Disposed);
            // 등록 파일은 있으므로 등록 정보는 준다(설치 화면이 [다시 등록]·안내를 고른다)
            Assert.True(result.Registered);
        }
    }

    [Fact(DisplayName = "AC-005.7 등록이 없으면 registration만 ok:false·E-BIT-NOT-REGISTERED, registered:false")]
    public void NotRegistered()
    {
        using var rig = new Rig();
        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:ok", "registration:E-BIT-NOT-REGISTERED" }, Steps(result));
        Assert.False(result.Registered);
        Assert.Null(result.HospitalName);
    }

    [Fact(DisplayName = "AC-005.7 다른 병원이면 registration만 ok:false·E-BIT-HOSPITAL-MISMATCH, 등록 정보는 준다")]
    public void Mismatch()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:ok", "registration:E-BIT-HOSPITAL-MISMATCH" }, Steps(result));
        Assert.True(result.Registered);
        Assert.Equal(Synthetic.OtherInstitution, result.InstitutionCode);
    }

    [Fact(DisplayName = "AC-005.7 bit.check 답은 result {steps:[{name, ok, code?}], registered, hospitalName?, institutionCode?}")]
    public void ReplyShape()
    {
        using (var rig = new Rig().Registered())
        {
            var reply = Reply(rig);
            Assert.Equal("result", reply.GetProperty("type").GetString());
            var data = reply.GetProperty("data");
            Assert.Equal(new[] { "steps", "registered", "hospitalName", "institutionCode" }, Json.Keys(data));
            var steps = data.GetProperty("steps").EnumerateArray().ToArray();
            Assert.Equal(new[] { "find", "db", "registration" }, steps.Select(s => s.GetProperty("name").GetString()));
            Assert.All(steps, s => Assert.Equal(new[] { "name", "ok" }, Json.Keys(s)));
            Assert.All(steps, s => Assert.True(s.GetProperty("ok").GetBoolean()));
            Assert.True(data.GetProperty("registered").GetBoolean());
            Assert.Equal(Synthetic.Institution, data.GetProperty("institutionCode").GetString());
        }

        using (var rig = new Rig())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            var data = Reply(rig).GetProperty("data");
            Assert.Equal(new[] { "steps", "registered" }, Json.Keys(data));
            var steps = data.GetProperty("steps").EnumerateArray().ToArray();
            Assert.Equal(new[] { "name", "ok" }, Json.Keys(steps[0]));
            Assert.Equal(new[] { "name", "ok", "code" }, Json.Keys(steps[1]));
            Assert.False(steps[2].GetProperty("ok").GetBoolean());
            Assert.Equal("E-BIT-DB-FAILED", steps[2].GetProperty("code").GetString());
            Assert.False(data.GetProperty("registered").GetBoolean());
        }
    }
}
