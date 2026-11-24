// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompareCard, type SideRowKey } from './CompareCells'
import type { CompareStatsCells } from './statsInput'

// 통계 나란히 보기 작은 칸(spec admin-view REQ-8016 AC-8016.2, 시안 docs/mockups/admin-view ?s=compare-region sideCard).
// 칸 값은 지어낸 숫자다(compareStatsInput이 만드는 모양)

afterEach(cleanup)

const FULL: CompareStatsCells = {
  hasData: true,
  summary: {
    patients: [
      { label: '하루 평균 내원', value: '136', unit: '건' },
      { label: '신환', value: '286', unit: '명' },
      { label: '90일초진', value: '54', unit: '건' },
      { label: '재진', value: '3,072', unit: '건' },
    ],
    revenue: [
      { label: '총매출', value: '1억 3,261만', unit: '원' },
      { label: '건당 진료비', value: '38,866', unit: '원' },
    ],
    alerts: [
      { kind: 'up', rate: '19%', text: '물리치료가 평소보다 많아요' },
      { kind: 'down', rate: '22%', text: '신환이 평소보다 적어요' },
    ],
    goal: { rate: '102.0%', goal: '1억 3,000만 원', width: 100 },
  },
  patients: {
    daily: { columns: [[4, 30], [6, 28], [0, 0], [5, 31]], from: '10월 1일', to: '10월 31일' },
    age: [
      { name: '50대', text: '24.1%', width: 100 },
      { name: '40대', text: '19.0%', width: 78.84 },
      { name: '60대', text: '17.2%', width: 71.37 },
    ],
    revisit: [
      { label: '7일 안', value: '13.1', unit: '%' },
      { label: '14일 안', value: '21.4', unit: '%' },
      { label: '30일 안', value: '31.4', unit: '%' },
    ],
    dropoff: [
      { name: '1번', text: '100.0%', width: 100 },
      { name: '2번', text: '61.2%', width: 61.2 },
      { name: '3번 이상', text: '42.5%', width: 42.5 },
    ],
  },
  revenue: {
    trend: { columns: { columns: [[410], [380], [0], [455]], from: '10월 1일', to: '10월 31일' }, total: '1억 3,261만 원' },
    split: [
      { key: 'covered', name: '급여', share: '65.0%', width: 65 },
      { key: 'noncovered', name: '비급여', share: '25.0%', width: 25 },
      { key: 'other', name: '기타', share: '10.0%', width: 10 },
    ],
  },
  sunap: [
    { label: '신환 예약률', value: '63.4', unit: '%' },
    { label: '90일 예약률', value: '51.2', unit: '%' },
    { label: 'Block 전환', value: '44.3', unit: '%' },
  ],
  calendar: [
    { label: '예약 수', value: '1,204', unit: '건' },
    { label: '취소율', value: '8.1', unit: '%' },
    { label: '변경율', value: '5.4', unit: '%' },
    { label: '안 옴율', value: '3.2', unit: '%' },
  ],
  rx: {
    trend: [
      { name: '물리치료 묶음', text: '1,460건', width: 100 },
      { name: '도수치료', text: '812건', width: 55.61 },
      { name: '체외충격파', text: '344건', width: 23.56 },
    ],
    split: [
      { name: '물리치료 묶음', cells: ['신환 152명', '재진 1,308건'] },
      { name: '도수치료', cells: ['신환 88명', '재진 724건'] },
      { name: '체외충격파', cells: ['신환 31명', '재진 313건'] },
    ],
  },
  ops: {
    doctors: [
      { name: '원장 가', cells: ['640명', '7,425만 원'] },
      { name: '원장 나', cells: ['512명', '5,836만 원'] },
    ],
    hours: { levels: [3, 4, 4, 2, 1, 3, 3, 2, 2, 0], from: '9시', to: '18시' },
    weekdays: { names: ['월', '화', '수', '목', '금', '토'], values: [166, 143, 136, 133, 139, 82] },
    holiday: [
      { name: '공휴일 앞날', cells: ['평소보다 +6%'] },
      { name: '공휴일 다음 날', cells: ['평소보다 +18%'] },
    ],
  },
}

const NAME = '가나 정형외과의원'
const card = (row: SideRowKey, cells: CompareStatsCells = FULL) => {
  const { container } = render(<CompareCard row={row} name={NAME} cells={cells} />)
  return container.firstElementChild as HTMLElement
}
const headings = (el: HTMLElement) => within(el).queryAllByRole('heading', { level: 4 }).map((h) => h.textContent)
const text = (el: HTMLElement) => el.textContent ?? ''

