using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.ArrangeFill;
using Precheck.Core.Tests.Reception.ArrangeWriting;
using Precheck.Core.Tests.Reception.Serve;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

// 이 TASK(reception-other-clinic TASK-2)의 새 시험만 한 거르기로 돌리려고 Columns 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Columns;

/// <summary>
/// 시험용 설정 만들기: 우리 의원 처음 값(ReceptionSettings.Ours)의 칸에서 몇 칸만 바꾸거나 더한 문서.
/// 로고·setup·탭은 넘긴 값, picks는 기본 목록 + 넘긴 더한 칸 목록이다.
/// </summary>
internal static class Layouts
{
    private static readonly KeyValuePair<string, IReadOnlyList<string>>[] NoExtra = new KeyValuePair<string, IReadOnlyList<string>>[0];

    /// <summary>칸 하나. xray면 rule(없으면 참), 그 밖은 rule 없음. 더한 칸 표시는 열쇠로 정한다.</summary>
    public static SettingsCol Col(string k, string name, string kind, int steps, bool show = true, bool? rule = null, params string[] codes) =>
        new SettingsCol(k, name, kind, steps, show, SettingsCol.IsAddedKey(k), k == ArrangeKeys.Xray ? rule ?? true : (bool?)null, codes);

    /// <summary>우리 의원 처음 값의 칸(차례 그대로)에서 같은 열쇠 칸을 바꾸고, 없는 열쇠(더한 칸)는 끝에 더한다.</summary>
    public static List<SettingsCol> Ours(params SettingsCol[] changes)
    {
        var cols = ReceptionSettings.Ours(PickLists.Defaults).Cols.ToList();
        foreach (var change in changes)
        {
            var at = cols.FindIndex(col => col.K == change.K);
            if (at >= 0) cols[at] = change;
            else cols.Add(change);
        }
        return cols;
    }

    public static ReceptionSettings Settings(
        IEnumerable<SettingsCol> cols, IEnumerable<KeyValuePair<string, IReadOnlyList<string>>>? extra = null, bool tab = true, bool done = true, LogoSetting? logo = null) =>
        new ReceptionSettings(3, logo ?? new LogoSetting(LogoModes.None, null, 0), tab, new SetupState(done, done, done), 20, cols, PickLists.Defaults.WithExtra(extra ?? NoExtra));

    public static ArrangeLayout Layout(params SettingsCol[] changes) => ArrangeLayout.From(Settings(Ours(changes), ExtraFor(changes)));

    /// <summary>바꾼 칸 가운데 더한 칸마다 목록(이름 목·어깨, x9는 빈 목록).</summary>
    public static IEnumerable<KeyValuePair<string, IReadOnlyList<string>>> ExtraFor(IEnumerable<SettingsCol> cols) =>
        cols.Where(col => col.Added).Select(col => new KeyValuePair<string, IReadOnlyList<string>>(col.K, col.K == "x9" ? new string[0] : new[] { "목", "어깨" }));

    /// <summary>판 picks와 같은 모양(지금 목록 + extra)의 글. 한글은 그대로 쓴다.</summary>
    public static string PicksJson(PickLists lists)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping })) lists.Write(writer, true);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}

