using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>
/// 진료기록부 A4 세로 그리기(spec doc-print AC-7406.1). 비트 BITPrintChart 글(notes/forms.md §4)을 따른 모양:
/// 쪽마다 머리(외래진료기록부 ( Page - n )·담당의/서명 칸·환자 칸)와 쪽 아래(의료기관·전화·FAX·주소·발행일자),
/// 본문은 내원마다 &lt;내원내역&gt;·&lt;경과기록&gt;·&lt;상병&gt;·&lt;처방&gt;·&lt;원외처방&gt;·&lt;수납내역&gt;를 줄 단위로 흘려 쪽이 차면 다음 쪽으로,
/// 마지막 쪽에 '의무기록지 사본 증명서'(날인 안내 글·출력담당자 빈자리, 도장은 직원이 손으로 찍으므로 그림 없음).
/// 글씨는 본문 한 크기(9pt), 긴 글은 칸 폭 안에서 여러 줄. 자리는 mm, 견본 PDF로 맞출 값이다.
/// </summary>
public static class ChartLayout
{
    public const float LeftMm = 15f;
    public const float RightMm = 195f;

    /// <summary>본문 글씨(머리 제목·증명서 제목 말고 모두).</summary>
    public const float BodyPt = 9f;

    public const float TitlePt = 14f;
    public const float CertTitlePt = 12f;

    /// <summary>본문 한 줄 높이.</summary>
    public const float LineMm = 4.4f;

    /// <summary>본문이 시작하는 자리(머리 아래)와 넘지 않는 자리('- Next Page -'·쪽 아래 위).</summary>
    public const float BodyTopMm = 44f;
    public const float BodyBottomMm = 268f;

    public const string Title = "외래진료기록부";
    public const string CertTitle = "의무기록지 사본 증명서";
    public const string NextPage = "- Next Page -";

    private const float SectionGapMm = 1.2f;
    private const float CertGapMm = 3f;
    private const float CertHeightMm = 48f;

    private const float NoteX = 23f;
    private const float SectionX = 19f;

    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    /// <summary>처방 표 칸: 코드·명칭·용량·횟수·일수·용법(비트 머리 '코드 명칭 용량 횟수 일수 용법').</summary>
    private static readonly (float X, float Width, DocAlign Align)[] OrderColumns =
    {
        (NoteX, 24f, DocAlign.Left), (47f, 79f, DocAlign.Left), (126f, 14f, DocAlign.Right),
        (140f, 12f, DocAlign.Right), (152f, 12f, DocAlign.Right), (168f, RightMm - 168f, DocAlign.Left),
    };

    /// <summary>수납 표 칸: 날짜·총진료비·영수액·수납액·할인액(비트 머리 그대로).</summary>
    private static readonly (float X, float Width, DocAlign Align)[] PayColumns =
    {
        (NoteX, 28f, DocAlign.Left), (51f, 28f, DocAlign.Right), (79f, 28f, DocAlign.Right), (107f, 28f, DocAlign.Right), (135f, 28f, DocAlign.Right),
    };

    /// <summary>쪽 위 한 줄 묶음(자리는 줄 안 기준 y=0). Keep이면 다음 줄과 같은 쪽에 둔다(제목·머리 줄이 쪽 끝에 홀로 남지 않게).</summary>
    private sealed class Row
    {
        public Row(float height, IReadOnlyList<DocOp> ops, bool keep)
        {
            Height = height;
            Ops = ops;
            Keep = keep;
        }

        public float Height { get; }

        public IReadOnlyList<DocOp> Ops { get; }

        public bool Keep { get; }
    }

