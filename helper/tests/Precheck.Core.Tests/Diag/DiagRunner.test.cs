using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Diag;
using Precheck.Core.Registration;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Revenue;
using Precheck.Core.Tests.Stats;
using Xunit;

namespace Precheck.Core.Tests.Diag;

/// <summary>
/// 측정 순서·한도·감싸개(specs/diag-read-speed TASK-3). 측정 세션은 가짜이고 시계도 가짜다: 문장이 정해 둔 시간을 쓰고,
/// 한도보다 오래 걸리면 한도만큼 쓴 뒤 시간 초과(-2)로 끝난다. 등록 확인은 제품 관문을 그대로 지난다.
/// </summary>
internal sealed class DiagRig : IDiagConnector, IDisposable
{
    public sealed class Call
    {
        public Call(string sql, Dictionary<string, object?> args, TimeSpan timeout, int session, TimeSpan startedAt)
        {
            Sql = sql;
            Args = args;
            Timeout = timeout;
            Session = session;
            StartedAt = startedAt;
        }

        public string Sql { get; }
        public Dictionary<string, object?> Args { get; }
        public TimeSpan Timeout { get; }
        public int Session { get; }
        public TimeSpan StartedAt { get; }
    }

    private readonly string reportPath;

    public DiagRig(bool registered = true)
    {
        Base = registered ? new Rig().Registered() : new Rig();
        reportPath = Path.Combine(Base.Folder, "report.txt");
        Directory.CreateDirectory(Base.Folder);
    }

    public Rig Base { get; }
    public TimeSpan Now { get; set; }
    public FakeDb Db { get; } = new FakeDb();
    public Dictionary<string, TimeSpan> Takes { get; } = new Dictionary<string, TimeSpan>(StringComparer.Ordinal);
    public Dictionary<string, int> SqlFailures { get; } = new Dictionary<string, int>(StringComparer.Ordinal);
    public Dictionary<string, Exception> Throws { get; } = new Dictionary<string, Exception>(StringComparer.Ordinal);
    public Func<int, Exception?>? OpenFails { get; set; }
    public Action<string>? OnRun { get; set; }
    public List<Call> Calls { get; } = new List<Call>();
    public int Sessions { get; private set; }
    public List<int> Closed { get; } = new List<int>();
    public string Console { get; private set; } = "";

    public string ReportSoFar()
    {
        using var input = new FileStream(reportPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(input, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true);
        return reader.ReadToEnd();
    }

    public string[] Lines() => ReportSoFar().Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);

    public string Run()
    {
        var console = new StringWriter();
        using (var stream = new FileStream(reportPath, FileMode.Create, FileAccess.Write, FileShare.Read))
        {
            var runner = new DiagRunner(
                Base.Services,
                this,
                new DiagReport(stream),
                new DiagProgress(console, () => Now, DiagRunner.StepCount),
                () => Now,
                () => new DateTime(2026, 10, 30, 21, 5, 0));
            runner.Run();
        }
        Console = console.ToString();
        return ReportSoFar();
    }

    public IDiagSession Open(string installPath)
    {
        Sessions++;
        var failure = OpenFails?.Invoke(Sessions);
        if (failure != null) throw failure;
        return new Session(this, Sessions);
    }

    public IEnumerable<Call> CallsOf(string sql) => Calls.Where(call => string.Equals(call.Sql, sql, StringComparison.Ordinal));

    public void Dispose() => Base.Dispose();

    private sealed class Session : IDiagSession
    {
        private readonly DiagRig rig;
        private readonly int id;

        public Session(DiagRig rig, int id)
        {
            this.rig = rig;
            this.id = id;
        }

        public DiagOutcome Run(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
        {
            rig.OnRun?.Invoke(sql);
            rig.Calls.Add(new Call(sql, args.ToDictionary(pair => pair.Key, pair => pair.Value), timeout, id, rig.Now));
            var take = rig.Takes.TryGetValue(sql, out var planned) ? planned : TimeSpan.Zero;
            if (take > timeout)
            {
                rig.Now += timeout;
                return DiagOutcome.Failure((long)timeout.TotalMilliseconds, null, -2, null);
            }
            rig.Now += take;
            var ms = (long)take.TotalMilliseconds;
            if (rig.Throws.TryGetValue(sql, out var thrown)) throw thrown;
            if (rig.SqlFailures.TryGetValue(sql, out var number)) return DiagOutcome.Failure(ms, null, number, null);
            try
            {
                return DiagOutcome.Success(rig.Db.Query(sql, args, timeout), ms, ms / 2);
            }
            catch (BitException)
            {
                return DiagOutcome.Failure(ms, null, 50000, null);
            }
        }

        public void Dispose() => rig.Closed.Add(id);
    }
}

internal static class DiagAnswers
{
    /// <summary>환자 쪽 센티널: 한글 이름, 숫자 차트번호, 영문·숫자 모양. 모두 가짜다.</summary>
    public static readonly string[] Sentinels = { "홍길동", Protocol.Fake.Name, Protocol.Fake.Chart, Protocol.Fake.Phone, "KIMTEST", "A123456", "HONG GILDONG" };

