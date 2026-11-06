import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatDelta } from '@/components/charts/format'
import { addDays, addMonths, eachDay, weekdayOf } from '@/lib/analytics/dates'
import { validateDayPayload } from '@/lib/payload/validate'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { rateText } from './rxPickView'
import {
  GROUP_KEY,
  groupDefs,
  groupInput,
  groupKey,
  keyedIn,
  rowKey,
  staleNames,
  treatmentDetail,
  treatmentRows,
  uncomparedNames,
  type TreatmentRow,
} from './treatmentView'
import { rangeOf, rxDetail, rxList, rxPickRows, statsRange, type RxDetailPoint, type RxTrendRow, type StatsInput, type StatsPeriod } from './view'
import { compareNumbers } from '@/lib/analytics/compare'
import type { StatsPick } from './periodPick'

// 처방별 추세 화면 숫자 (treatment-trend REQ-1205~1209, design.md '다시 불러오기 판단'·'화면 숫자').
// 입력은 가짜 일 줄·덮은 기간·묶음뿐이다(모두 지어낸 값). 묶음 줄(groups)의 id는 groupKey(codes)다

type Rx = DayPayload['rx'][number]
type Line = DayPayload['groups'][number]

const rx = (code: string, patients: number, newPatients = 0): Rx => ({ code, name: `처방 ${code}`, type: '처치', patients, newPatients, returning: patients - newPatients })
// 묶음 줄. returning을 따로 주면 구분 없음이 생긴다(신환 + 재진 < 건수)
const line = (id: string, patients: number, newPatients = 0, returning = patients - newPatients): Line => ({ id, patients, newPatients, returning })

type DayOptions = { partial?: boolean; rx?: Rx[]; groups?: Line[] }
function day(ymd: string, o: DayOptions = {}): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: o.rx ?? [],
    groups: [...(o.groups ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), // 저장 모양처럼 id 순
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}
const daysFrom = (from: string, to: string, o: DayOptions | ((ymd: string) => DayOptions) = {}) =>
  eachDay({ from, to }).map((ymd) => day(ymd, typeof o === 'function' ? o(ymd) : o))
const monthsFrom = (first: string, count: number) => Array.from({ length: count }, (_, i) => addMonths(first, i))

const group = (name: string, codes: string[], sortOrder: number, id: string | null = `g${sortOrder}`): RxGroup => ({ id, name, codes, sortOrder })
const input = (today: string, period: StatsPeriod, days: DayPayload[], covered: DateRange[]): StatsInput => ({ days, covered, range: statsRange(today, period) })

function ready(row: TreatmentRow): Extract<TreatmentRow, { kind: 'ready' }> {
  if (row.kind !== 'ready') throw new Error(`준비된 줄이 아니다: ${row.kind}`)
  return row
}
// 처방 추세와 견주는 숫자 칸(코드·이름은 묶음 쪽이 열쇠·묶음 이름이라 뺀다)
const counted = ({ count, newCount, returningCount, partial, comparable, delta }: RxTrendRow) => ({ count, newCount, returningCount, partial, comparable, delta })

const today = '2026-11-13'
// '7d': 이번 기간 11월 6일 ~ 12일, 비교 기간 10월 30일 ~ 11월 5일
const THIS_WEEK = { from: '2026-11-06', to: '2026-11-12' }
const LAST_WEEK = { from: '2026-10-30', to: '2026-11-05' }
const bothWeeks = [{ from: LAST_WEEK.from, to: THIS_WEEK.to }]

const ESWT = ['ESWT1', 'ESWT7']
const ESWT_KEY = 't2538e307d10103cb' // AC-1206.1 고정 값
const OLD_KEY = 't' + 'f'.repeat(16) // 옛 처방 모음으로 센 줄의 열쇠(지금 묶음의 열쇠와 다름)
const eswtGroup = (sortOrder = 0) => group('체외충격파', ESWT, sortOrder)

