using System;
using System.IO;
using System.Security;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>
/// 원본 NativeEnvironmentGuard의 윈도우 부분: 윈도우 드라이브의 DrBIT50\Environment\DrBIT50Environment.ini를 공유 읽기로 열어
/// Core NativeEnvironmentFile 규칙으로 Path·Bin만 읽는다. 비트 모듈을 켜거나 설정을 고치지 않는다.
/// 고르는 규칙(Path·Bin 일치, C:\DrBIT50)은 Core BitInstallRules.MatchesEnvironment에 있다.
/// </summary>
public static class NativeEnvironmentGuard
{
    /// <summary>윈도우가 깔린 드라이브 뿌리(`C:\`).</summary>
    public static string SystemDrive() => Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\";

    /// <summary>비트 환경 파일 위치(원본 ConfigurationPath).</summary>
    public static string ConfigurationPath() => BitInstallRules.EnvironmentFile(SystemDrive());

    /// <summary>환경 파일의 첫 Setting 줄 Path·Bin. 없거나 읽지 못하면 null(내용·접속 정보는 어디에도 쓰지 않는다).</summary>
    public static BitEnvironment? Read(string file)
    {
        try
        {
            if (!File.Exists(file)) return null;
            using var input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            return NativeEnvironmentFile.Parse(input);
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
        catch (SecurityException)
        {
            return null;
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }

    /// <summary>환경 파일에 적힌 설치 위치(원본 FindConfiguredRoot). 첫 후보로 쓴다.</summary>
    public static string? FindConfiguredRoot() => Read(ConfigurationPath())?.Path;

    /// <summary>원본 Validate: 고른 폴더가 환경 파일·지원 위치와 맞는가.</summary>
    public static bool Validate(string installationRoot) =>
        BitInstallRules.MatchesEnvironment(installationRoot, new LocalFileProbe(), SystemDrive());
}
