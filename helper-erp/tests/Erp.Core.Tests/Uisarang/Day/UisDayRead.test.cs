using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Erp.Core.Uisarang;
using Xunit;
using static Erp.Core.Tests.Uisarang.Day.DayKit;

namespace Erp.Core.Tests.Uisarang.Day;

/// <summary>
/// spec erp-uisarang TASK-13: 의사랑 closing.day 한 번 읽기 UisDay(design.md 4-2·5-5·6-1·6-2)를 가짜 폴더(부른 차례 기록)·가짜 엑셀·실제 임시 폴더로 본다.
/// 숫자는 가짜 엑셀(fixtures/fake-uisarang)의 지은 값이다. 환자 칸은 design.md 12-2 표시 글자뿐이다.
/// </summary>
public class UisDayReadTests
{
    private const string Day = DayRig.DayText;

    private static readonly string[] IncomeHeader =
    {
        "보험구분", "총진료비", "급여총액", "청구액", "진료수납액", "비급여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액",
    };

    private static bool IsPatientFile(string name) => name.Contains("환자별");

    /// <summary>환자별 엑셀마다 Delete가 그 Read 바로 다음 부름이다(다음 파일 Read 전, AC-4209.2).</summary>
    private static void PatientDeletedRightAfterRead(FakeUisFolder folder)
    {
        var calls = folder.Calls;
        for (var i = 0; i < calls.Count; i++)
        {
            if (!calls[i].StartsWith("Read:", StringComparison.Ordinal)) continue;
            var name = calls[i].Substring("Read:".Length);
            if (!IsPatientFile(name)) continue;
            Assert.True(i + 1 < calls.Count, "환자별 엑셀을 읽고 지우지 않았다");
            Assert.Equal("Delete:" + name, calls[i + 1]);
        }
    }

    private static int ReadCount(FakeUisFolder folder) => folder.Calls.Count(call => call.StartsWith("Read:", StringComparison.Ordinal));

