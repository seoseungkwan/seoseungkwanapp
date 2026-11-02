using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Diag;
using Xunit;

namespace Precheck.Core.Tests.Diag;

/// <summary>보고서 칸 거르기·줄 쓰기·진행 표시·보고서 자리(specs/diag-read-speed TASK-2). 값은 모두 가짜다.</summary>
public class DiagReportTests
{
    private static IReadOnlyList<IReadOnlyList<object?>> Rows(params object?[][] rows) => rows;

    private static string ReadSharing(string path)
    {
        using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(input, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true);
        return reader.ReadToEnd();
    }

    private static string TempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "precheck-diag-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    [Theory(DisplayName = "AC-801.3 숫자 칸은 숫자 형만 지난다")]
    [InlineData(12L, "12")]
    [InlineData(12, "12")]
    [InlineData((byte)3, "3")]
    [InlineData((short)7, "7")]
    [InlineData(true, "1")]
    [InlineData(false, "0")]
    [InlineData("12", "?")]
    [InlineData("900001", "?")]
    [InlineData("홍길동", "?")]
    [InlineData(null, "?")]
    public void NumberCells(object? cell, string expected) => Assert.Equal(expected, DiagFormat.Number(cell));

    [Fact(DisplayName = "AC-801.3 decimal은 정수 부분만 숫자 칸을 지난다")]
    public void DecimalCell()
    {
        Assert.Equal("12", DiagFormat.Number(12.5m));
        Assert.Equal(12L, DiagFormat.Count(12.5m));
        Assert.Null(DiagFormat.Count("12"));
    }

    [Theory(DisplayName = "AC-801.3 이름 칸은 영문 식별자 모양만 지난다(한글·숫자로 시작·공백 불가)")]
    [InlineData("PK_OcmInf", "PK_OcmInf")]
    [InlineData("IX_OCM$A.1", "IX_OCM$A.1")]
    [InlineData("PAGEIOLATCH_SH", "PAGEIOLATCH_SH")]
    [InlineData("Korean_Wansung_CI_AS", "Korean_Wansung_CI_AS")]
    [InlineData("홍길동", "?")]
    [InlineData("900001", "?")]
    [InlineData("HONG GILDONG", "?")]
    [InlineData("", "?")]
    [InlineData(" ", "?")]
    [InlineData("A\nB", "?")]
    [InlineData(12, "?")]
    [InlineData(null, "?")]
    public void IdentifierCells(object? cell, string expected) => Assert.Equal(expected, DiagFormat.Identifier(cell));

    [Fact(DisplayName = "AC-801.3 이름 칸은 128자를 넘으면 지나지 못한다")]
    public void IdentifierLength()
    {
        Assert.Equal(new string('A', 128), DiagFormat.Identifier(new string('A', 128)));
        Assert.Equal("?", DiagFormat.Identifier(new string('A', 129)));
    }

    [Theory(DisplayName = "AC-801.3 판 칸은 점이 있는 숫자만, 에디션 칸은 Edition이 든 영문만 지난다")]
    [InlineData("15.0.2000.5", true)]
    [InlineData("900001", false)]
    [InlineData("A123456", false)]
    [InlineData("홍길동", false)]
    [InlineData("15.0.", false)]
    public void VersionCells(string cell, bool passes) => Assert.Equal(passes ? cell : "?", DiagFormat.Version(cell));

    [Theory(DisplayName = "AC-801.3 에디션 칸은 Edition이 든 영문만 지난다")]
    [InlineData("Express Edition (64-bit)", true)]
    [InlineData("Standard Edition", true)]
    [InlineData("Enterprise Edition: Core-based Licensing (64-bit)", true)]
    [InlineData("HONG GILDONG", false)]
    [InlineData("홍길동 Edition", false)]
    [InlineData("900001", false)]
    public void EditionCells(string cell, bool passes) => Assert.Equal(passes ? cell : "?", DiagFormat.Edition(cell));

    [Theory(DisplayName = "AC-807.2 권한 오류 번호(229·230·262·297·300)는 권한 없음, 다른 오류는 오류 번호다")]
    [InlineData(229, "권한 없음")]
    [InlineData(230, "권한 없음")]
    [InlineData(262, "권한 없음")]
    [InlineData(297, "권한 없음")]
    [InlineData(300, "권한 없음")]
    [InlineData(207, "오류 207")]
    [InlineData(208, "오류 208")]
    [InlineData(-2, "오류 -2(시간 초과)")]
    public void FailureByNumber(int number, string expected) => Assert.Equal(expected, DiagFormat.Failure(number, null));

