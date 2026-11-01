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

/// <summary>저장 시험이 같이 쓰는 것: 임시 폴더, 가짜 암호화, 파일 심기·풀기. 자료는 모두 지어낸 것이다.</summary>
internal sealed class StoreRig : IDisposable
{
    public const string Month = "2026-10";
    public const string MonthFile = "work-2026-10.dat";
    public const string OtherProfile = "fedcba9876543210fedcba9876543210";

    // 가짜 환자 글자(design.md 10절 규칙: 가상환자NN, 9로 시작하는 6자리, 010-0000-NNNN)
    public const string Drafts = "{\"900001|2026-10-27\":{\"memo\":\"가상환자01 메모\\n둘째 줄 😀\",\"phone\":\"010-0000-0001\"}}";
    public const string Done = "{\"900001|2026-10-27\":true}";
    public const string Journal = "{\"900001|2026-10-27\":\"writing\"}";
    public const string Empty = "{}";

    public static readonly DateTime Today = new DateTime(2026, 10, 30);

    private readonly TempFolder temp = new TempFolder();

    public FakeProtector Protector { get; } = new FakeProtector();

    public string Folder => temp.Path;

    public WorkStore Open(string? profileId = null, DateTime? today = null, IProtector? protector = null) =>
        new WorkStore(new StoreFolder(Folder), protector ?? Protector, Synthetic.Registration(profileId: profileId), () => today ?? Today);

    public string PathOf(string name) => Path.Combine(Folder, name);

    public string[] Names() =>
        Directory.Exists(Folder)
            ? Directory.GetFiles(Folder).Select(file => Path.GetFileName(file)!).OrderBy(name => name, StringComparer.Ordinal).ToArray()
            : new string[0];

    public byte[] Bytes(string name) => File.ReadAllBytes(PathOf(name));

    public void Plant(string name, byte[] data)
    {
        Directory.CreateDirectory(Folder);
        File.WriteAllBytes(PathOf(name), data);
    }

    public byte[] Encrypted(string json) => Encrypted(Encoding.UTF8.GetBytes(json));

    public byte[] Encrypted(byte[] clear) =>
        Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(Protector.Protect(clear)).ToArray();

    /// <summary>이 병원의 달 파일 하나(바른 모양).</summary>
    public byte[] GoodMonth(string drafts = Drafts, string? profileId = null) =>
        Encrypted("{\"profileId\":\"" + (profileId ?? Synthetic.ProfileId) + "\",\"drafts\":" + drafts + ",\"done\":{},\"journal\":{}}");

    /// <summary>파일을 풀어 안쪽 JSON을 돌려준다.</summary>
    public JsonElement Inside(string name)
    {
        var raw = Bytes(name);
        var header = "PRECHECK-STORE-1\n".Length;
        Assert.Equal(Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n"), raw.Take(header).ToArray());
        return Json.Parse(Protector.Unprotect(raw.Skip(header).ToArray()));
    }

    public void Dispose() => temp.Dispose();
}

internal static class StoreJson
{
    public static JsonElement El(string json) => Json.Parse(json);

    /// <summary>
    /// 같은 내용인지: 칸 차례·값까지 같아야 한다. 둘 다 같은 방법으로 다시 써서 비교한다. 글자의 이스케이프 모양만 다른 것은 같은 값이다
    /// (이모지는 저장 글자에서 \uD83D\uDE00로 쓰이고 JSON.parse하면 같은 글자다).
    /// </summary>
    public static void Same(string expected, JsonElement actual) =>
        Assert.Equal(JsonSerializer.Serialize(El(expected)), JsonSerializer.Serialize(actual));

    public static string Code(Action action) => Assert.ThrowsAny<HelperException>(action).Code;

    public static JsonElement Month(string loaded, string month) => Json.Parse(loaded).GetProperty("months").GetProperty(month);
}

/// <summary>REQ-015 작업 저장 파일 규칙(design.md 9-3). 가짜 암호화 IProtector로 Core만 시험한다.</summary>
public class WorkStoreTests
{
    private static readonly string[] OneMonth = { StoreRig.Month };

