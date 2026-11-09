using System;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 PrevPaper 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PrevPaper;

/// <summary>
/// 직전 기록부 길 GET /api/visit/{k}/prev(spec reception-arrange design.md 9절, AC-3307.1·AC-3307.3).
/// 가짜 비트(ServeRig: 오늘 접수 V1001 차트 900101은 지난 내원 V0901, V1003 차트 900103은 첫 방문)와 이 시험이 주는 직전 종이 답만 쓴다.
/// </summary>
public class PrevRouteTests
{
    private static ServeRig Rig(bool registered = true)
    {
        var rig = new ServeRig(registered);
        rig.Bit.Session.Answer(ReceptionSql.PrevPaperVisit, _ => new[] { new object?[] { "20261029", "정형외과", "건강보험" } });
        rig.Bit.Session.Answer(ReceptionSql.PrevPaperSymptoms, _ => new[] { new object?[] { "허리 통증" } });
        rig.Bit.Session.Answer(ReceptionSql.PrevPaperDx, _ => new[] { new object?[] { "M545", "요통", "1" } });
        rig.Bit.Session.Answer(ReceptionSql.PrevPaperOrders, _ => new[] { new object?[] { "PT01", "", 1m, 1m, 1m, "" } });
        return rig;
    }

    private static int PrevReads(ServeRig rig) => rig.Bit.Session.Calls.Count(call =>
        call.Sql == ReceptionSql.PrevPaperVisit || call.Sql == ReceptionSql.PrevPaperSymptoms ||
        call.Sql == ReceptionSql.PrevPaperDx || call.Sql == ReceptionSql.PrevPaperOrders);

    private static JsonElement Json(HttpResponse answer)
    {
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    [Fact(DisplayName = "AC-3307.1 그날 열쇠면 200 {\"prev\": {...}}이고 그 접수의 LastVisitId(V0901)를 읽는다")]
    public void PrevRoute()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");

        var answer = rig.Get("/api/visit/" + key + "/prev");

        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        var prev = Json(answer).GetProperty("prev");
        Assert.Equal("2026-10-29", prev.GetProperty("date").GetString());
        Assert.Equal("7일 전", prev.GetProperty("ago").GetString());
        Assert.Equal("표층열치료", prev.GetProperty("rx")[0].GetProperty("name").GetString());
        Assert.Equal(4, PrevReads(rig));
        Assert.All(rig.Bit.Session.Calls.Where(call => call.Sql == ReceptionSql.PrevPaperVisit), call => Assert.Equal("V0901", call.Args["@visit"]));
    }

    [Fact(DisplayName = "AC-3307.1 지난 내원이 없는 접수(첫 방문)는 비트의 직전 종이 문장을 돌리지 않고 200 {\"prev\":null}이다")]
    public void FirstVisit()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900103");

        var answer = rig.Get("/api/visit/" + key + "/prev");

        Assert.Equal(200, answer.Status);
        Assert.Equal("{\"prev\":null}", Encoding.UTF8.GetString(answer.Body));
        Assert.Equal(0, PrevReads(rig));
    }

    [Theory(DisplayName = "AC-3307.3 그날 열쇠표에 없는·모양이 틀린·빈 열쇠, 질의 글이 붙은 길은 비트를 읽지 않고 404다")]
    [InlineData("/api/visit/0123456789abcdef/prev")]
    [InlineData("/api/visit/ffffffffffffffff/prev")]
    [InlineData("/api/visit//prev")]
    [InlineData("/api/visit/{key}/prev?x=1")]
    [InlineData("/api/visit/{key}/prev?")]
    [InlineData("/api/visit/{KEY}/prev")]
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

    [Fact(DisplayName = "AC-3307.3 날이 바뀌면 어제 열쇠는 비트를 읽지 않고 404다")]
    public void YesterdayKey()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Clock.Set(new DateTime(2026, 11, 6, 9, 0, 0));
        var before = rig.Bit.Session.Calls.Count;

        Assert.Equal(404, rig.Get("/api/visit/" + key + "/prev").Status);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }

    [Fact(DisplayName = "AC-3307.3 직전 종이 읽기가 실패하면 일부만 주지 않고 503 {\"state\":\"unavailable\"}이다")]
    public void ReadFails()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Session.Fail(ReceptionSql.PrevPaperDx, BitErrors.ReadFailed);

        var answer = rig.Get("/api/visit/" + key + "/prev");

        Assert.Equal(503, answer.Status);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(answer.Body));
    }

    [Fact(DisplayName = "AC-3307.3 비트를 볼 수 없으면(등록 확인 실패) 503이다")]
    public void Unregistered()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Locator.FailCode = BitErrors.NotFound;
        rig.Clock.Advance(TimeSpan.FromSeconds(9));

        Assert.Equal(503, rig.Get("/api/visit/" + key + "/prev").Status);
    }

    [Fact(DisplayName = "AC-3307.3 GET 말고 다른 방법은 405(Allow: GET)이고 비트를 읽지 않는다")]
    public void OnlyGet()
    {
        using var rig = Rig();
        var key = rig.KeyOfChart("900101");
        var before = rig.Bit.Session.Calls.Count;

        var answer = rig.Send("POST", "/api/visit/" + key + "/prev");

        Assert.Equal(405, answer.Status);
        Assert.Equal("GET", answer.Header("Allow"));
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }
}
