using Precheck.Core.Protocol;

namespace Precheck.Core.Bit;

/// <summary>비트 연결·등록 오류 번호(design.md 4-5). 문구는 웹 lib/errors.ts 한 곳에 있다.</summary>
public static class BitErrors
{
    /// <summary>비트 설치를 찾지 못했다(원본 InstallationLocator·NativeEnvironmentGuard 규칙, AC-005.1).</summary>
    public const string NotFound = "E-BIT-NOT-FOUND";

    /// <summary>비트 DB에 붙지 못했다: 접속 정보·내 PC/사설 IP가 아닌 서버·연결 실패(AC-005.2).</summary>
    public const string DbFailed = "E-BIT-DB-FAILED";

    /// <summary>이 PC에 등록한 병원이 없다(AC-005.6).</summary>
    public const string NotRegistered = "E-BIT-NOT-REGISTERED";

    /// <summary>비트의 범위·기관기호·설치 위치·서버·DB가 등록한 병원과 다르거나 확인되지 않는다(AC-005.4·AC-005.6).</summary>
    public const string HospitalMismatch = "E-BIT-HOSPITAL-MISMATCH";

    /// <summary>처음 등록: DB 안 병원 범위가 (빈 값을 빼고) 없다(AC-005.13).</summary>
    public const string RegisterNone = "E-BIT-REG-NONE";

    /// <summary>처음 등록: DB 안 병원 범위가 둘 이상이다 — 다른 의원 자료가 섞인 비트(AC-005.13).</summary>
    public const string RegisterMany = "E-BIT-REG-MANY";

    /// <summary>처음 등록: 그 범위의 오늘 8자리 기관기호가 없거나 서로 다른 값이 둘 이상이다(AC-005.13).</summary>

    /// <summary>처음 등록: 저장할 설치 위치·서버·DB 이름 값이 등록 모양에 맞지 않는다(AC-005.13).</summary>
    public const string RegisterPlace = "E-BIT-REG-PLACE";

    /// <summary>읽기가 실패했다: SQL 오류·시간 지남, 또는 허용 목록 밖 SQL(AC-005.3).</summary>
    public const string ReadFailed = "E-BIT-READ-FAILED";

    /// <summary>
    /// 비트 통계 화면(83·83D·47)을 읽지 못했다: 화면 DLL·표·칸 구성이 바뀜, 필요한 칸이 없음, 메뉴·권한 없음, 비트 로그인 취소(AC-008.3·AC-008.4).
    /// </summary>
    public const string ExportFailed = "E-BIT-EXPORT-FAILED";

    /// <summary>이 PC의 저장 폴더에 읽고 쓰지 못했다(파일 잠김·권한).</summary>
    public const string StoreFailed = "E-STORE-FAILED";

    /// <summary>저장 파일(registration.dat)이 깨졌고 .bak도 없거나 깨졌다. 설치 화면의 [처음 등록]으로 새로 시작한다(AC-005.12, design.md 9-3).</summary>
    public const string StoreBroken = "E-STORE-BROKEN";
}

/// <summary>비트 연결·등록에서 막힌 것. 메시지에는 번호만 들어간다(병원 값·환자 글자를 싣지 않는다, AC-001.6).</summary>
public sealed class BitException : HelperException
{
    public BitException(string code) : base(code) { }
}
