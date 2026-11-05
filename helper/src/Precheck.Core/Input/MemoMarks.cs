using System.Text.RegularExpressions;

namespace Precheck.Core.Input;

/// <summary>
/// 메모에 남은 확인 표시(AC-014.12·AC-037.7): 원본 NEW_MEDICORE_CLAIM_REVIEW_SAFETY의 unresolved 정규식 그대로다(mx999_v22.html 9679줄).
/// 웹이 먼저 빼지만(AC-018.12) 여기까지 오면 안 되는 메모를 막는 마지막 자리다. 묻지 않기(TASK-37)가 켜져도 같다.
/// </summary>
public static class MemoMarks
{
    private static readonly Regex Unresolved = new Regex(@"\[[^\]\n]*(?:확인|미확인|미정|누락)[^\]\n]*\]|\{[^{}\n]+\}", RegexOptions.CultureInvariant);

    public static bool HasOpenMark(string memo) => Unresolved.IsMatch(memo ?? "");
}
