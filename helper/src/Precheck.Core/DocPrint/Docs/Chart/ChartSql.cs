using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.Chart;

/// <summary>
/// 진료기록부(spec doc-print TASK-7)가 비트 DB에 돌리는 SQL 허용 목록. DocSql이 모아 ReadOnlyGuard에 건다.
/// 문장은 읽기 전용 SELECT 하나·매개변수만·';' 없음·줄바꿈 \n. 표·조건은 비트 진료기록부(BITPrintChart.dll 안 SQL 글, notes/bit-docs.md §5)를 따른다.
/// 내원·기록·상병·처방·수납은 @cht(정리한 차트번호)·@from(고른 첫날 0시 yyyyMMddHHmm)·@to(고른 끝날 다음 날 0시)로 그 범위 외래 내원을 읽고,
/// 고른 날의 내원 번호(VisitDay.VisitNums)만 ChartSource가 메모리에서 거른다. 줄 첫 칸은 모두 내원 번호 RTRIM(c.OcmNum)이다.
/// </summary>
public static class ChartSql
{
    /// <summary>환자·내원을 잇는 바탕(별칭 b = PbsInf, c = OcmInf).</summary>
    private const string Joined = "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n";

    /// <summary>그 차트번호의 고른 범위 외래 내원.</summary>
    private const string InRange = "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'";

    /// <summary>
    /// 환자 [주민번호 앞 7자리(생년월일 6 + 성별 1, '-' 뺌)]. 비트 '주민번호 부분출력'처럼 뒤 6자리는 '******'로 찍으므로 DB에서도 앞 7자리만 꺼낸다.
    /// 이름·생년월일·성별은 DocContext.Patient에 있다. 주소·전화는 읽지 않는다(견본으로 정할 것).
    /// </summary>
    public const string PatientSql =
        "SELECT LEFT(REPLACE(b.PbsResNum,'-',''),7) ResHead\n"
        + "FROM dbo.PbsInf b\n"
        + "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht";

    /// <summary>
    /// 내원 [내원 번호, 접수 시각 OcmAcpDtm(yyyyMMddHHmm), 진료과 DepKorNam, 진료의 UidNam], 접수 차례.
    /// 진료과·진료의는 그날 유효한 줄을 먼저, 없으면 가장 늦게 시작한 줄(비트처럼 적용 날짜로 잇되 빈칸이 되지 않게).
    /// </summary>
    public const string VisitsSql =
        "SELECT RTRIM(c.OcmNum) VisitId,c.OcmAcpDtm,\n"
        + " (SELECT TOP 1 RTRIM(d.DepKorNam) FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod ORDER BY CASE WHEN LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte THEN 0 ELSE 1 END,d.DepAdpDte DESC) DepName,\n"
        + " (SELECT TOP 1 RTRIM(u.UidNam) FROM dbo.UidMst u WHERE u.UidCod=c.OcmDtrCod ORDER BY CASE WHEN LEFT(c.OcmAcpDtm,8) BETWEEN u.UidAdpDte AND u.UidExpDte THEN 0 ELSE 1 END,u.UidAdpDte DESC) DoctorName\n"
        + Joined
        + InRange + "\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    /// <summary>기록 [내원 번호, 글 EmrShtVal], 비트 A4 진료기록부 차례(내원 → 고친 날 → EmrShtSeq).</summary>
    public const string NotesSql =
        "SELECT RTRIM(c.OcmNum) VisitId,e.EmrShtVal\n"
        + Joined
        + "JOIN dbo.EmrInf e ON e.EmrOcmNum=c.OcmNum\n"
        + InRange + "\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,LEFT(e.EmrUpdDtm,8),e.EmrShtSeq";

