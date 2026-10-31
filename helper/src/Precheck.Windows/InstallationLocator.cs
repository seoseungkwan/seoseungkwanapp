using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security;
using Microsoft.Win32;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>Core 비트 찾기 규칙이 보는 이 PC의 파일 모양(File·Directory·DriveInfo·환경 파일).</summary>
public sealed class LocalFileProbe : IFileProbe
{
    public bool FileExists(string path) => File.Exists(path);

    public bool DirectoryExists(string path) => Directory.Exists(path);

    public bool IsNetworkDrive(string driveRoot)
    {
        try
        {
            return new DriveInfo(driveRoot).DriveType == DriveType.Network;
        }
        catch (ArgumentException)
        {
            // 드라이브로 볼 수 없으면 로컬이라고 믿지 않는다
            return true;
        }
    }

    public BitEnvironment? ReadEnvironment(string file) => NativeEnvironmentGuard.Read(file);
}

/// <summary>
/// 원본 InstallationLocator.FindCandidates의 윈도우 부분: 이 PC의 폴더·레지스트리·실행 중인 비트에서 설치 후보를 모으기만 한다
/// (접속 정보를 보거나 비트 DLL을 불러오지 않는다). 고르기는 Core BitInstallRules.Choose(AC-005.1).
/// 후보는 필요할 때 하나씩 만든다: 앞 후보가 맞으면 뒤(프로세스·레지스트리 훑기)는 하지 않는다.
/// </summary>
public sealed class InstallationLocator : IBitLocator
{
    private const string UninstallKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    private const string AppPathsKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";

    private readonly string appDirectory;
    private readonly Func<string?> rememberedRoot;
    private readonly IFileProbe probe;

    /// <param name="appDirectory">도우미 exe 폴더(원본 '이 프로그램 주변 폴더').</param>
    /// <param name="rememberedRoot">등록해 둔 설치 위치(원본 '이전에 선택한 설치'). 없으면 null.</param>
    public InstallationLocator(string appDirectory, Func<string?>? rememberedRoot = null, IFileProbe? probe = null)
    {
        this.appDirectory = appDirectory ?? "";
        this.rememberedRoot = rememberedRoot ?? (() => null);
        this.probe = probe ?? new LocalFileProbe();
    }

    public string Find() => BitInstallRules.Choose(FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive());

    /// <summary>원본 순서: 이전 설치 → 환경 파일의 설치 위치 → 이 프로그램 폴더 → 실행 중인 비트 → 레지스트리 → 기본 폴더 → 프로그램 폴더.</summary>
    public IEnumerable<string?> FindCandidates()
    {
        yield return Expand(rememberedRoot());
        yield return Expand(NativeEnvironmentGuard.FindConfiguredRoot());
        yield return Expand(appDirectory);
        foreach (var path in RunningProcesses()) yield return path;
        foreach (var path in RegistryLocations()) yield return path;

        var systemDrive = NativeEnvironmentGuard.SystemDrive();
        yield return Path.Combine(systemDrive, "DrBIT50");
        foreach (var root in FixedDriveRoots())
        {
            yield return Path.Combine(root, "DrBIT50");
            yield return Path.Combine(root, "DrBIT");
        }
        foreach (var path in ProgramFolders()) yield return path;
    }

