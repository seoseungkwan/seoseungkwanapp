using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;

namespace Precheck.Core.Contact;

/// <summary>
/// 환자 탭 비트 명단 두 도구(spec patients-bit-lists REQ-2801)가 비트 DB에 돌리는 SQL과 같이 쓰는 줄 다루기. 원본에 없는 새 SELECT 둘이다.
/// 센 접수(외래 · WN·HN·TN·PN · OcmRsuYon ≠ 'O' · 이 병원 진료실)는 원래 도구 LapsedPatients.Visits와 같은 조건이다.
/// 예약은 비트 절차(bit_sp_OutPatient_Appointment: RsvInf ON OcmNum = RsvOcmNum, OcmComStt IN ('WR','NR'), RsvSts &lt;&gt; 'OC')와
/// 의원 PC 확인(예약 대기 = WR, 오지 않은 예약 = CR)에서 왔다. 비트 칸이 이 의원에 정말 그대로인지는 첫 실행 때 비트 예약 화면과 견준다(design.md '위험').
/// 모두 매개변수를 받는 SELECT 하나다. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록도 보므로 ReadOnlyGuard를 지난다(청구 Sql.All에는 없다).
/// 이름(PbsPatNam)·전화(PbsCelPhn·PbsPhnNum)만 읽고 주민번호·주소·메모(OcmRefCmt·RsvRefCmt)는 읽지 않는다(AC-2801.4).
/// </summary>
public static class ListSql
{
    /// <summary>명단 SQL 시간 제한. 장기 미방문은 모든 내원 내력을 훑는다(원래 도구와 같음).</summary>
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(150);

