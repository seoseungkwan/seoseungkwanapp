using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.ArrangeWriting;
using Precheck.Core.Tests.Reception.PickChoices;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 기능의 C# 시험만 한 거르기로 돌리려고 ArrangeTune 이름 공간에 둔다(TASK-1과 같은 곳)
namespace Precheck.Core.Tests.Reception.ArrangeTune;

/// <summary>
/// 고르기 목록 넓히기·칸 글 모양·몸 한도(spec reception-arrange-tune design.md 2절, REQ-3603).
/// AC-3603.1 기본값에 PT·도수·충격파(타수·부위 수)·견인, 넷이 모두 없는 옛 목록 파일은 그 넷만 기본값, 일부만 있으면 깨진 파일.
/// AC-3603.2 새 무리 이름 규칙·개수 한도, 판 picks·POST /api/lists 몸은 여섯 무리 모두.
/// AC-3603.3 add는 지금 목록으로 본다(PT·도수·견인 = 이름 하나, 충격파 = 부위 수 또는 "{타수} {부위 수}").
/// AC-3603.4 칸 글(det)은 목록 소속이 아니라 모양만(직접 칸 1~21글자, "|"·제어 글자 없음, 다른 칸 "").
/// AC-3603.5 읽기 한도 8192바이트, /api/lists 8192, /api/xray 256·/api/arrange 1024 그대로.
/// 가짜 암호화(XorProtector)·임시 폴더·가짜 비트(ArrangeRig)만 쓴다.
/// </summary>
public class ArrangeTuneListsTests : IDisposable
{
    private const string Now = "10:30";

    private static readonly string[] Pt = { "ICE", "HP" };
    private static readonly string[] Ds = { "30분", "50분" };
    private static readonly string[] Hits = { "2000타", "3000타", "4000타", "6000타" };
    private static readonly string[] Counts = { "1부위", "2부위", "3부위", "4부위" };
    private static readonly string[] Trac = { "목", "허리" };

    private static readonly JsonWriterOptions Relaxed = new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-tune-lists-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string ListsPath => Path.Combine(folder, ReceptionLists.FileName);

    private ReceptionLists OpenLists() => new ReceptionLists(new StoreFolder(folder), protector, code => { lock (reports) reports.Add(code); });

    private ArrangeMarks OpenMarks() =>
        new ArrangeMarks(new StoreFolder(folder), protector, () => new DateTime(2026, 11, 16, 10, 30, 0), code => { lock (reports) reports.Add(code); });

