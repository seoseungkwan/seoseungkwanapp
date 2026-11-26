// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import {
  addAllDay,
  addAppt,
  CalendarStorageError,
  deleteAllDay,
  deleteAppt,
  listAllDay,
  listAppts,
  listCalendarCounts,
  loadCalendarRev,
  insertGoogleAppts,
  loadCalendarSettings,
  setApptAuto,
  updateAppt,
} from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import { requestPull, sendAppt, syncNow } from '@/lib/gcal/loop'
import { resetGcalStatus, setGcalStatus } from '@/lib/gcal/status'
import { deleteGcalFix, listGcalFixes, loadGcalState, loadGcalView, loadOffNames, setArrivalProgress, setFixState } from '@/lib/storage/gcal'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalFix, type GcalView } from '@/types/gcal'
import type { BridgeState } from '@/types/bridge'
import type { CalAllDay } from '@/lib/calendar/shapes'
import { DEFAULT_CAL_SETTINGS, type ApptDraft, type CalAppt, type CalSettings } from '@/types/calendar'
import type { ClinicProfile, DayHours } from '@/types/clinicProfile'
import type { CalendarWorkerMessage } from '@/workers/calendar/messages'
import { CalendarScreen } from './CalendarScreen'
import { GHOST_NOTE } from './rows/GhostBlock'

// 예약 화면(spec clinic-calendar REQ-5905·REQ-5906·REQ-5907, 시안 docs/mockups/clinic-calendar ?s=week·day·month·new·phone-new·
// overlap-warn·off-warn·detail·settings·summary·phone-week). 라우트 page가 <CalendarScreen initialToday={todayInKorea()} />로 그린다.
// 저장 함수·Worker·통로(useBridge)·시계는 흉내 낸다(실제 Supabase·비트에 붙지 않는다). 이름은 ○○로 가린 가짜, 차트번호는 지어낸 값

vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/calendar')>()),
  listAppts: vi.fn(),
  listAllDay: vi.fn(),
  listCalendarCounts: vi.fn(),
  loadCalendarRev: vi.fn(),
  loadCalendarSettings: vi.fn(),
  saveCalendarSettings: vi.fn(),
  addAppt: vi.fn(),
  updateAppt: vi.fn(),
  setApptAuto: vi.fn(),
  deleteAppt: vi.fn(),
  addAllDay: vi.fn(),
  deleteAllDay: vi.fn(),
  insertGoogleAppts: vi.fn(),
}))
// 구글 캘린더(spec google-link). 기본은 잇지 않은 병원(loadGcalView null) → 지금 화면 그대로. 맞춤 엔진(loop)은 흉내 낸다
vi.mock('@/lib/storage/gcal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/gcal')>()),
  loadGcalView: vi.fn(),
  loadGcalState: vi.fn(),
  listGcalFixes: vi.fn(),
  loadOffNames: vi.fn(),
  setFixState: vi.fn(),
  deleteGcalFix: vi.fn(),
  saveOffDay: vi.fn(),
  setArrivalProgress: vi.fn(),
}))
vi.mock('@/lib/gcal/loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gcal/loop')>()),
  requestPull: vi.fn(),
  syncNow: vi.fn(),
  sendAppt: vi.fn(),
}))
// 병원 정보(spec clinic-profile REQ-6603). 기본은 줄 없음(null) → 지금처럼 예약 설정 시행자·시간
vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  loadClinicProfile: vi.fn(),
}))

// 가짜 Worker: 화면이 보낸 메시지를 모으고, 시험이 Worker 답을 넣는다
const fake = vi.hoisted(() => {
  type Listener = (event: Event) => void
  const listeners = new Map<string, Set<Listener>>()
  return {
    posted: [] as unknown[],
    listeners,
    worker: {
      postMessage(message: unknown) {
        fake.posted.push(message)
      },
      addEventListener(type: string, listener: Listener) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(listener)
      },
      removeEventListener(type: string, listener: Listener) {
        listeners.get(type)?.delete(listener)
      },
      terminate() {},
    },
  }
})
vi.mock('./useCalendarWorker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useCalendarWorker')>()),
  useCalendarWorkerObject: () => fake.worker,
}))

async function reply(message: CalendarWorkerMessage) {
  await act(async () => {
    for (const listener of [...(fake.listeners.get('message') ?? [])]) listener(new MessageEvent('message', { data: message }))
  })
}
const postsOf = (type: string) => fake.posted.filter((m) => (m as { type: string }).type === type)

const stream = vi.fn()
function link(state: BridgeState, helperVersion?: string) {
  vi.mocked(useBridge).mockReturnValue({
    state,
    hello: helperVersion ? ({ state, helperVersion } as never) : null,
    helloError: null,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream,
    onProgress: vi.fn(),
    close: vi.fn(),
    retry: vi.fn(),
  } as never)
}

const NOW = new Date('2026-11-17T01:40:00Z') // 한국 11/17 (화) 10:40
const TODAY = '2026-11-17'
const SETTINGS: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
    { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
  ],
}

const appt = (id: string, over: Partial<CalAppt>): CalAppt => ({
  id,
  day: TODAY,
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
  ...over,
})
const BASE_APPTS: CalAppt[] = [
  appt('a1', {}),
  appt('a2', { day: '2026-11-16', start: 900, chart: '23580', name: '정○○', staffId: 'na', staffName: '윤○○', staffMark: '나', kindId: 'jabo', kindName: '자보도수', auto: 'noshow' }),
  appt('a3', { day: '2026-11-18', start: 600, chart: '18842', name: '문○○', status: 'cancel' }),
  appt('a4', {
    day: '2026-11-19',
    start: 660,
    len: 10,
    chart: '30117',
    name: '송○○',
    staffId: 'won',
    staffName: '원장님',
    staffMark: '원',
    kindId: 'inj',
    kindName: '주사',
    origDay: '2026-11-18',
    origStart: 900,
  }),
]
const BASE_ALLDAY: CalAllDay[] = [{ id: 'd1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' }]

let db: { appts: CalAppt[]; allday: CalAllDay[]; settings: CalSettings }
const inRange = (day: string, from: string, to: string) => day >= from && day <= to

