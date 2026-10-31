using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>비트 DB 열기: ReadOnlyConnection(비트 DLL 접속 정보·서버 검사·ConnectTimeout=10) → SqlBitDb.</summary>
public sealed class SqlBitConnector : IBitConnector
{
    public IBitSession Open(string installPath) => SqlBitDb.Open(ReadOnlyConnection.Create(installPath));
}

/// <summary>
/// 비트 DB 세션(AC-005.3). 원본처럼 스냅숏 격리를 쓸 수 있는지 본 뒤 트랜잭션을 열고, 끝내지 않는다(Commit 없음):
/// 닫으면 되돌린다. 읽기는 ReadOnlyGuard를 지난 Sql 상수만, Sql 매개변수 표의 종류·길이로 붙인 매개변수와 함께.
/// SQL 글자를 이어 붙이는 길이 없다.
/// </summary>
public sealed class SqlBitDb : IBitSession
{
    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    private readonly SqlConnection connection;
    private readonly SqlTransaction transaction;
    private bool disposed;

    private SqlBitDb(SqlConnection connection, SqlTransaction transaction, BitTarget target)
    {
        this.connection = connection;
        this.transaction = transaction;
        Target = target;
    }

    public BitTarget Target { get; }

    /// <summary>붙고 되돌리는 트랜잭션을 연다. 못 붙으면 E-BIT-DB-FAILED.</summary>
    public static SqlBitDb Open(ReadOnlyConnectionInfo info)
    {
        if (info == null) throw new ArgumentNullException(nameof(info));
        var connection = new SqlConnection(info.ConnectionString);
        try
        {
            connection.Open();
            var snapshot = SnapshotAvailable(connection);
            var transaction = connection.BeginTransaction(snapshot ? IsolationLevel.Snapshot : IsolationLevel.ReadCommitted);
            return new SqlBitDb(connection, transaction, info.Target);
        }
        catch (Exception e) when (e is SqlException || e is InvalidOperationException || e is BitException)
        {
            connection.Dispose();
            throw new BitException(BitErrors.DbFailed);
        }
    }

    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        if (disposed) throw new ObjectDisposedException(nameof(SqlBitDb));
        ReadOnlyGuard.Require(sql, args);
        using var command = new SqlCommand(sql, connection, transaction) { CommandTimeout = ReadOnlyConnection.Seconds(timeout) };
        foreach (var parameter in Sql.ParametersOf(sql))
        {
            var type = parameter.Kind == SqlParamKind.VarChar ? SqlDbType.VarChar : SqlDbType.Char;
            command.Parameters.Add(parameter.Name, type, parameter.Size).Value = (string)args[parameter.Name]!;
        }
        var rows = new List<IReadOnlyList<object?>>();
        try
        {
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var row = new object?[reader.FieldCount];
                for (var i = 0; i < row.Length; i++) row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(row);
            }
        }
        catch (Exception e) when (e is SqlException || e is InvalidOperationException)
        {
            // SQL 오류 글에는 값이 섞일 수 있어 번호만 남긴다
            throw new BitException(BitErrors.ReadFailed);
        }
        return rows;
    }

    /// <summary>트랜잭션을 되돌리고(Commit하지 않는다) 연결을 닫는다.</summary>
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

    /// <summary>원본: 스냅숏 격리가 켜진 DB면 Snapshot, 아니면 ReadCommitted(트랜잭션 밖에서 읽음).</summary>
    private static bool SnapshotAvailable(SqlConnection connection)
    {
        ReadOnlyGuard.Require(Sql.SnapshotStateSql, NoArgs);
        using var command = new SqlCommand(Sql.SnapshotStateSql, connection) { CommandTimeout = ReadOnlyConnection.Seconds(Sql.MetaTimeout) };
        var value = command.ExecuteScalar();
        return value != null && !(value is DBNull) && Convert.ToInt32(value, CultureInfo.InvariantCulture) == 1;
    }
}
