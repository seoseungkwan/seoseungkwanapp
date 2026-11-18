using Precheck.Core.Claim;

namespace Precheck.Core.Input;

/// <summary>
/// 쓰기 직전 비교의 진짜 구현(AC-035.3). 글자 비교는 Core/Claim/MemoCompare 한 곳이고 여기서 다시 만들지 않는다.
/// 칸 글이 앞 글 + 줄바꿈 + 우리 메모(뒤에 붙인 메모)여도 같음이다: 다음 입력에서 앞 글을 덮어쓰지 않는다(AC-6611.3).
/// </summary>
public sealed class MemoMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (inBit == null) return MemoMatch.Unknown;
        if (string.IsNullOrWhiteSpace(inBit)) return MemoMatch.Absent;
        return MemoCompare.Matches(inBit, ours) || MemoCompare.IsAppended(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}
