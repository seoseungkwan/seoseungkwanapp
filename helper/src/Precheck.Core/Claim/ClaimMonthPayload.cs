using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Stats;

namespace Precheck.Core.Claim;

/// <summary>
/// 비트 로그인(통계 화면을 여는 사용자)을 도우미가 켜진 동안 기억한다. 원본 NativeReportAdapter도 앱이 켜진 동안 로그인을 기억했다.
/// 범위·권한 확인은 쓸 때마다 다시 한다. 확인에 실패하면 Forget으로 버려 다음에 다시 로그인 창을 띄운다.
/// </summary>
public sealed class StatsLogin
{
    private VendorUser? user;
    private string? installPath;

    /// <summary>기억한 로그인, 없으면 비트 로그인 창. 취소하면 E-BIT-EXPORT-FAILED.</summary>
    public VendorUser Ensure(IVendorLogin login, string install)
    {
        if (login == null) throw new ArgumentNullException(nameof(login));
        if (user != null && string.Equals(installPath, install, StringComparison.OrdinalIgnoreCase)) return user;
        Forget();
        var fresh = login.Login(install) ?? throw new BitException(BitErrors.ExportFailed);
        user = fresh;
        installPath = install;
        return fresh;
    }

    public void Forget()
    {
        user = null;
        installPath = null;
    }
}

/// <summary>
/// claim.month 한 달 자료(AC-008.1·AC-008.4). 차례: 이력 범위 검사 → 등록 병원 확인(HospitalGate) → 이력·추세 기간의 기관기호(원본 IdentitySql)
/// → 통계 메뉴·비트 로그인·사용자 범위·통계 권한(원본 NativeReportAdapter) → 83·83D·47 표(IStatsScreens → GridRows) → 12개월 이력 → 상병 추세
/// → 처방 목록 → 진료의(도우미 0.15.0, claim-learn AC-9317.1) → 모두 성공했을 때만 JSON 하나. 조각 나누기(Chunker)는 이 JSON을 다 만든 뒤에 한다: 도중에 실패하면 BitException 하나로
/// 끝나 Dispatcher가 error만 보낸다(반쪽 자료 없음).
/// JSON 머리의 counts(s83·s83d·s47·history)는 배열 줄 수다. Worker가 받은 줄 수와 비교한다(AC-009.4).
/// 진료의는 통계가 쓰는 StatsSql.VisitLinesSql·DoctorNamesSql을 그대로(같은 매개변수·시간 제한, StatsExtra.Read와 같은 부르는 모양) 불러
/// 지금 칸 뒤 맨 끝에 visitDoctors [[차트번호, 진료일 YYYY-MM-DD, 진료의 코드|null]](같은 줄은 한 번)·doctors [[코드, 이름|null]](그 기간 진료의만)로 싣는다.
/// 접수 시각·보험 이름 칸은 싣지 않는다.
/// </summary>
public static class ClaimMonthPayload
{
    public const int Version = 1;

    /// <summary>12개월 이력은 기간 시작 365일 전부터(원본 loadHistory addDays(focus, -365)).</summary>
    public const int HistoryDaysBefore = 365;

    /// <summary>상병 추세는 오늘 364일 전부터 오늘까지(원본 buildTrend).</summary>
    public const int TrendDaysBefore = 364;

    public static string Build(BitServices services, StatsLogin login, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (login == null) throw new ArgumentNullException(nameof(login));
        from = from.Date;
        to = to.Date;
        var historyFrom = from.AddDays(-HistoryDaysBefore);
        // 명령 표가 기간을 35일로 막지만 처리기도 원본 RxHistory 한도(400일)를 한 번 더 본다. 나눠 읽지 않는다
        if (from > to || (to - historyFrom).TotalDays > RxHistoryRead.MaximumDays) throw new ProtocolException(ErrorCodes.BadMessage);

        using var hospital = HospitalGate.Open(services);
        var registration = hospital.Registration;
        var db = hospital.Db;
        var install = db.Target.InstallPath;
        var today = services.Today().Date;
        var trendFrom = today.AddDays(-TrendDaysBefore);

        var screens = services.Screens ?? throw new BitException(BitErrors.ExportFailed);
        var menu = StatsMenu.Parse(screens.ReadMenu(install));
        var user = login.Ensure(services.Login, install);
        try
        {
            StatsAccess.Check(db, user, registration.Scope, menu, StatsScreens.Keys);
        }
        catch (BitException)
        {
            login.Forget();
            throw;
        }

        var tables = new List<IReadOnlyList<IReadOnlyDictionary<string, string>>>();
        foreach (var key in StatsScreens.Keys)
        {
            tables.Add(GridRows.FromSheet(key, screens.Read(install, user, StatsScreens.Of(key), from, to, StatsScreens.ReadTimeout)));
        }
        var history = RxHistoryRead.Read(db, registration.Scope, historyFrom, from, to);
        var trend = DxTrendRead.Read(db, registration.Scope, trendFrom, today);
        var codes = CatalogRead.Prescriptions(db, today);
        var la = CatalogRead.La(db, today);
        var doctors = ReadDoctors(db, registration.Scope, from, to);

        return Write(writer =>
        {
            writer.WriteNumber("version", Version);
            Range(writer, "period", from, to);
            Range(writer, "historyRange", historyFrom, to);
            Range(writer, "trendRange", trendFrom, today);
            writer.WriteStartObject("counts");
            writer.WriteNumber("s83", tables[0].Count);
            writer.WriteNumber("s83d", tables[1].Count);
            writer.WriteNumber("s47", tables[2].Count);
            writer.WriteNumber("history", history.Rows.Count);
            writer.WriteEndObject();
            Table(writer, "s83", StatsScreens.Symptoms, tables[0]);
            Table(writer, "s83d", StatsScreens.Diagnoses, tables[1]);
            Table(writer, "s47", StatsScreens.Prescriptions, tables[2]);
            History(writer, history);
            Trend(writer, trend);
            Catalog(writer, codes, la);
            Doctors(writer, doctors);
        });
    }

