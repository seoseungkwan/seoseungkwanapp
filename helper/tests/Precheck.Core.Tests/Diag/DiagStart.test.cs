using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Diag;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Diag;

/// <summary>
/// 켜는 길(specs/diag-read-speed TASK-4). Precheck.Windows·Precheck.Helper는 이 서버에서 돌릴 수 없어 글자로 본다.
/// 실제 동작은 Actions 빌드와 의원 PC에서만 증명된다.
/// </summary>
public class DiagStartTests
{
    private static string Read(params string[] parts) => File.ReadAllText(Repo.PathOf(parts));

    private static string Program() => Read("helper", "src", "Precheck.Helper", "Program.cs");

    private static string BitDb() => Read("helper", "src", "Precheck.Windows", "DiagBitDb.cs");

    private static string Entry() => Read("helper", "src", "Precheck.Windows", "DiagEntry.cs");

    private static string StartCmd() => Read("helper", "install", "speed-check.cmd");

    private static string StartPs1() => Read("helper", "install", "speed-check.ps1");

    private static IEnumerable<string> DiagSources()
    {
        var core = Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Core", "Diag"), "*.cs");
        var windows = Directory.GetFiles(Repo.PathOf("helper", "src", "Precheck.Windows"), "Diag*.cs");
        return core.Concat(windows);
    }

    private static string CodeOnly(string source) =>
        string.Join("\n", source.Split('\n').Where(line => !line.TrimStart().StartsWith("//", StringComparison.Ordinal)));

    [Fact(DisplayName = "AC-801.4 측정 코드는 예외 글·PC·서버·DB·설치 위치 이름을 쓰지 않는다")]
    public void DiagSourcesAvoidTextThatCouldLeak()
    {
        var sources = DiagSources().ToList();
        Assert.Contains(sources, path => path.EndsWith("DiagBitDb.cs", StringComparison.Ordinal));
        Assert.Contains(sources, path => path.EndsWith("DiagEntry.cs", StringComparison.Ordinal));
        Assert.Contains(sources, path => path.EndsWith("DiagRunner.cs", StringComparison.Ordinal));

        foreach (var path in sources)
        {
            var source = File.ReadAllText(path);
            Assert.DoesNotMatch(@"\.(Message|StackTrace|InnerException|Source|Procedure|Errors|Server|Database|InstallPath)\b", source);
            Assert.DoesNotMatch(@"\b(MachineName|UserName)\b", source);
            Assert.DoesNotMatch(@"(?<!System)\.Data\b", source);
            // 예외 변수를 글자로 만들지 않는다
            Assert.DoesNotMatch(@"\be\s*\.\s*ToString\b|\+\s*e\b(?!\s*\.)|\{\s*e\s*[:}]", source);
            // 예외에서 쓰는 것은 번호·종류·형 이름뿐이다. catch 변수 이름은 e로 고정해 이 검사가 빠지지 않게 한다
            Assert.DoesNotMatch(@"catch\s*\(\s*[\w.]+\s+(?!e\s*\))\w+\s*\)", source);
            foreach (Match use in Regex.Matches(source, @"\be\s*\.\s*(\w+)"))
            {
                Assert.Contains(use.Groups[1].Value, new[] { "Number", "Code", "SqlNumber", "GetType" });
            }
        }
    }

    [Fact(DisplayName = "AC-802.5 DiagBitDb는 Commit이 없고 관문·트랜잭션·Rollback·풀 끔으로 SqlBitDb와 같은 길을 간다")]
    public void BitDbKeepsTheReadOnlyRoute()
    {
        var source = BitDb();
        // ReadCommitted(격리 수준 이름)는 되고 Commit 호출·낱말은 안 된다
        Assert.DoesNotMatch(@"\bCommit", source);
        Assert.Contains("ReadOnlyConnection.Create(", source);
        Assert.Contains("Pooling = false", source);
        Assert.Contains("ReadOnlyGuard.Require(sql, args)", source);
        Assert.Contains("transaction.Rollback()", source);
        Assert.Contains("BeginTransaction(snapshot ? IsolationLevel.Snapshot : IsolationLevel.ReadCommitted)", source);

        // 스냅숏 상태를 뺀 모든 SqlCommand는 세션 트랜잭션으로 만든다
        var commands = Regex.Matches(source, @"new SqlCommand\(([^)]*)\)").Cast<Match>().Select(m => m.Groups[1].Value).ToList();
        Assert.Equal(new[] { "Sql.SnapshotStateSql, connection", "sql, connection, transaction" }, commands.OrderBy(text => text, StringComparer.Ordinal));
        Assert.True(source.IndexOf("ReadOnlyGuard.Require(sql, args)", StringComparison.Ordinal) < source.IndexOf("new SqlCommand(sql, connection, transaction)", StringComparison.Ordinal));

        // 매개변수는 관문의 표대로만 붙이고 SQL 글자를 만들지 않는다
        Assert.Contains("Sql.ParametersOf(sql)", source);
        Assert.DoesNotMatch(@"sql\s*\+|\+\s*sql|string\.Format|\$""", source);
        Assert.DoesNotContain("SqlBulkCopy", source);
        Assert.DoesNotContain("ExecuteNonQuery", source);
    }

