using System;
using Precheck.Core.Registration;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 명령이 쓰는 부품 한 벌. 도우미(Precheck.Helper/Commands/HelperServices)는 Precheck.Windows의 것을,
/// 시험은 가짜를 넣는다. 날짜·프로필 ID 만들기도 바꿔 끼울 수 있다.
/// </summary>
public sealed class BitServices
{
    public BitServices(
        IBitLocator locator,
        IBitConnector connector,
        IVendorLogin login,
        IConfirmWindow confirm,
        RegistrationStore store,
        Func<DateTime>? today = null,
        Func<string>? newProfileId = null,
        IStatsScreens? screens = null)
    {
        Locator = locator ?? throw new ArgumentNullException(nameof(locator));
        Connector = connector ?? throw new ArgumentNullException(nameof(connector));
        Login = login ?? throw new ArgumentNullException(nameof(login));
        Confirm = confirm ?? throw new ArgumentNullException(nameof(confirm));
        Store = store ?? throw new ArgumentNullException(nameof(store));
        Today = today ?? (() => DateTime.Today);
        NewProfileId = newProfileId ?? RandomProfileId;
        Screens = screens;
    }

    public IBitLocator Locator { get; }

    public IBitConnector Connector { get; }

    public IVendorLogin Login { get; }

    public IConfirmWindow Confirm { get; }

    public RegistrationStore Store { get; }

    /// <summary>비트 통계 화면(claim.month의 83·83D·47 표, Precheck.Windows.VendorGridExport). 없으면 claim.month는 E-BIT-EXPORT-FAILED.</summary>
    public IStatsScreens? Screens { get; }

    /// <summary>오늘(이 PC의 날짜). 기관기호를 다시 확인할 날이다.</summary>
    public Func<DateTime> Today { get; }

    /// <summary>새 등록의 프로필 ID(32자리 16진수).</summary>
    public Func<string> NewProfileId { get; }

    /// <summary>무작위 프로필 ID(원본처럼 Guid "N" 모양).</summary>
    public static string RandomProfileId() => Guid.NewGuid().ToString("N");
}
