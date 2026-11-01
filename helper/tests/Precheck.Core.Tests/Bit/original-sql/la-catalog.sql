-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/LaCatalog.cs QuerySql (비트 LA 신경차단술 코드 목록)
-- 이 파일과 Precheck.Core/Bit/Sql.cs LaCatalogSql은 공백만 다를 수 있다(시험이 확인)
SELECT RTRIM(SeeOdrCod), RTRIM(SeeKorNam),
       CASE WHEN @today BETWEEN SeeAdpDte AND SeeExpDte THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END
FROM dbo.SeeMst
WHERE UPPER(SeeOdrCod) LIKE @prefix
ORDER BY SeeOdrCod,
  CASE WHEN @today BETWEEN SeeAdpDte AND SeeExpDte THEN 0 ELSE 1 END,
  SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam
