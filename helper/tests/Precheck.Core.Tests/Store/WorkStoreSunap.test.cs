using System;
using System.Collections.Generic;
using System.Linq;
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

/// <summary>
/// spec sunap-ilji AC-4902.5: 달 파일 work-YYYY-MM.dat의 새 칸 sunap(수납일지 고친 칸·마감 표시). 진짜 명령 표·Dispatcher에 가짜 암호화를 붙여 메시지로 부른다.
/// 차트번호·이름은 모두 지어낸 것이다(가상환자NN, 9로 시작하는 6자리).
/// </summary>
public class WorkStoreSunapTests
{
    private const string Sunap = "{\"2026-10-30\":{\"edits\":{\"900001\":{\"cash\":15000,\"note\":\"가상환자01 비고\"}},\"closedAt\":\"2026-10-30T09:30:00.000Z\",\"late\":false,\"fixed\":{\"900001\":\"inj\"}}}";
    private const string OtherSunap = "{\"2026-10-29\":{\"edits\":{\"900002\":{\"block\":true}}}}";

    private sealed class SunapStoreRig : IDisposable
    {
        private readonly TempFolder registrationFolder = new TempFolder();
        private readonly Dispatcher dispatcher;

        public SunapStoreRig()
        {
            Files = new StoreRig();
            var registrations = new RegistrationStore(registrationFolder.Path, Files.Protector);
            registrations.Save(Synthetic.Registration());
            dispatcher = new Dispatcher(CommandTable.LoadEmbedded());
            var lockName = @"Local\PrecheckTest." + Guid.NewGuid().ToString("N");
            StoreCommands.Register(
                dispatcher,
                () => WorkStore.ForRegistered(new StoreFolder(Files.Folder), Files.Protector, registrations, () => StoreRig.Today),
                () => Precheck.Core.Input.WorkLock.TryAcquire(Precheck.Core.Input.WorkLock.StoreSaveWait, lockName));
        }

        public StoreRig Files { get; }

        public List<JsonElement> Save(string innerJson) => Send("store.save", "{\"payload\":" + JsonSerializer.Serialize(innerJson) + "}");

        public JsonElement Load(string argsJson)
        {
            var replies = Send("store.load", argsJson);
            Assert.True(replies.Count >= 2, string.Join(",", replies.Select(r => r.GetRawText())));
            var text = new StringBuilder();
            for (var i = 0; i < replies.Count - 1; i++)
            {
                Assert.Equal("chunk", replies[i].GetProperty("type").GetString());
                text.Append(replies[i].GetProperty("data").GetString());
            }
            Assert.Equal("end", replies[replies.Count - 1].GetProperty("type").GetString());
            return Json.Parse(text.ToString());
        }

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

    private static void AssertSaved(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("result", reply.GetProperty("type").GetString());
        Assert.Equal("{\"saved\":true}", reply.GetProperty("data").GetRawText());
    }

    private static string ErrorCode(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("error", reply.GetProperty("type").GetString());
        return reply.GetProperty("code").GetString()!;
    }

