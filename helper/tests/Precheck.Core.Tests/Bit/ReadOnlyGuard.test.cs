using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-005.3 도우미가 돌리는 SQL은 ReadOnlyGuard를 거쳐 Sql.cs 상수만, 정해 둔 매개변수와 함께 돈다.
/// SQL 문장은 원본에서 그대로 옮겼다(original-sql/*.sql 사본과 공백만 다름, design.md 10절).
/// </summary>
public class ReadOnlyGuardTests
{
    private static readonly Dictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    private static Dictionary<string, object?> Args(params (string Name, object? Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Name, pair => pair.Value);

    /// <summary>original-sql 사본 이름 → Sql.cs 상수. 한 달 자료 읽기(TASK-8)의 원본 SQL도 여기 함께 둔다.</summary>
    internal static readonly Dictionary<string, string> Originals = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["user-scope.sql"] = Sql.UserScopeSql,
        ["scopes.sql"] = Sql.ScopesSql,
        ["institution.sql"] = Sql.InstitutionSql,
        ["snapshot-state.sql"] = Sql.SnapshotStateSql,
        ["period-identity.sql"] = Sql.PeriodIdentitySql,
        ["user-permissions.sql"] = Sql.UserPermissionsSql,
        ["history-visits.sql"] = Sql.HistoryVisitSql,
        ["history-codes.sql"] = Sql.HistoryCodeSql,
        ["memo-rows.sql"] = Sql.MemoRowsSql,
        ["trend-count.sql"] = Sql.TrendCountSql,
        ["trend-totals.sql"] = Sql.TrendTotalsSql,
        ["trend-pairs.sql"] = Sql.TrendPairsSql,
        ["trend-visit-rx.sql"] = Sql.TrendVisitRxSql,
        ["trend-visit-dx.sql"] = Sql.TrendVisitDxSql,
        ["prescription-catalog.sql"] = Sql.PrescriptionCatalogSql,
        ["la-catalog.sql"] = Sql.LaCatalogSql,
    };

    /// <summary>원본에 없는 새 SELECT(원본 조건을 그대로 쓴 것). 원본 사본 대신 ClaimSqlTests가 원본 조건과 비교한다.</summary>
    internal static readonly string[] Derived = { Sql.ClaimDatesSql, Sql.InputVisitCountSql, Sql.ActiveScopesSql };

