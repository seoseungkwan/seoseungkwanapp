import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { privacyProblem } from '@/lib/worklog/notes'
import {
  DEFAULT_GCAL_LOOK,
  DEFAULT_GCAL_RULES,
  G_COLOR_ID,
  G_COLORS,
  type GcalFix,
  type GcalLink,
  type GcalLook,
  type GcalRules,
} from '@/types/gcal'
import {
  advancePulled,
  checkGcalLook,
  checkGcalRules,
  deleteGcalFix,
  dropGcalDelete,
  GcalStorageError,
  listGcalDeletes,
  listGcalFixes,
  listOffDays,
  listWaitingOffDays,
  loadGcalLink,
  loadGcalState,
  loadGcalView,
  loadOffNames,
  markGcalFail,
  markGcalOk,
  saveGcalCalendar,
  saveGcalConnection,
  saveGcalLook,
  saveGcalRules,
  saveOffDay,
  setArrivalProgress,
  setFixState,
  setGcalOffColor,
  setLinkedOn,
  skipGcalFixes,
  unlinkGcal,
  upsertGcalFixes,
  type GcalClient,
} from './gcal'

// 구글 캘린더 연결 저장 함수 (spec google-link REQ-8505 AC-8505.1·AC-8505.3, design.md 7-3·10-2·10-3). 실제 Supabase에 붙지 않는다.
// 주소·비밀 글자·이름·전화·메일·id는 모두 지어낸 것이다

const URL = 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKE1234567890/exec'
const WORK_URL = 'https://script.google.com/a/macros/fake-clinic.test/s/AKfycbFAKEfake0987654321/exec'
const KEY = 'FAKEkeyFAKEkeyFAKEkeyFAKEkey_-0123456789' // 지어낸 비밀 글자(40자)
const KEY2 = 'ANOTHERfakeANOTHERfakeANOTHERfake_9876543'
const SECRET = 'secret detail'
const DAY = '2026-11-26'
const DAY2 = '2026-12-02'
const STAMP = '2026-11-26T05:31:00.000Z'
const DB_STAMP = '2026-11-26 14:31:00.123456+09' // PostgREST가 주는 마이크로초 글자 — 그대로 돌려준다(design.md 12-1)
const FIX_ID = '00000000-0000-4000-8000-000000000501'
const EVENT = 'fakeevent0001abcdef'
const EVENT2 = 'ssk0123456789abcdef0123456789abcdef'
const ASC = { ascending: true }
const ON_HOSPITAL = { onConflict: 'hospital_id' }

// 읽는 칸·보내는 칸(design.md 7-3 표 그대로). hospital_id·updated_at·created_at은 어디에도 없다
const LINK_COLUMNS = 'script_url,secret,calendar_id,calendar_name,default_hex,linked_on,rules,look'
const STATE_COLUMNS = 'pulled_until,last_ok_at,fail_since,fail_code,arrival_until,arrival_done'
const FIX_COLUMNS = 'id,g_event_id,day,start_min,len_min,all_day,g_color,g_title,reason,guess,state,g_updated'
const DELETE_COLUMNS = 'g_event_id,day,kind,label'
const OFF_COLUMNS = 'day,g_event_id,g_title,g_updated,wait,wait_at'
const NEVER = ['hospital_id', 'updated_at', 'created_at']

const LOOK: GcalLook = {
  cancel: 'tomato',
  change: 'graphite',
  offWord: '휴무',
  offColor: 'peacock',
  noKind: 'fix',
  staffByColor: false,
  noStaffKinds: ['shock', 'inj'],
  titleLen: false,
  titleMemo: true,
}
const RULES: GcalRules = { pullMin: 5, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: false }
const LINK_ROW = {
  script_url: URL,
  secret: KEY,
  calendar_id: 'fake-calendar-0001',
  calendar_name: '양지바른 예약',
  default_hex: '#039BE5',
  linked_on: '2026-11-23',
  rules: RULES,
  look: LOOK,
}
const LINK: GcalLink = {
  scriptUrl: URL,
  secret: KEY,
  calendarId: 'fake-calendar-0001',
  calendarName: '양지바른 예약',
  defaultHex: '#039BE5',
  linkedOn: '2026-11-23',
  rules: RULES,
  look: LOOK,
}

const STATE_ROW = {
  pulled_until: DB_STAMP,
  last_ok_at: DB_STAMP,
  fail_since: null,
  fail_code: null,
  arrival_until: '2026-11-19',
  arrival_done: false,
}
const EMPTY_STATE = { pulledUntil: null, lastOkAt: null, failSince: null, failCode: null, arrivalUntil: null, arrivalDone: false }

const GUESS = { chart: '6402', name: '윤모의', kindId: 'shock', kindHow: 'title', staffId: null, staffHow: null, memo: '4000타', word: null } as const
const FIX_ROW = {
  id: FIX_ID,
  g_event_id: EVENT,
  day: DAY,
  start_min: 960,
  len_min: 15,
  all_day: false,
  g_color: '2',
  g_title: '6402 윤모의 (4000타)',
  reason: 'no-staff',
  guess: GUESS,
  state: 'open',
  g_updated: STAMP,
}
const FIX: GcalFix = {
  id: FIX_ID,
  gEventId: EVENT,
  day: DAY,
  start: 960,
  len: 15,
  allDay: false,
  gColor: 'sage',
  gTitle: '6402 윤모의 (4000타)',
  reason: 'no-staff',
  guess: { ...GUESS },
  state: 'open',
  gUpdated: STAMP,
}
const FIX_INPUT = Object.fromEntries(Object.entries(FIX).filter(([key]) => key !== 'id')) as Omit<GcalFix, 'id'>
const FIX_BODY = {
  g_event_id: EVENT,
  day: DAY,
  start_min: 960,
  len_min: 15,
  all_day: false,
  g_color: '2',
  g_title: '6402 윤모의 (4000타)',
  reason: 'no-staff',
  guess: GUESS,
  state: 'open',
  g_updated: STAMP,
}

const OFF_ROW = { day: DAY, g_event_id: EVENT2, g_title: '박지원 김예시 off', g_updated: STAMP, wait: true, wait_at: DB_STAMP }
const OFF_DAY = { day: DAY, gEventId: EVENT2, gTitle: '박지원 김예시 off', gUpdated: STAMP, wait: true, waitAt: DB_STAMP }

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })
// postgrest-js가 돌려주는 실패 응답과 같은 모양(원문에 비밀 글자까지 섞어 둔다)
const failure = (status: number): Reply => ({ data: null, error: { message: `${SECRET} ${KEY}`, details: SECRET, hint: SECRET, code: SECRET }, status })

