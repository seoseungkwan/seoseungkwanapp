-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/HospitalSecurity.cs VerifyInstitutionNumber (그날의 요양기관번호)
-- 이 파일과 Precheck.Core/Bit/Sql.cs InstitutionSql은 공백만 다를 수 있다(시험이 확인)
SELECT RTRIM(HspInsNum) FROM dbo.HspMst WHERE RTRIM(HspCod)=@scope AND @day BETWEEN HspAdpDte AND HspExpDte
