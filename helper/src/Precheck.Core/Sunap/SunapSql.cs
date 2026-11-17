using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;

namespace Precheck.Core.Sunap;

/// <summary>
/// 수납일지 하루 장부(contact.targets kind 'sunap', spec sunap-ilji REQ-4902)가 읽는 SQL. 모두 읽기 전용 SELECT 하나이고 ReadOnlyGuard 허용 목록에 든다(Sql.IsAllowed).
/// 새로 지은 조건은 다음 예약과 건강생활유지비(QCV, spec sunap-health) 둘이다. 나머지는 이미 쓰는 문장을 글자 바꾸기로 잘라 쓴다: 센 내원·첫 내원은 통계 VisitRowsSql의 Visits 글,
/// 처방은 그 Orders 줄, 금액은 매출 FinanceNormal(내원별로), 미수 입금은 매출 FinanceReceivable(환자별로).
/// 원본 글이 바뀌어 바꿀 자리가 정확히 한 군데가 아니면 도우미가 뜨자마자 멈춘다(조용히 다른 뜻의 SQL이 되지 않게).
/// 날 매개변수: @from·@to = 그날 0시·다음 날 0시(yyyyMMddHHmm), @day·@nextDay = 그날·다음 날(yyyyMMdd), @hospital = 등록 병원 범위.
/// </summary>
public static class SunapSql
{
    private const string OrdersStart = ", Orders AS (";
    private const string VisitRowsSelect = "SELECT o.PatientId,o.VisitDay,o.Code,LEFT(f.FirstDtm,8) FirstDay";
    private const string NormalTotal = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt) FROM NativeRows";
    private const string ReceivableTotal = "SELECT SUM(OrpTotAmt),SUM(OrpCorAmt),SUM(OrpNonAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows";
    private const string ReceivableRowStart = "SELECT p.OrpOcmNum,p.OrpChtNum,p.OrpTotAmt";

    /// <summary>통계 Visits 글(PeriodVisits·Patients·FirstVisits): 그날 센 외래 내원과 환자마다 첫 내원.</summary>
    private static readonly string VisitsCte = Before(StatsSql.VisitRowsSql, OrdersStart);

    /// <summary>위 글 + 통계 Orders 줄(그날 센 내원의 처방, 삭제·취소·원외 99 뺌).</summary>
    private static readonly string OrdersCte = Before(StatsSql.VisitRowsSql, VisitRowsSelect);

    /// <summary>
    /// 환자마다 [차트번호, 이름, 그날 첫 접수 yyyyMMddHHmm, 첫 내원일 yyyyMMdd|null, 그날 90일초진(OcmDgsNfs='3') 접수 수,
    /// 진료의 코드(그날 센 내원들의 OcmDtrCod 중 빈 값 뺀 가장 작은 것, 없으면 NULL, spec sunap-doctors REQ-5002)].
    /// </summary>
    public static readonly string PatientsSql = VisitsCte + @"
SELECT v.PatientId,MAX(b.PbsPatNam) PatName,MIN(c.OcmAcpDtm) FirstAcp,LEFT(MIN(f.FirstDtm),8) FirstDay,
 SUM(CASE WHEN c.OcmDgsNfs='3' THEN 1 ELSE 0 END) First90,MIN(NULLIF(RTRIM(c.OcmDtrCod),'')) DoctorId
FROM PeriodVisits v JOIN dbo.OcmInf c ON c.OcmNum=v.VisitId
LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId
LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=v.PatientId
WHERE v.PatientId IS NOT NULL
GROUP BY v.PatientId";

    /// <summary>[차트번호, 처방코드] 줄들(그날 센 내원의 처방, 같은 환자·같은 코드는 한 번).</summary>
    public static readonly string CodesSql = OrdersCte + @"
SELECT o.PatientId,o.Code FROM Orders o";

    /// <summary>
    /// 환자마다 [차트번호, 다음 예약 접수 시각 yyyyMMddHHmm, 예약 메모 앞 40자]. 다음 날 0시(@to) 이후 같은 차트번호의 이 병원 외래 접수 중
    /// 예약 줄(RsvInf 'R'·빈 값)이 있거나 상태가 WR·NR·CR인 것, 취소(CN) 빼고 가장 이른 하나. 환자 탭 예약 명단(ListSql.ReservationsSql)과 같은 RsvInf 조건이다.
    /// </summary>
    public static readonly string NextReservationSql = VisitsCte + @"
