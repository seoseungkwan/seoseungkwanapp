using System;
using System.IO;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Windows;

namespace Erp.Helper;

/// <summary>
/// ERP 도우미가 쓰는 비트 부품 한 벌(spec erp-closing-fill design.md 3-4, AC-3611.2·AC-3611.3): 기존 BitServices에 기존 윈도우 부품
/// (설치 찾기·비트 로그인 창·PC 확인 창·DPAPI)과 ERP 비트 읽기(ErpBitConnector)를 넣는다. 등록 파일은 ERP 도우미 자기 data 폴더에 둔다.
/// 만들기만 하고 비트를 건드리지 않는다. 비트 DLL은 명령·등록을 처리할 때 처음 불러온다.
/// </summary>
internal static class ErpServices
{
    /// <summary>ERP 도우미 저장 폴더(등록 파일). 프로그램 폴더(app\)와 따로 있어 다시 설치해도 남는다.</summary>
    public static string DataDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Seoseungkwan", "ErpHelper", "data");

    public static BitServices Create()
    {
        var store = new RegistrationStore(DataDirectory(), new DpapiProtector());
        var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));
        return new BitServices(locator, new ErpBitConnector(), new VendorLogin(), new ConfirmWindow(), store);
    }

    /// <summary>등록해 둔 설치 위치. 등록을 읽지 못하면 없는 것으로 본다.</summary>
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
