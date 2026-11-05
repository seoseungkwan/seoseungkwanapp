using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// TASK-5 시험이 같이 쓰는 가짜들. 비트·레지스트리·DPAPI·창 없이 Core 규칙만 본다.
/// 병원 값은 모두 지어낸 것이다(원본 시험처럼 SYNTHETIC·12345678).
/// </summary>
internal static class Synthetic
{
    public const string Root = @"C:\DrBIT50";
    public const string Scope = "SYNTHETIC";
    public const string Institution = "12345678";
    public const string OtherInstitution = "87654321";
    public const string Server = @".\SQLEXPRESS";
    public const string Database = "DRBIT";
    public const string ProfileId = "0123456789abcdef0123456789abcdef";
    public const string MachineName = "BITPC";

    public static readonly DateTime Today = new DateTime(2026, 10, 30);

    public static HospitalRegistration Registration(
        string? institution = null, string? scope = null, string? install = null,
        string? server = null, string? database = null, string? profileId = null) =>
        new HospitalRegistration(
            institutionCode: institution ?? Institution,
            scope: scope ?? Scope,
            installPath: install ?? Root,
            server: server ?? Server,
            database: database ?? Database,
            profileId: profileId ?? ProfileId);

    public static BitTarget Target(string? install = null, string? server = null, string? database = null) =>
        new BitTarget(install ?? Root, server ?? Server, database ?? Database);

    public static string Day(DateTime day) => day.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
}

/// <summary>가짜 파일 모양: 있는 파일·폴더 목록과 환경 파일 값. 경로는 윈도우 모양 글자 그대로 비교(대소문자 무시).</summary>
internal sealed class FakeProbe : IFileProbe
{
    private readonly HashSet<string> files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> networkDrives = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, BitEnvironment> environments = new Dictionary<string, BitEnvironment>(StringComparer.OrdinalIgnoreCase);

    public List<string> EnvironmentReads { get; } = new List<string>();

    public FakeProbe File(string path)
    {
        files.Add(path);
        for (var parent = WinPath.Parent(path); parent != null; parent = WinPath.Parent(parent)) directories.Add(parent);
        return this;
    }

    public FakeProbe Directory(string path)
    {
        for (var dir = (string?)path; dir != null; dir = WinPath.Parent(dir)) directories.Add(dir);
        return this;
    }

    /// <summary>비트 설치 모양(필요한 파일 셋)을 root 아래에 만든다. skip에 적은 파일은 빼고.</summary>
    public FakeProbe Install(string root, params string[] skip)
    {
        foreach (var file in BitInstallRules.RequiredFiles)
        {
            if (skip.Contains(file, StringComparer.OrdinalIgnoreCase)) continue;
            File(WinPath.Combine(root, file));
        }
        return Directory(root);
    }

    public FakeProbe NetworkDrive(string driveRoot)
    {
        networkDrives.Add(driveRoot);
        return this;
    }

    public FakeProbe Environment(string? path, string? bin, string systemDrive = @"C:\")
    {
        environments[BitInstallRules.EnvironmentFile(systemDrive)] = new BitEnvironment(path, bin);
        return this;
    }

    public bool FileExists(string path) => files.Contains(path);

    public bool DirectoryExists(string path) => directories.Contains(path);

    public bool IsNetworkDrive(string driveRoot) => networkDrives.Contains(driveRoot);

    public BitEnvironment? ReadEnvironment(string file)
    {
        EnvironmentReads.Add(file);
        return environments.TryGetValue(file, out var value) ? value : null;
    }
}

/// <summary>돌린 SQL·매개변수를 적어 두는 가짜 DB. 답은 SQL 상수마다 정해 둔다. 정하지 않은 SQL은 READ-FAILED.</summary>
internal class FakeDb : IBitDb
{
    private readonly Dictionary<string, Func<IReadOnlyDictionary<string, object?>, IEnumerable<object?[]>>> answers =
        new Dictionary<string, Func<IReadOnlyDictionary<string, object?>, IEnumerable<object?[]>>>(StringComparer.Ordinal);

    public List<(string Sql, Dictionary<string, object?> Args, TimeSpan Timeout)> Calls { get; } =
        new List<(string Sql, Dictionary<string, object?> Args, TimeSpan Timeout)>();

    public FakeDb Answer(string sql, Func<IReadOnlyDictionary<string, object?>, IEnumerable<object?[]>> rows)
    {
        answers[sql] = rows;
        return this;
    }

    public FakeDb Answer(string sql, params string?[] firstColumn) =>
        Answer(sql, _ => firstColumn.Select(value => new object?[] { value }).ToArray());

