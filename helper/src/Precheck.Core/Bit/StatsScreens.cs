using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 통계 화면 하나(원본 NativeDefinition): 설치 폴더 EXE의 DLL, 모듈·화면 형식, 불러오기·조회 처리기, 시작일·종료일 칸, 표 칸.
/// Kind는 전산자료 추출통계(83)의 종류 칸(_cbxStaTyp)에서 고를 글자(83 증상, 83D 상병내역). 47은 없다.
/// </summary>
public sealed class StatsScreen
{
    public StatsScreen(string key, string assembly, string module, string form, string load, string query,
        string start, string end, string grid, string? kind, string permissionKey)
    {
        Key = key;
        Assembly = assembly;
        Module = module;
        Form = form;
        Load = load;
        Query = query;
        Start = start;
        End = end;
        Grid = grid;
        Kind = kind;
        PermissionKey = permissionKey;
    }

    public string Key { get; }

    public string Assembly { get; }

    public string Module { get; }

    public string Form { get; }

    public string Load { get; }

    public string Query { get; }

    public string Start { get; }

    public string End { get; }

    public string Grid { get; }

    public string? Kind { get; }

    /// <summary>비트 권한표·메뉴에서 찾을 키. 83D는 83 화면을 종류만 바꿔 여는 것이라 83 권한을 따른다(원본 PermissionTitle).</summary>
    public string PermissionKey { get; }
}

/// <summary>
/// 한 달 자료에 쓰는 비트 통계 화면 셋(원본 NativeMappings의 83·83D·47 줄 그대로, DateMode는 모두 range).
/// 화면을 여는 일은 Precheck.Windows.VendorGridExport가, 표 → 줄은 GridRows가 한다.
/// </summary>
public static class StatsScreens
{
    public const string Symptoms = "83";
    public const string Diagnoses = "83D";
    public const string Prescriptions = "47";

    /// <summary>전산자료 추출통계(83)의 종류 칸(원본 SetReportOptions).</summary>
    public const string KindField = "_cbxStaTyp";

    /// <summary>비트 통계 메뉴 파일(설치 폴더 기준, 원본 NativeReportAdapter 생성자의 Catalog).</summary>
    public const string MenuFile = @"ini\BITSTATISTICS.Xml";

    /// <summary>
    /// 화면 하나를 조회하고 표를 읽는 시간 제한. 원본은 통계 화면에 시간 제한이 없었다: 자료 SQL 값(120~150초) 중 긴 쪽을 쓴다(AC-008.4).
    /// </summary>
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(150);

    private static readonly StatsScreen[] Definitions =
    {
        new StatsScreen(Symptoms, "BITSSElectricData.dll", "BIT.DrBIT.Statistics.cSElectricData", "BIT.DrBIT.Statistics.fSElectricData",
            "fSpecialPatient_Load", "btnTotal_Click", "_dtpStartDate", "_dtpEndDate", "_cfgMain", "증상", Symptoms),
        new StatsScreen(Diagnoses, "BITSSElectricData.dll", "BIT.DrBIT.Statistics.cSElectricData", "BIT.DrBIT.Statistics.fSElectricData",
            "fSpecialPatient_Load", "btnTotal_Click", "_dtpStartDate", "_dtpEndDate", "_cfgMain", "상병내역", Symptoms),
        new StatsScreen(Prescriptions, "BITSDepOdrPatList.dll", "BIT.DrBIT.Statistics.BITSDepOdrPatList", "BIT.DrBIT.Statistics.fSDepOdrPatList",
            "fSDepOdr_Load", "btnTotal_Click", "_dtpStartDte", "_dtpEndDte", "_cfgMain", null, Prescriptions),
    };

    /// <summary>읽는 차례(83 → 83D → 47).</summary>
    public static IReadOnlyList<string> Keys { get; } = Definitions.Select(d => d.Key).ToArray();

    /// <summary>키의 화면 정의. 모르는 키면 E-BIT-EXPORT-FAILED.</summary>
    public static StatsScreen Of(string key) =>
        Definitions.FirstOrDefault(d => string.Equals(d.Key, key, StringComparison.Ordinal)) ?? throw new BitException(BitErrors.ExportFailed);
}

/// <summary>
/// 비트 통계 화면 읽기(윈도우: Precheck.Windows.VendorGridExport, 시험: 가짜). 실패는 BitException:
/// 화면·DLL·표 구성이 다르면 E-BIT-EXPORT-FAILED, 조회 중 DB 오류·시간 지남은 E-BIT-READ-FAILED.
/// </summary>
public interface IStatsScreens
{
    /// <summary>통계 메뉴 파일(StatsScreens.MenuFile) 바이트. 없으면 E-BIT-EXPORT-FAILED.</summary>
    byte[] ReadMenu(string installPath);

    /// <summary>화면을 숨겨서 열고 기간(from 0시 ~ to 23:59)을 넣어 조회한 뒤, 표의 보이는 줄(머리 줄 포함)을 화면 표시 글자로 준다(GridReader).</summary>
    IReadOnlyList<IReadOnlyList<string>> Read(string installPath, VendorUser user, StatsScreen screen, DateTime from, DateTime to, TimeSpan timeout);
}
