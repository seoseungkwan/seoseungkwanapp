using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;

namespace Precheck.Core.Tests.Input;

/// <summary>입력 시험이 같이 쓰는 가짜 자료(이름 가상환자NN, 차트번호 9로 시작하는 6자리).</summary>
internal static class Sample
{
    public const string Date = "2026-10-27";

    public static readonly HospitalRegistration Registration = Synthetic.Registration();

    public static InputItem Item(int n, string? date = null, string? memo = null, string? chart = null, string? name = null, string? visitKey = null, bool checkedByHand = false) =>
        new InputItem(
            visitKey ?? "v" + n,
            chart ?? "9000" + n.ToString("00", System.Globalization.CultureInfo.InvariantCulture),
            name ?? "가상환자" + n.ToString("00", System.Globalization.CultureInfo.InvariantCulture),
            date ?? Date,
            memo ?? "가짜 메모 " + n,
            checkedByHand);

    /// <summary>내원 수 SQL의 가짜 답: 차트번호 1~count번이 Sample.Date에 한 번씩(AC-035.1).</summary>
    public static IEnumerable<object?[]> VisitRows(int count) =>
        Enumerable.Range(1, count).Select(n => new object?[] { Item(n).Chart, Date.Replace("-", ""), 1L }).ToList();

    public static List<InputItem> Items(int count) => Enumerable.Range(1, count).Select(n => Item(n)).ToList();

    public static FingerprintResult AllFound()
    {
        var counts = new Dictionary<string, int>();
        foreach (var name in UiFingerprint.All) counts[name] = 1;
        return new FingerprintResult(counts);
    }

    public static FingerprintResult With(params (string Name, int Count)[] changes)
    {
        var counts = new Dictionary<string, int>();
        foreach (var name in UiFingerprint.All) counts[name] = 1;
        foreach (var change in changes) counts[change.Name] = change.Count;
        return new FingerprintResult(counts);
    }
}

/// <summary>
/// 가짜 비트 화면. 메모 칸(Editor)과 저장된 메모(Bit)를 따로 둔다. 진짜 창·마우스·키보드를 쓰지 않는다.
/// Calls에 부른 차례를 남기고, OnCall로 어느 부름 앞에서든 화면을 바꿔 볼 수 있다.
/// </summary>
internal sealed class FakeChartUi : IChartUi
{
    public Dictionary<string, string> Bit { get; } = new Dictionary<string, string>();
    public List<string> Calls { get; } = new List<string>();
    public List<string> Written { get; } = new List<string>();
    public Action<string, int>? OnCall { get; set; }
    public string Editor { get; set; } = "";
    public string? OpenChart { get; set; }
    public string? OpenName { get; set; }
    public string? OpenDate { get; set; }
    public string? FixedWorkDate { get; set; }
    public string? WorkDateError { get; set; }
    public ListFilter Filter { get; set; } = new ListFilter("2026-01-01", "2026-12-31", "", false, null);
    public bool Owned { get; set; } = true;
    public string? IdentityError { get; set; }
    public bool ReplaceWorks { get; set; } = true;
    public bool ValueSupported { get; set; } = true;
    public bool ValueWorks { get; set; } = true;
    public bool ValueThrows { get; set; }
    public bool SaveWorks { get; set; } = true;
    public bool Editable { get; set; } = true;
    public bool Unsaved { get; set; }
    public bool ReadFails { get; set; }
    public Action? AfterSave { get; set; }
    public Func<string, string, string, ChartOpenResult?>? OpenOverride { get; set; }

    /// <summary>진짜 OpenPatient처럼 같은 환자·같은 내원이 이미 열려 있으면 칸을 건드리지 않는다: 쓰다 멈춘 글이 칸에 그대로 남는다.</summary>
    public bool KeepsOpenVisit { get; set; }

    /// <summary>열 때 조회 모드 안내창을 눌렀다(AC-036.4·AC-036.5). 진짜 OpenPatient처럼 새로 연 때만 알린다.</summary>
    public bool OpensInViewMode { get; set; }

    public Func<int, FingerprintResult>? FingerprintAt { get; set; }
    public ChartLocate LocateResult { get; set; } = ChartLocate.Found();
    public int Disposed { get; private set; }

