using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace Erp.Core.Tests.Uisarang.Folder;

/// <summary>
/// 시험마다 새로 만들고 지우는 실제 임시 폴더(spec erp-uisarang TASK-9, design.md 4-1 UisDiskFolder·4-4 UisCache).
/// 지울 때 읽기 전용 표시를 풀고, 연결(reparse)은 연결만 지운다(가리키는 곳은 건드리지 않는다). 못 지우면 그냥 둔다(시험 결과와 상관없음).
/// </summary>
internal sealed class UisTempDir : IDisposable
{
    public UisTempDir()
    {
        Root = Path.Combine(Path.GetTempPath(), "erp-uis-folder-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Root);
    }

    public string Root { get; }

    public string PathOf(params string[] parts) => Path.Combine(new[] { Root }.Concat(parts).ToArray());

    /// <summary>Root 아래 파일 하나를 만든다(중간 폴더까지).</summary>
    public string Write(string relative, byte[] bytes)
    {
        var path = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    public string Write(string relative, string text) => Write(relative, Encoding.UTF8.GetBytes(text));

    public void Dispose() => Remove(Root);

    private static void Remove(string dir)
    {
        try
        {
            if (!Directory.Exists(dir)) return;
            foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos())
            {
                if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
                {
                    if (entry is DirectoryInfo link) link.Delete();
                    else entry.Delete();
                    continue;
                }
                if (entry is DirectoryInfo sub)
                {
                    Remove(sub.FullName);
                    continue;
                }
                entry.Attributes = FileAttributes.Normal;
                entry.Delete();
            }
            Directory.Delete(dir);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}

/// <summary>
/// 시험용 연결(reparse) 만들기. 폴더 연결은 윈도우에서 디렉터리 연결(junction, 관리자 권한 없이 된다), 그 밖은 심볼릭 링크.
/// 파일 연결(심볼릭 링크)은 윈도우에서 개발자 모드·관리자 권한이 있어야 해 만들 수 없으면 false(그 시험은 건너뛴다).
/// </summary>
internal static class UisLinks
{
    public static bool OnWindows => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public static bool TryFolderLink(string link, string target)
    {
        try
        {
            if (OnWindows)
            {
                RunCmd($"mklink /J \"{link}\" \"{target}\"");
            }
            else
            {
#if NET
                Directory.CreateSymbolicLink(link, target);
#else
                return false;
#endif
            }
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is Win32Exception)
        {
            return false;
        }
        return IsLink(link);
    }

    public static bool TryFileLink(string link, string target)
    {
        try
        {
#if NET
            File.CreateSymbolicLink(link, target);
#else
            if (!OnWindows) return false;
            RunCmd($"mklink \"{link}\" \"{target}\"");
#endif
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is Win32Exception)
        {
            return false;
        }
        return IsLink(link);
    }

    public static bool IsLink(string path)
    {
        try
        {
            return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static void RunCmd(string arguments)
    {
        var info = new ProcessStartInfo("cmd.exe", "/d /c " + arguments)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using var process = Process.Start(info) ?? throw new IOException("cmd를 켜지 못했다");
        process.StandardOutput.ReadToEnd();
        process.StandardError.ReadToEnd();
        process.WaitForExit(30_000);
    }
}
