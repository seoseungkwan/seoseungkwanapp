using System;

namespace Precheck.Core.Protocol;

/// <summary>도우미를 켠 쪽. 부른 쪽마다 받는 명령 구역이 다르다 (spec erp-closing-fill design.md 3-1, AC-3601.3).</summary>
public enum Caller
{
    /// <summary>기존 확장 '청구 사전점검 연결'(웹 사이트가 부름). commands.json의 commands 구역.</summary>
    Web,

    /// <summary>새 확장 'ERP 마감일지 채우기'. commands.json의 erp.commands 구역.</summary>
    Erp,
}

/// <summary>
/// 크롬이 도우미를 켤 때 넘기는 첫 인자(호출 origin)가 우리 확장인지 본다 (AC-001.3, AC-3601.3).
/// 윈도우에서는 뒤에 --parent-window=&lt;번호&gt; 인자가 더 온다(크롬 규칙). 첫 인자만 본다.
/// </summary>
public static class OriginGuard
{
    public static bool IsAllowed(string[]? args, CommandTable table) => CallerOf(args, table) != null;

    /// <summary>기존 확장이면 Web, 새 확장이면 Erp, 그 밖(글자가 조금이라도 다름)이면 null.</summary>
    public static Caller? CallerOf(string[]? args, CommandTable table)
    {
        if (table == null) throw new ArgumentNullException(nameof(table));
        if (args == null || args.Length < 1) return null;
        if (IsOriginOf(args[0], table.ExtensionId)) return Caller.Web;
        if (table.ErpExtensionId != null && IsOriginOf(args[0], table.ErpExtensionId)) return Caller.Erp;
        return null;
    }

    private static bool IsOriginOf(string? arg, string extensionId) =>
        string.Equals(arg, "chrome-extension://" + extensionId + "/", StringComparison.Ordinal);
}
