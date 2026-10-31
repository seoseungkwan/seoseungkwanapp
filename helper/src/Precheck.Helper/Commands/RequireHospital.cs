using Precheck.Core.Bit;
using Precheck.Core.Registration;

namespace Precheck.Helper.Commands;

/// <summary>
/// 등록 확인 관문(AC-005.6). 뒤 TASK의 모든 비트 읽기·입력 명령(claim.*·bit.input·sam.latest·contact.targets·stats.rows)은
/// 처리기 맨 처음에 이것을 부르고, 돌려받은 세션(Db)으로만 읽는다:
/// <code>
/// using var hospital = RequireHospital.Open(services);   // E-BIT-NOT-REGISTERED / E-BIT-HOSPITAL-MISMATCH면 여기서 멈춘다
/// var rows = ReadOnlyGuard.Query(hospital.Db, Sql.…, args, timeout);
/// </code>
/// 규칙은 Core HospitalGate(원본 VerifyCurrentInstitution: 매번 오늘 날짜로 다시 읽는다)에 있다.
/// </summary>
internal static class RequireHospital
{
    public static VerifiedHospital Open(BitServices services) => HospitalGate.Open(services);
}
