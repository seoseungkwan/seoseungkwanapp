using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-016.1 claim.memos: 기간의 비트 청구메모를 원본 ClaimMemoHistory.RowsSql로 읽어 {v, p, d, m} 줄로, 다 만든 JSON을 chunk … end로 보낸다.
/// 줄 300,000·메모 4,000자를 넘으면 truncated. 모두 지어낸 자료다(차트번호 9로 시작하는 6자리, '가짜' 메모).
/// 메모 글자는 비교(AC-016.2)를 위해 CRLF→LF 말고 그대로 둔다.
/// </summary>
public class MemoRowsTests
{
    private const string From = "2026-10-01";
    private const string To = "2026-10-31";

    private static ClaimRig Rig(params object?[][] rows)
    {
        var rig = new ClaimRig();
        rig.Db.Answer(Sql.MemoRowsSql, _ => rows);
        return rig;
    }

    private static object?[] Row(object? memo, string visit = "V1", string patient = "900001", string day = "20261001") =>
        new[] { visit, patient, day, memo };

    private static JsonElement Memos(params object?[][] rows)
    {
        using var rig = Rig(rows);
        return Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.memos", From, To));
    }

    private static List<JsonElement> RowsOf(JsonElement json) => json.GetProperty("rows").EnumerateArray().ToList();

    private static MemoRows Read(IEnumerable<object?[]> rows) =>
        MemoRowsRead.Read(new FakeDb().Answer(Sql.MemoRowsSql, _ => rows), Synthetic.Scope, new DateTime(2026, 10, 1), new DateTime(2026, 10, 31));

    [Fact(DisplayName = "AC-016.1 claim.memos: chunk … end를 이으면 JSON 하나 {version, period, truncated, invalidRows, rows}, 줄은 {v, p, d, m}만")]
    public void ChunksIntoOneJson()
    {
        using var rig = Rig(Row("가짜 메모 하나", visit: "V1", patient: "900001 ", day: "20261001"), Row("가짜 메모 둘", visit: "V-2", patient: "900002", day: "20261031"));

        var replies = Dispatch.Run(rig.Rig.Services, "claim.memos", From, To);
        Assert.DoesNotContain(replies, reply => reply.GetProperty("type").GetString() == "result");
        var json = Dispatch.Join(replies);

        Assert.Equal(new[] { "version", "period", "truncated", "invalidRows", "rows" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("version").GetInt32());
        Assert.Equal(From, json.GetProperty("period").GetProperty("from").GetString());
        Assert.Equal(To, json.GetProperty("period").GetProperty("to").GetString());
        Assert.False(json.GetProperty("truncated").GetBoolean());
        Assert.Equal(0, json.GetProperty("invalidRows").GetInt32());

        var rows = RowsOf(json);
        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.Equal(new[] { "v", "p", "d", "m" }, Json.Keys(row)));
        Assert.Equal("V1", rows[0].GetProperty("v").GetString());
        Assert.Equal("900001", rows[0].GetProperty("p").GetString());
        Assert.Equal("2026-10-01", rows[0].GetProperty("d").GetString());
        Assert.Equal("가짜 메모 하나", rows[0].GetProperty("m").GetString());
        Assert.Equal("V-2", rows[1].GetProperty("v").GetString());
        Assert.Equal("2026-10-31", rows[1].GetProperty("d").GetString());
    }

