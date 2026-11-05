using Precheck.Core.Contact;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>
/// 환자 탭 명령이 쓰는 윈도우 부품을 만든다. 만들기만 하고 파일·뮤텍스는 명령을 처리할 때 처음 연다:
/// hello는 저장 폴더가 없거나 비트가 없는 PC에서도 답해야 한다.
/// </summary>
internal static class ContactHelperServices
{
    /// <summary>contact.dat. 저장 폴더는 프로그램 폴더 밖이고 DPAPI CurrentUser로 암호화한다(ADR-020 보충).</summary>
    public static ContactStore CreateStore() => new ContactStore(HelperServices.DataDirectory(), new DpapiProtector());

    public static IWorkLock CreateWorkLock() => new NamedWorkLock();
}
