// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { loadWorklogDay, saveWorklogDay } from '@/lib/storage/worklogDays'
import { loadCashFloatSetting } from '@/lib/storage/worklogSettings'
import type { RevenueDaysResult } from '@/types/revenue'
import { emptyWorklogCash, emptyWorklogDay, type WorklogCash, type WorklogDay, type WorklogSavedDay } from '@/types/worklog'
import { WorklogScreen } from './WorklogScreen'
import { startWorklogSession, worklogAutosave } from './worklogSession'

// 다른 의원 보는 중 업무일지 (admin-view REQ-8009 AC-8009.1, design.md '탭마다 읽기만' 업무일지 줄·기본값 9).
// 보는 중이면 지금의 '보기만'(터치 기기) 모양을 그대로 켠다: 칸은 읽기 전용, 저절로 저장·비트 채우기(useBitFill)·[지금 불러오기]·
// [비트 숫자로 바꾸기]·글씨 크기·시재 고치기 없음. 보는 의원 줄(RLS가 고른 그날 줄)과 메모·비고·사유 같은 자유 글은 보인다.
// 이 PC 비트가 연결된 것처럼(useBridge 'ready') 흉내 내도 비트를 읽지 않는다. viewing={null}이면 지금과 같다.
// 저장소·Supabase·통로만 가짜이고 자동 저장 제어는 진짜다. 값은 둥근 가짜 숫자와 "가상" 글자다

const client = vi.hoisted(() => ({ auth: { onAuthStateChange: vi.fn() } }))

vi.mock('@/lib/storage/worklogDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogDays')>()),
  loadWorklogDay: vi.fn(),
  saveWorklogDay: vi.fn(),
}))
vi.mock('@/lib/storage/worklogSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogSettings')>()),
  loadCashFloatSetting: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))
// 이 PC의 비트 통로(내 의원 것)는 연결된 것처럼 흉내 낸다
const bridge = vi.hoisted(() => ({
  state: 'ready' as string,
  helloError: null as string | null,
  call: vi.fn<(cmd: string, args: { from: string; to: string }) => Promise<RevenueDaysResult>>(),
}))
vi.mock('@/components/claim/useBridge', () => ({
  useBridge: () => ({ state: bridge.state, helloError: bridge.helloError, call: bridge.call }),
}))

const TODAY = '2026-10-28'
const NOON_TODAY = new Date('2026-10-28T03:00:00Z') // 한국 시각 12:00
const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-00000000b001', name: '가짜다른의원' }

const load = vi.mocked(loadWorklogDay)
const save = vi.mocked(saveWorklogDay)
const setting = vi.mocked(loadCashFloatSetting)

// 그날 센 돈 134,000원 · 시재 100,000원 → 있어야 할 돈과 달라 차이 이유가 보인다
const CASH: WorklogCash = { ...emptyWorklogCash(), count50000: 2, count10000: 3, count1000: 4, floatWon: 100_000, reason: '가상 차이 이유' }
const DAY: Partial<WorklogDay> = { cashIn: '100000', memo: '가상 업무 글', noteCash: '가상 비고', nameCashIn: '가상 항목' }
const saved = (cells: Partial<WorklogDay>, cash?: WorklogCash): WorklogSavedDay => ({ day: { ...emptyWorklogDay(), ...cells }, bitFields: [], ...(cash ? { cash } : {}) })

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function withViewing(viewing: Viewing | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
  }
}

async function open(viewing: Viewing | null, day: WorklogSavedDay | null = saved(DAY)) {
  load.mockResolvedValueOnce(day)
  const view = render(<WorklogScreen initialToday={TODAY} />, { wrapper: withViewing(viewing) })
  await settle()
  return view
}

