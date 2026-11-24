using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Rules;

/// <summary>
/// spec erp-uisarang TASK-4 REQ-4201: 자료원 파일 data\source.json(UisSource, design.md 4-1·4-3, AC-4201.3)을 시험마다 새 임시 폴더로 쓰고 읽고 지운다.
/// 파일 = { "v": 1, "source": "uisarang", "folder": "desktop" | "profile" }(글자 그대로, 보호 없음 — 환자·병원 정보 없음).
/// </summary>
public sealed class UisSourceTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "erp-uis-source-" + Guid.NewGuid().ToString("N"));

    public UisSourceTests()
    {
        Directory.CreateDirectory(root);
    }

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }

    private string FilePath => Path.Combine(root, "source.json");

    private void WriteRaw(string text) => File.WriteAllBytes(FilePath, Encoding.UTF8.GetBytes(text));

    [Theory(DisplayName = "AC-4201.3 쓰기·읽기: WriteUisarang은 data\\source.json에 { v: 1, source: 'uisarang', folder } 세 칸만 BOM 없는 UTF-8 글자로 쓰고, Read는 그 폴더 종류를 돌려준다")]
    [InlineData(UisFolderKind.Desktop, "desktop")]
    [InlineData(UisFolderKind.Profile, "profile")]
    public void WriteThenRead(UisFolderKind folder, string name)
    {
        UisSource.WriteUisarang(root, folder);

        Assert.Equal("source.json", UisSource.FileName);
        var bytes = File.ReadAllBytes(FilePath);
        Assert.NotEqual(0xEF, bytes[0]);
        using (var json = JsonDocument.Parse(bytes))
        {
            var props = json.RootElement.EnumerateObject().Select(p => p.Name).ToArray();
            Assert.Equal(new[] { "v", "source", "folder" }, props);
            Assert.Equal(1, json.RootElement.GetProperty("v").GetInt32());
            Assert.Equal("uisarang", json.RootElement.GetProperty("source").GetString());
            Assert.Equal(name, json.RootElement.GetProperty("folder").GetString());
        }

        var read = UisSource.Read(root);
        Assert.NotNull(read);
        Assert.Equal(folder, read!.Folder);
    }

    [Fact(DisplayName = "AC-4201.3 쓰기: data 폴더가 없으면 만들고, 이미 있으면 바꿔 쓴다(임시 파일이 남지 않는다)")]
    public void WriteCreatesAndReplaces()
    {
        var data = Path.Combine(root, "data");

        UisSource.WriteUisarang(data, UisFolderKind.Desktop);
        UisSource.WriteUisarang(data, UisFolderKind.Profile);

        Assert.Equal(UisFolderKind.Profile, UisSource.Read(data)!.Folder);
        Assert.Equal(new[] { "source.json" }, Directory.GetFileSystemEntries(data).Select(entry => Path.GetFileName(entry)).ToArray());
    }

    [Fact(DisplayName = "AC-4201.3 없음: 파일이 없거나 data 폴더가 없으면 null(= 비트)")]
    public void MissingIsNull()
    {
        Assert.Null(UisSource.Read(root));
        Assert.Null(UisSource.Read(Path.Combine(root, "no-such-folder")));
    }

    [Theory(DisplayName = "AC-4201.3 모양 틀림은 null(= 비트): 깨진 JSON·객체 아님·판 다름·자료원 다름·폴더 값 다름·칸 빠짐·칸 더함·같은 칸 둘·뒤에 군글자")]
    [InlineData("")]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("\"uisarang\"")]
    [InlineData("{}")]
    [InlineData("{\"v\":2,\"source\":\"uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":\"1\",\"source\":\"uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1.5,\"source\":\"uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"bit\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"Uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":\"onedrive\"}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":\"Desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":null}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":0}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\"}")]
    [InlineData("{\"v\":1,\"folder\":\"desktop\"}")]
    [InlineData("{\"source\":\"uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":\"desktop\",\"extra\":1}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"source\":\"uisarang\",\"folder\":\"desktop\"}")]
    [InlineData("{\"v\":1,\"source\":\"uisarang\",\"folder\":\"desktop\"} x")]
    public void WrongShapeIsNull(string text)
    {
        WriteRaw(text);

        Assert.Null(UisSource.Read(root));
    }

    [Fact(DisplayName = "AC-4201.3 모양 틀림: 너무 큰 파일(4KB 넘음)·source.json이 폴더면 null")]
    public void TooBigOrFolderIsNull()
    {
        WriteRaw(new string(' ', 5000) + "{\"v\":1,\"source\":\"uisarang\",\"folder\":\"desktop\"}");
        Assert.Null(UisSource.Read(root));

        File.Delete(FilePath);
        Directory.CreateDirectory(FilePath);
        Assert.Null(UisSource.Read(root));
    }

    [Fact(DisplayName = "AC-4201.3 읽기: 칸 차례·빈칸·줄바꿈·UTF-8 BOM은 상관없다(모양만 본다)")]
    public void ReadToleratesFormatting()
    {
        WriteRaw("﻿{\r\n  \"folder\": \"profile\",\r\n  \"source\": \"uisarang\",\r\n  \"v\": 1\r\n}\r\n");

        Assert.Equal(UisFolderKind.Profile, UisSource.Read(root)!.Folder);
    }

    [Fact(DisplayName = "AC-4201.3 지우기: Delete는 source.json만 지우고(같은 폴더 다른 파일은 그대로) 그 뒤 Read는 null, 없을 때(파일·폴더) 지워도 예외 없음")]
    public void DeleteOnlySourceFile()
    {
        var other = Path.Combine(root, "registration.dat");
        File.WriteAllText(other, "fake");
        UisSource.WriteUisarang(root, UisFolderKind.Desktop);

        UisSource.Delete(root);

        Assert.False(File.Exists(FilePath));
        Assert.True(File.Exists(other));
        Assert.Null(UisSource.Read(root));
        UisSource.Delete(root);
        UisSource.Delete(Path.Combine(root, "no-such-folder"));
    }

    [Fact(DisplayName = "AC-4201.3 data 폴더 값이 비었으면(null·빈 글자) ArgumentException")]
    public void BlankDataDir()
    {
        Assert.ThrowsAny<ArgumentException>(() => UisSource.Read(""));
        Assert.ThrowsAny<ArgumentException>(() => UisSource.Read(null!));
        Assert.ThrowsAny<ArgumentException>(() => UisSource.WriteUisarang(" ", UisFolderKind.Desktop));
        Assert.ThrowsAny<ArgumentException>(() => UisSource.Delete(""));
    }
}
