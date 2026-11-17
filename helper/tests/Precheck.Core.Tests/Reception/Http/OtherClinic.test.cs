using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Reception.Cache;
using Precheck.Core.Tests.Reception.PickChoices;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;
// 같은 이름의 시험 이름 공간(Reception.SettingsRoutes)과 헷갈리지 않게
using Routes = Precheck.Core.Reception.Http.SettingsRoutes;

// 이 TASK(reception-other-clinic TASK-8)의 시험만 한 거르기로 돌리려고 OtherClinic 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.OtherClinic;

/// <summary>
/// 접수 현황 프로그램 한 벌을 ReceptionServices.CreateRouter와 같은 차례·같은 부품으로 잇는다(spec reception-other-clinic design.md 1절·4절·8절).
/// 가짜는 비트(Rig, 등록됨, 오늘 접수 셋 V1001 S1·V1002 S2·V1003 S1 + 처방 시각 V1001 US100·V1002 G1234)·암호화(Rig의 가짜 DPAPI 하나를 모든 파일이 같이 씀)·
/// 시계(2026-11-05 10:00)뿐이고, data\ 폴더(임시)·설정·로고·표시 파일·품은 화면 파일(진짜 logo-wordmark.png 포함)은 진짜다.
/// ours면 켜기 전에 지금 판이 남긴 흔적(고친 고르기 목록 reception-lists.dat·오늘 X-ray 표시 reception-marks.dat)을 둔다(우리 의원 총괄 PC).
/// </summary>
internal sealed class ClinicRig : IDisposable
{
    /// <summary>ReceptionServices가 옮기기에 읽는 품은 로고 이름(Core csproj의 reception/www → reception/…).</summary>
    public const string WordmarkName = "reception/logo-wordmark.png";

    public static readonly IPAddress Tablet = IPAddress.Parse("192.168.0.58");

    /// <summary>우리 의원이 지금 판에서 고쳐 둔 고르기 목록(C-ARM 시술에 꼬리뼈, PT에 냉찜질).</summary>
    public static readonly string OurListsJson = Picks.Body(
        procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false},{\"n\":\"리덕션\",\"noDrug\":true}]",
        pt: "[\"냉찜질\",\"ICE\"]");

    private static readonly JsonSerializerOptions Relaxed = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly TempFolder data = new TempFolder();
    private readonly TempFolder logs = new TempFolder();

    public ClinicRig(bool ours = false)
    {
        Bit = new Rig().Registered();
        Bit.Today = BoardFake.Morning.Date;
        BoardFake.Quiet(Bit.Session);
        Bit.Session.Answer(ReceptionSql.TodayOrderTimes, _ => new[]
        {
            new object?[] { "V1001", "US100", "202611050920" },
            new object?[] { "V1002", "G1234", "202611050940" },
        });
        Clock = new CacheClock(BoardFake.Morning);
        Keys = new VisitKeys();
        Log = new ReceptionLog(logs.Path, Clock.Now);
        if (ours) LeaveOldTraces();
        Start();
    }

    public Rig Bit { get; }
    public CacheClock Clock { get; }
    public VisitKeys Keys { get; }
    public ReceptionLog Log { get; }
    public LogoStore Logo { get; private set; } = null!;
    public SettingsStore Settings { get; private set; } = null!;
    public BoardCache Cache { get; private set; } = null!;
    public XrayMarks Marks { get; private set; } = null!;
    public ArrangeMarks Arrange { get; private set; } = null!;
    public ReceptionRouter Router { get; private set; } = null!;

    public string DataPath => data.Path;

    public string FileOf(string name) => Path.Combine(data.Path, name);

