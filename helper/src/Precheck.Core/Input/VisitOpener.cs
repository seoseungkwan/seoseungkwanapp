using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

namespace Precheck.Core.Input;

public enum DialogState
{
    None,
    Dialog,
    UnsavedRx,
}

public enum OpenWaitResult
{
    Opened,
    Wrong,
    UnsavedRx,
    Timeout,
}

/// <summary>기다리기의 시계(시험은 가짜 시계로 빨리 돈다).</summary>
public interface IWaitClock
{
    long NowMs { get; }

    void Sleep(int ms);
}

public sealed class SystemWaitClock : IWaitClock
{
    private readonly Stopwatch watch = Stopwatch.StartNew();

    public long NowMs => watch.ElapsedMilliseconds;

    public void Sleep(int ms) => Thread.Sleep(ms);
}

/// <summary>내원내역 줄 열기가 보는 화면(Precheck.Windows.UChartAutomation).</summary>
public interface IVisitRowScreen
{
    /// <summary>비트의 확인 창. 저장 안 한 처방 창이 하나라도 있으면 UnsavedRx, 다른 창이 정확히 하나면 Dialog(원본 FindDialog).</summary>
    DialogState ReadDialog();

    ChartIdentity ReadIdentity();

    /// <summary>열린 내원의 진료일. 못 읽으면 null.</summary>
    string? ReadWorkDate();

    /// <summary>칸을 다시 찾는다(원본 Locate).</summary>
    void Relocate();

    /// <summary>목록 첫 줄 자리가 다른 창에 가려지지 않았는가(원본 WindowFromPoint).</summary>
    bool ListPointVisible();

    /// <summary>첫 줄을 눌러 초점을 주고 ↑ up번·↓ row번 뒤 Enter(원본 OpenListRow). 못 하면 원본 문구, 되면 null.</summary>
    string? OpenListRow(int row, int up);
}

public sealed class OpenWaitOutcome
{
    public OpenWaitOutcome(OpenWaitResult result, string? workDate, bool stuck)
    {
        Result = result;
        WorkDate = workDate;
        Stuck = stuck;
    }

    public OpenWaitResult Result { get; }
    public string? WorkDate { get; }

    /// <summary>확인 창이 닫힌 뒤에도 화면이 그대로라 이 줄은 열리지 않았다.</summary>
    public bool Stuck { get; }
}

/// <summary>
/// 원본 vendor/range_bridge RangeAutomation.WaitOpenRange. 한 군데만 다르다: 원본은 저장 안 한 처방 창의 [확인]을 눌러 넘어갔지만(한 번 열 때 3번까지),
/// 우리는 누르지 않고 멈춘다(AC-017.5, 명세 '범위 밖').
/// </summary>
public static class OpenWaiter
{
    public const int MaxWaitMs = 90000;

