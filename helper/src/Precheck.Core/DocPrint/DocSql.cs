using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint.Docs.Chart;
using Precheck.Core.DocPrint.Docs.Detail;
using Precheck.Core.DocPrint.Docs.Receipt;
using Precheck.Core.DocPrint.Docs.RxCopy;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 서류 인쇄(spec doc-print)가 비트 DB에 돌리는 SQL 전부: 이 파일의 바탕 문장(환자 찾기·첫 내원·왔던 날·병원 정보)과
/// 서류 4종이 저마다 둔 허용 목록(Docs/&lt;이름&gt;/&lt;이름&gt;Sql.Allowed)을 모은다. Bit/Sql.cs의 IsAllowed·ParametersOf가 이 목록을 보므로 ReadOnlyGuard를 지난다(청구 Sql.All 밖).
/// 모두 원본에 없는 새 문장이고, 읽기 전용 SELECT/WITH 하나·매개변수만(글자 이어 붙이기 없음)·';' 없음이다.
/// 줄바꿈은 \n으로 적는다(@"…" 여러 줄 글은 윈도우 받기 CRLF에서 글이 달라진다, SunapSql.HealthSql 메모).
/// 차트번호: dbo.PbsInf.PbsChtNum·OcmInf.OcmChtNum은 char(14) 오른쪽 맞춤이라 PbsInf를 LTRIM(RTRIM(…))=@cht로 찾고 OcmInf는 같은 글자로 잇는다(색인 ocminf_chtpatcomacp).
/// 센 내원(AC-7403.2): 외래 OcmPatTyp='O' · OcmRsuYon&lt;&gt;'O' · 취소(OcmComStt CN 접수 취소·CR 예약 취소) 뺌.
/// </summary>
public static class DocSql
{
    /// <summary>환자 찾기 시간 제한(AC-7402.2, 5초).</summary>
    public static readonly TimeSpan FindTimeout = TimeSpan.FromSeconds(5);

    /// <summary>첫 내원·왔던 날·병원 정보 읽기 시간 제한.</summary>
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(15);

    /// <summary>센 내원 조건(별칭 c = dbo.OcmInf).</summary>
    private const string Counted = "c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')";

    /// <summary>환자 줄 칸: [차트번호, 이름, 생년월일 yyyyMMdd, 성별 M/F, 마지막 내원일 yyyyMMdd|NULL(오늘까지 센 내원 중 가장 늦은 날)].</summary>
    private const string PatientColumns =
        "LTRIM(RTRIM(b.PbsChtNum)) Chart,RTRIM(b.PbsPatNam) PatName,b.PbsBirDte,b.PbsSexTyp,\n"
        + " (SELECT LEFT(MAX(c.OcmAcpDtm),8) FROM dbo.OcmInf c WHERE c.OcmChtNum=b.PbsChtNum AND " + Counted + " AND c.OcmAcpDtm<@to) LastVisit\n"
        + "FROM dbo.PbsInf b\n";

    /// <summary>차트번호로 환자 찾기(@cht 정리한 번호, @to 내일 0시 yyyyMMddHHmm). 차트번호는 PK라 많아야 한 줄.</summary>
    public const string ChartFindSql =
        "SELECT " + PatientColumns
        + "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht";

    /// <summary>이름으로 환자 찾기(@name 앞뒤 빈칸 뺀 이름과 같은 이름, 부분 찾기 아님). 마지막 내원일 최근 순 50명까지.</summary>
    public const string NameFindSql =
        "SELECT TOP 50 " + PatientColumns
        + "WHERE RTRIM(b.PbsPatNam)=@name\n"
        + "ORDER BY LastVisit DESC,b.PbsChtNum";

    /// <summary>첫 내원일 [yyyyMMdd|NULL]: 센 내원 중 가장 이른 접수(빠른 단추 '전체', AC-7403.1).</summary>
    public const string FirstVisitSql =
        "SELECT LEFT(MIN(c.OcmAcpDtm),8) FirstDay\n"
        + "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n"
        + "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND " + Counted;

