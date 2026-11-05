using System;
using System.Collections.Generic;
using System.Data.Common;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Xunit;
using static Precheck.Core.Tests.Reception.Check.CheckReportFakes;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>이 파일만 쓰는 가짜들(같은 이름공간의 다른 TASK 시험과 이름이 부딪히지 않게 안에 둔다).</summary>
internal static class CheckReportFakes
{
    /// <summary>SqlException 대신: DbException이고 Number(int)가 있다. 글(Message)에는 센티널을 싣는다.</summary>
    internal sealed class SqlException : DbException
    {
        public SqlException(int number, string message) : base(message)
        {
            Number = number;
        }

        public int Number { get; }
    }

    /// <summary>쓰기·비우기(Flush)를 세는 흐름.</summary>
    internal sealed class FlushCountingStream : MemoryStream
    {
        public int Flushes { get; private set; }

        public override void Flush()
        {
            Flushes++;
            base.Flush();
        }
    }

    /// <summary>센티널: 환자 자료처럼 생긴 가짜 값. 보고서 어디에도 나오면 안 된다(AC-1401.10).</summary>
    internal static class Sentinels
    {
        public const string KoreanName = "가상환자01";
        public const string ChartNumber = "900001";
        public const string EnglishName = "GASANG HWANJA";
        public const string Phone = "010-9000-0001";

        /// <summary>두 글자 한글 이름 모양(값 목록의 두 글자 조건을 지나면 안 된다).</summary>
        public const string ShortKoreanName = "가상";

        public static readonly string[] All = { KoreanName, ChartNumber, EnglishName, Phone, ShortKoreanName };

        public static void Absent(string text)
        {
            foreach (var sentinel in All) Assert.DoesNotContain(sentinel, text, StringComparison.Ordinal);
            Assert.DoesNotContain("900001", text.Replace("-", ""), StringComparison.Ordinal);
        }
    }
}

/// <summary>보고서 칸 거르기(AC-1401.10). 이름 모양·숫자 형·상태 코드 모양·작은 값 목록·화면 83 칸 제목만 지나고 나머지는 ?다.</summary>
public class CheckReportFieldTests
{
    [Theory(DisplayName = "AC-1401.10 이름 칸은 ^[A-Za-z][A-Za-z0-9_]{0,63}$ 모양만 지난다(한글·숫자 차트번호·띄어 쓴 영문 이름·전화 모양·줄바꿈은 ?)")]
    [InlineData("OcmInf", "OcmInf")]
    [InlineData("OCM_NUM1", "OCM_NUM1")]
    [InlineData("varchar", "varchar")]
    [InlineData(Sentinels.KoreanName, "?")]
    [InlineData(Sentinels.ChartNumber, "?")]
    [InlineData(Sentinels.EnglishName, "?")]
    [InlineData(Sentinels.Phone, "?")]
    [InlineData("_OcmInf", "?")]
    [InlineData("", "?")]
    [InlineData("OcmInf\n", "?")]
    [InlineData("A\nB", "?")]
    [InlineData(12, "?")]
    [InlineData(null, "?")]
    public void NameCells(object? cell, string expected) =>
        Assert.Equal("t=" + expected, CheckField.Name("t", cell).ToString());

    [Fact(DisplayName = "AC-1401.10 이름 칸은 64자까지만 지난다")]
    public void NameLength()
    {
        Assert.Equal("t=A" + new string('b', 63), CheckField.Name("t", "A" + new string('b', 63)).ToString());
        Assert.Equal("t=?", CheckField.Name("t", "A" + new string('b', 64)).ToString());
    }

    [Fact(DisplayName = "AC-1401.10 표.칸 이름은 두 쪽을 따로 거른다, 이름 없는 칸은 값만 적는다")]
    public void ColumnCells()
    {
        Assert.Equal("OcmInf.OcmNum", CheckField.Column(null, "OcmInf", "OcmNum").ToString());
        Assert.Equal("col=OcmInf.?", CheckField.Column("col", "OcmInf", Sentinels.KoreanName).ToString());
        Assert.Equal("?.?", CheckField.Column(null, Sentinels.Phone, null).ToString());
        Assert.Equal("OcmInf", CheckField.Name(null, "OcmInf").ToString());
    }

