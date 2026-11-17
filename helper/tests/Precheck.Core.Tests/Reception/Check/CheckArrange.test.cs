using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Check;
using Precheck.Core.Tests.Protocol;
using Xunit;
using static Precheck.Core.Tests.Reception.Check.CheckFakes;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 의원 PC 확인 한 단계 더(spec reception-arrange design.md 3절, REQ-3302, TASK-2): 어레인지 처방 코드 표(CheckSql.ArrangeCodes + 코드 사전 RxNames)와
/// SONO·C-ARM 부위 칸 찾기(ProbeSql.OrderTextCount). 코드·이름은 코드 사전의 글이라 정해 둔 모양일 때만 적고(AC-3302.3), 부위 칸은 숫자만 적는다(AC-3302.4).
/// 표·칸 이름(OdrInf·OdrCod…)은 이 저장소에 이미 쓰인 이름이고, 부위 후보 칸 이름(OdrSite·OdrRmk)은 시험용으로 지은 것이다.
/// </summary>
public class CheckArrangeSqlTests
{
    private const string RxRule = "o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    private const string Scope = "c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'";

    internal static ProbeSchema OrderSchema => ProbeSchema.From(new IReadOnlyList<object?>[]
    {
        new object?[] { "OdrInf", "OdrOcmNum", "varchar" },
        new object?[] { "OdrInf", "OdrCod", "varchar" },
        new object?[] { "OdrInf", "OdrSite", "varchar" },
        new object?[] { "OdrInf", "OdrRmk", "text" },
        new object?[] { "OdrInf", "OdrQty", "numeric" },
        new object?[] { "OcmInf", "OcmMemo", "varchar" },
    });

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static void ReadOnly(string sql)
    {
        foreach (var word in new[] { "INSERT", "UPDATE", "DELETE", "EXEC", "MERGE", "DROP", "ALTER", "INTO", ";", "--", "/*" }) Assert.DoesNotContain(word, sql.ToUpperInvariant());
    }

