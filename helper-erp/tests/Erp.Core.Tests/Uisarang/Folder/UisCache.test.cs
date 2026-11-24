using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Erp.Core.Uisarang;
using Precheck.Core.Store;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Folder;

/// <summary>
/// spec erp-uisarang TASK-9 AC-4210.4(저장소 부분): 모아 둔 값 UisCache(design.md 4-4)를 실제 임시 폴더·가짜 IProtector로 시험한다.
/// 숫자는 시안 예시 관계(지은 값)다. 합치기 차례(cached·설정 바꿔 다시 셈)는 TASK-13 UisDay 시험이 본다.
/// </summary>
public class UisCacheTests
{
    private static readonly DateTime Day = new DateTime(2026, 11, 23);
    private static readonly DateTime OtherDay = new DateTime(2026, 11, 22);
    private static readonly DateTime SavedAt = new DateTime(2026, 11, 23, 18, 30, 0);

    /// <summary>환자 정보 표시 글자(design.md 12-2) — 모아 둔 값 어디에도 없어야 한다.</summary>
    private static readonly string[] PatientMarks = { "가짜환자", "800101", "010-0000", "가짜시", "9000001" };

    private sealed class Clock
    {
        public DateTime Now { get; set; } = SavedAt;
    }

    /// <summary>Protect·Unprotect가 늘 실패하는 보호(DPAPI가 풀지 못할 때처럼).</summary>
    private sealed class FailingProtector : IProtector
    {
        public byte[] Protect(byte[] plain) => throw new CryptographicException("fail");

        public byte[] Unprotect(byte[] cipher) => throw new CryptographicException("fail");
    }

    private static UisCache Cache(UisTempDir temp, Clock clock, IProtector? protector = null) =>
        new UisCache(temp.PathOf("data"), protector ?? new FakeProtector(), () => clock.Now);

    private static string CachePath(UisTempDir temp) => temp.PathOf("data", "uis-cache.bin");

    private static IncomeFacts Income() => new IncomeFacts
    {
        TotalFee = 5_182_300,
        Covered = 3_976_300,
        Insurer = null,
        Received = 1_741_100,
        Noncovered = 1_206_000,
        First = 9,
        Return = 88,
        Headcount = 97,
        Cash = 352_500,
        Card = 1_388_600,
        Columns = new[] { "청구액" },
    };

    private static RxFacts Rx(long amount = 1_234_500) => new RxFacts
    {
        Codes = new Dictionary<string, RxCode>(StringComparer.Ordinal)
        {
            ["AA222"] = new RxCode { Qty = 31, Amount = amount },
            ["MM042"] = new RxCode { Qty = 2.5, Amount = 87_000 },
            ["MX 10"] = new RxCode { Qty = 0.1, Amount = 0 },
        },
        TotalAmount = amount + 87_000,
        Columns = new string[0],
    };

    private static VisitsFacts Visits() => new VisitsFacts { People = 97, New = null, Columns = new[] { "신규환자" } };

    private static VisitPatientFacts VisitPatients() => new VisitPatientFacts
    {
        Rows = 97,
        NewRows = 7,
        UnknownAge = 1,
        AgeNew = new[] { 0, 1, 1, 2, 1, 1, 1, 0, 0, 0 },
        AgeReturn = new[] { 2, 3, 8, 12, 15, 20, 18, 7, 3, 1 },
        HasDate = true,
        Columns = new string[0],
    };

    private static RsvFacts Rsv() => new RsvFacts { Total = 41, Visited = 35, Columns = new string[0] };

    private static RsvPatientFacts RsvPatients() => new RsvPatientFacts
    {
        Rows = 41,
        Visited = 35,
        DistinctCharts = 40,
        AllOnDay = true,
        Columns = new[] { "방문여부" },
    };

    private static UisFactsSet All() => new UisFactsSet
    {
        Income = Income(),
        Rx = Rx(),
        Visits = Visits(),
        VisitPatients = VisitPatients(),
        Rsv = Rsv(),
        RsvPatients = RsvPatients(),
    };

