using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Input;

/// <summary>
/// 묶음 하나를 끝까지 돈다. 원본 mx999_v22.html runAutoRange·autoOne 고리와 vendor/range_bridge ApplyRange 차례를 도우미로 옮겼다.
/// 지문 → 묶음 검사 → PC 확인 창(묻지 않기가 켜져 있으면 물을 일이 있는 묶음만) → 해시 저장 → 입력 기록 읽기 → 풀 사람 기록 → 내원내역 기간 확인 → 사람마다(열기 → 검사 → 메모 다시 읽기 → 쓰기 → 다시 읽기 → 검사 → 저장 → 다시 읽기).
/// 사람 하나의 안전한 자리는 '쓰기 전'과 '저장 뒤 다시 읽기까지'다(AC-017.9). 뜻밖의 일이면 짐작하지 않고 멈춘다.
/// 다른 메모는 사람이 승인했거나(item.Replaces) 묶음을 시작할 때 묻지 않기가 켜져 있을 때만 바꾼다(design.md 19-6 표). 바꾸는 사람은 원래 메모가 디스크에 남은 뒤에야 writing을 남기고 칸에 쓴다(AC-037.1).
/// 예외 글은 어디에도 남기지 않는다(AC-001.6).
/// 전에 쓰다 멈춘 사람(입력 기록의 마지막이 Writing·WriteUnconfirmed)은 칸 글을 그대로 믿지 않는다. 칸이 우리 글과 같아도 저장됐는지 모르고, 다르면 쓰다 만 글일 수 있다.
/// 그 기록은 저장을 확인해야만(또는 칸이 비어 처음처럼 입력해 확인해야만) 풀린다. 그 전에는 건너뛰지 않고 묶음을 멈춘다.
/// 또 하나의 푸는 길이 직접 확인(item.CheckedByHand, AC-035.5)이다. [확인] 뒤 그 사람은 쓰다 멈춘 사람으로 보지 않고 비교대로 하되, 완료로 끝나지도 칸에 글을 남기지도 않으면 SkippedByHand를 남긴다.
/// 빠질 자리의 그런 사람(풀 사람, AC-035.8)은 줄을 열지도 쓰지도 않고 [확인] 뒤 SkippedByHand만 남긴다.
/// 조회 모드 안내창을 눌러 연 진료(AC-036.5)는 칸이 입력을 받지 않아도 아무것도 쓰이지 않은 것이라 그 사람만 확인 필요로 두고 다음 사람으로 간다. 쓰다 멈춘 사람이면 저장 안 된 글이 남았을 수 있어 멈춘다.
/// 저장 안 한 처방 창(AC-017.12)은 [확인] 뒤 사람 시작·쓰기 직전·열기를 기다리는 동안(VisitOpener)에만 누른다. PC 확인 창 앞과 [취소] 뒤에는 누르지 않고, 쓰다 멈춘 사람(직접 확인·풀어 준 사람 포함)의 차례와 같은 묶음의 그 뒷사람 차례에는 어디서도 누르지 않는다.
/// </summary>
public sealed class InputRunner
{
    public static readonly TimeSpan ConfirmTimeout = TimeSpan.FromMinutes(5);

    public const string NotDone = "미처리";
    public const string AlreadyInput = "이미 입력됨";
    public const string AlreadyOther = "이미 있음";
    public const string Written = "입력";
    public const string ReplacedOther = "바꿈(기존 메모 덮어씀)";

    private const int MaxFailureRun = 3;

    // 원본 문구
    internal const string Unexpected = "비트 입력 작업을 완료하지 못했습니다. 대상 화면과 권한을 확인해 주세요.";
    internal const string WriteUnknown = "입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.";
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

    // 이 도우미에서 더한 문구: 확인할 수 없는 기록을 묻는 창에서 [확인]을 받지 못했다(AC-035.9)
    private const string RecordsNotConfirmed = "입력 기록의 일부를 확인할 수 없어 아무도 열지 않았습니다. 비트에 열려 있는 환자의 메모 칸을 확인한 뒤 다시 눌러 주세요.";

    // 이 도우미에서 더한 문구: 전에 쓰다 멈췄는데 칸 글이 다르다. 덮어쓰지도, 남의 메모로 보고 넘어가지도 않는다
    private const string CheckMemoBox = "이전 입력이 끝나지 않았고 메모 칸 내용이 입력할 글과 다릅니다. 이 환자의 청구메모 칸을 직접 확인해 주세요.";

