import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RSV_WORDS, SUNAP_TOTAL_KEYS, type SunapSettings, type SunapTotals } from '@/types/sunap'
import {
  addSpend,
  closeSunapDay,
  deleteSpend,
  listSpends,
  listSunapDays,
  loadSunapDay,
  loadSunapSettings,
  reopenSunapDay,
  saveSunapSettings,
  SunapStorageError,
  updateSpend,
  type SpendInput,
} from './sunap'

// 수납일지 서버 저장 함수 (sunap-ilji REQ-4903 AC-4903.4, design.md '저장 함수'). 실제 Supabase에 붙지 않는다.
// 숫자·글자·id는 모두 지어낸 것이다

const DAY = '2026-11-16'
const DAY2 = '2026-11-30'
const AT = '2026-11-16T09:30:00.000Z'
const SPEND_ID = '00000000-0000-4000-8000-000000000201'
const GROUP = '00000000-0000-4000-8000-000000000101'
const GROUP2 = '00000000-0000-4000-8000-000000000102'
const PHONE = '010-0000-1234'
const SECRET = 'secret detail'

const DAY_COLUMNS = ['work_date', 'closed_at', 'late', ...SUNAP_TOTAL_KEYS].join(',')
const SPEND_COLUMNS = 'id,kind,memo,amount'
const SETTINGS_COLUMNS = 'block_group,pt_group,rsv_words'

// 칸이 뒤바뀌면 잡히도록 칸마다 다른 값이다
const TOTALS = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key, i) => [key, (i + 1) * 10])) as SunapTotals
const DAY_ROW = { work_date: DAY, closed_at: AT, late: false, ...TOTALS }
const SAVED_DAY = { day: DAY, closedAt: AT, late: false, totals: TOTALS }
const SPEND: SpendInput = { kind: 'parking', memo: '주차 지원', amount: 3000 }
const SPEND_ROW = { id: SPEND_ID, ...SPEND }

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, message = SECRET): Reply {
  return { data: null, error: { message, details: SECRET, hint: SECRET, code: SECRET }, status }
}

type Call = [string, ...unknown[]]
const METHODS = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

// 받은 부름을 차례로 적는 가짜 클라이언트. 어느 부름이든 같은 빌더를 돌려주고, 기다리면 정해 둔 답이 온다
function fakeClient(reply: Reply = OK) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const name of METHODS) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return builder
    }
  }
  builder.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(reply).then(resolve, reject)
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

function fetchReturning(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body === null ? null : JSON.stringify(body), { status }))
}

