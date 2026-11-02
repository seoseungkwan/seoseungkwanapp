using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Store;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// bit.input 연결(TASK-35)을 메시지부터 끝까지 돈다. 비트 화면·확인 창·DB는 가짜이고, 입력 기록은 진짜 WorkStoreJournal(가짜 암호화·임시 폴더)이다.
/// 가짜 입력 기록은 SaveResults가 무엇을 덮는지 잡지 못해서다(AC-035.2). 자료는 모두 지어낸 것이다.
/// </summary>
internal sealed class WiringRig : IDisposable
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private List<InputItem> current = new List<InputItem>();

    public WiringRig()
    {
        Bit.Session.Answer(Sql.InputVisitCountSql, args =>
        {
            Steps.Add("visits");
            return RawVisitRows ?? current
                .Where(item => CountOf(item) > 0)
                .Select(item => new object?[] { item.Chart, item.Date.Replace("-", ""), CountOf(item) })
                .ToList();
        });
    }

    public string LockName { get; } = @"Local\PrecheckTest." + Guid.NewGuid().ToString("N");
    public Rig Bit { get; } = new Rig().Registered();
    public StoreRig Files { get; } = new StoreRig();
    public FakeChartUi Ui { get; } = new FakeChartUi();
    public FakeInputConfirm Confirm { get; } = new FakeInputConfirm();
    public HostSignal Signal { get; } = new HostSignal();
    public List<string> Steps { get; } = new List<string>();
    public List<(string? Cmd, string? Code)> Log { get; } = new List<(string? Cmd, string? Code)>();
    public int UiOpened { get; private set; }
    public int ProgressOpened { get; private set; }

    /// <summary>Key(item) → 비트의 내원 수. 없으면 1.</summary>
    public Dictionary<string, long> Visits { get; } = new Dictionary<string, long>(StringComparer.Ordinal);

    /// <summary>내원 수 SQL의 답을 줄 그대로 정할 때.</summary>
    public List<object?[]>? RawVisitRows { get; set; }

    public Func<IBatchJournal, IBatchJournal>? WrapJournal { get; set; }

    public static string Key(InputItem item) => item.Chart + "|" + item.Date;

    public void Refuse(NoAnswer kind)
    {
        switch (kind)
        {
            case NoAnswer.Cancel:
                Confirm.Answer = false;
                break;
            case NoAnswer.WindowClosed:
                Confirm.Behavior = _ => false;
                break;
            case NoAnswer.TimedOut:
                Confirm.Behavior = closeRequested =>
                {
                    Assert.False(closeRequested());
                    return false;
                };
                break;
            case NoAnswer.ClosedBeforeAsk:
                Signal.MarkStdinClosed();
                break;
            case NoAnswer.ClosedWhileAnswering:
                Confirm.Behavior = _ =>
                {
                    Signal.MarkStdinClosed();
                    return true;
                };
                break;
        }
    }

    private long CountOf(InputItem item) => Visits.TryGetValue(Key(item), out var count) ? count : 1L;

    /// <summary>쓰고 난 뒤 파일에서 다시 읽는다(프로세스를 새로 띄운 것과 같다).</summary>
    public WorkStoreJournal Reopen() => new WorkStoreJournal(Files.Open());

    public void Register(Dispatcher dispatcher) =>
        InputCommands.Register(dispatcher, new InputServices(
            Bit.Services,
            Signal,
            _ => { UiOpened++; Steps.Add("ui"); return Ui; },
            Confirm,
            _ => { ProgressOpened++; return new SilentWindow(); },
            registration =>
            {
                IBatchJournal journal = new WorkStoreJournal(Files.Open(registration.ProfileId));
                return WrapJournal != null ? WrapJournal(journal) : journal;
            },
            new MemoMatcher(),
            () => { Steps.Add("lock"); return WorkLock.TryAcquire(WorkLock.InputWait, LockName); },
            (cmd, code) => Log.Add((cmd, code))));

    /// <summary>묶음 칸을 더하거나 바꾼다(AC-036.1의 code 등).</summary>
    public Action<Dictionary<string, object?>>? EditPayload { get; set; }

    public static byte[] Request(IEnumerable<InputItem> items, Action<Dictionary<string, object?>>? editPayload = null)
    {
        var rows = items.Select(item =>
        {
            var row = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["visitKey"] = item.VisitKey,
                ["chart"] = item.Chart,
                ["name"] = item.Name,
                ["date"] = item.Date,
                ["memo"] = item.Memo,
            };
            if (item.CheckedByHand) row["checkedByHand"] = true;
            return row;
        }).ToList();
        var fields = new Dictionary<string, object?>(StringComparer.Ordinal) { ["items"] = rows };
        editPayload?.Invoke(fields);
        var inner = JsonSerializer.Serialize(fields);
        return Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner })));
    }

    public (List<JsonElement> Replies, JsonElement Result) Run(params InputItem[] items)
    {
        var replies = Send(items, null);
        return (replies, Result(replies));
    }

    /// <summary>답을 그대로 돌려준다(오류 봉투 하나일 때).</summary>
    public List<JsonElement> Send(IEnumerable<InputItem> items, IReplySink? extra)
    {
        current = items.ToList();
        var dispatcher = new Dispatcher(Table);
        Register(dispatcher);
        var sink = new ListSink();
        dispatcher.Handle(Request(current, EditPayload), extra == null ? sink : new TeeSink(sink, extra));
        return sink.Replies;
    }

    public static JsonElement Result(List<JsonElement> replies)
    {
        var chunks = replies.Where(reply => reply.GetProperty("type").GetString() == "chunk").Select(reply => reply.GetProperty("data").GetString()).ToArray();
        Assert.NotEmpty(chunks);
        return Json.Parse(string.Concat(chunks));
    }

    public static (string Result, string Reason) Row(JsonElement result, string visitKey)
    {
        var row = result.GetProperty("results").EnumerateArray().Single(line => line.GetProperty("visitKey").GetString() == visitKey);
        return (row.GetProperty("result").GetString()!, row.GetProperty("reason").GetString()!);
    }

    public void Dispose()
    {
        Bit.Dispose();
        Files.Dispose();
    }

    private sealed class SilentWindow : IProgressWindow
    {
        public bool StopPressed => false;

        public void Update(int done, int total)
        {
        }

        public void Dispose()
        {
        }
    }

    private sealed class TeeSink : IReplySink
    {
        private readonly IReplySink first;
        private readonly IReplySink second;

        public TeeSink(IReplySink first, IReplySink second)
        {
            this.first = first;
            this.second = second;
        }

        public void Send(byte[] utf8Json)
        {
            first.Send(utf8Json);
            second.Send(utf8Json);
        }
    }
}

