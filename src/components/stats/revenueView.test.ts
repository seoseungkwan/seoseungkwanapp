// 통계 매출 칸의 셈 (stats-revenue TASK-4, REQ-4105 · AC-4105.1~AC-4105.6). 날 줄·코드·이름·숫자는 모두 지어낸 값이다.
// 시안 숫자(최근 30일 · 오늘 11월 14일)는 아래 mockupDays가 맞춘다: 진료한 날 25일 · 확인 필요한 날 10월 28일 · 일요일 쉼
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eachDay, weekdayOf } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { RevenueDayRow } from '@/types/revenue'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { pickRange } from './periodPick'
import { revenueCells, revenueTabs, roughInfo, type RevenueCell, type RevenueInput } from './revenueView'
import { statsRange } from './view'

type Day = RevenueDayRow & { dayCodes: boolean }

const TODAY = '2026-11-14'
const LAST = '2026-11-13'
const R30 = statsRange(TODAY, '30d') // 10월 15일 – 11월 13일, 지난 30일 9월 15일 – 10월 14일

// 나눔이 있는 보통 날: total = (insurer + copay) + noncovered + otherTotal
function day(date: string, over: Partial<Day> = {}): Day {
  return {
    date,
    visits: 10,
    newPatients: 2,
    returnVisits: 8,
    total: 1_000_000,
    insurer: 500_000,
    noncovered: 250_000,
    copay: 200_000,
    otherTotal: 50_000,
    cash: 100_000,
    card: 800_000,
    transfer: 100_000,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
    dayCodes: true,
    ...over,
  }
}

const MONEY_NULL = { total: null, insurer: null, noncovered: null, copay: null, otherTotal: null, cash: null, card: null, transfer: null, receivableIn: null }
const MONEY_ZERO = { total: 0, insurer: 0, noncovered: 0, copay: 0, otherTotal: 0, cash: 0, card: 0, transfer: 0, receivableIn: 0 }

const uncheckedDay = (date: string, over: Partial<Day> = {}) => day(date, { ...MONEY_NULL, unconfirmed: true, ...over })
const restDay = (date: string, over: Partial<Day> = {}) => day(date, { ...MONEY_ZERO, visits: 0, newPatients: 0, returnVisits: 0, ...over })
const noSplitDay = (date: string, over: Partial<Day> = {}) =>
  day(date, { total: 500_000, insurer: null, noncovered: null, copay: null, otherTotal: null, splitUnconfirmed: true, ...over })
// 총액 total, 나머지 나눔(본인 200,000 · 비급여 250,000 · 기타 50,000)은 그대로이고 공단부담이 맞춘다
const paid = (date: string, total: number, over: Partial<Day> = {}) => day(date, { total, insurer: total - 500_000, ...over })
const isSunday = (date: string) => weekdayOf(date) === 7
const span = (from: string, to: string): DateRange => ({ from, to })

// 시안 숫자: 이번 30일 매출 132,612,000원(24일 × 5,300,000 + 11월 13일 5,412,000) · 짝 맞는 접수 2,313건 · 10월 28일 확인 필요(접수 95건),
// 지난 30일 132,005,000원(25일 × 5,077,000 + 10월 14일 5,080,000) · 접수 2,370건. 일요일은 쉬는 날
function mockupDays(): Day[] {
  const current = eachDay(span('2026-10-15', '2026-11-13')).map((date) => {
    if (isSunday(date)) return restDay(date)
    if (date === '2026-10-28') return uncheckedDay(date, { visits: 95 })
    if (date === '2026-11-13') return day(date, { total: 5_412_000, insurer: 2_482_000, copay: 980_000, noncovered: 1_700_000, otherTotal: 250_000, visits: 105 })
    return day(date, { total: 5_300_000, insurer: 2_430_000, copay: 960_000, noncovered: 1_665_000, otherTotal: 245_000, visits: 92 })
  })
  const previous = eachDay(span('2026-09-15', '2026-10-14')).map((date) => {
    if (isSunday(date)) return restDay(date)
    if (date === '2026-10-14') return day(date, { total: 5_080_000, insurer: 2_340_000, copay: 900_000, noncovered: 1_600_000, otherTotal: 240_000, visits: 95 })
    return day(date, { total: 5_077_000, insurer: 2_337_000, copay: 900_000, noncovered: 1_600_000, otherTotal: 240_000, visits: 91 })
  })
  return [...previous, ...current]
}

function inputOf(over: Partial<RevenueInput> = {}): RevenueInput {
  return { range: R30, lastDay: LAST, days: mockupDays(), codes: [], monthCodes: [], groups: [], noDayCodes: false, ...over }
}

// 날 줄 바꾸기: 그날 줄을 바꾸거나(row) 지운다(null)
function withDays(days: readonly Day[], changes: Record<string, Day | null>): Day[] {
  return days.flatMap((row) => (row.date in changes ? (changes[row.date] === null ? [] : [changes[row.date]!]) : [row]))
}

// 10월 28일(확인 필요한 날, 접수 95건)에 참고 금액 498만 원이 있는 시안 숫자(first90 시안 '참고 금액 포함')
const roughMockupDays = () => withDays(mockupDays(), { '2026-10-28': uncheckedDay('2026-10-28', { visits: 95, roughTotal: 4_980_000 }) })

const ready = (input: RevenueInput) => {
  const tabs = revenueTabs(input)
  if (tabs.kind !== 'ready') throw new Error('ready가 아니다')
  return tabs
}
const cellOf = (cells: RevenueCell[], key: RevenueCell['key']) => cells.find((cell) => cell.key === key)!
// 화면에 보이는 글: 값 + 작은 단위, 증감 줄은 화살표(꾸밈) + 글 + 꼬리 글(first90 AC-4408.2)
const ARROW: Record<string, string> = { up: '▲ ', down: '▼ ' }
const shown = (cell: RevenueCell) => `${cell.value}${cell.unit ?? ''}`
const deltaShown = (cell: RevenueCell) => (cell.delta === null ? null : `${ARROW[cell.delta.dir] ?? ''}${cell.delta.text}${cell.delta.srText ? ` ${cell.delta.srText}` : ''}`)
const NO_COMPARE_DELTA = { dir: 'none', text: '비교할 자료가 없어요', srText: '' }

const NONE_DELTA = { dir: 'none', text: '–', srText: '' }
const up = (text: string) => ({ dir: 'up', text, srText: '늘어남' })
const down = (text: string) => ({ dir: 'down', text, srText: '줄어듦' })

// ── 기간 요약 둘째 줄 ─────────────────────────────────────

