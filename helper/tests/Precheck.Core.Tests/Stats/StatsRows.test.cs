using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Stats;

/// <summary>가짜 통계 자료. 차트번호는 9로 시작하는 6자리 가짜를 조각으로 이어 만든다(이름·전화·주민번호 없음).</summary>
internal static class StatsFake
{
    public static string Chart(int n) => "9" + n.ToString("D5", CultureInfo.InvariantCulture);

    /// <summary>
    /// 등록한 가짜 병원 + 통계 SQL 답. 진료 줄·접수 줄 다섯째 칸에 가짜 이름·전화를 일부러 넣는다(보내지 않아야 한다).
    /// 처방 목록: MM042는 이름이 둘(원본 정렬의 첫 이름), eswt1은 소문자(대소문자 무시), XR01은 이름이 비었음(코드로),
    /// ZZ999는 진료 줄에 없음(빠짐). 진료 줄의 NOCAT1은 처방 목록에 없음(이름 없음).
    /// </summary>
    public static Rig Clinic()
    {
        var rig = new Rig().Registered();
        var db = rig.Session;
        db.Answer(StatsSql.HistoryGuardSql, _ => new[] { new object?[] { 0 } });
        db.Answer(StatsSql.VisitRowsSql, _ => new[]
        {
            new object?[] { Chart(1), "20260901", "ESWT1", "20260115", Fake.Name },
            new object?[] { Chart(1), "20260901", "MM042", "20260115", Fake.Phone },
            new object?[] { Chart(2) + " ", "20260902", "MM042", "20260902", Fake.Name },
            new object?[] { Chart(3), "20260903", "NOCAT1", null, null },
            new object?[] { Chart(3), "20260903", "XR01", null, null },
        });
        db.Answer(StatsSql.PatientDaysSql, _ => new[]
        {
            new object?[] { Chart(1), "20260901", 1L, "20260115", Fake.Name },
            new object?[] { Chart(2) + " ", "20260902", 1L, "20260902", Fake.Phone },
            new object?[] { Chart(3), "20260903", 2L, null, null },
        });
        db.Answer(StatsSql.VisitSummarySql, _ => new[] { new object?[] { 4L, 3L, 1L, 0L, 0L, 1L } });
        db.Answer(StatsSql.VisitDaysSql, _ => new[]
        {
            new object?[] { "20260901", 1L, 1, 0 },
            new object?[] { "20260902", 1L, 1, 1 },
            new object?[] { "20260903", 2L, 1, 0 },
        });
        db.Answer(StatsSql.CodeNamesSql, _ => new[]
        {
            new object?[] { "MM042", "가짜 처방 가", "EA", "20200101", "99991231", "1", "", true },
            new object?[] { "MM042", "가짜 처방 옛이름", "EA", "20100101", "20191231", "1", "", true },
            new object?[] { "XR01", "  ", "", "20200101", "99991231", "1", "", false },
            new object?[] { "ZZ999", "안 쓴 처방", "", "20200101", "99991231", "1", "", false },
            new object?[] { "eswt1", "가짜 충격파", "", "20200101", "99991231", "1", "", false },
        });
        AnswerReport(db);
        return rig;
    }

    /// <summary>문제없는 가짜 보고 숫자(모든 벌이 같다). 시험마다 필요한 SQL 답만 바꾼다.</summary>
    public static void AnswerReport(FakeDb db)
    {
        db.Answer(StatsSql.UnsupportedFinanceSql, _ => new[] { new object?[] { 0L } });
        db.Answer(StatsSql.PatientsSql, _ => new[] { new object?[] { 12L, 3L, 0L, 0L, 0L } });
        db.Answer(StatsSql.TreatmentsSql, _ => new[]
        {
            new object?[] { "manual", 5L, 0L },
            new object?[] { "eswt", 4L, 0L },
            new object?[] { "carm", 3L, 0L },
            new object?[] { "sono", 2L, 0L },
            new object?[] { "cryo", 1L, 0L },
        });
        db.Answer(StatsSql.LaCodesSql, _ => new[] { new object?[] { "LA01 ", 2L }, new object?[] { "LA-B.2", 1L } });
        db.Answer(StatsSql.FinanceMultiplicitySql, _ => new[] { new object?[] { 0L } });
        db.Answer(StatsSql.ReceivableMultiplicitySql, _ => new[] { new object?[] { 0L } });
        db.Answer(StatsSql.FinanceNormalSql, _ => new[] { new object?[] { 100000m, 60000m, 30000m, 10000m, 20000m, 5000m } });
        db.Answer(StatsSql.FinanceReceivableSql, _ => new[] { new object?[] { 1000m, 600m, 300m, 100m, 200m, 50m } });
    }

