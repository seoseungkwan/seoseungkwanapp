using System;

namespace Precheck.Core.Claim;

/// <summary>
/// 메모 비교(원본 MemoApproval.Matches, AC-016.2): 윈도우 줄바꿈 CRLF만 LF로 맞추고 나머지는 글자 그대로 비교한다.
/// 앞뒤 공백을 지우거나 글자를 다듬지 않는다. 다듬으면 '같음'과 '다름'이 뒤바뀐다. 입력 직전 다시 읽기(TASK-17)도 이 규칙을 쓴다.
/// </summary>
public static class MemoCompare
{
    /// <summary>CRLF만 LF로 바꾼다. 홀로 있는 CR·공백·제어 문자는 그대로다.</summary>
    public static string NormalizeNewlines(string text) => text.Replace("\r\n", "\n");

    /// <summary>둘 다 값이 있고 CRLF→LF 뒤 글자가 똑같으면 true. 어느 쪽이든 null(읽지 못함)이면 false다. 빈 글자로 보지 않는다.</summary>
    public static bool Matches(string? current, string? expected) =>
        current != null && expected != null &&
        string.Equals(NormalizeNewlines(current), NormalizeNewlines(expected), StringComparison.Ordinal);
}
