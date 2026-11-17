using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Check;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;
using Precheck.Core.Tests.Bit;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 SettingsRoutes 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.SettingsRoutes;

/// <summary>바꿀 수 있는 가짜 시계(코드 목록 5분 기억·8초 시간 제한을 잰다).</summary>
internal sealed class StepClock
{
    public StepClock(DateTime start)
    {
        At = start;
    }

    public DateTime At { get; set; }

    public DateTime Now() => At;

    public void Advance(TimeSpan by) => At += by;
}

/// <summary>
/// 지난 30일 처방 목록·코드 이름 읽기(CodesReader, spec reception-other-clinic design.md 4절, REQ-5705).
/// AC-5705.1 등록 확인을 지나 RecentCodes(지난 30일 이 병원 외래 접수 처방 줄의 코드마다 내원 수, AA로 시작하는 코드 뺌, 200개까지) → 같은 세션에서 RxNames.
/// AC-5705.2 코드 하나의 이름(CodeName). 코드 모양이 ^[0-9A-Za-z가-힣_]{1,16}$가 아니면 비트를 읽지 않는다.
/// AC-5705.3 이름은 40글자에서 자르고 제어 글자는 뺀다. 답에는 코드·이름·내원 수만, 실패·8초 넘음은 오류 번호만.
/// AC-5705.4 새 문장 둘은 Sql.IsAllowed가 받고 고친 글은 받지 않는다.
/// 가짜 비트(Rig)·가짜 처방 코드만 쓴다.
/// </summary>
public class CodesReaderTests
{
    private static readonly DateTime Morning = new DateTime(2026, 11, 5, 10, 0, 0);

    private static (Rig Bit, StepClock Clock, CodesReader Reader) Open(bool registered = true)
    {
        var bit = new Rig();
        if (registered) bit.Registered();
        bit.Today = Morning.Date;
        var clock = new StepClock(Morning);
        return (bit, clock, new CodesReader(bit.Services, clock.Now));
    }

    private static void Answer(Rig bit, params object?[][] rows) => bit.Session.Answer(ReceptionSql.RecentCodes, _ => rows);

    private static void Names(Rig bit, params object?[][] rows) => bit.Session.Answer(ReceptionSql.RxNames, _ => rows);

    private static int Reads(Rig bit, string sql) => bit.Session.Calls.Count(call => call.Sql == sql);

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    // ---- AC-5705.1 지난 30일 처방 목록 ------------------------------------------------------------------

    [Fact(DisplayName = "AC-5705.1 등록 확인을 지난 세션에서 RecentCodes(@from 오늘−30일 0000·@to 내일 0000·@hospital 등록 범위)를 돌리고 같은 세션에서 RxNames로 이름을 붙여 내원 수 많은 순 그대로 준다")]
    public void ReadsRecentCodes()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        Answer(bit, new object?[] { "SONO1", 12L }, new object?[] { "MM051", 7L }, new object?[] { "IMS1", 3L });
        Names(bit, new object?[] { "SONO1", "초음파(근골격)" }, new object?[] { "MM051", "도수치료" });

        var result = reader.Codes();

        Assert.True(result.IsOk);
        Assert.Null(result.Error);
        Assert.Equal(new[] { "SONO1", "MM051", "IMS1" }, result.Codes.Select(c => c.Code).ToArray());
        Assert.Equal(new[] { "초음파(근골격)", "도수치료", null }, result.Codes.Select(c => c.Name).ToArray());
        Assert.Equal(new[] { 12L, 7L, 3L }, result.Codes.Select(c => c.Visits).ToArray());

