using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Stats;

/// <summary>
/// AC-504.1 보고 네 벌(일일 to·to−1, 월말 to가 든 달·그 앞 달)을 원본 Load 순서로 읽어 같은 JSON의 report에 싣는다.
/// AC-504.2 · AC-6912.4 (spec bit-total, 도우미 0.13.0) 세 검사 문장을 돌리지 않는다: 환불·변경수납·예치금·연결 중복이 있어도 금액 여섯 칸을 채우고
/// financeUnconfirmed는 늘 거짓, financeUnconfirmedReason 열쇠는 없다. AC-6912.5 금액 안내는 새 글이고 '금액을 자동 집계하지 않았습니다' 안내는 없다.
/// AC-504.3 원본 Fail 자리는 그 벌만 { ok: false, period, reason }, SQL 실패는 명령 전체 error다.
/// AC-504.4 금액은 원 미만을 버린 정수다. 사본 대조·@daily 관문은 StatsSql.test.cs.
/// </summary>
public class StatsReportTests
{
    private const string To = "2026-11-15";
    private const string Range = "{\"from\":\"2026-11-01\",\"to\":\"2026-11-15\"}";

    private static readonly string[] SetKeys =
    {
        "ok", "period", "totalVisits", "newPatients", "returnPatients",
        "totalAmount", "insurerAmount", "noncoveredAmount", "cashAmount", "cardAmount", "transferAmount",
        "treatments", "laCodes", "financeUnconfirmed", "notes",
    };

    private static readonly string[] AmountKeys = { "totalAmount", "insurerAmount", "noncoveredAmount", "cashAmount", "cardAmount", "transferAmount" };

    // 한 벌에 돌리는 순서(원본 Load에서 세 검사만 뺌, spec bit-total AC-6912.4)
    private static readonly string[] OneSet =
    {
        Sql.SnapshotStateSql, StatsSql.HistoryGuardSql, StatsSql.PatientsSql, StatsSql.TreatmentsSql, StatsSql.LaCodesSql,
        StatsSql.FinanceNormalSql, StatsSql.FinanceReceivableSql,
    };

    // 0.12.0까지 금액을 '확인 필요'로 두던 세 검사(spec bit-total AC-6912.4: 이제 부르지 않는다)
    private static readonly string[] Checks = { StatsSql.UnsupportedFinanceSql, StatsSql.FinanceMultiplicitySql, StatsSql.ReceivableMultiplicitySql };

    private const string VisitsNote = "총환은 취소·제외 기록을 뺀 외래 내원 건수입니다. 같은 환자의 추가 접수도 포함합니다.";
    private const string NewNote = "신환은 같은 병원 보유 이력의 유효 외래·입원 첫 내원이 조회 기간에 있는 환자 수이며, 재진은 총내원에서 신환을 뺀 건수입니다. 이관 전·삭제된 과거 기록은 확인할 수 없습니다.";
    private const string DailyTreatmentNote = "일일 치료는 치료별 차트번호 중복을 제거한 환자 수입니다.";
    private const string MonthlyTreatmentNote = "월간 치료는 유효 처방행 수입니다. 동일 환자의 여러 처방을 각각 셉니다.";
    private const string LaNote = "LA 코드는 실제 LA 접두어 코드별 유효 처방행 수입니다. 횟수·수량을 곱한 값이 아닙니다.";
    private const string AmountNote = "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있는 기간도 같은 조건으로 집계해 비트 원본 통계와 다를 수 있습니다.";
    private const string OldAmountNote = "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있으면 금액을 '확인 필요'로 두고 환자수·치료·LA만 집계합니다.";
    private const string PaidNote = "입금액은 선택 기간 정상수납과 미수입금 합계입니다. 현금·카드·계좌 구분을 유지하고 현금영수증 발급 기록·미수발생은 입금액에 중복 반영하지 않습니다. 미수상각은 입금액에서 차감하지 않습니다.";
    private const string PerVisitNote = "건당진료비는 총진료비÷총내원건수로 계산합니다. 원본 통계의 수납액 기준 건당 지표와 다를 수 있습니다.";
    private const string SnapshotNote = "조회는 DB의 기존 스냅샷 격리를 사용했습니다.";
    private const string NoSnapshotNote = "조회시점의 자료입니다. 조회 중 변경된 기록은 다음 조회 결과에 반영될 수 있습니다.";
    private const string PartialNote = "월중 집계: 선택한 달의 1일부터 오늘까지 집계했습니다.";
    private const string UnconfirmedNote = "이 기간은 금액을 자동 집계하지 않았습니다(환자수·치료·LA는 정상). 비트 원본 외래환자경영통계에서 금액을 확인해 직접 입력하세요.";