    [Theory(DisplayName = "AC-801.3 실패 종류 글자도 이름 모양만 지난다")]
    [InlineData("InvalidOperationException", "오류 InvalidOperationException")]
    [InlineData("E-BIT-READ-FAILED", "오류 E-BIT-READ-FAILED")]
    [InlineData("홍길동", "오류 ?")]
    [InlineData(null, "오류 ?")]
    public void FailureByKind(string? kind, string expected) => Assert.Equal(expected, DiagFormat.Failure(null, kind));

    [Fact(DisplayName = "AC-801.3 rows·col 줄은 정해 둔 표·칸만 적고 답의 다른 이름은 적지 않는다")]
    public void RowsAndColumnsUseTheFixedLists()
    {
        var rows = DiagFormat.RowsLine(Rows(
            new object?[] { "OcmInf", 100L },
            new object?[] { "OdrInf", 200L },
            new object?[] { "SECRET_TABLE", 999L }));
        Assert.Equal("rows OcmInf=100 OdrInf=200 DepMst=? SeeMst=? OrpInf=? OrcInf=?", rows);

        var columns = DiagFormat.ColumnLines(Rows(
            new object?[] { "OcmInf", "OcmChtNum", "varchar", (short)8, false, "Korean_Wansung_CI_AS" },
            new object?[] { "OcmInf", "SECRET_COLUMN", "varchar", (short)8, false, "Korean_Wansung_CI_AS" },
            new object?[] { "DepMst", "DepCod", "홍길동", (short)4, true, null }));
        Assert.Equal(new[]
        {
            "col OcmInf.OcmChtNum varchar len=8 null=0 coll=Korean_Wansung_CI_AS",
            "col OcmInf.OcmAcpDtm ?",
            "col OcmInf.OcmNum ?",
            "col OcmInf.OcmDepCod ?",
            "col OdrInf.OdrOcmNum ?",
            "col DepMst.DepCod ? len=4 null=1 coll=?",
        }, columns);
    }

    [Fact(DisplayName = "AC-801.3 대소문자를 구분하지 않는 DB가 돌려준 표기도 정해 둔 표·칸으로 찾고, 적는 이름은 정해 둔 목록 값이다")]
    public void NamesMatchWhateverCaseTheCatalogUses()
    {
        Assert.Equal(
            "rows OcmInf=100 OdrInf=? DepMst=? SeeMst=? OrpInf=? OrcInf=?",
            DiagFormat.RowsLine(Rows(new object?[] { "OCMINF", 100L })));

        var columns = DiagFormat.ColumnLines(Rows(new object?[] { "ocminf", "ocmchtnum", "varchar", (short)8, false, "Korean_Wansung_CI_AS" }));
        Assert.Equal("col OcmInf.OcmChtNum varchar len=8 null=0 coll=Korean_Wansung_CI_AS", columns[0]);

        var indexes = DiagFormat.IndexLines(Rows(new object?[] { "OCMINF", "PK_OCMINF", "CLUSTERED", true, false, false, "OCMNUM" }));
        Assert.Equal("idx OcmInf: PK_OCMINF[C,U](OCMNUM)", indexes[0]);

        Assert.Equal(
            "config max_server_memory_mb=1024 maxdop=? cost_threshold=?",
            DiagFormat.ConfigLine(Rows(new object?[] { "MAX SERVER MEMORY (MB)", 1024L })));
    }

    [Fact(DisplayName = "AC-801.3 색인 줄은 키 칸·포함 칸을 표마다 한 줄로 적고 이름은 모양만 거른다")]
    public void IndexLines()
    {
        var lines = DiagFormat.IndexLines(Rows(
            new object?[] { "OcmInf", "PK_OcmInf", "CLUSTERED", true, false, false, "OcmNum" },
            new object?[] { "OcmInf", "IX_A", "NONCLUSTERED", false, false, false, "OcmAcpDtm" },
            new object?[] { "OcmInf", "IX_A", "NONCLUSTERED", false, false, false, "OcmPatTyp" },
            new object?[] { "OcmInf", "IX_A", "NONCLUSTERED", false, false, true, "OcmChtNum" },
            new object?[] { "OdrInf", "홍길동", "NONCLUSTERED", false, true, false, "900001" },
            new object?[] { "SECRET_TABLE", "IX_SECRET", "NONCLUSTERED", false, false, false, "SecretColumn" }));
        Assert.Equal(new[]
        {
            "idx OcmInf: PK_OcmInf[C,U](OcmNum); IX_A[N](OcmAcpDtm,OcmPatTyp)+(OcmChtNum)",
            "idx OdrInf: ?[N,off](?)",
            "idx DepMst: none",
            "idx SeeMst: none",
            "idx OrpInf: none",
            "idx OrcInf: none",
        }, lines);
    }

