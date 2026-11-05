-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/NativeReportAdapter.cs CheckPermissions (비트 로그인 사용자의 통계 화면 권한)
-- 이 파일과 Precheck.Core/Bit/Sql.cs UserPermissionsSql은 공백만 다를 수 있다(시험이 확인)
SELECT UgaExeNam, UgaExeLvl FROM UgaMst WHERE UgaCod = @user