describe('AC-1206.1 groupKey', () => {
  it.each([
    [['ESWT1', 'ESWT7'], 't2538e307d10103cb'],
    [['eswt7', 'ESWT1', 'ESWT1'], 't2538e307d10103cb'],
    [['도수'], 't0c99afbb8431612f'],
    [['CARM1'], 't2f4ba094dcd40dcf'],
  ])('AC-1206.1 고정 값 %j → %s (FNV-1a 64비트)', (codes, key) => {
    expect(groupKey(codes)).toBe(key)
  })

  it('AC-1206.1 글자는 t + 소문자 16진수 16자리(앞자리 0도 채움)이고 validate.ts의 GROUP_ID를 지난다', () => {
    expect(GROUP_KEY.source).toBe('^t[0-9a-f]{16}$')
    const keys = Array.from({ length: 300 }, (_, i) => groupKey([`C${i}`, `도수${i}`]))
    for (const key of keys) expect(key).toMatch(GROUP_KEY)
    expect(new Set(keys).size).toBe(300)
    const saved = validateDayPayload(day('2026-11-10', { groups: [line(groupKey(['도수']), 3, 1), line(ESWT_KEY, 2)] }))
    expect(saved?.groups.map((item) => item.id)).toEqual(['t0c99afbb8431612f', ESWT_KEY])
  })

  it('AC-1206.1 코드 차례·겹침·대소문자에 상관없이 같다', () => {
    expect(groupKey(['ESWT7', 'eswt1'])).toBe(groupKey(['ESWT1', 'ESWT7']))
    expect(groupKey(['ma4', '도수', 'MA4', '도수'])).toBe(groupKey(['도수', 'MA4']))
  })

  it('AC-1206.1 코드가 하나라도 다르면 다른 글자다(하나 더함·뺌·바꿈)', () => {
    const keys = [groupKey(ESWT), groupKey([...ESWT, 'ESWT9']), groupKey(['ESWT1']), groupKey(['ESWT1', 'ESWT8'])]
    expect(new Set(keys).size).toBe(4)
  })

  it('AC-1206.1 받은 목록을 바꾸지 않는다', () => {
    const codes = ['eswt7', 'ESWT1', 'ESWT1']
    groupKey(codes)
    expect(codes).toEqual(['eswt7', 'ESWT1', 'ESWT1'])
  })
})

describe('AC-1205.6 groupDefs', () => {
  it('AC-1205.6 처방이 든 묶음만 { id: groupKey(codes), codes }로 sortOrder 차례이고 같은 열쇠는 한 번만이다', () => {
    const groups = [group('초음파', ['SONO1'], 2), group('빈 묶음', [], 0), eswtGroup(1), group('같은 처방', ['eswt7', 'ESWT1'], 3)]
    expect(groupDefs(groups)).toEqual([
      { id: ESWT_KEY, codes: ['ESWT1', 'ESWT7'] },
      { id: groupKey(['SONO1']), codes: ['SONO1'] },
    ])
  })

  it('AC-1205.6 제안 묶음(id 없음)도 열쇠로 넘기고, 받은 목록은 바꾸지 않으며 codes는 새 배열이다', () => {
    const groups = [group('도수치료', ['도수', 'MA4'], 0, null)]
    const before = structuredClone(groups)
    const defs = groupDefs(groups)
    expect(defs).toEqual([{ id: groupKey(['도수', 'MA4']), codes: ['도수', 'MA4'] }])
    expect(defs[0].codes).not.toBe(groups[0].codes)
    expect(groups).toEqual(before)
  })

  it('AC-1205.6 처방이 든 묶음이 없으면 빈 목록이다', () => {
    expect(groupDefs([group('빈 묶음', [], 0)])).toEqual([])
    expect(groupDefs([])).toEqual([])
  })
})

