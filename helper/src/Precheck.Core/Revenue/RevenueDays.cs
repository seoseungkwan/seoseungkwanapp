using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Stats;

namespace Precheck.Core.Revenue;

/// <summary>하루 한 줄(design.md 5-2). 칸 이름은 웹 src/types/revenue.ts와 같다. 정할 수 없는 칸은 null.</summary>
public sealed class RevenueDay
{
    [JsonPropertyName("date")]
    public string Date { get; set; } = "";

    [JsonPropertyName("visits")]
    public long? Visits { get; set; }

    [JsonPropertyName("newPatients")]
    public long? NewPatients { get; set; }

    [JsonPropertyName("returnVisits")]
    public long? ReturnVisits { get; set; }

    [JsonPropertyName("total")]
    public long? Total { get; set; }

    [JsonPropertyName("insurer")]
    public long? Insurer { get; set; }

    [JsonPropertyName("noncovered")]
    public long? Noncovered { get; set; }

    [JsonPropertyName("copay")]
    public long? Copay { get; set; }

    [JsonPropertyName("otherTotal")]
    public long? OtherTotal { get; set; }

    [JsonPropertyName("cash")]
    public long? Cash { get; set; }

    [JsonPropertyName("card")]
    public long? Card { get; set; }

    [JsonPropertyName("transfer")]
    public long? Transfer { get; set; }

    [JsonPropertyName("receivableIn")]
    public long? ReceivableIn { get; set; }

    /// <summary>금액 아홉 칸이 모두 null이다(도우미 0.13.0부터 금액이 음수인 날만, spec bit-total AC-6912.2). SplitUnconfirmed와 함께 참이 되지 않는다.</summary>
    [JsonPropertyName("unconfirmed")]
    public bool Unconfirmed { get; set; }

    /// <summary>나눔 네 칸(insurer·noncovered·copay·otherTotal)만 null이고 남는 다섯 칸은 숫자다.</summary>
    [JsonPropertyName("splitUnconfirmed")]
    public bool SplitUnconfirmed { get; set; }

    /// <summary>
    /// 확인 필요한 날(Unconfirmed)의 참고 금액(spec first90 AC-4405.1, 도우미 0.7.0부터). 원 단위 정수이고 환불이 크면 음수다.
    /// 0.13.0부터 Unconfirmed는 금액이 음수인 날뿐이라 이 값도 그날에만 생긴다(spec bit-total AC-6912.2).
    /// 그 밖의 날은 null이고 JSON에 열쇠를 쓰지 않는다(AC-4405.2).
    /// </summary>
    [JsonPropertyName("roughTotal")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? RoughTotal { get; set; }
}

/// <summary>기간 전체의 처방 코드 한 줄. Name은 없으면 null, Amount는 값 빠짐이면 null(AC-002.2).</summary>
public sealed class RevenueCode
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = "";

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("count")]
    public long Count { get; set; }

    [JsonPropertyName("amount")]
    public long? Amount { get; set; }
}

/// <summary>revenue.days 답 {days, codes, dayCodes}(dayCodes는 도우미 0.6.0부터, 날 줄의 roughTotal은 0.7.0부터).</summary>
public sealed class RevenueResult
{
    public RevenueResult(IReadOnlyList<RevenueDay> days, IReadOnlyList<RevenueCode> codes, IReadOnlyList<object?[]> dayCodes)
    {
        Days = days;
        Codes = codes;
        DayCodes = dayCodes;
    }

    [JsonPropertyName("days")]
    public IReadOnlyList<RevenueDay> Days { get; }

    [JsonPropertyName("codes")]
    public IReadOnlyList<RevenueCode> Codes { get; }

    /// <summary>날 단위 처방 줄 [날짜(yyyy-MM-dd), 코드, 건수, 금액 또는 null]. 날짜 차례, 같은 날은 코드 글자(Ordinal) 차례(REQ-4101).</summary>
    [JsonPropertyName("dayCodes")]
    public IReadOnlyList<object?[]> DayCodes { get; }
}

