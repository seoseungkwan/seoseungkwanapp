import { describe, expect, it } from 'vitest'
import type { CalCountRow } from '@/types/calendar'
import type { DayPayload } from '@/types/payload'
import { buildAlerts, type Alert } from './alerts'

// 평소와 다른 것 (stats-insights REQ-6101 AC-6101.1~AC-6101.4). 숫자·이름은 모두 지어낸 값이다.
// 오늘 2026-11-18(수) → 이번 주 = 11-16(월) ~ 11-17(화). 앞선 4주의 같은 요일 = 월 11-09·11-02·10-26·10-19, 화 11-10·11-03·10-27·10-20

const TODAY = '2026-11-18'
const RANGE = '11/16~11/17'
// [이번 주, 1주 전, 2주 전, 3주 전, 4주 전]
const MON = ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19']
const TUE = ['2026-11-17', '2026-11-10', '2026-11-03', '2026-10-27', '2026-10-20']
const DOSU = 't0000000000000001'
const SHOCK = 't0000000000000002'

type Fields = { patients?: number; newPatients?: number; groups?: Record<string, number>; partial?: boolean }

function day(ymd: string, { patients = 0, newPatients = 0, groups = {}, partial = false }: Fields = {}): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
    rx: [],
    groups: Object.entries(groups).map(([id, n]) => ({ id, patients: n, newPatients: 0, returning: n })),
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

// 날마다 같은 칸 하나만 다른 줄. null = 그날 줄 없음
function series(dates: readonly string[], values: readonly (number | null)[], fields: (n: number) => Fields = (n) => ({ patients: n })): DayPayload[] {
  return dates.flatMap((ymd, i) => {
    const n = values[i]
    return n === null || n === undefined ? [] : [day(ymd, fields(n))]
  })
}
const visits = (dates: readonly string[], values: readonly (number | null)[]) => series(dates, values)

function appt(ymd: string, status: CalCountRow['status'], { kindId = 'dosu', kindName = '도수', auto = null }: { kindId?: string; kindName?: string; auto?: CalCountRow['auto'] } = {}): CalCountRow {
  return { day: ymd, staffId: 's1', staffName: '김○○', kindId, kindName, status, auto, origDay: null }
}
// n줄(앞 noshow줄은 안 옴, 나머지는 왔음)을 날짜들에 돌려 가며 놓는다
function appts(dates: readonly string[], n: number, noshow: number, extra: { kindId?: string; kindName?: string } = {}): CalCountRow[] {
  return Array.from({ length: n }, (_, i) => appt(dates[i % dates.length]!, i < noshow ? 'noshow' : 'came', extra))
}
const THIS_WEEK = [MON[0]!, TUE[0]!]
const PREV_WEEKS = [...MON.slice(1), ...TUE.slice(1)]

const texts = (alerts: Alert[] | null) => alerts?.map((alert) => alert.text) ?? null

