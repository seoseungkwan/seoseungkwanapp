using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 길 나누기(design.md 7절·데이터 흐름, AC-1406.5). 서버가 요청 하나마다 부르고, 답 하나를 돌려준다. 던지지 않는다(뜻밖의 오류는 500).
/// 차례: 보낸 쪽이 사설 주소인가 → Host가 이 PC 주소:문인가(아니면 403) → OPTIONS는 405 → 정해 둔 길.
/// - GET /api/board → BoardCache.Get() → BoardBuilder 판 JSON(200). GET /api/board?fresh=1만 fresh로 넘긴다(AC-1403.8). 다른 질의 글은 404.
/// - GET /api/visit/{k}/history?from=N → HistoryReader.Get(200·404·503). 틀린 열쇠·시작 위치는 비트를 읽지 않고 404(AC-1404.5).
/// - POST /api/xray {k, on} → 쓰기 검사(아니면 403) → 몸 모양(아니면 400) → 그날 열쇠·오늘 진료보류 줄(아니면 404) → XrayMarks.Set → 204(AC-1405.5).
/// - GET /qr은 이 PC 자신(루프백)만. 다른 곳에는 없는 길이다(404, AC-1406.8).
/// - 그 밖은 화면 파일(StaticFiles, 질의 글 없이 GET만). 어디에도 없으면 404, 있는 길에 다른 방법이면 405(Allow).
/// 비트를 볼 수 없으면 503 {"state":"unavailable"}(환자 자료 없음). 기록에는 오류 번호만 남긴다(AC-1406.7).
/// </summary>
public sealed class ReceptionRouter
{
    private const string BoardPath = "/api/board";
    private const string FreshQuery = "fresh=1";
    private const string XrayPath = "/api/xray";
    private const string QrPath = "/qr";
    private const string VisitPrefix = "/api/visit/";
    private const string HistorySuffix = "/history";
    private const string FromPrefix = "from=";
    private const string Get = "GET";
    private const string Post = "POST";

    private static readonly byte[] UnavailableBody = Encoding.UTF8.GetBytes("{\"state\":\"unavailable\"}");
    private static readonly JsonDocumentOptions XrayJson = new JsonDocumentOptions { MaxDepth = 2 };
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    private readonly BitServices services;
    private readonly BoardCache board;
    private readonly XrayMarks marks;
    private readonly VisitKeys keys;
    private readonly StaticFiles files;
    private readonly Func<IReadOnlyList<IPAddress>> lanAddresses;
    private readonly ReceptionLog? log;
    private readonly Func<DateTime> clock;
    private readonly IReadOnlyDictionary<string, Lane> statuses;
    private readonly HashSet<string> hiddenRsu;
    private readonly Func<HttpResponse>? qrPage;

    /// <param name="services">상세 읽기의 등록 확인·비트 연결(HistoryReader).</param>
    /// <param name="board">접수 현황 캐시(같은 시계로 만든 것).</param>
    /// <param name="marks">엑스레이 찍음 표시.</param>
    /// <param name="keys">그날 화면용 열쇠표.</param>
    /// <param name="files">휴대폰 화면 파일.</param>
    /// <param name="lanAddresses">이 PC의 지금 사설 IPv4 목록(LanAddressWatch.Current). Host 검사에 쓴다.</param>
    /// <param name="log">기록(없으면 남기지 않음).</param>
    /// <param name="clock">이 PC의 시계(기다린 분·오늘 날짜). 없으면 DateTime.Now.</param>
    /// <param name="statuses">상태 코드 → 칸. 없으면 ReceptionMap.Statuses.</param>
    /// <param name="hiddenRsu">숨기는 OcmRsuYon 값. 없으면 ReceptionMap.HiddenRsu.</param>
    /// <param name="qrPage">이 PC 자신의 GET /qr 답(TASK-25 QrPage). 없으면 /qr은 404.</param>
    public ReceptionRouter(
        BitServices services,
        BoardCache board,
        XrayMarks marks,
        VisitKeys keys,
        StaticFiles files,
        Func<IReadOnlyList<IPAddress>> lanAddresses,
        ReceptionLog? log = null,
        Func<DateTime>? clock = null,
        IReadOnlyDictionary<string, Lane>? statuses = null,
        IEnumerable<string>? hiddenRsu = null,
        Func<HttpResponse>? qrPage = null)
    {
        this.services = services ?? throw new ArgumentNullException(nameof(services));
        this.board = board ?? throw new ArgumentNullException(nameof(board));
        this.marks = marks ?? throw new ArgumentNullException(nameof(marks));
        this.keys = keys ?? throw new ArgumentNullException(nameof(keys));
        this.files = files ?? throw new ArgumentNullException(nameof(files));
        this.lanAddresses = lanAddresses ?? throw new ArgumentNullException(nameof(lanAddresses));
        this.log = log;
        this.clock = clock ?? (() => DateTime.Now);
        this.statuses = statuses ?? ReceptionMap.Statuses;
        this.hiddenRsu = new HashSet<string>(hiddenRsu ?? ReceptionMap.HiddenRsu, StringComparer.Ordinal);
        this.qrPage = qrPage;
    }

    /// <summary>요청 하나의 답. client는 보낸 쪽 주소, port는 서버가 듣는 문(Host 검사, 보통 47200). 던지지 않는다.</summary>
    public HttpResponse Handle(HttpRequest r, IPAddress client, int port = ReceptionPorts.Http)
    {
        if (r == null) throw new ArgumentNullException(nameof(r));
        try
        {
            if (client == null || !ClientGuard.IsPrivateClient(client) || !ClientGuard.HostOk(r.Header("Host"), client, lanAddresses(), port))
            {
                log?.Note(ReceptionErrors.BadHost);
                return HttpResponse.Empty(403);
            }
            if (r.Method == "OPTIONS") return HttpResponse.NotAllowed(Get, Post);
            return Route(r, client);
        }
        catch (Exception)
        {
            log?.Note(ReceptionErrors.Failed);
            return HttpResponse.Empty(500);
        }
    }

