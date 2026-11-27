// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAllDay, listAppts, listCalendarCounts, loadCalendarRev, loadCalendarSettings } from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import { DEFAULT_CAL_SETTINGS, type CalAllDay, type CalAppt, type CalCountRow, type CalSettings } from '@/types/calendar'
import type { ClinicProfile, DayHours } from '@/types/clinicProfile'
import { googleMemo, googleNew, googlePatch, REV_POLL_MS, useCalendarData, type CalendarPeriod } from './useCalendarData'

// 예약 탭 자료 읽기(spec clinic-calendar AC-5905.9, design.md '다시 읽기'). 저장 함수·시계는 흉내 낸다(실제 Supabase에 붙지 않는다).
// 보이는 동안 5초마다 calendar_rev 숫자 하나만 읽고, 바뀌었을 때만 보이는 기간(일·주: 예약 + 종일, 월: 수 세기 줄 + 종일)과 설정을 다시 읽는다.
// 설정은 예약 설정과 병원 정보(spec clinic-profile REQ-6603)를 함께 읽어 합친다(mergeClinic)

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
vi.mock('@/lib/storage/clinicProfile', () => ({ loadClinicProfile: vi.fn() }))

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
  gEventId: null,
  gUpdated: null,
  gTitle: null,
  gColor: null,
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: null,
  gWaitAt: null,
  gNote: null,
  gFrom: null,
  gHow: null,
  createdAt: '2026-11-01T00:00:00+00:00',
})
const COUNT: CalCountRow = { day: '2026-11-17', staffId: 'ga', staffName: '한○○', kindId: 'dosu', kindName: '도수', status: 'auto', auto: null, origDay: null, gMoved: false }
const OFF: CalAllDay = { id: 'd1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' }
const SETTINGS: CalSettings = { ...DEFAULT_CAL_SETTINGS, staff: [{ id: 'ga', name: '한○○', mark: '가', color: 'blueberry' }] }
// 병원 정보가 없을 때 합친 값: 예약 설정 그대로 + 월~토 08:00~20:00(점심 없음)·일요일 없음·휴진일 없음
const EIGHT_TO_EIGHT: DayHours = { open: 480, close: 1200, lunchFrom: null, lunchTo: null }
const PLAIN_WEEK: DayHours[] = [EIGHT_TO_EIGHT, EIGHT_TO_EIGHT, EIGHT_TO_EIGHT, EIGHT_TO_EIGHT, EIGHT_TO_EIGHT, EIGHT_TO_EIGHT, null]
const MERGED_PLAIN: CalSettings = { ...SETTINGS, days: PLAIN_WEEK, closedDates: [] }

const WEEKDAY: DayHours = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const PROFILE: ClinicProfile = {
  displayName: null,
  phone: null,
  address: null,
  honorific: '원장님',
  hours: [WEEKDAY, WEEKDAY, null, WEEKDAY, WEEKDAY, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null],
  closedDates: ['2026-11-20'],
  staff: [
    { id: 'na', name: '윤○○', role: 'staff', mark: '나', color: 'basil', calendar: true },
    { id: 'won', name: '원장님', role: 'doctor', mark: '원', color: 'graphite', calendar: false },
    { id: 'ga', name: '한○○', role: 'staff', mark: '가', color: 'blueberry', calendar: true },
  ],
  logoPath: null,
  emr: 'bit',
}
const MERGED_PROFILE: CalSettings = {
  kinds: SETTINGS.kinds,
  staff: [
    { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
  ],
  openHour: 9,
  closeHour: 18,
  sunday: false,
  days: PROFILE.hours,
  closedDates: ['2026-11-20'],
}

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
  vi.mocked(loadClinicProfile).mockReset().mockResolvedValue(null)
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
    expect(result.current.settings).toEqual(MERGED_PLAIN)
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

  it('AC-5905.5: setSettings()는 저장한 설정을 바로 쓴다(병원 정보가 없으면 그 설정 + 요일 진료시간)', async () => {
    const { result } = setup()
    await settle()
    const next = { ...SETTINGS, kinds: SETTINGS.kinds.slice(0, 2), sunday: true }
    act(() => result.current.setSettings(next))
    expect(result.current.settings).toEqual({ ...next, days: [...PLAIN_WEEK.slice(0, 6), EIGHT_TO_EIGHT], closedDates: [] })
  })

  it('AC-6603.4: 병원 정보가 있으면 setSettings()로 고친 종류만 바뀌고 시행자·진료시간은 병원 정보 그대로다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    const { result } = setup()
    await settle()
    const kinds = SETTINGS.kinds.slice(0, 2)
    act(() => result.current.setSettings({ ...result.current.settings!, kinds }))
    expect(result.current.settings).toEqual({ ...MERGED_PROFILE, kinds })
  })
})