describe('AC-6101.1 이번 주와 앞선 4주의 같은 요일', () => {
  it('AC-6101.1: 이번 주 = 어제가 든 주의 월요일 ~ 어제. 이번 주 값은 그 날들의 합, 평소 값은 요일마다 앞선 4주 저장된 날 평균의 합이다', () => {
    // 월: 이번 60, 평소 (100 + 100 + 120) ÷ 3 = 106.67 / 화: 이번 50, 평소 80 → 110 vs 186.67 → 41% 적음. 오늘(수) 줄은 세지 않는다
    const days = [...visits(MON, [60, 100, 100, 120, null]), ...visits(TUE, [50, 80, 80, 80, 80]), day(TODAY, { patients: 999 })]
    expect(buildAlerts({ today: TODAY, days })).toEqual([
      { kind: 'down', name: '내원', text: '내원 · 이번 주 110명, 지난 4주 평균 187명보다 41% 적어요', range: RANGE },
    ])
  })

  it('AC-6101.1: 오늘이 월요일이면 이번 주는 지난 월요일 ~ 어제(일요일)의 한 주다', () => {
    const days = [...visits(MON, [60, 100, 100, 120, null]), ...visits(TUE, [50, 80, 80, 80, 80])]
    expect(buildAlerts({ today: '2026-11-23', days })).toEqual([
      { kind: 'down', name: '내원', text: '내원 · 이번 주 110명, 지난 4주 평균 187명보다 41% 적어요', range: '11/16~11/22' },
    ])
  })

  it('AC-6101.1: 앞선 4주에 저장된 날이 2일보다 적은 요일은 이번 주 쪽에서도 뺀다', () => {
    // 월은 앞선 4주에 하루뿐이라 빠진다: 화 50 vs 80만 → 38% 적음(월을 넣으면 60 vs 180 → 67%)
    const days = [...visits(MON, [10, 100, null, null, null]), ...visits(TUE, [50, 80, 80, 80, 80])]
    expect(texts(buildAlerts({ today: TODAY, days }))).toEqual(['내원 · 이번 주 50명, 지난 4주 평균 80명보다 38% 적어요'])
  })

  it('AC-6101.1: 이번 주에 저장되지 않은 날(줄 없음)은 0이 아니라 견주지 않는 날이다', () => {
    // 이번 주 월요일 줄이 없다: 화만 견준다(0으로 넣으면 50 vs 180 → 72%)
    const days = [...visits(MON, [null, 100, 100, 100, 100]), ...visits(TUE, [50, 80, 80, 80, 80])]
    expect(texts(buildAlerts({ today: TODAY, days }))).toEqual(['내원 · 이번 주 50명, 지난 4주 평균 80명보다 38% 적어요'])
  })

  it('AC-6101.1: 덜 끝난(partial) 줄은 저장된 날로 보지 않는다 — 이번 주에서도 앞선 4주에서도', () => {
    // 화(이번 주)는 덜 끝나 빠지고, 월의 4주 전 덜 끝난 10은 평균에 들지 않는다: 월 60 vs 100 → 40%
    const days = [
      ...visits(MON, [60, 100, 100, 100, null]),
      day(MON[4]!, { patients: 10, partial: true }),
      day(TUE[0]!, { patients: 5, partial: true }),
      ...visits(TUE.slice(1), [80, 80, 80, 80]),
    ]
    expect(texts(buildAlerts({ today: TODAY, days }))).toEqual(['내원 · 이번 주 60명, 지난 4주 평균 100명보다 40% 적어요'])
  })

  it('AC-6101.1: 5주 전 같은 요일은 쓰지 않는다', () => {
    const days = [...visits(MON, [60, 100, 100, null, null]), day('2026-10-12', { patients: 1000 })]
    expect(texts(buildAlerts({ today: TODAY, days }))).toEqual(['내원 · 이번 주 60명, 지난 4주 평균 100명보다 40% 적어요'])
  })

  it('AC-6101.1: 같은 날 줄이 둘이면 뒤의 것을 쓴다', () => {
    const days = [...visits(MON, [100, 100, 100, 100, 100]), day(MON[0]!, { patients: 60 })]
    expect(texts(buildAlerts({ today: TODAY, days }))).toEqual(['내원 · 이번 주 60명, 지난 4주 평균 100명보다 40% 적어요'])
  })
})

