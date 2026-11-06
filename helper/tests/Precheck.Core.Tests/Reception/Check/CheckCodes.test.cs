using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Precheck.Core.Tests.Protocol;
using Xunit;
using static Precheck.Core.Tests.Reception.Check.CheckFakes;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 확인 고침 3(TASK-34): 증상 기록지 코드 틀 둘(ProbeSql.SheetHits·SheetCodes, AC-1401.18·AC-1401.9)과 상태 내력 문장(CheckSql.StatusHistory, AC-1401.19).
/// 표·칸 이름(EmrInf·EmrShtTyp·EmrShtCod·EmrShtVal)은 의원 PC 2회차 보고서의 이름이고, 내원번호 칸 이름(EmrOcmNum)과 칸 모양은 지은 것이다.
/// </summary>
public class CheckCodesSqlTests
{
    private const string RxRule = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    internal static ProbeSchema EmrSchema => ProbeSchema.From(new IReadOnlyList<object?>[]
    {
        new object?[] { "EmrInf", "EmrOcmNum", "varchar" },
        new object?[] { "EmrInf", "EmrShtTyp", "varchar" },
        new object?[] { "EmrInf", "EmrShtCod", "varchar" },
        new object?[] { "EmrInf", "EmrShtVal", "text" },
    });

    private static void ReadOnly(string sql)
    {
        foreach (var word in new[] { "INSERT", "UPDATE", "DELETE", "EXEC", "MERGE", "DROP", "ALTER", "INTO", ";" }) Assert.DoesNotContain(word, sql.ToUpperInvariant());
    }

    [Fact(DisplayName = "AC-1401.18 증상 기록지 코드 세기 틀(SheetHits)은 EmrShtVal에 친 글이 든 줄을 (EmrShtTyp, EmrShtCod)마다 15개까지 세고 글 값은 돌려주지 않는다")]
    public void SheetHitsShape()
    {
        var sql = ProbeSql.SheetHits(EmrSchema, "EmrOcmNum");

        Assert.StartsWith("SELECT TOP 15 ", sql, StringComparison.Ordinal);
        Assert.Contains("FROM dbo.[EmrInf] t", sql);
        Assert.Contains("CAST(t.[EmrShtVal] AS nvarchar(max))", sql);
        Assert.Contains("CHARINDEX(@text,", sql);
        Assert.Contains("COUNT_BIG(*) Containing", sql);
        Assert.Contains("WHERE t.[EmrOcmNum] IN (SELECT c.OcmNum FROM dbo.OcmInf c", sql);
        Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'", sql);
        Assert.Contains("d.DepHspNum=@hospital", sql);
        Assert.Contains("GROUP BY t.[EmrShtTyp],t.[EmrShtCod]", sql);
        // 글 칸은 세는 데만 쓴다(CAST 한 곳)
        Assert.Single(Regex.Matches(sql, Regex.Escape("[EmrShtVal]")).Cast<Match>());
        ReadOnly(sql);
    }

    [Fact(DisplayName = "AC-1401.18 기록지 코드 짝 틀(SheetCodes)은 같은 14일 (EmrShtTyp, EmrShtCod) 짝을 줄 수 많은 순 15개까지 줄 수·빈 글 아닌 줄·최소·최대 길이로만 센다(@text 없음)")]
    public void SheetCodesShape()
    {
        var sql = ProbeSql.SheetCodes(EmrSchema, "EmrOcmNum");

        Assert.StartsWith("SELECT TOP 15 ", sql, StringComparison.Ordinal);
        Assert.Contains("COUNT_BIG(*) Total", sql);
        Assert.Contains("NonEmpty", sql);
        Assert.Contains("MIN(", sql);
        Assert.Contains("MAX(", sql);
        Assert.Contains("ORDER BY Total DESC", sql);
        Assert.Contains("GROUP BY t.[EmrShtTyp],t.[EmrShtCod]", sql);
        Assert.Contains("WHERE t.[EmrOcmNum] IN (SELECT c.OcmNum FROM dbo.OcmInf c", sql);
        Assert.Contains("d.DepHspNum=@hospital", sql);
        Assert.DoesNotContain("@text", sql);
        Assert.Single(Regex.Matches(sql, Regex.Escape("[EmrShtVal]")).Cast<Match>());
        ReadOnly(sql);
    }

