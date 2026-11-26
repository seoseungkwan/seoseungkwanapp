// 비트시트 app/src/Bit/BitSource.cs(작업 트리 파일, 판 7)를 도우미 IBitDb로 옮김(spec google-link TASK-9, design.md 9-1).
// 읽는 문장·칸 차례·거르기는 그대로. 바뀐 것: BitDb.Open(비트 폴더) → 받은 IBitDb(도우미가 연 읽기 전용 연결),
// DateTime.Today → 받은 오늘(한국 날짜), 한국어 예외 → 오류 번호, 프로그램 동안 기억하던 병원 고르기(static) 없음(명령마다 새로 고름).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Sheet;

/// <summary>비트에 병원이 여럿이고 최근 내원으로도 하나를 고를 수 없을 때. 고를 목록(내원 많은 차례)을 함께 싣는다.</summary>
public sealed class ManyHospitalsException : HelperException
{
    public ManyHospitalsException(IReadOnlyList<HospitalOption> options)
        : base(BitErrors.RegisterMany)
    {
        Options = options ?? Array.Empty<HospitalOption>();
    }

    public IReadOnlyList<HospitalOption> Options { get; }
}

/// <summary>비트 DB에서 하루치를 읽는다(IDaySource). 다섯 문장, 하루 범위라 1초 안팎.</summary>
public sealed class SheetBitSource : IDaySource
{
    /// <summary>하루 읽기 한 문장의 시간 제한(design.md 9-2 비트 읽기 20초).</summary>
    public static readonly TimeSpan DayTimeout = TimeSpan.FromSeconds(20);

    internal static readonly TimeSpan ListTimeout = TimeSpan.FromSeconds(15);

    private readonly IBitDb db;
    private readonly Settings settings;
    private readonly DateTime today;

    public SheetBitSource(IBitDb db, Settings settings, DateTime today)
    {
        this.db = db ?? throw new ArgumentNullException(nameof(db));
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        this.today = today.Date;
    }

    /// <summary>마지막으로 읽은 병원 이름(HspMst.HspNam). 설정에 이름이 있으면 그것.</summary>
    public string HospitalName { get; private set; } = "";

    /// <summary>마지막으로 읽은 병원 코드(DepMst.DepHspNum).</summary>
    public string HospitalCode { get; private set; } = "";

    public DayData Read(DateTime day)
    {
        var data = new DayData { Day = day.Date };
        var hospital = ResolveHospital(db, settings, today, out var name);
        HospitalCode = hospital;
        HospitalName = settings.HospitalName.Length > 0 ? settings.HospitalName : name;
        var range = new Dictionary<string, object?>
        {
            ["@from"] = Stamp(day),
            ["@to"] = Stamp(day.AddDays(1)),
            ["@hospital"] = hospital,
        };

        var visits = new Dictionary<string, DayVisit>(StringComparer.Ordinal);
        foreach (var r in SheetSql.Query(db, SheetSql.VisitsSql, range, DayTimeout))
        {
            var v = new DayVisit
            {
                VisitId = Text(r[0]),
                Key = Text(r[1]),
                Name = Text(r[2]),
                AcceptedAt = Text(r[3]),
                Dept = Text(r[4]),
                VisitKind = Text(r[5]),
                Insurance = (int)Amount(r[6]),
            };
            if (v.VisitId.Length == 0 || visits.ContainsKey(v.VisitId)) continue;
            visits[v.VisitId] = v;
            data.Visits.Add(v);
        }

        foreach (var r in SheetSql.Query(db, SheetSql.CodesSql, range, DayTimeout))
        {
            if (visits.TryGetValue(Text(r[0]), out var v))
            {
                var code = Text(r[1]).ToUpperInvariant();
                if (code.Length > 0) v.Codes.Add(code);
                var kind = OrderKind.Of(Text(r[2]), Text(r[3]));
                if (kind == OrderKind.Injection) v.Injection = true;
                if (kind == OrderKind.Therapy) v.Therapy = true;
            }
        }

        var payArgs = new Dictionary<string, object?> { ["@day"] = Day(day), ["@hospital"] = hospital };
        foreach (var r in SheetSql.Query(db, SheetSql.PaymentsSql, payArgs, DayTimeout))
        {
            data.Payments.Add(new DayPayment
            {
                VisitId = Text(r[0]),
                Key = Text(r[1]),
                Type = TypeOf(Text(r[2])),
                Cash = Amount(r[3]),
                Card = Amount(r[4]),
                Transfer = Amount(r[5]),
                At = Text(r[6]),
                Seq = (int)Amount(r[7]),
                Name = Text(r[8]),
            });
        }

        foreach (var r in SheetSql.Query(db, SheetSql.BillsSql, range, DayTimeout))
        {
            var id = Text(r[0]);
            if (r[1] == null && r[2] == null) continue; // 아직 계산 전
            data.Bills[id] = new DayBill
            {
                VisitId = id,
                Own = Amount(r[1]),
                Total = Amount(r[2]),
                Insurance = (int)Amount(r[3]),
                DiscountFree = Amount(r[4]) > 0,
            };
        }

        foreach (var r in SheetSql.Query(db, SheetSql.CancelledSql, range, DayTimeout))
        {
            var key = Text(r[0]);
            if (key.Length > 0) data.Cancelled.Add(new DayVisit { Key = key, Name = Text(r[1]) });
        }
        return data;
    }