    public FakeDb Fail(string sql, string code)
    {
        answers[sql] = _ => throw new BitException(code);
        return this;
    }

    /// <summary>원본 시험의 가짜 병원 하나: 사용자 범위 SYNTHETIC, 기관기호 12345678, DB 안 범위도 SYNTHETIC 하나.</summary>
    public static T Hospital<T>(T db, string scope = Synthetic.Scope, string institution = Synthetic.Institution) where T : FakeDb
    {
        db.Answer(Sql.UserScopeSql, scope + " ");
        db.Answer(Sql.ScopesSql, scope);
        db.Answer(Sql.InstitutionSql, institution + " ");
        db.Answer(Sql.SnapshotStateSql, _ => new[] { new object?[] { 0 } });
        return db;
    }

    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        Calls.Add((sql, args.ToDictionary(pair => pair.Key, pair => pair.Value), timeout));
        if (!answers.TryGetValue(sql, out var answer)) throw new BitException(BitErrors.ReadFailed);
        return answer(args).Select(row => (IReadOnlyList<object?>)row).ToList();
    }

    public IEnumerable<string> Sqls => Calls.Select(call => call.Sql);
}

internal sealed class FakeSession : FakeDb, IBitSession
{
    public FakeSession(BitTarget? target = null)
    {
        Target = target ?? Synthetic.Target();
    }

    public BitTarget Target { get; set; }

    public int Disposed { get; private set; }

    public void Dispose() => Disposed++;
}

internal sealed class FakeLocator : IBitLocator
{
    public string? Root { get; set; } = Synthetic.Root;
    public string? FailCode { get; set; }
    public int Calls { get; private set; }

    public string Find()
    {
        Calls++;
        if (FailCode != null) throw new BitException(FailCode);
        return Root ?? throw new BitException(BitErrors.NotFound);
    }
}

internal sealed class FakeConnector : IBitConnector
{
    public FakeConnector(FakeSession? session = null)
    {
        Session = session ?? FakeDb.Hospital(new FakeSession());
    }

    public FakeSession Session { get; set; }
    public string? FailCode { get; set; }
    public List<string> Opened { get; } = new List<string>();

    public IBitSession Open(string installPath)
    {
        Opened.Add(installPath);
        if (FailCode != null) throw new BitException(FailCode);
        return Session;
    }
}

internal sealed class FakeLogin : IVendorLogin
{
    public VendorUser? User { get; set; } = new VendorUser("SYNUSER", Synthetic.Day(Synthetic.Today));
    public List<string> Calls { get; } = new List<string>();

    public VendorUser? Login(string installPath)
    {
        Calls.Add(installPath);
        return User;
    }
}

internal sealed class FakeConfirm : IConfirmWindow
{
    public bool Answer { get; set; } = true;
    public List<(string Text, TimeSpan Timeout)> Shown { get; } = new List<(string Text, TimeSpan Timeout)>();

    public bool Show(string text, TimeSpan timeout)
    {
        Shown.Add((text, timeout));
        return Answer;
    }
}

/// <summary>
/// 가짜 비트 통계 화면(TASK-8). 표는 key마다 정해 둔 줄(머리 줄 + 자료 줄, 비트 화면 표시 글자)을 준다.
/// 메뉴 파일은 원본 BITSTATISTICS.Xml 모양을 흉내 낸 지어낸 것이다(83·47 보이는 항목).
/// </summary>
internal sealed class FakeScreens : IStatsScreens
{
    public static readonly string MenuXml =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<root><RootToolsCollection><t href=\"#ref-1\"/><t href=\"#ref-3\"/><t href=\"#ref-4\"/><t href=\"#ref-5\"/></RootToolsCollection>" +
        "<PopupMenuTool id=\"ref-1\"><Key>CONSUME</Key><SharedProps href=\"#ref-10\"/><Tools href=\"#ref-11\"/></PopupMenuTool>" +
        "<SharedProps id=\"ref-10\"><Caption>소모 통계(C)</Caption></SharedProps>" +
        "<Tools id=\"ref-11\"><t href=\"#ref-3\"/><t href=\"#ref-4\"/><t href=\"#ref-5\"/></Tools>" +
        "<ButtonTool id=\"ref-3\"><Key>83</Key><SharedProps href=\"#ref-12\"/></ButtonTool>" +
        "<SharedProps id=\"ref-12\"><Caption>전산자료 추출통계</Caption></SharedProps>" +
        "<ButtonTool id=\"ref-4\"><Key>47</Key><SharedProps href=\"#ref-13\"/></ButtonTool>" +
        "<SharedProps id=\"ref-13\"><Caption>처방별 환자 목록</Caption><Visible>True</Visible></SharedProps>" +
        "<ButtonTool id=\"ref-5\"><Key>99</Key><SharedProps href=\"#ref-14\"/></ButtonTool>" +
        "<SharedProps id=\"ref-14\"><Caption>숨긴 통계</Caption><Visible>false</Visible></SharedProps>" +
        "</root>";

