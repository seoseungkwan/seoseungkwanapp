using System;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.RxCopy;
using Xunit;
using static Precheck.Core.Tests.DocPrint.RxCopy.RxFixture;

namespace Precheck.Core.Tests.DocPrint.RxCopy;

/// <summary>
/// spec doc-print AC-7406.1(처방전 사본 그리기): 의료법 시행규칙 별지 제9호서식·비트 BITOutSlip 글(notes/forms.md §3)의 칸 차례로 A4 세로 한 쪽,
/// 환자보관용 표시·사본 글, 주상병 하나, 약이 많으면 다음 쪽. 견본 PDF가 오면 칸 자리를 견본에 맞춘다(TASK-8). 값은 모두 지어낸 것이다.
/// </summary>
public class RxCopyPageTests
{
    private static readonly RxCopySource Source = new RxCopySource();

    private static DocPage OnePage(params object?[][] rows) => Assert.Single(Source.Pages(Db(rows), Context(Day(3, true, "V1"))));

    private static DocPage Sample() => OnePage(
        Drug("V1", "20261103", "00012", "600000001", "가상정10mg", 2m, 3, 30),
        Drug("V1", "20261103", "00012", "600000002", "가상캡슐", 1m, 2, 30, "캡슐"));

    [Fact(DisplayName = "AC-7406.1 환자보관용 처방전: 제목 '처 방 전' 옆 [환자보관용], <사본이므로 조제불가>, 바코드·도장 그림 없음")]
    public void PatientCopyMarks()
    {
        var page = Sample();

        var title = Texts(page).Single(op => Norm(op.Value) == "처방전");
        Assert.True(title.Bold);
        Assert.True(title.Pt >= 16);
        var mark = Text(page, "[환자보관용]");
        Assert.True(SameRow(title, mark) || mark.Y >= title.Y - 0.01f);
        Assert.True(mark.X >= title.X2 - 0.01f || mark.X >= MidX(title));
        Assert.True(Text(page, "<사본이므로 조제불가>").Y < Text(page, "교부 연월일 및 번호").Y);
        Assert.False(Has(page, "[약국제출용]"));
        Assert.False(Has(page, "[병원보관용]"));

        Assert.DoesNotContain(page.Ops, op => op.Kind == DocOpKind.Image);
        Assert.Empty(page.Images);
    }

    [Fact(DisplayName = "AC-7406.1 머리 칸: 요양기관기호·교부 연월일 및 번호·환자 성명·주민등록번호(앞 7자리, 뒤 가림)·의료기관 명칭·전화·팩스·E-mail")]
    public void HeadCells()
    {
        var page = Sample();

        Assert.True(Has(page, "요양기관기호 : 12345678"));
        Assert.True(RightOf(Text(page, "교부 연월일 및 번호"), Text(page, "2026년 11월 03일 - 제 00012 호")));
        Assert.True(RightOf(Text(page, "성명"), Text(page, "가상환자01")));
        Assert.True(RightOf(Text(page, "주민등록번호"), Text(page, "800302-2******")));
        Assert.True(RightOf(Text(page, "명칭"), Text(page, "가상의원")));
        Assert.True(RightOf(Text(page, "전화번호"), Text(page, "02-000-0000")));
        Assert.True(RightOf(Text(page, "팩스번호"), Text(page, "02-000-0001")));
        Assert.True(Has(page, "E-mail 주소"));
        Assert.True(Has(page, "환자"));
        Assert.True(Has(page, "의료기관"));
        Assert.True(Text(page, "환자").X2 <= Text(page, "성명").X + 0.01f);
        Assert.True(Text(page, "의료기관").X >= Text(page, "가상환자01").X2 - 0.01f);
        Assert.False(Has(page, "1234567890"));
        Assert.False(Has(page, "가상시 가상로 1"));
    }

