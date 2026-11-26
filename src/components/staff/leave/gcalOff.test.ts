// @vitest-environment jsdom
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider } from '@/components/shell/viewing'
import { sendOffDay } from '@/lib/gcal/loop'
import { listAllDay } from '@/lib/storage/calendar'
import { listOffDays, loadGcalView, loadOffNames } from '@/lib/storage/gcal'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, GCAL_DEFAULT_HEX, type GcalView } from '@/types/gcal'
import type { CalAllDay } from '@/types/calendar'
import {
  browserGcalOffStore,
  createGcalOffStore,
  dayLine,
  koreaHm,
  leaveTag,
  mdw,
  offDaysFor,
  offIdOf,
  offPersonOf,
  previewDays,
  previewWindow,
  rangeHint,
  savedNotice,
  scopeOf,
  sendAll,
  sentLine,
  type GcalOffInfo,
  type GcalOffStore,
  type OffCtx,
} from './gcalOff'
import { useGcalOff } from './useGcalOff'
import { clinicProfile, member } from './testData'

// 직원 탭 휴가 → 구글 off 줄 (spec google-link REQ-8537, notes-calendar `staff`). 순수 셈·저장 층·읽기 훅.
// 화면 글은 notes-calendar '화면 글 › staff' 글자를 그대로 적어 견준다. 사람 이름은 지어낸 것이다

