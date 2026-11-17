using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.PtSlip;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.PtSlip;

/// <summary>
/// spec pt-slip REQ-6402: 차트번호 정리(ChartInput), 항목·부위 고르기(SlipPicks), 비트에서 이름 찾기(SlipNames).
/// 비트 DB는 가짜(FakeDb)다. 차트번호·이름은 모두 지어낸 것(9로 시작하는 번호, '가상환자NN').
/// </summary>
public class SlipPickTests
{
    private const string FakeName = "가상환자01";

    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static SlipPicks Picks(params string[] steps)
    {
        // "i:HP" = 항목 누름, "s:오른" = 쪽 누름, "p:어깨" = 부위 누름, "x:오른 어깨" = ✕
        var picks = new SlipPicks();
        foreach (var step in steps)
        {
            var value = step.Substring(2);
            switch (step[0])
            {
                case 'i': picks.ToggleItem(value); break;
                case 's': picks.ToggleSide(value); break;
                case 'p': picks.AddPart(value); break;
                case 'x': picks.RemovePart(value); break;
                default: throw new ArgumentException(step);
            }
        }
        return picks;
    }

    // ── AC-6402.1 차트번호 글 정리 ─────────────────────────────

    [Theory(DisplayName = "AC-6402.1 차트번호 글: 숫자만 남기고 앞의 0을 빼서 1~14자리면 찾는다, 빈 글은 Empty, 그 밖은 Invalid")]
    [InlineData(null, ChartKind.Empty, "")]
    [InlineData("", ChartKind.Empty, "")]
    [InlineData("   ", ChartKind.Empty, "")]
    [InlineData(" \t\r\n", ChartKind.Empty, "")]
    [InlineData("90001", ChartKind.Ok, "90001")]
    [InlineData("  0090001 ", ChartKind.Ok, "90001")]
    [InlineData("9-0 0a01", ChartKind.Ok, "90001")]
    [InlineData("9", ChartKind.Ok, "9")]
    [InlineData("90000000000001", ChartKind.Ok, "90000000000001")]
    [InlineData("0090000000000001", ChartKind.Ok, "90000000000001")]
    [InlineData("900000000000001", ChartKind.Invalid, "")]
    [InlineData("abc", ChartKind.Invalid, "")]
    [InlineData("가상", ChartKind.Invalid, "")]
    [InlineData("0", ChartKind.Invalid, "")]
    [InlineData(" 000 ", ChartKind.Invalid, "")]
    [InlineData("-", ChartKind.Invalid, "")]
    public void ChartTextIsCleaned(string? text, ChartKind kind, string number)
    {
        var chart = ChartInput.Parse(text);
        Assert.Equal(kind, chart.Kind);
        Assert.Equal(number, chart.Number);
    }

    // ── AC-6402.2 항목·부위 고르기 ─────────────────────────────

    [Fact(DisplayName = "AC-6402.2 항목 버튼은 켜고 끄고, 종이 글은 누른 차례로 ', '로 잇는다(껐다 다시 켜면 끝으로)")]
    public void ItemsToggleInPressOrder()
    {
        var picks = Picks("i:HP", "i:ICT", "i:견인");
        Assert.True(picks.IsItemOn("HP"));
        Assert.True(picks.IsItemOn("견인"));
        Assert.False(picks.IsItemOn("도수"));
        Assert.Equal(new[] { "HP", "ICT", "견인" }, picks.Items);
        Assert.Equal("HP, ICT, 견인", picks.ItemsText);

        picks.ToggleItem("HP");
        Assert.False(picks.IsItemOn("HP"));
        Assert.Equal("ICT, 견인", picks.ItemsText);

        picks.ToggleItem("HP");
        Assert.Equal(new[] { "ICT", "견인", "HP" }, picks.Items);
        Assert.Equal("ICT, 견인, HP", picks.ItemsText);
    }

    [Fact(DisplayName = "AC-6402.2 처음엔 아무것도 안 골라서 종이 글은 빈칸, 쪽도 없다")]
    public void NewPicksAreEmpty()
    {
        var picks = new SlipPicks();
        Assert.Empty(picks.Items);
        Assert.Empty(picks.Parts);
        Assert.Null(picks.PendingSide);
        Assert.Equal("", picks.ItemsText);
        Assert.Equal("", picks.PartsText);
        Assert.Equal(new[] { "오른", "왼", "양" }, SlipPicks.Sides);
    }

    [Fact(DisplayName = "AC-6402.2 쪽 버튼: 누르면 골라지고, 같은 쪽을 다시 누르면 풀리고, 다른 쪽을 누르면 바뀐다")]
    public void SideToggles()
    {
        var picks = new SlipPicks();
        picks.ToggleSide("오른");
        Assert.Equal("오른", picks.PendingSide);
        picks.ToggleSide("오른");
        Assert.Null(picks.PendingSide);
        picks.ToggleSide("오른");
        picks.ToggleSide("왼");
        Assert.Equal("왼", picks.PendingSide);
        picks.ToggleSide("양");
        Assert.Equal("양", picks.PendingSide);
    }

