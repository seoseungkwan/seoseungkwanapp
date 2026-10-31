using System;
using Precheck.Core.Bit;

namespace Precheck.Core.Registration;

/// <summary>등록 확인을 마친 비트 DB. 쓰고 나면 닫는다(트랜잭션을 되돌린다).</summary>
public sealed class VerifiedHospital : IDisposable
{
    public VerifiedHospital(HospitalRegistration registration, IBitSession db)
    {
        Registration = registration ?? throw new ArgumentNullException(nameof(registration));
        Db = db ?? throw new ArgumentNullException(nameof(db));
    }

    public HospitalRegistration Registration { get; }

    /// <summary>등록 병원으로 확인한 세션. 읽기는 ReadOnlyGuard를 거친 Sql 상수만.</summary>
    public IBitSession Db { get; }

    public void Dispose() => Db.Dispose();
}

/// <summary>
/// 등록 확인 관문(AC-005.6). 뒤 TASK의 모든 읽기·입력 명령이 처음에 부른다(Precheck.Helper/Commands/RequireHospital).
/// 원본 VerifyCurrentInstitution처럼 매번 오늘 날짜로 다시 읽는다. 등록이 없으면 E-BIT-NOT-REGISTERED(비트를 건드리지 않음),
/// 다르면 E-BIT-HOSPITAL-MISMATCH. 막히면 연 세션을 닫는다.
/// </summary>
public static class HospitalGate
{
    public static VerifiedHospital Open(BitServices services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var registration = services.Store.Load() ?? throw new BitException(BitErrors.NotRegistered);
        var root = services.Locator.Find();
        var session = services.Connector.Open(root);
        try
        {
            HospitalCheck.VerifyCurrent(session, registration, services.Today().Date);
            return new VerifiedHospital(registration, session);
        }
        catch
        {
            session.Dispose();
            throw;
        }
    }
}
