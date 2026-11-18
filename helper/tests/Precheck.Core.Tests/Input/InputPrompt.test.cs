using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Input;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>AC-017.2 PC 확인 창 글: 묶음·등록 값에서 도우미가 직접 만든다. 웹이 보낸 글·이름·차트번호·메모는 없다.</summary>
public class InputPromptTests
{
    private static List<InputItem> Span(int count, string first, string last)
    {
        var items = Sample.Items(count);
        items[0] = Sample.Item(1, date: first);
        items[count - 1] = Sample.Item(count, date: last);
        return items;
    }

    [Fact(DisplayName = "AC-017.2 '10/27~10/29, 32명 입력할까요?'와 뒤 4자리를 가린 기관기호")]
    public void Period()
    {
        var text = InputPrompt.Build(Span(32, "2026-10-27", "2026-10-29"), Sample.Registration);
        Assert.Contains("10/27~10/29, 32명 입력할까요?", text, StringComparison.Ordinal);
        Assert.Contains("기관기호 1234****", text, StringComparison.Ordinal);
        Assert.DoesNotContain(Synthetic.Institution, text, StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-017.2 날짜 차례가 뒤섞여도 처음~끝, 하루면 그 날짜 하나, 해를 넘기면 연도까지")]
    public void Dates()
    {
        Assert.Contains("10/27~10/29, 3명", InputPrompt.Build(new[] { Sample.Item(1, date: "2026-10-29"), Sample.Item(2, date: "2026-10-27"), Sample.Item(3, date: "2026-10-28") }, Sample.Registration), StringComparison.Ordinal);
        Assert.Contains("10/27, 2명 입력할까요?", InputPrompt.Build(Sample.Items(2), Sample.Registration), StringComparison.Ordinal);
        Assert.Contains("2026/12/30~2027/01/02, 2명", InputPrompt.Build(new[] { Sample.Item(1, date: "2026-12-30"), Sample.Item(2, date: "2027-01-02") }, Sample.Registration), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-017.2 창 글에 이름·차트번호·메모·진료 키·병원 범위가 없다")]
    public void NoPatientText()
    {
        var item = Sample.Item(1, memo: "가짜 메모 글자", visitKey: "visit-key-1");
        var text = InputPrompt.Build(new[] { item }, Sample.Registration);
        foreach (var forbidden in new[] { item.Name, item.Chart, item.Memo, item.VisitKey, Synthetic.Scope })
        {
            Assert.DoesNotContain(forbidden, text, StringComparison.Ordinal);
        }
    }

    [Fact(DisplayName = "AC-017.2 목업 화면 5: 질문·주의가 있고, 빼는 환자는 0명이면 줄이 없다")]
    public void Mockup()
    {
        var plain = InputPrompt.Build(Sample.Items(1), Sample.Registration);
        Assert.StartsWith("비트에 청구메모를 입력할까요?", plain, StringComparison.Ordinal);
        Assert.Contains("입력하는 동안 마우스와 키보드를 쓰지 마세요.", plain, StringComparison.Ordinal);
        // 원본 runAutoRange 확인 글의 주의: 내원내역 기간·미저장 작업·열린 내원의 진료일
        Assert.Contains("내원내역", plain, StringComparison.Ordinal);
        Assert.Contains("기간", plain, StringComparison.Ordinal);
        Assert.Contains("저장", plain, StringComparison.Ordinal);
        Assert.DoesNotContain("빼는 환자", plain, StringComparison.Ordinal);
        Assert.Contains("빼는 환자 3명", InputPrompt.Build(Sample.Items(1), Sample.Registration, 3), StringComparison.Ordinal);
    }

    // AC-6611.5 뒤에 붙이기(clinic-profile, 도우미 0.12.0)

    private const string AppendLine = "다른 메모 뒤에 붙이는 환자 ";

    private static InputItem Appending(int n, string appends, bool checkedByHand = false)
    {
        var item = Sample.Item(n, checkedByHand: checkedByHand);
        return new InputItem(item.VisitKey, item.Chart, item.Name, item.Date, item.Memo, item.CheckedByHand, null, appends);
    }

    [Fact(DisplayName = "AC-6611.5 appends가 있는 환자 수만큼 '다른 메모 뒤에 붙이는 환자 {N}명' 줄, 바꾸는 환자 줄 바로 다음이고 0명이면 줄이 없다")]
    public void AppendCountLine()
    {
        var items = new List<InputItem>
        {
            Appending(1, "직원이 쓴 첫 메모"),
            Sample.Item(2, replaces: "직원이 쓴 다른 메모"),
            Appending(3, "직원이 쓴 셋째 메모"),
            Sample.Item(4),
        };

        var text = InputPrompt.Build(items, Sample.Registration);

        Assert.Contains("다른 메모를 바꾸는 환자 1명\r\n다른 메모 뒤에 붙이는 환자 2명\r\n", text, StringComparison.Ordinal);
        Assert.Contains("\r\n다른 메모 뒤에 붙이는 환자 1명\r\n", InputPrompt.Build(new[] { Appending(1, "직원 메모"), Sample.Item(2) }, Sample.Registration), StringComparison.Ordinal);
        Assert.DoesNotContain(AppendLine, InputPrompt.Build(Sample.Items(3), Sample.Registration), StringComparison.Ordinal);
        Assert.DoesNotContain(AppendLine, InputPrompt.Build(new[] { Sample.Item(1, replaces: "직원 메모") }, Sample.Registration), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-6611.5 직접 확인으로 온 환자는 appends가 함께 와도 붙이지 않으므로 세지 않는다")]
    public void HandCheckedNotCounted()
    {
        var text = InputPrompt.Build(new[] { Appending(1, "직원 메모", checkedByHand: true), Appending(2, "직원 메모") }, Sample.Registration);
        Assert.Contains("다른 메모 뒤에 붙이는 환자 1명", text, StringComparison.Ordinal);
        Assert.Contains("직접 확인한 환자 1명", text, StringComparison.Ordinal);
        Assert.DoesNotContain(AppendLine, InputPrompt.Build(new[] { Appending(1, "직원 메모", checkedByHand: true) }, Sample.Registration), StringComparison.Ordinal);
    }

    [Fact(DisplayName = "AC-6611.5 창 글에 붙일 앞 글(appends)·우리 메모·이름·차트번호가 없다")]
    public void NoAppendText()
    {
        var item = Appending(1, "직원이 쓴 비밀 메모");
        var text = InputPrompt.Build(new[] { item }, Sample.Registration);
        foreach (var forbidden in new[] { item.Appends!, item.Memo, item.Name, item.Chart })
        {
            Assert.DoesNotContain(forbidden, text, StringComparison.Ordinal);
        }
    }
}
