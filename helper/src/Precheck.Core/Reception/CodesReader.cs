using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text.Unicode;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Reception;

/// <summary>지난 30일 처방 코드 하나: 코드(대문자)·사전 이름(없으면 null)·내원 수.</summary>
public sealed class RecentCode
{
    public RecentCode(string code, string? name, long visits)
    {
        Code = code ?? throw new ArgumentNullException(nameof(code));
        Name = name;
        Visits = visits;
    }

    public string Code { get; }
    public string? Name { get; }
    public long Visits { get; }
}

/// <summary>GET /api/codes의 답: 코드 목록, 또는 비트를 볼 수 없음(오류 번호만).</summary>
public sealed class CodesResult
{
    private CodesResult(IReadOnlyList<RecentCode> codes, string? error)
    {
        Codes = codes;
        Error = error;
    }

    public bool IsOk => Error == null;

    /// <summary>내원 수 많은 순(비트가 준 차례 그대로). 실패면 빈 목록</summary>
    public IReadOnlyList<RecentCode> Codes { get; }

    /// <summary>실패 오류 번호(E-…). 성공이면 null</summary>
    public string? Error { get; }

    public static CodesResult Ok(IReadOnlyList<RecentCode> codes) => new CodesResult(codes ?? throw new ArgumentNullException(nameof(codes)), null);

    public static CodesResult Unavailable(string error) => new CodesResult(new RecentCode[0], error ?? throw new ArgumentNullException(nameof(error)));

    /// <summary>{"codes":[{"c","n","v"}]}. 한국어는 그대로, HTML 뜻 글자는 \u로 쓴다.</summary>
    public string ToJson() => CodesJson.Write(writer =>
    {
        writer.WriteStartObject();
        writer.WriteStartArray("codes");
        foreach (var code in Codes)
        {
            writer.WriteStartObject();
            writer.WriteString("c", code.Code);
            CodesJson.Name(writer, code.Name);
            writer.WriteNumber("v", code.Visits);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
    });
}

/// <summary>GET /api/code/{c}의 답: 코드(대문자)와 이름(없으면 null), 코드 모양이 틀림(NotFound), 비트를 볼 수 없음(Unavailable).</summary>
public sealed class CodeNameResult
{
    private CodeNameResult(HistoryState state, string? code, string? name, string? error)
    {
        State = state;
        Code = code;
        Name = name;
        Error = error;
    }

    public HistoryState State { get; }
    public string? Code { get; }
    public string? Name { get; }
    public string? Error { get; }

    public static CodeNameResult Ok(string code, string? name) => new CodeNameResult(HistoryState.Ok, code ?? throw new ArgumentNullException(nameof(code)), name, null);

    public static CodeNameResult NotFound() => new CodeNameResult(HistoryState.NotFound, null, null, null);

    public static CodeNameResult Unavailable(string error) => new CodeNameResult(HistoryState.Unavailable, null, null, error ?? throw new ArgumentNullException(nameof(error)));

    /// <summary>{"c","n"}. Ok일 때만 쓴다.</summary>
    public string ToJson()
    {
        if (State != HistoryState.Ok || Code == null) throw new InvalidOperationException("코드 이름이 없다");
        return CodesJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("c", Code);
            CodesJson.Name(writer, Name);
            writer.WriteEndObject();
        });
    }
}

/// <summary>
/// 칸 설정 화면의 처방 코드 읽기(spec reception-other-clinic design.md 4절, REQ-5705).
/// - <see cref="Codes"/>(AC-5705.1): 등록 확인(HospitalGate)을 지난 세션에서 ReceptionSql.RecentCodes(@from 오늘−30일 0000, @to 내일 0000, @hospital 등록 범위)를
///   돌리고, 줄이 있으면 같은 세션에서 RxNames로 이름을 붙인다. 성공한 목록은 5분 동안(날이 바뀌면 그 전에) 기억한다. 실패는 기억하지 않는다.
/// - <see cref="Name"/>(AC-5705.2): 코드 모양(^[0-9A-Za-z가-힣_]{1,16}$)이 맞을 때만 대문자로 CodeName을 돌린다. 틀리면 비트를 열지 않고 NotFound.
/// - 이름은 제어 글자를 빼고 앞뒤 공백을 지운 뒤 40글자에서 자르고, 남은 글이 없으면 null(AC-5705.3). 코드는 앞뒤 공백을 뺀 대문자이고,
///   설정 코드 모양(^[0-9A-Z가-힣_]{1,16}$)이 아니거나 앞 줄과 같은 코드는 뺀다(칸에 넣을 수 없는 코드).
/// - 문장마다 남은 시간(모두 합쳐 8초 안)만 넘긴다. 실패·시간 넘음은 오류 번호만 돌려준다(코드·이름·병원 글을 싣지 않는다).
/// </summary>
public sealed class CodesReader
{
    /// <summary>코드 목록을 기억하는 시간(design.md 4절)</summary>
    public static readonly TimeSpan Keep = TimeSpan.FromMinutes(5);

