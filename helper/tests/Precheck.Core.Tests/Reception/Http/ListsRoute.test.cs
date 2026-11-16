using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Store;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Reception.ArrangeWriting;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;

// 이 기능(reception-pick-lists)의 시험만 한 거르기로 돌리려고 PickChoices 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PickChoices;

/// <summary>
/// 목록 쓰기 길 POST /api/lists(AC-3501.3)·판의 picks(AC-3501.4)·몸 한도(AC-3502.4).
/// ArrangeRig(가짜 비트·가짜 지도·임시 폴더의 진짜 ArrangeMarks·XrayMarks·ReceptionLists·주입한 시계)만 쓴다.
/// </summary>
public class ListsRouteTests
{
    private static string NewLists() => Picks.Body(
        procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false},{\"n\":\"리덕션\",\"noDrug\":true}]",
        drugs: "[\"새약\"]",
        parts: "[\"꼬리뼈\",\"무릎\"]",
        plains: "[\"드레싱\"]",
        withs: "[\"주사\"]");

    private static HttpResponse PostLists(ArrangeRig rig, string json) => rig.Post(Encoding.UTF8.GetBytes(json), "/api/lists");

    private static HttpResponse PostLists(ArrangeRig rig, byte[] body, IEnumerable<KeyValuePair<string, string>>? headers = null) =>
        rig.Send("POST", "/api/lists", headers ?? ArrangeRig.WriteHeaders, body);

    private static byte[] ArrangeBody(string key, string op, string col, string v, string? t = null)
    {
        var parts = new List<string> { "\"k\":" + JsonSerializer.Serialize(key), "\"op\":" + JsonSerializer.Serialize(op), "\"col\":" + JsonSerializer.Serialize(col), "\"v\":" + JsonSerializer.Serialize(v, Relaxed) };
        if (t != null) parts.Add("\"t\":" + JsonSerializer.Serialize(t, Relaxed));
        return Encoding.UTF8.GetBytes("{" + string.Join(",", parts) + "}");
    }

    private static readonly JsonSerializerOptions Relaxed = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private static string ListsFile(ArrangeRig rig) => Path.Combine(rig.DataPath, ReceptionLists.FileName);

    // ---- AC-3501.3 POST /api/lists --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.3 맞는 몸이면 data\\reception-lists.dat(머리 + 암호화)에 쓰고 204이며, 다시 연 저장소도 그 목록을 읽는다")]
    public void SavesAndAnswers204()
    {
        using var rig = new ArrangeRig(lists: true);
        var answer = PostLists(rig, NewLists());

        Assert.Equal(204, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(Picks.Json(Parse(NewLists())), Picks.Json(rig.Lists!.Current()));
        Assert.True(File.Exists(ListsFile(rig)));
        var data = File.ReadAllBytes(ListsFile(rig));
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        Assert.DoesNotContain("꼬리뼈", Encoding.UTF8.GetString(data));
        Assert.Equal(Picks.Json(Parse(NewLists())), Picks.Json(new ReceptionLists(new StoreFolder(rig.DataPath), rig.Bit.Protector).Current()));
    }

    [Fact(DisplayName = "AC-3501.3 쓰기 검사(같은 출처·X-Reception·JSON)를 지나지 않으면 403이고 목록·파일은 그대로다(기록에 번호만)")]
    public void WriteCheckFailsWith403()
    {
        using var rig = new ArrangeRig(lists: true);
        var body = Encoding.UTF8.GetBytes(NewLists());
        foreach (var drop in new[] { "Origin", "X-Reception", "Content-Type" })
            Assert.Equal(403, PostLists(rig, body, ArrangeRig.WriteHeaders.Where(h => h.Key != drop)).Status);
        var wrongOrigin = ArrangeRig.WriteHeaders.Select(h => h.Key == "Origin" ? new KeyValuePair<string, string>("Origin", "http://evil.example") : h);
        Assert.Equal(403, PostLists(rig, body, wrongOrigin).Status);

        Assert.False(File.Exists(ListsFile(rig)));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(rig.Lists!.Current()));
        Assert.Contains(rig.LogLines(), line => line.Contains(ReceptionErrors.BadWrite));
    }

