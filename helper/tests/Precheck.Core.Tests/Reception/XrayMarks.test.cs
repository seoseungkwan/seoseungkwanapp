using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Store;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Xray 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Xray;

/// <summary>
/// 엑스레이 찍음 표시 저장(XrayMarks, design.md 6절, REQ-1405).
/// AC-1405.1 누르면 그 내원과 누른 시각(시:분)이 남고 다음 읽기부터 같은 표시를 읽는다.
/// AC-1405.2 취소하면 표시가 지워진다.
/// AC-1405.3 날이 바뀌면 지난 날 표시는 읽을 때 버리고, 새 접수(다른 내원)에는 표시가 없다.
/// AC-1405.4 저장 폴더의 reception-marks.dat 하나에 IProtector로 암호화해 둔다. 비트·웹 서버로 가지 않는다.
/// AC-1405.6 한 번에 하나씩 쓰고 나중 요청이 이긴다. 임시 파일 → 바꾸기라 파일이 깨지지 않고, 깨진 파일은 빈 표시로 시작한다(기록에 번호).
/// 가짜 암호화·임시 폴더·주입한 시계만 쓴다. 내원번호는 가짜(V+숫자)다.
/// </summary>
public class XrayMarksTests : IDisposable
{
    private const string FileName = "reception-marks.dat";
    private static readonly DateTime Morning = new DateTime(2026, 11, 5, 10, 55, 42);

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-xray-" + Guid.NewGuid().ToString("N"));
    private readonly FakeClock clock = new FakeClock(Morning);
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private XrayMarks Open(IProtector? with = null) => new XrayMarks(new StoreFolder(folder), with ?? protector, () => clock.Now, code => { lock (reports) reports.Add(code); });

