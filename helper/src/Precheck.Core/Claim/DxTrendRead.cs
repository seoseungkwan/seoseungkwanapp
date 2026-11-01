using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;

namespace Precheck.Core.Claim;

/// <summary>처방코드 하나와 함께 나온 상병(원본 RxTrendDiagnosis {c, nm, m, s, x, l}).</summary>
public sealed class DxTrendDiagnosis
{
    public DxTrendDiagnosis(string code, string name, long main, long sub, long excluded)
    {
        Code = code;
        Name = name;
        Main = main;
        Sub = sub;
        Excluded = excluded;
    }

    public string Code { get; }

    public string Name { get; }

    /// <summary>주상병으로 함께 나온 내원 수.</summary>
    public long Main { get; }

    /// <summary>부상병으로.</summary>
    public long Sub { get; }

    /// <summary>배제상병으로.</summary>
    public long Excluded { get; }

    /// <summary>배수(×100): 이 처방 내원에서의 비율 ÷ 상병이 있는 전체 내원에서의 비율. 150 미만이면 어디에나 붙는 흔한 상병.</summary>
    public int Lift { get; internal set; }
}

/// <summary>처방코드 하나(원본 RxTrendCode {c, n, d}).</summary>
public sealed class DxTrendCode
{
    public DxTrendCode(string code, long visits, List<DxTrendDiagnosis> diagnoses)
    {
        Code = code;
        Visits = visits;
        Diagnoses = diagnoses;
    }

    public string Code { get; }

    public long Visits { get; }

    public List<DxTrendDiagnosis> Diagnoses { get; }
}

/// <summary>규칙 제안의 상병 묶음(원본 RxTrendGroup {c, nm, k, x}): 앞 3자리, 가장 많이 쓴 이름, 여기까지 덮는 천분율, 배제상병으로만 든 천분율.</summary>
public sealed class DxTrendGroup
{
    public DxTrendGroup(string code, string name, int cover, int excluded)
    {
        Code = code;
        Name = name;
        Cover = cover;
        Excluded = excluded;
    }

    public string Code { get; }

    public string Name { get; }

    public int Cover { get; }

    public int Excluded { get; }
}

/// <summary>규칙 제안(원본 RxTrendSuggestion {c, n, k, miss, g}).</summary>
public sealed class DxTrendSuggestion
{
    public DxTrendSuggestion(string code, long visits, int cover, long missing, List<DxTrendGroup> groups)
    {
        Code = code;
        Visits = visits;
        Cover = cover;
        Missing = missing;
        Groups = groups;
    }

    public string Code { get; }

    public long Visits { get; }

    public int Cover { get; }

    public long Missing { get; }

    public List<DxTrendGroup> Groups { get; }
}

/// <summary>상병 추세(원본 RxTrendResult의 visits·codes·suggestions와 센 수).</summary>
public sealed class DxTrend
{
    public long Visits { get; internal set; }

    public long InvalidRows { get; internal set; }

    public long Truncated { get; internal set; }

    public List<DxTrendCode> Codes { get; } = new List<DxTrendCode>();

    public List<DxTrendSuggestion> Suggestions { get; } = new List<DxTrendSuggestion>();
}

/// <summary>
/// 상병 추세 읽기(원본 RxDiagnosisTrend.Query·Suggest, 추천 상병 근거): 기간의 끝난 외래 내원에서 처방코드와 상병코드가 같은 내원에
/// 함께 나온 건수·배수와 규칙 제안. 계산은 원본 줄 그대로다. 내원번호는 도우미 안에서만 쓰고 결과에는 코드와 건수만 남는다.
/// </summary>
public static class DxTrendRead
{
    public const int MaximumCodes = 5000;
    public const int MaximumPerCode = 40;
    public const int MinimumCount = 2;
    public const int SuggestMinimumVisits = 30;
    public const int SuggestTarget = 950;
    public const int SuggestAccept = 900;
    public const int SuggestMaximumGroups = 4;
    public const int SuggestMinimumLift = 150;

    private static readonly Regex RxPattern = new Regex("^[0-9A-Za-z가-힣_.-]{1,20}$");
    private static readonly Regex DxPattern = new Regex("^[A-Z][0-9A-Z]{2,7}$");

    public static DxTrend Read(IBitDb db, string scope, DateTime from, DateTime last)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        try
        {
            return Query(db, scope, from, last);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException || e is ArgumentOutOfRangeException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }

