using System;
using System.Globalization;
using System.IO;
using System.Text;
using Erp.Core;

namespace Erp.Helper;

/// <summary>
/// ERP 도우미 진단 기록(spec erp-closing-fill design.md 3-4, AC-3606.3·AC-3611.2):
/// %LOCALAPPDATA%\Seoseungkwan\ErpHelper\logs\erp-helper-YYYYMMDD.log 에 ErpLogLine 한 줄씩. 기존 도우미 기록과 같은 모양(시각·명령 이름·오류 번호)이고,
/// 이름은 ERP 명령 표로 본다(기존 LogLine은 웹 표로 보므로 쓰지 않는다). 요청 내용·예외 글은 받지도 않는다.
/// 기록이 안 되면 조용히 넘어간다(표준 출력·표준 오류에는 아무것도 쓰지 않는다).
/// </summary>
internal sealed class ErpLog
{
    /// <summary>등록 모드(--register) 줄의 이름 칸. 크롬 명령이 아니라 ERP 명령 표에 없으므로 고정 글자로 쓴다.</summary>
    public const string RegisterName = "register";

    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private readonly object gate = new object();
    private readonly string? folder;

    public ErpLog()
    {
        try
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            folder = string.IsNullOrEmpty(local) ? null : Path.Combine(local, "Seoseungkwan", "ErpHelper", "logs");
        }
        catch (Exception)
        {
            folder = null;
        }
    }

    /// <summary>명령 한 줄(Dispatcher·MessageLoop가 부른다).</summary>
    public void Write(string? cmd, string? code)
    {
        try
        {
            var now = DateTimeOffset.Now;
            Append(now, ErpLogLine.Format(now, cmd, code));
        }
        catch (Exception)
        {
            // 기록 실패로 도우미를 멈추지 않는다
        }
    }

    /// <summary>
    /// 등록 모드 한 줄 = "시각 register 오류번호". ErpLogLine은 ERP 표에 없는 이름을 unknown으로 쓰므로,
    /// 이름 칸(이름 없음 '-')만 고정 글자 register로 바꾼다. 시각·오류 번호 칸은 ErpLogLine 그대로다(시각에는 빈칸이 없다).
    /// </summary>
    public void WriteRegister(string? code)
    {
        try
        {
            var now = DateTimeOffset.Now;
            var parts = ErpLogLine.Format(now, null, code).Split(' ');
            parts[1] = RegisterName;
            Append(now, string.Join(" ", parts));
        }
        catch (Exception)
        {
            // 기록 실패로 등록을 멈추지 않는다
        }
    }

    private void Append(DateTimeOffset now, string line)
    {
        if (folder == null) return;
        var file = Path.Combine(folder, "erp-helper-" + now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ".log");
        lock (gate)
        {
            Directory.CreateDirectory(folder);
            File.AppendAllText(file, line + "\r\n", Utf8);
        }
    }
}
