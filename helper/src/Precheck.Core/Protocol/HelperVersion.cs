using System.Reflection;

namespace Precheck.Core.Protocol;

/// <summary>도우미 버전 = helper/Directory.Build.props의 Version (AC-001.4). 어셈블리 정보 버전에서 읽는다.</summary>
public static class HelperVersion
{
    public static string Value { get; } = Read();

    private static string Read()
    {
        var assembly = typeof(HelperVersion).Assembly;
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        var version = string.IsNullOrEmpty(informational) ? assembly.GetName().Version?.ToString(3) ?? "0.0.0" : informational!;
        // 빌드 도구가 +커밋을 붙였으면 뗀다
        var plus = version.IndexOf('+');
        return plus >= 0 ? version.Substring(0, plus) : version;
    }
}
