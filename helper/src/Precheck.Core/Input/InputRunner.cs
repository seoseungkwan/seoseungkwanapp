using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Input;

/// <summary>
/// 묶음 하나를 끝까지 돈다. 원본 mx999_v22.html runAutoRange·autoOne 고리와 vendor/range_bridge ApplyRange 차례를 도우미로 옮겼다.
/// 지문 → 묶음 검사 → PC 확인 창 → 입력 기록 읽기 → 내원내역 기간 확인 → 사람마다(열기 → 검사 → 메모 다시 읽기 → 쓰기 → 다시 읽기 → 검사 → 저장 → 다시 읽기).
/// 사람 하나의 안전한 자리는 '쓰기 전'과 '저장 뒤 다시 읽기까지'다(AC-017.9). 뜻밖의 일이면 짐작하지 않고 멈춘다.
/// 다른 메모는 덮어쓰지 않는다(AC-017.3). 예외 글은 어디에도 남기지 않는다(AC-001.6).
/// 전에 쓰다 멈춘 사람(입력 기록의 마지막이 Writing·WriteUnconfirmed)은 칸 글을 그대로 믿지 않는다. 칸이 우리 글과 같아도 저장됐는지 모르고, 다르면 쓰다 만 글일 수 있다.
/// 그 기록은 저장을 확인해야만(또는 칸이 비어 처음처럼 입력해 확인해야만) 풀린다. 그 전에는 건너뛰지 않고 묶음을 멈춘다.
/// </summary>
public sealed class InputRunner
{
    public static readonly TimeSpan ConfirmTimeout = TimeSpan.FromMinutes(5);

    public const string NotDone = "미처리";
    public const string AlreadyInput = "이미 입력됨";
    public const string AlreadyOther = "이미 있음";
    public const string Written = "입력";

    private const int MaxFailureRun = 3;

    // 원본 문구
    private const string Unexpected = "비트 입력 작업을 완료하지 못했습니다. 대상 화면과 권한을 확인해 주세요.";
    private const string WriteUnknown = "입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.";
    private const string NotEditable = "청구메모 칸이 편집할 수 없는 상태입니다.";
    private const string ChangedBefore = "입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.";
    private const string WriteNotConfirmed = "청구메모 입력을 확인하지 못해 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.";
    private const string ChangedAfter = "입력 후 U차트 화면이 바뀌어 임시저장을 누르지 않았습니다. U차트 화면을 확인해 주세요.";
    private const string SaveNotPressed = "입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.";
    private const string SaveDiffers = "임시저장을 눌렀지만 메모 칸 내용이 달라 보입니다. U차트 화면을 확인해 주세요.";

    // 이 도우미에서 더한 문구: 원본 GetText는 읽기 실패를 빈칸으로 돌려줬다
    private const string MemoUnreadable = "청구메모 칸을 읽지 못해 입력하지 않았습니다. 비트 화면을 확인해 주세요.";

    // 이 도우미에서 더한 문구: 쓰기 바로 앞 확인에서 막히면 칸에 아무것도 넣지 않았다
    private const string NothingEntered = "이 환자에게는 아무것도 입력하지 않았습니다. 입력 직전에 비트 화면이나 메모 칸이 바뀌었으니 확인한 뒤 다시 실행해 주세요.";

    // 이 도우미에서 더한 문구: 전에 쓰다 멈췄는데 칸 글이 다르다. 덮어쓰지도, 남의 메모로 보고 넘어가지도 않는다
    private const string CheckMemoBox = "이전 입력이 끝나지 않았고 메모 칸 내용이 입력할 글과 다릅니다. 이 환자의 청구메모 칸을 직접 확인해 주세요.";

    private readonly IChartUi ui;
    private readonly IInputConfirm confirm;
    private readonly IInputProgress progress;
    private readonly IInputJournal journal;
    private readonly IMemoMatcher matcher;
    private readonly Func<bool> stopRequested;

    public InputRunner(IChartUi ui, IInputConfirm confirm, IInputProgress progress, IInputJournal journal, IMemoMatcher matcher, Func<bool> stopRequested)
    {
        this.ui = ui ?? throw new ArgumentNullException(nameof(ui));
        this.confirm = confirm ?? throw new ArgumentNullException(nameof(confirm));
        this.progress = progress ?? throw new ArgumentNullException(nameof(progress));
        this.journal = journal ?? throw new ArgumentNullException(nameof(journal));
        this.matcher = matcher ?? throw new ArgumentNullException(nameof(matcher));
        this.stopRequested = stopRequested ?? throw new ArgumentNullException(nameof(stopRequested));
    }