describe('AC-6603.1·AC-6603.2 병원 정보와 합치기', () => {
  it('AC-6603.1·AC-6603.2: 예약 설정과 병원 정보(loadClinicProfile)를 함께 읽어 합친다 — 시행자는 예약에 보이기인 사람(병원 정보 차례), 시간·요일·휴진일은 병원 정보', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    const { result } = setup()
    await settle()
    expect(loadClinicProfile).toHaveBeenCalledWith(CLIENT)
    expect(result.current.settings).toEqual(MERGED_PROFILE)
  })

  it.each<[string, () => void]>([
    ['줄 없음(null)', () => vi.mocked(loadClinicProfile).mockResolvedValue(null)],
    ['읽기 실패(failed)', () => vi.mocked(loadClinicProfile).mockResolvedValue('failed')],
    ['던짐', () => vi.mocked(loadClinicProfile).mockRejectedValue(new Error('가짜 실패'))],
  ])('AC-6603.1: 병원 정보가 %s이면 예약 설정의 시행자·보이는 시간을 쓰고 예약표는 그대로 읽힌다', async (_name, arrange) => {
    arrange()
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.settings).toEqual(MERGED_PLAIN)
  })

  it('AC-6603.1: rev가 바뀌면 병원 정보도 다시 읽는다(설정 → 병원 정보에서 저장하면 DB가 rev를 올린다)', async () => {
    const { result } = setup()
    await settle()
    expect(result.current.settings).toEqual(MERGED_PLAIN)
    vi.mocked(loadCalendarRev).mockResolvedValue(4)
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    await settle(REV_POLL_MS)
    expect(loadClinicProfile).toHaveBeenCalledTimes(2)
    expect(result.current.settings).toEqual(MERGED_PROFILE)
  })

  it('AC-6603.1: 앞서 읽은 병원 정보가 있으면 다시 읽기 한 번의 실패로 예약 설정 시행자로 바뀌지 않는다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    const { result } = setup()
    await settle()
    vi.mocked(loadCalendarRev).mockResolvedValue(4)
    vi.mocked(loadClinicProfile).mockResolvedValue('failed')
    await settle(REV_POLL_MS)
    expect(loadClinicProfile).toHaveBeenCalledTimes(2)
    expect(result.current.settings).toEqual(MERGED_PROFILE)
  })
})

// ── 저장 잇기 (spec google-link AC-8526.1·AC-8526.5, design.md 2절 표 4·5·6) ──
// 이은 병원(캘린더 고름 + 이은 날)의 이은 날 이후 예약만 같은 쓰기에 g_wait를 싣는다. 보내기(pushAppt)는 화면이 저장 뒤 한다

const LINK = { linkedOn: '2026-11-16', arrival: 'off' as const }
const SSK = /^ssk[0-9a-f]{32}$/
const linked = (over: Partial<CalAppt> = {}): CalAppt => ({ ...appt('g1', '2026-11-18'), gEventId: 'ssk0123456789abcdef0123456789abcdef', gFrom: 'web', ...over })