describe('AC-1206.2 다시 불러오기 판단', () => {
  it('AC-1206.2 keyedIn — 기간 안 저장된 일 줄이 모두 그 열쇠 줄을 가지면 참이다(0건 줄도 센 날이다)', () => {
    const days = [day('2026-11-06', { groups: [line(ESWT_KEY, 0)] }), day('2026-11-10', { groups: [line(ESWT_KEY, 3)] })]
    expect(keyedIn(days, THIS_WEEK, ESWT_KEY)).toBe(true)
  })

  it('AC-1206.2 keyedIn — 한 줄이라도 그 열쇠 줄이 없으면 거짓이다(다른 열쇠 줄만 있어도)', () => {
    const days = [day('2026-11-06', { groups: [line(ESWT_KEY, 2)] }), day('2026-11-10', { groups: [line(OLD_KEY, 3)] })]
    expect(keyedIn(days, THIS_WEEK, ESWT_KEY)).toBe(false)
  })

  it('AC-1206.2 keyedIn — 기간 밖 줄은 보지 않고, 기간 안에 저장된 줄이 없으면 참이다', () => {
    const days = [day('2026-11-05'), day('2026-11-13'), day('2026-11-08', { groups: [line(ESWT_KEY, 1)] })]
    expect(keyedIn(days, THIS_WEEK, ESWT_KEY)).toBe(true)
    expect(keyedIn(days, LAST_WEEK, ESWT_KEY)).toBe(false)
    expect(keyedIn([day('2026-11-05')], THIS_WEEK, ESWT_KEY)).toBe(true)
  })

  it('AC-1206.2 고른 기간의 줄이 모두 열쇠를 가지면 숫자를 보이고, 한 줄이라도 없으면 숫자 없는 stale 줄이다', () => {
    const keyed = daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 2, 1)] })
    const [row] = treatmentRows(input(today, '7d', keyed, bothWeeks), [eswtGroup()])
    expect(row).toMatchObject({ kind: 'ready', key: ESWT_KEY, compared: true, row: { count: 14, newCount: 7, returningCount: 7 } })

    const missing = keyed.map((item) => (item.day === '2026-11-09' ? { ...item, groups: [] } : item))
    expect(treatmentRows(input(today, '7d', missing, bothWeeks), [eswtGroup()])).toEqual([{ kind: 'stale', group: eswtGroup(), key: ESWT_KEY }])
  })

  it('AC-1206.2 다른 열쇠(옛 처방)로 센 값과 처방 줄 숫자는 건수·눈금·그래프 어디에도 쓰이지 않는다', () => {
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, (ymd) => ({
      rx: [rx('ESWT1', 90, 30), rx('ESWT7', 80, 20)],
      groups: [line(OLD_KEY, 500, 100), line(ESWT_KEY, ymd < THIS_WEEK.from ? 1 : 2, 1)],
    }))
    const stats = input(today, '7d', days, bothWeeks)
    const item = ready(treatmentRows(stats, [eswtGroup()])[0])
    expect(item.row).toMatchObject({ count: 14, newCount: 7, returningCount: 7, comparable: { current: 14, previous: 7 } })
    const detail = treatmentDetail(stats, item)
    expect(detail.current.map((point) => point.count)).toEqual([2, 2, 2, 2, 2, 2, 2])
    expect(detail.previous.map((point) => point.count)).toEqual([1, 1, 1, 1, 1, 1, 1])

    // 지금 열쇠 줄이 하루 빠지면 옛 열쇠 줄이 모든 날에 있어도 숨긴다
    const stale = days.map((row) => (row.day === '2026-11-12' ? { ...row, groups: [line(OLD_KEY, 500, 100)] } : row))
    expect(treatmentRows(input(today, '7d', stale, bothWeeks), [eswtGroup()])[0].kind).toBe('stale')
  })

  it('AC-1206.2 groupInput은 날마다 처방 줄을 그 열쇠 줄 하나로 바꾸고(없으면 빈 목록) 다른 열쇠·처방 줄은 남기지 않는다', () => {
    const days = [
      day('2026-11-08', { rx: [rx('ESWT1', 9)], groups: [line(OLD_KEY, 7), line(ESWT_KEY, 3, 1)] }),
      day('2026-11-09', { rx: [rx('ESWT1', 4)], groups: [line(OLD_KEY, 4)] }),
    ]
    const stats = input(today, '7d', days, bothWeeks)
    const virtual = groupInput(stats, ESWT_KEY, '체외충격파', true)
    expect(virtual.days.map((row) => [row.day, row.rx])).toEqual([
      ['2026-11-08', [{ code: ESWT_KEY, name: '체외충격파', type: '', patients: 3, newPatients: 1, returning: 2 }]],
      ['2026-11-09', []],
    ])
    expect(virtual.covered).toEqual(bothWeeks)
    expect(virtual.range).toBe(stats.range)
    expect(days[0].rx).toEqual([rx('ESWT1', 9)]) // 받은 줄은 그대로
  })
})

describe('AC-1206.3 이름·차례만 바꿈', () => {
  it('AC-1206.3 이름이나 차례만 바꾸면 열쇠가 그대로라 다시 불러오지 않아도 숫자가 그대로 보인다', () => {
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 3, 1)] })
    const stats = input(today, '7d', days, bothWeeks)
    const before = ready(treatmentRows(stats, [group('체외충격파', ['ESWT1', 'ESWT7'], 0, 'g-1'), group('도수치료', ['도수'], 1, 'g-2')])[0])
    const after = ready(treatmentRows(stats, [group('충격파', ['ESWT7', 'ESWT1'], 1, 'g-1'), group('도수치료', ['도수'], 0, 'g-2')])[1])
    expect(after.key).toBe(before.key)
    expect(after.group.name).toBe('충격파')
    expect(after.row.name).toBe('충격파')
    expect(counted(after.row)).toEqual(counted(before.row))
    expect(after.row.count).toBe(21)
  })
})

describe('AC-1206.4 처방을 넣고 뺌', () => {
  const NEW_KEY = groupKey(['ESWT1', 'ESWT7', 'ESWT9'])
  const added = group('체외충격파', ['ESWT1', 'ESWT7', 'ESWT9'], 0)

  it('AC-1206.4 처방을 넣거나 빼면 그 기간을 다시 불러올 때까지 숨긴다', () => {
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 3)] })
    const stats = input(today, '7d', days, bothWeeks)
    expect(treatmentRows(stats, [added])).toEqual([{ kind: 'stale', group: added, key: NEW_KEY }])
    expect(treatmentRows(stats, [group('체외충격파', ['ESWT1'], 0)])[0]).toMatchObject({ kind: 'stale', key: groupKey(['ESWT1']) })
  })

  it('AC-1206.4 다시 불러오면(새 열쇠로 센 줄이 저장되면) 새 열쇠의 숫자가 나온다', () => {
    const reloaded = daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 3), line(NEW_KEY, 5)] })
    expect(ready(treatmentRows(input(today, '7d', reloaded, bothWeeks), [added])[0]).row.count).toBe(35)
  })

  it('AC-1206.4 처방을 예전 모음으로 되돌리면 그 모음으로 센 줄이 남은 기간은 바로 그 모음의 숫자가 나온다', () => {
    const reloaded = daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 3), line(NEW_KEY, 5)] })
    expect(ready(treatmentRows(input(today, '7d', reloaded, bothWeeks), [group('체외충격파', ['ESWT7', 'ESWT1'], 0)])[0]).row.count).toBe(21)
  })
})

