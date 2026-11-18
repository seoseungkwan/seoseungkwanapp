// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay } from '@/lib/analytics/dates'
import type { DayValue, StatsDayTotals } from '@/lib/analytics/goalPace'
import { errorInfo } from '@/lib/errors'
import type { Goal } from '@/types/goals'
import { GOAL_NOTE, GoalSection, type GoalSectionProps } from './GoalSection'
import { StatsCard } from './parts'

// 통계 요약 '이번 달 목표' 칸 (stats-insights REQ-6102 AC-6102.4·AC-6102.5, 시안 docs/mockups/stats-insights ②, TASK-1).
// props만 받는다(읽기·저장은 useStatsGoals, 내원·신환 하루 숫자는 넓은 하루 읽기). 숫자는 지어낸 값이다. 2026-11-18은 수요일이다

afterEach(cleanup)

const TODAY = '2026-11-18'
const SPAN = eachDay({ from: addDays(TODAY, -56), to: addDays(TODAY, -1) })
// 날마다 내원 20 · 신환 1 → 지금까지(11/1~11/17) 내원 340 · 신환 17, 남은 13일 예상 내원 260 · 신환 13
const DAYS: StatsDayTotals[] = SPAN.map((day) => ({ day, totals: { patients: 20, newPatients: 1 } }))
// 날마다 매출 4,200,000원 → 지금까지 71,400,000원, 남은 13일 예상 54,600,000원 → 월말 126,000,000원
const REVENUE: DayValue[] = SPAN.map((day) => ({ day, value: 4_200_000 }))
const GOAL: Goal = { visits: 700, newPatients: 25, revenue: 130_000_000 }
const EMPTY: Goal = { visits: null, newPatients: null, revenue: null }

function draw(over: Partial<GoalSectionProps> = {}) {
  const props: GoalSectionProps = {
    today: TODAY,
    goal: GOAL,
    days: DAYS,
    revenue: REVENUE,
    onReread: vi.fn(),
    onSave: vi.fn(async () => {}),
    ...over,
  }
  const view = render(
    <StatsCard id="stats-summary" title="환자 요약">
      <GoalSection {...props} />
    </StatsCard>,
  )
  return { ...view, props }
}

const row = (name: string) => screen.getByRole('group', { name })
const rowNames = () => screen.queryAllByRole('group').map((group) => group.getAttribute('aria-label'))
const lines = (group: HTMLElement) => [...group.querySelectorAll('p')].map((p) => p.textContent)
const part = (group: HTMLElement, name: 'fill' | 'today') => group.querySelector<HTMLElement>(`[data-part="${name}"]`)!
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement

