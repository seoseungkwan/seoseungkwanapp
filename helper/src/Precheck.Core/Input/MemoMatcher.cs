using Precheck.Core.Claim;

namespace Precheck.Core.Input;

/// <summary>쓰기 직전 비교의 진짜 구현(AC-035.3). 글자 비교는 Core/Claim/MemoCompare 한 곳이고 여기서 다시 만들지 않는다.</summary>
public sealed class MemoMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (inBit == null) return MemoMatch.Unknown;
        if (string.IsNullOrWhiteSpace(inBit)) return MemoMatch.Absent;
        return MemoCompare.Matches(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}
