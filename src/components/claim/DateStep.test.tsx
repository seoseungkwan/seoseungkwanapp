// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DateRange } from '@/types/dates'
import type { DateRow } from './dateList'
import { DateStep, type CloseState, type DatesState } from './DateStep'

// 1단계 날짜 고르기의 claim-learn 다듬기(REQ-9311, design.md 11절): 줄 끝 [이 날만] · 목록 밖 기간 · 오늘이 든 [고른 날 완료로 저장].
// 날짜와 숫자뿐이다(환자 글자 없음). 오늘은 가짜 시계로 정한다

const dayRow = (date: string, over: Partial<DateRow> = {}): DateRow => ({ date, visits: 50, memoInBit: 0, needMemo: 7, entered: 2, left: 5, done: false, updatedAt: null, closedAt: null, ...over })
const ROWS: DateRow[] = [
  dayRow('2026-10-28'),
  dayRow('2026-10-29', { needMemo: null, entered: null, left: null }),
  dayRow('2026-10-27', { done: true, entered: 8, needMemo: 8, left: 0 }),
  dayRow('2026-10-24', { done: true, closedAt: '2026-11-07T22:30:00+00:00' }),
]
const CLOSE: CloseState = { saving: false, reopening: new Set(), justSaved: [], failed: false, blocked: false }

function show(period: DateRange, dates: DatesState = { kind: 'ready', rows: ROWS, countsFailed: false }) {
  const on = { onPeriod: vi.fn(), onLoad: vi.fn(), onStop: vi.fn(), onRetryDates: vi.fn(), onCloseDates: vi.fn(), onReopen: vi.fn() }
  render(<DateStep dates={dates} period={period} loading={null} close={CLOSE} {...on} />)
  return on
}
const table = () => screen.getByRole('table', { name: '진료한 날짜' })
const rowOf = (label: string) => within(table()).getAllByRole('row').find((r) => (r.textContent ?? '').includes(label)) as HTMLElement
const TODAY_NOTE = '오늘도 들어 있어요. 오늘 진료가 더 있을 수 있어요.'
const OUTSIDE_NOTE = '목록에 없는 날짜예요. [자료 불러오기]를 누르면 보여요.'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-9311.1 줄 끝 [이 날만]', () => {
  it('AC-9311.1: 날짜 줄마다(덜 끝난 날·끝난 날·완료로 바꾼 날) 줄 끝에 이름 "{M/d (요일)} 이 날만" 단추가 있다', () => {
    show({ from: '2026-10-28', to: '2026-10-29' })
    for (const label of ['10/28 (수)', '10/29 (목)', '10/27 (화)', '10/24 (토)']) {
      const only = within(rowOf(label)).getByRole('button', { name: `${label} 이 날만` })
      expect(only.textContent).toBe('이 날만')
      // 줄 끝: 그 줄 마지막 칸 안이다
      const cells = within(rowOf(label)).getAllByRole('cell')
      expect(cells.at(-1)!.contains(only)).toBe(true)
    }
    // 완료로 바꾼 날은 [되돌리기]도 그대로 있다
    expect(within(rowOf('10/24 (토)')).getByRole('button', { name: '10/24 (토) 되돌리기' })).toBeTruthy()
  })

  it('AC-9311.1: 누르면 기간이 그 하루가 된다(시작 = 끝 = 그 날)', async () => {
    const on = show({ from: '2026-10-28', to: '2026-10-29' })
    await userEvent.setup().click(screen.getByRole('button', { name: '10/27 (화) 이 날만' }))
    expect(on.onPeriod).toHaveBeenCalledExactlyOnceWith({ from: '2026-10-27', to: '2026-10-27' })
  })
})

describe('AC-9311.2 목록 밖 기간', () => {
  it('AC-9311.2: 시작·끝에 목록에 없는 날을 쳤으면 "진료한 날 0일" 대신 목록 밖 글이고, [자료 불러오기]는 그대로 눌린다', async () => {
    const on = show({ from: '2026-11-01', to: '2026-11-02' })
    expect(screen.getByText(OUTSIDE_NOTE)).toBeTruthy()
    expect(screen.queryByText(/진료한 날 0일/)).toBeNull()
    const load = screen.getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement
    expect(load.disabled).toBe(false)
    await userEvent.setup().click(load)
    expect(on.onLoad).toHaveBeenCalledTimes(1)
  })

  it('AC-9311.2: 목록에 있는 날이 들면 지금 요약 그대로이고 목록 밖 글이 없다', () => {
    show({ from: '2026-10-28', to: '2026-10-28' })
    expect(screen.getByText('진료한 날 1일 · 진료 환자 50명 · 메모 필요 7명')).toBeTruthy()
    expect(screen.queryByText(OUTSIDE_NOTE)).toBeNull()
  })

  it('AC-9311.2: 날짜 목록을 읽는 중이거나 못 읽었으면 목록 밖이라고 하지 않는다', () => {
    show({ from: '2026-11-01', to: '2026-11-02' }, { kind: 'loading' })
    expect(screen.queryByText(OUTSIDE_NOTE)).toBeNull()
    cleanup()
    show({ from: '2026-11-01', to: '2026-11-02' }, { kind: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(screen.queryByText(OUTSIDE_NOTE)).toBeNull()
  })
})

describe('AC-9311.3 오늘 포함', () => {
  const at = (ymd: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${ymd}T10:00:00+09:00`))
  }
  const bar = () => screen.getByText(/^고른 기간에서 아직 입력 안 된 날/).parentElement as HTMLElement

  it('AC-9311.3: [고른 날 완료로 저장]이 보낼 날짜에 오늘(한국 날짜)이 있으면 고르기 줄에 노란 경고가 함께 있고, 단추는 막지 않는다', async () => {
    at('2026-10-29')
    const on = show({ from: '2026-10-28', to: '2026-10-29' })
    const note = within(bar()).getByText(TODAY_NOTE)
    expect(note.getAttribute('class')).toContain('bg-warning-soft')
    const save = within(bar()).getByRole('button', { name: '고른 날 완료로 저장' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    await userEvent.setup().click(save)
    expect(on.onCloseDates).toHaveBeenCalledExactlyOnceWith(['2026-10-28', '2026-10-29'])
  })

  it('AC-9311.3: 보낼 날짜에 오늘이 없으면 경고가 없다(오늘이 기간 밖이거나 이미 끝난 날)', () => {
    at('2026-10-30')
    show({ from: '2026-10-28', to: '2026-10-29' })
    expect(screen.queryByText(TODAY_NOTE)).toBeNull()
    cleanup()
    at('2026-10-27')
    show({ from: '2026-10-27', to: '2026-10-28' })
    expect(screen.queryByText(TODAY_NOTE)).toBeNull()
  })
})
