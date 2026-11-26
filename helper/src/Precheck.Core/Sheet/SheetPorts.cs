using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Sheet;

/// <summary>
/// 코드 주소·함께 쓸 메일 바꾸기 확인 창(spec google-link TASK-10, design.md 2절 표 17·9-2). 지금 비트 등록 확인 창(IConfirmWindow)과 따로 둔다.
/// [바꾸기]를 눌러야만 참. [취소]·창 닫기·시간 지남이면 거짓. 윈도 쪽은 Precheck.Windows.SheetConfirmWindow(맨 위 STA 창, 기본 단추 [취소]).
/// </summary>
public interface ISheetConfirm
{
    bool Show(string text, TimeSpan timeout);
}

/// <summary>윈도 클립보드에 글을 넣는다(sheet.code, STA). 넣지 못하면 HelperException(E-STORE-FAILED).</summary>
public interface IClipboard
{
    void SetText(string text);
}

/// <summary>확인 창 글(design.md 2절 표 17 글 그대로). 창 제목·단추 글도 여기 한 곳.</summary>
public static class SheetPrompt
{
    public const string Title = "수납일지 구글 코드 주소 바꾸기";
    public const string Change = "바꾸기";
    public const string Cancel = "취소";

    /// <summary>확인 창이 기다리는 시간(design.md 9-2: 2분).</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromMinutes(2);

    private const string Body =
        "오늘 수납 환자 줄(이름·차트번호·금액)을 아래 구글 코드로 보내고, 새 달 파일을 아래 메일과 함께 써요. 병원 구글 계정에서 받은 주소가 맞으면 [바꾸기]를 눌러 주세요.";

    /// <summary>창 글: 안내 + 빈 줄 + `주소: {주소}` + `함께 쓸 직원 메일: {메일, 메일 | 없음}`. 주소·메일은 사람이 다 보도록 줄이지 않는다.</summary>
    public static string Text(string url, IEnumerable<string> shareWith)
    {
        var mails = (shareWith ?? Enumerable.Empty<string>()).ToList();
        return Body + "\n\n주소: " + (url ?? "") + "\n함께 쓸 직원 메일: " + (mails.Count == 0 ? "없음" : string.Join(", ", mails));
    }
}
