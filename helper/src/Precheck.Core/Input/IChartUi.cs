using System;
using System.Collections.Generic;

namespace Precheck.Core.Input;

/// <summary>
/// 비트 화면과의 경계. 윈도우에서는 Precheck.Windows.UChartAutomation(FlaUI·Win32), 시험에서는 가짜.
/// 메모 칸을 바꾸는 길은 ReplaceMemoSelection·SetMemoValue 둘뿐이고 InputRunner(MemoWriter)만 부른다.
/// 내원내역 기간·날짜를 고치는 길은 없다: 사람이 띄워 둔 기간을 읽기만 한다(원본 range_bridge).
/// </summary>
public interface IChartUi : IDisposable
{
    /// <summary>지문 읽기. 읽기만 한다(확인 창 전에 부른다).</summary>
    FingerprintResult CheckFingerprint();

    /// <summary>저장 안 한 처방 창이 떠 있는가. 읽기만 한다. 그 창은 절대 누르지 않는다(AC-017.5).</summary>
    bool HasUnsavedRxDialog();

    /// <summary>내원내역에서 차트번호로 찾아 그 진료일의 내원을 연다(원본 OpenPatientRange).</summary>
    ChartOpenResult OpenPatient(string chart, string name, string date);

    /// <summary>외래진료실 창과 칸을 찾아 둔다(원본 Locate). 아래 읽기·쓰기는 찾아 둔 칸을 쓴다.</summary>
    ChartLocate Locate();

    /// <summary>찾아 둔 칸에서 지금 화면의 환자·진료일을 읽는다(원본 CheckRange의 재료).</summary>
    ChartRead ReadTarget();

    /// <summary>내원내역의 조회 기간·처방코드 칸(원본 ReadListFilter).</summary>
    ListFilter ReadListFilter();

    /// <summary>메모 칸 글. 읽지 못했으면 null이다. 빈칸과 다르다.</summary>
    string? ReadMemo();

    bool IsMemoEditable();

    /// <summary>메모 칸 전체 선택(원본 EM_SETSEL). 글은 바꾸지 않는다.</summary>
    void SelectAllMemo();

    /// <summary>선택한 곳을 바꾼다(원본 EM_REPLACESEL).</summary>
    void ReplaceMemoSelection(string text);

    bool IsValuePatternSupported();

    /// <summary>값 패턴으로 쓴다(원본 ValuePattern.SetValue). EM_REPLACESEL이 안 먹었을 때만.</summary>
    void SetMemoValue(string text);

    /// <summary>임시저장 단추를 누른다. 못 누르면 false.</summary>
    bool ClickSave();
}

public enum ChartOpenKind
{
    Opened,
    Failed,
    UnsavedRx,
    UiChanged,
}

/// <summary>환자 열기 결과. Message는 원본 문구다(건너뜀 이유·fatal 판단에 쓴다).</summary>
public sealed class ChartOpenResult
{
    private static readonly string[] NoFields = new string[0];

    private ChartOpenResult(ChartOpenKind kind, string message, IReadOnlyList<string> fields)
    {
        Kind = kind;
        Message = message ?? "";
        Fields = fields;
    }

    public ChartOpenKind Kind { get; }
    public string Message { get; }
    public IReadOnlyList<string> Fields { get; }

    public static ChartOpenResult Opened(string message) => new ChartOpenResult(ChartOpenKind.Opened, message, NoFields);

    public static ChartOpenResult Failed(string message) => new ChartOpenResult(ChartOpenKind.Failed, message, NoFields);

    public static ChartOpenResult UnsavedRx(string message) => new ChartOpenResult(ChartOpenKind.UnsavedRx, message, NoFields);

    public static ChartOpenResult UiChanged(string message, IReadOnlyList<string> fields) => new ChartOpenResult(ChartOpenKind.UiChanged, message, fields);
}

/// <summary>외래진료실 찾기 결과. Fields는 없거나 여럿인 칸 ID.</summary>
public sealed class ChartLocate
{
    private static readonly string[] NoFields = new string[0];

    private ChartLocate(bool ok, string? error, IReadOnlyList<string> fields)
    {
        Ok = ok;
        Error = error;
        Fields = fields;
    }

    public bool Ok { get; }
    public string? Error { get; }
    public IReadOnlyList<string> Fields { get; }

    public static ChartLocate Found() => new ChartLocate(true, null, NoFields);

    public static ChartLocate NotFound(string error) => new ChartLocate(false, error, NoFields);

    public static ChartLocate Missing(string error, IReadOnlyList<string> fields) => new ChartLocate(false, error, fields);
}

/// <summary>지금 화면의 환자·진료일. Owned는 칸들이 등록한 비트 프로세스 것인가(원본 OwnsControls).</summary>
public sealed class ChartRead
{
    public ChartRead(bool owned, string chart, string name, string? identityError, string? workDate, string? workDateError)
    {
        Owned = owned;
        Chart = chart ?? "";
        Name = name ?? "";
        IdentityError = identityError;
        WorkDate = workDate;
        WorkDateError = workDateError;
    }

    public bool Owned { get; }
    public string Chart { get; }
    public string Name { get; }
    public string? IdentityError { get; }

    /// <summary>열린 내원의 진료일(dtpWorkDate). 못 읽으면 null.</summary>
    public string? WorkDate { get; }

    public string? WorkDateError { get; }
}

/// <summary>내원내역의 조회 기간(원본 range_bridge ListFilter). Code는 처방코드 칸, 칸이 없으면 null.</summary>
public sealed class ListFilter
{
    public ListFilter(string? from, string? to, string? code, bool? codeExcept, string? error)
    {
        From = from;
        To = to;
        Code = code;
        CodeExcept = codeExcept;
        Error = error;
    }

    public string? From { get; }
    public string? To { get; }
    public string? Code { get; }
    public bool? CodeExcept { get; }
    public string? Error { get; }
}

/// <summary>화면의 환자(원본 ReadIdentity).</summary>
public sealed class ChartIdentity
{
    public ChartIdentity(string chart, string name, string? error)
    {
        Chart = chart ?? "";
        Name = name ?? "";
        Error = error;
    }

    public string Chart { get; }
    public string Name { get; }
    public string? Error { get; }
}
