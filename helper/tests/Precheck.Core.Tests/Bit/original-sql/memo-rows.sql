-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/ClaimMemoHistory.cs RowsSql (비트에 이미 있는 청구메모, claim.memos는 TASK-16)
-- 이 파일과 Precheck.Core/Bit/Sql.cs MemoRowsSql은 공백만 다를 수 있다(시험이 확인)
SELECT c.OcmNum VisitId,RTRIM(c.OcmChtNum) PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,c.OcmBilCmt Memo
FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmBilCmt IS NOT NULL AND c.OcmBilCmt<>''
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
