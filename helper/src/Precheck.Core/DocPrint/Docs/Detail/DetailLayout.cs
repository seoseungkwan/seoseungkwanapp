using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.DocPrint.Docs.Detail;

/// <summary>
/// 진료비 세부내역서 A4 세로 그리기(spec doc-print AC-7406.1). 비트 BITPaymentPrint의 '진료비 세부산정내역' 글·칸 차례(notes/forms.md §2)를 따르고,
/// 자리·크기는 견본 PDF가 오면 맞춘다(지금은 추정). 고른 날 전체가 한 서류: 쪽마다 제목·쪽 번호·환자 머리·표 머리를 다시 그리고,
/// 줄은 날짜순·항목 묶음 차례, 마지막 쪽에만 【계】·【끝자리 조정금액】·【합계】·발급 문장·직인·일반사항 안내.
/// 글은 모두 DocContext.WidthMm로 재서 칸 안에 넣는다(글씨 줄이기 → 이름은 두 줄 → 그래도 길면 '…').
/// </summary>
public static class DetailLayout
{
    public const float Left = 10f;
    public const float Right = 200f;
    public const float Bottom = 287f;

    private const float MmPerPt = 0.3528f;
    private const float LineSpacing = 1.2f;
    private const float StepPt = 0.5f;
    private const float Eps = 0.001f;
    private const float Pad = 0.6f;
    private const string Ellipsis = "…";

    private const float TitleY = 11f;
    private const float PatientY = 24f;
    private const float PatientLabelH = 5f;
    private const float PatientValueH = 6f;
    private const float TableY = 38f;
    private const float HeadRowH = 4f;
    private const float BodyTop = TableY + 3 * HeadRowH;
    private const float RowH = 4.4f;
    private const float TallRowH = 7f;
    private const float SumRowH = 5f;
    private const float FooterGap = 6f;
    private const float FooterH = 64f;
    private const float TailH = 3 * SumRowH + FooterGap + FooterH;

    private const float BodyPt = 6.5f;
    private const float MinPt = 5f;
    private const float NameOnePt = 6f;

    private const float Thin = 0.1f;
    private const float Mid = 0.2f;
    private const float Thick = 0.3f;

    // 표 칸: 항목 · 일자 · 코드 · 명칭 · 금액 · 횟수 · 일수 · 총액 · 본인부담금 · 공단부담금 · 전액본인부담 · 비급여 · 비고
    private const int ItemCol = 0, DateCol = 1, CodeCol = 2, NameCol = 3, PriceCol = 4, CountCol = 5, DaysCol = 6;
    private const int TotalCol = 7, OwnCol = 8, CorpCol = 9, FullCol = 10, NonCol = 11, NoteCol = 12;
    private static readonly float[] Widths = { 17, 15, 15, 36, 13, 9, 7, 14, 13, 13, 13, 13, 12 };
    private static readonly float[] Xs = Edges(Left, Widths);

    // 환자 머리 칸
    private static readonly string[] PatientLabels = { "환자등록번호", "환자성명", "진료기간", "병실", "환자구분", "비고" };
    private static readonly float[] PatientWidths = { 28, 30, 50, 20, 36, 26 };
    private static readonly float[] PatientXs = Edges(Left, PatientWidths);

    private static readonly string[] Guides =
    {
        "1. 진료비 계산서·영수증의 세부내역서는 환자의 구체적인 처방 내역 등이 확인되므로 원칙적으로 환자 본인 외에 발급을 금합니다.",
        "다만, 본 세부내역서 발급에 대해 별도로 환자 본인으로부터 위임을 받은 것이 확인된 자 또는 법정대리인에겐 발급이 가능합니다.",
        "2. 비고란은 세부산정내역을 발부하는 영수증번호 등 요양기관이 필요한 경우 추가 기재하는 공간으로 활용할수 있습니다.",
        "3. 동 서식에 명시된 항목은 「국민건강보험 요양급여의 기준에 관한 규칙」제7조제3항에 따라 필수 기재되어야 합니다.",
    };

