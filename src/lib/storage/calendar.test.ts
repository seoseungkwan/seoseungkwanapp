import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type ApptDraft, type CalAllDay, type CalAppt, type CalSettings, type CalSlotRow } from '@/types/calendar'
import {
  addAllDay,
  addAppt,
  applyGoogleAppt,
  applyGoogleMemo,
  CalendarStorageError,
  checkCalendarKinds,
  checkCalendarSettings,
  deleteAllDay,
  deleteAppt,
  findApptsByEvents,
  insertGoogleAppts,
  listAllDay,
  listAppts,
  listCalendarCounts,
  listCalendarSlots,
  listWaitingAppts,
  listWaitingMemos,
  loadCalendarRev,
  loadCalendarSettings,
  markApptSent,
  markMemoSent,
  newGoogleEventId,
  saveCalendarSettings,
  setApptAuto,
  updateAppt,
} from './calendar'

// 예약 탭 서버 저장 함수 (clinic-calendar REQ-5901 AC-5901.6, design.md '저장 함수'). 실제 Supabase에 붙지 않는다.
// 이름·차트번호·id는 모두 지어낸 것이다

const DAY = '2026-11-18'
const DAY2 = '2026-11-24'
const ID = '00000000-0000-4000-8000-000000000301'
const ID2 = '00000000-0000-4000-8000-000000000302'
const PHONE = '010-0000-1234'
const SECRET = 'secret detail'

// 보내는 칸·읽는 칸(design.md 'DB'·'저장 함수' · google-link design.md 7-1 새 칸). 전화·성별·나이·생일·마지막 내원 칸은 어디에도 없다
const APPT_COLUMNS =
  'id,day,start_min,len_min,name,chart,staff_id,staff_name,staff_mark,kind_id,kind_name,memo,status,auto,orig_day,orig_start,' +
  'g_event_id,g_updated,g_title,g_color,color_from,g_keep_title,g_moved,g_gone,g_wait,g_wait_at,g_note,g_from,g_how,created_at'
// g_moved = 구글에서 변경 색이 됨(google-link AC-8503.4 — 변경 수에 센다)
const COUNT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,orig_day,g_moved'
// 통계 다시 예약·빈자리(stats-insights AC-6104.1): 날·시행자·종류·상태·도착 표시·시작 분·길이 분·차트번호. 이름·메모 없음
const SLOT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,start_min,len_min,chart'
// part = 반차 휴무 'am'·'pm'(직원 탭 휴가에서 트리거가 적음, spec staff AC-7616.1). leave_id는 읽지 않는다
// g_* = 구글 일정 짝(종일 메모만, google-link design.md 7-2). g_wait_at은 트리거만 적는다
const ALLDAY_COLUMNS = 'id,day,type,memo,staff_id,staff_name,part,g_event_id,g_updated,g_wait,g_wait_at'
const SETTINGS_COLUMNS = 'kinds,staff,open_hour,close_hour,sunday'
const APPT_INSERT_KEYS = ['day', 'start_min', 'len_min', 'name', 'chart', 'staff_id', 'staff_name', 'staff_mark', 'kind_id', 'kind_name', 'memo', 'status']
const ALLDAY_INSERT_KEYS = ['day', 'type', 'memo', 'staff_id', 'staff_name']
// 사용자가 넣고 고치는 구글 칸(정해 둔 차례). g_wait_at·created_at은 DB만 적어 보내지 않는다
const G_KEYS = ['g_event_id', 'g_updated', 'g_title', 'g_color', 'color_from', 'g_keep_title', 'g_moved', 'g_gone', 'g_wait', 'g_note', 'g_from', 'g_how']
// 비트 찾기 결과에 있어도 서버로 가면 안 되는 칸(과 DB가 정하는 칸)
const NEVER_SENT = ['phone', 'tel', 'sex', 'gender', 'age', 'birth', 'birthday', 'last', 'lastVisit', 'hospital_id', 'id', 'auto', 'orig_day', 'orig_start', 'g_wait_at', 'created_at']
const NEVER_READ = ['phone', 'tel', 'sex', 'gender', 'age', 'birth', 'hospital_id']

// 구글 칸(google-link design.md 7-1). 시각 글은 DB가 준 그대로(마이크로초까지) 옮긴다
const CREATED = '2026-11-17T01:00:00.123456+00:00'
const WAIT_AT = '2026-11-18T01:02:03.456789+00:00'
const G_UPDATED = '2026-11-18T01:00:00.000Z'
const EVENT = 'ssk0123456789abcdef0123456789abcdef'
const EVENT2 = 'abc123def456ghi789'
const G_HOW = { staff: 'title', kind: 'color', memo: true, gStart: '2026-11-18T15:00:00+09:00', gEnd: '2026-11-18T15:30:00+09:00' } as const
const NO_G_ROW = {
  g_event_id: null,
  g_updated: null,
  g_title: null,
  g_color: null,
  color_from: 'app',
  g_keep_title: false,
  g_moved: false,
  g_gone: false,
  g_wait: null,
  g_wait_at: null,
  g_note: null,
  g_from: null,
  g_how: null,
  created_at: CREATED,
}
const NO_G = {
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
  createdAt: CREATED,
} as const

const APPT_ROW = {
  id: ID,
  day: DAY,
  start_min: 900,
  len_min: 30,
  name: '가짜환자',
  chart: '10231',
  staff_id: 'st-ga',
  staff_name: '가',
  staff_mark: '가',
  kind_id: 'dosu',
  kind_name: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  orig_day: null,
  orig_start: null,
  ...NO_G_ROW,
}
const SAVED: CalAppt = {
  id: ID,
  day: DAY,
  start: 900,
  len: 30,
  name: '가짜환자',
  chart: '10231',
  staffId: 'st-ga',
  staffName: '가',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
  ...NO_G,
}
const DRAFT: ApptDraft = {
  day: DAY,
  start: 900,
  len: 30,
  name: '가짜환자',
  chart: '10231',
  staffId: 'st-ga',
  staffName: '가',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
}
const INSERTED = {
  day: DAY,
  start_min: 900,
  len_min: 30,
  name: '가짜환자',
  chart: '10231',
  staff_id: 'st-ga',
  staff_name: '가',
  staff_mark: '가',
  kind_id: 'dosu',
  kind_name: '도수',
  memo: '',
  status: 'auto',
}
const MOVED_ROW = { ...APPT_ROW, id: ID2, day: DAY2, start_min: 600, auto: 'came', orig_day: DAY, orig_start: 900, status: 'came' }
const MOVED: CalAppt = { ...SAVED, id: ID2, day: DAY2, start: 600, auto: 'came', origDay: DAY, origStart: 900, status: 'came' }
// 구글에서 받은 예약(색 토마토 = colorId 11, 변경 색, 보낼 것 edit)
const G_ROW = {
  ...APPT_ROW,
  id: ID2,
  g_event_id: EVENT,
  g_updated: G_UPDATED,
  g_title: '1500 가짜환자 도수(가)',
  g_color: '11',
  color_from: 'google',
  g_keep_title: true,
  g_moved: true,
  g_gone: false,
  g_wait: 'edit',
  g_wait_at: WAIT_AT,
  g_note: '구글 → 웹앱 덮음',
  g_from: 'pull',
  g_how: G_HOW,
}
const G_SAVED: CalAppt = {
  ...SAVED,
  id: ID2,
  gEventId: EVENT,
  gUpdated: G_UPDATED,
  gTitle: '1500 가짜환자 도수(가)',
  gColor: 'tomato',
  colorFrom: 'google',
  gKeepTitle: true,
  gMoved: true,
  gGone: false,
  gWait: 'edit',
  gWaitAt: WAIT_AT,
  gNote: '구글 → 웹앱 덮음',
  gFrom: 'pull',
  gHow: { ...G_HOW },
}
// 넣기·고치기에 함께 보내는 구글 칸(가져오기 한 줄 모양)
const G_PART: Partial<ApptDraft> = {
  gEventId: EVENT,
  gUpdated: G_UPDATED,
  gTitle: '1500 가짜환자 도수(가)',
  gColor: 'tomato',
  colorFrom: 'google',
  gKeepTitle: true,
  gMoved: false,
  gGone: false,
  gWait: null,
  gNote: null,
  gFrom: 'import',
  gHow: { ...G_HOW },
}
const G_PART_ROW = {
  g_event_id: EVENT,
  g_updated: G_UPDATED,
  g_title: '1500 가짜환자 도수(가)',
  g_color: '11',
  color_from: 'google',
  g_keep_title: true,
  g_moved: false,
  g_gone: false,
  g_wait: null,
  g_note: null,
  g_from: 'import',
  g_how: G_HOW,
}
// 시행자 없는 예약(세 칸 null, google-link AC-8503.3)
const NO_STAFF_ROW = { ...APPT_ROW, staff_id: null, staff_name: null, staff_mark: null }
const NO_STAFF: CalAppt = { ...SAVED, staffId: null, staffName: null, staffMark: null }

const COUNT_ROW = { day: DAY, staff_id: 'st-ga', staff_name: '가', kind_id: 'dosu', kind_name: '도수', status: 'cancel', auto: null, orig_day: DAY2, g_moved: false }
const COUNTED = { day: DAY, staffId: 'st-ga', staffName: '가', kindId: 'dosu', kindName: '도수', status: 'cancel', auto: null, origDay: DAY2, gMoved: false }
const SLOT_ROW = { day: DAY, staff_id: 'st-ga', staff_name: '가', kind_id: 'dosu', kind_name: '도수', status: 'came', auto: null, start_min: 900, len_min: 30, chart: '10231' }
const SLOTTED: CalSlotRow = { day: DAY, staffId: 'st-ga', staffName: '가', kindId: 'dosu', kindName: '도수', status: 'came', auto: null, start: 900, len: 30, chart: '10231' }

const MEMO_ROW = { id: ID, day: DAY, type: 'memo', memo: '원장님 학회', staff_id: null, staff_name: null, g_event_id: null, g_updated: null, g_wait: false, g_wait_at: null }
const MEMO_DAY: CalAllDay = { id: ID, day: DAY, type: 'memo', memo: '원장님 학회', staffId: null, staffName: null, gEventId: null, gUpdated: null, gWait: false, gWaitAt: null }
const OFF_ROW = { id: ID2, day: DAY, type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가', g_event_id: null, g_updated: null, g_wait: false, g_wait_at: null }
const OFF_DAY: CalAllDay = { id: ID2, day: DAY, type: 'off', memo: null, staffId: 'st-ga', staffName: '가' }

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  ],
  staff: [
    { id: 'st-ga', name: '가나다', mark: '가', color: 'blueberry' },
    { id: 'st-na', name: '나라', mark: '나', color: 'basil' },
  ],
  openHour: 9,
  closeHour: 19,
  sunday: true,
}
const SETTINGS_ROW = {
  kinds: SETTINGS.kinds,
  staff: SETTINGS.staff,
  open_hour: 9,
  close_hour: 19,
  sunday: true,
}
// calendar-colors AC-6001.5 → google-link 7-4 옮기기 표(red→tomato·yellow→banana·green→basil·mint→sage·magenta→grape,
// wine→tomato·forest→basil·lavender 그대로·coral→flamingo·black→graphite). 종류 하나는 캘린더 기본 색(default)
const NEW_COLOR_SETTINGS: CalSettings = {
  ...SETTINGS,
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: 'tomato', words: ['도수'] },
    { id: 'jabo', name: '자보도수', len: 30, color: 'banana', words: ['자보도수', '자보'] },
    { id: 'shock', name: '충격파', len: 15, color: 'basil', words: ['충격파', '타'] },
    { id: 'inj', name: '주사', len: 10, color: 'sage', words: ['주사'] },
    { id: 'visit', name: '진료', len: 10, color: 'default', words: ['진료'] },
  ],
  staff: [
    { id: 'st-ga', name: '가나다', mark: '가', color: 'tomato' },
    { id: 'st-na', name: '나라', mark: '나', color: 'basil' },
    { id: 'st-da', name: '다마', mark: '다', color: 'lavender' },
    { id: 'st-ra', name: '라바', mark: '라', color: 'flamingo' },
    { id: 'st-ma', name: '마사', mark: '마', color: 'graphite' },
  ],
}

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, message = SECRET): Reply {
  return { data: null, error: { message, details: SECRET, hint: SECRET, code: SECRET }, status }
}

