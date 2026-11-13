using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;

namespace Erp.Core.Closing;

/// <summary>
/// ERP 마감일지 두 명령(closing.codes·closing.day, spec erp-closing-fill design.md 3-2)이 비트 DB에 돌리는 새 SELECT 아홉. 원본에 없는 문장이다.
/// 진료 조건은 모두 Sql.TrendCte의 V와 같다: 외래(OcmPatTyp='O')·접수취소 아님(OcmRsuYon≠'O')·끝난 상태 7개·병원 범위(DepMst, RevenueSql과 같음).
/// 처방 조건은 OdrDelFlg='N'·OdrCanYon='N'·OdrOutCod≠'99'.
/// 환자 표(PbsInf)에서는 차트번호·생년월일만 쓰고, 이름·전화·주민번호·주소·메모 칸은 읽지 않는다. 차트번호·생년월일은 결과 칸으로 내지 않고
/// 그날 안에서만 쓰는 번호(DENSE_RANK)·만 나이·센 수로 바꿔 낸다(AC-3606.2).
/// 모두 매개변수를 받는 SELECT 하나다. ERP 읽기 관문(Erp.Core.ErpReadGuard)이 이 표(Parameters)를 본다. 기존 관문(Bit/Sql.cs·ReadOnlyGuard)은
/// 고치지 않으므로 이 문장을 모른다(청구 Sql.All에도 없다, AC-3606.1).
/// closing.codes의 코드 목록은 CodeListSql 문장 하나다(TASK-16. 전에는 Sql.TrendTotalsSql·StatsSql.CodeNamesSql 두 문장으로 코드표 39만 줄을 받았다).
/// </summary>
public static class ClosingSql
{
    /// <summary>마감일지 문장 시간 제한: RevenueDays와 같다(원본 OperationalReportData.Command CommandTimeout=90).</summary>
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(90);

    /// <summary>
    /// closing.codes 코드 목록(CodeListSql) 시간 제한 50초(TASK-16, requirements 기본값 (하)). 접속 10초 + 등록 확인 15초 × 2 + 50 + 메모 목록 15초 = 105초라
    /// 확장이 기다리는 120초보다 먼저 도우미가 스스로 끝낸다(design.md 3-3).
    /// </summary>
    public static readonly TimeSpan CodesTimeout = TimeSpan.FromSeconds(50);

    /// <summary>주사 처음 문장의 코드 자리 수(@c0~@c19 = 묶음 코드 최대 20개). 빈 자리는 첫 코드로 채운다(관문은 NULL 값을 받지 않는다).</summary>
    public const int CodeSlots = 20;

    private const string CodeList = "@c0,@c1,@c2,@c3,@c4,@c5,@c6,@c7,@c8,@c9,@c10,@c11,@c12,@c13,@c14,@c15,@c16,@c17,@c18,@c19";

    // 그날(@from ≤ 접수 시각 < @to) 진료: Sql.TrendCte의 V와 같은 조건
    private const string DayVisitCte = @"WITH V AS (
 SELECT c.OcmNum,c.OcmChtNum,c.OcmAcpDtm,c.OcmDgsNfs FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
)";

    /// <summary>
    /// 그날 진료마다 [진료번호, 그날 번호(차트번호 차례 DENSE_RANK), 진찰구분, 만 나이, 마지막 정상 수납 줄 총진료비]. 접수 시각 차례.
    /// 만 나이 = PbsBirDte가 8자리 날짜이고 그날 이전이면 (그날 − 생년월일) / 10000, 아니면 NULL.
    /// 마지막 정상 수납 줄 = 그 진료의 OrpInf 가운데 OrpRcpStt≠'C'(미수입금 줄은 진료비 칸이 늘 0)이고 OrpRcpSeq가 가장 큰 줄(design.md 3-2), 없으면 NULL.
    /// </summary>
    public const string DayVisitsSql = DayVisitCte + @"
