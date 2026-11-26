// 비트시트 app/src/Bit/BitSql.cs(작업 트리 파일, 판 7)의 문장 그대로와 BitDb.Require 검사를 옮김(spec google-link TASK-9, design.md 9-1).
// 비트 연결은 도우미 IBitDb(Windows SqlBitDb: 읽기 전용 트랜잭션·늘 되돌림)가 맡고, 여기서는 허용 목록·쓰기 낱말·매개변수만 본다.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;

namespace Precheck.Core.Sheet;

/// <summary>
/// 수납 구글 시트가 비트 DB에 돌리는 문장 전부(허용 목록). 모두 매개변수를 받는 SELECT 하나다. 근거는 비트시트 notes/bit-facts.md.
/// 센 내원 = 외래 · 접수 취소 아님 · 진료 상태(도우미와 같음) · 그 병원 진료과(날짜 사이).
/// 줄바꿈은 \n으로 적는다(윈도 받기에서 글자가 달라지지 않게).
/// </summary>
public static class SheetSql
{
    private const string CountedVisit =
        "c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'\n"
        + " AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')\n"
        + " AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND RTRIM(d.DepHspNum)=@hospital\n"
        + "  AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>CountedVisit과 같은 조건, 다른 이름(x)의 내원(취소 접수와 같은 날 센 내원이 있는지 볼 때).</summary>
    private const string CountedVisitX =
        "x.OcmAcpDtm>=@from AND x.OcmAcpDtm<@to AND x.OcmPatTyp='O' AND x.OcmRsuYon<>'O'\n"
        + " AND x.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')\n"
        + " AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=x.OcmDepCod AND RTRIM(d.DepHspNum)=@hospital\n"
        + "  AND LEFT(x.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>
    /// [내원 번호, 차트번호, 이름, 접수 시각, 진료과, 진찰구분, 보험 코드]. 이름은 PbsInf.PbsPatNam(PbsChtNum = OcmChtNum).
    /// 보험 코드 OcmInsCod(InsMst: 21·22 자동차보험, 31 건강보험, 51·52 의료급여). 2026-11-25 확인: 90일 센 내원에서 계산 보험(OrpInsCod)과 늘 같음.
    /// </summary>
    public const string VisitsSql =
        "SELECT LTRIM(RTRIM(c.OcmNum)),LTRIM(RTRIM(c.OcmChtNum)),RTRIM(b.PbsPatNam),c.OcmAcpDtm,RTRIM(c.OcmDepCod),RTRIM(c.OcmDgsNfs),c.OcmInsCod\n"
        + "FROM dbo.OcmInf c LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum\n"
        + "WHERE " + CountedVisit;

    /// <summary>
    /// [내원 번호, 처방 코드, 처방 분류 앞 두 자리, 코드 구분]. 살아 있는 처방만(삭제·취소·원외 99 뺌).
    /// 분류(OdrItmCod 앞 두 자리): 04 주사료 · 05 마취료 · 06 이학요법료. 구분(SeeMst.SeeCodDiv): 1 행위 · 3 약 · 8 재료(주사·마취 줄만 찾음, 기본키로 바로 찾음).
    /// </summary>
    public const string CodesSql =
        "SELECT DISTINCT LTRIM(RTRIM(o.OdrOcmNum)),UPPER(RTRIM(o.OdrCod)),LEFT(o.OdrItmCod,2),ISNULL(s.SeeCodDiv,'')\n"
        + "FROM dbo.OdrInf o JOIN dbo.OcmInf c ON c.OcmNum=o.OdrOcmNum\n"
        + "OUTER APPLY (SELECT TOP 1 x.SeeCodDiv FROM dbo.SeeMst x WHERE x.SeeOdrCod=o.OdrCod AND LEFT(o.OdrItmCod,2) IN ('04','05') ORDER BY x.SeeExpDte DESC,x.SeeAdpDte DESC) s\n"
        + "WHERE " + CountedVisit + "\n"
        + " AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''";

