using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Contact;

/// <summary>
/// contact.targets의 칸 고르기(REQ-605). 원본 revisit_schedule.html의 phoneColumn·headerFor·prepareRx 규칙을 옮겼다.
/// 83(증상)은 precheck GridRows가 정한 다섯 칸 그대로 쓴다. 47(처방별 환자 목록)은 GridRows가 전화 칸을 버리므로 화면 표에서 직접 고른다:
/// F/U는 차트번호 + 전화 칸, 정기 주사는 처방코드·차트번호·처방일자 + 전화 칸. 남긴 칸이 같은 줄은 한 번만(처음 차례).
/// 칸 값은 비트 화면 표시 글자 그대로다. 계산(날짜 모양·전화 글자 풀기)은 웹 Worker가 원본 그대로 한다.
/// 예외는 오류 번호뿐이다: 칸이 없거나 같은 이름 칸이 둘이면 E-BIT-EXPORT-FAILED, 한 표가 MaxRows줄을 넘으면 E-BIT-READ-FAILED.
/// </summary>
public static class ContactColumns
{
    public const string Followup = "followup";
    public const string Injection = "injection";

    /// <summary>
    /// 47 머리 줄을 찾는 앞 줄 수. 원본 headerFor는 엑셀의 첫 20줄에서 찾았고 엑셀에는 화면 표 위에 3줄(제목·조회 기간·빈 줄)이 더 있었다:
    /// 화면 표 기준 17줄(GridRows의 47과 같다).
    /// </summary>
    public const int RxHeaderSearch = 17;

    // 원본 headerKey의 /\s/g(자바스크립트 공백 글자 그대로)
    private static readonly Regex Space = new Regex("[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]", RegexOptions.CultureInvariant);

