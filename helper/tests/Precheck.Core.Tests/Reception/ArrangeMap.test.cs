using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Protocol;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeMapping 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeMapping;

/// <summary>
/// 처방 → 어레인지 칸 지도 한 곳(ArrangeMap, spec reception-arrange design.md 2절, REQ-3301).
/// AC-3301.1 규칙·직접 칸·확인 안 된 칸·부위 칸이 ArrangeMap.cs 한 곳에만 있다.
/// AC-3301.2 확인 전 지도는 SONO1 → sono, CARM1 → carm뿐이고 X-RAY는 Unconfirmed, 어떤 코드도 직접 칸에 들지 않는다.
/// AC-3301.4 Validate: 한 규칙 두 칸 금지, Unconfirmed 칸·직접 칸에 규칙 금지.
/// 확인 뒤에 쓸 규칙 모양(X-ray ^G\d{4}$ 등)은 가짜 지도로만 증명한다.
/// </summary>
public class ArrangeMapTests
{
    private static readonly ArrangeCol[] NoCols = new ArrangeCol[0];

    /// <summary>시험용 가짜 지도(확인 뒤 모양): X-ray는 G 네 자리, SONO·C-ARM은 코드, 이름에 '초음파'가 들면 SONO.</summary>
    private static ArrangeRule[] FakeRules() => new[]
    {
        ArrangeRule.CodePattern(@"^G\d{4}$", ArrangeCol.Xray),
        ArrangeRule.Code("SONO1", ArrangeCol.Sono),
        ArrangeRule.Code("CARM1", ArrangeCol.Carm),
        ArrangeRule.CodeContains("CARM", ArrangeCol.Carm),
        ArrangeRule.NameContains("초음파", ArrangeCol.Sono),
    };

    // ---- AC-3301.1 한 곳 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3301.1 칸은 xray·sono·carm·pt·ds·eswt·trac 일곱이고 JSON 이름은 소문자 그대로다")]
    public void ColumnsAndKeys()
    {
        Assert.Equal(new[] { "Xray", "Sono", "Carm", "Pt", "Ds", "Eswt", "Trac" }, Enum.GetNames(typeof(ArrangeCol)));
        Assert.Equal(
            new[] { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" },
            Enum.GetValues(typeof(ArrangeCol)).Cast<ArrangeCol>().Select(ArrangeMap.KeyOf));
    }

    [Fact(DisplayName = "AC-3301.1 직접 칸(ManualOnly)은 pt·ds·eswt·trac, 확인 안 된 칸(Unconfirmed)은 xray, 부위 칸(PartColumn)은 아직 모름(null)")]
    public void ListsBeforeCheck()
    {
        Assert.Equal(new[] { ArrangeCol.Pt, ArrangeCol.Ds, ArrangeCol.Eswt, ArrangeCol.Trac }, ArrangeMap.ManualOnly.OrderBy(c => c));
        Assert.Equal(new[] { ArrangeCol.Xray }, ArrangeMap.Unconfirmed.OrderBy(c => c));
        Assert.Null(ArrangeMap.PartColumn);
    }

    [Fact(DisplayName = "AC-3301.1 ArrangeCol·ArrangeRule·ArrangeMap과 처방 코드 SONO1·CARM1 글은 접수 현황 코드에서 ArrangeMap.cs 한 곳에만 있다")]
    public void OnlyOnePlace()
    {
        var src = Repo.PathOf("helper", "src");
        var expected = Path.Combine("Precheck.Core", "Reception", "ArrangeMap.cs");
        // 통계 도구(Precheck.Core/Stats)는 따로 쓰는 문장이라 접수 현황 쪽(Reception 폴더·Precheck.Reception)만 본다
        var roots = new[] { Path.Combine(src, "Precheck.Core", "Reception"), Path.Combine(src, "Precheck.Reception") }.Where(Directory.Exists);
        string[] HitsOf(Regex pattern) => roots
            .SelectMany(root => Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories))
            .Where(file => pattern.IsMatch(File.ReadAllText(file)))
            .Select(file => file.Substring(src.Length + 1))
            .ToArray();

        foreach (var pattern in new[]
        {
            new Regex(@"\benum\s+ArrangeCol\b"), new Regex(@"\bclass\s+ArrangeRule\b"), new Regex(@"\bclass\s+ArrangeMap\b"),
            new Regex(@"""SONO1""", RegexOptions.IgnoreCase), new Regex(@"""CARM1""", RegexOptions.IgnoreCase),
        })
        {
            var hits = HitsOf(pattern);
            Assert.True(hits.Length == 1 && hits[0] == expected, $"{pattern}: {string.Join(", ", hits)}");
        }
    }

