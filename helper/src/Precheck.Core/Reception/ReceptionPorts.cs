namespace Precheck.Core.Reception;

/// <summary>
/// 접수 현황 서버의 문 번호(design.md 7절). 직원 폰 홈 화면 주소(http://{이 PC}:47200/)가 이 번호에 묶이므로
/// 문이 쓰이고 있어도 다른 번호로 바꾸지 않는다(AC-1411.5).
/// </summary>
public static class ReceptionPorts
{
    public const int Http = 47200;
}
