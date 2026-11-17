using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Store;
using Precheck.Core.Tests.Reception.Xray;
using Xunit;

namespace Precheck.Core.Tests.Reception.Settings;

/// <summary>시험용 가짜 그림 바이트: 서명과 크기 칸만 바른 PNG·JPEG(픽셀은 없다).</summary>
internal static class LogoBytes
{
    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    private static byte[] Be32(long value) => new[] { (byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value };

    /// <summary>서명 + IHDR(길이 13·"IHDR"·가로·세로·나머지 5바이트·CRC 자리) + IEND.</summary>
    public static byte[] Png(long width, long height) =>
        PngSignature
            .Concat(Be32(13)).Concat(Encoding.ASCII.GetBytes("IHDR")).Concat(Be32(width)).Concat(Be32(height))
            .Concat(new byte[] { 8, 6, 0, 0, 0 }).Concat(new byte[4])
            .Concat(Be32(0)).Concat(Encoding.ASCII.GetBytes("IEND")).Concat(new byte[4])
            .ToArray();

    private static byte[] Segment(byte marker, params byte[] body) =>
        new byte[] { 0xFF, marker, (byte)((body.Length + 2) >> 8), (byte)(body.Length + 2) }.Concat(body).ToArray();

    /// <summary>SOI → APP0(JFIF) → DQT → SOF(marker, 세로·가로) → SOS → 자료 → EOI.</summary>
    public static byte[] Jpeg(int width, int height, byte sof = 0xC0, bool fill = false)
    {
        var app0 = Segment(0xE0, Encoding.ASCII.GetBytes("JFIF\0").Concat(new byte[] { 1, 1, 0, 0, 1, 0, 1, 0, 0 }).ToArray());
        var dqt = Segment(0xDB, new byte[65]);
        var frame = Segment(sof, 8, (byte)(height >> 8), (byte)height, (byte)(width >> 8), (byte)width, 1, 1, 0x11, 0);
        var scan = Segment(0xDA, 1, 1, 0, 0, 0x3F, 0);
        var head = new byte[] { 0xFF, 0xD8 };
        var filler = fill ? new byte[] { 0xFF, 0xFF } : new byte[0];
        return head.Concat(app0).Concat(filler).Concat(dqt).Concat(frame).Concat(scan).Concat(new byte[] { 0x12, 0x34, 0xFF, 0xD9 }).ToArray();
    }

    /// <summary>SOF 없이 SOS가 먼저 나오는 JPEG.</summary>
    public static byte[] JpegWithoutFrame() =>
        new byte[] { 0xFF, 0xD8 }.Concat(Segment(0xDB, new byte[65])).Concat(Segment(0xDA, 1, 1, 0, 0, 0x3F, 0)).Concat(new byte[] { 0xFF, 0xD9 }).ToArray();
}

/// <summary>
/// 로고 그림 검사(LogoImage: Content-Type·첫 바이트·그림 크기만 읽음, 픽셀을 풀지 않음)와 로고 파일(LogoStore: data\reception-logo.dat = 머리 + IProtector로 감싼 형식 한 바이트 + 그림),
/// spec reception-other-clinic design.md 4절, AC-5706.1(그림·파일 쪽. 길·설정 바꾸기는 TASK-3).
/// </summary>
public class LogoImageTests
{
    public static IEnumerable<object[]> GoodPictures() => new[]
    {
        new object[] { "PNG 1×1", LogoBytes.Png(1, 1), "image/png", LogoKind.Png, 1, 1 },
        new object[] { "PNG 1200×300", LogoBytes.Png(1200, 300), "image/png", LogoKind.Png, 1200, 300 },
        new object[] { "PNG 862×132(지금 로고)", LogoBytes.Png(862, 132), "image/png", LogoKind.Png, 862, 132 },
        new object[] { "PNG 대문자 Content-Type", LogoBytes.Png(10, 10), "IMAGE/PNG", LogoKind.Png, 10, 10 },
        new object[] { "JPEG SOF0 1200×300", LogoBytes.Jpeg(1200, 300), "image/jpeg", LogoKind.Jpeg, 1200, 300 },
        new object[] { "JPEG SOF1", LogoBytes.Jpeg(640, 160, 0xC1), "image/jpeg", LogoKind.Jpeg, 640, 160 },
        new object[] { "JPEG SOF2(점진)", LogoBytes.Jpeg(1, 1, 0xC2), "image/jpeg", LogoKind.Jpeg, 1, 1 },
        new object[] { "JPEG SOF3", LogoBytes.Jpeg(300, 100, 0xC3), "image/jpeg", LogoKind.Jpeg, 300, 100 },
        new object[] { "JPEG 채움 바이트", LogoBytes.Jpeg(256, 64, 0xC0, fill: true), "image/jpeg", LogoKind.Jpeg, 256, 64 },
    };

