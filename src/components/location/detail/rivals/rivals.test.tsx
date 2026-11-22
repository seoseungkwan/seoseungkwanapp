// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Got, Rival, SnapshotValue } from '@/types/location'
import { HoursSection } from './HoursSection'
import { PriceSection } from './PriceSection'
import { RivalsSection } from './RivalsSection'
import { gapSummary, weekText } from './text'

// 후보 자세히 — 경쟁 의원 · 경쟁 의원 진료비 · 진료 시간 빈틈 (spec location REQ-7909 AC-7909.3, design.md 6·11·14절,
// 승인된 시안 docs/mockups/location ?s=candidate 의 sec-comp·sec-price·sec-hours, 글은 requirements '화면 글 기본값' 먼저).
// 부품은 props·콜백만 받는다. 한의원은 경쟁 의원 수·빈틈·진료비에서 빼고 따로 센다

afterEach(cleanup)

type Cell = [number, number] | null
const h = (hhmm: number) => Math.floor(hhmm / 100) * 60 + (hhmm % 100)
const span = (from: number, to: number): [number, number] => [h(from), h(to)]
/** 월~금 같은 시간(over로 요일마다 바꿈) + 토 + 일 + 공휴일 */
const weekOf = (weekday: Cell, sat: Cell = null, sun: Cell = null, over: Record<number, Cell> = {}): Cell[] => {
  const days: Cell[] = [weekday, weekday, weekday, weekday, weekday, sat, sun, null]
  for (const [d, c] of Object.entries(over)) days[Number(d)] = c
  return days
}

const rival = (over: Partial<Rival> & Pick<Rival, 'name' | 'kind' | 'distM'>): Rival => ({
  doctors: 1,
  therapists: null,
  mri: null,
  ct: null,
  openedYear: null,
  sameBuilding: false,
  week: null,
  eswt: null,
  ...over,
})

// 시안 후보 A와 비슷하게 지어낸 둘레 의원(범위 1km). 1,300m 재활의학과는 범위 밖
const RIVALS: Rival[] = [
  rival({ name: '예시가정형외과', kind: 'ortho', distM: 20, sameBuilding: true, doctors: 2, therapists: 4, mri: true, ct: false, openedYear: 2021,
    week: weekOf(span(900, 1830), span(900, 1300), null, { 2: span(900, 2000) }), eswt: 90000 }),
  rival({ name: '예시나정형외과', kind: 'ortho', distM: 350, doctors: 1, therapists: 3, mri: false, ct: false, openedYear: 2026,
    week: weekOf(span(900, 1800), span(900, 1300)), eswt: 70000 }),
  rival({ name: '예시다한의원', kind: 'korean', distM: 400, doctors: 1, therapists: null, openedYear: 2018,
    week: weekOf(span(930, 1900), span(930, 1500), null, { 1: span(930, 2100), 4: span(930, 2100) }), eswt: 30000 }),
  rival({ name: '예시라마취통증의학과', kind: 'pain', distM: 600, doctors: 1, therapists: 2, mri: false, ct: false, openedYear: 2019,
    week: weekOf(span(900, 1800), span(900, 1400), null, { 0: span(900, 2000), 3: span(900, 2000) }), eswt: 60000 }),
  rival({ name: '예시마정형외과', kind: 'ortho', distM: 850, doctors: 3, therapists: 6, mri: true, ct: true, openedYear: 2015,
    week: weekOf(span(830, 1800), span(830, 1300)), eswt: 100000 }),
  rival({ name: '예시바재활의학과', kind: 'rehab', distM: 1300, doctors: 2, therapists: 5, openedYear: 2025,
    week: weekOf(span(700, 2300), span(700, 2300), span(700, 2300)), eswt: 200000 }),
  rival({ name: '예시사정형외과', kind: 'ortho', distM: 900, doctors: null, therapists: null, mri: null, ct: null, openedYear: null, week: null, eswt: null }),
]

const okRivals: Got<Rival[]> = { ok: true, v: RIVALS, src: 'hosp-list', asOf: '2026-11-15' }
const HISTORY: SnapshotValue<'history'> = [
  { kind: 'close', name: '예시자정형외과', dept: '정형외과', on: '2025-05-12', distM: 700 },
  { kind: 'open', name: '예시나정형외과', dept: '정형외과', on: '2026-11-03', distM: 350 },
  { kind: 'close', name: '예시차의원', dept: '재활의학과', on: '2024-02-01', distM: 1500 },
]
const okHistory: Got<SnapshotValue<'history'>> = { ok: true, v: HISTORY, src: 'clinic-license', asOf: '2026-11-14' }
const okPeople: Got<{ total: number }> = { ok: true, v: { total: 48210 }, src: 'pop-age', asOf: '2026-10-31' }

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const section = (id: string) => document.getElementById(id) as HTMLElement
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => text(c))

