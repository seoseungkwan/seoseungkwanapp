using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>영수증 항목 한 줄(OdlInf, 항목 코드 = IncMst.IncCod). 금액은 비트 저장 값 그대로(원).</summary>
public sealed class ReceiptItem
{
    public ReceiptItem(int code, long own, long corp, long full, long nonPay, long h50, long h80, long h30, long h90, long h95)
    {
        Code = code;
        Own = own;
        Corp = corp;
        Full = full;
        NonPay = nonPay;
        H50 = h50;
        H80 = h80;
        H30 = h30;
        H90 = h90;
        H95 = h95;
    }

    public int Code { get; }

    /// <summary>급여 본인부담 OdlInsOwn.</summary>
    public long Own { get; }

    /// <summary>공단부담 OdlInsCor.</summary>
    public long Corp { get; }

    /// <summary>전액본인부담 OdlHunAmt.</summary>
    public long Full { get; }

    /// <summary>비급여 OdlNonAmt+OdlNinAct+OdlNinMat+OdlNinNat.</summary>
    public long NonPay { get; }

    /// <summary>선별급여 본인부담 50% 대상 OdlH50Amt(아래 넷도 같은 꼴: 80·30·90·95%).</summary>
    public long H50 { get; }

    public long H80 { get; }

    public long H30 { get; }

    public long H90 { get; }

    public long H95 { get; }
}

/// <summary>
/// 영수증 한 장(내원 하나)의 값: 머리(내원 날·영수증 번호·수납일·주야간·진료과·환자구분), 합계(OrpInf), 받은 돈(OrcInf·CashInf), 항목(OdlInf).
/// 금액은 비트 저장 값 그대로 long이고 다시 셈하지 않는다. 하나 예외로 선별급여 줄(Selective)만 비트 영수증 재출력 SQL 식 그대로 셈한다(저장 칸이 없다).
/// 환자 값이 들어가므로 파일·로그에 남기지 않는다.
/// </summary>
public sealed class ReceiptVisit
{
    /// <summary>비트가 선별급여 줄을 셈하는 보험 코드(OcmInsCod 31 건강보험·51 보호1종·52 보호2종). 보훈(61, PmdSpcFlg 05) 감면 식은 따르지 않는다.</summary>
    private static readonly int[] SelectiveCodes = { 31, 51, 52 };

    public ReceiptVisit(
        string visitNum, DateTime date, string receiptNum, DateTime? paidDay, string dayNight, string department, string patientClass, int insuranceCode,
        long total, long corp, long patientTotal, long insOwn, long nonPay, long disabledFund, long support,
        long cash, long card, long account, long healthAllowance, long cashReceipt, string cashApproval, IEnumerable<ReceiptItem> items)
    {
        VisitNum = visitNum ?? "";
        Date = date.Date;
        ReceiptNum = (receiptNum ?? "").Trim();
        PaidDay = paidDay?.Date;
        DayNight = (dayNight ?? "").Trim();
        Department = (department ?? "").Trim();
        PatientClass = (patientClass ?? "").Trim();
        InsuranceCode = insuranceCode;
        Total = total;
        Corp = corp;
        PatientTotal = patientTotal;
        InsOwn = insOwn;
        NonPay = nonPay;
        DisabledFund = disabledFund;
        Support = support;
        Cash = cash;
        Card = card;
        Account = account;
        HealthAllowance = healthAllowance;
        CashReceipt = cashReceipt;
        CashApproval = (cashApproval ?? "").Trim();
        Items = (items ?? Enumerable.Empty<ReceiptItem>()).Where(item => item != null).ToArray();
    }

    /// <summary>내원 번호 OcmNum(뒤 빈칸 뺌).</summary>
    public string VisitNum { get; }

    /// <summary>내원 날(진료기간 = 이 날 하루).</summary>
    public DateTime Date { get; }

    /// <summary>영수증 번호 OrpRcpNum(앞뒤 빈칸 뺌).</summary>
    public string ReceiptNum { get; }

    /// <summary>수납일 OrpAccDte, 못 읽으면 null.</summary>
    public DateTime? PaidDay { get; }

    /// <summary>주야간 OcmDgsDnh(DtlMst FTDDNH: D 주간·N 야간·T 심야·H 휴일 등).</summary>
    public string DayNight { get; }

    /// <summary>진료과목 DepKorNam.</summary>
    public string Department { get; }

    /// <summary>환자구분 InsCodNam.</summary>
    public string PatientClass { get; }

    /// <summary>보험 코드 OcmInsCod.</summary>
    public int InsuranceCode { get; }

    /// <summary>진료비 총액 OrpTotAmt.</summary>
    public long Total { get; }

    /// <summary>공단부담 OrpCorAmt.</summary>
    public long Corp { get; }