    [Fact(DisplayName = "AC-4902.5 store.save {month, sunap}: 그 달 파일의 sunap만 바뀌고 drafts·done·journal은 그대로다")]
    public void SaveSunapKeepsOtherFields()
    {
        using var rig = new SunapStoreRig();
        rig.Files.Open().SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), StoreJson.El(StoreRig.Done), StoreJson.El(StoreRig.Journal));

        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"sunap\":" + Sunap + "}"));
        var inside = rig.Files.Inside(StoreRig.MonthFile);
        StoreJson.Same(Sunap, inside.GetProperty("sunap"));
        StoreJson.Same(StoreRig.Drafts, inside.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Done, inside.GetProperty("done"));
        StoreJson.Same(StoreRig.Journal, inside.GetProperty("journal"));

        // 다시 보내면 칸째 바뀐다(Worker는 그 달 sunap 전체를 보낸다)
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"sunap\":" + OtherSunap + "}"));
        inside = rig.Files.Inside(StoreRig.MonthFile);
        StoreJson.Same(OtherSunap, inside.GetProperty("sunap"));
        StoreJson.Same(StoreRig.Drafts, inside.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Journal, inside.GetProperty("journal"));
        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Files.Names().Where(name => !name.EndsWith(".bak", StringComparison.Ordinal)));
    }

    [Fact(DisplayName = "AC-4902.5 청구 메모 저장(drafts·done)과 도우미 입력 기록(journal) 저장은 sunap을 지우지 않는다")]
    public void OtherSavesKeepSunap()
    {
        using var rig = new SunapStoreRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"sunap\":" + Sunap + "}"));

        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":" + StoreRig.Drafts + ",\"done\":{}}"));
        StoreJson.Same(Sunap, rig.Files.Inside(StoreRig.MonthFile).GetProperty("sunap"));

        rig.Files.Open().SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"done\"}"), StoreJson.El("{\"v1\":\"2026-10-27\"}"));
        rig.Files.Open().SaveMonth(StoreRig.Month, null, null, null, null, StoreJson.El("{\"v1\":[\"전에 남긴 글\"]}"));
        var inside = rig.Files.Inside(StoreRig.MonthFile);
        StoreJson.Same(Sunap, inside.GetProperty("sunap"));
        StoreJson.Same(StoreRig.Drafts, inside.GetProperty("drafts"));
        StoreJson.Same("{\"v1\":\"done\"}", inside.GetProperty("journal"));

        // 연락·설정 저장은 달 파일을 건드리지 않는다
        var before = rig.Files.Bytes(StoreRig.MonthFile);
        AssertSaved(rig.Save("{\"contact\":{\"c\":1},\"settings\":{\"s\":1}}"));
        Assert.Equal(before, rig.Files.Bytes(StoreRig.MonthFile));
    }

    [Fact(DisplayName = "AC-4902.5 sunap 칸이 없던 달 파일에 drafts만 저장해도 sunap 칸을 만들지 않는다(지금 파일 모양 그대로)")]
    public void NoSunapFieldUntilSent()
    {
        using var rig = new SunapStoreRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"drafts\":{\"a\":1}}"));
        Assert.False(rig.Files.Inside(StoreRig.MonthFile).TryGetProperty("sunap", out _));
    }

    [Fact(DisplayName = "AC-4902.5 store.load {months}: 달마다 drafts·done·journal·sunap이 오고 sunap이 없으면 {}다")]
    public void LoadCarriesSunap()
    {
        using var rig = new SunapStoreRig();
        AssertSaved(rig.Save("{\"month\":\"2026-10\",\"sunap\":" + Sunap + "}"));
        rig.Files.Open().SaveMonth("2026-09", StoreJson.El("{\"sep\":1}"), null, null);

        var months = rig.Load("{\"months\":[\"2026-08\",\"2026-09\",\"2026-10\"]}").GetProperty("months");
        foreach (var month in new[] { "2026-08", "2026-09", "2026-10" })
        {
            Assert.Equal(new[] { "drafts", "done", "journal", "sunap" }, Json.Keys(months.GetProperty(month)));
        }
        StoreJson.Same(Sunap, months.GetProperty("2026-10").GetProperty("sunap"));
        StoreJson.Same(StoreRig.Empty, months.GetProperty("2026-09").GetProperty("sunap"));
        StoreJson.Same("{\"sep\":1}", months.GetProperty("2026-09").GetProperty("drafts"));
        StoreJson.Same(StoreRig.Empty, months.GetProperty("2026-08").GetProperty("sunap"));

        // 연락·설정만 물으면 달 칸이 없다(지금 그대로)
        var contactOnly = rig.Load("{\"contact\":true}");
        Assert.Equal(new[] { "contact" }, Json.Keys(contactOnly));
    }

    [Theory(DisplayName = "AC-4902.5 month 없이 sunap만 오거나 sunap이 객체가 아니면 아무것도 쓰지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"sunap\":{}}")]
    [InlineData("{\"sunap\":{},\"contact\":{}}")]
    [InlineData("{\"sunap\":{},\"settings\":{}}")]
    [InlineData("{\"month\":\"2026-10\",\"sunap\":[]}")]
    [InlineData("{\"month\":\"2026-10\",\"sunap\":\"x\"}")]
    [InlineData("{\"month\":\"2026-10\",\"sunap\":null}")]
    [InlineData("{\"month\":\"2026-13\",\"sunap\":{}}")]
    public void SunapWithoutMonthIsBadMessage(string inner)
    {
        using var rig = new SunapStoreRig();
        Assert.Equal(ErrorCodes.BadMessage, ErrorCode(rig.Save(inner)));
        Assert.Empty(rig.Files.Names());
    }

    [Fact(DisplayName = "AC-4902.5 달 파일의 sunap이 객체가 아니면 깨진 파일이다(.bak이 없으면 E-STORE-BROKEN, 파일은 이름만 바뀐다)")]
    public void StoredSunapMustBeObject()
    {
        using var rig = new SunapStoreRig();
        rig.Files.Plant(StoreRig.MonthFile, rig.Files.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{},\"done\":{},\"journal\":{},\"sunap\":[]}"));

        Assert.Equal(BitErrors.StoreBroken, ErrorCode(rig.Send("store.load", "{\"months\":[\"2026-10\"]}")));
        Assert.Single(rig.Files.Names(), name => name.StartsWith(StoreRig.MonthFile + ".broken-", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-4902.5 다른 병원 달 파일이면 store.save {month, sunap}도 E-BIT-HOSPITAL-MISMATCH이고 파일은 그대로다")]
    public void OtherHospitalSunap()
    {
        using var rig = new SunapStoreRig();
        rig.Files.Open(StoreRig.OtherProfile).SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        var before = rig.Files.Bytes(StoreRig.MonthFile);

        Assert.Equal(BitErrors.HospitalMismatch, ErrorCode(rig.Save("{\"month\":\"2026-10\",\"sunap\":" + Sunap + "}")));
        Assert.Equal(before, rig.Files.Bytes(StoreRig.MonthFile));
    }
}