/// <summary>PC 확인 창에서 [확인]을 받지 못하는 길. 5분 지남과 창 닫기는 진짜 창이 하고(Precheck.Windows.ConfirmWindow), 여기로는 Ask의 false로 온다.</summary>
public enum NoAnswer
{
    Cancel,
    WindowClosed,
    TimedOut,
    ClosedBeforeAsk,
    ClosedWhileAnswering,
}

/// <summary>진짜 입력 기록을 감싸 차례를 적고, 정해 둔 진료의 LastState나 Mark만 실패시킨다.</summary>
internal sealed class JournalSpy : IBatchJournal
{
    private readonly IBatchJournal inner;
    private readonly List<string> steps;

    public JournalSpy(IBatchJournal inner, List<string> steps)
    {
        this.inner = inner;
        this.steps = steps;
    }

    public string? LastStateFailsFor { get; set; }
    public string? MarkFailsFor { get; set; }

    /// <summary>입력 기록을 읽기 바로 앞에 부른다(그때 해시가 이미 저장됐는지 보려고).</summary>
    public Action? BeforeRead { get; set; }

    public void Mark(InputItem item, JournalState state)
    {
        steps.Add("mark:" + state);
        if (item.VisitKey == MarkFailsFor) throw new BitException(BitErrors.StoreFailed);
        inner.Mark(item, state);
    }

    public JournalState? LastState(InputItem item)
    {
        BeforeRead?.Invoke();
        steps.Add("journal-read");
        if (item.VisitKey == LastStateFailsFor) throw new BitException(BitErrors.StoreFailed);
        return inner.LastState(item);
    }

    public JournalScan Scan()
    {
        steps.Add("unconfirmed");
        return inner.Scan();
    }

    public void SaveAcks(IReadOnlyList<string> hashes)
    {
        steps.Add("acks");
        inner.SaveAcks(hashes);
    }

    public void SaveResults(InputOutcome outcome)
    {
        steps.Add("results");
        inner.SaveResults(outcome);
    }
}

public class InputWiringVisitCountTests
{
    [Fact(DisplayName = "AC-035.1 같은 사람·같은 날 진료 A·B가 있고 묶음에 B만 있으면 OpenPatient가 불리지 않고 '건너뜀: 같은 날 내원이 여러 건이라 직접 입력해 주세요'")]
    public void TwoVisitsNeverOpened()
    {
        using var rig = new WiringRig();
        var b = Sample.Item(1, visitKey: "visit-b");
        rig.Visits[WiringRig.Key(b)] = 2;

        var (_, result) = rig.Run(b);

        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(("건너뜀", "같은 날 내원이 여러 건이라 직접 입력해 주세요"), WiringRig.Row(result, "visit-b"));
    }

    [Fact(DisplayName = "AC-035.1 0건이면 열지 않고 '건너뜀: 내원일 없음'")]
    public void NoVisit()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        rig.Visits[WiringRig.Key(item)] = 0;