describe('AC-4105.1·AC-4408.2 revenueCells: 매출 요약 칸 셋', () => {
  it('AC-4105.1·AC-4408.2 시안 숫자(꺼짐): 총매출 1억 3,261만 원 ▲ 60만 원 (+0.4%) 지난 30일보다 늘어남 · 57,333원 ▲ +2.9% · 1일', () => {
    expect(revenueCells(inputOf({ days: roughMockupDays() }))).toEqual([
      {
        key: 'total',
        label: '총매출',
        hint: null,
        tag: false,
        value: '1억 3,261만',
        unit: '원',
        tone: 'ink',
        delta: { dir: 'up', text: '60만 원 (+0.4%)', srText: '지난 30일보다 늘어남' },
        notes: ['진료한 날 25일 · 하루 평균 530만 원'],
      },
      { key: 'perVisit', label: '건당 진료비', hint: '매출 ÷ 접수 2,313건', tag: false, value: '57,333', unit: '원', tone: 'ink', delta: { dir: 'up', text: '+2.9%', srText: '' }, notes: [] },
      { key: 'unchecked', label: '확인 필요한 날', hint: null, tag: false, value: '1', unit: '일', tone: 'warn', delta: null, notes: ['10월 28일 · 금액이 확실하지 않아 뺐어요'] },
    ])
    const cells = revenueCells(inputOf())
    expect(deltaShown(cellOf(cells, 'total'))).toBe('▲ 60만 원 (+0.4%) 지난 30일보다 늘어남')
    expect(shown(cellOf(cells, 'perVisit'))).toBe('57,333원')
    expect(deltaShown(cellOf(cells, 'perVisit'))).toBe('▲ +2.9%')
    expect(shown(cellOf(cells, 'unchecked'))).toBe('1일')
  })

  it('AC-4408.2 참고 금액이 없는 확인 필요한 날(옛 도우미)은 `{날짜} · 금액을 알 수 없어 뺐어요`다', () => {
    expect(cellOf(revenueCells(inputOf()), 'unchecked').notes).toEqual(['10월 28일 · 금액을 알 수 없어 뺐어요'])
    expect(cellOf(revenueCells(inputOf(), 'in'), 'unchecked').notes).toEqual(['10월 28일 · 금액을 알 수 없어 뺐어요'])
  })

  it('AC-4408.2 켜짐: 매출 = 확인된 날 + 참고 금액, 건당 = 그 매출 ÷ 접수(참고 금액 날 포함, 버림), 비교 기간도 같은 방식, 두 칸에 "참고 포함"', () => {
    const cells = revenueCells(inputOf({ days: roughMockupDays() }), 'in')
    expect(cellOf(cells, 'total')).toEqual({
      key: 'total',
      label: '총매출',
      hint: null,
      tag: true,
      value: '1억 3,759만',
      unit: '원',
      tone: 'ink',
      delta: { dir: 'up', text: '558만 원 (+4.2%)', srText: '지난 30일보다 늘어남' },
      notes: ['진료한 날 26일 · 하루 평균 529만 원 · 참고 498만 원 포함'],
    })
    expect(cellOf(cells, 'perVisit')).toEqual({ key: 'perVisit', label: '건당 진료비', hint: '매출 ÷ 접수 2,408건', tag: true, value: '57,139', unit: '원', tone: 'ink', delta: { dir: 'up', text: '+2.5%', srText: '' }, notes: [] })
    expect(cellOf(cells, 'unchecked')).toMatchObject({ value: '1', unit: '일', tag: false, notes: ['10월 28일 · 참고 금액 498만 원 포함'] })
  })

  it('AC-4408.2 비교 기간의 참고 금액도 켜짐에서 더한다(같은 방식)', () => {
    const days = withDays(roughMockupDays(), { '2026-09-16': uncheckedDay('2026-09-16', { roughTotal: 5_077_000 }) })
    const cell = cellOf(revenueCells(inputOf({ days }), 'in'), 'total')
    // 지난 30일: 132,005,000원 그대로(그날 참고 금액이 그날 확인된 금액과 같다) → 이번 137,592,000원과 견준다
    expect(cell.delta).toEqual({ dir: 'up', text: '558만 원 (+4.2%)', srText: '지난 30일보다 늘어남' })
    const off = cellOf(revenueCells(inputOf({ days })), 'total')
    // 꺼짐: 지난 30일은 그날을 빼 126,928,000원, 이번은 132,612,000원
    expect(off.delta).toEqual({ dir: 'up', text: '568만 원 (+4.4%)', srText: '지난 30일보다 늘어남' })
  })

  it('AC-4408.2 꺼짐: 비교 기간에 확인 필요한 날이 있으면 총매출 아래 글 끝에 `{비교 이름}도 확인 필요한 날 {k}일을 빼고 견줬어요` 줄을 더한다(k = 그 기간 확인 필요한 날 모두)', () => {
    const days = withDays(mockupDays(), { '2026-09-16': uncheckedDay('2026-09-16'), '2026-09-17': uncheckedDay('2026-09-17', { roughTotal: 5_077_000 }) })
    expect(cellOf(revenueCells(inputOf({ days })), 'total').notes).toEqual(['진료한 날 25일 · 하루 평균 530만 원', '지난 30일도 확인 필요한 날 2일을 빼고 견줬어요'])
    // 보는 기간에 참고 금액이 있는 날이 없으면 켜도 꺼짐 셈이라 비교 기간도 모두 뺀다
    expect(cellOf(revenueCells(inputOf({ days }), 'in'), 'total').notes).toEqual(['진료한 날 25일 · 하루 평균 530만 원', '지난 30일도 확인 필요한 날 2일을 빼고 견줬어요'])
  })

  it('AC-4408.2 켜짐: 비교 기간의 확인 필요한 날 가운데 참고 금액이 없는 날만 {k}로 센다. 모두 참고 금액이 있으면 줄이 없다', () => {
    const days = withDays(roughMockupDays(), { '2026-09-16': uncheckedDay('2026-09-16'), '2026-09-17': uncheckedDay('2026-09-17', { roughTotal: 5_077_000 }) })
    expect(cellOf(revenueCells(inputOf({ days }), 'in'), 'total').notes).toEqual(['진료한 날 26일 · 하루 평균 529만 원 · 참고 498만 원 포함', '지난 30일도 확인 필요한 날 1일을 빼고 견줬어요'])
    expect(cellOf(revenueCells(inputOf({ days })), 'total').notes).toEqual(['진료한 날 25일 · 하루 평균 530만 원', '지난 30일도 확인 필요한 날 2일을 빼고 견줬어요'])
    const allRough = withDays(roughMockupDays(), { '2026-09-17': uncheckedDay('2026-09-17', { roughTotal: 5_077_000 }) })
    expect(cellOf(revenueCells(inputOf({ days: allRough }), 'in'), 'total').notes).toEqual(['진료한 날 26일 · 하루 평균 529만 원 · 참고 498만 원 포함'])
    expect(cellOf(revenueCells(inputOf({ days: allRough })), 'total').notes).toEqual(['진료한 날 25일 · 하루 평균 530만 원', '지난 30일도 확인 필요한 날 1일을 빼고 견줬어요'])
  })

  it('AC-4408.2 비교 기간에 확인 필요한 날이 없거나 견줄 수 없으면(비교 없음) 그 줄이 없다', () => {
    expect(cellOf(revenueCells(inputOf()), 'total').notes).toEqual(['진료한 날 25일 · 하루 평균 530만 원'])
    // 비교 기간에 저장하지 않은 날이 있어 견주지 않으면 그 기간의 확인 필요한 날도 말하지 않는다
    const days = withDays(mockupDays(), { '2026-09-16': null, '2026-09-17': uncheckedDay('2026-09-17') })
    expect(cellOf(revenueCells(inputOf({ days })), 'total')).toMatchObject({ delta: NO_COMPARE_DELTA, notes: ['진료한 날 25일 · 하루 평균 530만 원'] })
  })

  it('AC-4408.2 {비교 이름}은 증감 줄과 같은 이름이다(최근 12개월 `작년 같은 11달`)', () => {
    const range = statsRange(TODAY, '12m')
    const days = [
      ...eachDay(span('2024-12-01', '2025-11-30')).map((date) => (date === '2025-03-04' ? uncheckedDay(date) : paid(date, 1_000_000))),
      ...eachDay(span('2025-12-01', '2026-11-13')).map((date) => paid(date, 1_100_000)),
    ]
    expect(cellOf(revenueCells(inputOf({ range, days })), 'total').notes).toEqual(['진료한 날 348일 · 하루 평균 110만 원', '작년 같은 11달도 확인 필요한 날 1일을 빼고 견줬어요'])
  })

  it('AC-4408.2 참고 금액이 있는 날과 없는 날이 섞이면 아래 글이 두 줄이다(없는 날은 켜도 빠진다)', () => {
    const days = withDays(roughMockupDays(), { '2026-11-03': uncheckedDay('2026-11-03') })
    expect(cellOf(revenueCells(inputOf({ days })), 'unchecked').notes).toEqual(['10월 28일 · 금액이 확실하지 않아 뺐어요', '11월 3일 · 금액을 알 수 없어 뺐어요'])
    expect(cellOf(revenueCells(inputOf({ days }), 'in'), 'unchecked').notes).toEqual(['10월 28일 · 참고 금액 498만 원 포함', '11월 3일 · 금액을 알 수 없어 뺐어요'])
  })

  it('AC-4408.2 참고 금액이 있는 날이 없으면 켜짐도 꺼짐과 같다(꼬리표 없음)', () => {
    expect(revenueCells(inputOf(), 'in')).toEqual(revenueCells(inputOf()))
  })

  it('AC-4408.2 견줄 수 없으면 총매출·건당 진료비 증감 줄은 `비교할 자료가 없어요`다', () => {
    const input = inputOf({ days: withDays(mockupDays(), { '2026-09-16': null }) })
    expect(cellOf(revenueCells(input), 'perVisit').delta).toEqual(NO_COMPARE_DELTA)
    expect(cellOf(revenueCells(input), 'total').delta).toEqual(NO_COMPARE_DELTA)
  })

  it('AC-4105.1·AC-4408.2 확인 필요한 날이 없으면 값 `없음`이고 아래 글이 없다', () => {
    const days = withDays(mockupDays(), { '2026-10-28': day('2026-10-28', { total: 0, insurer: 0, copay: 0, noncovered: 0, otherTotal: 0, visits: 0 }) })
    expect(cellOf(revenueCells(inputOf({ days })), 'unchecked')).toEqual({ key: 'unchecked', label: '확인 필요한 날', hint: null, tag: false, value: '없음', unit: null, tone: 'ink', delta: null, notes: [] })
  })

  it('AC-4105.1·AC-4408.2 진료한 날은 확인 필요한 날·쉬는 날(접수 0건·금액 모두 0)을 빼고, 하루 평균은 매출 ÷ 진료한 날이다', () => {
    const days = [day('2026-11-10', { total: 3_000_000, insurer: 2_500_000 }), day('2026-11-11'), restDay('2026-11-12'), uncheckedDay('2026-11-13')]
    expect(cellOf(revenueCells(inputOf({ days })), 'total')).toMatchObject({ value: '400만', unit: '원', notes: ['진료한 날 2일 · 하루 평균 200만 원'] })
  })

  it('AC-4105.1·AC-4408.2 건당 진료비는 짝이 맞는 날의 매출 ÷ 접수 건수이고 원 미만을 버린다(확인 필요한 날·접수 모르는 날 뺌)', () => {
    const days = [
      day('2026-11-10', { total: 10_001, insurer: 10_001, copay: 0, noncovered: 0, otherTotal: 0, visits: 2 }),
      uncheckedDay('2026-11-11', { visits: 50 }),
      day('2026-11-12', { visits: null }),
    ]
    expect(cellOf(revenueCells(inputOf({ days })), 'perVisit')).toMatchObject({ value: '5,000', unit: '원', hint: '매출 ÷ 접수 2건' })
  })

  it('AC-4105.1·AC-4408.2 저장된 날이 없거나 모두 쉬는 날이면 세 칸 모두 `–` · `자료 없음`이다', () => {
    const blank = (key: RevenueCell['key'], label: string) => ({ key, label, hint: null, tag: false, value: '–', unit: null, tone: 'none', delta: null, notes: ['자료 없음'] })
    const empty = [blank('total', '총매출'), blank('perVisit', '건당 진료비'), blank('unchecked', '확인 필요한 날')]
    expect(revenueCells(inputOf({ days: [] }))).toEqual(empty)
    expect(revenueCells(inputOf({ days: eachDay(R30.current).map((date) => restDay(date)) }))).toEqual(empty)
  })

  it('AC-4105.1·AC-4408.2 매출을 읽는 중이면 `–` · `불러오는 중`, 읽기 실패면 `–` · `자료 없음`이다', () => {
    const labels = ['총매출', '건당 진료비', '확인 필요한 날']
    for (const [state, note] of [
      ['reading', '불러오는 중'],
      ['read-failed', '자료 없음'],
    ] as const) {
      const cells = revenueCells(state)
      expect(cells.map((cell) => cell.label)).toEqual(labels)
      for (const cell of cells) expect(cell).toMatchObject({ value: '–', unit: null, notes: [note], tone: 'none', delta: null, tag: false })
    }
  })

  it('AC-4105.1·AC-4408.2 보는 기간이 확인 필요한 날뿐이면 매출·건당 진료비는 `–`(0원이 아님)이고 확인 필요한 날은 센다', () => {
    const days = [uncheckedDay('2026-11-12'), uncheckedDay('2026-11-13'), restDay('2026-11-11')]
    const cells = revenueCells(inputOf({ days }))
    expect(cellOf(cells, 'total')).toMatchObject({ value: '–', unit: null, notes: ['자료 없음'], tone: 'none' })
    expect(cellOf(cells, 'perVisit')).toMatchObject({ value: '–', unit: null, notes: ['자료 없음'] })
    expect(cellOf(cells, 'unchecked')).toMatchObject({ value: '2', unit: '일', notes: ['11월 12일–13일 · 금액을 알 수 없어 뺐어요'], tone: 'warn' })
  })
})

