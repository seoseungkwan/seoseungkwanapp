using System;
using System.Linq;
using System.Threading.Tasks;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 PaperRtf 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.PaperRtf;

/// <summary>
/// 특이사항 RTF → 보통 글(RtfText, design.md 3절, REQ-1501).
/// AC-1501.3 RTF 풀기(줄 바꿈·한글 \'hh cp949·\uN·버리는 묶음·깨진 글), AC-1501.5 줄 정리(Tidy).
/// 시험 글은 모두 지어낸 RTF다(실제 환자 글 없음). 한글 바이트는 cp949 값을 그대로 적는다
/// (시험에서 인코딩을 따로 등록하면 RtfText가 등록을 빠뜨려도 통과하므로).
/// 가 b0a1 · 나 b3aa · 다 b4d9 · 굴림 b1bc b8b2 · 허리 c7e3 b8ae · 통증 c5eb c1f5 · 약 bee0 ·
/// 알레르기 becb b7b9 b8a3 b1e2 · 주의 c1d6 c0c7 · 홍길동 c8ab b1e6 b5bf · 한 U+D55C(54620) · 국 U+AD6D(44397)
/// </summary>
public class RtfTextTests
{
    /// <summary>워드패드·RichTextBox가 쓰는 모양의 머리(글꼴표에 한글 글꼴 이름, 색표, {\*\generator}).</summary>
    private const string Head =
        @"{\rtf1\ansi\ansicpg949\deff0\nouicompat\deflang1033\deflangfe1042" +
        @"{\fonttbl{\f0\fnil\fcharset129 \'b1\'bc\'b8\'b2;}{\f1\fswiss\fcharset0 Arial;}}" + "\r\n" +
        @"{\colortbl ;\red255\green0\blue0;\red0\green0\blue255;}" + "\r\n" +
        @"{\*\generator Riched20 10.0.19041}\viewkind4\uc1 " + "\r\n" +
        @"\pard\sa200\sl276\slmult1\f0\fs20\lang1042 ";

    private static string Doc(string body) => Head + body + "}\r\n";

    // ---- AC-1501.3 RTF 풀기 ----------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.3 한글 \\'hh 두 바이트를 cp949로 한 글자씩 풀고, \\par는 줄 바꿈, 글꼴표·색표·{\\*\\generator}는 버린다")]
    public void KoreanAndParagraphs()
    {
        var rtf = Doc(
            @"\'c7\'e3\'b8\'ae \'c5\'eb\'c1\'f5\par" + "\r\n" +
            @"\'be\'e0 \'be\'cb\'b7\'b9\'b8\'a3\'b1\'e2 \'c1\'d6\'c0\'c7\par" + "\r\n");

        Assert.Equal("허리 통증\n약 알레르기 주의", RtfText.ToPlain(rtf));
    }

    [Fact(DisplayName = "AC-1501.3 한 글자의 두 바이트(\\'b0\\'a1)는 이어진 바이트로 함께 푼다(바이트 하나씩 풀지 않는다)")]
    public void ByteRuns()
    {
        Assert.Equal("가나다", RtfText.ToPlain(Doc(@"\'b0\'a1\'b3\'aa\'b4\'d9")));
        Assert.Equal("가 나", RtfText.ToPlain(Doc(@"\'b0\'a1 \b\'b3\'aa\b0")));
    }

    [Fact(DisplayName = "AC-1501.3 \\line도 줄 바꿈, \\tab은 공백 하나, 제어어 뒤 공백 하나는 구분자로 먹고, RTF 안의 날 CR·LF는 버린다")]
    public void LineTabAndDelimiters()
    {
        Assert.Equal("a b\nc\nd", RtfText.ToPlain(Doc(@"a\tab b\line c\par d")));
        Assert.Equal("bold two", RtfText.ToPlain(@"{\rtf1\ansi\b bold\b0  two}"));
        Assert.Equal("onetwo\nthree", RtfText.ToPlain("{\\rtf1\\ansi one\r\ntwo\\par\r\n\r\nthree}"));
    }

