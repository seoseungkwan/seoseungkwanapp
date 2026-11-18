using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Claim;
using Precheck.Core.Input;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-016.2 도우미 쪽 비교(원본 MemoApproval.Matches, 사례는 원본 SecurityTests): 줄바꿈 CRLF→LF만 맞추고 나머지는 글자 그대로.
/// 메모는 모두 지어낸 것이다. 웹 쪽 compareMemo의 네 상태는 src/lib/precheck/memoCompare.test.ts가 본다.
/// </summary>
public class MemoCompareTests
{
    [Fact(DisplayName = "AC-016.2 윈도우 줄바꿈(CRLF)과 LF는 같은 글자로 본다(원본 approved-memo-windows-newline)")]
    public void WindowsNewlineMatches()
    {
        Assert.True(MemoCompare.Matches("합성\r\n기존 메모", "합성\n기존 메모"));
        Assert.True(MemoCompare.Matches("합성\n기존 메모", "합성\r\n기존 메모"));
        Assert.True(MemoCompare.Matches("합성 기존 메모", "합성 기존 메모"));
        Assert.True(MemoCompare.Matches("", ""));
    }

    [Theory(DisplayName = "AC-016.2 줄바꿈 말고는 글자 그대로: 공백·탭·홀로 있는 CR·대소문자·유니코드 조합이 다르면 같지 않다(원본 approved-memo-keeps-whitespace·change-rejected)")]
    [InlineData("합성 기존 메모 ", "합성 기존 메모")]
    [InlineData(" 합성 기존 메모", "합성 기존 메모")]
    [InlineData("합성  기존 메모", "합성 기존 메모")]
    [InlineData("합성\t기존 메모", "합성 기존 메모")]
    [InlineData("합성 기존 메모\n", "합성 기존 메모")]
    [InlineData("합성\r기존 메모", "합성\n기존 메모")]
    [InlineData("MBB Lt", "mbb lt")]
    [InlineData("합", "합")]
    [InlineData("변경된 합성 메모", "합성 기존 메모")]
    public void OtherDifferencesDoNotMatch(string current, string expected)
    {
        Assert.False(MemoCompare.Matches(current, expected));
        Assert.False(MemoCompare.Matches(expected, current));
    }

    [Theory(DisplayName = "AC-016.2 값이 없으면 같지 않다(원본 approved-memo-missing-rejected): 읽지 못한 것을 빈칸으로 보지 않는다")]
    [InlineData("", null)]
    [InlineData(null, "")]
    [InlineData(null, null)]
    [InlineData("합성 기존 메모", null)]
    public void MissingNeverMatches(string? current, string? expected)
    {
        Assert.False(MemoCompare.Matches(current, expected));
    }

    [Fact(DisplayName = "AC-016.2 NormalizeNewlines는 CRLF만 LF로 바꾼다(홀로 있는 CR·앞뒤 공백은 그대로)")]
    public void NormalizeOnlyTouchesCrLf()
    {
        Assert.Equal(" 첫 줄\n둘째\r줄\n\t", MemoCompare.NormalizeNewlines(" 첫 줄\r\n둘째\r줄\n\t"));
    }

    /// <summary>
    /// 웹 compareMemo(src/lib/precheck/memoCompare.test.ts)가 같은 파일을 읽어 줄마다 쪽별 기대값을 본다(AC-016.2·AC-035.3·AC-6611.3).
    /// 도우미는 expected.helper만 본다: 붙임 기록을 모르고 정확히 같을 때만 같음이다. 웹은 기록 없음(expected.web)·있음·앞 글 다름을 본다.
    /// 쓰기 직전 비교의 진짜 구현(MemoMatcher)을 부른다: 사본을 두면 진짜가 달라져도 이 시험은 통과한다.
    /// </summary>
    private static string Compare(string ours, string? inBit) => new MemoMatcher().Compare(ours, inBit) switch
    {
        MemoMatch.Unknown => "조회 못함",
        MemoMatch.Absent => "비트에 없음",
        MemoMatch.Same => "같음",
        MemoMatch.Different => "다름",
        var other => throw new InvalidOperationException("모르는 비교 결과: " + other),
    };

