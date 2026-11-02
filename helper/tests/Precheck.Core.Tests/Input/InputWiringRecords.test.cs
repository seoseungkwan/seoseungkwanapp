using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Input;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Store;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// 확인할 수 없는 기록(AC-035.9): 깨진 달 파일·.broken-*·다른 프로필 ID 파일. 검사는 고치지 않고, 바이트 해시로 한 번 묻는다.
/// 비트 화면·확인 창·DB는 가짜, 입력 기록은 진짜 WorkStoreJournal(가짜 암호화·임시 폴더)이다. 자료는 모두 지어낸 것이다.
/// 묻지 않기가 켜진 때의 시험 둘은 AC-037.4(TASK-37)다.
/// </summary>
public class InputWiringRecordsTests
{
    private const string Acks = "input-acks.dat";
    private const string OldMonth = "work-2026-08.dat";
    private const string Notice = "입력 기록의 일부를 확인할 수 없습니다. 먼저 비트에 열려 있는 환자의 메모 칸을 확인해 주세요. 저장하지 않은 글이 있으면 마무리한 뒤 [확인]을 눌러 주세요.";
    private const string Refused = "입력 기록의 일부를 확인할 수 없어 아무도 열지 않았습니다. 비트에 열려 있는 환자의 메모 칸을 확인한 뒤 다시 눌러 주세요.";

    private static readonly byte[] Garbage = Encoding.ASCII.GetBytes("garbage");

    private sealed class SpyProtector : IProtector
    {
        private readonly FakeProtector inner;

        public SpyProtector(FakeProtector inner)
        {
            this.inner = inner;
        }

        public List<byte[]> Opened { get; } = new List<byte[]>();
        public bool FailProtect { get; set; }

        public byte[] Protect(byte[] plain) => FailProtect ? throw new CryptographicException("가짜: 암호화 실패") : inner.Protect(plain);

        public byte[] Unprotect(byte[] cipher)
        {
            Opened.Add(cipher);
            return inner.Unprotect(cipher);
        }
    }

    private static SortedDictionary<string, string> Snapshot(WiringRig rig) =>
        new SortedDictionary<string, string>(rig.Files.Names().ToDictionary(name => name, name => Convert.ToBase64String(rig.Files.Bytes(name))), StringComparer.Ordinal);

    private static string Sha(byte[] data)
    {
        using var sha = SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
    }

    private static string[] SavedHashes(WiringRig rig)
    {
        var inside = rig.Files.Inside(Acks);
        Assert.Equal(new[] { "hashes" }, Json.Keys(inside));
        return inside.GetProperty("hashes").EnumerateArray().Select(hash => hash.GetString()!).OrderBy(hash => hash, StringComparer.Ordinal).ToArray();
    }

    private static string? Broken(WiringRig rig) => rig.Files.Names().SingleOrDefault(name => name.IndexOf(".broken-", StringComparison.Ordinal) >= 0);

    private static void AssertRefused(System.Text.Json.JsonElement result)
    {
        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-INPUT-STOPPED", result.GetProperty("code").GetString());
        Assert.Equal(Refused, result.GetProperty("reason").GetString());
        Assert.Empty(result.GetProperty("results").EnumerateArray());
    }

