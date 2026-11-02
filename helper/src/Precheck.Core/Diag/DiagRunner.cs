using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;

namespace Precheck.Core.Diag;

/// <summary>
/// 측정 순서(specs/diag-read-speed). 값싼 것부터: 등록 확인 → 서버·DB 정보 → 표·칸·색인 → 막힘 → 조각 네 개 → StatsRows.Read → 남은 문장 → StatsReport.Read → RevenueDays.Read.
/// 단계마다 새 세션을 열어 앞 단계의 실패가 뒤로 번지지 않게 하고, 비용·대기 값이 그 단계 몫이 되게 한다.
/// 실패는 적고 넘어간다. 보고서에는 DiagFormat을 지난 글만 간다: 범위 값은 매개변수로만 쓰고, 제품 읽기의 줄은 제품 함수 안에서만 쓰인 뒤 버려진다.
/// </summary>
public sealed class DiagRunner
{
    public const int StepCount = 12;

    /// <summary>대시보드의 LOOKBACK_DAYS와 같다(src/components/dashboard/live/readBitDays.ts).</summary>
    public const int LookbackDays = 100;

    private const string StatsRowsTitle = "StatsRows.Read";
    private const string StatsReportTitle = "StatsReport.Read";
    private const string RevenueTitle = "RevenueDays.Read";
    private const string NoInstall = "no_install";
    private const string NotRegistered = "not_registered";
    private const string OutOfTime = "time";

    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    // CodeNamesSql은 FirstVisits가 없어 값싸다. 그래서 먼저 돈다
    private static readonly string[] StatsRowsAloneOrder =
    {
        StatsSql.CodeNamesSql,
        StatsSql.HistoryGuardSql,
        StatsSql.VisitRowsSql,
        StatsSql.PatientDaysSql,
        StatsSql.VisitSummarySql,
        StatsSql.VisitDaysSql,
    };

    private readonly BitServices services;
    private readonly IDiagConnector connector;
    private readonly DiagReport report;
    private readonly DiagProgress progress;
    private readonly Func<TimeSpan> elapsed;
    private readonly Func<DateTime> now;
    private readonly DiagBudget budget;

    private string? root;
    private string? scope;
    private bool canViewServerState;
    private bool stoppedForTime;

    public DiagRunner(BitServices services, IDiagConnector connector, DiagReport report, DiagProgress progress, Func<TimeSpan> elapsed, Func<DateTime> now)
    {
        this.services = services ?? throw new ArgumentNullException(nameof(services));
        this.connector = connector ?? throw new ArgumentNullException(nameof(connector));
        this.report = report ?? throw new ArgumentNullException(nameof(report));
        this.progress = progress ?? throw new ArgumentNullException(nameof(progress));
        this.elapsed = elapsed ?? throw new ArgumentNullException(nameof(elapsed));
        this.now = now ?? throw new ArgumentNullException(nameof(now));
        budget = new DiagBudget(elapsed);
    }

    public void Run()
    {
        report.Line(DiagFormat.Header(DiagCommit.Value, HelperVersion.Value, now(), LookbackDays, DiagBudget.StatementLimit, DiagBudget.Ceiling));

        progress.Step(1, "비트 연결과 병원 등록 확인");
        Guarded("gate", CheckGate);

        Guarded("server", ServerStep);
        Guarded("tables", TablesStep);
        Guarded("block", BlockingStep);

        budget.StartBy(DiagBudget.PiecesEnd);
        Guarded("PeriodVisits", () => Piece(5, "기간 접수 세기", DiagSql.PeriodVisitsCount));
        long? asWritten = null;
        long? plainJoin = null;
        Guarded("FirstVisits-as-written", () => asWritten = Piece(6, "첫 내원 찾기: 지금 방식", DiagSql.FirstVisitsAsWritten));
        Guarded("FirstVisits-plain-join", () => plainJoin = Piece(7, "첫 내원 찾기: 바꾼 방식", DiagSql.FirstVisitsPlainJoin));
        report.Line(DiagFormat.Agree(asWritten, plainJoin));
        Guarded("Orders", () => Piece(8, "처방 줄 세기", DiagSql.OrdersCount));

        var today = services.Today().Date;
        var from = Iso(today.AddDays(-LookbackDays));
        var to = Iso(today);
        var attempted = new HashSet<string>(StringComparer.Ordinal);
        Guarded(StatsRowsTitle, () => ProductRead(9, "통계 읽기 전체", StatsRowsTitle, DiagBudget.StatsRowsEnd, attempted, db => StatsRows.Read(db, scope!, from, to)));
        Guarded("StatsRows-alone", () => RemainingStatements(attempted, today));
        Guarded(StatsReportTitle, () => ProductRead(11, "보고 숫자 읽기", StatsReportTitle, DiagBudget.StatsReportEnd, null, db => StatsReport.Read(db, scope!, to)));

        // 닫힌 지난달
        var firstOfMonth = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
        var lastOfMonth = firstOfMonth.AddMonths(1).AddDays(-1);
        Guarded(RevenueTitle, () => ProductRead(12, "매출 한 달 읽기", RevenueTitle, DiagBudget.RevenueEnd, null, db => RevenueDays.Read(db, scope!, firstOfMonth, lastOfMonth)));

        progress.Finish();
        report.Line("end ms=" + Ms(elapsed()) + " stopped=" + (stoppedForTime ? OutOfTime : "none"));
    }