describe('AC-8526.1 넣기 — 새 예약·종일 메모의 구글 칸', () => {
  it('AC-8526.1: 이은 날 이후 새 예약은 g_event_id = ssk + 32자, g_from = web, g_wait = new', () => {
    const g = googleNew(LINK, '2026-11-16')
    expect(g).toEqual({ gEventId: expect.stringMatching(SSK), gFrom: 'web', gWait: 'new' })
    expect(googleNew(LINK, '2026-11-16').gEventId).not.toBe(g.gEventId)
  })

  it('AC-8526.1: 이은 날 앞 예약·이은 병원이 아니면 구글 칸을 싣지 않는다', () => {
    expect(googleNew(LINK, '2026-11-15')).toEqual({})
    expect(googleNew(null, '2026-11-18')).toEqual({})
  })

  it('AC-8526.1: 웹앱 종일 메모도 넣는 쓰기에 g_event_id = ssk + 32자와 g_wait', () => {
    expect(googleMemo(LINK, '2026-11-20')).toEqual({ gEventId: expect.stringMatching(SSK), gWait: true })
    expect(googleMemo(LINK, '2026-11-10')).toEqual({})
    expect(googleMemo(null, '2026-11-20')).toEqual({})
  })
})

describe('AC-8526.1·AC-8526.5 고치기·옮기기·취소·되돌리기 — g_wait', () => {
  it('AC-8526.1: 날짜·시작을 옮기면 move', () => {
    // google-link AC-8545.2: 옮기는 쓰기에 g_moved 참도 싣는다
    expect(googlePatch(LINK, linked(), { day: '2026-11-19', start: 570 })).toEqual({ gWait: 'move', gMoved: true })
    expect(googlePatch(LINK, linked(), { start: 600 })).toEqual({ gWait: 'move', gMoved: true })
  })

  it('AC-8526.1: 칸(이름·차트번호·길이·메모·시행자·종류)을 고치면 edit, 구글 제목을 그대로 두던 예약은 g_keep_title = false', () => {
    expect(googlePatch(LINK, linked(), { memo: '허리' })).toEqual({ gWait: 'edit' })
    expect(googlePatch(LINK, linked({ gKeepTitle: true }), { len: 50 })).toEqual({ gWait: 'edit', gKeepTitle: false })
  })

  it('AC-8526.1: 구글 색 그대로이던 예약의 시행자·종류를 바꾸면 색도 설정 색(color_from app)으로', () => {
    const fromGoogle = linked({ gFrom: 'import', colorFrom: 'google', gKeepTitle: true })
    expect(googlePatch(LINK, fromGoogle, { staffId: 'na', staffName: '윤○○', staffMark: '나' })).toEqual({ gWait: 'edit', gKeepTitle: false, colorFrom: 'app' })
    expect(googlePatch(LINK, fromGoogle, { memo: '어깨' })).toEqual({ gWait: 'edit', gKeepTitle: false })
  })

  it('AC-8526.1: 바뀐 칸이 없으면(같은 값 저장) 구글 칸을 싣지 않는다', () => {
    const before = linked()
    const { id: _id, ...same } = before
    void _id
    expect(googlePatch(LINK, before, { day: same.day, start: same.start, len: same.len, name: same.name, memo: same.memo, staffId: same.staffId })).toEqual({})
  })

  it('AC-8526.1: 취소는 cancel, 취소 되돌리기는 uncancel', () => {
    expect(googlePatch(LINK, linked(), { status: 'cancel' })).toEqual({ gWait: 'cancel' })
    expect(googlePatch(LINK, linked({ status: 'cancel' }), { status: 'auto' })).toEqual({ gWait: 'uncancel' })
  })

  it("AC-8526.5: 도착(왔음·안 옴·자동)이 바뀌면 맞춤 방법 기본('off')은 아무것도 싣지 않고, 'title'이면 edit", () => {
    expect(googlePatch(LINK, linked(), { status: 'came' })).toEqual({})
    expect(googlePatch(LINK, linked({ status: 'came' }), { status: 'auto' })).toEqual({})
    expect(googlePatch({ ...LINK, arrival: 'title' }, linked(), { status: 'noshow' })).toEqual({ gWait: 'edit' })
  })

  it('AC-8526.1: 아직 못 보낸 일이 있으면 더 큰 일을 남긴다(new > move > edit > cancel·uncancel·color)', () => {
    expect(googlePatch(LINK, linked({ gWait: 'new' }), { memo: '허리' })).toEqual({ gWait: 'new' })
    expect(googlePatch(LINK, linked({ gWait: 'move' }), { memo: '허리' })).toEqual({ gWait: 'move' })
    expect(googlePatch(LINK, linked({ gWait: 'edit' }), { status: 'cancel' })).toEqual({ gWait: 'edit' })
    expect(googlePatch(LINK, linked({ gWait: 'cancel' }), { start: 600 })).toEqual({ gWait: 'move', gMoved: true }) // google-link AC-8545.2
    expect(googlePatch(LINK, linked({ gWait: 'color' }), { status: 'cancel' })).toEqual({ gWait: 'cancel' })
  })

  it('AC-8526.1: 짝 없는(이은 날 앞에 넣은) 예약을 이은 날 이후로 고치면 새 예약처럼 ssk id·web·new', () => {
    const old = { ...appt('o1', '2026-11-12') }
    // google-link AC-8545.2: 짝 없는 줄도 옮기면 g_moved 참
    expect(googlePatch(LINK, old, { day: '2026-11-20' })).toEqual({ gEventId: expect.stringMatching(SSK), gFrom: 'web', gWait: 'new', gMoved: true })
    expect(googlePatch(LINK, old, { memo: '허리' })).toEqual({})
  })

  it('AC-8526.1: 이은 병원이 아니면 아무것도 싣지 않는다', () => {
    expect(googlePatch(null, linked(), { start: 600 })).toEqual({})
    expect(googlePatch(null, linked(), { status: 'cancel' })).toEqual({})
  })
})

