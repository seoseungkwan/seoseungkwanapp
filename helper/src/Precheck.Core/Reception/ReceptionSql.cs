using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.Reception;

/// <summary>
/// 접수 현황(spec reception-phone design.md 3절)이 비트 DB에 돌리는 문장 전부(AC-1403.1·AC-1403.7·AC-1404.6). 모두 매개변수를 받는 SELECT 하나다.
/// 표·칸은 이 저장소의 다른 허용 문장(Sql·StatsSql·RevenueSql)이 이미 읽는 것과, 의원 PC 확인 결과로 채운 칸(ReceptionMap.Columns:
/// 이름·생년월일·성별·접수 메모·수납 시각·증상, TodayPeople·TodayMemos·TodayPaid·VisitSymptoms, REQ-1410)뿐이다. 내원(OcmInf)은 읽는 곳마다 등록 병원 범위(DepMst.DepHspNum=@hospital) 안에서만 읽고, 처방(OdrInf)은 그 내원에 붙여서만 읽는다.
/// 지난 내원의 완료 조건은 Sql.HistoryVisitSql, 처방 줄 조건은 Sql.HistoryCodeSql과 같다. SQL Server 2008 R2에서 돌도록 OFFSET·FETCH 없이 ROW_NUMBER()로 자르고,
/// 차트번호는 함수 없이 견준다(색인을 쓰게, spec bit-read-speed와 같은 까닭). Sql.IsAllowed·Sql.ParametersOf가 Parameters 표를 묻는다.
/// </summary>
public static class ReceptionSql
{
    // 내원 한 줄(c)이 등록 병원 범위 안인가. Sql.HistoryVisitSql과 같은 글
    private const string InHospital = @"EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    // 끝난 외래 내원(c). Sql.HistoryVisitSql의 V와 같은 조건
    private const string DoneVisit = @"c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')";

    // 살아 있는 처방 줄(o). Sql.HistoryCodeSql과 같은 조건
    private const string RxRow = @"o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    // T: 오늘(@from~@to) 이 병원 외래 접수 전부. 상태로 거르지 않는다(칸 나누기·숨기기는 ReceptionMap이 한다)
    private const string TodayCte = @"WITH T AS (
 SELECT c.OcmNum,c.OcmChtNum,c.OcmAcpDtm,c.OcmComStt,c.OcmRsuYon FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
   AND " + InHospital + @"
)";

    // P: 오늘 접수마다 그 접수 시각보다 앞선 같은 환자의 끝난 내원. Seq=1이 가장 최근 것, Earlier는 앞선 내원 수
    private const string PriorCte = TodayCte + @", P AS (
 SELECT T.OcmNum TodayVisitId,c.OcmNum,c.OcmAcpDtm,
        ROW_NUMBER() OVER (PARTITION BY T.OcmNum ORDER BY c.OcmAcpDtm DESC,c.OcmNum DESC) Seq,
        COUNT_BIG(*) OVER (PARTITION BY T.OcmNum) Earlier
 FROM T JOIN dbo.OcmInf c ON c.OcmChtNum=T.OcmChtNum
 WHERE T.OcmChtNum<>'' AND c.OcmAcpDtm<T.OcmAcpDtm AND " + DoneVisit + @"
   AND " + InHospital + @"
)";

    // H: 그 환자(@chart)의 그 접수(@before = 그 접수의 OcmAcpDtm 원값)보다 앞선 끝난 내원, 최근 순 번호(1부터)
    private const string HistoryCte = @"WITH H AS (
 SELECT c.OcmNum,c.OcmAcpDtm,ROW_NUMBER() OVER (ORDER BY c.OcmAcpDtm DESC,c.OcmNum DESC) Seq FROM dbo.OcmInf c
 WHERE c.OcmChtNum=@chart AND c.OcmAcpDtm<@before AND " + DoneVisit + @"
   AND " + InHospital + @"
)";

    /// <summary>오늘 외래 접수 전부: 내원번호·차트번호·접수 시각(OcmAcpDtm 원값)·상태 코드·OcmRsuYon.</summary>
    public const string TodayVisits = TodayCte + @"