const cell = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const sheetCells = () => within(screen.getByRole('table', { name: '업무일지' })).getAllByRole<HTMLInputElement>('textbox')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOON_TODAY)
  vi.clearAllMocks()
  load.mockReset()
  save.mockReset()
  load.mockResolvedValue(null)
  save.mockResolvedValue(undefined)
  setting.mockReset()
  setting.mockResolvedValue(100_000)
  bridge.state = 'ready'
  bridge.helloError = null
  bridge.call.mockReset()
  bridge.call.mockReturnValue(new Promise<RevenueDaysResult>(() => {})) // 답을 기다리는 채로 둔다
  client.auth.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
  // 마우스 PC(터치 기기 아님)
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  startWorklogSession()()
  worklogAutosave().dispose()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AC-8009.1 보는 중 업무일지는 지금의 보기만 모양', () => {
  it('AC-8009.1: 보는 의원 줄의 숫자·메모·비고·항목 이름이 보이고 칸은 모두 읽기 전용이다', async () => {
    await open(VIEWING)
    expect(load).toHaveBeenCalledWith(client, TODAY)
    expect(sheetCells().length).toBeGreaterThan(0)
    expect(sheetCells().every((el) => el.readOnly)).toBe(true)
    expect(cell('현금수납').value).toBe('100,000원')
    expect(cell('업무사항').value).toBe('가상 업무 글')
    expect(cell('지출 현금 비고').value).toBe('가상 비고')
    expect(cell('현금수납 항목 이름').value).toBe('가상 항목')
  })

  it('AC-8009.1: 칸을 고쳐도 값이 바뀌지 않고 저절로 저장을 부르지 않는다', async () => {
    const change = vi.spyOn(worklogAutosave(), 'change')
    const changeCash = vi.spyOn(worklogAutosave(), 'changeCash')
    const changeMemoFont = vi.spyOn(worklogAutosave(), 'changeMemoFont')
    await open(VIEWING)
    fireEvent.change(cell('현금수납'), { target: { value: '200000' } })
    fireEvent.change(cell('업무사항'), { target: { value: '가상 새 글' } })
    await settle(5000)
    expect(cell('현금수납').value).toBe('100,000원')
    expect(cell('업무사항').value).toBe('가상 업무 글')
    expect(change).not.toHaveBeenCalled()
    expect(changeCash).not.toHaveBeenCalled()
    expect(changeMemoFont).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-8009.1: 이 PC 비트가 연결돼 있어도 비트를 읽지 않고 [지금 불러오기]·비트 안내 줄·[비트 숫자로 바꾸기]가 없다', async () => {
    await open(VIEWING)
    await settle(11 * 60_000)
    expect(bridge.call).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '지금 불러오기' })).toBeNull()
    expect(screen.queryByText('비트 숫자를 불러오는 중이에요')).toBeNull()
    expect(screen.queryByRole('button', { name: /비트 숫자로 바꾸기/ })).toBeNull()
  })

  it('AC-8009.1: 업무사항 글씨 크기 단추와 시재 고치기 칸이 없고 병원 시재 금액을 읽지 않는다. 그날 시재 결과와 차이 이유는 보인다', async () => {
    await open(VIEWING, saved(DAY, CASH))
    expect(screen.queryByRole('group', { name: '업무사항 글씨 크기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '업무사항 글씨 크게' })).toBeNull()
    expect(screen.queryByRole('button', { name: '이 날만 고치기' })).toBeNull()
    expect(setting).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: '현금 시재 결과' })).toBeTruthy()
    expect(screen.getByText('가상 차이 이유')).toBeTruthy()
  })

  it('AC-8009.1: 날짜 옮기기·[인쇄]는 그대로이고 옮긴 날도 읽기만이다', async () => {
    await open(VIEWING)
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
    load.mockResolvedValueOnce(saved({ memo: '가상 전날 글' }))
    fireEvent.change(screen.getByLabelText('날짜 고르기'), { target: { value: '2026-10-27' } })
    await settle()
    expect(load).toHaveBeenLastCalledWith(client, '2026-10-27')
    expect(cell('업무사항').value).toBe('가상 전날 글')
    expect(sheetCells().every((el) => el.readOnly)).toBe(true)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-8009.1: viewing={null}이면 지금과 같다 — 칸을 고치면 저장하고 비트를 읽으며 글씨 크기 단추가 있다', async () => {
    await open(null)
    expect(sheetCells().every((el) => !el.readOnly)).toBe(true)
    expect(bridge.call).toHaveBeenCalledWith('revenue.days', { from: TODAY, to: TODAY })
    expect(screen.getByRole('group', { name: '업무사항 글씨 크기' })).toBeTruthy()
    expect(setting).toHaveBeenCalledTimes(1)
    fireEvent.change(cell('현금수납'), { target: { value: '200000' } })
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '200000' })
  })
})