        var (_, result) = rig.Run(item);

        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(("건너뜀", "내원일 없음"), WiringRig.Row(result, item.VisitKey));
    }

    [Fact(DisplayName = "AC-035.1 정확히 1건인 진료만 남고, 뺀 수는 PC 확인 창의 '빼는 환자 N명'에 들어가고 결과에도 함께 나온다")]
    public void OnlyOneVisitRemains()
    {
        using var rig = new WiringRig();
        var one = Sample.Item(1);
        var two = Sample.Item(2);
        var none = Sample.Item(3);
        rig.Visits[WiringRig.Key(two)] = 2;
        rig.Visits[WiringRig.Key(none)] = 0;

        var (replies, result) = rig.Run(one, two, none);

        var (text, _) = Assert.Single(rig.Confirm.Shown);
        Assert.Contains("1명 입력할까요?", text, StringComparison.Ordinal);
        Assert.Contains("빼는 환자 2명", text, StringComparison.Ordinal);
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(one.Chart, rig.Ui.OpenChart);
        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, one.VisitKey));
        Assert.Equal("건너뜀", WiringRig.Row(result, two.VisitKey).Result);
        Assert.Equal("건너뜀", WiringRig.Row(result, none.VisitKey).Result);
        Assert.All(replies.Where(reply => reply.GetProperty("type").GetString() == "progress"), reply => Assert.Equal(1, reply.GetProperty("total").GetInt32()));
    }

    [Fact(DisplayName = "AC-035.1 내원 수 읽기가 실패하면 아무도 열지 않고 E-BIT-READ-FAILED로 답한다")]
    public void ReadFails()
    {
        using var rig = new WiringRig();
        rig.Bit.Session.Fail(Sql.InputVisitCountSql, BitErrors.ReadFailed);

        var reply = Assert.Single(rig.Send(new[] { Sample.Item(1) }, null));

        Assert.Equal("E-BIT-READ-FAILED", reply.GetProperty("code").GetString());
        Assert.Empty(rig.Ui.Calls);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(1, rig.Bit.Session.Disposed);
    }

    [Fact(DisplayName = "AC-035.1 내원 수 칸이 숫자가 아니면 빼지 않고 E-BIT-READ-FAILED로 답한다")]
    public void BadCountIsReadFailure()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        rig.RawVisitRows = new List<object?[]> { new object?[] { item.Chart, "20261027", "abc" } };

        var reply = Assert.Single(rig.Send(new[] { item }, null));

        Assert.Equal("E-BIT-READ-FAILED", reply.GetProperty("code").GetString());
        Assert.Empty(rig.Ui.Calls);
    }

    [Fact(DisplayName = "AC-035.1 등록 확인과 같은 세션에서 묶음 기간으로 한 번 읽고(@from 첫날 0시·@to 끝날 다음 날 0시), 확인 창 전에 세션을 닫는다")]
    public void SameSessionAndPeriod()
    {
        using var rig = new WiringRig();
        var disposedAtConfirm = -1;
        rig.Confirm.Behavior = _ => { disposedAtConfirm = rig.Bit.Session.Disposed; return true; };

        rig.Run(Sample.Item(1, date: "2026-10-29"), Sample.Item(2, date: "2026-10-27"));

        Assert.Single(rig.Bit.Connector.Opened);
        Assert.Equal(1, disposedAtConfirm);
        var call = Assert.Single(rig.Bit.Session.Calls, entry => entry.Sql == Sql.InputVisitCountSql);
        Assert.Equal("202610270000", call.Args["@from"]);
        Assert.Equal("202610300000", call.Args["@to"]);
        Assert.Equal(2, call.Args.Count);
        Assert.Equal(Sql.MemoTimeout, call.Timeout);
        var sqls = rig.Bit.Session.Sqls.ToList();
        Assert.True(sqls.IndexOf(Sql.ScopesSql) < sqls.IndexOf(Sql.InputVisitCountSql));
    }

    [Fact(DisplayName = "AC-035.1 DB 차트번호는 화면 검사처럼 숫자만 글자 그대로 견준다: 숫자가 같은 줄은 더해 세고, 앞자리 0은 다른 번호다")]
    public void ChartComparedLikeScreen()
    {
        using var rig = new WiringRig();
        var doubled = Sample.Item(1);
        var leadingZero = Sample.Item(2);
        var plain = Sample.Item(3);
        rig.RawVisitRows = new List<object?[]>
        {
            new object?[] { doubled.Chart + "  ", "20261027", 1L },
            new object?[] { doubled.Chart + "-", "20261027", 1L },
            new object?[] { "0" + leadingZero.Chart, "20261027", 1L },
            new object?[] { plain.Chart, "20261027", 1 },
        };

        var (_, result) = rig.Run(doubled, leadingZero, plain);

        Assert.Equal("같은 날 내원이 여러 건이라 직접 입력해 주세요", WiringRig.Row(result, doubled.VisitKey).Reason);
        Assert.Equal("내원일 없음", WiringRig.Row(result, leadingZero.VisitKey).Reason);
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, plain.VisitKey));
    }

    [Fact(DisplayName = "AC-035.1 답·진행·기록에 차트번호·이름·메모가 실리지 않는다")]
    public void NoPatientTextInReply()
    {
        using var rig = new WiringRig();
        var kept = Sample.Item(1);
        var dropped = Sample.Item(2);
        rig.Visits[WiringRig.Key(dropped)] = 2;

        var (replies, result) = rig.Run(kept, dropped);

        var text = result.GetRawText() + string.Concat(replies.Where(reply => reply.GetProperty("type").GetString() != "chunk").Select(reply => reply.GetRawText()));
        foreach (var item in new[] { kept, dropped })
        {
            Assert.DoesNotContain(item.Chart, text, StringComparison.Ordinal);
            Assert.DoesNotContain(item.Name, text, StringComparison.Ordinal);
            Assert.DoesNotContain(item.Memo, text, StringComparison.Ordinal);
        }
    }
}

public class InputWiringMatcherTests
{
    [Theory(DisplayName = "AC-035.3 쓰기 전 비교는 MemoCompare 규칙: 읽지 못함은 Unknown, 공백뿐이면 Absent, 같으면 Same, 그 밖은 Different")]
    [InlineData("우리 글", null, MemoMatch.Unknown)]
    [InlineData("우리 글", "", MemoMatch.Absent)]
    [InlineData("우리 글", " \r\n\t ", MemoMatch.Absent)]
    [InlineData("우리 글", "우리 글", MemoMatch.Same)]
    [InlineData("첫 줄\n둘째 줄", "첫 줄\r\n둘째 줄", MemoMatch.Same)]
    [InlineData("우리 글", "우리 글 ", MemoMatch.Different)]
    [InlineData("우리 글", "다른 글", MemoMatch.Different)]
    public void Rules(string ours, string? inBit, MemoMatch expected)
    {
        Assert.Equal(expected, new MemoMatcher().Compare(ours, inBit));
    }

    [Fact(DisplayName = "AC-035.3 진짜 비교기로 끝까지: 칸이 윈도우 줄바꿈만 다르면 쓰지 않고 완료(이미 입력됨)")]
    public void SameThroughHandler()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1, memo: "첫 줄\n둘째 줄");
        rig.Ui.Bit[item.Chart] = "첫 줄\r\n둘째 줄";

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", "이미 입력됨"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
    }
}

public class InputWiringUnconfirmedTests
{
    private static readonly InputItem P = Sample.Item(9, date: "2026-09-15", visitKey: "p");

