using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.PtSlip;

namespace Precheck.Core.DocPrint.Docs.RxCopy;

/// <summary>
/// 처방전 사본 한 장 그리기(AC-7406.1): A4 세로, 의료법 시행규칙 별지 제9호서식·비트 BITOutSlip 글(notes/forms.md §3)의 칸 차례.
/// 환자보관용([환자보관용]) + 사본 글(&lt;사본이므로 조제불가&gt;), 바코드·도장 그림 없음. 약은 한 쪽에 RowsPerPage줄, 넘치면 머리 칸을 다시 그린 다음 쪽에 잇는다(쪽 표시 n/N).
/// 칸 자리는 견본 PDF가 오면 맞춘다(TASK-8). 글은 모두 DocContext.WidthMm로 재서 칸에 맞춘다(글씨 줄이기, 약 이름은 두 줄까지).
/// </summary>
internal static class RxCopyLayout
{
    /// <summary>한 쪽 약 줄 수.</summary>
    public const int RowsPerPage = 14;

    public const string PatientCopy = "[환자보관용]";
    public const string CopyNote = "<사본이므로 조제불가>";

    private const float Left = 12f;
    private const float Right = 198f;
    private const float Mid = 105f;
    private const float Thin = 0.15f;
    private const float Thick = 0.4f;
    private const float LabelPt = 9f;
    private const float ValuePt = 10f;
    private const float MinPt = 6f;

    // 머리 칸(교부·환자 | 의료기관)
    private const float HeadTop = 38f;
    private const float LeftLabel = 44f;
    private const float PatientLabel = 22f;
    private const float OrgLabel = 119f;
    private const float OrgValue = 140f;

    // 상병·의사
    private const float DxTop = 66f;
    private const float DxMid = 73f;
    private const float NoticeTop = 80f;

    // 약 표: 명칭(코드 | 이름) · 1회 투약량 · 1일 투여횟수 · 총 투약일수 · 본인부담 구분기호 · 용법
    private const float TableTop = 86f;
    private const float RowsTop = 96f;
    private const float RowHeight = 7.5f;
    private const float CodeRight = 32f;
    private static readonly float[] Columns = { Left, 104f, 124f, 143f, 162f, 180f, Right };

    private const float RowsBottom = RowsTop + RowsPerPage * RowHeight;
    private const float InjectionBody = RowsBottom + 7f;
    private const float PeriodTop = InjectionBody + 17f;
    private const float FrameBottom = PeriodTop + 8f;

    // 의약품 조제내역
    private const float MadeTop = FrameBottom + 3f;
    private const float MadeRows = MadeTop + 7f;
    private const float MadeRow = 8f;
    private const float MadeLabel = 47f;
    private const float MadeChange = 120f;

    public static IReadOnlyList<DocPage> Pages(RxSlip slip, DocContext ctx)
    {
        var chunks = new List<RxLine[]>();
        for (var start = 0; start < slip.Lines.Count; start += RowsPerPage)
        {
            chunks.Add(slip.Lines.Skip(start).Take(RowsPerPage).ToArray());
        }
        return chunks.Select((lines, index) => Page(slip, ctx, lines, index + 1, chunks.Count)).ToArray();
    }

    private static DocPage Page(RxSlip slip, DocContext ctx, IReadOnlyList<RxLine> lines, int number, int count)
    {
        var page = new Builder(ctx.WidthMm);
        Top(page, slip, ctx, number, count);
        Head(page, slip, ctx);
        Doctor(page, slip);
        Drugs(page, lines);
        Lower(page);
        Made(page);
        return new DocPage(page.Ops);
    }