    /// <summary>값 비교용 JSON(시험 쪽 기본 직렬화).</summary>
    private static string Json(object? value) => JsonSerializer.Serialize(value);

    private static string Plain(UisTempDir temp) =>
        Encoding.UTF8.GetString(new FakeProtector().Unprotect(File.ReadAllBytes(CachePath(temp))));

    private static void WriteProtected(UisTempDir temp, string json) =>
        temp.Write(Path.Combine("data", "uis-cache.bin"), new FakeProtector().Protect(Encoding.UTF8.GetBytes(json)));

    /// <summary>손으로 쓴 맞는 꼴의 파일 JSON(4-4). 바꿔 넣을 조각만 고친다.</summary>
    private static string HandJson(string day = "2026-11-23", string savedAt = "2026-11-23T18:30:00.0000000", string v = "1", string? reports = null) =>
        "{\"v\":" + v + ",\"day\":\"" + day + "\",\"savedAt\":\"" + savedAt + "\",\"reports\":" +
        (reports ?? "{\"income\":{\"totalFee\":5182300,\"received\":1741100,\"columns\":[]}," +
                    "\"rx\":{\"codes\":{\"AA222\":{\"qty\":31,\"amount\":1234500}},\"totalAmount\":1234500,\"columns\":[]}," +
                    "\"visitPatients\":{\"rows\":97,\"newRows\":7,\"unknownAge\":0,\"ageNew\":[0,1,1,2,1,1,1,0,0,0],\"ageReturn\":[0,0,0,0,0,0,0,0,0,90],\"hasDate\":true,\"columns\":[]}}") +
        "}";

    [Fact(DisplayName = "AC-4210.4 저장한 날을 다시 읽으면 보고서 여섯 숫자가 그대로다(처방은 코드별 합·소수 총투여량·null 칸 그대로)")]
    public void SavesAndLoadsAllReports()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var facts = All();

        Assert.True(Cache(temp, clock).Save(Day, facts));
        var loaded = Cache(temp, clock).Load(Day);

