using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Calendar;

/// <summary>
/// 예약 탭 도우미 읽기 두 가지(spec clinic-calendar REQ-5903). 명령은 contact.targets 그대로이고 kind로 나뉜다(ContactCommands). 확장은 명령 이름만 보므로 새 판이 없다.
/// 차례: 칸 검사(비트를 건드리지 않음) → 등록 병원 확인(HospitalGate) → SQL(CalendarSql) → JSON 하나. 통계 화면·비트 로그인 창은 쓰지 않는다. 나누기(chunk … end)는 ContactCommands가 한다.
/// calfind {from = to = 오늘, q}: q(앞뒤 빈칸 뺌)가 숫자 1~10자리면 차트번호가 같은 환자, 아니면 이름이 q로 시작하는 환자(두 글자 이상, % _ [ 없음).
/// 답 {v:1, kind, today, more, rows}, 줄 = [차트번호, 이름, 성별 'M'|'F'|null, 생일 yyyyMMdd|null, 마지막 내원 yyyyMMdd|null], 마지막 내원 늦은 차례 20명까지(더 있으면 more).
/// calday {from, to}(42일까지, 오늘−400일 ~ 오늘+92일 — google-link AC-8511.6이 62일에서 넓힘): 답 {v:1, kind, from, to, today, came, rsv}.
/// came 줄 = [날 yyyyMMdd, 차트번호](센 접수, 중복 없음, 날·차트 차례), rsv 줄 = [차트번호|null, 이름|null, 접수 시각 yyyyMMddHHmm](접수 시각 차례).
/// 이상한 줄(차트번호가 숫자 1~10자가 아님·날이나 시각이 틀림·기간 밖) 하나 때문에 전체가 막히지 않게 그 줄만 건너뛴다. 전화·주소·주민번호·메모는 읽지 않는다.
/// </summary>
public static class CalendarTargets
{
    public const string FindKind = "calfind";
    public const string DayKind = "calday";

    public const int Version = 1;

    /// <summary>찾기 결과 한도. SQL은 하나 더(21) 읽어 더 있는지 본다.</summary>
    public const int MaxFound = 20;

    /// <summary>q 글자 한도(명령 표 q max와 같다).</summary>
    public const int MaxQueryLength = 20;

    /// <summary>이름 찾기는 두 글자 이상(사용자 2026-11-17 "이름 앞부분만 쳐도 찾기").</summary>
    public const int MinNameLength = 2;

    /// <summary>차트번호는 숫자 1~10자(웹 예약 칸 차트번호와 같다).</summary>
    public const int MaxChartDigits = 10;

    /// <summary>이름은 40자까지(웹 Worker 읽기 검사와 같다). 넘으면 찾기는 그 줄을 건너뛰고 비트 예약은 이름을 null로 보낸다.</summary>
    public const int MaxNameLength = 40;

    /// <summary>calday 한 번에 읽는 날 수 한도(시작·끝 포함, 월 보기 6주).</summary>
    public const int MaxDays = 42;

    /// <summary>calday 시작은 오늘−400일보다 앞일 수 없다(지난 도착 채우기가 1년 전까지, google-link AC-8511.6. 0.13.x까지는 62일).</summary>
    public const int BackDays = 400;

    /// <summary>calday 끝은 오늘+92일보다 뒤일 수 없다.</summary>
    public const int AheadDays = 92;

    private static readonly char[] LikeSpecial = { '%', '_', '[' };

    private sealed class Person
    {
        public Person(string chart, string name, string? sex, string? birth, string? last)
        {
            Chart = chart;
            Name = name;
            Sex = sex;
            Birth = birth;
            Last = last;
        }

        public string Chart { get; }
        public string Name { get; }
        public string? Sex { get; }
        public string? Birth { get; }
        public string? Last { get; }
    }

    /// <summary>calfind. q가 없거나 틀리면, 또는 from·to가 오늘이 아니면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE.</summary>
    public static string Find(BitServices services, DateTime from, DateTime to, string? q)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var today = services.Today().Date;
        if (from.Date != today || to.Date != today) throw BadMessage();
        var (sql, value) = Query(q);

