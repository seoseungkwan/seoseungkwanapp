// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAllDay, listAppts, listCalendarCounts, loadCalendarRev, loadCalendarSettings } from '@/lib/storage/calendar'
import { DEFAULT_CAL_SETTINGS, type CalAllDay, type CalAppt, type CalCountRow, type CalSettings } from '@/types/calendar'
import { REV_POLL_MS, useCalendarData, type CalendarPeriod } from './useCalendarData'

// 예약 탭 자료 읽기(spec clinic-calendar AC-5905.9, design.md '다시 읽기'). 저장 함수·시계는 흉내 낸다(실제 Supabase에 붙지 않는다).
// 보이는 동안 5초마다 calendar_rev 숫자 하나만 읽고, 바뀌었을 때만 보이는 기간(일·주: 예약 + 종일, 월: 수 세기 줄 + 종일)과 설정을 다시 읽는다

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/calendar')>()),
  listAppts: vi.fn(),
  listAllDay: vi.fn(),
  listCalendarCounts: vi.fn(),
  loadCalendarRev: vi.fn(),
  loadCalendarSettings: vi.fn(),
}))

const WEEK: CalendarPeriod = { view: 'week', from: '2026-11-16', to: '2026-11-22' }
const NEXT_WEEK: CalendarPeriod = { view: 'week', from: '2026-11-23', to: '2026-11-29' }
const MONTH: CalendarPeriod = { view: 'month', from: '2026-10-26', to: '2026-12-06' }

const appt = (id: string, day = '2026-11-17'): CalAppt => ({
  id,
  day,
  start: 570,
  len: 30,
  name: '김○○',
  chart: '10231',
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
})
const COUNT: CalCountRow = { day: '2026-11-17', staffId: 'ga', staffName: '한○○', kindId: 'dosu', kindName: '도수', status: 'auto', auto: null, origDay: null }
const OFF: CalAllDay = { id: 'd1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' }
const SETTINGS: CalSettings = { ...DEFAULT_CAL_SETTINGS, staff: [{ id: 'ga', name: '한○○', mark: '가', color: 'blue' }] }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

const setup = (period: CalendarPeriod = WEEK) => renderHook((p: CalendarPeriod) => useCalendarData(p), { initialProps: period })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T01:40:00Z')) // 한국 11/17 (화) 10:40
  vi.mocked(loadCalendarRev).mockReset().mockResolvedValue(3)
  vi.mocked(loadCalendarSettings).mockReset().mockResolvedValue(SETTINGS)
  vi.mocked(listAppts).mockReset().mockResolvedValue([appt('a1')])
  vi.mocked(listAllDay).mockReset().mockResolvedValue([OFF])
  vi.mocked(listCalendarCounts).mockReset().mockResolvedValue([COUNT])
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'visibilityState')
  vi.useRealTimers()
})

describe('AC-5905.9 기간 읽기', () => {
  it('AC-5905.9: 주 보기는 설정·그 기간 예약(listAppts)·종일(listAllDay)을 읽고, 다 오기 전에는 loading이다', async () => {
    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.snapshot).toBeNull()
    await settle()
    expect(loadCalendarSettings).toHaveBeenCalledWith(CLIENT)
    expect(listAppts).toHaveBeenCalledWith(CLIENT, '2026-11-16', '2026-11-22')
    expect(listAllDay).toHaveBeenCalledWith(CLIENT, '2026-11-16', '2026-11-22')
    expect(listCalendarCounts).not.toHaveBeenCalled()
    expect(result.current.status).toBe('ready')
    expect(result.current.settings).toEqual(SETTINGS)
    expect(result.current.snapshot).toEqual({ key: 'week|2026-11-16|2026-11-22', appts: [appt('a1')], counts: null, allday: [OFF] })
  })

  it('AC-5905.9: 월 보기는 이름·차트번호 없는 수 세기 줄(listCalendarCounts)과 종일을 읽는다(listAppts 없음)', async () => {
    const { result } = setup(MONTH)
    await settle()
    expect(listCalendarCounts).toHaveBeenCalledWith(CLIENT, '2026-10-26', '2026-12-06')
    expect(listAllDay).toHaveBeenCalledWith(CLIENT, '2026-10-26', '2026-12-06')
    expect(listAppts).not.toHaveBeenCalled()
    expect(result.current.snapshot).toEqual({ key: 'month|2026-10-26|2026-12-06', appts: [], counts: [COUNT], allday: [OFF] })
  })

  it('AC-5905.9: 기간을 바꾸면 새 기간을 읽고, 늦게 온 앞 기간 답은 버린다', async () => {
    const slow = deferred<CalAppt[]>()
    vi.mocked(listAppts).mockImplementation(async (_c, from) => (from === WEEK.from ? slow.promise : [appt('n1', '2026-11-24')]))
    const { result, rerender } = setup()
    await settle()
    rerender(NEXT_WEEK)
    await settle()
    expect(result.current.snapshot?.key).toBe('week|2026-11-23|2026-11-29')
    expect(result.current.snapshot?.appts.map((a) => a.id)).toEqual(['n1'])
    slow.resolve([appt('old')])
    await settle()
    expect(result.current.snapshot?.appts.map((a) => a.id)).toEqual(['n1'])
  })

  it('AC-5905.9: 읽기가 실패하면 failed이고 reload()로 다시 읽는다', async () => {
    vi.mocked(listAppts).mockRejectedValueOnce(new Error('offline'))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('failed')
    act(() => result.current.reload())
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.snapshot?.appts).toHaveLength(1)
  })
})