    [Theory(DisplayName = "AC-035.4 쓰다 멈춘 진료 P가 묶음에 없으면 확인 창도 비트도 건드리지 않고 stopped(E-INPUT-STOPPED)와 unconfirmed로 P를 알린다")]
    [InlineData(JournalState.Writing)]
    [InlineData(JournalState.WriteUnconfirmed)]
    public void StuckOutsideBatch(JournalState state)
    {
        using var rig = new WiringRig();
        rig.Reopen().Mark(P, state);
        var other = Sample.Item(1);

        var (_, result) = rig.Run(other);

        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(0, rig.UiOpened);
        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-INPUT-STOPPED", result.GetProperty("code").GetString());
        var row = Assert.Single(result.GetProperty("unconfirmed").EnumerateArray());
        Assert.Equal(new[] { "visitKey", "date" }, Json.Keys(row));
        Assert.Equal("p", row.GetProperty("visitKey").GetString());
        Assert.Equal("2026-09-15", row.GetProperty("date").GetString());
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, other.VisitKey));

        var reopened = rig.Reopen();
        Assert.Equal(state, reopened.LastState(P));
        Assert.Null(reopened.LastState(other));
    }

    [Fact(DisplayName = "AC-035.4 남아 있는 work-*.dat 전부에서 찾는다: 다른 달, 본 파일 없이 .bak만 남은 달도 본다")]
    public void FindsInEveryMonthFile()
    {
        using var rig = new WiringRig();
        var older = Sample.Item(8, date: "2026-07-01", visitKey: "older");
        rig.Reopen().Mark(P, JournalState.Writing);
        rig.Reopen().Mark(older, JournalState.WriteUnconfirmed);
        System.IO.File.Move(rig.Files.PathOf("work-2026-07.dat"), rig.Files.PathOf("work-2026-07.dat.bak"));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal(new[] { "older", "p" }, result.GetProperty("unconfirmed").EnumerateArray().Select(row => row.GetProperty("visitKey").GetString()).OrderBy(key => key, StringComparer.Ordinal));
        Assert.Empty(rig.Confirm.Shown);
    }

    [Theory(DisplayName = "AC-035.4 마지막 기록이 쓰다 멈춘 것이 아니면 막지 않는다")]
    [InlineData(JournalState.Done)]
    [InlineData(JournalState.Skipped)]
    [InlineData(JournalState.Check)]
    [InlineData(JournalState.SkippedByHand)]
    public void OtherStatesDoNotBlock(JournalState state)
    {
        using var rig = new WiringRig();
        var journal = rig.Reopen();
        journal.Mark(P, JournalState.Writing);
        journal.Mark(P, state);

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Single(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-035.4 P가 이번 묶음에 있으면 막지 않고 AC-017.7대로 맨 앞에서 한다")]
    public void StuckInsideBatch()
    {
        using var rig = new WiringRig();
        var first = Sample.Item(1, date: "2026-09-01");
        rig.Reopen().Mark(P, JournalState.Writing);

        var (_, result) = rig.Run(first, P);

        Assert.Single(rig.Confirm.Shown);
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Equal("p", result.GetProperty("results")[0].GetProperty("visitKey").GetString());
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(P));
    }

    [Fact(DisplayName = "AC-035.4 이 병원 파일의 입력 기록 값이 틀리면 같은 자리에서 E-STORE-FAILED로 멈춘다: 확인 창도 비트도 건드리지 않는다")]
    public void UnreadableJournal()
    {
        using var rig = new WiringRig();
        rig.Files.Open().SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"nonsense\"}"));
        var item = Sample.Item(1);

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, item.VisitKey));
    }

    [Fact(DisplayName = "AC-035.4 다른 프로필 ID의 달 파일은 쓰다 멈춘 사람 찾기에 들지 않는다(AC-015.4): unconfirmed에 없고 묶음을 멈추지 않는다")]
    public void OtherHospitalFileIsNotRead()
    {
        using var rig = new WiringRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth("2026-08", null, null, StoreJson.El("{\"x\":\"writing\"}"));

        var (_, result) = rig.Run(Sample.Item(1));

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.False(result.TryGetProperty("unconfirmed", out _));
    }

    [Fact(DisplayName = "AC-035.4 쓰다 멈춘 사람이 묶음에 있는지는 진료 번호와 달로 본다: 다른 달의 같은 번호는 그 사람이 아니라 창 없이 멈춘다")]
    public void SameKeyOtherMonthIsOutside()
    {
        using var rig = new WiringRig();
        rig.Reopen().Mark(P, JournalState.Writing);
        var sameKey = Sample.Item(1, date: "2026-10-27", visitKey: P.VisitKey);

        var (_, result) = rig.Run(sameKey);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("2026-09-15", Assert.Single(result.GetProperty("unconfirmed").EnumerateArray()).GetProperty("date").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(P));
    }

    [Fact(DisplayName = "AC-035.4 AC-018.16 날짜를 모르는 화면은 그 달 1일로 보낸다: 같은 달의 같은 번호면 내원일이 달라도 그 사람이다")]
    public void SameKeySameMonthIsInside()
    {
        using var rig = new WiringRig();
        rig.Reopen().Mark(P, JournalState.Writing);
        var firstOfMonth = new InputItem(P.VisitKey, "00000000000000000001", "-", "2026-09-01", " ", checkedByHand: true);

        var (_, result) = rig.Run(firstOfMonth);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.False(result.TryGetProperty("unconfirmed", out _));
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(P));
    }

    [Fact(DisplayName = "AC-035.4 쓰다 멈춘 사람이 없는 답에는 unconfirmed 칸이 없다")]
    public void NoFieldWhenNothingStuck()
    {
        using var rig = new WiringRig();
        var (_, result) = rig.Run(Sample.Item(1));
        Assert.Equal(new[] { "status", "code", "reason", "fields", "results" }, Json.Keys(result));
    }
}