describe('CompareCard — 작은 칸 차례·글 (AC-8016.2)', () => {
  it('AC-8016.2: 요약 줄은 환자 요약 · 매출 요약 · 평소와 다른 것 · 이번 달 목표', () => {
    const el = card('summary')
    expect(el.querySelector('p')?.textContent).toBe(NAME)
    expect(headings(el)).toEqual(['환자 요약', '매출 요약', '평소와 다른 것', '이번 달 목표'])
    expect(text(el)).toContain('하루 평균 내원136건')
    expect(text(el)).toContain('신환286명')
    expect(text(el)).toContain('총매출1억 3,261만원')
    expect(text(el)).toContain('건당 진료비38,866원')
    expect(text(el)).toContain('▲ 19% 물리치료가 평소보다 많아요')
    expect(text(el)).toContain('▼ 22% 신환이 평소보다 적어요')
    expect(text(el)).toContain('102.0% · 목표 1억 3,000만 원')
    expect(within(el).getByText('102.0%').tagName).toBe('B')
  })

  it('AC-8016.2: 환자 줄은 일별 내원 · 환자 구성 · 신환 재방문율 · 몇 번까지 받나', () => {
    const el = card('patients')
    expect(headings(el)).toEqual(['일별 내원', '환자 구성', '신환 재방문율', '몇 번까지 받나'])
    expect(text(el)).toContain('10월 1일10월 31일')
    expect(text(el)).toContain('50대24.1%')
    expect(text(el)).toContain('7일 안13.1%')
    expect(text(el)).toContain('30일 안31.4%')
    expect(text(el)).toContain('1번100.0%')
    expect(text(el)).toContain('3번 이상42.5%')
  })

  it('AC-8016.2: 매출 줄은 매출 추이(합계) · 급여·비급여·기타(띠와 몫)', () => {
    const el = card('revenue')
    expect(headings(el)).toEqual(['매출 추이', '급여·비급여·기타'])
    expect(text(el)).toContain('합계 1억 3,261만 원')
    expect(within(el).getByText('1억 3,261만 원').tagName).toBe('B')
    expect(text(el)).toContain('급여 65.0%')
    expect(text(el)).toContain('비급여 25.0%')
    expect(text(el)).toContain('기타 10.0%')
  })

  it('AC-8016.2: 예약·전환 줄은 이름 없이 숫자 셋 + 수납일지 마감한 날만', () => {
    const el = card('sunap')
    expect(headings(el)).toEqual([])
    expect(text(el)).toBe(`${NAME}신환 예약률63.4%90일 예약률51.2%Block 전환44.3%수납일지 마감한 날만`)
  })

  it('AC-8016.2: 예약 줄은 예약 수 · 취소율 · 변경율 · 안 옴율', () => {
    expect(text(card('calendar'))).toBe(`${NAME}예약 수1,204건취소율8.1%변경율5.4%안 옴율3.2%`)
  })

  it('AC-8016.2: 처방 줄은 처방별 추세 · 처방별 신환·재진', () => {
    const el = card('rx')
    expect(headings(el)).toEqual(['처방별 추세', '처방별 신환·재진'])
    expect(text(el)).toContain('물리치료 묶음1,460건')
    expect(within(el).getByRole('table')).toBeTruthy()
    expect(within(el).getAllByRole('row').map((row) => row.textContent)).toEqual(['물리치료 묶음신환 152명재진 1,308건', '도수치료신환 88명재진 724건', '체외충격파신환 31명재진 313건'])
  })

  it('AC-8016.2: 진료 운영 줄은 원장님별 · 시간대별 접수 · 요일별 내원 · 휴일에 따라', () => {
    const el = card('ops')
    expect(headings(el)).toEqual(['원장님별', '시간대별 접수', '요일별 내원', '휴일에 따라'])
    const rows = within(el).getAllByRole('row').map((row) => row.textContent)
    expect(rows).toEqual(['원장 가640명7,425만 원', '원장 나512명5,836만 원', '공휴일 앞날평소보다 +6%', '공휴일 다음 날평소보다 +18%'])
    expect(text(el)).toContain('9시18시')
    expect(text(el)).toContain('월화수목금토')
  })

  it('AC-8016.2: 그림(막대·띠·열 칸)은 꾸밈이라 화면 읽기에서 뺀다', () => {
    for (const row of ['patients', 'revenue', 'rx', 'ops'] as const) {
      const el = card(row)
      const hidden = el.querySelectorAll('[aria-hidden="true"]')
      expect(hidden.length).toBeGreaterThan(0)
      cleanup()
    }
  })
})

