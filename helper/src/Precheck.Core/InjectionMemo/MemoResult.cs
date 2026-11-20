using System;

namespace Precheck.Core.InjectionMemo;

/// <summary>[주사 차수]를 누른 결과 종류(spec injection-memo). 알림 글은 MemoNotices.Of가 고른다.</summary>
public enum MemoResultKind
{
    /// <summary>메모 칸에 넣는다(Text·Append).</summary>
    Insert,

    /// <summary>최근 30일 증상에 주사 차수가 없다('N차까지'인데 지난 메모에 번호가 없을 때도).</summary>
    NoRecord,

    /// <summary>'N차까지' 계획이 끝났다(UntilNumber).</summary>
    Finished,

    /// <summary>기록의 간격보다 3일 넘게 일찍 왔다(PlannedDate).</summary>
    TooEarly,

    /// <summary>메모 칸에 주사 'N차'가 이미 있다.</summary>
    AlreadyHas,

    /// <summary>접수 화면 차트번호 칸이 비었거나 차트번호가 아니다.</summary>
    NoPatient,

    /// <summary>비트 DB를 읽지 못했다(실패·5초 넘음).</summary>
    Failed,
}

/// <summary>
/// 결과 하나. 넣을 글(Text: '/' 없는 새 글, Append: 칸 끝에 칠 글)은 Insert일 때만, 계획 날짜는 TooEarly일 때만,
/// 계획 끝 번호는 Finished일 때만 있고 나머지는 빈 값이다. 환자 값이라 파일·로그에 남기지 않는다(ToString에도 글이 없다).
/// </summary>
public sealed class MemoResult
{
    public MemoResult(MemoResultKind kind, string? text = null, DateTime? plannedDate = null, int untilNumber = 0, string? append = null, MemoResult? reason = null)
    {
        Kind = kind;
        Text = kind == MemoResultKind.Insert ? (text ?? "") : "";
        Append = kind == MemoResultKind.Insert ? (append ?? Text) : "";
        PlannedDate = kind == MemoResultKind.TooEarly ? plannedDate?.Date : null;
        UntilNumber = kind == MemoResultKind.Finished ? untilNumber : 0;
        Reason = kind == MemoResultKind.Insert ? reason : null;
    }

    public MemoResultKind Kind { get; }

    /// <summary>넣을 글('오)무릎 3차'). 알림 '넣었어요: …'에 쓴다.</summary>
    public string Text { get; }

    /// <summary>메모 칸 끝에 칠 글: 칸이 비었으면 Text, 글이 있으면 '/' + Text(칸 끝이 이미 '/'면 Text).</summary>
    public string Append { get; }

    /// <summary>계획 날짜(차수가 적힌 내원 날 + 간격).</summary>
    public DateTime? PlannedDate { get; }

    /// <summary>'N차까지'의 N.</summary>
    public int UntilNumber { get; }

    /// <summary>엑스레이 경과만 넣고 주사 글은 못 넣었을 때 그 주사 쪽 결과(기록 없음·끝남·일찍 옴·이미 있음, AC-7505.3·.4). 그 밖에는 null.</summary>
    public MemoResult? Reason { get; }

    /// <summary>종류만(넣을 글·날짜는 환자 값이라 빼고).</summary>
    public override string ToString() => "MemoResult(" + Kind + ")";
}
