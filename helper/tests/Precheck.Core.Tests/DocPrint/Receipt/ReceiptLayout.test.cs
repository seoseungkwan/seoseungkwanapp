using System;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Receipt;
using Xunit;
using static Precheck.Core.Tests.DocPrint.Receipt.ReceiptFixture;

namespace Precheck.Core.Tests.DocPrint.Receipt;

/// <summary>
/// spec doc-print AC-7406.1(진료비 영수증 그리기): 비트 '2012년 신 서식' 진료비 계산서·영수증 칸·글자 자리, 영수증(내원)마다 한 장,
/// 수납 전 내원은 건너뜀, 병원 직인 자리, 긴 글 줄이기. 값은 모두 지어낸 것이다. 칸 자리는 견본 PDF로 다시 맞춘다.
/// </summary>
public class ReceiptLayoutTests
{
    private static DocPage OnePage(object?[] receipt, params object?[][] items)
    {
        var db = Db(new[] { receipt }, items);
        var pages = new ReceiptSource().Pages(db, Context(new[] { Day(11, 3, (string)receipt[0]!) }));
        return Assert.Single(pages);
    }

    private static DocPage Sample() => OnePage(
        Orp("V1", "20261103", "    00123", 52000, 36410, 15000, 14590, 410, dnh: "N", card: 10000, cash: 5000, cashReceipt: 3000, approval: "987654321", disabled: 0, health: 0),
        Odl("V1", "    00123", 1, 3560, 8320),
        Odl("V1", "    00123", 6, 4440, 10370, full: 410),
        Odl("V1", "    00123", 29, 1200, 2800, nonPay: 410),
        Odl("V1", "    00123", 31, 1500, 3500));

    // ── 쪽 수·차례 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 영수증(내원)마다 A4 한 장, 날짜순·같은 날은 접수 차례, 수납 전(영수증 줄 없음) 내원은 쪽이 없다, 서류 종류는 영수증")]
    public void OnePagePerReceipt()
    {
        var db = Db(
            new[]
            {
                Orp("V1", "20261103", "00101", 10000, 7000, 3000, 3000, 0),
                Orp("V2", "20261103", "00102", 10000, 7000, 3000, 3000, 0),
                Orp("V5", "20261110", "00105", 10000, 7000, 3000, 3000, 0),
            },
            Array.Empty<object?[]>());

        var pages = new ReceiptSource().Pages(db, Context(new[] { Day(11, 10, "V5", "V6"), Day(11, 3, "V1", "V2") }));

        Assert.Equal(DocKind.Receipt, new ReceiptSource().Kind);
        Assert.Equal(3, pages.Count);
        Assert.True(Has(pages[0], "202611-00101"));
        Assert.True(Has(pages[1], "202611-00102"));
        Assert.True(Has(pages[2], "202611-00105"));
        Assert.True(Has(pages[2], "2026-11-10 ~ 2026-11-10"));
    }

    // ── 머리 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 머리: [V]외래 표시·제목 '진료비 계산서·영수증', 이름표 아래 차트번호·이름·진료기간(그날 하루)·야간 표시·진료과목·환자구분·영수증번호")]
    public void HeaderFields()
    {
        var page = Sample();

        Assert.True(Has(page, "[V]외래 [ ]입원 ([ ]퇴원 [ ]중간)"));
        var title = Text(page, "진료비 계산서·영수증");
        Assert.True(title.Bold);
        Assert.Equal(DocAlign.Center, title.Align);
        Below(Text(page, "환자등록번호"), Text(page, "90001"));
        Below(Text(page, "환자 성명"), Text(page, "가상환자"));
        Below(Text(page, "진료기간"), Text(page, "2026-11-03 ~ 2026-11-03"));
        Below(Text(page, "야간(공휴일)진료"), Text(page, "[V]야간[ ]공휴일"));
        Below(Text(page, "진료과목"), Text(page, "1진료실"));
        Below(Text(page, "환자구분"), Text(page, "국민건강보험"));
        Below(Text(page, "영수증번호(연월-일련번호)"), Text(page, "202611-00123"));
        Assert.True(Has(page, "질병군(DRG)번호"));
        Assert.True(Has(page, "병실"));
    }