    /// <summary>환자부담(본인부담) 총액 OrpTotOwn.</summary>
    public long PatientTotal { get; }

    /// <summary>급여 본인부담 OrpInsOwn.</summary>
    public long InsOwn { get; }

    /// <summary>비급여 OrpNonAmt.</summary>
    public long NonPay { get; }

    /// <summary>장애인기금 OrpRcvBil.</summary>
    public long DisabledFund { get; }

    /// <summary>지원금 OrpSupBil.</summary>
    public long Support { get; }

    /// <summary>받은 현금 OrcInf RCV OrcNewAmt 합.</summary>
    public long Cash { get; }

    /// <summary>받은 카드 RCV OrcCrdAmt 합.</summary>
    public long Card { get; }

    /// <summary>받은 계좌 RCV OrcChkAmt 합.</summary>
    public long Account { get; }

    /// <summary>건강생활유지비 OrcInf QCV 합.</summary>
    public long HealthAllowance { get; }

    /// <summary>현금영수증 금액 CashSupAmt 합(보낸·취소 안 된 줄).</summary>
    public long CashReceipt { get; }

    /// <summary>현금영수증 승인번호 CashAuthNum.</summary>
    public string CashApproval { get; }

    /// <summary>이 영수증 번호의 항목(OdlInf), 항목 코드 차례.</summary>
    public IReadOnlyList<ReceiptItem> Items { get; }

    /// <summary>영수증번호(연월-일련번호): 수납 연월(없으면 내원 연월) + '-' + OrpRcpNum. 번호가 비면 빈 글.</summary>
    public string ReceiptNoText => ReceiptNum.Length == 0 ? "" : (PaidDay ?? Date).ToString("yyyyMM", CultureInfo.InvariantCulture) + "-" + ReceiptNum;

    /// <summary>야간(N 야간·T 심야, 끝 글자로 봄: LN·SN 등 종검 야간 포함).</summary>
    public bool Night => DayNight.EndsWith("N", StringComparison.Ordinal) || DayNight.EndsWith("T", StringComparison.Ordinal);

    /// <summary>공휴일(H 휴일·LH 등).</summary>
    public bool Holiday => DayNight.EndsWith("H", StringComparison.Ordinal);

    /// <summary>
    /// 선별급여 줄(본인부담금, 공단부담금): 비트 BITRePrint 영수증 SQL 식 그대로.
    /// 본인 = floor((50%·80%·30%·90%·95% 대상 금액 × 그 비율의 합) / 10) × 10, 공단 = floor(대상 금액 합 / 10) × 10 − 본인. 보험 코드 31·51·52만, 그 밖은 (0, 0).
    /// </summary>
    public (long Own, long Corp) Selective
    {
        get
        {
            if (Array.IndexOf(SelectiveCodes, InsuranceCode) < 0) return (0, 0);
            long h50 = 0, h80 = 0, h30 = 0, h90 = 0, h95 = 0;
            foreach (var item in Items)
            {
                h50 += item.H50;
                h80 += item.H80;
                h30 += item.H30;
                h90 += item.H90;
                h95 += item.H95;
            }
            var sum = h50 + h80 + h30 + h90 + h95;
            if (sum == 0) return (0, 0);
            // 비율 합 × 100을 정수로 셈해 /1000(= /100 /10)으로 버리면 비트 식 floor(x/10)*10과 같다
            var own = FloorDiv((50 * h50) + (80 * h80) + (30 * h30) + (90 * h90) + (95 * h95), 1000) * 10;
            var amount = FloorDiv(sum, 10) * 10;
            return (own, amount - own);
        }
    }

    /// <summary>합계 줄 전액 본인부담 ③: 항목 OdlHunAmt 합(OrpInf에 칸이 없다).</summary>
    public long FullTotal => Items.Sum(item => item.Full);

    private static long FloorDiv(long value, long by) => value >= 0 ? value / by : -((-value + by - 1) / by);
}

/// <summary>
/// 진료비 영수증 자료 읽기(spec doc-print AC-7405.1): ReceiptSql 두 문장을 @cht·@from(고른 첫 날 0시)·@to(고른 끝 날 다음 날 0시)로 한 번씩 읽고,
/// 고른 날(DocContext.Days)의 내원 번호만 남겨 날짜순(같은 날은 접수 차례)으로 낸다. 영수증 줄이 없는 내원(수납 전)은 빠진다.
/// 읽기 실패는 BitException 그대로 올린다.
/// </summary>
public static class ReceiptData
{
    private const int ReceiptColumns = 21;
    private const int ItemColumns = 12;

