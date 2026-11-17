using Precheck.Core.Registration;
using Precheck.Windows;

namespace Precheck.Reception;

/// <summary>
/// 혼자 설치의 등록(spec reception-other-clinic design.md 6절, AC-5707.1): install-reception.ps1이 등록 없는 PC에서 `PrecheckReception.exe --register`로 부른다.
/// 도우미 [처음 등록]과 같은 RegisterFlow(비트 찾기 → 비트 로그인 창 → 이 병원 확인 창 → [확인]일 때만 저장)를 돌아, 접수 현황 서버가 읽는 같은 data\ 폴더에 등록 파일을 쓴다.
/// 서버·뮤텍스는 쓰지 않는다(ReceptionStart가 이 길에서는 부르지 않는다).
/// 부품은 서버와 같은 ReceptionServices.CreateBit 한 곳에서 만든다(같은 data\ 폴더·같은 DPAPI, 확인 창 제목 "접수 현황", AC-5707.8).
/// 접수 현황은 비트를 읽기만 하므로 readOnly: true로 확인 창 끝 줄을 "…읽기를 멈춥니다."로 띄운다(AC-5717.1).
/// </summary>
internal static class RegisterEntry
{
    /// <summary>저장했으면 true, 비트 로그인 취소·[취소]·창 닫기·시간 지남이면 false. 막히면 그 오류 번호의 예외를 던진다.</summary>
    public static bool Run() => RegisterFlow.Run(ReceptionServices.CreateBit(new DpapiProtector()), readOnly: true);
}