    [Fact(DisplayName = "AC-035.9 .bak 없는 깨진 본 파일: 창이 불리고 [취소]면 stopped, 이름·바이트 그대로, OpenPatient 없음. 다시 누르면 또 묻고, [확인] 뒤에는 묻지 않으며 그 달 진료로 이름이 바뀌어도 다시 묻지 않는다")]
    public void BrokenMainWithoutBackup()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, Garbage);
        var item = Sample.Item(1);
        var before = Snapshot(rig);
        rig.Confirm.Answer = false;

        var (_, first) = rig.Run(item);

        AssertRefused(first);
        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(before, Snapshot(rig));
        Assert.Equal(0, rig.Ui.Opens);

        var (_, second) = rig.Run(item);
        AssertRefused(second);
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.StartsWith(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Equal(before, Snapshot(rig));

        // [확인]은 이 검사만 지나게 한다: 그 달 파일을 읽는 일은 AC-015.3 그대로라 이름이 바뀌고 이 묶음은 아무도 열지 않는다
        rig.Confirm.Answer = true;
        var (_, third) = rig.Run(item);
        Assert.Equal("E-STORE-FAILED", third.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Contains(Acks, rig.Files.Names());
        Assert.DoesNotContain(StoreRig.MonthFile, rig.Files.Names());
        var moved = Broken(rig);
        Assert.NotNull(moved);
        Assert.Equal(Garbage, rig.Files.Bytes(moved!));
        Assert.Equal(new[] { Sha(Garbage) }, SavedHashes(rig));

        var (_, fourth) = rig.Run(item);
        Assert.Equal(4, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[3].Text, StringComparison.Ordinal);
        Assert.Equal("finished", fourth.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(fourth, item.VisitKey));
    }

    [Fact(DisplayName = "AC-035.9 [확인]이면 해시를 남기고 보통대로 간다: 다른 달의 깨진 파일은 이름이 그대로이고 입력이 이어지며 다음 묶음은 묻지 않는다")]
    public void ConfirmedOtherMonthContinues()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var item = Sample.Item(1);

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(Garbage, rig.Files.Bytes(OldMonth));
        Assert.Equal(new[] { Sha(Garbage) }, SavedHashes(rig));

        rig.Run(Sample.Item(2));
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.9 더 오래된 .bak이 있는 깨진 본 파일: 검사가 되살리지도 이름을 바꾸지도 않고 창이 불린다")]
    public void BrokenMainWithOlderBackup()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, Garbage);
        rig.Files.Plant(StoreRig.MonthFile + ".bak", rig.Files.GoodMonth());
        var before = Snapshot(rig);
        rig.Confirm.Answer = false;

        var (_, result) = rig.Run(Sample.Item(1, date: "2026-11-02"));

        AssertRefused(result);
        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(before, Snapshot(rig));
    }

    [Fact(DisplayName = "AC-035.9 깨진 본 파일과 맞는 .bak: [확인] 뒤 그 달 진료면 그때 .bak으로 되살리고, 이름이 바뀐 파일을 다시 묻지 않는다")]
    public void RestoredAfterConfirmIsNotAskedAgain()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(StoreRig.MonthFile, Garbage);
        rig.Files.Plant(StoreRig.MonthFile + ".bak", rig.Files.GoodMonth());
        var item = Sample.Item(1);

        var (_, first) = rig.Run(item);

        Assert.StartsWith(Notice, rig.Confirm.Shown[0].Text, StringComparison.Ordinal);
        Assert.Equal("finished", first.GetProperty("status").GetString());
        Assert.NotNull(Broken(rig));

        rig.Run(Sample.Item(2));
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.9 .bak만 있는 달: 창 없이 되살리고 그 안의 writing을 AC-035.4로 찾는다")]
    public void BackupOnlyFindsWriting()
    {
        using var rig = new WiringRig();
        var stuck = Sample.Item(9, date: "2026-09-15", visitKey: "p");
        rig.Reopen().Mark(stuck, JournalState.Writing);
        File.Move(rig.Files.PathOf("work-2026-09.dat"), rig.Files.PathOf("work-2026-09.dat.bak"));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("p", Assert.Single(result.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Contains("work-2026-09.dat", rig.Files.Names());
        Assert.DoesNotContain(Acks, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.9 쓰다 멈춘 사람이 없는 .bak만 있는 달은 묻지 않고 해시도 남기지 않는다")]
    public void BackupOnlyWithoutStuckAsksNothing()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth + ".bak", rig.Files.GoodMonth());

        rig.Run(Sample.Item(1));

        Assert.DoesNotContain(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Contains(OldMonth, rig.Files.Names());
        Assert.DoesNotContain(Acks, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.9 store.load가 되살리고 남긴 .broken-*: 창이 불리고 IProtector가 그 파일에 불리지 않는다")]
    public void LeftByStoreLoad()
    {
        using var rig = new WiringRig();
        var brokenBytes = rig.Files.Encrypted("not json");
        rig.Files.Plant(OldMonth, brokenBytes);
        rig.Files.Plant(OldMonth + ".bak", rig.Files.GoodMonth());
        rig.Files.Open().Load(new[] { "2026-08" }, false, false);
        var moved = Broken(rig);
        Assert.NotNull(moved);
        var protector = new SpyProtector(rig.Files.Protector);
        rig.WrapJournal = _ => new WorkStoreJournal(rig.Files.Open(protector: protector));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal("finished", result.GetProperty("status").GetString());
        var cipher = brokenBytes.Skip("PRECHECK-STORE-1\n".Length).ToArray();
        Assert.DoesNotContain(protector.Opened, opened => opened.SequenceEqual(cipher));
        Assert.Equal(brokenBytes, rig.Files.Bytes(moved!));
        Assert.Equal(new[] { Sha(brokenBytes) }, SavedHashes(rig));
    }

    [Fact(DisplayName = "AC-035.9 .broken-*는 안에 writing이 있어도 읽지 않는다: unconfirmed에 없고 창으로 묻는다")]
    public void BrokenNameIsNeverDecrypted()
    {
        using var rig = new WiringRig();
        var inside = rig.Files.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"journal\":{\"x\":\"writing\"},\"journalDates\":{\"x\":\"2026-08-02\"}}");
        rig.Files.Plant(OldMonth + ".bak.broken-20261001T000000000Z", inside);

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-035.9 다른 프로필 ID 파일: 창이 불리고, 그 파일의 writing이 unconfirmed에 없고 틀린 상태 값이 E-STORE-FAILED가 아니며 창 글에 번호·이름이 없다")]
    [InlineData("writing")]
    [InlineData("nonsense")]
    public void OtherProfileFile(string state)
    {
        using var rig = new WiringRig();
        var visit = "visit-secret-77";
        rig.Files.Plant(OldMonth, rig.Files.Encrypted(
            "{\"profileId\":\"" + StoreRig.OtherProfile + "\",\"drafts\":{\"" + visit + "\":{\"memo\":\"가상환자77 메모\"}},\"done\":{},\"journal\":{\"" + visit + "\":\"" + state + "\"}}"));
        var before = rig.Files.Bytes(OldMonth);
        var item = Sample.Item(1);

        var (_, result) = rig.Run(item);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.StartsWith(Notice, text, StringComparison.Ordinal);
        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, item.VisitKey));
        foreach (var forbidden in new[] { visit, "가상환자77", "2026-08", "work-", ".dat" })
        {
            Assert.DoesNotContain(forbidden, text, StringComparison.Ordinal);
        }
        Assert.Equal(before, rig.Files.Bytes(OldMonth));
    }

    [Theory(DisplayName = "AC-035.9 [취소]·창 닫기·5분 지남: 아무도 열지 않고 cancelled가 아니라 stopped, results가 비고 입력 기록·미리 뺀 사람의 skipped·input-acks.dat 모두 남지 않는다")]
    [InlineData(NoAnswer.Cancel)]
    [InlineData(NoAnswer.WindowClosed)]
    [InlineData(NoAnswer.TimedOut)]
    [InlineData(NoAnswer.ClosedBeforeAsk)]
    [InlineData(NoAnswer.ClosedWhileAnswering)]
    public void NotConfirmedLeavesNothing(NoAnswer kind)
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var dropped = Sample.Item(1);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var released = Sample.Item(2, checkedByHand: true);
        rig.Visits[WiringRig.Key(released)] = 2;
        rig.Reopen().Mark(released, JournalState.Writing);
        var plain = Sample.Item(3);
        var before = Snapshot(rig);
        rig.Refuse(kind);

        var (_, result) = rig.Run(dropped, released, plain);

        AssertRefused(result);
        Assert.Equal(before, Snapshot(rig));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Null(rig.Reopen().LastState(dropped));
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.9 바이트가 바뀐 파일은 다시 묻는다")]
    public void ChangedBytesAskAgain()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Run(Sample.Item(1));
        rig.Files.Plant(OldMonth, Encoding.ASCII.GetBytes("garbage-2"));

        rig.Run(Sample.Item(2));

        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.StartsWith(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.9 해시 저장 실패: 아무도 열지 않고 E-STORE-FAILED, 기록은 그대로이고 풀 사람도 미리 뺀 사람의 skipped도 남지 않는다")]
    public void AckSaveFailure()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var released = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(released)] = 2;
        rig.Reopen().Mark(released, JournalState.Writing);
        var dropped = Sample.Item(2);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var plain = Sample.Item(3);
        var protector = new SpyProtector(rig.Files.Protector) { FailProtect = true };
        rig.WrapJournal = _ => new WorkStoreJournal(rig.Files.Open(protector: protector));

        var (_, result) = rig.Run(released, dropped, plain);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain("filter", rig.Ui.Calls);
        Assert.DoesNotContain(Acks, rig.Files.Names());
        Assert.DoesNotContain(result.GetProperty("results").EnumerateArray(), line => line.GetProperty("visitKey").GetString() == released.VisitKey);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, plain.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Writing, reopened.LastState(released));
        Assert.Null(reopened.LastState(dropped));
        Assert.Null(reopened.LastState(plain));
    }

    // 위 시험의 FailProtect는 Mark도 깨뜨려, 해시 저장에서 멈추지 않아도 E-STORE-FAILED가 난다. 여기서는 해시 쓰기만 실패한다(그 자리에 폴더가 있다)
    [Fact(DisplayName = "AC-035.9 해시 쓰기만 실패해도 거기서 멈춘다: 아무도 열지 않고 E-STORE-FAILED, 기록은 그대로이고 풀 사람도 미리 뺀 사람의 skipped도 남지 않는다")]
    public void AckWriteOnlyFailure()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        Directory.CreateDirectory(rig.Files.PathOf(Acks));
        var released = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(released)] = 2;
        rig.Reopen().Mark(released, JournalState.Writing);
        var dropped = Sample.Item(2);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var plain = Sample.Item(3);

        var (_, result) = rig.Run(released, dropped, plain);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain("filter", rig.Ui.Calls);
        Assert.DoesNotContain(result.GetProperty("results").EnumerateArray(), line => line.GetProperty("visitKey").GetString() == released.VisitKey);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, plain.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Writing, reopened.LastState(released));
        Assert.Null(reopened.LastState(dropped));
        Assert.Null(reopened.LastState(plain));
    }

    [Fact(DisplayName = "AC-035.9 파일 여럿과 풀 사람이 함께: Ask 한 번에 두 글, [취소]면 아무것도 풀리지 않는다")]
    public void FilesAndReleaseInOneWindow()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Files.Plant("work-2026-07.dat", Encoding.ASCII.GetBytes("garbage-2"));
        rig.Files.Plant("work-2026-06.dat.broken-20261001T000000000Z", Encoding.ASCII.GetBytes("garbage-3"));
        var released = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(released)] = 2;
        rig.Reopen().Mark(released, JournalState.Writing);
        var before = Snapshot(rig);
        rig.Confirm.Answer = false;

        var (_, result) = rig.Run(released);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.StartsWith(Notice, text, StringComparison.Ordinal);
        Assert.Contains("직접 확인한 환자 1명의 입력 멈춤을 풀까요?", text, StringComparison.Ordinal);
        AssertRefused(result);
        Assert.Equal(before, Snapshot(rig));
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.9 파일 여럿과 풀 사람이 함께: [확인] 하나가 둘을 함께 받아 해시가 모두 남고 풀린다")]
    public void FilesAndReleaseConfirmed()
    {
        using var rig = new WiringRig();
        var second = Encoding.ASCII.GetBytes("garbage-2");
        rig.Files.Plant(OldMonth, Garbage);
        rig.Files.Plant("work-2026-07.dat", second);
        var released = Sample.Item(1, checkedByHand: true);
        rig.Visits[WiringRig.Key(released)] = 2;
        rig.Reopen().Mark(released, JournalState.Writing);

        var (_, result) = rig.Run(released);

        Assert.Single(rig.Confirm.Shown);
        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(new[] { Sha(Garbage), Sha(second) }.OrderBy(hash => hash, StringComparer.Ordinal), SavedHashes(rig));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(released));
    }

    [Fact(DisplayName = "AC-035.9 다시 등록한 첫 묶음: 옛 파일 여럿에 창 한 번, 둘째 묶음 창 없음, 옛 파일 달의 진료는 E-STORE-FAILED로 OpenPatient 없음")]
    public void ReRegistered()
    {
        using var rig = new WiringRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"writing\"}"));
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth("2026-07", null, null, StoreJson.El("{\"y\":\"done\"}"));
        var names = rig.Files.Names();

        var (_, first) = rig.Run(Sample.Item(1));
        Assert.Equal("finished", first.GetProperty("status").GetString());
        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);

        rig.Run(Sample.Item(2));
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);

        var opens = rig.Ui.Opens;
        var (_, third) = rig.Run(Sample.Item(3, date: "2026-08-10"));
        Assert.Equal("stopped", third.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", third.GetProperty("code").GetString());
        Assert.Equal(opens, rig.Ui.Opens);
        Assert.All(names, name => Assert.Contains(name, rig.Files.Names()));
    }

    [Fact(DisplayName = "AC-035.9 옛 파일 달의 진료가 미리 뺀 사람이어도 E-STORE-FAILED로 아무도 열지 않고, 기록도 해시 말고는 남지 않는다")]
    public void ExcludedInOldMonthOpensNobody()
    {
        using var rig = new WiringRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"done\"}"));
        var old = rig.Files.Bytes(OldMonth);
        var dropped = Sample.Item(1, date: "2026-08-10");
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var plain = Sample.Item(2);

        var (_, result) = rig.Run(dropped, plain);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, plain.VisitKey));
        Assert.Equal(old, rig.Files.Bytes(OldMonth));
        Assert.Null(rig.Reopen().LastState(plain));
        Assert.Equal(new[] { Sha(old) }, SavedHashes(rig));
    }

    [Fact(DisplayName = "AC-035.9 AC-035.8 옛 파일 달의 진료까지 모두 빠진 묶음은 창도 해시도 없이 아무도 열지 않고, 그 사람의 skipped를 남기지 못해 E-STORE-FAILED를 알린다")]
    public void AllDroppedInOldMonth()
    {
        using var rig = new WiringRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"done\"}"));
        var old = rig.Files.Bytes(OldMonth);
        var dropped = Sample.Item(1, date: "2026-08-10");
        rig.Visits[WiringRig.Key(dropped)] = 2;

        var (_, result) = rig.Run(dropped);

        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(("건너뜀", "같은 날 내원이 여러 건이라 직접 입력해 주세요"), WiringRig.Row(result, dropped.VisitKey));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.DoesNotContain(Acks, rig.Files.Names());
        Assert.Equal(old, rig.Files.Bytes(OldMonth));
    }

    [Fact(DisplayName = "AC-035.9 깨진 달의 진료가 미리 뺀 사람이어도 [확인] 뒤 그때 이름을 바꾸고 아무도 열지 않으며, 다음 묶음은 묻지 않고 이어진다")]
    public void ExcludedInBrokenMonthOpensNobody()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var dropped = Sample.Item(1, date: "2026-08-10");
        rig.Visits[WiringRig.Key(dropped)] = 2;
        var plain = Sample.Item(2);

        var (_, first) = rig.Run(dropped, plain);

        Assert.Equal("E-STORE-FAILED", first.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.DoesNotContain(OldMonth, rig.Files.Names());
        Assert.Equal(Garbage, rig.Files.Bytes(Broken(rig)!));

        var (_, second) = rig.Run(dropped, plain);
        Assert.Equal(2, rig.Confirm.Shown.Count);
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Equal("finished", second.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(second, plain.VisitKey));
    }

    [Fact(DisplayName = "AC-035.9 확인한 파일이 있어도 새 파일이 하나라도 있으면 다시 묻고, 지금 있는 파일의 해시를 모두 남긴다")]
    public void NewFileBesideAcked()
    {
        using var rig = new WiringRig();
        var added = Encoding.ASCII.GetBytes("garbage-2");
        rig.Files.Plant(OldMonth, Garbage);
        rig.Run(Sample.Item(1));
        rig.Files.Plant("work-2026-07.dat", added);

        rig.Run(Sample.Item(2));

        Assert.StartsWith(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
        Assert.Equal(new[] { Sha(Garbage), Sha(added) }.OrderBy(hash => hash, StringComparer.Ordinal), SavedHashes(rig));
    }

    [Fact(DisplayName = "AC-035.9 AC-035.4 날짜 없는 쓰다 멈춘 기록은 AC-035.4의 E-STORE-FAILED다: 창도 비트도 건드리지 않는다")]
    public void UndatedStuckRecord()
    {
        using var rig = new WiringRig();
        rig.Files.Open().SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"writing\"}"));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
    }

    [Fact(DisplayName = "AC-035.9 AC-035.4로 멈춘 묶음은 창도 해시도 없다")]
    public void StuckOutsideAsksNothing()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Reopen().Mark(Sample.Item(9, date: "2026-09-15", visitKey: "p"), JournalState.Writing);

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.DoesNotContain(Acks, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.9 모두 빠진 묶음은 창도 해시도 없다")]
    public void AllDroppedAsksNothing()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        var dropped = Sample.Item(1);
        rig.Visits[WiringRig.Key(dropped)] = 2;

        var (_, result) = rig.Run(dropped);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.DoesNotContain(Acks, rig.Files.Names());
        Assert.Equal(Garbage, rig.Files.Bytes(OldMonth));
    }

    [Fact(DisplayName = "AC-035.9 지문이 틀린 묶음은 창도 해시도 없다")]
    public void WrongFingerprintAsksNothing()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("E-BIT-UI-CHANGED", result.GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.DoesNotContain(Acks, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.9 그런 파일이 없는 PC: input-acks.dat가 생기지 않고 창 글이 지금과 같다")]
    public void NoSuchFiles()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);

        rig.Run(item);

        Assert.DoesNotContain(Acks, rig.Files.Names());
        Assert.Equal(InputPrompt.Build(new[] { item }, Sample.Registration), Assert.Single(rig.Confirm.Shown).Text);
    }

    [Theory(DisplayName = "AC-035.9 못 읽는 input-acks.dat: 다시 묻고, [확인] 뒤 새로 써지고 입력이 이어지며 다음 묶음에 창 없음")]
    [InlineData("garbage")]
    [InlineData("not json")]
    [InlineData("{\"hashes\":\"x\"}")]
    [InlineData("{\"hashes\":[1]}")]
    [InlineData("[]")]
    public void UnreadableAcks(string content)
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);
        rig.Files.Plant(Acks, content == "garbage" ? Garbage : rig.Files.Encrypted(content));
        var item = Sample.Item(1);

        var (_, result) = rig.Run(item);

        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(new[] { Sha(Garbage) }, SavedHashes(rig));
        Assert.DoesNotContain(rig.Files.Names(), name => name.StartsWith(Acks + ".", StringComparison.Ordinal));

        rig.Run(Sample.Item(2));
        Assert.DoesNotContain(Notice, rig.Confirm.Shown[1].Text, StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-035.9 .bak만 있는데 깨진 달과 다른 프로필 ID인 달: 각각 창이 불리고 이름이 그대로다")]
    [InlineData(true)]
    [InlineData(false)]
    public void BackupOnlyUnreadable(bool broken)
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth + ".bak", broken ? Garbage : rig.Files.GoodMonth(profileId: StoreRig.OtherProfile));
        var before = Snapshot(rig);
        rig.Confirm.Answer = false;

        var (_, result) = rig.Run(Sample.Item(1));

        AssertRefused(result);
        Assert.StartsWith(Notice, Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(before, Snapshot(rig));
    }

    [Fact(DisplayName = "AC-035.9 파일이 사라진 해시는 다음 저장에 남지 않는다. 다른 파일이 없으면 저장도 하지 않는다")]
    public void VanishedHashIsDropped()
    {
        using var rig = new WiringRig();
        var next = Encoding.ASCII.GetBytes("garbage-2");
        rig.Files.Plant(OldMonth, Garbage);
        rig.Run(Sample.Item(1));
        Assert.Equal(new[] { Sha(Garbage) }, SavedHashes(rig));

        File.Delete(rig.Files.PathOf(OldMonth));
        var before = rig.Files.Bytes(Acks);
        rig.Run(Sample.Item(2));
        Assert.Equal(before, rig.Files.Bytes(Acks));

        rig.Files.Plant("work-2026-07.dat", next);
        rig.Run(Sample.Item(3));
        Assert.StartsWith(Notice, rig.Confirm.Shown[2].Text, StringComparison.Ordinal);
        Assert.Equal(new[] { Sha(next) }, SavedHashes(rig));
    }

    [Theory(DisplayName = "AC-035.9 잠긴 파일은 AC-035.4의 E-STORE-FAILED다: 창도 비트도 건드리지 않는다")]
    [InlineData(OldMonth)]
    [InlineData(OldMonth + ".broken-20261001T000000000Z")]
    public void LockedFile(string name)
    {
        using var rig = new WiringRig();
        rig.Files.Plant(name, rig.Files.GoodMonth());
        var item = Sample.Item(1);
        using var held = new FileStream(rig.Files.PathOf(name), FileMode.Open, FileAccess.ReadWrite, FileShare.None);

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, item.VisitKey));
    }

    [Fact(DisplayName = "AC-035.9 이 병원 파일의 틀린 상태 값은 확인할 수 없는 기록이 아니라 AC-035.4의 E-STORE-FAILED다")]
    public void WrongStateInThisHospitalFile()
    {
        using var rig = new WiringRig();
        rig.Files.Open().SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"nonsense\"}"));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.DoesNotContain(Acks, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.9 13개월 지우기는 input-acks.dat를 건드리지 않고, .broken-*도 지우지 않는다")]
    public void PruneLeavesAcks()
    {
        using var rig = new WiringRig();
        var old = "work-2026-08.dat.broken-20261001T000000000Z";
        rig.Files.Plant(old, Garbage);
        rig.Run(Sample.Item(1));
        var before = rig.Files.Bytes(Acks);

        rig.Files.Open(today: new DateTime(2029, 1, 1)).Prune();

        Assert.Equal(before, rig.Files.Bytes(Acks));
        Assert.Equal(Garbage, rig.Files.Bytes(old));
    }

    [Fact(DisplayName = "AC-035.9 input-acks.dat는 머리 + 암호화이고 프로필 ID 없이 해시만 있다")]
    public void AcksFileShape()
    {
        using var rig = new WiringRig();
        rig.Files.Plant(OldMonth, Garbage);

        rig.Run(Sample.Item(1));

        var raw = rig.Files.Bytes(Acks);
        Assert.Equal(Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n"), raw.Take("PRECHECK-STORE-1\n".Length).ToArray());
        Assert.DoesNotContain(Sha(Garbage), Encoding.ASCII.GetString(raw), StringComparison.Ordinal);
        Assert.Equal(new[] { "hashes" }, Json.Keys(rig.Files.Inside(Acks)));
        Assert.Equal(new[] { Sha(Garbage) }, SavedHashes(rig));
    }
}
