using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>
/// 진료비 영수증 한 장 그리기(spec doc-print AC-7406.1): 비트 BITRePrint '2012년 신 서식' 진료비 계산서·영수증(외래)의 칸·글을 A4 세로(mm)에 그린다.
/// 칸 이름·줄 차례·안내 글은 비트 DLL 글 그대로(notes/forms.md §1), 칸 크기·글씨 크기는 견본 PDF가 오면 다시 맞춘다.
/// 금액은 ReceiptVisit 값 그대로 찍고(0인 항목 칸은 비움), 합계 줄·⑦⑩⑪·납부하지 않은 금액만 서식 식대로 더하고 뺀다.
/// </summary>
public static class ReceiptLayout
{
    // 쪽 가로
    private const float Left = 12f;
    private const float Right = 198f;

    // 가운데 표 열(왼쪽 끝)
    private const float GroupX = 12f;
    private const float ItemX = 20f;
    private const float SubX = 40f;
    private const float OwnX = 56f;
    private const float CorpX = 79.5f;
    private const float FullX = 103f;
    private const float NonX = 126.5f;
    private const float PanelX = 150f;
    private const float PanelSubX = 161f;
    private const float PanelValueX = 178f;

    // 가운데 표 줄
    private const float TableTop = 50f;
    private const float HeadBottom = 65f;
    private const float RowH = 4.4f;
    private const int ItemRows = 30;
    private const int BasicRows = 18;
    private const int TotalRow = 30;
    private const int CapRow = 31;
    private const float TableBottom = HeadBottom + (RowH * 32);

    /// <summary>아래 칸(요양기관 종류·사업자·소재지) 위 끝. 프린터가 못 찍는 쪽 끝 4mm 안쪽(290mm)까지만 그린다.</summary>
    private const float FooterTop = TableBottom + 2f;

    private const float AmountPt = 7.5f;
    private const float ItemPt = 7f;
    private const float LabelPt = 7f;

    /// <summary>항목 줄: 이름, (나눔 이름, 나눔 줄 수) — 입원료·투약 및 조제료·주사료는 왼쪽 이름이 여러 줄을 덮고 오른쪽에 나눔 이름.</summary>
    private static readonly string[] RowNames =
    {
        "진 찰 료", "1인실", "2·3인실", "4인실이상", "식대", "행위료", "약품비", "행위료", "약품비", "마취료", "처치 및 수술료", "검사료", "영상진단료", "방사선치료료",
        "치료재료대", "재활 및 물리치료료", "정신요법료", "전혈 및 혈액성분제제료",
        "CT 진단료", "MRI 진단료", "PET 진단료", "초음파진단료", "보철 교정료", "제증명수수료", "선별급여", "65세 이상 등 정액", "정액수가(요양병원)", "정액수가(완화의료)", "포괄수가진료비", "기타",
    };

    /// <summary>나눔 이름 묶음: (첫 줄, 줄 수, 왼쪽 이름).</summary>
    private static readonly (int First, int Count, string Name)[] Spans = { (1, 3, "입원료"), (5, 2, "투약 및 조제료"), (7, 2, "주사료") };

    private const int SelectiveRow = 24;
    private const int OtherRow = 29;

    /// <summary>항목 코드(IncMst.IncCod) → 줄. 표에 없는 코드(입원료·선택진료료·의지보조기·기타·DRG차액 등)는 '기타' 줄.</summary>
    private static readonly Dictionary<int, int> RowOfCode = new Dictionary<int, int>
    {
        [1] = 0,
        [14] = 4, [26] = 4,
        [3] = 5, [28] = 6,
        [4] = 7, [29] = 8,
        [5] = 9,
        [8] = 10,
        [9] = 11,
        [30] = 12,
        [10] = 13,
        [15] = 14,
        [6] = 15,
        [7] = 16,
        [18] = 17,
        [11] = 18,
        [12] = 19,
        [27] = 20,
        [16] = 21,
        [17] = 22,
        [13] = 23, [22] = 23,
        [31] = 25,
        [32] = 26,
        [60] = 27,
        [33] = 28,
    };

