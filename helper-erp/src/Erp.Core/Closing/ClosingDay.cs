using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;

namespace Erp.Core.Closing;

/// <summary>
/// closing.day args의 묶음 하나(design.md 2절): key는 GroupKeys 가운데 하나, codes는 1~20개.
/// 매출 규칙 두 칸(TASK-15)은 보내지 않았으면 null: amountPrefixes 앞글자 0~5개 · amountCodes 더 셀 코드 0~20개.
/// 읽지 않을 처방 exclude(erp-closing-range REQ-3709, design.md 11절)도 보내지 않았으면 null: 코드 0~20개.
/// </summary>
public sealed class ClosingGroup
{
    public ClosingGroup(
        string key, IReadOnlyList<string> codes, IReadOnlyList<string>? amountPrefixes = null, IReadOnlyList<string>? amountCodes = null,
        IReadOnlyList<string>? exclude = null)
    {
        Key = key;
        Codes = codes;
        AmountPrefixes = amountPrefixes;
        AmountCodes = amountCodes;
        Exclude = exclude;
    }

    public string Key { get; }

    public IReadOnlyList<string> Codes { get; }

    public IReadOnlyList<string>? AmountPrefixes { get; }

    public IReadOnlyList<string>? AmountCodes { get; }

    public IReadOnlyList<string>? Exclude { get; }
}

/// <summary>closing.day 답(design.md 2절 ClosingDay). 칸 이름은 extension-erp/src/types.ts와 같다.</summary>
public sealed class ClosingDayResult
{
    [JsonPropertyName("date")]
    public string Date { get; set; } = "";

    [JsonPropertyName("patients")]
    public ClosingPatients Patients { get; set; } = new ClosingPatients();

    [JsonPropertyName("groups")]
    public IReadOnlyList<ClosingGroupCount> Groups { get; set; } = new ClosingGroupCount[0];

    [JsonPropertyName("ages")]
    public IReadOnlyList<ClosingAgeBand> Ages { get; set; } = new ClosingAgeBand[0];

    [JsonPropertyName("money")]
    public ClosingMoney Money { get; set; } = new ClosingMoney();

    [JsonPropertyName("inpatientVisits")]
    public long InpatientVisits { get; set; }

    [JsonPropertyName("reservations")]
    public ClosingReservations Reservations { get; set; } = new ClosingReservations();

    /// <summary>injection 묶음이 없으면 null.</summary>
    [JsonPropertyName("injection")]
    public ClosingInjection? Injection { get; set; }

    /// <summary>carm·sono 둘 다 매출 규칙이 있을 때만(TASK-15, design.md 3-3). 아니면 null.</summary>
    [JsonPropertyName("overlap")]
    public ClosingOverlap? Overlap { get; set; }

    [JsonPropertyName("warnings")]
    public ClosingWarnings Warnings { get; set; } = new ClosingWarnings();
}

/// <summary>환자현황(이미 정한 것 3). total = 다섯 칸의 합.</summary>
public sealed class ClosingPatients
{
    [JsonPropertyName("new")]
    public long New { get; set; }

    [JsonPropertyName("first90")]
    public long First90 { get; set; }

    [JsonPropertyName("return")]
    public long Return { get; set; }

    /// <summary>ptVisit 묶음이 없으면 null(그때는 재진·산정안함에서 빼지 않는다).</summary>
    [JsonPropertyName("ptVisit")]
    public long? PtVisit { get; set; }

    [JsonPropertyName("noExamFee")]
    public long NoExamFee { get; set; }

    [JsonPropertyName("total")]
    public long Total { get; set; }
}

/// <summary>묶음 하나: 서로 다른 환자 수·그날 묶음 코드 처방 줄 금액 합·그 사람들의 수납 없는 진료 수·3분류.</summary>
public sealed class ClosingGroupCount
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("patients")]
    public long Patients { get; set; }

    [JsonPropertyName("total")]
    public long Total { get; set; }

    [JsonPropertyName("unpaidVisits")]
    public long UnpaidVisits { get; set; }

    [JsonPropertyName("new")]
    public long New { get; set; }

    [JsonPropertyName("first90")]
    public long First90 { get; set; }

    [JsonPropertyName("return")]
    public long Return { get; set; }
}

/// <summary>연령 한 줄('0'·'10'·…·'90', 100세 이상은 '90')의 3분류.</summary>
public sealed class ClosingAgeBand
{
    [JsonPropertyName("band")]
    public string Band { get; set; } = "";

    [JsonPropertyName("new")]
    public long New { get; set; }

    [JsonPropertyName("first90")]
    public long First90 { get; set; }

    [JsonPropertyName("return")]
    public long Return { get; set; }
}

/// <summary>외래 수입 열두 칸(원, 원 미만은 칸마다 버림).</summary>
public sealed class ClosingMoney
{
    [JsonPropertyName("total")]
    public long? Total { get; set; }

    [JsonPropertyName("insurer")]
    public long? Insurer { get; set; }

    [JsonPropertyName("receivableIn")]
    public long? ReceivableIn { get; set; }

    [JsonPropertyName("unpaidNew")]
    public long? UnpaidNew { get; set; }

    [JsonPropertyName("noncovered")]
    public long? Noncovered { get; set; }

