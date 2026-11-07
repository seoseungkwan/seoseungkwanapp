using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;

namespace Precheck.Core.Reception;

/// <summary>종이 기록부의 상병 한 줄(AC-1501.6). 이름이 ReceptionSql.PaperDx 문장과 겹치지 않게 PaperDiagnosis다.</summary>
public sealed class PaperDiagnosis
{
    public PaperDiagnosis(string code, string name, bool main)
    {
        Code = code ?? "";
        Name = name ?? "";
        Main = main;
    }

    /// <summary>상병 코드(OicElcCod, 앞뒤 공백 뺌).</summary>
    public string Code { get; }

    /// <summary>상병 이름(OicIcdNam, 앞뒤 공백 뺌). 없으면 "".</summary>
    public string Name { get; }

    /// <summary>주상병인가(OicIcdPri가 '1').</summary>
    public bool Main { get; }
}

/// <summary>종이 기록부의 처방·원외처방 한 줄(AC-1501.7). 숫자 칸도 화면에 그대로 쓰는 글이다.</summary>
public sealed class PaperOrder
{
    public PaperOrder(string code, string name, string qty, string tms, string day)
    {
        Code = code ?? "";
        Name = name ?? "";
        Qty = qty ?? "";
        Tms = tms ?? "";
        Day = day ?? "";
    }

    /// <summary>처방 코드(OdrCod, 앞뒤 공백 뺌, 대소문자 그대로).</summary>
    public string Code { get; }

    /// <summary>처방 이름(OdrCodNam, 비면 그날 이름표의 이름, 그것도 없으면 "").</summary>
    public string Name { get; }

    /// <summary>용량(OdrQty, 비트 인쇄처럼 "0.####"). 없으면 "".</summary>
    public string Qty { get; }

    /// <summary>횟수(OdrTms). 없으면 "".</summary>
    public string Tms { get; }

    /// <summary>일수(OdrDay). 없으면 "".</summary>
    public string Day { get; }
}

/// <summary>
/// 상세 답의 종이 기록부 자료(spec reception-paper design.md 2절). 처음 쪽(from=0) 상세 읽기 한 번마다 PaperReader가 만들고 서버에 쌓지 않는다.
/// 주민번호는 앞 6자리와 별표만 있다(뒤 글자는 문장이 읽지 않는다). 모르는 값은 지어내지 않고 ""·빈 목록이다.
/// </summary>
public sealed class PaperRecord
{
    private static readonly PaperDiagnosis[] NoDx = new PaperDiagnosis[0];
    private static readonly PaperOrder[] NoOrders = new PaperOrder[0];

    /// <summary>모든 칸이 빈 기록(차트번호·접수 시각이 빈 접수, 문장을 돌리지 않았을 때).</summary>
    public static readonly PaperRecord Empty = new PaperRecord("", "", "", "", "", "", "", "", NoDx, NoOrders, NoOrders);

    public PaperRecord(
        string res, string addr, string tel, string cel, string special, string room, string ins, string sym,
        IReadOnlyList<PaperDiagnosis> dx, IReadOnlyList<PaperOrder> rx, IReadOnlyList<PaperOrder> outside)
    {
        Res = res ?? "";
        Addr = addr ?? "";
        Tel = tel ?? "";
        Cel = cel ?? "";
        Special = special ?? "";
        Room = room ?? "";
        Ins = ins ?? "";
        Sym = sym ?? "";
        Dx = dx ?? throw new ArgumentNullException(nameof(dx));
        Rx = rx ?? throw new ArgumentNullException(nameof(rx));
        Out = outside ?? throw new ArgumentNullException(nameof(outside));
    }

    /// <summary>주민등록 "NNNNNN-*******"(앞 6자리가 숫자 6자리일 때만). 아니면 "".</summary>
    public string Res { get; }

    /// <summary>주소(PbsDtlAdr + 공백 + PbsAdrSta).</summary>
    public string Addr { get; }

    /// <summary>전화(PbsPhnNum).</summary>
    public string Tel { get; }

    /// <summary>이동전화(PbsCelPhn).</summary>
    public string Cel { get; }

    /// <summary>특이사항(PbsSpcCmt RTF → 보통 글, 줄 바꿈 "\n").</summary>
    public string Special { get; }

    /// <summary>진료실(DepKorNam).</summary>
    public string Room { get; }

    /// <summary>보험(InsCodNam).</summary>
    public string Ins { get; }

    /// <summary>오늘 증상(S 줄을 "\n"으로 이어 정리한 글).</summary>
    public string Sym { get; }

    /// <summary>상병(OicSeq 순).</summary>
    public IReadOnlyList<PaperDiagnosis> Dx { get; }

