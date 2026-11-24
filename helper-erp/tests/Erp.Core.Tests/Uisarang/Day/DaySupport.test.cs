using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Erp.Core.Tests.Uisarang.Folder;
using Erp.Core.Uisarang;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;

namespace Erp.Core.Tests.Uisarang.Day;

/// <summary>
/// 가짜 엑셀 폴더(spec erp-uisarang TASK-13, design.md 4-1 IUisFolder): 파일 이름 → 바이트, 부른 차례(List·IsOpen·Read·Delete)를 적는다.
/// 열린 파일·못 지우는 파일·읽다 실패하는 파일·크기만 바꾼 파일을 정할 수 있다. 시험 안에서 만든 줄은 바이트 대신 표 글자를 둔다(DayRig.Rows가 푼다).
/// </summary>
internal sealed class FakeUisFolder : IUisFolder
{
    private readonly SortedDictionary<string, byte[]> files = new SortedDictionary<string, byte[]>(StringComparer.Ordinal);

    public List<string> Calls { get; } = new List<string>();

    public HashSet<string> Open { get; } = new HashSet<string>(StringComparer.Ordinal);

    public HashSet<string> FailDelete { get; } = new HashSet<string>(StringComparer.Ordinal);

    public HashSet<string> FailRead { get; } = new HashSet<string>(StringComparer.Ordinal);

    public Dictionary<string, long> Lengths { get; } = new Dictionary<string, long>(StringComparer.Ordinal);

    public IReadOnlyCollection<string> Names => files.Keys;

    public bool Has(string name) => files.ContainsKey(name);

    public FakeUisFolder Add(string name, byte[] bytes)
    {
        files[name] = bytes;
        return this;
    }

    /// <summary>가짜 의사랑 엑셀(fixtures/fake-uisarang) 하나를 이 이름으로 둔다.</summary>
    public FakeUisFolder Fixture(string name, string fixture) => Add(name, FakeUisFiles.Bytes(fixture));

    public IReadOnlyList<UisFile> List()
    {
        Calls.Add("List");
        return files.Select(file => new UisFile(file.Key, Lengths.TryGetValue(file.Key, out var length) ? length : file.Value.Length)).ToList();
    }

    public bool IsOpen(UisFile file)
    {
        Calls.Add("IsOpen:" + file.Name);
        return Open.Contains(file.Name);
    }

    public byte[] Read(UisFile file)
    {
        Calls.Add("Read:" + file.Name);
        if (FailRead.Contains(file.Name) || !files.TryGetValue(file.Name, out var bytes)) throw new UisFileException();
        return bytes.ToArray();
    }

    public bool Delete(UisFile file)
    {
        Calls.Add("Delete:" + file.Name);
        if (FailDelete.Contains(file.Name)) return false;
        files.Remove(file.Name);
        return true;
    }

    /// <summary>Read·Delete 부름만(차례 그대로).</summary>
    public string[] Touches => Calls.Where(call => call.StartsWith("Read:", StringComparison.Ordinal) || call.StartsWith("Delete:", StringComparison.Ordinal)).ToArray();
}

/// <summary>
/// 한 번 읽기 시험 틀: 가짜 폴더 + 실제 임시 폴더의 모아 둔 값(가짜 보호) + 시계. 시험 안에서 만든 줄은 'ROWS:n' 바이트로 두고 Rows가 줄로 바꾼다
/// (가짜 엑셀이 모자랄 때 생성기에 더하지 않는다 — tasks.md 머리 규칙).
/// </summary>
internal sealed class DayRig : IDisposable
{
    public static readonly DateTime Day = FakeUisFiles.Day;
    public const string DayText = "2026-11-23";

    /// <summary>design.md 12-2 표시 글자: 답·기록·모아 둔 값·예외 글 어디에도 없어야 한다(AC-4209.1).</summary>
    public static readonly string[] Markers = { "가짜환자", "800101", "010-0000", "가짜시", "9000001" };