    /// <summary>
    /// 왔던 날(AC-7403.2): 기간(@from 시작 0시 ≤ 접수 &lt; @to 끝 다음 날 0시)의 센 내원마다
    /// [날 yyyyMMdd, 내원 번호(OcmNum, RTRIM), 상태 OcmComStt, 영수증 줄 있음 1|0(OrpInf, 미수입금 C 줄 뺌), 처방전 있음 1|0(OutInf.OutOcmNum)], 접수 시각 차례.
    /// </summary>
    public const string VisitDaysSql =
        "SELECT LEFT(c.OcmAcpDtm,8) VisitDay,RTRIM(c.OcmNum) VisitId,RTRIM(ISNULL(c.OcmComStt,'')) ComStt,\n"
        + " CASE WHEN EXISTS(SELECT 1 FROM dbo.OrpInf p WHERE p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C') THEN 1 ELSE 0 END HasReceipt,\n"
        + " CASE WHEN EXISTS(SELECT 1 FROM dbo.OutInf o WHERE o.OutOcmNum=c.OcmNum) THEN 1 ELSE 0 END HasRx\n"
        + "FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum\n"
        + "WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND " + Counted + "\n"
        + "ORDER BY c.OcmAcpDtm,c.OcmNum";

    /// <summary>
    /// 병원 정보(AC-7405.1, notes/bit-docs.md §6·§7): 그날(@day yyyyMMdd) 유효한 HspMst 한 줄
    /// [이름, 요양기관기호, 주소, 사업자등록번호(HspRgnNum, 추정), 대표자, 영수증 이름(HspRcpNam), 전화, 팩스, 직인 그림 HspSignImg(image)].
    /// </summary>
    public const string HospitalSql =
        "SELECT TOP 1 RTRIM(HspNam),RTRIM(HspInsNum),RTRIM(HspHspAdr),RTRIM(HspRgnNum),RTRIM(HspOwnNam),RTRIM(HspRcpNam),RTRIM(HspTelNum),RTRIM(HspFaxNum),HspSignImg\n"
        + "FROM dbo.HspMst\n"
        + "WHERE @day BETWEEN HspAdpDte AND HspExpDte\n"
        + "ORDER BY HspAdpDte DESC";

    private static readonly SqlParam Chart = new SqlParam("@cht", SqlParamKind.VarChar, 14);
    private static readonly SqlParam From = new SqlParam("@from", SqlParamKind.Char, 12);
    private static readonly SqlParam To = new SqlParam("@to", SqlParamKind.Char, 12);

    private static readonly Dictionary<string, SqlParam[]> Own = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal)
    {
        [ChartFindSql] = new[] { Chart, To },
        [NameFindSql] = new[] { new SqlParam("@name", SqlParamKind.VarChar, SearchInput.MaxName), To },
        [FirstVisitSql] = new[] { Chart },
        [VisitDaysSql] = new[] { Chart, From, To },
        [HospitalSql] = new[] { new SqlParam("@day", SqlParamKind.Char, 8) },
    };

    private static readonly Dictionary<string, SqlParam[]> Allowed = Merge(Own, ReceiptSql.Allowed, DetailSql.Allowed, RxCopySql.Allowed, ChartSql.Allowed);

    /// <summary>서류 인쇄 SQL 목록(바탕 문장 + 서류 4종 목록).</summary>
    public static IReadOnlyCollection<string> All => Allowed.Keys;

    /// <summary>글자가 서류 인쇄 SQL과 똑같은가(대소문자·공백까지).</summary>
    public static bool IsAllowed(string? sql) => sql != null && Allowed.ContainsKey(sql);

    /// <summary>문장이 받는 매개변수 표. 목록 밖이면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql == null || !Allowed.TryGetValue(sql, out var parameters)) throw new BitException(BitErrors.ReadFailed);
        return parameters;
    }

    /// <summary>목록들을 하나로. 같은 문장이 두 목록에 있으면 도우미가 뜨자마자 멈춘다(어느 매개변수 표인지 모르게 되지 않게).</summary>
    private static Dictionary<string, SqlParam[]> Merge(params IReadOnlyDictionary<string, SqlParam[]>[] lists)
    {
        var merged = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal);
        foreach (var list in lists)
        {
            foreach (var pair in list)
            {
                if (merged.ContainsKey(pair.Key)) throw new InvalidOperationException("doc-print SQL listed twice");
                merged[pair.Key] = pair.Value;
            }
        }
        return merged;
    }
}
