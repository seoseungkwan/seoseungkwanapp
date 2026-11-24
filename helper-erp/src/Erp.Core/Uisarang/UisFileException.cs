using System;

namespace Erp.Core.Uisarang;

/// <summary>
/// .xls를 읽을 수 없음(깨짐·BIFF8 아님·빈 파일·시트 한도 넘음, spec erp-uisarang AC-4203.2).
/// 글은 늘 같은 고정 글이고 파일 이름·칸 글자·읽기 부품의 안쪽 예외(글에 칸 값이 들 수 있음)를 싣지 않는다(AC-4209.1).
/// 오류가 아니라 답 칸(unknownFiles)으로 센다(design.md 3-5).
/// </summary>
public sealed class UisFileException : Exception
{
    public const string FixedMessage = "의사랑 엑셀(.xls)을 읽을 수 없다";

    public UisFileException()
        : base(FixedMessage)
    {
    }
}