    public static OpenWaitOutcome Wait(IVisitRowScreen screen, IWaitClock clock, string beforeChart, string beforeWork, string expChart, string expName, int maxMs = MaxWaitMs)
    {
        if (screen == null) throw new ArgumentNullException(nameof(screen));
        if (clock == null) throw new ArgumentNullException(nameof(clock));

        var started = clock.NowMs;
        long Elapsed() => clock.NowMs - started;
        var dialogSeen = false;
        var dialogClosedAt = -1L;
        string? lastKey = null;
        var stableSince = -1L;
        var expDigits = ChartRules.Digits(expChart);

        while (Elapsed() < maxMs)
        {
            clock.Sleep(150);
            var dialog = screen.ReadDialog();
            if (dialog == DialogState.UnsavedRx) return new OpenWaitOutcome(OpenWaitResult.UnsavedRx, null, false);
            if (dialog == DialogState.Dialog)
            {
                dialogSeen = true;
                dialogClosedAt = -1L;
                continue;
            }
            if (dialogSeen && dialogClosedAt < 0) dialogClosedAt = Elapsed();

            var identity = screen.ReadIdentity();
            if (identity.Chart.Length == 0)
            {
                screen.Relocate();
                continue;
            }
            var chartDigits = ChartRules.Digits(identity.Chart);
            var work = screen.ReadWorkDate() ?? "";
            var key = chartDigits + "|" + work;
            if (!string.Equals(key, lastKey, StringComparison.Ordinal))
            {
                lastKey = key;
                stableSince = Elapsed();
            }
            var stable = Elapsed() - stableSince >= 700;
            var changed = !string.Equals(chartDigits, beforeChart, StringComparison.Ordinal) || !string.Equals(work, beforeWork, StringComparison.Ordinal);

            if (identity.Error == null && ChartRules.SamePatient(identity.Chart, identity.Name, expChart, expName) && work.Length > 0)
            {
                if (changed)
                {
                    if (stable) return new OpenWaitOutcome(OpenWaitResult.Opened, work, false);
                    continue;
                }
                // 같은 내원이 이미 열려 있던 줄: 화면이 바뀌지 않는다
                if (!dialogSeen && Elapsed() > 2500) return new OpenWaitOutcome(OpenWaitResult.Opened, work, false);
                if (dialogSeen && dialogClosedAt >= 0 && Elapsed() - dialogClosedAt > 2000) return new OpenWaitOutcome(OpenWaitResult.Opened, work, false);
                continue;
            }
            if (string.Equals(chartDigits, expDigits, StringComparison.Ordinal)) continue;

            // 다른 환자, 또는 그 환자의 다른 내원이 열려 1초 그대로면 이 줄은 아니다
            if (changed)
            {
                if (stable && Elapsed() - stableSince > 1000) return new OpenWaitOutcome(OpenWaitResult.Wrong, null, false);
            }
            else
            {
                if (dialogSeen && dialogClosedAt >= 0 && Elapsed() - dialogClosedAt > 2000) return new OpenWaitOutcome(OpenWaitResult.Wrong, null, true);
                if (!dialogSeen && Elapsed() > 4000) return new OpenWaitOutcome(OpenWaitResult.Wrong, null, false);
            }
        }
        return new OpenWaitOutcome(OpenWaitResult.Timeout, null, false);
    }
}

/// <summary>
/// [확인] 뒤 첫 사람 앞에서만 내원내역 목록이 보이기를 기다린다(AC-036.6): 확장이 첫 progress를 받아 크롬 창을 내리는 동안이다(AC-038.1).
/// 입력 중에 가려진 것은 사람이 무언가를 띄운 것이라 기다리지 않고 멈춘다. 도우미 화면 개체(묶음 하나)마다 하나를 둔다.
/// </summary>
public sealed class FirstListWait
{
    public const int MaxMs = 3000;
    public const int EveryMs = 250;

    private bool spent;

    /// <summary>처음 한 번은 기다릴 시간, 그 뒤로는 0.</summary>
    public int Take()
    {
        if (spent) return 0;
        spent = true;
        return MaxMs;
    }
}

/// <summary>
/// 원본 vendor/range_bridge RangeAutomation.OpenPatientRange의 줄 고리. 내원내역 날짜는 바꾸지 않는다: 비트 목록 칸은 읽을 수 없어,
/// 차트번호로 검색된 줄을 위에서부터 차례로 열어 환자와 진료일(dtpWorkDate)이 맞는 줄에서 멈춘다.
/// </summary>
public static class VisitOpener
{
    public const int MaxPersonMs = 150000;

    private const string Blocked = "환자 열기를 중단했습니다. 비트의 확인 창이나 미저장 처방을 직접 확인한 뒤 다시 실행해 주세요.";

