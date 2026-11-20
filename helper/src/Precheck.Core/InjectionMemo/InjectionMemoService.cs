using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// [주사 차수]·단축키 한 번, [엑스레이] 한 번(spec injection-memo): 화면 차트번호 칸 글과 메모 칸 글 → 결과. 윈도우 층(Precheck.PtSlip)은 백그라운드에서 이것을 부르고,
/// Insert면 메모 칸 끝에 Append만 치고, 알림은 MemoNotices.Of(결과)를 보인다. 비트 DB는 읽기만 한다.
/// </summary>
public static class InjectionMemoService
{
    /// <summary>
    /// [주사 차수]·단축키(주사 차수만, 엑스레이는 안 봄 — AC-7505.4). 차례: 차트번호가 아니면 NoPatient(DB에 묻지 않음) →
    /// 메모 칸에 주사 'N차'가 이미 있으면 AlreadyHas(DB에 묻지 않음) → 오늘 앞 30일 읽기(실패·시간 지남은 Failed) → 규칙(InjectionRule.Decide, 여유 3일).
    /// Insert면 Append = 칸 끝에 칠 글.
    /// </summary>
    public static MemoResult Compute(IBitDb db, string? chart, string? currentMemo, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var number = ChartNumber.Normalize(chart);
        if (number == null) return new MemoResult(MemoResultKind.NoPatient);
        if (MemoMerge.HasInjectionCount(currentMemo)) return new MemoResult(MemoResultKind.AlreadyHas);

        try
        {
            var decided = InjectionRule.Decide(InjectionReader.Read(db, number, today), today);
            if (decided.Kind != MemoResultKind.Insert) return decided;
            return new MemoResult(MemoResultKind.Insert, decided.Text, append: MemoMerge.AppendText(currentMemo, decided.Text));
        }
        catch (Exception)
        {
            // 어떤 실패든 알림은 '비트에서 기록을 읽지 못했어요'만(오류 내용·환자 값을 남기지 않는다)
            return new MemoResult(MemoResultKind.Failed);
        }
    }

    /// <summary>
    /// [엑스레이](REQ-7505·7506): 차트번호가 아니면 NoPatient, 칸에 'xr'이 있으면 XrayAlreadyHas(둘 다 DB에 묻지 않음) →
    /// 30일 내원(증상 줄이 없으면 그 전 마지막 내원) → 설정에서 고른 엑스레이(chosen)의 부위만 → 부위가 없으면 XrayNone(영상 안 읽음) →
    /// 영상 처방 읽기 → MemoCompose.ComposeXray. 어떤 읽기든 실패·시간 지남이면 Failed.
    /// </summary>
    public static MemoResult ComputeXray(IBitDb db, string? chart, string? currentMemo, DateTime today, IReadOnlyCollection<string>? chosen)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var number = ChartNumber.Normalize(chart);
        if (number == null) return new MemoResult(MemoResultKind.NoPatient);
        if (MemoCompose.HasXray(currentMemo)) return new MemoResult(MemoResultKind.XrayAlreadyHas);

        try
        {
            var notes = InjectionReader.Read(db, number, today);
            var lastBefore = XrayParts.HasSymptoms(notes, today) ? null : InjectionReader.ReadLastBefore(db, number, today);
            var allowed = new HashSet<string>(chosen ?? Array.Empty<string>(), StringComparer.Ordinal);
            var parts = XrayParts.Of(notes, lastBefore, today).Where(allowed.Contains).ToList();
            if (parts.Count == 0) return new MemoResult(MemoResultKind.XrayNone);
            var shots = InjectionReader.ReadXray(db, number, today);
            return MemoCompose.ComposeXray(currentMemo, XrayRule.Overdue(parts, shots, today));
        }
        catch (Exception)
        {
            return new MemoResult(MemoResultKind.Failed);
        }
    }
}