describe('AC-1206.5 비교 기간의 열쇠', () => {
  it('AC-1206.5 비교 기간의 줄이 모두 열쇠를 가지면 증감·비교 눈금(comparable)·회색 막대(비교 칸 covered)를 낸다', () => {
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, (ymd) => ({ groups: [line(ESWT_KEY, ymd < THIS_WEEK.from ? 1 : 2)] }))
    const stats = input(today, '7d', days, bothWeeks)
    const item = ready(treatmentRows(stats, [eswtGroup()])[0])
    expect(item).toMatchObject({ compared: true, row: { comparable: { current: 14, previous: 7 } } })
    expect(formatDelta(item.row.delta, '건')).toMatchObject({ dir: 'up', text: '7건 (+100.0%)' })
    const detail = treatmentDetail(stats, item)
    expect(detail.previous.every((point) => point.covered)).toBe(true)
    expect(uncomparedNames([item])).toEqual([])
  })

  it('AC-1206.5 비교 기간 줄 하나라도 열쇠가 없으면 그 묶음만 비교하지 않는다: 비교할 수 없음·눈금 없음·회색 막대 없음·표 비교 칸 –', () => {
    const DOSU_KEY = groupKey(['도수'])
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, (ymd) => ({
      groups: ymd === '2026-11-01' ? [line(OLD_KEY, 40), line(DOSU_KEY, 1)] : [line(ESWT_KEY, ymd < THIS_WEEK.from ? 1 : 2), line(DOSU_KEY, 1)],
    }))
    const stats = input(today, '7d', days, bothWeeks)
    const [eswt, dosu] = treatmentRows(stats, [eswtGroup(0), group('도수치료', ['도수'], 1)]).map(ready)

    expect(eswt).toMatchObject({ compared: false, row: { count: 14, comparable: null, delta: { kind: 'unavailable' } } })
    expect(formatDelta(eswt.row.delta, '건').text).toBe('비교할 수 없음')
    const detail = treatmentDetail(stats, eswt)
    expect(detail.previous).toHaveLength(7)
    expect(detail.previous.some((point) => point.covered)).toBe(false) // 회색 막대 없음, 표 비교 칸 –
    expect(detail.previous.every((point) => point.count === 0)).toBe(true)
    expect(detail.current.every((point) => point.covered)).toBe(true)
    expect(detail.current.map((point) => point.count)).toEqual([2, 2, 2, 2, 2, 2, 2])

    expect(dosu).toMatchObject({ compared: true, row: { count: 7, comparable: { current: 7, previous: 7 } } })
    expect(uncomparedNames([eswt, dosu])).toEqual(['체외충격파'])
  })

  it('AC-1206.5 groupInput은 compared가 거짓일 때만 덮은 기간에서 비교 기간을 빼고 받은 덮은 기간은 바꾸지 않는다', () => {
    const covered = [
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-02', to: '2026-11-03' },
      { from: '2026-11-04', to: '2026-11-12' },
    ]
    const stats = input(today, '7d', [], covered)
    expect(groupInput(stats, ESWT_KEY, '체외충격파', false).covered).toEqual([
      { from: '2026-10-01', to: '2026-10-29' },
      { from: '2026-11-06', to: '2026-11-12' },
    ])
    expect(groupInput(stats, ESWT_KEY, '체외충격파', true).covered).toEqual(covered)
    expect(stats.covered).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-02', to: '2026-11-03' },
      { from: '2026-11-04', to: '2026-11-12' },
    ])
  })
})

describe('AC-1206.6 처방이 없는 묶음', () => {
  it('AC-1206.6 처방이 없는 묶음은 숫자 없는 empty 줄이고 다시 불러오기 판단(안내 이름)에 들지 않는다', () => {
    const rows = treatmentRows(input(today, '7d', [day('2026-11-08')], bothWeeks), [group('새 묶음', [], 0), eswtGroup(1)])
    expect(rows[0]).toEqual({ kind: 'empty', group: group('새 묶음', [], 0) })
    expect(rows[1].kind).toBe('stale')
    expect(staleNames(rows)).toEqual({ all: true, names: ['체외충격파'] })
    expect(uncomparedNames(rows)).toEqual([])
  })
})

