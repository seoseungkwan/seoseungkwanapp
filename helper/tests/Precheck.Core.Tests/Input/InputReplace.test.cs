using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Store;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// 다른 메모 바꾸기·묻지 않기(TASK-37, REQ-037, design.md 19-6). 메시지부터 끝까지 돌고 입력 기록은 진짜 WorkStoreJournal이다(SaveResults를 지난 값을 보려고, AC-035.2).
/// 비트 화면·확인 창은 가짜이고 메모는 모두 지어낸 것이다.
/// </summary>
public class InputReplaceTests
{
    private const string Box = "직원이 쓴 다른 메모";
    private const string Replaced = "바꿈(기존 메모 덮어씀)";
    private const string Changed = "입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.";
    private const string Already = "이미 있음";
    private const string OpenMark = "확인 표시가 남아 입력하지 않았습니다";
    private const string TwoVisits = "같은 날 내원이 여러 건이라 직접 입력해 주세요";
    private const string OldMonth = "work-2026-08.dat";
    private const string Notice = "입력 기록의 일부를 확인할 수 없습니다. 먼저 비트에 열려 있는 환자의 메모 칸을 확인해 주세요. 저장하지 않은 글이 있으면 마무리한 뒤 [확인]을 눌러 주세요.";
    private const string SetAside = "그 달의 입력 기록 파일을 읽지 못해 따로 치워 두었습니다. 아무도 열지 않았으니 다시 눌러 이어서 해 주세요.";
    private const string NoteOff = "비트에 다른 메모가 있으면 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 다만 불러온 뒤 달라진 메모, 우리 메모에 확인 표시가 남은 환자, [직접 확인했어요]를 누른 환자는 건너뜁니다.";
    private const string NoteOn = "묻지 않기가 켜져 있어 비트의 다른 메모를 바꿉니다. 다만 직접 확인한 환자는 바꾸지 않고 건너뜁니다";
    private const string Label = "이제부터 묻지 않기 (비트에 다른 메모가 있어도 묻지 않고 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 확인 표시가 남은 메모는 입력하지 않습니다. 청구 창을 닫으면 꺼집니다)";

    private static readonly byte[] Garbage = Encoding.ASCII.GetBytes("garbage");

    private static InputItem WithBox(WiringRig rig, int n, string box = Box, string? replaces = null, bool hand = false)
    {
        var item = Sample.Item(n, replaces: replaces, checkedByHand: hand);
        rig.Ui.Bit[item.Chart] = box;
        return item;
    }

    private static string Status(JsonElement result) => result.GetProperty("status").GetString()!;

    private static string? Code(JsonElement result) => result.GetProperty("code").ValueKind == JsonValueKind.Null ? null : result.GetProperty("code").GetString();

    private static string? Reason(JsonElement result) => result.GetProperty("reason").ValueKind == JsonValueKind.Null ? null : result.GetProperty("reason").GetString();

    private static JsonElement Line(JsonElement result, string visitKey) =>
        result.GetProperty("results").EnumerateArray().Single(line => line.GetProperty("visitKey").GetString() == visitKey);

    private static string? Previous(JsonElement result, string visitKey) =>
        Line(result, visitKey).TryGetProperty("previousMemo", out var value) ? value.GetString() : null;

    private static string[] Originals(WiringRig rig, string visitKey, string file = StoreRig.MonthFile)
    {
        if (!rig.Files.Inside(file).TryGetProperty("originals", out var originals) || !originals.TryGetProperty(visitKey, out var list)) return new string[0];
        return list.EnumerateArray().Select(text => text.GetString()!).ToArray();
    }

    private static JournalSpy Spy(WiringRig rig, IBatchJournal journal) => new JournalSpy(journal, rig.Steps);

    /// <summary>v1의 기록이 state이고 그 진료의 원래 메모 목록은 모양이 틀린 달 파일.</summary>
    private static string UnreadableList(string state) =>
        "{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{},\"done\":{},\"journal\":{\"v1\":\"" + state + "\"},\"journalDates\":{\"v1\":\"2026-10-27\"},\"originals\":{\"v1\":\"틀린 모양\"}}";

    // ------------------------------------------------------------------
    // AC-037.1 승인한 메모 바꾸기
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-037.1 칸 글이 replaces와 같으면 바꾼다: 완료·이유 '바꿈(기존 메모 덮어씀)'·previousMemo, 저장을 눌러 다시 읽고 기록은 Done")]
    public void ApprovedIsReplaced()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", Status(result));
        Assert.Equal(("완료", Replaced), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(Box, Previous(result, item.VisitKey));
        Assert.Equal(item.Memo, rig.Ui.Bit[item.Chart]);
        Assert.Equal(1, rig.Ui.Saves);
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 비교는 MemoApproval.Matches 그대로다: 윈도우 줄바꿈만 맞추고, previousMemo는 칸에서 읽은 글 그대로다")]
    public void ApprovalIgnoresOnlyNewlines()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, box: "첫 줄\r\n둘째 줄", replaces: "첫 줄\n둘째 줄");

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", Replaced), WiringRig.Row(result, item.VisitKey));
        Assert.Equal("첫 줄\r\n둘째 줄", Previous(result, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 차례: 원래 메모 저장 → writing → 칸에 쓰기 → 저장 → done")]
    public void OriginalBeforeWriting()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        rig.WrapJournal = journal => Spy(rig, journal);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace" || call == "save") rig.Steps.Add(call);
        };

        rig.Run(item);

        var order = rig.Steps.Where(step => step == "original" || step.StartsWith("mark:", StringComparison.Ordinal) || step == "replace" || step == "save").ToArray();
        Assert.Equal(new[] { "original", "mark:Writing", "replace", "save", "mark:Done" }, order);
    }