describe('AC-4105.1·AC-4408.2 날짜 글 규칙(기본값 10)', () => {
  const note = (dates: string[]) => cellOf(revenueCells(inputOf({ days: withDays(mockupDays(), Object.fromEntries(dates.map((d) => [d, uncheckedDay(d)]))) })), 'unchecked').notes.join('\n')

  it('AC-4105.1·AC-4408.2 달이 바뀔 때마다 달을 쓰고 이어진 날은 묶는다', () => {
    expect(note(['2026-10-28', '2026-11-03', '2026-11-04'])).toBe('10월 28일·11월 3일–4일 · 금액을 알 수 없어 뺐어요')
  })

  it('AC-4105.1·AC-4408.2 달을 넘어 이어진 날은 끝에 달을 다시 쓰고, 그 달 안의 다음 날은 날만 쓴다', () => {
    expect(note(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-04'])).toBe('10월 28일·31일–11월 2일·4일 · 금액을 알 수 없어 뺐어요')
  })

  it('AC-4105.1·AC-4408.2 묶음이 다섯을 넘으면 앞 넷 뒤에 ` 외 {n}일`(남은 날 수)이다', () => {
    const days = withDays(
      mockupDays().map((row) => (row.date === '2026-10-28' ? day(row.date) : row)),
      Object.fromEntries(['2026-10-15', '2026-10-17', '2026-10-20', '2026-10-21', '2026-10-23', '2026-10-27', '2026-10-29', '2026-10-30'].map((d) => [d, uncheckedDay(d)])),
    )
    expect(cellOf(revenueCells(inputOf({ days })), 'unchecked')).toMatchObject({ value: '8', notes: ['10월 15일·17일·20일–21일·23일 외 3일 · 금액을 알 수 없어 뺐어요'] })
  })

  it('AC-4105.1·AC-4408.2 묶음이 다섯이면 모두 쓴다', () => {
    expect(note(['2026-10-15', '2026-10-17', '2026-10-20', '2026-11-03'])).toBe('10월 15일·17일·20일·28일·11월 3일 · 금액을 알 수 없어 뺐어요')
  })
})

// ── 비교 ────────────────────────────────────────────────

const R7 = statsRange(TODAY, '7d') // 11월 7일 – 13일, 지난 7일 10월 31일 – 11월 6일
// 쉬는 날 없는 7일 두 벌: 이번 날마다 now원, 지난 날마다 before원
const sevenDays = (now: number, before: number) => [
  ...eachDay(span('2026-10-31', '2026-11-06')).map((date) => paid(date, before)),
  ...eachDay(span('2026-11-07', '2026-11-13')).map((date) => paid(date, now)),
]

describe('AC-4105.2·AC-4408.2 총매출 증감 줄', () => {
  it('AC-4105.2·AC-4408.2 바로 전 기간(지난 7일)과 견주고, 줄었으면 `▼ … 지난 7일보다 줄어듦`이다', () => {
    const cell = cellOf(revenueCells(inputOf({ range: R7, days: sevenDays(1_000_000, 1_100_000) })), 'total')
    expect(cell.delta).toEqual({ dir: 'down', text: '70만 원 (−9.0%)', srText: '지난 7일보다 줄어듦' })
    expect(deltaShown(cell)).toBe('▼ 70만 원 (−9.0%) 지난 7일보다 줄어듦')
  })

  it('AC-4105.2·AC-4408.2 비율은 소수 첫째 자리에서 0 쪽으로 버린다(+4.08% → +4.0%)', () => {
    expect(cellOf(revenueCells(inputOf({ range: R7, days: sevenDays(1_040_800, 1_000_000) })), 'total').delta).toEqual({ dir: 'up', text: '28만 원 (+4.0%)', srText: '지난 7일보다 늘어남' })
  })

  it('AC-4105.2·AC-4408.2 버려서 0이면 `변화 없음`이다(화살표·방향 글 없음)', () => {
    const cell = cellOf(revenueCells(inputOf({ range: R7, days: sevenDays(1_000_000, 1_000_500) })), 'total')
    expect(cell.delta).toEqual({ dir: 'flat', text: '변화 없음', srText: '' })
    expect(deltaShown(cell)).toBe('변화 없음')
  })

  it('AC-4105.2·AC-4408.2 비교 기간에 매출을 저장하지 않은 날이 하루라도 있으면 견주지 않는다(`비교할 자료가 없어요`, 다른 탭 비교도 없음)', () => {
    const input = inputOf({ days: withDays(mockupDays(), { '2026-09-16': null }) })
    expect(cellOf(revenueCells(input), 'total').delta).toEqual(NO_COMPARE_DELTA)
    const tabs = ready(input)
    expect(tabs.trend.lead).toEqual({ text: '이 기간 매출', amount: '1억 3,261만 원', rest: null })
    expect(tabs.split.rows.map((row) => row.delta)).toEqual(Array(6).fill(NONE_DELTA))
    expect(tabs.perVisit.kpis[1]).toEqual({ name: '지난 30일보다', value: '–', sub: '비교할 자료가 없어요', tone: 'none', srText: '' })
    expect(tabs.perVisit.kpis[2]).toMatchObject({ value: '2,408건', sub: '비교할 자료가 없어요' })
  })

  it('AC-4105.2·AC-4408.2 이번 기간에 저장하지 않은 날이 있어도 견주지 않는다', () => {
    const input = inputOf({ days: withDays(mockupDays(), { '2026-11-02': null }) })
    expect(cellOf(revenueCells(input), 'total').delta).toEqual(NO_COMPARE_DELTA)
  })

  it('AC-4105.2·AC-4408.2 최근 12개월은 끝나지 않은 달(11월)과 작년 같은 달을 양쪽에서 빼고 견준다', () => {
    const range = statsRange(TODAY, '12m') // 2025년 12월 – 2026년 11월, 작년 같은 12달 2024년 12월 – 2025년 11월
    const days = [
      ...eachDay(span('2024-12-01', '2025-10-31')).map((date) => paid(date, 1_000_000)),
      ...eachDay(span('2025-11-01', '2025-11-30')).map((date) => paid(date, 9_000_000)), // 빼는 달: 더하면 줄어든다
      ...eachDay(span('2025-12-01', '2026-11-13')).map((date) => paid(date, 1_100_000)),
    ]
    const input = inputOf({ range, days })
    const cells = revenueCells(input)
    expect(cellOf(cells, 'total')).toMatchObject({
      value: '3억 8,280만',
      notes: ['진료한 날 348일 · 하루 평균 110만 원'],
      delta: { dir: 'up', text: '3,350만 원 (+10.0%)', srText: '작년 같은 11달보다 늘어남' },
    })
    const tabs = ready(input)
    expect(tabs.trend.lead).toEqual({ text: '이 기간 매출', amount: '3억 8,280만 원', rest: '· 작년 같은 11달 3억 3,500만 원' })
    expect(tabs.split.head).toEqual(['나눔', '최근 12개월', '몫', '작년 같은 11달보다'])
    expect(tabs.split.rows.at(-1)).toMatchObject({ name: '합계 · 매출', delta: up('+10.0%') })
  })

  it('AC-4105.2·AC-4408.2 최근 12개월의 마지막 달이 끝났으면(말일에 진료 끝) 열두 달 모두 견주고 이름은 `작년 같은 12달`이다', () => {
    const today = '2026-11-30'
    const range = statsRange(today, '12m')
    const days = [...eachDay(span('2024-12-01', '2025-11-30')).map((date) => paid(date, 1_000_000)), ...eachDay(span('2025-12-01', '2026-11-30')).map((date) => paid(date, 1_000_000))]
    expect(cellOf(revenueCells(inputOf({ range, lastDay: today, days })), 'total').delta).toEqual({ dir: 'flat', text: '변화 없음', srText: '' })
    const rising = days.map((row) => (row.date >= '2025-12-01' ? paid(row.date, 1_100_000) : row))
    expect(cellOf(revenueCells(inputOf({ range, lastDay: today, days: rising })), 'total').delta).toMatchObject({ srText: '작년 같은 12달보다 늘어남' })
  })

  it('AC-4105.2·AC-4408.2 고른 기간은 증감 꼬리 글이 통계 비교 이름을 따르고(`9월보다 늘어남`) 작년 칸은 없다', () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-10' }, false)
    const days = [
      ...eachDay(span('2025-10-01', '2025-10-31')).map((date) => paid(date, 1_240_000)),
      ...eachDay(span('2026-09-01', '2026-09-30')).map((date) => paid(date, 900_000)),
      ...eachDay(span('2026-10-01', '2026-10-31')).map((date) => paid(date, 1_000_000)),
    ]
    const cells = revenueCells(inputOf({ range, days }))
    expect(cells.map((cell) => cell.key)).toEqual(['total', 'perVisit', 'unchecked'])
    expect(cellOf(cells, 'total').delta).toEqual({ dir: 'up', text: '400만 원 (+14.8%)', srText: '9월보다 늘어남' })
  })
})

describe('AC-4408.1 roughInfo: 스위치에 줄 날 수', () => {
  it('AC-4408.1 보는 기간의 확인 필요한 날 수와 그 가운데 참고 금액이 있는 날 수다', () => {
    const days = withDays(roughMockupDays(), { '2026-11-03': uncheckedDay('2026-11-03'), '2026-09-20': uncheckedDay('2026-09-20', { roughTotal: 100_000 }) })
    expect(roughInfo(inputOf({ days }))).toEqual({ days: 2, roughDays: 1 })
    expect(roughInfo(inputOf())).toEqual({ days: 1, roughDays: 0 })
  })

  it('AC-4408.1 확인 필요한 날이 없으면 0일, 읽는 중·읽기 실패·저장된 날 없음이면 null이다', () => {
    const days = withDays(mockupDays(), { '2026-10-28': day('2026-10-28') })
    expect(roughInfo(inputOf({ days }))).toEqual({ days: 0, roughDays: 0 })
    expect(roughInfo('reading')).toBeNull()
    expect(roughInfo('read-failed')).toBeNull()
    expect(roughInfo(inputOf({ days: [] }))).toBeNull()
  })
})

// ── 막대 칸 ──────────────────────────────────────────────

describe('AC-4105.3 막대 칸', () => {
  it('AC-4105.3·AC-4408.3 최근 30일은 하루씩: 쉬는 날은 칸이 없고 확인 필요한 날은 점선 칸(mark unchecked, 0원 막대 아님), 값은 만 원 아래를 버린다', () => {
    const { trend } = ready(inputOf())
    const workDays = eachDay(R30.current).filter((date) => !isSunday(date))
    expect(trend.buckets.map((bucket) => bucket.key)).toEqual(workDays)
    expect(trend.buckets[0]).toEqual({ key: '2026-10-15', label: '10.15', rangeLabel: '10월 15일', state: 'complete', values: [530] })
    expect(trend.buckets.find((bucket) => bucket.key === '2026-10-28')).toEqual({ key: '2026-10-28', label: '', rangeLabel: '10월 28일', state: 'complete', values: [0], mark: 'unchecked' })
    expect(trend.buckets.at(-1)).toEqual({ key: '2026-11-13', label: '', rangeLabel: '11월 13일', state: 'complete', values: [541] })
    expect(trend.buckets.filter((bucket) => bucket.label !== '').map((bucket) => bucket.label)).toEqual(['10.15', '10.22', '10.29', '11.5', '11.12'])
    expect(trend.dense).toBe(false)
    expect(trend.note).toBe('휴진한 날은 칸이 없어요. 점선 칸은 확인 필요한 날(10월 28일)이에요. 0원이 아니라 금액이 확실하지 않아 합계에서 뺀 날이에요.')
  })

  it('AC-4105.3 확인 필요한 날이 없으면 아래 글은 첫 문장뿐이다', () => {
    const days = withDays(mockupDays(), { '2026-10-28': day('2026-10-28') })
    expect(ready(inputOf({ days })).trend.note).toBe('휴진한 날은 칸이 없어요.')
  })

  it('AC-4105.3·AC-4408.3 매출을 아직 저장하지 않은 날은 칸이 없고 아래 글 첫 문장이 바뀐다', () => {
    const { trend, perVisit } = ready(inputOf({ days: withDays(mockupDays(), { '2026-10-20': null, '2026-10-21': null }) }))
    expect(trend.buckets.map((bucket) => bucket.key)).not.toContain('2026-10-20')
    expect(trend.buckets.map((bucket) => bucket.key)).not.toContain('2026-10-21')
    expect(trend.note).toBe('휴진한 날과 아직 불러오지 않은 날은 칸이 없어요. 점선 칸은 확인 필요한 날(10월 28일)이에요. 0원이 아니라 금액이 확실하지 않아 합계에서 뺀 날이에요.')
    expect(perVisit.note).toBe(trend.note)
  })

  it('AC-4105.3·AC-4408.3 건당 진료비 막대는 천 원 아래를 버리고, 확인 필요한 날은 점선 칸(mark unchecked)·접수 건수를 모르는 날은 `no-data`다', () => {
    const days = withDays(mockupDays(), {
      '2026-10-15': day('2026-10-15', { total: 579_990, insurer: 79_990, visits: 10 }),
      '2026-10-16': day('2026-10-16', { visits: null }),
    })
    const { perVisit } = ready(inputOf({ days }))
    expect(perVisit.buckets[0]).toMatchObject({ key: '2026-10-15', values: [57] })
    expect(perVisit.buckets[1]).toMatchObject({ key: '2026-10-16', blank: 'no-data' })
    expect(perVisit.buckets.find((bucket) => bucket.key === '2026-10-28')).toEqual({ key: '2026-10-28', label: '', rangeLabel: '10월 28일', state: 'complete', values: [0], mark: 'unchecked' })
    expect(perVisit.buckets.find((bucket) => bucket.key === '2026-10-19')).toMatchObject({ values: [57] }) // 5,300,000 ÷ 92 = 57,608
    expect(perVisit.buckets.at(-1)).toMatchObject({ values: [51] }) // 5,412,000 ÷ 105 = 51,542
  })

  it('AC-4105.3 매출 막대 값은 만 원 아래를 버린다(5,309,999원 → 530)', () => {
    const days = withDays(mockupDays(), { '2026-10-15': paid('2026-10-15', 5_309_999) })
    expect(ready(inputOf({ days })).trend.buckets[0]).toMatchObject({ values: [530] })
  })

  it('AC-4105.3 최근 7일도 하루씩이고 날짜 글은 날마다다', () => {
    const days = [...sevenDays(1_000_000, 1_000_000).filter((row) => row.date !== '2026-11-08'), restDay('2026-11-08')]
    const { trend } = ready(inputOf({ range: R7, days }))
    expect(trend.buckets.map((bucket) => bucket.label)).toEqual(['11.7', '11.9', '11.10', '11.11', '11.12', '11.13'])
    expect(trend.desc).toBe('매출 = 총진료비 · 수납한 날 기준, 하루씩')
  })

  it('AC-4105.3 최근 90일도 하루씩(90칸)이고 칸이 31개를 넘어 dense다', () => {
    const range = statsRange(TODAY, '90d')
    const days = eachDay(span(range.previous.from, range.current.to)).map((date) => day(date))
    const { trend, perVisit } = ready(inputOf({ range, days }))
    expect(trend.buckets).toHaveLength(90)
    expect(trend.buckets.filter((bucket) => bucket.label !== '').map((bucket) => bucket.label)).toEqual(['8.16', '9.6', '9.27', '10.18', '11.8'])
    expect(trend.dense).toBe(true)
    expect(perVisit.dense).toBe(true)
    expect(trend.desc).toBe('매출 = 총진료비 · 수납한 날 기준, 하루씩')
  })

  it('AC-4105.3 고른 기간 일별은 칸 31개까지 dense가 아니고 32개면 dense다', () => {
    const days = eachDay(span('2026-07-01', '2026-10-02')).map((date) => day(date))
    const of = (to: string) => ready(inputOf({ range: pickRange(TODAY, { kind: 'custom', unit: 'day', from: '2026-09-01', to }, false), days })).trend
    expect(of('2026-10-01').buckets).toHaveLength(31)
    expect(of('2026-10-01').dense).toBe(false)
    expect(of('2026-10-02').buckets).toHaveLength(32)
    expect(of('2026-10-02').dense).toBe(true)
  })

  it('AC-4105.3 최근 12개월은 한 달씩이고 끝나지 않은 달은 partial, 아래 글에 빗금 문장이 더해진다', () => {
    const range = statsRange(TODAY, '12m')
    const days = eachDay(span('2025-12-01', '2026-11-13')).map((date) => paid(date, 1_100_000))
    const { trend, split } = ready(inputOf({ range, days }))
    expect(trend.buckets).toHaveLength(12)
    expect(trend.buckets[0]).toEqual({ key: '2025-12', label: '12월', rangeLabel: '2025년 12월', state: 'complete', values: [3410] })
    expect(trend.buckets[2]).toMatchObject({ key: '2026-02', label: '2월', values: [3080] })
    expect(trend.buckets.at(-1)).toEqual({ key: '2026-11', label: '11월', rangeLabel: '2026년 11월', state: 'partial', values: [1430] })
    expect(trend.desc).toBe('매출 = 총진료비 · 수납한 날 기준, 한 달씩')
    expect(trend.note).toBe('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지).')
    expect(split.chart?.title).toBe('달마다 급여·비급여·기타')
    expect(split.chart?.columns.at(-1)).toMatchObject({ month: '2026-11', label: '11월', partial: true })
  })

  it('AC-4105.3 고른 기간 주별은 월–일 칸을 기간으로 자르고(잘린 칸 partial) 확인 필요한 날 금액은 빼고 더한다', () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'week', month: '2026-10' }, false)
    const days = eachDay(span('2026-10-01', '2026-10-31')).map((date) => (isSunday(date) ? restDay(date) : date === '2026-10-07' ? uncheckedDay(date) : day(date)))
    const { trend, split } = ready(inputOf({ range, days }))
    expect(trend.buckets).toEqual([
      { key: '2026-10-01', label: '10.1', rangeLabel: '10월 1일 – 4일', state: 'partial', values: [300] },
      { key: '2026-10-05', label: '10.5', rangeLabel: '10월 5일 – 11일', state: 'complete', values: [500] },
      { key: '2026-10-12', label: '10.12', rangeLabel: '10월 12일 – 18일', state: 'complete', values: [600] },
      { key: '2026-10-19', label: '10.19', rangeLabel: '10월 19일 – 25일', state: 'complete', values: [600] },
      { key: '2026-10-26', label: '10.26', rangeLabel: '10월 26일 – 31일', state: 'partial', values: [600] },
    ])
    expect(trend.desc).toBe('매출 = 총진료비 · 수납한 날 기준, 한 주씩')
    expect(trend.note).toBe('확인 필요한 날(10월 7일)은 금액을 합계에 넣지 않았어요.')
    expect(split.chart?.title).toBe('주마다 급여·비급여·기타')
    expect(split.how[1]).toBe('막대는 주마다 아래부터 급여·비급여·기타예요. 확인 필요한 날과 나눔을 못 한 날은 더하지 않아요.')
  })

  it('AC-4105.3 고른 기간 월별(해 고르기)은 달마다이고 저장하지 않은 달은 칸이 없으며 앞으로 올 달은 future 빈 칸이다', () => {
    const range = pickRange(TODAY, { kind: 'year', year: '2026' }, false)
    const days = eachDay(span('2026-10-01', '2026-11-13')).map((date) => day(date))
    const { trend } = ready(inputOf({ range, days }))
    expect(trend.buckets).toEqual([
      { key: '2026-10', label: '10월', rangeLabel: '2026년 10월', state: 'complete', values: [3100] },
      { key: '2026-11', label: '11월', rangeLabel: '2026년 11월', state: 'partial', values: [1300] },
      { key: '2026-12', label: '12월', rangeLabel: '2026년 12월', state: 'partial', values: [0], blank: 'future' },
    ])
    expect(trend.note).toBeNull()
  })
})