function requestOf(fakeFetch: ReturnType<typeof fetchReturning>) {
  expect(fakeFetch).toHaveBeenCalledTimes(1)
  const [input, init] = fakeFetch.mock.calls[0] ?? []
  const url = new URL(String(input))
  return { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

async function caught(run: () => Promise<unknown>): Promise<SunapStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(SunapStorageError)
  return thrown as SunapStorageError
}

function expectNoSecret(error: SunapStorageError) {
  expect(error.message).not.toContain(SECRET)
  expect(String(error)).not.toContain(SECRET)
  expect(error.stack ?? '').not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
}

const sentNothing = (calls: Call[]) => expect(calls).toEqual([])

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('closeSunapDay', () => {
  it('AC-4903.4: sunap_days에 work_date·closed_at(지금)·late와 숫자 24칸을 onConflict hospital_id,work_date로 한 번 upsert한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(AT))
    const { client, calls } = fakeClient()
    await expect(closeSunapDay(client, DAY, TOTALS, true)).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'sunap_days'],
      ['upsert', { work_date: DAY, closed_at: AT, late: true, ...TOTALS }, { onConflict: 'hospital_id,work_date' }],
    ])
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(['work_date', 'closed_at', 'late', ...SUNAP_TOTAL_KEYS])
    expect(row).not.toHaveProperty('hospital_id')
  })

  it('AC-4903.4: 합계에 정해 둔 24칸 밖 열쇠가 있어도 보내지 않는다(열쇠를 골라 새로 만든다)', async () => {
    const { client, calls } = fakeClient()
    await closeSunapDay(client, DAY, { ...TOTALS, hospital_id: 'x', name: '홍길동' } as SunapTotals, false)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(['work_date', 'closed_at', 'late', ...SUNAP_TOTAL_KEYS])
  })

  it.each<[string, unknown]>([
    ['음수', -1],
    ['정수 아님', 1.5],
    ['NaN', Number.NaN],
    ['10억 넘음', 1_000_000_001],
    ['글자', '10'],
    ['없음', undefined],
  ])('AC-4903.4: 숫자 칸이 %s이면 보내지 않고 failed다', async (_name, value) => {
    const { client, calls } = fakeClient()
    const error = await caught(() => closeSunapDay(client, DAY, { ...TOTALS, unpaid_won: value } as SunapTotals, false))
    expect(error.kind).toBe('failed')
    sentNothing(calls)
  })

  it.each(['2026-13-01', '2026-11-16T00:00', '', '20261116'])('AC-4903.4: 날짜 %j가 날짜 모양이 아니면 보내지 않고 failed다', async (ymd) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => closeSunapDay(client, ymd, TOTALS, false))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: late가 참거짓이 아니면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => closeSunapDay(client, DAY, TOTALS, 'yes' as unknown as boolean))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 정해 둔 칸만 보낸다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(AT))
    const fakeFetch = fetchReturning(null, 201)
    await closeSunapDay(realClient(fakeFetch), DAY, TOTALS, false)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_days')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id,work_date')
    expect(request.method).toBe('POST')
    expect(request.headers.get('Prefer')).toContain('resolution=merge-duplicates')
    expect(request.body).toEqual({ work_date: DAY, closed_at: AT, late: false, ...TOTALS })
  })
})

describe('reopenSunapDay', () => {
  it('AC-4903.4: sunap_days에서 그 날짜 줄을 지운다(병원으로 거르지 않는다, RLS가 고른다)', async () => {
    const { client, calls } = fakeClient()
    await expect(reopenSunapDay(client, DAY)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', 'sunap_days'], ['delete'], ['eq', 'work_date', DAY]])
  })

  it('AC-4903.4: 날짜 모양이 아니면 보내지 않고 failed다(조건 없는 지우기를 보내지 않는다)', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => reopenSunapDay(client, '2026-02-30'))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 진짜 클라이언트로도 DELETE ?work_date=eq.날짜 한 번이다', async () => {
    const fakeFetch = fetchReturning(null, 204)
    await reopenSunapDay(realClient(fakeFetch), DAY)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_days')
    expect(request.method).toBe('DELETE')
    expect(request.url.searchParams.get('work_date')).toBe(`eq.${DAY}`)
    expect([...request.url.searchParams.keys()]).toEqual(['work_date'])
  })
})

