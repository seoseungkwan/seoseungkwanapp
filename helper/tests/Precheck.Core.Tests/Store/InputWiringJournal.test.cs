using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Input;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Store;

/// <summary>입력 기록의 진짜 구현(TASK-35, AC-035.2). 가짜 IProtector·임시 폴더로 쓰고 다시 열어 읽는다. 자료는 모두 지어낸 것이다.</summary>
public class InputWiringJournalTests
{
    private static InputItem Oct(int n) => Sample.Item(n);

    private static InputResult Skipped(InputItem item) => new InputResult(item.VisitKey, InputResults.Skipped, "내원일 없음");

    private static InputOutcome Finished(IReadOnlyList<InputResult> results, IReadOnlyList<InputItem>? excluded = null) =>
        new InputOutcome(InputStatus.Finished, null, null, null, results).WithExcluded(excluded ?? new InputItem[0], new InputResult[0]);

    private static string Code(Action action) => Assert.ThrowsAny<HelperException>(action).Code;

    private sealed class ThrowingProtector : IProtector
    {
        private readonly FakeProtector inner;

        public ThrowingProtector(FakeProtector inner)
        {
            this.inner = inner;
        }

        public byte[] Protect(byte[] plain) => throw new CryptographicException("가짜: 암호화 실패");

        public byte[] Unprotect(byte[] cipher) => inner.Unprotect(cipher);
    }

    [Fact(DisplayName = "AC-035.2 Mark는 돌아오기 전에 진료 달의 work-YYYY-MM.dat에 남는다: 새로 열어 읽힌다")]
    public void MarkIsOnDiskBeforeReturning()
    {
        using var files = new StoreRig();
        new WorkStoreJournal(files.Open()).Mark(Oct(1), JournalState.Writing);

        Assert.Equal(new[] { StoreRig.MonthFile }, files.Names());
        Assert.Equal(JournalState.Writing, new WorkStoreJournal(files.Open()).LastState(Oct(1)));
    }

    [Fact(DisplayName = "AC-035.2 달을 넘기는 묶음은 달마다 그 달 파일에 남는다")]
    public void MonthOfEachVisit()
    {
        using var files = new StoreRig();
        var journal = new WorkStoreJournal(files.Open());
        journal.Mark(Sample.Item(1, date: "2026-10-31"), JournalState.Done);
        journal.Mark(Sample.Item(2, date: "2026-11-01"), JournalState.Check);

        Assert.Equal(new[] { "work-2026-10.dat", "work-2026-11.dat" }, files.Names());
        StoreJson.Same("{\"v1\":\"done\"}", files.Inside("work-2026-10.dat").GetProperty("journal"));
        StoreJson.Same("{\"v2\":\"check\"}", files.Inside("work-2026-11.dat").GetProperty("journal"));
    }

    [Theory(DisplayName = "AC-035.2 상태와 파일 글자가 일대일이다(skippedByHand 포함)")]
    [InlineData(JournalState.Writing, "writing")]
    [InlineData(JournalState.Done, "done")]
    [InlineData(JournalState.Skipped, "skipped")]
    [InlineData(JournalState.SkippedByHand, "skippedByHand")]
    [InlineData(JournalState.Check, "check")]
    [InlineData(JournalState.WriteUnconfirmed, "writeUnconfirmed")]
    public void StateLetters(JournalState state, string letters)
    {
        using var files = new StoreRig();
        new WorkStoreJournal(files.Open()).Mark(Oct(1), state);

        Assert.Equal(letters, files.Inside(StoreRig.MonthFile).GetProperty("journal").GetProperty("v1").GetString());
        Assert.Equal(state, new WorkStoreJournal(files.Open()).LastState(Oct(1)));
    }

