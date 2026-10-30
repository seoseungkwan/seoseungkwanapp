using System;
using System.Text.RegularExpressions;

namespace Precheck.Core.Protocol;

/// <summary>메시지 틀이 쓰는 오류 번호(design.md 4-5). 문구는 웹 lib/errors.ts 한 곳에 있다.</summary>
public static class ErrorCodes
{
    public const string BadMessage = "E-HELPER-BAD-MESSAGE";
    public const string UnknownCommand = "E-HELPER-UNKNOWN-COMMAND";

    /// <summary>뜻밖의 예외로 도우미가 끝날 때 기록에 남기는 번호. 크롬 연결이 끊겨 웹도 이 번호를 본다(AC-004.7).</summary>
    public const string Disconnected = "E-BRIDGE-DISCONNECTED";

    /// <summary>
    /// 환자 자료 명령의 처리기가 result로 답하려 했다(처리기 버그). 웹도 같은 경우를 이 번호로 막는다(AC-004.6).
    /// </summary>
    public const string BadReply = "E-BRIDGE-BAD-REPLY";

    /// <summary>호출 origin이 우리 확장이 아니어서 끝날 때 기록에 남기는 번호(AC-001.3).</summary>
    public const string Rejected = "E-BRIDGE-REJECTED";

    // .NET의 $는 끝 줄바꿈 앞에서도 맞으므로 \z로 끝을 잡는다
    private static readonly Regex Shape = new Regex(@"^E-[A-Z0-9]+(?:-[A-Z0-9]+)*\z", RegexOptions.CultureInvariant);

    /// <summary>'E-…' 모양(대문자·숫자·붙임표, 64자 이하)인가.</summary>
    public static bool IsCode(string? code) => code != null && code.Length <= 64 && Shape.IsMatch(code);
}

/// <summary>오류 번호 하나를 싣는 예외. 메시지에는 번호만 들어간다(환자 글자를 예외에 싣지 않는다, AC-001.6).</summary>
public class HelperException : Exception
{
    public HelperException(string code)
        : base(ErrorCodes.IsCode(code) ? code : throw new ArgumentException("오류 번호 모양이 틀렸다", nameof(code)))
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>메시지 틀·봉투·명령 표 검사에서 막힌 것. 바른 요청 id를 알면 함께 싣는다(오류 답에 쓴다).</summary>
public sealed class ProtocolException : HelperException
{
    public ProtocolException(string code, string? requestId = null) : base(code)
    {
        RequestId = requestId;
    }

    public string? RequestId { get; }
}

/// <summary>틀이 깨져 다음 메시지 자리를 찾을 수 없다(64MiB를 넘는 길이, 중간에 끊긴 입력). 도우미는 끝난다.</summary>
public sealed class FramingBrokenException : Exception
{
    public FramingBrokenException() : base("framing broken") { }
}

/// <summary>처리기가 뜻밖의 예외로 멈췄다. Dispatcher가 이미 기록했다. 안쪽 예외의 글은 어디에도 쓰지 않는다.</summary>
internal sealed class CommandCrashedException : Exception
{
    public CommandCrashedException(Exception inner) : base("command crashed", inner) { }
}
