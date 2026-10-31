using System;
using System.Globalization;
using System.IO;
using System.Text;
using Precheck.Core.Protocol;

namespace Precheck.Helper;

/// <summary>
/// 진단 기록: %LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\logs\helper-YYYYMMDD.log 에 LogLine 한 줄씩 (AC-001.6).
/// 시각·명령 이름·오류 번호만 쓴다. 요청 내용·예외 글은 받지도 않는다. 기록이 안 되면 조용히 넘어간다
/// (표준 출력·표준 오류에는 아무것도 쓰지 않는다).
/// </summary>
internal sealed class DiagnosticLog
{
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private readonly object gate = new object();
    private readonly string? folder;

    public DiagnosticLog()
    {
        try
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            folder = string.IsNullOrEmpty(local) ? null : Path.Combine(local, "Seoseungkwan", "PrecheckHelper", "logs");
        }
        catch (Exception)
        {
            folder = null;
        }
    }

    public void Write(string? cmd, string? code)
    {
        if (folder == null) return;
        try
        {
            var now = DateTimeOffset.Now;
            var line = LogLine.Format(now, cmd, code) + "\r\n";
            var file = Path.Combine(folder, "helper-" + now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ".log");
            lock (gate)
            {
                Directory.CreateDirectory(folder);
                File.AppendAllText(file, line, Utf8);
            }
        }
        catch (Exception)
        {
            // 기록 실패로 도우미를 멈추지 않는다
        }
    }
}
