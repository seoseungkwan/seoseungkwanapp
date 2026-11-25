using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Registration;

namespace Erp.Core;

/// <summary>
/// ERP 도우미의 등록과 등록 확인(spec erp-bit-anywhere REQ-3807). 기존 RegisterFlow.Run·HospitalGate.Open과 같은 차례이고,
/// 범위 확인만 다르다: 'DB 안 범위가 등록 범위 하나뿐'(HospitalCheck.VerifyOnlyScope) 대신 '빈 값·NULL을 빼고 뒤 공백을 지운 DB 안 범위에
/// 그 범위가 들어 있음'(대소문자까지 같은 글자)을 본다. 다른 의원 비트처럼 DB에 병원 범위가 여럿이어도 로그인 계정의 범위로 등록하고 쓴다.
/// 환자·진료 표를 읽는 ERP 문장(ClosingSql)은 모두 등록 범위(@hospital)로 거른다. 기존 청구 도우미 쪽(helper/)은 고치지 않는다(AC-3801.4).
/// </summary>
public static class ErpHospital
{
    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    /// <summary>
    /// 등록 모드(AC-3807.1). 저장했으면 true. 비트 로그인 취소·[취소]·창 닫기·시간 지남이면 false(저장하지 않음).
    /// 차례: 비트 찾기 → DB 열기 → 비트 로그인 → 계정의 범위 하나 → 작업일 기관기호 → (작업일이 오늘이 아니면 오늘도) → 범위 확인 →
    /// 전 등록(깨졌으면 없는 것으로) → DB를 닫고 확인 창 → [확인]일 때만 저장(기관기호가 같으면 전 프로필 ID).
    /// </summary>
    public static bool Register(BitServices services)
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
            RequireScope(session, scope);

            previous = LoadPrevious(services.Store);
            var sameHospital = previous != null && string.Equals(previous.InstitutionCode, code, StringComparison.Ordinal);
            var target = session.Target;
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
        if (!services.Confirm.Show(RegisterPrompt.Build(candidate, previous), RegisterFlow.ConfirmTimeout)) return false;
        services.Store.Save(candidate);
        return true;
    }

    /// <summary>
    /// 등록 확인 관문(AC-3807.2). 등록이 없으면 비트를 건드리지 않고 E-BIT-NOT-REGISTERED. 설치 위치·서버·DB 이름이 등록과 다르면 읽기 전에,
    /// DB 안 범위에 등록 범위가 없거나 오늘 기관기호가 등록과 다르면 E-BIT-HOSPITAL-MISMATCH. 막히면 연 세션을 닫는다.
    /// </summary>
    public static VerifiedHospital Open(BitServices services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var registration = services.Store.Load() ?? throw new BitException(BitErrors.NotRegistered);
        var root = services.Locator.Find();
        var session = services.Connector.Open(root);
        try
        {
            var target = session.Target;
            if (!WinPath.Same(registration.InstallPath, target.InstallPath) ||
                !string.Equals(registration.Server, target.Server, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(registration.Database, target.Database, StringComparison.OrdinalIgnoreCase))
            {
                throw new BitException(BitErrors.HospitalMismatch);
            }
            RequireScope(session, registration.Scope);
            HospitalCheck.VerifyInstitutionNumber(session, registration.Scope, services.Today().Date, registration.InstitutionCode);
            return new VerifiedHospital(registration, session);
        }
        catch
        {
            session.Dispose();
            throw;
        }
    }

    /// <summary>범위 확인: 빈 값·NULL을 빼고 뒤 공백을 지운 DB 안 범위(Sql.ScopesSql)에 그 범위가 들어 있어야 한다(ordinal). 아니면 E-BIT-HOSPITAL-MISMATCH.</summary>
    private static void RequireScope(IBitDb db, string scope)
    {
        var scopes = ErpReadGuard.Query(db, Sql.ScopesSql, NoArgs, Sql.MetaTimeout)
            .Select(row => row != null && row.Count > 0 && row[0] != null ? Convert.ToString(row[0], CultureInfo.InvariantCulture) : null)
            .Select(value => (value ?? "").Trim())
            .Where(value => value.Length > 0);
        if (string.IsNullOrEmpty(scope) || !scopes.Contains(scope, StringComparer.Ordinal)) throw new BitException(BitErrors.HospitalMismatch);
    }

    /// <summary>전 등록. 깨지고 .bak도 못 쓰면(E-STORE-BROKEN) 없는 것으로 보고 처음 등록처럼 한다(기존 RegisterFlow와 같음).</summary>
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
