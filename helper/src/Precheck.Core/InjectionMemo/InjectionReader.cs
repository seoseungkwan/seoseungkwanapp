using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 비트에서 그 환자의 오늘 앞 30일 내원 읽기(AC-7502.1). 허용 목록 문장 둘을 ReadOnlyGuard로 5초씩 읽고, 내원과 증상 줄은 메모리에서 잇는다.
/// 읽은 글은 돌려주기만 하고 파일·로그에 남기지 않는다. 실패·시간 지남은 그대로 던진다(서비스가 Failed로 바꾼다).
/// </summary>
public static class InjectionReader
{
    /// <summary>
    /// chart는 정리한 차트번호(숫자 1~14자리, 앞자리 0 없음). 아니면 DB에 묻지 않고 빈 목록.
    /// 내원은 접수 시각 차례, 증상 줄은 EmrShtSeq 차례. 줄 없는 내원·빈 메모도 남기고, 접수 시각이 틀린 내원·모르는 내원의 줄은 버린다.
    /// </summary>
    public static IReadOnlyList<VisitNote> Read(IBitDb db, string chart, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (!ChartNumber.IsNormalized(chart)) return Array.Empty<VisitNote>();
        var day = today.Date;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = chart,
            ["@from"] = Stamp(day.AddDays(-InjectionRule.WindowDays)),
            ["@to"] = Stamp(day),
        };
        var visitRows = ReadOnlyGuard.Query(db, InjectionSql.VisitsSql, args, InjectionSql.Timeout);
        var lineRows = ReadOnlyGuard.Query(db, InjectionSql.LinesSql, args, InjectionSql.Timeout);

        var visits = new Dictionary<string, (string Stamp, DateTime Date, string Memo)>(StringComparer.Ordinal);
        foreach (var row in visitRows)
        {
            if (row == null || row.Count < 3) continue;
            var id = Text(row[0]).Trim();
            var stamp = Text(row[1]).Trim();
            if (id.Length == 0 || visits.ContainsKey(id) || stamp.Length < 8) continue;
            if (!DateTime.TryParseExact(stamp.Substring(0, 8), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
            visits[id] = (stamp, date, Text(row[2]).Trim());
        }

        var lines = new Dictionary<string, List<(decimal Seq, string Text)>>(StringComparer.Ordinal);
        foreach (var row in lineRows)
        {
            if (row == null || row.Count < 3) continue;
            var id = Text(row[0]).Trim();
            if (!visits.ContainsKey(id)) continue;
            if (!lines.TryGetValue(id, out var list)) lines[id] = list = new List<(decimal Seq, string Text)>();
            list.Add((Seq(row[1]), Text(row[2])));
        }

        return visits
            .OrderBy(pair => pair.Value.Stamp, StringComparer.Ordinal)
            .ThenBy(pair => pair.Key, StringComparer.Ordinal)
            .Select(pair => new VisitNote(
                pair.Value.Date,
                lines.TryGetValue(pair.Key, out var list) ? list.OrderBy(line => line.Seq).Select(line => line.Text).ToArray() : Array.Empty<string>(),
                pair.Value.Memo))
            .ToArray();
    }

    /// <summary>엑스레이 경과(REQ-7506): 청구 코드 앞 3글자(대문자) → 오늘 앞 2년 안 마지막 영상 처방 날짜. 틀린 줄은 버린다.</summary>
    public static IReadOnlyDictionary<string, DateTime> ReadXray(IBitDb db, string chart, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var result = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        if (!ChartNumber.IsNormalized(chart)) return result;
        var day = today.Date;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = chart,
            ["@from"] = Stamp(day.AddYears(-XrayRule.LongestYears)),
            ["@to"] = Stamp(day),
        };
        foreach (var row in ReadOnlyGuard.Query(db, InjectionSql.XraySql, args, InjectionSql.Timeout))
        {
            if (row == null || row.Count < 2) continue;
            var code = Text(row[0]).Trim().ToUpperInvariant();
            if (code.Length == 0 || !TryDay(Text(row[1]), out var date)) continue;
            if (!result.TryGetValue(code, out var seen) || date > seen) result[code] = date;
        }
        return result;
    }

    /// <summary>30일 안에 증상 줄 있는 내원이 없을 때(REQ-7506): 그 전 마지막 외래 내원 하나(증상 줄 EmrShtSeq 차례). 없으면 null.</summary>
    public static VisitNote? ReadLastBefore(IBitDb db, string chart, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (!ChartNumber.IsNormalized(chart)) return null;
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = chart,
            ["@from"] = Stamp(today.Date.AddDays(-InjectionRule.WindowDays)),
        };
        DateTime? date = null;
        var lines = new List<(decimal Seq, string Text)>();
        foreach (var row in ReadOnlyGuard.Query(db, InjectionSql.LastBeforeSql, args, InjectionSql.Timeout))
        {
            if (row == null || row.Count < 4) continue;
            if (date == null)
            {
                if (!TryDay(Text(row[1]), out var day)) return null;
                date = day;
            }
            lines.Add((Seq(row[2]), Text(row[3])));
        }
        return date == null ? null : new VisitNote(date.Value, lines.OrderBy(line => line.Seq).Select(line => line.Text).ToArray(), "");
    }

    private static bool TryDay(string stamp, out DateTime day)
    {
        day = default;
        var text = stamp.Trim();
        return text.Length >= 8 && DateTime.TryParseExact(text.Substring(0, 8), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);
    }

    private static string Stamp(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";

    private static string Text(object? value) => value == null ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

    /// <summary>EmrShtSeq(숫자·숫자 글). 못 읽으면 맨 뒤.</summary>
    private static decimal Seq(object? value) =>
        decimal.TryParse(Text(value).Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var seq) ? seq : decimal.MaxValue;
}

/// <summary>차트번호 글 정리(PT 종이와 같은 1~14자리).</summary>
internal static class ChartNumber
{
    public const int MaxDigits = 14;

    /// <summary>앞뒤 빈칸을 빼고 숫자(0~9)만이면 앞 0을 뺀 1~14자리 번호, 아니면 null.</summary>
    public static string? Normalize(string? text)
    {
        var trimmed = (text ?? "").Trim();
        if (trimmed.Length == 0 || !trimmed.All(c => c >= '0' && c <= '9')) return null;
        var number = trimmed.TrimStart('0');
        return number.Length >= 1 && number.Length <= MaxDigits ? number : null;
    }

    /// <summary>이미 정리한 번호인가(숫자 1~14자리, 앞자리 0 없음).</summary>
    public static bool IsNormalized(string? chart) => chart != null && chart.Length > 0 && Normalize(chart) == chart;
}
