using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Revenue;

/// <summary>
/// revenue.days가 비트 DB에 돌리는 문장 전부(spec revenue design.md 4-2, AC-003.1·AC-003.8). 원본 일곱 개는 양지바른
/// OperationalReportSql.cs에서 옮겼고 사본(helper/tests/Precheck.Core.Tests/Revenue/original-sql/*.sql)과 공백·끝 ;·-- 줄만 다르다(시험이 비교).
/// 예외 하나: Patients의 첫 내원 연결 조건만 색인을 쓸 수 있는 c.OcmChtNum=p.PatientId로 바꿨다(spec bit-read-speed, AC-1001.3).
/// 예외 둘: Patients 둘째 칸(신환)만 비트 신환 표시(OcmDgsNfs='1') 환자 수로 바꿨다(spec new-mark AC-6203.1, 시험 상수 NewMarkPatients).
/// 그 밖의 조건·칸 순서를 고치지 않는다: 의원이 쓰는 일일 보고와 같은 숫자가 나와야 한다. ReadOnlyGuard는 이 표의 문장을 표의 매개변수와 함께만 통과시킨다.
/// 확인 필요한 날의 참고 금액(spec first90 AC-4405.1)은 이 표에 새 문장을 더하지 않고 통계 원장님별 금액 문장 둘
/// (StatsSql.DoctorMoneyNormalSql·DoctorMoneyReceivableSql)을 그대로 쓴다. 그 둘은 StatsSql 표로 관문을 지난다.
/// </summary>
public static class RevenueSql
{
    // ---- 원본 7개(Patients 연결 조건만 예외) -------------------------------------------------------------------------------
    /// <summary>옛 자료가 따로 있는가(0이 아니면 신환을 정할 수 없다). 매개변수 없음.</summary>
    public const string HistoryGuard = @"SELECT (CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE name='DRBITPACK_OLD') OR EXISTS(SELECT 1 FROM sys.objects WHERE name IN ('V_OcmInf','V_OdrInf')) THEN 1 ELSE 0 END)";