    private static Dictionary<string, string> Copy(IReadOnlyDictionary<string, string> marks) => marks.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);

    private static Dictionary<string, string> Expect(params (string Visit, string At)[] pairs) => pairs.ToDictionary(p => p.Visit, p => p.At, StringComparer.Ordinal);

    private string[] FolderFiles() => Directory.Exists(folder) ? Directory.GetFileSystemEntries(folder).Select(p => Path.GetFileName(p)!).OrderBy(n => n, StringComparer.Ordinal).ToArray() : new string[0];

    /// <summary>파일 바이트에서 마지막 암호문 앞(머리 등)을 그대로 두고 암호문만 바꾼 파일을 쓴다. 파일 머리 모양에 묶이지 않으려고.</summary>
    private void ReplaceCipher(byte[] plain)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        Assert.True(EndsWith(data, cipher), "파일 끝이 IProtector가 만든 암호문이 아니다");
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(plain)).ToArray());
    }

    private static bool EndsWith(byte[] data, byte[] tail) => data.Length >= tail.Length && data.Skip(data.Length - tail.Length).SequenceEqual(tail);

    private static bool Contains(byte[] data, string text)
    {
        var needle = Encoding.UTF8.GetBytes(text);
        for (var i = 0; i + needle.Length <= data.Length; i++)
            if (data.Skip(i).Take(needle.Length).SequenceEqual(needle)) return true;
        return false;
    }

    // ---- AC-1405.1 찍음 표시 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1405.1 [찍음 표시]를 누르면 그 내원과 누른 시각(시:분)이 남는다")]
    public void SetOnKeepsVisitAndMinute()
    {
        var marks = Open();
        marks.Set("V901", true);
        Assert.Equal(Expect(("V901", "10:55")), Copy(marks.Today()));
    }

    [Fact(DisplayName = "AC-1405.1 다음 읽기부터 같은 표시: 저장 폴더를 새로 연 XrayMarks(도우미를 다시 켬)도 같은 표시를 읽는다")]
    public void NextReadSeesMark()
    {
        Open().Set("V901", true);
        Assert.Equal(Expect(("V901", "10:55")), Copy(Open().Today()));
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-1405.1 다른 내원 표시는 그대로 두고 더한다(시각은 두 자리 시:분)")]
    public void SetOnAddsWithoutTouchingOthers()
    {
        var marks = Open();
        marks.Set("V901", true);
        clock.Now = new DateTime(2026, 11, 5, 9, 3, 59);
        marks.Set("V902", true);
        Assert.Equal(Expect(("V901", "10:55"), ("V902", "09:03")), Copy(marks.Today()));
        Assert.Equal(Expect(("V901", "10:55"), ("V902", "09:03")), Copy(Open().Today()));
    }

    [Fact(DisplayName = "AC-1405.1 Today()는 그때의 사본이다: 뒤에 누른 표시가 앞서 받은 표에 섞이지 않는다")]
    public void TodayIsSnapshot()
    {
        var marks = Open();
        marks.Set("V901", true);
        var before = marks.Today();
        marks.Set("V902", true);
        marks.Set("V901", false);
        Assert.Equal(Expect(("V901", "10:55")), Copy(before));
        Assert.False(before is IDictionary<string, string> writable && !writable.IsReadOnly, "받은 표를 고칠 수 있다");
    }

    [Fact(DisplayName = "AC-1405.1 파일이 없으면 빈 표시이고 기록도 없다")]
    public void MissingFileIsEmpty()
    {
        Assert.Empty(Open().Today());
        Assert.Empty(reports);
        Assert.False(File.Exists(FilePath));
    }

    [Fact(DisplayName = "AC-1405.1 내원번호가 비었거나 null이면 바꾸지 않는다(ArgumentException, 파일 없음)")]
    public void SetRejectsEmptyVisit()
    {
        var marks = Open();
        Assert.ThrowsAny<ArgumentException>(() => marks.Set("", true));
        Assert.ThrowsAny<ArgumentException>(() => marks.Set(null!, true));
        Assert.False(File.Exists(FilePath));
        Assert.Empty(marks.Today());
    }

    // ---- AC-1405.2 표시 취소 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1405.2 [표시 취소]를 누르면 표시가 지워지고 다시 열어도 없다")]
    public void SetOffRemoves()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V901", false);
        Assert.Empty(marks.Today());
        Assert.Empty(Open().Today());
    }

    [Fact(DisplayName = "AC-1405.2 취소는 그 내원 표시만 지우고 다른 내원 표시는 남긴다")]
    public void SetOffKeepsOthers()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V902", true);
        marks.Set("V901", false);
        Assert.Equal(Expect(("V902", "10:55")), Copy(marks.Today()));
        Assert.Equal(Expect(("V902", "10:55")), Copy(Open().Today()));
    }

    [Fact(DisplayName = "AC-1405.2 표시 없는 내원을 취소해도 아무 일 없다(파일을 만들지 않는다)")]
    public void SetOffWithoutMarkIsNoop()
    {
        var marks = Open();
        marks.Set("V901", false);
        Assert.Empty(marks.Today());
        Assert.False(File.Exists(FilePath));
        Assert.Equal(0, protector.ProtectCalls);
    }

    [Fact(DisplayName = "AC-1405.2 취소한 뒤 다시 누르면 새 시각으로 다시 남는다")]
    public void SetOnAgainAfterOff()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V901", false);
        clock.Now = new DateTime(2026, 11, 5, 11, 20, 5);
        marks.Set("V901", true);
        Assert.Equal(Expect(("V901", "11:20")), Copy(Open().Today()));
    }

    // ---- AC-1405.3 날 바뀜·새 접수 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1405.3 날이 바뀌면 지난 날 표시는 읽을 때 버린다(23:59 표시는 다음 날 00:00에 없다)")]
    public void NewDayDropsOnRead()
    {
        clock.Now = new DateTime(2026, 11, 5, 23, 59, 30);
        var marks = Open();
        marks.Set("V901", true);
        Assert.Equal(Expect(("V901", "23:59")), Copy(marks.Today()));
        clock.Now = new DateTime(2026, 11, 6, 0, 0, 0);
        Assert.Empty(marks.Today());
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-1405.3 지난 날 파일을 다음 날 새로 연 XrayMarks도 비운다(도우미를 다음 날 켬)")]
    public void OldDayFileIsEmptyOnOpen()
    {
        Open().Set("V901", true);
        clock.Now = new DateTime(2026, 11, 6, 8, 30, 0);
        Assert.Empty(Open().Today());
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-1405.3 날이 바뀐 뒤 누르면 새 날 표시만 남고 파일도 새 날({ day, marks })이 된다")]
    public void NewDaySetWritesOnlyNewDay()
    {
        var marks = Open();
        marks.Set("V901", true);
        clock.Now = new DateTime(2026, 11, 6, 9, 10, 0);
        marks.Set("V902", true);
        Assert.Equal(Expect(("V902", "09:10")), Copy(marks.Today()));
        var (day, stored) = StoredShape(protector.LastPlain!);
        Assert.Equal("20261106", day);
        Assert.Equal(Expect(("V902", "09:10")), stored);
    }

    [Fact(DisplayName = "AC-1405.3 날이 바뀐 뒤 지난 날 내원을 취소해도 지난 날 표시는 되살아나지 않는다")]
    public void NewDayOffDoesNotRevive()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V902", true);
        clock.Now = new DateTime(2026, 11, 6, 9, 0, 0);
        marks.Set("V901", false);
        Assert.Empty(marks.Today());
        Assert.Empty(Open().Today());
    }

    [Fact(DisplayName = "AC-1405.3 표시는 내원번호로 묶여 새 접수(다른 내원)에는 표시가 없다")]
    public void NewVisitHasNoMark()
    {
        var marks = Open();
        marks.Set("V901", true);
        var today = marks.Today();
        Assert.False(today.ContainsKey("V9010"));
        Assert.False(today.ContainsKey("V902"));
        Assert.False(today.ContainsKey("v901"));
    }

    // ---- AC-1405.4 저장 자리·암호화 -------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1405.4 표시는 저장 폴더의 reception-marks.dat 하나에 둔다(임시 파일이 남지 않는다)")]
    public void StoredInOneFile()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V902", true);
        marks.Set("V901", false);
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-1405.4 파일은 IProtector로 암호화한다: 파일에 내원번호·날짜·시각 글자가 없고, 푼 글은 { day: yyyyMMdd, marks: { 내원번호: HH:MM } }이다")]
    public void FileIsProtected()
    {
        var marks = Open();
        marks.Set("V901", true);
        var data = File.ReadAllBytes(FilePath);
        Assert.True(EndsWith(data, protector.LastCipher!), "파일 끝이 IProtector가 만든 암호문이 아니다");
        foreach (var text in new[] { "V901", "20261105", "10:55", "marks", "day" })
            Assert.False(Contains(data, text), $"파일에 '{text}'가 그대로 있다");
        var (day, stored) = StoredShape(protector.LastPlain!);
        Assert.Equal("20261105", day);
        Assert.Equal(Expect(("V901", "10:55")), stored);
    }

    [Fact(DisplayName = "AC-1405.4 풀지 못하는 파일(다른 윈도우 계정의 DPAPI)은 빈 표시로 시작하고 기록에 E-STORE-BROKEN 번호만 남는다")]
    public void UnreadableCipherStartsEmpty()
    {
        Open().Set("V901", true);
        var other = new XorProtector(0x33);
        Assert.Empty(Open(other).Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-1405.4 암호화하지 못하면 파일을 쓰지 않고 E-STORE-FAILED, 표시는 그대로다")]
    public void ProtectFailureKeepsState()
    {
        var marks = Open();
        marks.Set("V901", true);
        var before = File.ReadAllBytes(FilePath);
        protector.FailProtect = true;
        var error = Assert.Throws<BitException>(() => marks.Set("V902", true));
        Assert.Equal(BitErrors.StoreFailed, error.Code);
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(Expect(("V901", "10:55")), Copy(marks.Today()));
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-1405.4 비트·웹 서버로 가지 않는다: XrayMarks는 저장 폴더·암호화·시계·기록만 받고 Today·Set만 연다")]
    public void OnlyLocalDependencies()
    {
        var type = typeof(XrayMarks);
        var allowed = new[] { typeof(IStoreFolder), typeof(IProtector), typeof(Func<DateTime>), typeof(Action<string>) };
        var constructors = type.GetConstructors(BindingFlags.Public | BindingFlags.Instance);
        Assert.Single(constructors);
        Assert.All(constructors[0].GetParameters(), p => Assert.Contains(p.ParameterType, allowed));
        foreach (var field in type.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
        {
            var name = field.FieldType.FullName ?? field.FieldType.Name;
            Assert.False(name.StartsWith("Precheck.Core.Bit", StringComparison.Ordinal), $"{field.Name}이 비트를 든다");
            Assert.False(name.StartsWith("System.Net", StringComparison.Ordinal), $"{field.Name}이 네트워크를 든다");
        }
        var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Select(m => m.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "Set", "Today" }, methods);
    }

    // ---- AC-1405.6 한 번에 하나·나중이 이김·깨지지 않음 ----------------------------------------------------

    [Fact(DisplayName = "AC-1405.6 나중 요청이 이긴다: 찍음 → 취소 차례면 취소가, 취소 → 찍음 차례면 찍음이 남는다")]
    public void LaterRequestWinsInOrder()
    {
        var marks = Open();
        marks.Set("V901", true);
        marks.Set("V901", false);
        Assert.Empty(Open().Today());
        marks.Set("V901", false);
        marks.Set("V901", true);
        Assert.Equal(Expect(("V901", "10:55")), Copy(Open().Today()));
    }

    [Fact(DisplayName = "AC-1405.6 나중 요청이 이긴다: 같은 줄을 두 번 찍으면 나중 시각이 남는다")]
    public void LaterTimeWins()
    {
        var marks = Open();
        marks.Set("V901", true);
        clock.Now = new DateTime(2026, 11, 5, 10, 56, 1);
        marks.Set("V901", true);
        Assert.Equal(Expect(("V901", "10:56")), Copy(Open().Today()));
    }

    [Fact(DisplayName = "AC-1405.6 앞 요청이 쓰는 중이면 뒤 요청은 기다렸다가 그 뒤에 쓴다(한 번에 하나), 뒤 요청이 이긴다")]
    public async Task WritesOneAtATime()
    {
        var marks = Open();
        using var entered = new ManualResetEventSlim(false);
        using var release = new ManualResetEventSlim(false);
        var first = true;
        protector.BeforeProtect = () =>
        {
            if (!first) return;
            first = false;
            entered.Set();
            release.Wait(TimeSpan.FromSeconds(20));
        };
        var a = Task.Run(() => marks.Set("V901", true));
        Assert.True(entered.Wait(TimeSpan.FromSeconds(20)), "앞 요청이 쓰기에 들어가지 않았다");
        var b = Task.Run(() => marks.Set("V901", false));
        Thread.Sleep(300);
        Assert.False(b.IsCompleted, "뒤 요청이 앞 요청을 기다리지 않았다");
        Assert.Equal(1, protector.ProtectCalls);
        release.Set();
        var both = Task.WhenAll(a, b);
        Assert.Same(both, await Task.WhenAny(both, Task.Delay(TimeSpan.FromSeconds(20))));
        await both;
        Assert.Equal(1, protector.MaxInside);
        Assert.Empty(marks.Today());
        Assert.Empty(Open().Today());
    }

    [Fact(DisplayName = "AC-1405.6 여러 휴대폰이 한꺼번에 눌러도 파일은 깨지지 않고 표시를 잃지 않는다")]
    public void ConcurrentSetsKeepEverything()
    {
        var marks = Open();
        var visits = Enumerable.Range(1, 120).Select(i => "V9" + i.ToString("000")).ToArray();
        Parallel.ForEach(visits, new ParallelOptions { MaxDegreeOfParallelism = 8 }, visit => marks.Set(visit, true));
        Parallel.ForEach(visits.Where((_, i) => i % 3 == 0), new ParallelOptions { MaxDegreeOfParallelism = 8 }, visit => marks.Set(visit, false));
        var expected = visits.Where((_, i) => i % 3 != 0).ToDictionary(v => v, _ => "10:55", StringComparer.Ordinal);
        Assert.Equal(expected, Copy(marks.Today()));
        Assert.Equal(expected, Copy(Open().Today()));
        Assert.Equal(1, protector.MaxInside);
        Assert.Equal(new[] { FileName }, FolderFiles());
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-1405.6 쓰지 못하면(바꿀 자리를 못 씀) E-STORE-FAILED, 임시 파일이 남지 않고 표시는 그대로다")]
    public void WriteFailureLeavesNoTemp()
    {
        Directory.CreateDirectory(FilePath);
        var marks = Open();
        var error = Assert.Throws<BitException>(() => marks.Set("V901", true));
        Assert.Equal(BitErrors.StoreFailed, error.Code);
        Assert.Empty(marks.Today());
        Assert.Equal(new[] { FileName }, FolderFiles());
        Assert.True(Directory.Exists(FilePath));
    }

    public static IEnumerable<object[]> BrokenPlains() => new[]
    {
        new object[] { "JSON 아님", "not json" },
        new object[] { "배열", "[]" },
        new object[] { "marks 없음", "{\"day\":\"20261105\"}" },
        new object[] { "day 없음", "{\"marks\":{\"V901\":\"10:55\"}}" },
        new object[] { "day가 숫자", "{\"day\":20261105,\"marks\":{}}" },
        new object[] { "day 모양 틀림", "{\"day\":\"2026-11-05\",\"marks\":{}}" },
        new object[] { "marks가 배열", "{\"day\":\"20261105\",\"marks\":[]}" },
        new object[] { "시각 모양 틀림", "{\"day\":\"20261105\",\"marks\":{\"V901\":\"25:99\"}}" },
        new object[] { "시각이 숫자", "{\"day\":\"20261105\",\"marks\":{\"V901\":1055}}" },
        new object[] { "빈 내원번호", "{\"day\":\"20261105\",\"marks\":{\"\":\"10:55\"}}" },
        new object[] { "모르는 칸", "{\"day\":\"20261105\",\"marks\":{},\"extra\":1}" },
    };

    [Theory(DisplayName = "AC-1405.6 깨진 파일(풀면 모양이 틀림)은 빈 표시로 시작하고 기록에 E-STORE-BROKEN 번호만 한 번 남는다")]
    [MemberData(nameof(BrokenPlains))]
    public void BrokenShapeStartsEmpty(string why, string plain)
    {
        Open().Set("V901", true);
        ReplaceCipher(Encoding.UTF8.GetBytes(plain));
        var marks = Open();
        Assert.True(marks.Today().Count == 0, why);
        Assert.Empty(marks.Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    public static IEnumerable<object[]> BrokenFiles() => new[]
    {
        new object[] { "빈 파일", new byte[0] },
        new object[] { "쓰레기 바이트", Encoding.ASCII.GetBytes("garbage-bytes-0123456789") },
        new object[] { "잘못된 UTF-8", new byte[] { 0xC3, 0x28, 0xFF, 0xFE } },
        new object[] { "아주 큰 파일", Enumerable.Repeat((byte)'x', 2 * 1024 * 1024).ToArray() },
    };

    [Theory(DisplayName = "AC-1405.6 깨진 파일(빈 파일·쓰레기·큰 파일)은 빈 표시로 시작하고, 다음 누름은 새 파일로 바르게 쓴다")]
    [MemberData(nameof(BrokenFiles))]
    public void BrokenFileStartsEmptyThenRecovers(string why, byte[] data)
    {
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(FilePath, data);
        var marks = Open();
        Assert.True(marks.Today().Count == 0, why);
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
        marks.Set("V902", true);
        Assert.Equal(Expect(("V902", "10:55")), Copy(marks.Today()));
        reports.Clear();
        Assert.Equal(Expect(("V902", "10:55")), Copy(Open().Today()));
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-1405.6 기록에는 오류 번호만 간다: 내원번호·경로·시각 글자가 없다")]
    public void ReportCarriesCodeOnly()
    {
        Open().Set("V901", true);
        ReplaceCipher(Encoding.UTF8.GetBytes("{\"day\":\"20261105\",\"marks\":{\"V901\":\"bad\"}}"));
        Open().Today();
        Assert.NotEmpty(reports);
        Assert.All(reports, code => Assert.Matches("^E-[A-Z]+(-[A-Z]+)*$", code));
    }

    /// <summary>푼 글을 { day, marks }로 읽는다. 칸이 그 둘만인지도 본다.</summary>
    private static (string Day, Dictionary<string, string> Marks) StoredShape(byte[] plain)
    {
        using var document = JsonDocument.Parse(plain);
        var root = document.RootElement;
        Assert.Equal(new[] { "day", "marks" }, root.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());
        var marks = root.GetProperty("marks").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString()!, StringComparer.Ordinal);
        return (root.GetProperty("day").GetString()!, marks);
    }
}

/// <summary>시험이 정하는 지금 시각.</summary>
internal sealed class FakeClock
{
    private DateTime now;

    public FakeClock(DateTime now)
    {
        this.now = now;
    }

    public DateTime Now
    {
        get { lock (this) return now; }
        set { lock (this) now = value; }
    }
}

/// <summary>
/// 가짜 암호화: 표시 + XOR(되돌릴 수 있다). 표시·열쇠가 틀리면 CryptographicException(DPAPI처럼).
/// 마지막에 받은 평문·만든 암호문, 부른 횟수, 한꺼번에 안에 있던 최대 수를 적는다.
/// </summary>
internal sealed class XorProtector : IProtector
{
    private static readonly byte[] Mark = Encoding.ASCII.GetBytes("XOR1");
    private readonly byte key;
    private int inside;
    private int maxInside;
    private int protectCalls;

    public XorProtector(byte key = 0x5A)
    {
        this.key = key;
    }

    public bool FailProtect { get; set; }

    public Action? BeforeProtect { get; set; }

    public byte[]? LastPlain { get; private set; }

    public byte[]? LastCipher { get; private set; }

    public int ProtectCalls => Volatile.Read(ref protectCalls);

    public int MaxInside => Volatile.Read(ref maxInside);

    public byte[] Protect(byte[] plain)
    {
        var now = Interlocked.Increment(ref inside);
        try
        {
            Interlocked.Increment(ref protectCalls);
            int seen;
            while (now > (seen = Volatile.Read(ref maxInside)) && Interlocked.CompareExchange(ref maxInside, now, seen) != seen) { }
            BeforeProtect?.Invoke();
            Thread.Sleep(1);
            if (FailProtect) throw new CryptographicException("fake");
            var output = Mark.Concat(new[] { key }).Concat(plain.Select(b => (byte)(b ^ key))).ToArray();
            LastPlain = plain.ToArray();
            LastCipher = output;
            return output;
        }
        finally
        {
            Interlocked.Decrement(ref inside);
        }
    }

    public byte[] Unprotect(byte[] cipher)
    {
        if (cipher.Length < Mark.Length + 1 || !cipher.Take(Mark.Length).SequenceEqual(Mark) || cipher[Mark.Length] != key) throw new CryptographicException("fake");
        return cipher.Skip(Mark.Length + 1).Select(b => (byte)(b ^ key)).ToArray();
    }
}
