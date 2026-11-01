-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs HistoryGuard (과거 이관 자료가 따로 있는가)
-- Precheck.Core/Stats/StatsSql.cs HistoryGuardSql과 공백만 다를 수 있다(시험이 확인)
SELECT (CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE name='DRBITPACK_OLD') OR EXISTS(SELECT 1 FROM sys.objects WHERE name IN ('V_OcmInf','V_OdrInf')) THEN 1 ELSE 0 END)
