using System;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Windows;

namespace Precheck.Reception;

/// <summary>
/// 혼자 설치의 등록(spec reception-other-clinic design.md 6절, AC-5707.1): install-reception.ps1이 등록 없는 PC에서 `PrecheckReception.exe --register`로 부른다.
/// 도우미 [처음 등록]과 같은 RegisterFlow(비트 찾기 → 비트 로그인 창 → 이 병원 확인 창 → [확인]일 때만 저장)를 돌아, 접수 현황 서버가 읽는 같은 data\ 폴더에 등록 파일을 쓴다.
/// 서버·뮤텍스는 쓰지 않는다(ReceptionStart가 이 길에서는 부르지 않는다).
/// 부품은 ReceptionServices.CreateBit와 같다. 일꾼이 나란히 고칠 수 있게 파일을 나눴고, 합친 뒤 TASK-8이 하나로 모은다.
/// </summary>
internal static class RegisterEntry
{
    /// <summary>저장했으면 true, 비트 로그인 취소·[취소]·창 닫기·시간 지남이면 false. 막히면 그 오류 번호의 예외를 던진다.</summary>
    public static bool Run()
    {
        var protector = new DpapiProtector();
        var store = new RegistrationStore(ReceptionServices.DataDirectory(), protector);
        var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));
        return RegisterFlow.Run(new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(), store));
    }

    /// <summary>다시 등록할 때 전에 등록해 둔 설치 위치. 등록을 읽지 못하면 없는 것으로 본다(ReceptionServices와 같다).</summary>
    private static string? RegisteredInstall(RegistrationStore store)
    {
        try
        {
            return store.Load()?.InstallPath;
        }
        catch (HelperException)
        {
            return null;
        }
    }
}
