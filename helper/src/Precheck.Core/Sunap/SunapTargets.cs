using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;

namespace Precheck.Core.Sunap;

/// <summary>
/// contact.targets {kind:'sunap', from:D, to:D}(spec sunap-ilji REQ-4902): 수납일지 하루 장부. 차례: 날 검사(from = to, 오늘−62일 ~ 오늘, 비트를 건드리지 않음)
/// → 등록 병원 확인(HospitalGate) → 매출 확인 필요 검사 셋(revenue.days와 같은 차례, 하나라도 0이 아니면 unsure, 남은 검사는 돌리지 않음)
/// → 환자·처방·다음 예약·금액·미수 입금 SQL(SunapSql) → 원장님 이름(통계 StatsExtra.DoctorNames, 코드가 있을 때만) → JSON 하나.
/// 통계 화면·비트 로그인 창은 쓰지 않는다. 나누기(chunk … end)는 ContactCommands가 한다.
/// 답 {v:2, day, unsure, rows, paid, doctors}(v:2 = spec sunap-doctors REQ-5002).
/// rows 줄 = [차트, 이름, 첫 접수 HH:mm, 구분 new|d90|re, 현금, 카드, 계좌, 미수, [처방코드…], null|[다음 예약 yyyyMMddHHmm, 메모 앞 40자], 진료의 코드|null], 첫 접수 차례.
/// paid 줄 = [차트, 이름, 수납 시각 HH:mm|"", 현금, 카드+계좌], 시각 차례. 금액은 원 미만 버림(항목마다).
/// doctors 줄 = [진료의 코드, 이름|null], rows에 나온 코드마다 한 번, 코드 차례. 이름은 통계 원장님 이름과 같은 규칙이다.
/// 미수 = 그 환자 그날 내원들의 본인부담 총액(OrpTotOwn) − (현금 + 카드 + 계좌), 0보다 작으면 0.
/// 환자 줄이 틀리면(차트번호 없음·두 줄·첫 접수가 그날 시각이 아님·숫자 아님·진료의 코드 40자 넘음) 일부만 보내지 않고 E-BIT-READ-FAILED다.
/// </summary>
public static class SunapTargets
{
    public const string Kind = "sunap";

    /// <summary>장부 날은 오늘−62일보다 앞일 수 없다(지난달 마감까지 볼 만큼).</summary>
    public const int BackDays = 62;

    /// <summary>다음 예약 메모는 앞 40자만 싣는다(SQL도 40자로 자른다).</summary>
    public const int MemoLength = 40;

    public const int Version = 2;

    /// <summary>진료의 코드 길이 한도(통계 StatsExtra·Worker와 같은 40자). 넘으면 E-BIT-READ-FAILED.</summary>
    private const int MaxDoctorLength = 40;

    private const string StampFormat = "yyyyMMddHHmm";

    private static readonly string[] Checks = { RevenueSql.UnsupportedFinance, RevenueSql.FinanceMultiplicity, RevenueSql.ReceivableMultiplicity };

    /// <summary>웹이 받는 가장 큰 정수(Number.isSafeInteger). 넘으면 지어낸 금액이 되지 않게 읽기 실패로 본다.</summary>
    private const long MaxSafeInteger = 9007199254740991L;

    private sealed class Row
    {
        public Row(string chart, string name, string firstAcp, string kind, string? doctor)
        {
            Chart = chart;
            Name = name;
            FirstAcp = firstAcp;
            Kind = kind;
            Doctor = doctor;
        }

        public string Chart { get; }
        public string Name { get; }
        public string FirstAcp { get; }
        public string Kind { get; }
        public string? Doctor { get; }
        public decimal Cash { get; set; }
        public decimal Card { get; set; }
        public decimal Check { get; set; }
        public decimal Own { get; set; }
        public SortedSet<string> Codes { get; } = new SortedSet<string>(StringComparer.Ordinal);
        public string? RsvAt { get; set; }
        public string RsvMemo { get; set; } = "";
        public bool RsvSeen { get; set; }
    }

