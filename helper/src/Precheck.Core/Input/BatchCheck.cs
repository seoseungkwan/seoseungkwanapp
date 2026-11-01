using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Protocol;

namespace Precheck.Core.Input;

/// <summary>입력 묶음의 진료 하나(commands.json의 bit.input payload).</summary>
public sealed class InputItem
{
    public InputItem(string visitKey, string chart, string name, string date, string memo)
    {
        VisitKey = visitKey ?? "";
        Chart = chart ?? "";
        Name = name ?? "";
        Date = date ?? "";
        Memo = memo ?? "";
    }

    public string VisitKey { get; }
    public string Chart { get; }
    public string Name { get; }

    /// <summary>내원일 YYYY-MM-DD.</summary>
    public string Date { get; }

    public string Memo { get; }
}

/// <summary>
/// 묶음 검사(AC-017.1): 원본 medicore/secure_bridge.py validate_request(85줄) 규칙 + 500명 + 같은 진료 두 번 없음 + 같은 차트번호·내원일 두 번 없음.
/// 틀리면 E-HELPER-BAD-MESSAGE. 예외 글에는 번호만 들어간다(AC-001.6).
/// </summary>
public static class BatchCheck
{
    public const int MaxItems = 500;
    public const int MaxVisitKey = 64;
    public const int MaxName = 100;
    public const int MaxMemo = 32000;

    private static readonly Regex ChartShape = new Regex(@"^[0-9]{1,20}\z", RegexOptions.CultureInvariant);

    public static void Validate(IReadOnlyList<InputItem> items)
    {
        if (items == null || items.Count == 0 || items.Count > MaxItems) throw Bad();
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var visits = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            if (item == null || !ValidItem(item) || !keys.Add(item.VisitKey) || !visits.Add(VisitOnScreen(item))) throw Bad();
        }
    }

    // 도우미가 비트 화면에서 가릴 수 있는 것은 차트번호(SamePatient)와 내원일(VisitOpener)까지이고, 둘 다 Digits를 글자 그대로 비교한다(앞자리 0도 다른 번호).
    // 메모는 내원(OcmNum)마다 있어, 같은 사람·같은 날 진료가 둘이면 둘째가 첫째 화면을 열어 '이미 입력됨'으로 보이고 진짜 둘째 진료는 빈 채로 남는다.
    private static string VisitOnScreen(InputItem item) => ChartRules.Digits(item.Chart) + "|" + ChartRules.Digits(item.Date);

    private static bool ValidItem(InputItem item) =>
        item.VisitKey.Length >= 1 && item.VisitKey.Length <= MaxVisitKey
        && ChartShape.IsMatch(item.Chart)
        && ValidName(item.Name)
        && FieldSpec.TryParseDate(item.Date, out _)
        && ValidMemo(item.Memo);

    // 원본: 1 <= len(name.strip()) <= 100, 제어 문자(32 미만, 127~159) 없음
    private static bool ValidName(string name) =>
        name.Length <= MaxName && name.Trim().Length >= 1 && !name.Any(IsControl);

    // 원본: 0 < len(memo) <= 32000, 줄바꿈·탭 말고 제어 문자 없음
    private static bool ValidMemo(string memo) =>
        memo.Length >= 1 && memo.Length <= MaxMemo && memo.All(c => !IsControl(c) || c == '\r' || c == '\n' || c == '\t');

    private static bool IsControl(char c) => c < 32 || (c >= 127 && c <= 159);

    private static HelperException Bad() => new HelperException(ErrorCodes.BadMessage);
}