// ── 매출 칸 막대의 점선·빗금 (first90 AC-4408.3·AC-4408.4·AC-4408.5) ──

const MAIN_SERIES = [{ name: '매출', tone: 'accent' }]
// 켜짐 막대: 첫 계열이 맨 위다. 참고 금액 조각을 매출 위에 쌓는다
const ROUGH_SERIES = [
  { name: '참고 금액', tone: 'rough' },
  { name: '매출', tone: 'accent' },
]
const DASHED_NOTE = (dates: string) => `점선 칸은 확인 필요한 날(${dates})이에요. 0원이 아니라 금액이 확실하지 않아 합계에서 뺀 날이에요.`
const ROUGH_NOTE = (dates: string) =>
  `빗금 막대는 확인 필요한 날(${dates})의 참고 금액이에요. 원장님별 표와 같은 기준(그날 수납한 줄의 총진료비 합, 환불은 빼기)으로 셌어요. 비트 외래환자경영통계와 조금 다를 수 있어요.`
const bucketOf = (buckets: readonly { key: string }[], key: string) => buckets.find((bucket) => bucket.key === key)
const OCT_WEEKS = pickRange(TODAY, { kind: 'month', unit: 'week', month: '2026-10' }, false)
// 10월(일요일 쉼)에 10월 7일만 확인 필요한 날 · 참고 금액 250만 원
const octRoughDays = () =>
  eachDay(span('2026-10-01', '2026-10-31')).map((date) => (isSunday(date) ? restDay(date) : date === '2026-10-07' ? uncheckedDay(date, { roughTotal: 2_500_000 }) : day(date)))