    private static StatsReportResult Read(Rig rig, string to = To) => StatsReport.Read(rig.Session, Synthetic.Scope, to);

    private static JsonElement ReportJson(Rig rig) =>
        Json.Parse(StatsRowsTests.Assemble(StatsRowsTests.Handle(rig, Range))).GetProperty("report");

    private static IEnumerable<object?[]> One(params object?[] row) => new[] { row };

    private static IEnumerable<object?[]> None() => new object?[0][];

    /// <summary>그 SQL을 받은 부름들의 매개변수 값(이름 순서대로 글자로).</summary>
    private static string[] Windows(Rig rig, string sql, params string[] names) =>
        rig.Session.Calls.Where(call => call.Sql == sql).Select(call => string.Join(" ", names.Select(name => (string?)call.Args[name]))).ToArray();

    private static int CallsOf(Rig rig, string sql) => rig.Session.Calls.Count(call => call.Sql == sql);

    private static long[] Amounts(JsonElement set) => AmountKeys.Select(key => set.GetProperty(key).GetInt64()).ToArray();

    private static long[] Numbers(JsonElement set) =>
        new[] { "totalVisits", "newPatients", "returnPatients" }.Select(key => set.GetProperty(key).GetInt64())
            .Concat(Json.Keys(set.GetProperty("treatments")).Select(key => set.GetProperty("treatments").GetProperty(key).GetInt64()))
            .ToArray();

    private static string[] Notes(JsonElement set) => set.GetProperty("notes").EnumerateArray().Select(note => note.GetString()!).ToArray();

    // ---- AC-504.1 -------------------------------------------------------------------------------

    public static IEnumerable<object[]> Dates() => new[]
    {
        new object[] { "2026-11-15", "2026-11-15", "20261115 20261116", "2026-11-14", "20261114 20261115", "2026-11", "20261101 20261116", "2026-10", "20261001 20261101" },
        new object[] { "2026-11-01", "2026-11-01", "20261101 20261102", "2026-10-31", "20261031 20261101", "2026-11", "20261101 20261102", "2026-10", "20261001 20261101" },
        new object[] { "2027-01-31", "2027-01-31", "20270131 20270201", "2027-01-30", "20270130 20270131", "2027-01", "20270101 20270201", "2026-12", "20261201 20270101" },
        new object[] { "2024-03-01", "2024-03-01", "20240301 20240302", "2024-02-29", "20240229 20240301", "2024-03", "20240301 20240302", "2024-02", "20240201 20240301" },
    };

    [Theory(DisplayName = "AC-504.1 네 벌의 기간: 일일 to·to−1, 월말 to가 든 달(1일 ~ to 다음 날 0시)·그 앞 달 전체")]
    [MemberData(nameof(Dates))]
    public void FourPeriods(string to, string d0, string d0Days, string d1, string d1Days, string m0, string m0Days, string m1, string m1Days)
    {
        using var rig = StatsFake.Clinic();
        var result = Read(rig, to);

        Assert.Equal(new[] { d0, d1 }, result.Daily.Select(set => set.Period));
        Assert.Equal(new[] { m0, m1 }, result.Monthly.Select(set => set.Period));

        var days = new[] { d0Days, d1Days, m0Days, m1Days };
        Assert.Equal(days, Windows(rig, StatsSql.FinanceNormalSql, "@day", "@nextDay"));
        Assert.Equal(days.Select(window =>
        {
            var pair = window.Split(' ');
            return pair[0] + "0000 " + pair[1] + "0000";
        }), Windows(rig, StatsSql.PatientsSql, "@from", "@to"));
        Assert.All(rig.Session.Calls.Where(call => call.Args.ContainsKey("@hospital")), call => Assert.Equal(Synthetic.Scope, call.Args["@hospital"]));
    }