    [Fact(DisplayName = "AC-016.1 SQL은 원본 RowsSql과 공백만 다르고, 등록 병원 확인 → 기간 기관기호 → 메모 SQL 하나(@from·끝 다음 날 0시 @to·@hospital, 120초), 로그인 창·통계 화면 없음, 끝나면 세션을 닫아 되돌린다")]
    public void ReadsOriginalSqlOnly()
    {
        Assert.Equal(ReadOnlyGuardTests.Squash(ReadOnlyGuardTests.ReadOriginal("memo-rows.sql")), ReadOnlyGuardTests.Squash(Sql.MemoRowsSql));
        Assert.Equal("@from:Char:12 @to:Char:12 @hospital:VarChar:32", string.Join(" ", Sql.ParametersOf(Sql.MemoRowsSql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size)));

        using var rig = Rig(Row("가짜 메모"));
        Dispatch.Run(rig.Rig.Services, "claim.memos", "2026-09-01", To);

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, Sql.PeriodIdentitySql, Sql.MemoRowsSql }, rig.Db.Sqls);
        var identity = rig.Db.Calls[2];
        Assert.Equal("20260901", identity.Args["@firstDay"]);
        Assert.Equal("20261031", identity.Args["@lastDay"]);
        var memos = rig.Db.Calls[3];
        Assert.Equal("202609010000", memos.Args["@from"]);
        Assert.Equal("202611010000", memos.Args["@to"]);
        Assert.Equal(Synthetic.Scope, memos.Args["@hospital"]);
        Assert.Equal(TimeSpan.FromSeconds(120), memos.Timeout);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Empty(rig.Screens.Calls);
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-016.1 메모 4,000자는 그대로, 4,001자는 4,000자로 잘라 truncated(원본 Substring 그대로)")]
    public void MemoLimit()
    {
        var exact = Memos(Row(new string('가', 4000)));
        Assert.False(exact.GetProperty("truncated").GetBoolean());
        Assert.Equal(new string('가', 4000), RowsOf(exact)[0].GetProperty("m").GetString());

        var over = Memos(Row(new string('가', 4001)));
        Assert.True(over.GetProperty("truncated").GetBoolean());
        Assert.Equal(new string('가', 4000), RowsOf(over)[0].GetProperty("m").GetString());
    }

    [Fact(DisplayName = "AC-016.1 메모 길이는 CRLF를 LF로 맞춘 뒤 잰다(원본처럼 줄바꿈은 한 글자)")]
    public void MemoLimitCountsNewlineOnce()
    {
        var json = Memos(Row(new string('가', 3998) + "\r\n나"));

        Assert.False(json.GetProperty("truncated").GetBoolean());
        Assert.Equal(new string('가', 3998) + "\n나", RowsOf(json)[0].GetProperty("m").GetString());
    }

    [Fact(DisplayName = "AC-016.1 줄 300,000까지는 truncated 아님. 모양이 틀려 뺀 줄은 한도에 세지 않는다")]
    public void RowLimitExact()
    {
        var rows = Enumerable.Range(1, 300_000).Select(n => Row("가짜", visit: "V" + n)).Concat(new[] { Row("가짜", visit: "틀린 번호") });

        var result = Read(rows);

        Assert.False(result.Truncated);
        Assert.Equal(300_000, result.Rows.Count);
        Assert.Equal(1, result.InvalidRows);
    }

    [Fact(DisplayName = "AC-016.1 줄 300,001이면 300,000줄까지 조각(메시지마다 1,000,000바이트 이하)으로 보내고 truncated")]
    public void RowLimitOver()
    {
        var json = Memos(Enumerable.Range(1, 300_001).Select(n => Row("가짜", visit: "V" + n)).ToArray());

        Assert.True(json.GetProperty("truncated").GetBoolean());
        var rows = json.GetProperty("rows");
        Assert.Equal(300_000, rows.GetArrayLength());
        Assert.Equal("V300000", rows[299_999].GetProperty("v").GetString());
    }

    [Fact(DisplayName = "AC-016.1 AC-016.2 비트 메모 글자는 CRLF→LF 말고 그대로 보낸다(앞뒤 공백·탭·홀로 있는 CR 유지), 그래야 비교가 원본 Matches와 같다")]
    public void KeepsMemoTextExact()
    {
        var memo = RowsOf(Memos(Row("  가짜 메모 \r\n\t둘째\r줄 ")))[0].GetProperty("m").GetString();

        Assert.Equal("  가짜 메모 \n\t둘째\r줄 ", memo);
        Assert.True(MemoCompare.Matches(memo, "  가짜 메모 \r\n\t둘째\r줄 "));
        Assert.False(MemoCompare.Matches(memo, "가짜 메모 \n\t둘째\n줄"));
    }

    [Fact(DisplayName = "AC-016.1 NULL·빈 글자·공백이나 줄바꿈뿐인 메모는 줄이 아니다(원본 Clean 뒤 빈 글자면 건너뜀), 틀린 줄로도 세지 않는다")]
    public void BlankMemosAreNotRows()
    {
        var json = Memos(Row(null), Row(""), Row("\r\n"), Row(" \t "), Row("\u0001"), Row(null, visit: "틀린 번호"), Row("가짜 메모", visit: "V9"));

        var row = Assert.Single(RowsOf(json));
        Assert.Equal("V9", row.GetProperty("v").GetString());
        Assert.Equal(0, json.GetProperty("invalidRows").GetInt32());
        Assert.False(json.GetProperty("truncated").GetBoolean());
    }

    [Fact(DisplayName = "AC-016.1 내원번호·차트번호·날짜 모양이 틀린 줄은 빼고 invalidRows로 센다(원본 InvalidRows), 그 메모는 나가지 않는다")]
    public void InvalidShapesAreCounted()
    {
        using var rig = Rig(
            Row("뺄 메모", visit: "V 1"),
            Row("뺄 메모", visit: ""),
            Row("뺄 메모", visit: new string('1', 31)),
            Row("뺄 메모", patient: "9000!1"),
            Row("뺄 메모", patient: new string('9', 21)),
            Row("뺄 메모", day: "2026100"),
            Row("뺄 메모", day: "2026-10-01"),
            Row("남길 메모"));

        var replies = Dispatch.Run(rig.Rig.Services, "claim.memos", From, To);
        var json = Dispatch.Join(replies);

        Assert.Equal(7, json.GetProperty("invalidRows").GetInt32());
        Assert.Equal("남길 메모", Assert.Single(RowsOf(json)).GetProperty("m").GetString());
        Assert.DoesNotContain("뺄 메모", json.GetRawText());
    }

    [Fact(DisplayName = "AC-016.1 4,000자 자리가 이모지 가운데이거나 DB에 짝 없는 대리쌍이 있어도 도우미가 죽지 않고 U+FFFD로 바꿔 보낸다")]
    public void BrokenSurrogatesDoNotCrash()
    {
        var cut = Memos(Row(new string('가', 3999) + "😀"));
        Assert.True(cut.GetProperty("truncated").GetBoolean());
        Assert.Equal(new string('가', 3999) + "�", RowsOf(cut)[0].GetProperty("m").GetString());

        var lone = Memos(Row("앞\uD83D뒤"));
        Assert.False(lone.GetProperty("truncated").GetBoolean());
        Assert.Equal("앞�뒤", RowsOf(lone)[0].GetProperty("m").GetString());
    }

    [Fact(DisplayName = "AC-016.1 등록 없음·다른 병원·기간 기관기호 다름·읽기 실패·시간 초과면 end 없이 그 번호 error 하나만, 세션은 닫는다")]
    public void FailuresAreErrorsOnly()
    {
        using (var rig = new ClaimRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", From, To)));
            Assert.Empty(rig.Db.Calls);
        }
        using (var rig = Rig(Row("가짜 메모")))
        {
            rig.Db.Answer(Sql.InstitutionSql, Synthetic.OtherInstitution);
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", From, To)));
            Assert.DoesNotContain(Sql.MemoRowsSql, rig.Db.Sqls);
            Assert.Equal(1, rig.Db.Disposed);
        }
        using (var rig = Rig(Row("가짜 메모")))
        {
            rig.Db.Answer(Sql.PeriodIdentitySql, _ => new[] { new object?[] { 1L, 2L } });
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", From, To)));
            Assert.DoesNotContain(Sql.MemoRowsSql, rig.Db.Sqls);
            Assert.Equal(1, rig.Db.Disposed);
        }
        using (var rig = Rig())
        {
            rig.Db.Fail(Sql.MemoRowsSql, BitErrors.ReadFailed);
            Assert.Equal("E-BIT-READ-FAILED", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", From, To)));
            Assert.Equal(1, rig.Db.Disposed);
        }
    }

    [Fact(DisplayName = "AC-016.1 기간은 시작·끝 날을 함께 세어 400일까지, 넘거나 뒤집히면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    public void PeriodLimit()
    {
        using (var rig = Rig(Row("가짜 메모")))
        {
            Dispatch.Join(Dispatch.Run(rig.Rig.Services, "claim.memos", "2025-10-01", "2026-11-04"));
        }
        using (var rig = Rig(Row("가짜 메모")))
        {
            Assert.Equal("E-HELPER-BAD-MESSAGE", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", "2025-10-01", "2026-11-05")));
            Assert.Equal("E-HELPER-BAD-MESSAGE", Dispatch.OnlyError(Dispatch.Run(rig.Rig.Services, "claim.memos", To, From)));
            Assert.Equal(ErrorCodes.BadMessage, Assert.Throws<ProtocolException>(() => MemoRowsRead.Build(rig.Rig.Services, new DateTime(2025, 10, 1), new DateTime(2026, 11, 5))).Code);
            Assert.Equal(ErrorCodes.BadMessage, Assert.Throws<ProtocolException>(() => MemoRowsRead.Build(rig.Rig.Services, new DateTime(2026, 10, 31), new DateTime(2026, 10, 1))).Code);
            Assert.Empty(rig.Db.Calls);
        }
    }

    [Fact(DisplayName = "AC-016.1 기록에는 명령 이름과 오류 번호만 남는다(메모·차트번호 없음)")]
    public void LogsNoPatientData()
    {
        var entries = new List<(string? Cmd, string? Code)>();
        using var rig = Rig(Row("가짜 메모"));
        var dispatcher = new Dispatcher(CommandTable.LoadEmbedded(), (cmd, code) => entries.Add((cmd, code)));
        BitCommands.Register(dispatcher, rig.Rig.Services);

        Dispatch.Run(dispatcher, "claim.memos", From, To);
        rig.Db.Fail(Sql.MemoRowsSql, BitErrors.ReadFailed);
        Dispatch.Run(dispatcher, "claim.memos", From, To);

        Assert.Equal(new (string?, string?)[] { ("claim.memos", null), ("claim.memos", "E-BIT-READ-FAILED") }, entries);
    }
}