describe('AC-4408.3 매출 추이·건당 진료비 막대: 꺼짐은 점선 칸, 켜짐은 빗금 막대', () => {
  it('AC-4408.3 꺼짐: 계열은 매출 하나, 범례 `매출` · `확인 필요한 날(뺌)`, 머리 글 꼬리표 없음', () => {
    const { trend, perVisit } = ready(inputOf())
    expect(trend.series).toEqual(MAIN_SERIES)
    expect(trend.legend).toEqual([
      { label: '매출', mark: 'accent' },
      { label: '확인 필요한 날(뺌)', mark: 'unchecked' },
    ])
    expect(trend.tag).toBe(false)
    expect(perVisit.series).toEqual([{ name: '건당 진료비', tone: 'accent' }])
    expect(perVisit.legend).toEqual([
      { label: '건당 진료비', mark: 'accent' },
      { label: '확인 필요한 날(뺌)', mark: 'unchecked' },
    ])
    expect(perVisit.note).toBe(`휴진한 날은 칸이 없어요. ${DASHED_NOTE('10월 28일')}`)
  })

  it('AC-4408.3 확인 필요한 날이 없으면 범례가 없고(지금처럼) 켜짐 막대도 없다', () => {
    const tabs = ready(inputOf({ days: withDays(mockupDays(), { '2026-10-28': day('2026-10-28') }) }))
    expect(tabs.trend.legend).toEqual([])
    expect(tabs.perVisit.legend).toEqual([])
    expect(tabs.rough).toBeNull()
  })

  it('AC-4408.3 참고 금액이 있는 날이 없으면(옛 도우미) 켜짐 막대가 없다(null)', () => {
    expect(ready(inputOf()).rough).toBeNull()
  })

  it('AC-4408.3 켜짐: 참고 금액이 있는 날은 빗금(rough) 막대이고 값 = 참고 금액(만 원 아래 버림), 다른 날은 매출 막대 그대로', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    const trend = tabs.rough!.trend
    expect(trend.series).toEqual(ROUGH_SERIES)
    expect(bucketOf(trend.buckets, '2026-10-28')).toEqual({ key: '2026-10-28', label: '', rangeLabel: '10월 28일', state: 'complete', values: [498, 0] })
    expect(bucketOf(trend.buckets, '2026-10-15')).toEqual({ key: '2026-10-15', label: '10.15', rangeLabel: '10월 15일', state: 'complete', values: [0, 530] })
    expect(trend.buckets.some((bucket) => bucket.mark !== undefined)).toBe(false)
    expect(trend.legend).toEqual([
      { label: '매출', mark: 'accent' },
      { label: '참고 금액(확인 필요한 날)', mark: 'rough' },
    ])
    expect(trend.note).toBe(`휴진한 날은 칸이 없어요. ${ROUGH_NOTE('10월 28일')}`)
    // 꺼짐 막대는 그대로 점선 칸이다
    expect(bucketOf(tabs.trend.buckets, '2026-10-28')).toMatchObject({ mark: 'unchecked' })
    expect(tabs.trend.series).toEqual(MAIN_SERIES)
  })

  it('AC-4408.3 켜짐: 머리 글 `이 기간 매출 {금액} 원`은 참고 금액을 더한 매출이고 `참고 포함` 꼬리표, 비교 기간도 같은 방식이다', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    expect(tabs.rough!.trend.tag).toBe(true)
    expect(tabs.rough!.trend.lead).toEqual({ text: '이 기간 매출', amount: '1억 3,759만 원', rest: '· 지난 30일 1억 3,200만 원' })
    expect(tabs.trend.lead).toEqual({ text: '이 기간 매출', amount: '1억 3,261만 원', rest: '· 지난 30일 1억 3,200만 원' })
    // 지난 30일의 확인 필요한 날 참고 금액도 켜짐에서 더한다: 132,005,000 − 5,077,000 + 10,000,000
    const days = withDays(roughMockupDays(), { '2026-09-16': uncheckedDay('2026-09-16', { visits: 91, roughTotal: 10_000_000 }) })
    expect(ready(inputOf({ days })).rough!.trend.lead.rest).toBe('· 지난 30일 1억 3,692만 원')
  })

  it('AC-4408.3 켜짐: 건당 진료비 막대도 참고 금액 날은 빗금(참고 금액 ÷ 그날 접수, 천 원 아래 버림)이다', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    const perVisit = tabs.rough!.perVisit
    expect(perVisit.series).toEqual([
      { name: '건당 진료비(참고 금액)', tone: 'rough' },
      { name: '건당 진료비', tone: 'accent' },
    ])
    expect(bucketOf(perVisit.buckets, '2026-10-28')).toMatchObject({ values: [52, 0] }) // 4,980,000 ÷ 95 = 52,421
    expect(bucketOf(perVisit.buckets, '2026-10-15')).toMatchObject({ values: [0, 57] })
    expect(perVisit.legend).toEqual([
      { label: '건당 진료비', mark: 'accent' },
      { label: '참고 금액(확인 필요한 날)', mark: 'rough' },
    ])
    expect(perVisit.note).toBe(`휴진한 날은 칸이 없어요. ${ROUGH_NOTE('10월 28일')}`)
    expect(tabs.rough!.trend.desc).toBe(tabs.trend.desc)
  })

  it('AC-4408.3 켜짐: 매출 추이 [어떻게 세나요?] 둘째 문단만 켜짐 글이고 다른 문단은 꺼짐 그대로다', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    const off = tabs.trend.how
    expect(tabs.rough!.trend.how).toEqual([
      off[0],
      "환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 둬요. '참고 금액 포함'을 켜면 참고 금액이 있는 날은 그 금액을 더하고, 없는 날은 빼요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.",
      off[2],
      off[3],
    ])
    expect(off[1]).toBe("환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 두고 그날 금액을 매출에 넣지 않아요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.")
  })

  it('AC-4408.3 켜짐: 건당 진료비 탭 숫자 칸 셋은 매출 요약 켜짐 건당 진료비와 같은 셈(참고 금액 날 금액·접수 더함, 비교 기간도)이고 첫 칸 아래 글에 `참고 금액 포함`', () => {
    const input = inputOf({ days: roughMockupDays() })
    const tabs = ready(input)
    const perVisit = tabs.rough!.perVisit
    expect(perVisit.kpis).toEqual([
      { name: '최근 30일 건당 진료비', value: '57,139원', sub: '매출 ÷ 접수 2,408건 · 참고 금액 포함', tone: 'ink', srText: '' },
      { name: '지난 30일보다', value: '+2.5%', sub: '지난 30일 55,698원', tone: 'up', srText: '늘어남' },
      { name: '최근 30일 접수 건수', value: '2,408건', sub: '지난 30일 2,370건', tone: 'ink', srText: '' },
    ])
    // 한 화면에 같은 이름 두 숫자가 없다: 매출 요약 켜짐 칸과 같은 값·같은 접수 건수
    const cell = cellOf(revenueCells(input, 'in'), 'perVisit')
    expect(perVisit.kpis[0]!.value).toBe(`${cell.value}${cell.unit}`)
    expect(perVisit.kpis[0]!.sub).toBe(`${cell.hint} · 참고 금액 포함`)
    expect(perVisit.kpis[1]!.value).toBe(cell.delta!.text)
    // 꺼짐 탭은 지금 그대로다
    expect(tabs.perVisit.kpis[0]).toEqual({ name: '최근 30일 건당 진료비', value: '57,333원', sub: '매출 ÷ 접수 2,313건', tone: 'ink', srText: '' })
  })

  it('AC-4408.3 켜짐: 건당 진료비 탭 [어떻게 세나요?] 둘째 문단만 켜짐 글이고 설명 줄·첫 문단·안내 줄은 꺼짐 그대로다', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    const perVisit = tabs.rough!.perVisit
    expect([perVisit.desc, perVisit.notice]).toEqual([tabs.perVisit.desc, tabs.perVisit.notice])
    expect(perVisit.how).toEqual([
      tabs.perVisit.how[0],
      '참고 금액 포함을 켜면 참고 금액이 있는 확인 필요한 날은 그 참고 금액과 그날 접수 건수를 더해 나눠요. 참고 금액이 없는 날은 금액과 접수 건수를 함께 빼요.',
    ])
  })

  it('AC-4408.3 켜짐에서도 참고 금액이 없는 확인 필요한 날은 점선 칸이고, 범례·아래 글에 둘 다 있다', () => {
    const days = withDays(roughMockupDays(), { '2026-11-03': uncheckedDay('2026-11-03', { visits: 90 }) })
    const trend = ready(inputOf({ days })).rough!.trend
    expect(bucketOf(trend.buckets, '2026-11-03')).toMatchObject({ values: [0, 0], mark: 'unchecked' })
    expect(bucketOf(trend.buckets, '2026-10-28')).toMatchObject({ values: [498, 0] })
    expect(trend.legend.map((item) => item.label)).toEqual(['매출', '참고 금액(확인 필요한 날)', '확인 필요한 날(뺌)'])
    expect(trend.note).toBe(`휴진한 날은 칸이 없어요. ${ROUGH_NOTE('10월 28일')} ${DASHED_NOTE('11월 3일')}`)
  })

  it('AC-4408.3 주·달 칸: 꺼짐은 지금 글 그대로, 켜짐은 칸 안 참고 금액을 빗금 조각으로 매출 위에 쌓는다(합 = 그 칸 매출)', () => {
    const tabs = ready(inputOf({ range: OCT_WEEKS, days: octRoughDays() }))
    expect(tabs.trend.buckets.map((bucket) => bucket.values)).toEqual([[300], [500], [600], [600], [600]])
    expect(tabs.trend.legend).toEqual([])
    expect(tabs.trend.note).toBe('확인 필요한 날(10월 7일)은 금액을 합계에 넣지 않았어요.')
    const trend = tabs.rough!.trend
    expect(trend.buckets.map((bucket) => bucket.values)).toEqual([
      [0, 300],
      [250, 500],
      [0, 600],
      [0, 600],
      [0, 600],
    ])
    expect(trend.note).toBe(ROUGH_NOTE('10월 7일'))
    expect(trend.legend.map((item) => item.label)).toEqual(['매출', '참고 금액(확인 필요한 날)'])
  })

  it('AC-4408.3 주·달 칸이 모두 확인 필요한 날뿐이면 그 칸도 점선 칸이다(0원 막대·– 아님)', () => {
    const days = eachDay(span('2026-10-01', '2026-10-31')).map((date) => (isSunday(date) ? restDay(date) : date <= '2026-10-03' ? uncheckedDay(date) : day(date)))
    const { trend } = ready(inputOf({ range: OCT_WEEKS, days }))
    expect(trend.buckets[0]).toEqual({ key: '2026-10-01', label: '10.1', rangeLabel: '10월 1일 – 4일', state: 'partial', values: [0], mark: 'unchecked' })
    expect(trend.legend.map((item) => item.label)).toEqual(['매출', '확인 필요한 날(뺌)'])
  })
})