    /// <summary>줄이 없으면 0쪽.</summary>
    public static IReadOnlyList<DocPage> Pages(DetailData data, DocContext ctx)
    {
        if (data == null) throw new ArgumentNullException(nameof(data));
        if (ctx == null) throw new ArgumentNullException(nameof(ctx));
        if (data.Lines.Count == 0) return Array.Empty<DocPage>();

        var width = ctx.WidthMm;
        var plan = new List<List<(DetailLine Line, float Height)>> { new List<(DetailLine Line, float Height)>() };
        var y = BodyTop;
        foreach (var line in data.Lines)
        {
            var height = OneLine(line.Name, Inner(NameCol), RowH, BodyPt, NameOnePt, width).HasValue ? RowH : TallRowH;
            if (y + height > Bottom + Eps)
            {
                plan.Add(new List<(DetailLine Line, float Height)>());
                y = BodyTop;
            }
            plan[plan.Count - 1].Add((line, height));
            y += height;
        }
        if (y + TailH > Bottom + Eps) plan.Add(new List<(DetailLine Line, float Height)>());

        return plan.Select((rows, i) => Page(data, ctx, rows, i + 1, plan.Count)).ToArray();
    }

    private static DocPage Page(DetailData data, DocContext ctx, List<(DetailLine Line, float Height)> rows, int number, int count)
    {
        var ops = new List<DocOp>();
        var width = ctx.WidthMm;
        var last = number == count;

        Put(ops, width, "진료비 세부산정내역", Left, TitleY, Right - Left, 9f, 16f, 12f, true, DocAlign.Center);
        Put(ops, width, "Page-" + number.ToString(CultureInfo.InvariantCulture) + "/" + count.ToString(CultureInfo.InvariantCulture), Right - 40f, TitleY + 2f, 40f, 4.5f, 8f, 6f, false, DocAlign.Right);
        PatientHead(ops, data, ctx);
        TableHead(ops, width);

        var y = BodyTop;
        DetailLine? previous = null;
        foreach (var (line, height) in rows)
        {
            var showGroup = previous == null || previous.Date != line.Date || previous.Group != line.Group;
            Row(ops, width, line, y, height, showGroup);
            y += height;
            ops.Add(DocOp.Line(Left, y, Right, y, Thin));
            previous = line;
        }
        var rowsEnd = y;
        ColumnLines(ops, rowsEnd);

        Dictionary<string, byte[]>? images = null;
        if (last)
        {
            y = SumRows(ops, width, data, rowsEnd);
            ops.Add(DocOp.Box(Left, TableY, Right - Left, y - TableY, Thick));
            images = Footer(ops, width, ctx, y + FooterGap);
        }
        else
        {
            ops.Add(DocOp.Box(Left, TableY, Right - Left, rowsEnd - TableY, Thick));
        }
        return new DocPage(ops, images);
    }

    private static void PatientHead(List<DocOp> ops, DetailData data, DocContext ctx)
    {
        var width = ctx.WidthMm;
        var from = data.FirstDay ?? ctx.From;
        var to = data.LastDay ?? ctx.To;
        var values = new[] { ctx.Chart, ctx.Patient.Name, Day(from) + " ~ " + Day(to), "", data.InsuranceText, "" };

        var bottom = PatientY + PatientLabelH + PatientValueH;
        ops.Add(DocOp.Box(Left, PatientY, Right - Left, bottom - PatientY, Thick));
        ops.Add(DocOp.Line(Left, PatientY + PatientLabelH, Right, PatientY + PatientLabelH, Thin));
        for (var i = 1; i < PatientLabels.Length; i++) ops.Add(DocOp.Line(PatientXs[i], PatientY, PatientXs[i], bottom, Thin));
        for (var i = 0; i < PatientLabels.Length; i++)
        {
            var x = PatientXs[i] + Pad;
            var w = PatientWidths[i] - 2 * Pad;
            Put(ops, width, PatientLabels[i], x, PatientY, w, PatientLabelH, 7.5f, MinPt, true, DocAlign.Center);
            Put(ops, width, values[i], x, PatientY + PatientLabelH, w, PatientValueH, 8f, MinPt, false, DocAlign.Center, twoLines: true);
        }
    }