    // 의사랑 기본 저장 이름 꼴(design.md 5-4). 이름 차례 = 처방 → 내원 → 내원 환자별 → 예약 → 예약 환자별 → 일일수입
    public const string Income = "통계-일일수입통계.xls";
    public const string Rx = "통계-기간별처방통계.xls";
    public const string Visits = "통계-내원일별환자현황.xls";
    public const string VisitPatients = "통계-내원일별환자현황-환자별.xls";
    public const string Rsv = "통계-예약환자통계.xls";
    public const string RsvPatients = "통계-예약환자통계-환자별.xls";

    private readonly UisTempDir temp = new UisTempDir();
    private readonly Dictionary<string, IReadOnlyList<IReadOnlyList<XlsCell>>> made =
        new Dictionary<string, IReadOnlyList<IReadOnlyList<XlsCell>>>(StringComparer.Ordinal);

    public DayRig()
    {
        Cache = new UisCache(temp.PathOf("data"), Protector, () => Now);
    }

    public FakeUisFolder Folder { get; private set; } = new FakeUisFolder();

    public FakeProtector Protector { get; } = new FakeProtector();

    public UisCache Cache { get; set; }

    public DateTime Now { get; set; } = new DateTime(2026, 11, 23, 18, 30, 0);

    public List<string> Notes { get; } = new List<string>();

    public UisTempDir Temp => temp;

    /// <summary>새 가짜 폴더로 바꾼다(모아 둔 값은 그대로).</summary>
    public FakeUisFolder NewFolder()
    {
        Folder = new FakeUisFolder();
        return Folder;
    }

    /// <summary>여섯 보고서 가짜 엑셀을 모두 둔다.</summary>
    public FakeUisFolder All()
    {
        return Folder
            .Fixture(Income, "income.xls")
            .Fixture(Rx, "rx.xls")
            .Fixture(Visits, "visits.xls")
            .Fixture(VisitPatients, "visit-patients.xls")
            .Fixture(Rsv, "rsv.xls")
            .Fixture(RsvPatients, "rsv-patients.xls");
    }

    /// <summary>시험 안에서 만든 줄을 파일 하나로 둔다.</summary>
    public FakeUisFolder Made(string name, IReadOnlyList<IReadOnlyList<XlsCell>> rows)
    {
        var token = "ROWS:" + made.Count.ToString(System.Globalization.CultureInfo.InvariantCulture);
        made[token] = rows;
        return Folder.Add(name, Encoding.ASCII.GetBytes(token));
    }

    /// <summary>바이트 → 줄: 만든 줄 표시면 그 줄, 아니면 XlsRows(실제 .xls 읽기).</summary>
    public IReadOnlyList<IReadOnlyList<XlsCell>> Rows(byte[] bytes)
    {
        var text = bytes.Length < 16 ? Encoding.ASCII.GetString(bytes) : "";
        return made.TryGetValue(text, out var rows) ? rows : XlsRows.Read(bytes);
    }

    public UisDayResult Read(UisArgs args, DateTime? day = null) =>
        UisDay.Read(Folder, Cache, day ?? Day, args, UisFolderKind.Desktop, Rows, note => Notes.Add(note));

    public UisCodesResult Codes() => UisCodes.Read(Folder, Rows);

    /// <summary>모아 둔 값 파일을 풀어 낸 글(없으면 빈 글).</summary>
    public string CachePlain()
    {
        if (!File.Exists(Cache.FilePath)) return "";
        return Encoding.UTF8.GetString(Protector.Unprotect(File.ReadAllBytes(Cache.FilePath)));
    }

    public void Dispose() => temp.Dispose();
}

/// <summary>줄 만들기·인자·답 JSON 읽기.</summary>
internal static class DayKit
{
    public static XlsCell C(object? value) => value switch
    {
        null => XlsCell.Empty,
        string text => new XlsCell(text),
        int number => new XlsCell(number),
        long number => new XlsCell(number),
        double number => new XlsCell(number),
        _ => throw new ArgumentException("칸 값은 글자·숫자·null만"),
    };

    public static IReadOnlyList<XlsCell> Row(params object?[] cells) => cells.Select(C).ToArray();

