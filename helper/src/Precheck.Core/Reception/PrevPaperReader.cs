using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Reception;

/// <summary>
/// 직전 진료기록부 자료(spec reception-arrange design.md 9절, AC-3307.1). 그 접수의 가장 최근 지난 완료 내원 하나의 종이 칸이다.
/// 칸 모양은 reception-paper의 paper와 같고 사람 칸(주민번호·주소·전화·특이사항)은 없다. 요청마다 만들고 서버에 쌓지 않는다.
/// </summary>
public sealed class PrevPaper
{
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        // 한국어는 그대로 두고, HTML에서 뜻이 있는 글자(<>&'")와 제어 글자는 \u 로 쓴다(상세 답과 같은 설정)
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
    };

    public PrevPaper(
        string date, string ago, string room, string ins, string sym,
        IReadOnlyList<PaperDiagnosis> dx, IReadOnlyList<PaperOrder> rx, IReadOnlyList<PaperOrder> outside)
    {
        Date = date ?? "";
        Ago = ago ?? "";
        Room = room ?? "";
        Ins = ins ?? "";
        Sym = sym ?? "";
        Dx = dx ?? throw new ArgumentNullException(nameof(dx));
        Rx = rx ?? throw new ArgumentNullException(nameof(rx));
        Out = outside ?? throw new ArgumentNullException(nameof(outside));
    }

    /// <summary>내원 날 "yyyy-MM-dd". 날을 읽지 못했으면 "".</summary>
    public string Date { get; }

    /// <summary>"N일 전"(HistoryBuilder의 규칙, 같은 날이면 "오늘"). 모르면 "".</summary>
    public string Ago { get; }

    /// <summary>진료실(DepKorNam).</summary>
    public string Room { get; }

    /// <summary>보험(InsCodNam).</summary>
    public string Ins { get; }

    /// <summary>그 내원의 증상(S 줄을 "\n"으로 이어 정리한 글).</summary>
    public string Sym { get; }

    /// <summary>상병(OicSeq 순).</summary>
    public IReadOnlyList<PaperDiagnosis> Dx { get; }

    /// <summary>처방(OdrSeq 순, 원외처방 아닌 줄).</summary>
    public IReadOnlyList<PaperOrder> Rx { get; }

    /// <summary>원외처방(OdrSeq 순, OdrOutCod 'XX').</summary>
    public IReadOnlyList<PaperOrder> Out { get; }

    /// <summary>
    /// 태블릿에 보내는 JSON: <c>{"prev": {date, ago, room, ins, sym, dx:[{code, name, main}], rx:[{code, name, qty, tms, day}], out:[…]}}</c>,
    /// 지난 내원이 없으면 <c>{"prev": null}</c>.
    /// </summary>
    public static string ToJson(PrevPaper? prev)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
        {
            writer.WriteStartObject();
            if (prev == null)
            {
                writer.WriteNull("prev");
            }
            else
            {
                writer.WriteStartObject("prev");
                writer.WriteString("date", prev.Date);
                writer.WriteString("ago", prev.Ago);
                writer.WriteString("room", prev.Room);
                writer.WriteString("ins", prev.Ins);
                writer.WriteString("sym", prev.Sym);
                PaperRecord.WriteDx(writer, prev.Dx);
                PaperRecord.WriteOrders(writer, "rx", prev.Rx);
                PaperRecord.WriteOrders(writer, "out", prev.Out);
                writer.WriteEndObject();
            }
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}

/// <summary>직전 기록부 답. State는 상세 답과 같은 셋(200·404·503). Error는 볼 수 없게 된 까닭의 오류 번호만(기록용).</summary>
public sealed class PrevResult
{
    private PrevResult(HistoryState state, PrevPaper? prev, string? error)
    {
        State = state;
        Prev = prev;
        Error = error;
    }

    public static PrevResult Ok(PrevPaper? prev) => new PrevResult(HistoryState.Ok, prev, null);

    public static PrevResult NotFound() => new PrevResult(HistoryState.NotFound, null, null);

    public static PrevResult Unavailable(string? error) => new PrevResult(HistoryState.Unavailable, null, error);

    public HistoryState State { get; }

    /// <summary>State가 Ok일 때 직전 종이(지난 내원이 없으면 null). JSON은 PrevPaper.ToJson(Prev).</summary>
    public PrevPaper? Prev { get; }

    public string? Error { get; }
}

/// <summary>
/// 직전 진료기록부 읽기(spec reception-arrange design.md 9절, REQ-3307). 기록부 화면을 열 때만 그 환자 한 명의 지난 내원 하나를 읽는다.
/// 열쇠가 그날 열쇠표에 없거나 그날 판에 그 내원이 없으면 비트를 읽지 않고 404다(AC-3307.3). 지난 내원이 없으면 비트를 열지 않고 prev null이다.
/// 읽기는 등록 확인(HospitalGate)을 지난 세션에서 ReceptionSql의 PrevPaperVisit → PrevPaperSymptoms → PrevPaperDx → PrevPaperOrders만
/// ReadOnlyGuard를 지나 차례로 돌린다(시간 제한 8초, 문장마다 남은 시간). 하나라도 실패하면 일부만 주지 않는다.
/// 글 정리·처방 나누기·"N일 전"은 reception-paper·상세와 같은 도우미(PaperReader·HistoryBuilder)를 쓴다(AC-3307.4).
/// </summary>
public static class PrevPaperReader
{
    private const string DateFormat = "yyyy-MM-dd";