    /// <summary>진료 줄 n개(모두 같은 가짜 값). 큰 자료 시험용.</summary>
    public static IEnumerable<object?[]> ManyRows(int n)
    {
        var row = new object?[] { Chart(1), "20260901", "MM042", "20260115" };
        for (var i = 0; i < n; i++) yield return row;
    }

    /// <summary>접수 줄 n개(모두 같은 가짜 값). 큰 자료 시험용.</summary>
    public static IEnumerable<object?[]> ManyPatientDays(int n)
    {
        var row = new object?[] { Chart(1), "20260901", 1L, "20260115" };
        for (var i = 0; i < n; i++) yield return row;
    }
}

/// <summary>
/// AC-503.1 stats.rows: 등록 확인(HospitalGate.Open) → 과거 자료 확인 → 진료 줄 → 접수 줄 → 기간 합계 → 날짜별 → 처방 이름을
/// JSON 하나로 만든 뒤 chunk … end로 보낸다. AC-503.3 반쪽 자료 없이 error만. AC-503.4 기록에는 시각·명령 이름·오류 번호만.
/// AC-503.5 접수 줄은 진료 줄 바로 다음에 읽고, 답의 v는 2, patientDays는 days 바로 뒤다.
/// </summary>
public class StatsRowsTests
{
    private const int Limit = 1_000_000;
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    private static string Sha256Hex(byte[] bytes)
    {
        using var sha = SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }

