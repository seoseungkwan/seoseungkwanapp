using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception.Check;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 확인 명령 입구(spec reception-phone TASK-6, REQ-1401): 인자 분기(CheckMode)·윈도우 세션(CheckBitDb)·입구(ReceptionCheckEntry)·시작 파일.
/// Precheck.Windows·Precheck.Helper는 이 서버에서 돌릴 수 없어 글자로 보고, 컴파일은 vitest 감싸개가 buildDotnet(net48)으로 본다.
/// 진짜 비트에서 도는지(AC-1401.13)는 의원 PC에서만 증명된다.
/// </summary>
public class CheckStartTests
{
    private const string Origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

    private static string Read(params string[] parts) => File.ReadAllText(Repo.PathOf(parts));

    private static string Program() => Read("helper", "src", "Precheck.Helper", "Program.cs");

    private static string BitDb() => Read("helper", "src", "Precheck.Windows", "CheckBitDb.cs");

    private static string Entry() => Read("helper", "src", "Precheck.Windows", "ReceptionCheckEntry.cs");

    private static string StartCmd() => Read("helper", "install", "reception-check.cmd");

    /// <summary>// 주석 줄을 뺀 코드.</summary>
    private static string CodeOnly(string source) =>
        string.Join("\n", source.Split('\n').Where(line => !line.TrimStart().StartsWith("//", StringComparison.Ordinal)));

    /// <summary>/// 문서 주석·// 주석을 뺀 코드(낱말 검사가 설명 글에 걸리지 않게).</summary>
    private static string Statements(string source) =>
        Regex.Replace(CodeOnly(source), @"//.*$", "", RegexOptions.Multiline);

    private static int At(string source, string text, int from = 0)
    {
        var index = source.IndexOf(text, from, StringComparison.Ordinal);
        Assert.True(index >= 0, "글자가 없다: " + text);
        return index;
    }

    private static bool IsRequested(string[]? args, bool stdinIsConsole) => CheckMode.IsRequested(args, stdinIsConsole);

    // ── AC-1401.1 인자 분기·시작 파일 ─────────────────────────────

    [Theory(DisplayName = "AC-1401.1 인자가 정확히 --reception-check 하나이고 표준 입력이 콘솔일 때만 확인 모드다(크롬 모양·대소문자·둘째 인자·입력 파이프는 아니다)")]
    [InlineData(new[] { "--reception-check" }, true, true)]
    [InlineData(new[] { "--reception-check" }, false, false)]
    [InlineData(new[] { Origin }, true, false)]
    [InlineData(new[] { Origin }, false, false)]
    [InlineData(new[] { Origin, "--parent-window=1234" }, true, false)]
    [InlineData(new[] { Origin, "--reception-check" }, true, false)]
    [InlineData(new[] { "--reception-check", "--parent-window=1234" }, true, false)]
    [InlineData(new[] { "--reception-check", "--reception-check" }, true, false)]
    [InlineData(new[] { "--parent-window=1234" }, true, false)]
    [InlineData(new[] { "--RECEPTION-CHECK" }, true, false)]
    [InlineData(new[] { "--Reception-Check" }, true, false)]
    [InlineData(new[] { "--reception-check " }, true, false)]
    [InlineData(new[] { " --reception-check" }, true, false)]
    [InlineData(new[] { "--reception-check\n" }, true, false)]
    [InlineData(new[] { "-reception-check" }, true, false)]
    [InlineData(new[] { "--diag-read-speed" }, true, false)]
    [InlineData(new[] { "" }, true, false)]
    [InlineData(new string[0], true, false)]
    public void ModeArgument(string[] args, bool stdinIsConsole, bool expected) =>
        Assert.Equal(expected, IsRequested(args, stdinIsConsole));

    [Fact(DisplayName = "AC-1401.1 인자가 없으면(null)·인자 안에 null이 있으면 확인 모드가 아니고 깃발 글자는 --reception-check다")]
    public void ModeArgumentNullAndFlag()
    {
        Assert.False(IsRequested(null, true));
        Assert.False(IsRequested(new string[] { null! }, true));
        Assert.Equal("--reception-check", CheckMode.Flag);
    }

