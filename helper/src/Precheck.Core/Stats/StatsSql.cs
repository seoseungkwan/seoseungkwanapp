using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.Stats;

/// <summary>
/// 통계 탭이 비트 DB에 돌리는 SQL 전부(REQ-503, design.md 'TASK-3·4'). 문장은 원본 양지바른
/// (seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/)에서 그대로 옮겼다. 공백만 다를 수 있고
/// 사본은 helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql, 시험이 비교한다(AC-503.2·AC-504.4).
/// 예외 하나: 첫 내원 연결 조건만 색인을 쓸 수 있는 c.OcmChtNum=p.PatientId로 바꿨다(spec bit-read-speed, AC-1001.3).
/// 예외 둘: 접수 줄·기간 합계·날짜별 세 문장은 첫 내원 잇기만 LEFT HASH JOIN이다. 힌트 없이는 긴 기간에서 FirstVisits를
/// 접수 줄마다 다시 계산해 시간 제한을 넘었다(spec helper-stats-speed, AC-3401.3). 결과의 뜻은 같고 차례만 정한다.
/// 예외 셋: 보고 PatientsSql 둘째 칸(신환)만 '기간 안 센 접수에 신환 표시(OcmDgsNfs='1')가 하나라도 있는 서로 다른 환자 수'다(spec new-mark AC-6203.1).
/// 매출 RevenueSql.Patients와 글자가 같다. 시험은 사본에 이 한 칸 바꿈(NewMarkPatients)을 더해 견준다.
/// PatientDaysSql만 원본에 없는 새 문장이다(Visits 글은 위 예외 말고 원본 그대로, 뒤의 SELECT만 새로 씀, AC-503.5).
/// 모두 매개변수를 받는 SELECT 하나다. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록도 보므로 ReadOnlyGuard를 지난다.
/// 청구 목록 Sql.All에는 넣지 않는다. 비트 전용 세 칸(stats-bit-sections) 새 문장 다섯은 All이 아니라 Sections 목록에 있다.
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
 SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON c.OcmChtNum=p.PatientId
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

    /// <summary>
    /// 접수 줄 [차트번호, 진료일, 접수 건수, 첫 내원일, 90일초진 접수 수, 신환 표시 접수 수], 환자·날마다 한 줄(AC-503.5). 원본에 없는 새 문장이다: 원본 Visits 글 뒤에 이 SELECT를 이었다.
    /// 처방 표를 잇지 않아 처방 없는 접수도 나오고, Visits 조건을 지나지 못한 접수(취소 등)와 차트번호 없는 접수는 나오지 않는다.
    /// 다섯째 칸(spec first90 AC-4401.1·AC-4401.2): 이 SELECT에서만 OcmInf를 접수 번호로 이어(기본 키 잇기라 힌트 없음) 그 환자·날 접수 가운데
    /// 내원 구분 OcmDgsNfs = '3'(90일초진)인 수를 센다. 공유 Visits 글과 HASH 힌트(첫 내원 잇기 한 번)는 그대로다. 첫 내원일인 날도 그대로 센다(AC-4401.3, 신환 우선은 웹).
    /// 여섯째 칸(spec new-mark AC-6201.1): 같은 잇기로 그 환자·날 접수 가운데 내원 구분 '1'(신환 표시)인 수. 첫 내원일과 상관없이 그대로 센다.
    /// </summary>
    public const string PatientDaysSql = Visits + @"
SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay,
 SUM(CASE WHEN o.OcmDgsNfs='3' THEN 1 ELSE 0 END) First90,SUM(CASE WHEN o.OcmDgsNfs='1' THEN 1 ELSE 0 END) NewMark