/// <summary>
/// 처방 맞춤(ArrangeLayout.RxMatch, spec reception-other-clinic design.md 2절, REQ-5702).
/// AC-5702.1 처방 하나는 보이는 rx 칸 가운데 codes에 그 코드가 있는 칸 모두, xray rule이 참이면 G 촬영 코드도 xray, mn·숨긴 칸은 아님.
/// AC-5702.2 우리 의원 처음 값은 지금 ArrangeMap과 같은 칸. AC-5702.3 같은 칸에 든 처방 여럿은 칸마다 하나, 가장 이른 시각.
/// </summary>
public class ColumnsMatchTests
{
    private const string Day = "20261117";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 17, 11, 0, 0);
    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["QA"] = Lane.Wait };

    [Fact(DisplayName = "AC-5702.1 한 코드가 여러 rx 칸의 codes에 있으면 그 칸 모두에 들고(설정 차례), 코드는 앞뒤 공백을 뺀 대문자로 견준다")]
    public void OneCodeManyColumns()
    {
        var layout = Layouts.Layout(
            Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Rx, 3, codes: new[] { "SONO1", "INJ7" }),
            Layouts.Col(ArrangeKeys.Carm, "C-ARM", ColKinds.Rx, 3, codes: new[] { "INJ7" }),
            Layouts.Col("x1", "주사", ColKinds.Rx, 2, codes: new[] { "INJ7", "ZZ1" }));

        Assert.Equal(new[] { "sono", "carm", "x1" }, layout.RxMatch("INJ7"));
        Assert.Equal(new[] { "sono", "carm", "x1" }, layout.RxMatch("  inj7 "));
        Assert.Equal(new[] { "sono" }, layout.RxMatch("SONO1"));
        Assert.Equal(new[] { "x1" }, layout.RxMatch("zz1"));
        Assert.Empty(layout.RxMatch("CARM1"));
        Assert.Empty(layout.RxMatch(""));
    }

    [Fact(DisplayName = "AC-5702.1 xray가 rx이고 rule이 참이면 ^G[1-8][0-9]{3}([0-9]{3})?$ 코드도 xray에 들고, rule이 거짓이면 codes에 고른 것만 든다")]
    public void XrayRule()
    {
        var on = Layouts.Layout();
        Assert.Equal(new[] { "xray" }, on.RxMatch("G4302"));
        Assert.Equal(new[] { "xray" }, on.RxMatch(" g4902007"));
        Assert.Empty(on.RxMatch("G0101"));
        Assert.Empty(on.RxMatch("G43021"));

        var off = Layouts.Layout(Layouts.Col(ArrangeKeys.Xray, "X-RAY", ColKinds.Rx, 2, rule: false, codes: new[] { "G4302", "XR1" }));
        Assert.Equal(new[] { "xray" }, off.RxMatch("G4302"));
        Assert.Equal(new[] { "xray" }, off.RxMatch("XR1"));
        Assert.Empty(off.RxMatch("G4502"));
    }

    [Fact(DisplayName = "AC-5702.1 mn 칸(codes가 남아 있어도)·숨긴 칸·mn으로 바꾼 xray(rule 참)에는 들지 않는다")]
    public void ManualAndHiddenNeverMatch()
    {
        var layout = Layouts.Layout(
            Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Mn, 3, codes: new[] { "SONO1" }),
            Layouts.Col(ArrangeKeys.Carm, "C-ARM", ColKinds.Rx, 3, show: false, codes: new[] { "CARM1" }),
            Layouts.Col(ArrangeKeys.Xray, "X-RAY", ColKinds.Mn, 2, rule: true),
            Layouts.Col(ArrangeKeys.Pt, "PT", ColKinds.Rx, 2, codes: new[] { "SONO1", "MM015" }));

        Assert.Equal(new[] { "pt" }, layout.RxMatch("SONO1"));
        Assert.Equal(new[] { "pt" }, layout.RxMatch("MM015"));
        Assert.Empty(layout.RxMatch("CARM1"));
        Assert.Empty(layout.RxMatch("G4302"));
    }

    public static TheoryData<string, string?> SampleCodes()
    {
        var data = new TheoryData<string, string?>();
        foreach (var row in ArrangeFillTests.XrayCodes) data.Add((string)row[0], (string)row[1]);
        foreach (var code in new[] { "SONO1", "SONO", "EB422", "EB466", "HA280", "CARM1", "G0400", " sono1 ", "carm1  ", "G7101", "G0101", "G9101", "G43021", "XG4302" })
            data.Add(code, null);
        foreach (var code in new[] { "AA254", "MM015", "ESWT10", "도수", "CRYO", "SONO2", "CARM", "US1", "" }) data.Add(code, "초음파 c-arm");
        return data;
    }

    [Theory(DisplayName = "AC-5702.2 우리 의원 처음 값(ArrangeLayout.Ours)은 지금 ArrangeMap 시험의 코드 예(보고서 G 촬영 코드·SONO1·SONO·EB422·EB466·HA280·CARM1·G0400·그 밖)를 지금 지도와 같은 칸에 넣는다")]
    [MemberData(nameof(SampleCodes))]
    public void OursMatchesArrangeMap(string code, string? name)
    {
        var expected = ArrangeMap.Match(code, name) is string col ? new[] { col } : new string[0];
        Assert.Equal(expected, ArrangeLayout.Ours.RxMatch(code));
    }

    [Fact(DisplayName = "AC-5702.2 우리 의원 처음 값의 SONO·C-ARM 코드는 ArrangeMap이 그 칸에 넣는 코드이고, xray는 rx·rule 참(G0400은 X-RAY가 아니라 C-ARM)이다")]
    public void OursSettingsAgreeWithRules()
    {
        var ours = ReceptionSettings.Ours(PickLists.Defaults);
        var sono = ours.Cols.Single(col => col.K == ArrangeKeys.Sono);
        var carm = ours.Cols.Single(col => col.K == ArrangeKeys.Carm);
        var xray = ours.Cols.Single(col => col.K == ArrangeKeys.Xray);

        Assert.All(sono.Codes, code => Assert.Equal(ArrangeKeys.Sono, ArrangeMap.Match(code, null)));
        Assert.All(carm.Codes, code => Assert.Equal(ArrangeKeys.Carm, ArrangeMap.Match(code, null)));
        Assert.Equal(new[] { "SONO1", "SONO", "EB422", "EB466", "HA280" }, sono.Codes);
        Assert.Equal(new[] { "CARM1", "G0400" }, carm.Codes);
        Assert.Equal((ColKinds.Rx, (bool?)true), (xray.Kind, xray.Rule));
        Assert.Equal(new[] { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" }, ArrangeLayout.Ours.Keys);
        Assert.Equal(new[] { 2, 3, 3, 2, 2, 2, 2 }, ArrangeLayout.Ours.Keys.Select(ArrangeLayout.Ours.StepsOf));
    }

    [Fact(DisplayName = "AC-5702.3 한 내원의 오늘 처방 여럿이 같은 칸에 들면 칸마다 하나이고 시각은 그 칸에 든 처방 가운데 가장 이른 것, 부위는 처음 빈 글 아닌 것이다(칸이 여럿이어도 칸마다)")]
    public void MergedPerColumn()
    {
        var layout = Layouts.Layout(
            Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Rx, 3, codes: new[] { "SONO1", "INJ7" }),
            Layouts.Col(ArrangeKeys.Carm, "C-ARM", ColKinds.Rx, 3, codes: new[] { "CARM1", "INJ7" }));
        var visit = new VisitRow("V1", "90001", Day + "090000", "QA", "N", orders: new[]
        {
            new OrderItem("INJ7", "09:40", "어깨"), new OrderItem("SONO1", "09:35", null), new OrderItem("CARM1", "09:50", "허리"), new OrderItem("INJ7", "09:45", null),
        });
        var keys = new VisitKeys();

        var row = ArrangeBuilder.Build(
            new BoardInput(Day, ReadAt, new[] { visit }, new Dictionary<string, string>()), Statuses, new string[0], layout,
            new Dictionary<string, VisitMark>(), new Dictionary<string, string>(), keys).Rows.Single();

        Assert.Equal(new[] { "carm", "sono" }, row.Cells.Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal(("09:35", "어깨"), (row.Cells["sono"].At, row.Cells["sono"].Part));
        Assert.Equal(("09:40", "어깨"), (row.Cells["carm"].At, row.Cells["carm"].Part));
    }
}

/// <summary>
/// 판의 cfg·칸·picks(Board.ToJson(layout, arrange)·ArrangeBuilder·라우터, design.md 2절, AC-5703.1·5703.2·5703.6).
/// 가짜 상태 표·가짜 내원(V+숫자)·시험용 설정만 쓴다.
/// </summary>
public class ColumnsBoardTests
{
    private const string Day = "20261117";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 17, 11, 0, 0);
    private static readonly IReadOnlyDictionary<string, Lane> Statuses = new Dictionary<string, Lane>(StringComparer.Ordinal) { ["QA"] = Lane.Wait };
    private static readonly IReadOnlyDictionary<string, string> NoXray = new Dictionary<string, string>(StringComparer.Ordinal);

    private readonly VisitKeys keys = new VisitKeys();

    private static VisitRow Visit(string id, string hhmm, params OrderItem[] orders) =>
        new VisitRow(id, "9000" + id.Substring(1), Day + hhmm + "00", "QA", "N", orders: orders);

    private static BoardInput Input(params VisitRow[] visits) => new BoardInput(Day, ReadAt, visits, new Dictionary<string, string>());

    private Arrange Build(ArrangeLayout layout, BoardInput input, Dictionary<string, VisitMark>? marks = null) =>
        ArrangeBuilder.Build(input, Statuses, new string[0], layout, marks ?? new Dictionary<string, VisitMark>(StringComparer.Ordinal), NoXray, keys);

    private JsonElement Json(ArrangeLayout layout, BoardInput input, Arrange? arrange)
    {
        var board = BoardBuilder.Build(input, Statuses, new string[0], NoXray, keys, ReadAt);
        using var document = JsonDocument.Parse(board.ToJson(layout, arrange));
        return document.RootElement.Clone();
    }

    /// <summary>새 병원 처음 값(로고 없이·안내 보임)에 더한 칸 x1(직접 칸, 보임)·x2(처방 칸 3단계, 보임)·x3(숨김)을 더하고 ds를 숨긴 설정.</summary>
    private static ReceptionSettings Wide()
    {
        var cols = ReceptionSettings.Fresh().Cols
            .Select(col => col.K == ArrangeKeys.Ds ? Layouts.Col(col.K, col.Name, col.Kind, col.Steps, show: false) : col)
            .Concat(new[]
            {
                Layouts.Col("x1", "IMS", ColKinds.Mn, 2),
                Layouts.Col("x2", "주사", ColKinds.Rx, 3, codes: new[] { "INJ7" }),
                Layouts.Col("x3", "숨김칸", ColKinds.Mn, 2, show: false),
            })
            .ToList();
        var extra = new[]
        {
            new KeyValuePair<string, IReadOnlyList<string>>("x3", new[] { "가" }),
            new KeyValuePair<string, IReadOnlyList<string>>("x1", new[] { "목", "어깨" }),
            new KeyValuePair<string, IReadOnlyList<string>>("x2", new string[0]),
        };
        return new ReceptionSettings(5, new LogoSetting(LogoModes.Text, "가나다정형외과", 0), true, new SetupState(true, false, false), 4, cols, PickLists.Defaults.WithExtra(extra));
    }

    [Fact(DisplayName = "AC-5703.1 판 맨 위 cfg = { logo: { mode, text, ver }, tab, guide, cols: [{ k, name, kind, steps, added, empty }] }: 보이는 칸만 설정 차례, guide는 setup.done의 반대")]
    public void CfgShape()
    {
        var layout = ArrangeLayout.From(Wide());
        var root = Json(layout, Input(Visit("V1", "0900")), Build(layout, Input(Visit("V1", "0900"))));

        var cfg = root.GetProperty("cfg");
        Assert.Equal(new[] { "logo", "tab", "guide", "cols" }, cfg.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "mode", "text", "ver" }, cfg.GetProperty("logo").EnumerateObject().Select(p => p.Name));
        Assert.Equal(("text", "가나다정형외과", 0), (cfg.GetProperty("logo").GetProperty("mode").GetString(), cfg.GetProperty("logo").GetProperty("text").GetString(), cfg.GetProperty("logo").GetProperty("ver").GetInt32()));
        Assert.True(cfg.GetProperty("tab").GetBoolean());
        Assert.True(cfg.GetProperty("guide").GetBoolean());
        var cols = cfg.GetProperty("cols").EnumerateArray().ToArray();
        Assert.Equal(new[] { "xray", "sono", "carm", "pt", "eswt", "trac", "x1", "x2" }, cols.Select(c => c.GetProperty("k").GetString()));
        Assert.All(cols, c => Assert.Equal(new[] { "k", "name", "kind", "steps", "added", "empty" }, c.EnumerateObject().Select(p => p.Name)));
        var x2 = cols.Single(c => c.GetProperty("k").GetString() == "x2");
        Assert.Equal(("주사", "rx", 3, true, false), (x2.GetProperty("name").GetString(), x2.GetProperty("kind").GetString(), x2.GetProperty("steps").GetInt32(), x2.GetProperty("added").GetBoolean(), x2.GetProperty("empty").GetBoolean()));
        var pt = cols.Single(c => c.GetProperty("k").GetString() == "pt");
        Assert.Equal(("PT", "mn", 2, false, false), (pt.GetProperty("name").GetString(), pt.GetProperty("kind").GetString(), pt.GetProperty("steps").GetInt32(), pt.GetProperty("added").GetBoolean(), pt.GetProperty("empty").GetBoolean()));
    }

    [Fact(DisplayName = "AC-5703.1 empty는 rx 칸인데 codes가 비고 (xray면 rule도 거짓)일 때만 참이다: 새 병원 SONO·C-ARM 참, xray rule 참·mn 칸은 거짓")]
    public void CfgEmpty()
    {
        var fresh = ArrangeLayout.From(ReceptionSettings.Fresh());
        var cfg = Json(fresh, Input(), null).GetProperty("cfg");
        var empty = cfg.GetProperty("cols").EnumerateArray().ToDictionary(c => c.GetProperty("k").GetString()!, c => c.GetProperty("empty").GetBoolean());
        Assert.Equal(new Dictionary<string, bool> { ["xray"] = false, ["sono"] = true, ["carm"] = true, ["pt"] = false, ["ds"] = false, ["eswt"] = false, ["trac"] = false }, empty);
        Assert.Equal(("none", JsonValueKind.Null, 0), (cfg.GetProperty("logo").GetProperty("mode").GetString(), cfg.GetProperty("logo").GetProperty("text").ValueKind, cfg.GetProperty("logo").GetProperty("ver").GetInt32()));
        Assert.True(cfg.GetProperty("guide").GetBoolean());

        var noRule = Layouts.Layout(Layouts.Col(ArrangeKeys.Xray, "X-RAY", ColKinds.Rx, 2, rule: false));
        Assert.True(Json(noRule, Input(), null).GetProperty("cfg").GetProperty("cols")[0].GetProperty("empty").GetBoolean());
        var picked = Layouts.Layout(Layouts.Col(ArrangeKeys.Xray, "X-RAY", ColKinds.Rx, 2, rule: false, codes: new[] { "G4302" }));
        Assert.False(Json(picked, Input(), null).GetProperty("cfg").GetProperty("cols")[0].GetProperty("empty").GetBoolean());

        var ours = Json(ArrangeLayout.Ours, Input(), null).GetProperty("cfg");
        Assert.All(ours.GetProperty("cols").EnumerateArray(), c => Assert.False(c.GetProperty("empty").GetBoolean()));
        Assert.Equal(("pic", 1), (ours.GetProperty("logo").GetProperty("mode").GetString(), ours.GetProperty("logo").GetProperty("ver").GetInt32()));
        Assert.False(ours.GetProperty("guide").GetBoolean());
    }

    [Fact(DisplayName = "AC-5703.1 cfg는 늘 있고(어레인지 없이도) 그 앞은 지금 판(ToJson())과 한 글자도 같으며, tab이 거짓이면 arrange·picks를 쓰지 않는다")]
    public void CfgAlwaysTabGatesArrange()
    {
        var input = Input(Visit("V1", "0900", new OrderItem("SONO1", "09:10", null)));
        var board = BoardBuilder.Build(input, Statuses, new string[0], NoXray, keys, ReadAt);
        var plain = board.ToJson();

        var none = board.ToJson(ArrangeLayout.Ours, null);
        Assert.StartsWith(plain.Substring(0, plain.Length - 1) + ",\"cfg\":{", none, StringComparison.Ordinal);
        using (var document = JsonDocument.Parse(none))
            Assert.Equal(new[] { "state", "at", "every", "counts", "lists", "cfg" }, document.RootElement.EnumerateObject().Select(p => p.Name));

        using (var document = JsonDocument.Parse(board.ToJson(ArrangeLayout.Ours, Build(ArrangeLayout.Ours, input))))
            Assert.Equal(new[] { "state", "at", "every", "counts", "lists", "cfg", "arrange", "picks" }, document.RootElement.EnumerateObject().Select(p => p.Name));

        var off = ArrangeLayout.From(Layouts.Settings(Layouts.Ours(), tab: false));
        using (var document = JsonDocument.Parse(board.ToJson(off, Build(off, input))))
        {
            Assert.Equal(new[] { "state", "at", "every", "counts", "lists", "cfg" }, document.RootElement.EnumerateObject().Select(p => p.Name));
            Assert.False(document.RootElement.GetProperty("cfg").GetProperty("tab").GetBoolean());
        }
    }

    [Fact(DisplayName = "AC-5703.1 [길] 설정을 넘기지 않은 라우터의 GET /api/board에도 cfg(우리 의원 처음 값)가 있고, 넘긴 설정의 tab이 거짓이면 arrange·picks가 없다")]
    public void RouterCfg()
    {
        using var plain = new ServeRig();
        using (var document = JsonDocument.Parse(plain.Get("/api/board").Body))
        {
            var cfg = document.RootElement.GetProperty("cfg");
            Assert.Equal(new[] { "xray", "sono", "carm", "pt", "ds", "eswt", "trac" }, cfg.GetProperty("cols").EnumerateArray().Select(c => c.GetProperty("k").GetString()));
            Assert.False(document.RootElement.TryGetProperty("arrange", out _));
        }

        using var rig = new ArrangeRig(settings: () => Layouts.Settings(Layouts.Ours(), tab: false));
        var board = rig.Board();
        Assert.False(board.GetProperty("cfg").GetProperty("tab").GetBoolean());
        Assert.False(board.TryGetProperty("arrange", out _));
        Assert.False(board.TryGetProperty("picks", out _));
    }

    [Fact(DisplayName = "AC-5703.2 cells 열쇠는 cfg.cols의 k 그대로(더한 칸 포함, 없는 칸은 null)이고 숨긴 칸·설정에 없는 열쇠의 표시는 판에 없다")]
    public void CellKeysFollowCfg()
    {
        var layout = ArrangeLayout.From(Wide());
        var input = Input(Visit("V1", "0900", new OrderItem("INJ7", "09:10", null)));
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
        {
            ["V1"] = new VisitMark()
                .WithCell("x1", new CellMark(ArrangeStep.Todo, true, "목|어깨", null, null, null, "09:20"))
                .WithCell("ds", new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:21"))
                .WithCell("x3", new CellMark(ArrangeStep.Todo, true, "가", null, null, null, "09:22"))
                .WithCell("x7", new CellMark(ArrangeStep.Todo, true, "옛 칸", null, null, null, "09:23")),
        };
        var arrange = Build(layout, input, marks);

        var row = arrange.Rows.Single();
        Assert.Equal(new[] { "x1", "x2" }, row.Cells.Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal(("목|어깨", true), (row.Cells["x1"].Det, row.Cells["x1"].Manual));
        Assert.Equal(("09:10", false), (row.Cells["x2"].At, row.Cells["x2"].Manual));

        var cells = Json(layout, input, arrange).GetProperty("arrange").GetProperty("rows")[0].GetProperty("cells");
        Assert.Equal(new[] { "xray", "sono", "carm", "pt", "eswt", "trac", "x1", "x2" }, cells.EnumerateObject().Select(p => p.Name));
        Assert.Equal(JsonValueKind.Null, cells.GetProperty("pt").ValueKind);
        Assert.Equal("목|어깨", cells.GetProperty("x1").GetProperty("det").GetString());
    }

    [Fact(DisplayName = "AC-5703.2 순서 번호(ord)는 단계 3인 처방 칸(rx)마다 따로(그 칸 처방 시각 순)이고, 단계 2 처방 칸·단계 3 직접 칸에는 없다")]
    public void OrdForThreeStepRx()
    {
        var layout = Layouts.Layout(
            Layouts.Col(ArrangeKeys.Pt, "PT", ColKinds.Rx, 3, codes: new[] { "MM015" }),
            Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Rx, 2, codes: new[] { "SONO1" }),
            Layouts.Col(ArrangeKeys.Ds, "도수", ColKinds.Mn, 3));
        var input = Input(
            Visit("V1", "0900", new OrderItem("MM015", "09:40", null), new OrderItem("SONO1", "09:05", null), new OrderItem("CARM1", "09:30", null)),
            Visit("V2", "0905", new OrderItem("MM015", "09:20", null), new OrderItem("SONO1", "09:06", null)),
            Visit("V3", "0910", new OrderItem("CARM1", "09:10", null)));
        var marks = new Dictionary<string, VisitMark>(StringComparer.Ordinal)
        {
            ["V3"] = new VisitMark().WithCell("ds", new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:15")),
        };
        var arrange = Build(layout, input, marks);
        int? Ord(string visit, string col) => arrange.Rows.Single(r => r.Key == keys.KeyOf(Day, visit)).Cells.TryGetValue(col, out var cell) ? cell.Ord : null;

        Assert.Equal(((int?)2, (int?)1), (Ord("V1", "pt"), Ord("V2", "pt")));
        Assert.Equal(((int?)2, (int?)1), (Ord("V1", "carm"), Ord("V3", "carm")));
        Assert.Equal(((int?)null, (int?)null), (Ord("V1", "sono"), Ord("V2", "sono")));
        Assert.Null(Ord("V3", "ds"));
    }

    [Fact(DisplayName = "AC-5703.2 단계 3 칸은 todo → ready → done, 단계 2 칸은 todo → done이다(처방 칸으로 바꾼 PT·3단계 직접 칸·2단계 SONO)")]
    public void StepsFollowSettings()
    {
        var layout = Layouts.Layout(
            Layouts.Col(ArrangeKeys.Pt, "PT", ColKinds.Rx, 3, codes: new[] { "MM015" }),
            Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Rx, 2, codes: new[] { "SONO1" }),
            Layouts.Col(ArrangeKeys.Ds, "도수", ColKinds.Mn, 3));
        ArrangeWriteResult Step(string col, ArrangeCell cell, VisitMark? mark = null) =>
            ArrangeWrite.Apply(new ArrangeOp("0123456789abcdef", "step", col, null), mark, new Dictionary<string, ArrangeCell> { [col] = cell }, "10:30", layout: layout);

        var pt = Step("pt", new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", 1, false));
        Assert.Equal((ArrangeStep.Ready, "10:30", ""), (pt.Next!.Cells["pt"].St, pt.Next.Cells["pt"].ReadyAt, pt.Next.Cells["pt"].Det));
        var ds = Step("ds", new ArrangeCell(ArrangeStep.Todo, "30분", null, "09:30", null, true), new VisitMark().WithCell("ds", new CellMark(ArrangeStep.Todo, true, "30분", null, null, null, "09:30")));
        Assert.Equal((ArrangeStep.Ready, "30분"), (ds.Next!.Cells["ds"].St, ds.Next.Cells["ds"].Det));
        var sono = Step("sono", new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", null, false));
        Assert.Equal(ArrangeStep.Done, sono.Next!.Cells["sono"].St);
    }

    [Fact(DisplayName = "AC-5703.2 우리 의원 처음 값에서는 sono·carm만 단계 3 처방 칸이라 ord도 그 둘뿐이다(지금과 같음)")]
    public void OursOrdOnlySonoCarm()
    {
        var input = Input(Visit("V1", "0900", new OrderItem("SONO1", "09:10", null), new OrderItem("CARM1", "09:11", null), new OrderItem("G4302", "09:12", null)));
        var row = Build(ArrangeLayout.Ours, input).Rows.Single();
        Assert.Equal(((int?)1, (int?)1, (int?)null), (row.Cells["sono"].Ord, row.Cells["carm"].Ord, row.Cells["xray"].Ord));
    }

    [Fact(DisplayName = "AC-5703.6 판 picks는 지금 모양(carm·sono·pt·ds·eswt·trac) 뒤에 extra(보이는 더한 칸만, 설정 차례)가 더해진다")]
    public void PicksCarryVisibleExtra()
    {
        var layout = ArrangeLayout.From(Wide());
        var input = Input(Visit("V1", "0900"));
        var picks = Json(layout, input, Build(layout, input)).GetProperty("picks");

        Assert.Equal(new[] { "carm", "sono", "pt", "ds", "eswt", "trac", "extra" }, picks.EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "x1", "x2" }, picks.GetProperty("extra").EnumerateObject().Select(p => p.Name));
        Assert.Equal(new[] { "목", "어깨" }, picks.GetProperty("extra").GetProperty("x1").EnumerateArray().Select(e => e.GetString()));
        Assert.Empty(picks.GetProperty("extra").GetProperty("x2").EnumerateArray());

        var ours = Json(ArrangeLayout.Ours, input, Build(ArrangeLayout.Ours, input)).GetProperty("picks");
        Assert.Equal(Layouts.PicksJson(PickLists.Defaults), ours.GetRawText());
        Assert.Equal(JsonValueKind.Object, ours.GetProperty("extra").ValueKind);
        Assert.Empty(ours.GetProperty("extra").EnumerateObject());
    }
}

/// <summary>
/// 쓰기(ArrangeWrite.Apply(..., layout)·POST /api/arrange, design.md 2절 표, AC-5703.3·AC-5703.4).
/// </summary>
public class ColumnsWriteTests
{
    private const string Now = "10:30";
    private const string Key = "0123456789abcdef";
    private static readonly IReadOnlyDictionary<string, ArrangeCell> NoCells = new Dictionary<string, ArrangeCell>();

    private static ArrangeOp Op(string op, string? col, string? v, string? t = null) => new ArrangeOp(Key, op, col, v, t);

    private static ArrangeWriteResult Add(string col, string v, string? t = null, ArrangeLayout? layout = null) =>
        ArrangeWrite.Apply(Op("add", col, v, t), null, NoCells, Now, layout: layout);

    [Fact(DisplayName = "AC-5703.3 col이 보이는 칸 열쇠가 아니면(숨긴 칸·설정에 없는 더한 칸) 400이고 표시를 바꾸지 않는다")]
    public void HiddenOrMissingColumnRefused()
    {
        var layout = Layouts.Layout(Layouts.Col(ArrangeKeys.Ds, "도수", ColKinds.Mn, 2, show: false), Layouts.Col("x1", "IMS", ColKinds.Mn, 2));
        var dsCell = new Dictionary<string, ArrangeCell> { ["ds"] = new ArrangeCell(ArrangeStep.Todo, "30분", null, "09:30", null, true) };

        Assert.Equal(400, Add("ds", "30분", layout: layout).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("step", "ds", null), null, dsCell, Now, layout: layout).Status);
        Assert.Equal(400, Add("x2", "목", layout: layout).Status);
        Assert.False(Add("x2", "목", layout: layout).ChangesMarks);
        Assert.Equal(204, Add("x1", "목", layout: layout).Status);
        Assert.Equal(400, Add("x1", "목").Status);
    }

    [Fact(DisplayName = "AC-5703.3 단계 2 칸에 set v=ready는 400, 단계 3 칸(처방 칸으로 바꾼 PT·직접 칸)은 받는다")]
    public void ReadyOnlyForThreeSteps()
    {
        var three = Layouts.Layout(Layouts.Col(ArrangeKeys.Pt, "PT", ColKinds.Mn, 3), Layouts.Col(ArrangeKeys.Sono, "SONO", ColKinds.Rx, 2, codes: new[] { "SONO1" }));
        var cells = new Dictionary<string, ArrangeCell>
        {
            ["pt"] = new ArrangeCell(ArrangeStep.Todo, "HP", null, "09:30", null, true),
            ["sono"] = new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", null, false),
        };
        var mark = new VisitMark().WithCell("pt", new CellMark(ArrangeStep.Todo, true, "HP", null, null, null, "09:30"));

        var pt = ArrangeWrite.Apply(Op("set", "pt", "ready"), mark, cells, Now, layout: three);
        Assert.Equal((204, ArrangeStep.Ready, "10:30"), (pt.Status, pt.Next!.Cells["pt"].St, pt.Next.Cells["pt"].ReadyAt));
        Assert.Equal(400, ArrangeWrite.Apply(Op("set", "sono", "ready"), null, cells, Now, layout: three).Status);
        Assert.Equal(400, ArrangeWrite.Apply(Op("set", "pt", "ready"), mark, cells, Now).Status);
    }

    [Fact(DisplayName = "AC-5703.3 단계 3 X-RAY: 준비완료는 어레인지 표시(완료에서 오면 X-ray 완료 끔), 완료는 X-ray 완료 표시, 준비로 돌아가면 준비완료 표시도 지운다")]
    public void ThreeStepXray()
    {
        var layout = Layouts.Layout(Layouts.Col(ArrangeKeys.Xray, "X-RAY", ColKinds.Rx, 3, rule: true));
        IReadOnlyDictionary<string, ArrangeCell> Cell(ArrangeStep st) => new Dictionary<string, ArrangeCell> { ["xray"] = new ArrangeCell(st, "", null, "09:30", 1, false) };

        var ready = ArrangeWrite.Apply(Op("step", "xray", null), null, Cell(ArrangeStep.Todo), Now, layout: layout);
        Assert.Equal((204, true, (bool?)null, ArrangeStep.Ready, "10:30"), (ready.Status, ready.ChangesMarks, ready.Xray, ready.Next!.Cells["xray"].St, ready.Next.Cells["xray"].ReadyAt));
        var done = ArrangeWrite.Apply(Op("step", "xray", null), ready.Next, Cell(ArrangeStep.Ready), Now, layout: layout);
        Assert.Equal((204, false, (bool?)true), (done.Status, done.ChangesMarks, done.Xray));
        var again = ArrangeWrite.Apply(Op("set", "xray", "ready"), ready.Next, Cell(ArrangeStep.Done), Now, layout: layout);
        Assert.Equal((204, (bool?)false, ArrangeStep.Ready), (again.Status, again.Xray, again.Next!.Cells["xray"].St));
        var back = ArrangeWrite.Apply(Op("set", "xray", "todo"), ready.Next, Cell(ArrangeStep.Done), Now, layout: layout);
        Assert.Equal((204, (bool?)false, ArrangeStep.Todo, (string?)null), (back.Status, back.Xray, back.Next!.Cells["xray"].St, back.Next.Cells["xray"].ReadyAt));

        // 단계 2 X-RAY는 지금 그대로: 완료·되돌리기는 X-ray 완료 표시만(어레인지 표시 없음)
        var two = ArrangeWrite.Apply(Op("set", "xray", "todo"), null, Cell(ArrangeStep.Done), Now);
        Assert.Equal((204, false, (bool?)false), (two.Status, two.ChangesMarks, two.Xray));
    }

    [Fact(DisplayName = "AC-5703.3 [길] 숨긴 칸에 POST /api/arrange add는 400이고, 보이는 더한 칸 add는 204로 판의 그 칸에 보인다")]
    public void RouteRefusesHiddenColumn()
    {
        var settings = Layouts.Settings(
            Layouts.Ours(Layouts.Col(ArrangeKeys.Ds, "도수", ColKinds.Mn, 2, show: false), Layouts.Col("x1", "IMS", ColKinds.Mn, 2)),
            Layouts.ExtraFor(new[] { Layouts.Col("x1", "IMS", ColKinds.Mn, 2) }));
        using var rig = new ArrangeRig(settings: () => settings);
        var key = rig.Key("V1003");

        Assert.Equal(400, rig.Post(ArrangeRouteTests.Body(key, "add", "ds", "30분")).Status);
        Assert.Equal(400, rig.Post(ArrangeRouteTests.Body(key, "add", "x2", "목")).Status);
        Assert.Empty(rig.ArrangeMarks.Today());
        Assert.Equal(204, rig.Post(ArrangeRouteTests.Body(key, "add", "x1", "목|어깨")).Status);
        Assert.Equal("목|어깨", rig.Row("V1003").GetProperty("cells").GetProperty("x1").GetProperty("det").GetString());
    }

    [Theory(DisplayName = "AC-5703.4 pt·ds·trac add: v는 목록 이름 1~8개를 \"|\"로 이은 것(겹침 없음, 목록 차례)이고 det = v, 어긋나면 400")]
    [InlineData("pt", "ICE", 204)]
    [InlineData("pt", "ICE|HP", 204)]
    [InlineData("pt", "HP|ICE", 400)]
    [InlineData("pt", "ICE|ICE", 400)]
    [InlineData("pt", "ICE|", 400)]
    [InlineData("pt", "", 400)]
    [InlineData("ds", "30분|50분", 204)]
    [InlineData("trac", "목|허리", 204)]
    [InlineData("trac", "허리|목", 400)]
    [InlineData("trac", "목|도수", 400)]
    public void ListAdds(string col, string v, int status)
    {
        var result = Add(col, v);
        Assert.Equal(status, result.Status);
        if (status == 204) Assert.Equal((v, true, (string?)null), (result.Next!.Cells[col].Det, result.Next.Cells[col].Manual, result.Next.Cells[col].Part));
    }

    [Fact(DisplayName = "AC-5703.4 더한 칸 add: 목록 이름 1~8개 \"|\"(목록 차례), 목록이 빈 더한 칸은 v \"\"만 받는다(칸 글 없이 준비)")]
    public void AddedColumnAdds()
    {
        var layout = Layouts.Layout(Layouts.Col("x1", "IMS", ColKinds.Mn, 2), Layouts.Col("x9", "빈칸", ColKinds.Mn, 2));

        Assert.Equal("목|어깨", Add("x1", "목|어깨", layout: layout).Next!.Cells["x1"].Det);
        Assert.Equal("어깨", Add("x1", "어깨", layout: layout).Next!.Cells["x1"].Det);
        Assert.Equal(400, Add("x1", "어깨|목", layout: layout).Status);
        Assert.Equal(400, Add("x1", "", layout: layout).Status);
        Assert.Equal(400, Add("x1", "ICE", layout: layout).Status);
        var empty = Add("x9", "", layout: layout);
        Assert.Equal((204, "", ArrangeStep.Todo), (empty.Status, empty.Next!.Cells["x9"].Det, empty.Next.Cells["x9"].St));
        Assert.Equal(400, Add("x9", "목", layout: layout).Status);
        Assert.Equal(400, Add("x1", "목", "DNA", layout).Status);
    }

    [Theory(DisplayName = "AC-5703.4 eswt add: 타수 0개 이상 + 부위 수 1개 이상을 \"|\"로 이은 것(타수 먼저, 각각 목록 차례), 어긋나면 400")]
    [InlineData("2부위", 204)]
    [InlineData("3000타|2부위", 204)]
    [InlineData("2000타|3000타|1부위|2부위", 204)]
    [InlineData("1부위|2부위|3부위|4부위", 204)]
    [InlineData("3000타", 400)]
    [InlineData("2부위|3000타", 400)]
    [InlineData("3000타|2000타|1부위", 400)]
    [InlineData("3000타|2부위|1부위", 400)]
    [InlineData("3000타 2부위", 400)]
    [InlineData("3000타||2부위", 400)]
    [InlineData("5000타|2부위", 400)]
    public void EswtAdds(string v, int status)
    {
        var result = Add(ArrangeKeys.Eswt, v);
        Assert.Equal(status, result.Status);
        if (status == 204) Assert.Equal(v, result.Next!.Cells["eswt"].Det);
    }

    [Theory(DisplayName = "AC-5703.4 carm add·part: v는 시술 1개 이상 \"|\"(목록 차례, 겹침 없음), t는 약재 0개 이상(목록 차례), 고른 시술이 모두 약재 없음이면 t 없음")]
    [InlineData("목|허리", null, 204)]
    [InlineData("목|등|허리|리덕션", "TP|하프|기본", 204)]
    [InlineData("허리", "TP|기본", 204)]
    [InlineData("목|리덕션", "TP", 204)]
    [InlineData("리덕션", null, 204)]
    [InlineData("허리|목", null, 400)]
    [InlineData("목|목", null, 400)]
    [InlineData("허리", "기본|TP", 400)]
    [InlineData("허리", "TP|TP", 400)]
    [InlineData("리덕션", "TP", 400)]
    [InlineData("목|어깨", null, 400)]
    [InlineData("", null, 400)]
    [InlineData("허리|부위는 나중에", null, 400)]
    public void CarmAdds(string v, string? t, int status)
    {
        var result = Add(ArrangeKeys.Carm, v, t);
        Assert.Equal(status, result.Status);
        if (status != 204) return;
        var cell = result.Next!.Cells["carm"];
        Assert.Equal((v, ""), (cell.Part, cell.Det));
        Assert.Equal(PickLists.TagsOf(t), cell.Tags);

        var parted = ArrangeWrite.Apply(Op("part", "carm", v, t), null, new Dictionary<string, ArrangeCell> { ["carm"] = new ArrangeCell(ArrangeStep.Todo, "", null, "09:30", 1, false) }, Now);
        Assert.Equal((204, v), (parted.Status, parted.Next!.Cells["carm"].Part));
    }

    [Fact(DisplayName = "AC-5703.4 sono는 지금 규칙(1~6줄 + 같이 하는 것), xray는 \"X-ray 찍기\"만이고 특별한 모양은 열쇠를 따른다(종류를 mn으로 바꿔도 같음)")]
    public void SpecialShapesFollowKeys()
    {
        var mn = Layouts.Layout(Layouts.Col(ArrangeKeys.Sono, "초음파", ColKinds.Mn, 3), Layouts.Col(ArrangeKeys.Xray, "엑스레이", ColKinds.Mn, 2));
        foreach (var layout in new[] { ArrangeLayout.Ours, mn })
        {
            Assert.Equal("오른 어깨|소독", Add("sono", "오른 어깨|소독", "DNA", layout).Next!.Cells["sono"].Part);
            Assert.Equal(400, Add("sono", "1|2|3|4|5|6|7", null, layout).Status);
            Assert.Equal(400, Add("sono", "어깨|어깨", null, layout).Status);
            var xray = Add("xray", "X-ray 찍기", null, layout);
            Assert.Equal(("", true), (xray.Next!.Cells["xray"].Det, xray.Next.Cells["xray"].Manual));
            Assert.Equal(400, Add("xray", "X-ray 찍기|X-ray 찍기", null, layout).Status);
            Assert.Equal(400, Add("pt", "HP", "DNA", layout).Status);
        }
    }

    [Fact(DisplayName = "AC-5703.4 가장 긴 C-ARM 넣기(시술 12 × 10글자 + 약재 12 × 10글자, 한글 3바이트)도 /api/arrange 1024바이트 안이다")]
    public void LongestCarmFits()
    {
        var procs = Enumerable.Range(0, PickLists.MaxProcs).Select(i => new PickProc("가나다라마바사아자" + (char)('가' + i), false)).ToArray();
        var drugs = Enumerable.Range(0, PickLists.MaxDrugs).Select(i => "하하하하하하하하하" + (char)('나' + i)).ToArray();
        var lists = new PickLists(procs, drugs, new[] { "어깨" }, new string[0], new string[0]);
        var v = string.Join("|", procs.Select(p => p.N));
        var t = string.Join("|", drugs);
        var relaxed = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var body = Encoding.UTF8.GetBytes("{\"k\":\"" + Key + "\",\"op\":\"add\",\"col\":\"carm\",\"v\":" + JsonSerializer.Serialize(v, relaxed) + ",\"t\":" + JsonSerializer.Serialize(t, relaxed) + "}");

        Assert.InRange(body.Length, 700, 1024);
        Assert.True(ArrangeWrite.TryParse(body, out var op));
        Assert.Equal(204, ArrangeWrite.Apply(op, null, NoCells, Now, picks: lists).Status);
    }
}

