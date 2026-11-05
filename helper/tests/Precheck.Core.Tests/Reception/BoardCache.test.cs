using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Cache 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Cache;

/// <summary>
/// 비트 읽기 캐시(BoardCache, design.md 3절, REQ-1403). 캐시는 날 줄(BoardInput)만 든다.
/// AC-1403.2 8초 안이면 다시 읽지 않고, 여러 요청이 한꺼번에 와도 읽기는 한 번.
/// AC-1403.3 요청이 없으면 읽지 않는다(타이머 없음).
/// AC-1403.4 3초 넘게 걸린 읽기 뒤에는 걸린 시간의 3배(60초까지) 동안 다시 읽지 않는다. 읽기 한 번 8초.
/// AC-1403.5 등록 없음·병원 다름·연결 실패·읽기 실패·시간 지남 → 볼 수 없음, 실패 뒤 10초 동안 다시 읽지 않음.
/// AC-1403.6 날이 바뀌면 새 날의 접수만 읽고 열쇠표가 새로 된다. AC-1403.7 이름표는 하루 한 번.
/// AC-1403.8 새로 고침(fresh): 8초 묶음만 건너뛰고, 읽는 중이면 함께 기다리고, 2초 안이면 그 결과, 3배 쉼·실패 뒤 10초는 그대로.
/// 가짜 비트(Rig)·주입한 시계·여러 작업만 쓴다. 비트 자료는 지어낸 것이다.
/// </summary>
public class BoardCacheTests
{
    private static readonly DateTime Morning = BoardFake.Morning;

    private static Rig NewRig(DateTime? today = null)
    {
        var rig = new Rig().Registered();
        rig.Today = (today ?? Morning).Date;
        BoardFake.Quiet(rig.Session);
        return rig;
    }

    private static int Reads(Rig rig) => rig.Session.Calls.Count(call => call.Sql == ReceptionSql.TodayVisits);

    private static int NameReads(Rig rig) => rig.Session.Calls.Count(call => call.Sql == ReceptionSql.RxNames);

    private static BoardResult Ok(BoardResult result)
    {
        Assert.True(result.IsOk, result.Error);
        Assert.NotNull(result.Input);
        Assert.Null(result.Error);
        return result;
    }

    private static void Unavailable(BoardResult result, string code)
    {
        Assert.False(result.IsOk);
        Assert.Null(result.Input);
        Assert.Equal(code, result.Error);
    }

    private static void SameInput(BoardResult a, BoardResult b) => Assert.Same(a.Input, b.Input);

    private static void OtherInput(BoardResult a, BoardResult b) => Assert.NotSame(a.Input, b.Input);

    /// <summary>오늘 접수 문장을 release가 열릴 때까지 붙잡는다. 동시에 몇 개 읽는지 센다.</summary>
    private sealed class Hold : IDisposable
    {
        private int inside;

        public Hold(FakeDb db)
        {
            db.Answer(ReceptionSql.TodayVisits, _ =>
            {
                var now = Interlocked.Increment(ref inside);
                lock (this) MostAtOnce = Math.Max(MostAtOnce, now);
                Started.Set();
                Release.Wait(TimeSpan.FromSeconds(5));
                Interlocked.Decrement(ref inside);
                return BoardFake.TodayRows;
            });
        }

        public ManualResetEventSlim Started { get; } = new ManualResetEventSlim();
        public ManualResetEventSlim Release { get; } = new ManualResetEventSlim();
        public int MostAtOnce { get; private set; }

        public void Dispose()
        {
            Release.Set();
        }
    }

    private static BoardResult[] All(params Task<BoardResult>[] tasks)
    {
        Assert.True(Task.WaitAll(tasks, TimeSpan.FromSeconds(8)), "요청이 끝나지 않았다");
        return tasks.Select(task => task.Result).ToArray();
    }

    // ---- AC-1403.2 8초 묶음·한 번만 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.2 마지막 읽기가 끝난 지 8초 안이면 비트를 다시 읽지 않고 같은 날 줄을 주고, 8초가 되면 다시 읽는다")]
    public void EightSecondBatch()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        var first = Ok(cache.Get());
        Assert.Equal(1, Reads(rig));
        Assert.Equal(3, first.Input!.Visits.Count);

        clock.Advance(TimeSpan.FromSeconds(7.9));
        SameInput(first, Ok(cache.Get()));
        Assert.Equal(1, Reads(rig));
        Assert.Single(rig.Connector.Opened);

