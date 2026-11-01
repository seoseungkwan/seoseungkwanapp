using System.Threading;

namespace Precheck.Core.Input;

/// <summary>표준 입력이 닫혔다는 신호(AC-017.9). 읽기 스레드(StdinPump)가 세우고 bit.input이 본다. 한 번 서면 그대로다.</summary>
public sealed class HostSignal
{
    private int closed;

    public bool StdinClosed => Volatile.Read(ref closed) != 0;

    public void MarkStdinClosed() => Volatile.Write(ref closed, 1);
}