type Call = [string, ...unknown[]]
const METHODS = ['select', 'eq', 'is', 'gte', 'lte', 'in', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

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
    rpc(name: string, ...args: unknown[]) {
      calls.push(['rpc', name, ...args])
      return builder
    },
  } as unknown as GcalClient
  return { client, calls }
}

const throwingClient = {
  from() {
    throw new Error(`${SECRET} ${KEY}`)
  },
  rpc() {
    throw new Error(`${SECRET} ${KEY}`)
  },
} as unknown as GcalClient

// 진짜 postgrest-js에 가짜 fetch만 넣는다. 가짜 클라이언트가 실제 요청 모양과 어긋나지 않는지 본다
function realClient(fakeFetch: typeof fetch) {
  return createClient('http://localhost:54321', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  }) as SupabaseClient
}

function fetchReturning(body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(body === null ? null : JSON.stringify(body), { status: body === null ? 201 : 200 }))
}

async function caught(run: () => Promise<unknown>): Promise<GcalStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(GcalStorageError)
  return thrown as GcalStorageError
}

function expectNoSecret(error: GcalStorageError) {
  for (const text of [error.message, String(error), error.stack ?? '', JSON.stringify(error)]) {
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain(KEY)
  }
  expect(error.cause).toBeUndefined()
}

const named = (calls: Call[], name: string) => calls.filter((call) => call[0] === name)
const bodyOf = (calls: Call[], name: 'update' | 'upsert', index = 0) => named(calls, name)[index]?.[1]
const sentNothing = (calls: Call[]) => expect(calls).toEqual([])
const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── 모양 ───────────────────────────────────────────────────

