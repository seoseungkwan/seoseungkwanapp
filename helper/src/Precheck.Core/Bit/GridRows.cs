using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 통계 화면 표 → 줄(AC-008.3). 칸 이름은 비트 화면의 것을 그대로 받아, 원본 웹이 그 표에서 칸을 찾던 방법 그대로 찾는다:
/// 83(증상)은 mx999 build의 ci, 83D(상병내역)는 new-medicore-diagnoses parse의 col, 47(처방내역)은 parseRx의 정규식·quantityColumn.
/// 원본이 읽는 칸만 남기고(이름은 원본이 찾는 이름으로) 나머지 칸(주민번호·주소·전화·금액 등)은 버린다. 줄은 표 순서 그대로 모두 둔다
/// (빈 줄·합계 줄은 원본처럼 웹 쪽 모양 만들기가 거른다). 필요한 칸이 없으면 E-BIT-EXPORT-FAILED로 그 명령 전체를 멈춘다.
/// 47의 필수 칸은 원본 selectWorkbook을 따른다(AC-008.6). 급여구분 칸만 parseRx 정규식보다 좁게 찾는다(RxPay).
/// </summary>
public static class GridRows
{
    private static readonly Regex Space = new Regex(@"\s", RegexOptions.CultureInvariant);

    private sealed class Spec
    {
        public Spec(string[] columns, bool[] required, int headerSearch, Func<string[], bool> isHeader, Func<string[], int[]> locate)
        {
            Columns = columns;
            Required = required;
            HeaderSearch = headerSearch;
            IsHeader = isHeader;
            Locate = locate;
        }

        /// <summary>남기는 칸(원본이 찾는 이름, 이 차례로).</summary>
        public string[] Columns { get; }

        public bool[] Required { get; }

        /// <summary>
        /// 머리 줄을 찾는 앞 줄 수. 원본 엑셀은 화면 표 위에 3줄(제목·조회 기간·빈 줄)이 더 있었고 원본 웹은 엑셀의
        /// 첫 15줄(83)·20줄(47·83D)에서 찾았다: 화면 표 기준 12줄·17줄.
        /// </summary>
        public int HeaderSearch { get; }

        public Func<string[], bool> IsHeader { get; }

        /// <summary>머리 줄(앞뒤 공백을 지운 칸 이름) → Columns마다 칸 번호(없으면 -1).</summary>
        public Func<string[], int[]> Locate { get; }
    }

    // ── 83 증상: mx999 build ─────────────────────────────────────────
    private static readonly string[] SymptomColumns = { "내원번호", "차트번호", "환자명", "증상", "기록날짜" };

    // ── 83D 상병내역: new-medicore-diagnoses parse ───────────────────
    private static readonly string[] DiagnosisColumns = { "내원번호", "차트번호", "상병청구코드", "상병명칭", "주상병여부", "산정특례기호", "과목코드", "진단일자" };

    // ── 47 처방내역: parseRx (칸 이름 → 원본 정규식) ─────────────────
    private static readonly string[] PrescriptionColumns = { "처방코드", "처방명칭", "차트번호", "처방일자", "급여구분", "수량" };
    private static readonly Regex RxCode = new Regex("처방코드|^코드", RegexOptions.CultureInvariant);
    private static readonly Regex RxName = new Regex("처방명칭|명칭", RegexOptions.CultureInvariant);
    private static readonly Regex RxChart = new Regex("차트|등록번호", RegexOptions.CultureInvariant);
    private static readonly Regex RxDate = new Regex("처방일자|일자|날짜", RegexOptions.CultureInvariant);

    // 원본 parseRx의 /급.?비|급여구분/는 '급여비용' 같은 돈 칸에도 맞아, 그 칸을 잡으면 모든 처방이 급여로 읽힌다(AC-008.6의 까닭).
    // 그래서 공백을 지운 칸 이름 전체가 맞아야 한다: 원본 selectWorkbook의 급여구분·급/비는 그대로 들고, 글자 없는 사이만 받는다
    private static readonly Regex RxPay = new Regex("^(급[^가-힣]?비|급여구분)$", RegexOptions.CultureInvariant);
    private static readonly Regex RxHeaderCode = new Regex("처방코드|코드", RegexOptions.CultureInvariant);
    private static readonly string[] QuantityNames = { "총투여량", "투여량", "수량" };

    private static readonly Dictionary<string, Spec> Specs = new Dictionary<string, Spec>(StringComparer.Ordinal)
    {
        [StatsScreens.Symptoms] = new Spec(
            SymptomColumns,
            new[] { true, true, true, true, true },
            12,
            row => row.Contains("증상") && row.Any(v => v.Contains("차트번호")),
            header => SymptomColumns.Select(name => Ci(header, name)).ToArray()),
        [StatsScreens.Diagnoses] = new Spec(
            DiagnosisColumns,
            new[] { true, true, true, false, false, false, false, false },
            17,
            row => new[] { "내원번호", "차트번호", "상병청구코드" }.All(name => Array.IndexOf(Compact(row), name) >= 0),
            header => DiagnosisColumns.Select(name => Array.IndexOf(Compact(header), name)).ToArray()),
        [StatsScreens.Prescriptions] = new Spec(
            PrescriptionColumns,
            // 수량 말고 모두 필수다(AC-008.6, 원본 selectWorkbook의 필수 칸): 급여구분이 없으면 모든 처방이 급여로 잘못 읽힌다
            new[] { true, true, true, true, true, false },
            17,
            row => row.Any(v => RxHeaderCode.IsMatch(v)) && row.Any(v => RxChart.IsMatch(v)),
            header => new[]
            {
                First(header, RxCode), First(header, RxName), First(header, RxChart), First(header, RxDate), First(Compact(header), RxPay), QuantityColumn(header),
            }),
    };

