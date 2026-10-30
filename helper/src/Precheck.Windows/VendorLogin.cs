using System;
using System.Globalization;
using System.Reflection;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>
/// 비트 로그인 창(원본 HospitalIdentity.Configure): 설치 폴더의 BITUserLogIn.dll로 비트가 쓰는 로그인 창을 띄우고(자동 로그인 끔),
/// 로그인한 사용자 ID와 작업일을 받는다. 취소하면 null. 비트 DLL을 쓰지 못하면 E-BIT-NOT-FOUND.
/// 창은 STA 스레드에서 띄운다.
/// </summary>
public sealed class VendorLogin : IVendorLogin
{
    public const string VendorAssembly = "BITUserLogIn.dll";
    public const string VendorType = "BIT.DrBIT.Library.BITUserLogIn";

    /// <summary>원본이 로그인 창에 넘긴 프로그램 이름(비트 통계).</summary>
    public const string ProgramName = "BITStatistics";

    public VendorUser? Login(string installPath) => Sta.Run(() => ShowLogin(installPath));

    private static VendorUser? ShowLogin(string installRoot)
    {
        object? login = null;
        try
        {
            var type = VendorRuntime.Load(installRoot, VendorAssembly).GetType(VendorType, true)!;
            login = Activator.CreateInstance(type, new object[] { ProgramName, "" });
            const BindingFlags members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            var autoLogin = type.GetProperty("bitPUseAutoLogin", members);
            if (autoLogin != null && autoLogin.CanWrite) autoLogin.SetValue(login, false, null);
            var show = type.GetMethod("bitDisplayDialog", members, null, Type.EmptyTypes, null) ?? throw new BitException(BitErrors.NotFound);
            show.Invoke(login, null);

            if (!Convert.ToBoolean(Get(type, login!, "bitReturnValidateResult"), CultureInfo.InvariantCulture)) return null;
            var user = Convert.ToString(Get(type, login!, "bitGetCurrentUserId"), CultureInfo.InvariantCulture) ?? "";
            var day = Convert.ToString(Get(type, login!, "bitWorkDate"), CultureInfo.InvariantCulture) ?? "";
            return new VendorUser(user.Trim(), day.Trim());
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 DLL 안의 예외 글은 버린다
            throw new BitException(BitErrors.NotFound);
        }
        finally
        {
            (login as IDisposable)?.Dispose();
        }
    }

    private static object? Get(Type type, object instance, string name)
    {
        var property = type.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance) ?? throw new BitException(BitErrors.NotFound);
        return property.GetValue(instance, null);
    }
}
