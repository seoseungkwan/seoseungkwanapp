using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Globalization;
using Precheck.Core.Bit;
using Precheck.Core.Diag;

namespace Precheck.Windows;

/// <summary>측정 세션 열기: 제품과 같은 접속 정보(ReadOnlyConnection)에 풀만 끈다.</summary>
public sealed class DiagBitConnector : IDiagConnector
{
    public IDiagSession Open(string installPath) => DiagBitDb.Open(installPath);
}

/// <summary>
/// 측정 세션(specs/diag-read-speed). SqlBitDb와 같은 길이다: 관문을 지난 상수만, 표대로 붙인 매개변수로, 되돌리는 트랜잭션 안에서 읽고 닫을 때 되돌린다.
/// 다른 점은 셋뿐이다. 첫 줄까지 시간과 SqlException.Number를 결과에 담고, 줄을 받는 동안에도 시계를 보며(CommandTimeout은 호출 한 번의 한도라서),
/// 풀을 꺼서 세션이 다시 쓰이지 않게 한다(그래야 비용·대기 값이 그 단계 몫이다). SQL 오류 글은 어디에도 싣지 않는다. SqlBitDb는 고치지 않는다.
/// </summary>
public sealed class DiagBitDb : IDiagSession
{
    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    private readonly SqlConnection connection;
    private readonly SqlTransaction transaction;
    private bool disposed;

    private DiagBitDb(SqlConnection connection, SqlTransaction transaction)
    {
        this.connection = connection;
        this.transaction = transaction;
    }

    public static DiagBitDb Open(string installRoot)
    {
        string connectionString;
        try
        {
            connectionString = new SqlConnectionStringBuilder(ReadOnlyConnection.Create(installRoot).ConnectionString) { Pooling = false }.ConnectionString;
        }
        catch (BitException e)
        {
            throw new DiagOpenFailedException(null, e.Code);
        }

        var connection = new SqlConnection(connectionString);
        try
        {
            connection.Open();
            var snapshot = SnapshotAvailable(connection);
            var transaction = connection.BeginTransaction(snapshot ? IsolationLevel.Snapshot : IsolationLevel.ReadCommitted);
            return new DiagBitDb(connection, transaction);
        }
        catch (SqlException e)
        {
            connection.Dispose();
            throw new DiagOpenFailedException(e.Number, null);
        }
        catch (Exception e) when (e is InvalidOperationException || e is BitException)
        {
            connection.Dispose();
            throw new DiagOpenFailedException(null, e.GetType().Name);
        }
    }

    public DiagOutcome Run(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        if (disposed) throw new ObjectDisposedException(nameof(DiagBitDb));
        ReadOnlyGuard.Require(sql, args);

        var clock = Stopwatch.StartNew();
        var rows = new List<IReadOnlyList<object?>>();
        long? firstRowMs = null;
        var timedOut = false;
        try
        {
            using var command = new SqlCommand(sql, connection, transaction) { CommandTimeout = ReadOnlyConnection.Seconds(timeout) };
            foreach (var parameter in Sql.ParametersOf(sql))
            {
                var type = parameter.Kind == SqlParamKind.VarChar ? SqlDbType.VarChar : SqlDbType.Char;
                command.Parameters.Add(parameter.Name, type, parameter.Size).Value = (string)args[parameter.Name]!;
            }

            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                firstRowMs ??= clock.ElapsedMilliseconds;
                var row = new object?[reader.FieldCount];
                for (var i = 0; i < row.Length; i++) row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(row);
                if (clock.Elapsed > timeout)
                {
                    // Cancel 없이 닫으면 reader가 남은 줄을 다 읽는다
                    timedOut = true;
                    command.Cancel();
                    break;
                }
            }
        }
        catch (SqlException e)
        {
            // Cancel 뒤 닫을 때 오는 오류는 시간 초과로 적는다
            if (!timedOut) return DiagOutcome.Failure(clock.ElapsedMilliseconds, firstRowMs, e.Number, null);
        }
        catch (InvalidOperationException e)
        {
            return DiagOutcome.Failure(clock.ElapsedMilliseconds, firstRowMs, null, e.GetType().Name);
        }

        return timedOut
            ? DiagOutcome.Failure(clock.ElapsedMilliseconds, firstRowMs, DiagFormat.TimeoutNumber, null)
            : DiagOutcome.Success(rows, clock.ElapsedMilliseconds, firstRowMs ?? clock.ElapsedMilliseconds);
    }

    /// <summary>트랜잭션을 되돌리고 연결을 닫는다.</summary>
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        try
        {
            transaction.Rollback();
        }
        catch (Exception e) when (e is SqlException || e is InvalidOperationException)
        {
            // 연결이 이미 끊겼으면 서버가 되돌린다
        }
        transaction.Dispose();
        connection.Dispose();
    }

    /// <summary>SqlBitDb와 같다: 스냅숏 격리가 켜진 DB면 Snapshot, 아니면 ReadCommitted(트랜잭션 밖에서 읽음).</summary>
    private static bool SnapshotAvailable(SqlConnection connection)
    {
        ReadOnlyGuard.Require(Sql.SnapshotStateSql, NoArgs);
        using var command = new SqlCommand(Sql.SnapshotStateSql, connection) { CommandTimeout = ReadOnlyConnection.Seconds(Sql.MetaTimeout) };
        var value = command.ExecuteScalar();
        return value != null && !(value is DBNull) && Convert.ToInt32(value, CultureInfo.InvariantCulture) == 1;
    }
}
