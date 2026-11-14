using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;

namespace Precheck.Core.Tests.Revenue;

/// <summary>
/// 매출 시험이 같이 쓰는 가짜 DB. 가짜 DB는 문장 글자로 답을 고른다(Bit/Fakes.test.cs의 FakeDb). 금액·건수는 모두 지어낸 것이다.
/// 기본 하루: 총진료비 1,050,000 = 급여 465,000(공단 310,000 + 본인 155,000) + 비급여 405,000 + 기타 180,000.
/// 참고 금액 문장(원장님별 doctorDays와 같은 글, first90 AC-4405.1) 기본 답: 정상수납 700,000.9 + 300,000.5, 미수입금 50,000.9
/// → 줄마다 원 미만을 버려 1,050,000(더한 뒤 버리면 1,050,002라 줄마다 버리는지 가른다).
/// </summary>
internal static class RevenueFake
{
    public static readonly object?[] Normal = { 1000000m, 300000m, 400000m, 200000m, 300000m, 100000m };
    public static readonly object?[] Receivable = { 50000m, 10000m, 5000m, 7000m, 8000m, 9000m };
    public static readonly object?[] NormalExtra = { 450000m, 150000m };
    public static readonly object?[] ReceivableExtra = { 15000m, 5000m };

    public static readonly string[] Checks =
    {
        RevenueSql.UnsupportedFinance,
        RevenueSql.FinanceMultiplicity,
        RevenueSql.ReceivableMultiplicity,
    };

    public static readonly string[] MoneyStatements =
    {
        RevenueSql.FinanceNormal,
        RevenueSql.FinanceReceivable,
        RevenueSql.FinanceNormalExtra,
        RevenueSql.FinanceReceivableExtra,
    };

    /// <summary>세 검사를 지난 날에 돌리는 문장 8개.</summary>
    public static readonly string[] EightStatements = Checks.Concat(MoneyStatements).Concat(new[] { RevenueSql.Patients }).ToArray();

    /// <summary>확인 필요한 날(unconfirmed)에만 더 돌리는 참고 금액 문장 둘: 통계 원장님별 금액과 같은 글(StatsSql), 정상수납 → 미수입금.</summary>
    public static readonly string[] RoughStatements = { StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql };

    /// <summary>기본 참고 금액 답의 roughTotal.</summary>
    public const long Rough = 1050000L;

    /// <summary>검사 모두 0, 기본 금액·건수, 처방 없음(기간 합계·날 단위 둘 다).</summary>
    public static T Quiet<T>(T db) where T : FakeDb
    {
        Row(db, RevenueSql.HistoryGuard, 0L);
        foreach (var check in Checks) Row(db, check, 0L);
        Row(db, RevenueSql.FinanceNormal, Normal);
        Row(db, RevenueSql.FinanceReceivable, Receivable);
        Row(db, RevenueSql.FinanceNormalExtra, NormalExtra);
        Row(db, RevenueSql.FinanceReceivableExtra, ReceivableExtra);
        Row(db, RevenueSql.Patients, 10L, 3L, 0L, 0L, 0L);
        RoughRows(db,
            new[] { RoughLine("D001", 700000.9m), RoughLine("D002", 300000.5m) },
            new[] { RoughLine("D001", 50000.9m) });
        db.Answer(RevenueSql.CodeAmounts, _ => new object?[0][]);
        db.Answer(RevenueSql.CodeAmountsByDay, _ => new object?[0][]);
        return db;
    }

    /// <summary>참고 금액 한 줄 [진료의 코드, 총진료비]. 수납일 칸은 RoughRows가 그날 @day로 채운다(문장이 수납일·진료의로 묶는다).</summary>
    public static object?[] RoughLine(string? doctor, object? amount) => new[] { doctor, amount };

    /// <summary>참고 금액 두 문장의 답: 날마다 같은 줄, 첫 칸은 그날 수납일(@day).</summary>
    public static void RoughRows(FakeDb db, object?[][] normal, object?[][] receivable)
    {
        db.Answer(StatsSql.DoctorMoneyNormalSql, args => normal.Select(line => new[] { args["@day"] }.Concat(line).ToArray()).ToArray());
        db.Answer(StatsSql.DoctorMoneyReceivableSql, args => receivable.Select(line => new[] { args["@day"] }.Concat(line).ToArray()).ToArray());
    }

    /// <summary>이 문장의 답을 한 줄로 정한다.</summary>
    public static void Row(FakeDb db, string sql, params object?[] cells) =>
        db.Answer(sql, _ => new[] { cells });

    /// <summary>이 문장의 답을 날마다 다르게: @day(없으면 @from 앞 8자리)가 target인 날만 cells, 나머지 날은 others.</summary>
    public static void RowOn(FakeDb db, string sql, string target, object?[] cells, object?[] others) =>
        db.Answer(sql, args => new[] { DayOf(args) == target ? cells : others });

    /// <summary>처방 코드 줄: 코드·줄 수·금액·빠진 값 수·이름.</summary>
    public static void Codes(FakeDb db, params object?[][] rows) =>
        db.Answer(RevenueSql.CodeAmounts, _ => rows);

    public static object?[] Code(string? code, long lines, decimal? amount, long missing = 0, string? name = null) =>
        new object?[] { code, lines, amount, missing, name };

    /// <summary>날 단위 처방 줄(CodeAmountsByDay 답): 날(yyyyMMdd)·코드·줄 수·금액·빠진 값 수.</summary>
    public static void DayCodes(FakeDb db, params object?[][] rows) =>
        db.Answer(RevenueSql.CodeAmountsByDay, _ => rows);

    public static object?[] DayCode(object? day, string? code, long lines, decimal? amount, long missing = 0) =>
        new object?[] { day, code, lines, amount, missing };

    /// <summary>그날 돌린 문장들(@to·@nextDay로 가른다). HistoryGuard·CodeAmounts·CodeAmountsByDay는 날에 속하지 않는다.</summary>
    public static List<(string Sql, Dictionary<string, object?> Args, TimeSpan Timeout)> CallsOn(FakeDb db, string nextDay) =>
        db.Calls.Where(call => call.Sql != RevenueSql.HistoryGuard && call.Sql != RevenueSql.CodeAmounts && call.Sql != RevenueSql.CodeAmountsByDay
            && (Is(call.Args, "@nextDay", nextDay) || Is(call.Args, "@to", nextDay + "0000"))).ToList();

    private static bool Is(Dictionary<string, object?> args, string name, string value) =>
        args.TryGetValue(name, out var found) && (string?)found == value;

    private static string DayOf(IReadOnlyDictionary<string, object?> args) =>
        args.TryGetValue("@day", out var day) ? (string)day! : ((string)args["@to"]!).Substring(0, 8);
}
