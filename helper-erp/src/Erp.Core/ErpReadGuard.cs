using System;
using System.Collections.Generic;
using Erp.Core.Closing;
using Precheck.Core.Bit;

namespace Erp.Core;

/// <summary>
/// ERP 도우미의 비트 DB 읽기 관문(spec erp-closing-fill design.md 3-1, AC-3606.1). 기존 관문(Precheck.Core ReadOnlyGuard·Sql)은 고치지 않으므로
/// 마감일지 문장을 모른다. 그래서 ERP 도우미는 이 관문을 따로 가진다: 마감일지 문장(ClosingSql.Parameters)과 기존 관문이 받는 문장(Sql.IsAllowed,
/// 매출·코드 목록·등록 확인에 씀)만, 그 문장이 정해 둔 매개변수(이름·글자·길이·int)와 함께 통과시킨다. 검사는 기존 ReadOnlyGuard와 같다.
/// 표 밖 문장·틀린 매개변수는 DB에 닿기 전에 E-BIT-READ-FAILED. 마감일지 읽기는 모두 Query로 한다.
/// </summary>
public static class ErpReadGuard
{
    /// <summary>마감일지 문장이거나 기존 관문이 받는 문장인가(글자가 똑같아야 한다).</summary>
    public static bool IsAllowed(string? sql) =>
        sql != null && (ClosingSql.Parameters.ContainsKey(sql) || Sql.IsAllowed(sql));

    /// <summary>문장이 받는 매개변수 표: 마감일지 표 → 아니면 기존 Sql.ParametersOf. 둘 다 아니면 BitException(E-BIT-READ-FAILED).</summary>
    public static IReadOnlyList<SqlParam> ParametersOf(string sql)
    {
        if (sql != null && ClosingSql.Parameters.TryGetValue(sql, out var closing)) return closing;
        if (sql != null && Sql.IsAllowed(sql)) return Sql.ParametersOf(sql);
        throw new BitException(BitErrors.ReadFailed);
    }

    /// <summary>허용한 문장이 아니면 BitException(E-BIT-READ-FAILED).</summary>
    public static void Require(string sql)
    {
        if (!IsAllowed(sql)) throw new BitException(BitErrors.ReadFailed);
    }

    /// <summary>
    /// 문장 + 매개변수: 정해 둔 이름이 모두 있고 그 밖은 없으며, 값은 글자이고 정해 둔 길이 이하. 정수 매개변수는 int 값만(ReadOnlyGuard와 같다).
    /// </summary>
    public static void Require(string sql, IReadOnlyDictionary<string, object?> args)
    {
        Require(sql);
        if (args == null) throw new BitException(BitErrors.ReadFailed);
        var declared = ParametersOf(sql);
        if (args.Count != declared.Count) throw new BitException(BitErrors.ReadFailed);
        foreach (var parameter in declared)
        {
            if (!args.TryGetValue(parameter.Name, out var value) || !Fits(parameter, value)) throw new BitException(BitErrors.ReadFailed);
        }
    }

    private static bool Fits(SqlParam parameter, object? value) =>
        parameter.Kind == SqlParamKind.Int ? value is int : value is string text && text.Length <= parameter.Size;

    /// <summary>관문을 지난 문장만 db로 보낸다.</summary>
    public static IReadOnlyList<IReadOnlyList<object?>> Query(IBitDb db, string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        Require(sql, args);
        return db.Query(sql, args, timeout);
    }
}