    // 원본 phoneColumn: 팩스는 전화 칸이 아니다. 전화 칸은 아래 이름 전체가 맞아야 한다(전화번호 확인일 같은 칸은 아님)
    private static readonly Regex Fax = new Regex("fax|팩스", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex Phone = new Regex(
        "^(?:보호자)?(?:휴대폰(?:번호)?|휴대전화(?:번호)?|핸드폰(?:번호)?|이동전화(?:번호)?|연락처|전화번호)(?:[12]|\\([12]\\))?$", RegexOptions.CultureInvariant);

    // 원본 preparePhones의 headerFor(["차트번호"])·prepareRx의 headerFor(["처방코드","차트번호","처방일자"])
    private static readonly string[] FollowupNames = { "차트번호" };
    private static readonly string[] InjectionNames = { "처방코드", "차트번호", "처방일자" };

    /// <summary>원본 headerKey: 공백 글자를 모두 지운 칸 이름.</summary>
    public static string HeaderKey(string? value) => Space.Replace(value ?? "", "");

    /// <summary>원본 phoneColumn: 연락처로 쓸 전화 칸 이름인가(보호자·1·2 붙은 것 포함, 팩스 아님).</summary>
    public static bool IsPhoneColumn(string? header)
    {
        var key = HeaderKey(header);
        if (Fax.IsMatch(key)) return false;
        return Phone.IsMatch(key);
    }

    /// <summary>kind(followup·injection)가 47에서 찾는 칸 이름. 모르는 kind면 E-HELPER-BAD-MESSAGE.</summary>
    public static IReadOnlyList<string> RxNames(string? kind) =>
        string.Equals(kind, Followup, StringComparison.Ordinal) ? FollowupNames
        : string.Equals(kind, Injection, StringComparison.Ordinal) ? InjectionNames
        : throw new ProtocolException(ErrorCodes.BadMessage);

    /// <summary>
    /// 83 화면 표 → [칸 이름 다섯, 줄…]. 칸 찾기·필수 칸은 GridRows.FromSheet("83")가 한다(머리 줄이 없거나 칸이 모자라면 E-BIT-EXPORT-FAILED,
    /// 아무 글자도 없는 표는 머리 줄만). 자료 줄이 MaxRows를 넘으면 E-BIT-READ-FAILED.
    /// </summary>
    public static List<string[]> Chart(IReadOnlyList<IReadOnlyList<string>> sheet)
    {
        var rows = GridRows.FromSheet(StatsScreens.Symptoms, sheet);
        if (rows.Count > ContactTargets.MaxRows) throw new BitException(BitErrors.ReadFailed);
        var columns = GridRows.Columns(StatsScreens.Symptoms);
        var table = new List<string[]>(rows.Count + 1) { columns.ToArray() };
        foreach (var row in rows)
        {
            table.Add(columns.Select(column => row.TryGetValue(column, out var value) ? value : "").ToArray());
        }
        return table;
    }

    /// <summary>
    /// 47 화면 표 → [칸 이름, 줄…]. 머리 줄은 앞 RxHeaderSearch줄 가운데 찾는 이름을 모두 품은 첫 줄(공백 지우고 포함, 원본 headerFor)이고,
    /// 이름마다 그 이름을 품은 칸이 꼭 하나여야 한다. 남기는 칸 차례: 찾는 이름 차례 → 전화 칸(표 차례). 칸 이름은 앞뒤 공백만 지운 화면 글자.
    /// 아무 글자도 없는 표(조회된 줄 없음)는 찾는 이름만 있는 머리 줄 하나.
    /// </summary>
    public static List<string[]> Rx(string kind, IReadOnlyList<IReadOnlyList<string>> sheet)
    {
        var names = RxNames(kind);
        var rows = sheet ?? Array.Empty<IReadOnlyList<string>>();

        var headerIndex = -1;
        string[] keys = Array.Empty<string>();
        for (var i = 0; i < Math.Min(rows.Count, RxHeaderSearch); i++)
        {
            var candidate = Cells(rows[i]).Select(HeaderKey).ToArray();
            if (names.All(name => candidate.Any(key => key.Contains(name))))
            {
                headerIndex = i;
                keys = candidate;
                break;
            }
        }
        if (headerIndex < 0)
        {
            if (rows.Any(row => row != null && row.Any(cell => !string.IsNullOrWhiteSpace(cell)))) throw Export();
            return new List<string[]> { names.ToArray() };
        }
        if (names.Any(name => keys.Count(key => key.Contains(name)) != 1)) throw Export();
        // 자르지 않는다: 일부만 보내면 연락할 환자가 빠진다(AC-605.3)
        if (rows.Count - headerIndex - 1 > ContactTargets.MaxRows) throw new BitException(BitErrors.ReadFailed);

        var picked = names.Select(name => Array.FindIndex(keys, key => key.Contains(name)))
            .Concat(Enumerable.Range(0, keys.Length).Where(i => IsPhoneColumn(keys[i])))
            .ToArray();
        var labels = Cells(rows[headerIndex]);
        var table = new List<string[]> { picked.Select(i => (labels[i] ?? "").Trim()).ToArray() };
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var r = headerIndex + 1; r < rows.Count; r++)
        {
            var row = rows[r];
            var cells = picked.Select(i => row != null && i < row.Count ? row[i] ?? "" : "").ToArray();
            if (seen.Add(RowKey(cells))) table.Add(cells);
        }
        return table;
    }

    private static IReadOnlyList<string> Cells(IReadOnlyList<string>? row) => row ?? Array.Empty<string>();

    /// <summary>줄 같음 열쇠: 칸마다 길이:글자(어떤 글자가 와도 두 줄이 섞이지 않는다).</summary>
    private static string RowKey(string[] cells)
    {
        var key = new StringBuilder();
        foreach (var cell in cells) key.Append(cell.Length).Append(':').Append(cell);
        return key.ToString();
    }

    private static BitException Export() => new BitException(BitErrors.ExportFailed);
}
