using System;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 명령 처리기를 Dispatcher에 붙인다: bit.check·bit.register(TASK-5)와 비트를 읽는 claim.dates·claim.month(TASK-8, Claim/ClaimCommands).
/// bit.* 두 명령은 args가 {}다(commands.json): 웹이 보낸 글이 확인 창이나 등록 값에 들어갈 길이 없다.
/// 막히면 BitException 번호로 error 답(Dispatcher).
/// </summary>
public static class BitCommands
{
    public const string CheckName = "bit.check";
    public const string RegisterName = "bit.register";

    public static void Register(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));

        dispatcher.Register(CheckName, (request, sink) =>
            sink.Send(Envelope.Result(request.Id, BitCheck.Run(services))));
        dispatcher.Register(RegisterName, (request, sink) =>
            sink.Send(Envelope.Result(request.Id, new { registered = RegisterFlow.Run(services) })));
        ClaimCommands.Register(dispatcher, services);
    }
}
