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
/// - GET /api/visit/{k}/prev(질의 글 없음) → PrevPaperReader.Get(200 {"prev"}·404·503, spec reception-arrange AC-3307.1·3307.3).
/// - GET /api/visit/{k}/papers?from=N → PastPaperReader.Get(200 {"papers","total","next"}·404·503, spec reception-memo-papers AC-3404.1).
///   틀린 열쇠·시작 위치는 상세 길과 같이 비트를 읽지 않고 404.
/// - POST /api/xray {k, on} → 쓰기 검사(아니면 403) → 몸 모양(아니면 400) → 그날 열쇠·오늘 진료보류 줄(아니면 404) → XrayMarks.Set → 204(AC-1405.5).
/// - POST /api/arrange {k, op, col?, v?, t?}(어레인지 표시를 넘겼을 때만) → 쓰기 검사·몸 모양·그날 네 칸 줄 → ArrangeWrite → 204(spec reception-arrange AC-3306.1).
///   이때 GET /api/board 답에는 arrange 칸과 맨 위 picks(지금 고르기 목록, spec reception-pick-lists AC-3501.4)가 더 있다(AC-3305.1).
/// - POST /api/lists(고르기 목록 저장소를 넘겼을 때만) → 쓰기 검사(403) → 목록 모양(400) → ReceptionLists.Save → 204(spec reception-pick-lists AC-3501.3).
/// - 쓰기 길은 쓰기 검사 전에 몸 크기를 본다: /api/xray 256·/api/arrange 1024·/api/lists 4096바이트를 넘으면 413(AC-3502.4).
/// - GET /link(주소 보내기 화면, LinkPage)는 이 PC 자신(루프백)만. 다른 곳에는 없는 길이다(404, AC-1406.8). /qr 길은 없다(QR 없음).
/// - 그 밖은 화면 파일(StaticFiles, 질의 글 없이 GET만). 어디에도 없으면 404, 있는 길에 다른 방법이면 405(Allow).
/// 비트를 볼 수 없으면 503 {"state":"unavailable"}(환자 자료 없음). 기록에는 오류 번호만 남긴다(AC-1406.7).
/// </summary>
public sealed class ReceptionRouter
{
    private const string BoardPath = "/api/board";
    private const string FreshQuery = "fresh=1";
    private const string XrayPath = "/api/xray";
    private const string ArrangePath = "/api/arrange";
    private const string ListsPath = "/api/lists";

