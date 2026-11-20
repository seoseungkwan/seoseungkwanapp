using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.RxCopy;

/// <summary>
/// 처방전 사본(spec doc-print TASK-6)이 비트 DB에 돌리는 SQL 허용 목록. DocSql이 모아 ReadOnlyGuard에 건다.
/// 문장은 읽기 전용 SELECT 하나·매개변수만·';' 없음·줄바꿈 \n(notes/bit-docs.md §3·§4).
/// </summary>
public static class RxCopySql
{
    /// <summary>
    /// 기간(@from 첫 날 0시 ≤ 접수 &lt; @to 끝 날 다음 날 0시)의 센 외래 내원(DocSql.VisitDaysSql과 같은 조건) 중 처방전(OutInf.OutOcmNum)이 있는 것의
    /// 원외약 줄(OdrInf, OdrOutCod='XX', 같은 내원·같은 교부번호 OdrSlpNum = OutSlpDte+OutSlpNum, 지움·취소 뺌)마다 한 줄:
    /// [내원 번호(RTRIM), 교부일 OutSlpDte, 교부 번호 OutSlpNum(RTRIM), 보험 OcmInsCod, 주민번호 앞 7자리(처방전에 적힌 OutResNum을 DB 안에서 자름, 뒤 6자리는 읽지 않음),
    ///  처방 의사 이름·면허번호(UidMst, OcmDtrCod·그날 유효한 줄 먼저), 주상병(OicInf OicIcdPri='1' 하나, OicSeq 차례 첫 것),
    ///  약 코드 OdrElcCod, 약 이름 OdrCodNam, 1회량 OdrQty, 횟수 OdrTms, 일수 OdrDay, 단위 OdrUntCod].
    /// 약 줄이 없는 처방전은 약 칸이 NULL인 한 줄. 접수 시각·내원·교부번호·OdrSeq 차례. 고른 날은 처방전 사본이 메모리에서 거른다.
    /// 환자 이름·전화·주소·도장 그림은 읽지 않는다(이름은 DocContext.Patient).
    /// </summary>
    public const string SlipSql =
        "SELECT RTRIM(c.OcmNum) VisitId,o.OutSlpDte,RTRIM(o.OutSlpNum) SlipNum,c.OcmInsCod,LEFT(RTRIM(o.OutResNum),7) ResFront,\n"
        + " RTRIM(d.UidNam) DoctorName,RTRIM(d.UidLicNum) License,\n"
        + " (SELECT TOP 1 RTRIM(i.OicElcCod) FROM dbo.OicInf i WHERE i.OicOcmNum=c.OcmNum AND i.OicIcdPri='1' ORDER BY i.OicSeq) MainDx,\n"
        + " RTRIM(r.OdrElcCod) DrugCode,RTRIM(r.OdrCodNam) DrugName,r.OdrQty,r.OdrTms,r.OdrDay,RTRIM(r.OdrUntCod) Unit\n"
        + "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n"
        + "JOIN dbo.OutInf o ON o.OutOcmNum=c.OcmNum\n"
        + "LEFT JOIN dbo.OdrInf r ON r.OdrOcmNum=c.OcmNum AND r.OdrSlpNum=o.OutSlpDte+o.OutSlpNum AND r.OdrOutCod='XX' AND r.OdrDelFlg='N' AND r.OdrCanYon='N'\n"
        + "OUTER APPLY (SELECT TOP 1 u.UidNam,u.UidLicNum FROM dbo.UidMst u WHERE u.UidCod=c.OcmDtrCod\n"
        + " ORDER BY CASE WHEN LEFT(c.OcmAcpDtm,8) BETWEEN u.UidAdpDte AND u.UidExpDte THEN 0 ELSE 1 END,u.UidAdpDte DESC) d\n"
        + "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to\n"
        + " AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,o.OutSlpDte,o.OutSlpNum,r.OdrSeq";

    public static readonly IReadOnlyDictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [SlipSql] = new[]
        {
            new SqlParam("@cht", SqlParamKind.VarChar, 14),
            new SqlParam("@from", SqlParamKind.Char, 12),
            new SqlParam("@to", SqlParamKind.Char, 12),
        },
    };
}