    private HttpResponse Route(HttpRequest r, IPAddress client)
    {
        if (r.Path == BoardPath)
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            if (r.Query == null) return Board(false);
            return r.Query == FreshQuery ? Board(true) : NotFound();
        }
        if (r.Path == XrayPath)
        {
            if (r.Method != Post) return HttpResponse.NotAllowed(Post);
            return r.Query == null ? Xray(r) : NotFound();
        }
        if (r.Path == QrPath)
        {
            // 이 PC 자신이 아니면 /qr은 없는 길이다(AC-1406.8)
            if (!IsLoopback(client) || qrPage == null) return NotFound();
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return r.Query == null ? qrPage() : NotFound();
        }
        if (TryHistoryKey(r.Path, out var key))
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return History(key, r.Query);
        }

        var file = files.Get(r.Path);
        if (file == null) return NotFound();
        if (r.Method != Get) return HttpResponse.NotAllowed(Get);
        return r.Query == null ? file : NotFound();
    }

    private HttpResponse Board(bool fresh)
    {
        var result = board.Get(fresh);
        if (!result.IsOk) return Unavailable(result.Error);
        var built = BoardBuilder.Build(result.Input!, statuses, hiddenRsu, marks.Today(), keys, clock());
        return HttpResponse.Json(built.ToJson());
    }

    private HttpResponse History(string key, string? query)
    {
        var from = query != null && query.StartsWith(FromPrefix, StringComparison.Ordinal) ? query.Substring(FromPrefix.Length) : null;
        var result = HistoryReader.Get(services, keys, () => board.Get(), key, from, clock);
        switch (result.State)
        {
            case HistoryState.Ok:
                return HttpResponse.Json(result.History!.ToJson());
            case HistoryState.NotFound:
                return NotFound();
            default:
                return Unavailable(result.Error);
        }
    }

    private HttpResponse Xray(HttpRequest r)
    {
        if (!ClientGuard.WriteOk(r))
        {
            log?.Note(ReceptionErrors.BadWrite);
            return HttpResponse.Empty(403);
        }
        if (!TryXrayBody(r.Body, out var key, out var on)) return HttpResponse.Empty(400);

        var found = keys.Find(DayOf(clock()), key);
        if (found == null) return NotFound();
        var current = board.Get();
        if (!current.IsOk) return Unavailable(current.Error);
        var input = current.Input!;
        if (!string.Equals(input.Day, found.Day, StringComparison.Ordinal)) return NotFound();
        var visit = input.Visits.FirstOrDefault(row => string.Equals(row.VisitId, found.VisitId, StringComparison.Ordinal));
        if (visit == null || ReceptionMap.LaneOf(statuses, hiddenRsu, visit.Status, visit.Rsu) != Lane.Hold) return NotFound();

        try
        {
            marks.Set(visit.VisitId, on);
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        return HttpResponse.Empty(204);
    }

    /// <summary>몸이 꼭 {"k": 글, "on": 참/거짓} 두 칸뿐인 바른 UTF-8 JSON인가(칸 차례는 상관없음, 같은 칸 두 번·다른 칸은 틀림).</summary>
    private static bool TryXrayBody(byte[] body, out string key, out bool on)
    {
        key = "";
        on = false;
        try
        {
            // 틀린 UTF-8은 먼저 걸러 낸다(JSON 읽기가 칸 이름을 풀다 다른 예외를 내지 않게)
            using var document = JsonDocument.Parse(StrictUtf8.GetString(body), XrayJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;
            string? k = null;
            bool? value = null;
            var count = 0;
            foreach (var property in root.EnumerateObject())
            {
                count++;
                if (property.Name == "k" && k == null && property.Value.ValueKind == JsonValueKind.String) k = property.Value.GetString();
                else if (property.Name == "on" && value == null && (property.Value.ValueKind == JsonValueKind.True || property.Value.ValueKind == JsonValueKind.False))
                    value = property.Value.GetBoolean();
                else return false;
            }
            if (count != 2 || k == null || value == null) return false;
            key = k;
            on = value.Value;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    /// <summary>/api/visit/{k}/history 모양이면 그 사이 글(빈 글 포함, '/' 없음)</summary>
    private static bool TryHistoryKey(string path, out string key)
    {
        key = "";
        if (path.Length < VisitPrefix.Length + HistorySuffix.Length) return false;
        if (!path.StartsWith(VisitPrefix, StringComparison.Ordinal) || !path.EndsWith(HistorySuffix, StringComparison.Ordinal)) return false;
        var middle = path.Substring(VisitPrefix.Length, path.Length - VisitPrefix.Length - HistorySuffix.Length);
        if (middle.IndexOf('/') >= 0) return false;
        key = middle;
        return true;
    }

    private HttpResponse Unavailable(string? error)
    {
        log?.Note(error ?? BitErrors.ReadFailed);
        return HttpResponse.Bytes("application/json; charset=utf-8", UnavailableBody, 503);
    }

    private static HttpResponse NotFound() => HttpResponse.Empty(404);

    /// <summary>127.0.0.0/8·::1(IPv4가 섞인 IPv6는 풀어서 본다)</summary>
    private static bool IsLoopback(IPAddress client)
    {
        var address = client.AddressFamily == AddressFamily.InterNetworkV6 && client.IsIPv4MappedToIPv6 ? client.MapToIPv4() : client;
        return IPAddress.IsLoopback(address);
    }

    private static string DayOf(DateTime at) => at.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
}