    private static void Top(Builder page, RxSlip slip, DocContext ctx, int number, int count)
    {
        var options = new[]
        {
            (RxInsurance.Health, "1 의료보험", 22f),
            (RxInsurance.Aid, "2 의료보호", 22f),
            (RxInsurance.Industrial, "3 산재보험", 22f),
            (RxInsurance.Auto, "4 자동차보험", 26f),
            (RxInsurance.Other, "5 기타 (       )", 30f),
        };
        var x = Left;
        foreach (var (kind, label, width) in options)
        {
            var op = page.Tight(x, 10f, width, 6f, label, LabelPt);
            if (op != null && kind == slip.Insurance) page.Box(op.X - 0.8f, op.Y - 0.3f, op.Width + 1.6f, op.Height + 0.6f, Thin);
            x += width;
        }
        page.Cell(140f, 10f, Right - 140f, 6f, "요양기관기호 : " + ctx.Hospital.InstitutionNumber, LabelPt, align: DocAlign.Right);

        page.Cell(60f, 18f, 90f, 12f, "처    방    전", 20f, bold: true, align: DocAlign.Center);
        page.Cell(150f, 18f, 40f, 12f, PatientCopy, 11f, bold: true);
        page.Cell(60f, 30f, 90f, 6f, CopyNote, 10f, bold: true, align: DocAlign.Center);
        if (count > 1) page.Cell(160f, 30f, Right - 160f, 6f, "인쇄페이지 " + number + "/" + count, 8f, align: DocAlign.Right);
    }

    private static void Head(Builder page, RxSlip slip, DocContext ctx)
    {
        // 왼쪽: 교부 연월일 및 번호(7) · 환자 성명(10.5) · 주민등록번호(10.5)
        page.Cell(Left, HeadTop, LeftLabel - Left, 7f, "교부 연월일 및 번호", LabelPt);
        page.Cell(LeftLabel, HeadTop, Mid - LeftLabel, 7f, slip.Issue, ValuePt);
        page.Cell(Left, HeadTop + 7f, PatientLabel - Left, 21f, "환자", LabelPt, align: DocAlign.Center);
        page.Cell(PatientLabel, HeadTop + 7f, LeftLabel - PatientLabel, 10.5f, "성명", LabelPt, align: DocAlign.Center);
        page.Cell(LeftLabel, HeadTop + 7f, Mid - LeftLabel, 10.5f, ctx.Patient.Name, ValuePt);
        page.Cell(PatientLabel, HeadTop + 17.5f, LeftLabel - PatientLabel, 10.5f, "주민등록번호", LabelPt, align: DocAlign.Center);
        page.Cell(LeftLabel, HeadTop + 17.5f, Mid - LeftLabel, 10.5f, slip.Resident, ValuePt);

        // 오른쪽: 의료기관 명칭 · 전화번호 · 팩스번호 · E-mail 주소(7씩)
        var hospital = ctx.Hospital.Name.Length > 0 ? ctx.Hospital.Name : ctx.Hospital.ReceiptName;
        page.Cell(Mid, HeadTop, OrgLabel - Mid, 28f, "의료기관", LabelPt, align: DocAlign.Center);
        var rows = new[] { ("명칭", hospital), ("전화번호", ctx.Hospital.Phone), ("팩스번호", ctx.Hospital.Fax), ("E-mail 주소", "") };
        for (var i = 0; i < rows.Length; i++)
        {
            var y = HeadTop + 7f * i;
            page.Cell(OrgLabel, y, OrgValue - OrgLabel, 7f, rows[i].Item1, LabelPt, align: DocAlign.Center);
            page.Cell(OrgValue, y, Right - OrgValue, 7f, rows[i].Item2, ValuePt);
            if (i > 0) page.Line(OrgLabel, y, Right, y, Thin);
        }

        page.Line(Left, HeadTop + 7f, Mid, HeadTop + 7f, Thin);
        page.Line(PatientLabel, HeadTop + 17.5f, Mid, HeadTop + 17.5f, Thin);
        page.Line(PatientLabel, HeadTop + 7f, PatientLabel, DxTop, Thin);
        page.Line(LeftLabel, HeadTop, LeftLabel, NoticeTop, Thin);
        page.Line(Mid, HeadTop, Mid, NoticeTop, Thin);
        page.Line(OrgLabel, HeadTop, OrgLabel, DxTop, Thin);
        page.Line(OrgValue, HeadTop, OrgValue, DxTop, Thin);
        page.Line(Left, DxTop, Right, DxTop, Thin);
    }