    // ---- AC-015.1 파일 틀 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-015.1 달 저장은 work-YYYY-MM.dat에 머리 PRECHECK-STORE-1 + 암호화로 쓰고, 안쪽에 등록 프로필 ID를 넣는다")]
    public void MonthFileShape()
    {
        using var rig = new StoreRig();
        rig.Open().SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), StoreJson.El(StoreRig.Done), null);

        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Names());
        var inside = rig.Inside(StoreRig.MonthFile);
        Assert.Equal(Synthetic.ProfileId, inside.GetProperty("profileId").GetString());
        StoreJson.Same(StoreRig.Drafts, inside.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Done, inside.GetProperty("done"));
        StoreJson.Same(StoreRig.Empty, inside.GetProperty("journal"));
    }

    [Fact(DisplayName = "AC-015.1 연락은 contact.dat에 같은 틀로 쓴다")]
    public void ContactFileShape()
    {
        using var rig = new StoreRig();
        rig.Open().SaveContact(StoreJson.El("{\"900001\":{\"at\":\"2026-10-27\"}}"));

        Assert.Equal(new[] { WorkStore.ContactFile }, rig.Names());
        var inside = rig.Inside(WorkStore.ContactFile);
        Assert.Equal(Synthetic.ProfileId, inside.GetProperty("profileId").GetString());
        StoreJson.Same("{\"900001\":{\"at\":\"2026-10-27\"}}", inside.GetProperty("contact"));
    }

    [Fact(DisplayName = "AC-015.1 쓰기는 임시 파일 뒤 바꿔치기: 처음에는 .bak이 없고, 다음부터 전 내용이 .bak 하나로 남으며 임시 파일은 남지 않는다")]
    public void BackupIsOnePreviousVersion()
    {
        using var rig = new StoreRig();
        var store = rig.Open();

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        Assert.Equal(new[] { StoreRig.MonthFile }, rig.Names());

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":2}"), null, null);
        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":3}"), null, null);
        Assert.Equal(new[] { StoreRig.MonthFile, StoreRig.MonthFile + ".bak" }, rig.Names());
        StoreJson.Same("{\"a\":3}", rig.Inside(StoreRig.MonthFile).GetProperty("drafts"));
        StoreJson.Same("{\"a\":2}", rig.Inside(StoreRig.MonthFile + ".bak").GetProperty("drafts"));
    }

    [Fact(DisplayName = "AC-015.1 파일 전체를 덮어쓰지 않는다: 보낸 칸만 바꾸고 안 보낸 칸은 그대로 둔다")]
    public void SavesOnlySentFields()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), StoreJson.El(StoreRig.Done), StoreJson.El(StoreRig.Journal));

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        var inside = rig.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"a\":1}", inside.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Done, inside.GetProperty("done"));
        StoreJson.Same(StoreRig.Journal, inside.GetProperty("journal"));

        store.SaveMonth(StoreRig.Month, null, StoreJson.El("{\"b\":true}"), null);
        inside = rig.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"a\":1}", inside.GetProperty("drafts"));
        StoreJson.Same("{\"b\":true}", inside.GetProperty("done"));
        StoreJson.Same(StoreRig.Journal, inside.GetProperty("journal"));

        // 보낸 칸이 빈 객체면 그 칸은 비운다(보낸 값이다)
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Empty), null, null);
        StoreJson.Same(StoreRig.Empty, rig.Inside(StoreRig.MonthFile).GetProperty("drafts"));
    }

    [Fact(DisplayName = "AC-015.1 입력 기록 journal은 진료(visitKey)마다 합친다: 보낸 진료만 바꾸고 다른 진료 기록은 지우지 않는다")]
    public void JournalMergesByVisit()
    {
        using var rig = new StoreRig();
        var store = rig.Open();

        store.SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"writing\",\"v2\":\"writing\"}"));
        store.SaveMonth(StoreRig.Month, null, null, StoreJson.El("{\"v1\":\"done\"}"));

        var journal = rig.Inside(StoreRig.MonthFile).GetProperty("journal");
        Assert.Equal("done", journal.GetProperty("v1").GetString());
        Assert.Equal("writing", journal.GetProperty("v2").GetString());
    }

    [Theory(DisplayName = "AC-015.1 달 이름이 YYYY-MM이 아니면 경로를 만들지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("../2026-10")]
    [InlineData("2026-13")]
    [InlineData("2026-00")]
    [InlineData("2026-1")]
    [InlineData("2026-10\n")]
    [InlineData("")]
    public void BadMonthName(string month)
    {
        using var rig = new StoreRig();
        Assert.Equal(ErrorCodes.BadMessage, StoreJson.Code(() => rig.Open().SaveMonth(month, StoreJson.El("{}"), null, null)));
        Assert.Equal(ErrorCodes.BadMessage, StoreJson.Code(() => rig.Open().Load(new[] { month }, false, false)));
        Assert.Empty(rig.Names());
    }

    // ---- AC-015.2 읽기 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-015.2 파일이 없으면 빈 내용이고, 폴더나 파일을 만들지 않는다")]
    public void MissingIsEmpty()
    {
        using var rig = new StoreRig();
        var loaded = rig.Open().Load(new[] { "2026-09", "2026-10" }, false, false);

        var root = Json.Parse(loaded);
        Assert.Equal(new[] { "months" }, Json.Keys(root));
        foreach (var month in new[] { "2026-09", "2026-10" })
        {
            var content = root.GetProperty("months").GetProperty(month);
            Assert.Equal(new[] { "drafts", "done", "journal" }, Json.Keys(content));
            foreach (var field in Json.Keys(content)) StoreJson.Same(StoreRig.Empty, content.GetProperty(field));
        }
        Assert.False(Directory.Exists(rig.Folder));
    }

    [Fact(DisplayName = "AC-015.2 달마다 그 달의 저장 내용을 돌려주고 같은 달을 두 번 물어도 한 번만 싣는다, 묻지 않은 것은 싣지 않는다")]
    public void LoadsAskedMonths()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth("2026-09", StoreJson.El("{\"sep\":1}"), null, null);
        store.SaveMonth("2026-10", StoreJson.El("{\"oct\":1}"), StoreJson.El("{\"d\":true}"), StoreJson.El("{\"v\":\"done\"}"));
        store.SaveContact(StoreJson.El("{\"c\":1}"));
        store.SaveSettings(StoreJson.El("{\"s\":1}"));

        var loaded = store.Load(new[] { "2026-10", "2026-10" }, false, false);
        var root = Json.Parse(loaded);
        Assert.Equal(new[] { "months" }, Json.Keys(root));
        Assert.Equal(new[] { "2026-10" }, Json.Keys(root.GetProperty("months")));
        var october = root.GetProperty("months").GetProperty("2026-10");
        StoreJson.Same("{\"oct\":1}", october.GetProperty("drafts"));
        StoreJson.Same("{\"d\":true}", october.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", october.GetProperty("journal"));

        // 저장 파일 안의 프로필 ID는 답에 싣지 않는다
        Assert.DoesNotContain(Synthetic.ProfileId, loaded);
    }

    [Fact(DisplayName = "AC-015.2 연락은 contact: true로만 돌려주고 파일이 없으면 빈 객체")]
    public void LoadsContact()
    {
        using var rig = new StoreRig();
        var store = rig.Open();

        StoreJson.Same(StoreRig.Empty, Json.Parse(store.Load(new string[0], false, true)).GetProperty("contact"));

        store.SaveContact(StoreJson.El("{\"c\":1}"));
        var root = Json.Parse(store.Load(new string[0], false, true));
        Assert.Equal(new[] { "contact" }, Json.Keys(root));
        StoreJson.Same("{\"c\":1}", root.GetProperty("contact"));
    }

    // ---- AC-015.3 깨진 파일 -------------------------------------------------------------------

    /// <summary>깨진 파일 모양들: 머리 다름·풀기 실패·JSON 깨짐(모양 틀림 포함).</summary>
    private static IEnumerable<byte[]> BrokenShapes(StoreRig rig)
    {
        var good = rig.GoodMonth();
        var header = Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n");
        var tampered = (byte[])good.Clone();
        tampered[header.Length] ^= 0xFF;
        var profile = "\"profileId\":\"" + Synthetic.ProfileId + "\"";
        var badUtf8 = Encoding.UTF8.GetBytes("{" + profile + ",\"drafts\":{\"a\":\"X\"}}");
        badUtf8[Array.IndexOf(badUtf8, (byte)'X')] = 0xFF;

        yield return new byte[0];
        yield return Encoding.ASCII.GetBytes("garbage");
        yield return Encoding.ASCII.GetBytes("PRECHECK-STORE-2\n").Concat(good.Skip(header.Length)).ToArray();
        yield return header;
        yield return tampered;
        yield return rig.Encrypted("not json");
        yield return rig.Encrypted("{\"profileId\":");
        yield return rig.Encrypted("[1]");
        yield return rig.Encrypted("{\"drafts\":{}}");
        yield return rig.Encrypted("{\"profileId\":1}");
        yield return rig.Encrypted("{" + profile + ",\"drafts\":\"x\"}");
        yield return rig.Encrypted("{" + profile + ",\"drafts\":{\"a\":\"\\ud83d\"}}");
        yield return rig.Encrypted(badUtf8);
    }

    private static string BrokenCopy(StoreRig rig, string name)
    {
        var copies = rig.Names().Where(file => file.StartsWith(name + ".broken-", StringComparison.Ordinal)).ToArray();
        Assert.Single(copies);
        return copies[0];
    }

    [Fact(DisplayName = "AC-015.3 깨진 파일 + 맞는 .bak이면 .bak 내용을 쓰고 그것으로 되살리며, 깨진 파일은 지우지 않고 이름을 바꿔 둔다")]
    public void BrokenWithGoodBackup()
    {
        var count = 0;
        using (var probe = new StoreRig()) count = BrokenShapes(probe).Count();
        for (var i = 0; i < count; i++)
        {
            using var rig = new StoreRig();
            var broken = BrokenShapes(rig).ElementAt(i);
            rig.Plant(StoreRig.MonthFile, broken);
            rig.Plant(StoreRig.MonthFile + ".bak", rig.GoodMonth());

            var loaded = rig.Open().Load(new[] { StoreRig.Month }, false, false);

            StoreJson.Same(StoreRig.Drafts, StoreJson.Month(loaded, StoreRig.Month).GetProperty("drafts"));
            Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));
            StoreJson.Same(StoreRig.Drafts, rig.Inside(StoreRig.MonthFile).GetProperty("drafts"));
            StoreJson.Same(StoreRig.Drafts, rig.Inside(StoreRig.MonthFile + ".bak").GetProperty("drafts"));
        }
    }

    [Fact(DisplayName = "AC-015.3 깨진 파일 + .bak 없음이면 E-STORE-BROKEN, 깨진 파일은 이름만 바뀌어 남고 다음에는 빈 내용으로 새로 시작한다")]
    public void BrokenWithoutBackup()
    {
        var count = 0;
        using (var probe = new StoreRig()) count = BrokenShapes(probe).Count();
        for (var i = 0; i < count; i++)
        {
            using var rig = new StoreRig();
            var broken = BrokenShapes(rig).ElementAt(i);
            rig.Plant(StoreRig.MonthFile, broken);
            var store = rig.Open();

            Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.Load(OneMonth, false, false)));
            Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));
            Assert.False(File.Exists(rig.PathOf(StoreRig.MonthFile)));

            StoreJson.Same(StoreRig.Empty, StoreJson.Month(store.Load(OneMonth, false, false), StoreRig.Month).GetProperty("drafts"));
        }
    }

    [Fact(DisplayName = "AC-015.3 .bak도 깨졌으면 E-STORE-BROKEN이고 둘 다 지우지 않고 이름을 바꿔 둔다")]
    public void BrokenWithBrokenBackup()
    {
        using var rig = new StoreRig();
        var main = Encoding.ASCII.GetBytes("garbage-main");
        var backup = Encoding.ASCII.GetBytes("garbage-backup");
        rig.Plant(StoreRig.MonthFile, main);
        rig.Plant(StoreRig.MonthFile + ".bak", backup);

        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => rig.Open().Load(OneMonth, false, false)));

        Assert.Equal(main, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));
        Assert.Equal(backup, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile + ".bak")));
        Assert.Equal(2, rig.Names().Length);
    }

    [Fact(DisplayName = "AC-015.3 같은 이름의 깨진 파일이 다시 생겨도 먼저 바꿔 둔 파일을 덮지 않는다")]
    public void BrokenCopiesAreNotOverwritten()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        rig.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("first"));
        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.Load(OneMonth, false, false)));
        rig.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("second"));
        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.Load(OneMonth, false, false)));

        var kept = rig.Names().Select(name => Encoding.ASCII.GetString(rig.Bytes(name))).OrderBy(text => text, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "first", "second" }, kept);
    }

    [Fact(DisplayName = "AC-015.3 달 하나가 깨져 .bak도 없으면 묻은 달 전체가 E-STORE-BROKEN이다(반쪽 내용을 돌려주지 않는다)")]
    public void BrokenMonthStopsWholeLoad()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth("2026-09", StoreJson.El("{\"sep\":1}"), null, null);
        rig.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));

        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.Load(new[] { "2026-09", StoreRig.Month }, false, false)));
        StoreJson.Same("{\"sep\":1}", rig.Inside("work-2026-09.dat").GetProperty("drafts"));
    }

    [Fact(DisplayName = "AC-015.3 깨진 파일에 저장하면 맞는 .bak 내용에 보낸 칸을 합치고 깨진 파일은 이름만 바꿔 남긴다")]
    public void SaveOverBrokenUsesBackup()
    {
        using var rig = new StoreRig();
        var broken = Encoding.ASCII.GetBytes("garbage");
        rig.Plant(StoreRig.MonthFile, broken);
        rig.Plant(StoreRig.MonthFile + ".bak", rig.Encrypted(
            "{\"profileId\":\"" + Synthetic.ProfileId + "\",\"drafts\":{\"old\":1},\"done\":{\"kept\":true},\"journal\":{\"v\":\"done\"}}"));

        rig.Open().SaveMonth(StoreRig.Month, StoreJson.El("{\"new\":1}"), null, null);

        var inside = rig.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"new\":1}", inside.GetProperty("drafts"));
        StoreJson.Same("{\"kept\":true}", inside.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", inside.GetProperty("journal"));
        Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));
    }

    [Fact(DisplayName = "AC-015.3 깨진 파일에 .bak 없이 저장하면 E-STORE-BROKEN으로 알리고, 다시 저장하면 새로 시작한다")]
    public void SaveOverBrokenWithoutBackup()
    {
        using var rig = new StoreRig();
        var broken = Encoding.ASCII.GetBytes("garbage");
        rig.Plant(StoreRig.MonthFile, broken);
        var store = rig.Open();

        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null)));
        Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        StoreJson.Same("{\"a\":1}", rig.Inside(StoreRig.MonthFile).GetProperty("drafts"));
        Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile)));
    }

    [Fact(DisplayName = "AC-015.3 저장할 때 깨진 .bak을 덮지 않고 이름을 바꿔 둔다")]
    public void SaveKeepsBrokenBackup()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        var backup = Encoding.ASCII.GetBytes("garbage-backup");
        rig.Plant(StoreRig.MonthFile + ".bak", backup);

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":2}"), null, null);

        Assert.Equal(backup, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile + ".bak")));
        StoreJson.Same("{\"a\":1}", rig.Inside(StoreRig.MonthFile + ".bak").GetProperty("drafts"));
        StoreJson.Same("{\"a\":2}", rig.Inside(StoreRig.MonthFile).GetProperty("drafts"));
    }

    [Theory(DisplayName = "AC-015.3 AC-015.7 contact.dat·settings.dat도 같은 규칙이다")]
    [InlineData("contact.dat", false, true)]
    [InlineData("settings.dat", true, false)]
    public void OtherFilesFollowBrokenRules(string name, bool settings, bool contact)
    {
        using var rig = new StoreRig();
        var key = contact ? "contact" : "settings";
        var broken = Encoding.ASCII.GetBytes("garbage");
        rig.Plant(name, broken);
        rig.Plant(name + ".bak", rig.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"" + key + "\":{\"k\":1}}"));
        var store = rig.Open();

        StoreJson.Same("{\"k\":1}", Json.Parse(store.Load(new string[0], settings, contact)).GetProperty(key));
        Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, name)));

        using var other = new StoreRig();
        other.Plant(name, broken);
        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => other.Open().Load(new string[0], settings, contact)));
        Assert.Equal(broken, other.Bytes(BrokenCopy(other, name)));
    }

    /// <summary>바꿔치기 중 멈춰 본 파일만 없어진 자리: .bak에 전 내용이 있다(윈도우 ReplaceFile이 전 파일을 옮긴 뒤 멈춘 경우).</summary>
    private const string CrashedMonth = "{\"drafts\":{\"old\":1},\"done\":{\"kept\":true},\"journal\":{\"v\":\"done\"}}";

    private static byte[] WithProfile(StoreRig rig, string fields, string? profileId = null) =>
        rig.Encrypted("{\"profileId\":\"" + (profileId ?? Synthetic.ProfileId) + "\"," + fields.Substring(1));

    [Fact(DisplayName = "AC-015.3 본 파일이 없고 맞는 .bak만 있으면 빈 내용이 아니라 .bak 내용을 돌려주고 본 파일을 되살린다, .bak은 그대로")]
    public void MissingMainWithGoodBackupLoads()
    {
        using var rig = new StoreRig();
        var backup = WithProfile(rig, CrashedMonth);
        rig.Plant(StoreRig.MonthFile + ".bak", backup);

        var month = StoreJson.Month(rig.Open().Load(OneMonth, false, false), StoreRig.Month);

        StoreJson.Same("{\"old\":1}", month.GetProperty("drafts"));
        StoreJson.Same("{\"kept\":true}", month.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", month.GetProperty("journal"));
        Assert.Equal(new[] { StoreRig.MonthFile, StoreRig.MonthFile + ".bak" }, rig.Names());
        Assert.Equal(backup, rig.Bytes(StoreRig.MonthFile));
        Assert.Equal(backup, rig.Bytes(StoreRig.MonthFile + ".bak"));
    }

    [Fact(DisplayName = "AC-015.3 본 파일이 없고 맞는 .bak만 있을 때 저장하면 .bak 내용에 합치고, 첫 저장·둘째 저장 어디서도 done·journal을 잃지 않는다")]
    public void MissingMainWithGoodBackupSaves()
    {
        using var rig = new StoreRig();
        rig.Plant(StoreRig.MonthFile + ".bak", WithProfile(rig, CrashedMonth));
        var store = rig.Open();

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"new\":1}"), null, null);
        var first = rig.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"new\":1}", first.GetProperty("drafts"));
        StoreJson.Same("{\"kept\":true}", first.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", first.GetProperty("journal"));
        StoreJson.Same("{\"old\":1}", rig.Inside(StoreRig.MonthFile + ".bak").GetProperty("drafts"));

        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"new\":2}"), null, null);
        var second = rig.Inside(StoreRig.MonthFile);
        StoreJson.Same("{\"new\":2}", second.GetProperty("drafts"));
        StoreJson.Same("{\"kept\":true}", second.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", second.GetProperty("journal"));
        var backup = rig.Inside(StoreRig.MonthFile + ".bak");
        StoreJson.Same("{\"kept\":true}", backup.GetProperty("done"));
        StoreJson.Same("{\"v\":\"done\"}", backup.GetProperty("journal"));
    }

    [Fact(DisplayName = "AC-015.3 본 파일이 없고 .bak이 깨졌으면 빈 내용이 아니라 E-STORE-BROKEN, .bak은 지우지 않고 이름을 바꿔 두며 다음에는 새로 시작한다")]
    public void MissingMainWithBrokenBackup()
    {
        using var rig = new StoreRig();
        var broken = Encoding.ASCII.GetBytes("garbage-backup");
        rig.Plant(StoreRig.MonthFile + ".bak", broken);
        var store = rig.Open();

        Assert.Equal(BitErrors.StoreBroken, StoreJson.Code(() => store.Load(OneMonth, false, false)));
        Assert.Equal(broken, rig.Bytes(BrokenCopy(rig, StoreRig.MonthFile + ".bak")));
        Assert.Single(rig.Names());

        StoreJson.Same(StoreRig.Empty, StoreJson.Month(store.Load(OneMonth, false, false), StoreRig.Month).GetProperty("drafts"));
    }

    [Theory(DisplayName = "AC-015.3 AC-015.7 contact.dat·settings.dat도 본 파일 없이 맞는 .bak만 있으면 그것을 돌려주고 되살린다")]
    [InlineData("contact.dat", false, true)]
    [InlineData("settings.dat", true, false)]
    public void MissingMainOtherFiles(string name, bool settings, bool contact)
    {
        using var rig = new StoreRig();
        var key = contact ? "contact" : "settings";
        var backup = rig.Encrypted("{\"profileId\":\"" + Synthetic.ProfileId + "\",\"" + key + "\":{\"k\":1}}");
        rig.Plant(name + ".bak", backup);

        StoreJson.Same("{\"k\":1}", Json.Parse(rig.Open().Load(new string[0], settings, contact)).GetProperty(key));

        Assert.Equal(backup, rig.Bytes(name));
    }

    // ---- AC-015.4 다른 병원 -------------------------------------------------------------------

    private static Dictionary<string, byte[]> Snapshot(StoreRig rig) => rig.Names().ToDictionary(name => name, rig.Bytes);

    private static void AssertUnchanged(StoreRig rig, Dictionary<string, byte[]> before)
    {
        Assert.Equal(before.Keys.OrderBy(name => name, StringComparer.Ordinal), rig.Names());
        foreach (var pair in before) Assert.Equal(pair.Value, rig.Bytes(pair.Key));
    }

    [Fact(DisplayName = "AC-015.4 달 파일의 병원이 등록 병원과 다르면 읽지도 덮어쓰지도 않고 E-BIT-HOSPITAL-MISMATCH, 파일과 .bak은 그대로다")]
    public void OtherHospitalMonth()
    {
        using var rig = new StoreRig();
        var former = rig.Open(StoreRig.OtherProfile);
        former.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        former.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        var before = Snapshot(rig);
        var store = rig.Open();

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.Load(OneMonth, false, false)));
        AssertUnchanged(rig, before);
        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El("{\"b\":1}"), null, null)));
        AssertUnchanged(rig, before);
    }

    [Theory(DisplayName = "AC-015.4 contact.dat·settings.dat도 병원이 다르면 읽지도 덮어쓰지도 않는다")]
    [InlineData("contact.dat", false, true)]
    [InlineData("settings.dat", true, false)]
    public void OtherHospitalOtherFiles(string name, bool settings, bool contact)
    {
        using var rig = new StoreRig();
        var former = rig.Open(StoreRig.OtherProfile);
        if (contact) former.SaveContact(StoreJson.El("{\"c\":1}"));
        else former.SaveSettings(StoreJson.El("{\"s\":1}"));
        Assert.Equal(new[] { name }, rig.Names());
        var before = Snapshot(rig);
        var store = rig.Open();

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.Load(new string[0], settings, contact)));
        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() =>
        {
            if (contact) store.SaveContact(StoreJson.El("{\"c\":2}"));
            else store.SaveSettings(StoreJson.El("{\"s\":2}"));
        }));
        AssertUnchanged(rig, before);
    }

    [Fact(DisplayName = "AC-015.4 깨진 파일의 .bak이 다른 병원 것이면 쓰지 않고 E-BIT-HOSPITAL-MISMATCH, 둘 다 그대로 둔다")]
    public void BrokenWithOtherHospitalBackup()
    {
        using var rig = new StoreRig();
        rig.Plant(StoreRig.MonthFile, Encoding.ASCII.GetBytes("garbage"));
        rig.Plant(StoreRig.MonthFile + ".bak", rig.GoodMonth(profileId: StoreRig.OtherProfile));
        var before = Snapshot(rig);
        var store = rig.Open();

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.Load(OneMonth, false, false)));
        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El("{}"), null, null)));
        AssertUnchanged(rig, before);
    }

    [Fact(DisplayName = "AC-015.4 본 파일이 없고 .bak이 다른 병원 것이면 빈 내용으로 보지 않고 읽기·저장 모두 E-BIT-HOSPITAL-MISMATCH, .bak은 그대로다")]
    public void MissingMainWithOtherHospitalBackup()
    {
        using var rig = new StoreRig();
        rig.Plant(StoreRig.MonthFile + ".bak", rig.GoodMonth(profileId: StoreRig.OtherProfile));
        var before = Snapshot(rig);
        var store = rig.Open();

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.Load(OneMonth, false, false)));
        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null)));
        AssertUnchanged(rig, before);
    }

    [Fact(DisplayName = "AC-015.4 .bak만 다른 병원 것이어도 저장이 그것을 덮지 않는다")]
    public void SaveDoesNotOverwriteOtherHospitalBackup()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":1}"), null, null);
        rig.Plant(StoreRig.MonthFile + ".bak", rig.GoodMonth(profileId: StoreRig.OtherProfile));
        var before = Snapshot(rig);

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El("{\"a\":2}"), null, null)));
        AssertUnchanged(rig, before);
    }

    [Fact(DisplayName = "AC-015.4 묻은 달 가운데 하나라도 다른 병원 것이면 전체가 E-BIT-HOSPITAL-MISMATCH다")]
    public void OtherHospitalStopsWholeLoad()
    {
        using var rig = new StoreRig();
        rig.Open().SaveMonth("2026-09", StoreJson.El("{\"sep\":1}"), null, null);
        rig.Open(StoreRig.OtherProfile).SaveMonth(StoreRig.Month, StoreJson.El("{\"oct\":1}"), null, null);

        Assert.Equal(BitErrors.HospitalMismatch, StoreJson.Code(() => rig.Open().Load(new[] { "2026-09", StoreRig.Month }, false, false)));
    }

    // ---- AC-015.5 보관 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-015.5 오늘 기준 13개월보다 오래된 work-YYYY-MM.dat와 그 .bak만 지운다(딱 13개월은 남긴다)")]
    public void PruneKeepsThirteenMonths()
    {
        using var rig = new StoreRig();
        var keep = new[]
        {
            "work-2025-09.dat", "work-2025-09.dat.bak", "work-2026-10.dat", "work-2027-01.dat",
            "work-2020-01.dat.broken-20261030T000000000Z", "work-2020-01.dat.bak.broken-20261030T000000000Z", "work-2020-01.dat.abc.tmp",
            "work-2024-13.dat", "work-abc.dat", "contact.dat", "contact.dat.bak", "settings.dat", "registration.dat", "other.dat",
        };
        var remove = new[] { "work-2025-08.dat", "work-2025-08.dat.bak", "work-2020-01.dat", "work-1999-12.dat.bak" };
        foreach (var name in keep.Concat(remove)) rig.Plant(name, Encoding.ASCII.GetBytes("not read"));

        rig.Open(today: new DateTime(2026, 10, 30)).Prune();

        Assert.Equal(keep.OrderBy(name => name, StringComparer.Ordinal), rig.Names());
    }

    [Fact(DisplayName = "AC-015.5 해가 바뀌는 달도 달 수로 센다")]
    public void PruneCountsAcrossYears()
    {
        using var rig = new StoreRig();
        rig.Plant("work-2025-12.dat", new byte[] { 1 });
        rig.Plant("work-2025-11.dat", new byte[] { 1 });

        rig.Open(today: new DateTime(2027, 1, 1)).Prune();

        Assert.Equal(new[] { "work-2025-12.dat" }, rig.Names());
    }

    [Fact(DisplayName = "AC-015.5 다른 병원의 오래된 파일도 내용을 읽지 않고 이름으로 지운다, 폴더가 없어도 멈추지 않는다")]
    public void PruneNeedsNoRead()
    {
        using var rig = new StoreRig();
        rig.Open().Prune();
        Assert.False(Directory.Exists(rig.Folder));

        rig.Plant("work-2020-01.dat", rig.GoodMonth(profileId: StoreRig.OtherProfile));
        rig.Open().Prune();
        Assert.Empty(rig.Names());
    }

    // ---- AC-015.6 왕복·평문 없음 --------------------------------------------------------------

    [Fact(DisplayName = "AC-015.6 저장 뒤 다시 읽으면 같은 내용이다(한글·줄바꿈·이모지·따옴표)")]
    public void RoundTrip()
    {
        using var rig = new StoreRig();
        var drafts = "{\"900001|2026-10-27\":{\"memo\":\"가상환자01 \\\"메모\\\"\\r\\n둘째 줄 😀 <b>&\",\"n\":[1,2.5,null,true]}}";
        var store = rig.Open();
        store.SaveMonth(StoreRig.Month, StoreJson.El(drafts), StoreJson.El(StoreRig.Done), StoreJson.El(StoreRig.Journal));

        var month = StoreJson.Month(store.Load(OneMonth, false, false), StoreRig.Month);
        StoreJson.Same(drafts, month.GetProperty("drafts"));
        StoreJson.Same(StoreRig.Done, month.GetProperty("done"));
        StoreJson.Same(StoreRig.Journal, month.GetProperty("journal"));
        Assert.Equal("가상환자01 \"메모\"\r\n둘째 줄 😀 <b>&",
            month.GetProperty("drafts").GetProperty("900001|2026-10-27").GetProperty("memo").GetString());

        // 새로 연 저장소(도우미를 다시 켠 것)에서도 같다
        StoreJson.Same(drafts, StoreJson.Month(rig.Open().Load(OneMonth, false, false), StoreRig.Month).GetProperty("drafts"));
    }

    [Fact(DisplayName = "AC-015.6 어느 파일(.bak 포함)에도 평문 글자가 없고 임시 파일도 남지 않는다")]
    public void NoPlaintextOnDisk()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), StoreJson.El(StoreRig.Done), StoreJson.El(StoreRig.Journal));
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        store.SaveContact(StoreJson.El("{\"900001\":{\"name\":\"가상환자01\",\"phone\":\"010-0000-0001\"}}"));
        store.SaveContact(StoreJson.El("{\"900001\":{\"name\":\"가상환자01\",\"phone\":\"010-0000-0001\"}}"));
        store.SaveSettings(StoreJson.El("{\"phrase\":\"가상환자01\"}"));

        Assert.Equal(
            new[] { "contact.dat", "contact.dat.bak", "settings.dat", StoreRig.MonthFile, StoreRig.MonthFile + ".bak" },
            rig.Names());
        foreach (var name in rig.Names())
        {
            var text = Encoding.UTF8.GetString(rig.Bytes(name));
            Assert.DoesNotContain("가상환자01", text);
            Assert.DoesNotContain("900001", text);
            Assert.DoesNotContain("010-0000-0001", text);
            Assert.DoesNotContain("memo", text);
            Assert.DoesNotContain(Synthetic.ProfileId, text);
        }
    }

    private sealed class FailingProtector : IProtector
    {
        public byte[] Protect(byte[] plain) => throw new CryptographicException("fake");

        public byte[] Unprotect(byte[] cipher) => throw new CryptographicException("fake");
    }

    [Fact(DisplayName = "AC-015.6 암호화가 실패하면 E-STORE-FAILED이고 디스크에 아무것도 쓰지 않는다(임시 파일도 암호화한 뒤 쓴다)")]
    public void EncryptsBeforeAnyWrite()
    {
        using var rig = new StoreRig();
        var store = rig.Open(protector: new FailingProtector());

        Assert.Equal(BitErrors.StoreFailed, StoreJson.Code(() => store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null)));
        Assert.Equal(BitErrors.StoreFailed, StoreJson.Code(() => store.SaveContact(StoreJson.El("{\"c\":1}"))));
        Assert.Equal(BitErrors.StoreFailed, StoreJson.Code(() => store.SaveSettings(StoreJson.El("{\"s\":1}"))));
        Assert.Empty(rig.Names());
    }

    /// <summary>암호화가 도는 순간 폴더에 어떤 파일이 있는지 적어 둔다.</summary>
    private sealed class SpyProtector : IProtector
    {
        private readonly IProtector inner;
        private readonly Func<string[]> files;

        public SpyProtector(IProtector inner, Func<string[]> files)
        {
            this.inner = inner;
            this.files = files;
        }

        public List<string[]> SeenAtProtect { get; } = new List<string[]>();

        public byte[] Protect(byte[] plain)
        {
            SeenAtProtect.Add(files());
            return inner.Protect(plain);
        }

        public byte[] Unprotect(byte[] cipher) => inner.Unprotect(cipher);
    }

    [Fact(DisplayName = "AC-015.6 암호화가 도는 순간 디스크에 새 파일이 없다: 첫 저장이면 파일이 하나도 없고, 그 뒤에는 전에 끝낸 파일뿐이다(임시 파일도 암호화한 뒤 쓴다)")]
    public void NoFileExistsWhenProtectRuns()
    {
        using var rig = new StoreRig();
        var spy = new SpyProtector(rig.Protector, rig.Names);
        var store = rig.Open(protector: spy);
        var month = new[] { StoreRig.MonthFile };
        var monthAndBackup = new[] { StoreRig.MonthFile, StoreRig.MonthFile + ".bak" };

        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        store.SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null);
        store.SaveContact(StoreJson.El("{\"c\":1}"));
        store.SaveSettings(StoreJson.El("{\"s\":1}"));

        Assert.Equal(5, spy.SeenAtProtect.Count);
        Assert.Empty(spy.SeenAtProtect[0]);
        Assert.Equal(month, spy.SeenAtProtect[1]);
        Assert.Equal(monthAndBackup, spy.SeenAtProtect[2]);
        Assert.Equal(monthAndBackup, spy.SeenAtProtect[3]);
        Assert.Equal(new[] { WorkStore.ContactFile }.Concat(monthAndBackup), spy.SeenAtProtect[4]);
    }

    [Fact(DisplayName = "AC-015.6 오류 메시지에는 번호만 있고 저장 내용·경로가 없다")]
    public void ErrorsCarryOnlyCodes()
    {
        using var rig = new StoreRig();
        rig.Plant(StoreRig.MonthFile, rig.GoodMonth(profileId: StoreRig.OtherProfile));

        var error = Assert.ThrowsAny<HelperException>(() => rig.Open().SaveMonth(StoreRig.Month, StoreJson.El(StoreRig.Drafts), null, null));

        Assert.Equal(BitErrors.HospitalMismatch, error.Message);
    }

    // ---- AC-015.7 설정 사본 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-015.7 설정 사본은 settings.dat에 같은 틀로 두고 settings: true로 돌려준다, .bak도 하나 둔다")]
    public void SettingsRoundTrip()
    {
        using var rig = new StoreRig();
        var store = rig.Open();
        store.SaveSettings(StoreJson.El("{\"rules\":[{\"id\":\"가짜규칙\",\"level\":1}]}"));

        Assert.Equal(new[] { WorkStore.SettingsFile }, rig.Names());
        Assert.Equal(Synthetic.ProfileId, rig.Inside(WorkStore.SettingsFile).GetProperty("profileId").GetString());

        var root = Json.Parse(store.Load(new string[0], true, false));
        Assert.Equal(new[] { "settings" }, Json.Keys(root));
        StoreJson.Same("{\"rules\":[{\"id\":\"가짜규칙\",\"level\":1}]}", root.GetProperty("settings"));

        store.SaveSettings(StoreJson.El("{\"rules\":[]}"));
        StoreJson.Same("{\"rules\":[]}", Json.Parse(store.Load(new string[0], true, false)).GetProperty("settings"));
        StoreJson.Same("{\"rules\":[{\"id\":\"가짜규칙\",\"level\":1}]}", rig.Inside(WorkStore.SettingsFile + ".bak").GetProperty("settings"));
    }

    [Fact(DisplayName = "AC-015.7 설정 사본이 없으면 settings는 null이다(웹이 '사본 없음'을 안다, AC-013.9)")]
    public void MissingSettingsIsNull()
    {
        using var rig = new StoreRig();
        var root = Json.Parse(rig.Open().Load(new string[0], true, false));
        Assert.Equal(JsonValueKind.Null, root.GetProperty("settings").ValueKind);
    }
}
