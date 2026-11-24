using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Erp.Core.Uisarang;

// 의사랑 부품이 같이 쓰는 모양(spec erp-uisarang design.md 4-1, TASK-1).
// - 보고서 숫자(*Facts)에는 글자 칸이 없다: 숫자·참거짓·못 찾은 칸 이름(Columns)·처방 코드뿐(AC-4209.3). 모아 둔 값(UisCache, 4-4)도 이 모양을 쓴다
// - 답 모델(UisDayResult·UisCodesResult)은 기존 Envelope 기본 직렬화(JsonPropertyName, 이름 붙은 enum)로 3-2·3-3 모양이 된다.
//   의사랑 closing.day 답은 비트 답(ClosingDayResult)과 칸 이름·차례가 같고, 의사랑이 모르는 칸은 늘 null이다

/// <summary>보고서 여섯 종류(design.md 5-1 차례 = 확장 UIS_KINDS 차례).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UisKind
{
    [JsonStringEnumMemberName("income")] Income,
    [JsonStringEnumMemberName("rx")] Rx,
    [JsonStringEnumMemberName("visits")] Visits,
    [JsonStringEnumMemberName("visitPatients")] VisitPatients,
    [JsonStringEnumMemberName("rsv")] Rsv,
    [JsonStringEnumMemberName("rsvPatients")] RsvPatients,
}

/// <summary>보고서 상태(design.md 3-2 reports[].state). 모아 둔 값을 쓴 것은 Ok + cached.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UisState
{
    [JsonStringEnumMemberName("ok")] Ok,
    [JsonStringEnumMemberName("missing")] Missing,
    [JsonStringEnumMemberName("otherDate")] OtherDate,
    [JsonStringEnumMemberName("notAll")] NotAll,
    [JsonStringEnumMemberName("twice")] Twice,
}

/// <summary>closing.uisCodes 답 state(design.md 3-3). 열린 파일이 있으면 Open.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UisCodesState
{
    [JsonStringEnumMemberName("ok")] Ok,
    [JsonStringEnumMemberName("missing")] Missing,
    [JsonStringEnumMemberName("notAll")] NotAll,
    [JsonStringEnumMemberName("twice")] Twice,
    [JsonStringEnumMemberName("open")] Open,
}

/// <summary>엑셀 폴더 자리(design.md 4-3): 바탕화면\ERP마감 또는(바탕화면이 OneDrive 안이면) 사용자 폴더\ERP마감.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UisFolderKind
{
    [JsonStringEnumMemberName("desktop")] Desktop,
    [JsonStringEnumMemberName("profile")] Profile,
}

/// <summary>보고서 종류 목록과 묶음(5-1).</summary>
public static class UisKinds
{
    /// <summary>답 reports 차례(늘 6개).</summary>
    public static readonly IReadOnlyList<UisKind> All = new[]
    {
        UisKind.Income, UisKind.Rx, UisKind.Visits, UisKind.VisitPatients, UisKind.Rsv, UisKind.RsvPatients,
    };

    /// <summary>환자 정보가 든 엑셀(아래쪽 표 둘) — 알아본 바로 뒤 지운다(5-5).</summary>
    public static bool IsPatient(UisKind kind) => kind == UisKind.VisitPatients || kind == UisKind.RsvPatients;

    /// <summary>꼭 있어야 하는 엑셀 넷(위쪽 표 둘은 선택).</summary>
    public static bool IsRequired(UisKind kind) => kind != UisKind.Visits && kind != UisKind.Rsv;
}

/// <summary>답·모아 둔 값에 쓰는 JSON 이름(enum 직렬화 이름과 같다).</summary>
public static class UisNames
{
    /// <summary>열린 파일의 보고서를 파일 이름으로 짐작하지 못했을 때(design.md 5-4).</summary>
    public const string Unknown = "unknown";