    private static void Doctor(Builder page, RxSlip slip)
    {
        page.Cell(Left, DxTop, LeftLabel - Left, NoticeTop - DxTop, "질병분류기호", LabelPt, align: DocAlign.Center);
        page.Cell(LeftLabel, DxTop, Mid - LeftLabel, NoticeTop - DxTop, slip.MainDx, ValuePt + 1f, bold: true);

        page.Cell(Mid, DxTop, 35f, 7f, "처방 의료인의 성명", LabelPt, align: DocAlign.Center);
        page.Cell(140f, DxTop, 32f, 7f, slip.Doctor, ValuePt);
        page.Cell(172f, DxTop, Right - 172f, 7f, "(서명 또는 날인)", 8f, align: DocAlign.Right);
        page.Cell(Mid, DxMid, 20f, 7f, "면허종별", LabelPt, align: DocAlign.Center);
        page.Cell(125f, DxMid, 20f, 7f, "의사", ValuePt, align: DocAlign.Center);
        page.Cell(145f, DxMid, 20f, 7f, "면허번호", LabelPt, align: DocAlign.Center);
        page.Cell(165f, DxMid, Right - 165f, 7f, slip.License, ValuePt);

        page.Line(Mid, DxMid, Right, DxMid, Thin);
        page.Line(140f, DxTop, 140f, DxMid, Thin);
        page.Line(125f, DxMid, 125f, NoticeTop, Thin);
        page.Line(145f, DxMid, 145f, NoticeTop, Thin);
        page.Line(165f, DxMid, 165f, NoticeTop, Thin);
        page.Line(Left, NoticeTop, Right, NoticeTop, Thin);

        page.Cell(Left, NoticeTop, Right - Left, TableTop - NoticeTop, "※ 환자의 요구가 있는 때에는 질병분류기호를 기재하지 아니합니다.", 8f);
        page.Line(Left, TableTop, Right, TableTop, Thin);
    }

    private static void Drugs(Builder page, IReadOnlyList<RxLine> lines)
    {
        var head = RowsTop - TableTop;
        page.Cell(Columns[0], TableTop, Columns[1] - Columns[0], head, "처방 의약품의 명칭", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[1], TableTop, Columns[2] - Columns[1], head, "1회 투약량", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[2], TableTop, Columns[3] - Columns[2], head, "1일 투여횟수", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[3], TableTop, Columns[4] - Columns[3], head, "총 투약일수", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[4], TableTop, Columns[5] - Columns[4], head / 2f, "본인부담", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[4], TableTop + head / 2f, Columns[5] - Columns[4], head / 2f, "구분기호", LabelPt, align: DocAlign.Center);
        page.Cell(Columns[5], TableTop, Columns[6] - Columns[5], head, "용      법", LabelPt, align: DocAlign.Center);
        page.Line(Left, RowsTop, Right, RowsTop, Thin);

        for (var i = 0; i < lines.Count; i++)
        {
            var y = RowsTop + RowHeight * i;
            var line = lines[i];
            page.Cell(Columns[0], y, CodeRight - Columns[0], RowHeight, line.Code, 8f);
            page.TwoLines(CodeRight, y, Columns[1] - CodeRight, RowHeight, line.Name, 9f, 6.5f);
            page.Cell(Columns[1], y, Columns[2] - Columns[1], RowHeight, line.Qty, ValuePt, align: DocAlign.Center);
            page.Cell(Columns[2], y, Columns[3] - Columns[2], RowHeight, line.Times, ValuePt, align: DocAlign.Center);
            page.Cell(Columns[3], y, Columns[4] - Columns[3], RowHeight, line.Days, ValuePt, align: DocAlign.Center);
        }
        for (var i = 1; i < RowsPerPage; i++) page.Line(Left, RowsTop + RowHeight * i, Right, RowsTop + RowHeight * i, Thin);
        for (var i = 1; i < Columns.Length - 1; i++) page.Line(Columns[i], TableTop, Columns[i], RowsBottom, Thin);
        page.Line(Left, RowsBottom, Right, RowsBottom, Thin);
    }

