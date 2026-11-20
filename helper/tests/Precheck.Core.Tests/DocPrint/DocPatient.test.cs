using System;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print REQ-7402: 비트 창 제목에서 지금 환자 차트번호 꺼내기(CurrentChart), 찾기 글 가르기(SearchInput),
/// 비트 DB에서 환자 찾기(PatientFinder). 비트 DB는 가짜(FakeDb)이고 차트번호·이름·생일은 모두 지어낸 것이다.
/// </summary>
public class DocPatientTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 20, 14, 30, 0);

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static object?[] Row(string chart, string name, string? birth, string? sex, string? last) => new object?[] { chart, name, birth, sex, last };

    // ── AC-7402.1 비트 창 제목 ─────────────────────────────

    [Theory(DisplayName = "AC-7402.1 창 제목의 '차트번호 :' 뒤 숫자(빈칸 허용)를 앞 0 빼고 1~14자리로 꺼낸다, 못 읽으면 null")]
    [InlineData("접수  (  환자정보 - 차트번호 : 0090001 )", "90001")]
    [InlineData("접수 (환자정보 - 차트번호 : 90001)", "90001")]
    [InlineData("차트번호:9", "9")]
    [InlineData("차트번호   :\t  00000000000090000000000001", "90000000000001")]
    [InlineData("차트번호 : 90001 가상환자01", "90001")]
    [InlineData("차트번호 : 90001 / 차트번호 : 90002", "90001")]
    [InlineData("차트번호 : 900000000000001", null)]
    [InlineData("차트번호 : 000", null)]
    [InlineData("차트번호 :  ", null)]
    [InlineData("차트번호 : 가상환자01", null)]
    [InlineData("차트 : 90001", null)]
    [InlineData("환자정보 90001", null)]
    [InlineData("차트번호 : ٩٠٠٠١", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void ChartFromTitle(string? title, string? chart)
    {
        Assert.Equal(chart, CurrentChart.FromTitle(title));
    }

    // ── AC-7402.2 찾기 글 ─────────────────────────────

    [Theory(DisplayName = "AC-7402.2 찾기 글: 숫자만이면 차트번호(앞 0 빼고 1~14자리), 글자가 있으면 이름(앞뒤 빈칸 빼고 2~20글자), 빈 글은 Empty, 그 밖은 Invalid")]
    [InlineData(null, SearchKind.Empty, "")]
    [InlineData("", SearchKind.Empty, "")]
    [InlineData(" \t ", SearchKind.Empty, "")]
    [InlineData("90001", SearchKind.Chart, "90001")]
    [InlineData("  0090001 ", SearchKind.Chart, "90001")]
    [InlineData("90000000000001", SearchKind.Chart, "90000000000001")]
    [InlineData("900000000000001", SearchKind.Invalid, "")]
    [InlineData("000", SearchKind.Invalid, "")]
    [InlineData("90-001", SearchKind.Invalid, "")]
    [InlineData("가상환자01", SearchKind.Name, "가상환자01")]
    [InlineData("  가상 환자 ", SearchKind.Name, "가상 환자")]
    [InlineData("가상", SearchKind.Name, "가상")]
    [InlineData("가", SearchKind.Invalid, "")]
    [InlineData("가나다라마바사아자차카타파하가나다라마바", SearchKind.Name, "가나다라마바사아자차카타파하가나다라마바")]
    [InlineData("가나다라마바사아자차카타파하가나다라마바사", SearchKind.Invalid, "")]
    [InlineData("Kim", SearchKind.Name, "Kim")]
    [InlineData("--", SearchKind.Invalid, "")]
    public void SearchText(string? text, SearchKind kind, string value)
    {
        var input = SearchInput.Parse(text);
        Assert.Equal(kind, input.Kind);
        Assert.Equal(value, input.Value);
    }

    [Fact(DisplayName = "AC-7402.2 차트번호로 찾기: 매개변수 @cht(정리한 번호)·@to(내일 0시)로 5초 안에 읽기만, 한 명이면 Found")]
    public void FindByChart()
    {
        var db = new FakeDb().Answer(DocSql.ChartFindSql, args => Equals(args["@cht"], "90001")
            ? new[] { Row("90001", "가상환자01", "19800302", "F", "20261120") }
            : Array.Empty<object?[]>());

        var result = PatientFinder.Find(db, SearchInput.Parse("0090001"), Today);

        Assert.Equal(PatientKind.Found, result.Kind);
        var hit = Assert.Single(result.Hits);
        Assert.Equal("90001", hit.Chart);
        Assert.Equal("가상환자01", hit.Name);
        Assert.Equal("19800302", hit.Birth8);
        Assert.Equal("F", hit.Sex);
        Assert.Equal("20261120", hit.LastVisit8);
        Assert.Equal("", PatientFinder.Message(result));

        var call = Assert.Single(db.Calls);
        Assert.Equal(DocSql.ChartFindSql, call.Sql);
        Assert.Equal(new[] { "@cht", "@to" }, call.Args.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal("90001", call.Args["@cht"]);
        Assert.Equal("202611210000", call.Args["@to"]);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
    }

    [Fact(DisplayName = "AC-7402.2 이름으로 찾기: @name이 같은 이름(부분 찾기 아님), 여러 명이면 Many이고 마지막 내원일 최근 순(없는 분은 뒤)")]
    public void FindByNameMany()
    {
        var db = new FakeDb().Answer(DocSql.NameFindSql, _ => new[]
        {
            Row("90003", "가상환자", "19751130", "M", null),
            Row("90002", "가상환자", "19920715", "F", "20260903"),
            Row(" 90001 ", "가상환자  ", "19800302", "F", "20261120"),
        });

        var result = PatientFinder.Find(db, SearchInput.Parse(" 가상환자 "), Today);

        Assert.Equal(PatientKind.Many, result.Kind);
        Assert.Equal(new[] { "90001", "90002", "90003" }, result.Hits.Select(h => h.Chart).ToArray());
        Assert.All(result.Hits, h => Assert.Equal("가상환자", h.Name));
        Assert.Equal("같은 이름이 3명이에요. 맞는 분을 눌러 주세요.", PatientFinder.Message(result));

        var call = Assert.Single(db.Calls);
        Assert.Equal(DocSql.NameFindSql, call.Sql);
        Assert.Equal("가상환자", call.Args["@name"]);
        Assert.Equal("202611210000", call.Args["@to"]);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
        Assert.Contains("RTRIM(b.PbsPatNam)=@name", Squash(DocSql.NameFindSql));
        Assert.Contains("TOP 50", DocSql.NameFindSql);
        Assert.DoesNotContain("LIKE", DocSql.NameFindSql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact(DisplayName = "AC-7402.2 이름으로 한 명이면 바로 Found")]
    public void FindByNameOne()
    {
        var db = new FakeDb().Answer(DocSql.NameFindSql, _ => new[] { Row("90004", "가상환자04", "20010101", "M", "20261101") });
        var result = PatientFinder.Find(db, SearchInput.Parse("가상환자04"), Today);
        Assert.Equal(PatientKind.Found, result.Kind);
        Assert.Equal("90004", Assert.Single(result.Hits).Chart);
    }

    [Fact(DisplayName = "AC-7402.2 없으면 '찾는 환자가 없어요. 차트번호나 이름을 다시 봐 주세요.', 빈 글·틀린 글은 DB에 묻지 않는다")]
    public void NoneFound()
    {
        var db = new FakeDb()
            .Answer(DocSql.ChartFindSql, _ => Array.Empty<object?[]>())
            .Answer(DocSql.NameFindSql, _ => new[] { Row("  ", "가상환자", null, null, null) });

        foreach (var text in new[] { "90009", "가상환자" })
        {
            var result = PatientFinder.Find(db, SearchInput.Parse(text), Today);
            Assert.Equal(PatientKind.None, result.Kind);
            Assert.Empty(result.Hits);
            Assert.Equal("찾는 환자가 없어요. 차트번호나 이름을 다시 봐 주세요.", PatientFinder.Message(result));
        }
        Assert.Equal(2, db.Calls.Count);

        var quiet = new FakeDb();
        foreach (var text in new[] { "", "  ", "000", "가", "90-001" })
        {
            Assert.Equal(PatientKind.None, PatientFinder.Find(quiet, SearchInput.Parse(text), Today).Kind);
        }
        Assert.Equal(PatientKind.None, PatientFinder.Find(quiet, null!, Today).Kind);
        Assert.Empty(quiet.Calls);
    }

    [Fact(DisplayName = "AC-7402.2 오류면 '비트에서 환자를 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.'(오류 내용은 내지 않음)")]
    public void ReadFailure()
    {
        var failing = new FakeDb().Fail(DocSql.ChartFindSql, BitErrors.ReadFailed).Fail(DocSql.NameFindSql, BitErrors.ReadFailed);
        var unanswered = new FakeDb();
        var throwing = new FakeDb()
            .Answer(DocSql.ChartFindSql, _ => throw new InvalidOperationException("연결 끊김"))
            .Answer(DocSql.NameFindSql, _ => throw new TimeoutException());

        foreach (IBitDb? db in new IBitDb?[] { failing, unanswered, throwing, null })
        {
            foreach (var text in new[] { "90001", "가상환자" })
            {
                var result = PatientFinder.Find(db!, SearchInput.Parse(text), Today);
                Assert.Equal(PatientKind.Failed, result.Kind);
                Assert.Empty(result.Hits);
                Assert.Equal("비트에서 환자를 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.", PatientFinder.Message(result));
            }
        }
        Assert.Equal("비트에서 보던 환자를 찾지 못했어요. 차트번호나 이름을 넣어 주세요.", PatientFinder.NoCurrentMessage);
    }

    [Fact(DisplayName = "AC-7402.2 목록 글: 생년월일 YYYY-MM-DD, 성별 남·여, 마지막 내원 YYYY-MM-DD(모르면 빈칸)")]
    public void HitTexts()
    {
        var hit = new PatientHit("90001", "가상환자01", "19800302", "F", "20261120");
        Assert.Equal("1980-03-02", hit.BirthText);
        Assert.Equal("여", hit.SexText);
        Assert.Equal("2026-11-20", hit.LastVisitText);
        Assert.Equal("남", new PatientHit("90002", "가상환자02", "", "M", "").SexText);

        var unknown = new PatientHit("90003", null!, "1980023", "X", "20261332");
        Assert.Equal("", unknown.Name);
        Assert.Equal("", unknown.BirthText);
        Assert.Equal("", unknown.SexText);
        Assert.Equal("", unknown.LastVisitText);
    }

    [Fact(DisplayName = "AC-7402.2 찾기 SQL: 차트번호는 LTRIM(RTRIM(PbsChtNum))=@cht, 마지막 내원일은 외래·취소(CN/CR) 뺀 오늘까지 내원 중 가장 늦은 날")]
    public void FindSqlShape()
    {
        var chart = Squash(DocSql.ChartFindSql);
        Assert.Contains("WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht", chart);
        foreach (var sql in new[] { chart, Squash(DocSql.NameFindSql) })
        {
            Assert.StartsWith("SELECT ", sql);
            Assert.Contains("LEFT(MAX(c.OcmAcpDtm),8)", sql);
            Assert.Contains("c.OcmChtNum=b.PbsChtNum", sql);
            Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')", sql);
            Assert.Contains("c.OcmAcpDtm<@to", sql);
        }
    }
}
