using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Stats;

/// <summary>LA 코드 하나의 유효 처방행 수.</summary>
public sealed class StatsLaCode
{
    public StatsLaCode(string code, long count)
    {
        Code = code;
        Count = count;
    }

    public string Code { get; }

    public long Count { get; }
}

/// <summary>치료 다섯(도수·충격파·씨암블락·쏘노·크라이오).</summary>
public sealed class StatsTreatments
{
    public long Manual { get; internal set; }

    public long Eswt { get; internal set; }

    public long Carm { get; internal set; }

    public long Sono { get; internal set; }

    public long Cryo { get; internal set; }
}

/// <summary>보고 숫자 한 벌. Reason이 있으면 그 벌은 ok:false이고 다른 칸을 보내지 않는다(AC-504.3).</summary>
public sealed class StatsReportSet
{
    internal StatsReportSet(string period)
    {
        Period = period;
    }

    /// <summary>일일 yyyy-MM-dd, 월말 yyyy-MM.</summary>
    public string Period { get; }

    public bool Ok => Reason == null;

    /// <summary>원본 Fail의 이유 이름 그대로(history_unsupported·invalid_aggregate·code_limit).</summary>
    public string? Reason { get; internal set; }

    public long TotalVisits { get; internal set; }

    public long NewPatients { get; internal set; }

    public long ReturnPatients { get; internal set; }

    public long TotalAmount { get; internal set; }

    public long InsurerAmount { get; internal set; }

    public long NoncoveredAmount { get; internal set; }

    public long CashAmount { get; internal set; }

    public long CardAmount { get; internal set; }

    public long TransferAmount { get; internal set; }

    public StatsTreatments Treatments { get; } = new StatsTreatments();

    public List<StatsLaCode> LaCodes { get; } = new List<StatsLaCode>();

    public bool FinanceUnconfirmed { get; internal set; }

    public string? FinanceUnconfirmedReason { get; internal set; }

    public List<string> Notes { get; } = new List<string>();
}

/// <summary>보고 숫자 네 벌: 일일 to·to−1, 월말 to가 든 달·그 앞 달.</summary>
public sealed class StatsReportResult
{
    public StatsReportResult(IReadOnlyList<StatsReportSet> daily, IReadOnlyList<StatsReportSet> monthly)
    {
        Daily = daily ?? throw new ArgumentNullException(nameof(daily));
        Monthly = monthly ?? throw new ArgumentNullException(nameof(monthly));
    }

    public IReadOnlyList<StatsReportSet> Daily { get; }

    public IReadOnlyList<StatsReportSet> Monthly { get; }
}

/// <summary>
/// 보고 숫자 읽기(REQ-504). 원본 OperationalReportData.Load를 한 벌마다 줄 그대로 옮겼다(VerifyIdentity만 뺌: 등록 확인은
/// HospitalGate가 이미 했다). 원본 Fail 자리는 그 벌만 ok:false(AC-504.3), SetFinanceUnconfirmed 자리는 금액 확인 필요(AC-504.2)다.
/// SQL 실행 실패와 값 모양 틀림(원본 query_failed 자리)은 BitException(번호만)으로 명령 전체를 멈춘다: 반쪽 자료를 보내지 않는다.
/// SQL은 StatsSql·Sql 상수만 ReadOnlyGuard로 돌린다. 숫자·코드는 기록·예외 글에 싣지 않는다.
/// </summary>
public static class StatsReport
{
    private const int MaxLaCodes = 500;
    private static readonly Regex LaCodeShape = new Regex("^LA[A-Z0-9_.-]{0,30}$", RegexOptions.CultureInvariant);

    private const string InvalidAggregate = "invalid_aggregate";
    private const string HistoryUnsupported = "history_unsupported";
    private const string CodeLimit = "code_limit";

    /// <param name="to">기간 끝날 YYYY-MM-DD(명령 표가 검사한 값). 네 벌: 일일 to·to−1, 월말 to가 든 달(1일 ~ to)·그 앞 달 전체</param>
    public static StatsReportResult Read(IBitDb db, string hospitalScope, string to)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var day = StatsRows.Day(to);
        // 앞 달·다음 날을 셀 수 없는 해
        if (day.Year < 2 || day.Year > 9998) throw new HelperException(ErrorCodes.BadMessage);

