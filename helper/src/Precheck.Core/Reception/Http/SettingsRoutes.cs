using System;
using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception.Settings;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 설정·처방 코드·로고 길(spec reception-other-clinic design.md 4절, REQ-5704·REQ-5705·REQ-5706). 라우터는 Host 검사를 마친 요청을 <see cref="Route"/>에 넘기고,
/// 이 길이 아니면(null) 지금처럼 나눈다(라우터에 잇는 것은 TASK-8). 차례는 다른 길과 같다: 방법(405, Allow) → 질의 글이 붙으면 404 →
/// 쓰기 길은 몸 크기(413) → 쓰기 검사(403, 기록 E-RECEPTION-WRITE) → 몸 모양(400) → 저장.
/// - GET /api/settings → 200 설정 문서 전체(AC-5704.1).
/// - POST /api/settings → 32768바이트 넘음 413 · 403 · 모양 틀림 400 · rev 다름 409 · 바꿀 수 없는 것 400 · 저장(rev +1) 204 · 쓰지 못함 503(AC-5704.2).
/// - GET /api/codes → 200 {"codes":[{c,n,v}]} · 503(AC-5705.1). GET /api/code/{c} → 퍼센트 글자를 UTF-8로 엄격히 풀어 코드 모양이면 200 {c,n}, 아니면 비트를 읽지 않고 404 · 503(AC-5705.2).
/// - POST /api/logo → 2097152바이트 넘음 413 · 403 · 그림 형식·첫 바이트·크기 틀림 400 · 로고 파일에 쓰고 logo.mode pic·ver +1·setup.logo 참·rev +1 → 204 · 쓰지 못함 503(AC-5706.1).
/// - GET /api/logo → 200 그 형식(image/png·image/jpeg)과 그림 · 없으면 404 · 읽지 못함 503(AC-5706.2).
/// 503 몸은 {"state":"unavailable"}이고 기록에는 오류 번호만 간다(처방 이름·코드·병원 이름·그림 바이트를 싣지 않는다, AC-5714.2).
/// </summary>
public sealed class SettingsRoutes
{
    public const string SettingsPath = BodyLimits.SettingsPath;
    public const string CodesPath = "/api/codes";
    public const string CodePrefix = "/api/code/";
    public const string LogoPath = BodyLimits.LogoPath;

    private const string Get = "GET";
    private const string Post = "POST";

    private static readonly byte[] UnavailableBody = Encoding.UTF8.GetBytes("{\"state\":\"unavailable\"}");
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions { Encoder = JavaScriptEncoder.Create(UnicodeRanges.All) };
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    private readonly SettingsStore settings;
    private readonly LogoStore logo;
    private readonly CodesReader codes;
    private readonly ReceptionLog? log;

    // 로고 파일 쓰기와 설정 ver 올리기를 한 번에 하나만(두 기기가 같이 올려도 그림과 ver가 엇갈리지 않게)
    private readonly object logoGate = new object();

    public SettingsRoutes(SettingsStore settings, LogoStore logo, CodesReader codes, ReceptionLog? log = null)
    {
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        this.logo = logo ?? throw new ArgumentNullException(nameof(logo));
        this.codes = codes ?? throw new ArgumentNullException(nameof(codes));
        this.log = log;
    }

