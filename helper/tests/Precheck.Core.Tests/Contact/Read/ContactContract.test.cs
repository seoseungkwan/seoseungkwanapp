using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// 웹 약속(끝에서 끝까지 1부): Worker 시험이 쓰는 가짜 도우미 답(fixtures/patients/fake/targets-followup.json·targets-injection.json)의
/// 조각마다, 그 조각의 표에 버리는 칸을 섞은 가짜 83·47 화면 표를 만들어 contact.targets로 돌리면 답 JSON이 그 조각과 같다.
/// 그래서 그 조각을 받는 웹 readTargets(src/workers/patients/jobs.ts)가 도우미의 진짜 답도 받는다.
/// </summary>
public class ContactContractTests
{
    // 83: 남기는 칸 사이에 끼우는 버리는 칸(이름, 값)
    private static readonly (string Name, string Value)[] SymptomNoise =
    {
        ("No", "1"), ("주민번호", ContactData.ResidentNumber), ("전화번호", "010-0000-8888"), ("주소", ContactData.Address), ("금액", ContactData.Amount), ("진료의", ContactData.Doctor),
    };

    // 47: F/U는 처방 칸(처방코드·처방일자·처방명칭·급여구분)도 버린다
    private static readonly (string Name, string Value)[] FollowupRxNoise =
    {
        ("처방코드", "Z0"), ("환자명", "가상환자99"), ("처방일자", "2026-01-0"), ("주민번호", ContactData.ResidentNumber), ("처방명칭", ContactData.RxName), ("급여구분", "급여"), ("금액", ContactData.Amount), ("주소", ContactData.Address),
    };

    private static readonly (string Name, string Value)[] InjectionRxNoise =
    {
        ("환자명", "가상환자99"), ("주민번호", ContactData.ResidentNumber), ("처방명칭", ContactData.RxName), ("급여구분", "급여"), ("금액", ContactData.Amount), ("주소", ContactData.Address),
    };

    private static string[][] Table(JsonElement table) => Replies.Table(table);

    /// <summary>
    /// 표의 칸을 거꾸로 놓고 그 사이사이에 버리는 칸을 끼운다. 자료 줄마다 copies 줄을 만들고 버리는 칸 값만 줄마다 다르게 한다
    /// (남긴 칸이 같은 줄은 한 번이 되어야 하므로 47은 2, 83은 1).
    /// </summary>
    private static List<string[]> Sheet(string[][] table, (string Name, string Value)[] noise, int copies)
    {
        var columns = Enumerable.Range(0, table[0].Length).Reverse().ToArray();
        var layout = new List<(int Column, int Noise)>();
        for (var i = 0; i < Math.Max(columns.Length, noise.Length); i++)
        {
            if (i < noise.Length) layout.Add((-1, i));
            if (i < columns.Length) layout.Add((columns[i], -1));
        }

        var sheet = new List<string[]> { layout.Select(p => p.Column >= 0 ? table[0][p.Column] : noise[p.Noise].Name).ToArray() };
        foreach (var row in table.Skip(1))
        {
            for (var copy = 1; copy <= copies; copy++)
            {
                sheet.Add(layout.Select(p => p.Column >= 0 ? row[p.Column] : noise[p.Noise].Value + (copies > 1 ? copy.ToString(CultureInfo.InvariantCulture) : "")).ToArray());
            }
        }
        return sheet;
    }