describe('AC-8505.1 구글 연결 모양(types/gcal)', () => {
  it('AC-8505.1: 11색 이름은 구글 colorId 1~11 차례이고 기본값은 design.md 10-2 그대로다', () => {
    expect(G_COLORS).toEqual(['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'])
    expect(G_COLORS.map((color) => G_COLOR_ID[color])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
    expect(DEFAULT_GCAL_LOOK).toEqual({
      cancel: 'tomato',
      change: 'graphite',
      offWord: 'off',
      offColor: 'grape',
      noKind: 'dosu',
      staffByColor: true,
      noStaffKinds: ['shock'],
      titleLen: true,
      titleMemo: true,
    })
    expect(DEFAULT_GCAL_RULES).toEqual({ pullMin: 2, onGoogleDelete: 'cancel', arrival: 'off', offAllStaff: true })
  })

  it('AC-8505.1: checkGcalLook·checkGcalRules는 맞는 값이면 정해 둔 칸만 새로 만들고, 틀리면 null이다', () => {
    expect(checkGcalLook({ ...LOOK, extra: 'x' })).toEqual(LOOK)
    expect(checkGcalLook({ ...LOOK, offWord: '  휴무 ' })).toEqual(LOOK)
    expect(checkGcalRules({ ...RULES, extra: 1 })).toEqual(RULES)
    const copied = checkGcalLook(LOOK)
    expect(copied?.noStaffKinds).not.toBe(LOOK.noStaffKinds)
    for (const bad of [
      null,
      [],
      { ...LOOK, cancel: 'red' },
      { ...LOOK, change: undefined },
      { ...LOOK, offColor: 'default' },
      { ...LOOK, offWord: '' },
      { ...LOOK, offWord: '가'.repeat(11) },
      { ...LOOK, noKind: '' },
      { ...LOOK, noKind: 'k'.repeat(41) },
      { ...LOOK, staffByColor: 'yes' },
      { ...LOOK, noStaffKinds: 'shock' },
      { ...LOOK, noStaffKinds: [''] },
      { ...LOOK, noStaffKinds: many(31, (i) => `k${i}`) },
      { ...LOOK, titleLen: 1 },
      { ...LOOK, titleMemo: null },
    ]) {
      expect(checkGcalLook(bad), JSON.stringify(bad)).toBeNull()
    }
    for (const bad of [null, { ...RULES, pullMin: 3 }, { ...RULES, onGoogleDelete: 'keep' }, { ...RULES, arrival: 'on' }, { ...RULES, offAllStaff: 'no' }]) {
      expect(checkGcalRules(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

// ── 연결 (gcal_links) ───────────────────────────────────────

describe('AC-8505.1 연결 읽기 loadGcalLink·loadGcalView', () => {
  it('AC-8505.1: loadGcalLink는 정해 둔 칸만 읽어 비밀 글자까지 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(LINK_ROW))
    await expect(loadGcalLink(client)).resolves.toEqual(LINK)
    expect(calls).toEqual([['from', 'gcal_links'], ['select', LINK_COLUMNS], ['maybeSingle']])
    for (const key of NEVER) expect(LINK_COLUMNS.split(',')).not.toContain(key)
  })

  it('AC-8505.1: 회사(Workspace) 계정 주소도 받는다', async () => {
    const { client } = fakeClient(okWith({ ...LINK_ROW, script_url: WORK_URL }))
    expect((await loadGcalLink(client))?.scriptUrl).toBe(WORK_URL)
  })

  it.each([
    ['줄 없음', null],
    ['주소 없음', { ...LINK_ROW, script_url: null }],
    ['http 주소', { ...LINK_ROW, script_url: URL.replace('https', 'http') }],
    ['다른 곳 주소', { ...LINK_ROW, script_url: 'https://script.google.com.fake.test/macros/s/AKfycbFAKEfakeFAKE1234567890/exec' }],
    ['/exec로 안 끝남', { ...LINK_ROW, script_url: URL.replace('/exec', '/dev') }],
    ['비밀 글자 없음', { ...LINK_ROW, secret: null }],
    ['비밀 글자 짧음', { ...LINK_ROW, secret: 'short' }],
    ['비밀 글자 모양 틀림', { ...LINK_ROW, secret: `${KEY}!` }],
  ])('AC-8505.1: %s이면 쓸 수 있는 연결이 없어 null이다', async (_name, row) => {
    const { client } = fakeClient(okWith(row))
    await expect(loadGcalLink(client)).resolves.toBeNull()
  })

  it('AC-8505.1: 틀린 칸은 기본값이다(캘린더 기본 색 #4285F4, 맞춤 방법·제목 꼴은 칸마다 기본값, 모르는 열쇠는 버림)', async () => {
    const row = {
      ...LINK_ROW,
      calendar_id: '',
      calendar_name: 7,
      default_hex: 'blue',
      linked_on: '2026-02-30',
      rules: { pullMin: 7, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: 'x', extra: KEY2 },
      look: { ...LOOK, cancel: 'red', noStaffKinds: 'shock', extra: KEY2 },
    }
    const { client } = fakeClient(okWith(row))
    const link = await loadGcalLink(client)
    expect(link).toEqual({
      ...LINK,
      calendarId: null,
      calendarName: null,
      defaultHex: '#4285F4',
      linkedOn: null,
      rules: { pullMin: 2, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: true },
      look: { ...LOOK, cancel: 'tomato', noStaffKinds: ['shock'] },
    })
    expect(JSON.stringify(link)).not.toContain(KEY2)
    const { client: empty } = fakeClient(okWith({ script_url: URL, secret: KEY }))
    expect(await loadGcalLink(empty)).toEqual({
      scriptUrl: URL,
      secret: KEY,
      calendarId: null,
      calendarName: null,
      defaultHex: '#4285F4',
      linkedOn: null,
      rules: DEFAULT_GCAL_RULES,
      look: DEFAULT_GCAL_LOOK,
    })
  })

  it('AC-8505.1: 기본값은 받을 때마다 새 값이다(고쳐도 다음 답·상수가 바뀌지 않는다)', async () => {
    const { client } = fakeClient(okWith({ script_url: URL, secret: KEY }))
    const first = await loadGcalLink(client)
    first?.look.noStaffKinds.push('dosu')
    const second = await loadGcalLink(client)
    expect(second?.look.noStaffKinds).toEqual(['shock'])
    expect(DEFAULT_GCAL_LOOK.noStaffKinds).toEqual(['shock'])
  })

  it('AC-8505.1: loadGcalView는 비밀 글자 없이 있는지만 알려 준다', async () => {
    const { client, calls } = fakeClient(okWith(LINK_ROW))
    const view = await loadGcalView(client)
    const rest = Object.fromEntries(Object.entries(LINK).filter(([key]) => key !== 'secret'))
    expect(view).toEqual({ ...rest, hasSecret: true })
    expect(JSON.stringify(view)).not.toContain(KEY)
    expect(Object.keys(view ?? {})).not.toContain('secret')
    expect(calls).toEqual([['from', 'gcal_links'], ['select', LINK_COLUMNS], ['maybeSingle']])
  })

  it('AC-8505.1: loadGcalView — 비밀 글자·주소가 없거나 틀리면 hasSecret 거짓·주소 빈 글, 줄이 없으면 null', async () => {
    const { client } = fakeClient(okWith({ ...LINK_ROW, secret: null, script_url: 'https://fake.test/x' }))
    expect(await loadGcalView(client)).toMatchObject({ scriptUrl: '', hasSecret: false, calendarId: 'fake-calendar-0001' })
    const { client: bad } = fakeClient(okWith({ ...LINK_ROW, secret: 'short' }))
    const view = await loadGcalView(bad)
    expect(view?.hasSecret).toBe(false)
    expect(JSON.stringify(view)).not.toContain('short')
    const { client: none } = fakeClient(okWith(null))
    await expect(loadGcalView(none)).resolves.toBeNull()
  })
})

describe('AC-8505.1 연결 쓰기 saveGcalConnection·saveGcalCalendar·saveGcalLook·saveGcalRules·setLinkedOn·unlinkGcal', () => {
  it.each([URL, WORK_URL])('AC-8505.1: saveGcalConnection은 주소(%s)·비밀 글자 두 칸만 내 병원 줄에 덮어쓴다', async (scriptUrl) => {
    const { client, calls } = fakeClient()
    await expect(saveGcalConnection(client, { scriptUrl, secret: KEY })).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'gcal_links'],
      ['upsert', { script_url: scriptUrl, secret: KEY }, ON_HOSPITAL],
    ])
  })

  it('AC-8505.1: 진짜 클라이언트로도 POST gcal_links?on_conflict=hospital_id에 두 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(null)
    await saveGcalConnection(realClient(fakeFetch), { scriptUrl: URL, secret: KEY })
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    const url = new globalThis.URL(String(input))
    expect(url.pathname).toBe('/rest/v1/gcal_links')
    expect(url.searchParams.get('on_conflict')).toBe('hospital_id')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Prefer')).toContain('resolution=merge-duplicates')
    expect(JSON.parse(String(init?.body))).toEqual({ script_url: URL, secret: KEY })
  })

  it.each([
    ['http 주소', { scriptUrl: URL.replace('https', 'http'), secret: KEY }],
    ['다른 곳 주소', { scriptUrl: 'https://fake.test/macros/s/AKfycbFAKEfakeFAKE1234567890/exec', secret: KEY }],
    ['쿼리 붙은 주소', { scriptUrl: `${URL}?x=1`, secret: KEY }],
    ['/dev 주소', { scriptUrl: URL.replace('/exec', '/dev'), secret: KEY }],
    ['빈 주소', { scriptUrl: '', secret: KEY }],
    ['짧은 비밀 글자', { scriptUrl: URL, secret: 'a'.repeat(31) }],
    ['긴 비밀 글자', { scriptUrl: URL, secret: 'a'.repeat(129) }],
    ['비밀 글자에 다른 글자', { scriptUrl: URL, secret: `${KEY}+/=` }],
    ['비밀 글자 아님', { scriptUrl: URL, secret: 12 }],
  ])('AC-8505.1: saveGcalConnection — %s이면 보내지 않고 invalid다', async (_name, input) => {
    const { client, calls } = fakeClient()
    await expect(saveGcalConnection(client, input as { scriptUrl: string; secret: string })).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-8505.1: saveGcalCalendar는 캘린더 id·이름·기본 색 세 칸만 보낸다(이름은 100자까지 자름)', async () => {
    const { client, calls } = fakeClient()
    await expect(saveGcalCalendar(client, { calendarId: 'fake-calendar-0001', calendarName: '가'.repeat(120), defaultHex: '#039be5' })).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'gcal_links'],
      ['upsert', { calendar_id: 'fake-calendar-0001', calendar_name: '가'.repeat(100), default_hex: '#039be5' }, ON_HOSPITAL],
    ])
  })

  it.each([
    ['빈 캘린더 id', { calendarId: '', calendarName: '예약', defaultHex: '#039BE5' }],
    ['긴 캘린더 id', { calendarId: 'c'.repeat(301), calendarName: '예약', defaultHex: '#039BE5' }],
    ['색 모양 틀림', { calendarId: 'fake-calendar-0001', calendarName: '예약', defaultHex: '039BE5' }],
    ['이름 아님', { calendarId: 'fake-calendar-0001', calendarName: null, defaultHex: '#039BE5' }],
  ])('AC-8505.1: saveGcalCalendar — %s이면 보내지 않고 invalid다', async (_name, input) => {
    const { client, calls } = fakeClient()
    await expect(saveGcalCalendar(client, input as never)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-8505.1: saveGcalLook·saveGcalRules는 그 칸 하나만 정해 둔 열쇠로 새로 만들어 보낸다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveGcalLook(client, { ...LOOK, secret: KEY } as GcalLook)).resolves.toBeUndefined()
    await expect(saveGcalRules(client, { ...RULES, scriptUrl: URL } as GcalRules)).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'gcal_links'],
      ['upsert', { look: LOOK }, ON_HOSPITAL],
      ['from', 'gcal_links'],
      ['upsert', { rules: RULES }, ON_HOSPITAL],
    ])
    expect(JSON.stringify(calls)).not.toContain(KEY)
  })

  it('AC-8505.1: 틀린 제목 꼴·맞춤 방법은 보내지 않고 invalid다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveGcalLook(client, { ...LOOK, cancel: 'red' } as unknown as GcalLook)).resolves.toBe('invalid')
    await expect(saveGcalRules(client, { ...RULES, pullMin: 10 } as unknown as GcalRules)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-8505.1: setLinkedOn은 이은 날 한 칸, unlinkGcal은 캘린더 id·이은 날만 비운다(AC-8531.3)', async () => {
    const { client, calls } = fakeClient()
    await setLinkedOn(client, '2026-11-23')
    await unlinkGcal(client)
    expect(calls).toEqual([
      ['from', 'gcal_links'],
      ['upsert', { linked_on: '2026-11-23' }, ON_HOSPITAL],
      ['from', 'gcal_links'],
      ['upsert', { calendar_id: null, linked_on: null }, ON_HOSPITAL],
    ])
    const { client: other, calls: none } = fakeClient()
    expect((await caught(() => setLinkedOn(other, '2026-11-31'))).kind).toBe('failed')
    sentNothing(none)
  })
})