        Assert.NotNull(loaded);
        Assert.Equal(Json(facts), Json(loaded));
        Assert.Equal(new[] { "AA222", "MM042", "MX 10" }, loaded!.Rx!.Codes.Keys.ToArray());
        Assert.Equal(2.5, loaded.Rx.Codes["MM042"].Qty);
        Assert.Equal(0.1, loaded.Rx.Codes["MX 10"].Qty);
        Assert.Null(loaded.Income!.Insurer);
    }

    [Fact(DisplayName = "AC-4210.4 파일 data\\uis-cache.bin 하나를 IProtector로 보호해 쓴다 — 디스크엔 평문이 없고, 풀면 { v: 1, day, savedAt, reports }에 숫자·칸 이름·처방 코드뿐(환자 표시 글자 없음)")]
    public void FileIsProtectedAndHoldsNumbersOnly()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        Assert.True(Cache(temp, clock).Save(Day, All()));

        Assert.Equal(new[] { "uis-cache.bin" }, Directory.GetFileSystemEntries(temp.PathOf("data")).Select(Path.GetFileName).ToArray());
        var raw = File.ReadAllBytes(CachePath(temp));
        Assert.Equal(Encoding.ASCII.GetBytes("FAKE"), raw.Take(4).ToArray());
        var rawText = Encoding.UTF8.GetString(raw);
        foreach (var plainWord in new[] { "totalFee", "AA222", "2026-11-23", "income" }) Assert.DoesNotContain(plainWord, rawText);

        var plain = Plain(temp);
        foreach (var mark in PatientMarks) Assert.DoesNotContain(mark, plain);
        using var document = JsonDocument.Parse(plain);
        var root = document.RootElement;
        Assert.Equal(new[] { "v", "day", "savedAt", "reports" }, root.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(1, root.GetProperty("v").GetInt32());
        Assert.Equal("2026-11-23", root.GetProperty("day").GetString());
        Assert.Equal("2026-11-23T18:30:00.0000000", root.GetProperty("savedAt").GetString());
        var reports = root.GetProperty("reports");
        Assert.Equal(
            new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" },
            reports.EnumerateObject().Select(p => p.Name).ToArray());

        // reports 안 글자 값은 칸 이름(columns)뿐이고, 객체 열쇠는 정해진 칸 이름과 처방 코드뿐이다
        var strings = new List<string>();
        var keys = new List<string>();
        Walk(reports, strings, keys);
        Assert.Equal(new[] { "청구액", "신규환자", "방문여부" }, strings.ToArray());
        var allowed = new HashSet<string>(StringComparer.Ordinal)
        {
            "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients",
            "totalFee", "covered", "insurer", "received", "noncovered", "first", "return", "headcount", "cash", "card", "columns",
            "codes", "totalAmount", "qty", "amount", "people", "new",
            "rows", "newRows", "unknownAge", "ageNew", "ageReturn", "hasDate", "total", "visited", "distinctCharts", "allOnDay",
            "AA222", "MM042", "MX 10",
        };
        Assert.All(keys, key => Assert.Contains(key, allowed));
    }

    private static void Walk(JsonElement element, List<string> strings, List<string> keys)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    keys.Add(property.Name);
                    Walk(property.Value, strings, keys);
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray()) Walk(item, strings, keys);
                break;
            case JsonValueKind.String:
                strings.Add(element.GetString()!);
                break;
        }
    }

    [Fact(DisplayName = "AC-4210.4 손으로 쓴 맞는 꼴(4-4) 파일은 읽히고 없는 보고서는 null이다")]
    public void ReadsHandWrittenFile()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        WriteProtected(temp, HandJson());

        var loaded = Cache(temp, clock).Load(Day);

        Assert.NotNull(loaded);
        Assert.Equal(5_182_300, loaded!.Income!.TotalFee);
        Assert.Null(loaded.Income.Covered);
        Assert.Equal(31, loaded.Rx!.Codes["AA222"].Qty);
        Assert.Equal(90, loaded.VisitPatients!.AgeReturn[9]);
        Assert.Null(loaded.Visits);
        Assert.Null(loaded.Rsv);
        Assert.Null(loaded.RsvPatients);
    }

    [Fact(DisplayName = "AC-4210.4 파일이 없으면 null")]
    public void MissingFileIsNull()
    {
        using var temp = new UisTempDir();
        Assert.Null(Cache(temp, new Clock()).Load(Day));
    }

    [Fact(DisplayName = "AC-4210.4 다른 날을 물으면 null, 다른 날을 저장하면 앞 날 값은 버리고 새로 쓴다")]
    public void OtherDayIsDropped()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var cache = Cache(temp, clock);
        Assert.True(cache.Save(Day, new UisFactsSet { Income = Income() }));

        Assert.Null(cache.Load(OtherDay));
        Assert.NotNull(cache.Load(Day));

        Assert.True(cache.Save(OtherDay, new UisFactsSet { Rx = Rx() }));
        Assert.Null(cache.Load(Day));
        var other = cache.Load(OtherDay);
        Assert.NotNull(other);
        Assert.Null(other!.Income);
        Assert.Equal(Json(Rx()), Json(other.Rx));
        Assert.DoesNotContain("totalFee", Plain(temp));
    }

    [Fact(DisplayName = "AC-4210.4 마감 일자에 시각이 붙어 와도 그날로 본다")]
    public void DayIgnoresTime()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var cache = Cache(temp, clock);
        Assert.True(cache.Save(Day.AddHours(9), new UisFactsSet { Income = Income() }));

        Assert.NotNull(cache.Load(Day));
        Assert.NotNull(cache.Load(Day.AddHours(23)));
        Assert.Contains("\"day\":\"2026-11-23\"", Plain(temp));
    }

    [Fact(DisplayName = "AC-4210.4 저장 뒤 24시간이 넘으면 null(딱 24시간까지는 쓴다), 넘은 값은 다음 저장에 섞지 않는다")]
    public void ExpiresAfter24Hours()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var cache = Cache(temp, clock);
        Assert.True(cache.Save(Day, new UisFactsSet { Income = Income() }));

        clock.Now = SavedAt.AddHours(24);
        Assert.NotNull(cache.Load(Day));
        clock.Now = SavedAt.AddHours(24).AddSeconds(1);
        Assert.Null(cache.Load(Day));

        Assert.True(cache.Save(Day, new UisFactsSet { Rx = Rx() }));
        var loaded = cache.Load(Day);
        Assert.NotNull(loaded);
        Assert.Null(loaded!.Income);
        Assert.NotNull(loaded.Rx);
    }

    [Fact(DisplayName = "AC-4210.4 같은 날 다시 저장하면 새로 준 보고서만 덮어 쓰고 나머지는 남는다, 저장 시각은 마지막 저장")]
    public void OverwritesPerReport()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var cache = Cache(temp, clock);
        Assert.True(cache.Save(Day, new UisFactsSet { Income = Income(), Rx = Rx(1_000_000) }));

        clock.Now = SavedAt.AddHours(1);
        Assert.True(cache.Save(Day, new UisFactsSet { Rx = Rx(2_000_000), VisitPatients = VisitPatients() }));
        var loaded = cache.Load(Day);

        Assert.NotNull(loaded);
        Assert.Equal(Json(Income()), Json(loaded!.Income));
        Assert.Equal(2_000_000, loaded.Rx!.Codes["AA222"].Amount);
        Assert.Equal(Json(VisitPatients()), Json(loaded.VisitPatients));
        Assert.Null(loaded.Visits);
        Assert.Null(loaded.Rsv);
        Assert.Null(loaded.RsvPatients);
        Assert.Contains("\"savedAt\":\"2026-11-23T19:30:00.0000000\"", Plain(temp));

        // 저장한 값을 부른 쪽이 나중에 바꿔도 모아 둔 값은 그대로다
        var facts = new UisFactsSet { Income = Income() };
        Assert.True(cache.Save(Day, facts));
        facts.Income!.TotalFee = 1;
        Assert.Equal(5_182_300, cache.Load(Day)!.Income!.TotalFee);
    }

    [Theory(DisplayName = "AC-4210.4 풀 수 없거나 깨진 파일은 예외 없이 null")]
    [InlineData("빈 파일")]
    [InlineData("보호 안 됨")]
    [InlineData("JSON 아님")]
    [InlineData("UTF-8 아님")]
    [InlineData("v 2")]
    [InlineData("v 없음")]
    [InlineData("날짜 꼴 틀림")]
    [InlineData("저장 시각 꼴 틀림")]
    [InlineData("reports 없음")]
    [InlineData("reports 배열")]
    [InlineData("모르는 보고서")]
    [InlineData("모르는 칸")]
    [InlineData("숫자 칸에 글자")]
    [InlineData("columns null")]
    [InlineData("나이 구간 10칸 아님")]
    [InlineData("처방 코드 값 null")]
    [InlineData("처방 codes null")]
    [InlineData("파일 자리에 폴더")]
    public void BrokenFileIsNull(string broken)
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        switch (broken)
        {
            case "빈 파일": temp.Write(Path.Combine("data", "uis-cache.bin"), new byte[0]); break;
            case "보호 안 됨": temp.Write(Path.Combine("data", "uis-cache.bin"), HandJson()); break;
            case "JSON 아님": WriteProtected(temp, "모아 둔 값"); break;
            case "UTF-8 아님":
                temp.Write(Path.Combine("data", "uis-cache.bin"), new FakeProtector().Protect(new byte[] { 0x7B, 0xFF, 0xFE, 0x7D }));
                break;
            case "v 2": WriteProtected(temp, HandJson(v: "2")); break;
            case "v 없음": WriteProtected(temp, HandJson().Replace("\"v\":1,", "")); break;
            case "날짜 꼴 틀림": WriteProtected(temp, HandJson(day: "2026/11/23")); break;
            case "저장 시각 꼴 틀림": WriteProtected(temp, HandJson(savedAt: "어제")); break;
            case "reports 없음": WriteProtected(temp, "{\"v\":1,\"day\":\"2026-11-23\",\"savedAt\":\"2026-11-23T18:30:00.0000000\"}"); break;
            case "reports 배열": WriteProtected(temp, HandJson(reports: "[]")); break;
            case "모르는 보고서": WriteProtected(temp, HandJson(reports: "{\"names\":{\"columns\":[]}}")); break;
            case "모르는 칸": WriteProtected(temp, HandJson(reports: "{\"income\":{\"name\":\"가짜환자01\",\"columns\":[]}}")); break;
            case "숫자 칸에 글자": WriteProtected(temp, HandJson(reports: "{\"income\":{\"totalFee\":\"5182300\",\"columns\":[]}}")); break;
            case "columns null": WriteProtected(temp, HandJson(reports: "{\"rsv\":{\"total\":41,\"columns\":null}}")); break;
            case "나이 구간 10칸 아님":
                WriteProtected(temp, HandJson(reports: "{\"visitPatients\":{\"rows\":3,\"ageNew\":[1,2,3],\"ageReturn\":[0,0,0,0,0,0,0,0,0,0],\"columns\":[]}}"));
                break;
            case "처방 코드 값 null": WriteProtected(temp, HandJson(reports: "{\"rx\":{\"codes\":{\"AA222\":null},\"columns\":[]}}")); break;
            case "처방 codes null": WriteProtected(temp, HandJson(reports: "{\"rx\":{\"codes\":null,\"columns\":[]}}")); break;
            case "파일 자리에 폴더": Directory.CreateDirectory(CachePath(temp)); break;
            default: throw new ArgumentOutOfRangeException(nameof(broken));
        }

        Assert.Null(Cache(temp, clock).Load(Day));
    }

    [Fact(DisplayName = "AC-4210.4 풀지 못하는 보호(IProtector 실패)면 읽기는 null, 쓰기는 예외 없이 false이고 파일을 남기지 않는다")]
    public void ProtectorFailure()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        Assert.True(Cache(temp, clock).Save(Day, All()));
        Assert.Null(Cache(temp, clock, new FailingProtector()).Load(Day));

        using var empty = new UisTempDir();
        Assert.False(Cache(empty, clock, new FailingProtector()).Save(Day, All()));
        Assert.False(Directory.Exists(empty.PathOf("data")) && Directory.EnumerateFileSystemEntries(empty.PathOf("data")).Any());
    }

    [Fact(DisplayName = "AC-4210.4 쓸 수 없는 자리(data 자리에 파일)면 예외 없이 false — 모아 둔 값 없이 간다")]
    public void CannotWrite()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        temp.Write("data", "파일");

        Assert.False(Cache(temp, clock).Save(Day, All()));
        Assert.Null(Cache(temp, clock).Load(Day));
    }

    [Fact(DisplayName = "AC-4210.4 깨진 파일이 있어도 저장은 새로 쓰고 깨진 값은 섞지 않는다")]
    public void SaveReplacesBrokenFile()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        temp.Write(Path.Combine("data", "uis-cache.bin"), new byte[] { 1, 2, 3 });

        Assert.True(Cache(temp, clock).Save(Day, new UisFactsSet { Rsv = Rsv() }));
        var loaded = Cache(temp, clock).Load(Day);

        Assert.NotNull(loaded);
        Assert.Equal(Json(Rsv()), Json(loaded!.Rsv));
        Assert.Null(loaded.Income);
    }

    [Fact(DisplayName = "AC-4210.4 빈 묶음 저장은 그날 파일을 새로 쓰고(다른 날 값 버림) 읽으면 보고서가 모두 null")]
    public void EmptySetStartsTheDay()
    {
        using var temp = new UisTempDir();
        var clock = new Clock();
        var cache = Cache(temp, clock);
        Assert.True(cache.Save(OtherDay, All()));

        Assert.True(cache.Save(Day, new UisFactsSet()));
        var loaded = cache.Load(Day);

        Assert.NotNull(loaded);
        Assert.Equal(Json(new UisFactsSet()), Json(loaded));
        Assert.Null(cache.Load(OtherDay));
    }
}