    // ---- 열림(AC-4202.3) -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-4202.3 열린 엑셀이 하나라도 있으면 List·IsOpen만 부르고 어느 파일도 읽거나 지우지 않으며 uis.open에 파일 이름으로 짐작한 보고서(모르면 unknown)")]
    public void OpenFileStopsEverything()
    {
        using var rig = new DayRig();
        rig.All().Fixture("내 엑셀.xls", "other-report.xls");
        rig.Folder.Open.Add(DayRig.VisitPatients);
        rig.Folder.Open.Add("내 엑셀.xls");

        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("open", Day, result);

        Assert.Equal("List", rig.Folder.Calls[0]);
        Assert.All(rig.Folder.Calls.Skip(1), call => Assert.StartsWith("IsOpen:", call));
        Assert.Equal(7, rig.Folder.Calls.Count - 1);
        Assert.Equal(7, rig.Folder.Names.Count);
        Assert.Equal(new[] { "unknown", "visitPatients" }, Strings(data.GetProperty("uis").GetProperty("open")));
        foreach (var kind in new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" }) Assert.Equal("missing", State(data, kind));
        var uis = data.GetProperty("uis");
        foreach (var count in new[] { "deleted", "kept", "deleteFailed", "unknownFiles" }) Assert.Equal(0, uis.GetProperty(count).GetInt32());
        Assert.Null(N(data.GetProperty("money").GetProperty("total")));
        Assert.Equal("", rig.CachePlain());
    }

    [Fact(DisplayName = "AC-4202.3 열린 엑셀이 있으면 보고서는 그날 모아 둔 값만으로 채운다(cached), 같은 보고서가 둘 열려도 open에는 한 번")]
    public void OpenFileUsesCacheOnly()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Read(Usual());

        rig.NewFolder();
        rig.All();
        rig.Folder.Fixture("통계-일일수입통계 (2).xls", "income.xls");
        rig.Folder.Open.Add(DayRig.Income);
        rig.Folder.Open.Add("통계-일일수입통계 (2).xls");
        var data = Data(rig.Read(Usual()));

        Assert.Equal(new[] { "income" }, Strings(data.GetProperty("uis").GetProperty("open")));
        Assert.Equal(0, ReadCount(rig.Folder));
        Assert.Equal(7, rig.Folder.Names.Count);
        foreach (var kind in new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" })
        {
            Assert.Equal("ok", State(data, kind));
            Assert.True(Cached(data, kind));
        }
        Assert.Equal(5_182_300, N(data.GetProperty("money").GetProperty("total")));
    }

    // ---- 고르기·지우기·남기기(AC-4202.4, 5-5 표) ---------------------------------------------------------

    [Fact(DisplayName = "AC-4202.4 모두 읽음(ok): 환자별은 알아본 바로 뒤, 합계 엑셀은 모든 파일을 읽은 뒤 지우고 deleted 6")]
    public void AllOkDeletesEverything()
    {
        using var rig = new DayRig();
        rig.All();
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("all", Day, result);

        foreach (var kind in new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" })
        {
            Assert.Equal("ok", State(data, kind));
            Assert.False(Cached(data, kind));
        }
        Assert.Empty(rig.Folder.Names);
        PatientDeletedRightAfterRead(rig.Folder);
        var lastRead = rig.Folder.Calls.FindLastIndex(call => call.StartsWith("Read:", StringComparison.Ordinal));
        foreach (var sum in new[] { DayRig.Income, DayRig.Rx, DayRig.Visits, DayRig.Rsv })
        {
            Assert.True(rig.Folder.Calls.IndexOf("Delete:" + sum) > lastRead, "합계 엑셀을 다 읽기 전에 지웠다");
        }
        var uis = data.GetProperty("uis");
        Assert.Equal(6, uis.GetProperty("deleted").GetInt32());
        Assert.Equal(0, uis.GetProperty("kept").GetInt32());
        Assert.Equal(0, uis.GetProperty("deleteFailed").GetInt32());
        Assert.Equal(0, uis.GetProperty("unknownFiles").GetInt32());
        Assert.Empty(rig.Notes);
    }

    [Fact(DisplayName = "AC-4202.4 합계 엑셀 날짜 다름(otherDate)은 남기고 kept, 그 보고서 값은 비우고 from·to에 조회일")]
    public void OtherDateSumIsKept()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture(DayRig.Income, "income-other-date.xls").Fixture(DayRig.Rx, "rx-3months.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("otherDate", Day, result);

        Assert.Equal("otherDate", State(data, "income"));
        Assert.Equal("2026-11-22", ReportOf(data, "income").GetProperty("from").GetString());
        Assert.Equal("2026-11-22", ReportOf(data, "income").GetProperty("to").GetString());
        Assert.Equal("otherDate", State(data, "rx"));
        Assert.Equal("2026-08-24", ReportOf(data, "rx").GetProperty("from").GetString());
        Assert.Equal(Day, ReportOf(data, "rx").GetProperty("to").GetString());
        Assert.True(rig.Folder.Has(DayRig.Income));
        Assert.True(rig.Folder.Has(DayRig.Rx));
        Assert.Equal(new[] { DayRig.Rx, DayRig.Income }.OrderBy(n => n, StringComparer.Ordinal), rig.Folder.Names);
        Assert.Equal(2, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Equal(4, data.GetProperty("uis").GetProperty("deleted").GetInt32());
        Assert.Null(N(data.GetProperty("money").GetProperty("total")));
        Assert.All(data.GetProperty("groups").EnumerateArray(), group =>
        {
            Assert.Null(N(group.GetProperty("patients")));
            Assert.Null(N(group.GetProperty("total")));
        });
        Assert.Null(N(data.GetProperty("patients").GetProperty("ptVisit")));
    }

    [Fact(DisplayName = "AC-4202.4 조건이 '전체'가 아닌(notAll) 합계 엑셀은 지우고 value에 그 값")]
    public void NotAllSumIsDeleted()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture(DayRig.Income, "income-outpatient.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("notAll", Day, result);

        Assert.Equal("notAll", State(data, "income"));
        Assert.Equal("외래", ReportOf(data, "income").GetProperty("value").GetString());
        Assert.Empty(rig.Folder.Names);
        Assert.Equal(0, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Null(N(data.GetProperty("money").GetProperty("received")));
    }

    [Fact(DisplayName = "AC-4202.4 같은 종류 합계 엑셀 여럿 가운데 조회일이 마감 일자 하루인 것이 꼭 하나면 그것을 읽어 지우고 나머지는 날짜 다름으로 남김")]
    public void OneOnDayAmongMany()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture("통계-일일수입통계 (1).xls", "income-other-date.xls").Fixture("통계-기간별처방통계 (1).xls", "rx-3months.xls");
        var data = Data(rig.Read(Usual()));

        Assert.Equal("ok", State(data, "income"));
        Assert.Equal("ok", State(data, "rx"));
        Assert.Equal(Day, ReportOf(data, "income").GetProperty("from").GetString());
        Assert.Equal(new[] { "통계-기간별처방통계 (1).xls", "통계-일일수입통계 (1).xls" }, rig.Folder.Names);
        Assert.Equal(2, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Equal(5_182_300, N(data.GetProperty("money").GetProperty("total")));
        Assert.Equal(4, N(Group(data, "carm").GetProperty("patients")));
    }

    [Fact(DisplayName = "AC-4202.4 같은 날 같은 종류 합계 엑셀 둘(twice)은 둘 다 남기고 값은 쓰지 않음")]
    public void TwiceSumIsKept()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture("통계-일일수입통계 (1).xls", "income.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("twice", Day, result);

        Assert.Equal("twice", State(data, "income"));
        Assert.Equal(JsonValueKind.Null, ReportOf(data, "income").GetProperty("from").ValueKind);
        Assert.Equal(new[] { "통계-일일수입통계 (1).xls", DayRig.Income }, rig.Folder.Names);
        Assert.Equal(2, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Null(N(data.GetProperty("money").GetProperty("total")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("return")));
    }

    [Fact(DisplayName = "AC-4202.4 같은 날 합계 엑셀 둘 가운데 하나가 notAll이면 보고서는 twice, notAll 엑셀은 지우고 나머지는 남김")]
    public void TwiceWithNotAll()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture("통계-일일수입통계 (외래).xls", "income-outpatient.xls");
        var data = Data(rig.Read(Usual()));

        Assert.Equal("twice", State(data, "income"));
        Assert.Equal(new[] { DayRig.Income }, rig.Folder.Names);
        Assert.Equal(1, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Equal(6, data.GetProperty("uis").GetProperty("deleted").GetInt32());
    }

    [Fact(DisplayName = "AC-4202.4 환자별 엑셀 둘(twice)은 둘 다 읽자마자 지우고 그 보고서 값은 비움")]
    public void TwicePatientsAreDeleted()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture("통계-내원일별환자현황-환자별 (1).xls", "visit-patients.xls");
        var data = Data(rig.Read(Usual()));

        Assert.Equal("twice", State(data, "visitPatients"));
        Assert.Empty(rig.Folder.Names);
        PatientDeletedRightAfterRead(rig.Folder);
        Assert.All(data.GetProperty("ages").EnumerateArray(), age => Assert.Null(N(age.GetProperty("new"))));
        Assert.Equal(0, data.GetProperty("warnings").GetProperty("unknownAge").GetInt64());
        Assert.False(data.GetProperty("uis").GetProperty("checks").GetProperty("noDate").GetBoolean());
        // 위쪽 표가 있으니 신환·합계는 위쪽 표 값
        Assert.Equal(97, N(data.GetProperty("patients").GetProperty("total")));
    }

    [Fact(DisplayName = "AC-4202.4 예약일이 다른 환자별 예약 표(otherDate)도 지우고 from·to는 예약일 처음·끝")]
    public void OtherDayPatientsAreDeleted()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Folder.Fixture(DayRig.RsvPatients, "rsv-patients-other-day.xls");
        var data = Data(rig.Read(Usual()));

        Assert.Equal("otherDate", State(data, "rsvPatients"));
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("from").GetString());
        Assert.Equal("2026-11-24", ReportOf(data, "rsvPatients").GetProperty("to").GetString());
        Assert.Empty(rig.Folder.Names);
        Assert.Null(N(data.GetProperty("reservations").GetProperty("patients")));
        // 위쪽 표가 ok이니 예약 참고 숫자는 위쪽 표, 아래쪽 표와 견주지 않음
        Assert.Equal(32, data.GetProperty("uis").GetProperty("reservations").GetProperty("total").GetInt64());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("uis").GetProperty("checks").GetProperty("rsvRows").ValueKind);
    }

    // ---- 예약일 날짜 찾기·못 찾으면 조회일 라벨로(AC-4208.1·AC-4208.4, design 2-1 고침 15) ------------------------

    /// <summary>환자별 예약 표: 제목 · (label이 있으면) 조회일 라벨 · 머리글 · 예약일 칸이 days인 환자 줄 · 끝 '합계' 줄.</summary>
    private static IReadOnlyList<IReadOnlyList<XlsCell>> RsvPatientRows(string? label, params object?[] days)
    {
        var charts = new[] { "9000001", "9000002", "9000003" };
        var rows = new List<IReadOnlyList<XlsCell>> { Row("예약환자통계 (환자별)") };
        if (label != null) rows.Add(Row("[조 회 일] " + label));
        rows.Add(Row("예약일", "차트번호", "방문여부"));
        for (var i = 0; i < days.Length; i++) rows.Add(Row(days[i], charts[i], "방문"));
        rows.Add(Row("합계", null, null));
        return rows;
    }

    [Fact(DisplayName = "AC-4208.1 시각 붙은 예약일(오후 2:30·초·'년월일')이 모두 마감 일자면 rsvPatients ok · from·to = 그날 · 실예약환자수 = 서로 다른 차트번호")]
    public void RsvPatientsWithTimes()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.RsvPatients, RsvPatientRows("2026-11-23 ~ 2026-11-23", "2026-11-23 오후 2:30", "2026/11/23 09:00:00", "2026년 11월 23일 14:30"));
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("rsvTimes", Day, result);