// ── 맞춤 상태 (gcal_state) ──────────────────────────────────

describe('AC-8505.1 맞춤 상태 gcal_state', () => {
  it('AC-8505.1: loadGcalState는 정해 둔 칸만 읽고 DB 시각 글자를 그대로 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(STATE_ROW))
    await expect(loadGcalState(client)).resolves.toEqual({
      pulledUntil: DB_STAMP,
      lastOkAt: DB_STAMP,
      failSince: null,
      failCode: null,
      arrivalUntil: '2026-11-19',
      arrivalDone: false,
    })
    expect(calls).toEqual([['from', 'gcal_state'], ['select', STATE_COLUMNS], ['maybeSingle']])
  })

  it('AC-8505.1: 줄이 없거나 칸이 틀리면 빈 상태다', async () => {
    const { client } = fakeClient(okWith(null))
    await expect(loadGcalState(client)).resolves.toEqual(EMPTY_STATE)
    const { client: bad } = fakeClient(
      okWith({ pulled_until: 'yesterday', last_ok_at: 3, fail_since: '', fail_code: 'oops', arrival_until: '2026-13-01', arrival_done: 'yes' }),
    )
    await expect(loadGcalState(bad)).resolves.toEqual(EMPTY_STATE)
    const { client: failing } = fakeClient(okWith({ ...STATE_ROW, fail_since: DB_STAMP, fail_code: 'E-GCAL-REACH' }))
    expect(await loadGcalState(failing)).toMatchObject({ failSince: DB_STAMP, failCode: 'E-GCAL-REACH' })
  })

  it('AC-8505.1: advancePulled·markGcalOk·setArrivalProgress는 그 칸만 보낸다(뒤로 가지 않게는 DB 트리거가 막는다)', async () => {
    const { client, calls } = fakeClient()
    await advancePulled(client, STAMP)
    await markGcalOk(client, STAMP)
    await setArrivalProgress(client, '2026-11-12', true)
    expect(calls).toEqual([
      ['from', 'gcal_state'],
      ['upsert', { pulled_until: STAMP }, ON_HOSPITAL],
      ['from', 'gcal_state'],
      ['upsert', { last_ok_at: STAMP, fail_since: null, fail_code: null }, ON_HOSPITAL],
      ['from', 'gcal_state'],
      ['upsert', { arrival_until: '2026-11-12', arrival_done: true }, ON_HOSPITAL],
    ])
  })

  it('AC-8505.1: markGcalFail은 번호를 적고, 실패 시작은 비어 있을 때만 적는다(처음 실패 때가 남게)', async () => {
    const { client, calls } = fakeClient()
    await markGcalFail(client, 'E-GCAL-REACH', STAMP)
    expect(calls).toEqual([
      ['from', 'gcal_state'],
      ['upsert', { fail_code: 'E-GCAL-REACH' }, ON_HOSPITAL],
      ['from', 'gcal_state'],
      ['update', { fail_since: STAMP }],
      ['is', 'fail_since', null],
    ])
  })

  it('AC-8505.1: markGcalFail의 시각은 없으면 지금이다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(STAMP))
    const { client, calls } = fakeClient()
    await markGcalFail(client, 'E-GCAL-LIMIT')
    expect(bodyOf(calls, 'update')).toEqual({ fail_since: STAMP })
  })

  it.each([
    ['advancePulled 시각 틀림', (c: GcalClient) => advancePulled(c, 'soon')],
    ['markGcalOk 시각 틀림', (c: GcalClient) => markGcalOk(c, '')],
    ['markGcalFail 번호 틀림', (c: GcalClient) => markGcalFail(c, 'GCAL REACH', STAMP)],
    ['markGcalFail 시각 틀림', (c: GcalClient) => markGcalFail(c, 'E-GCAL-REACH', 'now')],
    ['setArrivalProgress 날짜 틀림', (c: GcalClient) => setArrivalProgress(c, '2026-11-31', false)],
    ['setArrivalProgress 참거짓 아님', (c: GcalClient) => setArrivalProgress(c, DAY, 'yes' as unknown as boolean)],
  ])('AC-8505.1: %s이면 보내지 않고 failed다', async (_name, run) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => run(client))).kind).toBe('failed')
    sentNothing(calls)
  })
})

