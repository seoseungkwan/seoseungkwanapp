using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Precheck.Core.Tests.Reception.Detail;
using Xunit;
using Xunit.Sdk;

// 이 TASK의 시험만 한 거르기로 돌리려고 Serve 이름 공간에 둔다(같은 Http 폴더의 HttpGate 시험과 따로 돈다)
namespace Precheck.Core.Tests.Reception.Serve;

/// <summary>
/// 길 나누기(ReceptionRouter, design.md 7절·데이터 흐름, REQ-1406·REQ-1403·REQ-1404·REQ-1405).
/// AC-1406.5 정해 둔 길(화면 파일, GET /api/board·?fresh=1, GET /api/visit/{k}/history?from=N, POST /api/xray, 이 PC 자신만 GET /qr)만 받고
///           다른 길은 404, 다른 방법은 405다. 화면 파일은 넣어 둔 원천(IStaticSource)에 있는 것만 준다(디스크 경로를 받지 않는다).
/// AC-1403.8 /api/board?fresh=1만 fresh로 넘기고(8초 묶음을 건너뜀), 다른 질의 글은 404다.
/// AC-1404.5 그날 열쇠표에 없는·모양이 틀린 열쇠, 음수·숫자 아닌 시작 위치는 비트를 읽지 않고 404다.
/// AC-1405.5 진료보류가 아닌 줄·그날 없는 열쇠·모양이 틀린 요청은 표시를 바꾸지 않고 400·404다.
/// AC-1406.7 기록에는 오류 번호와 건수만 남는다. AC-1406.8 이 PC 자신이 아닌 곳의 GET /qr은 404다.
/// 가짜 비트(Rig)·가짜 화면 파일·주입한 시계만 쓴다. 차트번호는 9로 시작하는 6자리, 내원번호는 V+숫자다.
/// </summary>
public class ReceptionRouterTests
{
    // ---- AC-1406.5 화면 파일 --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.5 화면 파일: / 와 /index.html은 index.html, 넣어 둔 파일마다 확장자 표의 형식(html·css·js·woff2·webmanifest·png·txt)과 같은 바이트로 200")]
    public void ServesStaticFiles()
    {
        using var rig = new ServeRig();
        foreach (var (path, name, type) in FakeStatic.Served)
        {
            var answer = rig.Get(path);
            Assert.Equal(200, answer.Status);
            Assert.Equal(type, answer.ContentType);
            Assert.Equal(FakeStatic.BytesOf(name), answer.Body);
            Assert.Equal("nosniff", answer.Header("X-Content-Type-Options"));
        }
        Assert.Equal(FakeStatic.BytesOf("reception/index.html"), rig.Get("/").Body);
    }

    [Theory(DisplayName = "AC-1406.5 화면 파일은 원천에 넣어 둔 이름 그대로만: 형식을 모르는 파일·reception/ 밖 이름·다른 모양의 경로·질의 글은 404")]
    [InlineData("/notes.md")]
    [InlineData("/secret.html")]
    [InlineData("/commands.json")]
    [InlineData("/reception/index.html")]
    [InlineData("/index.html/")]
    [InlineData("/INDEX.HTML")]
    [InlineData("/%69ndex.html")]
    [InlineData("/./index.html")]
    [InlineData("/fonts/../index.html")]
    [InlineData("/../index.html")]
    [InlineData("/fonts\\title.woff2")]
    [InlineData("//index.html")]
    [InlineData("/index.html?v=1")]
    [InlineData("/?x")]
    [InlineData("/fonts")]
    [InlineData("/fonts/")]
    public void StaticOnlyFromSource(string target)
    {
        using var rig = new ServeRig();
        var answer = rig.Get(target);
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
    }

    [Fact(DisplayName = "AC-1406.5 화면 파일은 요청 경로를 디스크 경로로 쓰지 않는다: 작업 폴더·시험 폴더에 있는 파일 이름이어도 원천에 없으면 404")]
    public void StaticNeverReadsDisk()
    {
        using var rig = new ServeRig();
        var here = Path.GetFileName(typeof(ReceptionRouterTests).Assembly.Location);
        Assert.Equal(404, rig.Get("/" + here).Status);
        Assert.Equal(404, rig.Get("/Precheck.Core.dll").Status);
        Assert.Equal(404, rig.Get("/etc/hosts").Status);
    }

    [Fact(DisplayName = "AC-1406.5 Core에 품은 화면 파일(reception/…, 윈도우의 '\\' 이름 포함)은 모두 형식이 정해져 / 뒤 같은 이름으로 나가고, / 는 index.html이다")]
    public void EmbeddedScreenFilesAreServed()
    {
        var source = EmbeddedStaticSource.Core();
        var files = new StaticFiles(source);
        var names = source.Names
            .Select(name => name.Replace('\\', '/'))
            .Where(name => name.StartsWith("reception/", StringComparison.Ordinal))
            .ToArray();
        Assert.Contains("reception/index.html", names);
        Assert.Contains("reception/fonts/title.woff2", names);
        foreach (var name in names)
        {
            var answer = files.Get("/" + name.Substring("reception/".Length));
            Assert.True(answer != null, $"품은 파일을 주지 않는다: {name}");
            Assert.Equal(200, answer!.Status);
            Assert.False(string.IsNullOrEmpty(answer.ContentType), name);
        }
        var index = files.Get("/");
        Assert.NotNull(index);
        Assert.Equal("text/html; charset=utf-8", index!.ContentType);
        Assert.Null(files.Get("/commands.json"));
    }