    /// <summary>비트 읽기 한 번의 시간 한도(접수 현황 읽기와 같은 8초)</summary>
    public static readonly TimeSpan Timeout = BoardReader.Timeout;

    /// <summary>목록이 보는 지난 날 수(오늘−30일 ~ 오늘)</summary>
    public const int Days = 30;

    /// <summary>이름 글자 수 한도(유니코드 글자 단위)</summary>
    public const int MaxName = 40;

    private static readonly Regex CodeShape = new Regex(@"^[0-9A-Za-z가-힣_]{1,16}\z", RegexOptions.CultureInvariant);
    private static readonly Regex SavedShape = new Regex(@"^[0-9A-Z가-힣_]{1,16}\z", RegexOptions.CultureInvariant);

    private readonly BitServices services;
    private readonly Func<DateTime> clock;
    private readonly object gate = new object();
    private CodesResult? kept;
    private DateTime keptAt;

    public CodesReader(BitServices services, Func<DateTime>? clock = null)
    {
        this.services = services ?? throw new ArgumentNullException(nameof(services));
        this.clock = clock ?? (() => DateTime.Now);
    }

    /// <summary>코드 모양(^[0-9A-Za-z가-힣_]{1,16}$)인가</summary>
    public static bool IsCode(string? code) => code != null && CodeShape.IsMatch(code);

    /// <summary>지난 30일 처방 코드 목록(AC-5705.1). 5분 안에 다시 부르면 기억한 것을 준다.</summary>
    public CodesResult Codes()
    {
        lock (gate)
        {
            var now = clock();
            if (kept != null && now.Date == keptAt.Date && now >= keptAt && now - keptAt < Keep) return kept;
            var result = ReadCodes(now);
            if (result.IsOk)
            {
                kept = result;
                keptAt = now;
            }
            else
            {
                kept = null;
            }
            return result;
        }
    }

    /// <summary>코드 하나의 사전 이름(AC-5705.2). 코드 모양이 틀리면 비트를 열지 않고 NotFound.</summary>
    public CodeNameResult Name(string? code)
    {
        if (!IsCode(code)) return CodeNameResult.NotFound();
        var upper = code!.ToUpperInvariant();
        try
        {
            var deadline = clock() + Timeout;
            using var hospital = HospitalGate.Open(services);
            var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@code"] = upper };
            var rows = Query(hospital.Db, ReceptionSql.CodeName, args, deadline);
            string? name = null;
            if (rows.Count > 0)
            {
                var row = rows[0];
                if (row == null || row.Count < 1) throw ReadFailed();
                name = CleanName(row[0]);
            }
            return CodeNameResult.Ok(upper, name);
        }
        catch (Exception e)
        {
            return CodeNameResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }
    }

    private CodesResult ReadCodes(DateTime now)
    {
        try
        {
            var deadline = now + Timeout;
            var today = now.Date;
            using var hospital = HospitalGate.Open(services);
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@from"] = Stamp(today.AddDays(-Days)),
                ["@to"] = Stamp(today.AddDays(1)),
                ["@hospital"] = hospital.Registration.Scope,
            };
            var counted = new List<(string Code, long Visits)>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in Query(hospital.Db, ReceptionSql.RecentCodes, args, deadline))
            {
                if (row == null || row.Count < 2) throw ReadFailed();
                var visits = Number(row[1]);
                var code = Text(row[0])?.Trim().ToUpperInvariant();
                if (code == null || !SavedShape.IsMatch(code) || !seen.Add(code)) continue;
                counted.Add((code, visits));
            }