describe('AC-6102.4 GoalSection: 목표가 적힌 달', () => {
  it('AC-6102.4: 제목 "이번 달 목표" 아래 목표가 있는 지표만 내원·신환·매출 차례로 줄이 보인다', () => {
    draw()
    expect(screen.getByRole('heading', { name: '이번 달 목표' })).toBeTruthy()
    expect(rowNames()).toEqual(['내원', '신환', '매출'])
    cleanup()
    draw({ goal: { visits: null, newPatients: 25, revenue: 130_000_000 } })
    expect(rowNames()).toEqual(['신환', '매출'])
    cleanup()
    draw({ goal: { visits: 700, newPatients: null, revenue: null } })
    expect(rowNames()).toEqual(['내원'])
  })

  it('AC-6102.4: 내원 줄 = "{지금까지}명 / 목표 {목표}명 · {달성률}%"와 "이 속도면 월말 {예상}명 · 목표의 {예상률}%" + "{모자란 수}명 모자라요"', () => {
    draw()
    const visits = row('내원')
    expect(lines(visits)).toEqual(['내원340명 / 목표 700명 · 48%', '이 속도면 월말 600명 · 목표의 85% 100명 모자라요'])
    expect(within(visits).getByText('100명 모자라요').className).toContain('text-negative')
  })

  it('AC-6102.4: 예상이 목표 이상이면 "넘길 것 같아요"다', () => {
    draw()
    expect(lines(row('신환'))).toEqual(['신환17명 / 목표 25명 · 68%', '이 속도면 월말 30명 · 목표의 120% 넘길 것 같아요'])
    expect(within(row('신환')).getByText('넘길 것 같아요').className).toContain('text-positive')
    cleanup()
    // 예상 = 목표 정확히 같음
    draw({ goal: { visits: 600, newPatients: null, revenue: null } })
    expect(lines(row('내원'))[1]).toBe('이 속도면 월말 600명 · 목표의 100% 넘길 것 같아요')
  })

  it('AC-6102.4: 매출 줄은 금액 표기(formatManWon)로 "명" 대신 금액이다', () => {
    draw()
    expect(lines(row('매출'))).toEqual(['매출7,140만 원 / 목표 1억 3,000만 원 · 54%', '이 속도면 월말 1억 2,600만 원 · 목표의 96% 400만 원 모자라요'])
    cleanup()
    draw({ goal: { visits: null, newPatients: null, revenue: 120_000_000 } })
    expect(lines(row('매출'))).toEqual(['매출7,140만 원 / 목표 1억 2,000만 원 · 59%', '이 속도면 월말 1억 2,600만 원 · 목표의 105% 넘길 것 같아요'])
  })

  it('AC-6102.4: 막대 폭은 달성률(100% 넘으면 100%)이고 오늘 세로줄은 지나간 만큼((18−1)÷30)이다', () => {
    draw({ goal: { visits: 700, newPatients: 10, revenue: null } })
    expect(part(row('내원'), 'fill').style.width).toBe('48%')
    expect(part(row('내원'), 'today').style.left).toBe('56.67%')
    // 신환 17 / 목표 10 = 170% → 막대는 100%
    expect(lines(row('신환'))[0]).toBe('신환17명 / 목표 10명 · 170%')
    expect(part(row('신환'), 'fill').style.width).toBe('100%')
    expect(part(row('신환'), 'today').style.left).toBe('56.67%')
  })

  it('AC-6102.4: 1일에는 지금까지 0·세로줄 0%이고, 이번 달 밖·오늘 숫자는 지금까지에 넣지 않는다', () => {
    draw({ today: '2026-11-01', goal: { visits: 700, newPatients: null, revenue: null } })
    expect(lines(row('내원'))[0]).toBe('내원0명 / 목표 700명 · 0%')
    expect(part(row('내원'), 'today').style.left).toBe('0%')
  })

  it('AC-6102.4: 막대는 글자로 같은 숫자를 보이므로 화면 읽기에서 숨긴다', () => {
    draw()
    expect(part(row('내원'), 'fill').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-6102.4: 단추는 [목표 고치기]이고 세는 법 안내가 보인다', () => {
    draw()
    expect(screen.getByRole('button', { name: '목표 고치기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '목표 적기' })).toBeNull()
    expect(screen.getByText(GOAL_NOTE)).toBeTruthy()
  })

  it('AC-6102.4: 매출 목표가 없으면 하루 매출을 읽지 못했어도(또는 읽는 중이어도) 내원·신환 줄은 그대로 보인다', () => {
    draw({ goal: { visits: 700, newPatients: 25, revenue: null }, revenue: 'failed' })
    expect(rowNames()).toEqual(['내원', '신환'])
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    draw({ goal: { visits: null, newPatients: null, revenue: 130_000_000 }, days: 'failed' })
    expect(rowNames()).toEqual(['매출'])
  })
})

describe('AC-6102.4·AC-6102.5 GoalSection: 읽는 중·읽기 실패', () => {
  it('AC-6102.4: 목표를 읽는 중이면 제목만 있고 줄·단추가 없다', () => {
    draw({ goal: 'reading' })
    expect(screen.getByRole('heading', { name: '이번 달 목표' })).toBeTruthy()
    expect(rowNames()).toEqual([])
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('AC-6102.4: 목표를 읽지 못하면 읽기 실패 카드와 [다시 읽기]가 보이고 누르면 onReread를 부른다', () => {
    const { props } = draw({ goal: 'failed' })
    expect(within(screen.getByRole('alert')).getByText(errorInfo('E-STATS-READ-FAILED').what)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(props.onReread).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '목표 고치기' })).toBeNull()
  })

  it.each<[string, Partial<GoalSectionProps>]>([
    ['내원 목표인데 하루 숫자를 읽지 못함', { goal: { visits: 700, newPatients: null, revenue: null }, days: 'failed' }],
    ['매출 목표인데 하루 매출을 읽지 못함', { goal: { visits: null, newPatients: null, revenue: 130_000_000 }, revenue: 'failed' }],
  ])('AC-6102.4: %s이면 읽기 실패 카드와 [다시 읽기]가 보인다', (_name, over) => {
    const { props } = draw(over)
    expect(within(screen.getByRole('alert')).getByText(errorInfo('E-STATS-READ-FAILED').what)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(props.onReread).toHaveBeenCalledTimes(1)
    expect(rowNames()).toEqual([])
  })

  it('AC-6102.4: 필요한 하루 숫자를 읽는 중이면 줄을 아직 그리지 않는다', () => {
    draw({ days: 'reading' })
    expect(rowNames()).toEqual([])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-6102.5 GoalSection: 목표 없는 달과 목표 적기', () => {
  it('AC-6102.5: 목표가 없으면 "이번 달 목표를 적어 두면 달성률을 보여 줘요"와 [목표 적기]만 보인다', () => {
    draw({ goal: EMPTY })
    expect(screen.getByText('이번 달 목표를 적어 두면 달성률을 보여 줘요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '목표 적기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '목표 고치기' })).toBeNull()
    expect(rowNames()).toEqual([])
    expect(screen.queryByText(GOAL_NOTE)).toBeNull()
  })

  it('AC-6102.5: 목표가 없으면 하루 숫자를 읽지 못했어도 안내와 [목표 적기]가 보인다', () => {
    draw({ goal: EMPTY, days: 'failed', revenue: 'failed' })
    expect(screen.getByRole('button', { name: '목표 적기' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-6102.5: [목표 적기]를 누르면 "내원 (명)"·"신환 (명)"·"매출 (만 원)" 빈 숫자 칸 셋과 [저장]·[취소]가 열린다', () => {
    draw({ goal: EMPTY })
    fireEvent.click(screen.getByRole('button', { name: '목표 적기' }))
    expect(['내원 (명)', '신환 (명)', '매출 (만 원)'].map((label) => input(label).value)).toEqual(['', '', ''])
    for (const label of ['내원 (명)', '신환 (명)', '매출 (만 원)']) expect(input(label).inputMode).toBe('numeric')
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '목표 적기' })).toBeNull()
  })

  it('AC-6102.5: [목표 고치기]는 지금 목표를 채워 연다(매출은 만 원 단위)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    expect(['내원 (명)', '신환 (명)', '매출 (만 원)'].map((label) => input(label).value)).toEqual(['700', '25', '13000'])
  })

  it('AC-6102.5: [저장]은 적은 숫자를 목표로 보낸다(빈 칸 = 목표 없음, 쉼표는 무시, 매출은 만 원 × 10,000원). 끝나면 칸이 닫힌다', async () => {
    const onSave = vi.fn(async () => {})
    draw({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.change(input('내원 (명)'), { target: { value: '3,200' } })
    fireEvent.change(input('신환 (명)'), { target: { value: '' } })
    fireEvent.change(input('매출 (만 원)'), { target: { value: ' 12000 ' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(onSave).toHaveBeenCalledWith({ visits: 3200, newPatients: null, revenue: 120_000_000 })
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(screen.getByRole('button', { name: '목표 고치기' })).toBeTruthy()
  })

  it('AC-6102.5: 셋 다 비우고 저장하면 세 값 모두 null을 보낸다', async () => {
    const onSave = vi.fn(async () => {})
    draw({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    for (const label of ['내원 (명)', '신환 (명)', '매출 (만 원)']) fireEvent.change(input(label), { target: { value: '' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(onSave).toHaveBeenCalledWith(EMPTY)
  })

  it('AC-6102.5: 저장을 기다리는 동안 [저장]은 기다림 표시(aria-busy)이고 다시 눌러도 한 번만 보낸다', async () => {
    let finish!: () => void
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    draw({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('aria-busy')).toBe('true')
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('AC-6102.5: 저장이 실패하면 lib/errors.ts의 저장 실패 문구를 보이고 적은 값은 그대로 둔다', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('가짜 실패')
    })
    draw({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.change(input('내원 (명)'), { target: { value: '3,200' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(errorInfo('E-STATS-SAVE-FAILED').what)).toBeTruthy()
    expect(within(alert).getByText(errorInfo('E-STATS-SAVE-FAILED').fix)).toBeTruthy()
    expect(['내원 (명)', '신환 (명)', '매출 (만 원)'].map((label) => input(label).value)).toEqual(['3,200', '25', '13000'])
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('aria-busy')).not.toBe('true')
  })

  it('AC-6102.5: [취소]는 보내지 않고 칸을 닫으며, 다시 열면 지금 목표로 채운다', () => {
    const { props } = draw()
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.change(input('내원 (명)'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(props.onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('내원 (명)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    expect(input('내원 (명)').value).toBe('700')
  })

  it.each<[string, string, string]>([
    ['음수', '내원 (명)', '-5'],
    ['소수', '신환 (명)', '1.5'],
    ['글자', '내원 (명)', '삼천'],
    ['내원 1,000,000 넘음', '내원 (명)', '1000001'],
    ['매출 10,000,000만 원 넘음', '매출 (만 원)', '10000001'],
  ])('AC-6102.5: 칸에 맞지 않는 값(%s)이면 보내지 않고 그 칸에 안내를 보인다', async (_name, label, value) => {
    const { props } = draw()
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.change(input(label), { target: { value } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(props.onSave).not.toHaveBeenCalled()
    expect(input(label).getAttribute('aria-invalid')).toBe('true')
    const help = document.getElementById(input(label).getAttribute('aria-describedby') ?? '')
    expect(help?.textContent).toMatch(/^0~[0-9,]+ 사이의 정수로 적어 주세요$/)
  })

  it('AC-6102.5: 경계 값(내원 1,000,000 · 매출 10,000,000만 원)은 보낸다', async () => {
    const onSave = vi.fn(async () => {})
    draw({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '목표 고치기' }))
    fireEvent.change(input('내원 (명)'), { target: { value: '1000000' } })
    fireEvent.change(input('매출 (만 원)'), { target: { value: '10,000,000' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(onSave).toHaveBeenCalledWith({ visits: 1_000_000, newPatients: 25, revenue: 100_000_000_000 })
  })
})
