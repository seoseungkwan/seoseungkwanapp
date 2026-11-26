// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GcalFix } from '@/types/gcal'
import { dayWithYear, fixDay, FIX_RANGE_KEY, inFixRange, rangeProblem, readFixRange, writeFixRange } from './fixRange'

// 고쳐야 할 판의 기간(spec google-link REQ-8550 AC-8550.1·AC-8550.2·AC-8550.3·AC-8550.5, design.md 21-8, 시안 calendar.html ?s=fix-range).
// 기억은 이 브라우저 저장소(localStorage) 한 칸뿐이고, 읽기·쓰기가 실패해도 처음 값(오늘 ~ 비움)으로 그냥 그린다. 제목·이름은 지어낸 것이다

const TODAY = '2026-11-26'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const fix = (over: Partial<GcalFix>): GcalFix => ({
  id: 'f1',
  gEventId: 'gev0001a',
  day: '2026-11-26',
  start: 600,
  len: 30,
  allDay: false,
  gColor: null,
  gTitle: '1234 홍길동 체외 30분 (호)',
  reason: 'bad-kind',
  guess: { chart: '1234', name: '홍길동', kindId: null, kindHow: null, staffId: 'ho', staffHow: 'title', memo: null, word: '체외' },
  state: 'open',
  gUpdated: '2026-11-26T01:00:00.000Z',
  ...over,
})

