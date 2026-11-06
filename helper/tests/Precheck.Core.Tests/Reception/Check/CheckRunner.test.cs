using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Check;
using Precheck.Core.Stats;
using Xunit;
using static Precheck.Core.Tests.Reception.Check.CheckFakes;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>상태 짝 단계(AC-1401.2): 콘솔에 짝·건수·접수 시각, 사람이 고른 번호. 보고서에는 짝·건수·답만.</summary>
public class CheckRunnerStatusTests
{
    private const string Choices = "1 진료대기 2 진료보류 3 수납대기 4 끝남 5 접수 취소 6 모름";

    private static Harness WithPairs()
    {
        var h = new Harness();
        h.Db.Answer(CheckSql.StatusPairs,
            new object?[] { "HN", "N", "0905", 2L },
            new object?[] { "HN", "N", "0912", 1L },
            new object?[] { "HN", "O", "1001", 1L },
            new object?[] { "WT", "N", "0930", 1L });
        return h;
    }

    [Fact(DisplayName = "AC-1401.2 짝마다 건수와 접수 시각을 콘솔에 보이고 1~6 번호를 받는다, 보고서에는 짝·건수·답만(시각 없음)")]
    public void PairsAnswersAndCounts()
    {
        using var h = WithPairs();
        var answers = new Queue<string>(new[] { "1", "5", "3" });
        h.Console.Answer = last => last.Contains("번호를 쳐") ? answers.Dequeue() : "";

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Contains("statusPairs pairs=3", lines);
        Assert.Contains("statusPair status=HN rsu=N visits=3 answer=1", lines);
        Assert.Contains("statusPair status=HN rsu=O visits=1 answer=5", lines);
        Assert.Contains("statusPair status=WT rsu=N visits=1 answer=3", lines);
        Assert.Empty(answers);

        var console = h.Console.Text;
        Assert.Contains(Choices, console);
        Assert.Contains("09:05", console);
        Assert.Contains("09:12", console);
        Assert.Contains("10:01", console);
        Assert.Contains("HN", console);

        foreach (var time in new[] { "09:05", "0905", "09:12", "0912", "10:01", "1001", "09:30", "0930" }) Assert.DoesNotContain(time, report);
        Assert.DoesNotContain("실패(", report);
    }

    [Fact(DisplayName = "AC-1401.2 틀린 번호는 다시 묻고, 세 번 틀리거나 입력이 끝나면 답은 ?로 적는다")]
    public void WrongAnswersAskAgain()
    {
        using var h = WithPairs();
        var answers = new Queue<string?>(new string?[] { "x", "7", "2", "0", "", "  9 ", null });
        h.Console.Answer = last => last.Contains("번호를 쳐") ? (answers.Count > 0 ? answers.Dequeue() : null) : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains("statusPair status=HN rsu=N visits=3 answer=2", lines);
        Assert.Contains("statusPair status=HN rsu=O visits=1 answer=?", lines);
        Assert.Contains("statusPair status=WT rsu=N visits=1 answer=?", lines);
        Assert.Contains(h.Console.Written, line => line.Contains("1부터 6까지"));
    }

    [Fact(DisplayName = "AC-1401.2 상태 짝 문장은 오늘(@from~@to)과 등록 병원 범위로 돈다, 접수가 없으면 pairs=0이고 묻지 않는다")]
    public void TodayRangeAndNoPairs()
    {
        using var h = new Harness();
        h.Console.Answer = last => last.Contains("번호를 쳐") ? throw new InvalidOperationException("묻지 않아야 한다") : "";

        var lines = Harness.Lines(h.Run());

        var call = Assert.Single(h.Db.Calls, c => c.Sql == CheckSql.StatusPairs);
        Assert.Equal(Stamp(Today), call.Args["@from"]);
        Assert.Equal(Stamp(Today.AddDays(1)), call.Args["@to"]);
        Assert.Equal(Hospital, call.Args["@hospital"]);
        Assert.Contains("statusPairs pairs=0", lines);
    }
}

/// <summary>화면 83 단계(AC-1401.4 증상 찾기·AC-1401.5 이름 찾기): 최근 진료일 하루, 내원에 붙은 표의 글자 칸마다 견준 수.</summary>
public class CheckRunnerScreenTests
{
    private static readonly DateTime ScreenDay = Today.AddDays(-3);

    private static Harness WithScreen()
    {
        var h = new Harness();
        h.Screen.Day(ScreenDay,
            new[] { "V1001", "900001", "가상환자01", "허리 통증 3일", "20261102" },
            new[] { "V1002", "900002", "가상환자02", "무릎 부음", "20261102" });
        var schema = Schema;
        h.Db.Answer(ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", "SymTxt"), ScreenDay,
            new object?[] { "V1001", "허리 통증 3일" },
            new object?[] { "V1002", "무릎 부음 있음" });
        h.Db.Answer(ProbeSql.ChartLinked(schema, "PbsInf", "PbsChtNum", "PbsPatNam"), ScreenDay,
            new object?[] { "900001", "가상환자01" },
            new object?[] { "900002", "가상환자02 " });
        h.Db.Answer(ProbeSql.ChartLinked(schema, "OcmInf", "OcmChtNum", "OcmMemo"), ScreenDay,
            new object?[] { "900001", "가상환자01 보호자" });
        return h;
    }