    [Theory(DisplayName = "AC-3501.3 몸 모양이 틀리면(JSON 아님·목록 규칙 어긋남) 400이고 목록·파일은 그대로다")]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("{\"carm\":{\"procs\":[],\"drugs\":[]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}")]
    [InlineData("{\"carm\":{\"procs\":[{\"n\":\"a|b\",\"noDrug\":false}],\"drugs\":[]},\"sono\":{\"parts\":[\"어깨\"],\"plains\":[],\"withs\":[]}}")]
    [InlineData("{\"carm\":{\"procs\":[{\"n\":\"목\",\"noDrug\":false}],\"drugs\":[]},\"sono\":{\"parts\":[\"소독\"],\"plains\":[\"소독\"],\"withs\":[]}}")]
    public void BadShapeIs400(string json)
    {
        using var rig = new ArrangeRig(lists: true);
        Assert.Equal(400, PostLists(rig, json).Status);
        Assert.False(File.Exists(ListsFile(rig)));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(rig.Lists!.Current()));
    }

    [Fact(DisplayName = "AC-3501.3 POST만 받는다(GET은 405 Allow: POST), 질의 글이 붙으면 404, 목록 저장소를 넘기지 않은 라우터에는 /api/lists가 없다(404)")]
    public void RouteShape()
    {
        using var rig = new ArrangeRig(lists: true);
        var get = rig.Send("GET", "/api/lists");
        Assert.Equal(405, get.Status);
        Assert.Contains(get.Headers, h => h.Key == "Allow" && h.Value == "POST");
        Assert.Equal(404, rig.Post(Encoding.UTF8.GetBytes(NewLists()), "/api/lists?x=1").Status);
        Assert.False(File.Exists(ListsFile(rig)));

        using var without = new ArrangeRig();
        Assert.Equal(404, without.Post(Encoding.UTF8.GetBytes(NewLists()), "/api/lists").Status);
        using var plain = new ServeRig();
        Assert.Equal(404, plain.Send("POST", "/api/lists", headers: ArrangeRig.WriteHeaders, body: Encoding.UTF8.GetBytes(NewLists())).Status);
    }

    [Fact(DisplayName = "AC-3501.3 저장하지 못하면 503 {\"state\":\"unavailable\"}이고 기록에는 E-STORE-FAILED 번호만 남는다")]
    public void SaveFailureIs503()
    {
        using var rig = new ArrangeRig(lists: true);
        Directory.CreateDirectory(ListsFile(rig));

        var answer = PostLists(rig, NewLists());

        Assert.Equal(503, answer.Status);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(answer.Body));
        var lines = rig.LogLines();
        Assert.Contains(lines, line => line.Contains(BitErrors.StoreFailed));
        LogAssert.Clean(lines);
        foreach (var leak in new[] { "꼬리뼈", "새약", "lists", "reception-lists" }) Assert.DoesNotContain(leak, string.Join("\n", lines));
    }

    [Fact(DisplayName = "AC-3501.3 접수 현황 프로그램(ReceptionServices)은 같은 data\\ 폴더·같은 DPAPI의 ReceptionLists를 라우터에 넘긴다")]
    public void ServicesWireLists()
    {
        var source = File.ReadAllText(Repo.PathOf("helper", "src", "Precheck.Reception", "ReceptionServices.cs"));
        Assert.Contains("new ReceptionLists(new StoreFolder(DataDirectory()), protector, log.Note)", source);
        Assert.Contains("lists: lists", source);
    }

    // ---- AC-3501.4 판의 picks ---------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3501.4 GET /api/board의 맨 위 picks는 지금 목록이다: 처음엔 기본값, 저장하면 다음 읽기부터 새 목록")]
    public void BoardPicksFollowSavedLists()
    {
        using var rig = new ArrangeRig(lists: true);
        Assert.Equal(Picks.Json(PickLists.Defaults), rig.Board().GetProperty("picks").GetRawText());

        Assert.Equal(204, PostLists(rig, NewLists()).Status);

        var board = rig.Board();
        Assert.Equal(Picks.Json(Parse(NewLists())), board.GetProperty("picks").GetRawText());
        Assert.Equal(new[] { "state", "at", "every", "counts", "lists", "arrange", "picks" }, board.EnumerateObject().Select(p => p.Name));
    }

    [Fact(DisplayName = "AC-3501.4 목록 저장소가 없어도 어레인지 판은 기본 목록을 picks로 보내고, 어레인지를 보내지 않는 판에는 picks가 없다")]
    public void PicksOnlyWithArrange()
    {
        using var without = new ArrangeRig();
        Assert.Equal(Picks.Json(PickLists.Defaults), without.Board().GetProperty("picks").GetRawText());

        using var plain = new ServeRig();
        using var document = JsonDocument.Parse(plain.Get("/api/board").Body);
        Assert.False(document.RootElement.TryGetProperty("picks", out _));
        Assert.False(document.RootElement.TryGetProperty("arrange", out _));
    }

    [Fact(DisplayName = "AC-3501.4 POST /api/arrange의 SONO·C-ARM 넣기는 저장한 지금 목록으로 본다(새 이름 204, 뺀 이름 400)")]
    public void ArrangeWritesFollowSavedLists()
    {
        using var rig = new ArrangeRig(lists: true);
        var key = rig.Key("V1003");
        Assert.Equal(204, PostLists(rig, NewLists()).Status);

        Assert.Equal(400, rig.Post(ArrangeBody(key, "add", "sono", "어깨")).Status);
        Assert.Equal(400, rig.Post(ArrangeBody(key, "add", "carm", "허리", "TP")).Status);
        Assert.Equal(204, rig.Post(ArrangeBody(key, "add", "sono", "왼 꼬리뼈|드레싱", "주사")).Status);
        Assert.Equal(204, rig.Post(ArrangeBody(key, "add", "carm", "꼬리뼈", "새약")).Status);

        var cells = rig.Row("V1003").GetProperty("cells");
        Assert.Equal("왼 꼬리뼈|드레싱", cells.GetProperty("sono").GetProperty("part").GetString());
        Assert.Equal(new[] { "주사" }, cells.GetProperty("sono").GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal(new[] { "새약" }, cells.GetProperty("carm").GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
    }

    // ---- AC-3502.4 몸 한도 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3502.4 읽기 한도는 8192바이트(spec reception-arrange-tune AC-3603.5): 꼭 8192면 읽고, Content-Length가 8192를 넘으면(다섯 자리 포함) 몸을 읽지 않고 413")]
    public void ReaderLimitIs8192()
    {
        Assert.Equal(8192, HttpRequestReader.MaxBody);
        var body = new string('x', 8192);
        var request = HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes("POST /api/lists HTTP/1.1\r\nHost: a\r\nContent-Length: 8192\r\n\r\n" + body)), TimeSpan.FromSeconds(5));
        Assert.Equal(8192, request!.Body.Length);
        Assert.Equal(8192, HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes("POST /api/lists HTTP/1.1\r\nHost: a\r\nContent-Length: 0008192\r\n\r\n" + body)), TimeSpan.FromSeconds(5))!.Body.Length);
        foreach (var length in new[] { "8193", "9999", "10000", "99999999999" })
        {
            var e = Assert.Throws<HttpReadException>(() => HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes("POST /api/lists HTTP/1.1\r\nHost: a\r\nContent-Length: " + length + "\r\n\r\n")), TimeSpan.FromSeconds(5)));
            Assert.Equal(413, e.Status);
        }
    }

    public static IEnumerable<object[]> PathLimits() => new[]
    {
        new object[] { "/api/xray", 256 },
        new object[] { "/api/arrange", 1024 },
        new object[] { "/api/lists", 8192 },
    };

    [Theory(DisplayName = "AC-3502.4 쓰기 검사 전에 /api/xray 256·/api/arrange 1024·/api/lists 8192바이트(spec reception-arrange-tune AC-3603.5)를 넘으면 413이다(쓰기 머리가 틀려도 413, 한도까지는 413이 아님)")]
    [MemberData(nameof(PathLimits))]
    public void RouterLimitsPerPath(string path, int limit)
    {
        using var rig = new ArrangeRig(lists: true);
        var noHeaders = new KeyValuePair<string, string>[0];
        Assert.Equal(413, rig.Send("POST", path, ArrangeRig.WriteHeaders, new byte[limit + 1]).Status);
        Assert.Equal(413, rig.Send("POST", path, noHeaders, new byte[limit + 1]).Status);
        Assert.Equal(403, rig.Send("POST", path, noHeaders, new byte[limit]).Status);
        Assert.Equal(400, rig.Send("POST", path, ArrangeRig.WriteHeaders, Encoding.ASCII.GetBytes(new string(' ', limit))).Status);
        Assert.Empty(rig.ArrangeMarks.Today());
        Assert.Empty(rig.XrayMarks.Today());
        Assert.False(File.Exists(ListsFile(rig)));
    }

    [Fact(DisplayName = "AC-3502.4 가장 긴 넣기(SONO 6줄 + 같이 12개, 한글 3바이트)도 /api/arrange 1024바이트 안이라 받는다")]
    public void LongestArrangeFits()
    {
        using var rig = new ArrangeRig(lists: true);
        var parts = Enumerable.Range(0, 6).Select(i => "가나다라마바사아자" + (char)('가' + i)).ToArray();
        var withs = Enumerable.Range(0, 12).Select(i => "하하하하하하하하하" + (char)('나' + i)).ToArray();
        var lists = Picks.Body(parts: Picks.Strings(parts), plains: "[]", withs: Picks.Strings(withs));
        Assert.Equal(204, PostLists(rig, lists).Status);

        var body = ArrangeBody(rig.Key("V1003"), "add", "sono", string.Join("|", parts.Select(p => "오른 " + p)), string.Join("|", withs));
        Assert.InRange(body.Length, 600, 1024);
        Assert.Equal(204, rig.Post(body).Status);
        Assert.Equal(12, rig.ArrangeMarks.Today()["V1003"].Cells[ArrangeCol.Sono].Tags.Count);
    }

    private static PickLists Parse(string json) =>
        PickLists.TryParse(Encoding.UTF8.GetBytes(json), out var lists) ? lists : throw new InvalidOperationException("시험 목록이 틀렸다");
}
