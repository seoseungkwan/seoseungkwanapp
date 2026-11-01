-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs Treatments (치료 다섯)
-- Precheck.Core/Stats/StatsSql.cs TreatmentsSql과 공백만 다를 수 있다(시험이 확인)
WITH CandidateOrders AS (
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
FROM CandidateOrders o JOIN VisitLinks v ON v.VisitId=o.VisitId GROUP BY o.Treatment