/// <summary>
/// 날짜별 합계 금액·건수와 기간의 처방 코드별 합계를 읽는다(REQ-003, design.md 4-2·5-2). 환자 줄은 비트 DB 밖으로 나오지 않는다.
/// 모든 읽기는 ReadOnlyGuard를 지난다. 하나라도 실패하면 예외가 올라가 일부만 답하는 일이 없다(AC-003.6).
/// </summary>
public static class RevenueDays
{
    public const int MaxDays = 31;
    public const int MaxCodes = 1000;

    /// <summary>dayCodes 하루 줄 수 한도(_REST 포함). MaxDays × 이것 = 답 한도 9,300줄(design.md 잰 것).</summary>
    public const int MaxDayCodesPerDay = 300;

    /// <summary>모양이 맞지 않거나 1,000개를 넘쳐 합친 나머지(이름 없는 '그 밖').</summary>
    public const string RestCode = "_REST";

    private const int MaxNameLength = 100;
    private const string Midnight = "0000";

    /// <summary>웹이 받는 가장 큰 정수(isRevenueDays의 Number.isSafeInteger). 넘으면 답 전체가 거부된다.</summary>
    private const long MaxSafeInteger = 9007199254740991L;

    /// <summary>원본 OperationalReportData.Command의 CommandTimeout=90.</summary>
    private static readonly TimeSpan QueryTimeout = TimeSpan.FromSeconds(90);

    private static readonly IReadOnlyDictionary<string, string> NoValues = new Dictionary<string, string>();

    // AC-002.2 코드 모양(웹 REVENUE_CODE_SHAPE와 같다). .NET의 $는 끝 줄바꿈 앞에서도 맞으므로 \z로 끝을 잡는다
    private static readonly Regex CodeShape = new Regex(@"^[0-9A-Za-z가-힣_.\-]{1,30}\z", RegexOptions.CultureInvariant);

    // 이름에 남기면 안 되는 글자: 웹 검사가 거부하는 줄바꿈·제어 문자(C0·DEL·C1·U+2028·U+2029)와 답을 만들지 못하게 하는 짝 없는 대리쌍
    private static readonly Regex NameJunk = new Regex(
        @"(?:[\u0000-\u001F\u007F-\u009F\u2028\u2029]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])+",
        RegexOptions.CultureInvariant);

    public static RevenueResult Read(IBitDb db, string hospitalScope, DateTime from, DateTime to)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var first = from.Date;
        var last = to.Date;
        if (last < first || (last - first).Days + 1 > MaxDays) throw new HelperException(ErrorCodes.BadMessage);

        // 끝날의 다음 날을 문장 매개변수로 쓴다. 9999-12-31은 명령 표를 지나지만 다음 날을 셀 수 없다(AddDays가 던지면 도우미가 멈춘다)
        if (last == DateTime.MaxValue.Date) throw new HelperException(ErrorCodes.BadMessage);

