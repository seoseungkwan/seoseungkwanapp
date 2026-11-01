-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs ReceivableMultiplicity (미수입금 연결 중복)
-- Precheck.Core/Stats/StatsSql.cs ReceivableMultiplicitySql과 공백만 다를 수 있다(시험이 확인)
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
                    THEN r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt ELSE 0 END) AS AllCorAmt
    FROM dbo.OrcInf r
    WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay
      AND r.OrcCod IN ('COR','COD') AND r.OrcPatTyp<>'R'
    GROUP BY r.OrcChtNum,r.OrcOcmNum,r.OrcAccDte
), NativeRows AS (
    SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt,p.OrpCorAmt,p.OrpNonAmt,
           r.AllCorAmt,c.OcmAcpDtm
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
SELECT COUNT_BIG(*)-COUNT(DISTINCT OrpOcmNum) FROM NativeRows;