/// <summary>
/// 칸 표시 파일의 열쇠·칸 글·C-ARM 줄(ArrangeMarks·ArrangeChoices, AC-5703.5). 가짜 암호화(XorProtector)·임시 폴더·주입한 시계만 쓴다.
/// </summary>
public class ColumnsMarksTests : IDisposable
{
    private static readonly DateTime Morning = new DateTime(2026, 11, 17, 10, 20, 31);

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-columns-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, ArrangeMarks.FileName);

    private ArrangeMarks Open() => new ArrangeMarks(new StoreFolder(folder), protector, () => Morning, code => { lock (reports) reports.Add(code); });

    private void WritePlain(string json)
    {
        var data = File.ReadAllBytes(FilePath);
        var cipher = protector.LastCipher!;
        var prefix = data.Take(data.Length - cipher.Length).ToArray();
        File.WriteAllBytes(FilePath, prefix.Concat(protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray());
    }

    private static string CellsJson(string cells) =>
        "{\"day\":\"20261117\",\"visits\":{\"V1\":{\"cells\":{" + cells + "},\"away\":null,\"ptf\":null,\"endedAt\":null}}}";

    private static string Cell(string key, string det = "", string part = "null") =>
        "\"" + key + "\":{\"st\":\"todo\",\"manual\":true,\"det\":\"" + det + "\",\"part\":" + part + ",\"readyAt\":null,\"doneAt\":null,\"addedAt\":\"10:00\"}";

    [Fact(DisplayName = "AC-5703.5 칸 열쇠가 ^[a-z][a-z0-9]{0,7}$면 읽고(더한 칸·모르는 열쇠), 모르는 열쇠는 파일에 그대로 두고 판에는 쓰지 않는다")]
    public void UnknownKeysKept()
    {
        Open().Update("V2", _ => new VisitMark(away: "10:00"));
        WritePlain("{\"day\":\"20261117\",\"visits\":{\"V1\":{\"cells\":{" + Cell("x1", "목") + "," + Cell("bed", "가") + "," + Cell("abc12345", "나") + "},\"away\":null,\"ptf\":null,\"endedAt\":null}}}");

        var marks = Open();
        Assert.Equal(new[] { "abc12345", "bed", "x1" }, marks.Today()["V1"].Cells.Keys.OrderBy(k => k, StringComparer.Ordinal));
        marks.Update("V1", mark => mark!.WithAway("10:10"));
        Assert.Empty(reports);

        using (var document = JsonDocument.Parse(protector.LastPlain!))
            Assert.Equal(new[] { "x1", "abc12345", "bed" }, document.RootElement.GetProperty("visits").GetProperty("V1").GetProperty("cells").EnumerateObject().Select(p => p.Name));
        var reopened = Open().Today()["V1"];
        Assert.Equal(("가", "10:10"), (reopened.Cells["bed"].Det, reopened.Away));

        var keys = new VisitKeys();
        var visit = new VisitRow("V1", "90001", "20261117090000", "QA", "N");
        var row = ArrangeBuilder.Build(
            new BoardInput("20261117", Morning, new[] { visit }, new Dictionary<string, string>()),
            new Dictionary<string, Lane> { ["QA"] = Lane.Wait }, new string[0], ArrangeLayout.Ours, Open().Today(), new Dictionary<string, string>(), keys).Rows.Single();
        Assert.Empty(row.Cells);
    }

    [Theory(DisplayName = "AC-5703.5 칸 열쇠 모양이 틀리면(대문자·숫자로 시작·9글자·빈 글·밑줄) 깨진 파일이다(빈 표시 + E-STORE-BROKEN)")]
    [InlineData("Bed")]
    [InlineData("1x")]
    [InlineData("abcdefghi")]
    [InlineData("")]
    [InlineData("x_1")]
    public void BadKeysBroken(string key)
    {
        Open().Update("V2", _ => new VisitMark(away: "10:00"));
        WritePlain(CellsJson(Cell(key, "목")));

        Assert.Empty(Open().Today());
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports);
    }

    [Theory(DisplayName = "AC-5703.5 칸 글(det)은 \"|\"로 나눈 1~16조각 × 1~21글자·제어 글자 없음이면 받고(옛 \"3000타 2부위\"·빈 글도), 어긋나면 쓰지 않는다")]
    [InlineData("pt", "ICE|HP", true)]
    [InlineData("eswt", "3000타 2부위", true)]
    [InlineData("eswt", "2000타|3000타|4000타|6000타|1부위|2부위|3부위|4부위", true)]
    [InlineData("x1", "가|나|다|라|마|바|사|아|자|차|카|타|파|하|거|너", true)]
    [InlineData("x1", "가|나|다|라|마|바|사|아|자|차|카|타|파|하|거|너|더", false)]
    [InlineData("pt", "", true)]
    [InlineData("x3", "", true)]
    [InlineData("ds", "가나다라마바사아자차카타파하가나다라마바사|목", true)]
    [InlineData("ds", "가나다라마바사아자차카타파하가나다라마바사아|목", false)]
    [InlineData("trac", "목||허리", false)]
    [InlineData("trac", "목|", false)]
    [InlineData("pt", "I\u0007CE", false)]
    [InlineData("xray", "HP", false)]
    [InlineData("sono", "목|허리", false)]
    [InlineData("carm", "허리", false)]
    public void DetailPieces(string col, string det, bool ok)
    {
        Assert.Equal(ok, ArrangeChoices.IsDetail(col, det));
        var marks = Open();
        var mark = new VisitMark().WithCell(col, new CellMark(ArrangeStep.Todo, true, det, null, null, null, "10:00"));
        if (ok)
        {
            marks.Update("V1", _ => mark);
            Assert.Equal(det, Open().Today()["V1"].Cells[col].Det);
        }
        else
        {
            Assert.ThrowsAny<ArgumentException>(() => marks.Update("V1", _ => mark));
        }
    }

    [Fact(DisplayName = "AC-5703.5 C-ARM part는 1~12줄(줄마다 시술 이름), SONO part는 지금처럼 1~6줄이다")]
    public void CarmPartLines()
    {
        var twelve = string.Join("|", Enumerable.Range(1, 12).Select(i => "시술" + i));
        var thirteen = twelve + "|시술13";
        Assert.True(ArrangeChoices.IsPart("carm", twelve));
        Assert.False(ArrangeChoices.IsPart("carm", thirteen));
        Assert.True(ArrangeChoices.IsPart("sono", "1|2|3|4|5|6"));
        Assert.False(ArrangeChoices.IsPart("sono", "1|2|3|4|5|6|7"));
        Assert.False(ArrangeChoices.IsPart("x1", "목"));

        Open().Update("V1", _ => new VisitMark().WithCell("carm", new CellMark(ArrangeStep.Todo, true, "", twelve, null, null, "10:00", new[] { "TP", "하프" })));
        Assert.Equal(twelve, Open().Today()["V1"].Cells["carm"].Part);
        Assert.ThrowsAny<ArgumentException>(() => Open().Update("V2", _ => new VisitMark().WithCell("carm", new CellMark(ArrangeStep.Todo, true, "", thirteen, null, null, "10:00"))));
    }
}