    public static PaymentType TypeOf(string? code)
    {
        switch ((code ?? "").Trim().ToUpperInvariant())
        {
            case "RCV": return PaymentType.Receipt;
            case "COR": return PaymentType.ReceivablePaid;
            case "COO": return PaymentType.ReceivableCreated;
            case "QCV": return PaymentType.HealthFund;
            default: return PaymentType.Other;
        }
    }

    /// <summary>
    /// 설정의 병원 범위, 없으면 DB에 하나뿐인 범위. 여럿이면 최근 30일 내원이 있는 범위가 딱 하나일 때 그것,
    /// 아니면 ManyHospitalsException(E-BIT-REG-MANY, 사람이 고른다). 고른 병원이 없거나 병원이 하나도 없으면 E-BIT-REG-NONE. 이름은 HspMst.HspNam.
    /// </summary>
    public static string ResolveHospital(IBitDb db, Settings settings, DateTime today, out string name)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        var list = Hospitals(db, today);
        name = "";
        if (settings.HospitalCode.Length > 0)
        {
            var hit = list.FirstOrDefault(h => string.Equals(h.Key, settings.HospitalCode, StringComparison.OrdinalIgnoreCase));
            if (hit.Key == null) throw new BitException(BitErrors.RegisterNone);
            name = hit.Value ?? "";
            return hit.Key;
        }
        if (list.Count == 0) throw new BitException(BitErrors.RegisterNone);
        if (list.Count == 1)
        {
            name = list[0].Value ?? "";
            return list[0].Key;
        }
        var options = WithVisits(db, list, today);
        var picked = HospitalPick.Auto(options);
        if (picked == null) throw new ManyHospitalsException(HospitalPick.Sorted(options));
        name = picked.Name;
        return picked.Code;
    }

    /// <summary>병원마다 최근 30일 센 내원 수를 붙인다.</summary>
    public static List<HospitalOption> WithVisits(IBitDb db, List<KeyValuePair<string, string>> list, DateTime today)
    {
        var args = new Dictionary<string, object?>
        {
            ["@from"] = Stamp(today.AddDays(-HospitalPick.RecentDays)),
            ["@to"] = Stamp(today.AddDays(1)),
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in SheetSql.Query(db, SheetSql.HospitalVisitsSql, args, TimeSpan.FromSeconds(60)))
        {
            var code = Text(r[0]);
            if (code.Length > 0) counts[code] = (int)Amount(r[1]);
        }
        return list.Select(h => new HospitalOption { Code = h.Key, Name = h.Value ?? "", Visits = counts.TryGetValue(h.Key, out var n) ? n : 0 }).ToList();
    }

    public static List<KeyValuePair<string, string>> Hospitals(IBitDb db, DateTime today)
    {
        return SheetSql.Query(db, SheetSql.HospitalsSql, new Dictionary<string, object?> { ["@today"] = Day(today) }, ListTimeout)
            .Select(r => new KeyValuePair<string, string>(Text(r[0]), Text(r[1])))
            .Where(p => p.Key.Length > 0)
            .ToList();
    }

    internal static string Stamp(DateTime day) => day.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";

    internal static string Day(DateTime day) => day.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    internal static string Text(object? v) => v == null ? "" : (Convert.ToString(v, CultureInfo.InvariantCulture) ?? "").Trim();

    internal static decimal Amount(object? v)
    {
        if (v == null) return 0m;
        try { return Convert.ToDecimal(v, CultureInfo.InvariantCulture); }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException) { return 0m; }
    }
}

/// <summary>설정 화면용 비트 목록(병원·진료과·최근 90일 처방). 환자 값은 읽지 않는다.</summary>
public static class BitCatalog
{
    public static string HospitalName(IBitDb db, Settings settings, DateTime today)
    {
        SheetBitSource.ResolveHospital(db, settings, today, out var name);
        return name;
    }

