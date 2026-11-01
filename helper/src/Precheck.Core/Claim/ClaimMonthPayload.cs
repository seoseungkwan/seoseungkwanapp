using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

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
/// → 처방 목록 → 모두 성공했을 때만 JSON 하나. 조각 나누기(Chunker)는 이 JSON을 다 만든 뒤에 한다: 도중에 실패하면 BitException 하나로
/// 끝나 Dispatcher가 error만 보낸다(반쪽 자료 없음).
/// JSON 머리의 counts(s83·s83d·s47·history)는 배열 줄 수다. Worker가 받은 줄 수와 비교한다(AC-009.4).
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

        HospitalCheck.VerifyPeriod(db, registration, historyFrom, to);
        HospitalCheck.VerifyPeriod(db, registration, trendFrom, today);

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
        });
    }

    private static string Write(Action<Utf8JsonWriter> body)
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

    private static void Text(Utf8JsonWriter writer, string name, string? value) => writer.WriteString(name, ClaimText.Safe(value));

    private static void Range(Utf8JsonWriter writer, string name, DateTime from, DateTime to)
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