    [Theory(DisplayName = "AC-1401.10 숫자 칸은 숫자 형만 지난다(숫자처럼 생긴 글자는 ?)")]
    [InlineData(12L, "12")]
    [InlineData(12, "12")]
    [InlineData((byte)3, "3")]
    [InlineData((short)7, "7")]
    [InlineData(-2, "-2")]
    [InlineData(true, "1")]
    [InlineData(false, "0")]
    [InlineData(33.333, "33.3")]
    [InlineData(100.0, "100")]
    [InlineData(double.NaN, "?")]
    [InlineData(double.PositiveInfinity, "?")]
    [InlineData("12", "?")]
    [InlineData(Sentinels.ChartNumber, "?")]
    [InlineData(Sentinels.KoreanName, "?")]
    [InlineData(null, "?")]
    public void NumberCells(object? cell, string expected) =>
        Assert.Equal("n=" + expected, CheckField.Number("n", cell).ToString());

    [Fact(DisplayName = "AC-1401.10 decimal 숫자는 소수 한 자리까지")]
    public void DecimalCells()
    {
        Assert.Equal("n=12", CheckField.Number("n", 12m).ToString());
        Assert.Equal("n=12.5", CheckField.Number("n", 12.5m).ToString());
    }

    [Theory(DisplayName = "AC-1401.10 상태 코드 칸은 ^[A-Z0-9]{1,4}$ 모양 글자만 지난다")]
    [InlineData("1", "1")]
    [InlineData("N", "N")]
    [InlineData("A01", "A01")]
    [InlineData("ABCD", "ABCD")]
    [InlineData("ABCDE", "?")]
    [InlineData("y", "?")]
    [InlineData("1 ", "?")]
    [InlineData("", "?")]
    [InlineData(Sentinels.ChartNumber, "?")]
    [InlineData(Sentinels.KoreanName, "?")]
    [InlineData(Sentinels.EnglishName, "?")]
    [InlineData(Sentinels.Phone, "?")]
    [InlineData(1, "?")]
    [InlineData(null, "?")]
    public void StatusCells(object? cell, string expected) =>
        Assert.Equal("stt=" + expected, CheckField.Status("stt", cell).ToString());

    [Fact(DisplayName = "AC-1401.10 값 목록은 4가지 이하이고 모두 두 글자 이하(글자·숫자)일 때만 적는다(AC-1401.7 조건), 나머지는 ?")]
    public void SmallValueLists()
    {
        string Values(params object?[] values) => CheckField.Values("v", values).ToString();

        Assert.Equal("v=N,Y", Values("Y", "N", "Y", null, ""));
        Assert.Equal("v=남,여", Values("여", "남"));
        Assert.Equal("v=0,1", Values(1, 0, (byte)1));
        Assert.Equal("v=Y", Values("Y ", " Y"));
        Assert.Equal("v=A,B,C,D", Values("A", "B", "C", "D"));
        Assert.Equal("v=?", Values("A", "B", "C", "D", "E"));
        Assert.Equal("v=?", Values("Y", "ABC"));
        Assert.Equal("v=?", Values("Y", "-"));
        Assert.Equal("v=?", Values("Y", "1 2"));
        Assert.Equal("v=?", Values(Sentinels.KoreanName));
        Assert.Equal("v=?", Values(Sentinels.ChartNumber));
        Assert.Equal("v=?", Values(Sentinels.Phone));
        Assert.Equal("v=?", Values(Sentinels.EnglishName));
        Assert.Equal("v=?", Values(900001));
        Assert.Equal("v=?", Values(new DateTime(2026, 11, 5)));
        Assert.Equal("v=?", Values(null, ""));
        Assert.Equal("v=?", CheckField.Values("v", null).ToString());
    }

    [Fact(DisplayName = "AC-1401.10 값 목록은 ASCII 글자·숫자 두 글자 이하나 한글 한 글자(남·여)만, 두 글자 한글(이름일 수 있음)·자모·ASCII 밖 글자는 ?")]
    public void SmallValueListsKeepNoHangulNames()
    {
        string Values(params object?[] values) => CheckField.Values("v", values).ToString();

        Assert.Equal("v=남", Values("남"));
        Assert.Equal("v=Y,여", Values("여", "Y"));
        Assert.Equal("v=?", Values("가상"));
        Assert.Equal("v=?", Values("남", "가상"));
        Assert.Equal("v=?", Values("Y", "N", "가상"));
        Assert.Equal("v=?", Values("1가"));
        Assert.Equal("v=?", Values("ㄱ"));
        Assert.Equal("v=?", Values("Ａ"));
        Assert.Equal("v=?", Values("é"));
        Assert.Equal("v=?", Values("٣"));
    }