    [Fact(DisplayName = "AC-6402.2 쪽을 누른 뒤 부위를 누르면 '오른 어깨'로 들어가고 쪽은 풀린다, 쪽 없이 누르면 '허리'")]
    public void SideThenPart()
    {
        var picks = Picks("s:오른", "p:어깨");
        Assert.Null(picks.PendingSide);
        Assert.Equal(new[] { "오른 어깨" }, picks.Parts);

        picks.AddPart("허리");
        picks.ToggleSide("양");
        picks.AddPart("발목");
        Assert.Equal(new[] { "오른 어깨", "허리", "양 발목" }, picks.Parts);
        Assert.Equal("오른 어깨, 허리, 양 발목", picks.PartsText);
    }

    [Fact(DisplayName = "AC-6402.2 겹친 부위는 안 들어가고(그래도 쪽은 풀림), 쪽이 다르면 다른 부위다")]
    public void RepeatedPartIsNotAdded()
    {
        var picks = Picks("s:오른", "p:어깨", "p:허리", "p:허리");
        Assert.Equal(new[] { "오른 어깨", "허리" }, picks.Parts);

        picks.ToggleSide("오른");
        picks.AddPart("어깨");
        Assert.Null(picks.PendingSide);
        Assert.Equal(new[] { "오른 어깨", "허리" }, picks.Parts);

        picks.ToggleSide("왼");
        picks.AddPart("어깨");
        picks.AddPart("어깨");
        Assert.Equal(new[] { "오른 어깨", "허리", "왼 어깨", "어깨" }, picks.Parts);
    }

    [Fact(DisplayName = "AC-6402.2 고른 부위는 ✕로 뺀다(남은 차례는 그대로, 뺀 것은 다시 넣을 수 있다)")]
    public void RemovePart()
    {
        var picks = Picks("s:오른", "p:어깨", "p:허리", "s:왼", "p:무릎");
        picks.RemovePart("오른 어깨");
        Assert.Equal(new[] { "허리", "왼 무릎" }, picks.Parts);
        Assert.Equal("허리, 왼 무릎", picks.PartsText);

        picks.RemovePart("없는 부위");
        Assert.Equal(new[] { "허리", "왼 무릎" }, picks.Parts);

        picks.ToggleSide("오른");
        picks.AddPart("어깨");
        Assert.Equal("허리, 왼 무릎, 오른 어깨", picks.PartsText);
    }

    // ── AC-6402.3 비트에서 이름 찾기 ─────────────────────────────

    [Fact(DisplayName = "AC-6402.3 이름 SQL은 dbo.PbsInf에서 LTRIM(RTRIM(PbsChtNum))=@cht인 이름만 읽는 SELECT 하나이고 관문을 @cht(글자 14자까지)와 함께만 지난다")]
    public void NameSqlIsGuardedSelect()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        var sql = SlipNames.Sql;
        Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
        Assert.Contains("PbsPatNam", sql, StringComparison.Ordinal);
        Assert.Contains("FROM dbo.PbsInf WHERE LTRIM(RTRIM(PbsChtNum))=@cht", Squash(sql), StringComparison.Ordinal);
        Assert.DoesNotContain(";", sql);
        Assert.DoesNotContain("--", sql);
        Assert.DoesNotContain("/*", sql);
        Assert.DoesNotMatch(forbidden, sql);
        foreach (var column in new[] { "PbsJmnNum", "PbsCelPhn", "PbsPhnNum", "PbsAdr" }) Assert.DoesNotContain(column, sql, StringComparison.Ordinal);

