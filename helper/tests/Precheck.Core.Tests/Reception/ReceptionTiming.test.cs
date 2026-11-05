using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Reception.Cache;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Timing 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Timing;

/// <summary>
/// 읽기 간격 한 곳(ReceptionTiming, design.md 3절, TASK-31, 사용자 결정 2026-11-05: 10초 → 5초).
/// AC-1403.9 화면이 저절로 다시 읽는 간격(PollSeconds = 5)과 PC 묶음(CacheSeconds = 4)은 한 곳의 상수이고, CacheSeconds &lt; PollSeconds,
///   간격은 /api/board 답의 every(초)로 화면에 간다. BoardCache의 3배 쉼·실패 뒤 10초·fresh 2초는 그대로다.
/// AC-1403.2 묶음 시간(CacheSeconds) 안이면 다시 읽지 않는다. AC-1403.8 fresh는 그 묶음만 건너뛴다(2초 안이면 그 결과).
/// AC-1403.10 [의원 PC] 실제 비트 부담은 의원 PC에서 본다. 여기서는 폰 두 대가 간격마다 읽을 때 비트 읽기 횟수만 센다.
/// 가짜 비트(Rig)·주입한 시계만 쓴다. 비트 자료는 지어낸 것이다.
/// </summary>
public class ReceptionTimingTests
{
    private static readonly DateTime Morning = BoardFake.Morning;

    // 상수를 속성으로 감싸 시험 안에서는 보통 값처럼 견준다
    private static int PollSeconds => ReceptionTiming.PollSeconds;

    private static int CacheSeconds => ReceptionTiming.CacheSeconds;

    private static Rig NewRig()
    {
        var rig = new Rig().Registered();
        rig.Today = Morning.Date;
        BoardFake.Quiet(rig.Session);
        return rig;
    }

    private static int Reads(Rig rig) => rig.Session.Calls.Count(call => call.Sql == ReceptionSql.TodayVisits);

    private static BoardInput Ok(BoardResult result)
    {
        Assert.True(result.IsOk, result.Error);
        return result.Input!;
    }

    private static JsonElement EmptyBoardJson()
    {
        var none = Array.Empty<BoardRow>();
        using var document = JsonDocument.Parse(new Board("13:42:10", none, none, none, none, none, 0).ToJson());
        return document.RootElement.Clone();
    }

    // ---- AC-1403.9 간격 한 곳 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.9 읽기 간격은 ReceptionTiming 한 곳의 상수다: 화면이 저절로 다시 읽는 간격 PollSeconds = 5초, PC 묶음 CacheSeconds = 4초")]
    public void OnePlace()
    {
        Assert.Equal(5, PollSeconds);
        Assert.Equal(4, CacheSeconds);
    }

    [Fact(DisplayName = "AC-1403.9 CacheSeconds는 PollSeconds보다 작다(폰이 여럿이어도 간격마다 비트를 한 번쯤만 읽게)")]
    public void CacheShorterThanPoll()
    {
        Assert.True(CacheSeconds > 0, "묶음 시간은 0보다 크다");
        Assert.True(CacheSeconds < PollSeconds, $"CacheSeconds({CacheSeconds}) < PollSeconds({PollSeconds})");
    }

    [Fact(DisplayName = "AC-1403.9 BoardCache 묶음은 CacheSeconds초이고, 3배 쉼(3초 넘을 때·60초까지)·실패 뒤 10초·fresh 2초는 그대로다")]
    public void CacheUsesTiming()
    {
        Assert.Equal(TimeSpan.FromSeconds(CacheSeconds), BoardCache.Batch);
        Assert.Equal(TimeSpan.FromSeconds(2), BoardCache.FreshRecent);
        Assert.Equal(TimeSpan.FromSeconds(3), BoardCache.Slow);
        Assert.Equal(TimeSpan.FromSeconds(60), BoardCache.MaxRest);
        Assert.Equal(TimeSpan.FromSeconds(10), BoardCache.FailRest);
    }

