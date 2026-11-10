using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Erp.Core.Closing;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests.Closing;

/// <summary>REQ-3602 ClosingCodes.Read: 1년 처방 코드(Sql.TrendTotalsSql)·코드표 이름(StatsSql.CodeNamesSql)·예약 메모 목록(ClosingSql.MemoKindsSql). 값은 지어낸 것이다.</summary>
public class ClosingCodesTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 10);

    /// <summary>CodeNamesSql 한 줄: 코드·이름 뒤 칸들(원본 차례).</summary>
    private static object?[] Name(string code, string? name) => new object?[] { code, name, "", "20200101", "99991231", "1", "", false };

    private static FakeDb Db(object?[][] totals, object?[][]? names = null, object?[][]? kinds = null)
    {
        var db = new FakeDb();
        db.Answer(Sql.TrendTotalsSql, _ => totals);
        db.Answer(StatsSql.CodeNamesSql, _ => names ?? new object?[0][]);
        db.Answer(ClosingSql.MemoKindsSql, _ => kinds ?? new object?[0][]);
        return db;
    }

    private static ClosingCodesResult Read(FakeDb db) => ClosingCodes.Read(db, Synthetic.Scope, Today);

    // ---- AC-3602.1 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3602.1 TrendTotalsSql은 어제까지 365일(@from = 365일 전 0시, @to = 오늘 0시)·범위로, CodeNamesSql은 같은 기간 Char 8로, 둘 다 Sql.TrendTimeout")]
    public void ReadsYearBeforeToday()
    {
        var db = Db(new object?[0][]);
        Read(db);

        var totals = Assert.Single(db.Calls, call => call.Sql == Sql.TrendTotalsSql);
        Assert.Equal("202511100000", totals.Args["@from"]);
        Assert.Equal("202611100000", totals.Args["@to"]);
        Assert.Equal(Synthetic.Scope, totals.Args["@hospital"]);
        Assert.Equal(Sql.TrendTimeout, totals.Timeout);

        var names = Assert.Single(db.Calls, call => call.Sql == StatsSql.CodeNamesSql);
        Assert.Equal("20251110", names.Args["@from"]);
        Assert.Equal("20261109", names.Args["@to"]);
        Assert.Equal("20251110", names.Args["@priorFrom"]);
        Assert.Equal("20261109", names.Args["@priorTo"]);
        Assert.Equal(Sql.TrendTimeout, names.Timeout);

        var kinds = Assert.Single(db.Calls, call => call.Sql == ClosingSql.MemoKindsSql);
        Assert.Empty(kinds.Args);
        Assert.Equal(3, db.Calls.Count);
    }

    [Fact(DisplayName = "AC-3602.1 codes = 앞뒤 공백 없는 대문자 코드·코드표 첫 줄 이름(대소문자 무시, 없으면 null)·진료 수, 진료 수 많은 차례(같으면 코드 차례)")]
    public void ListsCodesByVisits()
    {
        var db = Db(
            new[]
            {
                new object?[] { "SONO1", 1143L },
                new object?[] { "CARM1", 1102L },
                new object?[] { "ESWT7", 36 },
                new object?[] { "AA222", 36L },
                new object?[] { "NONAME", 5L },
            },
            new[]
            {
                Name("carm1", "C-arm 유도"),
                Name("CARM1", "두 번째 줄은 쓰지 않음"),
                Name("SONO1 ", "비급여초음파"),
                Name("ESWT7", "체외충격파(2000타)"),
                Name("AA222", "재진진찰료"),
            });
        var codes = Read(db).Codes;

        Assert.Equal(new[] { "SONO1", "CARM1", "AA222", "ESWT7", "NONAME" }, codes.Select(code => code.Code));
        Assert.Equal(new long[] { 1143, 1102, 36, 36, 5 }, codes.Select(code => code.Visits));
        Assert.Equal(new[] { "비급여초음파", "C-arm 유도", "재진진찰료", "체외충격파(2000타)", null }, codes.Select(code => code.Name));
    }

    [Fact(DisplayName = "AC-3602.1 앞뒤 공백·대소문자를 맞춰 같아진 코드는 진료 수를 더해 한 줄, 빈 코드는 뺀다")]
    public void MergesSameCodes()
    {
        var db = Db(new[]
        {
            new object?[] { " MM010", 10L },
            new object?[] { "mm010", 5L },
            new object?[] { "  ", 99L },
            new object?[] { null, 99L },
            new object?[] { "도수", 7L },
        });
        var codes = Read(db).Codes;

        Assert.Equal(new[] { "MM010", "도수" }, codes.Select(code => code.Code));
        Assert.Equal(new long[] { 15, 7 }, codes.Select(code => code.Visits));
    }

    [Fact(DisplayName = "AC-3602.1 codes는 진료 수 많은 차례로 2,000개까지")]
    public void KeepsTwoThousand()
    {
        var rows = Enumerable.Range(0, 2100).Select(i => new object?[] { "C" + i.ToString("0000"), (long)(i + 1) }).ToArray();
        var codes = Read(Db(rows)).Codes;

        Assert.Equal(2000, ClosingCodes.MaxCodes);
        Assert.Equal(2000, codes.Count);
        Assert.Equal("C2099", codes[0].Code);
        Assert.Equal(101L, codes[codes.Count - 1].Visits);
    }

    [Fact(DisplayName = "AC-3602.1 kinds = 비트 예약 메모 목록 차례 그대로, 'Memo'+숫자는 숫자만, 다른 꼴은 앞뒤 공백만 뗀다")]
    public void ListsMemoKinds()
    {
        var db = Db(new object?[0][], kinds: new[]
        {
            new object?[] { "Memo1", "체외충격파" },
            new object?[] { "Memo14", "도수30분(호)" },
            new object?[] { "memo20", "도수30분(원)" },
            new object?[] { " X9 ", "기타" },
            new object?[] { "MemoA", "글자" },
            new object?[] { "Memo22", null },
        });
        var kinds = Read(db).Kinds;

        Assert.Equal(new[] { "1", "14", "20", "X9", "MemoA", "22" }, kinds.Select(kind => kind.Kind));
        Assert.Equal(new[] { "체외충격파", "도수30분(호)", "도수30분(원)", "기타", "글자", null }, kinds.Select(kind => kind.Name));
    }

    [Fact(DisplayName = "AC-3602.1 답 JSON은 { codes: [{ code, name, visits }], kinds: [{ kind, name }] }다")]
    public void AnswerShape()
    {
        var db = Db(
            new[] { new object?[] { "CARM1", 3L } },
            kinds: new[] { new object?[] { "Memo1", "체외충격파" } });
        var data = ClosingFake.DataOf(Read(db));

        Assert.Equal(ClosingFake.Sorted("codes", "kinds"), ClosingFake.Keys(data));
        var code = Assert.Single(data.GetProperty("codes").EnumerateArray());
        Assert.Equal(ClosingFake.Sorted("code", "name", "visits"), ClosingFake.Keys(code));
        Assert.Equal(System.Text.Json.JsonValueKind.Null, code.GetProperty("name").ValueKind);
        Assert.Equal(3, code.GetProperty("visits").GetInt64());
        var kind = Assert.Single(data.GetProperty("kinds").EnumerateArray());
        Assert.Equal(ClosingFake.Sorted("kind", "name"), ClosingFake.Keys(kind));
        Assert.Equal("1", kind.GetProperty("kind").GetString());
    }

    [Fact(DisplayName = "AC-3602.1 읽기가 실패하면 일부만 답하지 않고 E-BIT-READ-FAILED")]
    public void ReadFailureFailsWhole()
    {
        foreach (var sql in new[] { Sql.TrendTotalsSql, StatsSql.CodeNamesSql, ClosingSql.MemoKindsSql })
        {
            var db = Db(new[] { new object?[] { "CARM1", 3L } });
            db.Fail(sql, BitErrors.ReadFailed);
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(db)).Code);
        }
        var shortRow = Db(new[] { new object?[] { "CARM1" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(shortRow)).Code);
        var notNumber = Db(new[] { new object?[] { "CARM1", "많음" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(notNumber)).Code);
    }

    // ---- AC-3602.2 이름 정리 ------------------------------------------------------------------------

    public static IEnumerable<object?[]> DirtyNames()
    {
        yield return new object?[] { "도수\r\n치료", "도수 치료" };
        yield return new object?[] { "\t체외충격파\u0007", "체외충격파" };
        yield return new object?[] { "A\u2028B\u2029C", "A B C" };
        yield return new object?[] { "C\u0085D\u007F", "C D" };
        yield return new object?[] { "  앞뒤  ", "앞뒤" };
        yield return new object?[] { "\r\n\t", null };
        yield return new object?[] { "", null };
        yield return new object?[] { new string('가', 120), new string('가', 100) };
    }

    [Theory(DisplayName = "AC-3602.2 코드 이름·메모 이름의 줄바꿈·제어 문자·짝 없는 대리쌍은 지운다(revenue.days 규칙: 빈칸 하나로, 앞뒤 공백 없이 100자, 비면 null)")]
    [MemberData(nameof(DirtyNames))]
    public void CleansNames(string raw, string? expected)
    {
        var db = Db(
            new[] { new object?[] { "CARM1", 3L } },
            new[] { Name("CARM1", raw) },
            new[] { new object?[] { "Memo1", raw } });
        var result = Read(db);

        Assert.Equal(expected, Assert.Single(result.Codes).Name);
        Assert.Equal(expected, Assert.Single(result.Kinds).Name);
    }

    // 짝 없는 대리쌍은 시험 자료 직렬화에서 깨질 수 있어 Theory 자료가 아니라 여기서 직접 만든다
    [Fact(DisplayName = "AC-3602.2 짝 없는 대리쌍(앞·뒤)은 지우고 짝 맞은 대리쌍(이모지)은 남긴다, 100자에서 자를 때 쪼개지 않는다")]
    public void CleansLoneSurrogates()
    {
        var cases = new (string Raw, string? Expected)[]
        {
            ("짝없음" + '\uD800', "짝없음"),
            ('\uDC00' + "뒤짝", "뒤짝"),
            ("가" + '\uDC00' + '\uD800' + "나", "가 나"),
            ("웃음\U0001F600", "웃음\U0001F600"),
            (new string('가', 99) + "\U0001F600", new string('가', 99)),
        };
        foreach (var (raw, expected) in cases)
        {
            var db = Db(
                new[] { new object?[] { "CARM1", 3L } },
                new[] { Name("CARM1", raw) },
                new[] { new object?[] { "Memo1", raw } });
            var result = Read(db);
            Assert.Equal(expected, Assert.Single(result.Codes).Name);
            Assert.Equal(expected, Assert.Single(result.Kinds).Name);
        }
    }
}