// ── 고쳐야 할 것 (gcal_fixes) ───────────────────────────────

describe('AC-8505.1·AC-8505.3 고쳐야 할 구글 예약 gcal_fixes', () => {
  it('AC-8505.1: listGcalFixes는 정해 둔 칸만 날·시작 차례로 1,000줄씩 읽고 색 번호를 색 이름으로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith([FIX_ROW, { ...FIX_ROW, id: 'fix-2', g_color: null, state: 'skip' }]))
    await expect(listGcalFixes(client)).resolves.toEqual([FIX, { ...FIX, id: 'fix-2', gColor: null, state: 'skip' }])
    expect(calls).toEqual([
      ['from', 'gcal_fixes'],
      ['select', FIX_COLUMNS],
      ['order', 'day', ASC],
      ['order', 'start_min', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-8505.1: 상태를 주면 그 상태만 묻고, 1,000줄이 꽉 차면 다음 쪽을 더 읽는다', async () => {
    const first = many(1000, (i) => ({ ...FIX_ROW, id: `fix-${i}` }))
    const { client, calls } = fakeClient(okWith(first), okWith([FIX_ROW]))
    expect(await listGcalFixes(client, 'open')).toHaveLength(1001)
    expect(named(calls, 'eq')).toEqual([
      ['eq', 'state', 'open'],
      ['eq', 'state', 'open'],
    ])
    expect(named(calls, 'range')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ])
  })

  it('AC-8505.1: 모양이 틀린 줄은 빼고, guess의 틀린 칸은 null이다', async () => {
    const bad = [
      null,
      { ...FIX_ROW, id: '' },
      { ...FIX_ROW, g_event_id: 'bad id!' },
      { ...FIX_ROW, day: '2026-02-30' },
      { ...FIX_ROW, start_min: 1440 },
      { ...FIX_ROW, len_min: 0 },
      { ...FIX_ROW, all_day: 'no' },
      { ...FIX_ROW, g_color: '12' },
      { ...FIX_ROW, g_title: null },
      { ...FIX_ROW, reason: 'unknown' },
      { ...FIX_ROW, state: 'done' },
      { ...FIX_ROW, g_updated: 'later' },
    ]
    const odd = { ...FIX_ROW, id: 'fix-odd', guess: { chart: 'abc', name: 7, kindId: 'shock', kindHow: 'magic', staffId: 'st-ho', staffHow: 'color', memo: null, extra: KEY } }
    const { client } = fakeClient(okWith([...bad, odd, FIX_ROW]))
    const fixes = await listGcalFixes(client)
    expect(fixes).toEqual([
      { ...FIX, id: 'fix-odd', guess: { chart: null, name: null, kindId: 'shock', kindHow: null, staffId: 'st-ho', staffHow: 'color', memo: null, word: null } },
      FIX,
    ])
    expect(JSON.stringify(fixes)).not.toContain(KEY)
    const { client: notList } = fakeClient(okWith({ rows: [] }))
    expect((await caught(() => listGcalFixes(notList))).kind).toBe('failed')
  })

  it('AC-8505.1: upsertGcalFixes는 정해 둔 칸만 (병원·일정 id·날) 겹침으로 넣는다 — id·hospital_id는 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await upsertGcalFixes(client, [{ ...FIX_INPUT, hospitalId: 'h', id: 'x' } as unknown as Omit<GcalFix, 'id'>])
    expect(calls).toEqual([
      ['from', 'gcal_fixes'],
      ['upsert', [FIX_BODY], { onConflict: 'hospital_id,g_event_id,day' }],
    ])
  })

  it('AC-8505.3: 구글 제목·알아본 글의 전화·주민번호·메일 조각은 …로 바꿔 보내고 원래 글은 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await upsertGcalFixes(client, [
      {
        ...FIX_INPUT,
        gTitle: '6402 윤모의 010-0000-1234 (4000타)',
        guess: { ...GUESS, chart: '0100001234', name: '윤모의 a@b.co', memo: '연락 900101-1234567', word: '02-000-1234' },
      },
    ])
    const body = (bodyOf(calls, 'upsert') as Record<string, unknown>[])[0]
    expect(body?.g_title).toBe('6402 윤모의 … (4000타)')
    expect(body?.guess).toEqual({ ...GUESS, chart: null, name: '윤모의 …', memo: '연락 …', word: '…' })
    const sent = JSON.stringify(calls)
    for (const piece of ['0000-1234', 'a@b.co', '1234567', '000-1234', '0100001234']) expect(sent).not.toContain(piece)
    expect(privacyProblem(sent)).toBe(false)
  })

  it('AC-8505.3: 긴 구글 제목은 가린 뒤 200자, 알아본 이름·메모·고를 거리는 20·100·40자까지 자른다', async () => {
    const { client, calls } = fakeClient()
    await upsertGcalFixes(client, [
      { ...FIX_INPUT, gTitle: `${'가'.repeat(198)} a@b.co ${'나'.repeat(50)}`, guess: { ...GUESS, name: '이'.repeat(30), memo: '메'.repeat(150), word: '글'.repeat(50) } },
    ])
    const body = (bodyOf(calls, 'upsert') as Record<string, unknown>[])[0]
    expect(body?.g_title).toBe(`${'가'.repeat(198)} …`)
    expect(body?.guess).toEqual({ ...GUESS, name: '이'.repeat(20), memo: '메'.repeat(100), word: '글'.repeat(40) })
  })

  it('AC-8505.1: 500줄씩 나눠 보내고, 빈 목록은 부르지 않는다', async () => {
    const { client, calls } = fakeClient()
    await upsertGcalFixes(client, many(1001, (i) => ({ ...FIX_INPUT, gEventId: `fakeevent${String(i).padStart(5, '0')}` })))
    expect(named(calls, 'upsert').map((call) => (call[1] as unknown[]).length)).toEqual([500, 500, 1])
    const { client: other, calls: none } = fakeClient()
    await upsertGcalFixes(other, [])
    sentNothing(none)
  })

  it.each([
    ['일정 id 틀림', { gEventId: 'a b' }],
    ['날 틀림', { day: '2026-11-31' }],
    ['시작 틀림', { start: 1436 }],
    ['길이 틀림', { len: 1441 }],
    ['하루 종일 아님', { allDay: 1 }],
    ['색 틀림', { gColor: 'red' }],
    ['제목 아님', { gTitle: null }],
    ['까닭 틀림', { reason: 'no-name' }],
    ['상태 틀림', { state: 'closed' }],
    ['구글 시각 틀림', { gUpdated: 'today' }],
    ['guess 아님', { guess: 'x' }],
  ])('AC-8505.1: upsertGcalFixes — %s인 줄이 하나라도 있으면 하나도 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => upsertGcalFixes(client, [FIX_INPUT, { ...FIX_INPUT, ...patch } as never]))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8505.1: setFixState는 상태 한 칸, deleteGcalFix는 그 id 줄만 지운다(빈 id·틀린 상태는 보내지 않는다)', async () => {
    const { client, calls } = fakeClient()
    await setFixState(client, FIX_ID, 'skip')
    await deleteGcalFix(client, FIX_ID)
    expect(calls).toEqual([
      ['from', 'gcal_fixes'],
      ['update', { state: 'skip' }],
      ['eq', 'id', FIX_ID],
      ['from', 'gcal_fixes'],
      ['delete'],
      ['eq', 'id', FIX_ID],
    ])
    const { client: other, calls: none } = fakeClient()
    expect((await caught(() => setFixState(other, '', 'open'))).kind).toBe('failed')
    expect((await caught(() => setFixState(other, FIX_ID, 'done' as never))).kind).toBe('failed')
    expect((await caught(() => deleteGcalFix(other, ''))).kind).toBe('failed')
    sentNothing(none)
  })
})

