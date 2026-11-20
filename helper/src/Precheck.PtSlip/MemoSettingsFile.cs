using System;
using System.IO;
using System.Security;
using System.Text;

namespace Precheck.PtSlip;

/// <summary>
/// 주사 차수 설정 파일 글 읽기·쓰기(AC-7504.1). 자리는 %LOCALAPPDATA%\PtSlip\memo-settings.json(PT 종이 settings.json 옆).
/// 글의 모양(JSON)·기본값·깨진 파일 처리는 Core MemoSettings가 정한다. 설정(단축키·단추 자리)만 들고 환자 값은 들어가지 않는다.
/// </summary>
public static class MemoSettingsFile
{
    public const string FileName = "memo-settings.json";

    private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);

    /// <summary>%LOCALAPPDATA%\PtSlip\memo-settings.json</summary>
    public static string FilePath => Path.Combine(SettingsFile.Folder, FileName);

    /// <summary>설정 글. 파일이 없거나 읽지 못하면 null(부르는 쪽이 기본값을 쓴다)</summary>
    public static string? ReadText()
    {
        try
        {
            var path = FilePath;
            if (!File.Exists(path)) return null;
            // BOM이 있으면 알아서 건너뛴다(메모장으로 고친 파일)
            return File.ReadAllText(path, Encoding.UTF8);
        }
        catch (Exception e) when (IsFileError(e))
        {
            return null;
        }
    }

    /// <summary>
    /// 설정 글을 쓴다. 같은 폴더의 임시 파일에 UTF-8(BOM 없음)로 다 쓴 뒤 바꿔 넣어, 쓰다 끊겨도 반쪽 파일이 남지 않는다(SettingsFile과 같다).
    /// 쓰지 못하면 예외(IOException 등)를 그대로 던진다.
    /// </summary>
    public static void WriteText(string json)
    {
        if (json == null) throw new ArgumentNullException(nameof(json));
        var folder = SettingsFile.Folder;
        Directory.CreateDirectory(folder);
        var target = Path.Combine(folder, FileName);
        var temp = Path.Combine(folder, FileName + "." + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            File.WriteAllText(temp, json, Utf8NoBom);
            if (File.Exists(target))
            {
                File.Replace(temp, target, null, ignoreMetadataErrors: true);
            }
            else
            {
                File.Move(temp, target);
            }
        }
        finally
        {
            if (File.Exists(temp))
            {
                try { File.Delete(temp); } catch (Exception e) when (IsFileError(e)) { /* 남은 임시 파일은 다음에 덮인다 */ }
            }
        }
    }

    private static bool IsFileError(Exception e) =>
        e is IOException || e is UnauthorizedAccessException || e is SecurityException || e is NotSupportedException || e is ArgumentException;
}
