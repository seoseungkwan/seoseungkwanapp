// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { WideDays } from '@/components/stats/useWideDays'
import type { CalCountRow } from '@/types/calendar'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import { AlertsSection } from './AlertsSection'
import { StatsCard } from './parts'

// 평소와 다른 것 (stats-insights REQ-6101 AC-6101.5, 시안 docs/mockups/stats-insights ①). 일 줄·예약·이름은 지어낸 값이다.
// 오늘 2026-11-18(수) → 이번 주 11-16(월) ~ 11-17(화)

const TODAY = '2026-11-18'
const MON = ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19']
const TUE = ['2026-11-17', '2026-11-10', '2026-11-03', '2026-10-27', '2026-10-20']
const NOTE = '이번 주(월~어제)를 지난 4주의 같은 요일과 견줘요. 15% 넘게 달라지고 평소 수가 10 이상일 때만 보여요.'
const DOSU: StatsRxGroup = { id: 'g1', name: '도수', codes: ['MM101'], sortOrder: 0 }
const EMPTY_GROUP: StatsRxGroup = { id: 'g2', name: '빈 묶음', codes: [], sortOrder: 1 }
const DOSU_KEY = groupKey(DOSU.codes, DOSU)

function day(ymd: string, patients: number, newPatients: number, dosu: number): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
    rx: [],
    groups: [{ id: DOSU_KEY, patients: dosu, newPatients: 0, returning: dosu }],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

// 내원 80 vs 100(20% 적음) · 신환 30 vs 20(50% 많음) · 도수 26 vs 20(30% 많음)
const CHANGED = MON.map((ymd, w) => (w === 0 ? day(ymd, 80, 30, 26) : day(ymd, 100, 20, 20)))
const FLAT = MON.map((ymd) => day(ymd, 100, 20, 20))

function appt(ymd: string, status: CalCountRow['status']): CalCountRow {
  return { day: ymd, staffId: 's1', staffName: '김○○', kindId: 'dosu', kindName: '도수', status, auto: null, origDay: null, gMoved: false }
}
// 도수 예약 안 옴: 이번 주 10건 중 2건(20%) · 앞선 4주 20건 중 2건(10%)
const CAL = [
  ...Array.from({ length: 10 }, (_, i) => appt(i % 2 === 0 ? MON[0]! : TUE[0]!, i < 2 ? 'noshow' : 'came')),
  ...Array.from({ length: 20 }, (_, i) => appt([...MON.slice(1), ...TUE.slice(1)][i % 8]!, i < 2 ? 'noshow' : 'came')),
]

const wide = (days: readonly DayPayload[], state: WideDays['state'] = 'ready', retry = vi.fn()): WideDays => ({ state, days, retry })

type Props = Partial<{ today: string; wide: WideDays; groups: readonly StatsRxGroup[]; cal: readonly CalCountRow[] | null }>
const section = ({ today = TODAY, wide: w = wide(CHANGED), groups = [DOSU, EMPTY_GROUP], cal = CAL }: Props = {}) => (
  <AlertsSection today={today} wide={w} groups={groups} cal={cal} />
)
// 요약 카드 안에 놓는다(TASK-7이 잇는 자리)
const inCard = (props: Props = {}) => (
  <StatsCard id="stats-summary" title="환자 요약">
    {section(props)}
  </StatsCard>
)

const list = () => screen.getByRole('list', { name: '평소와 다른 것' })
const items = () => within(list()).getAllByRole('listitem')
// 줄마다 [표시, 문장, 기간]
const cellsOf = (li: HTMLElement) => [...li.children].map((el) => el.textContent)

afterEach(cleanup)

