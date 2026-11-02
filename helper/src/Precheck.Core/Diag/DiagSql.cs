using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.Diag;

/// <summary>
/// 속도 측정(specs/diag-read-speed)이 비트 DB에 더 돌리는 문장 전부. 모두 SELECT 한 문장이고 값을 이어 붙이지 않는다.
/// 환경 문장은 sys.*와 서버 속성만 읽고, 조각 문장은 건수만 돌려주므로 환자 값이 DB 밖으로 나오지 않는다.
/// Sql.IsAllowed·ParametersOf가 이 표도 보므로 ReadOnlyGuard를 지난다. 제품 목록(Sql.All·StatsSql.All·RevenueSql.Parameters)에는 넣지 않는다.
/// </summary>
public static class DiagSql
{
    /// <summary>서버 판·수준·에디션.</summary>
    public const string ServerInfo = "SELECT CONVERT(varchar(128),SERVERPROPERTY('ProductVersion')),CONVERT(varchar(128),SERVERPROPERTY('ProductLevel')),CONVERT(varchar(128),SERVERPROPERTY('Edition'))";

    /// <summary>호환성·스냅숏·RCSI·통계 자동·복구 모델.</summary>
    public const string DatabaseInfo = "SELECT compatibility_level,snapshot_isolation_state,is_read_committed_snapshot_on,is_auto_create_stats_on,is_auto_update_stats_on,recovery_model_desc FROM sys.databases WHERE database_id=DB_ID()";

    /// <summary>이 세션에서 실제로 쓰는 격리 수준(1 RU, 2 RC, 3 RR, 4 Serializable, 5 Snapshot). 자기 세션은 권한 없이 보인다.</summary>
    public const string SessionIsolation = "SELECT transaction_isolation_level FROM sys.dm_exec_sessions WHERE session_id=@@SPID";

    /// <summary>VIEW SERVER STATE 권한과 sysadmin 여부.</summary>
    public const string Permissions = "SELECT HAS_PERMS_BY_NAME(NULL,NULL,'VIEW SERVER STATE'),IS_SRVROLEMEMBER('sysadmin')";

    /// <summary>논리 CPU·스케줄러 수(VIEW SERVER STATE 필요).</summary>
    public const string Cpu = "SELECT cpu_count,scheduler_count FROM sys.dm_os_sys_info";

    /// <summary>메모리 KB(2012 이상의 칸 이름, VIEW SERVER STATE 필요). CPU와 나눠 옛 판에서도 CPU는 읽히게 한다.</summary>
    public const string Memory = "SELECT physical_memory_kb,committed_target_kb FROM sys.dm_os_sys_info";

    /// <summary>메모리 상한·병렬 설정.</summary>
    public const string Configurations = "SELECT name,CONVERT(bigint,value_in_use) FROM sys.configurations WHERE name IN ('max server memory (MB)','max degree of parallelism','cost threshold for parallelism')";

    /// <summary>표 여섯의 줄 수(표 정보에서 읽어 값싸다).</summary>
    public const string TableRows = "SELECT t.name,SUM(p.rows) FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN ('OcmInf','OdrInf','DepMst','SeeMst','OrpInf','OrcInf') GROUP BY t.name";

    /// <summary>칸 여섯의 형식: 표, 칸, 형식, 길이, NULL 허용, 정렬 규칙.</summary>
    public const string ColumnTypes = "SELECT t.name,c.name,ty.name,c.max_length,c.is_nullable,c.collation_name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE t.schema_id=SCHEMA_ID('dbo') AND ((t.name='OcmInf' AND c.name IN ('OcmChtNum','OcmAcpDtm','OcmNum','OcmDepCod')) OR (t.name='OdrInf' AND c.name='OdrOcmNum') OR (t.name='DepMst' AND c.name='DepCod'))";

    /// <summary>표 여섯의 색인: 표, 색인, 종류, 유일, 꺼짐, 포함 칸 여부, 칸. 색인·키 순서로 온다.</summary>
    public const string Indexes = "SELECT t.name,i.name,i.type_desc,i.is_unique,i.is_disabled,ic.is_included_column,c.name FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN ('OcmInf','OdrInf','DepMst','SeeMst','OrpInf','OrcInf') AND i.index_id>0 AND i.is_hypothetical=0 ORDER BY t.name,i.index_id,ic.is_included_column,ic.key_ordinal,ic.index_column_id";

    /// <summary>지금 다른 요청 수·막힌 요청 수·막힌 요청의 가장 긴 대기(ms). VIEW SERVER STATE가 없으면 자기 것만 보여 뜻이 없다: 권한을 먼저 본다.</summary>
    public const string Blocking = "SELECT COUNT_BIG(*),ISNULL(SUM(CASE WHEN blocking_session_id<>0 THEN 1 ELSE 0 END),0),ISNULL(MAX(CASE WHEN blocking_session_id<>0 THEN wait_time ELSE 0 END),0) FROM sys.dm_exec_requests WHERE session_id<>@@SPID";

    /// <summary>이 세션이 지금까지 쓴 CPU(ms)·물리 읽기·논리 읽기.</summary>
    public const string SessionCost = "SELECT cpu_time,reads,logical_reads FROM sys.dm_exec_sessions WHERE session_id=@@SPID";