describe('loadSunapDay', () => {
  it('AC-4903.4: 정해 둔 칸만 골라 그 날짜 줄 하나를 읽고 { day, closedAt, late, totals }로 바꾼다', async () => {
    const { client, calls } = fakeClient(okWith(DAY_ROW))
    await expect(loadSunapDay(client, DAY)).resolves.toEqual(SAVED_DAY)
    expect(calls).toEqual([['from', 'sunap_days'], ['select', DAY_COLUMNS], ['eq', 'work_date', DAY], ['maybeSingle']])
    expect(DAY_COLUMNS).not.toContain('hospital_id')
  })

  it('AC-4903.4: 줄이 없으면 null이다', async () => {
    const { client } = fakeClient(okWith(null))
    await expect(loadSunapDay(client, DAY)).resolves.toBeNull()
  })

  it('AC-4903.4: 읽은 줄에 정해 둔 칸 밖 열쇠가 있어도 결과에 옮기지 않는다', async () => {
    const { client } = fakeClient(okWith({ ...DAY_ROW, hospital_id: 'x', memo: '홍길동' }))
    const day = await loadSunapDay(client, DAY)
    expect(day).toEqual(SAVED_DAY)
    expect(Object.keys(day?.totals ?? {})).toEqual([...SUNAP_TOTAL_KEYS])
  })

  it.each<[string, Record<string, unknown>]>([
    ['late 글자', { late: 'false' }],
    ['late null', { late: null }],
    ['closed_at 없음', { closed_at: null }],
    ['closed_at 빈 글자', { closed_at: '' }],
    ['work_date 틀림', { work_date: '2026/11/16' }],
    ['숫자 음수', { visits: -1 }],
    ['숫자 정수 아님', { cash_won: 1.5 }],
    ['숫자 글자', { card_won: '1000' }],
    ['숫자 null', { free_n: null }],
    ['숫자 10억 넘음', { transfer_won: 1_000_000_001 }],
  ])('AC-4903.4: 읽은 줄 모양이 틀리면(%s) 없는 것(null)으로 본다', async (_name, patch) => {
    const { client } = fakeClient(okWith({ ...DAY_ROW, ...patch }))
    await expect(loadSunapDay(client, DAY)).resolves.toBeNull()
  })

  it('AC-4903.4: 숫자 칸이 빠진 줄도 없는 것(null)으로 본다', async () => {
    const partial: Record<string, unknown> = { ...DAY_ROW }
    delete partial.pt_n
    const { client } = fakeClient(okWith(partial))
    await expect(loadSunapDay(client, DAY)).resolves.toBeNull()
  })

  it('AC-4903.4: 날짜 모양이 아니면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => loadSunapDay(client, 'today'))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 진짜 클라이언트로도 select와 work_date=eq.날짜만 묻고 읽은 줄을 돌려준다', async () => {
    const fakeFetch = fetchReturning([DAY_ROW])
    await expect(loadSunapDay(realClient(fakeFetch), DAY)).resolves.toEqual(SAVED_DAY)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_days')
    expect([...request.url.searchParams.keys()]).toEqual(['select', 'work_date'])
    expect(request.url.searchParams.get('select')).toBe(DAY_COLUMNS)
    expect(request.url.searchParams.get('work_date')).toBe(`eq.${DAY}`)
    expect(request.method).toBe('GET')
  })
})

