using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 서류 한 종류(spec doc-print): 비트 DB에서 제 자료를 읽어(문장은 제 &lt;이름&gt;Sql.Allowed에 두고 ReadOnlyGuard.Query로) A4 쪽들을 그린다.
/// 쪽 차례는 그대로 인쇄 차례다(날짜순은 서류가 맞춘다). 읽기 실패는 BitException 그대로 올린다. 4종 목록은 DocSources.All.
/// </summary>
public interface IDocSource
{
    DocKind Kind { get; }

    IReadOnlyList<DocPage> Pages(IBitDb db, DocContext ctx);
}

/// <summary>
/// 서류에 넘기는 값 묶음: 차트번호, 고른 환자, 고른 날(날짜순), 고른 기간, 병원 정보·직인, 글자 폭 재기, 오늘.
/// 환자 값이 들어가므로 파일·로그에 남기지 않는다.
/// </summary>
public sealed class DocContext
{
    /// <summary>병원 직인 그림 열쇠: 직인을 찍는 쪽은 DocOp.Image(…, SealKey)와 함께 Images[SealKey] = Seal을 넣는다(Seal이 null이면 넣지 않음).</summary>
    public const string SealKey = "hospital-seal";

    public DocContext(string chart, PatientHit patient, IEnumerable<VisitDay> days, DateTime from, DateTime to, HospitalInfo hospital, Func<string, float, float> widthMm, DateTime today)
    {
        Chart = chart ?? "";
        Patient = patient ?? throw new ArgumentNullException(nameof(patient));
        Days = (days ?? Enumerable.Empty<VisitDay>()).Where(day => day != null).OrderBy(day => day.Date).ToArray();
        From = from.Date;
        To = to.Date;
        Hospital = hospital ?? throw new ArgumentNullException(nameof(hospital));
        WidthMm = widthMm ?? throw new ArgumentNullException(nameof(widthMm));
        Today = today.Date;
    }

    /// <summary>정리한 차트번호(앞 0 없는 숫자). SQL에는 @cht VarChar(14)로 넘겨 LTRIM(RTRIM(PbsChtNum))=@cht로 찾는다.</summary>
    public string Chart { get; }

    public PatientHit Patient { get; }

    /// <summary>고른 날(체크된 VisitDay), 날짜순. 수납 전인 날도 사용자가 체크했으면 들어 있다.</summary>
    public IReadOnlyList<VisitDay> Days { get; }

    /// <summary>창에서 고른 기간(날, 끝 날 포함).</summary>
    public DateTime From { get; }

    public DateTime To { get; }

    public HospitalInfo Hospital { get; }

    /// <summary>병원 직인 그림(HspMst.HspSignImg), 없으면 null.</summary>
    public byte[]? Seal => Hospital.Seal;

    /// <summary>글 폭 재기: (글, 글씨 pt) → mm. 윈도우 층이 실제 글꼴(맑은 고딕)로 잰다. 줄 나눔·글씨 줄이기는 이것으로 Core에서 한다(PtSlip.SlipFitter.Fit처럼).</summary>
    public Func<string, float, float> WidthMm { get; }

    /// <summary>오늘(발행일 칸 등).</summary>
    public DateTime Today { get; }
}
