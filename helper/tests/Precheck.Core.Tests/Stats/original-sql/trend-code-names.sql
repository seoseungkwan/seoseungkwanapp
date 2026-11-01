-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/TrendDataSource.cs LoadCodes의 처방 목록 SQL (선택 코드 없음: codeFilter = "")
-- Precheck.Core/Stats/StatsSql.cs CodeNamesSql과 공백만 다를 수 있다(시험이 확인)
SELECT RTRIM(SeeOdrCod) AS Code, SeeKorNam, SeeUntCod, SeeAdpDte, SeeExpDte, SeeMdcTyp, SeeElcCod,
       CASE WHEN SeeUidCod LIKE 'BIT%' OR SeeUidCod = 'Master' THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END AS IsSystem
FROM dbo.SeeMst
WHERE SeeOdrCod <> ''
  AND ((SeeAdpDte <= @to AND SeeExpDte >= @from)
    OR (SeeAdpDte <= @priorTo AND SeeExpDte >= @priorFrom))
ORDER BY SeeOdrCod,
  CASE WHEN @to BETWEEN SeeAdpDte AND SeeExpDte THEN 0
       WHEN SeeAdpDte <= @to AND SeeExpDte >= @from THEN 1 ELSE 2 END,
  SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam, SeeMdcTyp, SeeElcCod
