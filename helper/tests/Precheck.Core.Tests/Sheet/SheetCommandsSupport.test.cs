using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;
using Precheck.Core.Sheet;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>가짜 확인 창(ISheetConfirm): 띄운 글·시간을 적고 정해 둔 답([바꾸기] 참 · [취소]·2분 지남 거짓)을 준다.</summary>
internal sealed class FakeSheetConfirm : ISheetConfirm
{
    public bool Answer { get; set; } = true;

    public List<(string Text, TimeSpan Timeout)> Shown { get; } = new List<(string Text, TimeSpan Timeout)>();

    /// <summary>창이 떠 있는 동안 할 일(시험: 창을 띄운 채로 무엇이 바뀌었는지 볼 때).</summary>
    public Action? While { get; set; }

    public bool Show(string text, TimeSpan timeout)
    {
        Shown.Add((text, timeout));
        While?.Invoke();
        return Answer;
    }
}

/// <summary>가짜 클립보드(IClipboard).</summary>
internal sealed class FakeClipboard : IClipboard
{
    public List<string> Texts { get; } = new List<string>();

    public bool Fail { get; set; }

    public void SetText(string text)
    {
        if (Fail) throw new HelperException("E-STORE-FAILED");
        Texts.Add(text);
    }
}

/// <summary>가짜 시계(지난 시간). 가짜 비트·가짜 구글이 부를 때 시간을 밀어 시간 제한을 본다.</summary>
internal sealed class FakeClock
{
    public TimeSpan Now { get; private set; }

    public void Advance(TimeSpan by) => Now += by;
}

/// <summary>
/// 가짜 수납 구글 코드(ISheetTransport): google-code/sheet/Code.gs 8판(또는 Version으로 7판)의 hello·ping·months·write 답을 흉내 낸다.
/// POST는 302 googleusercontent로 넘기고 GET이 답을 준다(구글 웹 앱과 같다). 비밀 글자·주소는 지어낸 것이다.
/// </summary>
internal sealed class FakeGoogle : ISheetTransport
{
    public const string Echo = "https://script.googleusercontent.com/macros/echo?user_content_key=FAKEkey";
    public const string FileId = "1FAKEfileFAKEfileFAKEfile_0123456789";

    private string pending = "";

    public FakeGoogle(FakeClock clock)
    {
        Clock = clock;
    }

    public FakeClock Clock { get; }

    /// <summary>구글 코드 첫 줄에 붙은 비밀 글자.</summary>
    public string Token { get; set; } = SheetRig.Secret;

    /// <summary>구글 코드 판. "7"이면 비트시트 7판(hello·months를 모름, write 답에 sheetGid 없음).</summary>
    public string Version { get; set; } = "8";

    public bool TokenNotSet { get; set; }

    /// <summary>hello에 다른 비밀 글자로 만든 mac을 준다(이 주소의 코드가 이 PC의 비밀 글자를 모름).</summary>
    public bool WrongMac { get; set; }

    /// <summary>부를 때마다 밀리는 시간.</summary>
    public TimeSpan PerCall { get; set; } = TimeSpan.Zero;

    /// <summary>POST 넘기기 주소(기본 googleusercontent).</summary>
    public string Redirect { get; set; } = Echo;

    /// <summary>write 답 글을 바꿀 때.</summary>
    public Func<JsonElement, string>? WriteAnswer { get; set; }

    public List<(string Method, string Url, string? Body)> Calls { get; } = new List<(string Method, string Url, string? Body)>();

    /// <summary>POST로 보낸 요청의 action 차례.</summary>
    public List<string> Actions { get; } = new List<string>();

    public string AllBodies => string.Join("\n", Calls.Select(c => c.Body ?? ""));

    public SheetHttpReply Send(string method, string url, string? jsonBody)
    {
        Calls.Add((method, url, jsonBody));
        Clock.Advance(PerCall);
        if (method == "POST")
        {
            pending = Answer(jsonBody ?? "");
            return new SheetHttpReply { Status = 302, Location = Redirect };
        }
        return new SheetHttpReply { Status = 200, ContentType = "application/json; charset=utf-8", Body = pending };
    }