function savedOf(draft: ApptDraft, id: string): CalAppt {
  return { gEventId: null, gUpdated: null, gTitle: null, gColor: null, colorFrom: 'app', gKeepTitle: false, gMoved: false, gGone: false, gWait: null, gWaitAt: null, gNote: null, gFrom: null, gHow: null, createdAt: '2026-11-01T00:00:00+00:00', ...draft, id, auto: null, origDay: null, origStart: null }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fake.posted.length = 0
  fake.listeners.clear()
  stream.mockReset()
  let n = 0
  stream.mockImplementation(async () => ({ id: `s${++n}`, count: 1 }))
  link('no-extension')
  db = { appts: [...BASE_APPTS], allday: [...BASE_ALLDAY], settings: SETTINGS }
  vi.mocked(loadCalendarRev).mockReset().mockResolvedValue(1)
  vi.mocked(loadCalendarSettings).mockReset().mockImplementation(async () => db.settings)
  vi.mocked(listAppts)
    .mockReset()
    .mockImplementation(async (_c, from, to) => db.appts.filter((a) => inRange(a.day, from, to)))
  vi.mocked(listAllDay)
    .mockReset()
    .mockImplementation(async (_c, from, to) => db.allday.filter((d) => inRange(d.day, from, to)))
  vi.mocked(listCalendarCounts)
    .mockReset()
    .mockImplementation(async (_c, from, to) =>
      db.appts
        .filter((a) => inRange(a.day, from, to))
        .map(({ day, staffId, staffName, kindId, kindName, status, auto, origDay, gMoved }) => ({ day, staffId, staffName, kindId, kindName, status, auto, origDay, gMoved })),
    )
  vi.mocked(addAppt).mockReset().mockImplementation(async (_c, draft) => savedOf(draft, `new-${draft.day}`))
  vi.mocked(updateAppt)
    .mockReset()
    .mockImplementation(async (_c, id, patch) => ({ ...db.appts.find((a) => a.id === id)!, ...patch }))
  vi.mocked(deleteAppt).mockReset().mockResolvedValue(undefined)
  vi.mocked(setApptAuto).mockReset().mockResolvedValue(undefined)
  vi.mocked(addAllDay).mockReset().mockImplementation(async (_c, item) => ({ ...item, id: 'd-new' }))
  vi.mocked(deleteAllDay).mockReset().mockResolvedValue(undefined)
  vi.mocked(loadClinicProfile).mockReset().mockResolvedValue(null)
  vi.mocked(insertGoogleAppts).mockReset().mockResolvedValue({ sent: 1, blocked: 0 })
  vi.mocked(loadGcalView).mockReset().mockResolvedValue(null)
  vi.mocked(loadGcalState)
    .mockReset()
    .mockResolvedValue({ pulledUntil: null, lastOkAt: null, failSince: null, failCode: null, arrivalUntil: null, arrivalDone: false })
  vi.mocked(listGcalFixes).mockReset().mockResolvedValue([])
  vi.mocked(loadOffNames).mockReset().mockResolvedValue([])
  vi.mocked(setFixState).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteGcalFix).mockReset().mockResolvedValue(undefined)
  vi.mocked(setArrivalProgress).mockReset().mockResolvedValue(undefined)
  vi.mocked(requestPull).mockReset()
  vi.mocked(syncNow).mockReset().mockResolvedValue({ ok: true, changed: 0, sent: 0, at: '2026-11-17T05:37:00.000Z' })
  vi.mocked(sendAppt).mockReset().mockResolvedValue({ ok: true, did: 'sent' })
  resetGcalStatus()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

async function open() {
  const view = render(<CalendarScreen initialToday={TODAY} />)
  await waitFor(() => expect(document.querySelector('[data-slot-day], [aria-label="월 보기"], [aria-expanded]')).not.toBeNull())
  return view
}
const title = () => (screen.getByRole('heading', { level: 1 }).textContent ?? '').replace(/\s+/g, ' ').trim()
const columns = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot-day]')).map((el) => el.dataset.slotDay)
const block = (name: RegExp) => screen.getByRole('button', { name })
const dialog = (name: string) => screen.getByRole('dialog', { name })
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
const items = (el: Element) => Array.from(el.querySelectorAll('[data-item]')).map(text)

function openAdd() {
  fireEvent.click(screen.getByRole('button', { name: '예약 더하기' }))
  return dialog('예약 더하기')
}
function fillBasics(panel: HTMLElement, name = '이○○', staff: string | RegExp = '(가) 한○○', kind = /^주사/) {
  fireEvent.change(within(panel).getByLabelText('이름'), { target: { value: name } })
  fireEvent.click(within(within(panel).getByRole('group', { name: '담당' })).getByRole('button', { name: staff }))
  fireEvent.click(within(within(panel).getByRole('group', { name: '종류' })).getByRole('button', { name: kind }))
}

describe('AC-5905.1 예약표 보기', () => {
  it('AC-5905.1: 열면 주 보기(월~토)가 기본이고 도구 줄([오늘]·◀▶·[일·주·월]·[설정]·[+ 예약 더하기])·안내 줄이 있다. 1024px 이상 넓은 화면(data-wide-page)이다', async () => {
    await open()
    expect(title()).toBe('2026년 11월 16일 – 21일')
    expect(columns()).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
    expect(listAppts).toHaveBeenCalledWith(CLIENT, '2026-11-16', '2026-11-22')
    for (const name of ['오늘', '이전 주', '다음 주', '예약 더하기']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByRole('link', { name: '예약 설정' })).toBeTruthy() // 톱니는 구글 캘린더 설정으로 가는 링크(google-link AC-8529.3)
    const views = within(screen.getByRole('group', { name: '보기' })).getAllByRole('button')
    expect(views.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['일', 'false'],
      ['주', 'true'],
      ['월', 'false'],
    ])
    expect(screen.getAllByText('비트 없는 기기').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-wide-page]')).not.toBeNull()
    expect(document.querySelector('[data-today="true"]')?.getAttribute('data-slot-day')).toBe(TODAY)
  })

  it('AC-5905.1: 칸 글은 `차트번호 이름 종류 (표시)` + 길이, 같은 날 예약이 그 날 칸에 있다', async () => {
    await open()
    const a1 = block(/^10231 김○○ 도수 \(가\) 09:30–10:00 30분/)
    expect(a1.closest('[data-slot-day]')?.getAttribute('data-slot-day')).toBe(TODAY)
    expect(text(a1)).toContain('10231 김○○ 도수 (가) 30분')
  })

  it('AC-5905.1: 설정이 일요일 보기를 켜면 주 보기는 월~일이다', async () => {
    db.settings = { ...SETTINGS, sunday: true }
    await open()
    await waitFor(() => expect(columns()).toHaveLength(7))
    expect(title()).toBe('2026년 11월 16일 – 22일')
  })

  it('AC-5905.1: [일]은 그날 일 보기, [월]은 수만 그린 월 보기(listCalendarCounts), 월 칸을 누르면 그날 일 보기다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '일' }))
    await waitFor(() => expect(columns()).toEqual([TODAY]))
    expect(title()).toBe('2026년 11월 17일 (화)')
    expect(listAppts).toHaveBeenCalledWith(CLIENT, TODAY, TODAY)

    fireEvent.click(screen.getByRole('button', { name: '월' }))
    const month = await screen.findByRole('region', { name: '월 보기' })
    expect(title()).toBe('2026년 11월')
    expect(listCalendarCounts).toHaveBeenCalledWith(CLIENT, '2026-10-26', '2026-12-06')
    expect(within(month).getByRole('button', { name: '11월 16일 (월) 예약 1' })).toBeTruthy()
    fireEvent.click(within(month).getByRole('button', { name: '11월 19일 (목) 예약 1' }))
    await waitFor(() => expect(columns()).toEqual(['2026-11-19']))
    expect(title()).toBe('2026년 11월 19일 (목)')
  })

  it('AC-5905.1: ◀▶는 한 주씩 옮기고 [오늘]은 오늘이 든 주로 돌아온다. 날짜 머리를 누르면 그날 일 보기다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '다음 주' }))
    await waitFor(() => expect(columns()[0]).toBe('2026-11-23'))
    expect(title()).toBe('2026년 11월 23일 – 28일')
    expect(listAppts).toHaveBeenCalledWith(CLIENT, '2026-11-23', '2026-11-29')
    fireEvent.click(screen.getByRole('button', { name: '오늘' }))
    await waitFor(() => expect(columns()[0]).toBe('2026-11-16'))
    fireEvent.click(screen.getByRole('button', { name: /^11월 18일 \(수\) 예약/ }))
    await waitFor(() => expect(columns()).toEqual(['2026-11-18']))
  })
})

