using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Detail;

/// <summary>세부내역서 금액 칸 다섯(원 단위 정수): 총액 · 일부본인부담 본인부담금 · 공단부담금 · 전액본인부담 · 비급여.</summary>
public sealed class DetailAmounts
{
    public DetailAmounts(long total, long own, long corp, long full, long non)
    {
        Total = total;
        Own = own;
        Corp = corp;
        Full = full;
        Non = non;
    }

    public static DetailAmounts Zero { get; } = new DetailAmounts(0, 0, 0, 0, 0);

    public long Total { get; }

    /// <summary>급여 일부본인부담 중 본인부담금.</summary>
    public long Own { get; }

    /// <summary>급여 일부본인부담 중 공단부담금.</summary>
    public long Corp { get; }

    /// <summary>급여 전액본인부담(100/100).</summary>
    public long Full { get; }

    /// <summary>비급여.</summary>
    public long Non { get; }

    public DetailAmounts Plus(DetailAmounts other) =>
        new DetailAmounts(Total + other.Total, Own + other.Own, Corp + other.Corp, Full + other.Full, Non + other.Non);

    public DetailAmounts Minus(DetailAmounts other) =>
        new DetailAmounts(Total - other.Total, Own - other.Own, Corp - other.Corp, Full - other.Full, Non - other.Non);
}

/// <summary>세부내역서 줄 하나(OdrInf 한 줄). 금액은 비트에 저장된 OdrAmt(원 미만 버림)이고, 칸 나눔은 DetailReader가 정한다.</summary>
public sealed class DetailLine
{
    public DetailLine(DateTime date, string visitNum, int seq, int group, string code, string name, decimal price, decimal qty, int times, int days, int incCod, string insYon, DetailAmounts amounts, string note)
    {
        Date = date.Date;
        VisitNum = visitNum ?? "";
        Seq = seq;
        Group = group;
        Code = code ?? "";
        Name = name ?? "";
        Price = price;
        Qty = qty;
        Times = times;
        Days = days;
        IncCod = incCod;
        InsYon = insYon ?? "";
        Amounts = amounts ?? DetailAmounts.Zero;
        Note = note ?? "";
    }

    /// <summary>내원한 날(OcmAcpDtm 앞 8자리).</summary>
    public DateTime Date { get; }

    public string VisitNum { get; }

    /// <summary>OdrSeq.</summary>
    public int Seq { get; }

    /// <summary>항목 묶음 차례(DetailGroups.Labels의 자리).</summary>
    public int Group { get; }

    public string GroupLabel => DetailGroups.Labels[Group];

    /// <summary>청구 코드 OdrElcCod.</summary>
    public string Code { get; }

    /// <summary>OdrCodNam.</summary>
    public string Name { get; }

    /// <summary>단가 OdrPrc(서식의 '금액').</summary>
    public decimal Price { get; }

    /// <summary>1회량 OdrQty.</summary>
    public decimal Qty { get; }

    /// <summary>횟수 OdrTms.</summary>
    public int Times { get; }

    /// <summary>일수 OdrDay.</summary>
    public int Days { get; }

    /// <summary>서식의 '횟수(총투여)' = 1회량 × 횟수.</summary>
    public decimal Count => Qty * Times;

    /// <summary>영수증 항목 OdrIncCod(IncMst).</summary>
    public int IncCod { get; }

    /// <summary>급여 구분 OdrInsYon(0 급여 / 1 보험적용100 / 2 비급여 / 3 100/100 / 4 비청구 / 8·9·A·B·F 선별급여 50·80·30·90·95%).</summary>
    public string InsYon { get; }

    public DetailAmounts Amounts { get; }

    /// <summary>비고(선별급여면 '본인부담50%' 같은 비트 글).</summary>
    public string Note { get; }
}

/// <summary>세부내역서에 든 내원(고른 날의 수납한 내원) 하나: 보험 이름, 영수증 저장 합계, 급여 줄을 나눌 본인 비율.</summary>
public sealed class DetailVisit
{
    public DetailVisit(string visitNum, DateTime date, string insurance, DetailAmounts stored, decimal ownRate)
    {
        VisitNum = visitNum ?? "";
        Date = date.Date;
        Insurance = insurance ?? "";
        Stored = stored ?? DetailAmounts.Zero;
        OwnRate = ownRate;
    }

    public string VisitNum { get; }