describe('AC-5905.9 5초 rev', () => {
  it('AC-5905.9: 보이는 동안 5초마다 loadCalendarRev 하나만 읽고, 값이 같으면 기간을 다시 읽지 않는다', async () => {
    setup()
    await settle()
    expect(loadCalendarRev).toHaveBeenCalledTimes(1)
    expect(listAppts).toHaveBeenCalledTimes(1)
    await settle(REV_POLL_MS)
    expect(loadCalendarRev).toHaveBeenCalledTimes(2)
    await settle(REV_POLL_MS)
    expect(loadCalendarRev).toHaveBeenCalledTimes(3)
    expect(listAppts).toHaveBeenCalledTimes(1)
    expect(loadCalendarSettings).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.9: rev가 바뀌면 보이는 기간과 설정을 다시 읽는다(다른 PC가 저장)', async () => {
    const { result } = setup()
    await settle()
    vi.mocked(loadCalendarRev).mockResolvedValue(4)
    vi.mocked(listAppts).mockResolvedValue([appt('a1'), appt('a2')])
    await settle(REV_POLL_MS)
    expect(listAppts).toHaveBeenCalledTimes(2)
    expect(loadCalendarSettings).toHaveBeenCalledTimes(2)
    expect(result.current.snapshot?.appts.map((a) => a.id)).toEqual(['a1', 'a2'])
    await settle(REV_POLL_MS)
    expect(listAppts).toHaveBeenCalledTimes(2) // 다시 같아졌다
  })

  it('AC-5905.9: 숨은 탭은 읽지 않고, 다시 보이면 바로 읽는다', async () => {
    setup()
    await settle()
    setVisibility('hidden')
    await settle(REV_POLL_MS * 3)
    expect(loadCalendarRev).toHaveBeenCalledTimes(1)
    vi.mocked(loadCalendarRev).mockResolvedValue(9)
    setVisibility('visible')
    await settle()
    expect(loadCalendarRev).toHaveBeenCalledTimes(2)
    expect(listAppts).toHaveBeenCalledTimes(2)
  })

  it('AC-5905.9: refresh()(내가 저장한 뒤)는 5초를 기다리지 않고 바로 rev를 읽는다', async () => {
    const { result } = setup()
    await settle()
    vi.mocked(loadCalendarRev).mockResolvedValue(5)
    act(() => result.current.refresh())
    await settle()
    expect(loadCalendarRev).toHaveBeenCalledTimes(2)
    expect(listAppts).toHaveBeenCalledTimes(2)
  })

  it('AC-5905.9: 화면을 떠나면 더 읽지 않는다', async () => {
    const { unmount } = setup()
    await settle()
    unmount()
    await settle(REV_POLL_MS * 2)
    expect(loadCalendarRev).toHaveBeenCalledTimes(1)
  })
})

describe('AC-5905.2·AC-5905.5 저장 뒤 바로 보이기', () => {
  it('AC-5905.2: update()는 지금 기간 자료를 바로 고친다(서버를 다시 읽기 전에 칸이 보인다)', async () => {
    const { result } = setup()
    await settle()
    act(() => result.current.update((snap) => ({ ...snap, appts: [...snap.appts, appt('mine')] })))
    expect(result.current.snapshot?.appts.map((a) => a.id)).toEqual(['a1', 'mine'])
  })

  it('AC-5905.5: setSettings()는 저장한 설정을 바로 쓴다', async () => {
    const { result } = setup()
    await settle()
    const next = { ...SETTINGS, sunday: true }
    act(() => result.current.setSettings(next))
    expect(result.current.settings).toEqual(next)
  })
})