    // ---- AC-1406.5 다른 길·다른 방법 ---------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.5 문 번호는 47200 하나다(Host 검사의 기본 문)")]
    public void PortIs47200()
    {
        Assert.Equal(47200, ReceptionPorts.Http);
        using var rig = new ServeRig();
        var request = new HttpRequest("GET", "/", new[] { Header("Host", ServeRig.LanHost) }, new byte[0]);
        Assert.Equal(200, rig.Router.Handle(request, ServeRig.Phone).Status);
    }

    [Theory(DisplayName = "AC-1406.5 정해 두지 않은 길은 어떤 방법이든 404다")]
    [InlineData("GET", "/api")]
    [InlineData("GET", "/api/")]
    [InlineData("GET", "/api/boards")]
    [InlineData("GET", "/api/board/")]
    [InlineData("GET", "/API/board")]
    [InlineData("GET", "/api/visit")]
    [InlineData("GET", "/api/visit/0123456789abcdef")]
    [InlineData("GET", "/api/visit/0123456789abcdef/history/x?from=0")]
    [InlineData("GET", "/api/visit/0123456789abcdef/x/history?from=0")]
    [InlineData("GET", "/api/xray/1")]
    [InlineData("GET", "/favicon.ico")]
    [InlineData("POST", "/api/boards")]
    [InlineData("DELETE", "/api/xray/1")]
    [InlineData("PUT", "/nothing")]
    public void UnknownRoutes(string method, string target)
    {
        using var rig = new ServeRig();
        var answer = rig.Send(method, target);
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(0, rig.BoardReads);
    }

    [Theory(DisplayName = "AC-1406.5 정해 둔 길에 다른 방법이면 405이고 Allow에 받는 방법만 적힌다(비트를 읽지 않는다)")]
    [InlineData("POST", "/api/board", "GET")]
    [InlineData("PUT", "/api/board?fresh=1", "GET")]
    [InlineData("HEAD", "/api/board", "GET")]
    [InlineData("GET", "/api/xray", "POST")]
    [InlineData("PUT", "/api/xray", "POST")]
    [InlineData("POST", "/api/visit/0123456789abcdef/history?from=0", "GET")]
    [InlineData("POST", "/", "GET")]
    [InlineData("DELETE", "/index.html", "GET")]
    [InlineData("HEAD", "/style.css", "GET")]
    public void WrongMethod(string method, string target, string allow)
    {
        using var rig = new ServeRig();
        var answer = rig.Send(method, target);
        Assert.Equal(405, answer.Status);
        Assert.Equal(allow, answer.Header("Allow"));
        Assert.Empty(answer.Body);
        Assert.Equal(0, rig.BoardReads);
    }