type Call = [string, ...unknown[]]
const METHODS = ['select', 'eq', 'gte', 'lte', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

// 받은 부름을 차례로 적는 가짜 클라이언트. 기다릴 때마다 정해 둔 답을 차례로 하나씩 준다(마지막 답은 되풀이)
function fakeClient(...replies: Reply[]) {
  const calls: Call[] = []
  const queue = replies.length > 0 ? [...replies] : [OK]
  const builder: Record<string, unknown> = {}
  for (const name of METHODS) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return builder
    }
  }
  builder.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve((queue.length > 1 ? queue.shift() : queue[0]) as Reply).then(resolve, reject)
  const client = {
    from(table: string) {
      calls.push(['from', table])
      return builder
    },
  } as unknown as Pick<SupabaseClient, 'from'>
  return { client, calls }
}

const throwingClient = {
  from() {
    throw new Error(SECRET)
  },
} as unknown as Pick<SupabaseClient, 'from'>

// 진짜 postgrest-js에 가짜 fetch만 넣는다. 가짜 클라이언트가 실제 요청 모양과 어긋나지 않는지 본다
function realClient(fakeFetch: typeof fetch) {
  return createClient('http://localhost:54321', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  })
}

function fetchReturning(...bodies: unknown[]) {
  const queue = [...bodies]
  return vi.fn<typeof fetch>(async () => {
    const body = queue.length > 1 ? queue.shift() : queue[0]
    return new Response(body === null ? null : JSON.stringify(body), { status: body === null ? 204 : 200 })
  })
}

function requestAt(fakeFetch: ReturnType<typeof fetchReturning>, index = 0) {
  const [input, init] = fakeFetch.mock.calls[index] ?? []
  const url = new URL(String(input))
  return { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

function requestOf(fakeFetch: ReturnType<typeof fetchReturning>) {
  expect(fakeFetch).toHaveBeenCalledTimes(1)
  return requestAt(fakeFetch)
}

async function caught(run: () => Promise<unknown>): Promise<CalendarStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(CalendarStorageError)
  return thrown as CalendarStorageError
}

function expectNoSecret(error: CalendarStorageError) {
  expect(error.message).not.toContain(SECRET)
  expect(String(error)).not.toContain(SECRET)
  expect(error.stack ?? '').not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
}

const sentNothing = (calls: Call[]) => expect(calls).toEqual([])
const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-5901.6 읽는 칸 목록', () => {
  it('AC-5901.6: 읽는 칸에 전화·성별·나이·생일·hospital_id가 없고, 수 세기 읽기에는 이름·차트번호·메모도 없다', () => {
    for (const columns of [APPT_COLUMNS, COUNT_COLUMNS, ALLDAY_COLUMNS, SETTINGS_COLUMNS]) {
      for (const key of NEVER_READ) expect([columns, columns.split(',').includes(key)]).toEqual([columns, false])
    }
    for (const key of ['name', 'chart', 'memo', 'id']) expect(COUNT_COLUMNS.split(',')).not.toContain(key)
  })
})

describe('listAppts', () => {
  it('AC-5901.6: 그 기간 예약을 정해 둔 칸만 날·시작 차례로 1,000줄씩 읽어 CalAppt로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith([APPT_ROW, MOVED_ROW]))
    await expect(listAppts(client, DAY, DAY2)).resolves.toEqual([SAVED, MOVED])
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['select', APPT_COLUMNS],
      ['gte', 'day', DAY],
      ['lte', 'day', DAY2],
      ['order', 'day', { ascending: true }],
      ['order', 'start_min', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-5901.6: 1,000줄이 넘으면 나눠 읽어 모두 돌려준다(꽉 찬 쪽 다음 쪽을 더 읽는다)', async () => {
    const first = many(1000, (i) => ({ ...APPT_ROW, id: `id-${i}` }))
    const second = many(3, (i) => ({ ...APPT_ROW, id: `id-x${i}` }))
    const { client, calls } = fakeClient(okWith(first), okWith(second))
    const found = await listAppts(client, DAY, DAY2)
    expect(found).toHaveLength(1003)
    expect(found.at(-1)?.id).toBe('id-x2')
    expect(calls.filter((call) => call[0] === 'range')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ])
  })

  it('AC-5901.6: 딱 1,000줄이면 다음 쪽(빈 쪽)까지 읽고 멈춘다', async () => {
    const { client, calls } = fakeClient(okWith(many(1000, (i) => ({ ...APPT_ROW, id: `id-${i}` }))), okWith([]))
    expect(await listAppts(client, DAY, DAY2)).toHaveLength(1000)
    expect(calls.filter((call) => call[0] === 'range')).toHaveLength(2)
  })

  it('AC-5901.6: 둘째 쪽이 실패하면 반쪽 목록이 아니라 failed다', async () => {
    const { client } = fakeClient(okWith(many(1000, (i) => ({ ...APPT_ROW, id: `id-${i}` }))), failure(500))
    expect((await caught(() => listAppts(client, DAY, DAY2))).kind).toBe('failed')
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 없음', { id: null }],
    ['날짜 틀림', { day: '2026/11/18' }],
    ['시작 5의 배수 아님(AC-8503.3)', { start_min: 903 }],
    ['시작 1440', { start_min: 1440 }],
    ['길이 7', { len_min: 7 }],
    ['길이 글자', { len_min: '30' }],
    ['이름 빈 글자', { name: '' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['차트번호 글자', { chart: 'a1' }],
    ['한 글자 표시 두 글자', { staff_mark: '가나' }],
    ['종류 이름 없음', { kind_name: null }],
    ['메모 101자', { memo: '가'.repeat(101) }],
    ['상태 틀림', { status: 'x' }],
    ['도착 틀림', { auto: 'cancel' }],
    ['처음 날짜 틀림', { orig_day: 'x', orig_start: 900 }],
    ['처음 자리 반쪽', { orig_day: DAY2, orig_start: null }],
    ['처음 시작 5의 배수 아님', { orig_day: DAY2, orig_start: 903 }],
    ['시행자 세 칸 가운데 하나만 null(AC-8503.3)', { staff_id: null }],
    ['시행자 표시만 null(AC-8503.3)', { staff_mark: null }],
    ['구글 일정 id 4자', { g_event_id: 'abcd' }],
    ['구글 일정 id에 빼기', { g_event_id: 'abc-def-123' }],
    ['구글 고친 때 글 틀림', { g_updated: '어제' }],
    ['구글 제목 201자', { g_title: '가'.repeat(201) }],
    ['구글 색 12', { g_color: '12' }],
    ['구글 색 이름(blue)', { g_color: 'blue' }],
    ['색 출처 x', { color_from: 'x' }],
    ['제목 그대로가 참거짓 아님', { g_keep_title: null }],
    ['구글 변경 참거짓 아님', { g_moved: 'yes' }],
    ['구글 지움 참거짓 아님', { g_gone: 1 }],
    ['보낼 것 x', { g_wait: 'x' }],
    ['보낸 때 글 틀림', { g_wait: 'edit', g_wait_at: 'x' }],
    ['덮인 쪽 101자', { g_note: '가'.repeat(101) }],
    ['들어온 길 x', { g_from: 'x' }],
    ['알아본 출처 칸 틀림', { g_how: { ...G_HOW, staff: 'x' } }],
    ['알아본 출처가 목록', { g_how: [] }],
    ['만든 때 없음', { created_at: null }],
  ])('AC-5901.6·AC-8503.3: 모양이 틀린 예약 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = fakeClient(okWith([{ ...APPT_ROW, ...patch }, MOVED_ROW]))
    await expect(listAppts(client, DAY, DAY2)).resolves.toEqual([MOVED])
  })

  it('AC-5901.6: 읽은 줄의 다른 열쇠(전화·hospital_id 등)는 옮기지 않는다', async () => {
    const { client } = fakeClient(okWith([{ ...APPT_ROW, phone: PHONE, hospital_id: 'x', sex: 'F' }]))
    const [appt] = await listAppts(client, DAY, DAY2)
    expect(Object.keys(appt ?? {}).sort()).toEqual(Object.keys(SAVED).sort())
  })

  it('AC-5901.6: 답이 목록이 아니면 빈 목록으로 보이지 않고 failed다', async () => {
    expect((await caught(() => listAppts(fakeClient(okWith(null)).client, DAY, DAY2))).kind).toBe('failed')
  })

  it.each<[string, string, string]>([
    ['from 틀림', 'x', DAY2],
    ['to 틀림', DAY, '2026-11-31'],
    ['from이 to보다 늦음', DAY2, DAY],
  ])('AC-5901.6: 기간이 %s이면 보내지 않고 failed다', async (_name, from, to) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listAppts(client, from, to))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-5901.6: 진짜 클라이언트로도 select·day gte·lte·차례·offset/limit만 묻고, 1,000줄이면 다음 쪽을 묻는다', async () => {
    const fakeFetch = fetchReturning(
      many(1000, (i) => ({ ...APPT_ROW, id: `id-${i}` })),
      [APPT_ROW],
    )
    expect(await listAppts(realClient(fakeFetch), DAY, DAY2)).toHaveLength(1001)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
    const first = requestAt(fakeFetch, 0)
    expect(first.url.pathname).toBe('/rest/v1/calendar_appts')
    expect(first.method).toBe('GET')
    expect(first.url.searchParams.get('select')).toBe(APPT_COLUMNS)
    expect(first.url.searchParams.getAll('day')).toEqual([`gte.${DAY}`, `lte.${DAY2}`])
    expect(first.url.searchParams.get('order')).toBe('day.asc,start_min.asc,id.asc')
    expect([first.url.searchParams.get('offset'), first.url.searchParams.get('limit')]).toEqual(['0', '1000'])
    const second = requestAt(fakeFetch, 1)
    expect([second.url.searchParams.get('offset'), second.url.searchParams.get('limit')]).toEqual(['1000', '1000'])
  })
})

describe('listCalendarCounts', () => {
  it('AC-5901.6: 수 세기 칸(이름·차트번호·메모 없음)만 날 차례로 나눠 읽어 CalCountRow로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith([COUNT_ROW, { ...COUNT_ROW, status: 'auto', auto: 'noshow', orig_day: null }]))
    await expect(listCalendarCounts(client, DAY, DAY2)).resolves.toEqual([COUNTED, { ...COUNTED, status: 'auto', auto: 'noshow', origDay: null }])
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['select', COUNT_COLUMNS],
      ['gte', 'day', DAY],
      ['lte', 'day', DAY2],
      ['order', 'day', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-5901.6: 1,000줄이 넘으면 나눠 읽어 모두 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(many(1000, () => COUNT_ROW)), okWith(many(1000, () => COUNT_ROW)), okWith([COUNT_ROW]))
    expect(await listCalendarCounts(client, DAY, DAY2)).toHaveLength(2001)
    expect(calls.filter((call) => call[0] === 'range').map((call) => call.slice(1))).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('AC-5901.6: 읽은 줄에 이름·차트번호·메모가 와도 옮기지 않고, 모양이 틀린 줄은 뺀다', async () => {
    const { client } = fakeClient(okWith([{ ...COUNT_ROW, name: '가짜환자', chart: '10231', memo: '가' }, { ...COUNT_ROW, status: 'x' }, null]))
    const found = await listCalendarCounts(client, DAY, DAY2)
    expect(found).toEqual([COUNTED])
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(['auto', 'day', 'gMoved', 'kindId', 'kindName', 'origDay', 'staffId', 'staffName', 'status'])
  })

  it('AC-8503.4: g_moved(구글에서 변경 색)를 gMoved로 옮기고, 칸이 없거나 null이면 거짓이다. 참거짓이 아니면 그 줄을 뺀다', async () => {
    const { client } = fakeClient(okWith([{ ...COUNT_ROW, g_moved: true }, { ...COUNT_ROW, g_moved: undefined }, { ...COUNT_ROW, g_moved: null }, { ...COUNT_ROW, g_moved: 'yes' }]))
    await expect(listCalendarCounts(client, DAY, DAY2)).resolves.toEqual([{ ...COUNTED, gMoved: true }, COUNTED, COUNTED])
  })

  it('AC-8503.3: 시행자 없는 줄(세 칸 null)은 받고, 시행자 칸 하나만 null인 줄은 뺀다', async () => {
    const { client } = fakeClient(okWith([{ ...COUNT_ROW, staff_id: null, staff_name: null }, { ...COUNT_ROW, staff_id: null }]))
    await expect(listCalendarCounts(client, DAY, DAY2)).resolves.toEqual([{ ...COUNTED, staffId: null, staffName: null }])
  })

  it('AC-5901.6: 기간이 틀리면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listCalendarCounts(client, DAY2, DAY))).kind).toBe('failed')
    sentNothing(calls)
  })
})