FROM PeriodVisits v LEFT HASH JOIN FirstVisits f ON f.PatientId=v.PatientId
JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId
WHERE v.PatientId IS NOT NULL
GROUP BY v.PatientId,v.VisitDay,f.FirstDtm
ORDER BY v.PatientId,v.VisitDay";

    /// <summary>원본 RxVisitSplit SummarySql: 총내원, 실환자, 신환, 차트번호 없는 내원, 중복 내원, 첫 내원을 찾지 못한 환자.</summary>
    public const string VisitSummarySql = Visits + @"
SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients),
       (SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from),
       (SELECT COUNT_BIG(*) FROM PeriodVisits WHERE PatientId IS NULL),
       (SELECT COUNT_BIG(*)-COUNT(DISTINCT VisitId) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients p LEFT HASH JOIN FirstVisits f ON f.PatientId=p.PatientId WHERE f.PatientId IS NULL)";

    /// <summary>원본 RxVisitSplit DaysSql: 날짜별 내원, 실환자, 그날 첫 내원한 환자.</summary>
    public const string VisitDaysSql = Visits + @"
SELECT v.VisitDay,COUNT_BIG(*) Visits,COUNT(DISTINCT v.PatientId) Patients,
       COUNT(DISTINCT CASE WHEN LEFT(f.FirstDtm,8)=v.VisitDay THEN v.PatientId END) NewPatients
FROM PeriodVisits v LEFT HASH JOIN FirstVisits f ON f.PatientId=v.PatientId
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

    /// <summary>원본 UnsupportedFinance: 그 기간에 환불·변경수납·예치금 자료가 몇 건인가(0이 아니면 금액 확인 필요).</summary>
    public const string UnsupportedFinanceSql = @"SELECT SUM(q.n) FROM (
 SELECT COUNT_BIG(*) n FROM dbo.OrcInf r
 WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
   AND (r.OrcPatTyp='R' OR r.OrcCod IN ('TFC','TPR'))
   AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod
               WHERE c.OcmNum=r.OrcOcmNum AND d.DepHspNum=@hospital
                 AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 UNION ALL SELECT COUNT_BIG(*) FROM dbo.OrpInf p JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
 WHERE p.OrpRcpStt<>'C' AND p.OrpAccDte>=@day AND p.OrpAccDte<@nextDay
   AND c.OcmPatTyp='O' AND c.OcmRsuYon='Y' AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=p.OrpDepCod AND d.DepHspNum=@hospital
               AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 UNION ALL SELECT COUNT_BIG(*) FROM dbo.IrcInf
 WHERE (IrcAccDte>=@day AND IrcAccDte<@nextDay)
    OR (IrcRcpDtm>=@from AND IrcRcpDtm<@to)
    OR (IrcRetDtm>=@from AND IrcRetDtm<@to)
) q";

    /// <summary>
    /// 원본 Patients: 총환, 신환, 차트번호 없는 내원, 중복 내원, 첫 내원을 찾지 못한 환자.
    /// 신환(둘째 칸)만 기간 안 센 접수에 신환 표시('1')가 하나라도 있는 서로 다른 환자 수다(spec new-mark AC-6203.1). 매출 RevenueSql.Patients와 글자가 같다.
    /// </summary>
    public const string PatientsSql = @"WITH PeriodVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId
 FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), Patients AS (
 SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL
), FirstVisits AS (
 SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON c.OcmChtNum=p.PatientId
 WHERE c.OcmAcpDtm<@to AND c.OcmRsuYon<>'O'
   AND ((c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN'))
     OR (c.OcmPatTyp='I' AND c.OcmComStt NOT IN ('VC','CN','CR')))
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 GROUP BY p.PatientId
)
SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits),
       (SELECT COUNT_BIG(DISTINCT v.PatientId) FROM PeriodVisits v JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId WHERE v.PatientId IS NOT NULL AND o.OcmDgsNfs='1'),
       (SELECT COUNT_BIG(*) FROM PeriodVisits WHERE PatientId IS NULL),
       (SELECT COUNT_BIG(*)-COUNT(DISTINCT VisitId) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients p LEFT JOIN FirstVisits f ON f.PatientId=p.PatientId WHERE f.PatientId IS NULL)";

    /// <summary>원본 Treatments: 치료 이름(manual·eswt·carm·sono·cryo), 건수(일일은 환자 수, 월말은 처방행), 환자에 연결하지 못한 줄.</summary>
    public const string TreatmentsSql = @"WITH CandidateOrders AS (
 SELECT o.OdrOcmNum VisitId,
 CASE WHEN RTRIM(o.OdrCod)=N'도수' THEN 'manual'
      WHEN UPPER(RTRIM(o.OdrCod))='CARM1' THEN 'carm'
      WHEN UPPER(RTRIM(o.OdrCod))='SONO1' THEN 'sono'
      WHEN UPPER(RTRIM(o.OdrCod))='CRYO' THEN 'cryo'
      WHEN CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0 THEN 'eswt' END Treatment
 FROM dbo.OdrInf o
 WHERE o.OdrDtm>=@from AND o.OdrDtm<@to AND o.OdrDelFlg='N' AND o.OdrCanYon='N'
   AND o.OdrOspTyp='I' AND o.OdrOutCod<>'99'
   AND (RTRIM(o.OdrCod)=N'도수' OR UPPER(RTRIM(o.OdrCod)) IN ('CARM1','SONO1','CRYO') OR CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0)
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=o.OdrDepCod AND d.DepHspNum=@hospital
               AND LEFT(o.OdrDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), VisitLinks AS (
 SELECT c.OcmNum VisitId,COUNT_BIG(*) LinkRows,MIN(NULLIF(RTRIM(c.OcmChtNum),'')) PatientId
 FROM dbo.OcmInf c
 WHERE c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmAcpDtm<@to
   AND ((@daily=1 AND c.OcmComStt IN ('WN','HN','TN','PN'))
      OR (@daily=0 AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')))
   AND EXISTS(SELECT 1 FROM CandidateOrders o WHERE o.VisitId=c.OcmNum)
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 GROUP BY c.OcmNum
)
SELECT o.Treatment,CASE WHEN @daily=1 THEN CONVERT(bigint,COUNT(DISTINCT v.PatientId)) ELSE COUNT_BIG(*) END TreatmentCount,
       SUM(CASE WHEN v.LinkRows<>1 OR v.PatientId IS NULL THEN CONVERT(bigint,1) ELSE 0 END) InvalidLinks
FROM CandidateOrders o JOIN VisitLinks v ON v.VisitId=o.VisitId GROUP BY o.Treatment";

    /// <summary>원본 LaCodes: LA로 시작하는 처방코드, 유효 처방행 수.</summary>
    public const string LaCodesSql = @"SELECT UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(*) PrescriptionCount
FROM dbo.OdrInf o
WHERE o.OdrDtm>=@from AND o.OdrDtm<@to AND UPPER(RTRIM(o.OdrCod)) LIKE 'LA%'
  AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOspTyp='I' AND o.OdrOutCod<>'99'
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=o.OdrDepCod AND d.DepHspNum=@hospital
              AND LEFT(o.OdrDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
  AND EXISTS(SELECT 1 FROM dbo.OcmInf c WHERE c.OcmNum=o.OdrOcmNum AND c.OcmPatTyp='O'
              AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') AND c.OcmRsuYon<>'O' AND c.OcmAcpDtm<@to
              AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
                           AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))
GROUP BY UPPER(RTRIM(o.OdrCod)) ORDER BY Code";

    /// <summary>원본 FinanceNormal(정상수납): 총진료비, 조합청구액, 비급여, 현금, 카드, 계좌이체. 끝의 ;까지 원본 그대로.</summary>
    public const string FinanceNormalSql = @"WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt<>'C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.*
    FROM dbo.OrpInf p JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
    WHERE NOT EXISTS(SELECT 1 FROM dbo.IrcInf i WHERE i.IrcOcmNum=p.OrpOcmNum AND i.IrcRcpTyp<>'T')
), OrcMid AS (
    SELECT o2.OrcChtNum,o2.OrcOcmNum,
        (SELECT MAX(o1.OrcAccDte) FROM dbo.OrcInf o1
         WHERE o1.OrcRcpNum=o2.OrcRcpNum AND o1.OrcCod=o2.OrcCod) AS ReceiptDay,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcNewAmt) ELSE 0 END AS CashRcv,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcCrdAmt) ELSE 0 END AS CardRcv,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcChkAmt) ELSE 0 END AS CheckRcv,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcNewAmt) ELSE 0 END AS CashTfc,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcCrdAmt) ELSE 0 END AS CardTfc,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcChkAmt) ELSE 0 END AS CheckTfc
    FROM dbo.OrcInf o2
    WHERE o2.OrcAccDte>=@day AND o2.OrcAccDte<@nextDay
      AND NOT(o2.OrcCod='COR' OR o2.OrcCod='COD') AND o2.OrcPatTyp<>'R'
    GROUP BY o2.OrcRcpNum,o2.OrcCod,o2.OrcChtNum,o2.OrcOcmNum,o2.OrcSeq,
             o2.OrcAccDte,o2.OrcUidCod,o2.OrcPubYon,o2.OrcPatTyp
), Orc AS (
    SELECT OrcChtNum,OrcOcmNum,ReceiptDay,
        SUM(CashRcv+CardRcv+CheckRcv) AS RcvAmt,
        SUM(CashRcv-CashTfc) AS CashAmt,
        SUM(CardRcv-CardTfc) AS CardAmt,
        SUM(CheckRcv-CheckTfc) AS CheckAmt
    FROM OrcMid GROUP BY OrcChtNum,OrcOcmNum,ReceiptDay
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           p.OrpInsAmt,p.OrpInsOwn,p.OrpTotOwn,
           r.RcvAmt,r.CashAmt,r.CardAmt,r.CheckAmt,ft.DtlCodNam AS DgsNfsNam
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    JOIN dbo.DtlMst ft ON ft.DtlCod=c.OcmDgsNfs AND ft.DtlTblCod='FTDNFS'
    JOIN dbo.UidMst u ON u.UidCod=p.OrpDtrCod
    WHERE d.DepHspNum=@hospital
      AND c.OcmPatTyp='O' AND c.OcmRsuYon IN ('','N','O')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN ins.InsAdpDte AND ins.InsExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN u.UidAdpDte AND u.UidExpDte
      AND c.OcmAcpDtm>=@day AND c.OcmAcpDtm<@nextDay
)
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows;";

    /// <summary>원본 FinanceReceivable(미수입금): FinanceNormal과 같은 여섯 칸. 끝의 ;까지 원본 그대로.</summary>
    public const string FinanceReceivableSql = @"WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt='C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.* FROM dbo.OrpInf p
    JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
), Orc AS (
    SELECT r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte,
           SUM(CASE WHEN r.OrcCod='COR'
                    THEN r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt ELSE 0 END) AS AllCorAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcNewAmt ELSE 0 END) AS CorAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcCrdAmt ELSE 0 END) AS CorCrdAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcChkAmt ELSE 0 END) AS CorChkAmt
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND r.OrcCod IN ('COR','COD') AND r.OrcPatTyp<>'R'
    GROUP BY r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           r.AllCorAmt,r.CorAmt,r.CorCrdAmt,r.CorChkAmt,c.OcmAcpDtm
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod
                      AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    WHERE d.DepHspNum=@hospital AND c.OcmPatTyp='O'
      AND c.OcmRsuYon IN ('','Y','N')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND c.OcmAcpDtm BETWEEN d.DepAdpDte+'0000' AND d.DepExpDte+'2359'
      AND c.OcmAcpDtm BETWEEN ins.InsAdpDte+'0000' AND ins.InsExpDte+'2359'
)
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows;";

    /// <summary>원본 FinanceMultiplicity: 정상수납 연결 중복 건수. 안의 주석 두 줄도 원본 그대로(줄바꿈이 있어야 뒤 글을 먹지 않는다).</summary>
    public const string FinanceMultiplicitySql = @"WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt<>'C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.* FROM dbo.OrpInf p
    JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
    WHERE NOT EXISTS(SELECT 1 FROM dbo.IrcInf i
                     WHERE i.IrcOcmNum=p.OrpOcmNum AND i.IrcRcpTyp<>'T')
), Orc AS (
    -- Equivalent to the original inner/outer grouped financial projection's
    -- keys. Original MAX date deliberately ranges beyond the selected period.
    SELECT DISTINCT r.OrcChtNum,r.OrcOcmNum,
        (SELECT MAX(r1.OrcAccDte) FROM dbo.OrcInf r1
         WHERE r1.OrcRcpNum=r.OrcRcpNum AND r1.OrcCod=r.OrcCod) AS ReceiptDay
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND NOT(r.OrcCod='COR' OR r.OrcCod='COD') AND r.OrcPatTyp<>'R'
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpRcpNum,p.OrpRcpSeq,p.OrpAccDte,
           p.OrpInsCod,p.OrpInsSeq,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           c.OcmAcpDtm,r.ReceiptDay,ft.DtlCodNam AS DgsNfsNam
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod
                      AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    JOIN dbo.DtlMst ft ON ft.DtlCod=c.OcmDgsNfs AND ft.DtlTblCod='FTDNFS'
    JOIN dbo.UidMst u ON u.UidCod=p.OrpDtrCod
    WHERE d.DepHspNum=@hospital
      AND c.OcmPatTyp='O' AND c.OcmRsuYon IN ('','N','O')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN ins.InsAdpDte AND ins.InsExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN u.UidAdpDte AND u.UidExpDte
      AND c.OcmAcpDtm>=@day AND c.OcmAcpDtm<@nextDay
)
SELECT (SELECT COUNT_BIG(*)-COUNT(DISTINCT OrpOcmNum) FROM NativeRows)
 +(SELECT COUNT_BIG(*) FROM NativeRows n WHERE
    (SELECT COUNT_BIG(*) FROM (SELECT o.OdlRcpNum FROM dbo.OdlInf o WHERE o.OdlOcmNum=n.OrpOcmNum GROUP BY o.OdlRcpNum) q)>1
    OR (SELECT COUNT_BIG(*) FROM dbo.PmdInf p WHERE p.PmdChtNum=n.OrpChtNum AND p.PmdInsCod=n.OrpInsCod AND p.PmdInsSeq=n.OrpInsSeq)>1)";

    /// <summary>원본 ReceivableMultiplicity: 미수입금 연결 중복 건수. 끝의 ;까지 원본 그대로.</summary>
    public const string ReceivableMultiplicitySql = @"WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt='C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.* FROM dbo.OrpInf p
    JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
), Orc AS (
    SELECT r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte,
           SUM(CASE WHEN r.OrcCod='COR'
                    THEN r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt ELSE 0 END) AS AllCorAmt
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND r.OrcCod IN ('COR','COD') AND r.OrcPatTyp<>'R'
    GROUP BY r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           r.AllCorAmt,c.OcmAcpDtm
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod
                      AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    WHERE d.DepHspNum=@hospital AND c.OcmPatTyp='O'
      AND c.OcmRsuYon IN ('','Y','N')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND c.OcmAcpDtm BETWEEN d.DepAdpDte+'0000' AND d.DepExpDte+'2359'
      AND c.OcmAcpDtm BETWEEN ins.InsAdpDte+'0000' AND ins.InsExpDte+'2359'
)
SELECT COUNT_BIG(*)-COUNT(DISTINCT OrpOcmNum) FROM NativeRows;";

    // ---- 비트 전용 세 칸(stats-bit-sections, REQ-2701): 원본에 없는 새 문장 다섯. 목록은 Sections(All은 지금 그대로) ----

    /// <summary>
    /// 접수 줄 [차트번호, 진료일, 접수 시각 HHmm, 보험 이름, 진료의 코드], 접수마다 한 줄(AC-2701.1). Visits 글 뒤에 이 SELECT를 이었다.
    /// 접수 시각은 원래 도구 VisitHours처럼 OcmAcpDtm 9~12번째 글자, 진료의는 DoctorStats처럼 OcmDtrCod.
    /// 보험 이름은 reception-paper PaperVisit과 같은 조건: 그 코드의 InsMst 줄 중 InsAdpDte가 접수 날 이하인 가장 늦은 줄(같으면 이름 차례 첫 줄, AC-2701.2).
    /// </summary>
    public const string VisitLinesSql = Visits + @"
