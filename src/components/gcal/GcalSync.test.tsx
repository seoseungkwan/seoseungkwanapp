// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider } from '@/components/shell/viewing'
import { gcalCall } from '@/lib/gcal/client'
import { getGcalStatus, resetGcalStatus, setGcalStatus } from '@/lib/gcal/status'
import { GcalSync } from './GcalSync'
import { RECHECK_MS, startGcalSync, type GcalSyncDeps } from './syncLoop'

// 예약 구글 맞춤 — 앱 틀의 보이지 않는 부품(spec google-link REQ-8525 AC-8525.1, REQ-8540 AC-8540.1, design.md 10-5).
// 이은 병원(캘린더를 고르고 이은 날이 있음)에서만 lib/gcal/loop를 병원 id와 함께 시작하고, 떠나면 멈춘다. 받기 간격·한 탭만(잠금)은 loop가 한다(TASK-12).
// 한 차례 판단(startGcalSync)은 가짜 deps로, 부품(GcalSync)은 loop·저장 함수·Supabase를 가짜로 바꿔 본다. 병원 id·캘린더는 지어낸 값이다

const HID = '00000000-0000-4000-8000-0000000000a1'

function world(over: { viewing?: boolean; linked?: boolean; hospitalId?: string | null } = {}) {
  const state = { viewing: over.viewing ?? false, linked: over.linked ?? true, hospitalId: over.hospitalId === undefined ? HID : over.hospitalId }
  const stops: ReturnType<typeof vi.fn>[] = []
  const listeners = new Set<() => void>()
  let statusLinked = false
  const deps: GcalSyncDeps = {
    viewing: vi.fn(() => state.viewing),
    hospitalId: vi.fn(async () => state.hospitalId),
    linked: vi.fn(async () => state.linked),
    startLoop: vi.fn(() => {
      const stop = vi.fn()
      stops.push(stop)
      return stop
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }),
    statusLinked: () => statusLinked,
  }
  /** loop가 상태를 다시 읽어 linked를 바꾼 것처럼 */
  const announce = (linked: boolean) => {
    statusLinked = linked
    for (const listener of [...listeners]) listener()
  }
  return { deps, state, stops, announce, listeners }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetGcalStatus()
})

describe('GcalSync 시작·멈춤 (AC-8525.1)', () => {
  it('AC-8525.1: 이은 병원이면 바로 그 병원 id로 맞춤을 한 번 시작하고, 1분 뒤 다시 볼 때 또 시작하지 않는다', async () => {
    const w = world()
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(1)
    expect(w.deps.startLoop).toHaveBeenCalledWith(HID)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(1)
    stop()
  })

  it('AC-8525.1: 떠나면(멈추면) 돌던 맞춤을 한 번 멈추고, 그 뒤로는 다시 보지 않는다', async () => {
    const w = world()
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    stop()
    expect(w.stops[0]).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(w.deps.linked).toHaveBeenCalledTimes(1)
    expect(w.listeners.size).toBe(0)
  })

  it('AC-8525.1: 병원 id를 처음 읽은 뒤에는 다시 읽지 않는다(잇기만 다시 본다)', async () => {
    const w = world({ linked: false })
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 2)
    expect(w.deps.hospitalId).toHaveBeenCalledTimes(1)
    expect(w.deps.linked).toHaveBeenCalledTimes(3)
    stop()
  })

  it('AC-8525.1: 병원 id를 읽지 못하면(없음·실패) 시작하지 않고 1분 뒤 다시 본다', async () => {
    const w = world({ hospitalId: null })
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.deps.startLoop).not.toHaveBeenCalled()
    vi.mocked(w.deps.hospitalId).mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).not.toHaveBeenCalled()
    w.state.hospitalId = HID
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).toHaveBeenCalledWith(HID)
    stop()
  })

  it('AC-8525.1: 맞춤 중 잇기를 끊으면(상태 linked 참 → 거짓) 맞춤을 멈추고, 다시 이으면 다시 시작한다', async () => {
    const w = world()
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    // 시작 직후 상태는 아직 linked 거짓(처음 모양) — 그때는 멈추지 않는다
    w.announce(false)
    expect(w.stops[0]).not.toHaveBeenCalled()
    w.announce(true)
    w.state.linked = false
    w.announce(false)
    expect(w.stops[0]).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(1)
    w.state.linked = true
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(2)
    stop()
    expect(w.stops[1]).toHaveBeenCalledTimes(1)
  })
})

describe('GcalSync 하지 않을 때 (AC-8540.1)', () => {
  it('AC-8540.1: 잇지 않은 병원이면 맞춤을 시작하지 않고, 1분마다 다시 보다가 이으면 시작한다', async () => {
    const w = world({ linked: false })
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 2)
    expect(w.deps.startLoop).not.toHaveBeenCalled()
    w.state.linked = true
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(1)
    stop()
  })

  it('AC-8540.1: 보는 중(관리자 보기 쿠키)이면 병원 id·잇기도 읽지 않고 아무것도 하지 않는다', async () => {
    const w = world({ viewing: true })
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(w.deps.hospitalId).not.toHaveBeenCalled()
    expect(w.deps.linked).not.toHaveBeenCalled()
    expect(w.deps.startLoop).not.toHaveBeenCalled()
    stop()
  })

  it('AC-8540.1: 잇기를 읽다 실패하면 그 차례는 시작하지 않고 다음에 다시 본다', async () => {
    const w = world()
    vi.mocked(w.deps.linked).mockRejectedValueOnce(new Error('offline'))
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.deps.startLoop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(w.deps.startLoop).toHaveBeenCalledTimes(1)
    stop()
  })

  it('AC-8540.1: 잇기를 읽는 동안 멈추면 시작하지 않는다', async () => {
    const w = world()
    let answer: (linked: boolean) => void = () => {}
    vi.mocked(w.deps.linked).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const stop = startGcalSync(w.deps)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    answer(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.deps.startLoop).not.toHaveBeenCalled()
  })
})