describe('AC-5905.2 예약 더하기', () => {
  it('AC-5905.2: [+ 예약 더하기]는 오늘 지금 다음 10분 자리 판이고, 이름·담당·종류가 차야 저장할 수 있다. 종류를 고르면 길이가 그 종류 기본이 된다', async () => {
    await open()
    const panel = openAdd()
    expect((within(panel).getByLabelText('날짜') as HTMLInputElement).value).toBe(TODAY)
    expect((within(panel).getByLabelText('시작') as HTMLInputElement).value).toBe('10:50') // 10:40 다음 10분
    const save = within(panel).getByRole('button', { name: '저장' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect(panel.querySelector('output')?.textContent).toBe('30분')
    fillBasics(panel)
    expect(panel.querySelector('output')?.textContent).toBe('10분') // 주사 기본 길이
    expect((save as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-5905.2: 저장하면 addAppt(상태 auto)로 넣고 판이 닫히며 칸이 바로 보인다. 알림 글이 뜬다', async () => {
    await open()
    const panel = openAdd()
    fillBasics(panel)
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(addAppt).toHaveBeenCalledTimes(1))
    expect(addAppt).toHaveBeenCalledWith(CLIENT, {
      day: TODAY,
      start: 650,
      len: 10,
      name: '이○○',
      chart: null,
      staffId: 'ga',
      staffName: '한○○',
      staffMark: '가',
      kindId: 'inj',
      kindName: '주사',
      memo: '',
      status: 'auto',
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '예약 더하기' })).toBeNull())
    expect(block(/^이○○ 주사 \(가\) 10:50–11:00 10분/)).toBeTruthy()
    expect(await screen.findByText('11월 17일 (화) 10:50 예약을 넣었어요. 다른 PC에도 몇 초 안에 보여요.')).toBeTruthy()
  })

  it('AC-5905.2: 같은 담당 겹침이면 경고 글과 [그래도 저장](?s=overlap-warn)이고, 눌러야 저장된다', async () => {
    await open()
    const panel = openAdd()
    fireEvent.change(within(panel).getByLabelText('시작'), { target: { value: '0940' } }) // 09:40, (가) 09:30–10:00과 겹침
    fillBasics(panel, '이○○', '(가) 한○○', /^도수/)
    expect(within(panel).getByRole('alert').textContent).toContain('담당에게 같은 시간 예약이 있어요: 09:30–10:00 10231 김○○ 도수')
    expect(addAppt).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: '그래도 저장' }))
    await waitFor(() => expect(addAppt).toHaveBeenCalledTimes(1))
  })

  it('AC-5905.2: 그날 휴무인 시행자를 고르면 휴무 경고(?s=off-warn)다', async () => {
    db.allday = [{ id: 'd9', day: TODAY, type: 'off', memo: null, staffId: 'na', staffName: '윤○○' }]
    await open()
    const panel = openAdd()
    fillBasics(panel, '최○○', /^\(나\) 윤○○\s*휴무$/, /^자보도수/)
    expect(within(panel).getByRole('alert').textContent).toContain('담당은 11월 17일 (화) 휴무예요')
    expect(within(panel).getByRole('button', { name: '그래도 저장' })).toBeTruthy()
  })

  it('AC-5905.2: 빈 칸을 누르면 그 날짜·시각으로 더하기 판이 열린다', async () => {
    await open()
    fireEvent.click(document.querySelector('[data-slot-day="2026-11-20"]')!, { clientY: 0 })
    const panel = dialog('예약 더하기')
    expect((within(panel).getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-20')
    expect((within(panel).getByLabelText('시작') as HTMLInputElement).value).toBe('08:00')
  })
})