    [Theory(DisplayName = "AC-1406.5 OPTIONS는 어느 길이든 405(Allow: GET, POST)이고 CORS 머리가 없다")]
    [InlineData("/api/xray")]
    [InlineData("/api/board")]
    [InlineData("/")]
    [InlineData("/nothing")]
    public void OptionsIsNotAllowed(string target)
    {
        using var rig = new ServeRig();
        var answer = rig.Send("OPTIONS", target, headers: new[] { Header("Origin", "http://evil.example"), Header("Access-Control-Request-Method", "POST") });
        Assert.Equal(405, answer.Status);
        Assert.Equal("GET, POST", answer.Header("Allow"));
        Assert.DoesNotContain(answer.Headers, h => h.Key.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase));
    }

    [Theory(DisplayName = "AC-1406.5 정해 둔 길이어도 Host가 이 PC 주소:47200이 아니거나 보낸 쪽이 사설 주소가 아니면 403이고 비트를 읽지 않는다")]
    [InlineData("evil.example:47200", "192.168.0.57")]
    [InlineData("192.168.0.23:8080", "192.168.0.57")]
    [InlineData("192.168.0.99:47200", "192.168.0.57")]
    [InlineData("127.0.0.1:47200", "192.168.0.57")]
    [InlineData("", "192.168.0.57")]
    [InlineData("192.168.0.23:47200", "8.8.8.8")]
    public void HostMustBeThisPc(string host, string client)
    {
        using var rig = new ServeRig();
        foreach (var target in new[] { "/api/board", "/api/board?fresh=1", "/", "/qr" })
        {
            var answer = rig.Send("GET", target, IPAddress.Parse(client), host.Length == 0 ? null : host, omitHost: host.Length == 0);
            Assert.Equal(403, answer.Status);
            Assert.Empty(answer.Body);
        }
        Assert.Equal(0, rig.BoardReads);
    }

    [Fact(DisplayName = "AC-1406.5 GET /api/board는 BoardBuilder 판 JSON(200)이고, 진료보류 줄에만 엑스레이 칸이 있다")]
    public void BoardIsJson()
    {
        using var rig = new ServeRig();
        var answer = rig.Get("/api/board");
        Assert.Equal(200, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        var board = Json(answer);
        Assert.Equal("ok", board.GetProperty("state").GetString());
        Assert.Equal("10:00:00", board.GetProperty("at").GetString());
        Assert.Equal(3, board.GetProperty("counts").GetProperty("queue").GetInt32());
        Assert.Equal(2, board.GetProperty("counts").GetProperty("wait").GetInt32());
        Assert.Equal(1, board.GetProperty("counts").GetProperty("hold").GetInt32());
        var hold = board.GetProperty("lists").GetProperty("hold")[0];
        Assert.Equal("900102", hold.GetProperty("chart").GetString());
        Assert.Equal(JsonValueKind.Null, hold.GetProperty("xray").GetProperty("at").ValueKind);
        Assert.Equal(JsonValueKind.Null, board.GetProperty("lists").GetProperty("wait")[0].GetProperty("xray").ValueKind);
        Assert.DoesNotContain("V100", Encoding.UTF8.GetString(answer.Body), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1406.5 비트를 볼 수 없으면(등록 없음) GET /api/board는 503 {\"state\":\"unavailable\"}이고 환자 자료가 없다")]
    public void BoardUnavailable()
    {
        using var rig = new ServeRig(registered: false);
        var answer = rig.Get("/api/board");
        Assert.Equal(503, answer.Status);
        Assert.Equal("application/json; charset=utf-8", answer.ContentType);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(answer.Body));
        Assert.Equal(503, rig.Get("/api/board?fresh=1").Status);
    }

    [Fact(DisplayName = "AC-1406.5 상세를 읽다 비트를 볼 수 없게 되면 503 {\"state\":\"unavailable\"}이다")]
    public void HistoryUnavailable()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");
        rig.Bit.Locator.FailCode = BitErrors.NotFound;
        rig.Clock.Advance(TimeSpan.FromSeconds(9));
        var answer = rig.Get("/api/visit/" + key + "/history?from=0");
        Assert.Equal(503, answer.Status);
        Assert.Equal("{\"state\":\"unavailable\"}", Encoding.UTF8.GetString(answer.Body));
    }

    // ---- AC-1403.8 새로 고침 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.8 /api/board는 8초 묶음 안이면 다시 읽지 않고, /api/board?fresh=1은 묶음을 건너뛰어 바로 비트를 읽는다")]
    public void FreshSkipsBatch()
    {
        using var rig = new ServeRig();
        Assert.Equal(200, rig.Get("/api/board").Status);
        Assert.Equal(1, rig.BoardReads);

        rig.Clock.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(200, rig.Get("/api/board").Status);
        Assert.Equal(1, rig.BoardReads);

        var fresh = rig.Get("/api/board?fresh=1");
        Assert.Equal(200, fresh.Status);
        Assert.Equal(2, rig.BoardReads);
        Assert.Equal("10:00:03", Json(fresh).GetProperty("at").GetString());
    }

    [Theory(DisplayName = "AC-1403.8 fresh=1 말고 다른 질의 글(빈 ?, 다른 값, 덧붙인 칸, 대소문자)은 404이고 비트를 읽지 않는다")]
    [InlineData("/api/board?")]
    [InlineData("/api/board?fresh")]
    [InlineData("/api/board?fresh=")]
    [InlineData("/api/board?fresh=0")]
    [InlineData("/api/board?fresh=true")]
    [InlineData("/api/board?fresh=01")]
    [InlineData("/api/board?Fresh=1")]
    [InlineData("/api/board?fresh=1&x=1")]
    [InlineData("/api/board?x=1&fresh=1")]
    [InlineData("/api/board?fresh=1&fresh=1")]
    [InlineData("/api/board?fresh%3D1")]
    public void OtherQueriesAreNotFound(string target)
    {
        using var rig = new ServeRig();
        Assert.Equal(200, rig.Get("/api/board").Status);
        rig.Clock.Advance(TimeSpan.FromSeconds(3));

        var answer = rig.Get(target);
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(1, rig.BoardReads);
    }

    // ---- AC-1404.5 상세 길 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1404.5 그날 열쇠·from=0이면 상세 JSON(200, 처음 5번)이고, 모양 맞는 from=5는 다음 20번이다")]
    public void HistoryRoute()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");

        var first = rig.Get("/api/visit/" + key + "/history?from=0");
        Assert.Equal(200, first.Status);
        Assert.Equal("application/json; charset=utf-8", first.ContentType);
        Assert.Equal(5, Json(first).GetProperty("visits").GetArrayLength());
        Assert.Equal(5, Json(first).GetProperty("next").GetInt32());

        var second = rig.Get("/api/visit/" + key + "/history?from=5");
        Assert.Equal(200, second.Status);
        Assert.Equal(20, Json(second).GetProperty("visits").GetArrayLength());
    }

    [Theory(DisplayName = "AC-1404.5 그날 열쇠표에 없는 열쇠·모양이 틀린 열쇠·비어 있는 열쇠는 비트를 읽지 않고 404다")]
    [InlineData("0123456789abcdef")]
    [InlineData("ffffffffffffffff")]
    [InlineData("0123456789ABCDEF")]
    [InlineData("0123456789abcde")]
    [InlineData("0123456789abcdef0")]
    [InlineData("zzzzzzzzzzzzzzzz")]
    [InlineData("%30123456789abcdef")]
    [InlineData("")]
    public void HistoryBadKey(string key)
    {
        using var rig = new ServeRig();
        rig.KeyOfChart("900101");
        var before = rig.Bit.Session.Calls.Count;
        var opened = rig.Bit.Connector.Opened.Count;

        var answer = rig.Get("/api/visit/" + key + "/history?from=0");
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
        Assert.Equal(opened, rig.Bit.Connector.Opened.Count);
        Assert.Equal(0, rig.HistoryReads);
    }

    [Fact(DisplayName = "AC-1404.5 대문자로 바꾼 그날 열쇠도 404다(열쇠는 소문자 16자리 그대로만)")]
    public void HistoryKeyCase()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");
        Assert.Equal(404, rig.Get("/api/visit/" + key.ToUpperInvariant() + "/history?from=0").Status);
        Assert.Equal(0, rig.HistoryReads);
    }

    [Theory(DisplayName = "AC-1404.5 음수·숫자 아닌·빈·덧붙인 시작 위치, from 칸이 없는 질의는 비트를 읽지 않고 404다")]
    [InlineData("?from=-1")]
    [InlineData("?from=abc")]
    [InlineData("?from=")]
    [InlineData("?from=1.5")]
    [InlineData("?from=+1")]
    [InlineData("?from=%31")]
    [InlineData("?from=0&x=1")]
    [InlineData("?from=0&from=5")]
    [InlineData("?From=0")]
    [InlineData("?x=0")]
    [InlineData("?")]
    [InlineData("")]
    [InlineData("?from=99999999999")]
    public void HistoryBadFrom(string query)
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");
        var before = rig.Bit.Session.Calls.Count;

        var answer = rig.Get("/api/visit/" + key + "/history" + query);
        Assert.Equal(404, answer.Status);
        Assert.Empty(answer.Body);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }

    [Fact(DisplayName = "AC-1404.5 날이 바뀌면 어제 열쇠는 404다(비트를 읽지 않는다)")]
    public void HistoryYesterdayKey()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");
        rig.Clock.Set(new DateTime(2026, 11, 6, 9, 0, 0));
        var before = rig.Bit.Session.Calls.Count;
        Assert.Equal(404, rig.Get("/api/visit/" + key + "/history?from=0").Status);
        Assert.Equal(before, rig.Bit.Session.Calls.Count);
    }

    // ---- AC-1405.5 찍음 표시 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1405.5 진료보류 줄의 열쇠면 POST /api/xray {k, on:true}는 204이고 판에 찍은 시각이 나오며, on:false는 지운다")]
    public void XrayOnHoldRow()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");

        var on = rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}");
        Assert.Equal(204, on.Status);
        Assert.Empty(on.Body);
        Assert.Equal("10:00", rig.HoldXrayAt());

        var off = rig.PostXray("{\"on\":false,\"k\":\"" + key + "\"}");
        Assert.Equal(204, off.Status);
        Assert.Null(rig.HoldXrayAt());
    }

    [Fact(DisplayName = "AC-1405.5 진료보류가 아닌 줄(진료대기)의 열쇠는 404이고 표시 파일을 만들지 않는다")]
    public void XrayNotHoldRow()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900101");
        var answer = rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}");
        Assert.Equal(404, answer.Status);
        Assert.False(rig.MarksFileExists);
        Assert.Null(rig.HoldXrayAt());
    }

    [Theory(DisplayName = "AC-1405.5 그날 열쇠표에 없는 열쇠·모양이 틀린 열쇠는 404이고 표시를 바꾸지 않는다")]
    [InlineData("0123456789abcdef")]
    [InlineData("0123456789ABCDEF")]
    [InlineData("0123456789abcde")]
    [InlineData("가상환자01")]
    [InlineData("")]
    public void XrayUnknownKey(string key)
    {
        using var rig = new ServeRig();
        rig.KeyOfChart("900102");
        var answer = rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}");
        Assert.Equal(404, answer.Status);
        Assert.False(rig.MarksFileExists);
    }

    [Fact(DisplayName = "AC-1405.5 날이 바뀐 뒤 어제 진료보류 열쇠는 404이고 표시를 바꾸지 않는다")]
    public void XrayYesterdayKey()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        rig.Clock.Set(new DateTime(2026, 11, 6, 9, 0, 0));
        Assert.Equal(404, rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}").Status);
        Assert.False(rig.MarksFileExists);
    }

    [Theory(DisplayName = "AC-1405.5 몸 모양이 틀리면(JSON 아님·k 또는 on 없음·형이 다름·다른 칸·같은 칸 두 번·뒤에 더 옴) 400이고 표시를 바꾸지 않는다")]
    [InlineData("")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("\"KEY\"")]
    [InlineData("{\"k\":\"KEY\"}")]
    [InlineData("{\"on\":true}")]
    [InlineData("{\"k\":5,\"on\":true}")]
    [InlineData("{\"k\":null,\"on\":true}")]
    [InlineData("{\"k\":\"KEY\",\"on\":\"true\"}")]
    [InlineData("{\"k\":\"KEY\",\"on\":1}")]
    [InlineData("{\"k\":\"KEY\",\"on\":null}")]
    [InlineData("{\"k\":\"KEY\",\"on\":true,\"name\":\"가상환자01\"}")]
    [InlineData("{\"k\":\"KEY\",\"k\":\"KEY\",\"on\":true}")]
    [InlineData("{\"k\":\"KEY\",\"on\":true}{}")]
    [InlineData("{\"k\":\"KEY\",\"on\":true,}")]
    [InlineData("{\"k\":[\"KEY\"],\"on\":true}")]
    [InlineData("{'k':'KEY','on':true}")]
    public void XrayBadBody(string body)
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        var answer = rig.PostXray(body.Replace("KEY", key));
        Assert.Equal(400, answer.Status);
        Assert.False(rig.MarksFileExists);
        Assert.Null(rig.HoldXrayAt());
    }

    [Fact(DisplayName = "AC-1405.5 UTF-8이 아닌 몸은 400이다")]
    public void XrayNotUtf8()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        var bytes = Encoding.ASCII.GetBytes("{\"k\":\"" + key + "\",\"on\":true}").ToList();
        bytes.Insert(2, 0xFF);
        Assert.Equal(400, rig.PostXray(bytes.ToArray()).Status);
        Assert.False(rig.MarksFileExists);
    }

    [Theory(DisplayName = "AC-1405.5 쓰기 검사(Origin·X-Reception·JSON 형식)에 떨어지면 403이고 표시를 바꾸지 않는다")]
    [InlineData("http://evil.example", "1", "application/json")]
    [InlineData(null, "1", "application/json")]
    [InlineData("http://192.168.0.23:47200", null, "application/json")]
    [InlineData("http://192.168.0.23:47200", "1", "text/plain")]
    [InlineData("http://192.168.0.23:47200", "1", null)]
    public void XrayWriteGuard(string? origin, string? reception, string? contentType)
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        var headers = new List<KeyValuePair<string, string>>();
        if (origin != null) headers.Add(Header("Origin", origin));
        if (reception != null) headers.Add(Header("X-Reception", reception));
        if (contentType != null) headers.Add(Header("Content-Type", contentType));
        var answer = rig.Send("POST", "/api/xray", headers: headers, body: Encoding.UTF8.GetBytes("{\"k\":\"" + key + "\",\"on\":true}"));
        Assert.Equal(403, answer.Status);
        Assert.False(rig.MarksFileExists);
    }

    [Fact(DisplayName = "AC-1405.5 POST /api/xray에 질의 글이 붙으면 404이고 표시를 바꾸지 않는다")]
    public void XrayWithQuery()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        Assert.Equal(404, rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}", "/api/xray?on=1").Status);
        Assert.False(rig.MarksFileExists);
    }

    [Fact(DisplayName = "AC-1405.5 비트를 볼 수 없게 되면 POST /api/xray는 503이고 표시를 바꾸지 않는다")]
    public void XrayBoardUnavailable()
    {
        using var rig = new ServeRig();
        var key = rig.KeyOfChart("900102");
        rig.Bit.Locator.FailCode = BitErrors.NotFound;
        rig.Clock.Advance(TimeSpan.FromSeconds(9));
        Assert.Equal(503, rig.PostXray("{\"k\":\"" + key + "\",\"on\":true}").Status);
        Assert.False(rig.MarksFileExists);
    }

    // ---- AC-1406.8 /qr ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.8 이 PC 자신이 아닌 곳(직원 폰)의 /qr은 어떤 방법이든 404다(QR 화면을 부르지 않는다)")]
    public void QrOnlyFromThisPc()
    {
        var calls = 0;
        using var rig = new ServeRig(qr: () => { calls++; return QrAnswer(); });
        Assert.Equal(404, rig.Get("/qr").Status);
        Assert.Equal(404, rig.Send("POST", "/qr").Status);
        Assert.Equal(404, rig.Get("/qr", IPAddress.Parse("10.0.0.8")).Status);
        Assert.Equal(0, calls);
    }

    [Fact(DisplayName = "AC-1406.8 이 PC 자신(127.0.0.1·::1·섞인 IPv6)의 GET /qr은 QR 화면이고, 다른 방법은 405, 질의 글은 404다")]
    public void QrFromLoopback()
    {
        var calls = 0;
        using var rig = new ServeRig(qr: () => { calls++; return QrAnswer(); });
        var page = rig.Get("/qr", IPAddress.Loopback, "127.0.0.1:47200");
        Assert.Equal(200, page.Status);
        Assert.Equal("<p>qr</p>", Encoding.UTF8.GetString(page.Body));
        Assert.Equal(200, rig.Get("/qr", IPAddress.IPv6Loopback, "localhost:47200").Status);
        Assert.Equal(200, rig.Get("/qr", IPAddress.Parse("::ffff:127.0.0.1"), "127.0.0.1:47200").Status);
        Assert.Equal(405, rig.Send("POST", "/qr", IPAddress.Loopback, "127.0.0.1:47200").Status);
        Assert.Equal(404, rig.Get("/qr?x=1", IPAddress.Loopback, "127.0.0.1:47200").Status);
        Assert.Equal(3, calls);
    }

    [Fact(DisplayName = "AC-1406.8 QR 화면을 넘겨받지 않았으면 이 PC 자신의 /qr도 404다")]
    public void QrWithoutPage()
    {
        using var rig = new ServeRig();
        Assert.Equal(404, rig.Get("/qr", IPAddress.Loopback, "127.0.0.1:47200").Status);
    }

    // ---- AC-1406.7 기록 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1406.7 뜻밖의 예외는 500(몸 없음)이고 기록에는 E-RECEPTION-FAILED와 건수만 남는다(예외 글·환자 글·경로 없음)")]
    public void UnexpectedFailure()
    {
        using var rig = new ServeRig(lan: () => throw new InvalidOperationException("가상환자01 900101 /api/board 192.168.0.57"));
        var answer = rig.Get("/api/board");
        Assert.Equal(500, answer.Status);
        Assert.Empty(answer.Body);
        var lines = rig.LogLines();
        Assert.Contains(lines, line => line.EndsWith(" E-RECEPTION-FAILED 1", StringComparison.Ordinal));
        LogAssert.Clean(lines);
    }

    [Fact(DisplayName = "AC-1406.7 Host 403·쓰기 403·볼 수 없음 503은 기록에 번호(E-RECEPTION-HOST·E-RECEPTION-WRITE·E-BIT-…)와 건수만 남긴다")]
    public void RouterLogsCodesOnly()
    {
        using var rig = new ServeRig(registered: false);
        rig.Get("/api/board", host: "evil.example:47200");
        rig.Send("POST", "/api/xray", headers: new[] { Header("Origin", "http://evil.example") }, body: Encoding.UTF8.GetBytes("{\"k\":\"가상환자01\"}"));
        rig.Get("/api/board");
        rig.Get("/api/board?fresh=1");
        var lines = rig.LogLines();
        Assert.Contains(lines, line => line.Contains(" E-RECEPTION-HOST "));
        Assert.Contains(lines, line => line.Contains(" E-RECEPTION-WRITE "));
        Assert.Contains(lines, line => line.Contains(" " + BitErrors.NotRegistered + " "));
        LogAssert.Clean(lines);
    }

    [Fact(DisplayName = "AC-1406.7 ReceptionLog는 logs\\reception-yyyy-MM-dd.log에 '시각 - 번호 건수'만 쓰고, 번호 모양이 아닌 글(환자 글·경로·예외 글)은 invalid로 쓴다")]
    public void LogLineShape()
    {
        using var folder = new TempFolder();
        var clock = new CacheClock(new DateTime(2026, 11, 5, 10, 0, 0));
        var log = new ReceptionLog(folder.Path, clock.Now);
        log.Note("E-RECEPTION-BUSY");
        log.Note("가상환자01 900101");
        log.Note("/api/visit/0123456789abcdef/history");
        log.Note("System.InvalidOperationException: boom");
        log.Note(null);
        log.Flush();

        var file = Path.Combine(folder.Path, "reception-2026-11-05.log");
        Assert.True(File.Exists(file));
        var lines = File.ReadAllLines(file, Encoding.UTF8);
        Assert.StartsWith("2026-11-05T10:00:00.000", lines[0], StringComparison.Ordinal);
        Assert.EndsWith(" - E-RECEPTION-BUSY 1", lines[0], StringComparison.Ordinal);
        Assert.Contains(lines, line => line.EndsWith(" - invalid 4", StringComparison.Ordinal));
        LogAssert.Clean(lines);
    }

    [Fact(DisplayName = "AC-1406.7 같은 번호가 1분 안에 여러 번 오면 처음 한 줄 뒤로는 건수로 묶어 쓰고(기록이 끝없이 늘지 않음), 날이 바뀌면 새 날 파일에 쓴다")]
    public void LogCountsPerMinute()
    {
        using var folder = new TempFolder();
        var clock = new CacheClock(new DateTime(2026, 11, 5, 23, 58, 0));
        var log = new ReceptionLog(folder.Path, clock.Now);
        for (var i = 0; i < 50; i++) log.Note("E-RECEPTION-BUSY");
        var file = Path.Combine(folder.Path, "reception-2026-11-05.log");
        Assert.Single(File.ReadAllLines(file));

        clock.Advance(TimeSpan.FromSeconds(61));
        log.Note("E-RECEPTION-HTTP-408");
        var lines = File.ReadAllLines(file);
        Assert.Equal(3, lines.Length);
        Assert.EndsWith(" - E-RECEPTION-BUSY 1", lines[0], StringComparison.Ordinal);
        Assert.Contains(lines.Skip(1), line => line.EndsWith(" - E-RECEPTION-BUSY 49", StringComparison.Ordinal));
        Assert.Contains(lines.Skip(1), line => line.EndsWith(" - E-RECEPTION-HTTP-408 1", StringComparison.Ordinal));

        clock.Set(new DateTime(2026, 11, 6, 0, 0, 30));
        log.Note("E-RECEPTION-BUSY");
        Assert.Single(File.ReadAllLines(Path.Combine(folder.Path, "reception-2026-11-06.log")));
        LogAssert.Clean(File.ReadAllLines(file).Concat(File.ReadAllLines(Path.Combine(folder.Path, "reception-2026-11-06.log"))));
    }

    [Fact(DisplayName = "AC-1406.7 기록 폴더에 쓸 수 없어도 ReceptionLog는 던지지 않는다(서버를 멈추지 않는다)")]
    public void LogNeverThrows()
    {
        using var folder = new TempFolder();
        Directory.CreateDirectory(folder.Path);
        var blocked = Path.Combine(folder.Path, "blocked");
        File.WriteAllText(blocked, "file, not a folder");
        var log = new ReceptionLog(blocked, () => new DateTime(2026, 11, 5, 10, 0, 0));
        log.Note("E-RECEPTION-BUSY");
        log.Flush();
    }

    // ---- 도움 -------------------------------------------------------------------------------------

    internal static KeyValuePair<string, string> Header(string name, string value) => new KeyValuePair<string, string>(name, value);

    internal static JsonElement Json(HttpResponse answer)
    {
        using var document = JsonDocument.Parse(answer.Body);
        return document.RootElement.Clone();
    }

    private static HttpResponse QrAnswer() => HttpResponse.Bytes("text/html; charset=utf-8", Encoding.UTF8.GetBytes("<p>qr</p>"));
}

