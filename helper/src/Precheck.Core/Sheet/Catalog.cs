// 비트시트 app/src/Core/Catalog.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로, 바뀐 것은 이름공간·nullable 표시.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Precheck.Core.Sheet;

/// <summary>비트 진료과 하나(설정 › 비트 맞춤의 진료실 표).</summary>
public sealed class DeptInfo
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>오늘 유효한 진료과인가(아니면 '쓰지 않음').</summary>
    public bool Current { get; set; }
    /// <summary>최근 90일 센 내원 수.</summary>
    public int Visits90 { get; set; }
}

/// <summary>최근 90일에 쓴 처방 코드 하나(고르기 목록).</summary>
public sealed class CodeUsage
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int Visits { get; set; }
    /// <summary>비트 분류로 본 종류: OrderKind.Injection · OrderKind.Therapy · "".</summary>
    public string Kind { get; set; } = "";
}

/// <summary>
/// 처방 종류(DESIGN 3절). 비트 처방 분류(OdrItmCod 앞 두 자리 = 심평원 수가 장)와 코드 구분(SeeMst.SeeCodDiv: 1 행위 · 3 약 · 8 재료)으로 가른다.
/// 양지바른 90일(개수만): 04 주사료(약·관절강내 주사·증식치료, 재료 D1 하나) · 05 마취료(신경차단술 LA…) · 06 이학요법료(MM…·도수·체외충격파).
/// </summary>
public static class OrderKind
{
    public const string Injection = "주사";
    public const string Therapy = "물리치료";

    /// <summary>분류·구분 → 종류. 주사 = 04·05(재료 8 뺌), 물리치료 = 06. 그 밖은 "".</summary>
    public static string Of(string itemClass, string codeDiv)
    {
        var c = (itemClass ?? "").Trim();
        var d = (codeDiv ?? "").Trim();
        if (c.StartsWith("04", StringComparison.Ordinal) || c.StartsWith("05", StringComparison.Ordinal)) return d == "8" ? "" : Injection;
        if (c.StartsWith("06", StringComparison.Ordinal)) return Therapy;
        return "";
    }

    /// <summary>설정 창에 보일 지금 기준(짧게). 고른 처방이 없으면 기본(분류로 전부)을 쓴다는 것을 알린다.</summary>
    public static string RuleText(string kind, int chosen)
    {
        if (chosen > 0) return "고른 처방 " + chosen.ToString(CultureInfo.InvariantCulture) + "개만 셈";
        return kind == Therapy ? "고른 처방 없음 → 물리치료 처방 전부 셈" : "고른 처방 없음 → 주사 처방 전부 셈";
    }

    /// <summary>기본 기준의 풀이(말풍선).</summary>
    public static string RuleDetail(string kind) => kind == Therapy
        ? "고른 처방이 없으면 비트 처방 분류가 '이학요법료'인 처방(물리치료·도수·체외충격파 등)이 있는 환자를 셉니다."
        : "고른 처방이 없으면 비트 처방 분류가 '주사료'·'마취료'인 처방(주사약·관절강내 주사·신경차단술 등, 붕대 같은 재료는 빼고)이 있는 환자를 셉니다.";
}

/// <summary>비고 칸에 프로그램이 넣는 글(DESIGN 3절). 이 글만 프로그램이 바꾸거나 지울 수 있다.</summary>
public static class NoteTexts
{
    public const string CarInsurance = "자동차보험";
    public const string HealthFund = "건강생활잔액";

    public static readonly IReadOnlyList<string> All = new[] { CarInsurance, HealthFund };
}

/// <summary>
/// 진료과 → 진료실 번호 저절로 붙이기(DESIGN 3절). 진료실 번호는 1~10.
/// 그 병원 진료과가 하나도 맞춰져 있지 않거나, 맞춤이 옛 기본값(OS→1, OS2→2) 그대로이고 그 병원에서 확인된 적이 없으면
/// 최근 90일 내원이 있는 진료과를 코드 차례로 1, 2, …(10까지) 붙인다. 내원이 있는 진료과가 없으면 오늘 쓰는 진료과로.
/// </summary>
public static class RoomPlan
{
    public const int MaxRoom = 10;

    /// <summary>예전 판의 기본 맞춤(양지바른). 다른 병원에서 이것이 그대로면 사람이 맞춘 것이 아니다.</summary>
    public static readonly IReadOnlyDictionary<string, int> OldDefault = new Dictionary<string, int> { { "OS", 1 }, { "OS2", 2 } };

    public static bool IsRoom(int n) => n >= 1 && n <= MaxRoom;

    /// <summary>
    /// 새 맞춤이 필요하면 그것, 아니면 null(지금 것을 그대로). confirmed = 이 병원 맞춤이 이미 확인됨(settings.DeptRoomsHospital = 병원).
    /// </summary>
    public static Dictionary<string, int>? Plan(IList<DeptInfo>? depts, IDictionary<string, int>? current, bool confirmed)
    {
        if (confirmed || depts == null || depts.Count == 0) return null;
        var mapped = new Dictionary<string, int>(current ?? new Dictionary<string, int>(), StringComparer.OrdinalIgnoreCase);
        var anyMapped = depts.Any(d => mapped.TryGetValue(d.Code ?? "", out var n) && IsRoom(n));
        if (anyMapped && !SameAsOldDefault(mapped)) return null; // 사람이 맞춘 것(옛 판에서): 그대로 두고 확인만
        var pick = depts.Where(d => d.Visits90 > 0).ToList();
        if (pick.Count == 0) pick = depts.Where(d => d.Current).ToList();
        var plan = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var i = 0;
        foreach (var d in pick.OrderBy(d => d.Code ?? "", NaturalCode.Instance))
        {
            if (++i > MaxRoom) break;
            plan[d.Code] = i;
        }
        return plan;
    }