    /// <summary>제품과 같은 관문으로 등록을 확인하고 범위 값을 얻은 뒤 그 세션은 닫는다.</summary>
    private void CheckGate()
    {
        var started = elapsed();
        string result;
        try
        {
            root = services.Locator.Find();
            using var hospital = HospitalGate.Open(services);
            scope = hospital.Registration.Scope;
            result = "ok";
        }
        catch (HelperException e)
        {
            result = DiagFormat.Identifier(e.Code);
        }
        report.Line("gate ms=" + Ms(elapsed() - started) + " result=" + result);
    }

    private void ServerStep()
    {
        if (!StartEnvironment(2, "서버와 DB 정보", "server")) return;
        var session = Open("server", out var openMs);
        if (session == null) return;
        using (session)
        {
            Environment(session, DiagSql.ServerInfo, "server", DiagFormat.ServerLine);
            Environment(session, DiagSql.DatabaseInfo, "db", DiagFormat.DatabaseLine);
            Environment(session, DiagSql.SessionIsolation, "session", rows => DiagFormat.SessionLine(openMs, rows));
            Environment(session, DiagSql.Permissions, "perm", rows =>
            {
                canViewServerState = DiagFormat.CanViewServerState(rows);
                return DiagFormat.PermissionLine(rows);
            });
            Environment(session, DiagSql.Cpu, "cpu", DiagFormat.CpuLine);
            Environment(session, DiagSql.Memory, "memory", DiagFormat.MemoryLine);
            Environment(session, DiagSql.Configurations, "config", DiagFormat.ConfigLine);
        }
    }

    private void TablesStep()
    {
        if (!StartEnvironment(3, "표 크기·칸·색인 정보", "tables")) return;
        var session = Open("rows", out _);
        if (session == null) return;
        using (session)
        {
            Environment(session, DiagSql.TableRows, "rows", DiagFormat.RowsLine);
            EnvironmentLines(session, DiagSql.ColumnTypes, "col", DiagFormat.ColumnLines);
            EnvironmentLines(session, DiagSql.Indexes, "idx", DiagFormat.IndexLines);
        }
    }

    private void BlockingStep()
    {
        if (!StartEnvironment(4, "막힌 작업이 있는지", "block")) return;

        // 권한이 없으면 자기 요청만 보여 "막힌 것 없음"으로 잘못 읽힌다. 그래서 돌리지 않는다
        if (!canViewServerState)
        {
            report.Line("block " + DiagFormat.Failure(300, null));
            return;
        }
        var session = Open("block", out _);
        if (session == null) return;
        using (session)
        {
            Environment(session, DiagSql.Blocking, "block", DiagFormat.BlockLine);
        }
    }

    private bool StartEnvironment(int step, string what, string label)
    {
        if (root == null)
        {
            Skip(step, what, label, NoInstall);
            return false;
        }
        progress.Step(step, what);
        return true;
    }

    private void Environment(IDiagSession session, string sql, string prefix, Func<IReadOnlyList<IReadOnlyList<object?>>, string> format)
    {
        var outcome = DiagStatement.Run(session, sql, NoArgs, DiagBudget.ShortLimit, elapsed);
        report.Line(outcome.Ok ? format(outcome.Rows) : prefix + " " + DiagFormat.Failure(outcome.SqlNumber, outcome.ErrorKind));
    }

