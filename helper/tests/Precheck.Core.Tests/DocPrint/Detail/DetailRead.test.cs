using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Detail;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Detail;

/// <summary>
/// spec doc-print AC-7405.1(진료비 세부내역서): 허용 목록 문장(DetailSql), 처방 줄·영수증 저장 값 읽기(DetailReader),
/// 항목 묶음(DetailGroups). 환자·병원·금액은 모두 지어낸 값이다(DetailFixture).
/// </summary>
public class DetailReadTests
{
    private static readonly Regex Forbidden = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    private static string Flat(string sql) => Regex.Replace(sql, @"\s+", " ");

    private static DetailLine LineOf(DetailData data, string name) => data.Lines.Single(line => line.Name == name);

    // ── 허용 목록 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 세부내역서 SQL 둘(처방 줄·내원 영수증)은 DocSql·Sql 허용 목록 안의 읽기 전용 SELECT 하나(; · 주석 · \\r · 쓰기 낱말 없음)이고 @cht VarChar(14)·@from·@to Char(12)만 받는다")]
    public void SqlIsGuardedSelect()
    {
        Assert.Equal(new[] { DetailSql.LinesSql, DetailSql.VisitsSql }.OrderBy(s => s, StringComparer.Ordinal), DetailSql.Allowed.Keys.OrderBy(s => s, StringComparer.Ordinal));
        foreach (var sql in DetailSql.Allowed.Keys)
        {
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.DoesNotMatch(Forbidden, sql);
            Assert.True(DocSql.IsAllowed(sql));
            Assert.True(Sql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);
            Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")")));
            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(new[] { "@cht", "@from", "@to" }, used);

            // 환자 표에서는 차트번호만 읽는다(이름·주민번호·전화·주소·메모는 읽지 않는다)
            var pbs = Regex.Matches(sql, @"\bPbs[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct();
            Assert.Empty(pbs.Except(new[] { "PbsInf", "PbsChtNum" }));
            // 센 내원만(AC-7403.2와 같은 조건)
            Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')", Flat(sql));
            Assert.Contains("LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to", Flat(sql));
        }
    }

    [Fact(DisplayName = "AC-7405.1 처방 줄 문장: OdrInf의 삭제·취소 줄과 원외약(OdrOutCod='XX')을 빼고 코드·이름·단가·1회량·횟수·일수·금액·영수증 항목·급여 구분을 접수 차례로 읽는다")]
    public void LinesSqlShape()
    {
        var sql = Flat(DetailSql.LinesSql);
        Assert.Contains("JOIN dbo.OdrInf d ON d.OdrOcmNum=c.OcmNum", sql);
        Assert.Contains("d.OdrDelFlg='N' AND d.OdrCanYon='N' AND ISNULL(d.OdrOutCod,'')<>'XX'", sql);
        foreach (var column in new[] { "d.OdrSeq", "d.OdrElcCod", "d.OdrCodNam", "d.OdrPrc", "d.OdrQty", "d.OdrTms", "d.OdrDay", "d.OdrAmt", "d.OdrIncCod", "d.OdrInsYon" })
        {
            Assert.Contains(column, sql);
        }
        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum,d.OdrSeq", DetailSql.LinesSql, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-7405.1 내원 영수증 문장: 내원마다 상태·보험 이름(InsMst)·그 영수증(OrpInf MAX(OrpRcpSeq), 미수입금 C 뺌)의 저장 합계와 항목(OdlInf, 65세 정액 31 뺌) 급여·본인 합")]
    public void VisitsSqlShape()
    {
        var sql = Flat(DetailSql.VisitsSql);
        Assert.Contains("RTRIM(ISNULL(c.OcmComStt,''))", sql);
        Assert.Contains("FROM dbo.InsMst i WHERE i.InsCod=c.OcmInsCod", sql);
        Assert.Contains("p.OrpTotAmt,p.OrpInsAmt,p.OrpInsOwn,p.OrpCorAmt,p.OrpNonAmt", sql);
        Assert.Contains("LEFT JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C'", sql);
        Assert.Contains("p.OrpRcpSeq=(SELECT MAX(q.OrpRcpSeq) FROM dbo.OrpInf q WHERE q.OrpOcmNum=c.OcmNum AND ISNULL(q.OrpRcpStt,'')<>'C')", sql);
        Assert.Contains("SUM(l.OdlInsAmt) FROM dbo.OdlInf l WHERE l.OdlOcmNum=p.OrpOcmNum AND l.OdlRcpNum=p.OrpRcpNum AND l.OdlIncCod<>31", sql);
        Assert.Contains("SUM(l.OdlInsOwn) FROM dbo.OdlInf l WHERE l.OdlOcmNum=p.OrpOcmNum AND l.OdlRcpNum=p.OrpRcpNum AND l.OdlIncCod<>31", sql);
        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum", DetailSql.VisitsSql, StringComparison.Ordinal);
    }

    // ── 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 고른 날의 첫날 0시~끝날 다음 날 0시로 두 문장을 한 번씩 읽고, 고른 날 VisitNums 중 수납한 내원(PN·영수증 있음)의 줄만 남긴다")]
    public void ReadsSelectedPaidVisits()
    {
        var db = DetailFixture.Db();

        var data = DetailReader.Read(db, DetailFixture.Context());

        Assert.Equal(new[] { DetailSql.LinesSql, DetailSql.VisitsSql }.OrderBy(s => s), db.Sqls.OrderBy(s => s));
        foreach (var call in db.Calls)
        {
            Assert.Equal(new[] { "@cht", "@from", "@to" }, call.Args.Keys.OrderBy(k => k, StringComparer.Ordinal));
            Assert.Equal("90001", call.Args["@cht"]);
            Assert.Equal("202611030000", call.Args["@from"]);
            Assert.Equal("202611110000", call.Args["@to"]);
            Assert.Equal(DocSql.ReadTimeout, call.Timeout);
        }
        Assert.Equal(new[] { "V1", "V2" }, data.Visits.Select(v => v.VisitNum));
        Assert.DoesNotContain(data.Lines, line => line.Name == "수납전줄" || line.Name == "안고른날줄");
        Assert.Equal(7, data.Lines.Count);
        Assert.Equal(new DateTime(2026, 11, 3), data.FirstDay);
        Assert.Equal(new DateTime(2026, 11, 10), data.LastDay);
        Assert.Equal("국민건강보험", data.InsuranceText);
    }

    [Fact(DisplayName = "AC-7405.1 줄은 날짜순, 그날 안은 항목 묶음 차례(진찰료 → … → 재활물리치료료), 같은 묶음은 내원·처방 순서대로")]
    public void OrdersByDayThenGroup()
    {
        var data = DetailReader.Read(DetailFixture.Db(), DetailFixture.Context());

        Assert.Equal(
            new[] { "재진진찰료", "가상주사약", "가상물리치료", "가상도수치료", "가상전액치료", DetailFixture.LongName, "가상선별재료" },
            data.Lines.Select(line => line.Name));
        Assert.Equal(
            new[] { "진 찰 료", "주사료(약품)", "재활물리치료료", "재활물리치료료", "재활물리치료료", "영상진단료", "치료재료대" },
            data.Lines.Select(line => line.GroupLabel));
        Assert.Equal(new DateTime(2026, 11, 3), data.Lines[0].Date);
        Assert.Equal(new DateTime(2026, 11, 10), data.Lines[6].Date);
    }

    [Fact(DisplayName = "AC-7405.1 줄 값은 비트 저장 값 그대로: 코드·이름 앞뒤 빈칸만 빼고, 금액은 OdrAmt(단가×양으로 다시 셈하지 않음, 원 미만 버림 long)")]
    public void KeepsStoredValues()
    {
        var data = DetailReader.Read(DetailFixture.Db(), DetailFixture.Context());

        var therapy = LineOf(data, "가상물리치료");
        Assert.Equal("MM015", therapy.Code);
        Assert.Equal("V1", therapy.VisitNum);
        Assert.Equal(7910m, therapy.Price);
        Assert.Equal(7911L, therapy.Amounts.Total);
        Assert.Equal(6, therapy.IncCod);
        Assert.Equal("0", therapy.InsYon);

        var injection = LineOf(data, "가상주사약");
        Assert.Equal(89.6m, injection.Price);
        Assert.Equal(89L, injection.Amounts.Total);

        var picture = LineOf(data, DetailFixture.LongName);
        Assert.Equal(2m, picture.Qty);
        Assert.Equal(1, picture.Times);
        Assert.Equal(1, picture.Days);
        Assert.Equal(2m, picture.Count);
        var selective = LineOf(data, "가상선별재료");
        Assert.Equal(2m, selective.Count);
    }

    [Fact(DisplayName = "AC-7405.1 칸 나눔: 비급여(2) → 비급여, 100/100(3) → 전액본인부담, 급여(0)는 그 내원 항목 저장 본인 비율로 본인부담금(원 미만 버림)·공단부담금(나머지), 선별급여 F는 95%와 비고 '본인부담95%'")]
    public void SplitsColumns()
    {
        var data = DetailReader.Read(DetailFixture.Db(), DetailFixture.Context());

        void Expect(string name, long total, long own, long corp, long full, long non, string note)
        {
            var line = LineOf(data, name);
            Assert.Equal((total, own, corp, full, non), (line.Amounts.Total, line.Amounts.Own, line.Amounts.Corp, line.Amounts.Full, line.Amounts.Non));
            Assert.Equal(note, line.Note);
        }

        Expect("재진진찰료", 12000, 3600, 8400, 0, 0, "");
        Expect("가상주사약", 89, 26, 63, 0, 0, "");
        Expect("가상물리치료", 7911, 2373, 5538, 0, 0, "");
        Expect("가상도수치료", 50000, 0, 0, 0, 50000, "");
        Expect("가상전액치료", 3000, 0, 0, 3000, 0, "");
        Expect(DetailFixture.LongName, 10000, 1000, 9000, 0, 0, "");
        Expect("가상선별재료", 2000, 1900, 100, 0, 0, "본인부담95%");
        Assert.Equal(0.3m, data.Visits[0].OwnRate);
        Assert.Equal(0.1m, data.Visits[1].OwnRate);
    }

    [Fact(DisplayName = "AC-7405.1 【계】는 줄 합, 【합계】는 수납한 내원 영수증 저장 값 합(OrpTotAmt·OrpInsOwn·OrpCorAmt·총−급여−비급여·OrpNonAmt), 【끝자리 조정금액】은 합계 − 계")]
    public void SumsTotalsAndAdjustment()
    {
        var data = DetailReader.Read(DetailFixture.Db(), DetailFixture.Context());

        Assert.Equal((85000L, 8899L, 23101L, 3000L, 50000L), (data.Sum.Total, data.Sum.Own, data.Sum.Corp, data.Sum.Full, data.Sum.Non));
        Assert.Equal((85000L, 8800L, 23200L, 3000L, 50000L), (data.Total.Total, data.Total.Own, data.Total.Corp, data.Total.Full, data.Total.Non));
        Assert.Equal((0L, -99L, 99L, 0L, 0L), (data.Adjust.Total, data.Adjust.Own, data.Adjust.Corp, data.Adjust.Full, data.Adjust.Non));
        Assert.Equal((73000L, 5900L, 14100L, 3000L, 50000L), (data.Visits[0].Stored.Total, data.Visits[0].Stored.Own, data.Visits[0].Stored.Corp, data.Visits[0].Stored.Full, data.Visits[0].Stored.Non));
    }

    [Fact(DisplayName = "AC-7405.1 본인 비율: 항목 합이 없으면 영수증 급여 본인÷급여 총액, 그것도 없으면 0(본인 0·공단 전부). 1·8·9·A·B와 모르는 구분, 비청구(4)")]
    public void RateFallbacksAndKinds()
    {
        var lines = new[]
        {
            DetailFixture.Line("V1", "20261103", 1, "A1", "보험100줄", 1000m, 1m, 1, 1, 1000m, 1, "1"),
            DetailFixture.Line("V1", "20261103", 2, "A2", "선별50줄", 1000m, 1m, 1, 1, 1000m, 9, "8"),
            DetailFixture.Line("V1", "20261103", 3, "A3", "선별80줄", 1000m, 1m, 1, 1, 1000m, 9, "9"),
            DetailFixture.Line("V1", "20261103", 4, "A4", "선별30줄", 1000m, 1m, 1, 1, 1000m, 9, "A"),
            DetailFixture.Line("V1", "20261103", 5, "A5", "선별90줄", 1000m, 1m, 1, 1, 1000m, 9, "B"),
            DetailFixture.Line("V1", "20261103", 6, "A6", "비청구줄", 0m, 1m, 1, 1, 0m, 9, "4"),
            DetailFixture.Line("V1", "20261103", 7, "A7", "모르는줄", 1000m, 1m, 1, 1, 1000m, 9, "Z"),
            DetailFixture.Line("V2", "20261110", 1, "A8", "비율없음", 1000m, 1m, 1, 1, 1000m, 1, "0"),
        };
        var visits = new[]
        {
            DetailFixture.Visit("V1", "20261103", "PN", "보호1종", 6000m, 4000m, 1000m, 3000m, 0m, null, null),
            DetailFixture.Visit("V2", "20261110", "PN", "국민건강보험", 1000m, 0m, 0m, 0m, 0m, 0m, 0m),
        };

        var data = DetailReader.Read(DetailFixture.Db(lines, visits), DetailFixture.Context());

        Assert.Equal(0.25m, data.Visits[0].OwnRate);
        Assert.Equal(0m, data.Visits[1].OwnRate);
        Assert.Equal((250L, 750L, ""), (LineOf(data, "보험100줄").Amounts.Own, LineOf(data, "보험100줄").Amounts.Corp, LineOf(data, "보험100줄").Note));
        Assert.Equal((500L, "본인부담50%"), (LineOf(data, "선별50줄").Amounts.Own, LineOf(data, "선별50줄").Note));
        Assert.Equal((800L, "본인부담80%"), (LineOf(data, "선별80줄").Amounts.Own, LineOf(data, "선별80줄").Note));
        Assert.Equal((300L, "본인부담30%"), (LineOf(data, "선별30줄").Amounts.Own, LineOf(data, "선별30줄").Note));
        Assert.Equal((900L, "본인부담90%"), (LineOf(data, "선별90줄").Amounts.Own, LineOf(data, "선별90줄").Note));
        var unclaimed = LineOf(data, "비청구줄").Amounts;
        Assert.Equal((0L, 0L, 0L, 0L, 0L), (unclaimed.Total, unclaimed.Own, unclaimed.Corp, unclaimed.Full, unclaimed.Non));
        Assert.Equal((250L, 750L), (LineOf(data, "모르는줄").Amounts.Own, LineOf(data, "모르는줄").Amounts.Corp));
        Assert.Equal((0L, 1000L), (LineOf(data, "비율없음").Amounts.Own, LineOf(data, "비율없음").Amounts.Corp));
        Assert.Equal("보호1종, 국민건강보험", data.InsuranceText);
    }

    [Fact(DisplayName = "AC-7405.1 고른 날이 없으면 DB에 묻지 않고 빈 자료, 수납한 내원이 없으면 줄 없음, 틀린 줄은 건너뜀, 읽기 실패는 BitException 그대로")]
    public void EmptyBrokenAndFailing()
    {
        var quiet = DetailFixture.Db();
        var none = DetailReader.Read(quiet, DetailFixture.Context(Array.Empty<VisitDay>()));
        Assert.Empty(quiet.Calls);
        Assert.Empty(none.Lines);
        Assert.Empty(none.Visits);
        Assert.Null(none.FirstDay);
        Assert.Equal(0L, none.Total.Total);

        var unpaid = DetailReader.Read(DetailFixture.Db(), DetailFixture.Context(new[] { DetailFixture.Day(10, "V3") }));
        Assert.Empty(unpaid.Lines);
        Assert.Empty(unpaid.Visits);

        var broken = new[]
        {
            new object?[] { "V1", "2026-11-03" },
            DetailFixture.Line("V1", "없는날", 1, "A1", "틀린날줄", 1m, 1m, 1, 1, 1m, 1, "0"),
            DetailFixture.Line("V1", "20261103", 1, "A1", "좋은줄", 1000m, 1m, 1, 1, 1000m, 1, "0"),
            null!,
        };
        var kept = DetailReader.Read(DetailFixture.Db(broken), DetailFixture.Context());
        Assert.Equal(new[] { "좋은줄" }, kept.Lines.Select(line => line.Name));

        var failing = new FakeDb().Fail(DetailSql.LinesSql, BitErrors.ReadFailed).Answer(DetailSql.VisitsSql, _ => DetailFixture.Visits());
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => DetailReader.Read(failing, DetailFixture.Context())).Code);
    }

    // ── 항목 묶음 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 항목 묶음 차례는 비트 세부내역서 글 그대로 26개, 영수증 항목(IncMst) → 묶음, 모르는 항목은 '기    타'")]
    public void GroupsFollowBitOrder()
    {
        Assert.Equal(
            new[]
            {
                "진 찰 료", "입 원 료", "식    대", "투약조제(행위)", "투약조제(약품)", "주사료(행위)", "주사료(약품)", "마 취 료", "처치및수술료", "검 사 료",
                "영상진단료", "방사선치료료", "치료재료대", "재활물리치료료", "정신요법료", "전혈혈액성분제제료", "CT 진단료", "MRI 진단료", "PET 진단료", "초음파 진단료",
                "보철/교정료/기타", "기    타", "65세이상등정액", "정액수가", "포괄수가", "제증명수수료",
            },
            DetailGroups.Labels);
        var expected = new Dictionary<int, string>
        {
            [1] = "진 찰 료", [2] = "입 원 료", [14] = "식    대", [3] = "투약조제(행위)", [28] = "투약조제(약품)", [4] = "주사료(행위)", [29] = "주사료(약품)",
            [5] = "마 취 료", [8] = "처치및수술료", [9] = "검 사 료", [30] = "영상진단료", [10] = "방사선치료료", [15] = "치료재료대", [6] = "재활물리치료료",
            [7] = "정신요법료", [18] = "전혈혈액성분제제료", [11] = "CT 진단료", [12] = "MRI 진단료", [27] = "PET 진단료", [16] = "초음파 진단료",
            [17] = "보철/교정료/기타", [25] = "기    타", [31] = "65세이상등정액", [32] = "정액수가", [33] = "포괄수가", [22] = "제증명수수료", [13] = "제증명수수료",
            [777] = "기    타",
        };
        foreach (var pair in expected)
        {
            Assert.Equal(pair.Value, DetailGroups.Labels[DetailGroups.Of(pair.Key)]);
        }
    }
}
