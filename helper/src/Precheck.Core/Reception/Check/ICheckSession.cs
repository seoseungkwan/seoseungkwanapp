using System;
using System.Collections.Generic;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 확인 모드의 비트 DB 세션(윈도우: Precheck.Windows.CheckBitDb, 시험: 가짜). 여는 일이 등록 확인(HospitalGate)이고,
/// 읽기 전용 접속의 되돌리는 트랜잭션 안에서만 읽는다(AC-1401.12). 돌리기 전에 CheckSql.IsAllowed || ProbeSql.IsProbe || Sql.IsAllowed와
/// 그 문장의 매개변수 표를 본다. 줄마다 칸 값을 순서대로, DB NULL은 null로 준다. 닫으면(Dispose) 되돌린다.
/// </summary>
public interface ICheckSession : IDisposable
{
    /// <summary>등록 확인을 마친 병원 범위(HospitalRegistration.Scope = DepMst.DepHspNum). 문장의 @hospital로만 쓰고 보고서에 적지 않는다.</summary>
    string Hospital { get; }

    IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout);
}
