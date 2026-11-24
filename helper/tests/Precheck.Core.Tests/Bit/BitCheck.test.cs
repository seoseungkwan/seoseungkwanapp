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
/// 실패한 단계 뒤는 모두 ok:false와 그 번호. 등록됐으면 기관기호도(병원 이름은 주지 않는다, AC-005.9).
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

    [Fact(DisplayName = "AC-005.7 모두 되면 세 단계 ok, 등록한 기관기호를 준다")]
    public void AllStepsPass()
    {
        using var rig = new Rig().Registered();
        var result = BitCheck.Run(rig.Services);

        Assert.Equal(new[] { "find:ok", "db:ok", "registration:ok" }, Steps(result));
        Assert.True(result.Registered);
        Assert.Equal(Synthetic.Institution, result.InstitutionCode);
        Assert.Equal(new[] { Synthetic.Root }, rig.Connector.Opened);
        Assert.Equal(1, rig.Session.Disposed);
        Assert.All(rig.Session.Sqls, sql => Assert.Contains(sql, Sql.All));
    }

    [Fact(DisplayName = "AC-005.15 등록 기관기호가 비었으면 institutionCode 칸을 주지 않는다(세 단계는 ok)")]
    public void EmptyInstitutionIsOmitted()
    {
        using var rig = new Rig().Registered(Synthetic.Registration(institution: ""));
        rig.Session.Answer(Sql.InstitutionSql, Synthetic.OtherInstitution);
        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:ok", "registration:ok" }, Steps(result));
        Assert.True(result.Registered);
        Assert.Null(result.InstitutionCode);
        Assert.DoesNotContain("institutionCode", System.Text.Json.JsonSerializer.Serialize(result));
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
        Assert.Null(result.InstitutionCode);
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

    [Fact(DisplayName = "AC-005.7 AC-005.9 bit.check 답은 result {steps:[{name, ok, code?}], registered, institutionCode?}(병원 이름 칸 없음)")]
    public void ReplyShape()
    {
        using (var rig = new Rig().Registered())
        {
            var reply = Reply(rig);
            Assert.Equal("result", reply.GetProperty("type").GetString());
            var data = reply.GetProperty("data");
            Assert.Equal(new[] { "steps", "registered", "institutionCode" }, Json.Keys(data));
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

    [Fact(DisplayName = "AC-005.9 bit.check 답 칸은 steps·registered·institutionCode(registered: true일 때만)뿐, 범위·경로·이름 값이 답 어디에도 없다")]
    public void ReplyHasNoHospitalName()
    {
        using (var rig = new Rig().Registered())
        {
            var data = Reply(rig).GetProperty("data");
            Assert.Equal(new[] { "steps", "registered", "institutionCode" }, Json.Keys(data));
            var raw = data.GetRawText();
            Assert.DoesNotContain("hospitalName", raw);
            Assert.DoesNotContain(Synthetic.Scope, raw);
            Assert.DoesNotContain("DrBIT50", raw);
            Assert.DoesNotContain("SQLEXPRESS", raw);
        }

        using (var rig = new Rig())
        {
            var data = Reply(rig).GetProperty("data");
            Assert.Equal(new[] { "steps", "registered" }, Json.Keys(data));
            Assert.False(data.GetProperty("registered").GetBoolean());
        }

        Assert.Null(typeof(BitCheckResult).GetProperty("HospitalName"));
    }

    [Fact(DisplayName = "AC-005.12 registration.dat가 깨지고 .bak이 없으면 registered:false·registration 단계 E-STORE-BROKEN, 파일은 그대로")]
    public void BrokenRegistrationWithoutBackup()
    {
        using var rig = new Rig();
        System.IO.Directory.CreateDirectory(rig.Folder);
        var file = System.IO.Path.Combine(rig.Folder, "registration.dat");
        System.IO.File.WriteAllBytes(file, Encoding.ASCII.GetBytes("garbage"));

        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:ok", "registration:E-STORE-BROKEN" }, Steps(result));
        Assert.False(result.Registered);
        Assert.Null(result.InstitutionCode);
        Assert.Equal(new[] { "registration.dat" }, System.IO.Directory.GetFiles(rig.Folder).Select(System.IO.Path.GetFileName));
        Assert.Equal("garbage", System.IO.File.ReadAllText(file));

        var data = Reply(rig).GetProperty("data");
        Assert.Equal(new[] { "steps", "registered" }, Json.Keys(data));
        var registration = data.GetProperty("steps").EnumerateArray().Last();
        Assert.False(registration.GetProperty("ok").GetBoolean());
        Assert.Equal("E-STORE-BROKEN", registration.GetProperty("code").GetString());
    }

    [Fact(DisplayName = "AC-005.12 앞 단계가 실패했으면 깨진 등록 파일이어도 registration 단계는 앞 번호, registered:false")]
    public void BrokenRegistrationAfterEarlierFailure()
    {
        using var rig = new Rig();
        System.IO.Directory.CreateDirectory(rig.Folder);
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(rig.Folder, "registration.dat"), Encoding.ASCII.GetBytes("garbage"));
        rig.Connector.FailCode = BitErrors.DbFailed;

        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:E-BIT-DB-FAILED", "registration:E-BIT-DB-FAILED" }, Steps(result));
        Assert.False(result.Registered);
    }

    [Fact(DisplayName = "AC-005.12 registration.dat가 깨지고 .bak이 맞으면 되살려 그 값으로 확인한다(registered:true)")]
    public void BrokenRegistrationRestoredFromBackup()
    {
        // .bak = 지금 비트와 같은 등록, registration.dat = 다른 서버로 바꿔 쓴 뒤 깨짐
        using var rig = new Rig().Registered().Registered(Synthetic.Registration(server: "192.168.0.10"));
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(rig.Folder, "registration.dat"), Encoding.ASCII.GetBytes("garbage"));

        var result = BitCheck.Run(rig.Services);
        Assert.Equal(new[] { "find:ok", "db:ok", "registration:ok" }, Steps(result));
        Assert.True(result.Registered);
        Assert.Equal(Synthetic.Institution, result.InstitutionCode);
        Assert.Equal(Synthetic.Server, rig.Store.Load()!.Server);
        Assert.Single(System.IO.Directory.GetFiles(rig.Folder, "registration.dat.broken-*"));
    }
}