    internal static IReadOnlyList<DocPage> Draw(IReadOnlyList<ChartVisit> visits, string resHead, DocContext ctx)
    {
        var measure = ctx.WidthMm;
        var rows = new List<Row>();
        for (var i = 0; i < visits.Count; i++)
        {
            AddVisit(rows, visits[i], measure);
            if (i < visits.Count - 1) rows.Add(new Row(3f, new[] { DocOp.Line(LeftMm, 1.5f, RightMm, 1.5f, 0.2f) }, false));
        }

        var bodies = new List<List<DocOp>> { new List<DocOp>() };
        var y = BodyTopMm;
        for (var i = 0; i < rows.Count; i++)
        {
            var need = rows[i].Height;
            for (var j = i; rows[j].Keep && j + 1 < rows.Count; j++) need += rows[j + 1].Height;
            if (y + need > BodyBottomMm + 0.01f && y > BodyTopMm + 0.01f)
            {
                bodies.Add(new List<DocOp>());
                y = BodyTopMm;
            }
            bodies[bodies.Count - 1].AddRange(rows[i].Ops.Select(op => Shift(op, y)));
            y += rows[i].Height;
        }

        if (y + CertGapMm + CertHeightMm > BodyBottomMm + 0.01f)
        {
            bodies.Add(new List<DocOp>());
            y = BodyTopMm;
        }
        bodies[bodies.Count - 1].AddRange(Certificate(y + CertGapMm, ctx));

        var pages = new List<DocPage>();
        for (var n = 0; n < bodies.Count; n++)
        {
            var ops = new List<DocOp>();
            ops.AddRange(Header(n + 1, resHead, ctx));
            ops.AddRange(bodies[n]);
            if (n < bodies.Count - 1) ops.Add(DocOp.Text(LeftMm, BodyBottomMm + 1.5f, RightMm - LeftMm, LineMm, NextPage, BodyPt, false, DocAlign.Center));
            ops.AddRange(Footer(ctx));
            pages.Add(new DocPage(ops));
        }
        return pages;
    }

    // ── 본문 ─────────────────────────────

    private static void AddVisit(List<Row> rows, ChartVisit visit, Func<string, float, float> measure)
    {
        rows.Add(Section(LeftMm, "<내원내역>", true));
        var info = "내원일자 : " + visit.Day.DateText + "    접수시간 : " + visit.TimeText + "    진료과목 : " + visit.Department + "    담당의 : " + visit.Doctor;
        var infoLines = Lines(19f, RightMm - 19f, info, measure);
        for (var i = 0; i < infoLines.Count; i++) rows.Add(i == infoLines.Count - 1 ? new Row(LineMm, infoLines[i].Ops, true) : infoLines[i]);

        if (visit.Notes.Count > 0)
        {
            rows.Add(Section(SectionX, "<경과기록>", true));
            foreach (var note in visit.Notes) rows.AddRange(Lines(NoteX, RightMm - NoteX, note, measure));
        }

        if (visit.Diagnoses.Count > 0)
        {
            rows.Add(Section(SectionX, "<상병>", true));
            foreach (var dx in visit.Diagnoses)
            {
                rows.Add(Cells(measure, false,
                    (NoteX, 18f, dx.Primary ? "(주상병)" : "(부상병)", DocAlign.Left),
                    (41f, 22f, dx.Code, DocAlign.Left),
                    (63f, RightMm - 63f, dx.Name, DocAlign.Left)));
            }
        }

        if (visit.Orders.Count > 0)
        {
            rows.Add(Section(SectionX, "<처방>", true));
            AddOrders(rows, visit.Orders, measure);
        }

        foreach (var slip in visit.OutOrders.Select(o => o.Slip).Distinct(StringComparer.Ordinal).ToArray())
        {
            rows.Add(new Row(LineMm + SectionGapMm, new[]
            {
                DocOp.Text(SectionX, SectionGapMm, 40f, LineMm, "<원외처방>", BodyPt, true),
                DocOp.Text(60f, SectionGapMm, 100f, LineMm, ChartText.Shorten("교부번호 : " + slip, 100f, BodyPt, measure), BodyPt),
            }, true));
            AddOrders(rows, visit.OutOrders.Where(o => o.Slip == slip).ToArray(), measure);
        }

        rows.Add(Section(SectionX, "<수납내역>", true));
        var pay = visit.Payment;
        rows.Add(PayRow(measure, pay != null, "날짜", "총진료비", "영수액", "수납액", "할인액"));
        if (pay != null)
        {
            rows.Add(PayRow(measure, false, DayText(pay.Day8), Won(pay.Total), Won(pay.Own), Won(pay.Paid), Won(pay.Discount)));
        }
    }

    private static void AddOrders(List<Row> rows, IReadOnlyList<ChartOrder> orders, Func<string, float, float> measure)
    {
        var head = Columns(measure, true, OrderColumns, "코드", "명칭", "용량", "횟수", "일수", "용법");
        rows.Add(new Row(head.Height, head.Ops.Concat(new[] { DocOp.Line(NoteX, head.Height - 0.2f, RightMm, head.Height - 0.2f, 0.15f) }).ToArray(), true));
        foreach (var order in orders)
        {
            rows.Add(Columns(measure, false, OrderColumns, order.Code, order.Name, order.Qty, order.Times, order.Days, order.Usage));
        }
    }

