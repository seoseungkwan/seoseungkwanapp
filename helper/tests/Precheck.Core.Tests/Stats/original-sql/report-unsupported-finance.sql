-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs UnsupportedFinance (환불·변경수납·예치금 자료가 있는가)
-- Precheck.Core/Stats/StatsSql.cs UnsupportedFinanceSql과 공백만 다를 수 있다(시험이 확인)
SELECT SUM(q.n) FROM (
 SELECT COUNT_BIG(*) n FROM dbo.OrcInf r
 WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
   AND (r.OrcPatTyp='R' OR r.OrcCod IN ('TFC','TPR'))
   AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod
               WHERE c.OcmNum=r.OrcOcmNum AND d.DepHspNum=@hospital
                 AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 UNION ALL SELECT COUNT_BIG(*) FROM dbo.OrpInf p JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
 WHERE p.OrpRcpStt<>'C' AND p.OrpAccDte>=@day AND p.OrpAccDte<@nextDay
   AND c.OcmPatTyp='O' AND c.OcmRsuYon='Y' AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=p.OrpDepCod AND d.DepHspNum=@hospital
               AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 UNION ALL SELECT COUNT_BIG(*) FROM dbo.IrcInf
 WHERE (IrcAccDte>=@day AND IrcAccDte<@nextDay)
    OR (IrcRcpDtm>=@from AND IrcRcpDtm<@to)
    OR (IrcRetDtm>=@from AND IrcRetDtm<@to)
) q