public class InputWiringHandCheckTests
{
    private static InputItem Hand(int n = 1, string? date = null) => Sample.Item(n, date: date, checkedByHand: true);

    private static void Stuck(WiringRig rig, InputItem item) => rig.Reopen().Mark(item, JournalState.Writing);

    [Fact(DisplayName = "AC-035.5 PC 확인 창 글에 '직접 확인한 환자 N명'이 나오고, 없으면 그 줄이 없다")]
    public void PromptCounts()
    {
        using var rig = new WiringRig();
        var one = Hand(1);
        var two = Hand(2);
        Stuck(rig, one);
        Stuck(rig, two);

        rig.Run(one, two, Sample.Item(3));

        Assert.Contains("직접 확인한 환자 2명", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.DoesNotContain("직접 확인한", InputPrompt.Build(Sample.Items(1), Sample.Registration), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-035.5 칸이 우리 글과 같으면 저장을 누르지 않고 완료(이미 입력됨), 기록은 Done으로 풀린다")]
    public void SameIsDone()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Ui.Bit[item.Chart] = item.Memo;

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", "이미 입력됨"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 칸이 비었으면 입력하고, 저장을 확인하면 Done으로 풀린다")]
    public void EmptyIsWritten()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);

        var (_, result) = rig.Run(item);

