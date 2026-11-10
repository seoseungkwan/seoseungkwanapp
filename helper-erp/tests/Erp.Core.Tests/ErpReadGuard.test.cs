using System;
using System.Collections.Generic;
using System.Linq;
using Erp.Core;
using Erp.Core.Closing;
using Erp.Core.Tests.Closing;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3606.1 ERP 읽기 관문 ErpReadGuard(TASK-11, design.md 3-1): 마감일지 문장(ClosingSql.Parameters)과 기존 관문이 받는 문장(Sql.IsAllowed)만
/// 정해 둔 매개변수와 함께 통과시키고, 표 밖 문장·틀린 매개변수는 DB에 닿기 전에 E-BIT-READ-FAILED. 검사는 기존 ReadOnlyGuard와 같다.
/// 기존 관문(Precheck.Core Sql·ReadOnlyGuard)은 고치지 않는다(마감일지 문장을 모른다).
/// </summary>
public class ErpReadGuardTests
{
    private static readonly TimeSpan Second = TimeSpan.FromSeconds(1);

    /// <summary>기존 관문이 받는 문장 몇 가지: 청구 Sql.All 전부·매출 표 전부·1년 코드 목록·코드 이름·HistoryGuard.</summary>
    private static IEnumerable<string> Existing() =>
        Sql.All
            .Concat(RevenueSql.Parameters.Keys)
            .Concat(new[] { Sql.TrendTotalsSql, StatsSql.CodeNamesSql, RevenueSql.HistoryGuard, Sql.ScopesSql, Sql.InstitutionSql })
            .Distinct(StringComparer.Ordinal);

    private static Dictionary<string, object?> ValidArgs(IEnumerable<SqlParam> parameters) =>
        parameters.ToDictionary(
            parameter => parameter.Name,
            parameter => parameter.Kind == SqlParamKind.Int ? (object?)1
                : (object?)new string('1', Math.Min(parameter.Size, 8)));

    private static BitException Fails(Action action) => Assert.Throws<BitException>(action);

    // ---- 통과하는 문장 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.1 마감일지 문장은 ErpReadGuard만 받고(기존 Sql.IsAllowed는 모름) 매개변수 표는 ClosingSql.Parameters 그대로다")]
    public void ClosingStatementsPass()
    {
        Assert.Equal(8, ClosingSql.Parameters.Count);
        foreach (var pair in ClosingSql.Parameters)
        {
            Assert.True(ErpReadGuard.IsAllowed(pair.Key));
            Assert.False(Sql.IsAllowed(pair.Key));
            Assert.Same(pair.Value, ErpReadGuard.ParametersOf(pair.Key));
            ErpReadGuard.Require(pair.Key);
            ErpReadGuard.Require(pair.Key, ValidArgs(pair.Value));
        }
    }