    public static string Of(UisKind kind) => kind switch
    {
        UisKind.Income => "income",
        UisKind.Rx => "rx",
        UisKind.Visits => "visits",
        UisKind.VisitPatients => "visitPatients",
        UisKind.Rsv => "rsv",
        UisKind.RsvPatients => "rsvPatients",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static string Of(UisState state) => state switch
    {
        UisState.Ok => "ok",
        UisState.Missing => "missing",
        UisState.OtherDate => "otherDate",
        UisState.NotAll => "notAll",
        UisState.Twice => "twice",
        _ => throw new ArgumentOutOfRangeException(nameof(state)),
    };

    public static string Of(UisCodesState state) => state switch
    {
        UisCodesState.Ok => "ok",
        UisCodesState.Missing => "missing",
        UisCodesState.NotAll => "notAll",
        UisCodesState.Twice => "twice",
        UisCodesState.Open => "open",
        _ => throw new ArgumentOutOfRangeException(nameof(state)),
    };

    public static string Of(UisFolderKind folder) => folder switch
    {
        UisFolderKind.Desktop => "desktop",
        UisFolderKind.Profile => "profile",
        _ => throw new ArgumentOutOfRangeException(nameof(folder)),
    };
}

// ---- 엑셀 줄·시트·폴더 ----------------------------------------------------------------------------

/// <summary>
/// .xls 칸 하나(XlsRows, design.md 5-6): 글자 칸(Text) · 숫자 칸(Number) · 빈 칸(둘 다 null, default) 가운데 하나.
/// 쉼표가 든 숫자 글자('1,234')는 글자 칸이다 — 숫자로 바꾸는 것은 보고서 셈(5-3)이 한다.
/// 칸 값을 글로 내지 않으려고 ToString을 바꾸지 않는다.
/// </summary>
public readonly struct XlsCell
{
    public XlsCell(string text)
    {
        Text = text ?? throw new ArgumentNullException(nameof(text));
        Number = null;
    }

    public XlsCell(double number)
    {
        Text = null;
        Number = number;
    }

    /// <summary>빈 칸(= default).</summary>
    public static readonly XlsCell Empty = default;

    public string? Text { get; }

    public double? Number { get; }

    public bool IsEmpty => Text == null && Number == null;
}

/// <summary>
/// 알아본 시트 하나(UisReport.Read, design.md 5-1~5-3).
/// - Kind: 여섯 종류 가운데 하나, 종류 모름이면 null
/// - Labels: 머리글 줄 위 '[…]' 라벨 이름(괄호 안 빈칸 뺀 글자, 예 '조회일'·'외/입구분') → 값(앞뒤 빈칸 뗀 글자)
/// - HeaderRow: 머리글 줄 번호(XlsRows 줄 차례, 0부터). 종류 모름이면 -1
/// - Columns: 찾은 칸 이름(5-3, 빈칸 뺀 글자) → 칸 번호(0부터). 못 찾은 칸은 들지 않는다
/// - MissingColumns: 없거나 같은 이름이 둘이라 못 찾은 칸 이름
/// - Rows: 머리글 줄 아래 자료 줄(되풀이 머리글 줄·모든 칸이 빈 줄은 뺀 것, 시트 차례)
/// </summary>
public sealed class UisSheet
{
    public UisSheet(
        UisKind? kind,
        IReadOnlyDictionary<string, string> labels,
        int headerRow,
        IReadOnlyDictionary<string, int> columns,
        IReadOnlyList<string> missingColumns,
        IReadOnlyList<IReadOnlyList<XlsCell>> rows)
    {
        Kind = kind;
        Labels = labels ?? throw new ArgumentNullException(nameof(labels));
        HeaderRow = headerRow;
        Columns = columns ?? throw new ArgumentNullException(nameof(columns));
        MissingColumns = missingColumns ?? throw new ArgumentNullException(nameof(missingColumns));
        Rows = rows ?? throw new ArgumentNullException(nameof(rows));
    }

    public UisKind? Kind { get; }

    public IReadOnlyDictionary<string, string> Labels { get; }

    public int HeaderRow { get; }

    public IReadOnlyDictionary<string, int> Columns { get; }

    public IReadOnlyList<string> MissingColumns { get; }

    public IReadOnlyList<IReadOnlyList<XlsCell>> Rows { get; }
}

/// <summary>엑셀 폴더 바로 아래 .xls 파일 하나(이름은 답·기록에 넣지 않는다, 5-4).</summary>
public sealed class UisFile
{
    public UisFile(string name, long length)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Length = length;
    }