    /// <summary>이 길의 답. 설정·코드·로고 길이 아니면 null(라우터가 지금처럼 나눈다).</summary>
    public HttpResponse? Route(HttpRequest r)
    {
        if (r == null) throw new ArgumentNullException(nameof(r));
        if (r.Path == SettingsPath)
        {
            if (r.Method == Get) return r.Query == null ? GetSettings() : NotFound();
            if (r.Method == Post) return r.Query == null ? PostSettings(r) : NotFound();
            return HttpResponse.NotAllowed(Get, Post);
        }
        if (r.Path == CodesPath)
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return r.Query == null ? GetCodes() : NotFound();
        }
        if (r.Path.StartsWith(CodePrefix, StringComparison.Ordinal))
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return r.Query == null ? GetCode(r.Path.Substring(CodePrefix.Length)) : NotFound();
        }
        if (r.Path == LogoPath)
        {
            if (r.Method == Get) return r.Query == null ? GetLogo() : NotFound();
            if (r.Method == Post) return r.Query == null ? PostLogo(r) : NotFound();
            return HttpResponse.NotAllowed(Get, Post);
        }
        return null;
    }

    /// <summary>GET /api/settings(AC-5704.1): 지금 설정 문서 전체. 설정 파일을 읽지 못해도 처음 값으로 답한다(SettingsStore.Current).</summary>
    private HttpResponse GetSettings()
    {
        var current = settings.Current();
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions)) current.Write(writer);
        return HttpResponse.Bytes("application/json; charset=utf-8", buffer.ToArray());
    }

    /// <summary>POST /api/settings(AC-5704.2): 몸 크기(413) → 쓰기 검사(403) → 문서 모양(400) → SettingsStore.Save(409·400·204) · 쓰지 못함 503.</summary>
    private HttpResponse PostSettings(HttpRequest r)
    {
        if (r.Body.Length > BodyLimits.Settings) return HttpResponse.Empty(413);
        if (!WriteOk(r)) return HttpResponse.Empty(403);
        if (!ReceptionSettings.TryParse(r.Body, out var next)) return HttpResponse.Empty(400);
        SaveResult result;
        try
        {
            result = settings.Save(next);
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        switch (result)
        {
            case SaveResult.Saved:
                return HttpResponse.Empty(204);
            case SaveResult.Conflict:
                return HttpResponse.Empty(409);
            default:
                return HttpResponse.Empty(400);
        }
    }

    /// <summary>GET /api/codes(AC-5705.1): 지난 30일 처방 코드 목록(CodesReader, 5분 기억).</summary>
    private HttpResponse GetCodes()
    {
        var result = codes.Codes();
        return result.IsOk ? HttpResponse.Json(result.ToJson()) : Unavailable(result.Error);
    }

    /// <summary>GET /api/code/{c}(AC-5705.2): 퍼센트 글자를 풀어 코드 모양이 아니면 비트를 읽지 않고 404.</summary>
    private HttpResponse GetCode(string segment)
    {
        var code = Decode(segment);
        if (!CodesReader.IsCode(code)) return NotFound();
        var result = codes.Name(code);
        switch (result.State)
        {
            case HistoryState.Ok:
                return HttpResponse.Json(result.ToJson());
            case HistoryState.NotFound:
                return NotFound();
            default:
                return Unavailable(result.Error);
        }
    }

    /// <summary>
    /// POST /api/logo(AC-5706.1): 몸 크기(413) → 쓰기 검사(403) → 그림 형식·첫 바이트·크기(LogoImage.TryRead, 400) →
    /// 로고 파일에 쓰고 logo.mode pic·ver +1·setup.logo 참으로 설정을 바꿔(rev +1) 204. 로고 파일을 쓰지 못하면 설정은 그대로 두고 503.
    /// </summary>
    private HttpResponse PostLogo(HttpRequest r)
    {
        if (r.Body.Length > BodyLimits.Logo) return HttpResponse.Empty(413);
        if (!WriteOk(r)) return HttpResponse.Empty(403);
        if (!LogoImage.TryRead(r.Body, r.Header("Content-Type"), out var kind, out _, out _)) return HttpResponse.Empty(400);
        try
        {
            lock (logoGate)
            {
                logo.Save(kind, r.Body);
                settings.Update(s => s
                    .WithLogo(new LogoSetting(LogoModes.Pic, s.Logo.Text, s.Logo.Ver + 1))
                    .WithSetup(new SetupState(true, s.Setup.Tab, s.Setup.Done)));
            }
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        return HttpResponse.Empty(204);
    }

    /// <summary>
    /// GET /api/logo(AC-5706.2): 로고 파일의 그림(200, 그 형식) 또는 404. 먼저 설정을 읽어 둬서 우리 의원 처음 값이면 품은 그림이 로고 파일로 옮겨져 있다.
    /// 로고 파일을 읽지 못하면(잠김·권한) 503.
    /// </summary>
    private HttpResponse GetLogo()
    {
        settings.Current();
        LogoPicture? picture;
        try
        {
            picture = logo.Read();
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        return picture == null ? NotFound() : HttpResponse.Bytes(picture.ContentType, picture.Bytes);
    }

    private bool WriteOk(HttpRequest r)
    {
        if (ClientGuard.WriteOk(r)) return true;
        log?.Note(ReceptionErrors.BadWrite);
        return false;
    }

    /// <summary>
    /// 경로 조각의 퍼센트 글자(%XX, 16진 두 자리)를 바이트로 풀고 UTF-8로 엄격히 읽는다. 잘린 %·16진 아닌 %·ASCII 밖 글자·틀린 UTF-8(대리쌍 포함)이면 null.
    /// </summary>
    internal static string? Decode(string segment)
    {
        if (segment == null) return null;
        var bytes = new byte[segment.Length];
        var count = 0;
        for (var i = 0; i < segment.Length; i++)
        {
            var c = segment[i];
            if (c == '%')
            {
                if (i + 2 >= segment.Length) return null;
                var high = Hex(segment[i + 1]);
                var low = Hex(segment[i + 2]);
                if (high < 0 || low < 0) return null;
                bytes[count++] = (byte)((high << 4) | low);
                i += 2;
                continue;
            }
            if (c > 0x7E || c < 0x20) return null;
            bytes[count++] = (byte)c;
        }
        try
        {
            return StrictUtf8.GetString(bytes, 0, count);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static int Hex(char c)
    {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        return -1;
    }

    private static HttpResponse NotFound() => HttpResponse.Empty(404);

    private HttpResponse Unavailable(string? error)
    {
        log?.Note(error ?? BitErrors.ReadFailed);
        return HttpResponse.Bytes("application/json; charset=utf-8", UnavailableBody, 503);
    }
}