    internal static ListSink Handle(Rig rig, string args, List<(string? Cmd, string? Code)>? log = null, string id = "s-1")
    {
        var dispatcher = new Dispatcher(Table, (cmd, code) => log?.Add((cmd, code)));
        StatsCommands.Register(dispatcher, rig.Services);
        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(StatsCommands.RowsName, args, id: id)), sink);
        return sink;
    }

    private const string September = "{\"from\":\"2026-09-01\",\"to\":\"2026-09-30\"}";

    /// <summary>chunk(seq 0부터) … end를 검사하고 모은 JSON 글자를 돌려준다.</summary>
    internal static string Assemble(ListSink sink, string id = "s-1")
    {
        Assert.True(sink.Messages.Count >= 2, "chunk 하나 이상 + end");
        var data = new StringBuilder();
        for (var i = 0; i < sink.Messages.Count; i++)
        {
            Assert.True(4 + sink.Messages[i].Length <= Limit, "메시지 " + i + "가 머리 포함 " + (4 + sink.Messages[i].Length) + "바이트");
            var reply = Json.Parse(sink.Messages[i]);
            Assert.Equal(id, reply.GetProperty("id").GetString());
            if (i < sink.Messages.Count - 1)
            {
                Assert.Equal("chunk", reply.GetProperty("type").GetString());
                Assert.Equal(i, reply.GetProperty("seq").GetInt32());
                data.Append(reply.GetProperty("data").GetString());
            }
            else
            {
                Assert.Equal("end", reply.GetProperty("type").GetString());
                var bytes = Encoding.UTF8.GetBytes(data.ToString());
                Assert.Equal(sink.Messages.Count - 1, reply.GetProperty("count").GetInt32());
                Assert.Equal(bytes.LongLength, reply.GetProperty("bytes").GetInt64());
                Assert.Equal(Sha256Hex(bytes), reply.GetProperty("sha256").GetString());
            }
        }
        return data.ToString();
    }

    internal static void AssertOnlyError(ListSink sink, string code, string id = "s-1")
    {
        var reply = Assert.Single(sink.Replies);
        Assert.Equal(new[] { "v", "id", "type", "code" }, Json.Keys(reply));
        Assert.Equal(id, reply.GetProperty("id").GetString());
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal(code, reply.GetProperty("code").GetString());
    }

    private static string[] Strings(JsonElement array) => array.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.Null ? "null" : item.ToString()).ToArray();

    private static string[][] Table2(JsonElement array) => array.EnumerateArray().Select(Strings).ToArray();

    // ---- AC-503.1 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-503.1 등록 확인 뒤 진료 줄·접수 줄·기간 합계·날짜별·처방 이름을 정해 둔 열쇠의 JSON 하나로 chunk … end에 보낸다")]
    public void SendsOneJsonInChunks()
    {
        using var rig = StatsFake.Clinic();
        var sink = Handle(rig, September);
        var json = Assemble(sink);
        var root = Json.Parse(json);

        Assert.Equal(new[] { "v", "from", "to", "summary", "days", "patientDays", "codes", "rows", "report" }, Json.Keys(root));
        Assert.Equal(2, root.GetProperty("v").GetInt32());
        Assert.Equal("2026-09-01", root.GetProperty("from").GetString());
        Assert.Equal("2026-09-30", root.GetProperty("to").GetString());

        var summary = root.GetProperty("summary");
        Assert.Equal(new[] { "visits", "patients", "newPatients", "noChart", "duplicate", "noFirst" }, Json.Keys(summary));
        Assert.Equal(new long[] { 4, 3, 1, 0, 0, 1 }, Json.Keys(summary).Select(key => summary.GetProperty(key).GetInt64()).ToArray());

        Assert.Equal(new[]
        {
            new[] { "20260901", "1", "1", "0" },
            new[] { "20260902", "1", "1", "1" },
            new[] { "20260903", "2", "1", "0" },
        }, Table2(root.GetProperty("days")));
        Assert.All(root.GetProperty("days").EnumerateArray(), day =>
        {
            Assert.Equal(JsonValueKind.String, day[0].ValueKind);
            for (var i = 1; i < 4; i++) Assert.Equal(JsonValueKind.Number, day[i].ValueKind);
        });

        // [차트번호, 진료일, 접수 건수, 첫 내원일(없으면 null)] — 환자·날마다 한 줄, 앞뒤 공백만 없앰
        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "1", "20260115" },
            new[] { StatsFake.Chart(2), "20260902", "1", "20260902" },
            new[] { StatsFake.Chart(3), "20260903", "2", "null" },
        }, Table2(root.GetProperty("patientDays")));

        // 진료 줄에 나온 코드만, 코드마다 원본 정렬의 첫 이름(대소문자 무시, 이름이 비면 코드)
        Assert.Equal(new[]
        {
            new[] { "ESWT1", "가짜 충격파" },
            new[] { "MM042", "가짜 처방 가" },
            new[] { "XR01", "XR01" },
        }, Table2(root.GetProperty("codes")));

        // [차트번호, 진료일, 처방코드, 첫 내원일(없으면 null)] — 원본 글자 yyyyMMdd 그대로, 앞뒤 공백만 없앰
        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "ESWT1", "20260115" },
            new[] { StatsFake.Chart(1), "20260901", "MM042", "20260115" },
            new[] { StatsFake.Chart(2), "20260902", "MM042", "20260902" },
            new[] { StatsFake.Chart(3), "20260903", "NOCAT1", "null" },
            new[] { StatsFake.Chart(3), "20260903", "XR01", "null" },
        }, Table2(root.GetProperty("rows")));
        Assert.Equal(JsonValueKind.Null, root.GetProperty("rows")[3][3].ValueKind);

        var report = root.GetProperty("report");
        Assert.Equal(new[] { "daily", "monthly" }, Json.Keys(report));
        Assert.Equal(2, report.GetProperty("daily").GetArrayLength());
        Assert.Equal(2, report.GetProperty("monthly").GetArrayLength());

        // 이름·전화 칸은 보내지 않는다(DB가 더 준 칸도 싣지 않음)
        Assert.DoesNotContain(Fake.Name, json);
        Assert.DoesNotContain(Fake.Phone, json);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-503.1 등록 확인을 먼저 하고 그 세션으로 과거 자료 확인 → 진료 줄 → 접수 줄 → 기간 합계 → 날짜별 → 처방 이름 순서로 읽는다")]
    public void ReadsInOrderWithDateParameters()
    {
        using var rig = StatsFake.Clinic();
        Assemble(Handle(rig, "{\"from\":\"2026-09-01\",\"to\":\"2026-12-31\"}"));

        // 보고 네 벌은 그다음에 읽는다(StatsReport.test.cs)
        Assert.Equal(new[]
        {
            Sql.ScopesSql, Sql.InstitutionSql,
            StatsSql.HistoryGuardSql, StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql,
            Sql.SnapshotStateSql,
        }, rig.Session.Sqls.Take(9));

        var calls = rig.Session.Calls.Skip(2).ToArray();
        Assert.Empty(calls[0].Args);
        Assert.Equal(Sql.MetaTimeout, calls[0].Timeout);
        foreach (var call in calls.Skip(1).Take(4))
        {
            // 끝은 다음 날 0시(원본 To는 마지막 날의 다음 날), 연도를 넘어도
            Assert.Equal("202609010000", call.Args["@from"]);
            Assert.Equal("202701010000", call.Args["@to"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(3, call.Args.Count);
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        }
        // 처방 목록 SQL: Char(8) 기간, 비교 기간은 같은 날(원본 LoadCodesForRange)
        Assert.Equal(new Dictionary<string, object?>
        {
            ["@from"] = "20260901", ["@to"] = "20261231", ["@priorFrom"] = "20260901", ["@priorTo"] = "20261231",
        }.OrderBy(p => p.Key), calls[5].Args.OrderBy(p => p.Key));
        Assert.Equal(TimeSpan.FromSeconds(150), calls[5].Timeout);
        Assert.Equal(TimeSpan.FromSeconds(150), StatsSql.DataTimeout);
    }

    // ---- AC-503.5 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-503.5 접수 줄은 진료 줄 바로 다음에 한 번, 같은 기간·병원 매개변수와 150초 제한으로 읽는다")]
    public void PatientDaysAreReadRightAfterVisitRows()
    {
        using var rig = StatsFake.Clinic();
        Assemble(Handle(rig, September));

        var sqls = rig.Session.Sqls.ToList();
        Assert.Single(sqls, sql => sql == StatsSql.PatientDaysSql);
        var at = sqls.IndexOf(StatsSql.PatientDaysSql);
        Assert.Equal(StatsSql.VisitRowsSql, sqls[at - 1]);
        Assert.Equal(StatsSql.VisitSummarySql, sqls[at + 1]);

        var call = rig.Session.Calls[at];
        Assert.Equal(3, call.Args.Count);
        Assert.Equal("202609010000", call.Args["@from"]);
        Assert.Equal("202610010000", call.Args["@to"]);
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
    }

    [Fact(DisplayName = "AC-503.5 답의 v는 2이고 열쇠 차례는 v·from·to·summary·days·patientDays·codes·rows·report다")]
    public void PayloadVersionAndKeyOrder()
    {
        using var rig = StatsFake.Clinic();
        var root = Json.Parse(Assemble(Handle(rig, September)));

        Assert.Equal(2, root.GetProperty("v").GetInt32());
        Assert.Equal(2, StatsPayload.Version);
        Assert.Equal(new[] { "v", "from", "to", "summary", "days", "patientDays", "codes", "rows", "report" }, Json.Keys(root));
    }

    [Fact(DisplayName = "AC-503.5 접수 줄은 [차트번호, 진료일, 건수(숫자), 첫 내원일|null]이고 처방 없는 접수도 싣고 코드 목록은 건드리지 않는다")]
    public void PatientDaysShape()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1) + "  ", "20260901", 2L, "20260115", Fake.Name },
            new object?[] { StatsFake.Chart(4), "20260905", 1, "", Fake.Phone },    // 처방 없는 접수, 첫 내원일 빈 글자
            new object?[] { StatsFake.Chart(5), "20260906", 1, null, null },        // 첫 내원일 없음
            new object?[] { StatsFake.Chart(5), "20260907", 3, "   ", null },       // 공백뿐인 첫 내원일
        });
        var json = Assemble(Handle(rig, September));
        var root = Json.Parse(json);
        var days = root.GetProperty("patientDays");

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "2", "20260115" },
            new[] { StatsFake.Chart(4), "20260905", "1", "null" },
            new[] { StatsFake.Chart(5), "20260906", "1", "null" },
            new[] { StatsFake.Chart(5), "20260907", "3", "null" },
        }, Table2(days));
        Assert.All(days.EnumerateArray(), day =>
        {
            Assert.Equal(4, day.GetArrayLength());
            Assert.Equal(JsonValueKind.String, day[0].ValueKind);
            Assert.Equal(JsonValueKind.String, day[1].ValueKind);
            Assert.Equal(JsonValueKind.Number, day[2].ValueKind);
        });
        Assert.Equal(JsonValueKind.Null, days[1][3].ValueKind);
        Assert.Equal(JsonValueKind.Null, days[2][3].ValueKind);

        // 처방 없는 접수는 진료 줄·코드 목록에 아무것도 더하지 않는다
        Assert.DoesNotContain(root.GetProperty("rows").EnumerateArray(), row => row[0].GetString() == StatsFake.Chart(4));
        Assert.Equal(new[] { "ESWT1", "MM042", "XR01" }, root.GetProperty("codes").EnumerateArray().Select(code => code[0].GetString()!).ToArray());

        // DB가 더 준 칸은 싣지 않는다
        Assert.DoesNotContain(Fake.Name, json);
        Assert.DoesNotContain(Fake.Phone, json);
    }

    [Fact(DisplayName = "AC-503.5 접수 줄이 700,000줄이면 다 싣는다(한도 안)")]
    public void PatientDaysUpToTheLimit()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => StatsFake.ManyPatientDays(StatsRows.MaxRows));
        var root = Json.Parse(Assemble(Handle(rig, September)));

        Assert.Equal(700_000, root.GetProperty("patientDays").GetArrayLength());
    }

    [Fact(DisplayName = "AC-503.5 접수 줄이 700,001줄이면 E-STATS-TOO-BIG만 보내고 반쪽 자료가 없다(AC-503.3)")]
    public void TooManyPatientDays()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => StatsFake.ManyPatientDays(StatsRows.MaxRows + 1));
        AssertOnlyError(Handle(rig, September), "E-STATS-TOO-BIG");
        Assert.DoesNotContain(StatsSql.VisitSummarySql, rig.Session.Sqls);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-503.1 1MB를 넘는 답은 여러 chunk(머리 포함 1,000,000바이트 이하)로 나누고 end의 크기·SHA-256이 맞다")]
    public void LargeAnswerIsSplit()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => StatsFake.ManyRows(40_000));
        var sink = Handle(rig, September);

        Assert.True(sink.Messages.Count >= 3, "chunk 둘 이상 + end");
        var root = Json.Parse(Assemble(sink));
        Assert.Equal(40_000, root.GetProperty("rows").GetArrayLength());
    }

    [Fact(DisplayName = "AC-503.1 진료 줄 700,000줄까지는 읽는다(한도 안)")]
    public void ReadsUpToTheLimit()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => StatsFake.ManyRows(StatsRows.MaxRows));
        var result = StatsRows.Read(rig.Session, Synthetic.Scope, "2026-09-01", "2026-09-30");

        Assert.Equal(700_000, StatsRows.MaxRows);
        Assert.Equal(StatsRows.MaxRows, result.Rows.Count);
        Assert.Equal(new[] { "MM042" }, result.Codes.Select(code => code.Code).ToArray());
    }

    private static readonly string Code40 = new string('C', 40);
    private static readonly string Code41 = new string('C', 41);

    [Fact(DisplayName = "AC-503.1 처방코드가 빈 글자·NULL·공백뿐·41자인 진료 줄은 답의 rows에 없고 40자 코드의 줄은 있다")]
    public void SkipsRowsWithUnusableCode()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", "", "20260115" },
            new object?[] { StatsFake.Chart(1), "20260901", null, "20260115" },
            new object?[] { StatsFake.Chart(1), "20260901", "   ", "20260115" },
            new object?[] { StatsFake.Chart(1), "20260901", "\t　", "20260115" },    // 탭·전각 공백뿐
            new object?[] { StatsFake.Chart(1), "20260901", Code41, "20260115" },
            new object?[] { StatsFake.Chart(1), "20260901", Code41 + "  ", "20260115" },
            new object?[] { StatsFake.Chart(2), "20260902", Code40, "20260902" },
            new object?[] { StatsFake.Chart(2), "20260902", Code40 + "  ", "20260902" }, // 앞뒤 공백을 없애면 40자
            new object?[] { StatsFake.Chart(2), "20260902", "MM042", "20260902" },
        });
        var root = Json.Parse(Assemble(Handle(rig, September)));

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(2), "20260902", Code40, "20260902" },
            new[] { StatsFake.Chart(2), "20260902", Code40, "20260902" },
            new[] { StatsFake.Chart(2), "20260902", "MM042", "20260902" },
        }, Table2(root.GetProperty("rows")));
    }

    [Fact(DisplayName = "AC-503.1 41자 코드가 처방 목록에 있어도 답의 codes에 없다(40자 코드는 있다)")]
    public void SkippedCodeIsNotInCodes()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", Code41, "20260115" },
            new object?[] { StatsFake.Chart(2), "20260902", Code40, "20260902" },
            new object?[] { StatsFake.Chart(2), "20260902", "MM042", "20260902" },
        });
        rig.Session.Answer(StatsSql.CodeNamesSql, _ => new[]
        {
            new object?[] { Code41, "가짜 긴 처방", "", "20200101", "99991231", "1", "", false },
            new object?[] { Code40, "가짜 40자 처방", "", "20200101", "99991231", "1", "", false },
            new object?[] { "MM042", "가짜 처방 가", "EA", "20200101", "99991231", "1", "", true },
        });
        var root = Json.Parse(Assemble(Handle(rig, September)));

        Assert.Equal(new[]
        {
            new[] { Code40, "가짜 40자 처방" },
            new[] { "MM042", "가짜 처방 가" },
        }, Table2(root.GetProperty("codes")));
    }

    [Fact(DisplayName = "AC-503.1 건너뛴 진료 줄의 환자·날은 patientDays에 그대로 있고 summary·days는 그대로다")]
    public void SkippedRowsLeaveVisitNumbersAlone()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", "MM042", "20260115" },
            new object?[] { StatsFake.Chart(2), "20260902", null, "20260902" },    // 이 환자·날의 처방 줄은 모두 건너뛴다
            new object?[] { StatsFake.Chart(2), "20260902", Code41, "20260902" },
        });
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => new[]
        {
            new object?[] { StatsFake.Chart(1), "20260901", 1L, "20260115" },
            new object?[] { StatsFake.Chart(2), "20260902", 2L, "20260902" },
        });
        rig.Session.Answer(StatsSql.VisitSummarySql, _ => new[] { new object?[] { 3L, 2L, 1L, 0L, 0L, 0L } });
        rig.Session.Answer(StatsSql.VisitDaysSql, _ => new[]
        {
            new object?[] { "20260901", 1L, 1, 0 },
            new object?[] { "20260902", 2L, 1, 1 },
        });
        var root = Json.Parse(Assemble(Handle(rig, September)));

        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "1", "20260115" },
            new[] { StatsFake.Chart(2), "20260902", "2", "20260902" },
        }, Table2(root.GetProperty("patientDays")));
        var summary = root.GetProperty("summary");
        Assert.Equal(new long[] { 3, 2, 1, 0, 0, 0 }, Json.Keys(summary).Select(key => summary.GetProperty(key).GetInt64()).ToArray());
        Assert.Equal(new[]
        {
            new[] { "20260901", "1", "1", "0" },
            new[] { "20260902", "2", "1", "1" },
        }, Table2(root.GetProperty("days")));

        // 처방 줄만 빠진다
        Assert.Equal(new[]
        {
            new[] { StatsFake.Chart(1), "20260901", "MM042", "20260115" },
        }, Table2(root.GetProperty("rows")));
    }

    [Fact(DisplayName = "AC-503.1 등록이 없으면 비트를 열지 않고 E-BIT-NOT-REGISTERED, 다르면 E-BIT-HOSPITAL-MISMATCH(통계 SQL을 돌리지 않음)")]
    public void RegistrationGate()
    {
        using (var rig = new Rig())
        {
            AssertOnlyError(Handle(rig, September), "E-BIT-NOT-REGISTERED");
            Assert.Equal(0, rig.Locator.Calls);
            Assert.Empty(rig.Connector.Opened);
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(Sql.ScopesSql, "FOREIGN");
            AssertOnlyError(Handle(rig, September), "E-BIT-HOSPITAL-MISMATCH");
            Assert.DoesNotContain(rig.Session.Sqls, sql => StatsSql.All.Contains(sql));
            Assert.Equal(1, rig.Session.Disposed);
        }
    }

    // ---- AC-503.3 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-503.3 과거 이관 자료가 따로 있으면(HistoryGuard 1) 진료 줄을 읽지 않고 error E-STATS-HISTORY만")]
    public void HistoryStops()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.HistoryGuardSql, _ => new[] { new object?[] { 1 } });
        AssertOnlyError(Handle(rig, September), "E-STATS-HISTORY");
        Assert.Equal("E-STATS-HISTORY", StatsErrors.History);
        Assert.DoesNotContain(StatsSql.VisitRowsSql, rig.Session.Sqls);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-503.3 진료 줄이 700,000줄을 넘으면 E-STATS-TOO-BIG만 보낸다(chunk 없음)")]
    public void TooManyRows()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => StatsFake.ManyRows(StatsRows.MaxRows + 1));
        AssertOnlyError(Handle(rig, September), "E-STATS-TOO-BIG");
        Assert.Equal("E-STATS-TOO-BIG", StatsErrors.TooBig);
        Assert.DoesNotContain(StatsSql.VisitSummarySql, rig.Session.Sqls);
        Assert.DoesNotContain(StatsSql.PatientDaysSql, rig.Session.Sqls);
        Assert.Equal(1, rig.Session.Disposed);
    }

    public static IEnumerable<object[]> EachSql() => Enumerable.Range(0, 6).Select(i => new object[] { i });

    private static readonly string[] Order =
    {
        StatsSql.HistoryGuardSql, StatsSql.VisitRowsSql, StatsSql.PatientDaysSql, StatsSql.VisitSummarySql, StatsSql.VisitDaysSql, StatsSql.CodeNamesSql,
    };

    [Theory(DisplayName = "AC-503.3 통계 SQL 하나라도 실패하면(접수 줄·기간 합계 포함) 반쪽 자료 없이 E-BIT-READ-FAILED만")]
    [MemberData(nameof(EachSql))]
    public void AnySqlFails(int index)
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Fail(Order[index], BitErrors.ReadFailed);
        AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        Assert.Equal(Order.Take(index + 1), rig.Session.Sqls.Skip(2));
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-503.3 SQL 답이 숫자·한 줄 모양이 아니면 도우미를 멈추지 않고 E-BIT-READ-FAILED만")]
    public void MalformedAnswers()
    {
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.VisitSummarySql, _ => new object?[0][]);
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.VisitDaysSql, _ => new[] { new object?[] { "20260901", "x", 1, 0 } });
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.HistoryGuardSql, _ => new object?[0][]);
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.VisitRowsSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901" } });
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.PatientDaysSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", "x", "20260115" } });
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.PatientDaysSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", 1L } });
            AssertOnlyError(Handle(rig, September), "E-BIT-READ-FAILED");
        }
    }

    // ---- AC-503.4 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-503.4 진단 기록에는 시각·명령 이름·오류 번호만 남고 차트번호·처방코드·숫자는 남지 않는다")]
    public void LogHasOnlyNameAndCode()
    {
        var at = new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.FromHours(9));
        var lines = new List<string>();

        using (var rig = StatsFake.Clinic())
        {
            var log = new List<(string? Cmd, string? Code)>();
            Assemble(Handle(rig, September, log));
            Assert.Equal(new (string?, string?)[] { ("stats.rows", null) }, log);
            lines.AddRange(log.Select(entry => LogLine.Format(at, entry.Cmd, entry.Code)));
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.VisitRowsSql, _ => StatsFake.ManyRows(StatsRows.MaxRows + 1));
            var log = new List<(string? Cmd, string? Code)>();
            Handle(rig, September, log);
            Assert.Equal(new (string?, string?)[] { ("stats.rows", "E-STATS-TOO-BIG") }, log);
            lines.AddRange(log.Select(entry => LogLine.Format(at, entry.Cmd, entry.Code)));
        }

        Assert.Equal(new[]
        {
            "2026-10-30T09:00:00.000+09:00 stats.rows -",
            "2026-10-30T09:00:00.000+09:00 stats.rows E-STATS-TOO-BIG",
        }, lines);
        foreach (var line in lines)
        {
            Assert.DoesNotContain(StatsFake.Chart(1), line);
            Assert.DoesNotContain("MM042", line);
            Assert.DoesNotContain("700001", line);
        }
    }

    [Fact(DisplayName = "AC-503.4 막힌 예외의 글에는 오류 번호만 있다(차트번호·처방코드·숫자·SQL 글 없음)")]
    public void ExceptionCarriesOnlyCode()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.VisitRowsSql, _ => StatsFake.ManyRows(StatsRows.MaxRows + 1));
        var error = Assert.Throws<BitException>(() => StatsRows.Read(rig.Session, Synthetic.Scope, "2026-09-01", "2026-09-30"));
        Assert.Equal("E-STATS-TOO-BIG", error.Code);
        Assert.Equal("E-STATS-TOO-BIG", error.Message);

        rig.Session.Answer(StatsSql.VisitRowsSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", "MM042", "20260115" } });
        rig.Session.Answer(StatsSql.HistoryGuardSql, _ => new[] { new object?[] { 1 } });
        var history = Assert.Throws<BitException>(() => StatsRows.Read(rig.Session, Synthetic.Scope, "2026-09-01", "2026-09-30"));
        Assert.Equal("E-STATS-HISTORY", history.Message);
    }

    [Fact(DisplayName = "AC-503.4 접수 줄에서 막혀도 기록과 예외 글에는 오류 번호만 있다(차트번호·숫자·SQL 글 없음)")]
    public void PatientDaysFailureCarriesOnlyCode()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => StatsFake.ManyPatientDays(StatsRows.MaxRows + 1));
        var tooBig = Assert.Throws<BitException>(() => StatsRows.Read(rig.Session, Synthetic.Scope, "2026-09-01", "2026-09-30"));
        Assert.Equal("E-STATS-TOO-BIG", tooBig.Code);
        Assert.Equal("E-STATS-TOO-BIG", tooBig.Message);

        var log = new List<(string? Cmd, string? Code)>();
        Handle(rig, September, log);
        Assert.Equal(new (string?, string?)[] { ("stats.rows", "E-STATS-TOO-BIG") }, log);

        // 건수 칸의 글자(차트번호를 닮은 값)가 예외 글에 실리지 않는다
        rig.Session.Answer(StatsSql.PatientDaysSql, _ => new[] { new object?[] { StatsFake.Chart(1), "20260901", StatsFake.Chart(2) + "x", "20260115" } });
        var malformed = Assert.Throws<BitException>(() => StatsRows.Read(rig.Session, Synthetic.Scope, "2026-09-01", "2026-09-30"));
        Assert.Equal("E-BIT-READ-FAILED", malformed.Code);
        Assert.Equal("E-BIT-READ-FAILED", malformed.Message);
    }
}
