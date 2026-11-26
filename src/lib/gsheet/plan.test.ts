import { describe, expect, it } from 'vitest'
import {
  BUSY_CODES,
  CATCH_UP_MAX_DAYS,
  CATCH_UP_MAX_TRIES,
  catchUpDay,
  inHours,
  nextCheck,
  parseClock,
  planFills,
  type PlanRun,
  type PlanSettings,
} from './plan'
import type { FillJob } from './shapes'

// 수납 넣기 계획(spec google-link REQ-8512 AC-8512.1) — 비트시트 app/src/Core/AutoPlanner.cs와
// app/tests/Tests.cs AutoTests(IntervalWithinHours … DisabledIntervalAndHours)를 옮겼다.
// 비트시트는 상태(AutoState)를 메모리에 들고 다녔고, 웹은 같은 상태를 서버 넣기 기록(gsheet_runs 최근 7일)에서 읽는다:
//   지난 확인 = 오늘 시트에 'auto'·'evening'으로 넣은 마지막 기록(실패면 그 시각 + 간격까지 쉼),
//   저녁 넣기 끝 = 오늘 'evening' 성공 기록, 지난 날 다시 넣기 = CatchUpFromLog + 그날 'past' 실패 기록 수(3번까지).
// 지문(LastHash)은 도우미가 이 PC에 둔다(design.md 9-2) — 계획은 auto: true(지문 따름)·false(무시)만 정한다.
// 시각은 모두 한국 시각이고 오늘은 2026-11-24(화). 기록은 지어낸 숫자뿐이다.

const TODAY = '2026-11-24'
const S: PlanSettings = { autoOn: true, everyMin: 5, from: '08:00', to: '20:00', eveningOn: true, evening: '19:30' }

/** '2026-11-24T08:00' → 그 한국 시각 */
const now = (when: string) => new Date(`${when}:00+09:00`)
/** 넣기 기록 한 줄. day는 넣은 날짜(기본 = 넣은 시각의 날짜) */
function run(via: PlanRun['via'], outcome: PlanRun['outcome'], when: string, over: Partial<PlanRun> = {}): PlanRun {
  return { at: `${when}:00+09:00`, day: when.slice(0, 10), via, outcome, code: null, ...over }
}
const check = (day = TODAY): FillJob => ({ day, mode: 'fillEmpty', via: 'auto', auto: true })
const evening = (day = TODAY): FillJob => ({ day, mode: 'fillEmpty', via: 'evening', auto: false })
const past = (day: string): FillJob => ({ day, mode: 'fillEmpty', via: 'past', auto: false })

describe('AC-8512.1: 켜짐 · 운영 시간 안 · 간격마다 (IntervalWithinHours)', () => {
  const ran = [run('auto', 'ok', '2026-11-24T08:00')]
  it.each<[string, string, PlanRun[], FillJob[]]>([
    ['운영 시간 전', '2026-11-24T07:59', [], []],
    ['운영 시간 첫 확인', '2026-11-24T08:00', [], [check()]],
    ['간격 안', '2026-11-24T08:04', ran, []],
    ['간격 지남', '2026-11-24T08:05', ran, [check()]],
  ])('AC-8512.1: %s (%s)', (_, when, runs, jobs) => {
    expect(planFills(now(when), S, runs)).toEqual(jobs)
  })

  it('AC-8512.1: 다음 확인 시각 — 8:05에 확인했으면 8:10', () => {
    expect(nextCheck(now('2026-11-24T08:06'), S, [run('auto', 'ok', '2026-11-24T08:05')])).toEqual(now('2026-11-24T08:10'))
  })
})

