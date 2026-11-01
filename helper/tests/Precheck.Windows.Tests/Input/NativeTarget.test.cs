using System;
using System.IO;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Input;

/// <summary>AC-017.4 BITDoctorOrder.exe 프로세스 규칙: 원본 NativeTarget·SecurityTests의 scope-* 사례. 가짜 파일만 쓴다.</summary>
public sealed class NativeTargetTests : IDisposable
{
    private readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PrecheckTests", Guid.NewGuid().ToString("N"));

    public NativeTargetTests()
    {
        Directory.CreateDirectory(Path.Combine(root, "EXE"));
        Directory.CreateDirectory(Path.Combine(root, "backup"));
    }

    public void Dispose() => Directory.Delete(root, true);

    private string Exe(params string[] parts)
    {
        var path = root;
        foreach (var part in parts) path = Path.Combine(path, part);
        File.WriteAllBytes(path, new byte[0]);
        return path;
    }

    [Fact(DisplayName = "AC-017.4 scope-expected-path: 등록 위치의 EXE\\BITDoctorOrder.exe만 된다")]
    public void Expected() => Assert.True(NativeTarget.PathAllowed(Exe("EXE", "BITDoctorOrder.exe"), root));

    [Fact(DisplayName = "AC-017.4 scope-prefix-confusion: 등록 위치 글자로 시작하는 다른 폴더는 안 된다")]
    public void PrefixConfusion() => Assert.False(NativeTarget.PathAllowed(Exe("EXE", "BITDoctorOrder.exe"), root + "-another"));

    [Fact(DisplayName = "AC-017.4 scope-name-rejected: 다른 이름은 안 된다")]
    public void Name() => Assert.False(NativeTarget.PathAllowed(Exe("OTHER.exe"), root));

    [Fact(DisplayName = "AC-017.4 scope-backup-same-name-rejected·scope-root-same-name-rejected: 같은 이름이라도 다른 폴더는 안 된다")]
    public void SameNameElsewhere()
    {
        Assert.False(NativeTarget.PathAllowed(Exe("backup", "BITDoctorOrder.exe"), root));
        Assert.False(NativeTarget.PathAllowed(Exe("BITDoctorOrder.exe"), root));
    }

    [Theory(DisplayName = "AC-017.4 등록 위치는 고정 드라이브의 완전한 경로여야 한다(원본 ValidateRoot)")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(@"relative\path")]
    [InlineData(@"\\server\share\DrBIT50")]
    [InlineData(@"C:")]
    public void BadRoots(string path) => Assert.False(NativeTarget.IsValidRoot(path));

    [Fact(DisplayName = "AC-017.4 있는 폴더는 등록 위치로 받고, 없는 폴더는 받지 않는다")]
    public void GoodRoot()
    {
        Assert.True(NativeTarget.IsValidRoot(root));
        Assert.False(NativeTarget.IsValidRoot(root + "-missing"));
    }

    [Fact(DisplayName = "AC-017.4 잘못된 등록 위치면 후보 프로세스가 없다(짐작하지 않음)")]
    public void BadRootHasNoProcess() => Assert.Empty(new NativeTarget(@"\\server\share\DrBIT50").ProcessIds());
}