    [Fact(DisplayName = "AC-7406.1 질병분류기호(주상병 하나)·처방 의료인의 성명(서명 또는 날인)·면허종별 의사·면허번호, 그 아래 질병분류기호 안내 글")]
    public void DiagnosisAndDoctor()
    {
        var page = Sample();

        Assert.True(RightOf(Text(page, "질병분류기호"), Text(page, "M5456")));
        Assert.True(RightOf(Text(page, "처방 의료인의 성명"), Text(page, "가상의사")));
        Assert.True(Has(page, "(서명 또는 날인)"));
        Assert.True(RightOf(Text(page, "면허종별"), Text(page, "의사")));
        Assert.True(RightOf(Text(page, "면허번호"), Text(page, "000001")));
        var notice = Text(page, "※ 환자의 요구가 있는 때에는 질병분류기호를 기재하지 아니합니다.");
        Assert.True(notice.Y >= Text(page, "질병분류기호").Y2 - 0.01f);
        Assert.Single(Texts(page), op => op.Value == "M5456");
    }

    [Fact(DisplayName = "AC-7406.1 약 표: 처방 의약품의 명칭(코드·이름)·1회 투약량·1일 투여횟수·총 투약일수·본인부담 구분기호·용법 머리 아래 줄마다, 구분기호·용법은 빈칸")]
    public void DrugTable()
    {
        var page = Sample();

        var name = Text(page, "처방 의약품의 명칭");
        var qty = Text(page, "1회 투약량");
        var times = Text(page, "1일 투여횟수");
        var days = Text(page, "총 투약일수");
        var usage = Text(page, "용법");
        Assert.True(Has(page, "본인부담"));
        Assert.True(Has(page, "구분기호"));
        Assert.True(name.X2 <= qty.X + 0.01f && qty.X2 <= times.X + 0.01f && times.X2 <= days.X + 0.01f && days.X2 <= usage.X + 0.01f);

        var first = Text(page, "가상정10mg");
        var second = Text(page, "가상캡슐");
        Assert.True(Under(name, first));
        Assert.True(Under(name, Text(page, "600000001")));
        Assert.True(Text(page, "600000001").X2 <= first.X + 0.01f);
        Assert.True(first.Y2 <= second.Y + 0.01f);
        Assert.True(Under(qty, Text(page, "2정")) && SameRow(first, Text(page, "2정")));
        Assert.True(Under(qty, Text(page, "1캡슐")) && SameRow(second, Text(page, "1캡슐")));
        var threeTimes = Texts(page).Single(op => op.Value == "3");
        Assert.True(Under(times, threeTimes) && SameRow(first, threeTimes));
        var thirty = Texts(page).Where(op => op.Value == "30").ToArray();
        Assert.Equal(2, thirty.Length);
        Assert.All(thirty, op => Assert.True(Under(days, op)));

        // 본인부담 구분기호·용법 칸에는 아무 글도 없다(용법 글은 DB에 없음, notes/bit-docs.md §4)
        var usageCol = Texts(page).Where(op => op.Y >= usage.Y2 && MidX(op) >= usage.X && MidX(op) <= usage.X2 && op.Y2 <= Text(page, "조제시 참고사항").Y);
        Assert.Empty(usageCol);
    }

    [Fact(DisplayName = "AC-7406.1 아래 칸: 주사제 처방내역(원내조제 □, 원외처방 □)·조제시 참고사항·사용기간(교부일부터 ( ) 일간)·의약품 조제내역(조제기관의 명칭·조제약사·조제량·조제연월일·변경 내용) 빈칸")]
    public void LowerCells()
    {
        var page = Sample();

        var injection = Text(page, "주사제 처방내역(원내조제 □, 원외처방 □)");
        var note = Text(page, "조제시 참고사항");
        var period = Text(page, "사용기간");
        var made = Text(page, "의 약 품 조 제 내 역");
        Assert.True(SameRow(injection, note));
        Assert.True(Text(page, "가상캡슐").Y2 <= injection.Y);
        Assert.True(injection.Y2 <= period.Y && period.Y2 <= made.Y);
        Assert.True(RightOf(period, Text(page, "교부일부터 (       ) 일간")));
        Assert.True(Has(page, "사용기간 내에 약국에 제출하여야 합니다."));
        foreach (var label in new[] { "조제기관의 명칭", "조제약사 성명", "조제량(조제일수)", "조제연월일", "처방의 변경·수정·확인·대체 시 그 내용 등" })
        {
            Assert.True(Text(page, label).Y >= made.Y2 - 0.01f, label);
        }
    }