describe('AC-6002 시작 시간 쳐서 넣기 (spec calendar-colors)', () => {
  it("AC-6002.2: 시작에 1430을 치면 판 시간 줄과 예약표 '새 예약' 칸이 바로 14:30으로 가고, 저장하면 그 시각이다", async () => {
    await open()
    const panel = openAdd()
    expect(screen.getByText('새 예약 10:50–11:20')).toBeTruthy()
    const start = within(panel).getByLabelText('시작') as HTMLInputElement
    fireEvent.change(start, { target: { value: '1430' } })
    expect(within(panel).getByText('14:30 – 15:00')).toBeTruthy()
    expect(screen.getByText('새 예약 14:30–15:00')).toBeTruthy()
    fireEvent.blur(start)
    expect(start.value).toBe('14:30')
    fillBasics(panel)
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(addAppt).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addAppt).mock.calls[0]![1]).toMatchObject({ day: TODAY, start: 870, len: 10 })
  })

  it("AC-6002.3: 못 읽는 글이면 '새 예약' 칸은 마지막 시각 그대로, 저장 줄 맨 앞이 '시작'이고 [저장]이 막힌다. 벗어나면 오류 글", async () => {
    await open()
    const panel = openAdd()
    fillBasics(panel)
    const start = within(panel).getByLabelText('시작') as HTMLInputElement
    fireEvent.change(start, { target: { value: '1432' } })
    expect(screen.getByText('새 예약 10:50–11:00')).toBeTruthy()
    expect(panel.querySelector('[data-need]')?.textContent).toBe('시작 칸을 채우면 저장할 수 있어요')
    expect((within(panel).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.blur(start)
    expect(within(panel).getByText('5분 단위로 적어 주세요 (예: 14:30)')).toBeTruthy()
    expect(start.getAttribute('aria-invalid')).toBe('true')
    expect(addAppt).not.toHaveBeenCalled()
  })

  it('AC-6002.4: 판이 열린 채 예약표 빈 칸을 다시 누르면 시작 글이 그 시각 HH:MM으로 바뀌고 오류가 지워진다', async () => {
    await open()
    const panel = openAdd()
    const start = within(panel).getByLabelText('시작') as HTMLInputElement
    fireEvent.change(start, { target: { value: 'abc' } })
    fireEvent.blur(start)
    expect(within(panel).getByText('시간을 14:30처럼 적어 주세요')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-slot-day="2026-11-20"]')!, { clientY: 0 })
    const again = dialog('예약 더하기')
    const moved = within(again).getByLabelText('시작') as HTMLInputElement
    expect(moved.value).toBe('08:00')
    expect((within(again).getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-20')
    expect(within(again).queryByText('시간을 14:30처럼 적어 주세요')).toBeNull()
    expect(moved.getAttribute('aria-invalid')).toBeNull()
  })
})

describe('AC-5905.9 저장 실패', () => {
  it('AC-5905.9: 저장이 실패하면 판을 닫지 않고 값을 둔 채 오류 글을 보인다(끊김·실패·개인정보 모양)', async () => {
    await open()
    const panel = openAdd()
    fillBasics(panel)
    vi.mocked(addAppt).mockRejectedValueOnce(new CalendarStorageError('offline'))
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    expect(await within(panel).findByText('인터넷 연결이 끊겨 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.')).toBeTruthy()
    expect((within(panel).getByLabelText('이름') as HTMLInputElement).value).toBe('이○○')

    vi.mocked(addAppt).mockRejectedValueOnce(new CalendarStorageError('failed'))
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    expect(await within(panel).findByText('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.')).toBeTruthy()

    vi.mocked(addAppt).mockResolvedValueOnce('blocked')
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    expect(await within(panel).findByText('이름이나 메모에 전화번호·주민번호·메일 같은 글자가 있어 저장하지 않았어요.')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '예약 더하기' })).toBeTruthy()
  })

  it('AC-5905.9: 처음 읽기가 실패하면 오류 글과 [다시 불러오기]가 있고, 누르면 다시 읽는다', async () => {
    vi.mocked(listAppts).mockRejectedValueOnce(new CalendarStorageError('failed'))
    render(<CalendarScreen initialToday={TODAY} />)
    expect(await screen.findByText('예약을 불러오지 못했어요. 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(columns()).toHaveLength(6))
  })
})

describe('AC-5905.3 자세히 판', () => {
  it('AC-5905.3: 예약 칸을 누르면 자세히 판이고, 도착 [왔음]은 updateAppt(status came)로 저장되고 칸이 바뀐다', async () => {
    await open()
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    const panel = dialog('예약')
    fireEvent.click(within(within(panel).getByRole('group', { name: '도착 바꾸기' })).getByRole('button', { name: '왔음' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledWith(CLIENT, 'a1', { status: 'came' }))
    await waitFor(() => expect(block(/^10231 김○○ 도수 \(가\) 09:30–10:00 30분 · 왔음$/)).toBeTruthy())
  })

  it('AC-5905.3: [다음 주에도]는 7일 뒤 같은 칸으로 넣고(경고가 있어도) 알림으로 알리며 "넣었어요 ✓"로 바뀐다', async () => {
    db.appts.push(appt('n1', { day: '2026-11-24', start: 570, name: '박○○', chart: '10457' })) // 다음 주 같은 담당 겹침
    await open()
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    const panel = dialog('예약')
    fireEvent.click(within(panel).getByRole('button', { name: '다음 주에도' }))
    await waitFor(() => expect(addAppt).toHaveBeenCalledTimes(1))
    expect(addAppt).toHaveBeenCalledWith(CLIENT, {
      day: '2026-11-24',
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
    })
    expect(await within(panel).findByText('11월 24일 (화) 09:30에 넣었어요 ✓')).toBeTruthy()
    expect((within(panel).getByRole('button', { name: '다음 주에도' }) as HTMLButtonElement).disabled).toBe(true)
    expect(await screen.findByText('11월 24일 (화) 09:30에 똑같이 넣었어요. 그 시간에 같은 담당 예약이 있거나 휴무예요 — 확인해 주세요.')).toBeTruthy()
  })

  it('AC-5905.3: [예약 취소]는 status cancel로 저장하고 [취소 되돌리기]가 된다. 되돌리면 auto다', async () => {
    await open()
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    fireEvent.click(within(dialog('예약')).getByRole('button', { name: '예약 취소' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledWith(CLIENT, 'a1', { status: 'cancel' }))
    expect(await screen.findByText('예약을 취소했어요. 칸은 흐리게 남아요.')).toBeTruthy()
    db.appts = db.appts.map((a) => (a.id === 'a1' ? { ...a, status: 'cancel' } : a))
    fireEvent.click(await within(dialog('예약')).findByRole('button', { name: '취소 되돌리기' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledWith(CLIENT, 'a1', { status: 'auto' }))
  })

  it('AC-5905.3: [지우기]는 한 번 더 묻고 deleteAppt로 지운다. 칸이 없어진다', async () => {
    await open()
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    const panel = dialog('예약')
    fireEvent.click(within(panel).getByRole('button', { name: '지우기' }))
    expect(deleteAppt).not.toHaveBeenCalled()
    expect(within(panel).getByText('이 예약을 지울까요? 되돌릴 수 없어요.')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(deleteAppt).toHaveBeenCalledWith(CLIENT, 'a1'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '예약' })).toBeNull())
    expect(screen.queryByRole('button', { name: /^10231 김○○/ })).toBeNull()
    expect(await screen.findByText('예약을 지웠어요.')).toBeTruthy()
  })

  it('AC-5905.3·AC-5906.2: [고치기]는 그 예약 칸으로 고치기 판을 열고, 시작을 옮겨 저장하면 updateAppt이고 처음 자리를 알린다', async () => {
    vi.mocked(updateAppt).mockImplementation(async (_c, id, patch) => ({ ...db.appts.find((a) => a.id === id)!, ...patch, origDay: TODAY, origStart: 570 }))
    await open()
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    fireEvent.click(within(dialog('예약')).getByRole('button', { name: '고치기' }))
    const panel = dialog('예약 고치기')
    expect((within(panel).getByLabelText('이름') as HTMLInputElement).value).toBe('김○○')
    fireEvent.change(within(panel).getByLabelText('시작'), { target: { value: '1000' } })
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateAppt).mock.calls[0]!.slice(1)).toEqual([
      'a1',
      { day: TODAY, start: 600, len: 30, name: '김○○', chart: '10231', staffId: 'ga', staffName: '한○○', staffMark: '가', kindId: 'dosu', kindName: '도수', memo: '' },
    ])
    expect(await screen.findByText("예약을 옮겼어요. '변경'으로 표시하고 원래 시간(11/17 (화) 09:30)을 남겼어요.")).toBeTruthy()
    expect(block(/^10231 김○○ 도수 \(가\) 10:00–10:30 30분 · 변경 \(원래 11\/17 \(화\) 09:30\)$/)).toBeTruthy()
  })

  it('AC-5906.2: 옮긴 예약은 칸에 작은 "변경" 표시가 있고 자세히 판에 원래 자리가 있다', async () => {
    await open()
    const moved = block(/^30117 송○○ 주사 \(원\)/)
    expect(within(moved).getByText('변경')).toBeTruthy()
    expect(within(block(/^10231 김○○ 도수/)).queryByText('변경')).toBeNull()
    fireEvent.click(moved)
    expect(within(dialog('예약')).getByText('원래 11/18 (수) 15:00')).toBeTruthy()
  })
})

describe('AC-5905.4 종일 줄', () => {
  it('AC-5905.4: 종일 줄을 누르면 작은 판이고 메모를 넣으면 addAllDay로 저장되어 그날 칩이 보인다', async () => {
    await open()
    fireEvent.click(document.querySelector('[data-allday-day="2026-11-19"]')!)
    const pop = dialog('11월 19일 (목) · 종일')
    fireEvent.change(within(pop).getByLabelText('종일 메모'), { target: { value: '학회' } })
    fireEvent.click(within(pop).getByRole('button', { name: '더하기' }))
    await waitFor(() => expect(addAllDay).toHaveBeenCalledWith(CLIENT, { day: '2026-11-19', type: 'memo', memo: '학회', staffId: null, staffName: null }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '11월 19일 (목) · 종일' })).toBeNull())
    expect(within(document.querySelector('[data-allday-day="2026-11-19"]')!).getByText('학회')).toBeTruthy()
  })

  it('AC-5905.4: 그날 항목을 지우면 deleteAllDay로 지운다. 휴무 칩은 그 시행자 색(바질)이다', async () => {
    await open()
    const cell = document.querySelector<HTMLElement>('[data-allday-day="2026-11-18"]')!
    const chip = within(cell).getByRole('button', { name: '(나) 윤○○ 휴무' })
    expect(chip.className).toContain('bg-cal-basil')
    fireEvent.click(chip)
    const pop = dialog('11월 18일 (수) · 종일')
    fireEvent.click(within(pop).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(deleteAllDay).toHaveBeenCalledWith(CLIENT, 'd1'))
    await waitFor(() => expect(within(cell).queryByText('(나) 윤○○ 휴무')).toBeNull())
  })
})

describe('AC-5905.5 설정', () => {
  // google-link AC-8529.3: 옛 예약 설정 서랍(CalendarSettings)은 지웠다 — 톱니는 설정 › 구글 캘린더 › 시행자·종류로 간다(잇지 않은 병원도)
  it('AC-8529.3: 톱니(예약 설정)는 /settings/google-calendar?tab=colors 링크이고 옛 설정 서랍은 열리지 않는다', async () => {
    await open()
    const gear = screen.getByRole('link', { name: '예약 설정' })
    expect(gear.getAttribute('href')).toBe('/settings/google-calendar?tab=colors')
    fireEvent.click(gear)
    expect(screen.queryByRole('dialog', { name: '예약 설정' })).toBeNull()
  })

  it('AC-5905.5·AC-8503.5: 목록에서 지운 시행자의 예약은 저장된 이름 그대로 캘린더 기본 색으로 보인다', async () => {
    db.settings = { ...SETTINGS, staff: SETTINGS.staff.filter((s) => s.id !== 'na') }
    await open()
    const gone = block(/^23580 정○○ 자보도수 \(나\)/)
    expect(gone.className).toContain('bg-cal-default')
  })
})

describe('AC-5907.2 합계 줄', () => {
  it('AC-5907.2: 도구 줄 아래에 보이는 기간 합계(취소 포함)가 있고, 누르면 시행자별·종류별 표가 열린다', async () => {
    await open()
    const line = screen.getByRole('button', { name: /이 주 합계/ })
    expect(items(line)).toEqual(['예약 4', '취소 1 (25.0%)', '변경 1 (25.0%)', '안 옴 1 (25.0%)'])
    fireEvent.click(line)
    const panel = screen.getByRole('region', { name: '이 주 나눠 보기' })
    expect(within(panel).getByText('시행자별')).toBeTruthy()
    expect(within(panel).getByText('종류별')).toBeTruthy()
  })

  it('AC-5907.2: 월 보기 합계는 그 달 날짜의 예약만 센다(월 칸의 앞뒤 달 날짜는 빼고)', async () => {
    db.appts.push(appt('oct', { day: '2026-10-28' }), appt('dec', { day: '2026-12-02' }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: '월' }))
    await screen.findByRole('region', { name: '월 보기' })
    expect(items(screen.getByRole('button', { name: /이 달 합계/ }))[0]).toBe('예약 4')
  })
})

describe('AC-5905.8 비트 없는 기기', () => {
  it('AC-5905.8: 도우미가 없으면 비트 찾기·비트 예약 칸·도착 셈이 없고 더하기 판에 "비트 PC에서는 자동으로 채워져요"다', async () => {
    await open()
    const panel = openAdd()
    expect(within(panel).getByText('비트 PC에서는 자동으로 채워져요')).toBeTruthy()
    fireEvent.change(within(panel).getByLabelText('이름'), { target: { value: '김○○' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(stream).not.toHaveBeenCalled()
    expect(fake.posted.filter((m) => (m as { type: string }).type !== 'bridge-port')).toEqual([])
    expect(setApptAuto).not.toHaveBeenCalled()
  })

  it('AC-5905.8: 도우미 0.10.0 미만이면 비트 없는 기기처럼 그린다', async () => {
    link('ready', '0.9.1')
    await open()
    expect(screen.getAllByText('비트 없는 기기').length).toBeGreaterThan(0)
    expect(stream).not.toHaveBeenCalled()
  })

  it('AC-5905.8: 768px 미만 주 보기는 날짜별 목록(?s=phone-week)이고 오늘만 펼친다', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('767'), media: query, addEventListener() {}, removeEventListener() {} }),
    })
    await open()
    await waitFor(() => expect(document.querySelector('[data-slot-day]')).toBeNull())
    const today = screen.getByRole('button', { name: '11월 17일 (화) 오늘 예약 1' })
    expect(today.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: '11월 18일 (수) 예약 0' }).getAttribute('aria-expanded')).toBe('false')
  })
})

