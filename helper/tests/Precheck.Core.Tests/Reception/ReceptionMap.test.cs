using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Protocol;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Map 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Map;

/// <summary>
/// 한 곳(ReceptionMap, design.md 2절).
/// AC-1410.1 상태 표·숨기는 OcmRsuYon 값·읽는 칸이 이 파일 한 곳에만 있다.
/// AC-1410.2 채운 표(TASK-28)는 확인 보고서 표와 같다. Validate: 한 코드 두 칸 금지, Unconfirmed가 아닌 칸마다 코드 하나 이상,
/// Unconfirmed 칸은 비어 있음, 표에 든 아는 완료 코드는 숨김 아님(답 없는 코드는 표에 넣지 않는다).
/// AC-1402.1 표에 있는 코드만 칸에 가고, 표에 없는 코드·숨김(접수 취소)·숨기는 OcmRsuYon 값의 줄은 어느 칸에도 가지 않는다.
/// 상태 코드는 가짜(시험용 두 글자)와 이미 아는 완료 코드만 쓴다.
/// </summary>
public class ReceptionMapTests
{
    private static IReadOnlyDictionary<string, Lane> Dict(params (string Code, Lane Lane)[] pairs)
    {
        var dict = new Dictionary<string, Lane>(StringComparer.Ordinal);
        foreach (var (code, lane) in pairs) dict.Add(code, lane);
        return dict;
    }

    private static readonly string[] KnownDone = { "HN", "PN", "TN", "VN", "OE", "WN", "OB" };

    private static readonly string[] NoRsu = new string[0];

    /// <summary>문제 없는 가짜 표: 칸마다 코드가 있고 아는 완료 코드는 끝남(WN은 확인에서 수납대기로 나왔다고 친다).</summary>
    private static (string Code, Lane Lane)[] GoodPairs() => new[]
    {
        ("A1", Lane.Wait), ("A2", Lane.Wait), ("B1", Lane.Hold), ("C1", Lane.Pay), ("WN", Lane.Pay),
        ("HN", Lane.Done), ("PN", Lane.Done), ("TN", Lane.Done), ("VN", Lane.Done), ("OE", Lane.Done), ("OB", Lane.Done),
        ("X9", Lane.Hidden),
    };

    // ---- AC-1410.1 한 곳 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1410.1 Lane은 진료대기·진료보류·수납대기·끝남·숨김 다섯 칸이다")]
    public void LaneHasFiveValues()
    {
        Assert.Equal(new[] { "Wait", "Hold", "Pay", "Done", "Hidden" }, Enum.GetNames(typeof(Lane)));
    }

    [Fact(DisplayName = "AC-1410.2 채운 상태 표는 확인 보고서 표와 같다: WR 숨김, WN 진료대기, CN·TN 수납대기, PN 끝남, 진료보류는 아직 확인 안 됨")]
    public void FilledTableMatchesReport()
    {
        // docs/reception/check-result.md 1·2회차의 상태 짝 답(PN은 2회차에 TN→PN과 수납 1줄로 본 추정)
        var report = Dict(("WR", Lane.Hidden), ("WN", Lane.Wait), ("CN", Lane.Pay), ("TN", Lane.Pay), ("PN", Lane.Done));
        Assert.Equal(report.OrderBy(p => p.Key, StringComparer.Ordinal), ReceptionMap.Statuses.OrderBy(p => p.Key, StringComparer.Ordinal));
        Assert.Equal(new[] { Lane.Hold }, ReceptionMap.Unconfirmed);
        // OcmRsuYon은 오늘 줄 모두 비어 있어 숨기는 값이 없다
        Assert.Empty(ReceptionMap.HiddenRsu);
    }

    [Fact(DisplayName = "AC-1410.2 채운 표는 Validate(Statuses, Unconfirmed)로 문제가 없다")]
    public void FilledTableHasNoProblems()
    {
        Assert.Empty(ReceptionMap.Validate(ReceptionMap.Statuses, ReceptionMap.Unconfirmed));
    }

