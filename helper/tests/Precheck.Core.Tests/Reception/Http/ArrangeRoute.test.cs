using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Reception.Cache;
using Precheck.Core.Tests.Reception.Detail;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeWriting 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeWriting;

/// <summary>
/// 쓰기 길 POST /api/arrange와 판의 arrange(spec reception-arrange design.md 8절, REQ-3306·AC-3305.1).
/// 가짜 비트(오늘 접수 V1001 S1 진료대기·V1002 S2 진료보류·V1003 S1 진료대기, 처방 시각은 이 시험이 줌)·가짜 지도(X-ray ^G\d{4}$, SONO1·CARM1)·
/// 임시 폴더의 진짜 ArrangeMarks·XrayMarks·주입한 시계(2026-11-05 10:00)만 쓴다.
/// </summary>
public class ArrangeRouteTests
{
    [Fact(DisplayName = "AC-3305.1 어레인지 표시를 넘긴 라우터의 GET /api/board는 arrange { rows, ended }를 더하고, 넘기지 않은 라우터는 지금 답 그대로다")]
    public void BoardHasArrange()
    {
        using var rig = new ArrangeRig();
        var board = rig.Board();
        var rows = board.GetProperty("arrange").GetProperty("rows").EnumerateArray().ToArray();
        Assert.Equal(3, rows.Length);
        Assert.Equal(rig.Key("V1001"), rows[0].GetProperty("k").GetString());
        Assert.Equal("todo", rows[0].GetProperty("cells").GetProperty("sono").GetProperty("st").GetString());
        Assert.Equal(3, board.GetProperty("counts").GetProperty("queue").GetInt32());

        using var plain = new ServeRig();
        using var document = JsonDocument.Parse(plain.Get("/api/board").Body);
        Assert.False(document.RootElement.TryGetProperty("arrange", out _));
        Assert.Equal(404, plain.Send("POST", "/api/arrange", headers: ArrangeRig.WriteHeaders, body: Encoding.UTF8.GetBytes("{\"k\":\"a\",\"op\":\"away\",\"v\":\"on\"}")).Status);
    }

    [Fact(DisplayName = "AC-3306.1 쓰기 검사(같은 출처·X-Reception·JSON)를 지나지 않으면 403, 몸 모양이 틀리면 400, 그날 열쇠·네 칸 줄이 아니면 404, 쓰면 204")]
    public void Statuses()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1001");

        Assert.Equal(403, rig.Send("POST", "/api/arrange", headers: ArrangeRig.WriteHeaders.Where(h => h.Key != "X-Reception"), body: Body(key, "away", null, "on")).Status);
        Assert.Equal(400, rig.Post("{\"k\":\"" + key + "\",\"op\":\"fly\"}").Status);
        Assert.Equal(400, rig.Post(Body(key, "away", "sono", "on")).Status);
        Assert.Equal(404, rig.Post(Body("ffffffffffffffff", "away", null, "on")).Status);
        Assert.Equal(404, rig.Post(Body(rig.Keys.KeyOf(ServeRig.Day, "V7777"), "away", null, "on")).Status);
        Assert.Equal(404, rig.Post(Body(key, "away", null, "on"), "/api/arrange?x=1").Status);
        Assert.Equal(405, rig.Send("GET", "/api/arrange").Status);
        Assert.Empty(rig.ArrangeMarks.Today());