describe('listSunapDays', () => {
  it('AC-4903.4: 그 기간(from~to) 줄을 날짜 차례로 읽어 같은 모양 배열로 돌려준다', async () => {
    const second = { ...DAY_ROW, work_date: DAY2, late: true, closed_at: '2026-12-01T01:00:00+00:00' }
    const { client, calls } = fakeClient(okWith([DAY_ROW, second]))
    await expect(listSunapDays(client, DAY, DAY2)).resolves.toEqual([
      SAVED_DAY,
      { day: DAY2, closedAt: '2026-12-01T01:00:00+00:00', late: true, totals: TOTALS },
    ])
    expect(calls).toEqual([
      ['from', 'sunap_days'],
      ['select', DAY_COLUMNS],
      ['gte', 'work_date', DAY],
      ['lte', 'work_date', DAY2],
      ['order', 'work_date', { ascending: true }],
    ])
  })

  it('AC-4903.4: 모양이 틀린 줄은 빼고 나머지를 돌려준다. 빈 목록은 빈 배열이다', async () => {
    const bad = [null, 'x', { ...DAY_ROW, work_date: DAY2, visits: -5 }, { ...DAY_ROW, late: 1 }]
    const { client } = fakeClient(okWith([...bad, DAY_ROW]))
    await expect(listSunapDays(client, DAY, DAY2)).resolves.toEqual([SAVED_DAY])
    await expect(listSunapDays(fakeClient(okWith([])).client, DAY, DAY2)).resolves.toEqual([])
  })

  it('AC-4903.4: 답이 목록이 아니면 빈 목록으로 보이지 않고 failed다', async () => {
    const error = await caught(() => listSunapDays(fakeClient(okWith(null)).client, DAY, DAY2))
    expect(error.kind).toBe('failed')
  })

  it.each<[string, string, string]>([
    ['from 틀림', 'x', DAY2],
    ['to 틀림', DAY, '2026-11-31'],
    ['from이 to보다 늦음', DAY2, DAY],
  ])('AC-4903.4: 기간이 %s이면 보내지 않고 failed다', async (_name, from, to) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listSunapDays(client, from, to))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 하루 기간(from = to)도 읽는다', async () => {
    const { client } = fakeClient(okWith([DAY_ROW]))
    await expect(listSunapDays(client, DAY, DAY)).resolves.toEqual([SAVED_DAY])
  })

  it('AC-4903.4: 진짜 클라이언트로도 work_date gte·lte와 날짜 차례만 묻는다', async () => {
    const fakeFetch = fetchReturning([DAY_ROW])
    await expect(listSunapDays(realClient(fakeFetch), DAY, DAY2)).resolves.toEqual([SAVED_DAY])
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_days')
    expect(request.url.searchParams.getAll('work_date')).toEqual([`gte.${DAY}`, `lte.${DAY2}`])
    expect(request.url.searchParams.get('order')).toBe('work_date.asc')
    expect(request.method).toBe('GET')
  })
})

