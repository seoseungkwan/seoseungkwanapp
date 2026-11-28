using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// claim.month(TASK-8). AC-008.1: 등록 병원 확인 → 83·83D·47 표 → 12개월 이력 → 상병 추세 → 처방 목록을 모두 읽은 뒤
/// JSON 하나로 만들어 chunk … end로 보낸다. AC-008.4: 하나라도 실패하면 error 하나만(end 없음, 반쪽 자료 없음).
/// 가짜 IBitDb·가짜 통계 화면으로 돈다(ClaimRig).
/// </summary>
public class ClaimMonthTests
{
    private static string[] Strings(JsonElement array) => array.EnumerateArray().Select(e => e.GetString()!).ToArray();

    /// <summary>
    /// 가짜 한 달 자료(ClaimRig) + 진료의 답(claim-learn AC-9317.1): claim.month는 처방 목록 뒤에 통계 접수 줄(StatsSql.VisitLinesSql)과
    /// 원장님 이름(StatsSql.DoctorNamesSql)을 부른다. 모두 지어낸 값이다(차트번호 9로 시작, 진료의 코드 D01·D02, 이름 '가상원장(가짜)').
    /// 접수 줄 칸: 차트번호|null, 진료일 yyyyMMdd, 접수 시각, 보험 이름, 진료의 코드|null.
    /// </summary>
    private static ClaimRig NewRig(int visits = 3, bool registered = true)
    {
        var rig = new ClaimRig(visits, registered);
        rig.Db.Answer(StatsSql.VisitLinesSql, _ => new[]
        {
            new object?[] { "900001", "20261001", "0930", "가상보험", "D01" },
            new object?[] { "900001", "20261001", "1400", "가상보험", "D01 " },   // 같은 날 두 번 접수, 같은 진료의(한 줄로)
            new object?[] { "900001", "20261001", "1500", "가상보험", "D02" },    // 같은 날 다른 진료의
            new object?[] { "900002", "20261002", "1000", null, null },          // 진료의 모름
            new object?[] { null, "20261003", "1100", "가상보험", "D02" },        // 차트번호 없는 접수는 뺀다
            new object?[] { "900003", "20261031", "0905", "가상보험", "D02" },
        });
        rig.Db.Answer(StatsSql.DoctorNamesSql, _ => new[]
        {
            new object?[] { "D01", "가상원장일(가짜)", "20201231" },
            new object?[] { "D01", "가상원장(가짜) ", "99991231" },  // 코드마다 가장 늦은 줄의 이름(통계와 같다)
            new object?[] { "D02", "", "99991231" },               // 이름이 비면 null
        });
        return rig;
    }

