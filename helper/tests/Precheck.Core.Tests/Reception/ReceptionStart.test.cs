using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Tests.Protocol;
using Precheck.Core.Tests.Reception.Serve;
using Xunit;
using Xunit.Sdk;

// 이 TASK의 시험만 한 거르기로 돌리려고 Host 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Host;

/// <summary>
/// 늘 켜 두는 프로그램 PrecheckReception.exe(spec reception-phone TASK-26, design.md 9절, REQ-1411·REQ-1412·REQ-1413).
/// 켜는 차례(뮤텍스 → 서버 → --link면 브라우저 → 기다림)는 Core ReceptionStart에 부품을 주입해 본다. 서버 부분은 진짜 ReceptionServer를
/// 루프백 빈 문에 열어 끝까지 본다. Precheck.Reception(net48 WinExe)은 이 서버에서 돌릴 수 없어 글자로 보고, 컴파일·x86·창 없음·
/// 옛 런타임 정책은 vitest 감싸개가 buildDotnet으로 본다. 실제 로그인 시작·방화벽·껐다 켜기는 의원 PC에서만 증명된다.
/// </summary>
public class ReceptionStartTests
{
    // ── ReceptionStart 부르기 ─────────────────────────────────

    private const string MutexName = ReceptionStart.MutexName;

    private const string LinkFlag = ReceptionStart.LinkFlag;

    private const int ExitOk = ReceptionStart.ExitOk;

    private const int ExitFailed = ReceptionStart.ExitFailed;

    private const int ExitPortBusy = ReceptionStart.ExitPortBusy;

    private static string LinkUrl => ReceptionStart.LinkUrl;

    private static bool WantsLink(string[]? args) => ReceptionStart.WantsLink(args);

    private static int RunStart(
        string[]? args, Func<IDisposable?> claim, Func<IDisposable> start, Action<string> open, Action wait, Action<string> note) =>
        new ReceptionStart(claim, start, open, wait, note).Run(args);

    /// <summary>주입한 부품이 불린 차례를 적는 가짜 한 벌.</summary>
    private sealed class Script
    {
        public List<string> Events { get; } = new List<string>();
        public List<string> Notes { get; } = new List<string>();
        public bool AlreadyRunning { get; set; }
        public Exception? ClaimFails { get; set; }
        public Exception? StartFails { get; set; }
        public Exception? OpenFails { get; set; }
        public Exception? WaitFails { get; set; }

        public int Run(params string[] args) => RunStart(args, Claim, Start, Open, Wait, Note);

        private IDisposable? Claim()
        {
            Events.Add("claim");
            if (ClaimFails != null) throw ClaimFails;
            return AlreadyRunning ? null : new Mark(Events, "release");
        }

        private IDisposable Start()
        {
            Events.Add("start");
            if (StartFails != null) throw StartFails;
            return new Mark(Events, "stop");
        }

        private void Open(string url)
        {
            Events.Add("open " + url);
            if (OpenFails != null) throw OpenFails;
        }

        private void Wait()
        {
            Events.Add("wait");
            if (WaitFails != null) throw WaitFails;
        }

        private void Note(string code) => Notes.Add(code);
    }

    private sealed class Mark : IDisposable
    {
        private readonly List<string> events;
        private readonly string name;

        public Mark(List<string> events, string name)
        {
            this.events = events;
            this.name = name;
        }

        public void Dispose() => events.Add(name);
    }

    // ── 글자 살피기 ──────────────────────────────────────────

    private static string Read(params string[] parts)
    {
        var file = Repo.PathOf(parts);
        if (!File.Exists(file)) throw new XunitException("파일이 없다: " + string.Join("/", parts));
        return File.ReadAllText(file, Encoding.UTF8);
    }

    private static string App(string name) => Read("helper", "src", "Precheck.Reception", name);

    private static string Csproj() => App("Precheck.Reception.csproj");

    private static string HelperCsproj() => Read("helper", "src", "Precheck.Helper", "Precheck.Helper.csproj");

    private static string Solution() => Read("helper", "Precheck.sln");