    private static readonly string[] ItemNotes =
    {
        "1. 일부 본인부담: 일반적으로 다음과 같이 본인부담률을 적용하나, 요양기관 지역, 요양기관의 종별, 환자 자격 등에 따라 달라질 수 있습니다.",
        "- 외래 본인부담률: 요양기관 종별에 따라 30% ~ 60%(의료급여는 수급권자 종별 및 의료급여기관 유형 등에 따라 0원 ~ 2500원 0% ~ 15%) 등",
        "- 입원 본인부담률: 20%(의료급여는 수급권자 종별 및 의료급여기관 유형 등에 따라 0% ~ 10%) 등",
        "※ 식대: 50%(의료급여는 20%)",
        "※ CT·MRI·PET: 외래 본인부담률(의료급여는 입원 본인부담률과 동일)",
        "2. 전액 본인부담: 『국민건강보험법 시행규칙』 별표 5 또는 『의료급여법 시행규칙』 별표 1의2에 따라 적용되는 항목으로 건강보험(의료급여)에서 금액을 정하고 있으나 진료비 전액을 환자 본인이 부담합니다.",
        "3. 상한액 초과금: 본인부담액 상한제에 따라 같은 의료기관에서 연간 (　　　　　　)원(환자 자격 등에 따라 다를 수 있음) 이상 본인부담금이 발생한 경우 공단이 부담하는 초과분 중 사전 정산하는 금액을 말합니다.",
        "( ): 진료항목 중 선택항목은 요양기관의 특성에 따라 추가 또는 생략할 수 있습니다.",
    };

    private static readonly string[] GeneralNotes =
    {
        "1. 이 계산서 영수증에 대한 세부내용은 요양기관에 요구하여 제공받을 수 있습니다.",
        "2. 『국민건강보험법』 제43조의2 또는 『의료급여법』 제11조의3에 따라 환자가 전액 부담한 비용과 비급여로 부담한 비용의 타당성 여부를 건강보험심사평가원(☏1644-2000, 홈페이지: www.hira.or.kr)에 확인 요청하실 수 있습니다.",
        "3. 계산서·영수증은 『소득세법』에 따른 의료비 공제신청 또는 『조세특례제한법』에 따른 현금영수증 공제신청(현금영수증 승인번호가 적힌 경우만 해당합니다)에 사용할 수 있습니다. 다만, 지출증빙용으로 발급된 \"현금영수증(지출증빙)\"은 공제신청에 사용할 수 없습니다. (현금영수증 문의 126 인터넷 홈페이지: http://현금영수증.kr)",
    };

    public static DocPage Draw(ReceiptVisit visit, DocContext ctx)
    {
        if (visit == null) throw new ArgumentNullException(nameof(visit));
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        var page = new PageBuilder(ctx.WidthMm);

        Title(page);
        Header(page, visit, ctx);
        Table(page, visit);
        Panel(page, visit, ctx);
        Footer(page, visit, ctx);
        Notes(page);

        IReadOnlyDictionary<string, byte[]>? images = null;
        if (ctx.Seal != null)
        {
            // 대표자 [인] 칸 가운데에 겹쳐 찍는다(비트 서식의 [인] 자리)
            page.Image(185.5f, FooterTop + 10.5f, 13f, 13f, DocContext.SealKey);
            images = new Dictionary<string, byte[]>(StringComparer.Ordinal) { [DocContext.SealKey] = ctx.Seal };
        }
        return new DocPage(page.Ops, images);
    }

    // ── 머리 ─────────────────────────────

    private static void Title(PageBuilder page)
    {
        page.Text(Left, 8f, Right - Left, 6f, "[V]외래 [ ]입원 ([ ]퇴원 [ ]중간)", 9f);
        page.Text(Left, 14f, Right - Left, 10f, "진료비 계산서·영수증", 17f, bold: true);
    }

