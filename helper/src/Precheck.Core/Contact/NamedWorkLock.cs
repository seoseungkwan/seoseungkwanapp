using System;
using System.IO;
using System.Threading;

namespace Precheck.Core.Contact;

/// <summary>
/// 이름 있는 뮤텍스로 도우미 프로세스끼리 '한 번에 하나'(precheck design.md 9-4, AC-606.5). 잡은 채 끝난 프로세스의 뮤텍스(abandoned)는
/// 잡은 것으로 본다. 뮤텍스를 열 수 없으면(다른 사용자의 것 등) 못 잡은 것으로 본다: 도우미를 끝내지 않고 E-BRIDGE-BUSY로 답한다.
/// 만들 때는 아무것도 열지 않는다. precheck TASK-15·17은 두 번째 뮤텍스 부품을 만들지 말고 이것을 쓴다.
/// </summary>
public sealed class NamedWorkLock : IWorkLock
{
    public const string Name = @"Local\SeoseungkwanPrecheckHelper.Work";

    public IDisposable? TryEnter(TimeSpan wait)
    {
        Mutex mutex;
        try
        {
            mutex = new Mutex(false, Name);
        }
        catch (Exception e) when (e is UnauthorizedAccessException || e is IOException || e is WaitHandleCannotBeOpenedException)
        {
            return null;
        }

        bool taken;
        try
        {
            taken = mutex.WaitOne(wait);
        }
        catch (AbandonedMutexException)
        {
            taken = true;
        }
        if (taken) return new Holding(mutex);
        mutex.Dispose();
        return null;
    }

    private sealed class Holding : IDisposable
    {
        private Mutex? mutex;

        public Holding(Mutex mutex) { this.mutex = mutex; }

        public void Dispose()
        {
            var held = mutex;
            if (held == null) return;
            mutex = null;
            held.ReleaseMutex();
            held.Dispose();
        }
    }
}
