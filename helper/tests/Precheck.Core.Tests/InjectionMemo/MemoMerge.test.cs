using Precheck.Core.InjectionMemo;
using Precheck.Core.Tests.Bit;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>spec injection-memo AC-7503.1 메모 칸 글과 합치기(MemoMerge)와 서비스의 '이미 있음'. 메모 글은 지어낸 것이다.</summary>
public class MemoMergeTests
{
    [Fact(DisplayName = "AC-7503.1 칸이 비었으면 새 글 그대로")]
    public void EmptyFieldTakesNewText()
    {
        Assert.Equal(("오)무릎 3차", false), MemoMerge.Merge("", "오)무릎 3차"));
        Assert.Equal(("오)무릎 3차", false), MemoMerge.Merge(null, "오)무릎 3차"));
    }

    [Fact(DisplayName = "AC-7503.1 칸에 글이 있으면 '있던 글/새 글'(끝이 이미 '/'면 하나만), 칸 끝에 치는 글이 되도록 있던 글은 건드리지 않음")]
    public void AppendsWithSlash()
    {
        Assert.Equal(("물리치료만/오)무릎 3차", false), MemoMerge.Merge("물리치료만", "오)무릎 3차"));
        Assert.Equal(("물리치료만/오)무릎 3차", false), MemoMerge.Merge("물리치료만/", "오)무릎 3차"));
        Assert.Equal(("물리치료만 /오)무릎 3차", false), MemoMerge.Merge("물리치료만 ", "오)무릎 3차"));
        // ESWT·도수 차수는 주사 차수가 아니므로 붙인다
        Assert.Equal(("ESWT 3차/오)무릎 3차", false), MemoMerge.Merge("ESWT 3차", "오)무릎 3차"));
        Assert.Equal(("도수 2차/물리/오)무릎 3차", false), MemoMerge.Merge("도수 2차/물리", "오)무릎 3차"));
        Assert.Equal(("차트 확인/오)무릎 3차", false), MemoMerge.Merge("차트 확인", "오)무릎 3차"));
    }

    [Fact(DisplayName = "AC-7503.1 이미 주사 'N차'가 있으면 안 넣고 이미 있음(Skipped, 칸 글 그대로)")]
    public void SkipsWhenCountExists()
    {
        Assert.Equal(("오)무릎 2차", true), MemoMerge.Merge("오)무릎 2차", "오)무릎 3차"));
        Assert.Equal(("물리치료만/양)아라간 2차 주사", true), MemoMerge.Merge("물리치료만/양)아라간 2차 주사", "오)무릎 3차"));
        Assert.Equal(("목 2 차", true), MemoMerge.Merge("목 2 차", "목 3차"));
        Assert.True(MemoMerge.HasInjectionCount("왼)어깨,목 4차/오심"));
        Assert.False(MemoMerge.HasInjectionCount("ESWT 3차/도수 1차"));
        Assert.False(MemoMerge.HasInjectionCount(null));
    }

    [Fact(DisplayName = "AC-7503.1 서비스: 칸 글에 주사 차수가 있으면 이미 있음, 글이 있으면 칸 끝에 '/새 글'을 친다")]
    public void ServiceMerges()
    {
        // 영상(REQ-7506)은 빈 답 · 최근 무릎 사진: 경과가 없어 주사 차수만 본다
        var empty = new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => new object?[][] { }).Answer(InjectionSql.LinesSql, _ => new object?[][] { })
            .Answer(InjectionSql.LastBeforeSql, _ => new object?[][] { }).Answer(InjectionSql.XraySql, _ => new object?[][] { });
        Assert.Equal(MemoResultKind.AlreadyHas, InjectionMemoService.Compute(empty, Chart, "오)무릎 2차", Today).Kind);

        var db = new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => new[] { new object?[] { "V1", "202611131000", "" } })
            .Answer(InjectionSql.LinesSql, _ => new[] { new object?[] { "V1", 1, "오른쪽 무릎 2차 주사 시행" } })
            .Answer(InjectionSql.XraySql, _ => new[] { new object?[] { "G72", "202611010900" } });
        var result = InjectionMemoService.Compute(db, Chart, "물리치료만", Today);
        Assert.Equal(MemoResultKind.Insert, result.Kind);
        Assert.Equal("오)무릎 3차", result.Text);
        Assert.Equal("/오)무릎 3차", result.Append);
        Assert.Equal("물리치료만" + result.Append, MemoMerge.Merge("물리치료만", result.Text).Text);

        var eswt = InjectionMemoService.Compute(db, Chart, "ESWT 3차", Today);
        Assert.Equal("/오)무릎 3차", eswt.Append);
    }
}