    [Theory(DisplayName = "AC-1402.1 채운 표로 나누면 WN은 진료대기, CN·TN은 수납대기, PN은 끝남이고 WR(예약)과 답이 없는 코드는 어느 칸에도 가지 않는다")]
    [InlineData("WN", Lane.Wait)]
    [InlineData("CN", Lane.Pay)]
    [InlineData("TN", Lane.Pay)]
    [InlineData("PN", Lane.Done)]
    [InlineData("WR", Lane.Hidden)]
    [InlineData("HN", Lane.Hidden)]
    [InlineData("VN", Lane.Hidden)]
    [InlineData("OE", Lane.Hidden)]
    [InlineData("OB", Lane.Hidden)]
    [InlineData("ZZ", Lane.Hidden)]
    public void FilledTableSplitsRows(string code, Lane lane)
    {
        Assert.Equal(lane, ReceptionMap.LaneOf(ReceptionMap.Statuses, ReceptionMap.HiddenRsu, code, ""));
    }

    [Fact(DisplayName = "AC-1410.1 진짜 표에 없는 코드는 어느 칸에도 가지 않는다(채우기 전에는 목록이 빈다)")]
    public void UnfilledMapShowsNothing()
    {
        foreach (var code in KnownDone.Concat(new[] { "A1", "ZZ", "" }).Where(code => !ReceptionMap.Statuses.ContainsKey(code)))
            Assert.Equal(Lane.Hidden, ReceptionMap.LaneOf(ReceptionMap.Statuses, ReceptionMap.HiddenRsu, code, "N"));
    }