    public DateTime Date { get; }

    /// <summary>InsMst.InsCodNam(예: 국민건강보험).</summary>
    public string Insurance { get; }

    /// <summary>
    /// 그 영수증의 저장 값: 총액 OrpTotAmt, 본인부담금 OrpInsOwn, 공단부담금 OrpCorAmt, 전액본인부담 OrpTotAmt − OrpInsAmt − OrpNonAmt, 비급여 OrpNonAmt.
    /// (2026-11-17~19 국민건강보험 193건: OrpInsAmt = OrpInsOwn + OrpCorAmt 193건, 총 − 급여 − 비급여 = OdlHunAmt 합 177건.)
    /// </summary>
    public DetailAmounts Stored { get; }

    /// <summary>급여 줄 본인 비율: 영수증 항목 본인 합 ÷ 급여 합(65세 정액 31 뺌, 소수 4자리), 없으면 OrpInsOwn ÷ OrpInsAmt, 그것도 없으면 0.</summary>
    public decimal OwnRate { get; }
}

/// <summary>세부내역서 값 묶음: 줄(날짜순·항목 묶음 차례), 든 내원, 【계】(줄 합)·【합계】(영수증 저장 값 합)·【끝자리 조정금액】(합계 − 계).</summary>
public sealed class DetailData
{
    public DetailData(IEnumerable<DetailLine> lines, IEnumerable<DetailVisit> visits)
    {
        Lines = (lines ?? Enumerable.Empty<DetailLine>()).Where(line => line != null).ToArray();
        Visits = (visits ?? Enumerable.Empty<DetailVisit>()).Where(visit => visit != null).ToArray();
        Sum = Lines.Aggregate(DetailAmounts.Zero, (sum, line) => sum.Plus(line.Amounts));
        Total = Visits.Aggregate(DetailAmounts.Zero, (sum, visit) => sum.Plus(visit.Stored));
        Adjust = Total.Minus(Sum);
        FirstDay = Visits.Count == 0 ? (DateTime?)null : Visits.Min(visit => visit.Date);
        LastDay = Visits.Count == 0 ? (DateTime?)null : Visits.Max(visit => visit.Date);
        InsuranceText = string.Join(", ", Visits.Select(visit => visit.Insurance).Where(name => name.Length > 0).Distinct(StringComparer.Ordinal));
    }

    public static DetailData Empty { get; } = new DetailData(null!, null!);

    public IReadOnlyList<DetailLine> Lines { get; }

    public IReadOnlyList<DetailVisit> Visits { get; }

    /// <summary>【계】: 줄 금액 합.</summary>
    public DetailAmounts Sum { get; }

    /// <summary>【합계】: 든 내원 영수증 저장 값 합.</summary>
    public DetailAmounts Total { get; }

    /// <summary>【끝자리 조정금액】 = 합계 − 계.</summary>
    public DetailAmounts Adjust { get; }

    /// <summary>든 내원의 첫날·끝날(진료기간 칸). 없으면 null.</summary>
    public DateTime? FirstDay { get; }

    public DateTime? LastDay { get; }

    /// <summary>환자구분 칸: 든 내원의 보험 이름, 겹침 없이 날짜 차례로 ', '로 잇는다.</summary>
    public string InsuranceText { get; }
}

/// <summary>
/// 세부내역서 항목 묶음(비트 BITPaymentPrint 글 그대로, notes/forms.md §2)과 영수증 항목(IncMst 코드) → 묶음.
/// 선택진료료(19·34~50)는 그 본 항목으로, 모르는 코드는 '기    타'로.
/// </summary>
public static class DetailGroups
{
    public static IReadOnlyList<string> Labels { get; } = new[]
    {
        "진 찰 료", "입 원 료", "식    대", "투약조제(행위)", "투약조제(약품)", "주사료(행위)", "주사료(약품)", "마 취 료", "처치및수술료", "검 사 료",
        "영상진단료", "방사선치료료", "치료재료대", "재활물리치료료", "정신요법료", "전혈혈액성분제제료", "CT 진단료", "MRI 진단료", "PET 진단료", "초음파 진단료",
        "보철/교정료/기타", "기    타", "65세이상등정액", "정액수가", "포괄수가", "제증명수수료",
    };

    private const int Other = 21;

