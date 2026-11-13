using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Erp.Core.Closing;
using Precheck.Core.Protocol;
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

    // ---- AC-3708.1 closing.findCodes: 등록된 코드 전부에서 찾기(erp-closing-range design.md 10절) ------------------

    /// <summary>가짜 비트 코드표 한 줄(SeeMst): 코드·이름·적용일·만료일. 모두 지어낸 것이다.</summary>
    private sealed class SeeRow
    {
        public SeeRow(string code, string? name, string from = "20200101", string to = "99991231")
        {
            Code = code;
            Name = name;
            From = from;
            To = to;
        }

        public string Code { get; }
        public string? Name { get; }
        public string From { get; }
        public string To { get; }
    }

    /// <summary>SQL Server LIKE(대소문자 무시)를 흉내 낸다: % = 아무 글자들, _ = 한 글자, [x] = 글자 x 하나. 그 밖의 [ 꼴은 시험이 모르는 것이라 던진다.</summary>
    private static Regex Like(string pattern)
    {
        var regex = new StringBuilder("^");
        for (var i = 0; i < pattern.Length; i++)
        {
            var c = pattern[i];
            if (c == '%') regex.Append(".*");
            else if (c == '_') regex.Append('.');
            else if (c == '[')
            {
                if (i + 2 >= pattern.Length || pattern[i + 2] != ']') throw new InvalidOperationException("가짜 LIKE가 모르는 [ 꼴: " + pattern);
                regex.Append(Regex.Escape(pattern[i + 1].ToString()));
                i += 2;
            }
            else regex.Append(Regex.Escape(c.ToString()));
        }
        return new Regex(regex.Append("\\z").ToString(), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Singleline);
    }

    /// <summary>
    /// FindCodesSql을 가짜 코드표로 흉내 낸다: SeeOdrCod&lt;&gt;'' · @day BETWEEN 적용일 AND 만료일 · (코드 LIKE @starts OR 이름 LIKE @contains)
    /// · UPPER(LTRIM(RTRIM(코드)))마다 한 줄 MAX(이름) · 코드 차례 TOP 30.
    /// </summary>
    private static FakeDb See(params SeeRow[] rows)
    {
        var db = new FakeDb();
        db.Answer(ClosingSql.FindCodesSql, args =>
        {
            var day = (string)args["@day"]!;
            var starts = Like((string)args["@starts"]!);
            var contains = Like((string)args["@contains"]!);
            return rows
                .Where(row => row.Code.Trim().Length > 0)
                .Where(row => string.CompareOrdinal(row.From, day) <= 0 && string.CompareOrdinal(day, row.To) <= 0)
                .Where(row => starts.IsMatch(row.Code) || (row.Name != null && contains.IsMatch(row.Name)))
                .GroupBy(row => row.Code.Trim().ToUpperInvariant())
                .Select(group => new object?[] { group.Key, group.Select(row => row.Name).Where(name => name != null).OrderBy(name => name, StringComparer.Ordinal).LastOrDefault() })
                .OrderBy(row => (string)row[0]!, StringComparer.Ordinal)
                .Take(30)
                .ToArray();
        });
        return db;
    }

    private static ClosingFindCodesResult Find(FakeDb db, string? text) => ClosingCodes.Find(db, text, Today);

    private static string[] CodesOf(ClosingFindCodesResult result) => result.Codes.Select(code => code.Code).ToArray();

    [Fact(DisplayName = "AC-3708.1 Find는 FindCodesSql 하나만 부르고 @day = 도우미 PC 오늘, @starts = 글자 + '%', @contains = '%' + 글자 + '%', 시간 제한 15초(환자 표 문장은 부르지 않음)")]
    public void FindAsksOnce()
    {
        var db = See();
        Find(db, "ca");

        var call = Assert.Single(db.Calls);
        Assert.Equal(ClosingSql.FindCodesSql, call.Sql);
        Assert.Equal(
            new Dictionary<string, object?> { ["@day"] = "20261110", ["@starts"] = "ca%", ["@contains"] = "%ca%" },
            call.Args);
        Assert.Equal(TimeSpan.FromSeconds(15), call.Timeout);
        Assert.Equal(TimeSpan.FromSeconds(15), ClosingSql.FindTimeout);
    }

    [Fact(DisplayName = "AC-3708.1 코드가 그 글자로 시작하거나 이름에 그 글자가 든 코드만(대소문자 무시), 오늘 쓸 수 없는 줄(적용일 뒤·만료일 앞)은 빠지고 적용일·만료일 당일은 든다, 코드마다 한 줄·대문자·코드 차례")]
    public void FindMatchesCodeStartOrName()
    {
        var db = See(
            new SeeRow("MM010", "물리치료 CA 묶음"),
            new SeeRow("CARM1", "C-arm 유도"),
            new SeeRow("carm1 ", "C-arm 옛 이름"),
            new SeeRow("CAST2", null),
            new SeeRow("XCA9", "엑스"),
            new SeeRow("OLD01", "옛 ca 코드", "20100101", "20261109"),
            new SeeRow("NEW01", "새 ca 코드", "20261111"),
            new SeeRow("EDGE1", "ca 오늘 시작", "20261110"),
            new SeeRow("EDGE2", "ca 오늘 끝", "20200101", "20261110"),
            new SeeRow("   ", "빈 코드 ca"));

        var result = Find(db, "ca");

        Assert.Equal(new[] { "CARM1", "CAST2", "EDGE1", "EDGE2", "MM010" }, CodesOf(result));
        Assert.Equal(new[] { "C-arm 유도", null, "ca 오늘 시작", "ca 오늘 끝", "물리치료 CA 묶음" }, result.Codes.Select(code => code.Name));

        // 한글 이름 가운데
        var korean = See(new SeeRow("MT01", "도수치료30분"), new SeeRow("MT02", "체외충격파"), new SeeRow("MT03", "특수 도수치료"));
        Assert.Equal(new[] { "MT01", "MT03" }, CodesOf(Find(korean, "도수")));
    }

    [Fact(DisplayName = "AC-3708.1 글자 안의 %·_·[는 [%]·[_]·[[]로 바꿔 글자 그대로 찾는다(LA_1이 LAX1을, 50%가 5000을, A[1]이 A1을 찾지 않음)")]
    public void FindEscapesLikeCharacters()
    {
        var db = See(
            new SeeRow("LA_10", "밑줄 코드"),
            new SeeRow("LAX10", "엑스 코드"),
            new SeeRow("5000", "오천"),
            new SeeRow("PCT1", "본인 50% 할인"),
            new SeeRow("A[1]B", "괄호 코드"),
            new SeeRow("A1B", "괄호 없는 코드"));

        Assert.Equal(new[] { "LA_10" }, CodesOf(Find(db, "LA_1")));
        Assert.Equal(new[] { "PCT1" }, CodesOf(Find(db, "50%")));
        Assert.Equal(new[] { "A[1]B" }, CodesOf(Find(db, "A[1]")));

        Assert.Equal("LA[_]1%", db.Calls[0].Args["@starts"]);
        Assert.Equal("%LA[_]1%", db.Calls[0].Args["@contains"]);
        Assert.Equal("50[%]%", db.Calls[1].Args["@starts"]);
        Assert.Equal("A[[]1]%", db.Calls[2].Args["@starts"]);

        var mixed = See();
        Find(mixed, "%_[");
        Assert.Equal("[%][_][[]%", mixed.Calls[0].Args["@starts"]);
        Assert.Equal("%[%][_][[]%", mixed.Calls[0].Args["@contains"]);
        Find(mixed, "[%]");
        Assert.Equal("[[][%]]%", mixed.Calls[1].Args["@starts"]);
    }

    [Fact(DisplayName = "AC-3708.1 30개까지 코드 차례로 돌려준다")]
    public void FindTakesThirty()
    {
        var rows = Enumerable.Range(0, 40).Reverse().Select(i => new SeeRow("CA" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture), "코드" + i)).ToArray();
        var result = Find(See(rows), "CA");

        Assert.Equal(30, result.Codes.Count);
        Assert.Equal(Enumerable.Range(0, 30).Select(i => "CA" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture)), CodesOf(result));
        Assert.Equal(30, ClosingCodes.MaxFound);
    }

    [Fact(DisplayName = "AC-3708.1 도우미 쪽에서도 코드는 앞뒤 공백 뗀 대문자로 겹침 없이(먼저 온 이름) 코드 글자 차례 30개까지, 빈 코드는 빼고 이름은 revenue.days 규칙으로 지운다")]
    public void FindNormalizesRows()
    {
        var db = new FakeDb();
        db.Answer(ClosingSql.FindCodesSql, _ => Enumerable.Range(0, 35).Select(i => new object?[] { " d" + (70 - i) + " ", "이름" + i })
            .Concat(new[]
            {
                new object?[] { "CA1", "도수\r\n치료" },
                new object?[] { "ca1", "다른 이름" },
                new object?[] { "  ", "빈 코드" },
                new object?[] { null, "없는 코드" },
                new object?[] { "CA2", "   " },
                new object?[] { "CA3", null },
            })
            .ToArray());

        var result = Find(db, "ca");

        Assert.Equal(30, result.Codes.Count);
        var expected = new[] { "CA1", "CA2", "CA3" }.Concat(Enumerable.Range(0, 35).Select(i => "D" + (70 - i))).OrderBy(code => code, StringComparer.Ordinal).Take(30);
        Assert.Equal(expected, CodesOf(result));
        Assert.Equal("도수 치료", result.Codes.Single(code => code.Code == "CA1").Name);
        Assert.Null(result.Codes.Single(code => code.Code == "CA2").Name);
        Assert.Null(result.Codes.Single(code => code.Code == "CA3").Name);
    }

    public static IEnumerable<object?[]> BadFindTexts()
    {
        yield return new object?[] { null };
        yield return new object?[] { "" };
        yield return new object?[] { "C" };
        yield return new object?[] { "가" };
        yield return new object?[] { "   " };
        yield return new object?[] { " C " };
        yield return new object?[] { new string('C', 21) };
    }

    [Theory(DisplayName = "AC-3708.1 글자가 없거나 앞뒤 공백을 뗀 뒤 1자·21자 넘음이면 DB에 닿기 전에 E-HELPER-BAD-MESSAGE")]
    [MemberData(nameof(BadFindTexts))]
    public void FindRefusesBadText(string? text)
    {
        var db = See();
        var error = Assert.ThrowsAny<HelperException>(() => Find(db, text));
        Assert.Equal(ErrorCodes.BadMessage, error.Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-3708.1 2자·20자 글자는 받고, 앞뒤 공백은 떼고 찾는다")]
    public void FindAcceptsTwoToTwenty()
    {
        var db = See(new SeeRow("CARM1", "C-arm 유도"));
        Assert.Equal(new[] { "CARM1" }, CodesOf(Find(db, "CA")));
        Assert.Empty(Find(db, new string('C', 20)).Codes);
        Assert.Equal(new[] { "CARM1" }, CodesOf(Find(db, "  ca  ")));
        Assert.Equal("ca%", db.Calls[2].Args["@starts"]);
        Assert.Equal(2, ClosingCodes.MinFindText);
        Assert.Equal(20, ClosingCodes.MaxFindText);
    }

    [Fact(DisplayName = "AC-3708.1 답 JSON은 { codes: [{ code, name }] }이고 이름이 없으면 null, 맞는 코드가 없으면 빈 목록")]
    public void FindAnswerShape()
    {
        var data = ClosingFake.DataOf(Find(See(new SeeRow("CAST2", null)), "ca"));
        Assert.Equal(ClosingFake.Sorted("codes"), ClosingFake.Keys(data));
        var code = Assert.Single(data.GetProperty("codes").EnumerateArray());
        Assert.Equal(ClosingFake.Sorted("code", "name"), ClosingFake.Keys(code));
        Assert.Equal("CAST2", code.GetProperty("code").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, code.GetProperty("name").ValueKind);

        var none = ClosingFake.DataOf(Find(See(), "없는코드"));
        Assert.Equal(0, none.GetProperty("codes").GetArrayLength());
    }

    [Fact(DisplayName = "AC-3708.1 읽기가 실패하거나 줄 칸이 모자라면 지어내지 않고 E-BIT-READ-FAILED")]
    public void FindReadFailure()
    {
        var failing = See();
        failing.Fail(ClosingSql.FindCodesSql, BitErrors.ReadFailed);
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Find(failing, "ca")).Code);

        var shortRow = new FakeDb();
        shortRow.Answer(ClosingSql.FindCodesSql, _ => new[] { new object?[] { "CARM1" } });
        Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => Find(shortRow, "ca")).Code);
    }

    private static readonly Regex Writes = new Regex(
        @"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_",
        RegexOptions.IgnoreCase);

    [Fact(DisplayName = "AC-3708.1 FindCodesSql은 SELECT 한 문장(;·주석·쓰기 낱말 없음)이고 dbo.SeeMst만 읽으며 환자 표(PbsInf·OcmInf·OdrInf·OrpInf·OrcInf·RsvInf)·차트번호를 읽지 않는다, 오늘 쓸 수 있는 줄·TOP 30·코드 차례")]
    public void FindSqlReadsOnlyCodeTable()
    {
        var sql = ClosingSql.FindCodesSql;
        Assert.StartsWith("SELECT TOP 30 ", sql, StringComparison.Ordinal);
        Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
        Assert.DoesNotMatch(Writes, sql);
        Assert.Single(Regex.Matches(sql, @"\bSELECT\b").Cast<Match>());
        Assert.Equal(new[] { "SeeMst" }, Regex.Matches(sql, @"\bdbo\.(\w+)").Cast<Match>().Select(m => m.Groups[1].Value));
        foreach (var patient in new[] { "Pbs", "OcmInf", "OdrInf", "OrpInf", "OrcInf", "RsvInf", "RsvLog", "DepMst", "ChtNum", "BirDte", "PatNam" }) Assert.DoesNotContain(patient, sql, StringComparison.Ordinal);
        Assert.Contains("@day BETWEEN s.SeeAdpDte AND s.SeeExpDte", sql, StringComparison.Ordinal);
        Assert.Contains("(s.SeeOdrCod LIKE @starts OR s.SeeKorNam LIKE @contains)", sql, StringComparison.Ordinal);
        Assert.EndsWith("GROUP BY UPPER(LTRIM(RTRIM(s.SeeOdrCod))) ORDER BY Code", sql, StringComparison.Ordinal);
        Assert.Equal(
            new[] { "@contains", "@day", "@starts" },
            Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal));
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
