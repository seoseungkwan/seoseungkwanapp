using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Calendar;

/// <summary>
/// 예약 탭(spec clinic-calendar REQ-5903)이 비트 DB에 돌리는 SQL 넷. 원본에 없는 새 SELECT이고 모두 매개변수를 받는 읽기 전용 문장 하나다.
/// Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록도 보므로 ReadOnlyGuard를 지난다(청구 Sql.All에는 없다).
/// 센 접수는 통계 Visits 조건(외래 · WN·HN·TN·PN · OcmRsuYon ≠ 'O' · 이 병원 진료실), 비트 예약은 수납일지 다음 예약(SunapSql.NextReservationSql)과 같은 조건이다.
/// 환자 표에서는 차트번호·이름·성별·생일(찾기만)만 읽는다. 전화·주소·주민번호·메모는 읽지 않는다. 무거운 글자 처리는 SQL에서 하지 않는다.
/// 줄바꿈은 "\n"으로 적는다: 축자(verbatim) 여러 줄 글은 윈도우 받기(CRLF)에서 글이 달라져 GitHub 빌드 시험이 깨졌다(2026-11-17 helper-v0.9.1).
/// </summary>
public static class CalendarSql
{
    // 찾기 공통 머리: 환자마다 마지막 내원(센 접수 중 가장 늦은 날, 내일 0시 @until 전). 없으면 NULL
    private const string FindHead =
        "SELECT TOP 21 RTRIM(b.PbsChtNum),b.PbsPatNam,b.PbsSexTyp,b.PbsBirDte,l.LastDay\n"
        + "FROM dbo.PbsInf b\n"
        + "OUTER APPLY (SELECT MAX(LEFT(c.OcmAcpDtm,8)) LastDay FROM dbo.OcmInf c\n"
        + " WHERE c.OcmChtNum=b.PbsChtNum AND c.OcmAcpDtm<@until AND c.OcmPatTyp='O'\n"
        + "  AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) l\n";

    // 찾기 공통 꼬리: 이 병원 접수(상태 무관)가 한 번이라도 있는 환자만, 마지막 내원 늦은 차례(NULL은 뒤), 같으면 차트번호
    private const string FindTail =
        " AND EXISTS(SELECT 1 FROM dbo.OcmInf w WHERE w.OcmChtNum=b.PbsChtNum\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=w.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(w.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))\n"
        + "ORDER BY l.LastDay DESC,b.PbsChtNum";

    /// <summary>calfind 차트번호(q가 숫자 1~10자리): [차트번호, 이름, PbsSexTyp, PbsBirDte, 마지막 내원 yyyyMMdd|NULL], 21줄까지.</summary>
    public const string FindChartSql = FindHead + "WHERE RTRIM(b.PbsChtNum)=@q\n" + FindTail;

    /// <summary>
    /// calfind 이름 앞부분(q 두 글자 이상): FindChartSql과 같은 칸. q에는 LIKE 특수 글자(% _ [)가 없다(CalendarTargets가 거부한다).
    /// 비트 의원 DB에서 '두 글자 + %' COUNT는 연결 시간과 구별되지 않을 만큼 짧았다(2026-11-17, 환자 표 약 1만 2천 줄).
    /// </summary>
    public const string FindNameSql = FindHead + "WHERE b.PbsPatNam LIKE @q + '%'\n" + FindTail;

    /// <summary>calday 접수: 기간(@from ≤ 접수 시각 &lt; @to) 센 접수의 [날 yyyyMMdd, 차트번호], 중복 없음, 빈 차트번호 뺌.</summary>
    public const string CameSql =
        "SELECT DISTINCT LEFT(c.OcmAcpDtm,8),RTRIM(c.OcmChtNum)\n"
        + "FROM dbo.OcmInf c\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'\n"
        + "  AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)\n"
        + "  AND RTRIM(ISNULL(c.OcmChtNum,''))<>''";

    /// <summary>
    /// calday 비트 예약: 기간 이 병원 외래 접수 중 RsvInf 예약 줄('R'·빈 값)이 있거나 상태가 WR·NR·CR인 것, 취소(CN) 뺌 — [차트번호, 이름, 접수 시각 OcmAcpDtm].
    /// 이름은 환자 탭 예약 명단(ListSql.ReservationsSql)처럼 PbsInf에서 잇는다. 접수 시각 차례.
    /// </summary>
    public const string RsvSql =
        "SELECT RTRIM(c.OcmChtNum),b.PbsPatNam,c.OcmAcpDtm\n"
        + "FROM dbo.OcmInf c\n"
        + "LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum\n"
        + "OUTER APPLY (SELECT TOP 1 1 Found FROM dbo.RsvInf x\n"
        + "  WHERE x.RsvOcmNum=c.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND ISNULL(c.OcmComStt,'')<>'CN'\n"
        + "  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital\n"
        + "              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)\n"
        + "  AND (r.Found=1 OR c.OcmComStt IN ('WR','NR','CR'))\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    private static readonly SqlParam[] FindParameters =
    {
        new SqlParam("@q", SqlParamKind.VarChar, 20), new SqlParam("@until", SqlParamKind.Char, 12), Hospital,
    };

    private static readonly SqlParam[] DayParameters =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12), Hospital,
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [FindChartSql] = FindParameters,
        [FindNameSql] = FindParameters,
        [CameSql] = DayParameters,
        [RsvSql] = DayParameters,
    };

    /// <summary>예약 탭 SQL 목록(이 클래스의 SQL 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 예약 탭 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }
}