        clock.Advance(TimeSpan.FromSeconds(0.1));
        var second = Ok(cache.Get());
        Assert.Equal(2, Reads(rig));
        OtherInput(first, second);
        Assert.Equal(Morning.AddSeconds(8), second.Input!.ReadAt);
    }

    [Fact(DisplayName = "AC-1403.2 여러 요청이 한꺼번에 와도 비트 읽기(등록 확인·연결 포함)는 한 번만 돌고 모두 같은 날 줄을 받는다")]
    public void ConcurrentRequestsReadOnce()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        using var hold = new Hold(rig.Session);

        var first = Task.Run(() => cache.Get());
        Assert.True(hold.Started.Wait(TimeSpan.FromSeconds(5)));
        var others = Enumerable.Range(0, 9).Select(_ => Task.Run(() => cache.Get())).ToArray();
        Thread.Sleep(200);
        hold.Release.Set();

        var results = All(others.Prepend(first).ToArray());
        Assert.All(results, result => SameInput(results[0], Ok(result)));
        Assert.Equal(1, Reads(rig));
        Assert.Single(rig.Connector.Opened);
        Assert.Equal(1, hold.MostAtOnce);
    }

    // ---- AC-1403.3 요청이 없으면 읽지 않음 ---------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.3 요청이 하나도 없으면 시간이 지나도 비트를 찾거나 열거나 읽지 않는다(타이머 없음)")]
    public void NoRequestNoRead()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        clock.Advance(TimeSpan.FromHours(1));
        Thread.Sleep(300);
        Assert.Equal(0, rig.Locator.Calls);
        Assert.Empty(rig.Connector.Opened);
        Assert.Empty(rig.Session.Calls);

        Ok(cache.Get());
        clock.Advance(TimeSpan.FromMinutes(10));
        Thread.Sleep(300);
        Assert.Equal(1, Reads(rig));
        Assert.Single(rig.Connector.Opened);
    }

    // ---- AC-1403.4 오래 걸린 읽기 뒤 쉼, 읽기 한 번 8초 ----------------------------------------------------

    [Fact(DisplayName = "AC-1403.4 4초 걸린 읽기 뒤에는 끝난 때부터 12초(3배) 동안 다시 읽지 않고 그 날 줄을 준다")]
    public void SlowReadRests()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        BoardFake.Slow(rig.Session, ReceptionSql.TodayVisits, clock, TimeSpan.FromSeconds(4));
        var cache = new BoardCache(rig.Services, clock.Now);

        var first = Ok(cache.Get());
        var end = Morning.AddSeconds(4);
        Assert.Equal(Morning, first.Input!.ReadAt);

        clock.Set(end.AddSeconds(8));
        SameInput(first, Ok(cache.Get()));
        clock.Set(end.AddSeconds(11.9));
        SameInput(first, Ok(cache.Get()));
        Assert.Equal(1, Reads(rig));

        clock.Set(end.AddSeconds(12));
        OtherInput(first, Ok(cache.Get()));
        Assert.Equal(2, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.4 3초 걸린 읽기는 쉬지 않는다(3초보다 오래일 때만): 끝난 뒤 8초면 다시 읽는다")]
    public void ThreeSecondsNoRest()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        BoardFake.Slow(rig.Session, ReceptionSql.TodayVisits, clock, TimeSpan.FromSeconds(3));
        var cache = new BoardCache(rig.Services, clock.Now);

        Ok(cache.Get());
        clock.Set(Morning.AddSeconds(3 + 8));
        Ok(cache.Get());
        Assert.Equal(2, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.4 쉼은 60초까지: 등록 확인까지 25초 걸린 읽기 뒤에는 75초가 아니라 60초 쉰다")]
    public void RestCappedAtSixty()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var gate = Quiet25(rig, clock);
        var cache = new BoardCache(rig.Services, clock.Now);

        var first = Ok(cache.Get());
        var end = Morning.AddSeconds(25);
        gate.Slow = false;

        clock.Set(end.AddSeconds(59.9));
        SameInput(first, Ok(cache.Get()));
        Assert.Equal(1, Reads(rig));

        clock.Set(end.AddSeconds(60));
        Ok(cache.Get());
        Assert.Equal(2, Reads(rig));
    }

    /// <summary>등록 확인 문장(범위)이 돌 때 시계를 25초 보낸다(Slow를 끄면 그대로).</summary>
    private static SlowGate Quiet25(Rig rig, CacheClock clock)
    {
        var gate = new SlowGate();
        rig.Session.Answer(Sql.ScopesSql, _ =>
        {
            if (gate.Slow) clock.Advance(TimeSpan.FromSeconds(25));
            return new[] { new object?[] { Synthetic.Scope } };
        });
        return gate;
    }

    private sealed class SlowGate
    {
        public volatile bool Slow = true;
    }

    [Fact(DisplayName = "AC-1403.4 읽기 한 번의 비트 문장은 모두 8초 안의 시간 제한을 받고, 8초를 넘기면 시간 지남으로 볼 수 없음, 그 뒤 3배(27초) 쉰다")]
    public void ReadTimeLimit()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        Ok(cache.Get());
        Assert.All(rig.Session.Calls.Where(call => ReceptionSql.Parameters.ContainsKey(call.Sql)),
            call => Assert.True(call.Timeout > TimeSpan.Zero && call.Timeout <= TimeSpan.FromSeconds(8)));

        clock.Advance(TimeSpan.FromSeconds(8));
        BoardFake.Slow(rig.Session, ReceptionSql.TodayVisits, clock, TimeSpan.FromSeconds(9));
        var start = clock.Now();
        Unavailable(cache.Get(), BitErrors.ReadFailed);
        Assert.Equal(2, Reads(rig));
        Assert.Equal(0, rig.Session.Calls.Skip(rig.Session.Calls.FindLastIndex(call => call.Sql == ReceptionSql.TodayVisits) + 1)
            .Count(call => ReceptionSql.Parameters.ContainsKey(call.Sql)));

        BoardFake.Quiet(rig.Session);
        clock.Set(start.AddSeconds(9 + 26.9));
        Unavailable(cache.Get(), BitErrors.ReadFailed);
        Assert.Equal(2, Reads(rig));
        clock.Set(start.AddSeconds(9 + 27));
        Ok(cache.Get());
        Assert.Equal(3, Reads(rig));
    }

    // ---- AC-1403.5 볼 수 없음·실패 뒤 10초 --------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.5 등록이 없으면 비트를 열지 않고 볼 수 없음(E-BIT-NOT-REGISTERED), 10초 안에는 다시 해 보지 않고 10초가 되면 다시 읽는다")]
    public void NotRegistered()
    {
        using var rig = new Rig();
        rig.Today = Morning.Date;
        BoardFake.Quiet(rig.Session);
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        Unavailable(cache.Get(), BitErrors.NotRegistered);
        Assert.Empty(rig.Connector.Opened);

        rig.Registered();
        clock.Advance(TimeSpan.FromSeconds(9.9));
        Unavailable(cache.Get(), BitErrors.NotRegistered);
        Assert.Empty(rig.Connector.Opened);

        clock.Advance(TimeSpan.FromSeconds(0.1));
        Ok(cache.Get());
        Assert.Single(rig.Connector.Opened);
        Assert.Equal(1, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.5 병원 다름·DB 연결 실패면 접수를 읽지 않고 볼 수 없음(그 번호), 연 세션은 닫는다")]
    public void GateFailures()
    {
        using (var rig = new Rig().Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution)))
        {
            rig.Today = Morning.Date;
            BoardFake.Quiet(rig.Session);
            var cache = new BoardCache(rig.Services, new CacheClock(Morning).Now);
            Unavailable(cache.Get(), BitErrors.HospitalMismatch);
            Assert.Equal(0, Reads(rig));
            Assert.Equal(1, rig.Session.Disposed);
        }
        using (var rig = NewRig())
        {
            rig.Connector.FailCode = BitErrors.DbFailed;
            var cache = new BoardCache(rig.Services, new CacheClock(Morning).Now);
            Unavailable(cache.Get(), BitErrors.DbFailed);
            Assert.Equal(0, Reads(rig));
        }
    }

    [Fact(DisplayName = "AC-1403.5 읽기 실패(그 번호)와 뜻밖의 예외(E-BIT-READ-FAILED)도 던지지 않고 볼 수 없음, 세션은 닫는다(되돌림)")]
    public void ReadFailures()
    {
        using (var rig = NewRig())
        {
            rig.Session.Fail(ReceptionSql.TodayRx, BitErrors.ReadFailed);
            var cache = new BoardCache(rig.Services, new CacheClock(Morning).Now);
            Unavailable(cache.Get(), BitErrors.ReadFailed);
            Assert.Equal(1, rig.Session.Disposed);
        }
        using (var rig = NewRig())
        {
            rig.Session.Answer(ReceptionSql.PriorVisits, _ => throw new InvalidOperationException("가상환자01"));
            var cache = new BoardCache(rig.Services, new CacheClock(Morning).Now);
            Unavailable(cache.Get(), BitErrors.ReadFailed);
            Assert.Equal(1, rig.Session.Disposed);
        }
    }

    [Fact(DisplayName = "AC-1403.5 실패하면 앞서 읽은 날 줄을 버린다: 실패 뒤 10초 동안은 8초 안이어도 볼 수 없음, 10초 뒤 다시 읽는다")]
    public void FailureDropsOldInput()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        Ok(cache.Get());

        clock.Advance(TimeSpan.FromSeconds(3));
        rig.Session.Fail(ReceptionSql.TodayVisits, BitErrors.ReadFailed);
        Unavailable(cache.Get(fresh: true), BitErrors.ReadFailed);
        Assert.Equal(2, Reads(rig));

        BoardFake.Quiet(rig.Session);
        clock.Advance(TimeSpan.FromSeconds(2));
        Unavailable(cache.Get(), BitErrors.ReadFailed);
        clock.Advance(TimeSpan.FromSeconds(7.9));
        Unavailable(cache.Get(), BitErrors.ReadFailed);
        Assert.Equal(2, Reads(rig));
        Assert.Equal(2, rig.Connector.Opened.Count);

        clock.Advance(TimeSpan.FromSeconds(0.1));
        Ok(cache.Get());
        Assert.Equal(3, Reads(rig));
    }

    // ---- AC-1403.6 날 바뀜 ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.6 날이 바뀌면 8초 안이어도 앞 날 줄을 주지 않고 새 날의 접수만 읽으며, 새 날의 열쇠는 앞 날 열쇠와 다르다")]
    public void NewDay()
    {
        var evening = new DateTime(2026, 11, 5, 23, 59, 58);
        using var rig = NewRig(evening);
        var clock = new CacheClock(evening);
        var cache = new BoardCache(rig.Services, clock.Now);
        var keys = new VisitKeys();

        var before = Ok(cache.Get());
        Assert.Equal("20261105", before.Input!.Day);
        var oldKey = keys.KeyOf(before.Input.Day, before.Input.Visits[0].VisitId);

        clock.Advance(TimeSpan.FromSeconds(4));
        rig.Today = clock.Now().Date;
        var after = Ok(cache.Get());
        Assert.Equal(2, Reads(rig));
        Assert.Equal("20261106", after.Input!.Day);
        Assert.Equal("202611060000", rig.Session.Calls.Last(call => call.Sql == ReceptionSql.TodayVisits).Args["@from"]);
        Assert.Equal("202611070000", rig.Session.Calls.Last(call => call.Sql == ReceptionSql.TodayVisits).Args["@to"]);

        var newKey = keys.KeyOf(after.Input.Day, after.Input.Visits[0].VisitId);
        Assert.NotEqual(oldKey, newKey);
        Assert.Null(keys.Find(after.Input.Day, oldKey));
    }

    // ---- AC-1403.7 이름표 하루 한 번 --------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.7 처방 이름표는 하루 한 번만 읽고 그날 읽기마다 같은 이름표를 쓰며, 날이 바뀌면 다시 읽는다")]
    public void NamesOncePerDay()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        var first = Ok(cache.Get());
        clock.Advance(TimeSpan.FromSeconds(8));
        var second = Ok(cache.Get());
        clock.Advance(TimeSpan.FromHours(5));
        Ok(cache.Get());
        Assert.Equal(3, Reads(rig));
        Assert.Equal(1, NameReads(rig));
        Assert.Same(first.Input!.RxNames, second.Input!.RxNames);
        Assert.Equal("체외충격파", second.Input.Visits[0].TodayRx[1].Name);

        clock.Set(new DateTime(2026, 11, 6, 9, 0, 0));
        rig.Today = clock.Now().Date;
        Ok(cache.Get());
        Assert.Equal(2, NameReads(rig));
    }

    [Fact(DisplayName = "AC-1403.7 이름표를 못 읽으면 그 읽기는 볼 수 없음이고, 다음 읽기에 이름표를 다시 읽는다")]
    public void NamesFailure()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        rig.Session.Fail(ReceptionSql.RxNames, BitErrors.ReadFailed);
        var cache = new BoardCache(rig.Services, clock.Now);

        Unavailable(cache.Get(), BitErrors.ReadFailed);
        Assert.Equal(0, Reads(rig));

        BoardFake.Quiet(rig.Session);
        clock.Advance(TimeSpan.FromSeconds(10));
        var result = Ok(cache.Get());
        Assert.Equal(2, NameReads(rig));
        Assert.Equal("도수치료 20분", result.Input!.Visits[0].TodayRx[0].Name);
    }

    // ---- AC-1403.8 새로 고침(fresh) ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.8 fresh는 8초 묶음을 건너뛰고 바로 읽으며, 그 뒤 fresh 없는 요청은 새로 읽은 줄을 받는다")]
    public void FreshSkipsBatch()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        var first = Ok(cache.Get());

        clock.Advance(TimeSpan.FromSeconds(3));
        var fresh = Ok(cache.Get(fresh: true));
        Assert.Equal(2, Reads(rig));
        OtherInput(first, fresh);
        Assert.Equal(Morning.AddSeconds(3), fresh.Input!.ReadAt);

        clock.Advance(TimeSpan.FromSeconds(0.5));
        SameInput(fresh, Ok(cache.Get()));
        Assert.Equal(2, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.8 fresh는 마지막 읽기가 끝난 지 2초 안이면 그 결과를 주고, 2초가 되면 다시 읽는다")]
    public void FreshWithinTwoSeconds()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        var first = Ok(cache.Get());

        clock.Advance(TimeSpan.FromSeconds(1.9));
        SameInput(first, Ok(cache.Get(fresh: true)));
        Assert.Equal(1, Reads(rig));

        clock.Advance(TimeSpan.FromSeconds(0.1));
        OtherInput(first, Ok(cache.Get(fresh: true)));
        Assert.Equal(2, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.8 이미 읽는 중이면 fresh도 그 읽기를 함께 기다리고, 여러 폰이 한꺼번에 눌러도 비트 읽기는 한 번에 하나다")]
    public void FreshJoinsRead()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        using var hold = new Hold(rig.Session);

        var first = Task.Run(() => cache.Get());
        Assert.True(hold.Started.Wait(TimeSpan.FromSeconds(5)));
        var presses = Enumerable.Range(0, 6).Select(_ => Task.Run(() => cache.Get(fresh: true))).ToArray();
        Thread.Sleep(200);
        hold.Release.Set();

        var results = All(presses.Prepend(first).ToArray());
        Assert.All(results, result => SameInput(results[0], Ok(result)));
        Assert.Equal(1, Reads(rig));
        Assert.Equal(1, hold.MostAtOnce);
    }

    [Fact(DisplayName = "AC-1403.8 여러 폰이 처음부터 fresh로 한꺼번에 눌러도 읽기는 하나다")]
    public void FreshStampede()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        using var hold = new Hold(rig.Session);

        var presses = Enumerable.Range(0, 8).Select(_ => Task.Run(() => cache.Get(fresh: true))).ToArray();
        Assert.True(hold.Started.Wait(TimeSpan.FromSeconds(5)));
        Thread.Sleep(200);
        hold.Release.Set();

        var results = All(presses);
        Assert.All(results, result => SameInput(results[0], Ok(result)));
        Assert.Equal(1, Reads(rig));
        Assert.Equal(1, hold.MostAtOnce);
    }

    [Fact(DisplayName = "AC-1403.8 3초 넘게 걸린 읽기 뒤의 쉼 동안 fresh는 fresh 없는 요청과 같은 답(그 날 줄)이고 읽지 않는다")]
    public void FreshKeepsSlowRest()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        BoardFake.Slow(rig.Session, ReceptionSql.TodayVisits, clock, TimeSpan.FromSeconds(4));
        var cache = new BoardCache(rig.Services, clock.Now);
        var first = Ok(cache.Get());
        var end = Morning.AddSeconds(4);

        clock.Set(end.AddSeconds(5));
        SameInput(first, Ok(cache.Get(fresh: true)));
        clock.Set(end.AddSeconds(11.9));
        SameInput(first, Ok(cache.Get(fresh: true)));
        Assert.Equal(1, Reads(rig));

        clock.Set(end.AddSeconds(12));
        OtherInput(first, Ok(cache.Get(fresh: true)));
        Assert.Equal(2, Reads(rig));
    }

    [Fact(DisplayName = "AC-1403.8 실패 뒤 10초 동안 fresh도 볼 수 없음이고 다시 해 보지 않으며, 10초가 되면 읽는다")]
    public void FreshKeepsFailureRest()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        rig.Connector.FailCode = BitErrors.DbFailed;
        var cache = new BoardCache(rig.Services, clock.Now);
        Unavailable(cache.Get(fresh: true), BitErrors.DbFailed);
        Assert.Single(rig.Connector.Opened);

        rig.Connector.FailCode = null;
        clock.Advance(TimeSpan.FromSeconds(3));
        Unavailable(cache.Get(fresh: true), BitErrors.DbFailed);
        clock.Advance(TimeSpan.FromSeconds(6.9));
        Unavailable(cache.Get(fresh: true), BitErrors.DbFailed);
        Assert.Single(rig.Connector.Opened);

        clock.Advance(TimeSpan.FromSeconds(0.1));
        Ok(cache.Get(fresh: true));
        Assert.Equal(2, rig.Connector.Opened.Count);
        Assert.Equal(1, Reads(rig));
    }
}
