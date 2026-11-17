using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Settings;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;
using Routes = Precheck.Core.Reception.Http.SettingsRoutes;

// 이 TASK의 시험만 한 거르기로 돌리려고 SettingsRoutes 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.SettingsRoutes;

/// <summary>
/// 설정 길 부품 한 벌: 임시 data 폴더의 SettingsStore·LogoStore(가짜 암호화 둘), 가짜 비트(Rig, 등록됨)의 CodesReader, 임시 기록 폴더, 가짜 시계(2026-11-05 10:00).
/// ours면 처음 읽기 전에 접수 현황을 쓴 흔적 파일(reception-arrange.dat)을 둔다(우리 의원 처음 값, 품은 로고는 가짜 PNG 862×132).
/// </summary>
internal sealed class RoutesRig : IDisposable
{
    public const string LanHost = "192.168.0.23:47200";

    public static readonly DateTime Morning = new DateTime(2026, 11, 5, 10, 0, 0);

    public static readonly byte[] Wordmark = LogoBytes.Png(862, 132);

    private readonly TempFolder data = new TempFolder();
    private readonly TempFolder logs = new TempFolder();

    public RoutesRig(bool ours = false)
    {
        if (ours)
        {
            Directory.CreateDirectory(data.Path);
            File.WriteAllBytes(Path.Combine(data.Path, ArrangeMarks.FileName), Encoding.ASCII.GetBytes("trace"));
        }
        Bit = new Rig().Registered();
        Bit.Today = Morning.Date;
        Clock = new StepClock(Morning);
        Log = new ReceptionLog(logs.Path, Clock.Now);
        Logo = new LogoStore(new StoreFolder(data.Path), LogoProtector, Log.Note);
        Settings = new SettingsStore(new StoreFolder(data.Path), Protector, () => Wordmark, Logo, Log.Note);
        Codes = new CodesReader(Bit.Services, Clock.Now);
        Routes = new Routes(Settings, Logo, Codes, Log);
    }

    public Rig Bit { get; }
    public StepClock Clock { get; }
    public ReceptionLog Log { get; }
    public XorProtector Protector { get; } = new XorProtector();
    public XorProtector LogoProtector { get; } = new XorProtector(0x33);
    public LogoStore Logo { get; }
    public SettingsStore Settings { get; }
    public CodesReader Codes { get; }
    public Routes Routes { get; }

    public string DataPath => data.Path;

    public static IEnumerable<KeyValuePair<string, string>> WriteHeaders(string? contentType = "application/json")
    {
        yield return new KeyValuePair<string, string>("Origin", "http://" + LanHost);
        yield return new KeyValuePair<string, string>("X-Reception", "1");
        if (contentType != null) yield return new KeyValuePair<string, string>("Content-Type", contentType);
    }

    /// <summary>길 부품 하나에 보낸 답. 설정 길이 아니면 null.</summary>
    public HttpResponse? Route(string method, string target, IEnumerable<KeyValuePair<string, string>>? headers = null, byte[]? body = null)
    {
        var all = new List<KeyValuePair<string, string>> { new KeyValuePair<string, string>("Host", LanHost) };
        if (headers != null) all.AddRange(headers);
        return Routes.Route(new HttpRequest(method, target, all, body ?? new byte[0]));
    }

    public HttpResponse Send(string method, string target, IEnumerable<KeyValuePair<string, string>>? headers = null, byte[]? body = null) =>
        Route(method, target, headers, body) ?? throw new InvalidOperationException("설정 길이 아니다: " + target);

    public HttpResponse Get(string target) => Send("GET", target);

    public HttpResponse PostSettings(byte[] body) => Send("POST", "/api/settings", WriteHeaders(), body);

    public HttpResponse PostSettings(JsonNode doc) => PostSettings(Docs.Bytes(Docs.Raw(doc)));

    public HttpResponse PostLogo(byte[] body, string? contentType = "image/png") => Send("POST", "/api/logo", WriteHeaders(contentType), body);

    /// <summary>지금 설정 문서를 고친 몸(rev는 지금 것).</summary>
    public JsonObject Edit(Action<JsonObject> change)
    {
        var doc = Docs.Node(Settings.Current());
        change(doc);
        return doc;
    }

    public string[] LogLines()
    {
        Log.Flush();
        var file = ReceptionLog.PathOf(logs.Path, Morning);
        return File.Exists(file) ? File.ReadAllLines(file).Where(line => line.Length > 0).ToArray() : new string[0];
    }

    public void Dispose()
    {
        Bit.Dispose();
        data.Dispose();
        logs.Dispose();
    }
}