    [Fact(DisplayName = "AC-3302.2 코드 표 문장(CheckSql.ArrangeCodes)은 허용된 확인 문장이고 그날 범위 매개변수(@from·@to·@hospital)를 받으며 도우미 허용 목록에는 없다")]
    public void ArrangeCodesAllowed()
    {
        Assert.True(CheckSql.IsAllowed(CheckSql.ArrangeCodes));
        Assert.Contains(CheckSql.ArrangeCodes, CheckSql.All);
        Assert.Equal(new[] { "@from:Char:12", "@to:Char:12", "@hospital:VarChar:32" }, CheckSql.ParametersOf(CheckSql.ArrangeCodes).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        Assert.False(Sql.IsAllowed(CheckSql.ArrangeCodes));
        Assert.False(ProbeSql.IsProbe(CheckSql.ArrangeCodes));
    }

    [Fact(DisplayName = "AC-3302.2 코드 표 문장은 범위 안 이 병원 외래 접수의 처방 줄(RxRow)을 코드(대문자)마다 내원 수·처방 줄 수로 세어 내원 수 많은 순 200줄까지 준다")]
    public void ArrangeCodesShape()
    {
        var text = Squash(CheckSql.ArrangeCodes);

        Assert.StartsWith("SELECT TOP 200 UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(DISTINCT o.OdrOcmNum) Visits,COUNT_BIG(*) RxRows FROM dbo.OdrInf o JOIN dbo.OcmInf c ON c.OcmNum=o.OdrOcmNum WHERE ", text, StringComparison.Ordinal);
        Assert.Contains(Scope, text);
        Assert.Contains("d.DepHspNum=@hospital", text);
        Assert.Contains(RxRule, text);
        Assert.EndsWith("GROUP BY UPPER(RTRIM(o.OdrCod)) ORDER BY Visits DESC,Code", text, StringComparison.Ordinal);
        // 차트번호·메모·증상·날짜 칸은 읽지 않는다
        foreach (var column in new[] { "OcmChtNum", "OcmRefCmt", "EmrShtVal", "OdrDtm", "OdrCodNam" }) Assert.DoesNotContain(column, text);
        ReadOnly(CheckSql.ArrangeCodes);
    }

    [Fact(DisplayName = "AC-3302.4 부위 칸 찾기 틀(OrderTextCount)은 SONO1·CARM1 처방 줄(범위·병원·RxRow)의 그 칸을 빈 글 아닌 줄 수·서로 다른 값 수로만 센다(값은 돌려주지 않는다)")]
    public void OrderTextCountShape()
    {
        var sql = ProbeSql.OrderTextCount(OrderSchema, "OdrSite");
        var text = Squash(sql);

        Assert.StartsWith("SELECT COUNT_BIG(CASE WHEN LEN(v.Val)>0 THEN 1 END) Filled,COUNT_BIG(DISTINCT NULLIF(v.Val,N'')) Kinds FROM dbo.OdrInf o JOIN dbo.OcmInf c ON c.OcmNum=o.OdrOcmNum ", text, StringComparison.Ordinal);
        Assert.Contains("CROSS APPLY (SELECT LTRIM(RTRIM(CAST(o.[OdrSite] AS nvarchar(4000)))) Val) v", text);
        Assert.Contains(Scope, text);
        Assert.Contains("d.DepHspNum=@hospital", text);
        Assert.Contains(RxRule, text);
        Assert.EndsWith("AND UPPER(RTRIM(o.OdrCod)) IN ('SONO1','CARM1')", text, StringComparison.Ordinal);
        // 칸 이름은 CAST 한 곳에만 들어간다
        Assert.Single(Regex.Matches(sql, Regex.Escape("[OdrSite]")).Cast<Match>());
        ReadOnly(sql);
    }

    [Fact(DisplayName = "AC-3302.4 부위 칸 찾기의 코드(SONO1·CARM1)는 지금 지도(ArrangeMap)가 sono·carm에 넣는 코드다")]
    public void OrderTextCountCodesMatchMap()
    {
        Assert.Equal(ArrangeKeys.Sono, ArrangeMap.Match("SONO1", null));
        Assert.Equal(ArrangeKeys.Carm, ArrangeMap.Match("CARM1", null));
    }

    [Fact(DisplayName = "AC-3302.4 IsProbe는 OrderTextCount로 만든 글만 받고(그날 범위 매개변수 표), 고친 글·다른 검사는 받지 않는다")]
    public void OnlyBuiltOrderTextIsAccepted()
    {
        var sql = ProbeSql.OrderTextCount(OrderSchema, "OdrRmk");

        Assert.True(ProbeSql.IsProbe(sql));
        Assert.Equal(new[] { "@from", "@to", "@hospital" }, ProbeSql.Parameters.Select(p => p.Name));
        Assert.False(ProbeSql.IsTextCount(sql));
        Assert.False(ProbeSql.IsSheetHits(sql));
        Assert.False(ProbeSql.IsSheetCodes(sql));
        Assert.False(CheckSql.IsAllowed(sql));
        Assert.False(Sql.IsAllowed(sql));

        foreach (var bad in new[]
        {
            sql + " ", sql + ";DELETE FROM dbo.OcmInf", sql.Replace("[OdrRmk]", "[OdrRmk];DROP TABLE x--"), sql.Replace("[OdrRmk]", "[Odr Rmk]"),
            sql.Replace("'SONO1','CARM1'", "'SONO1','CARM1','X'"), sql.Replace("COUNT_BIG(DISTINCT", "MAX(DISTINCT"), sql.Replace("dbo.OdrInf o", "dbo.PbsInf o"),
            sql.Replace("@hospital", "'9001'"),
        })
        {
            Assert.False(ProbeSql.IsProbe(bad));
        }
    }

    [Theory(DisplayName = "AC-3302.4 이름표에 없거나 글자형이 아니거나 모양이 틀린 칸이면 DB에 닿기 전에 E-BIT-READ-FAILED")]
    [InlineData("OdrNone")]
    [InlineData("OdrQty")]
    [InlineData("OcmMemo")]
    [InlineData("OdrSite]")]
    [InlineData("")]
    public void UnknownColumnsBlocked(string column)
    {
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ProbeSql.OrderTextCount(OrderSchema, column)).Code);
    }

    [Theory(DisplayName = "AC-3302.3 처방 코드 칸(CheckField.RxCode)은 ^[0-9A-Za-z가-힣_]{1,16}$ 글자일 때만 그대로, 아니면 ?")]
    [InlineData("SONO1", "SONO1")]
    [InlineData("G1234", "G1234")]
    [InlineData("도수", "도수")]
    [InlineData("ESWT_2", "ESWT_2")]
    [InlineData("ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOP")]
    [InlineData("ABCDEFGHIJKLMNOPQ", "?")]
    [InlineData("X-RAY", "?")]
    [InlineData("A B", "?")]
    [InlineData("SONO1\n", "?")]
    [InlineData("a=b", "?")]
    [InlineData("", "?")]
    [InlineData(null, "?")]
    public void RxCodeShape(string? value, string expected)
    {
        Assert.Equal("code=" + expected, CheckField.RxCode("code", value).ToString());
    }

    [Fact(DisplayName = "AC-3302.3 처방 코드 칸은 글자 형만 받는다(숫자 형은 ?)")]
    public void RxCodeNumbers()
    {
        Assert.Equal("?", CheckField.RxCode(null, 12345).ToString());
        Assert.Equal("?", CheckField.RxCode(null, 1.5).ToString());
    }

    [Theory(DisplayName = "AC-3302.3 처방 이름 칸(CheckField.RxName)은 ^[0-9A-Za-z가-힣 ()\\[\\]/.,·+\\-%]{1,40}$이고 글자(영문·한글)가 하나 이상일 때만(앞뒤 공백 뗌), 아니면 ?")]
    [InlineData("흉부 X-ray 2매", "흉부 X-ray 2매")]
    [InlineData("  어깨 초음파(SONO) ", "어깨 초음파(SONO)")]
    [InlineData("C-ARM [1/2] 50%·+.,", "C-ARM [1/2] 50%·+.,")]
    [InlineData("010-9000-0007", "?")]
    [InlineData("900007", "?")]
    [InlineData("이름:값", "?")]
    [InlineData("a=b", "?")]
    [InlineData("<b>", "?")]
    [InlineData("두 줄\n이름", "?")]
    [InlineData("   ", "?")]
    [InlineData(null, "?")]
    public void RxNameShape(string? value, string expected)
    {
        Assert.Equal("name=" + expected, CheckField.RxName("name", value).ToString());
    }

    [Fact(DisplayName = "AC-3302.3 처방 이름 칸은 40글자까지 적고 41글자부터 ?다")]
    public void RxNameLength()
    {
        Assert.Equal(new string('가', 40), CheckField.RxName(null, new string('가', 40)).ToString());
        Assert.Equal("?", CheckField.RxName(null, new string('가', 41)).ToString());
    }

    [Fact(DisplayName = "AC-3302.2 칸 이름 칸(CheckField.Arrange)은 지도가 넣는 칸의 JSON 이름, 없으면 -")]
    public void ArrangeColumnField()
    {
        Assert.Equal("col=sono", CheckField.Arrange("col", ArrangeKeys.Sono).ToString());
        Assert.Equal("col=xray", CheckField.Arrange("col", ArrangeKeys.Xray).ToString());
        Assert.Equal("col=-", CheckField.Arrange("col", null).ToString());
    }
}

