using System;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print REQ-7403: 기간 빠른 단추(QuickRange)와 그 기간에 왔던 날(VisitDays).
/// 비트 DB는 가짜(FakeDb)이고 차트번호·내원 번호는 지어낸 것이다.
/// </summary>
public class DocDaysTests
{
    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static DateTime D(int y, int m, int d) => new DateTime(y, m, d);

    // 줄: [날 yyyyMMdd, 내원 번호, 상태 OcmComStt, 영수증 줄 있음 0|1, 처방전 있음 0|1]
    private static object?[] Visit(string day, string visit, string? state, object receipt, object rx) => new object?[] { day, visit, state, receipt, rx };

    // ── AC-7403.1 빠른 단추 ─────────────────────────────

    [Theory(DisplayName = "AC-7403.1 빠른 단추(오늘 2026-11-20): 오늘·이번 달(1일~오늘)·지난 달(1일~말일)·최근 3개월(3개월 전 다음 날~오늘)")]
    [InlineData(QuickKind.Today, "2026-11-20", "2026-11-20")]
    [InlineData(QuickKind.ThisMonth, "2026-11-01", "2026-11-20")]
    [InlineData(QuickKind.LastMonth, "2026-10-01", "2026-10-31")]
    [InlineData(QuickKind.Last3Months, "2026-08-21", "2026-11-20")]
    public void QuickButtons(QuickKind kind, string from, string to)
    {
        var range = QuickRange.Of(kind, new DateTime(2026, 11, 20, 15, 45, 10), null);
        Assert.Equal(DateTime.Parse(from, System.Globalization.CultureInfo.InvariantCulture), range.From);
        Assert.Equal(DateTime.Parse(to, System.Globalization.CultureInfo.InvariantCulture), range.To);
        Assert.Equal(TimeSpan.Zero, range.From.TimeOfDay);
        Assert.Equal(TimeSpan.Zero, range.To.TimeOfDay);
    }

    [Fact(DisplayName = "AC-7403.1 달 끝·해 바뀜: 3월 31일·5월 31일·1월 15일")]
    public void QuickButtonsAtMonthEdges()
    {
        Assert.Equal((D(2026, 2, 1), D(2026, 2, 28)), QuickRange.Of(QuickKind.LastMonth, D(2026, 3, 31), null));
        Assert.Equal((D(2026, 1, 1), D(2026, 3, 31)), QuickRange.Of(QuickKind.Last3Months, D(2026, 3, 31), null));
        Assert.Equal((D(2026, 3, 1), D(2026, 5, 31)), QuickRange.Of(QuickKind.Last3Months, D(2026, 5, 31), null));
        Assert.Equal((D(2025, 12, 1), D(2025, 12, 31)), QuickRange.Of(QuickKind.LastMonth, D(2026, 1, 15), null));
        Assert.Equal((D(2025, 10, 16), D(2026, 1, 15)), QuickRange.Of(QuickKind.Last3Months, D(2026, 1, 15), null));
        Assert.Equal((D(2024, 2, 1), D(2024, 2, 29)), QuickRange.Of(QuickKind.LastMonth, D(2024, 3, 1), null));
    }

    [Fact(DisplayName = "AC-7403.1 전체 = 첫 내원~오늘(첫 내원을 모르거나 오늘보다 늦으면 오늘~오늘), 창을 열면 이번 달")]
    public void AllAndDefault()
    {
        Assert.Equal((D(2019, 5, 3), D(2026, 11, 20)), QuickRange.Of(QuickKind.All, new DateTime(2026, 11, 20, 9, 0, 0), new DateTime(2019, 5, 3, 10, 30, 0)));
        Assert.Equal((D(2026, 11, 20), D(2026, 11, 20)), QuickRange.Of(QuickKind.All, D(2026, 11, 20), null));
        Assert.Equal((D(2026, 11, 20), D(2026, 11, 20)), QuickRange.Of(QuickKind.All, D(2026, 11, 20), D(2026, 12, 1)));
        Assert.Equal(QuickKind.ThisMonth, QuickRange.Default);
        Assert.Equal(new[] { "오늘", "이번 달", "지난 달", "최근 3개월", "전체" }, QuickRange.Kinds.Select(QuickRange.NameOf).ToArray());
    }

