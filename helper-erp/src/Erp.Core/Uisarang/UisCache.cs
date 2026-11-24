using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Precheck.Core.Store;

namespace Erp.Core.Uisarang;

/// <summary>
/// 모아 둔 값(spec erp-uisarang design.md 4-4, AC-4210.4 저장소 부분): 그날 읽은 보고서 숫자를 data\uis-cache.bin 하나에 둔다.
/// 파일 = IProtector.Protect(UTF-8 JSON { v: 1, day: 'YYYY-MM-DD', savedAt, reports: { kind: facts } }). facts는 *Facts(숫자·칸 이름·처방 코드별 합)뿐이다.
/// - Load(day): 파일이 없거나·날짜가 다르거나·저장 뒤 24시간이 넘었거나·풀 수 없거나·모양이 틀리면 null(예외 없음)
/// - Save(day, facts): 그날 값에 보고서별로 덮어 쓴다(준 보고서만 바꾸고 나머지는 남김). 다른 날·24시간 넘음·깨진 파일이면 새로 쓴다.
///   savedAt = 이번 저장 시각. 못 쓰면 예외 없이 false(모아 둔 값 없이 간다, design.md 3-5)
/// 보호(도우미는 DPAPI)는 부르는 쪽이 넣는다. 같은 PC 두 도우미가 동시에 쓰면 나중 것이 이긴다(값은 다시 읽으면 되는 숫자뿐이라 잠그지 않는다).
/// </summary>
public sealed class UisCache
{
    public const string FileName = "uis-cache.bin";

    /// <summary>파일 판(4-4 v).</summary>
    public const int Version = 1;

    /// <summary>저장 뒤 이 시간이 넘으면 쓰지 않는다(딱 24시간까지는 쓴다).</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromHours(24);

    /// <summary>이보다 큰 파일은 읽지 않는다(처방 코드 수천 개도 1MB 안).</summary>
    private const long MaxFileBytes = 8 * 1024 * 1024;

    private const string DayFormat = "yyyy-MM-dd";
    private const string SavedAtFormat = "yyyy-MM-dd'T'HH:mm:ss.fffffff";

    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    // 칸 이름은 camelCase(income·totalFee…), 처방 코드(사전 열쇠)는 그대로. 모르는 칸이 있으면 깨진 파일로 본다
    private static readonly JsonSerializerOptions Options = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    private readonly string dataDir;
    private readonly IProtector protector;
    private readonly Func<DateTime> now;

    public UisCache(string dataDir, IProtector protector, Func<DateTime> now)
    {
        if (string.IsNullOrWhiteSpace(dataDir)) throw new ArgumentException("저장 폴더가 비었다", nameof(dataDir));
        this.dataDir = dataDir;
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.now = now ?? throw new ArgumentNullException(nameof(now));
    }

    public string FilePath => Path.Combine(dataDir, FileName);

    /// <summary>그날 모아 둔 값. 없거나 쓸 수 없으면 null.</summary>
    public UisFactsSet? Load(DateTime day) => ReadValid(day.Date);