    /// <param name="firstWait">묶음의 첫 사람 앞 기다리기(AC-036.6). 없으면 기다리지 않는다.</param>
    public static ChartOpenResult OpenRows(IVisitRowScreen screen, IWaitClock clock, long startedMs, int rows, int fullyVisible, string expChart, string expName, string expDate, FirstListWait? firstWait = null)
    {
        if (screen == null) throw new ArgumentNullException(nameof(screen));
        if (clock == null) throw new ArgumentNullException(nameof(clock));

        var tried = new List<string>();
        var previous = 0;
        var stuckRun = 0;
        for (var row = 0; row < rows; row++)
        {
            // 프로그램은 환자 한 명 열기를 180초까지 기다리므로, 150초가 지나면 이 환자만 건너뛴다.
            // 안내는 따랐을 때 다음 실행이 지나가야 한다(ChartRules.ListProblem): 처방코드 칸이 고른 코드와 다르거나, 시작일·종료일이 입력할 날을 다 담지 못하면 시작 전에 멈춘다.
            // '기간'·'날짜'는 쓰지 않는다: 원본 fatal 낱말이라 이 사람만이 아니라 묶음이 멈춘다(ChartRules.IsFatalOpenMessage).
            if (row > 0 && clock.NowMs - startedMs > MaxPersonMs)
            {
                return ChartOpenResult.Failed($"검색된 {rows}줄 중 {row}줄을 열어봤지만 시간이 오래 걸려 멈췄습니다({expDate} 내원 못 찾음). 입력할 날이 모두 들어가게 내원내역 시작일·종료일을 좁히거나, 이 환자만 직접 입력해 주세요.");
            }
            if (!ListVisible(screen, clock, row == 0 && firstWait != null ? firstWait.Take() : 0))
            {
                return ChartOpenResult.Failed("U차트 내원내역 목록이 다른 창에 가려져 있습니다. 목록이 보이게 해 주세요.");
            }
            var beforeChart = ChartRules.Digits(screen.ReadIdentity().Chart);
            var beforeWork = screen.ReadWorkDate() ?? "";
            var keyError = screen.OpenListRow(row, previous >= fullyVisible ? previous : 0);
            if (keyError != null) return ChartOpenResult.Failed(keyError);
            previous = row;

            var wait = OpenWaiter.Wait(screen, clock, beforeChart, beforeWork, expChart, expName);
            switch (wait.Result)
            {
                case OpenWaitResult.Opened:
                    if (string.Equals(ChartRules.Digits(wait.WorkDate), ChartRules.Digits(expDate), StringComparison.Ordinal))
                    {
                        return ChartOpenResult.Opened($"U차트에서 {expDate} 내원을 열었습니다.");
                    }
                    tried.Add(wait.WorkDate ?? "?");
                    break;
                case OpenWaitResult.UnsavedRx:
                    return ChartOpenResult.UnsavedRx(Blocked);
                case OpenWaitResult.Timeout:
                    return ChartOpenResult.Failed("U차트에서 환자가 열리기를 기다리다 시간이 지났습니다.");
            }
            // 확인 창이 닫힌 뒤에도 환자가 그대로인 줄은 넘어가되, 연달아 두 번이면 비트가 열기를 막는 것이라 멈춘다
            stuckRun = wait.Stuck ? stuckRun + 1 : 0;
            if (stuckRun >= 2) return ChartOpenResult.Failed(Blocked);
        }
        return ChartOpenResult.Failed(tried.Count == 0
            ? $"검색된 {rows}줄을 모두 열어봤지만 이 환자의 {expDate} 내원이 없었습니다. 직접 확인해 주세요."
            : $"검색된 {rows}줄을 모두 열어봤지만 {expDate} 내원이 아니었습니다 (열린 진료일: {string.Join(", ", tried)}). 직접 확인해 주세요.");
    }

    /// <summary>목록이 보이는가. waitMs가 있으면 그만큼 0.25초마다 다시 본다. 키는 누르지 않는다.</summary>
    private static bool ListVisible(IVisitRowScreen screen, IWaitClock clock, int waitMs)
    {
        var started = clock.NowMs;
        while (!screen.ListPointVisible())
        {
            if (clock.NowMs - started >= waitMs) return false;
            clock.Sleep(FirstListWait.EveryMs);
        }
        return true;
    }
}
