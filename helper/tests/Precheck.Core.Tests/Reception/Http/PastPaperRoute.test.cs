using System;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;

// 이 기능의 지난 종이 시험만 한 거르기로 돌리려고 PastPaper 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PastPaper;

/// <summary>
/// 지난 진료기록부 길 GET /api/visit/{k}/papers?from=N(spec reception-memo-papers design.md 4절, AC-3404.1).
/// 가짜 비트(ServeRig: 오늘 접수 V1001 차트 900101은 재진, V1003 차트 900103은 첫 방문)와 이 시험이 주는 지난 종이 답(PastFake, 지난 내원 7번)만 쓴다.
/// </summary>
public class PastPaperRouteTests
{
    private const int Earlier = 7;

    private static ServeRig Rig(bool registered = true)
    {
        var rig = new ServeRig(registered);
        PastFake.Answer(rig.Bit.Session, Earlier);
        return rig;
    }

    private static int PaperReads(ServeRig rig) => rig.Bit.Session.Calls.Count(call => PastFake.Sqls.Contains(call.Sql));

    private static JsonElement Json(HttpResponse answer)
    {
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    [Fact(DisplayName = "AC-3404.1 그날 열쇠·from=0이면 200 {papers(1~2번째), total, next}이고 지난 종이 문장 넷을 한 번씩 돌린다")]
    public void FirstPage()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");

        var answer = rig.Get("/api/visit/" + key + "/papers?from=0");

        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        var body = Json(answer);
        Assert.Equal(new[] { "2026-10-29", "2026-10-15" }, body.GetProperty("papers").EnumerateArray().Select(p => p.GetProperty("date").GetString()));
        Assert.Equal("7일 전", body.GetProperty("papers")[0].GetProperty("ago").GetString());
        Assert.Equal("표층열치료", body.GetProperty("papers")[0].GetProperty("rx")[0].GetProperty("name").GetString());
        Assert.Equal(Earlier, body.GetProperty("total").GetInt64());
        Assert.Equal(2, body.GetProperty("next").GetInt32());
        Assert.Equal(4, PaperReads(rig));
        Assert.All(rig.Bit.Session.Calls.Where(call => PastFake.Sqls.Contains(call.Sql)), call =>
        {
            Assert.Equal("900101", call.Args["@chart"]);
            Assert.Equal((1, 2), ((int)call.Args["@first"]!, (int)call.Args["@last"]!));
        });
    }

    [Fact(DisplayName = "AC-3404.1 from=next면 그다음 3장이고, 끝 쪽은 next가 null이다")]
    public void LaterPages()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");

        var second = Json(rig.Get("/api/visit/" + key + "/papers?from=2"));
        Assert.Equal(new[] { 3, 4, 5 }.Select(PastFake.DashedDay), second.GetProperty("papers").EnumerateArray().Select(p => p.GetProperty("date").GetString()));
        Assert.Equal(5, second.GetProperty("next").GetInt32());

