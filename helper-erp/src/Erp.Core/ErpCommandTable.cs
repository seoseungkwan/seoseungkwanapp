using System.IO;
using Precheck.Core.Protocol;

namespace Erp.Core;

/// <summary>
/// ERP 도우미 명령 표 helper-erp/commands.json(EmbeddedResource "erp-commands.json", spec erp-closing-fill design.md 2절).
/// 맨 위 열쇠 여섯 개가 기존 표와 같은 모양이라 기존 CommandTable.Parse가 고치지 않고 그대로 읽는다(AC-3601.4).
/// 그래서 기존 OriginGuard는 새 확장 origin만 받고, 표에 없는 명령(hello 등)은 기존 Validate가 E-HELPER-UNKNOWN-COMMAND로 막는다(AC-3601.3).
/// </summary>
public static class ErpCommandTable
{
    public const string ResourceName = "erp-commands.json";

    /// <summary>ERP 도우미에 실린 commands.json 바이트 그대로.</summary>
    public static byte[] EmbeddedBytes()
    {
        using var stream = typeof(ErpCommandTable).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidDataException("ERP 명령 표(erp-commands.json)가 도우미에 실려 있지 않다");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    /// <summary>실린 표를 기존 CommandTable.Parse로 읽는다. 표가 틀리면 InvalidDataException.</summary>
    public static CommandTable Load() => CommandTable.Parse(EmbeddedBytes());
}
