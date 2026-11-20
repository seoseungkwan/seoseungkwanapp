using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 주사 차수(spec injection-memo AC-7502.1)가 비트 DB에 돌리는 SQL 허용 목록. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록을 보므로
/// ReadOnlyGuard를 지난다(청구 Sql.All 밖). 원본에 없는 새 문장이고, 읽기 전용 SELECT 하나·매개변수만(글자 이어 붙이기 없음)·';' 없음·줄바꿈 \n이다.
/// 차트번호: dbo.PbsInf.PbsChtNum·OcmInf.OcmChtNum은 char(14) 오른쪽 맞춤이라 PbsInf를 LTRIM(RTRIM(…))=@cht로 찾고
/// OcmInf는 같은 글자로 잇는다. 외래 내원 OcmPatTyp='O' · OcmRsuYon&lt;&gt;'O'(지난 30일 조사와 같은 조건). 내원과 증상 줄 잇기는 메모리에서(InjectionReader).
/// 이름·주민번호·전화·주소·청구 메모는 읽지 않는다.
/// </summary>
public static class InjectionSql
{
    /// <summary>읽기 시간 제한(문장마다 5초).</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    /// <summary>환자·내원을 잇는 바탕(별칭 b = PbsInf, c = OcmInf).</summary>
    private const string Joined = "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n";

    /// <summary>그 차트번호(@cht 정리한 번호)의 @from(오늘 30일 앞 0시 yyyyMMddHHmm) ≤ 접수 &lt; @to(오늘 0시) 외래 내원.</summary>
    private const string InRange = "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'";

    /// <summary>내원 [내원 번호 RTRIM(OcmNum), 접수 시각 OcmAcpDtm(yyyyMMddHHmm), 접수 메모 OcmRefCmt].</summary>
    public const string VisitsSql =
        "SELECT RTRIM(c.OcmNum) VisitId,c.OcmAcpDtm,c.OcmRefCmt\n"
        + Joined
        + InRange;

    /// <summary>증상 줄 [내원 번호 RTRIM(OcmNum), 차례 EmrShtSeq, 글 EmrShtVal]: 그 내원들의 EmrInf EmrShtTyp='S'.</summary>
    public const string LinesSql =
        "SELECT RTRIM(c.OcmNum) VisitId,e.EmrShtSeq,e.EmrShtVal\n"
        + Joined
        + "JOIN dbo.EmrInf e ON e.EmrOcmNum=c.OcmNum\n"
        + InRange + " AND e.EmrShtTyp='S'";

    /// <summary>골절 fx(REQ-7507): 그 30일 외래 내원들의 주상병 [내원 번호 RTRIM(OcmNum), 진단 코드 UPPER(RTRIM(OicElcCod))]. OicIcdPri='1'은 내원마다 하나.</summary>
    public const string DiagnosisSql =
        "SELECT RTRIM(c.OcmNum) VisitId,UPPER(RTRIM(i.OicElcCod)) Code\n"
        + Joined
        + "JOIN dbo.OicInf i ON i.OicOcmNum=c.OcmNum\n"
        + InRange + " AND i.OicIcdPri='1'";

    /// <summary>
    /// 엑스레이 경과(REQ-7506): 그 환자의 @from(오늘 − 2년)~@to(오늘 0시) 영상 처방(영수증 항목 30, 삭제·취소 아님)을
    /// 청구 코드 앞 3글자(G + 부위 두 자리)별 마지막 처방 시각으로 DB 안에서 묶는다. 질문 자체는 약 60ms(2026-11-20 이 PC, 테스트 환자).
    /// </summary>
    public const string XraySql =
        "SELECT LEFT(UPPER(RTRIM(o.OdrElcCod)),3) Code3,MAX(o.OdrDtm) LastDtm\n"
        + "FROM dbo.OdrInf o\n"
        + "WHERE LTRIM(RTRIM(o.OdrChtNum))=@cht AND o.OdrDtm>=@from AND o.OdrDtm<@to AND o.OdrIncCod=30 AND o.OdrDelFlg='N' AND o.OdrCanYon='N'\n"
        + "GROUP BY LEFT(UPPER(RTRIM(o.OdrElcCod)),3)";

    /// <summary>
    /// 30일 안에 증상 줄 있는 내원이 없을 때만(REQ-7506): @from(오늘 30일 앞 0시) 전 외래 내원 가운데 증상 줄 있는 마지막 하나의 증상 줄.
    /// </summary>
    public const string LastBeforeSql =
        "SELECT RTRIM(c.OcmNum) VisitId,c.OcmAcpDtm,e.EmrShtSeq,e.EmrShtVal\n"
        + "FROM dbo.OcmInf c JOIN dbo.EmrInf e ON e.EmrOcmNum=c.OcmNum\n"
        + "WHERE e.EmrShtTyp='S' AND c.OcmNum=(SELECT TOP 1 c2.OcmNum FROM dbo.PbsInf b JOIN dbo.OcmInf c2 ON c2.OcmChtNum=b.PbsChtNum"
        + " WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c2.OcmAcpDtm<@from AND c2.OcmPatTyp='O' AND c2.OcmRsuYon<>'O'"
        + " AND EXISTS(SELECT 1 FROM dbo.EmrInf e2 WHERE e2.EmrOcmNum=c2.OcmNum AND e2.EmrShtTyp='S')"
        + " ORDER BY c2.OcmAcpDtm DESC,c2.OcmNum DESC)";

    private static readonly SqlParam[] Before =
    {
        new SqlParam("@cht", SqlParamKind.VarChar, 14),
        new SqlParam("@from", SqlParamKind.Char, 12),
    };

    private static readonly SqlParam[] Range =
    {
        new SqlParam("@cht", SqlParamKind.VarChar, 14),
        new SqlParam("@from", SqlParamKind.Char, 12),
        new SqlParam("@to", SqlParamKind.Char, 12),
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [VisitsSql] = Range,
        [LinesSql] = Range,
        [XraySql] = Range,
        [LastBeforeSql] = Before,
        [DiagnosisSql] = Range,
    };

    /// <summary>주사 차수 SQL 목록.</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 주사 차수 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }
}
