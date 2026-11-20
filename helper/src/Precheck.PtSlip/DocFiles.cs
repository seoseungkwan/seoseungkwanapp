using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using System.Text;

namespace Precheck.PtSlip;

/// <summary>
/// 서류 설정·뽑은 기록 파일 글 읽기·쓰기(REQ-7401). 자리는 PT 종이 설정과 같은 %LOCALAPPDATA%\PtSlip 안
/// doc-settings.json(설정, 환자 값 없음)과 doc-log.tsv(뽑은 기록, 이 PC 안에만). 글의 모양(JSON·TSV 줄)은 Core가 정하고 여기는 읽고 쓰기만 한다.
/// 환자 값은 doc-log.tsv 말고는 어디에도 남기지 않는다(AC-7406.3).
/// </summary>
public static class DocFiles
{
    public const string SettingsFileName = "doc-settings.json";
    public const string LogFileName = "doc-log.tsv";

    private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);

    /// <summary>%LOCALAPPDATA%\PtSlip\doc-settings.json</summary>
    public static string SettingsPath => Path.Combine(SettingsFile.Folder, SettingsFileName);

    /// <summary>%LOCALAPPDATA%\PtSlip\doc-log.tsv</summary>
    public static string LogPath => Path.Combine(SettingsFile.Folder, LogFileName);

    /// <summary>서류 설정 글. 파일이 없거나 읽지 못하면 null(부르는 쪽이 기본값을 쓴다)</summary>
    public static string? ReadText()
    {
        try
        {
            var path = SettingsPath;
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
    /// 서류 설정 글을 쓴다(SettingsFile.WriteText와 같은 방식). 같은 폴더의 임시 파일에 UTF-8(BOM 없음)로 다 쓴 뒤 바꿔 넣어,
    /// 쓰다 끊겨도 반쪽 파일이 남지 않는다. 쓰지 못하면 예외(IOException 등)를 그대로 던진다.
    /// </summary>
    public static void WriteText(string json)
    {
        if (json == null) throw new ArgumentNullException(nameof(json));
        var folder = SettingsFile.Folder;
        Directory.CreateDirectory(folder);
        var target = Path.Combine(folder, SettingsFileName);
        var temp = Path.Combine(folder, SettingsFileName + "." + Guid.NewGuid().ToString("N") + ".tmp");
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

    /// <summary>
    /// 뽑은 기록 한 줄을 doc-log.tsv 끝에 더한다(UTF-8, BOM 없음, 줄 끝 CR LF). 줄 안 탭·줄바꿈 정리는 Core(DocLogLine.ToTsv)가 한다:
    /// 줄바꿈이 든 글이 오면 파일이 깨지지 않게 쓰지 않고 예외. 쓰지 못하면 예외(IOException 등)를 그대로 던진다.
    /// </summary>
    public static void AppendLine(string line)
    {
        if (line == null) throw new ArgumentNullException(nameof(line));
        if (line.IndexOf('\r') >= 0 || line.IndexOf('\n') >= 0) throw new ArgumentException("기록 한 줄에 줄바꿈이 들었다", nameof(line));
        Directory.CreateDirectory(SettingsFile.Folder);
        File.AppendAllText(LogPath, line + "\r\n", Utf8NoBom);
    }

    /// <summary>doc-log.tsv의 줄들(파일 차례 그대로). 파일이 없거나 읽지 못하면 빈 목록</summary>
    public static IReadOnlyList<string> ReadLines()
    {
        try
        {
            var path = LogPath;
            if (!File.Exists(path)) return Array.Empty<string>();
            return File.ReadAllLines(path, Encoding.UTF8);
        }
        catch (Exception e) when (IsFileError(e))
        {
            return Array.Empty<string>();
        }
    }

    private static bool IsFileError(Exception e) =>
        e is IOException || e is UnauthorizedAccessException || e is SecurityException || e is NotSupportedException || e is ArgumentException;
}