    private static void Header(PageBuilder page, ReceiptVisit visit, DocContext ctx)
    {
        const float top = 26f;
        const float aLabel = 31f, aValue = 37f, bLabel = 42f, bottom = 48f;
        page.Box(Left, top, Right - Left, bottom - top, PageBuilder.Thick);
        page.Line(Left, aLabel, Right, aLabel, PageBuilder.Thin);
        page.Line(Left, aValue, Right, aValue, PageBuilder.Normal);
        page.Line(Left, bLabel, Right, bLabel, PageBuilder.Thin);

        var period = visit.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var night = (visit.Night ? "[V]" : "[ ]") + "야간" + (visit.Holiday ? "[V]" : "[ ]") + "공휴일";
        Cells(page, top, aLabel, aValue, new[] { Left, 46f, 80f, 150f, Right },
            new[] { "환자등록번호", "환자 성명", "진료기간", "야간(공휴일)진료" },
            new[] { ctx.Chart, ctx.Patient.Name, period + " ~ " + period, night });
        Cells(page, aValue, bLabel, bottom, new[] { Left, 46f, 80f, 104f, 140f, Right },
            new[] { "진료과목", "질병군(DRG)번호", "병실", "환자구분", "영수증번호(연월-일련번호)" },
            new[] { visit.Department, "", "", visit.PatientClass, visit.ReceiptNoText });
    }

    /// <summary>이름표 줄(top~mid)과 값 줄(mid~bottom), 칸 경계 xs에 세로선.</summary>
    private static void Cells(PageBuilder page, float top, float mid, float bottom, float[] xs, string[] labels, string[] values)
    {
        for (var i = 0; i < labels.Length; i++)
        {
            var x = xs[i];
            var w = xs[i + 1] - x;
            if (i > 0) page.Line(x, top, x, bottom, PageBuilder.Thin);
            page.Text(x, top, w, mid - top, labels[i], LabelPt);
            page.Text(x, mid, w, bottom - mid, values[i], 8.5f);
        }
    }

    // ── 가운데 표 ─────────────────────────────

    private static float RowY(int row) => HeadBottom + (row * RowH);

