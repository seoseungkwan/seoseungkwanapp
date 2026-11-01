using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Precheck.Core.Input;

/// <summary>
/// 원본 vendor/secure_bridge·vendor/range_bridge의 UChartAutomation과 mx999_v22.html autoOne·nmPatientSkip에서 옮긴 판단 규칙.
/// 창을 건드리지 않아 이 서버에서 시험한다. 문구는 원본 그대로다(건너뜀 이유·fatal 판단이 문구에 기댄다).
/// </summary>
public static class ChartRules
{
    private static readonly Regex TitleNameRx = new Regex("\\(\\s*([^\\s(){}]+)\\s+환자정보", RegexOptions.Compiled);
    private static readonly Regex DateRx = new Regex("(\\d{4})-(\\d{2})-(\\d{2})", RegexOptions.Compiled);
    private static readonly Regex CountRx = new Regex("-\\s*(\\d+)\\s*명", RegexOptions.Compiled);

    // autoOne: if(/창을 찾지 못|열려 있지 않|최소화|가려져|날짜|기간|검색 종류|칸을 찾지/.test(m)) return {kind:"fatal", msg:m};
    // 원본에 더한 것: 키보드 초점. 초점을 잃으면 키가 다른 창으로 갈 수 있고, 문구도 '멈췄습니다'라서 다음 사람을 누르지 않는다.
    // 환자 열기를 중단: 비트가 열기를 막고 있다(VisitOpener). 문구도 '중단·다시 실행'이라 다음 사람을 누르지 않는다.
    private static readonly Regex FatalRx = new Regex("창을 찾지 못|열려 있지 않|최소화|가려져|날짜|기간|검색 종류|칸을 찾지|키보드 초점|환자 열기를 중단", RegexOptions.Compiled);

    // nmPatientSkip: /검색 결과가 \d+줄이라|줄을 (?:모두 )?열어봤지만|내원일 없음/
    private static readonly Regex PatientSkipRx = new Regex("검색 결과가 \\d+줄이라|줄을 (?:모두 )?열어봤지만|내원일 없음", RegexOptions.Compiled);

    public static string Digits(string? s) => new string((s ?? "").Where(char.IsDigit).ToArray());

