using System;

namespace Precheck.Core.Reception.Settings;

/// <summary>로고 그림 형식. 로고 파일(LogoStore)의 첫 바이트 값이기도 하다(1 = PNG · 2 = JPEG).</summary>
public enum LogoKind
{
    Png = 1,
    Jpeg = 2,
}

/// <summary>
/// 올린 로고 그림 검사(spec reception-other-clinic design.md 4절·5절, AC-5706.1). 서명과 그림 크기 칸만 읽고 픽셀은 풀지 않는다
/// (줄이기는 고른 기기 브라우저가 한다. Core에는 그림 라이브러리가 없고, 큰·악성 그림을 총괄 PC에서 풀지 않는다).
/// Content-Type은 image/png·image/jpeg(대소문자 무시, 뒤에 다른 글 없음)이고 그 형식의 첫 바이트(PNG 서명 · JPEG FF D8 FF)와
/// 그림 크기(PNG IHDR · JPEG SOF0~SOF3)가 가로 1~1200·세로 1~300이어야 받는다.
/// </summary>
public static class LogoImage
{
    public const int MaxBytes = 2097152;
    public const int MaxWidth = 1200;
    public const int MaxHeight = 300;

    public const string PngType = "image/png";
    public const string JpegType = "image/jpeg";

    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    /// <summary>형식의 Content-Type.</summary>
    public static string ContentTypeOf(LogoKind kind) => kind switch
    {
        LogoKind.Png => PngType,
        LogoKind.Jpeg => JpegType,
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    /// <summary>받을 수 있는 로고 그림이면 true와 형식·가로·세로. 아니면 false(형식 Png·크기 0). 던지지 않는다.</summary>
    public static bool TryRead(byte[]? bytes, string? contentType, out LogoKind kind, out int width, out int height)
    {
        kind = LogoKind.Png;
        width = 0;
        height = 0;
        if (bytes == null || bytes.Length == 0 || bytes.Length > MaxBytes || contentType == null) return false;
        var type = contentType.Trim();
        long w;
        long h;
        if (string.Equals(type, PngType, StringComparison.OrdinalIgnoreCase))
        {
            if (!TryPng(bytes, out w, out h)) return false;
            kind = LogoKind.Png;
        }
        else if (string.Equals(type, JpegType, StringComparison.OrdinalIgnoreCase))
        {
            if (!TryJpeg(bytes, out w, out h)) return false;
            kind = LogoKind.Jpeg;
        }
        else
        {
            return false;
        }
        if (w < 1 || w > MaxWidth || h < 1 || h > MaxHeight)
        {
            kind = LogoKind.Png;
            return false;
        }
        width = (int)w;
        height = (int)h;
        return true;
    }

    /// <summary>PNG: 서명 8바이트 뒤 첫 조각이 IHDR(길이 13)이고 그 안의 가로·세로(4바이트 큰 끝).</summary>
    private static bool TryPng(byte[] b, out long width, out long height)
    {
        width = 0;
        height = 0;
        if (b.Length < 24) return false;
        for (var i = 0; i < PngSignature.Length; i++)
        {
            if (b[i] != PngSignature[i]) return false;
        }
        if (Be32(b, 8) != 13 || b[12] != (byte)'I' || b[13] != (byte)'H' || b[14] != (byte)'D' || b[15] != (byte)'R') return false;
        width = Be32(b, 16);
        height = Be32(b, 20);
        return true;
    }

    /// <summary>
    /// JPEG: FF D8 FF로 시작하고, 조각을 차례로 건너 SOS·EOI보다 먼저 나오는 SOF0~SOF3의 세로·가로(2바이트 큰 끝).
    /// 다른 SOF(계층·산술)·길이가 틀린 조각·잘린 파일은 false.
    /// </summary>
    private static bool TryJpeg(byte[] b, out long width, out long height)
    {
        width = 0;
        height = 0;
        if (b.Length < 4 || b[0] != 0xFF || b[1] != 0xD8 || b[2] != 0xFF) return false;
        var i = 2;
        while (i < b.Length)
        {
            if (b[i] != 0xFF) return false;
            while (i < b.Length && b[i] == 0xFF) i++;
            if (i >= b.Length) return false;
            var marker = b[i++];
            // 길이 없는 표시: TEM·RST0~7
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
            // 그림 크기보다 먼저 나오면 안 되는 표시: 첫 SOI 다시·EOI·SOS·0
            if (marker == 0xD8 || marker == 0xD9 || marker == 0xDA || marker == 0x00) return false;
            if (i + 2 > b.Length) return false;
            var length = (b[i] << 8) | b[i + 1];
            if (length < 2) return false;
            if (marker >= 0xC0 && marker <= 0xC3)
            {
                // 길이(2)·정밀도(1)·세로(2)·가로(2)
                if (length < 7 || i + 7 > b.Length) return false;
                height = (b[i + 3] << 8) | b[i + 4];
                width = (b[i + 5] << 8) | b[i + 6];
                return true;
            }
            // SOF5~7·9~11·13~15(계층·산술)는 받지 않는다. C4(DHT)·C8(JPG)·CC(DAC)는 보통 조각
            if (marker >= 0xC5 && marker <= 0xCF && marker != 0xC8 && marker != 0xCC) return false;
            i += length;
        }
        return false;
    }

    private static long Be32(byte[] b, int at) => ((long)b[at] << 24) | ((long)b[at + 1] << 16) | ((long)b[at + 2] << 8) | b[at + 3];
}
