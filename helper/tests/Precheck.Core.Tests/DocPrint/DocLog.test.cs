using System;
using System.Linq;
using Precheck.Core.DocPrint;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print AC-7401.3: 뽑은 기록 한 줄(doc-log.tsv)과 [뽑은 기록 보기] 거르기·차례.
/// 파일 쓰기는 윈도우 층(DocFiles)이 한다. 차트번호·이름은 지어낸 것(9로 시작하는 번호, '가상환자NN').
/// </summary>
public class DocLogTests
{
    private static DocLogLine Line(DateTime at, string chart, string name, params DocKind[] kinds) =>
        new DocLogLine(at, chart, name, kinds, new DateTime(2026, 11, 1), new DateTime(2026, 11, 20), 7, 9);

    [Fact(DisplayName = "AC-7401.3 기록 한 줄: 날짜·시각·차트번호·이름·서류 이름들(서류 차례)·기간 시작·끝·날 수·장 수를 탭으로")]
    public void TsvLine()
    {
        var line = new DocLogLine(new DateTime(2026, 11, 20, 8, 42, 5), "90001", "가상환자01", new[] { DocKind.Detail, DocKind.Receipt, DocKind.Detail },
            new DateTime(2026, 11, 1), new DateTime(2026, 11, 20), 7, 9);

        Assert.Equal("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증 · 진료비 세부내역서\t2026-11-01\t2026-11-20\t7\t9", line.ToTsv());
        Assert.Equal("2026-11-20 08:42", line.AtText);
        Assert.Equal("진료비 영수증 · 진료비 세부내역서", line.KindsText);
        Assert.Equal("2026-11-01 ~ 2026-11-20 (7일)", line.RangeText);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Detail }, line.Kinds);
    }

    [Fact(DisplayName = "AC-7401.3 탭·줄바꿈은 빈칸으로 바꿔 한 줄을 지킨다")]
    public void TabsAndNewlinesBecomeSpaces()
    {
        var line = Line(new DateTime(2026, 11, 20, 9, 0, 0), "9\t0001", "가상\t환자\r\n01", DocKind.Chart);
        var tsv = line.ToTsv();
        Assert.Equal(8, tsv.Count(c => c == '\t'));
        Assert.DoesNotContain("\n", tsv);
        Assert.DoesNotContain("\r", tsv);
        Assert.Contains("\t9 0001\t가상 환자  01\t진료기록부\t", tsv);
    }

    [Fact(DisplayName = "AC-7401.3 기록 줄을 다시 읽으면 같은 값")]
    public void ParseRoundTrips()
    {
        var line = new DocLogLine(new DateTime(2026, 11, 19, 17, 5, 59), "90002", "가상환자02", new[] { DocKind.RxCopy, DocKind.Chart },
            new DateTime(2026, 10, 1), new DateTime(2026, 10, 31), 5, 12);

        var back = DocLogLine.Parse(line.ToTsv());

        Assert.NotNull(back);
        Assert.Equal(line.At, back!.At);
        Assert.Equal("90002", back.Chart);
        Assert.Equal("가상환자02", back.Name);
        Assert.Equal(new[] { DocKind.RxCopy, DocKind.Chart }, back.Kinds);
        Assert.Equal(new DateTime(2026, 10, 1), back.From);
        Assert.Equal(new DateTime(2026, 10, 31), back.To);
        Assert.Equal(5, back.Days);
        Assert.Equal(12, back.Pages);
        Assert.Equal(line.ToTsv(), back.ToTsv());
    }

    [Theory(DisplayName = "AC-7401.3 깨진 기록 줄은 읽지 않는다(null)")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t7")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t7\t9\t1")]
    [InlineData("2026-13-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t7\t9")]
    [InlineData("2026-11-20\t8시\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t7\t9")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t통원확인서\t2026-11-01\t2026-11-20\t7\t9")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t\t2026-11-01\t2026-11-20\t7\t9")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t20261101\t2026-11-20\t7\t9")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t-1\t9")]
    [InlineData("2026-11-20\t08:42:05\t90001\t가상환자01\t진료비 영수증\t2026-11-01\t2026-11-20\t7\t아홉")]
    public void BrokenLineIsSkipped(string? text)
    {
        Assert.Null(DocLogLine.Parse(text));
    }

    [Fact(DisplayName = "AC-7401.3 [뽑은 기록 보기]는 최근 것부터(같은 때면 파일 뒤쪽 줄이 먼저), 깨진 줄은 건너뛴다")]
    public void RecentFirst()
    {
        var lines = new[]
        {
            Line(new DateTime(2026, 11, 18, 15, 12, 0), "90004", "가상환자04", DocKind.Chart).ToTsv(),
            Line(new DateTime(2026, 11, 20, 8, 42, 0), "90001", "가상환자01", DocKind.Receipt).ToTsv(),
            "깨진 줄",
            "",
            Line(new DateTime(2026, 11, 19, 11, 30, 0), "90003", "가상환자03", DocKind.RxCopy).ToTsv(),
            Line(new DateTime(2026, 11, 19, 11, 30, 0), "90002", "가상환자02", DocKind.Detail).ToTsv(),
        };

        var recent = DocLog.Recent(lines, null);

        Assert.Equal(new[] { "90001", "90002", "90003", "90004" }, recent.Select(l => l.Chart).ToArray());
        Assert.Equal(4, DocLog.Recent(lines, "   ").Count);
        Assert.Empty(DocLog.Recent(null, null));
    }

    [Fact(DisplayName = "AC-7401.3 차트번호(숫자만, 앞 0 무시)나 이름으로 거른다")]
    public void FilterByChartOrName()
    {
        var lines = new[]
        {
            Line(new DateTime(2026, 11, 18, 9, 0, 0), "90001", "가상환자01", DocKind.Receipt).ToTsv(),
            Line(new DateTime(2026, 11, 19, 9, 0, 0), "90012", "가상환자12", DocKind.Receipt).ToTsv(),
            Line(new DateTime(2026, 11, 20, 9, 0, 0), "90001", "가상환자01", DocKind.Detail).ToTsv(),
            Line(new DateTime(2026, 11, 20, 10, 0, 0), "80001", "다른환자", DocKind.Detail).ToTsv(),
        };

        Assert.Equal(new[] { DocKind.Detail, DocKind.Receipt }, DocLog.Recent(lines, "90001").Select(l => l.Kinds.Single()).ToArray());
        Assert.Equal(2, DocLog.Recent(lines, " 0090001 ").Count);
        Assert.Equal(new[] { "90012" }, DocLog.Recent(lines, "9001").Select(l => l.Chart).ToArray());
        Assert.Equal(new[] { "90012" }, DocLog.Recent(lines, "가상환자12").Select(l => l.Chart).ToArray());
        Assert.Equal(3, DocLog.Recent(lines, "가상").Count);
        Assert.Empty(DocLog.Recent(lines, "없는이름"));
        Assert.Empty(DocLog.Recent(lines, "777"));
    }
}