    private sealed class Paid
    {
        public Paid(string chart, string name, string time, long cash, long card)
        {
            Chart = chart;
            Name = name;
            Time = time;
            Cash = cash;
            Card = card;
        }

        public string Chart { get; }
        public string Name { get; }
        public string Time { get; }
        public long Cash { get; }
        public long Card { get; }
    }

    public static string Build(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var day = from.Date;
        var today = services.Today().Date;
        if (to.Date != day || day < today.AddDays(-BackDays) || day > today) throw new ProtocolException(ErrorCodes.BadMessage);

        var dayKey = ClaimText.Day(day);
        var nextStamp = ClaimText.Stamp(day.AddDays(1));
        var unsure = false;
        var rows = new Dictionary<string, Row>(StringComparer.Ordinal);
        var paid = new List<Paid>();
        IReadOnlyList<StatsDoctor> doctors = Array.Empty<StatsDoctor>();
        decimal dayTotal = 0m, dayCash = 0m, dayCard = 0m, dayCheck = 0m, dayReceivableIn = 0m;

        using (var hospital = HospitalGate.Open(services))
        {
            var values = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@day"] = dayKey,
                ["@nextDay"] = ClaimText.Day(day.AddDays(1)),
                ["@from"] = ClaimText.Stamp(day),
                ["@to"] = nextStamp,
                ["@hospital"] = hospital.Registration.Scope,
            };
            var db = hospital.Db;

            foreach (var check in Checks)
            {
                var answer = Read(db, check, values, 1);
                if (answer.Count != 1) throw ReadFailed();
                if (Number(answer[0][0]) != 0)
                {
                    unsure = true;
                    break;
                }
            }

            foreach (var line in Read(db, SunapSql.PatientsSql, values, 6))
            {
                var chart = ClaimText.Cell(line, 0);
                if (chart.Length == 0 || rows.ContainsKey(chart)) throw ReadFailed();
                var firstAcp = ClaimText.Cell(line, 2);
                if (!IsStamp(firstAcp) || !firstAcp.StartsWith(dayKey, StringComparison.Ordinal)) throw ReadFailed();
                var firstDay = ClaimText.Cell(line, 3);
                var kind = firstDay == dayKey ? "new" : Number(line[4]) > 0 ? "d90" : "re";
                var doctor = ClaimText.Cell(line, 5);
                if (doctor.Length > MaxDoctorLength) throw ReadFailed();
                rows.Add(chart, new Row(chart, ClaimText.Cell(line, 1), firstAcp, kind, doctor.Length == 0 ? null : doctor));
            }

            foreach (var line in Read(db, SunapSql.CodesSql, values, 2))
            {
                var code = ClaimText.Cell(line, 1).ToUpperInvariant();
                if (code.Length > 0 && rows.TryGetValue(ClaimText.Cell(line, 0), out var row)) row.Codes.Add(code);
            }

            foreach (var line in Read(db, SunapSql.NextReservationSql, values, 3))
            {
                if (!rows.TryGetValue(ClaimText.Cell(line, 0), out var row) || row.RsvSeen) continue;
                row.RsvSeen = true;
                // 시각이 이상한 예약 하나 때문에 장부 전체가 막히지 않게 그 예약만 없는 것으로 본다
                var at = ClaimText.Cell(line, 1);
                if (!IsStamp(at) || string.CompareOrdinal(at, nextStamp) < 0) continue;
                row.RsvAt = at;
                row.RsvMemo = Memo(ClaimText.Raw(line, 2));
            }

            foreach (var line in Read(db, SunapSql.MoneySql, values, 7))
            {
                var cash = Amount(line[3]);
                var card = Amount(line[4]);
                var check = Amount(line[5]);
                var own = Amount(line[6]);
                dayTotal = Add(dayTotal, Amount(line[2]));
                dayCash = Add(dayCash, cash);
                dayCard = Add(dayCard, card);
                dayCheck = Add(dayCheck, check);
                // 그날 센 내원(통계 조건)이 없는 차트의 금액은 줄을 만들지 않는다. 날 합(확인 필요)에는 든다
                if (!rows.TryGetValue(ClaimText.Cell(line, 1), out var row)) continue;
                row.Cash = Add(row.Cash, cash);
                row.Card = Add(row.Card, card);
                row.Check = Add(row.Check, check);
                row.Own = Add(row.Own, own);
            }

            var paidCharts = new HashSet<string>(StringComparer.Ordinal);
            foreach (var line in Read(db, SunapSql.PaidSql, values, 7))
            {
                var chart = ClaimText.Cell(line, 0);
                if (chart.Length == 0 || !paidCharts.Add(chart)) throw ReadFailed();
                var cor = Amount(line[4]);
                var cardIn = Add(Amount(line[5]), Amount(line[6]));
                dayTotal = Add(dayTotal, Amount(line[3]));
                dayReceivableIn = Add(dayReceivableIn, Add(cor, cardIn));
                var cash = Won(cor);
                var card = Won(cardIn);
                if (cash < 0 || card < 0)
                {
                    unsure = true;
                    cash = Math.Max(cash, 0);
                    card = Math.Max(card, 0);
                }
                if (cash == 0 && card == 0) continue;
                paid.Add(new Paid(chart, ClaimText.Cell(line, 1), PaidClock(ClaimText.Cell(line, 2), dayKey), cash, card));
            }

            // 원장님 이름은 통계 '원장님별'과 같은 함수·같은 SQL로(새 SQL 없음). 코드가 하나도 없으면 SQL을 부르지 않는다
            var codes = new SortedSet<string>(rows.Values.Where(row => row.Doctor != null).Select(row => row.Doctor!), StringComparer.Ordinal);
            doctors = StatsExtra.DoctorNames(db, codes);
        }