SELECT T.OcmNum VisitId,RTRIM(T.OcmChtNum) PatientId,T.OcmAcpDtm AcceptedAt,RTRIM(T.OcmComStt) Status,RTRIM(T.OcmRsuYon) Rsu FROM T";

    /// <summary>오늘 접수의 처방 코드(내원마다 한 번씩).</summary>
    public const string TodayRx = TodayCte + @"
SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN T ON T.OcmNum=o.OdrOcmNum
WHERE " + RxRow;

    /// <summary>오늘 접수마다 앞선 끝난 내원 수와 가장 최근 것(내원번호·날짜 yyyyMMdd). 앞선 내원이 없는 접수는 줄이 없다.</summary>
    public const string PriorVisits = PriorCte + @"
SELECT P.TodayVisitId,P.Earlier EarlierCount,P.OcmNum LastVisitId,LEFT(P.OcmAcpDtm,8) LastDay FROM P WHERE P.Seq=1";

    /// <summary>가장 최근 지난 내원의 처방 코드.</summary>
    public const string PriorRx = PriorCte + @"
SELECT DISTINCT o.OdrOcmNum LastVisitId,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN P ON P.OcmNum=o.OdrOcmNum
WHERE P.Seq=1 AND " + RxRow;

    /// <summary>
    /// 처방 이름표: 코드(UPPER(RTRIM), 처방 문장의 RxCode와 같은 모양)마다 적용일(SeeAdpDte)이 가장 늦은 이름 한 줄(RevenueSql.CodeAmounts와 같은 규칙).
    /// 적용일이 같으면 끝일이 늦은 것, 그다음 이름 순. 하루 한 번 읽는다(BoardCache).
    /// </summary>
    public const string RxNames = @"WITH N AS (
 SELECT UPPER(RTRIM(s.SeeOdrCod)) Code,RTRIM(s.SeeKorNam) Name,s.SeeAdpDte AdpDte,
        ROW_NUMBER() OVER (PARTITION BY UPPER(RTRIM(s.SeeOdrCod)) ORDER BY s.SeeAdpDte DESC,s.SeeExpDte DESC,s.SeeKorNam) Seq
 FROM dbo.SeeMst s WHERE RTRIM(ISNULL(s.SeeOdrCod,''))<>''
)
SELECT N.Code,N.Name,N.AdpDte FROM N WHERE N.Seq=1";

    /// <summary>상세: 그 접수보다 앞선 끝난 내원 수와 가장 이른 날(yyyyMMdd, 없으면 NULL).</summary>
    public const string HistoryCount = @"SELECT COUNT_BIG(*) Count,LEFT(MIN(c.OcmAcpDtm),8) FirstDay FROM dbo.OcmInf c
WHERE c.OcmChtNum=@chart AND c.OcmAcpDtm<@before AND " + DoneVisit + @"
  AND " + InHospital;

    /// <summary>상세 한 쪽: 최근 순 @first~@last번째(1부터, 둘 다 포함) 지난 내원의 내원번호·날짜와 처방 코드(처방이 없으면 RxCode NULL 한 줄).</summary>
    public const string HistoryPage = HistoryCte + @", R AS (
 SELECT DISTINCT o.OdrOcmNum,UPPER(RTRIM(o.OdrCod)) RxCode FROM dbo.OdrInf o JOIN H ON H.OcmNum=o.OdrOcmNum
 WHERE H.Seq BETWEEN @first AND @last AND " + RxRow + @"
)
SELECT H.OcmNum VisitId,LEFT(H.OcmAcpDtm,8) VisitDay,R.RxCode FROM H LEFT JOIN R ON R.OdrOcmNum=H.OcmNum
WHERE H.Seq BETWEEN @first AND @last ORDER BY H.Seq,R.RxCode";

    // ---- 의원 PC 확인 결과로 채운 칸(REQ-1410, ReceptionMap.Columns와 같은 이름, TASK-29) ----------------------------------

    /// <summary>오늘 접수의 사람 칸: 이름(PbsPatNam)·생년월일(PbsBirDte, yyyyMMdd)·성별(PbsSexTyp, F/M). 차트번호(함수 없이)로 PbsInf에 잇는다. 주민번호는 읽지 않는다.</summary>
    public const string TodayPeople = TodayCte + @"
