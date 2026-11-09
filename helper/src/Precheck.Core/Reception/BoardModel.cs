using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;

namespace Precheck.Core.Reception;

/// <summary>진료보류 줄의 엑스레이 칸(AC-1402.8): X-ray 완료 표시가 있으면 누른 시각 "HH:MM", 없으면 null.</summary>
public sealed class BoardXray
{
    public BoardXray(string? at)
    {
        At = at;
    }

    public string? At { get; }
}

/// <summary>
/// 휴대폰에 가는 줄 하나(design.md 4절 Row). 글은 모두 서버가 만든 그대로 그린다.
/// 내원번호·비트 상태 코드·OcmRsuYon·생년월일 원값은 없다(AC-1402.9). 열쇠(Key)만 그 내원을 가리킨다.
/// </summary>
public sealed class BoardRow
{
    public BoardRow(
        string key,
        Lane lane,
        int? pos,
        string chart,
        string name,
        string info,
        string time,
        string waited,
        bool isLong,
        string memo,
        string rxLabel,
        string rx,
        BoardXray? xray)
    {
        if (lane == Lane.Hidden) throw new ArgumentException("숨긴 줄은 화면 줄이 아니다", nameof(lane));
        Key = key ?? throw new ArgumentNullException(nameof(key));
        Lane = lane;
        Pos = pos;
        Chart = chart ?? "";
        Name = name ?? "";
        Info = info ?? "";
        Time = time ?? "";
        Waited = waited ?? "";
        IsLong = isLong;
        Memo = memo ?? "";
        RxLabel = rxLabel ?? "";
        Rx = rx ?? "";
        Xray = xray;
    }

    /// <summary>화면용 열쇠(VisitKeys, 그날 무작위 16자리 16진수).</summary>
    public string Key { get; }

    public Lane Lane { get; }

    /// <summary>진료 순서 번호(1부터). 진료 순서 목록의 줄에만 있고 다른 칸 줄은 null.</summary>
    public int? Pos { get; }

    /// <summary>상태 이름: 진료대기·진료보류·수납대기·끝남.</summary>
    public string LaneLabel => LabelOf(Lane);

    /// <summary>차트번호.</summary>
    public string Chart { get; }

    /// <summary>이름. 아직 못 읽으면 ""(AC-1402.7).</summary>
    public string Name { get; }

    /// <summary>"54세 · 여 · 재진" 모양(AC-1402.5).</summary>
    public string Info { get; }

    /// <summary>"10:42 접수". 접수 시각을 읽지 못하면 "".</summary>
    public string Time { get; }

    /// <summary>"18분째 대기"·"보류 22분째"·"수납 6분째"·"09:40 수납"·"수납완료"(AC-1402.3).</summary>
    public string Waited { get; }

    /// <summary>오래 기다림(주황): 진료대기·진료보류가 60분 이상(AC-1402.4).</summary>
    public bool IsLong { get; }

    /// <summary>접수 메모. 아직 못 읽으면 ""(AC-1402.7).</summary>
    public string Memo { get; }

    /// <summary>"오늘"·"지난번"·"처방"(AC-1402.6).</summary>
    public string RxLabel { get; }

    /// <summary>"오늘"이면 오늘 처방("체외충격파(ESWT7) · 도수치료 20분(DS20)"), "지난번"이면 지난 내원의 증상 글(없으면 "적힌 증상이 없어요"), "처방"이면 첫 방문 글(AC-1402.6).</summary>
    public string Rx { get; }

    /// <summary>엑스레이 칸. 진료보류 줄에만 있고 다른 칸 줄은 null(AC-1402.8).</summary>
    public BoardXray? Xray { get; }

    /// <summary>같은 줄에 진료 순서 번호만 붙인 것.</summary>
    public BoardRow WithPos(int pos) =>
        new BoardRow(Key, Lane, pos, Chart, Name, Info, Time, Waited, IsLong, Memo, RxLabel, Rx, Xray);

    /// <summary>JSON의 lane 글: wait·hold·pay·done.</summary>
    public static string WireOf(Lane lane) => lane switch
    {
        Lane.Wait => "wait",
        Lane.Hold => "hold",
        Lane.Pay => "pay",
        Lane.Done => "done",
        _ => throw new ArgumentOutOfRangeException(nameof(lane)),
    };

