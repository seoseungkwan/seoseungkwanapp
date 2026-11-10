using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Erp.Core;
using Erp.Core.Closing;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Revenue;
using Xunit;

namespace Erp.Core.Tests.Closing;

/// <summary>
/// AC-3606.1 마감일지 새 문장은 모두 SELECT 하나이고 ERP 읽기 관문(ErpReadGuard)이 받는 표(ClosingSql.Parameters)에 매개변수와 함께 있다.
/// 기존 관문(Sql.IsAllowed·ReadOnlyGuard)은 이 문장을 모른다(기존 도우미는 1a721ef 그대로). 표 밖·틀린 매개변수는 DB에 닿기 전에 E-BIT-READ-FAILED.
/// AC-3606.2 새 문장은 이름·전화·주민번호·주소·메모 칸을 읽지 않고, 차트번호·생년월일을 결과 칸으로 내지 않는다(그날 번호·만 나이로 바꿔 낸다).
/// </summary>
public class ClosingSqlTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static readonly string[] CodeSlots = Enumerable.Range(0, 20).Select(i => "@c" + i).ToArray();

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static Dictionary<string, object?> ValidArgs(string sql) =>
        ErpReadGuard.ParametersOf(sql).ToDictionary(
            parameter => parameter.Name,
            parameter => (object?)(parameter.Name == "@hospital" ? Synthetic.Scope
                : parameter.Size == 8 ? ClosingFake.DayKey
                : parameter.Size == 12 ? ClosingFake.DayKey + "0000"
                : "CARM1"));

    private static string Shape(string sql) =>
        string.Join(" ", ClosingSql.Parameters[sql].Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // ---- AC-3606.1 읽기 문장 하나·허용 표 ------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.1 새 문장 8개(design.md 3-2)는 모두 읽기 문장 하나다(SELECT·WITH 시작, WITH면 ') SELECT ', ;·주석·쓰기 낱말 없음)")]
    public void StatementsAreSingleReads()
    {
        Assert.Equal(8, ClosingFake.Statements.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(
            ClosingFake.Statements.OrderBy(sql => sql, StringComparer.Ordinal),
            ClosingSql.Parameters.Keys.OrderBy(sql => sql, StringComparer.Ordinal));
        foreach (var sql in ClosingFake.Statements)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal), sql);
            if (sql.StartsWith("WITH ", StringComparison.Ordinal)) Assert.Contains(") SELECT ", Squash(sql), StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
            Assert.DoesNotMatch(Forbidden, sql);
        }
    }

    [Fact(DisplayName = "AC-3606.1 매개변수 표 = 문장 속 @이름, design.md 3-2 그대로(@day·@nextDay Char 8, @from·@to Char 12, @hospital VarChar 32, 주사 코드 @c0~@c19 VarChar 20, 메모 목록은 없음)")]
    public void ParameterTableMatchesStatements()
    {
        foreach (var sql in ClosingFake.Statements)
        {
            var named = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(named, ClosingSql.Parameters[sql].Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal));
        }

        Assert.Equal("@day:Char(8) @from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.DayVisitsSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.DayCodesSql));
        Assert.Equal(
            "@from:Char(12) @to:Char(12) @hospital:VarChar(32) " + string.Join(" ", CodeSlots.Select(slot => slot + ":VarChar(20)")),
            Shape(ClosingSql.InjectionFirstSql));
        Assert.Equal("@day:Char(8) @nextDay:Char(8) @hospital:VarChar(32)", Shape(ClosingSql.MoneyExtraSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.InpatientSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.ReservationKindsSql));
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.ReservationPatientsSql));
        Assert.Equal("", Shape(ClosingSql.MemoKindsSql));
    }

    [Fact(DisplayName = "AC-3606.1 ErpReadGuard는 새 문장을 정해 둔 매개변수와 함께 통과시키고 ParametersOf는 이 표를 돌려준다(기존 Sql.IsAllowed는 모른다)")]
    public void GuardPassesClosingStatements()
    {
        foreach (var sql in ClosingFake.Statements)
        {
            Assert.True(ErpReadGuard.IsAllowed(sql));
            ErpReadGuard.Require(sql);
            ErpReadGuard.Require(sql, ValidArgs(sql));
            Assert.Same(ClosingSql.Parameters[sql], ErpReadGuard.ParametersOf(sql));
            Assert.False(Sql.IsAllowed(sql));
        }
    }

    public static IEnumerable<object?[]> ChangedStatements()
    {
        foreach (var sql in ClosingFake.Statements)
        {
            yield return new object?[] { sql + " " };
            yield return new object?[] { sql + "; DELETE FROM dbo.OcmInf" };
            yield return new object?[] { sql.ToLowerInvariant() };
        }
        yield return new object?[] { ClosingSql.DayVisitsSql.Replace("@hospital", "'SYNTHETIC'") };
        yield return new object?[] { ClosingSql.ReservationKindsSql.Replace("@hospital", "'SYNTHETIC'") };
    }

    [Theory(DisplayName = "AC-3606.1 글자를 고친 새 문장은 DB에 닿기 전에 E-BIT-READ-FAILED로 막는다")]
    [MemberData(nameof(ChangedStatements))]
    public void GuardRefusesChangedStatements(string sql)
    {
        Assert.False(ErpReadGuard.IsAllowed(sql));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ErpReadGuard.Require(sql)).Code);
        var db = new FakeDb();
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ErpReadGuard.Query(db, sql, new Dictionary<string, object?>(), TimeSpan.FromSeconds(1))).Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-3606.1 매개변수가 빠지거나·더해지거나·글자가 아니거나·길면 막는다(DB에 닿지 않는다)")]
    public void GuardRefusesBadArguments()
    {
        foreach (var sql in ClosingFake.Statements.Where(sql => ClosingSql.Parameters[sql].Length > 0))
        {
            var missing = ValidArgs(sql);
            missing.Remove(missing.Keys.First());
            var extra = ValidArgs(sql);
            extra["@daily"] = "1";
            var notText = ValidArgs(sql);
            notText[notText.Keys.First()] = 20261109;
            var tooLong = ValidArgs(sql);
            tooLong["@hospital"] = new string('S', 33);

            foreach (var args in new[] { missing, extra, notText, tooLong })
            {
                var db = new FakeDb();
                Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ErpReadGuard.Query(db, sql, args, TimeSpan.FromSeconds(1))).Code);
                Assert.Empty(db.Calls);
            }
        }

        var longCode = ValidArgs(ClosingSql.InjectionFirstSql);
        longCode["@c3"] = new string('C', 21);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ErpReadGuard.Require(ClosingSql.InjectionFirstSql, longCode)).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() =>
            ErpReadGuard.Require(ClosingSql.MemoKindsSql, new Dictionary<string, object?> { ["@day"] = ClosingFake.DayKey })).Code);
    }

    [Fact(DisplayName = "AC-3606.1 새 문장은 기존 관문(Sql.IsAllowed)·청구 Sql.All·매출·통계 목록에 끼지 않고, 그 목록은 그대로 허용된다")]
    public void OtherListsUntouched()
    {
        foreach (var sql in ClosingFake.Statements)
        {
            Assert.False(Sql.IsAllowed(sql));
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql)).Code);
            Assert.DoesNotContain(sql, Sql.All);
            Assert.False(RevenueSql.Parameters.ContainsKey(sql));
            Assert.False(StatsSql.IsAllowed(sql));
        }
        foreach (var sql in RevenueSql.Parameters.Keys) Assert.True(Sql.IsAllowed(sql));
        Assert.True(Sql.IsAllowed(Sql.TrendTotalsSql));
        Assert.True(Sql.IsAllowed(StatsSql.CodeNamesSql));
        Assert.False(Sql.IsAllowed(null));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Sql.ParametersOf("SELECT 1")).Code);
    }

    [Fact(DisplayName = "AC-3606.1 ClosingDay·ClosingCodes가 DB에 보낸 문장은 모두 ErpReadGuard 허용 문장이고 매개변수가 그 문장의 표와 같다")]
    public void ReadsGoThroughGuard()
    {
        var rig = new DayRig()
            .Visit("V001", 1, "1", 40, 1000m, "CARM1", "KK090")
            .Visit("V002", 2, "4", 50, 2000m, "AA222");
        rig.Read(
            ClosingFake.Group("carm", "CARM1"),
            ClosingFake.Group("injection", "KK090"),
            ClosingFake.Group("ptVisit", "AA222"));
        var codes = ClosingFake.Quiet();
        codes.Answer(Sql.TrendTotalsSql, _ => new object?[0][]);
        codes.Answer(StatsSql.CodeNamesSql, _ => new object?[0][]);
        ClosingCodes.Read(codes, Synthetic.Scope, ClosingFake.Day);

        foreach (var call in rig.Db.Calls.Concat(codes.Calls))
        {
            Assert.True(ErpReadGuard.IsAllowed(call.Sql));
            ErpReadGuard.Require(call.Sql, call.Args);
        }
        foreach (var sql in ClosingFake.Statements.Where(sql => sql != ClosingSql.MemoKindsSql)) Assert.Contains(sql, rig.Db.Sqls);
        Assert.Contains(ClosingSql.MemoKindsSql, codes.Sqls);
    }

    [Fact(DisplayName = "AC-3606.1 진료 문장은 모두 같은 진료 조건(외래·접수취소 아님·상태 7개·병원 범위)과 처방 조건(OdrDelFlg·OdrCanYon·OdrOutCod)을 쓴다")]
    public void VisitConditionsAreShared()
    {
        const string visit = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')";
        const string scope = "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";
        const string order = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'";
        foreach (var sql in new[] { ClosingSql.DayVisitsSql, ClosingSql.DayCodesSql, ClosingSql.InjectionFirstSql })
        {
            Assert.Contains(visit, Squash(sql), StringComparison.Ordinal);
            Assert.Contains(scope, Squash(sql), StringComparison.Ordinal);
        }
        foreach (var sql in new[] { ClosingSql.DayCodesSql, ClosingSql.InjectionFirstSql }) Assert.Contains(order, Squash(sql), StringComparison.Ordinal);

        // 주사 처음: 그 전 진료도 같은 진료 조건이다(@from 전)
        var injection = Squash(ClosingSql.InjectionFirstSql);
        Assert.Contains("c.OcmAcpDtm<@from AND " + visit, injection, StringComparison.Ordinal);
        Assert.Equal(2, Regex.Matches(injection, Regex.Escape(scope)).Count);
        Assert.Equal(2, Regex.Matches(injection, Regex.Escape("UPPER(RTRIM(o.OdrCod)) IN (" + string.Join(",", CodeSlots) + ")")).Count);
    }

    // ---- AC-3604.3 처방 줄 금액(TASK-14, 기본값 (사)) ------------------------------------------------

    /// <summary>RevenueSql.CodeAmounts의 줄 금액 식(전체 수가 = 일수 × 수량 × 단가). 마감일지 묶음 금액도 이 식 그대로다.</summary>
    private const string LineAmount = "CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc";

    [Fact(DisplayName = "AC-3604.3 DayCodesSql 금액 칸 = 원내(OdrOspTyp='I') 줄의 일수 × 수량 × 단가 합 — 식이 RevenueSql.CodeAmounts와 같고, 줄 수는 그대로, 매개변수 표도 그대로(@from·@to·@hospital)")]
    public void DayCodesAmountIsCodeAmountsFormula()
    {
        Assert.Contains(LineAmount, Squash(RevenueSql.CodeAmounts), StringComparison.Ordinal);
        Assert.Contains("o.OdrOspTyp = 'I'", Squash(RevenueSql.CodeAmounts), StringComparison.Ordinal);

        var text = Squash(ClosingSql.DayCodesSql);
        Assert.Contains(
            "SELECT o.OdrOcmNum,UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(*) Lines,CAST(SUM(CASE WHEN o.OdrOspTyp='I' THEN " + LineAmount + " END) AS decimal(28,5)) Amount FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum ",
            text,
            StringComparison.Ordinal);
        Assert.Single(Regex.Matches(text, Regex.Escape(LineAmount)).Cast<Match>());
        // 원외 줄도 지금처럼 묶음 사람·줄 수(주사 줄 수)에는 든다: 처방 조건에 OdrOspTyp가 없다
        Assert.DoesNotContain("WHERE o.OdrOspTyp", text, StringComparison.Ordinal);
        Assert.Contains("GROUP BY o.OdrOcmNum,UPPER(RTRIM(o.OdrCod))", text, StringComparison.Ordinal);
        Assert.Equal("@from:Char(12) @to:Char(12) @hospital:VarChar(32)", Shape(ClosingSql.DayCodesSql));
    }

    // ---- AC-3606.2 읽지 않는 칸·내지 않는 칸 ----------------------------------------------------------

    [Fact(DisplayName = "AC-3606.2 새 문장은 이름·전화·주민번호·주소·메모 칸을 읽지 않는다(환자 표에서는 차트번호·생년월일만)")]
    public void ReadsOnlyNeededColumns()
    {
        foreach (var sql in ClosingFake.Statements)
        {
            foreach (var dropped in new[] { "PatNam", "Phn", "Tel", "ResNum", "Jmn", "Adr", "Addr", "Cmt", "Emr", "Sex" })
            {
                Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
            }
            var pbs = Regex.Matches(sql, @"\bPbs[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct();
            Assert.All(pbs, column => Assert.Contains(column, new[] { "PbsInf", "PbsChtNum", "PbsBirDte" }));
        }
        Assert.Contains("PbsBirDte", ClosingSql.DayVisitsSql, StringComparison.Ordinal);
        foreach (var sql in ClosingFake.Statements.Where(sql => sql != ClosingSql.DayVisitsSql)) Assert.DoesNotContain("BirDte", sql, StringComparison.Ordinal);
    }

    /// <summary>문장마다 마지막(바깥) SELECT의 결과 칸 글. 차트번호·생년월일은 그날 번호·만 나이·센 수로만 바뀌어 나온다.</summary>
    public static IEnumerable<object?[]> OutputColumns()
    {
        yield return new object?[]
        {
            ClosingSql.DayVisitsSql,
            "SELECT V.OcmNum,DENSE_RANK() OVER (ORDER BY RTRIM(V.OcmChtNum)) Person,RTRIM(V.OcmDgsNfs) DgsNfs, "
            + "(SELECT MAX(CASE WHEN b.PbsBirDte LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' AND ISDATE(b.PbsBirDte)=1 AND b.PbsBirDte<=@day "
            + "THEN (CONVERT(int,@day)-CONVERT(int,b.PbsBirDte))/10000 END) FROM dbo.PbsInf b WHERE b.PbsChtNum=V.OcmChtNum) Age, "
            + "(SELECT TOP 1 p.OrpTotAmt FROM dbo.OrpInf p WHERE p.OrpOcmNum=V.OcmNum AND p.OrpRcpStt<>'C' ORDER BY p.OrpRcpSeq DESC) Total FROM V ORDER BY V.OcmAcpDtm,V.OcmNum",
        };
        yield return new object?[]
        {
            ClosingSql.DayCodesSql,
            "SELECT o.OdrOcmNum,UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(*) Lines,CAST(SUM(CASE WHEN o.OdrOspTyp='I' THEN " + LineAmount + " END) AS decimal(28,5)) Amount "
            + "FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum ",
        };
        yield return new object?[] { ClosingSql.InjectionFirstSql, "SELECT COUNT_BIG(*) FROM T WHERE NOT EXISTS(" };
        yield return new object?[] { ClosingSql.InpatientSql, "SELECT COUNT_BIG(*) FROM dbo.OcmInf c WHERE " };
        yield return new object?[] { ClosingSql.ReservationKindsSql, "SELECT Kind,COUNT_BIG(*) Total,SUM(Visited) Visited,SUM(Changed) Changed,SUM(Canceled) Canceled FROM R GROUP BY Kind ORDER BY Kind" };
        yield return new object?[] { ClosingSql.ReservationPatientsSql, "SELECT COUNT(DISTINCT NULLIF(RTRIM(r.RsvChtNum),'')) FROM dbo.RsvInf r " };
        yield return new object?[] { ClosingSql.MemoKindsSql, "SELECT RTRIM(DtlCod),RTRIM(DtlCodNam) FROM dbo.DtlMst WHERE DtlTblCod='RESERVMEMO' ORDER BY DtlDspSeq,DtlCod" };
    }

    [Theory(DisplayName = "AC-3606.2 결과 칸에 차트번호·생년월일이 그대로 나오지 않는다(진료번호·그날 번호·만 나이·수·합만)")]
    [MemberData(nameof(OutputColumns))]
    public void OutputsHideChartAndBirth(string sql, string output)
    {
        var text = Squash(sql);
        Assert.Contains(output.Trim(), text, StringComparison.Ordinal);

        // 바깥 SELECT 결과 칸에서 바꿔 내는 식(그날 번호·만 나이·센 수)을 빼면 차트번호·생년월일 칸 이름이 남지 않는다
        var columns = output
            .Replace("DENSE_RANK() OVER (ORDER BY RTRIM(V.OcmChtNum))", "")
            .Replace("COUNT(DISTINCT NULLIF(RTRIM(r.RsvChtNum),''))", "");
        columns = Regex.Replace(columns, @"\(SELECT MAX\(CASE WHEN b\.PbsBirDte .*?\)/10000 END\) FROM dbo\.PbsInf b WHERE b\.PbsChtNum=V\.OcmChtNum\) Age", "");
        Assert.DoesNotContain("ChtNum", columns, StringComparison.Ordinal);
        Assert.DoesNotContain("BirDte", columns, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-3606.2 돈 문장 MoneyExtraSql은 네 합(COO 현금·할인 줄 현금·OrpRcvBil·TPR 현금+카드+계좌)만 내고 차트번호를 쓰지 않는다")]
    public void MoneyExtraIsFourSums()
    {
        var text = Squash(ClosingSql.MoneyExtraSql);
        Assert.DoesNotContain("ChtNum", text, StringComparison.Ordinal);
        Assert.Contains("SUM(r.OrcNewAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod='COO' ", text, StringComparison.Ordinal);
        Assert.Contains("SUM(r.OrcNewAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod IN ('DOD','DOE','DET','DNI','DN1','DN3','DN5') ", text, StringComparison.Ordinal);
        Assert.Contains("SUM(p.OrpRcvBil) FROM dbo.OrpInf p WHERE p.OrpRcpStt<>'C' AND p.OrpAccDte>=@day AND p.OrpAccDte<@nextDay ", text, StringComparison.Ordinal);
        Assert.Contains("SUM(r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod='TPR' ", text, StringComparison.Ordinal);
        Assert.Equal(4, Regex.Matches(text, @"\(SELECT SUM\(").Count);
    }
}
