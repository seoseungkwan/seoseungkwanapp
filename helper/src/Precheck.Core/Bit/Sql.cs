using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Bit;

/// <summary>매개변수 종류(원본 SqlDbType 중 쓰는 것).</summary>
public enum SqlParamKind
{
    VarChar,
    Char,

    /// <summary>정수(원본 SqlDbType.Int). 값은 int만 받는다. 크기는 0.</summary>
    Int,
}

/// <summary>SQL 상수가 받는 매개변수 하나: 이름·종류·크기(원본 Parameters.Add 그대로).</summary>
public sealed class SqlParam
{
    public SqlParam(string name, SqlParamKind kind, int size)
    {
        Name = name;
        Kind = kind;
        Size = size;
    }

    public string Name { get; }

    public SqlParamKind Kind { get; }

    public int Size { get; }
}

/// <summary>
/// 도우미가 비트 DB에 돌리는 SQL 전부(AC-005.3). 문장은 원본에서 그대로 옮겼다(공백만 다를 수 있음, 사본은
/// helper/tests/Precheck.Core.Tests/Bit/original-sql/*.sql, 시험이 비교). 모두 매개변수를 받는 SELECT 하나다.
/// ReadOnlyGuard는 여기 있는 문장만 통과시킨다. 뒤 TASK가 읽기를 더할 때는 원본 문장과 사본·매개변수 표를 함께 더한다.
/// </summary>
public static class Sql
{
    /// <summary>비트 DB 접속 시간 제한(원본 ReadOnlyConnection ConnectTimeout=10, AC-005.2).</summary>
    public const int ConnectTimeoutSeconds = 10;

    /// <summary>메타 읽기(범위·기관기호·스냅숏 상태·기간 기관기호·통계 권한) 시간 제한(원본 CommandTimeout=15).</summary>
    public static readonly TimeSpan MetaTimeout = TimeSpan.FromSeconds(15);

    /// <summary>12개월 이력(원본 RxHistory.Command CommandTimeout=150).</summary>
    public static readonly TimeSpan HistoryTimeout = TimeSpan.FromSeconds(150);

    /// <summary>청구메모 읽기(원본 ClaimMemoHistory CommandTimeout=120). claim.dates 세기도 이 값을 쓴다.</summary>
    public static readonly TimeSpan MemoTimeout = TimeSpan.FromSeconds(120);

    /// <summary>상병 추세(원본 RxDiagnosisTrend.Command CommandTimeout=240).</summary>
    public static readonly TimeSpan TrendTimeout = TimeSpan.FromSeconds(240);

    /// <summary>병원 처방 목록(원본 PrescriptionCatalog CommandTimeout=25).</summary>
    public static readonly TimeSpan PrescriptionCatalogTimeout = TimeSpan.FromSeconds(25);

    /// <summary>LA 코드 목록(원본 LaCatalog CommandTimeout=20).</summary>
    public static readonly TimeSpan LaCatalogTimeout = TimeSpan.FromSeconds(20);

    /// <summary>원본 HospitalSecurity.Authorize: 비트 로그인 사용자의 그날 병원 범위(DepHspNum).</summary>
    public const string UserScopeSql =
        "SELECT DISTINCT RTRIM(d.DepHspNum) FROM dbo.UidMst u JOIN dbo.DepMst d ON u.UidDepCod=d.DepCod " +
        "WHERE u.UidCod=@user AND @workDate BETWEEN u.UidAdpDte AND u.UidExpDte AND @workDate BETWEEN d.DepAdpDte AND d.DepExpDte";

    /// <summary>원본 HospitalSecurity.Authorize·VerifyCurrentInstitution: DB 안의 모든 병원 범위(다른 병원이 섞였는지).</summary>
    public const string ScopesSql = "SELECT DISTINCT RTRIM(DepHspNum) FROM dbo.DepMst";

