using System;
using System.Collections.Generic;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 DB 읽기. 줄마다 칸 값을 순서대로(원본이 reader[0]처럼 순서로 읽는다), DB NULL은 null로 준다.
/// 윈도우에서는 Precheck.Windows.SqlBitDb: ReadOnlyGuard → 매개변수 → 되돌리는 트랜잭션 안에서 읽는다.
/// 실패·시간 지남은 BitException(E-BIT-READ-FAILED).
/// </summary>
public interface IBitDb
{
    IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout);
}

/// <summary>지금 붙은 비트: 설치 위치·DB 서버 이름·DB 이름(등록 값과 비교한다, 원본 CheckConnection).</summary>
public sealed class BitTarget
{
    public BitTarget(string installPath, string server, string database)
    {
        InstallPath = installPath ?? "";
        Server = server ?? "";
        Database = database ?? "";
    }

    public string InstallPath { get; }

    public string Server { get; }

    public string Database { get; }
}

/// <summary>열린 비트 DB 하나. 닫으면(Dispose) 트랜잭션을 끝내지 않고 되돌린다.</summary>
public interface IBitSession : IBitDb, IDisposable
{
    BitTarget Target { get; }
}

/// <summary>비트 설치 찾기(Precheck.Windows.InstallationLocator). 못 찾으면 BitException(E-BIT-NOT-FOUND).</summary>
public interface IBitLocator
{
    string Find();
}

/// <summary>
/// 비트 DB 열기(Precheck.Windows.SqlBitConnector): 비트 DLL의 접속 정보 → PrivateServer 검사 → ConnectTimeout=10.
/// 못 붙으면 BitException(E-BIT-DB-FAILED).
/// </summary>
public interface IBitConnector
{
    IBitSession Open(string installPath);
}

/// <summary>비트 로그인 창에서 로그인한 사용자와 작업일(yyyyMMdd).</summary>
public sealed class VendorUser
{
    public VendorUser(string userId, string workDate)
    {
        UserId = userId ?? "";
        WorkDate = workDate ?? "";
    }

    public string UserId { get; }

    public string WorkDate { get; }
}

/// <summary>비트 로그인 창(원본 BITUserLogIn bitDisplayDialog). 취소하면 null.</summary>
public interface IVendorLogin
{
    VendorUser? Login(string installPath);
}

/// <summary>
/// 도우미가 띄우는 PC 확인 창(ADR-016). 사람이 [확인]을 누르면 true. [취소]·창 닫기·시간 지남이면 false.
/// 글은 도우미가 비트·묶음에서 직접 만든 것만 넘긴다(웹이 보낸 글을 보이지 않는다).
/// </summary>
public interface IConfirmWindow
{
    bool Show(string text, TimeSpan timeout);
}
