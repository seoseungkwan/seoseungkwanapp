using System;
using System.Collections.Generic;
using System.Linq;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑 closing.uisCodes(spec erp-uisarang design.md 3-3·4-2, REQ-4206 AC-4206.5, TASK-13): 엑셀 폴더의 기간별처방통계 하나로 코드 목록을 만든다.
/// - 첫째 돌기: 열린 엑셀이 하나라도 있으면 아무것도 읽거나 지우지 않고 state open
/// - 둘째 돌기(UisDay와 같은 UisPass): 깨짐·종류 모름·20MB 넘음은 지우고, 환자별 엑셀은 알아본 바로 뒤 지운다(숫자도 쓰지 않음).
///   처방통계가 아닌 합계 엑셀(일일수입·내원·예약)은 지우지 않는다(마감 때 closing.day가 쓴다)
/// - 처방통계 0개 missing · 1개면 조건이 '전체'가 아니면 notAll(지움), 아니면 ok + 코드 목록(UisRx.List, 기간은 따지지 않음 — 지움) ·
///   여럿이면 twice(조건이 '전체'가 아닌 것만 지우고 나머지는 남김)
/// 답에 파일 이름·칸 글자를 넣지 않는다(코드·처방명칭·수량·금액만). 디스크는 IUisFolder로만 닿는다.
/// </summary>
public static class UisCodes
{
    /// <summary>실제 .xls 읽기(XlsRows)로 코드 목록.</summary>
    public static UisCodesResult Read(IUisFolder folder) => Read(folder, XlsRows.Read);

    /// <summary>바이트 → 줄 읽기를 바꿔 끼울 수 있는 입구(시험용). 나머지는 위와 같다.</summary>
    public static UisCodesResult Read(IUisFolder folder, Func<byte[], IReadOnlyList<IReadOnlyList<XlsCell>>> rows)
    {
        if (folder == null) throw new ArgumentNullException(nameof(folder));
        if (rows == null) throw new ArgumentNullException(nameof(rows));

        var pass = new UisPass(folder, rows);
        var files = folder.List();
        if (pass.OpenKinds(files).Count > 0) return new UisCodesResult { State = UisCodesState.Open };

        var found = pass.Sweep(files, kind => kind == UisKind.Rx, patient: null);
        if (found.Count == 0) return new UisCodesResult { State = UisCodesState.Missing };

        if (found.Count > 1)
        {
            foreach (var held in found.Where(held => UisReport.Condition(held.Sheet) != null)) pass.Remove(held.Entry, unknown: false);
            return new UisCodesResult { State = UisCodesState.Twice };
        }

        var sheet = found[0].Sheet;
        var range = UisReport.Range(sheet);
        var condition = UisReport.Condition(sheet);
        var result = new UisCodesResult
        {
            State = condition == null ? UisCodesState.Ok : UisCodesState.NotAll,
            From = range?.FromText,
            To = range?.ToText,
            Value = condition?.Value,
            Codes = condition == null ? UisRx.List(sheet) : new UisCodeRow[0],
        };
        pass.Remove(found[0].Entry, unknown: false);
        return result;
    }
}