    /// <summary>원본 HospitalSecurity.VerifyInstitutionNumber: 그 범위의 그날 요양기관번호(HspMst.HspInsNum).</summary>
    public const string InstitutionSql =
        "SELECT RTRIM(HspInsNum) FROM dbo.HspMst WHERE RTRIM(HspCod)=@scope AND @day BETWEEN HspAdpDte AND HspExpDte";

    /// <summary>원본 RxHistory 등: 스냅숏 격리를 쓸 수 있는지(되돌리는 트랜잭션의 격리 수준을 고른다).</summary>
    public const string SnapshotStateSql = "SELECT snapshot_isolation_state FROM sys.databases WHERE database_id=DB_ID()";

    // ── 한 달 자료 읽기(TASK-8). 원본 문장을 그대로 옮겼다(공백만 다름) ─────────────────────────────

    /// <summary>
    /// 원본 TreatmentUsage.IdentitySql: 조회 기간에 그 범위의 기관기호가 등록한 것뿐인지(맞는 줄 수, 다른 줄 수).
    /// 원본 RxHistory·ClaimMemoHistory·RxDiagnosisTrend가 자료를 읽기 전에 돌린다.
    /// </summary>
    public const string PeriodIdentitySql = @"SELECT (SELECT COUNT_BIG(*) FROM dbo.HspMst h WHERE RTRIM(h.HspCod)=@scope AND RTRIM(h.HspInsNum)=@institution
   AND h.HspAdpDte<=@lastDay AND h.HspExpDte>=@firstDay),
 (SELECT COUNT_BIG(*) FROM dbo.HspMst h WHERE RTRIM(h.HspCod)=@scope
   AND (h.HspInsNum IS NULL OR RTRIM(h.HspInsNum)<>@institution)
   AND h.HspAdpDte<=@lastDay AND h.HspExpDte>=@firstDay)";

    /// <summary>원본 NativeReportAdapter.CheckPermissions: 비트 로그인 사용자의 통계 화면 권한.</summary>
    public const string UserPermissionsSql = "SELECT UgaExeNam, UgaExeLvl FROM UgaMst WHERE UgaCod = @user";

    // 원본 RxHistory.VisitsSql: 이번 기간(@focus~)에 온 환자만, 그 환자의 @from~ 외래·접수 취소 아님·진료 완료 내원
    private const string HistoryVisitsCte = @"WITH F AS (
 SELECT DISTINCT c.OcmChtNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@focus AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), V AS (
 SELECT c.OcmNum,c.OcmChtNum,c.OcmAcpDtm,c.OcmBilCmt FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND c.OcmChtNum IN (SELECT OcmChtNum FROM F)
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
)";

    /// <summary>원본 RxHistory.VisitSql: 12개월 이력의 내원·차트번호·날짜·청구메모.</summary>
    public const string HistoryVisitSql = HistoryVisitsCte + @" SELECT V.OcmNum VisitId,RTRIM(V.OcmChtNum) PatientId,LEFT(V.OcmAcpDtm,8) VisitDay,V.OcmBilCmt Memo FROM V";

    /// <summary>원본 RxHistory.CodeSql: 12개월 이력의 내원별 처방코드.</summary>
    public const string HistoryCodeSql = HistoryVisitsCte + @" SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    /// <summary>원본 ClaimMemoHistory.RowsSql: 기간의 비트 청구메모(claim.memos는 TASK-16이 쓴다).</summary>
    public const string MemoRowsSql = @"SELECT c.OcmNum VisitId,RTRIM(c.OcmChtNum) PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,c.OcmBilCmt Memo
FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmBilCmt IS NOT NULL AND c.OcmBilCmt<>''
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    // 원본 RxDiagnosisTrend.VisitsSql: 끝난 외래 내원 → 내원별 처방코드 × 내원별 상병코드(주·부·배제 중 가장 앞선 것)
    private const string TrendCte = @"WITH V AS (
 SELECT c.OcmNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), R AS (
 SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
 WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
), D AS (
 SELECT i.OicOcmNum VisitId,UPPER(RTRIM(i.OicElcCod)) DxCode,
        MIN(CASE RTRIM(ISNULL(i.OicIcdPri,'')) WHEN '1' THEN 1 WHEN '3' THEN 3 ELSE 2 END) DxRole,MAX(RTRIM(ISNULL(i.OicIcdNam,''))) DxName
 FROM dbo.OicInf i JOIN V ON V.OcmNum=i.OicOcmNum
 WHERE RTRIM(ISNULL(i.OicElcCod,''))<>'' GROUP BY i.OicOcmNum,UPPER(RTRIM(i.OicElcCod))
)";

    /// <summary>원본 RxDiagnosisTrend.CountSql: 기간의 끝난 외래 내원 수.</summary>
    public const string TrendCountSql = TrendCte + " SELECT COUNT_BIG(*) FROM V";

    /// <summary>원본 RxDiagnosisTrend.TotalsSql: 처방코드별 내원 수.</summary>
    public const string TrendTotalsSql = TrendCte + " SELECT RxCode,COUNT_BIG(*) FROM R GROUP BY RxCode";

    /// <summary>원본 RxDiagnosisTrend.PairsSql: 같은 내원에 함께 나온 처방-상병 짝(주·부·배제 수), @minimum번 이상.</summary>
    public const string TrendPairsSql = TrendCte + @" SELECT R.RxCode,D.DxCode,MAX(D.DxName),
 SUM(CASE WHEN D.DxRole=1 THEN 1 ELSE 0 END),SUM(CASE WHEN D.DxRole=2 THEN 1 ELSE 0 END),SUM(CASE WHEN D.DxRole=3 THEN 1 ELSE 0 END)
FROM R JOIN D ON D.VisitId=R.VisitId GROUP BY R.RxCode,D.DxCode HAVING COUNT_BIG(*)>=@minimum";

    /// <summary>원본 RxDiagnosisTrend.VisitRxSql: 규칙 제안용 내원별 처방코드(도우미 안에서만 쓰고 내보내지 않음).</summary>
    public const string TrendVisitRxSql = TrendCte + " SELECT R.VisitId,R.RxCode FROM R";

    /// <summary>원본 RxDiagnosisTrend.VisitDxSql: 규칙 제안용 내원별 상병코드·구분·이름(도우미 안에서만 쓰고 내보내지 않음).</summary>
    public const string TrendVisitDxSql = TrendCte + " SELECT D.VisitId,D.DxCode,D.DxRole,D.DxName FROM D";

    /// <summary>원본 PrescriptionCatalog.QuerySql: 오늘 유효한 병원 등록 처방코드(비트 전국 목록 제외).</summary>
    public const string PrescriptionCatalogSql = @"SELECT RTRIM(SeeOdrCod), RTRIM(SeeKorNam), RTRIM(SeeElcCod),
       RTRIM(SeeCodTyp), RTRIM(SeeCodDiv), RTRIM(SeeItmCod)
FROM dbo.SeeMst
WHERE SeeUidCod NOT LIKE 'BIT%' AND SeeUidCod <> 'Master'
  AND @today BETWEEN SeeAdpDte AND SeeExpDte
ORDER BY SeeOdrCod, SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam, SeeElcCod";

    /// <summary>원본 LaCatalog.QuerySql: LA로 시작하는 처방 마스터(코드·이름·지금 유효한지).</summary>
    public const string LaCatalogSql = @"SELECT RTRIM(SeeOdrCod), RTRIM(SeeKorNam),
       CASE WHEN @today BETWEEN SeeAdpDte AND SeeExpDte THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END