    [JsonPropertyName("discount")]
    public long? Discount { get; set; }

    [JsonPropertyName("disabledFund")]
    public long? DisabledFund { get; set; }

    [JsonPropertyName("received")]
    public long? Received { get; set; }

    [JsonPropertyName("card")]
    public long? Card { get; set; }

    [JsonPropertyName("cash")]
    public long? Cash { get; set; }

    [JsonPropertyName("transfer")]
    public long? Transfer { get; set; }

    [JsonPropertyName("refund")]
    public long? Refund { get; set; }
}

public sealed class ClosingReservations
{
    [JsonPropertyName("kinds")]
    public IReadOnlyList<ClosingReservationKind> Kinds { get; set; } = new ClosingReservationKind[0];

    [JsonPropertyName("patients")]
    public long Patients { get; set; }
}

/// <summary>예약 메모 번호 하나의 네 수.</summary>
public sealed class ClosingReservationKind
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("total")]
    public long Total { get; set; }

    [JsonPropertyName("visited")]
    public long Visited { get; set; }

    [JsonPropertyName("changed")]
    public long Changed { get; set; }

    [JsonPropertyName("canceled")]
    public long Canceled { get; set; }
}

/// <summary>운영 지표 주사 셋(이미 정한 것 6). 옛 자료가 따로 있으면 firstTime은 null.</summary>
public sealed class ClosingInjection
{
    [JsonPropertyName("firstTime")]
    public long? FirstTime { get; set; }

    [JsonPropertyName("newPatients")]
    public long NewPatients { get; set; }

    [JsonPropertyName("newLines")]
    public long NewLines { get; set; }
}

/// <summary>
/// 씨암·SONO 표시 코드가 함께 있는 진료(TASK-15, AC-3604.7): 진료 수와 그 진료들만의 각 매출 규칙 금액(원 미만 버림).
/// 진료·환자를 가리키는 값은 없다. groups total에는 이 진료가 들어 있다(= 둘 다 넣은 값).
/// </summary>
public sealed class ClosingOverlap
{
    [JsonPropertyName("visits")]
    public long Visits { get; set; }

    [JsonPropertyName("carm")]
    public long Carm { get; set; }

    [JsonPropertyName("sono")]
    public long Sono { get; set; }
}

public sealed class ClosingWarnings
{
    /// <summary>revenue.days가 금액을 확정하지 못한 날: 여덟 칸이 비트 수납 줄을 그대로 더한 값이다.</summary>
    [JsonPropertyName("moneyUnconfirmed")]
    public bool MoneyUnconfirmed { get; set; }

    /// <summary>청구액·비급여 나눔만 확정하지 못한 날: 그 두 칸이 그대로 더한 값이다.</summary>
    [JsonPropertyName("splitUnconfirmed")]
    public bool SplitUnconfirmed { get; set; }

    [JsonPropertyName("unpaidVisits")]
    public long UnpaidVisits { get; set; }

    [JsonPropertyName("unknownAge")]
    public long UnknownAge { get; set; }

    [JsonPropertyName("noHistory")]
    public bool NoHistory { get; set; }
}

/// <summary>
/// closing.day 계산(spec erp-closing-fill design.md 3-3). 금액은 revenue.days 그날 값(RevenueDays.Read) 위에 미수입금 나눔을 더하고,
/// 사람 수는 그날 진료 줄(ClosingSql.DayVisitsSql·DayCodesSql)을 도우미 안에서 센다. 진료번호·그날 번호는 답에 싣지 않는다(숫자만, AC-3606.2).
/// 마감일지 읽기는 모두 ERP 읽기 관문(ErpReadGuard)을 지난다(그날 매출 RevenueDays.Read는 기존 계산 그대로 기존 관문으로 읽는다).
/// 하나라도 실패하면 예외가 올라가 일부만 답하는 일이 없다.
/// </summary>
public static class ClosingDay
{
    /// <summary>묶음 key(design.md 2절 차례 그대로).</summary>
    public static readonly IReadOnlyList<string> GroupKeys = new[]
    {
        "carm", "sono", "arthro", "manual", "eswt", "pt", "etc1", "etc2", "etc3", "etc4",
        "manualConsult", "lipus", "nail", "ct", "surgery", "eswtStd", "eswtRadial", "injection", "ptVisit",
    };

    public const int MaxCodesPerGroup = 20;

    /// <summary>코드 한 개 최대 글자 수(commands.json closing.day codes 항목 max).</summary>
    public const int MaxCodeLength = 20;

    /// <summary>매출 규칙(TASK-15): 앞글자 최대 수·글자 수, 더 셀 코드 최대 수(commands.json amountPrefixes·amountCodes).</summary>
    public const int MaxAmountPrefixes = 5;
    public const int MaxPrefixLength = 10;
    public const int MaxAmountCodes = 20;

    /// <summary>읽지 않을 처방(exclude) 최대 수(commands.json closing.day exclude max, erp-closing-range design.md 11절).</summary>
    public const int MaxExclude = 20;

    public const string CarmKey = "carm";
    public const string SonoKey = "sono";