    /// <summary>/// 문서 주석·// 주석을 뺀 코드(낱말 검사가 설명 글에 걸리지 않게).</summary>
    private static string Statements(string source) => Regex.Replace(source, @"//.*$", "", RegexOptions.Multiline);

    private static int Count(string text, string part)
    {
        var count = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    private static string AppStatements() =>
        string.Join("\n", new[] { "Program.cs", "ReceptionServices.cs", "SingleInstance.cs" }.Select(name => Statements(App(name))));

    /// <summary>`DataDirectory() =>` 뒤 식(세미콜론까지, 빈칸은 하나로).</summary>
    private static string DataDirectoryBody(string source)
    {
        var match = Regex.Match(source, @"string\s+DataDirectory\(\)\s*=>\s*([^;]*);", RegexOptions.Singleline);
        Assert.True(match.Success, "DataDirectory() => … 식이 없다");
        return Regex.Replace(match.Groups[1].Value, @"\s+", " ").Trim();
    }

    private static string Between(string source, string start, string end)
    {
        var from = source.IndexOf(start, StringComparison.Ordinal);
        Assert.True(from >= 0, "글자가 없다: " + start);
        var to = source.IndexOf(end, from, StringComparison.Ordinal);
        Assert.True(to > from, "글자가 없다: " + end);
        return Regex.Replace(source.Substring(from, to + end.Length - from), @"\s+", " ");
    }

    // ── AC-1411.1 사용자당 하나 ─────────────────────────────

    [Fact(DisplayName = "AC-1411.1 뮤텍스 이름은 Local\\Seoseungkwan.PrecheckReception(이 PC 사용자 세션마다 하나)")]
    public void MutexNameFixed()
    {
        Assert.Equal(@"Local\Seoseungkwan.PrecheckReception", MutexName);
    }

    [Fact(DisplayName = "AC-1411.1 이미 돌고 있으면(뮤텍스를 못 잡으면) 서버를 켜지 않고 브라우저도 열지 않고 바로 끝난다")]
    public void AlreadyRunningEnds()
    {
        var script = new Script { AlreadyRunning = true };
        Assert.Equal(ExitOk, script.Run());
        Assert.Equal(new[] { "claim" }, script.Events);
        Assert.Empty(script.Notes);
    }

    [Fact(DisplayName = "AC-1411.1 처음이면 뮤텍스를 잡고 서버를 켠 뒤 끝날 때까지 기다리고, 끝나면 서버 → 뮤텍스 차례로 놓는다")]
    public void FirstInstanceServes()
    {
        var script = new Script();
        Assert.Equal(ExitOk, script.Run());
        Assert.Equal(new[] { "claim", "start", "wait", "stop", "release" }, script.Events);
        Assert.Empty(script.Notes);
    }

    [Fact(DisplayName = "AC-1411.1 뮤텍스를 잡다 던지면 서버를 켜지 않고 E-RECEPTION-FAILED를 기록하고 끝난다")]
    public void ClaimFailureEnds()
    {
        var script = new Script { ClaimFails = new UnauthorizedAccessException("boom") };
        Assert.Equal(ExitFailed, script.Run());
        Assert.Equal(new[] { "claim" }, script.Events);
        Assert.Equal(new[] { ReceptionErrors.Failed }, script.Notes);
    }

    [Fact(DisplayName = "AC-1411.1 기다리다 던져도 서버와 뮤텍스를 놓고 E-RECEPTION-FAILED를 기록한다")]
    public void WaitFailureReleases()
    {
        var script = new Script { WaitFails = new InvalidOperationException("boom") };
        Assert.Equal(ExitFailed, script.Run());
        Assert.Equal(new[] { "claim", "start", "wait", "stop", "release" }, script.Events);
        Assert.Equal(new[] { ReceptionErrors.Failed }, script.Notes);
    }

    [Fact(DisplayName = "AC-1411.1 SingleInstance는 그 이름으로 뮤텍스를 처음 만든 쪽만 잡고(아니면 null), 끝날 때 놓는다. Program은 그것을 ReceptionStart에 넘기기만 한다")]
    public void SingleInstanceWiring()
    {
        var single = Statements(App("SingleInstance.cs"));
        Assert.Contains("new Mutex(true, ReceptionStart.MutexName, out", single, StringComparison.Ordinal);
        Assert.Contains("return null;", single, StringComparison.Ordinal);
        Assert.Contains("ReleaseMutex()", single, StringComparison.Ordinal);
        Assert.Contains("IDisposable? TryClaim()", single, StringComparison.Ordinal);

        var program = Statements(App("Program.cs"));
        Assert.Contains("new ReceptionStart(", program, StringComparison.Ordinal);
        Assert.Contains("SingleInstance.TryClaim", program, StringComparison.Ordinal);
        Assert.Contains(".Run(args)", program, StringComparison.Ordinal);
        Assert.DoesNotContain("Mutex", program, StringComparison.Ordinal);
    }

    // ── AC-1411.2 로그인 때 켜져 47200에서 기다림, DB를 기다리지 않음 ──

    [Fact(DisplayName = "AC-1411.2 시작 항목처럼 인자 없이 켜면 브라우저를 열지 않고 서버를 켜 기다리기만 한다")]
    public void PlainStartListens()
    {
        var script = new Script();
        Assert.Equal(ExitOk, script.Run());
        Assert.DoesNotContain(script.Events, e => e.StartsWith("open", StringComparison.Ordinal));
        Assert.Contains("wait", script.Events);
    }

    [Fact(DisplayName = "AC-1411.2 비트 DB가 아직 답하지 않아도 켜져 듣고(켤 때 DB를 열지 않음), 휴대폰에는 볼 수 없음(503)이다가 DB가 답하면 저절로 자료가 나온다")]
    public void StartsBeforeBitAnswers()
    {
        using var rig = new ServeRig();
        rig.Bit.Connector.FailCode = BitErrors.DbFailed;
        var port = 0;
        var openedAtStart = -1;
        var replies = new List<(int Status, string Body)>();
        var opened = new List<string>();

        int code = RunStart(
            new string[0],
            () => new Mark(new List<string>(), "release"),
            () =>
            {
                var server = new ReceptionServer(rig.Router, rig.Log, TimeSpan.FromSeconds(10));
                server.Start(IPAddress.Loopback, 0);
                port = server.Port;
                return server;
            },
            opened.Add,
            () =>
            {
                openedAtStart = rig.Bit.Connector.Opened.Count;
                replies.Add(Board(port));
                rig.Bit.Connector.FailCode = null;
                rig.Clock.Advance(BoardCache.FailRest + TimeSpan.FromSeconds(1));
                replies.Add(Board(port));
            },
            _ => { });

        Assert.Equal(ExitOk, code);
        Assert.Equal(0, openedAtStart);
        Assert.Empty(opened);
        Assert.Equal(2, replies.Count);
        Assert.Equal(503, replies[0].Status);
        Assert.Equal("{\"state\":\"unavailable\"}", replies[0].Body);
        Assert.Equal(200, replies[1].Status);
        Assert.Contains("\"state\":\"ok\"", replies[1].Body, StringComparison.Ordinal);
    }

    private static (int Status, string Body) Board(int port)
    {
        var reply = Wire.Exchange(port, "GET /api/board HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\n\r\n");
        return (reply.Status, Encoding.UTF8.GetString(reply.Body));
    }

    [Fact(DisplayName = "AC-1411.2 ReceptionServices는 도우미(HelperServices)와 같은 data\\ 폴더·같은 비트 부품·logs\\ 폴더를 쓰고, LanAddressWatch를 라우터(Host 검사)에 넘긴다")]
    public void ServicesSameParts()
    {
        var services = Statements(App("ReceptionServices.cs"));
        var helper = Statements(Read("helper", "src", "Precheck.Helper", "Commands", "HelperServices.cs"));
        Assert.Equal(DataDirectoryBody(helper), DataDirectoryBody(services));
        Assert.Contains("\"Seoseungkwan\", \"PrecheckHelper\", \"logs\"", services, StringComparison.Ordinal);
        Assert.Contains("\"Seoseungkwan\", \"PrecheckHelper\", \"logs\"", Read("helper", "src", "Precheck.Helper", "DiagnosticLog.cs"), StringComparison.Ordinal);

        foreach (var part in new[]
        {
            "new RegistrationStore(DataDirectory(), protector)",
            "new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store))",
            "new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(), store)",
            "new DpapiProtector()",
            "new BoardCache(bit, Now)",
            "new XrayMarks(new StoreFolder(DataDirectory()), protector, Now, log.Note)",
            "new VisitKeys()",
            "new StaticFiles(EmbeddedStaticSource.Core())",
            "new LanAddressWatch(LanAddresses.ReadSystem, () => DateTime.UtcNow)",
            "() => lan.Current()",
            "new ReceptionRouter(",
            "new ReceptionServer(router, log)",
            "new ReceptionLog(LogsDirectory(), Now)",
        })
        {
            Assert.Contains(part, services, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-1411.2 크롬 통로(네이티브 메시징)도, 비트 프로그램 로그인 확인도, 켤 때 비트 DB 열기도 없다")]
    public void NoChromeNoLoginCheck()
    {
        var code = AppStatements();
        foreach (var word in new[]
        {
            "MessageLoop", "Dispatcher", "CommandTable", "StdinPump", "OpenStandardInput", "OpenStandardOutput", "Precheck.Helper",
            "HospitalGate", ".Login(", "GetProcesses", "Connector.Open", "NativeTarget",
        })
        {
            Assert.DoesNotContain(word, code, StringComparison.Ordinal);
        }
    }

    // ── AC-1411.3 바탕 화면 "접수 현황 주소" = --link ───────────

    [Fact(DisplayName = "AC-1411.3 --link 깃발과 주소 http://127.0.0.1:47200/link(ReceptionPorts.Http)")]
    public void LinkConstants()
    {
        Assert.Equal("--link", LinkFlag);
        Assert.Equal("http://127.0.0.1:" + ReceptionPorts.Http + "/link", LinkUrl);
        Assert.Equal("http://127.0.0.1:47200/link", LinkUrl);
    }

    [Theory(DisplayName = "AC-1411.3 인자가 정확히 --link 하나일 때만 주소 화면을 연다(대소문자·빈칸·둘째 인자·다른 인자는 아니다)")]
    [InlineData(new[] { "--link" }, true)]
    [InlineData(new[] { "--LINK" }, false)]
    [InlineData(new[] { "--link " }, false)]
    [InlineData(new[] { " --link" }, false)]
    [InlineData(new[] { "-link" }, false)]
    [InlineData(new[] { "--link", "--link" }, false)]
    [InlineData(new[] { "--link", "x" }, false)]
    [InlineData(new[] { "--qr" }, false)]
    [InlineData(new[] { "--reception-check" }, false)]
    [InlineData(new[] { "" }, false)]
    [InlineData(new string[0], false)]
    public void LinkArgument(string[] args, bool expected) => Assert.Equal(expected, WantsLink(args));

    [Fact(DisplayName = "AC-1411.3 인자가 없거나(null) 안에 null이 있으면 --link가 아니다")]
    public void LinkArgumentNull()
    {
        Assert.False(WantsLink(null));
        Assert.False(WantsLink(new string[] { null! }));
    }

    [Fact(DisplayName = "AC-1411.3 --link이고 돌고 있지 않으면: 뮤텍스 → 서버 켜기 → 이 PC 브라우저로 http://127.0.0.1:47200/link → 기다림")]
    public void LinkStartsThenOpens()
    {
        var script = new Script();
        Assert.Equal(ExitOk, script.Run("--link"));
        Assert.Equal(new[] { "claim", "start", "open http://127.0.0.1:47200/link", "wait", "stop", "release" }, script.Events);
    }

    [Fact(DisplayName = "AC-1411.3 --link이고 이미 돌고 있으면: 서버를 다시 켜지 않고 브라우저로 /link만 열고 끝난다")]
    public void LinkWhileRunningOpensOnly()
    {
        var script = new Script { AlreadyRunning = true };
        Assert.Equal(ExitOk, script.Run("--link"));
        Assert.Equal(new[] { "claim", "open http://127.0.0.1:47200/link" }, script.Events);
    }

    [Fact(DisplayName = "AC-1411.3 브라우저를 열지 못해도 서버는 계속 돌고 E-RECEPTION-FAILED만 기록한다")]
    public void BrowserFailureKeepsServing()
    {
        var script = new Script { OpenFails = new InvalidOperationException("boom") };
        Assert.Equal(ExitOk, script.Run("--link"));
        Assert.Equal(new[] { "claim", "start", "open http://127.0.0.1:47200/link", "wait", "stop", "release" }, script.Events);
        Assert.Equal(new[] { ReceptionErrors.Failed }, script.Notes);
    }

    [Fact(DisplayName = "AC-1411.3 Program은 ReceptionStart가 준 주소만 셸로 연다(Process.Start 한 곳, 주소 글자를 따로 쓰지 않는다)")]
    public void ProgramOpensGivenUrl()
    {
        var program = Statements(App("Program.cs"));
        Assert.Equal(1, Count(program, "Process.Start("));
        Assert.Contains("UseShellExecute = true", program, StringComparison.Ordinal);
        Assert.DoesNotContain("http", program, StringComparison.Ordinal);
    }

    // ── AC-1411.5 문이 쓰이고 있으면 기록하고 끝 ──────────────────

    [Fact(DisplayName = "AC-1411.5 서버가 E-RECEPTION-PORT-BUSY로 멈추면 --link여도 브라우저를 열지 않고 기다리지 않고 뮤텍스를 놓고 끝난다(서버가 쓴 번호를 다시 쓰지 않는다)")]
    public void PortBusyEnds()
    {
        var script = new Script { StartFails = new HelperException(ReceptionErrors.PortBusy) };
        Assert.Equal(ExitPortBusy, script.Run("--link"));
        Assert.Equal(new[] { "claim", "start", "release" }, script.Events);
        Assert.Empty(script.Notes);
        Assert.NotEqual(ExitOk, ExitPortBusy);
        Assert.NotEqual(ExitFailed, ExitPortBusy);
    }

    [Fact(DisplayName = "AC-1411.5 진짜 서버: 같은 문을 다른 프로그램이 쓰면 기록에 E-RECEPTION-PORT-BUSY 한 줄(건수 1)만 남기고 끝난다")]
    public void PortBusyRealServer()
    {
        var taken = new TcpListener(IPAddress.Loopback, 0);
        taken.Start();
        try
        {
            var port = ((IPEndPoint)taken.LocalEndpoint).Port;
            using var rig = new ServeRig();
            var opened = new List<string>();
            var waited = false;
            int code = RunStart(
                new[] { "--link" },
                () => new Mark(new List<string>(), "release"),
                () =>
                {
                    var server = new ReceptionServer(rig.Router, rig.Log);
                    try
                    {
                        server.Start(IPAddress.Loopback, port);
                    }
                    catch
                    {
                        server.Dispose();
                        throw;
                    }
                    return server;
                },
                opened.Add,
                () => waited = true,
                rig.Log.Note);

            Assert.Equal(ExitPortBusy, code);
            Assert.Empty(opened);
            Assert.False(waited);
            var lines = rig.LogLines();
            Assert.Single(lines);
            Assert.EndsWith(" - E-RECEPTION-PORT-BUSY 1", lines[0], StringComparison.Ordinal);
            LogAssert.Clean(lines);
        }
        finally
        {
            taken.Stop();
        }
    }

    [Fact(DisplayName = "AC-1411.5 다른 까닭으로 켜지 못하면 그 오류 번호(모르면 E-RECEPTION-FAILED)만 기록하고 뮤텍스를 놓고 끝난다")]
    public void OtherStartFailure()
    {
        var store = new Script { StartFails = new HelperException(BitErrors.StoreFailed) };
        Assert.Equal(ExitFailed, store.Run());
        Assert.Equal(new[] { "claim", "start", "release" }, store.Events);
        Assert.Equal(new[] { BitErrors.StoreFailed }, store.Notes);

        var other = new Script { StartFails = new IOException("boom") };
        Assert.Equal(ExitFailed, other.Run("--link"));
        Assert.Equal(new[] { "claim", "start", "release" }, other.Events);
        Assert.Equal(new[] { ReceptionErrors.Failed }, other.Notes);
    }

    [Fact(DisplayName = "AC-1411.5 ReceptionServices는 IPAddress.Any·ReceptionPorts.Http(47200) 한 곳에서만 듣고 다른 문으로 바꾸지 않으며, 못 켜면 서버를 닫고 다시 던진다")]
    public void ServicesFixedPort()
    {
        var services = Statements(App("ReceptionServices.cs"));
        Assert.Equal(1, Count(services, ".Start("));
        Assert.Contains(".Start(IPAddress.Any, ReceptionPorts.Http)", services, StringComparison.Ordinal);
        Assert.DoesNotContain("47200", AppStatements(), StringComparison.Ordinal);
        Assert.DoesNotContain("ReceptionPorts.Http +", services, StringComparison.Ordinal);
        Assert.DoesNotContain("Port +", services, StringComparison.Ordinal);
        Assert.Contains("server.Dispose();", services, StringComparison.Ordinal);
        Assert.Contains("throw;", services, StringComparison.Ordinal);
    }

    // ── AC-1411.7 [의원 PC] 껐다 켜고 로그인하면 따로 누르지 않아도 ──

    [Fact(DisplayName = "AC-1411.7 [의원 PC] 실제 껐다 켜기·로그인 시작은 의원 PC에서 본다. 여기서는 인자 없이 켜면 누를 것 없이(창·브라우저 없이) 서버를 켜 기다림을 본다")]
    public void NoClickNeeded()
    {
        var script = new Script();
        Assert.Equal(ExitOk, script.Run());
        Assert.Equal(new[] { "claim", "start", "wait", "stop", "release" }, script.Events);

        Assert.Contains("<OutputType>WinExe</OutputType>", Csproj(), StringComparison.Ordinal);
        var code = AppStatements();
        foreach (var word in new[] { "MessageBox", "Application.Run", "new Form", "Console.", "ReadLine", "ReadKey" })
        {
            Assert.DoesNotContain(word, code, StringComparison.Ordinal);
        }
    }

    // ── AC-1412.5 net48·x86 WinExe, 옛 런타임 정책, 솔루션 ──────────

    [Fact(DisplayName = "AC-1412.5 Precheck.Reception.csproj는 WinExe·net48·x86·PrecheckReception이고 Core·Windows를 참조한다(Platform·OutputPath 없음)")]
    public void CsprojShape()
    {
        var csproj = Csproj();
        Assert.Contains("<OutputType>WinExe</OutputType>", csproj, StringComparison.Ordinal);
        Assert.Contains("<TargetFramework>net48</TargetFramework>", csproj, StringComparison.Ordinal);
        Assert.Contains("<PlatformTarget>x86</PlatformTarget>", csproj, StringComparison.Ordinal);
        Assert.Contains("<AssemblyName>PrecheckReception</AssemblyName>", csproj, StringComparison.Ordinal);
        Assert.Contains("<RootNamespace>Precheck.Reception</RootNamespace>", csproj, StringComparison.Ordinal);
        Assert.Contains("<ProjectReference Include=\"../Precheck.Core/Precheck.Core.csproj\" />", csproj, StringComparison.Ordinal);
        Assert.Contains("<ProjectReference Include=\"../Precheck.Windows/Precheck.Windows.csproj\" />", csproj, StringComparison.Ordinal);
        Assert.Contains(
            "<PackageReference Include=\"Microsoft.NETFramework.ReferenceAssemblies\" Version=\"1.0.3\" PrivateAssets=\"all\" />", csproj, StringComparison.Ordinal);
        Assert.DoesNotMatch(new Regex(@"<Platforms?>"), csproj);
        Assert.DoesNotMatch(new Regex(@"<OutputPath>"), csproj);
        Assert.DoesNotMatch(new Regex(@"<TargetFrameworks>"), csproj);
    }

    [Fact(DisplayName = "AC-1412.5 .exe.config의 옛 런타임 정책(StartupAppConfigXml)과 그것을 쓰는 빌드 단계가 도우미 csproj와 글자 그대로 같다")]
    public void StartupConfigSameAsHelper()
    {
        var mine = Csproj();
        var helper = HelperCsproj();
        const string open = "<StartupAppConfigXml>";
        const string close = "</StartupAppConfigXml>";
        var config = Between(mine, open, close);
        Assert.Equal(Between(helper, open, close), config);
        Assert.Contains("useLegacyV2RuntimeActivationPolicy=\"true\"", config, StringComparison.Ordinal);
        Assert.Contains("<supportedRuntime version=\"v4.0\" sku=\".NETFramework,Version=v4.8\" />", config, StringComparison.Ordinal);
        Assert.Equal(
            Between(helper, "<Target Name=\"WriteStartupAppConfig\"", "</Target>"),
            Between(mine, "<Target Name=\"WriteStartupAppConfig\"", "</Target>"));
    }

    [Fact(DisplayName = "AC-1412.5 Precheck.sln에 Precheck.Reception이 src 아래에 있고 모든 구성(Debug·Release × Any CPU·x64·x86)에서 빌드된다")]
    public void SolutionHasProject()
    {
        var sln = Solution();
        var line = Regex.Match(
            sln,
            @"Project\(""\{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC\}""\) = ""Precheck\.Reception"", ""src\\Precheck\.Reception\\Precheck\.Reception\.csproj"", ""\{(?<id>[0-9A-F-]{36})\}""");
        Assert.True(line.Success, "Precheck.sln에 Precheck.Reception 줄이 없다");
        var id = line.Groups["id"].Value;
        Assert.Equal(1, Count(sln, "{" + id + "}\""));

        var src = Regex.Match(sln, @"Project\(""\{2150E333-8FDC-42A3-9474-1A3956D46DE8\}""\) = ""src"", ""src"", ""\{(?<id>[0-9A-F-]{36})\}""");
        Assert.True(src.Success);
        Assert.Contains("{" + id + "} = {" + src.Groups["id"].Value + "}", sln, StringComparison.Ordinal);

        foreach (var config in new[] { "Debug", "Release" })
        {
            foreach (var platform in new[] { "Any CPU", "x64", "x86" })
            {
                Assert.Contains("{" + id + "}." + config + "|" + platform + ".ActiveCfg = " + config + "|Any CPU", sln, StringComparison.Ordinal);
                Assert.Contains("{" + id + "}." + config + "|" + platform + ".Build.0 = " + config + "|Any CPU", sln, StringComparison.Ordinal);
            }
        }
    }

    // ── AC-1413.1 바깥 연결 없음 ─────────────────────────────

    [Fact(DisplayName = "AC-1413.1 늘 켜 두는 프로그램(Precheck.Reception/**)도 살핀다: Program·ReceptionServices·SingleInstance가 있고 바깥으로 나가는 연결 API가 없다")]
    public void HostHasNoOutbound()
    {
        foreach (var name in new[] { "Program.cs", "ReceptionServices.cs", "SingleInstance.cs" }) Assert.NotEmpty(App(name));
        Assert.NotEmpty(Read("helper", "src", "Precheck.Core", "Reception", "ReceptionStart.cs"));
        new ReceptionTextTests().NoOutboundConnections();
    }

    [Fact(DisplayName = "AC-1413.1 브라우저로 여는 주소는 이 PC 자신(127.0.0.1)의 /link 하나뿐이다")]
    public void OnlyLoopbackOpened()
    {
        var urls = new List<string>();
        foreach (var running in new[] { false, true })
        {
            var script = new Script { AlreadyRunning = running };
            script.Run("--link");
            urls.AddRange(script.Events.Where(e => e.StartsWith("open ", StringComparison.Ordinal)).Select(e => e.Substring(5)));
        }
        Assert.Equal(2, urls.Count);
        Assert.All(urls, url => Assert.Equal("http://127.0.0.1:47200/link", url));
        Assert.True(IPAddress.IsLoopback(IPAddress.Parse(new Uri(LinkUrl).Host)));
    }
}