    [Fact(DisplayName = "AC-037.1 칸에 쓰는 순간 디스크의 달 파일을 새로 열면 원래 메모와 writing이 이미 있다")]
    public void OnDiskAtTheMomentOfWriting()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        var seen = 0;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call != "replace") return;
            seen++;
            Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));
            Assert.Equal(JournalState.Writing, rig.Reopen().LastState(item));
        };

        var (_, result) = rig.Run(item);

        Assert.Equal(1, seen);
        Assert.Equal("완료", WiringRig.Row(result, item.VisitKey).Result);
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 쓰기 바로 뒤 도우미가 죽어도(SaveResults 없이) 원래 메모가 남아 다음 묶음에서 저장을 확인한 사람의 결과에 목록의 마지막 글이 나온다")]
    public void SurvivesDeathAfterWriting()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        byte[]? disk = null;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") disk = rig.Files.Bytes(StoreRig.MonthFile);
        };
        rig.Run(item);

        // 그 순간으로 되돌린다: 칸에는 우리 글이 저장 안 된 채 있고, 디스크는 쓰던 때 그대로다(done도 SaveResults도 없다)
        rig.Ui.OnCall = null;
        rig.Files.Plant(StoreRig.MonthFile, disk!);
        rig.Ui.KeepsOpenVisit = true;
        rig.Ui.Bit[item.Chart] = Box;
        var saves = rig.Ui.Saves;

        var (_, next) = rig.Run(Sample.Item(1));

        Assert.Equal(("완료", Replaced), WiringRig.Row(next, item.VisitKey));
        Assert.Equal(Box, Previous(next, item.VisitKey));
        Assert.Equal(saves + 1, rig.Ui.Saves);
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 쓰다 멈춘 사람이 저장을 확인해도 originals에 글이 없으면 그냥 입력이고 previousMemo가 없다")]
    public void EarlierWriteWithoutOriginalIsPlain()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        rig.Reopen().Mark(item, JournalState.Writing);
        rig.Ui.Bit[item.Chart] = item.Memo;

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", "입력"), WiringRig.Row(result, item.VisitKey));
        Assert.Null(Previous(result, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 저장 실패면 WriteMemo가 불리지 않고 writing도 없고 E-STORE-FAILED로 멈춘다(AC-017.5): 칸은 그대로, 다음 사람을 열지 않는다")]
    public void SaveFailureWritesNothing()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        var next = Sample.Item(2);
        rig.WrapJournal = journal => new JournalSpy(journal, rig.Steps) { OriginalFailsFor = item.VisitKey };

        var (_, result) = rig.Run(item, next);

        Assert.Equal("stopped", Status(result));
        Assert.Equal("E-STORE-FAILED", Code(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.DoesNotContain("replace", rig.Ui.Calls);
        Assert.DoesNotContain("mark:Writing", rig.Steps);
        Assert.Equal(Box, rig.Ui.Editor);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, next.VisitKey));
        Assert.Null(Previous(result, item.VisitKey));
        Assert.NotEqual(JournalState.Writing, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.1 글을 파일에 담지 못하는 때(짝 없는 대리쌍)도 저장 실패다: 칸에 아무것도 쓰지 않고 E-STORE-FAILED")]
    public void TextTheFileCannotHold()
    {
        using var rig = new WiringRig();
        var broken = "다른 메모 \uD83D 끝";
        var item = WithBox(rig, 1, box: broken);
        rig.NoAsk.TurnOn();

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", Status(result));
        Assert.Equal("E-STORE-FAILED", Code(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(broken, rig.Ui.Editor);
        Assert.Empty(Originals(rig, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 이미 있는 목록의 모양이 틀리면 덮지 않고 E-STORE-FAILED: 칸에 쓰지 않고 그 값이 파일에 그대로다")]
    public void MalformedListIsNotOverwritten()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{},\"done\":{},\"journal\":{},\"originals\":{\"v1\":\"전에 남긴 글\"}}"));
        rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1);

        var (_, result) = rig.Run(item);

        Assert.Equal("E-STORE-FAILED", Code(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal("전에 남긴 글", rig.Files.Inside(StoreRig.MonthFile).GetProperty("originals").GetProperty("v1").GetString());
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 쓰다 멈춘 사람의 원래 메모를 못 읽으면 저장을 누르지 않고 E-STORE-FAILED, 기록은 쓰다 멈춤 그대로다")]
    public void EarlierWriteWithUnreadableList()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{},\"done\":{},\"journal\":{\"v1\":\"writing\"},\"journalDates\":{\"v1\":\"2026-10-27\"},\"originals\":{\"v1\":\"틀린 모양\"}}"));
        var item = Sample.Item(1);
        rig.Ui.Bit[item.Chart] = item.Memo;

        var (_, result) = rig.Run(item);

        Assert.Equal("E-STORE-FAILED", Code(result));
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 쓰다 멈춘 사람의 목록이 깨졌어도 직접 확인이면 풀린다: 칸이 우리 글과 같으면 완료(이미 입력됨)이고 기록은 Done, 목록은 그대로다")]
    public void HandReleasesUnreadableListWhenBoxIsOurs()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted(UnreadableList("writing")));
        var item = Sample.Item(1, checkedByHand: true);
        rig.Ui.Bit[item.Chart] = item.Memo;

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", Status(result));
        Assert.Equal(("완료", "이미 입력됨"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
        Assert.Equal("틀린 모양", rig.Files.Inside(StoreRig.MonthFile).GetProperty("originals").GetProperty("v1").GetString());
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 쓰다 멈춘 사람의 목록이 깨졌어도 직접 확인이면 풀린다: 칸이 다르면 쓰지 않고 건너뜀(이미 있음)이고 기록은 SkippedByHand다")]
    public void HandReleasesUnreadableListWhenBoxDiffers()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted(UnreadableList("writeUnconfirmed")));
        var item = WithBox(rig, 1, hand: true);

        var (_, result) = rig.Run(item);

        Assert.Equal(("건너뜀", Already), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.1 AC-017.7 AC-037.6 writing을 남기고 쓰기 전에 죽으면: 이어 하기는 멈추고, 직접 확인 뒤에는 묻지 않기로도 바꾸지 않으며, 새 승인이 오면 바꾸고 목록은 1개다")]
    public void DeathBeforeWritingThenHandThenApproval()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        byte[]? disk = null;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "select" && disk == null) disk = rig.Files.Bytes(StoreRig.MonthFile);
        };
        rig.Run(item);

        // 그 순간으로 되돌린다: 칸은 쓰기 전 그대로이고, 디스크에는 원래 메모와 writing이 있다
        rig.Ui.OnCall = null;
        rig.Files.Plant(StoreRig.MonthFile, disk!);
        rig.Ui.Bit[item.Chart] = Box;
        var writes = rig.Ui.Writes;

        var (_, resumed) = rig.Run(Sample.Item(1));
        Assert.Equal("stopped", Status(resumed));
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Reopen().LastState(item));
        Assert.Equal(writes, rig.Ui.Writes);

        var (_, blocked) = rig.Run(Sample.Item(2));
        Assert.Equal("stopped", Status(blocked));
        Assert.Equal(1, blocked.GetProperty("unconfirmed").GetArrayLength());

        var (_, byHand) = rig.Run(Sample.Item(1, checkedByHand: true));
        Assert.Equal(("건너뜀", Already), WiringRig.Row(byHand, item.VisitKey));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));

        rig.NoAsk.TurnOn();
        var (_, noAsk) = rig.Run(Sample.Item(1));
        Assert.Equal(("건너뜀", Already), WiringRig.Row(noAsk, item.VisitKey));
        Assert.Equal(writes, rig.Ui.Writes);

        var (_, approved) = rig.Run(Sample.Item(1, replaces: Box));
        Assert.Equal(("완료", Replaced), WiringRig.Row(approved, item.VisitKey));
        Assert.Equal(Box, Previous(approved, item.VisitKey));
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 store.save 뒤에도 originals가 그대로이고 store.load 답에 없으며, 웹은 originals를 보낼 수 없다")]
    public void StoreCommandsDoNotTouchOriginals()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1, replaces: Box);
        rig.Run(item);

        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        StoreCommands.Register(dispatcher, () => rig.Files.Open(), () => WorkLock.TryAcquire(TimeSpan.Zero, rig.LockName));
        List<JsonElement> Save(string inner)
        {
            var sink = new ListSink();
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("store.save", JsonSerializer.Serialize(new { payload = inner }))), sink);
            return sink.Replies;
        }

        Assert.Equal("result", Assert.Single(Save("{\"month\":\"2026-10\",\"drafts\":{},\"done\":{}}")).GetProperty("type").GetString());
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));

        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(Save("{\"month\":\"2026-10\",\"drafts\":{},\"originals\":{}}")).GetProperty("code").GetString());
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));

        var loaded = rig.Files.Open().Load(new[] { "2026-10" }, false, false);
        Assert.DoesNotContain("originals", loaded, StringComparison.Ordinal);
        Assert.DoesNotContain(Box, loaded, StringComparison.Ordinal);
        Assert.Equal(new[] { "done", "drafts", "journal" }, Json.Parse(loaded).GetProperty("months").GetProperty("2026-10").EnumerateObject().Select(field => field.Name).OrderBy(name => name, StringComparer.Ordinal).ToArray());
    }

    [Fact(DisplayName = "AC-037.1 A→B→C로 바꾼 뒤 파일에 A와 B가 모두 있고, 다른 진료의 목록과 다른 칸은 그대로다")]
    public void EveryOverwrittenTextIsKept()
    {
        using var rig = new WiringRig();
        var neighbour = WithBox(rig, 2, box: "옆 사람 메모", replaces: "옆 사람 메모");
        rig.Run(neighbour);

        var chart = Sample.Item(1).Chart;
        rig.Ui.Bit[chart] = "글 A";
        var (_, first) = rig.Run(Sample.Item(1, memo: "글 B", replaces: "글 A"));
        var (_, second) = rig.Run(Sample.Item(1, memo: "글 C", replaces: "글 B"));

        Assert.Equal("글 A", Previous(first, "v1"));
        Assert.Equal("글 B", Previous(second, "v1"));
        Assert.Equal(new[] { "글 A", "글 B" }, Originals(rig, "v1"));
        Assert.Equal(new[] { "옆 사람 메모" }, Originals(rig, neighbour.VisitKey));
        Assert.Equal("글 C", rig.Ui.Bit[chart]);
    }

    [Fact(DisplayName = "AC-037.1 목록의 마지막 글과 같은 글은 덧붙지 않는다")]
    public void SameAsLastIsNotAppended()
    {
        using var rig = new WiringRig();
        var chart = Sample.Item(1).Chart;
        rig.Ui.Bit[chart] = "글 A";
        rig.Run(Sample.Item(1, memo: "글 B", replaces: "글 A"));

        // 직원이 글 A로 되돌린 뒤 다시 바꾼다
        rig.Ui.Bit[chart] = "글 A";
        var (_, result) = rig.Run(Sample.Item(1, memo: "글 B", replaces: "글 A"));

        Assert.Equal("글 A", Previous(result, "v1"));
        Assert.Equal(new[] { "글 A" }, Originals(rig, "v1"));
    }

    [Fact(DisplayName = "AC-037.1 목록을 남기고 writing 전에 죽어도 다음 승인이 같은 글을 되풀이해 남기지 않는다")]
    public void DeathAfterSavingListDoesNotRepeatText()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{},\"done\":{},\"journal\":{},\"originals\":{\"v1\":[\"" + Box + "\"]}}"));
        var item = WithBox(rig, 1);

        var (_, skipped) = rig.Run(item);

        Assert.Equal(("건너뜀", Already), WiringRig.Row(skipped, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);

        var (_, approved) = rig.Run(Sample.Item(1, replaces: Box));

        Assert.Equal(("완료", Replaced), WiringRig.Row(approved, item.VisitKey));
        Assert.Equal(Box, Previous(approved, item.VisitKey));
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));
    }

    [Fact(DisplayName = "AC-037.1 칸이 빈 입력은 originals를 건드리지 않고, 값이 없으면 파일에 칸을 쓰지 않는다. replaces가 와도 칸이 비었으면 그냥 입력이다")]
    public void EmptyBoxLeavesOriginalsAlone()
    {
        using var rig = new WiringRig();
        var plain = Sample.Item(1);
        var approved = Sample.Item(2, replaces: "그새 지워진 메모");

        var (_, result) = rig.Run(plain, approved);

        Assert.Equal(("완료", "입력"), WiringRig.Row(result, plain.VisitKey));
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, approved.VisitKey));
        Assert.Equal(2, rig.Ui.Writes);
        Assert.False(rig.Files.Inside(StoreRig.MonthFile).TryGetProperty("originals", out _));
    }

    [Fact(DisplayName = "AC-037.1 칸이 빈 입력은 이미 있는 목록을 그대로 둔다")]
    public void EmptyBoxKeepsExistingOriginals()
    {
        using var rig = new WiringRig();
        var chart = Sample.Item(1).Chart;
        rig.Ui.Bit[chart] = "글 A";
        rig.Run(Sample.Item(1, memo: "글 B", replaces: "글 A"));

        rig.Ui.Bit.Remove(chart);
        var (_, result) = rig.Run(Sample.Item(1, memo: "글 C"));

        Assert.Equal(("완료", "입력"), WiringRig.Row(result, "v1"));
        Assert.Null(Previous(result, "v1"));
        Assert.Equal(new[] { "글 A" }, Originals(rig, "v1"));
    }

    [Fact(DisplayName = "AC-037.1 바꾼 사람의 줄에만 previousMemo가 있고 다른 줄에는 칸 자체가 없다(null로 쓰지 않음). 숫자만 받는 progress에는 싣지 않는다")]
    public void PreviousMemoOnlyOnReplacedLine()
    {
        using var rig = new WiringRig();
        var replaced = WithBox(rig, 1, replaces: Box);
        var written = Sample.Item(2);
        var same = Sample.Item(3);
        rig.Ui.Bit[same.Chart] = same.Memo;
        var other = WithBox(rig, 4);
        var changed = WithBox(rig, 5, replaces: "승인한 뒤 바뀐 글");
        var dropped = Sample.Item(6);
        rig.Visits[WiringRig.Key(dropped)] = 2;

        var (replies, result) = rig.Run(replaced, written, same, other, changed, dropped);

        Assert.Equal(Box, Previous(result, replaced.VisitKey));
        foreach (var item in new[] { written, same, other, changed, dropped })
        {
            Assert.False(Line(result, item.VisitKey).TryGetProperty("previousMemo", out _), item.VisitKey);
        }
        foreach (var reply in replies.Where(reply => reply.GetProperty("type").GetString() == "progress"))
        {
            Assert.DoesNotContain(Box, reply.GetRawText(), StringComparison.Ordinal);
        }
        Assert.Contains(replies, reply => reply.GetProperty("type").GetString() == "progress");
    }

    [Theory(DisplayName = "AC-037.1 BatchCheck: replaces는 1~4,000자, 틀리면 E-HELPER-BAD-MESSAGE")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(4000, true)]
    [InlineData(4001, false)]
    public void ReplacesLength(int length, bool ok)
    {
        var items = new[] { Sample.Item(1, replaces: new string('글', length)) };
        if (ok)
        {
            BatchCheck.Validate(items);
            return;
        }
        Assert.Equal(ErrorCodes.BadMessage, Assert.ThrowsAny<HelperException>(() => BatchCheck.Validate(items)).Code);
    }

    public static IEnumerable<object[]> TooLongReplaces => new[] { new object[] { "\"" + new string('글', 4001) + "\"" } };

    [Theory(DisplayName = "AC-037.1 명령 표: replaces가 글자가 아니거나 비었거나 4,000자를 넘으면 창이 불리기 전에 E-HELPER-BAD-MESSAGE")]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("null")]
    [InlineData("\"\"")]
    [MemberData(nameof(TooLongReplaces))]
    public void ReplacesShape(string value)
    {
        using var rig = new WiringRig();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        rig.Register(dispatcher);
        var inner = "{\"items\":[{\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\",\"replaces\":" + value + "}]}";
        var sink = new ListSink();

        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }))), sink);

        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-037.1 명령 표를 지나 끝까지: replaces가 딱 4,000자면 통과해 바꾸고 previousMemo와 목록에 글이 그대로 남는다")]
    public void ReplacesAtTheLimit()
    {
        using var rig = new WiringRig();
        var text = new string('글', 4000);
        var item = WithBox(rig, 1, box: text, replaces: text);

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", Replaced), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(text, Previous(result, item.VisitKey));
        Assert.Equal(text, Assert.Single(Originals(rig, item.VisitKey)));
    }

    // ------------------------------------------------------------------
    // AC-037.2 승인한 뒤 바뀐 메모
    // ------------------------------------------------------------------

    [Theory(DisplayName = "AC-037.2 replaces와 칸 글이 다르면 쓰지 않고 건너뜀(원본 문구): 묻지 않기가 켜져 있어도 같다")]
    [InlineData(false)]
    [InlineData(true)]
    public void ChangedAfterApproval(bool noAsk)
    {
        using var rig = new WiringRig();
        if (noAsk) rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1, replaces: "승인한 뒤 바뀐 글");

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", Status(result));
        Assert.Equal(("건너뜀", Changed), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(Box, rig.Ui.Bit[item.Chart]);
        Assert.Empty(Originals(rig, item.VisitKey));
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.2 3번 잇따른 실패에 세지 않는다: 그것만으로 멈추지 않고, 다른 실패와 합쳐 세지도 않는다")]
    public void ChangedIsNotCountedAsFailure()
    {
        using var rig = new WiringRig();
        var items = Enumerable.Range(1, 5).Select(n => WithBox(rig, n, replaces: "승인한 뒤 바뀐 글")).ToArray();
        Assert.Equal("finished", Status(rig.Run(items).Result));
        Assert.Equal(5, rig.Ui.Opens);

        using var mixed = new WiringRig();
        mixed.Ui.Editable = false;
        var first = WithBox(mixed, 1, replaces: "승인한 뒤 바뀐 글");
        var second = WithBox(mixed, 2, replaces: "승인한 뒤 바뀐 글");

        // 칸을 편집할 수 없는 건너뜀 둘은 3번이 아니다. 바뀐 메모를 세면 여기서 멈춘다
        var (_, result) = mixed.Run(first, second, Sample.Item(3), Sample.Item(4), Sample.Item(5));
        Assert.Equal(("건너뜀", "청구메모 칸이 편집할 수 없는 상태입니다."), WiringRig.Row(result, "v3"));
        Assert.Equal(("건너뜀", "청구메모 칸이 편집할 수 없는 상태입니다."), WiringRig.Row(result, "v4"));
        Assert.Equal(("건너뜀", "청구메모 칸이 편집할 수 없는 상태입니다."), WiringRig.Row(result, "v5"));
        Assert.Equal(5, mixed.Ui.Opens);
        Assert.Equal("stopped", Status(result));
        Assert.Contains("연속 3명 실패", Reason(result)!, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-037.2 빈 칸이 쓰기 바로 앞에서 채워지면 쓰지 않고 건너뜀(원본 문구)이고 3번 잇따른 실패에 세지 않는다: 그것만으로 멈추지 않고, 다른 실패와 합쳐 세지도 않는다")]
    public void BoxFilledJustBeforeWriting()
    {
        const string Filled = "누가 막 쓴 글";
        using var rig = new WiringRig();
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "editable") rig.Ui.Editor = Filled;
        };

        var (_, result) = rig.Run(Sample.Item(1), Sample.Item(2), Sample.Item(3), Sample.Item(4));

        Assert.Equal("finished", Status(result));
        foreach (var key in new[] { "v1", "v2", "v3", "v4" })
        {
            Assert.Equal(("건너뜀", Changed), WiringRig.Row(result, key));
        }
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(Originals(rig, "v1"));
        Assert.Equal(4, rig.Ui.Opens);

        // 위만으로는 세어도 멈추지 않는다: 이 건너뜀은 person.Review라 멈춤 검사를 지난다. 편집할 수 없는 건너뜀 둘과 합쳐 세면 셋째에서 멈춘다
        using var mixed = new WiringRig();
        var first = Sample.Item(1);
        mixed.Ui.OnCall = (call, _) =>
        {
            if (call != "editable") return;
            if (mixed.Ui.OpenChart == first.Chart) mixed.Ui.Editor = Filled;
            else mixed.Ui.Editable = false;
        };

        var (_, withOthers) = mixed.Run(first, Sample.Item(2), Sample.Item(3));

        Assert.Equal("finished", Status(withOthers));
        Assert.Equal(("건너뜀", Changed), WiringRig.Row(withOthers, first.VisitKey));
        Assert.Equal(("건너뜀", "청구메모 칸이 편집할 수 없는 상태입니다."), WiringRig.Row(withOthers, "v3"));
        Assert.Equal(0, mixed.Ui.Writes);
    }

    [Fact(DisplayName = "AC-037.2 AC-018.20 '이미 있음' 셋 뒤에 빈 칸이 쓰기 바로 앞에서 채워져도 그 사람에서 멈추지 않는다(Review)")]
    public void BoxFilledAfterThreeOthersDoesNotStop()
    {
        using var rig = new WiringRig();
        var others = Enumerable.Range(1, 3).Select(n => WithBox(rig, n)).ToArray();
        var filled = Sample.Item(4);
        var next = Sample.Item(5);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "editable" && rig.Ui.OpenChart == filled.Chart) rig.Ui.Editor = "누가 막 쓴 글";
        };

        var (_, result) = rig.Run(others[0], others[1], others[2], filled, next);

        Assert.Equal("finished", Status(result));
        Assert.Equal(("건너뜀", Changed), WiringRig.Row(result, filled.VisitKey));
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, next.VisitKey));
        Assert.Equal(5, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-037.2 AC-037.6 칸을 읽지 못하면 바꾸지 않고 멈춘다: 첫 읽기·쓰기 바로 앞 읽기, replaces·묻지 않기 각각")]
    [InlineData(true, false, "first")]
    [InlineData(false, true, "first")]
    [InlineData(true, false, "second")]
    [InlineData(false, true, "second")]
    public void UnreadableBoxStops(bool approved, bool noAsk, string when)
    {
        using var rig = new WiringRig();
        if (noAsk) rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1, replaces: approved ? Box : null);
        var next = Sample.Item(2);
        if (when == "first") rig.Ui.ReadFails = true;
        else
        {
            rig.Ui.OnCall = (call, _) =>
            {
                if (call == "editable") rig.Ui.ReadFails = true;
            };
        }

        var (_, result) = rig.Run(item, next);

        Assert.Equal("stopped", Status(result));
        Assert.Equal("E-INPUT-STOPPED", Code(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(Originals(rig, item.VisitKey));
        Assert.Equal(1, rig.Ui.Opens);
    }

    [Theory(DisplayName = "AC-037.2 AC-037.6 쓰기 바로 앞 마지막 읽기에서 칸을 못 읽어도 쓰지 않고 멈춘다: 다음 사람을 열지 않고 쓰다 멈춘 기록도 남지 않는다")]
    [InlineData(true)]
    [InlineData(false)]
    public void UnreadableAtLastReadStops(bool approved)
    {
        using var rig = new WiringRig();
        if (!approved) rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1, replaces: approved ? Box : null);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "select") rig.Ui.ReadFails = true;
        };

        var (_, result) = rig.Run(item, Sample.Item(2));

        Assert.Equal("stopped", Status(result));
        Assert.Equal("E-INPUT-STOPPED", Code(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(Box, rig.Ui.Editor);
        Assert.Equal(JournalState.Check, rig.Reopen().LastState(item));
    }

    // ------------------------------------------------------------------
    // AC-037.3 창 글의 수
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-037.3 '다른 메모를 바꾸는 환자 N명'이 나오고 메모 글은 보이지 않는다. 바꾸는 사람이 없으면 줄이 없다")]
    public void PromptCountsReplacing()
    {
        using var rig = new WiringRig();
        var first = WithBox(rig, 1, replaces: Box);
        var second = WithBox(rig, 2, replaces: Box);

        rig.Run(first, second, Sample.Item(3));

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Contains("다른 메모를 바꾸는 환자 2명", text, StringComparison.Ordinal);
        Assert.DoesNotContain(Box, text, StringComparison.Ordinal);
        Assert.DoesNotContain("다른 메모를 바꾸는", InputPrompt.Build(Sample.Items(2), Sample.Registration), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-037.3 AC-035.5 replaces가 함께 온 checkedByHand는 바꾸지 않으므로 '바꾸는 환자'에 세지 않는다")]
    public void PromptDoesNotCountHand()
    {
        var text = InputPrompt.Build(new[] { Sample.Item(1, replaces: Box, checkedByHand: true), Sample.Item(2, replaces: Box) }, Sample.Registration);

        Assert.Contains("다른 메모를 바꾸는 환자 1명", text, StringComparison.Ordinal);
        Assert.Contains("직접 확인한 환자 1명", text, StringComparison.Ordinal);
    }

    // ------------------------------------------------------------------
    // AC-037.4 묻지 않기 켜기·끝 답
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-037.4 처음 창은 꺼져 있고, 켜고 [확인]을 누르면 다음 묶음은 창 없이 시작한다. 프로세스가 새로 뜨면 꺼져 있다")]
    public void TurnedOnByTheWindow()
    {
        using var rig = new WiringRig();
        rig.Confirm.Tick = true;

        var (_, first) = rig.Run(Sample.Item(1));

        Assert.Equal(new[] { false }, rig.Confirm.NoAskOnShown);
        Assert.True(first.GetProperty("noAsk").GetBoolean());

        rig.Confirm.Tick = false;
        var (_, second) = rig.Run(Sample.Item(2));

        Assert.Single(rig.Confirm.Shown);
        Assert.Equal(("완료", "입력"), WiringRig.Row(second, "v2"));
        Assert.True(second.GetProperty("noAsk").GetBoolean());

        using var fresh = new WiringRig();
        var (_, again) = fresh.Run(Sample.Item(3));
        Assert.Single(fresh.Confirm.Shown);
        Assert.False(again.GetProperty("noAsk").GetBoolean());
    }

    [Theory(DisplayName = "AC-037.4 켜고 [취소]·창 닫기·5분 지남·표준 입력 닫힘이면 켜지지 않는다")]
    [InlineData(NoAnswer.Cancel)]
    [InlineData(NoAnswer.WindowClosed)]
    [InlineData(NoAnswer.TimedOut)]
    [InlineData(NoAnswer.ClosedWhileAnswering)]
    public void TickWithoutConfirmDoesNothing(NoAnswer kind)
    {
        using var rig = new WiringRig();
        rig.Confirm.Tick = true;
        rig.Refuse(kind);

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.False(rig.NoAsk.IsOn);
        Assert.Equal("cancelled", Status(result));
        Assert.False(result.GetProperty("noAsk").GetBoolean());
        Assert.Equal(0, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-037.4 끝 답 JSON에 noAsk를 싣는다: 완료·취소·멈춤·창 앞 멈춤·모두 빠짐, 꺼짐이면 거짓")]
    public void NoAskInEveryAnswer()
    {
        using (var off = new WiringRig())
        {
            Assert.False(off.Run(Sample.Item(1)).Result.GetProperty("noAsk").GetBoolean());
            off.Confirm.Answer = false;
            Assert.False(off.Run(Sample.Item(2)).Result.GetProperty("noAsk").GetBoolean());
        }

        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();

        // 완료
        Assert.True(rig.Run(Sample.Item(1)).Result.GetProperty("noAsk").GetBoolean());

        // 멈춤(지문)
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));
        var (_, stopped) = rig.Run(Sample.Item(2));
        Assert.Equal("stopped", Status(stopped));
        Assert.True(stopped.GetProperty("noAsk").GetBoolean());
        rig.Ui.FingerprintAt = null;

        // 취소: 직접 확인이 있어 창이 뜨고 [취소]
        rig.Confirm.Answer = false;
        var (_, cancelled) = rig.Run(Sample.Item(2, checkedByHand: true));
        Assert.Equal("cancelled", Status(cancelled));
        Assert.True(cancelled.GetProperty("noAsk").GetBoolean());
        rig.Confirm.Answer = true;

        // 모두 빠짐
        var dropped = Sample.Item(3);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var (_, allDropped) = rig.Run(dropped);
        Assert.Equal("finished", Status(allDropped));
        Assert.True(allDropped.GetProperty("noAsk").GetBoolean());

        // 창 앞 멈춤: 쓰다 멈춘 사람이 묶음 밖
        var stuck = Sample.Item(4);
        rig.Reopen().Mark(stuck, JournalState.Writing);
        var (_, blocked) = rig.Run(Sample.Item(5));
        Assert.Equal("stopped", Status(blocked));
        Assert.True(blocked.GetProperty("noAsk").GetBoolean());
    }

    [Fact(DisplayName = "AC-037.4 [확인]이면 그 뒤 묶음이 멈춰도 켜져 있다")]
    public void TickStaysAfterStop()
    {
        using var rig = new WiringRig();
        rig.Confirm.Tick = true;
        rig.Ui.Filter = new ListFilter("2026-01-01", "2026-01-02", "", false, null);

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("stopped", Status(result));
        Assert.True(result.GetProperty("noAsk").GetBoolean());
        Assert.True(rig.NoAsk.IsOn);
    }

    [Fact(DisplayName = "AC-037.4 켜져 있어도 지문·내원 수·내원내역 칸 검사는 그대로 한다")]
    public void ChecksStayWhenOn()
    {
        using (var fingerprint = new WiringRig())
        {
            fingerprint.NoAsk.TurnOn();
            fingerprint.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));
            var (_, result) = fingerprint.Run(WithBox(fingerprint, 1));
            Assert.Equal("E-BIT-UI-CHANGED", Code(result));
            Assert.Equal(0, fingerprint.Ui.Opens);
        }

        using (var visits = new WiringRig())
        {
            visits.NoAsk.TurnOn();
            var item = WithBox(visits, 1);
            visits.Visits[WiringRig.Key(item)] = 2;
            var (_, result) = visits.Run(item);
            Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, item.VisitKey));
            Assert.Equal(0, visits.Ui.Opens);
            Assert.Contains("visits", visits.Steps);
        }

        using (var filter = new WiringRig())
        {
            filter.NoAsk.TurnOn();
            filter.Ui.Filter = new ListFilter("2026-01-01", "2026-01-02", "", false, null);
            var (_, result) = filter.Run(WithBox(filter, 1));
            Assert.Equal("stopped", Status(result));
            Assert.Equal(0, filter.Ui.Opens);
            Assert.Equal(0, filter.Ui.Writes);
        }
    }

    [Fact(DisplayName = "AC-037.4 AC-017.9 켜져 있어도 표준 입력이 이미 닫혔으면 아무도 열지 않는다")]
    public void ClosedBeforeStartWhenOn()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        rig.Refuse(NoAnswer.ClosedBeforeAsk);

        var (_, result) = rig.Run(WithBox(rig, 1));

        Assert.Equal("cancelled", Status(result));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.True(result.GetProperty("noAsk").GetBoolean());
    }

    [Fact(DisplayName = "AC-037.4 AC-035.5 켜져 있어도 checkedByHand가 있는 묶음은 창을 띄운다: 열 사람")]
    public void WindowForHandToOpen()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();

        rig.Run(Sample.Item(1, checkedByHand: true), Sample.Item(2));

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Equal(new[] { true }, rig.Confirm.NoAskOnShown);
        Assert.Contains("직접 확인한 환자 1명", text, StringComparison.Ordinal);
        Assert.Contains("· " + NoteOn + "\r\n", text, StringComparison.Ordinal);
        Assert.DoesNotContain(NoteOff, text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-037.4 AC-035.8 켜져 있어도 풀 사람이 있는 묶음은 창을 띄운다")]
    public void WindowForReleased()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var item = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(item)] = 2;
        rig.Reopen().Mark(item, JournalState.Writing);

        rig.Run(item);

        Assert.Contains("직접 확인한 환자 1명의 입력 멈춤을 풀까요?", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.4 AC-035.5 켜져 있어도 쓰다 멈추지 않고 미리 빠지는 checkedByHand가 섞이면 창을 띄운다: 창이 없으면 다음 묶음의 보호를 잃는다")]
    public void WindowForDroppedHand()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var hand = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;

        rig.Run(hand, Sample.Item(2));

        Assert.Contains("빼는 환자 1명", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(hand));
    }

    [Fact(DisplayName = "AC-035.9 AC-037.4 묻지 않기 켜짐: 확인할 수 없는 기록이 있으면 창이 불린다(주의 줄은 켜진 창 글). [취소]면 stopped이고, [확인] 뒤 다음 묶음은 창이 없다")]
    public void UnknownRecordsAskEvenWhenOn()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        rig.Files.Plant(OldMonth, Garbage);

        rig.Confirm.Answer = false;
        var (_, refused) = rig.Run(Sample.Item(1));
        Assert.Equal("stopped", Status(refused));
        Assert.Equal("E-INPUT-STOPPED", Code(refused));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.True(refused.GetProperty("noAsk").GetBoolean());

        rig.Confirm.Answer = true;
        var (_, result) = rig.Run(Sample.Item(1));
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.StartsWith(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Contains("· " + NoteOn + "\r\n", rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, "v1"));

        var (_, next) = rig.Run(Sample.Item(2));
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.Equal(("완료", "입력"), WiringRig.Row(next, "v2"));
    }

    [Fact(DisplayName = "AC-035.9 AC-037.4 그런 파일이 없는 PC에서 묻지 않기 켜짐: Ask가 불리지 않고 input-acks.dat가 생기지 않는다")]
    public void NoUnknownRecordsNoWindowNoAcks()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, "v1"));
        Assert.DoesNotContain(WorkStore.AcksFile, rig.Files.Names());
    }

    // ------------------------------------------------------------------
    // AC-037.5 웹은 켤 수 없다
    // ------------------------------------------------------------------

    [Theory(DisplayName = "AC-037.5 어느 자리에 '묻지 않기' 칸을 넣어도 모르는 칸이라 E-HELPER-BAD-MESSAGE이고 창도 켜짐도 없다")]
    [InlineData("{\"noAsk\":true,\"items\":[{\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\"}]}")]
    [InlineData("{\"items\":[{\"noAsk\":true,\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\"}]}")]
    public void SiteCannotTurnOn(string inner)
    {
        using var rig = new WiringRig();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        rig.Register(dispatcher);
        var sink = new ListSink();

        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }))), sink);

        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.False(rig.NoAsk.IsOn);
    }

    [Fact(DisplayName = "AC-037.5 처음 묶음은 어떤 페이로드든 확인 창을 부른다")]
    public void FirstBatchAlwaysAsks()
    {
        using var rig = new WiringRig();
        var approved = WithBox(rig, 1, replaces: Box);
        rig.EditPayload = fields => fields["code"] = "LA358";

        rig.Run(approved, Sample.Item(2));

        Assert.Single(rig.Confirm.Shown);
        Assert.Equal(new[] { false }, rig.Confirm.NoAskOnShown);
    }

    // ------------------------------------------------------------------
    // AC-037.6 켜진 뒤의 다른 메모
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-037.6 묶음 시작 때 켜져 있으면 승인 없는 다른 메모가 바뀌고 원래 메모가 달 파일과 결과에 남는다. 창은 없다")]
    public void UnapprovedIsReplacedWhenOn()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1);

        var (_, result) = rig.Run(item);

        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(("완료", Replaced), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(Box, Previous(result, item.VisitKey));
        Assert.Equal(new[] { Box }, Originals(rig, item.VisitKey));
        Assert.Equal(item.Memo, rig.Ui.Bit[item.Chart]);
    }

    [Fact(DisplayName = "AC-037.6 체크를 켠 그 묶음의 다른 메모는 꺼졌을 때처럼 건너뜀이고, 다음 묶음부터 바뀐다")]
    public void TickAppliesFromNextBatch()
    {
        using var rig = new WiringRig();
        rig.Confirm.Tick = true;
        var other = WithBox(rig, 1);
        var plain = Sample.Item(2);

        var (_, first) = rig.Run(other, plain);

        Assert.Equal(("건너뜀", Already), WiringRig.Row(first, other.VisitKey));
        Assert.Equal(("완료", "입력"), WiringRig.Row(first, plain.VisitKey));
        Assert.Equal(1, rig.Ui.Writes);
        Assert.Equal(Box, rig.Ui.Bit[other.Chart]);
        Assert.True(first.GetProperty("noAsk").GetBoolean());

        var (_, second) = rig.Run(other);

        Assert.Single(rig.Confirm.Shown);
        Assert.Equal(("완료", Replaced), WiringRig.Row(second, other.VisitKey));
    }

    [Fact(DisplayName = "AC-037.6 AC-016.3 승인을 풀어 replaces 없이 온 사람: 꺼져 있으면 건너뜀, 켜져 있으면 바뀐다")]
    public void ReleasedApprovalGoesWithoutReplaces()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1);

        var (_, off) = rig.Run(item);
        Assert.Equal(("건너뜀", Already), WiringRig.Row(off, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);

        rig.NoAsk.TurnOn();
        var (_, on) = rig.Run(item);
        Assert.Equal(("완료", Replaced), WiringRig.Row(on, item.VisitKey));
        Assert.Equal(Box, Previous(on, item.VisitKey));
    }

    [Fact(DisplayName = "AC-017.3 AC-037.6 꺼져 있으면 replaces 없는 다른 메모는 지금처럼 건너뜀(이미 있음)이고 originals가 없다")]
    public void UnapprovedIsSkippedWhenOff()
    {
        using var rig = new WiringRig();
        var item = WithBox(rig, 1);

        var (_, result) = rig.Run(item);

        Assert.Equal(("건너뜀", Already), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(item));
    }

    [Theory(DisplayName = "AC-037.6 AC-035.5 checkedByHand이고 칸이 다르면 묻지 않기가 켜져 있어도 replaces가 함께 와도 WriteMemo가 불리지 않고 건너뜀(이미 있음), 기록은 SkippedByHand")]
    [InlineData(false, null)]
    [InlineData(false, Box)]
    [InlineData(true, null)]
    [InlineData(true, Box)]
    public void HandIsNeverReplaced(bool noAsk, string? replaces)
    {
        using var rig = new WiringRig();
        if (noAsk) rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1, replaces: replaces, hand: true);

        var (_, result) = rig.Run(item);

        Assert.Single(rig.Confirm.Shown);
        Assert.Equal(("건너뜀", Already), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Null(Previous(result, item.VisitKey));
        Assert.Empty(Originals(rig, item.VisitKey));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.6 SkippedByHand 기록이 있으면 묻지 않기가 켜져 있어도 replaces 없이는 WriteMemo가 불리지 않고, 다시 건너뛰어도 기록이 그대로이며, replaces가 있으면 바뀐다")]
    public void HandRecordNeedsApproval()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1);
        rig.Reopen().Mark(item, JournalState.SkippedByHand);

        var (_, skipped) = rig.Run(item);

        Assert.Equal(("건너뜀", Already), WiringRig.Row(skipped, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));

        var (_, approved) = rig.Run(Sample.Item(1, replaces: Box));

        Assert.Equal(("완료", Replaced), WiringRig.Row(approved, item.VisitKey));
        Assert.Equal(Box, Previous(approved, item.VisitKey));
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.6 SkippedByHand 기록이 있는 사람이 묶음이 멈춰 미처리로 끝나도, 원래 메모를 못 남겨 멈춰도 기록이 그대로다")]
    public void HandRecordSurvivesStops()
    {
        using (var stopped = new WiringRig())
        {
            stopped.NoAsk.TurnOn();
            var first = Sample.Item(1);
            var second = WithBox(stopped, 2);
            stopped.Reopen().Mark(second, JournalState.SkippedByHand);
            // 첫 지문은 묶음 앞, 둘째가 첫 사람 차례다
            stopped.Ui.FingerprintAt = number => number == 2 ? Sample.With(("txtBilCmt", 0)) : Sample.AllFound();

            var (_, result) = stopped.Run(first, second);

            Assert.Equal("stopped", Status(result));
            Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, second.VisitKey));
            Assert.Equal(JournalState.SkippedByHand, stopped.Reopen().LastState(second));
        }

        using var failed = new WiringRig();
        var item = WithBox(failed, 1, replaces: Box);
        failed.Reopen().Mark(item, JournalState.SkippedByHand);
        failed.WrapJournal = journal => new JournalSpy(journal, failed.Steps) { OriginalFailsFor = item.VisitKey };

        var (_, answer) = failed.Run(item);

        Assert.Equal("E-STORE-FAILED", Code(answer));
        Assert.Equal(0, failed.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, failed.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-037.6 AC-035.5 SkippedByHand 기록이 있는 사람의 쓰기가 칸에 글을 남기지 않으면 기록이 그대로이고, 글이 남았을 수 있으면 WriteUnconfirmed다")]
    public void HandRecordAfterWriteAttempt()
    {
        using (var nothing = new WiringRig())
        {
            var item = WithBox(nothing, 1, replaces: Box);
            nothing.Reopen().Mark(item, JournalState.SkippedByHand);
            nothing.Ui.ReplaceWorks = false;
            nothing.Ui.ValueWorks = false;

            var (_, result) = nothing.Run(item);

            Assert.Equal("stopped", Status(result));
            Assert.Equal(JournalState.SkippedByHand, nothing.Reopen().LastState(item));
        }

        using var partial = new WiringRig();
        var person = WithBox(partial, 1, replaces: Box);
        partial.Reopen().Mark(person, JournalState.SkippedByHand);
        partial.Ui.ReplaceWorks = false;
        partial.Ui.ValueWorks = false;
        partial.Ui.OnCall = (call, _) =>
        {
            if (call == "value?") partial.Ui.Editor = "반만 들어간 글";
        };

        partial.Run(person);

        Assert.Equal(JournalState.WriteUnconfirmed, partial.Reopen().LastState(person));
    }

    [Fact(DisplayName = "AC-037.6 AC-035.5 checkedByHand로 온 사람이 차례 전에 묶음이 멈춰 미처리로 끝나도 SaveResults 뒤 기록이 SkippedByHand라 묻지 않기를 켠 다음 묶음에서 replaces 없이 WriteMemo가 불리지 않는다")]
    public void HandStoppedBeforeTurnIsProtected()
    {
        using var rig = new WiringRig();
        var first = Sample.Item(1, checkedByHand: true);
        var second = WithBox(rig, 2, hand: true);
        rig.Ui.FingerprintAt = number => number == 2 ? Sample.With(("txtBilCmt", 0)) : Sample.AllFound();

        var (_, stopped) = rig.Run(first, second);

        Assert.Equal("stopped", Status(stopped));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(second));

        rig.Ui.FingerprintAt = null;
        rig.NoAsk.TurnOn();
        var (_, next) = rig.Run(Sample.Item(2));

        Assert.Equal(("건너뜀", Already), WiringRig.Row(next, second.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
    }

    [Theory(DisplayName = "AC-037.6 AC-017.7 쓰다 멈춘 사람은 켜져 있어도 replaces가 와도 바꾸지 않고 멈춘다")]
    [InlineData(null)]
    [InlineData(Box)]
    public void StuckIsNeverReplaced(string? replaces)
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var item = WithBox(rig, 1, replaces: replaces);
        rig.Reopen().Mark(item, JournalState.Writing);

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", Status(result));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Empty(Originals(rig, item.VisitKey));
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Reopen().LastState(item));
    }

    // ------------------------------------------------------------------
    // AC-037.7 확인 표시
    // ------------------------------------------------------------------

    [Theory(DisplayName = "AC-037.7 확인 표시가 남은 메모는 켜져 있어도 replaces가 와도 열지 않고 건너뜀, 다른 메모를 바꾸지 않는다")]
    [InlineData(null)]
    [InlineData(Box)]
    public void OpenMarkIsHeldWhenOn(string? replaces)
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();
        var item = Sample.Item(1, memo: "주사 [부위 확인]", replaces: replaces);
        rig.Ui.Bit[item.Chart] = Box;
        var plain = Sample.Item(2);

        var (_, result) = rig.Run(item, plain);

        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(("건너뜀", OpenMark), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, plain.VisitKey));
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(Box, rig.Ui.Bit[item.Chart]);
    }

    [Fact(DisplayName = "AC-037.7 켜진 채 뜬 창에서도 확인 표시는 '빼는 환자 N명'에 센다")]
    public void OpenMarkCountedInWindowWhenOn()
    {
        using var rig = new WiringRig();
        rig.NoAsk.TurnOn();

        rig.Run(Sample.Item(1, memo: "주사 [부위 확인]"), Sample.Item(2, checkedByHand: true));

        Assert.Contains("빼는 환자 1명", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
    }

    // ------------------------------------------------------------------
    // AC-037.8 글
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-037.8 체크 글을 글자까지 본다")]
    public void LabelText() => Assert.Equal(Label, InputPrompt.NoAskLabel);

    [Fact(DisplayName = "AC-037.8 꺼진 창의 주의 줄: 앞 문장과 나눠 따로 한 줄이다")]
    public void CautionWhenOff()
    {
        Assert.Equal(
            "비트에 청구메모를 입력할까요?\r\n\r\n10/27, 1명 입력할까요?\r\n기관기호 1234****\r\n\r\n주의\r\n"
            + "· 비트 내원내역 창을 10/27 기간이 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.\r\n"
            + "· 먼저 비트의 저장 안 한 작업을 마치세요. 내원내역 목록이 다른 창에 가려지면 멈춥니다.\r\n"
            + "· 환자마다 열린 내원의 진료일이 맞을 때만 입력합니다.\r\n"
            + "· " + NoteOff + "\r\n"
            + "· 입력하는 동안 마우스와 키보드를 쓰지 마세요.",
            InputPrompt.Build(Sample.Items(1), Sample.Registration));
    }

    [Fact(DisplayName = "AC-037.8 켜진 채 뜨는 창의 주의 줄")]
    public void CautionWhenOn()
    {
        var text = InputPrompt.Build(Sample.Items(1), Sample.Registration, noAskOn: true);

        Assert.Contains("· 환자마다 열린 내원의 진료일이 맞을 때만 입력합니다.\r\n· " + NoteOn + "\r\n· 입력하는 동안", text, StringComparison.Ordinal);
        Assert.DoesNotContain(NoteOff, text, StringComparison.Ordinal);
        Assert.DoesNotContain("아래 체크", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.9 창 맨 위 글은 있을 때만 따로 나온다(노란 바탕 자리): 글은 그대로이고 나머지에 겹치지 않는다")]
    public void TopNoticeSplits()
    {
        var plain = InputPrompt.Build(Sample.Items(1), Sample.Registration);
        Assert.Null(InputPrompt.SplitNotice(plain, out var plainRest));
        Assert.Equal(plain, plainRest);

        var asked = InputPrompt.Build(Sample.Items(1), Sample.Registration, recordsNotice: true);
        Assert.Equal(Notice, InputPrompt.SplitNotice(asked, out var rest));
        Assert.Equal(plain, rest);
        Assert.Equal(asked, Notice + "\r\n\r\n" + rest);
    }

    // ------------------------------------------------------------------
    // TASK-35 리뷰에서 온 일: [확인] 뒤 미리 빠진 checkedByHand (AC-035.2·AC-035.5·AC-035.8)
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-035.2 AC-035.5 [확인] 뒤 미리 빠진 checkedByHand: SaveResults 뒤 LastState가 SkippedByHand이고 묻지 않기를 켠 다음 묶음에서 replaces 없이 WriteMemo가 불리지 않는다. 줄과 이유는 그대로다")]
    public void DroppedHandAfterConfirmIsProtected()
    {
        using var rig = new WiringRig();
        var hand = WithBox(rig, 1, hand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;
        var other = Sample.Item(2);
        var plainDropped = Sample.Item(3);
        rig.Visits[WiringRig.Key(plainDropped)] = 2;

        var (_, result) = rig.Run(hand, other, plainDropped);

        Assert.Contains("빼는 환자 2명", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, hand.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(hand));
        Assert.Equal(JournalState.Skipped, reopened.LastState(plainDropped));

        rig.Visits.Clear();
        rig.NoAsk.TurnOn();
        var writes = rig.Ui.Writes;
        var (_, next) = rig.Run(Sample.Item(1));

        Assert.Equal(("건너뜀", Already), WiringRig.Row(next, hand.VisitKey));
        Assert.Equal(writes, rig.Ui.Writes);
    }

    [Fact(DisplayName = "AC-035.5 AC-035.8 [확인] 뒤 미리 빠진 사람의 Mark 실패: 아무도 열지 않고 E-STORE-FAILED, 줄은 있고 그 사람에게 skipped가 적히지 않는다. 깃발 없는 빠진 사람은 그대로 skipped")]
    public void DroppedHandMarkFails()
    {
        using var rig = new WiringRig();
        var hand = Sample.Item(1, checkedByHand: true);
        var later = Sample.Item(2, checkedByHand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;
        rig.Visits[WiringRig.Key(later)] = 2;
        var plainDropped = Sample.Item(3);
        rig.Visits[WiringRig.Key(plainDropped)] = 2;
        var other = Sample.Item(4);
        rig.WrapJournal = journal => new JournalSpy(journal, rig.Steps) { MarkFailsFor = hand.VisitKey };

        var (_, result) = rig.Run(hand, later, plainDropped, other);

        Assert.Equal("stopped", Status(result));
        Assert.Equal("E-STORE-FAILED", Code(result));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, hand.VisitKey));
        Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, later.VisitKey));
        Assert.Equal(("건너뜀", TwoVisits), WiringRig.Row(result, plainDropped.VisitKey));
        var reopened = rig.Reopen();
        Assert.Null(reopened.LastState(hand));
        Assert.Null(reopened.LastState(later));
        Assert.Equal(JournalState.Skipped, reopened.LastState(plainDropped));
    }

    [Fact(DisplayName = "AC-035.5 AC-037.6 창 없이 모두 빠진 checkedByHand는 Skipped이고 이 보호가 없어 묻지 않기를 켠 다음 묶음에서 바뀐다")]
    public void DroppedHandWithoutWindowIsNotProtected()
    {
        using var rig = new WiringRig();
        var hand = WithBox(rig, 1, hand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;

        rig.Run(hand);

        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(hand));

        rig.Visits.Clear();
        rig.NoAsk.TurnOn();
        var (_, next) = rig.Run(Sample.Item(1));

        Assert.Equal(("완료", Replaced), WiringRig.Row(next, hand.VisitKey));
    }

    [Fact(DisplayName = "AC-035.5 지문이 틀려 창을 띄우지 않은 묶음의 미리 빠진 checkedByHand는 Skipped이고 이미 있는 SkippedByHand는 덮지 않는다")]
    public void DroppedHandWithBadFingerprint()
    {
        using var rig = new WiringRig();
        var hand = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;
        var kept = Sample.Item(2, checkedByHand: true);
        rig.Visits[WiringRig.Key(kept)] = 2;
        rig.Reopen().Mark(kept, JournalState.SkippedByHand);
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));

        rig.Run(hand, kept, Sample.Item(3));

        Assert.Empty(rig.Confirm.Shown);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Skipped, reopened.LastState(hand));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(kept));
    }

    [Fact(DisplayName = "AC-035.5 AC-035.8 [확인] 뒤 내원내역 칸 확인에서 멈춰도 미리 빠진 checkedByHand는 SkippedByHand다")]
    public void DroppedHandKeepsRecordWhenPeriodStops()
    {
        using var rig = new WiringRig();
        var hand = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(hand)] = 2;
        rig.Ui.Filter = new ListFilter("2026-01-01", "2026-01-02", "", false, null);

        var (_, result) = rig.Run(hand, Sample.Item(2));

        Assert.Equal("stopped", Status(result));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(hand));
    }

    // ------------------------------------------------------------------
    // TASK-35 리뷰에서 온 일: 깨진 달 파일의 reason (AC-035.9)
    // ------------------------------------------------------------------

    [Fact(DisplayName = "AC-035.9 .bak 없는 깨진 달에 이번 묶음 환자가 있음: 첫 [확인]이 E-STORE-FAILED와 reason이고 OpenPatient 없음, 답 모양은 그대로, 다음 누름은 그 창 없이 이어진다")]
    public void BrokenMonthWithoutBackup()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var item = Sample.Item(1, date: "2026-08-10");

        var (_, first) = rig.Run(item);

        Assert.Equal("stopped", Status(first));
        Assert.Equal("E-STORE-FAILED", Code(first));
        Assert.Equal(SetAside, Reason(first));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(first, item.VisitKey));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain(OldMonth, rig.Files.Names());

        var (_, second) = rig.Run(item);

        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Equal("finished", Status(second));
        Assert.Null(Reason(second));
        Assert.Equal(("완료", "입력"), WiringRig.Row(second, item.VisitKey));
    }

    [Fact(DisplayName = "AC-035.9 .bak도 깨져 함께 이름이 바뀐 달도 같은 reason이다")]
    public void BrokenMonthWithBrokenBackup()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Files.Plant(OldMonth + ".bak", Encoding.ASCII.GetBytes("garbage too"));

        var (_, first) = rig.Run(Sample.Item(1, date: "2026-08-10"));

        Assert.Equal("E-STORE-FAILED", Code(first));
        Assert.Equal(SetAside, Reason(first));
    }

    [Fact(DisplayName = "AC-035.9 다른 프로필 ID로 멈춘 때는 reason이 없다. 번호는 E-STORE-FAILED 그대로다")]
    public void OtherHospitalHasNoReason()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, rig.Files.GoodMonth(profileId: StoreRig.OtherProfile));

        var (_, first) = rig.Run(Sample.Item(1, date: "2026-08-10"));

        Assert.Equal("stopped", Status(first));
        Assert.Equal("E-STORE-FAILED", Code(first));
        Assert.Null(Reason(first));
        Assert.Equal(0, rig.Ui.Opens);
    }

    [Fact(DisplayName = "AC-035.9 맞는 .bak으로 되살린 달은 멈추지 않고 reason도 없다")]
    public void RestoredMonthHasNoReason()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Files.Plant(OldMonth + ".bak", rig.Files.GoodMonth());
        var item = Sample.Item(1, date: "2026-08-10");

        var (_, first) = rig.Run(item);

        Assert.Equal("finished", Status(first));
        Assert.Null(Reason(first));
        Assert.Equal(("완료", "입력"), WiringRig.Row(first, item.VisitKey));
    }
}