    /// <summary>key("83"·"83D"·"47")에서 남기는 칸 이름(줄의 열쇠). 모르는 키면 E-BIT-EXPORT-FAILED.</summary>
    public static IReadOnlyList<string> Columns(string key) => SpecOf(key).Columns;

    /// <summary>
    /// 머리 줄(칸 이름)과 자료 줄 → 줄마다 {남기는 칸 이름: 글자}. 선택 칸이 표에 없으면 그 열쇠는 줄에 넣지 않는다.
    /// 필요한 칸이 없으면 E-BIT-EXPORT-FAILED.
    /// </summary>
    public static IReadOnlyList<IReadOnlyDictionary<string, string>> From(string key, IReadOnlyList<string> columns, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var spec = SpecOf(key);
        if (columns == null) throw new BitException(BitErrors.ExportFailed);
        var header = columns.Select(Trim).ToArray();
        var indices = spec.Locate(header);
        for (var i = 0; i < indices.Length; i++)
        {
            if (spec.Required[i] && indices[i] < 0) throw new BitException(BitErrors.ExportFailed);
        }

        var output = new List<IReadOnlyDictionary<string, string>>();
        foreach (var row in rows ?? Array.Empty<IReadOnlyList<string>>())
        {
            var line = new Dictionary<string, string>(StringComparer.Ordinal);
            for (var i = 0; i < indices.Length; i++)
            {
                if (indices[i] < 0) continue;
                line[spec.Columns[i]] = row != null && indices[i] < row.Count ? row[indices[i]] ?? "" : "";
            }
            output.Add(line);
        }
        return output;
    }

    /// <summary>
    /// 화면 표 전체(머리 줄 + 자료 줄, GridReader) → 줄. 원본처럼 앞 줄들에서 머리 줄을 찾아 그 뒤 줄만 쓴다.
    /// 머리 줄이 없으면 E-BIT-EXPORT-FAILED. 아무 글자도 없는 표(조회된 줄 없음)는 줄 0개(83D는 원본처럼 없어도 된다, AC-009.4).
    /// </summary>
    public static IReadOnlyList<IReadOnlyDictionary<string, string>> FromSheet(string key, IReadOnlyList<IReadOnlyList<string>> sheet)
    {
        var spec = SpecOf(key);
        var rows = sheet ?? Array.Empty<IReadOnlyList<string>>();
        for (var i = 0; i < Math.Min(rows.Count, spec.HeaderSearch); i++)
        {
            var header = (rows[i] ?? Array.Empty<string>()).Select(Trim).ToArray();
            if (spec.IsHeader(header)) return From(key, header, rows.Skip(i + 1).ToList());
        }
        if (rows.Any(row => row != null && row.Any(cell => !string.IsNullOrWhiteSpace(cell)))) throw new BitException(BitErrors.ExportFailed);
        return new List<IReadOnlyDictionary<string, string>>();
    }

    private static Spec SpecOf(string key) =>
        key != null && Specs.TryGetValue(key, out var spec) ? spec : throw new BitException(BitErrors.ExportFailed);

    private static string Trim(string? value) => (value ?? "").Trim();

    private static string RemoveSpace(string value) => Space.Replace(value, "");

    private static string[] Compact(string[] header) => header.Select(v => RemoveSpace(Trim(v))).ToArray();

    /// <summary>mx999 build의 ci: 공백을 지워 똑같은 칸 먼저, 없으면 그 이름을 품은 첫 칸.</summary>
    private static int Ci(string[] header, string name)
    {
        var key = RemoveSpace(name);
        var index = Array.FindIndex(header, v => RemoveSpace(v) == key);
        if (index < 0) index = Array.FindIndex(header, v => RemoveSpace(v).Contains(key));
        return index;
    }

    /// <summary>parseRx의 f: 정규식에 맞는 첫 칸.</summary>
    private static int First(string[] header, Regex pattern) => Array.FindIndex(header, v => pattern.IsMatch(v));

    /// <summary>원본 NEW_MEDICORE_HOSPITAL_CODE_RULES.quantityColumn: 총투여량 → 투여량 → 수량 차례로, 그 이름(또는 이름( · 이름[)인 칸이 하나일 때만.</summary>
    private static int QuantityColumn(string[] header)
    {
        var normalized = header.Select(RemoveSpace).ToArray();
        foreach (var name in QuantityNames)
        {
            var indices = Enumerable.Range(0, normalized.Length)
                .Where(i => normalized[i] == name || normalized[i].StartsWith(name + "(", StringComparison.Ordinal) || normalized[i].StartsWith(name + "[", StringComparison.Ordinal))
                .ToArray();
            if (indices.Length > 0) return indices.Length == 1 ? indices[0] : -1;
        }
        return -1;
    }
}