    private static void Table(PageBuilder page, ReceiptVisit visit)
    {
        const float h1 = 55f, h2 = 60f;
        page.Box(Left, TableTop, Right - Left, TableBottom - TableTop, PageBuilder.Thick);
        page.Text(GroupX, TableTop, OwnX - GroupX, HeadBottom - TableTop, "항 목", 8f, bold: true);
        page.Text(OwnX, TableTop, NonX - OwnX, h1 - TableTop, "급 여", 8f, bold: true);
        page.Text(OwnX, h1, FullX - OwnX, h2 - h1, "일부 본인부담", LabelPt);
        page.Text(OwnX, h2, CorpX - OwnX, HeadBottom - h2, "본인부담금", LabelPt);
        page.Text(CorpX, h2, FullX - CorpX, HeadBottom - h2, "공단부담금", LabelPt);
        page.Text(FullX, h1, NonX - FullX, HeadBottom - h1, "전액 본인부담", LabelPt);
        page.Text(NonX, TableTop, PanelX - NonX, HeadBottom - TableTop, "비급여", 8f, bold: true);
        page.Text(PanelX, TableTop, Right - PanelX, HeadBottom - TableTop, "금액산정내용", 8f, bold: true);
        page.Line(OwnX, h1, NonX, h1, PageBuilder.Thin);
        page.Line(OwnX, h2, FullX, h2, PageBuilder.Thin);
        page.Line(Left, HeadBottom, Right, HeadBottom, PageBuilder.Normal);

        // 세로선: 이름|금액 경계·금액 열·금액산정내용 경계
        var capTop = RowY(CapRow);
        page.Line(OwnX, TableTop, OwnX, TableBottom, PageBuilder.Normal);
        page.Line(CorpX, h2, CorpX, capTop, PageBuilder.Thin);
        page.Line(FullX, h1, FullX, capTop, PageBuilder.Thin);
        page.Line(NonX, TableTop, NonX, capTop, PageBuilder.Thin);
        page.Line(PanelX, TableTop, PanelX, TableBottom, PageBuilder.Normal);
        page.Line(ItemX, HeadBottom, ItemX, RowY(TotalRow), PageBuilder.Thin);

        // 묶음 이름(세로 한 글자씩)
        page.Stack(GroupX, RowY(0), ItemX - GroupX, BasicRows * RowH, "기본항목", LabelPt);
        page.Stack(GroupX, RowY(BasicRows), ItemX - GroupX, (ItemRows - BasicRows) * RowH, "선택항목", LabelPt);

        // 줄 이름
        for (var row = 0; row < ItemRows; row++)
        {
            var span = Spans.FirstOrDefault(s => row >= s.First && row < s.First + s.Count);
            if (span.Name != null)
            {
                if (row == span.First)
                {
                    page.Text(ItemX, RowY(row), SubX - ItemX, span.Count * RowH, span.Name, ItemPt);
                    page.Line(SubX, RowY(row), SubX, RowY(row + span.Count), PageBuilder.Thin);
                }
                page.Text(SubX, RowY(row), OwnX - SubX, RowH, RowNames[row], ItemPt);
            }
            else
            {
                page.Text(ItemX, RowY(row), OwnX - ItemX, RowH, RowNames[row], ItemPt);
            }
        }
        page.Text(GroupX, RowY(TotalRow), OwnX - GroupX, RowH, "합 계", 7.5f, bold: true);
        page.Text(GroupX, RowY(CapRow), OwnX - GroupX, RowH, "상한액 초과금", ItemPt);

        // 줄 경계: 묶음 경계·합계 위아래는 왼쪽 끝부터, 나눔 줄 안은 나눔 이름부터
        for (var b = 1; b <= CapRow; b++)
        {
            var inSpan = Spans.Any(s => b > s.First && b < s.First + s.Count);
            var start = b == BasicRows || b >= TotalRow ? Left : inSpan ? SubX : ItemX;
            page.Line(start, RowY(b), PanelX, RowY(b), b >= TotalRow ? PageBuilder.Normal : PageBuilder.Thin);
        }

        // 금액
        var amounts = new long[ItemRows, 4];
        foreach (var item in visit.Items)
        {
            var row = RowOfCode.TryGetValue(item.Code, out var mapped) ? mapped : OtherRow;
            amounts[row, 0] += item.Own;
            amounts[row, 1] += item.Corp;
            amounts[row, 2] += item.Full;
            amounts[row, 3] += item.NonPay;
        }
        var selective = visit.Selective;
        amounts[SelectiveRow, 0] += selective.Own;
        amounts[SelectiveRow, 1] += selective.Corp;

        var columns = new[] { OwnX, CorpX, FullX, NonX, PanelX };
        for (var row = 0; row < ItemRows; row++)
        {
            for (var col = 0; col < 4; col++)
            {
                var value = amounts[row, col];
                if (value != 0) page.Text(columns[col], RowY(row), columns[col + 1] - columns[col], RowH, Won(value), AmountPt, align: DocAlign.Right);
            }
        }

        // 합계 ①~④: OrpInf 저장 값(급여 본인부담·공단은 선별급여 줄을 더함), 전액 본인부담은 항목 합
        var totals = new[] { visit.InsOwn + selective.Own, visit.Corp + selective.Corp, visit.FullTotal, visit.NonPay };
        var marks = new[] { "①", "②", "③", "④" };
        for (var col = 0; col < 4; col++)
        {
            var x = columns[col];
            var w = columns[col + 1] - x;
            page.Text(x - 0.5f, RowY(TotalRow), 4.5f, RowH, marks[col], 5f, align: DocAlign.Left);
            page.Text(x, RowY(TotalRow), w, RowH, Won(totals[col]), AmountPt, bold: true, align: DocAlign.Right);
        }
        page.Text(OwnX - 0.5f, RowY(CapRow), 4.5f, RowH, "⑤", 5f, align: DocAlign.Left);
    }

    // ── 금액산정내용 ─────────────────────────────