describe('CompareCard — 못 만들 때 글 (AC-8016.2)', () => {
  const blank: CompareStatsCells = {
    hasData: true,
    summary: {
      patients: FULL.summary.patients.map((cell) => ({ ...cell, value: null })),
      revenue: FULL.summary.revenue.map((cell) => ({ ...cell, value: null })),
      alerts: null,
      goal: null,
    },
    patients: { daily: null, age: null, revisit: FULL.patients.revisit.map((cell) => ({ ...cell, value: null })), dropoff: null },
    revenue: { trend: null, split: null },
    sunap: null,
    calendar: null,
    rx: { trend: null, split: null },
    ops: { doctors: null, hours: null, weekdays: null, holiday: null },
  }

  it('AC-8016.2: 값이 없는 숫자는 단위 없이 –, 목표가 없으면 목표를 적지 않았어요', () => {
    const el = card('summary', blank)
    expect(text(el)).toContain('하루 평균 내원–신환–90일초진–재진–')
    expect(text(el)).toContain('총매출–건당 진료비–')
    expect(text(el)).toContain('평소와 다른 것–')
    expect(text(el)).toContain('목표를 적지 않았어요')
  })

  it('AC-8016.2: 평소와 다른 것이 빈 목록이면 평소와 비슷해요', () => {
    expect(text(card('summary', { ...FULL, summary: { ...FULL.summary, alerts: [] } }))).toContain('평소와 다른 것평소와 비슷해요')
  })

  it('AC-8016.2: 자료가 없는 작은 칸은 그 칸만 –', () => {
    expect(text(card('patients', blank))).toBe(`${NAME}일별 내원–환자 구성–신환 재방문율7일 안–14일 안–30일 안–몇 번까지 받나–`)
    cleanup()
    expect(text(card('revenue', blank))).toBe(`${NAME}매출 추이–급여·비급여·기타–`)
    cleanup()
    expect(text(card('rx', blank))).toBe(`${NAME}처방별 추세–처방별 신환·재진–`)
    cleanup()
    expect(text(card('ops', blank))).toBe(`${NAME}원장님별–시간대별 접수–요일별 내원–휴일에 따라–`)
  })

  it('AC-8016.2: 합계 저장 전 달은 몇 번까지 받나·Block 전환만 –', () => {
    const before: CompareStatsCells = {
      ...FULL,
      patients: { ...FULL.patients, dropoff: null },
      sunap: [FULL.sunap![0]!, FULL.sunap![1]!, { label: 'Block 전환', value: null, unit: '%' }],
    }
    expect(text(card('patients', before))).toContain('몇 번까지 받나–')
    expect(text(card('patients', before))).toContain('7일 안13.1%')
    cleanup()
    expect(text(card('sunap', before))).toBe(`${NAME}신환 예약률63.4%90일 예약률51.2%Block 전환–수납일지 마감한 날만`)
  })

  it('AC-8016.2: 마감한 날·예약이 없으면 줄 칸 전체가 그 글', () => {
    expect(text(card('sunap', blank))).toBe(`${NAME}수납일지를 마감한 날이 없어요`)
    cleanup()
    expect(text(card('calendar', blank))).toBe(`${NAME}예약 탭에 적은 예약이 없어요`)
  })

  it('AC-8016.2: 원장님이 한 분이면 원장님이 한 분이라 나누어 볼 것이 없어요.', () => {
    expect(text(card('ops', { ...FULL, ops: { ...FULL.ops, doctors: 'single' } }))).toContain('원장님별원장님이 한 분이라 나누어 볼 것이 없어요.')
  })

  it('AC-8016.2: 그달 자료가 하나도 없으면 줄마다 칸 전체가 자료 없음', () => {
    const none = { ...blank, hasData: false }
    for (const row of ['summary', 'patients', 'revenue', 'sunap', 'calendar', 'rx', 'ops'] as const) {
      expect(text(card(row, none))).toBe(`${NAME}자료 없음`)
      cleanup()
    }
  })

  it('AC-8016.2: 작은 칸에는 단추가 없다(읽기만)', () => {
    for (const row of ['summary', 'patients', 'revenue', 'sunap', 'calendar', 'rx', 'ops'] as const) {
      render(<CompareCard row={row} name={NAME} cells={FULL} />)
    }
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryAllByRole('textbox')).toEqual([])
  })
})