    /// <summary>상태 이름: 진료대기·진료보류·수납대기·끝남.</summary>
    public static string LabelOf(Lane lane) => lane switch
    {
        Lane.Wait => "진료대기",
        Lane.Hold => "진료보류",
        Lane.Pay => "수납대기",
        Lane.Done => "수납완료",
        _ => throw new ArgumentOutOfRangeException(nameof(lane)),
    };
}

/// <summary>
/// 휴대폰이 받는 접수 현황 한 판(design.md 4절, `GET /api/board` 200). 요청마다 BoardBuilder가 캐시의 날 줄로 만든다.
/// 진료 순서(Queue) = 진료대기 + 진료보류(접수 빠른 순, 순서 번호), 진료대기·진료보류·수납대기는 접수 빠른 순, 끝남은 접수 늦은 순.
/// 숨긴 줄(표에 없는 코드·숨김 코드·숨기는 OcmRsuYon)은 어느 목록에도 없고 건수(HiddenCount)만 있다 — 이 건수는 휴대폰에 가지 않는다.
/// </summary>
public sealed class Board
{
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        // 한국어는 그대로 두고, HTML에서 뜻이 있는 글자(<>&'")와 제어 글자는 \u 로 쓴다
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
    };

    public Board(
        string at,
        IReadOnlyList<BoardRow> queue,
        IReadOnlyList<BoardRow> wait,
        IReadOnlyList<BoardRow> hold,
        IReadOnlyList<BoardRow> pay,
        IReadOnlyList<BoardRow> done,
        int hiddenCount)
    {
        At = at ?? throw new ArgumentNullException(nameof(at));
        Queue = queue ?? throw new ArgumentNullException(nameof(queue));
        Wait = wait ?? throw new ArgumentNullException(nameof(wait));
        Hold = hold ?? throw new ArgumentNullException(nameof(hold));
        Pay = pay ?? throw new ArgumentNullException(nameof(pay));
        Done = done ?? throw new ArgumentNullException(nameof(done));
        if (hiddenCount < 0) throw new ArgumentOutOfRangeException(nameof(hiddenCount));
        HiddenCount = hiddenCount;
    }

    /// <summary>PC가 비트를 읽은 시각 "HH:MM:SS"(화면의 "기준" 시각).</summary>
    public string At { get; }

    /// <summary>진료 순서: 진료대기 + 진료보류, 접수 빠른 순, 순서 번호 1부터.</summary>
    public IReadOnlyList<BoardRow> Queue { get; }

    public IReadOnlyList<BoardRow> Wait { get; }

    public IReadOnlyList<BoardRow> Hold { get; }

    public IReadOnlyList<BoardRow> Pay { get; }

    /// <summary>수납완료: 접수 늦은 순(최근 순).</summary>
    public IReadOnlyList<BoardRow> Done { get; }

    /// <summary>어느 칸에도 넣지 않은 줄 수(AC-1402.1). 서버 기록용이고 JSON에는 없다.</summary>
    public int HiddenCount { get; }

    /// <summary>
    /// 휴대폰에 보내는 JSON(design.md 4절):
    /// <c>{ "state":"ok", "at", "every", "counts":{queue,wait,hold,pay,done}, "lists":{queue,wait,hold,pay,done} }</c>.
    /// every는 화면이 저절로 다시 읽는 간격(초, ReceptionTiming.PollSeconds, AC-1403.9).
    /// 줄 칸 차례: k, lane, pos, laneLabel, chart, name, info, time, waited, long, memo, rxLabel, rx, xray.
    /// </summary>
    public string ToJson() => ToJson(null);

    /// <summary>
    /// ToJson()에 어레인지 자료를 끝에 더한 것(spec reception-arrange AC-3305.1): <c>"arrange": { "rows": [...], "ended": [...] }</c>.
    /// arrange가 null이면 ToJson()과 한 글자도 같다.
    /// </summary>
    public string ToJson(Arrange? arrange)
    {
        var lists = new (string Name, IReadOnlyList<BoardRow> Rows)[]
        {
            ("queue", Queue), ("wait", Wait), ("hold", Hold), ("pay", Pay), ("done", Done),
        };
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("state", "ok");
            writer.WriteString("at", At);
            writer.WriteNumber("every", ReceptionTiming.PollSeconds);
            writer.WriteStartObject("counts");
            foreach (var list in lists) writer.WriteNumber(list.Name, list.Rows.Count);
            writer.WriteEndObject();
            writer.WriteStartObject("lists");
            foreach (var list in lists)
            {
                writer.WriteStartArray(list.Name);
                foreach (var row in list.Rows) WriteRow(writer, row);
                writer.WriteEndArray();
            }
            writer.WriteEndObject();
            if (arrange != null) WriteArrange(writer, arrange);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// arrange 칸(design.md 7절): 줄 { k, away, ptf{st,at}|null, last, cells{xray…trac: {st,det,part,at,ord,manual}|null}, allDone },
    /// 종료 줄 { k, endedAt("HH:MM", 수납완료로 빠졌고 시각을 모르면 null), paid }(AC-3305.9·AC-3305.10).
    /// </summary>
    private static void WriteArrange(Utf8JsonWriter writer, Arrange arrange)
    {
        writer.WriteStartObject("arrange");
        writer.WriteStartArray("rows");
        foreach (var row in arrange.Rows)
        {
            writer.WriteStartObject();
            writer.WriteString("k", row.Key);
            WriteTextOrNull(writer, "away", row.Away);
            if (row.Ptf == null)
            {
                writer.WriteNull("ptf");
            }
            else
            {
                writer.WriteStartObject("ptf");
                writer.WriteString("st", row.Ptf.St);
                writer.WriteString("at", row.Ptf.At);
                writer.WriteEndObject();
            }
            writer.WriteString("last", row.Last);
            writer.WriteStartObject("cells");
            foreach (ArrangeCol col in Enum.GetValues(typeof(ArrangeCol)))
            {
                if (!row.Cells.TryGetValue(col, out var cell))
                {
                    writer.WriteNull(ArrangeMap.KeyOf(col));
                    continue;
                }
                writer.WriteStartObject(ArrangeMap.KeyOf(col));
                writer.WriteString("st", StepWire(cell.St));
                writer.WriteString("det", cell.Det);
                WriteTextOrNull(writer, "part", cell.Part);
                WriteTextOrNull(writer, "at", cell.At);
                if (cell.Ord is int ord) writer.WriteNumber("ord", ord);
                else writer.WriteNull("ord");
                writer.WriteBoolean("manual", cell.Manual);
                writer.WriteEndObject();
            }
            writer.WriteEndObject();
            writer.WriteBoolean("allDone", row.AllDone);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("ended");
        foreach (var ended in arrange.Ended)
        {
            writer.WriteStartObject();
            writer.WriteString("k", ended.Key);
            if (ended.EndedAt == null) writer.WriteNull("endedAt");
            else writer.WriteString("endedAt", ended.EndedAt);
            writer.WriteBoolean("paid", ended.Paid);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
    }

    /// <summary>화면에 가는 단계 글: todo·ready·done(gone 칸은 만들지 않는다).</summary>
    private static string StepWire(ArrangeStep step) => step switch
    {
        ArrangeStep.Todo => "todo",
        ArrangeStep.Ready => "ready",
        ArrangeStep.Done => "done",
        _ => throw new ArgumentOutOfRangeException(nameof(step)),
    };

    private static void WriteTextOrNull(Utf8JsonWriter writer, string name, string? text)
    {
        if (text == null) writer.WriteNull(name);
        else writer.WriteString(name, text);
    }

    private static void WriteRow(Utf8JsonWriter writer, BoardRow row)
    {
        writer.WriteStartObject();
        writer.WriteString("k", row.Key);
        writer.WriteString("lane", BoardRow.WireOf(row.Lane));
        if (row.Pos is int pos) writer.WriteNumber("pos", pos);
        else writer.WriteNull("pos");
        writer.WriteString("laneLabel", row.LaneLabel);
        writer.WriteString("chart", row.Chart);
        writer.WriteString("name", row.Name);
        writer.WriteString("info", row.Info);
        writer.WriteString("time", row.Time);
        writer.WriteString("waited", row.Waited);
        writer.WriteBoolean("long", row.IsLong);
        writer.WriteString("memo", row.Memo);
        writer.WriteString("rxLabel", row.RxLabel);
        writer.WriteString("rx", row.Rx);
        if (row.Xray == null)
        {
            writer.WriteNull("xray");
        }
        else
        {
            writer.WriteStartObject("xray");
            if (row.Xray.At == null) writer.WriteNull("at");
            else writer.WriteString("at", row.Xray.At);
            writer.WriteEndObject();
        }
        writer.WriteEndObject();
    }
}