    [Fact(DisplayName = "AC-1403.9 간격은 /api/board 답의 every(초, 정수)로 화면에 간다: state·at 다음 칸 every = PollSeconds (design.md 4절)")]
    public void EveryInBoardJson()
    {
        var root = EmptyBoardJson();
        Assert.Equal(new[] { "state", "at", "every", "counts", "lists" }, root.EnumerateObject().Select(p => p.Name).ToArray());
        var every = root.GetProperty("every");
        Assert.Equal(JsonValueKind.Number, every.ValueKind);
        Assert.True(every.TryGetInt32(out var seconds), "every는 정수다");
        Assert.Equal(PollSeconds, seconds);
    }

    // ---- AC-1403.2 묶음 시간 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.2 마지막 읽기가 끝난 지 묶음 시간(CacheSeconds = 4초) 안이면 비트를 다시 읽지 않고 같은 날 줄, 4초가 되면 다시 읽는다")]
    public void BatchIsCacheSeconds()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        var window = TimeSpan.FromSeconds(CacheSeconds);

        var first = Ok(cache.Get());
        clock.Advance(window - TimeSpan.FromMilliseconds(100));
        Assert.Same(first, Ok(cache.Get()));
        Assert.Equal(1, Reads(rig));

        clock.Advance(TimeSpan.FromMilliseconds(100));
        var second = Ok(cache.Get());
        Assert.NotSame(first, second);
        Assert.Equal(2, Reads(rig));
        Assert.Equal(Morning + window, second.ReadAt);
    }

    // ---- AC-1403.8 fresh는 묶음만 건너뜀 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.8 fresh는 묶음(4초)만 건너뛴다: 끝난 지 2초 안이면 그 결과, 2초부터는 묶음 안이어도 바로 읽고, 그 뒤 보통 요청은 그 줄을 묶음 동안 받는다")]
    public void FreshSkipsOnlyBatch()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);

        var first = Ok(cache.Get());
        clock.Advance(TimeSpan.FromSeconds(1.9));
        Assert.Same(first, Ok(cache.Get(fresh: true)));
        Assert.Equal(1, Reads(rig));

        clock.Advance(TimeSpan.FromSeconds(0.1));
        var fresh = Ok(cache.Get(fresh: true));
        Assert.NotSame(first, fresh);
        Assert.Equal(2, Reads(rig));

        clock.Advance(TimeSpan.FromSeconds(CacheSeconds) - TimeSpan.FromMilliseconds(100));
        Assert.Same(fresh, Ok(cache.Get()));
        Assert.Equal(2, Reads(rig));
    }

    // ---- AC-1403.10 [의원 PC] 비트 부담 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1403.10 [의원 PC] 실제 비트 부담(폰 두 대 이상·진료 시간 30분·5초 간격, 괜찮으면 3초)은 의원 PC에서 사용자가 본다. 여기서는 폰 두 대가 PollSeconds마다 30분 물어도 비트 읽기는 간격마다 한 번 이하인지 본다")]
    public void TwoPhonesHalfHour()
    {
        using var rig = NewRig();
        var clock = new CacheClock(Morning);
        var cache = new BoardCache(rig.Services, clock.Now);
        var every = TimeSpan.FromSeconds(PollSeconds);
        var half = TimeSpan.FromMinutes(30);

        // 폰 A는 0초부터, 폰 B는 반 간격 늦게 every마다 묻는다
        var asks = new List<DateTime>();
        for (var at = TimeSpan.Zero; at <= half; at += every)
        {
            asks.Add(Morning + at);
            asks.Add(Morning + at + TimeSpan.FromTicks(every.Ticks / 2));
        }
        foreach (var at in asks.OrderBy(at => at))
        {
            clock.Set(at);
            Ok(cache.Get());
        }

        var most = (int)(half.Ticks / every.Ticks) + 1;
        Assert.True(Reads(rig) <= most, $"30분 동안 비트 읽기 {Reads(rig)}번 > 간격마다 한 번({most}번)");
        Assert.True(Reads(rig) * 2 <= asks.Count + 1, "폰 두 대의 물음은 비트 읽기를 나눠 쓴다");
    }
}
