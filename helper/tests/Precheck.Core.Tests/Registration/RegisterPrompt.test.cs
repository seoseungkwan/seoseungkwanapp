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

    [Fact(DisplayName = "AC-005.5 처음 등록 글: 이 병원으로 등록할까요? 병원 이름 · 기관기호 1234**** 와 범위·설치·서버·DB")]
    public void FirstRegistration()
    {
        var text = RegisterPrompt.Build(Synthetic.Registration(name: "가상의원"));

        Assert.StartsWith("이 병원으로 등록할까요?", text);
        Assert.Contains("가상의원 · 기관기호 1234****", text);
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
        var previous = Synthetic.Registration(name: "가상의원", institution: Synthetic.OtherInstitution, server: "192.168.0.10");
        var next = Synthetic.Registration(name: "새가상의원");
        var text = RegisterPrompt.Build(next, previous);

        Assert.StartsWith("이 병원으로 다시 등록할까요?", text);
        Assert.Contains("가상의원 · 기관기호 8765****", text);
        Assert.Contains("새가상의원 · 기관기호 1234****", text);
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
}