    [Fact(DisplayName = "AC-1410.1 읽는 칸(ColumnPlan)은 이름·생년월일·성별·접수 메모·수납 시각·증상이고, Columns가 null이면 칸 문장이 없다")]
    public void ColumnsPlanShape()
    {
        Assert.Equal(
            new[] { "BirthDate", "Memo", "Name", "PaidAt", "Sex", "Symptom" },
            typeof(ColumnPlan).GetProperties(BindingFlags.Public | BindingFlags.Instance).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal));
        if (ReceptionMap.Columns == null)
        {
            // 칸이 채워지기 전에는 칸을 읽는 문장(Phase 5의 TodayPeople·TodayMemos·TodayPaid·VisitSymptoms)이 없어 돌 수도 없다
            var names = typeof(ReceptionSql).GetFields(BindingFlags.Public | BindingFlags.Static).Select(f => f.Name).ToArray();
            foreach (var name in new[] { "TodayPeople", "TodayMemos", "TodayPaid", "VisitSymptoms" })
                Assert.DoesNotContain(name, names);
        }
    }

    [Fact(DisplayName = "AC-1410.1 Lane·ColumnPlan·ReceptionMap과 상태 코드 → 칸 글은 helper/src에서 ReceptionMap.cs 한 곳에만 있다")]
    public void OnlyOnePlace()
    {
        var src = Repo.PathOf("helper", "src");
        var expected = Path.Combine("Precheck.Core", "Reception", "ReceptionMap.cs");
        string[] HitsOf(Regex pattern) => Directory.EnumerateFiles(src, "*.cs", SearchOption.AllDirectories)
            .Where(file => pattern.IsMatch(File.ReadAllText(file)))
            .Select(file => file.Substring(src.Length + 1))
            .ToArray();

        // 틀(형)은 이 파일 한 곳에서만 선언한다
        foreach (var pattern in new[] { new Regex(@"\benum\s+Lane\b"), new Regex(@"\bclass\s+ColumnPlan\b"), new Regex(@"\bclass\s+ReceptionMap\b") })
        {
            var hits = HitsOf(pattern);
            Assert.True(hits.Length == 1 && hits[0] == expected, $"{pattern}: {string.Join(", ", hits)}");
        }

        // 상태 코드 글 → 칸 짝("PN" … Lane.Done)은 이 파일 말고는 어디에도 없다
        var pairs = new Regex(@"(\[\s*""[A-Za-z0-9]{1,4}""\s*\]\s*=|\{\s*""[A-Za-z0-9]{1,4}""\s*,|\(\s*""[A-Za-z0-9]{1,4}""\s*,)\s*Lane\.");
        var outside = HitsOf(pairs).Where(hit => hit != expected).ToArray();
        Assert.True(outside.Length == 0, $"상태 코드 → 칸 글이 다른 파일에 있다: {string.Join(", ", outside)}");
    }

    // ---- AC-1410.2 Validate ----------------------------------------------------------------------------

    private static readonly Lane[] NoLanes = new Lane[0];

    [Fact(DisplayName = "AC-1410.2 칸마다 코드가 있고 아는 완료 코드가 숨김이 아닌 표는 문제가 없다")]
    public void GoodMapHasNoProblems()
    {
        Assert.Empty(ReceptionMap.Validate(Dict(GoodPairs()), NoLanes));
    }

    [Theory(DisplayName = "AC-1410.2 진료대기·진료보류·수납대기·끝남 가운데 Unconfirmed가 아니면서 코드가 없는 칸이 있으면 그 칸을 알린다")]
    [InlineData(Lane.Wait, "진료대기")]
    [InlineData(Lane.Hold, "진료보류")]
    [InlineData(Lane.Pay, "수납대기")]
    [InlineData(Lane.Done, "끝남")]
    public void EmptyLaneIsProblem(Lane lane, string korean)
    {
        var problems = ReceptionMap.Validate(Dict(WithoutLane(lane)), NoLanes);
        Assert.Single(problems);
        Assert.Contains(korean, problems[0]);
    }

    [Theory(DisplayName = "AC-1410.2 Unconfirmed(아직 확인 안 됨) 칸은 비어 있어도 문제가 없다")]
    [InlineData(Lane.Wait)]
    [InlineData(Lane.Hold)]
    [InlineData(Lane.Pay)]
    [InlineData(Lane.Done)]
    public void UnconfirmedEmptyLaneIsFine(Lane lane)
    {
        Assert.Empty(ReceptionMap.Validate(Dict(WithoutLane(lane)), new[] { lane }));
    }

    [Fact(DisplayName = "AC-1410.2 Unconfirmed 칸에 코드가 있으면 그 칸을 알린다(아직 확인 안 된 칸은 비어 있다)")]
    public void UnconfirmedLaneWithCodeIsProblem()
    {
        var problems = ReceptionMap.Validate(Dict(GoodPairs()), new[] { Lane.Hold });
        Assert.Single(problems);
        Assert.Contains("진료보류", problems[0]);
    }

    /// <summary>그 칸 코드를 빼되 아는 완료 코드는 다른 보이는 칸으로 옮긴다(완료 코드 문제와 섞이지 않게).</summary>
    private static (string Code, Lane Lane)[] WithoutLane(Lane lane)
    {
        var other = lane == Lane.Pay ? Lane.Done : Lane.Pay;
        return GoodPairs().Select(p => p.Lane != lane ? p : KnownDone.Contains(p.Code) ? (p.Code, other) : (p.Code, Lane.Hidden)).ToArray();
    }

    [Theory(DisplayName = "AC-1410.2 표에 든 아는 완료 코드가 숨김이면 그 코드를 알린다")]
    [InlineData("HN")] [InlineData("PN")] [InlineData("TN")] [InlineData("VN")] [InlineData("OE")] [InlineData("WN")] [InlineData("OB")]
    public void KnownDoneHiddenIsProblem(string code)
    {
        var pairs = GoodPairs().Select(p => p.Code == code ? (p.Code, Lane.Hidden) : p).ToArray();
        var problems = ReceptionMap.Validate(Dict(pairs), NoLanes);
        Assert.Single(problems);
        Assert.Contains(code, problems[0]);
    }

    [Theory(DisplayName = "AC-1410.2 확인 답이 없는 아는 완료 코드는 표에 넣지 않아도 문제가 없다(숨김 건수로만 센다)")]
    [InlineData("HN")] [InlineData("VN")] [InlineData("OE")] [InlineData("OB")]
    public void KnownDoneMissingIsFine(string code)
    {
        Assert.Empty(ReceptionMap.Validate(Dict(GoodPairs().Where(p => p.Code != code).ToArray()), NoLanes));
    }

    [Fact(DisplayName = "AC-1410.2 확인에서 수납대기로 나온 완료 코드는 수납대기여도 문제가 없다")]
    public void KnownDoneAsPayIsFine()
    {
        var pairs = GoodPairs().Select(p => p.Code == "HN" ? (p.Code, Lane.Pay) : p).ToArray();
        Assert.Empty(ReceptionMap.Validate(Dict(pairs), NoLanes));
    }

    [Fact(DisplayName = "AC-1410.2 한 코드가 두 칸에 들면(대소문자·앞뒤 공백만 다른 열쇠) 그 코드를 알린다")]
    public void OneCodeTwoLanesIsProblem()
    {
        var pairs = GoodPairs().Concat(new[] { ("a1 ", Lane.Pay) }).ToArray();
        var problems = ReceptionMap.Validate(Dict(pairs), NoLanes);
        Assert.Single(problems);
        Assert.Contains("A1", problems[0]);
    }

    [Fact(DisplayName = "AC-1410.2 빈 표는 Unconfirmed가 아닌 네 칸이 모두 비었다고만 알린다")]
    public void EmptyMapListsAllProblems()
    {
        var problems = ReceptionMap.Validate(Dict(), NoLanes);
        foreach (var name in new[] { "진료대기", "진료보류", "수납대기", "끝남" })
            Assert.Contains(problems, problem => problem.Contains(name));
        Assert.Equal(4, problems.Count);
    }

    [Fact(DisplayName = "AC-1410.2 아는 완료 코드 목록은 HN PN TN VN OE WN OB이다")]
    public void KnownDoneCodes()
    {
        Assert.Equal(KnownDone, ReceptionMap.KnownDoneCodes);
    }

    // ---- AC-1402.1 칸 나누기 --------------------------------------------------------------------------

    [Theory(DisplayName = "AC-1402.1 표에 있는 코드는 그 칸으로 간다")]
    [InlineData("A1", Lane.Wait)]
    [InlineData("B1", Lane.Hold)]
    [InlineData("C1", Lane.Pay)]
    [InlineData("WN", Lane.Pay)]
    [InlineData("HN", Lane.Done)]
    public void CodeInTableGoesToItsLane(string code, Lane lane)
    {
        Assert.Equal(lane, ReceptionMap.LaneOf(Dict(GoodPairs()), NoRsu, code, "N"));
    }

    [Theory(DisplayName = "AC-1402.1 표에 없는 코드·빈 코드·숨김(접수 취소)으로 정한 코드는 어느 칸에도 가지 않는다")]
    [InlineData("ZZ")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("X9")]
    public void UnknownOrHiddenCodeGoesNowhere(string? code)
    {
        Assert.Equal(Lane.Hidden, ReceptionMap.LaneOf(Dict(GoodPairs()), NoRsu, code, "N"));
    }

    [Fact(DisplayName = "AC-1402.1 숨기는 OcmRsuYon 값의 줄은 상태 코드가 보이는 칸이어도 어느 칸에도 가지 않는다")]
    public void HiddenRsuGoesNowhere()
    {
        var map = Dict(GoodPairs());
        Assert.Equal(Lane.Hidden, ReceptionMap.LaneOf(map, new[] { "O" }, "A1", "O"));
        Assert.Equal(Lane.Wait, ReceptionMap.LaneOf(map, new[] { "O" }, "A1", "N"));
        Assert.Equal(Lane.Wait, ReceptionMap.LaneOf(map, new[] { "O" }, "A1", null));
    }

    [Fact(DisplayName = "AC-1402.1 코드와 OcmRsuYon 값의 앞뒤 공백은 견줄 때 무시한다")]
    public void TrimsBeforeLookup()
    {
        var map = Dict(GoodPairs());
        Assert.Equal(Lane.Done, ReceptionMap.LaneOf(map, NoRsu, "HN  ", "N"));
        Assert.Equal(Lane.Hidden, ReceptionMap.LaneOf(map, new[] { "O" }, "A1", "O "));
    }
}
