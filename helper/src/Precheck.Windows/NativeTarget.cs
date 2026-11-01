using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Precheck.Windows;

/// <summary>
/// BITDoctorOrder.exe 프로세스 규칙: 원본 vendor/secure_bridge/NativeTarget.cs(range_bridge도 같은 글자) 그대로.
/// 등록한 설치 위치의 EXE\BITDoctorOrder.exe, 같은 세션, 같은 사용자, 정확히 하나일 때만 후보다.
/// 원본과 다른 점: 정적 Configure 대신 개체마다 뿌리를 받는다. .NET Framework에 없는 Path.IsPathFullyQualified를 드라이브 경로 검사로 바꿨다.
/// 도우미는 32비트라 비트가 64비트면 MainModule을 읽지 못해 후보가 없다(원본 다리는 64비트였다. 비트 DLL이 32비트라 비트도 32비트로 본다. 의원 PC에서 확인).
/// </summary>
public sealed class NativeTarget
{
    private const uint TokenQuery = 0x0008;
    private const string ProcessName = "BITDoctorOrder";

    private static readonly int Session = Process.GetCurrentProcess().SessionId;
    private static readonly string User = WindowsIdentity.GetCurrent().User?.Value ?? "";

    private readonly string? root;

    /// <param name="installation">등록한 설치 위치. 잘못된 위치면 후보 프로세스가 없다.</param>
    public NativeTarget(string installation)
    {
        root = TryValidateRoot(installation);
    }

    public static bool IsValidRoot(string path) => TryValidateRoot(path) != null;

    private static string? TryValidateRoot(string path)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path) || path.Length > 1024 || !IsFullyQualified(path) || path.StartsWith(@"\\", StringComparison.Ordinal)) return null;
            var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (full.Length < 4 || !Directory.Exists(full)) return null;
            var driveRoot = Path.GetPathRoot(full);
            if (string.IsNullOrEmpty(driveRoot) || new DriveInfo(driveRoot).DriveType != DriveType.Fixed) return null;
            RejectReparseAncestors(full);
            return full;
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException || e is NotSupportedException || e is System.Security.SecurityException)
        {
            return null;
        }
    }

    private static bool IsFullyQualified(string path) =>
        path.Length >= 3 && char.IsLetter(path[0]) && path[1] == ':' && (path[2] == '\\' || path[2] == '/');

    private static void RejectReparseAncestors(string path)
    {
        for (string? current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            if ((File.GetAttributes(current!) & FileAttributes.ReparsePoint) != 0) throw new IOException();
        }
    }

    public static bool PathAllowed(string path, string installation)
    {
        try
        {
            var full = Path.GetFullPath(path);
            var expected = Path.GetFullPath(Path.Combine(installation, "EXE", "BITDoctorOrder.exe"));
            if (!string.Equals(full, expected, StringComparison.OrdinalIgnoreCase)) return false;
            RejectReparseAncestors(full);
            return true;
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException || e is NotSupportedException || e is System.Security.SecurityException)
        {
            return false;
        }
    }

    private static bool SameUser(Process process)
    {
        try
        {
            if (User.Length == 0 || !OpenProcessToken(process.Handle, TokenQuery, out SafeAccessTokenHandle token)) return false;
            using (token)
            using (var identity = new WindowsIdentity(token.DangerousGetHandle()))
            {
                return identity.User?.Value == User;
            }
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return false;
        }
    }

    /// <summary>규칙에 맞는 프로세스 전부. 여럿이면 지문에서 여럿으로 센다.</summary>
    public HashSet<uint> Candidates()
    {
        var ids = new HashSet<uint>();
        if (root == null) return ids;
        foreach (var process in Process.GetProcessesByName(ProcessName))
        {
            using (process)
            {
                try
                {
                    if (process.SessionId == Session && SameUser(process) && PathAllowed(process.MainModule?.FileName ?? "", root))
                    {
                        ids.Add((uint)process.Id);
                    }
                }
                catch (Exception e) when (e is not OutOfMemoryException)
                {
                    // 권한이 없거나 끝나는 중인 프로세스는 후보가 아니다
                }
            }
        }
        return ids;
    }

    /// <summary>정확히 하나일 때만 그 프로세스, 아니면 빈 목록(원본 ProcessIds).</summary>
    public HashSet<uint> ProcessIds()
    {
        var ids = Candidates();
        return ids.Count == 1 ? ids : new HashSet<uint>();
    }

    public bool OwnsControls(nint window, params nint[] controls)
    {
        var ids = ProcessIds();
        if (window == IntPtr.Zero || GetWindowThreadProcessId(window, out uint pid) == 0 || !ids.Contains(pid)) return false;
        foreach (var control in controls)
        {
            if (control == IntPtr.Zero || !IsChild(window, control) || GetWindowThreadProcessId(control, out uint childPid) == 0 || childPid != pid) return false;
        }
        return true;
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(nint process, uint desiredAccess, out SafeAccessTokenHandle token);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsChild(nint parent, nint child);
}