    /// <summary>비트 안의 병원 전부와 최근 30일 내원 수(고르기 목록). 환자 값은 읽지 않는다.</summary>
    public static List<HospitalOption> Hospitals(IBitDb db, DateTime today) =>
        HospitalPick.Sorted(SheetBitSource.WithVisits(db, SheetBitSource.Hospitals(db, today), today));

    public static List<DeptInfo> Departments(IBitDb db, Settings settings, DateTime today) => Departments(db, settings, today, out _);

    /// <summary>그 병원 진료과 전부(최근 90일 내원 수 붙임, 보일 차례). hospital = 읽은 병원 코드.</summary>
    public static List<DeptInfo> Departments(IBitDb db, Settings settings, DateTime today, out string hospital)
    {
        hospital = SheetBitSource.ResolveHospital(db, settings, today, out _);
        var day = SheetBitSource.Day(today);
        var list = new List<DeptInfo>();
        foreach (var r in SheetSql.Query(db, SheetSql.DepartmentsSql, new Dictionary<string, object?> { ["@hospital"] = hospital }, SheetBitSource.ListTimeout))
        {
            var code = SheetBitSource.Text(r[0]);
            if (code.Length == 0 || list.Any(d => string.Equals(d.Code, code, StringComparison.OrdinalIgnoreCase))) continue;
            var from = SheetBitSource.Text(r[2]);
            var to = SheetBitSource.Text(r[3]);
            list.Add(new DeptInfo
            {
                Code = code,
                Name = SheetBitSource.Text(r[1]),
                Current = string.CompareOrdinal(from, day) <= 0 && string.CompareOrdinal(day, to) <= 0,
            });
        }
        var args = new Dictionary<string, object?>
        {
            ["@from"] = SheetBitSource.Stamp(today.AddDays(-90)),
            ["@to"] = SheetBitSource.Stamp(today.AddDays(1)),
            ["@hospital"] = hospital,
        };
        foreach (var r in SheetSql.Query(db, SheetSql.DeptUsageSql, args, TimeSpan.FromSeconds(30)))
        {
            var hit = list.FirstOrDefault(d => string.Equals(d.Code, SheetBitSource.Text(r[0]), StringComparison.OrdinalIgnoreCase));
            if (hit != null) hit.Visits90 = (int)SheetBitSource.Amount(r[1]);
        }
        return RoomPlan.DisplayOrder(list);
    }

    /// <summary>
    /// 그 병원 진료과에 진료실 번호가 아직 없으면(또는 옛 기본값 그대로면) 저절로 붙여 settings에 넣는다(비트시트 DESIGN 3절).
    /// 바꿨으면 true(부르는 쪽이 저장). 이미 이 병원에서 맞춘 것이면 아무것도 안 한다.
    /// </summary>
    public static bool AutoRooms(Settings settings, string? hospital, List<DeptInfo>? depts)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));
        hospital = (hospital ?? "").Trim();
        if (hospital.Length == 0 || depts == null || depts.Count == 0) return false;
        var confirmed = string.Equals(settings.DeptRoomsHospital ?? "", hospital, StringComparison.OrdinalIgnoreCase);
        var plan = RoomPlan.Plan(depts, settings.DeptRooms, confirmed);
        if (confirmed) return false;
        if (plan != null) settings.DeptRooms = plan;
        settings.DeptRoomsHospital = hospital;
        return true;
    }

    /// <summary>지금 고른 병원 코드(설정에 없으면 비트에서 찾은 것).</summary>
    public static string HospitalCode(IBitDb db, Settings settings, DateTime today) => SheetBitSource.ResolveHospital(db, settings, today, out _);

    public static List<CodeUsage> RecentCodes(IBitDb db, Settings settings, DateTime today, int days = 90)
    {
        var hospital = SheetBitSource.ResolveHospital(db, settings, today, out _);
        var args = new Dictionary<string, object?>
        {
            ["@from"] = SheetBitSource.Stamp(today.AddDays(-days)),
            ["@to"] = SheetBitSource.Stamp(today.AddDays(1)),
            ["@hospital"] = hospital,
        };
        return SheetSql.Query(db, SheetSql.CodeUsageSql, args, TimeSpan.FromSeconds(180))
            .Select(r => new CodeUsage
            {
                Code = SheetBitSource.Text(r[0]),
                Visits = (int)SheetBitSource.Amount(r[1]),
                Name = SheetBitSource.Text(r[2]),
                Kind = OrderKind.Of(SheetBitSource.Text(r[3]), SheetBitSource.Text(r[4])),
            })
            .Where(c => c.Code.Length > 0)
            .ToList();
    }
}
