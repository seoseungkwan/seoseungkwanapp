using System;
using System.Globalization;
using Precheck.Core.Bit;

namespace Precheck.Core.Registration;

/// <summary>
/// bit.register(AC-005.5, design.md 9-1). 원본 HospitalIdentity.Configure + HospitalSecurity.Authorize 순서:
/// 비트 찾기 → DB 열기(서버 검사) → 비트 로그인 창 → 그 사용자의 병원 범위 하나 → 그 범위의 기관기호(8자리) →
/// (작업일이 오늘이 아니면 오늘도) → DB 안 범위가 그것 하나뿐 → DB를 닫고 → PC 확인 창 → [확인]일 때만 저장.
/// 이미 등록돼 있으면 같은 길로 바꿔 쓴다: 확인 창에 전 값과 새 값을 함께 보이고, 기관기호가 같으면 전 프로필 ID를 둔다.
/// 등록 파일이 깨지고 .bak도 못 쓰면(E-STORE-BROKEN) 처음 등록처럼 한다: 전 값 없이, 새 프로필 ID(AC-005.12).
/// 저장할 때 깨진 파일은 RegistrationStore.Save가 이름을 바꿔 둔다(지우지 않음).
/// </summary>
public static class RegisterFlow
{
    /// <summary>확인 창이 이 시간 동안 답이 없으면 취소로 본다(ADR-016, design.md 15절).</summary>
    public static readonly TimeSpan ConfirmTimeout = TimeSpan.FromMinutes(5);

    /// <summary>
    /// 저장했으면 true. 비트 로그인 취소·[취소]·창 닫기·시간 지남이면 false(저장하지 않음).
    /// readOnly는 읽기만 하는 접수 현황 프로그램(RegisterEntry)만 참으로 넘긴다: 확인 창 글만 바뀐다(AC-5717.1).
    /// </summary>
    public static bool Run(BitServices services, bool readOnly = false)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var root = services.Locator.Find();

        HospitalRegistration candidate;
        HospitalRegistration? previous;
        using (var session = services.Connector.Open(root))
        {
            var user = services.Login.Login(root);
            if (user == null) return false;

            var today = services.Today().Date;
            var scope = HospitalCheck.ReadUserScope(session, user);
            var workDay = DateTime.ParseExact(user.WorkDate, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None);
            var code = HospitalCheck.ReadInstitutionCode(session, scope, workDay);
            if (workDay.Date != today) HospitalCheck.VerifyInstitutionNumber(session, scope, today, code);
            HospitalCheck.VerifyOnlyScope(session, scope);

            previous = LoadPrevious(services.Store);
            var sameHospital = previous != null && string.Equals(previous.InstitutionCode, code, StringComparison.Ordinal);
            var target = session.Target;
            // 병원 이름은 저장하지 않는다(AC-005.9): 원본 비트 읽기(HospitalSecurity)에 병원 이름 SQL이 없고, 화면은 사이트 값을 쓴다
            candidate = new HospitalRegistration(
                institutionCode: code,
                scope: scope,
                installPath: target.InstallPath,
                server: target.Server,
                database: target.Database,
                profileId: sameHospital ? previous!.ProfileId : services.NewProfileId());
        }
        if (!candidate.IsValid) throw new BitException(BitErrors.HospitalMismatch);

        // DB를 닫은 뒤 창을 띄운다(사람이 5분까지 생각하는 동안 DB 연결을 붙잡지 않는다)
        if (!services.Confirm.Show(RegisterPrompt.Build(candidate, previous, readOnly), ConfirmTimeout)) return false;
        services.Store.Save(candidate);
        return true;
    }

    /// <summary>전 등록. 깨지고 .bak도 못 쓰면(E-STORE-BROKEN) 없는 것으로 보고 처음 등록처럼 한다(AC-005.12).</summary>
    private static HospitalRegistration? LoadPrevious(RegistrationStore store)
    {
        try
        {
            return store.Load();
        }
        catch (BitException e) when (e.Code == BitErrors.StoreBroken)
        {
            return null;
        }
    }
}