    private static void Lower(Builder page)
    {
        page.Cell(Left, RowsBottom, 140f - Left, InjectionBody - RowsBottom, "주사제 처방내역(원내조제 □, 원외처방 □)", LabelPt);
        page.Cell(140f, RowsBottom, Right - 140f, InjectionBody - RowsBottom, "조제시 참고사항", LabelPt, align: DocAlign.Center);
        page.Line(Left, InjectionBody, Right, InjectionBody, Thin);
        page.Line(140f, RowsBottom, 140f, PeriodTop, Thin);
        page.Line(Left, PeriodTop, Right, PeriodTop, Thin);

        page.Cell(Left, PeriodTop, LeftLabel - Left, FrameBottom - PeriodTop, "사용기간", LabelPt, align: DocAlign.Center);
        page.Cell(LeftLabel, PeriodTop, Mid - LeftLabel, FrameBottom - PeriodTop, "교부일부터 (       ) 일간", LabelPt, align: DocAlign.Center);
        page.Cell(Mid, PeriodTop, Right - Mid, FrameBottom - PeriodTop, "사용기간 내에 약국에 제출하여야 합니다.", LabelPt, align: DocAlign.Center);
        page.Line(LeftLabel, PeriodTop, LeftLabel, FrameBottom, Thin);
        page.Line(Mid, PeriodTop, Mid, FrameBottom, Thin);

        page.Box(Left, HeadTop, Right - Left, FrameBottom - HeadTop, Thick);
    }

    private static void Made(Builder page)
    {
        var bottom = MadeRows + MadeRow * 4f;
        page.Cell(Left, MadeTop, Right - Left, MadeRows - MadeTop, "의 약 품 조 제 내 역", 10f, bold: true, align: DocAlign.Center);
        page.Line(Left, MadeRows, Right, MadeRows, Thin);
        var labels = new[] { "조제기관의 명칭", "조제약사 성명", "조제량(조제일수)", "조제연월일" };
        for (var i = 0; i < labels.Length; i++)
        {
            var y = MadeRows + MadeRow * i;
            page.Cell(Left, y, MadeLabel - Left, MadeRow, labels[i], LabelPt, align: DocAlign.Center);
            if (i > 0) page.Line(Left, y, MadeChange, y, Thin);
        }
        page.Cell(MadeLabel, MadeRows + MadeRow, MadeChange - MadeLabel, MadeRow, "(서명 또는 날인)", 8f, align: DocAlign.Right);
        page.Cell(MadeChange, MadeRows, Right - MadeChange, MadeRow, "처방의 변경·수정·확인·대체 시 그 내용 등", LabelPt, align: DocAlign.Center);
        page.Line(MadeLabel, MadeRows, MadeLabel, bottom, Thin);
        page.Line(MadeChange, MadeRows, MadeChange, bottom, Thin);
        page.Box(Left, MadeTop, Right - Left, bottom - MadeTop, Thick);
    }

    /// <summary>쪽 그리기 글 모으기. 글은 칸 안쪽(가로 1mm·세로 0.5mm 띄움)에 넣고, 칸에 들어가도록 글씨를 줄이며 MinPt에서도 넘치면 끝을 '…'로 줄인다.</summary>
    private sealed class Builder
    {
        private const float PadX = 1f;
        private const float PadY = 0.5f;
        private const float Step = 0.5f;
        private const float Epsilon = 0.001f;

