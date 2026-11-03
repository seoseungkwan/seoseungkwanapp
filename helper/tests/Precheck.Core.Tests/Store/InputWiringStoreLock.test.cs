using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Store;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Store;

/// <summary>AC-035.6 store.save와 .bak으로 되살리는 store.load는 잠금을 잡은 동안에만 파일을 쓴다. 뮤텍스는 스레드마다 주인이 달라 다른 스레드로 다른 프로세스를 흉내 낸다.</summary>
public class InputWiringStoreLockTests
{
    private sealed class Holder : IDisposable
    {
        private readonly ManualResetEventSlim held = new ManualResetEventSlim();
        private readonly ManualResetEventSlim release = new ManualResetEventSlim();
        private readonly Thread thread;

        public Holder(string name)
        {
            thread = new Thread(() =>
            {
                using var mutex = new Mutex(false, name);
                mutex.WaitOne();
                held.Set();
                release.Wait();
                mutex.ReleaseMutex();
            }) { IsBackground = true };
            thread.Start();
            Assert.True(held.Wait(TimeSpan.FromSeconds(10)));
        }

        public void Dispose()
        {
            release.Set();
            thread.Join(TimeSpan.FromSeconds(10));
        }
    }

    private sealed class CountingLock : IDisposable
    {
        private readonly LockRig rig;

        public CountingLock(LockRig rig)
        {
            this.rig = rig;
            rig.Held = true;
            rig.Acquired++;
        }

        public void Dispose() => rig.Held = false;
    }

    /// <summary>쓰는 순간에 잠금을 쥐었는지 본다(암호화는 파일을 쓰기 직전이다).</summary>
    private sealed class HeldProtector : IProtector
    {
        private readonly LockRig rig;

        public HeldProtector(LockRig rig)
        {
            this.rig = rig;
        }

        public byte[] Protect(byte[] plain)
        {
            rig.ProtectCalls++;
            Assert.True(rig.Held, "잠금 없이 쓰려 했다");
            return rig.Files.Protector.Protect(plain);
        }

        public byte[] Unprotect(byte[] cipher) => rig.Files.Protector.Unprotect(cipher);
    }

    private sealed class LockRig : IDisposable
    {
        public string Name { get; } = @"Local\PrecheckTest." + Guid.NewGuid().ToString("N");
        public StoreRig Files { get; } = new StoreRig();
        public bool Held { get; set; }
        public int Acquired { get; set; }
        public int ProtectCalls { get; set; }

        /// <summary>잠금은 시험 시간이 길어지지 않게 조금만 기다린다(진짜 5초는 WaitsFiveSeconds가 본다).</summary>
        public List<JsonElement> Save(string inner, TimeSpan? wait = null) => Handle("store.save", "{\"payload\":" + JsonSerializer.Serialize(inner) + "}", wait);

        public List<JsonElement> Load(TimeSpan? wait = null) => Handle("store.load", "{\"months\":[\"2026-10\"]}", wait);