describe('AC-1207.1 줄 차례', () => {
  const DOSU_KEY = groupKey(['도수'])
  const SONO_KEY = groupKey(['SONO1'])
  const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, {
    rx: [rx('AA254', 99), rx('도수', 1), rx('SONO1', 30)],
    groups: [line(DOSU_KEY, 1), line(ESWT_KEY, 10), line(SONO_KEY, 30)],
  })

  it('AC-1207.1 줄은 sortOrder 차례 그대로이고(건수로 다시 줄 세우지 않음) 묶음마다 한 줄뿐이다(합계·나머지 줄 없음)', () => {
    const groups = [group('초음파', ['SONO1'], 2), group('도수치료', ['도수'], 0), eswtGroup(1)]
    const rows = treatmentRows(input(today, '7d', days, bothWeeks), groups).map(ready)
    expect(rows.map((row) => row.group.name)).toEqual(['도수치료', '체외충격파', '초음파'])
    expect(rows.map((row) => row.row.count)).toEqual([7, 70, 210])
    // 어느 묶음에도 없는 처방(AA254)은 줄이 아니다. 줄의 코드는 묶음 열쇠뿐이다
    expect(rows.map((row) => row.row.code)).toEqual([DOSU_KEY, ESWT_KEY, SONO_KEY])
    expect(groups.map((item) => item.name)).toEqual(['초음파', '도수치료', '체외충격파']) // 받은 목록은 그대로
  })

  it('AC-1207.1 묶음이 없으면 줄이 없다', () => {
    expect(treatmentRows(input(today, '7d', days, bothWeeks), [])).toEqual([])
  })

  it('AC-1207.1 줄 열쇠(rowKey)는 저장된 id이고, 제안 묶음(id 없음)은 new: + 이름이다', () => {
    expect(rowKey(group('도수치료', ['도수'], 0, 'a1b2'))).toBe('a1b2')
    expect(rowKey(group('도수치료', ['도수'], 0, null))).toBe('new:도수치료')
  })
})

describe('AC-1207.2 처방 추세와 같은 셈', () => {
  const R_KEY = groupKey(['R'])
  // 처방 줄 R과 같은 숫자의 묶음 줄을 함께 둔 날. 묶음 (R)의 숫자는 처방 추세(rxList)의 R 줄과 같아야 한다
  const both = (ymd: string, patients: number, newPatients = 0, partial = false) =>
    day(ymd, { partial, rx: [rx('R', patients, newPatients)], groups: [line(R_KEY, patients, newPatients)] })
  const sameAsTrend = (stats: StatsInput) => {
    const item = ready(treatmentRows(stats, [group('R 묶음', ['r'], 0)])[0])
    const [trend] = rxList(stats)!
    expect(counted(item.row)).toEqual(counted(trend))
    return item.row
  }

  it('AC-1207.2 7일 — 비교 기간에 덮이지 않은 날이 있으면 덮인 짝만 견주고 건수는 기간 전체다', () => {
    const days = [...eachDay({ from: '2026-11-02', to: '2026-11-05' }).map((ymd) => both(ymd, 1)), ...eachDay(THIS_WEEK).map((ymd) => both(ymd, 2, 1))]
    const row = sameAsTrend(input(today, '7d', days, [{ from: '2026-11-02', to: '2026-11-12' }]))
    expect(row).toMatchObject({ count: 14, newCount: 7, returningCount: 7, partial: false, comparable: { current: 8, previous: 4 } })
  })

  it('AC-1207.2 7일 — 비교 기간이 모두 덮은 기간 밖이면 비교할 수 없음이고 건수는 그대로다', () => {
    const row = sameAsTrend(input(today, '7d', eachDay(THIS_WEEK).map((ymd) => both(ymd, 2)), [THIS_WEEK]))
    expect(row).toMatchObject({ count: 14, comparable: null, delta: { kind: 'unavailable' } })
  })

  it('AC-1207.2 덮은 기간 밖 날은 더하지 않고 덮은 기간 안의 덜 끝난 날은 더하며 그 짝은 견주지 않는다', () => {
    // 11월 6일은 덮은 기간 밖이다. 11월 12일은 덜 끝난 날이라 그 짝(11월 5일)을 양쪽에서 뺀다
    const days = [both('2026-11-06', 100), both('2026-11-08', 5), both('2026-11-12', 2, 0, true), both('2026-11-05', 3), both('2026-11-01', 4)]
    const covered = [
      { from: '2026-10-31', to: '2026-11-05' },
      { from: '2026-11-07', to: '2026-11-12' },
    ]
    const row = sameAsTrend(input(today, '7d', days, covered))
    expect(row).toMatchObject({ count: 7, comparable: { current: 5, previous: 4 } })
  })

  it('AC-1207.2 12개월(오늘 11월 13일) — 오늘이 든 달은 건수에 넣고 일부 기간(partial)이며 끝난 11달끼리 견준다', () => {
    const lastYear = monthsFrom('2024-12', 12).flatMap((month) => [both(`${month}-01`, 3, 1), both(`${month}-02`, 3, 1)])
    const thisYear = monthsFrom('2025-12', 12).flatMap((month) => [both(`${month}-01`, 4, 1), both(`${month}-02`, 4, 1)])
    const row = sameAsTrend(input(today, '12m', [...lastYear, ...thisYear], [{ from: '2024-12-01', to: '2026-11-12' }]))
    expect(row).toMatchObject({ count: 96, newCount: 24, returningCount: 72, partial: true, comparable: { current: 88, previous: 66 } })
  })

  it('AC-1207.2 12개월 — 이번 달이 끝난 달이면 일부 기간이 아니다', () => {
    const lastDay = '2026-11-30'
    const row = sameAsTrend(input(lastDay, '12m', [both('2026-11-02', 7), both('2025-11-02', 5)], [{ from: '2024-12-01', to: lastDay }]))
    expect(row).toMatchObject({ count: 7, partial: false, comparable: { current: 7, previous: 5 } })
  })

  it('AC-1207.2 90일도 표시 칸(주)과 상관없이 날끼리 짝 짓는다', () => {
    const range = statsRange(today, '90d')
    const days = daysFrom(range.previous.from, range.current.to, (ymd) => ({
      partial: ymd === range.previous.to,
      rx: [rx('R', 1)],
      groups: [line(R_KEY, 1)],
    }))
    const row = sameAsTrend({ days, covered: [{ from: range.previous.from, to: range.current.to }], range })
    expect(row).toMatchObject({ count: 90, comparable: { current: 89, previous: 89 } })
  })

  it('AC-1207.2 구분 없음 건수(gapCount)는 처방 골라 보기와 같은 셈(건수 − 신환 − 재진)이다', () => {
    const days = [day('2026-11-08', { rx: [{ ...rx('R', 7, 1), returning: 5 }], groups: [line(R_KEY, 7, 1, 5)] })]
    const stats = input(today, '7d', days, bothWeeks)
    const item = ready(treatmentRows(stats, [group('R 묶음', ['R'], 0)])[0])
    const [picked] = rxPickRows(stats, [{ code: 'R', name: 'R' }])
    expect(item.row.gapCount).toBe(1)
    expect({ ...counted(item.row), gapCount: item.row.gapCount }).toEqual({ ...counted(picked), gapCount: picked.gapCount })
  })
})

