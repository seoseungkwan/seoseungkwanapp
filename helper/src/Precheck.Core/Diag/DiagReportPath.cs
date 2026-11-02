using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace Precheck.Core.Diag;

/// <summary>보고서 자리: 푼 폴더(app의 부모)가 먼저, 쓸 수 없으면 임시 폴더. 파일 이름에는 시각만 들어간다. 있는 파일을 덮지 않는다.</summary>
public static class DiagReportPath
{
    public static string FileName(DateTime when) =>
        "speed-report-" + when.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".txt";

    public static string[] Folders(string appDirectory, string tempDirectory)
    {
        var parent = Path.GetDirectoryName((appDirectory ?? "").TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        return string.IsNullOrEmpty(parent) ? new[] { tempDirectory } : new[] { parent!, tempDirectory };
    }

    /// <summary>쓸 수 있는 첫 자리에 새 파일을 연다(메모장이 읽을 수 있게 읽기 공유). 어디에도 못 쓰면 IOException.</summary>
    public static Stream Open(IEnumerable<string> folders, DateTime when, out string path)
    {
        if (folders == null) throw new ArgumentNullException(nameof(folders));
        foreach (var folder in folders)
        {
            var candidate = Path.Combine(folder, FileName(when));
            try
            {
                var stream = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                path = candidate;
                return stream;
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is NotSupportedException || e is ArgumentException)
            {
                // 다음 자리를 본다
            }
        }
        throw new IOException();
    }
}