function rivals(over: Partial<Parameters<typeof RivalsSection>[0]> = {}) {
  return render(<RivalsSection radiusM={1000} rivals={okRivals} history={okHistory} people={okPeople} {...over} />)
}

describe('AC-7909.3: 경쟁 의원 묶음 — 과목 셋 수와 한의원 따로', () => {
  it('AC-7909.3: 머리는 `경쟁 의원 {수}`(한의원 뺌) · `범위 {거리} 안 · 한의원은 따로 세요`', () => {
    rivals()
    const head = screen.getByRole('heading', { name: /경쟁 의원/ })
    expect(text(head)).toBe('경쟁 의원 5')
    expect(text(section('sec-comp'))).toContain('범위 1km 안 · 한의원은 따로 세요')
  })

  it('AC-7909.3: 과목마다 수 — 정형외과·마취통증의학과·재활의학과 셋과 한의원은 따로, 1곳당 사는 사람은 셋으로만 나눈다(버림)', () => {
    rivals()
    expect(text(screen.getByTestId('rival-counts'))).toBe(
      '정형외과 4 · 마취통증의학과 1 · 재활의학과 0 · 한의원 1 → 정형외과·통증·재활 1곳당 사는 사람 9,642명',
    )
  })

  it('AC-7909.3: 범위 밖(거리 > 범위) 의원은 세지도 그리지도 않는다', () => {
    rivals()
    expect(screen.queryByText('예시바재활의학과')).toBeNull()
    rivals({ radiusM: 1500 })
    expect(screen.getAllByText('예시바재활의학과').length).toBeGreaterThan(0)
  })

  it('AC-7909.3: 경쟁 의원이 없으면 `범위 안에 정형외과·통증·재활 의원이 없어요`', () => {
    rivals({ rivals: { ...okRivals, v: [RIVALS[2]!] } })
    expect(text(screen.getByTestId('rival-counts'))).toBe(
      '정형외과 0 · 마취통증의학과 0 · 재활의학과 0 · 한의원 1 → 범위 안에 정형외과·통증·재활 의원이 없어요',
    )
  })

  it('AC-7909.3: 사는 사람을 못 받았으면 1곳당 사는 사람 글을 뺀다', () => {
    rivals({ people: { ok: false, why: 'failed', src: 'pop-age' } })
    expect(text(screen.getByTestId('rival-counts'))).toBe('정형외과 4 · 마취통증의학과 1 · 재활의학과 0 · 한의원 1')
  })
})