    [Fact(DisplayName = "AC-1401.10 화면 83 칸 제목은 도우미가 아는 제목(GridRows 83)만 적고 모르는 제목은 ?")]
    public void ScreenTitles()
    {
        var known = GridRows.Columns(StatsScreens.Symptoms);
        Assert.Equal(
            "titles=내원번호,?,차트번호,환자명,?,증상,기록날짜,?",
            CheckField.Titles("titles", new object?[] { "내원번호", Sentinels.KoreanName, " 차트번호 ", "환자 명", Sentinels.ChartNumber, "증상", "기록날짜", null }).ToString());
        Assert.Equal(5, known.Count);
        Assert.Equal("titles=?", CheckField.Titles("titles", null).ToString());
    }

    [Fact(DisplayName = "AC-1401.10 오류는 형 이름·도우미 오류 번호·SQL 오류 번호만 적는다(.Message의 센티널은 나오지 않는다)")]
    public void FailuresKeepOnlyTypeAndNumbers()
    {
        var message = string.Join(" ", Sentinels.All);
        Assert.Equal("실패(InvalidOperationException)", CheckField.Failed(null, new InvalidOperationException(message)).ToString());
        Assert.Equal("실패(E-BIT-READ-FAILED)", CheckField.Failed(null, new BitException(BitErrors.ReadFailed)).ToString());
        Assert.Equal("실패(SqlException 207)", CheckField.Failed(null, new SqlException(207, message)).ToString());
        Assert.Equal("q=실패(SqlException -2)", CheckField.Failed("q", new SqlException(-2, message)).ToString());
        Assert.Equal("실패(E-BIT-READ-FAILED)", CheckField.Failed(null, new AggregateException(new BitException(BitErrors.ReadFailed))).ToString());
        Assert.Equal("실패(SqlException 4060)", CheckField.Failed(null, new TargetInvocationException(new SqlException(4060, message))).ToString());
        Sentinels.Absent(CheckField.Failed(null, new IOException(message, new Exception(message))).ToString());
    }

    [Fact(DisplayName = "AC-1401.10 칸 이름(열쇠)이 정해 둔 모양이 아니면 막고 그 글을 오류에 싣지 않는다")]
    public void BadKeysThrowWithoutEchoing()
    {
        var error = Assert.Throws<ArgumentException>(() => CheckField.Number(Sentinels.KoreanName, 1));
        Assert.DoesNotContain(Sentinels.KoreanName, error.Message, StringComparison.Ordinal);
        Assert.Throws<ArgumentException>(() => CheckField.Name("a b", "OcmInf"));
        Assert.Throws<ArgumentException>(() => CheckField.Skipped(""));
    }
}

/// <summary>보고서 줄 쓰기(AC-1401.10·11): 정해 둔 칸만 쓰고, 줄마다 디스크까지 비운다. 메모장이 읽게 UTF-8 BOM·CRLF.</summary>
public class CheckReportWriteTests
{
    private static string ReadSharing(string path)
    {
        using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(input, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true);
        return reader.ReadToEnd();
    }

