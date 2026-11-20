using System;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 메모 칸 글과 새 글 합치기(AC-7503.1). 윈도우 층은 칸 끝에 커서를 두고 AppendText만 친다(있던 글은 건드리지 않는다).
/// 주사 차수 찾기는 지난 메모를 읽는 규칙과 같다('/'로 나눈 조각 중 ESWT·도수 아닌 조각의 'N차').
/// </summary>
public static class MemoMerge
{
    /// <summary>비었으면 새 글, 있으면 '있던 글/새 글'(끝이 이미 '/'면 하나만). 이미 주사 'N차'가 있으면 칸 글 그대로 Skipped.</summary>
    public static (string Text, bool Skipped) Merge(string? current, string add)
    {
        var text = current ?? "";
        if (HasInjectionCount(text)) return (text, true);
        return (text + AppendText(text, add), false);
    }

    /// <summary>칸 끝에 칠 글: 칸이 비었거나(빈칸뿐 포함) 끝이 '/'면 새 글, 아니면 '/' + 새 글.</summary>
    public static string AppendText(string? current, string add)
    {
        var text = current ?? "";
        var adding = add ?? "";
        return string.IsNullOrWhiteSpace(text) || text.EndsWith("/", StringComparison.Ordinal) ? adding : "/" + adding;
    }

    /// <summary>메모에 주사 'N차'가 이미 있나(ESWT·도수 차수는 주사 아님).</summary>
    public static bool HasInjectionCount(string? memo) => InjectionRule.MemoNumber(memo) != null;
}
