using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Detail;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Detail;

/// <summary>
/// spec doc-print AC-7406.1(진료비 세부내역서): A4 세로 그리기(DetailLayout)와 서류 잇기(DetailSource).
/// 모양은 비트 BITPaymentPrint 글(notes/forms.md §2)을 따른다. 견본 PDF가 오면 자리·크기를 맞춘다. 값은 모두 지어낸 것이다.
/// </summary>
public class DetailLayoutTests
{
    private const float Eps = 0.05f;

    private static readonly string[] TableHeads = { "항목", "일자", "코드", "명칭", "금액", "횟수", "일수", "총액", "본인부담금", "공단부담금", "전액본인부담", "비급여", "비고" };

    private static IReadOnlyList<DocPage> Draw(DocContext? ctx = null, object?[][]? lines = null, object?[][]? visits = null)
    {
        var context = ctx ?? DetailFixture.Context();
        return DetailLayout.Pages(DetailReader.Read(DetailFixture.Db(lines, visits), context), context);
    }

    private static IEnumerable<DocOp> TextOps(DocPage page) => page.Ops.Where(op => op.Kind == DocOpKind.Text);

    private static float Cy(DocOp op) => (op.Y + op.Y2) / 2;

    private static float Cx(DocOp op) => (op.X + op.X2) / 2;

    /// <summary>표 머리 칸(환자 머리의 '비고'가 아니라 표 머리의 것).</summary>
    private static DocOp Head(DocPage page, string label)
    {
        var top = DetailFixture.TextOp(page, "항목").Y;
        return TextOps(page).First(op => op.Value == label && op.Y >= top - Eps);
    }

    /// <summary>row와 같은 줄(세로 가운데 ±1mm)에서 표 머리 label 칸 안에 든 글. 없으면 빈 글.</summary>
    private static string Cell(DocPage page, string label, DocOp row)
    {
        var head = Head(page, label);
        var found = TextOps(page).Where(op => op != row && Math.Abs(Cy(op) - Cy(row)) < 1f && Cx(op) > head.X && Cx(op) < head.X2).Select(op => op.Value).ToArray();
        return found.Length == 0 ? "" : string.Join("|", found);
    }

    private static void AllInside(IReadOnlyList<DocPage> pages)
    {
        foreach (var page in pages)
        {
            foreach (var op in page.Ops)
            {
                Assert.InRange(Math.Min(op.X, op.X2), -Eps, DocPage.WidthMm + Eps);
                Assert.InRange(Math.Max(op.X, op.X2), -Eps, DocPage.WidthMm + Eps);
                Assert.InRange(Math.Min(op.Y, op.Y2), -Eps, DocPage.HeightMm + Eps);
                Assert.InRange(Math.Max(op.Y, op.Y2), -Eps, DocPage.HeightMm + Eps);
                if (op.Kind != DocOpKind.Text) continue;
                Assert.InRange(op.X, DetailLayout.Left - Eps, DetailLayout.Right + Eps);
                Assert.InRange(op.X2, DetailLayout.Left - Eps, DetailLayout.Right + Eps);
                Assert.InRange(op.Y2, 0, DetailLayout.Bottom + Eps);
                Assert.InRange(op.Pt, 5f, 18f);
                Assert.True(DetailFixture.Width(op.Value, op.Pt) <= op.Width + Eps, $"'{op.Value}' {op.Pt}pt 폭 {DetailFixture.Width(op.Value, op.Pt):0.00} > 칸 {op.Width:0.00}");
                Assert.True(op.Pt * 1.2f * 0.3528f <= op.Height + Eps, $"'{op.Value}' {op.Pt}pt 줄 높이 > 칸 {op.Height:0.00}");
            }
        }
    }