    [Fact(DisplayName = "AC-801.3 서버·DB·권한·CPU·메모리·설정·막힘 줄은 거른 칸으로만 만든다")]
    public void EnvironmentLines()
    {
        Assert.Equal("server version=15.0.2000.5 level=RTM edition=Express Edition (64-bit)", DiagFormat.ServerLine(Rows(new object?[] { "15.0.2000.5", "RTM", "Express Edition (64-bit)" })));
        Assert.Equal("server version=? level=? edition=?", DiagFormat.ServerLine(Rows(new object?[] { "900001", "홍길동", "HONG GILDONG" })));
        Assert.Equal("server version=? level=? edition=?", DiagFormat.ServerLine(Rows()));
        Assert.Equal("db compat=150 snapshot=0 rcsi=1 auto_create=1 auto_update=0 recovery=SIMPLE", DiagFormat.DatabaseLine(Rows(new object?[] { (byte)150, (byte)0, true, true, false, "SIMPLE" })));
        Assert.Equal("session open_ms=80 isolation=2", DiagFormat.SessionLine(80, Rows(new object?[] { (short)2 })));
        Assert.Equal("perm view_server_state=1 sysadmin=0", DiagFormat.PermissionLine(Rows(new object?[] { 1, 0 })));
        Assert.True(DiagFormat.CanViewServerState(Rows(new object?[] { 1, 0 })));
        Assert.False(DiagFormat.CanViewServerState(Rows(new object?[] { 0, 0 })));
        Assert.False(DiagFormat.CanViewServerState(Rows(new object?[] { "1", 0 })));
        Assert.False(DiagFormat.CanViewServerState(Rows()));
        Assert.Equal("cpu logical=8 schedulers=4", DiagFormat.CpuLine(Rows(new object?[] { 8, 4 })));
        Assert.Equal("memory physical_mb=16384 committed_target_mb=1024", DiagFormat.MemoryLine(Rows(new object?[] { 16777216L, 1048576L })));
        Assert.Equal("memory physical_mb=? committed_target_mb=?", DiagFormat.MemoryLine(Rows(new object?[] { "홍길동", null })));
        Assert.Equal(
            "config max_server_memory_mb=2147483647 maxdop=0 cost_threshold=5",
            DiagFormat.ConfigLine(Rows(
                new object?[] { "max server memory (MB)", 2147483647L },
                new object?[] { "max degree of parallelism", 0L },
                new object?[] { "cost threshold for parallelism", 5L })));
        Assert.Equal("config max_server_memory_mb=? maxdop=? cost_threshold=?", DiagFormat.ConfigLine(Rows(new object?[] { "홍길동", 5L })));
        Assert.Equal("block others=3 blocked=1 max_wait_ms=2500", DiagFormat.BlockLine(Rows(new object?[] { 3L, 1, 2500 })));
    }

    [Fact(DisplayName = "AC-807.8 비용·대기 글은 숫자와 거른 대기 이름만 싣는다")]
    public void CostText()
    {
        Assert.Equal(
            "cpu=300 reads=10 lreads=9000 waits=PAGEIOLATCH_SH:800,CXPACKET:3",
            DiagFormat.Cost(
                Rows(new object?[] { 300, 10L, 9000L }),
                Rows(new object?[] { "PAGEIOLATCH_SH", 800L }, new object?[] { "CXPACKET", 3L })));
        Assert.Equal("cpu=? reads=? lreads=? waits=?", DiagFormat.Cost(null, null));
        Assert.Equal("cpu=? reads=? lreads=? waits=?:?", DiagFormat.Cost(Rows(new object?[] { "홍길동" }), Rows(new object?[] { "홍길동", "900001" })));
        Assert.Equal("cpu=1 reads=2 lreads=3 waits=none", DiagFormat.Cost(Rows(new object?[] { 1, 2L, 3L }), Rows()));
    }

    [Fact(DisplayName = "AC-807.5 문장 합계 줄은 이름·횟수·합계·최대·첫 줄·줄 수·오류만 싣는다")]
    public void StatementLine()
    {
        Assert.Equal("stmt StatsSql.VisitRowsSql n=2 ms=300 max=200 first=150 rows=40", DiagFormat.Statement("StatsSql.VisitRowsSql", 2, 300, 200, 150, 40, 0, null));
        Assert.Equal("stmt StatsSql.VisitRowsSql n=1 ms=600000 max=600000 first=? rows=0 errs=1 last=오류 -2(시간 초과)", DiagFormat.Statement("StatsSql.VisitRowsSql", 1, 600000, 600000, null, 0, 1, "오류 -2(시간 초과)"));
    }

