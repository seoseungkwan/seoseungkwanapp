using System;
using System.Diagnostics;
using System.Threading;
using Precheck.Core.Input;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// AC-017.10 한 번에 하나. 이름 있는 뮤텍스는 스레드마다 주인이 달라, 다른 스레드로 '다른 도우미 프로세스'를 흉내 낸다.
/// 시험끼리·다른 작업 폴더의 시험과 부딪히지 않게 시험마다 이름을 새로 짓는다. 진짜 이름은 상수로 본다.
/// </summary>
public class WorkLockTests
{
    private static string NewName() => @"Local\PrecheckTest." + Guid.NewGuid().ToString("N");

    /// <summary>다른 스레드에서 뮤텍스를 잡고 끝내라고 할 때까지 쥔다.</summary>
    private sealed class Holder : IDisposable
    {
        private readonly ManualResetEventSlim held = new ManualResetEventSlim();
        private readonly ManualResetEventSlim release = new ManualResetEventSlim();
        private readonly Thread thread;

        public Holder(string name, bool abandon = false)
        {
            thread = new Thread(() =>
            {
                var mutex = new Mutex(false, name);
                mutex.WaitOne();
                held.Set();
                release.Wait();
                if (!abandon)
                {
                    mutex.ReleaseMutex();
                    mutex.Dispose();
                }
            }) { IsBackground = true };
            thread.Start();
            Assert.True(held.Wait(TimeSpan.FromSeconds(10)));
        }

        public void Dispose()
        {
            release.Set();
            thread.Join(TimeSpan.FromSeconds(10));
        }
    }

    /// <summary>시험 스레드와 다른 스레드에서 잠금을 잡아 본다(같은 스레드는 뮤텍스를 거듭 잡을 수 있어서).</summary>
    private static T OnOtherThread<T>(Func<T> work)
    {
        T result = default!;
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try { result = work(); }
            catch (Exception e) { failure = e; }
        });
        thread.Start();
        thread.Join();
        if (failure != null) throw new InvalidOperationException("다른 스레드 실패", failure);
        return result;
    }

    [Fact(DisplayName = "AC-017.10 뮤텍스 이름은 Local\\SeoseungkwanPrecheckHelper.Work, bit.input은 바로, store.save는 5초")]
    public void Names()
    {
        Assert.Equal(@"Local\SeoseungkwanPrecheckHelper.Work", WorkLock.MutexName);
        Assert.Equal(TimeSpan.Zero, WorkLock.InputWait);
        Assert.Equal(TimeSpan.FromSeconds(5), WorkLock.StoreSaveWait);
    }

    [Fact(DisplayName = "AC-017.10 아무도 안 쥐었으면 잡고, 놓으면 다른 쪽이 잡는다")]
    public void AcquireAndRelease()
    {
        var name = NewName();
        var first = WorkLock.TryAcquire(TimeSpan.Zero, name);
        Assert.NotNull(first);
        Assert.False(first!.WasAbandoned);
        Assert.Null(OnOtherThread(() => { using var second = WorkLock.TryAcquire(TimeSpan.Zero, name); return second == null ? (object?)null : new object(); }));
        first.Dispose();
        Assert.NotNull(OnOtherThread(() => { using var third = WorkLock.TryAcquire(TimeSpan.Zero, name); return third == null ? (object?)null : new object(); }));
    }

    [Fact(DisplayName = "AC-017.10 다른 쪽이 쥐고 있으면 bit.input(0초)은 바로 null")]
    public void BusyImmediately()
    {
        var name = NewName();
        using var holder = new Holder(name);
        var watch = Stopwatch.StartNew();
        Assert.Null(WorkLock.TryAcquire(WorkLock.InputWait, name));
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(2));
    }

    [Fact(DisplayName = "AC-017.10 기다리는 시간을 주면 그만큼 기다린 뒤 null(store.save는 5초를 넘긴다)")]
    public void BusyAfterWait()
    {
        var name = NewName();
        using var holder = new Holder(name);
        var watch = Stopwatch.StartNew();
        Assert.Null(WorkLock.TryAcquire(TimeSpan.FromMilliseconds(400), name));
        Assert.True(watch.Elapsed >= TimeSpan.FromMilliseconds(350));
    }

    [Fact(DisplayName = "AC-017.10 기다리는 사이 놓이면 잡는다")]
    public void WaitsUntilReleased()
    {
        var name = NewName();
        var holder = new Holder(name);
        var waiter = new Thread(() =>
        {
            Thread.Sleep(200);
            holder.Dispose();
        });
        waiter.Start();
        using var acquired = WorkLock.TryAcquire(TimeSpan.FromSeconds(10), name);
        waiter.Join();
        Assert.NotNull(acquired);
    }

    [Fact(DisplayName = "AC-017.10 쥔 쪽이 놓지 않고 끝났으면(abandoned) 잡은 것으로 본다")]
    public void Abandoned()
    {
        var name = NewName();
        new Holder(name, abandon: true).Dispose();
        using var acquired = WorkLock.TryAcquire(TimeSpan.FromSeconds(5), name);
        Assert.NotNull(acquired);
        Assert.True(acquired!.WasAbandoned);
    }
}
