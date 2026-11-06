using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 의원 PC 확인 명령(--reception-check)만 돌리는 고정 문장(spec reception-phone design.md 1절, AC-1401.2·3·8).
/// 모두 SELECT 하나이고 자료 값은 상태·수납 코드·시:분·건수만 읽는다(차트번호·이름·메모 글을 읽지 않는다).
/// 도우미 허용 목록(Sql.IsAllowed)에는 넣지 않는다: 확인 모드 세션(Precheck.Windows.CheckBitDb)만
/// CheckSql.IsAllowed || ProbeSql.IsProbe || Sql.IsAllowed 로 받는다(AC-1401.9).
/// </summary>
public static class CheckSql
{
    /// <summary>칸 문장(TableColumns)이 칸을 읽는 네 표(AC-1401.3).</summary>
    public static readonly IReadOnlyList<string> Tables = Array.AsReadOnly(new[] { "OcmInf", "PbsInf", "OrcInf", "OdrInf" });

    /// <summary>
    /// 그날(@from~@to) 외래 접수 + 등록 병원 범위. 조건 글은 Sql.HistoryVisitsCte·ClaimDatesSql과 같고, 상태(OcmComStt)·
    /// 접수 취소(OcmRsuYon)로는 거르지 않는다(모르는 코드를 찾으려고). 찾기 틀(ProbeSql)도 이 글을 쓴다.
    /// </summary>
    internal const string TodayScope = @"c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>그날 범위 매개변수: @from·@to Char(12)(yyyyMMddHHmm), @hospital VarChar(32)(Sql의 Range와 같은 모양).</summary>
    internal static readonly SqlParam[] TodayRange =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12), new SqlParam("@hospital", SqlParamKind.VarChar, 32),
    };

    /// <summary>
    /// 상태 짝(AC-1401.2): 오늘 외래 접수를 (OcmComStt, OcmRsuYon)·접수 시:분(OcmAcpDtm 9~12번째 글자, HHmm)마다 센다.
    /// 칸: Status, Rsu, AcceptedHm, Visits. 시:분은 콘솔에만 보이고 보고서에는 짝·건수·고른 답만 적는다(CheckRunner).
    /// </summary>
    public const string StatusPairs = @"SELECT RTRIM(c.OcmComStt) Status,RTRIM(c.OcmRsuYon) Rsu,SUBSTRING(c.OcmAcpDtm,9,4) AcceptedHm,COUNT_BIG(*) Visits
FROM dbo.OcmInf c
WHERE " + TodayScope + @"
GROUP BY RTRIM(c.OcmComStt),RTRIM(c.OcmRsuYon),SUBSTRING(c.OcmAcpDtm,9,4)
ORDER BY Status,Rsu,AcceptedHm";

    /// <summary>칸 목록(AC-1401.3): dbo의 네 표(Tables)의 칸 이름·형식·길이. 자료 표는 읽지 않는다.</summary>
    public const string TableColumns = @"SELECT c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA='dbo' AND c.TABLE_NAME IN ('OcmInf','PbsInf','OrcInf','OdrInf')
ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION";

    /// <summary>
    /// 내원에 붙은 표(AC-1401.3): 이름이 OcmNum으로 끝나는 칸을 가진 dbo 기본 표의 칸 이름·형식·길이 전부.
    /// 증상·메모 찾기(ProbeSql.VisitLinked)가 이 답(ProbeSchema)의 표·칸 이름만 쓴다.
    /// </summary>
    public const string LinkedColumns = @"SELECT c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME AND t.TABLE_TYPE='BASE TABLE'
WHERE c.TABLE_SCHEMA='dbo'
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS k WHERE k.TABLE_SCHEMA='dbo' AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME LIKE '%OcmNum')
ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION";

    /// <summary>
    /// 상태별 처방 있는 접수 수(AC-1401.8): 오늘 외래 접수를 (OcmComStt, OcmRsuYon)마다 세고, 그 가운데 처방 줄이 있는 접수를 따로 센다.
    /// 처방 조건은 Sql.HistoryCodeSql과 같다. 칸: Status, Rsu, Visits, WithRx.
    /// </summary>
    public const string RxByStatus = @"SELECT RTRIM(c.OcmComStt) Status,RTRIM(c.OcmRsuYon) Rsu,COUNT_BIG(*) Visits,COUNT_BIG(r.Hit) WithRx
FROM dbo.OcmInf c
OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OdrInf o WHERE o.OdrOcmNum=c.OcmNum
  AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>'') r
WHERE " + TodayScope + @"
GROUP BY RTRIM(c.OcmComStt),RTRIM(c.OcmRsuYon)
ORDER BY Status,Rsu";

    /// <summary>
    /// 상태 내력(AC-1401.19): 범위(@from~@to, 지난 30일) 외래 접수를 OcmComStt마다 세고, 그 가운데 수납 줄(OrcInf.OrcOcmNum)이 있는 접수와
    /// 처방 줄(RxByStatus와 같은 조건)이 있는 접수를 따로 센다. 칸: Status, Visits, WithReceipt, WithRx.
    /// </summary>
    public const string StatusHistory = @"SELECT RTRIM(c.OcmComStt) Status,COUNT_BIG(*) Visits,COUNT_BIG(p.Hit) WithReceipt,COUNT_BIG(r.Hit) WithRx
FROM dbo.OcmInf c
OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OrcInf o WHERE o.OrcOcmNum=c.OcmNum) p
OUTER APPLY (SELECT TOP 1 1 Hit FROM dbo.OdrInf o WHERE o.OdrOcmNum=c.OcmNum
  AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>'') r
WHERE " + TodayScope + @"
GROUP BY RTRIM(c.OcmComStt)
ORDER BY Status";

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [StatusPairs] = TodayRange,
        [TableColumns] = new SqlParam[0],
        [LinkedColumns] = new SqlParam[0],
        [RxByStatus] = TodayRange,
        [StatusHistory] = TodayRange,
    };

    /// <summary>확인 문장 전부.</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 확인 문장과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 확인 문장이 아니면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }
}
