using System;
using System.Collections.Generic;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 DB 읽기 관문(AC-005.3). Sql 클래스의 상수 문장만, 그 문장이 정해 둔 매개변수(이름·글자·길이)와 함께 통과시킨다.
/// SQL 글자를 이어 붙인 것·고친 것·다른 문장은 DB에 닿기 전에 E-BIT-READ-FAILED로 막는다.
/// Core의 읽기는 Query로, Precheck.Windows.SqlBitDb는 실행 직전에 Require로 한 번 더 막는다.
/// </summary>
public static class ReadOnlyGuard
{
    /// <summary>허용 목록의 문장이 아니면 BitException(E-BIT-READ-FAILED).</summary>
    public static void Require(string sql)
    {
        if (!Sql.IsAllowed(sql)) throw new BitException(BitErrors.ReadFailed);
    }

    /// <summary>
    /// 문장 + 매개변수: 정해 둔 이름이 모두 있고 그 밖은 없으며, 값은 글자이고 정해 둔 길이 이하.
    /// 정수 매개변수(원본 SqlDbType.Int, 예: 상병 추세 @minimum)는 int 값만.
    /// </summary>
    public static void Require(string sql, IReadOnlyDictionary<string, object?> args)
    {
        Require(sql);
        if (args == null) throw new BitException(BitErrors.ReadFailed);
        var declared = Sql.ParametersOf(sql);
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
