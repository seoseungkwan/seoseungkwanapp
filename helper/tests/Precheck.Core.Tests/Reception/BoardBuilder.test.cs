using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 BoardRows 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.BoardRows;

/// <summary>
/// 줄 만들기(BoardBuilder·Board, design.md 4절, REQ-1402). 가짜 지도·가짜 줄만 쓴다(진짜 지도는 Phase 5까지 비어 있다).
/// AC-1402.1 칸 나누기·숨긴 줄 건수. AC-1402.2 순서·순서 번호·건수. AC-1402.3 기다린 글. AC-1402.4 오래 기다림.
/// AC-1402.5 정보 글(만 나이·성별·신환/재진). AC-1402.6 처방 글. AC-1402.7 빈 칸. AC-1402.8 엑스레이 칸.
/// AC-1402.9 화면용 열쇠·원값 없음·JSON 모양.
/// 이름은 '가상환자NN', 차트번호는 9로 시작하는 6자리, 내원번호는 V+숫자, 상태 코드는 지어낸 것(QA…)이다.
/// </summary>
public class BoardBuilderTests
{
    private const string Day = "20261105";
    private static readonly DateTime ReadAt = new DateTime(2026, 11, 5, 13, 42, 10);
    private static readonly Regex KeyShape = new Regex("^[0-9a-f]{16}$");

    // 가짜 지도: 진짜 비트 코드가 아니다
    private static readonly IReadOnlyDictionary<string, Lane> FakeMap = new Dictionary<string, Lane>(StringComparer.Ordinal)
    {
        ["QA"] = Lane.Wait,
        ["QB"] = Lane.Hold,
        ["QC"] = Lane.Pay,
        ["QD"] = Lane.Done,
        ["QX"] = Lane.Hidden,
    };

    private static readonly ISet<string> FakeHiddenRsu = new HashSet<string>(StringComparer.Ordinal) { "Z9" };

