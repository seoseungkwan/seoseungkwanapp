using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>상병 한 줄: 주상병인지, 코드, 이름.</summary>
internal sealed class ChartDiagnosis
{
    public ChartDiagnosis(bool primary, string code, string name)
    {
        Primary = primary;
        Code = code;
        Name = name;
    }

    public bool Primary { get; }

    public string Code { get; }

    public string Name { get; }
}

/// <summary>처방 한 줄(찍을 글 그대로): 코드, 명칭, 용량, 횟수, 일수, 용법. 원외처방이면 교부번호.</summary>
internal sealed class ChartOrder
{
    public ChartOrder(string code, string name, string qty, string times, string days, string usage, string slip)
    {
        Code = code;
        Name = name;
        Qty = qty;
        Times = times;
        Days = days;
        Usage = usage;
        Slip = slip;
    }

    public string Code { get; }

    public string Name { get; }

    public string Qty { get; }

    public string Times { get; }

    public string Days { get; }

    public string Usage { get; }

    public string Slip { get; }
}

/// <summary>수납 한 줄(비트 저장 값 그대로, 원).</summary>
internal sealed class ChartPayment
{
    public ChartPayment(string day8, long total, long own, long paid, long discount)
    {
        Day8 = day8;
        Total = total;
        Own = own;
        Paid = paid;
        Discount = discount;
    }

    /// <summary>수납일 OrpAccDte(yyyyMMdd).</summary>
    public string Day8 { get; }

    /// <summary>총진료비 OrpTotAmt.</summary>
    public long Total { get; }

    /// <summary>영수액 OrpTotOwn(본인부담 총액).</summary>
    public long Own { get; }

    /// <summary>수납액 OrcInf RCV.</summary>
    public long Paid { get; }

    /// <summary>할인액 OrcInf DOD·DOE·DET.</summary>
    public long Discount { get; }
}

/// <summary>내원 한 번의 진료기록부 값. 환자 값이라 파일·로그에 남기지 않는다.</summary>
internal sealed class ChartVisit
{
    public ChartVisit(VisitDay day, string acceptedAt, string department, string doctor)
    {
        Day = day;
        AcceptedAt = acceptedAt;
        Department = department;
        Doctor = doctor;
    }

    public VisitDay Day { get; }

    /// <summary>접수 시각 yyyyMMddHHmm(OcmAcpDtm).</summary>
    public string AcceptedAt { get; }

    public string Department { get; }

    public string Doctor { get; }

    public List<string> Notes { get; } = new List<string>();

    public List<ChartDiagnosis> Diagnoses { get; } = new List<ChartDiagnosis>();

    /// <summary>원내 처방(원외 XX 아닌 줄).</summary>
    public List<ChartOrder> Orders { get; } = new List<ChartOrder>();

    /// <summary>원외처방(OdrOutCod XX) 줄, 처방 차례.</summary>
    public List<ChartOrder> OutOrders { get; } = new List<ChartOrder>();

    /// <summary>수납 줄(최근 것 하나). 수납 전이면 null.</summary>
    public ChartPayment? Payment { get; set; }

    /// <summary>접수시간 HH:mm(모르면 빈 글).</summary>
    public string TimeText => AcceptedAt.Length >= 12 ? AcceptedAt.Substring(8, 2) + ":" + AcceptedAt.Substring(10, 2) : "";
}

/// <summary>
/// 진료기록부 값 읽기(spec doc-print AC-7405.1): ChartSql 문장 6개를 ReadOnlyGuard로 읽기만 하고, 고른 날의 내원 번호만 남겨 날짜·접수 차례로 묶는다.
/// 금액은 저장 값 그대로 long(원 미만 버림). 읽기 실패는 BitException 그대로 올린다.
/// </summary>
internal static class ChartRecord
{
    /// <summary>읽은 내원(고른 날 차례·그날 접수 차례)과 주민번호 앞 7자리(없으면 빈 글).</summary>
    public static (IReadOnlyList<ChartVisit> Visits, string ResHead) Read(IBitDb db, DocContext ctx)
    {
        var range = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = ctx.Chart,
            ["@from"] = Day8(ctx.Days[0].Date) + "0000",
            ["@to"] = Day8(ctx.Days[ctx.Days.Count - 1].Date.AddDays(1)) + "0000",
        };
        var chosen = new Dictionary<string, VisitDay>(StringComparer.Ordinal);
        foreach (var day in ctx.Days)
        {
            foreach (var visit in day.VisitNums) chosen[visit] = day;
        }

