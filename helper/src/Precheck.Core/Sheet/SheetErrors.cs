using Precheck.Core.Protocol;

namespace Precheck.Core.Sheet;

/// <summary>
/// 수납 구글 시트 오류 번호(spec google-link design.md 9-3). 글은 웹 lib/errors.ts 한 곳에 있다(통로는 그곳에 있는 번호만 받는다).
/// 도우미는 E-GSHEET-EXT(웹이 정함)를 내지 않는다.
/// </summary>
public static class SheetErrors
{
    /// <summary>구글 연결 안 됨(인터넷).</summary>
    public const string Net = "E-GSHEET-NET";

    /// <summary>구글이 제때 답하지 않음.</summary>
    public const string Timeout = "E-GSHEET-TIMEOUT";

    /// <summary>구글과 연결이 중간에 끊김.</summary>
    public const string Cut = "E-GSHEET-CUT";

    /// <summary>401·403: '액세스 권한: 모든 사용자'가 아님.</summary>
    public const string Denied = "E-GSHEET-DENIED";

    /// <summary>주소 꼴이 틀림·404.</summary>
    public const string Url = "E-GSHEET-URL";

    /// <summary>5xx·뜻밖의 답 번호·넘겨받기가 이상함.</summary>
    public const string Server = "E-GSHEET-SERVER";

    /// <summary>JSON 대신 로그인·안내 화면(HTML)이거나 googleusercontent 밖으로 넘겨받음.</summary>
    public const string Login = "E-GSHEET-LOGIN";

    /// <summary>구글 코드의 비밀 글자 자리가 그대로(token_not_set).</summary>
    public const string NoKey = "E-GSHEET-NOKEY";

    /// <summary>비밀 글자가 맞지 않음(bad_token, hello mac 틀림).</summary>
    public const string Key = "E-GSHEET-KEY";

    public const string Busy = "E-GSHEET-BUSY";

    public const string Template = "E-GSHEET-TEMPLATE";

    public const string Folder = "E-GSHEET-FOLDER";

    /// <summary>그날 시트 없음(no_sheet).</summary>
    public const string Day = "E-GSHEET-DAY";

    /// <summary>시트 칸 설정이 맞지 않음(layout, 비트시트 칸 글자 검사).</summary>
    public const string Layout = "E-GSHEET-LAYOUT";

    /// <summary>보낸 내용 모양이 맞지 않음(bad_request).</summary>
    public const string Shape = "E-GSHEET-SHAPE";

    public const string Declined = "E-GSHEET-DECLINED";

    /// <summary>이 PC에서 비밀 글자를 읽지 못함·없음.</summary>
    public const string Secret = "E-GSHEET-SECRET";

    /// <summary>구글에서 받은 주소가 비었음.</summary>
    public const string NoUrl = "E-GSHEET-NOURL";

    /// <summary>원본 시트 주소가 비었음.</summary>
    public const string NoTemplate = "E-GSHEET-NOTEMPLATE";

    /// <summary>구글 코드가 옛 판(hello·months를 모름).</summary>
    public const string Old = "E-GSHEET-OLD";

    /// <summary>구글 쪽에서 일을 마치지 못함(clean·google·모르는 code).</summary>
    public const string Failed = "E-GSHEET-FAILED";
}

/// <summary>수납 구글 시트에서 막힌 것. 메시지에는 번호만(구글이 준 글·환자 값을 싣지 않는다).</summary>
public sealed class SheetException : HelperException
{
    public SheetException(string code)
        : base(code)
    {
    }
}