        // 매출(revenue.days)처럼 원 미만을 버린 날 합이 음수면 확인 필요. 환자 줄의 음수 칸도 확인 필요로 보고 0으로 보낸다
        if (new[] { Won(dayTotal), Won(dayCash), Won(dayCard), Won(dayCheck), Won(dayReceivableIn) }.Any(value => value < 0)) unsure = true;
        if (rows.Values.Any(row => Won(row.Cash) < 0 || Won(row.Card) < 0 || Won(row.Check) < 0)) unsure = true;

        return ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("v", Version);
            writer.WriteString("day", ClaimText.Iso(day));
            writer.WriteBoolean("unsure", unsure);
            writer.WriteStartArray("rows");
            foreach (var row in rows.Values.OrderBy(r => r.FirstAcp, StringComparer.Ordinal).ThenBy(r => r.Chart, StringComparer.Ordinal))
            {
                writer.WriteStartArray();
                writer.WriteStringValue(ClaimText.Safe(row.Chart));
                writer.WriteStringValue(ClaimText.Safe(row.Name));
                writer.WriteStringValue(row.FirstAcp.Substring(8, 2) + ":" + row.FirstAcp.Substring(10, 2));
                writer.WriteStringValue(row.Kind);
                writer.WriteNumberValue(Math.Max(Won(row.Cash), 0));
                writer.WriteNumberValue(Math.Max(Won(row.Card), 0));
                writer.WriteNumberValue(Math.Max(Won(row.Check), 0));
                writer.WriteNumberValue(Math.Max(Won(row.Own - (row.Cash + row.Card + row.Check)), 0));
                writer.WriteStartArray();
                foreach (var code in row.Codes) writer.WriteStringValue(ClaimText.Safe(code));
                writer.WriteEndArray();
                if (row.RsvAt == null)
                {
                    writer.WriteNullValue();
                }
                else
                {
                    writer.WriteStartArray();
                    writer.WriteStringValue(row.RsvAt);
                    writer.WriteStringValue(ClaimText.Safe(row.RsvMemo));
                    writer.WriteEndArray();
                }
                WriteOptional(writer, row.Doctor);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
            writer.WriteStartArray("paid");
            foreach (var line in paid.OrderBy(p => p.Time, StringComparer.Ordinal).ThenBy(p => p.Chart, StringComparer.Ordinal))
            {
                writer.WriteStartArray();
                writer.WriteStringValue(ClaimText.Safe(line.Chart));
                writer.WriteStringValue(ClaimText.Safe(line.Name));
                writer.WriteStringValue(line.Time);
                writer.WriteNumberValue(line.Cash);
                writer.WriteNumberValue(line.Card);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
            writer.WriteStartArray("doctors");
            foreach (var doctor in doctors)
            {
                writer.WriteStartArray();
                writer.WriteStringValue(ClaimText.Safe(doctor.Code));
                WriteOptional(writer, doctor.Name);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
        });
    }

