using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 칸 하나를 화면 글과 견준 결과(design.md 1절). 숫자만 갖는다: 화면 글·칸 값·열쇠(내원번호·차트번호)는 들고 있지 않다(AC-1401.10).
/// 열쇠마다 한 가지로만 센다: 똑같음 → 이어 똑같음(붙임) → 이어 똑같음(띄움) → 품음 순서로 먼저 맞는 것.
/// </summary>
public sealed class ProbeScore
{
    public ProbeScore(int compared, int same, int joinedPieces, int joinedLines, int contains, int maxRows)
    {
        Compared = compared;
        Same = same;
        JoinedPieces = joinedPieces;
        JoinedLines = joinedLines;
        Contains = contains;
        MaxRows = maxRows;
    }

    /// <summary>견준 열쇠(내원·환자) 수: 화면 글이 비지 않았고 이 칸의 줄이 하나라도 있는 열쇠.</summary>
    public int Compared { get; }

    /// <summary>줄 하나가 맞춘 뒤 화면 글과 똑같다.</summary>
    public int Same { get; }

    /// <summary>줄 하나로는 아니지만 줄들을 읽은 순서대로 그대로 붙이면 똑같다(긴 글을 잘라 여러 줄에 둔 칸).</summary>
    public int JoinedPieces { get; }

    /// <summary>줄들을 읽은 순서대로 사이를 띄워(줄바꿈) 이으면 똑같다(한 줄에 한 가지씩 둔 칸).</summary>
    public int JoinedLines { get; }

    /// <summary>위 셋이 아니고, 줄 하나나 이은 글과 화면 글 가운데 한쪽이 다른 쪽을 품는다(품긴 쪽이 네 글자 이상).</summary>
    public int Contains { get; }

    /// <summary>읽은 줄 모두에서 열쇠 하나에 붙은 가장 많은 줄 수.</summary>
    public int MaxRows { get; }
}

/// <summary>
/// 확인 명령의 견주기(AC-1401.4 증상·AC-1401.5 이름·AC-1401.6 접수 메모). 순수 계산이고 값을 남기지 않는다.
/// 견주기 전에 앞뒤 공백·줄바꿈(CRLF/LF)·연속 공백을 한 칸으로 줄인다(<see cref="Normalize"/>). 글자 비교는 서수(Ordinal)다.
/// </summary>
public static class ProbeMatch
{
    /// <summary>품음으로 셀 때 품긴 쪽의 최소 글자 수(design.md 1절).</summary>
    public const int MinContainedLength = 4;

    /// <summary>접수 메모로 받는 친 글의 최소 글자 수(AC-1401.6).</summary>
    public const int MinMemoLength = 2;

    /// <summary>앞뒤 공백을 지우고, 안쪽의 공백·탭·줄바꿈이 이어진 곳은 한 칸으로 줄인다. null은 빈 글.</summary>
    public static string Normalize(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var builder = new StringBuilder(text!.Length);
        var pendingSpace = false;
        foreach (var ch in text)
        {
            if (char.IsWhiteSpace(ch))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }
            if (pendingSpace) builder.Append(' ');
            pendingSpace = false;
            builder.Append(ch);
        }
        return builder.ToString();
    }

    /// <summary>
    /// 화면 글(열쇠 → 글)과 칸의 줄(열쇠, 글)을 같은 열쇠끼리 견준다. 열쇠도 앞뒤 공백을 지우고 견준다.
    /// 줄 순서는 받은 순서 그대로다(이어 견주기는 이 순서로 잇는다).
    /// </summary>
    public static ProbeScore Score(IReadOnlyDictionary<string, string> screen, IEnumerable<(string key, string? text)> rows)
    {
        if (screen == null) throw new ArgumentNullException(nameof(screen));
        if (rows == null) throw new ArgumentNullException(nameof(rows));

        var byKey = new Dictionary<string, List<string?>>(StringComparer.Ordinal);
        foreach (var (key, text) in rows)
        {
            var normalizedKey = Normalize(key);
            if (!byKey.TryGetValue(normalizedKey, out var texts))
            {
                texts = new List<string?>();
                byKey.Add(normalizedKey, texts);
            }
            texts.Add(text);
        }

        var screenByKey = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in screen)
        {
            var text = Normalize(line.Value);
            if (text.Length > 0) screenByKey[Normalize(line.Key)] = text;
        }

        int compared = 0, same = 0, joinedPieces = 0, joinedLines = 0, contains = 0;
        foreach (var line in screenByKey)
        {
            if (!byKey.TryGetValue(line.Key, out var texts)) continue;
            compared++;
            switch (Classify(line.Value, texts))
            {
                case Match.Same: same++; break;
                case Match.JoinedPieces: joinedPieces++; break;
                case Match.JoinedLines: joinedLines++; break;
                case Match.Contains: contains++; break;
            }
        }

        var maxRows = byKey.Count == 0 ? 0 : byKey.Values.Max(texts => texts.Count);
        return new ProbeScore(compared, same, joinedPieces, joinedLines, contains, maxRows);
    }

    /// <summary>친 메모 글이 견줄 만한가: 맞춘 뒤 두 글자 이상. 엔터만·한 글자는 건너뛴다(AC-1401.6).</summary>
    public static bool IsMemoText(string? typed) => Normalize(typed).Length >= MinMemoLength;

    /// <summary>
    /// 칸의 줄 가운데 맞춘 뒤 친 글을 품은 줄 수. 친 글이 짧으면(<see cref="IsMemoText"/>가 거짓) 세지 않고 null.
    /// 친 글은 돌려주지도 들고 있지도 않는다(AC-1401.6).
    /// </summary>
    public static int? CountContaining(string? typed, IEnumerable<string?> texts)
    {
        if (texts == null) throw new ArgumentNullException(nameof(texts));
        var needle = Normalize(typed);
        if (needle.Length < MinMemoLength) return null;
        return texts.Count(text => Normalize(text).IndexOf(needle, StringComparison.Ordinal) >= 0);
    }

    private enum Match
    {
        None,
        Same,
        JoinedPieces,
        JoinedLines,
        Contains,
    }

    private static Match Classify(string screen, List<string?> texts)
    {
        var singles = texts.Select(Normalize).Where(text => text.Length > 0).ToList();
        if (singles.Any(text => string.Equals(text, screen, StringComparison.Ordinal))) return Match.Same;

        var candidates = new List<string>(singles);
        if (texts.Count > 1)
        {
            // 맞추기 전 글을 이은 뒤 맞춘다: 줄 끝의 공백·줄바꿈은 붙인 글에서도 그대로 한 칸이 된다
            var pieces = Normalize(string.Concat(texts));
            if (string.Equals(pieces, screen, StringComparison.Ordinal)) return Match.JoinedPieces;
            var lines = Normalize(string.Join("\n", texts));
            if (string.Equals(lines, screen, StringComparison.Ordinal)) return Match.JoinedLines;
            candidates.Add(pieces);
            candidates.Add(lines);
        }

        return candidates.Any(text => OneContainsOther(screen, text)) ? Match.Contains : Match.None;
    }

    private static bool OneContainsOther(string a, string b)
    {
        var (shorter, longer) = a.Length <= b.Length ? (a, b) : (b, a);
        return shorter.Length >= MinContainedLength && longer.IndexOf(shorter, StringComparison.Ordinal) >= 0;
    }
}
