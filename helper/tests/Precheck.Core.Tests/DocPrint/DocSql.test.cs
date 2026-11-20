using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Chart;
using Precheck.Core.DocPrint.Docs.Detail;
using Precheck.Core.DocPrint.Docs.Receipt;
using Precheck.Core.DocPrint.Docs.RxCopy;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print AC-7405.1(바탕): 서류 SQL 허용 목록(DocSql = 이 TASK 문장 + 서류 4종 &lt;이름&gt;Sql.Allowed),
/// 병원 정보·직인 읽기(HospitalInfo), 서류 4종 목록(DocSources), 서류에 넘기는 값 묶음(DocContext).
/// 병원 값은 지어낸 것이다(가상의원·12345678).
/// </summary>
public class DocSqlTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    private static string[] Own => new[] { DocSql.ChartFindSql, DocSql.NameFindSql, DocSql.FirstVisitSql, DocSql.VisitDaysSql, DocSql.HospitalSql };

    // ── 허용 목록 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 서류 SQL은 모두 매개변수를 받는 읽기 전용 SELECT/WITH 하나(; · 주석 · 쓰기 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다(청구 Sql.All 밖)")]
    public void AllDocSqlIsGuardedSelect()
    {
        Assert.Empty(Own.Except(DocSql.All));
        foreach (var sql in DocSql.All)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(Forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.True(DocSql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);

            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();
            Assert.Equal(Sql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray(), used);
            Assert.Equal(DocSql.ParametersOf(sql), Sql.ParametersOf(sql));
            Assert.NotEmpty(used);

            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(Sql.IsAllowed(sql.Replace(used[0], "'90001'")));
        }
        Assert.False(DocSql.IsAllowed(null));
        Assert.False(DocSql.IsAllowed(Sql.ScopesSql));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => DocSql.ParametersOf(Sql.ScopesSql)).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => DocSql.ParametersOf(null!)).Code);
    }

    [Fact(DisplayName = "AC-7405.1 매개변수 모양: 차트번호 @cht VarChar(14), 이름 @name VarChar(20), 접수 시각 @from·@to Char(12), 날 @day Char(8)")]
    public void ParameterShapes()
    {
        Assert.Equal("@cht:VarChar(14) @to:Char(12)", Shape(DocSql.ChartFindSql));
        Assert.Equal("@name:VarChar(20) @to:Char(12)", Shape(DocSql.NameFindSql));
        Assert.Equal("@cht:VarChar(14)", Shape(DocSql.FirstVisitSql));
        Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(DocSql.VisitDaysSql));
        Assert.Equal("@day:Char(8)", Shape(DocSql.HospitalSql));

        ReadOnlyGuard.Require(DocSql.VisitDaysSql, new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "202611010000", ["@to"] = "202611210000" });
        var longer = new Dictionary<string, object?> { ["@cht"] = "900000000000001", ["@to"] = "202611210000" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(DocSql.ChartFindSql, longer)).Code);
        var extra = new Dictionary<string, object?> { ["@day"] = "20261120", ["@cht"] = "90001" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(DocSql.HospitalSql, extra)).Code);
    }

    [Fact(DisplayName = "AC-7405.1 이 TASK 문장은 환자 표에서 차트번호·이름·생년월일·성별만 읽고 주민번호·전화·주소·메모는 읽지 않는다")]
    public void ReadsOnlyNeededPatientColumns()
    {
        foreach (var sql in Own.Where(s => s != DocSql.HospitalSql))
        {
            var pbs = Regex.Matches(sql, @"\bPbs[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct();
            Assert.Empty(pbs.Except(new[] { "PbsInf", "PbsChtNum", "PbsPatNam", "PbsBirDte", "PbsSexTyp" }));
            foreach (var dropped in new[] { "ResNum", "Phn", "Adr", "RefCmt", "BilCmt", "Emr", "OutPatNam", "OutResNum" })
            {
                Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
            }
        }
        Assert.DoesNotContain("Pbs", DocSql.HospitalSql);
    }

    [Fact(DisplayName = "AC-7405.1 DocSql은 서류 4종 <이름>Sql.Allowed를 모두 모은다(Phase 2가 채우는 허용 목록)")]
    public void CollectsDocumentAllowLists()
    {
        foreach (var allowed in new[] { ReceiptSql.Allowed, DetailSql.Allowed, RxCopySql.Allowed, ChartSql.Allowed })
        {
            foreach (var pair in allowed)
            {
                Assert.Contains(pair.Key, DocSql.All);
                Assert.Equal(pair.Value, DocSql.ParametersOf(pair.Key));
            }
        }
        Assert.Equal(DocSql.All.Count, DocSql.All.Distinct(StringComparer.Ordinal).Count());
    }

    // ── 서류 4종 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 서류 4종 목록은 영수증·세부내역서·처방전 사본·진료기록부 차례로 하나씩")]
    public void SourcesInPrintOrder()
    {
        Assert.Equal(DocNames.All, DocSources.All.Select(s => s.Kind).ToArray());
        Assert.IsType<ReceiptSource>(DocSources.All[0]);
        Assert.IsType<DetailSource>(DocSources.All[1]);
        Assert.IsType<RxCopySource>(DocSources.All[2]);
        Assert.IsType<ChartSource>(DocSources.All[3]);
    }

    // ── 병원 정보·직인 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 병원 정보: HspMst의 그날 유효한 줄에서 이름·요양기관기호·주소·사업자번호·대표자·영수증 이름·전화·팩스·직인 그림(HspSignImg)")]
    public void ReadsHospital()
    {
        var seal = new byte[] { 0x89, 0x50, 0x4E, 0x47 };
        var db = new FakeDb().Answer(DocSql.HospitalSql, _ => new[]
        {
            new object?[] { "가상의원 ", "12345678", "가상시 가상로 1 ", "1234567890", "가상원장", "가상의원(영수증)", "02-000-0000", "02-000-0001 ", seal },
        });

        var hospital = HospitalInfo.Read(db, new DateTime(2026, 11, 20, 9, 30, 0));

        Assert.Equal("가상의원", hospital.Name);
        Assert.Equal("12345678", hospital.InstitutionNumber);
        Assert.Equal("가상시 가상로 1", hospital.Address);
        Assert.Equal("1234567890", hospital.BusinessNumber);
        Assert.Equal("가상원장", hospital.Owner);
        Assert.Equal("가상의원(영수증)", hospital.ReceiptName);
        Assert.Equal("02-000-0000", hospital.Phone);
        Assert.Equal("02-000-0001", hospital.Fax);
        Assert.Equal(seal, hospital.Seal);

        var call = Assert.Single(db.Calls);
        Assert.Equal(DocSql.HospitalSql, call.Sql);
        Assert.Equal(new[] { "@day" }, call.Args.Keys.ToArray());
        Assert.Equal("20261120", call.Args["@day"]);
        var sql = Regex.Replace(DocSql.HospitalSql, @"\s+", " ");
        Assert.Contains("FROM dbo.HspMst WHERE @day BETWEEN HspAdpDte AND HspExpDte", sql);
        Assert.Contains("HspSignImg", sql);
    }

    [Fact(DisplayName = "AC-7405.1 병원 정보: 빈 칸·NULL은 빈 글, 직인 그림이 없거나 0바이트면 null, 줄이 없으면 빈 병원 정보, 읽기 실패는 BitException 그대로")]
    public void HospitalBlanks()
    {
        var blanks = HospitalInfo.Read(new FakeDb().Answer(DocSql.HospitalSql, _ => new[] { new object?[] { null, " ", null, null, null, null, null, null, Array.Empty<byte>() } }), new DateTime(2026, 11, 20));
        Assert.Equal("", blanks.Name);
        Assert.Equal("", blanks.Address);
        Assert.Null(blanks.Seal);

        var textSeal = HospitalInfo.Read(new FakeDb().Answer(DocSql.HospitalSql, _ => new[] { new object?[] { "가상의원", "", "", "", "", "", "", "", "그림 아님" } }), new DateTime(2026, 11, 20));
        Assert.Null(textSeal.Seal);

        var none = HospitalInfo.Read(new FakeDb().Answer(DocSql.HospitalSql, _ => Array.Empty<object?[]>()), new DateTime(2026, 11, 20));
        Assert.Equal("", none.Name);
        Assert.Null(none.Seal);
        Assert.Equal("", HospitalInfo.Empty.InstitutionNumber);

        var failing = new FakeDb().Fail(DocSql.HospitalSql, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => HospitalInfo.Read(failing, new DateTime(2026, 11, 20))).Code);
    }

    // ── 서류에 넘기는 값 묶음 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 DocContext: 차트번호·환자·고른 날(날짜순)·기간·병원 정보·직인·글자 폭 함수(글, pt → mm)·오늘")]
    public void ContextCarriesInputs()
    {
        var seal = new byte[] { 1, 2 };
        var hospital = new HospitalInfo("가상의원", "12345678", "가상시", "1234567890", "가상원장", "가상의원", "02-000-0000", "02-000-0001", seal);
        var patient = new PatientHit("90001", "가상환자01", "19800302", "F", "20261120");
        var measured = new List<(string Text, float Pt)>();
        Func<string, float, float> width = (text, pt) =>
        {
            measured.Add((text, pt));
            return text.Length * pt * 0.25f;
        };
        var days = new[]
        {
            new VisitDay(new DateTime(2026, 11, 10), false, true, new[] { "V2" }),
            new VisitDay(new DateTime(2026, 11, 3), false, false, new[] { "V1", "V0" }),
        };

        var ctx = new DocContext("90001", patient, days, new DateTime(2026, 11, 1), new DateTime(2026, 11, 20), hospital, width, new DateTime(2026, 11, 20, 10, 15, 0));

        Assert.Equal("90001", ctx.Chart);
        Assert.Same(patient, ctx.Patient);
        Assert.Equal(new[] { new DateTime(2026, 11, 3), new DateTime(2026, 11, 10) }, ctx.Days.Select(d => d.Date).ToArray());
        Assert.Equal(new[] { "V1", "V0" }, ctx.Days[0].VisitNums);
        Assert.Equal(new DateTime(2026, 11, 1), ctx.From);
        Assert.Equal(new DateTime(2026, 11, 20), ctx.To);
        Assert.Same(hospital, ctx.Hospital);
        Assert.Same(seal, ctx.Seal);
        Assert.Equal(new DateTime(2026, 11, 20), ctx.Today);
        Assert.Equal(5f, ctx.WidthMm("가상의원", 5));
        Assert.Equal(("가상의원", 5f), measured.Single());

        Assert.Throws<ArgumentNullException>(() => new DocContext("90001", null!, days, ctx.From, ctx.To, hospital, width, ctx.Today));
        Assert.Throws<ArgumentNullException>(() => new DocContext("90001", patient, days, ctx.From, ctx.To, null!, width, ctx.Today));
        Assert.Throws<ArgumentNullException>(() => new DocContext("90001", patient, days, ctx.From, ctx.To, hospital, null!, ctx.Today));
        Assert.Empty(new DocContext("90001", patient, null!, ctx.From, ctx.To, hospital, width, ctx.Today).Days);
    }
}