    private static readonly Dictionary<int, int> ByIncCod = Build(new Dictionary<int, int[]>
    {
        [0] = new[] { 1, 19 },
        [1] = new[] { 2, 34 },
        [2] = new[] { 14, 26 },
        [3] = new[] { 3, 35 },
        [4] = new[] { 28, 48 },
        [5] = new[] { 4, 36 },
        [6] = new[] { 29, 49 },
        [7] = new[] { 5, 37 },
        [8] = new[] { 8, 40 },
        [9] = new[] { 9, 41 },
        [10] = new[] { 30, 50 },
        [11] = new[] { 10, 42 },
        [12] = new[] { 15 },
        [13] = new[] { 6, 38 },
        [14] = new[] { 7, 39 },
        [15] = new[] { 18 },
        [16] = new[] { 11, 43 },
        [17] = new[] { 12, 44 },
        [18] = new[] { 27 },
        [19] = new[] { 16, 47 },
        [20] = new[] { 17, 24 },
        [Other] = new[] { 25, 45 },
        [22] = new[] { 31 },
        [23] = new[] { 32, 60 },
        [24] = new[] { 33, 99 },
        [25] = new[] { 13, 22 },
    });

    /// <summary>그 영수증 항목의 묶음 자리(Labels 안).</summary>
    public static int Of(int incCod) => ByIncCod.TryGetValue(incCod, out var group) ? group : Other;

    private static Dictionary<int, int> Build(Dictionary<int, int[]> groups)
    {
        var map = new Dictionary<int, int>();
        foreach (var pair in groups)
        {
            foreach (var code in pair.Value) map[code] = pair.Key;
        }
        return map;
    }
}

/// <summary>
/// 세부내역서 자료 읽기(spec doc-print AC-7405.1): DetailSql 두 문장을 고른 날의 첫날~끝날로 한 번씩 ReadOnlyGuard를 지나 읽기만 하고,
/// 고른 날의 내원 중 수납한 것(OcmComStt='PN'이고 영수증 있음)만 남긴다. 금액은 저장 값 그대로(OdrAmt·OrpInf, 원 미만 버림)이고 다시 셈하지 않는다.
/// 줄 칸 나눔(비트 BITReceiptCalc 규칙은 모름, 견본으로 맞출 것): 2 비급여 → 비급여, 3 → 전액본인부담, 4 비청구 → 총액만,
/// 8·9·A·B·F 선별급여 → 본인 50·80·30·90·95%, 그 밖의 급여 → 그 내원의 OwnRate. 본인부담금은 원 미만 버림, 공단부담금은 나머지.
/// 읽기 실패는 BitException 그대로 올린다.
/// </summary>
public static class DetailReader
{
    private static readonly Dictionary<string, (decimal Rate, string Note)> Selective = new Dictionary<string, (decimal Rate, string Note)>(StringComparer.Ordinal)
    {
        ["8"] = (0.5m, "본인부담50%"),
        ["9"] = (0.8m, "본인부담80%"),
        ["A"] = (0.3m, "본인부담30%"),
        ["B"] = (0.9m, "본인부담90%"),
        ["F"] = (0.95m, "본인부담95%"),
    };

    public static DetailData Read(IBitDb db, DocContext ctx)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        if (ctx.Days.Count == 0) return DetailData.Empty;