    private static void TableHead(List<DocOp> ops, Func<string, float, float> width)
    {
        var full = 3 * HeadRowH;
        foreach (var (col, label) in new[] { (ItemCol, "항목"), (DateCol, "일자"), (CodeCol, "코드"), (NameCol, "명칭"), (PriceCol, "금액"), (DaysCol, "일수"), (TotalCol, "총액"), (NonCol, "비급여"), (NoteCol, "비고") })
        {
            HeadCell(ops, width, label, Xs[col], Xs[col + 1], TableY, full);
        }
        HeadCell(ops, width, "횟수", Xs[CountCol], Xs[CountCol + 1], TableY, full / 2);
        HeadCell(ops, width, "(총투여)", Xs[CountCol], Xs[CountCol + 1], TableY + full / 2, full / 2);
        HeadCell(ops, width, "급여", Xs[OwnCol], Xs[NonCol], TableY, HeadRowH);
        HeadCell(ops, width, "일부본인부담", Xs[OwnCol], Xs[FullCol], TableY + HeadRowH, HeadRowH);
        HeadCell(ops, width, "전액본인부담", Xs[FullCol], Xs[FullCol + 1], TableY + HeadRowH, 2 * HeadRowH);
        HeadCell(ops, width, "본인부담금", Xs[OwnCol], Xs[OwnCol + 1], TableY + 2 * HeadRowH, HeadRowH);
        HeadCell(ops, width, "공단부담금", Xs[CorpCol], Xs[CorpCol + 1], TableY + 2 * HeadRowH, HeadRowH);

        ops.Add(DocOp.Line(Xs[OwnCol], TableY + HeadRowH, Xs[NonCol], TableY + HeadRowH, Thin));
        ops.Add(DocOp.Line(Xs[OwnCol], TableY + 2 * HeadRowH, Xs[FullCol], TableY + 2 * HeadRowH, Thin));
        ops.Add(DocOp.Line(Left, BodyTop, Right, BodyTop, Mid));
    }

    private static void HeadCell(List<DocOp> ops, Func<string, float, float> width, string label, float x1, float x2, float y, float h) =>
        Put(ops, width, label, x1 + Pad, y, x2 - x1 - 2 * Pad, h, 7f, MinPt, true, DocAlign.Center);

    /// <summary>표 머리부터 줄 끝까지 칸 세로줄(급여 아래 칸은 머리 안에서 끊어 그린다).</summary>
    private static void ColumnLines(List<DocOp> ops, float rowsEnd)
    {
        for (var col = 1; col < Widths.Length; col++)
        {
            var top = col == CorpCol ? TableY + 2 * HeadRowH : col == FullCol ? TableY + HeadRowH : TableY;
            ops.Add(DocOp.Line(Xs[col], top, Xs[col], rowsEnd, Thin));
        }
    }

    private static void Row(List<DocOp> ops, Func<string, float, float> width, DetailLine line, float y, float h, bool showGroup)
    {
        var tall = h > RowH + Eps;
        if (showGroup) Put(ops, width, line.GroupLabel, Xs[ItemCol] + Pad, y, Inner(ItemCol), h, BodyPt, MinPt, false, DocAlign.Left, twoLines: tall);
        Put(ops, width, Day(line.Date), Xs[DateCol] + Pad, y, Inner(DateCol), h, BodyPt, MinPt, false, DocAlign.Center);
        Put(ops, width, line.Code, Xs[CodeCol] + Pad, y, Inner(CodeCol), h, BodyPt, MinPt, false, DocAlign.Left);
        Put(ops, width, line.Name, Xs[NameCol] + Pad, y, Inner(NameCol), h, BodyPt, NameOnePt, false, DocAlign.Left, twoLines: tall);
        Put(ops, width, Number(line.Price, "#,##0.##"), Xs[PriceCol] + Pad, y, Inner(PriceCol), h, BodyPt, MinPt, false, DocAlign.Right);
        Put(ops, width, Number(line.Count, "#,##0.###"), Xs[CountCol] + Pad, y, Inner(CountCol), h, BodyPt, MinPt, false, DocAlign.Right);
        Put(ops, width, line.Days.ToString(CultureInfo.InvariantCulture), Xs[DaysCol] + Pad, y, Inner(DaysCol), h, BodyPt, MinPt, false, DocAlign.Right);
        Money(ops, width, line.Amounts, y, h, zeroBlank: true);
        Put(ops, width, line.Note, Xs[NoteCol] + Pad, y, Inner(NoteCol), h, BodyPt, MinPt, false, DocAlign.Center, twoLines: tall);
    }