        Assert.Equal(("완료", "입력"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(1, rig.Ui.Saves);
        Assert.Equal(JournalState.Done, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 칸이 다르면 쓰다 멈춘 사람으로 보지 않고 건너뜀(이미 있음), 바꾸지 않고, 다시 열어도 SkippedByHand다")]
    public void DifferentIsSkippedByHand()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Ui.Bit[item.Chart] = "직원이 손으로 넣은 글";

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", "이미 있음"), WiringRig.Row(result, item.VisitKey));
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
        StoreJson.Same("{\"" + item.VisitKey + "\":\"skippedByHand\"}", rig.Files.Inside(StoreRig.MonthFile).GetProperty("journal"));
    }

    [Fact(DisplayName = "AC-035.5 다른 이유의 건너뜀(환자 불일치)도 SkippedByHand이고 묶음을 멈추지 않는다")]
    public void OtherSkipIsSkippedByHand()
    {
        using var rig = new WiringRig();
        var item = Hand();
        var next = Sample.Item(2);
        Stuck(rig, item);
        rig.Ui.OpenOverride = (chart, _, _) => chart == item.Chart ? ChartOpenResult.Failed("검색 결과가 3줄이라 이 환자만 건너뜁니다.") : null;

        var (_, result) = rig.Run(item, next);

        Assert.Equal("건너뜀", WiringRig.Row(result, item.VisitKey).Result);
        Assert.Equal(("완료", "입력"), WiringRig.Row(result, next.VisitKey));
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 묶음이 그 사람에서 멈추거나 차례가 오기 전에 멈춘 사람도 결과는 '확인 필요: 미처리'이고 기록은 SkippedByHand다")]
    public void StoppedBeforeTurnIsSkippedByHand()
    {
        using var rig = new WiringRig();
        var first = Hand(1);
        var second = Hand(2);
        Stuck(rig, first);
        Stuck(rig, second);
        // 첫 지문은 확인 창 앞, 둘째가 P1 차례다
        rig.Ui.FingerprintAt = number => number == 2 ? Sample.With(("txtBilCmt", 0)) : Sample.AllFound();

        var (_, result) = rig.Run(first, second);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-BIT-UI-CHANGED", result.GetProperty("code").GetString());
        Assert.StartsWith("미처리", WiringRig.Row(result, first.VisitKey).Reason, StringComparison.Ordinal);
        Assert.StartsWith("미처리", WiringRig.Row(result, second.VisitKey).Reason, StringComparison.Ordinal);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(first));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(second));
    }

    [Fact(DisplayName = "AC-035.5 쓰기 바로 앞 확인에서 막혀 칸에 아무것도 넣지 않은 건너뜀(MemoWrite.NotWritten)은 writing 뒤에도 SkippedByHand다")]
    public void NotWrittenIsSkippedByHand()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "select") rig.Ui.Editor = "그새 바뀐 글";
        };

        var (_, result) = rig.Run(item);

        Assert.Equal("건너뜀", WiringRig.Row(result, item.VisitKey).Result);
        Assert.Equal(0, rig.Ui.Writes);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 쓴 뒤 다시 읽어 쓰기 전과 같으면 칸에 우리 글이 남지 않았으므로 SkippedByHand다")]
    public void UnchangedAfterWriteIsSkippedByHand()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Ui.ReplaceWorks = false;
        rig.Ui.ValueWorks = false;

        var (_, result) = rig.Run(item);

        Assert.Equal("확인 필요", WiringRig.Row(result, item.VisitKey).Result);
        Assert.Equal(0, rig.Ui.Saves);
        Assert.Equal(JournalState.SkippedByHand, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 쓰기를 시작해 저장을 확인하지 못한 사람은 직접 확인으로 왔어도 WriteUnconfirmed다")]
    public void WriteStartedStaysUnconfirmed()
    {
        using var rig = new WiringRig();
        var item = Hand();
        var next = Hand(2);
        Stuck(rig, item);
        rig.Ui.SaveWorks = false;

        var (_, result) = rig.Run(item, next);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("확인 필요", WiringRig.Row(result, item.VisitKey).Result);
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.WriteUnconfirmed, reopened.LastState(item));
        Assert.Equal(JournalState.SkippedByHand, reopened.LastState(next));
    }

    [Fact(DisplayName = "AC-035.5 쓴 뒤 다시 읽기가 실패하면 같음으로 치지 않고 WriteUnconfirmed다")]
    public void UnreadAfterWriteStaysUnconfirmed()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Ui.ReplaceWorks = false;
        rig.Ui.ValueWorks = false;
        rig.Ui.OnCall = (call, _) =>
        {
            if (call == "value") rig.Ui.ReadFails = true;
        };

        rig.Run(item);

        Assert.Equal(JournalState.WriteUnconfirmed, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 [취소]면 기록이 그대로다")]
    public void CancelKeepsRecord()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.Confirm.Answer = false;

        var (_, result) = rig.Run(item);

        Assert.Equal("cancelled", result.GetProperty("status").GetString());
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 입력 기록을 읽지 못해 아무도 열지 않고 멈춘 묶음(E-STORE-FAILED)이면 기록이 그대로다")]
    public void UnreadableKeepsRecord()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps) { LastStateFailsFor = item.VisitKey };

        var (_, result) = rig.Run(item);

        Assert.Equal("E-STORE-FAILED", result.GetProperty("code").GetString());
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 기록을 지우는 길은 이것뿐이다: store.save의 journal로는 지워지지 않는다")]
    public void StoreSaveCannotClear()
    {
        using var rig = new WiringRig();
        var item = Hand();
        Stuck(rig, item);
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        StoreCommands.Register(dispatcher, () => rig.Files.Open(), () => WorkLock.TryAcquire(TimeSpan.Zero, rig.LockName));
        var inner = "{\"month\":\"2026-10\",\"drafts\":{},\"done\":{},\"journal\":{\"" + item.VisitKey + "\":\"done\"}}";

        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("store.save", JsonSerializer.Serialize(new { payload = inner }))), sink);

        Assert.Equal("result", Assert.Single(sink.Replies).GetProperty("type").GetString());
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 checkedByHand가 없으면 AC-017.7대로다: 칸이 다르면 건너뛰지 않고 묶음을 멈추고 WriteUnconfirmed로 남는다")]
    public void WithoutFlagIsEarlierWrite()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1);
        Stuck(rig, item);
        rig.Ui.Bit[item.Chart] = "칸에 남은 글";

        var (_, result) = rig.Run(item);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("확인 필요", WiringRig.Row(result, item.VisitKey).Result);
        Assert.DoesNotContain("직접 확인한", Assert.Single(rig.Confirm.Shown).Text, StringComparison.Ordinal);
        Assert.Equal(JournalState.WriteUnconfirmed, rig.Reopen().LastState(item));
    }

    [Fact(DisplayName = "AC-035.5 checkedByHand가 false면 없는 것과 같고, 참·거짓이 아니면 E-HELPER-BAD-MESSAGE다")]
    public void FlagShape()
    {
        using var rig = new WiringRig();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        rig.Register(dispatcher);

        string Send(string flag)
        {
            var inner = "{\"items\":[{\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\",\"checkedByHand\":" + flag + "}]}";
            var sink = new ListSink();
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }))), sink);
            return sink.Replies.Last().GetProperty("type").GetString() == "error" ? sink.Replies.Last().GetProperty("code").GetString()! : "";
        }

        Assert.Equal(ErrorCodes.BadMessage, Send("\"yes\""));
        Assert.Equal(ErrorCodes.BadMessage, Send("1"));
        Assert.Empty(rig.Confirm.Shown);
        // 내원 수 답은 묶음 없이 비어 '내원일 없음'으로 빠지지만 모양은 통과한다
        Assert.Equal("", Send("false"));
    }

    [Fact(DisplayName = "AC-035.8 쓰다 멈춤이 아닌 checkedByHand가 빠질 자리이면 보통 빠지는 사람이다: '빼는 환자'에 세고 '직접 확인한 환자'에 세지 않으며 이유에 뒤 글이 없고 기록은 skipped")]
    public void ExcludedHandNotStuck()
    {
        using var rig = new WiringRig();
        var hand = Hand(1);
        var other = Sample.Item(2);
        rig.Visits[WiringRig.Key(hand)] = 2;

        var (_, result) = rig.Run(hand, other);

        var text = Assert.Single(rig.Confirm.Shown).Text;
        Assert.Contains("빼는 환자 1명", text, StringComparison.Ordinal);
        Assert.DoesNotContain("직접 확인한", text, StringComparison.Ordinal);
        Assert.Equal(("건너뜀", "같은 날 내원이 여러 건이라 직접 입력해 주세요"), WiringRig.Row(result, hand.VisitKey));
        Assert.Equal(1, rig.Ui.Opens);
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(hand));
    }

    [Fact(DisplayName = "AC-035.8 쓰다 멈춤이 아닌 checkedByHand가 빠질 자리이고 남는 사람이 없으면 창 없이 finished")]
    public void ExcludedHandNotStuckAlone()
    {
        using var rig = new WiringRig();
        var hand = Hand(1);
        rig.Visits[WiringRig.Key(hand)] = 2;

        var (_, result) = rig.Run(hand);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(0, rig.UiOpened);
        Assert.Equal(("건너뜀", "같은 날 내원이 여러 건이라 직접 입력해 주세요"), WiringRig.Row(result, hand.VisitKey));
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(hand));
    }
}

public class InputWiringFlowTests
{
    private sealed class StepSink : IReplySink
    {
        private readonly List<string> steps;

        public StepSink(List<string> steps)
        {
            this.steps = steps;
        }

        public void Send(byte[] utf8Json) => steps.Add(Json.Parse(utf8Json).GetProperty("type").GetString()!);
    }

