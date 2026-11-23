using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Serialization;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Claim;

/// <summary>claim.dates 날 하나 {date, visits, memoInBit} — 숫자만(AC-008.5).</summary>
public sealed class ClaimDay
{
    public ClaimDay(string date, long visits, long memoInBit)
    {
        Date = date;
        Visits = visits;
        MemoInBit = memoInBit;
    }

    /// <summary>YYYY-MM-DD.</summary>
    [JsonPropertyName("date")]
    public string Date { get; }

    /// <summary>그날 외래 진료 수(원본 방문 조건).</summary>
    [JsonPropertyName("visits")]
    public long Visits { get; }

    /// <summary>그중 비트에 청구메모가 있는 진료 수.</summary>
    [JsonPropertyName("memoInBit")]
    public long MemoInBit { get; }
}

/// <summary>claim.dates 답 {days}.</summary>
public sealed class ClaimDatesResult
{
    public ClaimDatesResult(IReadOnlyList<ClaimDay> days)
    {
        Days = days;
    }

    [JsonPropertyName("days")]
    public IReadOnlyList<ClaimDay> Days { get; }
}

/// <summary>
/// claim.dates(AC-008.5): 등록 병원 확인 → 기간 기관기호 → Sql.ClaimDatesSql 하나로 날짜별 외래 진료 수와 비트 메모가 있는 진료 수.
/// 진료 0건인 날·날짜 모양이 틀린 줄은 빼고, 날짜 순으로 숫자만 돌려준다. 차트번호·이름·메모 글은 읽지 않는다.
/// </summary>
public static class ClaimDates
{
    public static ClaimDatesResult Run(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        from = from.Date;
        to = to.Date;
        if (from > to) throw new ProtocolException(ErrorCodes.BadMessage);

        using var hospital = HospitalGate.Open(services);
        var registration = hospital.Registration;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(from),
            ["@to"] = ClaimText.Stamp(to.AddDays(1)),
            ["@hospital"] = registration.Scope,
        };

        var days = new SortedDictionary<string, (long Visits, long Memo)>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(hospital.Db, Sql.ClaimDatesSql, args, Sql.MemoTimeout))
        {
            var day = ClaimText.Cell(row, 0);
            if (!DateTime.TryParseExact(day, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
            var visits = ClaimText.Long(row, 1);
            if (visits <= 0) continue;
            var memo = Math.Max(0, Math.Min(visits, ClaimText.Long(row, 2)));
            var key = ClaimText.Iso(date);
            days[key] = days.TryGetValue(key, out var known) ? (known.Visits + visits, known.Memo + memo) : (visits, memo);
        }
        return new ClaimDatesResult(days.Select(pair => new ClaimDay(pair.Key, pair.Value.Visits, pair.Value.Memo)).ToList());
    }
}