    private static readonly IReadOnlyDictionary<string, string> Names = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["ESWT7"] = "체외충격파",
        ["DS20"] = "도수치료 20분",
        ["PT01"] = "표층열치료",
        ["PT03"] = "간섭파치료",
        ["XR2"] = "엑스레이 촬영",
        ["INJ1"] = "주사",
    };

    private static IReadOnlyList<RxItem> Rx(params string[] codes) => RxItem.Of(codes, Names);

    private static DateTime At(int hour, int minute, int second = 0) => new DateTime(2026, 11, 5, hour, minute, second);

    /// <summary>오늘 hh:mm에 접수한 줄(원값 yyyyMMddHHmmss).</summary>
    private static VisitRow Visit(
        string id,
        string? status,
        string hhmm,
        string chart,
        string? rsu = "R4",
        IReadOnlyList<RxItem>? todayRx = null,
        long earlier = 0,
        string? lastId = null,
        string? lastDay = null,
        IReadOnlyList<RxItem>? lastRx = null,
        string? name = null,
        string? birth = null,
        string? sex = null,
        string? memo = null,
        string? paidAt = null,
        string? acceptedAt = null)
        => new VisitRow(id, chart, acceptedAt ?? Day + hhmm + "00", status, rsu, todayRx, earlier, lastId, lastDay, lastRx, name, birth, sex, memo, paidAt);

    /// <summary>한 번 만들기에 쓰는 것들. 기본: 가짜 지도, 오늘, 읽은 때 + 5초.</summary>
    private sealed class Scene
    {
        public List<VisitRow> Visits { get; } = new List<VisitRow>();
        public Dictionary<string, string> Marks { get; } = new Dictionary<string, string>(StringComparer.Ordinal);
        public VisitKeys Keys { get; set; } = new VisitKeys();
        public string Day { get; set; } = BoardBuilderTests.Day;
        public DateTime Now { get; set; } = ReadAt.AddSeconds(5);
        public IReadOnlyDictionary<string, Lane> Map { get; set; } = FakeMap;

        public Scene Add(params VisitRow[] rows)
        {
            Visits.AddRange(rows);
            return this;
        }

        public Board Board() => BoardBuilder.Build(new BoardInput(Day, ReadAt, Visits.ToArray(), Names), Map, FakeHiddenRsu, Marks, Keys, Now);

        public string Text() => Board().ToJson();

        public JsonElement Json()
        {
            using var document = JsonDocument.Parse(Text());
            return document.RootElement.Clone();
        }
    }

    // ---- JSON 읽기 도우미 ------------------------------------------------------------------------------

    private static JsonElement[] List(JsonElement board, string lane) =>
        board.GetProperty("lists").GetProperty(lane).EnumerateArray().ToArray();

    private static string[] Charts(JsonElement board, string lane) =>
        List(board, lane).Select(row => row.GetProperty("chart").GetString()!).ToArray();

    private static string[] Texts(JsonElement board, string lane, string field) =>
        List(board, lane).Select(row => row.GetProperty(field).GetString()!).ToArray();

    private static JsonElement Row(JsonElement board, string lane, string chart) =>
        List(board, lane).Single(row => row.GetProperty("chart").GetString() == chart);

    private static int Count(JsonElement board, string lane) => board.GetProperty("counts").GetProperty(lane).GetInt32();

    private static string Text(JsonElement row, string field) => row.GetProperty(field).GetString()!;

    /// <summary>줄 하나만 넣고 만든 그 칸의 줄.</summary>
    private static JsonElement One(VisitRow visit, string lane, DateTime? now = null, IDictionary<string, string>? marks = null)
    {
        var scene = new Scene().Add(visit);
        if (now != null) scene.Now = now.Value;
        if (marks != null) foreach (var mark in marks) scene.Marks[mark.Key] = mark.Value;
        return List(scene.Json(), lane).Single();
    }

    // ---- AC-1402.1 칸 나누기 ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.1 표에 있는 코드만 네 칸으로 가고, 표에 없는 코드·숨김 코드·숨기는 OcmRsuYon 줄은 어느 칸에도 없이 건수만 센다")]
    public void LanesFollowMapAndHiddenAreOnlyCounted()
    {
        var scene = new Scene().Add(
            Visit("V101", "QA", "0900", "900001"),
            Visit("V102", "QB", "0901", "900002"),
            Visit("V103", "QC", "0902", "900003"),
            Visit("V104", "QD", "0903", "900004"),
            Visit("V105", "ZZ", "0904", "900005", name: "가상환자05"),
            Visit("V106", "QX", "0905", "900006", name: "가상환자06"),
            Visit("V107", "QA", "0906", "900007", rsu: "Z9", name: "가상환자07"),
            Visit("V108", null, "0907", "900008", name: "가상환자08"),
            Visit("V109", " QC ", "0908", "900009"));
        var board = scene.Board();
        var json = board.ToJson();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        Assert.Equal(new[] { "900001" }, Charts(root, "wait"));
        Assert.Equal(new[] { "900002" }, Charts(root, "hold"));
        Assert.Equal(new[] { "900003", "900009" }, Charts(root, "pay"));
        Assert.Equal(new[] { "900004" }, Charts(root, "done"));
        Assert.Equal(new[] { "900001", "900002" }, Charts(root, "queue"));
        Assert.Equal(4, board.HiddenCount);
        foreach (var leaked in new[] { "900005", "900006", "900007", "900008", "가상환자05", "가상환자06", "가상환자07", "가상환자08" })
            Assert.DoesNotContain(leaked, json);
    }

    [Fact(DisplayName = "AC-1402.1 지금처럼 빈 상태 표면 목록이 모두 비고 모든 줄이 숨김으로 세어진다")]
    public void EmptyMapShowsNothing()
    {
        var scene = new Scene { Map = new Dictionary<string, Lane>(StringComparer.Ordinal) }.Add(
            Visit("V101", "QA", "0900", "900001"),
            Visit("V102", "QB", "0901", "900002"),
            Visit("V103", "QD", "0902", "900003"));
        var board = scene.Board();
        using var document = JsonDocument.Parse(board.ToJson());
        var root = document.RootElement;

        foreach (var lane in new[] { "queue", "wait", "hold", "pay", "done" })
        {
            Assert.Empty(List(root, lane));
            Assert.Equal(0, Count(root, lane));
        }
        Assert.Equal(3, board.HiddenCount);
    }

    // ---- AC-1402.2 순서·순서 번호·건수 ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.2 진료 순서는 진료대기+진료보류를 접수 빠른 순으로 놓고 1부터 순서 번호와 상태 이름을 붙인다")]
    public void QueueMergesWaitAndHoldByAcceptedTime()
    {
        var root = new Scene().Add(
            Visit("V201", "QA", "1051", "900003"),
            Visit("V202", "QB", "1005", "900010"),
            Visit("V203", "QA", "0938", "900001"),
            Visit("V204", "QC", "0930", "900030"),
            Visit("V205", "QB", "1015", "900011"),
            Visit("V206", "QA", "1042", "900002")).Json();

        Assert.Equal(new[] { "900001", "900010", "900011", "900002", "900003" }, Charts(root, "queue"));
        Assert.Equal(new[] { 1, 2, 3, 4, 5 }, List(root, "queue").Select(row => row.GetProperty("pos").GetInt32()).ToArray());
        Assert.Equal(new[] { "진료대기", "진료보류", "진료보류", "진료대기", "진료대기" }, Texts(root, "queue", "laneLabel"));
        Assert.Equal(new[] { "wait", "hold", "hold", "wait", "wait" }, Texts(root, "queue", "lane"));
    }

    [Fact(DisplayName = "AC-1402.2 접수 시각이 같으면 내원번호 순이다(V9 다음 V10)")]
    public void SameAcceptedTimeOrdersByVisitNumber()
    {
        var root = new Scene().Add(
            Visit("V10", "QA", "1000", "900020"),
            Visit("V11", "QB", "1000", "900021"),
            Visit("V9", "QA", "1000", "900019")).Json();

        Assert.Equal(new[] { "900019", "900020", "900021" }, Charts(root, "queue"));
        Assert.Equal(new[] { "900019", "900020" }, Charts(root, "wait"));
    }

    [Fact(DisplayName = "AC-1402.2 진료대기·진료보류·수납대기는 접수 빠른 순, 끝남은 접수 늦은 순(최근 순)이다")]
    public void LaneOrders()
    {
        var root = new Scene().Add(
            Visit("V301", "QA", "1051", "900303"),
            Visit("V302", "QA", "0938", "900301"),
            Visit("V303", "QB", "1015", "900312"),
            Visit("V304", "QB", "1005", "900311"),
            Visit("V305", "QC", "1012", "900322"),
            Visit("V306", "QC", "0958", "900321"),
            Visit("V307", "QD", "0905", "900331"),
            Visit("V308", "QD", "1100", "900333"),
            Visit("V309", "QD", "0912", "900332")).Json();

        Assert.Equal(new[] { "900301", "900303" }, Charts(root, "wait"));
        Assert.Equal(new[] { "900311", "900312" }, Charts(root, "hold"));
        Assert.Equal(new[] { "900321", "900322" }, Charts(root, "pay"));
        Assert.Equal(new[] { "900333", "900332", "900331" }, Charts(root, "done"));
    }

    [Fact(DisplayName = "AC-1402.2 칸마다 건수를 내고 진료 순서 건수는 진료대기+진료보류다")]
    public void CountsPerLane()
    {
        var root = new Scene().Add(
            Visit("V401", "QA", "0900", "900401"),
            Visit("V402", "QA", "0901", "900402"),
            Visit("V403", "QB", "0902", "900403"),
            Visit("V404", "QC", "0903", "900404"),
            Visit("V405", "QD", "0904", "900405"),
            Visit("V406", "QD", "0905", "900406"),
            Visit("V407", "ZZ", "0906", "900407")).Json();

        Assert.Equal(3, Count(root, "queue"));
        Assert.Equal(2, Count(root, "wait"));
        Assert.Equal(1, Count(root, "hold"));
        Assert.Equal(1, Count(root, "pay"));
        Assert.Equal(2, Count(root, "done"));
    }

    [Fact(DisplayName = "AC-1402.2 순서 번호는 진료 순서에만 있고, 다른 칸 줄의 pos는 null이며 상태 이름은 그 칸 이름이다")]
    public void PositionOnlyInQueue()
    {
        var root = new Scene().Add(
            Visit("V501", "QA", "0900", "900501"),
            Visit("V502", "QB", "0901", "900502"),
            Visit("V503", "QC", "0902", "900503"),
            Visit("V504", "QD", "0903", "900504")).Json();

        foreach (var lane in new[] { "wait", "hold", "pay", "done" })
            Assert.Equal(JsonValueKind.Null, List(root, lane).Single().GetProperty("pos").ValueKind);
        Assert.Equal("진료대기", Text(Row(root, "wait", "900501"), "laneLabel"));
        Assert.Equal("진료보류", Text(Row(root, "hold", "900502"), "laneLabel"));
        Assert.Equal("수납대기", Text(Row(root, "pay", "900503"), "laneLabel"));
        Assert.Equal("끝남", Text(Row(root, "done", "900504"), "laneLabel"));
        Assert.Equal("pay", Text(Row(root, "pay", "900503"), "lane"));
        Assert.Equal("done", Text(Row(root, "done", "900504"), "lane"));
    }

    // ---- AC-1402.3 기다린 글 -------------------------------------------------------------------------------

    private static string Waited(string status, string lane, string hhmm, DateTime now) =>
        Text(One(Visit("V601", status, hhmm, "900601"), lane, now), "waited");

    [Fact(DisplayName = "AC-1402.3 진료대기: N분째 대기(지난 분 버림), 0분은 1분, H시간 M분째 대기, M이 0이면 H시간째 대기")]
    public void WaitText()
    {
        Assert.Equal("18분째 대기", Waited("QA", "wait", "1042", At(11, 0)));
        Assert.Equal("17분째 대기", Waited("QA", "wait", "1042", At(10, 59, 59)));
        Assert.Equal("1분째 대기", Waited("QA", "wait", "1042", At(10, 42, 0)));
        Assert.Equal("1분째 대기", Waited("QA", "wait", "1042", At(10, 42, 59)));
        Assert.Equal("1분째 대기", Waited("QA", "wait", "1042", At(10, 43, 59)));
        Assert.Equal("59분째 대기", Waited("QA", "wait", "1042", At(11, 41, 59)));
        Assert.Equal("1시간 4분째 대기", Waited("QA", "wait", "0938", At(10, 42)));
        Assert.Equal("2시간째 대기", Waited("QA", "wait", "1042", At(12, 42, 30)));
    }

    [Fact(DisplayName = "AC-1402.3 PC 시계가 접수 시각보다 이르면 1분째로 쓴다")]
    public void ClockBeforeAcceptedIsOneMinute()
    {
        Assert.Equal("1분째 대기", Waited("QA", "wait", "1042", At(10, 30)));
    }

    [Fact(DisplayName = "AC-1402.3 진료보류: 보류 N분째, 보류 H시간 M분째(M이 0이면 보류 H시간째)")]
    public void HoldText()
    {
        Assert.Equal("보류 22분째", Waited("QB", "hold", "1005", At(10, 27, 30)));
        Assert.Equal("보류 1분째", Waited("QB", "hold", "1005", At(10, 5)));
        Assert.Equal("보류 1시간 4분째", Waited("QB", "hold", "1005", At(11, 9)));
        Assert.Equal("보류 2시간째", Waited("QB", "hold", "1005", At(12, 5)));
    }

    [Fact(DisplayName = "AC-1402.3 수납대기: 수납 N분째(시간을 넘기면 수납 H시간 M분째)")]
    public void PayText()
    {
        Assert.Equal("수납 6분째", Waited("QC", "pay", "0958", At(10, 4, 10)));
        Assert.Equal("수납 1분째", Waited("QC", "pay", "0958", At(9, 58)));
        Assert.Equal("수납 1시간 4분째", Waited("QC", "pay", "0958", At(11, 2)));
        Assert.Equal("수납 1시간째", Waited("QC", "pay", "0958", At(10, 58)));
    }

    [Fact(DisplayName = "AC-1402.3 끝남: 수납 시각을 알면 HH:MM 수납, 모르면 끝남")]
    public void DoneText()
    {
        string Done(string? paidAt) => Text(One(Visit("V701", "QD", "0912", "900701", paidAt: paidAt), "done"), "waited");

        Assert.Equal("09:40 수납", Done("20261105094000"));
        Assert.Equal("09:40 수납", Done("202611050940"));
        Assert.Equal("09:31 수납", Done("2026-11-05 09:31:00"));
        Assert.Equal("09:31 수납", Done("09:31"));
        Assert.Equal("끝남", Done(null));
        Assert.Equal("끝남", Done(""));
        Assert.Equal("끝남", Done("수납"));
        Assert.Equal("끝남", Done("20261105996100"));
    }

    [Fact(DisplayName = "AC-1402.3 접수 시각 글은 원값 앞 12글자로 HH:MM 접수이고, 읽지 못하면 비운다")]
    public void AcceptedTimeText()
    {
        Assert.Equal("10:42 접수", Text(One(Visit("V801", "QA", "1042", "900801"), "wait"), "time"));
        Assert.Equal("10:42 접수", Text(One(Visit("V802", "QA", "", "900802", acceptedAt: "20261105104233123"), "wait"), "time"));

        var broken = One(Visit("V803", "QA", "", "900803", acceptedAt: "2026"), "wait");
        Assert.Equal("", Text(broken, "time"));
        Assert.Equal("", Text(broken, "waited"));
        Assert.False(broken.GetProperty("long").GetBoolean());
    }

    // ---- AC-1402.4 오래 기다림 -----------------------------------------------------------------------------

    private static bool Long(string status, string lane, string hhmm, DateTime now) =>
        One(Visit("V901", status, hhmm, "900901"), lane, now).GetProperty("long").GetBoolean();

    [Fact(DisplayName = "AC-1402.4 진료대기는 59분까지 표시가 없고 60분부터 long이다")]
    public void WaitLongFromSixtyMinutes()
    {
        Assert.False(Long("QA", "wait", "1000", At(10, 59, 59)));
        Assert.True(Long("QA", "wait", "1000", At(11, 0)));
        Assert.True(Long("QA", "wait", "0938", At(10, 42)));
    }

    [Fact(DisplayName = "AC-1402.4 진료보류도 60분부터 long이고 진료 순서 줄도 같다")]
    public void HoldLongFromSixtyMinutes()
    {
        Assert.False(Long("QB", "hold", "1000", At(10, 59)));
        Assert.True(Long("QB", "hold", "1000", At(11, 0)));
        Assert.True(Long("QB", "queue", "1000", At(11, 0)));
    }

    [Fact(DisplayName = "AC-1402.4 수납대기·끝남은 오래 기다려도 long이 아니다")]
    public void PayAndDoneNeverLong()
    {
        Assert.False(Long("QC", "pay", "0900", At(13, 0)));
        Assert.False(Long("QD", "done", "0900", At(13, 0)));
    }

    // ---- AC-1402.5 정보 글 ---------------------------------------------------------------------------------

    private static string Info(string? birth, string? sex, long earlier, DateTime? now = null) =>
        Text(One(Visit("V1001", "QA", "0900", "901001", birth: birth, sex: sex, earlier: earlier, lastId: earlier > 0 ? "V1000" : null), "wait", now), "info");

    [Fact(DisplayName = "AC-1402.5 생년월일·성별·지난 완료 내원이 있으면 54세 · 여 · 재진 모양이다")]
    public void InfoFull()
    {
        Assert.Equal("54세 · 여 · 재진", Info("19720312", "F", 3));
        Assert.Equal("54세 · 남 · 재진", Info("1972-03-12", "M", 1));
        Assert.Equal("54세 · 여 · 재진", Info("19720312", "여", 2));
        Assert.Equal("54세 · 남 · 재진", Info("19720312", "남", 2));
    }

    [Fact(DisplayName = "AC-1402.5 나이는 오늘 기준 만 나이다: 생일 전날은 한 살 적고 생일 당일에 는다")]
    public void InfoAgeIsFullYears()
    {
        Assert.Equal("53세 · 재진", Info("19721106", null, 1));
        Assert.Equal("54세 · 재진", Info("19721105", null, 1));
        Assert.Equal("25세 · 재진", Info("20000229", null, 1, new DateTime(2026, 2, 28, 9, 0, 0)));
        Assert.Equal("26세 · 재진", Info("20000229", null, 1, new DateTime(2026, 3, 1, 9, 0, 0)));
        Assert.Equal("0세 · 신환", Info("20261105", null, 0));
    }

    [Fact(DisplayName = "AC-1402.5 주민번호 앞 7글자면 생년·성별을 거기서 얻는다")]
    public void InfoFromResidentNumberPrefix()
    {
        Assert.Equal("54세 · 여 · 재진", Info("7203122", null, 1));
        Assert.Equal("54세 · 남 · 재진", Info("7203121", null, 1));
        Assert.Equal("54세 · 여 · 재진", Info("720312-2", null, 1));
        Assert.Equal("21세 · 남 · 신환", Info("0503123", null, 0));
        Assert.Equal("21세 · 여 · 신환", Info("0503124", null, 0));
    }

    [Fact(DisplayName = "AC-1402.5 지난 완료 내원이 없으면 신환이다")]
    public void InfoNewPatient()
    {
        Assert.Equal("54세 · 여 · 신환", Info("19720312", "F", 0));
    }

    [Fact(DisplayName = "AC-1402.5 모르는 값은 빼고 나머지만 · 로 잇는다")]
    public void InfoDropsUnknown()
    {
        Assert.Equal("신환", Info(null, null, 0));
        Assert.Equal("재진", Info(null, null, 4));
        Assert.Equal("남 · 재진", Info(null, "M", 2));
        Assert.Equal("54세 · 재진", Info("19720312", null, 2));
        Assert.Equal("재진", Info("모름", "X", 2));
        Assert.Equal("재진", Info("19721399", "", 2));
        Assert.Equal("재진", Info("720312-", null, 2));
        Assert.Equal("재진", Info("20271105", null, 2));
    }

    // ---- AC-1402.6 처방 글 ---------------------------------------------------------------------------------

    private static JsonElement RxRow(IReadOnlyList<RxItem>? today, long earlier, IReadOnlyList<RxItem>? last) =>
        One(Visit("V1101", "QA", "0900", "901101", todayRx: today, earlier: earlier, lastId: earlier > 0 ? "V1050" : null,
            lastDay: earlier > 0 ? "20261029" : null, lastRx: last), "wait");

    [Fact(DisplayName = "AC-1402.6 오늘 처방이 있으면 오늘: 이름(코드)를 코드 순으로 · 로 잇는다")]
    public void RxToday()
    {
        var row = RxRow(new[] { new RxItem("ESWT7", "체외충격파"), new RxItem("DS20", "도수치료 20분") }, 3, Rx("PT01"));
        Assert.Equal("오늘", Text(row, "rxLabel"));
        Assert.Equal("도수치료 20분(DS20) · 체외충격파(ESWT7)", Text(row, "rx"));
    }

    [Fact(DisplayName = "AC-1402.6 처방 이름을 모르면 코드만 쓴다")]
    public void RxUnknownNameIsCodeOnly()
    {
        var row = RxRow(new[] { new RxItem("XR9", null), new RxItem("ESWT7", "체외충격파") }, 0, null);
        Assert.Equal("오늘", Text(row, "rxLabel"));
        Assert.Equal("체외충격파(ESWT7) · XR9", Text(row, "rx"));
    }

    [Fact(DisplayName = "AC-1402.6 오늘 처방이 없고 지난 내원이 있으면 지난번: 가장 최근 지난 내원의 처방")]
    public void RxLastVisit()
    {
        var row = RxRow(null, 4, Rx("PT03", "PT01"));
        Assert.Equal("지난번", Text(row, "rxLabel"));
        Assert.Equal("표층열치료(PT01) · 간섭파치료(PT03)", Text(row, "rx"));
    }

    [Fact(DisplayName = "AC-1402.6 지난 내원에 처방이 없으면 지난번 처방이 없어요")]
    public void RxLastVisitWithoutRx()
    {
        var row = RxRow(new RxItem[0], 1, new RxItem[0]);
        Assert.Equal("지난번", Text(row, "rxLabel"));
        Assert.Equal("지난번 처방이 없어요", Text(row, "rx"));
    }

    [Fact(DisplayName = "AC-1402.6 지난 내원도 없으면 처방·첫 방문이라 지난 처방이 없어요")]
    public void RxFirstVisit()
    {
        var row = RxRow(null, 0, null);
        Assert.Equal("처방", Text(row, "rxLabel"));
        Assert.Equal("첫 방문이라 지난 처방이 없어요", Text(row, "rx"));
    }

    // ---- AC-1402.7 빈 칸 -----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.7 이름·메모를 아직 못 읽으면 그 칸만 비우고 줄은 그대로 만든다")]
    public void UnknownNameAndMemoStayEmpty()
    {
        var row = One(Visit("V1201", "QA", "1042", "901201", earlier: 2, lastId: "V1200", lastRx: Rx("ESWT7")), "wait", At(11, 0));
        Assert.Equal("", Text(row, "name"));
        Assert.Equal("", Text(row, "memo"));
        Assert.Equal("재진", Text(row, "info"));
        Assert.Equal("901201", Text(row, "chart"));
        Assert.Equal("10:42 접수", Text(row, "time"));
        Assert.Equal("18분째 대기", Text(row, "waited"));
        Assert.Equal("체외충격파(ESWT7)", Text(row, "rx"));
    }

    [Fact(DisplayName = "AC-1402.7 이름·메모가 있으면 그대로 싣고, 공백뿐이면 비운다")]
    public void KnownNameAndMemoAreShown()
    {
        var row = One(Visit("V1202", "QA", "1042", "901202", name: "가상환자01", memo: "오른쪽 어깨 통증 심해짐"), "wait");
        Assert.Equal("가상환자01", Text(row, "name"));
        Assert.Equal("오른쪽 어깨 통증 심해짐", Text(row, "memo"));

        var blank = One(Visit("V1203", "QA", "1042", "901203", name: "  ", memo: " "), "wait");
        Assert.Equal("", Text(blank, "name"));
        Assert.Equal("", Text(blank, "memo"));
    }

    // ---- AC-1402.8 엑스레이 칸 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.8 진료보류 줄은 찍음 표시가 있으면 xray.at = HH:MM이다(진료 순서 줄도)")]
    public void HoldWithMark()
    {
        var scene = new Scene().Add(Visit("V1301", "QB", "1015", "901301"));
        scene.Marks["V1301"] = "10:55";
        var root = scene.Json();

        Assert.Equal("10:55", Row(root, "hold", "901301").GetProperty("xray").GetProperty("at").GetString());
        Assert.Equal("10:55", Row(root, "queue", "901301").GetProperty("xray").GetProperty("at").GetString());
    }

    [Fact(DisplayName = "AC-1402.8 찍음 표시가 없는 진료보류 줄은 xray.at = null이다")]
    public void HoldWithoutMark()
    {
        var root = new Scene().Add(Visit("V1302", "QB", "1015", "901302")).Json();
        var xray = Row(root, "hold", "901302").GetProperty("xray");
        Assert.Equal(JsonValueKind.Object, xray.ValueKind);
        Assert.Equal(JsonValueKind.Null, xray.GetProperty("at").ValueKind);
    }

    [Fact(DisplayName = "AC-1402.8 다른 상태 줄에는 엑스레이 칸이 없다(찍음 표시가 남아 있어도 xray = null)")]
    public void OtherLanesHaveNoXray()
    {
        var scene = new Scene().Add(
            Visit("V1303", "QA", "1016", "901303"),
            Visit("V1304", "QC", "1017", "901304"),
            Visit("V1305", "QD", "1018", "901305"));
        scene.Marks["V1303"] = "10:20";
        scene.Marks["V1304"] = "10:21";
        scene.Marks["V1305"] = "10:22";
        var root = scene.Json();

        Assert.Equal(JsonValueKind.Null, Row(root, "wait", "901303").GetProperty("xray").ValueKind);
        Assert.Equal(JsonValueKind.Null, Row(root, "queue", "901303").GetProperty("xray").ValueKind);
        Assert.Equal(JsonValueKind.Null, Row(root, "pay", "901304").GetProperty("xray").ValueKind);
        Assert.Equal(JsonValueKind.Null, Row(root, "done", "901305").GetProperty("xray").ValueKind);
    }

    // ---- AC-1402.9 열쇠·원값 없음·모양 -----------------------------------------------------------------------

    [Fact(DisplayName = "AC-1402.9 줄마다 그날 무작위 16자리 16진수 열쇠(VisitKeys)가 있고 같은 내원은 칸이 달라도 같은 열쇠다")]
    public void EveryRowHasScreenKey()
    {
        var scene = new Scene().Add(
            Visit("V1401", "QA", "0900", "901401"),
            Visit("V1402", "QB", "0901", "901402"),
            Visit("V1403", "QC", "0902", "901403"),
            Visit("V1404", "QD", "0903", "901404"));
        var root = scene.Json();

        foreach (var lane in new[] { "queue", "wait", "hold", "pay", "done" })
            foreach (var row in List(root, lane))
                Assert.Matches(KeyShape, Text(row, "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1401"), Text(Row(root, "wait", "901401"), "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1401"), Text(Row(root, "queue", "901401"), "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1402"), Text(Row(root, "hold", "901402"), "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1402"), Text(Row(root, "queue", "901402"), "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1403"), Text(Row(root, "pay", "901403"), "k"));
        Assert.Equal(scene.Keys.KeyOf(Day, "V1404"), Text(Row(root, "done", "901404"), "k"));
    }

    [Fact(DisplayName = "AC-1402.9 내원번호·비트 상태 코드·OcmRsuYon·생년월일 원값은 휴대폰 자료에 없다")]
    public void RawValuesNeverLeave()
    {
        var scene = new Scene().Add(
            Visit("V7301234", "QA", "0900", "901501", rsu: "R4", birth: "19720312", sex: "F", lastId: "V7300001", earlier: 1),
            Visit("V7305678", "QB", "0901", "901502", rsu: "R4", birth: "7203122"),
            Visit("V7309999", "QD", "0902", "901503", rsu: "R4", birth: "1972-03-12", paidAt: "20261105094000"));
        scene.Marks["V7305678"] = "10:55";
        var json = scene.Text();

        foreach (var raw in new[] { "V7301234", "V7305678", "V7309999", "V7300001", "QA", "QB", "QD", "R4", "19720312", "7203122", "1972-03-12", "20261105", "\"F\"" })
            Assert.DoesNotContain(raw, json);
    }

    [Fact(DisplayName = "AC-1402.9 같은 내원은 그날 다시 만들어도 같은 열쇠이고 날이 바뀌면 새 열쇠다")]
    public void KeysStableWithinDayNewNextDay()
    {
        var scene = new Scene().Add(Visit("V1601", "QA", "0900", "901601"));
        var first = Text(List(scene.Json(), "wait").Single(), "k");
        var again = Text(List(scene.Json(), "wait").Single(), "k");
        Assert.Equal(first, again);

        scene.Day = "20261106";
        var nextDay = Text(List(scene.Json(), "wait").Single(), "k");
        Assert.Matches(KeyShape, nextDay);
        Assert.NotEqual(first, nextDay);
        Assert.Null(scene.Keys.Find(Day, first));
    }

    [Fact(DisplayName = "AC-1402.9 자료 모양(design.md 4절): state·at·counts·lists와 줄 칸 이름·값 종류")]
    public void JsonShape()
    {
        var scene = new Scene().Add(
            Visit("V1701", "QA", "1042", "901701", name: "가상환자17", memo: "보호자 동반", todayRx: Rx("ESWT7")),
            Visit("V1702", "QB", "1005", "901702"),
            Visit("V1703", "QC", "0958", "901703"),
            Visit("V1704", "QD", "0912", "901704"));
        var root = scene.Json();

        Assert.Equal(new[] { "state", "at", "counts", "lists" }, root.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal("ok", root.GetProperty("state").GetString());
        Assert.Equal("13:42:10", root.GetProperty("at").GetString());
        var lanes = new[] { "queue", "wait", "hold", "pay", "done" };
        Assert.Equal(lanes, root.GetProperty("counts").EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(lanes, root.GetProperty("lists").EnumerateObject().Select(p => p.Name).ToArray());

        var fields = new[] { "k", "lane", "pos", "laneLabel", "chart", "name", "info", "time", "waited", "long", "memo", "rxLabel", "rx", "xray" };
        foreach (var lane in lanes)
            foreach (var row in List(root, lane))
                Assert.Equal(fields, row.EnumerateObject().Select(p => p.Name).ToArray());

        var queued = Row(root, "queue", "901701");
        Assert.Equal(JsonValueKind.Number, queued.GetProperty("pos").ValueKind);
        Assert.Equal(JsonValueKind.True, queued.GetProperty("long").ValueKind); // 10:42 접수, 지금 13:42 → 3시간째
        Assert.Equal(JsonValueKind.False, Row(root, "pay", "901703").GetProperty("long").ValueKind);
        Assert.Equal("가상환자17", Text(queued, "name"));
        Assert.Equal("보호자 동반", Text(queued, "memo"));
        Assert.Equal("체외충격파(ESWT7)", Text(queued, "rx"));
        Assert.Contains("체외충격파", scene.Text());
    }
}
