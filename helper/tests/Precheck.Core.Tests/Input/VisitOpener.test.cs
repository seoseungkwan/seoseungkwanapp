using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// 여러 날 묶음에서 한 사람의 내원 찾기(AC-017.3·AC-017.5). 원본 vendor/range_bridge RangeAutomation의 줄 고리(OpenPatientRange)·기다리기(WaitOpenRange)를
/// 가짜 내원내역으로 돌린다. 내원내역 날짜는 바꾸지 않는다: 차트번호 검색 줄을 위에서부터 열어 열린 내원의 진료일(dtpWorkDate)이 맞는 줄을 찾는다.
/// 저장 안 한 처방 창은 원본 range_bridge와 달리 누르지 않고 멈춘다(명세 '범위 밖').
/// </summary>
public class VisitOpenerTests
{
    private const string Chart = "900001";
    private const string Name = "가상환자01";
    private const string Date = "2026-10-28";

    private sealed class FakeClock : IWaitClock
    {
        public long NowMs { get; private set; }

        public void Sleep(int ms) => NowMs += ms;

        public void Skip(long ms) => NowMs += ms;
    }

    /// <summary>줄마다 어떤 내원이 열리는지 정해 둔 가짜 목록. 줄을 열면 잠시 뒤 화면이 바뀐다.</summary>
    private sealed class FakeList : IVisitRowScreen
    {
        private readonly FakeClock clock;
        private long changeAt = long.MaxValue;
        private (string Chart, string Name, string Work) pending;

        public FakeList(FakeClock clock) { this.clock = clock; }

        public string ShownChart { get; set; } = "900099";
        public string ShownName { get; set; } = "가상환자99";
        public string ShownWork { get; set; } = "2026-10-01";
        public Func<int, (string Chart, string Name, string Work)?> RowOpens { get; set; } = _ => null;
        public Func<long, DialogState> Dialog { get; set; } = _ => DialogState.None;
        public Func<int, int, string?>? KeyError { get; set; }
        public bool Visible { get; set; } = true;

        /// <summary>시각마다 목록이 보이는지(크롬 창이 내려가는 동안). 없으면 Visible.</summary>
        public Func<long, bool>? VisibleAt { get; set; }

        /// <summary>목록이 보이는지 본 시각들.</summary>
        public List<long> LookedAt { get; } = new List<long>();

        public long OpenDelayMs { get; set; } = 300;
        public string? Error { get; set; }
        public List<(int Row, int Up)> Opened { get; } = new List<(int Row, int Up)>();
        public int Relocated { get; private set; }

        public DialogState ReadDialog() => Dialog(clock.NowMs);

        public ChartIdentity ReadIdentity()
        {
            Apply();
            return new ChartIdentity(ShownChart, ShownName, Error);
        }

        public string? ReadWorkDate()
        {
            Apply();
            return ShownWork;
        }

        public void Relocate() => Relocated++;

        public bool ListPointVisible()
        {
            LookedAt.Add(clock.NowMs);
            return VisibleAt != null ? VisibleAt(clock.NowMs) : Visible;
        }

        public string? OpenListRow(int row, int up)
        {
            Opened.Add((row, up));
            var error = KeyError?.Invoke(row, up);
            if (error != null) return error;
            var next = RowOpens(row);
            if (next != null)
            {
                pending = next.Value;
                changeAt = clock.NowMs + OpenDelayMs;
            }
            return null;
        }

        private void Apply()
        {
            if (clock.NowMs < changeAt) return;
            ShownChart = pending.Chart;
            ShownName = pending.Name;
            ShownWork = pending.Work;
            changeAt = long.MaxValue;
        }
    }

    private static (FakeList List, FakeClock Clock) Make()
    {
        var clock = new FakeClock();
        return (new FakeList(clock), clock);
    }

    private static ChartOpenResult Open(FakeList list, FakeClock clock, int rows, int fullyVisible = 20, FirstListWait? wait = null) =>
        VisitOpener.OpenRows(list, clock, clock.NowMs, rows, fullyVisible, Chart, Name, Date, wait);

    private const string CoveredMessage = "U차트 내원내역 목록이 다른 창에 가려져 있습니다. 목록이 보이게 해 주세요.";

    [Fact(DisplayName = "AC-036.6 첫 사람 앞에서 목록이 가려져 있으면 0.25초마다 보며 기다리고, 보이면 그때 시작한다(가짜 시계)")]
    public void WaitsForListBeforeFirstPerson()
    {
        var (list, clock) = Make();
        list.VisibleAt = now => now >= 1000;
        list.RowOpens = _ => (Chart, Name, Date);
        long openedAt = -1;
        list.KeyError = (_, __) => { openedAt = clock.NowMs; return null; };

        var result = Open(list, clock, 1, wait: new FirstListWait());

        Assert.Equal(ChartOpenKind.Opened, result.Kind);
        Assert.Equal(new long[] { 0, 250, 500, 750, 1000 }, list.LookedAt);
        Assert.Equal(1000, openedAt);
    }

