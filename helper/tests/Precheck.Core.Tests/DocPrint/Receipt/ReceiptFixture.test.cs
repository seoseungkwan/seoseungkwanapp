using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Receipt;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Receipt;

/// <summary>
/// 진료비 영수증 시험(spec doc-print TASK-4)이 함께 쓰는 가짜 값. 병원·환자·차트번호·내원 번호·금액은 모두 지어낸 것이다(가상의원·가상환자·90001·V1…).
/// 가짜 DB 줄 칸 차례는 ReceiptSql 문장 칸 차례와 같다.
/// </summary>
internal static class ReceiptFixture
{
    public const string Chart = "90001";

    public static readonly byte[] Seal = { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3 };

    /// <summary>지어낸 글 폭: 한글·전각 1em, 그 밖 0.55em(1pt = 0.3528mm). 윈도우 층은 실제 맑은 고딕으로 잰다.</summary>
    public static float Width(string text, float pt) =>
        (text ?? "").Sum(c => c >= 0x1100 ? 1f : 0.55f) * pt * 0.3528f;

    public static HospitalInfo Hospital(byte[]? seal = null, string address = "가상시 가상구 가상로 1") =>
        new HospitalInfo("가상의원", "12345678", address, "1234567890", "가상원장", "가상의원", "02-000-0000", "02-000-0001", seal);

    public static PatientHit Patient => new PatientHit(Chart, "가상환자", "19800302", "F", "20261120");

    public static VisitDay Day(int month, int day, params string[] visits) =>
        new VisitDay(new DateTime(2026, month, day), false, false, visits);

    public static DocContext Context(IEnumerable<VisitDay> days, HospitalInfo? hospital = null, Func<string, float, float>? width = null)
    {
        var list = days.ToArray();
        var from = list.Length == 0 ? new DateTime(2026, 11, 1) : list.Min(d => d.Date);
        var to = list.Length == 0 ? new DateTime(2026, 11, 20) : list.Max(d => d.Date);
        return new DocContext(Chart, Patient, list, from.AddDays(-2), to.AddDays(3), hospital ?? Hospital(Seal), width ?? Width, new DateTime(2026, 11, 20, 10, 0, 0));
    }

    /// <summary>
    /// ReceiptsSql 한 줄: [내원 번호, 내원 날 yyyyMMdd, 영수증 번호 OrpRcpNum, 수납일 OrpAccDte, 주야간 OcmDgsDnh, 진료과 DepKorNam, 환자구분 InsCodNam, 보험 코드 OcmInsCod,
    /// 총진료비 OrpTotAmt, 공단 OrpCorAmt, 본인부담 총액 OrpTotOwn, 급여 본인부담 OrpInsOwn, 비급여 OrpNonAmt, 장애인기금 OrpRcvBil, 지원금 OrpSupBil,
    /// RCV 현금 OrcNewAmt, RCV 카드 OrcCrdAmt, RCV 계좌 OrcChkAmt, QCV 건강생활유지비, 현금영수증 금액 CashSupAmt, 현금영수증 승인번호 CashAuthNum].
    /// 금액은 비트 numeric처럼 decimal로 준다.
    /// </summary>
    public static object?[] Orp(
        string visit, string day, string rcpNum, long total, long corp, long patientTotal, long insOwn, long nonPay,
        string accDay = "", string dnh = "D", string dep = "1진료실", string ins = "국민건강보험", short insCode = 31,
        long disabled = 0, long support = 0, long cash = 0, long card = 0, long account = 0, long health = 0, long cashReceipt = 0, string? approval = null) =>
        new object?[]
        {
            visit, day, rcpNum, accDay == "" ? day : accDay, dnh, dep, ins, insCode,
            (decimal)total, (decimal)corp, (decimal)patientTotal, (decimal)insOwn, (decimal)nonPay, (decimal)disabled, (decimal)support,
            (decimal)cash, (decimal)card, (decimal)account, (decimal)health, (decimal)cashReceipt, approval,
        };

    /// <summary>ItemsSql 한 줄: [내원 번호, 영수증 번호 OdlRcpNum, 항목 OdlIncCod, 급여 본인부담 OdlInsOwn, 공단 OdlInsCor, 전액본인부담 OdlHunAmt, 비급여(OdlNonAmt+OdlNin*), 선별 50·80·30·90·95].</summary>
    public static object?[] Odl(string visit, string rcpNum, short code, long own, long corp, long full = 0, long nonPay = 0, long h50 = 0, long h80 = 0, long h30 = 0, long h90 = 0, long h95 = 0) =>
        new object?[] { visit, rcpNum, code, (decimal)own, (decimal)corp, (decimal)full, (decimal)nonPay, (decimal)h50, (decimal)h80, (decimal)h30, (decimal)h90, (decimal)h95 };

