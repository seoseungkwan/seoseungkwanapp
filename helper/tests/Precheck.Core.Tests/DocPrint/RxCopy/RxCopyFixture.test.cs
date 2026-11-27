using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.RxCopy;
using Precheck.Core.Tests.Bit;

namespace Precheck.Core.Tests.DocPrint.RxCopy;

/// <summary>
/// 처방전 사본 시험(spec doc-print TASK-6)이 같이 쓰는 지어낸 값: 가상의원·가상환자01·가상의사·가상정 같은 이름과 9로 시작하는 차트번호뿐이다.
/// 처방 줄은 RxCopySql의 한 문장이 돌려주는 칸 차례 그대로다:
/// [0 내원 번호, 1 교부일 OutSlpDte, 2 교부 번호 OutSlpNum, 3 보험 OcmInsCod, 4 주민번호 앞 7자리, 5 의사 이름, 6 면허번호, 7 주상병, 8 주상병 특정기호,
///  9 보험 이름 InsCodNam, 10 PmdAssCod, 11 PmdEntNam, 12 PmdInsNum, 13 PmdPasNam, 14 PwkAssCod, 15 PwkRcuNum, 16 PcrAssCod,
///  17 약 코드, 18 약 이름, 19 OdrQty(하루 양), 20 OdrTms, 21 OdrDay, 22 OdrInsYon].
/// 자리 기준은 비트 처방전 견본 그림(C:\DrBIT50\원외처방전\국민건강.jpg, 1190×1682 = A4 144dpi, mm = px ÷ 1190 × 210)에서 잰 선·글 자리다.
/// </summary>
internal static class RxFixture
{
    public const string Chart = "90001";

    /// <summary>견본 그림에서 잰 자리와 맞춰 보는 허용 차(mm).</summary>
    public const float Tol = 0.35f;

    public static readonly HospitalInfo Hospital =
        new HospitalInfo("가상의원", "12345678", "가상시 가상로 1", "1234567890", "가상원장", "가상의원(영수증)", "02-000-0000", "02-000-0001", new byte[] { 0x89, 0x50, 0x4E, 0x47 });

    /// <summary>처방 시험의 하나뿐인 문장(허용 목록이 비면 여기서 실패한다).</summary>
    public static string RxSql => RxCopySql.Allowed.Keys.Single();

    /// <summary>맑은 고딕을 닮은 가짜 글 폭: 한글 1em, 그 밖 0.55em(1em = pt × 0.3528mm).</summary>
    public static float WidthMm(string text, float pt) =>
        (text ?? "").Sum(c => c >= 'ᄀ' ? 1f : 0.55f) * pt * 0.3528f;

    public static VisitDay Day(int day, bool rx, params string[] visits) => new VisitDay(new DateTime(2026, 11, day), false, rx, visits);

    public static DocContext Context(params VisitDay[] days) => Context(Hospital, days);

    public static DocContext Context(HospitalInfo hospital, params VisitDay[] days) => new DocContext(
        Chart,
        new PatientHit(Chart, "가상환자01", "19800302", "F", "20261120"),
        days,
        new DateTime(2026, 11, 1),
        new DateTime(2026, 11, 20),
        hospital,
        WidthMm,
        new DateTime(2026, 11, 20));

    /// <summary>처방 줄 하나(약 칸이 모두 null이면 약 없는 처방전 머리만 있는 줄).</summary>
    public static object?[] Row(
        string visit,
        string slipDay,
        string slipNum,
        object? insurance,
        string? drugCode,
        string? drugName,
        object? qty,
        object? times,
        object? days,
        string? insYon = "0",
        string? resFront = "8003022",
        string? doctor = "가상의사",
        string? license = "000001",
        string? mainDx = "M5456",
        string? vee = null,
        string? insName = "국민건강보험",
        string? pmdAss = "00000000001",
        string? pmdEnt = "가상공단지사",
        string? pmdCard = "90000000001",
        string? pmdInsured = "가상가입자01",
        string? pwkAss = "90000000002",
        string? pwkCard = "90000000003",
        string? pcrAss = "90000000004") =>
        new object?[]
        {
            visit, slipDay, slipNum, insurance, resFront, doctor, license, mainDx, vee,
            insName, pmdAss, pmdEnt, pmdCard, pmdInsured, pwkAss, pwkCard, pcrAss,
            drugCode, drugName, qty, times, days, insYon,
        };