        var recent = bit.Session.Calls.Single(call => call.Sql == ReceptionSql.RecentCodes);
        Assert.Equal("202610060000", recent.Args["@from"]);
        Assert.Equal("202611060000", recent.Args["@to"]);
        Assert.Equal(Synthetic.Scope, recent.Args["@hospital"]);
        Assert.Equal(3, recent.Args.Count);
        Assert.Equal(1, Reads(bit, ReceptionSql.RxNames));
        // 등록 확인(기관기호) 뒤에 읽고, 한 세션만 열었다가 닫는다
        var sqls = bit.Session.Sqls.ToList();
        Assert.True(sqls.IndexOf(Sql.InstitutionSql) >= 0 && sqls.IndexOf(Sql.InstitutionSql) < sqls.IndexOf(ReceptionSql.RecentCodes));
        Assert.True(sqls.IndexOf(ReceptionSql.RecentCodes) < sqls.IndexOf(ReceptionSql.RxNames));
        Assert.Single(bit.Connector.Opened);
        Assert.Equal(1, bit.Session.Disposed);
    }

    [Fact(DisplayName = "AC-5705.1 RecentCodes는 CheckSql.ArrangeCodes와 같은 셈(지난 30일 이 병원 외래 접수·살아 있는 처방 줄·코드마다 내원 수·많은 순 200줄)에 AA로 시작하는 코드 빼기만 더한 SELECT 하나다")]
    public void RecentCodesIsArrangeCodesWithoutVisitFees()
    {
        var recent = Squash(ReceptionSql.RecentCodes);
        var expected = Squash(CheckSql.ArrangeCodes)
            .Replace(",COUNT_BIG(*) RxRows", "")
            .Replace(" GROUP BY ", " AND UPPER(LTRIM(RTRIM(o.OdrCod))) NOT LIKE 'AA%' GROUP BY ");
        Assert.Equal(expected, recent);
        Assert.StartsWith("SELECT TOP 200 UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(DISTINCT o.OdrOcmNum) Visits FROM ", recent, StringComparison.Ordinal);
        Assert.EndsWith(" ORDER BY Visits DESC,Code", recent, StringComparison.Ordinal);
        Assert.Contains("d.DepHspNum=@hospital", recent, StringComparison.Ordinal);
        Assert.Contains("c.OcmPatTyp='O'", recent, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5705.1 코드는 앞뒤 공백을 뺀 대문자이고, 설정 코드 모양(^[0-9A-Z가-힣_]{1,16}$)이 아니거나 앞 줄과 같은 코드는 빼며, 내원 수가 숫자가 아니면 읽기 실패다")]
    public void CodesAreCleaned()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        Answer(bit,
            new object?[] { " SONO1 ", 9L },
            new object?[] { "A-B", 8L },
            new object?[] { "TOOLONGCODE123456", 7L },
            new object?[] { null, 6L },
            new object?[] { "SONO1", 5L },
            new object?[] { "체외충격파", 4 },
            new object?[] { "MM_1", 3m });
        Names(bit, new object?[] { "SONO1", "초음파" });

        var result = reader.Codes();

        Assert.True(result.IsOk);
        Assert.Equal(new[] { "SONO1", "체외충격파", "MM_1" }, result.Codes.Select(c => c.Code).ToArray());
        Assert.Equal(new[] { 9L, 4L, 3L }, result.Codes.Select(c => c.Visits).ToArray());
        Assert.Equal("초음파", result.Codes[0].Name);

        var (bad, _, badReader) = Open();
        using var _bad = bad;
        Answer(bad, new object?[] { "SONO1", "많음" });
        Names(bad);
        var failed = badReader.Codes();
        Assert.False(failed.IsOk);
        Assert.Equal(BitErrors.ReadFailed, failed.Error);
    }

    [Fact(DisplayName = "AC-5705.1 처방 줄이 없으면 이름표를 읽지 않고 빈 목록 {\"codes\":[]}이다")]
    public void NoCodes()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        Answer(bit);

        var result = reader.Codes();

        Assert.True(result.IsOk);
        Assert.Empty(result.Codes);
        Assert.Equal("{\"codes\":[]}", result.ToJson());
        Assert.Equal(0, Reads(bit, ReceptionSql.RxNames));
    }

    [Fact(DisplayName = "AC-5705.1 답은 {\"codes\":[{\"c\",\"n\",\"v\"}]}이고 이름이 없으면 n은 null이다(한국어는 그대로, HTML 뜻 글자는 \\u)")]
    public void CodesJson()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        Answer(bit, new object?[] { "SONO1", 12L }, new object?[] { "IMS1", 3L });
        Names(bit, new object?[] { "SONO1", "초음파<근골격>" });

        Assert.Equal(
            "{\"codes\":[{\"c\":\"SONO1\",\"n\":\"초음파\\u003C근골격\\u003E\",\"v\":12},{\"c\":\"IMS1\",\"n\":null,\"v\":3}]}",
            reader.Codes().ToJson());
    }

    [Fact(DisplayName = "AC-5705.1 읽은 목록은 5분 동안 기억해 다시 비트를 읽지 않고, 5분이 지나거나 날이 바뀌면 다시 읽으며, 실패는 기억하지 않는다")]
    public void CodesAreKeptFiveMinutes()
    {
        var (bit, clock, reader) = Open();
        using var _bit = bit;
        Answer(bit, new object?[] { "SONO1", 12L });
        Names(bit, new object?[] { "SONO1", "초음파" });

        Assert.Equal(TimeSpan.FromMinutes(5), CodesReader.Keep);
        Assert.True(reader.Codes().IsOk);
        clock.Advance(TimeSpan.FromMinutes(4) + TimeSpan.FromSeconds(59));
        Assert.True(reader.Codes().IsOk);
        Assert.Equal(1, Reads(bit, ReceptionSql.RecentCodes));
        Assert.Single(bit.Connector.Opened);

        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.True(reader.Codes().IsOk);
        Assert.Equal(2, Reads(bit, ReceptionSql.RecentCodes));

        // 날이 바뀌면(5분 안이어도) 다시 읽는다
        var (next, nextClock, nextReader) = Open();
        using var _next = next;
        Answer(next, new object?[] { "SONO1", 12L });
        Names(next, new object?[] { "SONO1", "초음파" });
        nextClock.At = new DateTime(2026, 11, 5, 23, 59, 0);
        Assert.True(nextReader.Codes().IsOk);
        nextClock.At = new DateTime(2026, 11, 6, 0, 0, 30);
        Assert.True(nextReader.Codes().IsOk);
        Assert.Equal(2, Reads(next, ReceptionSql.RecentCodes));
        Assert.Equal("202610070000", next.Session.Calls.Last(call => call.Sql == ReceptionSql.RecentCodes).Args["@from"]);

        // 실패는 기억하지 않는다
        var (failing, _, failingReader) = Open();
        using var _failing = failing;
        failing.Session.Fail(ReceptionSql.RecentCodes, BitErrors.ReadFailed);
        Assert.False(failingReader.Codes().IsOk);
        Answer(failing, new object?[] { "SONO1", 12L });
        Names(failing, new object?[] { "SONO1", "초음파" });
        Assert.True(failingReader.Codes().IsOk);
        Assert.Equal(2, Reads(failing, ReceptionSql.RecentCodes));
    }

    // ---- AC-5705.2 코드 하나 이름 ----------------------------------------------------------------------

    [Theory(DisplayName = "AC-5705.2 코드가 ^[0-9A-Za-z가-힣_]{1,16}$면 CodeName(@code = 대문자)으로 사전 이름 하나를 읽고, 없으면 이름 null이다")]
    [InlineData("SONO1", "SONO1")]
    [InlineData("sono1", "SONO1")]
    [InlineData("체외충격파", "체외충격파")]
    [InlineData("MM_051", "MM_051")]
    [InlineData("A234567890123456", "A234567890123456")]
    [InlineData("가나다라마바사아자차카타파하가나", "가나다라마바사아자차카타파하가나")]
    public void NameOfCode(string code, string upper)
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        bit.Session.Answer(ReceptionSql.CodeName, args => (string?)args["@code"] == upper ? new[] { new object?[] { "초음파(근골격)" } } : new object?[0][]);

        var result = reader.Name(code);

        Assert.Equal(HistoryState.Ok, result.State);
        Assert.Equal(upper, result.Code);
        Assert.Equal("초음파(근골격)", result.Name);
        var call = bit.Session.Calls.Single(c => c.Sql == ReceptionSql.CodeName);
        Assert.Equal(upper, call.Args["@code"]);
        Assert.Single(call.Args);
        Assert.Equal("{\"c\":\"" + upper + "\",\"n\":\"초음파(근골격)\"}", result.ToJson());

        bit.Session.Answer(ReceptionSql.CodeName, _ => new object?[0][]);
        var missing = reader.Name(code);
        Assert.Equal(HistoryState.Ok, missing.State);
        Assert.Null(missing.Name);
        Assert.Equal("{\"c\":\"" + upper + "\",\"n\":null}", missing.ToJson());
    }

    [Theory(DisplayName = "AC-5705.2 코드 모양이 틀리면(빈 글·17글자·- 공백 / . % 줄바꿈·한자) 비트를 열지 않고 NotFound다")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("A2345678901234567")]
    [InlineData("A-B")]
    [InlineData("A B")]
    [InlineData("A/B")]
    [InlineData("A.B")]
    [InlineData("A%41")]
    [InlineData("SONO1\n")]
    [InlineData("ㄱ")]
    [InlineData("漢字")]
    public void BadCodeNotRead(string? code)
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        bit.Session.Answer(ReceptionSql.CodeName, _ => new[] { new object?[] { "이름" } });

        var result = reader.Name(code);

        Assert.Equal(HistoryState.NotFound, result.State);
        Assert.Empty(bit.Connector.Opened);
        Assert.Empty(bit.Session.Calls);
        Assert.False(CodesReader.IsCode(code));
    }

    // ---- AC-5705.3 이름 정리·실패 ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-5705.3 이름은 제어 글자를 빼고 앞뒤 공백을 지운 뒤 40글자에서 자르며(대리쌍은 가르지 않음), 남은 글이 없으면 null이다")]
    public void NamesAreCleaned()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        var long45 = new string('가', 45);
        var emoji = new string('나', 39) + "😀끝";
        Answer(bit, new object?[] { "A1", 5L }, new object?[] { "A2", 4L }, new object?[] { "A3", 3L }, new object?[] { "A4", 2L });
        Names(bit,
            new object?[] { "A1", " 초음파\r\n(근골격)\t\u0007 " },
            new object?[] { "A2", long45 },
            new object?[] { "A3", "\u0001\u0002 " },
            new object?[] { "A4", emoji });

        var codes = reader.Codes().Codes;

        Assert.Equal("초음파(근골격)", codes[0].Name);
        Assert.Equal(new string('가', 40), codes[1].Name);
        Assert.Null(codes[2].Name);
        Assert.Equal(new string('나', 39) + "😀", codes[3].Name);

        bit.Session.Answer(ReceptionSql.CodeName, _ => new[] { new object?[] { long45 + "\n" } });
        Assert.Equal(new string('가', 40), reader.Name("A2").Name);
    }

    [Fact(DisplayName = "AC-5705.3 답에는 코드·이름·내원 수만 있고 문장은 코드·내원 수(RecentCodes)·이름(CodeName)만 읽는다(환자·내원·차트 번호·날짜·메모 칸 없음)")]
    public void AnswersCarryCodesOnly()
    {
        var (bit, _, reader) = Open();
        using var _bit = bit;
        Answer(bit, new object?[] { "SONO1", 12L });
        Names(bit, new object?[] { "SONO1", "초음파" });
        bit.Session.Answer(ReceptionSql.CodeName, _ => new[] { new object?[] { "초음파" } });

        using (var list = JsonDocument.Parse(reader.Codes().ToJson()))
        {
            Assert.Equal(new[] { "codes" }, list.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
            foreach (var code in list.RootElement.GetProperty("codes").EnumerateArray())
                Assert.Equal(new[] { "c", "n", "v" }, code.EnumerateObject().Select(p => p.Name).ToArray());
        }
        using (var one = JsonDocument.Parse(reader.Name("SONO1").ToJson()))
        {
            Assert.Equal(new[] { "c", "n" }, one.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        }

        var recent = Squash(ReceptionSql.RecentCodes);
        var select = recent.Substring(0, recent.IndexOf(" FROM ", StringComparison.Ordinal));
        Assert.Equal("SELECT TOP 200 UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(DISTINCT o.OdrOcmNum) Visits", select);
        var name = Squash(ReceptionSql.CodeName);
        Assert.StartsWith("SELECT TOP 1 RTRIM(s.SeeKorNam) Name FROM dbo.SeeMst s WHERE ", name, StringComparison.Ordinal);
        foreach (var sql in new[] { ReceptionSql.RecentCodes, ReceptionSql.CodeName })
        {
            foreach (var word in new[] { "ChtNum", "PatNam", "ResNum", "Cmt", "EmrInf", "PbsInf", "OrcInf" }) Assert.DoesNotContain(word, sql, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-5705.3 CodeName은 RxNames와 같은 규칙(코드 UPPER(RTRIM)마다 적용일이 가장 늦은 것, 같으면 끝일이 늦은 것, 그다음 이름 순)의 첫 줄이다")]
    public void CodeNameFollowsRxNamesRule()
    {
        Assert.Equal(
            "SELECT TOP 1 RTRIM(s.SeeKorNam) Name FROM dbo.SeeMst s WHERE UPPER(RTRIM(s.SeeOdrCod))=@code ORDER BY s.SeeAdpDte DESC,s.SeeExpDte DESC,s.SeeKorNam",
            Squash(ReceptionSql.CodeName));
        Assert.Contains("ORDER BY s.SeeAdpDte DESC,s.SeeExpDte DESC,s.SeeKorNam", Squash(ReceptionSql.RxNames), StringComparison.Ordinal);
        Assert.Contains("PARTITION BY UPPER(RTRIM(s.SeeOdrCod))", Squash(ReceptionSql.RxNames), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-5705.3 비트 읽기가 실패하거나 등록이 없으면 Unavailable(오류 번호만)이고, 문장마다 남은 시간(8초 안)만 넘기며 8초가 지나면 읽기 실패다")]
    public void FailuresAreCodesOnly()
    {
        var (unregistered, _, unregisteredReader) = Open(registered: false);
        using var _unregistered = unregistered;
        var none = unregisteredReader.Codes();
        Assert.False(none.IsOk);
        Assert.Equal(BitErrors.NotRegistered, none.Error);
        Assert.Equal(HistoryState.Unavailable, unregisteredReader.Name("SONO1").State);
        Assert.Equal(BitErrors.NotRegistered, unregisteredReader.Name("SONO1").Error);

        var (failing, _, failingReader) = Open();
        using var _failing = failing;
        failing.Session.Fail(ReceptionSql.RecentCodes, BitErrors.DbFailed);
        failing.Session.Fail(ReceptionSql.CodeName, BitErrors.DbFailed);
        Assert.Equal(BitErrors.DbFailed, failingReader.Codes().Error);
        var name = failingReader.Name("SONO1");
        Assert.Equal(HistoryState.Unavailable, name.State);
        Assert.Equal(BitErrors.DbFailed, name.Error);
        Assert.Null(name.Name);

        // 처방 줄을 읽는 데 9초가 걸리면 이름표는 돌리지 않고 읽기 실패다
        var (slow, slowClock, slowReader) = Open();
        using var _slow = slow;
        slow.Session.Answer(ReceptionSql.RecentCodes, _ =>
        {
            slowClock.Advance(TimeSpan.FromSeconds(9));
            return new[] { new object?[] { "SONO1", 1L } };
        });
        Names(slow, new object?[] { "SONO1", "초음파" });
        var late = slowReader.Codes();
        Assert.False(late.IsOk);
        Assert.Equal(BitErrors.ReadFailed, late.Error);
        Assert.Equal(0, Reads(slow, ReceptionSql.RxNames));
        Assert.All(slow.Session.Calls.Where(call => call.Sql == ReceptionSql.RecentCodes), call => Assert.True(call.Timeout <= TimeSpan.FromSeconds(8) && call.Timeout > TimeSpan.Zero));
    }

    // ---- AC-5705.4 허용 목록 ----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-5705.4 RecentCodes(@from·@to Char 12·@hospital VarChar 32)·CodeName(@code VarChar 16)은 ReceptionSql 매개변수 표에 있고 Sql.IsAllowed가 받으며 ReadOnlyGuard가 그 매개변수와 함께 통과시킨다")]
    public void NewStatementsAllowed()
    {
        Assert.Equal(new[] { "@from:Char:12", "@to:Char:12", "@hospital:VarChar:32" },
            ReceptionSql.Parameters[ReceptionSql.RecentCodes].Select(p => p.Name + ":" + p.Kind + ":" + p.Size).ToArray());
        Assert.Equal(new[] { "@code:VarChar:16" },
            ReceptionSql.Parameters[ReceptionSql.CodeName].Select(p => p.Name + ":" + p.Kind + ":" + p.Size).ToArray());
        foreach (var sql in new[] { ReceptionSql.RecentCodes, ReceptionSql.CodeName })
        {
            Assert.True(Sql.IsAllowed(sql));
            Assert.Same(ReceptionSql.Parameters[sql], Sql.ParametersOf(sql));
            var named = Regex.Matches(sql, @"@\w+").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(named, ReceptionSql.Parameters[sql].Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal));
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("--", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("/*", sql, StringComparison.Ordinal);
        }
        ReadOnlyGuard.Require(ReceptionSql.RecentCodes, new Dictionary<string, object?> { ["@from"] = "202610060000", ["@to"] = "202611060000", ["@hospital"] = Synthetic.Scope });
        ReadOnlyGuard.Require(ReceptionSql.CodeName, new Dictionary<string, object?> { ["@code"] = new string('가', 16) });
        Assert.Throws<BitException>(() => ReadOnlyGuard.Require(ReceptionSql.CodeName, new Dictionary<string, object?> { ["@code"] = new string('가', 17) }));
        Assert.Throws<BitException>(() => ReadOnlyGuard.Require(ReceptionSql.CodeName, new Dictionary<string, object?>()));
    }

    [Fact(DisplayName = "AC-5705.4 글자를 고친 문장(끝 공백·덧붙인 DELETE·소문자·병원·코드 값을 글로 박음)과 확인 명령의 ArrangeCodes는 지금처럼 받지 않는다")]
    public void ChangedStatementsRefused()
    {
        foreach (var sql in new[] { ReceptionSql.RecentCodes, ReceptionSql.CodeName })
        {
            var changed = new List<string> { sql + " ", sql + "; DELETE FROM dbo.OdrInf", sql.ToLowerInvariant(), sql.Replace("SELECT ", "SELECT  ") };
            if (sql.Contains("@hospital")) changed.Add(sql.Replace("@hospital", "'SYNTHETIC'"));
            if (sql.Contains("@code")) changed.Add(sql.Replace("@code", "'SONO1'"));
            foreach (var bad in changed)
            {
                Assert.False(Sql.IsAllowed(bad));
                Assert.Equal(BitErrors.ReadFailed, Assert.Throws<BitException>(() => ReadOnlyGuard.Require(bad)).Code);
            }
        }
        Assert.False(Sql.IsAllowed(CheckSql.ArrangeCodes));
        Assert.False(CheckSql.IsAllowed(ReceptionSql.RecentCodes));
    }

    [Fact(DisplayName = "AC-5705.4 새 문장이 읽는 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql·지금 ReceptionSql)이 이미 읽는 것뿐이다")]
    public void ReadsOnlyKnownColumns()
    {
        var bitName = new Regex(@"\b[A-Z][a-z]{2}(?:[A-Z][a-z]{2})+\b");
        var mine = new HashSet<string>(new[] { ReceptionSql.RecentCodes, ReceptionSql.CodeName }, StringComparer.Ordinal);
        var others = Sql.All.Concat(StatsSql.All).Concat(RevenueSql.Parameters.Keys).Concat(ReceptionSql.Parameters.Keys.Where(sql => !mine.Contains(sql)));
        var known = new HashSet<string>(others.SelectMany(sql => bitName.Matches(sql).Cast<Match>().Select(m => m.Value)), StringComparer.Ordinal);
        var used = mine.SelectMany(sql => bitName.Matches(sql).Cast<Match>().Select(m => m.Value)).Distinct().ToArray();
        Assert.Contains("SeeOdrCod", used);
        Assert.Contains("OdrOcmNum", used);
        Assert.All(used, name => Assert.Contains(name, known));
    }
}