    // ── 한 쪽 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 한 쪽: 제목 '진료비 세부산정내역'·쪽 번호·환자 머리(환자등록번호·환자성명·진료기간·병실·환자구분·비고)와 값")]
    public void HeadOfPage()
    {
        var page = Assert.Single(Draw());

        var title = DetailFixture.TextOp(page, "진료비 세부산정내역");
        Assert.True(title.Bold);
        Assert.Equal(DocAlign.Center, title.Align);
        Assert.True(title.Pt >= 14f);
        Assert.True(TextOps(page).All(op => op == title || op.Pt < title.Pt));
        Assert.Contains("Page-1/1", DetailFixture.Texts(page));

        var labels = new[] { "환자등록번호", "환자성명", "진료기간", "병실", "환자구분" };
        var values = new[] { "90001", "가상환자01", "2026-11-03 ~ 2026-11-10", "", "국민건강보험" };
        for (var i = 0; i < labels.Length; i++)
        {
            var label = DetailFixture.TextOp(page, labels[i]);
            Assert.True(label.Y > title.Y2 - Eps);
            if (i > 0) Assert.True(label.X > DetailFixture.TextOp(page, labels[i - 1]).X);
            if (values[i].Length == 0) continue;
            var value = DetailFixture.TextOp(page, values[i]);
            Assert.True(value.Y >= label.Y2 - Eps, labels[i]);
            Assert.InRange(Cx(value), label.X, label.X2);
        }
        Assert.True(DetailFixture.Texts(page).Count(text => text == "비고") >= 2);
    }

    [Fact(DisplayName = "AC-7406.1 표 머리: 항목·일자·코드·명칭·금액·횟수(총투여)·일수·총액·급여(일부본인부담: 본인부담금·공단부담금 / 전액본인부담)·비급여·비고가 왼쪽부터")]
    public void TableHead()
    {
        var page = Assert.Single(Draw());

        var heads = TableHeads.Select(label => Head(page, label)).ToArray();
        for (var i = 1; i < heads.Length; i++) Assert.True(heads[i].X >= heads[i - 1].X2 - Eps, TableHeads[i]);
        Assert.Contains("(총투여)", DetailFixture.Texts(page));
        var insured = Head(page, "급여");
        var partial = Head(page, "일부본인부담");
        Assert.True(insured.Y2 <= partial.Y + Eps);
        Assert.InRange(insured.X, Head(page, "본인부담금").X - Eps, Head(page, "본인부담금").X + Eps);
        Assert.InRange(insured.X2, Head(page, "전액본인부담").X2 - Eps, Head(page, "전액본인부담").X2 + Eps);
        Assert.True(partial.Y2 <= Head(page, "본인부담금").Y + Eps);
        Assert.InRange(partial.X2, Head(page, "공단부담금").X2 - Eps, Head(page, "공단부담금").X2 + Eps);
        Assert.True(Head(page, "항목").X >= DetailLayout.Left - Eps);
        Assert.True(Head(page, "비고").X2 <= DetailLayout.Right + Eps);
    }

    [Fact(DisplayName = "AC-7406.1 표 줄: 날짜순·항목 묶음 차례로 한 줄씩, 묶음 이름은 그날 묶음의 첫 줄에만, 칸마다 일자·코드·단가·횟수·일수·총액·나눈 금액·비고(0은 빈칸)")]
    public void Rows()
    {
        var page = Assert.Single(Draw());

        var names = new[] { "재진진찰료", "가상주사약", "가상물리치료", "가상도수치료", "가상전액치료", "가상선별재료" };
        var rows = names.Select(name => DetailFixture.TextOp(page, name)).ToArray();
        for (var i = 1; i < rows.Length; i++) Assert.True(rows[i].Y >= rows[i - 1].Y2 - Eps, names[i]);
        Assert.True(rows[0].Y >= Head(page, "본인부담금").Y2 - Eps);

        var visit = rows[0];
        Assert.Equal("진 찰 료", Cell(page, "항목", visit));
        Assert.Equal("2026-11-03", Cell(page, "일자", visit));
        Assert.Equal("AA254", Cell(page, "코드", visit));
        Assert.Equal("12,000", Cell(page, "금액", visit));
        Assert.Equal("1", Cell(page, "횟수", visit));
        Assert.Equal("1", Cell(page, "일수", visit));
        Assert.Equal("12,000", Cell(page, "총액", visit));
        Assert.Equal("3,600", Cell(page, "본인부담금", visit));
        Assert.Equal("8,400", Cell(page, "공단부담금", visit));
        Assert.Equal("", Cell(page, "전액본인부담", visit));
        Assert.Equal("", Cell(page, "비급여", visit));
        Assert.Equal(DocAlign.Right, TextOps(page).First(op => op.Value == "3,600").Align);

        Assert.Equal("89.6", Cell(page, "금액", rows[1]));
        Assert.Equal("89", Cell(page, "총액", rows[1]));
        Assert.Equal("주사료(약품)", Cell(page, "항목", rows[1]));
        Assert.Equal("재활물리치료료", Cell(page, "항목", rows[2]));
        Assert.Equal("", Cell(page, "항목", rows[3]));
        Assert.Equal(1, DetailFixture.Texts(page).Count(text => text == "재활물리치료료"));
        Assert.Equal("50,000", Cell(page, "비급여", rows[3]));
        Assert.Equal("", Cell(page, "본인부담금", rows[3]));
        Assert.Equal("3,000", Cell(page, "전액본인부담", rows[4]));
        Assert.Equal("2026-11-10", Cell(page, "일자", rows[5]));
        Assert.Equal("2", Cell(page, "횟수", rows[5]));
        Assert.Equal("본인부담95%", Cell(page, "비고", rows[5]));
        Assert.Equal("치료재료대", Cell(page, "항목", rows[5]));
    }