    [Fact(DisplayName = "AC-1401.9 IsSheetHits·IsSheetCodes는 그 틀로 만든 글만 받고, 고친 글·다른 틀·확인 문장·도우미 문장은 받지 않으며 다른 검사도 이 틀을 받지 않는다")]
    public void OnlyBuiltSheetTextIsAccepted()
    {
        var hits = ProbeSql.SheetHits(EmrSchema, "EmrOcmNum");
        var codes = ProbeSql.SheetCodes(EmrSchema, "EmrOcmNum");

        Assert.True(ProbeSql.IsSheetHits(hits));
        Assert.True(ProbeSql.IsSheetCodes(codes));
        Assert.False(ProbeSql.IsSheetHits(codes));
        Assert.False(ProbeSql.IsSheetCodes(hits));
        foreach (var sql in new[] { hits, codes })
        {
            Assert.False(ProbeSql.IsProbe(sql));
            Assert.False(ProbeSql.IsTextCount(sql));
            Assert.False(CheckSql.IsAllowed(sql));
            Assert.False(Sql.IsAllowed(sql));
        }

        foreach (var bad in new[]
        {
            null, "", hits + " ", hits + ";DELETE FROM dbo.OcmInf", hits.Replace("[EmrOcmNum]", "[EmrOcmNum];DROP TABLE x--"),
            hits.Replace("@text", "'a'"), hits.Replace("TOP 15", "TOP 1500"), hits.Replace("dbo.[EmrInf]", "dbo.[OcmInf]"),
            ProbeSql.TextCount(EmrSchema, "EmrInf", "EmrOcmNum", "EmrShtVal"), CheckSql.StatusPairs,
        })
        {
            Assert.False(ProbeSql.IsSheetHits(bad));
            Assert.False(ProbeSql.IsSheetCodes(bad));
        }
        Assert.False(ProbeSql.IsSheetCodes(codes.Replace("ORDER BY Total DESC", "ORDER BY Total")));
    }