    [Fact(DisplayName = "AC-036.6 3초 끝에 보이면 시작한다")]
    public void ListVisibleAtThreeSeconds()
    {
        var (list, clock) = Make();
        list.VisibleAt = now => now >= 3000;
        list.RowOpens = _ => (Chart, Name, Date);

        var result = Open(list, clock, 1, wait: new FirstListWait());

        Assert.Equal(ChartOpenKind.Opened, result.Kind);
        Assert.Equal(3000, list.LookedAt.Last());
        Assert.Single(list.Opened);
    }

    [Fact(DisplayName = "AC-036.6 3초가 지나도 가려져 있으면 지금 문구로 멈추고 키를 누르지 않는다(묶음을 멈추는 문구)")]
    public void ListStaysCovered()
    {
        var (list, clock) = Make();
        list.VisibleAt = now => now > 3000;

        var result = Open(list, clock, 1, wait: new FirstListWait());

        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal(CoveredMessage, result.Message);
        Assert.True(ChartRules.IsFatalOpenMessage(result.Message));
        Assert.Empty(list.Opened);
        Assert.Equal(3000, clock.NowMs);
        Assert.Equal(13, list.LookedAt.Count);
    }

    [Fact(DisplayName = "AC-036.6 이미 보이면 기다리지 않는다")]
    public void ListAlreadyVisible()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, Date);
        long openedAt = -1;
        list.KeyError = (_, __) => { openedAt = clock.NowMs; return null; };

        Assert.Equal(ChartOpenKind.Opened, Open(list, clock, 1, wait: new FirstListWait()).Kind);

        Assert.Equal(0, openedAt);
        Assert.Equal(new long[] { 0 }, list.LookedAt);
    }

    [Fact(DisplayName = "AC-036.6 기다리기는 묶음에 한 번이다: 둘째 사람부터 가려지면 기다리지 않고 바로 멈춘다")]
    public void WaitsOnlyOncePerBatch()
    {
        var (list, clock) = Make();
        var wait = new FirstListWait();
        list.RowOpens = _ => (Chart, Name, Date);
        Assert.Equal(ChartOpenKind.Opened, Open(list, clock, 1, wait: wait).Kind);

        list.Visible = false;
        var before = clock.NowMs;
        var second = Open(list, clock, 1, wait: wait);

        Assert.Equal(CoveredMessage, second.Message);
        Assert.Equal(before, clock.NowMs);
    }

    [Fact(DisplayName = "AC-036.6 첫 사람이라도 둘째 줄부터 가려지면 기다리지 않고 바로 멈춘다: 입력 중에 가려진 것이다")]
    public void NoWaitAfterFirstRow()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, "2026-10-27");
        list.KeyError = (_, __) => { list.Visible = false; return null; };

        var result = Open(list, clock, 3, wait: new FirstListWait());

        Assert.Equal(CoveredMessage, result.Message);
        Assert.Single(list.Opened);
        Assert.Equal(2, list.LookedAt.Count);
    }

    [Fact(DisplayName = "AC-036.6 3초 기다리기는 처음 한 번만 나온다")]
    public void FirstListWaitIsSpent()
    {
        var wait = new FirstListWait();
        Assert.Equal(3000, wait.Take());
        Assert.Equal(0, wait.Take());
        Assert.Equal(0, wait.Take());
    }

    [Fact(DisplayName = "AC-017.3 같은 환자의 다른 날 줄이 먼저 열려도 다음 줄로 가서 진료일이 맞는 줄에서 멈춘다")]
    public void WalksRowsUntilWorkDate()
    {
        var (list, clock) = Make();
        list.RowOpens = row => row == 0 ? (Chart, Name, "2026-10-27") : (Chart, Name, Date);
        var result = Open(list, clock, 3);
        Assert.Equal(ChartOpenKind.Opened, result.Kind);
        Assert.Equal("U차트에서 2026-10-28 내원을 열었습니다.", result.Message);
        Assert.Equal(new[] { 0, 1 }, list.Opened.Select(open => open.Row));
    }

    [Fact(DisplayName = "AC-017.6 줄을 다 열어도 그날 내원이 없으면 원본 문구로 건너뛴다(열린 진료일 포함, 환자 사정으로 센다)")]
    public void NoRowForDate()
    {
        var (list, clock) = Make();
        list.RowOpens = row => (Chart, Name, "2026-10-2" + (row + 1));
        var result = Open(list, clock, 2);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("검색된 2줄을 모두 열어봤지만 2026-10-28 내원이 아니었습니다 (열린 진료일: 2026-10-21, 2026-10-22). 직접 확인해 주세요.", result.Message);
        Assert.True(ChartRules.IsPatientSkip(result.Message));
        Assert.False(ChartRules.IsFatalOpenMessage(result.Message));
    }

    [Fact(DisplayName = "AC-017.6 번호가 들어간 다른 환자 줄만 있으면 그 사람을 건너뛴다(열린 내원 없음 문구)")]
    public void OnlyOtherPatients()
    {
        var (list, clock) = Make();
        list.RowOpens = row => ("90000" + (row + 5), "가상환자0" + (row + 5), Date);
        var result = Open(list, clock, 2);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("검색된 2줄을 모두 열어봤지만 이 환자의 2026-10-28 내원이 없었습니다. 직접 확인해 주세요.", result.Message);
        Assert.Equal(new[] { 0, 1 }, list.Opened.Select(open => open.Row));
    }

    [Fact(DisplayName = "AC-017.3 이미 그 내원이 열려 있던 줄은 화면이 안 바뀌어도 2.5초 뒤 열린 것으로 본다(WaitOpenRange)")]
    public void AlreadyShown()
    {
        var (list, clock) = Make();
        list.ShownChart = Chart;
        list.ShownName = Name;
        list.ShownWork = Date;
        Assert.Equal(ChartOpenKind.Opened, Open(list, clock, 1).Kind);
        Assert.InRange(clock.NowMs, 2500, 3000);
    }

    [Fact(DisplayName = "AC-017.5 저장 안 한 처방 창이 뜨면 그 자리에서 E-BIT-UNSAVED-RX 쪽으로 멈추고 다음 줄을 열지 않는다(누르지 않음)")]
    public void UnsavedStops()
    {
        var (list, clock) = Make();
        list.Dialog = now => now >= 300 ? DialogState.UnsavedRx : DialogState.None;
        var result = Open(list, clock, 3);
        Assert.Equal(ChartOpenKind.UnsavedRx, result.Kind);
        Assert.Single(list.Opened);
    }

    [Fact(DisplayName = "AC-017.3 비트의 다른 확인 창은 사람이 닫을 때까지 기다리고, 닫힌 뒤 화면이 그대로면 그 줄만 넘어가며 연달아 두 번이면 멈춘다")]
    public void DialogStuckTwice()
    {
        var (list, clock) = Make();
        // 줄마다 처음 1초 동안 확인 창이 떠 있다가 닫히고 환자는 그대로
        long openedAt = 0;
        list.KeyError = (_, __) => { openedAt = clock.NowMs; return null; };
        list.Dialog = now => now - openedAt < 1000 ? DialogState.Dialog : DialogState.None;
        var result = Open(list, clock, 5);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("환자 열기를 중단했습니다. 비트의 확인 창이나 미저장 처방을 직접 확인한 뒤 다시 실행해 주세요.", result.Message);
        Assert.True(ChartRules.IsFatalOpenMessage(result.Message));
        Assert.Equal(2, list.Opened.Count);
    }

    [Fact(DisplayName = "AC-017.3 화면이 90초 안 바뀌고 확인 창이 계속 떠 있으면 시간 지남 문구로 그 사람을 건너뛴다")]
    public void DialogNeverCloses()
    {
        var (list, clock) = Make();
        list.Dialog = _ => DialogState.Dialog;
        var result = Open(list, clock, 2);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("U차트에서 환자가 열리기를 기다리다 시간이 지났습니다.", result.Message);
        Assert.Single(list.Opened);
    }

    [Fact(DisplayName = "AC-017.5 목록이 다른 창에 가려지면 키를 누르지 않고 원본 fatal 문구로 멈춘다")]
    public void Covered()
    {
        var (list, clock) = Make();
        list.Visible = false;
        var result = Open(list, clock, 1);
        Assert.Equal("U차트 내원내역 목록이 다른 창에 가려져 있습니다. 목록이 보이게 해 주세요.", result.Message);
        Assert.True(ChartRules.IsFatalOpenMessage(result.Message));
        Assert.Empty(list.Opened);
    }

    [Fact(DisplayName = "AC-017.3 목록 초점을 잃으면 다음 줄을 열지 않고 그 문구를 돌려준다")]
    public void FocusLost()
    {
        var (list, clock) = Make();
        list.KeyError = (_, __) => "U차트 내원내역 목록에 키보드 초점을 맞추지 못해 멈췄습니다. 비트 화면을 확인해 주세요.";
        var result = Open(list, clock, 3);
        Assert.Equal("U차트 내원내역 목록에 키보드 초점을 맞추지 못해 멈췄습니다. 비트 화면을 확인해 주세요.", result.Message);
        Assert.Single(list.Opened);
    }

    [Fact(DisplayName = "AC-017.6 한 명에 150초가 넘으면 그 사람만 건너뛴다(둘째 줄부터, 환자 사정으로 센다)")]
    public void TimeLimit()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, "2026-10-27");
        list.KeyError = (_, __) => { clock.Skip(151000); return null; };
        var result = Open(list, clock, 3);
        Assert.Equal("검색된 3줄 중 1줄을 열어봤지만 시간이 오래 걸려 멈췄습니다(2026-10-28 내원 못 찾음). 입력할 날이 모두 들어가게 내원내역 시작일·종료일을 좁히거나, 이 환자만 직접 입력해 주세요.", result.Message);
        Assert.True(ChartRules.IsPatientSkip(result.Message));
        // 그 사람만 건너뛴다: 문구에 fatal 낱말(기간·날짜 등)이 들어가면 묶음 전체가 멈춘다
        Assert.False(ChartRules.IsFatalOpenMessage(result.Message));
    }

    [Fact(DisplayName = "AC-017.6 시간 초과 안내를 따르면 다음 실행이 막히지 않는다: 처방코드 칸을 채우라고 하지 않고, 입력할 날이 모두 들어가게 좁힌 시작일·종료일은 시작 전 확인을 지난다")]
    public void TimeLimitAdviceCanBeFollowed()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, "2026-10-27");
        list.KeyError = (_, __) => { clock.Skip(151000); return null; };
        var message = Open(list, clock, 3).Message;
        Assert.DoesNotContain("처방코드", message, StringComparison.Ordinal);
        Assert.Contains("입력할 날이 모두 들어가게", message, StringComparison.Ordinal);

        // 여러 날 묶음: 입력할 날이 모두 들어가면 지나고, 그보다 좁히면 시작 전에 멈춘다. 그래서 문구가 그 선을 말한다
        var items = new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: Date) };
        Assert.Null(ChartRules.ListProblem(new ListFilter("2026-10-27", Date, "", false, null), items));
        Assert.NotNull(ChartRules.ListProblem(new ListFilter(Date, Date, "", false, null), items));
        Assert.NotNull(ChartRules.ListProblem(new ListFilter("2026-10-27", Date, "LA358", false, null), items));
    }

    [Fact(DisplayName = "AC-017.6 앞자리 0만 다른 차트번호로 찾으면 그 줄을 열린 것으로 보지 않아 건너뛴다(이미 입력됨으로 보이지 않음)")]
    public void LeadingZeroDoesNotOpen()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, Date);
        var result = VisitOpener.OpenRows(list, clock, clock.NowMs, 1, 20, "0" + Chart, Name, Date);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("검색된 1줄을 모두 열어봤지만 이 환자의 2026-10-28 내원이 없었습니다. 직접 확인해 주세요.", result.Message);
    }

    [Fact(DisplayName = "AC-017.3 화면의 환자 이름이 칸과 창 제목에서 다르면(identity 오류) 차트번호·이름이 맞아 보여도 열린 것으로 보지 않는다")]
    public void IdentityErrorDoesNotOpen()
    {
        var (list, clock) = Make();
        list.RowOpens = _ => (Chart, Name, Date);
        list.Error = "U차트 화면의 환자명과 창 제목의 환자명이 다릅니다";
        var result = Open(list, clock, 1);
        Assert.Equal(ChartOpenKind.Failed, result.Kind);
        Assert.Equal("U차트에서 환자가 열리기를 기다리다 시간이 지났습니다.", result.Message);
    }

    [Fact(DisplayName = "AC-017.3 한 화면 넘는 줄을 열었으면 다음 줄은 ↑로 첫 줄까지 올린 뒤 내려간다(원본 up 값)")]
    public void ScrollsBackAfterFullScreen()
    {
        var (list, clock) = Make();
        list.RowOpens = row => (Chart, Name, "2026-09-" + (row + 10));
        Open(list, clock, 4, fullyVisible: 2);
        Assert.Equal(new[] { (0, 0), (1, 0), (2, 0), (3, 2) }, list.Opened);
    }

    [Fact(DisplayName = "AC-017.3 차트번호 칸이 잠깐 비면 칸을 다시 찾고 기다린다(WaitOpenRange)")]
    public void RelocatesWhenBlank()
    {
        var (list, clock) = Make();
        list.ShownChart = "";
        var wait = OpenWaiter.Wait(list, clock, "", "", Chart, Name, maxMs: 600);
        Assert.Equal(OpenWaitResult.Timeout, wait.Result);
        Assert.True(list.Relocated > 0);
    }
}