    private static Row PayRow(Func<string, float, float> measure, bool keep, params string[] texts) => Columns(measure, keep, PayColumns, texts);

    /// <summary>표 칸(x, 폭, 맞춤)마다 글 하나씩.</summary>
    private static Row Columns(Func<string, float, float> measure, bool keep, (float X, float Width, DocAlign Align)[] columns, params string[] texts) =>
        Cells(measure, keep, columns.Select((column, i) => (column.X, column.Width, texts[i], column.Align)).ToArray());

    /// <summary>굵은 칸 제목 한 줄(위에 조금 띄움).</summary>
    private static Row Section(float x, string title, bool keep) =>
        new Row(LineMm + SectionGapMm, new[] { DocOp.Text(x, SectionGapMm, 60f, LineMm, title, BodyPt, true) }, keep);

    /// <summary>긴 글 한 칸을 줄마다 한 Row로(쪽 넘김이 줄 사이에서 일어날 수 있게).</summary>
    private static List<Row> Lines(float x, float width, string text, Func<string, float, float> measure) =>
        ChartText.Wrap(text, width, BodyPt, measure)
            .Select(line => new Row(LineMm, line.Length == 0 ? Array.Empty<DocOp>() : new[] { DocOp.Text(x, 0, width, LineMm, line, BodyPt) }, false))
            .ToList();

    /// <summary>나란한 칸들(빈 글은 안 그림), 칸마다 폭 안에서 줄 나눔, 줄 높이는 가장 많은 줄 수.</summary>
    private static Row Cells(Func<string, float, float> measure, bool keep, params (float X, float Width, string Text, DocAlign Align)[] cells)
    {
        var ops = new List<DocOp>();
        var lines = 1;
        foreach (var cell in cells)
        {
            if (string.IsNullOrWhiteSpace(cell.Text)) continue;
            var wrapped = ChartText.Wrap(cell.Text, cell.Width, BodyPt, measure);
            for (var i = 0; i < wrapped.Count; i++) ops.Add(DocOp.Text(cell.X, i * LineMm, cell.Width, LineMm, wrapped[i], BodyPt, false, cell.Align));
            lines = Math.Max(lines, wrapped.Count);
        }
        return new Row(lines * LineMm, ops, keep);
    }

    // ── 머리·쪽 아래·증명서 ─────────────────────────────

    private static IEnumerable<DocOp> Header(int page, string resHead, DocContext ctx)
    {
        var measure = ctx.WidthMm;
        var patient = ctx.Patient;
        yield return DocOp.Text(LeftMm, 11f, 130f, 9f, Title + "      ( Page - " + page.ToString(Invariant) + " )", TitlePt, true);

        // 담당의 · 서  명 칸(아래 칸은 손으로 씀)
        yield return DocOp.Box(150f, 9f, 45f, 20f, 0.3f);
        yield return DocOp.Line(150f, 15f, RightMm, 15f, 0.2f);
        yield return DocOp.Line(172.5f, 9f, 172.5f, 29f, 0.2f);
        yield return DocOp.Text(150f, 9.8f, 22.5f, LineMm, "담당의", BodyPt, false, DocAlign.Center);
        yield return DocOp.Text(172.5f, 9.8f, 22.5f, LineMm, "서  명", BodyPt, false, DocAlign.Center);

        yield return DocOp.Text(LeftMm, 31.5f, 60f, LineMm, ChartText.Shorten("차트번호 : " + ctx.Chart, 60f, BodyPt, measure), BodyPt);
        yield return DocOp.Text(75f, 31.5f, RightMm - 75f, LineMm, ChartText.Shorten("수진자명 : " + patient.Name, RightMm - 75f, BodyPt, measure), BodyPt);
        yield return DocOp.Text(LeftMm, 36.3f, 60f, LineMm, ChartText.Shorten("성별/나이 : " + patient.SexText + "/" + Age(patient.Birth8, ctx.Today), 60f, BodyPt, measure), BodyPt);
        yield return DocOp.Text(75f, 36.3f, RightMm - 75f, LineMm, "주민등록 : " + (resHead.Length == 7 ? resHead.Substring(0, 6) + "-" + resHead.Substring(6, 1) + "******" : ""), BodyPt);
        yield return DocOp.Line(LeftMm, 42f, RightMm, 42f, 0.3f);
    }

