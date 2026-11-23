using System;
using System.Linq;
using Erp.Core;
using Precheck.Core.Bit;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3801.1·AC-3801.2 ERP 도우미 비트 찾기(spec erp-bit-anywhere design.md): 기존 BitInstallRules.FindRoot(필요한 파일 셋·위로 4단계·
/// UNC·상대·네트워크 드라이브 거절)와 환경 파일 Path·Bin 일치만 보고, 설치 폴더가 C:\DrBIT50인지는 보지 않는다.
/// 가짜 후보와 기존 시험의 가짜 파일 모양(Precheck.Core.Tests.Bit.FakeProbe)으로 본다. 기존 BitInstallRules는 그대로다.
/// </summary>
public class ErpInstallRulesTests
{
    private const string Drive = @"C:\";

    /// <summary>root에 비트가 깔려 있고 윈도우 드라이브의 환경 파일이 그 root를 가리키는 PC.</summary>
    private static FakeProbe Pc(string root, string systemDrive = Drive) =>
        new FakeProbe().Install(root).Environment(root, WinPath.Combine(Normalized(root), "EXE"), systemDrive);

    private static string Normalized(string path)
    {
        Assert.True(WinPath.TryNormalize(path, out var normalized), path);
        return normalized;
    }

    private static void NotFound(Func<string> choose)
    {
        var error = Assert.Throws<BitException>(() => choose());
        Assert.Equal("E-BIT-NOT-FOUND", error.Code);
        Assert.Equal(BitErrors.NotFound, error.Code);
    }

    // ---- AC-3801.1 고르는 설치 ---------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3801.1 환경 파일 Path·Bin과 맞는 로컬 설치는 드라이브·폴더 이름과 상관없이 고른다(C:\\DrBIT50·D:\\DrBIT50·C:\\DrBIT·한글·띄어쓰기)")]
    [InlineData(@"C:\DrBIT50")]
    [InlineData(@"D:\DrBIT50")]
    [InlineData(@"C:\DrBIT")]
    [InlineData(@"E:\병원 프로그램\DrBIT50")]
    public void ChoosesAnyLocalInstall(string root)
    {
        var probe = Pc(root);
        Assert.True(ErpInstallRules.MatchesEnvironment(root, probe, Drive));
        Assert.Equal(root, ErpInstallRules.Choose(new[] { root }, probe, Drive), ignoreCase: true);
    }

    [Theory(DisplayName = "AC-3801.1 후보가 설치 폴더·EXE 폴더·실행 파일 경로여도 위로 찾아 그 설치 폴더를 고른다(FindRoot 그대로)")]
    [InlineData(@"D:\DrBIT50", @"D:\DrBIT50")]
    [InlineData(@"D:\DrBIT50\EXE", @"D:\DrBIT50")]
    [InlineData(@"D:\DrBIT50\EXE\BITStatistics.exe", @"D:\DrBIT50")]
    [InlineData("\"E:\\병원 프로그램\\DrBIT50\\EXE\\BITStatistics.exe\"", @"E:\병원 프로그램\DrBIT50")]
    [InlineData(@"C:\DrBIT\EXE\BITDataBaseCommon.dll", @"C:\DrBIT")]
    public void ChoosesRootFromExecutableCandidate(string candidate, string root)
    {
        Assert.True(WinPath.Same(root, ErpInstallRules.Choose(new[] { candidate }, Pc(root), Drive)));
    }

    [Theory(DisplayName = "AC-3801.1 후보·환경 파일 Path·Bin의 대소문자와 끝 \\는 가리지 않는다")]
    [InlineData(@"d:\drbit50\", @"D:/DRBIT50/", @"d:\DrBit50\exe\")]
    [InlineData(@"D:\DRBIT50", @"d:\drbit50", @"D:\DrBIT50\EXE")]
    [InlineData(@"e:\병원 프로그램\drbit50\", @"E:\병원 프로그램\DRBIT50\", @"e:\병원 프로그램\drbit50\Exe")]
    public void IgnoresCaseAndTrailingSeparator(string candidate, string path, string bin)
    {
        var root = WinPath.Parent(Normalized(bin))!;
        var probe = new FakeProbe().Install(root).Environment(path, bin);
        Assert.True(ErpInstallRules.MatchesEnvironment(candidate, probe, Drive));
        Assert.True(WinPath.Same(root, ErpInstallRules.Choose(new[] { candidate }, probe, Drive)));
    }

    [Fact(DisplayName = "AC-3801.1 환경 파일은 윈도우 드라이브의 DrBIT50\\Environment\\DrBIT50Environment.ini 한 곳에서 읽는다(설치가 다른 드라이브여도)")]
    public void ReadsEnvironmentFromSystemDrive()
    {
        var probe = Pc(@"E:\병원 프로그램\DrBIT50");
        Assert.Equal(@"E:\병원 프로그램\DrBIT50", ErpInstallRules.Choose(new[] { @"E:\병원 프로그램\DrBIT50" }, probe, Drive));
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini" }, probe.EnvironmentReads);

        // 윈도우가 D:\이면 D:\의 환경 파일을 본다. C:\의 환경 파일은 보지 않는다
        var onD = Pc(@"E:\DrBIT", @"D:\");
        Assert.Equal(@"E:\DrBIT", ErpInstallRules.Choose(new[] { @"E:\DrBIT" }, onD, @"D:\"));
        Assert.Equal(new[] { @"D:\DrBIT50\Environment\DrBIT50Environment.ini" }, onD.EnvironmentReads);
        NotFound(() => ErpInstallRules.Choose(new[] { @"E:\DrBIT" }, Pc(@"E:\DrBIT", @"D:\"), Drive));
    }

    [Fact(DisplayName = "AC-3801.1 기존 BitInstallRules(청구 도우미)는 그대로 C:\\DrBIT50만 고르고, ERP 규칙은 같은 PC에서 다른 위치도 고른다")]
    public void ExistingRuleUnchanged()
    {
        Assert.Equal(@"C:\DrBIT50", BitInstallRules.SupportedRoot);
        var probe = Pc(@"D:\DrBIT50");
        Assert.False(BitInstallRules.MatchesEnvironment(@"D:\DrBIT50", probe, Drive));
        Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { @"D:\DrBIT50" }, probe, Drive));
        Assert.True(ErpInstallRules.MatchesEnvironment(@"D:\DrBIT50", probe, Drive));
        Assert.Equal(@"D:\DrBIT50", ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, probe, Drive));
    }

    // ---- AC-3801.2 고르지 않는 후보 ------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3801.2 UNC·장치 경로·상대 경로·빈 값 후보는 고르지 않는다(E-BIT-NOT-FOUND)")]
    [InlineData(@"\\서버\공유\DrBIT50")]
    [InlineData(@"\\server\share\DrBIT50")]
    [InlineData(@"//server/share/DrBIT50")]
    [InlineData(@"\\?\D:\DrBIT50")]
    [InlineData(@"DrBIT50")]
    [InlineData(@".\DrBIT50")]
    [InlineData(@"..\DrBIT50")]
    [InlineData(@"\DrBIT50")]
    [InlineData(@"D:DrBIT50")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void RefusesNonLocalCandidates(string? candidate)
    {
        NotFound(() => ErpInstallRules.Choose(new[] { candidate }, Pc(@"D:\DrBIT50"), Drive));
    }

    [Fact(DisplayName = "AC-3801.2 네트워크 드라이브의 설치는 환경 파일과 맞아도 고르지 않는다")]
    public void RefusesNetworkDrive()
    {
        var probe = Pc(@"Z:\DrBIT50").NetworkDrive(@"Z:\");
        NotFound(() => ErpInstallRules.Choose(new[] { @"Z:\DrBIT50", @"Z:\DrBIT50\EXE\BITStatistics.exe" }, probe, Drive));
        Assert.Empty(probe.EnvironmentReads);
    }

    [Theory(DisplayName = "AC-3801.2 필요한 파일(ini\\BITSTATISTICS.Xml·EXE\\BITDataBaseCommon.dll·EXE\\BITStatistics.exe)이 하나라도 없는 폴더는 고르지 않는다")]
    [InlineData(@"ini\BITSTATISTICS.Xml")]
    [InlineData(@"EXE\BITDataBaseCommon.dll")]
    [InlineData(@"EXE\BITStatistics.exe")]
    public void RefusesIncompleteInstall(string missing)
    {
        var probe = new FakeProbe().Install(@"D:\DrBIT50", missing).Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE");
        NotFound(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50", @"D:\DrBIT50\EXE" }, probe, Drive));
    }

    [Fact(DisplayName = "AC-3801.2 환경 파일이 없거나 읽지 못하면(ReadEnvironment null) 고르지 않는다")]
    public void RefusesWithoutEnvironment()
    {
        var noFile = new FakeProbe().Install(@"D:\DrBIT50");
        Assert.False(ErpInstallRules.MatchesEnvironment(@"D:\DrBIT50", noFile, Drive));
        NotFound(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, noFile, Drive));

        // 다른 드라이브에만 환경 파일이 있으면 없는 것과 같다
        var elsewhere = new FakeProbe().Install(@"D:\DrBIT50").Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE", @"D:\");
        NotFound(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, elsewhere, Drive));
    }

    [Theory(DisplayName = "AC-3801.2 환경 파일 Path가 그 폴더와 다르거나 Bin이 그 폴더\\EXE가 아니거나 경로 모양이 아니면 고르지 않는다")]
    [InlineData(@"C:\DrBIT50", @"D:\DrBIT50\EXE")]
    [InlineData(@"D:\DrBIT", @"D:\DrBIT50\EXE")]
    [InlineData(@"D:\DrBIT50\EXE", @"D:\DrBIT50\EXE")]
    [InlineData(@"D:\DrBIT50", @"D:\DrBIT50\BIN")]
    [InlineData(@"D:\DrBIT50", @"D:\DrBIT50")]
    [InlineData(@"D:\DrBIT50", @"C:\DrBIT50\EXE")]
    [InlineData(@"D:\DrBIT50", null)]
    [InlineData(null, @"D:\DrBIT50\EXE")]
    [InlineData(@"\\server\DrBIT50", @"\\server\DrBIT50\EXE")]
    [InlineData(@"DrBIT50", @"DrBIT50\EXE")]
    [InlineData("", "")]
    public void RefusesEnvironmentMismatch(string? path, string? bin)
    {
        var probe = new FakeProbe().Install(@"D:\DrBIT50").Environment(path, bin);
        Assert.False(ErpInstallRules.MatchesEnvironment(@"D:\DrBIT50", probe, Drive));
        NotFound(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, probe, Drive));
    }

    [Theory(DisplayName = "AC-3801.2 고른 폴더가 경로 모양이 아니면 환경 파일과 견주지 않는다")]
    [InlineData("")]
    [InlineData(@"\\server\share\DrBIT50")]
    [InlineData(@"DrBIT50")]
    public void MatchesEnvironmentRefusesBadRoot(string root)
    {
        Assert.False(ErpInstallRules.MatchesEnvironment(root, Pc(@"D:\DrBIT50"), Drive));
    }

    [Fact(DisplayName = "AC-3801.2 앞 후보가 거절되면 다음 후보를 보고, 규칙을 모두 지키는 첫 설치를 고른다")]
    public void ChoosesNextValidCandidate()
    {
        var root = @"E:\병원 프로그램\DrBIT50";
        var probe = Pc(root)
            .Install(@"D:\DrBIT50")                     // 모양은 맞지만 환경 파일과 다름
            .Install(@"F:\DrBIT50", @"EXE\BITStatistics.exe") // 파일 하나 빠짐
            .Install(@"Z:\DrBIT50").NetworkDrive(@"Z:\")
            .Install(@"C:\DrBIT");                       // 맞는 설치 뒤에 있는 후보
        var candidates = new[]
        {
            null,
            "",
            @"\\서버\공유\DrBIT50",
            @"Z:\DrBIT50",
            @"F:\DrBIT50",
            @"D:\DrBIT50",
            @"E:\병원 프로그램\DrBIT50\EXE\BITStatistics.exe",
            @"C:\DrBIT",
        };
        Assert.Equal(root, ErpInstallRules.Choose(candidates, probe, Drive));
        // 환경 파일은 모양이 맞는 설치(D:\DrBIT50, E:\…)에서만 읽었다
        Assert.Equal(2, probe.EnvironmentReads.Count);
    }

    [Fact(DisplayName = "AC-3801.2 같은 설치 폴더는 후보에 여러 번 나와도(대소문자·끝 \\·EXE·실행 파일) 한 번만 본다")]
    public void SeesSameRootOnce()
    {
        var probe = new FakeProbe().Install(@"D:\DrBIT50").Environment(@"C:\DrBIT50", @"C:\DrBIT50\EXE");
        var candidates = new[] { @"D:\DrBIT50", @"d:\drbit50\", @"D:\DrBIT50\EXE", @"D:\DrBIT50\EXE\BITStatistics.exe", "\"D:\\DRBIT50\"" };
        NotFound(() => ErpInstallRules.Choose(candidates, probe, Drive));
        Assert.Single(probe.EnvironmentReads);

        // 앞에서 거절한 폴더가 다시 나와도 그다음 후보로 간다
        var next = Pc(@"C:\DrBIT").Install(@"D:\DrBIT50");
        Assert.Equal(@"C:\DrBIT", ErpInstallRules.Choose(new[] { @"D:\DrBIT50", @"d:\DrBIT50\EXE", @"C:\DrBIT" }, next, Drive));
        Assert.Equal(2, next.EnvironmentReads.Count);
    }

    [Fact(DisplayName = "AC-3801.2 맞는 후보가 하나도 없으면(후보 없음 포함) E-BIT-NOT-FOUND, 후보·파일 모양이 null이면 ArgumentNullException")]
    public void NotFoundAndArguments()
    {
        NotFound(() => ErpInstallRules.Choose(new string?[0], Pc(@"D:\DrBIT50"), Drive));
        NotFound(() => ErpInstallRules.Choose(Enumerable.Empty<string?>(), Pc(@"D:\DrBIT50")));
        NotFound(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, new FakeProbe().Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE"), Drive));

        Assert.Throws<ArgumentNullException>(() => ErpInstallRules.Choose(null!, Pc(@"D:\DrBIT50"), Drive));
        Assert.Throws<ArgumentNullException>(() => ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, null!, Drive));
        Assert.Throws<ArgumentNullException>(() => ErpInstallRules.MatchesEnvironment(@"D:\DrBIT50", null!, Drive));
    }

    [Fact(DisplayName = "AC-3801.2 기본 윈도우 드라이브는 C:\\다")]
    public void DefaultSystemDrive()
    {
        var probe = Pc(@"D:\DrBIT50");
        Assert.Equal(@"D:\DrBIT50", ErpInstallRules.Choose(new[] { @"D:\DrBIT50" }, probe));
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini" }, probe.EnvironmentReads);
    }
}