SELECT V.OcmNum,DENSE_RANK() OVER (ORDER BY RTRIM(V.OcmChtNum)) Person,RTRIM(V.OcmDgsNfs) DgsNfs,
 (SELECT MAX(CASE WHEN b.PbsBirDte LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' AND ISDATE(b.PbsBirDte)=1 AND b.PbsBirDte<=@day
   THEN (CONVERT(int,@day)-CONVERT(int,b.PbsBirDte))/10000 END) FROM dbo.PbsInf b WHERE b.PbsChtNum=V.OcmChtNum) Age,
 (SELECT TOP 1 p.OrpTotAmt FROM dbo.OrpInf p WHERE p.OrpOcmNum=V.OcmNum AND p.OrpRcpStt<>'C' ORDER BY p.OrpRcpSeq DESC) Total
FROM V
ORDER BY V.OcmAcpDtm,V.OcmNum";

    /// <summary>
    /// 그날 진료의 처방 [진료번호, 코드(UPPER·RTRIM), 줄 수, 금액]. 줄 수는 원내·원외 모든 줄(묶음 사람·주사 줄 수).
    /// 금액 = 원내(OdrOspTyp='I') 줄의 전체 수가 OdrDay × (OdrOutLab='S'면 OdrQty, 아니면 OdrDtrQty) × OdrPrc 합(TASK-14, requirements 기본값 (사)).
    /// 식은 RevenueSql.CodeAmounts와 글자까지 같다. 원외 줄·값이 빠진 줄은 NULL이라 SUM에서 빠지고(0), 모두 그러면 NULL(0으로 본다).
    /// </summary>
    public const string DayCodesSql = DayVisitCte + @"