/// <summary>확인 차례 속 새 단계(AC-3302.1·2·4·5·6): 10/11 어레인지 처방 코드, 빠르기 11/11, 첫 줄 build=판+check5.</summary>
public class CheckArrangeRunnerTests
{
    private static readonly object?[][] OrderColumns =
    {
        Col("OdrInf", "OdrSite", "varchar", 20),
        Col("OdrInf", "OdrRmk", "text", 2147483647),
        Col("OdrInf", "OdrQty", "numeric", null),
    };

    private static ProbeSchema FullSchema => ProbeSchema.From(MainColumns.Concat(OrderColumns).Concat(LinkedColumns));

    private static string Part(string column) => ProbeSql.OrderTextCount(FullSchema, column);

    private static Harness WithCodes()
    {
        var h = new Harness();
        h.Login = () => null;
        h.Db.Answer(CheckSql.TableColumns, MainColumns.Concat(OrderColumns).ToArray());
        h.Db.Answer(CheckSql.ArrangeCodes,
            new object?[] { "SONO1", 40L, 44L },
            new object?[] { "G1234", 30L, 30L },
            new object?[] { "CARM1", 12L, 12L },
            new object?[] { "도수", 9L, 9L },
            new object?[] { "NONAME1", 2L, 3L });
        h.Db.Answer(ReceptionSql.RxNames,
            new object?[] { "SONO1", "어깨 초음파", "20260101" },
            new object?[] { "G1234", "흉부 X-ray 2매", "20260101" },
            new object?[] { "CARM1", "C-ARM 투시", "20260101" },
            new object?[] { "도수", "도수치료 30분", "20260101" });
        h.Db.Answer(Part("OdrSite"), new object?[] { 50L, 7 });
        h.Db.Answer(Part("OdrRmk"), new object?[] { 0L, 0 });
        return h;
    }