describe('listCalendarSlots', () => {
  it('AC-6104.1: 날·시행자·종류·상태·도착 표시·시작 분·길이 분·차트번호만 날 차례로 나눠 읽어 CalSlotRow로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith([SLOT_ROW, { ...SLOT_ROW, status: 'auto', auto: 'came', chart: null }]))
    await expect(listCalendarSlots(client, DAY, DAY2)).resolves.toEqual([SLOTTED, { ...SLOTTED, status: 'auto', auto: 'came', chart: null }])
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['select', SLOT_COLUMNS],
      ['gte', 'day', DAY],
      ['lte', 'day', DAY2],
      ['order', 'day', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-6104.1: 읽는 칸에 이름·메모·전화·성별·나이·생일·hospital_id가 없다', () => {
    for (const key of ['name', 'memo', 'staff_mark', 'orig_day', 'orig_start', ...NEVER_READ]) expect(SLOT_COLUMNS.split(','), key).not.toContain(key)
  })

  it('AC-6104.1: 1,000줄이 넘으면 나눠 읽어 모두 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(many(1000, () => SLOT_ROW)), okWith([SLOT_ROW]))
    expect(await listCalendarSlots(client, DAY, DAY2)).toHaveLength(1001)
    expect(calls.filter((call) => call[0] === 'range').map((call) => call.slice(1))).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('AC-6104.1: 읽은 줄에 이름·메모·전화가 와도 옮기지 않는다', async () => {
    const { client } = fakeClient(okWith([{ ...SLOT_ROW, name: '가짜환자', memo: '가', phone: PHONE, hospital_id: 'x' }]))
    const found = await listCalendarSlots(client, DAY, DAY2)
    expect(found).toEqual([SLOTTED])
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(['auto', 'chart', 'day', 'kindId', 'kindName', 'len', 'staffId', 'staffName', 'start', 'status'])
  })

  it.each<[string, Record<string, unknown>]>([
    ['날짜 틀림', { day: '2026/11/18' }],
    ['시작 5의 배수 아님', { start_min: 903 }],
    ['길이 7', { len_min: 7 }],
    ['차트번호 글자', { chart: 'a1' }],
    ['시행자 칸 반쪽(id만 null)', { staff_id: null }],
    ['종류 이름 없음', { kind_name: null }],
    ['상태 틀림', { status: 'x' }],
    ['도착 틀림', { auto: 'cancel' }],
  ])('AC-6104.1: 모양이 틀린 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = fakeClient(okWith([{ ...SLOT_ROW, ...patch }, SLOT_ROW, null]))
    await expect(listCalendarSlots(client, DAY, DAY2)).resolves.toEqual([SLOTTED])
  })

  it('AC-6104.1: 기간이 틀리면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listCalendarSlots(client, DAY2, DAY))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-6104.1: 진짜 클라이언트로도 select·day gte·lte·차례·offset/limit만 묻는다', async () => {
    const fakeFetch = fetchReturning([SLOT_ROW])
    expect(await listCalendarSlots(realClient(fakeFetch), DAY, DAY2)).toEqual([SLOTTED])
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_appts')
    expect(request.method).toBe('GET')
    expect(request.url.searchParams.get('select')).toBe(SLOT_COLUMNS)
    expect(request.url.searchParams.getAll('day')).toEqual([`gte.${DAY}`, `lte.${DAY2}`])
    expect(request.url.searchParams.get('order')).toBe('day.asc,id.asc')
    expect([request.url.searchParams.get('offset'), request.url.searchParams.get('limit')]).toEqual(['0', '1000'])
  })
})

describe('addAppt', () => {
  it('AC-5901.6: 정해 둔 열두 칸만 넣고 DB가 준 줄(새 id)을 CalAppt로 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await expect(addAppt(client, DRAFT)).resolves.toEqual(SAVED)
    expect(calls).toEqual([['from', 'calendar_appts'], ['insert', INSERTED], ['select', APPT_COLUMNS], ['single']])
    expect(Object.keys(calls[1]?.[1] as object)).toEqual(APPT_INSERT_KEYS)
  })

  it('AC-5901.6: 비트 찾기에서 온 전화·성별·나이·생일·마지막 내원과 DB가 정하는 칸은 받아도 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    const extra = { phone: PHONE, sex: '여', age: 61, birth: '19650312', last: '2026-11-10', hospital_id: 'x', id: ID, auto: 'came', origDay: DAY2, gWaitAt: WAIT_AT, createdAt: CREATED }
    await addAppt(client, { ...DRAFT, ...extra } as ApptDraft)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(APPT_INSERT_KEYS)
    for (const key of NEVER_SENT) expect(row).not.toHaveProperty(key)
  })

  it('AC-5901.6: 이름·메모는 앞뒤 빈칸을 빼고, 빈 차트번호는 null로 보낸다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await addAppt(client, { ...DRAFT, name: '  가짜환자 \n', memo: ' 왼쪽 무릎 ', chart: ' ' })
    expect(calls[1]).toEqual(['insert', { ...INSERTED, memo: '왼쪽 무릎', chart: null }])
    const { client: other, calls: second } = fakeClient(okWith(APPT_ROW))
    await addAppt(other, { ...DRAFT, chart: null })
    expect(second[1]).toEqual(['insert', { ...INSERTED, chart: null }])
  })

  it.each<[string, Partial<ApptDraft>]>([
    ['이름에 전화', { name: `가짜 ${PHONE}` }],
    ['메모에 전화', { memo: `보호자 ${PHONE}` }],
    ['메모에 주민번호', { memo: '900101-1234567' }],
    ['메모에 메일', { memo: 'a@b.co 로 보냄' }],
    ['이름에 전각 전화', { name: '０１０-００００-１２３４' }],
  ])('AC-5901.6: %s 모양이면 보내지 않고 blocked다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await expect(addAppt(client, { ...DRAFT, ...patch })).resolves.toBe('blocked')
    sentNothing(calls)
  })

  it.each<[string, Partial<ApptDraft> | Record<string, unknown>]>([
    ['날짜 틀림', { day: '2026-02-30' }],
    ['시작 343(5분 단위 아님)', { start: 343 }],
    ['시작 1440', { start: 1440 }],
    ['시작 −10', { start: -10 }],
    ['길이 0', { len: 0 }],
    ['길이 7', { len: 7 }],
    ['길이 245', { len: 245 }],
    ['길이 정수 아님', { len: 7.5 }],
    ['이름 빈칸뿐', { name: '   ' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['차트번호 a1', { chart: 'a1' }],
    ['차트번호 11자리', { chart: '12345678901' }],
    ['시행자 id 빈 글자', { staffId: '' }],
    ['시행자 이름 11자', { staffName: '가'.repeat(11) }],
    ['한 글자 표시 두 글자', { staffMark: '가나' }],
    ['종류 id 41자', { kindId: 'k'.repeat(41) }],
    ['종류 이름 빈 글자', { kindName: '' }],
    ['메모 101자', { memo: '가'.repeat(101) }],
    ['상태 x', { status: 'x' }],
  ])('AC-5901.6: %s이면 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    expect((await caught(() => addAppt(client, { ...DRAFT, ...patch } as ApptDraft))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-5901.6·AC-8503.3: 경계값(시작 0·1435·555, 길이 5·240, 이름 20자, 차트 10자리, 메모 100자)은 보낸다', async () => {
    for (const patch of [
      { start: 0, len: 5 },
      { start: 1435, len: 240 },
      { start: 555 },
      { name: '가'.repeat(20), chart: '1234567890', memo: '가'.repeat(100) },
    ]) {
      const { client, calls } = fakeClient(okWith(APPT_ROW))
      await expect(addAppt(client, { ...DRAFT, ...patch })).resolves.toEqual(SAVED)
      expect(calls).toHaveLength(4)
    }
  })

  it('AC-5901.6: DB가 준 줄 모양이 틀리면 failed다', async () => {
    const { client } = fakeClient(okWith({ ...APPT_ROW, start_min: 'x' }))
    expect((await caught(() => addAppt(client, DRAFT))).kind).toBe('failed')
  })

  it('AC-5901.6: 진짜 클라이언트로도 POST 한 번에 정해 둔 열두 칸만 보내고 정해 둔 칸만 돌려받는다', async () => {
    const fakeFetch = fetchReturning(APPT_ROW)
    await expect(addAppt(realClient(fakeFetch), { ...DRAFT, phone: PHONE, birth: '19650312' } as ApptDraft)).resolves.toEqual(SAVED)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_appts')
    expect(request.method).toBe('POST')
    expect(request.url.searchParams.get('select')).toBe(APPT_COLUMNS)
    expect(request.headers.get('Prefer')).toContain('return=representation')
    expect(request.body).toEqual(INSERTED)
    expect(Object.keys(request.body)).toEqual(APPT_INSERT_KEYS)
  })
})

describe('updateAppt', () => {
  it('AC-5901.6: 받은 칸만 DB 칸 이름으로 바꿔 그 id 줄에 고치고 고친 줄을 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(MOVED_ROW))
    await expect(updateAppt(client, ID2, { start: 600, day: DAY2 })).resolves.toEqual(MOVED)
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['update', { day: DAY2, start_min: 600 }],
      ['eq', 'id', ID2],
      ['select', APPT_COLUMNS],
      ['single'],
    ])
  })

  it('AC-5901.6: 모든 칸을 주면 열두 칸을 정해 둔 차례로 보낸다. 다른 열쇠(도착·처음 자리·전화)는 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await updateAppt(client, ID, { ...DRAFT, auto: 'came', origDay: DAY, phone: PHONE } as Partial<ApptDraft>)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(APPT_INSERT_KEYS)
    for (const key of NEVER_SENT) expect(row).not.toHaveProperty(key)
  })

  it('AC-5901.6: 차트번호를 null로 주면 비운다. 이름·메모는 앞뒤 빈칸을 뺀다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await updateAppt(client, ID, { chart: null, name: ' 새이름 ', memo: ' 고침 ' })
    expect(calls[1]).toEqual(['update', { name: '새이름', chart: null, memo: '고침' }])
  })

  it.each<[string, Partial<ApptDraft>]>([
    ['이름에 전화', { name: PHONE }],
    ['메모에 주민번호', { memo: '주민 900101 1234567' }],
  ])('AC-5901.6: %s 모양이면 보내지 않고 blocked다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await expect(updateAppt(client, ID, patch)).resolves.toBe('blocked')
    sentNothing(calls)
  })

  it.each<[string, string, Partial<ApptDraft> | Record<string, unknown>]>([
    ['고칠 칸 없음', ID, {}],
    ['정해 둔 칸 밖만', ID, { auto: 'came', phone: PHONE }],
    ['id 빈 글자', '', { memo: '가' }],
    ['길이 7', ID, { len: 7 }],
    ['시작 343', ID, { start: 343 }],
    ['차트번호 a1', ID, { chart: 'a1' }],
    ['상태 x', ID, { status: 'x' }],
  ])('AC-5901.6: %s이면 보내지 않고 failed다', async (_name, id, patch) => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    expect((await caught(() => updateAppt(client, id, patch as Partial<ApptDraft>))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-5901.6: 진짜 클라이언트로도 PATCH ?id=eq.id 한 번에 받은 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(APPT_ROW)
    await updateAppt(realClient(fakeFetch), ID, { status: 'cancel' })
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_appts')
    expect(request.method).toBe('PATCH')
    expect(request.url.searchParams.get('id')).toBe(`eq.${ID}`)
    expect(request.body).toEqual({ status: 'cancel' })
  })
})