    private static DxTrend Query(IBitDb db, string scope, DateTime from, DateTime last)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(from),
            ["@to"] = ClaimText.Stamp(last.AddDays(1)),
            ["@hospital"] = scope,
        };
        var result = new DxTrend();
        var totals = new Dictionary<string, long>(StringComparer.Ordinal);
        var pairs = new Dictionary<string, List<DxTrendDiagnosis>>(StringComparer.Ordinal);

        var count = ReadOnlyGuard.Query(db, Sql.TrendCountSql, args, Sql.TrendTimeout).FirstOrDefault();
        result.Visits = count == null ? 0 : Convert.ToInt64(ClaimText.Raw(count, 0), CultureInfo.InvariantCulture);

        foreach (var row in ReadOnlyGuard.Query(db, Sql.TrendTotalsSql, args, Sql.TrendTimeout))
        {
            var rx = ClaimText.Cell(row, 0);
            if (!RxPattern.IsMatch(rx))
            {
                result.InvalidRows++;
                continue;
            }
            totals[rx] = ClaimText.Long(row, 1);
        }

        var pairArgs = new Dictionary<string, object?>(args, StringComparer.Ordinal) { ["@minimum"] = MinimumCount };
        foreach (var row in ReadOnlyGuard.Query(db, Sql.TrendPairsSql, pairArgs, Sql.TrendTimeout))
        {
            string rx = ClaimText.Cell(row, 0), dx = ClaimText.Cell(row, 1).ToUpperInvariant(), name = ClaimText.Cell(row, 2);
            if (!RxPattern.IsMatch(rx) || !DxPattern.IsMatch(dx) || !totals.ContainsKey(rx))
            {
                result.InvalidRows++;
                continue;
            }
            if (!pairs.TryGetValue(rx, out var list)) pairs[rx] = list = new List<DxTrendDiagnosis>();
            list.Add(new DxTrendDiagnosis(dx, ClaimText.CleanName(name, 80), ClaimText.Long(row, 3), ClaimText.Long(row, 4), ClaimText.Long(row, 5)));
        }

        var rxVisits = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.TrendVisitRxSql, args, Sql.TrendTimeout))
        {
            string visit = ClaimText.Cell(row, 0), rx = ClaimText.Cell(row, 1);
            if (visit.Length == 0 || !RxPattern.IsMatch(rx)) continue;
            if (!rxVisits.TryGetValue(rx, out var list)) rxVisits[rx] = list = new List<string>();
            list.Add(visit);
        }

        var visitGroups = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);
        var groupNames = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);
        var dxVisits = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.TrendVisitDxSql, args, Sql.TrendTimeout))
        {
            string visit = ClaimText.Cell(row, 0), dx = ClaimText.Cell(row, 1).ToUpperInvariant(), name = ClaimText.CleanName(ClaimText.Cell(row, 3), 80);
            if (visit.Length == 0 || !DxPattern.IsMatch(dx)) continue;
            dxVisits[dx] = dxVisits.TryGetValue(dx, out var counted) ? counted + 1 : 1;
            var role = Convert.ToInt32(ClaimText.Raw(row, 2), CultureInfo.InvariantCulture);
            var group = dx.Substring(0, 3);
            if (!visitGroups.TryGetValue(visit, out var groups)) visitGroups[visit] = groups = new Dictionary<string, int>(StringComparer.Ordinal);
            groups[group] = groups.TryGetValue(group, out var previous) ? Math.Min(previous, role) : role;
            if (!groupNames.TryGetValue(group, out var names)) groupNames[group] = names = new Dictionary<string, int>(StringComparer.Ordinal);
            if (name.Length > 0) names[name] = names.TryGetValue(name, out var seen) ? seen + 1 : 1;
        }
        result.Suggestions.AddRange(Suggest(rxVisits, visitGroups, groupNames));

        // 처방-상병 짝마다 배수(×100) = (이 처방 내원 중 그 상병 비율) ÷ (상병이 있는 전체 내원 중 그 상병 비율)
        long withDx = visitGroups.Count;
        foreach (var entry in pairs)
        {
            var rxTotal = totals[entry.Key];
            foreach (var item in entry.Value)
            {
                if (withDx == 0 || rxTotal == 0 || !dxVisits.TryGetValue(item.Code, out var all) || all == 0) continue;
                item.Lift = (int)Math.Min(100000L, (item.Main + item.Sub + item.Excluded) * 100L * withDx / (rxTotal * all));
            }
        }

        foreach (var entry in pairs.OrderByDescending(x => totals[x.Key]).ThenBy(x => x.Key, StringComparer.Ordinal))
        {
            if (result.Codes.Count >= MaximumCodes)
            {
                result.Truncated++;
                continue;
            }
            var sorted = entry.Value.OrderByDescending(x => x.Main + x.Sub + x.Excluded).ThenBy(x => x.Code, StringComparer.Ordinal).ToList();
            if (sorted.Count > MaximumPerCode)
            {
                result.Truncated++;
                sorted = sorted.Take(MaximumPerCode).ToList();
            }
            result.Codes.Add(new DxTrendCode(entry.Key, totals[entry.Key], sorted));
        }
        return result;
    }

    /// <summary>
    /// 원본 Suggest: 처방마다 '그 처방 내원(상병이 하나라도 있는 내원)'을 가장 많이 덮는 상병 묶음을 차례로 고른다(주·부·배제 어디든 인정).
    /// 흔한 상병(그 처방 내원에서의 비율이 전체 비율의 1.5배 미만)은 고르지 않는다.
    /// </summary>
    public static List<DxTrendSuggestion> Suggest(Dictionary<string, List<string>> rxVisits,
        Dictionary<string, Dictionary<string, int>> visitGroups, Dictionary<string, Dictionary<string, int>> groupNames)
    {
        if (rxVisits == null) throw new ArgumentNullException(nameof(rxVisits));
        if (visitGroups == null) throw new ArgumentNullException(nameof(visitGroups));
        if (groupNames == null) throw new ArgumentNullException(nameof(groupNames));

        var output = new List<DxTrendSuggestion>();
        var everywhere = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var groupsOfVisit in visitGroups.Values)
        {
            foreach (var group in groupsOfVisit.Keys) everywhere[group] = everywhere.TryGetValue(group, out var seen) ? seen + 1 : 1;
        }
        long allVisits = visitGroups.Count;
        foreach (var entry in rxVisits)
        {
            var visits = entry.Value.Distinct(StringComparer.Ordinal).Where(visitGroups.ContainsKey).ToList();
            var total = visits.Count;
            if (total < SuggestMinimumVisits) continue;
            var inRx = new Dictionary<string, long>(StringComparer.Ordinal);
            foreach (var visit in visits)
            {
                foreach (var group in visitGroups[visit].Keys) inRx[group] = inRx.TryGetValue(group, out var seen) ? seen + 1 : 1;
            }
            var specific = new HashSet<string>(inRx.Where(x => x.Value * allVisits * 100L >= (long)SuggestMinimumLift * everywhere[x.Key] * total)
                .Select(x => x.Key), StringComparer.Ordinal);
            var uncovered = new HashSet<string>(visits, StringComparer.Ordinal);
            var groups = new List<DxTrendGroup>();
            while (groups.Count < SuggestMaximumGroups && (total - uncovered.Count) * 1000L < (long)SuggestTarget * total)
            {
                var counts = new Dictionary<string, int>(StringComparer.Ordinal);
                foreach (var visit in uncovered)
                {
                    foreach (var group in visitGroups[visit].Keys)
                    {
                        if (!specific.Contains(group)) continue;
                        counts[group] = counts.TryGetValue(group, out var seen) ? seen + 1 : 1;
                    }
                }
                if (counts.Count == 0) break;
                var best = counts.OrderByDescending(x => x.Value).ThenBy(x => x.Key, StringComparer.Ordinal).First().Key;
                uncovered.RemoveWhere(visit => visitGroups[visit].ContainsKey(best));
                int having = 0, excluded = 0;
                foreach (var visit in visits)
                {
                    if (!visitGroups[visit].TryGetValue(best, out var role)) continue;
                    having++;
                    if (role == 3) excluded++;
                }
                var sample = groupNames.TryGetValue(best, out var names) && names.Count > 0
                    ? names.OrderByDescending(x => x.Value).ThenBy(x => x.Key, StringComparer.Ordinal).First().Key : "";
                groups.Add(new DxTrendGroup(best, sample, (int)((total - uncovered.Count) * 1000L / total), having == 0 ? 0 : (int)(excluded * 1000L / having)));
            }
            var covered = (int)((total - uncovered.Count) * 1000L / total);
            if (covered < SuggestAccept || groups.Count == 0) continue;
            output.Add(new DxTrendSuggestion(entry.Key, total, covered, uncovered.Count, groups));
        }
        return output.OrderByDescending(x => x.Visits).ThenBy(x => x.Code, StringComparer.Ordinal).Take(MaximumCodes).ToList();
    }
}