    public int BoardReads => Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.TodayVisits);

    /// <summary>지금 판(설정 없는 판)이 남긴 흔적: 고친 고르기 목록과 오늘 X-ray 표시(진료보류 V1002).</summary>
    private void LeaveOldTraces()
    {
        var folder = new StoreFolder(data.Path);
        if (!PickLists.TryParse(Encoding.UTF8.GetBytes(OurListsJson), out var lists)) throw new InvalidOperationException("시험 목록이 틀렸다");
        new ReceptionLists(folder, Bit.Protector).Save(lists);
        new XrayMarks(folder, Bit.Protector, Clock.Now).Set("V1002", true);
    }

    /// <summary>
    /// 접수 현황 프로그램을 (다시) 켠다. ReceptionServices.CreateRouter와 같은 차례: 로고·설정 저장 → 설정 한 번 읽기(표시 파일보다 먼저) → 캐시·표시 →
    /// 라우터(설정은 요청마다 Settings.Current, 새 길은 SettingsRoutes, 옛 목록 저장소는 넘기지 않음, 주소 보내기 화면은 같은 설정·로고 저장소, AC-5715).
    /// </summary>
    public void Start()
    {
        var folder = new StoreFolder(data.Path);
        Logo = new LogoStore(folder, Bit.Protector, Log.Note);
        Settings = new SettingsStore(folder, Bit.Protector, () => EmbeddedStaticSource.Core().Read(WordmarkName), Logo, Log.Note);
        Settings.Current();
        Cache = new BoardCache(Bit.Services, Clock.Now);
        Marks = new XrayMarks(folder, Bit.Protector, Clock.Now, Log.Note);
        Arrange = new ArrangeMarks(folder, Bit.Protector, Clock.Now, Log.Note);
        Router = new ReceptionRouter(
            Bit.Services,
            Cache,
            Marks,
            Keys,
            new StaticFiles(EmbeddedStaticSource.Core()),
            () => new[] { ServeRig.ThisPc },
            Log,
            Clock.Now,
            ServeRig.Statuses,
            new string[0],
            linkPage: LinkPage.For(() => new[] { ServeRig.ThisPc }, Settings.Current, Logo),
            arrangeMarks: Arrange,
            arrangeMap: ArrangeMap.Rules,
            settings: Settings.Current,
            settingsRoutes: new Routes(Settings, Logo, new CodesReader(Bit.Services, Clock.Now), Log));
    }

    /// <summary>이 PC 자신(루프백)의 GET /link HTML(200이어야 한다).</summary>
    public string LinkHtml()
    {
        var answer = Send("GET", "/link", client: IPAddress.Loopback, host: "127.0.0.1:" + ReceptionPorts.Http);
        Assert.Equal(200, answer.Status);
        Assert.Equal("text/html; charset=utf-8", answer.ContentType);
        return Encoding.UTF8.GetString(answer.Body);
    }

    /// <summary>지금 판(설정 없음)처럼 이은 라우터: 같은 캐시·표시·열쇠에 옛 고르기 목록 저장소. 우리 화면이 같은지 견줄 때 쓴다.</summary>
    public ReceptionRouter OldRouter() => new ReceptionRouter(
        Bit.Services,
        Cache,
        Marks,
        Keys,
        new StaticFiles(EmbeddedStaticSource.Core()),
        () => new[] { ServeRig.ThisPc },
        Log,
        Clock.Now,
        ServeRig.Statuses,
        new string[0],
        arrangeMarks: Arrange,
        arrangeMap: ArrangeMap.Rules,
        lists: new ReceptionLists(new StoreFolder(data.Path), Bit.Protector, Log.Note));

    public static IEnumerable<KeyValuePair<string, string>> WriteHeaders(string contentType = "application/json") => new[]
    {
        new KeyValuePair<string, string>("Origin", "http://" + ServeRig.LanHost),
        new KeyValuePair<string, string>("X-Reception", "1"),
        new KeyValuePair<string, string>("Content-Type", contentType),
    };

    public HttpResponse Send(
        string method, string target, IEnumerable<KeyValuePair<string, string>>? headers = null, byte[]? body = null,
        IPAddress? client = null, string host = ServeRig.LanHost, ReceptionRouter? router = null)
    {
        var all = new List<KeyValuePair<string, string>> { new KeyValuePair<string, string>("Host", host) };
        if (headers != null) all.AddRange(headers);
        return (router ?? Router).Handle(new HttpRequest(method, target, all, body ?? new byte[0]), client ?? ServeRig.Phone, ReceptionPorts.Http);
    }

    public HttpResponse Get(string target, IPAddress? client = null) => Send("GET", target, client: client);

    /// <summary>GET /api/board(묶음 안이면 비트를 다시 읽지 않는다).</summary>
    public JsonElement Board(IPAddress? client = null, ReceptionRouter? router = null)
    {
        var answer = Send("GET", "/api/board", client: client, router: router);
        Assert.Equal(200, answer.Status);
        return Json(answer);
    }

    /// <summary>묶음을 건너뛰어 지금 판을 읽는다.</summary>
    public JsonElement FreshBoard()
    {
        Clock.Advance(TimeSpan.FromSeconds(3));
        var answer = Send("GET", "/api/board?fresh=1");
        Assert.Equal(200, answer.Status);
        return Json(answer);
    }

    /// <summary>GET /api/settings 문서(고쳐서 다시 보낼 수 있게 노드로).</summary>
    public JsonObject SettingsDoc()
    {
        var answer = Get("/api/settings");
        Assert.Equal(200, answer.Status);
        return JsonNode.Parse(answer.Body)!.AsObject();
    }

    /// <summary>화면처럼(JSON.stringify, 한글 그대로) POST /api/settings.</summary>
    public HttpResponse SaveSettings(JsonObject doc, IPAddress? client = null) =>
        Send("POST", "/api/settings", WriteHeaders(), Encoding.UTF8.GetBytes(doc.ToJsonString(Relaxed)), client);

    public HttpResponse PostLogo(byte[] picture, string contentType, IPAddress? client = null) =>
        Send("POST", "/api/logo", WriteHeaders(contentType), picture, client);

    public static JsonElement Json(HttpResponse answer)
    {
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    public static JsonObject Col(JsonObject doc, string k) => doc["cols"]!.AsArray().First(c => (string)c!["k"]! == k)!.AsObject();

    public static JsonElement CfgCol(JsonElement board, string k) =>
        board.GetProperty("cfg").GetProperty("cols").EnumerateArray().Single(c => c.GetProperty("k").GetString() == k);

    public JsonElement Row(JsonElement board, string visit) =>
        board.GetProperty("arrange").GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("k").GetString() == Keys.KeyOf(ServeRig.Day, visit));

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

/// <summary>시험용 그림 바이트(픽셀 없이 서명·크기만 맞음).</summary>
internal static class Pictures
{
    private static byte[] Segment(byte marker, params byte[] body) =>
        new byte[] { 0xFF, marker, (byte)((body.Length + 2) >> 8), (byte)(body.Length + 2) }.Concat(body).ToArray();

    /// <summary>SOI → APP0(JFIF) → SOF0(세로·가로) → SOS → 자료 → EOI. 화면이 줄여 보내는 가장 큰 크기(1200×300)도 이것으로 만든다.</summary>
    public static byte[] Jpeg(int width, int height)
    {
        var app0 = Segment(0xE0, Encoding.ASCII.GetBytes("JFIF\0").Concat(new byte[] { 1, 1, 0, 0, 1, 0, 1, 0, 0 }).ToArray());
        var frame = Segment(0xC0, 8, (byte)(height >> 8), (byte)height, (byte)(width >> 8), (byte)width, 1, 1, 0x11, 0);
        var scan = Segment(0xDA, 1, 1, 0, 0, 0x3F, 0);
        return new byte[] { 0xFF, 0xD8 }.Concat(app0).Concat(frame).Concat(scan).Concat(new byte[] { 0x12, 0x34, 0xFF, 0xD9 }).ToArray();
    }

    /// <summary>저장소의 진짜 우리 의원 로고(862×132 PNG, 146KB — 옛 몸 한도 8192바이트보다 크다).</summary>
    public static byte[] Wordmark() => File.ReadAllBytes(Repo.PathOf("reception", "www", "logo-wordmark.png"));
}