describe('setApptAuto', () => {
  const SLOT = { day: '2026-11-17', start: 570 }
  it.each(['came', 'noshow', null] as const)('AC-5901.6: 도착 auto 칸 하나(%j)만 그 id 줄에, 셈한 자리(날짜·시작)가 그대로일 때만 고친다', async (auto) => {
    const { client, calls } = fakeClient()
    await expect(setApptAuto(client, ID, auto, SLOT)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', 'calendar_appts'], ['update', { auto }], ['eq', 'id', ID], ['eq', 'day', '2026-11-17'], ['eq', 'start_min', 570]])
  })

  it.each<[string, unknown]>([
    ['날짜가 날짜 모양이 아님', { day: '2026-13-01', start: 570 }],
    ['시작이 5분 단위가 아님', { day: '2026-11-17', start: 573 }],
    ['자리 없음', undefined],
  ])('AC-5901.6: 자리가 %s이면 보내지 않고 failed다(옮긴 예약에 옛 자리의 도착을 적지 않으려고)', async (_name, slot) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => setApptAuto(client, ID, 'came', slot as typeof SLOT))).kind).toBe('failed')
    sentNothing(calls)
  })

  it.each<[string, string, unknown]>([
    ['도착 cancel', ID, 'cancel'],
    ['도착 auto', ID, 'auto'],
    ['도착 없음', ID, undefined],
    ['id 빈 글자', '', 'came'],
  ])('AC-5901.6: %s이면 보내지 않고 failed다', async (_name, id, auto) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => setApptAuto(client, id, auto as 'came', SLOT))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-5901.6: 진짜 클라이언트로도 PATCH 몸통은 auto 하나다', async () => {
    const fakeFetch = fetchReturning(null)
    await setApptAuto(realClient(fakeFetch), ID, 'noshow', SLOT)
    const request = requestOf(fakeFetch)
    expect(request.method).toBe('PATCH')
    expect(request.url.searchParams.get('id')).toBe(`eq.${ID}`)
    expect(request.url.searchParams.get('day')).toBe('eq.2026-11-17')
    expect(request.url.searchParams.get('start_min')).toBe('eq.570')
    expect(request.body).toEqual({ auto: 'noshow' })
  })
})

