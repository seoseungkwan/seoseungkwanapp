using System;

namespace Precheck.Core.Input;

/// <summary>원본 vendor/secure_bridge/MemoApproval.cs 그대로: 글자 그대로 비교하고 윈도우 줄바꿈 표기만 맞춘다.</summary>
public static class MemoApproval
{
    public static bool Matches(string? current, string? expected) =>
        current != null && expected != null &&
        string.Equals(current.Replace("\r\n", "\n"), expected.Replace("\r\n", "\n"), StringComparison.Ordinal);

    public static bool TryWrite(Func<string?> read, string expected, Func<bool> samePatient, Action write)
    {
        if (read == null) throw new ArgumentNullException(nameof(read));
        if (samePatient == null) throw new ArgumentNullException(nameof(samePatient));
        if (write == null) throw new ArgumentNullException(nameof(write));

        // 대상을 먼저, 내용을 마지막에, 쓰는 방법마다 바로 앞에서 다시 확인한다. 바뀐 값은 다시 시도하거나 덮어쓰지 않는다
        if (!samePatient() || !Matches(read(), expected)) return false;
        write();
        return true;
    }
}

public enum MemoWrite
{
    /// <summary>바로 앞 확인에서 막혀 아무것도 쓰지 않았다.</summary>
    NotWritten,

    /// <summary>쓴 뒤 다시 읽은 값이 같다.</summary>
    WrittenSame,

    /// <summary>썼지만 다시 읽은 값이 다르다.</summary>
    WrittenDifferent,
}

/// <summary>
/// 원본 UChartAutomation.WriteMemo. approvedExisting은 쓰기 바로 앞에 칸에 있어야 할 글이다: 빈칸 확인에서 읽은 값이거나, 바꾸는 사람이면 바로 앞에서 읽어 승인과 견준 글이다(AC-037.1·AC-037.6).
/// </summary>
public static class MemoWriter
{
    public static MemoWrite Write(IChartUi ui, string text, string approvedExisting, Func<bool> samePatient)
    {
        if (ui == null) throw new ArgumentNullException(nameof(ui));

        ui.SelectAllMemo();
        if (!MemoApproval.TryWrite(ui.ReadMemo, approvedExisting, samePatient, () => ui.ReplaceMemoSelection(text))) return MemoWrite.NotWritten;
        if (ChartRules.Same(ui.ReadMemo(), text)) return MemoWrite.WrittenSame;
        try
        {
            if (ui.IsValuePatternSupported()
                && !MemoApproval.TryWrite(ui.ReadMemo, approvedExisting, samePatient, () => ui.SetMemoValue(text)))
            {
                return MemoWrite.WrittenDifferent;
            }
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // 원본도 값 패턴 실패를 삼키고 아래에서 다시 읽어 판단한다
        }
        return ChartRules.Same(ui.ReadMemo(), text) ? MemoWrite.WrittenSame : MemoWrite.WrittenDifferent;
    }
}
