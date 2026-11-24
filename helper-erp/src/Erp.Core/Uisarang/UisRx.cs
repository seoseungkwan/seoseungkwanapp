using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Erp.Core.Uisarang;

/// <summary>
/// 기간별처방통계 셈(spec erp-uisarang design.md 3-3·5-3·6-2, REQ-4206, TASK-7).
/// - 코드 줄 = 코드 칸이 비지 않고 '합계'가 아닌 줄, 합계 줄 = 코드 또는 처방명칭 칸이 '합계'인 줄(빈칸 뺀 글자). 되풀이 머리글·빈 줄은 UisReport가 이미 뺐다
/// - 코드는 UisRules.Code 꼴로 합친다(앞뒤 빈칸 뗌·가운데 빈칸 하나·대문자). 같은 코드 줄은 모두 더한다
/// - 총투여량: 소수 그대로 더한다(decimal로 더해 소수 셈 오차 없음 — 건수 묶음의 소수 판정·null은 TASK-13 UisDay). 총액: 줄마다 원 미만 버린 뒤 더한다
/// - 빈 칸·숫자 꼴 아닌 글자는 그 줄 몫을 더하지 않는다(0이 아니라 없음). 그날 없는 코드는 Codes에 없다(묶음 셈에서 0)
/// - Read: 코드별 합(묶음 합이 아님 — 모아 둔 값 4-4도 이 모양) + 합계 줄 총액. List: 코드 목록(closing.uisCodes, 3-3)
/// 묶음 합(건수·매출)·재진·산정안함은 TASK-13 UisDay가 이 Facts로 센다. 시트만 받는다(파일·네트워크에 닿지 않음). 예외 글에 칸 값을 넣지 않는다.
/// </summary>
public static class UisRx
{
    /// <summary>코드 목록 줄 수 한도(3-3).</summary>
    public const int ListLimit = 2000;

    private const string CodeColumn = "코드";
    private const string NameColumn = "처방명칭";
    private const string QtyColumn = "총투여량";
    private const string AmountColumn = "총액";

    /// <summary>decimal로 바꿀 수 있는 크기(넘으면 숫자가 아닌 것으로 본다).</summary>
    private const double DecimalLimit = 7.9e27;

    private sealed class Line
    {
        public Line(string code) { Code = code; }

        public string Code { get; }

        public string? Name { get; set; }

        public decimal Qty { get; set; }

        public long Amount { get; set; }
    }

    /// <summary>코드별 합(첫 줄 차례) + 합계 줄 총액(합계 줄이 꼭 하나일 때만, 아니면 null) + 못 찾은 칸.</summary>
    public static RxFacts Read(UisSheet s)
    {
        var lines = Scan(s, out var total);
        var codes = new Dictionary<string, RxCode>(StringComparer.Ordinal);
        foreach (var line in lines)
        {
            codes.Add(line.Code, new RxCode { Qty = (double)line.Qty, Amount = line.Amount });
        }
        return new RxFacts { Codes = codes, TotalAmount = total, Columns = s.MissingColumns.ToArray() };
    }

    /// <summary>
    /// 코드 목록(3-3): 코드마다 한 줄(name = 처음 나온 빈칸 아닌 처방명칭, 앞뒤 빈칸 뗌, 없으면 null), 총액 큰 차례 · 같으면 코드 글자 차례(Ordinal), ListLimit개까지.
    /// 21자 넘는 코드도 넣는다(확장이 고를 수 없게 한다).
    /// </summary>
    public static IReadOnlyList<UisCodeRow> List(UisSheet s) =>
        Scan(s, out _)
            .OrderByDescending(line => line.Amount)
            .ThenBy(line => line.Code, StringComparer.Ordinal)
            .Take(ListLimit)
            .Select(line => new UisCodeRow { Code = line.Code, Name = line.Name, Qty = (double)line.Qty, Amount = line.Amount })
            .ToList()
            .AsReadOnly();

    /// <summary>
    /// 맞춰 보기 rxTotal(6-2): 합계 줄 총액 ≠ 코드 줄 총액 합이면 [합계 줄, 코드 줄 합]. 합계 줄 총액이 null이거나
    /// 코드·총액 칸을 못 찾아 코드 줄 합을 알 수 없으면 null. checks의 다른 칸은 건드리지 않는다.
    /// </summary>
    public static void Check(RxFacts facts, UisDayChecks checks)
    {
        if (facts == null) throw new ArgumentNullException(nameof(facts));
        if (checks == null) throw new ArgumentNullException(nameof(checks));
        var known = !facts.Columns.Contains(CodeColumn) && !facts.Columns.Contains(AmountColumn);
        long? codeSum = known ? facts.Codes.Values.Sum(code => code.Amount) : null;
        checks.RxTotal = UisIncome.Mismatch(facts.TotalAmount, codeSum);
    }

    private static List<Line> Scan(UisSheet s, out long? total)
    {
        if (s == null) throw new ArgumentNullException(nameof(s));
        if (s.Kind != UisKind.Rx) throw new ArgumentException("기간별처방통계 시트가 아니다", nameof(s));

        var byCode = new Dictionary<string, Line>(StringComparer.Ordinal);
        var order = new List<Line>();
        var sums = 0;
        long? sumAmount = null;
        foreach (var row in s.Rows)
        {
            var codeText = Text(UisReport.Value(s, row, CodeColumn));
            var nameText = Text(UisReport.Value(s, row, NameColumn));
            if (UisReport.Squeeze(codeText) == UisReport.SumRow || UisReport.Squeeze(nameText) == UisReport.SumRow)
            {
                sums++;
                sumAmount = UisIncome.Won(UisReport.Number(UisReport.Value(s, row, AmountColumn)));
                continue;
            }

            var code = UisRules.Code(codeText ?? "");
            if (code.Length == 0) continue;
            if (!byCode.TryGetValue(code, out var line))
            {
                line = new Line(code);
                byCode.Add(code, line);
                order.Add(line);
            }

            var name = nameText?.Trim();
            if (line.Name == null && !string.IsNullOrEmpty(name)) line.Name = name;
            if (UisReport.Number(UisReport.Value(s, row, QtyColumn)) is double qty && Math.Abs(qty) < DecimalLimit) line.Qty += (decimal)qty;
            if (UisIncome.Won(UisReport.Number(UisReport.Value(s, row, AmountColumn))) is long amount) line.Amount += amount;
        }

        total = sums == 1 ? sumAmount : null;
        return order;
    }

    /// <summary>칸 글자: 글자 칸은 그대로, 숫자 칸은 숫자 글자(12345 → '12345'), 빈 칸은 null.</summary>
    private static string? Text(XlsCell cell) =>
        cell.Text ?? (cell.Number is double number ? number.ToString("R", CultureInfo.InvariantCulture) : null);
}
