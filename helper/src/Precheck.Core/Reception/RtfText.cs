using System;
using System.Collections.Generic;
using System.Text;

namespace Precheck.Core.Reception;

/// <summary>
/// 특이사항(PbsCmtInf.PbsSpcCmt) RTF → 보통 글(reception-paper design.md 3절, AC-1501.3)과 줄 정리(<see cref="Tidy"/>, AC-1501.5).
/// 비트는 특이사항을 RTF(<c>{\rtf1\ansi\ansicpg949 …</c>, 한글은 <c>\'hh</c> 두 바이트)로 둔다. 윈도우 RichTextBox 없이 여기서 푼다
/// (Core는 netstandard2.0이라 서버에서도 시험이 돈다).
/// - <c>\par</c>·<c>\line</c>·<c>\</c>+줄 바꿈은 "\n", <c>\tab</c>은 공백 하나. RTF 안의 날 CR·LF는 버린다.
/// - <c>\'hh</c>는 이어진 바이트를 모아 <c>\ansicpgN</c>(없거나 못 열면 949) 글자표로 한꺼번에 푼다(한글 한 글자 = 바이트 둘).
/// - <c>\uN</c>은 그 UTF-16 글자(음수는 65536을 더함), 뒤의 대체 글자 <c>\ucN</c>개(없으면 1)는 버린다. <c>\uc</c>는 묶음 안에서만 간다.
/// - 글꼴표·색표·스타일표·info·그림·개체·머리글·바닥글과 <c>{\*…}</c> 묶음은 안의 묶음까지 통째로 버린다.
/// - 깨진 RTF(괄호가 모자라거나 남음, 잘린 글)도 예외 없이 읽은 만큼 준다. <c>{\rtf</c>로 시작하지 않는 글은 줄 정리만 한다.
/// </summary>
public static class RtfText
{
    /// <summary><c>\ansicpg</c>가 없거나 못 여는 글자표일 때 쓰는 한글 윈도우 글자표.</summary>
    private const int DefaultCodePage = 949;

    /// <summary>949도 못 열 때 마지막으로 쓰는 글자표(바이트 하나 = 글자 하나).</summary>
    private const int Latin1CodePage = 28591;

    /// <summary>안의 글을 보이지 않는 묶음(목적지). 만나면 그 묶음 끝까지 버린다.</summary>
    private static readonly HashSet<string> SkippedDestinations = new HashSet<string>(StringComparer.Ordinal)
    {
        "fonttbl", "colortbl", "stylesheet", "info", "pict", "object",
        "header", "headerl", "headerr", "headerf", "footer", "footerl", "footerr", "footerf",
    };

