-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/TreatmentUsage.cs IdentitySql (조회 기간의 기관기호, RxHistory·ClaimMemoHistory·RxDiagnosisTrend가 먼저 돌림)
-- 이 파일과 Precheck.Core/Bit/Sql.cs PeriodIdentitySql은 공백만 다를 수 있다(시험이 확인)
SELECT
 (SELECT COUNT_BIG(*) FROM dbo.HspMst h WHERE RTRIM(h.HspCod)=@scope AND RTRIM(h.HspInsNum)=@institution
   AND h.HspAdpDte<=@lastDay AND h.HspExpDte>=@firstDay),
 (SELECT COUNT_BIG(*) FROM dbo.HspMst h WHERE RTRIM(h.HspCod)=@scope
   AND (h.HspInsNum IS NULL OR RTRIM(h.HspInsNum)<>@institution)
   AND h.HspAdpDte<=@lastDay AND h.HspExpDte>=@firstDay)