    /// <summary>
    /// 예약 줄(AC-2801.2): 기간(@from ≤ 접수 시각 &lt; @to) 이 병원 외래 접수 중 RsvInf 예약 줄(RsvDivTyp 'R'·빈 값, 한 접수에 한 줄)이 있거나 상태가 WR·NR·CR인 것.
    /// 칸: 차트번호·이름·휴대전화·집 전화·예약 시각(OcmAcpDtm)·상태(OcmComStt)·예약 표시(RsvSts)·그날 옴·그 뒤 처음 온 날.
    /// 그날 옴 = 그 접수가 센 접수이거나 같은 차트번호로 그날 센 접수가 있음. 그 뒤 처음 온 날 = 예약 날 다음 날부터 오늘(@until = 내일 0시 전)까지 센 접수 중 가장 이른 날.
    /// 차트번호가 빈 접수는 다른 접수와 견주지 않는다(빈 글끼리 같은 환자로 보지 않게).
    /// </summary>
    public const string ReservationsSql = @"SELECT c.OcmChtNum,b.PbsPatNam,b.PbsCelPhn,b.PbsPhnNum,c.OcmAcpDtm,c.OcmComStt,r.RsvSts,
 CASE WHEN (c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O')
   OR (RTRIM(ISNULL(c.OcmChtNum,''))<>'' AND EXISTS(SELECT 1 FROM dbo.OcmInf v
     WHERE v.OcmChtNum=c.OcmChtNum AND LEFT(v.OcmAcpDtm,8)=LEFT(c.OcmAcpDtm,8)
       AND v.OcmPatTyp='O' AND v.OcmComStt IN ('WN','HN','TN','PN') AND v.OcmRsuYon<>'O'
       AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=v.OcmDepCod AND d.DepHspNum=@hospital
                   AND LEFT(v.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte))) THEN 1 ELSE 0 END Came,
 (SELECT MIN(LEFT(v.OcmAcpDtm,8)) FROM dbo.OcmInf v
   WHERE RTRIM(ISNULL(c.OcmChtNum,''))<>'' AND v.OcmChtNum=c.OcmChtNum
     AND LEFT(v.OcmAcpDtm,8)>LEFT(c.OcmAcpDtm,8) AND v.OcmAcpDtm<@until
     AND v.OcmPatTyp='O' AND v.OcmComStt IN ('WN','HN','TN','PN') AND v.OcmRsuYon<>'O'
     AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=v.OcmDepCod AND d.DepHspNum=@hospital
                 AND LEFT(v.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) CameAfter
FROM dbo.OcmInf c
LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum
OUTER APPLY (SELECT TOP 1 1 Found,x.RsvSts FROM dbo.RsvInf x
  WHERE x.RsvOcmNum=c.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r
WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
  AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
  AND (r.Found=1 OR c.OcmComStt IN ('WR','NR','CR'))
ORDER BY c.OcmAcpDtm,c.OcmNum";

    /// <summary>
    /// 장기 미방문 줄(AC-2801.3): 오늘 0시(@today) 전 모든 센 접수로 환자마다 마지막 내원일·진료 받은 날 수를 세고, 날 수 2 이상이며
    /// 마지막 내원일이 @from~@to(YYYYMMDD)인 환자만. 처방 하나에 한 줄이고(처방이 없으면 처방 칸이 빈 한 줄) 환자 칸은 줄마다 같다.
    /// 칸: 차트번호·이름·휴대전화·집 전화·마지막 내원일·날 수·예약 있음(오늘 0시부터 WR·NR 접수)·처방코드·처방 이름(그 날 쓰던 SeeMst 이름).
    /// 처방은 마지막 내원일의 센 접수에 붙은 것(OdrDelFlg='N' · OdrCanYon='N' · OdrOutCod ≠ '99', 원래 도구와 같은 조건)이고 접수 시각 → 처방 차례로 준다.
    /// </summary>
    public const string LapsedSql = @"WITH AllVisits AS (
 SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,c.OcmAcpDtm VisitDtm
 FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm<@today AND c.OcmPatTyp='O'
   AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), Patients AS (
 SELECT PatientId,MAX(VisitDay) LastDay,COUNT(DISTINCT VisitDay) Days
 FROM AllVisits WHERE PatientId IS NOT NULL GROUP BY PatientId
), Lapsed AS (
 SELECT PatientId,LastDay,Days FROM Patients WHERE Days>=2 AND LastDay BETWEEN @from AND @to
), LastRx AS (
 SELECT v.PatientId,o.OdrCod,v.VisitDtm,v.VisitId,o.OdrSeq
 FROM Lapsed l JOIN AllVisits v ON v.PatientId=l.PatientId AND v.VisitDay=l.LastDay
 JOIN dbo.OdrInf o ON o.OdrOcmNum=v.VisitId
 WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
)
SELECT l.PatientId,b.PbsPatNam,b.PbsCelPhn,b.PbsPhnNum,l.LastDay,l.Days,
 CASE WHEN EXISTS(SELECT 1 FROM dbo.OcmInf w WHERE w.OcmChtNum=l.PatientId AND w.OcmAcpDtm>=@today AND w.OcmPatTyp='O'
   AND w.OcmComStt IN ('WR','NR')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=w.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(w.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)) THEN 1 ELSE 0 END Reserved,
 UPPER(RTRIM(x.OdrCod)) RxCode,
 (SELECT TOP 1 s.SeeKorNam FROM dbo.SeeMst s WHERE s.SeeOdrCod=x.OdrCod AND l.LastDay BETWEEN s.SeeAdpDte AND s.SeeExpDte
  ORDER BY s.SeeAdpDte DESC,s.SeeExpDte DESC) RxName
FROM Lapsed l
LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=l.PatientId
LEFT JOIN LastRx x ON x.PatientId=l.PatientId
ORDER BY l.PatientId,x.VisitDtm,x.VisitId,x.OdrSeq";

    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [ReservationsSql] = new[]
        {
            new SqlParam("@from", SqlParamKind.Char, 12), new SqlParam("@to", SqlParamKind.Char, 12), new SqlParam("@until", SqlParamKind.Char, 12), Hospital,
        },
        [LapsedSql] = new[]
        {
            new SqlParam("@from", SqlParamKind.Char, 8), new SqlParam("@to", SqlParamKind.Char, 8), new SqlParam("@today", SqlParamKind.Char, 12), Hospital,
        },
    };

    /// <summary>명단 SQL 목록(이 클래스의 SQL 상수 전부).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 명단 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }

    /// <summary>정해 둔 문장을 관문(ReadOnlyGuard)으로 돌린다. 줄이 300,000을 넘거나 칸이 모자라면 자르지 않고 E-BIT-READ-FAILED.</summary>
    internal static IReadOnlyList<IReadOnlyList<object?>> Read(IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, int cells)
    {
        var rows = ReadOnlyGuard.Query(db, sql, args, ReadTimeout);
        if (rows.Count > ContactTargets.MaxRows || rows.Any(row => row == null || row.Count < cells)) throw new BitException(BitErrors.ReadFailed);
        return rows;
    }

    /// <summary>휴대전화가 비지 않으면 그것, 아니면 집 전화, 둘 다 비면 빈 글(앞뒤 빈칸 뺌, AC-2801.4).</summary>
    internal static string Phone(IReadOnlyList<object?> row, int cell, int home)
    {
        var mobile = ClaimText.Cell(row, cell);
        return mobile.Length > 0 ? mobile : ClaimText.Cell(row, home);
    }

    /// <summary>앞뒤 빈칸을 뺀 글. 비면 null.</summary>
    internal static string? Optional(IReadOnlyList<object?> row, int index)
    {
        var text = ClaimText.Cell(row, index);
        return text.Length == 0 ? null : text;
    }

    /// <summary>0이면 0, 아니면 1. 숫자로 읽을 수 없으면 E-BIT-READ-FAILED.</summary>
    internal static int Flag(IReadOnlyList<object?> row, int index) => ClaimText.Long(row, index) == 0 ? 0 : 1;

    /// <summary>글 칸 하나(null은 null).</summary>
    internal static void Text(Utf8JsonWriter writer, string? value)
    {
        if (value == null) writer.WriteNullValue();
        else writer.WriteStringValue(ClaimText.Safe(value));
    }

    /// <summary>답 {v:1, kind, from, to, today, rows}. 날짜는 YYYY-MM-DD, rows는 줄마다 writeRows가 쓴다.</summary>
    internal static string Payload(string kind, DateTime from, DateTime to, DateTime today, Action<Utf8JsonWriter> writeRows) =>
        ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("v", ContactTargets.Version);
            writer.WriteString("kind", kind);
            writer.WriteString("from", ClaimText.Iso(from));
            writer.WriteString("to", ClaimText.Iso(to));
            writer.WriteString("today", ClaimText.Iso(today));
            writer.WriteStartArray("rows");
            writeRows(writer);
            writer.WriteEndArray();
        });
}
