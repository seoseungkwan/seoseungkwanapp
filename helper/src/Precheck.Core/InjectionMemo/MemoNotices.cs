using System.Globalization;

namespace Precheck.Core.InjectionMemo;

/// <summary>2~3초 알림 글(AC-7503.3). 글자는 승인 시안 docs/mockups/injection-memo/notes.md '화면 글자' 그대로다.</summary>
public static class MemoNotices
{
    public const string NoRecord = "최근 30일 안에 주사 차수 기록이 없어요.";
    public const string AlreadyHas = "메모에 주사 차수가 이미 있어요.";
    public const string NoPatient = "접수 화면에 환자를 먼저 불러와 주세요.";
    public const string Failed = "비트에서 기록을 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.";

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
                var planned = result.PlannedDate;
                return planned == null
                    ? "주사 날이 아닐 수 있어요. 넣지 않았어요."
                    : "주사 날이 아닐 수 있어요(계획 " + planned.Value.Month.ToString(CultureInfo.InvariantCulture) + "월 " + planned.Value.Day.ToString(CultureInfo.InvariantCulture) + "일). 넣지 않았어요.";
            case MemoResultKind.AlreadyHas:
                return AlreadyHas;
            case MemoResultKind.NoPatient:
                return NoPatient;
            default:
                return Failed;
        }
    }
}