        var next = day.AddDays(1);
        var previous = day.AddDays(-1);
        var month = new DateTime(day.Year, day.Month, 1);
        var priorMonth = month.AddMonths(-1);
        var daily = new[]
        {
            Load(db, new Request(true, Iso(day), day, next, false, hospitalScope)),
            Load(db, new Request(true, Iso(previous), previous, day, false, hospitalScope)),
        };
        var monthly = new[]
        {
            // 원본 PartialMonth: 끝이 다음 달 1일에 못 미치면 월중
            Load(db, new Request(false, YearMonth(month), month, next, next.Day != 1, hospitalScope)),
            Load(db, new Request(false, YearMonth(priorMonth), priorMonth, month, false, hospitalScope)),
        };
        return new StatsReportResult(daily, monthly);
    }

    private static StatsReportSet Load(IBitDb db, Request request)
    {
        var result = new StatsReportSet(request.Period);
        var snapshot = Scalar(Meta(db, Sql.SnapshotStateSql)) == 1;

        if (Scalar(Meta(db, StatsSql.HistoryGuardSql)) != 0) return Fail(result, HistoryUnsupported);
        if (Scalar(Data(db, request, StatsSql.UnsupportedFinanceSql)) != 0)
        {
            SetFinanceUnconfirmed(result, "환불·변경수납·예치금 자료가 있어 금액을 자동 집계하지 않았습니다. 원본 외래환자경영통계에서 확인해 직접 입력하세요.");
        }

        var patients = Data(db, request, StatsSql.PatientsSql);
        if (patients.Count == 0) return Fail(result, InvalidAggregate);
        var visits = patients[0];
        result.TotalVisits = Number(visits, 0);
        result.NewPatients = Number(visits, 1);
        if (Number(visits, 2) != 0
            || Number(visits, 3) != 0
            || Number(visits, 4) != 0)
        {
            return Fail(result, InvalidAggregate);
        }
        result.ReturnPatients = result.TotalVisits - result.NewPatients;
        if (result.ReturnPatients < 0) return Fail(result, InvalidAggregate);

        foreach (var row in Data(db, request, StatsSql.TreatmentsSql))
        {
            var key = Word(row);
            var value = Number(row, 1);
            if (Number(row, 2) != 0) return Fail(result, InvalidAggregate);
            if (key == "manual") result.Treatments.Manual = value;
            else if (key == "eswt") result.Treatments.Eswt = value;
            else if (key == "carm") result.Treatments.Carm = value;
            else if (key == "sono") result.Treatments.Sono = value;
            else if (key == "cryo") result.Treatments.Cryo = value;
        }

        foreach (var row in Data(db, request, StatsSql.LaCodesSql))
        {
            var code = Word(row).Trim();
            if (result.LaCodes.Count >= MaxLaCodes || !LaCodeShape.IsMatch(code)) return Fail(result, CodeLimit);
            result.LaCodes.Add(new StatsLaCode(code, Number(row, 1)));
        }

        if (!result.FinanceUnconfirmed && Scalar(Data(db, request, StatsSql.FinanceMultiplicitySql)) != 0)
        {
            SetFinanceUnconfirmed(result, "같은 내원의 수납일 또는 연결 자료가 중복되어 금액을 자동 집계하지 않았습니다. 원본 금융 통계에서 확인해 직접 입력하세요.");
        }
        if (!result.FinanceUnconfirmed && Scalar(Data(db, request, StatsSql.ReceivableMultiplicitySql)) != 0)
        {
            SetFinanceUnconfirmed(result, "같은 내원의 미수입금 수납일 또는 연결 자료가 중복되어 금액을 자동 집계하지 않았습니다. 원본 금융 통계에서 확인해 직접 입력하세요.");
        }
        if (!result.FinanceUnconfirmed) AddFinance(db, request, result);

        result.Notes.Add("총환은 취소·제외 기록을 뺀 외래 내원 건수입니다. 같은 환자의 추가 접수도 포함합니다.");
        result.Notes.Add("신환은 같은 병원 보유 이력의 유효 외래·입원 첫 내원이 조회 기간에 있는 환자 수이며, 재진은 총내원에서 신환을 뺀 건수입니다. 이관 전·삭제된 과거 기록은 확인할 수 없습니다.");
        result.Notes.Add(request.Daily ? "일일 치료는 치료별 차트번호 중복을 제거한 환자 수입니다." : "월간 치료는 유효 처방행 수입니다. 동일 환자의 여러 처방을 각각 셉니다.");
        result.Notes.Add("LA 코드는 실제 LA 접두어 코드별 유효 처방행 수입니다. 횟수·수량을 곱한 값이 아닙니다.");
        result.Notes.Add("금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있으면 금액을 '확인 필요'로 두고 환자수·치료·LA만 집계합니다.");
        result.Notes.Add("입금액은 선택 기간 정상수납과 미수입금 합계입니다. 현금·카드·계좌 구분을 유지하고 현금영수증 발급 기록·미수발생은 입금액에 중복 반영하지 않습니다. 미수상각은 입금액에서 차감하지 않습니다.");
        result.Notes.Add("건당진료비는 총진료비÷총내원건수로 계산합니다. 원본 통계의 수납액 기준 건당 지표와 다를 수 있습니다.");
        result.Notes.Add(snapshot ? "조회는 DB의 기존 스냅샷 격리를 사용했습니다." : "조회시점의 자료입니다. 조회 중 변경된 기록은 다음 조회 결과에 반영될 수 있습니다.");
        if (request.PartialMonth) result.Notes.Add("월중 집계: 선택한 달의 1일부터 오늘까지 집계했습니다.");
        if (result.FinanceUnconfirmed) result.Notes.Add("이 기간은 금액을 자동 집계하지 않았습니다(환자수·치료·LA는 정상). 비트 원본 외래환자경영통계에서 금액을 확인해 직접 입력하세요.");
        return result;
    }

    private static StatsReportSet Fail(StatsReportSet result, string reason)
    {
        result.Reason = reason;
        return result;
    }

    /// <summary>원본 SetFinanceUnconfirmed: 첫 사유만 남긴다. 금액은 AddFinance를 돌리지 않아 0 그대로다.</summary>
    private static void SetFinanceUnconfirmed(StatsReportSet result, string reason)
    {
        if (result.FinanceUnconfirmed) return;
        result.FinanceUnconfirmed = true;
        result.FinanceUnconfirmedReason = reason;
    }

    /// <summary>원본 AddFinance 두 번: 여섯 칸을 decimal로 다 더한 뒤 칸마다 원 미만을 버린다(반올림하지 않음, AC-504.4).</summary>
    private static void AddFinance(IBitDb db, Request request, StatsReportSet result)
    {
        var amounts = new decimal[6];
        foreach (var row in Data(db, request, StatsSql.FinanceNormalSql)) Accumulate(amounts, row);
        foreach (var row in Data(db, request, StatsSql.FinanceReceivableSql)) Accumulate(amounts, row);
        result.TotalAmount = Won(amounts[0]);
        result.InsurerAmount = Won(amounts[1]);
        result.NoncoveredAmount = Won(amounts[2]);
        result.CashAmount = Won(amounts[3]);
        result.CardAmount = Won(amounts[4]);
        result.TransferAmount = Won(amounts[5]);
    }

    /// <summary>원본 Amount·AccumulateFinance: DB NULL은 0. 숫자가 아니거나 넘치면 E-BIT-READ-FAILED(값을 예외 글에 싣지 않는다).</summary>
    private static void Accumulate(decimal[] amounts, IReadOnlyList<object?> row)
    {
        for (var i = 0; i < amounts.Length; i++)
        {
            var value = StatsRows.Cell(row, i);
            if (value == null) continue;
            try
            {
                amounts[i] += Convert.ToDecimal(value, CultureInfo.InvariantCulture);
            }
            catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
            {
                throw new BitException(BitErrors.ReadFailed);
            }
        }
    }

    private static long Won(decimal amount)
    {
        try
        {
            // 원 미만만 버린다: Floor는 음수를 0에서 멀어지게 한다(-0.5 → -1)
            return (long)Math.Truncate(amount);
        }
        catch (OverflowException)
        {
            throw new BitException(BitErrors.ReadFailed);
        }
    }

    /// <summary>원본 reader.GetString(0): 첫 칸은 글자여야 한다.</summary>
    private static string Word(IReadOnlyList<object?> row) =>
        StatsRows.Cell(row, 0) as string ?? throw new BitException(BitErrors.ReadFailed);

    /// <summary>원본 Number(reader[n]): DB NULL은 0, 숫자가 아니거나 칸이 모자라면 E-BIT-READ-FAILED.</summary>
    private static long Number(IReadOnlyList<object?> row, int index) => StatsRows.Number(StatsRows.Cell(row, index));

    /// <summary>원본 Number(ExecuteScalar()): 첫 줄의 첫 칸, 줄이 없으면 0.</summary>
    private static long Scalar(IReadOnlyList<IReadOnlyList<object?>> rows) => rows.Count == 0 ? 0 : Number(rows[0], 0);

    private static IReadOnlyList<IReadOnlyList<object?>> Meta(IBitDb db, string sql) =>
        ReadOnlyGuard.Query(db, sql, new Dictionary<string, object?>(), Sql.MetaTimeout);

    /// <summary>원본 Command: 문장의 매개변수 표에 있는 이름만 채운다.</summary>
    private static IReadOnlyList<IReadOnlyList<object?>> Data(IBitDb db, Request request, string sql)
    {
        var args = StatsSql.ParametersOf(sql).ToDictionary(parameter => parameter.Name, parameter => (object?)request.Values[parameter.Name], StringComparer.Ordinal);
        return ReadOnlyGuard.Query(db, sql, args, StatsSql.DataTimeout);
    }

    private static string Iso(DateTime day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string YearMonth(DateTime day) => day.ToString("yyyy-MM", CultureInfo.InvariantCulture);

    /// <summary>원본 OperationalReportRequest + Command의 매개변수 값. 기간은 반열린 [from, to).</summary>
    private sealed class Request
    {
        public Request(bool daily, string period, DateTime from, DateTime to, bool partialMonth, string hospital)
        {
            Daily = daily;
            Period = period;
            PartialMonth = partialMonth;
            Values = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["@day"] = StatsRows.Key(from),
                ["@nextDay"] = StatsRows.Key(to),
                ["@from"] = StatsRows.Key(from) + "0000",
                ["@to"] = StatsRows.Key(to) + "0000",
                ["@hospital"] = hospital,
                ["@daily"] = daily ? "1" : "0",
            };
        }

        public bool Daily { get; }

        public string Period { get; }

        public bool PartialMonth { get; }

        public Dictionary<string, string> Values { get; }
    }
}
