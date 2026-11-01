-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxVisitSplit.cs Visits + RowsSql (처방별 신환·재진의 진료 줄)
-- VisitRowsSql은 이 글에서 처방 코드 거르기 한 덩어리(AND (UPPER(RTRIM(o.OdrCod)) IN (@c0, …, @c99) OR (@eswt=1 AND …)))만 뺀 것이다(공백만 다를 수 있음, 시험이 확인)
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
), Orders AS (
 SELECT DISTINCT v.PatientId,v.VisitDay,UPPER(RTRIM(o.OdrCod)) Code
 FROM PeriodVisits v JOIN dbo.OdrInf o ON o.OdrOcmNum=v.VisitId
 WHERE v.PatientId IS NOT NULL AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
   AND (UPPER(RTRIM(o.OdrCod)) IN (@c0,@c1,@c2,@c3,@c4,@c5,@c6,@c7,@c8,@c9,@c10,@c11,@c12,@c13,@c14,@c15,@c16,@c17,@c18,@c19,
                                   @c20,@c21,@c22,@c23,@c24,@c25,@c26,@c27,@c28,@c29,@c30,@c31,@c32,@c33,@c34,@c35,@c36,@c37,@c38,@c39,
                                   @c40,@c41,@c42,@c43,@c44,@c45,@c46,@c47,@c48,@c49,@c50,@c51,@c52,@c53,@c54,@c55,@c56,@c57,@c58,@c59,
                                   @c60,@c61,@c62,@c63,@c64,@c65,@c66,@c67,@c68,@c69,@c70,@c71,@c72,@c73,@c74,@c75,@c76,@c77,@c78,@c79,
                                   @c80,@c81,@c82,@c83,@c84,@c85,@c86,@c87,@c88,@c89,@c90,@c91,@c92,@c93,@c94,@c95,@c96,@c97,@c98,@c99)
        OR (@eswt=1 AND CHARINDEX('ESWT',UPPER(RTRIM(o.OdrCod)))>0))
)
SELECT o.PatientId,o.VisitDay,o.Code,LEFT(f.FirstDtm,8) FirstDay
FROM Orders o LEFT JOIN FirstVisits f ON f.PatientId=o.PatientId
ORDER BY o.PatientId,o.VisitDay,o.Code