    // ── 가운데 표 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 가운데 표: 머리(급여 일부 본인부담 본인부담금·공단부담금·전액 본인부담·비급여·금액산정내용)와 기본항목·선택항목 줄이 2012 신 서식 차례대로")]
    public void TableRows()
    {
        var page = Sample();
        foreach (var label in new[] { "항 목", "급 여", "일부 본인부담", "본인부담금", "공단부담금", "전액 본인부담", "비급여", "금액산정내용" })
        {
            Assert.True(Has(page, label), label);
        }
        // 묶음 이름은 세로로 한 글자씩: 기본항목은 진찰료 줄 옆, 선택항목은 CT 줄 옆
        var basic = Stacked(page, "기본항목");
        var optional = Stacked(page, "선택항목");
        Assert.True(basic.X2 <= Text(page, "진 찰 료").X + 0.01f);
        Assert.True(basic.Y >= Text(page, "진 찰 료").Y - 0.01f && basic.Y2 <= Text(page, "전혈 및 혈액성분제제료").Y2 + 0.01f);
        Assert.True(optional.Y >= Text(page, "CT 진단료").Y - 0.01f && optional.Y2 <= Text(page, "기타").Y2 + 0.01f);
        var rows = new[]
        {
            "진 찰 료", "입원료", "1인실", "2·3인실", "4인실이상", "식대", "투약 및 조제료", "주사료", "마취료", "처치 및 수술료", "검사료", "영상진단료", "방사선치료료",
            "치료재료대", "재활 및 물리치료료", "정신요법료", "전혈 및 혈액성분제제료", "CT 진단료", "MRI 진단료", "PET 진단료", "초음파진단료", "보철 교정료", "제증명수수료",
            "선별급여", "65세 이상 등 정액", "정액수가(요양병원)", "정액수가(완화의료)", "포괄수가진료비", "기타", "합 계", "상한액 초과금",
        };
        var ys = rows.Select(row => Text(page, row).Y).ToArray();
        Assert.Equal(ys.OrderBy(y => y).ToArray(), ys);
        // 투약·주사는 행위료·약품비 두 줄
        Assert.Equal(2, Texts(page).Count(op => op.Value == "행위료"));
        Assert.Equal(2, Texts(page).Count(op => op.Value == "약품비"));
    }

    [Fact(DisplayName = "AC-7406.1 항목 금액은 그 줄·그 열 칸에 비트 저장 값 그대로(1,000 단위 쉼표), 이학요법료=재활 및 물리치료료, 주사 약품비, 65세 정액, 0인 칸은 비움")]
    public void ItemCells()
    {
        var page = Sample();
        var own = Text(page, "본인부담금");
        var corp = Text(page, "공단부담금");
        var full = Text(page, "전액 본인부담");
        var non = Text(page, "비급여");

        var consult = Text(page, "진 찰 료");
        Assert.Equal("3,560", At(page, consult, own));
        Assert.Equal("8,320", At(page, consult, corp));
        Assert.Equal("", At(page, consult, full));
        Assert.Equal("", At(page, consult, non));

        var physio = Text(page, "재활 및 물리치료료");
        Assert.Equal("4,440", At(page, physio, own));
        Assert.Equal("10,370", At(page, physio, corp));
        Assert.Equal("410", At(page, physio, full));

        var injectionDrug = Texts(page).Where(op => op.Value == "약품비").OrderBy(op => op.Y).Last();
        Assert.Equal("1,200", At(page, injectionDrug, own));
        Assert.Equal("410", At(page, injectionDrug, non));

        var senior = Text(page, "65세 이상 등 정액");
        Assert.Equal("1,500", At(page, senior, own));
        Assert.Equal("3,500", At(page, senior, corp));

        Assert.Equal("", At(page, Text(page, "검사료"), own));
        InCell(consult, own, Texts(page).First(op => op.Value == "3,560"));
        Assert.Equal(DocAlign.Right, Texts(page).First(op => op.Value == "3,560").Align);
    }

    [Fact(DisplayName = "AC-7406.1 합계 줄 ①~④는 OrpInf 저장 값(급여 본인부담·공단·항목 전액본인부담 합·비급여), 선별급여 줄은 비트 식 값, 모르는 항목은 기타 줄")]
    public void TotalsRow()
    {
        var page = OnePage(
            Orp("V1", "20261103", "00123", 70000, 21000, 49000, 1000, 600),
            Odl("V1", "00123", 1, 1003, 2340),
            Odl("V1", "00123", 6, 0, 0, full: 250, h95: 50000),
            Odl("V1", "00123", 25, 0, 0, nonPay: 600));
        var own = Text(page, "본인부담금");
        var corp = Text(page, "공단부담금");
        var full = Text(page, "전액 본인부담");
        var non = Text(page, "비급여");

        var total = Text(page, "합 계");
        Assert.Equal("48,500", At(page, total, own)); // OrpInsOwn 1,000 + 선별 47,500
        Assert.Equal("23,500", At(page, total, corp)); // OrpCorAmt 21,000 + 선별 2,500
        Assert.Equal("250", At(page, total, full));
        Assert.Equal("600", At(page, total, non));

        var selective = Text(page, "선별급여");
        Assert.Equal("47,500", At(page, selective, own));
        Assert.Equal("2,500", At(page, selective, corp));
        Assert.Equal("600", At(page, Text(page, "기타"), non));
        Assert.Equal("1,003", At(page, Text(page, "진 찰 료"), own));
    }