describe('AC-4408.3 음수 참고 금액(환불이 더 많은 날) 막대', () => {
  // 10월 28일(접수 10건) 참고 금액 roughTotal원
  const negativeDays = (roughTotal: number) => withDays(mockupDays(), { '2026-10-28': uncheckedDay('2026-10-28', { visits: 10, roughTotal }) })

  it('AC-4408.3 하루 칸: 값은 0 쪽으로 버리고(−5.2만 → −5) 참고 금액(빗금) 계열에 들며, 칸 글과 부호·크기가 맞는다', () => {
    const { rough } = ready(inputOf({ days: negativeDays(-52_000) }))
    expect(bucketOf(rough!.trend.buckets, '2026-10-28')).toEqual({ key: '2026-10-28', label: '', rangeLabel: '10월 28일', state: 'complete', values: [-5, 0] })
    expect(rough!.trend.tips['2026-10-28']).toBe('10.28(수) 참고 금액 −5만 원 · 확인 필요한 날')
    // 다른 날은 그대로다
    expect(bucketOf(rough!.trend.buckets, '2026-10-15')).toMatchObject({ values: [0, 530] })
  })

  it('AC-4408.3 하루 칸 건당 진료비도 0 쪽으로 버리고(−5,200원 → −5) 참고 금액 계열이다', () => {
    const { rough } = ready(inputOf({ days: negativeDays(-52_000) }))
    expect(bucketOf(rough!.perVisit.buckets, '2026-10-28')).toMatchObject({ values: [-5, 0] })
    expect(rough!.perVisit.tips['2026-10-28']).toBe('10.28(수) 건당 진료비 −5,200원 · 참고 금액 · 확인 필요한 날')
  })

  it('AC-4408.3 만 원·천 원보다 작은 음수는 0이다(−0이 아니다)', () => {
    const { rough } = ready(inputOf({ days: negativeDays(-5_000) }))
    const [roughValue, mainValue] = rough!.trend.buckets.find((bucket) => bucket.key === '2026-10-28')!.values
    expect(Object.is(roughValue, 0) && Object.is(mainValue, 0)).toBe(true)
    expect(rough!.trend.tips['2026-10-28']).toBe('10.28(수) 참고 금액 −5,000원 · 확인 필요한 날')
    const [perRough, perMain] = rough!.perVisit.buckets.find((bucket) => bucket.key === '2026-10-28')!.values
    expect(Object.is(perRough, 0) && Object.is(perMain, 0)).toBe(true) // −500원 → 0
  })

  it('AC-4408.3 확인된 날과 섞인 주 칸은 칸 매출 합(음수를 뺀 값)을 0 쪽으로 버려 매출 계열로 그린다', () => {
    const days = eachDay(span('2026-10-01', '2026-10-31')).map((date) =>
      isSunday(date) ? restDay(date) : date === '2026-10-01' ? uncheckedDay(date, { roughTotal: -2_425_000 }) : date === '2026-10-07' ? uncheckedDay(date, { roughTotal: -520_000 }) : day(date),
    )
    const trend = ready(inputOf({ range: OCT_WEEKS, days })).rough!.trend
    // 10월 1일 – 4일: 2,000,000 − 2,425,000 = −425,000 → −42(아래로 버리면 −43) · 10월 5일 – 11일: 5,000,000 − 520,000 = 4,480,000 → 448
    expect(trend.buckets.map((bucket) => bucket.values)).toEqual([
      [0, -42],
      [0, 448],
      [0, 600],
      [0, 600],
      [0, 600],
    ])
    expect(trend.tips['2026-10-01']).toBe('10월 1일 – 4일 매출 −42만 원 · 참고 −242만 원 포함')
    expect(trend.tips['2026-10-05']).toBe('10월 5일 – 11일 매출 448만 원 · 참고 −52만 원 포함')
  })

  it('AC-4408.3 양수 참고 금액 막대는 지금 그대로다(하루 칸 빗금 · 섞인 칸은 빗금 조각을 매출 위에)', () => {
    expect(bucketOf(ready(inputOf({ days: roughMockupDays() })).rough!.trend.buckets, '2026-10-28')).toMatchObject({ values: [498, 0] })
    expect(ready(inputOf({ range: OCT_WEEKS, days: octRoughDays() })).rough!.trend.buckets[1]).toMatchObject({ values: [250, 500] })
  })
})

describe('AC-4408.3 막대를 누르면 보일 아래 줄 글(tips)', () => {
  it('AC-4408.3 꺼짐: `{m.d}({요일}) 매출 {금액}` · `{m.d}({요일}) 확인 필요한 날 · 금액을 빼고 셌어요`', () => {
    const { trend } = ready(inputOf())
    expect(trend.tips['2026-10-15']).toBe('10.15(목) 매출 530만 원')
    expect(trend.tips['2026-11-13']).toBe('11.13(금) 매출 541만 원')
    expect(trend.tips['2026-10-28']).toBe('10.28(수) 확인 필요한 날 · 금액을 빼고 셌어요')
    expect(Object.keys(trend.tips)).toEqual(trend.buckets.map((bucket) => bucket.key))
  })

  it('AC-4408.3 켜짐: 참고 금액 날은 `{m.d}({요일}) 참고 금액 {금액} · 확인 필요한 날`', () => {
    const { rough } = ready(inputOf({ days: roughMockupDays() }))
    expect(rough!.trend.tips['2026-10-28']).toBe('10.28(수) 참고 금액 498만 원 · 확인 필요한 날')
    expect(rough!.trend.tips['2026-10-15']).toBe('10.15(목) 매출 530만 원')
  })

  it('AC-4408.3 건당 진료비 탭: `{m.d}({요일}) 건당 진료비 {n}원`, 확인 필요한 날은 같은 글, 참고 금액 날은 `· 참고 금액 · 확인 필요한 날`을 붙인다', () => {
    const tabs = ready(inputOf({ days: roughMockupDays() }))
    expect(tabs.perVisit.tips['2026-10-15']).toBe('10.15(목) 건당 진료비 57,608원')
    expect(tabs.perVisit.tips['2026-10-28']).toBe('10.28(수) 확인 필요한 날 · 금액을 빼고 셌어요')
    expect(tabs.rough!.perVisit.tips['2026-10-28']).toBe('10.28(수) 건당 진료비 52,421원 · 참고 금액 · 확인 필요한 날')
  })

  it('AC-4408.3 주·달 칸은 칸 이름(`10월 5일 – 11일`)을 앞에 쓰고, 켜짐에서 참고 금액이 든 칸은 `· 참고 {금액} 포함`을 붙인다', () => {
    const tabs = ready(inputOf({ range: OCT_WEEKS, days: octRoughDays() }))
    expect(tabs.trend.tips['2026-10-05']).toBe('10월 5일 – 11일 매출 500만 원')
    expect(tabs.rough!.trend.tips['2026-10-05']).toBe('10월 5일 – 11일 매출 750만 원 · 참고 250만 원 포함')
    expect(tabs.perVisit.tips['2026-10-05']).toBe('10월 5일 – 11일 건당 진료비 100,000원')
    expect(tabs.rough!.perVisit.tips['2026-10-05']).toBe('10월 5일 – 11일 건당 진료비 125,000원 · 참고 250만 원 포함')
  })
})

describe('AC-4408.4·AC-4408.5 켜짐에도 급여·비급여·기타·치료별 매출은 지금과 같다', () => {
  it('AC-4408.4·AC-4408.5 참고 금액이 있어도 급여·비급여·기타·치료별 매출은 꺼짐 셈 그대로이고, 켜짐 막대는 매출 추이·건당 진료비 둘뿐이다', () => {
    const groups: StatsRxGroup[] = [group('도수치료', ['도수'], 0)]
    const codes = [total('도수', 10, 4_000_000), total('AA100', 5, 1_000_000)]
    const plain = ready(inputOf({ codes, groups }))
    const tabs = ready(inputOf({ days: roughMockupDays(), codes, groups }))
    expect(tabs.split).toEqual(plain.split)
    expect(tabs.treatments).toEqual(plain.treatments)
    expect(Object.keys(tabs.rough!)).toEqual(['trend', 'perVisit', 'outside'])
    expect(tabs.split.desc).toBe('최근 30일 비급여 몫 31.4% · 기타 몫 4.6%')
  })

  it('AC-4408.4 켜짐 두 탭 맨 위 안내(outside): `참고 금액 {금액}(확인 필요한 날 {m}일)은 이 탭에 넣지 않아 합이 총매출과 달라요.`', () => {
    expect(ready(inputOf({ days: roughMockupDays() })).rough!.outside).toBe('참고 금액 498만 원(확인 필요한 날 1일)은 이 탭에 넣지 않아 합이 총매출과 달라요.')
    // {m} = 보는 기간에 참고 금액이 있는 날 수(없는 날·비교 기간 날은 세지 않는다), {금액} = 그 합
    const days = withDays(roughMockupDays(), {
      '2026-11-03': uncheckedDay('2026-11-03', { roughTotal: 1_020_000 }),
      '2026-11-04': uncheckedDay('2026-11-04'),
      '2026-09-16': uncheckedDay('2026-09-16', { roughTotal: 9_000_000 }),
    })
    expect(ready(inputOf({ days })).rough!.outside).toBe('참고 금액 600만 원(확인 필요한 날 2일)은 이 탭에 넣지 않아 합이 총매출과 달라요.')
    const negative = withDays(mockupDays(), { '2026-10-28': uncheckedDay('2026-10-28', { roughTotal: -52_000 }) })
    expect(ready(inputOf({ days: negative })).rough!.outside).toBe('참고 금액 −5만 원(확인 필요한 날 1일)은 이 탭에 넣지 않아 합이 총매출과 달라요.')
  })
})

// ── 급여·비급여·기타 ──────────────────────────────────────