    /// <summary>길마다 몸 한도(AC-3502.4). 가장 긴 어레인지 쓰기(SONO 6줄 + 같이 12개, 한글 3바이트)가 약 650바이트다.</summary>
    private const int XrayMaxBody = 256;
    private const int ArrangeMaxBody = 1024;
    private const int ListsMaxBody = HttpRequestReader.MaxBody;
    private const string LinkPath = "/link";
    private const string VisitPrefix = "/api/visit/";
    private const string HistorySuffix = "/history";
    private const string PrevSuffix = "/prev";
    private const string PapersSuffix = "/papers";
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
    private readonly Func<HttpResponse>? linkPage;
    private readonly ArrangeMarks? arrangeMarks;
    private readonly IReadOnlyList<ArrangeRule> arrangeMap;
    private readonly ReceptionLists? lists;

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
    /// <param name="linkPage">이 PC 자신의 GET /link 답(LinkPage.For). 없으면 /link는 404.</param>
    /// <param name="arrangeMarks">어레인지 표시(spec reception-arrange). 없으면 /api/arrange는 404이고 판에 arrange 칸이 없다.</param>
    /// <param name="arrangeMap">처방 → 어레인지 칸 지도. 없으면 ArrangeMap.Rules.</param>
    /// <param name="lists">SONO·C-ARM 고르기 목록 저장소(spec reception-pick-lists). 없으면 /api/lists는 404이고 목록은 기본값이다.</param>
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
        Func<HttpResponse>? linkPage = null,
        ArrangeMarks? arrangeMarks = null,
        IReadOnlyList<ArrangeRule>? arrangeMap = null,
        ReceptionLists? lists = null)
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
        this.linkPage = linkPage;
        this.arrangeMarks = arrangeMarks;
        this.arrangeMap = arrangeMap ?? ArrangeMap.Rules;
        this.lists = lists;
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
        if (r.Path == ArrangePath && arrangeMarks != null)
        {
            if (r.Method != Post) return HttpResponse.NotAllowed(Post);
            return r.Query == null ? Arrange(r, arrangeMarks) : NotFound();
        }
        if (r.Path == ListsPath && lists != null)
        {
            if (r.Method != Post) return HttpResponse.NotAllowed(Post);
            return r.Query == null ? Lists(r, lists) : NotFound();
        }
        if (r.Path == LinkPath)
        {
            // 이 PC 자신이 아니면 /link는 없는 길이다(AC-1406.8)
            if (!IsLoopback(client) || linkPage == null) return NotFound();
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return r.Query == null ? linkPage() : NotFound();
        }
        if (TryVisitKey(r.Path, HistorySuffix, out var key))
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return History(key, r.Query);
        }
        if (TryVisitKey(r.Path, PrevSuffix, out var prevKey))
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return r.Query == null ? Prev(prevKey) : NotFound();
        }
        if (TryVisitKey(r.Path, PapersSuffix, out var papersKey))
        {
            if (r.Method != Get) return HttpResponse.NotAllowed(Get);
            return Papers(papersKey, r.Query);
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
        var xray = marks.Today();
        var built = BoardBuilder.Build(result.Input!, statuses, hiddenRsu, xray, keys, clock());
        if (arrangeMarks == null) return HttpResponse.Json(built.ToJson());
        var arrange = ArrangeBuilder.Build(result.Input!, statuses, hiddenRsu, arrangeMap, arrangeMarks.Today(), xray, keys);
        return HttpResponse.Json(built.ToJson(arrange, lists?.Current()));
    }

    /// <summary>
    /// POST /api/arrange(spec reception-arrange AC-3306.1): 몸 크기(413, AC-3502.4) → 쓰기 검사(403) → 몸 모양(400) → 그날 열쇠·오늘 판의 네 칸 줄(404) →
    /// 지금 판으로 그 줄의 칸 상태(치료 종료한 줄도 칸을 본다) → ArrangeWrite → X-RAY 완료는 XrayMarks, 나머지는 ArrangeMarks → 204.
    /// 비트를 볼 수 없거나 표시를 쓰지 못하면 503. 기록에는 오류 번호만 간다(AC-3306.6).
    /// </summary>
    private HttpResponse Arrange(HttpRequest r, ArrangeMarks store)
    {
        if (r.Body.Length > ArrangeMaxBody) return HttpResponse.Empty(413);
        if (!ClientGuard.WriteOk(r))
        {
            log?.Note(ReceptionErrors.BadWrite);
            return HttpResponse.Empty(403);
        }
        if (!ArrangeWrite.TryParse(r.Body, out var op)) return HttpResponse.Empty(400);

        var now = clock();
        var found = keys.Find(DayOf(now), op.Key);
        if (found == null) return NotFound();
        var current = board.Get();
        if (!current.IsOk) return Unavailable(current.Error);
        var input = current.Input!;
        if (!string.Equals(input.Day, found.Day, StringComparison.Ordinal)) return NotFound();
        var visit = input.Visits.FirstOrDefault(row => string.Equals(row.VisitId, found.VisitId, StringComparison.Ordinal));
        var lane = visit == null ? Lane.Hidden : ReceptionMap.LaneOf(statuses, hiddenRsu, visit.Status, visit.Rsu);
        if (visit == null || lane == Lane.Hidden) return NotFound();
        var paid = lane == Lane.Done;

        var single = new BoardInput(input.Day, input.ReadAt, new[] { visit }, input.RxNames);
        var xray = marks.Today();
        var picks = lists?.Current();
        var hhmm = now.ToString("HH:mm", CultureInfo.InvariantCulture);
        ArrangeWriteResult? result = null;
        try
        {
            // 같은 줄에 쓰기가 한꺼번에 와도 잃지 않게, 잠금 안에서 받은 지금 표시로 칸을 만들고 바꾼다(design.md 6절).
            // 바꿀 것이 없거나(X-RAY 완료만) 받지 않는 쓰기(400·404)는 지금 표시를 그대로 돌려준다
            store.Update(visit.VisitId, mark =>
            {
                // 표에서 빠진 줄(치료 종료·수납완료로 저절로)도 칸을 알아야 해서(다시 넣기·되돌리기·늦게 온 쓰기),
                // 종료 시각을 빼고 다시 넣은(kept) 표시로 그 줄을 만든다(AC-3306.7)
                var open = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
                {
                    [visit.VisitId] = (mark ?? new VisitMark()).WithEnded(null).WithKept(true),
                };
                var row = ArrangeBuilder.Build(single, statuses, hiddenRsu, arrangeMap, open, xray, keys).Rows.FirstOrDefault();
                result = ArrangeWrite.Apply(op, mark, row?.Cells ?? new Dictionary<ArrangeCol, ArrangeCell>(), hhmm, paid, picks);
                return result.Status == 204 && result.ChangesMarks ? result.Next : mark;
            });
            if (result == null || result.Status != 204) return HttpResponse.Empty(result?.Status ?? 500);
            if (result.Xray.HasValue) marks.Set(visit.VisitId, result.Xray.Value);
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        return HttpResponse.Empty(204);
    }

    /// <summary>
    /// POST /api/lists(spec reception-pick-lists AC-3501.3): 몸 크기(413) → 쓰기 검사(403) → 목록 모양(PickLists.TryParse, 400) → ReceptionLists.Save → 204.
    /// 저장하지 못하면 503. 기록에는 오류 번호만 간다.
    /// </summary>
    private HttpResponse Lists(HttpRequest r, ReceptionLists store)
    {
        if (r.Body.Length > ListsMaxBody) return HttpResponse.Empty(413);
        if (!ClientGuard.WriteOk(r))
        {
            log?.Note(ReceptionErrors.BadWrite);
            return HttpResponse.Empty(403);
        }
        if (!PickLists.TryParse(r.Body, out var picks)) return HttpResponse.Empty(400);
        try
        {
            store.Save(picks);
        }
        catch (HelperException e)
        {
            return Unavailable(e.Code);
        }
        return HttpResponse.Empty(204);
    }

    private HttpResponse History(string key, string? query)
    {
        var result = HistoryReader.Get(services, keys, () => board.Get(), key, FromOf(query), clock);
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

    /// <summary>GET /api/visit/{k}/papers?from=N(AC-3404.1): 지난 진료기록부 한 쪽 JSON(200), 틀린 열쇠·시작 위치 404, 볼 수 없으면 503.</summary>
    private HttpResponse Papers(string key, string? query)
    {
        var result = PastPaperReader.Get(services, keys, () => board.Get(), key, FromOf(query), clock);
        switch (result.State)
        {
            case HistoryState.Ok:
                return HttpResponse.Json(result.Papers!.ToJson());
            case HistoryState.NotFound:
                return NotFound();
            default:
                return Unavailable(result.Error);
        }
    }

    /// <summary>질의 글 "from=N"의 N(뒤에 다른 글이 붙으면 그대로 넘겨 TryFrom이 거른다). from 칸이 아니면 null.</summary>
    private static string? FromOf(string? query) =>
        query != null && query.StartsWith(FromPrefix, StringComparison.Ordinal) ? query.Substring(FromPrefix.Length) : null;

    /// <summary>GET /api/visit/{k}/prev(AC-3307.1·3307.3): 직전 기록부 JSON(200), 틀린 열쇠 404, 볼 수 없으면 503.</summary>
    private HttpResponse Prev(string key)
    {
        var result = PrevPaperReader.Get(services, keys, () => board.Get(), key, clock);
        switch (result.State)
        {
            case HistoryState.Ok:
                return HttpResponse.Json(PrevPaper.ToJson(result.Prev));
            case HistoryState.NotFound:
                return NotFound();
            default:
                return Unavailable(result.Error);
        }
    }

    private HttpResponse Xray(HttpRequest r)
    {
        if (r.Body.Length > XrayMaxBody) return HttpResponse.Empty(413);
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

    /// <summary>/api/visit/{k}{suffix}(/history·/prev·/papers) 모양이면 그 사이 글(빈 글 포함, '/' 없음)</summary>
    private static bool TryVisitKey(string path, string suffix, out string key)
    {
        key = "";
        if (path.Length < VisitPrefix.Length + suffix.Length) return false;
        if (!path.StartsWith(VisitPrefix, StringComparison.Ordinal) || !path.EndsWith(suffix, StringComparison.Ordinal)) return false;
        var middle = path.Substring(VisitPrefix.Length, path.Length - VisitPrefix.Length - suffix.Length);
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