    [Fact(DisplayName = "AC-504.1 @daily는 치료 SQL에 일일 '1'·월말 '0'으로 간다")]
    public void DailyFlag()
    {
        using var rig = StatsFake.Clinic();
        Read(rig);
        Assert.Equal(new[] { "1", "1", "0", "0" }, Windows(rig, StatsSql.TreatmentsSql, "@daily"));
    }

    [Fact(DisplayName = "AC-504.1 AC-6912.4 한 벌은 스냅숏 → HistoryGuard → Patients → Treatments → LaCodes → FinanceNormal → FinanceReceivable 차례로 읽는다(메타 15초, 자료 150초), 네 벌 모두, 세 검사 문장 없음")]
    public void LoadOrder()
    {
        using var rig = StatsFake.Clinic();
        Read(rig);

        Assert.Equal(Enumerable.Repeat(OneSet, 4).SelectMany(sql => sql), rig.Session.Sqls);
        Assert.DoesNotContain(rig.Session.Sqls, Checks.Contains);
        foreach (var call in rig.Session.Calls)
        {
            var meta = call.Sql == Sql.SnapshotStateSql || call.Sql == StatsSql.HistoryGuardSql;
            Assert.Equal(meta ? Sql.MetaTimeout : StatsSql.DataTimeout, call.Timeout);
        }
    }

