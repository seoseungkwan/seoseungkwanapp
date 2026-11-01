using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Store;

/// <summary>store.save·store.load 처리기(design.md 4-3). 진짜 명령 표·Dispatcher에 가짜 암호화를 붙여 메시지로 부른다.</summary>
public class StoreCommandsTests
{
    private sealed class CommandRig : IDisposable
    {
        private readonly TempFolder registrationFolder = new TempFolder();
        private readonly Dispatcher dispatcher;
        private string dataFolder;

        public CommandRig(bool registered = true)
        {
            Files = new StoreRig();
            dataFolder = Files.Folder;
            var registrations = new RegistrationStore(registrationFolder.Path, Files.Protector);
            if (registered) registrations.Save(Synthetic.Registration());
            dispatcher = new Dispatcher(CommandTable.LoadEmbedded(), (name, code) => Log.Add(name + "|" + code));
            StoreCommands.Register(dispatcher, () =>
                WorkStore.ForRegistered(new StoreFolder(dataFolder), Files.Protector, registrations, () => StoreRig.Today));
        }

        public StoreRig Files { get; }

        public List<string> Log { get; } = new List<string>();

        public void UseDataFolder(string path) => dataFolder = path;

        public List<JsonElement> Save(string innerJson) =>
            Send("store.save", "{\"payload\":" + JsonSerializer.Serialize(innerJson) + "}");

        public List<JsonElement> Load(string argsJson) => Send("store.load", argsJson);

