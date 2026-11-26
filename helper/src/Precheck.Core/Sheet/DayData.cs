// 비트시트 app/src/Core/DayData.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로, 바뀐 것은 이름공간·nullable 표시.
using System;
using System.Collections.Generic;

namespace Precheck.Core.Sheet;

/// <summary>
/// 하루치 원자료. 어디서 읽었는지(비트 DB, 나중에 의사랑 엑셀)와 상관없는 모양이다.
/// 줄 만들기(RowBuilder)와 보내기(WebAppClient)는 이것만 본다.
/// </summary>
public sealed class DayData
{
    public DateTime Day { get; set; }

    /// <summary>그날 센 내원(취소 뺀 것).</summary>
    public List<DayVisit> Visits { get; } = new List<DayVisit>();

    /// <summary>그날 돈 줄. 비트가 아닌 곳에서 읽으면 비어 있을 수 있다.</summary>
    public List<DayPayment> Payments { get; } = new List<DayPayment>();

    /// <summary>내원별 계산(본인부담 등). 없으면 FREE 규칙은 맞지 않는 것으로 본다.</summary>
    public Dictionary<string, DayBill> Bills { get; } = new Dictionary<string, DayBill>(StringComparer.Ordinal);

    /// <summary>그날 접수를 취소한 내원(비트 OcmComStt = CN). 차트번호·이름만 쓴다. 같은 날 센 내원이 있는 환자는 줄 만들기에서 뺀다.</summary>
    public List<DayVisit> Cancelled { get; } = new List<DayVisit>();
}

public interface IDaySource
{
    DayData Read(DateTime day);
}

public sealed class DayVisit
{
    /// <summary>내원 번호(그 날 안에서 겹치지 않음).</summary>
    public string VisitId { get; set; } = "";

    /// <summary>차트번호(앞뒤 빈칸 뺀 글자). 줄 맞춤 열쇠.</summary>
    public string Key { get; set; } = "";

    public string Name { get; set; } = "";

    /// <summary>접수 시각 yyyyMMddHHmm(차례용).</summary>
    public string AcceptedAt { get; set; } = "";

    /// <summary>진료과 코드(비트 OcmDepCod).</summary>
    public string Dept { get; set; } = "";

    /// <summary>진찰구분(비트 OcmDgsNfs).</summary>
    public string VisitKind { get; set; } = "";

    /// <summary>그 내원 처방 코드(대문자).</summary>
    public HashSet<string> Codes { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>접수할 때 보험 코드(비트 OcmInsCod, 21 자보 · 31 건강보험 · 51 보호1종 등). 계산(OrpInsCod)이 있으면 그것을 먼저 본다.</summary>
    public int Insurance { get; set; }

    /// <summary>그 내원에 주사 처방이 있음(비트 분류 04 주사료·05 마취료, 재료 뺌). 고른 Block 코드가 없을 때 쓴다.</summary>
    public bool Injection { get; set; }

    /// <summary>그 내원에 물리치료 처방이 있음(비트 분류 06 이학요법료). 고른 물리치료 코드가 없을 때 쓴다.</summary>
    public bool Therapy { get; set; }
}

public enum PaymentType
{
    /// <summary>진료수납(비트 RCV).</summary>
    Receipt,
    /// <summary>미수입금, 예전 미수를 그날 냄(비트 COR).</summary>
    ReceivablePaid,
    /// <summary>미수 발생(비트 COO). 돈 줄을 만들지 않는다.</summary>
    ReceivableCreated,
    /// <summary>건강생활유지비(비트 QCV). 돈 줄을 만들지 않는다.</summary>
    HealthFund,
    /// <summary>그 밖(수납 변경 TFC 등). 돈 줄을 만들지 않는다.</summary>
    Other,
}

public sealed class DayPayment
{
    /// <summary>붙은 내원 번호. 미수입금은 예전 내원이라 그날 내원과 안 맞을 수 있다.</summary>
    public string VisitId { get; set; } = "";

    /// <summary>차트번호(앞뒤 빈칸 뺀 글자).</summary>
    public string Key { get; set; } = "";

    /// <summary>환자 이름(비트 PbsInf). 그날 내원 없이 미수만 낸 환자 줄에 쓴다.</summary>
    public string Name { get; set; } = "";

    public PaymentType Type { get; set; }

    public decimal Cash { get; set; }

    public decimal Card { get; set; }

    public decimal Transfer { get; set; }

    /// <summary>수납 시각 yyyyMMddHHmm(돈 줄 차례용).</summary>
    public string At { get; set; } = "";

    public int Seq { get; set; }
}

public sealed class DayBill
{
    public string VisitId { get; set; } = "";

    /// <summary>본인부담 총액.</summary>
    public decimal Own { get; set; }

    /// <summary>총진료비.</summary>
    public decimal Total { get; set; }

    /// <summary>보험 코드(비트 OrpInsCod, 31 국민건강보험 등).</summary>
    public int Insurance { get; set; }

    /// <summary>비트 할인 기록 '사용자할인(FREE)'가 있음(DisInf.DisAcc = FREE).</summary>
    public bool DiscountFree { get; set; }
}
