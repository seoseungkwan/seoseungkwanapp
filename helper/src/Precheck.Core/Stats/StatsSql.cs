using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Stats;

/// <summary>
/// 통계 탭이 비트 DB에 돌리는 SQL 전부(REQ-503, design.md 'TASK-3·4'). 문장은 원본 양지바른
/// (seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/)에서 그대로 옮겼다. 공백만 다를 수 있고
/// 사본은 helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql, 시험이 비교한다(AC-503.2).
/// 모두 매개변수를 받는 SELECT 하나다. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록도 보므로 ReadOnlyGuard를 지난다.
/// 청구 목록 Sql.All에는 넣지 않는다.
/// </summary>
public static class StatsSql
{
    /// <summary>자료 SQL 시간 제한(원본 통계 읽기 150초). 메타(HistoryGuard)는 Sql.MetaTimeout(15초).</summary>
    public static readonly TimeSpan DataTimeout = TimeSpan.FromSeconds(150);

    // 원본 RxVisitSplit.Visits: 일일보고 총환·신환과 같은 외래 내원·첫 유효 내원 조건(OperationalReportSql.Patients)
    private const string Visits = @"WITH PeriodVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId,LEFT(c.OcmAcpDtm,8) VisitDay
 FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), Patients AS (
 SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL
), FirstVisits AS (
 SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId
 WHERE c.OcmAcpDtm<@to AND c.OcmRsuYon<>'O'
   AND ((c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN'))
     OR (c.OcmPatTyp='I' AND c.OcmComStt NOT IN ('VC','CN','CR')))
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 GROUP BY p.PatientId
)";

    /// <summary>
    /// 진료 줄 [차트번호, 진료일, 처방코드, 첫 내원일]: 원본 Visits + RowsSql에서 처방 코드 거르기 한 덩어리
    /// (AND (UPPER(RTRIM(o.OdrCod)) IN (@c0, …, @c99) OR (@eswt=1 AND …)))만 뺐다. 그래서 @c0…@c99·@eswt가 없다.
    /// </summary>
    public const string VisitRowsSql = Visits + @", Orders AS (
 SELECT DISTINCT v.PatientId,v.VisitDay,UPPER(RTRIM(o.OdrCod)) Code
 FROM PeriodVisits v JOIN dbo.OdrInf o ON o.OdrOcmNum=v.VisitId
 WHERE v.PatientId IS NOT NULL AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
)
SELECT o.PatientId,o.VisitDay,o.Code,LEFT(f.FirstDtm,8) FirstDay
FROM Orders o LEFT JOIN FirstVisits f ON f.PatientId=o.PatientId
ORDER BY o.PatientId,o.VisitDay,o.Code";

    /// <summary>원본 RxVisitSplit SummarySql: 총내원, 실환자, 신환, 차트번호 없는 내원, 중복 내원, 첫 내원을 찾지 못한 환자.</summary>
    public const string VisitSummarySql = Visits + @"
SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients),
       (SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from),
       (SELECT COUNT_BIG(*) FROM PeriodVisits WHERE PatientId IS NULL),
       (SELECT COUNT_BIG(*)-COUNT(DISTINCT VisitId) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients p LEFT JOIN FirstVisits f ON f.PatientId=p.PatientId WHERE f.PatientId IS NULL)";

    /// <summary>원본 RxVisitSplit DaysSql: 날짜별 내원, 실환자, 그날 첫 내원한 환자.</summary>
    public const string VisitDaysSql = Visits + @"
SELECT v.VisitDay,COUNT_BIG(*) Visits,COUNT(DISTINCT v.PatientId) Patients,
       COUNT(DISTINCT CASE WHEN LEFT(f.FirstDtm,8)=v.VisitDay THEN v.PatientId END) NewPatients
FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId
GROUP BY v.VisitDay
ORDER BY v.VisitDay";

    /// <summary>원본 TrendDataSource.LoadCodes의 처방 목록 SQL(선택 코드 없음: codeFilter = ""). 코드마다 첫 줄이 쓸 이름이다.</summary>
    public const string CodeNamesSql = @"SELECT RTRIM(SeeOdrCod) AS Code, SeeKorNam, SeeUntCod, SeeAdpDte, SeeExpDte, SeeMdcTyp, SeeElcCod,
       CASE WHEN SeeUidCod LIKE 'BIT%' OR SeeUidCod = 'Master' THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END AS IsSystem
FROM dbo.SeeMst
WHERE SeeOdrCod <> ''
  AND ((SeeAdpDte <= @to AND SeeExpDte >= @from)
    OR (SeeAdpDte <= @priorTo AND SeeExpDte >= @priorFrom))
ORDER BY SeeOdrCod,
  CASE WHEN @to BETWEEN SeeAdpDte AND SeeExpDte THEN 0
       WHEN SeeAdpDte <= @to AND SeeExpDte >= @from THEN 1 ELSE 2 END,
  SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam, SeeMdcTyp, SeeElcCod";

    /// <summary>원본 OperationalReportSql.HistoryGuard: 과거 이관 자료(DRBITPACK_OLD·V_OcmInf·V_OdrInf)가 따로 있으면 1.</summary>
    public const string HistoryGuardSql = @"SELECT (CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE name='DRBITPACK_OLD') OR EXISTS(SELECT 1 FROM sys.objects WHERE name IN ('V_OcmInf','V_OdrInf')) THEN 1 ELSE 0 END)";

    // 원본 RxVisitSplit.Command: @from·@to Char(12) yyyyMMdd0000(끝은 다음 날 0시), @hospital VarChar(32)
    private static readonly SqlParam[] VisitParams =
    {
        new SqlParam("@from", SqlParamKind.Char, 12),
        new SqlParam("@to", SqlParamKind.Char, 12),
        new SqlParam("@hospital", SqlParamKind.VarChar, 32),
    };

    // 원본 TrendDataSource.AddDateRanges(halfOpenTime: false): 네 날짜 모두 Char(8) yyyyMMdd
    private static readonly SqlParam[] CodeParams =
    {
        new SqlParam("@from", SqlParamKind.Char, 8),
        new SqlParam("@to", SqlParamKind.Char, 8),
        new SqlParam("@priorFrom", SqlParamKind.Char, 8),
        new SqlParam("@priorTo", SqlParamKind.Char, 8),
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [VisitRowsSql] = VisitParams,
        [VisitSummarySql] = VisitParams,
        [VisitDaysSql] = VisitParams,
        [CodeNamesSql] = CodeParams,
        [HistoryGuardSql] = new SqlParam[0],
    };

    /// <summary>통계 SQL 목록(이 클래스의 SQL 상수 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 통계 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }
}