describe('deleteAppt · deleteAllDay', () => {
  it.each<[string, (c: Pick<SupabaseClient, 'from'>, id: string) => Promise<void>, string]>([
    ['deleteAppt', deleteAppt, 'calendar_appts'],
    ['deleteAllDay', deleteAllDay, 'calendar_allday'],
  ])('AC-5901.6: %s는 그 id 줄 하나를 지우고, id가 비면 보내지 않는다(조건 없는 지우기 금지)', async (_name, run, table) => {
    const { client, calls } = fakeClient()
    await expect(run(client, ID)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', table], ['delete'], ['eq', 'id', ID]])
    const empty = fakeClient()
    expect((await caught(() => run(empty.client, ''))).kind).toBe('failed')
    sentNothing(empty.calls)
  })
})

describe('listAllDay', () => {
  it('AC-5901.6: 그 기간 종일 줄을 정해 둔 칸만 날 차례로 나눠 읽는다', async () => {
    const { client, calls } = fakeClient(okWith([MEMO_ROW, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([MEMO_DAY, OFF_DAY])
    expect(calls).toEqual([
      ['from', 'calendar_allday'],
      ['select', ALLDAY_COLUMNS],
      ['gte', 'day', DAY],
      ['lte', 'day', DAY2],
      ['order', 'day', { ascending: true }],
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-5901.6: 1,000줄이 넘으면 나눠 읽는다', async () => {
    const { client } = fakeClient(okWith(many(1000, () => MEMO_ROW)), okWith([OFF_ROW]))
    expect(await listAllDay(client, DAY, DAY2)).toHaveLength(1001)
  })

  it.each<[string, Record<string, unknown>]>([
    ['종류 틀림', { ...MEMO_ROW, type: 'x' }],
    ['메모 줄에 메모 없음', { ...MEMO_ROW, memo: null }],
    ['메모 21자', { ...MEMO_ROW, memo: '가'.repeat(21) }],
    ['메모 줄에 시행자', { ...MEMO_ROW, staff_id: 'st-ga' }],
    ['휴무에 시행자 없음', { ...OFF_ROW, staff_id: null }],
    ['휴무에 메모', { ...OFF_ROW, memo: '가' }],
    ['날짜 틀림', { ...OFF_ROW, day: 'x' }],
  ])('AC-5901.6: 모양이 틀린 종일 줄(%s)은 뺀다', async (_name, bad) => {
    const { client } = fakeClient(okWith([bad, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([OFF_DAY])
  })
})

describe('AC-7616.1 listAllDay · addAllDay: 반차 휴무 part', () => {
  it('AC-7616.1: 휴무 줄의 part(am·pm)를 읽어 CalAllDay part로 둔다. part가 null이거나 없는 줄은 지금 그대로(종일)다', async () => {
    const am = { ...OFF_ROW, id: ID, part: 'am' }
    const pm = { ...OFF_ROW, id: ID2, day: DAY2, part: 'pm' }
    const whole = { ...OFF_ROW, part: null }
    const memo = { ...MEMO_ROW, part: null }
    const { client, calls } = fakeClient(okWith([am, pm, whole, memo, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([
      { ...OFF_DAY, id: ID, part: 'am' },
      { ...OFF_DAY, id: ID2, day: DAY2, part: 'pm' },
      OFF_DAY,
      MEMO_DAY,
      OFF_DAY,
    ])
    expect(calls[1]).toEqual(['select', ALLDAY_COLUMNS])
  })

  it.each<[string, Record<string, unknown>]>([
    ['메모 줄에 part', { ...MEMO_ROW, part: 'am' }],
    ['part 틀림', { ...OFF_ROW, part: 'x' }],
    ['part 숫자', { ...OFF_ROW, part: 1 }],
  ])('AC-7616.1: 모양이 틀린 종일 줄(%s)은 뺀다', async (_name, bad) => {
    const { client } = fakeClient(okWith([bad, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([OFF_DAY])
  })

  it('AC-7616.1: 손으로 넣는 휴무는 part·leave_id를 보내지 않는다(두 칸은 트리거만 쓴다)', async () => {
    const { client, calls } = fakeClient(okWith(OFF_ROW))
    const item = { day: DAY, type: 'off', memo: null, staffId: 'st-ga', staffName: '가', part: 'am', leaveId: ID } as Omit<CalAllDay, 'id'>
    await expect(addAllDay(client, item)).resolves.toEqual(OFF_DAY)
    expect(calls[1]).toEqual(['insert', { day: DAY, type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가' }])
    expect(calls[2]).toEqual(['select', ALLDAY_COLUMNS])
  })
})

describe('addAllDay', () => {
  it('AC-5901.6: 메모 줄은 다섯 칸(시행자 칸은 null)을 넣고 DB가 준 줄을 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(MEMO_ROW))
    await expect(addAllDay(client, { day: DAY, type: 'memo', memo: ' 원장님 학회 ', staffId: null, staffName: null })).resolves.toEqual(MEMO_DAY)
    expect(calls).toEqual([
      ['from', 'calendar_allday'],
      ['insert', { day: DAY, type: 'memo', memo: '원장님 학회', staff_id: null, staff_name: null }],
      ['select', ALLDAY_COLUMNS],
      ['single'],
    ])
    expect(Object.keys(calls[1]?.[1] as object)).toEqual(ALLDAY_INSERT_KEYS)
  })

  it('AC-5901.6: 휴무 줄은 시행자 칸을 넣고 메모는 null로 보낸다(받은 메모·다른 열쇠는 보내지 않는다)', async () => {
    const { client, calls } = fakeClient(okWith(OFF_ROW))
    const item = { day: DAY, type: 'off', memo: '버림', staffId: 'st-ga', staffName: '가', phone: PHONE } as Omit<CalAllDay, 'id'>
    await expect(addAllDay(client, item)).resolves.toEqual(OFF_DAY)
    expect(calls[1]).toEqual(['insert', { day: DAY, type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가' }])
  })

  it('AC-5901.6: 메모가 개인정보 모양이면 보내지 않고 blocked다', async () => {
    const { client, calls } = fakeClient(okWith(MEMO_ROW))
    await expect(addAllDay(client, { day: DAY, type: 'memo', memo: PHONE, staffId: null, staffName: null })).resolves.toBe('blocked')
    sentNothing(calls)
  })

  it.each<[string, Record<string, unknown>]>([
    ['메모 21자', { day: DAY, type: 'memo', memo: '가'.repeat(21), staffId: null, staffName: null }],
    ['메모 빈칸뿐', { day: DAY, type: 'memo', memo: '  ', staffId: null, staffName: null }],
    ['휴무에 시행자 없음', { day: DAY, type: 'off', memo: null, staffId: null, staffName: null }],
    ['휴무에 시행자 이름 11자', { day: DAY, type: 'off', memo: null, staffId: 'st-ga', staffName: '가'.repeat(11) }],
    ['종류 x', { day: DAY, type: 'x', memo: '가', staffId: null, staffName: null }],
    ['날짜 틀림', { day: '2026-11-31', type: 'memo', memo: '가', staffId: null, staffName: null }],
  ])('AC-5901.6: %s이면 보내지 않고 failed다', async (_name, item) => {
    const { client, calls } = fakeClient(okWith(MEMO_ROW))
    expect((await caught(() => addAllDay(client, item as Omit<CalAllDay, 'id'>))).kind).toBe('failed')
    sentNothing(calls)
  })
})

describe('loadCalendarSettings', () => {
  it('AC-5901.6: 정해 둔 다섯 칸을 읽어 CalSettings로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith(SETTINGS_ROW))
    await expect(loadCalendarSettings(client)).resolves.toEqual(SETTINGS)
    expect(calls).toEqual([['from', 'calendar_settings'], ['select', SETTINGS_COLUMNS], ['maybeSingle']])
  })

  it('AC-5901.6: 줄이 없으면 기본값(DEFAULT_CAL_SETTINGS)이고, 돌려준 값을 고쳐도 기본값은 그대로다', async () => {
    const { client } = fakeClient(okWith(null))
    const loaded = await loadCalendarSettings(client)
    expect(loaded).toEqual(DEFAULT_CAL_SETTINGS)
    loaded.kinds[0]!.name = '바꿈'
    loaded.staff.push({ id: 'x', name: 'x', mark: 'x', color: 'blueberry' })
    expect(DEFAULT_CAL_SETTINGS.kinds[0]!.name).toBe('도수')
    expect(DEFAULT_CAL_SETTINGS.staff).toEqual([])
  })

  it('AC-5901.6·AC-8503.3: 기본값은 google-link design.md 7-4 DB 기본과 같다(종류 다섯·알아볼 글·충격파 세이지·시행자 없음·8~20시·일요일 안 봄)', () => {
    expect(DEFAULT_CAL_SETTINGS).toEqual({
      kinds: [
        { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
        { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
        { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
        { id: 'inj', name: '주사', len: 10, color: null, words: ['주사'] },
        { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
      ],
      staff: [],
      openHour: 8,
      closeHour: 20,
      sunday: false,
    })
  })

  it.each<[string, Record<string, unknown>, Partial<CalSettings>]>([
    ['종류 빈 목록', { kinds: [] }, { kinds: DEFAULT_CAL_SETTINGS.kinds }],
    ['종류 색 밖', { kinds: [{ id: 'dosu', name: '도수', len: 30, color: 'gold' }] }, { kinds: DEFAULT_CAL_SETTINGS.kinds }],
    ['시행자 색 밖', { staff: [{ ...SETTINGS.staff[0], color: 'gold' }] }, { staff: [] }],
    ['종류가 배열 아님', { kinds: { a: 1 } }, { kinds: DEFAULT_CAL_SETTINGS.kinds }],
    ['한 글자 표시 겹침', { staff: [SETTINGS.staff[0], { ...SETTINGS.staff[1], mark: '가' }] }, { staff: [] }],
    ['시행자 색 없음', { staff: [{ ...SETTINGS.staff[0], color: null }] }, { staff: [] }],
    ['여는 시간 4', { open_hour: 4 }, { openHour: 8, closeHour: 20 }],
    ['닫는 시간 25', { close_hour: 25 }, { openHour: 8, closeHour: 20 }],
    ['일요일 글자', { sunday: 'yes' }, { sunday: false }],
  ])('AC-5901.6: 칸 모양이 틀리면(%s) 그 칸만 기본값이다', async (_name, patch, expected) => {
    const { client } = fakeClient(okWith({ ...SETTINGS_ROW, ...patch }))
    await expect(loadCalendarSettings(client)).resolves.toEqual({ ...SETTINGS, ...expected })
  })

  it('AC-6001.5: 새 10색이 든 종류·시행자는 그 색 그대로 돌려준다', async () => {
    const { client } = fakeClient(okWith({ ...SETTINGS_ROW, kinds: NEW_COLOR_SETTINGS.kinds, staff: NEW_COLOR_SETTINGS.staff }))
    await expect(loadCalendarSettings(client)).resolves.toEqual(NEW_COLOR_SETTINGS)
  })

  it("AC-6001.5: 표에 없는 색 이름(gold)은 종류는 처음 값, 시행자는 빈 목록이다", async () => {
    const goldKind = { ...SETTINGS_ROW, kinds: [{ id: 'dosu', name: '도수', len: 30, color: 'gold' }] }
    await expect(loadCalendarSettings(fakeClient(okWith(goldKind)).client)).resolves.toEqual({ ...SETTINGS, kinds: DEFAULT_CAL_SETTINGS.kinds })
    const goldStaff = { ...SETTINGS_ROW, staff: [{ ...SETTINGS.staff[0], color: 'gold' }] }
    await expect(loadCalendarSettings(fakeClient(okWith(goldStaff)).client)).resolves.toEqual({ ...SETTINGS, staff: [] })
  })

  it('AC-5901.6: 줄이 객체가 아니면 기본값이다. 종류·시행자의 다른 열쇠는 옮기지 않는다', async () => {
    await expect(loadCalendarSettings(fakeClient(okWith('x')).client)).resolves.toEqual(DEFAULT_CAL_SETTINGS)
    const odd = { ...SETTINGS_ROW, kinds: [{ ...SETTINGS.kinds[0], extra: 1 }], staff: [{ ...SETTINGS.staff[0], phone: PHONE }] }
    const loaded = await loadCalendarSettings(fakeClient(okWith(odd)).client)
    expect(Object.keys(loaded.kinds[0] ?? {})).toEqual(['id', 'name', 'len', 'color', 'words'])
    expect(Object.keys(loaded.staff[0] ?? {})).toEqual(['id', 'name', 'mark', 'color'])
  })
})

describe('checkCalendarSettings', () => {
  it('AC-5901.6: 맞는 설정·기본값은 문제가 없다', () => {
    expect(checkCalendarSettings(SETTINGS)).toEqual([])
    expect(checkCalendarSettings(DEFAULT_CAL_SETTINGS)).toEqual([])
  })

  const kindAt = (patch: Record<string, unknown>) => ({ ...SETTINGS, kinds: [{ ...SETTINGS.kinds[0], ...patch }, SETTINGS.kinds[1]] })
  const staffAt = (patch: Record<string, unknown>) => ({ ...SETTINGS, staff: [{ ...SETTINGS.staff[0], ...patch }, SETTINGS.staff[1]] })

  it.each<[string, unknown, string]>([
    ['종류 0개', { ...SETTINGS, kinds: [] }, 'kinds-empty'],
    ['종류 이름 빈칸', kindAt({ name: '  ' }), 'kind-name'],
    ['종류 이름 11자', kindAt({ name: '가'.repeat(11) }), 'kind-name'],
    ['종류 길이 0', kindAt({ len: 0 }), 'kind-len'],
    ['종류 길이 7', kindAt({ len: 7 }), 'kind-len'],
    ['종류 길이 125', kindAt({ len: 125 }), 'kind-len'],
    ['종류 id 겹침', kindAt({ id: 'inj' }), 'kind-id'],
    ['종류 id 빈 글자', kindAt({ id: '' }), 'kind-id'],
    ['종류 색 밖', kindAt({ color: 'gold' }), 'kind-color'],
    ['시행자 이름 빈칸', staffAt({ name: '' }), 'staff-name'],
    ['시행자 이름 11자', staffAt({ name: '가'.repeat(11) }), 'staff-name'],
    ['한 글자 표시 두 글자', staffAt({ mark: '가나' }), 'staff-mark'],
    ['한 글자 표시 빈 글자', staffAt({ mark: '' }), 'staff-mark'],
    ['한 글자 표시 겹침', staffAt({ mark: '나' }), 'staff-mark-dup'],
    ['시행자 id 겹침', staffAt({ id: 'st-na' }), 'staff-id'],
    ['시행자 색 없음', staffAt({ color: null }), 'staff-color'],
    ['시행자 색 밖', staffAt({ color: 'gold' }), 'staff-color'],
    ['여는 시간 4', { ...SETTINGS, openHour: 4 }, 'hours'],
    ['닫는 시간 25', { ...SETTINGS, closeHour: 25 }, 'hours'],
    ['여는 시간 = 닫는 시간', { ...SETTINGS, openHour: 12, closeHour: 12 }, 'hours'],
    ['시간 정수 아님', { ...SETTINGS, openHour: 8.5 }, 'hours'],
    ['일요일 글자', { ...SETTINGS, sunday: 'yes' }, 'sunday'],
  ])('AC-5901.6: %s이면 문제 목록에 %s가 있다', (_name, settings, problem) => {
    expect(checkCalendarSettings(settings as CalSettings)).toContain(problem)
  })

  it('AC-6001.5: 새 10색(빨강~검정)이 든 종류·시행자는 문제가 없다', () => {
    expect(checkCalendarSettings(NEW_COLOR_SETTINGS)).toEqual([])
  })

  it("AC-6001.5: 표에 없는 이름(gold)은 종류는 kind-color, 시행자는 staff-color 문제다", () => {
    expect(checkCalendarSettings(kindAt({ color: 'gold' }) as CalSettings)).toEqual(['kind-color'])
    expect(checkCalendarSettings(staffAt({ color: 'gold' }) as CalSettings)).toEqual(['staff-color'])
  })

  it('AC-5901.6: 길이 5·120, 이름 10자, 시간 5~24는 문제가 아니다', () => {
    expect(checkCalendarSettings({ ...kindAt({ len: 5, name: '가'.repeat(10) }), openHour: 5, closeHour: 24 } as CalSettings)).toEqual([])
    expect(checkCalendarSettings(kindAt({ len: 120 }) as CalSettings)).toEqual([])
  })
})

describe('saveCalendarSettings', () => {
  // 시행자·진료시간은 병원 정보에서 온다(spec clinic-profile AC-6603.4) → 종류 한 칸만 보낸다. staff·open_hour·close_hour·sunday 칸은 DB에 그대로 남는다
  const KINDS_ROW = { kinds: SETTINGS.kinds }

  it('AC-6603.4: 종류(kinds) 한 칸만 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). 시행자·시간 칸은 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveCalendarSettings(client, SETTINGS)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', 'calendar_settings'], ['upsert', KINDS_ROW, { onConflict: 'hospital_id' }]])
    expect(Object.keys(calls[1]?.[1] as object)).toEqual(['kinds'])
  })

  it('AC-6603.4: 병원 정보를 합친 설정(days·closedDates·병원 정보 시행자)을 받아도 종류 한 칸만 보낸다', async () => {
    const { client, calls } = fakeClient()
    const merged: CalSettings = {
      ...SETTINGS,
      staff: [{ id: 'p1', name: '새○○', mark: '새', color: 'blueberry' }],
      openHour: 13, // 오후 진료 병원: 옛 보이는 시간 검사(5~12시) 밖이어도 막지 않는다
      closeHour: 21,
      days: [null, null, null, null, null, null, null],
      closedDates: ['2026-11-20'],
    }
    await expect(saveCalendarSettings(client, merged)).resolves.toBeUndefined()
    expect(calls[1]?.[1]).toEqual(KINDS_ROW)
  })

  it('AC-5901.6: 종류는 정해 둔 열쇠만 골라 새로 만들고, 이름은 앞뒤 빈칸을 뺀다', async () => {
    const { client, calls } = fakeClient()
    const odd = {
      ...SETTINGS,
      hospital_id: 'x',
      kinds: [{ ...SETTINGS.kinds[0], name: ' 도수 ', extra: 1 }, SETTINGS.kinds[1]],
      staff: [{ ...SETTINGS.staff[0], mark: ' 가 ', phone: PHONE }, SETTINGS.staff[1]],
    } as CalSettings
    await saveCalendarSettings(client, odd)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(['kinds'])
    expect(row.kinds).toEqual(SETTINGS.kinds)
  })

  it('AC-6001.5: 새 10색이 든 종류도 그 색 이름 그대로 보낸다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveCalendarSettings(client, NEW_COLOR_SETTINGS)).resolves.toBeUndefined()
    const row = calls[1]?.[1] as { kinds: object[] }
    expect(row.kinds).toEqual(NEW_COLOR_SETTINGS.kinds)
  })

  it("AC-6001.5: 표에 없는 색(gold)이 든 종류는 보내지 않고 invalid다", async () => {
    const { client, calls } = fakeClient()
    const gold = { ...SETTINGS, kinds: [{ ...SETTINGS.kinds[0], color: 'gold' }] }
    await expect(saveCalendarSettings(client, gold as unknown as CalSettings)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-6603.4: 종류 검사(checkCalendarKinds)를 못 지나면 보내지 않고 invalid다. 시행자·시간 문제는 막지 않는다', async () => {
    for (const bad of [{ ...SETTINGS, kinds: [] }, { ...SETTINGS, kinds: [{ ...SETTINGS.kinds[0], len: 7 }] }]) {
      const { client, calls } = fakeClient()
      await expect(saveCalendarSettings(client, bad as CalSettings)).resolves.toBe('invalid')
      sentNothing(calls)
    }
    for (const fine of [{ ...SETTINGS, openHour: 4 }, { ...SETTINGS, staff: [SETTINGS.staff[0], { ...SETTINGS.staff[1], mark: '가' }] }]) {
      const { client, calls } = fakeClient()
      await expect(saveCalendarSettings(client, fine as CalSettings)).resolves.toBeUndefined()
      expect(calls[1]?.[1]).toEqual(KINDS_ROW)
    }
  })

  it('AC-6603.4: checkCalendarKinds는 종류 문제만 본다(종류 문제 차례 그대로)', () => {
    expect(checkCalendarKinds(SETTINGS.kinds)).toEqual([])
    expect(checkCalendarKinds([])).toEqual(['kinds-empty'])
    expect(checkCalendarKinds([{ ...SETTINGS.kinds[0]!, name: ' ', len: 7, color: 'gold' as never }])).toEqual(['kind-name', 'kind-len', 'kind-color'])
    expect(checkCalendarKinds([SETTINGS.kinds[0]!, { ...SETTINGS.kinds[1]!, id: 'dosu' }])).toEqual(['kind-id'])
  })

  it('AC-6603.4: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 종류 한 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(null)
    await saveCalendarSettings(realClient(fakeFetch), SETTINGS)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_settings')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id')
    expect(request.method).toBe('POST')
    expect(request.headers.get('Prefer')).toContain('resolution=merge-duplicates')
    expect(request.body).toEqual(KINDS_ROW)
  })
})

describe('loadCalendarRev', () => {
  it('AC-5901.6: rev 칸 하나만 읽어 숫자로 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith({ rev: 42 }))
    await expect(loadCalendarRev(client)).resolves.toBe(42)
    expect(calls).toEqual([['from', 'calendar_rev'], ['select', 'rev'], ['maybeSingle']])
  })

  it('AC-5901.6: 줄이 없으면 0이다', async () => {
    await expect(loadCalendarRev(fakeClient(okWith(null)).client)).resolves.toBe(0)
  })

  it.each([-1, 1.5, '42', null])('AC-5901.6: rev가 %j이면(0 이상 정수 아님) failed다', async (rev) => {
    expect((await caught(() => loadCalendarRev(fakeClient(okWith({ rev })).client))).kind).toBe('failed')
  })

  it('AC-5901.6: 진짜 클라이언트로도 select=rev 한 번이다', async () => {
    const fakeFetch = fetchReturning([{ rev: 7 }])
    await expect(loadCalendarRev(realClient(fakeFetch))).resolves.toBe(7)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_rev')
    expect([...request.url.searchParams.keys()]).toEqual(['select'])
    expect(request.url.searchParams.get('select')).toBe('rev')
  })
})

// ── google-link (REQ-8503·REQ-8505, design.md 7-1·7-2·10-3): 구글 칸 · 5분 시작 · 시행자 없음 ──────────

describe('AC-8503.3 예약 구글 칸 읽기', () => {
  it('AC-8503.3: listAppts는 구글 칸(g_*·color_from·created_at)을 정해 둔 이름 그대로 읽어 옮긴다. g_color colorId(1~11)는 색 이름이다', async () => {
    const { client, calls } = fakeClient(okWith([APPT_ROW, G_ROW]))
    await expect(listAppts(client, DAY, DAY2)).resolves.toEqual([SAVED, G_SAVED])
    expect(calls[1]).toEqual(['select', APPT_COLUMNS])
    for (const key of NEVER_READ) expect(APPT_COLUMNS.split(','), key).not.toContain(key)
  })

  it.each<[string, string]>([
    ['1', 'lavender'],
    ['2', 'sage'],
    ['3', 'grape'],
    ['4', 'flamingo'],
    ['5', 'banana'],
    ['6', 'tangerine'],
    ['7', 'peacock'],
    ['8', 'graphite'],
    ['9', 'blueberry'],
    ['10', 'basil'],
    ['11', 'tomato'],
  ])('AC-8503.3: g_color %s는 %s다', async (colorId, color) => {
    const { client } = fakeClient(okWith([{ ...G_ROW, g_color: colorId }]))
    const [appt] = await listAppts(client, DAY, DAY2)
    expect(appt?.gColor).toBe(color)
  })

  it('AC-8503.3: 시행자 없는 예약(세 칸 모두 null)은 받는다', async () => {
    const { client } = fakeClient(okWith([NO_STAFF_ROW]))
    await expect(listAppts(client, DAY, DAY2)).resolves.toEqual([NO_STAFF])
  })

  it('AC-8503.3: 5분 시작(555·1435)과 5분 처음 자리는 받는다', async () => {
    const { client } = fakeClient(okWith([{ ...APPT_ROW, start_min: 1435 }, { ...MOVED_ROW, start_min: 555, orig_start: 905 }]))
    const found = await listAppts(client, DAY, DAY2)
    expect(found.map((appt) => [appt.start, appt.origStart])).toEqual([
      [1435, null],
      [555, 905],
    ])
  })

  it('AC-8503.3: 알아본 출처(g_how)는 정해 둔 다섯 열쇠만 새로 만들어 옮긴다', async () => {
    const { client } = fakeClient(okWith([{ ...G_ROW, g_how: { ...G_HOW, phone: PHONE } }]))
    const [appt] = await listAppts(client, DAY, DAY2)
    expect(appt?.gHow).toEqual(G_HOW)
    expect(Object.keys(appt?.gHow ?? {})).toEqual(['staff', 'kind', 'memo', 'gStart', 'gEnd'])
  })
})

describe('AC-8503.3 addAppt · updateAppt 구글 칸 보내기', () => {
  it('AC-8503.3: 넣기는 열두 칸 뒤에 받은 구글 칸을 정해 둔 이름·차례로 보낸다(g_color는 colorId 글)', async () => {
    const { client, calls } = fakeClient(okWith(G_ROW))
    await expect(addAppt(client, { ...DRAFT, ...G_PART })).resolves.toEqual(G_SAVED)
    expect(calls[1]).toEqual(['insert', { ...INSERTED, ...G_PART_ROW }])
    expect(Object.keys(calls[1]?.[1] as object)).toEqual([...APPT_INSERT_KEYS, ...G_KEYS])
  })

  it('AC-8503.3: 웹앱이 만든 새 예약은 받은 구글 칸(일정 id·보낼 것·들어온 길)만 보낸다', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    await addAppt(client, { ...DRAFT, gEventId: EVENT, gWait: 'new', gFrom: 'web' })
    expect(calls[1]).toEqual(['insert', { ...INSERTED, g_event_id: EVENT, g_wait: 'new', g_from: 'web' }])
  })

  it('AC-8503.3: g_wait_at·created_at·g_* 밖 열쇠는 받아도 보내지 않는다(g_wait_at은 DB 트리거만 적는다)', async () => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    const extra = { gWaitAt: WAIT_AT, createdAt: CREATED, g_wait_at: WAIT_AT, phone: PHONE, sex: 'F', age: 70, birth: '19560101' }
    await addAppt(client, { ...DRAFT, ...G_PART, ...extra } as ApptDraft)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual([...APPT_INSERT_KEYS, ...G_KEYS])
    for (const key of NEVER_SENT) expect(row).not.toHaveProperty(key)
  })

  it('AC-8505.3: 개인정보 모양(전화·주민번호·메일)이 남은 구글 제목·덮인 쪽 글은 그 칸만 null로 보낸다(막지 않는다)', async () => {
    for (const bad of [`1500 가짜환자 ${PHONE}`, '주민 900101-1234567', 'a@b.co 확인']) {
      const { client, calls } = fakeClient(okWith(G_ROW))
      await expect(addAppt(client, { ...DRAFT, ...G_PART, gTitle: bad, gNote: bad })).resolves.toEqual(G_SAVED)
      const row = calls[1]?.[1] as Record<string, unknown>
      expect([row.g_title, row.g_note]).toEqual([null, null])
      expect(JSON.stringify(calls)).not.toContain(bad)
    }
  })

  it('AC-8505.3: 가린 조각(…)만 남은 제목은 그대로 보낸다', async () => {
    const { client, calls } = fakeClient(okWith(G_ROW))
    await addAppt(client, { ...DRAFT, ...G_PART, gTitle: '1500 가짜환자 … 도수' })
    expect((calls[1]?.[1] as Record<string, unknown>).g_title).toBe('1500 가짜환자 … 도수')
  })

  it('AC-8503.3: 시행자 없는 예약은 세 칸을 함께 null로 보낸다', async () => {
    const { client, calls } = fakeClient(okWith(NO_STAFF_ROW))
    await expect(addAppt(client, { ...DRAFT, staffId: null, staffName: null, staffMark: null })).resolves.toEqual(NO_STAFF)
    expect(calls[1]).toEqual(['insert', { ...INSERTED, staff_id: null, staff_name: null, staff_mark: null }])
  })

  it.each<[string, Partial<ApptDraft> | Record<string, unknown>]>([
    ['시행자 id만 null', { staffId: null }],
    ['시행자 표시만 null', { staffMark: null }],
    ['시행자 이름·표시만 null', { staffName: null, staffMark: null }],
    ['구글 일정 id 4자', { gEventId: 'abcd' }],
    ['구글 일정 id에 빼기', { gEventId: 'ssk-0123' }],
    ['구글 일정 id 301자', { gEventId: 'a'.repeat(301) }],
    ['구글 고친 때 글 틀림', { gUpdated: '2026-11-18' }],
    ['구글 제목 201자', { gTitle: '가'.repeat(201) }],
    ['구글 색 옛 이름(blue)', { gColor: 'blue' }],
    ['구글 색 colorId 글(11)', { gColor: '11' }],
    ['색 출처 x', { colorFrom: 'x' }],
    ['제목 그대로가 글', { gKeepTitle: 'yes' }],
    ['구글 변경이 null', { gMoved: null }],
    ['구글 지움이 숫자', { gGone: 0 }],
    ['보낼 것 delete', { gWait: 'delete' }],
    ['덮인 쪽 101자', { gNote: '가'.repeat(101) }],
    ['들어온 길 x', { gFrom: 'x' }],
    ['알아본 출처 시행자 x', { gHow: { ...G_HOW, staff: 'x' } }],
    ['알아본 출처 메모 글', { gHow: { ...G_HOW, memo: 'yes' } }],
    ['알아본 출처 열쇠 모자람', { gHow: { staff: 'title', kind: 'color', memo: true } }],
    ['알아본 출처 600바이트 넘음', { gHow: { ...G_HOW, gStart: '가'.repeat(200), gEnd: '가'.repeat(200) } }],
  ])('AC-8503.3: %s이면 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(APPT_ROW))
    expect((await caught(() => addAppt(client, { ...DRAFT, ...patch } as ApptDraft))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8503.3: 고치기는 받은 구글 칸만 정해 둔 차례로 보낸다(시행자 세 칸은 함께)', async () => {
    const { client, calls } = fakeClient(okWith(G_ROW))
    await updateAppt(client, ID2, { gWait: 'edit', gKeepTitle: false, staffId: null, staffName: null, staffMark: null })
    expect(calls[1]).toEqual(['update', { staff_id: null, staff_name: null, staff_mark: null, g_keep_title: false, g_wait: 'edit' }])
  })

  it('AC-8503.3: 고치기에 시행자 세 칸 가운데 일부만 오면 보내지 않고 failed다', async () => {
    for (const patch of [{ staffId: 'st-na' }, { staffId: 'st-na', staffName: '나' }, { staffMark: null }] as Partial<ApptDraft>[]) {
      const { client, calls } = fakeClient(okWith(APPT_ROW))
      expect((await caught(() => updateAppt(client, ID, patch))).kind).toBe('failed')
      sentNothing(calls)
    }
  })

  it('AC-8503.3: 진짜 클라이언트로도 넣기 몸통에 구글 칸이 정해 둔 이름으로 가고 g_wait_at은 없다', async () => {
    const fakeFetch = fetchReturning(G_ROW)
    await addAppt(realClient(fakeFetch), { ...DRAFT, ...G_PART, gWaitAt: WAIT_AT } as ApptDraft)
    const request = requestOf(fakeFetch)
    expect(request.body).toEqual({ ...INSERTED, ...G_PART_ROW })
    expect(request.body).not.toHaveProperty('g_wait_at')
  })
})

describe('AC-8503.3 listWaitingAppts: 아직 구글로 못 보낸 예약', () => {
  it('AC-8503.3: g_wait가 있는 그날부터의 예약을 고친 때(g_wait_at)·id 차례로 1,000줄씩 읽는다', async () => {
    const { client, calls } = fakeClient(okWith([G_ROW]))
    await expect(listWaitingAppts(client, DAY)).resolves.toEqual([G_SAVED])
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['select', APPT_COLUMNS],
      ['not', 'g_wait', 'is', null],
      ['gte', 'day', DAY],
      ['order', 'g_wait_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-8503.3: 1,000줄이 넘으면 나눠 읽고, 날짜가 틀리면 보내지 않고 failed다', async () => {
    const { client } = fakeClient(okWith(many(1000, (i) => ({ ...G_ROW, id: `w-${i}` }))), okWith([G_ROW]))
    expect(await listWaitingAppts(client, DAY)).toHaveLength(1001)
    const bad = fakeClient()
    expect((await caught(() => listWaitingAppts(bad.client, '2026-13-01'))).kind).toBe('failed')
    sentNothing(bad.calls)
  })

  it('AC-8503.3: 진짜 클라이언트로도 g_wait=not.is.null·day=gte·차례만 묻는다', async () => {
    const fakeFetch = fetchReturning([G_ROW])
    await listWaitingAppts(realClient(fakeFetch), DAY)
    const request = requestOf(fakeFetch)
    expect(request.method).toBe('GET')
    expect(request.url.searchParams.get('g_wait')).toBe('not.is.null')
    expect(request.url.searchParams.get('day')).toBe(`gte.${DAY}`)
    expect(request.url.searchParams.get('order')).toBe('g_wait_at.asc,id.asc')
  })
})

describe('AC-8503.3 findApptsByEvents: 구글 일정 id로 짝 찾기', () => {
  it('AC-8503.3: 겹친 id를 한 번만, 100개씩 g_event_id in으로 읽는다', async () => {
    const ids = many(150, (i) => `event${String(i).padStart(4, '0')}`)
    const { client, calls } = fakeClient(okWith([G_ROW]), okWith([]))
    await expect(findApptsByEvents(client, [...ids, ids[0]!])).resolves.toEqual([G_SAVED])
    const ins = calls.filter((call) => call[0] === 'in')
    expect(ins).toEqual([
      ['in', 'g_event_id', ids.slice(0, 100)],
      ['in', 'g_event_id', ids.slice(100)],
    ])
    expect(calls.slice(0, 4)).toEqual([['from', 'calendar_appts'], ['select', APPT_COLUMNS], ['in', 'g_event_id', ids.slice(0, 100)], ['order', 'id', { ascending: true }]])
  })

  it('AC-8503.3: 빈 목록이면 부르지 않고 빈 목록이다. 모양이 틀린 id가 있으면 보내지 않고 failed다', async () => {
    const empty = fakeClient()
    await expect(findApptsByEvents(empty.client, [])).resolves.toEqual([])
    sentNothing(empty.calls)
    for (const bad of ['abcd', 'a,b,c,d,e', 'x'.repeat(301), '']) {
      const { client, calls } = fakeClient()
      expect((await caught(() => findApptsByEvents(client, [EVENT, bad]))).kind).toBe('failed')
      sentNothing(calls)
    }
  })

  it('AC-8503.3: 진짜 클라이언트로도 g_event_id=in.(…)으로 묻는다', async () => {
    const fakeFetch = fetchReturning([G_ROW])
    await findApptsByEvents(realClient(fakeFetch), [EVENT, EVENT2])
    const request = requestOf(fakeFetch)
    expect(request.url.searchParams.get('g_event_id')).toBe(`in.(${EVENT},${EVENT2})`)
    expect(request.url.searchParams.get('select')).toBe(APPT_COLUMNS)
  })
})

describe('AC-8503.3 applyGoogleAppt: 구글에서 받은 바뀜을 조건 고치기로 적기', () => {
  it('AC-8503.3: g_updated가 null이거나 받은 때보다 이르고, g_wait_at이 읽을 때 글 그대로일 때만 고친다(고친 줄을 돌려준다)', async () => {
    const { client, calls } = fakeClient(okWith([G_ROW]))
    await expect(applyGoogleAppt(client, ID2, { start: 555, gColor: 'tomato', gWait: null }, G_UPDATED, WAIT_AT)).resolves.toEqual(G_SAVED)
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['update', { start_min: 555, g_updated: G_UPDATED, g_color: '11', g_wait: null }],
      ['eq', 'id', ID2],
      ['or', `g_updated.is.null,g_updated.lt."${G_UPDATED}"`],
      ['eq', 'g_wait_at', WAIT_AT],
      ['select', APPT_COLUMNS],
    ])
  })

  it('AC-8503.3: 읽을 때 g_wait_at이 null이었으면 g_wait_at is null을 조건으로 한다', async () => {
    const { client, calls } = fakeClient(okWith([G_ROW]))
    await applyGoogleAppt(client, ID2, { status: 'cancel', gGone: true }, G_UPDATED, null)
    expect(calls[4]).toEqual(['is', 'g_wait_at', null])
    expect(calls[1]).toEqual(['update', { status: 'cancel', g_updated: G_UPDATED, g_gone: true }])
  })

  it('AC-8503.3: 조건에 맞는 줄이 없으면(그 사이 고침·이미 적음) null이다', async () => {
    const { client } = fakeClient(okWith([]))
    await expect(applyGoogleAppt(client, ID2, { memo: '고침' }, G_UPDATED, WAIT_AT)).resolves.toBeNull()
  })

  it('AC-8503.3: 이름·메모가 개인정보 모양이면 보내지 않고 blocked, 제목만 그러면 제목 칸은 null이다', async () => {
    const blocked = fakeClient(okWith([G_ROW]))
    await expect(applyGoogleAppt(blocked.client, ID2, { memo: PHONE }, G_UPDATED, WAIT_AT)).resolves.toBe('blocked')
    sentNothing(blocked.calls)
    const titled = fakeClient(okWith([G_ROW]))
    await applyGoogleAppt(titled.client, ID2, { gTitle: `가짜환자 ${PHONE}` }, G_UPDATED, WAIT_AT)
    expect(titled.calls[1]).toEqual(['update', { g_updated: G_UPDATED, g_title: null }])
  })

  it.each<[string, string, string, string | null]>([
    ['id 빈 글자', '', G_UPDATED, WAIT_AT],
    ['받은 때 글 틀림', ID, '어제', WAIT_AT],
    ['받은 때에 따옴표', ID, '2026-11-18T01:00:00"Z', WAIT_AT],
    ['읽은 g_wait_at 글 틀림', ID, G_UPDATED, '2026-11-18'],
  ])('AC-8503.3: %s이면 보내지 않고 failed다', async (_name, id, gUpdated, expectWaitAt) => {
    const { client, calls } = fakeClient(okWith([G_ROW]))
    expect((await caught(() => applyGoogleAppt(client, id, { memo: '가' }, gUpdated, expectWaitAt))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8503.3: 진짜 클라이언트로도 PATCH ?id=eq·or=(g_updated…)·g_wait_at=eq.<DB 글 그대로>로 한 번 보낸다', async () => {
    const fakeFetch = fetchReturning([G_ROW])
    await applyGoogleAppt(realClient(fakeFetch), ID2, { day: DAY2 }, G_UPDATED, WAIT_AT)
    const request = requestOf(fakeFetch)
    expect(request.method).toBe('PATCH')
    expect(request.url.searchParams.get('id')).toBe(`eq.${ID2}`)
    expect(request.url.searchParams.get('or')).toBe(`(g_updated.is.null,g_updated.lt."${G_UPDATED}")`)
    expect(request.url.searchParams.get('g_wait_at')).toBe(`eq.${WAIT_AT}`)
    expect(request.body).toEqual({ day: DAY2, g_updated: G_UPDATED })
  })
})

describe('AC-8503.3 markApptSent: 보낸 뒤 g_wait 비우기', () => {
  it('AC-8503.3: g_wait_at이 보낼 때 읽은 글 그대로일 때만 g_wait를 비우고 받은 구글 칸(고친 때·제목·지움)을 적는다 → 참', async () => {
    const { client, calls } = fakeClient(okWith([{ id: ID }]))
    await expect(markApptSent(client, ID, { gUpdated: G_UPDATED, gTitle: '1500 가짜환자 도수(가)', gGone: false }, WAIT_AT)).resolves.toBe(true)
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['update', { g_updated: G_UPDATED, g_title: '1500 가짜환자 도수(가)', g_gone: false, g_wait: null }],
      ['eq', 'id', ID],
      ['eq', 'g_wait_at', WAIT_AT],
      ['select', 'id'],
    ])
  })

  it('AC-8503.3: 그 사이 다시 고쳐 0줄이면 거짓이다(다음에 또 보낸다)', async () => {
    const { client } = fakeClient(okWith([]))
    await expect(markApptSent(client, ID, { gUpdated: G_UPDATED }, WAIT_AT)).resolves.toBe(false)
  })

  it('AC-8503.3: 정해 둔 칸(고친 때·제목·지움) 밖 열쇠는 보내지 않고, 개인정보 모양 제목은 null이다', async () => {
    const { client, calls } = fakeClient(okWith([{ id: ID }]))
    const sent = { gUpdated: G_UPDATED, gTitle: `가짜 ${PHONE}`, gWaitAt: CREATED, status: 'came', name: '가짜환자' }
    await markApptSent(client, ID, sent as Parameters<typeof markApptSent>[2], WAIT_AT)
    expect(calls[1]).toEqual(['update', { g_updated: G_UPDATED, g_title: null, g_wait: null }])
  })

  it.each<[string, string, unknown, unknown]>([
    ['id 빈 글자', '', { gUpdated: G_UPDATED }, WAIT_AT],
    ['읽은 g_wait_at 없음', ID, { gUpdated: G_UPDATED }, null],
    ['읽은 g_wait_at 글 틀림', ID, { gUpdated: G_UPDATED }, 'x'],
    ['받은 고친 때 틀림', ID, { gUpdated: 'x' }, WAIT_AT],
  ])('AC-8503.3: %s이면 보내지 않고 failed다', async (_name, id, sent, expectWaitAt) => {
    const { client, calls } = fakeClient(okWith([{ id: ID }]))
    expect((await caught(() => markApptSent(client, id, sent as { gUpdated: string }, expectWaitAt as string))).kind).toBe('failed')
    sentNothing(calls)
  })
})

describe('AC-8503.3 insertGoogleAppts: 처음 가져오기·받기 넣기', () => {
  it('AC-8503.3: 500줄씩 on conflict (hospital_id, g_event_id) do nothing으로 넣는다. 줄마다 스물네 칸이 같은 차례다', async () => {
    const rows = many(501, (i) => ({ ...DRAFT, ...G_PART, gEventId: `event${String(i).padStart(4, '0')}` }))
    const { client, calls } = fakeClient()
    await expect(insertGoogleAppts(client, rows)).resolves.toEqual({ sent: 501, blocked: 0 })
    const upserts = calls.filter((call) => call[0] === 'upsert')
    expect(upserts.map((call) => (call[1] as unknown[]).length)).toEqual([500, 1])
    expect(upserts.map((call) => call[2])).toEqual([
      { onConflict: 'hospital_id,g_event_id', ignoreDuplicates: true },
      { onConflict: 'hospital_id,g_event_id', ignoreDuplicates: true },
    ])
    const first = (upserts[0]?.[1] as Record<string, unknown>[])[0]!
    expect(first).toEqual({ ...INSERTED, ...G_PART_ROW, g_event_id: 'event0000' })
    expect(Object.keys(first)).toEqual([...APPT_INSERT_KEYS, ...G_KEYS])
  })

  it('AC-8503.3: 받지 않은 구글 칸은 DB 기본과 같은 값으로 채워 줄마다 칸이 같다', async () => {
    const { client, calls } = fakeClient()
    await insertGoogleAppts(client, [{ ...DRAFT, gEventId: EVENT, gFrom: 'pull' }])
    expect((calls[1]?.[1] as unknown[])[0]).toEqual({
      ...INSERTED,
      g_event_id: EVENT,
      g_updated: null,
      g_title: null,
      g_color: null,
      color_from: 'app',
      g_keep_title: false,
      g_moved: false,
      g_gone: false,
      g_wait: null,
      g_note: null,
      g_from: 'pull',
      g_how: null,
    })
  })

  it('AC-8503.3: 이름·메모가 개인정보 모양인 줄은 빼고 센다(나머지는 보낸다). 빈 목록이면 부르지 않는다', async () => {
    const { client, calls } = fakeClient()
    const rows = [{ ...DRAFT, ...G_PART }, { ...DRAFT, ...G_PART, gEventId: EVENT2, memo: PHONE }]
    await expect(insertGoogleAppts(client, rows)).resolves.toEqual({ sent: 1, blocked: 1 })
    expect(calls[1]?.[1] as unknown[]).toHaveLength(1)
    expect(JSON.stringify(calls)).not.toContain(PHONE)
    const empty = fakeClient()
    await expect(insertGoogleAppts(empty.client, [])).resolves.toEqual({ sent: 0, blocked: 0 })
    sentNothing(empty.calls)
  })

  it('AC-8503.3: 구글 일정 id가 없거나 모양이 틀린 줄이 하나라도 있으면 아무것도 보내지 않고 failed다', async () => {
    for (const bad of [{ ...DRAFT }, { ...DRAFT, ...G_PART, gEventId: null }, { ...DRAFT, ...G_PART, start: 903 }]) {
      const { client, calls } = fakeClient()
      expect((await caught(() => insertGoogleAppts(client, [{ ...DRAFT, ...G_PART }, bad]))).kind).toBe('failed')
      sentNothing(calls)
    }
  })

  it('AC-8503.3: 진짜 클라이언트로도 POST on_conflict=hospital_id,g_event_id · resolution=ignore-duplicates다', async () => {
    const fakeFetch = fetchReturning(null)
    await insertGoogleAppts(realClient(fakeFetch), [{ ...DRAFT, ...G_PART }])
    const request = requestOf(fakeFetch)
    expect(request.method).toBe('POST')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id,g_event_id')
    expect(request.headers.get('Prefer')).toContain('resolution=ignore-duplicates')
    expect(request.body).toEqual([{ ...INSERTED, ...G_PART_ROW }])
  })
})

describe('AC-8503.3 종일 메모 구글 칸', () => {
  const G_MEMO_ROW = { ...MEMO_ROW, g_event_id: EVENT, g_updated: G_UPDATED, g_wait: true, g_wait_at: WAIT_AT }
  const G_MEMO: CalAllDay = { ...MEMO_DAY, gEventId: EVENT, gUpdated: G_UPDATED, gWait: true, gWaitAt: WAIT_AT }

  it('AC-8503.3: 메모 줄의 구글 칸(g_event_id·g_updated·g_wait·g_wait_at)을 읽는다. 휴무 줄은 지금 모양 그대로다', async () => {
    const { client } = fakeClient(okWith([G_MEMO_ROW, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([G_MEMO, OFF_DAY])
  })

  it.each<[string, Record<string, unknown>]>([
    ['일정 id 4자', { g_event_id: 'abcd' }],
    ['보낼 것이 null', { g_wait: null }],
    ['고친 때 글 틀림', { g_updated: 'x' }],
  ])('AC-8503.3: 메모 줄 구글 칸이 틀리면(%s) 뺀다', async (_name, patch) => {
    const { client } = fakeClient(okWith([{ ...G_MEMO_ROW, ...patch }, OFF_ROW]))
    await expect(listAllDay(client, DAY, DAY2)).resolves.toEqual([OFF_DAY])
  })

  it('AC-8503.3: 웹앱이 넣는 메모는 받은 구글 칸(일정 id·보낼 것)을 같은 넣기에 함께 보낸다', async () => {
    const { client, calls } = fakeClient(okWith(G_MEMO_ROW))
    await expect(addAllDay(client, { day: DAY, type: 'memo', memo: '원장님 학회', staffId: null, staffName: null, gEventId: EVENT, gWait: true })).resolves.toEqual(G_MEMO)
    expect(calls[1]).toEqual(['insert', { day: DAY, type: 'memo', memo: '원장님 학회', staff_id: null, staff_name: null, g_event_id: EVENT, g_wait: true }])
  })

  it('AC-8503.3: 휴무 줄에는 구글 칸을 보내지 않는다(off 줄 짝은 gcal_off_days). 일정 id 모양이 틀리면 failed다', async () => {
    const { client, calls } = fakeClient(okWith(OFF_ROW))
    await addAllDay(client, { day: DAY, type: 'off', memo: null, staffId: 'st-ga', staffName: '가', gEventId: EVENT, gWait: true })
    expect(calls[1]).toEqual(['insert', { day: DAY, type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가' }])
    const bad = fakeClient(okWith(MEMO_ROW))
    expect((await caught(() => addAllDay(bad.client, { day: DAY, type: 'memo', memo: '가', staffId: null, staffName: null, gEventId: 'a-b' }))).kind).toBe('failed')
    sentNothing(bad.calls)
  })

  it('AC-8503.3: listWaitingMemos는 g_wait가 참인 그날부터의 메모 줄을 고친 때·id 차례로 읽는다', async () => {
    const { client, calls } = fakeClient(okWith([G_MEMO_ROW]))
    await expect(listWaitingMemos(client, DAY)).resolves.toEqual([G_MEMO])
    expect(calls).toEqual([
      ['from', 'calendar_allday'],
      ['select', ALLDAY_COLUMNS],
      ['eq', 'type', 'memo'],
      ['eq', 'g_wait', true],
      ['gte', 'day', DAY],
      ['order', 'g_wait_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ])
  })

  it('AC-8503.3: markMemoSent는 g_wait_at이 그대로일 때만 g_wait를 거짓으로(받은 고친 때도 함께) 적는다 → 0줄이면 거짓', async () => {
    const { client, calls } = fakeClient(okWith([{ id: ID }]), okWith([]))
    await expect(markMemoSent(client, ID, WAIT_AT, G_UPDATED)).resolves.toBe(true)
    expect(calls).toEqual([
      ['from', 'calendar_allday'],
      ['update', { g_updated: G_UPDATED, g_wait: false }],
      ['eq', 'id', ID],
      ['eq', 'g_wait_at', WAIT_AT],
      ['select', 'id'],
    ])
    await expect(markMemoSent(client, ID, WAIT_AT)).resolves.toBe(false)
    expect(calls[6]).toEqual(['update', { g_wait: false }])
    const bad = fakeClient()
    expect((await caught(() => markMemoSent(bad.client, ID, 'x'))).kind).toBe('failed')
    sentNothing(bad.calls)
  })

  it('AC-8503.3: applyGoogleMemo는 메모 줄만, g_updated·g_wait_at 조건 고치기로 날짜·메모를 고친다(지우고 다시 넣지 않는다)', async () => {
    const { client, calls } = fakeClient(okWith([G_MEMO_ROW]), okWith([]))
    await expect(applyGoogleMemo(client, ID, { day: DAY2, memo: ' 학회 ' }, G_UPDATED, WAIT_AT)).resolves.toEqual(G_MEMO)
    expect(calls.slice(0, 7)).toEqual([
      ['from', 'calendar_allday'],
      ['update', { day: DAY2, memo: '학회', g_updated: G_UPDATED }],
      ['eq', 'id', ID],
      ['eq', 'type', 'memo'],
      ['or', `g_updated.is.null,g_updated.lt."${G_UPDATED}"`],
      ['eq', 'g_wait_at', WAIT_AT],
      ['select', ALLDAY_COLUMNS],
    ])
    await expect(applyGoogleMemo(client, ID, { memo: '학회' }, G_UPDATED, null)).resolves.toBeNull()
    expect(calls.at(-2)).toEqual(['is', 'g_wait_at', null])
  })

  it('AC-8503.3·AC-8505.3: applyGoogleMemo도 메모가 개인정보 모양이면 보내지 않고 blocked, 21자·빈칸이면 failed다', async () => {
    const blocked = fakeClient(okWith([G_MEMO_ROW]))
    await expect(applyGoogleMemo(blocked.client, ID, { memo: PHONE }, G_UPDATED, null)).resolves.toBe('blocked')
    sentNothing(blocked.calls)
    for (const memo of ['가'.repeat(21), '  ']) {
      const { client, calls } = fakeClient(okWith([G_MEMO_ROW]))
      expect((await caught(() => applyGoogleMemo(client, ID, { memo }, G_UPDATED, null))).kind).toBe('failed')
      sentNothing(calls)
    }
  })
})

describe('AC-8503.3 newGoogleEventId', () => {
  it("AC-8503.3: 웹앱이 정하는 구글 일정 id는 'ssk' + 32자 16진수이고 부를 때마다 다르다", () => {
    const ids = new Set(many(20, () => newGoogleEventId()))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(id).toMatch(/^ssk[0-9a-f]{32}$/)
  })
})

describe('AC-8503.3 설정: 11색·캘린더 기본 색·알아볼 글', () => {
  it("AC-8503.3: 종류 색 'default'(캘린더 기본 색)·11색·null은 받고, 옛 20색 이름(pink·lime·gray)은 kind-color다", () => {
    expect(checkCalendarKinds([{ ...SETTINGS.kinds[0]!, color: 'default' }])).toEqual([])
    for (const old of ['pink', 'lime', 'gray', 'blue']) expect(checkCalendarKinds([{ ...SETTINGS.kinds[0]!, color: old as never }])).toEqual(['kind-color'])
    expect(checkCalendarSettings({ ...SETTINGS, staff: [{ ...SETTINGS.staff[0]!, color: 'default' as never }] })).toEqual(['staff-color'])
  })

  it('AC-8503.3: 종류의 알아볼 글(words)이 없거나 틀리면 기본 글(id 기본, 그 밖 [이름])로 읽고 저장한다', async () => {
    const kinds = [
      { id: 'jabo', name: '자보도수', len: 30, color: null },
      { id: 'memo', name: '상담', len: 10, color: 'default', words: 'x' },
      { id: 'inj', name: '주사', len: 10, color: null, words: [' 주사 ', '', 3] },
      { id: 'visit', name: '진료', len: 10, color: null, words: [' 진료 ', '진찰'] },
    ]
    const loaded = await loadCalendarSettings(fakeClient(okWith({ ...SETTINGS_ROW, kinds })).client)
    expect(loaded.kinds.map((kind) => kind.words)).toEqual([['자보도수', '자보'], ['상담'], ['주사'], ['진료', '진찰']])
    const { client, calls } = fakeClient()
    await saveCalendarSettings(client, { kinds: kinds as unknown as CalSettings['kinds'] })
    expect((calls[1]?.[1] as { kinds: { words: string[] }[] }).kinds.map((kind) => kind.words)).toEqual([['자보도수', '자보'], ['상담'], ['주사'], ['진료', '진찰']])
  })
})

// 모든 함수 같은 실패 규칙: 오프라인이면 보내지 않고 offline, 응답 없음(status 0)은 offline, 그 밖은 failed. 오류에는 종류만 있다
type Run = (client: Pick<SupabaseClient, 'from'>) => Promise<unknown>
const ALL: [string, Run][] = [
  ['listAppts', (c) => listAppts(c, DAY, DAY2)],
  ['listCalendarCounts', (c) => listCalendarCounts(c, DAY, DAY2)],
  ['listCalendarSlots', (c) => listCalendarSlots(c, DAY, DAY2)],
  ['addAppt', (c) => addAppt(c, DRAFT)],
  ['updateAppt', (c) => updateAppt(c, ID, { memo: '가' })],
  ['setApptAuto', (c) => setApptAuto(c, ID, 'came', { day: '2026-11-17', start: 570 })],
  ['deleteAppt', (c) => deleteAppt(c, ID)],
  ['listAllDay', (c) => listAllDay(c, DAY, DAY2)],
  ['addAllDay', (c) => addAllDay(c, { day: DAY, type: 'memo', memo: '가', staffId: null, staffName: null })],
  ['deleteAllDay', (c) => deleteAllDay(c, ID)],
  ['loadCalendarSettings', (c) => loadCalendarSettings(c)],
  ['saveCalendarSettings', (c) => saveCalendarSettings(c, SETTINGS)],
  ['loadCalendarRev', (c) => loadCalendarRev(c)],
  ['listWaitingAppts', (c) => listWaitingAppts(c, DAY)],
  ['findApptsByEvents', (c) => findApptsByEvents(c, [EVENT])],
  ['applyGoogleAppt', (c) => applyGoogleAppt(c, ID, { status: 'cancel' }, G_UPDATED, WAIT_AT)],
  ['markApptSent', (c) => markApptSent(c, ID, { gUpdated: G_UPDATED }, WAIT_AT)],
  ['insertGoogleAppts', (c) => insertGoogleAppts(c, [{ ...DRAFT, ...G_PART }])],
  ['listWaitingMemos', (c) => listWaitingMemos(c, DAY)],
  ['markMemoSent', (c) => markMemoSent(c, ID, WAIT_AT)],
  ['applyGoogleMemo', (c) => applyGoogleMemo(c, ID, { memo: '가' }, G_UPDATED, null)],
]

describe.each(ALL)('%s 실패', (_name, run) => {
  it('AC-5901.6: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    expect((await caught(() => run(client))).kind).toBe('offline')
    sentNothing(calls)
  })

  it('AC-5901.6: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const error = await caught(() => run(fakeClient(failure(0)).client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 404, 406, 409, 500])('AC-5901.6: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const error = await caught(() => run(fakeClient(failure(status)).client))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-5901.6: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => run(throwingClient))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-5901.6: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    // 읽기는 라이브러리가 끊긴 연결을 몇 번 더 해 본다. 기다리지 않게 시계만 가짜로 돌린다
    vi.useFakeTimers()
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const pending = caught(() => run(realClient(fakeFetch)))
    await vi.runAllTimersAsync()
    const error = await pending
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it('AC-5901.6: 진짜 클라이언트에서 DB 제약이 거부하면 failed이고 원문이 없다', async () => {
    const body = JSON.stringify({ message: SECRET, details: SECRET, hint: SECRET, code: '23514' })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 400 }))
    const error = await caught(() => run(realClient(fakeFetch)))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})

describe('CalendarStorageError', () => {
  it('AC-5901.6: 종류(offline·failed)만 담는다', () => {
    const error = new CalendarStorageError('offline')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('CalendarStorageError')
    expect(error.kind).toBe('offline')
    expect(new CalendarStorageError('failed').kind).toBe('failed')
  })
})