    /// <summary>그날 값에 facts의 보고서(null 아닌 것)만 덮어 써 저장한다. 썼으면 true, 못 썼으면 false(예외 없음).</summary>
    public bool Save(DateTime day, UisFactsSet facts)
    {
        if (facts == null) throw new ArgumentNullException(nameof(facts));
        var stored = ReadValid(day.Date) ?? new UisFactsSet();
        var file = new CacheFile
        {
            V = Version,
            Day = day.Date.ToString(DayFormat, CultureInfo.InvariantCulture),
            SavedAt = now().ToString(SavedAtFormat, CultureInfo.InvariantCulture),
            Reports = new UisFactsSet
            {
                Income = facts.Income ?? stored.Income,
                Rx = facts.Rx ?? stored.Rx,
                Visits = facts.Visits ?? stored.Visits,
                VisitPatients = facts.VisitPatients ?? stored.VisitPatients,
                Rsv = facts.Rsv ?? stored.Rsv,
                RsvPatients = facts.RsvPatients ?? stored.RsvPatients,
            },
        };

        string? temp = null;
        try
        {
            // 직렬화한 바이트를 보호한 뒤에야 쓴다(평문은 디스크에 닿지 않는다). 부른 쪽이 나중에 facts를 바꿔도 파일은 그대로다
            var data = protector.Protect(JsonSerializer.SerializeToUtf8Bytes(file, Options));
            Directory.CreateDirectory(dataDir);
            temp = Path.Combine(dataDir, FileName + "." + Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllBytes(temp, data);
            if (File.Exists(FilePath)) File.Replace(temp, FilePath, null);
            else File.Move(temp, FilePath);
            temp = null;
            return true;
        }
        catch (Exception e) when (IsStoreFailure(e))
        {
            return false;
        }
        finally
        {
            if (temp != null) TryDelete(temp);
        }
    }

    private UisFactsSet? ReadValid(DateTime day)
    {
        try
        {
            var info = new FileInfo(FilePath);
            if (!info.Exists || info.Length == 0 || info.Length > MaxFileBytes) return null;
            var plain = protector.Unprotect(File.ReadAllBytes(FilePath));
            var file = JsonSerializer.Deserialize<CacheFile>(StrictUtf8.GetString(plain), Options);
            if (file == null || file.V != Version || file.Reports == null || !IsWellFormed(file.Reports)) return null;
            if (file.Day != day.ToString(DayFormat, CultureInfo.InvariantCulture)) return null;
            if (!DateTime.TryParseExact(file.SavedAt, SavedAtFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var savedAt)) return null;
            if (now() - savedAt > MaxAge) return null;
            return file.Reports;
        }
        catch (Exception e) when (IsStoreFailure(e))
        {
            return null;
        }
    }

    /// <summary>셈에서 넘어지지 않을 모양인가: 배열·사전이 있고 나이 구간 10칸·소수는 유한한 수.</summary>
    private static bool IsWellFormed(UisFactsSet reports) =>
        (reports.Income == null || HasColumns(reports.Income.Columns))
        && (reports.Rx == null || IsWellFormed(reports.Rx))
        && (reports.Visits == null || HasColumns(reports.Visits.Columns))
        && (reports.VisitPatients == null || IsWellFormed(reports.VisitPatients))
        && (reports.Rsv == null || HasColumns(reports.Rsv.Columns))
        && (reports.RsvPatients == null || HasColumns(reports.RsvPatients.Columns));

    private static bool IsWellFormed(RxFacts rx) =>
        HasColumns(rx.Columns)
        && rx.Codes != null
        && rx.Codes.All(code => code.Key.Length > 0 && code.Value != null && !double.IsNaN(code.Value.Qty) && !double.IsInfinity(code.Value.Qty));

    private static bool IsWellFormed(VisitPatientFacts visits) =>
        HasColumns(visits.Columns)
        && visits.AgeNew != null && visits.AgeNew.Length == 10
        && visits.AgeReturn != null && visits.AgeReturn.Length == 10;

    private static bool HasColumns(string[]? columns) => columns != null && columns.All(column => column != null);

    private static void TryDelete(string file)
    {
        try
        {
            File.Delete(file);
        }
        catch (Exception e) when (IsStoreFailure(e))
        {
        }
    }

    private static bool IsStoreFailure(Exception e) =>
        e is IOException
        || e is UnauthorizedAccessException
        || e is SecurityException
        || e is CryptographicException
        || e is JsonException
        || e is DecoderFallbackException
        || e is ArgumentException
        || e is NotSupportedException
        || e is InvalidOperationException;

    /// <summary>파일 JSON 겉 모양(4-4).</summary>
    private sealed class CacheFile
    {
        [JsonPropertyName("v")]
        public int V { get; set; }

        [JsonPropertyName("day")]
        public string? Day { get; set; }

        [JsonPropertyName("savedAt")]
        public string? SavedAt { get; set; }

        [JsonPropertyName("reports")]
        public UisFactsSet? Reports { get; set; }
    }
}