        private List<JsonElement> Handle(string cmd, string args, TimeSpan? wait)
        {
            var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
            StoreCommands.Register(dispatcher, () => Files.Open(), () => WorkLock.TryAcquire(wait ?? TimeSpan.FromMilliseconds(50), Name));
            var sink = new ListSink();
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), sink);
            return sink.Replies;
        }

        /// <summary>가짜 잠금으로 처리기를 부른다. 쓰는 순간에 쥐고 있는지 HeldProtector가 본다.</summary>
        public List<JsonElement> HandleCounted(string cmd, string args)
        {
            var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
            StoreCommands.Register(dispatcher, () => Files.Open(protector: new HeldProtector(this)), () => new CountingLock(this));
            var sink = new ListSink();
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), sink);
            return sink.Replies;
        }

        public void Dispose() => Files.Dispose();
    }

    private const string MonthSave = "{\"month\":\"2026-10\",\"drafts\":{\"v1\":\"고친 메모\"},\"done\":{}}";

    private static string Code(List<JsonElement> replies) => Assert.Single(replies).GetProperty("code").GetString()!;

    private static string Type(List<JsonElement> replies) => replies.Last().GetProperty("type").GetString()!;

    [Fact(DisplayName = "AC-035.6 잠금을 쥔 채 store.save를 부르면 파일이 그대로이고 E-BRIDGE-BUSY다")]
    public void SaveWhileHeld()
    {
        using var rig = new LockRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.GoodMonth());
        var before = rig.Files.Bytes(StoreRig.MonthFile);

        using (new Holder(rig.Name))
        {
            Assert.Equal("E-BRIDGE-BUSY", Code(rig.Save(MonthSave)));
            Assert.Equal("E-BRIDGE-BUSY", Code(rig.Save("{\"contact\":{\"c\":1}}")));
            Assert.Equal("E-BRIDGE-BUSY", Code(rig.Save("{\"settings\":{\"s\":1}}")));
        }

        Assert.Equal(before, rig.Files.Bytes(StoreRig.MonthFile));
        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.6 store.save는 쓰는 동안 잠금을 쥐고, 끝나면 놓는다")]
    public void SaveHoldsLockWhileWriting()
    {
        using var rig = new LockRig();
        var replies = rig.HandleCounted("store.save", "{\"payload\":" + JsonSerializer.Serialize(MonthSave) + "}");

        Assert.Equal("result", Type(replies));
        Assert.Equal(1, rig.Acquired);
        Assert.True(rig.ProtectCalls > 0);
        Assert.False(rig.Held);
    }

    [Fact(DisplayName = "AC-035.6 store.save는 잠금이 풀리면 쓰고, 실패해도 잠금을 놓는다")]
    public void SaveReleases()
    {
        using var rig = new LockRig();
        Assert.Equal("result", Type(rig.Save(MonthSave)));
        Assert.Equal("result", Type(rig.Save(MonthSave)));

        rig.Files.Plant(StoreRig.MonthFile, rig.Files.GoodMonth(profileId: StoreRig.OtherProfile));
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Code(rig.Save(MonthSave)));

        // 같은 스레드는 뮤텍스를 거듭 잡을 수 있어 다른 스레드에서 본다
        var free = false;
        var other = new Thread(() =>
        {
            using var again = WorkLock.TryAcquire(TimeSpan.Zero, rig.Name);
            free = again != null;
        });
        other.Start();
        other.Join();
        Assert.True(free);
    }

    [Fact(DisplayName = "AC-035.6 store.save는 잠금을 5초까지 기다린 뒤 E-BRIDGE-BUSY다")]
    public void WaitsFiveSeconds()
    {
        using var rig = new LockRig();
        using var holder = new Holder(rig.Name);
        var watch = Stopwatch.StartNew();

        Assert.Equal("E-BRIDGE-BUSY", Code(rig.Save(MonthSave, WorkLock.StoreSaveWait)));

        Assert.True(watch.Elapsed >= TimeSpan.FromSeconds(4.5), watch.Elapsed.ToString());
        Assert.Empty(rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.6 모양이 틀린 store.save는 잠금을 기다리지 않는다")]
    public void BadSaveTakesNoLock()
    {
        using var rig = new LockRig();
        var replies = rig.HandleCounted("store.save", "{\"payload\":" + JsonSerializer.Serialize("{\"month\":\"2026-10\"}") + "}");

        Assert.Equal(ErrorCodes.BadMessage, Code(replies));
        Assert.Equal(0, rig.Acquired);
    }

    [Fact(DisplayName = "AC-035.6 .bak으로 되살려야 하는 store.load는 잠금을 쥔 채면 아무것도 쓰지 않고 E-BRIDGE-BUSY다")]
    public void RestoreWhileHeld()
    {
        using var rig = new LockRig();
        var good = rig.Files.GoodMonth();
        var broken = Encoding.ASCII.GetBytes("garbage");
        rig.Files.Plant(StoreRig.MonthFile, broken);
        rig.Files.Plant(StoreRig.MonthFile + ".bak", good);

        using (new Holder(rig.Name))
        {
            Assert.Equal("E-BRIDGE-BUSY", Code(rig.Load()));
        }

        Assert.Equal(new[] { StoreRig.MonthFile, StoreRig.MonthFile + ".bak" }, rig.Files.Names());
        Assert.Equal(broken, rig.Files.Bytes(StoreRig.MonthFile));

        // 풀리면 되살린다
        Assert.Equal("end", Type(rig.Load()));
        Assert.Equal(good, rig.Files.Bytes(StoreRig.MonthFile));
    }

    [Fact(DisplayName = "AC-035.6 본 파일 없이 .bak만 있거나, 깨진 파일의 이름을 바꿔야 해도 잠금을 쥔 채면 쓰지 않는다")]
    public void OtherRepairsWhileHeld()
    {
        using var onlyBackup = new LockRig();
        onlyBackup.Files.Plant(StoreRig.MonthFile + ".bak", onlyBackup.Files.GoodMonth());
        using (new Holder(onlyBackup.Name))
        {
            Assert.Equal("E-BRIDGE-BUSY", Code(onlyBackup.Load()));
        }
        Assert.Equal(new[] { StoreRig.MonthFile + ".bak" }, onlyBackup.Files.Names());

        using var brokenOnly = new LockRig();
        brokenOnly.Files.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));
        using (new Holder(brokenOnly.Name))
        {
            Assert.Equal("E-BRIDGE-BUSY", Code(brokenOnly.Load()));
        }
        Assert.Equal(new[] { StoreRig.MonthFile }, brokenOnly.Files.Names());
    }

    [Fact(DisplayName = "AC-035.6 되살리는 일이 없는 store.load는 잠금 없이 읽고 아무것도 쓰지 않는다: 입력 중에도 읽힌다")]
    public void CleanLoadNeedsNoLock()
    {
        using var rig = new LockRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.GoodMonth());

        using (new Holder(rig.Name))
        {
            Assert.Equal("end", Type(rig.Load()));
        }

        var counted = rig.HandleCounted("store.load", "{\"months\":[\"2026-10\"]}");
        Assert.Equal("end", Type(counted));
        Assert.Equal(0, rig.Acquired);
        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names());
    }

    [Fact(DisplayName = "AC-035.6 되살리는 store.load는 잠금을 쥔 동안에만 파일을 쓰고 끝나면 놓는다")]
    public void RestoreHoldsLock()
    {
        using var rig = new LockRig();
        rig.Files.Plant(StoreRig.MonthFile + ".bak", rig.Files.GoodMonth());

        var replies = rig.HandleCounted("store.load", "{\"months\":[\"2026-10\"]}");

        Assert.Equal("end", Type(replies));
        Assert.Equal(1, rig.Acquired);
        Assert.False(rig.Held);
        Assert.Contains(StoreRig.MonthFile, rig.Files.Names());
    }
}
