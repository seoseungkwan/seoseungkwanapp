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
    /// 웹 compareMemo(src/lib/precheck/memoCompare.test.ts)가 같은 파일을 읽어 같은 답을 내는지 본다(AC-016.2·AC-035.3).
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

    private static List<(string Name, string Ours, string? InBit, string Expected)> SharedCases()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(CasesFile()));
        return document.RootElement.EnumerateArray()
            .Select(item => (
                item.GetProperty("name").GetString()!,
                item.GetProperty("ours").GetString()!,
                item.GetProperty("inBit").ValueKind == JsonValueKind.Null ? null : item.GetProperty("inBit").GetString(),
                item.GetProperty("expected").GetString()!))
            .ToList();
    }

    public static IEnumerable<object[]> SharedCaseNames() => SharedCases().Select(item => new object[] { item.Name });

    [Theory(DisplayName = "AC-016.2 공유 사례: 웹 compareMemo와 같은 파일로 같은 답을 낸다")]
    [MemberData(nameof(SharedCaseNames))]
    public void SharedCasesMatchWeb(string name)
    {
        var item = SharedCases().Single(row => row.Name == name);
        Assert.Equal(item.Expected, Compare(item.Ours, item.InBit));
    }
}