        IReadOnlyList<IReadOnlyList<object?>> rows;
        using (var hospital = HospitalGate.Open(services))
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@q"] = value,
                ["@until"] = ClaimText.Stamp(today.AddDays(1)),
                ["@hospital"] = hospital.Registration.Scope,
            };
            rows = ListSql.Read(hospital.Db, sql, args, 5);
        }

        var people = new List<Person>();
        var charts = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            if (people.Count == MaxFound) break;
            var chart = ClaimText.Cell(row, 0);
            var name = Name(ClaimText.Cell(row, 1));
            // 같은 차트번호 줄이 또 오면(환자 표 중복) 앞 줄만 둔다
            if (!IsChart(chart) || name == null || !charts.Add(chart)) continue;
            people.Add(new Person(chart, name, Sex(ClaimText.Cell(row, 2)), Ymd(ClaimText.Cell(row, 3)), Ymd(ClaimText.Cell(row, 4))));
        }
        var more = rows.Count > MaxFound;

        return ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("v", Version);
            writer.WriteString("kind", FindKind);
            writer.WriteString("today", ClaimText.Iso(today));
            writer.WriteBoolean("more", more);
            writer.WriteStartArray("rows");
            foreach (var person in people)
            {
                writer.WriteStartArray();
                writer.WriteStringValue(person.Chart);
                writer.WriteStringValue(ClaimText.Safe(person.Name));
                ListSql.Text(writer, person.Sex);
                ListSql.Text(writer, person.Birth);
                ListSql.Text(writer, person.Last);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
        });
    }

    /// <summary>calday. 기간이 틀리면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE.</summary>
    public static string Day(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        from = from.Date;
        to = to.Date;
        var today = services.Today().Date;
        if (from > to || (to - from).Days + 1 > MaxDays || from < today.AddDays(-BackDays) || to > today.AddDays(AheadDays)) throw BadMessage();

        var start = ClaimText.Stamp(from);
        var end = ClaimText.Stamp(to.AddDays(1));
        IReadOnlyList<IReadOnlyList<object?>> cameRows;
        IReadOnlyList<IReadOnlyList<object?>> rsvRows;
        using (var hospital = HospitalGate.Open(services))
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@from"] = start,
                ["@to"] = end,
                ["@hospital"] = hospital.Registration.Scope,
            };
            cameRows = ListSql.Read(hospital.Db, CalendarSql.CameSql, args, 2);
            rsvRows = ListSql.Read(hospital.Db, CalendarSql.RsvSql, args, 3);
        }

        var firstDay = ClaimText.Day(from);
        var lastDay = ClaimText.Day(to);
        var came = new HashSet<(string Day, string Chart)>();
        foreach (var row in cameRows)
        {
            var day = ClaimText.Cell(row, 0);
            var chart = ClaimText.Cell(row, 1);
            if (Ymd(day) == null || string.CompareOrdinal(day, firstDay) < 0 || string.CompareOrdinal(day, lastDay) > 0 || !IsChart(chart)) continue;
            came.Add((day, chart));
        }

        var rsv = new List<(string? Chart, string? Name, string At)>();
        var seen = new HashSet<(string? Chart, string? Name, string At)>();
        foreach (var row in rsvRows)
        {
            var chartText = ClaimText.Cell(row, 0);
            var chart = chartText.Length == 0 ? null : chartText;
            if (chart != null && !IsChart(chart)) continue;
            var at = ClaimText.Cell(row, 2);
            if (!IsStamp(at) || string.CompareOrdinal(at, start) < 0 || string.CompareOrdinal(at, end) >= 0) continue;
            var line = (chart, Name(ClaimText.Cell(row, 1)), at);
            if (seen.Add(line)) rsv.Add(line);
        }

        return ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("v", Version);
            writer.WriteString("kind", DayKind);
            writer.WriteString("from", ClaimText.Iso(from));
            writer.WriteString("to", ClaimText.Iso(to));
            writer.WriteString("today", ClaimText.Iso(today));
            writer.WriteStartArray("came");
            foreach (var (day, chart) in came.OrderBy(c => c.Day, StringComparer.Ordinal).ThenBy(c => c.Chart, StringComparer.Ordinal))
            {
                writer.WriteStartArray();
                writer.WriteStringValue(day);
                writer.WriteStringValue(chart);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
            writer.WriteStartArray("rsv");
            foreach (var (chart, name, at) in rsv)
            {
                writer.WriteStartArray();
                ListSql.Text(writer, chart);
                ListSql.Text(writer, name);
                writer.WriteStringValue(at);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
        });
    }

    /// <summary>
    /// q를 찾기 SQL과 값으로. 앞뒤 빈칸을 뺀 글이 숫자뿐이면 차트번호(1~10자리), 숫자가 하나도 없으면 이름 앞부분(두 글자 이상, LIKE 특수 글자 없음).
    /// 없음·20자 넘음·빈 글·제어 문자·숫자와 다른 글자 섞임은 E-HELPER-BAD-MESSAGE.
    /// </summary>
    private static (string Sql, string Value) Query(string? q)
    {
        if (q == null || q.Length > MaxQueryLength) throw BadMessage();
        var text = q.Trim();
        if (text.Length == 0 || text.Any(char.IsControl)) throw BadMessage();
        var digits = text.Count(IsDigit);
        if (digits == text.Length)
        {
            if (text.Length > MaxChartDigits) throw BadMessage();
            return (CalendarSql.FindChartSql, text);
        }
        if (digits > 0 || text.Length < MinNameLength || text.IndexOfAny(LikeSpecial) >= 0) throw BadMessage();
        return (CalendarSql.FindNameSql, text);
    }

    private static bool IsDigit(char ch) => ch >= '0' && ch <= '9';

    /// <summary>차트번호: ASCII 숫자 1~10자.</summary>
    private static bool IsChart(string text) => text.Length > 0 && text.Length <= MaxChartDigits && text.All(IsDigit);

    /// <summary>앞뒤 빈칸을 뺀 이름. 비었거나 40자를 넘으면 null.</summary>
    private static string? Name(string text) => text.Length == 0 || text.Length > MaxNameLength ? null : text;

    /// <summary>비트 PbsSexTyp: 'M'·'F'만 그대로, 아니면 null(의원 DB 값은 M·F 두 가지뿐이었다, 2026-11-17 개수 확인).</summary>
    private static string? Sex(string text) => text == "M" || text == "F" ? text : null;

    /// <summary>있는 날짜 yyyyMMdd(ASCII 숫자 8자, 100년 이후)면 그 글자, 아니면 null. 통계 사람 줄 생일(StatsRows Birth)과 같은 검사.</summary>
    private static string? Ymd(string text)
    {
        if (text.Length != 8 || !text.All(IsDigit)) return null;
        if (!DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) || day.Year < 100) return null;
        return text;
    }

    /// <summary>yyyyMMddHHmm 12자리 ASCII 숫자이고 달력에 있는 시각(시 0~23·분 0~59)인가.</summary>
    private static bool IsStamp(string text) =>
        text.Length == 12 && text.All(IsDigit)
        && DateTime.TryParseExact(text, "yyyyMMddHHmm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static ProtocolException BadMessage() => new ProtocolException(ErrorCodes.BadMessage);
}