    /// <summary>환불·변경수납·예치금이 있는가(0이 아니면 그날 금액을 세지 않는다).</summary>
    public const string UnsupportedFinance = @"SELECT SUM(q.n) FROM (
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
) q";

    /// <summary>정상수납 연결 중복이 있는가.</summary>
    public const string FinanceMultiplicity = @"WITH Seq AS (
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
    OR (SELECT COUNT_BIG(*) FROM dbo.PmdInf p WHERE p.PmdChtNum=n.OrpChtNum AND p.PmdInsCod=n.OrpInsCod AND p.PmdInsSeq=n.OrpInsSeq)>1)";

    /// <summary>미수입금 연결 중복이 있는가.</summary>
    public const string ReceivableMultiplicity = @"WITH Seq AS (
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
SELECT COUNT_BIG(*)-COUNT(DISTINCT OrpOcmNum) FROM NativeRows";

    /// <summary>정상수납: 총진료비·공단·비급여·현금·카드·계좌.</summary>
    public const string FinanceNormal = @"WITH Seq AS (
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
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows";

    /// <summary>미수입금: 총진료비·공단·비급여·현금·카드·계좌.</summary>
    public const string FinanceReceivable = @"WITH Seq AS (
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
SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows";

    /// <summary>
    /// 내원·신환과 검사 칸 셋(차트번호 없음·중복·첫 내원 못 찾음). 신환(둘째 칸)만 원본과 달리 기간 안 센 접수에 신환 표시(OcmDgsNfs='1')가
    /// 하나라도 있는 서로 다른 환자 수다(spec new-mark AC-6203.1). 통계 보고 StatsSql.PatientsSql과 글자가 같다.
    /// </summary>
    public const string Patients = @"WITH PeriodVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId
 FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), Patients AS (
 SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL
), FirstVisits AS (
 SELECT p.PatientId,MIN(c.OcmAcpDtm) FirstDtm FROM Patients p JOIN dbo.OcmInf c ON c.OcmChtNum=p.PatientId
 WHERE c.OcmAcpDtm<@to AND c.OcmRsuYon<>'O'
   AND ((c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN'))
     OR (c.OcmPatTyp='I' AND c.OcmComStt NOT IN ('VC','CN','CR')))
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
 GROUP BY p.PatientId
)
SELECT (SELECT COUNT_BIG(*) FROM PeriodVisits),
       (SELECT COUNT_BIG(DISTINCT v.PatientId) FROM PeriodVisits v JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId WHERE v.PatientId IS NOT NULL AND o.OcmDgsNfs='1'),
       (SELECT COUNT_BIG(*) FROM PeriodVisits WHERE PatientId IS NULL),
       (SELECT COUNT_BIG(*)-COUNT(DISTINCT VisitId) FROM PeriodVisits),
       (SELECT COUNT_BIG(*) FROM Patients p LEFT JOIN FirstVisits f ON f.PatientId=p.PatientId WHERE f.PatientId IS NULL)";

    // ---- 새 문장 3개(design.md 4-2) ------------------------------------------------------------------

    /// <summary>기간의 처방 코드별 줄 수·금액·빠진 값 수·이름. 금액 식은 원본 TrendDataSource와 같고, 내원 상태 목록은 원본 LaCodes와 같다.</summary>
    public const string CodeAmounts = @"WITH Codes AS (
  SELECT RTRIM(o.OdrCod) AS Code, COUNT_BIG(*) AS Lines,
         CAST(SUM(CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc) AS decimal(28,5)) AS Amount,
         SUM(CASE WHEN o.OdrDay IS NULL OR o.OdrPrc IS NULL OR (CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END) IS NULL
                  THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS MissingValues
  FROM dbo.OdrInf o
  WHERE o.OdrDtm >= @from AND o.OdrDtm < @to AND RTRIM(o.OdrCod) <> ''
    AND o.OdrDelFlg = 'N' AND o.OdrCanYon = 'N' AND o.OdrOspTyp = 'I' AND o.OdrOutCod <> '99'
    AND EXISTS (SELECT 1 FROM dbo.DepMst d WHERE d.DepCod = o.OdrDepCod AND d.DepHspNum = @hospital
                AND o.OdrDtm BETWEEN d.DepAdpDte + '0000' AND d.DepExpDte + '2359')
    AND EXISTS (SELECT 1 FROM dbo.OcmInf c WHERE c.OcmNum = o.OdrOcmNum AND c.OcmPatTyp = 'O'
                AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') AND c.OcmRsuYon <> 'O')
  GROUP BY RTRIM(o.OdrCod))
SELECT c.Code, c.Lines, c.Amount, c.MissingValues,
       (SELECT TOP 1 RTRIM(s.SeeKorNam) FROM dbo.SeeMst s WHERE RTRIM(s.SeeOdrCod) = c.Code ORDER BY s.SeeAdpDte DESC) AS Name
FROM Codes c";

    /// <summary>요양비용총액(OrpInsAmt)·급여 본인부담(OrpInsOwn) 합. 원본 FinanceNormal과 마지막 SELECT 줄만 다르다.</summary>
    public const string FinanceNormalExtra = @"WITH Seq AS (
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
SELECT SUM(OrpInsAmt),SUM(OrpInsOwn) FROM NativeRows";

    /// <summary>같은 두 합(미수입금 쪽). 원본 FinanceReceivable과 마지막 SELECT 줄·NativeRows 칸(p.OrpInsAmt,p.OrpInsOwn)만 다르다.</summary>
    public const string FinanceReceivableExtra = @"WITH Seq AS (
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
           p.OrpInsAmt,p.OrpInsOwn,
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
SELECT SUM(OrpInsAmt),SUM(OrpInsOwn) FROM NativeRows";

    // ---- 날 단위 문장(spec stats-revenue REQ-4101) ---------------------------------------------------------

    /// <summary>
    /// 기간의 날(처방일 앞 8자리)·처방 코드별 줄 수·금액·빠진 값 수. CodeAmounts와 WHERE·금액 식·MissingValues가 글자까지 같고
    /// Codes의 첫 칸(Day)·GROUP BY 줄·끝 SELECT만 다르다. 이름(SeeMst) 하위 질의는 없다(이름은 기간 CodeAmounts가 준다).
    /// </summary>
    public const string CodeAmountsByDay = @"WITH Codes AS (
  SELECT LEFT(o.OdrDtm,8) AS Day, RTRIM(o.OdrCod) AS Code, COUNT_BIG(*) AS Lines,
         CAST(SUM(CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc) AS decimal(28,5)) AS Amount,
         SUM(CASE WHEN o.OdrDay IS NULL OR o.OdrPrc IS NULL OR (CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END) IS NULL
                  THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS MissingValues
  FROM dbo.OdrInf o
  WHERE o.OdrDtm >= @from AND o.OdrDtm < @to AND RTRIM(o.OdrCod) <> ''
    AND o.OdrDelFlg = 'N' AND o.OdrCanYon = 'N' AND o.OdrOspTyp = 'I' AND o.OdrOutCod <> '99'
    AND EXISTS (SELECT 1 FROM dbo.DepMst d WHERE d.DepCod = o.OdrDepCod AND d.DepHspNum = @hospital
                AND o.OdrDtm BETWEEN d.DepAdpDte + '0000' AND d.DepExpDte + '2359')
    AND EXISTS (SELECT 1 FROM dbo.OcmInf c WHERE c.OcmNum = o.OdrOcmNum AND c.OcmPatTyp = 'O'
                AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') AND c.OcmRsuYon <> 'O')
  GROUP BY LEFT(o.OdrDtm,8), RTRIM(o.OdrCod))
SELECT c.Day, c.Code, c.Lines, c.Amount, c.MissingValues FROM Codes c";

    private static readonly SqlParam Day = new SqlParam("@day", SqlParamKind.Char, 8);
    private static readonly SqlParam NextDay = new SqlParam("@nextDay", SqlParamKind.Char, 8);
    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);
    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    /// <summary>문장 → 그 문장에 실제로 있는 매개변수(종류·길이는 원본 OperationalReportData.Command 그대로).</summary>
    public static IReadOnlyDictionary<string, SqlParam[]> Parameters { get; } = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [HistoryGuard] = new SqlParam[0],
        [UnsupportedFinance] = new[] { Day, NextDay, From, To, Hospital },
        [FinanceMultiplicity] = new[] { Day, NextDay, Hospital },
        [ReceivableMultiplicity] = new[] { Day, NextDay, Hospital },
        [FinanceNormal] = new[] { Day, NextDay, Hospital },
        [FinanceReceivable] = new[] { Day, NextDay, Hospital },
        [Patients] = new[] { From, To, Hospital },
        [CodeAmounts] = new[] { From, To, Hospital },
        [FinanceNormalExtra] = new[] { Day, NextDay, Hospital },
        [FinanceReceivableExtra] = new[] { Day, NextDay, Hospital },
        [CodeAmountsByDay] = new[] { From, To, Hospital },
    };
}
