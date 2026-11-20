using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print REQ-7404: 묶음 단추·서류 체크(DocPicks), 서류마다 그린 쪽 수와 인쇄 차례(DocPlan), 쪽 그리기 글(DocPage·DocOp).
/// 서류 4종의 실제 쪽은 Phase 2가 만든다. 여기서는 가짜 서류(FakeSource)로 차례·장 수만 본다.
/// </summary>
public class DocPlanTests
{
    /// <summary>쪽마다 글 하나("종류 n")를 그리는 가짜 서류. 부른 횟수와 받은 db·ctx를 적어 둔다.</summary>
    private sealed class FakeSource : IDocSource
    {
        private readonly Func<DocContext, int> count;

        public FakeSource(DocKind kind, Func<DocContext, int> count)
        {
            Kind = kind;
            this.count = count;
        }

        public DocKind Kind { get; }

        public List<(IBitDb Db, DocContext Ctx)> Calls { get; } = new List<(IBitDb Db, DocContext Ctx)>();

        public IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx)
        {
            Calls.Add((db, ctx));
            return Enumerable.Range(1, count(ctx))
                .Select(n => new DocPage(new[] { DocOp.Text(10, 10, 100, 8, Kind + " " + n, 10) }))
                .ToArray();
        }
    }

    private static VisitDay Day(int d, bool rx = false) => new VisitDay(new DateTime(2026, 11, d), false, rx, new[] { "V" + d });

    private static DocContext Context(params VisitDay[] days) => new DocContext(
        "90001",
        new PatientHit("90001", "가상환자01", "19800302", "F", "20261120"),
        days,
        new DateTime(2026, 11, 1),
        new DateTime(2026, 11, 20),
        HospitalInfo.Empty,
        (text, pt) => text.Length * pt * 0.2f,
        new DateTime(2026, 11, 20));

    private static string[] Texts(DocPlan plan) => plan.Pages.Select(p => p.Ops.Single().Value).ToArray();

    // ── AC-7404.1 묶음 단추 ─────────────────────────────

    [Fact(DisplayName = "AC-7404.1 묶음을 누르면 4개 체크가 그 묶음 서류만 켜진 상태가 된다")]
    public void BundleSetsExactlyItsKinds()
    {
        var picks = new DocPicks();
        Assert.Empty(picks.Kinds);

        picks.Apply(new DocBundle("실손보험용", new[] { DocKind.Receipt, DocKind.Detail }));
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Detail }, picks.Kinds);
        Assert.True(picks.IsOn(DocKind.Receipt));
        Assert.False(picks.IsOn(DocKind.RxCopy));

        picks.Toggle(DocKind.RxCopy);
        picks.Toggle(DocKind.Receipt);
        Assert.Equal(new[] { DocKind.Detail, DocKind.RxCopy }, picks.Kinds);

        picks.Apply(new DocBundle("기록부", new[] { DocKind.Chart }));
        Assert.Equal(new[] { DocKind.Chart }, picks.Kinds);
        Assert.False(picks.IsOn(DocKind.Detail));
    }

    [Fact(DisplayName = "AC-7404.1 그 뒤 하나씩 켜고 끄며, 차례는 늘 서류 차례(누른 차례 아님)")]
    public void ToggleKeepsPrintOrder()
    {
        var picks = new DocPicks();
        picks.Toggle(DocKind.Chart);
        picks.Toggle(DocKind.Receipt);
        picks.Toggle(DocKind.RxCopy);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.RxCopy, DocKind.Chart }, picks.Kinds);
        picks.Toggle(DocKind.RxCopy);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Chart }, picks.Kinds);
        picks.Toggle((DocKind)42);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Chart }, picks.Kinds);
        picks.Apply(null!);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Chart }, picks.Kinds);
    }

    // ── AC-7404.2 장 수·인쇄 차례 ─────────────────────────────

    [Fact(DisplayName = "AC-7404.2 고른 서류만 그려 서류 차례(영수증 → 세부내역서 → 처방전 → 진료기록부)로 잇고, 서류 안은 서류가 준 쪽 차례 그대로")]
    public void PlanOrderAndCounts()
    {
        var receipt = new FakeSource(DocKind.Receipt, ctx => ctx.Days.Count);
        var detail = new FakeSource(DocKind.Detail, _ => 2);
        var rx = new FakeSource(DocKind.RxCopy, ctx => ctx.Days.Count(d => d.HasRx));
        var chart = new FakeSource(DocKind.Chart, _ => 5);
        var db = new FakeDb();
        var ctx = Context(Day(10, rx: true), Day(3), Day(5, rx: true));

        var plan = DocPlan.Build(new IDocSource[] { chart, rx, detail, receipt }, db, ctx, new[] { DocKind.RxCopy, DocKind.Receipt, DocKind.Chart });

        Assert.Equal(new[] { "Receipt 1", "Receipt 2", "Receipt 3", "RxCopy 1", "RxCopy 2", "Chart 1", "Chart 2", "Chart 3", "Chart 4", "Chart 5" }, Texts(plan));
        Assert.Equal(new[] { DocKind.Receipt, DocKind.RxCopy, DocKind.Chart }, plan.Kinds);
        Assert.Equal(3, plan.CountOf(DocKind.Receipt));
        Assert.Equal(0, plan.CountOf(DocKind.Detail));
        Assert.Equal(2, plan.CountOf(DocKind.RxCopy));
        Assert.Equal(5, plan.CountOf(DocKind.Chart));
        Assert.Equal(10, plan.Total);
        Assert.True(plan.CanPrint);

        Assert.Empty(detail.Calls);
        foreach (var source in new[] { receipt, rx, chart })
        {
            var call = Assert.Single(source.Calls);
            Assert.Same(db, call.Db);
            Assert.Same(ctx, call.Ctx);
        }
        Assert.Equal(new[] { new DateTime(2026, 11, 3), new DateTime(2026, 11, 5), new DateTime(2026, 11, 10) }, ctx.Days.Select(d => d.Date).ToArray());
    }

    [Fact(DisplayName = "AC-7404.2 [인쇄]는 날짜 1개·서류 1개 이상이고 모두 N>0장일 때만")]
    public void CanPrintOnlyWithPages()
    {
        var receipt = new FakeSource(DocKind.Receipt, ctx => ctx.Days.Count);
        var rx = new FakeSource(DocKind.RxCopy, ctx => ctx.Days.Count(d => d.HasRx));
        var sources = new IDocSource[] { receipt, rx };
        var db = new FakeDb();

        var noDays = DocPlan.Build(sources, db, Context(), new[] { DocKind.Receipt });
        Assert.Equal(0, noDays.Total);
        Assert.False(noDays.CanPrint);
        Assert.Empty(receipt.Calls);

        var noKinds = DocPlan.Build(sources, db, Context(Day(3)), Array.Empty<DocKind>());
        Assert.Equal(0, noKinds.Total);
        Assert.False(noKinds.CanPrint);
        Assert.False(DocPlan.Build(sources, db, Context(Day(3)), null!).CanPrint);

        var noRx = DocPlan.Build(sources, db, Context(Day(3), Day(4)), new[] { DocKind.RxCopy });
        Assert.Equal(0, noRx.Total);
        Assert.False(noRx.CanPrint);

        var noSource = DocPlan.Build(sources, db, Context(Day(3)), new[] { DocKind.Chart });
        Assert.Equal(0, noSource.CountOf(DocKind.Chart));
        Assert.False(noSource.CanPrint);

        var one = DocPlan.Build(sources, db, Context(Day(3)), new[] { DocKind.Receipt, DocKind.Receipt });
        Assert.Equal(1, one.Total);
        Assert.True(one.CanPrint);
    }

    [Fact(DisplayName = "AC-7404.2 같은 종류 서류가 둘이면 앞의 것만 쓰고, 서류 읽기 실패는 그대로 올린다")]
    public void FirstSourceWinsAndFailuresSurface()
    {
        var first = new FakeSource(DocKind.Detail, _ => 1);
        var second = new FakeSource(DocKind.Detail, _ => 4);
        var plan = DocPlan.Build(new IDocSource[] { first, second }, new FakeDb(), Context(Day(3)), new[] { DocKind.Detail });
        Assert.Equal(1, plan.Total);
        Assert.Empty(second.Calls);

        var failing = new FakeSource(DocKind.Receipt, _ => throw new BitException(BitErrors.ReadFailed));
        Assert.Throws<BitException>(() => DocPlan.Build(new IDocSource[] { failing }, new FakeDb(), Context(Day(3)), new[] { DocKind.Receipt }));
        Assert.Throws<ArgumentNullException>(() => DocPlan.Build(null!, new FakeDb(), Context(Day(3)), new[] { DocKind.Receipt }));
        Assert.Throws<ArgumentNullException>(() => DocPlan.Build(new IDocSource[] { first }, new FakeDb(), null!, new[] { DocKind.Receipt }));
    }

    [Fact(DisplayName = "AC-7404.2 쪽 = A4(210×297mm) 위 그리기 글(mm): 글·선·네모·그림(그림은 쪽에 든 key로 찾음)")]
    public void PageOps()
    {
        Assert.Equal(210f, DocPage.WidthMm);
        Assert.Equal(297f, DocPage.HeightMm);

        var text = DocOp.Text(12.5f, 20, 60, 6, "진료비 영수증", 14, bold: true, align: DocAlign.Center);
        Assert.Equal(DocOpKind.Text, text.Kind);
        Assert.Equal((12.5f, 20f, 60f, 6f), (text.X, text.Y, text.Width, text.Height));
        Assert.Equal(72.5f, text.X2);
        Assert.Equal(26f, text.Y2);
        Assert.Equal("진료비 영수증", text.Value);
        Assert.Equal(14f, text.Pt);
        Assert.True(text.Bold);
        Assert.Equal(DocAlign.Center, text.Align);

        var plain = DocOp.Text(0, 0, 10, 5, null!, 9);
        Assert.Equal("", plain.Value);
        Assert.False(plain.Bold);
        Assert.Equal(DocAlign.Left, plain.Align);

        var line = DocOp.Line(10, 30, 200, 30, 0.2f);
        Assert.Equal(DocOpKind.Line, line.Kind);
        Assert.Equal((10f, 30f, 200f, 30f, 0.2f), (line.X, line.Y, line.X2, line.Y2, line.StrokeMm));

        var box = DocOp.Box(10, 40, 190, 50, 0.3f);
        Assert.Equal(DocOpKind.Box, box.Kind);
        Assert.Equal((200f, 90f, 0.3f), (box.X2, box.Y2, box.StrokeMm));

        var seal = new byte[] { 1, 2, 3 };
        var image = DocOp.Image(170, 250, 20, 20, DocContext.SealKey);
        Assert.Equal(DocOpKind.Image, image.Kind);
        Assert.Equal(DocContext.SealKey, image.Key);

        var page = new DocPage(new[] { text, line, box, image }, new Dictionary<string, byte[]> { [DocContext.SealKey] = seal });
        Assert.Equal(4, page.Ops.Count);
        Assert.Same(seal, page.ImageOf(DocContext.SealKey));
        Assert.Null(page.ImageOf("doctor"));
        Assert.Null(new DocPage(new[] { image }).ImageOf(DocContext.SealKey));
        Assert.Empty(new DocPage(null!).Ops);
    }
}
