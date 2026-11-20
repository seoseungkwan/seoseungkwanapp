using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Chart;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Chart;

/// <summary>
/// 진료기록부 시험(spec doc-print TASK-7)이 같이 쓰는 가짜 비트 DB. 문장은 ChartSql.Allowed에 있는 것만 받고,
/// 문장이 읽는 표(dbo.EmrInf·OicInf·OdrInf·OrpInf·OcmInf·PbsInf)로 답할 줄을 고른다. 날짜 범위는 거르지 않는다(고른 날 거르기는 ChartSource가 한다).
/// 값은 모두 지어낸 것이다(가상환자01·가상의원·가상 기록).
/// 줄 모양(칸 차례)은 ChartSql 설명 그대로:
/// 환자 [주민번호 앞 7자리] · 내원 [내원 번호, 접수 시각 yyyyMMddHHmm, 진료과, 진료의] · 기록 [내원 번호, 글] · 상병 [내원 번호, 주부 1|2, 코드, 이름]
/// · 처방 [내원 번호, 원외 구분(XX = 원외), 청구코드, 사용자코드, 이름, 용량, 횟수, 일수, 용법, 교부번호] · 수납 [내원 번호, 수납일 yyyyMMdd, 총진료비, 영수액, 수납액, 할인액].
/// </summary>
internal sealed class ChartDb : IBitDb
{
    public object?[]? Patient { get; set; } = { "8003022" };

    public List<object?[]> Visits { get; } = new List<object?[]>();

    public List<object?[]> Notes { get; } = new List<object?[]>();

    public List<object?[]> Diagnoses { get; } = new List<object?[]>();

    public List<object?[]> Orders { get; } = new List<object?[]>();

    public List<object?[]> Payments { get; } = new List<object?[]>();

    /// <summary>이 표를 읽는 문장에서 BitException(E-BIT-READ-FAILED)을 던진다(예: "dbo.EmrInf").</summary>
    public string? FailTable { get; set; }

    public List<(string Sql, Dictionary<string, object?> Args)> Calls { get; } = new List<(string Sql, Dictionary<string, object?> Args)>();

    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        Calls.Add((sql, args.ToDictionary(pair => pair.Key, pair => pair.Value)));
        Assert.True(ChartSql.Allowed.ContainsKey(sql), "진료기록부 허용 목록 밖 문장");
        if (FailTable != null && sql.Contains(FailTable)) throw new BitException(BitErrors.ReadFailed);
        return RowsFor(sql).Select(row => (IReadOnlyList<object?>)row).ToList();
    }

    private IEnumerable<object?[]> RowsFor(string sql)
    {
        if (sql.Contains("dbo.EmrInf")) return Notes;
        if (sql.Contains("dbo.OicInf")) return Diagnoses;
        if (sql.Contains("dbo.OdrInf")) return Orders;
        if (sql.Contains("dbo.OrpInf")) return Payments;
        if (sql.Contains("dbo.OcmInf")) return Visits;
        if (sql.Contains("dbo.PbsInf")) return Patient == null ? Array.Empty<object?[]>() : new[] { Patient };
        throw new InvalidOperationException("모르는 문장");
    }

    public static object?[] Visit(string id, string acceptedAt, string department = "정형외과", string doctor = "가상의사") =>
        new object?[] { id, acceptedAt, department, doctor };

    public static object?[] Note(string id, string text) => new object?[] { id, text };

    public static object?[] Dx(string id, string pri, string code, string name) => new object?[] { id, pri, code, name };

    public static object?[] Order(string id, string code, string name, decimal qty, short tms, short day, string outCode = "", string userCode = "U0", string usage = "", string slip = "") =>
        new object?[] { id, outCode, code, userCode, name, qty, tms, day, usage, slip };

    public static object?[] Pay(string id, string day8, decimal total, decimal own, decimal paid, decimal discount) =>
        new object?[] { id, day8, total, own, paid, discount };
}

/// <summary>시험 값 묶음 만들기와 쪽 살피기.</summary>
internal static class ChartCase
{
    public static readonly DateTime Today = new DateTime(2026, 11, 20);

    public static readonly PatientHit Patient = new PatientHit("90001", "가상환자01", "19800302", "F", "20261110");

    public static readonly HospitalInfo Hospital = new HospitalInfo("가상의원", "12345678", "가상시 가상로 1", "1234567890", "가상원장", "가상의원", "02-000-0000", "02-000-0001", new byte[] { 0x89, 0x50, 0x4E, 0x47 });