        var chosen = new HashSet<string>(ctx.Days.SelectMany(day => day.VisitNums).Select(visit => (visit ?? "").TrimEnd()), StringComparer.Ordinal);
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = ctx.Chart,
            ["@from"] = Day8(ctx.Days[0].Date) + "0000",
            ["@to"] = Day8(ctx.Days[ctx.Days.Count - 1].Date.AddDays(1)) + "0000",
        };

        var visits = new List<DetailVisit>();
        foreach (var row in ReadOnlyGuard.Query(db, DetailSql.VisitsSql, args, DocSql.ReadTimeout))
        {
            var visit = ParseVisit(row);
            if (visit != null && chosen.Contains(visit.VisitNum) && visits.All(v => v.VisitNum != visit.VisitNum)) visits.Add(visit);
        }
        var order = visits.Select((visit, index) => (visit, index)).ToDictionary(pair => pair.visit.VisitNum, pair => pair.index, StringComparer.Ordinal);

        var lines = new List<(DetailLine Line, int Visit, int Index)>();
        var rows = ReadOnlyGuard.Query(db, DetailSql.LinesSql, args, DocSql.ReadTimeout);
        for (var i = 0; i < rows.Count; i++)
        {
            var line = ParseLine(rows[i], order, visits);
            if (line != null) lines.Add((line, order[line.VisitNum], i));
        }

        var sorted = lines
            .OrderBy(item => item.Line.Date)
            .ThenBy(item => item.Line.Group)
            .ThenBy(item => item.Visit)
            .ThenBy(item => item.Line.Seq)
            .ThenBy(item => item.Index)
            .Select(item => item.Line);
        return new DetailData(sorted, visits);
    }

    /// <summary>수납한 내원 줄이면 DetailVisit, 수납 전·틀린 줄이면 null.</summary>
    private static DetailVisit? ParseVisit(IReadOnlyList<object?>? row)
    {
        if (row == null || row.Count < 11 || !ParseDay(row[1], out var date)) return null;
        if (!string.Equals(Text(row[2]), "PN", StringComparison.Ordinal) || IsNull(row[4])) return null;
        try
        {
            var total = Money(row[4]);
            var insured = Number(row[5]);
            var own = Number(row[6]);
            var non = Money(row[8]);
            var stored = new DetailAmounts(total, Whole(own), Money(row[7]), total - Whole(insured) - non, non);
            var itemInsured = Number(row[9]);
            var itemOwn = Number(row[10]);
            var rate = itemInsured > 0 ? itemOwn / itemInsured : insured > 0 ? own / insured : 0m;
            return new DetailVisit(VisitText(row[0]), date, Text(row[3]), stored, Math.Round(rate, 4));
        }
        catch (Exception error) when (error is FormatException || error is InvalidCastException || error is OverflowException)
        {
            return null;
        }
    }

    /// <summary>든 내원의 줄이면 DetailLine, 아니면 null.</summary>
    private static DetailLine? ParseLine(IReadOnlyList<object?>? row, Dictionary<string, int> order, List<DetailVisit> visits)
    {
        if (row == null || row.Count < 12 || !ParseDay(row[1], out var date)) return null;
        var visitNum = VisitText(row[0]);
        if (!order.TryGetValue(visitNum, out var at)) return null;
        try
        {
            var total = Money(row[9]);
            var insYon = Text(row[11]).ToUpperInvariant();
            var inc = (int)Number(row[10]);
            var (amounts, note) = Split(total, insYon, visits[at].OwnRate);
            return new DetailLine(
                date, visitNum, (int)Number(row[2]), DetailGroups.Of(inc), Text(row[3]), Text(row[4]),
                Number(row[5]), Number(row[6]), (int)Number(row[7]), (int)Number(row[8]), inc, insYon, amounts, note);
        }
        catch (Exception error) when (error is FormatException || error is InvalidCastException || error is OverflowException)
        {
            return null;
        }
    }

    private static (DetailAmounts Amounts, string Note) Split(long total, string insYon, decimal visitRate)
    {
        switch (insYon)
        {
            case "2": return (new DetailAmounts(total, 0, 0, 0, total), "");
            case "3": return (new DetailAmounts(total, 0, 0, total, 0), "");
            case "4": return (new DetailAmounts(total, 0, 0, 0, 0), "");
        }
        var rate = visitRate;
        var note = "";
        if (Selective.TryGetValue(insYon, out var selective))
        {
            rate = selective.Rate;
            note = selective.Note;
        }
        var own = Whole(total * rate);
        return (new DetailAmounts(total, own, total - own, 0, 0), note);
    }

    private static string Day8(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static bool ParseDay(object? value, out DateTime day) =>
        DateTime.TryParseExact(Text(value), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    private static bool IsNull(object? value) => value == null || value is DBNull;

    private static string Text(object? value) => IsNull(value) ? "" : (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "").Trim();

    /// <summary>내원 번호는 뒤 빈칸만 뺀다(VisitDays.Read와 같게, 앞 빈칸은 그대로 두어 VisitNums와 견준다).</summary>
    private static string VisitText(object? value) => IsNull(value) ? "" : (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "").TrimEnd();

    private static decimal Number(object? value) => IsNull(value) ? 0m : Convert.ToDecimal(value, CultureInfo.InvariantCulture);

    /// <summary>원 미만 버림(0 쪽으로).</summary>
    private static long Whole(decimal value) => (long)decimal.Truncate(value);

    private static long Money(object? value) => Whole(Number(value));
}