        Assert.Equal(204, rig.Post(Body(key, "away", null, "on")).Status);
        Assert.Equal("10:00", rig.ArrangeMarks.Today()["V1001"].Away);
    }

    [Fact(DisplayName = "AC-3306.1 같은 줄에 쓰기 여럿이 한꺼번에 와도(다른 칸·자리비움·PT 먼저) 모두 204이고 어느 표시도 잃지 않는다")]
    public void ConcurrentWritesKeepEveryMark()
    {
        for (var round = 0; round < 10; round++)
        {
            using var rig = new ArrangeRig();
            var key = rig.Key("V1003");
            var bodies = new[]
            {
                Body(key, "add", "xray", "X-ray 찍기"), Body(key, "add", "sono", "목"), Body(key, "add", "carm", "허리"),
                Body(key, "add", "pt", "HP"), Body(key, "add", "ds", "30분"), Body(key, "add", "eswt", "2부위"), Body(key, "add", "trac", "목"),
                Body(key, "away", null, "on"), Body(key, "ptf", null, "up"),
            };
            var statuses = new int[bodies.Length];
            using var start = new Barrier(bodies.Length);
            // 서버처럼 연결마다 따로 도는 스레드(스레드 풀 아님)에서 한꺼번에 보낸다
            var threads = bodies.Select((body, i) => new Thread(() =>
            {
                start.SignalAndWait();
                statuses[i] = rig.Post(body).Status;
            })).ToArray();
            foreach (var thread in threads) thread.Start();
            foreach (var thread in threads) thread.Join();

            Assert.All(statuses, status => Assert.Equal(204, status));
            var mark = rig.ArrangeMarks.Today()["V1003"];
            Assert.Equal(
                new[] { ArrangeKeys.Xray, ArrangeKeys.Sono, ArrangeKeys.Carm, ArrangeKeys.Pt, ArrangeKeys.Ds, ArrangeKeys.Eswt, ArrangeKeys.Trac },
                mark.Cells.Keys.OrderBy(col => col, ArrangeKeys.Order));
            Assert.Equal("10:00", mark.Away);
            Assert.Equal("up", mark.Ptf?.St);
        }
    }

    [Fact(DisplayName = "AC-3306.1 비트를 볼 수 없으면 503이고 표시를 바꾸지 않는다")]
    public void Unavailable()
    {
        using var rig = new ArrangeRig(registered: false);
        var answer = rig.Post(Body(rig.Keys.KeyOf(ServeRig.Day, "V1001"), "away", null, "on"));
        Assert.Equal(503, answer.Status);
        Assert.Empty(rig.ArrangeMarks.Today());
    }

    [Fact(DisplayName = "AC-3306.2 직접 넣기 → 완료, 자리비움, PT 먼저, 치료 종료 → 다시 넣기가 판의 arrange에 그대로 보인다")]
    public void WritesShowOnBoard()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1003");

        Assert.Equal(204, rig.Post(Body(key, "add", "pt", "HP")).Status);
        Assert.Equal(204, rig.Post(Body(key, "step", "pt", null)).Status);
        Assert.Equal(204, rig.Post(Body(key, "ptf", null, "up")).Status);
        var row = rig.Row("V1003");
        Assert.Equal("done", row.GetProperty("cells").GetProperty("pt").GetProperty("st").GetString());
        Assert.Equal("HP", row.GetProperty("cells").GetProperty("pt").GetProperty("det").GetString());
        Assert.True(row.GetProperty("cells").GetProperty("pt").GetProperty("manual").GetBoolean());
        Assert.Equal("up", row.GetProperty("ptf").GetProperty("st").GetString());

        Assert.Equal(204, rig.Post(Body(key, "end", null, "on")).Status);
        var ended = rig.Board().GetProperty("arrange").GetProperty("ended")[0];
        Assert.Equal(key, ended.GetProperty("k").GetString());
        // 표에서 뺀 줄도 그날 네 칸 줄이라 다시 넣을 수 있다
        Assert.Equal(204, rig.Post(Body(key, "end", null, "off")).Status);
        Assert.Equal("done", rig.Row("V1003").GetProperty("cells").GetProperty("pt").GetProperty("st").GetString());
    }

    [Fact(DisplayName = "AC-3306.4 X-RAY 완료·되돌리기는 진료보류가 아닌 줄도 X-ray 완료 표시(XrayMarks)를 쓰고, 판의 X-RAY 칸과 진료보류 줄의 X-ray 칸이 같은 표시를 본다")]
    public void XrayGoesToXrayMarks()
    {
        using var rig = new ArrangeRig();

        Assert.Equal(204, rig.Post(Body(rig.Key("V1001"), "step", "xray", null)).Status);
        Assert.Equal("10:00", rig.XrayMarks.Today()["V1001"]);
        Assert.Equal("done", rig.Row("V1001").GetProperty("cells").GetProperty("xray").GetProperty("st").GetString());

        Assert.Equal(204, rig.Post(Body(rig.Key("V1002"), "step", "xray", null)).Status);
        var hold = rig.Board().GetProperty("lists").GetProperty("hold")[0];
        Assert.Equal("10:00", hold.GetProperty("xray").GetProperty("at").GetString());

        Assert.Equal(204, rig.Post(Body(rig.Key("V1001"), "set", "xray", "todo")).Status);
        Assert.False(rig.XrayMarks.Today().ContainsKey("V1001"));
        Assert.Equal("todo", rig.Row("V1001").GetProperty("cells").GetProperty("xray").GetProperty("st").GetString());
        Assert.Empty(rig.ArrangeMarks.Today());
    }

    [Fact(DisplayName = "AC-3306.5 처방도 표시도 없는 칸의 step·set·part는 404이고 표시를 바꾸지 않는다")]
    public void MissingCell()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1003");
        Assert.Equal(404, rig.Post(Body(key, "step", "sono", null)).Status);
        Assert.Equal(404, rig.Post(Body(key, "set", "carm", "done")).Status);
        Assert.Equal(404, rig.Post(Body(key, "part", "sono", "목")).Status);
        Assert.Empty(rig.ArrangeMarks.Today());
    }

    [Fact(DisplayName = "AC-3306.6 쓰기·실패 뒤 기록(logs\\reception-*.log)에는 오류 번호만 남고 열쇠·칸·글은 없다")]
    public void LogHasCodesOnly()
    {
        using var rig = new ArrangeRig();
        var key = rig.Key("V1001");
        rig.Post(Body(key, "part", "sono", "오른 무릎"));
        rig.Post(Body(key, "add", "pt", "ICE"));
        rig.Send("POST", "/api/arrange", headers: ArrangeRig.WriteHeaders.Where(h => h.Key != "Origin"), body: Body(key, "away", null, "on"));

        var lines = rig.LogLines();
        LogAssert.Clean(lines);
        var text = string.Join("\n", lines);
        foreach (var leak in new[] { key, "sono", "pt", "ICE", "무릎", "arrange" }) Assert.DoesNotContain(leak, text);
    }

    [Fact(DisplayName = "AC-3306.1 접수 현황 프로그램(ReceptionServices)은 진짜 저장 폴더·DPAPI의 ArrangeMarks와 ArrangeMap.Rules를 라우터에 넘긴다")]
    public void ServicesWireArrange()
    {
        var source = File.ReadAllText(Repo.PathOf("helper", "src", "Precheck.Reception", "ReceptionServices.cs"));
        Assert.Contains("new ArrangeMarks(new StoreFolder(DataDirectory()), protector, Now, log.Note)", source);
        Assert.Contains("arrangeMarks: arrange", source);
        Assert.Contains("arrangeMap: ArrangeMap.Rules", source);
    }

    internal static byte[] Body(string key, string op, string? col, string? v)
    {
        var parts = new List<string> { "\"k\":\"" + key + "\"", "\"op\":\"" + op + "\"" };
        if (col != null) parts.Add("\"col\":\"" + col + "\"");
        if (v != null) parts.Add("\"v\":\"" + v + "\"");
        return Encoding.UTF8.GetBytes("{" + string.Join(",", parts) + "}");
    }
}