describe('AC-5905.6·AC-5905.7 비트 PC', () => {
  beforeEach(() => link('ready', '0.10.0'))

  it('AC-5905.7: 기간을 그리면 Worker days를 부르고, 받은 auto는 setApptAuto로 적어 칸이 바뀐다. 비트 예약 칸을 그리고 누르면 안내 글이다', async () => {
    await open()
    expect(screen.getAllByText('비트 연결됨').length).toBeGreaterThan(0)
    await waitFor(() => expect(postsOf('days')).toHaveLength(1))
    expect(stream).toHaveBeenCalledWith('contact.targets', { kind: 'calday', from: '2026-11-16', to: '2026-11-22' })
    const ghost = { key: 'bit-202611181030-0', day: '2026-11-18', start: 630, chart: '25190', name: '오○○' }
    await reply({ type: 'days', from: '2026-11-16', to: '2026-11-22', auto: [['a1', 'came']], ghosts: [ghost] })
    await waitFor(() => expect(setApptAuto).toHaveBeenCalledWith(CLIENT, 'a1', 'came', expect.objectContaining({ day: expect.any(String), start: expect.any(Number) })))
    await waitFor(() => expect(block(/^10231 김○○ 도수 \(가\) 09:30–10:00 30분 · 왔음$/)).toBeTruthy())
    fireEvent.click(block(/^비트 예약 10:30 25190 오○○/))
    expect(await screen.findByText(GHOST_NOTE)).toBeTruthy()
  })

  it('AC-5905.7: 같은 날 같은 차트번호 예약이 있는 비트 예약 칸은 그리지 않는다', async () => {
    await open()
    await waitFor(() => expect(postsOf('days')).toHaveLength(1))
    await reply({ type: 'days', from: '2026-11-16', to: '2026-11-22', auto: [], ghosts: [{ key: 'g', day: TODAY, start: 840, chart: '10231', name: '김○○' }] })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /^비트 예약/ })).toBeNull()
  })

  it('AC-5905.6: 이름을 적고 400ms 멈추면 Worker find로 찾고, 한 명이면 차트번호를 채운다(옅은 초록)', async () => {
    await open()
    const panel = openAdd()
    expect(within(panel).queryByText('비트 PC에서는 자동으로 채워져요')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('이름'), { target: { value: '김○' } })
    expect(postsOf('find')).toHaveLength(0)
    await waitFor(() => expect(stream).toHaveBeenCalledWith('contact.targets', { kind: 'calfind', from: TODAY, to: TODAY, q: '김○' }), { timeout: 2000 })
    await waitFor(() => expect(postsOf('find')).toHaveLength(1))
    await reply({ type: 'found', rows: [{ chart: '10231', name: '김○○', sex: '여', age: 61, last: '2026-11-10' }], more: false })
    const chart = within(panel).getByLabelText(/^차트번호/) as HTMLInputElement
    await waitFor(() => expect(chart.value).toBe('10231'))
    expect(chart.dataset.filled).toBe('true')
    expect((within(panel).getByLabelText('이름') as HTMLInputElement).value).toBe('김○○')
    expect(within(panel).getByText('✓ 비트에서 찾아 차트번호를 채웠어요')).toBeTruthy()
  })

  it('AC-5905.6: 여럿이면 고르기 목록(성별·나이·마지막 내원)이고, 고르면 이름·차트번호 두 칸만 들어간다', async () => {
    await open()
    const panel = openAdd()
    fireEvent.change(within(panel).getByLabelText('이름'), { target: { value: '김○' } })
    await waitFor(() => expect(postsOf('find')).toHaveLength(1), { timeout: 2000 })
    await reply({
      type: 'found',
      rows: [
        { chart: '10231', name: '김○○', sex: '여', age: 61, last: '2026-11-10' },
        { chart: '20944', name: '김○○', sex: '남', age: 34, last: '2025-03-02' },
      ],
      more: false,
    })
    const list = await within(panel).findByRole('listbox', { name: '같은 이름 고르기' })
    expect(text(list)).toContain('남 · 34세 · 마지막 내원 2025/03/02')
    fireEvent.click(within(list).getByRole('option', { name: /20944/ }))
    expect((within(panel).getByLabelText(/^차트번호/) as HTMLInputElement).value).toBe('20944')
    expect((within(panel).getByLabelText('이름') as HTMLInputElement).value).toBe('김○○')
    expect(within(panel).queryByRole('listbox')).toBeNull()
  })

  it('AC-5905.6: 없으면 "비트에 없어요. 신환이면 차트번호는 비워 두세요."다', async () => {
    await open()
    const panel = openAdd()
    fireEvent.change(within(panel).getByLabelText(/^차트번호/), { target: { value: '99999' } })
    await waitFor(() => expect(postsOf('find')).toHaveLength(1), { timeout: 2000 })
    expect(stream).toHaveBeenCalledWith('contact.targets', { kind: 'calfind', from: TODAY, to: TODAY, q: '99999' })
    await reply({ type: 'found', rows: [], more: false })
    expect(await within(panel).findByText('비트에 없어요. 신환이면 차트번호는 비워 두세요.')).toBeTruthy()
  })
})