    [Fact(DisplayName = "AC-1401.1 Program.cs의 확인 분기는 Main 첫 줄, Console.SetOut 앞 한 곳이고 일반 시작 줄은 그대로다")]
    public void ProgramBranchesBeforeSilencingTheConsole()
    {
        var code = CodeOnly(Program());
        Assert.Single(Regex.Matches(code, @"CheckMode\.IsRequested\(").Cast<Match>());
        Assert.Single(Regex.Matches(code, @"ReceptionCheckEntry\.Run\(").Cast<Match>());
        Assert.Contains("CheckMode.IsRequested(args, !Console.IsInputRedirected)) return Precheck.Windows.ReceptionCheckEntry.Run(HelperServices.Create);", code);

        var main = At(code, "private static int Main(string[] args)");
        var open = At(code, "{", main);
        var branch = At(code, "CheckMode.IsRequested(", main);
        var setOut = At(code, "Console.SetOut(TextWriter.Null);", main);
        Assert.True(main < branch && branch < setOut);
        // 분기 앞에는 다른 문장이 없다(콘솔·로그·명령 표를 건드리기 전)
        Assert.Matches(@"^\s*if \(\S*CheckMode\.IsRequested\($", code.Substring(open + 1, branch + "CheckMode.IsRequested(".Length - open - 1));

        // 일반 시작 줄(크롬이 켜는 길)은 그대로, 같은 차례로
        var lines = code.Split('\n').Select(line => line.Trim()).ToList();
        var normal = new[]
        {
            "Console.SetOut(TextWriter.Null);",
            "Console.SetError(TextWriter.Null);",
            "var log = new DiagnosticLog();",
            "var table = CommandTable.LoadEmbedded();",
            "var dispatcher = new Dispatcher(table, log.Write);",
            "Hello.Register(dispatcher, table);",
            "BitCommands.Register(dispatcher, HelperServices.Create());",
            "Precheck.Core.Stats.StatsCommands.Register(dispatcher, HelperServices.Create());",
            "RevenueCommands.Register(dispatcher, HelperServices.Create());",
            "ContactCommands.RegisterTargets(dispatcher, HelperServices.Create());",
            "HelperStore.Register(dispatcher);",
            "var signal = new HostSignal();",
            "using var stdin = Console.OpenStandardInput();",
            "using var input = new StdinPump(stdin, signal);",
            "using var output = Console.OpenStandardOutput();",
            "return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);",
        };
        var positions = normal.Select(text => lines.IndexOf(text)).ToList();
        Assert.DoesNotContain(-1, positions);
        Assert.Equal(positions.OrderBy(position => position), positions);
    }

    [Fact(DisplayName = "AC-1401.1 확인 깃발을 메시지 통로에 주면 origin 검사가 거절해 아무것도 읽고 쓰지 않는다(크롬 길은 지금 그대로)")]
    public void FlagIsRejectedByTheMessageLoop()
    {
        var table = CommandTable.LoadEmbedded();
        var logged = new List<string?>();
        var dispatcher = new Dispatcher(table, (_, _) => { });
        using var input = new MemoryStream(new byte[] { 1, 0, 0, 0, 0x7B });
        using var output = new MemoryStream();

        var exit = MessageLoop.Run(new[] { "--reception-check" }, input, output, table, dispatcher, (_, code) => logged.Add(code));

        Assert.Equal(MessageLoop.ExitRejected, exit);
        Assert.Equal(0, input.Position);
        Assert.Equal(0, output.Length);
        Assert.Equal(new[] { ErrorCodes.Rejected }, logged);
    }