    [Fact(DisplayName = "AC-035.2 못 남기면 E-STORE-FAILED: 암호화 실패·폴더 문제·다른 병원 파일 모두")]
    public void MarkFailures()
    {
        using var files = new StoreRig();
        var broken = new WorkStoreJournal(files.Open(protector: new ThrowingProtector(files.Protector)));
        Assert.Equal(BitErrors.StoreFailed, Code(() => broken.Mark(Oct(1), JournalState.Writing)));

        using var other = new StoreRig();
        other.Open(StoreRig.OtherProfile).SaveMonth(StoreRig.Month, null, null, null);
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(other.Open()).Mark(Oct(1), JournalState.Writing)));

        using var folderIsFile = new TempFolder();
        System.IO.Directory.CreateDirectory(folderIsFile.Path);
        var file = System.IO.Path.Combine(folderIsFile.Path, "file");
        System.IO.File.WriteAllText(file, "x");
        var store = new WorkStore(new StoreFolder(file), new FakeProtector(), Synthetic.Registration(), () => StoreRig.Today);
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(store).Mark(Oct(1), JournalState.Writing)));
    }

    [Fact(DisplayName = "AC-035.2 LastState는 기록이 없으면 null(파일 없음·진료 없음 둘 다)")]
    public void NoRecordIsNull()
    {
        using var files = new StoreRig();
        var journal = new WorkStoreJournal(files.Open());
        Assert.Null(journal.LastState(Oct(1)));
        journal.Mark(Oct(2), JournalState.Done);
        Assert.Null(journal.LastState(Oct(1)));
    }

    [Theory(DisplayName = "AC-035.2 LastState는 모르는 값이면 E-STORE-FAILED다(대소문자까지, 글자가 아닌 값 포함)")]
    [InlineData("\"nonsense\"")]
    [InlineData("\"Writing\"")]
    [InlineData("3")]
    [InlineData("null")]
    [InlineData("{}")]
    public void UnknownValue(string value)
    {
        using var files = new StoreRig();
        files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":" + value + "}"));
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(files.Open()).LastState(Oct(1))));
    }

    [Fact(DisplayName = "AC-035.2 LastState는 못 읽으면 E-STORE-FAILED다(깨진 파일·다른 병원 파일)")]
    public void UnreadableFile()
    {
        using var files = new StoreRig();
        files.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(files.Open()).LastState(Oct(1))));

        using var other = new StoreRig();
        other.Open(StoreRig.OtherProfile).SaveMonth(StoreRig.Month, null, null, null);
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(other.Open()).LastState(Oct(1))));
    }

    [Fact(DisplayName = "AC-035.2 SaveResults는 이번 묶음에서 Mark한 진료의 기록을 바꾸지 않는다")]
    public void SaveResultsKeepsMarked()
    {
        using var files = new StoreRig();
        var journal = new WorkStoreJournal(files.Open());
        journal.Mark(Oct(1), JournalState.Check);
        journal.Mark(Oct(2), JournalState.SkippedByHand);

        journal.SaveResults(Finished(
            new[] { Skipped(Oct(1)), Skipped(Oct(2)) },
            new[] { Oct(1), Oct(2) }));

        var reopened = new WorkStoreJournal(files.Open());
        Assert.Equal(JournalState.Check, reopened.LastState(Oct(1)));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(Oct(2)));
    }

    [Theory(DisplayName = "AC-035.2 SaveResults는 앞선 묶음의 writing·writeUnconfirmed·skippedByHand를 덮지 않는다")]
    [InlineData(JournalState.Writing)]
    [InlineData(JournalState.WriteUnconfirmed)]
    [InlineData(JournalState.SkippedByHand)]
    public void SaveResultsKeepsEarlier(JournalState state)
    {
        using var files = new StoreRig();
        new WorkStoreJournal(files.Open()).Mark(Oct(1), state);

        new WorkStoreJournal(files.Open()).SaveResults(Finished(new[] { Skipped(Oct(1)) }, new[] { Oct(1) }));

        Assert.Equal(state, new WorkStoreJournal(files.Open()).LastState(Oct(1)));
    }

    [Fact(DisplayName = "AC-035.2 Mark하지 않은 사람에게 적는 값은 미리 뺀 사람의 skipped뿐이고, 달은 묶음의 item.Date로 찾는다")]
    public void OnlyExcludedAreWritten()
    {
        using var files = new StoreRig();
        var october = Oct(1);
        var september = Sample.Item(2, date: "2026-09-30");
        var notExcluded = Oct(3);
        var check = Oct(4);

        new WorkStoreJournal(files.Open()).SaveResults(Finished(
            new[]
            {
                Skipped(october),
                Skipped(september),
                Skipped(notExcluded),
                new InputResult(check.VisitKey, InputResults.Check, InputRunner.NotDone),
            },
            new[] { october, september }));

        var reopened = new WorkStoreJournal(files.Open());
        Assert.Equal(JournalState.Skipped, reopened.LastState(october));
        Assert.Equal(JournalState.Skipped, reopened.LastState(september));
        Assert.Null(reopened.LastState(notExcluded));
        Assert.Null(reopened.LastState(check));
        Assert.Equal(new[] { "work-2026-09.dat", StoreRig.MonthFile }, files.Names());
    }

    [Fact(DisplayName = "AC-035.2 묶음 끝의 기록이 store.load로 다시 읽힌다(AC-018.5), 답의 달은 세 칸에 수납일지 sunap 칸(AC-4902.5)만 더해진다")]
    public void ReadBackThroughLoad()
    {
        using var files = new StoreRig();
        var journal = new WorkStoreJournal(files.Open());
        journal.Mark(Oct(1), JournalState.Done);
        journal.SaveResults(Finished(new[] { Skipped(Oct(2)) }, new[] { Oct(2) }));

        var month = Json.Parse(files.Open().Load(new[] { StoreRig.Month }, false, false)).GetProperty("months").GetProperty(StoreRig.Month);

        Assert.Equal(new[] { "drafts", "done", "journal", "sunap" }, Json.Keys(month));
        StoreJson.Same("{\"v1\":\"done\",\"v2\":\"skipped\"}", month.GetProperty("journal"));
    }

    [Fact(DisplayName = "AC-035.2 1초마다 오는 store.save가 입력 기록과 날짜를 지우지 않는다")]
    public void LateSaveKeepsJournalAndDate()
    {
        using var files = new StoreRig();
        new WorkStoreJournal(files.Open()).Mark(Oct(1), JournalState.Writing);

        files.Open().SaveMonth(StoreRig.Month, StoreJson.El("{\"v1\":\"고친 메모\"}"), StoreJson.El("{}"), null);

        var found = Assert.Single(new WorkStoreJournal(files.Open()).Scan().Stuck);
        Assert.Equal("v1", found.VisitKey);
        Assert.Equal(Sample.Date, found.Date);
    }

    [Fact(DisplayName = "AC-035.4 Scan은 달마다 파일을 모두 보고 마지막이 writing·writeUnconfirmed인 진료와 내원일을 준다")]
    public void FindAcrossMonths()
    {
        using var files = new StoreRig();
        var journal = new WorkStoreJournal(files.Open());
        journal.Mark(Sample.Item(1, date: "2026-10-27"), JournalState.Writing);
        journal.Mark(Sample.Item(2, date: "2026-09-02"), JournalState.WriteUnconfirmed);
        journal.Mark(Sample.Item(3, date: "2026-09-03"), JournalState.Writing);
        journal.Mark(Sample.Item(3, date: "2026-09-03"), JournalState.Done);
        files.Plant("work-2026-08.dat.broken-20261001T000000000Z", Encoding.ASCII.GetBytes("garbage"));

        var found = new WorkStoreJournal(files.Open()).Scan().Stuck.OrderBy(visit => visit.VisitKey, StringComparer.Ordinal).ToList();

        Assert.Equal(new[] { "v1", "v2" }, found.Select(visit => visit.VisitKey));
        Assert.Equal(new[] { "2026-10-27", "2026-09-02" }, found.Select(visit => visit.Date));
    }

    [Fact(DisplayName = "AC-035.4 저장 파일이 없으면 Scan은 빈 목록이고 폴더를 만들지 않는다")]
    public void FindWithNoFolder()
    {
        using var files = new StoreRig();
        Assert.Empty(new WorkStoreJournal(files.Open()).Scan().Stuck);
        Assert.Empty(files.Names());
    }

    [Theory(DisplayName = "AC-035.4 Scan은 못 읽으면 E-STORE-FAILED다: 모르는 값·날짜 없는 쓰다 멈춤")]
    [InlineData("{\"v1\":\"nonsense\"}")]
    [InlineData("{\"v1\":\"writing\"}")]
    public void FindFailures(string journal)
    {
        using var files = new StoreRig();
        files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El(journal));
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(files.Open()).Scan()));
    }

    [Theory(DisplayName = "AC-035.4 쓰다 멈춘 기록의 날짜가 내원일 모양이 아니거나 그 파일의 달이 아니면 날짜가 없는 것과 같아 E-STORE-FAILED다")]
    [InlineData("{\"v1\":\"2026-13-40\"}")]
    [InlineData("{\"v1\":\"어제\"}")]
    [InlineData("{\"v1\":\"2026-09-15\"}")]
    [InlineData("{\"v1\":3}")]
    [InlineData("{\"v2\":\"2026-10-27\"}")]
    public void BadDates(string dates)
    {
        using var files = new StoreRig();
        files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"writeUnconfirmed\"}"), StoreJson.El(dates));
        Assert.Equal(BitErrors.StoreFailed, Code(() => new WorkStoreJournal(files.Open()).Scan()));
    }

    [Fact(DisplayName = "AC-035.4 쓰다 멈춘 기록이 아니면 날짜가 없어도 막지 않는다(옛 파일의 done·skipped)")]
    public void UndatedFinishedRecord()
    {
        using var files = new StoreRig();
        files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"done\",\"v2\":\"skipped\"}"));
        Assert.Empty(new WorkStoreJournal(files.Open()).Scan().Stuck);
    }

    [Fact(DisplayName = "AC-035.9 깨진 달 파일은 쓰다 멈춘 사람 찾기에서 예외를 던지지 않고 이름도 바꾸지 않는다")]
    public void FindLeavesBrokenFileAlone()
    {
        using var broken = new StoreRig();
        broken.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));
        Assert.Empty(new WorkStoreJournal(broken.Open()).Scan().Stuck);
        Assert.Equal(new[] { StoreRig.MonthFile }, broken.Names());
    }

    [Fact(DisplayName = "AC-035.4 store.save 뒤에도 journalDates가 그대로이고 store.load 답에 없다")]
    public void JournalDatesSurviveSaveAndStayHidden()
    {
        using var files = new StoreRig();
        new WorkStoreJournal(files.Open()).Mark(Oct(1), JournalState.Writing);

        files.Open().SaveMonth(StoreRig.Month, StoreJson.El("{\"v1\":\"고친 메모\"}"), StoreJson.El("{}"), null);

        StoreJson.Same("{\"v1\":\"2026-10-27\"}", files.Inside(StoreRig.MonthFile).GetProperty("journalDates"));
        var answer = files.Open().Load(new[] { StoreRig.Month }, false, false);
        Assert.DoesNotContain("journalDates", answer, StringComparison.Ordinal);
        Assert.Equal(new[] { "drafts", "done", "journal", "sunap" }, Json.Keys(Json.Parse(answer).GetProperty("months").GetProperty(StoreRig.Month)));
    }

    [Fact(DisplayName = "AC-035.4 웹은 journalDates를 보낼 수 없다: 명령 표에 칸이 없어 store.save가 E-HELPER-BAD-MESSAGE다")]
    public void WebCannotSendJournalDates()
    {
        using var files = new StoreRig();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        StoreCommands.Register(dispatcher, () => files.Open(), () => new StoreLockStub());
        var inner = "{\"month\":\"2026-10\",\"drafts\":{},\"done\":{},\"journalDates\":{\"v1\":\"2026-10-27\"}}";

        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("store.save", System.Text.Json.JsonSerializer.Serialize(new { payload = inner }))), sink);

        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(files.Names());
    }

    [Fact(DisplayName = "AC-035.4 이 칸이 없는 옛 파일을 그대로 읽고, 값이 없으면 칸을 쓰지 않으며, 첫 Mark로 칸이 생긴다")]
    public void OldFileGetsDatesOnFirstMark()
    {
        using var files = new StoreRig();
        files.Plant(StoreRig.MonthFile, files.GoodMonth());
        Assert.False(files.Inside(StoreRig.MonthFile).TryGetProperty("journalDates", out _));

        var journal = new WorkStoreJournal(files.Open());
        Assert.Null(journal.LastState(Oct(1)));
        Assert.Empty(journal.Scan().Stuck);

        files.Open().SaveMonth(StoreRig.Month, StoreJson.El("{}"), StoreJson.El("{}"), null);
        Assert.False(files.Inside(StoreRig.MonthFile).TryGetProperty("journalDates", out _));

        journal.Mark(Oct(1), JournalState.Writing);
        StoreJson.Same("{\"v1\":\"2026-10-27\"}", files.Inside(StoreRig.MonthFile).GetProperty("journalDates"));
        Assert.Equal("2026-10-27", Assert.Single(new WorkStoreJournal(files.Open()).Scan().Stuck).Date);
    }

    private sealed class StoreLockStub : IDisposable
    {
        public void Dispose()
        {
        }
    }

    [Fact(DisplayName = "AC-035.2 InputCommands를 진짜 기록으로 끝까지(SaveResults까지) 돌린 뒤 다시 열면: 직접 확인으로 와 건너뜀·미처리로 끝난 사람은 SkippedByHand, 쓰다 멈춘 사람은 WriteUnconfirmed")]
    public void EndToEndStatesSurviveSaveResults()
    {
        using var rig = new WiringRig();
        var different = Sample.Item(1, checkedByHand: true);
        var unsaved = Sample.Item(2, checkedByHand: true);
        var neverReached = Sample.Item(3, checkedByHand: true);
        foreach (var item in new[] { different, unsaved, neverReached }) rig.Reopen().Mark(item, JournalState.Writing);
        rig.Ui.Bit[different.Chart] = "직원이 손으로 넣은 글";
        rig.Ui.SaveWorks = false;

        var (_, result) = rig.Run(different, unsaved, neverReached);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("건너뜀", WiringRig.Row(result, different.VisitKey).Result);
        Assert.Equal("확인 필요", WiringRig.Row(result, unsaved.VisitKey).Result);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, neverReached.VisitKey));

        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(different));
        Assert.Equal(JournalState.WriteUnconfirmed, reopened.LastState(unsaved));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(neverReached));
        StoreJson.Same(
            "{\"v1\":\"skippedByHand\",\"v2\":\"writeUnconfirmed\",\"v3\":\"skippedByHand\"}",
            Json.Parse(rig.Files.Open().Load(new[] { StoreRig.Month }, false, false)).GetProperty("months").GetProperty(StoreRig.Month).GetProperty("journal"));
    }

    [Fact(DisplayName = "AC-035.2 LastState가 한 진료에서 실패해 멈춘 묶음 뒤 다른 진료의 writing이 그대로다")]
    public void LastStateFailureKeepsOthers()
    {
        using var rig = new WiringRig();
        var kept = Sample.Item(1);
        var failing = Sample.Item(2);
        rig.Reopen().Mark(kept, JournalState.Writing);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = failing.VisitKey };

        var (_, result) = rig.Run(kept, failing);

        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Writing, reopened.LastState(kept));
        Assert.Null(reopened.LastState(failing));
    }

    [Fact(DisplayName = "AC-035.2 Mark(writing)를 못 남기면 쓰지 않고 E-STORE-FAILED로 멈춘다")]
    public void WritingMarkFailureStopsBeforeWrite()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        var protector = new SwitchProtector(rig.Files.Protector);
        rig.WrapJournal = _ => new WorkStoreJournal(rig.Files.Open(protector: protector));
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "open") protector.Fail = true;
        };

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Writes);
    }

    private sealed class SwitchProtector : IProtector
    {
        private readonly FakeProtector inner;

        public SwitchProtector(FakeProtector inner)
        {
            this.inner = inner;
        }

        public bool Fail { get; set; }

        public byte[] Protect(byte[] plain) => Fail ? throw new CryptographicException("가짜: 암호화 실패") : inner.Protect(plain);

        public byte[] Unprotect(byte[] cipher) => inner.Unprotect(cipher);
    }
}
