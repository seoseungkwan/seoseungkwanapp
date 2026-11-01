using System;
using System.Linq;
using Precheck.Core.Input;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>원본 UChartAutomation·autoOne에서 옮긴 판단 규칙. 문구는 원본 그대로다(AC-017.6 건너뜀 이유, AC-017.5 fatal).</summary>
public class ChartRulesTests
{
    [Theory(DisplayName = "AC-017.3 환자 같은지: 차트번호는 숫자만, 이름은 앞뒤 공백을 떼고 같아야 한다(원본 SamePatient)")]
    [InlineData("900001", "가상환자01", "900001", "가상환자01", true)]
    [InlineData(" 900001 ", " 가상환자01 ", "900001", "가상환자01", true)]
    [InlineData("90-00-01", "가상환자01", "900001", "가상환자01", true)]
    [InlineData("900002", "가상환자01", "900001", "가상환자01", false)]
    [InlineData("900001", "가상환자02", "900001", "가상환자01", false)]
    [InlineData("", "가상환자01", "", "가상환자01", false)]
    [InlineData("900001", "  ", "900001", "  ", false)]
    public void SamePatient(string chart, string name, string expChart, string expName, bool same) =>
        Assert.Equal(same, ChartRules.SamePatient(chart, name, expChart, expName));

    [Fact(DisplayName = "AC-017.3 화면 환자 읽기: 이름 칸과 창 제목이 다르면 오류, 이름 칸이 비면 제목 이름, 칸이 비면 원본 문구(ReadIdentity)")]
    public void Identity()
    {
        var ok = ChartRules.Identity(" 900001 ", "가상환자01", "외래진료실 ( 가상환자01 환자정보 )");
        Assert.Equal(("900001", "가상환자01", (string?)null), (ok.Chart, ok.Name, ok.Error));
        Assert.Equal("가상환자01", ChartRules.Identity("900001", "", "외래진료실 (가상환자01 환자정보)").Name);
        Assert.Equal("U차트 화면의 환자명과 창 제목의 환자명이 다릅니다", ChartRules.Identity("900001", "가상환자01", "외래진료실 (가상환자02 환자정보)").Error);
        Assert.Equal("U차트 차트번호 칸이 비어 있습니다", ChartRules.Identity("", "가상환자01", "외래진료실").Error);
        Assert.Equal("U차트 환자명을 읽지 못했습니다", ChartRules.Identity("900001", "", "외래진료실").Error);
        Assert.Null(ChartRules.Identity("900001", "가상환자01", "외래진료실").Error);
    }

    [Fact(DisplayName = "AC-017.3 내원내역 조회 기간: dtpFrom·dtpTo 글자, 못 읽으면 창 제목의 날짜(원본 range_bridge ReadListFilter 문구 그대로)")]
    public void ListPeriod()
    {
        var both = ChartRules.ListPeriod("2026-10-27", "2026-10-29", "내원내역");
        Assert.Equal(("2026-10-27", "2026-10-29", (string?)null), (both.From, both.To, both.Error));
        var oneTitle = ChartRules.ListPeriod(null, null, "내원내역 2026-10-27 - 3명");
        Assert.Equal(("2026-10-27", "2026-10-27", (string?)null), (oneTitle.From, oneTitle.To, oneTitle.Error));
        var twoTitle = ChartRules.ListPeriod("2026년", null, "내원내역 2026-10-27 ~ 2026-10-29 - 3명");
        Assert.Equal(("2026-10-27", "2026-10-29", (string?)null), (twoTitle.From, twoTitle.To, twoTitle.Error));
        Assert.Equal("내원내역 조회 기간을 읽지 못했습니다", ChartRules.ListPeriod(null, null, "내원내역").Error);
        Assert.Equal("내원내역 기간의 시작일이 종료일보다 늦습니다", ChartRules.ListPeriod("2026-10-29", "2026-10-27", "내원내역").Error);
    }