    private void EnvironmentLines(IDiagSession session, string sql, string prefix, Func<IReadOnlyList<IReadOnlyList<object?>>, IReadOnlyList<string>> format)
    {
        var outcome = DiagStatement.Run(session, sql, NoArgs, DiagBudget.ShortLimit, elapsed);
        if (!outcome.Ok)
        {
            report.Line(prefix + " " + DiagFormat.Failure(outcome.SqlNumber, outcome.ErrorKind));
            return;
        }
        foreach (var line in format(outcome.Rows)) report.Line(line);
    }

    /// <summary>조각 하나: 새 세션에서 건수만 받는다. 건수를 돌려준다(못 읽으면 null).</summary>
    private long? Piece(int step, string what, string sql)
    {
        var label = DiagLabels.Of(sql);
        if (!CanRunData(step, what, label)) return null;
        progress.Step(step, what);
        var session = Open("piece " + label, out _);
        if (session == null) return null;
        using (session)
        {
            var limit = budget.NextLimit();
            var outcome = DiagStatement.Run(session, sql, VisitArgs(services.Today().Date), limit, elapsed);
            var rows = outcome.Ok && outcome.Rows.Count > 0 && outcome.Rows[0].Count > 0 ? DiagFormat.Count(outcome.Rows[0][0]) : null;
            report.Line(DiagFormat.Piece(label, outcome.TotalMs, rows, outcome.Ok ? null : DiagFormat.Failure(outcome.SqlNumber, outcome.ErrorKind), Cost(session)));
            return rows;
        }
    }

    /// <summary>제품 읽기 하나를 감싸개로 그대로 돌린다. 문장이 끝날 때마다 합계를 디스크까지 쓴다.</summary>
    private void ProductRead(int step, string what, string title, TimeSpan end, HashSet<string>? attempted, Action<IBitDb> read)
    {
        budget.StartBy(end);
        if (!CanRunData(step, what, title)) return;
        progress.Step(step, what);
        report.Line("== " + title + " ==");
        var session = Open("read " + title, out _);
        if (session == null) return;
        using (session)
        {
            var table = new DiagStatementTable();
            var db = new TimingBitDb(session, budget, elapsed, (label, outcome) =>
            {
                table.Add(label, outcome);
                report.Tail(table.Lines());
            });
            var started = elapsed();
            string result;
            try
            {
                read(db);
                result = "ok";
            }
            catch (DiagStoppedException)
            {
                stoppedForTime = true;
                result = "stopped";
            }
            catch (HelperException e)
            {
                result = DiagFormat.Identifier(e.Code);
            }
            catch (Exception e)
            {
                result = DiagFormat.Identifier(e.GetType().Name);
            }
            finally
            {
                attempted?.UnionWith(db.Attempted);
            }
            var ms = Ms(elapsed() - started);
            report.Line("read " + title + " result=" + result + " ms=" + ms + " " + Cost(session));
        }
    }

    /// <summary>StatsRows.Read가 시도하지 못한 문장만 각각 새 세션으로 돌린다(그 읽기가 중간에 멈추면 뒤 문장의 시간을 모르므로).</summary>
    private void RemainingStatements(HashSet<string> attempted, DateTime today)
    {
        const int step = 10;
        const string what = "통계의 남은 문장";
        budget.StartBy(DiagBudget.RemainingEnd);
        var rest = StatsRowsAloneOrder.Where(sql => !attempted.Contains(sql)).ToList();
        if (rest.Count == 0)
        {
            progress.Skip(step, what + ": 따로 읽을 것 없음");
            return;
        }
        if (!CanRunData(step, what, "StatsRows-alone")) return;
        progress.Step(step, what);
        report.Line("== StatsRows 남은 문장 ==");
        foreach (var sql in rest)
        {
            var label = DiagLabels.Of(sql);
            if (!budget.CanStart)
            {
                stoppedForTime = true;
                report.Line("skip " + label + " reason=" + OutOfTime);
                continue;
            }
            var session = Open("stmt " + label, out _);
            if (session == null) continue;
            using (session)
            {
                var limit = budget.NextLimit();
                var outcome = DiagStatement.Run(session, sql, StatsRowsArgs(sql, today), limit, elapsed);
                var failure = outcome.Ok ? null : DiagFormat.Failure(outcome.SqlNumber, outcome.ErrorKind);
                report.Line(DiagFormat.Statement(label, 1, outcome.TotalMs, outcome.TotalMs, outcome.FirstRowMs, outcome.Rows.Count, outcome.Ok ? 0 : 1, failure) + " " + Cost(session));
            }
        }
    }

