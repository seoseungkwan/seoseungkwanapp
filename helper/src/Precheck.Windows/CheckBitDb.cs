using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Globalization;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Precheck.Core.Registration;

namespace Precheck.Windows;

/// <summary>확인 모드 세션 열기(HospitalGate가 부른다): 제품과 같은 읽기 전용 접속(ReadOnlyConnection) → CheckBitDb.</summary>
public sealed class CheckBitConnector : IBitConnector
{
    public IBitSession Open(string installPath) => CheckBitDb.Open(ReadOnlyConnection.Create(installPath));
}

/// <summary>
/// 의원 PC 확인 명령의 DB 세션(spec reception-phone design.md 1절, AC-1401.9·11·12). SqlBitDb와 같은 길이다: 읽기 전용 접속,
/// 스냅숏 격리를 쓸 수 있으면 Snapshot 트랜잭션, 트랜잭션을 끝내지 않고 닫을 때 되돌린다.
/// 다른 점: 실행 전에 확인 문장(CheckSql) · 찾기 틀(ProbeSql) · 도우미 문장(Sql, ReadOnlyGuard 그대로) 가운데 하나이고 그 문장의
/// 매개변수 표와 꼭 맞는지 본다(도우미의 SqlBitDb·Sql.IsAllowed는 확인 문장·틀을 받지 않는다). 줄을 받는 동안에도 시계를 본다.
/// SQL 오류는 싸지 않고 올려 보고서가 형 이름·번호만 적게 한다(CheckField.Failed). 오류 글은 어디에도 쓰지 않는다. SqlBitDb는 고치지 않는다.
/// </summary>
public sealed class CheckBitDb : IBitSession, ICheckSession
{
    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    private readonly SqlConnection connection;
    private readonly SqlTransaction transaction;
    private bool disposed;

    private CheckBitDb(SqlConnection connection, SqlTransaction transaction, BitTarget target)
    {
        this.connection = connection;
        this.transaction = transaction;
        Target = target;
    }

    public BitTarget Target { get; }

    /// <summary>등록 확인을 마친 병원 범위(HospitalRegistration.Scope). OpenVerified가 정한다. 문장의 @hospital로만 쓴다.</summary>
    public string Hospital { get; private set; } = "";

    /// <summary>
    /// 등록 확인(HospitalGate, AC-005.6)을 이 세션으로 지난 확인 모드 세션. services에서 DB 열기만 CheckBitConnector로 바꾼다.
    /// 등록이 없거나 다르면 던지고, 연 세션은 HospitalGate가 닫는다(되돌림).
    /// </summary>
    public static CheckBitDb OpenVerified(BitServices services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        var gate = new BitServices(services.Locator, new CheckBitConnector(), services.Login, services.Confirm, services.Store,
            services.Today, services.NewProfileId, services.Screens);
        var hospital = HospitalGate.Open(gate);
        if (!(hospital.Db is CheckBitDb db))
        {
            hospital.Dispose();
            throw new BitException(BitErrors.DbFailed);
        }
        db.Hospital = hospital.Registration.Scope;
        return db;
    }

    /// <summary>붙고 되돌리는 트랜잭션을 연다. 못 붙으면 그 예외를 그대로 올린다(SqlException이면 보고서에 번호만).</summary>
    public static CheckBitDb Open(ReadOnlyConnectionInfo info)
    {
        if (info == null) throw new ArgumentNullException(nameof(info));
        var connection = new SqlConnection(info.ConnectionString);
        try
        {
            connection.Open();
            var snapshot = SnapshotAvailable(connection);
            var transaction = connection.BeginTransaction(snapshot ? IsolationLevel.Snapshot : IsolationLevel.ReadCommitted);
            return new CheckBitDb(connection, transaction, info.Target);
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    /// <summary>
    /// 검사(Require)를 지난 문장만, 검사가 돌려준 매개변수 표대로 붙여 되돌리는 트랜잭션 안에서 읽는다. 시간 제한은 CommandTimeout과,
    /// 줄을 받는 동안의 시계 둘이다(CommandTimeout은 서버 답 한 번의 한도라 줄을 오래 받는 것은 막지 못한다). 넘으면 TimeoutException.
    /// </summary>
    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        if (disposed) throw new ObjectDisposedException(nameof(CheckBitDb));
        var declared = Require(sql, args);

        var clock = Stopwatch.StartNew();
        using var command = new SqlCommand(sql, connection, transaction) { CommandTimeout = ReadOnlyConnection.Seconds(timeout) };
        foreach (var parameter in declared)
        {
            if (parameter.Kind == SqlParamKind.Int)
            {
                command.Parameters.Add(parameter.Name, SqlDbType.Int).Value = (int)args[parameter.Name]!;
                continue;
            }
            var type = parameter.Kind == SqlParamKind.VarChar ? SqlDbType.VarChar : SqlDbType.Char;
            command.Parameters.Add(parameter.Name, type, parameter.Size).Value = (string)args[parameter.Name]!;
        }

        var rows = new List<IReadOnlyList<object?>>();
        var timedOut = false;
        try
        {
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
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
        catch (SqlException) when (timedOut)
        {
            // Cancel 뒤 닫을 때 오는 오류는 시간 초과로 본다
        }
        if (timedOut) throw new TimeoutException();
        return rows;
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

    /// <summary>
    /// 실행 전 검사(AC-1401.9): 확인 문장(CheckSql) · 찾기 틀(ProbeSql, 만든 글을 다시 풀어 틀·이름 모양 확인) · 도우미 문장(Sql, ReadOnlyGuard).
    /// 정해 둔 매개변수 이름이 모두 있고 그 밖은 없으며 값의 종류·길이가 맞아야 한다. 아니면 DB에 닿기 전에 E-BIT-READ-FAILED.
    /// </summary>
    private static IReadOnlyList<SqlParam> Require(string sql, IReadOnlyDictionary<string, object?> args)
    {
        if (sql == null || args == null) throw new BitException(BitErrors.ReadFailed);
        IReadOnlyList<SqlParam> declared;
        if (CheckSql.IsAllowed(sql))
        {
            declared = CheckSql.ParametersOf(sql);
        }
        else if (ProbeSql.IsProbe(sql))
        {
            declared = ProbeSql.Parameters;
        }
        else if (Sql.IsAllowed(sql))
        {
            ReadOnlyGuard.Require(sql, args);
            return Sql.ParametersOf(sql);
        }
        else
        {
            throw new BitException(BitErrors.ReadFailed);
        }

        if (args.Count != declared.Count) throw new BitException(BitErrors.ReadFailed);
        foreach (var parameter in declared)
        {
            if (!args.TryGetValue(parameter.Name, out var value) || !Fits(parameter, value)) throw new BitException(BitErrors.ReadFailed);
        }
        return declared;
    }

    private static bool Fits(SqlParam parameter, object? value) =>
        parameter.Kind == SqlParamKind.Int ? value is int : value is string text && text.Length <= parameter.Size;

    /// <summary>SqlBitDb와 같다: 스냅숏 격리가 켜진 DB면 Snapshot, 아니면 ReadCommitted(트랜잭션 밖에서 읽음).</summary>
    private static bool SnapshotAvailable(SqlConnection connection)
    {
        ReadOnlyGuard.Require(Sql.SnapshotStateSql, NoArgs);
        using var command = new SqlCommand(Sql.SnapshotStateSql, connection) { CommandTimeout = ReadOnlyConnection.Seconds(Sql.MetaTimeout) };
        var value = command.ExecuteScalar();
        return value != null && !(value is DBNull) && Convert.ToInt32(value, CultureInfo.InvariantCulture) == 1;
    }
}