describe('AC-6101.2 수 지표 알림 (내원·신환 명, 묶음 건)', () => {
  it('AC-6101.2: 많으면 kind up · "많아요"', () => {
    expect(buildAlerts({ today: TODAY, days: visits(MON, [130, 100, 100, 100, 100]) })).toEqual([
      { kind: 'up', name: '내원', text: '내원 · 이번 주 130명, 지난 4주 평균 100명보다 30% 많아요', range: RANGE },
    ])
  })

  it('AC-6101.2: 달라진 비율(반올림 정수 %)이 15 이상일 때만 — 15%는 알리고 14%는 알리지 않는다', () => {
    expect(texts(buildAlerts({ today: TODAY, days: visits(MON, [85, 100, 100, 100, 100]) }))).toEqual(['내원 · 이번 주 85명, 지난 4주 평균 100명보다 15% 적어요'])
    expect(buildAlerts({ today: TODAY, days: visits(MON, [86, 100, 100, 100, 100]) })).toEqual([])
    // 14.5% → 15(반올림)
    expect(texts(buildAlerts({ today: TODAY, days: visits(MON, [171, 200, 200, 200, 200]) }))).toEqual(['내원 · 이번 주 171명, 지난 4주 평균 200명보다 15% 적어요'])
  })

  it('AC-6101.2: 평소 값이 10보다 작으면 비율이 커도 알리지 않고, 10이면 알린다(신환)', () => {
    const small = series(MON, [2, 8, 8, 8, 8], (n) => ({ patients: 100, newPatients: n }))
    expect(buildAlerts({ today: TODAY, days: small })).toEqual([])
    const ten = series(MON, [5, 10, 10, 10, 10], (n) => ({ patients: 100, newPatients: n }))
    expect(buildAlerts({ today: TODAY, days: ten })).toEqual([
      { kind: 'down', name: '신환', text: '신환 · 이번 주 5명, 지난 4주 평균 10명보다 50% 적어요', range: RANGE },
    ])
  })

  it('AC-6101.2: 묶음은 그 이름·단위 "건"이고 값은 그날 그 묶음 줄의 건수다', () => {
    const days = series(MON, [20, 10, 10, 10, 10], (n) => ({ patients: 100, groups: { [DOSU]: n, [SHOCK]: 10 } }))
    expect(buildAlerts({ today: TODAY, days, groups: [{ id: DOSU, name: '도수' }, { id: SHOCK, name: '충격파' }] })).toEqual([
      { kind: 'up', name: '도수', text: '도수 · 이번 주 20건, 지난 4주 평균 10건보다 100% 많아요', range: RANGE },
    ])
  })

  it('AC-6101.2: 그 묶음 줄이 없는 날(그 묶음으로 세지 않은 날)은 그 묶음에서는 저장되지 않은 날이다', () => {
    // 앞선 4주 가운데 1주 전에만 도수 줄이 있다 → 2일보다 적어 견주지 않는다
    const days = [
      day(MON[0]!, { patients: 100, groups: { [DOSU]: 40 } }),
      day(MON[1]!, { patients: 100, groups: { [DOSU]: 10 } }),
      ...visits(MON.slice(2), [100, 100, 100]),
    ]
    expect(buildAlerts({ today: TODAY, days, groups: [{ id: DOSU, name: '도수' }] })).toEqual([])
    // 0건 줄은 센 날이다
    const zero = [day(MON[0]!, { patients: 100, groups: { [DOSU]: 20 } }), ...series(MON.slice(1), [0, 0, 0, 0], (n) => ({ patients: 100, groups: { [DOSU]: n } }))]
    expect(buildAlerts({ today: TODAY, days: zero, groups: [{ id: DOSU, name: '도수' }] })).toEqual([])
  })

  it('AC-6101.2: n·m은 반올림 정수이고 천 단위 쉼표를 붙인다', () => {
    // 평소 (1000 + 1000 + 1001) ÷ 3 = 1000.33 → 1,000. 1234 ÷ 1000.33 − 1 = 23.36% → 23
    expect(texts(buildAlerts({ today: TODAY, days: visits(MON, [1234, 1000, 1000, 1001, null]) }))).toEqual([
      '내원 · 이번 주 1,234명, 지난 4주 평균 1,000명보다 23% 많아요',
    ])
  })
})

