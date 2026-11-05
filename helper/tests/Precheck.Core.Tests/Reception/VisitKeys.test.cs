using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Keys 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Keys;

/// <summary>
/// 화면용 열쇠(VisitKeys, design.md 4절).
/// AC-1402.9 줄마다 그날 무작위 16자리 16진수 열쇠. 내원번호·차트번호를 드러내지 않고, 같은 내원은 그날 같은 열쇠, 날이 바뀌면 새 열쇠.
/// AC-1403.6 날이 바뀌면 열쇠·내원 연결표를 새로 만든다(앞 날 열쇠로는 아무 내원도 찾지 못한다).
/// 내원번호는 가짜(V+숫자)만 쓴다.
/// </summary>
public class VisitKeysTests
{
    private const string Day1 = "20261105";
    private const string Day2 = "20261106";
    private static readonly Regex Shape = new Regex("^[0-9a-f]{16}$");

    /// <summary>찾은 내원을 (날짜, 내원번호)로 견주기 쉽게 바꾼다.</summary>
    private static (string Day, string VisitId)? Pair(VisitRef? found) => found == null ? null : (found.Day, found.VisitId);

    // ---- AC-1402.9 열쇠 모양·같은 내원 같은 열쇠 -------------------------------------------------------

    [Fact(DisplayName = "AC-1402.9 열쇠는 16자리 소문자 16진수다")]
    public void KeyIsSixteenLowerHex()
    {
        var keys = new VisitKeys();
        foreach (var visit in new[] { "V1", "V20261105001", "V999999" })
            Assert.Matches(Shape, keys.KeyOf(Day1, visit));
    }

    [Fact(DisplayName = "AC-1402.9 같은 내원은 그날 몇 번 물어도 같은 열쇠다")]
    public void SameVisitSameDaySameKey()
    {
        var keys = new VisitKeys();
        var first = keys.KeyOf(Day1, "V101");
        keys.KeyOf(Day1, "V102");
        Assert.Equal(first, keys.KeyOf(Day1, "V101"));
        Assert.Equal(first, keys.KeyOf(Day1, "V101"));
    }

