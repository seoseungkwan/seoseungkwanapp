using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Rules;

/// <summary>
/// spec erp-uisarang TASK-4: 작은 규칙 UisRules(design.md 4-1·4-3) — 의사랑 찾기(AC-4201.1)·엑셀 폴더 고르기(AC-4202.1)·코드 꼴(AC-4206.1 견주기 꼴).
/// 경로는 모두 가짜 값이고 디스크를 보지 않는다(파일 있음은 넘겨받은 함수만 본다).
/// </summary>
public class UisRulesTests
{
    /// <summary>있다고 칠 파일 목록으로 fileExists를 만든다. 물어본 경로를 차례대로 적어 둔다.</summary>
    private sealed class FakeFiles
    {
        private readonly HashSet<string> files;

        public FakeFiles(StringComparer comparer, params string[] files)
        {
            this.files = new HashSet<string>(files, comparer);
        }

        public List<string> Asked { get; } = new List<string>();

        public bool Exists(string path)
        {
            Asked.Add(path);
            return files.Contains(path);
        }
    }

    // ---- FindUisarang (AC-4201.1) ------------------------------------------------------------

    [Fact(DisplayName = "AC-4201.1 C:에 없고 D:에 ysr2000\\Exe\\FStat.exe가 있으면 'D:\\ysr2000'이고, 찾은 뒤 다음 뿌리(E:)는 보지 않는다")]
    public void FindsFirstRootWithFStat()
    {
        var files = new FakeFiles(StringComparer.Ordinal, @"D:\ysr2000\Exe\FStat.exe", @"E:\ysr2000\Exe\FStat.exe");

        var found = UisRules.FindUisarang(new[] { @"C:\", @"D:\", @"E:\" }, files.Exists);

        Assert.Equal(@"D:\ysr2000", found);
        Assert.Equal(new[] { @"C:\ysr2000\Exe\FStat.exe", @"D:\ysr2000\Exe\FStat.exe" }, files.Asked);
    }

    [Fact(DisplayName = "AC-4201.1 ysr2000 폴더는 있지만 FStat.exe가 없는 뿌리는 의사랑이 아니다(다른 exe만 있음 → 다음 뿌리, 아무 데도 없으면 null)")]
    public void RootWithoutFStatIsNotUisarang()
    {
        var files = new FakeFiles(StringComparer.Ordinal, @"C:\ysr2000\Exe\FMain.exe", @"C:\ysr2000\Exe\", @"C:\ysr2000\FStat.exe");

        Assert.Null(UisRules.FindUisarang(new[] { @"C:\" }, files.Exists));

        files = new FakeFiles(StringComparer.Ordinal, @"C:\ysr2000\Exe\FMain.exe", @"D:\ysr2000\Exe\FStat.exe");
        Assert.Equal(@"D:\ysr2000", UisRules.FindUisarang(new[] { @"C:\", @"D:\" }, files.Exists));
    }

    [Fact(DisplayName = "AC-4201.1 경로 대소문자는 가리지 않는다: 디스크 이름이 'YSR2000\\EXE\\FSTAT.EXE'여도(윈도우처럼 대소문자 무시) 찾고, 답은 넘겨받은 뿌리 + '\\ysr2000'")]
    public void CaseInsensitive()
    {
        var files = new FakeFiles(StringComparer.OrdinalIgnoreCase, @"D:\YSR2000\EXE\FSTAT.EXE");

        Assert.Equal(@"d:\ysr2000", UisRules.FindUisarang(new[] { @"c:\", @"d:\" }, files.Exists));
        Assert.Equal(new[] { @"c:\ysr2000\Exe\FStat.exe", @"d:\ysr2000\Exe\FStat.exe" }, files.Asked);
    }

    [Fact(DisplayName = "AC-4201.1 넘겨받은 뿌리만 본다: 뿌리가 없으면 null(아무것도 묻지 않음), 빈 뿌리는 건너뛰고, 끝 '\\'·'/'가 없거나 '/'인 뿌리도 '<드라이브>\\ysr2000'")]
    public void OnlyGivenRoots()
    {
        var none = new FakeFiles(StringComparer.Ordinal, @"C:\ysr2000\Exe\FStat.exe");
        Assert.Null(UisRules.FindUisarang(new string[0], none.Exists));
        Assert.Empty(none.Asked);

        var files = new FakeFiles(StringComparer.Ordinal, @"F:\ysr2000\Exe\FStat.exe");
        Assert.Equal(@"F:\ysr2000", UisRules.FindUisarang(new[] { "", "  ", "D:", "E:/", @"F:\\" }, files.Exists));
        Assert.Equal(new[] { @"D:\ysr2000\Exe\FStat.exe", @"E:\ysr2000\Exe\FStat.exe", @"F:\ysr2000\Exe\FStat.exe" }, files.Asked);
    }

    [Fact(DisplayName = "AC-4201.1 뿌리 목록·파일 있음 함수가 null이면 ArgumentNullException")]
    public void FindNullArguments()
    {
        Assert.Throws<ArgumentNullException>(() => UisRules.FindUisarang(null!, _ => true));
        Assert.Throws<ArgumentNullException>(() => UisRules.FindUisarang(new[] { @"C:\" }, null!));
    }

    // ---- ChooseFolder (AC-4202.1) ------------------------------------------------------------

    private const string Profile = @"C:\Users\fake";

    public static TheoryData<string?, string?, string?> OneDriveThree => new TheoryData<string?, string?, string?>
    {
        { @"C:\Users\fake\OneDrive", null, null },
        { null, @"C:\Users\fake\OneDrive - 가짜의원", null },
        { null, null, @"C:\Users\fake\OneDrive" },
    };

    [Theory(DisplayName = "AC-4202.1 바탕화면이 클라우드 폴더(OneDrive·OneDriveCommercial·OneDriveConsumer 값 가운데 하나)의 안이면 Profile")]
    [MemberData(nameof(OneDriveThree))]
    public void DesktopInsideCloudIsProfile(string? oneDrive, string? commercial, string? consumer)
    {
        var desktop = (oneDrive ?? commercial ?? consumer) + @"\바탕 화면";

        Assert.Equal(UisFolderKind.Profile, UisRules.ChooseFolder(desktop, Profile, new[] { oneDrive, commercial, consumer }));
    }

    [Fact(DisplayName = "AC-4202.1 '안'은 대소문자·'/'·끝 '\\'를 가리지 않고, 클라우드 폴더 그 자체도 안이다")]
    public void InsideIgnoresCaseAndSeparators()
    {
        Assert.Equal(UisFolderKind.Profile, UisRules.ChooseFolder("c:/users/FAKE/onedrive/Desktop/", Profile, new[] { @"C:\Users\fake\OneDrive\" }));
        Assert.Equal(UisFolderKind.Profile, UisRules.ChooseFolder(@"C:\Users\fake\OneDrive", Profile, new[] { @"C:\Users\fake\OneDrive" }));
    }

    [Fact(DisplayName = "AC-4202.1 바탕화면이 클라우드 폴더 밖(다른 폴더·이름만 비슷한 폴더·다른 드라이브)이면 Desktop")]
    public void DesktopOutsideCloudIsDesktop()
    {
        string?[] cloud = { @"C:\Users\fake\OneDrive", null, "" };

        Assert.Equal(UisFolderKind.Desktop, UisRules.ChooseFolder(@"C:\Users\fake\Desktop", Profile, cloud));
        Assert.Equal(UisFolderKind.Desktop, UisRules.ChooseFolder(@"C:\Users\fake\OneDriveBackup\Desktop", Profile, cloud));
        Assert.Equal(UisFolderKind.Desktop, UisRules.ChooseFolder(@"D:\바탕화면", Profile, cloud));
    }

    [Fact(DisplayName = "AC-4202.1 클라우드 값이 하나도 없으면(모두 null·빈 글자·빈 목록) Desktop")]
    public void NoCloudIsDesktop()
    {
        Assert.Equal(UisFolderKind.Desktop, UisRules.ChooseFolder(@"C:\Users\fake\Desktop", Profile, new string?[] { null, "", "  " }));
        Assert.Equal(UisFolderKind.Desktop, UisRules.ChooseFolder(@"C:\Users\fake\Desktop", Profile, new string?[0]));
    }

    [Theory(DisplayName = "AC-4202.1 바탕화면 값이 비었으면(null·빈 글자·빈칸) Profile")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void EmptyDesktopIsProfile(string? desktop)
    {
        Assert.Equal(UisFolderKind.Profile, UisRules.ChooseFolder(desktop, Profile, new string?[] { null, null, null }));
    }

    [Fact(DisplayName = "AC-4202.1 엑셀 폴더 이름은 'ERP마감'(바탕화면·사용자 폴더 바로 아래), 클라우드 목록이 null이면 ArgumentNullException")]
    public void FolderNameAndNullCloud()
    {
        Assert.Equal("ERP마감", UisRules.FolderName);
        Assert.Throws<ArgumentNullException>(() => UisRules.ChooseFolder(@"C:\Users\fake\Desktop", Profile, null!));
    }

    // ---- Code (design.md 4-1, AC-4206.1 견주는 코드 꼴) ---------------------------------------------

    /// <summary>commands.json closing.day 코드 꼴(3-1). 정리한 코드(빈 글자 아님)는 늘 이 꼴이다.</summary>
    private static readonly Regex CommandCode = new Regex(@"^\S(?: ?\S)*$");

    [Theory(DisplayName = "AC-4206.1 코드 꼴 UisRules.Code: 앞뒤 빈칸을 떼고 가운데 이어진 빈칸(탭·전각 빈칸·NBSP 포함)을 하나로 줄여 대문자")]
    [InlineData("AA222", "AA222")]
    [InlineData("  aa222 ", "AA222")]
    [InlineData("ab  12\t 3", "AB 12 3")]
    [InlineData("\u3000mm\u00A0 05\u3000", "MM 05")]
    [InlineData("가짜 코드  x", "가짜 코드 X")]
    public void CodeShape(string text, string expected)
    {
        var code = UisRules.Code(text);

        Assert.Equal(expected, code);
        Assert.Matches(CommandCode, code);
        Assert.Equal(code, UisRules.Code(code));
    }

    [Theory(DisplayName = "AC-4206.1 코드 꼴 UisRules.Code: 빈 글자·빈칸만은 빈 글자, null은 ArgumentNullException")]
    [InlineData("")]
    [InlineData(" \t\u3000 ")]
    public void CodeEmpty(string text)
    {
        Assert.Equal("", UisRules.Code(text));
        Assert.Throws<ArgumentNullException>(() => UisRules.Code(null!));
    }
}