/// <summary>기록 줄 검사: 모양이 '시각 - 번호 건수'뿐이고 환자 글자·주소·경로·예외 글이 없다(AC-1406.7).</summary>
internal static class LogAssert
{
    private static readonly System.Text.RegularExpressions.Regex Shape = new System.Text.RegularExpressions.Regex(
        @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} - (E-[A-Z0-9]+(-[A-Z0-9]+)*|invalid) [1-9]\d*$");

    private static readonly string[] Forbidden =
    {
        "가상환자", "900101", "900102", "900103", "V100", "127.0.0.1", "192.168.", "10.0.0.", "8.8.8.8", "evil", "/api", "/qr", "history",
        "Exception", "boom", "Host", "47200",
    };

    public static void Clean(IEnumerable<string> lines)
    {
        var all = lines.ToArray();
        Assert.NotEmpty(all);
        foreach (var line in all)
        {
            Assert.Matches(Shape, line);
            foreach (var word in Forbidden) Assert.DoesNotContain(word, line, StringComparison.Ordinal);
        }
    }
}

/// <summary>가짜 화면 파일 원천. 이름은 Core csproj의 품은 이름 모양(reception/…, 윈도우 빌드는 '\')이다.</summary>
internal sealed class FakeStatic : IStaticSource
{
    private static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.Ordinal)
    {
        ["reception/index.html"] = Encoding.UTF8.GetBytes("<!doctype html><title>접수 현황</title>"),
        ["reception/style.css"] = Encoding.UTF8.GetBytes("body{color:var(--ink)}"),
        ["reception/app.js"] = Encoding.UTF8.GetBytes("export {}"),
        ["reception\\fonts\\title.woff2"] = new byte[] { 0x77, 0x4F, 0x46, 0x32, 1, 2, 3 },
        ["reception/fonts/OFL.txt"] = Encoding.UTF8.GetBytes("SIL Open Font License"),
        ["reception/manifest.webmanifest"] = Encoding.UTF8.GetBytes("{\"name\":\"접수 현황\"}"),
        ["reception/logo-mark.png"] = new byte[] { 0x89, 0x50, 0x4E, 0x47, 9, 9 },
        ["reception/notes.md"] = Encoding.UTF8.GetBytes("# 형식을 모르는 파일"),
        ["other/secret.html"] = Encoding.UTF8.GetBytes("<p>reception 밖</p>"),
        ["commands.json"] = Encoding.UTF8.GetBytes("{}"),
    };

    /// <summary>(요청 경로, 품은 이름, 형식)</summary>
    public static readonly (string Path, string Name, string Type)[] Served =
    {
        ("/", "reception/index.html", "text/html; charset=utf-8"),
        ("/index.html", "reception/index.html", "text/html; charset=utf-8"),
        ("/style.css", "reception/style.css", "text/css; charset=utf-8"),
        ("/app.js", "reception/app.js", "text/javascript; charset=utf-8"),
        ("/fonts/title.woff2", "reception\\fonts\\title.woff2", "font/woff2"),
        ("/fonts/OFL.txt", "reception/fonts/OFL.txt", "text/plain; charset=utf-8"),
        ("/manifest.webmanifest", "reception/manifest.webmanifest", "application/manifest+json"),
        ("/logo-mark.png", "reception/logo-mark.png", "image/png"),
    };

    public static byte[] BytesOf(string name) => Files[name];

    public IEnumerable<string> Names => Files.Keys.ToArray();

    public byte[]? Read(string name)
    {
        return Files.TryGetValue(name, out var bytes) ? bytes.ToArray() : null;
    }
}