describe('listSpends', () => {
  it('AC-4903.4: sunap_spends에서 그 날짜 지출을 넣은 차례로 읽는다', async () => {
    const second = { id: GROUP, kind: 'cash', memo: '택배', amount: 4500 }
    const { client, calls } = fakeClient(okWith([SPEND_ROW, second]))
    await expect(listSpends(client, DAY)).resolves.toEqual([SPEND_ROW, second])
    expect(calls).toEqual([
      ['from', 'sunap_spends'],
      ['select', SPEND_COLUMNS],
      ['eq', 'work_date', DAY],
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['종류 틀림', { ...SPEND_ROW, kind: 'x' }],
    ['내용 빈 글자', { ...SPEND_ROW, memo: '' }],
    ['내용 51자', { ...SPEND_ROW, memo: '가'.repeat(51) }],
    ['금액 음수', { ...SPEND_ROW, amount: -1 }],
    ['금액 1억 넘음', { ...SPEND_ROW, amount: 100_000_001 }],
    ['금액 글자', { ...SPEND_ROW, amount: '3000' }],
    ['id 없음', { ...SPEND_ROW, id: null }],
  ])('AC-4903.4: 모양이 틀린 지출 줄(%s)은 뺀다', async (_name, bad) => {
    const { client } = fakeClient(okWith([bad, SPEND_ROW]))
    await expect(listSpends(client, DAY)).resolves.toEqual([SPEND_ROW])
  })

  it('AC-4903.4: 읽은 줄의 다른 열쇠는 옮기지 않는다', async () => {
    const { client } = fakeClient(okWith([{ ...SPEND_ROW, hospital_id: 'x', created_at: AT }]))
    const [spend] = await listSpends(client, DAY)
    expect(Object.keys(spend ?? {}).sort()).toEqual(['amount', 'id', 'kind', 'memo'])
  })

  it('AC-4903.4: 답이 목록이 아니면 failed다', async () => {
    expect((await caught(() => listSpends(fakeClient(okWith(null)).client, DAY))).kind).toBe('failed')
  })

  it('AC-4903.4: 날짜 모양이 아니면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => listSpends(client, ''))).kind).toBe('failed')
    sentNothing(calls)
  })
})

describe('addSpend', () => {
  it('AC-4903.4: 정해 둔 네 칸(work_date·kind·memo·amount)만 넣고 DB가 준 줄을 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    await expect(addSpend(client, DAY, SPEND)).resolves.toEqual(SPEND_ROW)
    expect(calls).toEqual([
      ['from', 'sunap_spends'],
      ['insert', { work_date: DAY, kind: 'parking', memo: '주차 지원', amount: 3000 }],
      ['select', SPEND_COLUMNS],
      ['single'],
    ])
  })

  it('AC-4903.4: 내용은 앞뒤 빈칸을 빼고 보내며, 다른 열쇠는 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    await addSpend(client, DAY, { ...SPEND, memo: '  주차 지원 \n', hospital_id: 'x' } as SpendInput)
    expect(calls[1]).toEqual(['insert', { work_date: DAY, kind: 'parking', memo: '주차 지원', amount: 3000 }])
  })

  it.each([PHONE, '주민 900101-1234567', 'a@b.co 환불', ' 010 0000 1234 '])(
    'AC-4903.4: 내용 %j가 개인정보 모양이면 보내지 않고 blocked다',
    async (memo) => {
      const { client, calls } = fakeClient(okWith(SPEND_ROW))
      await expect(addSpend(client, DAY, { ...SPEND, memo })).resolves.toBe('blocked')
      sentNothing(calls)
    },
  )

  it.each<[string, Partial<SpendInput> & Record<string, unknown>]>([
    ['종류 틀림', { kind: 'x' as SpendInput['kind'] }],
    ['내용 빈칸뿐', { memo: '   ' }],
    ['내용 51자', { memo: '가'.repeat(51) }],
    ['금액 음수', { amount: -1 }],
    ['금액 1억 넘음', { amount: 100_000_001 }],
    ['금액 정수 아님', { amount: 10.5 }],
  ])('AC-4903.4: %s이면 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    expect((await caught(() => addSpend(client, DAY, { ...SPEND, ...patch }))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 내용 50자·금액 0원·1억 원은 보낸다', async () => {
    for (const spend of [
      { ...SPEND, memo: '가'.repeat(50) },
      { ...SPEND, amount: 0 },
      { ...SPEND, amount: 100_000_000 },
    ]) {
      const { client, calls } = fakeClient(okWith({ ...SPEND_ROW, ...spend }))
      await expect(addSpend(client, DAY, spend)).resolves.toEqual({ ...SPEND_ROW, ...spend })
      expect(calls).toHaveLength(4)
    }
  })

  it('AC-4903.4: 날짜 모양이 아니면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    expect((await caught(() => addSpend(client, '2026-11', SPEND))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: DB가 준 줄 모양이 틀리면 failed다', async () => {
    const { client } = fakeClient(okWith({ ...SPEND_ROW, id: 7 }))
    expect((await caught(() => addSpend(client, DAY, SPEND))).kind).toBe('failed')
  })

  it('AC-4903.4: 진짜 클라이언트로도 POST 한 번에 네 칸만 보내고 넣은 줄을 돌려받는다', async () => {
    const fakeFetch = fetchReturning(SPEND_ROW, 201)
    await expect(addSpend(realClient(fakeFetch), DAY, SPEND)).resolves.toEqual(SPEND_ROW)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_spends')
    expect(request.url.searchParams.get('select')).toBe(SPEND_COLUMNS)
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ work_date: DAY, kind: 'parking', memo: '주차 지원', amount: 3000 })
  })
})

