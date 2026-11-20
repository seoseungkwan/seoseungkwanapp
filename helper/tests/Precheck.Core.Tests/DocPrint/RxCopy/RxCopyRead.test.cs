using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.RxCopy;
using Xunit;
using static Precheck.Core.Tests.DocPrint.RxCopy.RxFixture;

namespace Precheck.Core.Tests.DocPrint.RxCopy;

/// <summary>
/// spec doc-print AC-7405.1(처방전 사본 자료): RxCopySql의 읽기 전용 문장 하나로 기간(@cht·@from·@to)의 처방전 머리(OutInf)·원외약 줄(OdrInf XX)·
/// 주상병(OicInf 주상병 하나)·처방 의사(UidMst)를 읽고, 고른 날 중 처방 있는 날의 내원만 메모리에서 골라 처방전마다 한 쪽, 날짜순으로 낸다. 값은 모두 지어낸 것이다.
/// </summary>
public class RxCopyReadTests
{
    private static readonly RxCopySource Source = new RxCopySource();

    [Fact(DisplayName = "AC-7405.1 처방전 SQL은 허용 목록의 읽기 전용 SELECT 하나(매개변수 @cht VarChar(14)·@from·@to Char(12), ; 없음, 줄바꿈 \\n)이고 ReadOnlyGuard를 지난다")]
    public void SqlIsGuardedSelect()
    {
        var sql = RxSql;
        Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
        Assert.DoesNotContain(";", sql);
        Assert.DoesNotContain("\r", sql);
        Assert.DoesNotContain("--", sql);
        Assert.True(Precheck.Core.Bit.Sql.IsAllowed(sql));
        Assert.True(DocSql.IsAllowed(sql));
        Assert.Equal(
            "@cht:VarChar(14) @from:Char(12) @to:Char(12)",
            string.Join(" ", RxCopySql.Allowed[sql].Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")")));
        ReadOnlyGuard.Require(sql, new Dictionary<string, object?> { ["@cht"] = Chart, ["@from"] = "202611030000", ["@to"] = "202611110000" });
    }

    [Fact(DisplayName = "AC-7405.1 처방전 SQL은 처방전 머리 OutInf·원외약 OdrInf(XX, 지움·취소 뺌)·주상병 OicInf(OicIcdPri='1' 하나)·의사 UidMst를 읽고, 주민번호는 앞 7자리만, 이름·전화·주소·도장 그림은 읽지 않는다")]
    public void SqlReadsOnlyWhatTheSlipNeeds()
    {
        var sql = Regex.Replace(RxSql, @"\s+", " ");
        Assert.Contains("dbo.OutInf o", sql);
        Assert.Contains("o.OutOcmNum=c.OcmNum", sql);
        Assert.Contains("r.OdrSlpNum=o.OutSlpDte+o.OutSlpNum", sql);
        Assert.Contains("r.OdrOutCod='XX'", sql);
        Assert.Contains("r.OdrDelFlg='N'", sql);
        Assert.Contains("r.OdrCanYon='N'", sql);
        Assert.Contains("SELECT TOP 1 RTRIM(i.OicElcCod) FROM dbo.OicInf i WHERE i.OicOcmNum=c.OcmNum AND i.OicIcdPri='1'", sql);
        Assert.Contains("dbo.UidMst u WHERE u.UidCod=c.OcmDtrCod", sql);
        Assert.Contains("LTRIM(RTRIM(b.PbsChtNum))=@cht", sql);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'", sql);

        // 주민번호는 처방전에 적힌 것(OutResNum)의 앞 7자리만 DB 안에서 잘라 읽는다
        Assert.Single(Regex.Matches(sql, "ResNum").Cast<Match>());
        Assert.Contains("LEFT(RTRIM(o.OutResNum),7)", sql);
        foreach (var dropped in new[] { "PbsResNum", "OutPatNam", "PbsPatNam", "Tel", "Phn", "Adr", "SignImg", "SgnImg", "OdrSplCmt", "OutRefCmt" })
        {
            Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact(DisplayName = "AC-7405.1 고른 날 중 처방 있는 날(첫 날 0시 ~ 끝 날 다음 날 0시)만 한 번 읽고, 고른 날 내원의 처방전만 처방전마다 한 쪽, 날짜순")]
    public void ReadsRxDaysOnlyOncePerContext()
    {
        var db = Db(
            Drug("V31", "20261110", "00031", "600000004", "가상캡슐200mg", 1m, 2, 7, "캡슐"),
            Drug("V12", "20261103", "00012", "600000001", "가상정10mg", 2m, 3, 30),
            Drug("V12", "20261103", "00012", "600000002", "가상정20mg", 0.5m, 1, 30),
            Drug("V99", "20261107", "00020", "600000003", "고르지않은날정", 1m, 1, 3),
            Drug("V20", "20261105", "00015", "600000005", "처방표시없는날정", 1m, 1, 3));
        var ctx = Context(Day(3, true, "V12"), Day(5, false, "V20"), Day(10, true, "V30", "V31"));

        var pages = Source.Pages(db, ctx);

        Assert.Equal(DocKind.RxCopy, Source.Kind);
        var call = Assert.Single(db.Calls);
        Assert.Equal(RxSql, call.Sql);
        Assert.Equal(Chart, call.Args["@cht"]);
        Assert.Equal("202611030000", call.Args["@from"]);
        Assert.Equal("202611110000", call.Args["@to"]);
        Assert.Equal(DocSql.ReadTimeout, call.Timeout);

        Assert.Equal(2, pages.Count);
        Assert.True(Has(pages[0], "2026년 11월 03일 - 제 00012 호"));
        Assert.True(Has(pages[0], "가상정10mg"));
        Assert.True(Has(pages[0], "가상정20mg"));
        Assert.False(Has(pages[0], "가상캡슐200mg"));
        Assert.True(Has(pages[1], "2026년 11월 10일 - 제 00031 호"));
        Assert.True(Has(pages[1], "가상캡슐200mg"));
        foreach (var page in pages)
        {
            Assert.False(Has(page, "고르지않은날정"));
            Assert.False(Has(page, "처방표시없는날정"));
        }
    }

    [Fact(DisplayName = "AC-7405.1 처방 없는 날은 쪽이 없다: 고른 날에 처방이 없으면 DB에 묻지 않고 0쪽, 처방전 줄이 없는 내원·약 줄이 없는 처방전도 0쪽")]
    public void NoRxDayNoPage()
    {
        var untouched = Db();
        Assert.Empty(Source.Pages(untouched, Context(Day(4, false, "V1"), Day(6, false, "V2"))));
        Assert.Empty(Source.Pages(untouched, Context()));
        Assert.Empty(untouched.Calls);

        var none = Db();
        Assert.Empty(Source.Pages(none, Context(Day(4, true, "V1"))));
        Assert.Single(none.Calls);

        var headOnly = Db(Row("V1", "20261104", "00004", (short)31, null, null, null, null, null, null));
        Assert.Empty(Source.Pages(headOnly, Context(Day(4, true, "V1"))));
    }

    [Fact(DisplayName = "AC-7405.1 질병분류기호는 그 내원의 주상병 하나뿐이고, 없으면 빈칸")]
    public void MainDiagnosisOnly()
    {
        var page = Assert.Single(Source.Pages(Db(Drug("V1", "20261104", "00004", "600000001", "가상정10mg", 1m, 1, 1)), Context(Day(4, true, "V1"))));
        var label = Text(page, "질병분류기호");
        var values = Texts(page).Where(op => RightOf(label, op) && op.X2 <= DocPage.WidthMm / 2f + 0.01f).ToArray();
        Assert.Equal("M5456", Assert.Single(values).Value);

        var blank = Assert.Single(Source.Pages(
            Db(Row("V1", "20261104", "00004", (short)31, "600000001", "가상정10mg", 1m, (short)1, (short)1, "정", mainDx: null)),
            Context(Day(4, true, "V1"))));
        var blankLabel = Text(blank, "질병분류기호");
        Assert.DoesNotContain(Texts(blank), op => RightOf(blankLabel, op) && op.X2 <= DocPage.WidthMm / 2f + 0.01f && op.Value.Trim().Length > 0);
    }

    [Fact(DisplayName = "AC-7405.1 약 줄은 처방전마다 비트 차례 그대로 모으고 1회량은 끝 0 없이(2.000 → 2, 0.500 → 0.5)·단위를 붙이며 횟수·일수는 정수")]
    public void LinesKeepOrderAndNumbers()
    {
        var db = Db(
            Drug("V1", "20261104", "00004", "600000003", "다정", 2.000m, 3, 30),
            Drug("V1", "20261104", "00004", "600000001", "가정", 0.500m, 2, 14, "캡슐"),
            Drug("V1", "20261104", "00004", "600000002", "나시럽", 1.250m, 1, 5, "mL/포"));

        var page = Assert.Single(Source.Pages(db, Context(Day(4, true, "V1"))));

        var names = new[] { "다정", "가정", "나시럽" }.Select(name => Text(page, name)).ToArray();
        Assert.True(names[0].Y < names[1].Y && names[1].Y < names[2].Y);
        Assert.True(SameRow(names[0], Text(page, "2정")));
        Assert.True(SameRow(names[1], Text(page, "0.5캡슐")));
        Assert.True(SameRow(names[2], Text(page, "1.25mL/포")));
        Assert.True(SameRow(names[0], Text(page, "600000003")));
        Assert.Contains(Texts(page), op => op.Value == "30" && SameRow(op, names[0]));
        Assert.Contains(Texts(page), op => op.Value == "14" && SameRow(op, names[1]));
        Assert.Contains(Texts(page), op => op.Value == "5" && SameRow(op, names[2]));
    }

    [Fact(DisplayName = "AC-7405.1 처방전 읽기 실패는 BitException 그대로 올린다")]
    public void FailureSurfaces()
    {
        var failing = new Precheck.Core.Tests.Bit.FakeDb().Fail(RxSql, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => Source.Pages(failing, Context(Day(4, true, "V1")))).Code);
    }
}