FROM dbo.SeeMst
WHERE UPPER(SeeOdrCod) LIKE @prefix
ORDER BY SeeOdrCod,
  CASE WHEN @today BETWEEN SeeAdpDte AND SeeExpDte THEN 0 ELSE 1 END,
  SeeAdpDte DESC, SeeExpDte DESC, SeeKorNam";

    /// <summary>원본 LaCatalog의 @prefix 값.</summary>
    public const string LaPrefix = "LA[0-9]%";

    /// <summary>
    /// claim.dates(새 SELECT, 원본에 없음): 날짜별 외래 진료 수와 비트 청구메모가 있는 진료 수. 방문 조건은 원본
    /// RxDiagnosisTrend·RxHistory의 V(외래·접수 취소 아님·진료 완료 상태·병원 범위), 메모 조건은 원본 ClaimMemoHistory.RowsSql 그대로.
    /// 차트번호·이름·메모 글은 읽지 않는다(숫자만, AC-008.5).
    /// </summary>
    public const string ClaimDatesSql = @"SELECT LEFT(c.OcmAcpDtm,8) VisitDay,COUNT_BIG(*) Visits,
 SUM(CASE WHEN c.OcmBilCmt IS NOT NULL AND c.OcmBilCmt<>'' THEN 1 ELSE 0 END) MemoInBit
FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
GROUP BY LEFT(c.OcmAcpDtm,8)";

    /// <summary>
    /// bit.input(새 SELECT, 원본에 없음, AC-035.1): 기간의 차트번호·내원일마다 OcmInf 줄 수. 조건은 기간뿐이다: ClaimDatesSql의 방문 조건 밖 줄(취소된 접수 등)도
    /// 내원내역에서 열리고 VisitOpener는 날짜가 맞는 첫 줄을 열기 때문이다. 차트번호는 도우미 안에서 견주는 데만 쓰고 답에 싣지 않는다. 이름·메모는 읽지 않는다.
    /// </summary>
    public const string InputVisitCountSql = @"SELECT RTRIM(c.OcmChtNum) PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,COUNT_BIG(*) Visits
FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to
GROUP BY RTRIM(c.OcmChtNum),LEFT(c.OcmAcpDtm,8)";

    private static readonly SqlParam[] FocusRange =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@focus", SqlParamKind.Char, 12),
        new SqlParam("@to", SqlParamKind.Char, 12), new SqlParam("@hospital", SqlParamKind.VarChar, 32),
    };

    private static readonly SqlParam[] Range =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12), new SqlParam("@hospital", SqlParamKind.VarChar, 32),
    };

    private static readonly SqlParam[] PeriodOnly =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12),
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [UserScopeSql] = new[] { new SqlParam("@user", SqlParamKind.VarChar, 8), new SqlParam("@workDate", SqlParamKind.Char, 8) },
        [ScopesSql] = new SqlParam[0],
        [InstitutionSql] = new[] { new SqlParam("@scope", SqlParamKind.VarChar, 32), new SqlParam("@day", SqlParamKind.Char, 8) },
        [SnapshotStateSql] = new SqlParam[0],
        [PeriodIdentitySql] = new[]
        {
            new SqlParam("@scope", SqlParamKind.VarChar, 32), new SqlParam("@institution", SqlParamKind.Char, 8),
            new SqlParam("@firstDay", SqlParamKind.Char, 8), new SqlParam("@lastDay", SqlParamKind.Char, 8),
        },
        [UserPermissionsSql] = new[] { new SqlParam("@user", SqlParamKind.VarChar, 100) },
        [HistoryVisitSql] = FocusRange,
        [HistoryCodeSql] = FocusRange,
        [MemoRowsSql] = Range,
        [TrendCountSql] = Range,
        [TrendTotalsSql] = Range,
        [TrendPairsSql] = Range.Concat(new[] { new SqlParam("@minimum", SqlParamKind.Int, 0) }).ToArray(),
        [TrendVisitRxSql] = Range,
        [TrendVisitDxSql] = Range,
        [PrescriptionCatalogSql] = new[] { new SqlParam("@today", SqlParamKind.Char, 8) },
        [LaCatalogSql] = new[] { new SqlParam("@today", SqlParamKind.Char, 8), new SqlParam("@prefix", SqlParamKind.VarChar, 8) },
        [ClaimDatesSql] = Range,
        [InputVisitCountSql] = PeriodOnly,
    };

    /// <summary>허용 목록(이 클래스의 SQL 상수 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 허용 목록의 문장과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 허용 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }
}
