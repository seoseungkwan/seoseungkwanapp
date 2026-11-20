using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Receipt;

/// <summary>
/// 진료비 영수증(spec doc-print TASK-4, notes/bit-docs.md §1)이 비트 DB에 돌리는 SQL 허용 목록. DocSql이 모아 ReadOnlyGuard에 건다.
/// 문장은 읽기 전용 SELECT 하나·매개변수만·';' 없음·줄바꿈 \n. 고른 날마다 묻지 않고 @cht·@from(고른 첫 날 0시)·@to(고른 끝 날 다음 날 0시)로
/// 한 번씩 읽어 고른 날의 내원만 메모리에서 거른다(ReceiptData). 센 내원 조건은 DocSql.VisitDaysSql과 같다.
/// 환자 표에서는 차트번호로 잇기만 하고(이름은 DocContext.Patient), 주민번호·전화·주소·현금영수증 신분확인번호(CashChkNum)는 읽지 않는다.
/// </summary>
public static class ReceiptSql
{
    /// <summary>센 내원 조건(별칭 c = dbo.OcmInf). DocSql과 같은 글.</summary>
    private const string Counted = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')";

    private const string Visits =
        "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n";

    private const string Where =
        "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND " + Counted + "\n";

    private const string Rcv = "FROM dbo.OrcInf o WHERE o.OrcOcmNum=c.OcmNum AND o.OrcCod='RCV'";

    private const string Cash = "FROM dbo.CashInf h WHERE h.CashOcmNum=c.OcmNum AND h.CashSndStt='0' AND h.CashTrdYon='0'";

    /// <summary>
    /// 영수증 머리·합계(내원마다 한 줄, 영수증 줄이 있는 내원만 = 수납 전 내원은 안 나옴), 접수 시각 차례:
    /// [0 내원 번호 RTRIM(OcmNum), 1 내원 날 yyyyMMdd, 2 영수증 번호 OrpRcpNum, 3 수납일 OrpAccDte, 4 주야간 OcmDgsDnh, 5 진료과 DepKorNam, 6 환자구분 InsCodNam, 7 보험 코드 OcmInsCod,
    /// 8 총진료비 OrpTotAmt, 9 공단 OrpCorAmt, 10 본인부담 총액 OrpTotOwn, 11 급여 본인부담 OrpInsOwn, 12 비급여 OrpNonAmt, 13 장애인기금 OrpRcvBil, 14 지원금 OrpSupBil,
    /// 15 RCV 현금 OrcNewAmt, 16 RCV 카드 OrcCrdAmt, 17 RCV 계좌 OrcChkAmt, 18 QCV 건강생활유지비, 19 현금영수증 금액 CashSupAmt, 20 현금영수증 승인번호 CashAuthNum].
    /// 영수증 줄은 비트·도우미와 같이 내원마다 MAX(OrpRcpSeq)이면서 OrpRcpStt&lt;&gt;'C'(C = 미수입금 줄). 받은 돈은 그 내원의 OrcInf를 코드별로 더한다(비트 재출력과 같음).
    /// 현금영수증은 비트 재출력처럼 보낸(CashSndStt='0')·취소 안 된(CashTrdYon='0') 줄만.
    /// </summary>
    public const string ReceiptsSql =
        "SELECT RTRIM(c.OcmNum) VisitId,LEFT(c.OcmAcpDtm,8) VisitDay,RTRIM(p.OrpRcpNum) RcpNum,LEFT(p.OrpAccDte,8) PaidDay,RTRIM(ISNULL(c.OcmDgsDnh,'')) DayNight,\n"
        + " (SELECT TOP 1 RTRIM(d.DepKorNam) FROM dbo.DepMst d WHERE d.DepCod=p.OrpDepCod AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte ORDER BY d.DepAdpDte DESC) DepName,\n"
        + " (SELECT TOP 1 RTRIM(i.InsCodNam) FROM dbo.InsMst i WHERE i.InsCod=c.OcmInsCod AND LEFT(c.OcmAcpDtm,8) BETWEEN i.InsAdpDte AND i.InsExpDte ORDER BY i.InsAdpDte DESC) InsName,c.OcmInsCod,\n"
        + " p.OrpTotAmt,p.OrpCorAmt,p.OrpTotOwn,p.OrpInsOwn,p.OrpNonAmt,p.OrpRcvBil,p.OrpSupBil,\n"
        + " (SELECT ISNULL(SUM(o.OrcNewAmt),0) " + Rcv + ") RcvCash,\n"
        + " (SELECT ISNULL(SUM(o.OrcCrdAmt),0) " + Rcv + ") RcvCard,\n"
        + " (SELECT ISNULL(SUM(o.OrcChkAmt),0) " + Rcv + ") RcvAccount,\n"
        + " (SELECT ISNULL(SUM(o.OrcNewAmt+o.OrcCrdAmt+o.OrcChkAmt),0) FROM dbo.OrcInf o WHERE o.OrcOcmNum=c.OcmNum AND o.OrcCod='QCV') Health,\n"
        + " (SELECT ISNULL(SUM(h.CashSupAmt),0) " + Cash + ") CashReceipt,\n"
        + " (SELECT MAX(RTRIM(h.CashAuthNum)) " + Cash + ") CashApproval\n"
        + Visits
        + " JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C' AND p.OrpRcpSeq=(SELECT MAX(q.OrpRcpSeq) FROM dbo.OrpInf q WHERE q.OrpOcmNum=c.OcmNum AND ISNULL(q.OrpRcpStt,'')<>'C')\n"
        + Where
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    /// <summary>
    /// 영수증 항목(OdlInf, 내원·영수증 번호·항목마다 한 줄): [0 내원 번호, 1 영수증 번호 OdlRcpNum, 2 항목 OdlIncCod(IncMst 코드), 3 급여 본인부담 OdlInsOwn, 4 공단 OdlInsCor,
    /// 5 전액본인부담 OdlHunAmt, 6 비급여 OdlNonAmt+OdlNinAct+OdlNinMat+OdlNinNat(비트 재출력 식), 7~11 선별급여 본인부담 50·80·30·90·95% 대상 금액 OdlH50Amt·H80·H30·H90·H95].
    /// </summary>
    public const string ItemsSql =
        "SELECT RTRIM(o.OdlOcmNum) VisitId,RTRIM(o.OdlRcpNum) RcpNum,o.OdlIncCod,ISNULL(o.OdlInsOwn,0) InsOwn,ISNULL(o.OdlInsCor,0) InsCor,ISNULL(o.OdlHunAmt,0) HunAmt,\n"
        + " ISNULL(o.OdlNonAmt,0)+ISNULL(o.OdlNinAct,0)+ISNULL(o.OdlNinMat,0)+ISNULL(o.OdlNinNat,0) NonPay,\n"
        + " ISNULL(o.OdlH50Amt,0) H50,ISNULL(o.OdlH80Amt,0) H80,ISNULL(o.OdlH30Amt,0) H30,ISNULL(o.OdlH90Amt,0) H90,ISNULL(o.OdlH95Amt,0) H95\n"
        + Visits
        + " JOIN dbo.OdlInf o ON o.OdlOcmNum=c.OcmNum\n"
        + Where
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,o.OdlRcpNum,o.OdlIncCod";

    private static readonly SqlParam[] Range =
    {
        new SqlParam("@cht", SqlParamKind.VarChar, 14),
        new SqlParam("@from", SqlParamKind.Char, 12),
        new SqlParam("@to", SqlParamKind.Char, 12),
    };

    public static readonly IReadOnlyDictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [ReceiptsSql] = Range,
        [ItemsSql] = Range,
    };
}