    // ── 금액산정내용 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 금액산정내용: ⑥ 총액·⑦ 공단·⑧ 환자부담은 OrpInf 저장 값, ⑨ 0·⑩ = ⑧, ⑪ 카드·현금영수증·현금(계좌 포함, 현금영수증 몫 뺌)·합계, 납부하지 않은 금액, 현금승인번호")]
    public void AmountPanel()
    {
        var page = OnePage(
            Orp("V1", "20261103", "00123", 52001, 36411, 15000, 14590, 410, card: 7000, cash: 5000, account: 2000, cashReceipt: 3000, approval: "987654321", health: 1000),
            Odl("V1", "00123", 1, 3561, 8320));

        Assert.Equal("52,001", RightOf(page, Text(page, "⑥ 진료비 총액")));
        Assert.Equal("36,411", RightOf(page, Text(page, "⑦ 공단부담 총액")));
        Assert.Equal("15,000", RightOf(page, Text(page, "⑧ 환자부담 총액")));
        Assert.Equal("0", RightOf(page, Text(page, "⑨ 이미 납부한 금액")));
        Assert.Equal("15,000", RightOf(page, Text(page, "⑩ 납부할 금액")));
        Assert.Equal("7,000", RightOf(page, Text(page, "카드")));
        Assert.Equal("3,000", RightOf(page, Texts(page).First(op => op.Value == "현금영수증" && op.X > 155)));
        Assert.Equal("4,000", RightOf(page, Text(page, "현금")));
        Assert.Equal("14,000", RightOf(page, Text(page, "합계")));
        Assert.Equal("1,000", RightOf(page, Text(page, "납부하지 않은 금액")));
        Assert.True(Has(page, "(⑩-⑪)"));
        Assert.Equal("987654321", RightOf(page, Text(page, "현금승인번호")));
        Assert.Equal("", RightOf(page, Text(page, "신분확인번호")));
        Assert.True(Has(page, "(②+⑤)"));
        Assert.True(Has(page, "(①-⑤)+③+④"));
        Assert.True(Has(page, "(⑧-⑨)"));
        Assert.True(Has(page, "*요양기관 임의활용공간"));
        Assert.True(Has(page, "건강생활지원금 : 1,000"));
        Assert.True(Has(page, "계좌입금 : 2,000"));
        Assert.DoesNotContain(Texts(page), op => op.Value.StartsWith("장애인기금", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-7406.1 임의활용공간: 장애인기금·지원금이 있으면 적고, 출력일자(오늘)를 적는다")]
    public void FreeSpace()
    {
        var page = OnePage(Orp("V1", "20261103", "00123", 10000, 7000, 3000, 3000, 0, disabled: 1200, support: 340, card: 3000));
        Assert.True(Has(page, "장애인기금 : 1,200"));
        Assert.True(Has(page, "지원금 : 340"));
        Assert.True(Has(page, "출력일자 : 2026-11-20"));
        Assert.DoesNotContain(Texts(page), op => op.Value.StartsWith("계좌입금", StringComparison.Ordinal));
    }

    // ── 아래 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 아래: 요양기관 종류(의원급)·사업자등록번호(3-2-5)·상호·전화·소재지·대표자·[인]·수납일, 항목별 설명·일반사항 안내 글")]
    public void Footer()
    {
        var page = OnePage(Orp("V1", "20261103", "00123", 10000, 7000, 3000, 3000, 0, accDay: "20261104", card: 3000));

        Assert.True(Has(page, "[V]의원급·보건기관 [ ]병원급, [ ]종합병원, [ ]상급종합병원"));
        Assert.Equal("123-45-67890", RightOf(page, Text(page, "사업자등록번호")));
        Assert.Equal("가상의원", RightOf(page, Text(page, "상 호")));
        Assert.Equal("02-000-0000", RightOf(page, Text(page, "전화번호")));
        Assert.Equal("가상시 가상구 가상로 1", RightOf(page, Text(page, "사업장 소재지")));
        Assert.Equal("가상원장", RightOf(page, Text(page, "대표자")));
        Assert.True(Has(page, "[인]"));
        Assert.True(Has(page, "2026 년 11 월 4 일"));
        Assert.True(Has(page, "항목별 설명"));
        Assert.True(Has(page, "일반사항 안내"));
        var notes = string.Join("", Texts(page).Select(op => op.Value)).Replace(" ", "");
        Assert.Contains("건강보험심사평가원(☏1644-2000,홈페이지:www.hira.or.kr)에확인요청하실수있습니다.", notes);
        Assert.Contains("본인부담액상한제에따라", notes);
        Assert.Contains("(현금영수증문의126인터넷홈페이지:http://현금영수증.kr)", notes);
    }

    [Fact(DisplayName = "AC-7406.1 병원 직인: 대표자 [인] 자리에 DocOp.Image(SealKey)와 쪽 그림 Images[SealKey]=직인, 직인이 없으면 둘 다 없다")]
    public void Seal()
    {
        var page = OnePage(Orp("V1", "20261103", "00123", 10000, 7000, 3000, 3000, 0));
        var image = Assert.Single(page.Ops, op => op.Kind == DocOpKind.Image);
        Assert.Equal(DocContext.SealKey, image.Key);
        Assert.Equal(ReceiptFixture.Seal, page.ImageOf(DocContext.SealKey));
        var stamp = Text(page, "[인]");
        Assert.True(image.X < stamp.X2 && image.X2 > stamp.X && image.Y < stamp.Y2 && image.Y2 > stamp.Y, "직인이 [인] 자리에 겹치지 않는다");
        Assert.True(image.Width >= 10 && image.Width <= 25 && Math.Abs(image.Width - image.Height) < 0.01f);

        var db = Db(new[] { Orp("V1", "20261103", "00123", 10000, 7000, 3000, 3000, 0) }, Array.Empty<object?[]>());
        var plain = Assert.Single(new ReceiptSource().Pages(db, Context(new[] { Day(11, 3, "V1") }, Hospital(null))));
        Assert.DoesNotContain(plain.Ops, op => op.Kind == DocOpKind.Image);
        Assert.Null(plain.ImageOf(DocContext.SealKey));
    }

    // ── 쪽 안·글 맞추기 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 모든 그리기는 A4(210×297mm) 사방 5mm 안, 글은 제 칸 폭(ctx.WidthMm로 잰 값) 안에 들어가고, 긴 주소는 글씨를 줄이거나 끝을 …로 줄인다")]
    public void FitsInsidePage()
    {
        var longAddress = string.Concat(Enumerable.Repeat("가상시 가상구 아주긴가상로 ", 8)).Trim();
        var db = Db(new[] { Orp("V1", "20261103", "00123", 1_234_567_890, 7000, 1_234_560_890, 3000, 0, dep: "아주아주아주아주긴진료과이름", card: 3000) }, new[] { Odl("V1", "00123", 1, 123_456_789, 987_654_321) });
        var page = Assert.Single(new ReceiptSource().Pages(db, Context(new[] { Day(11, 3, "V1") }, Hospital(ReceiptFixture.Seal, longAddress))));

        foreach (var op in page.Ops)
        {
            // 프린터가 못 찍는 쪽 끝(약 4mm)을 피해 사방 5mm 안쪽
            Assert.True(op.X >= 5 && op.X2 <= DocPage.WidthMm - 5 && op.Y >= 5 && op.Y2 <= DocPage.HeightMm - 5, $"{op.Kind} '{op.Value}' 쪽 밖({op.X},{op.Y})~({op.X2},{op.Y2})");
        }
        foreach (var op in Texts(page))
        {
            Assert.True(op.Pt >= 4.5f && op.Pt <= 18f, $"'{op.Value}' {op.Pt}pt");
            Assert.True(Width(op.Value, op.Pt) <= op.Width + 0.01f, $"'{op.Value}' {Width(op.Value, op.Pt)}mm > 칸 {op.Width}mm");
        }
        var address = Texts(page).Single(op => op.Value.StartsWith("가상시", StringComparison.Ordinal));
        Assert.True(address.Value.EndsWith("…", StringComparison.Ordinal) || address.Value == longAddress);
        Assert.True(Has(page, "1,234,567,890"));
        Assert.True(Has(page, "123,456,789"));
    }
}
