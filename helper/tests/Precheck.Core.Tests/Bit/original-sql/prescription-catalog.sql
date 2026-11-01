-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/PrescriptionCatalog.cs QuerySql (병원 처방 목록)
-- 이 파일과 Precheck.Core/Bit/Sql.cs PrescriptionCatalogSql은 공백만 다를 수 있다(시험이 확인)
SELECT RTRIM(SeeOdrCod), RTRIM(SeeKorNam), RTRIM(SeeElcCod),
       RTRIM(SeeCodTyp), RTRIM(SeeCodDiv), RTRIM(SeeItmCod)
FROM dbo.SeeMst
WHERE SeeUidCod NOT LIKE 'BIT%' AND SeeUidCod <> 'Master'
  AND @today BETWEEN SeeAdpDte AND SeeExpDte
ORDER BY SeeOdrCod, SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam, SeeElcCod
