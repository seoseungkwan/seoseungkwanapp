using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Stats;

/// <summary>
/// 통계 탭이 비트 DB에 돌리는 SQL 전부(REQ-503, design.md 'TASK-3·4'). 문장은 원본 양지바른
/// (seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/)에서 그대로 옮겼다. 공백만 다를 수 있고
/// 사본은 helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql, 시험이 비교한다(AC-503.2·AC-504.4).
/// 예외 하나: 첫 내원 연결 조건만 색인을 쓸 수 있는 c.OcmChtNum=p.PatientId로 바꿨다(spec bit-read-speed, AC-1001.3).
/// PatientDaysSql만 원본에 없는 새 문장이다(Visits 글은 위 예외 말고 원본 그대로, 뒤의 SELECT만 새로 씀, AC-503.5).
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
    /// 접수 줄 [차트번호, 진료일, 접수 건수, 첫 내원일], 환자·날마다 한 줄(AC-503.5). 원본에 없는 새 문장이다: 원본 Visits 글 뒤에 이 SELECT를 이었다.
    /// 처방 표를 잇지 않아 처방 없는 접수도 나오고, Visits 조건을 지나지 못한 접수(취소 등)와 차트번호 없는 접수는 나오지 않는다.
    /// </summary>
    public const string PatientDaysSql = Visits + @"
SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay
FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId
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

    /// <summary>원본 Patients: 총환, 신환, 차트번호 없는 내원, 중복 내원, 첫 내원을 찾지 못한 환자.</summary>
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
       (SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from),
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