    public int Writes => Written.Count;
    public int Saves => Calls.Count(call => call == "save");
    public int Opens => Calls.Count(call => call == "open");

    private int Note(string call)
    {
        var number = Calls.Count(c => c == call) + 1;
        Calls.Add(call);
        OnCall?.Invoke(call, number);
        return number;
    }

    public FingerprintResult CheckFingerprint()
    {
        var number = Note("fingerprint");
        return FingerprintAt?.Invoke(number) ?? Sample.AllFound();
    }

    public bool HasUnsavedRxDialog()
    {
        Note("unsaved");
        return Unsaved;
    }

    public ChartOpenResult OpenPatient(string chart, string name, string date)
    {
        Note("open");
        var forced = OpenOverride?.Invoke(chart, name, date);
        if (forced != null) return forced;
        if (KeepsOpenVisit && chart == OpenChart && name == OpenName && date == OpenDate)
        {
            return ChartOpenResult.Opened("U차트에 이미 열려 있습니다.");
        }
        OpenChart = chart;
        OpenName = name;
        OpenDate = date;
        Editor = Bit.TryGetValue(chart, out var memo) ? memo : "";
        var opened = ChartOpenResult.Opened("U차트에서 환자를 열었습니다.");
        return OpensInViewMode ? opened.InViewMode() : opened;
    }

    public ChartLocate Locate()
    {
        Note("locate");
        return LocateResult;
    }

    public ChartRead ReadTarget()
    {
        Note("target");
        return new ChartRead(Owned, OpenChart ?? "", OpenName ?? "", IdentityError, WorkDateError != null ? null : FixedWorkDate ?? OpenDate, WorkDateError);
    }

    public ListFilter ReadListFilter()
    {
        Note("filter");
        return Filter;
    }

    public string? ReadMemo()
    {
        Note("read");
        return ReadFails ? null : Editor;
    }

    public bool IsMemoEditable()
    {
        Note("editable");
        return Editable;
    }

    public void SelectAllMemo() => Note("select");

    public void ReplaceMemoSelection(string text)
    {
        Note("replace");
        Written.Add(text);
        if (ReplaceWorks) Editor = text;
    }

    public bool IsValuePatternSupported()
    {
        Note("value?");
        return ValueSupported;
    }

    public void SetMemoValue(string text)
    {
        Note("value");
        if (ValueThrows) throw new InvalidOperationException("가짜 값 패턴 실패");
        Written.Add(text);
        if (ValueWorks) Editor = text;
    }

    public bool ClickSave()
    {
        Note("save");
        if (!SaveWorks) return false;
        if (OpenChart != null) Bit[OpenChart] = Editor;
        AfterSave?.Invoke();
        return true;
    }

    public void Dispose() => Disposed++;
}

/// <summary>가짜 확인 창. closeRequested를 받아 표준 입력이 닫혔을 때 [취소]처럼 닫히는지 볼 수 있다.</summary>
internal sealed class FakeInputConfirm : IInputConfirm
{
    public bool Answer { get; set; } = true;
    public List<(string Text, TimeSpan Timeout)> Shown { get; } = new List<(string Text, TimeSpan Timeout)>();
    public Func<Func<bool>, bool>? Behavior { get; set; }

    public bool Ask(string text, TimeSpan timeout, Func<bool> closeRequested)
    {
        Shown.Add((text, timeout));
        return Behavior != null ? Behavior(closeRequested) : Answer;
    }
}

internal sealed class FakeProgress : IInputProgress
{
    public List<(int Done, int Total)> Reports { get; } = new List<(int Done, int Total)>();
    public Action<int, int>? OnReport { get; set; }

    public void Report(int done, int total)
    {
        Reports.Add((done, total));
        OnReport?.Invoke(done, total);
    }
}

internal sealed class FakeJournal : IBatchJournal
{
    public List<(string VisitKey, JournalState State)> Marks { get; } = new List<(string VisitKey, JournalState State)>();
    public List<InputOutcome> Saved { get; } = new List<InputOutcome>();
    public Func<string, JournalState, bool>? FailWhen { get; set; }