    [Theory(DisplayName = "AC-5706.1 image/png·image/jpeg와 그 첫 바이트(PNG 서명·JPEG FF D8 FF)이고 그림 크기(PNG IHDR·JPEG SOF0~SOF3)가 가로 1~1200·세로 1~300이면 받는다")]
    [MemberData(nameof(GoodPictures))]
    public void AcceptsPictures(string why, byte[] bytes, string type, LogoKind kind, int width, int height)
    {
        Assert.True(LogoImage.TryRead(bytes, type, out var readKind, out var readWidth, out var readHeight), why);
        Assert.Equal((kind, width, height), (readKind, readWidth, readHeight));
    }

    private static byte[] Truncated(byte[] bytes, int length) => bytes.Take(length).ToArray();

    private static byte[] Changed(byte[] bytes, int at, byte value)
    {
        var copy = bytes.ToArray();
        copy[at] = value;
        return copy;
    }

    private static readonly Dictionary<string, (byte[] Bytes, string? Type)> BadPictures = new Dictionary<string, (byte[] Bytes, string? Type)>(StringComparer.Ordinal)
    {
        ["PNG 바이트에 image/jpeg"] = (LogoBytes.Png(10, 10), "image/jpeg"),
        ["JPEG 바이트에 image/png"] = (LogoBytes.Jpeg(10, 10), "image/png"),
        ["image/gif"] = (LogoBytes.Png(10, 10), "image/gif"),
        ["image/webp"] = (LogoBytes.Png(10, 10), "image/webp"),
        ["image/jpg"] = (LogoBytes.Jpeg(10, 10), "image/jpg"),
        ["Content-Type 없음"] = (LogoBytes.Png(10, 10), null),
        ["Content-Type 빈 글"] = (LogoBytes.Png(10, 10), ""),
        ["Content-Type 뒤에 다른 글"] = (LogoBytes.Png(10, 10), "image/png; charset=utf-8"),
        ["PNG 가로 0"] = (LogoBytes.Png(0, 10), "image/png"),
        ["PNG 가로 1201"] = (LogoBytes.Png(1201, 10), "image/png"),
        ["PNG 세로 0"] = (LogoBytes.Png(10, 0), "image/png"),
        ["PNG 세로 301"] = (LogoBytes.Png(10, 301), "image/png"),
        ["PNG 아주 큰 가로(부호 넘침)"] = (LogoBytes.Png(0xFFFFFFFFL, 10), "image/png"),
        ["PNG 서명 틀림"] = (Changed(LogoBytes.Png(10, 10), 1, (byte)'X'), "image/png"),
        ["PNG 첫 조각이 IHDR 아님"] = (Changed(LogoBytes.Png(10, 10), 12, (byte)'X'), "image/png"),
        ["PNG IHDR 길이 틀림"] = (Changed(LogoBytes.Png(10, 10), 11, 12), "image/png"),
        ["PNG 잘림(크기 칸 전)"] = (Truncated(LogoBytes.Png(10, 10), 20), "image/png"),
        ["PNG 서명만"] = (Truncated(LogoBytes.Png(10, 10), 8), "image/png"),
        ["JPEG 가로 0"] = (LogoBytes.Jpeg(0, 10), "image/jpeg"),
        ["JPEG 가로 1201"] = (LogoBytes.Jpeg(1201, 10), "image/jpeg"),
        ["JPEG 세로 0(DNL)"] = (LogoBytes.Jpeg(10, 0), "image/jpeg"),
        ["JPEG 세로 301"] = (LogoBytes.Jpeg(10, 301), "image/jpeg"),
        ["JPEG SOF5(계층)"] = (LogoBytes.Jpeg(10, 10, 0xC5), "image/jpeg"),
        ["JPEG SOF9(산술)"] = (LogoBytes.Jpeg(10, 10, 0xC9), "image/jpeg"),
        ["JPEG SOF 없이 SOS"] = (LogoBytes.JpegWithoutFrame(), "image/jpeg"),
        ["JPEG 첫 바이트 틀림"] = (Changed(LogoBytes.Jpeg(10, 10), 2, 0x00), "image/jpeg"),
        ["JPEG SOI만"] = (new byte[] { 0xFF, 0xD8, 0xFF }, "image/jpeg"),
        ["JPEG 잘림(SOF 가운데)"] = (Truncated(LogoBytes.Jpeg(10, 10), 2 + 18 + 69 + 6), "image/jpeg"),
        ["JPEG 조각 길이 1"] = (new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x01, 0xFF, 0xC0 }, "image/jpeg"),
        ["빈 바이트"] = (new byte[0], "image/png"),
        ["2097152바이트 넘음"] = (LogoBytes.Png(10, 10).Concat(new byte[2097152]).ToArray(), "image/png"),
    };