    private static string? Expand(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        try
        {
            return Environment.ExpandEnvironmentVariables(path!.Trim().Trim('"'));
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static List<string?> RunningProcesses()
    {
        var found = new List<string?>();
        Process[] processes;
        try
        {
            processes = Process.GetProcesses();
        }
        catch (Exception e) when (ExpectedDiscoveryError(e))
        {
            return found;
        }
        foreach (var process in processes)
        {
            using (process)
            {
                try
                {
                    if (!LooksLikeDrBitProcess(process.ProcessName)) continue;
                    var module = process.MainModule;
                    if (module != null) found.Add(module.FileName);
                }
                catch (Exception e) when (ExpectedDiscoveryError(e))
                {
                    // 다른 사용자·비트 수 다른 프로세스는 건너뛴다
                }
            }
        }
        return found;
    }

    private static List<string?> RegistryLocations()
    {
        var found = new List<string?>();
        var views = Environment.Is64BitOperatingSystem ? new[] { RegistryView.Registry32, RegistryView.Registry64 } : new[] { RegistryView.Registry32 };
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        {
            foreach (var view in views)
            {
                try
                {
                    using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                    ReadUninstallEntries(baseKey, found);
                    ReadAppPaths(baseKey, found);
                }
                catch (Exception e) when (ExpectedDiscoveryError(e))
                {
                    // 읽을 수 없는 하이브는 건너뛴다
                }
            }
        }
        return found;
    }

    private static void ReadUninstallEntries(RegistryKey baseKey, List<string?> found)
    {
        using var uninstall = baseKey.OpenSubKey(UninstallKey, false);
        if (uninstall == null) return;
        foreach (var name in uninstall.GetSubKeyNames().Take(2048))
        {
            try
            {
                using var entry = uninstall.OpenSubKey(name, false);
                if (entry == null || !(IsDrBitProduct(name) || IsDrBitProduct(ReadString(entry, "DisplayName")))) continue;
                found.Add(Expand(ReadString(entry, "InstallLocation")));
                found.Add(Expand(ExecutablePath(ReadString(entry, "DisplayIcon"))));
                found.Add(Expand(ExecutablePath(ReadString(entry, "UninstallString"))));
            }
            catch (Exception e) when (ExpectedDiscoveryError(e))
            {
                // 그 항목만 건너뛴다
            }
        }
    }

    private static void ReadAppPaths(RegistryKey baseKey, List<string?> found)
    {
        using var appPaths = baseKey.OpenSubKey(AppPathsKey, false);
        if (appPaths == null) return;
        foreach (var name in appPaths.GetSubKeyNames().Take(1024))
        {
            if (!(IsDrBitProduct(name) || LooksLikeDrBitProcess(Path.GetFileNameWithoutExtension(name)))) continue;
            try
            {
                using var entry = appPaths.OpenSubKey(name, false);
                if (entry == null) continue;
                found.Add(Expand(ExecutablePath(ReadString(entry, ""))));
                foreach (var folder in ReadString(entry, "Path").Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries).Take(8)) found.Add(Expand(folder));
            }
            catch (Exception e) when (ExpectedDiscoveryError(e))
            {
                // 그 항목만 건너뛴다
            }
        }
    }

    private static List<string?> FixedDriveRoots()
    {
        var roots = new List<string?>();
        try
        {
            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (drive.DriveType == DriveType.Fixed && drive.IsReady) roots.Add(drive.RootDirectory.FullName);
                }
                catch (Exception e) when (ExpectedDiscoveryError(e))
                {
                    // 준비 안 된 드라이브는 건너뛴다
                }
            }
        }
        catch (Exception e) when (ExpectedDiscoveryError(e))
        {
            return roots;
        }
        return roots.OrderBy(root => root, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static List<string?> ProgramFolders()
    {
        var found = new List<string?>();
        var folders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var folder in new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetEnvironmentVariable("ProgramW6432"),
        })
        {
            if (!string.IsNullOrWhiteSpace(folder)) folders.Add(folder!);
        }
        foreach (var folder in folders)
        {
            foreach (var name in new[] { "DrBIT50", "DrBIT", @"BIT\DrBIT50", @"BIT\DrBIT", @"BITComputer\DrBIT50", @"BITComputer\DrBIT" })
            {
                found.Add(Path.Combine(folder, name));
            }
            // 한 단계만 본다. 디스크나 사용자 파일을 훑지 않는다(원본)
            try
            {
                found.AddRange(Directory.EnumerateDirectories(folder, "*DrBIT*", SearchOption.TopDirectoryOnly).Take(32));
            }
            catch (Exception e) when (ExpectedDiscoveryError(e))
            {
                // 읽을 수 없는 폴더는 건너뛴다
            }
        }
        return found;
    }

    private static bool LooksLikeDrBitProcess(string? name)
    {
        if (string.IsNullOrEmpty(name)) return false;
        return name!.StartsWith("BIT", StringComparison.OrdinalIgnoreCase)
            || name.Equals("pBITNewMenu", StringComparison.OrdinalIgnoreCase)
            || (name.StartsWith("DrBIT", StringComparison.OrdinalIgnoreCase) && !name.StartsWith("DrBitExport", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsDrBitProduct(string? name) =>
        !string.IsNullOrEmpty(name) && (name!.IndexOf("DrBIT", StringComparison.OrdinalIgnoreCase) >= 0
            || name.IndexOf("닥터비트", StringComparison.Ordinal) >= 0 || name.IndexOf("닥터 비트", StringComparison.Ordinal) >= 0);

    private static string ReadString(RegistryKey key, string name) =>
        key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string ?? "";

    /// <summary>레지스트리 값에서 실행 파일 경로만(따옴표 안, 또는 .exe까지). 원본 ExecutablePath.</summary>
    public static string? ExecutablePath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value!.Trim();
        if (text.StartsWith("\"", StringComparison.Ordinal))
        {
            var endQuote = text.IndexOf('"', 1);
            return endQuote > 1 ? text.Substring(1, endQuote - 1) : null;
        }
        var extension = text.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
        return extension >= 0 ? text.Substring(0, extension + 4) : text;
    }

    private static bool ExpectedDiscoveryError(Exception exception) =>
        exception is IOException || exception is UnauthorizedAccessException || exception is SecurityException
        || exception is ArgumentException || exception is NotSupportedException || exception is InvalidOperationException
        || exception is Win32Exception;
}
