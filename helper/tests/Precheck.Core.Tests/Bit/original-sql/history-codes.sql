-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxHistory.cs CodeSql (12개월 이력: 내원별 처방코드)
-- 이 파일과 Precheck.Core/Bit/Sql.cs HistoryCodeSql은 공백만 다를 수 있다(시험이 확인)
WITH F AS (
 SELECT DISTINCT c.OcmChtNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@focus AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), V AS (
 SELECT c.OcmNum,c.OcmChtNum,c.OcmAcpDtm,c.OcmBilCmt FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND c.OcmChtNum IN (SELECT OcmChtNum FROM F)
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
) SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