    // 이 도우미에서 더한 문구: 깨진 달 파일의 이름만 바꿔 아무도 열지 않았다. 번호의 일반 문구만으로는 다시 누르면 된다는 것을 알 수 없다(AC-035.9)
    private const string RecordSetAside = "그 달의 입력 기록 파일을 읽지 못해 따로 치워 두었습니다. 아무도 열지 않았으니 다시 눌러 이어서 해 주세요.";

    // 이 도우미에서 더한 문구: 조회 모드로 열린 진료의 칸이 글을 받지 않았다(AC-036.5)
    private const string NotAccepted = "메모 칸이 입력을 받지 않아 입력하지 못했습니다";

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

    /// <summary>묶음을 돈다. 묶음이나 고른 처방코드 검사가 틀리면 HelperException(E-HELPER-BAD-MESSAGE).</summary>
    public InputOutcome Run(IReadOnlyList<InputItem> items, HospitalRegistration registration, string? code = null)
    {
        if (items == null) throw new ArgumentNullException(nameof(items));
        return Run(InputBatch.Plain(items, code), registration);
    }

    /// <summary>처리기가 다듬은 묶음을 돈다: 열 사람, 미리 뺀 사람, 풀 사람, 묻는 글. 미리 뺀 사람의 줄은 어떻게 끝났는지에 따라 여기서 더한다.</summary>
    internal InputOutcome Run(InputBatch batch, HospitalRegistration registration, NoAskSwitch? noAsk = null)
    {
        if (batch == null) throw new ArgumentNullException(nameof(batch));
        if (registration == null) throw new ArgumentNullException(nameof(registration));
        var items = batch.Remaining;

        // 묶음을 시작할 때의 값이다: 이 묶음의 창에서 막 켠 체크는 다음 묶음부터 친다(AC-037.6)
        var noAskOn = noAsk != null && noAsk.IsOn;

        var fingerprint = ui.CheckFingerprint();
        if (!fingerprint.Ok) return batch.WithExcluded(new InputOutcome(InputStatus.Stopped, InputErrors.UiChanged, null, fingerprint.Problems, null));

        // 풀 사람만 있으면 빈 묶음이라 이 검사에 들어가지 않는다(받은 그대로의 검사는 처리기 맨 앞에서 끝났다)
        if (items.Count > 0 || batch.Released.Count == 0) BatchCheck.Validate(items);
        BatchCheck.ValidateCode(batch.Code);

        if (stopRequested()) return NotConfirmed(batch);
        if (!noAskOn || batch.MustAsk)
        {
            var text = InputPrompt.Build(items, registration, batch.Excluded.Count, batch.Released.Count, batch.AckRecords != null, batch.Code, noAskOn);
            var answer = confirm.Ask(text, noAskOn, ConfirmTimeout, stopRequested, out var ticked);
            if (!answer || stopRequested()) return NotConfirmed(batch);
            if (ticked) noAsk?.TurnOn();
        }

        return RunConfirmed(batch, noAskOn);
    }

    /// <summary>[확인]을 받지 못함: 아무것도 하지 않은 것이라 기록도 결과도 없다(AC-017.2). 확인할 수 없는 기록을 묻던 창이면 cancelled가 아니라 stopped다(AC-035.9).</summary>
    private static InputOutcome NotConfirmed(InputBatch batch) =>
        batch.AckRecords == null
            ? InputOutcome.Cancelled()
            : new InputOutcome(InputStatus.Stopped, InputErrors.Stopped, RecordsNotConfirmed, null, null);