vi.mock('@/lib/gcal/loop', () => ({ sendOffDay: vi.fn() }))
vi.mock('@/lib/storage/calendar', () => ({ listAllDay: vi.fn() }))
vi.mock('@/lib/storage/gcal', () => ({ loadGcalView: vi.fn(), loadOffNames: vi.fn(), listOffDays: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const PROFILE_STAFF = clinicProfile().staff // (이) 이도윤 cal-lee · (박) 박서연 cal-park, 둘 다 예약에 보임
const LEE = member('m-lee', '이도윤', { calendarStaffId: 'cal-lee' })
const KIM = member('m-kim', '김하늘')
const LOST = member('m-lost', '오가짜', { calendarStaffId: 'cal-gone' }) // 병원 정보에 없는 시행자 id

const INFO: GcalOffInfo = {
  calendarName: '2026 가나 정형외과',
  linkedOn: '2026-11-16',
  offWord: 'off',
  offColor: 'grape',
  defaultHex: GCAL_DEFAULT_HEX,
  offAllStaff: true,
  people: [
    { id: 'cal-lee', name: '이도윤' },
    { id: 'cal-park', name: '박서연' },
    { id: 'm-mkim', name: '김하늘' },
    { id: 'm-mjung', name: '정유나' },
  ],
}
function ctx(info: GcalOffInfo = INFO): OffCtx {
  const store: GcalOffStore = { loadInfo: vi.fn(), listAllDay: vi.fn(), listOffDays: vi.fn(), sendOffDay: vi.fn() }
  return { info, store, scope: scopeOf(info, PROFILE_STAFF) }
}
const off = (day: string, staffId: string, staffName: string, part: 'am' | 'pm' | null = null): CalAllDay => ({
  id: `off-${day}-${staffId}`,
  day,
  type: 'off',
  memo: null,
  staffId,
  staffName,
  part,
})
const memo = (day: string, text: string): CalAllDay => ({ id: `memo-${day}`, day, type: 'memo', memo: text, staffId: null, staffName: null, gEventId: `ssk${'0'.repeat(32)}` })
const view = (over: Partial<GcalView> = {}): GcalView => ({
  scriptUrl: 'https://script.google.com/macros/s/가짜-주소-0000000000/exec',
  hasSecret: true,
  calendarId: 'cal-1@group.calendar.google.com',
  calendarName: '2026 가나 정형외과',
  defaultHex: GCAL_DEFAULT_HEX,
  linkedOn: '2026-11-16',
  rules: { ...DEFAULT_GCAL_RULES },
  look: { ...DEFAULT_GCAL_LOOK },
  ...over,
})

describe('AC-8537.1: off 줄에 오를 사람', () => {
  it('AC-8537.1: 예약 시행자와 이어진 직원은 시행자 id, 이어지지 않은 직원은 m- + 빼기 없는 id(DB 트리거와 같음), 병원 정보에 없는 시행자 id면 없음', () => {
    expect(offIdOf(LEE, PROFILE_STAFF)).toBe('cal-lee')
    expect(offIdOf(KIM, PROFILE_STAFF)).toBe('m-mkim')
    expect(offIdOf(member('1b2c-3d4e', '정예시'), PROFILE_STAFF)).toBe('m-1b2c3d4e')
    expect(offIdOf(LOST, PROFILE_STAFF)).toBeNull()
  })

  it("AC-8537.1: 맡는 사람 = calendar_off_names() 사람. '예약 시행자가 아닌 직원도'가 꺼지면 예약에 보이는 시행자만", () => {
    expect(offPersonOf(LEE, PROFILE_STAFF, scopeOf(INFO, PROFILE_STAFF))).toEqual({ id: 'cal-lee', name: '이도윤' })
    expect(offPersonOf(KIM, PROFILE_STAFF, scopeOf(INFO, PROFILE_STAFF))).toEqual({ id: 'm-mkim', name: '김하늘' })
    const narrow = scopeOf({ ...INFO, offAllStaff: false }, PROFILE_STAFF)
    expect(narrow.map((p) => p.id)).toEqual(['cal-lee', 'cal-park'])
    expect(offPersonOf(KIM, PROFILE_STAFF, narrow)).toBeNull()
    const hidden = PROFILE_STAFF.map((s) => (s.id === 'cal-park' ? { ...s, calendar: false } : s))
    expect(scopeOf({ ...INFO, offAllStaff: false }, hidden).map((p) => p.id)).toEqual(['cal-lee'])
  })
})

describe('AC-8537.1: 날짜 글', () => {
  it('AC-8537.1: {M/d (요일)} · 미리 보기 넷째 날(그 앞 이틀 ~ 다음 날) · 오른쪽 날짜 범위', () => {
    expect(mdw('2026-11-27')).toBe('11/27 (금)')
    expect(mdw('2026-12-03')).toBe('12/3 (목)')
    expect(previewDays('2026-11-27')).toEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'])
    expect(rangeHint('2026-11-25', '2026-11-28')).toBe('11/25 – 28')
    expect(rangeHint('2026-11-29', '2026-12-02')).toBe('11/29 – 12/2')
  })

  it("AC-8537.1: '구글 캘린더 {캘린더} · {M/d (요일)} 하루 종일 줄'", () => {
    expect(dayLine('2026 양지바른정형외과', '2026-11-27')).toBe('구글 캘린더 2026 양지바른정형외과 · 11/27 (금) 하루 종일 줄')
  })
})

describe('AC-8537.1: 저장하면 이렇게 바뀌어요 (예약 탭 종일 줄 · 구글 하루 종일 줄)', () => {
  const days = previewDays('2026-11-27')
  const data = {
    allday: [memo('2026-11-25', '원장님 학회'), off('2026-11-25', 'cal-lee', '이도윤'), off('2026-11-27', 'm-mjung', '정유나'), off('2026-11-27', 'cal-park', '박서연', 'pm'), memo('2026-11-28', '물리치료실 소독')],
    offDays: [
      { day: '2026-11-25', gEventId: 'sskoffa', gTitle: '이도윤 off', gUpdated: null, wait: false, waitAt: null },
      { day: '2026-11-27', gEventId: 'sskoffb', gTitle: '정유나 off', gUpdated: null, wait: false, waitAt: null },
    ],
  }
  const marks = new Map(PROFILE_STAFF.map((s) => [s.id, s.mark]))

  it('AC-8537.1: 바꿈 없음 — 예약 탭은 메모 · off 칩 하나 · 반차 흰 칩, 구글은 메모 · 지금 off 제목', () => {
    const { views, titles } = previewWindow(days, data, ctx(), marks, null)
    expect(views.map((v) => v.day)).toEqual(days)
    expect(views[0].app).toEqual([
      { kind: 'memo', text: '원장님 학회' },
      { kind: 'off', text: '이도윤 off' },
    ])
    expect(views[2].app).toEqual([
      { kind: 'off', text: '정유나 off' },
      { kind: 'half', text: '(박) 박서연 오후 반차' },
    ])
    expect(views[2].google).toEqual([{ kind: 'off', text: '정유나 off' }])
    expect(views[3].google).toEqual([{ kind: 'memo', text: '물리치료실 소독' }])
    expect(titles.get('2026-11-27')).toEqual({ now: '정유나 off', next: '정유나 off' })
    expect(titles.get('2026-11-26')).toEqual({ now: null, next: '' })
  })

  it('AC-8537.1: 하루 종일 휴가를 더하면 새로 든 이름이 앞에 — 지금 [정유나 off] → 저장하면 [이도윤, 정유나 off], 반차는 구글에 안 넣음', () => {
    const change = { remove: null, add: { staffId: 'cal-lee', name: '이도윤', days: ['2026-11-27'], part: null } }
    const { views, titles } = previewWindow(days, data, ctx(), marks, change)
    expect(titles.get('2026-11-27')).toEqual({ now: '정유나 off', next: '이도윤, 정유나 off' })
    expect(views[2].app).toEqual([
      { kind: 'off', text: '이도윤, 정유나 off' },
      { kind: 'half', text: '(박) 박서연 오후 반차' },
    ])
    expect(views[2].google).toEqual([{ kind: 'off', text: '이도윤, 정유나 off' }])
    // 바꾸지 않는 날은 지금 구글 그대로
    expect(views[0].google).toEqual([
      { kind: 'memo', text: '원장님 학회' },
      { kind: 'off', text: '이도윤 off' },
    ])
  })

  it('AC-8537.1: 목록 밖 이름(구글에서 직접 적은 이름)은 지우지 않고 남긴다', () => {
    const outside = { ...data, offDays: [{ ...data.offDays[1], gTitle: '정유나, 외부강사 off' }] }
    const change = { remove: null, add: { staffId: 'm-mkim', name: '김하늘', days: ['2026-11-27'], part: null } }
    expect(previewWindow(days, outside, ctx(), marks, change).titles.get('2026-11-27')).toEqual({ now: '정유나, 외부강사 off', next: '김하늘, 정유나, 외부강사 off' })
  })

  it('AC-8537.1: 반차를 더하면 예약 탭에만 흰 칩이 생기고 구글 줄은 그대로', () => {
    const change = { remove: null, add: { staffId: 'cal-lee', name: '이도윤', days: ['2026-11-26'], part: 'am' as const } }
    const { views, titles } = previewWindow(days, data, ctx(), marks, change)
    expect(views[1].app).toEqual([{ kind: 'half', text: '(이) 이도윤 오전 반차' }])
    expect(views[1].google).toEqual([])
    expect(titles.get('2026-11-26')).toEqual({ now: null, next: '' })
  })

  it('AC-8537.1: 고치기는 그 사람의 옛 날 줄을 빼고 새 날 줄을 더한다 — 아무도 안 남으면 줄이 없어진다', () => {
    const change = { remove: { staffId: 'cal-lee', days: ['2026-11-25'] }, add: { staffId: 'cal-lee', name: '이도윤', days: ['2026-11-26'], part: null } }
    const { views, titles } = previewWindow(days, data, ctx(), marks, change)
    expect(views[0].app).toEqual([{ kind: 'memo', text: '원장님 학회' }])
    expect(titles.get('2026-11-25')).toEqual({ now: '이도윤 off', next: '' })
    expect(views[0].google).toEqual([{ kind: 'memo', text: '원장님 학회' }])
    expect(titles.get('2026-11-26')).toEqual({ now: null, next: '이도윤 off' })
  })

  it('AC-8537.1: 이은 날보다 이른 날은 구글에 보내지 않으므로 구글 줄은 그대로다', () => {
    const change = { remove: null, add: { staffId: 'cal-lee', name: '이도윤', days: ['2026-11-27'], part: null } }
    const late = ctx({ ...INFO, linkedOn: '2026-11-28' })
    expect(previewWindow(days, data, late, marks, change).titles.get('2026-11-27')).toEqual({ now: '정유나 off', next: '정유나 off' })
  })
})

describe('AC-8537.2: 저장한 뒤 보낼 날 · 알림 글', () => {
  const linked = ctx()

  it('AC-8537.2: 보낼 날 = 맡는 사람의 하루 종일 휴가 날(반차 뺌, 이은 날 앞 뺌), 날 차례 한 번씩', () => {
    const rows = [
      { day: '2026-11-27', part: null },
      { day: '2026-11-26', part: null },
      { day: '2026-11-15', part: null },
      { day: '2026-11-28', part: 'am' as const },
    ]
    expect(offDaysFor(rows, LEE, linked, PROFILE_STAFF)).toEqual(['2026-11-26', '2026-11-27'])
    expect(offDaysFor(rows, KIM, ctx({ ...INFO, offAllStaff: false }), PROFILE_STAFF)).toEqual([])
    expect(offDaysFor(rows, LOST, linked, PROFILE_STAFF)).toEqual([])
  })

  it('AC-8537.2: 날마다 차례로 보내고, 하나라도 못 보내면 거짓(조용히 — 다음 맞춤이 보낸다)', async () => {
    const store = { ...linked.store, sendOffDay: vi.fn(async (day: string) => day !== '2026-11-27') }
    await expect(sendAll(store, ['2026-11-26', '2026-11-28'])).resolves.toBe(true)
    await expect(sendAll(store, ['2026-11-26', '2026-11-27', '2026-11-28'])).resolves.toBe(false)
    expect(store.sendOffDay.mock.calls.map((c) => c[0])).toEqual(['2026-11-26', '2026-11-28', '2026-11-26', '2026-11-27', '2026-11-28'])
    const throwing = { ...linked.store, sendOffDay: vi.fn(async () => Promise.reject(new Error('x'))) }
    await expect(sendAll(throwing, ['2026-11-26'])).resolves.toBe(false)
    await expect(sendAll(store, [])).resolves.toBe(false)
  })

  it("AC-8537.2: '구글 캘린더에도 적었어요 · {HH:mm}'(한국 시각)과 알림 글", () => {
    expect(koreaHm(new Date('2026-11-26T05:38:20Z'))).toBe('14:38')
    expect(sentLine('14:38')).toBe('구글 캘린더에도 적었어요 · 14:38')
    expect(savedNotice('2026-11-27')).toBe('휴가를 넣었어요. 예약 달력과 구글 캘린더 11/27 (금) off 줄에도 더했어요.')
  })

  it("AC-8537.2: 휴가 목록 꼬리표 — 하루 종일은 '구글 off 줄', 반차는 '구글에는 안 넣음', 이은 날 앞·맡지 않는 사람은 없음", () => {
    expect(leaveTag({ day: '2026-11-27', part: null }, LEE, linked, PROFILE_STAFF)).toBe('off')
    expect(leaveTag({ day: '2026-11-27', part: null }, KIM, linked, PROFILE_STAFF)).toBe('off')
    expect(leaveTag({ day: '2026-11-27', part: 'pm' }, LEE, linked, PROFILE_STAFF)).toBe('half')
    expect(leaveTag({ day: '2026-11-10', part: null }, LEE, linked, PROFILE_STAFF)).toBeNull()
    expect(leaveTag({ day: '2026-11-27', part: null }, KIM, ctx({ ...INFO, offAllStaff: false }), PROFILE_STAFF)).toBeNull()
    expect(leaveTag({ day: '2026-11-27', part: null }, LOST, linked, PROFILE_STAFF)).toBeNull()
  })
})

describe('AC-8537.2·AC-8537.3: 저장 층', () => {
  const client = { from: vi.fn(), rpc: vi.fn() }

  it('AC-8537.2: 보내기는 맞춤 엔진 sendOffDay — 적었거나(sent·again) 이미 같으면(none) 참, 이은 날 앞(dropped)·실패는 거짓', async () => {
    const store = createGcalOffStore(client)
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: true, did: 'sent' })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(true)
    expect(sendOffDay).toHaveBeenCalledWith('2026-11-27')
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: true, did: 'again' })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(true)
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: true, did: 'none' })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(true)
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: true, did: 'dropped' })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(false)
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: false, code: 'E-GCAL-REACH' })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(false)
    vi.mocked(sendOffDay).mockResolvedValueOnce({ ok: false, code: null })
    await expect(store.sendOffDay('2026-11-27')).resolves.toBe(false)
  })

  it('AC-8537.2: 종일 줄·off 날 읽기는 저장 함수 그대로', async () => {
    const store = createGcalOffStore(client)
    vi.mocked(listAllDay).mockResolvedValueOnce([memo('2026-11-25', '원장님 학회')])
    vi.mocked(listOffDays).mockResolvedValueOnce([])
    await expect(store.listAllDay('2026-11-25', '2026-11-28')).resolves.toHaveLength(1)
    await expect(store.listOffDays('2026-11-25', '2026-11-28')).resolves.toEqual([])
    expect(listAllDay).toHaveBeenCalledWith(client, '2026-11-25', '2026-11-28')
    expect(listOffDays).toHaveBeenCalledWith(client, '2026-11-25', '2026-11-28')
  })

  it('AC-8537.2: 이은 병원이면 캘린더 이름·이은 날·off 낱말·색·기본 색·모든 직원·사람 목록', async () => {
    vi.mocked(loadGcalView).mockResolvedValueOnce(view({ look: { ...DEFAULT_GCAL_LOOK, offWord: '휴무', offColor: 'basil' }, rules: { ...DEFAULT_GCAL_RULES, offAllStaff: false } }))
    vi.mocked(loadOffNames).mockResolvedValueOnce(INFO.people)
    await expect(createGcalOffStore(client).loadInfo()).resolves.toEqual({ ...INFO, offWord: '휴무', offColor: 'basil', offAllStaff: false })
  })

  it.each([
    ['연결 줄이 없음', null],
    ['캘린더를 아직 안 고름', view({ calendarId: null })],
    ['처음 가져오기 전(이은 날 없음)', view({ linkedOn: null })],
  ])('AC-8537.3: 잇지 않은 병원(%s)이면 null — 사람 목록은 읽지 않는다', async (_, row) => {
    vi.mocked(loadGcalView).mockResolvedValueOnce(row)
    await expect(createGcalOffStore(client).loadInfo()).resolves.toBeNull()
    expect(loadOffNames).not.toHaveBeenCalled()
  })

  it('AC-8537.3: Supabase 클라이언트를 만들지 못하면(설정 없음) 저장 층이 없다', () => {
    vi.mocked(supabaseBrowser).mockImplementationOnce(() => {
      throw new Error('no env')
    })
    expect(browserGcalOffStore()).toBeNull()
    vi.mocked(supabaseBrowser).mockReturnValueOnce(client as never)
    expect(browserGcalOffStore()).not.toBeNull()
  })
})