    private static IEnumerable<DocOp> Footer(DocContext ctx)
    {
        var measure = ctx.WidthMm;
        var hospital = ctx.Hospital;
        var place = "의료기관: " + hospital.Name
            + (hospital.Phone.Length > 0 ? "   전화번호: " + hospital.Phone : "")
            + (hospital.Fax.Length > 0 ? "   FAX: " + hospital.Fax : "");
        yield return DocOp.Line(LeftMm, 276f, RightMm, 276f, 0.2f);
        yield return DocOp.Text(LeftMm, 277f, 128f, LineMm, ChartText.Shorten(place, 128f, BodyPt, measure), BodyPt);
        yield return DocOp.Text(145f, 277f, RightMm - 145f, LineMm, "발행일자 : " + ctx.Today.ToString("yyyy-MM-dd", Invariant), BodyPt, false, DocAlign.Right);
        if (hospital.Address.Length > 0)
        {
            yield return DocOp.Text(LeftMm, 281.6f, RightMm - LeftMm, LineMm, ChartText.Shorten("주소: " + hospital.Address, RightMm - LeftMm, BodyPt, measure), BodyPt);
        }
    }

    /// <summary>의무기록지 사본 증명서(비트 '의무기록사본 출력' 꼬리 글). 출력담당자 이름·도장 자리는 비워 둔다(직원이 손으로 찍음).</summary>
    private static IEnumerable<DocOp> Certificate(float top, DocContext ctx)
    {
        yield return DocOp.Box(LeftMm, top, RightMm - LeftMm, CertHeightMm, 0.3f);
        yield return DocOp.Text(LeftMm, top + 2f, RightMm - LeftMm, 7f, CertTitle, CertTitlePt, true, DocAlign.Center);
        yield return DocOp.Text(LeftMm + 5f, top + 11f, 170f, LineMm, "* 상기용도 이외에는 이 사본을 사용할 수 없으며 사용용도 또는", BodyPt);
        yield return DocOp.Text(LeftMm + 8f, top + 15.6f, 167f, LineMm, "사용기간이 완료된 후 즉시 파본, 폐기하여야 합니다.", BodyPt);
        yield return DocOp.Text(LeftMm + 5f, top + 20.2f, 170f, LineMm, "* 담당자 날인 없는 것은 사본으로 인정되지 않습니다.", BodyPt);
        yield return DocOp.Text(LeftMm + 5f, top + 33.8f, 70f, LineMm, "발행일 : " + ctx.Today.ToString("yyyy년MM월dd일", Invariant), BodyPt);
        yield return DocOp.Text(105f, top + 33.8f, 24f, LineMm, "출력담당자 :", BodyPt);
        yield return DocOp.Line(130f, top + 38.5f, 162f, top + 38.5f, 0.2f);
        yield return DocOp.Text(163f, top + 33.8f, 30f, LineMm, "(서명 또는 인)", BodyPt);
    }

    // ── 글 모양 ─────────────────────────────

    private static DocOp Shift(DocOp op, float dy)
    {
        switch (op.Kind)
        {
            case DocOpKind.Text: return DocOp.Text(op.X, op.Y + dy, op.Width, op.Height, op.Value, op.Pt, op.Bold, op.Align);
            case DocOpKind.Line: return DocOp.Line(op.X, op.Y + dy, op.X2, op.Y2 + dy, op.StrokeMm);
            case DocOpKind.Box: return DocOp.Box(op.X, op.Y + dy, op.Width, op.Height, op.StrokeMm);
            default: return DocOp.Image(op.X, op.Y + dy, op.Width, op.Height, op.Key);
        }
    }

    /// <summary>만 나이(오늘 기준). 생년월일을 모르면 빈 글.</summary>
    private static string Age(string birth8, DateTime today)
    {
        if (!DateTime.TryParseExact(birth8, "yyyyMMdd", Invariant, DateTimeStyles.None, out var birth) || birth > today) return "";
        var age = today.Year - birth.Year;
        if (today.Month < birth.Month || (today.Month == birth.Month && today.Day < birth.Day)) age--;
        return age.ToString(Invariant);
    }

    private static string DayText(string day8) =>
        DateTime.TryParseExact(day8, "yyyyMMdd", Invariant, DateTimeStyles.None, out var day) ? day.ToString("yyyy-MM-dd", Invariant) : day8;

    private static string Won(long amount) => amount.ToString("#,##0", Invariant);
}
