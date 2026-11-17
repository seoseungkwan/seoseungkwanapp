using System;
using System.IO;
using System.Security;
using System.Text;

namespace Precheck.PtSlip;

/// <summary>
/// 설정 파일 글 읽기·쓰기(AC-6403.4). 자리는 %LOCALAPPDATA%\PtSlip\settings.json.
/// 글의 모양(JSON)은 Core의 SlipSettingsRules가 정한다. 여기에는 설정만 들고 환자 값은 들어가지 않는다(AC-6403.5).
/// </summary>
public static class SettingsFile
{
    public const string FolderName = "PtSlip";
    public const string FileName = "settings.json";

    private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);

    /// <summary>%LOCALAPPDATA%\PtSlip</summary>
    public static string Folder => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), FolderName);

    /// <summary>%LOCALAPPDATA%\PtSlip\settings.json</summary>
    public static string FilePath => Path.Combine(Folder, FileName);

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
    /// 설정 글을 쓴다. 같은 폴더의 임시 파일에 UTF-8(BOM 없음)로 다 쓴 뒤 바꿔 넣어, 쓰다 끊겨도 반쪽 파일이 남지 않는다.
    /// 쓰지 못하면 예외(IOException 등)를 그대로 던진다.
    /// </summary>
    public static void WriteText(string json)
    {
        if (json == null) throw new ArgumentNullException(nameof(json));
        var folder = Folder;
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

    /// <summary>이 프로그램 종이에만 쓰는 프린터 드라이버 설정(DEVMODE) 파일. 첫 줄 프린터 이름, 둘째 줄 base64</summary>
    public const string DriverFileName = "printer-driver.txt";

    /// <summary>[프린터 종이 설정]에서 저장한 그 프린터의 드라이버 설정. 없거나 다른 프린터 것이거나 못 읽으면 null</summary>
    public static byte[]? ReadDriverSettings(string printerName)
    {
        try
        {
            var path = Path.Combine(Folder, DriverFileName);
            if (!File.Exists(path)) return null;
            var lines = File.ReadAllLines(path, Encoding.UTF8);
            if (lines.Length < 2 || lines[0] != printerName) return null;
            return Convert.FromBase64String(lines[1].Trim());
        }
        catch (Exception e) when (IsFileError(e) || e is FormatException)
        {
            return null;
        }
    }

    /// <summary>그 프린터의 드라이버 설정을 쓴다(한 프린터 것만 둔다). 쓰지 못하면 예외</summary>
    public static void WriteDriverSettings(string printerName, byte[] devmode)
    {
        if (printerName == null) throw new ArgumentNullException(nameof(printerName));
        if (devmode == null) throw new ArgumentNullException(nameof(devmode));
        Directory.CreateDirectory(Folder);
        File.WriteAllText(Path.Combine(Folder, DriverFileName), printerName + "\r\n" + Convert.ToBase64String(devmode) + "\r\n", Utf8NoBom);
    }

    /// <summary>'빅솔론에 직접 보내기'를 켰다는 표시 파일(있으면 켬)</summary>
    public const string DirectFileName = "direct-slcs.txt";

    /// <summary>'빅솔론에 직접 보내기'가 켜져 있나. 못 읽으면 꺼짐</summary>
    public static bool ReadDirectMode()
    {
        try
        {
            return File.Exists(Path.Combine(Folder, DirectFileName));
        }
        catch (Exception e) when (IsFileError(e))
        {
            return false;
        }
    }

    /// <summary>'빅솔론에 직접 보내기' 켜기·끄기. 쓰지 못하면 예외</summary>
    public static void WriteDirectMode(bool on)
    {
        var path = Path.Combine(Folder, DirectFileName);
        if (on)
        {
            Directory.CreateDirectory(Folder);
            File.WriteAllText(path, "on", Utf8NoBom);
        }
        else if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private static bool IsFileError(Exception e) =>
        e is IOException || e is UnauthorizedAccessException || e is SecurityException || e is NotSupportedException || e is ArgumentException;
}
