-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/HospitalSecurity.cs Authorize · VerifyCurrentInstitution (DB 안 병원 범위)
-- 이 파일과 Precheck.Core/Bit/Sql.cs ScopesSql은 공백만 다를 수 있다(시험이 확인)
SELECT DISTINCT RTRIM(DepHspNum) FROM dbo.DepMst