    [Fact(DisplayName = "AC-7406.1 긴 이름은 글씨를 줄이거나 두 줄로(줄 높이가 늘고 다음 줄과 겹치지 않음), 글은 모두 칸 안·쪽 안")]
    public void LongNamesFit()
    {
        var page = Assert.Single(Draw());

        var parts = TextOps(page).Where(op => DetailFixture.LongName.StartsWith(op.Value, StringComparison.Ordinal) || DetailFixture.LongName.EndsWith(op.Value, StringComparison.Ordinal)).Where(op => op.Value.Length > 3).ToArray();
        Assert.Equal(2, parts.Length);
        Assert.Equal(DetailFixture.LongName, parts[0].Value + " " + parts[1].Value);
        Assert.True(parts[1].Y >= parts[0].Y2 - Eps);
        Assert.True(DetailFixture.TextOp(page, "가상선별재료").Y >= parts[1].Y2 - Eps);
        Assert.Equal("영상진단료", Cell(page, "항목", DetailFixture.TextOp(page, "2026-11-10")));
        AllInside(new[] { page });

        var longPatient = new PatientHit("90001", "가나다라마바사아자차카타파하가나다라마바", "19800302", "F", "");
        var longHospital = new HospitalInfo("가상의원 이름이 아주 길어서 칸을 넘칠 수 있는 의료기관 시험용", "12345678", "", "", "가상원장 이름도 길게 적어 봄", "", "", "", DetailFixture.Seal);
        AllInside(Draw(DetailFixture.Context(patient: longPatient, hospital: longHospital)));
    }

    [Fact(DisplayName = "AC-7406.1 줄 아래 【계】(줄 합) → 【끝자리 조정금액】(합계 − 계) → 【합계】(영수증 저장 값) 세 줄, 총액·본인부담금·공단부담금·전액본인부담·비급여 칸에 0도 적음")]
    public void TotalRows()
    {
        var page = Assert.Single(Draw());

        var sum = DetailFixture.TextOp(page, "【계】");
        var adjust = DetailFixture.TextOp(page, "【끝자리 조정금액】");
        var total = DetailFixture.TextOp(page, "【합계】");
        Assert.True(sum.Y >= DetailFixture.TextOp(page, "가상선별재료").Y2 - Eps);
        Assert.True(adjust.Y >= sum.Y2 - Eps);
        Assert.True(total.Y >= adjust.Y2 - Eps);

        string[] Values(DocOp row) => new[] { "총액", "본인부담금", "공단부담금", "전액본인부담", "비급여" }.Select(label => Cell(page, label, row)).ToArray();
        Assert.Equal(new[] { "85,000", "8,899", "23,101", "3,000", "50,000" }, Values(sum));
        Assert.Equal(new[] { "0", "-99", "99", "0", "0" }, Values(adjust));
        Assert.Equal(new[] { "85,000", "8,800", "23,200", "3,000", "50,000" }, Values(total));
    }