    [Theory(DisplayName = "AC-1401.9 이름표에 없거나 모양이 틀린 내원번호 칸, 이름표에 없는 기록지 칸이면 DB에 닿기 전에 E-BIT-READ-FAILED")]
    [InlineData("EmrNum", false)]
    [InlineData("EmrOcmNum]", false)]
    [InlineData("EmrOcmNum", true)]
    public void UnknownNamesBlocked(string visit, bool dropCode)
    {
        var schema = dropCode
            ? ProbeSchema.From(new IReadOnlyList<object?>[] { new object?[] { "EmrInf", "EmrOcmNum", "varchar" }, new object?[] { "EmrInf", "EmrShtVal", "text" } })
            : EmrSchema;

        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.SheetHits(schema, visit)).Code);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.SheetCodes(schema, visit)).Code);
    }

    [Fact(DisplayName = "AC-1401.9 CheckBitDb는 실행 전에 IsSheetHits(친 글 매개변수 표)·IsSheetCodes(그날 범위 매개변수 표)로 기록지 코드 틀을 받는다")]
    public void BitDbAcceptsSheetTemplates()
    {
        var source = File.ReadAllText(Repo.PathOf("helper", "src", "Precheck.Windows", "CheckBitDb.cs"));
        var code = Regex.Replace(source, @"//.*$", "", RegexOptions.Multiline);

        Assert.Matches(@"ProbeSql\.IsSheetHits\(sql\)\)\s*\{\s*declared = ProbeSql\.TextCountParameters;", code);
        Assert.Matches(@"ProbeSql\.IsSheetCodes\(sql\)\)\s*\{\s*declared = ProbeSql\.Parameters;", code);
    }

    [Fact(DisplayName = "AC-1401.19 상태 내력 문장(CheckSql.StatusHistory)은 허용된 확인 문장이고 그날 범위·등록 병원 범위로 상태마다 접수·수납 줄 있음·처방 있음만 센다")]
    public void StatusHistoryShape()
    {
        var sql = CheckSql.StatusHistory;
        var text = Regex.Replace(sql, @"\s+", " ");

        Assert.True(CheckSql.IsAllowed(sql));
        Assert.Equal(new[] { "@from", "@to", "@hospital" }, CheckSql.ParametersOf(sql).Select(p => p.Name));
        Assert.StartsWith("SELECT RTRIM(c.OcmComStt) Status,COUNT_BIG(*) Visits,COUNT_BIG(p.Hit) WithReceipt,COUNT_BIG(r.Hit) WithRx FROM dbo.OcmInf c", text, StringComparison.Ordinal);
        Assert.Contains("OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OrcInf o WHERE o.OrcOcmNum=c.OcmNum) p", text);
        Assert.Contains("OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OdrInf o WHERE o.OdrOcmNum=c.OcmNum AND " + RxRule + ") r", text);
        Assert.Contains(RxRule, Regex.Replace(CheckSql.RxByStatus, @"\s+", " "));
        Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'", text);
        Assert.Contains("d.DepHspNum=@hospital", text);
        Assert.Contains("GROUP BY RTRIM(c.OcmComStt)", text);
        Assert.DoesNotContain("OcmChtNum", text);
        ReadOnly(sql);
    }

    [Theory(DisplayName = "AC-1401.18 기록지 코드 칸(CheckField.Code)은 영문·숫자 1~16자 모양만 적고(숫자만이면 5자까지) 그 밖은 ?다")]
    [InlineData("CC01", "CC01")]
    [InlineData("S_1", "S_1")]
    [InlineData("12345", "12345")]
    [InlineData("123456", "?")]
    [InlineData("ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOP")]
    [InlineData("ABCDEFGHIJKLMNOPQ", "?")]
    [InlineData("가상환자07", "?")]
    [InlineData("GASANG HWANJA", "?")]
    [InlineData("010-9000-0007", "?")]
    [InlineData("CC01\n", "?")]
    [InlineData("", "?")]
    [InlineData(null, "?")]
    public void CodeShape(string? value, string expected)
    {
        Assert.Equal("typ=" + expected, CheckField.Code("typ", value).ToString());
    }

    [Fact(DisplayName = "AC-1401.18 기록지 코드 칸은 정수 형이면 그 숫자 글(5자까지), 소수·그 밖의 형은 ?다")]
    public void CodeNumbers()
    {
        Assert.Equal("12", CheckField.Code(null, 12).ToString());
        Assert.Equal("7", CheckField.Code(null, (short)7).ToString());
        Assert.Equal("?", CheckField.Code(null, 900007).ToString());
        Assert.Equal("?", CheckField.Code(null, 1.5).ToString());
        Assert.Equal("?", CheckField.Code(null, true).ToString());
    }
}

/// <summary>확인 고침 3 단계(AC-1401.18·19): 6/10 symptomCode, 7/10 sheetCodes, 8/10 statusHistory, 첫 줄 build=판+check4.</summary>
public class CheckCodesRunnerTests
{
    private const string Typed = " 허리  통증 ";

    private static readonly object?[][] Emr =
    {
        Col("EmrInf", "EmrOcmNum", "varchar", 12),
        Col("EmrInf", "EmrShtTyp", "varchar", 4),
        Col("EmrInf", "EmrShtCod", "varchar", 10),
        Col("EmrInf", "EmrShtVal", "text", 2147483647),
    };

    private static ProbeSchema FullSchema => ProbeSchema.From(MainColumns.Concat(LinkedColumns).Concat(Emr));

    private static string Hits => ProbeSql.SheetHits(FullSchema, "EmrOcmNum");

    private static string Codes => ProbeSql.SheetCodes(FullSchema, "EmrOcmNum");

    private static Harness WithEmr()
    {
        var h = new Harness();
        h.Db.Answer(CheckSql.LinkedColumns, LinkedColumns.Concat(Emr).ToArray());
        h.Db.Answer(Hits, new object?[] { "S1", "CC01", 3L }, new object?[] { "S2", "PI", 1L });
        h.Db.Answer(Codes, new object?[] { "S1", "CC01", 120L, 100L, 2L, 72L }, new object?[] { "S9", "X", 5L, 0L, null, null });
        h.Db.Answer(CheckSql.StatusHistory, new object?[] { "WR", 40L, 0L, 0L }, new object?[] { "PN", 300L, 298L, 290L });
        h.Console.Answer = last => last.Contains("증상 글(") ? Typed : "";
        return h;
    }

