using System;
using System.Linq;
using Precheck.Core.InjectionMemo;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>
/// 주사 차수 시험(spec injection-memo)이 같이 쓰는 지어낸 내원 기록. 증상 글·메모·차트번호는 모두 지어낸 것이고
/// 모양만 notes/eval-30days.md·시안 docs/mockups/injection-memo(기록 → 메모 글)를 따른다. 오늘은 2026-11-20(금).
/// </summary>
internal static class Notes
{
    public static readonly DateTime Today = new DateTime(2026, 11, 20);

    public const string Chart = "90001";

    /// <summary>오늘에서 daysAgo날 앞 내원 하나: 그때 접수 메모와 증상 줄(차례대로).</summary>
    public static VisitNote Visit(int daysAgo, string memo, params string[] lines) => new VisitNote(Today.AddDays(-daysAgo), lines, memo);

    /// <summary>'|'로 나눈 증상 줄들로 내원 하나.</summary>
    public static VisitNote Lines(int daysAgo, string memo, string joined) => Visit(daysAgo, memo, joined.Split('|'));

    public static MemoResult Decide(params VisitNote[] visits) => InjectionRule.Decide(visits, Today);

    /// <summary>넣는 결과의 글. 넣지 않으면 시험이 종류를 보여 주며 실패한다.</summary>
    public static string Inserted(params VisitNote[] visits)
    {
        var result = Decide(visits);
        if (result.Kind != MemoResultKind.Insert) throw new Xunit.Sdk.XunitException("넣지 않음: " + result.Kind);
        return result.Text;
    }

    public static DateTime Day(int month, int day) => new DateTime(2026, month, day);

    public static string[] Kinds(params MemoResult[] results) => results.Select(r => r.Kind.ToString()).ToArray();
}