    [Fact(DisplayName = "AC-7403.1 첫 내원: 같은 내원 조건으로 가장 이른 날(@cht), 없거나 틀린 날이면 null")]
    public void FirstVisit()
    {
        var db = new FakeDb().Answer(DocSql.FirstVisitSql, args => Equals(args["@cht"], "90001") ? new[] { new object?[] { "20190503" } } : new[] { new object?[] { null } });

        Assert.Equal(D(2019, 5, 3), VisitDays.FirstVisit(db, "90001"));
        Assert.Null(VisitDays.FirstVisit(db, "90002"));
        var call = db.Calls[0];
        Assert.Equal(DocSql.FirstVisitSql, call.Sql);
        Assert.Equal(new[] { "@cht" }, call.Args.Keys.ToArray());

        Assert.Null(VisitDays.FirstVisit(new FakeDb().Answer(DocSql.FirstVisitSql, "20191332"), "90001"));
        Assert.Null(VisitDays.FirstVisit(new FakeDb().Answer(DocSql.FirstVisitSql, _ => Array.Empty<object?[]>()), "90001"));

        var quiet = new FakeDb();
        Assert.Null(VisitDays.FirstVisit(quiet, "0090001"));
        Assert.Null(VisitDays.FirstVisit(quiet, ""));
        Assert.Empty(quiet.Calls);
        Assert.Contains("LEFT(MIN(c.OcmAcpDtm),8)", DocSql.FirstVisitSql);
    }

    // ── AC-7403.2 왔던 날 ─────────────────────────────

