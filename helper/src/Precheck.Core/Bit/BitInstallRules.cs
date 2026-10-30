using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 찾기가 보는 파일 모양. 윈도우에서는 Precheck.Windows.LocalFileProbe(File·Directory·DriveInfo·환경 파일),
/// 시험에서는 가짜. 경로는 WinPath로 정리한 윈도우 경로다.
/// </summary>
public interface IFileProbe
{
    bool FileExists(string path);

    bool DirectoryExists(string path);

    /// <summary>드라이브 뿌리(`Z:\`)가 네트워크 드라이브인가.</summary>
    bool IsNetworkDrive(string driveRoot);

    /// <summary>비트 환경 파일을 NativeEnvironmentFile 규칙으로 읽는다. 없거나 깨졌으면 null.</summary>
    BitEnvironment? ReadEnvironment(string file);
}

/// <summary>
/// 비트 설치 고르기(AC-005.1). 원본 InstallationLocator.NormalizeAndValidate(필요한 파일 셋, 위로 4단계, UNC·네트워크 거절)와
/// NativeEnvironmentGuard.Validate(환경 파일의 Path·Bin과 일치, 지원 위치 C:\DrBIT50) 규칙 그대로.
/// 후보를 모으는 일(앱 폴더·실행 중인 비트·레지스트리·기본 폴더)은 Precheck.Windows.InstallationLocator가 한다.
/// </summary>
public static class BitInstallRules
{
    /// <summary>원본 모듈이 글자 그대로 쓰는 설치 위치. 다른 위치는 원본 모듈과 맞는지 몰라 고르지 않는다.</summary>
    public const string SupportedRoot = @"C:\DrBIT50";

    /// <summary>후보 폴더에서 위로 올라가 볼 단계 수(원본 AncestorLimit).</summary>
    public const int AncestorLimit = 4;

    /// <summary>설치 폴더에 모두 있어야 하는 파일(원본 RequiredFiles).</summary>
    public static readonly IReadOnlyList<string> RequiredFiles = new[]
    {
        @"ini\BITSTATISTICS.Xml", @"EXE\BITDataBaseCommon.dll", @"EXE\BITStatistics.exe",
    };

    private const string EnvironmentRelative = @"DrBIT50\Environment\DrBIT50Environment.ini";

    /// <summary>윈도우 드라이브(`C:\`)의 비트 환경 파일 위치. 비트는 실행 위치와 상관없이 이 파일을 읽는다(원본 주석).</summary>
    public static string EnvironmentFile(string systemDrive)
    {
        if (!WinPath.TryNormalize(systemDrive, out var drive)) throw new ArgumentException("윈도우 드라이브 경로가 틀렸다", nameof(systemDrive));
        return WinPath.Combine(WinPath.DriveRoot(drive), EnvironmentRelative);
    }

    /// <summary>
    /// 원본 NormalizeAndValidate: 후보(폴더·실행 파일 경로)에서 필요한 파일 셋이 모두 있는 설치 폴더를 찾는다.
    /// 로컬 드라이브 경로가 아니거나·네트워크 드라이브거나·없는 폴더거나·4단계 위까지 없으면 null.
    /// </summary>
    public static string? FindRoot(string? candidate, IFileProbe probe)
    {
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        if (!WinPath.TryNormalize(candidate, out var path)) return null;
        if (probe.IsNetworkDrive(WinPath.DriveRoot(path))) return null;

        string? current = path;
        if (probe.FileExists(path)) current = WinPath.Parent(path);
        if (current == null || !probe.DirectoryExists(current)) return null;

        for (var level = 0; level <= AncestorLimit && current != null; level++)
        {
            var folder = current;
            if (RequiredFiles.All(file => probe.FileExists(WinPath.Combine(folder, file)))) return folder;
            current = WinPath.Parent(folder);
        }
        return null;
    }

    /// <summary>원본 NativeEnvironmentGuard.Validate: 환경 파일의 Path = 설치 폴더, Bin = 설치 폴더\EXE, 설치 폴더 = C:\DrBIT50.</summary>
    public static bool MatchesEnvironment(string root, IFileProbe probe, string systemDrive)
    {
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        if (!WinPath.TryNormalize(root, out var selected)) return false;
        var environment = probe.ReadEnvironment(EnvironmentFile(systemDrive));
        if (environment == null) return false;
        if (!WinPath.TryNormalize(environment.Path, out var configuredRoot) || !WinPath.TryNormalize(environment.Bin, out var configuredBin)) return false;
        if (!WinPath.Same(selected, configuredRoot) || !WinPath.Same(configuredBin, WinPath.Combine(selected, "EXE"))) return false;
        return WinPath.Same(selected, SupportedRoot);
    }

    /// <summary>후보를 차례로 보고 두 규칙을 모두 지키는 첫 설치 폴더. 없으면 BitException(E-BIT-NOT-FOUND).</summary>
    public static string Choose(IEnumerable<string?> candidates, IFileProbe probe, string systemDrive = @"C:\")
    {
        if (candidates == null) throw new ArgumentNullException(nameof(candidates));
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in candidates)
        {
            var root = FindRoot(candidate, probe);
            if (root == null || !seen.Add(root)) continue;
            if (MatchesEnvironment(root, probe, systemDrive)) return root;
        }
        throw new BitException(BitErrors.NotFound);
    }
}