    [Fact(DisplayName = "AC-3302.2 지난 30일(@from = 오늘-30일, @to = 내일, 등록 병원) 코드마다 코드·코드 사전 이름·내원 수·처방 줄 수·지금 지도의 칸(없으면 -)을 DB가 준 차례로 적는다")]
    public void CodeLines()
    {
        using var h = WithCodes();

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangeCodes days=30 codes=5", lines);
        var codes = lines.Where(l => l.StartsWith("arrangeCode ", StringComparison.Ordinal)).ToArray();
        Assert.Equal(new[]
        {
            "arrangeCode code=SONO1 name=어깨 초음파 visits=40 rows=44 col=sono",
            // 지금 지도(TASK-12에서 4회차 보고서로 채움)는 G + 숫자 4자리 촬영 코드를 X-RAY에 넣는다
            "arrangeCode code=G1234 name=흉부 X-ray 2매 visits=30 rows=30 col=xray",
            "arrangeCode code=CARM1 name=C-ARM 투시 visits=12 rows=12 col=carm",
            "arrangeCode code=도수 name=도수치료 30분 visits=9 rows=9 col=-",
            "arrangeCode code=NONAME1 name=? visits=2 rows=3 col=-",
        }, codes);
        var call = Assert.Single(h.Db.Calls, c => c.Sql == CheckSql.ArrangeCodes);
        Assert.Equal(Stamp(Today.AddDays(-30)), call.From);
        Assert.Equal(Stamp(Today.AddDays(1)), call.Args["@to"]);
        Assert.Equal(Hospital, call.Args["@hospital"]);
        // 코드 사전은 이 단계에서 한 번(빠르기 단계의 한 번과 따로), 매개변수 없음
        Assert.Equal(2, h.Db.Calls.Count(c => c.Sql == ReceptionSql.RxNames));
        Assert.All(h.Db.Calls.Where(c => c.Sql == ReceptionSql.RxNames), c => Assert.Empty(c.Args));
    }

    [Fact(DisplayName = "AC-3302.2 코드 줄이 없으면 codes=0만 적고 코드 사전을 읽지 않는다")]
    public void NoCodes()
    {
        using var h = new Harness();
        h.Login = () => null;

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangeCodes days=30 codes=0", lines);
        Assert.DoesNotContain(lines, l => l.StartsWith("arrangeCode ", StringComparison.Ordinal));
        Assert.Equal(1, h.Db.Calls.Count(c => c.Sql == ReceptionSql.RxNames));
    }

