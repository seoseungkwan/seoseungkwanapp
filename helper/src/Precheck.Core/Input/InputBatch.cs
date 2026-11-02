using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;

namespace Precheck.Core.Input;

/// <summary>
/// 확인 창 앞의 묶음 다듬기(AC-035.1·AC-035.4·AC-035.8·AC-035.9): 내원 수 읽기 → 달 파일 검사 → 쓰다 멈춘 사람 검사 → 빼기. 비트 화면은 건드리지 않는다.
/// 묶음 검사는 받은 그대로 처리기 맨 앞에서 끝났다. 뺀 뒤에 다시 하면 빈 묶음이 되어 건너뜀 이유를 잃는다.
/// 빠질 사람이 쓰다 멈춘 사람이면 깃발이 없을 때 아무도 열지 않고 멈추고, 깃발이 있으면 '풀 사람'으로 InputRunner에 넘긴다: 풀림은 [확인] 뒤의 일이다.
/// </summary>
internal sealed class InputBatch
{
    public const string TwoVisits = "같은 날 내원이 여러 건이라 직접 입력해 주세요";
    public const string NoVisit = "내원일 없음";
    public const string OpenMark = "확인 표시가 남아 입력하지 않았습니다";
    public const string NoMemo = "넣을 메모가 없어 입력하지 않았습니다";

    // 화면은 이유의 앞부분으로 가른다(AC-018.4·AC-018.13·AC-018.20). 앞부분은 위 문구 그대로 둔다
    private const string ReleasedNote = " · 직접 확인해 입력 멈춤을 풀었습니다";

    // 이 도우미에서 더한 문구: 저장 안 된 글이 칸에 남았을 수 있어 아무도 열지 않았다
    private const string StuckFirst = "이전 입력이 끝나지 않은 환자가 있어 아무도 열지 않았습니다. 그 환자의 청구메모 칸을 먼저 확인해 주세요.";
    private const string CannotContinue = "이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.";

    private static readonly InputItem[] NoItems = new InputItem[0];
    private static readonly InputResult[] NoResults = new InputResult[0];
    private static readonly ReleasedPerson[] NoOne = new ReleasedPerson[0];

    private InputBatch(IReadOnlyList<InputItem> remaining, IReadOnlyList<InputItem> excluded, IReadOnlyList<InputResult> excludedResults, IReadOnlyList<ReleasedPerson> released, Action? ackRecords, InputOutcome? stop, string? code)
    {
        Code = code;
        Remaining = remaining;
        Excluded = excluded;
        ExcludedResults = excludedResults;
        Released = released;
        AckRecords = ackRecords;
        Stop = stop;
    }

    /// <summary>풀 사람: 쓰다 멈춘 사람이 빠질 자리이고 직접 확인으로 왔다. Line은 그 사람의 Mark 뒤에만 결과에 넣는다.</summary>
    internal sealed class ReleasedPerson
    {
        public ReleasedPerson(InputItem item, InputResult line)
        {
            Item = item;
            Line = line;
        }

        public InputItem Item { get; }
        public InputResult Line { get; }
    }

    /// <summary>고른 처방코드(AC-036.1). 창 글과 내원내역 칸 확인에만 쓰고 진료를 거르지 않는다.</summary>
    public string? Code { get; }

    /// <summary>확인 창 뒤에 열 사람.</summary>
    public IReadOnlyList<InputItem> Remaining { get; }

    /// <summary>열지 않고 뺀 사람('빼는 환자 N명').</summary>
    public IReadOnlyList<InputItem> Excluded { get; }

    public IReadOnlyList<InputResult> ExcludedResults { get; }

    /// <summary>[확인] 뒤 열지 않고 기록만 풀 사람('직접 확인한 환자 N명').</summary>
    public IReadOnlyList<ReleasedPerson> Released { get; }