describe('AC-1207.4 비율', () => {
  it('AC-1207.4 밑수는 건수이고 소수 첫째 자리까지 버린다: 건수 3·신환 1·재진 2 → 33.3%·66.6%', () => {
    const days = [day('2026-11-08', { groups: [line(ESWT_KEY, 3, 1)] })]
    const { row } = ready(treatmentRows(input(today, '7d', days, bothWeeks), [eswtGroup()])[0])
    expect(row).toMatchObject({ count: 3, newCount: 1, returningCount: 2, gapCount: 0 })
    expect([rateText(row.newCount, row.count), rateText(row.returningCount, row.count)]).toEqual(['33.3%', '66.6%'])
  })
})

describe('AC-1207.5 0건 묶음', () => {
  it('AC-1207.5 이 기간 0건인 준비된 묶음은 줄을 지우지 않고 0건·비율 –이며, 비교 기간 5건이면 5건 (−100.0%) ▼다', () => {
    const days = [...eachDay(THIS_WEEK).map((ymd) => day(ymd, { groups: [line(ESWT_KEY, 0)] })), day('2026-11-01', { groups: [line(ESWT_KEY, 5, 2)] })]
    const rows = treatmentRows(input(today, '7d', days, bothWeeks), [eswtGroup()])
    expect(rows).toHaveLength(1)
    const { row } = ready(rows[0])
    expect(row).toMatchObject({ count: 0, newCount: 0, returningCount: 0, comparable: { current: 0, previous: 5 } })
    expect([rateText(row.newCount, row.count), rateText(row.returningCount, row.count)]).toEqual(['–', '–'])
    expect(formatDelta(row.delta, '건')).toMatchObject({ dir: 'down', text: '5건 (−100.0%)' })
  })
})