    // 코드 꼴(commands.json pattern ^\S(?: ?\S)*$와 같다, AC-3603.5): 앞뒤 공백 없음, 가운데는 빈칸(U+0020) 하나씩.
    // 빈칸 두 칸·탭·줄바꿈·다른 빈칸 글자는 맞지 않는다. 앞글자는 빈칸이 없다(^\S{1,10}$)
    private static readonly Regex CodeShape = new Regex(@"^\S(?: ?\S)*\z", RegexOptions.CultureInvariant);
    private static readonly Regex PrefixShape = new Regex(@"^\S+\z", RegexOptions.CultureInvariant);

    public const string PtVisitKey = "ptVisit";
    public const string InjectionKey = "injection";

    private static readonly string[] Bands = { "0", "10", "20", "30", "40", "50", "60", "70", "80", "90" };

    private const string Midnight = "0000";

    // 진찰구분 차례: 1 신환 → 3 90일초진 → 그 밖(0 아님) → 0 진찰료 산정안함
    private const int New = 0;
    private const int First90 = 1;
    private const int Other = 2;
    private const int NoExamFee = 3;

    public static ClosingDayResult Read(IBitDb db, string hospitalScope, DateTime date, IReadOnlyList<ClosingGroup> groups)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var day = date.Date;

        // 다음 날을 문장 매개변수로 쓴다. 9999-12-31은 다음 날을 셀 수 없다(AddDays가 던지면 도우미가 멈춘다)
        if (day == DateTime.MaxValue.Date) throw BadMessage();
        var wanted = CheckGroups(groups);

