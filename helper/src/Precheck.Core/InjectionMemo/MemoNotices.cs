using System.Globalization;

namespace Precheck.Core.InjectionMemo;

/// <summary>2~3초 알림 글(AC-7503.3). 글자는 승인 시안 docs/mockups/injection-memo/notes.md '화면 글자' 그대로다.</summary>
public static class MemoNotices
{
    public const string NoRecord = "최근 30일 안에 주사 차수 기록이 없어요.";
    public const string AlreadyHas = "메모에 주사 차수가 이미 있어요.";
    public const string NoPatient = "접수 화면에 환자를 먼저 불러와 주세요.";
    public const string Failed = "비트에서 기록을 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.";

    /// <summary>
    /// '넣지 못함'(빨강): 넣을 글(Insert 결과의 Text, '/' 없는 새 글)을 메모 칸에 치지 못했을 때 — 칸이 꽉 참(50자)·잠김·윈도우가 막음.
    /// 직원이 보고 직접 적도록 글을 같이 보인다(화면에만, 파일·로그에 남기지 않는다).
    /// </summary>
    public static string TypeFailed(string? text) => "메모 칸에 넣지 못했어요. 직접 적어 주세요: " + (text ?? "");

    /// <summary>결과 → 알림 글. null은 읽기 실패 글. 계획 날짜는 'M월 D일'(앞 0 없음).</summary>
    public static string Of(MemoResult? result)
    {
        if (result == null) return Failed;
        switch (result.Kind)
        {
            case MemoResultKind.Insert:
                return "넣었어요: " + result.Text;
            case MemoResultKind.NoRecord:
                return NoRecord;
            case MemoResultKind.Finished:
                return "계획한 주사가 끝났어요(" + result.UntilNumber.ToString(CultureInfo.InvariantCulture) + "차까지). 넣지 않았어요.";
            case MemoResultKind.TooEarly:
                // 계획 날짜 없는 일찍 옴은 규칙상 안 나온다. 시안에 없는 글을 만들지 않고 읽기 실패 글로
                var planned = result.PlannedDate;
                return planned == null
                    ? Failed
                    : "주사 날이 아닐 수 있어요(계획 " + planned.Value.Month.ToString(CultureInfo.InvariantCulture) + "월 " + planned.Value.Day.ToString(CultureInfo.InvariantCulture) + "일). 넣지 않았어요.";
            case MemoResultKind.AlreadyHas:
                return AlreadyHas;
            case MemoResultKind.NoPatient:
                return NoPatient;
            case MemoResultKind.XrayAlreadyHas:
                // [엑스레이] 창은 알림 없이 그 줄을 '넣음'으로 바꾼다(AC-7505.3)
                return "";
            default:
                return Failed;
        }
    }
}