    /// <summary>sys.* 문장의 이름 칸에 넣는 센티널(그 문장이 dbo를 읽지 않는다는 것은 AC-802.2가 증명한다).</summary>
    public static readonly string[] SysSentinels = { "홍길동", Protocol.Fake.Chart, "HONG GILDONG" };

    public static readonly string[] Forbidden = Sentinels.Concat(new[] { Synthetic.Scope, Synthetic.Institution, Synthetic.Root, Synthetic.Server, Synthetic.Database, "dbo.", "SELECT", "FROM " }).ToArray();

    public static IEnumerable<string> ProductStatements =>
        Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Distinct(StringComparer.Ordinal);

    public static void GoodEnvironment(FakeDb db, bool viewServerState = true)
    {
        Row(db, DiagSql.ServerInfo, "15.0.2000.5", "RTM", "Express Edition (64-bit)");
        Row(db, DiagSql.DatabaseInfo, (byte)150, (byte)0, false, true, true, "SIMPLE");
        Row(db, DiagSql.SessionIsolation, (short)2);
        Row(db, DiagSql.Permissions, viewServerState ? 1 : 0, 0);
        Row(db, DiagSql.Cpu, 8, 4);
        Row(db, DiagSql.Memory, 16777216L, 1048576L);
        db.Answer(DiagSql.Configurations, _ => new[]
        {
            new object?[] { "max server memory (MB)", 1024L },
            new object?[] { "max degree of parallelism", 0L },
            new object?[] { "cost threshold for parallelism", 5L },
        });
        db.Answer(DiagSql.TableRows, _ => DiagSql.ReportedTables.Select((table, i) => new object?[] { table, 1000L + i }).ToArray());
        db.Answer(DiagSql.ColumnTypes, _ => DiagSql.ReportedColumns.Select(c => new object?[] { c.Table, c.Column, "varchar", (short)12, false, "Korean_Wansung_CI_AS" }).ToArray());
        db.Answer(DiagSql.Indexes, _ => DiagSql.ReportedTables.Select(table => new object?[] { table, "PK_" + table, "CLUSTERED", true, false, false, "Id" }).ToArray());
        Row(db, DiagSql.Blocking, 3L, 0, 0);
        Row(db, DiagSql.SessionCost, 300, 10L, 9000L);
        db.Answer(DiagSql.SessionWaits, _ => new[] { new object?[] { "PAGEIOLATCH_SH", 800L } });
    }

    public static void GoodPieces(FakeDb db)
    {
        Row(db, DiagSql.PeriodVisitsCount, 45000L, 44990L, 45000L);
        Row(db, DiagSql.FirstVisitsAsWritten, 9000L, 9000L);
        Row(db, DiagSql.FirstVisitsPlainJoin, 9000L, 9000L);
        Row(db, DiagSql.OrdersCount, 120000L, 120000L);
    }

    /// <summary>형식 맞는 제품 답. 숫자 칸은 숫자이고 글자 칸만 센티널이라 세 제품 읽기가 끝까지 돈다.</summary>
    public static void GoodProducts(FakeDb db)
    {
        RevenueFake.Quiet(db);
        StatsFake.AnswerReport(db);
        db.Answer(Sql.SnapshotStateSql, _ => new[] { new object?[] { 0 } });
        db.Answer(StatsSql.HistoryGuardSql, _ => new[] { new object?[] { 0 } });
        db.Answer(StatsSql.VisitRowsSql, _ => new[]
        {
            new object?[] { "KIMTEST", "20260901", "A123456", "20260115" },
            new object?[] { Protocol.Fake.Chart, "20260902", "HONG GILDONG", "20260902" },
            new object?[] { "홍길동", "20260903", "MM042", null },
        });
        db.Answer(StatsSql.PatientDaysSql, _ => new[]
        {
            new object?[] { "KIMTEST", "20260901", 1L, "20260115" },
            new object?[] { Protocol.Fake.Chart, "20260902", 2L, "20260902" },
        });
        db.Answer(StatsSql.VisitSummarySql, _ => new[] { new object?[] { 4L, 3L, 1L, 0L, 0L, 1L } });
        db.Answer(StatsSql.VisitDaysSql, _ => new[] { new object?[] { "20260901", 1L, 1, 0 } });
        db.Answer(StatsSql.CodeNamesSql, _ => new[] { new object?[] { "A123456", "KIMTEST", "EA", "20200101", "99991231", "1", "", true } });
        RevenueFake.Codes(db, RevenueFake.Code("A123456", 2, 1000m, 0, "HONG GILDONG"), RevenueFake.Code(Protocol.Fake.Chart, 1, 500m, 0, "홍길동"));
    }

    public static DiagRig Clinic(bool viewServerState = true)
    {
        var rig = new DiagRig();
        GoodEnvironment(rig.Db, viewServerState);
        GoodPieces(rig.Db);
        GoodProducts(rig.Db);
        return rig;
    }

    public static void Row(FakeDb db, string sql, params object?[] cells) => db.Answer(sql, _ => new[] { cells });

