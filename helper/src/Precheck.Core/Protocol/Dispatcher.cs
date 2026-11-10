using System;
using System.Collections.Generic;

namespace Precheck.Core.Protocol;

/// <summary>
/// 메시지 하나를 봉투로 풀고 → v·명령 표로 검사하고 → 처리기를 부른다.
/// 막히면 아무 처리기도 부르지 않고 error 답을 보낸다 (AC-001.1·AC-001.2).
/// 기록(log)에는 명령 이름(표에 없으면 "unknown")과 오류 번호만 넘긴다 (AC-001.6).
/// </summary>
public sealed class Dispatcher
{
    private const string UnknownName = "unknown";

    private readonly CommandTable table;
    private readonly Action<string?, string?>? log;
    private readonly Dictionary<string, Action<Request, IReplySink>> handlers =
        new Dictionary<string, Action<Request, IReplySink>>(StringComparer.Ordinal);

    public Dispatcher(CommandTable table, Action<string?, string?>? log = null)
    {
        this.table = table ?? throw new ArgumentNullException(nameof(table));
        this.log = log;
    }

    /// <summary>표에 있는 명령(commands·erp 두 구역)에만 처리기를 붙인다.</summary>
    public void Register(string cmd, Action<Request, IReplySink> handler)
    {
        if (!table.Has(cmd)) throw new ArgumentException("명령 표에 없는 이름이다", nameof(cmd));
        handlers[cmd] = handler ?? throw new ArgumentNullException(nameof(handler));
    }

    /// <summary>기존 확장(Caller.Web)이 보낸 메시지로 처리한다.</summary>
    public void Handle(byte[] message, IReplySink sink) => Handle(message, sink, Caller.Web);

    /// <summary>
    /// 부른 쪽(caller) 구역에 없는 명령은 처리기가 있어도 E-HELPER-UNKNOWN-COMMAND다 (AC-3601.3).
    /// 처리기가 HelperException(오류 번호)을 던지면 그 번호로 답한다.
    /// 다른 예외(처리기 버그)는 기록한 뒤 CommandCrashedException으로 올려 도우미를 끝낸다: 크롬 연결이 끊겨 웹은
    /// E-BRIDGE-DISCONNECTED로 멈추고, end를 받지 못한 환자 자료는 버린다.
    /// </summary>
    public void Handle(byte[] message, IReplySink sink, Caller caller)
    {
        if (sink == null) throw new ArgumentNullException(nameof(sink));

        Request request;
        try
        {
            request = Envelope.Parse(message);
        }
        catch (ProtocolException e)
        {
            Reply(sink, e.RequestId ?? "", null, e.Code);
            return;
        }

        var name = table.Has(request.Cmd) ? request.Cmd : UnknownName;
        string? failed = null;
        try
        {
            if (request.V != table.Protocol) throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
            table.Validate(request, caller);
            if (!handlers.TryGetValue(request.Cmd, out var handler)) throw new ProtocolException(ErrorCodes.UnknownCommand, request.Id);
            handler(request, MustChunk(request.Cmd) ? new NoResultSink(sink) : sink);
        }
        catch (HelperException e)
        {
            failed = e.Code;
        }
        catch (Exception e)
        {
            log?.Invoke(name, ErrorCodes.Disconnected);
            throw new CommandCrashedException(e);
        }

        if (failed != null)
        {
            Reply(sink, request.Id, name, failed);
            return;
        }
        log?.Invoke(name, null);
    }

    private void Reply(IReplySink sink, string id, string? name, string code)
    {
        log?.Invoke(name, code);
        sink.Send(Envelope.Error(id, code));
    }

    /// <summary>
    /// 환자 자료 명령의 답은 늘 chunk … end다(작아도, AC-001.5). 예외는 store.save 하나: 보내는 쪽만 환자 자료이고
    /// 답은 result {saved: true}다(AC-004.9).
    /// </summary>
    private bool MustChunk(string cmd) => table.IsPatient(cmd) && !string.Equals(cmd, ResultAllowedPatientCommand, StringComparison.Ordinal);

    private const string ResultAllowedPatientCommand = "store.save";

    /// <summary>
    /// result 답을 내보내지 않고 HelperException(E-BRIDGE-BAD-REPLY)을 던지는 sink. 처리기는 거기서 멈추고
    /// Dispatcher가 error로 답한다. 웹이 같은 경우에 보이는 번호와 같다(AC-004.6). progress·chunk·end·error는 그대로 보낸다.
    /// </summary>
    private sealed class NoResultSink : IReplySink
    {
        private readonly IReplySink inner;

        public NoResultSink(IReplySink inner) { this.inner = inner; }

        public void Send(byte[] utf8Json)
        {
            if (string.Equals(Envelope.ReadType(utf8Json), "result", StringComparison.Ordinal))
            {
                throw new HelperException(ErrorCodes.BadReply);
            }
            inner.Send(utf8Json);
        }
    }
}
