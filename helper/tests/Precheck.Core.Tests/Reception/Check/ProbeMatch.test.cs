using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Precheck.Core.Reception.Check;
using Xunit;

// 이 TASK의 두 시험 묶음(ProbeMatchTests·ColumnShapeTests)만 한 거르기로 돌리려고 Probe 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Check.Probe;

/// <summary>
/// 견주기(ProbeMatch, design.md 1절): 앞뒤 공백·줄바꿈·연속 공백을 한 칸으로 줄인 뒤 똑같음, 한쪽이 다른 쪽을 품음(품긴 쪽 네 글자 이상),
/// 열쇠 하나에 줄이 여러 개면 순서대로 이은 글도 견준다. 결과는 숫자만.
/// AC-1401.4 증상 찾기(내원번호 → 화면 83 증상), AC-1401.5 이름 찾기(차트번호 → 화면 환자명), AC-1401.6 접수 메모(친 글을 품은 줄 수).
/// 가짜 자료: 내원번호 V+숫자, 차트번호 9로 시작하는 6자리, 이름 가상환자NN.
/// </summary>
public class ProbeMatchTests
{
    private static IReadOnlyDictionary<string, string> Screen(params (string Key, string Text)[] lines)
        => lines.ToDictionary(line => line.Key, line => line.Text, StringComparer.Ordinal);

    private static IEnumerable<(string key, string? text)> Rows(params (string Key, string? Text)[] rows)
        => rows.Select(row => (row.Key, row.Text));

    // ---- 공백·줄바꿈 맞추기 ------------------------------------------------------------------------------

