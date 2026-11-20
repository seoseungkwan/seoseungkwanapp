using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Detail;

/// <summary>
/// 진료비 세부내역서(spec doc-print TASK-5)가 비트 DB에 돌리는 SQL 허용 목록. DocSql이 모아 ReadOnlyGuard에 건다.
/// 문장은 읽기 전용 SELECT 하나·매개변수만(@cht 정리한 차트번호, @from 첫날 0시, @to 끝날 다음 날 0시, yyyyMMddHHmm)·';' 없음·줄바꿈 \n.
/// 환자 표에서는 차트번호만 읽는다. 센 내원 조건은 DocSql.VisitDaysSql과 같다(외래·OcmRsuYon&lt;&gt;'O'·취소 CN/CR 뺌).
/// 고른 날의 내원(VisitDay.VisitNums)만 남기기는 DetailReader가 메모리에서 한다(notes/bit-docs.md §1·§2).
/// </summary>
public static class DetailSql
{
    private const string Counted = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')";

    private const string Visits =
        "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n";

    private const string InRange =
        "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND " + Counted + "\n";

    /// <summary>
    /// 처방 줄(OdrInf, 삭제·취소 줄과 원외약 OdrOutCod='XX' 뺌) 한 줄씩:
    /// [내원 번호(RTRIM), 날 yyyyMMdd, 처방 순서, 청구 코드, 이름, 단가, 1회량, 횟수, 일수, 금액(저장 값), 영수증 항목(IncMst 코드), 급여 구분(DtlMst INSTBL)], 접수·처방 차례.
    /// </summary>
    public const string LinesSql =
        "SELECT RTRIM(c.OcmNum) VisitId,LEFT(c.OcmAcpDtm,8) VisitDay,d.OdrSeq,RTRIM(d.OdrElcCod) Code,RTRIM(d.OdrCodNam) CodeName,\n"
        + " d.OdrPrc,d.OdrQty,d.OdrTms,d.OdrDay,d.OdrAmt,d.OdrIncCod,RTRIM(ISNULL(d.OdrInsYon,'')) InsYon\n"
        + Visits
        + " JOIN dbo.OdrInf d ON d.OdrOcmNum=c.OcmNum\n"
        + InRange
        + " AND d.OdrDelFlg='N' AND d.OdrCanYon='N' AND ISNULL(d.OdrOutCod,'')<>'XX'\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,d.OdrSeq";

    /// <summary>
    /// 내원마다 한 줄: [내원 번호, 날, 상태 OcmComStt, 보험 이름(InsMst.InsCodNam), 그 영수증(OrpInf MAX(OrpRcpSeq), 미수입금 C 뺌)의
    /// 총진료비 OrpTotAmt·급여 총액 OrpInsAmt·급여 본인 OrpInsOwn·공단 OrpCorAmt·비급여 OrpNonAmt, 그 영수증 항목(OdlInf, 65세 정액 31 뺌)의 급여 합·본인 합].
    /// 영수증이 없으면(수납 전) 금액 칸이 NULL이다.
    /// </summary>
    public const string VisitsSql =
        "SELECT RTRIM(c.OcmNum) VisitId,LEFT(c.OcmAcpDtm,8) VisitDay,RTRIM(ISNULL(c.OcmComStt,'')) ComStt,\n"
        + " (SELECT TOP 1 RTRIM(i.InsCodNam) FROM dbo.InsMst i WHERE i.InsCod=c.OcmInsCod ORDER BY i.InsAdpDte DESC) InsName,\n"
        + " p.OrpTotAmt,p.OrpInsAmt,p.OrpInsOwn,p.OrpCorAmt,p.OrpNonAmt,\n"
        + " (SELECT SUM(l.OdlInsAmt) FROM dbo.OdlInf l WHERE l.OdlOcmNum=p.OrpOcmNum AND l.OdlRcpNum=p.OrpRcpNum AND l.OdlIncCod<>31) ItemInsured,\n"
        + " (SELECT SUM(l.OdlInsOwn) FROM dbo.OdlInf l WHERE l.OdlOcmNum=p.OrpOcmNum AND l.OdlRcpNum=p.OrpRcpNum AND l.OdlIncCod<>31) ItemOwn\n"
        + Visits
        + " LEFT JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C'\n"
        + "  AND p.OrpRcpSeq=(SELECT MAX(q.OrpRcpSeq) FROM dbo.OrpInf q WHERE q.OrpOcmNum=c.OcmNum AND ISNULL(q.OrpRcpStt,'')<>'C')\n"
        + InRange
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    private static readonly SqlParam[] Range =
    {
        new SqlParam("@cht", SqlParamKind.VarChar, 14), new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12),
    };

    public static readonly IReadOnlyDictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [LinesSql] = Range,
        [VisitsSql] = Range,
    };
}