    [Fact(DisplayName = "AC-3302.4 OdrInf의 글자형 칸(칸 목록에 있는 것만)마다 SONO1·CARM1 처방 줄의 빈 글 아닌 줄 수·서로 다른 값 수를 숫자로만 적는다")]
    public void PartLines()
    {
        using var h = WithCodes();

        var lines = Harness.Lines(h.Run());

        var parts = lines.Where(l => l.StartsWith("arrangePart ", StringComparison.Ordinal)).ToArray();
        Assert.Equal(new[]
        {
            "arrangePart column=OdrInf.OdrOcmNum filled=? distinct=?",
            "arrangePart column=OdrInf.OdrCod filled=? distinct=?",
            "arrangePart column=OdrInf.OdrSite filled=50 distinct=7",
            "arrangePart column=OdrInf.OdrRmk filled=0 distinct=0",
        }, parts);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql.Contains("[OdrQty]"));
        Assert.All(h.Db.Calls.Where(c => c.Sql.Contains("IN ('SONO1','CARM1')")), c =>
        {
            Assert.Equal(Stamp(Today.AddDays(-30)), c.From);
            Assert.Equal(Hospital, c.Args["@hospital"]);
        });
    }

    [Fact(DisplayName = "AC-3302.4 칸 목록에 OdrInf 글자형 칸이 없으면 arrangePart columns=0이고 찾기 문장을 돌리지 않는다")]
    public void NoOrderColumns()
    {
        using var h = WithCodes();
        h.Db.Answer(CheckSql.TableColumns, MainColumns.Where(row => (string)row[0]! != "OdrInf").ToArray());
        h.Db.Answer(CheckSql.LinkedColumns, LinkedColumns.Where(row => (string)row[0]! != "OdrInf").ToArray());

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangePart columns=0", lines);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql.Contains("IN ('SONO1','CARM1')"));
    }

    [Fact(DisplayName = "AC-3302.5 코드 표 문장이 실패하면 실패(번호)만 적고 부위 칸 찾기·빠르기로 간다")]
    public void CodesFailureContinues()
    {
        using var h = WithCodes();
        h.Db.OnQuery = call =>
        {
            if (call.Sql == CheckSql.ArrangeCodes) throw new SqlException(207);
        };

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangeCodes result=실패(SqlException 207)", lines);
        Assert.Contains("arrangePart column=OdrInf.OdrSite filled=50 distinct=7", lines);
        Assert.Contains(lines, l => l.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-3302.5 코드 사전이 실패하면 arrangeNames에 실패(번호)를 적고 코드 줄은 이름 ?로 적는다")]
    public void NamesFailureContinues()
    {
        using var h = WithCodes();
        var first = true;
        h.Db.OnQuery = call =>
        {
            if (call.Sql == ReceptionSql.RxNames && first)
            {
                first = false;
                throw new SqlException(1222);
            }
        };

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangeNames result=실패(SqlException 1222)", lines);
        Assert.Contains("arrangeCode code=SONO1 name=? visits=40 rows=44 col=sono", lines);
    }

    [Fact(DisplayName = "AC-3302.5 부위 칸 찾기 문장이 30초를 넘으면 그 칸은 실패(시간 초과)로 적고 다음 칸·빠르기로 간다")]
    public void PartTimeoutContinues()
    {
        using var h = WithCodes();
        h.Db.Took = sql => sql == Part("OdrSite") ? TimeSpan.FromSeconds(31) : TimeSpan.FromMilliseconds(10);

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangePart column=OdrInf.OdrSite result=실패(시간 초과)", lines);
        Assert.Contains("arrangePart column=OdrInf.OdrRmk filled=0 distinct=0", lines);
        Assert.Contains(lines, l => l.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-3302.5 전체 시간이 이미 지났으면 arrangeCodes는 실패(시간 초과) 한 줄이고 문장을 돌리지 않는다")]
    public void OverTotalLimit()
    {
        using var h = WithCodes();
        h.Db.Took = sql => sql == CheckSql.StatusHistory ? TimeSpan.FromMinutes(16) : TimeSpan.FromMilliseconds(10);

        var lines = Harness.Lines(h.Run());

        Assert.Contains("arrangeCodes result=실패(시간 초과)", lines);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql == CheckSql.ArrangeCodes);
    }

    /// <summary>
    /// 코드 칸은 명세 정규식(^[0-9A-Za-z가-힣_]{1,16}$)이 받는 글이면 그대로 적는다: OdrCod는 코드 사전 칸이라 환자 글이 아니라는 데 기댄다(AC-3302.3).
    /// 그래서 여기 센티널 코드는 정규식이 막는 모양(하이픈·공백이 든 글)만 쓴다.
    /// </summary>
    [Fact(DisplayName = "AC-3302.3 코드 표의 숫자 칸·정규식 밖 코드(하이픈·공백이 든 글)·전화 모양 이름·부위 칸 답이 센티널이어도 보고서·콘솔 기록에 센티널이 없다")]
    public void SentinelsNotWritten()
    {
        using var h = WithCodes();
        h.Db.Answer(CheckSql.ArrangeCodes,
            new object?[] { Sentinels.ChartNumber + "-1", Sentinels.ChartNumber, Sentinels.KoreanName },
            new object?[] { Sentinels.Phone, Sentinels.EnglishName, Sentinels.Phone },
            new object?[] { Sentinels.EnglishName, 1L, 1L },
            new object?[] { "SONO1", Sentinels.Phone, Sentinels.ChartNumber });
        h.Db.Answer(ReceptionSql.RxNames, new object?[] { "SONO1", Sentinels.Phone, "20260101" });
        h.Db.Answer(Part("OdrSite"), new object?[] { Sentinels.KoreanName, Sentinels.ChartNumber });

        var report = h.Run();
        var lines = Harness.Lines(report);

        Sentinels.Absent(report);
        Sentinels.Absent(h.Console.Text);
        Assert.Contains("arrangeCode code=? name=? visits=? rows=? col=-", lines);
        Assert.Contains("arrangeCode code=SONO1 name=? visits=? rows=? col=sono", lines);
        Assert.Contains("arrangePart column=OdrInf.OdrSite filled=? distinct=?", lines);
    }

    [Fact(DisplayName = "AC-3302.1 첫 줄은 build=판+check5, 콘솔 단계 표시는 1/11~11/11이고 10/11은 어레인지 처방 코드(모양 9/11 다음, 빠르기 11/11 앞)이다")]
    public void HeaderAndSteps()
    {
        using var h = WithCodes();
        string path;
        using (var report = CheckReport.Create(Path.Combine(h.Folder, "app"), Path.Combine(h.Folder, "temp"), h.Clock.Now))
        {
            path = report.FilePath;
            new CheckRunner(h.Console, h.Db.Open, () => null, h.Screen.Read, report, h.Clock.Read, "0.3.0").Run();
        }
        var lines = Harness.Lines(File.ReadAllText(path).TrimStart('﻿'));

        Assert.Equal("reception-check started=2026-11-05T10:03 build=0.3.0+check5", lines[0]);
        Assert.Equal(5, CheckRunner.CheckRound);
        var steps = h.Console.Written.Where(l => Regex.IsMatch(l, @"^\d+/\d+ ")).Select(l => l.Split(' ')[0]).ToArray();
        Assert.Equal(Enumerable.Range(1, 11).Select(i => i + "/11"), steps);
        Assert.Contains("10/11 어레인지 처방 코드를 세고 있어요.", h.Console.Written);
        Assert.Contains(h.Console.Written, l => l.StartsWith("9/11 ", StringComparison.Ordinal) && l.Contains("모양"));
        Assert.Contains(h.Console.Written, l => l.StartsWith("11/11 ", StringComparison.Ordinal) && l.Contains("빠르기"));

        var lastShape = Array.FindLastIndex(lines, l => l.StartsWith("shape ", StringComparison.Ordinal));
        var codes = Array.FindIndex(lines, l => l.StartsWith("arrangeCodes ", StringComparison.Ordinal));
        var lastPart = Array.FindLastIndex(lines, l => l.StartsWith("arrangePart ", StringComparison.Ordinal));
        var firstSpeed = Array.FindIndex(lines, l => l.StartsWith("speed ", StringComparison.Ordinal));
        Assert.True(lastShape >= 0 && codes > lastShape && lastPart > codes && firstSpeed > lastPart);
    }

    [Fact(DisplayName = "AC-3302.6 [의원 PC] 푼 폴더의 reception-check.cmd가 도우미 --reception-check를 부르고, 보고서 줄 모양은 arrangeCode·arrangePart 틀 그대로다")]
    public void CommandAndLineShapes()
    {
        var cmd = File.ReadAllText(Repo.PathOf("helper", "install", "reception-check.cmd"));
        Assert.Contains("\"%~dp0app\\PrecheckHelper.exe\" --reception-check", cmd);

        using var h = WithCodes();
        var lines = Harness.Lines(h.Run());

        var codeShape = new Regex(@"^arrangeCode code=\S+ name=.+ visits=\S+ rows=\S+ col=(xray|sono|carm|-)\z");
        var partShape = new Regex(@"^arrangePart column=OdrInf\.\w+ (filled=(\d+|\?) distinct=(\d+|\?)|result=실패\(.+\))\z");
        Assert.All(lines.Where(l => l.StartsWith("arrangeCode ", StringComparison.Ordinal)), l => Assert.Matches(codeShape, l));
        Assert.All(lines.Where(l => l.StartsWith("arrangePart ", StringComparison.Ordinal)), l => Assert.Matches(partShape, l));
    }
}
