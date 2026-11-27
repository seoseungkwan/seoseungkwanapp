using System;
using System.Linq;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Connect;

/// <summary>
/// AC-005.19 병원 고르기 창(승인 시안 docs/mockups/reg-pick). 창을 띄우지 않고 만든 컨트롤만 본다(누름은 의원 PC 시험).
/// 기관기호·범위 값은 지어낸 것이다.
/// </summary>
public class HospitalPickWindowTests
{
    private static HospitalPickView View(bool mine) =>
        new HospitalPickView(
            new[]
            {
                new HospitalChoice("SYNTHETIC", "12345678", 1284, mine),
                new HospitalChoice("FOREIGN", "87654321", 0, false),
            },
            new BitTarget(@"C:\DrBIT50", @".\SQLEXPRESS", "DRBIT"),
            null);

    private static HospitalPickView NoPreselect() =>
        new HospitalPickView(
            new[]
            {
                new HospitalChoice("SYNTHETIC", "12345678", 3, false),
                new HospitalChoice("FOREIGN", "87654321", 7, false),
            },
            new BitTarget(@"C:\DrBIT50", @".\SQLEXPRESS", "DRBIT"),
            null);

    private static string AllText(Control root) =>
        string.Join("\n", new[] { root.Text }.Concat(root.Controls.Cast<Control>().Select(AllText)));

    [Fact(DisplayName = "AC-005.19 고르기 창: 제목·질문·줄 글·꼬리표·노란 글·설치 위치·DB 줄, 줄마다 라디오 하나, 미리 고른 줄이 켜짐")]
    public void Builds()
    {
        var view = View(mine: true);
        using var form = HospitalPickWindow.CreateForm(view);
        Assert.Equal("청구메모 도우미", form.Text);
        Assert.True(form.TopMost);
        Assert.Equal(2, form.Choices.Count);
        Assert.Equal("요양기관번호 12345678", form.Choices[0].Text);
        Assert.Equal("요양기관번호 87654321", form.Choices[1].Text);
        Assert.True(form.Choices[0].Checked);
        Assert.False(form.Choices[1].Checked);

        var text = AllText(form);
        Assert.Contains(HospitalPick.Question, text);
        Assert.Contains("지금 로그인한 계정의 병원", text);
        Assert.Contains("최근 30일 외래 1,284건", text);
        Assert.Contains("최근 30일 외래 0건", text);
        Assert.Contains(HospitalPick.Warning, text);
        Assert.Contains(@"비트 설치 위치: C:\DrBIT50", text);
        Assert.Contains(@"비트 DB: .\SQLEXPRESS / DRBIT", text);

        Assert.True(form.Ok.Enabled);
        Assert.Equal(0, form.Selected);
    }

    [Fact(DisplayName = "AC-005.19 기본 단추는 [취소](엔터로 등록되지 않게), 미리 고른 줄이 없으면 줄을 고를 때까지 [확인]이 꺼져 있다")]
    public void OkWaitsForPick()
    {
        using var form = HospitalPickWindow.CreateForm(NoPreselect());
        Assert.Same(form.Cancel, form.CancelButton);
        Assert.Null(form.AcceptButton);
        Assert.All(form.Choices, radio => Assert.False(radio.Checked));
        Assert.False(form.Ok.Enabled);
        Assert.Null(form.Selected);

        form.Choices[1].Checked = true;
        Assert.True(form.Ok.Enabled);
        Assert.Equal(1, form.Selected);
    }

    [Fact(DisplayName = "AC-005.19 시간이 없으면 창 없이 null(저장 안 함)")]
    public void NoTimeNoWindow()
    {
        Assert.Null(new HospitalPickWindow().Pick(View(mine: true), TimeSpan.Zero));
    }
}