    /// <summary>
    /// `GET /api/visit/{key}/prev` 한 번(서버가 부르는 곳). 던지지 않는다.
    /// 열쇠가 그날 열쇠표에 없거나, 그날 접수 현황(board, 보통 BoardCache.Get)에 그 내원이 없으면 NotFound.
    /// 접수 현황을 볼 수 없거나 등록 확인·읽기가 실패하면 Unavailable(번호만). clock은 이 PC의 시계(오늘과 시간 제한).
    /// </summary>
    public static PrevResult Get(BitServices services, VisitKeys keys, Func<BoardResult> board, string? key, Func<DateTime>? clock = null)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (keys == null) throw new ArgumentNullException(nameof(keys));
        if (board == null) throw new ArgumentNullException(nameof(board));
        var now = clock ?? (() => DateTime.Now);

        try
        {
            var today = now();
            var found = keys.Find(today.ToString("yyyyMMdd", CultureInfo.InvariantCulture), key);
            if (found == null) return PrevResult.NotFound();

            var current = board();
            if (current == null || !current.IsOk) return PrevResult.Unavailable(current?.Error ?? BitErrors.ReadFailed);
            var input = current.Input!;
            if (!string.Equals(input.Day, found.Day, StringComparison.Ordinal)) return PrevResult.NotFound();
            var visit = input.Visits.FirstOrDefault(row => string.Equals(row.VisitId, found.VisitId, StringComparison.Ordinal));
            if (visit == null) return PrevResult.NotFound();

            // 지난 내원이 없으면(첫 방문) 비트를 열지도 않는다
            if (string.IsNullOrWhiteSpace(visit.LastVisitId)) return PrevResult.Ok(null);

            using var hospital = HospitalGate.Open(services);
            var deadline = now() + HistoryReader.Timeout;
            return PrevResult.Ok(Read(hospital.Db, hospital.Registration.Scope, visit, input, today, now, deadline));
        }
        catch (Exception e)
        {
            return PrevResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }
    }

    /// <summary>
    /// 그날 접수(visit)의 가장 최근 지난 완료 내원(visit.LastVisitId) 하나의 종이 자료를 읽는다(AC-3307.1). 등록 확인을 마친 세션(db)·등록 범위(hospitalScope)로 부른다.
    /// @chart는 접수 현황 줄의 차트번호에서 끝 공백만 뺀 값(앞 공백은 char(14) 칸의 글자라 그대로), @visit은 LastVisitId, @hospital은 등록 범위.
    /// 지난 내원이 없거나 차트번호가 비면 아무 문장도 돌리지 않고 null, 그 내원 줄(병원 범위·완료 내원)이 없으면 나머지를 읽지 않고 null이다.
    /// 처방 이름이 빈 줄은 그날 이름표(board.RxNames)로 채운다. "N일 전"은 today의 날로 센다.
    /// </summary>
    public static PrevPaper? Read(
        IBitDb db, string hospitalScope, VisitRow visit, BoardInput board, DateTime today, Func<DateTime> clock, DateTime deadline)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (visit == null) throw new ArgumentNullException(nameof(visit));
        if (board == null) throw new ArgumentNullException(nameof(board));
        if (clock == null) throw new ArgumentNullException(nameof(clock));

        var last = visit.LastVisitId;
        var chart = visit.PatientId.TrimEnd(' ');
        if (string.IsNullOrWhiteSpace(last) || chart.Trim().Length == 0) return null;

        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@chart"] = chart,
            ["@visit"] = last,
            ["@hospital"] = hospitalScope,
        };
        // 내원 줄은 첫 줄만(겹친 DepMst 줄 때문에 여럿일 수 있다)
        var at = PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PrevPaperVisit, args, clock, deadline), 3).FirstOrDefault();
        if (at == null) return null;
        var symptoms = PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PrevPaperSymptoms, args, clock, deadline), 1);
        var diagnoses = PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PrevPaperDx, args, clock, deadline), 3);
        var orders = PaperReader.Cells(HistoryReader.Query(db, ReceptionSql.PrevPaperOrders, args, clock, deadline), 6);

        var day = HistoryBuilder.DayOf(HistoryReader.Text(at[0]));
        var (rx, outside) = PaperReader.Orders(orders, board.RxNames);
        return new PrevPaper(
            day?.ToString(DateFormat, CultureInfo.InvariantCulture) ?? "",
            HistoryBuilder.AgoText(day, today.Date),
            PaperReader.Trimmed(at[1]),
            PaperReader.Trimmed(at[2]),
            PaperReader.Symptom(symptoms.Select(row => row[0])),
            PaperReader.Diagnoses(diagnoses),
            rx,
            outside);
    }
}
