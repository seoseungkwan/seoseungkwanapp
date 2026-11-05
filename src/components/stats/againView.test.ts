import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addDays, diffDays } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { AgainCounts, AgainWindow, DayAgainPayload, DayPayload } from '@/types/payload'
import {
  againAverageText,
  againBaseText,
  againExtraSpan,
  againRateText,
  againSpan,
  againView,
  isFewStarts,
  needsExtra,
  type AgainRow,
} from './againView'
import { statsRange, type StatsInput, type StatsPeriod, type StatsRange } from './view'

// 같은 처방 재방문의 화면 숫자 (fu-rate REQ-1305). 날 줄·처방 코드·이름은 모두 이 파일에서 지어낸 값이다

type AgainRx = DayAgainPayload['rx'][number]
const ag = (code: string, starts: number, back: AgainCounts, more: AgainCounts): AgainRx => ({ code, starts, back, more })
const READY_ALL: DayAgainPayload['ready'] = [true, true, true]
const READY_NONE: DayAgainPayload['ready'] = [false, false, false]

function day(ymd: string, again?: { ready: DayAgainPayload['ready']; rx?: AgainRx[] }): DayPayload {
  const base: DayPayload = {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
  return again === undefined ? base : { ...base, again: { ready: again.ready, rx: again.rx ?? [] } }
}

const TODAY = '2026-11-05'
const ALL: DateRange[] = [{ from: '2025-01-01', to: '2026-11-04' }]
const range = (period: StatsPeriod, today = TODAY) => statsRange(today, period)
const input = (period: StatsPeriod, days: DayPayload[], covered: DateRange[] = ALL, today = TODAY): StatsInput => ({ days, covered, range: range(period, today) })
const pick = (code: string, name = `처방 ${code}`) => ({ code, name })
const row = (o: Partial<AgainRow> = {}): AgainRow => ({ code: 'T1', name: '처방 T1', starts: 0, back: 0, more: 0, wait: 0, ...o })
const runs = (list: [kind: 'ok' | 'no' | 'out', days: number][]) => list.map(([kind, days]) => ({ kind, days }))

describe('AC-1305.1 againSpan: 기간 끝 E = min(기간 끝, 오늘 − 1), 다 지나지 않으면 같은 길이로 옮긴다', () => {
  it('AC-1305.1 최근 7일은 세 창 모두 옮긴다(7일 → 10-22 ~ 10-28, 14일 → 10-15 ~ 10-21, 30일 → 09-29 ~ 10-05)', () => {
    const r = range('7d')
    const base = { from: '2026-10-29', to: '2026-11-04', days: 7, shifted: true }
    expect(againSpan(r, 7)).toEqual({ ...base, countFrom: '2026-10-22', countTo: '2026-10-28' })
    expect(againSpan(r, 14)).toEqual({ ...base, countFrom: '2026-10-15', countTo: '2026-10-21' })
    expect(againSpan(r, 30)).toEqual({ ...base, countFrom: '2026-09-29', countTo: '2026-10-05' })
  })

  it('AC-1305.1 최근 30일 + 30일 → 09-06 ~ 10-05(statsRange의 finishedCohort와 같다)', () => {
    const r = range('30d')
    const span = againSpan(r, 30)
    expect(span).toEqual({ from: '2026-10-06', to: '2026-11-04', days: 30, shifted: true, countFrom: '2026-09-06', countTo: '2026-10-05' })
    expect({ from: span.countFrom, to: span.countTo }).toEqual(r.finishedCohort)
  })

  it('AC-1305.1 최근 30일 + 14일 → 10-06 ~ 10-21, + 7일 → 10-06 ~ 10-28(옮기지 않음)', () => {
    const r = range('30d')
    expect(againSpan(r, 14)).toEqual({ from: '2026-10-06', to: '2026-11-04', days: 30, shifted: false, countFrom: '2026-10-06', countTo: '2026-10-21' })
    expect(againSpan(r, 7)).toMatchObject({ shifted: false, countFrom: '2026-10-06', countTo: '2026-10-28' })
  })

  it('AC-1305.1 최근 90일 + 30일 → 08-07 ~ 10-05', () => {
    expect(againSpan(range('90d'), 30)).toEqual({ from: '2026-08-07', to: '2026-11-04', days: 90, shifted: false, countFrom: '2026-08-07', countTo: '2026-10-05' })
  })

  it('AC-1305.1 최근 12개월 + 7일 → 2025-12-01 ~ 2026-10-28(기간 끝 11-30을 오늘 − 1로 자른다)', () => {
    const span = againSpan(range('12m'), 7)
    expect(span).toEqual({ from: '2025-12-01', to: '2026-11-04', days: 339, shifted: false, countFrom: '2025-12-01', countTo: '2026-10-28' })
    expect(span.days).toBe(diffDays('2025-12-01', '2026-11-04') + 1)
  })

  it('AC-1305.1 E − w가 기간 첫날과 같으면 옮기지 않는다(앞이 아니다)', () => {
    const r: StatsRange = { ...range('7d'), current: { from: '2026-10-28', to: '2026-11-04', label: '' } }
    expect(againSpan(r, 7)).toEqual({ from: '2026-10-28', to: '2026-11-04', days: 8, shifted: false, countFrom: '2026-10-28', countTo: '2026-10-28' })
  })

  it('AC-1305.1 오늘은 range.load.to다(다른 오늘이면 다른 범위)', () => {
    expect(againSpan(range('30d', '2026-12-10'), 14)).toMatchObject({ to: '2026-12-09', countFrom: '2026-11-10', countTo: '2026-11-25' })
  })
})

describe('AC-1305.6 againExtraSpan·needsExtra', () => {
  it('AC-1305.6 최근 7일만 [E − 36, 비교 기간 첫날 − 1](오늘 2026-11-05 → 09-29 ~ 10-21)', () => {
    const r = range('7d')
    const extra = againExtraSpan(r)
    expect(extra).toEqual({ from: '2026-09-29', to: '2026-10-21' })
    // 넓은 읽기와 페이지 읽기(비교 기간 첫날 ~)가 30일 띠를 빈틈없이 덮는다
    expect(extra?.from).toBe(againSpan(r, 30).countFrom)
    expect(addDays(extra!.to, 1)).toBe(r.previous.from)
  })

  it('AC-1305.6 나머지 기간은 null', () => {
    expect(againExtraSpan(range('30d'))).toBeNull()
    expect(againExtraSpan(range('90d'))).toBeNull()
    expect(againExtraSpan(range('12m'))).toBeNull()
  })

  it('AC-1305.6 needsExtra는 최근 7일이면서 14일·30일일 때만 참', () => {
    expect([7, 14, 30].map((w) => needsExtra(range('7d'), w as AgainWindow))).toEqual([false, true, true])
    for (const period of ['30d', '90d', '12m'] as const) {
      expect([7, 14, 30].map((w) => needsExtra(range(period), w as AgainWindow))).toEqual([false, false, false])
    }
  })
})

describe('AC-1305.2·1305.8 날마다 가르기와 띠', () => {
  // 최근 30일 + 7일: 센 범위 10-06 ~ 10-28, 끝 7일(10-29 ~ 11-04)은 아직 셀 수 없음
  const covered: DateRange[] = [
    { from: '2026-10-01', to: '2026-10-09' },
    { from: '2026-10-11', to: '2026-11-04' },
  ]
  const days = [
    day('2026-10-06', { ready: [true, false, false] }), // ok: 7일 창이 숫자
    day('2026-10-07', { ready: READY_NONE }), // no: ready[0] false
    day('2026-10-08'), // no: again 없는 옛 줄
    // 10-09: 줄 없음 + 덮음 = 휴진 → ok
    // 10-10: 줄 없음 + 덮이지 않음 → no
  ]

  it('AC-1305.2 센 범위 안: again ready → ok, ready false·옛 줄·덮이지 않은 날 → no, 휴진 → ok. 센 범위 뒤 w일은 no', () => {
    const view = againView(input('30d', days, covered), 7, [])
    expect(view.strip.runs).toEqual(runs([['ok', 1], ['no', 2], ['ok', 1], ['no', 1], ['ok', 18], ['no', 7]]))
  })

  it('AC-1305.8 띠: 첫날·끝날과 ok·no·out 날 수(합 = 띠의 날 수)', () => {
    const { strip } = againView(input('30d', days, covered), 7, [])
    expect(strip).toMatchObject({ from: '2026-10-06', to: '2026-11-04', ok: 20, no: 10, out: 0 })
    expect(strip.ok + strip.no + strip.out).toBe(diffDays(strip.from, strip.to) + 1)
    expect(strip.runs.reduce((total, run) => total + run.days, 0)).toBe(30)
  })

  it('AC-1305.5 gapDays = 센 범위 안의 no 날 수(뒤 w일은 넣지 않는다)', () => {
    expect(againView(input('30d', days, covered), 7, []).gapDays).toBe(3)
  })

  it('AC-1305.2 고른 날 수의 ready 자리를 본다(ready [true, true, false]: 7·14일 ok, 30일 no)', () => {
    const rows = [day('2026-09-01', { ready: [true, true, false] })]
    expect([7, 14, 30].map((w) => againView(input('90d', rows), w as AgainWindow, []).gapDays)).toEqual([0, 0, 1])
  })

  it('AC-1305.2 같은 날 줄이 둘이면 뒤의 것이다', () => {
    const late = [day('2026-10-07', { ready: READY_ALL }), day('2026-10-07', { ready: READY_NONE })]
    expect(againView(input('30d', late), 7, []).gapDays).toBe(1)
    expect(againView(input('30d', [...late].reverse()), 7, []).gapDays).toBe(0)
  })

  it('AC-1305.2·1305.8 옮겼을 때(최근 7일 + 14일): 센 범위 → 기간 밖(out) → 기간 전체 no, 띠 첫날은 옮긴 첫날', () => {
    const rows = [day('2026-10-30', { ready: READY_ALL })] // 기간 안 날은 ready여도 no
    const { strip, gapDays } = againView(input('7d', rows), 14, [])
    expect(strip).toEqual({ from: '2026-10-15', to: '2026-11-04', runs: runs([['ok', 7], ['out', 7], ['no', 7]]), ok: 7, no: 7, out: 7 })
    expect(gapDays).toBe(0)
  })

  it('AC-1305.2 최근 7일 + 7일은 기간 밖 날이 없다(옮긴 끝 다음 날 = 기간 첫날)', () => {
    const { strip } = againView(input('7d', []), 7, [])
    expect(strip).toEqual({ from: '2026-10-22', to: '2026-11-04', runs: runs([['ok', 7], ['no', 7]]), ok: 7, no: 7, out: 0 })
  })

  it('AC-1305.2 최근 7일 + 30일: 기간 밖 23일', () => {
    const { strip } = againView(input('7d', []), 30, [])
    expect(strip).toMatchObject({ from: '2026-09-29', to: '2026-11-04', runs: runs([['ok', 7], ['out', 23], ['no', 7]]), out: 23 })
  })
})

describe('AC-1305.3 처방별 합', () => {
  it('AC-1305.3 시안 예시(시작 3일째·6일째·8일째, 7일) → 시작 1·다시 1·더 2', () => {
    const rows = [day('2026-10-10', { ready: READY_ALL, rx: [ag('T3107', 1, [1, 1, 1], [2, 3, 3])] })]
    expect(againView(input('30d', rows), 7, [pick('T3107', 'ESWT7')]).rows).toEqual([{ code: 'T3107', name: 'ESWT7', starts: 1, back: 1, more: 2, wait: 0 }])
    expect(againView(input('30d', rows), 14, [pick('T3107', 'ESWT7')]).rows[0]).toMatchObject({ starts: 1, back: 1, more: 3 })
  })

  it('AC-1305.3 줄은 고른 차례 그대로이고 숫자가 없는 처방은 0이다', () => {
    const rows = [day('2026-10-10', { ready: READY_ALL, rx: [ag('A', 2, [1, 1, 1], [1, 1, 1]), ag('B', 3, [2, 2, 2], [4, 4, 4])] })]
    const view = againView(input('30d', rows), 7, [pick('B'), pick('Z'), pick('A')])
    expect(view.rows.map((r) => [r.code, r.starts, r.back, r.more])).toEqual([
      ['B', 3, 2, 4],
      ['Z', 0, 0, 0],
      ['A', 2, 1, 1],
    ])
  })

  it('AC-1305.3 ok 날을 모두 더한다', () => {
    const rows = [
      day('2026-10-08', { ready: READY_ALL, rx: [ag('A', 2, [1, 2, 2], [3, 5, 6])] }),
      day('2026-10-15', { ready: [true, true, false], rx: [ag('A', 4, [2, 3, null], [2, 4, null])] }),
    ]
    expect(againView(input('30d', rows), 7, [pick('A')]).rows[0]).toMatchObject({ starts: 6, back: 3, more: 5, wait: 0 })
    expect(againView(input('30d', rows), 14, [pick('A')]).rows[0]).toMatchObject({ starts: 6, back: 5, more: 9, wait: 0 })
  })

  it('AC-1305.3 코드는 codeKey로 견주고 대소문자만 다른 줄은 더한다', () => {
    const rows = [
      day('2026-10-08', { ready: READY_ALL, rx: [ag('ESWT', 2, [1, 1, 1], [2, 2, 2]), ag('eswt', 1, [1, 1, 1], [1, 1, 1])] }),
      day('2026-10-09', { ready: READY_ALL, rx: [ag('Eswt', 3, [0, 0, 0], [0, 0, 0])] }),
    ]
    expect(againView(input('30d', rows), 7, [pick('eSwt', 'ESWT')]).rows).toEqual([{ code: 'eSwt', name: 'ESWT', starts: 6, back: 2, more: 3, wait: 0 }])
  })

  it('AC-1305.3 wait = no 날 중 again이 있는 줄의 starts 합(센 범위 안 ready false + 끝 w일)', () => {
    const rows = [
      day('2026-10-07', { ready: READY_NONE, rx: [ag('A', 2, [null, null, null], [null, null, null])] }), // 센 범위 안 no
      day('2026-10-30', { ready: READY_NONE, rx: [ag('A', 3, [null, null, null], [null, null, null])] }), // 끝 7일
      day('2026-10-12', { ready: READY_ALL, rx: [ag('A', 5, [1, 1, 1], [1, 1, 1])] }), // ok
    ]
    expect(againView(input('30d', rows), 7, [pick('A')]).rows[0]).toMatchObject({ starts: 5, back: 1, more: 1, wait: 5 })
  })

  it('AC-1305.3 옮겼을 때: 기간 밖(out) 날은 넣지 않고 기간 날의 시작은 wait다', () => {
    const rows = [
      day('2026-10-16', { ready: [true, true, false], rx: [ag('A', 2, [1, 1, null], [1, 2, null])] }), // 센 범위(10-15 ~ 10-21)
      day('2026-10-25', { ready: READY_ALL, rx: [ag('A', 4, [4, 4, 4], [9, 9, 9])] }), // out
      day('2026-10-30', { ready: READY_NONE, rx: [ag('A', 3, [null, null, null], [null, null, null])] }), // 기간 = no
    ]
    expect(againView(input('7d', rows), 14, [pick('A')]).rows[0]).toMatchObject({ starts: 2, back: 1, more: 2, wait: 3 })
  })

  it('AC-1305.3 띠 밖의 날(띠 앞·오늘)은 세지 않는다', () => {
    const rows = [
      day('2026-10-05', { ready: READY_ALL, rx: [ag('A', 7, [7, 7, 7], [7, 7, 7])] }), // 최근 30일 첫날 앞
      day('2026-11-05', { ready: READY_NONE, rx: [ag('A', 9, [null, null, null], [null, null, null])] }), // 오늘
    ]
    const view = againView(input('30d', rows), 7, [pick('A')])
    expect(view.rows[0]).toMatchObject({ starts: 0, back: 0, more: 0, wait: 0 })
    expect(view.hasRows).toBe(false)
  })

  it('AC-1305.3 휴진 날(줄 없음)은 ok여도 숫자가 없다', () => {
    const view = againView(input('30d', []), 7, [pick('A')])
    expect(view.rows[0]).toMatchObject({ starts: 0, back: 0, more: 0, wait: 0 })
    expect(view.strip.ok).toBe(23)
  })
})

describe('AC-1305.4 글자', () => {
  it('AC-1305.4 비율은 rateText(back, starts): 1/3 → 33.3%, 2/3 → 66.6%(버림)', () => {
    expect(againRateText(row({ starts: 3, back: 1 }))).toBe('33.3%')
    expect(againRateText(row({ starts: 3, back: 2 }))).toBe('66.6%')
    expect(againRateText(row({ starts: 100, back: 29 }))).toBe('29.0%')
    expect(againRateText(row({ starts: 5, back: 5 }))).toBe('100.0%')
  })

  it('AC-1305.4 평균은 ⌊10 × more ÷ starts⌋ ÷ 10을 소수 한 자리로: 7/3 → 평균 2.3번 더, 4/2 → 2.0, 0/5 → 0.0', () => {
    expect(againAverageText(row({ starts: 3, more: 7 }))).toBe('평균 2.3번 더')
    expect(againAverageText(row({ starts: 2, more: 4 }))).toBe('평균 2.0번 더')
    expect(againAverageText(row({ starts: 5, more: 0 }))).toBe('평균 0.0번 더')
    expect(againAverageText(row({ starts: 3, more: 2 }))).toBe('평균 0.6번 더') // 0.666…은 0.7로 올리지 않는다
    expect(againAverageText(row({ starts: 10, more: 29 }))).toBe('평균 2.9번 더')
    expect(againAverageText(row({ starts: 3, more: 89 }))).toBe('평균 29.6번 더')
  })

  it('AC-1305.4 starts 0이면 비율·평균 모두 –', () => {
    expect(againRateText(row({ starts: 0 }))).toBe('–')
    expect(againAverageText(row({ starts: 0 }))).toBe('–')
  })

  it('AC-1305.4 isFewStarts는 1 ≤ starts ≤ 9일 때 참', () => {
    expect([0, 1, 9, 10, 25].map((starts) => isFewStarts(row({ starts })))).toEqual([false, true, true, false, false])
  })
})

describe('AC-1305.5 hasRows·hasAgain', () => {
  it('AC-1305.5 띠 범위에 날 줄이 없으면 둘 다 거짓', () => {
    expect(againView(input('30d', []), 7, [])).toMatchObject({ hasRows: false, hasAgain: false })
  })

  it('AC-1305.5 줄은 있는데 again이 없으면 hasRows만 참', () => {
    expect(againView(input('30d', [day('2026-10-20'), day('2026-11-01')]), 7, [])).toMatchObject({ hasRows: true, hasAgain: false })
  })

  it('AC-1305.5 again이 있는 줄이 하나라도 있으면 둘 다 참(ready가 모두 false여도)', () => {
    expect(againView(input('30d', [day('2026-10-20'), day('2026-11-01', { ready: READY_NONE })]), 7, [])).toMatchObject({ hasRows: true, hasAgain: true })
  })

  it('AC-1305.5 옮겼으면 띠 범위는 옮긴 첫날부터다', () => {
    const rows = [day('2026-09-30', { ready: READY_ALL })]
    expect(againView(input('7d', rows), 30, [])).toMatchObject({ hasRows: true, hasAgain: true })
    expect(againView(input('7d', rows), 7, [])).toMatchObject({ hasRows: false, hasAgain: false })
  })

  it('AC-1305.5 view.span은 againSpan 그대로다', () => {
    expect(againView(input('7d', []), 14, []).span).toEqual(againSpan(range('7d'), 14))
  })
})

describe('AC-1305.7 againBaseText', () => {
  it('AC-1305.7 옮기지 않음(최근 30일 + 7일): 굵게 {첫날} – {E − w}, 뒤에 아직 셀 수 없는 날', () => {
    const view = againView(input('30d', []), 7, [])
    expect(againBaseText(view, range('30d'), '최근 30일')).toEqual({
      lead: '',
      strong: '10월 6일 – 10월 28일',
      tail: '에 시작한 환자로 셌어요. 시작하고 7일이 안 지난 10월 29일 – 11월 4일은 아직 셀 수 없어요.',
    })
  })

  it('AC-1305.7 옮김(최근 7일 + 30일): 앞에 기간 이름과 까닭, 굵게 옮긴 범위', () => {
    const view = againView(input('7d', []), 30, [])
    expect(againBaseText(view, range('7d'), '최근 7일')).toEqual({
      lead: '최근 7일(10월 29일 – 11월 4일)에 시작한 환자는 아직 30일이 다 지나지 않았어요. 그래서 30일이 다 지난 가장 최근 7일, ',
      strong: '9월 29일 – 10월 5일',
      tail: '에 시작한 환자로 봤어요.',
    })
  })

  it('AC-1305.7 옮김(최근 30일 + 30일): 가장 최근 30일', () => {
    const view = againView(input('30d', []), 30, [])
    expect(againBaseText(view, range('30d'), '최근 30일')).toEqual({
      lead: '최근 30일(10월 6일 – 11월 4일)에 시작한 환자는 아직 30일이 다 지나지 않았어요. 그래서 30일이 다 지난 가장 최근 30일, ',
      strong: '9월 6일 – 10월 5일',
      tail: '에 시작한 환자로 봤어요.',
    })
  })

  it('AC-1305.7 센 범위 안에 셀 수 없는 날이 있으면 뒤에 한 문장이 붙는다', () => {
    const rows = [day('2026-10-07'), day('2026-10-08', { ready: READY_NONE })]
    const view = againView(input('30d', rows), 7, [])
    expect(view.gapDays).toBe(2)
    expect(againBaseText(view, range('30d'), '최근 30일').tail).toBe(
      '에 시작한 환자로 셌어요. 시작하고 7일이 안 지난 10월 29일 – 11월 4일은 아직 셀 수 없어요. 그 안에서도 2일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).',
    )
  })

  it('AC-1305.7 옮겼을 때도 붙는다', () => {
    const view = againView(input('7d', [day('2026-10-16')]), 14, [])
    expect(againBaseText(view, range('7d'), '최근 7일').tail).toBe(
      '에 시작한 환자로 봤어요. 그 안에서도 1일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).',
    )
  })

  it('AC-1305.7 오늘과 해가 다른 날짜는 앞에 {해}년(최근 12개월 → 2025년 12월 1일)', () => {
    const view = againView(input('12m', []), 7, [])
    expect(againBaseText(view, range('12m'), '최근 12개월')).toEqual({
      lead: '',
      strong: '2025년 12월 1일 – 10월 28일',
      tail: '에 시작한 환자로 셌어요. 시작하고 7일이 안 지난 10월 29일 – 11월 4일은 아직 셀 수 없어요.',
    })
  })

  it('AC-1305.7 해가 바뀐 직후 최근 7일 + 30일: 앞 해의 날짜마다 {해}년이 붙는다', () => {
    const today = '2027-01-05'
    const view = againView(input('7d', [], [{ from: '2026-01-01', to: '2027-01-04' }], today), 30, [])
    expect(againBaseText(view, range('7d', today), '최근 7일')).toEqual({
      lead: '최근 7일(2026년 12월 29일 – 1월 4일)에 시작한 환자는 아직 30일이 다 지나지 않았어요. 그래서 30일이 다 지난 가장 최근 7일, ',
      strong: '2026년 11월 29일 – 2026년 12월 5일',
      tail: '에 시작한 환자로 봤어요.',
    })
  })
})

describe('AC-1305.9 소스', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/againView.ts'), 'utf8')
  const importedFrom = (module: string) => {
    const found = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)].filter((m) => m[2] === module)
    return found.flatMap((m) => m[1].split(',').map((name) => name.trim().replace(/^type\s+/, ''))).filter(Boolean)
  }

  it('AC-1305.9 날짜 계산은 dates.ts(addDays·diffDays·compareYmd·eachDay)와 coverage.ts의 isCovered만 쓴다', () => {
    const dates = importedFrom('@/lib/analytics/dates')
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((name) => ['addDays', 'diffDays', 'compareYmd', 'eachDay'].includes(name))).toBe(true)
    expect(importedFrom('@/lib/analytics/coverage').every((name) => name === 'isCovered')).toBe(true)
    // 다른 날짜 모듈(대시보드 view·rxTrend·parts.tsx의 날짜 글자)을 불러오지 않는다
    const modules = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(modules.filter((m) => m.startsWith('@/lib/analytics/')).every((m) => m === '@/lib/analytics/dates' || m === '@/lib/analytics/coverage')).toBe(true)
    expect(modules.some((m) => m.includes('parts') || m.includes('dashboard'))).toBe(false)
  })

  it('AC-1305.9 Date를 직접 만들지 않는다', () => {
    expect(source).not.toMatch(/\bDate\b/)
    expect(source).not.toMatch(/todayInKorea/)
  })
})