describe('AC-6101.3 예약 안 옴 알림', () => {
  const FLAT = [...visits(MON, [100, 100, 100, 100, 100]), ...visits(TUE, [100, 100, 100, 100, 100])]

  it('AC-6101.3: 종류마다 이번 주 안 옴 비율이 앞선 4주보다 3%p 이상 높으면 kind warn 한 줄', () => {
    // 이번 주 10건 중 2건 = 20%, 앞선 4주 20건 중 2건 = 10%
    const cal = [...appts(THIS_WEEK, 10, 2), ...appts(PREV_WEEKS, 20, 2)]
    expect(buildAlerts({ today: TODAY, days: FLAT, cal })).toEqual([
      { kind: 'warn', name: '도수 예약 안 옴', text: '도수 예약 안 옴 · 이번 주 20%, 지난 4주 평균 10%보다 높아요', range: RANGE },
    ])
  })

  it('AC-6101.3: 비율 = 안 옴 ÷ 예약 수(취소 포함), 반올림 정수 % — 3%p는 알리고 2%p는 알리지 않는다', () => {
    const thisWeek = appts(THIS_WEEK, 10, 2) // 20%
    // 앞선 4주 23건 중 4건 = 17.4% → 17 → 3%p
    expect(texts(buildAlerts({ today: TODAY, days: FLAT, cal: [...thisWeek, ...appts(PREV_WEEKS, 23, 4)] }))).toEqual([
      '도수 예약 안 옴 · 이번 주 20%, 지난 4주 평균 17%보다 높아요',
    ])
    // 22건 중 4건 = 18.2% → 18 → 2%p
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: [...thisWeek, ...appts(PREV_WEEKS, 22, 4)] })).toEqual([])
    // 취소는 예약 수에 들고 안 옴이 아니다: 이번 주 2건 안 옴 + 2건 취소 + 6건 왔음 = 10건 중 20%
    const withCancel = [...appts(THIS_WEEK, 8, 2), appt(MON[0]!, 'cancel'), appt(TUE[0]!, 'cancel')]
    expect(texts(buildAlerts({ today: TODAY, days: FLAT, cal: [...withCancel, ...appts(PREV_WEEKS, 20, 2)] }))).toEqual([
      '도수 예약 안 옴 · 이번 주 20%, 지난 4주 평균 10%보다 높아요',
    ])
  })

  it('AC-6101.3: 안 옴은 보이는 상태로 센다 — auto면 도착 칸(noshow), 손으로 고른 상태가 먼저', () => {
    const thisWeek = [
      appt(MON[0]!, 'auto', { auto: 'noshow' }),
      appt(TUE[0]!, 'auto', { auto: 'noshow' }),
      appt(MON[0]!, 'came', { auto: 'noshow' }), // 손으로 왔음
      ...appts(THIS_WEEK, 7, 0),
    ]
    expect(texts(buildAlerts({ today: TODAY, days: FLAT, cal: [...thisWeek, ...appts(PREV_WEEKS, 20, 2)] }))).toEqual([
      '도수 예약 안 옴 · 이번 주 20%, 지난 4주 평균 10%보다 높아요',
    ])
  })

  it('AC-6101.3: 이번 주 예약이 10보다 적거나 앞선 4주 예약이 20보다 적으면 알리지 않는다', () => {
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: [...appts(THIS_WEEK, 9, 5), ...appts(PREV_WEEKS, 20, 0)] })).toEqual([])
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: [...appts(THIS_WEEK, 10, 5), ...appts(PREV_WEEKS, 19, 0)] })).toEqual([])
  })

  it('AC-6101.3: 낮아진 것은 알리지 않는다', () => {
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: [...appts(THIS_WEEK, 10, 0), ...appts(PREV_WEEKS, 20, 10)] })).toEqual([])
  })

  it('AC-6101.3: 앞선 4주도 이번 주 날들과 같은 요일만 센다(이번 주에 없는 수요일 예약은 빼서 20건이 안 된다)', () => {
    const wednesdays = appts(['2026-11-11', '2026-11-04'], 10, 0)
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: [...appts(THIS_WEEK, 10, 5), ...appts(PREV_WEEKS, 10, 0), ...wednesdays] })).toEqual([])
  })

  it('AC-6101.3: 종류마다 따로 센다(이름은 그 종류의 가장 늦은 줄 이름)', () => {
    const shock = { kindId: 'shock', kindName: '충격파' }
    const cal = [
      ...appts(THIS_WEEK, 10, 3, shock), // 30%
      ...appts(PREV_WEEKS, 20, 2, { kindId: 'shock', kindName: '충격파(옛 이름)' }), // 10%
      ...appts(THIS_WEEK, 10, 0), // 도수 0%
      ...appts(PREV_WEEKS, 20, 0),
    ]
    expect(texts(buildAlerts({ today: TODAY, days: FLAT, cal }))).toEqual(['충격파 예약 안 옴 · 이번 주 30%, 지난 4주 평균 10%보다 높아요'])
  })

  it('AC-6101.3: 예약 줄이 없으면(null) 예약 알림은 없다', () => {
    expect(buildAlerts({ today: TODAY, days: FLAT, cal: null })).toEqual([])
  })
})

