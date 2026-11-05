using System;
using System.Threading;
using Precheck.Core.Contact;
using Xunit;

namespace Precheck.Core.Tests.Contact.Store;

/// <summary>
/// 진짜 이름 있는 뮤텍스로 본다. 뮤텍스는 스레드마다 다시 잡을 수 있으므로 '다른 도우미 프로세스'를 다른 스레드로 흉내 낸다.
/// 이 이름을 쓰는 시험은 이 클래스뿐이라(클래스 안은 차례로 돈다) 시험끼리 부딪히지 않는다.
/// </summary>
public class NamedWorkLockTests
{
    private static readonly TimeSpan Short = TimeSpan.FromMilliseconds(200);
    private static readonly TimeSpan Long = TimeSpan.FromSeconds(30);

    /// <summary>다른 스레드가 잠금을 잡고, 놓으라는 신호가 오면 놓는다. abandon이면 놓지 않고 끝난다.</summary>
    private sealed class OtherHelper : IDisposable
    {
        private readonly ManualResetEventSlim taken = new ManualResetEventSlim();
        private readonly ManualResetEventSlim finish = new ManualResetEventSlim();
        private readonly Thread thread;
        private Exception? failure;

        public OtherHelper(bool abandon = false)
        {
            thread = new Thread(() =>
            {
                // 스레드 밖으로 나간 예외는 시험 프로세스를 통째로 죽인다. 적어 두었다가 시험 실패로 알린다
                try
                {
                    var held = new NamedWorkLock().TryEnter(Long);
                    Held = held;
                    taken.Set();
                    finish.Wait();
                    if (!abandon) held?.Dispose();
                }
                catch (Exception e)
                {
                    failure = e;
                    taken.Set();
                }
            });
            thread.Start();
            taken.Wait();
            ThrowIfFailed();
        }

        public IDisposable? Held { get; private set; }

        public void Dispose()
        {
            finish.Set();
            thread.Join();
            taken.Dispose();
            finish.Dispose();
            ThrowIfFailed();
        }

        private void ThrowIfFailed()
        {
            if (failure != null) throw new InvalidOperationException("다른 스레드의 잠금이 실패했다", failure);
        }
    }

    [Fact(DisplayName = "AC-606.5 뮤텍스 이름은 Local\\SeoseungkwanPrecheckHelper.Work다")]
    public void NameIsExact()
    {
        Assert.Equal(@"Local\SeoseungkwanPrecheckHelper.Work", NamedWorkLock.Name);
    }

    [Fact(DisplayName = "AC-606.5 다른 쪽이 쥐고 있으면 기다린 뒤 null, 놓으면 잡는다")]
    public void HeldByOtherThenFree()
    {
        using (var other = new OtherHelper())
        {
            Assert.NotNull(other.Held);
            Assert.Null(new NamedWorkLock().TryEnter(Short));
        }

        var held = new NamedWorkLock().TryEnter(Long);
        Assert.NotNull(held);
        held!.Dispose();
        held.Dispose(); // 두 번 풀어도 던지지 않는다
    }

    [Fact(DisplayName = "AC-606.5 잡은 채 끝난 쪽의 뮤텍스(abandoned)는 잡은 것으로 본다")]
    public void AbandonedCountsAsTaken()
    {
        using (var other = new OtherHelper(abandon: true))
        {
            Assert.NotNull(other.Held);
        }

        var held = new NamedWorkLock().TryEnter(Long);
        Assert.NotNull(held);
        held!.Dispose();

        // 놓은 뒤에는 다른 쪽이 보통처럼 잡는다
        using (var other = new OtherHelper())
        {
            Assert.NotNull(other.Held);
        }
    }
}