    public byte[] Menu { get; set; } = Encoding.UTF8.GetBytes(MenuXml);

    public string? MenuFail { get; set; }

    /// <summary>key → 표(줄마다 칸 글자). 없으면 빈 표.</summary>
    public Dictionary<string, List<string[]>> Sheets { get; } = new Dictionary<string, List<string[]>>(StringComparer.Ordinal);

    /// <summary>key → 그 표를 읽을 때 던질 오류 번호.</summary>
    public Dictionary<string, string> Fail { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    public List<(string Install, VendorUser User, string Key, DateTime From, DateTime To, TimeSpan Timeout)> Calls { get; } =
        new List<(string Install, VendorUser User, string Key, DateTime From, DateTime To, TimeSpan Timeout)>();

    public List<string> MenuReads { get; } = new List<string>();

    public byte[] ReadMenu(string installPath)
    {
        MenuReads.Add(installPath);
        if (MenuFail != null) throw new BitException(MenuFail);
        return Menu;
    }

    public IReadOnlyList<IReadOnlyList<string>> Read(string installPath, VendorUser user, StatsScreen screen, DateTime from, DateTime to, TimeSpan timeout)
    {
        Calls.Add((installPath, user, screen.Key, from, to, timeout));
        if (Fail.TryGetValue(screen.Key, out var code)) throw new BitException(code);
        return Sheets.TryGetValue(screen.Key, out var rows) ? rows.Select(row => (IReadOnlyList<string>)row).ToList() : new List<IReadOnlyList<string>>();
    }
}

/// <summary>가짜 암호화: 머리 "FAKE" + 바이트 뒤집기(XOR). 머리가 틀리면 CryptographicException(DPAPI처럼).</summary>
internal sealed class FakeProtector : IProtector
{
    private static readonly byte[] Mark = Encoding.ASCII.GetBytes("FAKE");

    public byte[] Protect(byte[] plain) => Mark.Concat(plain.Select(b => (byte)(b ^ 0x5A))).ToArray();

    public byte[] Unprotect(byte[] cipher)
    {
        if (cipher.Length < Mark.Length || !cipher.Take(Mark.Length).SequenceEqual(Mark)) throw new CryptographicException("fake");
        return cipher.Skip(Mark.Length).Select(b => (byte)(b ^ 0x5A)).ToArray();
    }
}

/// <summary>시험마다 지우는 임시 폴더.</summary>
internal sealed class TempFolder : IDisposable
{
    public TempFolder()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "precheck-bit-" + Guid.NewGuid().ToString("N"));
    }

    public string Path { get; }

    public void Dispose()
    {
        if (System.IO.Directory.Exists(Path)) System.IO.Directory.Delete(Path, true);
    }
}

/// <summary>가짜들을 묶은 도우미 부품 한 벌.</summary>
internal sealed class Rig : IDisposable
{
    private readonly TempFolder folder = new TempFolder();
    private int nextId;

    public Rig()
    {
        Store = new RegistrationStore(folder.Path, Protector);
        Services = new BitServices(Locator, Connector, Login, Confirm, Store, () => Today, NewProfileId, Screens);
    }

    /// <summary>가짜 비트 통계 화면(claim.month의 83·83D·47 표, TASK-8).</summary>
    public FakeScreens Screens { get; } = new FakeScreens();

    public FakeLocator Locator { get; } = new FakeLocator();
    public FakeConnector Connector { get; } = new FakeConnector();
    public FakeLogin Login { get; } = new FakeLogin();
    public FakeConfirm Confirm { get; } = new FakeConfirm();
    public FakeProtector Protector { get; } = new FakeProtector();
    public RegistrationStore Store { get; }
    public BitServices Services { get; }
    public DateTime Today { get; set; } = Synthetic.Today;
    public string Folder => folder.Path;
    public FakeSession Session => Connector.Session;

    public List<string> IssuedIds { get; } = new List<string>();

    private string NewProfileId()
    {
        var id = (++nextId).ToString("x32", System.Globalization.CultureInfo.InvariantCulture);
        IssuedIds.Add(id);
        return id;
    }

    public Rig Registered(HospitalRegistration? registration = null)
    {
        Store.Save(registration ?? Synthetic.Registration());
        return this;
    }

    public void Dispose() => folder.Dispose();
}