describe('AC-6101.4 차례 · 5줄 · 기간', () => {
  it('AC-6101.4: warn이 먼저, 그다음 달라진 비율이 큰 차례다', () => {
    // 내원 20% 적음 · 신환 50% 많음 · 도수 30% 많음 · 도수 예약 안 옴
    const days = series(MON, [80, 100, 100, 100, 100], (n) => ({ patients: n, newPatients: n === 80 ? 30 : 20, groups: { [DOSU]: n === 80 ? 26 : 20 } }))
    const cal = [...appts(THIS_WEEK, 10, 2), ...appts(PREV_WEEKS, 20, 2)]
    const alerts = buildAlerts({ today: TODAY, days, groups: [{ id: DOSU, name: '도수' }], cal })
    expect(alerts?.map((alert) => [alert.kind, alert.name])).toEqual([
      ['warn', '도수 예약 안 옴'],
      ['up', '신환'],
      ['up', '도수'],
      ['down', '내원'],
    ])
  })

  it('AC-6101.4: warn끼리는 높아진 %p가 큰 차례다', () => {
    const shock = { kindId: 'shock', kindName: '충격파' }
    const cal = [...appts(THIS_WEEK, 10, 2), ...appts(PREV_WEEKS, 20, 2), ...appts(THIS_WEEK, 10, 5, shock), ...appts(PREV_WEEKS, 20, 2, shock)]
    expect(buildAlerts({ today: TODAY, days: [], cal })?.map((alert) => alert.name)).toEqual(['충격파 예약 안 옴', '도수 예약 안 옴'])
  })

  it('AC-6101.4: 5줄까지만 남긴다(비율이 큰 다섯)', () => {
    const ids = ['t0000000000000011', 't0000000000000012', 't0000000000000013', 't0000000000000014', 't0000000000000015', 't0000000000000016', 't0000000000000017']
    // 묶음 i: 이번 주 10 + 2·(i + 1)·… 평소 10 → 20%, 40%, … 140%
    const days = MON.map((ymd, w) => day(ymd, { patients: 100, groups: Object.fromEntries(ids.map((id, i) => [id, w === 0 ? 10 + 2 * (i + 1) : 10])) }))
    const groups = ids.map((id, i) => ({ id, name: `묶음${i + 1}` }))
    expect(buildAlerts({ today: TODAY, days, groups })?.map((alert) => alert.name)).toEqual(['묶음7', '묶음6', '묶음5', '묶음4', '묶음3'])
  })

  it('AC-6101.4: 줄마다 기간 {M/D}~{M/D}(이번 주 첫날 ~ 어제)가 붙는다 — 해가 바뀌는 주도 같은 꼴', () => {
    // 오늘 2027-01-02(토) → 이번 주 2026-12-28(월) ~ 2027-01-01(금)
    const days = visits(['2026-12-28', '2026-12-21', '2026-12-14', '2026-12-07', '2026-11-30'], [50, 100, 100, 100, 100])
    expect(buildAlerts({ today: '2027-01-02', days })?.map((alert) => alert.range)).toEqual(['12/28~1/1'])
  })
})

describe('AC-6101.5 견줄 날', () => {
  it('AC-6101.5: 견줄 날이 하루도 없으면 null, 견줄 날이 있으나 알림이 없으면 빈 목록이다', () => {
    expect(buildAlerts({ today: TODAY, days: [] })).toBeNull()
    expect(buildAlerts({ today: TODAY, days: [day(TODAY, { patients: 100 }), ...visits(MON.slice(1), [100, 100, 100, 100])] })).toBeNull()
    expect(buildAlerts({ today: TODAY, days: visits(MON, [100, 100, 100, 100, 100]) })).toEqual([])
  })

  it('AC-6101.5: 견줄 저장된 날이 없어도 예약 알림이 있으면 그 줄을 낸다', () => {
    const cal = [...appts(THIS_WEEK, 10, 2), ...appts(PREV_WEEKS, 20, 2)]
    expect(buildAlerts({ today: TODAY, days: [], cal })?.map((alert) => alert.kind)).toEqual(['warn'])
  })
})
