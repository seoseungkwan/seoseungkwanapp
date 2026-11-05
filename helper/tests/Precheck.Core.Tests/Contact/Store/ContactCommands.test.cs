using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Store;

/// <summary>
/// REQ-606 store.load·store.save 처리기: 실제 명령 표(commands.json)와 Dispatcher를 지나 답까지 본다.
/// 비트(Rig)·암호화(ReverseProtector)·뮤텍스(FakeWorkLock)는 가짜다.
/// </summary>
public class ContactCommandsTests
{
    private sealed class Bench : IDisposable
    {
        public Bench()
        {
            Store = new ContactStore(Rig.Folder, Protector);
            Dispatcher = new Dispatcher(CommandTable.LoadEmbedded(), (name, code) => Log.Add((name, code)));
            ContactCommands.RegisterStore(Dispatcher, Rig.Services, Store, Lock);
        }

        public Rig Rig { get; } = new Rig();
        public ReverseProtector Protector { get; } = new ReverseProtector();
        public FakeWorkLock Lock { get; } = new FakeWorkLock();
        public ContactStore Store { get; }
        public Dispatcher Dispatcher { get; }
        public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();
        public ListSink Sink { get; private set; } = new ListSink();

        public Bench Registered()
        {
            Rig.Registered();
            return this;
        }

