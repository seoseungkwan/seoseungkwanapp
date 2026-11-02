using System;
using System.Collections.Generic;
using Precheck.Core.Revenue;

namespace Precheck.Core.Bit;

/// <summary>매개변수 종류(원본 SqlDbType 중 쓰는 것).</summary>
public enum SqlParamKind
{
    VarChar,
    Char,
}

/// <summary>SQL 상수가 받는 매개변수 하나: 이름·종류·크기(원본 Parameters.Add 그대로).</summary>
public sealed class SqlParam
{
    public SqlParam(string name, SqlParamKind kind, int size)
    {
        Name = name;
        Kind = kind;
        Size = size;
    }

    public string Name { get; }

    public SqlParamKind Kind { get; }

    public int Size { get; }
}

/// <summary>
/// 도우미가 비트 DB에 돌리는 SQL 전부(AC-005.3). 문장은 원본에서 그대로 옮겼다(공백만 다를 수 있음, 사본은
/// helper/tests/Precheck.Core.Tests/Bit/original-sql/*.sql, 시험이 비교). 모두 매개변수를 받는 SELECT 하나다.
/// ReadOnlyGuard는 여기 있는 문장만 통과시킨다. 뒤 TASK가 읽기를 더할 때는 원본 문장과 사본·매개변수 표를 함께 더한다.
/// </summary>
public static class Sql
{
    /// <summary>비트 DB 접속 시간 제한(원본 ReadOnlyConnection ConnectTimeout=10, AC-005.2).</summary>
    public const int ConnectTimeoutSeconds = 10;

    /// <summary>메타 읽기(범위·기관기호·스냅숏 상태) 시간 제한(원본 CommandTimeout=15).</summary>
    public static readonly TimeSpan MetaTimeout = TimeSpan.FromSeconds(15);

    /// <summary>원본 HospitalSecurity.Authorize: 비트 로그인 사용자의 그날 병원 범위(DepHspNum).</summary>
    public const string UserScopeSql =
        "SELECT DISTINCT RTRIM(d.DepHspNum) FROM dbo.UidMst u JOIN dbo.DepMst d ON u.UidDepCod=d.DepCod " +
        "WHERE u.UidCod=@user AND @workDate BETWEEN u.UidAdpDte AND u.UidExpDte AND @workDate BETWEEN d.DepAdpDte AND d.DepExpDte";

    /// <summary>원본 HospitalSecurity.Authorize·VerifyCurrentInstitution: DB 안의 모든 병원 범위(다른 병원이 섞였는지).</summary>
    public const string ScopesSql = "SELECT DISTINCT RTRIM(DepHspNum) FROM dbo.DepMst";

    /// <summary>원본 HospitalSecurity.VerifyInstitutionNumber: 그 범위의 그날 요양기관번호(HspMst.HspInsNum).</summary>
    public const string InstitutionSql =
        "SELECT RTRIM(HspInsNum) FROM dbo.HspMst WHERE RTRIM(HspCod)=@scope AND @day BETWEEN HspAdpDte AND HspExpDte";

    /// <summary>원본 RxHistory 등: 스냅숏 격리를 쓸 수 있는지(되돌리는 트랜잭션의 격리 수준을 고른다).</summary>
    public const string SnapshotStateSql = "SELECT snapshot_isolation_state FROM sys.databases WHERE database_id=DB_ID()";

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [UserScopeSql] = new[] { new SqlParam("@user", SqlParamKind.VarChar, 8), new SqlParam("@workDate", SqlParamKind.Char, 8) },
        [ScopesSql] = new SqlParam[0],
        [InstitutionSql] = new[] { new SqlParam("@scope", SqlParamKind.VarChar, 32), new SqlParam("@day", SqlParamKind.Char, 8) },
        [SnapshotStateSql] = new SqlParam[0],
    };

    /// <summary>허용 목록(이 클래스의 SQL 상수 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 허용 목록의 문장과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && (Allowed.ContainsKey(sql) || RevenueSql.Parameters.ContainsKey(sql) || Stats.StatsSql.IsAllowed(sql) || Diag.DiagSql.IsAllowed(sql));

    /// <summary>문장이 받는 매개변수 표. 허용 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql != null && Allowed.TryGetValue(sql, out var parameters)) return parameters;
        if (sql != null && RevenueSql.Parameters.TryGetValue(sql, out var revenue)) return revenue;
        if (sql != null && Diag.DiagSql.TryGetParameters(sql, out var measurement)) return measurement;
        return Stats.StatsSql.ParametersOf(sql!);
    }
}
