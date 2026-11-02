-- 출처: seoseungkwan/shared@c66488e YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs Patients (글자 그대로. RevenueSql.cs Patients과 공백·끝 ;·-- 줄만 다를 수 있다, 시험이 확인)
WITH PeriodVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId
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
SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from),
       (SELECT COUNT_BIG(*) FROM PeriodVisits WHERE PatientId IS NULL),
       (SELECT COUNT_BIG(*)-COUNT(DISTINCT VisitId) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients p LEFT JOIN FirstVisits f ON f.PatientId=p.PatientId WHERE f.PatientId IS NULL)