    // ---- AC-3301.2 확인 전 지도 -------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3301.2 확인 전 지도로 나누면 SONO1은 sono, CARM1은 carm(앞뒤 공백·소문자도)")]
    [InlineData("SONO1", ArrangeCol.Sono)]
    [InlineData(" sono1 ", ArrangeCol.Sono)]
    [InlineData("CARM1", ArrangeCol.Carm)]
    [InlineData("carm1  ", ArrangeCol.Carm)]
    public void KnownCodes(string code, ArrangeCol col)
    {
        Assert.Equal(col, ArrangeMap.Match(code, null));
        Assert.Equal(col, ArrangeMap.Match(ArrangeMap.Rules, code, "아무 이름"));
    }

    [Theory(DisplayName = "AC-3301.2 확인 전 지도는 그 밖의 코드를 어느 칸에도 넣지 않는다(X-RAY 코드 후보·PT·도수·충격파·견인 코드도)")]
    [InlineData("G1234", "흉부 X-ray")]
    [InlineData("XRAY", null)]
    [InlineData("SONO2", "초음파")]
    [InlineData("CARM", null)]
    [InlineData("CRYO", null)]
    [InlineData("ESWT1", "체외충격파")]
    [InlineData("도수", "도수치료 30분")]
    [InlineData("PT1", "핫팩")]
    [InlineData("", null)]
    public void OtherCodesGoNowhere(string code, string? name)
    {
        Assert.Null(ArrangeMap.Match(code, name));
    }

    [Fact(DisplayName = "AC-3301.2 확인 전 지도의 규칙은 SONO1 → sono, CARM1 → carm 둘뿐이고 어느 규칙도 xray·직접 칸을 가리키지 않는다")]
    public void RulesBeforeCheck()
    {
        Assert.Equal(new[] { ArrangeCol.Sono, ArrangeCol.Carm }, ArrangeMap.Rules.Select(rule => rule.Col));
        Assert.DoesNotContain(ArrangeMap.Rules, rule => rule.Col == ArrangeCol.Xray || ArrangeMap.ManualOnly.Contains(rule.Col));
    }

    [Theory(DisplayName = "AC-3301.2 가짜 지도(확인 뒤 모양)로 나누면 G 네 자리는 xray, 이름 규칙·코드 포함 규칙도 맞고, 처음 맞는 규칙 하나만 쓴다")]
    [InlineData("G1234", null, ArrangeCol.Xray)]
    [InlineData(" g0001", null, ArrangeCol.Xray)]
    [InlineData("SONO1", null, ArrangeCol.Sono)]
    [InlineData("CARM2", null, ArrangeCol.Carm)]
    [InlineData("US1", "어깨 초음파", ArrangeCol.Sono)]
    public void FakeMapMatches(string code, string? name, ArrangeCol col)
    {
        Assert.Equal(col, ArrangeMap.Match(FakeRules(), code, name));
    }

    [Theory(DisplayName = "AC-3301.2 가짜 지도도 맞지 않는 코드(G 다섯 자리·이름 없음)는 어느 칸에도 넣지 않는다")]
    [InlineData("G12345", null)]
    [InlineData("XG1234", null)]
    [InlineData("US1", null)]
    [InlineData("US1", "물리치료")]
    public void FakeMapMisses(string code, string? name)
    {
        Assert.Null(ArrangeMap.Match(FakeRules(), code, name));
    }

    [Fact(DisplayName = "AC-3301.2 지도에 직접 칸(pt·ds·eswt·trac)을 가리키는 규칙이 있어도 Match는 그 칸을 주지 않는다")]
    public void ManualColumnsNeverMatched()
    {
        var rules = new[]
        {
            ArrangeRule.Code("PT1", ArrangeCol.Pt), ArrangeRule.NameContains("도수", ArrangeCol.Ds),
            ArrangeRule.CodeContains("ESWT", ArrangeCol.Eswt), ArrangeRule.CodePattern(@"^TR\d$", ArrangeCol.Trac),
            ArrangeRule.Code("PT1", ArrangeCol.Sono),
        };
        Assert.Null(ArrangeMap.Match(rules, "ESWT1", null));
        Assert.Null(ArrangeMap.Match(rules, "X1", "도수치료"));
        Assert.Null(ArrangeMap.Match(rules, "TR1", null));
        // 직접 칸 규칙은 건너뛰고 다음 규칙을 본다
        Assert.Equal(ArrangeCol.Sono, ArrangeMap.Match(rules, "PT1", null));
    }