    /// <summary>
    /// [내원 번호, 차트번호, 종류, 현금, 카드, 계좌, 시각, 순번, 이름]. 그날 수납한 돈 줄 전부(OrcAccDte = 수납일), 그 병원 내원에 붙은 것만
    /// (미수입금은 예전 내원에 붙어 있어 그 내원 날짜로 진료과를 본다). 2026-11-24 확인: 90일 동안 이 거르기로 빠지는 줄 0,
    /// 진료수납 줄은 모두 정상 계산(OrpRcpStt≠C)에 붙음(취소된 수납 줄 없음).
    /// </summary>
    public const string PaymentsSql =
        "SELECT LTRIM(RTRIM(o.OrcOcmNum)),LTRIM(RTRIM(o.OrcChtNum)),RTRIM(o.OrcCod),o.OrcNewAmt,o.OrcCrdAmt,o.OrcChkAmt,o.OrcUpdDtm,o.OrcSeq,RTRIM(b.PbsPatNam)\n"
        + "FROM dbo.OrcInf o LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=o.OrcChtNum\n"
        + "WHERE o.OrcAccDte=@day AND o.OrcPatTyp<>'R'\n"
        + " AND EXISTS(SELECT 1 FROM dbo.OcmInf c JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod WHERE c.OcmNum=o.OrcOcmNum AND RTRIM(d.DepHspNum)=@hospital\n"
        + "  AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    /// <summary>
    /// [차트번호, 이름]. 그날 접수를 취소한(OcmComStt = CN) 외래 내원 가운데, 같은 날 같은 차트에 센 내원이 없는 환자(DESIGN 4절).
    /// 예약 취소(CR)는 센 내원이었던 적이 없어 시트에 없으므로 보지 않는다.
    /// </summary>
    public const string CancelledSql =
        "SELECT DISTINCT LTRIM(RTRIM(c.OcmChtNum)),RTRIM(b.PbsPatNam)\n"
        + "FROM dbo.OcmInf c LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND RTRIM(c.OcmComStt)='CN'\n"
        + " AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND RTRIM(d.DepHspNum)=@hospital\n"
        + "  AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)\n"
        + " AND NOT EXISTS(SELECT 1 FROM dbo.OcmInf x WHERE x.OcmChtNum=c.OcmChtNum AND " + CountedVisitX + ")";

    /// <summary>[내원 번호, 본인부담, 총진료비, 보험 코드, 할인 기록 FREE 있음 1/0]. 정상수납(OrpRcpStt≠C) 중 마지막 순번.</summary>
    public const string BillsSql =
        "SELECT LTRIM(RTRIM(c.OcmNum)),p.OrpTotOwn,p.OrpTotAmt,p.OrpInsCod,\n"
        + " CASE WHEN EXISTS(SELECT 1 FROM dbo.DisInf x WHERE RIGHT(SPACE(10)+CONVERT(varchar(10),x.DisOcmNum),10)=c.OcmNum AND RTRIM(x.DisAcc)='FREE') THEN 1 ELSE 0 END\n"
        + "FROM dbo.OcmInf c\n"
        + "OUTER APPLY (SELECT TOP 1 q.OrpTotOwn,q.OrpTotAmt,q.OrpInsCod FROM dbo.OrpInf q WHERE q.OrpOcmNum=c.OcmNum AND q.OrpRcpStt<>'C' ORDER BY q.OrpRcpSeq DESC) p\n"
        + "WHERE " + CountedVisit;

    /// <summary>[병원 범위, 병원 이름]. 진료과에 쓰인 범위마다 오늘 유효한 HspMst 이름.</summary>
    public const string HospitalsSql =
        "SELECT DISTINCT RTRIM(d.DepHspNum),\n"
        + " (SELECT TOP 1 RTRIM(h.HspNam) FROM dbo.HspMst h WHERE RTRIM(h.HspCod)=RTRIM(d.DepHspNum) AND @today BETWEEN h.HspAdpDte AND h.HspExpDte ORDER BY h.HspAdpDte DESC)\n"
        + "FROM dbo.DepMst d";

    /// <summary>[병원 범위, 센 내원 수]. 기간(최근 30일) 병원마다(비트에 병원이 여럿일 때 쓰는 병원 고르기).</summary>
    public const string HospitalVisitsSql =
        "SELECT RTRIM(d.DepHspNum),COUNT(DISTINCT c.OcmNum) FROM dbo.OcmInf c\n"
        + " JOIN dbo.DepMst d ON d.DepCod=c.OcmDepCod AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte\n"
        + "WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'\n"
        + " AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')\n"
        + "GROUP BY RTRIM(d.DepHspNum)";

    /// <summary>[진료과 코드, 이름, 시작일, 끝일]. 그 병원 진료과 전부.</summary>
    public const string DepartmentsSql =
        "SELECT RTRIM(DepCod),RTRIM(DepKorNam),DepAdpDte,DepExpDte FROM dbo.DepMst WHERE RTRIM(DepHspNum)=@hospital ORDER BY RTRIM(DepCod),DepAdpDte DESC";

    /// <summary>
    /// [코드, 내원 수, 이름, 처방 분류 앞 두 자리, 코드 구분]. 기간(최근 90일)에 쓴 처방 코드(고르기 창용).
    /// 이름은 SeeMst를 기본키(SeeOdrCod)로 바로 찾는다. 예전에는 코드마다 SeeMst 전체(약 60만 줄)를 훑어 양지바른에서 21초,
    /// 처방이 많은 병원은 더 오래 걸려 고르기 목록이 비어 보였다(2026-11-25 고침, 0.8초).
    /// </summary>
    public const string CodeUsageSql =
        "WITH U AS (SELECT UPPER(RTRIM(o.OdrCod)) code,COUNT(DISTINCT o.OdrOcmNum) visits,MAX(RTRIM(o.OdrCodNam)) odrNam,MAX(LEFT(o.OdrItmCod,2)) itm\n"
        + " FROM dbo.OdrInf o JOIN dbo.OcmInf c ON c.OcmNum=o.OdrOcmNum\n"
        + " WHERE " + CountedVisit + "\n"
        + "  AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''\n"
        + " GROUP BY UPPER(RTRIM(o.OdrCod)))\n"
        + "SELECT U.code,U.visits,ISNULL(RTRIM(s.SeeKorNam),U.odrNam),ISNULL(U.itm,''),ISNULL(s.SeeCodDiv,'')\n"
        + "FROM U OUTER APPLY (SELECT TOP 1 x.SeeKorNam,x.SeeCodDiv FROM dbo.SeeMst x WHERE x.SeeOdrCod=U.code ORDER BY x.SeeExpDte DESC,x.SeeAdpDte DESC) s\n"
        + "ORDER BY U.visits DESC";