        var values = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@day"] = Key(day),
            ["@nextDay"] = Key(day.AddDays(1)),
            ["@from"] = Key(day) + Midnight,
            ["@to"] = Key(day.AddDays(1)) + Midnight,
            ["@hospital"] = hospitalScope,
        };

        var result = new ClosingDayResult { Date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) };
        ReadMoney(db, hospitalScope, day, values, result);

        var visits = ReadVisits(db, values);
        var people = People(visits, ReadCodes(db, values, visits));
        result.Warnings.UnpaidVisits = visits.Count(visit => visit.Total == null);
        CountPatients(people, wanted, result);
        result.Groups = wanted.Select(group => CountGroup(people, group)).ToList();
        result.Overlap = Overlap(visits, wanted);
        CountAges(people, result);
        result.Injection = Injection(db, values, people, wanted, result.Warnings);

        result.InpatientVisits = ClosingRead.Number(ClosingRead.Row(db, ClosingSql.InpatientSql, values, 1)[0]);
        result.Reservations = ReadReservations(db, values);
        return result;
    }

    // ---- 묶음 검사(AC-3603.1) ----------------------------------------------------------------------

    /// <summary>
    /// 묶음을 푼다. 명령 표(CommandTable)가 이미 검사하지만 처리기만 불려도 틀린 묶음으로 읽지 않게 DB에 닿기 전에 한 번 더 본다:
    /// 19개 넘음·모르는 key·같은 key 두 번·코드 0개나 21개 이상은 E-HELPER-BAD-MESSAGE. 코드는 앞뒤 공백을 떼고 대문자로(AC-3603.1) 바꾼 뒤
    /// 명령 표와 같은 꼴(1~20자, 가운데 빈칸 하나씩 — 'PROLO C'는 됨, 빈칸 두 칸·탭은 E-HELPER-BAD-MESSAGE, AC-3603.5)이어야 한다.
    /// 앞뒤 공백이 남은 코드는 명령 표 pattern이 먼저 막는다. 매출 규칙 두 칸(TASK-15, AC-3604.6): 앞글자 6개·더 셀 코드 21개·빈 글자·
    /// 앞글자 빈칸·11자·더 셀 코드 꼴 틀림은 E-HELPER-BAD-MESSAGE, 둘 다 대문자로. 읽지 않을 처방 exclude(AC-3709.2)도 코드 꼴 0~20개만, 대문자로.
    /// </summary>
    private static List<Wanted> CheckGroups(IReadOnlyList<ClosingGroup>? groups)
    {
        if (groups == null || groups.Count > GroupKeys.Count) throw BadMessage();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var wanted = new List<Wanted>();
        foreach (var group in groups)
        {
            if (group == null || group.Key == null || !GroupKeys.Contains(group.Key, StringComparer.Ordinal) || !seen.Add(group.Key)) throw BadMessage();
            if (group.Codes == null || group.Codes.Count < 1) throw BadMessage();
            var codes = CheckList(group.Codes, MaxCodesPerGroup, IsCode);
            var prefixes = CheckList(group.AmountPrefixes, MaxAmountPrefixes, IsPrefix);
            var amountCodes = CheckList(group.AmountCodes, MaxAmountCodes, IsCode);
            var exclude = CheckList(group.Exclude, MaxExclude, IsCode);
            wanted.Add(new Wanted(group.Key, codes, prefixes, amountCodes, exclude));
        }
        return wanted;
    }

    /// <summary>글자 목록 하나: max개 넘음·꼴 틀림은 E-HELPER-BAD-MESSAGE, 앞뒤 공백 뗀 대문자로 겹침 없이(받은 차례). 없으면(null) 빈 목록.</summary>
    private static List<string> CheckList(IReadOnlyList<string>? raw, int max, Func<string, bool> shape)
    {
        var list = new List<string>();
        if (raw == null) return list;
        if (raw.Count > max) throw BadMessage();
        foreach (var item in raw)
        {
            var text = NormalCode(item);
            if (!shape(text)) throw BadMessage();
            if (!list.Contains(text, StringComparer.Ordinal)) list.Add(text);
        }
        return list;
    }

    private static bool IsCode(string code) => code.Length >= 1 && code.Length <= MaxCodeLength && CodeShape.IsMatch(code);

    private static bool IsPrefix(string prefix) => prefix.Length >= 1 && prefix.Length <= MaxPrefixLength && PrefixShape.IsMatch(prefix);

    internal static string NormalCode(string? raw) => (raw ?? "").Trim().ToUpperInvariant();

    // ---- 금액(AC-3604.1·AC-3604.2) -----------------------------------------------------------------

    /// <summary>
    /// revenue.days 그날 값을 그대로 쓰고 미수입금 현금·카드·계좌(FinanceReceivable 4~6번째 칸)를 cash·card·transfer에 더한다.
    /// revenue.days가 확정하지 못한 날은 지어내지 않고 비트 수납 줄(FinanceNormal·FinanceReceivable)을 확정 검사 없이 그대로 더한 값을 넣고 경고 표시를 켠다:
    /// unconfirmed면 여덟 칸 모두(moneyUnconfirmed), splitUnconfirmed면 insurer·noncovered 두 칸(splitUnconfirmed). 원 미만은 칸마다 버린다.
    /// 미수발생·감액·장애인기금·환불은 늘 MoneyExtraSql 합(없으면 0, 환불은 부호를 뗀다).
    /// </summary>
    private static void ReadMoney(IBitDb db, string scope, DateTime day, IReadOnlyDictionary<string, object?> values, ClosingDayResult result)
    {
        var revenue = RevenueDays.Read(db, scope, day, day).Days[0];
        var normal = ClosingRead.Amounts(db, RevenueSql.FinanceNormal, values, 6);
        var receivable = ClosingRead.Amounts(db, RevenueSql.FinanceReceivable, values, 6);

        var unconfirmed = revenue.Unconfirmed
            || revenue.Total == null || revenue.ReceivableIn == null || revenue.Cash == null || revenue.Card == null || revenue.Transfer == null;
        var split = !unconfirmed && (revenue.SplitUnconfirmed || revenue.Insurer == null || revenue.Noncovered == null);

        var rawInsurer = ClosingRead.Won(ClosingRead.Add(normal[1], receivable[1]));
        var rawNoncovered = ClosingRead.Won(ClosingRead.Add(normal[2], receivable[2]));
        var money = result.Money;
        if (unconfirmed)
        {
            money.Total = ClosingRead.Won(ClosingRead.Add(normal[0], receivable[0]));
            money.ReceivableIn = ClosingRead.Won(ClosingRead.Add(ClosingRead.Add(receivable[3], receivable[4]), receivable[5]));
            money.Cash = ClosingRead.Won(normal[3]);
            money.Card = ClosingRead.Won(normal[4]);
            money.Transfer = ClosingRead.Won(normal[5]);
        }
        else
        {
            money.Total = revenue.Total;
            money.ReceivableIn = revenue.ReceivableIn;
            money.Cash = revenue.Cash;
            money.Card = revenue.Card;
            money.Transfer = revenue.Transfer;
        }
        money.Insurer = unconfirmed || split ? rawInsurer : revenue.Insurer;
        money.Noncovered = unconfirmed || split ? rawNoncovered : revenue.Noncovered;

        money.Cash += ClosingRead.Won(receivable[3]);
        money.Card += ClosingRead.Won(receivable[4]);
        money.Transfer += ClosingRead.Won(receivable[5]);
        money.Received = money.Cash + money.Card + money.Transfer;

        var extra = ClosingRead.Amounts(db, ClosingSql.MoneyExtraSql, values, 4);
        money.UnpaidNew = ClosingRead.Won(extra[0]);
        money.Discount = ClosingRead.Won(extra[1]);
        money.DisabledFund = ClosingRead.Won(extra[2]);
        money.Refund = Math.Abs(ClosingRead.Won(extra[3]));

        result.Warnings.MoneyUnconfirmed = unconfirmed;
        result.Warnings.SplitUnconfirmed = split;
    }

    // ---- 진료 줄 → 사람 ------------------------------------------------------------------------------

    private static List<Visit> ReadVisits(IBitDb db, IReadOnlyDictionary<string, object?> values)
    {
        var visits = new List<Visit>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in ClosingRead.Query(db, ClosingSql.DayVisitsSql, values))
        {
            if (row == null || row.Count < 5) throw ClosingRead.ReadFailed();
            var id = ClosingRead.Text(row[0]);
            if (string.IsNullOrEmpty(id) || !ids.Add(id!)) throw ClosingRead.ReadFailed();
            visits.Add(new Visit(
                id!,
                ClosingRead.Number(row[1]),
                ClosingRead.Text(row[2]) ?? "",
                row[3] == null ? (long?)null : ClosingRead.Number(row[3]),
                row[4] == null ? (decimal?)null : ClosingRead.Amount(row[4])));
        }
        return visits;
    }

    /// <summary>진료번호 → 코드 → 줄 수·금액(DayCodesSql 금액 칸, NULL은 0). 그날 진료 줄에 없는 진료의 처방은 버린다.</summary>
    private static Dictionary<string, Dictionary<string, CodeLines>> ReadCodes(IBitDb db, IReadOnlyDictionary<string, object?> values, List<Visit> visits)
    {
        var known = new HashSet<string>(visits.Select(visit => visit.Id), StringComparer.Ordinal);
        var codes = new Dictionary<string, Dictionary<string, CodeLines>>(StringComparer.Ordinal);
        foreach (var row in ClosingRead.Query(db, ClosingSql.DayCodesSql, values))
        {
            if (row == null || row.Count < 4) throw ClosingRead.ReadFailed();
            var id = ClosingRead.Text(row[0]) ?? "";
            var code = NormalCode(ClosingRead.Text(row[1]));
            var lines = ClosingRead.Number(row[2]);
            var amount = ClosingRead.Amount(row[3]);
            if (!known.Contains(id) || code.Length == 0) continue;
            if (!codes.TryGetValue(id, out var byCode)) codes[id] = byCode = new Dictionary<string, CodeLines>(StringComparer.Ordinal);
            byCode[code] = byCode.TryGetValue(code, out var before) ? before.Plus(lines, amount) : new CodeLines(lines, amount);
        }
        return codes;
    }

    /// <summary>
    /// 그날 번호마다 한 사람: 진찰구분은 그 사람 진료 가운데 1 → 3 → 그 밖(0 아님) → 0 차례로 앞선 하나, 만 나이는 첫 진료 값,
    /// 코드(줄 수·금액)는 진료마다 둔다(design.md 3-3. 묶음에 드는지는 진료 단위로 본다, erp-closing-range design.md 11절).
    /// </summary>
    private static List<Person> People(List<Visit> visits, Dictionary<string, Dictionary<string, CodeLines>> codes)
    {
        var people = new List<Person>();
        var byNumber = new Dictionary<long, Person>();
        foreach (var visit in visits)
        {
            if (!byNumber.TryGetValue(visit.Person, out var person))
            {
                person = new Person(visit.Age);
                byNumber[visit.Person] = person;
                people.Add(person);
            }
            person.Kind = Math.Min(person.Kind, KindOf(visit.ExamKind));
            person.Visits.Add(visit);
            if (codes.TryGetValue(visit.Id, out var byCode)) visit.Codes = byCode;
        }
        return people;
    }

    private static int KindOf(string examKind)
    {
        switch (examKind)
        {
            case "1": return New;
            case "3": return First90;
            case "0": return NoExamFee;
            default: return Other;
        }
    }

    // ---- 환자현황(AC-3603.2) ------------------------------------------------------------------------

    /// <summary>
    /// 신환 = 1, 90일초진 = 3, 물리치료내원 = ptVisit 묶음 코드를 받은 신환·90일초진 아닌 사람(묶음이 없으면 null이고 빼지 않음),
    /// 재진 = 그 밖(0 아님)에서 물리치료내원을 뺀 사람, 진찰료 산정안함 = 0에서 물리치료내원을 뺀 사람. 합계 = 다섯 칸의 합.
    /// </summary>
    private static void CountPatients(List<Person> people, List<Wanted> wanted, ClosingDayResult result)
    {
        var ptVisit = wanted.FirstOrDefault(group => group.Key == PtVisitKey);
        var patients = result.Patients;
        patients.PtVisit = ptVisit == null ? (long?)null : 0;
        foreach (var person in people)
        {
            if (person.Kind == New) patients.New++;
            else if (person.Kind == First90) patients.First90++;
            else if (ptVisit != null && person.Has(ptVisit)) patients.PtVisit++;
            else if (person.Kind == Other) patients.Return++;
            else patients.NoExamFee++;
        }
        patients.Total = patients.New + patients.First90 + patients.Return + (patients.PtVisit ?? 0) + patients.NoExamFee;
    }

    // ---- 묶음(AC-3603.3·AC-3604.3) ------------------------------------------------------------------

    /// <summary>
    /// 묶음에 드는 진료(Visit.Has: 묶음 코드가 하나라도 있고 exclude 코드는 하나도 없음)가 하나라도 있는 사람: 서로 다른 사람 수·3분류(재진 = 신환·90일초진이 아닌 모두),
    /// total = 그 진료들의 묶음 코드 처방 줄 금액(DayCodesSql 금액 = 원내 줄 일수 × 수량 × 단가) 합, 묶음마다 원 미만 버림
    /// (TASK-14, 기본값 (사). 진찰료·묶음 밖 코드 줄·진료 총진료비는 더하지 않고, 한 코드가 두 묶음에 들면 묶음마다 더한다).
    /// 매출 규칙이 있으면(TASK-15, AC-3604.6) total = 그 진료들 안의 규칙에 맞는 줄 금액 합(RuleAmount, 묶음마다 원 미만 버림).
    /// exclude 코드가 있는 진료는 사람 수·total·규칙 금액 모두에서 빠진다(AC-3709.2). exclude가 없으면 지금(0.2.0)과 같다.
    /// 수납 줄이 없는 진료도 처방 금액은 그대로이고, 그 사람들의 그런 진료 수를 unpaidVisits에 센다.
    /// </summary>
    private static ClosingGroupCount CountGroup(List<Person> people, Wanted group)
    {
        var count = new ClosingGroupCount { Key = group.Key };
        var amount = 0m;
        foreach (var person in people.Where(person => person.Has(group)))
        {
            count.Patients++;
            AddThree(person, () => count.New++, () => count.First90++, () => count.Return++);
            foreach (var visit in person.Visits.Where(visit => visit.Has(group)))
            {
                amount = ClosingRead.Add(amount, group.HasRule ? RuleAmount(visit, group) : CodeAmount(visit, group));
            }
            count.UnpaidVisits += person.Visits.Count(visit => visit.Total == null);
        }
        count.Total = ClosingRead.Won(amount);
        return count;
    }

    /// <summary>진료 하나의 묶음 코드 줄 금액 합(TASK-14).</summary>
    private static decimal CodeAmount(Visit visit, Wanted group)
    {
        var amount = 0m;
        foreach (var pair in visit.Codes.Where(pair => group.Codes.Contains(pair.Key))) amount = ClosingRead.Add(amount, pair.Value.Amount);
        return amount;
    }

    /// <summary>
    /// 진료 하나의 매출 규칙 금액(TASK-15, 기본값 (자)): 그 진료 처방 줄 가운데 코드가 앞글자 하나로 시작하고 바로 다음 글자가 숫자 0~9이거나
    /// (LA → LA358 맞음, LAYLA·'LA' 하나·LAX1 안 맞음) 더 셀 코드인 줄의 금액 합. 코드마다 한 번만 더하므로 두 규칙에 맞는 줄도 한 번이다.
    /// 견주기는 C#에서만 한다(새 SQL 문장·매개변수 없음, 규칙 글자는 SQL에 들어가지 않는다).
    /// </summary>
    private static decimal RuleAmount(Visit visit, Wanted group)
    {
        var amount = 0m;
        foreach (var pair in visit.Codes.Where(pair => group.Counts(pair.Key))) amount = ClosingRead.Add(amount, pair.Value.Amount);
        return amount;
    }

    /// <summary>
    /// 씨암·SONO가 함께 있는 진료(TASK-15, AC-3604.7): carm·sono 둘 다 매출 규칙이 있을 때만 두 묶음에 함께 드는(Visit.Has, exclude 진료는 빠짐, AC-3709.2)
    /// 진료 수와 그 진료들만의 각 규칙 금액(원 미만 버림). 아니면 null. 진료번호 같은 줄 값은 싣지 않는다.
    /// </summary>
    private static ClosingOverlap? Overlap(List<Visit> visits, List<Wanted> wanted)
    {
        var carm = wanted.FirstOrDefault(group => group.Key == CarmKey);
        var sono = wanted.FirstOrDefault(group => group.Key == SonoKey);
        if (carm == null || sono == null || !carm.HasRule || !sono.HasRule) return null;

        var overlap = new ClosingOverlap();
        decimal carmAmount = 0m, sonoAmount = 0m;
        foreach (var visit in visits.Where(visit => visit.Has(carm) && visit.Has(sono)))
        {
            overlap.Visits++;
            carmAmount = ClosingRead.Add(carmAmount, RuleAmount(visit, carm));
            sonoAmount = ClosingRead.Add(sonoAmount, RuleAmount(visit, sono));
        }
        overlap.Carm = ClosingRead.Won(carmAmount);
        overlap.Sono = ClosingRead.Won(sonoAmount);
        return overlap;
    }

    private static void AddThree(Person person, Action addNew, Action addFirst90, Action addReturn)
    {
        if (person.Kind == New) addNew();
        else if (person.Kind == First90) addFirst90();
        else addReturn();
    }

    // ---- 연령(AC-3603.4) ---------------------------------------------------------------------------

    /// <summary>만 나이 10살 단위 10줄(100세 이상은 '90'). 만 나이가 없거나 틀린 사람은 넣지 않고 unknownAge에 센다.</summary>
    private static void CountAges(List<Person> people, ClosingDayResult result)
    {
        var bands = Bands.Select(band => new ClosingAgeBand { Band = band }).ToList();
        foreach (var person in people)
        {
            if (person.Age == null || person.Age < 0)
            {
                result.Warnings.UnknownAge++;
                continue;
            }
            var band = bands[(int)Math.Min(person.Age.Value / 10, Bands.Length - 1)];
            AddThree(person, () => band.New++, () => band.First90++, () => band.Return++);
        }
        result.Ages = bands;
    }

    // ---- 주사(AC-3605.2) ---------------------------------------------------------------------------

    /// <summary>
    /// injection 묶음이 있을 때만: newPatients = 신환 가운데 그 묶음 사람, newLines = 그들의 묶음에 드는 진료의 묶음 코드 줄 수 합,
    /// firstTime = InjectionFirstSql(옛 자료가 따로 있는 DB(HistoryGuard ≠ 0)면 부르지 않고 null, noHistory).
    /// </summary>
    private static ClosingInjection? Injection(
        IBitDb db, IReadOnlyDictionary<string, object?> values, List<Person> people, List<Wanted> wanted, ClosingWarnings warnings)
    {
        var group = wanted.FirstOrDefault(item => item.Key == InjectionKey);
        if (group == null) return null;

        var injection = new ClosingInjection();
        foreach (var person in people.Where(person => person.Kind == New && person.Has(group)))
        {
            injection.NewPatients++;
            injection.NewLines += person.Visits.Where(visit => visit.Has(group))
                .Sum(visit => visit.Codes.Where(pair => group.Codes.Contains(pair.Key)).Sum(pair => pair.Value.Lines));
        }

        var history = ClosingRead.Number(ClosingRead.Row(db, RevenueSql.HistoryGuard, values, 1)[0]);
        if (history != 0)
        {
            warnings.NoHistory = true;
            return injection;
        }

        var slots = values.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        for (var i = 0; i < ClosingSql.CodeSlots; i++)
        {
            slots["@c" + i.ToString(CultureInfo.InvariantCulture)] = i < group.Ordered.Count ? group.Ordered[i] : group.Ordered[0];
        }
        injection.FirstTime = ClosingRead.Number(ClosingRead.Row(db, ClosingSql.InjectionFirstSql, slots, 1)[0]);
        return injection;
    }

    // ---- 예약(AC-3605.1·AC-3616.1) -------------------------------------------------------------------

    /// <summary>
    /// 예약 메모 번호마다 네 수. 번호는 closing.codes kinds와 같은 규칙(ClosingCodes.MemoKind: 앞뒤 공백 뗌, 'Memo'+숫자 → 숫자)으로 바꾸고,
    /// 같은 번호가 된 줄('Memo1'·'memo1'·'1')은 네 수를 더해 한 줄로 한다(AC-3616.1). 빈 번호도 한 줄. 번호 글자 차례(Ordinal).
    /// 확장(cells.ts)은 글자가 같은 번호만 더하므로 도우미에서 맞춘다. 문장은 그대로다.
    /// </summary>
    private static ClosingReservations ReadReservations(IBitDb db, IReadOnlyDictionary<string, object?> values)
    {
        var kinds = new Dictionary<string, ClosingReservationKind>(StringComparer.Ordinal);
        foreach (var row in ClosingRead.Query(db, ClosingSql.ReservationKindsSql, values))
        {
            if (row == null || row.Count < 5) throw ClosingRead.ReadFailed();
            var key = ClosingCodes.MemoKind(ClosingRead.Text(row[0]));
            if (!kinds.TryGetValue(key, out var kind))
            {
                kind = new ClosingReservationKind { Kind = key };
                kinds.Add(key, kind);
            }
            kind.Total += ClosingRead.Number(row[1]);
            kind.Visited += ClosingRead.Number(row[2]);
            kind.Changed += ClosingRead.Number(row[3]);
            kind.Canceled += ClosingRead.Number(row[4]);
        }
        return new ClosingReservations
        {
            Kinds = kinds.Values.OrderBy(kind => kind.Kind, StringComparer.Ordinal).ToList(),
            Patients = ClosingRead.Number(ClosingRead.Row(db, ClosingSql.ReservationPatientsSql, values, 1)[0]),
        };
    }

    private static string Key(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static HelperException BadMessage() => new HelperException(ErrorCodes.BadMessage);

    /// <summary>검사를 지난 묶음: key·코드(대문자, 겹침 없음, args 차례)·매출 규칙(앞글자·더 셀 코드, 대문자)·읽지 않을 처방(exclude, 대문자).</summary>
    private sealed class Wanted
    {
        public Wanted(string key, List<string> ordered, List<string> prefixes, List<string> amountCodes, List<string> exclude)
        {
            Key = key;
            Ordered = ordered;
            Codes = new HashSet<string>(ordered, StringComparer.Ordinal);
            Prefixes = prefixes;
            AmountCodes = new HashSet<string>(amountCodes, StringComparer.Ordinal);
            Exclude = new HashSet<string>(exclude, StringComparer.Ordinal);
        }

        public string Key { get; }

        public List<string> Ordered { get; }

        public HashSet<string> Codes { get; }

        public List<string> Prefixes { get; }

        public HashSet<string> AmountCodes { get; }

        /// <summary>이 코드가 하나라도 있는 진료는 이 묶음에 들지 않는다(AC-3709.2). 비면 지금과 같다.</summary>
        public HashSet<string> Exclude { get; }

        /// <summary>앞글자·더 셀 코드가 하나라도 있으면 매출 규칙으로 센다(둘 다 비면 TASK-14 그대로).</summary>
        public bool HasRule => Prefixes.Count > 0 || AmountCodes.Count > 0;

        /// <summary>이 코드(대문자) 줄을 매출 규칙으로 세나: 더 셀 코드이거나, 앞글자로 시작하고 바로 다음 글자가 숫자 0~9.</summary>
        public bool Counts(string code) =>
            AmountCodes.Contains(code)
            || Prefixes.Any(prefix => code.Length > prefix.Length
                && code.StartsWith(prefix, StringComparison.Ordinal)
                && code[prefix.Length] >= '0' && code[prefix.Length] <= '9');
    }

    /// <summary>진료 하나의 코드 하나: 처방 줄 수·금액 합(도우미 안에서만 쓴다).</summary>
    private readonly struct CodeLines
    {
        public CodeLines(long lines, decimal amount)
        {
            Lines = lines;
            Amount = amount;
        }

        public long Lines { get; }

        public decimal Amount { get; }

        public CodeLines Plus(long lines, decimal amount) => new CodeLines(Lines + lines, ClosingRead.Add(Amount, amount));
    }

    /// <summary>그날 진료 한 줄(도우미 안에서만 쓴다). Total(마지막 정상 수납 줄 총진료비)은 수납 끝남(unpaidVisits)에만 쓴다.</summary>
    private sealed class Visit
    {
        public Visit(string id, long person, string examKind, long? age, decimal? total)
        {
            Id = id;
            Person = person;
            ExamKind = examKind;
            Age = age;
            Total = total;
        }

        public string Id { get; }

        public long Person { get; }

        public string ExamKind { get; }

        public long? Age { get; }

        public decimal? Total { get; }

        /// <summary>이 진료의 코드 → 줄 수·금액(처방이 없으면 빈 표). 매출 규칙은 진료 단위로 본다(TASK-15).</summary>
        public Dictionary<string, CodeLines> Codes { get; set; } = new Dictionary<string, CodeLines>(StringComparer.Ordinal);

        /// <summary>이 진료가 묶음에 드나: 묶음 코드가 하나라도 있고 exclude 코드는 하나도 없음(AC-3709.2). 사람 수·total·규칙 금액·overlap이 모두 이것을 쓴다.</summary>
        public bool Has(Wanted group) => Codes.Keys.Any(group.Codes.Contains) && !Codes.Keys.Any(group.Exclude.Contains);
    }

    /// <summary>그날 한 사람(도우미 안에서만 쓴다).</summary>
    private sealed class Person
    {
        public Person(long? age)
        {
            Age = age;
        }

        public int Kind { get; set; } = NoExamFee;

        public long? Age { get; }

        public List<Visit> Visits { get; } = new List<Visit>();

        /// <summary>그 사람의 진료 가운데 하나라도 묶음에 드나(Visit.Has).</summary>
        public bool Has(Wanted group) => Visits.Any(visit => visit.Has(group));
    }
}