    [Fact(DisplayName = "AC-807.4 조각 줄은 시간·건수(또는 오류)·비용을 싣는다")]
    public void PieceLine()
    {
        Assert.Equal("piece Orders ms=1200 rows=45 cpu=1 reads=2 lreads=3 waits=none", DiagFormat.Piece("Orders", 1200, 45, null, "cpu=1 reads=2 lreads=3 waits=none"));
        Assert.Equal("piece Orders ms=600000 rows=? err=오류 -2(시간 초과) cpu=? reads=? lreads=? waits=?", DiagFormat.Piece("Orders", 600000, null, "오류 -2(시간 초과)", "cpu=? reads=? lreads=? waits=?"));
    }

    [Theory(DisplayName = "AC-807.4 두 FirstVisits 건수가 같은지 건수로만 적는다")]
    [InlineData(5L, 5L, "agree first_visits=same")]
    [InlineData(5L, 6L, "agree first_visits=differ")]
    [InlineData(null, 6L, "agree first_visits=unknown")]
    [InlineData(5L, null, "agree first_visits=unknown")]
    public void AgreeLine(long? asWritten, long? plain, string expected) => Assert.Equal(expected, DiagFormat.Agree(asWritten, plain));

    [Fact(DisplayName = "AC-804.3 첫 줄에 빌드 커밋이 있고 없으면 unknown이다")]
    public void HeaderHasCommit()
    {
        var sha = "0123456789abcdef0123456789abcdef01234567";
        var header = DiagFormat.Header(DiagCommit.Clean(sha), "0.2.0", new DateTime(2026, 11, 2, 14, 3, 0), 100, TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(40));
        Assert.Equal("speed-report commit=0123456789ab helper=0.2.0 started=2026-11-02T14:03 range_days=100 limit_s=600 ceiling_s=2400", header);
        Assert.Equal("unknown", DiagCommit.Clean(null));
        Assert.Equal("unknown", DiagCommit.Clean(""));
        Assert.Equal("unknown", DiagCommit.Clean("../../secret"));
        Assert.Equal("unknown", DiagCommit.Clean("abc"));
        Assert.Equal("abc1234", DiagCommit.Clean("ABC1234"));
        Assert.Matches(@"^(unknown|[0-9a-f]{7,12})\z", DiagCommit.Value);
    }

    [Fact(DisplayName = "AC-804.3 커밋은 Actions의 GITHUB_SHA를 Core 어셈블리 정보(DiagCommit)로 넣는다")]
    public void CommitComesFromTheBuild()
    {
        var csproj = File.ReadAllText(Protocol.Repo.PathOf("helper", "src", "Precheck.Core", "Precheck.Core.csproj"));
        Assert.Contains("<AssemblyMetadata Include=\"DiagCommit\" Value=\"$(GITHUB_SHA)\" />", csproj);
        Assert.Contains("Condition=\"'$(GITHUB_SHA)' != ''\"", csproj);
    }

    [Fact(DisplayName = "AC-804.4 보고서 파일 이름은 시각뿐이고 자리는 app의 부모 다음 임시 폴더다")]
    public void ReportPathOrder()
    {
        Assert.Equal("speed-report-20261102-140305.txt", DiagReportPath.FileName(new DateTime(2026, 11, 2, 14, 3, 5)));
        var root = TempDirectory();
        var app = Path.Combine(root, "precheck-helper-0.2.0", "app");
        var temp = Path.Combine(root, "temp");
        foreach (var form in new[] { app, app + Path.DirectorySeparatorChar })
        {
            Assert.Equal(new[] { Path.Combine(root, "precheck-helper-0.2.0"), temp }, DiagReportPath.Folders(form, temp));
        }
        Directory.Delete(root, true);
    }

    [Fact(DisplayName = "AC-804.4 첫 자리에 쓸 수 없으면 임시 폴더로 가고, 어디에도 못 쓰면 실패한다")]
    public void ReportPathFallsBack()
    {
        var root = TempDirectory();
        var first = Path.Combine(root, "first");
        var second = Path.Combine(root, "second");
        Directory.CreateDirectory(second);
        var when = new DateTime(2026, 11, 2, 14, 3, 5);

        // 첫 자리가 없다
        using (var opened = DiagReportPath.Open(new[] { first, second }, when, out var path))
        {
            Assert.Equal(Path.Combine(second, "speed-report-20261102-140305.txt"), path);
            Assert.True(opened.CanWrite);
        }

        // 같은 이름 파일을 덮지 않는다
        Directory.CreateDirectory(first);
        using (var opened = DiagReportPath.Open(new[] { second, first }, when, out var path))
        {
            Assert.Equal(Path.Combine(first, "speed-report-20261102-140305.txt"), path);
        }

        Assert.Throws<IOException>(() => DiagReportPath.Open(new[] { Path.Combine(root, "none") }, when, out _));
        Directory.Delete(root, true);
    }

