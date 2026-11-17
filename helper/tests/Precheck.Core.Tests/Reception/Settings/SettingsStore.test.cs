using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.PickChoices;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

namespace Precheck.Core.Tests.Reception.Settings;

/// <summary>
/// 설정 저장(SettingsStore, spec reception-other-clinic design.md 1절, AC-5701.5~5701.9). data\reception-settings.dat = 머리 + IProtector로 감싼 설정 문서 JSON.
/// 처음 읽기는 흔적 파일(reception-lists.dat·reception-arrange.dat·reception-marks.dat)로 우리 의원·새 병원을 가리고, 그 처음 값을 표지 reception-origin.dat(ours·fresh)에 적는다.
/// 다시 만들 때는 표지를 따른다(AC-5701.9). 가짜 암호화(XorProtector)·임시 폴더·가짜 로고 바이트만 쓴다.
/// </summary>
public class SettingsStoreTests : IDisposable
{
    private const string FileName = "reception-settings.dat";
    private const string LogoFile = "reception-logo.dat";
    private const string OriginFile = "reception-origin.dat";

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-settings-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();
    private readonly byte[] wordmark = LogoBytes.Png(862, 132);
    private int wordmarkCalls;

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private string OriginPath => Path.Combine(folder, OriginFile);

    /// <summary>표지 파일을 풀어 읽은 글. 머리가 틀렸거나 풀지 못하면 시험 실패.</summary>
    private string OriginText()
    {
        var data = File.ReadAllBytes(OriginPath);
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        return Encoding.UTF8.GetString(protector.Unprotect(data.Skip(17).ToArray()));
    }

    /// <summary>표지 파일을 직접 쓴다(머리 + 가짜 암호화).</summary>
    private void WriteOrigin(string text) =>
        Trace(OriginFile, Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(new XorProtector().Protect(Encoding.UTF8.GetBytes(text))).ToArray());

    private string[] AsideFiles() => FolderFiles().Where(n => n.StartsWith(FileName + ".broken-", StringComparison.Ordinal)).ToArray();

    private void Report(string code)
    {
        lock (reports) reports.Add(code);
    }

    private LogoStore Logo(IProtector? with = null) => new LogoStore(new StoreFolder(folder), with ?? protector, Report);

    private SettingsStore Open(IProtector? with = null, Func<byte[]?>? mark = null) =>
        new SettingsStore(new StoreFolder(folder), with ?? protector, mark ?? (() =>
        {
            wordmarkCalls++;
            return wordmark;
        }), Logo(with), Report);

    private string[] FolderFiles() => Directory.Exists(folder)
        ? Directory.GetFileSystemEntries(folder).Select(p => Path.GetFileName(p)!).OrderBy(n => n, StringComparer.Ordinal).ToArray()
        : new string[0];

    private void Trace(string name, byte[]? data = null)
    {
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(Path.Combine(folder, name), data ?? Encoding.ASCII.GetBytes("trace"));
    }

    private static PickLists Changed() =>
        PickLists.TryParse(Picks.Bytes(Picks.Body(parts: "[\"꼬리뼈\",\"어깨\"]", pt: "[\"ICE\",\"TENS\"]", trac: "[\"골반\"]")), out var lists)
            ? lists
            : throw new InvalidOperationException("시험 목록이 틀렸다");

    private static ReceptionSettings Edit(ReceptionSettings settings, Action<JsonObject> change)
    {
        var doc = Docs.Node(settings);
        change(doc);
        return Docs.Parse(doc);
    }

    private static bool Contains(byte[] data, string text)
    {
        var needle = Encoding.UTF8.GetBytes(text);
        for (var i = 0; i + needle.Length <= data.Length; i++)
            if (data.Skip(i).Take(needle.Length).SequenceEqual(needle)) return true;
        return false;
    }

