using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// [주사 차수]·단축키 한 번(화면 차트번호 칸 글과 메모 칸 글 → 결과), [엑스레이] 한 번(차트번호 → 목록) — spec injection-memo. 윈도우 층(Precheck.PtSlip)은 백그라운드에서 이것을 부르고,
/// Insert면 메모 칸 끝에 Append만 치고, 알림은 MemoNotices.Of(결과)를 보인다. 비트 DB는 읽기만 한다.
/// </summary>
public static class InjectionMemoService
{
    /// <summary>
    /// [주사 차수]·단축키(주사 차수와 골절 fx, 엑스레이는 안 봄 — AC-7505.4·REQ-7507). 차례: 차트번호가 아니면 NoPatient(DB에 묻지 않음) →
    /// 메모 칸에 주사 'N차'와 fx가 다 있으면 AlreadyHas(DB에 묻지 않음) → 오늘 앞 30일 읽기(칸에 fx가 없으면 주상병도, 실패·시간 지남은 Failed) →
    /// 차수 규칙(InjectionRule.Decide, 여유 3일, 칸에 차수가 있으면 AlreadyHas) + 골절(FractureRule.Text). fx가 있으면 'fx 글' 또는 'fx 글/차수 글'을 넣고
    /// (차수가 기록 없음·끝남·일찍 옴·이미 있음이어도 fx만), 없으면 차수 결과 그대로. Insert면 Append = 칸 끝에 칠 글.
    /// </summary>
    public static MemoResult Compute(IBitDb db, string? chart, string? currentMemo, DateTime today)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var number = ChartNumber.Normalize(chart);
        if (number == null) return new MemoResult(MemoResultKind.NoPatient);
        var hasCount = MemoMerge.HasInjectionCount(currentMemo);
        var hasFx = FractureRule.HasFx(currentMemo);
        if (hasCount && hasFx) return new MemoResult(MemoResultKind.AlreadyHas);

        try
        {
            var notes = InjectionReader.Read(db, number, today, withDiagnoses: !hasFx);
            var decided = hasCount ? new MemoResult(MemoResultKind.AlreadyHas) : InjectionRule.Decide(notes, today);
            var fx = hasFx ? null : FractureRule.Text(notes);
            var text = fx == null
                ? (decided.Kind == MemoResultKind.Insert ? decided.Text : null)
                : (decided.Kind == MemoResultKind.Insert ? fx + "/" + decided.Text : fx);
            if (text == null) return decided;
            return new MemoResult(MemoResultKind.Insert, text, append: MemoMerge.AppendText(currentMemo, text));
        }
        catch (Exception)
        {
            // 어떤 실패든 알림은 '비트에서 기록을 읽지 못했어요'만(오류 내용·환자 값을 남기지 않는다)
            return new MemoResult(MemoResultKind.Failed);
        }
    }

    /// <summary>
    /// [엑스레이](REQ-7505·7506, 2026-11-20 오후 목록 창으로 바꿈): 차트번호가 아니면 NoPatient(DB에 묻지 않음) →
    /// 영상 처방만 읽기(오늘 앞 20년, 증상 줄·내원·주상병은 안 읽음) → XrayList.Of(찍은 부위 전부 + chosen 가운데 찍은 적 없는 것).
    /// 실패·시간 지남이면 Failed. 넣기는 창에서 [넣기]마다 MemoCompose.ComposeXrayPart.
    /// </summary>
    public static XrayListResult ReadXrayList(IBitDb db, string? chart, DateTime today, IReadOnlyCollection<string>? chosen)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var number = ChartNumber.Normalize(chart);
        if (number == null) return new XrayListResult(XrayListKind.NoPatient);

        try
        {
            var shots = InjectionReader.ReadXray(db, number, today);
            return new XrayListResult(XrayListKind.Ok, XrayList.Of(shots, chosen, today));
        }
        catch (Exception)
        {
            // 어떤 실패든 알림은 '비트에서 기록을 읽지 못했어요'만(오류 내용·환자 값을 남기지 않는다)
            return new XrayListResult(XrayListKind.Failed);
        }
    }
}
