using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Precheck.Core.Stats;
using Xunit;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 확인 차례(CheckRunner, TASK-5) 시험의 가짜들: 시계·콘솔·DB 세션·화면 83·센티널. 가짜 자료만 쓴다
/// (이름 가상환자NN, 차트번호 9로 시작하는 6자리, 내원번호 V+숫자). 칸 이름(SymInf·OcmMemo 등)은 시험용으로 지은 것이다.
/// </summary>
internal static class CheckFakes
{
    internal static readonly DateTime Today = new DateTime(2026, 11, 5);

    /// <summary>등록 병원 범위(가짜).</summary>
    internal const string Hospital = "9001";

    /// <summary>4/10 로그인 단계의 묻는 글(AC-1401.14): 1이면 띄우고, 엔터·그 밖·입력 끝이면 건너뛴다.</summary>
    internal const string LoginQuestion = "비트 로그인 창을 띄울까요? 1 = 띄우기, 엔터 = 건너뛰기";

    internal static string Stamp(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";

    /// <summary>센티널: 환자 자료처럼 생긴 가짜 값. 보고서·콘솔 기록 어디에도 나오면 안 된다(AC-1401.10).</summary>
    internal static class Sentinels
    {
        public const string KoreanName = "가상환자07";
        public const string ChartNumber = "900007";
        public const string EnglishName = "GASANG HWANJA";
        public const string Phone = "010-9000-0007";

        public static readonly string[] All = { KoreanName, ChartNumber, EnglishName, Phone };

        public static void Absent(string text)
        {
            foreach (var sentinel in All) Assert.DoesNotContain(sentinel, text, StringComparison.Ordinal);
            Assert.DoesNotContain(ChartNumber, text.Replace("-", ""), StringComparison.Ordinal);
            Assert.DoesNotContain("가상", text, StringComparison.Ordinal);
            Assert.DoesNotContain("GASANG", text, StringComparison.Ordinal);
        }
    }

    /// <summary>SqlException 대신: DbException이고 Number(int)가 있다. 글(Message)에는 센티널을 싣는다.</summary>
    internal sealed class SqlException : DbException
    {
        public SqlException(int number) : base("Login failed " + Sentinels.KoreanName + " " + Sentinels.Phone)
        {
            Number = number;
        }

        public int Number { get; }
    }

    internal sealed class FakeClock
    {
        public FakeClock(DateTime start)
        {
            Now = start;
        }

        public DateTime Now { get; private set; }

        public DateTime Read() => Now;

        public void Advance(TimeSpan span) => Now += span;
    }

    /// <summary>콘솔: 쓴 줄을 모두 남기고(콘솔 기록), 읽을 때는 마지막으로 쓴 줄을 보고 답을 고른다. 사람이 생각하는 시간만큼 시계를 민다.</summary>
    internal sealed class FakeConsole : ICheckConsole
    {
        private readonly FakeClock clock;

        public FakeConsole(FakeClock clock)
        {
            this.clock = clock;
        }

        /// <summary>마지막으로 쓴 줄 → 친 글(null이면 입력 끝). 기본은 로그인 묻기(AC-1401.14)에만 1(띄우기), 그 밖은 엔터만.</summary>
        public Func<string, string?> Answer { get; set; } = last => last == LoginQuestion ? "1" : "";

        /// <summary>한 번 읽을 때 사람이 쓰는 시간.</summary>
        public TimeSpan Think { get; set; } = TimeSpan.FromSeconds(3);

        public List<string> Written { get; } = new List<string>();

        public int Reads { get; private set; }

        public string Text => string.Join("\n", Written);

        public void Write(string line) => Written.Add(line ?? "");

        public string? ReadLine()
        {
            Reads++;
            clock.Advance(Think);
            return Answer(Written.Count == 0 ? "" : Written[Written.Count - 1]);
        }
    }

    /// <summary>문장 한 번.</summary>
    internal sealed class Call
    {
        public Call(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout, DateTime at)
        {
            Sql = sql;
            var copy = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var pair in args)
            {
                copy[pair.Key] = pair.Value;
            }

            Args = copy;
            Timeout = timeout;
            At = at;
        }

        public string Sql { get; }

        public IReadOnlyDictionary<string, object?> Args { get; }

        public TimeSpan Timeout { get; }

        public DateTime At { get; }

        public string? From => Args.TryGetValue("@from", out var value) ? value as string : null;
    }

    /// <summary>
    /// 가짜 비트 DB. 세션을 열 때마다 OpenTook만큼, 문장마다 Took(sql)만큼 시계를 민다. 답은 (문장, @from) → (문장) → 빈 줄 차례로 찾는다.
    /// 확인 모드 세션처럼 CheckSql·ProbeSql(틀·증상 글 세기·기록지 코드)·Sql 허용 목록과 매개변수 표(이름·int·글자 길이)를 보고, 어긋나면 InvalidOperationException.
    /// </summary>
    internal sealed class FakeDb
    {
        private readonly Dictionary<string, IReadOnlyList<IReadOnlyList<object?>>> answers = new Dictionary<string, IReadOnlyList<IReadOnlyList<object?>>>(StringComparer.Ordinal);

