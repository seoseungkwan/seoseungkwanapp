using System;
using System.IO;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>
/// 비트 명령이 쓰는 윈도우 부품을 한 벌로 묶는다(Precheck.Windows). 만들기만 하고 비트를 건드리지 않는다:
/// hello는 비트가 없는 PC에서도 답해야 한다. 비트 DLL은 명령을 처리할 때 처음 불러온다.
/// </summary>
internal static class HelperServices
{
    /// <summary>도우미 저장 폴더(design.md 9-3). 프로그램 폴더(app\)와 따로 있어 업데이트해도 남는다.</summary>
    public static string DataDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Seoseungkwan", "PrecheckHelper", "data");

    public static BitServices Create()
    {
        var store = new RegistrationStore(DataDirectory(), new DpapiProtector());
        var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));
        // 비트 통계 화면(claim.month의 83·83D·47 표)도 만들기만 한다. 화면 DLL은 claim.month를 처리할 때 처음 불러온다
        return new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(), store, screens: new VendorGridExport());
    }

    /// <summary>등록해 둔 설치 위치(원본 '이전에 선택한 설치'). 등록을 읽지 못하면 없는 것으로 본다.</summary>
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