    [Fact(DisplayName = "AC-1402.9 다른 내원은 다른 열쇠다(2000개가 모두 다르다)")]
    public void DifferentVisitsDifferentKeys()
    {
        var keys = new VisitKeys();
        var all = Enumerable.Range(1, 2000).Select(i => keys.KeyOf(Day1, "V" + i)).ToArray();
        Assert.Equal(all.Length, all.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact(DisplayName = "AC-1402.9 열쇠는 무작위다: 같은 날 같은 내원이어도 다른 열쇠표에서는 다른 열쇠다")]
    public void KeyIsRandomNotDerived()
    {
        var a = new VisitKeys();
        var b = new VisitKeys();
        foreach (var visit in new[] { "V101", "V102", "V103" })
            Assert.NotEqual(a.KeyOf(Day1, visit), b.KeyOf(Day1, visit));
    }

    [Fact(DisplayName = "AC-1402.9 열쇠는 내원번호를 드러내지 않는다: 이어진 내원번호여도 열쇠 자리마다 글자가 고루 바뀐다")]
    public void KeyDoesNotRevealVisitNumber()
    {
        var keys = new VisitKeys();
        var visits = Enumerable.Range(0, 400).Select(i => "V9" + (20261105000 + i)).ToArray();
        var all = visits.Select(visit => keys.KeyOf(Day1, visit)).ToArray();
        for (var i = 0; i < visits.Length; i++)
        {
            var digits = visits[i].Substring(1);
            Assert.DoesNotContain(digits.Substring(digits.Length - 6), all[i]);
            Assert.DoesNotContain(visits[i], all[i]);
        }
        // 차례 번호·내원번호에서 만든 열쇠라면 앞자리가 늘 같다. 무작위면 자리마다 16글자가 거의 다 나온다
        for (var pos = 0; pos < 16; pos++)
            Assert.True(all.Select(key => key[pos]).Distinct().Count() >= 12, $"{pos}번째 자리 글자가 고르지 않다");
    }

    [Fact(DisplayName = "AC-1402.9 열쇠로 그날 내원을 찾는다(날짜·내원번호)")]
    public void FindReturnsVisit()
    {
        var keys = new VisitKeys();
        var k1 = keys.KeyOf(Day1, "V101");
        var k2 = keys.KeyOf(Day1, "V102");
        Assert.Equal((Day1, "V101"), Pair(keys.Find(Day1, k1)));
        Assert.Equal((Day1, "V102"), Pair(keys.Find(Day1, k2)));
    }

    [Theory(DisplayName = "AC-1402.9 열쇠표에 없는 열쇠·모양이 틀린 열쇠는 아무 내원도 찾지 못한다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0123456789abcdef")]
    [InlineData("0123456789abcde")]
    [InlineData("0123456789abcdef0")]
    [InlineData("0123456789ABCDEF")]
    [InlineData("0123456789abcdeg")]
    [InlineData("V101")]
    public void FindRejectsUnknownOrBadKey(string? key)
    {
        var keys = new VisitKeys();
        keys.KeyOf(Day1, "V101");
        Assert.Null(keys.Find(Day1, key));
    }

    [Fact(DisplayName = "AC-1402.9 대문자로 바꾼 진짜 열쇠·앞뒤 공백 붙은 열쇠도 찾지 못한다")]
    public void FindIsExactShape()
    {
        var keys = new VisitKeys();
        var key = keys.KeyOf(Day1, "V101");
        Assert.Null(keys.Find(Day1, key.ToUpperInvariant() == key ? key + "0" : key.ToUpperInvariant()));
        Assert.Null(keys.Find(Day1, " " + key));
        Assert.Null(keys.Find(Day1, key + "\n"));
    }

    [Fact(DisplayName = "AC-1402.9 날이 바뀌면 같은 내원도 새 열쇠다")]
    public void NewDayNewKey()
    {
        var keys = new VisitKeys();
        var before = keys.KeyOf(Day1, "V101");
        var after = keys.KeyOf(Day2, "V101");
        Assert.Matches(Shape, after);
        Assert.NotEqual(before, after);
        Assert.Equal(after, keys.KeyOf(Day2, "V101"));
    }

    [Fact(DisplayName = "AC-1402.9 내원번호가 비었거나 null이면 열쇠를 만들지 않는다")]
    public void KeyOfRejectsEmptyVisit()
    {
        var keys = new VisitKeys();
        Assert.ThrowsAny<ArgumentException>(() => keys.KeyOf(Day1, ""));
        Assert.ThrowsAny<ArgumentException>(() => keys.KeyOf(Day1, null!));
        Assert.ThrowsAny<ArgumentException>(() => keys.KeyOf(null!, "V101"));
    }

    [Fact(DisplayName = "AC-1402.9 여러 작업이 한꺼번에 물어도 같은 내원은 한 열쇠, 다른 내원은 다른 열쇠다")]
    public void ConcurrentCallsAgree()
    {
        var keys = new VisitKeys();
        var seen = new ConcurrentBag<(string Visit, string Key)>();
        Parallel.For(0, 4000, i =>
        {
            var visit = "V" + (i % 200);
            seen.Add((visit, keys.KeyOf(Day1, visit)));
        });
        var byVisit = seen.GroupBy(s => s.Visit).ToDictionary(g => g.Key, g => g.Select(s => s.Key).Distinct().ToArray());
        Assert.Equal(200, byVisit.Count);
        Assert.All(byVisit.Values, ks => Assert.Single(ks));
        Assert.Equal(200, byVisit.Values.Select(ks => ks[0]).Distinct().Count());
        foreach (var pair in byVisit) Assert.Equal((Day1, pair.Key), Pair(keys.Find(Day1, pair.Value[0])));
    }

    // ---- AC-1403.6 날이 바뀌면 열쇠·연결표를 새로 -------------------------------------------------------

    [Fact(DisplayName = "AC-1403.6 날이 바뀌면 앞 날 열쇠로는 새 날에도 앞 날에도 아무 내원도 찾지 못한다")]
    public void NewDayDropsOldTable()
    {
        var keys = new VisitKeys();
        var old1 = keys.KeyOf(Day1, "V101");
        var old2 = keys.KeyOf(Day1, "V102");
        keys.KeyOf(Day2, "V201");
        foreach (var old in new[] { old1, old2 })
        {
            Assert.Null(keys.Find(Day2, old));
            Assert.Null(keys.Find(Day1, old));
        }
    }

    [Fact(DisplayName = "AC-1403.6 새 날 열쇠표에는 새 날 내원만 있다")]
    public void NewDayTableHasOnlyNewVisits()
    {
        var keys = new VisitKeys();
        keys.KeyOf(Day1, "V101");
        var fresh = keys.KeyOf(Day2, "V201");
        Assert.Equal((Day2, "V201"), Pair(keys.Find(Day2, fresh)));
        Assert.Null(keys.Find(Day1, fresh));
    }

    [Fact(DisplayName = "AC-1403.6 아직 열쇠를 만들지 않은 날을 물으면 지금 날 열쇠로도 찾지 못하고 지금 열쇠표는 그대로다")]
    public void FindOtherDayDoesNotMatch()
    {
        var keys = new VisitKeys();
        var key = keys.KeyOf(Day1, "V101");
        Assert.Null(keys.Find(Day2, key));
        Assert.Equal((Day1, "V101"), Pair(keys.Find(Day1, key)));
        Assert.Equal(key, keys.KeyOf(Day1, "V101"));
    }

    [Fact(DisplayName = "AC-1403.6 처음 만든 열쇠표는 비어 있어 어떤 열쇠도 찾지 못한다")]
    public void EmptyTableFindsNothing()
    {
        var keys = new VisitKeys();
        Assert.Null(keys.Find(Day1, "0123456789abcdef"));
    }

    // ---- 겉모양 --------------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.9 VisitKeys는 KeyOf·Find만 열고 열쇠표 자체를 꺼내는 길이 없다")]
    public void PublicSurfaceIsSmall()
    {
        var names = typeof(VisitKeys).GetMembers(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(m => m.MemberType != MemberTypes.Constructor)
            .Select(m => m.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "Find", "KeyOf" }, names);
    }
}