    [Fact(DisplayName = "AC-7406.1 아래: 신청인·(환자와의 관계 : 본인)의 요청에 따라 발급 문장, 발급일(오늘), 요양기관 명칭·대표자·[인]에 병원 직인 그림, 일반사항 안내 1~3")]
    public void Footer()
    {
        var page = Assert.Single(Draw());
        var texts = DetailFixture.Texts(page);

        var total = DetailFixture.TextOp(page, "【합계】");
        var ask = DetailFixture.TextOp(page, "신청인 : 가상환자01 (환자와의 관계 : 본인)의 요청에 따라");
        var issue = DetailFixture.TextOp(page, "진료비 계산서·영수증 세부산정내역을 발급합니다.");
        var date = DetailFixture.TextOp(page, "2026년 11월 20일");
        var clinic = DetailFixture.TextOp(page, "요양기관 명칭 : 가상의원");
        var owner = DetailFixture.TextOp(page, "대표자 : 가상원장");
        var stamp = DetailFixture.TextOp(page, "[인]");
        var guide = DetailFixture.TextOp(page, "일반사항 안내");
        var order = new[] { total, ask, issue, date, clinic, guide };
        for (var i = 1; i < order.Length; i++) Assert.True(order[i].Y >= order[i - 1].Y2 - Eps, order[i].Value);
        Assert.True(owner.Y >= date.Y2 - Eps);
        Assert.True(stamp.X >= owner.X - Eps);

        var guides = new[]
        {
            "1. 진료비 계산서·영수증의 세부내역서는 환자의 구체적인 처방 내역 등이 확인되므로 원칙적으로 환자 본인 외에 발급을 금합니다.",
            "다만, 본 세부내역서 발급에 대해 별도로 환자 본인으로부터 위임을 받은 것이 확인된 자 또는 법정대리인에겐 발급이 가능합니다.",
            "2. 비고란은 세부산정내역을 발부하는 영수증번호 등 요양기관이 필요한 경우 추가 기재하는 공간으로 활용할수 있습니다.",
            "3. 동 서식에 명시된 항목은 「국민건강보험 요양급여의 기준에 관한 규칙」제7조제3항에 따라 필수 기재되어야 합니다.",
        };
        var previous = guide;
        foreach (var line in guides)
        {
            var op = DetailFixture.TextOp(page, line);
            Assert.True(op.Y >= previous.Y2 - Eps, line);
            previous = op;
        }
        Assert.Contains(texts, text => text == "가상환자01");

        var seal = Assert.Single(page.Ops, op => op.Kind == DocOpKind.Image);
        Assert.Equal(DocContext.SealKey, seal.Key);
        Assert.Equal(DetailFixture.Seal, page.ImageOf(DocContext.SealKey));
        Assert.True(seal.X < stamp.X2 && seal.X2 > stamp.X && seal.Y < stamp.Y2 && seal.Y2 > stamp.Y, "직인은 [인] 자리에 겹친다");
        AllInside(new[] { page });
    }

    [Fact(DisplayName = "AC-7406.1 직인 그림이 없으면 그림 글도 그림도 넣지 않는다([인] 글만)")]
    public void NoSeal()
    {
        var page = Assert.Single(Draw(DetailFixture.Context(withSeal: false)));

        Assert.DoesNotContain(page.Ops, op => op.Kind == DocOpKind.Image);
        Assert.Empty(page.Images);
        Assert.Contains("[인]", DetailFixture.Texts(page));
    }