    /// <summary>상병 [내원 번호, 주부(1 주상병, 빈칸은 2), 코드 OicElcCod, 이름 OicIcdNam]. 배제 상병(3)은 뺀다(비트 설정 '배제상병 제외'). 주상병 먼저.</summary>
    public const string DiagnosesSql =
        "SELECT RTRIM(c.OcmNum) VisitId,CASE ISNULL(i.OicIcdPri,'') WHEN '' THEN '2' ELSE i.OicIcdPri END Pri,RTRIM(i.OicElcCod) Code,RTRIM(i.OicIcdNam) Name\n"
        + Joined
        + "JOIN dbo.OicInf i ON i.OicOcmNum=c.OcmNum\n"
        + InRange + " AND ISNULL(i.OicIcdPri,'')<>'3'\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,Pri,i.OicSeq";

    /// <summary>
    /// 처방 [내원 번호, 원외 구분 OdrOutCod('XX' = 원외처방), 청구코드 OdrElcCod, 사용자코드 OdrCod, 이름, 용량 OdrQty, 횟수 OdrTms, 일수 OdrDay, 용법 이름(UsgMst), 교부번호 OdrSlpNum].
    /// 비트처럼 삭제·취소 줄과 묶음 머리(OdrOspTyp Y·G)는 뺀다. 처방 시각 차례.
    /// </summary>
    public const string OrdersSql =
        "SELECT RTRIM(c.OcmNum) VisitId,RTRIM(ISNULL(o.OdrOutCod,'')) OutCod,RTRIM(o.OdrElcCod) ElcCod,RTRIM(o.OdrCod) UserCod,RTRIM(o.OdrCodNam) Name,o.OdrQty,o.OdrTms,o.OdrDay,\n"
        + " (SELECT TOP 1 RTRIM(g.UsgCodNam) FROM dbo.UsgMst g WHERE g.UsgCod=o.OdrUsgCod) Usage,RTRIM(o.OdrSlpNum) SlipNum\n"
        + Joined
        + "JOIN dbo.OdrInf o ON o.OdrOcmNum=c.OcmNum\n"
        + InRange + " AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND ISNULL(o.OdrOspTyp,'') NOT IN ('Y','G')\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,o.OdrDtm,o.OdrOutCod,o.OdrSeq";

    /// <summary>
    /// 수납 [내원 번호, 수납일 OrpAccDte, 총진료비 OrpTotAmt, 영수액 OrpTotOwn, 수납액(OrcInf RCV 현금+카드+계좌), 할인액(OrcInf DOD·DOE·DET 의사·직원·기타 할인)].
    /// 비트 진료기록부 SQL 그대로: 수납 끝난(PN) 내원의 미수입금(C) 아닌 영수증 줄, 최근 줄 먼저(내원마다 첫 줄만 쓴다). 금액은 저장 값 그대로.
    /// </summary>
    public const string PaymentsSql =
        "SELECT RTRIM(c.OcmNum) VisitId,p.OrpAccDte,p.OrpTotAmt,p.OrpTotOwn,\n"
        + " (SELECT ISNULL(SUM(r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt),0) FROM dbo.OrcInf r WHERE r.OrcOrpNum=p.OrpRcpNum AND r.OrcOcmNum=p.OrpOcmNum AND r.OrcCod='RCV') Paid,\n"
        + " (SELECT ISNULL(SUM(r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt),0) FROM dbo.OrcInf r WHERE r.OrcOrpNum=p.OrpRcpNum AND r.OrcOcmNum=p.OrpOcmNum AND r.OrcCod IN ('DOD','DOE','DET')) Discount\n"
        + Joined
        + "JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum\n"
        + InRange + " AND c.OcmComStt='PN' AND ISNULL(p.OrpRcpStt,'')<>'C'\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum,p.OrpAccDte DESC,p.OrpRcpSeq DESC";

    private static readonly SqlParam Chart = new SqlParam("@cht", SqlParamKind.VarChar, 14);
    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);

    public static readonly IReadOnlyDictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [PatientSql] = new[] { Chart },
        [VisitsSql] = new[] { Chart, From, To },
        [NotesSql] = new[] { Chart, From, To },
        [DiagnosesSql] = new[] { Chart, From, To },
        [OrdersSql] = new[] { Chart, From, To },
        [PaymentsSql] = new[] { Chart, From, To },
    };
}