    public static IEnumerable<object[]> BadPictureNames() => BadPictures.Keys.Select(k => new object[] { k });

    [Theory(DisplayName = "AC-5706.1 Content-Type이 image/png·image/jpeg가 아니거나 첫 바이트·그림 크기가 틀리면 받지 않는다(던지지 않음)")]
    [MemberData(nameof(BadPictureNames))]
    public void RejectsPictures(string why)
    {
        var (bytes, type) = BadPictures[why];
        Assert.False(LogoImage.TryRead(bytes, type, out _, out _, out _), why);
    }

    [Fact(DisplayName = "AC-5706.1 null 바이트는 받지 않고, 형식마다 Content-Type은 image/png·image/jpeg다")]
    public void NullAndContentTypes()
    {
        Assert.False(LogoImage.TryRead(null, "image/png", out _, out _, out _));
        Assert.Equal("image/png", LogoImage.ContentTypeOf(LogoKind.Png));
        Assert.Equal("image/jpeg", LogoImage.ContentTypeOf(LogoKind.Jpeg));
        Assert.Equal(2097152, LogoImage.MaxBytes);
    }
}

public class LogoStoreTests : IDisposable
{
    private const string FileName = "reception-logo.dat";

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-logo-" + Guid.NewGuid().ToString("N"));
    private readonly XorProtector protector = new XorProtector();
    private readonly List<string> reports = new List<string>();

