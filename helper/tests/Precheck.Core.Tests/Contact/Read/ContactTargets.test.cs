using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// REQ-605 contact.targets 처리기: 실제 명령 표(commands.json)와 Dispatcher를 지나 답까지 본다.
/// 비트(Rig)·통계 화면(FakeScreens)은 가짜다. 가짜 오늘은 2026-10-30(Synthetic.Today).
/// </summary>
public class ContactTargetsTests
{
    private static readonly string[] ChartHeader = { "내원번호", "차트번호", "환자명", "증상", "기록날짜" };

    // ── AC-605.1 등록 확인 → 83·47 → {v, kind, from, to, chart, rx} chunk … end ──────────

    [Fact(DisplayName = "AC-605.1 F/U: 등록 확인 → 83·47 표 → {v:1, kind, from, to, chart, rx}를 chunk … end로(표마다 첫 줄 = 칸 이름)")]
    public void FollowupBuildsTables()
    {
        using var rig = new ContactRig();
        var json = Replies.JoinJson(rig.Send("followup", "2026-10-01", "2026-10-30"));

        Assert.Equal(new[] { "v", "kind", "from", "to", "chart", "rx" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("v").GetInt32());
        Assert.Equal("followup", json.GetProperty("kind").GetString());
        Assert.Equal("2026-10-01", json.GetProperty("from").GetString());
        Assert.Equal("2026-10-30", json.GetProperty("to").GetString());

        var chart = Replies.Table(json.GetProperty("chart"));
        Assert.Equal(ChartHeader, chart[0]);
        Assert.Equal(4, chart.Length);
        Assert.Equal(new[] { "V1", "900001", "가상환자01", ContactData.Symptom(1), ContactData.Day(1) }, chart[1]);
        Assert.Equal(new[] { "V3", "900003", "가상환자03", ContactData.Symptom(3), ContactData.Day(3) }, chart[3]);

        // F/U 47: 차트번호 + 전화 칸(휴대폰·보호자 연락처)만, 처방 두 줄은 남긴 칸이 같아 한 줄
        var rx = Replies.Table(json.GetProperty("rx"));
        Assert.Equal(new[] { "차트번호", "휴대폰", "보호자 연락처" }, rx[0]);
        Assert.Equal(new[]
        {
            new[] { "900001", "010-0000-0001", "010-0000-7001" },
            new[] { "900002", "010-0000-0002", "010-0000-7002" },
            new[] { "900003", "010-0000-0003", "010-0000-7003" },
        }, rx.Skip(1).ToArray());
    }

    [Fact(DisplayName = "AC-605.1 정기 주사: 47은 처방코드·차트번호·처방일자 + 전화 칸(이 차례), 처방 줄은 모두 남는다")]
    public void InjectionKeepsPrescriptionColumns()
    {
        using var rig = new ContactRig();
        var json = Replies.JoinJson(rig.Send("injection", "2026-10-01", "2026-10-30"));

        Assert.Equal("injection", json.GetProperty("kind").GetString());
        Assert.Equal(ChartHeader, Replies.Table(json.GetProperty("chart"))[0]);
        var rx = Replies.Table(json.GetProperty("rx"));
        Assert.Equal(new[] { "처방코드", "차트번호", "처방일자", "휴대폰", "보호자 연락처" }, rx[0]);
        Assert.Equal(7, rx.Length);
        Assert.Equal(new[] { "A49", "900001", ContactData.Day(1), "010-0000-0001", "010-0000-7001" }, rx[1]);
        Assert.Equal(new[] { "B12", "900001", ContactData.Day(1), "010-0000-0001", "010-0000-7001" }, rx[2]);
        Assert.Equal(new[] { "B12", "900003", ContactData.Day(3), "010-0000-0003", "010-0000-7003" }, rx[6]);
    }

    [Theory(DisplayName = "AC-605.1 남기는 칸만: 주민번호·주소·금액·진료의·팩스·처방명칭 등 버리는 칸의 글자는 JSON 어디에도 없다")]
    [InlineData("followup")]
    [InlineData("injection")]
    public void DropsOtherColumns(string kind)
    {
        using var rig = new ContactRig();
        var text = Replies.Join(rig.Send(kind, "2026-10-01", "2026-10-30"));
        foreach (var dropped in ContactData.DroppedValues) Assert.DoesNotContain(dropped, text, StringComparison.Ordinal);
        // 83 표의 전화번호 칸은 버린다(전화는 47에서만)
        Assert.DoesNotContain("전화번호", text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-605.1 F/U 47에는 처방 칸(처방코드·처방일자·처방명칭·급여구분)이 없다")]
    public void FollowupHasNoPrescriptionColumns()
    {
        using var rig = new ContactRig();
        var rx = Replies.JoinJson(rig.Send("followup", "2026-10-01", "2026-10-30")).GetProperty("rx");
        var head = Replies.Table(rx)[0];
        foreach (var name in new[] { "처방코드", "처방일자", "처방명칭", "급여구분" }) Assert.DoesNotContain(name, head);
        Assert.DoesNotContain("A49", rx.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain("B12", rx.GetRawText(), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-605.1 AC-005.15 차례: 등록 병원 확인 → 통계 메뉴·로그인 사용자 범위·통계 권한(83·47) → 83 → 47(기간·시간 제한 그대로, 기간 기관기호 확인 없음)")]
    public void ReadsInOrder()
    {
        using var rig = new ContactRig();
        var gridsBeforePermission = -1;
        rig.Db.Answer(Sql.UserPermissionsSql, _ =>
        {
            gridsBeforePermission = rig.Screens.Calls.Count;
            return new[] { new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" } };
        });
        Replies.Join(rig.Send("followup", "2026-09-30", "2026-10-30"));

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, Sql.UserScopeSql, Sql.UserPermissionsSql }, rig.Db.Sqls);
        Assert.Equal(0, gridsBeforePermission);

        Assert.Equal(new[] { Synthetic.Root }, rig.Screens.MenuReads);
        Assert.Equal(new[] { "83", "47" }, rig.Screens.Calls.Select(c => c.Key));
        Assert.All(rig.Screens.Calls, call =>
        {
            Assert.Equal(Synthetic.Root, call.Install);
            Assert.Equal("SYNUSER", call.User.UserId);
            Assert.Equal(new DateTime(2026, 9, 30), call.From);
            Assert.Equal(new DateTime(2026, 10, 30), call.To);
            Assert.Equal(StatsScreens.ReadTimeout, call.Timeout);
        });
        Assert.Equal(1, rig.Db.Disposed);
        Assert.Equal(new (string?, string?)[] { ("contact.targets", null) }, rig.Log);
    }

    [Fact(DisplayName = "AC-605.1 등록이 없으면 E-BIT-NOT-REGISTERED 하나만, 비트를 건드리지 않는다")]
    public void NotRegisteredTouchesNothing()
    {
        using var rig = new ContactRig(registered: false);
        Assert.Equal("E-BIT-NOT-REGISTERED", Replies.OnlyError(rig.Send("followup", "2026-10-01", "2026-10-30")));
        Assert.False(rig.BitTouched);
    }

    [Fact(DisplayName = "AC-005.15 contact.targets는 기간 기관기호를 확인하지 않는다(그 기간에 다른 번호 줄이 있어도 읽는다)")]
    public void NoPeriodCheck()
    {
        using var rig = new ContactRig();
        rig.Db.Answer(Sql.PeriodIdentitySql, _ => new[] { new object?[] { 1L, 1L } });
        Replies.Join(rig.Send("followup", "2026-09-30", "2026-10-30"));
        Assert.DoesNotContain(Sql.PeriodIdentitySql, rig.Db.Sqls);
        Assert.Equal(new[] { "83", "47" }, rig.Screens.Calls.Select(c => c.Key));
    }

    [Fact(DisplayName = "AC-605.1 등록 병원과 다르거나(오늘 기관기호) 통계 권한·로그인이 없으면 표를 읽지 않고 error 하나만")]
    public void HospitalOrAccessFailureReadsNoGrid()
    {
        using (var rig = new ContactRig())
        {
            rig.Rig.Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Replies.OnlyError(rig.Send("injection", "2026-10-01", "2026-10-30")));
            Assert.Empty(rig.Screens.Calls);
        }
        using (var rig = new ContactRig())
        {
            // 처방별 환자 목록(47) 권한이 없다
            rig.Db.Answer(Sql.UserPermissionsSql, _ => new[] { new object?[] { "전산자료 추출통계", "A" } });
            Assert.Equal("E-BIT-EXPORT-FAILED", Replies.OnlyError(rig.Send("followup", "2026-10-01", "2026-10-30")));
            Assert.Empty(rig.Screens.Calls);
        }
        using (var rig = new ContactRig())
        {
            rig.Rig.Login.User = null;     // 비트 로그인 창을 닫았다
            Assert.Equal("E-BIT-EXPORT-FAILED", Replies.OnlyError(rig.Send("followup", "2026-10-01", "2026-10-30")));
            Assert.Empty(rig.Screens.Calls);
        }
    }

    [Fact(DisplayName = "AC-605.1 조회된 진료가 없으면 표는 머리 줄뿐이다(머리 줄만 있는 표·아무것도 없는 표)")]
    public void EmptyPeriodGivesHeadersOnly()
    {
        using (var rig = new ContactRig())
        {
            rig.Screens.Sheets["83"] = new List<string[]> { ContactData.SymptomHeader };
            rig.Screens.Sheets["47"] = new List<string[]> { ContactData.PrescriptionHeader };
            var json = Replies.JoinJson(rig.Send("injection", "2026-10-01", "2026-10-30"));
            Assert.Equal(new[] { ChartHeader }, Replies.Table(json.GetProperty("chart")));
            Assert.Equal(new[] { new[] { "처방코드", "차트번호", "처방일자", "휴대폰", "보호자 연락처" } }, Replies.Table(json.GetProperty("rx")));
        }
        using (var rig = new ContactRig())
        {
            rig.Screens.Sheets.Clear();
            var json = Replies.JoinJson(rig.Send("followup", "2026-10-01", "2026-10-30"));
            Assert.Equal(new[] { ChartHeader }, Replies.Table(json.GetProperty("chart")));
            Assert.Equal(new[] { new[] { "차트번호" } }, Replies.Table(json.GetProperty("rx")));
        }
    }

    [Fact(DisplayName = "AC-605.1 RegisterTargets는 빠진 부품을 받지 않는다")]
    public void RegisterRequiresParts()
    {
        using var rig = new ContactRig();
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterTargets(null!, rig.Rig.Services));
        Assert.Throws<ArgumentNullException>(() => ContactCommands.RegisterTargets(new Dispatcher(CommandTable.LoadEmbedded()), null!));
        Assert.Equal("contact.targets", ContactCommands.TargetsName);
    }

    // ── AC-605.2 31일·거꾸로·오늘 뒤 → E-HELPER-BAD-MESSAGE ─────────────────

    [Theory(DisplayName = "AC-605.2 31일 넘음·from > to·오늘 뒤 → 명령 표 1,100일 안이어도 E-HELPER-BAD-MESSAGE 하나만, 비트를 건드리지 않는다")]
    [InlineData("followup", "2026-09-29", "2026-10-30")]   // 32일
    [InlineData("injection", "2026-09-29", "2026-10-30")]
    [InlineData("injection", "2024-01-01", "2026-10-30")]  // 1,034일(명령 표 1,100일 안)
    [InlineData("followup", "2026-10-02", "2026-10-01")]   // 거꾸로
    [InlineData("followup", "2026-10-02", "2026-10-31")]   // 끝이 내일(30일)
    [InlineData("injection", "2026-10-31", "2026-10-31")]  // 내일 하루
    public void RejectsBadPeriod(string kind, string from, string to)
    {
        using var rig = new ContactRig();
        Assert.Equal("E-HELPER-BAD-MESSAGE", Replies.OnlyError(rig.Send(kind, from, to)));
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
    }

    [Fact(DisplayName = "AC-605.2 처리기(Build)도 기간을 다시 본다: 32일·거꾸로·내일이면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    public void BuildGuardsPeriod()
    {
        using var rig = new ContactRig();
        var login = new StatsLogin();
        foreach (var (from, to) in new[]
        {
            (new DateTime(2026, 9, 29), new DateTime(2026, 10, 30)),
            (new DateTime(2026, 10, 2), new DateTime(2026, 10, 1)),
            (new DateTime(2026, 10, 30), new DateTime(2026, 10, 31)),
        })
        {
            var error = Assert.Throws<ProtocolException>(() => ContactTargets.Build(rig.Rig.Services, login, "followup", from, to));
            Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
        }
        // 모르는 kind도(명령 표가 막지만 처리기도 본다)
        Assert.Equal("E-HELPER-BAD-MESSAGE", Assert.Throws<ProtocolException>(() =>
            ContactTargets.Build(rig.Rig.Services, login, "other", new DateTime(2026, 10, 1), new DateTime(2026, 10, 30))).Code);
        Assert.False(rig.BitTouched);
        Assert.Equal(31, ContactTargets.MaxPieceDays);
    }

    [Theory(DisplayName = "AC-605.2 31일(시작·끝 포함)·오늘 하루·오늘까지는 된다")]
    [InlineData("2026-09-30", "2026-10-30")]
    [InlineData("2026-10-30", "2026-10-30")]
    [InlineData("2026-10-01", "2026-10-31")]
    public void AcceptsPeriodUpToToday(string from, string to)
    {
        using var rig = new ContactRig();
        if (to == "2026-10-31") rig.Rig.Today = new DateTime(2026, 10, 31);
        var json = Replies.JoinJson(rig.Send("injection", from, to));
        Assert.Equal(from, json.GetProperty("from").GetString());
        Assert.Equal(to, json.GetProperty("to").GetString());
    }

    // ── AC-605.3 300,000줄 넘음·칸 없음·읽기 실패 → error만 ─────────────────

    [Theory(DisplayName = "AC-605.3 한 표(83·47)가 300,000줄을 넘으면 자르지 않고 E-BIT-READ-FAILED 하나만, chunk·end 없음")]
    [InlineData("83")]
    [InlineData("47")]
    public void TooManyRowsFails(string key)
    {
        using var rig = new ContactRig();
        var sheet = rig.Screens.Sheets[key];
        var row = sheet[1];
        rig.Screens.Sheets[key] = new[] { sheet[0] }.Concat(Enumerable.Repeat(row, ContactTargets.MaxRows + 1)).ToList();
        Assert.Equal("E-BIT-READ-FAILED", Replies.OnlyError(rig.Send("injection", "2026-10-01", "2026-10-30")));
        // 83에서 멈추면 47은 읽지 않는다
        Assert.Equal(key == "83" ? new[] { "83" } : new[] { "83", "47" }, rig.Screens.Calls.Select(c => c.Key));
        Assert.Equal(300_000, ContactTargets.MaxRows);
        rig.Screens.Sheets.Clear();
        GC.Collect();
    }

    [Theory(DisplayName = "AC-605.3 꼭 있어야 하는 칸이 없거나(83 다섯 칸, 47 차트번호·처방코드·처방일자) 같은 이름 칸이 둘이면 E-BIT-EXPORT-FAILED 하나만")]
    [InlineData("followup", "83", "증상", null)]
    [InlineData("followup", "83", "기록날짜", null)]
    [InlineData("injection", "83", "내원번호", null)]
    [InlineData("followup", "47", "차트번호", null)]
    [InlineData("injection", "47", "처방코드", null)]
    [InlineData("injection", "47", "처방일자", null)]
    [InlineData("followup", "47", "환자명", "이전차트번호")]
    [InlineData("injection", "47", "환자명", "차트 번호(구)")]
    [InlineData("injection", "47", "처방명칭", "처방코드2")]
    [InlineData("injection", "47", "급여구분", "처방일자 ")]
    public void MissingOrDuplicateColumnFails(string kind, string key, string column, string? renameTo)
    {
        using var rig = new ContactRig();
        var sheet = rig.Screens.Sheets[key];
        var index = Array.IndexOf(sheet[0], column);
        Assert.True(index >= 0);
        var header = sheet[0].ToArray();
        if (renameTo == null) header[index] = "가상칸";
        else header[index] = renameTo;
        sheet[0] = header;
        Assert.Equal("E-BIT-EXPORT-FAILED", Replies.OnlyError(rig.Send(kind, "2026-10-01", "2026-10-30")));
    }

    [Theory(DisplayName = "AC-605.3 표 읽기 실패·시간 초과(E-BIT-READ-FAILED)·화면 다름(E-BIT-EXPORT-FAILED)이면 그 번호 error 하나만, 뒤 표는 읽지 않는다")]
    [InlineData("83", "E-BIT-READ-FAILED")]
    [InlineData("47", "E-BIT-READ-FAILED")]
    [InlineData("83", "E-BIT-EXPORT-FAILED")]
    [InlineData("47", "E-BIT-EXPORT-FAILED")]
    public void ReaderFailureSendsOnlyError(string key, string code)
    {
        using var rig = new ContactRig();
        rig.Screens.Fail[key] = code;
        Assert.Equal(code, Replies.OnlyError(rig.Send("followup", "2026-10-01", "2026-10-30")));
        Assert.Equal(key == "83" ? new[] { "83" } : new[] { "83", "47" }, rig.Screens.Calls.Select(c => c.Key));
        Assert.Equal(1, rig.Db.Disposed);
    }

    [Fact(DisplayName = "AC-605.3 통계 메뉴 파일을 못 읽거나 통계 화면 부품이 없으면 E-BIT-EXPORT-FAILED 하나만")]
    public void MissingMenuOrScreensFails()
    {
        using (var rig = new ContactRig())
        {
            rig.Screens.MenuFail = "E-BIT-EXPORT-FAILED";
            Assert.Equal("E-BIT-EXPORT-FAILED", Replies.OnlyError(rig.Send("followup", "2026-10-01", "2026-10-30")));
            Assert.Empty(rig.Screens.Calls);
        }
        using (var rig = new ContactRig())
        {
            var bare = new BitServices(rig.Rig.Locator, rig.Rig.Connector, rig.Rig.Login, rig.Rig.Confirm, rig.Rig.Store, () => rig.Rig.Today);
            var error = Assert.Throws<BitException>(() => ContactTargets.Build(bare, new StatsLogin(), "followup", new DateTime(2026, 10, 1), new DateTime(2026, 10, 30)));
            Assert.Equal("E-BIT-EXPORT-FAILED", error.Code);
        }
    }

    // ── AC-605.4 기록·예외 글에 환자 값 없음 ─────────────────────────

    [Fact(DisplayName = "AC-605.4 실패해도 기록에는 명령 이름·오류 번호만, 예외 글·오류 답에는 이름·전화·차트번호·증상이 없다")]
    public void FailuresLeakNothing()
    {
        var failures = new List<Action<ContactRig>>
        {
            rig => rig.Screens.Sheets["47"] = new[] { rig.Screens.Sheets["47"][0] }.Concat(Enumerable.Repeat(rig.Screens.Sheets["47"][1], ContactTargets.MaxRows + 1)).ToList(),
            rig => rig.Screens.Sheets["47"][0] = rig.Screens.Sheets["47"][0].Select(c => c == "차트번호" ? "가상칸" : c).ToArray(),
            rig => rig.Screens.Sheets["83"][0] = rig.Screens.Sheets["83"][0].Select(c => c == "증상" ? "가상칸" : c).ToArray(),
            rig => rig.Screens.Fail["47"] = "E-BIT-READ-FAILED",
        };
        var patientValues = new[] { "가상환자", "900001", "900002", "010-0000-", "가상 증상", "f/u", "V1", "A49" };

        foreach (var fail in failures)
        {
            using var rig = new ContactRig();
            fail(rig);
            var code = Replies.OnlyError(rig.Send("injection", "2026-10-01", "2026-10-30"));
            Assert.Equal(new (string?, string?)[] { ("contact.targets", code) }, rig.Log);
            foreach (var value in patientValues) Assert.DoesNotContain(value, rig.RawReplies, StringComparison.Ordinal);

            // 같은 실패를 Build로: 예외 글은 오류 번호 그대로다
            var error = Assert.ThrowsAny<HelperException>(() => ContactTargets.Build(rig.Rig.Services, new StatsLogin(), "injection", new DateTime(2026, 10, 1), new DateTime(2026, 10, 30)));
            Assert.Equal(code, error.Code);
            Assert.Equal(code, error.Message);
            Assert.Null(error.InnerException);
        }

        using (var rig = new ContactRig())
        {
            Replies.OnlyError(rig.Send("followup", "2026-10-02", "2026-10-01"));
            Assert.Equal(new (string?, string?)[] { ("contact.targets", "E-HELPER-BAD-MESSAGE") }, rig.Log);
        }
    }
}
