-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxHistory.cs VisitSql (12개월 이력: 내원·차트번호·날짜·청구메모)
-- 이 파일과 Precheck.Core/Bit/Sql.cs HistoryVisitSql은 공백만 다를 수 있다(시험이 확인)
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
) SELECT V.OcmNum VisitId,RTRIM(V.OcmChtNum) PatientId,LEFT(V.OcmAcpDtm,8) VisitDay,V.OcmBilCmt Memo FROM V