    /// <summary>처방(OdrSeq 순, 원외처방 아닌 줄).</summary>
    public IReadOnlyList<PaperOrder> Rx { get; }

    /// <summary>원외처방(OdrSeq 순, OdrOutCod 'XX').</summary>
    public IReadOnlyList<PaperOrder> Out { get; }

    /// <summary>
    /// 열린 JSON 묶음 안에 <c>"paper": { res, addr, tel, cel, special, room, ins, sym, dx:[{code, name, main}], rx:[{code, name, qty, tms, day}], out:[…] }</c>를 쓴다.
    /// main만 참거짓이고 나머지는 모두 글이다(design.md 2절). 글자 바꾸기(HTML 글자 \u)는 writer의 설정을 따른다.
    /// </summary>
    public void WriteJson(Utf8JsonWriter writer)
    {
        if (writer == null) throw new ArgumentNullException(nameof(writer));
        writer.WriteStartObject("paper");
        writer.WriteString("res", Res);
        writer.WriteString("addr", Addr);
        writer.WriteString("tel", Tel);
        writer.WriteString("cel", Cel);
        writer.WriteString("special", Special);
        writer.WriteString("room", Room);
        writer.WriteString("ins", Ins);
        writer.WriteString("sym", Sym);
        writer.WriteStartArray("dx");
        foreach (var dx in Dx)
        {
            writer.WriteStartObject();
            writer.WriteString("code", dx.Code);
            writer.WriteString("name", dx.Name);
            writer.WriteBoolean("main", dx.Main);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        WriteOrders(writer, "rx", Rx);
        WriteOrders(writer, "out", Out);
        writer.WriteEndObject();
    }

    private static void WriteOrders(Utf8JsonWriter writer, string name, IReadOnlyList<PaperOrder> orders)
    {
        writer.WriteStartArray(name);
        foreach (var order in orders)
        {
            writer.WriteStartObject();
            writer.WriteString("code", order.Code);
            writer.WriteString("name", order.Name);
            writer.WriteString("qty", order.Qty);
            writer.WriteString("tms", order.Tms);
            writer.WriteString("day", order.Day);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
    }
}

/// <summary>
/// 상세의 종이 기록부 자료 읽기(spec reception-paper design.md 3절, REQ-1501). HistoryReader가 처음 쪽(from=0)에서만 같은 세션·같은 시간 제한으로 부른다.
/// ReceptionSql의 PaperPerson → PaperVisit → PaperSymptoms → PaperDx → PaperOrders를 ReadOnlyGuard를 지나 차례로 돌린다(문장마다 남은 시간).
/// 하나라도 실패하거나 시간이 다 가거나 줄의 칸이 모자라면 일부만 주지 않고 읽기 실패(BitException)로 끝난다(AC-1501.9).
/// </summary>
public static class PaperReader
{
    /// <summary>원외처방 표시(OdrOutCod, 교부번호 있음).</summary>
    private const string OutsideCode = "XX";

    /// <summary>주상병 표시(OicIcdPri).</summary>
    private const string MainDx = "1";

    /// <summary>주민번호 뒤 글자 자리(뒤는 읽지도 보이지도 않는다).</summary>
    private const string ResMask = "-*******";

    /// <summary>비트 인쇄의 용량 모양(소수 아래 0 없이, 넷째 자리까지).</summary>
    private const string NumberFormat = "0.####";

    /// <summary>
    /// 그날 접수(visit) 환자의 종이 자료를 읽는다. 등록 확인을 마친 세션(db)·등록 범위(hospitalScope)·읽기 한 번의 끝 시각(deadline)으로 부른다.
    /// @chart는 접수 현황 줄의 차트번호에서 끝 공백만 뺀 값(앞 공백은 char(14) 칸의 글자라 그대로), @before는 접수 시각 원값, @hospital은 등록 범위.
    /// 차트번호나 접수 시각이 비면 다른 환자를 읽지 않게 아무 문장도 돌리지 않고 빈 기록이다. 처방 이름이 빈 줄은 그날 이름표(board.RxNames)로 채운다.
    /// </summary>
    public static PaperRecord Read(IBitDb db, string hospitalScope, VisitRow visit, BoardInput board, Func<DateTime> clock, DateTime deadline)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (visit == null) throw new ArgumentNullException(nameof(visit));
        if (board == null) throw new ArgumentNullException(nameof(board));
        if (clock == null) throw new ArgumentNullException(nameof(clock));

        // HistoryReader와 같은 까닭으로 차트번호의 앞 공백은 지우지 않는다(c.OcmChtNum=@chart·p.PbsChtNum=@chart가 그 글자로 견준다)
        var chart = visit.PatientId.TrimEnd(' ');
        if (chart.Trim().Length == 0 || visit.AcceptedAt.Trim().Length == 0) return PaperRecord.Empty;

        var person = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@chart"] = chart };
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@chart"] = chart,
            ["@before"] = visit.AcceptedAt,
            ["@hospital"] = hospitalScope,
        };
        var people = Cells(HistoryReader.Query(db, ReceptionSql.PaperPerson, person, clock, deadline), 6);
        var visits = Cells(HistoryReader.Query(db, ReceptionSql.PaperVisit, args, clock, deadline), 3);
        var symptoms = Cells(HistoryReader.Query(db, ReceptionSql.PaperSymptoms, args, clock, deadline), 2);
        var diagnoses = Cells(HistoryReader.Query(db, ReceptionSql.PaperDx, args, clock, deadline), 3);
        var orders = Cells(HistoryReader.Query(db, ReceptionSql.PaperOrders, args, clock, deadline), 6);

        // 사람 줄·내원 줄은 첫 줄만(내원 줄은 겹친 DepMst 줄 때문에 여럿일 수 있다). 없으면 ""
        var who = people.FirstOrDefault();
        var at = visits.FirstOrDefault();
        var rx = new List<PaperOrder>();
        var outside = new List<PaperOrder>();
        foreach (var row in orders)
        {
            var order = Order(row, board.RxNames);
            if (string.Equals(Trimmed(row[5]), OutsideCode, StringComparison.Ordinal)) outside.Add(order);
            else rx.Add(order);
        }

        return new PaperRecord(
            Res(who?[0]),
            Address(who?[1], who?[2]),
            Trimmed(who?[3]),
            Trimmed(who?[4]),
            RtfText.ToPlain(HistoryReader.Text(who?[5])),
            Trimmed(at?[1]),
            Trimmed(at?[2]),
            RtfText.Tidy(string.Join("\n", symptoms.Select(row => HistoryReader.Text(row[1]) ?? ""))),
            diagnoses.Select(row => new PaperDiagnosis(Trimmed(row[0]), Trimmed(row[1]), Trimmed(row[2]) == MainDx)).ToArray(),
            rx.ToArray(),
            outside.ToArray());
    }