    [Fact(DisplayName = "AC-1501.3 \\uN은 그 글자(음수는 65536을 더함), 뒤 대체 글자 \\ucN개(없으면 1개)는 버리고, \\uc는 묶음 안에서만 간다")]
    public void Unicode()
    {
        Assert.Equal("한국 ok", RtfText.ToPlain(@"{\rtf1\ansi\u54620?\u44397? ok}"));
        Assert.Equal("😀", RtfText.ToPlain(@"{\rtf1\ansi\u-10179?\u-8704?}"));
        Assert.Equal("가", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg949\uc2\u44032\'b0\'a1}"));
        Assert.Equal("가x", RtfText.ToPlain(@"{\rtf1\ansi\uc0\u44032 x}"));
        Assert.Equal("가나", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg949\uc1{\uc2\u44032\'b0\'a1}\u45208?}"));
        Assert.Equal("가나", RtfText.ToPlain(Doc(@"\u44032?\u45208?")));
    }

    [Fact(DisplayName = "AC-1501.3 짝 없는 \\uN 반쪽 글자(서로게이트)는 U+FFFD로 바꾼다(JSON으로 쓸 수 있는 글만 낸다)")]
    public void LoneSurrogates()
    {
        Assert.Equal("�x", RtfText.ToPlain(@"{\rtf1\ansi\u-10179?x}"));
        Assert.Equal("a�", RtfText.ToPlain(@"{\rtf1\ansi a\u-8704?}"));
        Assert.Equal("��", RtfText.ToPlain(@"{\rtf1\ansi\u-8704?\u-10179?}"));
        Assert.Equal("😀�", RtfText.ToPlain(@"{\rtf1\ansi\u-10179?\u-8704?\u-10179?}"));
    }

    [Fact(DisplayName = "AC-1501.3 \\\\ \\{ \\}는 그 글자, \\~는 공백, \\-는 버림, \\_는 '-', 그 밖의 제어어는 버린다")]
    public void Symbols()
    {
        Assert.Equal(@"a\b {c} d ef-g", RtfText.ToPlain(@"{\rtf1\ansi a\\b \{c\} d\~e\-f\_g}"));
        Assert.Equal("plain", RtfText.ToPlain(@"{\rtf1\ansi\pard\plain\ql\fi-360\li720\cf1\highlight2\ulnone plain}"));
    }

    [Fact(DisplayName = "AC-1501.3 글꼴표·색표·스타일표·info·그림·개체·머리글·바닥글·{\\*…} 묶음은 안의 묶음까지 통째로 버린다")]
    public void SkippedGroups()
    {
        var rtf =
            @"{\rtf1\ansi\ansicpg949\deff0" +
            @"{\fonttbl{\f0\fnil\fcharset129 \'b1\'bc\'b8\'b2;}{\f1\fnil\fcharset0 {\*\panose 0}Arial;}}" +
            @"{\colortbl ;\red255\green0\blue0;}" +
            @"{\stylesheet{\s0\snext0 Normal;}{\s1\sbasedon0 heading 1;}}" +
            @"{\info{\author \'c8\'ab\'b1\'e6\'b5\'bf}{\title secret title}{\creatim\yr2026\mo11\dy7}}" +
            @"{\*\generator Msftedit 5.41.21.2510;}" +
            @"{\*\listtable{\list{\listlevel{\leveltext \'01\'95;}}}}" +
            @"{\header \pard header text\par}{\footer \pard footer text\par}" +
            @"{\pict\pngblip\picw10\pich10 89504e470d0a1a0a{\*\blipuid 0123}}" +
            @"{\object\objemb{\*\objclass Paint.Picture}{\*\objdata 0102}{\result result text}}" +
            @"{\*\unknowndest hidden}" +
            @"\viewkind4\uc1\pard\f0 body \'b0\'a1\par}";

        Assert.Equal("body 가", RtfText.ToPlain(rtf));
    }

    [Fact(DisplayName = "AC-1501.3 \\binN 뒤 N글자는 날 자료라 괄호가 있어도 묶음 셈에 넣지 않는다")]
    public void BinaryData()
    {
        Assert.Equal("ab", RtfText.ToPlain(@"{\rtf1\ansi a{\pict\bin4 }{}x}b}"));
    }

    [Fact(DisplayName = "AC-1501.3 \\ansicpgN의 글자표로 바이트를 풀고, 없으면 949, 못 여는 글자표면 949로 푼다")]
    public void CodePages()
    {
        Assert.Equal("café", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg1252 caf\'e9}"));
        Assert.Equal("가나", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg65001 \'ea\'b0\'80\'eb\'82\'98}"));
        Assert.Equal("가", RtfText.ToPlain(@"{\rtf1\ansi \'b0\'a1}"));
        Assert.Equal("가", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg99999 \'b0\'a1}"));
        Assert.Equal("가", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg0 \'b0\'a1}"));
    }

    [Fact(DisplayName = "AC-1501.3 \\ 뒤에 바로 줄 바꿈이 오면 \\par와 같다(RTF 규칙)")]
    public void BackslashNewline()
    {
        Assert.Equal("a\nb\nc", RtfText.ToPlain("{\\rtf1\\ansi a\\\r\nb\\\nc}"));
    }

    [Fact(DisplayName = "AC-1501.3 \\bullet·\\emdash·\\endash·\\lquote·\\rquote·\\ldblquote·\\rdblquote는 그 글자다")]
    public void SymbolWords()
    {
        Assert.Equal("• a—b–c ‘d’ “e”", RtfText.ToPlain(@"{\rtf1\ansi\bullet  a\emdash b\endash c \lquote d\rquote  \ldblquote e\rdblquote}"));
    }

    [Fact(DisplayName = "AC-1501.3 푼 뒤 줄 정리: 줄 끝 공백을 빼고, 빈 줄 여럿은 하나로, 앞뒤 빈 줄은 뺀다")]
    public void TidyAfterParse()
    {
        var rtf = Doc(@"\par\par  \par first  \tab\par\par\par\par second\tab\par\par" + "\r\n");

        Assert.Equal("first\n\nsecond", RtfText.ToPlain(rtf));
    }

    [Fact(DisplayName = "AC-1501.3 깨진 RTF(닫는 괄호가 모자라거나 남음, 잘린 \\'h, 끝의 \\, 숫자 없는 \\u, 아주 큰 숫자)도 예외 없이 읽은 만큼 준다")]
    public void Malformed()
    {
        Assert.Equal("가", RtfText.ToPlain(@"{\rtf1\ansi\ansicpg949 {\b \'b0\'a1"));
        Assert.Equal("ab", RtfText.ToPlain(@"{\rtf1\ansi a}}b}"));
        Assert.Equal("a", RtfText.ToPlain(@"{\rtf1\ansi a\'b"));
        Assert.Equal("a", RtfText.ToPlain(@"{\rtf1\ansi a\'"));
        Assert.Equal("abc", RtfText.ToPlain(@"{\rtf1\ansi abc\"));
        Assert.Equal("ab", RtfText.ToPlain(@"{\rtf1\ansi a\u b}"));
        Assert.Equal("abc", RtfText.ToPlain(@"{\rtf1\ansi a\u99999999999999999999?b\uc99999999999 c}"));
        Assert.Equal("ab", RtfText.ToPlain(@"{\rtf1\ansi a{\pict\bin99999999999 }b"));

        var junk = new[]
        {
            @"{\rtf", @"{\rtf1", @"{\rtf1\", @"{\rtf1\'", @"{\rtf1\u-", @"{\rtf1\uc-5\u44032??}", @"{\rtf1}}}}{{{{",
            @"{\rtf1{\*", @"{\rtf1\bin", @"{\rtf1\bin-3 abc}", "{\\rtf1 \0a\0}", @"{\rtf1\abcdefghijklmnopqrstuvwxyzabcdefghijklmnop123 x}",
            @"{\rtf1\ansicpg949 \'ff\'ff\'b0}", @"{\rtf1\ansicpg-1 \'b0\'a1}",
            "{\\rtf1 " + new string('{', 20000) + "deep" + new string('}', 5) + "\\'",
        };
        foreach (var text in junk)
        {
            var exception = Record.Exception(() => RtfText.ToPlain(text));
            Assert.Null(exception);
        }
        Assert.Equal("deep", RtfText.ToPlain("{\\rtf1 " + new string('{', 20000) + "deep" + new string('}', 5)));
    }

    [Fact(DisplayName = "AC-1501.3 {\\rtf로 시작하지 않는 글(앞 공백은 건넘)은 RTF로 풀지 않고 줄 정리만 한다")]
    public void PlainText()
    {
        Assert.Equal("  허리 통증\n\n약 {주의} C:\\temp\\par", RtfText.ToPlain("  허리 통증  \r\n\r\n\r\n\r\n약 {주의} C:\\temp\\par\r\n"));
        Assert.Equal(@"{\rt x}", RtfText.ToPlain(@"{\rt x}"));
        Assert.Equal("가", RtfText.ToPlain("\r\n  \t" + @"{\rtf1\ansi\ansicpg949 \'b0\'a1}"));
    }

    [Fact(DisplayName = "AC-1501.3 줄이 없거나(null) 빈 글·빈 RTF면 \"\"")]
    public void Empty()
    {
        Assert.Equal("", RtfText.ToPlain(null));
        Assert.Equal("", RtfText.ToPlain(""));
        Assert.Equal("", RtfText.ToPlain("  \r\n \t "));
        Assert.Equal("", RtfText.ToPlain(@"{\rtf1}"));
        Assert.Equal("", RtfText.ToPlain(Doc(@"\par\par")));
    }

    [Fact(DisplayName = "AC-1501.3 여러 요청이 한꺼번에 풀어도(글자표 등록은 한 번) 같은 글이 나온다")]
    public void Concurrent()
    {
        var rtf = Doc(@"\'b0\'a1\'b3\'aa\'b4\'d9\par \u54620?\u44397?");
        var results = new string[64];

        Parallel.For(0, results.Length, index => results[index] = RtfText.ToPlain(rtf));

        Assert.All(results, result => Assert.Equal("가나다\n한국", result));
    }

    // ---- AC-1501.5 줄 정리(Tidy) --------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-1501.5 Tidy: CRLF·CR은 LF로 바꾼다")]
    public void TidyNewlines()
    {
        Assert.Equal("a\nb\nc", RtfText.Tidy("a\r\nb\rc\n"));
    }

    [Fact(DisplayName = "AC-1501.5 Tidy: 줄마다 끝 공백(공백·탭)을 빼고 앞 공백은 둔다")]
    public void TidyTrailingSpaces()
    {
        Assert.Equal("a\n  b\n\tc", RtfText.Tidy("a  \t\n  b \n\tc\t"));
    }

    [Fact(DisplayName = "AC-1501.5 Tidy: 빈 줄 하나는 지키고, 빈 줄(공백뿐인 줄 포함)이 여럿 이어지면 하나로 묶는다")]
    public void TidyBlankRuns()
    {
        Assert.Equal("a\n\nb", RtfText.Tidy("a\n\nb"));
        Assert.Equal("a\n\nb", RtfText.Tidy("a\n\n\nb"));
        Assert.Equal("a\n\nb\n\nc", RtfText.Tidy("a\n \n\t\n   \nb\r\n\r\n\r\n\r\nc"));
    }

    [Fact(DisplayName = "AC-1501.5 Tidy: 앞뒤 빈 줄을 뺀다")]
    public void TidyEdges()
    {
        Assert.Equal("a\nb", RtfText.Tidy("\n\n  \na\nb\n\n \n"));
        Assert.Equal("  a", RtfText.Tidy("\n  a"));
    }

    [Fact(DisplayName = "AC-1501.5 Tidy: null·빈 글·빈 줄뿐인 글은 \"\", 이미 정리된 글은 그대로(두 번 해도 같다)")]
    public void TidyEmptyAndStable()
    {
        Assert.Equal("", RtfText.Tidy(null));
        Assert.Equal("", RtfText.Tidy(""));
        Assert.Equal("", RtfText.Tidy(" \n\t\r\n \r"));

        var samples = new[] { "허리 통증\n\n약 주의", "a", "  a\n b", "a\n\n\n\nb  \n\n" };
        foreach (var sample in samples)
        {
            var once = RtfText.Tidy(sample);
            Assert.Equal(once, RtfText.Tidy(once));
        }
        Assert.Equal("허리 통증\n\n약 주의", RtfText.Tidy("허리 통증\n\n약 주의"));
        Assert.True(new[] { "a", "b" }.SequenceEqual(RtfText.Tidy("a\n\n\nb").Split('\n').Where(line => line.Length > 0)));
    }
}