describe('AC-4105.4 급여·비급여·기타', () => {
  it('AC-4105.4 시안: 표 줄 여섯·몫·지난 30일보다, 합계 줄 이름 `합계 · 매출`, 설명·어떻게 세나요?', () => {
    const { split } = ready(inputOf())
    expect(split.desc).toBe('최근 30일 비급여 몫 31.4% · 기타 몫 4.6%')
    expect(split.head).toEqual(['나눔', '최근 30일', '몫', '지난 30일보다'])
    expect(split.notice).toBeNull()
    expect(split.rows).toEqual([
      { name: '급여', kind: 'main', amount: '8,482만 원', share: '63.9%', delta: up('+0.7%'), lastYear: null },
      { name: '공단부담', kind: 'sub', amount: '6,080만 원', share: '45.8%', delta: NONE_DELTA, lastYear: null },
      { name: '본인부담', kind: 'sub', amount: '2,402만 원', share: '18.1%', delta: NONE_DELTA, lastYear: null },
      { name: '비급여', kind: 'main', amount: '4,166만 원', share: '31.4%', delta: up('+0.1%'), lastYear: null },
      { name: '기타', kind: 'main', amount: '613만 원', share: '4.6%', delta: down('−1.7%'), lastYear: null },
      { name: '합계 · 매출', kind: 'sum', amount: '1억 3,261만 원', share: '100%', delta: up('+0.4%'), lastYear: null },
    ])
    expect(split.how).toEqual([
      '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 셋을 더하면 매출이에요.',
      '막대는 날마다 아래부터 급여·비급여·기타예요. 확인 필요한 날과 나눔을 못 한 날은 막대가 없어요.',
    ])
  })

  it('AC-4105.4 그림은 날마다 칸이고 아래부터 급여·비급여·기타, 쉬는 날은 칸이 없고 확인 필요한 날은 겹이 없다', () => {
    const chart = ready(inputOf()).split.chart!
    expect(chart.title).toBe('날마다 급여·비급여·기타')
    expect(chart.legend).toEqual([
      { key: 'other', label: '기타' },
      { key: 'noncovered', label: '비급여' },
      { key: 'covered', label: '급여' },
    ])
    expect(chart.axis).toEqual({
      unit: '(만 원)',
      ticks: [
        { label: '0', bottom: 0 },
        { label: '200', bottom: 25 },
        { label: '400', bottom: 50 },
        { label: '600', bottom: 75 },
        { label: '800', bottom: 100 },
      ],
    })
    expect(chart.columns.map((column) => column.month)).toEqual(eachDay(R30.current).filter((date) => !isSunday(date)))
    expect(chart.columns[0]).toEqual({
      month: '2026-10-15',
      label: '10.15',
      year: '',
      kind: 'other',
      partial: false,
      segments: [
        { key: 'covered', height: 42.37 },
        { key: 'noncovered', height: 20.81 },
        { key: 'other', height: 3.06 },
      ],
    })
    expect(chart.columns.find((column) => column.month === '2026-10-28')?.segments).toBeNull()
    expect(chart.table.caption).toBe('날마다 급여·비급여·기타 (원)')
    expect(chart.table.head).toEqual(['날짜', '급여', '비급여', '기타'])
    expect(chart.table.rows[0]).toEqual(['2026-10-15', '3,390,000원', '1,665,000원', '245,000원'])
    expect(chart.table.rows.find((row) => row[0] === '2026-10-28')).toEqual(['2026-10-28', '–', '–', '–'])
  })

  it('AC-4105.4 나눔을 못 한 날이 있으면 합계 줄 이름이 `합계`이고 비교 칸은 모두 `–`, 안내 줄과 기간 글이 붙는다', () => {
    const { split } = ready(inputOf({ days: withDays(mockupDays(), { '2026-11-03': noSplitDay('2026-11-03', { total: 5_300_000 }) }) }))
    expect(split.notice).toEqual({ lead: '1일(11월 3일)', rest: '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.' })
    expect(split.rows.at(-1)).toMatchObject({ name: '합계', kind: 'sum', share: '100%' })
    expect(split.rows.map((row) => row.delta)).toEqual(Array(6).fill(NONE_DELTA))
    expect(split.how[0]).toBe(
      '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 이 기간은 나눔을 못 한 날이 빠져서 셋을 더해도 매출보다 작아요. 막대도 나눔이 있는 날만 더해요.',
    )
    expect(split.chart?.columns.find((column) => column.month === '2026-11-03')?.segments).toBeNull()
  })

  it('AC-4105.4 나눔이 하루도 없으면 설명은 `자료 없음`, 표는 `–`, 그림이 없고 기간 글(기본값 19)이다', () => {
    const days = mockupDays().map((row) => (row.unconfirmed || row.total === 0 ? row : noSplitDay(row.date)))
    const { split } = ready(inputOf({ days }))
    expect(split.desc).toBe('자료 없음')
    expect(split.rows.map((row) => [row.name, row.amount, row.share])).toEqual([
      ['급여', '–', '–'],
      ['공단부담', '–', '–'],
      ['본인부담', '–', '–'],
      ['비급여', '–', '–'],
      ['기타', '–', '–'],
      ['합계', '–', '–'],
    ])
    expect(split.chart).toBeNull()
    expect(split.how).toEqual(['자료 없음. 이 기간은 쉬는 날 말고는 모두 나눔을 못 해서 숫자를 지어 넣지 않았어요. 매출 추이와 건당 진료비 탭은 그대로 볼 수 있어요.'])
    expect(split.notice?.lead).toMatch(/^25일\(/)
  })

  it('AC-4105.4 작년 비교가 있는 고른 기간은 머리에 `작년 같은 때보다` 칸이 더해지고 줄마다 작년 증감이 있다', () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-10' }, false)
    const days = [
      ...eachDay(span('2025-10-01', '2025-10-31')).map((date) => paid(date, 1_240_000)),
      ...eachDay(span('2026-09-01', '2026-09-30')).map((date) => paid(date, 900_000)),
      ...eachDay(span('2026-10-01', '2026-10-31')).map((date) => paid(date, 1_000_000)),
    ]
    const { split } = ready(inputOf({ range, days }))
    expect(split.desc).toBe('2026년 10월 비급여 몫 25.0% · 기타 몫 5.0%')
    expect(split.head).toEqual(['나눔', '2026년 10월', '몫', '9월보다', '작년 같은 때보다'])
    expect(split.rows.map((row) => [row.name, row.delta, row.lastYear])).toEqual([
      ['급여', up('+20.5%'), down('−25.5%')],
      ['공단부담', NONE_DELTA, NONE_DELTA],
      ['본인부담', NONE_DELTA, NONE_DELTA],
      ['비급여', up('+3.3%'), { dir: 'flat', text: '변화 없음', srText: '' }],
      ['기타', up('+3.3%'), { dir: 'flat', text: '변화 없음', srText: '' }],
      ['합계 · 매출', up('+14.8%'), down('−19.3%')],
    ])
  })
})

// ── 치료별 매출 ───────────────────────────────────────────

const total = (code: string, count: number, amount: number, missing = false) => ({ code, count, amount, missing })
const group = (name: string, codes: string[], sortOrder: number, extra: Partial<StatsRxGroup> = {}): StatsRxGroup => ({ id: `g${sortOrder}`, name, codes, sortOrder, ...extra })

describe('AC-4105.5 치료별 매출', () => {
  const groups: StatsRxGroup[] = [
    group('도수치료', ['도수'], 0, { out: ['MM101'], cond: [{ code: '도수', unless: ['ESWT1'] }] }), // 빼는 처방·조건은 쓰지 않는다
    group('물리치료', ['mm101', 'MM102'], 1),
    group('체외충격파', ['ESWT1'], 2),
    group('초음파', ['SONO1'], 3),
    group('냉동치료', ['CRYO'], 4),
    group('주사', ['eswt1'], 5), // 앞 묶음에 이미 든 코드
  ]
  const codes = [
    total('도수', 471, 40_000_000),
    total('MM101', 4_000, 20_000_000),
    total('mm102', 302, 5_000_000, true),
    total('ESWT1', 296, 15_000_000),
    total('SONO1', 5, 0, true),
    total('AA100', 50, 19_000_000),
    total('_REST', 10, 1_000_000),
  ]

  it('AC-4105.5 묶음마다 넣는 처방(대소문자 무시)만 더하고, 한 코드는 첫 묶음에서만, 그 밖 처방은 맨 뒤 · 줄 끝은 `처방 n번`', () => {
    const { treatments } = ready(inputOf({ codes, groups }))
    expect(treatments.state).toBe('rows')
    expect(treatments.lead).toEqual({ text: '이 기간 처방 금액', amount: '1억 원', rest: '· 묶음은 처방 칸의 묶음 그대로예요' })
    expect(treatments.rows).toEqual([
      { name: '도수치료', amount: '4,000만 원', share: '40.0%', detail: '처방 471번', width: 100, rest: false, missing: false },
      { name: '물리치료', amount: '2,500만 원', share: '25.0%', detail: '처방 4,302번', width: 62.5, rest: false, missing: true },
      { name: '체외충격파', amount: '1,500만 원', share: '15.0%', detail: '처방 296번', width: 37.5, rest: false, missing: false },
      { name: '초음파', amount: '–', share: '–', detail: '처방 5번', width: 0, rest: false, missing: true },
      { name: '그 밖 처방', amount: '2,000만 원', share: '20.0%', detail: '진찰료·약·검사 등', width: 50, rest: true, missing: false },
    ])
    expect(treatments.notice).toBeNull()
    expect(treatments.lines).toEqual([])
  })

  it('AC-4105.5 설명·어떻게 세나요?(시안 글 그대로, 기본값 2)이고 [묶음 고치기]·제안 칩 자리가 없다', () => {
    const { treatments } = ready(inputOf({ codes, groups }))
    expect(treatments.desc).toBe('최근 30일 · 처방한 날 기준 · 처방 칸의 묶음으로 세요')
    expect(treatments.how).toEqual([
      "처방 금액(단가 × 수량 × 일수)으로 세요. 처방한 날 기준이고 환불·할인이 빠지지 않아 매출과 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
      '묶음은 처방 칸 [묶음 고치기]에서 고쳐요. 처방 하나는 한 묶음에만 들어가서 금액을 두 번 세지 않아요. 묶음의 빼는 처방·조건은 매출에는 쓰지 않아요(넣는 처방 금액을 모두 더해요).',
      "'처방 n번'은 그 기간에 그 묶음 처방을 낸 횟수예요. 처방 칸의 '건'(같은 날 같은 환자는 1건)과 세는 법이 달라요.",
    ])
    expect(treatments).not.toHaveProperty('chip')
    expect(treatments).not.toHaveProperty('editLabel')
  })

  it('AC-4105.5 저장 안 한 제안 묶음(id null)도 같은 셈이다', () => {
    const suggested: RxGroup[] = [{ id: null, name: '체외충격파', codes: ['ESWT1'], sortOrder: 0 }]
    expect(ready(inputOf({ codes: [total('ESWT1', 3, 300_000)], groups: suggested })).treatments.rows.map((row) => [row.name, row.amount])).toEqual([['체외충격파', '30만 원']])
  })

  it('AC-4105.5 보는 기간에 통째로 든 달 가운데 날 단위 처방 금액이 하루도 없는 달은 옛 달 합계로 센다', () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-09' }, false)
    const days = eachDay(span('2026-09-01', '2026-09-30')).map((date) => (isSunday(date) ? restDay(date, { dayCodes: false }) : day(date, { dayCodes: false })))
    const monthCodes = [
      { month: '2026-09', code: 'MM101', name: null, count: 30, amount: 3_000_000 },
      { month: '2026-09', code: 'AA100', name: null, count: 5, amount: 1_000_000 },
      { month: '2026-08', code: 'MM101', name: null, count: 999, amount: 99_000_000 }, // 보는 기간 밖 달
    ]
    const { treatments } = ready(inputOf({ range, days, monthCodes, groups: [group('물리치료', ['mm101'], 0)] }))
    expect(treatments.rows.map((row) => [row.name, row.amount, row.share, row.detail])).toEqual([
      ['물리치료', '300만 원', '75.0%', '처방 30번'],
      ['그 밖 처방', '100만 원', '25.0%', '진찰료·약·검사 등'],
    ])
    expect(treatments.desc).toBe('2026년 9월 · 처방한 날 기준 · 처방 칸의 묶음으로 세요')
    expect(treatments.notice).toBeNull()
  })

  it('AC-4105.5 그래도 남는 진료한 날은 표에서 빼고 안내 줄이다(통째로 들지 않은 달의 옛 합계는 쓰지 않음, 확인 필요한 날·쉬는 날은 안 셈)', () => {
    const days = mockupDays().map((row) => (['2026-10-20', '2026-10-21', '2026-11-03', '2026-10-28', '2026-10-25'].includes(row.date) ? { ...row, dayCodes: false } : row))
    const monthCodes = [{ month: '2026-10', code: 'MM101', name: null, count: 999, amount: 99_000_000 }]
    const { treatments } = ready(inputOf({ days, monthCodes, codes: [total('MM101', 10, 1_000_000)], groups: [group('물리치료', ['MM101'], 0)] }))
    expect(treatments.rows.map((row) => [row.name, row.amount])).toEqual([['물리치료', '100만 원']])
    expect(treatments.notice).toEqual({ lead: '3일(10월 20일–21일·11월 3일)', rest: '은 치료별로 나눠 저장하지 않아 이 표에서 빠졌어요.' })
  })

  it('AC-4105.5 묶음을 읽는 중이면 `불러오는 중`, 읽기 실패면 `처방별 추세 묶음을 읽지 못했어요` 한 줄이다(기본값 3)', () => {
    const reading = ready(inputOf({ codes, groups: 'reading' })).treatments
    expect(reading).toMatchObject({ state: 'reading', lead: null, rows: [], notice: null, lines: ['불러오는 중'] })
    const failed = ready(inputOf({ codes, groups: 'read-failed' })).treatments
    expect(failed).toMatchObject({ state: 'read-failed', lead: null, rows: [], notice: null, lines: ['처방별 추세 묶음을 읽지 못했어요'] })
  })

  it('AC-4105.5 셀 날이 하나도 없으면 `자료 없음 · 새 도우미로 …` 한 줄, 도우미 예전 판 표시면 두 줄이다', () => {
    const days = mockupDays().map((row) => ({ ...row, dayCodes: false }))
    const none = ready(inputOf({ days, groups })).treatments
    expect(none).toMatchObject({ state: 'none', lead: null, rows: [], notice: null, lines: ['자료 없음 · 새 도우미로 [비트에서 불러오기]를 하면 이 기간의 치료별 매출이 채워져요.'] })
    expect(ready(inputOf({ days, groups, noDayCodes: true })).treatments.lines).toEqual([
      '자료 없음 · 새 도우미로 [비트에서 불러오기]를 하면 이 기간의 치료별 매출이 채워져요.',
      '치료별 매출은 날마다 나눠 저장한 날부터 볼 수 있어요. 지금 도우미는 달 합계만 읽어요.',
    ])
  })

  it('AC-4105.5 금액·건수가 모두 0인 묶음만 있으면 셀 줄이 없어 `자료 없음` 줄이다', () => {
    const { treatments } = ready(inputOf({ codes: [total('CRYO', 0, 0)], groups }))
    expect(treatments.state).toBe('none')
  })
})