            var names = new Dictionary<string, string?>(StringComparer.Ordinal);
            if (counted.Count > 0)
            {
                var none = new Dictionary<string, object?>(StringComparer.Ordinal);
                foreach (var row in Query(hospital.Db, ReceptionSql.RxNames, none, deadline))
                {
                    if (row == null || row.Count < 2) throw ReadFailed();
                    var key = Text(row[0])?.Trim().ToUpperInvariant();
                    if (string.IsNullOrEmpty(key) || names.ContainsKey(key!)) continue;
                    names[key!] = CleanName(row[1]);
                }
            }

            return CodesResult.Ok(counted
                .Select(c => new RecentCode(c.Code, names.TryGetValue(c.Code, out var name) ? name : null, c.Visits))
                .ToList());
        }
        catch (Exception e)
        {
            return CodesResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }
    }

    /// <summary>정해 둔 문장을 남은 시간 안에서 돌린다. 시간이 다 갔으면 돌리지 않고 읽기 실패.</summary>
    private IReadOnlyList<IReadOnlyList<object?>> Query(IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, DateTime deadline)
    {
        var left = deadline - clock();
        if (left <= TimeSpan.Zero) throw ReadFailed();
        if (left > Timeout) left = Timeout;
        return ReadOnlyGuard.Query(db, sql, args, left);
    }

    /// <summary>yyyyMMdd0000(OcmAcpDtm과 같은 12글자)</summary>
    private static string Stamp(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "0000";

    private static string? Text(object? cell) =>
        cell == null || cell is DBNull ? null : cell as string ?? Convert.ToString(cell, CultureInfo.InvariantCulture);

    /// <summary>내원 수 칸: 0 이상 정수만. 아니면 읽기 실패(지어내지 않는다).</summary>
    private static long Number(object? cell)
    {
        if (cell == null || cell is DBNull || cell is string || cell is bool) throw ReadFailed();
        long count;
        try
        {
            count = Convert.ToInt64(cell, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            throw ReadFailed();
        }
        if (count < 0) throw ReadFailed();
        return count;
    }

    /// <summary>제어 글자·줄 나눔 글자·짝 없는 대리쌍을 빼고 앞뒤 공백을 지운 뒤 40글자(대리쌍은 한 글자)에서 자른다. 비면 null.</summary>
    internal static string? CleanName(object? cell)
    {
        var text = Text(cell);
        if (text == null) return null;
        var kept = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (char.IsHighSurrogate(c))
            {
                if (i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
                {
                    kept.Append(c).Append(text[i + 1]);
                    i++;
                }
                continue;
            }
            if (char.IsLowSurrogate(c) || char.IsControl(c)) continue;
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.LineSeparator || category == UnicodeCategory.ParagraphSeparator) continue;
            kept.Append(c);
        }
        var trimmed = kept.ToString().Trim();
        if (trimmed.Length == 0) return null;
        var cut = new StringBuilder();
        var letters = 0;
        for (var i = 0; i < trimmed.Length && letters < MaxName; i++, letters++)
        {
            cut.Append(trimmed[i]);
            if (char.IsHighSurrogate(trimmed[i]) && i + 1 < trimmed.Length)
            {
                cut.Append(trimmed[i + 1]);
                i++;
            }
        }
        var name = cut.ToString().TrimEnd();
        return name.Length == 0 ? null : name;
    }

    private static BitException ReadFailed() => new BitException(BitErrors.ReadFailed);
}

/// <summary>코드 답 JSON 쓰기(한국어 그대로, HTML 뜻 글자는 \u, SettingsStore와 같은 글자 규칙).</summary>
internal static class CodesJson
{
    private static readonly JavaScriptEncoder Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);

    public static string Write(Action<Utf8JsonWriter> write)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Encoder = Encoder }))
        {
            write(writer);
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    public static void Name(Utf8JsonWriter writer, string? name)
    {
        if (name == null) writer.WriteNull("n");
        else writer.WriteString("n", name);
    }
}