    [Fact(DisplayName = "AC-7406.1 보험 구분: 국민건강보험(31)→1 의료보험, 의료급여(51·52)→2 의료보호, 산재(41~44)→3, 자보(21·22)→4, 일반·공상 등→5 기타 에 네모 표시 하나")]
    public void InsuranceMark()
    {
        var cases = new (short Code, string Option)[] { (31, "1 의료보험"), (51, "2 의료보호"), (52, "2 의료보호"), (42, "3 산재보험"), (21, "4 자동차보험"), (11, "5 기타 (       )"), (38, "5 기타 (       )") };
        foreach (var (code, option) in cases)
        {
            var page = OnePage(Drug("V1", "20261103", "00012", "600000001", "가상정10mg", 1m, 1, 1, insurance: code));
            var options = new[] { "1 의료보험", "2 의료보호", "3 산재보험", "4 자동차보험", "5 기타 (       )" }.Select(o => Text(page, o)).ToArray();
            Assert.True(options.Zip(options.Skip(1), (a, b) => a.X2 <= b.X + 0.01f && SameRow(a, b)).All(ok => ok));

            var marks = page.Ops.Where(op => op.Kind == DocOpKind.Box && op.Height < 8 && op.Y2 < Text(page, "교부 연월일 및 번호").Y).ToArray();
            var mark = Assert.Single(marks);
            var chosen = Text(page, option);
            Assert.True(mark.X <= chosen.X + 0.01f && mark.X2 >= chosen.X2 - 0.01f && mark.Y <= chosen.Y + 0.01f && mark.Y2 >= chosen.Y2 - 0.01f, code + " " + option);
        }

        var unknown = OnePage(Drug("V1", "20261103", "00012", "600000001", "가상정10mg", 1m, 1, 1, insurance: DBNull.Value));
        Assert.Single(unknown.Ops, op => op.Kind == DocOpKind.Box && op.Height < 8 && op.Y2 < Text(unknown, "교부 연월일 및 번호").Y);
    }

    [Fact(DisplayName = "AC-7406.1 모든 글·선·네모는 A4(210×297mm) 안이고, 글은 칸 폭·높이에 맞는다(긴 약 이름은 글씨를 줄이거나 두 줄로)")]
    public void EverythingFitsA4()
    {
        var longName = "가상아주긴이름의약품정제필름코팅서방형500밀리그램(가상성분염산염수화물)가상제약주식회사";
        var page = OnePage(
            Drug("V1", "20261103", "00012", "600000001", longName, 1m, 2, 30),
            Drug("V1", "20261103", "00012", "600000002", "가상정10mg", 2m, 3, 30));

        foreach (var op in page.Ops)
        {
            Assert.True(Math.Min(op.X, op.X2) >= 0 && Math.Max(op.X, op.X2) <= DocPage.WidthMm, op.Kind + " " + op.Value);
            Assert.True(Math.Min(op.Y, op.Y2) >= 0 && Math.Max(op.Y, op.Y2) <= DocPage.HeightMm, op.Kind + " " + op.Value);
        }
        foreach (var op in Texts(page))
        {
            Assert.True(op.Pt >= 6f, op.Value);
            Assert.True(WidthMm(op.Value, op.Pt) <= op.Width + 0.01f, op.Value + " 폭");
            Assert.True(op.Pt * 1.2f * 0.3528f <= op.Height + 0.01f, op.Value + " 높이");
        }

        var nameHeader = Text(page, "처방 의약품의 명칭");
        var code = Text(page, "600000001");
        var parts = Texts(page).Where(op => Under(nameHeader, op) && op.X >= code.X2 - 0.01f && op.Y < Text(page, "가상정10mg").Y).OrderBy(op => op.Y).ToArray();
        Assert.InRange(parts.Length, 1, 2);
        Assert.StartsWith("가상아주긴", parts[0].Value, StringComparison.Ordinal);
        Assert.True(parts.All(p => p.Pt < 10f));
    }