    [Fact(DisplayName = "AC-9317.1 claim.month 답 맨 위 끝에 visitDoctors [[차트번호, 진료일, 진료의 코드|null]]·doctors [[코드, 이름|null]]를 더한다(지금 칸·차례 그대로)")]
    public void AddsVisitDoctors()
    {
        using var rig = NewRig();
        var json = Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31"));

        Assert.Equal(new[] { "version", "period", "historyRange", "trendRange", "counts", "s83", "s83d", "s47", "history", "historyStats", "dxTrend", "catalog", "visitDoctors", "doctors" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("version").GetInt32());

        var visits = json.GetProperty("visitDoctors").EnumerateArray().Select(row => row.EnumerateArray().Select(cell => cell.ValueKind == JsonValueKind.Null ? null : cell.GetString()).ToArray()).ToArray();
        Assert.Equal(new[]
        {
            new[] { "900001", "2026-10-01", "D01" },
            new[] { "900001", "2026-10-01", "D02" },
            new[] { "900002", "2026-10-02", null },
            new[] { "900003", "2026-10-31", "D02" },
        }, visits);

        var doctors = json.GetProperty("doctors").EnumerateArray().Select(row => row.EnumerateArray().Select(cell => cell.ValueKind == JsonValueKind.Null ? null : cell.GetString()).ToArray()).ToArray();
        Assert.Equal(new[] { new[] { "D01", "가상원장(가짜)" }, new[] { "D02", null } }, doctors);

        // 접수 시각·보험 이름은 싣지 않는다(진료의만)
        var text = json.GetRawText();
        Assert.DoesNotContain("가상보험", text, StringComparison.Ordinal);
        Assert.DoesNotContain("0930", text, StringComparison.Ordinal);
        Assert.DoesNotContain("가상원장일", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-9317.1 진료의는 처방 목록 뒤에 통계 StatsSql.VisitLinesSql·DoctorNamesSql을 그대로(같은 매개변수·150초) 부르고, 새 SQL은 없다")]
    public void ReadsDoctorsWithStatsSql()
    {
        using var rig = NewRig();
        Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-30", "2026-11-02"));

        var sqls = rig.Db.Sqls.ToList();
        Assert.Equal(new[] { Sql.LaCatalogSql, StatsSql.VisitLinesSql, StatsSql.DoctorNamesSql }, sqls.Skip(sqls.Count - 3));
        Assert.All(sqls, sql => Assert.True(Sql.IsAllowed(sql)));
        Assert.Contains(StatsSql.VisitLinesSql, StatsSql.Sections);
        Assert.Contains(StatsSql.DoctorNamesSql, StatsSql.Sections);

        // 통계 StatsExtra.Read와 같은 매개변수: 끝은 마지막 날의 다음 날 0시(반열린 기간), 범위는 등록 병원
        var lines = rig.Db.Calls.Single(call => call.Sql == StatsSql.VisitLinesSql);
        Assert.Equal(new[] { "@from", "@hospital", "@to" }, lines.Args.Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal("202610300000", lines.Args["@from"]);
        Assert.Equal("202611030000", lines.Args["@to"]);
        Assert.Equal(Synthetic.Scope, lines.Args["@hospital"]);
        Assert.Equal(StatsSql.DataTimeout, lines.Timeout);

        // 원장님 이름은 그 기간 접수에 나온 진료의만, 50자리(빈 자리는 첫 코드)
        var names = rig.Db.Calls.Single(call => call.Sql == StatsSql.DoctorNamesSql);
        Assert.Equal(StatsSql.DoctorCodeSlots, names.Args.Count);
        Assert.Equal("D01", names.Args["@d0"]);
        Assert.Equal("D02", names.Args["@d1"]);
        Assert.Equal("D01", names.Args["@d49"]);
        Assert.Equal(StatsSql.DataTimeout, names.Timeout);
    }

    [Fact(DisplayName = "AC-9317.1 그 기간 진료의가 하나도 없으면 원장님 이름 SQL을 부르지 않고 doctors는 빈 배열이다")]
    public void NoDoctorsNoNames()
    {
        using var rig = NewRig();
        rig.Db.Answer(StatsSql.VisitLinesSql, _ => new[] { new object?[] { "900001", "20261001", "0930", "가상보험", " " } });
        var json = Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31"));

        Assert.Equal(1, json.GetProperty("visitDoctors").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("visitDoctors")[0][2].ValueKind);
        Assert.Equal(0, json.GetProperty("doctors").GetArrayLength());
        Assert.DoesNotContain(StatsSql.DoctorNamesSql, rig.Db.Sqls);
    }

    [Theory(DisplayName = "AC-9317.1 AC-008.4 진료의 SQL이 실패·시간 초과면 지금처럼 error 하나만(chunk·end 없음)")]
    [InlineData(true)]
    [InlineData(false)]
    public void DoctorSqlFailureSendsOnlyError(bool lines)
    {
        using var rig = NewRig();
        rig.Db.Fail(lines ? StatsSql.VisitLinesSql : StatsSql.DoctorNamesSql, "E-BIT-READ-FAILED");
        Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Theory(DisplayName = "AC-9317.1 접수 줄 모양이 틀리면(진료일이 날짜 아님·진료의 코드 40자 넘음) E-BIT-READ-FAILED 하나만")]
    [InlineData("2026-10-01", "D01")]
    [InlineData("20261301", "D01")]
    [InlineData("20261001", "D0123456789012345678901234567890123456789")]
    public void BadVisitLineSendsOnlyError(string day, string doctor)
    {
        using var rig = NewRig();
        rig.Db.Answer(StatsSql.VisitLinesSql, _ => new[] { new object?[] { "900001", day, "0930", "가상보험", doctor } });
        Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
    }

    [Fact(DisplayName = "AC-008.1 claim.month: 조각을 이으면 JSON 하나 {version, period, historyRange(시작 365일 전~끝), trendRange, counts, s83, s83d, s47, history, dxTrend, catalog}")]
    public void BuildsOnePayload()
    {
        using var rig = NewRig();
        var json = Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31"));

        // claim-learn AC-9317.1: 지금 칸·차례 뒤 맨 끝에 진료의 두 칸(visitDoctors·doctors)이 더해진다
        Assert.Equal(new[] { "version", "period", "historyRange", "trendRange", "counts", "s83", "s83d", "s47", "history", "historyStats", "dxTrend", "catalog", "visitDoctors", "doctors" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("version").GetInt32());
        Assert.Equal("2026-10-01", json.GetProperty("period").GetProperty("from").GetString());
        Assert.Equal("2026-10-31", json.GetProperty("period").GetProperty("to").GetString());
        Assert.Equal("2025-10-01", json.GetProperty("historyRange").GetProperty("from").GetString());
        Assert.Equal("2026-10-31", json.GetProperty("historyRange").GetProperty("to").GetString());
        // 상병 추세는 원본 buildTrend처럼 오늘 364일 전~오늘(가짜 오늘 2026-10-30)
        Assert.Equal("2025-10-31", json.GetProperty("trendRange").GetProperty("from").GetString());
        Assert.Equal("2026-10-30", json.GetProperty("trendRange").GetProperty("to").GetString());

        var counts = json.GetProperty("counts");
        Assert.Equal(new[] { "s83", "s83d", "s47", "history" }, Json.Keys(counts));
        foreach (var key in new[] { "s83", "s83d", "s47", "history" })
        {
            Assert.Equal(3, counts.GetProperty(key).GetInt32());
            Assert.Equal(counts.GetProperty(key).GetInt32(), json.GetProperty(key).GetArrayLength());
        }

        var s83 = json.GetProperty("s83")[0];
        Assert.Equal(new[] { "내원번호", "차트번호", "환자명", "증상", "기록날짜" }, Json.Keys(s83));
        Assert.Equal("V1", s83.GetProperty("내원번호").GetString());
        Assert.Equal("900001", s83.GetProperty("차트번호").GetString());
        Assert.Equal("가상환자01", s83.GetProperty("환자명").GetString());
        Assert.Equal(new[] { "내원번호", "차트번호", "상병청구코드", "상병명칭", "주상병여부", "산정특례기호", "과목코드", "진단일자" }, Json.Keys(json.GetProperty("s83d")[0]));
        Assert.Equal(new[] { "처방코드", "처방명칭", "차트번호", "처방일자", "급여구분", "수량" }, Json.Keys(json.GetProperty("s47")[0]));

        var history = json.GetProperty("history")[0];
        Assert.Equal(new[] { "v", "p", "d", "c", "m" }, Json.Keys(history));
        Assert.Equal("H1", history.GetProperty("v").GetString());
        Assert.Equal("900001", history.GetProperty("p").GetString());
        Assert.Equal("2026-09-15", history.GetProperty("d").GetString());
        Assert.Equal(new[] { "LA221" }, Strings(history.GetProperty("c")));
        Assert.Equal("지난 메모(가짜)\n둘째 줄", history.GetProperty("m").GetString());

        var trend = json.GetProperty("dxTrend");
        Assert.Equal(10, trend.GetProperty("visits").GetInt64());
        var code = trend.GetProperty("codes")[0];
        Assert.Equal("LA221", code.GetProperty("c").GetString());
        Assert.Equal(8, code.GetProperty("n").GetInt64());
        var dx = code.GetProperty("d")[0];
        Assert.Equal(new[] { "c", "nm", "m", "s", "x", "l" }, Json.Keys(dx));
        Assert.Equal("M5456", dx.GetProperty("c").GetString());
        Assert.Equal(100, dx.GetProperty("l").GetInt32());     // (6+2+0)×100×1 ÷ (8×1)
        Assert.Equal(0, trend.GetProperty("suggestions").GetArrayLength());

        var catalog = json.GetProperty("catalog");
        var rx = catalog.GetProperty("codes")[0];
        Assert.Equal(new[] { "code", "name", "kind", "active", "standardCode" }, Json.Keys(rx));
        Assert.Equal("procedure", rx.GetProperty("kind").GetString());
        var la = catalog.GetProperty("la")[0];
        Assert.Equal(new[] { "code", "name", "active" }, Json.Keys(la));
        Assert.True(la.GetProperty("active").GetBoolean());
    }

    [Fact(DisplayName = "AC-008.1 원본이 읽지 않는 칸(주민번호·전화·주소·금액·진료의)은 JSON 어디에도 없다")]
    public void DropsUnreadColumns()
    {
        using var rig = NewRig();
        var replies = Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31");
        var text = Dispatch.Join(replies).GetRawText();
        foreach (var dropped in new[] { "000000-0000000", "010-0000-", "가상시 가상동", "12,340", "주민번호", "전화번호", "진료의", "금액", "주소" })
        {
            Assert.DoesNotContain(dropped, text, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-008.1 AC-005.15 순서: 등록 병원 확인 → 로그인 사용자 범위·통계 권한 → 83·83D·47 표 → 이력 → 상병 추세 → 처방 목록(매개변수·시간 제한은 원본 값, 기간 기관기호 확인 없음)")]
    public void ReadsInOrderWithOriginalParameters()
    {
        using var rig = NewRig();
        var gridsBeforeHistory = -1;
        rig.Db.Answer(Sql.HistoryVisitSql, _ =>
        {
            gridsBeforeHistory = rig.Screens.Calls.Count;
            return new[] { new object?[] { "H1", "900001", "20260915", "" } };
        });
        Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31"));

        Assert.Equal(new[]
        {
            Sql.ScopesSql, Sql.InstitutionSql,                       // 등록 병원(오늘)
            Sql.UserScopeSql, Sql.UserPermissionsSql,                // 로그인 사용자의 범위·통계 권한
            Sql.HistoryVisitSql, Sql.HistoryCodeSql,
            Sql.TrendCountSql, Sql.TrendTotalsSql, Sql.TrendPairsSql, Sql.TrendVisitRxSql, Sql.TrendVisitDxSql,
            Sql.PrescriptionCatalogSql, Sql.LaCatalogSql,
            StatsSql.VisitLinesSql, StatsSql.DoctorNamesSql,         // claim-learn AC-9317.1: 처방 목록 뒤 진료의(통계 SQL 그대로)
        }, rig.Db.Sqls);
        Assert.Equal(3, gridsBeforeHistory);

        var calls = rig.Db.Calls;
        Assert.Equal("202510010000", calls[4].Args["@from"]);
        Assert.Equal("202610010000", calls[4].Args["@focus"]);
        Assert.Equal("202611010000", calls[4].Args["@to"]);
        Assert.Equal(Synthetic.Scope, calls[4].Args["@hospital"]);
        Assert.Equal("202510310000", calls[6].Args["@from"]);
        Assert.Equal("202610310000", calls[6].Args["@to"]);
        Assert.Equal(2, calls[8].Args["@minimum"]);
        Assert.Equal("20261030", calls[11].Args["@today"]);
        Assert.Equal("LA[0-9]%", calls[12].Args["@prefix"]);

        Assert.Equal(Sql.MetaTimeout, calls[2].Timeout);
        Assert.Equal(Sql.MetaTimeout, calls[3].Timeout);
        Assert.Equal(Sql.HistoryTimeout, calls[4].Timeout);
        Assert.Equal(Sql.HistoryTimeout, calls[5].Timeout);
        Assert.All(calls.Skip(6).Take(5), call => Assert.Equal(Sql.TrendTimeout, call.Timeout));
        Assert.Equal(Sql.PrescriptionCatalogTimeout, calls[11].Timeout);
        Assert.Equal(Sql.LaCatalogTimeout, calls[12].Timeout);

        Assert.Equal(new[] { "83", "83D", "47" }, rig.Screens.Calls.Select(c => c.Key));
        Assert.All(rig.Screens.Calls, call =>
        {
            Assert.Equal(Synthetic.Root, call.Install);
            Assert.Equal("SYNUSER", call.User.UserId);
            Assert.Equal(new DateTime(2026, 10, 1), call.From);
            Assert.Equal(new DateTime(2026, 10, 31), call.To);
            Assert.Equal(StatsScreens.ReadTimeout, call.Timeout);
        });
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-008.1 비트 로그인 창은 도우미가 켜진 동안 한 번만(원본처럼 기억), 범위·권한 확인은 매번")]
    public void LogsInOncePerProcess()
    {
        using var rig = NewRig();
        var dispatcher = Dispatch.For(rig.Rig.Services);
        Dispatch.Join(Dispatch.Run(dispatcher, "claim.month", "2026-10-01", "2026-10-31"));
        Dispatch.Join(Dispatch.Run(dispatcher, "claim.month", "2026-10-01", "2026-10-31"));
        Assert.Single(rig.Rig.Login.Calls);
        Assert.Equal(2, rig.Db.Sqls.Count(sql => sql == Sql.UserPermissionsSql));

        // 확인에 실패하면 기억한 로그인을 버린다(다음에 다시 로그인)
        rig.Db.Answer(Sql.UserScopeSql, "OTHER");
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Dispatch.OnlyError(Dispatch.Run(dispatcher, "claim.month", "2026-10-01", "2026-10-31")));
        FakeDb.Hospital(rig.Db);
        Dispatch.Join(Dispatch.Run(dispatcher, "claim.month", "2026-10-01", "2026-10-31"));
        Assert.Equal(2, rig.Rig.Login.Calls.Count);
    }

    [Fact(DisplayName = "AC-008.1 달을 넘기는 기간(10/30~11/2)도 한 번에 읽는다")]
    public void CrossesMonths()
    {
        using var rig = NewRig();
        var json = Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-30", "2026-11-02"));
        Assert.Equal("2025-10-30", json.GetProperty("historyRange").GetProperty("from").GetString());
        Assert.Equal("2026-11-02", json.GetProperty("historyRange").GetProperty("to").GetString());
        Assert.All(rig.Screens.Calls, call =>
        {
            Assert.Equal(new DateTime(2026, 10, 30), call.From);
            Assert.Equal(new DateTime(2026, 11, 2), call.To);
        });
    }

    [Fact(DisplayName = "AC-008.1 큰 자료도 다 만든 뒤 1,000,000바이트 이하 조각 여럿으로 나누고, 이으면 counts와 줄 수가 같다")]
    public void LargePayloadIsChunked()
    {
        using var rig = NewRig(visits: 6000);
        var replies = Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31");
        Assert.True(replies.Count > 3, "조각이 여럿이어야 한다");
        var json = Dispatch.Join(replies);
        Assert.Equal(6000, json.GetProperty("counts").GetProperty("s83").GetInt32());
        Assert.Equal(6000, json.GetProperty("s83").GetArrayLength());
        Assert.Equal(6000, json.GetProperty("history").GetArrayLength());
    }

    [Fact(DisplayName = "AC-008.1 처리기도 이력 범위가 400일(원본 RxHistory.MaximumDays)을 넘거나 시작이 끝보다 늦으면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    public void HandlerGuardsHistoryRange()
    {
        using var rig = NewRig();
        var login = new StatsLogin();
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.Throws<ProtocolException>(() => ClaimMonthPayload.Build(rig.Rig.Services, login, new DateTime(2026, 1, 1), new DateTime(2026, 3, 1))).Code);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.Throws<ProtocolException>(() => ClaimMonthPayload.Build(rig.Rig.Services, login, new DateTime(2026, 10, 2), new DateTime(2026, 10, 1))).Code);
        Assert.Empty(rig.Db.Calls);
        Assert.Empty(rig.Screens.Calls);

        // 35일(시작·끝 포함)은 된다: 이력은 365 + 34 = 399일
        var json = ClaimMonthPayload.Build(rig.Rig.Services, login, new DateTime(2026, 10, 1), new DateTime(2026, 11, 4));
        Assert.Contains("\"historyRange\":{\"from\":\"2025-10-01\",\"to\":\"2026-11-04\"}", json, StringComparison.Ordinal);
    }

    // ── AC-008.4 하나라도 실패하면 error만 ───────────────────────

    [Theory(DisplayName = "AC-008.4 표(83·83D·47) 하나라도 읽기 실패·시간 초과면 그 번호 error 하나만, chunk·end 없음, 뒤 자료는 읽지 않음")]
    [InlineData("83", "E-BIT-READ-FAILED")]
    [InlineData("83D", "E-BIT-READ-FAILED")]
    [InlineData("47", "E-BIT-READ-FAILED")]
    [InlineData("83", "E-BIT-EXPORT-FAILED")]
    [InlineData("83D", "E-BIT-EXPORT-FAILED")]
    [InlineData("47", "E-BIT-EXPORT-FAILED")]
    public void GridFailureSendsOnlyError(string key, string code)
    {
        using var rig = NewRig();
        rig.Screens.Fail[key] = code;
        Assert.Equal(code, Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
        Assert.DoesNotContain(Sql.HistoryVisitSql, rig.Db.Sqls);
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-008.4 표에 필요한 칸이 없으면(비트 화면이 바뀜) E-BIT-EXPORT-FAILED 하나만")]
    public void MissingColumnSendsOnlyError()
    {
        using var rig = NewRig();
        rig.Screens.Sheets["47"][0] = new[] { "차트번호", "환자명", "주민번호", "처방코드", "처방명칭", "급여구분", "총투여량", "금액", "비고" };
        Assert.Equal("E-BIT-EXPORT-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
    }

    [Theory(DisplayName = "AC-008.6 47 표에 처방명칭·급여구분 칸이 없으면 claim.month 전체가 E-BIT-EXPORT-FAILED 하나로 멈춘다")]
    [InlineData("처방명칭")]
    [InlineData("급여구분")]
    public void PrescriptionTableNeedsNameAndPay(string missing)
    {
        using var rig = NewRig();
        var header = rig.Screens.Sheets["47"][0];
        var column = Array.IndexOf(header, missing);
        Assert.True(column >= 0);
        rig.Screens.Sheets["47"] = rig.Screens.Sheets["47"].Select(row => row.Where((_, i) => i != column).ToArray()).ToList();

        Assert.Equal("E-BIT-EXPORT-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
    }

    public static IEnumerable<object[]> FailingSql()
    {
        yield return new object[] { Sql.HistoryVisitSql };
        yield return new object[] { Sql.HistoryCodeSql };
        yield return new object[] { Sql.TrendCountSql };
        yield return new object[] { Sql.TrendPairsSql };
        yield return new object[] { Sql.TrendVisitDxSql };
        yield return new object[] { Sql.PrescriptionCatalogSql };
        yield return new object[] { Sql.LaCatalogSql };
    }

    [Theory(DisplayName = "AC-008.4 이력·상병 추세·처방 목록 SQL이 실패·시간 초과(SqlBitDb가 E-BIT-READ-FAILED로 바꿈)면 error 하나만")]
    [MemberData(nameof(FailingSql))]
    public void SqlFailureSendsOnlyError(string sql)
    {
        using var rig = NewRig();
        rig.Db.Fail(sql, "E-BIT-READ-FAILED");
        Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-008.4 처방 목록 모양이 틀리면(원본 invalid_catalog·빈 목록) E-BIT-READ-FAILED 하나만")]
    public void BadCatalogSendsOnlyError()
    {
        using (var rig = NewRig())
        {
            rig.Db.Answer(Sql.PrescriptionCatalogSql, _ => new[] { new object?[] { "LA221", "이름\u0001", "LA221", "P", "1", "040001" } });
            Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
        }
        using (var rig = NewRig())
        {
            rig.Db.Answer(Sql.PrescriptionCatalogSql, _ => new object?[0][]);
            Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
        }
    }

    [Fact(DisplayName = "AC-008.4 비트 로그인 취소·메뉴 파일을 못 읽음·통계 화면 부품 없음은 E-BIT-EXPORT-FAILED 하나만(표를 읽지 않음)")]
    public void LoginOrMenuFailureSendsOnlyError()
    {
        using (var rig = NewRig())
        {
            rig.Rig.Login.User = null;
            Assert.Equal("E-BIT-EXPORT-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
            Assert.Empty(rig.Screens.Calls);
        }
        using (var rig = NewRig())
        {
            rig.Screens.MenuFail = "E-BIT-EXPORT-FAILED";
            Assert.Equal("E-BIT-EXPORT-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
            Assert.Empty(rig.Screens.Calls);
        }
        using (var rig = NewRig())
        {
            var services = new BitServices(rig.Rig.Locator, rig.Rig.Connector, rig.Rig.Login, rig.Rig.Confirm, rig.Rig.Store, () => rig.Rig.Today);
            Assert.Equal("E-BIT-EXPORT-FAILED", Dispatch.OnlyError(Dispatch.Run(services, "claim.month", "2026-10-01", "2026-10-31")));
        }
    }

    [Fact(DisplayName = "AC-005.15 claim.month는 기간 기관기호를 확인하지 않는다(그 기간에 다른 번호 줄이 있어도 읽는다)")]
    public void NoPeriodCheck()
    {
        foreach (var counts in new[] { new object?[] { 0L, 0L }, new object?[] { 1L, 1L } })
        {
            using var rig = NewRig();
            rig.Db.Answer(Sql.PeriodIdentitySql, _ => new[] { counts });
            Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31"));
            Assert.DoesNotContain(Sql.PeriodIdentitySql, rig.Db.Sqls);
            Assert.NotEmpty(rig.Screens.Calls);
        }
    }

    [Fact(DisplayName = "AC-008.4 등록이 없거나 다른 병원이면 그 번호 error 하나만, 로그인 창·표 없음")]
    public void HospitalFailureSendsOnlyError()
    {
        using (var rig = NewRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
            Assert.Empty(rig.Rig.Login.Calls);
        }
        using (var rig = NewRig())
        {
            rig.Db.Answer(Sql.ScopesSql, "FOREIGN");
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.month", "2026-10-01", "2026-10-31")));
            Assert.Empty(rig.Screens.Calls);
        }
    }
}
