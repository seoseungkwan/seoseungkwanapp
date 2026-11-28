using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.19 병원 고르기 창의 자료와 글(승인 시안 docs/mockups/reg-pick). 비트에 병원 범위가 둘 이상일 때
/// 범위마다 오늘 기관기호·최근 30일 외래 건수·로그인 계정 범위인지를 읽고, AC-005.18 차례로 미리 고를 줄을 정한다.
/// 기관기호·범위 값은 지어낸 것이다.
/// </summary>
public class HospitalPickTests
{
    private const string Other = "FOREIGN";

    private static HospitalChoice Choice(string scope, string code, long visits, bool mine = false) =>
        new HospitalChoice(scope, code, visits, mine);

    private static HospitalPickView View(IReadOnlyList<HospitalChoice> choices, HospitalRegistration? previous = null) =>
        new HospitalPickView(choices, Synthetic.Target(), previous);

    /// <summary>범위마다 오늘 기관기호를 따로 주는 가짜 DB</summary>
    private static FakeDb Db(params (string Scope, string?[] Codes)[] scopes)
    {
        var db = new FakeDb();
        db.Answer(Sql.InstitutionSql, args =>
        {
            var scope = (string)args["@scope"]!;
            var match = scopes.FirstOrDefault(s => s.Scope == scope);
            return (match.Codes ?? new string?[0]).Select(code => new object?[] { code }).ToArray();
        });
        return db;
    }

    private static void Active(FakeDb db, params (string? Scope, long Visits)[] rows) =>
        db.Answer(Sql.ActiveScopesSql, _ => rows.Select(row => new object?[] { row.Scope, row.Visits }).ToArray());

    [Fact(DisplayName = "AC-005.19 창 글: 맨 위 질문·노란 글·설치 위치·DB 줄은 승인 시안 글자 그대로")]
    public void FixedTexts()
    {
        Assert.Equal("비트에 병원이 여러 개 있어요. 이 PC에서 쓸 병원을 골라 주세요.", HospitalPick.Question);
        Assert.Equal("지금 로그인한 계정의 병원", HospitalPick.MineTag);
        Assert.Equal("양도양수로 번호가 바뀌었으면 지금 쓰는 번호를 고르세요. 다른 번호를 고르면 그 병원 자료를 읽어요.", HospitalPick.Warning);

        var view = View(new[] { Choice(Synthetic.Scope, Synthetic.Institution, 3), Choice(Other, Synthetic.OtherInstitution, 0) });
        Assert.Equal(@"비트 설치 위치: C:\DrBIT50", view.InstallLine);
        Assert.Equal(@"비트 DB: .\SQLEXPRESS / DRBIT", view.DatabaseLine);
        Assert.Null(view.PreviousLine);
    }

    [Fact(DisplayName = "AC-005.19 줄 글: 굵은 '요양기관번호 {번호 전체}'(못 찾으면 범위를 붙임), 계정 범위면 꼬리표, 둘째 줄 '최근 30일 외래 {건수}건'(천 단위 쉼표)")]
    public void RowTexts()
    {
        var view = View(new[]
        {
            Choice(Synthetic.Scope, Synthetic.Institution, 1284, mine: true),
            Choice(Other, "", 0),
        });
        Assert.Equal("요양기관번호 12345678", view.Title(0));
        Assert.Equal("지금 로그인한 계정의 병원", view.Tag(0));
        Assert.Equal("최근 30일 외래 1,284건", view.Detail(0));

        Assert.Equal("요양기관번호 못 찾음 (비트 병원 범위 FOREIGN)", view.Title(1));
        Assert.Null(view.Tag(1));
        Assert.Equal("최근 30일 외래 0건", view.Detail(1));
    }

    [Fact(DisplayName = "AC-005.19 다시 등록이면 '지금 등록: 요양기관번호 {전 번호 전체}', 전 번호가 비었으면 '지금 등록: 요양기관번호 못 찾음'")]
    public void PreviousLine()
    {
        var choices = new[] { Choice(Synthetic.Scope, Synthetic.Institution, 3), Choice(Other, Synthetic.OtherInstitution, 0) };
        Assert.Equal("지금 등록: 요양기관번호 87654321", View(choices, Synthetic.Registration(institution: Synthetic.OtherInstitution)).PreviousLine);
        Assert.Equal("지금 등록: 요양기관번호 못 찾음", View(choices, Synthetic.Registration(institution: "")).PreviousLine);
    }

    [Fact(DisplayName = "AC-005.19 미리 고를 줄: 계정 범위 줄 → 아니면 최근 30일 외래가 있는 줄이 하나일 때 그 줄 → 못 정하면 없음")]
    public void Preselect()
    {
        Assert.Equal(1, View(new[] { Choice("A", "11111111", 900), Choice("B", "22222222", 0, mine: true) }).Preselected);
        Assert.Equal(0, View(new[] { Choice("A", "11111111", 5), Choice("B", "22222222", 0) }).Preselected);
        Assert.Null(View(new[] { Choice("A", "11111111", 5), Choice("B", "22222222", 7) }).Preselected);
        Assert.Null(View(new[] { Choice("A", "11111111", 0), Choice("B", "22222222", 0) }).Preselected);
    }