    public static FakeDb Db(IEnumerable<object?[]> receipts, IEnumerable<object?[]> items) =>
        new FakeDb()
            .Answer(ReceiptSql.ReceiptsSql, _ => receipts.ToArray())
            .Answer(ReceiptSql.ItemsSql, _ => items.ToArray());

    // ── 쪽 안 찾기 ─────────────────────────────

    public static DocOp[] Texts(DocPage page) => page.Ops.Where(op => op.Kind == DocOpKind.Text).ToArray();

    /// <summary>글이 꼭 그대로인 Text 하나(여럿이면 첫 것). 없으면 시험 실패.</summary>
    public static DocOp Text(DocPage page, string value)
    {
        var found = Texts(page).FirstOrDefault(op => op.Value == value);
        Assert.True(found != null, "쪽에 글이 없다: " + value + "\n있는 글: " + string.Join(" | ", Texts(page).Select(op => op.Value)));
        return found!;
    }

    public static bool Has(DocPage page, string value) => Texts(page).Any(op => op.Value == value);

    /// <summary>값 칸이 이름표 칸의 가로 안에 있고 그 아래(위 끝이 이름표 아래 끝 이상)에 있다.</summary>
    public static void Below(DocOp label, DocOp value)
    {
        Assert.True(value.X >= label.X - 0.01f && value.X2 <= label.X2 + 0.01f, $"'{value.Value}'({value.X}~{value.X2})가 '{label.Value}'({label.X}~{label.X2}) 가로 안에 없다");
        Assert.True(value.Y >= label.Y2 - 0.01f, $"'{value.Value}'(y {value.Y})가 '{label.Value}'(y 끝 {label.Y2}) 아래에 없다");
    }

    /// <summary>값 칸이 그 줄(이름표)과 세로로 겹치고 그 열(머리 칸)의 가로 안에 있다.</summary>
    public static void InCell(DocOp row, DocOp column, DocOp value)
    {
        Assert.True(value.X >= column.X - 0.01f && value.X2 <= column.X2 + 0.01f, $"'{value.Value}'({value.X}~{value.X2})가 열 '{column.Value}'({column.X}~{column.X2}) 안에 없다");
        var mid = (value.Y + value.Y2) / 2;
        Assert.True(mid > row.Y && mid < row.Y2, $"'{value.Value}'(y {value.Y}~{value.Y2})가 줄 '{row.Value}'(y {row.Y}~{row.Y2})에 없다");
    }

    /// <summary>①~⑳ 한 글자(합계 칸 귀퉁이 번호표).</summary>
    public static bool IsMark(string value) => value.Length == 1 && value[0] >= '①' && value[0] <= '⑳';

    /// <summary>그 줄(이름표와 세로로 겹침)에서 그 열 안의 Text 글(번호표 ①~⑳는 빼고). 없으면 빈 글.</summary>
    public static string At(DocPage page, DocOp row, DocOp column)
    {
        var mid = (row.Y + row.Y2) / 2;
        var hit = Texts(page).FirstOrDefault(op =>
            op != row && op != column && op.Y < mid && op.Y2 > mid && op.X >= column.X - 0.01f && op.X2 <= column.X2 + 0.01f && op.Value.Trim().Length > 0 && !IsMark(op.Value));
        return hit?.Value ?? "";
    }

    /// <summary>세로로 한 글자씩 쌓은 글(같은 가로 자리, 위에서 아래로). 그 글자들을 감싼 칸(첫 글자 X·Y ~ 끝 글자 X2·Y2)을 돌려준다.</summary>
    public static DocOp Stacked(DocPage page, string word)
    {
        var texts = Texts(page);
        for (var i = 0; i + word.Length <= texts.Length; i++)
        {
            var run = texts.Skip(i).Take(word.Length).ToArray();
            if (!run.Select(op => op.Value).SequenceEqual(word.Select(c => c.ToString()))) continue;
            Assert.All(run, op => Assert.True(Math.Abs(op.X - run[0].X) < 0.01f && Math.Abs(op.X2 - run[0].X2) < 0.01f));
            for (var k = 1; k < run.Length; k++) Assert.True(run[k].Y >= run[k - 1].Y2 - 0.01f, word + " 글자가 위에서 아래로 쌓이지 않았다");
            return DocOp.Box(run[0].X, run[0].Y, run[0].Width, run[run.Length - 1].Y2 - run[0].Y, 0);
        }
        Assert.Fail("세로 글이 없다: " + word);
        return null!;
    }

    /// <summary>오른쪽 '금액산정내용'에서 그 이름표 줄 오른쪽 값 칸 글.</summary>
    public static string RightOf(DocPage page, DocOp label)
    {
        var mid = (label.Y + label.Y2) / 2;
        var hit = Texts(page)
            .Where(op => op != label && op.X >= label.X2 - 0.01f && op.Y < mid && op.Y2 > mid && op.Value.Trim().Length > 0)
            .OrderBy(op => op.X)
            .FirstOrDefault();
        return hit?.Value ?? "";
    }
}