    /// <summary>자료 단계를 돌릴 수 있나. 아니면 건너뛴 까닭을 적는다.</summary>
    private bool CanRunData(int step, string what, string label)
    {
        if (root == null)
        {
            Skip(step, what, label, NoInstall);
            return false;
        }
        if (scope == null)
        {
            Skip(step, what, label, NotRegistered);
            return false;
        }
        if (!budget.CanStart)
        {
            stoppedForTime = true;
            Skip(step, what, label, OutOfTime);
            return false;
        }
        return true;
    }

    private void Skip(int step, string what, string label, string reason)
    {
        progress.Skip(step, what);
        report.Line("skip " + DiagFormat.Identifier(label) + " reason=" + reason);
    }

    /// <summary>같은 세션의 비용·대기. 끊긴 문장 바로 뒤에도 단계 끝·전체 끝과 상관없이 짧은 한도로 돈다.</summary>
    private string Cost(IDiagSession session)
    {
        var cost = DiagStatement.Run(session, DiagSql.SessionCost, NoArgs, DiagBudget.ShortLimit, elapsed);
        var waits = DiagStatement.Run(session, DiagSql.SessionWaits, NoArgs, DiagBudget.ShortLimit, elapsed);
        return DiagFormat.Cost(cost.Ok ? cost.Rows : null, waits.Ok ? waits.Rows : null);
    }

    /// <summary>세션을 연다. 못 열면 번호·종류를 적고 null.</summary>
    private IDiagSession? Open(string prefix, out long openMs)
    {
        var started = elapsed();
        openMs = 0;
        try
        {
            var session = connector.Open(root!);
            openMs = (long)(elapsed() - started).TotalMilliseconds;
            return session;
        }
        catch (DiagOpenFailedException e)
        {
            report.Line(prefix + " " + DiagFormat.Failure(e.SqlNumber, e.Code));
        }
        catch (HelperException e)
        {
            report.Line(prefix + " " + DiagFormat.Failure(null, e.Code));
        }
        catch (Exception e)
        {
            report.Line(prefix + " " + DiagFormat.Failure(null, e.GetType().Name));
        }
        return null;
    }

    /// <summary>한 단계가 무엇으로 멈춰도 다음 단계로 간다. 예외 글은 쓰지 않는다.</summary>
    private void Guarded(string label, Action step)
    {
        try
        {
            step();
        }
        catch (DiagStoppedException)
        {
            stoppedForTime = true;
            report.Line("skip " + DiagFormat.Identifier(label) + " reason=" + OutOfTime);
        }
        catch (Exception e)
        {
            report.Line("step " + DiagFormat.Identifier(label) + " " + DiagFormat.Failure(null, e.GetType().Name));
        }
    }

    // StatsRows.Read와 같은 값: 끝은 마지막 날의 다음 날 0시
    private IReadOnlyDictionary<string, object?> VisitArgs(DateTime today) => new Dictionary<string, object?>(StringComparer.Ordinal)
    {
        ["@from"] = StatsRows.Key(today.AddDays(-LookbackDays)) + "0000",
        ["@to"] = StatsRows.Key(today.AddDays(1)) + "0000",
        ["@hospital"] = scope,
    };

    private IReadOnlyDictionary<string, object?> StatsRowsArgs(string sql, DateTime today)
    {
        if (sql == StatsSql.HistoryGuardSql) return NoArgs;
        if (sql != StatsSql.CodeNamesSql) return VisitArgs(today);
        var first = StatsRows.Key(today.AddDays(-LookbackDays));
        var last = StatsRows.Key(today);
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = first,
            ["@to"] = last,
            ["@priorFrom"] = first,
            ["@priorTo"] = last,
        };
    }

    private static string Iso(DateTime day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Ms(TimeSpan span) => ((long)span.TotalMilliseconds).ToString(CultureInfo.InvariantCulture);
}
