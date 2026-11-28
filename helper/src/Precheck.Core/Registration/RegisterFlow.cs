using System;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.Registration;

/// <summary>
/// bit.register(AC-005.5, design.md 9-1). 비트 찾기 → DB 열기(서버 검사) → 비트 로그인 창 → DB 안 병원 범위(빈 값 뺌) →
/// 그 범위의 오늘 8자리 기관기호 하나 → DB를 닫고 → PC 확인 창 → [확인]일 때만 저장.
/// 범위가 하나면 원본(HospitalSecurity.Authorize)과 다르게 로그인한 계정의 범위·작업일로 고르지 않는다(AC-005.13, 사용자 2026-11-23 '사람이 확인하면 열리게'):
/// DB에 의원이 하나면 계정의 범위는 그 의원 말고 될 수 없다. 범위가 여럿이면 TASK-46부터 계정의 범위 → 최근 30일 내원이 있는 범위 하나로 고르고
/// 못 정하면 E-BIT-REG-MANY다(AC-005.18). 막는 것은 범위 없음·못 고름, 저장 값 모양뿐이다(기관기호는 못 찾으면 빈 값).
/// TASK-48부터 고르기 창(BitServices.Pick)이 있으면 범위가 여럿일 때 그 차례로 미리 골라 둔 고르기 창을 띄우고, 사람이 고른 범위로 저장한다(AC-005.19, PC 확인 창 대신).
/// 이미 등록돼 있으면 같은 길로 바꿔 쓴다: 확인 창에 전 값과 새 값을 함께 보이고, 기관기호가 같으면 전 프로필 ID를 둔다.
/// 등록 파일이 깨지고 .bak도 못 쓰면(E-STORE-BROKEN) 처음 등록처럼 한다: 전 값 없이, 새 프로필 ID(AC-005.12).
/// 저장할 때 깨진 파일은 RegistrationStore.Save가 이름을 바꿔 둔다(지우지 않음).
/// </summary>
public static class RegisterFlow
{
    /// <summary>확인 창이 이 시간 동안 답이 없으면 취소로 본다(ADR-016, design.md 15절).</summary>
    public static readonly TimeSpan ConfirmTimeout = TimeSpan.FromMinutes(5);

    /// <summary>저장했으면 true. 비트 로그인 취소·[취소]·창 닫기·시간 지남이면 false(저장하지 않음).</summary>
    public static bool Run(BitServices services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var root = services.Locator.Find();

        HospitalRegistration? candidate = null;
        HospitalRegistration? previous;
        HospitalPickView? pickView = null;
        using (var session = services.Connector.Open(root))
        {
            // 비트 로그인은 그대로 한다(비트를 쓰는 사람만 등록한다). 취소면 등록 없음
            var user = services.Login.Login(root);
            if (user == null) return false;

            var scopes = HospitalCheck.ReadScopes(session);
            if (scopes.Count == 0) throw new BitException(BitErrors.RegisterNone);
            previous = LoadPrevious(services.Store);
            if (scopes.Count > 1 && services.Pick != null)
            {
                // 범위가 여럿이고 고르기 창이 있으면 범위마다 기관기호·최근 30일 외래 건수·계정 범위를 읽어 두고 사람이 고른다(AC-005.19)
                pickView = HospitalPick.Read(session, scopes, user, services.Today().Date, session.Target, previous);
            }
            else
            {
                // 범위가 여럿이면 로그인 계정의 범위 → 최근 30일 내원이 있는 범위 하나로 고른다. 못 정하면 E-BIT-REG-MANY(AC-005.18)
                var scope = scopes.Count == 1
                    ? scopes[0]
                    : HospitalCheck.ChooseScope(session, scopes, user, services.Today().Date) ?? throw new BitException(BitErrors.RegisterMany);
                var codes = HospitalCheck.ReadCodes(session, scope, services.Today().Date);
                var code = codes.Count == 1 ? codes[0] : ""; // 못 찾으면 빈 기관기호로 등록한다(AC-005.13, 사람이 확인 창에서 본다)
                candidate = Candidate(services, previous, scope, code, session.Target);
            }
        }

        // DB를 닫은 뒤 창을 띄운다(사람이 5분까지 생각하는 동안 DB 연결을 붙잡지 않는다)
        if (pickView != null)
        {
            // 저장 모양이 틀린 줄이 있으면 창 없이 번호만(AC-005.13). 프로필 ID는 아직 만들지 않고 모양 맞는 빈 값으로 본다
            if (pickView.Choices.Any(c => !Place(c, pickView.Target).IsValid)) throw new BitException(BitErrors.RegisterPlace);
            // 고르기 창이 PC 확인 창을 대신한다: [확인]이면 고른 줄로 저장, [취소]·닫기·시간 지남이면 저장 안 함(AC-005.19)
            var index = services.Pick!.Pick(pickView, ConfirmTimeout);
            if (index == null || index.Value < 0 || index.Value >= pickView.Choices.Count) return false;
            var choice = pickView.Choices[index.Value];
            var picked = Candidate(services, previous, choice.Scope, choice.InstitutionCode, pickView.Target);
            if (!picked.IsValid) throw new BitException(BitErrors.RegisterPlace);
            services.Store.Save(picked);
            return true;
        }

        if (!candidate!.IsValid) throw new BitException(BitErrors.RegisterPlace);
        if (!services.Confirm.Show(RegisterPrompt.Build(candidate, previous), ConfirmTimeout)) return false;
        services.Store.Save(candidate);
        return true;
    }

    /// <summary>프로필 ID 말고 저장 모양만 보려는 값(프로필 ID 자리는 모양 맞는 0).</summary>
    private static HospitalRegistration Place(HospitalChoice choice, BitTarget target) =>
        new HospitalRegistration(
            institutionCode: choice.InstitutionCode,
            scope: choice.Scope,
            installPath: target.InstallPath,
            server: target.Server,
            database: target.Database,
            profileId: new string('0', 32));

    /// <summary>
    /// 저장할 등록 값. 병원 이름은 저장하지 않는다(AC-005.9): 원본 비트 읽기(HospitalSecurity)에 병원 이름 SQL이 없고, 화면은 사이트 값을 쓴다.
    /// 전 등록과 기관기호·범위가 모두 같으면 전 프로필 ID를 그대로 둔다(AC-005.13).
    /// </summary>
    private static HospitalRegistration Candidate(BitServices services, HospitalRegistration? previous, string scope, string code, BitTarget target)
    {
        var sameHospital = previous != null && string.Equals(previous.InstitutionCode, code, StringComparison.Ordinal)
            && string.Equals(previous.Scope, scope, StringComparison.Ordinal);
        return new HospitalRegistration(
            institutionCode: code,
            scope: scope,
            installPath: target.InstallPath,
            server: target.Server,
            database: target.Database,
            profileId: sameHospital ? previous!.ProfileId : services.NewProfileId());
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