    [Fact(DisplayName = "AC-035.7 가짜 부품으로 끝까지 돈다: 명령 표 검사 → 잠금 → 등록 확인 → 내원 수 → 쓰다 멈춘 사람 → 지문 → 확인 창 → 사람마다 → 기록 → 조각")]
    public void WholeChain()
    {
        using var rig = new WiringRig();
        rig.Bit.Session.Answer(Sql.ScopesSql, _ =>
        {
            rig.Steps.Add("gate");
            return new[] { new object?[] { Synthetic.Scope } };
        });
        rig.WrapJournal = inner => new JournalSpy(inner, rig.Steps);
        rig.Ui.OnCall = (call, _) => rig.Steps.Add(call);
        rig.Confirm.Behavior = _ =>
        {
            rig.Steps.Add("confirm");
            return true;
        };

        rig.Send(new[] { Sample.Item(1) }, new StepSink(rig.Steps));

        var expected = new[] { "lock", "gate", "visits", "unconfirmed", "ui", "fingerprint", "confirm", "open", "mark:Writing", "replace", "save", "mark:Done", "results", "chunk", "end" };
        var positions = expected.Select(step => rig.Steps.IndexOf(step)).ToArray();
        Assert.All(positions, position => Assert.True(position >= 0, string.Join(",", rig.Steps)));
        Assert.Equal(positions.OrderBy(position => position), positions);
        Assert.Equal("가짜 메모 1", rig.Ui.Bit[Sample.Item(1).Chart]);
    }