    /// <summary>목록 파일의 암호문만 바꾼다(머리는 그대로). 먼저 Save로 파일을 만든 뒤 부른다.</summary>
    private void WriteListsPlain(string json)
    {
        var data = File.ReadAllBytes(ListsPath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(ListsPath, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static PickLists Parse(string json) =>
        PickLists.TryParse(Encoding.UTF8.GetBytes(json), out var lists) ? lists : throw new InvalidOperationException("시험 목록이 틀렸다");

    private static ArrangeOp Op(string op, string? col = null, string? v = null) => new ArrangeOp("0123456789abcdef", op, col, v);

    private static readonly IReadOnlyDictionary<string, ArrangeCell> NoCells = new Dictionary<string, ArrangeCell>();

    /// <summary>PT 냉찜질·온찜질, 도수 20분, 충격파 타수 없음·부위 수 1부위·5부위, 견인 골반으로 바꾼 목록.</summary>
    private static PickLists Custom() => Parse(Picks.Body(
        pt: "[\"냉찜질\",\"온찜질\"]", ds: "[\"20분\"]", hits: "[]", counts: "[\"1부위\",\"5부위\"]", trac: "[\"골반\"]"));

    // ---- AC-3603.1 기본값·옛 파일 ------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.1 PickLists.Defaults의 새 무리는 PT ICE·HP, 도수 30분·50분, 충격파 타수 2000타·3000타·4000타·6000타·부위 수 1부위~4부위, 견인 목·허리(차례 그대로)이고 지금 SONO·C-ARM 기본값은 그대로다")]
    public void DefaultsPinned()
    {
        var lists = PickLists.Defaults;
        Assert.Equal(Pt, lists.Pt);
        Assert.Equal(Ds, lists.Ds);
        Assert.Equal(Hits, lists.EswtHits);
        Assert.Equal(Counts, lists.EswtCounts);
        Assert.Equal(Trac, lists.Trac);
        Assert.Equal(new[] { "목", "등", "허리", "리덕션" }, lists.Procs.Select(p => p.N));
        Assert.Equal(new[] { "TP", "하프", "기본" }, lists.Drugs);
        Assert.Equal(new[] { "소독", "S/O", "봉합" }, lists.Plains);
        Assert.Equal(new[] { "DNA", "채혈" }, lists.Withs);
        foreach (var names in new[] { lists.Pt, lists.Ds, lists.EswtHits, lists.EswtCounts, lists.Trac })
            Assert.False(names is IList<string> list && !list.IsReadOnly, "글 목록을 고칠 수 있다");
    }

    [Fact(DisplayName = "AC-3603.1 목록 파일이 없으면 새 무리까지 기본값이다(기록 없음)")]
    public void MissingFileGivesAllDefaults()
    {
        var current = OpenLists().Current();
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(current));
        Assert.Equal(Hits, current.EswtHits);
        Assert.Empty(reports);
    }

    [Fact(DisplayName = "AC-3603.1 넷(pt·ds·eswt·trac)이 모두 없는 옛 목록 파일은 SONO·C-ARM은 파일 그대로, 그 넷만 기본값으로 읽는다(깨진 파일 아님)")]
    public void OldFileKeepsQueuesAndDefaultsNewGroups()
    {
        OpenLists().Save(Custom());
        WriteListsPlain(Picks.OldBody(procs: "[{\"n\":\"꼬리뼈\",\"noDrug\":false}]", parts: "[\"무릎\"]"));

        var read = OpenLists().Current();
        Assert.Equal(new[] { "꼬리뼈" }, read.Procs.Select(p => p.N));
        Assert.Equal(new[] { "무릎" }, read.Parts);
        Assert.Equal(Pt, read.Pt);
        Assert.Equal(Ds, read.Ds);
        Assert.Equal(Hits, read.EswtHits);
        Assert.Equal(Counts, read.EswtCounts);
        Assert.Equal(Trac, read.Trac);
        Assert.Empty(reports);
    }

    public static IEnumerable<object[]> PartialFiles()
    {
        var old = Picks.OldBody();
        var head = old.Substring(0, old.Length - 1);
        return new[]
        {
            new object[] { "pt만", head + ",\"pt\":[\"ICE\"]}" },
            new object[] { "eswt만", head + ",\"eswt\":{\"hits\":[],\"counts\":[\"1부위\"]}}" },
            new object[] { "trac 빠짐", head + ",\"pt\":[\"ICE\"],\"ds\":[\"30분\"],\"eswt\":{\"hits\":[],\"counts\":[\"1부위\"]}}" },
            new object[] { "새 무리 넷 + 모르는 칸", Picks.Body().Substring(0, Picks.Body().Length - 1) + ",\"x\":[]}" },
            new object[] { "새 무리 규칙 어긋남(PT 0개)", Picks.Body(pt: "[]") },
        };
    }

    [Theory(DisplayName = "AC-3603.1 새 무리가 일부만 있거나 규칙에 어긋난 목록 파일은 깨진 파일(기본값 + E-STORE-BROKEN 한 번)")]
    [MemberData(nameof(PartialFiles))]
    public void PartialFileIsBroken(string why, string json)
    {
        OpenLists().Save(Custom());
        WriteListsPlain(json);

        var lists = OpenLists();
        Assert.True(Picks.Json(PickLists.Defaults) == Picks.Json(lists.Current()), why);
        lists.Current();
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.ToArray());
    }

    [Fact(DisplayName = "AC-3603.1 저장한 새 무리는 다시 연 저장소도 그대로 읽는다")]
    public void SavedNewGroupsRoundTrip()
    {
        OpenLists().Save(Custom());
        var read = OpenLists().Current();
        Assert.Equal(new[] { "냉찜질", "온찜질" }, read.Pt);
        Assert.Equal(new[] { "20분" }, read.Ds);
        Assert.Empty(read.EswtHits);
        Assert.Equal(new[] { "1부위", "5부위" }, read.EswtCounts);
        Assert.Equal(new[] { "골반" }, read.Trac);
        Assert.Empty(reports);
    }

    // ---- AC-3603.2 모양·한도·여섯 무리 -------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.2 Write(판 picks·목록 파일)는 { carm, sono, pt, ds, eswt: { hits, counts }, trac } 여섯 무리를 목록 차례 그대로 쓴다")]
    public void WriteHasSixGroups()
    {
        using var document = JsonDocument.Parse(Picks.Json(PickLists.Defaults));
        var root = document.RootElement;
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac" }, root.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "hits", "counts" }, root.GetProperty("eswt").EnumerateObject().Select(p => p.Name));
        Assert.Equal(Pt, root.GetProperty("pt").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(Ds, root.GetProperty("ds").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(Hits, root.GetProperty("eswt").GetProperty("hits").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(Counts, root.GetProperty("eswt").GetProperty("counts").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(Trac, root.GetProperty("trac").EnumerateArray().Select(e => e.GetString()));
        Assert.True(PickLists.TryParse(Encoding.UTF8.GetBytes(Picks.Json(PickLists.Defaults)), out var again));
        Assert.Equal(Picks.Json(PickLists.Defaults), Picks.Json(again));
    }

    [Fact(DisplayName = "AC-3603.2 판(GET /api/board)의 picks는 여섯 무리(뒤에 더한 칸 extra, spec reception-other-clinic AC-5703.6)이고 새 무리는 지금 목록이다")]
    public void BoardPicksHaveSixGroups()
    {
        using var rig = new ArrangeRig(lists: true);
        var picks = rig.Board().GetProperty("picks");
        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac", "extra" }, picks.EnumerateObject().Select(p => p.Name));
        Assert.Equal(Columns.Layouts.PicksJson(PickLists.Defaults), picks.GetRawText());

        rig.Lists!.Save(Custom());
        Assert.Equal(new[] { "골반" }, rig.Board().GetProperty("picks").GetProperty("trac").EnumerateArray().Select(e => e.GetString()));
    }

    public static IEnumerable<object[]> GoodGroups() => new[]
    {
        new object[] { "PT 1개", Picks.Body(pt: "[\"ICE\"]") },
        new object[] { "PT 8개", Picks.Body(pt: Picks.Strings(Picks.Names("피", 8))) },
        new object[] { "도수 1개", Picks.Body(ds: "[\"10분\"]") },
        new object[] { "도수 8개", Picks.Body(ds: Picks.Strings(Picks.Names("분", 8))) },
        new object[] { "타수 0개", Picks.Body(hits: "[]") },
        new object[] { "타수 8개", Picks.Body(hits: Picks.Strings(Picks.Names("타", 8))) },
        new object[] { "부위 수 1개", Picks.Body(counts: "[\"1부위\"]") },
        new object[] { "부위 수 8개", Picks.Body(counts: Picks.Strings(Picks.Names("부위", 8))) },
        new object[] { "견인 1개", Picks.Body(trac: "[\"목\"]") },
        new object[] { "견인 8개", Picks.Body(trac: Picks.Strings(Picks.Names("견", 8))) },
        new object[] { "10글자·가운데 빈칸", Picks.Body(pt: "[\"가나다라마바사아자차\",\"냉 찜질\"]") },
        new object[] { "무리가 달라 같은 이름", Picks.Body(trac: "[\"목\"]", pt: "[\"목\"]", ds: "[\"목\"]", hits: "[\"목\"]", counts: "[\"목\"]") },
    };

    [Theory(DisplayName = "AC-3603.2 새 무리는 이름 규칙(1~10글자)·개수 PT 1~8·도수 1~8·타수 0~8·부위 수 1~8·견인 1~8 안이면 받고, Write → TryParse가 같은 글이다")]
    [MemberData(nameof(GoodGroups))]
    public void AcceptsGoodGroups(string why, string body)
    {
        Assert.True(PickLists.TryParse(Encoding.UTF8.GetBytes(body), out var lists), why);
        Assert.True(PickLists.TryParse(Encoding.UTF8.GetBytes(Picks.Json(lists)), out var again), why);
        Assert.Equal(Picks.Json(lists), Picks.Json(again));
    }

    [Fact(DisplayName = "AC-3603.2 새 무리 이름도 앞뒤 빈칸을 뺀 글로 남는다")]
    public void TrimsNewGroups()
    {
        var lists = Parse(Picks.Body(pt: "[\" ICE \"]", ds: "[\"30분 \"]", hits: "[\" 2000타\"]", counts: "[\" 1부위 \"]", trac: "[\"  목\"]"));
        Assert.Equal(new[] { "ICE" }, lists.Pt);
        Assert.Equal(new[] { "30분" }, lists.Ds);
        Assert.Equal(new[] { "2000타" }, lists.EswtHits);
        Assert.Equal(new[] { "1부위" }, lists.EswtCounts);
        Assert.Equal(new[] { "목" }, lists.Trac);
    }

    public static IEnumerable<object[]> BadGroups()
    {
        var old = Picks.OldBody();
        var head = old.Substring(0, old.Length - 1);
        return new[]
        {
            new object[] { "옛 모양(carm·sono만)", old },
            new object[] { "pt 없음", head + ",\"ds\":[\"30분\"],\"eswt\":{\"hits\":[],\"counts\":[\"1부위\"]},\"trac\":[\"목\"]}" },
            new object[] { "ds 없음", head + ",\"pt\":[\"ICE\"],\"eswt\":{\"hits\":[],\"counts\":[\"1부위\"]},\"trac\":[\"목\"]}" },
            new object[] { "eswt 없음", head + ",\"pt\":[\"ICE\"],\"ds\":[\"30분\"],\"trac\":[\"목\"]}" },
            new object[] { "trac 없음", head + ",\"pt\":[\"ICE\"],\"ds\":[\"30분\"],\"eswt\":{\"hits\":[],\"counts\":[\"1부위\"]}}" },
            new object[] { "carm 없음", Picks.Body().Replace("\"carm\":", "\"zz\":") },
            new object[] { "모르는 맨 위 칸", Picks.Body().Substring(0, Picks.Body().Length - 1) + ",\"x\":[]}" },
            new object[] { "pt 두 번", Picks.Body().Substring(0, Picks.Body().Length - 1) + ",\"pt\":[\"ICE\"]}" },
            new object[] { "eswt hits 없음", Picks.Body().Replace("\"hits\":", "\"zz\":") },
            new object[] { "eswt counts 없음", Picks.Body().Replace("\"counts\":", "\"zz\":") },
            new object[] { "eswt에 모르는 칸", Picks.Body(counts: "[\"1부위\"],\"x\":[]") },
            new object[] { "eswt가 배열", Picks.Body().Replace("\"eswt\":{", "\"eswt\":[{").Replace("]},\"trac\"", "]}],\"trac\"") },
            new object[] { "pt가 글", Picks.Body(pt: "\"ICE\"") },
            new object[] { "pt에 숫자", Picks.Body(pt: "[1]") },
            new object[] { "trac에 null", Picks.Body(trac: "[null]") },
            new object[] { "PT 0개", Picks.Body(pt: "[]") },
            new object[] { "PT 9개", Picks.Body(pt: Picks.Strings(Picks.Names("피", 9))) },
            new object[] { "도수 0개", Picks.Body(ds: "[]") },
            new object[] { "도수 9개", Picks.Body(ds: Picks.Strings(Picks.Names("분", 9))) },
            new object[] { "타수 9개", Picks.Body(hits: Picks.Strings(Picks.Names("타", 9))) },
            new object[] { "부위 수 0개", Picks.Body(counts: "[]") },
            new object[] { "부위 수 9개", Picks.Body(counts: Picks.Strings(Picks.Names("부위", 9))) },
            new object[] { "견인 0개", Picks.Body(trac: "[]") },
            new object[] { "견인 9개", Picks.Body(trac: Picks.Strings(Picks.Names("견", 9))) },
            new object[] { "PT 겹침", Picks.Body(pt: "[\"ICE\",\" ICE\"]") },
            new object[] { "타수 겹침", Picks.Body(hits: "[\"2000타\",\"2000타\"]") },
            new object[] { "부위 수 겹침", Picks.Body(counts: "[\"1부위\",\"1부위\"]") },
            new object[] { "견인 겹침", Picks.Body(trac: "[\"목\",\"목\"]") },
            new object[] { "11글자", Picks.Body(ds: "[\"가나다라마바사아자차카\"]") },
            new object[] { "빈 이름", Picks.Body(trac: "[\"\"]") },
            new object[] { "빈칸뿐", Picks.Body(counts: "[\"  \"]") },
            new object[] { "| 든 이름", Picks.Body(hits: "[\"2000|타\"]") },
            new object[] { "제어 글자", Picks.Body(pt: "[\"I\\tCE\"]") },
            new object[] { "짝 없는 대리쌍", Picks.Body(trac: "[\"목\\ud800\"]") },
        };
    }

    [Theory(DisplayName = "AC-3603.2 여섯 무리 중 하나라도 없거나 새 무리가 이름 규칙·개수·겹침·모양에 어긋나면 받지 않는다")]
    [MemberData(nameof(BadGroups))]
    public void RejectsBadGroups(string why, string body)
    {
        Assert.False(PickLists.TryParse(Encoding.UTF8.GetBytes(body), out var lists), why);
        Assert.Same(PickLists.Defaults, lists);
    }

    [Fact(DisplayName = "AC-3603.2 목록을 직접 만들 때도 새 무리 규칙이다(어긋나면 ArgumentException, 넘기지 않은 무리는 기본값)")]
    public void ConstructorChecksNewGroups()
    {
        var procs = new[] { new PickProc("목", false) };
        var none = new string[0];
        var parts = new[] { "어깨" };
        var made = new PickLists(procs, none, parts, none, none);
        Assert.Equal(Pt, made.Pt);
        Assert.Equal(Trac, made.Trac);
        var custom = new PickLists(procs, none, parts, none, none, pt: new[] { " 냉찜질 " }, eswtHits: none);
        Assert.Equal(new[] { "냉찜질" }, custom.Pt);
        Assert.Empty(custom.EswtHits);
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(procs, none, parts, none, none, pt: none));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(procs, none, parts, none, none, ds: Picks.Names("분", 9)));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(procs, none, parts, none, none, eswtCounts: none));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(procs, none, parts, none, none, trac: new[] { "목", "목" }));
        Assert.ThrowsAny<ArgumentException>(() => new PickLists(procs, none, parts, none, none, eswtHits: new[] { "a|b" }));
    }

    [Theory(DisplayName = "AC-3603.2 POST /api/lists 몸은 여섯 무리가 모두 있어야 하고(하나라도 빠지면 400, 목록·파일 그대로) 모두 있으면 204")]
    [InlineData("pt", 400)]
    [InlineData("ds", 400)]
    [InlineData("eswt", 400)]
    [InlineData("trac", 400)]
    [InlineData("carm", 400)]
    [InlineData("sono", 400)]
    [InlineData(null, 204)]
    public void ListsRouteNeedsSixGroups(string? drop, int status)
    {
        using var rig = new ArrangeRig(lists: true);
        var body = Picks.Body(pt: "[\"냉찜질\"]");
        if (drop != null)
        {
            using var document = JsonDocument.Parse(body);
            using var buffer = new MemoryStream();
            using (var writer = new Utf8JsonWriter(buffer, Relaxed))
            {
                writer.WriteStartObject();
                foreach (var group in document.RootElement.EnumerateObject().Where(p => p.Name != drop)) group.WriteTo(writer);
                writer.WriteEndObject();
            }
            body = Encoding.UTF8.GetString(buffer.ToArray());
        }

        Assert.Equal(status, rig.Post(Encoding.UTF8.GetBytes(body), "/api/lists").Status);
        Assert.Equal(status == 204 ? new[] { "냉찜질" } : Pt, rig.Lists!.Current().Pt);
        Assert.Equal(status == 204, File.Exists(Path.Combine(rig.DataPath, ReceptionLists.FileName)));
    }

    // ---- AC-3603.3 add는 지금 목록으로 ------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.3 ArrangeChoices.IsAdd(설정, 칸, v, t)는 PT·도수·견인 = 그 목록 이름, 충격파 = 부위 수 하나 또는 타수|부위 수(spec reception-other-clinic AC-5703.4), X-RAY = X-ray 찍기를 받고 넘긴 목록을 따른다")]
    public void AddOfFollowsLists()
    {
        var defaults = ArrangeLayout.Ours;
        Assert.All(Pt, v => Assert.True(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Pt, v, null), v));
        Assert.All(Ds, v => Assert.True(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Ds, v, null), v));
        Assert.All(Trac, v => Assert.True(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Trac, v, null), v));
        Assert.All(Counts.Concat(Hits.SelectMany(hit => Counts.Select(count => hit + "|" + count))), v => Assert.True(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Eswt, v, null), v));
        Assert.True(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Xray, "X-ray 찍기", null));
        Assert.False(ArrangeChoices.IsAdd(defaults, ArrangeKeys.Pt, "냉찜질", null));

        var custom = ArrangeLayout.OursWith(Custom());
        Assert.True(ArrangeChoices.IsAdd(custom, ArrangeKeys.Pt, "냉찜질|온찜질", null));
        Assert.False(ArrangeChoices.IsAdd(custom, ArrangeKeys.Pt, "ICE", null));
        Assert.True(ArrangeChoices.IsAdd(custom, ArrangeKeys.Eswt, "5부위", null));
        Assert.False(ArrangeChoices.IsAdd(custom, ArrangeKeys.Eswt, "2부위", null));
        var members = typeof(ArrangeChoices).GetMembers().Select(m => m.Name).ToArray();
        Assert.DoesNotContain("DetailsOf", members);
        Assert.DoesNotContain("AddOf", members);
    }

    [Theory(DisplayName = "AC-3603.3 add PT·도수·견인·충격파는 넘긴 지금 목록의 글만 받고(204, det = v) 어긋나면 400")]
    [InlineData(ArrangeKeys.Pt, "냉찜질", 204)]
    [InlineData(ArrangeKeys.Pt, "ICE", 400)]
    [InlineData(ArrangeKeys.Ds, "20분", 204)]
    [InlineData(ArrangeKeys.Ds, "30분", 400)]
    [InlineData(ArrangeKeys.Trac, "골반", 204)]
    [InlineData(ArrangeKeys.Trac, "목", 400)]
    [InlineData(ArrangeKeys.Eswt, "5부위", 204)]
    [InlineData(ArrangeKeys.Eswt, "2부위", 400)]
    [InlineData(ArrangeKeys.Eswt, "2000타|1부위", 400)]
    [InlineData(ArrangeKeys.Pt, "온찜질 ", 400)]
    [InlineData(ArrangeKeys.Ds, "냉찜질", 400)]
    public void AddFollowsPassedLists(string col, string v, int status)
    {
        var result = ArrangeWrite.Apply(Op("add", col, v), null, NoCells, Now, picks: Custom());
        Assert.Equal(status, result.Status);
        if (status == 204) Assert.Equal(v, result.Next!.Cells[col].Det);
    }

    [Fact(DisplayName = "AC-3603.3 충격파 add는 부위 수 하나 또는 \"{타수}|{부위 수}\"이고(기본 목록, 이음은 spec reception-other-clinic AC-5703.4), 타수만·차례 바뀜·빈 조각·옛 빈칸 이음은 400")]
    public void EswtAddShapes()
    {
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeKeys.Eswt, "3000타|2부위"), null, NoCells, Now).Status);
        Assert.Equal(204, ArrangeWrite.Apply(Op("add", ArrangeKeys.Eswt, "4부위"), null, NoCells, Now).Status);
        foreach (var bad in new[] { "3000타", "2부위|3000타", "3000타||2부위", "3000타 2부위", "3000타2부위", "5000타|2부위" })
            Assert.Equal(400, ArrangeWrite.Apply(Op("add", ArrangeKeys.Eswt, bad), null, NoCells, Now).Status);
    }

    [Fact(DisplayName = "AC-3603.3 [길] 저장한 목록으로 POST /api/arrange add를 본다: 새 PT 이름 204, 뺀 이름 400")]
    public void RouteAddFollowsSavedLists()
    {
        using var rig = new ArrangeRig(lists: true);
        var key = rig.Key("V1003");
        Assert.Equal(204, rig.Post(Encoding.UTF8.GetBytes(Picks.Body(pt: "[\"냉찜질\"]", trac: "[\"골반\"]")), "/api/lists").Status);

        Assert.Equal(400, rig.Post(ArrangeRouteTests.Body(key, "add", "pt", "ICE")).Status);
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "add", "pt", "냉찜질")).Status);
        Assert.Equal(400, rig.Post(ArrangeRouteTests.Body(key, "add", "trac", "목")).Status);
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "add", "trac", "골반")).Status);
        Assert.Equal("냉찜질", rig.Row("V1003").GetProperty("cells").GetProperty("pt").GetProperty("det").GetString());
    }

    // ---- AC-3603.4 칸 글은 모양만 --------------------------------------------------------------------------

    [Theory(DisplayName = "AC-3603.4 IsDetail: PT·도수·충격파·견인은 \"|\"로 나눈 조각마다 1~21글자·제어 글자 없는 글이거나 빈 글(spec reception-other-clinic AC-5703.5, 목록 소속은 안 봄), 다른 칸은 \"\"만")]
    [InlineData(ArrangeKeys.Pt, "가상환자07", true)]
    [InlineData(ArrangeKeys.Ds, "ICE", true)]
    [InlineData(ArrangeKeys.Eswt, "가나다라마바사아자차 가나다라마바사아자차", true)]
    [InlineData(ArrangeKeys.Trac, "골반", true)]
    [InlineData(ArrangeKeys.Pt, "", true)]
    [InlineData(ArrangeKeys.Eswt, "가나다라마바사아자차 가나다라마바사아자차카", false)]
    [InlineData(ArrangeKeys.Ds, "30|분", true)]
    [InlineData(ArrangeKeys.Ds, "30||분", false)]
    [InlineData(ArrangeKeys.Ds, "|30분", false)]
    [InlineData(ArrangeKeys.Trac, "목\n", false)]
    [InlineData(ArrangeKeys.Pt, "\u0085HP", false)]
    [InlineData(ArrangeKeys.Pt, null, false)]
    [InlineData(ArrangeKeys.Xray, "", true)]
    [InlineData(ArrangeKeys.Xray, "HP", false)]
    [InlineData(ArrangeKeys.Sono, "", true)]
    [InlineData(ArrangeKeys.Carm, "허리", false)]
    public void DetailIsShapeOnly(string col, string? det, bool ok)
    {
        Assert.Equal(ok, ArrangeChoices.IsDetail(col, det));
        // 짝 없는 대리쌍은 속성 글에 넣을 수 없어 여기서 본다
        Assert.False(ArrangeChoices.IsDetail(ArrangeKeys.Pt, "H" + (char)0xD800 + "P"));
    }

    [Fact(DisplayName = "AC-3603.4 목록 밖 칸 글(det \"가상환자07\"·ds에 PT 글·고친 뒤 없어진 이름)도 모양이 맞으면 쓰고 표시 파일에서 그대로 읽힌다")]
    public void OffListDetailsStored()
    {
        var marks = OpenMarks();
        marks.Update("V1", _ => new VisitMark().WithCell(ArrangeKeys.Pt, new CellMark(ArrangeStep.Todo, true, "가상환자07", null, null, null, "10:00")));
        marks.Update("V2", _ => new VisitMark().WithCell(ArrangeKeys.Ds, new CellMark(ArrangeStep.Todo, true, "ICE", null, null, null, "10:00")));
        marks.Update("V3", _ => new VisitMark().WithCell(ArrangeKeys.Eswt, new CellMark(ArrangeStep.Done, true, "7000타 9부위", null, null, "10:20", "10:00")));

        var today = OpenMarks().Today();
        Assert.Equal("가상환자07", today["V1"].Cells[ArrangeKeys.Pt].Det);
        Assert.Equal("ICE", today["V2"].Cells[ArrangeKeys.Ds].Det);
        Assert.Equal("7000타 9부위", today["V3"].Cells[ArrangeKeys.Eswt].Det);
        Assert.Empty(reports);
    }

    public static IEnumerable<object[]> BadDetails() => new[]
    {
        new object[] { "pt 빈 조각", new VisitMark().WithCell(ArrangeKeys.Pt, new CellMark(ArrangeStep.Todo, true, "|HP", null, null, null, "10:00")) },
        new object[] { "ds 22글자", new VisitMark().WithCell(ArrangeKeys.Ds, new CellMark(ArrangeStep.Todo, true, new string('가', 22), null, null, null, "10:00")) },
        new object[] { "trac 17조각", new VisitMark().WithCell(ArrangeKeys.Trac, new CellMark(ArrangeStep.Todo, true, string.Join("|", Enumerable.Repeat("목", 17)), null, null, null, "10:00")) },
        new object[] { "eswt 제어 글자", new VisitMark().WithCell(ArrangeKeys.Eswt, new CellMark(ArrangeStep.Todo, true, "1부위\u0007", null, null, null, "10:00")) },
        new object[] { "xray에 글", new VisitMark().WithCell(ArrangeKeys.Xray, new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "10:00")) },
        new object[] { "sono에 글", new VisitMark().WithCell(ArrangeKeys.Sono, new CellMark(ArrangeStep.Todo, false, "HP", null, null, null, null)) },
    };

    [Theory(DisplayName = "AC-3603.4 모양이 틀린 칸 글은 여전히 쓰지 않는다(ArgumentException, 파일 그대로)")]
    [MemberData(nameof(BadDetails))]
    public void BadDetailsRefused(string why, VisitMark bad)
    {
        var marks = OpenMarks();
        marks.Update("V1001", _ => new VisitMark(away: "10:20"));
        var calls = protector.ProtectCalls;

        Assert.ThrowsAny<ArgumentException>(() => marks.Update("V1001", _ => bad));

        Assert.True(calls == protector.ProtectCalls, why);
        Assert.Equal("10:20", OpenMarks().Today()["V1001"].Away);
    }

    [Fact(DisplayName = "AC-3603.4 목록을 고친 뒤에도 이미 넣은 칸(목록 밖 글)은 step·set·remove로 바뀐다(det 그대로)")]
    public void OffListCellStillChanges()
    {
        var current = new VisitMark().WithCell(ArrangeKeys.Pt, new CellMark(ArrangeStep.Todo, true, "ICE", null, null, null, "09:50"));
        var cells = new Dictionary<string, ArrangeCell> { [ArrangeKeys.Pt] = new ArrangeCell(ArrangeStep.Todo, "ICE", null, "09:50", null, true) };

        var step = ArrangeWrite.Apply(Op("step", ArrangeKeys.Pt), current, cells, Now, picks: Custom());
        Assert.Equal((204, ArrangeStep.Done, "ICE"), (step.Status, step.Next!.Cells[ArrangeKeys.Pt].St, step.Next.Cells[ArrangeKeys.Pt].Det));
        var set = ArrangeWrite.Apply(Op("set", ArrangeKeys.Pt, "todo"), step.Next, cells, Now, picks: Custom());
        Assert.Equal((204, ArrangeStep.Todo, "ICE"), (set.Status, set.Next!.Cells[ArrangeKeys.Pt].St, set.Next.Cells[ArrangeKeys.Pt].Det));
        var removed = ArrangeWrite.Apply(Op("remove", ArrangeKeys.Pt), current, cells, Now, picks: Custom());
        Assert.Equal(204, removed.Status);
        Assert.Null(removed.Next);

        var marks = OpenMarks();
        marks.Update("V1", _ => step.Next);
        Assert.Equal("ICE", OpenMarks().Today()["V1"].Cells[ArrangeKeys.Pt].Det);
    }

    // ---- AC-3603.5 몸 한도 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3603.5 읽기 한도는 8192바이트: 꼭 8192면 읽고, 8193을 넘으면 몸을 읽지 않고 413, 쓰기 검사도 8192까지")]
    public void ReaderLimitIs8192()
    {
        Assert.Equal(8192, HttpRequestReader.MaxBody);
        var body = new string('x', 8192);
        var request = HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes("POST /api/lists HTTP/1.1\r\nHost: a\r\nContent-Length: 8192\r\n\r\n" + body)), TimeSpan.FromSeconds(5));
        Assert.Equal(8192, request!.Body.Length);
        foreach (var length in new[] { "8193", "9999", "99999" })
        {
            var e = Assert.Throws<HttpReadException>(() => HttpRequestReader.Read(new MemoryStream(Encoding.ASCII.GetBytes("POST /api/lists HTTP/1.1\r\nHost: a\r\nContent-Length: " + length + "\r\n\r\n")), TimeSpan.FromSeconds(5)));
            Assert.Equal(413, e.Status);
        }
        var headers = new Dictionary<string, string>
        {
            ["Host"] = "192.168.0.23:47200",
            ["Origin"] = "http://192.168.0.23:47200",
            ["X-Reception"] = "1",
            ["Content-Type"] = "application/json",
        };
        Assert.True(ClientGuard.WriteOk(new HttpRequest("POST", "/api/lists", headers, new byte[8192])));
        Assert.False(ClientGuard.WriteOk(new HttpRequest("POST", "/api/lists", headers, new byte[8193])));
    }

    [Theory(DisplayName = "AC-3603.5 쓰기 검사 전에 /api/lists 8192·/api/xray 256·/api/arrange 1024바이트를 넘으면 413이고, 한도까지는 413이 아니다")]
    [InlineData("/api/lists", 8192)]
    [InlineData("/api/xray", 256)]
    [InlineData("/api/arrange", 1024)]
    public void RouterLimits(string path, int limit)
    {
        using var rig = new ArrangeRig(lists: true);
        var noHeaders = new KeyValuePair<string, string>[0];
        Assert.Equal(413, rig.Send("POST", path, ArrangeRig.WriteHeaders, new byte[limit + 1]).Status);
        Assert.Equal(413, rig.Send("POST", path, noHeaders, new byte[limit + 1]).Status);
        Assert.Equal(403, rig.Send("POST", path, noHeaders, new byte[limit]).Status);
        Assert.Equal(400, rig.Send("POST", path, ArrangeRig.WriteHeaders, Encoding.ASCII.GetBytes(new string(' ', limit))).Status);
        Assert.False(File.Exists(Path.Combine(rig.DataPath, ReceptionLists.FileName)));
    }

    [Fact(DisplayName = "AC-3603.5 규칙이 받는 가장 긴 목록(모든 무리 한도 개수 × 한글 10글자)도 8192바이트 안이라 POST /api/lists가 받는다(204)")]
    public void LongestListsFit()
    {
        // 화면(JSON.stringify)처럼 한글을 그대로(글자당 3바이트) 쓴 몸으로 잰다
        var relaxed = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        IEnumerable<string> Names(char first, int count) =>
            Enumerable.Range(0, count).Select(i => new string(first, 9) + (char)('가' + i));
        string Strings(char first, int count) => "[" + string.Join(",", Names(first, count).Select(n => JsonSerializer.Serialize(n, relaxed))) + "]";
        var procs = "[" + string.Join(",", Names('갑', PickLists.MaxProcs).Select(n => "{\"n\":" + JsonSerializer.Serialize(n, relaxed) + ",\"noDrug\":false}")) + "]";
        var body = Picks.Body(
            procs: procs,
            drugs: Strings('을', PickLists.MaxDrugs),
            parts: Strings('병', PickLists.MaxParts),
            plains: Strings('정', PickLists.MaxPlains),
            withs: Strings('무', PickLists.MaxWiths),
            pt: Strings('기', PickLists.MaxPt),
            ds: Strings('경', PickLists.MaxDs),
            hits: Strings('신', PickLists.MaxEswtHits),
            counts: Strings('임', PickLists.MaxEswtCounts),
            trac: Strings('계', PickLists.MaxTrac));
        var bytes = Encoding.UTF8.GetBytes(body);
        Assert.InRange(bytes.Length, 4097, 8192);

        using var rig = new ArrangeRig(lists: true);
        Assert.Equal(204, rig.Post(bytes, "/api/lists").Status);
        Assert.Equal(PickLists.MaxTrac, rig.Lists!.Current().Trac.Count);
    }
}