    /// <summary>이 세션의 대기 상위 3개(이름·ms). 2016 이상에만 있다.</summary>
    public const string SessionWaits = "SELECT TOP 3 wait_type,wait_time_ms FROM sys.dm_exec_session_wait_stats WHERE session_id=@@SPID ORDER BY wait_time_ms DESC";

    private const string VisitsHead = @"WITH PeriodVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId,LEFT(c.OcmAcpDtm,8) VisitDay
 FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), Patients AS (
 SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL
), FirstVisits AS (
 SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON ";

    private const string VisitsTail = @"
 WHERE c.OcmAcpDtm<@to AND c.OcmRsuYon<>'O'
   AND ((c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN'))
     OR (c.OcmPatTyp='I' AND c.OcmComStt NOT IN ('VC','CN','CR')))
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 GROUP BY p.PatientId
)";

    /// <summary>StatsSql의 Visits 글 그대로(시험이 제품 상수와 비교한다).</summary>
    public const string Visits = VisitsHead + "NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId" + VisitsTail;

    /// <summary>StatsSql.VisitRowsSql의 Orders 글 그대로.</summary>
    public const string OrdersCte = @", Orders AS (
 SELECT DISTINCT v.PatientId,v.VisitDay,UPPER(RTRIM(o.OdrCod)) Code
 FROM PeriodVisits v JOIN dbo.OdrInf o ON o.OdrOcmNum=v.VisitId
 WHERE v.PatientId IS NOT NULL AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
)";

    /// <summary>PeriodVisits만. COUNT(칸)은 칸 계산이 빠지지 않게 한다.</summary>
    public const string PeriodVisitsCount = Visits + @"
SELECT COUNT_BIG(*),COUNT(PatientId),COUNT(VisitDay) FROM PeriodVisits";

    /// <summary>FirstVisits 글 그대로. COUNT(FirstDtm)은 MIN 계산이 빠지지 않게 한다.</summary>
    public const string FirstVisitsAsWritten = Visits + @"
SELECT COUNT_BIG(*),COUNT(FirstDtm) FROM FirstVisits";

    /// <summary>FirstVisits의 조인만 c.OcmChtNum=p.PatientId로 바꾼 것(SQL Server의 =는 끝 공백을 무시하므로 답이 같아야 한다).</summary>
    public const string FirstVisitsPlainJoin = VisitsHead + "c.OcmChtNum=p.PatientId" + VisitsTail + @"
SELECT COUNT_BIG(*),COUNT(FirstDtm) FROM FirstVisits";

    /// <summary>Orders만(정렬·FirstVisits 없음).</summary>
    public const string OrdersCount = Visits + OrdersCte + @"
SELECT COUNT_BIG(*),COUNT(Code) FROM Orders";

    // StatsSql.VisitParams와 같다
    private static readonly SqlParam[] VisitParams =
    {
        new SqlParam("@from", SqlParamKind.Char, 12),
        new SqlParam("@to", SqlParamKind.Char, 12),
        new SqlParam("@hospital", SqlParamKind.VarChar, 32),
    };

    private static readonly string[] EnvironmentList =
    {
        ServerInfo, DatabaseInfo, SessionIsolation, Permissions, Cpu, Memory, Configurations,
        TableRows, ColumnTypes, Indexes, Blocking, SessionCost, SessionWaits,
    };

    private static readonly string[] PieceList = { PeriodVisitsCount, FirstVisitsAsWritten, FirstVisitsPlainJoin, OrdersCount };

    private static readonly Dictionary<string, SqlParam[]> Allowed = Build();

    /// <summary>줄 수·색인을 적는 표(이 순서로 적는다).</summary>
    public static IReadOnlyList<string> ReportedTables { get; } = new[] { "OcmInf", "OdrInf", "DepMst", "SeeMst", "OrpInf", "OrcInf" };

    /// <summary>형식을 적는 칸(이 순서로 적는다).</summary>
    public static IReadOnlyList<(string Table, string Column)> ReportedColumns { get; } = new[]
    {
        ("OcmInf", "OcmChtNum"),
        ("OcmInf", "OcmAcpDtm"),
        ("OcmInf", "OcmNum"),
        ("OcmInf", "OcmDepCod"),
        ("OdrInf", "OdrOcmNum"),
        ("DepMst", "DepCod"),
    };

    /// <summary>환경 문장(sys.*·서버 속성만, 매개변수 없음).</summary>
    public static IReadOnlyCollection<string> Environment => EnvironmentList;

    /// <summary>조각 문장(건수만 돌려준다, @from·@to·@hospital).</summary>
    public static IReadOnlyCollection<string> Pieces => PieceList;

    /// <summary>측정 문장 전부.</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 측정 문장과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>측정 문장이면 매개변수 표를 준다.</summary>
    public static bool TryGetParameters(string sql, out IReadOnlyList<SqlParam> parameters)
    {
        if (sql != null && Allowed.TryGetValue(sql, out var found))
        {
            parameters = found;
            return true;
        }
        parameters = Array.Empty<SqlParam>();
        return false;
    }

    private static Dictionary<string, SqlParam[]> Build()
    {
        var table = EnvironmentList.ToDictionary(sql => sql, _ => new SqlParam[0], StringComparer.Ordinal);
        foreach (var sql in PieceList) table.Add(sql, VisitParams);
        return table;
    }
}