SELECT v.PatientId,v.VisitDay,SUBSTRING(c.OcmAcpDtm,9,4) VisitTime,RTRIM(i.InsCodNam) Insurance,NULLIF(RTRIM(c.OcmDtrCod),'') DoctorId
FROM PeriodVisits v JOIN dbo.OcmInf c ON c.OcmNum=v.VisitId
OUTER APPLY (SELECT TOP 1 m.InsCodNam FROM dbo.InsMst m WHERE m.InsCod=c.OcmInsCod AND m.InsAdpDte<=v.VisitDay ORDER BY m.InsAdpDte DESC,m.InsCodNam) i
ORDER BY v.PatientId,v.VisitDay,VisitTime";

    /// <summary>
    /// 사람 줄 [차트번호, 생년월일, 주소], 기간 환자마다(AC-2701.3). 원래 도구 PatientMix의 연결 그대로이고 성별 칸만 뺐다.
    /// 환자 표에서 읽는 칸은 이 셋뿐이다(이름·전화·주민번호·상세주소 PbsAdrSta·성별 없음). 주소는 StatsExtra.AddressHead가 앞부분만 남긴다.
    /// </summary>
    public const string PeopleSql = Visits + @"
SELECT p.PatientId,b.PbsBirDte,b.PbsDtlAdr
FROM Patients p LEFT JOIN dbo.PbsInf b ON NULLIF(RTRIM(b.PbsChtNum),'')=p.PatientId
ORDER BY p.PatientId";

    /// <summary>원장님 이름 SQL의 코드 자리 수(@d0~@d49). 코드가 더 많으면 나눠 부른다.</summary>
    public const int DoctorCodeSlots = 50;

    /// <summary>
    /// 원장님 이름 [코드, 이름, 적용 끝 날짜](AC-2701.4). 원래 도구 DoctorStats.NamesSql처럼 코드·UidExpDte 차례라 코드마다 마지막 줄이 가장 늦은 줄이다.
    /// 코드는 매개변수 50자리로만 받는다(관문은 NULL 값을 받지 않아 빈 자리는 그 묶음의 첫 코드로 채운다).
    /// </summary>
    public const string DoctorNamesSql = @"SELECT RTRIM(u.UidCod) Code,RTRIM(u.UidNam) Name,u.UidExpDte