    [Fact(DisplayName = "AC-3301.2 틀린 정규식 규칙은 만들 때 멈춘다")]
    public void BadPatternThrows()
    {
        Assert.ThrowsAny<ArgumentException>(() => ArrangeRule.CodePattern("([", ArrangeCol.Xray));
    }

    // ---- AC-3301.4 Validate ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3301.4 지금 지도는 Validate(Rules, Unconfirmed)로 문제가 없다")]
    public void CurrentMapHasNoProblems()
    {
        Assert.Empty(ArrangeMap.Validate(ArrangeMap.Rules, ArrangeMap.Unconfirmed));
    }

    [Fact(DisplayName = "AC-3301.4 가짜 지도(확인 뒤 모양, Unconfirmed 없음)도 문제가 없다")]
    public void FakeMapHasNoProblems()
    {
        Assert.Empty(ArrangeMap.Validate(FakeRules(), NoCols));
    }

    [Fact(DisplayName = "AC-3301.4 한 규칙(같은 종류·같은 글, 대소문자·앞뒤 공백만 다름)이 두 칸에 들면 알린다")]
    public void SameRuleTwoColumns()
    {
        var rules = new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono), ArrangeRule.Code("CARM1", ArrangeCol.Carm), ArrangeRule.Code(" sono1", ArrangeCol.Carm) };
        var problems = ArrangeMap.Validate(rules, new[] { ArrangeCol.Xray });
        Assert.Single(problems);
        Assert.Contains("SONO1", problems[0]);
    }

    [Fact(DisplayName = "AC-3301.4 같은 글이어도 종류가 다른 규칙(코드 = · 코드 포함)은 두 칸이어도 문제가 아니다")]
    public void DifferentKindsAreDifferentRules()
    {
        var rules = new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono), ArrangeRule.CodeContains("CARM", ArrangeCol.Carm), ArrangeRule.NameContains("CARM", ArrangeCol.Sono) };
        Assert.Empty(ArrangeMap.Validate(rules, new[] { ArrangeCol.Xray }));
    }

    [Fact(DisplayName = "AC-3301.4 Unconfirmed 칸에 규칙이 있으면 알린다")]
    public void UnconfirmedWithRule()
    {
        var rules = new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono), ArrangeRule.Code("CARM1", ArrangeCol.Carm), ArrangeRule.CodePattern(@"^G\d{4}$", ArrangeCol.Xray) };
        var problems = ArrangeMap.Validate(rules, new[] { ArrangeCol.Xray });
        Assert.Single(problems);
        Assert.Contains("X-RAY", problems[0]);
    }

    [Theory(DisplayName = "AC-3301.4 직접 칸(pt·ds·eswt·trac)에 규칙이 있으면 알린다")]
    [InlineData(ArrangeCol.Pt)]
    [InlineData(ArrangeCol.Ds)]
    [InlineData(ArrangeCol.Eswt)]
    [InlineData(ArrangeCol.Trac)]
    public void ManualWithRule(ArrangeCol col)
    {
        var rules = new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono), ArrangeRule.Code("CARM1", ArrangeCol.Carm), ArrangeRule.Code("Z9", col) };
        var problems = ArrangeMap.Validate(rules, new[] { ArrangeCol.Xray });
        Assert.Single(problems);
        Assert.Contains("직접", problems[0]);
    }

    [Fact(DisplayName = "AC-3301.4 Unconfirmed가 아닌 처방 칸(xray·sono·carm)에 규칙이 하나도 없으면 알린다")]
    public void ConfirmedColumnWithoutRule()
    {
        var problems = ArrangeMap.Validate(new[] { ArrangeRule.Code("SONO1", ArrangeCol.Sono) }, NoCols);
        Assert.Equal(2, problems.Count);
        Assert.Contains(problems, p => p.Contains("X-RAY"));
        Assert.Contains(problems, p => p.Contains("C-ARM"));
    }
}
