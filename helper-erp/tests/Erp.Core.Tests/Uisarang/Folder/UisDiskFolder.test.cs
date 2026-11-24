using System;
using System.IO;
using System.Linq;
using System.Text;
using Erp.Core.Uisarang;
using Precheck.Core.Protocol;
using Xunit;
using Xunit.Abstractions;

namespace Erp.Core.Tests.Uisarang.Folder;

/// <summary>
/// spec erp-uisarang TASK-9 AC-4202.2: 엑셀 폴더 다루기 UisDiskFolder(design.md 4-1·3-5)를 실제 임시 폴더로 시험한다.
/// 파일 내용은 지은 바이트뿐이다(실제 의원 파일 없음).
/// </summary>
public class UisDiskFolderTests
{
    private const string FolderFailed = "E-UIS-FOLDER";

    private readonly ITestOutputHelper output;

    public UisDiskFolderTests(ITestOutputHelper output)
    {
        this.output = output;
    }

    private static string[] Names(IUisFolder folder) => folder.List().Select(file => file.Name).ToArray();

    private static UisFile Only(IUisFolder folder, string name) => folder.List().Single(file => file.Name == name);

    private static void FolderError(Action action)
    {
        var error = Assert.Throws<HelperException>(action);
        Assert.Equal(FolderFailed, error.Code);
        // 글은 번호뿐 — 폴더 경로(사용자 이름이 든다)·안쪽 예외를 싣지 않는다
        Assert.Equal(FolderFailed, error.Message);
        Assert.Null(error.InnerException);
    }

    [Fact(DisplayName = "AC-4202.2 폴더가 없으면 중간 폴더까지 만들고, 빈 폴더 목록은 비었다")]
    public void CreatesMissingFolder()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("바탕화면", "ERP마감");
        Assert.False(Directory.Exists(path));

        var folder = new UisDiskFolder(path);

