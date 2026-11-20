using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint.Docs.RxCopy;

/// <summary>
/// 처방전 사본(spec doc-print TASK-6)이 비트 DB에 돌리는 SQL 허용 목록. DocSql이 모아 ReadOnlyGuard에 건다.
/// 문장은 읽기 전용 SELECT/WITH 하나·매개변수만·';' 없음·줄바꿈 \n. 지금은 빈 껍데기다(TASK-6이 채운다).
/// </summary>
public static class RxCopySql
{
    public static readonly IReadOnlyDictionary<string, SqlParam[]> Allowed = new Dictionary<string, SqlParam[]>(StringComparer.Ordinal);
}
