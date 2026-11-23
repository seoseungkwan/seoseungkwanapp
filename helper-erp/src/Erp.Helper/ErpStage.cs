namespace Erp.Helper;

/// <summary>
/// 등록 차례에서 지금 어느 단계인지(spec erp-bit-anywhere AC-3806.1). 등록이 오류로 끝나면 설치 창에 'STEP-단계'로 보인다(AC-3806.2).
/// 프로세스 하나에 값 하나다. 단계 이름은 ASCII 대문자이고 기록 파일·크롬 응답에는 넣지 않는다.
/// FIND 비트 찾기 → LOAD 비트 DLL 불러오기·접속 글자 읽기 → SERVER 서버 검사 → CONNECT DB 열기 → LOGIN DB를 연 뒤(비트 로그인 창·병원 확인).
/// </summary>
internal static class ErpStage
{
    public const string Find = "FIND";
    public const string Load = "LOAD";
    public const string Server = "SERVER";
    public const string Connect = "CONNECT";
    public const string Login = "LOGIN";

    private static volatile string? current;

    public static string? Current => current;

    public static void Set(string stage) => current = stage;
}