    /// <summary>줄을 모두 받아 두고(칸이 모자란 줄이 하나라도 있으면 읽기 실패) 비트가 준 차례 그대로 준다.</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Cells(IReadOnlyList<IReadOnlyList<object?>> rows, int cells) =>
        HistoryReader.Cells(rows, cells).ToArray();

    /// <summary>주민번호 앞 6자리(LEFT(PbsResNum,6))가 아라비아 숫자 6자리일 때만 "NNNNNN-*******". 그 밖은 "".</summary>
    private static string Res(object? cell)
    {
        var front = Trimmed(cell);
        if (front.Length != 6) return "";
        foreach (var c in front)
            if (c < '0' || c > '9') return "";
        return front + ResMask;
    }

    /// <summary>본 주소 뒤에 뒷부분(동·호)을 공백 하나 사이로. 빈 쪽은 넣지 않는다.</summary>
    private static string Address(object? main, object? rest) =>
        string.Join(" ", new[] { Trimmed(main), Trimmed(rest) }.Where(part => part.Length > 0));

    /// <summary>처방 줄(Code, Name, Qty, Tms, Day, OutCod) 하나. 이름이 비면 그날 이름표(대문자 코드)로.</summary>
    private static PaperOrder Order(IReadOnlyList<object?> row, IReadOnlyDictionary<string, string> names)
    {
        var code = Trimmed(row[0]);
        var name = Trimmed(row[1]);
        if (name.Length == 0 && names.TryGetValue(code.ToUpperInvariant(), out var known)) name = known ?? "";
        return new PaperOrder(code, name, Number(row[2]), Number(row[3]), Number(row[4]));
    }

    /// <summary>
    /// 숫자 칸 → 글("0.####", 문화권 없이): 1.000 → "1", 2.500 → "2.5", 0.250 → "0.25". 횟수·일수 같은 정수는 정수 글이 된다.
    /// decimal·double·정수·글 칸 모두 받는다. NULL·빈 글은 "", 숫자가 아니면 지어내지 않고 읽기 실패.
    /// </summary>
    private static string Number(object? cell)
    {
        if (cell == null) return "";
        decimal value;
        try
        {
            if (cell is string text)
            {
                var trimmed = text.Trim();
                if (trimmed.Length == 0) return "";
                value = decimal.Parse(trimmed, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
            }
            else
            {
                value = Convert.ToDecimal(cell, CultureInfo.InvariantCulture);
            }
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
        return value.ToString(NumberFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>글 칸: 앞뒤 공백을 빼고, NULL이면 "".</summary>
    private static string Trimmed(object? cell) => HistoryReader.Text(cell)?.Trim() ?? "";
}
