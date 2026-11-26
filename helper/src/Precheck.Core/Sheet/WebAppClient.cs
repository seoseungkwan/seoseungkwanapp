// 비트시트 app/src/Core/WebAppClient.cs(작업 트리 파일, 판 7)의 부르기·답 읽기 부분을 옮김(spec google-link TASK-9, design.md 9-1·9-2).
// 바뀐 것: 한국어 예외 → design.md 9-3 오류 번호(SheetException), 주소는 구글 웹 앱 꼴만(SheetUrls), 넘겨받기는 https script.googleusercontent.com만,
// 답은 숫자·참거짓·칸 주소만(SheetReply). 진짜 HTTP(HttpWebRequest, TLS 1.2, 60초)는 TASK-10이 ISheetTransport로 붙인다.
using System;
using System.Collections.Generic;

namespace Precheck.Core.Sheet;

/// <summary>
/// HTTP 한 번(넘겨받기를 저절로 따라가지 않음). 시험에서는 가짜로 바꾼다. 연결이 안 되면 SheetException
/// (E-GSHEET-NET·E-GSHEET-TIMEOUT·E-GSHEET-CUT)을 던진다. jsonBody가 null이면 GET.
/// </summary>
public interface ISheetTransport
{
    SheetHttpReply Send(string method, string url, string? jsonBody);
}

public sealed class SheetHttpReply
{
    public int Status { get; set; }
    public string Location { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string Body { get; set; } = "";
}

/// <summary>months 답의 한 달: 'yyyy-MM', 파일 id(없으면 ""), 날짜 시트 1~31의 gid.</summary>
public sealed class SheetMonth
{
    public string Ym { get; set; } = "";
    public string FileId { get; set; } = "";
    public SortedDictionary<int, long> Gids { get; } = new SortedDictionary<int, long>();
}

/// <summary>
/// 구글 웹 앱의 답(이름·차트번호·주소·오류 글 없음). 숫자·참거짓·칸 주소('23!J9' 꼴)와 모양을 본 파일 id·판·원본 이름·gid·mac만.
/// </summary>
public sealed class WebAppReply
{
    public bool Ok { get; set; }
    public string FileId { get; set; } = "";
    public bool Created { get; set; }
    public int Added { get; set; }
    public int Filled { get; set; }
    public int Overwritten { get; set; }
    public int Skipped { get; set; }
    public bool Full { get; set; }
    /// <summary>취소된 접수라서 비운 본 줄 수.</summary>
    public int CancelCleared { get; set; }
    /// <summary>취소된 접수인데 돈·직원 칸·이어지는 줄이 있어 남겨 둔 줄 수(사람이 봐야 함).</summary>
    public int CancelKept { get; set; }
    /// <summary>늦게 붙은 FREE를 고친 환자 수(경고 아님).</summary>
    public int FreeFixed { get; set; }
    /// <summary>늦게 낸 돈을 넣으려고 환자 바로 아래에 끼운 줄 수(경고 아님).</summary>
    public int Inserted { get; set; }
    /// <summary>새 달 파일을 만들 때 날짜 시트에 남아 있던 글자를 지운 칸 수(원본은 그대로, 경고 아님).</summary>
    public int Cleaned { get; set; }
    /// <summary>판 7 비율 식(J9:M9) 분모를 이름 칸 → 차트번호 칸으로 바꾼 칸 수(경고 아님).</summary>
    public int RatioFixed { get; set; }
    /// <summary>이름 칸을 세지만 모양이 달라 그대로 둔 비율 식 칸 수와 그 이름 몇 개('23!J9' 꼴, 값 없음, 20개까지).</summary>
    public int RatioSkipped { get; set; }
    public List<string> RatioSkippedCells { get; set; } = new List<string>();
    /// <summary>비율 식을 고치다 오류(다음 넣기에 다시 함).</summary>
    public bool RatioFailed { get; set; }
    /// <summary>원본 시트 이름(ping, 제어 글자 뺌·200자까지).</summary>
    public string TemplateTitle { get; set; } = "";
    /// <summary>구글 코드 판(숫자 글자만).</summary>
    public string Version { get; set; } = "";
    /// <summary>새 달 파일을 공유하지 못한 메일 수.</summary>
    public int ShareFailed { get; set; }
    /// <summary>쓴 날짜 시트 gid(8판 write).</summary>
    public long SheetGid { get; set; }
    /// <summary>답에 sheetGid가 있었나(7판 write에는 없다 — gid 0인 첫 시트와 가르려고, TASK-10).</summary>
    public bool HasSheetGid { get; set; }
    /// <summary>months 답(8판).</summary>
    public List<SheetMonth> Months { get; set; } = new List<SheetMonth>();
    /// <summary>hello 답 mac(base64url, 8판). 맞는지는 부르는 쪽이 같은 시간 비교로 본다.</summary>
    public string Mac { get; set; } = "";
}

/// <summary>
/// 구글 Apps Script 웹 앱 부르기. POST(JSON) → 302 Location(script.googleusercontent.com) → GET으로 답을 받는다.
/// 302를 저절로 따라가면 POST가 GET으로 바뀌는 등 틀어질 수 있어 손으로 따라간다. POST는 한 번만.
/// </summary>
public sealed class WebAppClient
{
    /// <summary>이 도우미와 맞는 Code.gs 판(BITSHEET_VERSION). 다르면 결과에 '옛 판' 안내를 낸다.</summary>
    public const string CodeVersion = "8";

    private const int MaxHops = 5;
    private readonly ISheetTransport http;

    public WebAppClient(ISheetTransport http)
    {
        this.http = http ?? throw new ArgumentNullException(nameof(http));
    }

    /// <summary>요청 하나를 보내고 답을 읽는다. action은 request의 "action"(write·ping·months·hello)으로 오류 번호를 가른다.</summary>
    public WebAppReply Call(string? webAppUrl, Dictionary<string, object> request)
    {
        if (request == null) throw new ArgumentNullException(nameof(request));
        var url = webAppUrl ?? "";
        if (url.Trim().Length == 0) throw new SheetException(SheetErrors.NoUrl);
        if (!SheetUrls.IsScriptUrl(url)) throw new SheetException(SheetErrors.Url);
        var action = request.TryGetValue("action", out var a) && a is string text ? text : "";

        var reply = http.Send("POST", url, SheetPayload.ToJson(request));
        var hops = 0;
        while (reply.Status >= 300 && reply.Status < 400)
        {
            if (++hops > MaxHops || string.IsNullOrEmpty(reply.Location)) throw new SheetException(SheetErrors.Server);
            var next = SheetUrls.Follow(url, reply.Location);
            if (next == null) throw new SheetException(SheetErrors.Login);
            reply = http.Send("GET", next, null);
            url = next;
        }

        if (reply.Status == 401 || reply.Status == 403) throw new SheetException(SheetErrors.Denied);
        if (reply.Status == 404) throw new SheetException(SheetErrors.Url);
        if (reply.Status != 200) throw new SheetException(SheetErrors.Server);
        return SheetReply.Parse(reply.Body, action);
    }

    /// <summary>답 글 읽기(비트시트 WebAppClient.Parse와 같은 이름). SheetReply.Parse(body, "write").</summary>
    public static WebAppReply Parse(string? body) => SheetReply.Parse(body);
}