    [Fact(DisplayName = "AC-1401.18 6/10은 친 글(공백 뺌)로 EmrShtVal에 그 글이 든 줄을 (EmrShtTyp, EmrShtCod)마다 symptomCode 줄로 적고, 친 글은 @text로만 보낸다")]
    public void SymptomCodeLines()
    {
        using var h = WithEmr();

        var lines = Harness.Lines(h.Run());

        Assert.Contains("symptomCode typ=S1 cod=CC01 containing=3", lines);
        Assert.Contains("symptomCode typ=S2 cod=PI containing=1", lines);
        var calls = h.Db.Calls.Where(c => c.Sql == Hits).ToList();
        Assert.Single(calls);
        Assert.Equal("허리통증", calls[0].Args["@text"]);
        Assert.Equal(Stamp(Today.AddDays(-14)), calls[0].From);
        Assert.Equal(Stamp(Today.AddDays(1)), calls[0].Args["@to"]);
        Assert.Equal(Hospital, calls[0].Args["@hospital"]);
        // 증상 칸 줄 다음, 7/10 앞
        var last = Array.FindLastIndex(lines, l => l.StartsWith("symptom col=", StringComparison.Ordinal));
        var first = Array.FindIndex(lines, l => l.StartsWith("symptomCode ", StringComparison.Ordinal));
        Assert.True(last >= 0 && first > last);
        Assert.True(first < Array.FindIndex(lines, l => l.StartsWith("sheetCodes ", StringComparison.Ordinal)));
        var text = string.Join("\n", lines);
        Assert.DoesNotContain("허리", text);
        Assert.DoesNotContain("허리", h.Console.Text);
    }

    [Fact(DisplayName = "AC-1401.18 7/10 sheetCodes는 같은 14일 기록지 코드 짝마다 sheetCode 줄(줄 수·빈 글 아닌 줄·최소·최대 길이)을 적고 친 글은 보내지 않는다")]
    public void SheetCodeLines()
    {
        using var h = WithEmr();

        var lines = Harness.Lines(h.Run());

        Assert.Contains("sheetCodes days=14", lines);
        Assert.Contains("sheetCode typ=S1 cod=CC01 rows=120 nonEmpty=100 minLength=2 maxLength=72", lines);
        Assert.Contains("sheetCode typ=S9 cod=X rows=5 nonEmpty=0 minLength=? maxLength=?", lines);
        var call = Assert.Single(h.Db.Calls, c => c.Sql == Codes);
        Assert.False(call.Args.ContainsKey("@text"));
        Assert.Equal(Stamp(Today.AddDays(-14)), call.From);
        Assert.Equal(Stamp(Today.AddDays(1)), call.Args["@to"]);
    }

