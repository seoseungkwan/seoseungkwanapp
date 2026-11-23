using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// 비트 통계 화면(TASK-8). AC-008.3: 화면 정의는 원본 NativeMappings의 83·83D·47 줄 그대로.
/// AC-008.1: 원본 NativeReportAdapter처럼 표를 읽기 전에 비트 로그인 사용자의 병원 범위(Authorize)와 통계 권한(CheckPermissions)을 본다.
/// 통계 메뉴 파일(BITSTATISTICS.Xml)은 원본 Catalog.Read처럼 읽는다. 메뉴·권한 값은 지어낸 것이다.
/// </summary>
public class StatsScreensTests
{
    [Fact(DisplayName = "AC-008.3 화면 정의(83 증상·83D 상병내역·47 처방내역)는 원본 NativeMappings 그대로(DLL·모듈·화면·불러오기·조회·시작일·종료일·표)")]
    public void DefinitionsMatchOriginal()
    {
        Assert.Equal(new[] { "83", "83D", "47" }, StatsScreens.Keys);

        var symptoms = StatsScreens.Of("83");
        Assert.Equal(
            "BITSSElectricData.dll|BIT.DrBIT.Statistics.cSElectricData|BIT.DrBIT.Statistics.fSElectricData|fSpecialPatient_Load|btnTotal_Click|_dtpStartDate|_dtpEndDate|_cfgMain",
            Describe(symptoms));
        Assert.Equal("증상", symptoms.Kind);

        var diagnoses = StatsScreens.Of("83D");
        Assert.Equal(Describe(symptoms), Describe(diagnoses));     // 같은 화면을 종류만 '상병내역'으로 한 번 더(원본 Handoff.DxKey)
        Assert.Equal("상병내역", diagnoses.Kind);
        Assert.Equal("83", diagnoses.PermissionKey);

        var prescriptions = StatsScreens.Of("47");
        Assert.Equal(
            "BITSDepOdrPatList.dll|BIT.DrBIT.Statistics.BITSDepOdrPatList|BIT.DrBIT.Statistics.fSDepOdrPatList|fSDepOdr_Load|btnTotal_Click|_dtpStartDte|_dtpEndDte|_cfgMain",
            Describe(prescriptions));
        Assert.Null(prescriptions.Kind);
        Assert.Equal("47", prescriptions.PermissionKey);

        Assert.Equal("_cbxStaTyp", StatsScreens.KindField);
        Assert.Equal(@"ini\BITSTATISTICS.Xml", StatsScreens.MenuFile);
        Assert.Equal(TimeSpan.FromSeconds(150), StatsScreens.ReadTimeout);
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsScreens.Of("84")).Code);
    }

    private static string Describe(StatsScreen s) =>
        string.Join("|", s.Assembly, s.Module, s.Form, s.Load, s.Query, s.Start, s.End, s.Grid);

    [Fact(DisplayName = "AC-008.1 통계 메뉴 파일(원본 Catalog.Read): href로 이어진 PopupMenuTool·ButtonTool에서 키별 제목과 숨김 여부를 읽는다")]
    public void ReadsMenuLikeOriginalCatalog()
    {
        var menu = StatsMenu.Parse(Encoding.UTF8.GetBytes(FakeScreens.MenuXml));
        Assert.Equal("전산자료 추출통계", menu["83"].Title);
        Assert.True(menu["83"].Visible);
        Assert.Equal("처방별 환자 목록", menu["47"].Title);
        Assert.True(menu["47"].Visible);
        Assert.False(menu["99"].Visible);

        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsMenu.Parse(Encoding.UTF8.GetBytes("<root/>"))).Code);
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsMenu.Parse(Encoding.UTF8.GetBytes("not xml"))).Code);
    }

    private static FakeDb Db(params object?[][] permissions)
    {
        var db = FakeDb.Hospital(new FakeDb());
        db.Answer(Sql.UserPermissionsSql, _ => permissions);
        return db;
    }

    private static readonly VendorUser User = new VendorUser("SYNUSER", "20261030");

    private static IReadOnlyDictionary<string, StatsMenuItem> Menu => StatsMenu.Parse(Encoding.UTF8.GetBytes(FakeScreens.MenuXml));

    [Fact(DisplayName = "AC-008.1 로그인 사용자의 병원 범위가 등록 범위와 같고, 83·47 메뉴 제목에 권한(UgaExeLvl이 D가 아님)이 있을 때만 통과(83D는 83 권한)")]
    public void AccessPasses()
    {
        var db = Db(new object?[] { "전산자료 추출통계 ", "A" }, new object?[] { "처방별 환자 목록", "R" }, new object?[] { "다른 통계", "D" });
        StatsAccess.Check(db, User, Synthetic.Scope, Menu, StatsScreens.Keys);

        Assert.Equal(new[] { Sql.UserScopeSql, Sql.UserPermissionsSql }, db.Sqls);
        Assert.Equal("SYNUSER", db.Calls[0].Args["@user"]);
        Assert.Equal("20261030", db.Calls[0].Args["@workDate"]);
        Assert.Equal("SYNUSER", db.Calls[1].Args["@user"]);
        Assert.Equal(Sql.MetaTimeout, db.Calls[1].Timeout);
    }

    [Fact(DisplayName = "AC-008.1 로그인 사용자의 범위가 등록과 다르면 E-BIT-HOSPITAL-MISMATCH(권한·표를 읽지 않음)")]
    public void AccessScopeMismatch()
    {
        var db = Db(new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" });
        db.Answer(Sql.UserScopeSql, "OTHER");
        Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => StatsAccess.Check(db, User, Synthetic.Scope, Menu, StatsScreens.Keys)).Code);
        Assert.DoesNotContain(Sql.UserPermissionsSql, db.Sqls);
    }

    [Fact(DisplayName = "AC-005.13 계정 범위를 하나로 읽지 못하면(없음·둘·로그인 모양 틀림) 막지 않고 권한 확인으로 간다")]
    public void AccessUnknownScopePasses()
    {
        var permissions = new[] { new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" } };

        var none = Db(permissions);
        none.Answer(Sql.UserScopeSql);
        StatsAccess.Check(none, User, Synthetic.Scope, Menu, StatsScreens.Keys);
        Assert.Contains(Sql.UserPermissionsSql, none.Sqls);

        var two = Db(permissions);
        two.Answer(Sql.UserScopeSql, Synthetic.Scope, "OTHER");
        StatsAccess.Check(two, User, Synthetic.Scope, Menu, StatsScreens.Keys);

        var blank = Db(permissions);
        blank.Answer(Sql.UserScopeSql, "  ");
        StatsAccess.Check(blank, User, Synthetic.Scope, Menu, StatsScreens.Keys);

        var badDay = Db(permissions);
        StatsAccess.Check(badDay, new VendorUser("SYNUSER", "2026-10-30"), Synthetic.Scope, Menu, StatsScreens.Keys);
        Assert.DoesNotContain(Sql.UserScopeSql, badDay.Sqls);
    }

    public static IEnumerable<object?[]> MissingPermissions()
    {
        yield return new object?[] { new[] { new object?[] { "처방별 환자 목록", "A" } } };                                                   // 83 권한 없음
        yield return new object?[] { new[] { new object?[] { "전산자료 추출통계", "A" } } };                                                   // 47 권한 없음
        yield return new object?[] { new[] { new object?[] { "전산자료 추출통계", "D" }, new object?[] { "처방별 환자 목록", "A" } } };        // D = 막음
        yield return new object?[] { new[] { new object?[] { "전산자료 추출통계", "d " }, new object?[] { "처방별 환자 목록", "A" } } };       // 원본 DataTable 비교: 대소문자·뒤 공백 무시
        yield return new object?[] { new[] { new object?[] { "전산자료 추출통계", null }, new object?[] { "처방별 환자 목록", "A" } } };       // NULL <> 'D'는 참이 아님
    }

    [Theory(DisplayName = "AC-008.1 통계 권한이 없으면 E-BIT-EXPORT-FAILED(원본 '조회 권한이 없습니다')")]
    [MemberData(nameof(MissingPermissions))]
    public void AccessNeedsPermissions(object?[][] permissions)
    {
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsAccess.Check(Db(permissions), User, Synthetic.Scope, Menu, StatsScreens.Keys)).Code);
    }

    [Fact(DisplayName = "AC-008.1 메뉴에 없거나 숨긴 통계는 E-BIT-EXPORT-FAILED")]
    public void AccessNeedsVisibleMenu()
    {
        var hidden = FakeScreens.MenuXml.Replace("<Caption>처방별 환자 목록</Caption><Visible>True</Visible>", "<Caption>처방별 환자 목록</Caption><Visible>FALSE</Visible>");
        var db = Db(new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" });
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsAccess.Check(db, User, Synthetic.Scope, StatsMenu.Parse(Encoding.UTF8.GetBytes(hidden)), StatsScreens.Keys)).Code);

        var without47 = FakeScreens.MenuXml.Replace("<Key>47</Key>", "<Key>46</Key>");
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => StatsAccess.Check(db, User, Synthetic.Scope, StatsMenu.Parse(Encoding.UTF8.GetBytes(without47)), StatsScreens.Keys)).Code);
    }
}