SELECT p.PatientId,n.OcmAcpDtm,n.Memo
FROM Patients p
CROSS APPLY (SELECT TOP 1 w.OcmAcpDtm,LEFT(RTRIM(CONVERT(nvarchar(4000),r.RsvRefCmt)),40) Memo
 FROM dbo.OcmInf w
 OUTER APPLY (SELECT TOP 1 1 Found,x.RsvRefCmt FROM dbo.RsvInf x
  WHERE x.RsvOcmNum=w.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r
 WHERE w.OcmChtNum=p.PatientId AND w.OcmAcpDtm>=@to AND w.OcmPatTyp='O' AND ISNULL(w.OcmComStt,'')<>'CN'
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=w.OcmDepCod AND d.DepHspNum=@hospital
              AND LEFT(w.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
  AND (r.Found=1 OR w.OcmComStt IN ('WR','NR','CR'))
 ORDER BY w.OcmAcpDtm,w.OcmNum) n";

    /// <summary>
    /// 매출 FinanceNormal의 끝 SELECT만 내원(OrpOcmNum)별로: [내원번호, 차트번호, 총진료비, 현금 CashAmt, 카드 CardAmt, 계좌 CheckAmt, 본인부담 총액 OrpTotOwn].
    /// 내원 하나가 두 줄이면(정상수납 중복) 본인부담은 MAX로 한 번만 센다. 그런 날은 FinanceMultiplicity가 이미 확인 필요로 잡는다.
    /// </summary>
    public static readonly string MoneySql = Regroup(
        RevenueSql.FinanceNormal,
        NormalTotal,
        "SELECT OrpOcmNum,OrpChtNum,SUM(OrpTotAmt),SUM(CashAmt),SUM(CardAmt),SUM(CheckAmt),MAX(OrpTotOwn) FROM NativeRows GROUP BY OrpOcmNum,OrpChtNum");

    /// <summary>
    /// 건강생활유지비(spec sunap-health REQ-5401): 그날 수납한 비트 OrcInf의 OrcCod='QCV' 줄 OrcNewAmt를 내원·차트별로 더한다 [내원번호, 차트번호, QCV 합].
    /// 병원·센 내원은 이 글이 거르지 않는다. SunapTargets가 MoneySql에 나온 그 차트의 내원 번호 것만 센다. @hospital은 쓰지 않아도 같은 날 묶음(DayParameters)을 받는다.
    /// </summary>
    // 줄바꿈은 \n으로 적는다: @"…" 여러 줄 글은 윈도우 받기(CRLF)에서 글이 달라져 GitHub 빌드 시험이 깨졌다(2026-11-17)
    public const string HealthSql =
        "SELECT o.OrcOcmNum,o.OrcChtNum,SUM(o.OrcNewAmt)\n"
        + "FROM dbo.OrcInf o\n"
        + "WHERE o.OrcCod='QCV' AND o.OrcAccDte>=@day AND o.OrcAccDte<@nextDay\n"
        + "GROUP BY o.OrcOcmNum,o.OrcChtNum";

    /// <summary>
    /// 매출 FinanceReceivable(그날 예전 미수를 낸 것)의 NativeRows 줄 머리에 이름·수납 시각을 더하고 끝 SELECT만 환자(OrpChtNum)별로:
    /// [차트번호, 이름, 가장 이른 수납 시각 OrpAccDte, 총진료비, 미수입금 현금 CorAmt, 카드 CorCrdAmt, 계좌 CorChkAmt].
    /// </summary>
    public static readonly string PaidSql = Regroup(
        ReplaceOnce(RevenueSql.FinanceReceivable, ReceivableRowStart, "SELECT p.OrpOcmNum,p.OrpChtNum,pb.PbsPatNam PatName,p.OrpAccDte PaidAt,p.OrpTotAmt"),
        ReceivableTotal,
        "SELECT OrpChtNum,MAX(PatName),MIN(PaidAt),SUM(OrpTotAmt),SUM(CorAmt),SUM(CorCrdAmt),SUM(CorChkAmt) FROM NativeRows GROUP BY OrpChtNum");

    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    private static readonly SqlParam[] VisitParameters =
    {
        new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12), Hospital,
    };

    private static readonly SqlParam[] DayParameters =
    {
        new SqlParam("@day", SqlParamKind.Char, 8), new SqlParam("@nextDay", SqlParamKind.Char, 8), Hospital,
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [PatientsSql] = VisitParameters,
        [CodesSql] = VisitParameters,
        [NextReservationSql] = VisitParameters,
        [MoneySql] = DayParameters,
        [HealthSql] = DayParameters,
        [PaidSql] = DayParameters,
    };

    /// <summary>수납일지 SQL 목록(이 클래스의 SQL 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 수납일지 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }

    /// <summary>part가 정확히 한 번 나오는 자리 앞까지(끝 빈칸 뺌). 아니면 InvalidOperationException.</summary>
    private static string Before(string text, string part) => text.Substring(0, OnlyIndex(text, part)).TrimEnd();

    /// <summary>text가 tail로 끝나고 tail이 한 번만 나올 때 그것을 replacement로 바꾼다. 아니면 InvalidOperationException.</summary>
    private static string Regroup(string text, string tail, string replacement)
    {
        if (!text.EndsWith(tail, StringComparison.Ordinal)) throw new InvalidOperationException("sunap SQL source total changed");
        return ReplaceOnce(text, tail, replacement);
    }

    /// <summary>part가 정확히 한 번 나올 때만 replacement로 바꾼다. 없거나 둘 이상이면 InvalidOperationException.</summary>
    private static string ReplaceOnce(string text, string part, string replacement)
    {
        var index = OnlyIndex(text, part);
        return text.Substring(0, index) + replacement + text.Substring(index + part.Length);
    }

    private static int OnlyIndex(string text, string part)
    {
        var index = text.IndexOf(part, StringComparison.Ordinal);
        if (index < 0 || text.IndexOf(part, index + 1, StringComparison.Ordinal) >= 0) throw new InvalidOperationException("sunap SQL source changed");
        return index;
    }
}
