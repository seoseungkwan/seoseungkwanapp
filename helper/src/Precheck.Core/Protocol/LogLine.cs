using System;
using System.Globalization;

namespace Precheck.Core.Protocol;

/// <summary>
/// 진단 기록 한 줄 = "시각 명령이름 오류번호" (AC-001.6). 요청 id·args·예외 글은 쓰지 않는다.
/// 명령 이름은 표에 있는 이름만, 없으면 "unknown"(모르는 cmd 글자에 환자 글자가 섞여 올 수 있다).
/// 오류 번호는 'E-…' 모양만, 아니면 "invalid". 값이 없으면 "-".
/// </summary>
public static class LogLine
{
    private static readonly Lazy<CommandTable> Table = new Lazy<CommandTable>(CommandTable.LoadEmbedded);

    public static string Format(DateTimeOffset at, string? cmd, string? code)
    {
        var time = at.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture);
        var name = cmd == null ? "-" : Table.Value.Has(cmd) ? cmd : "unknown";
        var number = code == null ? "-" : ErrorCodes.IsCode(code) ? code : "invalid";
        return time + " " + name + " " + number;
    }
}
