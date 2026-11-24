using System;
using Precheck.Core.Protocol;

namespace Erp.Core;

/// <summary>
/// 크롬이 ERP 도우미를 켤 수 있는 확장 둘(spec erp-copy-list REQ-3902): 명령 표 확장('ERP 마감일지 채우기', commands.json extensionId)과
/// 'ERP 마감일지 입력 목록'(ListExtensionId). 기존 MessageLoop·OriginGuard(helper/, 고치지 않음)는 명령 표 확장 하나만 보므로
/// 목록 확장이 켰을 때만 첫 인자를 명령 표 확장 origin으로 바꿔 넘긴다. 명령·검사·기록은 두 확장이 똑같다.
/// 크롬도 등록 틀(install/host-manifest.json) allowed_origins로 이 둘만 먼저 거른다.
/// </summary>
public static class ErpCallers
{
    /// <summary>extension-erp-list/manifest.json key로 계산한 ID(크롬 규칙, 32자 a~p, AC-3902.3).</summary>
    public const string ListExtensionId = "gaipapghcaabmmnldghknjmjkknahdae";

    /// <summary>확장 ID의 origin 글자. 크롬이 도우미를 켤 때 첫 인자로 넘기는 모양이고 기존 OriginGuard가 견주는 모양이다.</summary>
    public static string Origin(string extensionId) => "chrome-extension://" + extensionId + "/";

    /// <summary>
    /// 첫 인자가 Origin(ListExtensionId)와 글자 그대로 같으면 첫 인자만 Origin(table.ExtensionId)로 바꾼 새 배열, 아니면 args 그대로(AC-3902.1).
    /// 받은 배열은 고치지 않는다. args·table이 null이면 ArgumentNullException.
    /// </summary>
    public static string[] ForMessageLoop(string[] args, CommandTable table)
    {
        if (args == null) throw new ArgumentNullException(nameof(args));
        if (table == null) throw new ArgumentNullException(nameof(table));
        if (args.Length == 0 || !string.Equals(args[0], Origin(ListExtensionId), StringComparison.Ordinal)) return args;

        var forwarded = (string[])args.Clone();
        forwarded[0] = Origin(table.ExtensionId);
        return forwarded;
    }
}