    public void Dispose()
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, true);
    }

    private string FilePath => Path.Combine(folder, FileName);

    private LogoStore Open(IProtector? with = null) => new LogoStore(new StoreFolder(folder), with ?? protector, code => { lock (reports) reports.Add(code); });

    private string[] FolderFiles() => Directory.Exists(folder)
        ? Directory.GetFileSystemEntries(folder).Select(p => Path.GetFileName(p)!).OrderBy(n => n, StringComparer.Ordinal).ToArray()
        : new string[0];

    [Fact(DisplayName = "AC-5706.1 로고 파일이 없으면 Read는 null·Exists는 거짓이고 기록이 없다")]
    public void MissingFile()
    {
        var store = Open();
        Assert.Null(store.Read());
        Assert.False(store.Exists());
        Assert.Empty(reports);
        Assert.Empty(FolderFiles());
    }

    [Fact(DisplayName = "AC-5706.1 Save는 data\\reception-logo.dat 하나에 머리 PRECHECK-STORE-1 + IProtector(형식 한 바이트 1=PNG·2=JPEG + 그림)로 쓰고, 다시 연 LogoStore도 같은 그림을 읽는다")]
    public void SaveThenRead()
    {
        var png = LogoBytes.Png(862, 132);
        Open().Save(LogoKind.Png, png);
        Assert.Equal(new[] { FileName }, FolderFiles());
        var data = File.ReadAllBytes(FilePath);
        Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, 17));
        Assert.Equal(new byte[] { 1 }.Concat(png).ToArray(), protector.LastPlain);
        Assert.False(data.Skip(17).Take(png.Length).SequenceEqual(png));
        var picture = Open().Read();
        Assert.NotNull(picture);
        Assert.Equal(LogoKind.Png, picture!.Kind);
        Assert.Equal("image/png", picture.ContentType);
        Assert.Equal(png, picture.Bytes);
        Assert.True(Open().Exists());

        var jpeg = LogoBytes.Jpeg(400, 100);
        var store = Open();
        store.Save(LogoKind.Jpeg, jpeg);
        Assert.Equal(new byte[] { 2 }.Concat(jpeg).ToArray(), protector.LastPlain);
        Assert.Equal((LogoKind.Jpeg, "image/jpeg"), (store.Read()!.Kind, store.Read()!.ContentType));
        Assert.Equal(jpeg, Open().Read()!.Bytes);
        Assert.Equal(new[] { FileName }, FolderFiles());
        Assert.Empty(reports);
    }

    public static IEnumerable<object[]> BrokenFiles() => new[]
    {
        new object[] { "빈 파일", new byte[0] },
        new object[] { "머리만", Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n") },
        new object[] { "쓰레기 바이트", Encoding.ASCII.GetBytes("garbage-bytes-0123456789") },
    };

    [Theory(DisplayName = "AC-5706.1 깨진 로고 파일은 Read가 null이고 기록에 E-STORE-BROKEN 번호만 남으며, 다음 Save는 바르게 쓴다")]
    [MemberData(nameof(BrokenFiles))]
    public void BrokenFile(string why, byte[] data)
    {
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(FilePath, data);
        var store = Open();
        Assert.True(store.Read() == null, why);
        Assert.Equal(new[] { BitErrors.StoreBroken }, reports.Distinct().ToArray());
        store.Save(LogoKind.Png, LogoBytes.Png(5, 5));
        Assert.Equal(LogoBytes.Png(5, 5), Open().Read()!.Bytes);
    }

    [Fact(DisplayName = "AC-5706.1 풀면 형식 바이트가 틀리거나 그림이 없으면 깨진 파일이다")]
    public void BrokenPlain()
    {
        var store = Open();
        store.Save(LogoKind.Png, LogoBytes.Png(5, 5));
        var header = Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n");
        foreach (var plain in new[] { new byte[] { 3, 1, 2 }, new byte[] { 1 }, new byte[0] })
        {
            File.WriteAllBytes(FilePath, header.Concat(protector.Protect(plain)).ToArray());
            Assert.Null(Open().Read());
        }
        Assert.Null(Open(new XorProtector(0x33)).Read());
        Assert.All(reports, code => Assert.Equal(BitErrors.StoreBroken, code));
        Assert.NotEmpty(reports);
    }

    [Fact(DisplayName = "AC-5706.1 쓰지 못하면(암호화 실패·바꿀 자리를 못 씀) E-STORE-FAILED이고 앞 그림·폴더는 그대로다")]
    public void SaveFailure()
    {
        var store = Open();
        store.Save(LogoKind.Png, LogoBytes.Png(5, 5));
        var before = File.ReadAllBytes(FilePath);
        protector.FailProtect = true;
        Assert.Equal(BitErrors.StoreFailed, Assert.Throws<BitException>(() => store.Save(LogoKind.Png, LogoBytes.Png(6, 6))).Code);
        Assert.Equal(before, File.ReadAllBytes(FilePath));
        Assert.Equal(new[] { FileName }, FolderFiles());

        protector.FailProtect = false;
        File.Delete(FilePath);
        Directory.CreateDirectory(FilePath);
        Assert.Equal(BitErrors.StoreFailed, Assert.Throws<BitException>(() => Open().Save(LogoKind.Png, LogoBytes.Png(6, 6))).Code);
        Assert.Equal(new[] { FileName }, FolderFiles());
    }

    [Fact(DisplayName = "AC-5706.1 빈 그림·null·2097152바이트를 넘는 그림은 저장하지 않는다(ArgumentException, 파일 없음)")]
    public void SaveRejectsBadInput()
    {
        Assert.ThrowsAny<ArgumentException>(() => Open().Save(LogoKind.Png, new byte[0]));
        Assert.ThrowsAny<ArgumentException>(() => Open().Save(LogoKind.Png, null!));
        Assert.ThrowsAny<ArgumentException>(() => Open().Save(LogoKind.Png, new byte[2097153]));
        Assert.ThrowsAny<ArgumentException>(() => Open().Save((LogoKind)9, LogoBytes.Png(5, 5)));
        Assert.Empty(FolderFiles());
    }

    [Fact(DisplayName = "AC-5706.1 2097152바이트 그림도 저장하고 읽는다(파일 한도 안)")]
    public void SavesLargestPicture()
    {
        var big = LogoBytes.Png(1200, 300).Concat(new byte[2097152 - LogoBytes.Png(1200, 300).Length]).ToArray();
        Assert.Equal(2097152, big.Length);
        Open().Save(LogoKind.Png, big);
        Assert.Equal(big, Open().Read()!.Bytes);
        Assert.Empty(reports);
    }
}
