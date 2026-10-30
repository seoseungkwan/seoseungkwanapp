using System;
using System.IO;

namespace Precheck.Core.Protocol;

/// <summary>
/// 도우미의 표준 입출력 고리. Program.Main은 표준 입력·출력과 기록만 넘긴다.
/// origin이 우리 확장이 아니면 하나도 읽지 않고 끝 (AC-001.3) → 메시지를 차례로 처리 →
/// 표준 입력이 닫히면 끝, 길이 0·틀린 봉투는 답하고 계속, 64MiB 넘는 길이·끊긴 틀은 끝 (AC-001.1).
/// 출력에는 메시지 틀만 쓴다 (AC-001.6).
/// </summary>
public static class MessageLoop
{
    public const int ExitOk = 0;
    public const int ExitCrashed = 1;
    public const int ExitRejected = 2;
    public const int ExitFramingBroken = 3;

    public static int Run(string[] args, Stream input, Stream output, CommandTable table, Dispatcher dispatcher,
        Action<string?, string?>? log)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));

        if (!OriginGuard.IsAllowed(args, table))
        {
            log?.Invoke(null, ErrorCodes.Rejected);
            return ExitRejected;
        }

        var sink = new StreamSink(output);
        try
        {
            while (true)
            {
                byte[]? message;
                try
                {
                    message = Framing.ReadMessage(input);
                }
                catch (ProtocolException e)
                {
                    // 길이 0: 머리만 읽었으니 다음 메시지 자리는 그대로다
                    log?.Invoke(null, e.Code);
                    sink.Send(Envelope.Error("", e.Code));
                    continue;
                }
                catch (FramingBrokenException)
                {
                    log?.Invoke(null, ErrorCodes.BadMessage);
                    return ExitFramingBroken;
                }

                if (message == null) return ExitOk;
                dispatcher.Handle(message, sink);
            }
        }
        catch (CommandCrashedException)
        {
            // Dispatcher가 명령 이름과 함께 이미 기록했다
            return ExitCrashed;
        }
        catch (Exception)
        {
            // 표준 입출력이 깨짐 등. 예외의 글은 쓰지 않는다
            log?.Invoke(null, ErrorCodes.Disconnected);
            return ExitCrashed;
        }
    }
}
