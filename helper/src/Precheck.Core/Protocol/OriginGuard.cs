using System;

namespace Precheck.Core.Protocol;

/// <summary>
/// 크롬이 도우미를 켤 때 넘기는 첫 인자(호출 origin)가 우리 확장인지 본다 (AC-001.3).
/// 윈도우에서는 뒤에 --parent-window=&lt;번호&gt; 인자가 더 온다(크롬 규칙). 첫 인자만 본다.
/// </summary>
public static class OriginGuard
{
    public static bool IsAllowed(string[]? args, CommandTable table)
    {
        if (table == null) throw new ArgumentNullException(nameof(table));
        return args != null && args.Length >= 1
            && string.Equals(args[0], "chrome-extension://" + table.ExtensionId + "/", StringComparison.Ordinal);
    }
}