describe('AC-8537.3: 읽기 훅 useGcalOff', () => {
  const fake = (info: Promise<GcalOffInfo | null>): GcalOffStore => ({
    loadInfo: vi.fn(() => info),
    listAllDay: vi.fn(),
    listOffDays: vi.fn(),
    sendOffDay: vi.fn(),
  })

  it('AC-8537.2: 이은 병원이면 연결 정보와 저장 층을 준다(같은 값을 다시 준다)', async () => {
    const store = fake(Promise.resolve(INFO))
    const { result, rerender } = renderHook(() => useGcalOff(() => store))
    await waitFor(() => expect(result.current).not.toBeNull())
    const first = result.current
    expect(first?.info).toEqual(INFO)
    expect(first?.store).toBe(store)
    rerender()
    expect(result.current).toBe(first)
    expect(store.loadInfo).toHaveBeenCalledTimes(1)
  })

  it('AC-8537.3: 잇지 않은 병원·읽기 실패·저장 층 없음이면 null(지금 화면 그대로)', async () => {
    const none = fake(Promise.resolve(null))
    const a = renderHook(() => useGcalOff(() => none))
    await waitFor(() => expect(none.loadInfo).toHaveBeenCalled())
    expect(a.result.current).toBeNull()
    const failing = fake(Promise.reject(new Error('x')))
    const b = renderHook(() => useGcalOff(() => failing))
    await waitFor(() => expect(failing.loadInfo).toHaveBeenCalled())
    expect(b.result.current).toBeNull()
    const c = renderHook(() => useGcalOff(() => null))
    expect(c.result.current).toBeNull()
  })

  it('AC-8537.3: 관리자가 다른 의원을 보는 중이면 읽지 않고 null', () => {
    const store = fake(Promise.resolve(INFO))
    const wrapper = ({ children }: { children: ReactNode }) => createElement(ViewingProvider, { viewing: { hospitalId: 'h-other', name: '다른 의원' } } as ComponentProps<typeof ViewingProvider>, children)
    const { result } = renderHook(() => useGcalOff(() => store), { wrapper })
    expect(result.current).toBeNull()
    expect(store.loadInfo).not.toHaveBeenCalled()
  })
})
