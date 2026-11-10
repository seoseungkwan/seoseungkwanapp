using System;
using System.Globalization;
using Precheck.Core.Protocol;

namespace Erp.Core;

/// <summary>
/// ERP 도우미 진단 기록 한 줄 = "시각 명령이름 오류번호"(spec erp-closing-fill AC-3606.3, design.md 3-4 ErpLog). 기존 LogLine과 같은 모양이다.
/// 기존 LogLine은 이름을 기존(웹) 명령 표로 보므로 closing.*를 unknown으로 쓴다. 그래서 이름은 ERP 명령 표에 있는 것만, 없으면 "unknown"
/// (모르는 cmd 글자에 환자 글자가 섞여 올 수 있다). 오류 번호는 'E-…' 모양만, 아니면 "invalid". 값이 없으면 "-". 요청 id·args·예외 글은 쓰지 않는다.
/// </summary>
public static class ErpLogLine
{
    private static readonly Lazy<CommandTable> Table = new Lazy<CommandTable>(ErpCommandTable.Load);

    public static string Format(DateTimeOffset at, string? cmd, string? code)
    {
        var time = at.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture);
        var name = cmd == null ? "-" : Table.Value.Has(cmd) ? cmd : "unknown";
        var number = code == null ? "-" : ErrorCodes.IsCode(code) ? code : "invalid";
        return time + " " + name + " " + number;
    }
}