    // ── 여러 쪽 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 길면 여러 쪽: 쪽마다 제목·환자 머리·표 머리를 다시, 'Page-n/N', 줄은 한 번씩 차례대로, 계·합계·발급 문장·직인·안내는 마지막 쪽에만")]
    public void ManyPages()
    {
        var (lines, visits, days) = DetailFixture.Many(15, 10);
        var pages = Draw(DetailFixture.Context(days), lines, visits);

        Assert.True(pages.Count >= 3, $"{pages.Count}쪽");
        var seen = new List<string>();
        for (var i = 0; i < pages.Count; i++)
        {
            var page = pages[i];
            var texts = DetailFixture.Texts(page);
            Assert.Contains("진료비 세부산정내역", texts);
            Assert.Contains("환자등록번호", texts);
            Assert.Contains("가상환자01", texts);
            Assert.Contains("Page-" + (i + 1) + "/" + pages.Count, texts);
            foreach (var label in TableHeads) Assert.Contains(label, texts);
            var last = i == pages.Count - 1;
            Assert.Equal(last, texts.Contains("【합계】"));
            Assert.Equal(last, texts.Contains("【계】"));
            Assert.Equal(last, texts.Contains("일반사항 안내"));
            Assert.Equal(last, texts.Contains("진료비 계산서·영수증 세부산정내역을 발급합니다."));
            Assert.Equal(last, page.Ops.Any(op => op.Kind == DocOpKind.Image));

            var rows = TextOps(page).Where(op => op.Value.StartsWith("줄", StringComparison.Ordinal)).OrderBy(op => op.Y).ToArray();
            var headBottom = Head(page, "본인부담금").Y2;
            foreach (var row in rows)
            {
                Assert.True(row.Y >= headBottom - Eps);
                Assert.True(row.Y2 <= DetailLayout.Bottom + Eps);
            }
            if (rows.Length > 0) Assert.NotEqual("", Cell(page, "항목", rows[0]));
            if (last && rows.Length > 0) Assert.True(DetailFixture.TextOp(page, "【계】").Y >= rows.Last().Y2 - Eps);
            seen.AddRange(rows.Select(row => row.Value));
        }
        Assert.Equal(Enumerable.Range(1, 150).Select(n => "줄" + n.ToString("000", System.Globalization.CultureInfo.InvariantCulture)), seen);
        AllInside(pages);
    }

    [Fact(DisplayName = "AC-7406.1 마지막 쪽에 계·발급 문장·안내가 다 들어가지 않으면 다음 쪽으로 넘긴다(쪽 밖으로 나가지 않음)")]
    public void TailMovesToNextPage()
    {
        var tailOnly = false;
        for (var count = 1; count <= 80; count++)
        {
            var (lines, visits, days) = DetailFixture.Many(1, count);
            var pages = Draw(DetailFixture.Context(days), lines, visits);
            AllInside(pages);
            var last = pages.Last();
            var rows = TextOps(last).Where(op => op.Value.StartsWith("줄", StringComparison.Ordinal)).ToArray();
            var sum = DetailFixture.TextOp(last, "【계】");
            Assert.All(rows, row => Assert.True(row.Y2 <= sum.Y + Eps));
            Assert.True(TextOps(last).Max(op => op.Y2) <= DetailLayout.Bottom + Eps);
            Assert.Equal(count, pages.Sum(page => TextOps(page).Count(op => op.Value.StartsWith("줄", StringComparison.Ordinal))));
            if (pages.Count > 1 && rows.Length == 0) tailOnly = true;
        }
        Assert.True(tailOnly, "줄은 다 들어가도 계·안내가 안 들어가 다음 쪽으로 넘어가는 경우가 있어야 한다");
    }

    // ── 서류 잇기 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 DetailSource(Kind=Detail)는 읽고 그려 쪽을 준다: 고른 날 전체가 한 서류, 수납한 줄이 없으면 0쪽, 고른 날이 없으면 DB에 묻지 않음, 장 수는 DocPlan에")]
    public void SourceWiring()
    {
        var source = new DetailSource();
        Assert.Equal(DocKind.Detail, source.Kind);

        var db = DetailFixture.Db();
        var pages = source.Pages(db, DetailFixture.Context());
        var page = Assert.Single(pages);
        Assert.Contains("재진진찰료", DetailFixture.Texts(page));
        Assert.Contains("가상선별재료", DetailFixture.Texts(page));

        Assert.Empty(source.Pages(DetailFixture.Db(), DetailFixture.Context(new[] { DetailFixture.Day(10, "V3") })));
        var quiet = DetailFixture.Db();
        Assert.Empty(source.Pages(quiet, DetailFixture.Context(Array.Empty<VisitDay>())));
        Assert.Empty(quiet.Calls);

        var plan = DocPlan.Build(DocSources.All, DetailFixture.Db(), DetailFixture.Context(), new[] { DocKind.Detail });
        Assert.Equal(1, plan.CountOf(DocKind.Detail));
        Assert.Equal(1, plan.Total);
        Assert.True(plan.CanPrint);
    }
}
