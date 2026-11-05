using System;
using Precheck.Core.Input;
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

    /// <summary>bit.input의 입력 기록(AC-035.2). 처리기가 등록 확인을 마친 병원으로, 묶음마다 하나 연다.</summary>
    public static IBatchJournal OpenJournal(HospitalRegistration registration) =>
        new WorkStoreJournal(new WorkStore(new StoreFolder(HelperServices.DataDirectory()), new DpapiProtector(), registration, () => DateTime.Today));
}
