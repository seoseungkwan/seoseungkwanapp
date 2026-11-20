using System;
using Precheck.Core.InjectionMemo;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>spec injection-memo AC-7503.3 알림 글(시안 docs/mockups/injection-memo/notes.md '화면 글자' 그대로)과 환자 값을 남기지 않음.</summary>
public class MemoNoticesTests
{
    [Fact(DisplayName = "AC-7503.3 알림 글은 시안 그대로: 넣었음·기록 없음·끝남·일찍 옴·이미 있음·환자 없음·읽기 실패")]
    public void NoticeTexts()
    {
        Assert.Equal("넣었어요: 오)무릎 3차", MemoNotices.Of(new MemoResult(MemoResultKind.Insert, "오)무릎 3차")));
        Assert.Equal("최근 30일 안에 주사 차수 기록이 없어요.", MemoNotices.Of(new MemoResult(MemoResultKind.NoRecord)));
        Assert.Equal("계획한 주사가 끝났어요(5차까지). 넣지 않았어요.", MemoNotices.Of(new MemoResult(MemoResultKind.Finished, untilNumber: 5)));
        Assert.Equal("주사 날이 아닐 수 있어요(계획 11월 27일). 넣지 않았어요.", MemoNotices.Of(new MemoResult(MemoResultKind.TooEarly, plannedDate: Day(11, 27))));
        Assert.Equal("메모에 주사 차수가 이미 있어요.", MemoNotices.Of(new MemoResult(MemoResultKind.AlreadyHas)));
        Assert.Equal("접수 화면에 환자를 먼저 불러와 주세요.", MemoNotices.Of(new MemoResult(MemoResultKind.NoPatient)));
        Assert.Equal("비트에서 기록을 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.", MemoNotices.Of(new MemoResult(MemoResultKind.Failed)));
    }

    [Fact(DisplayName = "AC-7505.4 [엑스레이] 알림 글은 시안 그대로: 넣음 초록, 경과 없음·이미 있음 노랑")]
    public void XrayNotices()
    {
        Assert.Equal("넣었어요: 무릎 xr1년경과 허리 xr2년경과", MemoNotices.Of(new MemoResult(MemoResultKind.Insert, "무릎 xr1년경과 허리 xr2년경과")));
        Assert.Equal("엑스레이 경과된 부위가 없어요.", MemoNotices.Of(new MemoResult(MemoResultKind.XrayNone)));
        Assert.Equal("메모에 엑스레이가 이미 있어요.", MemoNotices.Of(new MemoResult(MemoResultKind.XrayAlreadyHas)));
        Assert.Equal("엑스레이 경과된 부위가 없어요.", MemoNotices.XrayNone);
        Assert.Equal("메모에 엑스레이가 이미 있어요.", MemoNotices.XrayAlreadyHas);
    }

    [Fact(DisplayName = "AC-7503.3 계획 날짜는 'M월 D일'(앞 0 없음), 넣은 글 알림에는 '/' 없이 새 글만")]
    public void NoticeDetails()
    {
        Assert.Equal("주사 날이 아닐 수 있어요(계획 12월 4일). 넣지 않았어요.", MemoNotices.Of(new MemoResult(MemoResultKind.TooEarly, plannedDate: new DateTime(2026, 12, 4))));
        Assert.Equal("넣었어요: 오)무릎 3차", MemoNotices.Of(new MemoResult(MemoResultKind.Insert, "오)무릎 3차", append: "/오)무릎 3차")));
        Assert.Equal("비트에서 기록을 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.", MemoNotices.Of(null));
    }

    [Fact(DisplayName = "AC-7503.3 시안에 없는 글은 내지 않는다: 계획 날짜 없는 일찍 옴(규칙상 안 나옴)은 읽기 실패 글")]
    public void TooEarlyWithoutDateIsFailed()
    {
        Assert.Equal("비트에서 기록을 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.", MemoNotices.Of(new MemoResult(MemoResultKind.TooEarly)));
        Assert.Equal(MemoNotices.Failed, MemoNotices.Of(new MemoResult(MemoResultKind.TooEarly, plannedDate: null)));
    }

    [Fact(DisplayName = "AC-7503.3 규칙 결과에서 고른 알림: 끝남은 계획 끝 번호, 일찍 옴은 계획 날짜")]
    public void NoticesFromRule()
    {
        Assert.Equal("계획한 주사가 끝났어요(3차까지). 넣지 않았어요.", MemoNotices.Of(Decide(Lines(7, "오)무릎 3차", "Rt. knee OA|1주간격 3차까지 주사합니다"))));
        Assert.Equal("주사 날이 아닐 수 있어요(계획 11월 25일). 넣지 않았어요.", MemoNotices.Of(Decide(Lines(2, "", "Rt. knee OA|1주뒤 2차 주사"))));
        Assert.Equal("넣었어요: 오)무릎 3차", MemoNotices.Of(Decide(Lines(7, "", "오른쪽 무릎 2차 주사 + FNB"))));
    }

    [Fact(DisplayName = "AC-7503.3 넣지 못함(칸이 꽉 참·잠김·윈도우가 막음) 알림은 시안 그대로 넣을 글을 붙인다('/' 없는 새 글)")]
    public void TypeFailedText()
    {
        Assert.Equal("메모 칸에 넣지 못했어요. 직접 적어 주세요: 오)무릎 3차", MemoNotices.TypeFailed("오)무릎 3차"));
        var inserted = new MemoResult(MemoResultKind.Insert, "왼)어깨 2차", append: "/왼)어깨 2차");
        Assert.Equal("메모 칸에 넣지 못했어요. 직접 적어 주세요: 왼)어깨 2차", MemoNotices.TypeFailed(inserted.Text));
        Assert.Equal("메모 칸에 넣지 못했어요. 직접 적어 주세요: ", MemoNotices.TypeFailed(null));
    }

    [Fact(DisplayName = "AC-7503.3 결과·내원 기록을 글로 바꿔도(로그에 찍혀도) 환자 글·메모가 나오지 않는다")]
    public void NoPatientTextInToString()
    {
        var note = Visit(3, "오)무릎 2차", "오른쪽 무릎 2차 주사");
        Assert.DoesNotContain("무릎", note.ToString());
        var result = new MemoResult(MemoResultKind.Insert, "오)무릎 3차", append: "/오)무릎 3차");
        Assert.DoesNotContain("무릎", result.ToString());
    }

    [Fact(DisplayName = "AC-7503.3 넣지 않는 결과는 넣을 글이 비어 있다")]
    public void NonInsertHasNoText()
    {
        foreach (MemoResultKind kind in Enum.GetValues(typeof(MemoResultKind)))
        {
            if (kind == MemoResultKind.Insert) continue;
            var result = new MemoResult(kind, "오)무릎 3차", append: "/오)무릎 3차");
            Assert.Equal("", result.Text);
            Assert.Equal("", result.Append);
        }
    }
}
