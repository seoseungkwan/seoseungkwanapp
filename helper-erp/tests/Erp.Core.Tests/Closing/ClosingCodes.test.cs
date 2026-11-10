using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Erp.Core.Closing;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests.Closing;

/// <summary>
/// REQ-3602 ClosingCodes.Read: 1년 처방 코드·진료 수·코드표 이름(ClosingSql.CodeListSql 문장 하나, TASK-16)·예약 메모 목록(ClosingSql.MemoKindsSql).
/// 값은 지어낸 것이다. 가짜 DB의 코드 목록 한 줄은 CodeListSql 결과 칸 [코드, 진료 수, 이름] 그대로다.
/// </summary>
public class ClosingCodesTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 10);

    /// <summary>CodeListSql 한 줄: 코드·진료 수·이름(코드표에 없으면 null).</summary>
    private static object?[] Code(string? code, object visits, string? name = null) => new object?[] { code, visits, name };

    private static FakeDb Db(object?[][] codes, object?[][]? kinds = null)
    {
        var db = new FakeDb();
        db.Answer(ClosingFake.CodeListSql, _ => codes);
        db.Answer(ClosingSql.MemoKindsSql, _ => kinds ?? new object?[0][]);
        return db;
    }

    private static ClosingCodesResult Read(FakeDb db) => ClosingCodes.Read(db, Synthetic.Scope, Today);

    // ---- AC-3616.3 문장 하나 ---------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3616.3 ClosingCodes.Read는 CodeListSql(어제까지 365일: @from·@to Char 12 0시, @first·@last Char 8 첫날·마지막 날, @hospital 범위, 50초)·MemoKindsSql(15초) 둘만 부르고 TrendTotalsSql·CodeNamesSql은 부르지 않는다")]
    public void ReadsYearBeforeToday()
    {
        var db = Db(new object?[0][]);
        Read(db);

        Assert.Equal(new[] { ClosingFake.CodeListSql, ClosingSql.MemoKindsSql }, db.Sqls);
        Assert.DoesNotContain(Sql.TrendTotalsSql, db.Sqls);
        Assert.DoesNotContain(StatsSql.CodeNamesSql, db.Sqls);

        var list = db.Calls[0];
        Assert.Equal(
            new Dictionary<string, object?>
            {
                ["@from"] = "202511100000",
                ["@to"] = "202611100000",
                ["@first"] = "20251110",
                ["@last"] = "20261109",
                ["@hospital"] = Synthetic.Scope,
            },
            list.Args);
        Assert.Equal(TimeSpan.FromSeconds(50), list.Timeout);

        var kinds = db.Calls[1];
        Assert.Empty(kinds.Args);
        Assert.Equal(TimeSpan.FromSeconds(15), kinds.Timeout);
        Assert.Equal(Sql.MetaTimeout, kinds.Timeout);
    }

    [Fact(DisplayName = "AC-3616.3 시간 제한: 접속 10초 + 등록 확인 15초 × 2 + 코드 목록 50초 + 메모 목록 15초 = 105초로 확장이 기다리는 120초보다 짧다")]
    public void TimeoutsFitExtensionWait()
    {
        var db = Db(new object?[0][]);
        Read(db);

        var total = TimeSpan.FromSeconds(Sql.ConnectTimeoutSeconds) + Sql.MetaTimeout + Sql.MetaTimeout
            + db.Calls.Aggregate(TimeSpan.Zero, (sum, call) => sum + call.Timeout);
        Assert.Equal(TimeSpan.FromSeconds(105), total);
        Assert.True(total < TimeSpan.FromSeconds(120));
    }

    // ---- AC-3602.1 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3602.1 codes = 앞뒤 공백 없는 대문자 코드·코드표 이름(없으면 null)·진료 수, 진료 수 많은 차례(같으면 코드 차례)")]
    public void ListsCodesByVisits()
    {
        var db = Db(new[]
        {
            Code("SONO1", 1143L, "비급여초음파"),
            Code("CARM1", 1102L, "C-arm 유도"),
            Code("ESWT7", 36, "체외충격파(2000타)"),
            Code("AA222", 36L, "재진진찰료"),
            Code("NONAME", 5L),
        });
        var codes = Read(db).Codes;

        Assert.Equal(new[] { "SONO1", "CARM1", "AA222", "ESWT7", "NONAME" }, codes.Select(code => code.Code));
        Assert.Equal(new long[] { 1143, 1102, 36, 36, 5 }, codes.Select(code => code.Visits));
        Assert.Equal(new[] { "비급여초음파", "C-arm 유도", "재진진찰료", "체외충격파(2000타)", null }, codes.Select(code => code.Name));
    }

    [Fact(DisplayName = "AC-3602.1 앞뒤 공백·대소문자를 맞춰 같아진 코드는 진료 수를 더해 한 줄(이름은 먼저 있는 것), 빈 코드는 뺀다")]
    public void MergesSameCodes()
    {
        var db = Db(new[]
        {
            Code(" MM010", 10L),
            Code("mm010", 5L, "물리치료"),
            Code("  ", 99L, "빈칸"),
            Code(null, 99L, "없음"),
            Code("도수", 7L, "도수치료"),
        });
        var codes = Read(db).Codes;

        Assert.Equal(new[] { "MM010", "도수" }, codes.Select(code => code.Code));
        Assert.Equal(new long[] { 15, 7 }, codes.Select(code => code.Visits));
        Assert.Equal(new[] { "물리치료", "도수치료" }, codes.Select(code => code.Name));
    }

    [Fact(DisplayName = "AC-3602.1 codes는 진료 수 많은 차례로 2,000개까지")]
    public void KeepsTwoThousand()
    {
        var rows = Enumerable.Range(0, 2100).Select(i => Code("C" + i.ToString("0000"), (long)(i + 1), "이름" + i)).ToArray();
        var codes = Read(Db(rows)).Codes;

        Assert.Equal(2000, ClosingCodes.MaxCodes);
        Assert.Equal(2000, codes.Count);
        Assert.Equal("C2099", codes[0].Code);
        Assert.Equal(101L, codes[codes.Count - 1].Visits);
        Assert.Equal("이름2099", codes[0].Name);
    }

    [Fact(DisplayName = "AC-3602.1 kinds = 비트 예약 메모 목록 차례 그대로, 'Memo'+숫자는 숫자만, 다른 꼴은 앞뒤 공백만 뗀다")]
    public void ListsMemoKinds()
    {
        var db = Db(new object?[0][], new[]
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
            new[] { Code("CARM1", 3L) },
            new[] { new object?[] { "Memo1", "체외충격파" } });
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
        foreach (var sql in new[] { ClosingFake.CodeListSql, ClosingSql.MemoKindsSql })
        {
            var db = Db(new[] { Code("CARM1", 3L) });
            db.Fail(sql, BitErrors.ReadFailed);
            Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(db)).Code);
        }
        // CodeListSql 결과는 [코드, 진료 수, 이름] 세 칸이다. 이름 칸이 빠진 줄도 지어내지 않는다
        var shortRow = Db(new[] { new object?[] { "CARM1", 3L } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Read(shortRow)).Code);
        var notNumber = Db(new[] { Code("CARM1", "많음") });
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
            new[] { Code("CARM1", 3L, raw) },
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
                new[] { Code("CARM1", 3L, raw) },
                new[] { new object?[] { "Memo1", raw } });
            var result = Read(db);
            Assert.Equal(expected, Assert.Single(result.Codes).Name);
            Assert.Equal(expected, Assert.Single(result.Kinds).Name);
        }
    }
}