        /// <summary>굵은 글은 보통 글로 잰 폭보다 조금 넓어 여유를 둔다.</summary>
        private const float BoldWidth = 1.06f;

        private readonly Func<string, float, float> widthMm;

        public Builder(Func<string, float, float> widthMm)
        {
            this.widthMm = widthMm;
        }

        public List<DocOp> Ops { get; } = new List<DocOp>();

        public void Line(float x1, float y1, float x2, float y2, float stroke) => Ops.Add(DocOp.Line(x1, y1, x2, y2, stroke));

        public void Box(float x, float y, float width, float height, float stroke) => Ops.Add(DocOp.Box(x, y, width, height, stroke));

        /// <summary>칸 하나에 한 줄. 빈 글이면 아무것도 넣지 않는다.</summary>
        public DocOp? Cell(float x, float y, float width, float height, string text, float pt, bool bold = false, DocAlign align = DocAlign.Left)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            var boxW = width - 2 * PadX;
            var boxH = height - 2 * PadY;
            var (fitted, size) = FitOne(text, boxW, boxH, pt, bold);
            var op = DocOp.Text(x + PadX, y + PadY, boxW, boxH, fitted, size, bold, align);
            Ops.Add(op);
            return op;
        }

        /// <summary>칸 왼쪽에 글 폭만큼만(표시 네모를 글에 꼭 맞게 두르려고).</summary>
        public DocOp? Tight(float x, float y, float width, float height, string text, float pt)
        {
            var op = Cell(x, y, width, height, text, pt);
            if (op == null) return null;
            Ops.RemoveAt(Ops.Count - 1);
            var tight = Math.Min(op.Width, Measure(op.Value, op.Pt, false) + 0.3f);
            var narrow = DocOp.Text(op.X, op.Y, tight, op.Height, op.Value, op.Pt);
            Ops.Add(narrow);
            return narrow;
        }

        /// <summary>약 이름: 한 줄(maxPt부터 줄임) → 두 줄(낱말, 긴 낱말은 글자 단위) → minPt 두 줄 끝 '…'(PtSlip.SlipFitter 규칙).</summary>
        public void TwoLines(float x, float y, float width, float height, string text, float maxPt, float minPt)
        {
            if (string.IsNullOrWhiteSpace(text)) return;
            var boxW = width - 2 * PadX;
            var boxH = height - 2 * PadY;
            var fit = SlipFitter.Fit(text, boxW, boxH, maxPt, minPt, widthMm);
            if (fit.Lines.Count == 1)
            {
                Ops.Add(DocOp.Text(x + PadX, y + PadY, boxW, boxH, fit.Lines[0], fit.SizePt));
                return;
            }
            var lineH = SlipFitter.LineHeightMm(fit.SizePt);
            var top = y + height / 2f - lineH * fit.Lines.Count / 2f;
            for (var i = 0; i < fit.Lines.Count; i++)
            {
                Ops.Add(DocOp.Text(x + PadX, top + lineH * i, boxW, lineH, fit.Lines[i], fit.SizePt));
            }
        }

        private (string Text, float Pt) FitOne(string text, float boxW, float boxH, float maxPt, bool bold)
        {
            for (var pt = maxPt; pt >= MinPt - Epsilon; pt -= Step)
            {
                if (SlipFitter.LineHeightMm(pt) <= boxH + Epsilon && Measure(text, pt, bold) <= boxW + Epsilon) return (text, pt);
            }
            for (var take = text.Length - 1; take > 0; take--)
            {
                var shorter = text.Substring(0, take).TrimEnd() + "…";
                if (Measure(shorter, MinPt, bold) <= boxW + Epsilon) return (shorter, MinPt);
            }
            return ("…", MinPt);
        }

        private float Measure(string text, float pt, bool bold) => widthMm(text, pt) * (bold ? BoldWidth : 1f);
    }
}
