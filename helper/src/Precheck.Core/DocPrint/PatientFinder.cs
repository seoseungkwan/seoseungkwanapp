using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint;

/// <summary>찾은 환자 한 명. 환자 값이라 파일·로그에 남기지 않는다(뽑은 기록의 차트번호·이름만 예외).</summary>
public sealed class PatientHit
{
    public PatientHit(string chart, string name, string birth8, string sex, string lastVisit8)
    {
        Chart = (chart ?? "").Trim();
        Name = (name ?? "").Trim();
        Birth8 = (birth8 ?? "").Trim();
        Sex = (sex ?? "").Trim();
        LastVisit8 = (lastVisit8 ?? "").Trim();
    }

    public string Chart { get; }

    public string Name { get; }

    /// <summary>생년월일 yyyyMMdd(PbsBirDte), 모르면 빈 글.</summary>
    public string Birth8 { get; }

    /// <summary>성별 M/F(PbsSexTyp), 모르면 빈 글.</summary>
    public string Sex { get; }

    /// <summary>마지막 내원일 yyyyMMdd, 없으면 빈 글.</summary>
    public string LastVisit8 { get; }

    /// <summary>목록 '생년월일': YYYY-MM-DD(틀린 날이면 빈 글).</summary>
    public string BirthText => DayText(Birth8);

    /// <summary>목록 '성별': 남·여(그 밖은 빈 글).</summary>
    public string SexText => Sex == "M" ? "남" : Sex == "F" ? "여" : "";

    /// <summary>목록 '마지막 내원': YYYY-MM-DD(없으면 빈 글).</summary>
    public string LastVisitText => DayText(LastVisit8);

    internal static string DayText(string day8) =>
        DateTime.TryParseExact(day8, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            ? day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : "";
}

/// <summary>환자 찾기 결과 종류.</summary>
public enum PatientKind
{
    /// <summary>한 명: 바로 채운다.</summary>
    Found,

    /// <summary>여러 명(동명이인): 목록에서 고른다.</summary>
    Many,

    /// <summary>없음(빈 글·틀린 글은 DB에 묻지 않고 None).</summary>
    None,

    /// <summary>비트 DB를 읽지 못했다.</summary>
    Failed,
}

/// <summary>찾기 결과. Found는 한 명, Many는 마지막 내원일 최근 순(없는 분은 뒤), 그 밖은 빈 목록.</summary>
public sealed class PatientResult
{
    public PatientResult(PatientKind kind, IReadOnlyList<PatientHit>? hits = null)
    {
        Kind = kind;
        Hits = kind == PatientKind.Found || kind == PatientKind.Many ? (hits ?? Array.Empty<PatientHit>()) : Array.Empty<PatientHit>();
    }

    public PatientKind Kind { get; }

    public IReadOnlyList<PatientHit> Hits { get; }
}

/// <summary>
/// 환자 찾기(spec doc-print AC-7402.2): 차트번호(DocSql.ChartFindSql) 또는 같은 이름(DocSql.NameFindSql)을 매개변수로, ReadOnlyGuard를 지나 5초 안에 읽기만 한다.
/// 마지막 내원일은 오늘까지(@to = 내일 0시)의 센 내원 중 가장 늦은 날이다(앞으로 잡힌 예약은 세지 않는다).
/// </summary>
public static class PatientFinder
{
    /// <summary>비트 창에서 지금 환자를 못 읽었을 때 찾기 칸 위 글(시안 그대로).</summary>
    public const string NoCurrentMessage = "비트에서 보던 환자를 찾지 못했어요. 차트번호나 이름을 넣어 주세요.";

    public static PatientResult Find(IBitDb db, SearchInput input, DateTime today)
    {
        if (input == null || (input.Kind != SearchKind.Chart && input.Kind != SearchKind.Name)) return new PatientResult(PatientKind.None);
        try
        {
            var to = today.Date.AddDays(1).ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";
            var byChart = input.Kind == SearchKind.Chart;
            var sql = byChart ? DocSql.ChartFindSql : DocSql.NameFindSql;
            var args = new Dictionary<string, object?>(StringComparer.Ordinal) { [byChart ? "@cht" : "@name"] = input.Value, ["@to"] = to };
            var hits = ReadOnlyGuard.Query(db, sql, args, DocSql.FindTimeout)
                .Where(row => row != null && row.Count >= 5)
                .Select(row => new PatientHit(Text(row[0]), Text(row[1]), Text(row[2]), Text(row[3]), Text(row[4])))
                .Where(hit => hit.Chart.Length > 0)
                .OrderByDescending(hit => hit.LastVisit8, StringComparer.Ordinal)
                .ToArray();
            if (hits.Length == 0) return new PatientResult(PatientKind.None);
            return new PatientResult(hits.Length == 1 ? PatientKind.Found : PatientKind.Many, hits);
        }
        catch (Exception)
        {
            // 어떤 실패든 화면에는 '비트에서 환자를 읽지 못했어요'만 보인다(오류 내용·환자 값을 남기지 않는다)
            return new PatientResult(PatientKind.Failed);
        }
    }

    /// <summary>찾기 칸 아래 글(시안 그대로). Found는 빈 글.</summary>
    public static string Message(PatientResult result)
    {
        switch (result?.Kind)
        {
            case PatientKind.Found: return "";
            case PatientKind.Many: return "같은 이름이 " + result!.Hits.Count.ToString(CultureInfo.InvariantCulture) + "명이에요. 맞는 분을 눌러 주세요.";
            case PatientKind.Failed: return "비트에서 환자를 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.";
            default: return "찾는 환자가 없어요. 차트번호나 이름을 다시 봐 주세요.";
        }
    }

    private static string Text(object? value) => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
}