        public FakeDb(FakeClock clock)
        {
            Clock = clock;
        }

        public FakeClock Clock { get; }

        public TimeSpan OpenTook { get; set; } = TimeSpan.FromMilliseconds(40);

        public Func<Exception?> OpenError { get; set; } = () => null;

        public Func<string, TimeSpan> Took { get; set; } = _ => TimeSpan.FromMilliseconds(10);

        /// <summary>답 표에 없을 때 쓰는 답(센티널 DB). 없으면 빈 줄.</summary>
        public Func<string, IReadOnlyDictionary<string, object?>, IReadOnlyList<IReadOnlyList<object?>>>? Fallback { get; set; }

        /// <summary>문장마다(답을 주기 전에) 부른다. 던지면 그 문장이 실패한다.</summary>
        public Action<Call>? OnQuery { get; set; }

        public List<Call> Calls { get; } = new List<Call>();

        public int Opened { get; private set; }

        public int Disposed { get; set; }

        public void Answer(string sql, params object?[][] rows) => answers[sql] = rows;

        /// <summary>정해 둔 답을 모두 지운다(Fallback만 남는다).</summary>
        public void Clear() => answers.Clear();

        public void Answer(string sql, DateTime day, params object?[][] rows) => answers[Stamp(day) + "\u0001" + sql] = rows;

        public FakeSession Open()
        {
            Opened++;
            Clock.Advance(OpenTook);
            var error = OpenError();
            if (error != null) throw error;
            return new FakeSession(this);
        }

        internal IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
        {
            Require(sql, args);
            var call = new Call(sql, args, timeout, Clock.Now);
            Calls.Add(call);
            OnQuery?.Invoke(call);
            Clock.Advance(Took(sql));
            if (call.From != null && answers.TryGetValue(call.From + "\u0001" + sql, out var byDay)) return byDay;
            if (answers.TryGetValue(sql, out var rows)) return rows;
            return Fallback != null ? Fallback(sql, args) : new List<IReadOnlyList<object?>>();
        }

        private static void Require(string sql, IReadOnlyDictionary<string, object?> args)
        {
            IReadOnlyList<SqlParam> declared;
            if (CheckSql.IsAllowed(sql)) declared = CheckSql.ParametersOf(sql);
            else if (ProbeSql.IsProbe(sql)) declared = ProbeSql.Parameters;
            else if (ProbeSql.IsTextCount(sql)) declared = ProbeSql.TextCountParameters;
            else if (ProbeSql.IsSheetHits(sql)) declared = ProbeSql.TextCountParameters;
            else if (ProbeSql.IsSheetCodes(sql)) declared = ProbeSql.Parameters;
            else if (Sql.IsAllowed(sql)) declared = Sql.ParametersOf(sql);
            else throw new InvalidOperationException();
            if (args == null || args.Count != declared.Count) throw new InvalidOperationException();
            foreach (var parameter in declared)
            {
                if (!args.TryGetValue(parameter.Name, out var value)) throw new InvalidOperationException();
                var fits = parameter.Kind == SqlParamKind.Int ? value is int : value is string text && text.Length <= parameter.Size;
                if (!fits) throw new InvalidOperationException();
            }
        }
    }

    /// <summary>확인 모드 세션(가짜). 닫은 횟수를 FakeDb에 센다.</summary>
    internal sealed class FakeSession : ICheckSession
    {
        private readonly FakeDb db;

        public FakeSession(FakeDb db)
        {
            this.db = db;
        }

        public string Hospital => CheckFakes.Hospital;

        public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout) => db.Query(sql, args, timeout);