describe('updateSpend', () => {
  it('AC-4903.4: 받은 칸만 그 id 줄에 고치고 DB가 준 줄을 돌려준다', async () => {
    const changed = { ...SPEND_ROW, amount: 4500 }
    const { client, calls } = fakeClient(okWith(changed))
    await expect(updateSpend(client, SPEND_ID, { amount: 4500 })).resolves.toEqual(changed)
    expect(calls).toEqual([['from', 'sunap_spends'], ['update', { amount: 4500 }], ['eq', 'id', SPEND_ID], ['select', SPEND_COLUMNS], ['single']])
  })

  it('AC-4903.4: 세 칸을 함께 고치고, 내용은 앞뒤 빈칸을 빼며, 다른 열쇠(work_date 등)는 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    await updateSpend(client, SPEND_ID, { kind: 'card', memo: ' 택배 ', amount: 1, work_date: DAY2 } as Partial<SpendInput>)
    expect(calls[1]).toEqual(['update', { kind: 'card', memo: '택배', amount: 1 }])
  })

  it('AC-4903.4: 내용이 개인정보 모양이면 보내지 않고 blocked다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    await expect(updateSpend(client, SPEND_ID, { memo: `환불 ${PHONE}` })).resolves.toBe('blocked')
    sentNothing(calls)
  })

  it.each<[string, Record<string, unknown>]>([
    ['고칠 칸 없음', {}],
    ['종류 틀림', { kind: 'x' }],
    ['내용 빈 글자', { memo: '' }],
    ['금액 1억 넘음', { amount: 100_000_001 }],
  ])('AC-4903.4: %s이면 보내지 않고 failed다', async (_name, patch) => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    expect((await caught(() => updateSpend(client, SPEND_ID, patch as Partial<SpendInput>))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: id가 빈 글자면 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient(okWith(SPEND_ROW))
    expect((await caught(() => updateSpend(client, '', { amount: 1 }))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 고칠 줄이 없어(남의 줄·지운 줄) 단건 답이 오류면 failed다', async () => {
    const { client } = fakeClient(failure(406))
    expect((await caught(() => updateSpend(client, SPEND_ID, { amount: 1 }))).kind).toBe('failed')
  })

  it('AC-4903.4: 진짜 클라이언트로도 PATCH ?id=eq.id 한 번에 받은 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning({ ...SPEND_ROW, memo: '택배' })
    await expect(updateSpend(realClient(fakeFetch), SPEND_ID, { memo: '택배' })).resolves.toEqual({ ...SPEND_ROW, memo: '택배' })
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_spends')
    expect(request.url.searchParams.get('id')).toBe(`eq.${SPEND_ID}`)
    expect(request.method).toBe('PATCH')
    expect(request.body).toEqual({ memo: '택배' })
  })
})