    [Fact(DisplayName = "AC-504.1 stats.rows는 진료 줄 뒤에 보고 네 벌을 읽어 같은 JSON에 칸 목록 그대로 싣는다(이름·전화 없음)")]
    public void JsonShape()
    {
        using var rig = StatsFake.Clinic();
        var json = StatsRowsTests.Assemble(StatsRowsTests.Handle(rig, Range));
        var root = Json.Parse(json);
        var report = root.GetProperty("report");

        Assert.Equal(new[] { "2026-11-15", "2026-11-14" }, report.GetProperty("daily").EnumerateArray().Select(set => set.GetProperty("period").GetString()));
        Assert.Equal(new[] { "2026-11", "2026-10" }, report.GetProperty("monthly").EnumerateArray().Select(set => set.GetProperty("period").GetString()));

        foreach (var set in report.GetProperty("daily").EnumerateArray().Concat(report.GetProperty("monthly").EnumerateArray()))
        {
            Assert.Equal(SetKeys, Json.Keys(set));
            Assert.True(set.GetProperty("ok").GetBoolean());
            Assert.Equal(12, set.GetProperty("totalVisits").GetInt64());
            Assert.Equal(3, set.GetProperty("newPatients").GetInt64());
            Assert.Equal(9, set.GetProperty("returnPatients").GetInt64());
            Assert.Equal(new long[] { 101000, 60600, 30300, 10100, 20200, 5050 }, Amounts(set));

            var treatments = set.GetProperty("treatments");
            Assert.Equal(new[] { "manual", "eswt", "carm", "sono", "cryo" }, Json.Keys(treatments));
            Assert.Equal(new long[] { 5, 4, 3, 2, 1 }, Json.Keys(treatments).Select(key => treatments.GetProperty(key).GetInt64()));

            var codes = set.GetProperty("laCodes").EnumerateArray().ToArray();
            Assert.All(codes, code => Assert.Equal(new[] { "code", "count" }, Json.Keys(code)));
            Assert.Equal(new[] { "LA01", "LA-B.2" }, codes.Select(code => code.GetProperty("code").GetString()));
            Assert.Equal(new long[] { 2, 1 }, codes.Select(code => code.GetProperty("count").GetInt64()));

            Assert.False(set.GetProperty("financeUnconfirmed").GetBoolean());
        }

        Assert.DoesNotContain(Fake.Name, json);
        Assert.DoesNotContain(Fake.Phone, json);
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-504.1 치료는 원본처럼 이름으로 다섯 칸에 넣고 모르는 이름은 버리며 없는 치료는 0이다")]
    public void TreatmentKeys()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.TreatmentsSql, _ => new[]
        {
            new object?[] { "cryo", 7L, 0L },
            new object?[] { "other", 99L, 0L },
            new object?[] { "manual", null, null },
        });
        var treatments = Read(rig).Daily[0].Treatments;
        Assert.Equal(new long[] { 0, 0, 0, 0, 7 }, new[] { treatments.Manual, treatments.Eswt, treatments.Carm, treatments.Sono, treatments.Cryo });
    }

    [Fact(DisplayName = "AC-6912.5 AC-504.1 안내 글은 원본 결과 그대로이고 금액 안내만 새 글('… 연결 중복이 있는 기간도 같은 조건으로 집계해 비트 원본 통계와 다를 수 있습니다.'), '금액을 자동 집계하지 않았습니다' 글은 없다: 일일·월말 글이 다르고, 달 중간까지면 월중 글이 붙고, 스냅숏이면 스냅숏 글이다")]
    public void OriginalNotes()
    {
        string[] Expected(string treatment, string snapshot, params string[] more) =>
            new[] { VisitsNote, NewNote, treatment, LaNote, AmountNote, PaidNote, PerVisitNote, snapshot }.Concat(more).ToArray();

        using (var rig = StatsFake.Clinic())
        {
            var result = Read(rig);
            Assert.Equal(Expected(DailyTreatmentNote, NoSnapshotNote), result.Daily[0].Notes);
            Assert.Equal(Expected(DailyTreatmentNote, NoSnapshotNote), result.Daily[1].Notes);
            Assert.Equal(Expected(MonthlyTreatmentNote, NoSnapshotNote, PartialNote), result.Monthly[0].Notes);
            Assert.Equal(Expected(MonthlyTreatmentNote, NoSnapshotNote), result.Monthly[1].Notes);
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(Sql.SnapshotStateSql, _ => One((byte)1));
            var result = Read(rig, "2026-11-30");
            Assert.Equal(Expected(DailyTreatmentNote, SnapshotNote), result.Daily[0].Notes);
            // 달 마지막 날까지면 월중이 아니다
            Assert.Equal(Expected(MonthlyTreatmentNote, SnapshotNote), result.Monthly[0].Notes);
        }
        using (var rig = StatsFake.Clinic())
        {
            var result = Read(rig);
            Assert.All(result.Daily.Concat(result.Monthly), set =>
            {
                Assert.DoesNotContain(OldAmountNote, set.Notes);
                Assert.DoesNotContain(UnconfirmedNote, set.Notes);
                Assert.Single(set.Notes, note => note == AmountNote);
            });
        }
    }

    [Fact(DisplayName = "AC-6912.6 도우미 판은 0.13.1이고 stats.rows 보고 벌의 칸 이름은 그대로다(새 칸 없음, financeUnconfirmed 칸은 남고 financeUnconfirmedReason 열쇠는 없음)")]
    public void VersionAndReportKeysStay()
    {
        Assert.Equal("0.13.1", HelperVersion.Value);
        using var rig = StatsFake.Clinic();
        var report = ReportJson(rig);
        Assert.Equal(new[] { "daily", "monthly" }, Json.Keys(report));
        foreach (var set in report.GetProperty("daily").EnumerateArray().Concat(report.GetProperty("monthly").EnumerateArray()))
        {
            Assert.Equal(SetKeys, Json.Keys(set));
        }
    }

    // ---- AC-504.2 · AC-6912.4 · AC-6912.5 (spec bit-total, 도우미 0.13.0) --------------------------------------------

    /// <summary>금액이 채워진 확인된 벌: financeUnconfirmed 거짓, 사유 열쇠 없음, 금액 여섯 칸, 환자·치료·LA 그대로, 안내에 옛 글 없음.</summary>
    private static void AssertConfirmed(JsonElement set)
    {
        Assert.True(set.GetProperty("ok").GetBoolean());
        Assert.Equal(SetKeys, Json.Keys(set));
        Assert.False(set.GetProperty("financeUnconfirmed").GetBoolean());
        Assert.False(set.TryGetProperty("financeUnconfirmedReason", out _));
        Assert.Equal(new long[] { 101000, 60600, 30300, 10100, 20200, 5050 }, Amounts(set));
        Assert.Equal(new long[] { 12, 3, 9, 5, 4, 3, 2, 1 }, Numbers(set));
        Assert.Equal(2, set.GetProperty("laCodes").GetArrayLength());
        Assert.Contains(AmountNote, Notes(set));
        Assert.DoesNotContain(OldAmountNote, Notes(set));
        Assert.DoesNotContain(UnconfirmedNote, Notes(set));
    }

    public static IEnumerable<object[]> CaughtChecks() => new[]
    {
        new object[] { "환불·변경수납·예치금(UnsupportedFinance)", new[] { 0 } },
        new object[] { "정상수납 연결 중복(FinanceMultiplicity)", new[] { 1 } },
        new object[] { "미수입금 연결 중복(ReceivableMultiplicity)", new[] { 2 } },
        new object[] { "셋 다", new[] { 0, 1, 2 } },
    };

    [Theory(DisplayName = "AC-6912.4 AC-504.2 AC-6912.5 환불·변경수납·예치금·연결 중복이 있어도(가짜 DB가 세 검사에 1을 답해도) 세 검사 문장을 돌리지 않고 네 벌 모두 금액 여섯 칸을 채운다, financeUnconfirmed 거짓·financeUnconfirmedReason 열쇠 없음, 안내는 새 금액 글")]
    [MemberData(nameof(CaughtChecks))]
    public void CaughtPeriodsStillReadMoney(string what, int[] caught)
    {
        Assert.NotEmpty(what);
        using var rig = StatsFake.Clinic();
        foreach (var check in caught) rig.Session.Answer(Checks[check], _ => One(1L));
        var report = ReportJson(rig);

        foreach (var set in report.GetProperty("daily").EnumerateArray().Concat(report.GetProperty("monthly").EnumerateArray())) AssertConfirmed(set);
        Assert.DoesNotContain(rig.Session.Sqls, Checks.Contains);
        Assert.Equal(4, CallsOf(rig, StatsSql.FinanceNormalSql));
        Assert.Equal(4, CallsOf(rig, StatsSql.FinanceReceivableSql));
    }

    [Fact(DisplayName = "AC-504.2 AC-6912.4 세 검사 문장에 답이 없어도(부르면 읽기 실패) 보고를 끝까지 읽는다: FinanceUnconfirmed 거짓·사유 null, 금액은 FinanceNormal → FinanceReceivable 합(음수 그대로)")]
    public void ChecksAreNeverAsked()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.FinanceNormalSql, _ => One(-129629.535m, 1000m, 0m, -1m, 0m, 0m));
        rig.Session.Answer(StatsSql.FinanceReceivableSql, _ => One(100m, 0.5m, 0m, 0m, 0m, 0m));
        var result = Read(rig);

        Assert.All(result.Daily.Concat(result.Monthly), set =>
        {
            Assert.True(set.Ok);
            Assert.False(set.FinanceUnconfirmed);
            Assert.Null(set.FinanceUnconfirmedReason);
            Assert.Equal(-129529L, set.TotalAmount);
            Assert.Equal(1000L, set.InsurerAmount);
            Assert.Equal(-1L, set.CashAmount);
        });
        Assert.DoesNotContain(rig.Session.Sqls, Checks.Contains);
    }

    // ---- AC-504.3 -------------------------------------------------------------------------------

    public static IEnumerable<object[]> BadPatients() => new[]
    {
        new object[] { new object?[] { 10L, 2L, 1L, 0L, 0L } }, // 차트번호 없는 내원
        new object[] { new object?[] { 10L, 2L, 0L, 1L, 0L } }, // 중복 내원
        new object[] { new object?[] { 10L, 2L, 0L, 0L, 1L } }, // 첫 내원 못 찾음
        new object[] { new object?[] { 2L, 3L, 0L, 0L, 0L } },  // 재진이 음수
    };

    private static void AssertOnlyThisSetFailed(Rig rig, string reason)
    {
        var root = Json.Parse(StatsRowsTests.Assemble(StatsRowsTests.Handle(rig, Range)));
        var report = root.GetProperty("report");
        var failed = report.GetProperty("daily")[1];
        Assert.Equal(new[] { "ok", "period", "reason" }, Json.Keys(failed));
        Assert.False(failed.GetProperty("ok").GetBoolean());
        Assert.Equal("2026-11-14", failed.GetProperty("period").GetString());
        Assert.Equal(reason, failed.GetProperty("reason").GetString());

        foreach (var set in new[] { report.GetProperty("daily")[0], report.GetProperty("monthly")[0], report.GetProperty("monthly")[1] })
        {
            Assert.True(set.GetProperty("ok").GetBoolean());
            Assert.Equal(new long[] { 12, 3, 9, 5, 4, 3, 2, 1 }, Numbers(set));
        }
        Assert.Equal(5, root.GetProperty("rows").GetArrayLength());
    }

    [Theory(DisplayName = "AC-504.3 내원 누락·중복, 재진 음수면 그 벌만 ok:false invalid_aggregate이고 다른 벌과 진료 줄은 그대로다(그 벌의 뒤 SQL은 돌리지 않는다)")]
    [MemberData(nameof(BadPatients))]
    public void BadVisitsFailOnlyThatSet(object?[] row)
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientsSql, args => (string?)args["@from"] == "202611140000" ? One(row) : One(12L, 3L, 0L, 0L, 0L));

        AssertOnlyThisSetFailed(rig, "invalid_aggregate");
        Assert.Equal(3, CallsOf(rig, StatsSql.TreatmentsSql));
        Assert.Equal(3, CallsOf(rig, StatsSql.FinanceNormalSql));
    }

    [Fact(DisplayName = "AC-504.3 내원 집계가 한 줄도 없으면 그 벌만 invalid_aggregate다")]
    public void NoVisitRow()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.PatientsSql, args => (string?)args["@from"] == "202611140000" ? None() : One(12L, 3L, 0L, 0L, 0L));
        AssertOnlyThisSetFailed(rig, "invalid_aggregate");
    }

    [Fact(DisplayName = "AC-504.3 치료를 환자에 연결하지 못하면 그 벌만 invalid_aggregate다(모르는 치료 이름의 줄이어도)")]
    public void BadTreatmentLink()
    {
        using var rig = StatsFake.Clinic();
        var good = new[]
        {
            new object?[] { "manual", 5L, 0L }, new object?[] { "eswt", 4L, 0L }, new object?[] { "carm", 3L, 0L },
            new object?[] { "sono", 2L, 0L }, new object?[] { "cryo", 1L, 0L },
        };
        rig.Session.Answer(StatsSql.TreatmentsSql, args => (string?)args["@from"] == "202611140000" ? good.Append(new object?[] { "other", 1L, 1L }) : good);
        AssertOnlyThisSetFailed(rig, "invalid_aggregate");
        Assert.Equal(3, CallsOf(rig, StatsSql.LaCodesSql));
    }

    [Theory(DisplayName = "AC-504.3 LA 코드 모양이 틀리면 그 벌만 원본 이유 code_limit이다")]
    [InlineData("la01")]
    [InlineData("XA01")]
    [InlineData("LA 01")]
    [InlineData("LA0123456789012345678901234567890")] // LA 뒤 31자
    public void BadLaCode(string code)
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.LaCodesSql, args => (string?)args["@from"] == "202611140000" ? One(code, 1L) : One("LA01", 2L));
        AssertOnlyThisSetFailed(rig, "code_limit");
    }

    [Fact(DisplayName = "AC-504.3 LA 코드는 500개까지만: 501개면 code_limit, 500개와 LA 뒤 30자는 받는다")]
    public void LaCodeLimit()
    {
        IEnumerable<object?[]> Codes(int n) => Enumerable.Range(0, n).Select(i => new object?[] { "LA" + i, 1L }).ToArray();

        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.LaCodesSql, _ => Codes(501));
            var result = Read(rig);
            Assert.All(result.Daily.Concat(result.Monthly), set => Assert.Equal("code_limit", set.Reason));
        }
        using (var rig = StatsFake.Clinic())
        {
            rig.Session.Answer(StatsSql.LaCodesSql, _ => Codes(500));
            var result = Read(rig);
            Assert.True(result.Daily[0].Ok);
            Assert.Equal(500, result.Daily[0].LaCodes.Count);
        }
        using (var rig = StatsFake.Clinic())
        {
            var longest = "LA" + new string('Z', 30);
            rig.Session.Answer(StatsSql.LaCodesSql, _ => One(longest, 1L));
            Assert.Equal(longest, Read(rig).Daily[0].LaCodes.Single().Code);
        }
    }

    [Fact(DisplayName = "AC-504.3 벌 안의 과거 이관 자료 확인이 1이면 그 벌은 원본 이유 history_unsupported다")]
    public void HistoryInSet()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.HistoryGuardSql, _ => One(1));
        var result = Read(rig);
        Assert.All(result.Daily.Concat(result.Monthly), set =>
        {
            Assert.False(set.Ok);
            Assert.Equal("history_unsupported", set.Reason);
        });
        Assert.Equal(0, CallsOf(rig, StatsSql.PatientsSql));
    }

    public static IEnumerable<object[]> ReportSqls() => OneSet.Select(sql => new object[] { sql });

    [Theory(DisplayName = "AC-504.3 보고 SQL이 실패하면 그 벌이 아니라 명령 전체 E-BIT-READ-FAILED만(반쪽 자료 없음)")]
    [MemberData(nameof(ReportSqls))]
    public void SqlFailureIsWholeError(string sql)
    {
        using var rig = StatsFake.Clinic();
        if (sql == StatsSql.HistoryGuardSql)
        {
            // 진료 줄 앞의 확인은 지나고, 보고 벌 안의 확인에서 실패
            var calls = 0;
            rig.Session.Answer(sql, _ => ++calls == 1 ? One(0) : throw new BitException(BitErrors.ReadFailed));
        }
        else
        {
            rig.Session.Fail(sql, BitErrors.ReadFailed);
        }
        StatsRowsTests.AssertOnlyError(StatsRowsTests.Handle(rig, Range), "E-BIT-READ-FAILED");
        Assert.Equal(1, rig.Session.Disposed);
    }

    [Fact(DisplayName = "AC-504.3 마지막 벌의 SQL만 실패해도 명령 전체 E-BIT-READ-FAILED만")]
    public void LastSetSqlFailure()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.FinanceReceivableSql, args =>
            (string?)args["@day"] == "20261001" ? throw new BitException(BitErrors.ReadFailed) : One(0m, 0m, 0m, 0m, 0m, 0m));
        StatsRowsTests.AssertOnlyError(StatsRowsTests.Handle(rig, Range), "E-BIT-READ-FAILED");
    }

    public static IEnumerable<object[]> Malformed() => new[]
    {
        new object[] { StatsSql.PatientsSql, new object?[] { "x", 0L, 0L, 0L, 0L } },
        new object[] { StatsSql.PatientsSql, new object?[] { 1L, 0L } },
        new object[] { StatsSql.TreatmentsSql, new object?[] { null, 1L, 0L } },
        new object[] { StatsSql.TreatmentsSql, new object?[] { 7, 1L, 0L } },
        new object[] { StatsSql.TreatmentsSql, new object?[] { "manual", "x", 0L } },
        new object[] { StatsSql.LaCodesSql, new object?[] { null, 1L } },
        new object[] { StatsSql.LaCodesSql, new object?[] { "LA01", "x" } },
        new object[] { StatsSql.FinanceNormalSql, new object?[] { "x", 0m, 0m, 0m, 0m, 0m } },
        new object[] { StatsSql.FinanceNormalSql, new object?[] { 1m, 0m } },
        new object[] { StatsSql.FinanceReceivableSql, new object?[] { decimal.MaxValue, 0m, 0m, 0m, 0m, 0m } }, // 더하면 넘침
        new object[] { StatsSql.FinanceReceivableSql, new object?[] { 100000000000000000000m, 0m, 0m, 0m, 0m, 0m } }, // long에 안 들어감
    };

    [Theory(DisplayName = "AC-504.3 SQL 답의 값 모양이 틀리면(원본 query_failed 자리) 도우미를 멈추지 않고 번호뿐인 E-BIT-READ-FAILED다")]
    [MemberData(nameof(Malformed))]
    public void MalformedValues(string sql, object?[] row)
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(sql, _ => One(row));
        var error = Assert.Throws<BitException>(() => Read(rig));
        Assert.Equal("E-BIT-READ-FAILED", error.Code);
        Assert.Equal("E-BIT-READ-FAILED", error.Message);
    }

    [Theory(DisplayName = "AC-504.3 앞 달·다음 날을 셀 수 없는 날짜·틀린 날짜는 E-HELPER-BAD-MESSAGE다(도우미를 멈추지 않음)")]
    [InlineData("2026-13-01")]
    [InlineData("0001-01-15")]
    [InlineData("9999-12-15")]
    [InlineData("9999-12-31")]
    public void BadDates(string to)
    {
        using var rig = StatsFake.Clinic();
        var error = Assert.Throws<HelperException>(() => Read(rig, to));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(rig.Session.Calls);
    }

    // ---- AC-504.4 -------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-504.4 금액은 원 미만을 버린 정수다(129,629.535 → 129,629, 반올림 없음, 두 SQL을 원본처럼 decimal로 더한 뒤 칸마다 버림, NULL은 0)")]
    public void AmountsAreWholeWon()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.FinanceNormalSql, _ => new[]
        {
            new object?[] { 129629.535m, 100.999m, 0.999m, 1m, null, 2.5m },
        });
        rig.Session.Answer(StatsSql.FinanceReceivableSql, _ => new[]
        {
            new object?[] { null, 0.5m, 0.999m, 0m, 7m, 0.5m },
        });
        var report = ReportJson(rig);
        var set = report.GetProperty("daily")[0];

        Assert.Equal(new long[] { 129629, 101, 1, 1, 7, 3 }, Amounts(set));
        Assert.Equal("129629", set.GetProperty("totalAmount").GetRawText());
    }

    [Fact(DisplayName = "AC-504.4 음수 금액도 원 미만만 버린다(-129,629.535 → -129,629, -0.5 → 0, 음수는 원본처럼 그대로 보낸다)")]
    public void NegativeAmountsDropOnlyTheFraction()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.FinanceNormalSql, _ => new[]
        {
            new object?[] { -129629.535m, -0.5m, -0.999m, -1m, 0.5m, -2.5m },
        });
        rig.Session.Answer(StatsSql.FinanceReceivableSql, _ => None());
        var set = ReportJson(rig).GetProperty("daily")[0];

        Assert.Equal(new long[] { -129629, 0, 0, -1, 0, -2 }, Amounts(set));
        Assert.Equal("-129629", set.GetProperty("totalAmount").GetRawText());
        Assert.Equal("0", set.GetProperty("insurerAmount").GetRawText());
    }

    [Fact(DisplayName = "AC-504.4 금액 SQL의 여러 줄은 원본 AccumulateFinance처럼 다 더한다")]
    public void AmountsAddAllRows()
    {
        using var rig = StatsFake.Clinic();
        rig.Session.Answer(StatsSql.FinanceNormalSql, _ => new[]
        {
            new object?[] { 10.4m, 0m, 0m, 0m, 0m, 0m },
            new object?[] { 10.7m, 1m, 0m, 0m, 0m, 0m },
        });
        rig.Session.Answer(StatsSql.FinanceReceivableSql, _ => None());
        var set = Read(rig).Daily[0];
        Assert.Equal(21, set.TotalAmount);
        Assert.Equal(1, set.InsurerAmount);
    }
}