// ── 탭 설명·글 ───────────────────────────────────────────

describe('AC-4105.1 탭 설명 넷 · 매출 추이 첫 줄 · 건당 진료비 탭', () => {
  it('AC-4105.1 탭 설명 넷은 시안 글 그대로다', () => {
    const tabs = ready(inputOf())
    expect([tabs.trend.desc, tabs.split.desc, tabs.treatments.desc, tabs.perVisit.desc]).toEqual([
      '매출 = 총진료비 · 수납한 날 기준, 하루씩',
      '최근 30일 비급여 몫 31.4% · 기타 몫 4.6%',
      '최근 30일 · 처방한 날 기준 · 처방 칸의 묶음으로 세요',
      '접수 한 건 기준 · 접수취소는 세지 않아요',
    ])
  })

  it('AC-4105.1 매출 추이 첫 줄과 [어떻게 세나요?] 네 문단(시안 글 그대로)', () => {
    const { trend } = ready(inputOf())
    expect(trend.lead).toEqual({ text: '이 기간 매출', amount: '1억 3,261만 원', rest: '· 지난 30일 1억 3,200만 원' })
    expect(trend.how).toEqual([
      '매출은 수납한 날(회계일)의 총진료비예요. 총진료비 = 공단부담 + 본인부담 + 비급여 + 기타이고, 그날 정상 수납한 것과 미수금으로 들어온 것을 더해요.',
      "환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 두고 그날 금액을 매출에 넣지 않아요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.",
      "그래서 아래 '원장님별'의 매출 합계(그런 날도 더해요)나 '원장님 보고 문장'의 총진료비(그런 날이 든 날·달은 '확인 필요')와 다를 수 있어요.",
      '막대 칸은 환자 수 추이와 같아요: 최근 7일·30일·90일은 하루씩, 최근 12개월은 한 달씩, 기간 골라 보기는 고른 단위(일별·주별·월별)예요.',
    ])
  })

  it('AC-4105.1 건당 진료비 탭: 숫자 칸 셋(시안 숫자) · [어떻게 세나요?] 두 문단(기본값 1 `건당 진료비`)', () => {
    const { perVisit } = ready(inputOf())
    expect(perVisit.kpis).toEqual([
      { name: '최근 30일 건당 진료비', value: '57,333원', sub: '매출 ÷ 접수 2,313건', tone: 'ink', srText: '' },
      { name: '지난 30일보다', value: '+2.9%', sub: '지난 30일 55,698원', tone: 'up', srText: '늘어남' },
      { name: '최근 30일 접수 건수', value: '2,408건', sub: '지난 30일 2,370건', tone: 'ink', srText: '' },
    ])
    expect(perVisit.notice).toBeNull()
    expect(perVisit.how).toEqual([
      '매출을 그 기간의 접수 건수로 나눠요. 같은 분이 다섯 번 오면 다섯 건으로 세요. 원장님 보고 문장의 건당진료비와 같은 식이고, 원 아래는 버려요.',
      "확인 필요한 날은 금액을 알 수 없어서 그날 접수 건수도 함께 빼고 나눠요. 그래서 '원장님별'의 건당 진료비(그런 날도 더해요)와 조금 다를 수 있어요.",
    ])
  })

  it('AC-4105.1 접수 건수를 확인 못 한 날이 있으면 건당 진료비 탭에 안내 줄이 있다', () => {
    const days = withDays(mockupDays(), { '2026-10-20': day('2026-10-20', { visits: null }), '2026-10-21': day('2026-10-21', { visits: null }) })
    expect(ready(inputOf({ days })).perVisit.notice).toEqual({ lead: '2일(10월 20일–21일)', rest: '은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.' })
  })

  it('AC-4105.1 보는 기간에 저장된 매출이 없으면(모두 쉬는 날 포함) 매출 칸은 empty다', () => {
    expect(revenueTabs(inputOf({ days: [] }))).toEqual({ kind: 'empty' })
    expect(revenueTabs(inputOf({ days: withDays(mockupDays(), {}).filter((row) => row.date < R30.current.from) }))).toEqual({ kind: 'empty' })
    expect(revenueTabs(inputOf({ days: eachDay(R30.current).map((date) => restDay(date)) }))).toEqual({ kind: 'empty' })
  })

  it('AC-4105.1·AC-4408.2 보는 기간 끝은 기간 끝과 마지막 끝난 날 가운데 이른 날이다(마지막 끝난 날 뒤의 줄은 세지 않음)', () => {
    const days = [...eachDay(span('2026-11-01', '2026-11-14')).map((date) => day(date))]
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, true) // 11월 1일 – 14일(오늘 진료 끝)
    expect(cellOf(revenueCells(inputOf({ range, lastDay: '2026-11-13', days })), 'total')).toMatchObject({ value: '1,300만', notes: ['진료한 날 13일 · 하루 평균 100만 원'] })
  })
})

// ── 소스 규칙 ────────────────────────────────────────────

describe('AC-4105.6 소스 규칙', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/revenueView.ts'), 'utf8')

  it('AC-4105.6 네트워크·저장소·화면 라이브러리·통로·서버를 쓰지 않는다', () => {
    expect(source).not.toMatch(/react|supabase|fetch|localStorage|sessionStorage|indexedDB|document\.cookie|console|lib\/bridge|lib\/storage|next\//i)
  })

  it('AC-4105.6 오늘·마지막 끝난 날은 인자로만 받고 날짜 계산은 lib/analytics/dates.ts로만 한다', () => {
    expect(source).not.toMatch(/new Date|Date\.(UTC|now|parse)|todayInKorea|getTime|setDate/)
    expect(source).toMatch(/from '@\/lib\/analytics\/dates'/)
  })

  it('AC-4105.6 매출 숫자는 summary.ts·treatments.ts·money.ts를 불러 쓰고 보기 타입은 components/revenue/types에서 온다', () => {
    expect(source).toMatch(/from '@\/lib\/revenue\/summary'/)
    expect(source).toMatch(/from '@\/lib\/revenue\/treatments'/)
    expect(source).toMatch(/from '@\/components\/revenue\/money'/)
    expect(source).toMatch(/from '@\/components\/revenue\/types'/)
    expect(source).not.toMatch(/components\/revenue\/view/)
  })

  // view.ts는 TASK-8(AC-4110.4)이 지웠다 — 다시 내보내기 확인은 그때 빠졌다
  it('AC-4105.6 보기 타입은 components/revenue/types.ts에 있다(실행 코드 없음)', () => {
    const types = readFileSync(join(process.cwd(), 'src/components/revenue/types.ts'), 'utf8')
    for (const name of ['Tone', 'Kpi', 'DeltaText', 'Notice', 'SrTable', 'LegendItem', 'Axis', 'BarKind', 'Column', 'Chart', 'StackSegment', 'StackColumn', 'StackChart', 'SplitRow', 'TreatmentRow']) {
      expect(types).toMatch(new RegExp(`export type ${name}\\b`))
    }
    expect(types).not.toMatch(/^(?:import|export (?:const|function|class))/m)
  })
})

// ── clinic-profile: 보고 받는 사람 글의 호칭 (REQ-6606 AC-6606.3). 호칭은 통계 틀(StatsSections)이 병원 정보에서 읽어 넘긴다 ──
describe("AC-6606.3 매출 칸 [어떻게 세나요?]의 '원장님 보고 문장'은 호칭을 쓰고 '원장님별'은 그대로다", () => {
  const tabsOf = (honorific?: '원장님' | '대표원장님' | '선생님') => {
    const tabs = revenueTabs(inputOf({ days: roughMockupDays() }), honorific)
    if (tabs.kind !== 'ready') throw new Error('ready여야 한다')
    return tabs
  }

  it("AC-6606.3: 호칭 '대표원장님'이면 매출 추이·건당 진료비(꺼짐·켜짐) 글이 '대표원장님 보고 문장'이다", () => {
    const tabs = tabsOf('대표원장님')
    expect(tabs.trend.how[2]).toBe("그래서 아래 '원장님별'의 매출 합계(그런 날도 더해요)나 '대표원장님 보고 문장'의 총진료비(그런 날이 든 날·달은 '확인 필요')와 다를 수 있어요.")
    expect(tabs.rough!.trend.how[2]).toBe(tabs.trend.how[2])
    expect(tabs.perVisit.how[0]).toBe('매출을 그 기간의 접수 건수로 나눠요. 같은 분이 다섯 번 오면 다섯 건으로 세요. 대표원장님 보고 문장의 건당진료비와 같은 식이고, 원 아래는 버려요.')
    expect(tabs.rough!.perVisit.how[0]).toBe(tabs.perVisit.how[0])
    expect(tabs.perVisit.how[1]).toContain("'원장님별'의 건당 진료비")
  })

  it("AC-6606.3: 호칭 '선생님'이면 '선생님 보고 문장'이고, 주지 않으면 지금처럼 '원장님 보고 문장'이다", () => {
    expect(tabsOf('선생님').perVisit.how[0]).toContain('선생님 보고 문장의 건당진료비')
    expect(tabsOf().perVisit.how[0]).toContain('원장님 보고 문장의 건당진료비')
    expect(tabsOf().trend.how).toEqual(tabsOf('원장님').trend.how)
  })
})
