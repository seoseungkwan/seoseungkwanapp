using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// [주사 차수]·단축키 한 번(spec injection-memo): 화면 차트번호 칸 글과 메모 칸 글 → 결과. 윈도우 층(Precheck.PtSlip)은 백그라운드에서 이것을 부르고,
/// Insert면 메모 칸 끝에 Append만 치고, 알림은 MemoNotices.Of(결과)를 보인다. 비트 DB는 읽기만 한다.
/// </summary>
public static class InjectionMemoService
{
    /// <summary>
    /// 차례: 차트번호가 아니면 NoPatient(DB에 묻지 않음) → 메모 칸에 주사 'N차'가 이미 있으면 AlreadyHas(DB에 묻지 않음) →
    /// 오늘 앞 30일 읽기(실패·시간 지남은 Failed) → 규칙(InjectionRule.Decide, 여유 3일). Insert면 Append = 칸 끝에 칠 글.
    /// </summary>
    public static MemoResult Compute(IBitDb db, string? chart, string? currentMemo, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var number = ChartNumber.Normalize(chart);
        if (number == null) return new MemoResult(MemoResultKind.NoPatient);
        // 주사 차수도 엑스레이도 이미 적혀 있으면 더 넣을 게 없다(읽기 실패로 '이미 있음'을 가리지 않게 DB를 안 읽음)
        if (MemoMerge.HasInjectionCount(currentMemo) && MemoCompose.HasXray(currentMemo)) return new MemoResult(MemoResultKind.AlreadyHas);

        try
        {
            var notes = InjectionReader.Read(db, number, today);
            var injection = Injection(notes, currentMemo, today);

            // 엑스레이 경과(REQ-7505·7506): 칸에 xr이 있으면 안 읽음, 30일 안 증상 없으면 그 전 마지막 내원, 부위가 없으면 영상 안 읽음
            if (MemoCompose.HasXray(currentMemo)) return injection;
            var lastBefore = XrayParts.HasSymptoms(notes, today) ? null : InjectionReader.ReadLastBefore(db, number, today);
            var parts = XrayParts.Of(notes, lastBefore, today);
            if (parts.Count == 0) return injection;
            var shots = InjectionReader.ReadXray(db, number, today);
            return MemoCompose.Compose(injection, XrayRule.Overdue(parts, shots, today), currentMemo);
        }
        catch (Exception)
        {
            // 어떤 실패든 알림은 '비트에서 기록을 읽지 못했어요'만(오류 내용·환자 값을 남기지 않는다)
            return new MemoResult(MemoResultKind.Failed);
        }
    }

    private static MemoResult Injection(IReadOnlyList<VisitNote> notes, string? currentMemo, DateTime today)
    {
        if (MemoMerge.HasInjectionCount(currentMemo)) return new MemoResult(MemoResultKind.AlreadyHas);
        var decided = InjectionRule.Decide(notes, today);
        if (decided.Kind != MemoResultKind.Insert) return decided;
        return new MemoResult(MemoResultKind.Insert, decided.Text, append: MemoMerge.AppendText(currentMemo, decided.Text));
    }
}
