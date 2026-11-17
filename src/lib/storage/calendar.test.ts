import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type ApptDraft, type CalAllDay, type CalAppt, type CalSettings } from '@/types/calendar'
import {
  addAllDay,
  addAppt,
  CalendarStorageError,
  checkCalendarSettings,
  deleteAllDay,
  deleteAppt,
  listAllDay,
  listAppts,
  listCalendarCounts,
  loadCalendarRev,
  loadCalendarSettings,
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

// 보내는 칸·읽는 칸(design.md 'DB'·'저장 함수'). 전화·성별·나이·생일·마지막 내원 칸은 어디에도 없다
const APPT_COLUMNS = 'id,day,start_min,len_min,name,chart,staff_id,staff_name,staff_mark,kind_id,kind_name,memo,status,auto,orig_day,orig_start'
const COUNT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,orig_day'
const ALLDAY_COLUMNS = 'id,day,type,memo,staff_id,staff_name'
const SETTINGS_COLUMNS = 'kinds,staff,open_hour,close_hour,sunday'
const APPT_INSERT_KEYS = ['day', 'start_min', 'len_min', 'name', 'chart', 'staff_id', 'staff_name', 'staff_mark', 'kind_id', 'kind_name', 'memo', 'status']
const ALLDAY_INSERT_KEYS = ['day', 'type', 'memo', 'staff_id', 'staff_name']
const SETTINGS_KEYS = ['kinds', 'staff', 'open_hour', 'close_hour', 'sunday']
// 비트 찾기 결과에 있어도 서버로 가면 안 되는 칸(과 DB가 정하는 칸)
const NEVER_SENT = ['phone', 'tel', 'sex', 'gender', 'age', 'birth', 'birthday', 'last', 'lastVisit', 'hospital_id', 'id', 'auto', 'orig_day', 'orig_start']
const NEVER_READ = ['phone', 'tel', 'sex', 'gender', 'age', 'birth', 'hospital_id']

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

const COUNT_ROW = { day: DAY, staff_id: 'st-ga', staff_name: '가', kind_id: 'dosu', kind_name: '도수', status: 'cancel', auto: null, orig_day: DAY2 }
const COUNTED = { day: DAY, staffId: 'st-ga', staffName: '가', kindId: 'dosu', kindName: '도수', status: 'cancel', auto: null, origDay: DAY2 }

const MEMO_ROW = { id: ID, day: DAY, type: 'memo', memo: '원장님 학회', staff_id: null, staff_name: null }
const MEMO_DAY: CalAllDay = { id: ID, day: DAY, type: 'memo', memo: '원장님 학회', staffId: null, staffName: null }
const OFF_ROW = { id: ID2, day: DAY, type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가' }
const OFF_DAY: CalAllDay = { id: ID2, day: DAY, type: 'off', memo: null, staffId: 'st-ga', staffName: '가' }

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null },
    { id: 'inj', name: '주사', len: 10, color: 'pink' },
  ],
  staff: [
    { id: 'st-ga', name: '가나다', mark: '가', color: 'blue' },
    { id: 'st-na', name: '나라', mark: '나', color: 'teal' },
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

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, message = SECRET): Reply {
  return { data: null, error: { message, details: SECRET, hint: SECRET, code: SECRET }, status }
}

