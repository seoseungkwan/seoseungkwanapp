using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 확인 보고서 자리(AC-1401.11): 푼 폴더(app의 부모)가 먼저, 쓸 수 없으면 임시 폴더. 파일 이름에는 시각만 들어간다.
/// 있는 파일을 덮지 않는다(diag-read-speed의 DiagReportPath와 같은 규칙).
/// </summary>
public static class CheckReportPath
{
    public static string FileName(DateTime when) =>
        "reception-check-" + when.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".txt";

    public static IReadOnlyList<string> Folders(string appDirectory, string tempDirectory)
    {
        var trimmed = (appDirectory ?? "").TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        // .NET Framework 4.8의 Path.GetDirectoryName은 빈 글자에 ArgumentException을 던진다(.NET 10은 null)
        var parent = trimmed.Length == 0 ? null : Path.GetDirectoryName(trimmed);
        return string.IsNullOrEmpty(parent) ? new[] { tempDirectory } : new[] { parent!, tempDirectory };
    }

    /// <summary>쓸 수 있는 첫 자리에 새 파일을 연다(메모장이 읽을 수 있게 읽기 공유). 어디에도 못 쓰면 IOException.</summary>
    public static Stream Open(IEnumerable<string> folders, DateTime when, out string path)
    {
        if (folders == null) throw new ArgumentNullException(nameof(folders));
        foreach (var folder in folders)
        {
            if (string.IsNullOrEmpty(folder)) continue;
            var candidate = Path.Combine(folder, FileName(when));
            try
            {
                var stream = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                path = candidate;
                return stream;
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is NotSupportedException || e is ArgumentException)
            {
                // 다음 자리를 본다(오류 글에는 경로가 섞이므로 싣지 않는다)
            }
        }
        throw new IOException();
    }
}