SELECT T.OcmNum VisitId,RTRIM(p.PbsPatNam) Name,RTRIM(p.PbsBirDte) BirthDate,RTRIM(p.PbsSexTyp) Sex FROM T
JOIN dbo.PbsInf p ON p.PbsChtNum=T.OcmChtNum WHERE T.OcmChtNum<>''";

    /// <summary>오늘 접수의 접수 메모(OcmRefCmt). text 형이어도 읽게 nvarchar(max)로 바꾼다.</summary>
    public const string TodayMemos = @"SELECT c.OcmNum VisitId,RTRIM(CAST(c.OcmRefCmt AS nvarchar(max))) Memo FROM dbo.OcmInf c
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
  AND " + InHospital;

    /// <summary>오늘 접수의 수납 시각: 내원마다 가장 늦은 OrcInf.OrcUpdDtm(char 12, yyyyMMddHHmm) 하나(AC-1410.3). 수납 줄이 없는 내원은 줄이 없다.</summary>
    public const string TodayPaid = TodayCte + @"
SELECT r.OrcOcmNum VisitId,MAX(r.OrcUpdDtm) PaidAt FROM dbo.OrcInf r JOIN T ON T.OcmNum=r.OrcOcmNum
GROUP BY r.OrcOcmNum";

    /// <summary>
    /// 상세 한 쪽의 증상 줄(AC-1410.4, 확인 보고서 3회차): HistoryPage와 같은 H 창의 최근 순 @first~@last번째 지난 내원과 그 접수
    /// (같은 차트번호·OcmAcpDtm=@before 원값·외래·병원 범위)마다, 내원번호 칸 EmrOcmNum으로 이은 EmrInf에서 EmrShtTyp='S'이고 빈 글 아닌
    /// EmrShtVal 줄. 내원마다 EmrUpdDtm 순(같으면 DB가 주는 차례). SQL Server 2008 R2라 잇기는 도우미(HistoryReader)가 공백 하나로 한다.
    /// </summary>
    public const string VisitSymptoms = HistoryCte + @", V AS (
 SELECT H.OcmNum FROM H WHERE H.Seq BETWEEN @first AND @last
 UNION ALL
 SELECT c.OcmNum FROM dbo.OcmInf c
 WHERE c.OcmChtNum=@chart AND c.OcmAcpDtm=@before AND c.OcmPatTyp='O'
   AND " + InHospital + @"
)
SELECT V.OcmNum VisitId,CAST(e.EmrShtVal AS nvarchar(max)) Line FROM V JOIN dbo.EmrInf e ON e.EmrOcmNum=V.OcmNum
WHERE e.EmrShtTyp='S' AND LEN(LTRIM(CAST(e.EmrShtVal AS nvarchar(max))))>0
ORDER BY V.OcmNum,e.EmrUpdDtm";

    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);
    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);
    private static readonly SqlParam Chart = new SqlParam("@chart", SqlParamKind.VarChar, 14);
    private static readonly SqlParam Before = new SqlParam("@before", SqlParamKind.VarChar, 20);
    private static readonly SqlParam First = new SqlParam("@first", SqlParamKind.Int, 0);
    private static readonly SqlParam Last = new SqlParam("@last", SqlParamKind.Int, 0);

    private static readonly SqlParam[] Today = { From, To, Hospital };

    /// <summary>문장 → 그 문장에 실제로 있는 매개변수(design.md 3절 표). ReadOnlyGuard는 이 표의 문장을 표의 매개변수와 함께만 통과시킨다.</summary>
    public static IReadOnlyDictionary<string, SqlParam[]> Parameters { get; } = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [TodayVisits] = Today,
        [TodayRx] = Today,
        [PriorVisits] = Today,
        [PriorRx] = Today,
        [RxNames] = new SqlParam[0],
        [HistoryCount] = new[] { Chart, Before, Hospital },
        [HistoryPage] = new[] { Chart, Before, Hospital, First, Last },
        [TodayPeople] = Today,
        [TodayMemos] = Today,
        [TodayPaid] = Today,
        [VisitSymptoms] = new[] { Chart, Before, Hospital, First, Last },
    };
}
