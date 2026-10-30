using System;
using System.IO;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Connect;

/// <summary>
/// AC-005.1 가짜 설치 폴더(임시 폴더)로 InstallationLocator·LocalFileProbe·NativeEnvironmentGuard 읽기를 본다. 윈도우에서만 돈다.
/// 실제 C:\DrBIT50은 의원 PC 시험으로 남긴다.
/// </summary>
public sealed class InstallationLocatorTests : IDisposable
{
    private readonly string temp = Path.Combine(Path.GetTempPath(), "precheck-locator-" + Guid.NewGuid().ToString("N"));

    private string Root => Path.Combine(temp, "DrBIT50");

    public InstallationLocatorTests()
    {
        foreach (var file in BitInstallRules.RequiredFiles)
        {
            var path = Path.Combine(Root, file);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, "synthetic");
        }
    }

    public void Dispose()
    {
        if (Directory.Exists(temp)) Directory.Delete(temp, true);
    }

    [Fact(DisplayName = "AC-005.1 가짜 설치 폴더: 실행 파일·EXE 폴더·설치 폴더 어디서 시작해도 설치 폴더를 찾는다")]
    public void FindsFakeInstall()
    {
        var probe = new LocalFileProbe();
        foreach (var candidate in new[] { Root, Path.Combine(Root, "EXE"), Path.Combine(Root, "EXE", "BITStatistics.exe"), "\"" + Root + "\\\"" })
        {
            Assert.True(WinPath.Same(Root, BitInstallRules.FindRoot(candidate, probe)), candidate);
        }

        File.Delete(Path.Combine(Root, "ini", "BITSTATISTICS.Xml"));
        Assert.Null(BitInstallRules.FindRoot(Root, probe));
    }

    [Fact(DisplayName = "AC-005.1 환경 파일은 공유 읽기로 열어 Path·Bin만 읽고, C:\\DrBIT50이 아닌 설치는 고르지 않는다(E-BIT-NOT-FOUND)")]
    public void ReadsEnvironmentAndRefusesUnsupportedRoot()
    {
        var file = Path.Combine(temp, "DrBIT50Environment.ini");
        File.WriteAllText(file, "<DrBIT><Setting><Path>" + Root + "</Path><Bin>" + Path.Combine(Root, "EXE") + "</Bin><Password>synthetic</Password></Setting></DrBIT>");
        using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
        {
            var environment = NativeEnvironmentGuard.Read(file);
            Assert.NotNull(environment);
            Assert.Equal(Root, environment!.Path);
            Assert.Equal(Path.Combine(Root, "EXE"), environment.Bin);
        }
        Assert.Null(NativeEnvironmentGuard.Read(Path.Combine(temp, "none.ini")));

        // 임시 폴더는 지원 위치(C:\DrBIT50)가 아니다: 모양이 맞아도 고르지 않는다
        var locator = new InstallationLocator(Path.Combine(temp, "app"), () => Root);
        Assert.Equal(Root, locator.FindCandidates().First());
        Assert.False(BitInstallRules.MatchesEnvironment(Root, new LocalFileProbe(), NativeEnvironmentGuard.SystemDrive()));
    }

    [Theory(DisplayName = "AC-005.1 레지스트리 값에서 실행 파일 경로만 꺼낸다(원본 ExecutablePath)")]
    [InlineData("\"C:\\DrBIT50\\EXE\\BITStatistics.exe\" /s", @"C:\DrBIT50\EXE\BITStatistics.exe")]
    [InlineData(@"C:\DrBIT50\EXE\BITStatistics.exe,0", @"C:\DrBIT50\EXE\BITStatistics.exe")]
    [InlineData(@"C:\DrBIT50", @"C:\DrBIT50")]
    [InlineData("\"unterminated", null)]
    [InlineData("  ", null)]
    public void ExecutablePath(string value, string? expected)
    {
        Assert.Equal(expected, InstallationLocator.ExecutablePath(value));
    }
}