/// <summary>
/// 설정·코드 목록·로고 길 부품(SettingsRoutes, spec reception-other-clinic design.md 4절). 라우터에 잇는 것은 TASK-8이고, 여기서는 HttpRequest → HttpResponse만 본다.
/// AC-5704.1 GET /api/settings 200 설정 문서. AC-5704.2 POST /api/settings 204·400·403·409·413·503.
/// AC-5705.1·5705.2 GET /api/codes·/api/code/{c}. AC-5706.1·5706.2 POST·GET /api/logo. AC-5706.3 .jpg·.jpeg 화면 파일 없음·CSP 그대로.
/// AC-5714.2 실패 기록은 오류 번호·건수만.
/// </summary>
public class SettingsRoutesTests
{
    private static readonly byte[] UnavailableBody = Encoding.UTF8.GetBytes("{\"state\":\"unavailable\"}");

    private static readonly Regex LogShape = new Regex(
        @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} - (E-[A-Z0-9]+(-[A-Z0-9]+)*|invalid) [1-9]\d*$");

    private static JsonElement Json(HttpResponse answer)
    {
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    private static string StatusLine(HttpResponse answer)
    {
        var text = Encoding.ASCII.GetString(answer.ToBytes());
        return text.Substring(0, text.IndexOf("\r\n", StringComparison.Ordinal));
    }

    private static void Unavailable(HttpResponse answer)
    {
        Assert.Equal(503, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        Assert.Equal(UnavailableBody, answer.Body);
    }

    private static void SecurityHeaders(HttpResponse answer)
    {
        foreach (var header in HttpResponse.SecurityHeaders) Assert.Equal(header.Value, answer.Header(header.Key));
        Assert.DoesNotContain(answer.Headers, h => h.Key.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase));
    }

    // ---- 길 나누기 --------------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-5704.1 Route는 설정·코드·로고 길만 맡고 다른 길은 null(라우터가 지금처럼 나눈다)")]
    [InlineData("/")]
    [InlineData("/api/board")]
    [InlineData("/api/lists")]
    [InlineData("/api/settings/")]
    [InlineData("/api/codes/")]
    [InlineData("/api/code")]
    [InlineData("/api/logo/")]
    [InlineData("/api/logos")]
    [InlineData("/API/SETTINGS")]
    public void OtherPathsNotMine(string path)
    {
        using var rig = new RoutesRig();
        Assert.Null(rig.Route("GET", path));
        Assert.Null(rig.Route("POST", path, RoutesRig.WriteHeaders(), new byte[] { (byte)'{', (byte)'}' }));
    }

    [Theory(DisplayName = "AC-5704.1 정해 둔 방법이 아니면 405(Allow)이고, 질의 글이 붙으면 404다")]
    [InlineData("PUT", "/api/settings", "GET, POST")]
    [InlineData("DELETE", "/api/settings", "GET, POST")]
    [InlineData("OPTIONS", "/api/settings", "GET, POST")]
    [InlineData("POST", "/api/codes", "GET")]
    [InlineData("POST", "/api/code/SONO1", "GET")]
    [InlineData("PUT", "/api/logo", "GET, POST")]
    public void MethodsAndQueries(string method, string path, string allow)
    {
        using var rig = new RoutesRig();
        var answer = rig.Send(method, path, RoutesRig.WriteHeaders());
        Assert.Equal(405, answer.Status);
        Assert.Equal(allow, answer.Header("Allow"));

        foreach (var target in new[] { path + "?x=1", path + "?" })
        {
            Assert.Equal(404, rig.Send("GET", target).Status);
        }
        Assert.Equal(404, rig.Send("POST", "/api/settings?x=1", RoutesRig.WriteHeaders(), Docs.Bytes(Docs.Raw(Docs.Node(rig.Settings.Current())))).Status);
        Assert.Equal(404, rig.Send("POST", "/api/logo?x=1", RoutesRig.WriteHeaders("image/png"), LogoBytes.Png(10, 10)).Status);
        Assert.Empty(rig.Bit.Connector.Opened);
        Assert.Null(rig.Logo.Read());
    }

    // ---- AC-5704.1 GET /api/settings --------------------------------------------------------------------

    [Theory(DisplayName = "AC-5704.1 GET /api/settings는 200 + 설정 문서 전체(AC-5701.1 모양, JSON)이고 쓰기 머리 없이도 읽힌다(읽기 길과 같은 검사)")]
    [InlineData(false)]
    [InlineData(true)]
    public void GetSettings(bool ours)
    {
        using var rig = new RoutesRig(ours);

        var answer = rig.Get("/api/settings");

        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        Assert.True(ReceptionSettings.TryParse(answer.Body, out var read));
        Assert.Equal(Docs.Json(rig.Settings.Current()), Docs.Json(read));
        Assert.Equal(ours ? LogoModes.Pic : LogoModes.None, read.Logo.Mode);
        Assert.Equal(new[] { "rev", "logo", "tab", "setup", "nextX", "cols", "picks" }, Json(answer).EnumerateObject().Select(p => p.Name).ToArray());
        SecurityHeaders(answer);
    }

    // ---- AC-5704.2 POST /api/settings -------------------------------------------------------------------

    [Fact(DisplayName = "AC-5704.2 rev가 맞는 바른 문서면 저장(rev +1)하고 204이며, 다음 GET /api/settings에 새 문서가 나온다")]
    public void SaveSettings()
    {
        using var rig = new RoutesRig();
        var before = rig.Settings.Current();
        var doc = rig.Edit(d =>
        {
            d["tab"] = false;
            d["logo"]!["mode"] = "text";
            d["logo"]!["text"] = "가나정형외과";
            Docs.Col(d, "sono")["codes"] = Docs.Strings(new[] { "sono1", "EB422" });
        });

        var answer = rig.PostSettings(doc);

        Assert.Equal(204, answer.Status);
        Assert.Empty(answer.Body);
        var saved = rig.Settings.Current();
        Assert.Equal(before.Rev + 1, saved.Rev);
        Assert.False(saved.Tab);
        Assert.Equal("가나정형외과", saved.Logo.Text);
        Assert.Equal(new[] { "SONO1", "EB422" }, saved.Cols.Single(c => c.K == "sono").Codes.ToArray());
        Assert.True(ReceptionSettings.TryParse(rig.Get("/api/settings").Body, out var read));
        Assert.Equal(Docs.Json(saved), Docs.Json(read));
    }

    [Fact(DisplayName = "AC-5704.2 쓰기 검사가 틀리면(Origin·X-Reception·JSON 형식) 403이고 저장하지 않으며 기록에는 E-RECEPTION-WRITE만 남는다")]
    public void SettingsWriteGuard()
    {
        using var rig = new RoutesRig();
        var before = Docs.Json(rig.Settings.Current());
        var body = Docs.Bytes(Docs.Raw(rig.Edit(d => d["tab"] = false)));
        var bad = new[]
        {
            new KeyValuePair<string, string>[0],
            RoutesRig.WriteHeaders().Where(h => h.Key != "Origin").ToArray(),
            RoutesRig.WriteHeaders().Where(h => h.Key != "X-Reception").ToArray(),
            RoutesRig.WriteHeaders("text/plain").ToArray(),
            RoutesRig.WriteHeaders().Select(h => h.Key == "Origin" ? new KeyValuePair<string, string>("Origin", "http://evil.example") : h).ToArray(),
        };
        foreach (var headers in bad)
        {
            Assert.Equal(403, rig.Send("POST", "/api/settings", headers, body).Status);
        }
        Assert.Equal(before, Docs.Json(rig.Settings.Current()));
        Assert.All(rig.LogLines(), line => Assert.Contains(" - E-RECEPTION-WRITE ", line, StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-5704.2 몸이 32768바이트를 넘으면 쓰기 검사 전에 413이고, 32768바이트까지는 413이 아니다")]
    public void SettingsTooLarge()
    {
        using var rig = new RoutesRig();
        var before = Docs.Json(rig.Settings.Current());
        Assert.Equal(413, rig.Send("POST", "/api/settings", RoutesRig.WriteHeaders(), new byte[32769]).Status);
        Assert.Equal(413, rig.Send("POST", "/api/settings", null, new byte[32769]).Status);
        Assert.Equal(403, rig.Send("POST", "/api/settings", null, new byte[32768]).Status);
        Assert.Equal(400, rig.Send("POST", "/api/settings", RoutesRig.WriteHeaders(), Encoding.ASCII.GetBytes(new string(' ', 32768))).Status);
        Assert.Equal(before, Docs.Json(rig.Settings.Current()));
    }

    public static IEnumerable<object[]> BadDocs() => new[]
    {
        new object[] { "JSON 아님" },
        new object[] { "빈 몸" },
        new object[] { "칸 빠짐" },
        new object[] { "칸 더함" },
        new object[] { "모르는 열쇠" },
        new object[] { "nextX 줄이기" },
        new object[] { "logo.ver 바꾸기" },
        new object[] { "로고 파일 없이 pic" },
        new object[] { "더한 칸 번호가 nextX 이상" },
    };

    [Theory(DisplayName = "AC-5704.2 모양이 틀리거나 바꿀 수 없는 것을 바꾸면(nextX 줄이기·더한 칸 번호가 nextX 이상·logo.ver 바꾸기·로고 파일 없이 pic) 400이고 저장하지 않는다")]
    [MemberData(nameof(BadDocs))]
    public void SettingsRefused(string why)
    {
        using var rig = new RoutesRig();
        Assert.Equal(204, rig.PostSettings(rig.Edit(d => Docs.WithAdded(d, 1, 2))).Status);
        var before = Docs.Json(rig.Settings.Current());

        byte[] body;
        switch (why)
        {
            case "JSON 아님":
                body = Encoding.UTF8.GetBytes("{\"rev\":");
                break;
            case "빈 몸":
                body = new byte[0];
                break;
            case "칸 빠짐":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d => d.Remove("tab"))));
                break;
            case "칸 더함":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d => d["more"] = 1)));
                break;
            case "모르는 열쇠":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d => d["logo"]!["mode"] = "gif")));
                break;
            case "nextX 줄이기":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d =>
                {
                    Docs.Cols(d).Remove(Docs.Col(d, "x2"));
                    Docs.Extra(d).Remove("x2");
                    d["nextX"] = 2;
                })));
                break;
            case "logo.ver 바꾸기":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d => d["logo"]!["ver"] = 1)));
                break;
            case "로고 파일 없이 pic":
                body = Docs.Bytes(Docs.Raw(rig.Edit(d => d["logo"]!["mode"] = "pic")));
                break;
            default:
                body = Docs.Bytes(Docs.Raw(rig.Edit(d =>
                {
                    Docs.Cols(d).Add(Docs.AddedCol("x3", "더한3"));
                    Docs.Extra(d).Add("x3", new JsonArray());
                })));
                break;
        }

        Assert.Equal(400, rig.PostSettings(body).Status);
        Assert.Equal(before, Docs.Json(rig.Settings.Current()));
    }

    [Fact(DisplayName = "AC-5704.2 뺀 칸을 [되돌리기]로 같은 열쇠로 되살리는 것은 된다(204)")]
    public void RestoreRemovedColumn()
    {
        using var rig = new RoutesRig();
        Assert.Equal(204, rig.PostSettings(rig.Edit(d => Docs.WithAdded(d, 1))).Status);
        var withX1 = rig.Settings.Current();
        Assert.Equal(204, rig.PostSettings(rig.Edit(d =>
        {
            Docs.Cols(d).Remove(Docs.Col(d, "x1"));
            Docs.Extra(d).Remove("x1");
        })).Status);
        Assert.DoesNotContain(rig.Settings.Current().Cols, c => c.K == "x1");

        var back = Docs.Node(withX1);
        back["rev"] = rig.Settings.Current().Rev;
        Assert.Equal(204, rig.PostSettings(back).Status);
        Assert.Contains(rig.Settings.Current().Cols, c => c.K == "x1");
        Assert.Equal(2, rig.Settings.Current().NextX);
    }

    [Fact(DisplayName = "AC-5704.2 rev가 저장된 rev와 다르면(다른 기기가 먼저 바꿈) 409 Conflict이고 저장하지 않는다")]
    public void SettingsConflict()
    {
        using var rig = new RoutesRig();
        var stale = rig.Edit(d => d["tab"] = false);
        Assert.Equal(204, rig.PostSettings(rig.Edit(d => d["nextX"] = 3)).Status);
        var before = Docs.Json(rig.Settings.Current());

        var answer = rig.PostSettings(stale);

        Assert.Equal(409, answer.Status);
        Assert.Equal("HTTP/1.1 409 Conflict", StatusLine(answer));
        Assert.Empty(answer.Body);
        SecurityHeaders(answer);
        Assert.Equal(before, Docs.Json(rig.Settings.Current()));
        var ahead = rig.Edit(d => d["rev"] = rig.Settings.Current().Rev + 1);
        Assert.Equal(409, rig.PostSettings(ahead).Status);
    }

    [Fact(DisplayName = "AC-5704.2 설정 파일을 쓰지 못하면 503 {\"state\":\"unavailable\"}이고 기록에는 E-STORE-FAILED만 남는다")]
    public void SettingsStoreFails()
    {
        using var rig = new RoutesRig();
        var doc = rig.Edit(d => d["tab"] = false);
        rig.Protector.FailProtect = true;

        Unavailable(rig.PostSettings(doc));

        rig.Protector.FailProtect = false;
        Assert.True(rig.Settings.Current().Tab);
        Assert.Contains(rig.LogLines(), line => line.IndexOf(" - " + BitErrors.StoreFailed + " ", StringComparison.Ordinal) >= 0);
    }

    // ---- AC-5706.1 POST /api/logo -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-5706.1 바른 PNG(가로 1~1200·세로 1~300)면 로고 파일에 쓰고 logo.mode pic·ver +1·setup.logo 참·rev +1로 저장하고 204다(병원 이름 글은 남긴다)")]
    public void UploadPng()
    {
        using var rig = new RoutesRig();
        Assert.Equal(204, rig.PostSettings(rig.Edit(d =>
        {
            d["logo"]!["mode"] = "text";
            d["logo"]!["text"] = "가나정형외과";
        })).Status);
        var before = rig.Settings.Current();
        var png = LogoBytes.Png(1200, 300);

        var answer = rig.PostLogo(png);

        Assert.Equal(204, answer.Status);
        var picture = rig.Logo.Read()!;
        Assert.Equal(LogoKind.Png, picture.Kind);
        Assert.Equal(png, picture.Bytes);
        var after = rig.Settings.Current();
        Assert.Equal(LogoModes.Pic, after.Logo.Mode);
        Assert.Equal("가나정형외과", after.Logo.Text);
        Assert.Equal(before.Logo.Ver + 1, after.Logo.Ver);
        Assert.True(after.Setup.Logo);
        Assert.Equal(before.Setup.Tab, after.Setup.Tab);
        Assert.Equal(before.Setup.Done, after.Setup.Done);
        Assert.Equal(before.Rev + 1, after.Rev);

        // 그림이 있으니 화면이 pic ↔ none을 바꿔 저장할 수 있다(ver는 그대로)
        Assert.Equal(204, rig.PostSettings(rig.Edit(d => d["logo"]!["mode"] = "none")).Status);
        Assert.Equal(204, rig.PostSettings(rig.Edit(d => d["logo"]!["mode"] = "pic")).Status);
        Assert.Equal(after.Logo.Ver, rig.Settings.Current().Logo.Ver);
    }

    [Fact(DisplayName = "AC-5706.1 바른 JPEG(SOF0~SOF3)도 받고, 다시 올리면 앞 그림을 바꾸며 ver는 올릴 때마다 1씩 오른다")]
    public void UploadJpegThenReplace()
    {
        using var rig = new RoutesRig();
        var jpeg = LogoBytes.Jpeg(640, 120);
        Assert.Equal(204, rig.PostLogo(jpeg, "image/jpeg").Status);
        Assert.Equal(LogoKind.Jpeg, rig.Logo.Read()!.Kind);
        Assert.Equal(1, rig.Settings.Current().Logo.Ver);

        var png = LogoBytes.Png(300, 100);
        Assert.Equal(204, rig.PostLogo(png, "IMAGE/PNG").Status);
        Assert.Equal(png, rig.Logo.Read()!.Bytes);
        Assert.Equal(2, rig.Settings.Current().Logo.Ver);
    }

    [Fact(DisplayName = "AC-5706.1 쓰기 검사가 틀리면(Origin·X-Reception) 403이고 로고 파일을 만들지 않는다")]
    public void LogoWriteGuard()
    {
        using var rig = new RoutesRig();
        var rev = rig.Settings.Current().Rev;
        var png = LogoBytes.Png(100, 50);
        Assert.Equal(403, rig.Send("POST", "/api/logo", new[] { new KeyValuePair<string, string>("Content-Type", "image/png") }, png).Status);
        Assert.Equal(403, rig.Send("POST", "/api/logo", RoutesRig.WriteHeaders("image/png").Where(h => h.Key != "X-Reception"), png).Status);
        Assert.Equal(403, rig.Send("POST", "/api/logo", RoutesRig.WriteHeaders("image/png").Where(h => h.Key != "Origin"), png).Status);
        Assert.False(rig.Logo.Exists());
        Assert.Equal(rev, rig.Settings.Current().Rev);
    }

    public static IEnumerable<object?[]> BadPictures() => new[]
    {
        new object?[] { "application/json", LogoBytes.Png(100, 50) },
        new object?[] { "image/gif", LogoBytes.Png(100, 50) },
        new object?[] { "image/png; charset=utf-8", LogoBytes.Png(100, 50) },
        new object?[] { null, LogoBytes.Png(100, 50) },
        new object?[] { "image/png", LogoBytes.Jpeg(100, 50) },
        new object?[] { "image/jpeg", LogoBytes.Png(100, 50) },
        new object?[] { "image/png", LogoBytes.Png(1201, 50) },
        new object?[] { "image/png", LogoBytes.Png(100, 301) },
        new object?[] { "image/png", LogoBytes.Png(0, 50) },
        new object?[] { "image/jpeg", LogoBytes.Jpeg(1201, 50) },
        new object?[] { "image/jpeg", LogoBytes.Jpeg(100, 50, sof: 0xC2).Take(20).ToArray() },
        new object?[] { "image/png", new byte[0] },
        new object?[] { "image/png", Encoding.ASCII.GetBytes("not a picture at all, just text") },
    };

    [Theory(DisplayName = "AC-5706.1 Content-Type이 image/png·image/jpeg가 아니거나 그 형식의 첫 바이트·그림 크기(가로 1~1200·세로 1~300)가 아니면 400이고 로고 파일을 만들지 않는다")]
    [MemberData(nameof(BadPictures))]
    public void LogoRefused(string? contentType, byte[] body)
    {
        using var rig = new RoutesRig();
        var rev = rig.Settings.Current().Rev;

        Assert.Equal(400, rig.PostLogo(body, contentType).Status);

        Assert.False(rig.Logo.Exists());
        Assert.Equal(rev, rig.Settings.Current().Rev);
        Assert.Equal(0, rig.Settings.Current().Logo.Ver);
    }

    [Fact(DisplayName = "AC-5706.1 몸이 2097152바이트를 넘으면 쓰기 검사 전에 413이고, 꼭 2097152바이트인 그림은 받는다")]
    public void LogoSizeLimit()
    {
        using var rig = new RoutesRig();
        var big = LogoBytes.Png(1000, 200).Concat(new byte[2097152]).Take(2097152).ToArray();
        Assert.Equal(2097152, big.Length);
        Assert.Equal(413, rig.PostLogo(big.Concat(new byte[1]).ToArray()).Status);
        Assert.Equal(413, rig.Send("POST", "/api/logo", null, new byte[2097153]).Status);
        Assert.False(rig.Logo.Exists());

        Assert.Equal(204, rig.PostLogo(big).Status);
        Assert.Equal(2097152, rig.Logo.Read()!.Bytes.Length);
    }

    [Fact(DisplayName = "AC-5706.1 로고 파일을 쓰지 못하면 503이고 설정(mode·ver·rev)은 그대로이며 기록에는 E-STORE-FAILED만 남는다")]
    public void LogoStoreFails()
    {
        using var rig = new RoutesRig();
        var before = Docs.Json(rig.Settings.Current());
        rig.LogoProtector.FailProtect = true;

        Unavailable(rig.PostLogo(LogoBytes.Png(100, 50)));

        Assert.Equal(before, Docs.Json(rig.Settings.Current()));
        Assert.False(rig.Logo.Exists());
        Assert.Contains(rig.LogLines(), line => line.IndexOf(" - " + BitErrors.StoreFailed + " ", StringComparison.Ordinal) >= 0);
    }

    // ---- AC-5706.2 GET /api/logo ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5706.2 로고 파일이 없으면 404, 있으면 200 + 그 형식(image/png·image/jpeg)과 그림이고 보안 머리 다섯 개는 다른 답과 같다")]
    public void GetLogo()
    {
        using var rig = new RoutesRig();
        var none = rig.Get("/api/logo");
        Assert.Equal(404, none.Status);
        Assert.Empty(none.Body);

        var png = LogoBytes.Png(400, 80);
        Assert.Equal(204, rig.PostLogo(png).Status);
        var answer = rig.Get("/api/logo");
        Assert.Equal(200, answer.Status);
        Assert.Equal("image/png", answer.ContentType);
        Assert.Equal(png, answer.Body);
        Assert.Equal(png.Length.ToString(System.Globalization.CultureInfo.InvariantCulture), answer.Header("Content-Length"));
        SecurityHeaders(answer);

        var jpeg = LogoBytes.Jpeg(400, 80);
        Assert.Equal(204, rig.PostLogo(jpeg, "image/jpeg").Status);
        var second = rig.Get("/api/logo");
        Assert.Equal("image/jpeg", second.ContentType);
        Assert.Equal(jpeg, second.Body);
        SecurityHeaders(second);
    }

    [Fact(DisplayName = "AC-5706.2 우리 의원 처음 값이면 옮긴 품은 로고(PNG)를 GET /api/logo가 준다")]
    public void OursLogo()
    {
        using var rig = new RoutesRig(ours: true);
        Assert.Equal(LogoModes.Pic, rig.Settings.Current().Logo.Mode);
        var answer = rig.Get("/api/logo");
        Assert.Equal(200, answer.Status);
        Assert.Equal("image/png", answer.ContentType);
        Assert.Equal(RoutesRig.Wordmark, answer.Body);
    }

    [Fact(DisplayName = "AC-5706.2 로고 파일을 읽지 못하면(잠김) 503이고 기록에는 오류 번호만 남는다")]
    public void LogoReadFails()
    {
        using var rig = new RoutesRig();
        Assert.Equal(204, rig.PostLogo(LogoBytes.Png(100, 50)).Status);
        var file = Path.Combine(rig.DataPath, LogoStore.FileName);
        using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            Unavailable(rig.Get("/api/logo"));
        }
        Assert.Equal(200, rig.Get("/api/logo").Status);
        var lines = rig.LogLines();
        Assert.All(lines, line => Assert.Matches(LogShape, line));
        Assert.Contains(lines, line => line.IndexOf(" - " + BitErrors.StoreFailed + " ", StringComparison.Ordinal) >= 0);
    }

    // ---- AC-5706.3 화면 파일·CSP --------------------------------------------------------------------------

    private sealed class Pictures : IStaticSource
    {
        public IEnumerable<string> Names => new[] { "reception/logo.jpg", "reception/photo.jpeg", "reception/LOGO.JPG", "reception/logo.png" };

        public byte[]? Read(string name) => new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 };
    }

    [Fact(DisplayName = "AC-5706.3 화면 파일은 .jpg·.jpeg를 지금처럼 내주지 않고(로고는 /api/logo로만), CSP 글은 한 글자도 바뀌지 않는다(img-src 'self' data:)")]
    public void NoJpegFilesAndSameCsp()
    {
        var files = new StaticFiles(new Pictures());
        Assert.Null(files.Get("/logo.jpg"));
        Assert.Null(files.Get("/photo.jpeg"));
        Assert.Null(files.Get("/LOGO.JPG"));
        Assert.Equal(200, files.Get("/logo.png")!.Status);
        Assert.DoesNotContain(".jpg", StaticFiles.ContentTypes.Keys);
        Assert.DoesNotContain(".jpeg", StaticFiles.ContentTypes.Keys);
        Assert.Equal(
            "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
            HttpResponse.ContentSecurityPolicy);
    }

    // ---- AC-5705.1 GET /api/codes -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-5705.1 GET /api/codes는 200 {\"codes\":[{c,n,v}]}(CodesReader 답 그대로)이고, 비트를 볼 수 없으면 503 {\"state\":\"unavailable\"}다")]
    public void GetCodes()
    {
        using var rig = new RoutesRig();
        rig.Bit.Session.Answer(ReceptionSql.RecentCodes, _ => new[] { new object?[] { "SONO1", 12L }, new object?[] { "IMS1", 2L } });
        rig.Bit.Session.Answer(ReceptionSql.RxNames, _ => new[] { new object?[] { "SONO1", "초음파" } });

        var answer = rig.Get("/api/codes");

        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        Assert.Equal("{\"codes\":[{\"c\":\"SONO1\",\"n\":\"초음파\",\"v\":12},{\"c\":\"IMS1\",\"n\":null,\"v\":2}]}", Encoding.UTF8.GetString(answer.Body));
        SecurityHeaders(answer);

        using var down = new RoutesRig();
        down.Bit.Session.Fail(ReceptionSql.RecentCodes, BitErrors.DbFailed);
        Unavailable(down.Get("/api/codes"));
    }

    // ---- AC-5705.2 GET /api/code/{c} --------------------------------------------------------------------

    [Theory(DisplayName = "AC-5705.2 GET /api/code/{코드}는 퍼센트 글자를 UTF-8로 푼 코드가 ^[0-9A-Za-z가-힣_]{1,16}$면 200 {\"c\"(대문자),\"n\"}이다")]
    [InlineData("/api/code/SONO1", "SONO1")]
    [InlineData("/api/code/sono1", "SONO1")]
    [InlineData("/api/code/%53ONO1", "SONO1")]
    [InlineData("/api/code/%EC%B4%88%EC%9D%8C%ED%8C%8C", "초음파")]
    [InlineData("/api/code/%ec%b4%88%ec%9d%8c%ed%8c%8c1", "초음파1")]
    [InlineData("/api/code/MM_051", "MM_051")]
    public void GetCode(string target, string code)
    {
        using var rig = new RoutesRig();
        rig.Bit.Session.Answer(ReceptionSql.CodeName, args => (string?)args["@code"] == code ? new[] { new object?[] { "이름" + code } } : new object?[0][]);

        var answer = rig.Get(target);

        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        var json = Json(answer);
        Assert.Equal(new[] { "c", "n" }, json.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(code, json.GetProperty("c").GetString());
        Assert.Equal("이름" + code, json.GetProperty("n").GetString());
    }

    [Fact(DisplayName = "AC-5705.2 사전에 없는 코드는 200 {\"c\",\"n\":null}이다")]
    public void GetUnknownCode()
    {
        using var rig = new RoutesRig();
        rig.Bit.Session.Answer(ReceptionSql.CodeName, _ => new object?[0][]);
        var answer = rig.Get("/api/code/ZZ999");
        Assert.Equal(200, answer.Status);
        Assert.Equal("{\"c\":\"ZZ999\",\"n\":null}", Encoding.UTF8.GetString(answer.Body));
    }

    [Theory(DisplayName = "AC-5705.2 퍼센트 풀기 뒤 코드 모양이 아니면(빈 글·17글자·/·공백·-·잘린 %·16진 아닌 %·틀린 UTF-8·짝 없는 대리쌍·제어 글자) 비트를 읽지 않고 404다")]
    [InlineData("/api/code/")]
    [InlineData("/api/code/A2345678901234567")]
    [InlineData("/api/code/SONO1/x")]
    [InlineData("/api/code/SONO%2F1")]
    [InlineData("/api/code/SONO%201")]
    [InlineData("/api/code/SONO-1")]
    [InlineData("/api/code/SONO1%")]
    [InlineData("/api/code/SONO1%4")]
    [InlineData("/api/code/%ZZ")]
    [InlineData("/api/code/%C3%28")]
    [InlineData("/api/code/%ED%A0%80")]
    [InlineData("/api/code/A%00")]
    [InlineData("/api/code/A%0A")]
    [InlineData("/api/code/%E3%84%B1")]
    public void BadCodePath(string target)
    {
        using var rig = new RoutesRig();
        rig.Bit.Session.Answer(ReceptionSql.CodeName, _ => new[] { new object?[] { "이름" } });

        var answer = rig.Get(target);

        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Empty(rig.Bit.Connector.Opened);
        Assert.Empty(rig.Bit.Session.Calls);
    }

    [Fact(DisplayName = "AC-5705.2 코드 이름 읽기가 실패하면 503 {\"state\":\"unavailable\"}다")]
    public void GetCodeFails()
    {
        using var rig = new RoutesRig();
        rig.Bit.Session.Fail(ReceptionSql.CodeName, BitErrors.DbFailed);
        Unavailable(rig.Get("/api/code/SONO1"));
    }

    // ---- AC-5714.2 기록 ----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5714.2 설정·코드·로고 길이 실패하면 기록에는 오류 번호·건수만 있고 처방 이름·코드·병원 이름·그림 바이트·길·주소가 없다")]
    public void FailureLogsCodesOnly()
    {
        using var rig = new RoutesRig();
        Assert.Equal(204, rig.PostSettings(rig.Edit(d =>
        {
            d["logo"]!["mode"] = "text";
            d["logo"]!["text"] = "가나정형외과";
        })).Status);
        rig.Bit.Session.Answer(ReceptionSql.RecentCodes, _ => throw new BitException(BitErrors.DbFailed));
        rig.Bit.Session.Answer(ReceptionSql.CodeName, _ => throw new BitException(BitErrors.ReadFailed));

        Unavailable(rig.Get("/api/codes"));
        Unavailable(rig.Get("/api/code/SONO1"));
        Unavailable(rig.Get("/api/code/%EC%B4%88%EC%9D%8C%ED%8C%8C"));
        Assert.Equal(403, rig.Send("POST", "/api/logo", null, LogoBytes.Png(100, 50)).Status);
        Assert.Equal(400, rig.PostLogo(Encoding.UTF8.GetBytes("초음파 SONO1 IHDR")).Status);
        Assert.Equal(400, rig.PostSettings(Encoding.UTF8.GetBytes("{\"name\":\"초음파 SONO1\"}")).Status);
        rig.LogoProtector.FailProtect = true;
        Unavailable(rig.PostLogo(LogoBytes.Png(100, 50)));
        rig.Protector.FailProtect = true;
        Unavailable(rig.PostSettings(rig.Edit(d => d["tab"] = false)));

        var lines = rig.LogLines();
        Assert.NotEmpty(lines);
        var forbidden = new[]
        {
            "SONO1", "초음파", "가나정형외과", Synthetic.Scope, Synthetic.Institution, "IHDR", "PNG", "image/", "/api", "192.168.", "47200",
            "Exception", "fake", "settings", "logo", "code",
        };
        foreach (var line in lines)
        {
            Assert.Matches(LogShape, line);
            foreach (var word in forbidden) Assert.DoesNotContain(word, line, StringComparison.Ordinal);
        }
        var codes = lines.Select(line => line.Split(' ')[2]).Distinct().OrderBy(c => c, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { BitErrors.DbFailed, BitErrors.ReadFailed, ReceptionErrors.BadWrite, BitErrors.StoreFailed }.OrderBy(c => c, StringComparer.Ordinal), codes);
    }
}