    /// <summary>[확인]한 뒤 해시를 저장한다. null이면 묻지 않는 묶음이다(AC-035.9).</summary>
    public Action? AckRecords { get; }

    /// <summary>창을 띄우지도 아무 줄을 열지도 않고 끝낼 때의 답. 아니면 null.</summary>
    public InputOutcome? Stop { get; }

    /// <summary>뺄 사람도 풀 사람도 묻는 글도 없는 묶음.</summary>
    public static InputBatch Plain(IReadOnlyList<InputItem> items, string? code = null) => new InputBatch(items, NoItems, NoResults, NoOne, null, null, code);

    /// <summary>미리 뺀 사람의 줄을 더하고 skipped도 남기게 한다.</summary>
    public InputOutcome WithExcluded(InputOutcome outcome) => outcome.WithExcluded(Excluded, ExcludedResults);

    /// <summary>
    /// [확인]을 받고 입력 기록을 읽은 뒤의 답. 미리 뺀 사람의 줄은 그대로 더하되, checkedByHand인 사람은 skipped를 남기게 하지 않는다: 그 사람의 기록은 InputRunner가 SkippedByHand로 Mark했고,
    /// 못 남겼으면 줄만 있다(AC-035.5). skipped를 남기는 것은 [확인] 없이 끝난 묶음의 WithExcluded뿐이다.
    /// </summary>
    public InputOutcome WithExcludedConfirmed(InputOutcome outcome) =>
        outcome.WithExcluded(Excluded.Where(item => !item.CheckedByHand).ToList(), ExcludedResults);

    /// <summary>묻지 않기가 켜져 있어도 창을 띄우는 묶음(AC-037.4): 확인할 수 없는 기록을 묻거나 직접 확인으로 온 사람이 있다. 미리 빠질 사람도 친다: [확인]이 없으면 그 사람의 직접 확인 기록이 남지 않는다.</summary>
    public bool MustAsk =>
        AckRecords != null || Released.Count > 0 || Remaining.Any(item => item.CheckedByHand) || Excluded.Any(item => item.CheckedByHand);

    /// <summary>미리 뺀 사람의 줄만 더한다: 기록은 그대로 둔다(입력 기록을 못 읽었거나 해시를 못 남긴 묶음, AC-035.5).</summary>
    public InputOutcome WithExcludedLines(InputOutcome outcome) => outcome.WithExcluded(NoItems, ExcludedResults);

