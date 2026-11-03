using System;
using System.IO;
using System.Threading;

namespace Precheck.Core.Input;

/// <summary>
/// 한 번에 하나(AC-017.10): 여러 도우미 프로세스가 함께 보는 이름 있는 뮤텍스. bit.input은 확인 창 전에 InputWait로, store.save는 StoreSaveWait로 잡는다.
/// 못 잡으면 null이고 처리기는 E-BRIDGE-BUSY로 답한다. 쥔 프로세스가 놓지 않고 끝났으면(abandoned) 잡은 것으로 본다(이어서 하기는 AC-017.7).
/// 잡은 스레드에서 놓는다(뮤텍스 규칙). 처리기는 한 스레드에서 돈다.
/// </summary>
public sealed class WorkLock : IDisposable
{
    public const string MutexName = @"Local\SeoseungkwanPrecheckHelper.Work";

    public static readonly TimeSpan InputWait = TimeSpan.Zero;
    public static readonly TimeSpan StoreSaveWait = TimeSpan.FromSeconds(5);

    private readonly Mutex mutex;
    private bool disposed;

    private WorkLock(Mutex mutex, bool wasAbandoned)
    {
        this.mutex = mutex;
        WasAbandoned = wasAbandoned;
    }

    public bool WasAbandoned { get; }

    public static WorkLock? TryAcquire(TimeSpan wait) => TryAcquire(wait, MutexName);

    /// <summary>이름을 받는 입구는 시험용이다(다른 작업 폴더의 시험과 부딪히지 않게).</summary>
    public static WorkLock? TryAcquire(TimeSpan wait, string name)
    {
        Mutex mutex;
        try
        {
            mutex = new Mutex(false, name);
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }

        try
        {
            if (mutex.WaitOne(wait)) return new WorkLock(mutex, false);
        }
        catch (AbandonedMutexException)
        {
            return new WorkLock(mutex, true);
        }
        mutex.Dispose();
        return null;
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        try
        {
            mutex.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // 다른 스레드에서 놓으려 함. 프로세스가 끝나면 abandoned로 풀린다
        }
        mutex.Dispose();
    }
}