    [Fact(DisplayName = "AC-806.1 DiagBitDb는 줄을 받는 동안에도 시계를 보고 넘으면 Cancel 뒤 시간 초과(-2)로 적는다")]
    public void BitDbStopsSlowReads()
    {
        var source = BitDb();
        Assert.Contains("CommandTimeout = ReadOnlyConnection.Seconds(timeout)", source);
        Assert.Contains("clock.Elapsed > timeout", source);
        Assert.Contains("command.Cancel()", source);
        Assert.Contains("DiagFormat.TimeoutNumber", source);
        Assert.Contains("e.Number", source);
        Assert.Equal(-2, DiagFormat.TimeoutNumber);
    }

    [Theory(DisplayName = "AC-803.1 인자가 정확히 하나이고 입력이 콘솔일 때만 측정 모드다")]
    [InlineData(new[] { "--diag-read-speed" }, false, true)]
    [InlineData(new[] { "--diag-read-speed" }, true, false)]
    [InlineData(new[] { "chrome-extension://abcdefghijklmnopabcdefghijklmnop/" }, false, false)]
    [InlineData(new[] { "chrome-extension://abcdefghijklmnopabcdefghijklmnop/", "--parent-window=1234" }, false, false)]
    [InlineData(new[] { "chrome-extension://abcdefghijklmnopabcdefghijklmnop/", "--diag-read-speed" }, false, false)]
    [InlineData(new[] { "--diag-read-speed", "--parent-window=1234" }, false, false)]
    [InlineData(new[] { "--DIAG-READ-SPEED" }, false, false)]
    [InlineData(new[] { "--diag-read-speed " }, false, false)]
    [InlineData(new[] { "" }, false, false)]
    [InlineData(new string[0], false, false)]
    public void ModeArgument(string[] args, bool inputRedirected, bool expected) =>
        Assert.Equal(expected, DiagMode.IsRequested(args, () => inputRedirected));

    [Fact(DisplayName = "AC-803.1 인자가 안 맞으면 콘솔 쪽 값을 묻지 않는다")]
    public void ModeDoesNotTouchTheConsoleUnlessAsked()
    {
        var asked = 0;
        Func<bool> ask = () =>
        {
            asked++;
            return false;
        };
        Assert.False(DiagMode.IsRequested(null, ask));
        Assert.False(DiagMode.IsRequested(new[] { "chrome-extension://abcdefghijklmnopabcdefghijklmnop/", "--parent-window=1" }, ask));
        Assert.Equal(0, asked);
        Assert.True(DiagMode.IsRequested(new[] { DiagMode.Flag }, ask));
        Assert.Equal(1, asked);
        Assert.Equal("--diag-read-speed", DiagMode.Flag);
    }

