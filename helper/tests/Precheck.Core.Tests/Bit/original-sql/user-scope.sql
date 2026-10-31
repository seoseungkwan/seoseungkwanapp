-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/HospitalSecurity.cs Authorize (로그인 사용자의 병원 범위)
-- 이 파일과 Precheck.Core/Bit/Sql.cs UserScopeSql은 공백만 다를 수 있다(시험이 확인)
SELECT DISTINCT RTRIM(d.DepHspNum) FROM dbo.UidMst u JOIN dbo.DepMst d ON u.UidDepCod=d.DepCod WHERE u.UidCod=@user AND @workDate BETWEEN u.UidAdpDte AND u.UidExpDte AND @workDate BETWEEN d.DepAdpDte AND d.DepExpDte