        Assert.Equal("ok", State(data, "rsvPatients"));
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("from").GetString());
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("to").GetString());
        Assert.Equal(3, N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Empty(rig.Folder.Names);
        NoMarkers(Text(result), "답");
        Assert.All(rig.Notes, note => NoMarkers(note, "기록 줄"));
    }

    [Fact(DisplayName = "AC-4208.4 어느 줄의 예약일 칸에서도 날짜를 못 찾고 조회일 라벨이 마감 일자 하루면 ok · from·to = 라벨(멈추지 않음)")]
    public void RsvPatientsNoDateLabelOnDay()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.RsvPatients, RsvPatientRows("2026-11-23 ~ 2026-11-23", "오후 2:30", null, "내일"));
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("rsvLabelOk", Day, result);

        Assert.Equal("ok", State(data, "rsvPatients"));
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("from").GetString());
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("to").GetString());
        Assert.Equal(3, N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Empty(rig.Folder.Names);
        NoMarkers(Text(result), "답");
        Assert.All(rig.Notes, note => NoMarkers(note, "기록 줄"));
    }

    [Fact(DisplayName = "AC-4208.4 예약일 날짜를 못 찾고 조회일 라벨이 다른 날이면 otherDate · from·to = 라벨")]
    public void RsvPatientsNoDateLabelOtherDay()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.RsvPatients, RsvPatientRows("2026-11-24 ~ 2026-11-25", "14:30", "오전 9:00"));
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("rsvLabelOther", Day, result);

        Assert.Equal("otherDate", State(data, "rsvPatients"));
        Assert.Equal("2026-11-24", ReportOf(data, "rsvPatients").GetProperty("from").GetString());
        Assert.Equal("2026-11-25", ReportOf(data, "rsvPatients").GetProperty("to").GetString());
        Assert.Null(N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Empty(rig.Folder.Names);
        NoMarkers(Text(result), "답");
    }

    [Fact(DisplayName = "AC-4208.4 예약일 날짜를 못 찾고 조회일 라벨도 없으면 ok · from·to = null")]
    public void RsvPatientsNoDateNoLabel()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.RsvPatients, RsvPatientRows(null, "14:30", null));
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("rsvNoLabel", Day, result);

        Assert.Equal("ok", State(data, "rsvPatients"));
        Assert.Equal(JsonValueKind.Null, ReportOf(data, "rsvPatients").GetProperty("from").ValueKind);
        Assert.Equal(JsonValueKind.Null, ReportOf(data, "rsvPatients").GetProperty("to").ValueKind);
        Assert.Equal(2, N(data.GetProperty("reservations").GetProperty("patients")));
        NoMarkers(Text(result), "답");
    }

    [Fact(DisplayName = "AC-4208.4 조건이 '전체'가 아니면(notAll) 날짜를 못 찾아도 notAll 그대로 · from·to = 라벨")]
    public void RsvPatientsNoDateNotAll()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.RsvPatients, Sheet(
            Row("예약환자통계 (환자별)"),
            Row("[조 회 일] 2026-11-23 ~ 2026-11-23", null, "[외/입 구분] 외래"),
            Row("예약일", "차트번호", "방문여부"),
            Row("14:30", "9000001", "방문")));
        var data = Data(rig.Read(Usual()));

        Assert.Equal("notAll", State(data, "rsvPatients"));
        Assert.Equal(Day, ReportOf(data, "rsvPatients").GetProperty("from").GetString());
        Assert.Null(N(data.GetProperty("reservations").GetProperty("patients")));
    }

    [Fact(DisplayName = "AC-4202.4 조건이 '전체'가 아닌 환자별 엑셀(notAll)도 읽자마자 지우고 value에 그 값")]
    public void NotAllPatientsAreDeleted()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Made(DayRig.VisitPatients, Sheet(
            Row("내원일별환자현황 (환자별)"),
            Row("[조 회 일] 2026-11-23 ~ 2026-11-23", null, "[외/입 구분] 외래"),
            Row("차트번호", "수진자명", "주민등록번호", "신규환자"),
            Row("9000001", "가짜환자01", "800101-1******", "신규")));
        var data = Data(rig.Read(Usual()));

        Assert.Equal("notAll", State(data, "visitPatients"));
        Assert.Equal("외래", ReportOf(data, "visitPatients").GetProperty("value").GetString());
        Assert.Empty(rig.Folder.Names);
        PatientDeletedRightAfterRead(rig.Folder);
        Assert.Null(N(data.GetProperty("ages").EnumerateArray().First().GetProperty("new")));
    }

    [Fact(DisplayName = "AC-4202.4 깨짐·xlsx·HTML·종류 모름·읽다 실패·20MB 넘음은 지우고 unknownFiles에 셈(20MB 넘음은 읽지 않음)")]
    public void UnknownFilesAreDeleted()
    {
        using var rig = new DayRig();
        rig.All()
            .Fixture("a-broken.xls", "broken.xls")
            .Fixture("b-real-xlsx.xls", "real-xlsx.xls")
            .Fixture("c-html.xls", "html.xls")
            .Fixture("d-other.xls", "other-report.xls")
            .Fixture("e-locked.xls", "income.xls")
            .Fixture("f-huge.xls", "income.xls");
        rig.Folder.FailRead.Add("e-locked.xls");
        rig.Folder.Lengths["f-huge.xls"] = 20L * 1024 * 1024 + 1;
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("unknownFiles", Day, result);

        Assert.Empty(rig.Folder.Names);
        Assert.DoesNotContain("Read:f-huge.xls", rig.Folder.Calls);
        foreach (var name in new[] { "a-broken.xls", "b-real-xlsx.xls", "c-html.xls", "d-other.xls", "e-locked.xls" })
        {
            var read = rig.Folder.Calls.IndexOf("Read:" + name);
            Assert.Equal("Delete:" + name, rig.Folder.Calls[read + 1]);
        }
        var uis = data.GetProperty("uis");
        Assert.Equal(6, uis.GetProperty("unknownFiles").GetInt32());
        Assert.Equal(12, uis.GetProperty("deleted").GetInt32());
        Assert.Equal("ok", State(data, "income"));
    }

    [Fact(DisplayName = "AC-4202.4 못 지운 파일은 deleteFailed에 세고 deleted·unknownFiles에는 넣지 않음")]
    public void DeleteFailuresAreCounted()
    {
        using var rig = new DayRig();
        rig.All().Fixture("a-broken.xls", "broken.xls");
        rig.Folder.FailDelete.Add(DayRig.VisitPatients);
        rig.Folder.FailDelete.Add(DayRig.Income);
        rig.Folder.FailDelete.Add("a-broken.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("deleteFailed", Day, result);

        var uis = data.GetProperty("uis");
        Assert.Equal(3, uis.GetProperty("deleteFailed").GetInt32());
        Assert.Equal(4, uis.GetProperty("deleted").GetInt32());
        Assert.Equal(0, uis.GetProperty("unknownFiles").GetInt32());
        Assert.Equal(0, uis.GetProperty("kept").GetInt32());
        Assert.Equal("ok", State(data, "visitPatients"));
        Assert.Equal("ok", State(data, "income"));
    }

    [Fact(DisplayName = "AC-4202.4 없는 보고서는 missing이고 그 보고서에 기대는 값은 null")]
    public void MissingReports()
    {
        using var rig = new DayRig();
        rig.Folder.Fixture(DayRig.Income, "income.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("partial", Day, result);

        Assert.Equal("ok", State(data, "income"));
        foreach (var kind in new[] { "rx", "visits", "visitPatients", "rsv", "rsvPatients" }) Assert.Equal("missing", State(data, kind));
        Assert.Equal(1_741_100, N(data.GetProperty("money").GetProperty("received")));
        // 물리치료내원을 골랐는데 처방통계가 없으면 재진도 셀 수 없다
        Assert.Null(N(data.GetProperty("patients").GetProperty("ptVisit")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("return")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("total")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("noExamFee")));
        Assert.Null(N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Equal(JsonValueKind.Null, data.GetProperty("uis").GetProperty("reservations").ValueKind);
        Assert.Equal(1, data.GetProperty("uis").GetProperty("deleted").GetInt32());
    }

    // ---- 환자별 엑셀 지우기 차례(AC-4209.2) ----------------------------------------------------------------

    [Fact(DisplayName = "AC-4209.2 성공·날짜 다름·종류 모름·깨짐·같은 종류 둘·notAll에서 환자별 엑셀 Delete는 늘 그 Read 바로 다음")]
    public void PatientDeleteFollowsRead()
    {
        var setups = new List<Action<DayRig>>
        {
            rig => rig.All(),
            rig => rig.All().Fixture(DayRig.RsvPatients, "rsv-patients-other-day.xls").Fixture(DayRig.Income, "income-other-date.xls"),
            rig => rig.All().Fixture("가-other.xls", "other-report.xls").Fixture("나-broken.xls", "broken.xls"),
            rig => rig.All().Fixture("통계-내원일별환자현황-환자별 (1).xls", "visit-patients.xls").Fixture("통계-예약환자통계-환자별 (1).xls", "rsv-patients.xls"),
            rig => rig.All().Fixture(DayRig.VisitPatients, "visit-patients-no-date.xls"),
        };
        foreach (var setup in setups)
        {
            using var rig = new DayRig();
            setup(rig);
            rig.Read(Usual());
            PatientDeletedRightAfterRead(rig.Folder);
            Assert.DoesNotContain(rig.Folder.Names, IsPatientFile);
        }
    }

    [Fact(DisplayName = "AC-4209.2 실제 임시 폴더(UisDiskFolder)로 돌려도 끝난 뒤 환자별 엑셀이 없고, 날짜 다른 합계 엑셀만 남음")]
    public void DiskFolderLeavesNoPatientFiles()
    {
        using var rig = new DayRig();
        var place = rig.Temp.PathOf("ERP마감");
        Directory.CreateDirectory(place);
        void Put(string name, string fixture) => File.Copy(FakeUisFiles.PathOf(fixture), Path.Combine(place, name));
        Put(DayRig.Income, "income-other-date.xls");
        Put(DayRig.Rx, "rx.xls");
        Put(DayRig.Visits, "visits.xls");
        Put(DayRig.VisitPatients, "visit-patients.xls");
        Put("통계-내원일별환자현황-환자별 (1).xls", "visit-patients-no-date.xls");
        Put(DayRig.Rsv, "rsv.xls");
        Put(DayRig.RsvPatients, "rsv-patients-other-day.xls");
        Put("모르는 표.xls", "other-report.xls");

        var result = UisDay.Read(new UisDiskFolder(place), rig.Cache, DayRig.Day, Usual(), UisFolderKind.Profile);
        var data = Data(result);

        Assert.Equal(new[] { DayRig.Income }, Directory.GetFiles(place).Select(file => Path.GetFileName(file)).ToArray());
        Assert.Equal("twice", State(data, "visitPatients"));
        Assert.Equal("otherDate", State(data, "rsvPatients"));
        Assert.Equal("otherDate", State(data, "income"));
        Assert.Equal("profile", data.GetProperty("uis").GetProperty("folder").GetString());
        Assert.Equal(1, data.GetProperty("uis").GetProperty("kept").GetInt32());
        Assert.Equal(1, data.GetProperty("uis").GetProperty("unknownFiles").GetInt32());
        Assert.Equal(7, data.GetProperty("uis").GetProperty("deleted").GetInt32());
    }

    // ---- 셈(AC-4206.3·AC-4207.4·AC-4210.3) ---------------------------------------------------------------

    [Fact(DisplayName = "AC-4210.3 여섯 보고서 ok: 비트 답과 같은 칸 값 + source·uis, 묶음 합(코드 꼴 정리·같은 코드 여러 줄·원 미만 버림)·소수 묶음은 null + fractional")]
    public void FullDayNumbers()
    {
        using var rig = new DayRig();
        rig.All();
        var data = Data(rig.Read(Usual()));

        Assert.Equal(Day, data.GetProperty("date").GetString());
        Assert.Equal("uisarang", data.GetProperty("source").GetString());
        var patients = data.GetProperty("patients");
        Assert.Equal(7, N(patients.GetProperty("new")));
        Assert.Equal(JsonValueKind.Null, patients.GetProperty("first90").ValueKind);
        Assert.Equal(57, N(patients.GetProperty("return")));
        Assert.Equal(31, N(patients.GetProperty("ptVisit")));
        Assert.Equal(0, N(patients.GetProperty("noExamFee")));
        Assert.Equal(97, N(patients.GetProperty("total")));

        Assert.Equal(
            new[] { "carm", "sono", "manual", "eswt", "lipus", "eswtRadial", "ptVisit", "pt", "etc1" },
            data.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("key").GetString()));
        Assert.Equal(4, N(Group(data, "carm").GetProperty("patients")));
        Assert.Equal(220_000, N(Group(data, "carm").GetProperty("total")));
        Assert.Equal(6, N(Group(data, "sono").GetProperty("patients")));
        Assert.Null(N(Group(data, "sono").GetProperty("total")));
        Assert.Equal(10, N(Group(data, "manual").GetProperty("patients")));
        Assert.Equal(600_000, N(Group(data, "manual").GetProperty("total")));
        Assert.Equal(5, N(Group(data, "eswt").GetProperty("patients")));
        Assert.Null(N(Group(data, "lipus").GetProperty("patients")));
        Assert.Equal(2, N(Group(data, "eswtRadial").GetProperty("patients")));
        Assert.Equal(31, N(Group(data, "ptVisit").GetProperty("patients")));
        Assert.Null(N(Group(data, "pt").GetProperty("patients")));
        Assert.Equal(75_545, N(Group(data, "pt").GetProperty("total")));
        Assert.Equal(99_999, N(Group(data, "etc1").GetProperty("total")));
        foreach (var group in data.GetProperty("groups").EnumerateArray())
        {
            foreach (var none in new[] { "unpaidVisits", "new", "first90", "return" }) Assert.Equal(JsonValueKind.Null, group.GetProperty(none).ValueKind);
        }
        Assert.Equal(new[] { "lipus" }, Strings(data.GetProperty("uis").GetProperty("fractional")));
        Assert.Empty(Strings(data.GetProperty("uis").GetProperty("negative")));

        var ages = data.GetProperty("ages").EnumerateArray().ToArray();
        Assert.Equal(new[] { "0", "10", "20", "30", "40", "50", "60", "70", "80", "90" }, ages.Select(age => age.GetProperty("band").GetString()));
        var counted = ages.Sum(age => N(age.GetProperty("new"))!.Value + N(age.GetProperty("return"))!.Value);
        Assert.Equal(97 - 3, counted);
        Assert.Equal(3, data.GetProperty("warnings").GetProperty("unknownAge").GetInt64());

        var money = data.GetProperty("money");
        Assert.Equal(5_182_300, N(money.GetProperty("total")));
        Assert.Equal(3_441_200, N(money.GetProperty("insurer")));
        Assert.Equal(1_206_000, N(money.GetProperty("noncovered")));
        Assert.Equal(1_741_100, N(money.GetProperty("received")));
        Assert.Equal(1_388_600, N(money.GetProperty("card")));
        Assert.Equal(352_500, N(money.GetProperty("cash")));
        foreach (var none in new[] { "receivableIn", "unpaidNew", "discount", "disabledFund", "transfer", "refund" })
        {
            Assert.Equal(JsonValueKind.Null, money.GetProperty(none).ValueKind);
        }

        Assert.Equal(31, N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Equal(0, data.GetProperty("reservations").GetProperty("kinds").GetArrayLength());
        var uis = data.GetProperty("uis");
        Assert.Equal("desktop", uis.GetProperty("folder").GetString());
        Assert.Equal(32, uis.GetProperty("reservations").GetProperty("total").GetInt64());
        Assert.Equal(25, uis.GetProperty("reservations").GetProperty("visited").GetInt64());
        foreach (var check in new[] { "totalFee", "received", "headcount", "rxTotal", "visitRows", "visitNew", "rsvRows", "rsvVisited" })
        {
            Assert.Equal(JsonValueKind.Null, uis.GetProperty("checks").GetProperty(check).ValueKind);
        }
        Assert.False(uis.GetProperty("checks").GetProperty("noDate").GetBoolean());
        foreach (var kind in new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" })
        {
            var report = ReportOf(data, kind);
            Assert.Equal(Day, report.GetProperty("from").GetString());
            Assert.Equal(Day, report.GetProperty("to").GetString());
            Assert.Equal(JsonValueKind.Null, report.GetProperty("value").ValueKind);
            Assert.Equal(0, report.GetProperty("columns").GetArrayLength());
        }
        Assert.Equal(new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" },
            uis.GetProperty("reports").EnumerateArray().Select(report => report.GetProperty("kind").GetString()));
    }

    [Fact(DisplayName = "AC-4210.3 답 칸 이름·차례는 비트 closing.day 답과 같고 끝에 source·uis가 더해진다(모르는 칸은 null)")]
    public void ShapeMatchesBit()
    {
        using var rig = new DayRig();
        rig.All();
        var data = Data(rig.Read(Usual()));
        var bit = Data(new Erp.Core.Closing.ClosingDayResult());

        Assert.Equal(Keys(bit).Concat(new[] { "source", "uis" }), Keys(data));
        Assert.Equal(Keys(bit.GetProperty("patients")), Keys(data.GetProperty("patients")));
        Assert.Equal(Keys(bit.GetProperty("money")), Keys(data.GetProperty("money")));
        Assert.Equal(Keys(bit.GetProperty("reservations")), Keys(data.GetProperty("reservations")));
        Assert.Equal(Keys(bit.GetProperty("warnings")), Keys(data.GetProperty("warnings")));
        Assert.Equal(Keys(Data(new Erp.Core.Closing.ClosingGroupCount())), Keys(data.GetProperty("groups")[0]));
        Assert.Equal(Keys(Data(new Erp.Core.Closing.ClosingAgeBand())), Keys(data.GetProperty("ages")[0]));
        foreach (var none in new[] { "inpatientVisits", "injection", "overlap" }) Assert.Equal(JsonValueKind.Null, data.GetProperty(none).ValueKind);
        var warnings = data.GetProperty("warnings");
        Assert.False(warnings.GetProperty("moneyUnconfirmed").GetBoolean());
        Assert.False(warnings.GetProperty("splitUnconfirmed").GetBoolean());
        Assert.Equal(0, warnings.GetProperty("unpaidVisits").GetInt64());
        Assert.False(warnings.GetProperty("noHistory").GetBoolean());
        Assert.Equal(
            new[] { "folder", "reports", "open", "deleted", "kept", "deleteFailed", "unknownFiles", "checks", "fractional", "negative", "reservations" },
            Keys(data.GetProperty("uis")));
        Assert.Equal(new[] { "kind", "state", "cached", "from", "to", "value", "columns" }, Keys(data.GetProperty("uis").GetProperty("reports")[0]));
    }

    [Fact(DisplayName = "AC-4210.3 groups는 args groups 차례 { 건수, 같은 key 매출 } 뒤에 sales에만 있는 key를 sales 차례로, 코드를 안 고른 묶음은 없음")]
    public void GroupOrder()
    {
        using var rig = new DayRig();
        rig.All();
        var data = Data(rig.Read(Args(
            new[] { G("eswtStd", "ES100"), G("carm", "ca100") },
            new[] { G("etc4", "PT100"), G("carm", "SO100"), G("eswt", "ES100", "ES200") })));

        Assert.Equal(new[] { "eswtStd", "carm", "etc4", "eswt" }, data.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("key").GetString()));
        Assert.Equal(5, N(Group(data, "eswtStd").GetProperty("patients")));
        Assert.Null(N(Group(data, "eswtStd").GetProperty("total")));
        Assert.Equal(4, N(Group(data, "carm").GetProperty("patients")));
        Assert.Equal(240_000, N(Group(data, "carm").GetProperty("total")));
        Assert.Null(N(Group(data, "etc4").GetProperty("patients")));
        Assert.Equal(63_200, N(Group(data, "etc4").GetProperty("total")));
        Assert.Equal(330_000, N(Group(data, "eswt").GetProperty("total")));
        // ptVisit 묶음이 없으면 물리치료내원 null, 재진 = 재진수
        Assert.Null(N(data.GetProperty("patients").GetProperty("ptVisit")));
        Assert.Equal(88, N(data.GetProperty("patients").GetProperty("return")));

        using var bare = new DayRig();
        bare.All();
        var empty = Data(bare.Read(Args()));
        Assert.Equal(0, empty.GetProperty("groups").GetArrayLength());
        Assert.Null(N(empty.GetProperty("patients").GetProperty("ptVisit")));
    }

    [Fact(DisplayName = "AC-4210.3 그날 처방이 없는 코드는 0, 한 코드가 두 묶음에 들면 묶음마다 더함")]
    public void AbsentCodeIsZero()
    {
        using var rig = new DayRig();
        rig.All();
        var data = Data(rig.Read(Args(
            new[] { G("ct", "NOPE1"), G("carm", "CA100", "NOPE2"), G("sono", "CA100") },
            new[] { G("arthro", "NOPE3") })));

        Assert.Equal(0, N(Group(data, "ct").GetProperty("patients")));
        Assert.Equal(4, N(Group(data, "carm").GetProperty("patients")));
        Assert.Equal(4, N(Group(data, "sono").GetProperty("patients")));
        Assert.Equal(0, N(Group(data, "arthro").GetProperty("total")));
    }

    [Fact(DisplayName = "AC-4206.3 물리치료내원 = ptVisit 코드 총투여량 합, 재진 = 재진수 − 물리치료내원, 0보다 작으면 null + negative 'return'")]
    public void ReturnMinusPtVisit()
    {
        using var rig = new DayRig();
        rig.All();
        var result = rig.Read(Args(new[] { G("ptVisit", "AA222", "PT100", "MM300", "CA100", "SO100", "KK090") }));
        var data = Data(result);
        DayKit.Dump("negativeReturn", Day, result);

        Assert.Equal(103, N(data.GetProperty("patients").GetProperty("ptVisit")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("return")));
        Assert.Equal(new[] { "return" }, Strings(data.GetProperty("uis").GetProperty("negative")));
        // 산정안함은 재진수(물리치료내원을 빼기 전)로 센다
        Assert.Equal(0, N(data.GetProperty("patients").GetProperty("noExamFee")));
    }

    [Fact(DisplayName = "AC-4206.3 ptVisit 코드 총투여량에 소수가 있으면 물리치료내원·재진 null + fractional 'ptVisit'")]
    public void FractionalPtVisit()
    {
        using var rig = new DayRig();
        rig.All();
        var data = Data(rig.Read(Args(new[] { G("ptVisit", "AA222", "LA357") })));

        Assert.Null(N(data.GetProperty("patients").GetProperty("ptVisit")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("return")));
        Assert.Equal(new[] { "ptVisit" }, Strings(data.GetProperty("uis").GetProperty("fractional")));
        Assert.Empty(Strings(data.GetProperty("uis").GetProperty("negative")));
    }

    [Fact(DisplayName = "AC-4207.4 진찰료 산정안함 = 환자 합계 − (초진수 + 재진수), 0보다 작으면 null + negative 'noExamFee', 위쪽 표가 없으면 아래쪽 표 줄 수")]
    public void NoExamFee()
    {
        using var rig = new DayRig();
        rig.Folder
            .Fixture(DayRig.Income, "income.xls")
            .Fixture(DayRig.Rx, "rx.xls")
            .Fixture(DayRig.VisitPatients, "visit-patients-no-date.xls")
            .Fixture(DayRig.Rsv, "rsv.xls")
            .Fixture(DayRig.RsvPatients, "rsv-patients.xls");
        var result = rig.Read(Usual());
        var data = Data(result);
        DayKit.Dump("negativeNoExamFee", Day, result);

        Assert.Equal("missing", State(data, "visits"));
        Assert.Equal(5, N(data.GetProperty("patients").GetProperty("total")));
        Assert.Null(N(data.GetProperty("patients").GetProperty("noExamFee")));
        Assert.Equal(new[] { "noExamFee" }, Strings(data.GetProperty("uis").GetProperty("negative")));
        // 조회일 라벨이 없는 아래쪽 표: 날짜는 보지 않고 noDate(경고만)
        Assert.Equal("ok", State(data, "visitPatients"));
        Assert.True(data.GetProperty("uis").GetProperty("checks").GetProperty("noDate").GetBoolean());
        Assert.Equal(JsonValueKind.Null, ReportOf(data, "visitPatients").GetProperty("from").ValueKind);

        // 모아 둔 값으로: 인원수 97 − (초진 9 + 재진 80) = 8
        using var other = new DayRig();
        other.Cache.Save(DayRig.Day, new UisFactsSet
        {
            Income = new IncomeFacts { First = 9, Return = 80, Headcount = 89 },
            Visits = new VisitsFacts { People = 97, New = 7 },
        });
        var cached = Data(other.Read(Args()));
        Assert.Equal(8, N(cached.GetProperty("patients").GetProperty("noExamFee")));
        Assert.Equal(80, N(cached.GetProperty("patients").GetProperty("return")));
        Assert.Equal(97, N(cached.GetProperty("patients").GetProperty("total")));
        Assert.Equal(7, N(cached.GetProperty("patients").GetProperty("new")));
    }

    [Fact(DisplayName = "AC-4210.3 음수·셀 수 없는 값은 null(답은 0 이상 정수 또는 null): 수입 음수, 묶음 합 음수, 맞춰 보기 음수, 소수는 decimal로 더해 1.0이면 1")]
    public void NegativeAndFractionalValues()
    {
        using var rig = new DayRig();
        rig.Cache.Save(DayRig.Day, new UisFactsSet
        {
            Income = new IncomeFacts
            {
                TotalFee = -5_000, Covered = 1_000, Insurer = 2_000, Received = -300, Noncovered = 500,
                First = 3, Return = 7, Headcount = 10, Cash = 100, Card = -400,
            },
            Rx = new RxFacts
            {
                Codes = new Dictionary<string, RxCode>(StringComparer.Ordinal)
                {
                    ["X1"] = new RxCode { Qty = 0.1, Amount = 10 },
                    ["X2"] = new RxCode { Qty = 0.2, Amount = 20 },
                    ["X3"] = new RxCode { Qty = 0.7, Amount = 30 },
                    ["NEG"] = new RxCode { Qty = -2, Amount = -500 },
                    ["BIG"] = new RxCode { Qty = 1e300, Amount = 1 },
                },
                TotalAmount = -440,
            },
        });
        var result = rig.Read(Args(
            new[] { G("carm", "X1", "X2", "X3"), G("sono", "NEG"), G("ct", "BIG"), G("ptVisit", "X1", "X2", "X3") },
            new[] { G("carm", "X1", "X2", "X3"), G("sono", "NEG") }));
        var data = Data(result);
        DayKit.Dump("negativeValues", Day, result);

        Assert.Equal(1, N(Group(data, "carm").GetProperty("patients")));
        Assert.Equal(60, N(Group(data, "carm").GetProperty("total")));
        Assert.Null(N(Group(data, "sono").GetProperty("patients")));
        Assert.Null(N(Group(data, "sono").GetProperty("total")));
        Assert.Null(N(Group(data, "ct").GetProperty("patients")));
        Assert.Empty(Strings(data.GetProperty("uis").GetProperty("fractional")));
        var money = data.GetProperty("money");
        Assert.Null(N(money.GetProperty("total")));
        Assert.Null(N(money.GetProperty("received")));
        Assert.Null(N(money.GetProperty("card")));
        Assert.Equal(100, N(money.GetProperty("cash")));
        Assert.Equal(2_000, N(money.GetProperty("insurer")));
        Assert.Equal(6, N(data.GetProperty("patients").GetProperty("return")));
        var checks = data.GetProperty("uis").GetProperty("checks");
        Assert.Equal(JsonValueKind.Null, checks.GetProperty("totalFee").ValueKind);
        Assert.Equal(JsonValueKind.Null, checks.GetProperty("received").ValueKind);
        Assert.Equal(JsonValueKind.Null, checks.GetProperty("rxTotal").ValueKind);
        Assert.Equal(JsonValueKind.Null, checks.GetProperty("headcount").ValueKind);
    }

    [Fact(DisplayName = "AC-4210.3 처방통계 칸 없음: '코드'면 처방 값 모두 null, '총투여량'이면 건수 묶음만, '총액'이면 매출 묶음만 null, 못 찾은 칸은 columns")]
    public void RxColumnsMissing()
    {
        UisDayResult With(string column)
        {
            using var rig = new DayRig();
            rig.Cache.Save(DayRig.Day, new UisFactsSet
            {
                Rx = new RxFacts
                {
                    Codes = new Dictionary<string, RxCode>(StringComparer.Ordinal) { ["CA100"] = new RxCode { Qty = 4, Amount = 220_000 } },
                    Columns = new[] { column },
                },
            });
            return rig.Read(Args(new[] { G("carm", "CA100"), G("ptVisit", "CA100") }, new[] { G("carm", "CA100") }));
        }

        var code = Data(With("코드"));
        Assert.Null(N(Group(code, "carm").GetProperty("patients")));
        Assert.Null(N(Group(code, "carm").GetProperty("total")));
        Assert.Null(N(code.GetProperty("patients").GetProperty("ptVisit")));
        Assert.Equal(new[] { "코드" }, Strings(ReportOf(code, "rx").GetProperty("columns")));

        var qty = Data(With("총투여량"));
        Assert.Null(N(Group(qty, "carm").GetProperty("patients")));
        Assert.Equal(220_000, N(Group(qty, "carm").GetProperty("total")));
        Assert.Null(N(qty.GetProperty("patients").GetProperty("ptVisit")));

        var amount = Data(With("총액"));
        Assert.Equal(4, N(Group(amount, "carm").GetProperty("patients")));
        Assert.Null(N(Group(amount, "carm").GetProperty("total")));
        Assert.Equal(4, N(amount.GetProperty("patients").GetProperty("ptVisit")));
    }

    [Fact(DisplayName = "AC-4210.3 맞춰 보기: 수입·처방·내원·예약이 다르면 [왼쪽, 오른쪽](경고만, 값은 채움)")]
    public void ChecksAreFilled()
    {
        using var rig = new DayRig();
        rig.Cache.Save(DayRig.Day, new UisFactsSet
        {
            Income = new IncomeFacts { TotalFee = 100, Covered = 60, Noncovered = 30, Received = 50, Cash = 20, Card = 20, First = 2, Return = 3, Headcount = 6 },
            Rx = new RxFacts
            {
                Codes = new Dictionary<string, RxCode>(StringComparer.Ordinal) { ["A1"] = new RxCode { Qty = 1, Amount = 70 } },
                TotalAmount = 75,
            },
            Visits = new VisitsFacts { People = 6, New = 1 },
            VisitPatients = new VisitPatientFacts { Rows = 5, NewRows = 2, HasDate = true },
            Rsv = new RsvFacts { Total = 4, Visited = 3 },
            RsvPatients = new RsvPatientFacts { Rows = 5, Visited = 2, DistinctCharts = 4, AllOnDay = true },
        });
        var data = Data(rig.Read(Args()));
        var checks = data.GetProperty("uis").GetProperty("checks");

        long[] Pair(string name) => checks.GetProperty(name).EnumerateArray().Select(item => item.GetInt64()).ToArray();
        Assert.Equal(new long[] { 100, 90 }, Pair("totalFee"));
        Assert.Equal(new long[] { 50, 40 }, Pair("received"));
        Assert.Equal(new long[] { 6, 5 }, Pair("headcount"));
        Assert.Equal(new long[] { 75, 70 }, Pair("rxTotal"));
        Assert.Equal(new long[] { 5, 6 }, Pair("visitRows"));
        Assert.Equal(new long[] { 2, 1 }, Pair("visitNew"));
        Assert.Equal(new long[] { 5, 4 }, Pair("rsvRows"));
        Assert.Equal(new long[] { 2, 3 }, Pair("rsvVisited"));
        Assert.Equal(100, N(data.GetProperty("money").GetProperty("total")));
        Assert.Equal(1, N(data.GetProperty("patients").GetProperty("new")));
        Assert.Equal(4, N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Equal(4, data.GetProperty("uis").GetProperty("reservations").GetProperty("total").GetInt64());
    }

    // ---- 모아 둔 값 합치기(AC-4210.4) ----------------------------------------------------------------------

    [Fact(DisplayName = "AC-4210.4 같은 날 두 번째에 파일이 없으면 모아 둔 값(cached), 처방통계는 코드별 합이라 설정 코드를 바꿔도 다시 센다")]
    public void CachedSecondRead()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Read(Usual());

        rig.NewFolder();
        var result = rig.Read(Args(new[] { G("carm", "CA100", "SO100"), G("ptVisit", "AA222") }, new[] { G("manual", "MM300") }));
        var data = Data(result);
        DayKit.Dump("cached", Day, result);

        foreach (var kind in new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" })
        {
            Assert.Equal("ok", State(data, kind));
            Assert.True(Cached(data, kind), kind);
            Assert.Equal(Day, ReportOf(data, kind).GetProperty("from").GetString());
        }
        Assert.Equal(10, N(Group(data, "carm").GetProperty("patients")));
        Assert.Equal(600_000, N(Group(data, "manual").GetProperty("total")));
        Assert.Equal(57, N(data.GetProperty("patients").GetProperty("return")));
        Assert.Equal(5_182_300, N(data.GetProperty("money").GetProperty("total")));
        Assert.Equal(31, N(data.GetProperty("reservations").GetProperty("patients")));
        Assert.Equal(3, data.GetProperty("warnings").GetProperty("unknownAge").GetInt64());
        Assert.Equal(0, data.GetProperty("uis").GetProperty("deleted").GetInt32());
    }

    [Fact(DisplayName = "AC-4210.4 앞서 읽은 보고서는 모아 둔 값, 이번에 새로 읽은 것은 새 값(cached false), 둘 다 없으면 missing")]
    public void CachedAndFreshTogether()
    {
        using var rig = new DayRig();
        rig.Folder.Fixture(DayRig.Income, "income.xls").Fixture(DayRig.Rx, "rx.xls");
        rig.Read(Usual());

        rig.NewFolder().Fixture(DayRig.VisitPatients, "visit-patients.xls").Fixture(DayRig.RsvPatients, "rsv-patients.xls");
        var data = Data(rig.Read(Usual()));

        Assert.True(Cached(data, "income"));
        Assert.True(Cached(data, "rx"));
        Assert.Equal("ok", State(data, "visitPatients"));
        Assert.False(Cached(data, "visitPatients"));
        Assert.Equal("missing", State(data, "visits"));
        Assert.Equal("missing", State(data, "rsv"));
        Assert.Equal(57, N(data.GetProperty("patients").GetProperty("return")));
        Assert.Equal(97, N(data.GetProperty("patients").GetProperty("total")));
        Assert.Equal(7, N(data.GetProperty("patients").GetProperty("new")));
        Assert.Equal(32, data.GetProperty("uis").GetProperty("reservations").GetProperty("total").GetInt64());
    }

    [Fact(DisplayName = "AC-4210.4 새로 읽은 ok 보고서는 모아 둔 값을 바꾸고, 날짜 다른 엑셀(otherDate)은 모아 둔 값을 쓰지 않음")]
    public void FreshReplacesCache()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Read(Usual());

        rig.NewFolder();
        rig.Made(DayRig.Income, Sheet(
            Row("[조 회 일]", "2026-11-23 ~ 2026-11-23"),
            IncomeHeader.Select(name => C(name)).ToArray(),
            Row("합계", 1_000, 600, 500, 900, 400, 2, 8, 10, 300, 600)));
        var fresh = Data(rig.Read(Usual()));
        Assert.False(Cached(fresh, "income"));
        Assert.Equal(1_000, N(fresh.GetProperty("money").GetProperty("total")));

        rig.NewFolder();
        var again = Data(rig.Read(Usual()));
        Assert.True(Cached(again, "income"));
        Assert.Equal(1_000, N(again.GetProperty("money").GetProperty("total")));

        rig.NewFolder().Fixture(DayRig.Income, "income-other-date.xls");
        var other = Data(rig.Read(Usual()));
        Assert.Equal("otherDate", State(other, "income"));
        Assert.False(Cached(other, "income"));
        Assert.Null(N(other.GetProperty("money").GetProperty("total")));
        Assert.True(Cached(other, "rx"));
    }

    [Fact(DisplayName = "AC-4210.4 다른 날짜를 읽으면 앞 날짜 모아 둔 값은 버림, 24시간이 지났거나 풀 수 없는 값은 쓰지 않음")]
    public void CacheIsDroppedOrExpired()
    {
        using (var rig = new DayRig())
        {
            rig.All();
            rig.Read(Usual());
            rig.NewFolder();
            var otherDay = Data(rig.Read(Usual(), new DateTime(2026, 11, 22)));
            Assert.Equal("2026-11-22", otherDay.GetProperty("date").GetString());
            Assert.Equal("missing", State(otherDay, "income"));
            var back = Data(rig.Read(Usual()));
            Assert.Equal("missing", State(back, "income"));
            Assert.Equal("missing", State(back, "rsvPatients"));
        }

        using (var rig = new DayRig())
        {
            rig.All();
            rig.Read(Usual());
            rig.NewFolder();
            rig.Now = rig.Now.AddHours(23);
            Assert.True(Cached(Data(rig.Read(Usual())), "income"));
            rig.Now = rig.Now.AddHours(1).AddMinutes(1);
            Assert.Equal("missing", State(Data(rig.Read(Usual())), "income"));
        }

        using (var rig = new DayRig())
        {
            rig.All();
            rig.Read(Usual());
            File.WriteAllBytes(rig.Cache.FilePath, new byte[] { 1, 2, 3, 4, 5 });
            rig.NewFolder();
            var broken = Data(rig.Read(Usual()));
            Assert.Equal("missing", State(broken, "income"));
            Assert.Empty(rig.Notes);
        }
    }

    [Fact(DisplayName = "AC-4210.4 모아 둔 값을 못 쓰면 오류 없이 답하고 기록용 번호 E-UIS-CACHE 하나만 남김")]
    public void CacheSaveFailureIsNoted()
    {
        using var rig = new DayRig();
        var blocker = rig.Temp.Write("not-a-folder", "x");
        rig.Cache = new UisCache(blocker, rig.Protector, () => rig.Now);
        rig.All();
        var data = Data(rig.Read(Usual()));

        Assert.Equal("ok", State(data, "income"));
        Assert.Equal(new[] { "E-UIS-CACHE" }, rig.Notes);
    }

    [Fact(DisplayName = "AC-4210.4 모아 둔 값 파일은 숫자·칸 이름·처방 코드뿐(환자 표시 글자·파일 이름 없음)이고 보호해 씀")]
    public void CacheHoldsNumbersOnly()
    {
        using var rig = new DayRig();
        rig.All();
        rig.Read(Usual());

        var plain = rig.CachePlain();
        Assert.Contains("AA222", plain);
        Assert.Contains("\"day\":\"2026-11-23\"", plain);
        DayKit.NoMarkers(plain, "모아 둔 값");
        Assert.DoesNotContain("통계-", plain);
        Assert.DoesNotContain("AA222", System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(rig.Cache.FilePath)));
    }
}