    public static IReadOnlyList<ReceiptVisit> Read(IBitDb db, DocContext ctx)
    {
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        if (ctx.Days.Count == 0) return Array.Empty<ReceiptVisit>();

        // 고른 내원 번호 → 그 날(날짜순 차례)
        var dayOf = new Dictionary<string, (DateTime Date, int Order)>(StringComparer.Ordinal);
        for (var i = 0; i < ctx.Days.Count; i++)
        {
            foreach (var visit in ctx.Days[i].VisitNums)
            {
                var key = (visit ?? "").TrimEnd();
                if (key.Length > 0 && !dayOf.ContainsKey(key)) dayOf[key] = (ctx.Days[i].Date, i);
            }
        }

        var first = ctx.Days[0].Date;
        var last = ctx.Days[ctx.Days.Count - 1].Date;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = ctx.Chart,
            ["@from"] = Day(first) + "0000",
            ["@to"] = Day(last.AddDays(1)) + "0000",
        };

        var receiptRows = ReadOnlyGuard.Query(db, ReceiptSql.ReceiptsSql, args, DocSql.ReadTimeout);
        var itemRows = ReadOnlyGuard.Query(db, ReceiptSql.ItemsSql, args, DocSql.ReadTimeout);

        var itemsOf = new Dictionary<string, List<(string Receipt, ReceiptItem Item)>>(StringComparer.Ordinal);
        foreach (var row in itemRows)
        {
            if (row == null || row.Count < ItemColumns) continue;
            var visit = Text(row[0]).TrimEnd();
            if (!dayOf.ContainsKey(visit)) continue;
            if (!itemsOf.TryGetValue(visit, out var list)) itemsOf[visit] = list = new List<(string, ReceiptItem)>();
            list.Add((Text(row[1]).Trim(), new ReceiptItem(Int(row[2]), Money(row[3]), Money(row[4]), Money(row[5]), Money(row[6]), Money(row[7]), Money(row[8]), Money(row[9]), Money(row[10]), Money(row[11]))));
        }

        var visits = new List<(int Order, int Index, ReceiptVisit Visit)>();
        var index = 0;
        foreach (var row in receiptRows)
        {
            index++;
            if (row == null || row.Count < ReceiptColumns) continue;
            var visit = Text(row[0]).TrimEnd();
            if (!dayOf.TryGetValue(visit, out var day)) continue;
            var receiptNum = Text(row[2]).Trim();
            var items = ItemsFor(itemsOf.TryGetValue(visit, out var found) ? found : null, receiptNum);
            visits.Add((day.Order, index, new ReceiptVisit(
                visit, day.Date, receiptNum, ParseDay(row[3]), Text(row[4]), Text(row[5]), Text(row[6]), Int(row[7]),
                Money(row[8]), Money(row[9]), Money(row[10]), Money(row[11]), Money(row[12]), Money(row[13]), Money(row[14]),
                Money(row[15]), Money(row[16]), Money(row[17]), Money(row[18]), Money(row[19]), Text(row[20]), items)));
        }

        return visits.OrderBy(v => v.Order).ThenBy(v => v.Index).Select(v => v.Visit).ToArray();
    }

    /// <summary>그 영수증 번호(앞뒤 빈칸 무시)의 항목. 맞는 줄이 없고 그 내원의 항목 영수증 번호가 하나뿐이면 그 항목(비트가 번호를 다시 매긴 내원).</summary>
    private static IEnumerable<ReceiptItem> ItemsFor(List<(string Receipt, ReceiptItem Item)>? rows, string receiptNum)
    {
        if (rows == null) return Array.Empty<ReceiptItem>();
        var same = rows.Where(r => string.Equals(r.Receipt, receiptNum, StringComparison.Ordinal)).ToArray();
        if (same.Length == 0 && rows.Select(r => r.Receipt).Distinct(StringComparer.Ordinal).Count() == 1) same = rows.ToArray();
        return same.Select(r => r.Item).OrderBy(item => item.Code).ToArray();
    }

    private static string Day(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static DateTime? ParseDay(object? value) =>
        DateTime.TryParseExact(Text(value).Trim(), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ? day : (DateTime?)null;

    private static string Text(object? value) => value == null || value is DBNull ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

    /// <summary>저장된 금액 그대로(원). numeric은 decimal로 온다. 원 미만은 버린다(비트 금액 칸은 정수라 없음). NULL·글자는 0.</summary>
    private static long Money(object? value)
    {
        switch (value)
        {
            case null:
            case DBNull _:
                return 0;
            case decimal d:
                return (long)decimal.Truncate(d);
            case double f:
                return (long)Math.Truncate(f);
            case float f:
                return (long)Math.Truncate(f);
            case long l:
                return l;
            case int i:
                return i;
            case short s:
                return s;
            case byte b:
                return b;
            default:
                return long.TryParse(Text(value).Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
        }
    }

    private static int Int(object? value)
    {
        var money = Money(value);
        return money > int.MaxValue || money < int.MinValue ? 0 : (int)money;
    }
}