describe('AC-6603 예약이 병원 정보를 쓴다 (spec clinic-profile)', () => {
  const W: DayHours = { open: 540, close: 1110, lunchFrom: 780, lunchTo: 840 } // 09:00~18:30, 점심 13:00~14:00
  const PROFILE: ClinicProfile = {
    displayName: null,
    phone: null,
    address: null,
    honorific: '원장님',
    hours: [W, W, null, W, W, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null], // 수·일 휴진
    closedDates: ['2026-11-19'],
    staff: [
      { id: 'won', name: '원장님', role: 'doctor', mark: '원', color: 'graphite', calendar: true },
      { id: 'ga', name: '한○○', role: 'staff', mark: '가', color: 'blueberry', calendar: true },
      { id: 'na', name: '윤○○', role: 'staff', mark: '나', color: 'basil', calendar: false },
    ],
    logoPath: null,
    emr: 'bit',
  }
  beforeEach(() => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
  })
  const staffButtons = (panel: HTMLElement) => within(within(panel).getByRole('group', { name: '담당' })).getAllByRole('button').map(text)

  it('AC-6603.1: 담당 목록은 병원 정보의 예약에 보이기인 사람들(병원 정보 차례)이다', async () => {
    await open()
    await waitFor(() => expect(columns()).not.toContain('2026-11-18'))
    expect(staffButtons(openAdd())).toEqual(['(원) 원장님', '(가) 한○○'])
  })

  it('AC-6603.1: 병원 정보를 읽지 못하면 지금처럼 예약 설정 시행자다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue('failed')
    await open()
    expect(staffButtons(openAdd())).toEqual(['(가) 한○○', '(나) 윤○○', '(원) 원장님'])
    expect(columns()).toHaveLength(6)
  })

  it('AC-6603.2: 휴진 요일(수·일)은 주 보기 열에서 빠지고, 시간 줄은 09:00~19:00(18:30 올림)이다', async () => {
    await open()
    await waitFor(() => expect(columns()).toEqual(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20', '2026-11-21']))
    expect(title()).toBe('2026년 11월 16일 – 21일')
    expect(screen.queryByText('08:00')).toBeNull()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText('18:00')).toBeTruthy()
    expect(screen.queryByText('19:00')).toBeNull()
    expect(document.querySelector('[data-slot-day="2026-11-16"] [data-off="lunch"]')?.textContent).toBe('점심')
  })

  it('AC-6603.2: 일요일이 문 여는 날이면 주 보기에 일요일이 든다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue({ ...PROFILE, hours: [...PROFILE.hours.slice(0, 6), W] })
    await open()
    await waitFor(() => expect(columns()).toContain('2026-11-22'))
    expect(columns()).not.toContain('2026-11-18')
  })

  it('AC-6603.2: 일 보기 ◀▶는 휴진 요일을 건너뛴다(화 → 목, 토 → 다음 월)', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '일' }))
    await waitFor(() => expect(columns()).toEqual([TODAY]))
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    await waitFor(() => expect(columns()).toEqual(['2026-11-19']))
    fireEvent.click(screen.getByRole('button', { name: '이전 날' }))
    await waitFor(() => expect(columns()).toEqual([TODAY]))
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    await waitFor(() => expect(columns()).toEqual(['2026-11-21']))
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    await waitFor(() => expect(columns()).toEqual(['2026-11-23']))
  })

  it('AC-6603.3: 휴진일(11/19)은 주 보기 머리에 "휴진"이고 열이 회색이며, 빈 칸을 누르면 지금처럼 예약을 넣는다', async () => {
    await open()
    const head = await screen.findByRole('button', { name: '11월 19일 (목) 휴진 예약 1' })
    expect(within(head).getByText('휴진')).toBeTruthy()
    const col = document.querySelector<HTMLElement>('[data-slot-day="2026-11-19"]')!
    expect(col.dataset.closed).toBe('true')
    fireEvent.click(col, { clientY: 0 })
    const panel = dialog('예약 더하기')
    expect((within(panel).getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-19')
    expect((within(panel).getByLabelText('시작') as HTMLInputElement).value).toBe('09:00')
  })

  it('AC-6603.3: 월 보기에서도 휴진일 칸에 "휴진"이다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '월' }))
    const month = await screen.findByRole('region', { name: '월 보기' })
    const cell = within(month).getByRole('button', { name: '11월 19일 (목) 휴진 예약 1' })
    expect(within(cell).getByText('휴진')).toBeTruthy()
  })

  // AC-6603.4(종류를 저장해도 병원 정보 그대로)는 옛 예약 설정 서랍과 함께 빠졌다(google-link AC-8529.3 — 종류는 설정 › 구글 캘린더에서 저장)
})

describe('AC-7616.2 반차 휴무 경고의 경계 = 그 요일 병원 정보 점심 시작 (spec staff)', () => {
  const W: DayHours = { open: 540, close: 1110, lunchFrom: 780, lunchTo: 840 }
  const TUE: DayHours = { open: 540, close: 1110, lunchFrom: 720, lunchTo: 780 } // 화요일만 점심 12:00~13:00
  const PROFILE: ClinicProfile = {
    displayName: null,
    phone: null,
    address: null,
    honorific: '원장님',
    hours: [W, TUE, W, W, W, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null],
    closedDates: [],
    staff: [
      { id: 'won', name: '원장님', role: 'doctor', mark: '원', color: 'graphite', calendar: true },
      { id: 'ga', name: '한○○', role: 'staff', mark: '가', color: 'blueberry', calendar: true },
    ],
    logoPath: null,
    emr: 'bit',
  }
  const halfOff = (day: string, part: 'am' | 'pm'): CalAllDay => ({ id: `h-${day}`, day, type: 'off', memo: null, staffId: 'ga', staffName: '한○○', part })
  const start = (panel: HTMLElement, value: string) => fireEvent.change(within(panel).getByLabelText('시작'), { target: { value } })

  it("AC-7616.2: 화요일(점심 12:00) 오전 휴무 담당 — 12:30 시작은 경고 없고 11:50 시작은 휴무 경고다. 칩은 '오전 휴무'", async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    db.allday = [halfOff(TODAY, 'am')]
    await open()
    await waitFor(() => expect(screen.getByRole('button', { name: '(가) 한○○ 오전 휴무' })).toBeTruthy())
    const panel = openAdd()
    start(panel, '1230')
    fillBasics(panel, '최○○', /^\(가\) 한○○\s*오전 휴무$/, /^도수/)
    expect(within(panel).queryByRole('alert')).toBeNull()
    start(panel, '1150')
    expect(within(panel).getByRole('alert').textContent).toContain('담당은 11월 17일 (화) 휴무예요')
    expect(within(panel).getByRole('button', { name: '그래도 저장' })).toBeTruthy()
  })

  it('AC-7616.2: 병원 정보가 없으면 경계는 13:00 — 12:30 시작도 오전 휴무 경고다', async () => {
    db.allday = [halfOff(TODAY, 'am')]
    await open()
    const panel = openAdd()
    start(panel, '1230')
    fillBasics(panel, '최○○', /^\(가\) 한○○\s*오전 휴무$/, /^도수/)
    expect(within(panel).getByRole('alert').textContent).toContain('담당은 11월 17일 (화) 휴무예요')
  })

  it('AC-7616.2: [다음 주에도] 확인도 그 요일 점심 시작으로 나눈다(화 12:30 예약, 다음 주 오전 휴무 → 확인 글 없음)', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
    db.appts = [appt('n2', { start: 750, chart: '10457', name: '박○○' })]
    db.allday = [halfOff('2026-11-24', 'am')]
    await open()
    fireEvent.click(await screen.findByRole('button', { name: /^10457 박○○ 도수 \(가\)/ }))
    fireEvent.click(within(dialog('예약')).getByRole('button', { name: '다음 주에도' }))
    expect(await screen.findByText('11월 24일 (화) 12:30에 똑같이 넣었어요.')).toBeTruthy()
  })
})