    [Fact(DisplayName = "AC-7406.1 약이 한 쪽 칸보다 많으면 다음 쪽에 이어 그리고 쪽마다 머리 칸·표시를 다시, 쪽 표시 1/2·2/2(한 쪽이면 쪽 표시 없음)")]
    public void ManyDrugsGoToNextPage()
    {
        var rows = Enumerable.Range(1, 20)
            .Select(n => Drug("V1", "20261103", "00012", (600000000 + n).ToString(), "가상약" + n.ToString("00") + "정", 1m, 1, 3))
            .ToArray();
        var pages = Source.Pages(Db(rows), Context(Day(3, true, "V1")));

        Assert.Equal(2, pages.Count);
        var onFirst = Enumerable.Range(1, 20).Count(n => Has(pages[0], "가상약" + n.ToString("00") + "정"));
        var onSecond = Enumerable.Range(1, 20).Count(n => Has(pages[1], "가상약" + n.ToString("00") + "정"));
        Assert.Equal(20, onFirst + onSecond);
        Assert.InRange(onFirst, 10, 19);
        Assert.True(Has(pages[0], "가상약01정") && Has(pages[1], "가상약20정"));
        var lastOnFirst = Enumerable.Range(1, 20).Last(n => Has(pages[0], "가상약" + n.ToString("00") + "정"));
        Assert.True(Has(pages[1], "가상약" + (lastOnFirst + 1).ToString("00") + "정"));

        for (var i = 0; i < 2; i++)
        {
            Assert.True(Has(pages[i], "[환자보관용]"));
            Assert.True(Has(pages[i], "<사본이므로 조제불가>"));
            Assert.True(Has(pages[i], "2026년 11월 03일 - 제 00012 호"));
            Assert.True(Has(pages[i], "가상환자01"));
            Assert.True(Has(pages[i], "M5456"));
            Assert.Single(Texts(pages[i]), op => op.Value.EndsWith((i + 1) + "/2", StringComparison.Ordinal));
        }

        Assert.DoesNotContain(Texts(Sample()), op => op.Value.EndsWith("1/1", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-7406.1 빈 값은 빈칸: 주민번호·의사·면허번호·병원 전화가 없으면 그 칸에 가짜 글을 채우지 않는다")]
    public void BlanksStayBlank()
    {
        var hospital = new HospitalInfo("가상의원", "", "", "", "", "", "", "", null);
        var db = Db(Row("V1", "20261103", "00012", (short)31, "600000001", "가상정10mg", 1m, (short)1, (short)1, "정", resFront: null, doctor: null, license: null, mainDx: null));
        var page = Assert.Single(Source.Pages(db, Context(hospital, Day(3, true, "V1"))));

        foreach (var label in new[] { "주민등록번호", "전화번호", "팩스번호", "질병분류기호", "면허번호" })
        {
            var cell = Text(page, label);
            Assert.DoesNotContain(Texts(page), op => op != cell && RightOf(cell, op) && op.X < cell.X2 + 30 && op.Value.Trim().Length > 0 && !op.Value.StartsWith("(", StringComparison.Ordinal) && op.Value != "면허종별" && op.Value != "면허번호" && op.Value != "의사");
        }
        Assert.True(Has(page, "요양기관기호 :"));
        Assert.True(Has(page, "가상의원"));
    }
}