    [Fact(DisplayName = "AC-005.19 읽기: 범위마다 오늘 8자리 기관기호(하나면 그것, 아니면 빈 값)·최근 30일 외래 건수(없으면 0, 빈 범위 줄 뺌)·계정 범위인지, 차례는 DB 범위 차례")]
    public void ReadChoices()
    {
        var db = Db((Synthetic.Scope, new[] { Synthetic.Institution + " " }), (Other, new[] { Synthetic.Institution, Synthetic.OtherInstitution }), ("THIRD", new[] { "1234" }));
        db.Answer(Sql.UserScopeSql, Other + " ");
        Active(db, (Synthetic.Scope + " ", 812), ("", 9), (null, 4), ("ELSEWHERE", 3));

        var view = HospitalPick.Read(db, new[] { Synthetic.Scope, Other, "THIRD" }, new VendorUser("SYNUSER", "20261030"), Synthetic.Today, Synthetic.Target(), null);

        Assert.Equal(new[] { Synthetic.Scope, Other, "THIRD" }, view.Choices.Select(c => c.Scope));
        Assert.Equal(new[] { Synthetic.Institution, "", "" }, view.Choices.Select(c => c.InstitutionCode));
        Assert.Equal(new long[] { 812, 0, 0 }, view.Choices.Select(c => c.RecentVisits));
        Assert.Equal(new[] { false, true, false }, view.Choices.Select(c => c.Mine));
        Assert.Equal(1, view.Preselected);

        // 최근 내원은 AC-005.18 ②의 SQL 그대로(오늘 30일 전 0시 ~ 다음 날 0시), 읽은 SQL은 모두 허용 목록 안
        var call = db.Calls.Single(c => c.Sql == Sql.ActiveScopesSql);
        Assert.Equal("202609300000", call.Args["@from"]);
        Assert.Equal("202610310000", call.Args["@to"]);
        Assert.All(db.Sqls, sql => Assert.Contains(sql, Sql.All));
    }

    [Fact(DisplayName = "AC-005.19 읽기: 계정·작업일 모양이 틀리면 계정 범위 없음으로 보고, 읽기가 실패하면 그 번호로 멈춘다")]
    public void ReadAccountAndFailures()
    {
        var db = Db((Synthetic.Scope, new[] { Synthetic.Institution }), (Other, new[] { Synthetic.OtherInstitution }));
        Active(db, (Other, 2));
        var view = HospitalPick.Read(db, new[] { Synthetic.Scope, Other }, new VendorUser("NINECHARS", "20261030"), Synthetic.Today, Synthetic.Target(), null);
        Assert.All(view.Choices, c => Assert.False(c.Mine));
        Assert.Equal(1, view.Preselected);

        var failing = Db((Synthetic.Scope, new[] { Synthetic.Institution }), (Other, new[] { Synthetic.OtherInstitution }));
        failing.Answer(Sql.UserScopeSql);
        failing.Fail(Sql.ActiveScopesSql, BitErrors.ReadFailed);
        var e = Assert.Throws<BitException>(() =>
            HospitalPick.Read(failing, new[] { Synthetic.Scope, Other }, new VendorUser("SYNUSER", "20261030"), Synthetic.Today, Synthetic.Target(), null));
        Assert.Equal(BitErrors.ReadFailed, e.Code);
    }

    // ---- claim-learn AC-9317.3 고르기 창도 같은 '전 병원 파일 보관' 한 줄 ----------------------------------

    [Fact(DisplayName = "AC-9317.3 지금 등록과 범위·기관기호가 같은 줄만 프로필 ID를 그대로 둔다(RegisterFlow와 같은 규칙)")]
    public void AC9317_3_KeepsProfile()
    {
        var previous = Synthetic.Registration();
        Assert.True(HospitalPick.KeepsProfile(previous, Synthetic.Scope, Synthetic.Institution));
        Assert.False(HospitalPick.KeepsProfile(previous, Other, Synthetic.Institution));
        Assert.False(HospitalPick.KeepsProfile(previous, Synthetic.Scope, Synthetic.OtherInstitution));
        Assert.False(HospitalPick.KeepsProfile(null, Synthetic.Scope, Synthetic.Institution));
    }

    [Fact(DisplayName = "AC-9317.3 고른 줄로 등록하면 옮길 파일 수: 프로필을 그대로 두는 줄은 ifKept, 나머지는 ifNew. 0이거나 고른 줄이 없으면 보관 줄 없음")]
    public void AC9317_3_ArchiveLineByChoice()
    {
        var choices = new[] { Choice(Synthetic.Scope, Synthetic.Institution, 3), Choice(Other, Synthetic.OtherInstitution, 0) };
        var plain = View(choices, Synthetic.Registration());
        Assert.Equal(0, plain.ArchiveCount(0));
        Assert.Null(plain.ArchiveLine(1));

        var view = plain.WithArchive(ifKept: 1, ifNew: 6);
        Assert.Same(plain.Choices[1], view.Choices[1]);
        Assert.Equal(plain.Preselected, view.Preselected);
        Assert.Equal(plain.PreviousLine, view.PreviousLine);
        Assert.Equal(1, view.ArchiveCount(0));
        Assert.Equal(6, view.ArchiveCount(1));
        Assert.Equal("전에 쓰던 병원의 저장 파일 1개는 지우지 않고 따로 보관해요.", view.ArchiveLine(0));
        Assert.Equal("전에 쓰던 병원의 저장 파일 6개는 지우지 않고 따로 보관해요.", view.ArchiveLine(1));
        Assert.Null(view.ArchiveLine(null));
        Assert.Null(plain.WithArchive(ifKept: 0, ifNew: 6).ArchiveLine(0));

        // 처음 등록(전 등록 없음)이면 어느 줄이든 새 프로필
        var first = View(choices).WithArchive(ifKept: 0, ifNew: 2);
        Assert.Equal(new[] { 2, 2 }, new[] { first.ArchiveCount(0), first.ArchiveCount(1) });
    }
}