describe('deleteSpend', () => {
  it('AC-4903.4: 그 id 줄 하나를 지운다', async () => {
    const { client, calls } = fakeClient()
    await expect(deleteSpend(client, SPEND_ID)).resolves.toBeUndefined()
    expect(calls).toEqual([['from', 'sunap_spends'], ['delete'], ['eq', 'id', SPEND_ID]])
  })

  it('AC-4903.4: id가 빈 글자면 보내지 않고 failed다(조건 없는 지우기를 보내지 않는다)', async () => {
    const { client, calls } = fakeClient()
    expect((await caught(() => deleteSpend(client, ''))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 진짜 클라이언트로도 DELETE ?id=eq.id 한 번이다', async () => {
    const fakeFetch = fetchReturning(null, 204)
    await deleteSpend(realClient(fakeFetch), SPEND_ID)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_spends')
    expect(request.method).toBe('DELETE')
    expect([...request.url.searchParams.entries()]).toEqual([['id', `eq.${SPEND_ID}`]])
  })
})

describe('loadSunapSettings', () => {
  const WORDS = { inj: ['주사'], visit: ['경과', '진료'], etc: [] }

  it('AC-4903.4: sunap_settings에서 세 칸을 골라 한 줄을 읽고 camelCase 설정으로 바꾼다(병원으로 거르지 않는다)', async () => {
    const { client, calls } = fakeClient(okWith({ block_group: GROUP, pt_group: GROUP2, rsv_words: WORDS }))
    await expect(loadSunapSettings(client)).resolves.toEqual({ blockGroup: GROUP, ptGroup: GROUP2, words: WORDS })
    expect(calls).toEqual([['from', 'sunap_settings'], ['select', SETTINGS_COLUMNS], ['maybeSingle']])
  })

  it('AC-4903.4: 줄이 없으면 기본값(묶음 안 고름, 기본 예약 말)이고, 기본 말 목록은 새 배열이다', async () => {
    const { client } = fakeClient(okWith(null))
    const settings = await loadSunapSettings(client)
    expect(settings).toEqual({ blockGroup: null, ptGroup: null, words: DEFAULT_RSV_WORDS })
    expect(settings.words.inj).not.toBe(DEFAULT_RSV_WORDS.inj)
    settings.words.inj.push('바뀜')
    expect(DEFAULT_RSV_WORDS.inj).toEqual(['주사', '블록'])
  })

  it.each<[string, unknown]>([
    ['배열', ['주사']],
    ['null', null],
    ['inj 없음', { visit: [], etc: [] }],
    ['visit이 글자', { inj: [], visit: '경과', etc: [] }],
    ['말에 숫자', { inj: ['주사', 1], visit: [], etc: [] }],
  ])('AC-4903.4: 예약 말 모양이 틀리면(%s) 기본 예약 말이고 묶음은 그대로 읽는다', async (_name, words) => {
    const { client } = fakeClient(okWith({ block_group: GROUP, pt_group: null, rsv_words: words }))
    await expect(loadSunapSettings(client)).resolves.toEqual({ blockGroup: GROUP, ptGroup: null, words: DEFAULT_RSV_WORDS })
  })

  it.each<[string, unknown]>([
    ['숫자', 7],
    ['빈 글자', ''],
    ['객체', { id: GROUP }],
  ])('AC-4903.4: 묶음 칸 모양이 틀리면(%s) 안 고름(null)이다', async (_name, group) => {
    const { client } = fakeClient(okWith({ block_group: group, pt_group: group, rsv_words: WORDS }))
    await expect(loadSunapSettings(client)).resolves.toEqual({ blockGroup: null, ptGroup: null, words: WORDS })
  })

  it('AC-4903.4: 읽은 예약 말의 다른 열쇠는 옮기지 않는다', async () => {
    const { client } = fakeClient(okWith({ block_group: null, pt_group: null, rsv_words: { ...WORDS, extra: ['x'] } }))
    const settings = await loadSunapSettings(client)
    expect(Object.keys(settings.words)).toEqual(['inj', 'visit', 'etc'])
  })

  it('AC-4903.4: 진짜 클라이언트로도 세 칸만 묻고 거르기가 없으며, 줄이 없으면 기본값이다', async () => {
    const fakeFetch = fetchReturning([])
    await expect(loadSunapSettings(realClient(fakeFetch))).resolves.toEqual({ blockGroup: null, ptGroup: null, words: DEFAULT_RSV_WORDS })
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_settings')
    expect([...request.url.searchParams.keys()]).toEqual(['select'])
    expect(request.url.searchParams.get('select')).toBe(SETTINGS_COLUMNS)
  })
})

describe('saveSunapSettings', () => {
  const SETTINGS: SunapSettings = { blockGroup: GROUP, ptGroup: null, words: { inj: ['주사'], visit: ['경과'], etc: ['기타'] } }

  it('AC-4903.4: 세 칸(block_group·pt_group·rsv_words)만 onConflict hospital_id로 한 번 upsert한다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveSunapSettings(client, SETTINGS)).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'sunap_settings'],
      ['upsert', { block_group: GROUP, pt_group: null, rsv_words: { inj: ['주사'], visit: ['경과'], etc: ['기타'] } }, { onConflict: 'hospital_id' }],
    ])
  })

  it('AC-4903.4: 설정·예약 말의 다른 열쇠는 보내지 않는다(열쇠를 골라 새로 만든다)', async () => {
    const { client, calls } = fakeClient()
    const odd = { ...SETTINGS, hospital_id: 'x', words: { ...SETTINGS.words, extra: ['x'] } } as SunapSettings
    await saveSunapSettings(client, odd)
    const row = calls[1]?.[1] as Record<string, unknown>
    expect(Object.keys(row)).toEqual(['block_group', 'pt_group', 'rsv_words'])
    expect(Object.keys(row.rsv_words as object)).toEqual(['inj', 'visit', 'etc'])
  })

  it.each<[string, unknown]>([
    ['묶음이 숫자', { ...SETTINGS, blockGroup: 7 }],
    ['묶음이 빈 글자', { ...SETTINGS, ptGroup: '' }],
    ['말 목록이 배열 아님', { ...SETTINGS, words: { ...SETTINGS.words, inj: '주사' } }],
    ['말에 숫자', { ...SETTINGS, words: { ...SETTINGS.words, etc: [1] } }],
    ['말 묶음 없음', { ...SETTINGS, words: null }],
  ])('AC-4903.4: %s이면 보내지 않고 failed다', async (_name, settings) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => saveSunapSettings(client, settings as SunapSettings))).kind).toBe('failed')
    sentNothing(calls)
  })

  it('AC-4903.4: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 세 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(null, 201)
    await saveSunapSettings(realClient(fakeFetch), SETTINGS)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/sunap_settings')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id')
    expect(request.method).toBe('POST')
    expect(request.headers.get('Prefer')).toContain('resolution=merge-duplicates')
    expect(request.body).toEqual({ block_group: GROUP, pt_group: null, rsv_words: SETTINGS.words })
  })
})

