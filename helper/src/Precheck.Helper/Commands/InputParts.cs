using System;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Registration;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>
/// bit.input이 쓰는 윈도우 부품 한 벌. Program.cs가 <c>InputCommands.Register(dispatcher, InputParts.Create(...))</c>로 붙인다.
/// 붙이기 전에 있어야 했던 것(먼저 붙이면 같은 날 두 번 온 환자의 메모가 다른 내원에 들어갈 수 있다, TASK-35):
/// (a) 비트 DB에서 읽은 그 환자·그 날의 내원 수. 정확히 1건일 때만 연다(InputBatch, AC-035.1).
/// (b) 작업 저장(WorkStore) 위의 진짜 입력 기록(WorkStoreJournal, AC-035.2).
/// (c) 직원이 손으로 확인한 뒤 '쓰다 멈춤' 상태를 푸는 길(checkedByHand, AC-035.5).
/// (d) 쓰다 멈춘 사람을 뺀 묶음을 알아채는 검사(InputBatch, AC-035.4).
/// (e) store.save와 되살리는 store.load도 같은 WorkLock을 잡는다(StoreCommands, AC-017.10·AC-035.6).
/// </summary>
internal static class InputParts
{
    public static InputServices Create(
        BitServices bit,
        HostSignal signal,
        Func<HospitalRegistration, IBatchJournal> openJournal,
        IMemoMatcher matcher,
        Action<string?, string?> log) =>
        new InputServices(
            bit,
            signal,
            install => new UChartAutomation(install),
            new ConfirmWindow(),
            _ => new ProgressWindow(),
            openJournal,
            matcher,
            log: log);
}