    [Fact(DisplayName = "AC-1401.4 어제부터 7일 전까지 줄이 있는 첫날을 읽고, 내원에 붙은 표의 글자 칸마다 같은 내원번호의 증상 글과 견준 수를 적는다")]
    public void SymptomProbe()
    {
        using var h = WithScreen();

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Equal(new[] { Today.AddDays(-1), Today.AddDays(-2), Today.AddDays(-3) }, h.Screen.Asked.Select(d => d.Date));
        Assert.Contains("login result=ok", lines);
        Assert.Contains("screen83 daysBack=3 rows=2 visits=2 patients=2 maxRows=1", lines);
        Assert.Contains("screen83Titles titles=내원번호,차트번호,환자명,증상,기록날짜", lines);
        Assert.Contains("symptom col=SymInf.SymTxt compared=2 same=1 pieces=0 lines=0 contains=1 maxRows=1", lines);
        // 글자 칸은 모두 적는다(줄이 없는 칸은 compared=0), 숫자 칸(SymSeq)·내원번호 칸 자신은 견주지 않는다
        Assert.Contains("symptom col=OcmInf.OcmMemo compared=0 same=0 pieces=0 lines=0 contains=0 maxRows=0", lines);
        Assert.Contains("symptom col=OdrInf.OdrCod compared=0 same=0 pieces=0 lines=0 contains=0 maxRows=0", lines);
        Assert.DoesNotContain(lines, line => line.Contains("SymSeq") && line.StartsWith("symptom", StringComparison.Ordinal));
        Assert.DoesNotContain(lines, line => line.StartsWith("symptom col=SymInf.SymOcmNum", StringComparison.Ordinal));

        var probes = h.Db.Calls.Where(c => ProbeSql.IsProbe(c.Sql) && c.Sql.Contains("t.[SymOcmNum]")).ToList();
        Assert.NotEmpty(probes);
        Assert.All(probes, c => Assert.Equal(Stamp(ScreenDay), c.From));
        Assert.All(probes, c => Assert.Equal(Stamp(ScreenDay.AddDays(1)), c.Args["@to"]));

        foreach (var text in new[] { "허리", "무릎", "V1001", "900001", "가상환자" }) Assert.DoesNotContain(text, report);
        Assert.DoesNotContain("실패(", report);
    }

    [Fact(DisplayName = "AC-1401.5 같은 화면 83 줄로 PbsInf·OcmInf의 글자 칸마다 같은 차트번호의 환자명과 똑같은 수를 적는다")]
    public void NameProbe()
    {
        using var h = WithScreen();

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Contains("name col=PbsInf.PbsPatNam compared=2 same=2 contains=0 maxRows=1", lines);
        Assert.Contains("name col=PbsInf.PbsBirDte compared=0 same=0 contains=0 maxRows=0", lines);
        Assert.Contains("name col=OcmInf.OcmMemo compared=1 same=0 contains=1 maxRows=1", lines);
        Assert.Contains("name col=OcmInf.OcmNum compared=0 same=0 contains=0 maxRows=0", lines);
        Assert.DoesNotContain(lines, line => line.StartsWith("name col=PbsInf.PbsChtNum", StringComparison.Ordinal));
        Assert.DoesNotContain(lines, line => line.StartsWith("name col=OrcInf", StringComparison.Ordinal));

        var names = h.Db.Calls.Where(c => ProbeSql.IsProbe(c.Sql) && c.Sql.Contains("t.[PbsChtNum],")).ToList();
        Assert.NotEmpty(names);
        Assert.All(names, c => Assert.Equal(Stamp(ScreenDay), c.From));
        foreach (var text in new[] { "가상환자", "900001", "보호자" }) Assert.DoesNotContain(text, report);
    }