FROM dbo.UidMst u
WHERE RTRIM(u.UidCod) IN (@d0,@d1,@d2,@d3,@d4,@d5,@d6,@d7,@d8,@d9,
                          @d10,@d11,@d12,@d13,@d14,@d15,@d16,@d17,@d18,@d19,
                          @d20,@d21,@d22,@d23,@d24,@d25,@d26,@d27,@d28,@d29,
                          @d30,@d31,@d32,@d33,@d34,@d35,@d36,@d37,@d38,@d39,
                          @d40,@d41,@d42,@d43,@d44,@d45,@d46,@d47,@d48,@d49)
ORDER BY Code,u.UidExpDte";

    // 원래 도구 BusinessStats.ByDoctor가 바꾸는 NativeRows 줄 머리와 끝 SELECT
    private const string FinanceRowStart = "SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt";
    private const string FinanceRowStartByDoctorDay = "SELECT p.OrpOcmNum,p.OrpChtNum,RTRIM(p.OrpDtrCod) DoctorId,LEFT(p.OrpAccDte,8) PaidDay,p.OrpTotAmt";
    private const string FinanceTotal = "SELECT SUM(";
    private const string FinanceTotalEnd = "FROM NativeRows;";
    private const string FinanceByDoctorDay = "SELECT PaidDay,DoctorId,SUM(OrpTotAmt) FROM NativeRows GROUP BY PaidDay,DoctorId";

    // 환자·날 금액(spec stats-insights AC-6106.1): 같은 두 자리를 차트번호·수납일 묶음으로. 차트번호 칸(OrpChtNum)은 줄에 이미 있어 수납일 칸만 더한다
    private const string FinanceRowStartByPatientDay = "SELECT p.OrpOcmNum,p.OrpChtNum,LEFT(p.OrpAccDte,8) PaidDay,p.OrpTotAmt";
    private const string FinanceByPatientDay = "SELECT OrpChtNum,PaidDay,SUM(OrpTotAmt) FROM NativeRows GROUP BY OrpChtNum,PaidDay";

    /// <summary>
    /// 정상수납 날·원장님 금액 [수납일, 진료의 코드, 총진료비](AC-2701.5). FinanceNormalSql 글에서 원래 도구 BusinessStats.ByDoctor와 같은 두 곳만 바꿨다:
    /// NativeRows 줄에 진료의(OrpDtrCod)·수납일(OrpAccDte 앞 8자) 칸을 더하고, 끝 SELECT를 수납일·진료의로 묶은 OrpTotAmt 합으로.
    /// </summary>
    public static readonly string DoctorMoneyNormalSql = Regroup(FinanceNormalSql, FinanceRowStartByDoctorDay, FinanceByDoctorDay);

    /// <summary>미수입금 날·원장님 금액: FinanceReceivableSql 글에서 DoctorMoneyNormalSql과 같은 두 곳만 바꿨다.</summary>
    public static readonly string DoctorMoneyReceivableSql = Regroup(FinanceReceivableSql, FinanceRowStartByDoctorDay, FinanceByDoctorDay);

    /// <summary>
    /// 정상수납 환자·날 금액 [차트번호, 수납일, 총진료비](spec stats-insights AC-6106.1). 원장님별 금액과 같은 기준 줄(NativeRows)에서 같은 두 곳만 바꿨다:
    /// NativeRows 줄에 수납일(OrpAccDte 앞 8자) 칸을 더하고, 끝 SELECT를 차트번호·수납일로 묶은 OrpTotAmt 합으로. 글자 처리 없는 SUM/GROUP BY다.
    /// </summary>
    public static readonly string PatientPayNormalSql = Regroup(FinanceNormalSql, FinanceRowStartByPatientDay, FinanceByPatientDay);

    /// <summary>미수입금 환자·날 금액: FinanceReceivableSql 글에서 PatientPayNormalSql과 같은 두 곳만 바꿨다.</summary>
    public static readonly string PatientPayReceivableSql = Regroup(FinanceReceivableSql, FinanceRowStartByPatientDay, FinanceByPatientDay);

    /// <summary>보고 금액 SQL 글의 NativeRows 줄 머리와 끝 SELECT를 바꿔 묶음 합으로 만든다. 바꿀 자리가 정확히 한 군데씩이 아니면(원본 글이 바뀜) 멈춘다.</summary>
    private static string Regroup(string sql, string rowStart, string grouped)
    {
        var row = sql.IndexOf(FinanceRowStart, StringComparison.Ordinal);
        if (row < 0 || sql.IndexOf(FinanceRowStart, row + 1, StringComparison.Ordinal) >= 0) throw new InvalidOperationException("finance SQL row list changed");
        var text = sql.Replace(FinanceRowStart, rowStart);
        var total = text.LastIndexOf(FinanceTotal, StringComparison.Ordinal);
        if (total < 0 || !text.Substring(total).TrimEnd().EndsWith(FinanceTotalEnd, StringComparison.Ordinal)) throw new InvalidOperationException("finance SQL total changed");
        return text.Substring(0, total) + grouped;
    }

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

    // 원본 OperationalReportData.Command의 표. 원본은 문장마다 다 붙이지만 관문은 문장에 나오는 이름만 받아서 나눠 적는다.
    // @daily만 원본 Bit 대신 Char(1) '1'·'0'이다(관문·SqlBitDb를 고치지 않으려고, design.md '결정과 트레이드오프')
    private static readonly SqlParam ReportDay = new SqlParam("@day", SqlParamKind.Char, 8);
    private static readonly SqlParam ReportNextDay = new SqlParam("@nextDay", SqlParamKind.Char, 8);
    private static readonly SqlParam ReportFrom = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam ReportTo = new SqlParam("@to", SqlParamKind.Char, 12);
    private static readonly SqlParam ReportHospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);
    private static readonly SqlParam ReportDaily = new SqlParam("@daily", SqlParamKind.Char, 1);

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [VisitRowsSql] = VisitParams,
        [PatientDaysSql] = VisitParams,
        [VisitSummarySql] = VisitParams,
        [VisitDaysSql] = VisitParams,
        [CodeNamesSql] = CodeParams,
        [HistoryGuardSql] = new SqlParam[0],
        [UnsupportedFinanceSql] = new[] { ReportDay, ReportNextDay, ReportFrom, ReportTo, ReportHospital },
        [PatientsSql] = new[] { ReportFrom, ReportTo, ReportHospital },
        [TreatmentsSql] = new[] { ReportFrom, ReportTo, ReportHospital, ReportDaily },
        [LaCodesSql] = new[] { ReportFrom, ReportTo, ReportHospital },
        [FinanceNormalSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [FinanceReceivableSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [FinanceMultiplicitySql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [ReceivableMultiplicitySql] = new[] { ReportDay, ReportNextDay, ReportHospital },
    };

    // 원장님 이름 코드 자리: 진료의 코드는 Worker 처방코드와 같은 40자 한도(src/workers/stats/helperData.ts isCode)
    private static readonly SqlParam[] DoctorCodeParams =
        Enumerable.Range(0, DoctorCodeSlots).Select(i => new SqlParam("@d" + i.ToString(CultureInfo.InvariantCulture), SqlParamKind.VarChar, 40)).ToArray();

    private static readonly Dictionary<string, SqlParam[]> SectionsAllowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [VisitLinesSql] = VisitParams,
        [PeopleSql] = VisitParams,
        [DoctorNamesSql] = DoctorCodeParams,
        [DoctorMoneyNormalSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [DoctorMoneyReceivableSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [PatientPayNormalSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
        [PatientPayReceivableSql] = new[] { ReportDay, ReportNextDay, ReportHospital },
    };

    /// <summary>지금 통계 SQL 목록(stats.rows v2까지의 문장, 원본 사본과 견주는 것들). 비트 전용 세 칸 문장은 Sections.</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>비트 전용 세 칸 문장 목록(REQ-2701)과 환자·날 금액 둘(spec stats-insights AC-6106.1). All과 겹치지 않는다.</summary>
    public static IReadOnlyCollection<string> Sections => SectionsAllowed.Keys;

    /// <summary>글자가 통계 SQL(All 또는 Sections)과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && (Allowed.ContainsKey(sql) || SectionsAllowed.ContainsKey(sql));

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql != null && Allowed.TryGetValue(sql, out var parameters)) return parameters;
        if (sql != null && SectionsAllowed.TryGetValue(sql, out var sections)) return sections;
        throw new BitException(BitErrors.ReadFailed);
    }
}