    /// <summary>묶음을 돈다. 묶음 검사가 틀리면 HelperException(E-HELPER-BAD-MESSAGE).</summary>
    public InputOutcome Run(IReadOnlyList<InputItem> items, HospitalRegistration registration, int excluded = 0)
    {
        if (items == null) throw new ArgumentNullException(nameof(items));
        if (registration == null) throw new ArgumentNullException(nameof(registration));

        var fingerprint = ui.CheckFingerprint();
        if (!fingerprint.Ok) return new InputOutcome(InputStatus.Stopped, InputErrors.UiChanged, null, fingerprint.Problems, null);

        BatchCheck.Validate(items);

        if (stopRequested()) return InputOutcome.Cancelled();
        var answer = confirm.Ask(InputPrompt.Build(items, registration, excluded), ConfirmTimeout, stopRequested);
        if (!answer || stopRequested()) return InputOutcome.Cancelled();

        return RunConfirmed(items);
    }

    private InputOutcome RunConfirmed(IReadOnlyList<InputItem> items)
    {
        var earlierWrites = ReadEarlierWrites(items, out var stop);
        if (earlierWrites == null)
        {
            // 누가 쓰다 멈췄는지 모르니 아무도 열지 않고 기록도 남기지 않는다: 미처리로 덮으면 쓰다 멈춘 사람을 잃는다
            var unread = items.Select(item => new InputResult(item.VisitKey, InputResults.Check, NotDone)).ToList();
            return new InputOutcome(InputStatus.Stopped, stop!.Code, stop.Reason, stop.Fields, unread);
        }

        // 쓰다 멈춘 사람이 먼저다: 칸에 저장 안 된 글이 있는 채 다른 사람 줄을 열면 그 글이 다른 환자에게 들어갈 수 있다(StopAfterWrite)
        var ordered = items.OrderBy(item => earlierWrites.Contains(item.VisitKey) ? 0 : 1).ToList();
        Person PersonOf(InputItem item) => new Person { EarlierWrite = earlierWrites.Contains(item.VisitKey) };

        var results = new List<InputResult>(items.Count);
        stop = CheckListPeriod(items);
        var failureRun = 0;

        if (stop == null)
        {
            progress.Report(0, items.Count);
            foreach (var item in ordered)
            {
                if (stopRequested())
                {
                    stop = new BatchStop(InputErrors.Stopped, null);
                    break;
                }

                var person = PersonOf(item);
                var result = RunGuarded(item, person, ref stop);
                results.Add(result);
                MarkFinal(item, result, person, ref stop);
                progress.Report(results.Count, items.Count);
                if (stop != null) break;

                if (result.Result == InputResults.Done)
                {
                    failureRun = 0;
                    continue;
                }
                if (!ChartRules.IsPatientSkip(result.Reason)) failureRun++;
                if (failureRun >= MaxFailureRun && !person.Review)
                {
                    stop = new BatchStop(InputErrors.Stopped, "연속 3명 실패 — 설정 문제일 수 있어 멈췄습니다. 마지막 사유: " + result.Reason);
                    break;
                }
            }
        }

        if (stop == null) return new InputOutcome(InputStatus.Finished, null, null, null, results);

        // 멈추면 남은 사람은 '확인 필요: 미처리'(AC-017.5). 전에 쓰다 멈춘 사람은 미처리로 읽히면 안 된다: 기록을 덮으면 다음 실행에 거짓 완료가 된다
        foreach (var item in ordered.Skip(results.Count))
        {
            var person = PersonOf(item);
            var rest = new InputResult(item.VisitKey, InputResults.Check, person.Unconfirmed ? WriteUnknown : NotDone);
            results.Add(rest);
            MarkFinal(item, rest, person, ref stop);
        }
        return new InputOutcome(InputStatus.Stopped, stop!.Code, stop.Reason, stop.Fields, results);
    }

