using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Stats;

namespace Precheck.Core.Closing;

/// <summary>처방 코드 한 줄: 앞뒤 공백 없는 대문자 코드·비트 코드표 이름(없으면 null)·나온 진료 수.</summary>
public sealed class ClosingCode
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = "";

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("visits")]
    public long Visits { get; set; }
}

/// <summary>비트 예약 메모 한 줄: 번호('Memo'+번호 꼴이면 번호만)·이름(없으면 null).</summary>
public sealed class ClosingMemoKind
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

/// <summary>closing.codes 답 { codes, kinds }(design.md 2절 ClosingCodes).</summary>
public sealed class ClosingCodesResult
{
    public ClosingCodesResult(IReadOnlyList<ClosingCode> codes, IReadOnlyList<ClosingMemoKind> kinds)
    {
        Codes = codes;
        Kinds = kinds;
    }

    [JsonPropertyName("codes")]
    public IReadOnlyList<ClosingCode> Codes { get; }

    [JsonPropertyName("kinds")]
    public IReadOnlyList<ClosingMemoKind> Kinds { get; }
}

/// <summary>
/// closing.codes(REQ-3602, design.md 3-2·3-3): 어제까지 365일 동안 이 병원 외래 진료에 나온 처방 코드를 진료 수 차례로 2,000개까지,
/// 이름은 비트 코드표 첫 줄. 코드 목록은 새 문장 없이 Sql.TrendTotalsSql(진료 수)·StatsSql.CodeNamesSql(이름)을 쓰고, 예약 메모 목록은 ClosingSql.MemoKindsSql.
/// 환자 줄은 읽지 않는다(코드·이름·수만).
/// </summary>
public static class ClosingCodes
{
    public const int MaxCodes = 2000;

    /// <summary>어제까지 며칠(오늘은 넣지 않는다).</summary>
    public const int Days = 365;

    private const int MaxNameLength = 100;

    // AC-3602.2: 이름에 남기면 안 되는 글자는 revenue.days 코드 이름 규칙(RevenueDays.CleanName)과 같다:
    // 줄바꿈·제어 문자(C0·DEL·C1·U+2028·U+2029)와 짝 없는 대리쌍. 이어진 것은 빈칸 하나로 바꾼다
    private static readonly Regex NameJunk = new Regex(
        @"(?:[\u0000-\u001F\u007F-\u009F\u2028\u2029]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])+",
        RegexOptions.CultureInvariant);

    // 비트 예약 메모 코드 'Memo14' → 예약의 RsvRefMem '14'
    private static readonly Regex MemoNumber = new Regex(@"^Memo([0-9]+)\z", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly IReadOnlyDictionary<string, object?> NoValues = new Dictionary<string, object?>();

    public static ClosingCodesResult Read(IBitDb db, string hospitalScope, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var end = today.Date;
        var first = end.AddDays(-Days);
        var last = end.AddDays(-1);

        // Sql.TrendTotalsSql: 반열린 기간(@from 0시 ≤ 접수 시각 < 오늘 0시), 원본 RxDiagnosisTrend.Command처럼 Char(12)
        var totalArgs = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Key(first) + "0000",
            ["@to"] = Key(end) + "0000",
            ["@hospital"] = hospitalScope,
        };

        // StatsSql.CodeNamesSql: 원본 TrendDataSource.LoadCodesForRange처럼 비교 기간 = 같은 기간, Char(8)이고 끝은 마지막 날(StatsRows.Read와 같음)
        var nameArgs = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Key(first),
            ["@to"] = Key(last),
            ["@priorFrom"] = Key(first),
            ["@priorTo"] = Key(last),
        };

        var totals = ClosingRead.Query(db, Sql.TrendTotalsSql, totalArgs, Sql.TrendTimeout);
        var catalog = ClosingRead.Query(db, StatsSql.CodeNamesSql, nameArgs, Sql.TrendTimeout);
        var memos = ClosingRead.Query(db, ClosingSql.MemoKindsSql, NoValues);
        return new ClosingCodesResult(Codes(totals, Names(catalog)), Kinds(memos));
    }

    /// <summary>코드마다(앞뒤 공백을 뺀 대문자) 원본 정렬의 첫 줄 이름(StatsRows.CodeNames와 같은 고르기).</summary>
    private static Dictionary<string, string?> Names(IReadOnlyList<IReadOnlyList<object?>> catalog)
    {
        var names = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var row in catalog)
        {
            if (row == null || row.Count < 2) throw ClosingRead.ReadFailed();
            var code = ClosingDay.NormalCode(ClosingRead.Text(row[0]));
            if (code.Length == 0 || names.ContainsKey(code)) continue;
            names.Add(code, CleanName(ClosingRead.Text(row[1])));
        }
        return names;
    }

    /// <summary>공백을 떼어 같아진 코드는 진료 수를 더해 한 줄, 빈 코드는 뺀다. 진료 수 많은 차례(같으면 코드 글자 차례)로 2,000개까지.</summary>
    private static IReadOnlyList<ClosingCode> Codes(IReadOnlyList<IReadOnlyList<object?>> totals, Dictionary<string, string?> names)
    {
        var merged = new Dictionary<string, ClosingCode>(StringComparer.Ordinal);
        foreach (var row in totals)
        {
            if (row == null || row.Count < 2) throw ClosingRead.ReadFailed();
            var code = ClosingDay.NormalCode(ClosingRead.Text(row[0]));
            var visits = ClosingRead.Number(row[1]);
            if (code.Length == 0) continue;
            if (merged.TryGetValue(code, out var same))
            {
                same.Visits += visits;
                continue;
            }
            merged[code] = new ClosingCode { Code = code, Name = names.TryGetValue(code, out var name) ? name : null, Visits = visits };
        }
        return merged.Values
            .OrderByDescending(code => code.Visits)
            .ThenBy(code => code.Code, StringComparer.Ordinal)
            .Take(MaxCodes)
            .ToList();
    }

    /// <summary>예약 메모 목록 차례 그대로. 'Memo'+숫자는 숫자만, 다른 꼴은 앞뒤 공백만 뗀다. 빈 번호·겹친 번호는 뺀다(첫 줄이 남는다).</summary>
    private static IReadOnlyList<ClosingMemoKind> Kinds(IReadOnlyList<IReadOnlyList<object?>> memos)
    {
        var kinds = new List<ClosingMemoKind>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in memos)
        {
            if (row == null || row.Count < 2) throw ClosingRead.ReadFailed();
            var kind = ClosingRead.Text(row[0]) ?? "";
            var number = MemoNumber.Match(kind);
            if (number.Success) kind = number.Groups[1].Value;
            if (kind.Length == 0 || !seen.Add(kind)) continue;
            kinds.Add(new ClosingMemoKind { Kind = kind, Name = CleanName(ClosingRead.Text(row[1])) });
        }
        return kinds;
    }

    /// <summary>revenue.days 이름 규칙: 줄바꿈·제어 문자·짝 없는 대리쌍을 빈칸 하나로 바꾸고 앞뒤 공백을 뺀 뒤 100자까지(대리쌍은 쪼개지 않는다). 비면 null.</summary>
    internal static string? CleanName(string? raw)
    {
        if (raw == null) return null;
        var name = NameJunk.Replace(raw, " ").Trim();
        if (name.Length > MaxNameLength)
        {
            var cut = char.IsHighSurrogate(name[MaxNameLength - 1]) ? MaxNameLength - 1 : MaxNameLength;
            name = name.Substring(0, cut).TrimEnd();
        }
        return name.Length == 0 ? null : name;
    }

    private static string Key(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
}