    internal static string TempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "precheck-reception-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    [Fact(DisplayName = "AC-1401.11 보고서는 UTF-8 BOM으로 시작하고 줄은 라벨 + 칸들 + CRLF다")]
    public void LinesAreLabelFieldsCrlf()
    {
        var stream = new FlushCountingStream();
        using (var report = new CheckReport(stream, ""))
        {
            report.Header(new DateTime(2026, 11, 5, 9, 7, 3), "1.4.2");
            report.Line("status", CheckField.Status("stt", "1"), CheckField.Status("rsu", "N"), CheckField.Number("visits", 12L), CheckField.Number("answer", 2));
            report.Line("symptom", CheckField.Skipped(null));
            report.Line("end");
            var bytes = stream.ToArray();
            Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes.Take(3).ToArray());
            Assert.Equal(
                "reception-check started=2026-11-05T09:07 build=1.4.2\r\nstatus stt=1 rsu=N visits=12 answer=2\r\nsymptom 건너뜀\r\nend\r\n",
                Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3));
        }
    }

    [Fact(DisplayName = "AC-1401.11 줄을 쓸 때마다 Flush 한다(멈추거나 죽어도 그때까지 남는다)")]
    public void EveryLineFlushes()
    {
        var stream = new FlushCountingStream();
        using var report = new CheckReport(stream, "");
        var before = stream.Flushes;
        report.Line("a");
        Assert.Equal(before + 1, stream.Flushes);
        report.Line("b", CheckField.Number("n", 1));
        Assert.Equal(before + 2, stream.Flushes);
        report.Header(new DateTime(2026, 11, 5), null);
        Assert.Equal(before + 3, stream.Flushes);
    }

    [Fact(DisplayName = "AC-1401.11 파일에 쓴 줄은 닫기 전에도 다른 곳에서 읽힌다")]
    public void LinesAreOnDiskBeforeClose()
    {
        var folder = TempDirectory();
        try
        {
            var stream = CheckReportPath.Open(new[] { folder }, new DateTime(2026, 11, 5, 9, 7, 3), out var path);
            using var report = new CheckReport(stream, path);
            report.Line("first", CheckField.Number("n", 1));
            Assert.Equal("first n=1\r\n", ReadSharing(path));
            report.Line("second", CheckField.Failed(null, new SqlException(-2, Sentinels.KoreanName)));
            Assert.Equal("first n=1\r\nsecond 실패(SqlException -2)\r\n", ReadSharing(path));
            Assert.Equal(path, report.FilePath);
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }

    [Fact(DisplayName = "AC-1401.11 넘거나 실패한 항목은 실패(번호)로, 건너뛴 단계는 건너뜀으로 적는다")]
    public void FailureAndSkipWords()
    {
        Assert.Equal("실패(시간 초과)", CheckField.TimedOut(null).ToString());
        Assert.Equal("all=실패(시간 초과)", CheckField.TimedOut("all").ToString());
        Assert.Equal("건너뜀", CheckField.Skipped(null).ToString());
        Assert.Equal("name=건너뜀", CheckField.Skipped("name").ToString());
        Assert.StartsWith("실패(", CheckField.Failed(null, new TimeoutException()).ToString(), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-1401.10 라벨이 정해 둔 모양이 아니면 막고 아무것도 쓰지 않는다")]
    public void BadLabelWritesNothing()
    {
        var stream = new FlushCountingStream();
        using var report = new CheckReport(stream, "");
        var length = stream.Length;
        Assert.Throws<ArgumentException>(() => report.Line(Sentinels.KoreanName));
        Assert.Throws<ArgumentException>(() => report.Line("a\r\nb"));
        Assert.Equal(length, stream.Length);
    }

    [Fact(DisplayName = "AC-1401.10 센티널만 넣은 칸들로 끝까지 써도 보고서에 센티널이 하나도 없다")]
    public void SentinelsNeverReachTheFile()
    {
        var folder = TempDirectory();
        try
        {
            string path;
            using (var report = new CheckReport(CheckReportPath.Open(new[] { folder }, new DateTime(2026, 11, 5, 9, 7, 3), out path), "x"))
            {
                report.Header(new DateTime(2026, 11, 5, 9, 7, 3), Sentinels.KoreanName);
                foreach (var sentinel in Sentinels.All)
                {
                    CheckField[] fields =
                    {
                        CheckField.Name("name", sentinel), CheckField.Column("col", sentinel, sentinel), CheckField.Number("n", sentinel),
                        CheckField.Status("stt", sentinel), CheckField.Values("v", new object?[] { sentinel, "Y" }),
                        CheckField.Titles("titles", new object?[] { sentinel, "증상" }), CheckField.Failed("err", new SqlException(207, sentinel)),
                        CheckField.Failed("err2", new InvalidOperationException(sentinel)),
                    };
                    report.Line("probe", fields);
                }
            }
            var text = ReadSharing(path);
            Sentinels.Absent(text);
            Assert.Contains("probe name=? col=?.? n=? stt=? v=? titles=?,증상 err=실패(SqlException 207) err2=실패(InvalidOperationException)", text, StringComparison.Ordinal);
            Assert.Contains("build=?", text, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }
}

/// <summary>보고서 파일 이름·자리(AC-1401.11): reception-check-yyyyMMdd-HHmmss.txt, 푼 폴더(app의 부모) → 못 쓰면 임시 폴더.</summary>
public class CheckReportPathTests
{
    [Fact(DisplayName = "AC-1401.11 파일 이름은 reception-check-yyyyMMdd-HHmmss.txt다")]
    public void FileName() =>
        Assert.Equal("reception-check-20261105-090703.txt", CheckReportPath.FileName(new DateTime(2026, 11, 5, 9, 7, 3)));

    [Fact(DisplayName = "AC-1401.11 자리는 푼 폴더(app의 부모)가 먼저, 다음이 임시 폴더다")]
    public void FoldersPreferTheUnzippedFolder()
    {
        var unzipped = Path.Combine(Path.GetTempPath(), "unzipped");
        var app = Path.Combine(unzipped, "app");
        var temp = Path.Combine(Path.GetTempPath(), "t");
        Assert.Equal(new[] { unzipped, temp }, CheckReportPath.Folders(app, temp).ToArray());
        Assert.Equal(new[] { unzipped, temp }, CheckReportPath.Folders(app + Path.DirectorySeparatorChar, temp).ToArray());
        Assert.Equal(new[] { temp }, CheckReportPath.Folders("", temp).ToArray());
    }

    [Fact(DisplayName = "AC-1401.11 푼 폴더에 쓸 수 없으면 임시 폴더에 쓴다")]
    public void FallsBackToTemp()
    {
        var root = CheckReportWriteTests.TempDirectory();
        try
        {
            var missing = Path.Combine(root, "missing");
            var notAFolder = Path.Combine(root, "file.txt");
            File.WriteAllText(notAFolder, "x");
            var temp = Path.Combine(root, "temp");
            Directory.CreateDirectory(temp);
            var when = new DateTime(2026, 11, 5, 9, 7, 3);

            using (CheckReportPath.Open(new[] { missing, notAFolder, temp }, when, out var path))
            {
                Assert.Equal(Path.Combine(temp, "reception-check-20261105-090703.txt"), path);
            }
            Assert.False(Directory.Exists(missing));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Fact(DisplayName = "AC-1401.11 있는 파일은 덮지 않고 다음 자리로 간다, 어디에도 못 쓰면 IOException")]
    public void DoesNotOverwrite()
    {
        var root = CheckReportWriteTests.TempDirectory();
        try
        {
            var first = Path.Combine(root, "first");
            var second = Path.Combine(root, "second");
            Directory.CreateDirectory(first);
            Directory.CreateDirectory(second);
            var when = new DateTime(2026, 11, 5, 9, 7, 3);
            var existing = Path.Combine(first, "reception-check-20261105-090703.txt");
            File.WriteAllText(existing, "keep");

            using (CheckReportPath.Open(new[] { first, second }, when, out var path))
            {
                Assert.Equal(Path.Combine(second, "reception-check-20261105-090703.txt"), path);
            }
            Assert.Equal("keep", File.ReadAllText(existing));
            Assert.Throws<IOException>(() => CheckReportPath.Open(new[] { first, second }, when, out _));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Fact(DisplayName = "AC-1401.11 Create는 푼 폴더에 보고서를 열고 그 경로를 들고 있다")]
    public void CreateOpensInTheUnzippedFolder()
    {
        var root = CheckReportWriteTests.TempDirectory();
        try
        {
            var app = Path.Combine(root, "app");
            Directory.CreateDirectory(app);
            var temp = Path.Combine(root, "temp");
            Directory.CreateDirectory(temp);
            using (var report = CheckReport.Create(app, temp, new DateTime(2026, 11, 5, 9, 7, 3)))
            {
                Assert.Equal(Path.Combine(root, "reception-check-20261105-090703.txt"), report.FilePath);
                report.Line("end");
            }
            var bytes = File.ReadAllBytes(Path.Combine(root, "reception-check-20261105-090703.txt"));
            Assert.Equal("end\r\n", Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
