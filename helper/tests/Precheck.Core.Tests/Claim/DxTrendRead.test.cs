using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-008.1 상병 추세(원본 RxDiagnosisTrend.Query·Suggest): 처방-상병 짝 건수·배수(×100)·규칙 제안을 원본 계산 그대로 만든다.
/// 코드·상병명은 모양만 맞춘 가짜다.
/// </summary>
public class DxTrendReadTests
{
    private static readonly DateTime From = new DateTime(2025, 10, 31);
    private static readonly DateTime Last = new DateTime(2026, 10, 30);

    /// <summary>
    /// 내원 100개: 1~40은 LA001(1~36 상병 M545, 37~40 상병 M170), 41~100은 MM001(상병 K297).
    /// </summary>
    private static FakeDb Db()
    {
        var db = new FakeDb();
        db.Answer(Sql.TrendCountSql, _ => new[] { new object?[] { 100L } });
        db.Answer(Sql.TrendTotalsSql, _ => new[] { new object?[] { "LA001", 40L }, new object?[] { "MM001", 60L }, new object?[] { "<bad>", 3L } });
        db.Answer(Sql.TrendPairsSql, _ => new[]
        {
            new object?[] { "LA001", "M170", "무릎관절증(가짜)", 4L, 0L, 0L },
            new object?[] { "LA001", "M545", "요통(가짜)\u0001", 30L, 6L, 0L },
            new object?[] { "MM001", "K297", "위염(가짜)", 0L, 60L, 0L },
            new object?[] { "MM001", "1AB", "틀린 상병", 2L, 0L, 0L },       // 상병 모양 틀림
            new object?[] { "ZZ999", "K297", "모르는 처방", 2L, 0L, 0L },     // totals에 없는 처방
        });
        db.Answer(Sql.TrendVisitRxSql, _ =>
            Enumerable.Range(1, 40).Select(i => new object?[] { "T" + i, "LA001" })
                .Concat(Enumerable.Range(41, 60).Select(i => new object?[] { "T" + i, "MM001" })).ToArray());
        db.Answer(Sql.TrendVisitDxSql, _ =>
            Enumerable.Range(1, 36).Select(i => new object?[] { "T" + i, "M545", 1, "요통(가짜)" })
                .Concat(Enumerable.Range(37, 4).Select(i => new object?[] { "T" + i, "M170", 2, "무릎관절증(가짜)" }))
                .Concat(Enumerable.Range(41, 60).Select(i => new object?[] { "T" + i, "K297", 2, "위염(가짜)" })).ToArray());
        return db;
    }

    [Fact(DisplayName = "AC-008.1 상병 추세: 처방코드는 많이 나온 순, 상병은 건수 순으로 {c, n, d[{c, nm, m, s, x, l}]}, 배수 = 짝 비율 ÷ 전체 비율 ×100, 모양이 틀린 줄은 빼고 센다")]
    public void CodesAndLift()
    {
        var db = Db();
        var trend = DxTrendRead.Read(db, Synthetic.Scope, From, Last);

        Assert.Equal(100, trend.Visits);
        Assert.Equal(new[] { "MM001", "LA001" }, trend.Codes.Select(c => c.Code));
        Assert.Equal(60, trend.Codes[0].Visits);
        var la = trend.Codes[1];
        Assert.Equal(new[] { "M545", "M170" }, la.Diagnoses.Select(d => d.Code));
        Assert.Equal("요통(가짜)", la.Diagnoses[0].Name);                    // 제어 문자를 뺀다
        Assert.Equal(30, la.Diagnoses[0].Main);
        Assert.Equal(6, la.Diagnoses[0].Sub);
        Assert.Equal(0, la.Diagnoses[0].Excluded);
        Assert.Equal(250, la.Diagnoses[0].Lift);                             // 36×100×100 ÷ (40×36)
        Assert.Equal(250, la.Diagnoses[1].Lift);                             // 4×100×100 ÷ (40×4)
        Assert.Equal(166, trend.Codes[0].Diagnoses.Single().Lift);           // 60×100×100 ÷ (60×60)
        Assert.Equal(3, trend.InvalidRows);                                  // <bad> 처방 · 1AB 상병 · totals에 없는 처방

        Assert.Equal(new[] { Sql.TrendCountSql, Sql.TrendTotalsSql, Sql.TrendPairsSql, Sql.TrendVisitRxSql, Sql.TrendVisitDxSql }, db.Sqls);
        foreach (var call in db.Calls)
        {
            Assert.Equal("202510310000", call.Args["@from"]);
            Assert.Equal("202610310000", call.Args["@to"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(240), call.Timeout);
        }
        Assert.Equal(2, db.Calls[2].Args["@minimum"]);
    }

    [Fact(DisplayName = "AC-008.1 규칙 제안(원본 Suggest): 30내원 이상 처방마다 흔하지 않은 상병 묶음(앞 3자리)을 95%까지 최대 4개, 90% 이상 덮으면 제안")]
    public void SuggestionsLikeOriginal()
    {
        var trend = DxTrendRead.Read(Db(), Synthetic.Scope, From, Last);

        Assert.Equal(new[] { "MM001", "LA001" }, trend.Suggestions.Select(s => s.Code));
        var la = trend.Suggestions[1];
        Assert.Equal(40, la.Visits);
        Assert.Equal(1000, la.Cover);
        Assert.Equal(0, la.Missing);
        Assert.Equal(new[] { "M54", "M17" }, la.Groups.Select(g => g.Code));
        Assert.Equal(new[] { 900, 1000 }, la.Groups.Select(g => g.Cover));
        Assert.Equal("요통(가짜)", la.Groups[0].Name);
        Assert.Equal(0, la.Groups[0].Excluded);

        var mm = trend.Suggestions[0];
        Assert.Equal("K29", Assert.Single(mm.Groups).Code);
        Assert.Equal(1000, mm.Cover);
    }

    [Fact(DisplayName = "AC-008.1 규칙 제안: 30내원 미만·흔한 상병(배수 1.5 미만)만 있는 처방·90% 못 덮는 처방은 제안하지 않고, 배제상병 비율은 천분율")]
    public void SuggestionEdges()
    {
        var rxVisits = new Dictionary<string, List<string>>(StringComparer.Ordinal)
        {
            ["FEW"] = Enumerable.Range(1, 29).Select(i => "F" + i).ToList(),
            ["ALL"] = Enumerable.Range(1, 40).Select(i => "A" + i).ToList(),
            ["EXC"] = Enumerable.Range(1, 30).Select(i => "E" + i).ToList(),
        };
        var groups = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);
        var names = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);
        foreach (var visit in rxVisits["FEW"]) groups[visit] = new Dictionary<string, int> { ["M54"] = 1 };
        foreach (var visit in rxVisits["ALL"]) groups[visit] = new Dictionary<string, int> { ["K29"] = 2 };
        foreach (var visit in rxVisits["EXC"]) groups[visit] = new Dictionary<string, int> { ["S83"] = 3, ["K29"] = 2 };
        // 처방 없는 내원에도 흔한 상병 K29
        for (var i = 0; i < 200; i++) groups["O" + i] = new Dictionary<string, int> { ["K29"] = 2 };

        var suggestions = DxTrendRead.Suggest(rxVisits, groups, names);

        var exc = Assert.Single(suggestions);
        Assert.Equal("EXC", exc.Code);
        var group = Assert.Single(exc.Groups);
        Assert.Equal("S83", group.Code);
        Assert.Equal(1000, group.Excluded);
        Assert.Equal("", group.Name);
    }
}