describe('AC-8512.1: 저녁 마지막 넣기 한 번(지문 무시) · 실패면 간격 뒤 다시 (EveningOnceAndRetryAfterFailure)', () => {
  const r1 = [run('auto', 'ok', '2026-11-24T19:28')]
  const r2 = [...r1, run('evening', 'fail', '2026-11-24T19:30', { code: 'E-GSHEET-NET' })]
  const r3 = [...r2, run('evening', 'ok', '2026-11-24T19:35')]
  const r4 = [...r3, run('auto', 'same', '2026-11-24T19:40')]
  it.each<[string, string, PlanRun[], FillJob[]]>([
    ['저녁 시각이 되면 저녁 마지막 넣기', '2026-11-24T19:30', r1, [evening()]],
    ['저녁 넣기 실패 뒤 간격 안은 쉼', '2026-11-24T19:33', r2, []],
    ['간격이 지나면 저녁 넣기 다시', '2026-11-24T19:35', r2, [evening()]],
    ['저녁 넣기 뒤에도 20:00까지 간격 확인', '2026-11-24T19:40', r3, [check()]],
    ['20:00 뒤 · 저녁 넣기 끝 → 할 일 없음', '2026-11-24T20:30', r4, []],
  ])('AC-8512.1: %s (%s)', (_, when, runs, jobs) => {
    expect(planFills(now(when), S, runs)).toEqual(jobs)
  })

  it('AC-8512.1: 저녁 넣기가 확인 필요(warn)로 끝나도 끝난 것이다', () => {
    expect(planFills(now('2026-11-24T19:45'), S, [run('evening', 'warn', '2026-11-24T19:30')])).toEqual([check()])
  })

  it('AC-8512.1: 손 넣기는 저절로 넣기 상태(간격·저녁)를 바꾸지 않는다', () => {
    const hand = [run('hand', 'ok', '2026-11-24T19:31'), run('hand', 'ok', '2026-11-24T08:00')]
    expect(planFills(now('2026-11-24T19:32'), S, hand)).toEqual([evening()])
    expect(planFills(now('2026-11-24T08:01'), S, hand)).toEqual([check()])
  })
})

describe('AC-8512.1: 날이 바뀌면 (DateChangeClearsHash)', () => {
  it('AC-8512.1: 어제 기록은 오늘 간격 확인·저녁 넣기를 막지 않는다', () => {
    const runs = [run('auto', 'ok', '2026-11-24T10:00'), run('evening', 'ok', '2026-11-24T19:30')]
    expect(planFills(now('2026-11-25T10:00'), S, runs)).toEqual([check('2026-11-25')])
    expect(planFills(now('2026-11-25T19:30'), S, runs)).toEqual([evening('2026-11-25')])
  })
})

describe('AC-8512.1: 다음에 웹앱을 열 때 저녁을 못 한 날 한 번 (CatchUpAfterDateChangeWhenEveningMissed)', () => {
  const ran = [run('auto', 'ok', '2026-11-24T10:00')]

  it('AC-8512.1: 저녁 넣기 없이 날이 바뀜 → 어제를 빈 칸만 채우기로 먼저, 그다음 오늘 확인', () => {
    expect(planFills(now('2026-11-25T08:00'), S, ran)).toEqual([past(TODAY), check('2026-11-25')])
    const caught = [...ran, run('past', 'ok', '2026-11-25T08:00', { day: TODAY })]
    expect(planFills(now('2026-11-25T08:00'), S, caught)).toEqual([check('2026-11-25')])
  })

  it('AC-8512.1: 저녁 넣기가 됐으면 다시 넣지 않는다', () => {
    expect(planFills(now('2026-11-25T08:00'), S, [run('evening', 'ok', '2026-11-24T19:30')])).toEqual([check('2026-11-25')])
  })

  it('AC-8512.1: 저녁 넣기를 꺼 두었으면 다시 넣지 않는다', () => {
    expect(planFills(now('2026-11-25T08:00'), { ...S, eveningOn: false }, ran)).toEqual([check('2026-11-25')])
  })

  it('AC-8512.1: 지난 날 다시 넣기는 운영 시간 밖에서도 한다(비트시트 Decide 차례 그대로)', () => {
    expect(planFills(now('2026-11-25T07:00'), S, ran)).toEqual([past(TODAY)])
  })
})

describe('AC-8512.1: 지난 날 다시 넣기 실패면 3번까지, 오늘 넣기는 막지 않음 (CatchUpRetriesWithoutBlockingTodayAndGivesUp)', () => {
  const D = '2026-11-23'
  const base = [run('auto', 'ok', '2026-11-23T12:00')]
  const f1 = [...base, run('past', 'fail', '2026-11-24T08:00', { day: D, code: 'E-GSHEET-NET' })]
  const f1ok = [...f1, run('auto', 'ok', '2026-11-24T08:01')]
  const f3 = [
    ...f1ok,
    run('past', 'fail', '2026-11-24T08:05', { day: D, code: 'E-GSHEET-NET' }),
    run('past', 'fail', '2026-11-24T08:10', { day: D, code: 'E-GSHEET-NET' }),
  ]
  it.each<[string, string, PlanRun[], FillJob[]]>([
    ['처음 열 때 지난 날 먼저', '2026-11-24T08:00', base, [past(D), check()]],
    ['지난 날 실패는 오늘 간격 확인을 막지 않음', '2026-11-24T08:01', f1, [check()]],
    ['지난 날 다시 넣기는 간격 뒤 다시', '2026-11-24T08:05', f1ok, [past(D)]],
    ['3번 실패하면 그만, 오늘 확인은 그대로', '2026-11-24T08:15', f3, [check()]],
  ])('AC-8512.1: %s (%s)', (_, when, runs, jobs) => {
    expect(planFills(now(when), S, runs)).toEqual(jobs)
  })

  it('AC-8512.1: 몇 번·며칠은 비트시트 그대로(3번 · 7일)', () => {
    expect(CATCH_UP_MAX_TRIES).toBe(3)
    expect(CATCH_UP_MAX_DAYS).toBe(7)
  })
})