    private static string CasesFile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "Claim", "memo-compare-cases.test.json");
            if (File.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Claim/memo-compare-cases.test.json을 찾지 못했다");
    }

    // net48에도 돌아야 하므로 record(init 접근자) 대신 읽기 전용 속성 클래스로 둔다(IsExternalInit 없음)
    private sealed class SharedCase
    {
        public SharedCase(string name, string ours, string? inBit, string helper, string web, string? webRecord, string? ac)
        {
            Name = name;
            Ours = ours;
            InBit = inBit;
            Helper = helper;
            Web = web;
            WebRecord = webRecord;
            Ac = ac;
        }

        public string Name { get; }
        public string Ours { get; }
        public string? InBit { get; }
        public string Helper { get; }
        public string Web { get; }
        public string? WebRecord { get; }
        public string? Ac { get; }
    }

    private static List<SharedCase> SharedCases()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(CasesFile()));
        return document.RootElement.EnumerateArray()
            .Select(item =>
            {
                var expected = item.GetProperty("expected");
                return new SharedCase(
                    item.GetProperty("name").GetString()!,
                    item.GetProperty("ours").GetString()!,
                    item.GetProperty("inBit").ValueKind == JsonValueKind.Null ? null : item.GetProperty("inBit").GetString(),
                    expected.GetProperty("helper").GetString()!,
                    expected.GetProperty("web").GetString()!,
                    expected.TryGetProperty("webRecord", out var webRecord) ? webRecord.GetString() : null,
                    item.TryGetProperty("ac", out var ac) ? ac.GetString() : null);
            })
            .ToList();
    }

    public static IEnumerable<object[]> SharedCaseNames() => SharedCases().Select(item => new object[] { item.Name });

    public static IEnumerable<object[]> AppendedCaseNames() => SharedCases().Where(item => item.Ac == "AC-6611.3").Select(item => new object[] { item.Name });

    [Theory(DisplayName = "AC-016.2 공유 사례: 웹 compareMemo와 같은 파일의 도우미 기대값과 같은 답을 낸다")]
    [MemberData(nameof(SharedCaseNames))]
    public void SharedCasesMatchWeb(string name)
    {
        var item = SharedCases().Single(row => row.Name == name);
        Assert.Equal(item.Helper, Compare(item.Ours, item.InBit));
    }

    // ------------------------------------------------------------------
    // AC-6611.3 뒤에 붙인 메모(clinic-profile, 사용자 결정 '좁히기'): 도우미는 정확히 같을 때만 같음
    // ------------------------------------------------------------------

    [Theory(DisplayName = "AC-6611.3 공유 사례 중 붙인 메모: 도우미 비교기는 붙임 꼬리로 같음을 치지 않는다(앞 글 + 줄바꿈 + 우리 메모도 다름), 웹과 같은 줄의 도우미 기대값")]
    [MemberData(nameof(AppendedCaseNames))]
    public void AppendedCasesMatchWeb(string name)
    {
        var item = SharedCases().Single(row => row.Name == name);
        Assert.Equal(item.Helper, Compare(item.Ours, item.InBit));
    }

    [Fact(DisplayName = "AC-6611.3 공유 사례 표: 줄마다 도우미 기대값은 웹의 붙임 기록 없음과 같고(둘 다 정확히 같을 때만 같음), 웹이 기록으로 같음인 붙인 줄은 도우미에서 다름이다")]
    public void AppendedCasesAreExactOnly()
    {
        var cases = SharedCases();
        Assert.All(cases, item => Assert.Equal(item.Web, item.Helper));
        var appended = cases.Where(item => item.Ac == "AC-6611.3" && item.WebRecord == "같음" && item.Ours != item.InBit).ToList();
        Assert.NotEmpty(appended);
        Assert.All(appended, item => Assert.Equal("다름", item.Helper));
        Assert.Contains(cases, item => item.Ac == "AC-6611.3" && item.WebRecord == "다름");
    }

    [Fact(DisplayName = "AC-6611.3 MemoCompare에 붙임 꼬리 규칙(IsAppended)이 없다: 쓰는 곳이 없어져 지웠다")]
    public void NoSuffixRule()
    {
        Assert.Null(typeof(MemoCompare).GetMethod("IsAppended"));
    }

    [Fact(DisplayName = "AC-6611.3 MemoCompare.Join: 앞 글의 끝 공백·줄바꿈을 떼고 줄바꿈 하나 + 우리 메모, 그 글도 도우미 비교기는 다름이다(정확히 같을 때만 같음)")]
    public void JoinIsNotSame()
    {
        Assert.Equal("직원이 쓴 메모\n우리 메모", MemoCompare.Join("직원이 쓴 메모 \r\n\t", "우리 메모"));
        Assert.Equal(" 앞 공백\r\n둘째 줄\n우리 메모", MemoCompare.Join(" 앞 공백\r\n둘째 줄", "우리 메모"));
        Assert.Equal("다름", Compare("우리 메모", MemoCompare.Join("직원이 쓴 메모", "우리 메모")));
        Assert.Equal("같음", Compare("직원이 쓴 메모\n우리 메모", MemoCompare.Join("직원이 쓴 메모", "우리 메모")));
    }
}