    /// <summary>글자 하나로 바뀌는 제어어.</summary>
    private static readonly Dictionary<string, string> WordText = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["par"] = "\n",
        ["line"] = "\n",
        ["tab"] = " ",
        ["bullet"] = "•",
        ["emdash"] = "—",
        ["endash"] = "–",
        ["lquote"] = "‘",
        ["rquote"] = "’",
        ["ldblquote"] = "“",
        ["rdblquote"] = "”",
    };

    // 949·1252 같은 글자표는 .NET 10에 기본으로 없어 처음 한 번만 등록한다(정적 생성자는 한 번만, 스레드 안전하게 돈다)
    static RtfText()
    {
        try
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }
        catch (Exception)
        {
            // 등록을 못 해도 예외로 끝내지 않는다. 글자표를 못 열면 아래에서 949 → Latin-1 → 바이트 그대로 순으로 내려간다
        }
    }

    /// <summary>
    /// RTF 글을 보통 글로 바꾸고 <see cref="Tidy"/>로 줄을 정리한다. RTF가 아니면 정리만 한다. null·빈 글이면 "".
    /// 어떤 글이 와도 예외를 내지 않는다.
    /// </summary>
    public static string ToPlain(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var start = RtfStart(text!);
        if (start < 0) return Tidy(text);
        return Tidy(WellFormed(new Reader(text!, start).Read()));
    }

    /// <summary>
    /// 줄 정리: CRLF·CR → LF, 줄마다 끝 공백을 빼고, 빈 줄(공백뿐인 줄 포함)이 여럿 이어지면 하나로, 앞뒤 빈 줄은 뺀다. null이면 "".
    /// </summary>
    public static string Tidy(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var lines = text!.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var output = new StringBuilder(text!.Length);
        var started = false;
        var blank = false;
        foreach (var raw in lines)
        {
            var line = raw.TrimEnd();
            if (line.Length == 0)
            {
                // 앞 빈 줄은 버리고, 가운데 빈 줄은 몇 줄이든 하나로 센다. 뒤 빈 줄은 다음 글이 없어 쓰이지 않는다
                if (started) blank = true;
                continue;
            }
            if (started)
            {
                output.Append('\n');
                if (blank) output.Append('\n');
            }
            output.Append(line);
            started = true;
            blank = false;
        }
        return output.ToString();
    }

    /// <summary>
    /// 짝 없는 반쪽 글자(서로게이트, 깨진 <c>\uN</c>에서 나옴)를 U+FFFD로 바꾼다.
    /// 상세 답을 쓰는 JSON 쓰기(Utf8JsonWriter)는 깨진 UTF-16을 받지 않고 예외를 낸다.
    /// </summary>
    private static string WellFormed(string text)
    {
        var output = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (char.IsHighSurrogate(c) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                output.Append(c).Append(text[i + 1]);
                i++;
                continue;
            }
            output.Append(char.IsSurrogate(c) ? '�' : c);
        }
        return output.ToString();
    }

    /// <summary>앞 공백(과 BOM)을 건너 <c>{\rtf</c>가 시작하는 자리. RTF가 아니면 -1.</summary>
    private static int RtfStart(string text)
    {
        var index = 0;
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == '﻿')) index++;
        return text.Length - index >= 5 && string.CompareOrdinal(text, index, "{\\rtf", 0, 5) == 0 ? index : -1;
    }

    /// <summary>못 여는 글자표면 null(예외를 내지 않는다). 0 이하(기본 글자표 = PC마다 다름)와 너무 큰 번호도 못 여는 것으로 본다.</summary>
    private static Encoding? TryEncoding(int codePage)
    {
        if (codePage <= 0 || codePage > 65535) return null;
        try
        {
            return Encoding.GetEncoding(codePage);
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }

    /// <summary>글자표 번호 → 쓸 글자표. 못 열면 949, 그것도 못 열면 Latin-1, 그것도 없으면 null(바이트를 그대로 글자로).</summary>
    private static Encoding? EncodingFor(int codePage) =>
        TryEncoding(codePage) ?? TryEncoding(DefaultCodePage) ?? TryEncoding(Latin1CodePage);

    /// <summary>묶음(<c>{…}</c>)마다 지키는 상태. 묶음이 닫히면 바깥 상태로 돌아간다.</summary>
    private readonly struct GroupState
    {
        public GroupState(bool skip, int unicodeSkip)
        {
            Skip = skip;
            UnicodeSkip = unicodeSkip;
        }

        /// <summary>이 묶음 글을 버리나(버리는 목적지 안).</summary>
        public bool Skip { get; }

        /// <summary><c>\uN</c> 뒤에 버릴 대체 글자 수(<c>\ucN</c>, 기본 1).</summary>
        public int UnicodeSkip { get; }
    }

    /// <summary>RTF 한 글을 앞에서부터 한 번 읽는다. 되부르기 없이 묶음 깊이를 스택으로 센다(아주 깊어도 넘치지 않는다).</summary>
    private sealed class Reader
    {
        private readonly string text;
        private readonly StringBuilder output;
        private readonly List<byte> bytes = new List<byte>();
        private readonly Stack<GroupState> groups = new Stack<GroupState>();

        private int index;
        private bool skip;
        private int unicodeSkip = 1;
        private int fallbackLeft;
        private int codePage = DefaultCodePage;
        private Encoding? encoding;
        private bool encodingReady;

        public Reader(string text, int start)
        {
            this.text = text;
            index = start;
            output = new StringBuilder(text.Length);
        }

        public string Read()
        {
            while (index < text.Length)
            {
                var c = text[index];
                switch (c)
                {
                    case '{':
                        index++;
                        fallbackLeft = 0;
                        groups.Push(new GroupState(skip, unicodeSkip));
                        break;
                    case '}':
                        index++;
                        fallbackLeft = 0;
                        // 남는 닫는 괄호는 버린다
                        if (groups.Count > 0)
                        {
                            var outer = groups.Pop();
                            skip = outer.Skip;
                            unicodeSkip = outer.UnicodeSkip;
                        }
                        break;
                    case '\\':
                        ReadControl();
                        break;
                    case '\r':
                    case '\n':
                    case '\0':
                        index++;
                        break;
                    default:
                        index++;
                        Text(c);
                        break;
                }
            }
            Flush();
            return output.ToString();
        }

        /// <summary><c>\</c> 하나 뒤: 제어어(<c>\word-123 </c>)나 제어 기호(<c>\'hh</c>·<c>\\</c>·<c>\~</c> 등).</summary>
        private void ReadControl()
        {
            index++;
            if (index >= text.Length) return; // 글 끝의 \ 하나는 버린다
            var c = text[index];
            if (IsLetter(c))
            {
                ReadWord();
                return;
            }

            index++;
            switch (c)
            {
                case '\'':
                    ReadHexByte();
                    break;
                case '\\':
                case '{':
                case '}':
                    Text(c);
                    break;
                case '~':
                    Text(' ');
                    break;
                case '_':
                    Text('-');
                    break;
                case '*':
                    // {\*…}: 모르는 목적지는 버린다(우리는 아는 목적지가 없다)
                    skip = true;
                    break;
                case '\r':
                case '\n':
                    // RTF 규칙: \ 뒤 바로 줄 바꿈은 \par
                    Word("\n");
                    break;
                default:
                    // \-(넣어도 되는 줄표)·\|·\: 같은 다른 기호는 버린다. 대체 글자 하나로는 센다
                    Ignore();
                    break;
            }
        }

        /// <summary>제어어 이름(영문자), 숫자(앞에 - 가능), 구분자 공백 하나를 읽고 처리한다.</summary>
        private void ReadWord()
        {
            var start = index;
            while (index < text.Length && IsLetter(text[index])) index++;
            var word = text.Substring(start, index - start);

            var negative = false;
            if (index + 1 < text.Length && text[index] == '-' && IsDigit(text[index + 1]))
            {
                negative = true;
                index++;
            }
            var hasValue = false;
            long value = 0;
            while (index < text.Length && IsDigit(text[index]))
            {
                hasValue = true;
                // 아주 긴 숫자는 int 끝에서 멈춘다(넘침 없음)
                if (value <= int.MaxValue) value = value * 10 + (text[index] - '0');
                index++;
            }
            if (index < text.Length && text[index] == ' ') index++;

            var number = (int)Math.Max(int.MinValue, Math.Min(int.MaxValue, negative ? -value : value));
            Control(word, hasValue, number);
        }

        private void Control(string word, bool hasValue, int number)
        {
            if (word == "bin")
            {
                // \binN 뒤 N글자는 날 자료다(괄호가 섞여 있어도 묶음으로 세지 않는다). 남은 글보다 크면 깨진 것으로 보고 건너지 않는다
                if (fallbackLeft > 0) fallbackLeft--;
                if (hasValue && number > 0 && number <= text.Length - index) index += number;
                return;
            }
            if (skip) return;
            if (fallbackLeft > 0)
            {
                // \uN 뒤 대체 글자 자리의 제어어는 글자 하나로 세고 버린다
                fallbackLeft--;
                return;
            }

            if (WordText.TryGetValue(word, out var replacement))
            {
                Word(replacement);
                return;
            }
            if (SkippedDestinations.Contains(word))
            {
                skip = true;
                return;
            }
            switch (word)
            {
                case "u":
                    if (!hasValue) return;
                    var unit = number < 0 ? number + 65536 : number;
                    if (unit >= 0 && unit <= 0xFFFF)
                    {
                        Flush();
                        output.Append((char)unit);
                    }
                    fallbackLeft = unicodeSkip;
                    return;
                case "uc":
                    if (hasValue) unicodeSkip = Math.Max(0, number);
                    return;
                case "ansicpg":
                    if (!hasValue) return;
                    // 앞에 모은 바이트는 앞 글자표로 푼다
                    Flush();
                    codePage = number;
                    encodingReady = false;
                    return;
                default:
                    // \pard·\b·\fs20·\lang1042 같은 모양 제어어는 버린다
                    return;
            }
        }

        /// <summary><c>\'</c> 뒤 16진수 두 자리 = 바이트 하나. 모자란 자리는 읽은 만큼 버린다.</summary>
        private void ReadHexByte()
        {
            var value = 0;
            var digits = 0;
            while (digits < 2 && index < text.Length && HexValue(text[index]) >= 0)
            {
                value = value * 16 + HexValue(text[index]);
                index++;
                digits++;
            }
            if (skip) return;
            if (fallbackLeft > 0)
            {
                fallbackLeft--;
                return;
            }
            if (digits == 2) bytes.Add((byte)value);
        }

        /// <summary>보통 글자 하나(\uN 대체 글자 자리면 버린다).</summary>
        private void Text(char c)
        {
            if (skip) return;
            if (fallbackLeft > 0)
            {
                fallbackLeft--;
                return;
            }
            Flush();
            output.Append(c);
        }

        /// <summary>글로 바뀌는 제어어·기호(\par·\tab·\bullet 등).</summary>
        private void Word(string replacement)
        {
            if (skip) return;
            if (fallbackLeft > 0)
            {
                fallbackLeft--;
                return;
            }
            Flush();
            output.Append(replacement);
        }

        /// <summary>글이 없는 제어 기호. \uN 대체 글자 자리면 하나로 센다.</summary>
        private void Ignore()
        {
            if (!skip && fallbackLeft > 0) fallbackLeft--;
        }

        /// <summary>모아 둔 바이트를 지금 글자표로 한꺼번에 푼다(한글 한 글자의 두 바이트가 함께 풀리게).</summary>
        private void Flush()
        {
            if (bytes.Count == 0) return;
            if (!encodingReady)
            {
                encoding = EncodingFor(codePage);
                encodingReady = true;
            }
            var run = bytes.ToArray();
            bytes.Clear();
            if (encoding != null)
            {
                // GetEncoding의 글자표는 틀린 바이트를 대체 글자로 바꾼다(예외 없음)
                output.Append(encoding.GetString(run));
                return;
            }
            foreach (var b in run) output.Append((char)b);
        }

        private static bool IsLetter(char c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

        private static bool IsDigit(char c) => c >= '0' && c <= '9';

        private static int HexValue(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        }
    }
}
