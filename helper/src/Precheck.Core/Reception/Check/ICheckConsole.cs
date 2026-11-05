namespace Precheck.Core.Reception.Check;

/// <summary>
/// 확인 명령의 콘솔(윈도우: Precheck.Windows.ReceptionCheckEntry의 콘솔, 시험: 가짜). CheckRunner는 안내·물음·숫자·걸러진 코드만 쓴다.
/// 사람이 친 글(접수 메모)은 견주기에만 쓰고 다시 쓰지 않는다(AC-1401.6).
/// </summary>
public interface ICheckConsole
{
    /// <summary>한 줄 쓴다.</summary>
    void Write(string line);

    /// <summary>사람이 친 한 줄. 입력이 끝났으면 null.</summary>
    string? ReadLine();
}
