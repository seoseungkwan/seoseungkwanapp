using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Input;

/// <summary>
/// 비트 화면 지문(AC-017.4). 칸 ID는 원본 UChartAutomation·RangeAutomation 그대로다.
/// 명세의 8칸에 더해, 여러 날 입력이 진료일을 읽는 dtpWorkDate(원본 ID_WORK_DATE)도 본다: 이 칸이 없으면 어차피 쓰기 전 검사를 통과하지 못한다.
/// </summary>
public static class UiFingerprint
{
    public const string Process = "BITDoctorOrder.exe";
    public const string OutpatientWindow = "외래진료실";
    public const string VisitsWindow = "내원내역";
    public const string WorkDate = "dtpWorkDate";

    public static readonly string[] Outpatient = { "txtChtNum", "lbPatName", "txtBilCmt", "btnBilCmtModify" };
    public static readonly string[] Visits = { "cbSch", "txtSch", "btnSch", "ctgMain" };

    /// <summary>보는 이름 전부(문제 목록의 차례).</summary>
    public static readonly IReadOnlyList<string> All = new[] { Process, OutpatientWindow }
        .Concat(Outpatient)
        .Concat(new[] { WorkDate, VisitsWindow })
        .Concat(Visits)
        .ToArray();

    /// <summary>
    /// 칸 ID 하나의 '찾은 수'. 원본 Locate의 Pick 규칙: 하나뿐이면 그것, 여럿이면 보이는 것의 수(보이는 것이 정확히 하나일 때만 그것을 쓴다).
    /// </summary>
    public static int Resolve(int total, int visible) => total == 1 ? 1 : visible;
}

/// <summary>지문 결과: 이름마다 찾은 수. 표에 없는 이름은 0으로 본다. 하나가 아닌 이름이 Problems다.</summary>
public sealed class FingerprintResult
{
    public FingerprintResult(IReadOnlyDictionary<string, int> counts)
    {
        Counts = counts ?? throw new ArgumentNullException(nameof(counts));
        Problems = UiFingerprint.All.Where(name => !counts.TryGetValue(name, out var count) || count != 1).ToArray();
    }

    public IReadOnlyDictionary<string, int> Counts { get; }

    public IReadOnlyList<string> Problems { get; }

    public bool Ok => Problems.Count == 0;
}