        public List<JsonElement> Send(string cmd, string argsJson)
        {
            Sink = new ListSink();
            Dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, argsJson)), Sink);
            return Sink.Replies;
        }

        public List<JsonElement> Save(string payload) => Send("store.save", "{\"payload\":" + JsonSerializer.Serialize(payload) + "}");

        public List<JsonElement> SaveContact(string contact) => Save("{\"contact\":" + contact + "}");

        public List<JsonElement> Load(string args = "{\"contact\":true}") => Send("store.load", args);

        public bool BitTouched => Rig.Locator.Calls > 0 || Rig.Connector.Opened.Count > 0;

        public void Dispose() => Rig.Dispose();
    }

    private static string Type(JsonElement reply) => reply.GetProperty("type").GetString()!;

    private static void AssertError(List<JsonElement> replies, string code)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("error", Type(reply));
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        Assert.Equal(code, reply.GetProperty("code").GetString());
    }

    /// <summary>chunk(seq 0부터) … end 모양을 확인하고 이어 붙인 글자를 돌려준다.</summary>
    private static string Assemble(List<JsonElement> replies)
    {
        Assert.True(replies.Count >= 2);
        var text = new StringBuilder();
        for (var i = 0; i < replies.Count - 1; i++)
        {
            Assert.Equal("chunk", Type(replies[i]));
            Assert.Equal(i, replies[i].GetProperty("seq").GetInt32());
            text.Append(replies[i].GetProperty("data").GetString());
        }
        var end = replies[replies.Count - 1];
        Assert.Equal("end", Type(end));
        Assert.Equal(replies.Count - 1, end.GetProperty("count").GetInt32());
        var bytes = Encoding.UTF8.GetBytes(text.ToString());
        Assert.Equal(bytes.Length, end.GetProperty("bytes").GetInt32());
        using (var sha = SHA256.Create())
        {
            var hash = string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
            Assert.Equal(hash, end.GetProperty("sha256").GetString());
        }
        return text.ToString();
    }

    [Fact(DisplayName = "AC-606.1 store.save: 등록 확인 → 잠금 안에서 등록 프로필 ID와 함께 저장 → {saved: true}")]
    public void SaveWritesAndAnswers()
    {
        using var bench = new Bench().Registered();
        var heldAtProtect = false;
        bench.Protector.BeforeProtect = () => heldAtProtect = bench.Lock.IsHeld;
        var before = bench.Rig.Session.Disposed;

        var reply = Assert.Single(bench.SaveContact(Contacts.Sample()));

        Assert.Equal("result", Type(reply));
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        Assert.True(reply.GetProperty("data").GetProperty("saved").GetBoolean());
        Assert.True(heldAtProtect);
        Assert.False(bench.Lock.IsHeld);
        Assert.Equal(Contacts.Sample(), bench.Store.Load(Synthetic.ProfileId));
        Assert.Contains(Sql.InstitutionSql, bench.Rig.Session.Sqls);
        Assert.Equal(before + 1, bench.Rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-606.1 store.save: 등록이 없거나 다른 병원이면 그 번호로 막고 잠금도 파일도 건드리지 않는다")]
    public void SaveRequiresHospital()
    {
        using (var bench = new Bench())
        {
            AssertError(bench.SaveContact(Contacts.Sample()), "E-BIT-NOT-REGISTERED");
            Assert.Empty(bench.Lock.Waits);
            Assert.False(File.Exists(bench.Store.FilePath));
        }
        using (var bench = new Bench())
        {
            bench.Rig.Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
            AssertError(bench.SaveContact(Contacts.Sample()), "E-BIT-HOSPITAL-MISMATCH");
            Assert.Empty(bench.Lock.Waits);
            Assert.False(File.Exists(bench.Store.FilePath));
        }
    }

    [Fact(DisplayName = "AC-606.1 진단 기록에는 명령 이름과 오류 번호만 남고 답·기록에 환자 글자가 없다")]
    public void LogHasOnlyNameAndCode()
    {
        using var bench = new Bench().Registered();
        bench.SaveContact(Contacts.Sample());
        bench.Lock.Free = false;
        var replies = bench.SaveContact(Contacts.Sample());

        Assert.Equal(new (string?, string?)[] { ("store.save", null), ("store.save", "E-BRIDGE-BUSY") }, bench.Log);
        Assert.Equal(new[] { "v", "id", "type", "code" }, Json.Keys(Assert.Single(replies)));
        Assert.DoesNotContain(Fake.Name, Encoding.UTF8.GetString(bench.Sink.Messages[0]));
    }

    [Fact(DisplayName = "AC-606.2 store.load: 등록 프로필의 contact를 result 없이 chunk … end로 보낸다")]
    public void LoadSendsChunks()
    {
        using var bench = new Bench().Registered();
        bench.Store.Save(Synthetic.ProfileId, Contacts.Sample());
        var before = bench.Rig.Session.Disposed;

        var replies = bench.Load();

        Assert.Equal(Contacts.Sample(), Assemble(replies));
        Assert.Contains(Sql.InstitutionSql, bench.Rig.Session.Sqls);
        Assert.Equal(before + 1, bench.Rig.Session.Disposed);
        Assert.Empty(bench.Lock.Waits);
    }

    [Fact(DisplayName = "AC-606.2 store.load: 1MB가 넘는 contact는 여러 조각으로 나눠 보내고 조각마다 한도 안이다")]
    public void LoadSplitsLargeContact()
    {
        using var bench = new Bench().Registered();
        var large = "{\"a\":\"" + new string('가', 1_000_000) + "\"}";
        bench.Store.Save(Synthetic.ProfileId, large);

        var replies = bench.Load();

        Assert.True(replies.Count > 3);
        Assert.All(bench.Sink.Messages, message => Assert.True(message.Length + Framing.HeaderSize <= Framing.MaxOutgoing));
        Assert.True(Assemble(replies) == large);
    }

    [Fact(DisplayName = "AC-606.2 store.load: 파일이 없으면 {}를 chunk … end로 보낸다")]
    public void LoadMissingSendsEmpty()
    {
        using var bench = new Bench().Registered();
        Assert.Equal("{}", Assemble(bench.Load()));
    }

    [Fact(DisplayName = "AC-606.2 store.load: 다른 등록 프로필의 파일이면 {}를 보내고 그 값은 보내지 않는다")]
    public void LoadOtherProfileSendsEmpty()
    {
        using var bench = new Bench().Registered();
        bench.Store.Save(Contacts.OtherProfile, Contacts.Sample());

        Assert.Equal("{}", Assemble(bench.Load()));
        Assert.DoesNotContain(Fake.Name, string.Concat(bench.Sink.Messages.Select(Encoding.UTF8.GetString)));
    }

    [Fact(DisplayName = "AC-606.2 store.load: 등록이 없거나 다른 병원이면 조각 없이 그 번호로 답한다")]
    public void LoadRequiresHospital()
    {
        using (var bench = new Bench())
        {
            AssertError(bench.Load(), "E-BIT-NOT-REGISTERED");
        }
        using (var bench = new Bench())
        {
            bench.Rig.Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
            bench.Store.Save(Synthetic.ProfileId, Contacts.Sample());
            AssertError(bench.Load(), "E-BIT-HOSPITAL-MISMATCH");
        }
    }

    [Fact(DisplayName = "AC-606.3 store.load: 둘 다 깨졌으면 조각 없이 E-STORE-BROKEN으로 답한다")]
    public void LoadBrokenAnswersError()
    {
        using var bench = new Bench().Registered();
        File.WriteAllBytes(bench.Store.FilePath, Encoding.ASCII.GetBytes("broken"));
        File.WriteAllBytes(bench.Store.BackupPath, Encoding.ASCII.GetBytes("broken-bak"));

        AssertError(bench.Load(), "E-STORE-BROKEN");
        Assert.Equal(2, Directory.GetFiles(bench.Rig.Folder, "contact.dat*.broken-*").Length);
    }

    [Fact(DisplayName = "AC-606.3 store.save: 쓰기 실패는 E-STORE-FAILED로 답하고 잠금을 푼다")]
    public void SaveFailureReleasesLock()
    {
        using var bench = new Bench().Registered();
        bench.Protector.FailProtect = true;

        AssertError(bench.SaveContact(Contacts.Sample()), "E-STORE-FAILED");
        Assert.Equal(1, bench.Lock.Entered);
        Assert.False(bench.Lock.IsHeld);
    }

    [Theory(DisplayName = "AC-606.4 store.save payload에 contact 밖의 칸이 있으면 E-HELPER-BAD-MESSAGE, 비트·잠금·파일을 건드리지 않는다")]
    [InlineData("{}")]
    [InlineData("{\"month\":\"2026-10\"}")]
    [InlineData("{\"drafts\":{}}")]
    [InlineData("{\"done\":{}}")]
    [InlineData("{\"journal\":{}}")]
    [InlineData("{\"settings\":{}}")]
    [InlineData("{\"contact\":{},\"month\":\"2026-10\"}")]
    [InlineData("{\"contact\":{},\"drafts\":{}}")]
    [InlineData("{\"contact\":{},\"done\":{}}")]
    [InlineData("{\"contact\":{},\"journal\":{}}")]
    [InlineData("{\"contact\":{},\"settings\":{}}")]
    [InlineData("{\"contact\":{},\"other\":{}}")]
    [InlineData("{\"contact\":[]}")]
    public void SaveRejectsOtherFields(string payload)
    {
        using var bench = new Bench().Registered();

        AssertError(bench.Save(payload), "E-HELPER-BAD-MESSAGE");

        Assert.False(bench.BitTouched);
        Assert.Empty(bench.Lock.Waits);
        Assert.False(File.Exists(bench.Store.FilePath));
    }

    [Theory(DisplayName = "AC-606.4 store.load args가 contact: true 하나가 아니면 E-HELPER-BAD-MESSAGE, 비트·파일을 건드리지 않는다")]
    [InlineData("{}")]
    [InlineData("{\"contact\":false}")]
    [InlineData("{\"months\":[\"2026-10\"]}")]
    [InlineData("{\"settings\":true}")]
    [InlineData("{\"settings\":false}")]
    [InlineData("{\"contact\":true,\"months\":[\"2026-10\"]}")]
    [InlineData("{\"contact\":true,\"settings\":true}")]
    [InlineData("{\"contact\":true,\"settings\":false}")]
    [InlineData("{\"contact\":true,\"other\":true}")]
    [InlineData("{\"contact\":\"true\"}")]
    public void LoadRejectsOtherFields(string args)
    {
        using var bench = new Bench().Registered();

        AssertError(bench.Load(args), "E-HELPER-BAD-MESSAGE");

        Assert.False(bench.BitTouched);
    }

    [Fact(DisplayName = "AC-606.4 store.save contact가 32MB를 넘으면 E-HELPER-BAD-MESSAGE, 파일을 쓰지 않는다")]
    public void SaveRejectsOversize()
    {
        using var bench = new Bench().Registered();

        AssertError(bench.SaveContact(Contacts.OfBytes(ContactStore.MaxContactBytes + 1)), "E-HELPER-BAD-MESSAGE");

        Assert.False(File.Exists(bench.Store.FilePath));
    }

    [Fact(DisplayName = "AC-606.5 잠금을 5초 기다려도 못 잡으면 store.save는 E-BRIDGE-BUSY이고 파일은 그대로다")]
    public void SaveBusy()
    {
        using var bench = new Bench().Registered();
        bench.Store.Save(Synthetic.ProfileId, "{\"n\":1}");
        bench.Lock.Free = false;

        AssertError(bench.SaveContact("{\"n\":2}"), "E-BRIDGE-BUSY");

        Assert.Equal(new[] { TimeSpan.FromSeconds(5) }, bench.Lock.Waits);
        Assert.Equal("{\"n\":1}", bench.Store.Load(Synthetic.ProfileId));
        Assert.Equal(new[] { "contact.dat", "registration.dat" }, Contacts.Names(bench.Rig.Folder));
    }

    [Fact(DisplayName = "AC-606.5 store.load는 잠금을 기다리지 않는다(다른 도우미가 잡고 있어도 읽는다)")]
    public void LoadIgnoresLock()
    {
        using var bench = new Bench().Registered();
        bench.Store.Save(Synthetic.ProfileId, "{\"n\":1}");
        bench.Lock.Free = false;

        Assert.Equal("{\"n\":1}", Assemble(bench.Load()));
        Assert.Empty(bench.Lock.Waits);
    }

    [Fact(DisplayName = "AC-606.1 RegisterStore는 빠진 부품을 받지 않는다")]
    public void RegisterRequiresParts()
    {
        using var bench = new Bench();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterStore(null!, bench.Rig.Services, bench.Store, bench.Lock));
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterStore(dispatcher, null!, bench.Store, bench.Lock));
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterStore(dispatcher, bench.Rig.Services, null!, bench.Lock));
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterStore(dispatcher, bench.Rig.Services, bench.Store, null!));
    }
}
