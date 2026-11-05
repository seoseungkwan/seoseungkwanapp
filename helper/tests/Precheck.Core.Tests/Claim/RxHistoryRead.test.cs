using System;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-008.2 12개월 이력(원본 RxHistory.Query): VisitSql·CodeSql 결과를 원본처럼 걸러 줄 {v, p, d, c[], m}으로 만든다.
/// 가짜 내원·차트번호·코드만 쓴다.
/// </summary>
public class RxHistoryReadTests
{
    private static readonly DateTime From = new DateTime(2025, 10, 1);
    private static readonly DateTime Focus = new DateTime(2026, 10, 1);
    private static readonly DateTime Last = new DateTime(2026, 10, 31);

    private static FakeDb Db(object?[][] visits, object?[][] codes)
    {
        var db = new FakeDb();
        db.Answer(Sql.HistoryVisitSql, _ => visits);
        db.Answer(Sql.HistoryCodeSql, _ => codes);
        return db;
    }

    [Fact(DisplayName = "AC-008.2 이력 줄 모양은 원본처럼 {v 내원, p 차트번호, d YYYY-MM-DD, c 처방코드들, m 청구메모}이고 매개변수는 @from·@focus·@to(끝 다음 날 0시)·@hospital")]
    public void RowShape()
    {
        var db = Db(
            new[] { new object?[] { "H1", "900001 ", "20260915", "메모 하나" }, new object?[] { 12345, "900002", "20260101", null } },
            new[] { new object?[] { "H1", "LA221" }, new object?[] { "H1", "KK010" }, new object?[] { "12345", "MM001" } });

        var history = RxHistoryRead.Read(db, Synthetic.Scope, From, Focus, Last);

        Assert.Equal(2, history.Rows.Count);
        var row = history.Rows[0];
        Assert.Equal("H1", row.Visit);
        Assert.Equal("900001", row.Patient);
        Assert.Equal("2026-09-15", row.Day);
        Assert.Equal(new[] { "LA221", "KK010" }, row.Codes);
        Assert.Equal("메모 하나", row.Memo);
        Assert.Equal("12345", history.Rows[1].Visit);
        Assert.Equal("", history.Rows[1].Memo);

        Assert.Equal(new[] { Sql.HistoryVisitSql, Sql.HistoryCodeSql }, db.Sqls);
        foreach (var call in db.Calls)
        {
            Assert.Equal("202510010000", call.Args["@from"]);
            Assert.Equal("202610010000", call.Args["@focus"]);
            Assert.Equal("202611010000", call.Args["@to"]);
            Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        }
    }

    [Fact(DisplayName = "AC-008.2 원본 거르기: 모양이 틀린 내원·차트번호·날짜는 빼고 세며, 같은 내원은 한 번, 메모는 줄바꿈 \\n·제어 문자 빼고 500자, 처방코드가 없는 내원은 뺀다")]
    public void FiltersLikeOriginal()
    {
        var longMemo = new string('가', 501);
        var db = Db(
            new[]
            {
                new object?[] { "H1", "900001", "20260915", "  첫 줄\r\n둘째\u0007 줄\r셋째\t탭  " },
                new object?[] { "H1", "900001", "20260916", "같은 내원(무시)" },
                new object?[] { "H 2", "900002", "20260915", "" },          // 내원 모양 틀림
                new object?[] { "H3", "900-003!", "20260915", "" },         // 차트번호 모양 틀림
                new object?[] { "H4", "900004", "2026-09-15", "" },         // 날짜 모양 틀림
                new object?[] { "H5", "900005", "20260915", longMemo },
                new object?[] { "H6", "900006", "20260915", "코드 없음" },
            },
            new[]
            {
                new object?[] { "H1", "LA221" },
                new object?[] { "H1", "la221" },                            // 소문자: 원본 모양 ^[0-9A-Z][0-9A-Z.-]{0,19}$ 밖
                new object?[] { "H5", "KK010" },
                new object?[] { "H9", "KK010" },                            // 모르는 내원(무시, 세지 않음)
            });

        var history = RxHistoryRead.Read(db, Synthetic.Scope, From, Focus, Last);

        Assert.Equal(new[] { "H1", "H5" }, history.Rows.Select(r => r.Visit));
        Assert.Equal("첫 줄\n둘째 줄\n셋째\t탭", history.Rows[0].Memo);
        Assert.Equal(500, history.Rows[1].Memo.Length);
        Assert.Equal(new[] { "LA221" }, history.Rows[0].Codes);
        Assert.Equal(3, history.InvalidRows);
        Assert.Equal(1, history.InvalidCodes);
        Assert.Equal(1, history.Truncated);
    }

    [Fact(DisplayName = "AC-008.2 내원 하나의 처방코드는 120개까지(넘으면 자르고 셈), 내원이 200,000개를 넘으면 E-BIT-READ-FAILED(원본 result_limit)")]
    public void Limits()
    {
        var codes = Enumerable.Range(0, 121).Select(i => new object?[] { "H1", "C" + i.ToString("000", System.Globalization.CultureInfo.InvariantCulture) }).ToArray();
        var history = RxHistoryRead.Read(Db(new[] { new object?[] { "H1", "900001", "20260915", "" } }, codes), Synthetic.Scope, From, Focus, Last);
        Assert.Equal(120, Assert.Single(history.Rows).Codes.Count);
        Assert.Equal(1, history.Truncated);

        Assert.Equal(200_000, RxHistoryRead.MaximumVisits);
        var many = Enumerable.Range(0, RxHistoryRead.MaximumVisits + 1).Select(i => new object?[] { "V" + i, "900001", "20260915", null }).ToArray();
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => RxHistoryRead.Read(Db(many, new object?[0][]), Synthetic.Scope, From, Focus, Last)).Code);
    }
}
