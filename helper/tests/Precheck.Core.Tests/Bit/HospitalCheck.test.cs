using System;
using System.Linq;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-005.4 범위·기관기호 검사: 원본 HospitalSecurity.ValidateScope·ValidateInstitutionNumbers·VerifyInstitutionNumber
/// (원본 HospitalSecurityTests 사례를 옮김). AC-005.6 VerifyCurrentInstitution: 오늘 날짜로 다시 확인.
/// </summary>
public class HospitalCheckTests
{
    private const string Mismatch = "E-BIT-HOSPITAL-MISMATCH";

    // ---- AC-005.4 ValidateInstitutionNumbers (원본 시험 사례) ------------------------------------------

    [Fact(DisplayName = "AC-005.4 기관기호 줄이 모두 8자리 숫자이고 등록한 것과 같으면 통과(뒤 공백은 지움)")]
    public void InstitutionNumbersPass()
    {
        HospitalCheck.ValidateInstitutionNumbers(new[] { "12345678", "12345678 " }, "12345678");
        HospitalCheck.ValidateInstitutionNumbers(new[] { " 12345678" }, "12345678");
    }

    public static TheoryData<string?[]> RefusedInstitutionRows() => new TheoryData<string?[]>
    {
        new string?[0],
        new string?[] { null },
        new string?[] { "" },
        new string?[] { "87654321" },
        new string?[] { "12345678", "87654321" },
        new string?[] { "12345678", null },
        new string?[] { "1234567" },
        new string?[] { "123456789" },
        new string?[] { "1234567a" },
    };