        Assert.True(Directory.Exists(path));
        Assert.Empty(folder.List());
    }

    [Fact(DisplayName = "AC-4202.2 이미 있는 폴더는 그대로 쓰고 안의 파일을 건드리지 않는다")]
    public void KeepsExistingFolder()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var file = temp.Write(Path.Combine("ERP마감", "통계-일일수입통계.xls"), new byte[] { 1, 2, 3 });

        var folder = new UisDiskFolder(path);

        Assert.Equal(new[] { "통계-일일수입통계.xls" }, Names(folder));
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(file));
    }

    [Fact(DisplayName = "AC-4202.2 바로 아래 확장자 .xls(대소문자 무시) 보통 파일만 이름 차례로 낸다 — 하위 폴더·그 안 파일·다른 확장자(.xlsx·.xls.txt·.csv·확장자 없음)는 내지 않고 Length는 바이트 수")]
    public void ListsOnlyXlsFilesInNameOrder()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        temp.Write(Path.Combine("ERP마감", "b.xls"), new byte[3]);
        temp.Write(Path.Combine("ERP마감", "A.XLS"), new byte[5]);
        temp.Write(Path.Combine("ERP마감", "통계-처방.Xls"), new byte[7]);
        temp.Write(Path.Combine("ERP마감", "c.xlsx"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "d.xls.txt"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "e.csv"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "xls"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "f.xl"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "sub", "g.xls"), new byte[1]);
        Directory.CreateDirectory(temp.PathOf("ERP마감", "folder.xls"));
        temp.Write(Path.Combine("ERP마감", "folder.xls", "inner.xls"), new byte[1]);

        var folder = new UisDiskFolder(path);
        var files = folder.List();

        Assert.Equal(new[] { "A.XLS", "b.xls", "통계-처방.Xls" }, files.Select(file => file.Name).ToArray());
        Assert.Equal(new long[] { 5, 3, 7 }, files.Select(file => file.Length).ToArray());
    }

    [Fact(DisplayName = "AC-4202.2 폴더 안 연결 폴더(이름 x.xls)는 내지 않는다")]
    public void SkipsLinkedFolderNamedXls()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var target = temp.PathOf("다른곳");
        temp.Write(Path.Combine("다른곳", "inner.xls"), new byte[1]);
        temp.Write(Path.Combine("ERP마감", "a.xls"), new byte[1]);
        if (!UisLinks.TryFolderLink(temp.PathOf("ERP마감", "j.xls"), target))
        {
            output.WriteLine("폴더 연결을 만들 수 없어 건너뜀");
            return;
        }

        Assert.Equal(new[] { "a.xls" }, Names(new UisDiskFolder(path)));
    }

    [Fact(DisplayName = "AC-4202.2 연결(reparse) 파일은 내지 않는다 (연결 파일을 만들 수 없는 PC에서는 건너뜀)")]
    public void SkipsLinkedFile()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var target = temp.Write(Path.Combine("다른곳", "real.xls"), new byte[4]);
        temp.Write(Path.Combine("ERP마감", "a.xls"), new byte[1]);
        if (!UisLinks.TryFileLink(temp.PathOf("ERP마감", "link.xls"), target))
        {
            output.WriteLine("파일 연결(심볼릭 링크)을 만들 수 없어 건너뜀 — 개발자 모드·관리자 권한 없음");
            return;
        }

        Assert.Equal(new[] { "a.xls" }, Names(new UisDiskFolder(path)));
    }

    [Fact(DisplayName = "AC-4202.2 폴더가 연결(reparse)이면 E-UIS-FOLDER이고 가리키는 곳에 아무것도 만들지 않는다")]
    public void LinkedFolderIsRefused()
    {
        using var temp = new UisTempDir();
        var target = temp.PathOf("가리키는곳");
        Directory.CreateDirectory(target);
        temp.Write(Path.Combine("가리키는곳", "a.xls"), new byte[1]);
        var link = temp.PathOf("ERP마감");
        Assert.True(UisLinks.TryFolderLink(link, target), "폴더 연결(윈도우 junction)을 만들지 못했다");

        FolderError(() => new UisDiskFolder(link));
        Assert.Equal(new[] { "a.xls" }, Directory.GetFileSystemEntries(target).Select(Path.GetFileName).ToArray());
    }

    [Fact(DisplayName = "AC-4202.2 폴더를 만들 수 없으면 E-UIS-FOLDER: 같은 이름 파일이 있음·부모가 파일")]
    public void CannotCreateFolder()
    {
        using var temp = new UisTempDir();
        var file = temp.Write("ERP마감", "파일");

        FolderError(() => new UisDiskFolder(file));
        FolderError(() => new UisDiskFolder(Path.Combine(file, "ERP마감")));
        Assert.True(File.Exists(file));
    }

    [Fact(DisplayName = "AC-4202.2 목록을 못 읽으면 E-UIS-FOLDER(만든 뒤 폴더가 사라짐)")]
    public void ListFailsWhenFolderVanished()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var folder = new UisDiskFolder(path);
        Directory.Delete(path);

        FolderError(() => folder.List());
    }

    [Fact(DisplayName = "AC-4202.2 IsOpen: 다른 핸들이 FileShare.None으로 열고 있으면 true, 읽기·쓰기 공유로 열고 있어도 독점 열기가 안 되므로 true, 닫으면 false")]
    public void IsOpenWhileAnotherHandleHoldsFile()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var file = temp.Write(Path.Combine("ERP마감", "통계-일일수입통계.xls"), new byte[] { 9, 9 });
        var folder = new UisDiskFolder(path);
        var listed = Only(folder, "통계-일일수입통계.xls");

        Assert.False(folder.IsOpen(listed));
        using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            Assert.True(folder.IsOpen(listed));
        }
        Assert.False(folder.IsOpen(listed));
        using (new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            Assert.True(folder.IsOpen(listed));
        }
        Assert.False(folder.IsOpen(listed));
        // 보기만 하고 파일을 바꾸지 않는다
        Assert.Equal(new byte[] { 9, 9 }, File.ReadAllBytes(file));
    }

    [Fact(DisplayName = "AC-4202.2 Read는 파일 바이트 그대로, 읽을 수 없으면(사라짐·잠김) 고정 글 UisFileException(경로 없음)")]
    public void ReadsBytes()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var bytes = Encoding.UTF8.GetBytes("가짜 엑셀 바이트");
        var file = temp.Write(Path.Combine("ERP마감", "a.xls"), bytes);
        temp.Write(Path.Combine("ERP마감", "b.xls"), new byte[] { 1 });
        var folder = new UisDiskFolder(path);
        var a = Only(folder, "a.xls");
        var b = Only(folder, "b.xls");

        Assert.Equal(bytes, folder.Read(a));

        if (UisLinks.OnWindows)
        {
            using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                var locked = Assert.Throws<UisFileException>(() => folder.Read(a));
                Assert.Equal(UisFileException.FixedMessage, locked.Message);
                Assert.Null(locked.InnerException);
            }
        }

        File.Delete(temp.PathOf("ERP마감", "b.xls"));
        var gone = Assert.Throws<UisFileException>(() => folder.Read(b));
        Assert.Equal(UisFileException.FixedMessage, gone.Message);
        Assert.Null(gone.InnerException);
    }

    [Fact(DisplayName = "AC-4202.2 Delete: 지우면 true이고 파일이 없다, 읽기 전용 표시가 있어도 지운다, 이미 없으면 true")]
    public void DeletesFile()
    {
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var plain = temp.Write(Path.Combine("ERP마감", "a.xls"), new byte[] { 1 });
        var readOnly = temp.Write(Path.Combine("ERP마감", "b.xls"), new byte[] { 2 });
        File.SetAttributes(readOnly, FileAttributes.ReadOnly);
        var folder = new UisDiskFolder(path);
        var a = Only(folder, "a.xls");
        var b = Only(folder, "b.xls");

        Assert.True(folder.Delete(a));
        Assert.False(File.Exists(plain));
        Assert.True(folder.Delete(b));
        Assert.False(File.Exists(readOnly));
        Assert.True(folder.Delete(a));
        Assert.Empty(folder.List());
    }

    [Fact(DisplayName = "AC-4202.2 Delete: 다른 핸들이 열고 있어 못 지우면 예외 없이 false이고 파일은 그대로 (윈도우만)")]
    public void DeleteFailsWhileOpen()
    {
        if (!UisLinks.OnWindows)
        {
            output.WriteLine("열린 파일도 지워지는 운영체제라 건너뜀");
            return;
        }
        using var temp = new UisTempDir();
        var path = temp.PathOf("ERP마감");
        var file = temp.Write(Path.Combine("ERP마감", "통계-내원일별환자현황.xls"), new byte[] { 7 });
        var folder = new UisDiskFolder(path);
        var listed = Only(folder, "통계-내원일별환자현황.xls");

        using (new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            Assert.False(folder.Delete(listed));
            Assert.True(File.Exists(file));
        }
        Assert.True(folder.Delete(listed));
        Assert.False(File.Exists(file));
    }

    [Fact(DisplayName = "AC-4202.2 폴더 밖을 가리키는 이름(경로 글자·..·.xls 아님)은 IsOpen·Read·Delete가 받지 않는다")]
    public void RefusesNamesOutsideFolder()
    {
        using var temp = new UisTempDir();
        var outside = temp.Write("밖.xls", new byte[] { 1 });
        var folder = new UisDiskFolder(temp.PathOf("ERP마감"));

        foreach (var name in new[] { Path.Combine("..", "밖.xls"), "../밖.xls", outside, "", "a.txt", "." })
        {
            var file = new UisFile(name, 1);
            Assert.Throws<ArgumentException>(() => folder.IsOpen(file));
            Assert.Throws<ArgumentException>(() => folder.Read(file));
            Assert.Throws<ArgumentException>(() => folder.Delete(file));
        }
        Assert.True(File.Exists(outside));
    }
}