        var last = Json(rig.Get("/api/visit/" + key + "/papers?from=5"));
        Assert.Equal(2, last.GetProperty("papers").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, last.GetProperty("next").ValueKind);
        Assert.Equal(Earlier, last.GetProperty("total").GetInt64());
    }

    [Fact(DisplayName = "AC-3404.1 지난 내원이 없는 접수(첫 방문)는 비트를 읽지 않고 200 {\"papers\":[],\"total\":0,\"next\":null}이다")]
    public void FirstVisit()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900103");
        var before = rig.Bit.Session.Calls.Count;

        var answer = rig.Get("/api/visit/" + key + "/papers?from=0");

        Assert.Equal(200, answer.Status);
        Assert.Equal("{\"papers\":[],\"total\":0,\"next\":null}", Encoding.UTF8.GetString(answer.Body));
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }

    [Theory(DisplayName = "AC-3404.1 그날 열쇠표에 없는·모양이 틀린·빈 열쇠, 틀린 from(음수·숫자 아님·빈·덧붙임·없음)은 비트를 읽지 않고 404다")]
    [InlineData("/api/visit/0123456789abcdef/papers?from=0")]
    [InlineData("/api/visit/ffffffffffffffff/papers?from=0")]
    [InlineData("/api/visit//papers?from=0")]
    [InlineData("/api/visit/{KEY}/papers?from=0")]
    [InlineData("/api/visit/{key}/papers")]
    [InlineData("/api/visit/{key}/papers?")]
    [InlineData("/api/visit/{key}/papers?from=")]
    [InlineData("/api/visit/{key}/papers?from=-1")]
    [InlineData("/api/visit/{key}/papers?from=abc")]
    [InlineData("/api/visit/{key}/papers?from=1.5")]
    [InlineData("/api/visit/{key}/papers?from=+1")]
    [InlineData("/api/visit/{key}/papers?from=%31")]
    [InlineData("/api/visit/{key}/papers?from=0&x=1")]
    [InlineData("/api/visit/{key}/papers?From=0")]
    [InlineData("/api/visit/{key}/papers?x=0")]
    [InlineData("/api/visit/{key}/papers?from=99999999999")]
    [InlineData("/api/visit/{key}/papers/x?from=0")]
    public void NotFound(string target)
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        var before = rig.Bit.Session.Calls.Count;
        var opened = rig.Bit.Connector.Opened.Count;

        var answer = rig.Get(target.Replace("{key}", key).Replace("{KEY}", key.ToUpperInvariant()));

        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
        Assert.Equal(opened, rig.Bit.Connector.Opened.Count);
    }

    [Fact(DisplayName = "AC-3404.1 날이 바뀌면 어제 열쇠는 비트를 읽지 않고 404다")]
    public void YesterdayKey()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Clock.Set(new DateTime(2026, 11, 6, 9, 0, 0));
        var before = rig.Bit.Session.Calls.Count;

        Assert.Equal(404, rig.Get("/api/visit/" + key + "/papers?from=0").Status);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }

    [Fact(DisplayName = "AC-3404.1 지난 종이 읽기가 실패하면 일부만 주지 않고 503 {\"state\":\"unavailable\"}이다")]
    public void ReadFails()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Session.Fail(ReceptionSql.PastPaperDx, BitErrors.ReadFailed);

        var answer = rig.Get("/api/visit/" + key + "/papers?from=0");

        Assert.Equal(503, answer.Status);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(answer.Body));
    }

    [Fact(DisplayName = "AC-3404.1 읽기가 8초를 넘으면 남은 문장을 돌리지 않고 503이다")]
    public void TooSlow()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Session.Answer(ReceptionSql.PastPaperSymptoms, args =>
        {
            rig.Clock.Advance(TimeSpan.FromSeconds(9));
            return PastFake.Symptoms(args, Earlier);
        });

        var answer = rig.Get("/api/visit/" + key + "/papers?from=0");

        Assert.Equal(503, answer.Status);
        Assert.Equal(0, rig.Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.PastPaperDx || call.Sql == ReceptionSql.PastPaperOrders));
    }

    [Fact(DisplayName = "AC-3404.1 비트를 볼 수 없으면(등록 확인 실패) 503이다")]
    public void Unregistered()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Locator.FailCode = BitErrors.NotFound;
        rig.Clock.Advance(TimeSpan.FromSeconds(9));

        Assert.Equal(503, rig.Get("/api/visit/" + key + "/papers?from=0").Status);
    }

    [Fact(DisplayName = "AC-3404.1 GET 말고 다른 방법은 405(Allow: GET)이고 비트를 읽지 않는다")]
    public void OnlyGet()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        var before = rig.Bit.Session.Calls.Count;

        var answer = rig.Send("POST", "/api/visit/" + key + "/papers?from=0");

        Assert.Equal(405, answer.Status);
        Assert.Equal("GET", answer.Header("Allow"));
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }
}
