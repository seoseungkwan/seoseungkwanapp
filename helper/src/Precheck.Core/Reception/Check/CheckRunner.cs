using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Stats;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 의원 PC 확인 명령의 차례(spec reception-phone design.md 1절, REQ-1401): ① 안내 + 엔터 ② 등록 확인 세션 ③ 상태 짝(AC-1401.2)
/// ④ 칸 목록(AC-1401.3) ⑤ 비트 로그인 → 화면 83 하루 → 증상 찾기·이름 찾기(AC-1401.4·5) ⑥ 접수 메모(AC-1401.6) ⑦ 모양(AC-1401.7)
/// ⑧ 빠르기(AC-1401.8) ⑨ 끝: 경로를 콘솔에(메모장은 입구 ReceptionCheckEntry가 연다).
/// 보고서에는 CheckField로 거른 칸만 간다(AC-1401.10). 콘솔에도 숫자·걸러진 코드·시:분·안내 글만 쓴다.
/// 시간 제한(AC-1401.11, 주입한 시계): 문장 하나 30초, 전체 15분. 전체 15분은 도우미가 일한 시간이고 사람이 답하는 시간
/// (콘솔 입력·비트 로그인 창)은 세지 않는다. 넘거나 실패한 항목은 "실패(번호)"로 적고 다음 단계로 간다.
/// 읽은 자료 값(환자 글·차트번호·내원번호·친 메모 글)은 그 단계 안의 지역 변수로만 들고, 필드에 두지 않는다.
/// </summary>
public sealed class CheckRunner
{
    /// <summary>문장 하나의 시간 제한.</summary>
    public static readonly TimeSpan StatementLimit = TimeSpan.FromSeconds(30);

    /// <summary>전체 시간 제한(사람이 답하는 시간은 빼고).</summary>
    public static readonly TimeSpan TotalLimit = TimeSpan.FromMinutes(15);

    /// <summary>화면 83을 찾는 날 수: 어제부터 7일 전까지.</summary>
    public const int ScreenDays = 7;

    /// <summary>빠르기 단계의 상세 쪽(HistoryPage): 처음 화면의 5번.</summary>
    private const int HistoryFirst = 1;
    private const int HistoryLast = 5;

    /// <summary>상태 짝 답 번호를 다시 묻는 횟수.</summary>
    private const int AnswerTries = 3;

    private const string Choices = "1 진료대기 2 진료보류 3 수납대기 4 끝남 5 접수 취소 6 모름";

    private const string VisitSuffix = "OcmNum";

    /// <summary>이름 찾기(AC-1401.5)의 표와 차트번호 칸(이 저장소에 이미 쓰인 칸).</summary>
    private static readonly (string Table, string Chart)[] NameTables = { ("PbsInf", "PbsChtNum"), ("OcmInf", "OcmChtNum") };