        var historyKnown = Number(Row(db, RevenueSql.HistoryGuard, NoValues, 1)[0]) == 0;
        var days = new List<RevenueDay>();
        for (var day = first; day <= last; day = day.AddDays(1))
        {
            days.Add(ReadDay(db, hospitalScope, day, historyKnown));
        }
        var codes = ReadCodes(db, hospitalScope, first, last);
        return new RevenueResult(days, codes, ReadDayCodes(db, hospitalScope, first, last));
    }

    private static RevenueDay ReadDay(IBitDb db, string scope, DateTime day, bool historyKnown)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["@day"] = Key(day),
            ["@nextDay"] = Key(day.AddDays(1)),
            ["@from"] = Key(day) + Midnight,
            ["@to"] = Key(day.AddDays(1)) + Midnight,
            ["@hospital"] = scope,
        };
        var row = new RevenueDay { Date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) };
        ReadMoney(db, values, row);
        ReadVisits(db, values, historyKnown, row);
        return row;
    }

    /// <summary>
    /// 그날 금액을 읽는다. 도우미 0.13.0(spec bit-total AC-6912.1)부터 세 검사(환불·변경수납·예치금·연결 중복)를 돌리지 않고, 그런 날도 다른 날과 같은
    /// 문장 넷(FinanceNormal → FinanceReceivable → 두 Extra)으로 같은 칸을 채운다. RevenueSql의 세 검사 상수는 수납일지가 계속 쓴다.
    /// 맞춰 고치지 않고 칸을 비운다. 두 표시는 함께 참이 되지 않는다(AC-003.2):
    /// Unconfirmed(금액 아홉 칸 null) = total·cash·card·transfer·receivableIn의 음수(AC-6912.2: DB 칸 >= 0 제약과 웹 검사가 음수 금액을 받지 않는다). 이쪽을 먼저 본다.
    /// SplitUnconfirmed(나눔 네 칸만 null, 남는 다섯 칸은 그대로) = insurer + copay ≠ 요양비용총액 또는 insurer·noncovered·copay·otherTotal의 음수(AC-6912.3, 지금 그대로).
    /// otherTotal은 나머지라서 총액에 섞인 다른 금액도 여기에 든다. 그것을 잡는 것은 의원 PC 확인표 ⑤뿐이다(design.md 2절 2).
    /// Unconfirmed로 끝나는 곳(음수)에서만 참고 금액 RoughTotal을 더 읽는다(spec first90 AC-4405.1, bit-total AC-6912.2).
    /// </summary>
    private static void ReadMoney(IBitDb db, IReadOnlyDictionary<string, string> values, RevenueDay row)
    {
        var normal = Amounts(db, RevenueSql.FinanceNormal, values, 6);
        var receivable = Amounts(db, RevenueSql.FinanceReceivable, values, 6);
        var normalExtra = Amounts(db, RevenueSql.FinanceNormalExtra, values, 2);
        var receivableExtra = Amounts(db, RevenueSql.FinanceReceivableExtra, values, 2);

        var exactInsurer = Add(normal[1], receivable[1]);
        var exactInsuredTotal = Add(normalExtra[0], receivableExtra[0]);
        var exactCopay = Add(normalExtra[1], receivableExtra[1]);

        var total = Won(Add(normal[0], receivable[0]));
        var insurer = Won(exactInsurer);
        var noncovered = Won(Add(normal[2], receivable[2]));
        var copay = Won(exactCopay);
        var otherTotal = total - (insurer + copay) - noncovered;
        var cash = Won(normal[3]);
        var card = Won(normal[4]);
        var transfer = Won(normal[5]);
        var receivableIn = Won(Add(Add(receivable[3], receivable[4]), receivable[5]));

        // 음수는 버린 뒤의 칸으로 본다
        if (new[] { total, cash, card, transfer, receivableIn }.Any(value => value < 0))
        {
            row.Unconfirmed = true;
            row.RoughTotal = Rough(db, values);
            return;
        }

        row.Total = total;
        row.Cash = cash;
        row.Card = card;
        row.Transfer = transfer;
        row.ReceivableIn = receivableIn;

        // 원 미만을 버리기 전 값으로 비교한다(1000.5 + 499.5와 1500은 같다)
        var sameInsured = Add(exactInsurer, exactCopay) == exactInsuredTotal;
        if (!sameInsured || new[] { insurer, noncovered, copay, otherTotal }.Any(value => value < 0))
        {
            row.SplitUnconfirmed = true;
            return;
        }

        row.Insurer = insurer;
        row.Noncovered = noncovered;
        row.Copay = copay;
        row.OtherTotal = otherTotal;
    }

    /// <summary>
    /// 금액이 음수라 확인 필요한 날의 참고 금액(spec first90 AC-4405.1, bit-total AC-6912.2): 통계 원장님별 금액 doctorDays와 같은 두 문장(StatsSql 정상수납 → 미수입금)을
    /// 그날 @day·@nextDay·@hospital로 읽는다. 줄마다 셋째 칸(총진료비)의 원 미만을 버리고(0 쪽으로) 모두 더한다. 환불 음수는 그대로 빼고,
    /// 진료의 칸이 빈 줄도 그날 수납이라 더한다. 칸이 모자라거나 숫자가 아니거나 웹이 받지 못하는 큰 값이면 읽기 실패다(일부만 답하지 않음).
    /// </summary>
    private static long Rough(IBitDb db, IReadOnlyDictionary<string, string> values)
    {
        var sum = 0m;
        foreach (var sql in new[] { StatsSql.DoctorMoneyNormalSql, StatsSql.DoctorMoneyReceivableSql })
        {
            foreach (var line in Query(db, sql, values, StatsSql.ParametersOf(sql)))
            {
                if (line.Count < 3) throw ReadFailed();
                sum = Add(sum, Won(Amount(line[2])));
            }
        }
        return Won(sum);
    }

    /// <summary>AC-003.3. 재진이 음수가 되면 원본은 멈춘다(invalid_aggregate). 여기서는 검사 칸과 같게 그날 셋 다 null로 둔다.</summary>
    private static void ReadVisits(IBitDb db, IReadOnlyDictionary<string, string> values, bool historyKnown, RevenueDay row)
    {
        var cells = Row(db, RevenueSql.Patients, values, 5);
        var visits = Number(cells[0]);
        var newPatients = Number(cells[1]);
        var checksClear = Number(cells[2]) == 0 && Number(cells[3]) == 0 && Number(cells[4]) == 0;
        if (!checksClear || visits < 0 || (historyKnown && (newPatients < 0 || newPatients > visits))) return;

        row.Visits = visits;
        if (!historyKnown) return;
        row.NewPatients = newPatients;
        row.ReturnVisits = visits - newPatients;
    }

    private static IReadOnlyList<RevenueCode> ReadCodes(IBitDb db, string scope, DateTime first, DateTime last) =>
        TidyCodes(Query(db, RevenueSql.CodeAmounts, PeriodValues(scope, first, last)));

    /// <summary>기간 문장 매개변수: 첫날 0000 ~ 끝날 다음 날 0000.</summary>
    private static Dictionary<string, string> PeriodValues(string scope, DateTime first, DateTime last) =>
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["@from"] = Key(first) + Midnight,
            ["@to"] = Key(last.AddDays(1)) + Midnight,
            ["@hospital"] = scope,
        };

    /// <summary>
    /// 날 단위 처방 줄(REQ-4101). 문장은 기간에 한 번. 정리는 TidyCodes와 같은 규칙을 날마다 한다: 앞뒤 공백을 뺀 같은 코드는 그날 한 줄로
    /// 합치고, 모양이 틀린 코드·_REST, 하루 300줄을 넘게 하는 금액 순 299번째 뒤 코드(금액 null은 맨 뒤)는 그날 _REST 한 줄로 합친다.
    /// 금액은 합친 decimal에서 원 미만을 버리고(웹이 받지 못하는 값은 null), 빠진 값이 섞이면 null. 날 글자가 yyyyMMdd가 아니거나 기간 밖이면 읽기 실패.
    /// </summary>
    private static IReadOnlyList<object?[]> ReadDayCodes(IBitDb db, string scope, DateTime first, DateTime last)
    {
        var days = new SortedDictionary<DateTime, DayLines>();
        foreach (var row in Query(db, RevenueSql.CodeAmountsByDay, PeriodValues(scope, first, last)))
        {
            if (row.Count < 5) throw ReadFailed();
            var day = DayOf(row[0], first, last);
            if (!days.TryGetValue(day, out var lines)) days[day] = lines = new DayLines();
            lines.Add(new DayCode
            {
                Code = (row[1] as string ?? "").Trim(),
                Count = Number(row[2]),
                Amount = Number(row[4]) != 0 ? null : Amount(row[3]),
            });
        }

        var result = new List<object?[]>();
        foreach (var pair in days)
        {
            var date = pair.Key.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            foreach (var line in pair.Value.Fold())
            {
                result.Add(new object?[] { date, line.Code, line.Count, line.Amount.HasValue ? WebAmount(line.Amount.Value) : null });
            }
        }
        return result;
    }

    private static DateTime DayOf(object? cell, DateTime first, DateTime last)
    {
        if (!(cell is string text)
            || !DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            || day < first || day > last)
        {
            throw ReadFailed();
        }
        return day;
    }

    /// <summary>날 단위 한 줄. 금액은 버리기 전 decimal(null = 값 빠짐).</summary>
    private sealed class DayCode
    {
        public string Code { get; set; } = "";

        public long Count { get; set; }

        public decimal? Amount { get; set; }
    }

    /// <summary>하루치 코드 줄: 맞는 모양은 코드별로 합치고, 그 밖은 _REST 몫으로 모은다.</summary>
    private sealed class DayLines
    {
        private readonly Dictionary<string, DayCode> merged = new Dictionary<string, DayCode>(StringComparer.Ordinal);
        private readonly List<DayCode> rest = new List<DayCode>();

        public void Add(DayCode line)
        {
            if (!CodeShape.IsMatch(line.Code) || line.Code == RestCode)
            {
                rest.Add(line);
            }
            else if (merged.TryGetValue(line.Code, out var same))
            {
                same.Count += line.Count;
                same.Amount = AddDecimals(same.Amount, line.Amount);
            }
            else
            {
                merged[line.Code] = line;
            }
        }

        /// <summary>하루 MaxDayCodesPerDay줄 이하, 코드 글자 차례.</summary>
        public IEnumerable<DayCode> Fold()
        {
            var ordered = merged.Values
                .OrderBy(code => code.Amount.HasValue ? 0 : 1)
                .ThenByDescending(code => code.Amount ?? 0m)
                .ThenBy(code => code.Code, StringComparer.Ordinal)
                .ToList();
            var folded = new List<DayCode>(rest);
            if (ordered.Count + (folded.Count > 0 ? 1 : 0) > MaxDayCodesPerDay)
            {
                folded.AddRange(ordered.Skip(MaxDayCodesPerDay - 1));
                ordered = ordered.Take(MaxDayCodesPerDay - 1).ToList();
            }
            if (folded.Count > 0)
            {
                ordered.Add(new DayCode
                {
                    Code = RestCode,
                    Count = folded.Sum(code => code.Count),
                    Amount = folded.Aggregate((decimal?)0m, (sum, code) => AddDecimals(sum, code.Amount)),
                });
            }
            return ordered.OrderBy(code => code.Code, StringComparer.Ordinal);
        }
    }

    /// <summary>둘 중 하나라도 null(값 빠짐)이면 null. decimal을 넘치면 웹이 받지 못하는 금액이므로 null.</summary>
    private static decimal? AddDecimals(decimal? left, decimal? right)
    {
        if (!left.HasValue || !right.HasValue) return null;
        try
        {
            return left.Value + right.Value;
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    /// <summary>
    /// 코드 줄 정리(design.md 4-2). 코드 때문에 한 달이 실패하지 않는다: 앞뒤 공백을 뺀 뒤 같은 코드는 합치고, 모양이 틀린 코드와
    /// 금액 순 999번째 뒤 코드(금액 null은 맨 뒤)는 _REST 한 줄로 합친다 → 늘 1,000개 이하·중복 없음·모양 맞음.
    /// </summary>
    private static IReadOnlyList<RevenueCode> TidyCodes(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var merged = new Dictionary<string, RevenueCode>(StringComparer.Ordinal);
        var rest = new List<RevenueCode>();
        foreach (var row in rows)
        {
            if (row.Count < 5) throw ReadFailed();
            var line = new RevenueCode
            {
                Code = (row[0] as string ?? "").Trim(),
                Count = Number(row[1]),
                Amount = Number(row[3]) != 0 ? null : CodeAmount(row[2]),
                Name = CleanName(row[4] as string),
            };
            if (!CodeShape.IsMatch(line.Code) || line.Code == RestCode)
            {
                rest.Add(line);
            }
            else if (merged.TryGetValue(line.Code, out var same))
            {
                same.Count += line.Count;
                same.Amount = AddAmounts(same.Amount, line.Amount);
            }
            else
            {
                merged[line.Code] = line;
            }
        }

        var ordered = merged.Values
            .OrderBy(code => code.Amount.HasValue ? 0 : 1)
            .ThenByDescending(code => code.Amount ?? 0)
            .ThenBy(code => code.Code, StringComparer.Ordinal)
            .ToList();
        var kept = ordered.Take(MaxCodes - 1).ToList();
        rest.AddRange(ordered.Skip(MaxCodes - 1));
        if (rest.Count > 0)
        {
            kept.Add(new RevenueCode
            {
                Code = RestCode,
                Name = null,
                Count = rest.Sum(code => code.Count),
                Amount = rest.Aggregate((long?)0L, (sum, code) => AddAmounts(sum, code.Amount)),
            });
        }
        return kept;
    }

    /// <summary>원 미만 버림. 웹이 받지 못하는 금액(음수·안전한 정수 넘음)은 값을 맞춰 고치지 않고 null로 둔다(그 코드 때문에 한 달이 거부되지 않게).</summary>
    private static long? CodeAmount(object? cell) => WebAmount(Amount(cell));

    private static long? WebAmount(decimal amount)
    {
        var whole = decimal.Truncate(amount);
        return whole < 0m || whole > MaxSafeInteger ? (long?)null : decimal.ToInt64(whole);
    }

    private static long? AddAmounts(long? left, long? right)
    {
        if (!left.HasValue || !right.HasValue) return null;
        var sum = left.Value + right.Value;
        return sum > MaxSafeInteger ? (long?)null : sum;
    }

    /// <summary>앞뒤 공백을 빼고 줄바꿈·제어 문자를 빈칸 하나로 바꾼 뒤 100자까지(대리쌍은 쪼개지 않는다). 비면 null(AC-003.5).</summary>
    private static string? CleanName(string? raw)
    {
        if (raw == null) return null;
        var name = NameJunk.Replace(raw, " ").Trim();
        if (name.Length > MaxNameLength)
        {
            var cut = char.IsHighSurrogate(name[MaxNameLength - 1]) ? MaxNameLength - 1 : MaxNameLength;
            name = name.Substring(0, cut).TrimEnd();
        }
        return name.Length == 0 ? null : name;
    }

    private static string Key(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    /// <summary>정해 둔 문장을 그 문장의 매개변수만 골라 돌린다.</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Query(IBitDb db, string sql, IReadOnlyDictionary<string, string> values) =>
        Query(db, sql, values, RevenueSql.Parameters[sql]);

    /// <summary>매개변수 표를 받아 돌린다(참고 금액은 통계 문장이라 StatsSql 표를 쓴다). 시간 제한은 매출 문장과 같은 90초.</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Query(IBitDb db, string sql, IReadOnlyDictionary<string, string> values, IReadOnlyList<SqlParam> parameters)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var parameter in parameters) args[parameter.Name] = values[parameter.Name];
        return ReadOnlyGuard.Query(db, sql, args, QueryTimeout);
    }

    /// <summary>합계 문장의 답은 늘 한 줄이다. 줄·칸이 모자라면 금액을 지어내지 않고 읽기 실패로 본다.</summary>
    private static IReadOnlyList<object?> Row(IBitDb db, string sql, IReadOnlyDictionary<string, string> values, int cells)
    {
        var rows = Query(db, sql, values);
        if (rows.Count != 1 || rows[0].Count < cells) throw ReadFailed();
        return rows[0];
    }

    private static decimal[] Amounts(IBitDb db, string sql, IReadOnlyDictionary<string, string> values, int cells)
    {
        var row = Row(db, sql, values, cells);
        return Enumerable.Range(0, cells).Select(i => Amount(row[i])).ToArray();
    }

    /// <summary>DB NULL은 0(원본 Number()와 같다).</summary>
    private static long Number(object? cell) => FromCell(cell, value => Convert.ToInt64(value, CultureInfo.InvariantCulture), 0L);

    /// <summary>DB NULL은 0(원본 Amount()와 같다).</summary>
    private static decimal Amount(object? cell) => FromCell(cell, value => Convert.ToDecimal(value, CultureInfo.InvariantCulture), 0m);

    /// <summary>칸을 숫자로. 숫자로 읽을 수 없으면 도우미를 멈추지 않고 읽기 실패로 답한다.</summary>
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

    private static decimal Add(decimal left, decimal right)
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

    /// <summary>원 미만 버림(ADR-008). 웹이 받지 못하는 큰 값은 지어낸 금액이 되지 않게 읽기 실패로 본다.</summary>
    private static long Won(decimal amount)
    {
        var whole = decimal.Truncate(amount);
        if (whole > MaxSafeInteger || whole < -MaxSafeInteger) throw ReadFailed();
        return decimal.ToInt64(whole);
    }

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}