    private static void Panel(PageBuilder page, ReceiptVisit visit, DocContext ctx)
    {
        var selective = visit.Selective;
        var corpTotal = visit.Corp + selective.Corp; // ② (+ ⑤ 상한액 초과금: 저장 칸 없음 → 0)
        var due = visit.PatientTotal; // ⑩ = ⑧ − ⑨(외래는 이미 낸 돈 0)
        var paid = visit.Cash + visit.Card + visit.Account;
        var cash = Math.Max(0, visit.Cash + visit.Account - visit.CashReceipt);

        var y = HeadBottom;
        y = Amount(page, y, 9f, "⑥ 진료비 총액", null, visit.Total);
        y = Amount(page, y, 9f, "⑦ 공단부담 총액", "(②+⑤)", corpTotal);
        y = Amount(page, y, 9f, "⑧ 환자부담 총액", "(①-⑤)+③+④", visit.PatientTotal);
        y = Amount(page, y, 9f, "⑨ 이미 납부한 금액", null, 0);
        y = Amount(page, y, 9f, "⑩ 납부할 금액", "(⑧-⑨)", due);

        // ⑪ 납부한 금액: 카드·현금영수증·현금·합계
        const float sub = 6f;
        page.Text(PanelX, y, PanelSubX - PanelX, 4 * sub / 2, "⑪ 납부한", 6.5f);
        page.Text(PanelX, y + (2 * sub), PanelSubX - PanelX, 4 * sub / 2, "금액", 6.5f);
        page.Line(PanelSubX, y, PanelSubX, y + (4 * sub), PageBuilder.Thin);
        var labels = new[] { "카드", "현금영수증", "현금", "합계" };
        var values = new[] { visit.Card, visit.CashReceipt, cash, paid };
        for (var i = 0; i < 4; i++)
        {
            var top = y + (i * sub);
            if (i > 0) page.Line(PanelSubX, top, Right, top, PageBuilder.Thin);
            page.Text(PanelSubX, top, PanelValueX - PanelSubX, sub, labels[i], 6.5f);
            page.Text(PanelValueX, top, Right - PanelValueX, sub, Won(values[i]), 8f, align: DocAlign.Right);
        }
        y += 4 * sub;
        page.Line(PanelX, y, Right, y, PageBuilder.Thin);
        y = Amount(page, y, 9f, "납부하지 않은 금액", "(⑩-⑪)", due - paid);

        // 현금영수증: 신분확인번호는 읽지 않아 비움, 현금승인번호
        page.Text(PanelX, y, PanelSubX - PanelX, 2 * sub, "현금영수증", 6.5f);
        page.Line(PanelSubX, y, PanelSubX, y + (2 * sub), PageBuilder.Thin);
        page.Text(PanelSubX, y, PanelValueX - PanelSubX, sub, "신분확인번호", 6.5f);
        page.Line(PanelSubX, y + sub, Right, y + sub, PageBuilder.Thin);
        page.Text(PanelSubX, y + sub, PanelValueX - PanelSubX, sub, "현금승인번호", 6.5f);
        page.Text(PanelValueX, y + sub, Right - PanelValueX, sub, visit.CashApproval, 7.5f, align: DocAlign.Right);
        page.Line(PanelValueX, HeadBottom, PanelValueX, y + (2 * sub), PageBuilder.Thin);
        y += 2 * sub;
        page.Line(PanelX, y, Right, y, PageBuilder.Normal);

        // *요양기관 임의활용공간: 비트가 쓰는 이름표로 있는 값만, 끝에 출력일자
        page.Text(PanelX, y + 0.5f, Right - PanelX, 4.5f, "*요양기관 임의활용공간", 6.5f, align: DocAlign.Left);
        var lines = new List<string>();
        if (visit.DisabledFund != 0) lines.Add("장애인기금 : " + Won(visit.DisabledFund));
        if (visit.Support != 0) lines.Add("지원금 : " + Won(visit.Support));
        if (visit.HealthAllowance != 0) lines.Add("건강생활지원금 : " + Won(visit.HealthAllowance));
        if (visit.Account != 0) lines.Add("계좌입금 : " + Won(visit.Account));
        lines.Add("출력일자 : " + ctx.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        var line = y + 5.5f;
        foreach (var text in lines)
        {
            if (line + 4.2f > TableBottom) break;
            page.Text(PanelX, line, Right - PanelX, 4.2f, text, 7f, align: DocAlign.Left);
            line += 4.2f;
        }
    }

    /// <summary>금액산정내용 한 칸: 왼쪽 이름(식이 있으면 아래에 작게), 오른쪽 값. 다음 칸 위 끝을 돌려준다.</summary>
    private static float Amount(PageBuilder page, float y, float h, string label, string? formula, long value)
    {
        if (formula == null)
        {
            page.Text(PanelX, y, PanelValueX - PanelX, h, label, LabelPt);
        }
        else
        {
            page.Text(PanelX, y + 0.3f, PanelValueX - PanelX, h / 2, label, LabelPt);
            page.Text(PanelX, y + (h / 2) - 0.3f, PanelValueX - PanelX, h / 2, formula, 6f);
        }
        page.Text(PanelValueX, y, Right - PanelValueX, h, Won(value), 8f, bold: true, align: DocAlign.Right);
        page.Line(PanelX, y + h, Right, y + h, PageBuilder.Thin);
        return y + h;
    }

    // ── 아래 ─────────────────────────────

    private static void Footer(PageBuilder page, ReceiptVisit visit, DocContext ctx)
    {
        const float top = FooterTop, r1 = top + 6f, r2 = top + 13f, bottom = top + 27f;
        var hospital = ctx.Hospital;
        page.Box(Left, top, Right - Left, bottom - top, PageBuilder.Thick);
        page.Line(Left, r1, Right, r1, PageBuilder.Thin);
        page.Line(Left, r2, Right, r2, PageBuilder.Thin);
        page.Line(40f, top, 40f, bottom, PageBuilder.Thin);

        page.Text(Left, top, 40f - Left, r1 - top, "요양기관 종류", LabelPt);
        page.Text(40f, top, Right - 40f, r1 - top, "[V]의원급·보건기관 [ ]병원급, [ ]종합병원, [ ]상급종합병원", 7.5f, align: DocAlign.Left);

        foreach (var x in new[] { 80f, 96f, 150f, 166f }) page.Line(x, r1, x, r2, PageBuilder.Thin);
        page.Text(Left, r1, 40f - Left, r2 - r1, "사업자등록번호", LabelPt);
        page.Text(40f, r1, 80f - 40f, r2 - r1, BusinessNumber(hospital.BusinessNumber), 8f);
        page.Text(80f, r1, 96f - 80f, r2 - r1, "상 호", LabelPt);
        page.Text(96f, r1, 150f - 96f, r2 - r1, hospital.ReceiptName.Length > 0 ? hospital.ReceiptName : hospital.Name, 8.5f, bold: true);
        page.Text(150f, r1, 166f - 150f, r2 - r1, "전화번호", LabelPt);
        page.Text(166f, r1, Right - 166f, r2 - r1, hospital.Phone, 8f);

        foreach (var x in new[] { 150f, 166f, 186f }) page.Line(x, r2, x, bottom, PageBuilder.Thin);
        page.Text(Left, r2, 40f - Left, bottom - r2, "사업장 소재지", LabelPt);
        page.Text(40f, r2, 150f - 40f, bottom - r2, hospital.Address, 8f, align: DocAlign.Left);
        page.Text(150f, r2, 166f - 150f, bottom - r2, "대표자", LabelPt);
        page.Text(166f, r2, 186f - 166f, bottom - r2, hospital.Owner, 8.5f);
        page.Text(186f, r2, Right - 186f, bottom - r2, "[인]", LabelPt);

        var day = visit.PaidDay ?? visit.Date;
        page.Text(110f, bottom + 1f, Right - 110f, 6f, day.Year.ToString(CultureInfo.InvariantCulture) + " 년 " + day.Month.ToString(CultureInfo.InvariantCulture) + " 월 " + day.Day.ToString(CultureInfo.InvariantCulture) + " 일", 9f, align: DocAlign.Right);
    }

    private static void Notes(PageBuilder page)
    {
        const float top = FooterTop + 35f, bottom = 290f, mid = 105f;
        page.Box(Left, top, Right - Left, bottom - top, PageBuilder.Normal);
        page.Line(mid, top, mid, bottom, PageBuilder.Thin);
        page.Text(Left, top + 0.5f, mid - Left, 4.5f, "항목별 설명", LabelPt, bold: true, align: DocAlign.Left);
        page.Text(mid, top + 0.5f, Right - mid, 4.5f, "일반사항 안내", LabelPt, bold: true, align: DocAlign.Left);
        page.Paragraphs(Left, top + 5.5f, mid - Left, bottom - 0.5f, ItemNotes, 5.5f);
        page.Paragraphs(mid, top + 5.5f, Right - mid, bottom - 0.5f, GeneralNotes, 5.5f);
    }

    // ── 글 모양 ─────────────────────────────

    /// <summary>원 단위 금액: 1,000 단위 쉼표.</summary>
    public static string Won(long value) => value.ToString("#,##0", CultureInfo.InvariantCulture);

    /// <summary>사업자등록번호: 숫자 10자리면 3-2-5로 나눠 적고, 그 밖은 그대로.</summary>
    private static string BusinessNumber(string number)
    {
        var text = (number ?? "").Trim();
        return text.Length == 10 && text.All(c => c >= '0' && c <= '9') ? text.Substring(0, 3) + "-" + text.Substring(3, 2) + "-" + text.Substring(5) : text;
    }
}