    private static bool SameAsOldDefault(IDictionary<string, int> mapped) =>
        mapped.Count == OldDefault.Count && OldDefault.All(p => mapped.TryGetValue(p.Key, out var n) && n == p.Value);

    /// <summary>진료실 표에 보일 차례: 최근 90일 내원이 있는 진료과 → 오늘 쓰는 진료과 → 쓰지 않는 진료과, 각각 코드 차례.</summary>
    public static List<DeptInfo> DisplayOrder(IEnumerable<DeptInfo> depts) =>
        (depts ?? Enumerable.Empty<DeptInfo>())
            .OrderBy(d => d.Visits90 > 0 ? 0 : d.Current ? 1 : 2)
            .ThenBy(d => d.Code ?? "", NaturalCode.Instance)
            .ToList();
}

/// <summary>코드 차례: 글자는 글자대로, 숫자 묶음은 수 크기대로(OS2 &lt; OS10).</summary>
public sealed class NaturalCode : IComparer<string>
{
    public static readonly NaturalCode Instance = new NaturalCode();

    public int Compare(string a, string b)
    {
        a = (a ?? "").ToUpperInvariant();
        b = (b ?? "").ToUpperInvariant();
        int i = 0, j = 0;
        while (i < a.Length && j < b.Length)
        {
            if (char.IsDigit(a[i]) && char.IsDigit(b[j]))
            {
                int si = i, sj = j;
                while (i < a.Length && char.IsDigit(a[i])) i++;
                while (j < b.Length && char.IsDigit(b[j])) j++;
                var na = a.Substring(si, i - si).TrimStart('0');
                var nb = b.Substring(sj, j - sj).TrimStart('0');
                if (na.Length != nb.Length) return na.Length.CompareTo(nb.Length);
                var c = string.CompareOrdinal(na, nb);
                if (c != 0) return c;
            }
            else
            {
                if (a[i] != b[j]) return a[i].CompareTo(b[j]);
                i++;
                j++;
            }
        }
        return (a.Length - i).CompareTo(b.Length - j);
    }
}

/// <summary>
/// 처방 고르기 목록을 비트에서 불러오는 상태(설정 › 비트 맞춤). 빈 목록을 말없이 보이지 않게, 늘 쉬운 글을 하나 낸다.
/// 병원(비트 폴더 + 병원 코드)이 바뀌면 다시 불러온다.
/// </summary>
public sealed class CodeListState
{
    public enum Phase { Idle, Loading, Ready, Failed }

    public Phase Now { get; private set; } = Phase.Idle;
    /// <summary>상태가 바뀔 때(불러오기 시작·끝·실패). 열린 창들이 목록을 다시 그린다.</summary>
    public event Action? Changed;
    public string Scope { get; private set; } = "";
    public List<CodeUsage> Codes { get; private set; } = new List<CodeUsage>();
    public string Error { get; private set; } = "";

    /// <summary>이 병원으로 불러와야 하는가(아직 없음·실패·다른 병원).</summary>
    public bool NeedsLoad(string scope) => Now == Phase.Idle || Now == Phase.Failed || !string.Equals(Scope, scope ?? "", StringComparison.OrdinalIgnoreCase);

    public void Start(string scope)
    {
        Scope = scope ?? "";
        Now = Phase.Loading;
        Codes = new List<CodeUsage>();
        Error = "";
        Changed?.Invoke();
    }

    /// <summary>불러온 결과. 다른 병원 것이면(그 사이 바뀜) 버리고 false.</summary>
    public bool Done(string scope, List<CodeUsage> codes)
    {
        if (!string.Equals(Scope, scope ?? "", StringComparison.OrdinalIgnoreCase)) return false;
        Codes = codes ?? new List<CodeUsage>();
        Now = Phase.Ready;
        Changed?.Invoke();
        return true;
    }

    public bool Fail(string scope, string reason)
    {
        if (!string.Equals(Scope, scope ?? "", StringComparison.OrdinalIgnoreCase)) return false;
        Now = Phase.Failed;
        Error = string.IsNullOrWhiteSpace(reason) ? "비트를 읽지 못했어요." : reason.Trim();
        Changed?.Invoke();
        return true;
    }

    /// <summary>목록 자리에 보일 글. 목록이 있으면 "".</summary>
    public string Message
    {
        get
        {
            switch (Now)
            {
                case Phase.Idle:
                case Phase.Loading:
                    return "비트에서 최근 90일 처방 목록을 불러오는 중이에요…";
                case Phase.Failed:
                    return "처방 목록을 불러오지 못했어요. " + Error + " [다시 불러오기]를 눌러 주세요.";
                default:
                    return Codes.Count == 0 ? "최근 90일에 쓴 처방이 비트에 없어요. 고른 처방이 없으면 비트 분류로 셉니다." : "";
            }
        }
    }
}
