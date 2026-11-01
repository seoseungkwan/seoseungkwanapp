using Precheck.Core.Input;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>AC-017.8 원본 vendor/secure_bridge/SecurityTests.cs의 입력 보호 사례를 그대로 옮겼다. 글자도 원본의 합성 글자다.</summary>
public class MemoApprovalTests
{
    [Fact(DisplayName = "AC-017.8 approved-memo-windows-newline: 줄바꿈 표기만 맞춘다")]
    public void WindowsNewline() => Assert.True(MemoApproval.Matches("합성\r\n기존 메모", "합성\n기존 메모"));

    [Fact(DisplayName = "AC-017.8 approved-memo-keeps-whitespace: 공백은 그대로 비교한다")]
    public void KeepsWhitespace() => Assert.False(MemoApproval.Matches("합성 기존 메모 ", "합성 기존 메모"));

    [Fact(DisplayName = "AC-017.8 approved-memo-change-rejected: 바뀐 메모는 거절")]
    public void ChangeRejected() => Assert.False(MemoApproval.Matches("변경된 합성 메모", "합성 기존 메모"));

    [Fact(DisplayName = "AC-017.8 approved-memo-missing-rejected: 없는 승인은 거절")]
    public void MissingRejected()
    {
        Assert.False(MemoApproval.Matches("", null));
        Assert.False(MemoApproval.Matches(null, ""));
    }

    [Fact(DisplayName = "AC-017.8 changed-immediately-before-write·patient-changed-before-write·guard-denials-never-write·approved-synthetic-write")]
    public void TryWrite()
    {
        var writes = 0;
        Assert.False(MemoApproval.TryWrite(() => "변경됨", "승인됨", () => true, () => writes++));
        Assert.False(MemoApproval.TryWrite(() => "승인됨", "승인됨", () => false, () => writes++));
        Assert.Equal(0, writes);
        Assert.True(MemoApproval.TryWrite(() => "승인됨", "승인됨", () => true, () => writes++));
        Assert.Equal(1, writes);
    }

    [Fact(DisplayName = "AC-017.8 대상 먼저, 내용은 쓰기 바로 앞에 확인한다(원본 TryWrite 주석의 차례)")]
    public void Order()
    {
        var order = new System.Collections.Generic.List<string>();
        MemoApproval.TryWrite(
            () => { order.Add("read"); return "승인됨"; },
            "승인됨",
            () => { order.Add("patient"); return true; },
            () => order.Add("write"));
        Assert.Equal(new[] { "patient", "read", "write" }, order);
    }
}
