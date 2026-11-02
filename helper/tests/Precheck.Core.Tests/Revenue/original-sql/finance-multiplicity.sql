-- 출처: seoseungkwan/shared@c66488e YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs FinanceMultiplicity (글자 그대로. RevenueSql.cs FinanceMultiplicity과 공백·끝 ;·-- 줄만 다를 수 있다, 시험이 확인)
WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt<>'C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.* FROM dbo.OrpInf p
    JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
    WHERE NOT EXISTS(SELECT 1 FROM dbo.IrcInf i
                     WHERE i.IrcOcmNum=p.OrpOcmNum AND i.IrcRcpTyp<>'T')
), Orc AS (
    -- Equivalent to the original inner/outer grouped financial projection's
    -- keys. Original MAX date deliberately ranges beyond the selected period.
    SELECT DISTINCT r.OrcChtNum,r.OrcOcmNum,
        (SELECT MAX(r1.OrcAccDte) FROM dbo.OrcInf r1
         WHERE r1.OrcRcpNum=r.OrcRcpNum AND r1.OrcCod=r.OrcCod) AS ReceiptDay
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND NOT(r.OrcCod='COR' OR r.OrcCod='COD') AND r.OrcPatTyp<>'R'
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpRcpNum,p.OrpRcpSeq,p.OrpAccDte,
           p.OrpInsCod,p.OrpInsSeq,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           c.OcmAcpDtm,r.ReceiptDay,ft.DtlCodNam AS DgsNfsNam
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod
                      AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    JOIN dbo.DtlMst ft ON ft.DtlCod=c.OcmDgsNfs AND ft.DtlTblCod='FTDNFS'
    JOIN dbo.UidMst u ON u.UidCod=p.OrpDtrCod
    WHERE d.DepHspNum=@hospital
      AND c.OcmPatTyp='O' AND c.OcmRsuYon IN ('','N','O')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN ins.InsAdpDte AND ins.InsExpDte
      AND LEFT(p.OrpAccDte,8) BETWEEN u.UidAdpDte AND u.UidExpDte
      AND c.OcmAcpDtm>=@day AND c.OcmAcpDtm<@nextDay
)
SELECT (SELECT COUNT_BIG(*)-COUNT(DISTINCT OrpOcmNum) FROM NativeRows)
 +(SELECT COUNT_BIG(*) FROM NativeRows n WHERE
    (SELECT COUNT_BIG(*) FROM (SELECT o.OdlRcpNum FROM dbo.OdlInf o WHERE o.OdlOcmNum=n.OrpOcmNum GROUP BY o.OdlRcpNum) q)>1
    OR (SELECT COUNT_BIG(*) FROM dbo.PmdInf p WHERE p.PmdChtNum=n.OrpChtNum AND p.PmdInsCod=n.OrpInsCod AND p.PmdInsSeq=n.OrpInsSeq)>1)
