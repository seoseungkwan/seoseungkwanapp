using System;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>작업 저장을 도우미 폴더·DPAPI에 잇는다(design.md 9-3). 명령을 처리할 때마다 등록을 다시 읽어 연다.</summary>
internal static class HelperStore
{
    public static WorkStore Open()
    {
        var directory = HelperServices.DataDirectory();
        var protector = new DpapiProtector();
        return WorkStore.ForRegistered(new StoreFolder(directory), protector, new RegistrationStore(directory, protector), () => DateTime.Today);
    }

    public static void Register(Dispatcher dispatcher) => StoreCommands.Register(dispatcher, Open);
}