    /// <summary>[진료과 코드, 내원 수]. 기간(최근 90일) 센 내원의 진료과(진료실 표에 보일 것 고르기).</summary>
    public const string DeptUsageSql =
        "SELECT RTRIM(c.OcmDepCod),COUNT(*) FROM dbo.OcmInf c\n"
        + "WHERE " + CountedVisit + "\n"
        + "GROUP BY RTRIM(c.OcmDepCod)";

    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);
    private static readonly SqlParam Hospital = new SqlParam("@hospital", SqlParamKind.VarChar, 32);

    private static readonly Dictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [VisitsSql] = new[] { From, To, Hospital },
        [CodesSql] = new[] { From, To, Hospital },
        [PaymentsSql] = new[] { new SqlParam("@day", SqlParamKind.Char, 8), Hospital },
        [CancelledSql] = new[] { From, To, Hospital },
        [BillsSql] = new[] { From, To, Hospital },
        [HospitalsSql] = new[] { new SqlParam("@today", SqlParamKind.Char, 8) },
        [HospitalVisitsSql] = new[] { From, To },
        [DepartmentsSql] = new[] { Hospital },
        [CodeUsageSql] = new[] { From, To, Hospital },
        [DeptUsageSql] = new[] { From, To, Hospital },
    };

    /// <summary>비트시트 BitDb.Require의 쓰기 낱말 목록 그대로(따옴표 글·주석을 지운 뒤 낱말로 찾는다).</summary>
    private static readonly string[] Forbidden =
    {
        "INSERT", "UPDATE", "DELETE", "MERGE", "EXEC", "EXECUTE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE", "DENY",
        "INTO", "BACKUP", "RESTORE", "DBCC", "SHUTDOWN", "KILL", "OPENROWSET", "OPENQUERY", "OPENDATASOURCE", "WAITFOR", "SET",
        "BEGIN", "COMMIT", "ROLLBACK", "DECLARE", "USE", "BULK", "RECONFIGURE", "CHECKPOINT",
    };

    private static readonly Regex LineComment = new Regex(@"--[^\n]*", RegexOptions.CultureInvariant);
    private static readonly Regex BlockComment = new Regex(@"/\*.*?\*/", RegexOptions.Singleline | RegexOptions.CultureInvariant);
    private static readonly Regex Quoted = new Regex(@"N?'([^']|'')*'", RegexOptions.CultureInvariant);

    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    public static IReadOnlyList<SqlParam> ParametersOf(string? sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var declared)) throw new BitException(BitErrors.ReadFailed);
        return declared;
    }

    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>
    /// 허용 목록의 문장인가, SELECT/WITH 하나인가, 쓰기 낱말이 없는가, 매개변수가 정해 둔 이름·개수이고 모두 크기 안의 글자인가
    /// (비트시트 BitDb.Require 그대로). 아니면 E-BIT-READ-FAILED.
    /// </summary>
    public static void Require(string? sql, IReadOnlyDictionary<string, object?>? args)
    {
        if (sql == null || !IsAllowed(sql)) throw new BitException(BitErrors.ReadFailed);
        var text = LineComment.Replace(sql, " ");
        text = BlockComment.Replace(text, " ");
        text = Quoted.Replace(text, "''").Trim();
        if (!(text.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) || text.StartsWith("WITH", StringComparison.OrdinalIgnoreCase)) || text.Contains(";"))
        {
            throw new BitException(BitErrors.ReadFailed);
        }
        foreach (var word in Forbidden)
        {
            if (Regex.IsMatch(text, @"(?<![A-Za-z0-9_@#])" + word + @"(?![A-Za-z0-9_])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                throw new BitException(BitErrors.ReadFailed);
            }
        }
        var declared = ParametersOf(sql);
        if (args == null || args.Count != declared.Count) throw new BitException(BitErrors.ReadFailed);
        foreach (var param in declared)
        {
            if (!args.TryGetValue(param.Name, out var value) || !(value is string given) || given.Length > param.Size)
            {
                throw new BitException(BitErrors.ReadFailed);
            }
        }
    }

    /// <summary>검사를 지난 문장만 도우미 비트 연결로 돌린다.</summary>
    public static IReadOnlyList<IReadOnlyList<object?>> Query(IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        Require(sql, args);
        return db.Query(sql, args, timeout);
    }
}
