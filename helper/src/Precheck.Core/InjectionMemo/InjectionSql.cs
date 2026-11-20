using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 주사 차수(spec injection-memo AC-7502.1)가 비트 DB에 돌리는 SQL 허용 목록. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록을 보므로
/// ReadOnlyGuard를 지난다(청구 Sql.All 밖). 원본에 없는 새 문장이고, 읽기 전용 SELECT 하나·매개변수만(글자 이어 붙이기 없음)·';' 없음·줄바꿈 \n이다.
/// 차트번호: dbo.PbsInf.PbsChtNum·OcmInf.OcmChtNum은 char(14) 오른쪽 맞춤이라 서류 인쇄(DocSql)처럼 PbsInf를 LTRIM(RTRIM(…))=@cht로 찾고
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