    // ---- AC-5701.6 새 병원 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.6 설정 파일도 흔적 파일도 없으면 새 병원 처음 값을 만들어 바로 저장한다(로고 파일·품은 그림 읽기 없음, 기록 없음)")]
    public void FreshWhenNothing()
    {
        var store = Open();
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(store.Current()));
        Assert.Equal(new[] { OriginFile, FileName }, FolderFiles());
        Assert.Equal(0, wordmarkCalls);
        Assert.Empty(reports);
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal(2, protector.ProtectCalls);
    }

    [Fact(DisplayName = "AC-5701.6 설정 파일이 생긴 뒤에는 흔적 파일(표시 파일)이 생겨도 새 병원 값 그대로다")]
    public void FreshStaysAfterMarks()
    {
        Open().Current();
        Trace("reception-marks.dat");
        Trace("reception-arrange.dat");
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal(0, wordmarkCalls);
        Assert.False(File.Exists(Path.Combine(folder, LogoFile)));
    }

    // ---- AC-5701.5 우리 의원 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.5 reception-lists.dat가 있으면 우리 의원 처음 값(picks = 그 목록 + extra {})을 바로 저장하고, 품은 로고 그림을 로고 파일(PNG)로 옮기며 옛 목록 파일은 그대로 둔다")]
    public void OursFromLists()
    {
        new ReceptionLists(new StoreFolder(folder), protector).Save(Changed());
        var listsBefore = File.ReadAllBytes(Path.Combine(folder, ReceptionLists.FileName));

        var settings = Open().Current();
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(Changed())), Docs.Json(settings));
        Assert.Equal(new[] { "꼬리뼈", "어깨" }, settings.Picks.Parts);
        Assert.Equal(new[] { ReceptionLists.FileName, LogoFile, OriginFile, FileName }, FolderFiles());
        Assert.Equal(listsBefore, File.ReadAllBytes(Path.Combine(folder, ReceptionLists.FileName)));
        var picture = Logo().Read();
        Assert.NotNull(picture);
        Assert.Equal(LogoKind.Png, picture!.Kind);
        Assert.Equal(wordmark, picture.Bytes);
        Assert.Equal(1, wordmarkCalls);
        Assert.Empty(reports);
    }

    [Theory(DisplayName = "AC-5701.5 흔적 파일 셋 가운데 하나만 있어도 우리 의원 처음 값이다(목록 파일이 없으면 지금 기본 목록)")]
    [InlineData("reception-arrange.dat")]
    [InlineData("reception-marks.dat")]
    public void OursFromAnyTrace(string trace)
    {
        Trace(trace);
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.True(File.Exists(FilePath));
        Assert.Equal(wordmark, Logo().Read()!.Bytes);
    }

    [Fact(DisplayName = "AC-5701.5 목록 파일이 깨졌으면 우리 의원 처음 값의 picks는 지금 기본 목록이다(목록 파일은 지우지 않음)")]
    public void OursWithBrokenLists()
    {
        Trace(ReceptionLists.FileName, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.True(File.Exists(Path.Combine(folder, ReceptionLists.FileName)));
        Assert.All(reports, code => Assert.Equal(BitErrors.StoreBroken, code));
    }

    [Fact(DisplayName = "AC-5701.5 옮긴 뒤 다시 켜면 저장한 설정을 읽고 다시 옮기지 않는다(로고 그림을 다시 쓰지 않음)")]
    public void OursMigratesOnce()
    {
        Trace("reception-marks.dat");
        var first = Docs.Json(Open().Current());
        var logoBefore = File.ReadAllBytes(Path.Combine(folder, LogoFile));
        var calls = protector.ProtectCalls;
        Assert.Equal(first, Docs.Json(Open().Current()));
        Assert.Equal(1, wordmarkCalls);
        Assert.Equal(calls, protector.ProtectCalls);
        Assert.Equal(logoBefore, File.ReadAllBytes(Path.Combine(folder, LogoFile)));
    }

    [Fact(DisplayName = "AC-5701.5 품은 로고 그림을 읽지 못하면(없음) 우리 의원 처음 값의 로고는 none·ver 0이고 로고 파일이 없다")]
    public void OursWithoutWordmark()
    {
        Trace("reception-marks.dat");
        var settings = Open(mark: () => null).Current();
        Assert.Equal(("none", 0), (settings.Logo.Mode, settings.Logo.Ver));
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults).WithLogo(new LogoSetting("none", null, 0))), Docs.Json(settings));
        Assert.False(File.Exists(Path.Combine(folder, LogoFile)));
    }

    // ---- AC-5701.7 저장 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.7 Save는 rev가 같으면 저장하고 rev를 1 올린다. 다시 연 SettingsStore(접수 현황을 다시 켬)도 같은 문서를 읽는다")]
    public void SaveBumpsRev()
    {
        var store = Open();
        var next = Edit(store.Current(), d => Docs.Col(d, "sono")["codes"] = Docs.Strings(new[] { "SONO1" }));
        Assert.Equal(SaveResult.Saved, store.Save(next));
        var saved = store.Current();
        Assert.Equal(1, saved.Rev);
        Assert.Equal(new[] { "SONO1" }, saved.Cols.Single(c => c.K == "sono").Codes);
        Assert.Equal(Docs.Json(next.WithRev(1)), Docs.Json(saved));
        Assert.Equal(Docs.Json(saved), Docs.Json(Open().Current()));
        Assert.Equal(SaveResult.Saved, store.Save(Edit(saved, d => d["tab"] = false)));
        Assert.Equal(2, Open().Current().Rev);
    }

    [Fact(DisplayName = "AC-5701.7 파일은 저장 폴더의 reception-settings.dat 하나(+ 표지 reception-origin.dat, 임시 파일 없음)이고 머리 PRECHECK-STORE-1 뒤 IProtector 암호문이며, 푼 글은 설정 문서다")]
    public void OneEncryptedFile()
    {
        var store = Open();
        store.Save(Edit(store.Current(), d =>
        {
            Docs.Col(d, "pt")["name"] = "물리치료";
            d["logo"]!["mode"] = "text";
            d["logo"]!["text"] = "가나다정형외과";
        }));
        Assert.Equal(new[] { OriginFile, FileName }, FolderFiles());
        var data = File.ReadAllBytes(FilePath);
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        foreach (var text in new[] { "물리치료", "가나다정형외과", "cols", "picks" }) Assert.False(Contains(data, text), text);
        Assert.True(ReceptionSettings.TryParse(protector.LastPlain!, out var stored));
        Assert.Equal(Docs.Json(store.Current()), Docs.Json(stored));
        Assert.Equal(FileName, SettingsStore.FileName);
    }

    [Fact(DisplayName = "AC-5701.7 rev가 저장된 rev와 다르면 Conflict이고 파일·문서는 그대로다")]
    public void SaveConflict()
    {
        var store = Open();
        var first = store.Current();
        Assert.Equal(SaveResult.Saved, store.Save(Edit(first, d => d["tab"] = false)));
        var before = File.ReadAllBytes(FilePath);
        var json = Docs.Json(store.Current());
        Assert.Equal(SaveResult.Conflict, store.Save(Edit(first, d => d["logo"]!["text"] = "늦은 기기")));
        Assert.Equal(SaveResult.Conflict, store.Save(store.Current().WithRev(7)));
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(json, Docs.Json(store.Current()));
    }

    public static IEnumerable<object[]> ForbiddenNames() => new[]
    {
        new object[] { "nextX 줄이기" },
        new object[] { "logo.ver 바꾸기" },
        new object[] { "ver 0인데 mode pic" },
        new object[] { "로고 파일 없이 mode pic" },
    };

    [Theory(DisplayName = "AC-5701.7 바꿀 수 없는 것을 바꾸면(nextX 줄이기·logo.ver·로고 파일 없이 pic) Invalid이고 파일·문서는 그대로다")]
    [MemberData(nameof(ForbiddenNames))]
    public void SaveInvalid(string why)
    {
        var store = Open();
        store.Save(Docs.Parse(Docs.WithAdded(Docs.Node(store.Current()), 1)));
        if (why == "로고 파일 없이 mode pic") store.Update(s => s.WithLogo(new LogoSetting("none", null, 3)));
        var stored = store.Current();
        var before = File.ReadAllBytes(FilePath);
        var next = Edit(stored, d =>
        {
            switch (why)
            {
                case "nextX 줄이기":
                    Docs.Cols(d).Remove(Docs.Col(d, "x1"));
                    Docs.Extra(d).Remove("x1");
                    d["nextX"] = 1;
                    break;
                case "logo.ver 바꾸기":
                    d["logo"]!["ver"] = 9;
                    break;
                default:
                    d["logo"]!["mode"] = "pic";
                    break;
            }
        });
        Assert.Equal(SaveResult.Invalid, store.Save(next));
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(Docs.Json(stored), Docs.Json(store.Current()));
    }

    [Fact(DisplayName = "AC-5701.7 뺀 칸을 [되돌리기]로 같은 열쇠로 되살리는 저장은 된다")]
    public void RestoreRemovedCol()
    {
        var store = Open();
        var withX1 = Docs.Parse(Docs.WithAdded(Docs.Node(store.Current()), 1));
        Assert.Equal(SaveResult.Saved, store.Save(withX1));
        var removed = Edit(store.Current(), d =>
        {
            Docs.Cols(d).Remove(Docs.Col(d, "x1"));
            Docs.Extra(d).Remove("x1");
        });
        Assert.Equal(SaveResult.Saved, store.Save(removed));
        Assert.Equal(SaveResult.Saved, store.Save(withX1.WithRev(store.Current().Rev)));
        Assert.Equal(new[] { "x1" }, store.Current().Cols.Where(c => c.Added).Select(c => c.K).ToArray());
        Assert.Equal(3, store.Current().Rev);
    }

    [Fact(DisplayName = "AC-5701.7 우리 의원(로고 파일 있음)은 mode를 none으로 바꿨다가 다시 pic으로 저장할 수 있다")]
    public void PicAgainWithLogoFile()
    {
        Trace("reception-marks.dat");
        var store = Open();
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["logo"]!["mode"] = "none")));
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["logo"]!["mode"] = "pic")));
        Assert.Equal("pic", store.Current().Logo.Mode);
    }

    [Fact(DisplayName = "AC-5701.7 Update(서버가 바꿈)는 바꾼 문서를 rev +1로 저장하고 logo.ver도 바꿀 수 있다")]
    public void UpdateBumpsRev()
    {
        var store = Open();
        var updated = store.Update(s => s.WithLogo(new LogoSetting("pic", s.Logo.Text, s.Logo.Ver + 1)).WithSetup(new SetupState(true, s.Setup.Tab, s.Setup.Done)));
        Assert.Equal(1, updated.Rev);
        Assert.Equal(("pic", 1), (updated.Logo.Mode, updated.Logo.Ver));
        Assert.True(updated.Setup.Logo);
        Assert.Equal(Docs.Json(updated), Docs.Json(store.Current()));
        Assert.Equal(Docs.Json(updated), Docs.Json(Open().Current()));
        Assert.Throws<ArgumentNullException>(() => store.Update(null!));
        Assert.Throws<ArgumentNullException>(() => store.Save(null!));
    }

    public static IEnumerable<object[]> BrokenFiles() => new[]
    {
        new object[] { "빈 파일", new byte[0] },
        new object[] { "머리만", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n") },
        new object[] { "쓰레기 바이트", Encoding.ASCII.GetBytes("garbage-bytes-0123456789") },
        new object[] { "64KB 넘음", Enumerable.Repeat((byte)'x', 64 * 1024 + 1).ToArray() },
    };

    [Theory(DisplayName = "AC-5701.7 깨진 파일은 이름을 바꿔 두고(지우지 않음) 처음 값 규칙으로 다시 만들며, 기록에는 E-STORE-BROKEN 번호만 한 번 남는다")]
    [MemberData(nameof(BrokenFiles))]
    public void BrokenFileSetAside(string why, byte[] data)
    {
        Trace(FileName, data);
        var store = Open();
        Assert.True(Docs.Json(ReceptionSettings.Fresh()) == Docs.Json(store.Current()), why);
        store.Current();
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
        var aside = FolderFiles().Where(n => n != FileName && n != OriginFile).ToArray();
        Assert.Single(aside);
        Assert.StartsWith(FileName + ".broken-", aside[0], StringComparison.Ordinal);
        Assert.Equal(data, File.ReadAllBytes(Path.Combine(folder, aside[0])));
        reports.Clear();
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Empty(reports);
    }

    public static IEnumerable<object[]> BrokenPlains() => new[]
    {
        new object[] { "JSON 아님", Encoding.UTF8.GetBytes("not json") },
        new object[] { "고르기 목록만(옛 모양)", Picks.Bytes(Picks.Body()) },
        new object[] { "모르는 칸", Encoding.UTF8.GetBytes(WithDay(Docs.Json(ReceptionSettings.Fresh()))) },
        new object[] { "잘못된 UTF-8", new byte[] { 0x7B, 0xC3, 0x28, 0x7D } },
    };

    private static string WithDay(string json) => json.Substring(0, json.Length - 1) + ",\"day\":\"20261117\"}";

    [Theory(DisplayName = "AC-5701.7 풀면 모양이 틀린 파일도 깨진 파일이다: 표지가 없으면 흔적 파일이 있어도 새 병원 처음 값으로 다시 만든다(AC-5701.9)")]
    [MemberData(nameof(BrokenPlains))]
    public void BrokenShapeRebuildsFresh(string why, byte[] plain)
    {
        Trace("reception-arrange.dat");
        Directory.CreateDirectory(folder);
        var header = Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n");
        File.WriteAllBytes(FilePath, header.Concat(protector.Protect(plain)).ToArray());
        Assert.True(Docs.Json(ReceptionSettings.Fresh()) == Docs.Json(Open().Current()), why);
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
        Assert.Single(FolderFiles(), n => n.StartsWith(FileName + ".broken-", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-5701.7 풀지 못하는 파일(다른 윈도우 계정의 DPAPI)도 깨진 파일이다(E-STORE-BROKEN 한 번)")]
    public void UnreadableCipherIsBroken()
    {
        Open().Save(Edit(Open().Current(), d => d["tab"] = false));
        var store = Open(new XorProtector(0x33));
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(store.Current()));
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-5701.7 쓰지 못하면 Current는 처음 값으로 답하고(E-STORE-FAILED) Save·Update는 E-STORE-FAILED를 던지며 임시 파일이 남지 않는다")]
    public void WriteFailure()
    {
        Directory.CreateDirectory(FilePath);
        var store = Open();
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(store.Current()));
        Assert.Contains(BitErrors.StoreFailed, reports);
        Assert.Equal(BitErrors.StoreFailed, Assert.Throws<BitException>(() => store.Save(ReceptionSettings.Fresh())).Code);
        Assert.Equal(BitErrors.StoreFailed, Assert.Throws<BitException>(() => store.Update(s => s)).Code);
        Assert.Equal(new[] { OriginFile, FileName }, FolderFiles());
        Assert.True(Directory.Exists(FilePath));
    }

    [Fact(DisplayName = "AC-5701.7 암호화하지 못하면 파일을 쓰지 않고 E-STORE-FAILED, 문서는 그대로다")]
    public void ProtectFailureKeepsSettings()
    {
        var store = Open();
        var current = store.Current();
        var before = File.ReadAllBytes(FilePath);
        protector.FailProtect = true;
        Assert.Equal(BitErrors.StoreFailed, Assert.Throws<BitException>(() => store.Save(Edit(current, d => d["tab"] = false))).Code);
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(Docs.Json(current), Docs.Json(store.Current()));
        Assert.Equal(new[] { OriginFile, FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-5701.7 날짜와 상관없다: SettingsStore는 저장 폴더·암호화·품은 그림·로고 저장·기록만 받고(시계 없음) Current·Save·Update만 연다")]
    public void NoClockAndSmallSurface()
    {
        var type = typeof(SettingsStore);
        var allowed = new[] { typeof(IStoreFolder), typeof(IProtector), typeof(Func<byte[]?>), typeof(LogoStore), typeof(Action<string>) };
        var constructors = type.GetConstructors(BindingFlags.Public | BindingFlags.Instance);
        Assert.Single(constructors);
        Assert.All(constructors[0].GetParameters(), p => Assert.Contains(p.ParameterType, allowed));
        foreach (var field in type.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
        {
            var name = field.FieldType.FullName ?? field.FieldType.Name;
            Assert.False(name.StartsWith("System.Net", StringComparison.Ordinal), $"{field.Name}이 네트워크를 든다");
            Assert.False(field.FieldType == typeof(Func<DateTime>), $"{field.Name}이 시계를 든다");
        }
        var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Select(m => m.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "Current", "Save", "Update" }, methods);
    }

    [Fact(DisplayName = "AC-5701.7 기록에는 오류 번호만 간다: 설정 글·경로가 없다")]
    public void ReportCarriesCodeOnly()
    {
        Trace(FileName, Encoding.UTF8.GetBytes("가나다정형외과 garbage"));
        Open().Current();
        Directory.Delete(folder, true);
        Directory.CreateDirectory(FilePath);
        Open().Current();
        Assert.NotEmpty(reports);
        Assert.All(reports, code => Assert.Matches("^E-[A-Z]+(-[A-Z]+)*$", code));
    }

    // ---- AC-5701.9 처음 값 표지 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.9 새 병원 처음 값을 만들어 저장하면 같은 폴더의 reception-origin.dat(머리 PRECHECK-STORE-1 + IProtector)에 표지 fresh를 쓴다")]
    public void FreshWritesOrigin()
    {
        Open().Current();
        Assert.Equal("fresh", OriginText());
        Assert.False(Contains(File.ReadAllBytes(OriginPath), "fresh"));
    }

    [Fact(DisplayName = "AC-5701.9 우리 의원 처음 값을 만들어 저장하면 표지 ours를 쓰고, 설정 파일이 읽히는 동안에는 표지를 다시 쓰지 않는다")]
    public void OursWritesOrigin()
    {
        Trace("reception-marks.dat");
        Open().Current();
        Assert.Equal("ours", OriginText());
        var before = File.ReadAllBytes(OriginPath);
        var store = Open();
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["tab"] = false)));
        Assert.Equal(before, File.ReadAllBytes(OriginPath));
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일이 깨졌는데 표지가 없으면 흔적 파일이 있어도 새 병원 처음 값으로 만들고 표지 fresh를 쓴다(우리 의원 로고를 옮기지 않음)")]
    public void BrokenWithoutOriginIsFresh()
    {
        Trace("reception-marks.dat");
        Trace(ReceptionLists.FileName);
        Trace(FileName, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal("fresh", OriginText());
        Assert.Equal(0, wordmarkCalls);
        Assert.False(File.Exists(Path.Combine(folder, LogoFile)));
        Assert.Single(AsideFiles());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일이 깨졌을 때 표지 ours가 있으면 우리 의원 처음 값으로 다시 만들고(있던 로고 그림을 둠) 표지는 그대로다")]
    public void BrokenWithOursOriginIsOurs()
    {
        Trace("reception-marks.dat");
        Open().Current();
        var origin = File.ReadAllBytes(OriginPath);
        var logoBefore = File.ReadAllBytes(Path.Combine(folder, LogoFile));
        Trace(FileName, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.Equal(origin, File.ReadAllBytes(OriginPath));
        Assert.Equal(logoBefore, File.ReadAllBytes(Path.Combine(folder, LogoFile)));
        Assert.Equal(1, wordmarkCalls);
        Assert.Single(AsideFiles());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일이 깨졌을 때 표지 fresh가 있으면 흔적 파일(표시 파일)이 있어도 새 병원 처음 값으로 다시 만든다")]
    public void BrokenWithFreshOriginIsFresh()
    {
        Open().Current();
        var origin = File.ReadAllBytes(OriginPath);
        Trace("reception-marks.dat");
        Trace("reception-arrange.dat");
        Trace(FileName, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal(origin, File.ReadAllBytes(OriginPath));
        Assert.Equal(0, wordmarkCalls);
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일이 없을 때 표지 fresh가 있으면 표시 파일이 있어도 새 병원 처음 값으로 만들고 표지는 그대로다")]
    public void MissingWithFreshOriginIsFresh()
    {
        Open().Current();
        var origin = File.ReadAllBytes(OriginPath);
        Trace("reception-marks.dat");
        File.Delete(FilePath);
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal(origin, File.ReadAllBytes(OriginPath));
        Assert.True(File.Exists(FilePath));
        Assert.Equal(0, wordmarkCalls);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일이 없을 때 표지 ours가 있으면 흔적 파일이 없어도 우리 의원 처음 값으로 만든다(있던 로고 그림을 둠)")]
    public void MissingWithOursOriginIsOurs()
    {
        Trace("reception-marks.dat");
        Open().Current();
        File.Delete(FilePath);
        File.Delete(Path.Combine(folder, "reception-marks.dat"));
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.Equal("ours", OriginText());
        Assert.Equal(1, wordmarkCalls);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-5701.9 설정 파일도 표지도 없으면 흔적 파일 규칙(AC-5701.5·5701.6)으로 정하고 그 표지를 쓴다")]
    public void MissingWithoutOriginFollowsTrace()
    {
        Trace("reception-marks.dat");
        Open().Current();
        File.Delete(FilePath);
        File.Delete(OriginPath);
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.Equal("ours", OriginText());
    }

    public static IEnumerable<object[]> BrokenOrigins() => new[]
    {
        new object[] { "쓰레기 바이트", Encoding.ASCII.GetBytes("garbage-bytes-0123456789") },
        new object[] { "머리만", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n") },
        new object[] { "모르는 표지", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(new XorProtector().Protect(Encoding.ASCII.GetBytes("OURS"))).ToArray() },
        new object[] { "다른 윈도우 계정", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n").Concat(new XorProtector(0x33).Protect(Encoding.ASCII.GetBytes("ours"))).ToArray() },
    };

    [Theory(DisplayName = "AC-5701.9 설정 파일이 깨졌는데 표지도 깨졌으면 흔적 파일이 있어도 새 병원 처음 값으로 만들고 표지 fresh를 다시 쓴다(E-STORE-BROKEN 한 번)")]
    [MemberData(nameof(BrokenOrigins))]
    public void BrokenWithBrokenOriginIsFresh(string why, byte[] origin)
    {
        Trace("reception-marks.dat");
        Trace(OriginFile, origin);
        Trace(FileName, Encoding.ASCII.GetBytes("garbage-bytes-0123456789"));
        Assert.True(Docs.Json(ReceptionSettings.Fresh()) == Docs.Json(Open().Current()), why);
        Assert.Equal("fresh", OriginText());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
        Assert.Equal(0, wordmarkCalls);
    }

    [Theory(DisplayName = "AC-5701.9 설정 파일이 없는데 표지가 깨졌으면(읽을 수 있는 표지 없음, 처음 켜기가 아님) 흔적 파일이 있어도 새 병원 처음 값으로 만들고 표지 fresh를 다시 쓴다")]
    [MemberData(nameof(BrokenOrigins))]
    public void MissingWithBrokenOriginIsFresh(string why, byte[] origin)
    {
        Trace("reception-marks.dat");
        Trace(OriginFile, origin);
        Assert.True(Docs.Json(ReceptionSettings.Fresh()) == Docs.Json(Open().Current()), why);
        Assert.Equal("fresh", OriginText());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-5701.9 표지를 쓰지 못하면 깨진 설정 파일을 옮기지 않고 새 병원 처음 값으로 답하며(E-STORE-FAILED), 다음 읽기도 우리 의원 값이 되지 않는다")]
    public void OriginWriteFailureNeverOurs()
    {
        Trace("reception-marks.dat");
        var broken = Encoding.ASCII.GetBytes("garbage-bytes-0123456789");
        Trace(FileName, broken);
        Directory.CreateDirectory(OriginPath);
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Contains(BitErrors.StoreFailed, reports);
        Assert.Equal(broken, File.ReadAllBytes(FilePath));
        Assert.Empty(AsideFiles());
        Directory.Delete(OriginPath);
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Equal("fresh", OriginText());
        Assert.Single(AsideFiles());
        Assert.Equal(0, wordmarkCalls);
    }

    [Fact(DisplayName = "AC-5701.9 설정을 쓰지 못해 처음 값으로 답할 때도 표지를 따른다: 표지 fresh면 표시 파일이 있어도 새 병원 값(저장하지 않음)")]
    public void FallbackFollowsFreshOrigin()
    {
        WriteOrigin("fresh");
        Trace("reception-marks.dat");
        Directory.CreateDirectory(FilePath);
        Assert.Equal(Docs.Json(ReceptionSettings.Fresh()), Docs.Json(Open().Current()));
        Assert.Contains(BitErrors.StoreFailed, reports);
        Assert.Equal(0, wordmarkCalls);
        Assert.Equal("fresh", OriginText());
    }

    [Fact(DisplayName = "AC-5701.9 설정을 쓰지 못해 처음 값으로 답할 때 표지가 ours면 흔적 파일이 없어도 우리 의원 값(저장하지 않음)")]
    public void FallbackFollowsOursOrigin()
    {
        WriteOrigin("ours");
        Directory.CreateDirectory(FilePath);
        Assert.Equal(Docs.Json(ReceptionSettings.Ours(PickLists.Defaults)), Docs.Json(Open().Current()));
        Assert.Contains(BitErrors.StoreFailed, reports);
        Assert.True(Directory.Exists(FilePath));
    }

    // ---- AC-5701.8 setup.done ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5701.8 저장된 setup.done이 참이면 받은 문서의 done이 거짓이어도 참으로 저장한다")]
    public void DoneStaysTrue()
    {
        Trace("reception-marks.dat");
        var store = Open();
        Assert.True(store.Current().Setup.Done);
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["setup"]!["done"] = false)));
        Assert.True(store.Current().Setup.Done);
        Assert.True(Open().Current().Setup.Done);
        store.Update(s => s.WithSetup(new SetupState(s.Setup.Logo, s.Setup.Tab, false)));
        Assert.True(store.Current().Setup.Done);
    }

    [Fact(DisplayName = "AC-5701.8 새 병원은 done 참을 받으면 참이 되고, 그 뒤로는 거짓을 받아도 참이다(logo·tab은 받은 대로)")]
    public void DoneTurnsTrueOnce()
    {
        var store = Open();
        Assert.False(store.Current().Setup.Done);
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["setup"]!["tab"] = true)));
        Assert.Equal((false, true, false), (store.Current().Setup.Logo, store.Current().Setup.Tab, store.Current().Setup.Done));
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["setup"] = new JsonObject { ["logo"] = true, ["tab"] = true, ["done"] = true })));
        Assert.True(store.Current().Setup.Done);
        Assert.Equal(SaveResult.Saved, store.Save(Edit(store.Current(), d => d["setup"] = new JsonObject { ["logo"] = false, ["tab"] = false, ["done"] = false })));
        Assert.Equal((false, false, true), (store.Current().Setup.Logo, store.Current().Setup.Tab, store.Current().Setup.Done));
    }
}