    [Theory(DisplayName = "AC-605.1 웹 약속: targets-followup·targets-injection.json의 조각마다 같은 표에서 만든 답이 그 조각 JSON과 같다")]
    [InlineData("targets-followup.json", "followup")]
    [InlineData("targets-injection.json", "injection")]
    public void MatchesFakeReplies(string file, string kind)
    {
        var fixture = RepoFiles.Json("fixtures", "patients", "fake", file);
        var today = DateTime.ParseExact(fixture.GetProperty("today").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var pieces = fixture.GetProperty("pieces").EnumerateArray().ToList();
        Assert.NotEmpty(pieces);

        foreach (var piece in pieces)
        {
            Assert.Equal(kind, piece.GetProperty("kind").GetString());
            using var rig = new ContactRig();
            rig.Rig.Today = today;
            rig.Screens.Sheets["83"] = Sheet(Table(piece.GetProperty("chart")), SymptomNoise, 1);
            rig.Screens.Sheets["47"] = Sheet(Table(piece.GetProperty("rx")), kind == "followup" ? FollowupRxNoise : InjectionRxNoise, 2);

            var from = piece.GetProperty("from").GetString()!;
            var to = piece.GetProperty("to").GetString()!;
            var json = Replies.Join(rig.Send(kind, from, to));

            Assert.Equal(Replies.Canon(piece), Replies.Canon(json));
        }
    }

    // ── spec patients-bit-lists: 같은 명령 contact.targets의 kind 넷이 맞는 처리기로 간다 ─────────────
    // 웹 readReservations(src/lib/patients/reservations.ts)·readLapsed(lapsed.ts)가 받는 머리·줄 모양 그대로를 글자로 견준다

    [Fact(DisplayName = "AC-2801.5 kind 'reservation'은 예약 처리기로: 등록 확인 → 예약 SQL → chunk … end(F/U 31일 한도 없음, 통계 화면·비트 로그인 없음)")]
    public void ReservationGoesToListReader()
    {
        using var rig = new ContactRig();
        rig.Db.Answer(ListSql.ReservationsSql, _ => new[]
        {
            ListData.Reservation("900001", "가상환자01", "010-0000-0001", null, "202610311430", "WR", null, 0, null),
            ListData.Reservation("900002", "가상환자02", null, "02-0000-0002", "202610200900", "CR", "OC", 0, "20261022"),
        });
        var json = Replies.Join(rig.Send("reservation", "2026-09-30", "2026-11-13"));   // 오늘−30일 ~ 오늘+14일(45일)

        Assert.Equal("{\"v\":1,\"kind\":\"reservation\",\"from\":\"2026-09-30\",\"to\":\"2026-11-13\",\"today\":\"2026-10-30\",\"rows\":["
            + "[\"900001\",\"가상환자01\",\"010-0000-0001\",\"202610311430\",\"WR\",null,0,null],"
            + "[\"900002\",\"가상환자02\",\"02-0000-0002\",\"202610200900\",\"CR\",\"OC\",0,\"20261022\"]]}", Replies.Canon(json));
        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, ListSql.ReservationsSql }, rig.Db.Sqls);
        Assert.Empty(rig.Screens.Calls);
        Assert.Empty(rig.Screens.MenuReads);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Equal(1, rig.Db.Disposed);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Fact(DisplayName = "AC-2801.5 kind 'lapsed'는 장기 미방문 처리기로: 등록 확인 → 장기 미방문 SQL → chunk … end(마지막 내원 기간 700일도 됨, 통계 화면·비트 로그인 없음)")]
    public void LapsedGoesToListReader()
    {
        using var rig = new ContactRig();
        rig.Db.Answer(ListSql.LapsedSql, _ => new[]
        {
            ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", 5, 1, "A49", "가짜주사약"),
            ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", 5, 1, "B12", null),
            ListData.Lapsed("900002", "가상환자02", null, null, "20250301", 2, 0, null, null),
        });
        var json = Replies.Join(rig.Send("lapsed", "2024-10-31", "2026-09-30"));   // 24달 전 다음 날 ~ 1달 전

        Assert.Equal("{\"v\":1,\"kind\":\"lapsed\",\"from\":\"2024-10-31\",\"to\":\"2026-09-30\",\"today\":\"2026-10-30\",\"rows\":["
            + "[\"900001\",\"가상환자01\",\"010-0000-0001\",\"20260915\",5,1,[[\"A49\",\"가짜주사약\"],[\"B12\",null]]],"
            + "[\"900002\",\"가상환자02\",\"\",\"20250301\",2,0,[]]]}", Replies.Canon(json));
        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, ListSql.LapsedSql }, rig.Db.Sqls);
        Assert.Empty(rig.Screens.Calls);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Fact(DisplayName = "AC-2801.5 새 kind도 막히면 error 하나만(chunk·end 없음): 기간이 틀리면 E-HELPER-BAD-MESSAGE(비트를 건드리지 않음), 읽기 실패는 E-BIT-READ-FAILED, 기록·답에 환자 값 없음")]
    public void ListKindsFailWithOneError()
    {
        foreach (var (kind, from, to) in new[]
        {
            ("reservation", "2026-09-28", "2026-10-30"),   // 시작이 오늘−32일
            ("reservation", "2026-10-30", "2026-11-14"),   // 끝이 오늘+15일
            ("lapsed", "2026-09-30", "2026-10-30"),        // 끝이 오늘
        })
        {
            using var rig = new ContactRig();
            Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.Send(kind, from, to)));
            Assert.False(rig.BitTouched);
            Assert.Empty(rig.Db.Calls);
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-HELPER-BAD-MESSAGE") }, rig.Log);
        }

        using (var rig = new ContactRig())
        {
            rig.Db.Fail(ListSql.ReservationsSql, "E-BIT-READ-FAILED").Fail(ListSql.LapsedSql, "E-BIT-READ-FAILED");
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.Send("reservation", "2026-09-30", "2026-11-13")));
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.Send("lapsed", "2024-10-31", "2026-09-30")));
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-BIT-READ-FAILED"), ("contact.targets", "E-BIT-READ-FAILED") }, rig.Log);
        }

        using (var rig = new ContactRig())
        {
            // 칸 모자람(읽기 실패): 앞 줄의 이름·전화·차트번호가 오류 답에 실리지 않는다
            rig.Db.Answer(ListSql.ReservationsSql, _ => new[]
            {
                ListData.Reservation("900001", "가상환자01", "010-0000-0001", null, "202610311430", "WR", null, 0, null),
                new object?[] { "900002", "가상환자02" },
            });
            Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.Send("reservation", "2026-09-30", "2026-11-13")));
            foreach (var value in new[] { "가상환자", "900001", "010-0000-" }) Assert.DoesNotContain(value, rig.RawReplies, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-2806.3 followup·injection은 지금 그대로 83·47 표를 읽고({v, kind, from, to, chart, rx}) 명단 SQL은 돌리지 않는다")]
    public void FollowupAndInjectionStayOnGrids()
    {
        foreach (var kind in new[] { "followup", "injection" })
        {
            using var rig = new ContactRig();
            var json = Replies.JoinJson(rig.Send(kind, "2026-10-01", "2026-10-30"));
            Assert.Equal(new[] { "v", "kind", "from", "to", "chart", "rx" }, Json.Keys(json));
            Assert.Equal(kind, json.GetProperty("kind").GetString());
            Assert.Equal(new[] { "83", "47" }, rig.Screens.Calls.Select(c => c.Key));
            Assert.DoesNotContain(ListSql.ReservationsSql, rig.Db.Sqls);
            Assert.DoesNotContain(ListSql.LapsedSql, rig.Db.Sqls);
        }
    }

    [Theory(DisplayName = "AC-2801.5 모르는 kind는 지금처럼 E-HELPER-BAD-MESSAGE 하나만, 비트를 건드리지 않는다")]
    [InlineData("other")]
    [InlineData("Reservation")]
    [InlineData("LAPSED")]
    [InlineData("reservations")]
    public void UnknownKindStaysBlocked(string kind)
    {
        using var rig = new ContactRig();
        Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.Send(kind, "2026-10-01", "2026-10-30")));
        Assert.False(rig.BitTouched);
    }
}