type Call = [string, ...unknown[]]
const METHODS = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

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
    ['시작 10의 배수 아님', { start_min: 905 }],
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
  ])('AC-5901.6: 모양이 틀린 예약 줄(%s)은 뺀다', async (_name, patch) => {
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
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(['auto', 'day', 'kindId', 'kindName', 'origDay', 'staffId', 'staffName', 'status'])
  })

  it('AC-5901.6: 기간이 틀리면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listCalendarCounts(client, DAY2, DAY))).kind).toBe('failed')
    sentNothing(calls)
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
    const extra = { phone: PHONE, sex: '여', age: 61, birth: '19650312', last: '2026-11-10', hospital_id: 'x', id: ID, auto: 'came', origDay: DAY2 }
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
    ['시작 345', { start: 345 }],
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

  it('AC-5901.6: 경계값(시작 0·1430, 길이 5·240, 이름 20자, 차트 10자리, 메모 100자)은 보낸다', async () => {
    for (const patch of [
      { start: 0, len: 5 },
      { start: 1430, len: 240 },
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
    ['시작 345', ID, { start: 345 }],
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
    ['시작이 10분 단위가 아님', { day: '2026-11-17', start: 575 }],
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
    loaded.staff.push({ id: 'x', name: 'x', mark: 'x', color: 'blue' })
    expect(DEFAULT_CAL_SETTINGS.kinds[0]!.name).toBe('도수')
    expect(DEFAULT_CAL_SETTINGS.staff).toEqual([])
  })

  it('AC-5901.6: 기본값은 design.md DB 기본과 같다(종류 다섯·시행자 없음·8~20시·일요일 안 봄)', () => {
    expect(DEFAULT_CAL_SETTINGS).toEqual({
      kinds: [
        { id: 'dosu', name: '도수', len: 30, color: null },
        { id: 'jabo', name: '자보도수', len: 30, color: null },
        { id: 'shock', name: '충격파', len: 15, color: null },
        { id: 'inj', name: '주사', len: 10, color: 'pink' },
        { id: 'visit', name: '진료', len: 10, color: 'lime' },
      ],
      staff: [],
      openHour: 8,
      closeHour: 20,
      sunday: false,
    })
  })

  it.each<[string, Record<string, unknown>, Partial<CalSettings>]>([
    ['종류 빈 목록', { kinds: [] }, { kinds: DEFAULT_CAL_SETTINGS.kinds }],
    ['종류 색 밖', { kinds: [{ id: 'dosu', name: '도수', len: 30, color: 'red' }] }, { kinds: DEFAULT_CAL_SETTINGS.kinds }],
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

  it('AC-5901.6: 줄이 객체가 아니면 기본값이다. 종류·시행자의 다른 열쇠는 옮기지 않는다', async () => {
    await expect(loadCalendarSettings(fakeClient(okWith('x')).client)).resolves.toEqual(DEFAULT_CAL_SETTINGS)
    const odd = { ...SETTINGS_ROW, kinds: [{ ...SETTINGS.kinds[0], extra: 1 }], staff: [{ ...SETTINGS.staff[0], phone: PHONE }] }
    const loaded = await loadCalendarSettings(fakeClient(okWith(odd)).client)
    expect(Object.keys(loaded.kinds[0] ?? {})).toEqual(['id', 'name', 'len', 'color'])
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
    ['종류 색 밖', kindAt({ color: 'red' }), 'kind-color'],
    ['시행자 이름 빈칸', staffAt({ name: '' }), 'staff-name'],
    ['시행자 이름 11자', staffAt({ name: '가'.repeat(11) }), 'staff-name'],
    ['한 글자 표시 두 글자', staffAt({ mark: '가나' }), 'staff-mark'],
    ['한 글자 표시 빈 글자', staffAt({ mark: '' }), 'staff-mark'],
    ['한 글자 표시 겹침', staffAt({ mark: '나' }), 'staff-mark-dup'],
    ['시행자 id 겹침', staffAt({ id: 'st-na' }), 'staff-id'],
    ['시행자 색 없음', staffAt({ color: null }), 'staff-color'],
    ['여는 시간 4', { ...SETTINGS, openHour: 4 }, 'hours'],
    ['닫는 시간 25', { ...SETTINGS, closeHour: 25 }, 'hours'],
    ['여는 시간 = 닫는 시간', { ...SETTINGS, openHour: 12, closeHour: 12 }, 'hours'],
    ['시간 정수 아님', { ...SETTINGS, openHour: 8.5 }, 'hours'],
    ['일요일 글자', { ...SETTINGS, sunday: 'yes' }, 'sunday'],
  ])('AC-5901.6: %s이면 문제 목록에 %s가 있다', (_name, settings, problem) => {
    expect(checkCalendarSettings(settings as CalSettings)).toContain(problem)
  })

  it('AC-5901.6: 길이 5·120, 이름 10자, 시간 5~24는 문제가 아니다', () => {
    expect(checkCalendarSettings({ ...kindAt({ len: 5, name: '가'.repeat(10) }), openHour: 5, closeHour: 24 } as CalSettings)).toEqual([])
    expect(checkCalendarSettings(kindAt({ len: 120 }) as CalSettings)).toEqual([])
  })
})

describe('saveCalendarSettings', () => {
  it('AC-5901.6: 다섯 칸을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id)', async () => {
    const { client, calls } = fakeClient()
    await expect(saveCalendarSettings(client, SETTINGS)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', 'calendar_settings'], ['upsert', SETTINGS_ROW, { onConflict: 'hospital_id' }]])
    expect(Object.keys(calls[1]?.[1] as object)).toEqual(SETTINGS_KEYS)
  })

  it('AC-5901.6: 종류·시행자는 정해 둔 열쇠만 골라 새로 만들고, 이름·한 글자는 앞뒤 빈칸을 뺀다', async () => {
    const { client, calls } = fakeClient()
    const odd = {
      ...SETTINGS,
      hospital_id: 'x',
      kinds: [{ ...SETTINGS.kinds[0], name: ' 도수 ', extra: 1 }, SETTINGS.kinds[1]],
      staff: [{ ...SETTINGS.staff[0], mark: ' 가 ', phone: PHONE }, SETTINGS.staff[1]],
    } as CalSettings
    await saveCalendarSettings(client, odd)
    const row = calls[1]?.[1] as { kinds: object[]; staff: object[] } & Record<string, unknown>
    expect(Object.keys(row)).toEqual(SETTINGS_KEYS)
    expect(row.kinds).toEqual(SETTINGS.kinds)
    expect(row.staff).toEqual(SETTINGS.staff)
  })

  it('AC-5901.6: checkCalendarSettings를 못 지나면 보내지 않고 invalid다', async () => {
    for (const bad of [{ ...SETTINGS, kinds: [] }, { ...SETTINGS, openHour: 4 }, { ...SETTINGS, staff: [SETTINGS.staff[0], { ...SETTINGS.staff[1], mark: '가' }] }]) {
      const { client, calls } = fakeClient()
      await expect(saveCalendarSettings(client, bad as CalSettings)).resolves.toBe('invalid')
      sentNothing(calls)
    }
  })

  it('AC-5901.6: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 다섯 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(null)
    await saveCalendarSettings(realClient(fakeFetch), SETTINGS)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/calendar_settings')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id')
    expect(request.method).toBe('POST')
    expect(request.headers.get('Prefer')).toContain('resolution=merge-duplicates')
    expect(request.body).toEqual(SETTINGS_ROW)
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

// 모든 함수 같은 실패 규칙: 오프라인이면 보내지 않고 offline, 응답 없음(status 0)은 offline, 그 밖은 failed. 오류에는 종류만 있다
type Run = (client: Pick<SupabaseClient, 'from'>) => Promise<unknown>
const ALL: [string, Run][] = [
  ['listAppts', (c) => listAppts(c, DAY, DAY2)],
  ['listCalendarCounts', (c) => listCalendarCounts(c, DAY, DAY2)],
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
