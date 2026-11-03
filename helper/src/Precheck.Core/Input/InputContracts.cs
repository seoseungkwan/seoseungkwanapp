using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Input;

/// <summary>PC 확인 창(Precheck.Windows.ConfirmWindow). [확인]이면 true. [취소]·닫기·시간 지남·closeRequested가 서면 false(AC-017.2·AC-017.9).</summary>
public interface IInputConfirm
{
    /// <param name="noAskOn">묻지 않기가 이미 켜진 채 뜨는 창이다(AC-037.8): 체크는 켜진 채 잠겨 끌 수 없다.</param>
    /// <param name="noAskTicked">창을 닫을 때 체크를 새로 켜 두었다. [확인]이 아니면 켜지지 않는다(AC-037.4).</param>
    bool Ask(string text, bool noAskOn, TimeSpan timeout, Func<bool> closeRequested, out bool noAskTicked);
}

/// <summary>
/// PC 확인 창의 체크 '이제부터 묻지 않기'(AC-037.4). 값은 이 도우미 프로세스 메모리에만 있고 저장하지 않는다: 도우미는 웹 연결이 닫히면 끝나므로 청구 창을 닫거나 새로 고치면 꺼진다.
/// 켜는 길은 창의 [확인]뿐이고 끄는 길은 없다. 명령 표에 칸이 없어 사이트는 켤 수 없다(AC-037.5).
/// </summary>
public sealed class NoAskSwitch
{
    public bool IsOn { get; private set; }

    public void TurnOn() => IsOn = true;
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

    /// <summary>
    /// 직접 확인으로 왔고(checkedByHand) [확인] 뒤 완료로 끝나지도 칸에 글을 남기지도 않았다(AC-035.5). 파일 글자 skippedByHand.
    /// 메모리에만 두면 창을 새로 고칠 때 잊는다. 다음 묶음이 LastState로 읽는다(AC-037.6).
    /// </summary>
    SkippedByHand,
}

/// <summary>
/// 입력 기록을 읽다가 깨진 달 파일의 이름만 바꾸고 멈췄다(AC-035.9). 번호와 답 모양은 E-STORE-FAILED 그대로이고, 부르는 쪽이 다시 누르면 이어진다는 글을 싣게 해 준다.
/// 되살렸거나 다른 병원 파일이면 이 예외가 아니다.
/// </summary>
public sealed class RecordSetAsideException : HelperException
{
    public RecordSetAsideException() : base(BitErrors.StoreFailed)
    {
    }
}

/// <summary>쓰다 멈춘 진료 하나(결과 JSON의 unconfirmed 줄, AC-035.4). 날짜는 YYYY-MM-DD.</summary>
public sealed class UnconfirmedVisit
{
    public UnconfirmedVisit(string visitKey, string date)
    {
        VisitKey = visitKey;
        Date = date;
    }

    public string VisitKey { get; }
    public string Date { get; }
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

    /// <summary>
    /// 바꾸기 전에 칸에 있던 글을 그 진료 달의 파일에 덧붙여 남긴다(AC-037.1). 돌아오기 전에 디스크에 남는다. 목록의 마지막 글과 같으면 덧붙이지 않는다.
    /// 못 남기면(글을 파일에 담지 못하는 때 포함) 번호 있는 예외(E-STORE-FAILED)를 던진다: 그러면 칸에 쓰지 않고 멈춘다.
    /// </summary>
    void SaveOriginal(InputItem item, string text);

    /// <summary>그 진료의 원래 메모 목록의 마지막 글. 없으면 null. 못 읽으면 번호 있는 예외(E-STORE-FAILED)를 던진다.</summary>
    string? LastOriginal(InputItem item);

    /// <summary>
    /// 끝난 묶음의 결과를 작업 저장에 남긴다(다시 열면 보임, AC-017.9). 결과 줄은 상태를 모르므로 이번 묶음에서 Mark한 진료와 앞선 writing·writeUnconfirmed·skippedByHand를 덮지 않고,
    /// Mark하지 않은 사람에게는 미리 뺀 사람(outcome.Excluded)의 skipped만 적는다(AC-035.2).
    /// </summary>
    void SaveResults(InputOutcome outcome);
}

/// <summary>묶음 앞 검사의 결과(AC-035.4·AC-035.9).</summary>
public sealed class JournalScan
{
    public JournalScan(IReadOnlyList<UnconfirmedVisit> stuck, IReadOnlyList<string> recordsToAck)
    {
        Stuck = stuck ?? throw new ArgumentNullException(nameof(stuck));
        RecordsToAck = recordsToAck ?? throw new ArgumentNullException(nameof(recordsToAck));
    }

    /// <summary>읽을 수 있는 이 병원 달 파일에서 마지막 기록이 writing·writeUnconfirmed인 진료.</summary>
    public IReadOnlyList<UnconfirmedVisit> Stuck { get; }

    /// <summary>아직 확인하지 않은 '확인할 수 없는 기록'이 있으면 지금 폴더에 있는 그런 파일들의 해시 전부. 없으면 비어 있고 묻지 않는다.</summary>
    public IReadOnlyList<string> RecordsToAck { get; }
}

/// <summary>처리기가 쓰는 입력 기록(TASK-35): 사람마다 쓰는 일에 묶음 앞 검사를 더했다. 진짜는 Core/Store/WorkStoreJournal이다.</summary>
public interface IBatchJournal : IInputJournal
{
    /// <summary>
    /// 남아 있는 달 파일 전부를 고치지 않고 본다(AC-035.4·AC-035.9). 안을 볼 수 없는 파일은 예외가 아니라 RecordsToAck로 온다. 폴더나 파일을 읽지 못하거나(잠김 등)
    /// 이 병원 파일의 기록 값이 틀리면 번호 있는 예외(E-STORE-FAILED)를 던진다: 못 읽은 것을 빈 목록으로 돌려주면 저장 안 된 글이 칸에 남은 채 다른 사람을 연다.
    /// </summary>
    JournalScan Scan();

    /// <summary>직원이 [확인]한 해시를 남긴다(AC-035.9). 못 남기면 번호 있는 예외(E-STORE-FAILED)를 던진다.</summary>
    void SaveAcks(IReadOnlyList<string> hashes);
}

public enum MemoMatch
{
    /// <summary>같음(이미 입력됨).</summary>
    Same,

    /// <summary>다름(승인이나 묻지 않기 없이는 덮어쓰지 않음, design.md 19-6).</summary>
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
