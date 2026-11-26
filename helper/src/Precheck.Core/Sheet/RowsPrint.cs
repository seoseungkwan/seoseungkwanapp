using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.Sheet;

/// <summary>
/// 줄 지문(spec google-link TASK-9, AC-8510.4, design.md 9-2): 날짜·SHA-256 16진수 64자·시트에 쓸 줄 수. 환자 값을 담지 않는다.
/// 지문은 비트시트 SheetPayload.Fingerprint(비밀 글자·넣기 방법을 뺀 요청 전체의 SHA-256) 그대로. 저절로 넣기에서 지난번과 같으면 보내지 않는다.
/// </summary>
public sealed class RowsPrint
{
    public RowsPrint(string day, string hash, int rows)
    {
        Day = day ?? "";
        Hash = hash ?? "";
        Rows = rows;
    }

    /// <summary>yyyy-MM-dd.</summary>
    public string Day { get; }

    public string Hash { get; }

    /// <summary>시트에 쓸 줄: 환자마다 돈 줄 수(없으면 한 줄) + 미수만 낸 환자의 돈 줄 수.</summary>
    public int Rows { get; }

    public static RowsPrint Of(DayRows rows, Dictionary<string, object> request)
    {
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        if (request == null) throw new ArgumentNullException(nameof(request));
        var lines = rows.Patients.Sum(p => Math.Max(1, p.Money.Count)) + rows.PaidOnly.Sum(p => p.Money.Count);
        return new RowsPrint(rows.Day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), SheetPayload.Fingerprint(request), lines);
    }

    /// <summary>같은 날 같은 지문인가.</summary>
    public bool Same(RowsPrint? last) =>
        last != null && string.Equals(Day, last.Day, StringComparison.Ordinal) && string.Equals(Hash, last.Hash, StringComparison.Ordinal);
}