    [Fact(DisplayName = "AC-017.3 묶음 기간이 내원내역 기간 안인가: 원본 runAutoRange의 시작 전 확인 문구 그대로, 처방코드 칸은 비어 있어야 한다")]
    public void BatchPeriod()
    {
        var items = new[] { Sample.Item(1, date: "2026-10-27"), Sample.Item(2, date: "2026-10-29") };
        Assert.Null(ChartRules.ListProblem(new ListFilter("2026-10-27", "2026-10-29", "", false, null), items));
        Assert.Null(ChartRules.ListProblem(new ListFilter("2026-10-01", "2026-10-31", null, null, null), items));
        Assert.StartsWith("U차트 내원내역 창의 조회 기간을 읽지 못했습니다.", ChartRules.ListProblem(new ListFilter(null, null, null, null, "내원내역 조회 기간을 읽지 못했습니다"), items), StringComparison.Ordinal);
        var narrow = ChartRules.ListProblem(new ListFilter("2026-10-28", "2026-10-29", "", false, null), items);
        Assert.StartsWith("기간이 다릅니다.", narrow, StringComparison.Ordinal);
        Assert.Contains("U차트 내원내역: 2026-10-28 ~ 2026-10-29", narrow, StringComparison.Ordinal);
        Assert.StartsWith("기간이 다릅니다.", ChartRules.ListProblem(new ListFilter("2026-10-27", "2026-10-28", "", false, null), items), StringComparison.Ordinal);
        Assert.Contains("처방코드 칸(LA358)", ChartRules.ListProblem(new ListFilter("2026-10-27", "2026-10-29", " LA358 ", false, null), items), StringComparison.Ordinal);
    }

    [Theory(DisplayName = "AC-017.3 글자에서 날짜 하나 꺼내기(원본 DateOf)")]
    [InlineData("2026-10-27", "2026-10-27")]
    [InlineData("진료일 2026-10-27 (화)", "2026-10-27")]
    [InlineData("2026년 10월 27일", null)]
    [InlineData("", null)]
    public void DateOf(string text, string? date) => Assert.Equal(date, ChartRules.DateOf(text));

    [Theory(DisplayName = "AC-017.3 검색 결과 수는 내원내역 제목의 '- N명'(CountRx)")]
    [InlineData("내원내역 2026-10-27 - 3명", 3)]
    [InlineData("내원내역 2026-10-27 -12 명", 12)]
    [InlineData("내원내역 2026-10-27 - 0명", 0)]
    public void SearchCount(string title, int count) => Assert.Equal(count, ChartRules.SearchCount(title));

    [Fact(DisplayName = "AC-017.3 검색 결과 수를 못 읽으면 null")]
    public void SearchCountMissing() => Assert.Null(ChartRules.SearchCount("내원내역 2026-10-27"));

    [Theory(DisplayName = "AC-017.3 검색 종류가 차트번호인가: 글자·숫자만 남겨 '트번호'를 찾는다(원본 IsChartMode)")]
    [InlineData("차트번호", true)]
    [InlineData(" 차트 번호 ", true)]
    [InlineData("이름", false)]
    [InlineData("", false)]
    public void ChartMode(string text, bool mode) => Assert.Equal(mode, ChartRules.IsChartMode(text));

    [Fact(DisplayName = "AC-017.3 목록 첫 줄 위치: DPI 비율로 x=150, y=27, 목록이 작으면 못 씀(원본 range_bridge OpenPatientRange)")]
    public void FirstRow()
    {
        var first = ChartRules.FirstRowPoint(100, 200, 1000, 96);
        Assert.Equal((250, 227, false), (first.X, first.Y, first.TooSmall));
        var scaled = ChartRules.FirstRowPoint(100, 200, 1000, 192);
        Assert.Equal((400, 254, false), (scaled.X, scaled.Y, scaled.TooSmall));
        Assert.True(ChartRules.FirstRowPoint(100, 200, 230, 96).TooSmall);
        Assert.Equal(250, ChartRules.FirstRowPoint(100, 200, 1000, 0).X);
    }

    [Theory(DisplayName = "AC-017.3 한 화면에 다 보이는 줄 수: (높이/비율-19-17-6)/17 - 1, 적어도 1(원본 fullyVisible)")]
    [InlineData(0, 400, 96, 20)]
    [InlineData(0, 800, 192, 20)]
    [InlineData(0, 30, 96, 1)]
    public void FullyVisible(int top, int bottom, int dpi, int rows) => Assert.Equal(rows, ChartRules.FullyVisibleRows(top, bottom, (uint)dpi));