    public string Name { get; }

    /// <summary>바이트 수(20MB 넘는 파일은 읽지 않고 지운다, 4-2).</summary>
    public long Length { get; }
}

/// <summary>엑셀 폴더(실제 = UisDiskFolder, 시험 = 가짜). design.md 4-1.</summary>
public interface IUisFolder
{
    /// <summary>바로 아래 확장자 .xls(대소문자 무시) 보통 파일만, 이름 차례.</summary>
    IReadOnlyList<UisFile> List();

    /// <summary>다른 프로그램이 공유 없이 열고 있으면(독점 열기 실패) true.</summary>
    bool IsOpen(UisFile file);

    byte[] Read(UisFile file);

    /// <summary>못 지우면 false(예외 없음).</summary>
    bool Delete(UisFile file);
}

// ---- 자료원·명령 인자 ---------------------------------------------------------------------------

/// <summary>data\source.json(design.md 4-1 UisSource) = { v: 1, source: 'uisarang', folder }. 있으면 의사랑 PC.</summary>
public sealed class UisSourceFile
{
    public UisSourceFile(UisFolderKind folder) { Folder = folder; }

    public UisFolderKind Folder { get; }
}

/// <summary>closing.day의 묶음 하나(key와 고른 코드). groups = 건수로 셀 코드, sales = 매출로 셀 코드(3-1).</summary>
public sealed class UisCodeGroup
{
    public UisCodeGroup(string key, IReadOnlyList<string> codes)
    {
        Key = key ?? throw new ArgumentNullException(nameof(key));
        Codes = codes ?? throw new ArgumentNullException(nameof(codes));
    }

    public string Key { get; }

    public IReadOnlyList<string> Codes { get; }
}

/// <summary>의사랑 closing.day 인자(date는 따로 받는다). 차례는 args 차례 그대로.</summary>
public sealed class UisArgs
{
    public UisArgs(IReadOnlyList<UisCodeGroup> groups, IReadOnlyList<UisCodeGroup> sales)
    {
        Groups = groups ?? throw new ArgumentNullException(nameof(groups));
        Sales = sales ?? throw new ArgumentNullException(nameof(sales));
    }

    public IReadOnlyList<UisCodeGroup> Groups { get; }

    public IReadOnlyList<UisCodeGroup> Sales { get; }
}

// ---- 보고서 숫자(글자 칸 없음, AC-4209.3) ------------------------------------------------------------

/// <summary>일일수입통계 '합계' 줄(5-3). 못 읽은 칸은 null.</summary>
public sealed class IncomeFacts
{
    /// <summary>총진료비</summary>
    public long? TotalFee { get; set; }

    /// <summary>급여총액</summary>
    public long? Covered { get; set; }

    /// <summary>청구액</summary>
    public long? Insurer { get; set; }

    /// <summary>진료수납액</summary>
    public long? Received { get; set; }

    /// <summary>비급여</summary>
    public long? Noncovered { get; set; }

    /// <summary>초진수</summary>
    public long? First { get; set; }

    /// <summary>재진수</summary>
    public long? Return { get; set; }

    /// <summary>인원계</summary>
    public long? Headcount { get; set; }

    /// <summary>현금수납액</summary>
    public long? Cash { get; set; }