    /// <summary>글자면 그 글자(짝 없는 대리쌍은 U+FFFD), null이면 JSON null.</summary>
    private static void WriteOptional(Utf8JsonWriter writer, string? value)
    {
        if (value == null) writer.WriteNullValue();
        else writer.WriteStringValue(ClaimText.Safe(value));
    }

    /// <summary>정해 둔 문장을 그 문장의 매개변수만 골라 관문으로 돌린다(150초, 300,000줄·칸 모자람은 E-BIT-READ-FAILED).</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Read(IBitDb db, string sql, IReadOnlyDictionary<string, object?> values, int cells)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var parameter in Sql.ParametersOf(sql)) args[parameter.Name] = values[parameter.Name];
        return ListSql.Read(db, sql, args, cells);
    }

    /// <summary>yyyyMMddHHmm 12자리 ASCII 숫자이고 달력에 있는 시각(시 0~23·분 0~59)인가.</summary>
    private static bool IsStamp(string text)
    {
        if (text.Length != StampFormat.Length || text.Any(ch => ch < '0' || ch > '9')) return false;
        return DateTime.TryParseExact(text, StampFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    /// <summary>수납 시각(OrpAccDte) 앞 12자리가 그날 시각이면 HH:mm, 시각이 없거나 틀리면 "".</summary>
    private static string PaidClock(string text, string dayKey)
    {
        if (text.Length < StampFormat.Length) return "";
        var stamp = text.Substring(0, StampFormat.Length);
        if (!IsStamp(stamp) || !stamp.StartsWith(dayKey, StringComparison.Ordinal)) return "";
        return stamp.Substring(8, 2) + ":" + stamp.Substring(10, 2);
    }

    /// <summary>예약 메모: 줄바꿈·제어 문자는 빈칸, 앞뒤 빈칸 뺌, 앞 40자(대리쌍을 가르지 않음).</summary>
    private static string Memo(object? value)
    {
        var raw = value == null ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
        var text = new StringBuilder(raw.Length);
        foreach (var ch in raw) text.Append(char.IsControl(ch) ? ' ' : ch);
        var memo = text.ToString().Trim();
        if (memo.Length <= MemoLength) return memo;
        var cut = char.IsHighSurrogate(memo[MemoLength - 1]) ? MemoLength - 1 : MemoLength;
        return memo.Substring(0, cut).TrimEnd();
    }

    /// <summary>DB NULL은 0. 숫자로 읽을 수 없으면 E-BIT-READ-FAILED.</summary>
    private static long Number(object? cell) => FromCell(cell, value => Convert.ToInt64(value, CultureInfo.InvariantCulture), 0L);

    /// <summary>DB NULL은 0. 숫자로 읽을 수 없으면 E-BIT-READ-FAILED.</summary>
    private static decimal Amount(object? cell) => FromCell(cell, value => Convert.ToDecimal(value, CultureInfo.InvariantCulture), 0m);

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

    /// <summary>원 미만 버림. 웹이 받지 못하는 큰 값은 읽기 실패로 본다.</summary>
    private static long Won(decimal amount)
    {
        var whole = decimal.Truncate(amount);
        if (whole > MaxSafeInteger || whole < -MaxSafeInteger) throw ReadFailed();
        return decimal.ToInt64(whole);
    }

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}