    [Fact(DisplayName = "AC-803.2 Program.cs의 측정 분기는 Console.SetOut 앞 한 곳이고 일반 시작 줄은 그대로다")]
    public void ProgramBranchesBeforeSilencingTheConsole()
    {
        var code = CodeOnly(Program());
        Assert.Single(Regex.Matches(code, @"DiagMode\.IsRequested\(").Cast<Match>());
        Assert.Contains("IsRequested(args, () => Console.IsInputRedirected)", code);
        Assert.Contains("return Precheck.Windows.DiagEntry.Run(HelperServices.Create);", code);

        var main = code.IndexOf("private static int Main(string[] args)", StringComparison.Ordinal);
        var branch = code.IndexOf("DiagMode.IsRequested(", StringComparison.Ordinal);
        var setOut = code.IndexOf("Console.SetOut(TextWriter.Null);", StringComparison.Ordinal);
        Assert.True(main >= 0 && main < branch && branch < setOut);

        // 일반 시작 줄
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
            "using var input = Console.OpenStandardInput();",
            "using var output = Console.OpenStandardOutput();",
            "return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);",
        };
        var positions = normal.Select(text => lines.IndexOf(text)).ToList();
        Assert.DoesNotContain(-1, positions);
        Assert.Equal(positions.OrderBy(position => position), positions);
    }

    [Fact(DisplayName = "AC-803.2 Core·Windows에서 콘솔에 쓰는 코드는 측정 입구 DiagEntry.cs뿐이다")]
    public void ConsoleWritesStayInTheEntry()
    {
        var files = new[] { "Precheck.Core", "Precheck.Windows" }
            .SelectMany(project => Directory.GetFiles(Repo.PathOf("helper", "src", project), "*.cs", SearchOption.AllDirectories))
            .Where(path => path.IndexOf(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar, StringComparison.Ordinal) < 0
                        && path.IndexOf(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar, StringComparison.Ordinal) < 0)
            .ToList();
        Assert.NotEmpty(files);
        var writers = files.Where(path => Regex.IsMatch(File.ReadAllText(path), @"\bConsole\s*\.\s*(Write|WriteLine|Out|Error|OpenStandardOutput)\b")).ToList();
        Assert.EndsWith("DiagEntry.cs", Assert.Single(writers), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-803.3 측정 인자를 메시지 고리에 주면 origin 검사로 거절되어 아무것도 읽지 않는다")]
    public void FlagIsRejectedByTheMessageLoop()
    {
        var table = CommandTable.LoadEmbedded();
        var logged = new List<string?>();
        var dispatcher = new Dispatcher(table, (_, _) => { });
        using var input = new MemoryStream(new byte[] { 1, 0, 0, 0, 0x7B });
        using var output = new MemoryStream();

        var exit = MessageLoop.Run(new[] { DiagMode.Flag }, input, output, table, dispatcher, (_, code) => logged.Add(code));

        Assert.Equal(MessageLoop.ExitRejected, exit);
        Assert.Equal(0, input.Position);
        Assert.Equal(0, output.Length);
        Assert.Equal(new[] { ErrorCodes.Rejected }, logged);
    }

    [Fact(DisplayName = "AC-803.3 크롬 등록 틀과 도우미 판은 그대로다")]
    public void ManifestAndVersionStay()
    {
        var manifest = Read("helper", "install", "host-manifest.json");
        Assert.Contains("\"__HELPER_EXE__\"", manifest);
        Assert.DoesNotContain("diag", manifest, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("<Version>0.2.0</Version>", Read("helper", "Directory.Build.props"));
    }

    [Fact(DisplayName = "AC-804.1 speed-check.cmd는 ASCII이고 실패 길마다 멈추며 exe를 직접 켠다")]
    public void StartCmdFile()
    {
        var bytes = File.ReadAllBytes(Repo.PathOf("helper", "install", "speed-check.cmd"));
        Assert.All(bytes, value => Assert.True(value < 0x80));

        var lines = StartCmd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(5, lines.Length);
        Assert.StartsWith("@if not exist \"%~dp0speed-check.ps1\" (", lines[0], StringComparison.Ordinal);
        Assert.Contains("pause", lines[0]);
        Assert.Contains("exit /b 1", lines[0]);
        Assert.Equal("@powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0speed-check.ps1\"", lines[1]);
        Assert.Equal("@if errorlevel 1 exit /b 1", lines[2]);
        Assert.Equal("@\"%~dp0app\\PrecheckHelper.exe\" --diag-read-speed", lines[3]);
        Assert.Equal("@if errorlevel 1 pause", lines[4]);
    }

    [Fact(DisplayName = "AC-804.1 speed-check.ps1은 BOM이고 표시만 지우며 설치 폴더·레지스트리를 건드리지 않는다")]
    public void StartPs1File()
    {
        var bytes = File.ReadAllBytes(Repo.PathOf("helper", "install", "speed-check.ps1"));
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes.Take(3).ToArray());

        var source = Encoding.UTF8.GetString(bytes);
        Assert.Contains("try {", source);
        Assert.Contains("catch {", source);
        Assert.Contains("Read-Host", source);
        Assert.Contains("exit 1", source);
        Assert.Contains("Get-ChildItem -LiteralPath $app -File | Unblock-File", source);
        Assert.Contains("모두 압축 풀기", source);
        Assert.DoesNotMatch(@"Copy-Item|Set-ItemProperty|New-Item|Remove-Item|Stop-Process|Move-Item|LOCALAPPDATA|HKCU|HKLM|\$_\.Exception", source);
    }

    [Fact(DisplayName = "AC-804.2 zip 단계의 helper/install/* 묶기로 두 파일이 들어가고 workflow 글자에는 측정이 없다")]
    public void WorkflowPacksTheStartFiles()
    {
        var workflow = Read(".github", "workflows", "helper.yml");
        Assert.Contains("Copy-Item -Path 'helper/install/*' -Destination $stage", workflow);
        Assert.DoesNotContain("speed-check", workflow);
        Assert.DoesNotContain("diag", workflow, StringComparison.OrdinalIgnoreCase);
        Assert.True(File.Exists(Repo.PathOf("helper", "install", "speed-check.cmd")));
        Assert.True(File.Exists(Repo.PathOf("helper", "install", "speed-check.ps1")));
    }

    [Fact(DisplayName = "AC-805.3 DiagEntry는 경로를 시작과 끝에 쓰고 메모장으로 연 뒤 엔터를 기다리며 예외 글은 쓰지 않는다")]
    public void EntryShowsThePathAndOpensNotepad()
    {
        var source = Entry();
        Assert.Contains("\"notepad.exe\"", source);
        Assert.Contains("Console.ReadLine()", source);
        Assert.Contains("GetType().Name", source);

        // 재는 동안 눌린 엔터가 쌓여 있으면 마지막 안내에서 창이 바로 닫힌다. 쌓인 입력을 비운 뒤 기다린다
        var drain = source.IndexOf("while (Console.KeyAvailable) Console.ReadKey(true);", StringComparison.Ordinal);
        Assert.True(drain >= 0 && drain < source.LastIndexOf("Console.ReadLine()", StringComparison.Ordinal));

        // 시작(실행 전)과 끝(실행 뒤) 두 번, 감시 쪽 한 번
        var run = source.IndexOf(".Run();", StringComparison.Ordinal);
        var shows = Regex.Matches(source, @"ShowPath\(path\)").Cast<Match>().Select(m => m.Index).ToList();
        Assert.Equal(3, shows.Count);
        Assert.Contains(shows, index => index < run);
        Assert.Contains(shows, index => index > run);
    }

    [Fact(DisplayName = "AC-805.4 시작 안내를 보이고 엔터를 누른 뒤에야 시계·감시·측정이 시작된다")]
    public void EntryWaitsForEnterBeforeTheClockStarts()
    {
        var source = Entry();
        Assert.Contains("진료가 끝난 뒤 켜세요", source);
        Assert.Contains("비트가 느려지면 이 창을 닫으세요", source);
        Assert.Contains("대시보드 탭은 닫아 두세요", source);
        Assert.Contains("창 안을 누르지 마세요", source);

        var enter = source.IndexOf("Console.ReadLine()", StringComparison.Ordinal);
        var clock = source.IndexOf("Stopwatch.StartNew()", StringComparison.Ordinal);
        var watchdog = source.IndexOf("Watchdog", source.IndexOf("new Timer", StringComparison.Ordinal), StringComparison.Ordinal);
        var run = source.IndexOf(".Run();", StringComparison.Ordinal);
        Assert.True(enter >= 0 && enter < clock && clock < watchdog && watchdog < run);

        // 보고서의 started는 DiagRunner가 Run을 시작할 때 읽는다(엔터 뒤)
        Assert.Contains("() => DateTime.Now", source);
    }

    [Fact(DisplayName = "AC-806.7 45분 감시는 end watchdog을 쓰고 닫은 뒤 경로 출력·메모장을 하고 끝낸다")]
    public void EntryHasAWatchdog()
    {
        var source = Entry();
        Assert.Contains("TimeSpan.FromMinutes(45)", source);
        var line = source.IndexOf("report.Line(\"end watchdog\")", StringComparison.Ordinal);
        var close = source.IndexOf("stream.Dispose()", line, StringComparison.Ordinal);
        var show = source.IndexOf("ShowPath(path)", line, StringComparison.Ordinal);
        var notepad = source.IndexOf("OpenNotepad(path)", line, StringComparison.Ordinal);
        var exit = source.IndexOf("Environment.Exit(", line, StringComparison.Ordinal);
        Assert.True(line >= 0 && line < close && close < show && show < notepad && notepad < exit);

        // 콘솔 쓰기가 막혀도(창 안을 눌러 선택 모드) 메모장과 종료까지 간다: 콘솔 쓰기는 기다림에 한도가 있는 별도 스레드에서 한다
        var thread = source.IndexOf("new Thread(", line, StringComparison.Ordinal);
        var join = source.IndexOf(".Join(", line, StringComparison.Ordinal);
        Assert.True(thread >= 0 && thread < show && show < join && join < notepad);
        Assert.Contains("IsBackground = true", source);
    }

    [Fact(DisplayName = "AC-806.7 창 안을 눌러 측정이 멈추지 않게 시작할 때 빠른 편집을 끄고, 못 꺼도 계속된다")]
    public void EntryTurnsOffQuickEdit()
    {
        var source = Entry();
        Assert.Contains("0x0040", source);
        Assert.Contains("SetConsoleMode(", source);
        Assert.Contains("GetConsoleMode(", source);
        var off = source.IndexOf("TurnOffQuickEdit();", StringComparison.Ordinal);
        var notice = source.IndexOf("ShowNotice();", StringComparison.Ordinal);
        Assert.True(off >= 0 && off < notice);
        // 돌려받은 값으로 멈추거나 던지지 않는다
        Assert.DoesNotMatch(@"Marshal\.ThrowExceptionForHR|Win32Exception\(", source);
    }
}
