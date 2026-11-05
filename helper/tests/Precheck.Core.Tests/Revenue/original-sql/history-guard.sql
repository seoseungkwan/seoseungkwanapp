-- 출처: seoseungkwan/shared@c66488e YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs HistoryGuard (글자 그대로. RevenueSql.cs HistoryGuard과 공백·끝 ;·-- 줄만 다를 수 있다, 시험이 확인)
SELECT (CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE name='DRBITPACK_OLD') OR EXISTS(SELECT 1 FROM sys.objects WHERE name IN ('V_OcmInf','V_OdrInf')) THEN 1 ELSE 0 END)
