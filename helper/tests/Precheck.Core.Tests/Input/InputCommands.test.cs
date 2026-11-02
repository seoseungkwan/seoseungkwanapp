using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>
/// bit.input 처리기를 Dispatcher로 끝까지: 명령 표 검사 → 잠금 → 등록 확인 → InputRunner → 진행·조각·end.
/// 여기서는 가짜 입력 기록·비교를 끼운다. 진짜 작업 저장(WorkStoreJournal)·비교(MemoMatcher)로 끝까지 도는 시험은 InputWiring.test.cs에 있다.
/// </summary>
public class InputCommandsTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private sealed class FakeWindow : IProgressWindow
    {
        public bool Pressed;
        public List<(int Done, int Total)> Updates { get; } = new List<(int Done, int Total)>();
        public int Disposed;
        public bool StopPressed => Pressed;
        public void Update(int done, int total) => Updates.Add((done, total));
        public void Dispose() => Disposed++;
    }

    private sealed class Harness : IDisposable
    {
        public readonly Rig Rig = new Rig().Registered();
        public readonly FakeChartUi Ui = new FakeChartUi();
        public readonly FakeInputConfirm Confirm = new FakeInputConfirm();
        public readonly FakeJournal Journal = new FakeJournal();
        public readonly FakeWindow Window = new FakeWindow();
        public readonly HostSignal Signal = new HostSignal();
        public readonly List<(string? Cmd, string? Code)> Log = new List<(string? Cmd, string? Code)>();
        public readonly List<string> Steps = new List<string>();
        public readonly string LockName = @"Local\PrecheckTest." + Guid.NewGuid().ToString("N");
        public int JournalOpened;
        public string? OpenedInstall;

        public Harness()
        {
            Rig.Session.Answer(Precheck.Core.Bit.Sql.InputVisitCountSql, _ => Sample.VisitRows(5));
        }

        public Dispatcher Dispatcher()
        {
            var dispatcher = new Dispatcher(Table, (cmd, code) => Log.Add((cmd, code)));
            InputCommands.Register(dispatcher, new InputServices(
                Rig.Services,
                Signal,
                install => { OpenedInstall = install; return Ui; },
                Confirm,
                _ => Window,
                registration => { JournalOpened++; Assert.Equal(Synthetic.ProfileId, registration.ProfileId); return Journal; },
                new FakeMatcher(),
                () => WorkLock.TryAcquire(WorkLock.InputWait, LockName),
                (cmd, code) => Log.Add((cmd, code))));
            return dispatcher;
        }

        public void Dispose() => Rig.Dispose();
    }

    private static byte[] Request(IEnumerable<InputItem> items, string id = "req-1")
    {
        var inner = JsonSerializer.Serialize(new
        {
            items = items.Select(item => new { visitKey = item.VisitKey, chart = item.Chart, name = item.Name, date = item.Date, memo = item.Memo }),
        });
        return Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }), id));
    }

    private static (List<JsonElement> Replies, JsonElement? Result) Run(Harness harness, IEnumerable<InputItem> items, IReplySink? sink = null)
    {
        var list = new ListSink();
        harness.Dispatcher().Handle(Request(items), sink ?? list);
        var replies = list.Replies;
        var chunks = replies.Where(reply => reply.GetProperty("type").GetString() == "chunk").Select(reply => reply.GetProperty("data").GetString()).ToArray();
        return (replies, chunks.Length == 0 ? (JsonElement?)null : Json.Parse(string.Concat(chunks)));
    }

    // Program은 net48 exe 안의 Main이라(표를 만드는 줄이 Main 안에 있다) 이 시험 프로젝트에서 부를 수 없다. 그래서 Program.cs와 같은 줄로 표를 만든다.
    // Program.cs 자체는 input.dotnet.test.ts·input-wiring.dotnet.test.ts의 글자 검사가 본다.
    [Fact(DisplayName = "AC-035.7 hello·비트 명령에 InputCommands.Register를 더한 표(Program.cs와 같은 줄)는 bit.input에 E-HELPER-UNKNOWN-COMMAND로 답하지 않고 끝까지 돈다")]
    public void WiredWithHelloAndBitCommands()
    {
        using var harness = new Harness();
        var dispatcher = harness.Dispatcher();
        Hello.Register(dispatcher, Table);
        Precheck.Core.Bit.BitCommands.Register(dispatcher, harness.Rig.Services);

        Assert.True(Table.Has(InputCommands.Name));
        var hello = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(Hello.Name, "{}", "h-1")), hello);
        Assert.Equal("result", Assert.Single(hello.Replies).GetProperty("type").GetString());

        var sink = new ListSink();
        dispatcher.Handle(Request(Sample.Items(1)), sink);
        Assert.DoesNotContain(sink.Replies, reply => reply.GetProperty("type").GetString() == "error");
        Assert.Equal("end", sink.Replies.Last().GetProperty("type").GetString());
        Assert.Equal("req-1", sink.Replies.Last().GetProperty("id").GetString());
        Assert.Equal(1, harness.Ui.Writes);
        Assert.Single(harness.Journal.Saved);
    }

    [Fact(DisplayName = "AC-017.6 진행은 progress {done, total} 숫자만, 결과는 조각(chunk … end) 하나로, result 답은 없다")]
    public void ProgressThenChunks()
    {
        using var harness = new Harness();
        var (replies, result) = Run(harness, Sample.Items(2));

        var types = replies.Select(reply => reply.GetProperty("type").GetString()).ToArray();
        Assert.Equal(new[] { "progress", "progress", "progress", "chunk", "end" }, types);
        foreach (var progress in replies.Where(reply => reply.GetProperty("type").GetString() == "progress"))
        {
            Assert.Equal(new[] { "v", "id", "type", "done", "total" }, Json.Keys(progress));
        }
        Assert.Equal(new[] { 0, 1, 2 }, replies.Take(3).Select(reply => reply.GetProperty("done").GetInt32()));

        Assert.Equal("finished", result!.Value.GetProperty("status").GetString());
        var rows = result.Value.GetProperty("results").EnumerateArray().ToArray();
        Assert.Equal(new[] { "v1", "v2" }, rows.Select(row => row.GetProperty("visitKey").GetString()));
        Assert.All(rows, row =>
        {
            Assert.Equal("완료", row.GetProperty("result").GetString());
            Assert.Equal("입력", row.GetProperty("reason").GetString());
            Assert.Equal(new[] { "visitKey", "result", "reason" }, Json.Keys(row));
        });
    }

    [Fact(DisplayName = "AC-017.6 결과 JSON에 이름·차트번호·메모가 없다, 기록에는 명령 이름과 번호만")]
    public void NoPatientTextOutsideResult()
    {
        using var harness = new Harness();
        var items = Sample.Items(2);
        var (replies, result) = Run(harness, items);
        var text = result!.Value.GetRawText() + string.Concat(replies.Where(reply => reply.GetProperty("type").GetString() != "chunk").Select(reply => reply.GetRawText()));
        foreach (var item in items)
        {
            Assert.DoesNotContain(item.Name, text, StringComparison.Ordinal);
            Assert.DoesNotContain(item.Chart, text, StringComparison.Ordinal);
            Assert.DoesNotContain(item.Memo, text, StringComparison.Ordinal);
        }
        Assert.All(harness.Log, entry =>
        {
            Assert.Equal("bit.input", entry.Cmd);
            Assert.True(entry.Code == null || ErrorCodes.IsCode(entry.Code));
        });
    }

    [Fact(DisplayName = "AC-017.1 등록이 없으면 비트 화면·확인 창을 건드리지 않고 E-BIT-NOT-REGISTERED")]
    public void NotRegistered()
    {
        using var harness = new Harness();
        using var bare = new Rig();
        var dispatcher = new Dispatcher(Table);
        InputCommands.Register(dispatcher, new InputServices(
            bare.Services, harness.Signal, _ => harness.Ui, harness.Confirm, _ => harness.Window, _ => harness.Journal, new FakeMatcher(),
            () => WorkLock.TryAcquire(WorkLock.InputWait, harness.LockName)));
        var sink = new ListSink();
        dispatcher.Handle(Request(Sample.Items(1)), sink);
        Assert.Equal("E-BIT-NOT-REGISTERED", Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(harness.Ui.Calls);
        Assert.Empty(harness.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-017.1 등록 병원과 다르면 E-BIT-HOSPITAL-MISMATCH, 비트 화면을 건드리지 않는다. 등록 설치 위치로 화면을 연다")]
    public void Mismatch()
    {
        using var harness = new Harness();
        harness.Rig.Session.Answer(Precheck.Core.Bit.Sql.ScopesSql, "FOREIGN");
        var (replies, _) = Run(harness, Sample.Items(1));
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Single(replies).GetProperty("code").GetString());
        Assert.Empty(harness.Ui.Calls);

        using var good = new Harness();
        Run(good, Sample.Items(1));
        Assert.Equal(Synthetic.Root, good.OpenedInstall);
    }

    [Fact(DisplayName = "AC-017.1 입력하는 동안 비트 DB 세션을 붙잡지 않는다(등록 확인 뒤 닫음)")]
    public void ClosesDbBeforeInput()
    {
        using var harness = new Harness();
        var disposedAtConfirm = -1;
        harness.Confirm.Behavior = _ => { disposedAtConfirm = harness.Rig.Session.Disposed; return false; };
        Run(harness, Sample.Items(1));
        Assert.Equal(1, disposedAtConfirm);
    }

    [Fact(DisplayName = "AC-017.1 명령 표 밖의 칸·틀린 차트번호·같은 진료 두 번이면 E-HELPER-BAD-MESSAGE, 아무것도 입력하지 않음")]
    public void BadRequests()
    {
        using var harness = new Harness();
        var sink = new ListSink();
        var inner = "{\"items\":[{\"visitKey\":\"v1\",\"chart\":\"900001\",\"name\":\"가상환자01\",\"date\":\"2026-10-27\",\"memo\":\"가짜\",\"extra\":1}]}";
        harness.Dispatcher().Handle(Encoding.UTF8.GetBytes(Requests.Envelope("bit.input", JsonSerializer.Serialize(new { payload = inner }))), sink);
        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sink.Replies).GetProperty("code").GetString());

        var (duplicate, _) = Run(harness, new[] { Sample.Item(1, visitKey: "same"), Sample.Item(2, visitKey: "same") });
        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(duplicate).GetProperty("code").GetString());
        Assert.Equal(0, harness.Ui.Writes);
        Assert.Empty(harness.Confirm.Shown);

        var (sameDay, _) = Run(harness, new[] { Sample.Item(1, visitKey: "v1"), Sample.Item(1, visitKey: "v2") });
        Assert.Equal(ErrorCodes.BadMessage, Assert.Single(sameDay).GetProperty("code").GetString());
        Assert.Equal(0, harness.Ui.Writes);
        Assert.Empty(harness.Confirm.Shown);
    }

    [Fact(DisplayName = "AC-017.2 취소면 cancelled만 조각으로 답하고, 진행 창을 띄우지 않는다. 입력 기록도 안 쓴다")]
    public void Cancelled()
    {
        using var harness = new Harness();
        harness.Confirm.Answer = false;
        var (replies, result) = Run(harness, Sample.Items(2));
        Assert.Equal("cancelled", result!.Value.GetProperty("status").GetString());
        Assert.Empty(result.Value.GetProperty("results").EnumerateArray());
        Assert.DoesNotContain(replies, reply => reply.GetProperty("type").GetString() == "progress");
        Assert.Empty(harness.Window.Updates);
        Assert.Empty(harness.Journal.Marks);
    }

    [Fact(DisplayName = "AC-017.4 지문이 다르면 stopped·E-BIT-UI-CHANGED·칸 ID 목록을 조각으로 돌려준다(error 봉투에는 번호만 실린다)")]
    public void FingerprintReply()
    {
        using var harness = new Harness();
        harness.Ui.FingerprintAt = _ => Sample.With(("txtBilCmt", 0));
        var (_, result) = Run(harness, Sample.Items(1));
        Assert.Equal("stopped", result!.Value.GetProperty("status").GetString());
        Assert.Equal("E-BIT-UI-CHANGED", result.Value.GetProperty("code").GetString());
        Assert.Equal(new[] { "txtBilCmt" }, result.Value.GetProperty("fields").EnumerateArray().Select(field => field.GetString()));
        Assert.Contains(harness.Log, entry => entry.Code == "E-BIT-UI-CHANGED");
    }

    [Fact(DisplayName = "AC-017.5 진행 창 [멈추기]면 지금 사람까지 하고 멈춘다. 진행 창에 숫자가 간다")]
    public void StopButton()
    {
        using var harness = new Harness();
        harness.Ui.OnCall = (call, _) =>
        {
            if (call == "save") harness.Window.Pressed = true;
        };
        var (_, result) = Run(harness, Sample.Items(3));
        Assert.Equal("stopped", result!.Value.GetProperty("status").GetString());
        Assert.Equal(1, harness.Ui.Saves);
        Assert.Equal(new[] { (0, 3), (1, 3) }, harness.Window.Updates);
        Assert.Equal(1, harness.Window.Disposed);
    }

    [Fact(DisplayName = "AC-017.7 끝나면 결과를 입력 기록에 남긴다(보내기 전에)")]
    public void SavesResults()
    {
        using var harness = new Harness();
        Run(harness, Sample.Items(2));
        var saved = Assert.Single(harness.Journal.Saved);
        Assert.Equal(InputStatus.Finished, saved.Status);
        Assert.Equal(2, saved.Results.Count);
    }

    [Fact(DisplayName = "AC-017.9 입력 중 표준 입력이 닫히면 지금 사람까지 하고, 남은 사람은 미처리로 기록·결과를 남기고 처리기가 끝난다")]
    public void StdinClosedDuringInput()
    {
        using var harness = new Harness();
        harness.Ui.OnCall = (call, _) =>
        {
            if (call == "replace") harness.Signal.MarkStdinClosed();
        };
        var (_, result) = Run(harness, Sample.Items(3));
        Assert.Equal("stopped", result!.Value.GetProperty("status").GetString());
        Assert.Equal(1, harness.Ui.Saves);
        Assert.Equal(new[] { JournalState.Check }, harness.Journal.Of("v3"));
        Assert.Single(harness.Journal.Saved);
    }

    private sealed class ClosedSink : IReplySink
    {
        public int Attempts;

        public void Send(byte[] utf8Json)
        {
            Attempts++;
            throw new IOException("가짜: 보낼 곳이 닫힘");
        }
    }

    [Fact(DisplayName = "AC-017.9 보낼 곳이 닫혔으면 보내기 실패는 무시한다: 처리기는 터지지 않고, 더 쓰지 않고, 결과를 남긴다")]
    public void ClosedOutput()
    {
        using var harness = new Harness();
        var sink = new ClosedSink();
        harness.Dispatcher().Handle(Request(Sample.Items(2)), sink);
        Assert.True(sink.Attempts >= 1);
        Assert.Equal(0, harness.Ui.Writes);
        var saved = Assert.Single(harness.Journal.Saved);
        Assert.Equal(InputStatus.Stopped, saved.Status);
        Assert.All(saved.Results, row => Assert.Equal("미처리", row.Reason));
        Assert.Equal(1, harness.Ui.Disposed);
        Assert.Equal(1, harness.Window.Disposed);
    }

    [Fact(DisplayName = "AC-017.10 다른 프로세스가 잠금을 쥐고 있으면 확인 창도 없이 바로 E-BRIDGE-BUSY, 비트·등록을 건드리지 않는다")]
    public void Busy()
    {
        using var harness = new Harness();
        using var held = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        var holder = new Thread(() =>
        {
            using var mutex = new Mutex(false, harness.LockName);
            mutex.WaitOne();
            held.Set();
            release.Wait();
            mutex.ReleaseMutex();
        }) { IsBackground = true };
        holder.Start();
        Assert.True(held.Wait(TimeSpan.FromSeconds(10)));

        var (replies, _) = Run(harness, Sample.Items(1));

        release.Set();
        holder.Join(TimeSpan.FromSeconds(10));
        Assert.Equal("E-BRIDGE-BUSY", Assert.Single(replies).GetProperty("code").GetString());
        Assert.Empty(harness.Confirm.Shown);
        Assert.Empty(harness.Ui.Calls);
        Assert.Equal(0, harness.JournalOpened);
        Assert.Empty(harness.Rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-017.10 잠금은 확인 창부터 결과 기록까지 쥐고, 끝나면 놓는다")]
    public void HoldsLockAcrossConfirmAndResults()
    {
        using var harness = new Harness();
        bool Free() => OtherThread(() =>
        {
            using var again = WorkLock.TryAcquire(TimeSpan.Zero, harness.LockName);
            return again != null;
        });
        var duringConfirm = true;
        var duringSave = true;
        harness.Confirm.Behavior = _ => { duringConfirm = Free(); return true; };
        harness.Ui.OnCall = (call, _) =>
        {
            if (call == "save") duringSave = Free();
        };
        Run(harness, Sample.Items(1));
        Assert.False(duringConfirm);
        Assert.False(duringSave);
        Assert.True(Free());
    }

    [Fact(DisplayName = "AC-017.10 잠금은 예외로 끝나도 놓는다(등록이 달라 멈춤)")]
    public void ReleasesOnError()
    {
        using var harness = new Harness();
        harness.Rig.Session.Answer(Precheck.Core.Bit.Sql.ScopesSql, "FOREIGN");
        Run(harness, Sample.Items(1));
        Assert.True(OtherThread(() =>
        {
            using var again = WorkLock.TryAcquire(TimeSpan.Zero, harness.LockName);
            return again != null;
        }));
    }

    private static bool OtherThread(Func<bool> work)
    {
        var result = false;
        var thread = new Thread(() => result = work());
        thread.Start();
        thread.Join();
        return result;
    }
}