    public static string Mac(string key, string nonce)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
        return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(nonce))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private bool Old => int.Parse(Version, CultureInfo.InvariantCulture) < 8;

    private string Answer(string body)
    {
        using var doc = JsonDocument.Parse(body);
        var req = doc.RootElement;
        var action = req.GetProperty("action").GetString() ?? "";
        Actions.Add(action);
        if (action == "hello" && !Old)
        {
            if (TokenNotSet) return Fail("token_not_set");
            var nonce = req.GetProperty("nonce").GetString() ?? "";
            var mac = Mac(WrongMac ? "FAKEotherFAKEotherFAKEother0123456789" : Token, nonce);
            return "{\"ok\":true,\"version\":\"" + Version + "\",\"mac\":\"" + mac + "\"}";
        }
        if (TokenNotSet) return Fail("token_not_set");
        if (!req.TryGetProperty("token", out var token) || token.GetString() != Token) return Fail("bad_token");
        switch (action)
        {
            case "ping":
                return "{\"ok\":true,\"templateTitle\":\"가짜 원본 시트\",\"version\":\"" + Version + "\"}";
            case "months":
                if (Old) return Fail("bad_request");
                var months = req.GetProperty("names").EnumerateArray().Select(n =>
                {
                    var ym = n.GetProperty("ym").GetString();
                    return ym == "2026-10"
                        ? "{\"ym\":\"" + ym + "\",\"fileId\":\"" + FileId + "\",\"gids\":{\"1\":11,\"30\":40}}"
                        : "{\"ym\":\"" + ym + "\",\"fileId\":null,\"gids\":{}}";
                });
                return "{\"ok\":true,\"version\":\"" + Version + "\",\"months\":[" + string.Join(",", months) + "]}";
            case "write":
                if (WriteAnswer != null) return WriteAnswer(req);
                return "{\"ok\":true,\"fileId\":\"" + FileId + "\",\"fileUrl\":\"https://docs.google.com/spreadsheets/d/" + FileId + "/edit\",\"created\":true,"
                    + "\"added\":1,\"filled\":0,\"overwritten\":0,\"skipped\":0,\"full\":false,\"shareFailed\":0,\"cancelCleared\":0,\"cancelKept\":0,"
                    + "\"freeFixed\":0,\"inserted\":0,\"cleaned\":2,\"version\":\"" + Version + "\""
                    + (Old ? "" : ",\"sheetGid\":777")
                    + ",\"ratioFormulas\":{\"fixed\":1,\"skipped\":[\"30!J9\"],\"skippedCount\":1,\"failed\":false}}";
            default:
                return Fail("bad_request");
        }
    }

    private static string Fail(string code) => "{\"ok\":false,\"code\":\"" + code + "\",\"error\":\"가짜 오류 글\"}";
}

/// <summary>
/// 수납 명령 처리기(SheetCommands)를 가짜 비트(Rig)·가짜 sheet.dat 폴더·가짜 구글·가짜 확인 창·가짜 클립보드에 붙인 Dispatcher.
/// 한국 오늘은 2026-10-30(Synthetic.Today). 기록기는 (명령 이름, 오류 번호)를 모은다. 환자 이름·차트번호·메일은 모두 지어낸 것이다.
/// </summary>
internal sealed class SheetRig : IDisposable
{
    public const string Id = "s-1";
    public const string Url = "https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123456789/exec";
    public const string WorkspaceUrl = "https://script.google.com/a/macros/fake-clinic.test/s/AKfycbOTHERfake0123456789/exec";
    public const string Secret = "FAKEsecretFAKEsecretFAKEsecret0123456789abc";
    public const string Mail = "desk@fake.test";
    public const string OtherMail = "boss@fake.test";
    public const string Template = "https://docs.google.com/spreadsheets/d/1FAKEtemplateFAKEtemplate0123/edit";
    public const string PatientName = "가상환자01";
    public const string Chart = "90001";

    /// <summary>hello에 실을 nonce(시험에서 정함, 무작위 24바이트 base64url 32자 꼴).</summary>
    public const string Nonce = "FAKEnonceFAKEnonceFAKEnonce01234";

    public SheetRig(bool registered = true)
    {
        Bit = registered ? new Rig().Registered() : new Rig();
        Store = new SheetStore(Bit.Folder, Bit.Protector);
        Google = new FakeGoogle(Clock);
        Services = new SheetServices(
            Bit.Services,
            Store,
            left =>
            {
                TimeLeft.Add(left);
                return Google;
            },
            Confirm,
            Clipboard,
            () =>
            {
                if (BitSheetFails != null) throw BitSheetFails;
                return BitSheet;
            },
            () => HasBitSheet,
            () => Clock.Now,
            nonce: () => Nonce);
        Dispatcher = new Dispatcher(CommandTable.LoadEmbedded(), (name, code) => Log.Add((name, code)));
        SheetCommands.Register(Dispatcher, Services);
    }

