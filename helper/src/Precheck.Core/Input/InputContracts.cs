using System;

namespace Precheck.Core.Input;

/// <summary>PC 확인 창(Precheck.Windows.ConfirmWindow). [확인]이면 true. [취소]·닫기·시간 지남·closeRequested가 서면 false(AC-017.2·AC-017.9).</summary>
public interface IInputConfirm
{
    bool Ask(string text, TimeSpan timeout, Func<bool> closeRequested);
}

/// <summary>진행 알림. 숫자만 받는다(AC-017.6). 던지지 않는다.</summary>
public interface IInputProgress
{
    void Report(int done, int total);
}

/// <summary>진행 창(Precheck.Windows.ProgressWindow): 진행 N/M명과 [멈추기].</summary>
public interface IProgressWindow : IDisposable
{
    bool StopPressed { get; }

    void Update(int done, int total);
}

public enum JournalState
{
    /// <summary>쓰기 바로 앞에 남긴다. 이것이 마지막이면 쓰는 중에 도우미가 끝났다.</summary>
    Writing,

    Done,
    Skipped,

    /// <summary>확인 필요지만 메모 칸에 쓰지는 않았다(미처리 등).</summary>
    Check,

    /// <summary>쓰기를 시작했고 저장을 확인하지 못했다: 우리 글이 저장 안 된 채 칸에 남았을 수 있다.</summary>
    WriteUnconfirmed,
}

/// <summary>
/// 입력 기록(AC-017.7). 진짜는 작업 저장(TASK-15 WorkStore)의 journal 칸이다. Mark는 돌아오기 전에 디스크에 남아야 한다: 쓰기 전 writing이 먼저다.
/// 못 남기면 번호 있는 예외(E-STORE-FAILED)를 던진다. 그러면 쓰지 않고 멈춘다.
/// </summary>
public interface IInputJournal
{
    /// <param name="item">그 진료. 입력 기록은 진료 달의 파일(work-YYYY-MM.dat)에 있어 날짜가 함께 간다: 묶음이 달을 넘길 수 있다.</param>
    void Mark(InputItem item, JournalState state);

    /// <summary>
    /// 그 진료의 마지막 기록. 기록이 없으면 null. 묶음이 돌기 전에 진료마다 한 번 부른다.
    /// 못 읽으면(모르는 값 포함) 번호 있는 예외(E-STORE-FAILED)를 던진다: 못 읽은 것을 null로 돌려주면 쓰다 멈춘 사람을 놓쳐 거짓 완료가 된다.
    /// </summary>
    JournalState? LastState(InputItem item);

    /// <summary>끝난 묶음의 결과를 작업 저장에 남긴다(다시 열면 보임, AC-017.9).</summary>
    void SaveResults(InputOutcome outcome);
}

public enum MemoMatch
{
    /// <summary>같음(이미 입력됨).</summary>
    Same,

    /// <summary>다름(이미 있음, 덮어쓰지 않음).</summary>
    Different,

    /// <summary>비트에 없음(입력).</summary>
    Absent,

    /// <summary>조회 못함: 빈칸으로 보지 않는다.</summary>
    Unknown,
}

/// <summary>쓰기 직전 비교. 진짜는 Core/Claim/MemoCompare(TASK-16, AC-016.2)다.</summary>
public interface IMemoMatcher
{
    /// <param name="ours">입력할 메모.</param>
    /// <param name="inBit">비트 메모 칸 글. 읽지 못했으면 null.</param>
    MemoMatch Compare(string ours, string? inBit);
}