    /// <summary>약 줄 하나: qty는 비트 OdrQty(하루 양), times는 OdrTms. 1회 투약량은 qty ÷ times로 찍힌다.</summary>
    public static object?[] Drug(string visit, string slipDay, string slipNum, string code, string name, decimal qty, short times, short days, string insYon = "0", object? insurance = null, string? insName = "국민건강보험") =>
        Row(visit, slipDay, slipNum, insurance ?? (short)31, code, name, qty, times, days, insYon, insName: insName);

    public static FakeDb Db(params object?[][] rows) => new FakeDb().Answer(RxSql, _ => rows);

    // ── 쪽 살피기 ─────────────────────────────

    public static string Norm(string text) => new string((text ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());

    public static IEnumerable<DocOp> Texts(DocPage page) => page.Ops.Where(op => op.Kind == DocOpKind.Text);

    /// <summary>빈칸을 빼고 글이 같은 글 하나.</summary>
    public static DocOp Text(DocPage page, string value)
    {
        var found = Texts(page).Where(op => Norm(op.Value) == Norm(value)).ToArray();
        if (found.Length != 1) throw new InvalidOperationException("'" + value + "' 글이 " + found.Length + "개");
        return found[0];
    }

    public static bool Has(DocPage page, string value) => Texts(page).Any(op => Norm(op.Value) == Norm(value));

    public static float MidY(DocOp op) => (op.Y + op.Y2) / 2f;

    public static float MidX(DocOp op) => (op.X + op.X2) / 2f;

    /// <summary>값이 이름표와 같은 줄(세로 가운데가 이름표 칸 안), 이름표 오른쪽.</summary>
    public static bool RightOf(DocOp label, DocOp value) =>
        MidY(value) >= label.Y - 0.01f && MidY(value) <= label.Y2 + 0.01f && value.X >= label.X2 - 0.01f;

    /// <summary>같은 줄의 글들(세로 가운데가 0.5mm 안).</summary>
    public static bool SameRow(DocOp a, DocOp b) => Math.Abs(MidY(a) - MidY(b)) < 0.5f;

    /// <summary>견본 그림의 그 칸(x·y·폭·높이, mm)과 같은 네모가 있다(선 굵기 stroke).</summary>
    public static bool HasBox(DocPage page, float x, float y, float w, float h, float stroke = 0.2f) =>
        page.Ops.Any(op => op.Kind == DocOpKind.Box
            && Math.Abs(op.X - x) <= Tol && Math.Abs(op.Y - y) <= Tol
            && Math.Abs(op.Width - w) <= Tol && Math.Abs(op.Height - h) <= Tol
            && Math.Abs(op.StrokeMm - stroke) < 0.01f);

    /// <summary>글이 견본 그림의 글 자리에 있다: 왼쪽 끝 x(가로 허용 tolX)·세로 가운데 cy(허용 0.5mm).</summary>
    public static bool At(DocOp op, float x, float cy, float tolX = 0.6f) =>
        Math.Abs(op.X - x) <= tolX && Math.Abs(MidY(op) - cy) <= 0.5f;

    /// <summary>글의 가로 가운데가 네모 [x, x+w] 가운데(허용 0.3mm)이고 세로로 그 네모와 겹친다.</summary>
    public static bool CenteredIn(DocOp op, float x, float w, float y, float h) =>
        Math.Abs(MidX(op) - (x + w / 2f)) <= 0.3f && MidY(op) >= y - 0.5f && MidY(op) <= y + h + 1f;

    /// <summary>네모 [x, x+w]×[y, y+h] 안에 가운데가 있는 글들.</summary>
    public static DocOp[] Inside(DocPage page, float x, float y, float w, float h) =>
        Texts(page).Where(op => MidX(op) >= x && MidX(op) <= x + w && MidY(op) >= y && MidY(op) <= y + h).ToArray();
}