describe('AC-1208.1~AC-1208.4 안내에 쓰는 이름', () => {
  const DOSU_KEY = groupKey(['도수'])
  const SONO_KEY = groupKey(['SONO1'])
  // 일부러 sortOrder와 다른 차례로 준다
  const groups = [group('초음파', ['SONO1'], 3), group('빈 묶음', [], 1), group('도수치료', ['도수'], 0), eswtGroup(2)]
  const rowsOf = (days: DayPayload[]) => treatmentRows(input(today, '7d', days, bothWeeks), groups)

  it('AC-1208.1 처음 쓸 때(저장된 줄에 묶음 줄이 하나도 없음) 처방 든 묶음이 모두 숨김이면 all이 참이고 이름은 줄 차례다', () => {
    expect(staleNames(rowsOf(daysFrom(LAST_WEEK.from, THIS_WEEK.to)))).toEqual({ all: true, names: ['도수치료', '체외충격파', '초음파'] })
  })

  it('AC-1208.2 일부 묶음만 숨김이면 all은 거짓이고 숨긴 이름만 줄 차례다', () => {
    const rows = rowsOf(daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 1)] }))
    expect(staleNames(rows)).toEqual({ all: false, names: ['도수치료', '초음파'] })
  })

  it('AC-1208.3 숨긴 묶음이 없으면 이름이 없다(처방 든 묶음이 없을 때도)', () => {
    const rows = rowsOf(daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 1), line(DOSU_KEY, 1), line(SONO_KEY, 1)] }))
    expect(staleNames(rows)).toEqual({ all: false, names: [] })
    expect(staleNames(treatmentRows(input(today, '7d', [], bothWeeks), [group('빈 묶음', [], 0)]))).toEqual({ all: false, names: [] })
    expect(staleNames([])).toEqual({ all: false, names: [] })
  })

  it('AC-1208.4 준비됐지만 비교하지 않는 묶음 이름은 줄 차례이고, 숨긴 묶음은 들지 않으며, 없으면 빈 목록이다', () => {
    // 이번 기간은 셋 다 열쇠가 있고, 비교 기간은 체외충격파만 열쇠가 있다. 초음파는 이번 기간 하루가 빠져 숨긴다
    const days = daysFrom(LAST_WEEK.from, THIS_WEEK.to, (ymd) => ({
      groups:
        ymd < THIS_WEEK.from
          ? [line(ESWT_KEY, 1)]
          : ymd === '2026-11-10'
            ? [line(ESWT_KEY, 1), line(DOSU_KEY, 1)]
            : [line(ESWT_KEY, 1), line(DOSU_KEY, 1), line(SONO_KEY, 1)],
    }))
    const rows = rowsOf(days)
    expect(rows.map((row) => row.kind)).toEqual(['ready', 'empty', 'ready', 'stale'])
    expect(uncomparedNames(rows)).toEqual(['도수치료'])
    expect(uncomparedNames(rowsOf(daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 1), line(DOSU_KEY, 1), line(SONO_KEY, 1)] })))).toEqual([])
  })
})

describe('AC-1209.3 칸 나누기', () => {
  const R_KEY = groupKey(['R'])
  const withoutCode = (points: readonly RxDetailPoint[]) => points.map((point) => ({ ...point, code: '' }))
  // 불러오는 범위 전체에 처방 줄 R과 같은 숫자의 묶음 줄을 둔다(날마다 숫자가 달라 칸 경계가 숫자로 보인다)
  function detailOf(day0: string, period: StatsPeriod) {
    const range = statsRange(day0, period)
    const last = addDays(day0, -1)
    const days = daysFrom(range.load.from, last, (ymd) => {
      const patients = (Number(ymd.slice(8)) % 5) + 1
      return { rx: [rx('R', patients, 1)], groups: [line(R_KEY, patients, 1)] }
    })
    const stats: StatsInput = { days, covered: [{ from: range.load.from, to: last }], range }
    const item = ready(treatmentRows(stats, [group('R 묶음', ['R'], 0)])[0])
    const detail = treatmentDetail(stats, item)
    const expected = rxDetail(stats, 'R')
    expect(withoutCode(detail.current)).toEqual(withoutCode(expected.current))
    expect(withoutCode(detail.previous)).toEqual(withoutCode(expected.previous))
    expect(detail.current.every((point) => point.code === R_KEY)).toBe(true)
    return detail
  }

  it.each([
    ['7d', 7],
    ['30d', 30],
  ] as const)('AC-1209.3 %s는 일 칸이고 처방 추세 rxDetail과 같은 칸이다', (period, count) => {
    const detail = detailOf(today, period)
    expect(detail.current).toHaveLength(count)
    expect(detail.previous).toHaveLength(count)
    expect(detail.current.every((point) => point.start === point.end)).toBe(true)
  })

  it('AC-1209.3 90일은 주(월~일) 칸이고 두 기간의 칸 수가 달라도 채우거나 자르지 않는다', () => {
    const detail = detailOf('2026-11-14', '90d')
    expect(detail.current).toHaveLength(14)
    expect(detail.previous).toHaveLength(13)
    for (const points of [detail.current, detail.previous]) {
      points.forEach((point, i) => {
        if (i > 0) expect(weekdayOf(point.start)).toBe(1)
        if (i < points.length - 1) expect(weekdayOf(point.end)).toBe(7)
      })
    }
  })

  it('AC-1209.3 12개월은 달 칸이고 비교 기간도 같은 12달이다', () => {
    const detail = detailOf(today, '12m')
    expect(detail.current.map((point) => point.start.slice(0, 7))).toEqual(monthsFrom('2025-12', 12))
    expect(detail.previous.map((point) => point.start.slice(0, 7))).toEqual(monthsFrom('2024-12', 12))
  })
})

describe('소스 규칙 (view.ts와 같음)', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/treatmentView.ts'), 'utf8')

  it('AC-1207.2 숫자는 view.ts의 rxPickRows·rxDetail·codeKey를 불러 써서 처방 추세와 같은 셈이다(따로 세지 않는다)', () => {
    expect(source).toMatch(/import \{[^}]*\bcodeKey\b[^}]*\} from '\.\/view'/)
    expect(source).toContain('rxPickRows(')
    expect(source).toContain('rxDetail(')
    expect(source).not.toContain('buildTrend')
  })

  it('AC-1207.2 순수 함수다(화면 라이브러리·서버·네트워크·브라우저 저장소·시계 없음)', () => {
    expect(source).not.toMatch(/react|supabase|fetch|localStorage|sessionStorage|indexedDB|document\.cookie|console|lib\/bridge/i)
    expect(source).not.toMatch(/new Date|Date\.(UTC|now)/)
  })
})