describe("AC-8545.2 이은 병원의 '변경' = g_moved — 옮기면 참, 원래 자리로 되돌리면 거짓", () => {
  it('AC-8545.2: 구글 짝 있는 예약을 옮기면 g_moved 참, 원래 자리(orig_day·orig_start)로 되돌리면 g_moved 거짓을 같은 쓰기에 싣는다', () => {
    const movedOnce = linked({ day: '2026-11-19', start: 600, origDay: '2026-11-18', origStart: 570, gMoved: true })
    expect(googlePatch(LINK, movedOnce, { day: '2026-11-18', start: 570 })).toEqual({ gWait: 'move', gMoved: false })
    expect(googlePatch(LINK, movedOnce, { day: '2026-11-18', start: 600 })).toEqual({ gWait: 'move', gMoved: true })
    expect(googlePatch(LINK, movedOnce, { day: '2026-11-20' })).toEqual({ gWait: 'move', gMoved: true })
  })

  it('AC-8545.2: 이은 날 앞 예약·구글 짝 없는 예약도 옮기면 g_moved를 싣는다(구글로 보내는 것은 없음)', () => {
    const before = appt('o1', '2026-11-12')
    expect(googlePatch(LINK, before, { day: '2026-11-13' })).toEqual({ gMoved: true })
    expect(googlePatch(LINK, before, { start: 600 })).toEqual({ gMoved: true })
    const back = { ...appt('o2', '2026-11-13'), origDay: '2026-11-12', origStart: 570 }
    expect(googlePatch(LINK, back, { day: '2026-11-12', start: 570 })).toEqual({ gMoved: false })
  })

  it('AC-8545.2: 날짜·시작을 옮기지 않는 고치기·취소·도착은 g_moved를 싣지 않는다', () => {
    expect(googlePatch(LINK, linked({ gMoved: true }), { memo: '허리' })).toEqual({ gWait: 'edit' })
    expect(googlePatch(LINK, linked(), { status: 'cancel' })).toEqual({ gWait: 'cancel' })
    expect(googlePatch(LINK, appt('o1', '2026-11-12'), { memo: '허리' })).toEqual({})
  })

  it('AC-8545.3: 잇지 않은 병원은 옮겨도 g_moved를 싣지 않는다(지금 그대로 orig_day로 변경)', () => {
    expect(googlePatch(null, appt('o1', '2026-11-12'), { day: '2026-11-13' })).toEqual({})
  })
})