describe('AC-8550.1 기억한 기간 읽기·쓰기 (이 브라우저만)', () => {
  it('AC-8550.1: 기억이 없으면 시작 = 오늘 · 끝 = 비움', () => {
    expect(readFixRange(TODAY)).toEqual({ from: TODAY, to: '' })
  })

  it('AC-8550.1: 고른 기간을 쓰면 그 열쇠에 남고, 다음에 그대로 읽는다(끝 비움·시작 비움도)', () => {
    writeFixRange({ from: '2025-11-01', to: '2025-11-30' })
    expect(JSON.parse(localStorage.getItem(FIX_RANGE_KEY)!)).toEqual({ from: '2025-11-01', to: '2025-11-30' })
    expect(readFixRange(TODAY)).toEqual({ from: '2025-11-01', to: '2025-11-30' })
    writeFixRange({ from: '2026-11-23', to: '' })
    expect(readFixRange(TODAY)).toEqual({ from: '2026-11-23', to: '' })
    writeFixRange({ from: '', to: '2026-11-29' })
    expect(readFixRange(TODAY)).toEqual({ from: '', to: '2026-11-29' })
    expect(FIX_RANGE_KEY).toBe('ssk-gcal-fix-range')
  })

  it.each([
    ['JSON이 아님', 'not json'],
    ['null', 'null'],
    ['목록', '["2026-11-23",""]'],
    ['글자', '"2026-11-23"'],
    ['끝 칸 없음', '{"from":"2026-11-23"}'],
    ['시작 칸 없음', '{"to":"2026-11-29"}'],
    ['숫자', '{"from":20261123,"to":""}'],
    ['없는 날', '{"from":"2026-02-30","to":""}'],
    ['날짜 꼴 아님', '{"from":"2026/11/23","to":""}'],
    ['끝이 날짜 꼴 아님', '{"from":"2026-11-23","to":"next"}'],
  ])('AC-8550.1: 깨진 값(%s)이면 오늘 ~ 비움', (_name, raw) => {
    localStorage.setItem(FIX_RANGE_KEY, raw)
    expect(readFixRange(TODAY)).toEqual({ from: TODAY, to: '' })
  })

  it('AC-8550.1: 저장소 읽기가 던지면 오늘 ~ 비움, 쓰기가 던져도 조용히 지나간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readFixRange(TODAY)).toEqual({ from: TODAY, to: '' })
    expect(() => writeFixRange({ from: '2026-11-23', to: '' })).not.toThrow()
  })

  it('AC-8550.1: 저장소가 아예 없어도(globalThis.localStorage 없음) 오늘 ~ 비움이고 쓰기는 조용하다', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(readFixRange(TODAY)).toEqual({ from: TODAY, to: '' })
      expect(() => writeFixRange({ from: '2026-11-23', to: '' })).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('AC-8550.2 기간에 드는 줄', () => {
  it('AC-8550.2: 시작·끝 두 날 포함, 그 밖은 뺀다', () => {
    const range = { from: '2026-11-23', to: '2026-11-29' }
    const rows = ['2026-11-22', '2026-11-23', '2026-11-26', '2026-11-29', '2026-11-30'].map((day, i) => fix({ id: `f${i}`, gEventId: `gev000${i}x`, day }))
    expect(rows.filter((f) => inFixRange(f, rows, range)).map((f) => f.day)).toEqual(['2026-11-23', '2026-11-26', '2026-11-29'])
    const oneDay = { from: '2026-11-26', to: '2026-11-26' }
    expect(rows.filter((f) => inFixRange(f, rows, oneDay)).map((f) => f.day)).toEqual(['2026-11-26'])
  })

  it('AC-8550.2: 끝이 비면 시작부터 앞으로 전부', () => {
    const rows = ['2025-11-24', '2026-11-25', '2026-11-26', '2027-03-02'].map((day, i) => fix({ id: `f${i}`, gEventId: `gev000${i}x`, day }))
    expect(rows.filter((f) => inFixRange(f, rows, { from: '2026-11-26', to: '' })).map((f) => f.day)).toEqual(['2026-11-26', '2027-03-02'])
  })

  it('AC-8550.2: 하루 종일 여러 날 일정(같은 일정 id의 하루 종일 줄들)은 가장 이른 날(시작 날)로 거른다', () => {
    const a = fix({ id: 'a1', gEventId: 'gevmulti1', day: '2026-11-25', start: 0, len: 1440, allDay: true, gTitle: '학회' })
    const b = fix({ id: 'a2', gEventId: 'gevmulti1', day: '2026-11-26', start: 0, len: 1440, allDay: true, gTitle: '학회' })
    const c = fix({ id: 'a3', gEventId: 'gevmulti1', day: '2026-11-27', start: 0, len: 1440, allDay: true, gTitle: '학회' })
    const timed = fix({ id: 't1', gEventId: 'gevmulti1', day: '2026-11-20' }) // 시간 있는 줄은 묶지 않는다
    const other = fix({ id: 'o1', gEventId: 'gevother1', day: '2026-11-26', start: 0, len: 1440, allDay: true, gTitle: '세미나' })
    const all = [c, b, a, timed, other]
    expect([a, b, c].map((f) => fixDay(f, all))).toEqual(['2026-11-25', '2026-11-25', '2026-11-25'])
    expect(fixDay(timed, all)).toBe('2026-11-20')
    expect(fixDay(other, all)).toBe('2026-11-26')
    expect(all.filter((f) => inFixRange(f, all, { from: '2026-11-26', to: '' })).map((f) => f.id)).toEqual(['o1'])
    expect(all.filter((f) => inFixRange(f, all, { from: '2026-11-25', to: '2026-11-25' })).map((f) => f.id)).toEqual(['a3', 'a2', 'a1'])
  })
})

describe('AC-8550.5 기간 오류', () => {
  it.each<[string, { from: string; to: string }, 'no-from' | 'end-before' | null]>([
    ['시작 비움', { from: '', to: '' }, 'no-from'],
    ['시작 비움 · 끝 있음', { from: '', to: '2026-11-29' }, 'no-from'],
    ['끝이 시작보다 앞', { from: '2026-11-26', to: '2026-11-25' }, 'end-before'],
    ['같은 날', { from: '2026-11-26', to: '2026-11-26' }, null],
    ['끝 비움', { from: '2026-11-26', to: '' }, null],
    ['해를 넘김', { from: '2025-11-24', to: '2026-01-05' }, null],
  ])('AC-8550.5: %s', (_name, range, want) => {
    expect(rangeProblem(range)).toBe(want)
  })
})

describe('AC-8550.3 올해가 아닌 날짜', () => {
  it('AC-8550.3: 올해가 아니면 앞에 해를 붙이고(2025. 11/24 (월)), 올해면 그대로', () => {
    expect(dayWithYear('2025-11-24', TODAY)).toBe('2025. 11/24 (월)')
    expect(dayWithYear('2027-01-04', TODAY)).toBe('2027. 1/4 (월)')
    expect(dayWithYear('2026-11-26', TODAY)).toBe('11/26 (목)')
    expect(dayWithYear('2026-01-01', TODAY)).toBe('1/1 (목)')
  })
})
