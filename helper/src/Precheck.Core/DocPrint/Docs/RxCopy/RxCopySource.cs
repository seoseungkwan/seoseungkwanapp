using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.RxCopy;

/// <summary>
/// 처방전 사본(spec doc-print TASK-6, AC-7405.1·AC-7406.1): 고른 날 중 처방 있는 날(VisitDay.HasRx)의 내원 처방전마다 한 쪽(약이 많으면 이어지는 쪽), 날짜순.
/// RxCopySql.SlipSql 한 번으로 그 기간을 읽고 고른 날의 내원만 메모리에서 거른다. 약 줄이 없는 처방전은 그리지 않는다. 읽기 실패는 BitException 그대로.
/// </summary>
public sealed class RxCopySource : IDocSource
{
    public DocKind Kind => DocKind.RxCopy;

    public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx)
    {
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        var days = ctx.Days.Where(day => day.HasRx).ToArray();
        if (days.Length == 0 || ctx.Chart.Length == 0) return Array.Empty<DocPage>();
        return RxSlips.Read(db, ctx.Chart, days).SelectMany(slip => RxCopyLayout.Pages(slip, ctx)).ToArray();
    }
}

/// <summary>보험 구분(처방전 맨 위 '1 의료보험 2 의료보호 3 산재보험 4 자동차보험 5 기타'), OcmInsCod(InsMst)에서.</summary>
internal enum RxInsurance
{
    Health = 1,
    Aid = 2,
    Industrial = 3,
    Auto = 4,
    Other = 5,
}

/// <summary>원외약 한 줄(찍을 글로 바꾼 값).</summary>
internal sealed class RxLine
{
    public RxLine(string code, string name, string qty, string times, string days)
    {
        Code = code;
        Name = name;
        Qty = qty;
        Times = times;
        Days = days;
    }

    /// <summary>청구 코드 OdrElcCod.</summary>
    public string Code { get; }

    public string Name { get; }

    /// <summary>1회 투약량 + 단위(예: 2정, 0.5캡슐), 없으면 빈 글.</summary>
    public string Qty { get; }

    /// <summary>1일 투여횟수, 없으면 빈 글.</summary>
    public string Times { get; }

    /// <summary>총 투약일수, 없으면 빈 글.</summary>
    public string Days { get; }
}

/// <summary>처방전 한 장의 값(환자 값이 들어 있다, 파일·로그에 남기지 않음).</summary>
internal sealed class RxSlip
{
    public RxSlip(string issue, RxInsurance insurance, string resident, string doctor, string license, string mainDx, IReadOnlyList<RxLine> lines)
    {
        Issue = issue;
        Insurance = insurance;
        Resident = resident;
        Doctor = doctor;
        License = license;
        MainDx = mainDx;
        Lines = lines;
    }

    /// <summary>교부 연월일 및 번호: 'yyyy년 MM월 dd일 - 제 NNNNN 호'.</summary>
    public string Issue { get; }

    public RxInsurance Insurance { get; }

    /// <summary>주민등록번호 앞 7자리 + 뒤 가림(예: 800302-2******), 모르면 빈 글.</summary>
    public string Resident { get; }

    public string Doctor { get; }

    public string License { get; }

    /// <summary>주상병 코드 하나(OicIcdPri='1'), 없으면 빈 글.</summary>
    public string MainDx { get; }

    public IReadOnlyList<RxLine> Lines { get; }
}

/// <summary>RxCopySql.SlipSql 줄들 → 고른 날의 처방전들(날짜순, 같은 날은 비트 차례).</summary>
internal static class RxSlips
{
    public static IReadOnlyList<RxSlip> Read(IBitDb db, string chart, IReadOnlyList<VisitDay> days)
    {
        var dayOfVisit = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        foreach (var day in days)
        {
            foreach (var visit in day.VisitNums) dayOfVisit[visit] = day.Date;
        }
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@cht"] = chart,
            ["@from"] = Day8(days.Min(day => day.Date)) + "0000",
            ["@to"] = Day8(days.Max(day => day.Date).AddDays(1)) + "0000",
        };

