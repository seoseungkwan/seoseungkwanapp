using System.IO;
using System.Text;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-005.1 비트 찾기: 원본 InstallationLocator.NormalizeAndValidate + NativeEnvironmentGuard.Validate 규칙.
/// 가짜 후보(앱 폴더·레지스트리 값·기본 폴더)와 가짜 파일 모양(IFileProbe)으로 본다.
/// </summary>
public class BitInstallRulesTests
{
    private const string Exe = @"C:\DrBIT50\EXE\BITStatistics.exe";

    private static FakeProbe GoodPc() => new FakeProbe().Install(Synthetic.Root).Environment(@"C:\DrBIT50", @"C:\DrBIT50\EXE");

    // ---- 경로 모양 ----------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-005.1 UNC·장치·상대 경로·드라이브 상대 경로는 거절한다")]
    [InlineData(@"\\server\share\DrBIT50")]
    [InlineData(@"\\?\C:\DrBIT50")]
    [InlineData(@"\\.\C:\DrBIT50")]
    [InlineData(@"//server/share/DrBIT50")]
    [InlineData(@"DrBIT50")]
    [InlineData(@".\DrBIT50")]
    [InlineData(@"..\DrBIT50")]
    [InlineData(@"\DrBIT50")]
    [InlineData(@"C:DrBIT50")]
    [InlineData(@"1:\DrBIT50")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void RejectsNonLocalPaths(string? path)
    {
        Assert.False(WinPath.TryNormalize(path, out _));
        Assert.Null(BitInstallRules.FindRoot(path, new FakeProbe().Install(Synthetic.Root)));
    }

    [Theory(DisplayName = "AC-005.1 경로는 따옴표·공백·끝 구분자·/·.·..을 정리해 비교한다")]
    [InlineData("\"C:\\DrBIT50\\\"", @"C:\DrBIT50")]
    [InlineData(@"  C:\DrBIT50  ", @"C:\DrBIT50")]
    [InlineData(@"c:/DrBIT50/EXE/../", @"c:\DrBIT50")]
    [InlineData(@"C:\DrBIT50\.\EXE\\", @"C:\DrBIT50\EXE")]
    [InlineData(@"C:\", @"C:\")]
    [InlineData(@"C:\..\..", @"C:\")]
    public void NormalizesLocalPaths(string path, string expected)
    {
        Assert.True(WinPath.TryNormalize(path, out var normalized));
        Assert.Equal(expected, normalized);
    }

    // ---- 설치 폴더 모양(필요한 파일 셋) --------------------------------------------------------------

    [Theory(DisplayName = "AC-005.1 ini\\BITSTATISTICS.Xml·EXE\\BITDataBaseCommon.dll·EXE\\BITStatistics.exe가 모두 있는 곳을 고른다(실행 파일·EXE 폴더면 위로 4단계까지)")]
    [InlineData(@"C:\DrBIT50")]
    [InlineData(@"C:\DrBIT50\")]
    [InlineData(@"C:\DrBIT50\EXE")]
    [InlineData(Exe)]
    [InlineData("\"C:\\DrBIT50\\EXE\\BITStatistics.exe\"")]
    [InlineData(@"c:\drbit50\exe")]
    public void FindsRootFromCandidate(string candidate)
    {
        var root = BitInstallRules.FindRoot(candidate, GoodPc());
        Assert.NotNull(root);
        Assert.True(WinPath.Same(Synthetic.Root, root));
    }

    [Theory(DisplayName = "AC-005.1 필요한 파일이 하나라도 없으면 그 후보는 고르지 않는다")]
    [InlineData(@"ini\BITSTATISTICS.Xml")]
    [InlineData(@"EXE\BITDataBaseCommon.dll")]
    [InlineData(@"EXE\BITStatistics.exe")]
    public void RefusesIncompleteInstall(string missing)
    {
        var probe = new FakeProbe().Install(Synthetic.Root, missing).Environment(@"C:\DrBIT50", @"C:\DrBIT50\EXE");
        Assert.Null(BitInstallRules.FindRoot(Synthetic.Root, probe));
        Assert.Null(BitInstallRules.FindRoot(@"C:\DrBIT50\EXE", probe));
    }

    [Fact(DisplayName = "AC-005.1 위로 찾기는 4단계까지만(원본 AncestorLimit), 없는 폴더·네트워크 드라이브는 거절")]
    public void AncestorLimitMissingAndNetwork()
    {
        var probe = GoodPc().Directory(@"C:\DrBIT50\a\b\c\d").Directory(@"C:\DrBIT50\a\b\c\d\e");
        Assert.True(WinPath.Same(Synthetic.Root, BitInstallRules.FindRoot(@"C:\DrBIT50\a\b\c\d", probe)));
        Assert.Null(BitInstallRules.FindRoot(@"C:\DrBIT50\a\b\c\d\e", probe));

        Assert.Null(BitInstallRules.FindRoot(@"C:\NoSuchFolder", probe));

        var network = new FakeProbe().Install(@"Z:\DrBIT50").NetworkDrive(@"Z:\");
        Assert.Null(BitInstallRules.FindRoot(@"Z:\DrBIT50", network));
    }

    // ---- 환경 파일(Path·Bin)과 지원 위치 ---------------------------------------------------------------

    [Fact(DisplayName = "AC-005.1 AC-005.17 환경 파일의 Path·Bin이 고른 폴더와 같을 때만 통과(드라이브·폴더 이름은 따지지 않음)")]
    public void EnvironmentMustMatchSupportedRoot()
    {
        Assert.True(BitInstallRules.MatchesEnvironment(Synthetic.Root, GoodPc(), @"C:\"));

        // 대소문자·끝 구분자는 같은 경로
        var cased = new FakeProbe().Install(Synthetic.Root).Environment(@"c:\drbit50\", @"C:/DRBIT50/exe");
        Assert.True(BitInstallRules.MatchesEnvironment(Synthetic.Root, cased, @"C:\"));

        var wrongBin = new FakeProbe().Install(Synthetic.Root).Environment(@"C:\DrBIT50", @"C:\DrBIT50\BIN");
        Assert.False(BitInstallRules.MatchesEnvironment(Synthetic.Root, wrongBin, @"C:\"));

        var wrongPath = new FakeProbe().Install(Synthetic.Root).Environment(@"D:\DrBIT50", @"C:\DrBIT50\EXE");
        Assert.False(BitInstallRules.MatchesEnvironment(Synthetic.Root, wrongPath, @"C:\"));

        var noBin = new FakeProbe().Install(Synthetic.Root).Environment(@"C:\DrBIT50", null);
        Assert.False(BitInstallRules.MatchesEnvironment(Synthetic.Root, noBin, @"C:\"));

        var uncPath = new FakeProbe().Install(Synthetic.Root).Environment(@"\\server\DrBIT50", @"\\server\DrBIT50\EXE");
        Assert.False(BitInstallRules.MatchesEnvironment(Synthetic.Root, uncPath, @"C:\"));

        var noFile = new FakeProbe().Install(Synthetic.Root);
        Assert.False(BitInstallRules.MatchesEnvironment(Synthetic.Root, noFile, @"C:\"));

        // TASK-45부터 환경 파일과 맞으면 C:\DrBIT50이 아니어도 고른다(AC-005.17, 원본 SupportedRoot 조건 없음)
        var otherRoot = new FakeProbe().Install(@"D:\DrBIT50").Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE");
        Assert.True(BitInstallRules.MatchesEnvironment(@"D:\DrBIT50", otherRoot, @"C:\"));
    }

    [Fact(DisplayName = "AC-005.1 환경 파일은 윈도우 드라이브의 DrBIT50\\Environment\\DrBIT50Environment.ini에서 읽는다")]
    public void EnvironmentFileLocation()
    {
        Assert.Equal(@"C:\DrBIT50\Environment\DrBIT50Environment.ini", BitInstallRules.EnvironmentFile(@"C:\"));
        Assert.Equal(@"D:\DrBIT50\Environment\DrBIT50Environment.ini", BitInstallRules.EnvironmentFile(@"D:\"));

        var probe = GoodPc();
        BitInstallRules.MatchesEnvironment(Synthetic.Root, probe, @"C:\");
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini" }, probe.EnvironmentReads);
    }

    // ---- 후보 고르기 ---------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-005.1 후보(앱 폴더·레지스트리 값·기본 폴더) 가운데 규칙을 모두 지키는 첫 곳을 고른다")]
    public void ChoosesFirstValidCandidate()
    {
        var probe = GoodPc().Install(@"D:\DrBIT50").Directory(@"C:\Users\Synthetic\AppData\Local\Seoseungkwan\PrecheckHelper\app");
        var candidates = new[]
        {
            null,
            "",
            @"C:\Users\Synthetic\AppData\Local\Seoseungkwan\PrecheckHelper\app", // 앱 폴더: 비트 아님
            @"\\server\share\DrBIT50",                                           // 공유 폴더
            @"D:\DrBIT50",                                                        // 모양은 맞지만 환경 파일(C:\DrBIT50)과 다름
            "\"C:\\DrBIT50\\EXE\\BITStatistics.exe\" /s",                         // 레지스트리 실행 경로(인자 붙음): 거절
            Exe,                                                                  // 레지스트리 DisplayIcon
            Synthetic.Root,                                                       // 기본 폴더
        };
        Assert.Equal(Synthetic.Root, BitInstallRules.Choose(candidates, probe, @"C:\"), ignoreCase: true);
    }

    [Fact(DisplayName = "AC-005.1 못 찾으면 E-BIT-NOT-FOUND")]
    public void NotFound()
    {
        var noInstall = new FakeProbe().Environment(@"C:\DrBIT50", @"C:\DrBIT50\EXE");
        var error = Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { Synthetic.Root, Exe }, noInstall, @"C:\"));
        Assert.Equal("E-BIT-NOT-FOUND", error.Code);

        var noEnvironment = new FakeProbe().Install(Synthetic.Root);
        Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { Synthetic.Root }, noEnvironment, @"C:\")).Code);

        Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => BitInstallRules.Choose(new string?[0], GoodPc(), @"C:\")).Code);
    }

    // ---- 설치 위치 상관없이(AC-005.17, TASK-45) ------------------------------------------------------

    [Theory(DisplayName = "AC-005.17 환경 파일이 가리키는 로컬 설치면 드라이브·폴더 이름과 상관없이 고른다(폴더·실행 파일 후보 둘 다)")]
    [InlineData(@"C:\DrBIT50")]
    [InlineData(@"D:\DrBIT50")]
    [InlineData(@"C:\DrBIT")]
    [InlineData(@"E:\병원 프로그램\DrBIT50")]
    public void AnyLocalFolder(string root)
    {
        var probe = new FakeProbe().Install(root).Environment(root, root + @"\EXE");
        Assert.Equal(root, BitInstallRules.Choose(new[] { root }, probe, @"C:\"), ignoreCase: true);
        Assert.Equal(root, BitInstallRules.Choose(new[] { root + @"\EXE\BITStatistics.exe" }, probe, @"C:\"), ignoreCase: true);
    }

    [Fact(DisplayName = "AC-005.17 위치는 풀어도 네트워크 드라이브·UNC·필요한 파일 빠짐·환경 파일과 다름은 그대로 E-BIT-NOT-FOUND")]
    public void StillRefuses()
    {
        var network = new FakeProbe().Install(@"Z:\DrBIT50").NetworkDrive(@"Z:\").Environment(@"Z:\DrBIT50", @"Z:\DrBIT50\EXE");
        Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { @"Z:\DrBIT50" }, network, @"C:\")).Code);

        var unc = new FakeProbe().Environment(@"\\server\share\DrBIT50", @"\\server\share\DrBIT50\EXE");
        Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { @"\\server\share\DrBIT50" }, unc, @"C:\")).Code);

        var noStatistics = new FakeProbe().Install(@"D:\DrBIT50", @"EXE\BITStatistics.exe").Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE");
        Assert.Equal("E-BIT-NOT-FOUND", Assert.Throws<BitException>(() => BitInstallRules.Choose(new[] { @"D:\DrBIT50" }, noStatistics, @"C:\")).Code);

        var otherPlace = new FakeProbe().Install(@"D:\DrBIT50").Install(@"E:\DrBIT50").Environment(@"E:\DrBIT50", @"E:\DrBIT50\EXE");
        Assert.Equal(@"E:\DrBIT50", BitInstallRules.Choose(new[] { @"D:\DrBIT50", @"E:\DrBIT50" }, otherPlace, @"C:\"), ignoreCase: true);
    }

    [Fact(DisplayName = "AC-005.17 윈도우 드라이브에 환경 파일이 없을 때만 설치 폴더 드라이브의 환경 파일을 본다(있는데 못 읽거나 다른 곳을 가리키면 넘어가지 않음)")]
    public void EnvironmentOnInstallDrive()
    {
        var onlyD = new FakeProbe().Install(@"D:\DrBIT50").Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE", systemDrive: @"D:\");
        Assert.True(BitInstallRules.MatchesEnvironment(@"D:\DrBIT50", onlyD, @"C:\"));
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini", @"D:\DrBIT50\Environment\DrBIT50Environment.ini" }, onlyD.EnvironmentReads);

        var brokenC = new FakeProbe().Install(@"D:\DrBIT50").File(@"C:\DrBIT50\Environment\DrBIT50Environment.ini")
            .Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE", systemDrive: @"D:\");
        Assert.False(BitInstallRules.MatchesEnvironment(@"D:\DrBIT50", brokenC, @"C:\"));
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini" }, brokenC.EnvironmentReads);

        var cWins = new FakeProbe().Install(@"D:\DrBIT50").Environment(Synthetic.Root, Synthetic.Root + @"\EXE")
            .Environment(@"D:\DrBIT50", @"D:\DrBIT50\EXE", systemDrive: @"D:\");
        Assert.False(BitInstallRules.MatchesEnvironment(@"D:\DrBIT50", cWins, @"C:\"));

        var sameDrive = new FakeProbe().Install(@"C:\DrBIT");
        Assert.False(BitInstallRules.MatchesEnvironment(@"C:\DrBIT", sameDrive, @"C:\"));
        Assert.Equal(new[] { @"C:\DrBIT50\Environment\DrBIT50Environment.ini" }, sameDrive.EnvironmentReads);
    }

    // ---- 환경 파일 읽기(원본 TryReadConfiguration) ------------------------------------------------------

    private static BitEnvironment? Parse(string xml) =>
        NativeEnvironmentFile.Parse(new MemoryStream(Encoding.UTF8.GetBytes(xml)));

    [Fact(DisplayName = "AC-005.1 환경 파일은 첫 Setting 줄의 바로 아래 Path·Bin만 읽는다(접속 정보는 읽지 않음)")]
    public void ParsesFirstSettingOnly()
    {
        var env = Parse(
            "<?xml version=\"1.0\"?><DrBIT><!-- c --><Setting><Path>C:\\DrBIT50</Path><Bin>C:\\DrBIT50\\EXE</Bin>" +
            "<Database><Path>D:\\Nested</Path></Database><Password>synthetic</Password></Setting>" +
            "<Setting><Path>D:\\Second</Path><Bin>D:\\Second\\EXE</Bin></Setting></DrBIT>");
        Assert.NotNull(env);
        Assert.Equal(@"C:\DrBIT50", env!.Path);
        Assert.Equal(@"C:\DrBIT50\EXE", env.Bin);

        var compact = Parse("<a><Setting><Bin>C:\\DrBIT50\\EXE</Bin><Path>C:\\DrBIT50</Path></Setting></a>");
        Assert.Equal(@"C:\DrBIT50", compact!.Path);
        Assert.Equal(@"C:\DrBIT50\EXE", compact.Bin);

        var missingBin = Parse("<a><Setting><Path>C:\\DrBIT50</Path></Setting></a>");
        Assert.NotNull(missingBin);
        Assert.Null(missingBin!.Bin);
    }

    [Theory(DisplayName = "AC-005.1 환경 파일이 깨졌거나 Setting이 없거나 Path·Bin이 두 번이면 읽지 않는다")]
    [InlineData("<a><Setting><Path>C:\\DrBIT50</Path><Path>D:\\x</Path><Bin>C:\\DrBIT50\\EXE</Bin></Setting></a>")]
    [InlineData("<a><Setting><Path>C:\\DrBIT50</Path><Bin>C:\\x</Bin><Bin>C:\\DrBIT50\\EXE</Bin></Setting></a>")]
    [InlineData("<a><Other><Path>C:\\DrBIT50</Path></Other></a>")]
    [InlineData("<a><b><Setting><Path>C:\\DrBIT50</Path><Bin>C:\\DrBIT50\\EXE</Bin></Setting></b></a>")]
    [InlineData("<a><Setting><Path>C:\\DrBIT50</Path>")]
    [InlineData("<!DOCTYPE a [<!ENTITY x \"C:\\DrBIT50\">]><a><Setting><Path>&x;</Path><Bin>C:\\DrBIT50\\EXE</Bin></Setting></a>")]
    [InlineData("")]
    public void RefusesBrokenEnvironment(string xml)
    {
        Assert.Null(Parse(xml));
    }
}