// ── 부품: 앱 틀이 늘 그린다(아무것도 그리지 않음) ──
const mocks = vi.hoisted(() => ({ startGcalLoop: vi.fn(), loadGcalView: vi.fn(), rpc: vi.fn(), loopStop: vi.fn() }))
vi.mock('@/lib/gcal/loop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/gcal/loop')>()), startGcalLoop: mocks.startGcalLoop }))
vi.mock('@/lib/storage/gcal', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/gcal')>()), loadGcalView: mocks.loadGcalView }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ rpc: mocks.rpc, from: () => ({}) }) }))

const VIEW_KEY = '33333333-3333-4333-8333-333333333333'
const LINKED_VIEW = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKE0123/exec',
  calendarId: 'fake-calendar@group.calendar.google.com',
  calendarName: '가짜 예약',
  defaultHex: '#039BE5',
  linkedOn: '2026-11-20',
  hasSecret: true,
}
let cookie = ''

describe('GcalSync 부품 (AC-8540.1 · AC-8525.1)', () => {
  beforeEach(() => {
    cookie = ''
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookie, set: () => {} })
    mocks.rpc.mockResolvedValue({ data: HID, error: null })
    mocks.loadGcalView.mockResolvedValue(LINKED_VIEW)
    mocks.startGcalLoop.mockReturnValue(mocks.loopStop)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('AC-8540.1: 아무것도 그리지 않고, 이은 병원이면 my_clinic_hospital_id로 읽은 병원 id와 구글 부르기(gcalCall)로 맞춤을 시작한다', async () => {
    const { container } = render(<GcalSync />)
    expect(container.innerHTML).toBe('')
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(mocks.rpc).toHaveBeenCalledWith('my_clinic_hospital_id')
    expect(mocks.startGcalLoop).toHaveBeenCalledTimes(1)
    expect(mocks.startGcalLoop.mock.calls[0][0]).toMatchObject({ hospitalId: HID, call: gcalCall })
    expect(container.innerHTML).toBe('')
  })

  it.each([
    ['캘린더를 고르지 않음', { calendarId: null }],
    ['이은 날 없음', { linkedOn: null }],
    ['비밀 글자 없음', { hasSecret: false }],
  ])('AC-8540.1: 잇지 않은 병원(%s)이면 맞춤을 시작하지 않는다', async (_name, over) => {
    mocks.loadGcalView.mockResolvedValue({ ...LINKED_VIEW, ...over })
    render(<GcalSync />)
    await act(() => vi.advanceTimersByTimeAsync(RECHECK_MS))
    expect(mocks.startGcalLoop).not.toHaveBeenCalled()
  })

  it('AC-8540.1: 연결 줄이 없거나 병원 id 모양이 틀리면 시작하지 않는다', async () => {
    mocks.loadGcalView.mockResolvedValue(null)
    const first = render(<GcalSync />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    first.unmount()
    mocks.loadGcalView.mockResolvedValue(LINKED_VIEW)
    mocks.rpc.mockResolvedValue({ data: 'not-a-uuid', error: null })
    render(<GcalSync />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(mocks.startGcalLoop).not.toHaveBeenCalled()
  })

  it('AC-8540.1: 보는 중(ViewingProvider)이면 아무 일도 하지 않는다', async () => {
    render(
      <ViewingProvider viewing={{ hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라의원' }}>
        <GcalSync />
      </ViewingProvider>,
    )
    await act(() => vi.advanceTimersByTimeAsync(RECHECK_MS * 2))
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.startGcalLoop).not.toHaveBeenCalled()
  })

  it('AC-8540.1: 보기 쿠키가 있으면(앱 틀 뿌리라 ViewingProvider 밖이어도) 아무 일도 하지 않는다', async () => {
    cookie = `ssk_view=${VIEW_KEY}`
    render(<GcalSync />)
    await act(() => vi.advanceTimersByTimeAsync(RECHECK_MS * 2))
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.startGcalLoop).not.toHaveBeenCalled()
  })

  it('AC-8540.1: 떠나면(로그아웃) 맞춤을 멈추고 예약 맞춤 상태를 처음으로 돌린다', async () => {
    const { unmount } = render(<GcalSync />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    setGcalStatus({ calendarName: '가짜 예약', waiting: 2 })
    unmount()
    expect(mocks.loopStop).toHaveBeenCalledTimes(1)
    expect(getGcalStatus()).toMatchObject({ linked: false, calendarName: null, waiting: 0 })
  })
})