        var byId = new Dictionary<string, ChartVisit>(StringComparer.Ordinal);
        foreach (var row in Rows(db, ChartSql.VisitsSql, range, 4))
        {
            var id = Text(row[0]);
            if (!chosen.TryGetValue(id, out var day) || byId.ContainsKey(id)) continue;
            byId[id] = new ChartVisit(day, Text(row[1]), Text(row[2]), Text(row[3]));
        }
        // 고른 날의 내원이 하나도 없으면 더 묻지 않는다(0쪽)
        if (byId.Count == 0) return (Array.Empty<ChartVisit>(), "");

        foreach (var row in Rows(db, ChartSql.NotesSql, range, 2))
        {
            if (byId.TryGetValue(Text(row[0]), out var visit)) visit.Notes.Add(Raw(row[1]));
        }
        foreach (var row in Rows(db, ChartSql.DiagnosesSql, range, 4))
        {
            if (byId.TryGetValue(Text(row[0]), out var visit)) visit.Diagnoses.Add(new ChartDiagnosis(Text(row[1]) == "1", Text(row[2]), Text(row[3])));
        }
        foreach (var row in Rows(db, ChartSql.OrdersSql, range, 10))
        {
            if (!byId.TryGetValue(Text(row[0]), out var visit)) continue;
            var code = Text(row[2]).Length > 0 ? Text(row[2]) : Text(row[3]);
            var order = new ChartOrder(code, Text(row[4]), Number(row[5]), Number(row[6]), Number(row[7]), Text(row[8]), Text(row[9]));
            (Text(row[1]) == "XX" ? visit.OutOrders : visit.Orders).Add(order);
        }
        foreach (var row in Rows(db, ChartSql.PaymentsSql, range, 6))
        {
            if (byId.TryGetValue(Text(row[0]), out var visit) && visit.Payment == null)
            {
                visit.Payment = new ChartPayment(Text(row[1]), Won(row[2]), Won(row[3]), Won(row[4]), Won(row[5]));
            }
        }

        var patient = ReadOnlyGuard.Query(db, ChartSql.PatientSql, new Dictionary<string, object?>(StringComparer.Ordinal) { ["@cht"] = ctx.Chart }, DocSql.ReadTimeout);
        var head = patient.Count > 0 && patient[0] != null && patient[0].Count > 0 ? Text(patient[0][0]) : "";

        var visits = ctx.Days
            .SelectMany(day => day.VisitNums)
            .Distinct(StringComparer.Ordinal)
            .Where(byId.ContainsKey)
            .Select(id => byId[id])
            .ToArray();
        return (visits, head.Length == 7 && head.All(c => c >= '0' && c <= '9') ? head : "");
    }

    private static IEnumerable<IReadOnlyList<object?>> Rows(IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, int columns) =>
        ReadOnlyGuard.Query(db, sql, args, DocSql.ReadTimeout).Where(row => row != null && row.Count >= columns);

    private static string Day8(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static string Raw(object? value) => value == null || value is DBNull ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

    private static string Text(object? value) => Raw(value).Trim();

    /// <summary>용량·횟수·일수: 소수 끝 0 뺌(비트 '0.####'). 숫자가 아니면 글 그대로.</summary>
    private static string Number(object? value)
    {
        if (value == null || value is DBNull) return "";
        try
        {
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture).ToString("0.####", CultureInfo.InvariantCulture);
        }
        catch (Exception ex) when (ex is FormatException || ex is InvalidCastException || ex is OverflowException)
        {
            return Text(value);
        }
    }

    /// <summary>저장 금액 → 원(원 미만 버림). 비었거나 숫자가 아니면 0.</summary>
    private static long Won(object? value)
    {
        if (value == null || value is DBNull) return 0;
        try
        {
            return (long)decimal.Truncate(Convert.ToDecimal(value, CultureInfo.InvariantCulture));
        }
        catch (Exception ex) when (ex is FormatException || ex is InvalidCastException || ex is OverflowException)
        {
            return 0;
        }
    }
}
