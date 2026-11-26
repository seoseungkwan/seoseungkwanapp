// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatsCard } from '@/components/stats/sections/parts'
import { statsRange, type StatsInput } from '@/components/stats/view'
import { eachDay } from '@/lib/analytics/dates'
import type { DayPayload } from '@/types/payload'
import type { UisAgePayload, UisPeriodRow } from '@/types/uisarang'
import { ageShareText, UisAgeSection } from './UisAgeSection'
import type { UisPeriodsView } from './useUisPeriods'

// 통계 탭 의사랑 환자 구성(specs/uisarang-upload AC-8812.3, 시안 docs/mockups/uisarang-upload ?s=stats·?s=stats-gap).
// 글자는 requirements.md '화면 글자' 통계 탭 그대로다. 숫자는 모두 이 파일에서 지어낸 값이다

const TODAY = '2026-11-27' // 금요일
const R7 = statsRange(TODAY, '7d') // 11월 20일 ~ 11월 26일
const CLOSED = '2026-11-22' // 일요일 휴진(덮었고 줄 없음)
const NO_LOWER = '2026-11-23' // 진료했는데 아래쪽 표를 올리지 않은 날
const WORKED = eachDay(R7.current).filter((day) => day !== CLOSED)

const day = (ymd: string, patients = 10): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients, newPatients: 2, returning: patients - 2, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})
const INPUT: StatsInput = { days: WORKED.map((ymd) => day(ymd)), covered: [{ from: '2026-11-01', to: '2026-11-26' }], range: R7 }

const ageRow = (ymd: string): UisPeriodRow<UisAgePayload> => ({
  kind: 'age',
  from: ymd,
  to: ymd,
  payload: { v: 1, patients: 10, newPatients: 2, bands: [0, 1, 1, 1, 1, 2, 2, 1, 1, 0], newBands: [0, 0, 0, 1, 0, 1, 0, 0, 0, 0] },
  updatedAt: '2026-11-26T10:05:00Z',
})
const AGES = WORKED.filter((ymd) => ymd !== NO_LOWER).map(ageRow) // 5일
const ready = (age: UisPeriodRow<UisAgePayload>[] = AGES): UisPeriodsView => ({ state: 'ready', rx: [], age })

const draw = (periods: UisPeriodsView, input: StatsInput = INPUT) =>
  render(
    <StatsCard title="환자">
      <UisAgeSection periods={periods} input={input} />
    </StatsCard>,
  )
const table = () => screen.getByRole('table', { name: '나이대별 내원·신환' })
const cellsOf = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent)
const rows = () => within(table()).getAllByRole('row').map(cellsOf)
const texts = () => [...document.querySelectorAll('p')].map((p) => p.textContent)

afterEach(() => cleanup())

describe('UisAgeSection (AC-8812.3)', () => {
  it('AC-8812.3: 제목 환자 구성 · 옆 글은 아래쪽 표를 올린 날 수다', () => {
    draw(ready())
    expect(screen.getByRole('heading', { level: 3, name: '환자 구성' })).toBeTruthy()
    expect(screen.getByText('내원한 날마다 센 수 · 아래쪽 표를 올린 날 5일')).toBeTruthy()
  })

  it('AC-8812.3: 표 머리 나이대·내원·비율·신환·비율, 줄은 10세 미만~80세 이상 · 생년월일 없음 열 줄이고 값은 건·%·명·%다', () => {
    draw(ready())
    expect(rows()).toEqual([
      ['나이대', '내원', '비율', '신환', '비율'],
      ['10세 미만', '0건', '0.0%', '0명', '0.0%'],
      ['10대', '5건', '10.0%', '0명', '0.0%'],
      ['20대', '5건', '10.0%', '0명', '0.0%'],
      ['30대', '5건', '10.0%', '5명', '50.0%'],
      ['40대', '5건', '10.0%', '0명', '0.0%'],
      ['50대', '10건', '20.0%', '5명', '50.0%'],
      ['60대', '10건', '20.0%', '0명', '0.0%'],
      ['70대', '5건', '10.0%', '0명', '0.0%'],
      ['80세 이상', '5건', '10.0%', '0명', '0.0%'],
      ['생년월일 없음', '0건', '0.0%', '0명', '0.0%'],
    ])
  })

  it('AC-8812.3: 진료한 날 가운데 아래쪽 표가 없는 날이 있으면 표 아래 그 날 수 줄이 있다', () => {
    draw(ready())
    expect(texts()).toContain('아래쪽 표가 없는 진료한 날 1일은 빼고 셌어요.')
  })

  it('AC-8812.3: 진료한 날마다 아래쪽 표가 있으면 빠진 날 줄이 없다', () => {
    draw(ready(WORKED.map(ageRow)))
    expect(screen.getByText('내원한 날마다 센 수 · 아래쪽 표를 올린 날 6일')).toBeTruthy()
    expect(texts().some((text) => text?.includes('아래쪽 표가 없는 진료한 날'))).toBe(false)
  })

  it('AC-8812.3·AC-8812.2: 표 아래 보험·동네 자리에 셀 수 없음 안내(굵은 제목 · 까닭)가 있다', () => {
    draw(ready())
    expect(texts()).toContain('의사랑 엑셀로는 셀 수 없어요 · 아래쪽 표에서는 나이대만 세요.')
    const strong = screen.getAllByText('의사랑 엑셀로는 셀 수 없어요')[0]!
    expect(strong.className).toContain('font-semibold')
  })

  it('AC-8812.3: 저장된 의사랑 숫자를 읽지 못하면 그 자리에 E-UIS-READ-FAILED 오류 카드다', () => {
    draw({ state: 'failed' })
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-UIS-READ-FAILED')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-8812.3: 읽는 동안은 표 없이 불러오는 중이다', () => {
    draw({ state: 'reading' })
    expect(screen.getByText('불러오는 중')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-8812.3: 비율 글은 소수 첫째 자리까지(시안 셈)이고 전체가 0이면 0%다', () => {
    expect(ageShareText(1, 3)).toBe('33.3%')
    expect(ageShareText(2, 3)).toBe('66.7%')
    expect(ageShareText(0, 50)).toBe('0.0%')
    expect(ageShareText(0, 0)).toBe('0%')
  })

  it('AC-8812.3: 새 칸(제목·표·아래 글)에 폰 폭 클래스가 없다(PC 화면만)', () => {
    draw(ready())
    const section = screen.getByRole('heading', { level: 3, name: '환자 구성' }).closest('section')!
    expect(section.outerHTML).not.toMatch(/max-md:|max-sm:/)
  })
})