    /// <summary>E-STORE-FAILED가 아닌 뜻밖의 예외.</summary>
    public Func<string, JournalState, bool>? ThrowWhen { get; set; }

    /// <summary>LastState가 E-STORE-FAILED를 던질 진료.</summary>
    public Func<string, bool>? ReadFailWhen { get; set; }

    /// <summary>LastState가 뜻밖의 예외를 던질 진료.</summary>
    public Func<string, bool>? ReadThrowWhen { get; set; }

    public Dictionary<string, string> Dates { get; } = new Dictionary<string, string>();

    public void Mark(InputItem item, JournalState state)
    {
        if (FailWhen != null && FailWhen(item.VisitKey, state)) throw new Precheck.Core.Bit.BitException(Precheck.Core.Bit.BitErrors.StoreFailed);
        if (ThrowWhen != null && ThrowWhen(item.VisitKey, state)) throw new InvalidOperationException("가짜 기록 실패");
        Marks.Add((item.VisitKey, state));
        Dates[item.VisitKey] = item.Date;
    }

    public JournalState? LastState(InputItem item)
    {
        if (ReadFailWhen != null && ReadFailWhen(item.VisitKey)) throw new Precheck.Core.Bit.BitException(Precheck.Core.Bit.BitErrors.StoreFailed);
        if (ReadThrowWhen != null && ReadThrowWhen(item.VisitKey)) throw new InvalidOperationException("가상환자01 비밀 글");
        return Last(item.VisitKey);
    }

    public JournalScan Scan() =>
        new JournalScan(
            Marks.Select(mark => mark.VisitKey).Distinct()
                .Where(key => Last(key) == JournalState.Writing || Last(key) == JournalState.WriteUnconfirmed)
                .Select(key => new UnconfirmedVisit(key, Dates[key]))
                .ToList(),
            new string[0]);

    public void SaveAcks(IReadOnlyList<string> hashes)
    {
    }

    public void SaveResults(InputOutcome outcome) => Saved.Add(outcome);

    public JournalState[] Of(string visitKey) => Marks.Where(mark => mark.VisitKey == visitKey).Select(mark => mark.State).ToArray();

    public JournalState? Last(string visitKey)
    {
        var states = Of(visitKey);
        return states.Length == 0 ? (JournalState?)null : states[states.Length - 1];
    }
}

/// <summary>
/// 진짜 Core/Claim/MemoCompare(TASK-16)가 오기 전의 시험용 짝. AC-016.2 그대로: 줄바꿈만 맞춰 글자 그대로,
/// 읽지 못함은 빈칸이 아니다. 빈칸은 원본 Norm처럼 공백만 있는 것도 포함한다.
/// </summary>
internal sealed class FakeMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (inBit == null) return MemoMatch.Unknown;
        if (inBit.Trim().Length == 0) return MemoMatch.Absent;
        return MemoApproval.Matches(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}

/// <summary>읽지 못함(null)도 빈칸으로 돌려주는 비교기: 뒤에 붙을 진짜 메모 비교기가 IsNullOrWhiteSpace로 빈칸을 가린다.</summary>
internal sealed class BlankIsAbsentMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (string.IsNullOrWhiteSpace(inBit)) return MemoMatch.Absent;
        return MemoApproval.Matches(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}

/// <summary>가짜들을 묶어 InputRunner를 돌린다.</summary>
internal sealed class RunnerRig
{
    public FakeChartUi Ui { get; } = new FakeChartUi();
    public FakeInputConfirm Confirm { get; } = new FakeInputConfirm();
    public FakeProgress Progress { get; } = new FakeProgress();
    public FakeJournal Journal { get; } = new FakeJournal();
    public IMemoMatcher Matcher { get; set; } = new FakeMatcher();
    public bool Stop { get; set; }

    public InputRunner Runner() => new InputRunner(Ui, Confirm, Progress, Journal, Matcher, () => Stop);

    public InputOutcome Run(IReadOnlyList<InputItem> items, string? code = null) => Runner().Run(items, Sample.Registration, code);

    public static InputResult ResultOf(InputOutcome outcome, string visitKey) => outcome.Results.Single(result => result.VisitKey == visitKey);
}