    [Fact(DisplayName = "AC-1401.1 reception-check.cmd는 ASCII이고 푼 폴더를 확인한 뒤 설치 없이 app\\PrecheckHelper.exe --reception-check를 직접 켠다")]
    public void StartCmdFile()
    {
        var bytes = File.ReadAllBytes(Repo.PathOf("helper", "install", "reception-check.cmd"));
        Assert.All(bytes, value => Assert.True(value < 0x80));

        var lines = StartCmd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(5, lines.Length);
        Assert.StartsWith("@if not exist \"%~dp0reception-check.ps1\" (", lines[0], StringComparison.Ordinal);
        Assert.Contains("reception-check.cmd", lines[0]);
        Assert.Contains("pause", lines[0]);
        Assert.Contains("exit /b 1", lines[0]);
        Assert.Equal("@powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0reception-check.ps1\"", lines[1]);
        Assert.Equal("@if errorlevel 1 exit /b 1", lines[2]);
        Assert.Equal("@\"%~dp0app\\PrecheckHelper.exe\" --reception-check", lines[3]);
        Assert.Equal("@if errorlevel 1 pause", lines[4]);
        Assert.DoesNotMatch(@"(?i)install|reg(\.exe)?\s|LOCALAPPDATA|HKCU|HKLM", StartCmd());
    }

    [Fact(DisplayName = "AC-1401.1 reception-check.ps1은 UTF-8 BOM이고 app\\의 인터넷 표시만 지우며 설치 폴더·레지스트리를 건드리지 않는다")]
    public void StartPs1File()
    {
        var bytes = File.ReadAllBytes(Repo.PathOf("helper", "install", "reception-check.ps1"));
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes.Take(3).ToArray());

