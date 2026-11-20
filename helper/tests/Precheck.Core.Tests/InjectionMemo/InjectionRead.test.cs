using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.InjectionMemo;
using Precheck.Core.Tests.Bit;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>
/// spec injection-memo REQ-7502 비트 읽기(InjectionSql·InjectionReader·InjectionMemoService). 비트 DB는 가짜(FakeDb),
/// 차트번호·내원 번호·글은 지어낸 것이다.
/// </summary>
public class InjectionReadTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static string[] Both => new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql };

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // 내원 줄: [내원 번호, 접수 시각 yyyyMMddHHmm, 접수 메모]
    private static object?[] VisitRow(string id, string stamp, string? memo) => new object?[] { id, stamp, memo };

    // 증상 줄: [내원 번호, 차례 EmrShtSeq, 글 EmrShtVal]
    private static object?[] LineRow(string id, object seq, string? text) => new object?[] { id, seq, text };

    private static FakeDb Db(object?[][] visits, object?[][] lines) =>
        new FakeDb().Answer(InjectionSql.VisitsSql, _ => visits).Answer(InjectionSql.LinesSql, _ => lines);

    // ── 허용 목록 ─────────────────────────────

    [Fact(DisplayName = "AC-7502.1 문장은 읽기 전용 SELECT 둘(; · 주석 · 쓰기 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다(청구 Sql.All 밖)")]
    public void SqlIsGuardedSelect()
    {
        Assert.Equal(Both.OrderBy(s => s, StringComparer.Ordinal), InjectionSql.All.OrderBy(s => s, StringComparer.Ordinal));
        foreach (var sql in Both)
        {
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(Forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.True(InjectionSql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);
            Assert.False(Precheck.Core.DocPrint.DocSql.IsAllowed(sql));

            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();
            Assert.Equal(new[] { "@cht", "@from", "@to" }, used);
            Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(sql));
            Assert.Equal(InjectionSql.ParametersOf(sql), Sql.ParametersOf(sql));

            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(Sql.IsAllowed(sql.Replace("@cht", "'90001'")));
        }
        Assert.False(InjectionSql.IsAllowed(null));
        Assert.False(InjectionSql.IsAllowed(Sql.ScopesSql));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => InjectionSql.ParametersOf(Sql.ScopesSql)).Code);
        Assert.Equal(TimeSpan.FromSeconds(5), InjectionSql.Timeout);
    }

    [Fact(DisplayName = "AC-7502.1 내원: 그 차트번호의 외래(OcmPatTyp='O' · OcmRsuYon<>'O') @from~@to 접수와 접수 메모 OcmRefCmt, 증상: 그 내원들의 EmrInf EmrShtTyp='S' 줄")]
    public void SqlConditions()
    {
        var visits = InjectionSql.VisitsSql;
        Assert.Contains("LTRIM(RTRIM(b.PbsChtNum))=@cht", visits);
        Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to", visits);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'", visits);
        Assert.Contains("c.OcmRefCmt", visits);
        Assert.DoesNotContain("EmrInf", visits);

        var lines = InjectionSql.LinesSql;
        Assert.Contains("JOIN dbo.EmrInf e ON e.EmrOcmNum=c.OcmNum", lines);
        Assert.Contains("e.EmrShtTyp='S'", lines);
        Assert.Contains("e.EmrShtSeq", lines);
        Assert.Contains("e.EmrShtVal", lines);
        Assert.Contains("LTRIM(RTRIM(b.PbsChtNum))=@cht", lines);
        Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to", lines);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'", lines);
        Assert.DoesNotContain("OcmRefCmt", lines);

        // 이름·주민번호·전화·주소·청구 메모는 읽지 않는다
        foreach (var sql in Both)
        {
            foreach (var column in new[] { "PbsPatNam", "PbsResNum", "Tel", "Adr", "PbsBirDte", "OcmBilCmt" }) Assert.DoesNotContain(column, sql);
        }
    }

    // ── 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7502.1 두 문장을 @cht(정리한 번호)·@from(오늘 30일 앞 0시)·@to(오늘 0시, 오늘 내원 뺌)로 5초 제한, 차례대로 한 번씩")]
    public void ReadsTwoQueriesWithParameters()
    {
        var db = Db(new object?[][] { }, new object?[][] { });
        Assert.Empty(InjectionReader.Read(db, Chart, new DateTime(2026, 11, 20, 15, 30, 0)));
        Assert.Equal(new[] { InjectionSql.VisitsSql, InjectionSql.LinesSql }, db.Sqls.ToArray());
        foreach (var call in db.Calls)
        {
            Assert.Equal(new Dictionary<string, object?> { ["@cht"] = "90001", ["@from"] = "202610210000", ["@to"] = "202611200000" }, call.Args);
            Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
        }
    }

    [Fact(DisplayName = "AC-7502.1 잇기는 메모리에서: 내원마다 증상 줄을 EmrShtSeq 차례로, 줄 없는 내원·빈 메모도 남기고 모르는 내원 줄은 버림")]
    public void JoinsInMemory()
    {
        var db = Db(
            new[]
            {
                VisitRow("V100 ", "202611130930", " 오)무릎 2차 "),
                VisitRow("V200", "202611180900", null),
                VisitRow("V300", "202611190800", "물리치료"),
                VisitRow("V400", "bad", "버림"),
            },
            new[]
            {
                LineRow("V200", 2, "Rt. knee OA"),
                LineRow("V200", "1", "오른쪽 무릎 2차 주사"),
                LineRow("V100 ", 1m, "Lt. shoulder pain"),
                LineRow("V100", 3, null),
                LineRow("V999", 1, "다른 내원"),
            });

        var notes = InjectionReader.Read(db, Chart, Today);
        Assert.Equal(new[] { Day(11, 13), Day(11, 18), Day(11, 19) }, notes.Select(n => n.Date).ToArray());
        Assert.Equal(new[] { "오)무릎 2차", "", "물리치료" }, notes.Select(n => n.ReceptionMemo).ToArray());
        Assert.Equal(new[] { "Lt. shoulder pain", "" }, notes[0].SymptomLines.ToArray());
        Assert.Equal(new[] { "오른쪽 무릎 2차 주사", "Rt. knee OA" }, notes[1].SymptomLines.ToArray());
        Assert.Empty(notes[2].SymptomLines);
    }

    [Fact(DisplayName = "AC-7502.1 틀린 차트번호(빈칸·앞 0·숫자 아님·15자리)는 DB에 묻지 않고 빈 목록")]
    public void BadChartDoesNotQuery()
    {
        var db = Db(new object?[][] { }, new object?[][] { });
        foreach (var chart in new[] { "", " ", "0123", "12a", "123456789012345" }) Assert.Empty(InjectionReader.Read(db, chart, Today));
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-7502.1 읽기 실패·시간 지남은 서비스에서 읽기 실패(Failed)")]
    public void ReadFailureIsFailed()
    {
        var failing = new FakeDb().Fail(InjectionSql.VisitsSql, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => InjectionReader.Read(failing, Chart, Today)).Code);
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(failing, Chart, "", Today).Kind);

        var linesFail = new FakeDb().Answer(InjectionSql.VisitsSql, _ => new[] { VisitRow("V1", "202611130930", "") }).Fail(InjectionSql.LinesSql, BitErrors.ReadFailed);
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(linesFail, Chart, "", Today).Kind);

        var timeout = new FakeDb().Answer(InjectionSql.VisitsSql, _ => throw new TimeoutException());
        var result = InjectionMemoService.Compute(timeout, Chart, "", Today);
        Assert.Equal(MemoResultKind.Failed, result.Kind);
        Assert.Equal("", result.Text);
    }

    [Fact(DisplayName = "AC-7502.1 서비스: 화면 차트번호를 정리(앞 0·빈칸 뺌)해 읽고 규칙대로 넣는 글을 낸다")]
    public void ServiceReadsAndDecides()
    {
        var db = Db(
            new[] { VisitRow("V1", "202611131000", "오)무릎 2차") },
            new[] { LineRow("V1", 1, "오른쪽 무릎 2차 주사 + FNB") });
        var result = InjectionMemoService.Compute(db, " 0090001 ", "", new DateTime(2026, 11, 20, 9, 5, 0));
        Assert.Equal(MemoResultKind.Insert, result.Kind);
        Assert.Equal("오)무릎 3차", result.Text);
        Assert.Equal("오)무릎 3차", result.Append);
        Assert.Equal("90001", db.Calls[0].Args["@cht"]);

        var early = Db(
            new[] { VisitRow("V1", "202611180930", "") },
            new[] { LineRow("V1", 1, "Rt. knee OA"), LineRow("V1", 2, "1주뒤 2차 주사") });
        var tooEarly = InjectionMemoService.Compute(early, Chart, "", Today);
        Assert.Equal(MemoResultKind.TooEarly, tooEarly.Kind);
        Assert.Equal(Day(11, 25), tooEarly.PlannedDate);
        Assert.Equal("", tooEarly.Append);

        Assert.Equal(MemoResultKind.NoRecord, InjectionMemoService.Compute(Db(new object?[][] { }, new object?[][] { }), Chart, "", Today).Kind);
    }

    [Fact(DisplayName = "AC-7502.1 차트번호 칸이 비었거나 숫자가 아니면 DB에 묻지 않고 환자 없음")]
    public void NoPatient()
    {
        var db = Db(new object?[][] { }, new object?[][] { });
        foreach (var chart in new[] { "", "   ", null, "환자", "000" })
        {
            Assert.Equal(MemoResultKind.NoPatient, InjectionMemoService.Compute(db, chart!, "", Today).Kind);
        }
        Assert.Empty(db.Calls);
    }
}