        var slips = new List<(DateTime Day, int Order, string Key, object?[] Head, List<RxLine> Lines)>();
        var byKey = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(db, RxCopySql.SlipSql, args, DocSql.ReadTimeout))
        {
            if (row == null || row.Count < 14) continue;
            var visit = (Convert.ToString(row[0], CultureInfo.InvariantCulture) ?? "").TrimEnd();
            if (!dayOfVisit.TryGetValue(visit, out var date)) continue;
            var key = visit + "\n" + Text(row[1]) + "\n" + Text(row[2]);
            if (!byKey.TryGetValue(key, out var index))
            {
                index = slips.Count;
                byKey[key] = index;
                slips.Add((date, index, key, row.ToArray(), new List<RxLine>()));
            }
            var name = Text(row[9]);
            if (name.Length == 0) continue;
            slips[index].Lines.Add(new RxLine(Text(row[8]), name, Quantity(row[10], Text(row[13])), Count(row[11]), Count(row[12])));
        }

        return slips
            .Where(slip => slip.Lines.Count > 0)
            .OrderBy(slip => slip.Day)
            .ThenBy(slip => slip.Order)
            .Select(slip => new RxSlip(
                Issue(Text(slip.Head[1]), Text(slip.Head[2])),
                Insurance(slip.Head[3]),
                Resident(Text(slip.Head[4])),
                Text(slip.Head[5]),
                Text(slip.Head[6]),
                Text(slip.Head[7]),
                slip.Lines))
            .ToArray();
    }

    /// <summary>OcmInsCod: 31 국민건강보험 → 1, 50번대 의료급여(보호1·2종·행여) → 2, 40번대 산재 → 3, 20번대 자보 → 4, 그 밖(11 일반·38 공상·모름) → 5 기타.</summary>
    internal static RxInsurance Insurance(object? value)
    {
        int code;
        try
        {
            if (value == null || value is DBNull) return RxInsurance.Other;
            code = Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }
        catch (Exception)
        {
            return RxInsurance.Other;
        }
        if (code == 31) return RxInsurance.Health;
        if (code >= 50 && code <= 59) return RxInsurance.Aid;
        if (code >= 40 && code <= 49) return RxInsurance.Industrial;
        if (code >= 20 && code <= 29) return RxInsurance.Auto;
        return RxInsurance.Other;
    }

    private static string Issue(string day8, string number)
    {
        var head = DateTime.TryParseExact(day8, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            ? day.ToString("yyyy년 MM월 dd일", CultureInfo.InvariantCulture)
            : day8;
        return head + " - 제 " + number + " 호";
    }

    /// <summary>앞 7자리(생년월일 6 + 성별 1)만 보이고 뒤 6자리는 *로. 숫자 6자리뿐이면 성별 자리도 가린다. 그 밖은 빈 글.</summary>
    private static string Resident(string front)
    {
        var digits = new string(front.Where(c => c >= '0' && c <= '9').ToArray());
        if (digits.Length >= 7) return digits.Substring(0, 6) + "-" + digits[6] + "******";
        if (digits.Length == 6) return digits + "-*******";
        return "";
    }

    private static string Quantity(object? value, string unit)
    {
        var qty = Number(value);
        return qty > 0 ? qty.ToString("0.###", CultureInfo.InvariantCulture) + unit : "";
    }

    private static string Count(object? value)
    {
        var count = Number(value);
        return count > 0 ? decimal.Truncate(count).ToString(CultureInfo.InvariantCulture) : "";
    }

    private static decimal Number(object? value)
    {
        try
        {
            return value == null || value is DBNull ? 0 : Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }
        catch (Exception)
        {
            return 0;
        }
    }

    private static string Day8(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static string Text(object? value) => value == null || value is DBNull ? "" : (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "").Trim();
}
