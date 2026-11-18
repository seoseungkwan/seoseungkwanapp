using Precheck.Core.Claim;

namespace Precheck.Core.Input;

/// <summary>
/// 쓰기 직전 비교의 진짜 구현(AC-035.3). 글자 비교는 Core/Claim/MemoCompare 한 곳이고 여기서 다시 만들지 않는다.
/// 정확히 같을 때만(CRLF→LF만 맞춤) 같음이다: 앞 글 + 줄바꿈 + 우리 메모(뒤에 붙인 메모)도 다름이다(clinic-profile AC-6611.3, 사용자 결정 '좁히기').
/// 붙임 기록은 웹만 알고 웹이 같음으로 보면 보내지 않는다. 묻지 않기·이미 있음 판단에 붙임 꼬리를 쓰지 않는다. 끊긴 붙이기 되살리기는 InputRunner가 자기 입력 기록의 앞 글로 따로 본다.
/// </summary>
public sealed class MemoMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (inBit == null) return MemoMatch.Unknown;
        if (string.IsNullOrWhiteSpace(inBit)) return MemoMatch.Absent;
        return MemoCompare.Matches(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}