    public static void AssertClean(string text)
    {
        foreach (var word in Forbidden) Assert.DoesNotContain(word, text);
    }
}

public class DiagRunnerTests
{
    private static readonly TimeSpan Minute = TimeSpan.FromMinutes(1);

    private static readonly string[] Pieces = { DiagSql.PeriodVisitsCount, DiagSql.FirstVisitsAsWritten, DiagSql.FirstVisitsPlainJoin, DiagSql.OrdersCount };

    [Fact(DisplayName = "AC-801.1 측정 세션의 모든 칸이 센티널이어도 보고서·콘솔에 없고 측정은 끝까지 간다")]
    public void EveryCellIsASentinel()
    {
        using var rig = new DiagRig();
        var patient = new object?[] { "KIMTEST", Protocol.Fake.Chart, "홍길동", "A123456", "HONG GILDONG", Protocol.Fake.Name, Protocol.Fake.Phone, "KIMTEST", "A123456", "홍길동" };
        foreach (var sql in DiagAnswers.ProductStatements.Concat(DiagSql.Pieces)) rig.Db.Answer(sql, _ => new[] { patient });
        var system = new object?[] { "홍길동", Protocol.Fake.Chart, "HONG GILDONG", "홍길동", Protocol.Fake.Chart, "HONG GILDONG", "홍길동" };
        foreach (var sql in DiagSql.Environment) rig.Db.Answer(sql, _ => new[] { system });

        var report = rig.Run();

        DiagAnswers.AssertClean(report);
        DiagAnswers.AssertClean(rig.Console);
        Assert.Contains("gate ms=0 result=ok", report);
        foreach (var sql in Pieces) Assert.NotEmpty(rig.CallsOf(sql));
        Assert.NotEmpty(rig.CallsOf(StatsSql.VisitRowsSql));
        Assert.NotEmpty(rig.CallsOf(RevenueSql.HistoryGuard));
        Assert.Contains("end ", report);
    }

    [Fact(DisplayName = "AC-801.1 환경 줄의 첫 칸만 진짜 표·설정 이름이고 나머지 칸이 센티널이어도 보고서에 없다")]
    public void EnvironmentRowsWithRealFirstCells()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Db.Answer(DiagSql.TableRows, _ => DiagSql.ReportedTables.Select(table => new object?[] { table, Protocol.Fake.Chart }).ToArray());
        rig.Db.Answer(DiagSql.ColumnTypes, _ => DiagSql.ReportedColumns.Select(c => new object?[] { c.Table, c.Column, "홍길동", Protocol.Fake.Chart, "HONG GILDONG", "홍길동" }).ToArray());
        rig.Db.Answer(DiagSql.Indexes, _ => DiagSql.ReportedTables.Select(table => new object?[] { table, "홍길동", Protocol.Fake.Chart, "HONG GILDONG", "홍길동", Protocol.Fake.Chart, "HONG GILDONG" }).ToArray());
        rig.Db.Answer(DiagSql.Configurations, _ => new[] { new object?[] { "max degree of parallelism", Protocol.Fake.Chart } });

        var report = rig.Run();

        DiagAnswers.AssertClean(report);
        Assert.Contains("rows OcmInf=? ", report);
        Assert.Contains("col OcmInf.OcmChtNum ? len=? null=? coll=?", report);
        Assert.Contains("idx OcmInf: ?[O](?)", report);
    }

    [Fact(DisplayName = "AC-801.1 글자 칸만 센티널인 형식 맞는 줄로 세 제품 읽기가 끝까지 돌아도 보고서·콘솔에 없다")]
    public void WellFormedRowsThroughTheProductReads()
    {
        using var rig = DiagAnswers.Clinic();

        var report = rig.Run();

        DiagAnswers.AssertClean(report);
        DiagAnswers.AssertClean(rig.Console);
        Assert.Contains("read StatsRows.Read result=ok", report);
        Assert.Contains("read StatsReport.Read result=ok", report);
        Assert.Contains("read RevenueDays.Read result=ok", report);
    }

    [Fact(DisplayName = "AC-801.2 예외 글·실패 글에 든 센티널은 싣지 않고 형 이름·번호만 적는다")]
    public void ExceptionTextNeverReachesTheReport()
    {
        using var rig = DiagAnswers.Clinic();
        var text = string.Join(" ", DiagAnswers.Sentinels) + " " + Synthetic.Scope + " SELECT * FROM dbo.OcmInf";
        rig.Throws[DiagSql.PeriodVisitsCount] = new InvalidOperationException(text);
        rig.Throws[StatsSql.VisitRowsSql] = new FormatException(text);
        rig.Throws[DiagSql.ServerInfo] = new ArgumentException(text);
        rig.OpenFails = session => session == 6 ? new TimeoutException(text) : null;

        var report = rig.Run();

        DiagAnswers.AssertClean(report);
        DiagAnswers.AssertClean(rig.Console);
        Assert.Contains("오류 InvalidOperationException", report);
        Assert.Contains("오류 FormatException", report);
        Assert.Contains("오류 ArgumentException", report);
        Assert.Contains("오류 TimeoutException", report);
    }

