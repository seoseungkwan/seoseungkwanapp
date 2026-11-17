using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Precheck.Core.PtSlip;

/// <summary>차트번호 글 정리 결과 종류.</summary>
public enum ChartKind
{
    /// <summary>아무것도 안 쳤거나 빈칸뿐.</summary>
    Empty,

    /// <summary>숫자가 없거나 전부 0이거나 15자리 이상(DB에 묻지 않는다).</summary>
    Invalid,

    /// <summary>찾을 번호(1~14자리, 앞자리 0 없음).</summary>
    Ok,
}

/// <summary>차트번호 칸 글(AC-6402.1): 숫자만 남기고 앞의 0을 뺀 1~14자리만 찾는다.</summary>
public sealed class ChartInput
{
    public const int MaxDigits = 14;

    private ChartInput(ChartKind kind, string number)
    {
        Kind = kind;
        Number = number;
    }

    public ChartKind Kind { get; }

    /// <summary>Ok일 때 찾을 번호. 아니면 빈 글.</summary>
    public string Number { get; }

    public static ChartInput Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return new ChartInput(ChartKind.Empty, "");
        var digits = new StringBuilder();
        foreach (var c in text!)
        {
            if (c >= '0' && c <= '9') digits.Append(c);
        }
        var number = digits.ToString().TrimStart('0');
        return number.Length >= 1 && number.Length <= MaxDigits
            ? new ChartInput(ChartKind.Ok, number)
            : new ChartInput(ChartKind.Invalid, "");
    }
}

/// <summary>
/// 고르기 창의 항목·부위(AC-6402.2). 항목은 켜고 끈다. 쪽(오른·왼·양)을 누른 뒤 부위를 누르면 "오른 어깨"로 들어가고 쪽은 풀린다.
/// 같은 부위 글은 두 번 안 들어가고 ✕(RemovePart)로 뺀다. 종이 글은 누른 차례로 ", "로 잇는다.
/// </summary>
public sealed class SlipPicks
{
    private const string Separator = ", ";

    private readonly List<string> items = new List<string>();
    private readonly List<string> parts = new List<string>();

    /// <summary>쪽 버튼 글(차례대로).</summary>
    public static IReadOnlyList<string> Sides { get; } = new[] { "오른", "왼", "양" };

    /// <summary>켠 항목(누른 차례).</summary>
    public IReadOnlyList<string> Items => items.ToArray();

    /// <summary>넣은 부위(누른 차례, 쪽이 붙은 글 그대로).</summary>
    public IReadOnlyList<string> Parts => parts.ToArray();

    /// <summary>눌러 둔 쪽(다음 부위에 붙음). 없으면 null.</summary>
    public string? PendingSide { get; private set; }

    public string ItemsText => string.Join(Separator, items);

    public string PartsText => string.Join(Separator, parts);

    /// <summary>항목을 켜거나(끝에 붙음) 끈다.</summary>
    public void ToggleItem(string item)
    {
        if (string.IsNullOrEmpty(item)) return;
        if (!items.Remove(item)) items.Add(item);
    }

    public bool IsItemOn(string item) => items.Contains(item, StringComparer.Ordinal);

    /// <summary>쪽을 고른다. 같은 쪽을 다시 누르면 풀리고 다른 쪽이면 바뀐다. Sides 밖의 글은 무시한다.</summary>
    public void ToggleSide(string side)
    {
        if (!Sides.Contains(side, StringComparer.Ordinal)) return;
        PendingSide = string.Equals(PendingSide, side, StringComparison.Ordinal) ? null : side;
    }

    /// <summary>부위를 넣는다(눌러 둔 쪽이 있으면 "쪽 부위"). 같은 글이 있으면 넣지 않는다. 어느 쪽이든 눌러 둔 쪽은 풀린다.</summary>
    public void AddPart(string part)
    {
        if (string.IsNullOrEmpty(part)) return;
        var text = PendingSide == null ? part : PendingSide + " " + part;
        PendingSide = null;
        if (!parts.Contains(text, StringComparer.Ordinal)) parts.Add(text);
    }

    /// <summary>넣은 부위 글 하나를 뺀다(✕).</summary>
    public void RemovePart(string part)
    {
        if (part != null) parts.Remove(part);
    }
}