    /// <summary>모양 단계(ProbeSql.Sample)가 표를 그날 접수에 잇는 칸.</summary>
    private static readonly Dictionary<string, string> SampleKeys = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["PbsInf"] = "PbsChtNum",
        ["OcmInf"] = "OcmNum",
        ["OrcInf"] = "OrcOcmNum",
    };

    /// <summary>빠르기 단계에서 재는 이 명세의 비트 문장(REQ-1403), 이 차례로.</summary>
    private static readonly (string Name, string Sql)[] TodayStatements =
    {
        (nameof(ReceptionSql.TodayVisits), ReceptionSql.TodayVisits),
        (nameof(ReceptionSql.TodayRx), ReceptionSql.TodayRx),
        (nameof(ReceptionSql.PriorVisits), ReceptionSql.PriorVisits),
        (nameof(ReceptionSql.PriorRx), ReceptionSql.PriorRx),
        (nameof(ReceptionSql.RxNames), ReceptionSql.RxNames),
    };

    private readonly ICheckConsole console;
    private readonly Func<ICheckSession> open;
    private readonly Func<VendorUser?> login;
    private readonly Func<VendorUser, DateTime, IReadOnlyList<IReadOnlyList<string>>> readScreen83;
    private readonly CheckReport report;
    private readonly Func<DateTime> now;
    private readonly string? build;

    /// <param name="open">등록 확인을 마친 확인 모드 세션을 연다(HospitalGate). 막히면 던진다.</param>
    /// <param name="login">비트 로그인 창. 취소하면 null.</param>
    /// <param name="readScreen83">화면 83(증상)을 그날 하루로 조회한 표(머리 줄 포함, GridReader 글자).</param>
    /// <param name="build">보고서 머리 줄의 빌드 표시(판·커밋). 모양이 틀리면 ?.</param>
    public CheckRunner(ICheckConsole console, Func<ICheckSession> open, Func<VendorUser?> login,
                       Func<VendorUser, DateTime, IReadOnlyList<IReadOnlyList<string>>> readScreen83, CheckReport report, Func<DateTime> now,
                       string? build = null)
    {
        this.console = console ?? throw new ArgumentNullException(nameof(console));
        this.open = open ?? throw new ArgumentNullException(nameof(open));
        this.login = login ?? throw new ArgumentNullException(nameof(login));
        this.readScreen83 = readScreen83 ?? throw new ArgumentNullException(nameof(readScreen83));
        this.report = report ?? throw new ArgumentNullException(nameof(report));
        this.now = now ?? throw new ArgumentNullException(nameof(now));
        this.build = build;
    }

    /// <summary>끝까지 돌린다. 단계의 실패는 보고서에 적고 넘어가며, 보고서를 쓰지 못할 때만 던진다. 연 세션은 끝에 닫는다(되돌림).</summary>
    public void Run() => new Pass(this).Run();

    /// <summary>한 번 돌리기의 상태. Run 안에서만 살고, 끝나면 버린다.</summary>
    private sealed class Pass
    {
        private readonly CheckRunner owner;
        private readonly DateTime started;
        private TimeSpan waited;
        private ICheckSession? session;
        private ProbeSchema schema = ProbeSchema.From(Array.Empty<IReadOnlyList<object?>>());

        public Pass(CheckRunner owner)
        {
            this.owner = owner;
            started = owner.now();
        }

        private CheckReport Report => owner.report;

        private DateTime Today => started.Date;

        /// <summary>도우미가 일한 시간(사람이 답한 시간을 뺌).</summary>
        private TimeSpan Spent => Since(started) - waited;

        private bool Over => Spent >= TotalLimit;

        public void Run()
        {
            Report.Header(started, owner.build);
            try
            {
                Say("접수 현황 확인을 시작해요.");
                Say("비트 자료를 읽기만 하고 바꾸지 않아요. 보고서에는 환자 이름·차트번호·메모 글을 적지 않아요.");
                Say("진료 시간에 비트 접수 화면을 옆에 띄워 두세요. 준비되면 엔터를 누르세요.");
                Ask();

                OpenSession();
                Step("statusPairs", "2/7 오늘 접수 상태를 물어요.", StatusPairs);
                Step("columns", "3/7 칸 목록을 읽고 있어요.", Columns);
                Step("login", "4/7 비트 로그인 창이 뜨면 로그인하세요. 증상 화면을 읽어요. 취소하면 이 단계를 건너뛰어요.", ScreenProbes, "symptom", "name");
                Step("memo", "5/7 접수 메모를 견줘요.", Memo);
                Step("shape", "6/7 칸 모양을 보고 있어요.", Shapes);
                Step("speed", "7/7 빠르기를 재고 있어요.", Speed);
                Report.Line("done", CheckField.Number("ms", Milliseconds(Spent)));
            }
            finally
            {
                session?.Dispose();
                session = null;
            }

            Say("끝났어요. 보고서를 저장했어요: " + Report.FilePath);
            Say("메모장으로 열어요. 글을 모두 복사해 채팅에 붙여 주세요. 환자 정보는 들어 있지 않아요.");
        }

        // ── 단계 ─────────────────────────────────────────────────────

        private void OpenSession()
        {
            Say("1/7 비트에 붙고 있어요.");
            var t0 = owner.now();
            try
            {
                session = owner.open();
                Report.Line("session", CheckField.Number("ms", Milliseconds(Since(t0))));
            }
            catch (Exception e)
            {
                Report.Line("session", CheckField.Failed("result", e));
                Say("비트에 붙지 못했어요. 남은 단계는 건너뛰어요.");
            }
        }

        /// <summary>
        /// 단계 하나: 세션이 없으면 건너뜀, 전체 시간이 지났으면 실패(시간 초과), 단계 안에서 생각 못 한 오류는 실패(번호).
        /// alsoSkipped는 이 단계가 건너뛰면 함께 건너뛰는 줄(로그인 → 증상·이름).
        /// </summary>
        private void Step(string label, string notice, Action body, params string[] alsoSkipped)
        {
            if (session == null)
            {
                foreach (var name in new[] { label }.Concat(alsoSkipped)) Report.Line(name, CheckField.Skipped(null));
                return;
            }
            if (Over)
            {
                Report.Line(label, CheckField.TimedOut("result"));
                return;
            }
            Say(notice);
            try
            {
                body();
            }
            catch (Exception e) when (!(e is OutOfMemoryException))
            {
                Report.Line(label, CheckField.Failed("result", e));
            }
        }

        /// <summary>③ 상태 짝(AC-1401.2): 콘솔에 짝·건수·접수 시:분, 짝마다 1~6 번호. 보고서에는 짝·건수·답만.</summary>
        private void StatusPairs()
        {
            var outcome = Query(CheckSql.StatusPairs, Range(Today));
            if (!outcome.Ok)
            {
                Report.Line("statusPairs", outcome.Error!);
                return;
            }

            var pairs = new List<StatusPair>();
            foreach (var row in outcome.Rows)
            {
                var status = Text(Cell(row, 0));
                var rsu = Text(Cell(row, 1));
                var pair = pairs.FirstOrDefault(p => p.Status == status && p.Rsu == rsu);
                if (pair == null)
                {
                    pair = new StatusPair(status, rsu);
                    pairs.Add(pair);
                }
                pair.Add(Hm(Cell(row, 2)), Count(Cell(row, 3)));
            }

            Report.Line("statusPairs", CheckField.Number("pairs", pairs.Count));
            if (pairs.Count == 0)
            {
                Say("오늘 접수가 아직 없어요. 이 단계를 건너뛰어요.");
                return;
            }

            Say("상태 짝마다 비트 접수 화면에서 같은 접수 시각의 환자가 어느 칸에 있는지 보고 번호를 쳐 주세요.");
            for (var i = 0; i < pairs.Count; i++)
            {
                var pair = pairs[i];
                var code = CheckField.Status(null, pair.Status).ToString();
                var rsu = CheckField.Status(null, pair.Rsu).ToString();
                var visits = CheckField.Number(null, pair.Visits).ToString();
                Say(string.Format(CultureInfo.InvariantCulture, "[{0}/{1}] 상태 코드 {2} · 수납 표시 {3} · {4}건", i + 1, pairs.Count, code, rsu, visits));
                Say("  접수 시각 " + string.Join(", ", pair.Times()));
                var answer = Choose();
                Report.Line("statusPair", CheckField.Status("status", pair.Status), CheckField.Status("rsu", pair.Rsu),
                    CheckField.Number("visits", pair.Visits), CheckField.Number("answer", answer));
            }
        }

        /// <summary>1~6 번호 하나. 틀리면 다시 묻고, 세 번 틀리거나 입력이 끝나면 null.</summary>
        private int? Choose()
        {
            for (var tries = 0; tries < AnswerTries; tries++)
            {
                Say("  " + Choices);
                Say("  번호를 쳐 주세요 (1~6):");
                var line = Ask();
                if (line == null) return null;
                if (int.TryParse(line.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= 1 && number <= 6) return number;
                Say("  1부터 6까지 번호 하나만 쳐 주세요.");
            }
            return null;
        }

        /// <summary>④ 칸 목록(AC-1401.3): 네 표의 칸 이름·형식·길이, 내원에 붙은 표의 이름. 찾기 틀이 쓸 이름표(ProbeSchema)도 여기서 만든다.</summary>
        private void Columns()
        {
            var rows = new List<IReadOnlyList<object?>>();

            var main = Query(CheckSql.TableColumns, NoArgs());
            if (main.Ok)
            {
                Report.Line("columns", CheckField.Number("count", main.Rows.Count));
                foreach (var row in main.Rows)
                {
                    Report.Line("column", CheckField.Column("col", Cell(row, 0), Cell(row, 1)), CheckField.Name("type", Cell(row, 2)),
                        CheckField.Number("length", Cell(row, 3)));
                }
                rows.AddRange(main.Rows);
            }
            else
            {
                Report.Line("columns", main.Error!);
            }

            var linked = Query(CheckSql.LinkedColumns, NoArgs());
            if (linked.Ok)
            {
                var linkedSchema = ProbeSchema.From(linked.Rows);
                Report.Line("linkedTables", CheckField.Number("count", linkedSchema.Tables.Count));
                foreach (var table in linkedSchema.Tables)
                {
                    Report.Line("linkedTable", CheckField.Name("table", table), CheckField.Name("visitColumn", VisitColumn(linkedSchema, table)),
                        CheckField.Number("columns", linkedSchema.Columns(table).Count), CheckField.Number("text", linkedSchema.TextColumns(table).Count));
                }
                rows.AddRange(linked.Rows);
            }
            else
            {
                Report.Line("linkedTables", linked.Error!);
            }

            schema = ProbeSchema.From(rows);
        }

        /// <summary>⑤ 로그인 → 화면 83 하루 → 증상 찾기(AC-1401.4)·이름 찾기(AC-1401.5).</summary>
        private void ScreenProbes()
        {
            VendorUser? user;
            var t0 = owner.now();
            try
            {
                user = owner.login();
            }
            catch (Exception e)
            {
                Waited(t0);
                Report.Line("login", CheckField.Failed("result", e));
                SkipScreenProbes();
                return;
            }
            Waited(t0);
            if (user == null)
            {
                Report.Line("login", CheckField.Skipped(null));
                SkipScreenProbes();
                return;
            }
            Report.Line("login", CheckField.Name("result", "ok"));

            if (!ReadScreen(user, out var day, out var symptoms, out var names))
            {
                SkipScreenProbes();
                return;
            }

            var dayArgs = Range(day);
            var visitTables = schema.Tables.Where(t => VisitColumn(schema, t) != null).ToList();
            ProbeColumns("symptom", visitTables.SelectMany(t => TextColumnsBesides(t, VisitColumn(schema, t)!).Select(c => (t, c))), (table, column) =>
            {
                var outcome = Query(ProbeSql.VisitLinked(schema, table, VisitColumn(schema, table)!, column), dayArgs);
                if (!outcome.Ok) return new[] { outcome.Error! };
                var score = ProbeMatch.Score(symptoms, Pairs(outcome.Rows));
                return new[]
                {
                    CheckField.Number("compared", score.Compared), CheckField.Number("same", score.Same), CheckField.Number("pieces", score.JoinedPieces),
                    CheckField.Number("lines", score.JoinedLines), CheckField.Number("contains", score.Contains), CheckField.Number("maxRows", score.MaxRows),
                };
            });

            var nameColumns = NameTables.Where(n => schema.Has(n.Table, n.Chart)).SelectMany(n => TextColumnsBesides(n.Table, n.Chart).Select(c => (n.Table, c)));
            ProbeColumns("name", nameColumns, (table, column) =>
            {
                var chart = NameTables.First(n => n.Table == table).Chart;
                var outcome = Query(ProbeSql.ChartLinked(schema, table, chart, column), dayArgs);
                if (!outcome.Ok) return new[] { outcome.Error! };
                var score = ProbeMatch.Score(names, Pairs(outcome.Rows));
                return new[]
                {
                    CheckField.Number("compared", score.Compared), CheckField.Number("same", score.Same), CheckField.Number("contains", score.Contains),
                    CheckField.Number("maxRows", score.MaxRows),
                };
            });
        }

        private void SkipScreenProbes()
        {
            Report.Line("symptom", CheckField.Skipped(null));
            Report.Line("name", CheckField.Skipped(null));
        }

        /// <summary>
        /// 어제부터 7일 전까지 화면 83을 하루씩 읽어 줄이 있는 첫날을 고른다. 증상(내원번호 → 글, 같은 내원의 줄은 순서대로 줄바꿈으로 이음)과
        /// 이름(차트번호 → 첫 환자명)을 지역 사전으로 준다. 보고서에는 며칠 전인지·줄 수·칸 제목만.
        /// </summary>
        private bool ReadScreen(VendorUser user, out DateTime day, out Dictionary<string, string> symptoms, out Dictionary<string, string> names)
        {
            day = default;
            symptoms = new Dictionary<string, string>(StringComparer.Ordinal);
            names = new Dictionary<string, string>(StringComparer.Ordinal);
            for (var back = 1; back <= ScreenDays; back++)
            {
                if (Over)
                {
                    Report.Line("screen83", CheckField.TimedOut("result"));
                    return false;
                }
                var candidate = Today.AddDays(-back);
                IReadOnlyList<IReadOnlyList<string>> sheet;
                IReadOnlyList<IReadOnlyDictionary<string, string>> rows;
                try
                {
                    sheet = owner.readScreen83(user, candidate) ?? Array.Empty<IReadOnlyList<string>>();
                    rows = GridRows.FromSheet(StatsScreens.Symptoms, sheet);
                }
                catch (Exception e)
                {
                    Report.Line("screen83", CheckField.Failed("result", e));
                    return false;
                }

                var visitRows = new Dictionary<string, List<string>>(StringComparer.Ordinal);
                var charts = new HashSet<string>(StringComparer.Ordinal);
                foreach (var row in rows)
                {
                    var visit = Value(row, "내원번호").Trim();
                    if (visit.Length == 0) continue;
                    if (!visitRows.TryGetValue(visit, out var texts))
                    {
                        texts = new List<string>();
                        visitRows.Add(visit, texts);
                    }
                    texts.Add(Value(row, "증상"));
                    var chart = Value(row, "차트번호").Trim();
                    if (chart.Length == 0) continue;
                    charts.Add(chart);
                    var name = Value(row, "환자명");
                    if (!names.ContainsKey(chart) && ProbeMatch.Normalize(name).Length > 0) names.Add(chart, name);
                }
                if (visitRows.Count == 0) continue;

                foreach (var visit in visitRows) symptoms[visit.Key] = string.Join("\n", visit.Value);
                day = candidate;
                Report.Line("screen83", CheckField.Number("daysBack", back), CheckField.Number("rows", visitRows.Values.Sum(v => v.Count)),
                    CheckField.Number("visits", visitRows.Count), CheckField.Number("patients", charts.Count),
                    CheckField.Number("maxRows", visitRows.Values.Max(v => v.Count)));
                Report.Line("screen83Titles", CheckField.Titles("titles", HeaderOf(sheet)));
                return true;
            }
            Report.Line("screen83", CheckField.Number("rows", 0));
            return false;
        }

        /// <summary>⑥ 접수 메모(AC-1401.6): 친 글을 품은 줄 수. 친 글은 견주기 뒤 바로 버리고, 보고서·콘솔에 쓰지 않는다.</summary>
        private void Memo()
        {
            Say("비트 접수 화면에서 아무 환자나 접수 메모를 보고, 그 글을 두 글자 이상 그대로 쳐 주세요.");
            Say("친 글은 보고서에 적지 않고 견준 뒤 바로 버려요. 메모가 없으면 엔터만 누르세요.");
            Say("메모 글(엔터만 치면 건너뛰어요):");
            var typed = Ask();
            if (!ProbeMatch.IsMemoText(typed))
            {
                typed = null;
                Report.Line("memo", CheckField.Skipped(null));
                return;
            }

            var today = Range(Today);
            var found = new List<(string Table, string Column, CheckField[] Fields)>();
            var stopped = false;
            foreach (var table in schema.Tables)
            {
                var visit = VisitColumn(schema, table);
                if (visit == null) continue;
                foreach (var column in TextColumnsBesides(table, visit))
                {
                    if (Over)
                    {
                        stopped = true;
                        break;
                    }
                    var outcome = Query(ProbeSql.VisitLinked(schema, table, visit, column), today);
                    found.Add((table, column, outcome.Ok
                        ? new[]
                        {
                            CheckField.Number("rows", outcome.Rows.Count),
                            CheckField.Number("containing", ProbeMatch.CountContaining(typed, outcome.Rows.Select(r => Text(Cell(r, 1))))),
                        }
                        : new[] { outcome.Error! }));
                }
                if (stopped) break;
            }
            typed = null; // 견주기 뒤 바로 버린다(AC-1401.6)

            foreach (var line in found) Report.Line("memo", new[] { CheckField.Column("col", line.Table, line.Column) }.Concat(line.Fields).ToArray());
            if (found.Count == 0 && !stopped) Report.Line("memo", CheckField.Number("columns", 0));
            if (stopped) Report.Line("memo", CheckField.TimedOut("result"));
        }

        /// <summary>⑦ 모양(AC-1401.7): 오늘 접수 환자의 PbsInf 줄(300줄까지)과 오늘 OcmInf·OrcInf 줄, 칸마다 ColumnShape.</summary>
        private void Shapes()
        {
            var today = Range(Today);
            foreach (var table in ProbeSql.SampleTables)
            {
                var columns = SampleKeys.TryGetValue(table, out var key) && schema.Has(table, key) ? schema.Columns(table) : Array.Empty<string>();
                if (columns.Count == 0)
                {
                    Report.Line("shape", CheckField.Name("table", table), CheckField.Number("columns", 0));
                    continue;
                }
                foreach (var column in columns)
                {
                    if (Over)
                    {
                        Report.Line("shape", CheckField.TimedOut("result"));
                        return;
                    }
                    var outcome = Query(ProbeSql.Sample(schema, table, column), today);
                    var col = CheckField.Column("col", table, column);
                    if (!outcome.Ok)
                    {
                        Report.Line("shape", col, outcome.Error!);
                        continue;
                    }
                    var shape = ColumnShape.Of(outcome.Rows.Select(r => Cell(r, 0)));
                    Report.Line("shape", col, CheckField.Number("rows", shape.Rows), CheckField.Number("nonEmpty", shape.NonEmptyPercent),
                        CheckField.Number("minLength", shape.MinLength), CheckField.Number("maxLength", shape.MaxLength),
                        CheckField.Number("date8", shape.Date8Percent), CheckField.Number("date6", shape.Date6Percent),
                        CheckField.Number("digits13", shape.Digits13Percent), CheckField.Values("values", shape.Values));
                }
            }
        }

        /// <summary>
        /// ⑧ 빠르기(AC-1401.8): 등록 확인 한 번, ReceptionSql 문장마다 ms·줄 수(상세 문장은 오늘 첫 환자 한 명으로),
        /// 상태별 처방 있는 접수 수, 옛 자료 따로 있음(StatsSql.HistoryGuardSql).
        /// </summary>
        private void Speed()
        {
            var t0 = owner.now();
            try
            {
                using (owner.open())
                {
                }
                Report.Line("speed", CheckField.Name("name", "Gate"), CheckField.Number("ms", Milliseconds(Since(t0))));
            }
            catch (Exception e)
            {
                Report.Line("speed", CheckField.Name("name", "Gate"), CheckField.Failed("result", e));
            }

            var today = Range(Today);
            string? chart = null, before = null;
            foreach (var (name, sql) in TodayStatements)
            {
                if (StopSpeed()) return;
                // 이름표(RxNames)는 매개변수가 없다: 문장의 매개변수 표를 따른다
                var outcome = Query(sql, ReceptionSql.Parameters[sql].Length == 0 ? NoArgs() : today);
                Timed(name, outcome);
                if (sql == ReceptionSql.TodayVisits && outcome.Ok)
                {
                    // 상세 문장에 넣을 환자 한 명: 차트번호와 접수 시각 원값(@before). 보고서에 적지 않는다
                    var first = outcome.Rows.FirstOrDefault(r => Cell(r, 1) is string c && c.Trim().Length > 0 && Cell(r, 2) is string a && a.Length > 0);
                    chart = first == null ? null : ((string)Cell(first, 1)!).Trim();
                    before = first == null ? null : (string)Cell(first, 2)!;
                }
            }

            foreach (var (name, sql) in new[] { (nameof(ReceptionSql.HistoryCount), ReceptionSql.HistoryCount), (nameof(ReceptionSql.HistoryPage), ReceptionSql.HistoryPage) })
            {
                if (StopSpeed()) return;
                if (chart == null || before == null)
                {
                    Report.Line("speed", CheckField.Name("name", name), CheckField.Skipped(null));
                    continue;
                }
                var args = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["@chart"] = chart,
                    ["@before"] = before,
                    ["@hospital"] = session!.Hospital,
                };
                if (sql == ReceptionSql.HistoryPage)
                {
                    args["@first"] = HistoryFirst;
                    args["@last"] = HistoryLast;
                }
                Timed(name, Query(sql, args));
            }
            chart = null;
            before = null;

            if (StopSpeed()) return;
            var rx = Query(CheckSql.RxByStatus, today);
            if (!rx.Ok) Report.Line("rxByStatus", rx.Error!);
            else if (rx.Rows.Count == 0) Report.Line("rxByStatus", CheckField.Number("pairs", 0));
            foreach (var row in rx.Ok ? rx.Rows : Array.Empty<IReadOnlyList<object?>>())
            {
                Report.Line("rxByStatus", CheckField.Status("status", Cell(row, 0)), CheckField.Status("rsu", Cell(row, 1)),
                    CheckField.Number("visits", Cell(row, 2)), CheckField.Number("withRx", Cell(row, 3)));
            }

            if (StopSpeed()) return;
            var guard = Query(StatsSql.HistoryGuardSql, NoArgs());
            Report.Line("historyGuard", guard.Ok ? CheckField.Number("value", guard.Rows.Count > 0 ? Cell(guard.Rows[0], 0) : null) : guard.Error!);
        }

        private bool StopSpeed()
        {
            if (!Over) return false;
            Report.Line("speed", CheckField.TimedOut("result"));
            return true;
        }

        private void Timed(string name, Outcome outcome)
        {
            if (outcome.Ok) Report.Line("speed", CheckField.Name("name", name), CheckField.Number("ms", outcome.Milliseconds), CheckField.Number("rows", outcome.Rows.Count));
            else Report.Line("speed", CheckField.Name("name", name), outcome.Error!);
        }

        // ── 찾기 공용 ────────────────────────────────────────────────

        /// <summary>칸마다 probe를 돌려 줄 하나씩 적는다. 전체 시간이 지나면 한 줄 적고 멈춘다. 칸이 없으면 columns=0.</summary>
        private void ProbeColumns(string label, IEnumerable<(string Table, string Column)> columns, Func<string, string, CheckField[]> probe)
        {
            var count = 0;
            foreach (var (table, column) in columns)
            {
                if (Over)
                {
                    Report.Line(label, CheckField.TimedOut("result"));
                    return;
                }
                count++;
                Report.Line(label, new[] { CheckField.Column("col", table, column) }.Concat(probe(table, column)).ToArray());
            }
            if (count == 0) Report.Line(label, CheckField.Number("columns", 0));
        }

        private IEnumerable<string> TextColumnsBesides(string table, string key) =>
            schema.TextColumns(table).Where(c => !string.Equals(c, key, StringComparison.Ordinal));

        /// <summary>표의 내원번호 칸: 이름이 OcmNum으로 끝나는 첫 칸(LinkedColumns의 LIKE '%OcmNum'과 같게 대소문자 무시). 없으면 null.</summary>
        private static string? VisitColumn(ProbeSchema names, string table) =>
            names.Columns(table).FirstOrDefault(c => c.EndsWith(VisitSuffix, StringComparison.OrdinalIgnoreCase));

        private static IEnumerable<(string key, string? text)> Pairs(IReadOnlyList<IReadOnlyList<object?>> rows) =>
            rows.Select(r => (Text(Cell(r, 0)) ?? "", Text(Cell(r, 1))));

        // ── 문장·시간 ────────────────────────────────────────────────

        /// <summary>
        /// 문장 하나. 시간 제한은 30초와 남은 전체 시간 가운데 짧은 쪽(1초 이상)을 넘겨주고, 돌아온 뒤 주입한 시계로도 본다:
        /// 넘겼으면 줄을 버리고 실패(시간 초과). 던지면 실패(번호).
        /// </summary>
        private Outcome Query(string sql, IReadOnlyDictionary<string, object?> args)
        {
            if (Over) return Outcome.Failed(CheckField.TimedOut("result"));
            var left = TotalLimit - Spent;
            var timeout = left < StatementLimit ? (left < TimeSpan.FromSeconds(1) ? TimeSpan.FromSeconds(1) : left) : StatementLimit;
            var t0 = owner.now();
            IReadOnlyList<IReadOnlyList<object?>> rows;
            try
            {
                rows = session!.Query(sql, args, timeout) ?? Array.Empty<IReadOnlyList<object?>>();
            }
            catch (Exception e)
            {
                return Outcome.Failed(CheckField.Failed("result", e));
            }
            var took = Since(t0);
            if (took > timeout) return Outcome.Failed(CheckField.TimedOut("result"));
            return Outcome.Of(rows, Milliseconds(took));
        }

        private Dictionary<string, object?> Range(DateTime day) => new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = Stamp(day),
            ["@to"] = Stamp(day.AddDays(1)),
            ["@hospital"] = session!.Hospital,
        };

        private static Dictionary<string, object?> NoArgs() => new Dictionary<string, object?>(StringComparer.Ordinal);

        private TimeSpan Since(DateTime t0)
        {
            var span = owner.now() - t0;
            return span < TimeSpan.Zero ? TimeSpan.Zero : span;
        }

        /// <summary>사람이 쓴 시간(콘솔 입력·로그인 창)은 전체 시간에서 뺀다.</summary>
        private void Waited(DateTime t0) => waited += Since(t0);

        private string? Ask()
        {
            var t0 = owner.now();
            try
            {
                return owner.console.ReadLine();
            }
            finally
            {
                Waited(t0);
            }
        }

        private void Say(string line) => owner.console.Write(line);
    }

    // ── 값 다루기(값을 보고서에 싣지 않는다) ───────────────────────────

    private sealed class StatusPair
    {
        private readonly List<(string Hm, long? Visits)> times = new List<(string Hm, long? Visits)>();
        private bool unknownCount;
        private long visits;

        public StatusPair(string? status, string? rsu)
        {
            Status = status;
            Rsu = rsu;
        }

        public string? Status { get; }

        public string? Rsu { get; }

        /// <summary>건수 합. 하나라도 숫자가 아니면 null.</summary>
        public long? Visits => unknownCount ? (long?)null : visits;

        public void Add(string hm, long? count)
        {
            times.Add((hm, count));
            if (count.HasValue) visits += count.Value;
            else unknownCount = true;
        }

        /// <summary>콘솔에 보일 접수 시각: "09:05", 같은 분에 여럿이면 "09:05(2)".</summary>
        public IEnumerable<string> Times() =>
            times.Select(t => t.Visits.HasValue && t.Visits.Value > 1 ? t.Hm + "(" + t.Visits.Value.ToString(CultureInfo.InvariantCulture) + ")" : t.Hm);
    }

    private sealed class Outcome
    {
        private Outcome(IReadOnlyList<IReadOnlyList<object?>> rows, long milliseconds, CheckField? error)
        {
            Rows = rows;
            Milliseconds = milliseconds;
            Error = error;
        }

        public bool Ok => Error == null;

        public IReadOnlyList<IReadOnlyList<object?>> Rows { get; }

        public long Milliseconds { get; }

        public CheckField? Error { get; }

        public static Outcome Of(IReadOnlyList<IReadOnlyList<object?>> rows, long milliseconds) => new Outcome(rows, milliseconds, null);

        public static Outcome Failed(CheckField error) => new Outcome(Array.Empty<IReadOnlyList<object?>>(), 0, error);
    }

    private static string Stamp(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";

    private static long Milliseconds(TimeSpan span) => (long)span.TotalMilliseconds;

    private static object? Cell(IReadOnlyList<object?> row, int index) => row != null && index < row.Count ? row[index] : null;

    /// <summary>칸 값 → 글자(견주기용). null·DBNull은 null, 숫자는 고정 문화의 글.</summary>
    private static string? Text(object? value)
    {
        switch (value)
        {
            case null:
            case DBNull _:
                return null;
            case string text:
                return text;
            case IFormattable formattable:
                return formattable.ToString(null, CultureInfo.InvariantCulture);
            default:
                return value.ToString();
        }
    }

    /// <summary>건수 칸: 정수 형만. 숫자처럼 생긴 글자는 건수가 아니다(null).</summary>
    private static long? Count(object? value)
    {
        switch (value)
        {
            case long number: return number;
            case int number: return number;
            case short number: return number;
            case byte number: return number;
            case decimal number when decimal.Truncate(number) == number && number >= long.MinValue && number <= long.MaxValue: return (long)number;
            default: return null;
        }
    }

    /// <summary>접수 시:분 칸(HHmm 네 글자) → "HH:MM". 모양이 다르면 ?(콘솔에만 쓴다).</summary>
    private static string Hm(object? value)
    {
        if (!(value is string text) || text.Length != 4) return CheckField.Unknown;
        foreach (var ch in text)
        {
            if (ch < '0' || ch > '9') return CheckField.Unknown;
        }
        var hour = (text[0] - '0') * 10 + (text[1] - '0');
        var minute = (text[2] - '0') * 10 + (text[3] - '0');
        return hour <= 23 && minute <= 59 ? text.Substring(0, 2) + ":" + text.Substring(2, 2) : CheckField.Unknown;
    }

    private static string Value(IReadOnlyDictionary<string, string> row, string column) =>
        row != null && row.TryGetValue(column, out var value) && value != null ? value : "";

    /// <summary>화면 83 머리 줄: 앞 12줄 가운데 '증상' 칸과 '차트번호'를 품은 칸이 있는 첫 줄(GridRows 83이 찾는 줄과 같은 조건). 없으면 빈 줄.</summary>
    private static IEnumerable<object?> HeaderOf(IReadOnlyList<IReadOnlyList<string>> sheet)
    {
        foreach (var row in sheet.Take(12))
        {
            if (row != null && row.Any(cell => cell != null && cell.Trim() == "증상") && row.Any(cell => cell != null && cell.Contains("차트번호"))) return row.Cast<object?>().ToList();
        }
        return new List<object?>();
    }
}
