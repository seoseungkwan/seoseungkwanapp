using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using Precheck.Core.Protocol;

namespace Erp.Core.Uisarang;

/// <summary>
/// 실제 엑셀 폴더(바탕화면\ERP마감 또는 사용자 폴더\ERP마감, spec erp-uisarang design.md 4-1·4-3, AC-4202.2).
/// - 만들 때: 폴더가 없으면 만든다(중간 폴더까지). 폴더가 연결(reparse)이거나 만들 수 없으면 E-UIS-FOLDER
/// - List: 바로 아래 확장자 .xls(대소문자 무시) 보통 파일만 이름 차례. 하위 폴더·다른 확장자·연결 파일은 내지 않는다. 못 읽으면 E-UIS-FOLDER
/// - IsOpen: 독점(FileShare.None) 열기가 안 되면 true · Read: 바이트 그대로, 못 읽으면 UisFileException · Delete: 못 지우면 false(예외 없음)
/// 오류에는 번호·고정 글만 싣는다: 폴더 경로(사용자 이름이 든다)·파일 이름·안쪽 예외를 싣지 않는다(AC-4209.1·4209.4).
/// </summary>
public sealed class UisDiskFolder : IUisFolder
{
    /// <summary>엑셀 폴더를 만들 수 없음·연결(reparse)·목록을 못 읽음(design.md 3-5).</summary>
    public const string FolderFailed = "E-UIS-FOLDER";

    private const string Extension = ".xls";

    private readonly string path;

    public UisDiskFolder(string path)
    {
        if (path == null) throw new ArgumentNullException(nameof(path));
        try
        {
            this.path = Path.GetFullPath(path);
            Directory.CreateDirectory(this.path);
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            throw Failed();
        }
        RequirePlainFolder();
    }

    public IReadOnlyList<UisFile> List()
    {
        RequirePlainFolder();
        try
        {
            // *.xls 무늬로 찾지 않는다: 윈도우는 짧은 이름(8.3) 때문에 *.xls가 .xlsx도 잡는다. 확장자 글자로 거른다
            return new DirectoryInfo(path)
                .EnumerateFiles()
                .Where(file => (file.Attributes & FileAttributes.ReparsePoint) == 0)
                .Where(file => string.Equals(file.Extension, Extension, StringComparison.OrdinalIgnoreCase))
                .Select(file => new UisFile(file.Name, file.Length))
                .OrderBy(file => file.Name, StringComparer.Ordinal)
                .ToList();
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            throw Failed();
        }
    }

    public bool IsOpen(UisFile file)
    {
        var full = PathOf(file);
        try
        {
            using (new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.None))
            {
                return false;
            }
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            return true;
        }
    }

    public byte[] Read(UisFile file)
    {
        var full = PathOf(file);
        try
        {
            if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) throw new UisFileException();
            return File.ReadAllBytes(full);
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            throw new UisFileException();
        }
    }

    public bool Delete(UisFile file)
    {
        var full = PathOf(file);
        try
        {
            var info = new FileInfo(full);
            if (!info.Exists) return true;
            // 읽기 전용 표시가 있어도 지운다(환자별 엑셀이 남지 않게)
            if ((info.Attributes & FileAttributes.ReadOnly) != 0) info.Attributes &= ~FileAttributes.ReadOnly;
            info.Delete();
            return !File.Exists(full);
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            return false;
        }
    }

    /// <summary>폴더가 있고 연결(reparse)이 아닌가. 아니면 E-UIS-FOLDER.</summary>
    private void RequirePlainFolder()
    {
        FileAttributes attributes;
        try
        {
            attributes = File.GetAttributes(path);
        }
        catch (Exception e) when (IsFileSystemFailure(e))
        {
            throw Failed();
        }
        if ((attributes & FileAttributes.Directory) == 0 || (attributes & FileAttributes.ReparsePoint) != 0) throw Failed();
    }

    /// <summary>폴더 바로 아래 .xls 이름만 받는다(경로 글자·..·다른 확장자는 부르는 쪽 잘못).</summary>
    private string PathOf(UisFile file)
    {
        if (file == null) throw new ArgumentNullException(nameof(file));
        var name = file.Name;
        if (name.Length == 0
            || name.IndexOfAny(new[] { '/', '\\', ':' }) >= 0
            || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || name.Trim('.').Length == 0
            || !string.Equals(Path.GetExtension(name), Extension, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("엑셀 폴더 바로 아래 .xls 이름이 아니다", nameof(file));
        }
        return Path.Combine(path, name);
    }

    private static HelperException Failed() => new HelperException(FolderFailed);

    private static bool IsFileSystemFailure(Exception e) =>
        e is IOException
        || e is UnauthorizedAccessException
        || e is SecurityException
        || e is ArgumentException
        || e is NotSupportedException;
}
