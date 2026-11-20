using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 뽑은 기록 한 줄(spec doc-print AC-7401.3, %LOCALAPPDATA%\PtSlip\doc-log.tsv): 다 보낸 인쇄 하나.
/// 탭으로 나눈 9칸 = 날짜(yyyy-MM-dd)·시각(HH:mm:ss)·차트번호·이름·서류 이름들(" · ", 서류 차례)·기간 시작·끝(yyyy-MM-dd)·고른 날 수·장 수.
/// 차트번호·이름 안의 탭·줄바꿈은 빈칸으로 바꾼다. 이 파일 말고는 환자 값을 남기지 않는다.
/// </summary>
public sealed class DocLogLine
{
    private const string DateFormat = "yyyy-MM-dd";
    private const string TimeFormat = "HH:mm:ss";
    private const string KindSeparator = " · ";
    private const int Columns = 9;

    public DocLogLine(DateTime at, string chart, string name, IEnumerable<DocKind> kinds, DateTime from, DateTime to, int days, int pages)
    {
        At = new DateTime(at.Year, at.Month, at.Day, at.Hour, at.Minute, at.Second);
        Chart = OneLine(chart);
        Name = OneLine(name);
        Kinds = DocNames.Normalize(kinds);
        From = from.Date;
        To = to.Date;
        Days = days;
        Pages = pages;
    }

    /// <summary>다 보낸 때(초까지).</summary>
    public DateTime At { get; }

    public string Chart { get; }

    public string Name { get; }

    public IReadOnlyList<DocKind> Kinds { get; }

    public DateTime From { get; }

    public DateTime To { get; }

    /// <summary>고른 날 수(기록 창의 '(N일)').</summary>
    public int Days { get; }

    public int Pages { get; }

    /// <summary>기록 창 '뽑은 때': yyyy-MM-dd HH:mm.</summary>
    public string AtText => At.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);

    /// <summary>기록 창 '서류': 진료비 영수증 · 진료비 세부내역서.</summary>
    public string KindsText => string.Join(KindSeparator, Kinds.Select(DocNames.Of));

    /// <summary>기록 창 '기간': YYYY-MM-DD ~ YYYY-MM-DD (N일).</summary>
    public string RangeText => Day(From) + " ~ " + Day(To) + " (" + Days.ToString(CultureInfo.InvariantCulture) + "일)";

    public string ToTsv() => string.Join("\t", new[]
    {
        Day(At),
        At.ToString(TimeFormat, CultureInfo.InvariantCulture),
        Chart,
        Name,
        KindsText,
        Day(From),
        Day(To),
        Days.ToString(CultureInfo.InvariantCulture),
        Pages.ToString(CultureInfo.InvariantCulture),
    });

    /// <summary>파일 한 줄 → 기록. 칸 수·날짜·시각·서류 이름·숫자(0 이상) 중 하나라도 틀리면 null(그 줄만 건너뛴다).</summary>
    public static DocLogLine? Parse(string? line)
    {
        if (string.IsNullOrEmpty(line)) return null;
        var parts = line!.Split('\t');
        if (parts.Length != Columns) return null;
        if (!DateTime.TryParseExact(parts[0] + " " + parts[1], DateFormat + " " + TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var at)) return null;
        var kinds = new List<DocKind>();
        foreach (var name in parts[4].Split(new[] { KindSeparator }, StringSplitOptions.None))
        {
            var kind = DocNames.Find(name);
            if (kind == null) return null;
            kinds.Add(kind.Value);
        }
        if (!ParseDay(parts[5], out var from) || !ParseDay(parts[6], out var to)) return null;
        if (!ParseCount(parts[7], out var days) || !ParseCount(parts[8], out var pages)) return null;
        return new DocLogLine(at, parts[2], parts[3], kinds, from, to, days, pages);
    }

    private static string Day(DateTime value) => value.ToString(DateFormat, CultureInfo.InvariantCulture);

    private static string OneLine(string? text) => (text ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');

    private static bool ParseDay(string text, out DateTime day) =>
        DateTime.TryParseExact(text, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    private static bool ParseCount(string text, out int value) =>
        int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out value);
}

/// <summary>[뽑은 기록 보기](AC-7401.3): 최근 것부터, 차트번호·이름으로 거르기. 파일 읽기는 윈도우 층(DocFiles)이 한다.</summary>
public static class DocLog
{
    /// <summary>
    /// 파일 줄들 → 읽을 수 있는 기록만, 뽑은 때가 늦은 것부터(같은 때면 파일 뒤쪽 줄이 먼저).
    /// 거르기 글이 숫자만이면 차트번호에 그 숫자(앞 0 뺌)가 든 것, 아니면 이름에 그 글이 든 것. 빈 거르기는 모두.
    /// </summary>
    public static IReadOnlyList<DocLogLine> Recent(IEnumerable<string>? lines, string? filter)
    {
        var parsed = (lines ?? Enumerable.Empty<string>())
            .Select((text, index) => (Line: DocLogLine.Parse(text), Index: index))
            .Where(item => item.Line != null)
            .Select(item => (Line: item.Line!, item.Index));
        var match = Matcher(filter);
        return parsed
            .Where(item => match(item.Line))
            .OrderByDescending(item => item.Line.At)
            .ThenByDescending(item => item.Index)
            .Select(item => item.Line)
            .ToArray();
    }

    private static Func<DocLogLine, bool> Matcher(string? filter)
    {
        var text = (filter ?? "").Trim();
        if (text.Length == 0) return _ => true;
        if (text.All(c => c >= '0' && c <= '9'))
        {
            var digits = text.TrimStart('0');
            if (digits.Length == 0) digits = text;
            return line => line.Chart.IndexOf(digits, StringComparison.Ordinal) >= 0;
        }
        return line => line.Name.IndexOf(text, StringComparison.Ordinal) >= 0;
    }
}
