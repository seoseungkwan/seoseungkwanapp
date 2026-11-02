using System;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;

namespace Precheck.Core.Diag;

/// <summary>이 빌드의 커밋. Actions의 GITHUB_SHA가 Precheck.Core.csproj에서 어셈블리 정보로 들어온다. 없으면 unknown.</summary>
public static class DiagCommit
{
    private const string Key = "DiagCommit";
    private const int ShownLength = 12;
    private static readonly Regex Shape = new Regex(@"^[0-9a-fA-F]{7,40}\z", RegexOptions.CultureInvariant);

    public static string Value { get; } = Clean(
        typeof(DiagCommit).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == Key)?.Value);

    public static string Clean(string? raw)
    {
        if (raw == null || !Shape.IsMatch(raw)) return "unknown";
        var lower = raw.ToLowerInvariant();
        return lower.Length <= ShownLength ? lower : lower.Substring(0, ShownLength);
    }
}
