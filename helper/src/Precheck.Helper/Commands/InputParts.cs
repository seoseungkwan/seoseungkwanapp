using System;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Registration;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>
/// bit.input이 쓰는 윈도우 부품 한 벌. 아직 Program.cs에서 부르지 않는다: 작업 저장(TASK-15)의 입력 기록과 메모 비교(TASK-16)가 합쳐진 뒤
/// <c>InputCommands.Register(dispatcher, InputParts.Create(...))</c>로 붙인다. 그 전까지 bit.input은 E-HELPER-UNKNOWN-COMMAND로 답하고 비트에 아무것도 쓰지 않는다.
/// 먼저 붙이면 같은 날 두 번 온 환자의 메모가 다른 내원에 들어갈 수 있다. 붙이기 전에 넷 다 있어야 한다:
/// (a) 비트 DB에서 읽은 그 환자·그 날의 내원 수. 정확히 1건일 때만 연다.
/// (b) 작업 저장(WorkStore) 위의 진짜 입력 기록.
/// (c) 직원이 손으로 확인한 뒤 '쓰다 멈춤' 상태를 지우는 길.
/// (d) 쓰다 멈춘 사람을 뺀 묶음을 알아채는 검사.
/// store.save도 같은 WorkLock을 잡아야 한다(AC-017.10). store.save 처리기가 이 갈래에 없어 아직 붙이지 못했다.
/// </summary>
internal static class InputParts
{
    public static InputServices Create(
        BitServices bit,
        HostSignal signal,
        Func<HospitalRegistration, IInputJournal> openJournal,
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
