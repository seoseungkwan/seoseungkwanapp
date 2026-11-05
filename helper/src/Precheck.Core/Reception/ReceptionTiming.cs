namespace Precheck.Core.Reception;

/// <summary>
/// 접수 현황 읽기 간격 한 곳(design.md 3절, AC-1403.9, 사용자 결정 2026-11-05: 10초 → 5초).
/// 화면이 저절로 다시 읽는 간격은 <c>GET /api/board</c> 답의 <c>every</c>로 휴대폰에 가고, 화면 파일에는 처음 연결 전 기본값(poll.js) 하나만 있다.
/// 간격을 바꿀 때는 이 파일만 고친다. CacheSeconds는 늘 PollSeconds보다 작게 둔다(폰이 여럿이어도 간격마다 비트를 한 번쯤만 읽게).
/// 의원 PC에서 비트 부담을 본 뒤(AC-1403.10) 3초로 낮추면 CacheSeconds는 2로 한다.
/// BoardCache의 3배 쉼·실패 뒤 쉼·fresh 2초는 이 값과 따로다.
/// </summary>
public static class ReceptionTiming
{
    /// <summary>화면이 저절로 다시 읽는 간격(초). <c>/api/board</c> 답의 <c>every</c>(AC-1407.3).</summary>
    public const int PollSeconds = 5;

    /// <summary>PC 묶음 시간(초): 마지막 읽기가 끝난 지 이만큼 안이면 비트를 다시 읽지 않는다(AC-1403.2).</summary>
    public const int CacheSeconds = 4;
}