    /// <summary>카드수납액</summary>
    public long? Card { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>처방 코드 하나의 합: 총투여량(소수 그대로)·총액(줄마다 원 미만 버린 합).</summary>
public sealed class RxCode
{
    public double Qty { get; set; }

    public long Amount { get; set; }
}

/// <summary>기간별처방통계(5-3): 코드 꼴 정리(UisRules.Code)한 코드별 합 + 합계 줄 총액. 묶음 합은 이것으로 그때 센다(4-4).</summary>
public sealed class RxFacts
{
    public IReadOnlyDictionary<string, RxCode> Codes { get; set; } = new Dictionary<string, RxCode>(StringComparer.Ordinal);

    /// <summary>합계 줄 총액(없으면 null).</summary>
    public long? TotalAmount { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>내원일별환자현황 위쪽 표 합계(또는 그날) 줄: 인원수·신규환자.</summary>
public sealed class VisitsFacts
{
    public long? People { get; set; }

    public long? New { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>내원일별환자현황 아래쪽 표(환자별)에서 숫자만 남긴 것. AgeNew·AgeReturn은 10살 구간 10칸(0·10·…·90).</summary>
public sealed class VisitPatientFacts
{
    public int Rows { get; set; }

    public int NewRows { get; set; }

    public int UnknownAge { get; set; }

    public int[] AgeNew { get; set; } = new int[10];

    public int[] AgeReturn { get; set; } = new int[10];

    /// <summary>조회일 라벨이 있었나(없으면 checks.noDate).</summary>
    public bool HasDate { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>예약환자통계 위쪽 표 합계(또는 그날) 줄: 예약건수·이행건수.</summary>
public sealed class RsvFacts
{
    public long? Total { get; set; }

    public long? Visited { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>예약환자통계 아래쪽 표(환자별)에서 숫자만 남긴 것.</summary>
public sealed class RsvPatientFacts
{
    public int Rows { get; set; }

    public int Visited { get; set; }

    /// <summary>서로 다른 차트번호 수(= 실예약환자수).</summary>
    public int DistinctCharts { get; set; }

    /// <summary>예약일이 모두 마감 일자인가(아니면 otherDate).</summary>
    public bool AllOnDay { get; set; }

    public string[] Columns { get; set; } = new string[0];
}

/// <summary>보고서별 숫자 묶음(모아 둔 값 4-4·한 번 읽기 4-2). 없는 보고서는 null.</summary>
public sealed class UisFactsSet
{
    public IncomeFacts? Income { get; set; }

    public RxFacts? Rx { get; set; }

    public VisitsFacts? Visits { get; set; }

    public VisitPatientFacts? VisitPatients { get; set; }

    public RsvFacts? Rsv { get; set; }

    public RsvPatientFacts? RsvPatients { get; set; }
}

// ---- 의사랑 closing.day 답(design.md 3-2) ---------------------------------------------------------
// 칸 이름·차례는 비트 ClosingDayResult와 같다. 의사랑이 모르는 칸은 get만 있는 null(또는 정해진 값)이다

public sealed class UisDayResult
{
    [JsonPropertyName("date")]
    public string Date { get; set; } = "";

    [JsonPropertyName("patients")]
    public UisDayPatients Patients { get; set; } = new UisDayPatients();

    [JsonPropertyName("groups")]
    public IReadOnlyList<UisDayGroup> Groups { get; set; } = new UisDayGroup[0];

    /// <summary>늘 10줄(band 차례).</summary>
    [JsonPropertyName("ages")]
    public IReadOnlyList<UisDayAge> Ages { get; set; } = new UisDayAge[0];

    [JsonPropertyName("money")]
    public UisDayMoney Money { get; set; } = new UisDayMoney();

    [JsonPropertyName("inpatientVisits")]
    public long? InpatientVisits => null;

    [JsonPropertyName("reservations")]
    public UisDayReservations Reservations { get; set; } = new UisDayReservations();

    [JsonPropertyName("injection")]
    public object? Injection => null;

    [JsonPropertyName("overlap")]
    public object? Overlap => null;

    [JsonPropertyName("warnings")]
    public UisDayWarnings Warnings { get; set; } = new UisDayWarnings();

    [JsonPropertyName("source")]
    public string Source => "uisarang";

    [JsonPropertyName("uis")]
    public UisDayInfo Uis { get; set; } = new UisDayInfo();
}

public sealed class UisDayPatients
{
    /// <summary>신환</summary>
    [JsonPropertyName("new")]
    public long? New { get; set; }

    [JsonPropertyName("first90")]
    public long? First90 => null;

    /// <summary>재진 = 재진수 − 물리치료내원</summary>
    [JsonPropertyName("return")]
    public long? Return { get; set; }

    [JsonPropertyName("ptVisit")]
    public long? PtVisit { get; set; }

    [JsonPropertyName("noExamFee")]
    public long? NoExamFee { get; set; }

    [JsonPropertyName("total")]
    public long? Total { get; set; }
}

/// <summary>묶음 하나: patients = 건수로 셀 코드 총투여량 합, total = 매출로 셀 코드 총액 합.</summary>
public sealed class UisDayGroup
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("patients")]
    public long? Patients { get; set; }

    [JsonPropertyName("total")]
    public long? Total { get; set; }

    [JsonPropertyName("unpaidVisits")]
    public long? UnpaidVisits => null;

    [JsonPropertyName("new")]
    public long? New => null;

    [JsonPropertyName("first90")]
    public long? First90 => null;

    [JsonPropertyName("return")]
    public long? Return => null;
}

public sealed class UisDayAge
{
    /// <summary>'0'·'10'·…·'90'</summary>
    [JsonPropertyName("band")]
    public string Band { get; set; } = "";

    [JsonPropertyName("new")]
    public long? New { get; set; }

    [JsonPropertyName("first90")]
    public long? First90 => null;

    [JsonPropertyName("return")]
    public long? Return { get; set; }
}

public sealed class UisDayMoney
{
    /// <summary>총진료비</summary>
    [JsonPropertyName("total")]
    public long? Total { get; set; }

    /// <summary>청구액</summary>
    [JsonPropertyName("insurer")]
    public long? Insurer { get; set; }

    [JsonPropertyName("receivableIn")]
    public long? ReceivableIn => null;

    [JsonPropertyName("unpaidNew")]
    public long? UnpaidNew => null;

    [JsonPropertyName("noncovered")]
    public long? Noncovered { get; set; }

    [JsonPropertyName("discount")]
    public long? Discount => null;

    [JsonPropertyName("disabledFund")]
    public long? DisabledFund => null;

    /// <summary>진료수납액</summary>
    [JsonPropertyName("received")]
    public long? Received { get; set; }

    [JsonPropertyName("card")]
    public long? Card { get; set; }

    [JsonPropertyName("cash")]
    public long? Cash { get; set; }

    [JsonPropertyName("transfer")]
    public long? Transfer => null;

    [JsonPropertyName("refund")]
    public long? Refund => null;
}

public sealed class UisDayReservations
{
    /// <summary>의사랑은 예약 종류를 나누지 않는다(늘 빈 배열, 6-1).</summary>
    [JsonPropertyName("kinds")]
    public IReadOnlyList<object> Kinds => new object[0];

    /// <summary>실예약환자수 = 아래쪽 표 서로 다른 차트번호 수.</summary>
    [JsonPropertyName("patients")]
    public long? Patients { get; set; }
}

public sealed class UisDayWarnings
{
    [JsonPropertyName("moneyUnconfirmed")]
    public bool MoneyUnconfirmed => false;

    [JsonPropertyName("splitUnconfirmed")]
    public bool SplitUnconfirmed => false;

    [JsonPropertyName("unpaidVisits")]
    public long UnpaidVisits => 0;

    /// <summary>만 나이를 셀 수 없던 환자 줄 수.</summary>
    [JsonPropertyName("unknownAge")]
    public long UnknownAge { get; set; }

    [JsonPropertyName("noHistory")]
    public bool NoHistory => false;
}

/// <summary>답의 의사랑 칸(3-2 uis).</summary>
public sealed class UisDayInfo
{
    [JsonPropertyName("folder")]
    public UisFolderKind Folder { get; set; }

    /// <summary>늘 6개, UisKinds.All 차례.</summary>
    [JsonPropertyName("reports")]
    public IReadOnlyList<UisDayReport> Reports { get; set; } = new UisDayReport[0];

    /// <summary>열려 있어 읽지 못한 파일의 보고서 JSON 이름(짐작 못 하면 'unknown').</summary>
    [JsonPropertyName("open")]
    public IReadOnlyList<string> Open { get; set; } = new string[0];

    [JsonPropertyName("deleted")]
    public int Deleted { get; set; }

    [JsonPropertyName("kept")]
    public int Kept { get; set; }

    [JsonPropertyName("deleteFailed")]
    public int DeleteFailed { get; set; }

    [JsonPropertyName("unknownFiles")]
    public int UnknownFiles { get; set; }

    [JsonPropertyName("checks")]
    public UisDayChecks Checks { get; set; } = new UisDayChecks();

    /// <summary>소수 총투여량 때문에 건수를 null로 둔 묶음 key.</summary>
    [JsonPropertyName("fractional")]
    public IReadOnlyList<string> Fractional { get; set; } = new string[0];

    /// <summary>0보다 작아 null로 둔 칸('return'·'noExamFee').</summary>
    [JsonPropertyName("negative")]
    public IReadOnlyList<string> Negative { get; set; } = new string[0];

    /// <summary>예약 참고 숫자(6-1). 둘 다 없으면 null.</summary>
    [JsonPropertyName("reservations")]
    public UisDayRsv? Reservations { get; set; }
}

public sealed class UisDayReport
{
    [JsonPropertyName("kind")]
    public UisKind Kind { get; set; }

    [JsonPropertyName("state")]
    public UisState State { get; set; }

    /// <summary>이번엔 파일이 없어 모아 둔 값을 씀(state는 Ok).</summary>
    [JsonPropertyName("cached")]
    public bool Cached { get; set; }

    /// <summary>조회일(예약 아래쪽 표는 예약일) 'YYYY-MM-DD', 없으면 null.</summary>
    [JsonPropertyName("from")]
    public string? From { get; set; }

    [JsonPropertyName("to")]
    public string? To { get; set; }

    /// <summary>notAll일 때 '전체'가 아닌 라벨 값.</summary>
    [JsonPropertyName("value")]
    public string? Value { get; set; }

    /// <summary>못 찾은 칸 이름(5-3).</summary>
    [JsonPropertyName("columns")]
    public IReadOnlyList<string> Columns { get; set; } = new string[0];
}

/// <summary>맞춰 보기(6-2, 경고만): 다르면 [왼쪽, 오른쪽], 같거나 한쪽이 null이면 null.</summary>
public sealed class UisDayChecks
{
    [JsonPropertyName("totalFee")]
    public long[]? TotalFee { get; set; }

    [JsonPropertyName("received")]
    public long[]? Received { get; set; }

    [JsonPropertyName("headcount")]
    public long[]? Headcount { get; set; }

    [JsonPropertyName("rxTotal")]
    public long[]? RxTotal { get; set; }

    [JsonPropertyName("visitRows")]
    public long[]? VisitRows { get; set; }

    [JsonPropertyName("visitNew")]
    public long[]? VisitNew { get; set; }

    [JsonPropertyName("rsvRows")]
    public long[]? RsvRows { get; set; }

    [JsonPropertyName("rsvVisited")]
    public long[]? RsvVisited { get; set; }

    /// <summary>아래쪽 내원 표에 조회일 라벨이 없음.</summary>
    [JsonPropertyName("noDate")]
    public bool NoDate { get; set; }
}

/// <summary>예약 참고 숫자: 위쪽 표 { 예약건수, 이행건수 } 또는 아래쪽 표 { 줄 수, 방문 줄 수 }.</summary>
public sealed class UisDayRsv
{
    [JsonPropertyName("total")]
    public long Total { get; set; }

    [JsonPropertyName("visited")]
    public long Visited { get; set; }
}

// ---- closing.uisCodes 답(design.md 3-3) ------------------------------------------------------------

public sealed class UisCodesResult
{
    [JsonPropertyName("state")]
    public UisCodesState State { get; set; }

    [JsonPropertyName("from")]
    public string? From { get; set; }

    [JsonPropertyName("to")]
    public string? To { get; set; }

    [JsonPropertyName("value")]
    public string? Value { get; set; }

    /// <summary>코드마다 한 줄, 총액 큰 차례, 2,000개까지.</summary>
    [JsonPropertyName("codes")]
    public IReadOnlyList<UisCodeRow> Codes { get; set; } = new UisCodeRow[0];
}

/// <summary>처방통계 코드 한 줄: 코드(꼴 정리)·처음 나온 처방명칭·총투여량 합(소수 가능)·총액(원 정수).</summary>
public sealed class UisCodeRow
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = "";

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("qty")]
    public double Qty { get; set; }

    [JsonPropertyName("amount")]
    public long Amount { get; set; }
}