    [Fact(DisplayName = "AC-7403.2 왔던 날: @cht·@from(시작 0시)·@to(끝 다음 날 0시)로 읽고 오래된 날부터 한 날 한 줄, 그날 내원 번호들을 차례대로")]
    public void DaysOnePerDate()
    {
        var db = new FakeDb().Answer(DocSql.VisitDaysSql, _ => new[]
        {
            Visit("20261103", "V000000001", "PN", 1, 1),
            Visit("20261105", "V000000002", "PN", 1, 0),
            Visit("20261105", "V000000003", "PN", 1, 0),
            Visit("20261110", "V000000004", "PN", 1L, 0L),
        });

        var days = VisitDays.Read(db, "90001", D(2026, 11, 1), new DateTime(2026, 11, 20, 18, 0, 0));

        Assert.Equal(new[] { D(2026, 11, 3), D(2026, 11, 5), D(2026, 11, 10) }, days.Select(d => d.Date).ToArray());
        Assert.Equal(new[] { "V000000002", "V000000003" }, days[1].VisitNums);
        Assert.All(days, d => Assert.False(d.Unpaid));
        Assert.Equal(new[] { true, false, false }, days.Select(d => d.HasRx).ToArray());
        Assert.Equal("2026-11-03 (화)", days[0].DateText);
        Assert.Equal("2026-11-05 (목)", days[1].DateText);

        var call = Assert.Single(db.Calls);
        Assert.Equal(DocSql.VisitDaysSql, call.Sql);
        Assert.Equal(new[] { "@cht", "@from", "@to" }, call.Args.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal("90001", call.Args["@cht"]);
        Assert.Equal("202611010000", call.Args["@from"]);
        Assert.Equal("202611210000", call.Args["@to"]);
    }

    [Fact(DisplayName = "AC-7403.2 그날 내원이 하나라도 수납 전(OcmComStt가 PN 아님 또는 영수증 줄 없음)이면 수납 전, 처방전 있는 내원이 하나라도 있으면 처방")]
    public void UnpaidAndRxMarks()
    {
        var db = new FakeDb().Answer(DocSql.VisitDaysSql, _ => new[]
        {
            Visit("20261117", "V1", "PN", 1, 0),
            Visit("20261117", "V2", "HN", 0, 1),
            Visit("20261118", "V3", "PN", 0, 0),
            Visit("20261119", "V4", " PN ", 1, 0),
            Visit("20261120", "V5", null, 0, 0),
            Visit("20261120", "V6", "WN", 0, 0),
        });

        var days = VisitDays.Read(db, "90001", D(2026, 11, 17), D(2026, 11, 20));

        Assert.Equal(new[] { true, true, false, true }, days.Select(d => d.Unpaid).ToArray());
        Assert.Equal(new[] { true, false, false, false }, days.Select(d => d.HasRx).ToArray());
        Assert.Equal(new[] { "V5", "V6" }, days[3].VisitNums);
    }

    [Fact(DisplayName = "AC-7403.2 줄 차례가 섞여도 날짜순, 틀린 날짜 줄은 건너뛴다")]
    public void DaysSortedAndBadRowsSkipped()
    {
        var db = new FakeDb().Answer(DocSql.VisitDaysSql, _ => new[]
        {
            Visit("20261110", "V3", "PN", 1, 0),
            Visit("2026111", "V9", "PN", 1, 0),
            new object?[] { null, "V8", "PN", 1, 0 },
            Visit("20261103", "V1", "PN", 1, 0),
            Visit("20261110", "V2", "PN", 1, 0),
        });

        var days = VisitDays.Read(db, "90001", D(2026, 11, 1), D(2026, 11, 30));

        Assert.Equal(new[] { D(2026, 11, 3), D(2026, 11, 10) }, days.Select(d => d.Date).ToArray());
        Assert.Equal(new[] { "V3", "V2" }, days[1].VisitNums);
    }

    [Fact(DisplayName = "AC-7403.2 틀린 차트번호·시작이 끝보다 늦은 기간은 DB에 묻지 않고 빈 목록, 읽기 실패는 BitException 그대로")]
    public void EmptyAndFailure()
    {
        var quiet = new FakeDb();
        Assert.Empty(VisitDays.Read(quiet, "", D(2026, 11, 1), D(2026, 11, 20)));
        Assert.Empty(VisitDays.Read(quiet, "0090001", D(2026, 11, 1), D(2026, 11, 20)));
        Assert.Empty(VisitDays.Read(quiet, "9a", D(2026, 11, 1), D(2026, 11, 20)));
        Assert.Empty(VisitDays.Read(quiet, "90001", D(2026, 11, 21), D(2026, 11, 20)));
        Assert.Empty(quiet.Calls);

        var none = new FakeDb().Answer(DocSql.VisitDaysSql, _ => Array.Empty<object?[]>());
        Assert.Empty(VisitDays.Read(none, "90001", D(2026, 11, 20), D(2026, 11, 20)));
        Assert.Equal("202611200000", none.Calls[0].Args["@from"]);
        Assert.Equal("202611210000", none.Calls[0].Args["@to"]);

        var failing = new FakeDb().Fail(DocSql.VisitDaysSql, BitErrors.ReadFailed);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => VisitDays.Read(failing, "90001", D(2026, 11, 1), D(2026, 11, 20))).Code);
    }

    [Fact(DisplayName = "AC-7403.2 내원 조건 SQL: 외래(OcmPatTyp='O')·OcmRsuYon<>'O'·취소(CN/CR) 뺌, 영수증 = OrpInf 줄(미수입금 C 뺌), 처방 = 그 내원의 OutInf 줄")]
    public void VisitSqlShape()
    {
        var sql = Squash(DocSql.VisitDaysSql);
        Assert.StartsWith("SELECT LEFT(c.OcmAcpDtm,8)", sql);
        Assert.Contains("WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to", sql);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')", sql);
        Assert.Contains("EXISTS(SELECT 1 FROM dbo.OrpInf p WHERE p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C')", sql);
        Assert.Contains("EXISTS(SELECT 1 FROM dbo.OutInf o WHERE o.OutOcmNum=c.OcmNum)", sql);
        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum", sql);
        Assert.Contains("c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')", Squash(DocSql.FirstVisitSql));
    }
}