    [Theory(DisplayName = "AC-1401.18 친 글이 없으면 symptomCode 건너뜀이고 세기 문장을 돌리지 않지만 sheetCodes는 돈다")]
    [InlineData("")]
    [InlineData(" 허 ")]
    [InlineData(null)]
    public void SymptomCodeSkipped(string? typed)
    {
        using var h = WithEmr();
        h.Console.Answer = last => last.Contains("증상 글(") ? typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains("symptomCode 건너뜀", lines);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql == Hits);
        Assert.Contains("sheetCode typ=S1 cod=CC01 rows=120 nonEmpty=100 minLength=2 maxLength=72", lines);
    }

    [Fact(DisplayName = "AC-1401.18 칸 목록에 EmrInf 내원번호 칸·EmrShtTyp·EmrShtCod·EmrShtVal이 없으면 symptomCode·sheetCodes를 result=missing으로 적고 문장을 돌리지 않는다")]
    public void MissingColumns()
    {
        using var h = new Harness();
        h.Console.Answer = last => last.Contains("증상 글(") ? Typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains("symptomCode result=missing", lines);
        Assert.Contains("sheetCodes result=missing", lines);
        Assert.DoesNotContain(h.Db.Calls, c => ProbeSql.IsSheetHits(c.Sql) || ProbeSql.IsSheetCodes(c.Sql));
    }

    [Fact(DisplayName = "AC-1401.19 8/10 statusHistory는 지난 30일(@from = 오늘-30일, @to = 내일, 등록 병원) 상태마다 접수·수납 줄 있음·처방 있음을 적는다")]
    public void StatusHistoryLines()
    {
        using var h = WithEmr();

        var lines = Harness.Lines(h.Run());

        Assert.Contains("statusHistory days=30", lines);
        Assert.Contains("statusHistory status=WR visits=40 withReceipt=0 withRx=0", lines);
        Assert.Contains("statusHistory status=PN visits=300 withReceipt=298 withRx=290", lines);
        var call = Assert.Single(h.Db.Calls, c => c.Sql == CheckSql.StatusHistory);
        Assert.Equal(Stamp(Today.AddDays(-30)), call.From);
        Assert.Equal(Stamp(Today.AddDays(1)), call.Args["@to"]);
        Assert.Equal(Hospital, call.Args["@hospital"]);
    }

    [Fact(DisplayName = "AC-1401.19 statusHistory 문장이 실패하면 실패(번호)로 적고 모양·빠르기로 간다")]
    public void StatusHistoryFailureContinues()
    {
        using var h = WithEmr();
        h.Db.OnQuery = call =>
        {
            if (call.Sql == CheckSql.StatusHistory) throw new SqlException(207);
        };

        var lines = Harness.Lines(h.Run());

        Assert.Contains("statusHistory result=실패(SqlException 207)", lines);
        Assert.Contains(lines, l => l.StartsWith("shape col=", StringComparison.Ordinal));
        Assert.Contains(lines, l => l.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.19 보고서 첫 줄은 build=도우미 판+check4이고 콘솔 단계 표시는 1/10~10/10(7/10 기록지 코드, 8/10 상태 내력)이다")]
    public void HeaderAndSteps()
    {
        using var h = WithEmr();
        string path;
        using (var report = CheckReport.Create(Path.Combine(h.Folder, "app"), Path.Combine(h.Folder, "temp"), h.Clock.Now))
        {
            path = report.FilePath;
            new CheckRunner(h.Console, h.Db.Open, () => null, h.Screen.Read, report, h.Clock.Read, "0.3.0").Run();
        }
        var lines = Harness.Lines(File.ReadAllText(path).TrimStart('﻿'));

        Assert.Equal("reception-check started=2026-11-05T10:03 build=0.3.0+check4", lines[0]);
        var steps = h.Console.Written.Where(l => Regex.IsMatch(l, @"^\d+/\d+ ")).Select(l => l.Split(' ')[0]).ToArray();
        Assert.Equal(new[] { "1/10", "2/10", "3/10", "4/10", "5/10", "6/10", "7/10", "8/10", "9/10", "10/10" }, steps);
        Assert.Contains(h.Console.Written, l => l.StartsWith("7/10 ", StringComparison.Ordinal) && l.Contains("기록지"));
        Assert.Contains(h.Console.Written, l => l.StartsWith("8/10 ", StringComparison.Ordinal) && l.Contains("30일"));
    }

    [Fact(DisplayName = "AC-1401.10 기록지 코드·상태 내력 답이 모두 센티널이어도 보고서·콘솔 기록에 센티널이 없다")]
    public void SentinelsNotWritten()
    {
        using var h = WithEmr();
        object?[] Row(int width) => Enumerable.Range(0, width).Select(i => (object?)Sentinels.All[i % Sentinels.All.Length]).ToArray();
        h.Db.Answer(Hits, Row(3), Row(3));
        h.Db.Answer(Codes, Row(6), Row(6));
        h.Db.Answer(CheckSql.StatusHistory, Row(4));
        h.Console.Answer = last => last.Contains("증상 글(") ? Sentinels.KoreanName : "";

        var report = h.Run();

        Sentinels.Absent(report);
        Sentinels.Absent(h.Console.Text);
        Assert.Contains("symptomCode typ=? cod=? containing=?", Harness.Lines(report));
        Assert.Contains("statusHistory status=? visits=? withReceipt=? withRx=?", Harness.Lines(report));
    }
}