    [Theory(DisplayName = "AC-017.5 저장 안 한 처방 창 글: 공백을 빼고 '저장되지않은처방'(원본 SecurityTests 사례)")]
    [InlineData(true, "저장되지 않은 처방이 있습니다", "확인")]
    [InlineData(true, "저장되지\r\n않은\t처방")]
    [InlineData(false, "합성 일반 알림")]
    public void UnsavedRx(bool expected, params string[] labels) => Assert.Equal(expected, ChartRules.ContainsUnsavedPrescription(labels));

    [Theory(DisplayName = "AC-017.5 환자 열기 실패 중 원본 fatal 문구와 키보드 초점 잃음이면 멈춘다(autoOne의 정규식 + 키보드 초점)")]
    [InlineData("U차트 외래진료실 창을 찾지 못했습니다. U차트 본 화면이 열려 있는지 확인해 주세요.")]
    [InlineData("U차트 내원내역 창이 열려 있지 않습니다")]
    [InlineData("U차트 내원내역 창이 최소화되어 있습니다. 화면에 띄워 주세요.")]
    [InlineData("U차트 내원내역 목록이 다른 창에 가려져 있습니다. 목록이 보이게 해 주세요.")]
    [InlineData("U차트 내원내역 기간(2026-10-27 ~ 2026-10-29) 밖의 내원일(2026-10-30)입니다. 내원내역 기간을 맞춰 주세요.")]
    [InlineData("내원내역 조회 기간을 읽지 못했습니다")]
    [InlineData("내원내역 기간의 시작일이 종료일보다 늦습니다")]
    [InlineData("내원내역 검색 종류를 '차트번호'로 맞추지 못했습니다.")]
    [InlineData("내원내역 창에서 칸을 찾지 못했습니다: cbSch")]
    [InlineData("U차트 내원내역 목록에 키보드 초점을 맞추지 못해 멈췄습니다. 비트 화면을 확인해 주세요.")]
    [InlineData("환자 열기를 중단했습니다. 비트의 확인 창이나 미저장 처방을 직접 확인한 뒤 다시 실행해 주세요.")]
    public void Fatal(string message) => Assert.True(ChartRules.IsFatalOpenMessage(message));

    [Theory(DisplayName = "AC-017.6 fatal이 아닌 환자 열기 실패는 그 사람만 건너뜀(원본 문구)")]
    [InlineData("검색 결과 수를 읽지 못했습니다.")]
    [InlineData("U차트 내원내역에서 이 환자의 내원을 찾지 못했습니다. 처방코드·상병 검색 조건을 확인해 주세요.")]
    [InlineData("검색된 3줄을 모두 열어봤지만 2026-10-27 내원이 아니었습니다 (열린 진료일: 2026-10-28). 직접 확인해 주세요.")]
    [InlineData("검색된 9줄 중 4줄을 열어봤지만 시간이 오래 걸려 멈췄습니다(2026-10-27 내원 못 찾음). 입력할 날이 모두 들어가게 내원내역 시작일·종료일을 좁히거나, 이 환자만 직접 입력해 주세요.")]
    [InlineData("U차트에서 환자가 열리기를 기다리다 시간이 지났습니다.")]
    public void NotFatal(string message) => Assert.False(ChartRules.IsFatalOpenMessage(message));

    [Theory(DisplayName = "AC-017.5 그 환자만의 사정(줄 많음·줄을 다 열어봄·내원일 없음)은 3번 잇따른 실패에 세지 않는다(nmPatientSkip 그대로)")]
    [InlineData("검색 결과가 12줄이라 자동으로 고를 수 없습니다.", true)]
    [InlineData("검색된 9줄 중 4줄을 열어봤지만 시간이 오래 걸려 멈췄습니다(2026-10-27 내원 못 찾음).", true)]
    [InlineData("검색된 줄을 모두 열어봤지만 이 환자가 아니었습니다. 직접 열어 주세요.", true)]
    [InlineData("줄을 열어봤지만 없었습니다", true)]
    [InlineData("내원일 없음", true)]
    [InlineData("환자 불일치 - 자동입력을 중단했습니다.", false)]
    [InlineData("검색 결과 수를 읽지 못했습니다.", false)]
    public void PatientSkip(string message, bool skip) => Assert.Equal(skip, ChartRules.IsPatientSkip(message));

