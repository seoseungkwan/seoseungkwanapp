using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-008.5 claim.dates: 기간의 날짜별 외래 진료 수와 비트 메모가 있는 진료 수를 result {days: [{date, visits, memoInBit}]} 숫자만.
/// 진료 0건인 날은 뺀다. 세는 SQL은 원본 방문 조건 그대로(ClaimSqlTests). 등록 병원 확인을 먼저 한다.
/// </summary>
public class ClaimDatesTests
{
    private static ClaimRig Rig(params object?[][] days)
    {
        var rig = new ClaimRig();
        rig.Db.Answer(Sql.ClaimDatesSql, _ => days);
        return rig;
    }

    private static JsonElement Result(System.Collections.Generic.List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("result", reply.GetProperty("type").GetString());
        return reply.GetProperty("data");
    }

    [Fact(DisplayName = "AC-008.5 claim.dates → result {days: [{date, visits, memoInBit}]}, 날짜 순, 숫자만(차트번호·이름·메모 글 없음)")]
    public void CountsPerDay()
    {
        using var rig = Rig(
            new object?[] { "20261002", 31L, 12 },
            new object?[] { "20261001", 40L, 40 },
            new object?[] { "20261005", 1L, 0 });

        var data = Result(Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31"));

        Assert.Equal(new[] { "days" }, Json.Keys(data));
        var days = data.GetProperty("days").EnumerateArray().ToList();
        Assert.Equal(new[] { "2026-10-01", "2026-10-02", "2026-10-05" }, days.Select(d => d.GetProperty("date").GetString()));
        Assert.All(days, d => Assert.Equal(new[] { "date", "visits", "memoInBit" }, Json.Keys(d)));
        Assert.Equal(new[] { 40, 31, 1 }, days.Select(d => d.GetProperty("visits").GetInt32()));
        Assert.Equal(new[] { 40, 12, 0 }, days.Select(d => d.GetProperty("memoInBit").GetInt32()));
        Assert.All(days, d =>
        {
            Assert.Equal(JsonValueKind.Number, d.GetProperty("visits").ValueKind);
            Assert.Equal(JsonValueKind.Number, d.GetProperty("memoInBit").ValueKind);
        });
    }

    [Fact(DisplayName = "AC-008.5 진료 0건인 날과 날짜 모양이 틀린 줄은 빼고, 메모 수는 진료 수를 넘지 않는다")]
    public void DropsEmptyDays()
    {
        using var rig = Rig(
            new object?[] { "20261001", 0L, 0 },
            new object?[] { "2026100", 5L, 1 },
            new object?[] { null, 5L, 1 },
            new object?[] { "20261003", 2L, 2 },
            new object?[] { "20261004", 2L, 5 });

        var days = Result(Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31")).GetProperty("days").EnumerateArray().ToList();

        Assert.Equal(new[] { "2026-10-03", "2026-10-04" }, days.Select(d => d.GetProperty("date").GetString()));
        Assert.Equal(2, days[1].GetProperty("memoInBit").GetInt32());
    }

    [Fact(DisplayName = "AC-008.5 AC-005.15 등록 병원 확인 → 세기 SQL 하나(@from·@to 끝 다음 날 0시·@hospital, 시간 제한 120초, 기간 기관기호 확인 없음), 로그인 창·통계 화면은 쓰지 않는다")]
    public void ReadsOnlyCounts()
    {
        using var rig = Rig(new object?[] { "20261001", 3L, 1 });
        Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-09-01", "2026-10-31");

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, Sql.ClaimDatesSql }, rig.Db.Sqls);
        var count = rig.Db.Calls[2];
        Assert.Equal("202609010000", count.Args["@from"]);
        Assert.Equal("202611010000", count.Args["@to"]);
        Assert.Equal(Synthetic.Scope, count.Args["@hospital"]);
        Assert.Equal(TimeSpan.FromSeconds(120), count.Timeout);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Empty(rig.Screens.Calls);
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-005.15 claim.dates는 기간 기관기호를 확인하지 않는다(그 기간에 다른 번호 줄이 있어도 센다)")]
    public void NoPeriodCheck()
    {
        using var rig = Rig(new object?[] { "20261001", 3L, 1 });
        rig.Db.Answer(Sql.PeriodIdentitySql, _ => new[] { new object?[] { 0L, 2L } });
        var replies = Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31");
        Assert.DoesNotContain(replies, reply => reply.GetProperty("type").GetString() == "error");
        Assert.Contains(Sql.ClaimDatesSql, rig.Db.Sqls);
        Assert.DoesNotContain(Sql.PeriodIdentitySql, rig.Db.Sqls);
    }

    [Fact(DisplayName = "AC-008.5 등록 없음·다른 병원·읽기 실패는 그 번호 error")]
    public void Failures()
    {
        using (var rig = new ClaimRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31")));
        }
        using (var rig = Rig())
        {
            rig.Db.Answer(Sql.InstitutionSql, Synthetic.OtherInstitution);
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31")));
            Assert.DoesNotContain(Sql.ClaimDatesSql, rig.Db.Sqls);
        }
        using (var rig = Rig())
        {
            rig.Db.Fail(Sql.ClaimDatesSql, "E-BIT-READ-FAILED");
            Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.dates", "2026-10-01", "2026-10-31")));
        }
    }
}