    /// <summary>묶음에서 전에 쓰기를 시작하고 저장을 확인하지 못한 진료. 입력 기록을 못 읽으면 null과 멈춤 이유: '기록 없음'으로 보지 않는다.</summary>
    private HashSet<string>? ReadEarlierWrites(IReadOnlyList<InputItem> items, out BatchStop? stop)
    {
        stop = null;
        try
        {
            var found = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in items)
            {
                var last = journal.LastState(item);
                if (last == JournalState.Writing || last == JournalState.WriteUnconfirmed) found.Add(item.VisitKey);
            }
            return found;
        }
        catch (HelperException e)
        {
            stop = new BatchStop(e.Code, null);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            stop = new BatchStop(InputErrors.Stopped, Unexpected);
        }
        return null;
    }

    private BatchStop? CheckListPeriod(IReadOnlyList<InputItem> items)
    {
        try
        {
            var problem = ChartRules.ListProblem(ui.ReadListFilter(), items);
            return problem == null ? null : new BatchStop(InputErrors.Stopped, problem);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return new BatchStop(InputErrors.Stopped, Unexpected);
        }
    }

    private InputResult RunGuarded(InputItem item, Person person, ref BatchStop? stop)
    {
        try
        {
            return RunPerson(item, person);
        }
        catch (BatchStopException e)
        {
            stop = e.Stop;
            if (e.Result != null) return e.Result;
        }
        catch (HelperException e)
        {
            // 입력 기록을 남기지 못함(E-STORE-FAILED)
            stop = new BatchStop(e.Code, null);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            stop = new BatchStop(InputErrors.Stopped, Unexpected);
        }
        if (person.Unconfirmed) return new InputResult(item.VisitKey, InputResults.Check, WriteUnknown);
        return new InputResult(item.VisitKey, InputResults.Check, stop!.Reason == null ? NotDone : NotDone + " · " + stop.Reason);
    }

    private void MarkFinal(InputItem item, InputResult result, Person person, ref BatchStop? stop)
    {
        var state = result.Result == InputResults.Done ? JournalState.Done
            : result.Result == InputResults.Skipped ? JournalState.Skipped
            : person.Unconfirmed ? JournalState.WriteUnconfirmed
            : JournalState.Check;
        try
        {
            journal.Mark(item, state);
        }
        catch (HelperException e)
        {
            stop = stop ?? new BatchStop(e.Code, null);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            stop = stop ?? new BatchStop(InputErrors.Stopped, Unexpected);
        }
    }

    private InputResult RunPerson(InputItem item, Person person)
    {
        var fingerprint = ui.CheckFingerprint();
        if (!fingerprint.Ok) throw Stop(InputErrors.UiChanged, null, fingerprint.Problems);
        if (ui.HasUnsavedRxDialog()) throw Stop(InputErrors.UnsavedRx, null);

        var opened = ui.OpenPatient(item.Chart, item.Name, item.Date);
        switch (opened.Kind)
        {
            case ChartOpenKind.UnsavedRx:
                throw Stop(InputErrors.UnsavedRx, null);
            case ChartOpenKind.UiChanged:
                throw Stop(InputErrors.UiChanged, opened.Message, opened.Fields);
            case ChartOpenKind.Failed:
                if (ChartRules.IsFatalOpenMessage(opened.Message)) throw Stop(InputErrors.Stopped, opened.Message);
                return SkipUnlessEarlierWrite(item, opened.Message, person);
        }

        var located = ui.Locate();
        if (!located.Ok)
        {
            throw located.Fields.Count > 0
                ? Stop(InputErrors.UiChanged, located.Error, located.Fields)
                : Stop(InputErrors.Stopped, located.Error);
        }

        var failure = CheckTarget(item);
        if (failure != null) return SkipUnlessEarlierWrite(item, failure, person);

        // 바로 앞에서 비트 메모 다시 읽기: 같으면 완료, 다르면 건너뜀, 덮어쓰지 않는다(AC-017.3)
        var existing = ui.ReadMemo();
        var match = matcher.Compare(item.Memo, existing);
        if (person.EarlierWrite)
        {
            if (match == MemoMatch.Same) return FinishEarlierWrite(item);
            if (match == MemoMatch.Different) throw StopAfterWrite(item, CheckMemoBox);
        }
        switch (match)
        {
            case MemoMatch.Same:
                return new InputResult(item.VisitKey, InputResults.Done, AlreadyInput);
            case MemoMatch.Different:
                person.Review = true;
                return Skip(item, AlreadyOther);
            case MemoMatch.Absent:
                break;
            default:
                throw Stop(InputErrors.Stopped, MemoUnreadable);
        }
        if (existing == null) throw Stop(InputErrors.Stopped, MemoUnreadable);

        return WriteMemo(item, existing, person);
    }

    /// <summary>
    /// 쓰기부터 저장 뒤 다시 읽기까지. existing은 쓰기 바로 앞에 칸에 있어야 할 글이다(지금은 빈칸. 개별 승인 덮어쓰기가 생기면 승인한 기존 메모).
    /// writing을 남긴 뒤로는 멈춤 신호를 보지 않는다: 시작한 사람은 끝까지 한다(AC-017.9).
    /// </summary>
    private InputResult WriteMemo(InputItem item, string existing, Person person)
    {
        if (!ui.IsMemoEditable()) return SkipUnlessEarlierWrite(item, NotEditable, person);

        var failure = CheckTarget(item);
        if (failure != null) return SkipUnlessEarlierWrite(item, failure + " (입력 직전 화면이 바뀜)", person);

        if (!MemoApproval.Matches(ui.ReadMemo(), existing))
        {
            person.Review = true;
            return SkipUnlessEarlierWrite(item, ChangedBefore, person);
        }
        if (ui.HasUnsavedRxDialog()) throw Stop(InputErrors.UnsavedRx, null);
        if (stopRequested()) throw Stop(InputErrors.Stopped, null);

        journal.Mark(item, JournalState.Writing);
        person.WriteStarted = true;

        var text = ChartRules.ToWin(item.Memo);
        switch (MemoWriter.Write(ui, text, existing, () => CheckTarget(item) == null))
        {
            case MemoWrite.NotWritten:
                if (person.EarlierWrite) throw StopAfterWrite(item, WriteUnknown);
                return Skip(item, NothingEntered);
            case MemoWrite.WrittenDifferent:
                throw StopAfterWrite(item, WriteNotConfirmed);
        }

        return SaveAndConfirm(item, text);
    }

    /// <summary>
    /// 전에 쓰다 멈췄고 칸 글이 우리 글과 같다: 저장됐는지 모르니 '이미 입력됨'으로 끝내지 않고 저장을 눌러 다시 읽는다. 다시 쓰지는 않는다.
    /// 기록은 이미 쓰다 멈춤이라 도중에 끝나도 다음 실행이 다시 여기로 온다. 시작한 사람은 끝까지 하므로 멈춤 신호를 보지 않는다(AC-017.9).
    /// </summary>
    private InputResult FinishEarlierWrite(InputItem item)
    {
        if (ui.HasUnsavedRxDialog()) throw Stop(InputErrors.UnsavedRx, null);
        return SaveAndConfirm(item, ChartRules.ToWin(item.Memo));
    }

    private InputResult SaveAndConfirm(InputItem item, string text)
    {
        if (CheckTarget(item) != null) throw StopAfterWrite(item, ChangedAfter);
        if (!ui.ClickSave()) throw StopAfterWrite(item, SaveNotPressed);
        if (!ChartRules.Same(ui.ReadMemo(), text)) throw StopAfterWrite(item, SaveDiffers);
        return new InputResult(item.VisitKey, InputResults.Done, Written);
    }

    private string? CheckTarget(InputItem item) => ChartRules.CheckFailure(ui.ReadTarget(), item.Chart, item.Name, item.Date);

    private static InputResult Skip(InputItem item, string reason) => new InputResult(item.VisitKey, InputResults.Skipped, reason);

    /// <summary>전에 쓰다 멈춘 사람은 건너뛰지 않는다: 칸을 확인하지 못한 채 다음 사람을 열면 안 되고, 건너뜀으로 적으면 쓰다 멈춘 기록을 잃는다.</summary>
    private static InputResult SkipUnlessEarlierWrite(InputItem item, string reason, Person person)
    {
        if (person.EarlierWrite) throw Stop(InputErrors.Stopped, reason);
        return Skip(item, reason);
    }

    private static BatchStopException Stop(string code, string? reason, IReadOnlyList<string>? fields = null) =>
        new BatchStopException(new BatchStop(code, reason, fields));

    /// <summary>
    /// 쓴 뒤 저장을 확인하지 못함: 우리 글이 저장 안 된 채 칸에 남았을 수 있다. 여기서 목록을 눌러 넘어가면 비트가 그 글을 저장할 때 다른 환자에게 들어갈 수 있고,
    /// 화면을 확인하라는 안내도 따를 수 없다. 그 사람은 원본 문구 그대로 확인 필요로 두고 묶음을 멈춘다.
    /// </summary>
    private static BatchStopException StopAfterWrite(InputItem item, string reason) =>
        new BatchStopException(new BatchStop(InputErrors.Stopped, reason), new InputResult(item.VisitKey, InputResults.Check, reason));

    private sealed class Person
    {
        /// <summary>입력 기록: 전 실행에서 쓰기를 시작했고 저장을 확인하지 못했다.</summary>
        public bool EarlierWrite;

        /// <summary>이번 실행에서 writing을 남겼다.</summary>
        public bool WriteStarted;

        /// <summary>원본 res.review: 기존 메모 때문에 건너뜀. 이것만으로 3번 실패 멈춤을 일으키지 않는다.</summary>
        public bool Review;

        /// <summary>확인 필요로 끝나면 우리 글이 칸에 남았을 수 있는 사람.</summary>
        public bool Unconfirmed => EarlierWrite || WriteStarted;
    }

    private sealed class BatchStop
    {
        public BatchStop(string code, string? reason, IReadOnlyList<string>? fields = null)
        {
            Code = code;
            Reason = reason;
            Fields = fields;
        }

        public string Code { get; }
        public string? Reason { get; }
        public IReadOnlyList<string>? Fields { get; }
    }

    private sealed class BatchStopException : Exception
    {
        public BatchStopException(BatchStop stop, InputResult? result = null) : base(stop.Code)
        {
            Stop = stop;
            Result = result;
        }

        public BatchStop Stop { get; }

        /// <summary>지금 사람의 결과가 이미 정해졌으면 그 결과. 없으면 RunGuarded가 정한다.</summary>
        public InputResult? Result { get; }
    }
}