    [Fact(DisplayName = "AC-801.2 세션 열기 실패의 종류 글자가 이름 모양이 아니면 적지 않는다")]
    public void OpenFailureKindIsFiltered()
    {
        using var rig = DiagAnswers.Clinic();
        rig.OpenFails = session => new DiagOpenFailedException(null, "홍길동");

        var report = rig.Run();

        DiagAnswers.AssertClean(report);
        Assert.Contains("오류 ?", report);
    }

    [Fact(DisplayName = "AC-802.3 목록 밖 문장은 세션에 닿기 전에 막히고 실패로 적힌다")]
    public void OutsideTheListNeverReachesTheSession()
    {
        using var rig = new DiagRig();
        using var session = rig.Open("root");
        var none = new Dictionary<string, object?>();

        var outcome = DiagStatement.Run(session, "DELETE FROM dbo.OcmInf", none, Minute, () => rig.Now);

        Assert.False(outcome.Ok);
        Assert.Equal(BitErrors.ReadFailed, outcome.ErrorKind);
        Assert.Empty(rig.Calls);

        var db = new TimingBitDb(session, new DiagBudget(() => rig.Now), () => rig.Now, (_, _) => { });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => db.Query("DROP TABLE dbo.OcmInf", none, Minute)).Code);
        Assert.Empty(rig.Calls);
    }

    [Fact(DisplayName = "AC-805.1 열두 단계가 차례로 n/12로 콘솔에 나온다")]
    public void EveryStepIsShown()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Run();
        for (var step = 1; step <= DiagRunner.StepCount; step++)
        {
            Assert.Contains(step + "/" + DiagRunner.StepCount + " ", rig.Console);
        }
        Assert.Equal(12, DiagRunner.StepCount);
        Assert.Contains("1/12 읽는 중…", rig.Console);
    }

    [Fact(DisplayName = "AC-806.1 자료 문장의 제한은 10분이고(제품의 150초·15초를 올린다) 환경 문장은 30초다")]
    public void StatementLimits()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Run();

        Assert.All(DiagSql.Environment.Where(sql => sql != DiagSql.Blocking), sql => Assert.All(rig.CallsOf(sql), call => Assert.Equal(TimeSpan.FromSeconds(30), call.Timeout)));
        Assert.All(Pieces, sql => Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(sql).Single().Timeout));
        Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(StatsSql.VisitRowsSql).Single().Timeout);
        Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(StatsSql.HistoryGuardSql).First().Timeout);
        Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(RevenueSql.FinanceNormalExtra).First().Timeout);
    }

    [Fact(DisplayName = "AC-806.3 모든 문장이 막혀도 단계 끝 시각에 끊겨 뒤 단계가 재이고 40분에 끝난다")]
    public void EverythingBlocked()
    {
        using var rig = DiagAnswers.Clinic();
        foreach (var sql in DiagAnswers.ProductStatements.Concat(DiagSql.Pieces)) rig.Takes[sql] = TimeSpan.FromHours(1);

        var report = rig.Run();

        Assert.Equal(TimeSpan.FromMinutes(40), rig.Now);
        Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(DiagSql.PeriodVisitsCount).Single().Timeout);
        Assert.Equal(TimeSpan.FromMinutes(10), rig.CallsOf(DiagSql.FirstVisitsAsWritten).Single().Timeout);
        Assert.Equal(TimeSpan.FromMinutes(5), rig.CallsOf(DiagSql.FirstVisitsPlainJoin).Single().Timeout);
        Assert.Empty(rig.CallsOf(DiagSql.OrdersCount));
        Assert.Contains("skip Orders reason=time", report);

        // StatsRows.Read는 28분에 끊기고 남은 문장은 30분까지, 보고 35분, 매출 40분
        Assert.Equal(TimeSpan.FromMinutes(25), rig.CallsOf(StatsSql.HistoryGuardSql).First().StartedAt);
        Assert.Equal(TimeSpan.FromMinutes(3), rig.CallsOf(StatsSql.HistoryGuardSql).First().Timeout);
        Assert.Contains("read StatsRows.Read result=E-BIT-READ-FAILED", report);
        Assert.Equal(TimeSpan.FromMinutes(2), rig.CallsOf(StatsSql.CodeNamesSql).Single().Timeout);
        Assert.Equal(TimeSpan.FromMinutes(5), rig.CallsOf(Sql.SnapshotStateSql).Single().Timeout);
        Assert.Contains("read StatsReport.Read result=E-BIT-READ-FAILED", report);
        Assert.Contains("read RevenueDays.Read result=E-BIT-READ-FAILED", report);

        // 자료 문장이 40분을 넘겨 돌지 않는다
        Assert.All(rig.Calls.Where(call => !DiagSql.Environment.Contains(call.Sql)), call => Assert.True(call.StartedAt + call.Timeout <= TimeSpan.FromMinutes(40)));
        Assert.Contains("end ms=2400000", report);
    }

    [Fact(DisplayName = "AC-806.2 돌던 제품 읽기는 시각이 지나면 그 자리에서 stopped다")]
    public void ProductReadStopsAtTheStepEnd()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Takes[StatsSql.VisitRowsSql] = TimeSpan.FromMinutes(9);
        rig.Takes[StatsSql.PatientDaysSql] = TimeSpan.FromMinutes(9);
        rig.Takes[StatsSql.VisitSummarySql] = TimeSpan.FromMinutes(9.5);
        rig.Takes[StatsSql.VisitDaysSql] = TimeSpan.FromMinutes(0.5);

        var report = rig.Run();

        Assert.Contains("read StatsRows.Read result=stopped", report);
        // 시도하지 못한 문장은 남은 문장 단계에서 돈다
        Assert.Single(rig.CallsOf(StatsSql.CodeNamesSql));
    }

    [Fact(DisplayName = "AC-806.2 전체 40분이 지나면 자료 문장을 시작하지 않고 skip과 end를 적는다")]
    public void PastTheCeiling()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Now = TimeSpan.FromMinutes(41);

        var report = rig.Run();

        foreach (var sql in Pieces) Assert.Empty(rig.CallsOf(sql));
        Assert.Empty(rig.CallsOf(StatsSql.VisitRowsSql));
        Assert.Contains("skip PeriodVisits reason=time", report);
        Assert.Contains("skip Orders reason=time", report);
        Assert.Contains("skip StatsRows.Read reason=time", report);
        Assert.Contains("skip StatsReport.Read reason=time", report);
        Assert.Contains("skip RevenueDays.Read reason=time", report);
        Assert.Contains("end ms=", report);
        Assert.Contains("stopped=time", report);
    }

    [Fact(DisplayName = "AC-806.4 문장이 끝날 때마다 합계까지 디스크에 있다(닫기 전에 읽어 본다)")]
    public void ResultsSurviveACrash()
    {
        using var rig = DiagAnswers.Clinic();
        string? atDays = null;
        string? atExtra = null;
        rig.OnRun = sql =>
        {
            if (sql == StatsSql.VisitDaysSql) atDays = rig.ReportSoFar();
            if (sql == RevenueSql.FinanceNormalExtra && atExtra == null) atExtra = rig.ReportSoFar();
        };

        rig.Run();

        Assert.StartsWith("speed-report commit=", atDays);
        Assert.Contains("piece Orders ", atDays);
        Assert.Contains("stmt StatsSql.VisitRowsSql n=1", atDays);
        Assert.Contains("stmt StatsSql.VisitSummarySql n=1", atDays);
        Assert.DoesNotContain("end ms=", atDays);
        Assert.Contains("read StatsRows.Read result=ok", atExtra);
        Assert.Contains("stmt RevenueSql.FinanceReceivable", atExtra);
    }

    [Fact(DisplayName = "AC-806.5 문장 실패는 SQL 오류 번호를 적고 다음 항목으로 넘어간다")]
    public void FailureIsRecordedAndTheRunContinues()
    {
        using var rig = DiagAnswers.Clinic();
        rig.SqlFailures[DiagSql.FirstVisitsAsWritten] = 1205;
        rig.SqlFailures[StatsSql.VisitSummarySql] = 1222;

        var report = rig.Run();

        Assert.Contains("piece FirstVisits-as-written ms=0 rows=? err=오류 1205", report);
        Assert.Contains("piece FirstVisits-plain-join ms=0 rows=9000", report);
        Assert.Contains("piece Orders ", report);
        Assert.Contains("stmt StatsSql.VisitSummarySql n=1 ms=0 max=0 first=? rows=0 errs=1 last=오류 1222", report);
        Assert.Contains("read StatsRows.Read result=E-BIT-READ-FAILED", report);
        Assert.Contains("read StatsReport.Read result=ok", report);
        Assert.Contains("read RevenueDays.Read result=ok", report);
    }

    [Fact(DisplayName = "AC-806.5 시간 초과는 -2로 적고 세션 열기 실패는 번호를 적은 뒤 넘어간다")]
    public void TimeoutAndOpenFailure()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Takes[DiagSql.OrdersCount] = TimeSpan.FromMinutes(11);
        var opened = 0;
        rig.OpenFails = _ => ++opened == 5 ? new DiagOpenFailedException(4060, null) : null;

        var report = rig.Run();

        Assert.Contains("err=오류 -2(시간 초과)", report);
        Assert.Contains("오류 4060", report);
        Assert.Contains("read StatsRows.Read result=ok", report);
    }

    [Fact(DisplayName = "AC-806.6 문장이 모두 도는 가장 긴 경우에도 80줄 이하이고 줄마다 1500자 이하다")]
    public void ReportStaysShort()
    {
        using var rig = DiagAnswers.Clinic();
        // 남은 문장이 돌게 진료 줄에서 멈추고(보고·매출은 끝까지 돈다), 색인을 아주 많이 준다
        rig.SqlFailures[StatsSql.VisitRowsSql] = 1222;
        rig.Db.Answer(DiagSql.Indexes, _ => Enumerable.Range(0, 2000).Select(i => new object?[] { "OcmInf", "IX_" + i, "NONCLUSTERED", false, false, false, "Col" + i }).ToArray());

        rig.Run();

        var lines = rig.Lines();
        Assert.True(lines.Length <= 80, "줄 수 " + lines.Length);
        Assert.All(lines, line => Assert.True(line.Length <= 1500));
    }

    [Fact(DisplayName = "AC-807.1 등록 확인 → 환경 → 막힘 → 조각 → 제품 읽기 → 남은 문장 → 보고 → 매출 차례다")]
    public void Order()
    {
        using var rig = DiagAnswers.Clinic();
        rig.SqlFailures[StatsSql.PatientDaysSql] = 1222;

        rig.Run();

        var first = new Func<string, int>(sql => rig.Calls.FindIndex(call => string.Equals(call.Sql, sql, StringComparison.Ordinal)));
        var order = new[]
        {
            DiagSql.ServerInfo, DiagSql.DatabaseInfo, DiagSql.SessionIsolation, DiagSql.Permissions, DiagSql.Cpu, DiagSql.Memory, DiagSql.Configurations,
            DiagSql.TableRows, DiagSql.ColumnTypes, DiagSql.Indexes, DiagSql.Blocking,
            DiagSql.PeriodVisitsCount, DiagSql.FirstVisitsAsWritten, DiagSql.FirstVisitsPlainJoin, DiagSql.OrdersCount,
            StatsSql.HistoryGuardSql, StatsSql.VisitRowsSql, StatsSql.PatientDaysSql,
            StatsSql.CodeNamesSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql,
            StatsSql.TreatmentsSql, RevenueSql.FinanceNormalExtra,
        };
        var positions = order.Select(first).ToList();
        Assert.DoesNotContain(-1, positions);
        Assert.Equal(positions.OrderBy(position => position), positions);
    }

    [Fact(DisplayName = "AC-807.1 등록 확인이 막히면 자료 단계는 skip이고 환경 단계는 돈다")]
    public void GateBlockedKeepsTheEnvironment()
    {
        using var rig = new DiagRig(registered: false);
        DiagAnswers.GoodEnvironment(rig.Db);

        var report = rig.Run();

        Assert.Contains("result=" + BitErrors.NotRegistered, report);
        Assert.Contains("server version=15.0.2000.5", report);
        Assert.Contains("skip PeriodVisits reason=not_registered", report);
        Assert.Contains("skip RevenueDays.Read reason=not_registered", report);
        foreach (var sql in Pieces) Assert.Empty(rig.CallsOf(sql));
        Assert.Empty(rig.CallsOf(StatsSql.VisitRowsSql));
        Assert.Contains("end ms=", report);
    }

    [Fact(DisplayName = "AC-807.1 비트 설치를 못 찾으면 나머지를 skip으로 적고 끝난다")]
    public void NoInstall()
    {
        using var rig = new DiagRig();
        rig.Base.Locator.FailCode = BitErrors.NotFound;

        var report = rig.Run();

        Assert.Contains("result=" + BitErrors.NotFound, report);
        Assert.Contains("reason=no_install", report);
        Assert.Empty(rig.Calls);
        Assert.Contains("end ms=", report);
    }

    [Fact(DisplayName = "AC-807.2 판·에디션·호환성·격리·권한·CPU·메모리·설정·줄 수·칸·색인이 적힌다")]
    public void EnvironmentLinesAreWritten()
    {
        using var rig = DiagAnswers.Clinic();

        var report = rig.Run();

        Assert.Contains("server version=15.0.2000.5 level=RTM edition=Express Edition (64-bit)", report);
        Assert.Contains("db compat=150 snapshot=0 rcsi=0 auto_create=1 auto_update=1 recovery=SIMPLE", report);
        Assert.Contains("session open_ms=0 isolation=2", report);
        Assert.Contains("perm view_server_state=1 sysadmin=0", report);
        Assert.Contains("cpu logical=8 schedulers=4", report);
        Assert.Contains("memory physical_mb=16384 committed_target_mb=1024", report);
        Assert.Contains("config max_server_memory_mb=1024 maxdop=0 cost_threshold=5", report);
        Assert.Contains("rows OcmInf=1000 OdrInf=1001 DepMst=1002 SeeMst=1003 OrpInf=1004 OrcInf=1005", report);
        Assert.Contains("col OcmInf.OcmChtNum varchar len=12 null=0 coll=Korean_Wansung_CI_AS", report);
        Assert.Contains("col DepMst.DepCod varchar len=12", report);
        Assert.Contains("idx OcmInf: PK_OcmInf[C,U](Id)", report);
        Assert.Contains("idx OrcInf: PK_OrcInf[C,U](Id)", report);
    }

    [Fact(DisplayName = "AC-807.2 권한 오류 번호면 권한 없음, 다른 오류면 오류 번호를 적고 다음 줄로 간다")]
    public void EnvironmentFailures()
    {
        using var rig = DiagAnswers.Clinic();
        rig.SqlFailures[DiagSql.Cpu] = 300;
        rig.SqlFailures[DiagSql.Memory] = 207;
        rig.SqlFailures[DiagSql.Indexes] = 229;

        var report = rig.Run();

        Assert.Contains("cpu 권한 없음", report);
        Assert.Contains("memory 오류 207", report);
        Assert.Contains("idx 권한 없음", report);
        Assert.Contains("config max_server_memory_mb=1024", report);
    }

    [Fact(DisplayName = "AC-807.3 권한이 있으면 막힘을 읽어 적는다")]
    public void BlockingWhenReadable()
    {
        using var rig = DiagAnswers.Clinic();
        var report = rig.Run();
        Assert.Single(rig.CallsOf(DiagSql.Blocking));
        Assert.Contains("block others=3 blocked=0 max_wait_ms=0", report);
    }

    [Fact(DisplayName = "AC-807.3 권한이 없거나 모르면 막힘 문장을 돌리지 않고 권한 없음이다")]
    public void BlockingWhenNotReadable()
    {
        using (var rig = DiagAnswers.Clinic(viewServerState: false))
        {
            var report = rig.Run();
            Assert.Empty(rig.CallsOf(DiagSql.Blocking));
            Assert.Contains("block 권한 없음", report);
        }

        using (var rig = DiagAnswers.Clinic())
        {
            rig.SqlFailures[DiagSql.Permissions] = 229;
            var report = rig.Run();
            Assert.Empty(rig.CallsOf(DiagSql.Blocking));
            Assert.Contains("block 권한 없음", report);
        }
    }

    [Fact(DisplayName = "AC-807.4 조각 네 개는 각각 새 세션에서 돌아 시간·건수를 적고 세션을 닫는다")]
    public void PiecesRunInTheirOwnSessions()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Takes[DiagSql.PeriodVisitsCount] = TimeSpan.FromSeconds(12);

        var report = rig.Run();

        var sessions = Pieces.Select(sql => rig.CallsOf(sql).Single().Session).ToList();
        Assert.Equal(4, sessions.Distinct().Count());
        Assert.All(sessions, session => Assert.Contains(session, rig.Closed));
        Assert.Contains("piece PeriodVisits ms=12000 rows=45000 ", report);
        Assert.Contains("piece FirstVisits-as-written ms=0 rows=9000 ", report);
        Assert.Contains("piece FirstVisits-plain-join ms=0 rows=9000 ", report);
        Assert.Contains("piece Orders ms=0 rows=120000 ", report);
    }

    [Theory(DisplayName = "AC-807.4 두 FirstVisits 건수가 같은지 건수로만 적는다")]
    [InlineData(9000L, 9000L, false, "agree first_visits=same")]
    [InlineData(9000L, 8999L, false, "agree first_visits=differ")]
    [InlineData(9000L, 9000L, true, "agree first_visits=unknown")]
    public void Agreement(long asWritten, long plain, bool fail, string expected)
    {
        using var rig = DiagAnswers.Clinic();
        DiagAnswers.Row(rig.Db, DiagSql.FirstVisitsAsWritten, asWritten, asWritten);
        DiagAnswers.Row(rig.Db, DiagSql.FirstVisitsPlainJoin, plain, plain);
        if (fail) rig.SqlFailures[DiagSql.FirstVisitsPlainJoin] = 1222;

        Assert.Contains(expected, rig.Run());
    }

    [Fact(DisplayName = "AC-807.5 제품 읽기는 대시보드와 같은 기간이고 문장마다 상수 이름으로 합계를 적는다")]
    public void ProductReads()
    {
        using var rig = DiagAnswers.Clinic();
        rig.Takes[StatsSql.VisitRowsSql] = TimeSpan.FromSeconds(10);

        var report = rig.Run();

        // 오늘(2026-10-30) 100일 전 ~ 오늘
        var visits = rig.CallsOf(StatsSql.VisitRowsSql).Single();
        Assert.Equal("202607220000", visits.Args["@from"]);
        Assert.Equal("202610310000", visits.Args["@to"]);
        Assert.Equal(Synthetic.Scope, visits.Args["@hospital"]);

        // 실패한 명령과 같은 끝날(오늘): 일일 오늘·어제, 월말 이번 달·지난달
        var patients = rig.CallsOf(StatsSql.TreatmentsSql).Select(call => (string)call.Args["@from"]!).ToList();
        Assert.Equal(new[] { "202610300000", "202610290000", "202610010000", "202609010000" }, patients);

        // 매출은 닫힌 지난달 1일 ~ 말일
        var days = rig.CallsOf(RevenueSql.FinanceNormalExtra).Select(call => (string)call.Args["@day"]!).ToList();
        Assert.Equal(30, days.Count);
        Assert.Equal("20260901", days.First());
        Assert.Equal("20260930", days.Last());

        Assert.Contains("stmt StatsSql.VisitRowsSql n=1 ms=10000 max=10000 first=5000 rows=3", report);
        Assert.Contains("stmt RevenueSql.FinanceNormalExtra n=30 ", report);
        Assert.Contains("stmt RevenueSql.CodeAmounts n=1 ms=0 max=0 first=0 rows=2", report);
        Assert.Contains("== StatsRows.Read ==", report);
        Assert.Contains("== StatsReport.Read ==", report);
        Assert.Contains("== RevenueDays.Read ==", report);
    }

    [Fact(DisplayName = "AC-807.5 제품 읽기는 읽기마다 새 세션 하나로 돌고 답은 제품 코드로 돌아간다")]
    public void ProductReadsUseOneSessionEach()
    {
        using var rig = DiagAnswers.Clinic();
        var report = rig.Run();

        Assert.Single(rig.CallsOf(StatsSql.VisitRowsSql).Select(call => call.Session).Distinct());
        Assert.Equal(
            rig.CallsOf(StatsSql.VisitRowsSql).Single().Session,
            rig.CallsOf(StatsSql.VisitDaysSql).Single().Session);
        Assert.NotEqual(
            rig.CallsOf(StatsSql.VisitRowsSql).Single().Session,
            rig.CallsOf(StatsSql.TreatmentsSql).First().Session);
        Assert.Equal(rig.Sessions, rig.Closed.Count);
        Assert.Contains("read StatsRows.Read result=ok", report);
    }

    [Fact(DisplayName = "AC-807.6 StatsRows.Read가 멈추면 시도하지 못한 문장만 각각 새 세션으로 돌리되 CodeNames가 먼저다")]
    public void RemainingStatementsRunAlone()
    {
        using var rig = DiagAnswers.Clinic();
        rig.SqlFailures[StatsSql.VisitRowsSql] = 1222;

        var report = rig.Run();

        Assert.Single(rig.CallsOf(StatsSql.VisitRowsSql));
        var rest = new[] { StatsSql.CodeNamesSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql };
        var calls = rest.Select(sql => rig.CallsOf(sql).Single()).ToList();
        Assert.Equal(4, calls.Select(call => call.Session).Distinct().Count());
        Assert.DoesNotContain(rig.CallsOf(StatsSql.VisitRowsSql).Single().Session, calls.Select(call => call.Session));
        Assert.True(rig.Calls.IndexOf(calls[0]) < rig.Calls.IndexOf(calls[1]));
        Assert.Contains("== StatsRows 남은 문장 ==", report);

        // 매개변수는 제품과 같다
        Assert.Equal("202607220000", calls[1].Args["@from"]);
        Assert.Equal("20260722", calls[0].Args["@from"]);
        Assert.Equal("20261030", calls[0].Args["@priorTo"]);
    }

    [Fact(DisplayName = "AC-807.6 다 돌았으면 더 돌리지 않고, 첫 문장에서 멈추면 나머지를 모두 돌린다")]
    public void RemainingOnlyWhenNeeded()
    {
        using (var rig = DiagAnswers.Clinic())
        {
            var report = rig.Run();
            foreach (var sql in new[] { StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql })
            {
                Assert.Single(rig.CallsOf(sql));
            }
            Assert.DoesNotContain("== StatsRows 남은 문장 ==", report);
        }

        using (var rig = DiagAnswers.Clinic())
        {
            // 과거 이관 자료가 있어 E-STATS-HISTORY로 멈춘다
            DiagAnswers.Row(rig.Db, StatsSql.HistoryGuardSql, 1);
            var report = rig.Run();
            Assert.Contains("read StatsRows.Read result=" + StatsErrors.History, report);
            foreach (var sql in new[] { StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql })
            {
                Assert.Single(rig.CallsOf(sql));
            }
        }
    }

    [Fact(DisplayName = "AC-807.8 조각·제품 읽기 줄에 같은 세션의 CPU·읽기·대기를 붙인다")]
    public void CostIsAttached()
    {
        using var rig = DiagAnswers.Clinic();

        var report = rig.Run();

        var piece = rig.CallsOf(DiagSql.OrdersCount).Single().Session;
        Assert.Contains(rig.CallsOf(DiagSql.SessionCost), call => call.Session == piece);
        Assert.Contains(rig.CallsOf(DiagSql.SessionWaits), call => call.Session == piece);
        Assert.Contains("rows=120000 cpu=300 reads=10 lreads=9000 waits=PAGEIOLATCH_SH:800", report);
        Assert.Contains("read StatsRows.Read result=ok ms=0 cpu=300 reads=10 lreads=9000 waits=PAGEIOLATCH_SH:800", report);
    }

    [Fact(DisplayName = "AC-807.8 끊긴 문장 뒤에도 단계 끝·전체 끝과 상관없이 30초 한도로 비용을 읽고, 못 읽으면 ?다")]
    public void CostAfterACutStatement()
    {
        using var rig = DiagAnswers.Clinic();
        foreach (var sql in DiagAnswers.ProductStatements.Concat(DiagSql.Pieces)) rig.Takes[sql] = TimeSpan.FromHours(1);
        rig.SqlFailures[DiagSql.SessionWaits] = 208;

        var report = rig.Run();

        var last = rig.CallsOf(RevenueSql.HistoryGuard).Last();
        var cost = rig.Calls.Skip(rig.Calls.IndexOf(last)).First(call => call.Sql == DiagSql.SessionCost);
        Assert.Equal(last.Session, cost.Session);
        Assert.Equal(TimeSpan.FromMinutes(40), cost.StartedAt);
        Assert.Equal(TimeSpan.FromSeconds(30), cost.Timeout);
        Assert.Contains("cpu=300 reads=10 lreads=9000 waits=?", report);
    }
}