    /// <summary>
    /// [확인] 뒤의 차례는 여기 한 곳에서 정한다(AC-035.8·AC-035.9): 해시 저장 → 입력 기록 읽기 → 풀 사람 Mark → 내원내역 칸 확인 → 사람마다.
    /// 앞의 둘에서 막히면 아무 기록도 남기지 않는다. Mark가 읽기보다 먼저면 읽지 못한 묶음도 풀려 AC-035.5의 '그대로'에 어긋난다.
    /// </summary>
    private InputOutcome RunConfirmed(InputBatch batch, bool noAskOn)
    {
        var items = batch.Remaining;

        var stop = SaveRecordAcks(batch);
        if (stop != null) return LeaveRecords(batch, stop);

        // 묶음의 진료 전부를 읽는다: 미리 뺀 사람의 달을 못 읽어도 끝의 SaveResults가 아니라 여기서, 아무도 열기 전에 멈춘다(AC-035.9)
        var everyone = items.Concat(batch.Released.Select(person => person.Item)).Concat(batch.Excluded).ToList();
        var earlier = ReadEarlierWrites(everyone, out stop);
        if (earlier == null) return LeaveRecords(batch, stop!);

        var released = Release(batch, ref stop);
        if (items.Count == 0 && stop == null) return batch.WithExcludedConfirmed(new InputOutcome(InputStatus.Finished, null, null, null, released));

        // 쓰다 멈춘 사람이 먼저다: 칸에 저장 안 된 글이 있는 채 다른 사람 줄을 열면 그 글이 다른 환자에게 들어갈 수 있다(StopAfterWrite)
        var ordered = items.OrderBy(item => earlier.Writes.Contains(item.VisitKey) || earlier.HandStuck.Contains(item.VisitKey) ? 0 : 1).ToList();
        Person PersonOf(InputItem item) => new Person
        {
            EarlierWrite = earlier.Writes.Contains(item.VisitKey),
            HandStuck = earlier.HandStuck.Contains(item.VisitKey),
            HandRecord = earlier.ByHand.Contains(item.VisitKey),
            CheckedByHand = item.CheckedByHand,
            NoAsk = noAskOn,
        };

        var results = new List<InputResult>(items.Count);
        stop = stop ?? CheckListPeriod(items, batch.Code);
        var failureRun = 0;

        // 풀어 준 사람의 칸에도 저장 안 된 글이 남았을 수 있다. 쓰다 멈춘 사람의 차례가 오면 그 뒤로 이 묶음에서는 누르지 않는다(AC-017.12)
        var afterStuck = batch.Released.Any(person => earlier.HandStuck.Contains(person.Item.VisitKey));

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
                person.AfterStuck = afterStuck;
                afterStuck = person.NoRxPress;
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
                // 승인한 뒤 누가 메모를 고친 것은 설정 문제가 아니다: 3번 잇따른 실패에 세지 않는다(AC-037.2)
                if (!ChartRules.IsPatientSkip(result.Reason) && !string.Equals(result.Reason, ChangedBefore, StringComparison.Ordinal)) failureRun++;
                if (failureRun >= MaxFailureRun && !person.Review)
                {
                    stop = new BatchStop(InputErrors.Stopped, "연속 3명 실패 — 설정 문제일 수 있어 멈췄습니다. 마지막 사유: " + result.Reason);
                    break;
                }
            }
        }

        if (stop == null) return batch.WithExcludedConfirmed(new InputOutcome(InputStatus.Finished, null, null, null, released.Concat(results).ToList()));

        // 멈추면 남은 사람은 '확인 필요: 미처리'(AC-017.5). 전에 쓰다 멈춘 사람은 미처리로 읽히면 안 된다: 기록을 덮으면 다음 실행에 거짓 완료가 된다
        foreach (var item in ordered.Skip(results.Count))
        {
            var person = PersonOf(item);
            var rest = new InputResult(item.VisitKey, InputResults.Check, person.Unconfirmed ? WriteUnknown : NotDone);
            results.Add(rest);
            MarkFinal(item, rest, person, ref stop);
        }
        return batch.WithExcludedConfirmed(new InputOutcome(InputStatus.Stopped, stop!.Code, stop.Reason, stop.Fields, released.Concat(results).ToList()));
    }

    private static BatchStop? SaveRecordAcks(InputBatch batch)
    {
        if (batch.AckRecords == null) return null;
        try
        {
            batch.AckRecords();
            return null;
        }
        catch (HelperException e)
        {
            return new BatchStop(e.Code, null);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return new BatchStop(InputErrors.Stopped, Unexpected);
        }
    }

    /// <summary>해시를 못 남겼거나 누가 쓰다 멈췄는지 몰라 아무도 열지 않고 멈춘다: 기록은 그대로이고 결과 줄만 있다. 미처리로 덮으면 쓰다 멈춘 사람을 잃고, 미리 뺀 사람에게 skipped를 적어도 안 된다(AC-035.5). 풀 사람의 줄은 없다.</summary>
    private static InputOutcome LeaveRecords(InputBatch batch, BatchStop stop)
    {
        var unread = batch.Remaining.Select(item => new InputResult(item.VisitKey, InputResults.Check, NotDone)).ToList();
        return batch.WithExcludedLines(new InputOutcome(InputStatus.Stopped, stop.Code, stop.Reason, stop.Fields, unread));
    }

    /// <summary>
    /// 풀 사람마다 SkippedByHand를 남기고, 남긴 뒤에만 줄을 넣는다(AC-035.8). 못 남기면 거기서 멈춘다: 풀리지 않은 사람에게 줄이 있으면 건너뜀으로 끝난 것처럼 보인다.
    /// 쓰다 멈추지 않았는데 미리 빠진 checkedByHand 사람도 같은 자리에서 남긴다(AC-035.5): skipped로 두면 다음 묻지 않기가 승인 없이 바꾼다. 이 사람의 줄은 WithExcludedConfirmed가 더한다.
    /// </summary>
    private List<InputResult> Release(InputBatch batch, ref BatchStop? stop)
    {
        var lines = new List<InputResult>(batch.Released.Count);
        foreach (var person in batch.Released)
        {
            stop = MarkByHand(person.Item);
            if (stop != null) return lines;
            lines.Add(person.Line);
        }
        foreach (var item in batch.Excluded.Where(person => person.CheckedByHand))
        {
            stop = MarkByHand(item);
            if (stop != null) return lines;
        }
        return lines;
    }

    private BatchStop? MarkByHand(InputItem item)
    {
        try
        {
            journal.Mark(item, JournalState.SkippedByHand);
            return null;
        }
        catch (HelperException e)
        {
            return new BatchStop(e.Code, null);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return new BatchStop(InputErrors.Stopped, Unexpected);
        }
    }

    /// <summary>묶음의 앞선 기록을 읽는다. 입력 기록을 못 읽으면 null과 멈춤 이유: '기록 없음'으로 보지 않는다. 깨진 달 파일을 치웠을 뿐이면 다시 누르라는 글을 싣는다(AC-035.9).</summary>
    private EarlierRecords? ReadEarlierWrites(IReadOnlyList<InputItem> items, out BatchStop? stop)
    {
        stop = null;
        try
        {
            var found = new EarlierRecords();
            foreach (var item in items)
            {
                var last = journal.LastState(item);
                if (last == JournalState.Writing || last == JournalState.WriteUnconfirmed) (item.CheckedByHand ? found.HandStuck : found.Writes).Add(item.VisitKey);
                if (last == JournalState.SkippedByHand) found.ByHand.Add(item.VisitKey);
            }
            return found;
        }
        catch (RecordSetAsideException e)
        {
            stop = new BatchStop(e.Code, RecordSetAside);
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

    private BatchStop? CheckListPeriod(IReadOnlyList<InputItem> items, string? code)
    {
        try
        {
            var problem = ChartRules.ListProblem(ui.ReadListFilter(), items, code);
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
        try
        {
            journal.Mark(item, FinalState(result, person));
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

    /// <summary>
    /// 사람 하나의 마지막 기록. 직접 확인으로 왔거나 직접 확인 기록이 남은 사람은 어떤 까닭이든 완료가 아니면 SkippedByHand다(결과 글은 그대로): Skipped·Check로 두면 다음 묶음의 묻지 않기가
    /// 직원이 다루던 칸을 승인 없이 바꾼다. 쓰기를 시작해 칸에 글이 남았을 수 있을 때만 WriteUnconfirmed다(AC-035.5·AC-037.6).
    /// </summary>
    private static JournalState FinalState(InputResult result, Person person)
    {
        if (result.Result == InputResults.Done) return JournalState.Done;
        if (person.ByHand) return person.WriteStarted && !person.NothingLeft ? JournalState.WriteUnconfirmed : JournalState.SkippedByHand;
        if (result.Result == InputResults.Skipped) return JournalState.Skipped;
        return person.Unconfirmed ? JournalState.WriteUnconfirmed : JournalState.Check;
    }

    private InputResult RunPerson(InputItem item, Person person)
    {
        var fingerprint = ui.CheckFingerprint();
        if (!fingerprint.Ok) throw Stop(InputErrors.UiChanged, null, fingerprint.Problems);

        var presses = 0;
        while (PressUnsavedRx(person, ref presses))
        {
            // 또 떠 있으면 이 자리에서 다시 누른다. 넷째로 보이면 PressUnsavedRx가 멈춘다
        }

        var opened = ui.OpenPatient(item.Chart, item.Name, item.Date, !person.NoRxPress);
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
        person.ViewMode = opened.ViewMode;

        LocateOrStop();

        var failure = CheckTarget(item);
        if (failure != null) return SkipUnlessEarlierWrite(item, failure, person);

        // 바로 앞에서 비트 메모 다시 읽기: 같으면 완료, 비었으면 입력, 다르면 design.md 19-6 표대로(AC-017.3·AC-037.1·AC-037.6)
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
                if (existing == null) throw Stop(InputErrors.Stopped, MemoUnreadable);
                var refused = WhyNotReplace(item, existing, person);
                if (refused != null)
                {
                    person.Review = true;
                    return Skip(item, refused);
                }
                person.Replacing = true;
                break;
            case MemoMatch.Absent:
                break;
            default:
                throw Stop(InputErrors.Stopped, MemoUnreadable);
        }
        if (existing == null) throw Stop(InputErrors.Stopped, MemoUnreadable);

        return WriteMemo(item, existing, person);
    }

    /// <summary>
    /// 칸에 다른 메모가 있을 때 바꾸지 않는 까닭(design.md 19-6 표). 바꿔도 되면 null이다. 차례가 곧 우선순위다: 직접 확인으로 온 사람은 replaces가 함께 와도 바꾸지 않고(AC-035.5),
    /// 승인이 있으면 칸 글이 그 글일 때만 바꾸며(AC-037.1·AC-037.2), 승인이 없으면 묶음 시작 때 묻지 않기가 켜져 있고 직접 확인 기록이 없을 때만 바꾼다(AC-037.6).
    /// </summary>
    private static string? WhyNotReplace(InputItem item, string existing, Person person)
    {
        if (person.CheckedByHand) return AlreadyOther;
        if (item.Replaces != null) return MemoApproval.Matches(existing, item.Replaces) ? null : ChangedBefore;
        return person.NoAsk && !person.HandRecord ? null : AlreadyOther;
    }

    /// <summary>
    /// 쓰기부터 저장 뒤 다시 읽기까지. existing은 쓰기 바로 앞에 칸에 있어야 할 글이다(빈칸, 또는 바꾸는 사람이면 원래 메모).
    /// 바꾸는 사람은 원래 메모를 먼저 달 파일에 남긴다(AC-037.1): 못 남기면 번호 있는 예외로 멈추고 writing도 쓰기도 없다.
    /// writing을 남긴 뒤로는 멈춤 신호를 보지 않는다: 시작한 사람은 끝까지 한다(AC-017.9).
    /// 쓰기 바로 앞에 저장 안 한 처방 창을 눌렀으면 칸을 다시 찾아 아래 확인을 처음부터 다시 한다(AC-017.12): 옛 환자로 확인을 통과한 뒤 화면이 바뀌면 메모가 다른 환자에게 간다.
    /// </summary>
    private InputResult WriteMemo(InputItem item, string existing, Person person)
    {
        var presses = 0;
        for (;;)
        {
            if (!ui.IsMemoEditable())
            {
                if (!person.ViewMode) return SkipUnlessEarlierWrite(item, NotEditable, person);
                if (person.EarlierWrite) throw StopAfterWrite(item, WriteUnknown);
                return new InputResult(item.VisitKey, InputResults.Check, NotAccepted);
            }

            var failure = CheckTarget(item);
            if (failure != null) return SkipUnlessEarlierWrite(item, failure + " (입력 직전 화면이 바뀜)", person);

            var current = ui.ReadMemo();
            if (current == null) throw Stop(InputErrors.Stopped, MemoUnreadable);
            if (!MemoApproval.Matches(current, existing))
            {
                person.Review = true;
                return SkipUnlessEarlierWrite(item, ChangedBefore, person);
            }
            if (!PressUnsavedRx(person, ref presses)) break;
            LocateOrStop();
        }
        if (stopRequested()) throw Stop(InputErrors.Stopped, null);

        if (person.Replacing) journal.SaveOriginal(item, existing);
        journal.Mark(item, JournalState.Writing);
        person.WriteStarted = true;

        var text = ChartRules.ToWin(item.Memo);
        switch (MemoWriter.Write(ui, text, existing, () => CheckTarget(item) == null))
        {
            case MemoWrite.NotWritten:
                if (person.EarlierWrite) throw StopAfterWrite(item, WriteUnknown);
                person.NothingLeft = true;
                // 칸을 못 읽어 막힌 것이면 '바뀜'으로 보고 다음 사람을 열지 않는다(AC-037.2·AC-037.6)
                if (ui.ReadMemo() == null) throw Stop(InputErrors.Stopped, MemoUnreadable);
                return Skip(item, NothingEntered);
            case MemoWrite.WrittenDifferent:
                // 다시 읽어 쓰기 전과 같으면 칸에 우리 글이 남지 않았다. 못 읽으면 같음으로 치지 않는다(AC-035.5·AC-036.5)
                if ((person.ByHand || person.ViewMode) && MemoApproval.Matches(ui.ReadMemo(), existing)) person.NothingLeft = true;
                // 조회 모드로 열려 아무것도 쓰이지 않았으면 그 사람만 확인 필요다. 쓰다 멈춘 사람은 전에 남은 글을 모르니 멈춘다(AC-036.5)
                if (person.ViewMode && person.NothingLeft && !person.EarlierWrite) return new InputResult(item.VisitKey, InputResults.Check, NotAccepted);
                throw StopAfterWrite(item, WriteNotConfirmed);
        }

        var saved = SaveAndConfirm(item, text);
        return person.Replacing ? new InputResult(item.VisitKey, InputResults.Done, ReplacedOther, existing) : saved;
    }

    /// <summary>
    /// 전에 쓰다 멈췄고 칸 글이 우리 글과 같다: 저장됐는지 모르니 '이미 입력됨'으로 끝내지 않고 저장을 눌러 다시 읽는다. 다시 쓰지는 않는다.
    /// 기록은 이미 쓰다 멈춤이라 도중에 끝나도 다음 실행이 다시 여기로 온다. 시작한 사람은 끝까지 하므로 멈춤 신호를 보지 않는다(AC-017.9).
    /// 칸이 편집 불가면 저장을 눌러도 저장됐다고 볼 수 없어 누르지 않고 멈춘다(AC-036.5). 조회 모드 표시를 함께 보지 않는다:
    /// 조회 모드로 멈춘 뒤 다시 실행하면 내원이 이미 열려 있어 안내창이 없고 표시도 없다.
    /// 바꾸다 멈춘 사람이면 남겨 둔 원래 메모를 결과에 준다(AC-037.1). 저장을 누르기 전에 읽는다: 못 읽으면 기록이 쓰다 멈춤 그대로 남는다.
    /// </summary>
    private InputResult FinishEarlierWrite(InputItem item)
    {
        if (!ui.IsMemoEditable()) throw StopAfterWrite(item, WriteUnknown);
        if (ui.HasUnsavedRxDialog()) throw Stop(InputErrors.UnsavedRx, null);
        var original = journal.LastOriginal(item);
        var saved = SaveAndConfirm(item, ChartRules.ToWin(item.Memo));
        return original == null ? saved : new InputResult(item.VisitKey, InputResults.Done, ReplacedOther, original);
    }

    private InputResult SaveAndConfirm(InputItem item, string text)
    {
        if (CheckTarget(item) != null) throw StopAfterWrite(item, ChangedAfter);
        if (!ui.ClickSave()) throw StopAfterWrite(item, SaveNotPressed);
        if (!ChartRules.Same(ui.ReadMemo(), text)) throw StopAfterWrite(item, SaveDiffers);
        return new InputResult(item.VisitKey, InputResults.Done, Written);
    }

    /// <summary>
    /// 저장 안 한 처방 창이 떠 있으면 [확인]을 눌렀다고 true, 창이 없으면 false(AC-017.12). 누른 뒤의 기다림은 UChartAutomation에 있다: 여기에는 시계가 없다.
    /// 쓰다 멈춘 사람(직접 확인·풀어 준 사람 포함)과 같은 묶음의 그 뒷사람은 누르지 않고 멈춘다: 넘어가면 칸에 남은 저장 안 된 글이 다른 환자에게 가거나 사라질 수 있다. [멈추기]를 먼저 본다: 직원이 멈춘 뒤에 쓰던 처방이 넘어가지 않게 한다.
    /// presses는 자리마다 새로 센다. 넷째로 보이거나 [확인] 단추가 없으면 멈춘다.
    /// </summary>
    private bool PressUnsavedRx(Person person, ref int presses)
    {
        if (!ui.HasUnsavedRxDialog()) return false;
        if (person.NoRxPress) throw Stop(InputErrors.UnsavedRx, null);
        if (stopRequested()) throw Stop(InputErrors.Stopped, null);
        if (presses >= OpenWaiter.MaxUnsavedRxPresses || !ui.PressUnsavedRxOk()) throw Stop(InputErrors.UnsavedRx, null);
        presses++;
        return true;
    }

    private void LocateOrStop()
    {
        var located = ui.Locate();
        if (located.Ok) return;
        throw located.Fields.Count > 0
            ? Stop(InputErrors.UiChanged, located.Error, located.Fields)
            : Stop(InputErrors.Stopped, located.Error);
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

    /// <summary>묶음 앞에 읽은 입력 기록: 쓰다 멈춘 진료(직접 확인으로 온 사람은 빼고), 직접 확인으로 온 쓰다 멈춘 진료(풀 사람 포함), 마지막이 SkippedByHand인 진료.</summary>
    private sealed class EarlierRecords
    {
        public HashSet<string> Writes { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> HandStuck { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> ByHand { get; } = new HashSet<string>(StringComparer.Ordinal);
    }

    private sealed class Person
    {
        /// <summary>입력 기록: 전 실행에서 쓰기를 시작했고 저장을 확인하지 못했다.</summary>
        public bool EarlierWrite;

        /// <summary>직접 확인으로 왔지만 입력 기록의 마지막이 Writing·WriteUnconfirmed다. AC-035.5대로 쓰다 멈춘 사람으로 보지 않되 저장 안 한 처방 창은 누르지 않는다(AC-017.12).</summary>
        public bool HandStuck;

        /// <summary>같은 묶음의 앞사람이 쓰다 멈춘 사람이었다(풀어 준 사람 포함): 칸에 저장 안 된 글이 남았을 수 있다(AC-017.12).</summary>
        public bool AfterStuck;

        /// <summary>저장 안 한 처방 창을 누르지 않고 멈추는 차례다(AC-017.12).</summary>
        public bool NoRxPress => EarlierWrite || HandStuck || AfterStuck;

        /// <summary>입력 기록의 마지막이 SkippedByHand다: 사람이 새로 승인했을 때만 바꾼다(AC-037.6).</summary>
        public bool HandRecord;

        /// <summary>묶음을 시작할 때 묻지 않기가 켜져 있었다.</summary>
        public bool NoAsk;

        /// <summary>칸의 다른 메모를 바꾸는 중이다: 원래 메모를 먼저 남기고 결과에 준다(AC-037.1).</summary>
        public bool Replacing;

        /// <summary>이번 실행에서 writing을 남겼다.</summary>
        public bool WriteStarted;

        /// <summary>직원이 비트에서 칸을 손으로 확인하고 보냈다(AC-035.5).</summary>
        public bool CheckedByHand;

        /// <summary>writing을 남겼지만 칸에 글이 남지 않았다: 쓰기 앞 확인에서 막혔거나, 쓴 뒤 다시 읽어 쓰기 전과 같다.</summary>
        public bool NothingLeft;

        /// <summary>원본 res.review: 기존 메모 때문에 건너뜀. 이것만으로 3번 실패 멈춤을 일으키지 않는다.</summary>
        public bool Review;

        /// <summary>이 사람을 여는 동안 조회 모드 안내창을 눌렀다(AC-036.4·AC-036.5).</summary>
        public bool ViewMode;

        /// <summary>직원이 손으로 다루던 칸의 사람: 이번에 직접 확인으로 왔거나 그 기록이 남았다.</summary>
        public bool ByHand => CheckedByHand || HandRecord;

        /// <summary>확인 필요로 끝나면 우리 글이 칸에 남았을 수 있는 사람.</summary>
        public bool Unconfirmed => EarlierWrite || (WriteStarted && !NothingLeft);
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