        Assert.True(Sql.IsAllowed(sql));
        Assert.False(Sql.IsAllowed(sql + " "));
        Assert.False(Sql.IsAllowed(sql.Replace("@cht", "'90001'")));
        Assert.DoesNotContain(sql, Sql.All);
        Assert.Equal(new[] { "@cht:VarChar(14)" }, Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

        ReadOnlyGuard.Require(sql, new Dictionary<string, object?> { ["@cht"] = "90000000000001" });
        foreach (var bad in new[]
        {
            new Dictionary<string, object?> { ["@cht"] = "900000000000001" },
            new Dictionary<string, object?> { ["@cht"] = 90001 },
            new Dictionary<string, object?> { ["@cht"] = null },
            new Dictionary<string, object?>(),
            new Dictionary<string, object?> { ["@cht"] = "90001", ["@name"] = "x" },
        })
        {
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, bad)).Code);
        }
    }

    [Fact(DisplayName = "AC-6402.3 찾음: 정리한 번호를 @cht 매개변수로 5초 안에 읽고, 이름은 앞뒤 빈칸을 빼서 보인다")]
    public void FindsName()
    {
        var db = new FakeDb().Answer(SlipNames.Sql, args => Equals(args["@cht"], "90001") ? new[] { new object?[] { FakeName + "   " } } : Array.Empty<object?[]>());

        var result = SlipNames.Find(db, ChartInput.Parse(" 0090001"));

        Assert.Equal(NameKind.Found, result.Kind);
        Assert.Equal(FakeName, result.Name);
        Assert.Equal(FakeName, SlipNames.Message(result));
        var call = Assert.Single(db.Calls);
        Assert.Equal(SlipNames.Sql, call.Sql);
        Assert.Equal(new[] { "@cht" }, call.Args.Keys);
        Assert.Equal("90001", call.Args["@cht"]);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);
    }

    [Fact(DisplayName = "AC-6402.3 없음: 줄이 없거나 이름이 비었으면 '없는 차트번호예요'")]
    public void NotFound()
    {
        var none = new FakeDb().Answer(SlipNames.Sql, _ => Array.Empty<object?[]>());
        var nullName = new FakeDb().Answer(SlipNames.Sql, _ => new[] { new object?[] { null } });
        var blankName = new FakeDb().Answer(SlipNames.Sql, _ => new[] { new object?[] { "   " } });

        foreach (var db in new[] { none, nullName, blankName })
        {
            var result = SlipNames.Find(db, ChartInput.Parse("90002"));
            Assert.Equal(NameKind.NotFound, result.Kind);
            Assert.Equal("", result.Name);
            Assert.Equal("없는 차트번호예요", SlipNames.Message(result));
            Assert.Single(db.Calls);
        }
    }

    [Fact(DisplayName = "AC-6402.3 빈칸이면 DB에 가지 않고 '차트번호를 넣으면 이름이 나와요', 틀린 번호도 DB에 가지 않고 '없는 차트번호예요'")]
    public void EmptyAndInvalidSkipDb()
    {
        var db = new FakeDb().Answer(SlipNames.Sql, _ => new[] { new object?[] { FakeName } });

        var empty = SlipNames.Find(db, ChartInput.Parse("  "));
        Assert.Equal(NameKind.Empty, empty.Kind);
        Assert.Equal("", empty.Name);
        Assert.Equal("차트번호를 넣으면 이름이 나와요", SlipNames.Message(empty));

        foreach (var text in new[] { "abc", "000", "900000000000001" })
        {
            var invalid = SlipNames.Find(db, ChartInput.Parse(text));
            Assert.Equal(NameKind.NotFound, invalid.Kind);
            Assert.Equal("없는 차트번호예요", SlipNames.Message(invalid));
        }
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-6402.3 오류: 비트 읽기가 실패하면 '비트에서 이름을 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.'")]
    public void ReadFailure()
    {
        var failing = new FakeDb().Fail(SlipNames.Sql, BitErrors.ReadFailed);
        var unanswered = new FakeDb();
        var throwing = new FakeDb().Answer(SlipNames.Sql, _ => throw new InvalidOperationException("연결 끊김"));

        foreach (IBitDb? db in new IBitDb?[] { failing, unanswered, throwing, null })
        {
            var result = SlipNames.Find(db!, ChartInput.Parse("90001"));
            Assert.Equal(NameKind.Failed, result.Kind);
            Assert.Equal("", result.Name);
            Assert.Equal("비트에서 이름을 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.", SlipNames.Message(result));
        }
    }

    // ── AC-6402.4 [뽑기] 상태 ─────────────────────────────

    [Theory(DisplayName = "AC-6402.4 [뽑기]는 이름을 찾았을 때만 눌린다")]
    [InlineData(NameKind.Found, true)]
    [InlineData(NameKind.Empty, false)]
    [InlineData(NameKind.NotFound, false)]
    [InlineData(NameKind.Failed, false)]
    public void PrintOnlyWhenFound(NameKind kind, bool canPrint)
    {
        Assert.Equal(canPrint, SlipNames.CanPrint(new NameResult(kind, kind == NameKind.Found ? FakeName : "")));
    }

    [Fact(DisplayName = "AC-6402.4 항목·부위를 하나도 안 골라도 이름만 찾으면 뽑을 수 있고, 그 칸은 빈칸으로 나온다")]
    public void PrintWithoutPicks()
    {
        var db = new FakeDb().Answer(SlipNames.Sql, _ => new[] { new object?[] { FakeName } });
        var found = SlipNames.Find(db, ChartInput.Parse("90001"));
        Assert.True(SlipNames.CanPrint(found));

        var text = SlipText.Of("90001", found.Name, new SlipPicks());
        Assert.Equal("", text.Parts);
        Assert.Equal("", text.Items);
        Assert.False(SlipNames.CanPrint(SlipNames.Find(db, ChartInput.Parse(""))));
    }
}
