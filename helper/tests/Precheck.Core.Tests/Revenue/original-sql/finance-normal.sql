-- 출처: seoseungkwan/shared@c66488e YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs FinanceNormal (글자 그대로. RevenueSql.cs FinanceNormal과 공백·끝 ;·-- 줄만 다를 수 있다, 시험이 확인)
WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt<>'C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.*
    FROM dbo.OrpInf p JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
    WHERE NOT EXISTS(SELECT 1 FROM dbo.IrcInf i WHERE i.IrcOcmNum=p.OrpOcmNum AND i.IrcRcpTyp<>'T')
), OrcMid AS (
    SELECT o2.OrcChtNum,o2.OrcOcmNum,
        (SELECT MAX(o1.OrcAccDte) FROM dbo.OrcInf o1
         WHERE o1.OrcRcpNum=o2.OrcRcpNum AND o1.OrcCod=o2.OrcCod) AS ReceiptDay,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcNewAmt) ELSE 0 END AS CashRcv,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcCrdAmt) ELSE 0 END AS CardRcv,
        CASE o2.OrcCod WHEN 'RCV' THEN SUM(o2.OrcChkAmt) ELSE 0 END AS CheckRcv,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcNewAmt) ELSE 0 END AS CashTfc,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcCrdAmt) ELSE 0 END AS CardTfc,
        CASE o2.OrcCod WHEN 'TFC' THEN SUM(o2.OrcChkAmt) ELSE 0 END AS CheckTfc
    FROM dbo.OrcInf o2
    WHERE o2.OrcAccDte>=@day AND o2.OrcAccDte<@nextDay
      AND NOT(o2.OrcCod='COR' OR o2.OrcCod='COD') AND o2.OrcPatTyp<>'R'
    GROUP BY o2.OrcRcpNum,o2.OrcCod,o2.OrcChtNum,o2.OrcOcmNum,o2.OrcSeq,
             o2.OrcAccDte,o2.OrcUidCod,o2.OrcPubYon,o2.OrcPatTyp
), Orc AS (
    SELECT OrcChtNum,OrcOcmNum,ReceiptDay,
        SUM(CashRcv+CardRcv+CheckRcv) AS RcvAmt,
        SUM(CashRcv-CashTfc) AS CashAmt,
        SUM(CardRcv-CardTfc) AS CardAmt,
        SUM(CheckRcv-CheckTfc) AS CheckAmt
    FROM OrcMid GROUP BY OrcChtNum,OrcOcmNum,ReceiptDay
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           p.OrpInsAmt,p.OrpInsOwn,p.OrpTotOwn,
           r.RcvAmt,r.CashAmt,r.CardAmt,r.CheckAmt,ft.DtlCodNam AS DgsNfsNam
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
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
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows;