SELECT o.OdrOcmNum,UPPER(RTRIM(o.OdrCod)) Code,COUNT_BIG(*) Lines,CAST(SUM(CASE WHEN o.OdrOspTyp='I' THEN CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc END) AS decimal(28,5)) Amount
FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
GROUP BY o.OdrOcmNum,UPPER(RTRIM(o.OdrCod))";

    /// <summary>
    /// 주사1회환자 수 하나: 그날 고른 주사 코드(@c0~@c19)를 받은 환자 가운데 @from 전 진료(같은 진료·처방 조건)에 그 코드가 하나도 없는 환자.
    /// 차트번호가 빈 진료는 그 전 기록과 견줄 수 없어 세지 않는다.
    /// </summary>
    public const string InjectionFirstSql = DayVisitCte + @", T AS (
 SELECT DISTINCT V.OcmChtNum FROM V JOIN dbo.OdrInf o ON o.OdrOcmNum=V.OcmNum
 WHERE RTRIM(ISNULL(V.OcmChtNum,''))<>''
   AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
   AND UPPER(RTRIM(o.OdrCod)) IN (" + CodeList + @")
)
SELECT COUNT_BIG(*) FROM T
WHERE NOT EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.OdrInf o ON o.OdrOcmNum=c.OcmNum
  WHERE c.OcmChtNum=T.OcmChtNum AND c.OcmAcpDtm<@from AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
    AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
    AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
                AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
    AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
    AND UPPER(RTRIM(o.OdrCod)) IN (" + CodeList + @"))";

    /// <summary>
    /// 수납일(@day ≤ 수납일 &lt; @nextDay) 기준 네 합(notes/bit-codes.md B절, 비트 수납집계 화면과 같은 칸):
    /// [미수발생 COO 현금, 할인 줄(DOD·DOE·DET·DNI·DN1·DN3·DN5) 현금, 장애인기금 OrpRcvBil, 환불 TPR 현금+카드+계좌].
    /// 돈 줄(OrcInf)은 FinanceNormal처럼 예치금(OrcPatTyp='R')을 빼고 UnsupportedFinance처럼 그 진료가 이 병원 범위인 것만,
    /// 장애인기금은 FinanceNormal의 Seq처럼 진료마다 그날 마지막 정상수납 줄(OrpRcpStt≠'C')만 더한다. 줄이 없으면 NULL(0으로 본다).
    /// </summary>
    public const string MoneyExtraSql = @"SELECT (SELECT SUM(r.OrcNewAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod='COO' AND r.OrcPatTyp<>'R'
   AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod
               WHERE c.OcmNum=r.OrcOcmNum AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) UnpaidNew,
 (SELECT SUM(r.OrcNewAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod IN ('DOD','DOE','DET','DNI','DN1','DN3','DN5') AND r.OrcPatTyp<>'R'
   AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod
               WHERE c.OcmNum=r.OrcOcmNum AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) Discount,
 (SELECT SUM(p.OrpRcvBil) FROM dbo.OrpInf p WHERE p.OrpRcpStt<>'C' AND p.OrpAccDte>=@day AND p.OrpAccDte<@nextDay
   AND p.OrpRcpSeq=(SELECT MAX(s.OrpRcpSeq) FROM dbo.OrpInf s
                    WHERE s.OrpOcmNum=p.OrpOcmNum AND s.OrpRcpStt<>'C' AND s.OrpAccDte>=@day AND s.OrpAccDte<@nextDay)
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=p.OrpDepCod AND d.DepHspNum=@hospital
               AND LEFT(p.OrpAccDte,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) DisabledFund,
 (SELECT SUM(r.OrcNewAmt+r.OrcCrdAmt+r.OrcChkAmt) FROM dbo.OrcInf r WHERE r.OrcAccDte>=@day AND r.OrcAccDte<@nextDay AND r.OrcCod='TPR' AND r.OrcPatTyp<>'R'
   AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod
               WHERE c.OcmNum=r.OrcOcmNum AND d.DepHspNum=@hospital AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) Refund";

    /// <summary>
    /// 그날 외래가 아닌 접수 수(이 의원은 늘 0, notes/bit-codes.md E절). 접수취소(OcmRsuYon='O')와 RevenueSql.Patients 첫 내원의 입원 쪽 조건처럼
    /// 취소 상태(VC·CN·CR)는 세지 않는다.
    /// </summary>
    public const string InpatientSql = @"SELECT COUNT_BIG(*) FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp<>'O' AND c.OcmRsuYon<>'O'
  AND c.OcmComStt NOT IN ('VC','CN','CR')
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    // 그날(@from ≤ 예약 일시 RsvDtm < @to) 예약 가운데 이어진 접수(RsvOcmNum)가 이 병원 범위인 것
    private const string ReservationScope = @"FROM dbo.RsvInf r JOIN dbo.OcmInf c ON c.OcmNum=r.RsvOcmNum
 WHERE r.RsvDtm>=@from AND r.RsvDtm<@to
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>
    /// 예약 메모 번호(RTRIM(RsvRefMem), 없으면 빈 글자)마다 [번호, 모두, 내원, 바꿈, 취소]. 메모 번호 차례.
    /// 내원 = 살아 있는 예약(RsvSts='OS')이고 이어진 접수가 진료 조건(외래·접수취소 아님·끝난 상태 7개)에 맞음. 취소 = RsvSts='OC'.
    /// 바꿈 = RsvLog에 그 예약의 기록(같은 차트번호, 바꾼 뒤 일시 = 이 예약 일시)이 있음. 예약 메모 글(RsvRefCmt)은 읽지 않는다.
    /// </summary>
    public const string ReservationKindsSql = @"WITH R AS (
 SELECT RTRIM(ISNULL(r.RsvRefMem,'')) Kind,
  CASE WHEN r.RsvSts='OS' AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') THEN 1 ELSE 0 END Visited,
  CASE WHEN EXISTS(SELECT 1 FROM dbo.RsvLog l WHERE l.RsvLogChtNum=r.RsvChtNum AND l.RsvLogARsvDtm=r.RsvDtm) THEN 1 ELSE 0 END Changed,
  CASE WHEN r.RsvSts='OC' THEN 1 ELSE 0 END Canceled
 " + ReservationScope + @"
)
SELECT Kind,COUNT_BIG(*) Total,SUM(Visited) Visited,SUM(Changed) Changed,SUM(Canceled) Canceled
FROM R GROUP BY Kind ORDER BY Kind";

    /// <summary>그날 예약이 있는 서로 다른 환자 수 하나(차트번호가 빈 예약은 세지 않는다).</summary>
    public const string ReservationPatientsSql = @"SELECT COUNT(DISTINCT NULLIF(RTRIM(r.RsvChtNum),''))
 " + ReservationScope;

    /// <summary>비트 예약 메모 목록 DtlMst RESERVMEMO [코드('Memo'+번호), 이름], 보이는 차례. 번호만 남기기는 ClosingCodes.MemoKind가 한다.</summary>
    public const string MemoKindsSql = "SELECT RTRIM(DtlCod),RTRIM(DtlCodNam) FROM dbo.DtlMst WHERE DtlTblCod='RESERVMEMO' ORDER BY DtlDspSeq,DtlCod";

    /// <summary>
    /// closing.codes 코드 목록 [코드, 진료 수, 이름](TASK-16, design.md 3-2 글 그대로). @from·@to = 어제까지 365일 반열린 기간 0시(Char 12),
    /// @first·@last = 그 기간 첫날·마지막 날(Char 8). 진료·처방 조건은 Sql.TrendCte의 V·R과 같고 코드는 앞뒤 공백을 뗀 대문자다.
    /// 이름은 그 1년에 쓴 코드의 비트 코드표(SeeMst) 줄만 읽어 StatsSql.CodeNamesSql과 같은 차례의 첫 줄을 고른다(없으면 NULL).
    /// 환자 표·차트번호는 읽지 않는다. 합치기·진료 수 차례·2,000개·이름 지우기는 ClosingCodes가 한다.
    /// </summary>
    public const string CodeListSql = @"WITH V AS (
 SELECT c.OcmNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), R AS (
 SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(LTRIM(RTRIM(o.OdrCod))) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
 WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
), T AS (SELECT RxCode,COUNT_BIG(*) Visits FROM R GROUP BY RxCode),
N AS (
 SELECT UPPER(LTRIM(RTRIM(s.SeeOdrCod))) Code,s.SeeKorNam Name,
  ROW_NUMBER() OVER (PARTITION BY UPPER(LTRIM(RTRIM(s.SeeOdrCod))) ORDER BY s.SeeOdrCod,
   CASE WHEN @last BETWEEN s.SeeAdpDte AND s.SeeExpDte THEN 0 ELSE 1 END,s.SeeAdpDte DESC,s.SeeExpDte DESC,s.SeeKorNam,s.SeeMdcTyp,s.SeeElcCod) Pick
 FROM dbo.SeeMst s
 WHERE s.SeeOdrCod<>'' AND s.SeeAdpDte<=@last AND s.SeeExpDte>=@first
   AND UPPER(LTRIM(RTRIM(s.SeeOdrCod))) IN (SELECT RxCode FROM T)
)
SELECT T.RxCode,T.Visits,N.Name FROM T LEFT JOIN N ON N.Code=T.RxCode AND N.Pick=1";

    /// <summary>closing.findCodes 시간 제한 15초(erp-closing-range design.md 10절).</summary>
    public static readonly TimeSpan FindTimeout = TimeSpan.FromSeconds(15);

    /// <summary>
    /// closing.findCodes(REQ-3708, erp-closing-range design.md 10절 글 그대로): 비트 코드표(SeeMst)에서 @day(도우미 PC 오늘)에 쓸 수 있는 줄 가운데
    /// 코드가 @starts(글자 + '%')에 맞거나 이름이 @contains('%' + 글자 + '%')에 맞는 코드를 [코드(앞뒤 공백 뗀 대문자), 이름]으로 코드 차례 30개.
    /// 환자 표는 읽지 않는다. 글자 안의 LIKE 글자(%·_·[)는 ClosingCodes.Find가 [%]·[_]·[[]로 바꿔 넣는다(문장 글은 그대로).
    /// </summary>
    public const string FindCodesSql = "SELECT TOP 30 UPPER(LTRIM(RTRIM(s.SeeOdrCod))) Code, MAX(s.SeeKorNam) Name FROM dbo.SeeMst s WHERE s.SeeOdrCod<>'' AND @day BETWEEN s.SeeAdpDte AND s.SeeExpDte AND (s.SeeOdrCod LIKE @starts OR s.SeeKorNam LIKE @contains) GROUP BY UPPER(LTRIM(RTRIM(s.SeeOdrCod))) ORDER BY Code";

    /// <summary>closing.findCodes LIKE 글 길이: 글자 20자의 %·_·[가 모두 세 글자([%])로 바뀌고 앞뒤 '%'를 더한 62자(20 × 3 + 2).</summary>
    public const int FindPatternSize = 62;

    private static readonly SqlParam Day = new SqlParam("@day", SqlParamKind.Char, 8);
    private static readonly SqlParam NextDay = new SqlParam("@nextDay", SqlParamKind.Char, 8);
    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);
    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    // 코드 목록 기간 첫날·마지막 날(CodeListSql 코드표 줄 고르기)
    private static readonly SqlParam First = new SqlParam("@first", SqlParamKind.Char, 8);
    private static readonly SqlParam Last = new SqlParam("@last", SqlParamKind.Char, 8);

    // 주사 코드 자리: commands.json closing.day codes의 한 코드 최대 20자
    private static readonly SqlParam[] Codes =
        Enumerable.Range(0, CodeSlots).Select(i => new SqlParam("@c" + i.ToString(CultureInfo.InvariantCulture), SqlParamKind.VarChar, 20)).ToArray();

    /// <summary>문장 → 그 문장에 실제로 있는 매개변수(design.md 3-2).</summary>
    public static IReadOnlyDictionary<string, SqlParam[]> Parameters { get; } = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [DayVisitsSql] = new[] { Day, From, To, Hospital },
        [DayCodesSql] = new[] { From, To, Hospital },
        [InjectionFirstSql] = new[] { From, To, Hospital }.Concat(Codes).ToArray(),
        [MoneyExtraSql] = new[] { Day, NextDay, Hospital },
        [InpatientSql] = new[] { From, To, Hospital },
        [ReservationKindsSql] = new[] { From, To, Hospital },
        [ReservationPatientsSql] = new[] { From, To, Hospital },
        [MemoKindsSql] = new SqlParam[0],
        [CodeListSql] = new[] { From, To, First, Last, Hospital },
    };

    // closing.findCodes LIKE 글(앞부분·가운데)
    private static readonly SqlParam Starts = new SqlParam("@starts", SqlParamKind.VarChar, FindPatternSize);
    private static readonly SqlParam Contains = new SqlParam("@contains", SqlParamKind.VarChar, FindPatternSize);

    /// <summary>
    /// closing.findCodes 문장 → 매개변수(@day·@starts·@contains 셋). ERP 읽기 관문(ErpReadGuard)이 Parameters와 함께 보는 문장 표다.
    /// Parameters(closing.codes·closing.day 문장 아홉)와 따로 둔다: 그 아홉은 기존 시험(ClosingSql.test.cs·ClosingFakes.test.cs, TASK-10 범위 밖)이 센다.
    /// </summary>
    public static IReadOnlyDictionary<string, SqlParam[]> FindParameters { get; } = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [FindCodesSql] = new[] { Day, Starts, Contains },
    };
}