    [Fact(DisplayName = "AC-806.4 줄을 쓰면 닫지 않아도 디스크에 있고, 꼬리는 다시 쓰이며 다음 줄이 오면 확정된다")]
    public void ReportReachesTheDiskAsItGoes()
    {
        var root = TempDirectory();
        var path = Path.Combine(root, "report.txt");
        var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        var report = new DiagReport(stream);

        report.Line("first");
        Assert.Equal("first\r\n", ReadSharing(path));

        report.Tail(new[] { "tail-a n=1" });
        Assert.Equal("first\r\ntail-a n=1\r\n", ReadSharing(path));

        report.Tail(new[] { "tail-a n=2", "tail-b n=1" });
        Assert.Equal("first\r\ntail-a n=2\r\ntail-b n=1\r\n", ReadSharing(path));

        report.Tail(new[] { "tail-a n=3" });
        Assert.Equal("first\r\ntail-a n=3\r\n", ReadSharing(path));

        report.Line("second");
        Assert.Equal("first\r\ntail-a n=3\r\nsecond\r\n", ReadSharing(path));

        report.Tail(new[] { "tail-c n=1" });
        report.Tail(new[] { "tail-c n=2" });
        Assert.Equal("first\r\ntail-a n=3\r\nsecond\r\ntail-c n=2\r\n", ReadSharing(path));

        stream.Dispose();
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, File.ReadAllBytes(path).Take(3).ToArray());
        Directory.Delete(root, true);
    }

    [Fact(DisplayName = "AC-806.6 줄은 1500자 이하이고 줄바꿈이 들어가지 않는다")]
    public void LinesAreClipped()
    {
        using var stream = new MemoryStream();
        var report = new DiagReport(stream);
        report.Line(new string('A', 2000));
        report.Line("B\r\nC\nD");
        report.Tail(new[] { new string('E', 2000) });
        var lines = Encoding.UTF8.GetString(stream.ToArray()).TrimStart('﻿').Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(3, lines.Length);
        Assert.Equal(DiagFormat.MaxLineLength, lines[0].Length);
        Assert.EndsWith("...(잘림)", lines[0], StringComparison.Ordinal);
        Assert.Equal("B  C D", lines[1]);
        Assert.Equal(1500, DiagFormat.MaxLineLength);
        Assert.Equal(DiagFormat.MaxLineLength, lines[2].Length);
    }

    private static (DiagProgress Progress, StringWriter Output, Action<TimeSpan> Set) Progress(int total)
    {
        var now = TimeSpan.Zero;
        var output = new StringWriter();
        return (new DiagProgress(output, () => now, total), output, value => now = value);
    }

    [Fact(DisplayName = "AC-805.1 단계가 시작되면 콘솔에 3/12 읽는 중… (무엇을)이 나온다")]
    public void ProgressSteps()
    {
        var (progress, output, _) = Progress(12);
        progress.Step(3, "표 크기와 색인");
        progress.Skip(4, "막힌 작업 확인");
        var lines = output.ToString().Split(new[] { output.NewLine }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(new[] { "3/12 읽는 중… (표 크기와 색인)", "4/12 건너뛰어요 (막힌 작업 확인)" }, lines);
    }

    [Fact(DisplayName = "AC-805.2 오래 걸리면 아직 읽는 중이에요 (3분째)가 나오고 끝난 뒤에는 나오지 않는다")]
    public void ProgressTicks()
    {
        var (progress, output, set) = Progress(12);
        progress.Tick();
        Assert.Equal("", output.ToString());

        set(TimeSpan.FromMinutes(1));
        progress.Step(5, "기간 접수 세기");
        set(TimeSpan.FromMinutes(1) + TimeSpan.FromSeconds(30));
        progress.Tick();
        set(TimeSpan.FromMinutes(4) + TimeSpan.FromSeconds(10));
        progress.Tick();
        progress.Finish();
        progress.Tick();

        var lines = output.ToString().Split(new[] { output.NewLine }, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(new[]
        {
            "5/12 읽는 중… (기간 접수 세기)",
            "   아직 읽는 중이에요 (30초째)",
            "   아직 읽는 중이에요 (3분째)",
        }, lines);
    }
}