/// <summary>
/// 길 나누기 한 벌: 가짜 비트(Rig, 오늘 접수 셋 V1001 S1·V1002 S2·V1003 S1 + 상세 답), 상태 표(S1 진료대기·S2 진료보류),
/// 실제 BoardCache·VisitKeys·XrayMarks(임시 폴더·가짜 암호화), 가짜 화면 파일, 임시 기록 폴더, 가짜 시계(2026-11-05 10:00).
/// 이 PC 사설 주소는 192.168.0.23, 직원 폰은 192.168.0.57이다.
/// </summary>
internal sealed class ServeRig : IDisposable
{
    public const string LanHost = "192.168.0.23:47200";
    public const string Day = "20261105";

    public static readonly IPAddress ThisPc = IPAddress.Parse("192.168.0.23");
    public static readonly IPAddress Phone = IPAddress.Parse("192.168.0.57");

    public static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal)
    {
        ["S1"] = Lane.Wait,
        ["S2"] = Lane.Hold,
    };

    private readonly TempFolder data = new TempFolder();
    private readonly TempFolder logs = new TempFolder();

    public ServeRig(bool registered = true, Func<HttpResponse>? qr = null, Func<IReadOnlyList<IPAddress>>? lan = null)
    {
        Bit = new Rig();
        if (registered) Bit.Registered();
        Bit.Today = BoardFake.Morning.Date;
        BoardFake.Quiet(Bit.Session);
        DetailFake.Answer(Bit.Session);
        Clock = new CacheClock(BoardFake.Morning);
        Cache = new BoardCache(Bit.Services, Clock.Now);
        Keys = new VisitKeys();
        Log = new ReceptionLog(logs.Path, Clock.Now);
        Marks = new XrayMarks(new StoreFolder(data.Path), Bit.Protector, Clock.Now, Log.Note);
        Static = new FakeStatic();
        Router = new ReceptionRouter(
            Bit.Services, Cache, Marks, Keys, new StaticFiles(Static), lan ?? (() => new[] { ThisPc }), Log, Clock.Now,
            Statuses, new string[0], qr);
    }

    public Rig Bit { get; }
    public CacheClock Clock { get; }
    public BoardCache Cache { get; }
    public VisitKeys Keys { get; }
    public XrayMarks Marks { get; }
    public FakeStatic Static { get; }
    public ReceptionLog Log { get; }
    public ReceptionRouter Router { get; }

    public string LogFolder => logs.Path;

    public int BoardReads => Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.TodayVisits);

    public int HistoryReads => Bit.Session.Calls.Count(call => call.Sql == ReceptionSql.HistoryCount || call.Sql == ReceptionSql.HistoryPage);

    public bool MarksFileExists => File.Exists(Path.Combine(data.Path, XrayMarks.FileName));

    public HttpResponse Send(
        string method, string target, IPAddress? client = null, string? host = null,
        IEnumerable<KeyValuePair<string, string>>? headers = null, byte[]? body = null, bool omitHost = false)
    {
        var all = new List<KeyValuePair<string, string>>();
        if (!omitHost) all.Add(new KeyValuePair<string, string>("Host", host ?? LanHost));
        if (headers != null) all.AddRange(headers);
        return Router.Handle(new HttpRequest(method, target, all, body ?? new byte[0]), client ?? Phone, ReceptionPorts.Http);
    }

    public HttpResponse Get(string target, IPAddress? client = null, string? host = null) => Send("GET", target, client, host);

    public HttpResponse PostXray(string json, string target = "/api/xray") => PostXray(Encoding.UTF8.GetBytes(json), target);

    public HttpResponse PostXray(byte[] body, string target = "/api/xray") =>
        Send("POST", target, headers: new[]
        {
            new KeyValuePair<string, string>("Origin", "http://" + LanHost),
            new KeyValuePair<string, string>("X-Reception", "1"),
            new KeyValuePair<string, string>("Content-Type", "application/json"),
        }, body: body);

    /// <summary>GET /api/board를 한 번 읽어 그 차트번호 줄의 화면용 열쇠를 돌려준다.</summary>
    public string KeyOfChart(string chart)
    {
        var board = ReceptionRouterTests.Json(Get("/api/board"));
        foreach (var row in board.GetProperty("lists").GetProperty("queue").EnumerateArray())
        {
            if (row.GetProperty("chart").GetString() == chart) return row.GetProperty("k").GetString()!;
        }
        throw new XunitException("그 차트번호 줄이 없다: " + chart);
    }

    /// <summary>판의 진료보류 첫 줄 엑스레이 시각(없으면 null). 묶음을 건너뛰려고 fresh로 읽는다.</summary>
    public string? HoldXrayAt()
    {
        Clock.Advance(TimeSpan.FromSeconds(3));
        var board = ReceptionRouterTests.Json(Get("/api/board?fresh=1"));
        var at = board.GetProperty("lists").GetProperty("hold")[0].GetProperty("xray").GetProperty("at");
        return at.ValueKind == JsonValueKind.Null ? null : at.GetString();
    }

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