    /// <summary>진료의 코드 길이 한도(통계 StatsExtra·Worker isCode와 같다). 넘으면 E-BIT-READ-FAILED.</summary>
    private const int MaxDoctorCodeLength = 40;

    /// <summary>진료의 칸(claim-learn AC-9317.1): 접수 줄(차트번호, 진료일, 진료의 코드|null)과 그 줄에 나온 진료의 이름.</summary>
    private sealed class VisitDoctors
    {
        public VisitDoctors(IReadOnlyList<(string Chart, string Day, string? Doctor)> visits, IReadOnlyList<StatsDoctor> names)
        {
            Visits = visits;
            Names = names;
        }

        public IReadOnlyList<(string Chart, string Day, string? Doctor)> Visits { get; }

        public IReadOnlyList<StatsDoctor> Names { get; }
    }

    /// <summary>
    /// 통계 접수 줄 SQL을 StatsExtra.Read와 같은 매개변수(@from 기간 첫날 0시, @to 마지막 날의 다음 날 0시, @hospital 등록 범위)·150초로 부르고,
    /// 접수 줄이 상한(StatsRows.MaxRows)을 넘으면 통계와 같은 E-STATS-TOO-BIG이다. 차트번호가 없는 접수는 뺀다(환자가 없다).
    /// 진료일이 yyyyMMdd 날짜가 아니거나 진료의 코드가 40자를 넘으면 E-BIT-READ-FAILED. 원장님 이름은 StatsExtra.DoctorNames(통계 이름 SQL 그대로)로 읽는다.
    /// </summary>
    private static VisitDoctors ReadDoctors(IBitDb db, string hospitalScope, DateTime from, DateTime to)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(from),
            ["@to"] = ClaimText.Stamp(to.AddDays(1)),
            ["@hospital"] = hospitalScope,
        };
        var rows = ReadOnlyGuard.Query(db, StatsSql.VisitLinesSql, args, StatsSql.DataTimeout);
        if (rows.Count > StatsRows.MaxRows) throw new BitException(StatsErrors.TooBig);

        var visits = new List<(string Chart, string Day, string? Doctor)>();
        var seen = new HashSet<(string Chart, string Day, string? Doctor)>();
        var codes = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var chart = OrNull(StatsRows.Cell(row, 0));
            var day = IsoDay(StatsRows.Cell(row, 1));
            var doctor = DoctorCode(StatsRows.Cell(row, 4));
            if (chart == null) continue;
            if (doctor != null) codes.Add(doctor);
            if (seen.Add((chart, day, doctor))) visits.Add((chart, day, doctor));
        }
        return new VisitDoctors(visits, StatsExtra.DoctorNames(db, codes));
    }

    private static string? OrNull(object? value)
    {
        var text = value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    /// <summary>접수 줄 진료일 yyyyMMdd → YYYY-MM-DD(청구 자료의 다른 날짜와 같은 모양). 날짜가 아니면 E-BIT-READ-FAILED.</summary>
    private static string IsoDay(object? value)
    {
        var text = OrNull(value);
        if (text == null || text.Length != 8 || !text.All(c => c >= '0' && c <= '9')
            || !DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        {
            throw new BitException(BitErrors.ReadFailed);
        }
        return ClaimText.Iso(day);
    }

    private static string? DoctorCode(object? value)
    {
        var code = OrNull(value);
        if (code != null && code.Length > MaxDoctorCodeLength) throw new BitException(BitErrors.ReadFailed);
        return code;
    }

    /// <summary>visitDoctors [[차트번호, 진료일, 진료의 코드|null]]·doctors [[코드, 이름|null]](claim-learn AC-9317.1).</summary>
    private static void Doctors(Utf8JsonWriter writer, VisitDoctors doctors)
    {
        writer.WriteStartArray("visitDoctors");
        foreach (var visit in doctors.Visits)
        {
            writer.WriteStartArray();
            writer.WriteStringValue(ClaimText.Safe(visit.Chart));
            writer.WriteStringValue(visit.Day);
            NullableText(writer, visit.Doctor);
            writer.WriteEndArray();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("doctors");
        foreach (var doctor in doctors.Names)
        {
            writer.WriteStartArray();
            writer.WriteStringValue(ClaimText.Safe(doctor.Code));
            NullableText(writer, doctor.Name);
            writer.WriteEndArray();
        }
        writer.WriteEndArray();
    }

    private static void NullableText(Utf8JsonWriter writer, string? text)
    {
        if (text == null) writer.WriteNullValue();
        else writer.WriteStringValue(ClaimText.Safe(text));
    }

    internal static string Write(Action<Utf8JsonWriter> body)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Envelope.WriterOptions))
        {
            writer.WriteStartObject();
            body(writer);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    internal static void Text(Utf8JsonWriter writer, string name, string? value) => writer.WriteString(name, ClaimText.Safe(value));

    internal static void Range(Utf8JsonWriter writer, string name, DateTime from, DateTime to)
    {
        writer.WriteStartObject(name);
        Text(writer, "from", ClaimText.Iso(from));
        Text(writer, "to", ClaimText.Iso(to));
        writer.WriteEndObject();
    }

    /// <summary>표 줄: 남기는 칸 차례로, 줄에 있는 칸만.</summary>
    private static void Table(Utf8JsonWriter writer, string name, string key, IReadOnlyList<IReadOnlyDictionary<string, string>> rows)
    {
        var columns = GridRows.Columns(key);
        writer.WriteStartArray(name);
        foreach (var row in rows)
        {
            writer.WriteStartObject();
            foreach (var column in columns)
            {
                if (row.TryGetValue(column, out var value)) Text(writer, column, value);
            }
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
    }

    /// <summary>이력 줄 {v, p, d, c[], m}(원본 RxHistoryRow)과 센 수.</summary>
    private static void History(Utf8JsonWriter writer, RxHistory history)
    {
        writer.WriteStartArray("history");
        foreach (var row in history.Rows)
        {
            writer.WriteStartObject();
            Text(writer, "v", row.Visit);
            Text(writer, "p", row.Patient);
            Text(writer, "d", row.Day);
            writer.WriteStartArray("c");
            foreach (var code in row.Codes) writer.WriteStringValue(ClaimText.Safe(code));
            writer.WriteEndArray();
            Text(writer, "m", row.Memo);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartObject("historyStats");
        writer.WriteNumber("invalidRows", history.InvalidRows);
        writer.WriteNumber("invalidCodes", history.InvalidCodes);
        writer.WriteNumber("truncated", history.Truncated);
        writer.WriteEndObject();
    }

    /// <summary>상병 추세(원본 RxTrendResult 칸 이름 그대로: codes {c, n, d[{c, nm, m, s, x, l}]}, suggestions {c, n, k, miss, g[{c, nm, k, x}]}).</summary>
    private static void Trend(Utf8JsonWriter writer, DxTrend trend)
    {
        writer.WriteStartObject("dxTrend");
        writer.WriteNumber("visits", trend.Visits);
        writer.WriteNumber("invalidRows", trend.InvalidRows);
        writer.WriteNumber("truncated", trend.Truncated);
        writer.WriteStartArray("codes");
        foreach (var code in trend.Codes)
        {
            writer.WriteStartObject();
            Text(writer, "c", code.Code);
            writer.WriteNumber("n", code.Visits);
            writer.WriteStartArray("d");
            foreach (var dx in code.Diagnoses)
            {
                writer.WriteStartObject();
                Text(writer, "c", dx.Code);
                Text(writer, "nm", dx.Name);
                writer.WriteNumber("m", dx.Main);
                writer.WriteNumber("s", dx.Sub);
                writer.WriteNumber("x", dx.Excluded);
                writer.WriteNumber("l", dx.Lift);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("suggestions");
        foreach (var suggestion in trend.Suggestions)
        {
            writer.WriteStartObject();
            Text(writer, "c", suggestion.Code);
            writer.WriteNumber("n", suggestion.Visits);
            writer.WriteNumber("k", suggestion.Cover);
            writer.WriteNumber("miss", suggestion.Missing);
            writer.WriteStartArray("g");
            foreach (var group in suggestion.Groups)
            {
                writer.WriteStartObject();
                Text(writer, "c", group.Code);
                Text(writer, "nm", group.Name);
                writer.WriteNumber("k", group.Cover);
                writer.WriteNumber("x", group.Excluded);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
    }

    /// <summary>처방 목록(원본 PrescriptionCatalogCode·LaCatalogCode 칸 이름 그대로).</summary>
    private static void Catalog(Utf8JsonWriter writer, IEnumerable<PrescriptionCode> codes, IEnumerable<LaCode> la)
    {
        writer.WriteStartObject("catalog");
        writer.WriteStartArray("codes");
        foreach (var code in codes)
        {
            writer.WriteStartObject();
            Text(writer, "code", code.Code);
            Text(writer, "name", code.Name);
            Text(writer, "kind", code.Kind);
            writer.WriteBoolean("active", true);
            Text(writer, "standardCode", code.StandardCode);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("la");
        foreach (var code in la)
        {
            writer.WriteStartObject();
            Text(writer, "code", code.Code);
            Text(writer, "name", code.Name);
            writer.WriteBoolean("active", code.Active);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
    }
}