    [Fact(DisplayName = "AC-3606.1 기존 관문이 받는 문장(매출·코드 목록·등록 확인)은 ErpReadGuard도 받고 매개변수 표는 Sql.ParametersOf 그대로다")]
    public void ExistingStatementsPass()
    {
        foreach (var sql in Existing())
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.True(ErpReadGuard.IsAllowed(sql));
            Assert.Equal(Sql.ParametersOf(sql), ErpReadGuard.ParametersOf(sql));
            ErpReadGuard.Require(sql, ValidArgs(Sql.ParametersOf(sql)));
        }
    }

    // ---- 막는 문장 ----------------------------------------------------------------------------------

    public static IEnumerable<object?[]> Outside()
    {
        yield return new object?[] { null };
        yield return new object?[] { "" };
        yield return new object?[] { "SELECT 1" };
        yield return new object?[] { "SELECT PbsPatNam FROM dbo.PbsInf" };
        yield return new object?[] { ClosingSql.DayVisitsSql + " " };
        yield return new object?[] { ClosingSql.MemoKindsSql + "; DELETE FROM dbo.OcmInf" };
        yield return new object?[] { ClosingSql.InpatientSql.ToLowerInvariant() };
        yield return new object?[] { ClosingSql.ReservationKindsSql.Replace("@hospital", "'SYNTHETIC'") };
        yield return new object?[] { Sql.TrendTotalsSql + " " };
        yield return new object?[] { RevenueSql.FinanceNormal.Replace("@hospital", "'SYNTHETIC'") };
    }

    [Theory(DisplayName = "AC-3606.1 표 밖 문장(다른 문장·고친 글자·null)은 E-BIT-READ-FAILED이고 DB에 닿지 않는다")]
    [MemberData(nameof(Outside))]
    public void OutsideRefused(string? sql)
    {
        var db = new FakeDb();
        Assert.False(ErpReadGuard.IsAllowed(sql));
        Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.Require(sql!)).Code);
        Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.ParametersOf(sql!)).Code);
        Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.Require(sql!, new Dictionary<string, object?>())).Code);
        Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.Query(db, sql!, new Dictionary<string, object?>(), Second)).Code);
        Assert.Empty(db.Calls);
    }

    /// <summary>문장 하나에 틀린 매개변수 모양들: 빠짐·더함·글자 아님·길음·null 묶음.</summary>
    private static IEnumerable<IReadOnlyDictionary<string, object?>?> Wrong(string sql)
    {
        var parameters = ErpReadGuard.ParametersOf(sql);
        var missing = ValidArgs(parameters);
        missing.Remove(missing.Keys.First());
        var extra = ValidArgs(parameters);
        extra["@daily"] = "1";
        var notText = ValidArgs(parameters);
        notText[parameters.First(p => p.Kind != SqlParamKind.Int).Name] = 20261109;
        var tooLong = ValidArgs(parameters);
        var longest = parameters.First(p => p.Kind != SqlParamKind.Int);
        tooLong[longest.Name] = new string('S', longest.Size + 1);
        var nullValue = ValidArgs(parameters);
        nullValue[parameters.First().Name] = null;
        return new IReadOnlyDictionary<string, object?>?[] { null, missing, extra, notText, tooLong, nullValue };
    }

    [Fact(DisplayName = "AC-3606.1 틀린 매개변수(빠짐·더함·글자 아님·길음·null)는 마감일지 문장도 기존 문장도 E-BIT-READ-FAILED이고 DB에 닿지 않는다")]
    public void WrongArgumentsRefused()
    {
        var statements = ClosingSql.Parameters.Where(pair => pair.Value.Length > 0).Select(pair => pair.Key)
            .Concat(new[] { Sql.TrendTotalsSql, StatsSql.CodeNamesSql, RevenueSql.FinanceNormal });
        foreach (var sql in statements)
        {
            foreach (var args in Wrong(sql))
            {
                var db = new FakeDb();
                Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.Query(db, sql, args!, Second)).Code);
                Assert.Empty(db.Calls);
            }
        }

        // 매개변수 없는 문장에 하나라도 주면 막는다
        Assert.Equal(BitErrors.ReadFailed, Fails(() =>
            ErpReadGuard.Require(ClosingSql.MemoKindsSql, new Dictionary<string, object?> { ["@day"] = ClosingFake.DayKey })).Code);

        // 정수 매개변수(@minimum)는 int만 받는다(ReadOnlyGuard와 같음)
        var pairs = ValidArgs(Sql.ParametersOf(Sql.TrendPairsSql));
        ErpReadGuard.Require(Sql.TrendPairsSql, pairs);
        pairs["@minimum"] = "1";
        Assert.Equal(BitErrors.ReadFailed, Fails(() => ErpReadGuard.Require(Sql.TrendPairsSql, pairs)).Code);
    }

    [Fact(DisplayName = "AC-3606.1 기존 문장에서 ErpReadGuard의 판정은 기존 ReadOnlyGuard와 같다")]
    public void SameVerdictAsReadOnlyGuard()
    {
        foreach (var sql in Existing())
        {
            var cases = new List<IReadOnlyDictionary<string, object?>> { ValidArgs(Sql.ParametersOf(sql)) };
            if (Sql.ParametersOf(sql).Any(p => p.Kind != SqlParamKind.Int)) cases.AddRange(Wrong(sql).Where(args => args != null).Select(args => args!));
            foreach (var args in cases)
            {
                var old = Record.Exception(() => ReadOnlyGuard.Require(sql, args));
                var erp = Record.Exception(() => ErpReadGuard.Require(sql, args));
                Assert.Equal(old == null, erp == null);
                if (erp != null) Assert.Equal(BitErrors.ReadFailed, Assert.IsType<BitException>(erp).Code);
            }
        }
    }

    [Fact(DisplayName = "AC-3606.1 관문을 지난 문장만 문장·매개변수·시간 제한 그대로 db로 보내고 답을 그대로 돌려준다")]
    public void QueryPassesThrough()
    {
        var db = new FakeDb();
        db.Answer(ClosingSql.InpatientSql, _ => new[] { new object?[] { 3L } });
        var args = ValidArgs(ClosingSql.Parameters[ClosingSql.InpatientSql]);
        var timeout = TimeSpan.FromSeconds(7);

        var rows = ErpReadGuard.Query(db, ClosingSql.InpatientSql, args, timeout);

        Assert.Equal(3L, Assert.Single(Assert.Single(rows)));
        var call = Assert.Single(db.Calls);
        Assert.Equal(ClosingSql.InpatientSql, call.Sql);
        Assert.Equal(args, call.Args);
        Assert.Equal(timeout, call.Timeout);
        Assert.Throws<ArgumentNullException>(() => ErpReadGuard.Query(null!, ClosingSql.InpatientSql, args, timeout));
    }

    // ---- 마감일지 읽기는 모두 ErpReadGuard를 지난다 -----------------------------------------------------

    /// <summary>문장이 올 때마다 ErpReadGuard가 그 문장·매개변수를 받는지 보고 적는 가짜 DB(답은 FakeDb).</summary>
    private sealed class GuardCheckingDb : IBitDb
    {
        private readonly FakeDb inner;

        public GuardCheckingDb(FakeDb inner)
        {
            this.inner = inner;
        }

        public List<string> Refused { get; } = new List<string>();

        public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
        {
            if (Record.Exception(() => ErpReadGuard.Require(sql, args)) != null) Refused.Add(sql);
            return inner.Query(sql, args, timeout);
        }
    }

    [Fact(DisplayName = "AC-3606.1 closing.day·closing.codes 계산이 DB에 보낸 문장은 하나도 빠짐없이 ErpReadGuard가 받는 문장·매개변수다(마감일지 문장 여덟 모두 돎)")]
    public void ClosingReadsPassTheGuard()
    {
        var rig = new DayRig()
            .Visit("V001", 1, "1", 40, 1000m, "CARM1", "KK090")
            .Visit("V002", 2, "4", 50, 2000m, "AA222");
        var day = new GuardCheckingDb(rig.Db);
        ClosingDay.Read(day, Synthetic.Scope, ClosingFake.Day, new[]
        {
            ClosingFake.Group("carm", "CARM1"),
            ClosingFake.Group("injection", "KK090"),
            ClosingFake.Group("ptVisit", "AA222"),
        });

        var codesDb = ClosingFake.Quiet();
        codesDb.Answer(Sql.TrendTotalsSql, _ => new object?[0][]);
        codesDb.Answer(StatsSql.CodeNamesSql, _ => new object?[0][]);
        var codes = new GuardCheckingDb(codesDb);
        ClosingCodes.Read(codes, Synthetic.Scope, ClosingFake.Day);

        Assert.Empty(day.Refused);
        Assert.Empty(codes.Refused);
        var sent = rig.Db.Sqls.Concat(codesDb.Sqls).ToList();
        Assert.All(ClosingSql.Parameters.Keys, sql => Assert.Contains(sql, sent));
        Assert.All(sent, sql => Assert.True(ErpReadGuard.IsAllowed(sql)));
    }
}
