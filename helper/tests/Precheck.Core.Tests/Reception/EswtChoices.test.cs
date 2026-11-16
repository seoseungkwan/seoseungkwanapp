using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 EswtHits 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.EswtHits;

/// <summary>
/// 충격파 타수·부위 수(spec reception-memo-papers design.md 2절, REQ-3402).
/// AC-3402.1 충격파 고르기 목록은 "1부위"~"4부위" 넷과 "{타수} {N부위}" 열여섯(2000타·3000타·4000타·6000타)이고, 다른 글은 쓰기에서 400이다.
/// 목록은 이제 고칠 수 있는 고르기 목록(PickLists)의 기본값이다(spec reception-arrange-tune AC-3603.1·AC-3603.3).
/// </summary>
public class EswtChoicesTests : IDisposable
{
    private const string Now = "10:30";
    private static readonly string[] Hits = { "2000타", "3000타", "4000타", "6000타" };
    private static readonly string[] Counts = { "1부위", "2부위", "3부위", "4부위" };

    private readonly string dir;

    public EswtChoicesTests()
    {
        dir = Path.Combine(Path.GetTempPath(), "precheck-eswt-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(dir, true);
        }
        catch (IOException)
        {
        }
    }

    private static ArrangeOp Op(string op, ArrangeCol? col = null, string? v = null) => new ArrangeOp("0123456789abcdef", op, col, v);

    private static readonly IReadOnlyDictionary<ArrangeCol, ArrangeCell> NoCells = new Dictionary<ArrangeCol, ArrangeCell>();

    private readonly XorProtector protector = new XorProtector();

    private ArrangeMarks Open() =>
        new ArrangeMarks(new StoreFolder(dir), protector, () => new DateTime(2026, 11, 11, 10, 30, 0), _ => { });

    [Fact(DisplayName = "AC-3402.1 충격파 목록은 1부위~4부위 넷 뒤에 타수(2000·3000·4000·6000타)마다 1~4부위 열여섯이다")]
    public void EswtList()
    {
        var expected = Counts.Concat(Hits.SelectMany(hit => Counts.Select(count => hit + " " + count))).ToArray();

        Assert.Equal(20, expected.Length);
        Assert.Equal(expected, ArrangeChoices.AddOf(ArrangeCol.Eswt, PickLists.Defaults));
        Assert.All(expected, det => Assert.True(ArrangeChoices.IsDetail(ArrangeCol.Eswt, det), det));
        Assert.Contains("3000타 2부위", ArrangeChoices.AddOf(ArrangeCol.Eswt, PickLists.Defaults));
    }

    [Theory(DisplayName = "AC-3402.1 add: 충격파 칸에 타수 있는 글도 타수 없는 글도 그대로 det로 넣는다")]
    [InlineData("2부위")]
    [InlineData("3000타 2부위")]
    [InlineData("6000타 4부위")]
    [InlineData("2000타 1부위")]
    public void AddsHits(string v)
    {
        var result = ArrangeWrite.Apply(Op("add", ArrangeCol.Eswt, v), null, NoCells, Now);

        Assert.Equal(204, result.Status);
        var cell = result.Next!.Cells[ArrangeCol.Eswt];
        Assert.Equal((ArrangeStep.Todo, true, v, (string?)null, "10:30"), (cell.St, cell.Manual, cell.Det, cell.Part, cell.AddedAt));
    }

    [Theory(DisplayName = "AC-3402.1 add: 목록 밖 글(타수만·없는 타수·5부위·순서 바뀜·빈칸 둘·붙여 씀·다른 칸 글)은 400")]
    [InlineData("3000타")]
    [InlineData("5000타 2부위")]
    [InlineData("3000타 5부위")]
    [InlineData("2부위 3000타")]
    [InlineData("3000타  2부위")]
    [InlineData("3000타2부위")]
    [InlineData(" 2부위")]
    [InlineData("HP")]
    public void RefusesOtherText(string v)
    {
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Eswt, v), null, NoCells, Now).Status);
    }

    [Fact(DisplayName = "AC-3402.1 타수 글은 충격파 칸에만 받는다(PT·도수 칸에는 400)")]
    public void HitsOnlyForEswt()
    {
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Pt, "3000타 2부위"), null, NoCells, Now).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeCol.Ds, "3000타 2부위"), null, NoCells, Now).Status);
    }

    [Fact(DisplayName = "AC-3402.1 표시 파일은 타수 있는 충격파 글과 옛 N부위 글을 모두 그대로 읽는다")]
    public void MarksKeepHits()
    {
        var marks = Open();
        marks.Update("V1", _ => new VisitMark().WithCell(ArrangeCol.Eswt, new CellMark(ArrangeStep.Done, true, "4000타 3부위", null, null, "10:40", "10:00")));
        marks.Update("V2", _ => new VisitMark().WithCell(ArrangeCol.Eswt, new CellMark(ArrangeStep.Todo, true, "2부위", null, null, null, "10:05")));

        var today = Open().Today();

        Assert.Equal("4000타 3부위", today["V1"].Cells[ArrangeCol.Eswt].Det);
        Assert.Equal("2부위", today["V2"].Cells[ArrangeCol.Eswt].Det);
    }
}