        var source = Encoding.UTF8.GetString(bytes);
        Assert.Contains("$app = Join-Path $PSScriptRoot 'app'", source);
        Assert.Contains("Test-Path -LiteralPath (Join-Path $app 'PrecheckHelper.exe')", source);
        Assert.Contains("Get-ChildItem -LiteralPath $app -File | Unblock-File", source);
        Assert.Single(Regex.Matches(source, @"Unblock-File").Cast<Match>());
        Assert.Contains("try {", source);
        Assert.Contains("catch {", source);
        Assert.Contains("Read-Host", source);
        Assert.Contains("exit 1", source);
        Assert.Contains("모두 압축 풀기", source);
        Assert.Contains("reception-check.cmd", source);
        Assert.DoesNotMatch(@"Copy-Item|Set-ItemProperty|New-ItemProperty|New-Item|Remove-Item|Stop-Process|Start-Process|Move-Item|LOCALAPPDATA|HKCU|HKLM|Registry|\$_\.Exception", source);
    }

    [Fact(DisplayName = "AC-1401.1 zip 단계의 helper/install/* 묶기로 두 시작 파일이 푼 폴더에 들어가고 크롬 등록 틀에는 확인 명령이 없다")]
    public void WorkflowPacksTheStartFiles()
    {
        var workflow = Read(".github", "workflows", "helper.yml");
        Assert.Contains("Copy-Item -Path 'helper/install/*' -Destination $stage", workflow);
        Assert.True(File.Exists(Repo.PathOf("helper", "install", "reception-check.cmd")));
        Assert.True(File.Exists(Repo.PathOf("helper", "install", "reception-check.ps1")));
        Assert.DoesNotContain("reception", Read("helper", "install", "host-manifest.json"));
        Assert.DoesNotContain("reception-check", Read("helper", "install", "install.ps1"));
    }

    // ── AC-1401.9 실행 전 검사 ───────────────────────────────────

    [Fact(DisplayName = "AC-1401.9 CheckBitDb는 실행 전에 CheckSql.IsAllowed || ProbeSql.IsProbe || Sql.IsAllowed와 그 문장의 매개변수 표를 보고, 틀 밖 글자는 DB에 닿기 전에 막는다")]
    public void BitDbChecksBeforeRunning()
    {
        var source = Statements(BitDb());
        Assert.Contains("CheckSql.IsAllowed(sql)", source);
        Assert.Contains("CheckSql.ParametersOf(sql)", source);
        Assert.Contains("ProbeSql.IsProbe(sql)", source);
        Assert.Contains("ProbeSql.Parameters", source);
        Assert.Contains("Sql.IsAllowed(sql)", source);
        Assert.Contains("ReadOnlyGuard.Require(sql, args)", source);
        Assert.Contains("throw new BitException(BitErrors.ReadFailed)", source);
        // 정해 둔 이름이 모두 있고 그 밖은 없다
        Assert.Contains("args.Count != declared.Count", source);

        // Query: 검사 → SqlCommand → 매개변수는 검사가 돌려준 표대로만
        var query = At(source, "public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)");
        var require = At(source, "var declared = Require(sql, args);", query);
        var command = At(source, "new SqlCommand(sql, connection, transaction)", query);
        var bind = At(source, "foreach (var parameter in declared)", query);
        Assert.True(query < require && require < command && command < bind);

        // SQL 글자를 만들지 않는다
        Assert.DoesNotMatch(@"sql\s*\+|\+\s*sql|string\.Format|string\.Concat|\$""", source);
        Assert.DoesNotContain("CommandText", source);
    }

    [Fact(DisplayName = "AC-1401.9 확인 문장·찾기 틀은 확인 모드 세션만 받는다: 도우미 허용 목록(Sql.IsAllowed)·SqlBitDb·ReadOnlyGuard는 받지 않는다")]
    public void HelperSessionRefusesCheckStatements()
    {
        foreach (var sql in CheckSql.All) Assert.False(Sql.IsAllowed(sql));
        var schema = ProbeSchema.From(new IReadOnlyList<object?>[]
        {
            new object?[] { "OcmInf", "OcmNum", "char" },
            new object?[] { "OcmInf", "OcmMemo", "varchar" },
        });
        var probe = ProbeSql.VisitLinked(schema, "OcmInf", "OcmNum", "OcmMemo");
        Assert.True(ProbeSql.IsProbe(probe));
        Assert.False(Sql.IsAllowed(probe));
        Assert.Throws<BitException>(() => ReadOnlyGuard.Require(probe, new Dictionary<string, object?>()));

        foreach (var file in new[] { "SqlBitDb.cs" })
        {
            var source = Statements(Read("helper", "src", "Precheck.Windows", file));
            Assert.DoesNotContain("CheckSql", source);
            Assert.DoesNotContain("ProbeSql", source);
        }
        var guard = Statements(Read("helper", "src", "Precheck.Core", "Bit", "ReadOnlyGuard.cs"));
        Assert.DoesNotContain("CheckSql", guard);
        Assert.DoesNotContain("ProbeSql", guard);
    }

    // ── AC-1401.11 시간 제한·보고서 자리·메모장 ───────────────────

    [Fact(DisplayName = "AC-1401.11 문장 시간 제한: CheckBitDb는 CommandTimeout을 받은 제한으로 두고 줄을 받는 동안에도 시계를 보아 넘으면 Cancel한다")]
    public void BitDbStopsSlowReads()
    {
        var source = Statements(BitDb());
        Assert.Contains("CommandTimeout = ReadOnlyConnection.Seconds(timeout)", source);
        var clock = At(source, "Stopwatch.StartNew()");
        var over = At(source, "clock.Elapsed > timeout", clock);
        var cancel = At(source, "command.Cancel()", over);
        Assert.True(clock < over && over < cancel);
        Assert.Contains("throw new TimeoutException()", source);
    }

    [Fact(DisplayName = "AC-1401.11 입구: 보고서는 푼 폴더(app의 부모) → 임시 폴더에 열고, 끝나면 닫은 뒤 메모장으로 열고 엔터를 기다린다")]
    public void EntryReportPathAndNotepad()
    {
        var source = Statements(Entry());
        var create = At(source, "CheckReport.Create(AppDomain.CurrentDomain.BaseDirectory, Path.GetTempPath(), DateTime.Now)");
        var runner = At(source, "new CheckRunner(", create);
        var run = At(source, ".Run();", runner);
        var dispose = At(source, "report.Dispose();", run);
        var notepad = At(source, "OpenNotepad(report.FilePath);", dispose);
        Assert.True(create < runner && runner < run && run < dispose && dispose < notepad);
        Assert.Contains("\"notepad.exe\"", source);

        // 도는 동안 눌린 엔터가 쌓여 있으면 마지막 안내에서 창이 바로 닫힌다: 비운 뒤 기다린다
        var drain = At(source, "while (Console.KeyAvailable) Console.ReadKey(true);", notepad);
        Assert.True(drain < source.LastIndexOf("Console.ReadLine()", StringComparison.Ordinal));

        // 시계는 진짜 시계(보고서 started·시간 제한은 CheckRunner가 이것으로 잰다)
        Assert.Contains("() => DateTime.Now", source);
        // 실패해도 보고서는 줄마다 디스크에 있다: 경로가 있으면 콘솔에 쓴다
        Assert.Contains("e.GetType().Name", source);
    }

    // ── AC-1401.12 읽기 전용 세션 ────────────────────────────────

    [Fact(DisplayName = "AC-1401.12 CheckBitDb는 ReadOnlyConnection 접속 + 되돌리는 트랜잭션 안에서만 읽고 Commit이 없으며 닫을 때 되돌린다")]
    public void BitDbIsReadOnly()
    {
        var raw = BitDb();
        // ReadCommitted(격리 수준 이름)는 되고 Commit 호출·낱말은 안 된다
        Assert.DoesNotMatch(@"\bCommit", raw);
        var source = Statements(raw);
        Assert.Contains("ReadOnlyConnection.Create(", source);
        Assert.Contains("new SqlConnection(info.ConnectionString)", source);
        Assert.Contains("BeginTransaction(snapshot ? IsolationLevel.Snapshot : IsolationLevel.ReadCommitted)", source);
        Assert.Contains("ReadOnlyGuard.Require(Sql.SnapshotStateSql, NoArgs)", source);

        // 스냅숏 상태를 뺀 모든 SqlCommand는 세션 트랜잭션으로 만든다
        var commands = Regex.Matches(source, @"new SqlCommand\(([^)]*)\)").Cast<Match>().Select(m => m.Groups[1].Value).ToList();
        Assert.Equal(new[] { "Sql.SnapshotStateSql, connection", "sql, connection, transaction" }, commands.OrderBy(text => text, StringComparer.Ordinal));
        Assert.DoesNotContain("ExecuteNonQuery", source);
        Assert.DoesNotContain("SqlBulkCopy", source);
        Assert.DoesNotContain("SaveChanges", source);

        // Dispose: 되돌림 → 트랜잭션 → 연결
        var dispose = At(source, "public void Dispose()");
        var rollback = At(source, "transaction.Rollback();", dispose);
        var closeTransaction = At(source, "transaction.Dispose();", rollback);
        var closeConnection = At(source, "connection.Dispose();", closeTransaction);
        Assert.True(dispose < rollback && rollback < closeTransaction && closeTransaction < closeConnection);
    }

    [Fact(DisplayName = "AC-1401.12 확인 세션은 등록 확인(HospitalGate)을 CheckBitDb로 지나고, 입구는 그 길 말고 DB를 열지 않는다")]
    public void SessionsGoThroughTheGate()
    {
        var db = Statements(BitDb());
        Assert.Contains("class CheckBitConnector : IBitConnector", db);
        Assert.Contains("class CheckBitDb : IBitSession, ICheckSession", db);
        Assert.Contains("HospitalGate.Open(", db);
        Assert.Contains("new CheckBitConnector()", db);
        Assert.Contains("Registration.Scope", db);

        var entry = Statements(Entry());
        Assert.Contains("CheckBitDb.OpenVerified(", entry);
        Assert.DoesNotContain("SqlConnection", entry);
        Assert.DoesNotContain("SqlBitConnector", entry);
        Assert.DoesNotContain("SqlBitDb", entry);
        Assert.DoesNotContain("HospitalGate.Open(", entry);
    }

    // ── AC-1401.13 [의원 PC] 실제 실행은 의원 PC. 여기서는 배선 글자만 ──

    [Fact(DisplayName = "AC-1401.13 [의원 PC] 실제 실행은 의원 PC에서 본다. 여기서는 입구가 CheckRunner에 진짜 콘솔·세션·비트 로그인·화면 83·보고서를 잇는지 글자로만 본다")]
    public void EntryWiresTheRunner()
    {
        var source = Statements(Entry());
        Assert.Contains("public static int Run(Func<BitServices> createServices)", source);
        Assert.Contains("class WindowConsole : ICheckConsole", source);
        Assert.Contains(".Login.Login(", source);
        Assert.Contains("StatsAccess.Check(", source);
        Assert.Contains("StatsScreens.Of(StatsScreens.Symptoms)", source);
        Assert.Contains("StatsScreens.ReadTimeout", source);
        Assert.Contains("HelperVersion.Value", source);
        Assert.Contains("TurnOffQuickEdit();", source);

        // 비트 로그인 창은 사람이 다룬다: 로그인 사용자의 병원 범위·화면 83 권한을 도우미와 같은 규칙으로 본 뒤에만 화면을 읽는다
        var login = At(source, ".Login.Login(");
        var access = At(source, "StatsAccess.Check(", login);
        Assert.True(login < access);
    }

    [Fact(DisplayName = "AC-1401.13 [의원 PC] 붙여 넣을 글에 환자 정보가 없게: 입구·세션은 예외 글·PC·서버·DB 이름을 쓰지 않고 콘솔에는 고정 글·보고서 경로·형 이름만 쓴다")]
    public void EntryAndSessionAvoidTextThatCouldLeak()
    {
        foreach (var path in new[]
        {
            Repo.PathOf("helper", "src", "Precheck.Windows", "CheckBitDb.cs"),
            Repo.PathOf("helper", "src", "Precheck.Windows", "ReceptionCheckEntry.cs"),
            Repo.PathOf("helper", "src", "Precheck.Core", "Reception", "Check", "CheckMode.cs"),
        })
        {
            var source = Statements(File.ReadAllText(path));
            Assert.DoesNotMatch(@"\.(Message|StackTrace|InnerException|Source|Procedure|Errors|Server|Database|DataSource|InitialCatalog)\b", source);
            Assert.DoesNotMatch(@"\b(MachineName|UserName|UserId|WorkDate)\b", source);
            Assert.DoesNotMatch(@"\be\s*\.\s*ToString\b|\+\s*e\b(?!\s*\.)|\{\s*e\s*[:}]", source);
            // catch 변수 이름은 e로 고정하고, 예외에서 쓰는 것은 형 이름뿐이다(번호는 보고서 CheckField가 읽는다)
            Assert.DoesNotMatch(@"catch\s*\(\s*[\w.]+\s+(?!e\s*\))\w+\s*\)", source);
            foreach (Match use in Regex.Matches(source, @"\be\s*\.\s*(\w+)"))
            {
                Assert.Contains(use.Groups[1].Value, new[] { "GetType" });
            }
            Assert.DoesNotContain("File.Write", source);
            Assert.DoesNotContain("Trace.", source);
            Assert.DoesNotContain("Debug.", source);
        }

        // 콘솔에 쓰는 것: CheckRunner가 준 줄(이미 걸러짐) · 고정 글 · 고정 글 + 보고서 경로 · 고정 글 + 형 이름
        var entry = Statements(Entry());
        var writes = Regex.Matches(entry, @"Console\.Write(?:Line)?\((.*)\);").Cast<Match>().Select(m => m.Groups[1].Value.Trim()).ToList();
        Assert.NotEmpty(writes);
        foreach (var argument in writes)
        {
            Assert.Matches(@"^(|line|""[^""]*""|""[^""]*"" \+ (report\.FilePath|path|e\.GetType\(\)\.Name))$", argument);
        }
    }

    [Fact(DisplayName = "AC-1401.13 [의원 PC] 확인 코드(Core/Reception/Check·CheckBitDb)는 콘솔에 직접 쓰지 않는다: 콘솔은 입구 ReceptionCheckEntry.cs의 ICheckConsole 하나다")]
    public void ConsoleWritesStayInTheEntry()
    {
        var files = Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Core", "Reception", "Check"), "*.cs")
            .Concat(new[] { Repo.PathOf("helper", "src", "Precheck.Windows", "CheckBitDb.cs") })
            .ToList();
        Assert.Contains(files, path => path.EndsWith("CheckMode.cs", StringComparison.Ordinal));
        foreach (var path in files)
        {
            Assert.True(File.Exists(path), path);
            Assert.DoesNotMatch(@"\bConsole\s*\.", Statements(File.ReadAllText(path)));
        }
        Assert.Matches(@"\bConsole\s*\.\s*WriteLine\(line\)", Statements(Entry()));
        Assert.Matches(@"\bConsole\s*\.\s*ReadLine\(\)", Statements(Entry()));
    }
}