// ── 한꺼번에 가져오지 않기 (spec google-link AC-8551.2·AC-8551.3, design.md 21-8) ──

describe('AC-8551.2·AC-8551.3 고쳐야 할 것 한꺼번에 가져오지 않기 skipGcalFixes', () => {
  const idOf = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

  it('AC-8551.2: 100개씩 update({ state: skip }).in(id, 묶음).eq(state, open)으로 나눠 보낸다', async () => {
    const ids = many(250, idOf)
    const { client, calls } = fakeClient()
    await skipGcalFixes(client, ids)
    const sent = (chunk: string[]) => [['from', 'gcal_fixes'], ['update', { state: 'skip' }], ['in', 'id', chunk], ['eq', 'state', 'open']]
    expect(calls).toEqual([...sent(ids.slice(0, 100)), ...sent(ids.slice(100, 200)), ...sent(ids.slice(200, 250))])
  })

  it('AC-8551.2: 100개 이하면 한 번, 빈 목록은 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await skipGcalFixes(client, [FIX_ID])
    expect(calls).toEqual([['from', 'gcal_fixes'], ['update', { state: 'skip' }], ['in', 'id', [FIX_ID]], ['eq', 'state', 'open']])
    const { client: other, calls: none } = fakeClient()
    await skipGcalFixes(other, [])
    sentNothing(none)
  })

  it.each<[string, unknown]>([
    ['빈 id', [FIX_ID, '']],
    ['null', [FIX_ID, null]],
    ['숫자', [FIX_ID, 501]],
    ['뒤쪽 묶음에 빈 id', [...many(150, idOf), '']],
    ['목록 아님', FIX_ID],
  ])('AC-8551.3: id가 하나라도 틀리면(%s) 아무것도 보내지 않고 failed다', async (_name, ids) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => skipGcalFixes(client, ids as string[]))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8551.2: 진짜 클라이언트로도 PATCH /rest/v1/gcal_fixes?id=in.(…)&state=eq.open { state: skip }', async () => {
    const other = idOf(7)
    const fakeFetch = fetchReturning(null)
    await skipGcalFixes(realClient(fakeFetch), [FIX_ID, other])
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0]
    const url = new globalThis.URL(String(input)) // URL 이름은 이 파일의 지어낸 주소가 쓴다
    expect(url.pathname).toBe('/rest/v1/gcal_fixes')
    expect(url.searchParams.get('id')).toBe(`in.(${FIX_ID},${other})`)
    expect(url.searchParams.get('state')).toBe('eq.open')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ state: 'skip' })
  })
})

// ── 지움 줄 (gcal_deletes) ──────────────────────────────────