// ── 구글 캘린더와 이은 병원 (spec google-link REQ-8532·8526·8534·8535·8536, 시안 docs/mockups/google-link/calendar.html ?s=week·fix·err) ──
// 화면이 연결(loadGcalView)·맞춤 상태(loadGcalState + lib/gcal/status)·고쳐야 할 것(listGcalFixes)을 스스로 읽는다. 맞춤 엔진(loop)은 흉내 낸다.
// 글은 notes-calendar 글자를 여기 따로 적어 견준다. 환자 이름은 지어낸 가짜다

describe('google-link 예약 탭', () => {
  const SSK = /^ssk[0-9a-f]{32}$/
  const VIEW: GcalView = {
    scriptUrl: 'https://script.google.com/macros/s/AKfy-test/exec',
    calendarId: 'abc123@group.calendar.google.com',
    calendarName: '2026 양지바른정형외과',
    defaultHex: '#039BE5',
    linkedOn: '2026-11-16',
    rules: { ...DEFAULT_GCAL_RULES },
    look: { ...DEFAULT_GCAL_LOOK },
    hasSecret: true,
  }
  const STATE = { pulledUntil: null, lastOkAt: '2026-11-17 05:35:10.123+00', failSince: null, failCode: null, arrivalUntil: null, arrivalDone: false }
  const FIX: GcalFix = {
    id: 'f1',
    gEventId: 'gev6402a',
    day: '2026-11-19',
    start: 960,
    len: 15,
    allDay: false,
    gColor: 'sage',
    gTitle: '6402 윤모의 (4000타)',
    reason: 'no-staff',
    guess: { chart: '6402', name: '윤모의', kindId: 'shock', kindHow: 'title', staffId: null, staffHow: null, memo: '4000타', word: null },
    state: 'open',
    gUpdated: '2026-11-17T01:31:00.000Z',
  }
  const PAIRED = 'ssk0123456789abcdef0123456789abcdef'
  const bandText = () => text(document.querySelector('[data-gcal-band] [data-band-text]')!)

  function linkGoogle(over: Partial<GcalView> = {}) {
    vi.mocked(loadGcalView).mockResolvedValue({ ...VIEW, ...over })
    vi.mocked(loadGcalState).mockResolvedValue(STATE)
  }

  it('AC-8532.1: 잇지 않은 병원은 띠가 없고 안내 줄은 지금 그대로다', async () => {
    await open()
    await waitFor(() => expect(loadGcalView).toHaveBeenCalledWith(CLIENT))
    expect(document.querySelector('[data-gcal-band]')).toBeNull()
    expect(screen.getAllByText('도수·자보도수·주사·진료는 담당 색').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('색 (구글과 같음)')
  })

  it('AC-8532.1: 이은 병원은 초록 띠·안내 줄(색 (구글과 같음)·휴무 (off)·반차 (웹앱에만)·취소·변경·캘린더 기본 색)이고, 탭에 들어오면 requestPull 한 번', async () => {
    linkGoogle()
    await open()
    await waitFor(() => expect(bandText()).toBe('구글 캘린더 2026 양지바른정형외과와 이어짐 · 마지막 맞춤 14:35 · 2분마다 맞춰요'))
    expect(requestPull).toHaveBeenCalledTimes(1)
    for (const words of ['색 (구글과 같음)', '휴무 (off)', '반차 (웹앱에만)', '캘린더 기본 색', '도수·자보도수·주사·진료는 시행자 색 · 구글에서 온 예약은 그 일정 색 그대로']) {
      expect(screen.getAllByText(words).length, words).toBeGreaterThan(0)
    }
    expect(document.body.textContent).not.toContain('담당 색')
    expect((document.querySelector('[data-wide-page]') as HTMLElement).style.getPropertyValue('--cal-default')).toBe('#039BE5')
  })

  it('AC-8532.1: [지금 맞추기]는 syncNow를 부르고 알림이 "구글과 맞췄어요 · 바뀐 것 없음 (14:37)"이다', async () => {
    linkGoogle()
    await open()
    fireEvent.click(await screen.findByRole('button', { name: '지금 맞추기' }))
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('구글과 맞췄어요 · 바뀐 것 없음 (14:37)')).toBeTruthy()
  })

  it('AC-8526.1: 이은 날 이후 새 예약은 같은 쓰기에 ssk id·web·new를 싣고 저장 뒤 바로 보낸다(알림은 지금 글)', async () => {
    linkGoogle()
    await open()
    await screen.findByRole('button', { name: '지금 맞추기' })
    const panel = openAdd()
    fillBasics(panel)
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(addAppt).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addAppt).mock.calls[0]![1]).toEqual(expect.objectContaining({ gEventId: expect.stringMatching(SSK), gFrom: 'web', gWait: 'new', status: 'auto' }))
    await waitFor(() => expect(sendAppt).toHaveBeenCalledTimes(1))
    expect(vi.mocked(sendAppt).mock.calls[0]![0]).toEqual(expect.objectContaining({ gWait: 'new', name: '이○○' }))
    expect(await screen.findByText(/예약을 넣었어요\. 다른 PC에도 몇 초 안에 보여요\.$/)).toBeTruthy()
  })

  it("AC-8526.1: 구글에 못 보내면 알림이 '웹앱에 저장했어요. 구글에는 다시 닿으면 보내요.'다", async () => {
    linkGoogle()
    vi.mocked(sendAppt).mockResolvedValue({ ok: false, code: 'E-GCAL-REACH' })
    await open()
    await screen.findByRole('button', { name: '지금 맞추기' })
    const panel = openAdd()
    fillBasics(panel)
    fireEvent.click(within(panel).getByRole('button', { name: '저장' }))
    expect(await screen.findByText('웹앱에 저장했어요. 구글에는 다시 닿으면 보내요.')).toBeTruthy()
  })

  it('AC-8526.1·AC-8526.5: 취소는 g_wait cancel을 실어 보내고, 도착 바꿈은 (맞춤 방법 기본이면) 싣지도 보내지도 않는다', async () => {
    linkGoogle()
    db.appts = db.appts.map((a) => (a.id === 'a1' ? { ...a, gEventId: PAIRED, gFrom: 'web' } : a))
    await open()
    await screen.findByRole('button', { name: '지금 맞추기' })
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    fireEvent.click(within(within(dialog('예약')).getByRole('group', { name: '도착 바꾸기' })).getByRole('button', { name: '왔음' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledWith(CLIENT, 'a1', { status: 'came' }))
    expect(sendAppt).not.toHaveBeenCalled()
    fireEvent.click(within(dialog('예약')).getByRole('button', { name: '예약 취소' }))
    await waitFor(() => expect(updateAppt).toHaveBeenCalledWith(CLIENT, 'a1', { status: 'cancel', gWait: 'cancel' }))
    await waitFor(() => expect(sendAppt).toHaveBeenCalledTimes(1))
  })

  it('AC-8526.1: 이은 병원의 웹앱 종일 메모는 넣는 쓰기에 ssk 일정 id와 보낼 것(g_wait)을 싣는다', async () => {
    linkGoogle()
    await open()
    await screen.findByRole('button', { name: '지금 맞추기' })
    fireEvent.click(document.querySelector('[data-allday-day="2026-11-19"]')!)
    const pop = dialog('11월 19일 (목) · 종일')
    fireEvent.change(within(pop).getByLabelText('종일 메모'), { target: { value: '학회' } })
    fireEvent.click(within(pop).getByRole('button', { name: '더하기' }))
    await waitFor(() => expect(addAllDay).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addAllDay).mock.calls[0]![1]).toEqual({
      day: '2026-11-19',
      type: 'memo',
      memo: '학회',
      staffId: null,
      staffName: null,
      gEventId: expect.stringMatching(SSK),
      gWait: true,
    })
  })

  it('AC-8533.1: 짝 있는 예약의 자세히에 구글 캘린더 구역과 도착 끝 글이 있다', async () => {
    linkGoogle()
    db.appts = db.appts.map((a) => (a.id === 'a1' ? { ...a, gEventId: PAIRED, gFrom: 'web' } : a))
    await open()
    await screen.findByRole('button', { name: '지금 맞추기' })
    fireEvent.click(block(/^10231 김○○ 도수 \(가\)/))
    const panel = dialog('예약')
    expect(panel.querySelector('[data-gcal-detail]')).not.toBeNull()
    expect(within(panel).getByText('도착은 구글에 보내지 않아요(설정 › 맞춤 방법).')).toBeTruthy()
  })

  it('AC-8535.1·AC-8535.2: 닿지 못하면 주황 띠·못 보낸 목록·오류 상자, [다시 시도]가 안 되면 알림 글, 안내 줄에 구글 아직 못 보냄', async () => {
    linkGoogle()
    const waiting = { ...db.appts[0]!, gEventId: PAIRED, gWait: 'new' as const, gWaitAt: '2026-11-17 01:33:00+00' }
    setGcalStatus({
      linked: true,
      calendarName: VIEW.calendarName,
      lastOkAt: '2026-11-17 05:20:00+00',
      failSince: '2026-11-17 05:29:00+00',
      failCode: 'E-GCAL-REACH',
      waiting: 1,
      waitingAppts: [waiting],
      nextTryAt: '2026-11-17T05:38:00.000Z',
    })
    vi.mocked(syncNow).mockResolvedValue({ ok: false, code: 'E-GCAL-REACH' })
    await open()
    await waitFor(() => expect(document.querySelector('[data-gcal-band]')?.getAttribute('data-gcal-band')).toBe('err'))
    expect(bandText()).toBe('구글 캘린더에 닿지 못했어요 · 14:29부터 · 웹앱에는 저장돼요 · 구글로 보낼 것 1개 · 1분 뒤(14:38) 다시 해 볼게요')
    expect(text(document.querySelector('[data-gcal-pending] li')!)).toBe('11/17 (화) 09:30 새로 넣음 10231 김○○ 도수 30분 (가) 기다림')
    expect(screen.getAllByText('아직 못 보냄').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('다시 해 봤지만 아직 닿지 않아요. 1분 뒤 다시 해 볼게요.')).toBeTruthy()
  })

  it('AC-8534.1·AC-8534.3: 띠의 [고쳐야 할 구글 예약 1개]로 판을 열고 시행자를 골라 넣으면 구글 제목 그대로 예약을 넣고 그 줄을 지운다', async () => {
    linkGoogle()
    vi.mocked(listGcalFixes).mockResolvedValue([FIX])
    await open()
    fireEvent.click(await screen.findByRole('button', { name: '고쳐야 할 구글 예약 1개' }))
    const panel = dialog('고쳐야 할 구글 예약 1개')
    fireEvent.click(within(within(panel).getByRole('group', { name: '시행자' })).getByRole('button', { name: '(나) 윤○○' }))
    vi.mocked(listGcalFixes).mockResolvedValue([])
    fireEvent.click(within(panel).getByRole('button', { name: '예약표에 넣기' }))
    await waitFor(() => expect(insertGoogleAppts).toHaveBeenCalledTimes(1))
    const [client, rows] = vi.mocked(insertGoogleAppts).mock.calls[0]!
    expect(client).toBe(CLIENT)
    expect(rows).toEqual([
      expect.objectContaining({
        day: '2026-11-19',
        start: 960,
        len: 15,
        chart: '6402',
        name: '윤모의',
        kindId: 'shock',
        staffId: 'na',
        memo: '4000타',
        gEventId: 'gev6402a',
        gTitle: '6402 윤모의 (4000타)',
        gUpdated: '2026-11-17T01:31:00.000Z',
        colorFrom: 'google',
        gKeepTitle: true,
        gFrom: 'pull',
      }),
    ])
    await waitFor(() => expect(deleteGcalFix).toHaveBeenCalledWith(CLIENT, 'f1'))
    expect(await screen.findByText('예약표에 넣었어요. 구글 제목은 그대로 둬요.')).toBeTruthy()
    expect(within(dialog('고쳐야 할 구글 예약 0개')).getByText('✓ 넣었어요')).toBeTruthy()
  })

  it("AC-8534.3: [가져오지 않기]는 그 줄을 '가져오지 않음'(skip)으로 두고 알림 '가져오지 않아요. 구글에만 남아요.'", async () => {
    linkGoogle()
    vi.mocked(listGcalFixes).mockResolvedValue([FIX])
    await open()
    fireEvent.click(await screen.findByRole('button', { name: '고쳐야 할 구글 예약 1개' }))
    fireEvent.click(within(dialog('고쳐야 할 구글 예약 1개')).getByRole('button', { name: '가져오지 않기' }))
    await waitFor(() => expect(setFixState).toHaveBeenCalledWith(CLIENT, 'f1', 'skip'))
    expect(insertGoogleAppts).not.toHaveBeenCalled()
    expect(await screen.findByText('가져오지 않아요. 구글에만 남아요.')).toBeTruthy()
  })

  it('AC-8536.1·AC-8536.2: 비트 PC(도우미 0.14.0)가 이은 병원 예약 탭을 열면 지난 한 주 도착을 채우고, 마지막 주를 끝내면 알림 한 번', async () => {
    link('ready', '0.14.0')
    linkGoogle()
    vi.mocked(loadGcalState).mockResolvedValue({ ...STATE, arrivalUntil: '2025-11-19', arrivalDone: false })
    await open()
    await waitFor(() => expect(postsOf('past')).toHaveLength(1))
    const calday = stream.mock.calls.filter(([, args]) => (args as { kind: string }).kind === 'calday').map(([, args]) => args)
    expect(calday).toContainEqual({ kind: 'calday', from: '2025-11-17', to: '2025-11-19' })
    expect(listAppts).toHaveBeenCalledWith(CLIENT, '2025-11-17', '2025-11-19')
    await reply({ type: 'past', from: '2025-11-17', to: '2025-11-19', auto: [] })
    await waitFor(() => expect(setArrivalProgress).toHaveBeenCalledWith(CLIENT, '2025-11-16', true))
    expect(await screen.findByText('지난 예약 도착을 다 채웠어요.')).toBeTruthy()
  })
})