    [Fact(DisplayName = "AC-017.3 쓰기 전후 대조는 원본 Same: 줄바꿈과 앞뒤 공백만 무시, 윈도우 줄바꿈으로 쓴다(ToWin)")]
    public void SameAndToWin()
    {
        Assert.True(ChartRules.Same("가짜\r\n메모", "가짜\n메모"));
        Assert.True(ChartRules.Same(" 가짜 메모\r\n", "가짜 메모"));
        Assert.False(ChartRules.Same("가짜  메모", "가짜 메모"));
        Assert.False(ChartRules.Same(null, "가짜 메모"));
        Assert.Equal("가짜\r\n메모\r\n끝", ChartRules.ToWin("가짜\n메모\r\n끝"));
    }

    [Fact(DisplayName = "AC-017.3 이름·차트번호·내원일 검사는 열린 내원의 진료일(dtpWorkDate)로(원본 CheckRange 문구 그대로)")]
    public void CheckFailure()
    {
        const string chart = "900001", name = "가상환자01", date = "2026-10-27";
        Assert.Null(ChartRules.CheckFailure(new ChartRead(true, chart, name, null, date, null), chart, name, date));
        Assert.Equal("등록된 병원 프로그램의 입력 위치를 확인하지 못했습니다.", ChartRules.CheckFailure(new ChartRead(false, chart, name, null, date, null), chart, name, date));
        Assert.Equal("환자 불일치 - 자동입력을 중단했습니다. (U차트 차트번호 칸이 비어 있습니다)", ChartRules.CheckFailure(new ChartRead(true, "", name, "U차트 차트번호 칸이 비어 있습니다", date, null), chart, name, date));
        Assert.Equal("환자 불일치 - 자동입력을 중단했습니다.", ChartRules.CheckFailure(new ChartRead(true, "900002", name, null, date, null), chart, name, date));
        Assert.Equal("환자 불일치 - 자동입력을 중단했습니다.", ChartRules.CheckFailure(new ChartRead(true, chart, "가상환자02", null, date, null), chart, name, date));
        Assert.Equal("진료일 확인 불가 - 자동입력을 중단했습니다. (외래진료실 진료일을 읽지 못했습니다)", ChartRules.CheckFailure(new ChartRead(true, chart, name, null, null, "외래진료실 진료일을 읽지 못했습니다"), chart, name, date));
        Assert.Equal("진료일 불일치 - 열린 내원(2026-10-28)이 입력할 내원(2026-10-27)과 다릅니다.", ChartRules.CheckFailure(new ChartRead(true, chart, name, null, "2026-10-28", null), chart, name, date));
    }

    [Fact(DisplayName = "AC-017.4 지문: 정확히 하나면 그것, 여럿이면 보이는 것의 수(원본 Locate의 Pick), 칸 목록은 ID 이름 그대로")]
    public void Fingerprint()
    {
        Assert.Equal(new[] { "txtChtNum", "lbPatName", "txtBilCmt", "btnBilCmtModify" }, UiFingerprint.Outpatient);
        Assert.Equal(new[] { "cbSch", "txtSch", "btnSch", "ctgMain" }, UiFingerprint.Visits);
        Assert.Equal("BITDoctorOrder.exe", UiFingerprint.Process);
        // 명세의 8칸 + 프로세스·창 둘 + 여러 날 입력이 쓰는 진료일 칸(원본 range_bridge ID_WORK_DATE)
        Assert.Equal("dtpWorkDate", UiFingerprint.WorkDate);
        Assert.Contains("dtpWorkDate", UiFingerprint.All);
        Assert.Equal(12, UiFingerprint.All.Count);
        Assert.Equal(0, UiFingerprint.Resolve(0, 0));
        Assert.Equal(1, UiFingerprint.Resolve(1, 0));
        Assert.Equal(1, UiFingerprint.Resolve(1, 1));
        Assert.Equal(1, UiFingerprint.Resolve(2, 1));
        Assert.Equal(0, UiFingerprint.Resolve(2, 0));
        Assert.Equal(2, UiFingerprint.Resolve(3, 2));

        Assert.True(Sample.AllFound().Ok);
        Assert.Empty(Sample.AllFound().Problems);
        var changed = Sample.With(("txtBilCmt", 0), ("cbSch", 2));
        Assert.False(changed.Ok);
        Assert.Equal(new[] { "txtBilCmt", "cbSch" }, changed.Problems);
        // 표에 없는 이름은 없는 것으로 본다
        Assert.Equal(UiFingerprint.All, new FingerprintResult(new System.Collections.Generic.Dictionary<string, int>()).Problems);
    }
}