    internal static string OriginalDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "Bit", "original-sql");
            if (Directory.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Bit/original-sql 폴더를 찾지 못했다");
    }

    internal static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    internal static string ReadOriginal(string file) =>
        string.Join("\n", File.ReadAllLines(Path.Combine(OriginalDirectory(), file)).Where(line => !line.TrimStart().StartsWith("--", StringComparison.Ordinal)));

    [Fact(DisplayName = "AC-005.3 Sql.cs 상수는 원본 SQL 사본(original-sql/*.sql)과 공백만 다르다")]
    public void ConstantsMatchOriginalCopies()
    {
        var files = Directory.GetFiles(OriginalDirectory(), "*.sql").Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.Equal(Originals.Keys.OrderBy(name => name, StringComparer.Ordinal).ToArray(), files);
        foreach (var pair in Originals) Assert.Equal(Squash(ReadOriginal(pair.Key)), Squash(pair.Value));

        // 허용 목록 = 원본에서 옮긴 상수 + 원본 조건을 그대로 쓴 새 SELECT(뒤 TASK가 더하면 사본도 함께 더한다)
        Assert.Equal(Originals.Values.Concat(Derived).OrderBy(sql => sql, StringComparer.Ordinal), Sql.All.OrderBy(sql => sql, StringComparer.Ordinal));
    }

    [Fact(DisplayName = "AC-005.3 허용 SQL은 모두 SELECT 하나뿐(원본 이력·추세의 WITH … SELECT 포함, ; · 주석 · 쓰기·실행 낱말 없음)")]
    public void AllowedStatementsAreSingleSelects()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.NotEmpty(Sql.All);
        foreach (var sql in Sql.All)
        {
            // WITH는 원본 이력·추세 SQL의 공통 테이블 식(CTE) 뒤 SELECT 하나다. 다른 문장 시작은 없다
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal), sql);
            if (sql.StartsWith("WITH ", StringComparison.Ordinal)) Assert.Contains(") SELECT ", Squash(sql), StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotMatch(forbidden, sql);
        }
    }

    [Fact(DisplayName = "AC-005.3 Sql 상수는 정해 둔 매개변수와 함께만 통과한다")]
    public void ConstantsPassWithDeclaredArguments()
    {
        ReadOnlyGuard.Require(Sql.ScopesSql);
        ReadOnlyGuard.Require(Sql.ScopesSql, NoArgs);
        ReadOnlyGuard.Require(Sql.SnapshotStateSql, NoArgs);
        ReadOnlyGuard.Require(Sql.UserScopeSql, Args(("@user", "SYNUSER"), ("@workDate", "20261030")));
        ReadOnlyGuard.Require(Sql.InstitutionSql, Args(("@scope", Synthetic.Scope), ("@day", "20261030")));

        // 상수의 매개변수 표(SqlBitDb가 종류·길이를 이 표대로 붙인다): 원본의 SqlDbType·크기
        Assert.Equal(new[] { "@user:VarChar:8", "@workDate:Char:8" }, Sql.ParametersOf(Sql.UserScopeSql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        Assert.Equal(new[] { "@scope:VarChar:32", "@day:Char:8" }, Sql.ParametersOf(Sql.InstitutionSql).Select(p => p.Name + ":" + p.Kind + ":" + p.Size));
        Assert.Empty(Sql.ParametersOf(Sql.ScopesSql));
    }

    public static IEnumerable<object?[]> NotConstants()
    {
        yield return new object?[] { "SELECT 1" };
        yield return new object?[] { "DELETE FROM dbo.DepMst" };
        yield return new object?[] { Sql.ScopesSql + " " };
        yield return new object?[] { Sql.ScopesSql + "; DELETE FROM dbo.DepMst" };
        yield return new object?[] { Sql.ScopesSql.ToLowerInvariant() };
        yield return new object?[] { Sql.InstitutionSql.Replace("@scope", "'SYNTHETIC'") };
        yield return new object?[] { "" };
        yield return new object?[] { null };
    }

    [Theory(DisplayName = "AC-005.3 정해 둔 것 밖의 SQL 글자는 E-BIT-READ-FAILED로 막는다")]
    [MemberData(nameof(NotConstants))]
    public void RefusesAnythingElse(string? sql)
    {
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql!)).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql!, NoArgs)).Code);
    }

    public static IEnumerable<object?[]> BadArguments()
    {
        yield return new object?[] { Sql.InstitutionSql, Args(("@scope", Synthetic.Scope)) };                                     // 빠짐
        yield return new object?[] { Sql.InstitutionSql, Args(("@scope", Synthetic.Scope), ("@day", "20261030"), ("@x", "1")) }; // 더함
        yield return new object?[] { Sql.InstitutionSql, Args(("@scope", Synthetic.Scope), ("@day", 20261030)) };               // 글자가 아님
        yield return new object?[] { Sql.InstitutionSql, Args(("@scope", Synthetic.Scope), ("@day", null)) };
        yield return new object?[] { Sql.InstitutionSql, Args(("@scope", new string('S', 33)), ("@day", "20261030")) };         // 길이 넘음
        yield return new object?[] { Sql.InstitutionSql, Args(("@SCOPE", Synthetic.Scope), ("@day", "20261030")) };             // 이름 대소문자
        yield return new object?[] { Sql.UserScopeSql, Args(("@user", "TOOLONGID"), ("@workDate", "20261030")) };
        yield return new object?[] { Sql.ScopesSql, Args(("@scope", Synthetic.Scope)) };
    }

    [Theory(DisplayName = "AC-005.3 매개변수가 빠지거나·더해지거나·글자가 아니거나·길면 막는다")]
    [MemberData(nameof(BadArguments))]
    public void RefusesBadArguments(string sql, Dictionary<string, object?> args)
    {
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(sql, args)).Code);
    }

    [Fact(DisplayName = "AC-005.3 ReadOnlyGuard.Query는 막힌 SQL을 DB에 넘기지 않는다")]
    public void QueryNeverReachesDbWhenRefused()
    {
        var db = FakeDb.Hospital(new FakeDb());
        Assert.Throws<BitException>(() => ReadOnlyGuard.Query(db, "DELETE FROM dbo.DepMst", NoArgs, Sql.MetaTimeout));
        Assert.Throws<BitException>(() => ReadOnlyGuard.Query(db, Sql.InstitutionSql, NoArgs, Sql.MetaTimeout));
        Assert.Empty(db.Calls);

        var rows = ReadOnlyGuard.Query(db, Sql.ScopesSql, NoArgs, Sql.MetaTimeout);
        Assert.Equal(Synthetic.Scope, Assert.Single(Assert.Single(rows)));
        Assert.Equal(Sql.ScopesSql, Assert.Single(db.Calls).Sql);
    }
}