    /// <summary>【계】·【끝자리 조정금액】·【합계】 세 줄(0도 적음). 끝난 자리(y)를 준다.</summary>
    private static float SumRows(List<DocOp> ops, Func<string, float, float> width, DetailData data, float top)
    {
        var y = top;
        ops.Add(DocOp.Line(Left, y, Right, y, Mid));
        foreach (var (label, amounts) in new[] { ("【계】", data.Sum), ("【끝자리 조정금액】", data.Adjust), ("【합계】", data.Total) })
        {
            Put(ops, width, label, Left + Pad, y, Xs[TotalCol] - Left - 2 * Pad, SumRowH, 7f, MinPt, true, DocAlign.Center);
            Money(ops, width, amounts, y, SumRowH, zeroBlank: false);
            y += SumRowH;
            ops.Add(DocOp.Line(Left, y, Right, y, Thin));
        }
        for (var col = TotalCol; col < Widths.Length; col++) ops.Add(DocOp.Line(Xs[col], top, Xs[col], y, Thin));
        return y;
    }

    private static void Money(List<DocOp> ops, Func<string, float, float> width, DetailAmounts amounts, float y, float h, bool zeroBlank)
    {
        foreach (var (col, value) in new[] { (TotalCol, amounts.Total), (OwnCol, amounts.Own), (CorpCol, amounts.Corp), (FullCol, amounts.Full), (NonCol, amounts.Non) })
        {
            if (zeroBlank && value == 0) continue;
            Put(ops, width, value.ToString("#,##0", CultureInfo.InvariantCulture), Xs[col] + Pad, y, Inner(col), h, BodyPt, MinPt, false, DocAlign.Right);
        }
    }

    /// <summary>발급 문장·발급일·요양기관 명칭·대표자·[인](직인 그림)·일반사항 안내. 그 쪽 그림(직인 없으면 null)을 준다.</summary>
    private static Dictionary<string, byte[]>? Footer(List<DocOp> ops, Func<string, float, float> width, DocContext ctx, float top)
    {
        var full = Right - Left;
        Put(ops, width, "신청인 : " + ctx.Patient.Name + " (환자와의 관계 : 본인)의 요청에 따라", Left, top, full, 6f, 9f, MinPt, false, DocAlign.Center);
        Put(ops, width, "진료비 계산서·영수증 세부산정내역을 발급합니다.", Left, top + 6f, full, 6f, 9f, MinPt, false, DocAlign.Center);
        var date = ctx.Today;
        Put(ops, width, date.Year.ToString(CultureInfo.InvariantCulture) + "년 " + date.Month.ToString(CultureInfo.InvariantCulture) + "월 " + date.Day.ToString(CultureInfo.InvariantCulture) + "일", Left, top + 14f, full, 6f, 9f, MinPt, false, DocAlign.Center);

        var nameY = top + 23f;
        Put(ops, width, "요양기관 명칭 : " + ctx.Hospital.Name, Left + 10f, nameY, 95f, 7f, 9f, MinPt, false, DocAlign.Left);
        Put(ops, width, "대표자 : " + ctx.Hospital.Owner, Left + 110f, nameY, 58f, 7f, 9f, MinPt, false, DocAlign.Left);
        const float stampX = Left + 170f;
        const float stampW = 12f;
        Put(ops, width, "[인]", stampX, nameY, stampW, 7f, 9f, MinPt, false, DocAlign.Center);
        Dictionary<string, byte[]>? images = null;
        if (ctx.Seal != null)
        {
            const float seal = 16f;
            ops.Add(DocOp.Image(stampX + stampW / 2 - seal / 2, nameY + 3.5f - seal / 2, seal, seal, DocContext.SealKey));
            images = new Dictionary<string, byte[]>(StringComparer.Ordinal) { [DocContext.SealKey] = ctx.Seal };
        }

        var guideY = top + 36f;
        const float guideH = 28f;
        ops.Add(DocOp.Box(Left, guideY, full, guideH, Mid));
        Put(ops, width, "일반사항 안내", Left + 2f, guideY + 1f, full - 4f, 5f, 8f, MinPt, true, DocAlign.Left);
        for (var i = 0; i < Guides.Length; i++)
        {
            Put(ops, width, Guides[i], Left + 2f, guideY + 6.5f + 5f * i, full - 4f, 5f, 6.5f, MinPt, false, DocAlign.Left);
        }
        return images;
    }

    // ── 글 맞추기 ─────────────────────────────

