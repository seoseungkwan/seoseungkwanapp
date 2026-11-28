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

    // ---- claim-learn AC-9317.3 전 병원 파일 보관 한 줄(notes '도우미 등록 확인 창 (0.15.0)') ----------------

    [Fact(DisplayName = "AC-9317.3 '전 병원 파일 보관' 글은 notes 글자 그대로({n} = 파일 수)")]
    public void AC9317_3_ArchiveLineText()
    {
        Assert.Equal("전에 쓰던 병원의 저장 파일 6개는 지우지 않고 따로 보관해요.", RegisterPrompt.ArchiveLine(6));
        Assert.Equal("전에 쓰던 병원의 저장 파일 1개는 지우지 않고 따로 보관해요.", RegisterPrompt.ArchiveLine(1));
    }

    [Fact(DisplayName = "AC-9317.3 다시 등록 글: 옮길 파일이 있으면 '기관기호가 달라 전 병원의 작업은 읽지 않습니다.' 다음 줄에 보관 한 줄, 그 뒤 [확인] 줄")]
    public void AC9317_3_ReRegistrationArchiveLine()
    {
        var previous = Synthetic.Registration(institution: Synthetic.OtherInstitution);
        var lines = Lines(RegisterPrompt.Build(Synthetic.Registration(), previous, 6));

        var differs = System.Array.IndexOf(lines, "기관기호가 달라 전 병원의 작업은 읽지 않습니다.");
        Assert.True(differs > 0);
        Assert.Equal("전에 쓰던 병원의 저장 파일 6개는 지우지 않고 따로 보관해요.", lines[differs + 1]);
        Assert.Equal("[확인]을 누르면 지금 등록을 바꿔 씁니다.", lines[differs + 2]);
        Assert.Equal(differs + 3, lines.Length);
    }

    [Fact(DisplayName = "AC-9317.3 옮길 파일이 없으면(0) 글은 지금 그대로다")]
    public void AC9317_3_NoArchiveKeepsText()
    {
        var previous = Synthetic.Registration(institution: Synthetic.OtherInstitution);
        Assert.Equal(RegisterPrompt.Build(Synthetic.Registration(), previous), RegisterPrompt.Build(Synthetic.Registration(), previous, 0));
        Assert.Equal(RegisterPrompt.Build(Synthetic.Registration()), RegisterPrompt.Build(Synthetic.Registration(), null, 0));
        Assert.DoesNotContain("보관", RegisterPrompt.Build(Synthetic.Registration(), previous));
    }

    [Fact(DisplayName = "AC-9317.3 처음 등록 글(등록 파일이 없거나 깨짐)·같은 기관기호 글도 옮길 파일이 있으면 [확인] 줄 바로 앞에 보관 한 줄")]
    public void AC9317_3_OtherTextsArchiveLine()
    {
        var first = Lines(RegisterPrompt.Build(Synthetic.Registration(), null, 2));
        Assert.Equal("전에 쓰던 병원의 저장 파일 2개는 지우지 않고 따로 보관해요.", first[first.Length - 2]);
        Assert.StartsWith("[확인]을 누르면 이 PC에 등록합니다.", first[first.Length - 1]);

        var same = Lines(RegisterPrompt.Build(Synthetic.Registration(scope: "NEWSCOPE"), Synthetic.Registration(), 3));
        Assert.Equal("기관기호가 같아 하던 작업을 이어서 씁니다.", same[same.Length - 3]);
        Assert.Equal("전에 쓰던 병원의 저장 파일 3개는 지우지 않고 따로 보관해요.", same[same.Length - 2]);
        Assert.Equal("[확인]을 누르면 지금 등록을 바꿔 씁니다.", same[same.Length - 1]);
    }
}
