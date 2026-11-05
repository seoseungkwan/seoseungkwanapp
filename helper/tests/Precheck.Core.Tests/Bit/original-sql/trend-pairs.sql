-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxDiagnosisTrend.cs PairsSql (상병 추세: 처방-상병 짝)
-- 이 파일과 Precheck.Core/Bit/Sql.cs TrendPairsSql은 공백만 다를 수 있다(시험이 확인)
WITH V AS (
 SELECT c.OcmNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), R AS (
 SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
 WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
), D AS (
 SELECT i.OicOcmNum VisitId,UPPER(RTRIM(i.OicElcCod)) DxCode,
        MIN(CASE RTRIM(ISNULL(i.OicIcdPri,'')) WHEN '1' THEN 1 WHEN '3' THEN 3 ELSE 2 END) DxRole,MAX(RTRIM(ISNULL(i.OicIcdNam,''))) DxName
 FROM dbo.OicInf i JOIN V ON V.OcmNum=i.OicOcmNum
 WHERE RTRIM(ISNULL(i.OicElcCod,''))<>'' GROUP BY i.OicOcmNum,UPPER(RTRIM(i.OicElcCod))
) SELECT R.RxCode,D.DxCode,MAX(D.DxName),
 SUM(CASE WHEN D.DxRole=1 THEN 1 ELSE 0 END),SUM(CASE WHEN D.DxRole=2 THEN 1 ELSE 0 END),SUM(CASE WHEN D.DxRole=3 THEN 1 ELSE 0 END)
FROM R JOIN D ON D.VisitId=R.VisitId GROUP BY R.RxCode,D.DxCode HAVING COUNT_BIG(*)>=@minimum