describe('AC-8512.1: 기록에서 다시 넣을 날 찾기 (CatchUpFromLogFindsLastTrayDayWithoutEvening)', () => {
  const E = (day: string, via: PlanRun['via'], outcome: PlanRun['outcome'], h = 12) =>
    run(via, outcome, `${day}T${String(h).padStart(2, '0')}:00`)
  const log = [E('2026-11-20', 'auto', 'ok'), E('2026-11-20', 'evening', 'ok', 19), E('2026-11-21', 'auto', 'ok'), E('2026-11-21', 'auto', 'same')]
  const late = [E('2026-11-23', 'auto', 'fail'), E('2026-11-23', 'hand', 'ok', 20)]
  const early = [E('2026-11-23', 'auto', 'ok'), E('2026-11-23', 'hand', 'ok', 15), E('2026-11-23', 'evening', 'fail', 19)]
  it.each<[string, PlanRun[], PlanSettings, string | null]>([
    ['토요일(21일) 낮까지만 돌고 저녁 없음, 일요일은 안 켬 → 21일', log, S, '2026-11-21'],
    ['이미 다시 넣음', [...log, E('2026-11-21', 'past', 'ok', 9)], S, null],
    ['저녁 시각 뒤 손 넣기는 저녁 넣기로 셈', late, S, null],
    ['저녁 넣기 실패', early, S, '2026-11-23'],
    ['오늘이나 너무 오래된 날뿐', [E(TODAY, 'auto', 'ok'), E('2026-11-10', 'auto', 'ok')], S, null],
    ['저녁 넣기 꺼짐', early, { ...S, eveningOn: false }, null],
    ['확인 필요(warn)로 끝난 저녁 넣기도 셈', [E('2026-11-23', 'auto', 'ok'), E('2026-11-23', 'evening', 'warn', 19)], S, null],
    ['다음 날 그날을 손으로 넣어도 셈', [E('2026-11-23', 'auto', 'ok'), run('hand', 'ok', '2026-11-24T09:00', { day: '2026-11-23' })], S, null],
    ['7일 전까지', [E('2026-11-17', 'auto', 'ok')], S, '2026-11-17'],
    ['8일 전은 안 함', [E('2026-11-16', 'auto', 'ok')], S, null],
  ])('AC-8512.1: %s', (_, runs, settings, day) => {
    expect(catchUpDay(TODAY, settings, runs)).toBe(day)
  })
})

describe('AC-8512.1: 꺼짐 · 운영 시간 (DisabledIntervalAndHours)', () => {
  it('AC-8512.1: 모두 꺼짐 → 할 일 없음', () => {
    expect(planFills(now('2026-11-24T12:00'), { ...S, autoOn: false, eveningOn: false }, [])).toEqual([])
  })

  it('AC-8512.1: 밤을 넘는 운영 시간', () => {
    expect(inHours(23 * 60, { from: '22:00', to: '06:00' })).toBe(true)
    expect(inHours(12 * 60, { from: '22:00', to: '06:00' })).toBe(false)
    expect(planFills(now('2026-11-24T23:00'), { ...S, from: '22:00', to: '06:00', eveningOn: false }, [])).toEqual([check()])
  })

  it('AC-8512.1: 저절로 넣기 [켜기]를 끄면 저녁 넣기·지난 날 다시 넣기도 하지 않는다(웹 설정은 켜기 하나가 저절로 넣기 전체)', () => {
    const off = { ...S, autoOn: false }
    expect(planFills(now('2026-11-24T19:30'), off, [])).toEqual([])
    expect(planFills(now('2026-11-25T08:00'), off, [run('auto', 'ok', '2026-11-24T10:00')])).toEqual([])
    expect(nextCheck(now('2026-11-24T08:00'), off, [])).toBeNull()
  })
})