    /// <summary>가짜 글 폭: 글자 수 × pt × 0.2mm(9pt면 한 글자 1.8mm).</summary>
    public static float Measure(string text, float pt) => (text ?? "").Length * pt * 0.2f;

    public static VisitDay Day(int year, int month, int day, params string[] visits) => new VisitDay(new DateTime(year, month, day), false, false, visits);

    public static DocContext Context(params VisitDay[] days) =>
        new DocContext("90001", Patient, days, days.Length == 0 ? Today : days.Min(d => d.Date), Today, Hospital, Measure, Today);

    public static IReadOnlyList<DocPage> Draw(ChartDb db, params VisitDay[] days) => new ChartSource().Pages(db, Context(days));

    public static List<string> Texts(DocPage page) => page.Ops.Where(op => op.Kind == DocOpKind.Text).Select(op => op.Value).ToList();

    public static List<string> AllTexts(IEnumerable<DocPage> pages) => pages.SelectMany(Texts).ToList();

    /// <summary>글 칸 두 개가 겹치는가(가장자리 닿음은 겹침 아님).</summary>
    public static bool Overlaps(DocOp a, DocOp b) =>
        a.X < b.X2 - 0.01f && b.X < a.X2 - 0.01f && a.Y < b.Y2 - 0.01f && b.Y < a.Y2 - 0.01f;

    /// <summary>쪽마다: 모든 그리기가 A4 여백(좌우 10mm·위아래 8mm) 안, 글은 제 칸 폭 안(가짜 폭으로), 글 칸끼리 겹치지 않는다.</summary>
    public static void AssertTidy(IReadOnlyList<DocPage> pages)
    {
        foreach (var page in pages)
        {
            foreach (var op in page.Ops)
            {
                Assert.True(Math.Min(op.X, op.X2) >= 10f && Math.Max(op.X, op.X2) <= DocPage.WidthMm - 10f, "가로 여백 밖: " + op.Kind + " " + op.Value);
                Assert.True(Math.Min(op.Y, op.Y2) >= 8f && Math.Max(op.Y, op.Y2) <= DocPage.HeightMm - 8f, "세로 여백 밖: " + op.Kind + " " + op.Value);
                if (op.Kind != DocOpKind.Text) continue;
                Assert.True(Measure(op.Value, op.Pt) <= op.Width + 0.01f, "칸보다 긴 글: " + op.Value);
                Assert.True(op.Height >= op.Pt * 0.3528f, "글보다 낮은 칸: " + op.Value);
            }
            var texts = page.Ops.Where(op => op.Kind == DocOpKind.Text && op.Value.Length > 0).ToArray();
            for (var i = 0; i < texts.Length; i++)
            {
                for (var j = i + 1; j < texts.Length; j++)
                {
                    Assert.False(Overlaps(texts[i], texts[j]), "겹친 글: " + texts[i].Value + " / " + texts[j].Value);
                }
            }
        }
    }

    /// <summary>내원 visits개, 내원마다 기록 notes줄·상병 2·처방 3(원외 1)·수납 1. 날은 2026-10-01부터 하루씩.</summary>
    public static (ChartDb Db, VisitDay[] Days) Many(int visits, int notes)
    {
        var db = new ChartDb();
        var days = new List<VisitDay>();
        for (var i = 0; i < visits; i++)
        {
            var date = new DateTime(2026, 10, 1).AddDays(i);
            var id = "V" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture);
            var day8 = date.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
            days.Add(new VisitDay(date, false, true, new[] { id }));
            db.Visits.Add(ChartDb.Visit(id, day8 + "0930"));
            for (var k = 0; k < notes; k++) db.Notes.Add(ChartDb.Note(id, "가상 기록 " + i + "-" + k));
            db.Diagnoses.Add(ChartDb.Dx(id, "1", "M5456", "가상 상병 주"));
            db.Diagnoses.Add(ChartDb.Dx(id, "2", "M4806", "가상 상병 부"));
            db.Orders.Add(ChartDb.Order(id, "AA254", "가상 재진료", 1m, 1, 1));
            db.Orders.Add(ChartDb.Order(id, "MM101", "가상 물리치료", 1m, 1, 1));
            db.Orders.Add(ChartDb.Order(id, "600000001", "가상약품정", 1m, 3, 3, outCode: "XX", slip: day8 + "00001"));
            db.Payments.Add(ChartDb.Pay(id, day8, 15300m, 4500m, 4500m, 0m));
        }
        return (db, days.ToArray());
    }
}