describe('AC-6101.5 평소와 다른 것 칸', () => {
  it('AC-6101.5: 요약 카드 안에서 h3 "평소와 다른 것" 아래 알림 줄이 차례로(warn 먼저, 비율 큰 차례) 보인다', () => {
    render(inCard())
    expect(screen.getByRole('heading', { level: 3, name: '평소와 다른 것' })).toBeTruthy()
    expect(items().map(cellsOf)).toEqual([
      ['!', '도수 예약 안 옴 · 이번 주 20%, 지난 4주 평균 10%보다 높아요', '11/16~11/17'],
      ['▲', '신환 · 이번 주 30명, 지난 4주 평균 20명보다 50% 많아요', '11/16~11/17'],
      ['▲', '도수 · 이번 주 26건, 지난 4주 평균 20건보다 30% 많아요', '11/16~11/17'],
      ['▼', '내원 · 이번 주 80명, 지난 4주 평균 100명보다 20% 적어요', '11/16~11/17'],
    ])
  })

  it('AC-6101.5: 이름은 굵게, 표시는 종류마다 색(▼ 적음 · ▲ 많음 · ! 주의)이고 표시는 화면 읽기에서 뺀다(문장이 뜻을 말한다)', () => {
    render(inCard())
    const [warn, up, , down] = items()
    expect(within(warn!).getByText('도수 예약 안 옴').className).toContain('font-semibold')
    expect(within(down!).getByText('내원').className).toContain('font-semibold')
    const mark = (li: HTMLElement) => li.firstElementChild as HTMLElement
    expect(mark(warn!).getAttribute('aria-hidden')).toBe('true')
    expect(mark(warn!).className).toContain('text-warning')
    expect(mark(up!).className).toContain('text-positive')
    expect(mark(down!).className).toContain('text-negative')
  })

  it('AC-6101.5: 맨 아래 세는 법 한 줄이 보인다', () => {
    render(inCard())
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('AC-6101.5: 알림이 없으면 "평소와 비슷해요" 한 줄과 세는 법이 보이고 목록은 없다', () => {
    render(inCard({ wide: wide(FLAT), cal: null }))
    expect(screen.getByRole('heading', { level: 3, name: '평소와 다른 것' })).toBeTruthy()
    expect(screen.getByText('평소와 비슷해요')).toBeTruthy()
    expect(screen.getByText(NOTE)).toBeTruthy()
    expect(screen.queryByRole('list', { name: '평소와 다른 것' })).toBeNull()
  })

  it('AC-6101.5: 견줄 날이 하루도 없으면 칸을 그리지 않는다', () => {
    const { container } = render(section({ wide: wide([]), cal: null }))
    expect(container.innerHTML).toBe('')
  })

  it('AC-6101.5: 넓은 하루를 읽는 중이면 칸을 그리지 않는다', () => {
    const { container } = render(section({ wide: wide(CHANGED, 'reading') }))
    expect(container.innerHTML).toBe('')
  })

  it('AC-6101.5: 넓은 하루 읽기에 실패하면 제목 아래 오류 카드와 [다시 읽기]가 보이고 누르면 retry를 부른다', () => {
    const retry = vi.fn()
    render(inCard({ wide: wide([], 'failed', retry) }))
    expect(screen.getByRole('heading', { level: 3, name: '평소와 다른 것' })).toBeTruthy()
    expect(within(screen.getByRole('alert')).getByText('저장된 통계를 읽지 못했어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('AC-6101.5: 기간 고르기와 상관없이 오늘 기준이다(오늘이 월요일이면 지난 월~일)', () => {
    render(inCard({ today: '2026-11-23', cal: null }))
    expect(items().map((li) => li.lastElementChild?.textContent)).toEqual(['11/16~11/22', '11/16~11/22', '11/16~11/22'])
  })

  it('AC-6101.5: 묶음은 처방 칸 묶음(넣는 처방 열쇠)의 이름으로 세고, 처방 없는 묶음은 세지 않는다', () => {
    render(inCard({ cal: null, groups: [{ ...DOSU, name: '도수치료' }, EMPTY_GROUP] }))
    expect(items().map((li) => li.children[1]?.textContent)).toContain('도수치료 · 이번 주 26건, 지난 4주 평균 20건보다 30% 많아요')
    expect(screen.queryByText(/빈 묶음/)).toBeNull()
  })

  it('AC-6101.5: 예약 줄이 없으면(null) 예약 알림 없이 그린다', () => {
    render(inCard({ cal: null }))
    expect(items().map((li) => li.firstElementChild?.textContent)).toEqual(['▲', '▲', '▼'])
  })
})
