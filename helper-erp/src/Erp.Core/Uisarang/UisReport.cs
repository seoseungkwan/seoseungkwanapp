using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Erp.Core.Uisarang;

/// <summary>조회일 라벨 값(design.md 5-2): 날짜 하나면 From = To. 시각 없음.</summary>
public readonly struct UisDateRange
{
    public UisDateRange(DateTime from, DateTime to)
    {
        From = from.Date;
        To = to.Date;
    }

    public DateTime From { get; }

    public DateTime To { get; }

    /// <summary>답 reports[].from 꼴 'YYYY-MM-DD'.</summary>
    public string FromText => From.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>답 reports[].to 꼴 'YYYY-MM-DD'.</summary>
    public string ToText => To.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}

/// <summary>'전체'가 아닌 조건 라벨(design.md 5-2 notAll): 라벨 이름(괄호 안 빈칸 뺀 글자, 예 '외/입구분')과 값(답 reports[].value).</summary>
public sealed class UisCondition
{
    public UisCondition(string label, string value)
    {
        Label = label ?? throw new ArgumentNullException(nameof(label));
        Value = value ?? throw new ArgumentNullException(nameof(value));
    }

    public string Label { get; }

    public string Value { get; }
}

/// <summary>
/// 의사랑 통계 엑셀 한 시트를 알아본다(spec erp-uisarang design.md 5-1~5-4, REQ-4204, TASK-3).
/// - Read: 위에서 30줄 안 머리글 줄로 종류를 정하고(5-1), 그 위 '[…]' 라벨(5-2), 보고서마다 찾는 칸(5-3), 자료 줄(되풀이 머리글·빈 줄 뺌)을 낸다
/// - Range·Condition·IsOnDay·State: 라벨로 조회일·조건을 보고 시트 하나로 정할 수 있는 상태(ok·otherDate·notAll)를 낸다.
///   같은 종류 여럿·twice·missing·모아 둔 값은 한 번 읽기(UisDay, TASK-13)가 정한다
/// - Value·Number·Squeeze: 보고서 셈(UisIncome·UisRx·UisVisits·UisPatients)이 같이 쓰는 칸 읽기(5-3 숫자 칸 값)
/// 줄만 받는다(파일·네트워크에 닿지 않음). 예외 글에 칸 값을 넣지 않는다(AC-4209.1).
/// </summary>
public static class UisReport
{
    /// <summary>머리글 줄을 찾는 줄 수(위에서부터).</summary>
    public const int HeaderSearchRows = 30;

    /// <summary>조회일 라벨 이름(빈칸 뺀 글자, '[조 회 일]').</summary>
    public const string DateLabel = "조회일";

    /// <summary>조건 라벨의 '조건 없음' 값.</summary>
    public const string AllValue = "전체";

    /// <summary>보험구분·내원일·예약일 칸의 합계 줄 글자.</summary>
    public const string SumRow = "합계";

    private sealed class KindRule
    {
        public KindRule(UisKind kind, string[] required, string[] forbidden, string[] wanted)
        {
            Kind = kind;
            Required = required;
            Forbidden = forbidden;
            Wanted = wanted;
        }

        public UisKind Kind { get; }

        /// <summary>알아보는 머리글 칸(모두 있어야, 5-1).</summary>
        public string[] Required { get; }

        /// <summary>없어야 하는 칸(5-1).</summary>
        public string[] Forbidden { get; }

        /// <summary>찾는 칸(5-3 차례). 환자별 표의 이름·전화·주소 칸 등은 넣지 않는다.</summary>
        public string[] Wanted { get; }
    }

    private static readonly KindRule[] Rules =
    {
        new KindRule(
            UisKind.Income,
            new[] { "보험구분", "진료수납액" },
            new string[0],
            new[] { "보험구분", "총진료비", "급여총액", "청구액", "진료수납액", "비급여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액" }),
        new KindRule(UisKind.Rx, new[] { "코드", "처방명칭", "총액" }, new string[0], new[] { "코드", "처방명칭", "총투여량", "총액" }),
        new KindRule(UisKind.Visits, new[] { "내원일", "인원수", "신규환자" }, new[] { "차트번호" }, new[] { "내원일", "인원수", "신규환자" }),
        new KindRule(UisKind.VisitPatients, new[] { "차트번호", "신규환자" }, new[] { "예약일" }, new[] { "차트번호", "주민등록번호", "신규환자" }),
        new KindRule(UisKind.Rsv, new[] { "예약일", "예약건수" }, new[] { "차트번호" }, new[] { "예약일", "예약건수", "이행건수" }),
        new KindRule(UisKind.RsvPatients, new[] { "예약일", "차트번호", "방문여부" }, new string[0], new[] { "예약일", "차트번호", "방문여부" }),
    };