    [Theory(DisplayName = "AC-005.4 기관기호 줄이 없거나·비었거나·다르거나·섞였거나·8자리가 아니면 E-BIT-HOSPITAL-MISMATCH")]
    [MemberData(nameof(RefusedInstitutionRows))]
    public void InstitutionNumbersRefused(string?[] rows)
    {
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ValidateInstitutionNumbers(rows, "12345678")).Code);
    }

    [Theory(DisplayName = "AC-005.4 등록한 기관기호가 8자리 숫자가 아니면 늘 막는다")]
    [InlineData("1234567")]
    [InlineData("")]
    [InlineData("abcdefgh")]
    [InlineData(null)]
    public void ExpectedInstitutionMustBeEightDigits(string? expected)
    {
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ValidateInstitutionNumbers(new[] { expected }, expected!)).Code);
    }

    // ---- AC-005.4 ValidateScope (원본 시험 사례) -------------------------------------------------------

    [Fact(DisplayName = "AC-005.4 범위 줄이 정확히 하나이고 등록한 것과 같으면 통과")]
    public void ScopePass()
    {
        HospitalCheck.ValidateScope(new[] { "SYNTHETIC " }, "SYNTHETIC");
    }

    public static TheoryData<string?[]> RefusedScopeRows() => new TheoryData<string?[]>
    {
        new string?[0],
        new string?[] { null },
        new string?[] { "  " },
        new string?[] { "FOREIGN" },
        new string?[] { "SYNTHETIC", "FOREIGN" },
        new string?[] { "SYNTHETIC", "SYNTHETIC" },
        new string?[] { "synthetic" },
    };

    [Theory(DisplayName = "AC-005.4 범위가 없거나·비었거나·다르거나·둘 이상이면 E-BIT-HOSPITAL-MISMATCH")]
    [MemberData(nameof(RefusedScopeRows))]
    public void ScopeRefused(string?[] rows)
    {
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ValidateScope(rows, "SYNTHETIC")).Code);
    }

    // ---- AC-005.4 비트에서 읽기(로그인 사용자의 범위, 그날의 기관기호) -----------------------------------

    [Fact(DisplayName = "AC-005.4 로그인 사용자의 병원 범위는 하나여야 하고, 원본 SQL·매개변수로 읽는다")]
    public void ReadsUserScope()
    {
        var db = FakeDb.Hospital(new FakeDb());
        var user = new VendorUser("SYNUSER", "20261029");
        Assert.Equal(Synthetic.Scope, HospitalCheck.ReadUserScope(db, user));

        var call = Assert.Single(db.Calls);
        Assert.Equal(Sql.UserScopeSql, call.Sql);
        Assert.Equal("SYNUSER", call.Args["@user"]);
        Assert.Equal("20261029", call.Args["@workDate"]);
        Assert.Equal(TimeSpan.FromSeconds(15), call.Timeout);

        foreach (var rows in new[] { new string?[0], new string?[] { "A", "B" }, new string?[] { " " }, new string?[] { null } })
        {
            var other = new FakeDb().Answer(Sql.UserScopeSql, rows);
            Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ReadUserScope(other, user)).Code);
        }
    }

    [Theory(DisplayName = "AC-005.4 비트 로그인 사용자 ID(8자 이하)·작업일(yyyyMMdd)이 틀리면 읽지 않고 막는다")]
    [InlineData("", "20261030")]
    [InlineData("TOOLONGID", "20261030")]
    [InlineData("SYNUSER", "2026-10-30")]
    [InlineData("SYNUSER", "20261332")]
    [InlineData("SYNUSER", "")]
    public void RefusesBadVendorUser(string userId, string workDate)
    {
        var db = FakeDb.Hospital(new FakeDb());
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ReadUserScope(db, new VendorUser(userId, workDate))).Code);
        Assert.Empty(db.Calls);
    }

    [Fact(DisplayName = "AC-005.4 등록할 기관기호는 그날 비트 HspMst의 8자리 숫자 하나(줄이 여럿이면 모두 같아야)")]
    public void ReadsInstitutionCode()
    {
        var db = new FakeDb().Answer(Sql.InstitutionSql, "12345678", "12345678 ");
        Assert.Equal("12345678", HospitalCheck.ReadInstitutionCode(db, Synthetic.Scope, new DateTime(2026, 10, 29)));
        var call = Assert.Single(db.Calls);
        Assert.Equal(Sql.InstitutionSql, call.Sql);
        Assert.Equal(Synthetic.Scope, call.Args["@scope"]);
        Assert.Equal("20261029", call.Args["@day"]);

        foreach (var rows in new[] { new string?[0], new string?[] { "12345678", "87654321" }, new string?[] { "1234567" }, new string?[] { null } })
        {
            var other = new FakeDb().Answer(Sql.InstitutionSql, rows);
            Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.ReadInstitutionCode(other, Synthetic.Scope, Synthetic.Today)).Code);
        }
    }

    // ---- AC-005.6 VerifyCurrent (원본 VerifyCurrentInstitution) -----------------------------------------

    [Fact(DisplayName = "AC-005.6 등록이 없으면 E-BIT-NOT-REGISTERED(DB를 읽지 않음)")]
    public void VerifyCurrentWithoutRegistration()
    {
        var session = FakeDb.Hospital(new FakeSession());
        Assert.Equal("E-BIT-NOT-REGISTERED", Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(session, null, Synthetic.Today)).Code);
        Assert.Empty(session.Calls);
    }

    [Fact(DisplayName = "AC-005.6 등록 병원과 같으면 통과: DB 안 범위 하나 + 오늘 날짜의 기관기호를 다시 읽는다")]
    public void VerifyCurrentPasses()
    {
        var session = FakeDb.Hospital(new FakeSession(Synthetic.Target(install: @"c:\drbit50\", server: @".\sqlexpress", database: "drbit")));
        HospitalCheck.VerifyCurrent(session, Synthetic.Registration(), Synthetic.Today);

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, session.Sqls);
        var institution = session.Calls[1];
        Assert.Equal(Synthetic.Scope, institution.Args["@scope"]);
        Assert.Equal("20261030", institution.Args["@day"]);
        Assert.All(session.Calls, call => Assert.Equal(TimeSpan.FromSeconds(15), call.Timeout));
    }

    [Fact(DisplayName = "AC-005.6 설치 위치·서버·DB 이름이 등록과 다르면 읽기 전에 E-BIT-HOSPITAL-MISMATCH")]
    public void VerifyCurrentTargetMismatch()
    {
        foreach (var target in new[]
        {
            Synthetic.Target(install: @"D:\DrBIT50"),
            Synthetic.Target(server: "192.168.0.10"),
            Synthetic.Target(database: "DRBIT_OTHER"),
        })
        {
            var session = FakeDb.Hospital(new FakeSession(target));
            Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(session, Synthetic.Registration(), Synthetic.Today)).Code);
            Assert.Empty(session.Calls);
        }
    }

    [Fact(DisplayName = "AC-005.6 DB 안 범위·오늘 기관기호가 등록과 다르면 E-BIT-HOSPITAL-MISMATCH")]
    public void VerifyCurrentDataMismatch()
    {
        var foreignScope = FakeDb.Hospital(new FakeSession());
        foreignScope.Answer(Sql.ScopesSql, "FOREIGN", "OTHER"); // 등록 범위가 DB 안에 없다(AC-005.18부터 다른 범위가 함께 있는 것만으로는 막지 않음)
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(foreignScope, Synthetic.Registration(), Synthetic.Today)).Code);

        var otherNumber = FakeDb.Hospital(new FakeSession(), institution: Synthetic.OtherInstitution);
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(otherNumber, Synthetic.Registration(), Synthetic.Today)).Code);

        var expired = FakeDb.Hospital(new FakeSession());
        expired.Answer(Sql.InstitutionSql, new string?[0]);
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(expired, Synthetic.Registration(), Synthetic.Today)).Code);

        Assert.All(new[] { foreignScope, otherNumber, expired }.SelectMany(s => s.Sqls), sql => Assert.Contains(sql, Sql.All));
    }

    [Fact(DisplayName = "AC-005.13 등록 기관기호가 비었으면 매번 확인은 번호를 보지 않는다(범위·설치 위치는 그대로 본다)")]
    public void VerifyCurrentWithoutInstitution()
    {
        var registration = Synthetic.Registration(institution: "");
        var session = FakeDb.Hospital(new FakeSession(), institution: Synthetic.OtherInstitution);
        HospitalCheck.VerifyCurrent(session, registration, Synthetic.Today);
        Assert.Equal(new[] { Sql.ScopesSql }, session.Sqls);

        var foreign = FakeDb.Hospital(new FakeSession());
        foreign.Answer(Sql.ScopesSql, "FOREIGN");
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(foreign, registration, Synthetic.Today)).Code);
    }

    [Fact(DisplayName = "AC-005.18 매번 확인: DB 안 범위가 여럿이어도 등록 범위가 들어 있으면 통과하고, 기관기호·설치 위치 확인은 그대로다")]
    public void VerifyCurrentAllowsOtherScopes()
    {
        var session = FakeDb.Hospital(new FakeSession());
        session.Answer(Sql.ScopesSql, "FOREIGN", Synthetic.Scope + " ", "", null);
        HospitalCheck.VerifyCurrent(session, Synthetic.Registration(), Synthetic.Today);
        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql }, session.Sqls);

        var otherNumber = FakeDb.Hospital(new FakeSession(), institution: Synthetic.OtherInstitution);
        otherNumber.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(otherNumber, Synthetic.Registration(), Synthetic.Today)).Code);

        var withoutNumber = FakeDb.Hospital(new FakeSession(), institution: Synthetic.OtherInstitution);
        withoutNumber.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
        HospitalCheck.VerifyCurrent(withoutNumber, Synthetic.Registration(institution: ""), Synthetic.Today);

        var elsewhere = FakeDb.Hospital(new FakeSession(Synthetic.Target(install: @"D:\Elsewhere")));
        elsewhere.Answer(Sql.ScopesSql, Synthetic.Scope, "FOREIGN");
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(elsewhere, Synthetic.Registration(), Synthetic.Today)).Code);
        Assert.Empty(elsewhere.Sqls);
    }

    [Fact(DisplayName = "AC-005.18 최근 내원 범위 읽기는 새 SELECT 하나를 @from·@to(Char 12)로 돌리고, 내원 1건 이상·빈 값 뺀 범위만 뒤 공백을 지워 준다")]
    public void ReadActiveScopes()
    {
        Assert.Contains(Sql.ActiveScopesSql, ReadOnlyGuardTests.Derived);
        Assert.Equal(new[] { "@from:Char:12", "@to:Char:12" }, Sql.ParametersOf(Sql.ActiveScopesSql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        var db = new FakeSession();
        db.Answer(Sql.ActiveScopesSql, _ => new[]
        {
            new object?[] { "A ", 2L }, new object?[] { "B", 0L }, new object?[] { "", 5L }, new object?[] { null, 1L }, new object?[] { "C", 1 }, new object?[] { "A", 7L },
        });
        Assert.Equal(new[] { "A", "C" }, HospitalCheck.ReadActiveScopes(db, Synthetic.Today));
        Assert.Equal("202609300000", db.Calls.Single().Args["@from"]);
        Assert.Equal("202610310000", db.Calls.Single().Args["@to"]);
    }

    [Fact(DisplayName = "AC-005.18 ActiveScopesSql 글자: 외래·접수 취소 아님·진료과 날짜 사이 조건으로 범위마다 세고, 범위·숫자만 읽으며 진료 상태 조건은 없다")]
    public void ActiveScopesSqlText()
    {
        var sql = ReadOnlyGuardTests.Squash(Sql.ActiveScopesSql);
        Assert.True(Sql.IsAllowed(Sql.ActiveScopesSql));
        Assert.Equal(
            "SELECT RTRIM(d.DepHspNum) Scope,COUNT_BIG(*) Visits FROM dbo.OcmInf c " +
            "JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte " +
            "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' " +
            "GROUP BY RTRIM(d.DepHspNum)",
            sql);
        Assert.DoesNotContain("OcmComStt", sql, StringComparison.Ordinal);
        Assert.Equal("SELECT RTRIM(d.DepHspNum) Scope,COUNT_BIG(*) Visits", sql.Substring(0, sql.IndexOf(" FROM ", StringComparison.Ordinal)));
    }

    [Fact(DisplayName = "AC-005.13 매번 확인도 처음 등록과 같은 기준: 빈 범위 줄·8자리 아닌 기관기호 줄은 빼고 본다")]
    public void VerifyCurrentIgnoresNoise()
    {
        var noisy = FakeDb.Hospital(new FakeSession());
        noisy.Answer(Sql.ScopesSql, Synthetic.Scope + " ", "", null);
        noisy.Answer(Sql.InstitutionSql, Synthetic.Institution, null, "1234567", Synthetic.Institution + " ");
        HospitalCheck.VerifyCurrent(noisy, Synthetic.Registration(), Synthetic.Today);

        var twoNumbers = FakeDb.Hospital(new FakeSession());
        twoNumbers.Answer(Sql.InstitutionSql, Synthetic.Institution, Synthetic.OtherInstitution);
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(twoNumbers, Synthetic.Registration(), Synthetic.Today)).Code);

        var onlyNoise = FakeDb.Hospital(new FakeSession());
        onlyNoise.Answer(Sql.InstitutionSql, "1234567", null);
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(onlyNoise, Synthetic.Registration(), Synthetic.Today)).Code);

        var blankAndForeign = FakeDb.Hospital(new FakeSession());
        blankAndForeign.Answer(Sql.ScopesSql, "", "FOREIGN");
        Assert.Equal(Mismatch, Assert.Throws<BitException>(() => HospitalCheck.VerifyCurrent(blankAndForeign, Synthetic.Registration(), Synthetic.Today)).Code);
    }
}