    /// <summary>묶음 기간의 차트번호·내원일별 내원 수(BatchCheck.VisitOnScreen 열쇠). 화면 검사처럼 숫자만 글자 그대로 견주므로 숫자가 같은 줄은 더한다. 실패는 E-BIT-READ-FAILED.</summary>
    public static IReadOnlyDictionary<string, long> ReadVisits(IBitDb db, IReadOnlyList<InputItem> items)
    {
        var days = items.Select(item => DateTime.ParseExact(item.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture)).ToList();
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(days.Min()),
            ["@to"] = ClaimText.Stamp(days.Max().AddDays(1)),
        };
        var counts = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.InputVisitCountSql, args, Sql.MemoTimeout))
        {
            var key = ChartRules.Digits(ClaimText.Cell(row, 0)) + "|" + ChartRules.Digits(ClaimText.Cell(row, 1));
            var count = ClaimText.Long(row, 2);
            counts[key] = counts.TryGetValue(key, out var known) ? known + count : count;
        }
        return counts;
    }

    public static InputBatch Prepare(IReadOnlyList<InputItem> items, IReadOnlyDictionary<string, long> visits, IBatchJournal journal, string? code = null)
    {
        JournalScan scan;
        try
        {
            scan = journal.Scan();
        }
        catch (HelperException e)
        {
            return Stopped(new InputOutcome(InputStatus.Stopped, e.Code, null, null, Unopened(items)));
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return Stopped(new InputOutcome(InputStatus.Stopped, InputErrors.Stopped, InputRunner.Unexpected, null, Unopened(items)));
        }

        var outside = scan.Stuck.Where(visit => !items.Any(item => Same(item, visit))).ToList();
        if (outside.Count > 0) return Stopped(StoppedForStuck(items, scan.Stuck, outside, StuckFirst));

        var remaining = new List<InputItem>(items.Count);
        var excluded = new List<InputItem>();
        var results = new List<InputResult>();
        var released = new List<ReleasedPerson>();
        var blocked = new List<UnconfirmedVisit>();
        foreach (var item in items)
        {
            var reason = DropReason(item, visits);
            if (reason == null)
            {
                remaining.Add(item);
                continue;
            }

            var stuck = scan.Stuck.FirstOrDefault(visit => Same(item, visit));
            if (stuck == null)
            {
                // 깃발이 있어도 풀 일이 없으면 보통 빠지는 사람이다
                excluded.Add(item);
                results.Add(new InputResult(item.VisitKey, InputResults.Skipped, reason));
            }
            else if (item.CheckedByHand)
            {
                released.Add(new ReleasedPerson(item, new InputResult(item.VisitKey, InputResults.Skipped, reason + ReleasedNote)));
            }
            else
            {
                // 글이 칸에 남은 채 넘어가지 않게 빼지 않는다. 이런 사람이 있으면 같은 묶음의 풀 사람도 풀리지 않는다
                blocked.Add(stuck);
            }
        }
        if (blocked.Count > 0) return Stopped(StoppedForStuck(items, scan.Stuck, blocked, CannotContinue));

        Action? ackRecords = scan.RecordsToAck.Count > 0 ? () => journal.SaveAcks(scan.RecordsToAck) : null;
        return new InputBatch(remaining, excluded, results, released, ackRecords, null, code);
    }

    /// <summary>입력 기록의 달은 내원일의 달이다: 다른 달의 같은 번호는 이 사람이 아니다(LastState가 그 달 파일만 본다). 날짜는 견주지 않는다: 날짜를 모르는 화면은 그 달 1일로 보낸다(AC-018.16).</summary>
    private static bool Same(InputItem item, UnconfirmedVisit visit) =>
        string.Equals(item.VisitKey, visit.VisitKey, StringComparison.Ordinal)
        && string.CompareOrdinal(item.Date, 0, visit.Date, 0, 7) == 0;

    /// <summary>메모가 공백뿐이면 이 까닭이 앞선다: 넣을 글이 없고 내원 수·확인 표시와도 상관없다(AC-035.8).</summary>
    private static string? DropReason(InputItem item, IReadOnlyDictionary<string, long> visits)
    {
        if (string.IsNullOrWhiteSpace(item.Memo)) return NoMemo;
        visits.TryGetValue(BatchCheck.VisitOnScreen(item), out var count);
        if (count >= 2) return TwoVisits;
        if (count <= 0) return NoVisit;
        return MemoMarks.HasOpenMark(item.Memo) ? OpenMark : null;
    }

    private static InputOutcome StoppedForStuck(IReadOnlyList<InputItem> items, IReadOnlyList<UnconfirmedVisit> stuck, IReadOnlyList<UnconfirmedVisit> unconfirmed, string reason) =>
        new InputOutcome(
            InputStatus.Stopped,
            InputErrors.Stopped,
            reason,
            null,
            items.Select(item => new InputResult(item.VisitKey, InputResults.Check, stuck.Any(visit => Same(item, visit)) ? InputRunner.WriteUnknown : InputRunner.NotDone)).ToList(),
            unconfirmed);

    private static IReadOnlyList<InputResult> Unopened(IReadOnlyList<InputItem> items) =>
        items.Select(item => new InputResult(item.VisitKey, InputResults.Check, InputRunner.NotDone)).ToList();

    private static InputBatch Stopped(InputOutcome outcome) => new InputBatch(NoItems, NoItems, NoResults, NoOne, null, outcome, null);
}
