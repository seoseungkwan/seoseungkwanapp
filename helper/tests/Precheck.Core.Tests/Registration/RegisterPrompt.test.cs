using System.Linq;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.5 PC 확인 창 글: 도우미가 비트에서 읽은 등록 값으로만 만든다. 기관기호는 뒤 4자리를 가린다(design.md 9-1).
/// 다시 등록이면 전 등록 값과 새 값을 함께 보인다.
/// </summary>
public class RegisterPromptTests
{
    [Fact(DisplayName = "AC-005.5 기관기호는 뒤 4자리를 가린다(1234****)")]
    public void MasksInstitution()
    {
        Assert.Equal("1234****", RegisterPrompt.MaskInstitution("12345678"));
        Assert.Equal("8765****", RegisterPrompt.MaskInstitution("87654321"));
    }

    [Fact(DisplayName = "AC-005.15 기관기호가 비었으면 확인 창의 기관기호 줄은 '기관기호 못 찾음'이다")]
    public void EmptyInstitutionIsNotFound()
    {
        Assert.Equal("못 찾음", RegisterPrompt.MaskInstitution(""));
        var text = RegisterPrompt.Build(Synthetic.Registration(institution: ""));
        Assert.Contains("기관기호 못 찾음", text);
        Assert.DoesNotContain("****", text);
    }

    [Fact(DisplayName = "AC-005.5 처음 등록 글: 이 병원으로 등록할까요? 기관기호 1234**** 와 범위·설치·서버·DB")]
    public void FirstRegistration()
    {
        var text = RegisterPrompt.Build(Synthetic.Registration());

        Assert.StartsWith("이 병원으로 등록할까요?", text);
        Assert.Contains("기관기호 1234****", text);
        Assert.Contains(Synthetic.Scope, text);
        Assert.Contains(Synthetic.Root, text);
        Assert.Contains(Synthetic.Server, text);
        Assert.Contains(Synthetic.Database, text);
        Assert.DoesNotContain(Synthetic.Institution, text);
        Assert.DoesNotContain(Synthetic.ProfileId, text);
    }

    [Fact(DisplayName = "AC-005.5 다시 등록 글: 전 등록 값과 새 값을 함께, 기관기호는 둘 다 가림")]
    public void ReRegistration()
    {
        var previous = Synthetic.Registration(institution: Synthetic.OtherInstitution, server: "192.168.0.10");
        var next = Synthetic.Registration();
        var text = RegisterPrompt.Build(next, previous);

        Assert.StartsWith("이 병원으로 다시 등록할까요?", text);
        Assert.Contains("  기관기호 8765****", text);
        Assert.Contains("  기관기호 1234****", text);
        Assert.True(text.IndexOf("기관기호 8765****", System.StringComparison.Ordinal) < text.IndexOf("기관기호 1234****", System.StringComparison.Ordinal));
        Assert.Contains("192.168.0.10", text);
        Assert.Contains(Synthetic.Server, text);
        Assert.True(text.IndexOf("지금 등록", System.StringComparison.Ordinal) < text.IndexOf("새로 등록", System.StringComparison.Ordinal));
        Assert.DoesNotContain(Synthetic.Institution, text);
        Assert.DoesNotContain(Synthetic.OtherInstitution, text);
        // 기관기호가 달라 전 병원의 작업은 이어 읽지 않는다
        Assert.Contains("전 병원의 작업은 읽지 않습니다", text);

        var same = RegisterPrompt.Build(Synthetic.Registration(server: "192.168.0.11"), Synthetic.Registration());
        Assert.Contains("하던 작업을 이어서 씁니다", same);
    }

    private static string[] Lines(string text) => text.Split(new[] { "\r\n" }, System.StringSplitOptions.None);

    [Fact(DisplayName = "AC-005.9 처음 등록 글: 병원 이름 줄이 없고 첫 값 줄이 기관기호 1234****, 범위 값은 범위 줄에만")]
    public void FirstRegistrationHasNoNameLine()
    {
        var lines = Lines(RegisterPrompt.Build(Synthetic.Registration()));

        Assert.Equal("이 병원으로 등록할까요?", lines[0]);
        Assert.Equal("", lines[1]);
        Assert.Equal("기관기호 1234****", lines[2]);
        Assert.Equal("비트 병원 범위: " + Synthetic.Scope, lines[3]);
        Assert.Equal("비트 설치 위치: " + Synthetic.Root, lines[4]);
        Assert.Equal("비트 DB: " + Synthetic.Server + " / " + Synthetic.Database, lines[5]);
        // 범위 값이 이름처럼 따로 앞에 나오지 않는다
        Assert.Equal(new[] { 3 }, Enumerable.Range(0, lines.Length).Where(i => lines[i].Contains(Synthetic.Scope)).ToArray());
        Assert.DoesNotContain(lines, line => line.Contains(" · "));
    }

    [Fact(DisplayName = "AC-005.9 다시 등록 글: 전 값·새 값 모두 이름 줄 없이 기관기호(가림)·범위·설치·DB, 범위 값은 범위 줄에만")]
    public void ReRegistrationHasNoNameLine()
    {
        var previous = Synthetic.Registration(institution: Synthetic.OtherInstitution, scope: "OLDSCOPE", server: "192.168.0.10");
        var lines = Lines(RegisterPrompt.Build(Synthetic.Registration(), previous));

        var now = System.Array.IndexOf(lines, "지금 등록");
        var next = System.Array.IndexOf(lines, "새로 등록");
        Assert.True(now > 0 && next > now);
        Assert.Equal("  기관기호 8765****", lines[now + 1]);
        Assert.Equal("  비트 병원 범위: OLDSCOPE", lines[now + 2]);
        Assert.Equal("  기관기호 1234****", lines[next + 1]);
        Assert.Equal("  비트 병원 범위: " + Synthetic.Scope, lines[next + 2]);
        Assert.Equal(new[] { now + 2 }, Enumerable.Range(0, lines.Length).Where(i => lines[i].Contains("OLDSCOPE")).ToArray());
        Assert.Equal(new[] { next + 2 }, Enumerable.Range(0, lines.Length).Where(i => lines[i].Contains(Synthetic.Scope)).ToArray());
        Assert.DoesNotContain(lines, line => line.Contains(" · "));
    }
}