    public Rig Bit { get; }

    public SheetStore Store { get; }

    public FakeClock Clock { get; } = new FakeClock();

    public FakeGoogle Google { get; }

    public FakeSheetConfirm Confirm { get; } = new FakeSheetConfirm();

    public FakeClipboard Clipboard { get; } = new FakeClipboard();

    public SheetServices Services { get; }

    public Dispatcher Dispatcher { get; }

    /// <summary>구글 보내기를 만들 때 받은 '남은 시간' 함수들.</summary>
    public List<Func<TimeSpan>> TimeLeft { get; } = new List<Func<TimeSpan>>();

    /// <summary>가져올 비트시트 설정(sheet.import). null이면 BitSheetFails(기본 E-GSHEET-SECRET).</summary>
    public BitSheetImported? BitSheet { get; set; }

    public HelperException? BitSheetFails { get; set; }

    public bool HasBitSheet { get; set; }

    public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();

    public ListSink Sink { get; private set; } = new ListSink();

    /// <summary>답 바이트를 모두 이은 글자.</summary>
    public string RawReplies => string.Concat(Sink.Messages.Select(m => Encoding.UTF8.GetString(m)));

    /// <summary>비트(설치 위치·DB)를 건드렸나.</summary>
    public bool BitTouched => Bit.Locator.Calls > 0 || Bit.Connector.Opened.Count > 0;

    /// <summary>이 PC에 비밀 글자·주소·메일을 둔다(sheet.dat).</summary>
    public SheetRig Linked(bool verified = true, string url = Url, params string[] mails)
    {
        Store.Save(new SheetState { Secret = Secret, Url = url, ShareWith = mails.ToList(), Verified = verified });
        return this;
    }

    public List<JsonElement> Send(string cmd, string argsJson)
    {
        Sink = new ListSink();
        Dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, argsJson, Id)), Sink);
        return Sink.Replies;
    }

    /// <summary>답이 result 하나뿐인지 보고 data를 돌려준다.</summary>
    public JsonElement Result(string cmd, string argsJson)
    {
        var reply = Assert.Single(Send(cmd, argsJson));
        Assert.True(reply.GetProperty("type").GetString() == "result", reply.GetRawText());
        Assert.Equal(Id, reply.GetProperty("id").GetString());
        return reply.GetProperty("data");
    }

    /// <summary>답이 error 하나뿐인지 보고 오류 번호를 돌려준다.</summary>
    public string Error(string cmd, string argsJson)
    {
        var reply = Assert.Single(Send(cmd, argsJson));
        Assert.True(reply.GetProperty("type").GetString() == "error", reply.GetRawText());
        return reply.GetProperty("code").GetString()!;
    }

    /// <summary>웹 설정 JSON(GsheetSettings, 주소·메일·비밀 글자 없음).</summary>
    public static string SettingsJson(Action<Settings>? edit = null)
    {
        var s = new Settings { TemplateUrl = Template };
        edit?.Invoke(s);
        return SheetSettingsJson.ToJson(s);
    }

    public static string FillArgs(string day = "2026-10-30", string mode = "fillEmpty", bool auto = false, string? settings = null) =>
        "{\"day\":\"" + day + "\",\"mode\":\"" + mode + "\",\"auto\":" + (auto ? "true" : "false") + ",\"settings\":" + (settings ?? SettingsJson()) + "}";

    /// <summary>가짜 비트 하루: 병원 하나(등록 범위 SYNTHETIC), 환자 한 명(현금 5,000원 한 줄).</summary>
    public SheetRig OnePatientDay(Action? onVisits = null)
    {
        var db = Bit.Session;
        db.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { Synthetic.Scope + " ", "가짜정형외과의원" } });
        db.Answer(SheetSql.VisitsSql, _ =>
        {
            onVisits?.Invoke();
            return new[] { new object?[] { "V1", Chart, PatientName, "202610300910", "OS", "1", 31 } };
        });
        db.Answer(SheetSql.CodesSql, _ => new object?[0][]);
        db.Answer(SheetSql.PaymentsSql, _ => new[] { new object?[] { "V1", Chart, "RCV", 5000m, 0m, 0m, "202610300920", 1, PatientName } });
        db.Answer(SheetSql.BillsSql, _ => new[] { new object?[] { "V1", 5000m, 15000m, 31, 0 } });
        db.Answer(SheetSql.CancelledSql, _ => new object?[0][]);
        return this;
    }

    public void Dispose() => Bit.Dispose();
}