    private static readonly Regex DatePattern = new Regex(@"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$", RegexOptions.CultureInvariant);

    private static readonly Regex NumberPattern = new Regex(@"^[+-]?\d+(\.\d+)?$", RegexOptions.CultureInvariant);

    private static readonly char[] Tildes = { '~', '～' };

    private static readonly IReadOnlyDictionary<string, string> NoLabels =
        new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(StringComparer.Ordinal));

    private static readonly IReadOnlyDictionary<string, int> NoColumns =
        new ReadOnlyDictionary<string, int>(new Dictionary<string, int>(StringComparer.Ordinal));

    // ---- 알아보기(5-1)·라벨(5-2)·칸(5-3) -----------------------------------------------------------

    public static UisSheet Read(IReadOnlyList<IReadOnlyList<XlsCell>> rows)
    {
        if (rows == null) throw new ArgumentNullException(nameof(rows));

        var headerRow = -1;
        KindRule? rule = null;
        for (var r = 0; r < Math.Min(rows.Count, HeaderSearchRows); r++)
        {
            var names = new HashSet<string>(rows[r].Select(HeaderKey).Where(key => key.Length > 0), StringComparer.Ordinal);
            var matches = Rules.Where(candidate => candidate.Required.All(names.Contains) && !candidate.Forbidden.Any(names.Contains)).ToArray();
            if (matches.Length == 0) continue;
            // 두 종류에 맞는 머리글 줄은 종류 모름(더 찾지 않는다)
            if (matches.Length > 1) return UnknownSheet();
            headerRow = r;
            rule = matches[0];
            break;
        }
        if (rule == null) return UnknownSheet();

        var header = rows[headerRow];
        var keys = header.Select(HeaderKey).ToArray();
        var columns = new Dictionary<string, int>(StringComparer.Ordinal);
        var missing = new List<string>();
        foreach (var name in rule.Wanted)
        {
            var at = Enumerable.Range(0, keys.Length).Where(i => keys[i] == name).ToArray();
            if (at.Length == 1) columns.Add(name, at[0]);
            else missing.Add(name);
        }

        var data = new List<IReadOnlyList<XlsCell>>();
        for (var r = headerRow + 1; r < rows.Count; r++)
        {
            var row = rows[r];
            if (IsBlankRow(row) || SameRow(row, header)) continue;
            data.Add(row);
        }

        return new UisSheet(
            rule.Kind,
            new ReadOnlyDictionary<string, string>(Labels(rows, headerRow)),
            headerRow,
            new ReadOnlyDictionary<string, int>(columns),
            missing.AsReadOnly(),
            data.AsReadOnly());
    }

    /// <summary>
    /// 열려 있어 읽지 못한 파일의 보고서를 파일 이름으로 짐작한다(5-4, 열림 안내에만). 이름은 빈칸을 뺀 글자로 본다. 모르면 null('unknown').
    /// </summary>
    public static UisKind? GuessByName(string fileName)
    {
        var name = Squeeze(fileName);
        if (name.Contains("일일수입")) return UisKind.Income;
        if (name.Contains("처방")) return UisKind.Rx;
        var patients = name.Contains("환자별") || name.Contains("아래");
        if (name.Contains("내원일별")) return patients ? UisKind.VisitPatients : UisKind.Visits;
        if (name.Contains("예약")) return patients ? UisKind.RsvPatients : UisKind.Rsv;
        return null;
    }

    // ---- 조회일·조건·상태(5-2) ----------------------------------------------------------------------

    /// <summary>조회일 라벨이 있나(환자별 내원 표에 없으면 날짜를 보지 않고 checks.noDate).</summary>
    public static bool HasDateLabel(UisSheet sheet) => Need(sheet).Labels.ContainsKey(DateLabel);

    /// <summary>조회일 라벨 값의 from·to. 라벨이 없거나 날짜 꼴이 아니면 null.</summary>
    public static UisDateRange? Range(UisSheet sheet) =>
        Need(sheet).Labels.TryGetValue(DateLabel, out var value) ? ParseRange(value) : null;

    /// <summary>
    /// 조회일이 아닌 라벨 가운데 값이 날짜 꼴(날짜 하나·범위)도 '전체'도 아닌 첫 라벨(라벨 차례 = 줄 차례·칸 차례). 없으면 null.
    /// 값이 빈 라벨은 조건이 아니다(고른 것이 없음).
    /// </summary>
    public static UisCondition? Condition(UisSheet sheet)
    {
        foreach (var label in Need(sheet).Labels)
        {
            if (label.Key == DateLabel) continue;
            var plain = Squeeze(label.Value);
            if (plain.Length == 0 || plain == AllValue || ParseRange(label.Value) != null) continue;
            return new UisCondition(label.Key, label.Value);
        }
        return null;
    }

    /// <summary>조회일이 마감 일자 하루(from = to = day, 시각은 보지 않음)인가. 같은 종류 합계 엑셀 여럿 가운데 고르기(AC-4204.4).</summary>
    public static bool IsOnDay(UisSheet sheet, DateTime day) =>
        Range(sheet) is UisDateRange range && range.From == day.Date && range.To == day.Date;

    /// <summary>
    /// 시트 하나로 정할 수 있는 상태(AC-4204.2): 조건이 '전체'가 아니면 NotAll(날짜보다 먼저 — 어느 날에도 쓸 수 없어 지우는 엑셀),
    /// 아니면 합계 엑셀(income·rx·visits·rsv)은 IsOnDay면 Ok·아니면 OtherDate, 환자별 내원 표는 조회일 라벨이 있을 때만 같은 규칙(없으면 Ok + noDate),
    /// 예약 환자별 표는 Ok(날짜는 예약일 칸으로 UisPatients가 본다). 종류 모름 시트는 ArgumentException.
    /// </summary>
    public static UisState State(UisSheet sheet, DateTime day)
    {
        var kind = Need(sheet).Kind ?? throw new ArgumentException("종류 모름 시트는 상태가 없다", nameof(sheet));
        if (Condition(sheet) != null) return UisState.NotAll;
        switch (kind)
        {
            case UisKind.RsvPatients:
                return UisState.Ok;
            case UisKind.VisitPatients when !HasDateLabel(sheet):
                return UisState.Ok;
            default:
                return IsOnDay(sheet, day) ? UisState.Ok : UisState.OtherDate;
        }
    }

    /// <summary>날짜 하나 'YYYY-MM-DD'(구분 '-'·'.'·'/', 앞뒤 빈칸 뗌). 달력에 있는 날만 true.</summary>
    public static bool TryDate(string? text, out DateTime day)
    {
        day = default;
        if (text == null) return false;
        var match = DatePattern.Match(text.Trim());
        if (!match.Success) return false;
        var year = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var month = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        var date = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        if (year < 1 || month < 1 || month > 12 || date < 1 || date > DateTime.DaysInMonth(year, month)) return false;
        day = new DateTime(year, month, date);
        return true;
    }

    /// <summary>'날짜' 또는 '날짜 ~ 날짜'(물결 앞뒤 빈칸 상관없음). 아니면 null.</summary>
    public static UisDateRange? ParseRange(string? text)
    {
        if (text == null) return null;
        var parts = text.Split(Tildes);
        if (parts.Length == 1) return TryDate(parts[0], out var one) ? new UisDateRange(one, one) : null;
        if (parts.Length == 2 && TryDate(parts[0], out var from) && TryDate(parts[1], out var to)) return new UisDateRange(from, to);
        return null;
    }

    // ---- 칸 읽기(5-3) -------------------------------------------------------------------------------

    /// <summary>자료 줄의 칸 하나(머리글 이름으로). 못 찾은 칸(없음·둘)·짧은 줄이면 빈 칸.</summary>
    public static XlsCell Value(UisSheet sheet, IReadOnlyList<XlsCell> row, string column)
    {
        if (row == null) throw new ArgumentNullException(nameof(row));
        return Need(sheet).Columns.TryGetValue(column, out var index) && index < row.Count ? row[index] : XlsCell.Empty;
    }

    /// <summary>
    /// 숫자 칸 값(5-3): 숫자 칸은 그 값, 글자 칸은 쉼표·빈칸을 떼고 숫자 꼴(부호·소수 가능)이면 그 값, 빈 칸·숫자 꼴 아닌 글자는 null(0이 아님).
    /// </summary>
    public static double? Number(XlsCell cell)
    {
        if (cell.Number is double number) return number;
        if (cell.Text == null) return null;
        var plain = Squeeze(cell.Text).Replace(",", "");
        if (!NumberPattern.IsMatch(plain)) return null;
        return double.Parse(plain, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
    }

    /// <summary>빈칸(전각·탭·줄바꿈 포함)을 모두 뺀 글자. null은 빈 글자.</summary>
    public static string Squeeze(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var builder = new StringBuilder(text!.Length);
        foreach (var c in text)
        {
            if (!char.IsWhiteSpace(c)) builder.Append(c);
        }
        return builder.ToString();
    }

    // ---- 안쪽 ---------------------------------------------------------------------------------------

    private static UisSheet Need(UisSheet sheet) => sheet ?? throw new ArgumentNullException(nameof(sheet));

    private static UisSheet UnknownSheet() =>
        new UisSheet(null, NoLabels, -1, NoColumns, new string[0], new IReadOnlyList<XlsCell>[0]);

    /// <summary>머리글로 견주는 칸 글자(빈칸 뺌). 숫자 칸·빈 칸은 빈 글자.</summary>
    private static string HeaderKey(XlsCell cell) => Squeeze(cell.Text);

    /// <summary>되풀이 머리글 견주기용: 글자는 빈칸 뺀 글자, 숫자는 따로 표시한 값.</summary>
    private static string RowKey(XlsCell cell) =>
        cell.Text != null ? Squeeze(cell.Text)
        : cell.Number is double number ? "\u0001" + number.ToString("R", CultureInfo.InvariantCulture)
        : "";

    private static bool IsBlankRow(IReadOnlyList<XlsCell> row) => row.All(cell => RowKey(cell).Length == 0);

    /// <summary>칸 글자(빈칸 뺌)가 머리글 줄과 모두 같은 줄(쪽 나눔 되풀이). 모자란 칸은 빈 칸으로 본다.</summary>
    private static bool SameRow(IReadOnlyList<XlsCell> row, IReadOnlyList<XlsCell> header)
    {
        var width = Math.Max(row.Count, header.Count);
        for (var i = 0; i < width; i++)
        {
            var a = i < row.Count ? RowKey(row[i]) : "";
            var b = i < header.Count ? RowKey(header[i]) : "";
            if (a != b) return false;
        }
        return true;
    }

    /// <summary>
    /// 머리글 줄 위 '[…]' 라벨(5-2). 이름 = 괄호 안 빈칸 뺀 글자, 값 = 같은 칸 ']' 뒤 글자(앞뒤 빈칸 뗌), 비었으면 같은 줄 오른쪽 첫 빈 칸 아닌 칸
    /// (숫자 칸은 글자로, 그 칸이 다른 라벨이면 값은 빈 글자). 이름이 같은 라벨은 첫 것만. Dictionary는 지우지 않으므로 넣은 차례대로 돈다.
    /// </summary>
    private static Dictionary<string, string> Labels(IReadOnlyList<IReadOnlyList<XlsCell>> rows, int headerRow)
    {
        var labels = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var r = 0; r < headerRow; r++)
        {
            var row = rows[r];
            for (var c = 0; c < row.Count; c++)
            {
                if (!TryLabel(row[c], out var name, out var value)) continue;
                if (value.Length == 0)
                {
                    for (var k = c + 1; k < row.Count; k++)
                    {
                        var cell = row[k];
                        if (RowKey(cell).Length == 0) continue;
                        if (TryLabel(cell, out _, out _)) break;
                        value = cell.Text?.Trim() ?? (cell.Number ?? 0).ToString(CultureInfo.InvariantCulture);
                        break;
                    }
                }
                if (name.Length > 0 && !labels.ContainsKey(name)) labels.Add(name, value);
            }
        }
        return labels;
    }

    private static bool TryLabel(XlsCell cell, out string name, out string value)
    {
        name = "";
        value = "";
        var text = cell.Text?.TrimStart();
        if (text == null || text.Length == 0 || text[0] != '[') return false;
        var close = text.IndexOf(']');
        if (close < 0) return false;
        name = Squeeze(text.Substring(1, close - 1));
        value = text.Substring(close + 1).Trim();
        return true;
    }
}