// 열 함수 모두 같은 실패 규칙: 오프라인이면 보내지 않고 offline, 응답 없음(status 0)은 offline, 그 밖은 failed. 오류에는 종류만 있다
type Run = (client: Pick<SupabaseClient, 'from'>) => Promise<unknown>
const ALL: [string, Run][] = [
  ['closeSunapDay', (c) => closeSunapDay(c, DAY, TOTALS, false)],
  ['reopenSunapDay', (c) => reopenSunapDay(c, DAY)],
  ['loadSunapDay', (c) => loadSunapDay(c, DAY)],
  ['listSunapDays', (c) => listSunapDays(c, DAY, DAY2)],
  ['listSpends', (c) => listSpends(c, DAY)],
  ['addSpend', (c) => addSpend(c, DAY, SPEND)],
  ['updateSpend', (c) => updateSpend(c, SPEND_ID, { amount: 1 })],
  ['deleteSpend', (c) => deleteSpend(c, SPEND_ID)],
  ['loadSunapSettings', (c) => loadSunapSettings(c)],
  ['saveSunapSettings', (c) => saveSunapSettings(c, { blockGroup: null, ptGroup: null, words: DEFAULT_RSV_WORDS })],
]

describe.each(ALL)('%s 실패', (_name, run) => {
  it('AC-4903.4: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    expect((await caught(() => run(client))).kind).toBe('offline')
    sentNothing(calls)
  })

  it('AC-4903.4: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const error = await caught(() => run(fakeClient(failure(0)).client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 404, 409, 500])('AC-4903.4: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const error = await caught(() => run(fakeClient(failure(status)).client))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-4903.4: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => run(throwingClient))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-4903.4: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
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

  it('AC-4903.4: 진짜 클라이언트에서 DB 제약이 거부하면 failed이고 원문이 없다', async () => {
    const body = JSON.stringify({ message: SECRET, details: SECRET, hint: SECRET, code: '23514' })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 400 }))
    const error = await caught(() => run(realClient(fakeFetch)))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})

describe('SunapStorageError', () => {
  it('AC-4903.4: 종류(offline·failed)만 담는다', () => {
    const error = new SunapStorageError('offline')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SunapStorageError')
    expect(error.kind).toBe('offline')
    expect(new SunapStorageError('failed').kind).toBe('failed')
  })
})