describe('AC-8505.1 구글에서 지울 것 gcal_deletes', () => {
  it('AC-8505.1: listGcalDeletes는 정해 둔 칸만 넣은 차례로 읽고, 틀린 줄은 뺀다', async () => {
    const rows = [
      { g_event_id: EVENT2, day: DAY, kind: 'appt', label: '1234 홍길동 도수 30분 (호)' },
      { g_event_id: EVENT, day: DAY2, kind: 'memo', label: null },
      { g_event_id: EVENT, day: DAY2, kind: 'task', label: null },
      { g_event_id: '', day: DAY2, kind: 'memo', label: null },
    ]
    const { client, calls } = fakeClient(okWith(rows))
    await expect(listGcalDeletes(client)).resolves.toEqual([
      { gEventId: EVENT2, day: DAY, kind: 'appt', label: '1234 홍길동 도수 30분 (호)' },
      { gEventId: EVENT, day: DAY2, kind: 'memo', label: null },
    ])
    expect(calls).toEqual([
      ['from', 'gcal_deletes'],
      ['select', DELETE_COLUMNS],
      ['order', 'created_at', ASC],
      ['order', 'g_event_id', ASC],
      ['order', 'day', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-8505.1: dropGcalDelete는 (일정 id, 날) 한 줄만 지우고 틀린 값은 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await dropGcalDelete(client, EVENT, DAY)
    expect(calls).toEqual([['from', 'gcal_deletes'], ['delete'], ['eq', 'g_event_id', EVENT], ['eq', 'day', DAY]])
    const { client: other, calls: none } = fakeClient()
    expect((await caught(() => dropGcalDelete(other, '', DAY))).kind).toBe('failed')
    expect((await caught(() => dropGcalDelete(other, EVENT, '2026-11-31'))).kind).toBe('failed')
    sentNothing(none)
  })
})

// ── off 날 (gcal_off_days) ─────────────────────────────────

describe('AC-8505.1·AC-8505.3 그날 구글 off 줄 gcal_off_days', () => {
  it('AC-8505.1: listOffDays는 정해 둔 칸만 기간 안 날 차례로 읽는다', async () => {
    const { client, calls } = fakeClient(okWith([OFF_ROW, { ...OFF_ROW, day: DAY2, g_event_id: null, g_title: null, g_updated: null, wait: false, wait_at: null }]))
    await expect(listOffDays(client, DAY, DAY2)).resolves.toEqual([OFF_DAY, { day: DAY2, gEventId: null, gTitle: null, gUpdated: null, wait: false, waitAt: null }])
    expect(calls).toEqual([
      ['from', 'gcal_off_days'],
      ['select', OFF_COLUMNS],
      ['gte', 'day', DAY],
      ['lte', 'day', DAY2],
      ['order', 'day', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-8505.1: listWaitingOffDays는 보낼 것(wait 참)만 기다린 차례로 읽고, 틀린 줄은 뺀다', async () => {
    const { client, calls } = fakeClient(okWith([OFF_ROW, { ...OFF_ROW, wait: 'yes' }, { ...OFF_ROW, day: 'x' }]))
    await expect(listWaitingOffDays(client)).resolves.toEqual([OFF_DAY])
    expect(calls).toEqual([
      ['from', 'gcal_off_days'],
      ['select', OFF_COLUMNS],
      ['eq', 'wait', true],
      ['order', 'wait_at', ASC],
      ['order', 'day', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-8505.1: 기간이 틀리면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listOffDays(client, DAY2, DAY))).kind).toBe('failed')
    expect((await caught(() => listOffDays(client, '2026-11-31', DAY2))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8505.1: saveOffDay는 기다리던 시각을 주지 않으면 (병원, 날) 겹침으로 다섯 칸만 넣는다(wait_at은 보내지 않는다)', async () => {
    const { client, calls } = fakeClient()
    await expect(saveOffDay(client, { day: DAY, gEventId: EVENT2, gTitle: '박지원 off', gUpdated: STAMP, wait: false })).resolves.toBe(true)
    expect(calls).toEqual([
      ['from', 'gcal_off_days'],
      ['upsert', { day: DAY, g_event_id: EVENT2, g_title: '박지원 off', g_updated: STAMP, wait: false }, { onConflict: 'hospital_id,day' }],
    ])
  })

  it('AC-8505.1: 기다리던 시각을 주면 그 시각 그대로인 줄만 고친다(그 사이 휴가가 바뀌었으면 0줄 → 거짓, 다음에 또 보냄)', async () => {
    const off = { day: DAY, gEventId: EVENT2, gTitle: '박지원 off', gUpdated: STAMP, wait: false }
    const { client, calls } = fakeClient(okWith([{ day: DAY }]), okWith([]))
    await expect(saveOffDay(client, off, DB_STAMP)).resolves.toBe(true)
    await expect(saveOffDay(client, off, DB_STAMP)).resolves.toBe(false)
    expect(calls.slice(0, 5)).toEqual([
      ['from', 'gcal_off_days'],
      ['update', { g_event_id: EVENT2, g_title: '박지원 off', g_updated: STAMP, wait: false }],
      ['eq', 'day', DAY],
      ['eq', 'wait_at', DB_STAMP],
      ['select', 'day'],
    ])
    const { client: none, calls: nullCalls } = fakeClient(okWith([{ day: DAY }]))
    await saveOffDay(none, off, null)
    expect(nullCalls).toContainEqual(['is', 'wait_at', null])
  })

  it('AC-8505.3: off 줄 제목의 개인정보 모양 조각은 …로 바꿔 보낸다', async () => {
    const { client, calls } = fakeClient()
    await saveOffDay(client, { day: DAY, gEventId: EVENT2, gTitle: '박지원 010-0000-1234 off', gUpdated: STAMP, wait: false })
    expect(bodyOf(calls, 'upsert')).toMatchObject({ g_title: '박지원 … off' })
    expect(JSON.stringify(calls)).not.toContain('0000-1234')
  })

  it.each([
    ['날 틀림', { day: '2026-11-31' }],
    ['일정 id 틀림', { gEventId: 'no way' }],
    ['제목 아님', { gTitle: 3 }],
    ['구글 시각 틀림', { gUpdated: 'x' }],
    ['wait 아님', { wait: null }],
  ])('AC-8505.1: saveOffDay — %s이면 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient()
    const off = { day: DAY, gEventId: EVENT2, gTitle: '박지원 off', gUpdated: STAMP, wait: false, ...patch }
    expect((await caught(() => saveOffDay(client, off as never))).kind).toBe('failed')
    sentNothing(calls)
  })
})

// ── off 이름 (calendar_off_names) ──────────────────────────

describe('AC-8505.1 off 줄 사람 목록 loadOffNames', () => {
  it("AC-8505.1: calendar_off_names()를 불러 {id, name} 목록을 주고 틀린 줄은 뺀다('m-' 직원 포함)", async () => {
    const people = [
      { id: 'st-won', name: '박지원' },
      { id: `m-${'a'.repeat(32)}`, name: '김예시' },
      { id: '', name: '빈' },
      { id: 'st-x', name: '' },
      { id: 'st-y', name: '이'.repeat(21) },
      'text',
    ]
    const { client, calls } = fakeClient(okWith(people))
    await expect(loadOffNames(client)).resolves.toEqual([
      { id: 'st-won', name: '박지원' },
      { id: `m-${'a'.repeat(32)}`, name: '김예시' },
    ])
    expect(calls).toEqual([['rpc', 'calendar_off_names']])
  })

  it('AC-8505.1: 답이 목록이 아니면 빈 목록으로 보이지 않고 failed다', async () => {
    const { client } = fakeClient(okWith({ people: [] }))
    expect((await caught(() => loadOffNames(client))).kind).toBe('failed')
  })
})

// ── 휴무 줄 색 따라가기 (google-link REQ-8547 AC-8547.4, design.md 21-5) ─────────

describe('AC-8547.4 휴무 줄 색 setGcalOffColor', () => {
  it.each([...G_COLORS])("AC-8547.4: 구글 11색 %s는 rpc('gcal_set_off_color', { p_color })로 보내고 답 true면 참이다", async (color) => {
    const { client, calls } = fakeClient(okWith(true))
    await expect(setGcalOffColor(client, color)).resolves.toBe(true)
    expect(calls).toEqual([['rpc', 'gcal_set_off_color', { p_color: color }]])
  })

  it.each<[string, unknown]>([
    ['false', false],
    ['null', null],
    ["글자 'true'", 'true'],
    ['목록', [true]],
  ])('AC-8547.4: 답이 %s면 거짓이다(바뀐 줄 없음 — 보는 중·연결 줄 없음)', async (_name, data) => {
    const { client } = fakeClient(okWith(data))
    await expect(setGcalOffColor(client, 'grape')).resolves.toBe(false)
  })

  it.each<[string, unknown]>([
    ['옛 색 이름', 'red'],
    ['대문자', 'Grape'],
    ['colorId 글', '3'],
    ['캘린더 기본 색', 'default'],
    ['빈 글자', ''],
    ['null', null],
    ['undefined', undefined],
    ['숫자', 3],
  ])('AC-8547.4: 11색 밖(%s)이면 보내지 않고 failed다', async (_name, color) => {
    const { client, calls } = fakeClient(okWith(true))
    expect((await caught(() => setGcalOffColor(client, color as GcalLook['offColor']))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-8547.4: 진짜 클라이언트로도 POST /rest/v1/rpc/gcal_set_off_color { p_color } 한 번', async () => {
    const fakeFetch = fetchReturning(true)
    await expect(setGcalOffColor(realClient(fakeFetch), 'peacock')).resolves.toBe(true)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0]
    expect(new globalThis.URL(String(input)).pathname).toBe('/rest/v1/rpc/gcal_set_off_color') // URL 이름은 이 파일의 지어낸 주소가 쓴다
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ p_color: 'peacock' })
  })
})

// ── 비밀 글자·실패 ──────────────────────────────────────────

type Run = (client: GcalClient) => Promise<unknown>
const ALL: [string, Run][] = [
  ['loadGcalLink', (c) => loadGcalLink(c)],
  ['loadGcalView', (c) => loadGcalView(c)],
  ['saveGcalConnection', (c) => saveGcalConnection(c, { scriptUrl: URL, secret: KEY })],
  ['saveGcalCalendar', (c) => saveGcalCalendar(c, { calendarId: 'fake-calendar-0001', calendarName: '예약', defaultHex: '#039BE5' })],
  ['saveGcalLook', (c) => saveGcalLook(c, LOOK)],
  ['saveGcalRules', (c) => saveGcalRules(c, RULES)],
  ['setLinkedOn', (c) => setLinkedOn(c, DAY)],
  ['unlinkGcal', (c) => unlinkGcal(c)],
  ['loadGcalState', (c) => loadGcalState(c)],
  ['advancePulled', (c) => advancePulled(c, STAMP)],
  ['markGcalFail', (c) => markGcalFail(c, 'E-GCAL-REACH', STAMP)],
  ['markGcalOk', (c) => markGcalOk(c, STAMP)],
  ['setArrivalProgress', (c) => setArrivalProgress(c, DAY, false)],
  ['listGcalFixes', (c) => listGcalFixes(c)],
  ['upsertGcalFixes', (c) => upsertGcalFixes(c, [FIX_INPUT])],
  ['setFixState', (c) => setFixState(c, FIX_ID, 'open')],
  ['deleteGcalFix', (c) => deleteGcalFix(c, FIX_ID)],
  ['skipGcalFixes', (c) => skipGcalFixes(c, [FIX_ID])], // google-link AC-8551.3
  ['listGcalDeletes', (c) => listGcalDeletes(c)],
  ['dropGcalDelete', (c) => dropGcalDelete(c, EVENT, DAY)],
  ['listOffDays', (c) => listOffDays(c, DAY, DAY2)],
  ['listWaitingOffDays', (c) => listWaitingOffDays(c)],
  ['saveOffDay', (c) => saveOffDay(c, { day: DAY, gEventId: EVENT2, gTitle: '박지원 off', gUpdated: STAMP, wait: false })],
  ['loadOffNames', (c) => loadOffNames(c)],
  ['setGcalOffColor', (c) => setGcalOffColor(c, 'grape')],
]

describe('AC-8505.1 비밀 글자는 loadGcalLink 답에만', () => {
  it.each(ALL.filter(([name]) => name !== 'loadGcalLink'))('AC-8505.1: %s의 답에는 비밀 글자가 없다(받은 줄에 섞여 와도)', async (_name, run) => {
    const withKey = { ...LINK_ROW, ...STATE_ROW, ...FIX_ROW, ...OFF_ROW, secret: KEY, label: null, kind: 'appt', name: '박지원' }
    // 한 줄 답과 목록 답을 한 번씩 준다(함수마다 하나는 모양이 맞아 값을 돌려준다)
    const results: unknown[] = []
    for (const data of [withKey, [withKey]]) {
      results.push(await run(fakeClient(okWith(data)).client).catch(() => 'failed'))
    }
    expect(results.some((result) => result !== 'failed')).toBe(true)
    expect(JSON.stringify(results)).not.toContain(KEY)
  })

  it('AC-8505.1: 비밀 글자 칸을 읽는 것은 연결 읽기 둘뿐이다', async () => {
    for (const [name, run] of ALL) {
      const { client, calls } = fakeClient(okWith(null), okWith([]))
      await run(client).catch(() => undefined)
      const selects = named(calls, 'select').map((call) => String(call[1]))
      const readsSecret = selects.some((columns) => columns.split(',').includes('secret'))
      expect(readsSecret, name).toBe(name === 'loadGcalLink' || name === 'loadGcalView')
    }
  })
})

describe.each(ALL)('%s 실패', (_name, run) => {
  it('AC-8505.1: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    expect((await caught(() => run(client))).kind).toBe('offline')
    sentNothing(calls)
  })

  it('AC-8505.1: 응답 status가 0이면 offline이고 오류에는 종류만 있다(Supabase 글·비밀 글자 없음)', async () => {
    const error = await caught(() => run(fakeClient(failure(0)).client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 404, 409, 500])('AC-8505.1: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const error = await caught(() => run(fakeClient(failure(status)).client))
    expect(error.kind).toBe('failed')
    expect(error.name).toBe('GcalStorageError')
    expectNoSecret(error)
  })

  it('AC-8505.1: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => run(throwingClient))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})
