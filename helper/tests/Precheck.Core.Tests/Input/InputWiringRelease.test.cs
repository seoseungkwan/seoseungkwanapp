using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Input;
using Precheck.Core.Tests.Store;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// 직접 확인하면 풀기(AC-035.5·AC-035.8, 2026-11-02 사용자 결정): 쓰다 멈춘 사람이 빠질 자리이고 checkedByHand이면 '풀 사람'이다. 칸을 열지도 쓰지도 않고 기록만 푼다.
/// 입력 기록은 진짜 WorkStoreJournal이다(SaveResults를 지난 뒤의 값을 보려고, AC-035.2). 자료는 모두 지어낸 것이다.
/// </summary>
public class InputWiringReleaseTests
{
    private const string Released = " · 직접 확인해 입력 멈춤을 풀었습니다";
    private const string TwoVisits = "같은 날 내원이 여러 건이라 직접 입력해 주세요";
    private const string NoVisit = "내원일 없음";
    private const string OpenMark = "확인 표시가 남아 입력하지 않았습니다";
    private const string NoMemo = "넣을 메모가 없어 입력하지 않았습니다";
    private const string CannotContinue = "이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.";

    public enum Drop
    {
        TwoVisits,
        NoVisit,
        OpenMark,
        Blank,
        BlankAndTwoVisits,
    }

    /// <summary>빠질 자리의 사람을 만든다. stuck이면 입력 기록에 writing을 남긴다.</summary>
    private static InputItem Dropped(WiringRig rig, int n, Drop drop, bool hand = true, bool stuck = true)
    {
        var memo = drop == Drop.OpenMark ? "주사 [부위 확인]" : drop == Drop.Blank || drop == Drop.BlankAndTwoVisits ? " " : null;
        var item = Sample.Item(n, memo: memo, checkedByHand: hand);
        if (drop == Drop.TwoVisits || drop == Drop.BlankAndTwoVisits) rig.Visits[WiringRig.Key(item)] = 2;
        if (drop == Drop.NoVisit) rig.Visits[WiringRig.Key(item)] = 0;
        if (stuck) rig.Reopen().Mark(item, JournalState.Writing);
        return item;
    }

    private static bool HasRow(JsonElement result, string visitKey) =>
        result.GetProperty("results").EnumerateArray().Any(line => line.GetProperty("visitKey").GetString() == visitKey);

