-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs LaCodes (LA 코드 건수)
-- Precheck.Core/Stats/StatsSql.cs LaCodesSql과 공백만 다를 수 있다(시험이 확인)
SELECT UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(*) PrescriptionCount
FROM dbo.OdrInf o
WHERE o.OdrDtm>=@from AND o.OdrDtm<@to AND UPPER(RTRIM(o.OdrCod)) LIKE 'LA%'
  AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOspTyp='I' AND o.OdrOutCod<>'99'
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=o.OdrDepCod AND d.DepHspNum=@hospital
              AND LEFT(o.OdrDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
  AND EXISTS(SELECT 1 FROM dbo.OcmInf c WHERE c.OcmNum=o.OdrOcmNum AND c.OcmPatTyp='O'
              AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') AND c.OcmRsuYon<>'O' AND c.OcmAcpDtm<@to
              AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
                           AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))
GROUP BY UPPER(RTRIM(o.OdrCod)) ORDER BY Code