    public static IReadOnlyList<IReadOnlyList<XlsCell>> Sheet(params IReadOnlyList<XlsCell>[] rows) => rows;

    public static UisCodeGroup G(string key, params string[] codes) => new UisCodeGroup(key, codes);

    public static UisArgs Args(IEnumerable<UisCodeGroup>? groups = null, IEnumerable<UisCodeGroup>? sales = null) =>
        new UisArgs((groups ?? new UisCodeGroup[0]).ToList(), (sales ?? new UisCodeGroup[0]).ToList());

    /// <summary>
    /// 늘 쓰는 인자: 건수 carm·sono·manual·eswt·lipus(소수 0.5)·eswtRadial·ptVisit, 매출 carm·manual·pt(두 코드)·etc1('PROLO C').
    /// rx.xls 값: CA100 4·220,000 · SO100 6 · MM300 8+2·480,000+120,000 · ES100 5 · LA357 0.5 · ES200 2 · AA222 31 · PT100 63,200 · KK090 12,345.6 · 'PROLO  C' 99,999.9
    /// </summary>
    public static UisArgs Usual() => Args(
        new[]
        {
            G("carm", "CA100"), G("sono", "SO100"), G("manual", "mm300"), G("eswt", "ES100"), G("lipus", "LA357"),
            G("eswtRadial", "ES200"), G("ptVisit", "AA222"),
        },
        new[] { G("carm", "CA100"), G("manual", "MM300"), G("pt", "PT100", "KK090"), G("etc1", "PROLO C") });

    /// <summary>답(Envelope.Result 봉투)의 data.</summary>
    public static JsonElement Data(object result) => Data(Envelope.Result("uis-test-1", result));

    public static JsonElement Data(byte[] envelope)
    {
        using var document = JsonDocument.Parse(envelope);
        return document.RootElement.GetProperty("data").Clone();
    }

    public static string Text(object result) => Encoding.UTF8.GetString(Envelope.Result("uis-test-1", result));

    public static long? N(JsonElement element) => element.ValueKind == JsonValueKind.Null ? null : element.GetInt64();

    public static JsonElement ReportOf(JsonElement data, string kind) =>
        data.GetProperty("uis").GetProperty("reports").EnumerateArray().Single(report => report.GetProperty("kind").GetString() == kind);

    public static string State(JsonElement data, string kind) => ReportOf(data, kind).GetProperty("state").GetString()!;

    public static bool Cached(JsonElement data, string kind) => ReportOf(data, kind).GetProperty("cached").GetBoolean();

    public static JsonElement Group(JsonElement data, string key) =>
        data.GetProperty("groups").EnumerateArray().Single(group => group.GetProperty("key").GetString() == key);

    public static string[] Strings(JsonElement array) => array.EnumerateArray().Select(item => item.GetString()!).ToArray();

    public static string[] Keys(JsonElement obj) => obj.EnumerateObject().Select(property => property.Name).ToArray();

    /// <summary>
    /// 답을 확장 readUisDay 시험용으로 남긴다(uis-day.dotnet.test.ts가 ERP_UIS_REPLY_DIR을 주었을 때만): '{날짜}__{이름}.json' = 봉투 그대로.
    /// </summary>
    public static void Dump(string name, string date, object result) => DumpRaw(name, date, Envelope.Result("uis-dump-1", result));

    /// <summary>Dispatcher가 보낸 봉투 바이트 그대로 남긴다.</summary>
    public static void DumpRaw(string name, string date, byte[] envelope)
    {
        var dir = Environment.GetEnvironmentVariable("ERP_UIS_REPLY_DIR");
        if (string.IsNullOrEmpty(dir)) return;
        Directory.CreateDirectory(dir);
        File.WriteAllBytes(Path.Combine(dir, date + "__" + name + ".json"), envelope);
    }

    /// <summary>글에 표시 글자(12-2)가 하나도 없음.</summary>
    public static void NoMarkers(string text, string where)
    {
        foreach (var marker in DayRig.Markers)
        {
            if (text.Contains(marker)) throw new Xunit.Sdk.XunitException(where + "에 환자 표시 글자가 있다");
        }
    }
}