/// <summary>마감일지 읽기가 같이 쓰는 관문 부르기·칸 바꾸기(RevenueDays와 같은 규칙: DB NULL은 0, 숫자로 못 읽으면 E-BIT-READ-FAILED).</summary>
internal static class ClosingRead
{
    /// <summary>웹이 받는 가장 큰 정수(Number.isSafeInteger). 넘는 금액은 지어낸 값이 되지 않게 읽기 실패로 본다.</summary>
    private const long MaxSafeInteger = 9007199254740991L;

    /// <summary>정해 둔 문장을 그 문장 매개변수 표(ErpReadGuard.ParametersOf)에 있는 값만 골라 ERP 읽기 관문으로 돌린다.</summary>
    public static IReadOnlyList<IReadOnlyList<object?>> Query(
        IBitDb db, string sql, IReadOnlyDictionary<string, object?> values, TimeSpan? timeout = null)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var parameter in ErpReadGuard.ParametersOf(sql))
        {
            if (!values.TryGetValue(parameter.Name, out var value)) throw ReadFailed();
            args[parameter.Name] = value;
        }
        return ErpReadGuard.Query(db, sql, args, timeout ?? ClosingSql.ReadTimeout);
    }

    /// <summary>합계 문장의 답은 늘 한 줄이다. 줄·칸이 모자라면 지어내지 않고 읽기 실패로 본다.</summary>
    public static IReadOnlyList<object?> Row(IBitDb db, string sql, IReadOnlyDictionary<string, object?> values, int cells)
    {
        var rows = Query(db, sql, values);
        if (rows.Count != 1 || rows[0] == null || rows[0].Count < cells) throw ReadFailed();
        return rows[0];
    }

    public static decimal[] Amounts(IBitDb db, string sql, IReadOnlyDictionary<string, object?> values, int cells)
    {
        var row = Row(db, sql, values, cells);
        return Enumerable.Range(0, cells).Select(i => Amount(row[i])).ToArray();
    }

    /// <summary>글자 칸: 앞뒤 공백을 뺀 글자, DB NULL은 null.</summary>
    public static string? Text(object? cell) => cell == null ? null : (Convert.ToString(cell, CultureInfo.InvariantCulture) ?? "").Trim();

    /// <summary>DB NULL은 0.</summary>
    public static long Number(object? cell) => FromCell(cell, value => Convert.ToInt64(value, CultureInfo.InvariantCulture), 0L);

    /// <summary>DB NULL은 0.</summary>
    public static decimal Amount(object? cell) => FromCell(cell, value => Convert.ToDecimal(value, CultureInfo.InvariantCulture), 0m);

    public static decimal Add(decimal left, decimal right)
    {
        try
        {
            return left + right;
        }
        catch (OverflowException)
        {
            throw ReadFailed();
        }
    }

    /// <summary>원 미만 버림(plan.md §5). 웹이 받지 못하는 큰 값은 읽기 실패로 본다.</summary>
    public static long Won(decimal amount)
    {
        var whole = decimal.Truncate(amount);
        if (whole > MaxSafeInteger || whole < -MaxSafeInteger) throw ReadFailed();
        return decimal.ToInt64(whole);
    }

    public static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);

    private static T FromCell<T>(object? cell, Func<object, T> convert, T whenNull)
    {
        if (cell == null) return whenNull;
        try
        {
            return convert(cell);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw ReadFailed();
        }
    }
}