    /// <summary>
    /// 칸(x,y,w,h)에 글 하나: maxPt부터 0.5pt씩 줄여 한 줄에 드는 첫 크기(minPt까지). 안 들면 twoLines일 때 두 줄(maxPt부터 MinPt까지, 낱말 단위),
    /// 그래도 안 들면 '…'로 줄인다. 빈 글은 그리지 않는다.
    /// </summary>
    private static void Put(List<DocOp> ops, Func<string, float, float> width, string? text, float x, float y, float w, float h, float maxPt, float minPt, bool bold, DocAlign align, bool twoLines = false)
    {
        var value = (text ?? "").Trim();
        if (value.Length == 0) return;
        var one = OneLine(value, w, h, maxPt, minPt, width);
        if (one.HasValue)
        {
            ops.Add(DocOp.Text(x, y, w, h, value, one.Value, bold, align));
            return;
        }
        var lowest = Math.Min(minPt, MinPt);
        if (twoLines && 2 * LineHeight(lowest) <= h + Eps)
        {
            var (pt, first, second) = TwoLines(value, w, h, maxPt, lowest, width);
            ops.Add(DocOp.Text(x, y, w, h / 2, first, pt, bold, align));
            ops.Add(DocOp.Text(x, y + h / 2, w, h / 2, second, pt, bold, align));
            return;
        }
        ops.Add(DocOp.Text(x, y, w, h, Shorten(value, lowest, w, width), lowest, bold, align));
    }

    private static float? OneLine(string text, float w, float h, float maxPt, float minPt, Func<string, float, float> width)
    {
        foreach (var pt in Sizes(maxPt, minPt))
        {
            if (LineHeight(pt) <= h + Eps && width(text, pt) <= w + Eps) return pt;
        }
        return null;
    }

    private static (float Pt, string First, string Second) TwoLines(string text, float w, float h, float maxPt, float minPt, Func<string, float, float> width)
    {
        foreach (var pt in Sizes(maxPt, minPt))
        {
            if (2 * LineHeight(pt) > h + Eps) continue;
            var (first, rest) = SplitFirst(text, pt, w, width);
            if (rest.Length > 0 && width(rest, pt) <= w + Eps) return (pt, first, rest);
        }
        var (line1, line2) = SplitFirst(text, minPt, w, width);
        return (minPt, line1, Shorten(line2, minPt, w, width));
    }

    /// <summary>첫 줄에 드는 만큼(낱말 단위, 낱말 하나가 한 줄보다 길면 글자 단위, 적어도 한 글자)과 나머지.</summary>
    private static (string First, string Remainder) SplitFirst(string text, float pt, float w, Func<string, float, float> width)
    {
        var words = text.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        var line = "";
        for (var i = 0; i < words.Length; i++)
        {
            var candidate = line.Length == 0 ? words[i] : line + " " + words[i];
            if (width(candidate, pt) <= w + Eps)
            {
                line = candidate;
                continue;
            }
            if (line.Length > 0) return (line, string.Join(" ", words.Skip(i)));
            var take = 1;
            while (take < words[i].Length && width(words[i].Substring(0, take + 1), pt) <= w + Eps) take++;
            var rest = new[] { words[i].Substring(take) }.Concat(words.Skip(i + 1)).Where(part => part.Length > 0);
            return (words[i].Substring(0, take), string.Join(" ", rest));
        }
        return (line, "");
    }

    /// <summary>들면 그대로, 아니면 끝을 줄이고 '…'를 붙여 드는 가장 긴 글.</summary>
    private static string Shorten(string text, float pt, float w, Func<string, float, float> width)
    {
        if (width(text, pt) <= w + Eps) return text;
        for (var take = text.Length - 1; take > 0; take--)
        {
            var candidate = text.Substring(0, take).TrimEnd() + Ellipsis;
            if (width(candidate, pt) <= w + Eps) return candidate;
        }
        return Ellipsis;
    }

    private static IEnumerable<float> Sizes(float maxPt, float minPt)
    {
        var steps = Math.Max(0, (int)Math.Floor((maxPt - minPt) / StepPt + 0.0001f));
        return Enumerable.Range(0, steps + 1).Select(k => maxPt - StepPt * k);
    }

    private static float LineHeight(float pt) => pt * LineSpacing * MmPerPt;

    private static float Inner(int col) => Widths[col] - 2 * Pad;

    private static float[] Edges(float left, float[] widths)
    {
        var edges = new float[widths.Length + 1];
        edges[0] = left;
        for (var i = 0; i < widths.Length; i++) edges[i + 1] = edges[i] + widths[i];
        return edges;
    }

    private static string Day(DateTime day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Number(decimal value, string format) => value.ToString(format, CultureInfo.InvariantCulture);
}