/// <summary>
/// ServeRig와 같은 한 벌에 ArrangeMarks·가짜 지도·오늘 처방 시각(V1001 SONO1 09:20·G1234 09:25, V1002 G1234 09:40)을 더한 것.
/// lists가 참이면 같은 저장 폴더의 고르기 목록(ReceptionLists, spec reception-pick-lists)도 라우터에 넘긴다.
/// settings를 넘기면 라우터가 그 설정으로 칸을 정하고(spec reception-other-clinic TASK-2), 넘기지 않으면 우리 의원 처음 값(지금 목록)이다.
/// 라우터는 이제 가짜 지도가 아니라 설정으로 칸을 정한다. 위 코드는 우리 의원 처음 값에서도 같은 칸이다(AC-5702.2).
/// </summary>
internal sealed class ArrangeRig : IDisposable
{
    public static readonly KeyValuePair<string, string>[] WriteHeaders =
    {
        new KeyValuePair<string, string>("Origin", "http://" + ServeRig.LanHost),
        new KeyValuePair<string, string>("X-Reception", "1"),
        new KeyValuePair<string, string>("Content-Type", "application/json"),
    };

    private static readonly IReadOnlyList<ArrangeRule> FakeMap = new[]
    {
        ArrangeRule.CodePattern(@"^G\d{4}$", ArrangeKeys.Xray),
        ArrangeRule.Code("SONO1", ArrangeKeys.Sono),
        ArrangeRule.Code("CARM1", ArrangeKeys.Carm),
    };