    [Fact(DisplayName = "AC-1401.4 로그인을 취소하면 증상 찾기·이름 찾기는 건너뜀이고 화면 83을 읽지 않으며, 다음 단계는 그대로 돈다")]
    public void LoginCancelled()
    {
        using var h = WithScreen();
        h.Login = () => null;

        var lines = Harness.Lines(h.Run());

        Assert.Equal(1, h.Logins);
        Assert.Empty(h.Screen.Asked);
        Assert.Contains("login 건너뜀", lines);
        Assert.Contains("symptom 건너뜀", lines);
        Assert.Contains("name 건너뜀", lines);
        Assert.Contains(lines, line => line.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("done ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.4 7일 동안 줄이 없으면 rows=0이고 증상·이름 찾기는 건너뜀, 7일 전보다 앞은 읽지 않는다")]
    public void NoScreenRows()
    {
        using var h = new Harness();

        var lines = Harness.Lines(h.Run());

        Assert.Equal(Enumerable.Range(1, 7).Select(d => Today.AddDays(-d)), h.Screen.Asked.Select(d => d.Date));
        Assert.Contains("screen83 rows=0", lines);
        Assert.Contains("symptom 건너뜀", lines);
        Assert.Contains("name 건너뜀", lines);
    }

    [Fact(DisplayName = "AC-1401.4 화면 83을 못 읽으면(머리 줄 없음·오류) 실패(번호)로 적고 다음 단계로 간다")]
    public void ScreenFails()
    {
        using var h = new Harness();

        // 머리 줄이 없는 표: GridRows가 E-BIT-EXPORT-FAILED
        var sheet = new List<IReadOnlyList<string>> { new[] { "제목", Sentinels.KoreanName }, new[] { "V1", Sentinels.ChartNumber } };
        var lines = RunWithScreen(h, (user, day) => sheet);

        Assert.Contains("screen83 result=실패(E-BIT-EXPORT-FAILED)", lines);
        Assert.Contains("symptom 건너뜀", lines);
        Assert.Contains(lines, line => line.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
    }

    private static string[] RunWithScreen(Harness h, Func<VendorUser, DateTime, IReadOnlyList<IReadOnlyList<string>>> screen)
    {
        // 보고서는 쓰기 손잡이를 FileShare.Read로 잡고 있어 윈도우에서는 닫기 전에 File.ReadAllText로 열 수 없다. 닫은 뒤 읽는다
        string file;
        using (var report = CheckReport.Create(Path.Combine(h.Folder, "app"), Path.Combine(h.Folder, "temp"), h.Clock.Now))
        {
            NewRunner(h.Console, h.Db.Open, () => new VendorUser("U01", "20261105"), screen, report, h.Clock.Read).Run();
            file = report.FilePath;
        }
        return Harness.Lines(File.ReadAllText(file));
    }
}

/// <summary>접수 메모 단계(AC-1401.6): 친 글로 오늘 접수에 붙은 글자 칸마다 품은 줄 수. 친 글은 어디에도 남지 않는다.</summary>
public class CheckRunnerMemoTests
{
    private const string Typed = "어깨 주사 메모";

    private static Harness WithMemo()
    {
        var h = new Harness();
        h.Login = () => null;
        var schema = Schema;
        h.Db.Answer(ProbeSql.VisitLinked(schema, "OcmInf", "OcmNum", "OcmMemo"), Today,
            new object?[] { "V2001", "어깨  주사\r\n메모 확인" },
            new object?[] { "V2002", "없음" });
        h.Db.Answer(ProbeSql.VisitLinked(schema, "SymInf", "SymOcmNum", "SymTxt"), Today,
            new object?[] { "V2001", "어깨 주사 메모" },
            new object?[] { "V2001", "어깨 주사 메모" },
            new object?[] { "V2002", null });
        return h;
    }

    [Fact(DisplayName = "AC-1401.6 친 메모 글(두 글자 이상)을 품은 줄 수를 오늘 접수에 붙은 글자 칸마다 적고, 친 글은 보고서·콘솔 기록·DB 매개변수에 없다")]
    public void CountsContainingRows()
    {
        using var h = WithMemo();
        h.Console.Answer = last => last.Contains("메모 글") ? Typed : "";

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Contains("memo col=OcmInf.OcmMemo rows=2 containing=1", lines);
        Assert.Contains("memo col=SymInf.SymTxt rows=3 containing=2", lines);
        Assert.Contains("memo col=OdrInf.OdrCod rows=0 containing=0", lines);

        var memoProbes = h.Db.Calls.Where(c => ProbeSql.IsProbe(c.Sql) && c.From == Stamp(Today) && !c.Sql.StartsWith("SELECT TOP 300", StringComparison.Ordinal)).ToList();
        Assert.NotEmpty(memoProbes);
        foreach (var call in h.Db.Calls)
        {
            Assert.DoesNotContain(call.Args.Values, value => value is string text && text.Contains("어깨"));
            Assert.DoesNotContain("어깨", call.Sql);
        }
        Assert.DoesNotContain("어깨", report);
        Assert.DoesNotContain("어깨", h.Console.Text);
        Assert.DoesNotContain("주사", h.Console.Text);
    }

    [Theory(DisplayName = "AC-1401.6 엔터만·한 글자·입력 끝이면 건너뜀이고 메모 찾기 문장을 돌리지 않는다")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("a")]
    [InlineData(null)]
    public void SkipsShortInput(string? typed)
    {
        using var h = WithMemo();
        h.Console.Answer = last => last.Contains("메모 글") ? typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains("memo 건너뜀", lines);
        Assert.DoesNotContain(lines, line => line.StartsWith("memo col=", StringComparison.Ordinal));
        Assert.DoesNotContain(h.Db.Calls, c => ProbeSql.IsProbe(c.Sql) && c.From == Stamp(Today) && !c.Sql.StartsWith("SELECT TOP 300", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.6 친 글은 견주기 뒤 바로 버린다: 확인이 끝난 뒤 확인 차례가 그 글을 들고 있지 않다")]
    public void TypedTextNotKept()
    {
        using var h = WithMemo();
        h.Console.Answer = last => last.Contains("메모 글") ? Typed : "";
        CheckRunner runner;
        using (var report = CheckReport.Create(Path.Combine(h.Folder, "app"), Path.Combine(h.Folder, "temp"), h.Clock.Now))
        {
            runner = NewRunner(h.Console, h.Db.Open, () => null, h.Screen.Read, report, h.Clock.Read);
            runner.Run();
        }

        foreach (var field in typeof(CheckRunner).GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public))
        {
            var value = field.GetValue(runner);
            if (value is string text) Assert.DoesNotContain("어깨", text);
            Assert.False(value is IEnumerable<string> texts && texts.Any(t => t != null && t.Contains("어깨")), field.Name);
        }
    }
}

/// <summary>빠르기 단계(AC-1401.8): 이 명세의 비트 문장마다 걸린 ms·줄 수, 상태별 처방 있는 접수 수, 옛 자료 따로 있음.</summary>
public class CheckRunnerSpeedTests
{
    private static readonly string[] Names = { "TodayVisits", "TodayRx", "PriorVisits", "PriorRx", "RxNames", "HistoryCount", "HistoryPage" };

    private static Harness WithToday()
    {
        var h = new Harness();
        h.Login = () => null;
        h.Db.Answer(ReceptionSql.TodayVisits,
            new object?[] { "V3001", "900031", "20261105090512", "HN", "N" },
            new object?[] { "V3002", "900032", "20261105091003", "WT", "N" });
        h.Db.Answer(ReceptionSql.TodayRx, new object?[] { "V3001", "ESWT7" });
        h.Db.Answer(ReceptionSql.RxNames, new object?[] { "ESWT7", "체외충격파", "20260101" }, new object?[] { "MT1", "도수치료", "20260101" });
        h.Db.Answer(ReceptionSql.HistoryCount, new object?[] { 4L, "20250312" });
        h.Db.Answer(CheckSql.RxByStatus, new object?[] { "HN", "N", 3L, 2L }, new object?[] { "WT", "N", 1L, 0L });
        h.Db.Answer(StatsSql.HistoryGuardSql, new object?[] { 1 });
        var took = new Dictionary<string, int>
        {
            [ReceptionSql.TodayVisits] = 120, [ReceptionSql.TodayRx] = 80, [ReceptionSql.PriorVisits] = 900, [ReceptionSql.PriorRx] = 300,
            [ReceptionSql.RxNames] = 50, [ReceptionSql.HistoryCount] = 30, [ReceptionSql.HistoryPage] = 45,
        };
        h.Db.Took = sql => TimeSpan.FromMilliseconds(took.TryGetValue(sql, out var ms) ? ms : 10);
        return h;
    }

    [Fact(DisplayName = "AC-1401.8 ReceptionSql 문장마다 걸린 ms·줄 수와 등록 확인 한 번, 상태별 처방 있는 접수 수, 옛 자료 따로 있음(0·1)을 적는다")]
    public void SpeedLines()
    {
        using var h = WithToday();

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Contains("speed name=Gate ms=40", lines);
        Assert.Contains("speed name=TodayVisits ms=120 rows=2", lines);
        Assert.Contains("speed name=TodayRx ms=80 rows=1", lines);
        Assert.Contains("speed name=PriorVisits ms=900 rows=0", lines);
        Assert.Contains("speed name=PriorRx ms=300 rows=0", lines);
        Assert.Contains("speed name=RxNames ms=50 rows=2", lines);
        Assert.Contains("speed name=HistoryCount ms=30 rows=1", lines);
        Assert.Contains("speed name=HistoryPage ms=45 rows=0", lines);
        Assert.Contains("rxByStatus status=HN rsu=N visits=3 withRx=2", lines);
        Assert.Contains("rxByStatus status=WT rsu=N visits=1 withRx=0", lines);
        Assert.Contains("historyGuard value=1", lines);

        // 등록 확인은 처음 한 번 + 빠르기 한 번, 둘 다 닫는다(되돌림)
        Assert.Equal(2, h.Db.Opened);
        Assert.Equal(2, h.Db.Disposed);

        // 문장 이름 차례 그대로
        var order = lines.Where(l => l.StartsWith("speed name=", StringComparison.Ordinal)).Select(l => l.Split(' ')[1].Substring(5)).ToArray();
        Assert.Equal(new[] { "Gate" }.Concat(Names), order);

        foreach (var text in new[] { "900031", "V3001", "ESWT7", "체외충격파", "20250312", "0905" }) Assert.DoesNotContain(text, report);
        Assert.DoesNotContain("실패(", report);
    }

    [Fact(DisplayName = "AC-1401.8 오늘 문장은 오늘 날짜·병원 범위로, 상세 문장은 오늘 첫 환자 한 명(차트번호·접수 시각 원값)과 1~5번으로 돈다")]
    public void SpeedArguments()
    {
        using var h = WithToday();

        h.Run();

        foreach (var sql in new[] { ReceptionSql.TodayVisits, ReceptionSql.TodayRx, ReceptionSql.PriorVisits, ReceptionSql.PriorRx, CheckSql.RxByStatus })
        {
            var call = Assert.Single(h.Db.Calls, c => c.Sql == sql);
            Assert.Equal(Stamp(Today), call.Args["@from"]);
            Assert.Equal(Stamp(Today.AddDays(1)), call.Args["@to"]);
            Assert.Equal(Hospital, call.Args["@hospital"]);
        }
        Assert.Empty(Assert.Single(h.Db.Calls, c => c.Sql == ReceptionSql.RxNames).Args);
        var count = Assert.Single(h.Db.Calls, c => c.Sql == ReceptionSql.HistoryCount);
        Assert.Equal("900031", count.Args["@chart"]);
        Assert.Equal("20261105090512", count.Args["@before"]);
        Assert.Equal(Hospital, count.Args["@hospital"]);
        var page = Assert.Single(h.Db.Calls, c => c.Sql == ReceptionSql.HistoryPage);
        Assert.Equal("900031", page.Args["@chart"]);
        Assert.Equal(1, page.Args["@first"]);
        Assert.Equal(5, page.Args["@last"]);
        Assert.Single(h.Db.Calls, c => c.Sql == StatsSql.HistoryGuardSql);
    }

    [Fact(DisplayName = "AC-1401.8 오늘 접수가 없으면 상세 문장 두 개는 건너뜀이고 나머지는 잰다")]
    public void NoPatientToday()
    {
        using var h = new Harness();
        h.Login = () => null;

        var lines = Harness.Lines(h.Run());

        Assert.Contains("speed name=TodayVisits ms=10 rows=0", lines);
        Assert.Contains("speed name=HistoryCount 건너뜀", lines);
        Assert.Contains("speed name=HistoryPage 건너뜀", lines);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql == ReceptionSql.HistoryCount || c.Sql == ReceptionSql.HistoryPage);
        Assert.Contains("historyGuard value=0", lines);
    }
}

/// <summary>센티널 시험(AC-1401.10): 모든 칸이 센티널인 가짜 DB·화면 83과 센티널을 친 메모 글로 끝까지 돌려도 보고서·콘솔 기록에 없다.</summary>
public class CheckRunnerSentinelTests
{
    private static readonly string[] Cells = { Sentinels.KoreanName, Sentinels.ChartNumber, Sentinels.EnglishName, Sentinels.Phone };

    private static IReadOnlyList<IReadOnlyList<object?>> SentinelRows(int width) =>
        Enumerable.Range(0, 3).Select(r => (IReadOnlyList<object?>)Enumerable.Range(0, width).Select(c => (object?)Cells[(r + c) % Cells.Length]).ToArray()).ToList();

    private static void SentinelScreen(Harness h)
    {
        var rows = Enumerable.Range(0, 3).Select(r => Enumerable.Range(0, 5).Select(c => Cells[(r + c) % Cells.Length]).ToArray()).ToArray();
        h.Screen.Day(Today.AddDays(-1), rows);
    }

    private static void Answers(Harness h) =>
        h.Console.Answer = last => last == LoginQuestion ? "1" : last.Contains("메모 글") || last.Contains("증상 글(") ? Sentinels.KoreanName : last.Contains("번호를 쳐") ? "6" : "";

    [Fact(DisplayName = "AC-1401.10 이름 칸까지 모든 칸이 센티널인 DB·화면 83, 센티널 메모 글로 끝까지 돌려도 보고서·콘솔 기록에 센티널이 없다")]
    public void EveryCellSentinel()
    {
        using var h = new Harness();
        h.Db.Clear();
        h.Db.Fallback = (sql, args) => SentinelRows(6);
        SentinelScreen(h);
        Answers(h);

        var report = h.Run();

        Sentinels.Absent(report);
        Sentinels.Absent(h.Console.Text);
        Assert.Contains("statusPairs pairs=3", Harness.Lines(report));
        Assert.Contains("statusPair status=? rsu=? visits=? answer=6", Harness.Lines(report));
        Assert.Contains("column col=?.? type=? length=?", Harness.Lines(report));
        Assert.Contains(Harness.Lines(report), line => line.StartsWith("done ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.10 표·칸 이름은 맞고 자료 칸만 센티널이어도(증상·이름·메모·모양·빠르기 모두 돌림) 보고서·콘솔 기록에 센티널이 없다")]
    public void DataCellsSentinel()
    {
        using var h = new Harness();
        h.Db.Fallback = (sql, args) => SentinelRows(sql.StartsWith("SELECT TOP 300", StringComparison.Ordinal) ? 1 : 6);
        SentinelScreen(h);
        Answers(h);

        var report = h.Run();
        var lines = Harness.Lines(report);

        Sentinels.Absent(report);
        Sentinels.Absent(h.Console.Text);
        Assert.Contains(lines, line => line.StartsWith("symptom col=SymInf.SymTxt compared=", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("name col=PbsInf.PbsPatNam compared=", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("memo col=OcmInf.OcmMemo rows=3 ", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("shape col=PbsInf.PbsPatNam rows=3 ", StringComparison.Ordinal));
        Assert.Contains("speed name=HistoryCount ms=10 rows=3", lines);
        Assert.DoesNotContain("실패(", report);
    }

    [Fact(DisplayName = "AC-1401.10 오류는 형 이름·도우미 오류 번호·SQL 오류 번호로만 적는다(오류 글의 센티널 없음)")]
    public void ErrorsByCodeOnly()
    {
        using var h = new Harness();
        h.Login = () => throw new InvalidOperationException(Sentinels.KoreanName);
        h.Db.OnQuery = call =>
        {
            if (call.Sql == CheckSql.TableColumns) throw new SqlException(1205);
            if (call.Sql == ReceptionSql.TodayRx) throw new BitException(BitErrors.ReadFailed);
        };

        var report = h.Run();
        var lines = Harness.Lines(report);

        Assert.Contains("columns result=실패(SqlException 1205)", lines);
        Assert.Contains("login result=실패(InvalidOperationException)", lines);
        Assert.Contains("speed name=TodayRx result=실패(E-BIT-READ-FAILED)", lines);
        Sentinels.Absent(report);
        Sentinels.Absent(h.Console.Text);
        Assert.DoesNotContain("Login failed", report);
    }
}

/// <summary>시간 제한·실패·단계 순서(AC-1401.11): 문장 30초·전체 15분(주입한 시계), 실패(번호)로 적고 다음 단계, 줄마다 디스크, 끝나면 경로를 콘솔에.</summary>
public class CheckRunnerLimitTests
{
    [Fact(DisplayName = "AC-1401.11 단계 순서: 머리 줄 → 등록 확인 → 상태 짝 → 칸 목록 → 로그인·화면 83 → 메모 → 증상 글 찾기·기록지 코드 → 기록지 코드 짝 → 상태 내력 → 모양 → 빠르기 → 끝(AC-1401.3·AC-1401.7 줄 포함)")]
    public void StepOrder()
    {
        using var h = new Harness();
        h.Login = () => null;
        h.Db.Answer(ProbeSql.Sample(Schema, "PbsInf", "PbsBirDte"), Today,
            new object?[] { "19720304" }, new object?[] { "19850101" }, new object?[] { null });
        h.Db.Answer(ProbeSql.Sample(Schema, "OcmInf", "OcmChtNum"), Today, new object?[] { "900001" });

        var lines = Harness.Lines(h.Run());

        Assert.StartsWith("reception-check started=2026-11-05T10:03 build=", lines[0]);
        var labels = lines.Skip(1).Select(l => l.Split(' ')[0]).Distinct().ToArray();
        Assert.Equal(new[]
        {
            "session", "statusPairs", "columns", "column", "linkedTables", "linkedTable", "login", "symptom", "name", "memo", "symptomSearch", "symptomCode", "sheetCodes", "statusHistory", "shape", "speed", "rxByStatus", "historyGuard", "done",
        }, labels);

        Assert.Contains("session ms=40", lines);
        Assert.Contains("columns count=11", lines);
        Assert.Contains("column col=OcmInf.OcmNum type=varchar length=12", lines);
        Assert.Contains("column col=PbsInf.PbsPatNam type=varchar length=20", lines);
        Assert.Contains("linkedTables count=4", lines);
        Assert.Contains("linkedTable table=SymInf visitColumn=SymOcmNum columns=3 text=2", lines);
        Assert.Contains("shape col=PbsInf.PbsBirDte rows=3 nonEmpty=66 minLength=8 maxLength=8 date8=100 date6=0 digits13=0 values=?", lines);
        Assert.Contains("shape col=OcmInf.OcmChtNum rows=1 nonEmpty=100 minLength=6 maxLength=6 date8=0 date6=0 digits13=0 values=?", lines);
        Assert.Contains("shape col=OrcInf.OrcAccDte rows=0 nonEmpty=0 minLength=? maxLength=? date8=0 date6=0 digits13=0 values=?", lines);
        Assert.DoesNotContain(lines, l => l.StartsWith("shape col=OdrInf", StringComparison.Ordinal) || l.StartsWith("shape col=SymInf", StringComparison.Ordinal));
        Assert.DoesNotContain("19720304", string.Join("\n", lines));

        // 세션은 끝나면 닫는다(되돌림)
        Assert.Equal(h.Db.Opened, h.Db.Disposed);
    }

    [Fact(DisplayName = "AC-1401.11 문장이 30초를 넘으면 그 항목은 실패(시간 초과)이고 다음 단계로 간다, 문장마다 시간 제한 30초를 넘겨준다")]
    public void StatementOverThirtySeconds()
    {
        using var h = new Harness();
        h.Login = () => null;
        h.Db.Took = sql => sql == CheckSql.TableColumns ? TimeSpan.FromSeconds(31) : sql == ReceptionSql.TodayRx ? TimeSpan.FromSeconds(30) : TimeSpan.FromMilliseconds(10);

        var lines = Harness.Lines(h.Run());

        Assert.Contains("columns result=실패(시간 초과)", lines);
        Assert.Contains("speed name=TodayRx ms=30000 rows=0", lines);
        Assert.Contains("linkedTables count=4", lines);
        Assert.Contains(lines, l => l.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
        Assert.All(h.Db.Calls, c => Assert.True(c.Timeout > TimeSpan.Zero && c.Timeout <= TimeSpan.FromSeconds(30), c.Timeout.ToString()));
        Assert.Contains(h.Db.Calls, c => c.Timeout == TimeSpan.FromSeconds(30));
    }

    [Fact(DisplayName = "AC-1401.11 전체 15분을 넘으면 남은 단계는 실패(시간 초과)로 적고 문장을 더 돌리지 않는다, 사람이 답하는 시간은 세지 않는다")]
    public void TotalOverFifteenMinutes()
    {
        using var h = new Harness();
        h.Login = () => null;
        h.Console.Think = TimeSpan.FromMinutes(20);
        h.Db.Answer(CheckSql.TableColumns, MainColumns.Concat(Enumerable.Range(1, 40).Select(i => Col("PbsInf", "PbsX" + i, "varchar", 10))).ToArray());
        h.Db.Took = sql => ProbeSql.IsProbe(sql) && sql.StartsWith("SELECT TOP 300", StringComparison.Ordinal) ? TimeSpan.FromSeconds(29) : TimeSpan.FromMilliseconds(10);

        var lines = Harness.Lines(h.Run());

        // 사람이 20분씩 생각해도 앞 단계는 그대로 돈다
        Assert.Contains("statusPairs pairs=0", lines);
        Assert.Contains("linkedTables count=4", lines);
        // 모양 단계가 15분을 넘긴다: 한 번만 적고 그 단계를 멈춘다, 빠르기는 돌지 않는다
        Assert.Single(lines, l => l == "shape result=실패(시간 초과)");
        Assert.Contains("speed result=실패(시간 초과)", lines);
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql == ReceptionSql.TodayVisits || c.Sql == StatsSql.HistoryGuardSql);
        var probeSeconds = h.Db.Calls.Count(c => c.Sql.StartsWith("SELECT TOP 300", StringComparison.Ordinal)) * 29;
        Assert.InRange(probeSeconds, 15 * 60 - 60, 15 * 60 + 29);
        // 남은 시간이 30초보다 짧으면 그만큼만 넘겨준다
        Assert.Contains(h.Db.Calls, c => c.Timeout < TimeSpan.FromSeconds(29));
        Assert.Contains(lines, l => l.StartsWith("done ", StringComparison.Ordinal));
        Assert.Equal(h.Db.Opened, h.Db.Disposed);
    }

    [Fact(DisplayName = "AC-1401.11 등록 확인이 실패하면 실패(번호)로 적고 DB 단계는 건너뜀, 끝 줄과 경로는 그대로 쓴다")]
    public void SessionFails()
    {
        using var h = new Harness();
        h.Db.OpenError = () => new BitException(BitErrors.NotRegistered);

        var lines = Harness.Lines(h.Run());

        Assert.Contains("session result=실패(E-BIT-NOT-REGISTERED)", lines);
        Assert.Contains("statusPairs 건너뜀", lines);
        Assert.Contains("speed 건너뜀", lines);
        Assert.Empty(h.Db.Calls);
        Assert.Empty(h.Screen.Asked);
        Assert.Contains(lines, l => l.StartsWith("done ", StringComparison.Ordinal));
        Assert.Contains(h.Console.Written, l => l.Contains(h.ReportPath));
    }

    [Fact(DisplayName = "AC-1401.11 보고서는 줄을 쓸 때마다 디스크에 남고, 끝나면 경로(reception-check-yyyyMMdd-HHmmss.txt, 푼 폴더)를 콘솔에 쓴다")]
    public void WrittenAsItGoesAndPathOnConsole()
    {
        using var h = new Harness();
        h.Login = () => null;
        string? midway = null;
        h.Db.OnQuery = call =>
        {
            if (call.Sql == StatsSql.HistoryGuardSql) midway = h.ReadReport();
        };

        var report = h.Run();

        Assert.NotNull(midway);
        Assert.Contains("session ms=40", midway);
        Assert.Contains("speed name=TodayVisits ", midway);
        Assert.DoesNotContain("done ", midway);
        Assert.Contains("done ", report);

        Assert.Equal(h.Folder, Path.GetDirectoryName(h.ReportPath));
        Assert.Matches(@"^reception-check-\d{8}-\d{6}\.txt$", Path.GetFileName(h.ReportPath));
        Assert.Contains(h.Console.Written, l => l.Contains(h.ReportPath));
        Assert.Contains(h.Console.Written, l => l.Contains("메모장"));
        Assert.True(h.Console.Reads >= 2);
    }
}

/// <summary>
/// 확인 로그인 창 고침(TASK-32·TASK-33): 4/8에서 띄우기 전에 묻고 1일 때만 띄우며(AC-1401.14), 창이 안 뜨거나(60초) 로그인이 너무 길면(5분)
/// 콘솔에 알리고 실패(번호)로 적은 뒤 다음 단계로 간다(AC-1401.15). 기다림 자체는 LoginWait 시험이 본다.
/// </summary>
public class CheckLoginRunnerTests
{
    private const string Question = "비트 로그인 창을 띄울까요? 1 = 띄우기, 엔터 = 건너뛰기";
    private const string NoWindow = "로그인 창이 뜨지 않아 이 단계를 건너뛰어요";
    private const string TooLong = "로그인이 5분 안에 끝나지 않아 이 단계를 건너뛰어요";

    private static void AssertSkippedAndContinued(Harness h, string[] lines)
    {
        Assert.Empty(h.Screen.Asked);
        Assert.Contains("symptom 건너뜀", lines);
        Assert.Contains("name 건너뜀", lines);
        Assert.Contains(h.Console.Written, l => l.StartsWith("5/10 ", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
        Assert.Contains(lines, line => line.StartsWith("done ", StringComparison.Ordinal));
    }

    [Theory(DisplayName = "AC-1401.14 로그인 창을 띄우기 전에 묻고, 엔터(기본)·1이 아닌 글이면 띄우지 않고 로그인·증상·이름 찾기를 건너뜀으로 적고 다음 단계로 간다")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("0")]
    [InlineData("2")]
    [InlineData("11")]
    public void EnterSkipsTheLogin(string typed)
    {
        using var h = new Harness();
        h.Console.Answer = last => last == Question ? typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Equal(0, h.Logins);
        Assert.Contains(Question, h.Console.Written);
        Assert.Contains("login 건너뜀", lines);
        AssertSkippedAndContinued(h, lines);
    }

    [Fact(DisplayName = "AC-1401.14 묻는 자리에서 입력이 끝나면(null) 로그인 창을 띄우지 않고 건너뜀")]
    public void InputEndSkipsTheLogin()
    {
        using var h = new Harness();
        h.Console.Answer = last => last == Question ? null : "";

        var lines = Harness.Lines(h.Run());

        Assert.Equal(0, h.Logins);
        Assert.Contains("login 건너뜀", lines);
        AssertSkippedAndContinued(h, lines);
    }

    [Theory(DisplayName = "AC-1401.14 1(앞뒤 공백 뗌)이면 묻는 글을 쓴 뒤에 로그인 창을 한 번 띄운다")]
    [InlineData("1")]
    [InlineData(" 1 ")]
    [InlineData("1\t")]
    public void OneShowsTheLogin(string typed)
    {
        using var h = new Harness();
        h.Console.Answer = last => last == Question ? typed : "";
        var questionBeforeLogin = false;
        h.Login = () =>
        {
            questionBeforeLogin = h.Console.Written.Contains(Question);
            return new VendorUser("U01", "20261105");
        };

        var lines = Harness.Lines(h.Run());

        Assert.Equal(1, h.Logins);
        Assert.True(questionBeforeLogin, "로그인 창을 띄우기 전에 물어야 한다");
        Assert.Contains("login result=ok", lines);
        Assert.Equal(1, h.Console.Written.Count(l => l == Question));
    }

    [Fact(DisplayName = "AC-1401.14 묻고 답하는 시간은 사람이 쓴 시간이라 전체 15분에 세지 않는다")]
    public void QuestionTimeIsHumanTime()
    {
        using var h = new Harness();
        h.Console.Think = TimeSpan.FromMinutes(20);

        var report = h.Run();

        Assert.Contains(Question, h.Console.Written);
        Assert.DoesNotContain("시간 초과", report);
        Assert.Contains("login result=ok", Harness.Lines(report));
    }

    [Fact(DisplayName = "AC-1401.15 60초 안에 로그인 창이 안 뜨면(LoginWindowMissingException) 콘솔에 알리고 login은 실패(번호), 증상·이름 찾기는 건너뜀, 다음 단계는 그대로")]
    public void WindowMissing()
    {
        using var h = new Harness();
        var error = new LoginWindowMissingException();
        h.Login = () => throw error;

        var lines = Harness.Lines(h.Run());

        Assert.Equal(1, h.Logins);
        Assert.Contains(NoWindow, h.Console.Written);
        Assert.DoesNotContain(TooLong, h.Console.Written);
        Assert.Contains("login result=실패(LoginWindowMissingException)", lines);
        AssertSkippedAndContinued(h, lines);
    }

    [Fact(DisplayName = "AC-1401.15 창이 떠도 5분 안에 로그인이 안 끝나면(LoginTooLongException) 콘솔에 알리고 login은 실패(번호), 다음 단계는 그대로")]
    public void LoginTooLong()
    {
        using var h = new Harness();
        var error = new LoginTooLongException();
        h.Login = () => throw error;

        var lines = Harness.Lines(h.Run());

        Assert.Contains(TooLong, h.Console.Written);
        Assert.DoesNotContain(NoWindow, h.Console.Written);
        Assert.Contains("login result=실패(LoginTooLongException)", lines);
        AssertSkippedAndContinued(h, lines);
    }

    [Fact(DisplayName = "AC-1401.15 다른 로그인 오류는 지금처럼 실패(번호)만 적고 창 없음·5분 글은 쓰지 않는다")]
    public void OtherLoginErrorUnchanged()
    {
        using var h = new Harness();
        h.Login = () => throw new BitException(BitErrors.NotFound);

        var lines = Harness.Lines(h.Run());

        Assert.Contains("login result=실패(E-BIT-NOT-FOUND)", lines);
        Assert.DoesNotContain(NoWindow, h.Console.Written);
        Assert.DoesNotContain(TooLong, h.Console.Written);
        AssertSkippedAndContinued(h, lines);
    }
}