    [Theory(DisplayName = "AC-035.8 직접 확인으로 풂: [확인] 뒤 OpenPatient·WriteMemo가 불리지 않고 건너뜀과 이유(앞부분은 지금 문구), SaveResults를 지난 뒤 LastState가 SkippedByHand이고 다음 묶음이 AC-035.4에 막히지 않는다")]
    [InlineData(Drop.TwoVisits, TwoVisits)]
    [InlineData(Drop.NoVisit, NoVisit)]
    [InlineData(Drop.OpenMark, OpenMark)]
    [InlineData(Drop.Blank, NoMemo)]
    [InlineData(Drop.BlankAndTwoVisits, NoMemo)]
    public void ReleasedByHand(Drop drop, string cause)
    {
        using var rig = new WiringRig();
        var item = Dropped(rig, 1, drop);

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("code").ValueKind);
        Assert.Equal(("건너뜀", cause + Released), WiringRig.Row(result, item.VisitKey));
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Single(rig.Confirm.Shown);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));

        var next = Sample.Item(2);
        var (_, after) = rig.Run(next);
        Assert.Equal("finished", after.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(after, next.VisitKey));
    }

    [Fact(DisplayName = "AC-035.8 남은 사람이 모두 풀 사람이면 지문과 창이 한 번씩 불리고 progress·OpenPatient·내원내역 칸 확인·진행 창 없이 finished")]
    public void OnlyReleased()
    {
        using var rig = new WiringRig();
        var first = Dropped(rig, 1, Drop.TwoVisits);
        var second = Dropped(rig, 2, Drop.OpenMark);

        var (replies, result) = rig.Run(first, second);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(1, rig.Ui.Calls.Count(call => call == "fingerprint"));
        Assert.Single(rig.Confirm.Shown);
        Assert.DoesNotContain("open", rig.Ui.Calls);
        Assert.DoesNotContain("filter", rig.Ui.Calls);
        Assert.DoesNotContain(replies, reply => reply.GetProperty("type").GetString() == "progress");
        Assert.Equal(0, rig.ProgressOpened);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(first));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(second));
    }

    [Fact(DisplayName = "AC-035.5 AC-035.8 창 글: N에 풀 사람이 들고 '빼는 환자'에 들지 않으며 M줄이 나온다")]
    public void PromptWithPeopleToOpen()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        var handOpen = Sample.Item(2, checkedByHand: true);
        rig.Reopen().Mark(handOpen, JournalState.Writing);
        var plain = Sample.Item(3);
        var dropped = Dropped(rig, 4, Drop.NoVisit, hand: false, stuck: false);

        rig.Run(released, handOpen, plain, dropped);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Contains("2명 입력할까요?", text, StringComparison.Ordinal);
        Assert.Contains("직접 확인한 환자 2명", text, StringComparison.Ordinal);
        Assert.Contains("이 가운데 1명은 메모를 넣지 않고 입력 멈춤만 풉니다", text, StringComparison.Ordinal);
        Assert.Contains("빼는 환자 1명", text, StringComparison.Ordinal);
        Assert.Contains("주의", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.5 AC-035.8 창 글: 열 사람이 없으면 입력을 묻는 글과 주의 줄 대신 입력 멈춤을 풀지 묻고, 기관기호·빼는 환자 줄은 그대로다")]
    public void PromptWithOnlyReleased()
    {
        using var rig = new WiringRig();
        var first = Dropped(rig, 1, Drop.TwoVisits);
        var second = Dropped(rig, 2, Drop.Blank);
        var dropped = Dropped(rig, 3, Drop.NoVisit, hand: false, stuck: false);

        rig.Run(first, second, dropped);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Contains("직접 확인한 환자 2명의 입력 멈춤을 풀까요? 메모는 넣지 않고 건너뜁니다", text, StringComparison.Ordinal);
        Assert.Contains("기관기호 1234****", text, StringComparison.Ordinal);
        Assert.Contains("빼는 환자 1명", text, StringComparison.Ordinal);
        Assert.DoesNotContain("입력할까요?", text, StringComparison.Ordinal);
        Assert.DoesNotContain("주의", text, StringComparison.Ordinal);
        Assert.DoesNotContain("이 가운데", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.8 풀 사람과 열 사람이 섞임: 열 사람은 AC-035.5 그대로이고 풀 사람의 칸은 열지 않는다")]
    public void MixedRunsOthers()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        var handDifferent = Sample.Item(2, checkedByHand: true);
        rig.Reopen().Mark(handDifferent, JournalState.Writing);
        rig.Ui.Bit[handDifferent.Chart] = "직원이 손으로 넣은 글";
        var plain = Sample.Item(3);

        var (replies, result) = rig.Run(released, handDifferent, plain);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", TwoVisits + Released), WiringRig.Row(result, released.VisitKey));
        Assert.Equal(("건너뜀", "이미 있음"), WiringRig.Row(result, handDifferent.VisitKey));
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, plain.VisitKey));
        Assert.Equal(2, rig.Ui.Opens);
        Assert.False(rig.Ui.Bit.ContainsKey(released.Chart));
        Assert.All(replies.Where(reply => reply.GetProperty("type").GetString() == "progress"), reply => Assert.Equal(2, reply.GetProperty("total").GetInt32()));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(released));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(handDifferent));
        Assert.Equal(JournalState.Done, reopened.LastState(plain));
    }

    [Fact(DisplayName = "AC-035.8 풀 사람과 열 사람이 섞이고 열 사람에서 멈춰도 풀 사람 기록은 SkippedByHand이고 줄이 있다")]
    public void ReleasedSurvivesLaterStop()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.OpenMark);
        var plain = Sample.Item(2);
        rig.Ui.SaveWorks = false;

        var (_, result) = rig.Run(released, plain);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", OpenMark + Released), WiringRig.Row(result, released.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(released));
        Assert.Equal(JournalState.WriteUnconfirmed, reopened.LastState(plain));
    }

    [Fact(DisplayName = "AC-035.8 내원내역 칸 확인에서 막혀도 풀 사람은 이미 풀렸고, 열 사람은 미처리다")]
    public void ReleasedBeforeListCheck()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        var plain = Sample.Item(2);
        rig.Ui.Filter = new ListFilter("2026-11-01", "2026-11-30", "", false, null);

        var (_, result) = rig.Run(released, plain);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(("건너뜀", TwoVisits + Released), WiringRig.Row(result, released.VisitKey));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, plain.VisitKey));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(released));
    }

    [Theory(DisplayName = "AC-035.8 checkedByHand 없는 빠질 사람이 섞이면 아무도 열지 않고 stopped, 같은 묶음의 풀 사람도 풀리지 않는다")]
    [InlineData(Drop.TwoVisits)]
    [InlineData(Drop.OpenMark)]
    [InlineData(Drop.Blank)]
    public void UnflaggedBlocksRelease(Drop drop)
    {
        using var rig = new WiringRig();
        var unflagged = Dropped(rig, 1, drop, hand: false);
        var released = Dropped(rig, 2, Drop.TwoVisits);

        var (_, result) = rig.Run(unflagged, released);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-INPUT-STOPPED", result.GetProperty("code").GetString());
        Assert.Equal(CannotContinue, result.GetProperty("reason").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Writing, reopened.LastState(unflagged));
        Assert.Equal(JournalState.Writing, reopened.LastState(released));
    }

    [Theory(DisplayName = "AC-035.8 [취소]·창 닫기·5분 지남이면 아무 기록도 풀리지 않고 여전히 막히며 풀 사람의 줄이 없다")]
    [InlineData(NoAnswer.Cancel)]
    [InlineData(NoAnswer.WindowClosed)]
    [InlineData(NoAnswer.TimedOut)]
    [InlineData(NoAnswer.ClosedBeforeAsk)]
    [InlineData(NoAnswer.ClosedWhileAnswering)]
    public void NotConfirmedReleasesNothing(NoAnswer kind)
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        rig.Refuse(kind);

        var (_, result) = rig.Run(released);

        Assert.Equal("cancelled", result.GetProperty("status").GetString());
        Assert.False(HasRow(result, released.VisitKey));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));

        var (_, next) = rig.Run(Sample.Item(2));
        Assert.Equal(released.VisitKey, Assert.Single(next.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
    }

    [Fact(DisplayName = "AC-035.8 지문이 틀리면 창 없이 멈추고 아무 기록도 풀리지 않으며 풀 사람의 줄이 없고 여전히 막힌다")]
    public void WrongFingerprintReleasesNothing()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));

        var (_, result) = rig.Run(released);

        Assert.Equal("E-BIT-UI-CHANGED", result.GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.False(HasRow(result, released.VisitKey));
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));

        rig.Ui.FingerprintAt = null;
        var (_, next) = rig.Run(Sample.Item(2));
        Assert.Equal(released.VisitKey, Assert.Single(next.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
    }

    [Fact(DisplayName = "AC-035.8 입력 기록 읽기 실패: 풀 사람의 Mark가 불리지 않아 기록이 그대로이고 줄이 없으며 E-STORE-FAILED")]
    public void ReadFailureReleasesNothing()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = released.VisitKey };

        var (_, result) = rig.Run(released);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.DoesNotContain(rig.Steps, step => step.StartsWith("mark:", StringComparison.Ordinal));
        Assert.False(HasRow(result, released.VisitKey));
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.8 다른 사람의 입력 기록 읽기가 실패해도 풀 사람은 풀리지 않는다: 읽기가 Mark보다 먼저다")]
    public void OtherReadFailureReleasesNothing()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        var other = Sample.Item(2);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = other.VisitKey };

        var (_, result) = rig.Run(released, other);

        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain(rig.Steps, step => step.StartsWith("mark:", StringComparison.Ordinal));
        Assert.False(HasRow(result, released.VisitKey));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, other.VisitKey));
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.8 Mark 실패: 아무도 열지 않고 E-STORE-FAILED, 그 사람의 줄이 없고 먼저 풀린 사람의 줄은 있다")]
    public void MarkFailure()
    {
        using var rig = new WiringRig();
        var first = Dropped(rig, 1, Drop.TwoVisits);
        var failing = Dropped(rig, 2, Drop.TwoVisits);
        var later = Dropped(rig, 3, Drop.TwoVisits);
        var other = Sample.Item(4);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { MarkFailsFor = failing.VisitKey };

        var (_, result) = rig.Run(first, failing, later, other);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain("filter", rig.Ui.Calls);
        Assert.Equal(("건너뜀", TwoVisits + Released), WiringRig.Row(result, first.VisitKey));
        Assert.False(HasRow(result, failing.VisitKey));
        Assert.False(HasRow(result, later.VisitKey));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, other.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(first));
        Assert.Equal(JournalState.Writing, reopened.LastState(failing));
        Assert.Equal(JournalState.Writing, reopened.LastState(later));
    }

    [Fact(DisplayName = "AC-035.8 풀 사람만 있는 묶음의 Mark 실패: 열 사람이 없어도 finished가 아니라 stopped, E-STORE-FAILED, 줄이 없고 기록은 Writing 그대로")]
    public void MarkFailureOnlyReleased()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { MarkFailsFor = released.VisitKey };

        var (_, result) = rig.Run(released);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Empty(result.GetProperty("results").EnumerateArray());
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.8 AC-035.9 차례: [확인] → 해시 저장 → 입력 기록 읽기 → 풀 사람 Mark → 내원내역 칸 확인 → 사람마다")]
    public void Order()
    {
        using var rig = new WiringRig();
        var released = Dropped(rig, 1, Drop.TwoVisits);
        var plain = Sample.Item(2);
        rig.Files.Plant("work-2026-08.dat", System.Text.Encoding.ASCII.GetBytes("garbage"));
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps)
        {
            BeforeRead = () =>
            {
                if (rig.Files.Names().Contains("input-acks.dat") && !rig.Steps.Contains("acks-saved")) rig.Steps.Add("acks-saved");
            },
        };
        rig.Ui.OnCall = (call, _) => rig.Steps.Add(call);
        rig.Confirm.Behavior = _ =>
        {
            rig.Steps.Add("confirm");
            return true;
        };

        rig.Run(released, plain);

        var expected = new[] { "fingerprint", "confirm", "acks-saved", "journal-read", "mark:SkippedByHand", "filter", "open" };
        var positions = expected.Select(step => rig.Steps.IndexOf(step)).ToArray();
        Assert.All(positions, position => Assert.True(position >= 0, string.Join(",", rig.Steps)));
        Assert.Equal(positions.OrderBy(position => position), positions);
        Assert.Equal(2, rig.Steps.Count(step => step == "journal-read"));
        Assert.True(rig.Steps.LastIndexOf("journal-read") < rig.Steps.IndexOf("mark:SkippedByHand"), string.Join(",", rig.Steps));
    }

    [Theory(DisplayName = "AC-035.5 AC-035.2 미리 뺀 사람 H(직접 확인 포함)와 S: [확인] 뒤 LastState(S)가 실패하면 줄만 있고 H의 기록은 그대로다(skipped가 남지 않는다)")]
    [InlineData(true)]
    [InlineData(false)]
    public void ReadFailureKeepsExcludedRecord(bool hand)
    {
        using var rig = new WiringRig();
        var excluded = Dropped(rig, 1, Drop.TwoVisits, hand: hand, stuck: false);
        var failing = Sample.Item(2);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = failing.VisitKey };

        var (_, result) = rig.Run(excluded, failing);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, excluded.VisitKey));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, failing.VisitKey));
        var reopened = rig.Reopen();
        Assert.Null(reopened.LastState(excluded));
        Assert.Null(reopened.LastState(failing));
    }

    [Fact(DisplayName = "AC-035.5 앞선 기록이 있는 미리 뺀 사람도 LastState 실패로 멈춘 묶음이면 기록이 바뀌지 않는다")]
    public void ReadFailureKeepsExcludedEarlierRecord()
    {
        using var rig = new WiringRig();
        var excluded = Dropped(rig, 1, Drop.TwoVisits, stuck: false);
        rig.Reopen().Mark(excluded, JournalState.Done);
        var failing = Sample.Item(2);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = failing.VisitKey };

        rig.Run(excluded, failing);

        Assert.Equal(JournalState.Done, rig.Reopen().LastState(excluded));
    }

    [Fact(DisplayName = "AC-035.4 쓰다 멈춘 P가 묶음 밖이면 풀 사람이 있어도 풀리지 않고 창 없이 멈춘다")]
    public void OutsideStuckBlocksRelease()
    {
        using var rig = new WiringRig();
        var outside = Sample.Item(9, date: "2026-09-15", visitKey: "p");
        rig.Reopen().Mark(outside, JournalState.Writing);
        var released = Dropped(rig, 1, Drop.TwoVisits);

        var (_, result) = rig.Run(released);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.8 [이어서 입력](checkedByHand 없음)이 공백 메모·자리 채움 값이면 멈추고, 같은 사람을 [직접 확인했어요]로 보내면 풀린다")]
    public void PlaceholderPath()
    {
        using var rig = new WiringRig();
        var stuck = Sample.Item(1, date: "2026-10-27", visitKey: "p");
        rig.Reopen().Mark(stuck, JournalState.WriteUnconfirmed);
        var resume = new InputItem("p", "00000000000000000001", "-", "2026-10-27", " ");
        var byHand = new InputItem("p", "00000000000000000001", "-", "2026-10-27", " ", checkedByHand: true);

        var (_, first) = rig.Run(resume);
        Assert.Equal(CannotContinue, first.GetProperty("reason").GetString());
        Assert.Empty(rig.Confirm.Shown);

        var (_, second) = rig.Run(byHand);
        Assert.Equal("finished", second.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", NoMemo + Released), WiringRig.Row(second, "p"));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(byHand));
    }
}
