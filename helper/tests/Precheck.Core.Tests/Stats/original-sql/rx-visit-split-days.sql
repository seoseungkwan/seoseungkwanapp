-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxVisitSplit.cs Visits + DaysSql (날짜별 합계)
-- Precheck.Core/Stats/StatsSql.cs VisitDaysSql과 공백만 다를 수 있다(시험이 확인)
WITH PeriodVisits AS (
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
)
SELECT v.VisitDay,COUNT_BIG(*) Visits,COUNT(DISTINCT v.PatientId) Patients,
       COUNT(DISTINCT CASE WHEN LEFT(f.FirstDtm,8)=v.VisitDay THEN v.PatientId END) NewPatients
FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId
GROUP BY v.VisitDay
ORDER BY v.VisitDay