    [Theory(DisplayName = "AC-1401.4 맞추기: 앞뒤 공백·줄바꿈(CRLF/LF)·연속 공백·탭을 한 칸으로 줄인다")]
    [InlineData("  허리 통증  ", "허리 통증")]
    [InlineData("허리\r\n통증", "허리 통증")]
    [InlineData("허리\n\n통증\r\n", "허리 통증")]
    [InlineData("허리 \t  통증   3일째", "허리 통증 3일째")]
    [InlineData("\r\n", "")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void NormalizesSpaces(string? raw, string expected)
    {
        Assert.Equal(expected, ProbeMatch.Normalize(raw));
    }

    // ---- AC-1401.4 증상 찾기 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1401.4 줄 하나가 맞춘 뒤 화면 글과 같으면 똑같음, 견준 내원 수는 화면 글과 줄이 둘 다 있는 내원")]
    public void CountsSame()
    {
        var screen = Screen(("V1001", "허리 통증\r\n3일째"), ("V1002", "오른쪽 무릎 통증"), ("V1003", "목 결림"));
        var rows = Rows(("V1001", "  허리 통증 3일째 "), ("V1002", "왼쪽 어깨 통증"), ("V1003", "목  결림"));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(3, score.Compared);
        Assert.Equal(2, score.Same);
        Assert.Equal(0, score.Contains);
        Assert.Equal(0, score.JoinedPieces);
        Assert.Equal(0, score.JoinedLines);
        Assert.Equal(1, score.MaxRows);
    }

    [Fact(DisplayName = "AC-1401.4 화면 글이 빈 내원·줄이 없는 내원·화면에 없는 내원의 줄은 견주지 않는다, 내원번호의 앞뒤 공백은 맞춘다")]
    public void ComparesOnlyKeysOnBothSides()
    {
        var screen = Screen(("V1001", "허리 통증"), ("V1002", "  \r\n "), ("V1003", "목 결림"));
        var rows = Rows((" V1001 ", "허리 통증"), ("V1002", "허리 통증"), ("V1009", "목 결림"));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(1, score.Compared);
        Assert.Equal(1, score.Same);
    }

    [Fact(DisplayName = "AC-1401.4 칸 값이 비었거나 null인 내원도 견준 내원에 들고 맞음은 아니다(빈 글끼리는 똑같음이 아니다)")]
    public void EmptyRowTextIsComparedButNeverMatches()
    {
        var screen = Screen(("V1001", "허리 통증"), ("V1002", "목 결림"));
        var rows = Rows(("V1001", null), ("V1002", "   "));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(2, score.Compared);
        Assert.Equal(0, score.Same + score.JoinedPieces + score.JoinedLines + score.Contains);
    }

    [Fact(DisplayName = "AC-1401.4 똑같지 않고 한쪽이 다른 쪽을 품으면 품음: 줄이 화면 글을 품거나 화면 글이 줄을 품는다")]
    public void CountsContainsEitherWay()
    {
        var screen = Screen(("V1001", "오른쪽 무릎 통증 2주"), ("V1002", "허리 통증"));
        var rows = Rows(("V1001", "무릎 통증"), ("V1002", "초진: 허리 통증 3일째"));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(2, score.Compared);
        Assert.Equal(0, score.Same);
        Assert.Equal(2, score.Contains);
    }

    [Theory(DisplayName = "AC-1401.4 품음은 품긴 쪽(짧은 쪽)이 맞춘 뒤 네 글자 이상일 때만")]
    [InlineData("오른쪽 무릎 통증", "통증", 0)]
    [InlineData("오른쪽 무릎 통증", "릎 통", 0)]
    [InlineData("오른쪽 무릎 통증", "무릎 통", 1)]
    [InlineData("오른쪽 무릎 통증", "  무릎\r\n통  ", 1)]
    [InlineData("요통", "요통 심함", 0)]
    [InlineData("요통 심함", "어제부터 요통 심함", 1)]
    public void ContainsNeedsFourCharacters(string screenText, string rowText, int expected)
    {
        var score = ProbeMatch.Score(Screen(("V1001", screenText)), Rows(("V1001", rowText)));

        Assert.Equal(1, score.Compared);
        Assert.Equal(expected, score.Contains);
    }

    [Fact(DisplayName = "AC-1401.4 내원 하나에 줄이 여러 개면 순서대로 그대로 붙인 글도 견준다(이어 똑같음·붙임), 순서가 다르면 아니다")]
    public void JoinsPiecesInOrder()
    {
        var screen = Screen(("V1001", "허리 통증 3일째"), ("V1002", "허리 통증 3일째"));
        var rows = Rows(("V1001", "허리 통"), ("V1001", "증 3일째"), ("V1002", "증 3일째"), ("V1002", "허리 통"));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(2, score.Compared);
        Assert.Equal(0, score.Same);
        Assert.Equal(1, score.JoinedPieces);
        Assert.Equal(0, score.JoinedLines);
        Assert.Equal(1, score.Contains); // V1002: 화면 글이 "증 3일째"(다섯 글자)를 품는다
        Assert.Equal(2, score.MaxRows);
    }

    [Fact(DisplayName = "AC-1401.4 줄 사이를 띄워 이은 글도 견준다(이어 똑같음·띄움): 화면의 줄바꿈과 칸의 여러 줄")]
    public void JoinsLinesInOrder()
    {
        var screen = Screen(("V1001", "허리 통증\r\n3일째"), ("V1002", "목 결림\n두통"));
        var rows = Rows(("V1001", "허리 통증"), ("V1001", "3일째"), ("V1002", "목 결림"), ("V1002", "두통"), ("V1002", "어지러움"));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(2, score.Compared);
        Assert.Equal(1, score.JoinedLines);
        Assert.Equal(0, score.JoinedPieces);
        Assert.Equal(0, score.Same);
        Assert.Equal(1, score.Contains); // V1002: 셋을 이은 글 "목 결림 두통 어지러움"이 화면 글을 품는다
        Assert.Equal(3, score.MaxRows);
    }

    [Fact(DisplayName = "AC-1401.4 줄 하나가 똑같으면 이은 글이 같아도 똑같음 하나로만 센다(내원마다 한 가지)")]
    public void EachVisitCountsOnce()
    {
        var screen = Screen(("V1001", "허리 통증"));
        var rows = Rows(("V1001", "허리 통증"), ("V1001", ""), ("V1001", null));

        var score = ProbeMatch.Score(screen, rows);

        Assert.Equal(1, score.Compared);
        Assert.Equal(1, score.Same);
        Assert.Equal(0, score.JoinedPieces + score.JoinedLines + score.Contains);
        Assert.Equal(3, score.MaxRows);
    }

    [Fact(DisplayName = "AC-1401.4 최대 줄 수는 읽은 줄 모두에서 내원 하나의 가장 많은 줄 수, 줄이 없으면 모두 0")]
    public void MaxRowsOverAllKeys()
    {
        var screen = Screen(("V1001", "허리 통증"));
        var rows = Rows(("V1001", "허리 통증"), ("V1009", "가"), ("V1009", "나"), ("V1009", "다"), ("V1009", "라"));

        Assert.Equal(4, ProbeMatch.Score(screen, rows).MaxRows);

        var none = ProbeMatch.Score(screen, Rows());
        Assert.Equal(new[] { 0, 0, 0, 0, 0, 0 }, new[] { none.Compared, none.Same, none.JoinedPieces, none.JoinedLines, none.Contains, none.MaxRows });
    }

    [Fact(DisplayName = "AC-1401.4 결과는 숫자만: ProbeScore의 공개 속성은 모두 int이고 ToString에 화면·칸 글이 없다")]
    public void ScoreIsNumbersOnly()
    {
        var properties = typeof(ProbeScore).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        Assert.NotEmpty(properties);
        Assert.All(properties, property => Assert.Equal(typeof(int), property.PropertyType));

        var score = ProbeMatch.Score(Screen(("V1001", "가상환자01 허리 통증")), Rows(("V1001", "가상환자01 허리 통증")));
        Assert.DoesNotContain("가상환자01", score.ToString() ?? "");
        Assert.DoesNotContain("V1001", score.ToString() ?? "");
    }

    [Fact(DisplayName = "AC-1401.4 null 입력은 ArgumentNullException(형 이름만 보고서에 남는다)")]
    public void NullArgumentsThrow()
    {
        Assert.Throws<ArgumentNullException>(() => ProbeMatch.Score(null!, Rows()));
        Assert.Throws<ArgumentNullException>(() => ProbeMatch.Score(Screen(), null!));
    }

    // ---- AC-1401.5 이름 찾기 -----------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1401.5 이름 찾기: 같은 차트번호의 화면 환자명과 칸 값이 똑같은 수, 다른 칸(전화 모양)은 0")]
    public void CountsSameNames()
    {
        var screen = Screen(("900001", "가상환자01"), ("900002", "가상환자02"), ("900003", "가상환자03"), ("900004", "가상환자04"));
        var nameColumn = Rows(("900001", "가상환자01"), ("900002", "가상환자02    "), ("900003", "가상환자09"), ("900005", "가상환자05"));
        var phoneColumn = Rows(("900001", "010-9000-0001"), ("900002", "010-9000-0002"), ("900003", "010-9000-0003"));

        var names = ProbeMatch.Score(screen, nameColumn);
        var phones = ProbeMatch.Score(screen, phoneColumn);

        Assert.Equal(3, names.Compared);
        Assert.Equal(2, names.Same);
        Assert.Equal(3, phones.Compared);
        Assert.Equal(0, phones.Same);
        Assert.Equal(0, phones.Contains);
    }

    // ---- AC-1401.6 접수 메모 -----------------------------------------------------------------------------

    [Theory(DisplayName = "AC-1401.6 친 메모 글은 맞춘 뒤 두 글자 이상이어야 쓴다(엔터만·한 글자는 건너뜀)")]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("가", false)]
    [InlineData(" 가 ", false)]
    [InlineData("가나", true)]
    [InlineData(" 물리 치료 ", true)]
    public void MemoTextNeedsTwoCharacters(string? typed, bool expected)
    {
        Assert.Equal(expected, ProbeMatch.IsMemoText(typed));
    }