    /// <summary>원본 ToWin: 메모는 윈도우 줄바꿈으로 쓴다.</summary>
    public static string ToWin(string? s) => (s ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n");

    /// <summary>원본 Norm: 줄바꿈을 맞추고 앞뒤 공백을 뗀다.</summary>
    public static string Norm(string? s) => (s ?? "").Replace("\r\n", "\n").Trim();

    /// <summary>원본 Same: 쓴 뒤·저장 뒤 대조. 읽지 못한 값(null)은 어떤 글과도 같지 않다.</summary>
    public static bool Same(string? a, string? b) => a != null && b != null && string.Equals(Norm(a), Norm(b), StringComparison.Ordinal);

    public static bool SamePatient(string chart, string name, string expChart, string expName)
    {
        var digits = Digits(chart);
        if (digits.Length > 0 && string.Equals(digits, Digits(expChart), StringComparison.Ordinal) && (name ?? "").Trim().Length > 0)
        {
            return string.Equals((name ?? "").Trim(), (expName ?? "").Trim(), StringComparison.Ordinal);
        }
        return false;
    }

    /// <summary>원본 ReadIdentity: 차트번호 칸·이름 칸·창 제목에서 화면의 환자를 읽는다.</summary>
    public static ChartIdentity Identity(string chartText, string nameText, string titleText)
    {
        var chart = (chartText ?? "").Trim();
        var label = (nameText ?? "").Trim();
        var match = TitleNameRx.Match(titleText ?? "");
        var title = match.Success ? match.Groups[1].Value.Trim() : "";
        string? error = null;
        if (label.Length > 0 && title.Length > 0 && !string.Equals(label, title, StringComparison.Ordinal))
        {
            error = "U차트 화면의 환자명과 창 제목의 환자명이 다릅니다";
        }
        var name = label.Length > 0 ? label : title;
        if (chart.Length == 0 && error == null) error = "U차트 차트번호 칸이 비어 있습니다";
        if (name.Length == 0 && error == null) error = "U차트 환자명을 읽지 못했습니다";
        return new ChartIdentity(chart, name, error);
    }

    /// <summary>원본 DateOf: 글자에서 yyyy-MM-dd 하나.</summary>
    public static string? DateOf(string? text)
    {
        var match = DateRx.Match(text ?? "");
        return match.Success ? match.Value : null;
    }

    /// <summary>원본 ReadListFilter의 기간 부분: dtpFrom·dtpTo 글자, 못 읽으면 창 제목의 날짜 하나 또는 둘.</summary>
    public static ListFilter ListPeriod(string? fromText, string? toText, string title)
    {
        var from = DateOf(fromText);
        var to = DateOf(toText);
        if (from == null || to == null)
        {
            var dates = DateRx.Matches(title ?? "").Cast<Match>().Select(match => match.Value).Distinct(StringComparer.Ordinal).ToList();
            if (dates.Count == 1)
            {
                from = to = dates[0];
            }
            else if (dates.Count == 2)
            {
                from = dates[0];
                to = dates[1];
            }
        }
        if (from == null || to == null) return new ListFilter(null, null, null, null, "내원내역 조회 기간을 읽지 못했습니다");
        if (string.CompareOrdinal(from, to) > 0) return new ListFilter(from, to, null, null, "내원내역 기간의 시작일이 종료일보다 늦습니다");
        return new ListFilter(from, to, null, null, null);
    }

    /// <summary>
    /// 원본 runAutoRange의 시작 전 확인: 내원내역 기간이 묶음 기간을 모두 포함해야 한다. 문제가 있으면 원본 문구, 없으면 null.
    /// 처방코드 칸: 원본은 '입력할 코드와 같거나 비어 있어야' 했다. 우리 묶음에는 코드 하나가 없어 비어 있어야 한다.
    /// </summary>
    public static string? ListProblem(ListFilter filter, IReadOnlyList<InputItem> items)
    {
        if (filter == null) throw new ArgumentNullException(nameof(filter));
        if (items == null) throw new ArgumentNullException(nameof(items));
        if (filter.Error != null || filter.From == null || filter.To == null)
        {
            return "U차트 내원내역 창의 조회 기간을 읽지 못했습니다.\n" + (filter.Error ?? "") + "\n\n내원내역 창을 띄워 주세요.";
        }
        var dates = items.Select(item => item.Date).OrderBy(date => date, StringComparer.Ordinal).ToArray();
        if (dates.Length == 0) return null;
        var first = dates[0];
        var last = dates[dates.Length - 1];
        if (string.CompareOrdinal(filter.From, first) > 0 || string.CompareOrdinal(filter.To, last) < 0)
        {
            return "기간이 다릅니다.\n\n청구메모: " + first + " ~ " + last + "\nU차트 내원내역: " + filter.From + " ~ " + filter.To
                + "\n\nU차트 내원내역 기간이 청구메모 기간을 모두 포함하도록 맞춰 주세요.";
        }
        var code = (filter.Code ?? "").Trim();
        if (code.Length > 0) return "U차트 내원내역의 처방코드 칸(" + code + ")을 비워 주세요.";
        return null;
    }

    /// <summary>원본 CheckRange: 환자·진료일이 모두 맞을 때 null, 아니면 원본 문구.</summary>
    public static string? CheckFailure(ChartRead read, string expChart, string expName, string expDate)
    {
        if (read == null) throw new ArgumentNullException(nameof(read));
        if (!read.Owned) return "등록된 병원 프로그램의 입력 위치를 확인하지 못했습니다.";
        if (read.IdentityError != null) return "환자 불일치 - 자동입력을 중단했습니다. (" + read.IdentityError + ")";
        if (!SamePatient(read.Chart, read.Name, expChart, expName)) return "환자 불일치 - 자동입력을 중단했습니다.";
        if (read.WorkDate == null) return "진료일 확인 불가 - 자동입력을 중단했습니다. (" + read.WorkDateError + ")";
        if (!string.Equals(Digits(read.WorkDate), Digits(expDate), StringComparison.Ordinal))
        {
            return "진료일 불일치 - 열린 내원(" + read.WorkDate + ")이 입력할 내원(" + expDate + ")과 다릅니다.";
        }
        return null;
    }

    /// <summary>원본 CountRx: 내원내역 제목의 '- N명'. 못 읽으면 null.</summary>
    public static int? SearchCount(string? title)
    {
        var match = CountRx.Match(title ?? "");
        return match.Success && int.TryParse(match.Groups[1].Value, out var count) ? count : (int?)null;
    }

    /// <summary>원본 IsChartMode: 글자·숫자만 남겨 '트번호'를 찾는다.</summary>
    public static bool IsChartMode(string? comboText)
    {
        var squeezed = new string((comboText ?? "").Normalize(NormalizationForm.FormC).Where(char.IsLetterOrDigit).ToArray());
        return squeezed.IndexOf("트번호", StringComparison.Ordinal) >= 0;
    }

    /// <summary>원본 OpenPatientRange: 목록 첫 줄을 누를 자리. 목록이 너무 작으면 TooSmall.</summary>
    public static (int X, int Y, bool TooSmall) FirstRowPoint(int left, int top, int bottom, uint dpi)
    {
        var scale = Scale(dpi);
        var y = top + (int)Math.Round(27.0 * scale);
        return (left + (int)Math.Round(150.0 * scale), y, y > bottom - (int)(10.0 * scale));
    }

    /// <summary>원본 fullyVisible: 목록 한 화면에 다 보이는 줄 수(머리글 19, 줄 17, 아래 가로 스크롤 17, 넉넉히 적게 셈).</summary>
    public static int FullyVisibleRows(int top, int bottom, uint dpi) =>
        Math.Max(1, (int)(((bottom - top) / Scale(dpi) - 19 - 17 - 6) / 17) - 1);

    private static double Scale(uint dpi) => dpi != 0 ? dpi / 96.0 : 1.0;

    /// <summary>원본 ContainsUnsavedPrescription: 공백을 빼고 '저장되지않은처방'이 있는가.</summary>
    public static bool ContainsUnsavedPrescription(IEnumerable<string?> labels) =>
        (labels ?? Enumerable.Empty<string?>()).Any(text =>
            new string((text ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).IndexOf("저장되지않은처방", StringComparison.Ordinal) >= 0);

    /// <summary>환자 열기 실패가 원본 fatal인가(멈춤). 아니면 그 사람만 건너뛴다.</summary>
    public static bool IsFatalOpenMessage(string? message) => FatalRx.IsMatch(message ?? "");

    /// <summary>그 환자만의 사정인가: 3번 잇따른 실패에 세지 않는다.</summary>
    public static bool IsPatientSkip(string? message) => PatientSkipRx.IsMatch(message ?? "");
}
