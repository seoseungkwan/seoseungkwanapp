using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Erp.Core.Closing;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Revenue;

namespace Erp.Core.Tests.Closing;

/// <summary>
/// 마감일지 읽기 시험이 같이 쓰는 가짜 DB(TASK-3). 가짜 DB는 문장 글자로 답을 고른다(Bit/Fakes.test.cs의 FakeDb).
/// 진료번호·그날 번호·나이·금액·코드는 모두 지어낸 것이다. 매출 칸은 RevenueFake.Quiet의 기본 하루를 그대로 쓴다
/// (revenue.days 그날 값: 총 1,050,000 · 공단 310,000 · 비급여 405,000 · 현금 200,000 · 카드 300,000 · 계좌 100,000 · 미수입금 24,000).
/// </summary>
internal static class ClosingFake
{
    public static readonly DateTime Day = new DateTime(2026, 11, 9);
    public const string DayKey = "20261109";
    public const string NextDayKey = "20261110";
    public const string DayText = "2026-11-09";

    /// <summary>closing.codes 코드 목록 문장(TASK-16, design.md 3-2 CodeListSql).</summary>
    public const string CodeListSql = ClosingSql.CodeListSql;

    /// <summary>마감일지 문장 아홉(design.md 3-2).</summary>
    public static readonly string[] Statements =
    {
        ClosingSql.DayVisitsSql,
        ClosingSql.DayCodesSql,
        ClosingSql.InjectionFirstSql,
        ClosingSql.MoneyExtraSql,
        ClosingSql.InpatientSql,
        ClosingSql.ReservationKindsSql,
        ClosingSql.ReservationPatientsSql,
        ClosingSql.MemoKindsSql,
        CodeListSql,
    };

    /// <summary>revenue.days 문장은 RevenueFake 기본 하루, 마감 문장은 빈 답·0.</summary>
    public static FakeDb Quiet(FakeDb? db = null)
    {
        var fake = RevenueFake.Quiet(db ?? new FakeDb());
        fake.Answer(ClosingSql.DayVisitsSql, _ => new object?[0][]);
        fake.Answer(ClosingSql.DayCodesSql, _ => new object?[0][]);
        RevenueFake.Row(fake, ClosingSql.InjectionFirstSql, 0L);
        RevenueFake.Row(fake, ClosingSql.MoneyExtraSql, 0m, 0m, 0m, 0m);
        RevenueFake.Row(fake, ClosingSql.InpatientSql, 0L);
        fake.Answer(ClosingSql.ReservationKindsSql, _ => new object?[0][]);
        RevenueFake.Row(fake, ClosingSql.ReservationPatientsSql, 0L);
        fake.Answer(ClosingSql.MemoKindsSql, _ => new object?[0][]);
        fake.Answer(CodeListSql, _ => new object?[0][]);
        return fake;
    }

    public static ClosingGroup Group(string key, params string[] codes) => new ClosingGroup(key, codes);

    /// <summary>매출 규칙이 있는 묶음(TASK-15, design.md 2절 amountPrefixes·amountCodes). null이면 그 칸을 보내지 않은 것이다.</summary>
    public static ClosingGroup Rule(string key, string[] codes, string[]? prefixes, string[]? amountCodes = null) =>
        new ClosingGroup(key, codes, prefixes, amountCodes);

    /// <summary>봉투(Envelope.Result)에 실린 data를 JSON으로 읽는다. TASK-6 처리기가 보낼 모양 그대로다.</summary>
    public static JsonElement DataOf(object result)
    {
        var text = Encoding.UTF8.GetString(Envelope.Result("closing-test-1", result));
        using var document = JsonDocument.Parse(text);
        return document.RootElement.GetProperty("data").Clone();
    }

    public static string[] Keys(JsonElement element) =>
        element.EnumerateObject().Select(property => property.Name).OrderBy(name => name, StringComparer.Ordinal).ToArray();

    public static string[] Sorted(params string[] names) => names.OrderBy(name => name, StringComparer.Ordinal).ToArray();
}

/// <summary>
/// 하루 진료 줄을 쌓아 ClosingDay.Read를 부르는 틀. Visit 한 번 = DayVisitsSql 한 줄(진료번호·그날 번호·진찰구분·만 나이·마지막 수납 총진료비),
/// 코드 하나 = 그 진료의 처방 한 줄(같은 코드를 여러 번 주면 DayCodesSql의 줄 수가 늘어난다). Visit로 준 코드 줄은 금액 0(단가 0원)이고,
/// 금액이 있는 처방 줄은 Line으로 더한다. DayCodesSql 답은 진료·코드마다 [진료번호, 코드, 줄 수, 금액 합(모두 NULL이면 NULL)]이다(TASK-14).
/// </summary>
internal sealed class DayRig
{
    private readonly List<object?[]> visits = new List<object?[]>();
    private readonly List<(string Visit, string Code, decimal? Amount)> lines = new List<(string Visit, string Code, decimal? Amount)>();

    /// <summary>진료·처방 답은 여기서 한 번만 정한다(답은 부를 때 쌓인 줄을 읽는다). 시험이 뒤에 Fail·Answer로 바꾸면 그것이 이긴다.</summary>
    public DayRig()
    {
        Db = ClosingFake.Quiet();
        Db.Answer(ClosingSql.DayVisitsSql, _ => visits.ToArray());
        Db.Answer(ClosingSql.DayCodesSql, _ => lines
            .GroupBy(line => (line.Visit, line.Code))
            .Select(group => new object?[] { group.Key.Visit, group.Key.Code, (long)group.Count(), Sum(group.Select(line => line.Amount)) })
            .ToArray());
    }

    public FakeDb Db { get; }

    public DayRig Visit(string visit, long person, string? dgs, int? age, decimal? total, params string[] codes)
    {
        visits.Add(new object?[] { visit, person, dgs, age, total });
        foreach (var code in codes) lines.Add((visit, code, 0m));
        return this;
    }

    /// <summary>처방 한 줄을 금액과 함께 더한다(금액 = 원내 줄의 일수 × 수량 × 단가. 원외 줄·값이 빠진 줄은 null).</summary>
    public DayRig Line(string visit, string code, decimal? amount)
    {
        lines.Add((visit, code, amount));
        return this;
    }

    /// <summary>SQL SUM과 같다: NULL은 빼고 더하고, 모두 NULL이면 NULL.</summary>
    private static object? Sum(IEnumerable<decimal?> amounts)
    {
        var known = amounts.Where(amount => amount != null).Select(amount => amount!.Value).ToList();
        return known.Count == 0 ? null : (object)known.Sum();
    }

    public ClosingDayResult Read(params ClosingGroup[] groups) => ClosingDay.Read(Db, Synthetic.Scope, ClosingFake.Day, groups);

    /// <summary>이 문장을 돌린 횟수.</summary>
    public int Count(string sql) => Db.Calls.Count(call => call.Sql == sql);
}