    [Fact(DisplayName = "AC-1401.6 칸의 줄 가운데 친 글을 품은 줄 수(공백·줄바꿈은 맞춘 뒤 견줌, null·빈 줄은 아님)")]
    public void CountsRowsContainingMemo()
    {
        var texts = new string?[] { "오늘 물리치료 먼저 해 주세요", "물리치료\r\n먼저", "  물리치료   먼저 ", "주사 먼저", null, "" };

        Assert.Equal(3, ProbeMatch.CountContaining(" 물리치료  먼저 ", texts));
        Assert.Equal(0, ProbeMatch.CountContaining("엑스레이", texts));
    }

    [Fact(DisplayName = "AC-1401.6 짧은 글(두 글자 미만)이면 세지 않고 null, 결과는 숫자뿐이며 ProbeMatch는 친 글을 들고 있지 않는다(바꿀 수 있는 정적 칸 없음)")]
    public void MemoIsNotKept()
    {
        Assert.Null(ProbeMatch.CountContaining("가", new string?[] { "가나다" }));
        Assert.Null(ProbeMatch.CountContaining(null, new string?[] { "가나다" }));

        Assert.Equal(1, ProbeMatch.CountContaining("가상메모77", new string?[] { "가상메모77 전화 부탁" }));
        var mutable = typeof(ProbeMatch)
            .GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(field => !field.IsLiteral && !field.IsInitOnly);
        Assert.Empty(mutable);
        Assert.Throws<ArgumentNullException>(() => ProbeMatch.CountContaining("가나", null!));
    }
}