    [Fact(DisplayName = "AC-035.7 명령 표에 없는 칸은 처리기 앞에서 막혀 잠금도 등록 확인도 없다")]
    public void TableCheckComesFirst()
    {
        using var rig = new WiringRig();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        rig.Register(dispatcher);
        var inner = "{\"items\":[{\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\",\"extra\":1}]}";

        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }))), sink);

        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(rig.Steps);
    }

    [Fact(DisplayName = "AC-035.8 내원 수로 모두 빠지면 지문·확인 창 없이 finished, 사람마다 건너뜀 이유가 results에 있고 기록은 skipped다")]
    public void AllDroppedByVisitCount()
    {
        using var rig = new WiringRig();
        var two = Sample.Item(1);
        var none = Sample.Item(2, date: "2026-09-30");
        rig.Visits[WiringRig.Key(two)] = 2;
        rig.Visits[WiringRig.Key(none)] = 0;

        var (replies, result) = rig.Run(two, none);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("code").ValueKind);
        Assert.Equal("같은 날 내원이 여러 건이라 직접 입력해 주세요", WiringRig.Row(result, two.VisitKey).Reason);
        Assert.Equal("내원일 없음", WiringRig.Row(result, none.VisitKey).Reason);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(0, rig.UiOpened);
        Assert.DoesNotContain(replies, reply => reply.GetProperty("type").GetString() == "progress");
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.Skipped, reopened.LastState(two));
        Assert.Equal(JournalState.Skipped, reopened.LastState(none));
    }

    [Fact(DisplayName = "AC-035.8 확인 표시로 모두 빠져도 지문·확인 창 없이 finished, 이유가 results에 있다")]
    public void AllDroppedByMark()
    {
        using var rig = new WiringRig();
        var item = Sample.Item(1, memo: "주사 [부위 확인]");

        var (_, result) = rig.Run(item);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", "확인 표시가 남아 입력하지 않았습니다"), WiringRig.Row(result, item.VisitKey));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(item));
    }

    [Theory(DisplayName = "AC-035.8 확인 표시는 원본 unresolved와 같은 판단이다(AC-014.12)")]
    [InlineData("[부위 확인]", true)]
    [InlineData("앞 글 [약 확인: 약 이름] 뒷 글", true)]
    [InlineData("[좌우 미확인]", true)]
    [InlineData("[회차 미정]", true)]
    [InlineData("[상병 누락]", true)]
    [InlineData("{항목}", true)]
    [InlineData("확인 완료", false)]
    [InlineData("[왼쪽]", false)]
    [InlineData("{}", false)]
    [InlineData("[줄\n확인]", false)]
    [InlineData("{항\n목}", false)]
    public void OpenMarks(string memo, bool expected)
    {
        Assert.Equal(expected, MemoMarks.HasOpenMark(memo));
    }

    [Fact(DisplayName = "AC-035.8 웹이 빈 묶음을 보내면 E-HELPER-BAD-MESSAGE이고 잠금도 등록 확인도 없다")]
    public void EmptyBatchFromWeb()
    {
        using var rig = new WiringRig();

        var reply = Assert.Single(rig.Send(new InputItem[0], null));

        Assert.Equal(ErrorCodes.BadMessage, reply.GetProperty("code").GetString());
        Assert.Empty(rig.Steps);
        Assert.Empty(rig.Bit.Connector.Opened);
    }

    [Fact(DisplayName = "AC-035.8 받은 묶음이 틀리면(같은 차트번호·내원일 두 번) 빼기 전에 E-HELPER-BAD-MESSAGE이고 잠금도 등록 확인도 없다")]
    public void WrongBatchCheckedAsReceived()
    {
        using var rig = new WiringRig();

        var reply = Assert.Single(rig.Send(new[] { Sample.Item(1, visitKey: "a"), Sample.Item(1, visitKey: "b") }, null));

        Assert.Equal(ErrorCodes.BadMessage, reply.GetProperty("code").GetString());
        Assert.Empty(rig.Steps);
        Assert.Empty(rig.Bit.Connector.Opened);
    }

    private const string CannotContinue = "이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.";

    [Fact(DisplayName = "AC-035.8 쓰다 멈춘 사람이 내원 수로 빠질 자리이고 checkedByHand가 없으면 빼지 않고 창 없이 stopped: 기록이 그대로이고 다음 묶음도 AC-035.4로 막힌다")]
    public void StuckPersonWouldBeDropped()
    {
        using var rig = new WiringRig();
        var stuck = Sample.Item(1);
        var other = Sample.Item(2);
        rig.Reopen().Mark(stuck, JournalState.WriteUnconfirmed);
        rig.Visits[WiringRig.Key(stuck)] = 2;

        var (_, result) = rig.Run(stuck, other);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("E-INPUT-STOPPED", result.GetProperty("code").GetString());
        Assert.Equal(CannotContinue, result.GetProperty("reason").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(stuck.VisitKey, Assert.Single(result.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
        Assert.Equal("확인 필요", WiringRig.Row(result, stuck.VisitKey).Result);
        Assert.Equal(("확인 필요", "미처리"), WiringRig.Row(result, other.VisitKey));
        var reopened = rig.Reopen();
        Assert.Equal(JournalState.WriteUnconfirmed, reopened.LastState(stuck));
        Assert.Null(reopened.LastState(other));

        var (_, next) = rig.Run(other);
        Assert.Equal("stopped", next.GetProperty("status").GetString());
        Assert.Equal(stuck.VisitKey, Assert.Single(next.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
        Assert.Empty(rig.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-035.8 쓰다 멈춘 사람이 확인 표시로 빠질 자리이고 checkedByHand가 없어도 빼지 않고 stopped, 다음 묶음도 AC-035.4로 막힌다")]
    public void StuckPersonWithMark()
    {
        using var rig = new WiringRig();
        var stuck = Sample.Item(1, memo: "주사 {항목}");
        rig.Reopen().Mark(stuck, JournalState.Writing);

        var (_, result) = rig.Run(stuck);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal(CannotContinue, result.GetProperty("reason").GetString());
        Assert.Empty(rig.Ui.Calls);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(stuck));

        var (_, next) = rig.Run(Sample.Item(2));
        Assert.Equal("stopped", next.GetProperty("status").GetString());
        Assert.True(next.TryGetProperty("unconfirmed", out _));
    }

    [Fact(DisplayName = "AC-035.8 쓰다 멈춘 사람의 공백뿐인 메모(checkedByHand 없음): 내원 수 1건이어도 창이 불리지 않고 stopped, 기록이 그대로이고 OpenPatient가 불리지 않는다")]
    public void StuckPersonBlankMemo()
    {
        using var rig = new WiringRig();
        var stuck = Sample.Item(1, memo: " ");
        rig.Reopen().Mark(stuck, JournalState.Writing);

        var (_, result) = rig.Run(stuck);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal(CannotContinue, result.GetProperty("reason").GetString());
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.Writing, rig.Reopen().LastState(stuck));
    }

    [Theory(DisplayName = "AC-035.8 쓰다 멈추지 않은 사람의 공백뿐인 메모: 깃발과 상관없이 내원 수 1건이어도 건너뜀 '넣을 메모가 없어'이고 완료가 아니며 OpenPatient가 불리지 않는다")]
    [InlineData(false, " ")]
    [InlineData(false, " \r\n\t ")]
    [InlineData(true, " ")]
    public void NotStuckBlankMemo(bool checkedByHand, string memo)
    {
        using var rig = new WiringRig();
        var blank = Sample.Item(1, memo: memo, checkedByHand: checkedByHand);

        var (_, result) = rig.Run(blank);

        Assert.Equal("finished", result.GetProperty("status").GetString());
        Assert.Equal(("건너뜀", "넣을 메모가 없어 입력하지 않았습니다"), WiringRig.Row(result, blank.VisitKey));
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Equal(JournalState.Skipped, rig.Reopen().LastState(blank));
    }

    [Fact(DisplayName = "AC-035.8 [취소]면 뺀 사람이 있어도 results가 비어 있고 아무 기록도 남지 않는다")]
    public void CancelWritesNothingForDropped()
    {
        using var rig = new WiringRig();
        var dropped = Sample.Item(1);
        var other = Sample.Item(2);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        rig.Confirm.Answer = false;

        var (_, result) = rig.Run(dropped, other);

        Assert.Equal("cancelled", result.GetProperty("status").GetString());
        Assert.Empty(result.GetProperty("results").EnumerateArray());
        Assert.Empty(rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.8 남은 사람이 있어 지문을 보다 멈춰도(E-BIT-UI-CHANGED) 뺀 사람의 이유는 results에 있고 남은 사람은 열지 않는다")]
    public void FingerprintStopKeepsDroppedReasons()
    {
        using var rig = new WiringRig();
        var dropped = Sample.Item(1);
        var other = Sample.Item(2);
        rig.Visits[WiringRig.Key(dropped)] = 2;
        rig.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));

        var (_, result) = rig.Run(dropped, other);

        Assert.Equal("E-BIT-UI-CHANGED", result.GetProperty("code").GetString());
        Assert.Equal("같은 날 내원이 여러 건이라 직접 입력해 주세요", WiringRig.Row(result, dropped.VisitKey).Reason);
        Assert.Empty(rig.Confirm.Shown);
        Assert.Equal(0, rig.Ui.Opens);
        Assert.Null(rig.Reopen().LastState(other));
    }

    [Fact(DisplayName = "AC-035.8 차례: 쓰다 멈춘 사람 검사가 빼기보다 먼저다(빠진 다른 사람 때문에 P를 놓치지 않는다)")]
    public void UnconfirmedBeforeDrop()
    {
        using var rig = new WiringRig();
        var p = Sample.Item(9, date: "2026-09-15", visitKey: "p");
        var dropped = Sample.Item(1);
        rig.Reopen().Mark(p, JournalState.Writing);
        rig.Visits[WiringRig.Key(dropped)] = 2;

        var (_, result) = rig.Run(dropped);

        Assert.Equal("stopped", result.GetProperty("status").GetString());
        Assert.Equal("p", Assert.Single(result.GetProperty("unconfirmed").EnumerateArray()).GetProperty("visitKey").GetString());
        Assert.Null(rig.Reopen().LastState(dropped));
    }
}
