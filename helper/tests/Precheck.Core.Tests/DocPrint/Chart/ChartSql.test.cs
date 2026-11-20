using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Chart;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Chart;

/// <summary>
/// spec doc-print AC-7405.1(진료기록부): ChartSql 허용 목록. 비트 BITPrintChart가 읽는 표·조건(notes/bit-docs.md §5, DLL 안 SQL 글)을
/// 읽기 전용 매개변수 문장으로만 읽는다.
/// </summary>
public class ChartSqlTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    private static string Flat(string sql) => Regex.Replace(sql, @"\s+", " ");

    /// <summary>그 표를 읽는 문장 하나(표 이름으로 찾는다).</summary>
    private static string Reading(string table) => Assert.Single(ChartSql.Allowed.Keys, sql => sql.Contains("dbo." + table));

    private static string PatientSql => Assert.Single(ChartSql.Allowed.Keys, sql => !sql.Contains("dbo.OcmInf"));

    private static string VisitSql => Assert.Single(ChartSql.Allowed.Keys, sql =>
        sql.Contains("dbo.OcmInf") && !new[] { "dbo.EmrInf", "dbo.OicInf", "dbo.OdrInf", "dbo.OrpInf" }.Any(sql.Contains));

    [Fact(DisplayName = "AC-7405.1 진료기록부 SQL 6개(환자·내원·기록·상병·처방·수납)는 모두 읽기 전용 SELECT 하나(; · 주석 · 쓰기 낱말 · \\r 없음)이고 DocSql·Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다")]
    public void AllChartSqlIsGuardedSelect()
    {
        Assert.Equal(6, ChartSql.Allowed.Count);
        foreach (var table in new[] { "EmrInf", "OicInf", "OdrInf", "OrpInf" }) Reading(table);
        Assert.NotNull(PatientSql);
        Assert.NotNull(VisitSql);
        foreach (var sql in ChartSql.Allowed.Keys)
        {
            Assert.StartsWith("SELECT ", sql);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(Forbidden, sql);
            Assert.True(DocSql.IsAllowed(sql));
            Assert.True(Sql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);
            Assert.Equal(ChartSql.Allowed[sql], Sql.ParametersOf(sql));

            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();
            Assert.Equal(Sql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray(), used);
            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(Sql.IsAllowed(sql.Replace("@cht", "'90001'")));
        }
    }

    [Fact(DisplayName = "AC-7405.1 매개변수 모양: 환자는 @cht VarChar(14)만, 내원·기록·상병·처방·수납은 @cht와 접수 시각 @from·@to Char(12)")]
    public void ParameterShapes()
    {
        Assert.Equal("@cht:VarChar(14)", Shape(PatientSql));
        foreach (var sql in ChartSql.Allowed.Keys.Where(s => s != PatientSql))
        {
            Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(sql));
            Assert.Contains("LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to", Flat(sql));
        }

        ReadOnlyGuard.Require(VisitSql, new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "202611030000", ["@to"] = "202611110000" });
        var longer = new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "2026110300000", ["@to"] = "202611110000" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(VisitSql, longer)).Code);
    }

    [Fact(DisplayName = "AC-7405.1 환자 표에서는 차트번호와 주민번호 앞 7자리(생년월일·성별 숫자)만 읽고 이름·주소·전화·메모는 읽지 않는다")]
    public void ReadsOnlyNeededPatientColumns()
    {
        Assert.Contains("LEFT(REPLACE(b.PbsResNum,'-',''),7)", PatientSql);
        foreach (var sql in ChartSql.Allowed.Keys)
        {
            var pbs = Regex.Matches(sql, @"\bPbs[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct();
            Assert.Empty(pbs.Except(new[] { "PbsInf", "PbsChtNum", "PbsResNum" }));
            Assert.Equal(sql == PatientSql ? 1 : 0, Regex.Matches(sql, "PbsResNum").Count);
            foreach (var dropped in new[] { "PatNam", "Adr", "Phn", "CelPhn", "TelNum", "Cmt" })
            {
                Assert.DoesNotContain(dropped, sql.Replace("OdrSplCmt", ""), StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact(DisplayName = "AC-7405.1 비트 진료기록부와 같은 조건: 기록은 접수·EmrShtSeq 차례, 상병은 배제(3) 빼고 주상병 먼저, 처방은 삭제·취소·묶음 머리(Y·G) 빼고 처방 시각 차례, 수납은 PN·미수입금(C) 빼고 최근 줄 먼저·RCV 수납액·DOD/DOE/DET 할인액")]
    public void SameConditionsAsBit()
    {
        var notes = Flat(Reading("EmrInf"));
        Assert.Contains("JOIN dbo.EmrInf e ON e.EmrOcmNum=c.OcmNum", notes);
        Assert.Matches(@"ORDER BY c\.OcmAcpDtm,c\.OcmNum,.*e\.EmrShtSeq$", notes);

        var dx = Flat(Reading("OicInf"));
        Assert.Contains("JOIN dbo.OicInf i ON i.OicOcmNum=c.OcmNum", dx);
        Assert.Contains("ISNULL(i.OicIcdPri,'')<>'3'", dx);
        Assert.Contains("CASE ISNULL(i.OicIcdPri,'') WHEN '' THEN '2' ELSE i.OicIcdPri END", dx);
        Assert.Matches(@"ORDER BY c\.OcmAcpDtm,c\.OcmNum,.*i\.OicSeq$", dx);

        var orders = Flat(Reading("OdrInf"));
        Assert.Contains("JOIN dbo.OdrInf o ON o.OdrOcmNum=c.OcmNum", orders);
        Assert.Contains("o.OdrDelFlg='N' AND o.OdrCanYon='N' AND ISNULL(o.OdrOspTyp,'') NOT IN ('Y','G')", orders);
        Assert.Contains("o.OdrSlpNum", orders);
        Assert.Matches(@"ORDER BY c\.OcmAcpDtm,c\.OcmNum,o\.OdrDtm,.*o\.OdrSeq$", orders);
        Assert.DoesNotContain("OdrAmt", orders);

        var pays = Flat(Reading("OrpInf"));
        Assert.Contains("JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum", pays);
        Assert.Contains("c.OcmComStt='PN' AND ISNULL(p.OrpRcpStt,'')<>'C'", pays);
        Assert.Contains("p.OrpAccDte,p.OrpTotAmt,p.OrpTotOwn", pays);
        Assert.Contains("r.OrcOrpNum=p.OrpRcpNum AND r.OrcOcmNum=p.OrpOcmNum AND r.OrcCod='RCV'", pays);
        Assert.Contains("r.OrcCod IN ('DOD','DOE','DET')", pays);
        Assert.Contains("SUM(r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt)", pays);
        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum,p.OrpAccDte DESC,p.OrpRcpSeq DESC", pays);

        var visits = Flat(VisitSql);
        Assert.Contains("DepKorNam", visits);
        Assert.Contains("UidNam", visits);
        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum", visits);
    }
}
