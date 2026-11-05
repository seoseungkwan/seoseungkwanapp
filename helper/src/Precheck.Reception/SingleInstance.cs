using System;
using System.Threading;
using Precheck.Core.Reception;

namespace Precheck.Reception;

/// <summary>
/// 이 PC 사용자 세션에 PrecheckReception이 하나만 돌게 하는 이름 붙은 뮤텍스(AC-1411.1). 이름은 ReceptionStart.MutexName(Local\ = 로그인 세션마다).
/// 처음 만든 쪽만 잡아 돌려주고, 이미 있으면 null이다. 잡은 쪽은 끝날 때 같은 실행 줄(Main)에서 놓는다.
/// </summary>
internal sealed class SingleInstance : IDisposable
{
    private readonly Mutex mutex;

    private SingleInstance(Mutex mutex)
    {
        this.mutex = mutex;
    }

    /// <summary>이 세션의 첫 실행이면 잡은 뮤텍스, 이미 돌고 있으면 null.</summary>
    public static IDisposable? TryClaim()
    {
        Mutex mutex;
        bool created;
        try
        {
            mutex = new Mutex(true, ReceptionStart.MutexName, out created);
        }
        catch (UnauthorizedAccessException)
        {
            // 같은 이름을 다른 권한으로 이미 연 쪽이 있다: 돌고 있는 것으로 본다
            return null;
        }
        if (!created)
        {
            mutex.Dispose();
            return null;
        }
        return new SingleInstance(mutex);
    }

    public void Dispose()
    {
        try
        {
            mutex.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // 이미 놓았다
        }
        mutex.Dispose();
    }
}
