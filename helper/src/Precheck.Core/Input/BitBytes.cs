using System;

namespace Precheck.Core.Input;

/// <summary>
/// 비트 메모 칸 바이트(clinic-profile AC-6611.4). 비트 청구메모 칸 OcmBilCmt는 varchar(3000)이다(2026-11-18 비트 DB 칸 정보로 확인).
/// 글자(UTF-16 코드 단위)마다 ASCII면 1, 나머지(한글 등)는 2로 센다. 웹 src/lib/precheck/bitBytes.ts와 같은 답이고 두 쪽 시험이 같은 사례를 본다.
/// 비트에 들어가는 글(윈도우 줄바꿈)을 센다.
/// </summary>
public static class BitBytes
{
    /// <summary>비트 메모 칸 한도(바이트).</summary>
    public const int MaxMemo = 3000;

    public static int Of(string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var bytes = 0;
        foreach (var c in text) bytes += c < 0x80 ? 1 : 2;
        return bytes;
    }
}