/// <summary>
/// 잇기 — 라우터에 새 길·옛 목록 길 닫기·끝까지 시험(spec reception-other-clinic TASK-8, design.md 4절·8절).
/// AC-5704.3 저장 뒤 어느 기기든 다음 GET /api/board부터 새 cfg·picks·칸(설정은 비트 읽기 캐시와 따로).
/// AC-5704.4 POST /api/lists 404, reception-lists.dat는 쓰지도 지우지도 않는다.
/// AC-5705.5·AC-5706.4·AC-5707.6·AC-5707.7 [의원 PC]: 진짜 비트·사진·설치는 의원 PC에서 보고, 여기서는 그 길이 끝까지 이어졌는지만 본다.
/// AC-5706.2 GET /api/logo가 라우터에서 그림·404이고 보안 머리가 다른 답과 같다. AC-5707.8 접수 현황 프로그램의 확인 창 제목(글자 살피기).
/// </summary>
public class OtherClinicTests
{
    private static readonly string[] Originals = { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" };

    private static string Names(JsonElement array) => string.Join(",", array.EnumerateArray().Select(v => v.GetString()));

    // ---- 새 병원: 처음 켜기 → 설정 → 판 → 로고 -----------------------------------------------------------

    [Fact(DisplayName = "AC-5707.6 [의원 PC 앞 단계] 새 병원 처음 켜기: 켤 때 설정 파일을 먼저 만들고(표시 파일보다 먼저) 판 cfg는 로고 없이·안내 켜짐·일곱 칸·SONO·C-ARM empty이며, 로고는 404다")]
    public void FreshClinicFirstStart()
    {
        using var rig = new ClinicRig();
        Assert.True(File.Exists(rig.FileOf(SettingsStore.FileName)));
        Assert.False(File.Exists(rig.FileOf(XrayMarks.FileName)));
        Assert.False(File.Exists(rig.FileOf(ArrangeMarks.FileName)));
        Assert.False(File.Exists(rig.FileOf(ReceptionLists.FileName)));
        Assert.False(File.Exists(rig.FileOf(LogoStore.FileName)));

        var board = rig.Board();
        var cfg = board.GetProperty("cfg");
        Assert.Equal("{\"mode\":\"none\",\"text\":null,\"ver\":0}", cfg.GetProperty("logo").GetRawText());
        Assert.True(cfg.GetProperty("tab").GetBoolean());
        Assert.True(cfg.GetProperty("guide").GetBoolean());
        Assert.Equal(Originals, cfg.GetProperty("cols").EnumerateArray().Select(c => c.GetProperty("k").GetString()));
        Assert.True(ClinicRig.CfgCol(board, "sono").GetProperty("empty").GetBoolean());
        Assert.True(ClinicRig.CfgCol(board, "carm").GetProperty("empty").GetBoolean());
        Assert.False(ClinicRig.CfgCol(board, "xray").GetProperty("empty").GetBoolean());
        // 새 병원에는 우리 의원 처방 코드가 없다: US100(V1001)은 아무 칸에도 들지 않고, 단순 촬영 G 코드(V1002)는 X-RAY 규칙으로 든다
        Assert.Equal(JsonValueKind.Null, rig.Row(board, "V1001").GetProperty("cells").GetProperty("sono").ValueKind);
        Assert.Equal("todo", rig.Row(board, "V1002").GetProperty("cells").GetProperty("xray").GetProperty("st").GetString());

        Assert.Equal(404, rig.Get("/api/logo").Status);
        var settings = rig.SettingsDoc();
        Assert.Equal(0, (long)settings["rev"]!);
        Assert.Equal("{\"logo\":false,\"tab\":false,\"done\":false}", settings["setup"]!.ToJsonString());
    }

    [Fact(DisplayName = "AC-5707.6 [의원 PC 앞 단계] 새 병원이 X-ray 표시를 남긴 뒤 다시 켜도 우리 의원으로 보지 않는다(설정 파일이 표시 파일보다 먼저 있어서): 로고 없음·SONO 코드 없음 그대로")]
    public void FreshClinicStaysFreshAfterRestart()
    {
        using var rig = new ClinicRig();
        var hold = rig.Keys.KeyOf(ServeRig.Day, "V1002");
        var xray = rig.Send("POST", "/api/xray", ClinicRig.WriteHeaders(), Encoding.UTF8.GetBytes("{\"k\":\"" + hold + "\",\"on\":true}"));
        Assert.Equal(204, xray.Status);
        Assert.True(File.Exists(rig.FileOf(XrayMarks.FileName)));

        rig.Start();

        var board = rig.FreshBoard();
        Assert.Equal("{\"mode\":\"none\",\"text\":null,\"ver\":0}", board.GetProperty("cfg").GetProperty("logo").GetRawText());
        Assert.True(board.GetProperty("cfg").GetProperty("guide").GetBoolean());
        Assert.True(ClinicRig.CfgCol(board, "sono").GetProperty("empty").GetBoolean());
        Assert.Empty(ClinicRig.Col(rig.SettingsDoc(), "sono")["codes"]!.AsArray());
        Assert.Equal(404, rig.Get("/api/logo").Status);
        Assert.False(File.Exists(rig.FileOf(LogoStore.FileName)));
    }

    [Fact(DisplayName = "AC-5704.3 설정 저장(SONO 코드·PT 이름·PT 목록) 뒤 다른 기기의 다음 GET /api/board부터 새 cfg·칸·picks가 나오고, 비트는 다시 읽지 않는다(설정은 읽기 캐시와 따로)")]
    public void SavedSettingsShowOnNextBoard()
    {
        using var rig = new ClinicRig();
        var before = rig.Board();
        Assert.Equal(1, rig.BoardReads);
        Assert.Equal(JsonValueKind.Null, rig.Row(before, "V1001").GetProperty("cells").GetProperty("sono").ValueKind);
        Assert.Equal("PT", ClinicRig.CfgCol(before, "pt").GetProperty("name").GetString());
        Assert.Equal("ICE,HP", Names(before.GetProperty("picks").GetProperty("pt")));

        var doc = rig.SettingsDoc();
        ClinicRig.Col(doc, "sono")["codes"] = new JsonArray("US100");
        ClinicRig.Col(doc, "pt")["name"] = "물리치료";
        doc["picks"]!["pt"] = new JsonArray("냉찜질", "ICE", "HP");
        Assert.Equal(204, rig.SaveSettings(doc).Status);

        var after = rig.Board(ClinicRig.Tablet);
        Assert.Equal(1, rig.BoardReads);
        Assert.False(ClinicRig.CfgCol(after, "sono").GetProperty("empty").GetBoolean());
        Assert.Equal("todo", rig.Row(after, "V1001").GetProperty("cells").GetProperty("sono").GetProperty("st").GetString());
        Assert.Equal("물리치료", ClinicRig.CfgCol(after, "pt").GetProperty("name").GetString());
        Assert.Equal("냉찜질,ICE,HP", Names(after.GetProperty("picks").GetProperty("pt")));
        Assert.Equal(1, (long)rig.SettingsDoc()["rev"]!);

        // 다시 켜도(파일에서 읽어도) 같은 설정이다
        rig.Start();
        var restarted = rig.FreshBoard();
        Assert.Equal("todo", rig.Row(restarted, "V1001").GetProperty("cells").GetProperty("sono").GetProperty("st").GetString());
        Assert.Equal("물리치료", ClinicRig.CfgCol(restarted, "pt").GetProperty("name").GetString());
    }

    [Fact(DisplayName = "AC-5704.3 설정에서 바꾼 칸으로 POST /api/arrange도 본다: 새 PT 목록 이름은 204, 목록에 없는 이름은 400, 숨긴 칸은 400")]
    public void ArrangeWritesFollowSettings()
    {
        using var rig = new ClinicRig();
        var key = rig.Keys.KeyOf(ServeRig.Day, "V1003");
        byte[] Add(string col, string v) => Encoding.UTF8.GetBytes("{\"k\":\"" + key + "\",\"op\":\"add\",\"col\":\"" + col + "\",\"v\":\"" + v + "\"}");
        Assert.Equal(400, rig.Send("POST", "/api/arrange", ClinicRig.WriteHeaders(), Add("pt", "냉찜질")).Status);

        var doc = rig.SettingsDoc();
        doc["picks"]!["pt"] = new JsonArray("냉찜질");
        ClinicRig.Col(doc, "trac")["show"] = false;
        Assert.Equal(204, rig.SaveSettings(doc).Status);

        // 목록에 없는 이름을 먼저(칸이 비어 있을 때) 보내 칸이 찬 까닭의 400과 섞이지 않게 한다
        Assert.Equal(400, rig.Send("POST", "/api/arrange", ClinicRig.WriteHeaders(), Add("pt", "ICE")).Status);
        Assert.Equal(204, rig.Send("POST", "/api/arrange", ClinicRig.WriteHeaders(), Add("pt", "냉찜질")).Status);
        Assert.Equal(400, rig.Send("POST", "/api/arrange", ClinicRig.WriteHeaders(), Add("trac", "목")).Status);
        Assert.Equal("냉찜질", rig.Row(rig.FreshBoard(), "V1003").GetProperty("cells").GetProperty("pt").GetProperty("det").GetString());
    }

    [Fact(DisplayName = "AC-5704.3 새 길은 Host 검사 뒤에 있다: 이 PC 주소가 아닌 Host·공인 주소에서 온 요청은 403(비트·설정을 읽지 않음), OPTIONS는 405(Allow: GET, POST), 새 길을 넘기지 않은 라우터에는 그 길이 없다(404)")]
    public void NewRoutesBehindHostCheck()
    {
        using var rig = new ClinicRig();
        foreach (var target in new[] { "/api/settings", "/api/codes", "/api/code/US100", "/api/logo" })
        {
            Assert.Equal(403, rig.Send("GET", target, host: "evil.example:47200").Status);
            Assert.Equal(403, rig.Send("GET", target, client: IPAddress.Parse("8.8.8.8")).Status);
            var options = rig.Send("OPTIONS", target);
            Assert.Equal(405, options.Status);
            Assert.Equal("GET, POST", options.Header("Allow"));
        }
        Assert.Equal(403, rig.Send("POST", "/api/settings", ClinicRig.WriteHeaders(), Encoding.UTF8.GetBytes(rig.SettingsDoc().ToJsonString()), host: "evil.example:47200").Status);
        Assert.Equal(403, rig.Send("POST", "/api/logo", ClinicRig.WriteHeaders("image/jpeg"), Pictures.Jpeg(10, 10), host: "evil.example:47200").Status);
        Assert.DoesNotContain(rig.Bit.Session.Calls, call => call.Sql == ReceptionSql.RecentCodes || call.Sql == ReceptionSql.CodeName);
        Assert.Equal(0, (long)rig.SettingsDoc()["rev"]!);
        Assert.False(File.Exists(rig.FileOf(LogoStore.FileName)));

        using var plain = new ServeRig();
        foreach (var target in new[] { "/api/settings", "/api/codes", "/api/code/US100", "/api/logo" }) Assert.Equal(404, plain.Get(target).Status);
    }

    // ---- 로고 --------------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5706.2 라우터의 GET /api/logo: 로고 파일이 없으면 404, 올리면 200 + 그 형식과 그림이고, 보안 머리 다섯 개는 판 답과 같다")]
    public void LogoRouteThroughRouter()
    {
        using var rig = new ClinicRig();
        var missing = rig.Get("/api/logo");
        Assert.Equal(404, missing.Status);
        Assert.Empty(missing.Body);

        var picture = Pictures.Jpeg(640, 160);
        Assert.Equal(204, rig.PostLogo(picture, "image/jpeg").Status);

        var logo = rig.Get("/api/logo");
        Assert.Equal(200, logo.Status);
        Assert.Equal("image/jpeg", logo.ContentType);
        Assert.Equal(picture, logo.Body);
        var board = rig.Send("GET", "/api/board");
        foreach (var header in HttpResponse.SecurityHeaders)
        {
            Assert.Equal(header.Value, logo.Header(header.Key));
            Assert.Equal(header.Value, missing.Header(header.Key));
            Assert.Equal(board.Header(header.Key), logo.Header(header.Key));
        }
        var wire = Encoding.ASCII.GetString(logo.ToBytes());
        Assert.Contains("\r\nConnection: close\r\n", wire, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5706.4 [의원 PC 앞 단계] 화면이 줄여 보낸 그림(JPEG 1200×300)을 올리면 다음 판 cfg.logo가 pic·ver +1(모든 기기)이고 GET /api/logo가 그 그림이다. 다시 올리면 ver +1, 그림은 하나")]
    public void ShrunkPhotoBecomesLogo()
    {
        using var rig = new ClinicRig();
        rig.Board();
        var photo = Pictures.Jpeg(1200, 300);
        Assert.Equal(204, rig.PostLogo(photo, "image/jpeg").Status);

        var board = rig.Board(ClinicRig.Tablet);
        Assert.Equal("{\"mode\":\"pic\",\"text\":null,\"ver\":1}", board.GetProperty("cfg").GetProperty("logo").GetRawText());
        Assert.Equal(1, rig.BoardReads);
        Assert.Equal(photo, rig.Get("/api/logo", ClinicRig.Tablet).Body);
        var settings = rig.SettingsDoc();
        Assert.True((bool)settings["setup"]!["logo"]!);
        Assert.Equal(1, (long)settings["rev"]!);

        var second = Pictures.Jpeg(300, 100);
        Assert.Equal(204, rig.PostLogo(second, "image/jpeg").Status);
        Assert.Equal(2, rig.Board().GetProperty("cfg").GetProperty("logo").GetProperty("ver").GetInt32());
        Assert.Equal(second, rig.Get("/api/logo").Body);
        Assert.Equal(400, rig.PostLogo(Pictures.Jpeg(1201, 300), "image/jpeg").Status);
        Assert.Equal(second, rig.Get("/api/logo").Body);
    }

    [Fact(DisplayName = "AC-5706.2 AC-5706.4 진짜 소켓(ReceptionServer → 라우터): 8192바이트보다 큰 그림(146KB PNG)도 POST /api/logo로 올라가 204이고, GET /api/logo가 같은 바이트·image/png·보안 머리로 돌려준다")]
    public void LogoThroughRealServer()
    {
        using var rig = new ClinicRig();
        using var server = new ReceptionServer(rig.Router, rig.Log, TimeSpan.FromSeconds(20));
        server.Start(IPAddress.Loopback, 0);
        var host = "127.0.0.1:" + server.Port;
        var picture = Pictures.Wordmark();
        Assert.True(picture.Length > HttpRequestReader.MaxBody);

        var head = "POST /api/logo HTTP/1.1\r\nHost: " + host + "\r\nOrigin: http://" + host + "\r\nX-Reception: 1\r\nContent-Type: image/png\r\nContent-Length: "
            + picture.Length + "\r\n\r\n";
        Reply posted;
        using (var client = Wire.Connect(server.Port))
        {
            var bytes = Encoding.ASCII.GetBytes(head).Concat(picture).ToArray();
            client.GetStream().Write(bytes, 0, bytes.Length);
            client.GetStream().Flush();
            posted = Wire.Parse(Wire.ReadToEnd(client, TimeSpan.FromSeconds(15)));
        }
        Assert.Equal(204, posted.Status);

        var logo = Wire.Exchange(server.Port, "GET /api/logo HTTP/1.1\r\nHost: " + host + "\r\n\r\n");
        Assert.Equal(200, logo.Status);
        Assert.Equal("image/png", logo.Headers["Content-Type"]);
        Assert.Equal(picture, logo.Body);
        foreach (var header in HttpResponse.SecurityHeaders) Assert.Equal(header.Value, logo.Headers[header.Key]);
        Assert.Equal("close", logo.Headers["Connection"]);

        var board = Wire.Exchange(server.Port, "GET /api/board HTTP/1.1\r\nHost: " + host + "\r\n\r\n");
        Assert.Equal(200, board.Status);
        using var document = JsonDocument.Parse(board.Body);
        Assert.Equal("pic", document.RootElement.GetProperty("cfg").GetProperty("logo").GetProperty("mode").GetString());
        Assert.Equal(1, document.RootElement.GetProperty("cfg").GetProperty("logo").GetProperty("ver").GetInt32());
    }

    // ---- 처방 코드 목록 ------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5705.5 [의원 PC 앞 단계] 라우터의 GET /api/codes·/api/code/{c}가 등록 확인을 지나 그 병원 비트를 읽는다(진짜 코드·이름·내원 수는 의원 PC)")]
    public void CodesThroughRouter()
    {
        using var rig = new ClinicRig();
        rig.Bit.Session.Answer(ReceptionSql.RecentCodes, _ => new[] { new object?[] { "US100", 12L }, new object?[] { "PT01", 3L } });
        rig.Bit.Session.Answer(ReceptionSql.CodeName, _ => new[] { new object?[] { "초음파 검사" } });

        var codes = rig.Get("/api/codes");
        Assert.Equal(200, codes.Status);
        Assert.Equal("{\"codes\":[{\"c\":\"US100\",\"n\":null,\"v\":12},{\"c\":\"PT01\",\"n\":\"표층열치료\",\"v\":3}]}", Encoding.UTF8.GetString(codes.Body));
        var one = rig.Get("/api/code/us100");
        Assert.Equal(200, one.Status);
        Assert.Equal("{\"c\":\"US100\",\"n\":\"초음파 검사\"}", Encoding.UTF8.GetString(one.Body));
        Assert.Equal(404, rig.Get("/api/code/A-B").Status);
        Assert.Equal(1, rig.Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.RecentCodes));
        Assert.Equal(1, rig.Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.CodeName));
    }

    // ---- 옛 목록 길 닫기 ------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5704.4 접수 현황 프로그램의 라우터에는 POST /api/lists가 없다: 맞는 목록 몸·쓰기 머리여도 404(다른 방법도 404)이고 reception-lists.dat를 만들지 않으며, 목록은 설정 문서 picks 그대로다")]
    public void ListsRouteIsClosed()
    {
        using var rig = new ClinicRig();
        var body = Encoding.UTF8.GetBytes(ClinicRig.OurListsJson);
        var answer = rig.Send("POST", "/api/lists", ClinicRig.WriteHeaders(), body);
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(404, rig.Send("GET", "/api/lists").Status);
        Assert.Equal(404, rig.Send("PUT", "/api/lists", ClinicRig.WriteHeaders(), body).Status);
        Assert.False(File.Exists(rig.FileOf(ReceptionLists.FileName)));
        Assert.Equal("ICE,HP", Names(rig.Board().GetProperty("picks").GetProperty("pt")));
    }

    [Fact(DisplayName = "AC-5704.4 설정을 넘긴 라우터는 옛 목록 저장소를 함께 받아도 /api/lists가 없다(404, 목록 파일을 쓰지 않음)")]
    public void ListsRouteClosedEvenWithStore()
    {
        using var rig = new ClinicRig();
        var both = new ReceptionRouter(
            rig.Bit.Services, rig.Cache, rig.Marks, rig.Keys, new StaticFiles(EmbeddedStaticSource.Core()), () => new[] { ServeRig.ThisPc }, rig.Log, rig.Clock.Now,
            ServeRig.Statuses, new string[0],
            arrangeMarks: rig.Arrange,
            lists: new ReceptionLists(new StoreFolder(rig.DataPath), rig.Bit.Protector),
            settings: rig.Settings.Current);
        Assert.Equal(404, rig.Send("POST", "/api/lists", ClinicRig.WriteHeaders(), Encoding.UTF8.GetBytes(ClinicRig.OurListsJson), router: both).Status);
        Assert.False(File.Exists(rig.FileOf(ReceptionLists.FileName)));
    }

    // ---- 우리 의원: 새 판으로 바꿔도 지금과 같음 ----------------------------------------------------------------

    [Fact(DisplayName = "AC-5707.7 [의원 PC 앞 단계] 옛 표시·목록 파일이 있는 data 폴더(우리 의원)면 우리 의원 처음 값: 판 JSON이 지금 판(설정 없는 라우터)과 한 글자도 같고, 고친 목록이 그대로다")]
    public void OurClinicBoardUnchanged()
    {
        using var rig = new ClinicRig(ours: true);
        var settings = rig.SettingsDoc();
        Assert.Equal("{\"mode\":\"pic\",\"text\":null,\"ver\":1}", settings["logo"]!.ToJsonString());
        Assert.True((bool)settings["setup"]!["done"]!);
        Assert.Equal(new[] { "SONO1", "SONO", "EB422", "EB466", "HA280" }, ClinicRig.Col(settings, "sono")["codes"]!.AsArray().Select(v => (string)v!));
        Assert.Equal(new[] { "CARM1", "G0400" }, ClinicRig.Col(settings, "carm")["codes"]!.AsArray().Select(v => (string)v!));

        var now = Encoding.UTF8.GetString(rig.Send("GET", "/api/board").Body);
        var old = Encoding.UTF8.GetString(rig.Send("GET", "/api/board", router: rig.OldRouter()).Body);
        Assert.Equal(old, now);
        Assert.Equal(1, rig.BoardReads);

        var board = rig.Board();
        Assert.False(board.GetProperty("cfg").GetProperty("guide").GetBoolean());
        Assert.Equal("냉찜질,ICE", Names(board.GetProperty("picks").GetProperty("pt")));
        Assert.Contains("꼬리뼈", board.GetProperty("picks").GetProperty("carm").GetProperty("procs").EnumerateArray().Select(p => p.GetProperty("n").GetString()));
        Assert.Equal("10:00", board.GetProperty("lists").GetProperty("hold")[0].GetProperty("xray").GetProperty("at").GetString());
    }

    [Fact(DisplayName = "AC-5707.7 [의원 PC 앞 단계] 우리 의원은 품은 로고(logo-wordmark.png)가 로고 파일로 옮겨져 GET /api/logo가 그 그림이고, 옛 reception-lists.dat는 켜기·설정 저장·닫힌 목록 길 뒤에도 한 바이트도 바뀌지 않는다")]
    public void OurClinicLogoAndOldListsKept()
    {
        using var rig = new ClinicRig(ours: true);
        var listsBefore = File.ReadAllBytes(rig.FileOf(ReceptionLists.FileName));

        var logo = rig.Get("/api/logo");
        Assert.Equal(200, logo.Status);
        Assert.Equal("image/png", logo.ContentType);
        Assert.Equal(Pictures.Wordmark(), logo.Body);
        Assert.Equal(EmbeddedStaticSource.Core().Read(ClinicRig.WordmarkName), logo.Body);

        var doc = rig.SettingsDoc();
        doc["picks"]!["pt"] = new JsonArray("HP");
        Assert.Equal(204, rig.SaveSettings(doc).Status);
        Assert.Equal(404, rig.Send("POST", "/api/lists", ClinicRig.WriteHeaders(), Encoding.UTF8.GetBytes(Picks.Body())).Status);
        rig.Start();
        Assert.Equal("HP", Names(rig.FreshBoard().GetProperty("picks").GetProperty("pt")));

        Assert.Equal(listsBefore, File.ReadAllBytes(rig.FileOf(ReceptionLists.FileName)));
        Assert.Equal(1, rig.Board().GetProperty("cfg").GetProperty("logo").GetProperty("ver").GetInt32());
    }

    // ---- 주소 보내기 화면 /link의 머리 로고(AC-5715, 명세 고침 2026-11-17) ------------------------------------------

    private const string LinkTitleLine = "<h1 class=\"link-title\">접수 현황 주소 보내기</h1>\n";

    /// <summary>header.link-top 안 HTML.</summary>
    private static string LinkHead(string html)
    {
        var head = Regex.Match(html, "<header class=\"link-top\">\n([\\s\\S]*?)</header>");
        Assert.True(head.Success, "header.link-top이 없다");
        return head.Groups[1].Value;
    }

    private static string LinkPicture(string type, byte[] bytes) =>
        "<img class=\"link-logo\" src=\"data:" + type + ";base64," + Convert.ToBase64String(bytes) + "\" alt=\"병원 로고\">\n";

    private static void NotOurClinicName(string html)
    {
        Assert.DoesNotContain("양지바른정형외과", html, StringComparison.Ordinal);
        Assert.DoesNotContain("/logo-wordmark.png", html, StringComparison.Ordinal);
        Assert.DoesNotContain("/logo-mark.png", html, StringComparison.Ordinal);
        Assert.Contains("<link rel=\"icon\" href=\"/icon.png\" type=\"image/png\">", html, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5715.3 [잇기] 우리 의원 data 폴더(옛 표시·목록 파일)면 이 PC의 GET /link 머리는 지금처럼 우리 로고 그림(옮긴 품은 logo-wordmark.png, data: URL)이고 탭 아이콘은 /icon.png다")]
    public void OurClinicLinkShowsOurLogo()
    {
        using var rig = new ClinicRig(ours: true);
        var html = rig.LinkHtml();
        Assert.Equal(LinkPicture("image/png", Pictures.Wordmark()) + LinkTitleLine, LinkHead(html));
        NotOurClinicName(html);
    }

    [Fact(DisplayName = "AC-5715.3 [잇기] 새 병원 처음 켜기면 이 PC의 GET /link는 로고 없이 제목만이고, 로고를 올리면 다음 /link부터 그 그림, 병원 이름 글자로 바꾸면 그 글자, 로고 없이로 바꾸면 다시 제목만이다(다시 켜도 같다)")]
    public void FreshClinicLinkFollowsSettings()
    {
        using var rig = new ClinicRig();
        var first = rig.LinkHtml();
        Assert.Equal(LinkTitleLine, LinkHead(first));
        Assert.DoesNotContain("<img", first, StringComparison.Ordinal);
        NotOurClinicName(first);

        var photo = Pictures.Jpeg(1200, 300);
        Assert.Equal(204, rig.PostLogo(photo, "image/jpeg").Status);
        var pic = rig.LinkHtml();
        Assert.Equal(LinkPicture("image/jpeg", photo) + LinkTitleLine, LinkHead(pic));
        NotOurClinicName(pic);

        var doc = rig.SettingsDoc();
        doc["logo"]!["mode"] = "text";
        doc["logo"]!["text"] = "새봄의원";
        Assert.Equal(204, rig.SaveSettings(doc).Status);
        Assert.Equal("<span class=\"link-logo-text\">새봄의원</span>\n" + LinkTitleLine, LinkHead(rig.LinkHtml()));

        rig.Start();
        Assert.Equal("<span class=\"link-logo-text\">새봄의원</span>\n" + LinkTitleLine, LinkHead(rig.LinkHtml()));

        doc = rig.SettingsDoc();
        doc["logo"]!["mode"] = "none";
        Assert.Equal(204, rig.SaveSettings(doc).Status);
        Assert.Equal(LinkTitleLine, LinkHead(rig.LinkHtml()));
        Assert.Equal(404, rig.Get("/link").Status);
    }

    // ---- 접수 현황 프로그램 잇기(글자 살피기, net48 프로그램이라 이 서버에서 돌리지 못함) ----------------------------

    private static string Read(params string[] parts) => File.ReadAllText(Repo.PathOf(parts), Encoding.UTF8);

    /// <summary>// 주석을 뺀 코드(낱말 검사가 설명 글에 걸리지 않게).</summary>
    private static string Statements(string source) => Regex.Replace(source, @"//.*$", "", RegexOptions.Multiline);

    private static string App(string name) => Statements(Read("helper", "src", "Precheck.Reception", name));

    private static string Squash(string text) => Regex.Replace(text, @"\s+", " ");

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    /// <summary>`CreateRouter(` 부터 그 메서드 끝(다음 `/// <summary>`)까지.</summary>
    private static string CreateRouterBody()
    {
        var services = Read("helper", "src", "Precheck.Reception", "ReceptionServices.cs");
        var from = services.IndexOf("public static ReceptionRouter CreateRouter(", StringComparison.Ordinal);
        Assert.True(from >= 0, "CreateRouter가 없다");
        var to = services.IndexOf("/// <summary>", from, StringComparison.Ordinal);
        return Squash(Statements(to > from ? services.Substring(from, to - from) : services.Substring(from)));
    }

    [Fact(DisplayName = "AC-5707.6 AC-5707.7 ReceptionServices는 같은 data\\·같은 DPAPI의 LogoStore·SettingsStore(품은 logo-wordmark.png)를 만들고, 표시 파일보다 먼저 Current()를 한 번 부르며, 라우터에 settings·SettingsRoutes를 넘긴다(옛 목록 저장소는 없음)")]
    public void ServicesWireSettings()
    {
        var body = CreateRouterBody();
        foreach (var part in new[]
        {
            "new LogoStore(new StoreFolder(DataDirectory()), protector, log.Note)",
            "new SettingsStore(new StoreFolder(DataDirectory()), protector, EmbeddedWordmark, logo, log.Note)",
            "settings.Current();",
            "settings: settings.Current",
            "settingsRoutes: new SettingsRoutes(settings, logo, new CodesReader(bit, Now), log)",
            "arrangeMarks: arrange",
            "arrangeMap: ArrangeMap.Rules",
        })
        {
            Assert.Contains(part, body, StringComparison.Ordinal);
        }
        Assert.Equal(1, Count(body, "settings.Current();"));
        Assert.True(body.IndexOf("settings.Current();", StringComparison.Ordinal) < body.IndexOf("new XrayMarks(", StringComparison.Ordinal));
        Assert.True(body.IndexOf("settings.Current();", StringComparison.Ordinal) < body.IndexOf("new ArrangeMarks(", StringComparison.Ordinal));

        var services = App("ReceptionServices.cs");
        Assert.Contains("\"" + ClinicRig.WordmarkName + "\"", services, StringComparison.Ordinal);
        Assert.Contains("EmbeddedStaticSource.Core().Read(", services, StringComparison.Ordinal);
        Assert.DoesNotContain("new ReceptionLists(", services, StringComparison.Ordinal);
        Assert.DoesNotContain("lists:", services, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5715.3 ReceptionServices는 주소 보내기 화면(LinkPage.For)에 라우터와 같은 SettingsStore(settings.Current)·LogoStore(logo)를 넘긴다: 설정·로고 저장소는 하나씩만 만든다")]
    public void ServicesWireLinkLogo()
    {
        var body = CreateRouterBody();
        Assert.Contains("linkPage: LinkPage.For(() => lan.Current(), settings.Current, logo)", body, StringComparison.Ordinal);
        Assert.DoesNotContain("linkPage: LinkPage.For(() => lan.Current())", body, StringComparison.Ordinal);
        Assert.Equal(1, Count(body, "new LogoStore("));
        Assert.Equal(1, Count(body, "new SettingsStore("));
        Assert.Equal(1, Count(body, "LinkPage.For("));
        Assert.True(body.IndexOf("new SettingsStore(", StringComparison.Ordinal) < body.IndexOf("LinkPage.For(", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-5707.6 RegisterEntry는 ReceptionServices.CreateBit(부품 만들기 한 곳: data\\ 등록 파일·비트 찾기·로그인 창·확인 창)로 RegisterFlow를 돈다: Precheck.Reception 안에 BitServices를 만드는 곳은 하나다")]
    public void RegisterEntrySharesParts()
    {
        var entry = App("RegisterEntry.cs");
        var services = App("ReceptionServices.cs");
        Assert.Contains("RegisterFlow.Run(ReceptionServices.CreateBit(new DpapiProtector()), readOnly: true)", Squash(entry), StringComparison.Ordinal);
        foreach (var word in new[] { "new BitServices(", "new RegistrationStore(", "new InstallationLocator(", "new ConfirmWindow(", "ReceptionServer", "Listen(" })
        {
            Assert.DoesNotContain(word, entry, StringComparison.Ordinal);
        }
        var all = string.Join("\n", Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Reception"), "*.cs").Select(f => Statements(File.ReadAllText(f, Encoding.UTF8))));
        Assert.Equal(1, Count(all, "new BitServices("));
        Assert.Equal(1, Count(all, "new RegistrationStore("));
        Assert.Contains("public static BitServices CreateBit(DpapiProtector protector)", Squash(services), StringComparison.Ordinal);
        Assert.Contains("new RegistrationStore(DataDirectory(), protector)", services, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5707.8 접수 현황 프로그램(서버·--register)의 비트 등록 확인 창 제목은 \"접수 현황\": Precheck.Reception은 ConfirmWindow에 그 제목을 넘기고 제목 없는 ConfirmWindow를 만들지 않는다")]
    public void ReceptionConfirmTitle()
    {
        var services = App("ReceptionServices.cs");
        Assert.Matches(new Regex(@"const string ConfirmTitle = ""접수 현황"";"), services);
        Assert.Contains("new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(ConfirmTitle), store)", services, StringComparison.Ordinal);
        var all = string.Join("\n", Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Reception"), "*.cs").Select(f => Statements(File.ReadAllText(f, Encoding.UTF8))));
        Assert.Equal(1, Count(all, "new ConfirmWindow("));
        Assert.DoesNotContain("new ConfirmWindow()", all, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5707.8 ConfirmWindow는 제목 인자를 받고(없으면 \"청구메모 도우미\") 창에 그 글을 쓴다. 도우미(PrecheckHelper.exe)의 확인·진행 창은 제목을 넘기지 않아 \"청구메모 도우미\" 그대로다")]
    public void HelperConfirmTitleUnchanged()
    {
        var window = Statements(Read("helper", "src", "Precheck.Windows", "ConfirmWindow.cs"));
        Assert.Contains("public const string Title = \"청구메모 도우미\";", window, StringComparison.Ordinal);
        Assert.Contains("public ConfirmWindow() : this(Title)", Squash(window), StringComparison.Ordinal);
        Assert.Contains("public ConfirmWindow(string title)", window, StringComparison.Ordinal);
        Assert.Contains("Text = title;", window, StringComparison.Ordinal);
        Assert.DoesNotContain("Text = Title;", window, StringComparison.Ordinal);
        Assert.Equal(1, Count(window, "Text = title;"));

        var progress = Statements(Read("helper", "src", "Precheck.Windows", "ProgressWindow.cs"));
        Assert.Contains("Text = ConfirmWindow.Title;", progress, StringComparison.Ordinal);
        var helper = string.Join("\n", Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Helper"), "*.cs", SearchOption.AllDirectories).Select(f => Statements(File.ReadAllText(f, Encoding.UTF8))));
        Assert.Equal(2, Count(helper, "new ConfirmWindow()"));
        Assert.Equal(Count(helper, "new ConfirmWindow("), Count(helper, "new ConfirmWindow()"));
    }
}