        public List<JsonElement> Send(string cmd, string argsJson)
        {
            var sink = new ListSink();
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, argsJson)), sink);
            return sink.Replies;
        }

        public void Dispose()
        {
            Files.Dispose();
            registrationFolder.Dispose();
        }
    }

    private static string ErrorCode(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("error", reply.GetProperty("type").GetString());
        return reply.GetProperty("code").GetString()!;
    }

    private static void AssertSaved(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("result", reply.GetProperty("type").GetString());
        Assert.Equal("req-1", reply.GetProperty("id").GetString());
        Assert.Equal("{\"saved\":true}", reply.GetProperty("data").GetRawText());
    }

    /// <summary>chunk … end를 검사하고 다시 붙인 JSON 글자를 돌려준다.</summary>
    private static string Assemble(List<JsonElement> replies)
    {
        Assert.True(replies.Count >= 2, "조각과 end가 있어야 한다");
        var text = new StringBuilder();
        for (var i = 0; i < replies.Count - 1; i++)
        {
            Assert.Equal("chunk", replies[i].GetProperty("type").GetString());
            Assert.Equal(i, replies[i].GetProperty("seq").GetInt32());
            text.Append(replies[i].GetProperty("data").GetString());
        }
        var end = replies[replies.Count - 1];
        Assert.Equal("end", end.GetProperty("type").GetString());
        Assert.Equal(replies.Count - 1, end.GetProperty("count").GetInt32());
        var bytes = Encoding.UTF8.GetBytes(text.ToString());
        Assert.Equal(bytes.Length, end.GetProperty("bytes").GetInt64());
        using var sha = SHA256.Create();
        var hash = string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
        Assert.Equal(hash, end.GetProperty("sha256").GetString());
        return text.ToString();
    }

    [Fact(DisplayName = "AC-015.1 store.save {month, drafts, done}: 안쪽 값을 달 파일에 쓰고 result {saved: true}로 답한다")]
    public void SaveMonth()
    {
        using var rig = new CommandRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":" + StoreRig.Drafts + ",\"done\":" + StoreRig.Done + "}"));

        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names());
        var inside = rig.Files.Inside(StoreRig.MonthFile);
        StoreJson.Same(StoreRig.Drafts, inside.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Done, inside.GetProperty("done"));
    }

    [Fact(DisplayName = "AC-015.1 store.save {contact}: contact.dat에 쓴다")]
    public void SaveContact()
    {
        using var rig = new CommandRig();
        AssertSaved(rig.Save("{\"contact\":{\"c\":1}}"));

        Assert.Equal(new[] { WorkStore.ContactFile }, rig.Files.Names());
        StoreJson.Same("{\"c\":1}", rig.Files.Inside(WorkStore.ContactFile).GetProperty("contact"));
    }

    [Fact(DisplayName = "AC-015.1 입력이 끝난 뒤에 도착한 메모 저장이 입력 기록을 지우지 않고, 웹이 보낸 journal은 도우미 기록을 바꾸지 못한다")]
    public void LateSaveKeepsHelperJournal()
    {
        using var rig = new CommandRig();
        rig.Files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"done\"}"));

        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"v1\":\"고친 메모\"},\"done\":{}}"));
        StoreJson.Same("{\"v1\":\"done\"}", rig.Files.Inside(StoreRig.MonthFile).GetProperty("journal"));

        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"v1\":\"또 고침\"},\"journal\":{\"v1\":\"writing\",\"v2\":\"writing\"}}"));
        var inside = rig.Files.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"v1\":\"또 고침\"}", inside.GetProperty("drafts"));
        StoreJson.Same("{\"v1\":\"done\"}", inside.GetProperty("journal"));
    }

    [Theory(DisplayName = "AC-015.1 안쪽 모양이 틀리면 아무것도 쓰지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("{}")]                                         // 저장할 것이 없다
    [InlineData("{\"month\":\"2026-10\"}")]                    // 달만
    [InlineData("{\"drafts\":{}}")]                            // 달 없는 달 칸
    [InlineData("{\"done\":{},\"contact\":{}}")]
    [InlineData("{\"journal\":{}}")]
    [InlineData("{\"month\":\"2026-13\",\"drafts\":{}}")]      // 없는 달
    [InlineData("{\"month\":\"../x\",\"drafts\":{}}")]
    [InlineData("{\"month\":\"2026-10\",\"drafts\":[]}")]      // 객체가 아니다
    [InlineData("{\"month\":\"2026-10\",\"done\":\"x\"}")]
    [InlineData("{\"month\":\"2026-10\",\"journal\":1}")]
    [InlineData("{\"contact\":[]}")]
    [InlineData("{\"settings\":null}")]
    [InlineData("{\"month\":\"2026-10\",\"drafts\":{},\"unknown\":1}")]
    [InlineData("not json")]
    public void BadInnerShape(string inner)
    {
        using var rig = new CommandRig();
        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save(inner)));
        Assert.Empty(rig.Files.Names());
    }

    [Fact(DisplayName = "AC-015.1 글자로 풀 수 없는 값(이모지 중간에서 잘린 메모)이면 도우미가 멈추지 않고 E-HELPER-BAD-MESSAGE, 전 내용은 그대로")]
    public void LoneSurrogateIsBadMessage()
    {
        using var rig = new CommandRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"a\":1}}"));
        var before = rig.Files.Bytes(StoreRig.MonthFile);

        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"memo\":\"잘림\\ud83d\"}}")));
        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"\\ud83d\":1}}")));
        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save("{\"contact\":{\"memo\":\"\\ud83d\"}}")));
        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save("{\"settings\":{\"memo\":\"\\ude00\"}}")));

        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names());
        Assert.Equal(before, rig.Files.Bytes(StoreRig.MonthFile));
    }

    [Fact(DisplayName = "AC-015.1 등록이 없으면 저장·읽기 모두 E-BIT-NOT-REGISTERED이고 파일을 만들지 않는다")]
    public void NotRegistered()
    {
        using var rig = new CommandRig(registered: false);

        Assert.Equal(BitErrors.NotRegistered, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"drafts\":{}}")));
        Assert.Equal(BitErrors.NotRegistered, ErrorCode(rig.Load("{\"months\":[\"2026-10\"]}")));
        Assert.Empty(rig.Files.Names());
    }

    [Fact(DisplayName = "AC-015.1 폴더에 쓰지 못하면 E-STORE-FAILED로 답한다(도우미는 멈추지 않는다)")]
    public void WriteFailureIsStoreFailed()
    {
        using var rig = new CommandRig();
        rig.Files.Plant("not-a-folder", new byte[] { 1 });
        rig.UseDataFolder(rig.Files.PathOf("not-a-folder"));

        Assert.Equal(BitErrors.StoreFailed, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"drafts\":{}}")));
    }

    [Fact(DisplayName = "AC-015.2 store.load는 작아도 chunk … end로 답하고 그 달들의 내용이 들어 있다, 파일이 없으면 빈 내용")]
    public void LoadChunks()
    {
        using var rig = new CommandRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":" + StoreRig.Drafts + "}"));

        var root = Json.Parse(Assemble(rig.Load("{\"months\":[\"2026-09\",\"2026-10\"]}")));

        StoreJson.Same(StoreRig.Drafts, root.GetProperty("months").GetProperty("2026-10").GetProperty("drafts"));
        StoreJson.Same(StoreRig.Empty, root.GetProperty("months").GetProperty("2026-09").GetProperty("drafts"));
    }

    [Fact(DisplayName = "AC-015.2 저장 내용이 크면 메시지 하나가 1,000,000바이트를 넘지 않게 나눠 보낸다")]
    public void LoadSplitsLargeContent()
    {
        using var rig = new CommandRig();
        var memo = string.Concat(Enumerable.Repeat("가상환자01 메모 ", 200_000));
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"v\":" + JsonSerializer.Serialize(memo) + "}}"));

        var sink = new ListSink();
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
        StoreCommands.Register(dispatcher, () => rig.Files.Open());
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("store.load", "{\"months\":[\"2026-10\"]}")), sink);

        Assert.True(sink.Messages.Count > 2, "여러 조각이어야 한다");
        Assert.All(sink.Messages, message => Assert.True(message.Length + 4 <= 1_000_000));
        var root = Json.Parse(Assemble(sink.Replies));
        Assert.Equal(memo, root.GetProperty("months").GetProperty("2026-10").GetProperty("drafts").GetProperty("v").GetString());
    }

    [Fact(DisplayName = "AC-015.3 깨진 파일을 읽으면 조각 없이 E-STORE-BROKEN 하나만 답하고 파일은 이름만 바뀐다")]
    public void LoadBroken()
    {
        using var rig = new CommandRig();
        rig.Files.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));

        Assert.Equal(BitErrors.StoreBroken, ErrorCode(rig.Load("{\"months\":[\"2026-10\"]}")));
        Assert.Single(rig.Files.Names(), name => name.StartsWith(StoreRig.MonthFile + ".broken-", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-015.4 다른 병원 파일이면 store.load는 조각 없이 E-BIT-HOSPITAL-MISMATCH, store.save도 파일을 그대로 둔다")]
    public void OtherHospital()
    {
        using var rig = new CommandRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        var before = rig.Files.Bytes(StoreRig.MonthFile);

        Assert.Equal(BitErrors.HospitalMismatch, ErrorCode(rig.Load("{\"months\":[\"2026-10\"]}")));
        Assert.Equal(BitErrors.HospitalMismatch, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"drafts\":{}}")));

        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names());
        Assert.Equal(before, rig.Files.Bytes(StoreRig.MonthFile));
    }

    [Fact(DisplayName = "AC-015.5 store.save를 처리하면 13개월보다 오래된 work-*.dat를 지운다(연락·설정 저장 때도)")]
    public void SavePrunes()
    {
        using var rig = new CommandRig();
        rig.Files.Plant("work-2020-01.dat", new byte[] { 1 });
        rig.Files.Plant("work-2025-09.dat", new byte[] { 1 });
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{}}"));
        Assert.Equal(new[] { "work-2025-09.dat", StoreRig.MonthFile }, rig.Files.Names());

        rig.Files.Plant("work-2020-02.dat", new byte[] { 1 });
        AssertSaved(rig.Save("{\"settings\":{\"s\":1}}"));
        Assert.DoesNotContain("work-2020-02.dat", rig.Files.Names());
    }

    [Fact(DisplayName = "AC-015.6 AC-001.6 기록에는 명령 이름과 오류 번호만 남고 저장 내용이 없다, 디스크에도 평문이 없다")]
    public void LogHasNoContent()
    {
        using var rig = new CommandRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":" + StoreRig.Drafts + "}"));
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":" + StoreRig.Drafts + "}"));
        Assemble(rig.Load("{\"months\":[\"2026-10\"]}"));
        rig.Save("{\"month\":\"2026-13\",\"drafts\":" + StoreRig.Drafts + "}");

        Assert.Equal(new[] { "store.save|", "store.save|", "store.load|", "store.save|E-HELPER-BAD-MESSAGE" }, rig.Log);
        foreach (var name in rig.Files.Names())
        {
            Assert.DoesNotContain("가상환자01", Encoding.UTF8.GetString(rig.Files.Bytes(name)));
        }
    }

    [Fact(DisplayName = "AC-015.7 store.save {settings} → store.load {settings: true}로 돌려준다, 사본이 없으면 null")]
    public void SettingsThroughCommands()
    {
        using var rig = new CommandRig();
        var empty = Json.Parse(Assemble(rig.Load("{\"settings\":true}")));
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("settings").ValueKind);

        AssertSaved(rig.Save("{\"settings\":{\"rules\":[1,2]}}"));
        Assert.Equal(new[] { WorkStore.SettingsFile }, rig.Files.Names());
        var root = Json.Parse(Assemble(rig.Load("{\"settings\":true}")));
        Assert.Equal(new[] { "settings" }, Json.Keys(root));
        StoreJson.Same("{\"rules\":[1,2]}", root.GetProperty("settings"));
    }
}
