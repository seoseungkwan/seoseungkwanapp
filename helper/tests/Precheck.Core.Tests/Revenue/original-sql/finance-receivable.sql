-- 출처: seoseungkwan/shared@c66488e YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs FinanceReceivable (글자 그대로. RevenueSql.cs FinanceReceivable과 공백·끝 ;·-- 줄만 다를 수 있다, 시험이 확인)
WITH Seq AS (
    SELECT OrpOcmNum,MAX(OrpRcpSeq) AS SeqRcp
    FROM dbo.OrpInf
    WHERE OrpRcpStt='C' AND OrpAccDte>=@day AND OrpAccDte<@nextDay
    GROUP BY OrpOcmNum
), Orp AS (
    SELECT p.* FROM dbo.OrpInf p
    JOIN Seq s ON s.OrpOcmNum=p.OrpOcmNum AND s.SeqRcp=p.OrpRcpSeq
), Orc AS (
    SELECT r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte,
           SUM(CASE WHEN r.OrcCod='COR'
                    THEN r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt ELSE 0 END) AS AllCorAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcNewAmt ELSE 0 END) AS CorAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcCrdAmt ELSE 0 END) AS CorCrdAmt,
           SUM(CASE WHEN r.OrcCod='COR' THEN r.OrcChkAmt ELSE 0 END) AS CorChkAmt
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND r.OrcCod IN ('COR','COD') AND r.OrcPatTyp<>'R'
    GROUP BY r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           r.AllCorAmt,r.CorAmt,r.CorCrdAmt,r.CorChkAmt,c.OcmAcpDtm
    FROM Orp p
    JOIN Orc r ON r.OrcChtNum=p.OrpChtNum AND r.OrcOcmNum=p.OrpOcmNum
    JOIN dbo.PbsInf pb ON pb.PbsChtNum=p.OrpChtNum
    JOIN dbo.OcmInf c ON c.OcmNum=p.OrpOcmNum
    JOIN dbo.DepMst d ON d.DepCod=p.OrpDepCod
    JOIN dbo.InsMst ins ON ins.InsCod=p.OrpInsCod
                      AND ins.InsMdcTyp=d.DepMdcTyp AND ins.InsHspTyp=d.DepHspTyp
    WHERE d.DepHspNum=@hospital AND c.OcmPatTyp='O'
      AND c.OcmRsuYon IN ('','Y','N')
      AND c.OcmComStt IN ('PN','TN','OE','VN','OB')
      AND c.OcmAcpDtm BETWEEN d.DepAdpDte+'0000' AND d.DepExpDte+'2359'
      AND c.OcmAcpDtm BETWEEN ins.InsAdpDte+'0000' AND ins.InsExpDte+'2359'
)
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows;
