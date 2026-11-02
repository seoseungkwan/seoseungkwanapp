using System;
using System.Collections.Generic;

namespace Precheck.Core.Diag;

/// <summary>
/// 문장 하나의 결과. Rows는 줄 값 목록이다: 제품 읽기와 환경 줄을 만드는 데 넘기고, 보고서에는 줄 수만 간다.
/// 실패는 번호와 종류만 담는다(SQL 오류 글·예외 글을 담을 칸이 없다).
/// </summary>
public sealed class DiagOutcome
{
    private static readonly IReadOnlyList<IReadOnlyList<object?>> NoRows = new IReadOnlyList<object?>[0];

    private DiagOutcome(bool ok, IReadOnlyList<IReadOnlyList<object?>> rows, long totalMs, long? firstRowMs, int? sqlNumber, string? errorKind)
    {
        Ok = ok;
        Rows = rows;
        TotalMs = totalMs;
        FirstRowMs = firstRowMs;
        SqlNumber = sqlNumber;
        ErrorKind = errorKind;
    }

    public bool Ok { get; }

    public IReadOnlyList<IReadOnlyList<object?>> Rows { get; }

    public long TotalMs { get; }

    public long? FirstRowMs { get; }

    /// <summary>SqlException.Number. 시간 초과는 -2.</summary>
    public int? SqlNumber { get; }

    /// <summary>번호가 없는 실패의 종류: 예외 형 이름이나 도우미 오류 번호.</summary>
    public string? ErrorKind { get; }

    public static DiagOutcome Success(IReadOnlyList<IReadOnlyList<object?>> rows, long totalMs, long? firstRowMs) =>
        new DiagOutcome(true, rows ?? throw new ArgumentNullException(nameof(rows)), totalMs, firstRowMs, null, null);

    public static DiagOutcome Failure(long totalMs, long? firstRowMs, int? sqlNumber, string? errorKind) =>
        new DiagOutcome(false, NoRows, totalMs, firstRowMs, sqlNumber, errorKind);
}

/// <summary>
/// 측정용 비트 세션. 닫으면 트랜잭션을 되돌린다. SQL 오류는 예외가 아니라 결과로 온다(번호를 잃지 않으려고).
/// 윈도우에서는 Precheck.Windows.DiagBitDb: ReadOnlyGuard → 매개변수 → 되돌리는 트랜잭션 안에서 읽는다.
/// </summary>
public interface IDiagSession : IDisposable
{
    DiagOutcome Run(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout);
}

/// <summary>측정 세션 열기. 못 열면 DiagOpenFailedException.</summary>
public interface IDiagConnector
{
    IDiagSession Open(string installPath);
}

/// <summary>세션을 못 열었다. 번호와 종류만 넘긴다(접속 오류 글에는 서버 이름이 섞인다).</summary>
public sealed class DiagOpenFailedException : Exception
{
    public DiagOpenFailedException(int? sqlNumber, string? code)
    {
        SqlNumber = sqlNumber;
        Code = code;
    }

    public int? SqlNumber { get; }

    /// <summary>번호가 없을 때의 종류: 도우미 오류 번호나 예외 형 이름.</summary>
    public string? Code { get; }
}