// ── 고른 기간 (stats-period TASK-3 AC-1705.2): 비교마다 그 묶음으로 세었는지. 오늘 2026-11-06, 10월 일별(9월 · 작년 10월과 견줌)
describe('AC-1705.2 처방별 추세 — 비교마다 그 묶음으로 세었는지', () => {
  const P_TODAY = '2026-11-06'
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const ESWT_GROUP = group('체외충격파', ESWT, 1)
  const COVER: DateRange[] = [
    { from: '2025-10-01', to: '2025-10-31' },
    { from: '2026-09-01', to: '2026-11-05' },
  ]
  const pickIn = (days: DayPayload[], covered: DateRange[] = COVER): StatsInput => ({ days, covered, range: rangeOf(P_TODAY, OCT, false) })
  const keyed = (from: string, to: string, patients: number) => daysFrom(from, to, { groups: [line(ESWT_KEY, patients)] })

  it('AC-1705.2 작년 기간을 그 묶음으로 세지 않았으면 작년 칸만 견주지 않는다(lastYearCompared 거짓)', () => {
    const days = [...daysFrom('2025-10-01', '2025-10-31'), ...keyed('2026-09-01', '2026-09-30', 1), ...keyed('2026-10-01', '2026-10-31', 2)]
    const item = ready(treatmentRows(pickIn(days), [ESWT_GROUP])[0]!)
    expect(item.compared).toBe(true)
    expect(item.lastYearCompared).toBe(false)
    expect(item.row).toMatchObject({ count: 62, comparable: { current: 62, previous: 30 }, delta: compareNumbers(62, 30) })
    expect(item.row.lastYear).toEqual({ previous: null, delta: { kind: 'unavailable' } })
  })

  it('AC-1705.2 바로 전 기간을 세지 않았으면 바로 전 칸만 견주지 않는다', () => {
    const days = [...keyed('2025-10-01', '2025-10-31', 3), ...daysFrom('2026-09-01', '2026-09-30'), ...keyed('2026-10-01', '2026-10-31', 2)]
    const item = ready(treatmentRows(pickIn(days), [ESWT_GROUP])[0]!)
    expect(item.compared).toBe(false)
    expect(item.lastYearCompared).toBe(true)
    expect(item.row).toMatchObject({ count: 62, comparable: null, delta: { kind: 'unavailable' } })
    expect(item.row.lastYear).toEqual({ previous: 93, delta: compareNumbers(62, 93) })
    expect(uncomparedNames([item])).toEqual(['체외충격파'])
  })

  it('AC-1705.2 두 비교 기간을 모두 세었으면 둘 다 견준다', () => {
    const days = [...keyed('2025-10-01', '2025-10-31', 3), ...keyed('2026-09-01', '2026-09-30', 1), ...keyed('2026-10-01', '2026-10-31', 2)]
    const item = ready(treatmentRows(pickIn(days), [ESWT_GROUP])[0]!)
    expect([item.compared, item.lastYearCompared]).toEqual([true, true])
    expect(item.row.delta).toEqual(compareNumbers(62, 30))
    expect(item.row.lastYear).toEqual({ previous: 93, delta: compareNumbers(62, 93) })
  })

  it('AC-1705.2 groupInput은 세지 않은 비교 기간마다 그 기간을 덮은 기간에서 뺀다', () => {
    const input = pickIn([])
    expect(groupInput(input, ESWT_KEY, '체외충격파', true).covered).toEqual(COVER)
    expect(groupInput(input, ESWT_KEY, '체외충격파', true, false).covered).toEqual([{ from: '2026-09-01', to: '2026-11-05' }])
    expect(groupInput(input, ESWT_KEY, '체외충격파', false, true).covered).toEqual([
      { from: '2025-10-01', to: '2025-10-31' },
      { from: '2026-10-01', to: '2026-11-05' },
    ])
  })

  it('AC-1705.2 빠른 단추와 해 고르기(작년 비교 없음)의 줄에는 lastYearCompared가 없다', () => {
    const quick = ready(treatmentRows(input(today, '7d', daysFrom(LAST_WEEK.from, THIS_WEEK.to, { groups: [line(ESWT_KEY, 1)] }), bothWeeks), [ESWT_GROUP])[0]!)
    expect(quick).not.toHaveProperty('lastYearCompared')
    const year: StatsInput = { days: keyed('2025-01-01', '2025-12-31', 1), covered: [{ from: '2024-01-01', to: '2025-12-31' }], range: rangeOf(P_TODAY, { kind: 'year', year: '2025' }, false) }
    expect(ready(treatmentRows(year, [ESWT_GROUP])[0]!)).not.toHaveProperty('lastYearCompared')
  })
})