describe('AC-8512.1: 다른 넣기가 돌고 있으면 실패로 안 침', () => {
  const busy = { code: 'E-BRIDGE-BUSY' }

  it('AC-8512.1: 통로가 바빠 못 한 기록은 간격을 기다리게 하지 않는다', () => {
    expect(BUSY_CODES).toContain('E-BRIDGE-BUSY')
    expect(planFills(now('2026-11-24T08:01'), S, [run('auto', 'fail', '2026-11-24T08:00', busy)])).toEqual([check()])
    expect(planFills(now('2026-11-24T19:31'), S, [run('evening', 'fail', '2026-11-24T19:30', busy)])).toEqual([evening()])
  })

  it('AC-8512.1: 지난 날 다시 넣기 3번에 세지 않는다', () => {
    const D = '2026-11-23'
    const tries = [
      run('auto', 'ok', '2026-11-23T12:00'),
      run('past', 'fail', '2026-11-24T08:00', { day: D, ...busy }),
      run('past', 'fail', '2026-11-24T08:01', { day: D, ...busy }),
      run('past', 'fail', '2026-11-24T08:02', { day: D, ...busy }),
    ]
    expect(planFills(now('2026-11-24T08:03'), S, tries)).toEqual([past(D), check()])
  })

  it('AC-8512.1: 구글이 바빠 못 넣은 것(E-GSHEET-BUSY)은 비트시트처럼 실패로 친다', () => {
    expect(planFills(now('2026-11-24T08:01'), S, [run('auto', 'fail', '2026-11-24T08:00', { code: 'E-GSHEET-BUSY' })])).toEqual([])
  })
})

describe('AC-8512.1: 설정 값 읽기 (비트시트 Interval · Clock.Parse 기본값)', () => {
  it('AC-8512.1: 간격은 몇 분마다(1분보다 짧으면 1분)', () => {
    const ran = [run('auto', 'ok', '2026-11-24T08:00')]
    expect(planFills(now('2026-11-24T08:09'), { ...S, everyMin: 10 }, ran)).toEqual([])
    expect(planFills(now('2026-11-24T08:10'), { ...S, everyMin: 10 }, ran)).toEqual([check()])
    expect(planFills(now('2026-11-24T08:01'), { ...S, everyMin: 0 }, ran)).toEqual([check()])
  })

  it('AC-8512.1: 읽지 못하는 시각은 08:00 · 20:00 · 19:30', () => {
    const broken = { ...S, from: '8시', to: '', evening: '19:60' }
    expect(planFills(now('2026-11-24T07:59'), broken, [])).toEqual([])
    expect(planFills(now('2026-11-24T08:00'), broken, [])).toEqual([check()])
    expect(planFills(now('2026-11-24T19:29'), broken, [run('auto', 'ok', '2026-11-24T19:28')])).toEqual([])
    expect(planFills(now('2026-11-24T19:30'), broken, [run('auto', 'ok', '2026-11-24T19:28')])).toEqual([evening()])
  })

  it.each<[string, number | null]>([
    ['08:00', 480],
    [' 19:30 ', 1170],
    ['8:5', 485],
    ['24:00', 1440],
    ['24:01', null],
    ['12:60', null],
    ['0800', null],
    ['8시', null],
    ['', null],
  ])('AC-8512.1: 시각 %j → %j분', (text, minute) => {
    expect(parseClock(text)).toBe(minute)
  })
})

describe('AC-8512.1: 한국 날짜·시각', () => {
  it('AC-8512.1: PC 시간대와 상관없이 한국 날짜로 오늘을 정한다', () => {
    // 2026-11-24 23:30 UTC = 한국 11월 25일 08:30
    expect(planFills(new Date('2026-11-24T23:30:00Z'), S, [])).toEqual([check('2026-11-25')])
  })

  it('AC-8512.1: 서버 시각 글자(마이크로초·UTC)도 읽고, 읽지 못하는 기록은 버린다', () => {
    const fromDb: PlanRun = { at: '2026-11-24T23:00:00.123456+00:00', day: '2026-11-25', via: 'auto', outcome: 'ok', code: null }
    expect(planFills(now('2026-11-25T08:04'), S, [fromDb])).toEqual([])
    const broken: PlanRun = { at: '언제', day: '2026-11-25', via: 'auto', outcome: 'ok', code: null }
    expect(planFills(now('2026-11-25T08:04'), S, [broken])).toEqual([check('2026-11-25')])
  })

  it('AC-8512.1: 다음 확인이 운영 시간 밖이면 다음 운영 시작', () => {
    expect(nextCheck(now('2026-11-24T19:59'), S, [run('auto', 'ok', '2026-11-24T19:58')])).toEqual(now('2026-11-25T08:00'))
    expect(nextCheck(now('2026-11-24T07:00'), S, [])).toEqual(now('2026-11-24T08:00'))
    expect(nextCheck(now('2026-11-24T09:00'), S, [run('auto', 'ok', '2026-11-24T08:00')])).toEqual(now('2026-11-24T09:00'))
  })
})
