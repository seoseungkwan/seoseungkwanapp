using System;
using System.IO;
using System.Linq;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// 구글 코드의 비밀 글자(spec google-link TASK-9, design.md 5절). 비트시트 TokenTests(32자 영문·숫자)를
/// 32바이트 base64url 43자로 옮겼다. 비트시트에서 가져온 32자 비밀 글자도 그대로 받는다(AC-8510.3).
/// </summary>
public class SheetCodeTests
{
    [Fact(DisplayName = "AC-8510.3 새 비밀 글자는 32바이트 base64url 43자·무작위, 가져온 비트시트 32자 글자도 맞는 모양, 짧거나 따옴표가 있으면 틀림")]
    public void NewSecretShape()
    {
        var t = SheetCode.NewSecret();
        Assert.Equal(43, t.Length);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", t);
        Assert.True(SheetCode.IsValidSecret(t));
        Assert.NotEqual(t, SheetCode.NewSecret());
        Assert.True(SheetCode.IsValidSecret("Abcdefghijklmnop0123456789ABCDEF"));
        Assert.False(SheetCode.IsValidSecret("short1"));
        Assert.False(SheetCode.IsValidSecret("abcdefghijklmnop'"));
        Assert.False(SheetCode.IsValidSecret("abcdefghijklmnop\"0123"));
        Assert.False(SheetCode.IsValidSecret("abcdefghijklmnop\\0123"));
        Assert.False(SheetCode.IsValidSecret(new string('a', 129)));
        Assert.False(SheetCode.IsValidSecret(null));
    }

    [Fact(DisplayName = "AC-8510.3 비밀 글자 표시(secretTag) = SHA-256(비밀 글자) 16진수 앞 16자")]
    public void SecretTag()
    {
        // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
        Assert.Equal("ba7816bf8f01cfea", SheetCode.Tag("abc"));
        Assert.Matches("^[0-9a-f]{16}$", SheetCode.Tag(SheetCode.NewSecret()));
    }

    [Fact(DisplayName = "AC-8510.3 코드의 __TOKEN__ 자리는 꼭 한 번만 바꾼다(두 번·없음·틀린 글자는 멈춤)")]
    public void InjectReplacesPlaceholderExactlyOnce()
    {
        var t = SheetCode.NewSecret();
        Assert.Equal("const TOKEN = '" + t + "';", SheetCode.Inject("const TOKEN = '__TOKEN__';", t));
        Assert.Throws<InvalidOperationException>(() => SheetCode.Inject("a __TOKEN__ b __TOKEN__", t));
        Assert.Throws<InvalidOperationException>(() => SheetCode.Inject("no placeholder", t));
        Assert.Throws<ArgumentException>(() => SheetCode.Inject("x __TOKEN__", "bad\\token\"quote"));
        Assert.Equal("__TOKEN__", SheetCode.Placeholder);
        Assert.Equal("SheetCode.gs", SheetCode.ResourceName);
    }

    [Fact(DisplayName = "AC-8510.3 실린 구글 코드(SheetCode.gs) 또는 저장소 google-code/sheet/Code.gs가 있으면 비밀 글자가 한 자리에 들어간다")]
    public void RealCodeGsTakesTheToken()
    {
        var t = SheetCode.NewSecret();
        var loaded = SheetCode.Load();
        if (loaded != null)
        {
            var code = SheetCode.Inject(loaded, t);
            Assert.Contains("const TOKEN = '" + t + "';", code, StringComparison.Ordinal);
            Assert.DoesNotContain("'__TOKEN__'", code, StringComparison.Ordinal);
        }
        var path = FindUp(Path.Combine("google-code", "sheet", "Code.gs"));
        if (path == null) return; // 아직 없으면 건너뜀(TASK-5가 만든다)
        var fromFile = SheetCode.Inject(File.ReadAllText(path), t);
        Assert.Contains("const TOKEN = '" + t + "';", fromFile, StringComparison.Ordinal);
        Assert.DoesNotContain("'__TOKEN__'", fromFile, StringComparison.Ordinal);
    }

    private static string? FindUp(string relative)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, relative);
            if (File.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        return null;
    }
}
