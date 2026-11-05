using System;

namespace Precheck.Core.Contact;

/// <summary>
/// 도우미 프로세스끼리 '한 번에 하나'(precheck design.md 9-4). 못 잡으면 null. 돌려받은 것을 Dispose하면 놓는다.
/// 잡은 스레드에서 놓아야 한다(뮤텍스는 스레드 것이다). 시험은 가짜를, 도우미는 NamedWorkLock을 넣는다.
/// </summary>
public interface IWorkLock
{
    IDisposable? TryEnter(TimeSpan wait);
}