describe('AC-7909.3: 경쟁 의원 표 — 의사·물리치료사·장비·문 연 해·같은 건물·진료 시간', () => {
  it('AC-7909.3: 머리 칸은 시안 그대로 의원·과목·거리·의사·물리치료사·장비·문 연 해·진료 시간이고 가까운 차례다', () => {
    rivals()
    const table = within(section('sec-comp')).getAllByRole('table')[0]!
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual([
      '의원', '과목', '거리', '의사', '물리치료사', '장비', '문 연 해', '진료 시간',
    ])
    expect(bodyRows(table).map((r) => cellsOf(r)[0])).toEqual([
      '예시가정형외과', '예시나정형외과', '예시다한의원', '예시라마취통증의학과', '예시마정형외과', '예시사정형외과',
    ])
  })

  it('AC-7909.3: 같은 건물이면 거리 칸에 `같은 건물`, 물리치료사가 없으면 `자료 없음`, 장비는 MRI·CT 표', () => {
    rivals()
    const table = within(section('sec-comp')).getAllByRole('table')[0]!
    const [first, second, korean, , fifth, unknown] = bodyRows(table)
    expect(cellsOf(first!)).toEqual(['예시가정형외과', '정형외과', '같은 건물', '2명', '4명', 'MRI', '2021년', '평일 9~18:30 · 수 ~20시 · 토 9~13시'])
    expect(cellsOf(second!)).toEqual(['예시나정형외과', '정형외과', '350m', '1명', '3명', '–', '2026년', '평일 9~18시 · 토 9~13시'])
    expect(cellsOf(korean!)).toEqual(['예시다한의원', '한의원', '400m', '1명', '자료 없음', '자료 없음', '2018년', '평일 9:30~19시 · 화·금 ~21시 · 토 9:30~15시'])
    expect(cellsOf(fifth!).slice(5, 6)).toEqual(['MRICT'])
    expect(within(fifth!).getAllByText(/^(MRI|CT)$/).map((e) => e.textContent)).toEqual(['MRI', 'CT'])
    expect(cellsOf(unknown!)).toEqual(['예시사정형외과', '정형외과', '900m', '–', '자료 없음', '자료 없음', '–', '자료 없음'])
  })

  it('AC-7909.3: 과목 거르기 — [전체]·과목 넷 단추에 수가 붙고, 누르면 그 과목만 보인다(한의원도 따로 고름)', () => {
    rivals()
    const group = screen.getByRole('group', { name: '과목 거르기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => text(b))).toEqual(['전체 6', '정형외과 4', '마취통증의학과 1', '재활의학과 0', '한의원 1'])
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(buttons[4]!)
    expect(buttons[4]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false')
    const table = within(section('sec-comp')).getAllByRole('table')[0]!
    expect(bodyRows(table).map((r) => cellsOf(r)[0])).toEqual(['예시다한의원'])
    fireEvent.click(buttons[3]!)
    expect(within(section('sec-comp')).getByText('이 과목 의원이 범위 안에 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 출처 줄 셋 — 의원·과목·의사 수·문 연 해 / MRI·CT·물리치료사 / 진료 시간, 기준 날짜와 함께', () => {
    const onOpenSource = vi.fn()
    rivals({ onOpenSource })
    const links = within(section('sec-comp')).getAllByRole('link').map((a) => text(a))
    expect(links).toEqual(
      expect.arrayContaining([
        '건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목·의사 수·문 연 해',
        '건강보험심사평가원 의료기관별상세정보서비스 · 기준 2026년 11월 15일 · MRI·CT·물리치료사',
        '국립중앙의료원 전국 병·의원 찾기 서비스 · 기준 2026년 11월 15일 · 진료 시간',
      ]),
    )
    fireEvent.click(within(section('sec-comp')).getByRole('link', { name: /MRI·CT·물리치료사/ }))
    expect(onOpenSource).toHaveBeenCalledWith('hosp-detail')
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 그 자리에 `지금 받지 못했어요.` [다시 받기]', () => {
    const onRetry = vi.fn()
    rivals({ rivals: { ok: false, why: 'failed', src: 'hosp-list' }, onRetry })
    const sec = section('sec-comp')
    expect(within(sec).getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(within(sec).queryAllByRole('table').length).toBe(1) // 3년 개폐업 표만
    fireEvent.click(within(sec).getAllByRole('button', { name: '다시 받기' })[0]!)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7909.3: 못 받았지만 지난 값이 있으면 지난 값을 그리고 `지난 값 · 기준 {날짜}`를 붙인다', () => {
    rivals({ rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: RIVALS.slice(0, 2), asOf: '2026-10-01' } } })
    const sec = section('sec-comp')
    expect(text(screen.getByRole('heading', { name: /경쟁 의원/ }))).toBe('경쟁 의원 2')
    expect(within(sec).getByText('지난 값 · 기준 2026년 10월 1일')).toBeTruthy()
    expect(within(sec).getByRole('link', { name: /병원정보서비스 · 기준 2026년 10월 1일/ })).toBeTruthy()
  })
})

describe('AC-7909.3: 3년 개폐업', () => {
  it('AC-7909.3: `3년 사이 문 열고 닫은 곳` · `문 엶 {n} · 문 닫음 {n}`, 표는 새 날짜부터(범위 밖 뺌)', () => {
    rivals()
    const sec = section('sec-comp')
    expect(text(screen.getByTestId('rival-history-head'))).toBe('3년 사이 문 열고 닫은 곳 문 엶 1 · 문 닫음 1')
    const table = within(sec).getAllByRole('table')[1]!
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual(['날짜', '무엇', '의원', '거리'])
    expect(bodyRows(table).map((r) => cellsOf(r))).toEqual([
      ['2026년 11월 3일', '문 엶', '예시나정형외과', '350m'],
      ['2025년 5월 12일', '문 닫음', '예시자정형외과', '700m'],
    ])
    expect(within(sec).getByRole('link', { name: '행정안전부 건강_의원 조회서비스 · 기준 2026년 11월 14일' })).toBeTruthy()
  })

  it('AC-7909.3: 범위 안에 없으면 `범위 안에서 3년 사이 문 열거나 닫은 의원이 없어요.`', () => {
    rivals({ history: { ...okHistory, v: [] } })
    expect(screen.getByText('범위 안에서 3년 사이 문 열거나 닫은 의원이 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 개폐업 자료가 열쇠 없음이면 그 칸만 열쇠 글이고 경쟁 의원 표는 그대로다', () => {
    rivals({ history: { ok: false, why: 'no-key', src: 'clinic-license' } })
    expect(screen.getByText('건강_의원 조회서비스: 열쇠를 넣으면 보여요.')).toBeTruthy()
    expect(screen.getAllByRole('table').length).toBe(1)
  })
})

function price(over: Partial<Parameters<typeof PriceSection>[0]> = {}) {
  return render(<PriceSection radiusM={1000} rivals={okRivals} homeEswt={null} {...over} />)
}

describe('AC-7909.3: 경쟁 의원 진료비 — 체외충격파 최저·최고·평균 vs 지금 의원 값', () => {
  it('AC-7909.3: 머리 `경쟁 의원 진료비` · `건강보험이 안 되는 진료(비급여) · 의원마다 올린 값`과 보기 글 셋', () => {
    price()
    const sec = section('sec-price')
    expect(text(within(sec).getByRole('heading'))).toBe('경쟁 의원 진료비')
    expect(text(sec)).toContain('건강보험이 안 되는 진료(비급여) · 의원마다 올린 값')
    expect(text(sec)).toContain('둘레 의원평균지금 의원 값(개원 준비에 적은 값)')
  })

  it('AC-7909.3: 범위 안 경쟁 의원(한의원 뺌)이 올린 값으로 가장 싼 곳·평균(버림)·가장 비싼 곳, 금액은 wonText', () => {
    price()
    expect(text(screen.getByTestId('price-eswt-head'))).toBe('체외충격파 1회 · 범위 안 4곳')
    expect(text(screen.getByTestId('price-eswt'))).toBe(
      '가장 싼 곳 60,000원 · 평균 80,000원 · 가장 비싼 곳 100,000원 · 지금 의원 값은 개원 준비에서 적어요',
    )
  })

  it('AC-7909.3: 지금 의원 값이 있으면 평균과 견준다(버림 %) — 싸요·비싸요·같아요', () => {
    price({ homeEswt: 72000 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 72,000원 (평균보다 10% 싸요)')
    cleanup()
    price({ homeEswt: 99999 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 99,999원 (평균보다 24% 비싸요)')
    cleanup()
    price({ homeEswt: 80000 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 80,000원 (평균과 같아요)')
  })

  it('AC-7909.3: 지금 의원 값이 없으면 [지금 의원 값은 개원 준비에서 적어요]를 누르면 적기 콜백을 부른다', () => {
    const onWriteHomeEswt = vi.fn()
    price({ onWriteHomeEswt })
    fireEvent.click(screen.getByRole('button', { name: '지금 의원 값은 개원 준비에서 적어요' }))
    expect(onWriteHomeEswt).toHaveBeenCalledTimes(1)
  })

  it('AC-7909.3: 100만 원 넘는 값도 wonText 글자(`120만 원`)', () => {
    const big = [rival({ name: '예시카정형외과', kind: 'ortho', distM: 100, eswt: 1_200_000 })]
    price({ rivals: { ...okRivals, v: big } })
    expect(text(screen.getByTestId('price-eswt'))).toContain('가장 싼 곳 120만 원 · 평균 120만 원 · 가장 비싼 곳 120만 원')
  })

  it('AC-7909.3: 값을 올린 의원이 없으면 `범위 안에 값을 올린 의원이 없어요.`', () => {
    price({ rivals: { ...okRivals, v: [RIVALS[2]!, RIVALS[6]!] } })
    expect(within(section('sec-price')).getByText('범위 안에 값을 올린 의원이 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 도수치료 글 — 값이 없어 `도수치료는 2026년 7월부터 관리급여라 견주지 않아요`, 출처 줄 옆 관리급여 글과 1회 기준 글', () => {
    price()
    const sec = section('sec-price')
    expect(within(sec).getByText('도수치료')).toBeTruthy()
    expect(within(sec).getByText('도수치료는 2026년 7월부터 관리급여라 견주지 않아요')).toBeTruthy()
    expect(within(sec).getByText('도수치료는 2026년 7월부터 관리급여예요. 공개 자료에 값이 있을 때만 보여요.')).toBeTruthy()
    expect(within(sec).getByText('의원마다 1회 기준(시간·부위)이 다를 수 있어요.')).toBeTruthy()
    expect(within(sec).getByRole('link', { name: '건강보험심사평가원 비급여진료비정보조회서비스 · 기준 2026년 11월 15일' })).toBeTruthy()
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 진료비 자리에 까닭 글', () => {
    price({ rivals: { ok: false, why: 'not-applied', src: 'hosp-list' } })
    expect(within(section('sec-price')).getByText("공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요.")).toBeTruthy()
    expect(screen.queryByTestId('price-eswt')).toBeNull()
  })
})

function hours(over: Partial<Parameters<typeof HoursSection>[0]> = {}) {
  return render(<HoursSection radiusM={1000} rivals={okRivals} {...over} />)
}

describe('AC-7909.3: 진료 시간 빈틈 표(design.md 11절 칸)', () => {
  it('AC-7909.3: 머리 `진료 시간 빈틈` · `범위 {거리} 안 정형외과·통증·재활 {n}곳 · 칸 숫자 = 문 연 의원 수`', () => {
    hours()
    const sec = section('sec-hours')
    expect(text(within(sec).getByRole('heading'))).toBe('진료 시간 빈틈')
    expect(text(sec)).toContain('범위 1km 안 정형외과·통증·재활 5곳 · 칸 숫자 = 문 연 의원 수')
  })

  it('AC-7909.3: 요일 7 × 칸 7, 칸마다 문 연 경쟁 의원 수(한의원·범위 밖 뺌), 0이면 `빈틈`', () => {
    hours()
    const table = within(section('sec-hours')).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual(['시간', '월', '화', '수', '목', '금', '토', '일'])
    const rows = bodyRows(table).map((r) => [text(within(r).getByRole('rowheader')), ...cellsOf(r)])
    expect(rows).toEqual([
      ['아침 8~9시', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈'],
      ['오전 9~13시', '4', '4', '4', '4', '4', '4', '빈틈'],
      ['점심 13~14시', '4', '4', '4', '4', '4', '1', '빈틈'],
      ['오후 14~18시', '4', '4', '4', '4', '4', '빈틈', '빈틈'],
      ['저녁 18~19시', '1', '빈틈', '1', '1', '빈틈', '빈틈', '빈틈'],
      ['저녁 19~20시', '1', '빈틈', '1', '1', '빈틈', '빈틈', '빈틈'],
      ['밤 20~21시', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈'],
    ])
  })

  it('AC-7909.3: 빈 시간을 한 줄로 모아 알린다(시안 글)', () => {
    hours()
    expect(text(screen.getByTestId('gap-line'))).toBe(
      '평일 아침 8~9시 · 화·금요일 저녁 19~20시 · 평일 밤 20~21시 · 토요일 오후 · 일요일에 문 연 의원이 없어요. 이 시간에 문을 열면 환자를 모을 수 있어요.',
    )
  })

  it('AC-7909.3: 빈 시간이 없으면 `빈 시간이 없어요. 모든 시간에 문 연 의원이 있어요.`', () => {
    const allDay = rival({ name: '예시타정형외과', kind: 'ortho', distM: 100, week: weekOf(span(700, 2300), span(700, 2300), span(700, 2300)) })
    hours({ rivals: { ...okRivals, v: [allDay] } })
    expect(text(screen.getByTestId('gap-line'))).toBe('빈 시간이 없어요. 모든 시간에 문 연 의원이 있어요.')
  })

  it('AC-7909.3: 점심 쉼 모름 글 — `점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요. 공휴일 진료는 의원마다 그때그때 달라 세지 않아요.`', () => {
    hours()
    expect(
      within(section('sec-hours')).getByText('점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요. 공휴일 진료는 의원마다 그때그때 달라 세지 않아요.'),
    ).toBeTruthy()
    expect(within(section('sec-hours')).getByRole('link', { name: '국립중앙의료원 전국 병·의원 찾기 서비스 · 기준 2026년 11월 15일' })).toBeTruthy()
  })

  it('AC-7909.3: 진료 시간 자료가 없는 경쟁 의원은 세지 않았다고 적는다', () => {
    hours()
    expect(within(section('sec-hours')).getByText('진료 시간 자료가 없는 1곳은 세지 않았어요.')).toBeTruthy()
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 표 대신 까닭 글과 [다시 받기]', () => {
    const onRetry = vi.fn()
    hours({ rivals: { ok: false, why: 'failed', src: 'hosp-list' }, onRetry })
    expect(within(section('sec-hours')).queryByRole('table')).toBeNull()
    fireEvent.click(within(section('sec-hours')).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7909.3: 글 만들기', () => {
  it('AC-7909.3: 진료 시간 글 — 평일 가장 흔한 시간 + 다른 요일(같은 글끼리 묶음) + 토·일, 정각이면 `시`', () => {
    expect(weekText(weekOf(span(900, 1830), span(900, 1300), null, { 2: span(900, 2000) }))).toBe('평일 9~18:30 · 수 ~20시 · 토 9~13시')
    expect(weekText(weekOf(span(1000, 1900), span(1000, 1400), span(1000, 1400)))).toBe('평일 10~19시 · 토·일 10~14시')
    expect(weekText(weekOf(span(900, 1800), null, null, { 2: null, 4: span(1000, 1800) }))).toBe('평일 9~18시 · 수 휴진 · 금 10~18시')
    expect(weekText(weekOf(null, span(900, 1300)))).toBe('토 9~13시')
    expect(weekText(null)).toBeNull()
  })

  it('AC-7909.3: 빈틈 한 줄은 평일 아침·점심·저녁 19~20·밤과 토요일 오후·일요일(오전)만 모은다', () => {
    const none = Array.from({ length: 7 }, () => [1, 1, 1, 1, 1, 1, 1])
    expect(gapSummary(none)).toEqual([])
    const lunch = none.map((r) => [...r])
    lunch[2] = [0, 1, 0, 1, 1, 1, 1]
    expect(gapSummary(lunch)).toEqual(['월·수요일 점심 13~14시'])
  })
})

describe('AC-7909.3: 화면 규칙 — PC 모양 하나 · props·콜백만 · 화면 글에 영어 낱말 없음', () => {
  const DIR = 'src/components/location/detail/rivals'
  const FILES = readdirSync(join(process.cwd(), DIR))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => `${DIR}/${name}`)
  const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
  const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

  it('AC-7909.3: 살펴볼 소스가 있다', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/RivalsSection.tsx`, `${DIR}/PriceSection.tsx`, `${DIR}/HoursSection.tsx`, `${DIR}/text.ts`]))
  })

  it('AC-7909.3: 소스에 화면 폭 앞말이 없고, 그린 화면에도 폭 따라 바뀌는 클래스가 없다', () => {
    const widths = (code: string) => [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)):/g)].map((m) => m[1]!)
    expect(FILES.flatMap((f) => widths(read(f)).map((v) => `${f}: ${v}`))).toEqual([])
    const { container } = render(
      <>
        <RivalsSection radiusM={1000} rivals={okRivals} history={okHistory} people={okPeople} onRetry={() => {}} />
        <PriceSection radiusM={1000} rivals={okRivals} homeEswt={null} onWriteHomeEswt={() => {}} />
        <HoursSection radiusM={1000} rivals={okRivals} />
      </>,
    )
    const classes = Array.from(container.querySelectorAll('[class]')).flatMap((el) => el.getAttribute('class')!.split(/\s+/))
    expect(classes.filter((c) => /(^|:)(max-|min-)?(sm|md|lg|\d*xl):/.test(`${c}`))).toEqual([])
  })

  it('AC-7909.3: 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((f) => banned.test(read(f)))).toEqual([])
  })

  it('AC-7909.3: 색은 토큰만 — 소스에 # 색·rgb()·기본 팔레트 색 이름이 없다', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:bg|text|border|fill|stroke|ring)-(?:red|blue|green|gray|slate|orange|amber|yellow|sky|indigo|white|black)\b/
    expect(FILES.filter((f) => raw.test(read(f)))).toEqual([])
  })

  it('AC-7909.3: 그린 글에 영어 낱말이 없다(MRI·CT·m·km 같은 이름·단위는 된다)', () => {
    const { container } = render(
      <>
        <RivalsSection radiusM={1500} rivals={okRivals} history={okHistory} people={okPeople} />
        <PriceSection radiusM={1500} rivals={okRivals} homeEswt={70000} />
        <HoursSection radiusM={1500} rivals={okRivals} />
      </>,
    )
    // 글 조각(text node)마다 본다 — 옆 칸 글이 붙어 보이지 않게
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const words: string[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) words.push(...(node.textContent!.match(/[A-Za-z]+/g) ?? []))
    expect(words.length).toBeGreaterThan(0) // MRI·CT·km가 그려졌다(빈 검사가 아니다)
    expect(words.filter((w) => !['MRI', 'CT', 'm', 'km'].includes(w))).toEqual([])
  })
})