    private readonly TempFolder data = new TempFolder();
    private readonly TempFolder logs = new TempFolder();

    public ArrangeRig(bool registered = true, IReadOnlyDictionary<string, Lane>? statuses = null, bool lists = false, Func<ReceptionSettings>? settings = null)
    {
        Bit = new Rig();
        if (registered) Bit.Registered();
        Bit.Today = BoardFake.Morning.Date;
        BoardFake.Quiet(Bit.Session);
        DetailFake.Answer(Bit.Session);
        Bit.Session.Answer(ReceptionSql.TodayOrderTimes, _ => new[]
        {
            new object?[] { "V1001", "SONO1", "202611050920" },
            new object?[] { "V1001", "G1234", "202611050925" },
            new object?[] { "V1002", "G1234", "202611050940" },
        });
        Clock = new CacheClock(BoardFake.Morning);
        Cache = new BoardCache(Bit.Services, Clock.Now);
        Keys = new VisitKeys();
        Log = new ReceptionLog(logs.Path, Clock.Now);
        XrayMarks = new XrayMarks(new StoreFolder(data.Path), Bit.Protector, Clock.Now, Log.Note);
        ArrangeMarks = new ArrangeMarks(new StoreFolder(data.Path), Bit.Protector, Clock.Now, Log.Note);
        Lists = lists ? new ReceptionLists(new StoreFolder(data.Path), Bit.Protector, Log.Note) : null;
        Router = new ReceptionRouter(
            Bit.Services, Cache, XrayMarks, Keys, new StaticFiles(new FakeStatic()), () => new[] { ServeRig.ThisPc }, Log, Clock.Now,
            statuses ?? ServeRig.Statuses, new string[0], null, ArrangeMarks, FakeMap, Lists, settings);
    }

    /// <summary>저장 폴더(data\).</summary>
    public string DataPath => data.Path;

    public ReceptionLists? Lists { get; }

    public Rig Bit { get; }
    public CacheClock Clock { get; }
    public BoardCache Cache { get; }
    public VisitKeys Keys { get; }
    public ReceptionLog Log { get; }
    public XrayMarks XrayMarks { get; }
    public ArrangeMarks ArrangeMarks { get; }
    public ReceptionRouter Router { get; }

    public string Key(string visit) => Keys.KeyOf(ServeRig.Day, visit);

    public HttpResponse Send(string method, string target, IEnumerable<KeyValuePair<string, string>>? headers = null, byte[]? body = null)
    {
        var all = new List<KeyValuePair<string, string>> { new KeyValuePair<string, string>("Host", ServeRig.LanHost) };
        if (headers != null) all.AddRange(headers);
        return Router.Handle(new HttpRequest(method, target, all, body ?? new byte[0]), ServeRig.Phone, ReceptionPorts.Http);
    }

    public HttpResponse Post(string json, string target = "/api/arrange") => Post(Encoding.UTF8.GetBytes(json), target);

    public HttpResponse Post(byte[] body, string target = "/api/arrange") => Send("POST", target, WriteHeaders, body);

    /// <summary>묶음을 건너뛰어 지금 판을 읽는다.</summary>
    public JsonElement Board()
    {
        Clock.Advance(TimeSpan.FromSeconds(1));
        var answer = Send("GET", "/api/board?fresh=1");
        Assert.Equal(200, answer.Status);
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    public JsonElement Row(string visit) =>
        Board().GetProperty("arrange").GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("k").GetString() == Key(visit));

    public string[] LogLines()
    {
        Log.Flush();
        if (!Directory.Exists(logs.Path)) return new string[0];
        return Directory.GetFiles(logs.Path).OrderBy(f => f, StringComparer.Ordinal).SelectMany(f => File.ReadAllLines(f, Encoding.UTF8)).ToArray();
    }

    public void Dispose()
    {
        Bit.Dispose();
        data.Dispose();
        logs.Dispose();
    }
}
