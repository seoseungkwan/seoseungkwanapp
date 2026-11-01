using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;

namespace Precheck.Core.Claim;

/// <summary>12개월 이력 줄 하나(원본 RxHistoryRow {v, p, d, c, m}).</summary>
public sealed class RxHistoryRow
{
    public RxHistoryRow(string visit, string patient, string day, string memo)
    {
        Visit = visit;
        Patient = patient;
        Day = day;
        Memo = memo;
    }

    /// <summary>v: 내원번호.</summary>
    public string Visit { get; }

    /// <summary>p: 차트번호.</summary>
    public string Patient { get; }

    /// <summary>d: 내원일 YYYY-MM-DD.</summary>
    public string Day { get; }

    /// <summary>c: 그 내원의 처방코드(대문자, 중복 없음, 120개까지).</summary>
    public List<string> Codes { get; } = new List<string>();

    /// <summary>m: 그 내원의 비트 청구메모(줄바꿈 \n, 500자까지).</summary>
    public string Memo { get; }
}

/// <summary>12개월 이력(원본 RxHistoryResult의 rows와 센 수).</summary>
public sealed class RxHistory
{
    public List<RxHistoryRow> Rows { get; } = new List<RxHistoryRow>();

    /// <summary>내원·차트번호·날짜 모양이 틀려 뺀 줄 수.</summary>
    public long InvalidRows { get; internal set; }

    /// <summary>처방코드 모양이 틀려 뺀 수.</summary>
    public long InvalidCodes { get; internal set; }

    /// <summary>자른 메모·처방코드 수.</summary>
    public long Truncated { get; internal set; }
}

/// <summary>
/// 12개월 이력 읽기(원본 RxHistory.Query, AC-008.2): 이번 기간(focus~last)에 온 환자만, 그 환자의 from~last 외래 내원별
/// 처방코드와 청구메모. Sql.HistoryVisitSql·HistoryCodeSql을 원본 매개변수로 돌리고 원본처럼 거른다. 이름·연락처·금액은 읽지 않는다.
/// </summary>
public static class RxHistoryRead
{
    /// <summary>원본 RxHistory.MaximumDays: 이력 범위(from~last) 날 수 한도.</summary>
    public const int MaximumDays = 400;

    public const int MaximumVisits = 200_000;
    public const int MaximumCodesPerVisit = 120;
    public const int MaximumMemo = 500;

    internal static readonly Regex VisitShape = new Regex("^[0-9A-Za-z-]{1,30}$");
    internal static readonly Regex PatientShape = new Regex("^[0-9A-Za-z-]{1,20}$");
    internal static readonly Regex DayShape = new Regex("^[0-9]{8}$");
    private static readonly Regex CodeShape = new Regex("^[0-9A-Z][0-9A-Z.-]{0,19}$");

    public static RxHistory Read(IBitDb db, string scope, DateTime from, DateTime focus, DateTime last)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(from),
            ["@focus"] = ClaimText.Stamp(focus),
            ["@to"] = ClaimText.Stamp(last.AddDays(1)),
            ["@hospital"] = scope,
        };

        var result = new RxHistory();
        var byVisit = new Dictionary<string, RxHistoryRow>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.HistoryVisitSql, args, Sql.HistoryTimeout))
        {
            var visit = ClaimText.Cell(row, 0);
            var patient = ClaimText.Cell(row, 1);
            var day = ClaimText.Cell(row, 2);
            var raw = ClaimText.Raw(row, 3);
            var memo = raw == null ? "" : ClaimText.CleanMemo(Convert.ToString(raw, System.Globalization.CultureInfo.InvariantCulture));
            if (!VisitShape.IsMatch(visit) || !PatientShape.IsMatch(patient) || !DayShape.IsMatch(day))
            {
                result.InvalidRows++;
                continue;
            }
            if (memo.Length > MaximumMemo)
            {
                memo = memo.Substring(0, MaximumMemo);
                result.Truncated++;
            }
            // 원본 result_limit('조회 결과가 한도를 초과했습니다')
            if (byVisit.Count >= MaximumVisits) throw new BitException(BitErrors.ReadFailed);
            if (byVisit.ContainsKey(visit)) continue;
            var entry = new RxHistoryRow(visit, patient, day.Substring(0, 4) + "-" + day.Substring(4, 2) + "-" + day.Substring(6, 2), memo);
            byVisit.Add(visit, entry);
            result.Rows.Add(entry);
        }

        foreach (var row in ReadOnlyGuard.Query(db, Sql.HistoryCodeSql, args, Sql.HistoryTimeout))
        {
            var visit = ClaimText.Cell(row, 0);
            var code = ClaimText.Cell(row, 1);
            if (!byVisit.TryGetValue(visit, out var entry)) continue;
            if (!CodeShape.IsMatch(code))
            {
                result.InvalidCodes++;
                continue;
            }
            if (entry.Codes.Count >= MaximumCodesPerVisit)
            {
                result.Truncated++;
                continue;
            }
            entry.Codes.Add(code);
        }
        result.Rows.RemoveAll(row => row.Codes.Count == 0);
        return result;
    }
}