        public void Dispose() => db.Disposed++;
    }

    /// <summary>화면 83 머리 줄(GridRows 83이 찾는 칸).</summary>
    internal static readonly string[] Header83 = { "내원번호", "차트번호", "환자명", "증상", "기록날짜" };

    /// <summary>가짜 화면 83: 날짜마다 표(머리 줄 + 자료 줄). 없는 날은 빈 표.</summary>
    internal sealed class FakeScreen
    {
        private readonly FakeClock clock;
        private readonly Dictionary<DateTime, IReadOnlyList<IReadOnlyList<string>>> days = new Dictionary<DateTime, IReadOnlyList<IReadOnlyList<string>>>();

        public FakeScreen(FakeClock clock)
        {
            this.clock = clock;
        }

        public TimeSpan Took { get; set; } = TimeSpan.FromSeconds(2);

        public List<DateTime> Asked { get; } = new List<DateTime>();

        public List<VendorUser> Users { get; } = new List<VendorUser>();

        public void Day(DateTime day, params string[][] rows) =>
            days[day.Date] = new IReadOnlyList<string>[] { Header83 }.Concat(rows).ToList();

        public IReadOnlyList<IReadOnlyList<string>> Read(VendorUser user, DateTime day)
        {
            Users.Add(user);
            Asked.Add(day);
            clock.Advance(Took);
            return days.TryGetValue(day.Date, out var sheet) ? sheet : new List<IReadOnlyList<string>>();
        }
    }

    internal static object?[] Col(string table, string column, string type, int? length) => new object?[] { table, column, type, length };

    /// <summary>CheckSql.TableColumns의 가짜 답(네 표).</summary>
    internal static readonly object?[][] MainColumns =
    {
        Col("OcmInf", "OcmNum", "varchar", 12),
        Col("OcmInf", "OcmChtNum", "varchar", 14),
        Col("OcmInf", "OcmAcpDtm", "char", 14),
        Col("OcmInf", "OcmMemo", "varchar", 200),
        Col("OrcInf", "OrcOcmNum", "varchar", 12),
        Col("OrcInf", "OrcAccDte", "char", 8),
        Col("OdrInf", "OdrOcmNum", "varchar", 12),
        Col("OdrInf", "OdrCod", "varchar", 10),
        Col("PbsInf", "PbsChtNum", "varchar", 14),
        Col("PbsInf", "PbsPatNam", "varchar", 20),
        Col("PbsInf", "PbsBirDte", "char", 8),
    };

    /// <summary>CheckSql.LinkedColumns의 가짜 답: OcmNum으로 끝나는 칸이 있는 표(OcmInf·OrcInf·OdrInf + 시험용 SymInf).</summary>
    internal static readonly object?[][] LinkedColumns = MainColumns
        .Where(row => (string)row[0]! != "PbsInf")
        .Concat(new[]
        {
            Col("SymInf", "SymOcmNum", "varchar", 12),
            Col("SymInf", "SymTxt", "varchar", 500),
            Col("SymInf", "SymSeq", "int", null),
        })
        .ToArray();

    /// <summary>찾기 틀을 만들 때 쓰는 이름표(같은 실행의 INFORMATION_SCHEMA 답과 같다).</summary>
    internal static ProbeSchema Schema => ProbeSchema.From(MainColumns.Concat(LinkedColumns));

    /// <summary>시험 하나의 판: 시계·DB·콘솔·화면 83·로그인과 임시 폴더의 보고서.</summary>
    internal sealed class Harness : IDisposable
    {
        public Harness()
        {
            Clock = new FakeClock(Today.AddHours(10).AddMinutes(3));
            Db = new FakeDb(Clock);
            Console = new FakeConsole(Clock);
            Screen = new FakeScreen(Clock);
            Folder = Path.Combine(Path.GetTempPath(), "precheck-reception-run-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path.Combine(Folder, "app"));
            Directory.CreateDirectory(Path.Combine(Folder, "temp"));
            Db.Answer(CheckSql.TableColumns, MainColumns);
            Db.Answer(CheckSql.LinkedColumns, LinkedColumns);
            Db.Answer(StatsSql.HistoryGuardSql, new object?[] { 0 });
        }

        public FakeClock Clock { get; }

        public FakeDb Db { get; }

        public FakeConsole Console { get; }

        public FakeScreen Screen { get; }

        public string Folder { get; }

        /// <summary>로그인 창(취소하면 null). 사람이 쓰는 시간만큼 시계를 민다.</summary>
        public Func<VendorUser?> Login { get; set; } = () => new VendorUser("U01", "20261105");

        public int Logins { get; private set; }

        public string ReportPath { get; private set; } = "";

        /// <summary>끝까지 돌리고 디스크의 보고서 글(BOM 뺌)을 준다.</summary>
        public string Run()
        {
            using (var report = CheckReport.Create(Path.Combine(Folder, "app"), Path.Combine(Folder, "temp"), Clock.Now))
            {
                ReportPath = report.FilePath;
                var runner = NewRunner(Console, Db.Open, () =>
                {
                    Logins++;
                    Clock.Advance(TimeSpan.FromSeconds(20));
                    return Login();
                }, Screen.Read, report, Clock.Read);
                runner.Run();
            }
            return ReadReport();
        }

        /// <summary>돌아가는 동안에도 읽을 수 있게(보고서가 쓰기 중) 공유로 연다.</summary>
        public string ReadReport()
        {
            using var input = new FileStream(ReportPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(input, new UTF8Encoding(false), true);
            return reader.ReadToEnd();
        }

        public static string[] Lines(string report) => report.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);

        public void Dispose()
        {
            try
            {
                Directory.Delete(Folder, true);
            }
            catch (IOException)
            {
            }
        }
    }

    internal static CheckRunner NewRunner(ICheckConsole console, Func<ICheckSession> open, Func<VendorUser?> login,
        Func<VendorUser, DateTime, IReadOnlyList<IReadOnlyList<string>>> readScreen83, CheckReport report, Func<DateTime> now) =>
        new CheckRunner(console, open, login, readScreen83, report, now);
}
