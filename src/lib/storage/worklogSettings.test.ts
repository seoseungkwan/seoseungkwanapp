import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorklogStorageError } from './worklogDays'
import { loadCashFloatSetting, saveCashFloatSetting } from './worklogSettings'

// 업무일지 시재 설정 읽기·저장 (worklog-cash-float REQ-1603 AC-1603.3). 실제 Supabase에 붙지 않는다. 금액은 지어낸 것이다

const SECRET = 'secret detail'

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, message = SECRET): Reply {
  return { data: null, error: { message, details: SECRET, hint: SECRET, code: SECRET }, status }
}

// 받은 표 이름·select 글자·거르기·upsert를 기록하는 가짜 클라이언트(worklogDays.test.ts와 같은 방식)
function fakeClient(reply: Reply = OK) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as [string, unknown][],
    maybeSingle: 0,
    upsert: [] as { row: Record<string, unknown>; options: unknown }[],
  }
  const filter = {
    eq(column: string, value: unknown) {
      calls.eq.push([column, value])
      return filter
    },
    maybeSingle() {
      calls.maybeSingle += 1
      return Promise.resolve(reply)
    },
  }
  const client = {
    from(table: string) {
      calls.from.push(table)
      return {
        select(columns: string) {
          calls.select.push(columns)
          return filter
        },
        upsert(row: Record<string, unknown>, options: unknown) {
          calls.upsert.push({ row, options })
          return Promise.resolve(reply)
        },
      }
    },
  } as unknown as Pick<SupabaseClient, 'from'>
  return { client, calls }
}

const throwingClient = {
  from() {
    throw new Error(SECRET)
  },
} as unknown as Pick<SupabaseClient, 'from'>

// 진짜 postgrest-js에 가짜 fetch만 넣는다. 가짜 클라이언트가 실제 응답 모양과 어긋나지 않는지 본다
function realClient(fakeFetch: typeof fetch) {
  return createClient('http://localhost:54321', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  })
}

async function caught(run: () => Promise<unknown>): Promise<WorklogStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(WorklogStorageError)
  return thrown as WorklogStorageError
}

function expectNoSecret(error: WorklogStorageError) {
  expect(error.message).not.toContain(SECRET)
  expect(String(error)).not.toContain(SECRET)
  expect(error.stack ?? '').not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loadCashFloatSetting', () => {
  it('AC-1603.3: worklog_settings에서 cash_float만 골라 한 줄을 읽고 병원으로 거르지 않는다', async () => {
    const { client, calls } = fakeClient()
    await loadCashFloatSetting(client)
    expect(calls.from).toEqual(['worklog_settings'])
    expect(calls.select).toEqual(['cash_float'])
    expect(calls.eq).toEqual([])
    expect(calls.maybeSingle).toBe(1)
    expect(calls.upsert).toEqual([])
  })

  it.each([250000, 0, 300000, 10_000_000])('AC-1603.3: 읽은 시재 금액 %i을 그대로 돌려준다', async (won) => {
    const { client } = fakeClient({ ...OK, data: { cash_float: won } })
    await expect(loadCashFloatSetting(client)).resolves.toBe(won)
  })

  it('AC-1603.3: 줄이 없으면 300000이다', async () => {
    const { client } = fakeClient({ ...OK, data: null })
    await expect(loadCashFloatSetting(client)).resolves.toBe(300000)
  })

  it.each<[string, Record<string, unknown>]>([
    ['음수', { cash_float: -1 }],
    ['1천만원 넘음', { cash_float: 10_000_001 }],
    ['정수 아님', { cash_float: 1.5 }],
    ['NaN', { cash_float: Number.NaN }],
    ['무한', { cash_float: Number.POSITIVE_INFINITY }],
    ['글자', { cash_float: '250000' }],
    ['null', { cash_float: null }],
    ['참거짓', { cash_float: true }],
    ['칸 없음', {}],
  ])('AC-1603.3: 값이 범위 밖·모양이 틀림(%s)이면 300000이다', async (_name, data) => {
    const { client } = fakeClient({ ...OK, data })
    await expect(loadCashFloatSetting(client)).resolves.toBe(300000)
  })

  it('AC-1603.3: 진짜 클라이언트로도 cash_float만 묻고 거르기가 없으며, 줄이 없으면 300000이다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response('[]', { status: 200 }))
    await expect(loadCashFloatSetting(realClient(fakeFetch))).resolves.toBe(300000)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    const url = new URL(String(input))
    expect(url.pathname).toBe('/rest/v1/worklog_settings')
    expect([...url.searchParams.keys()]).toEqual(['select'])
    expect(url.searchParams.get('select')).toBe('cash_float')
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('AC-1603.3: 진짜 클라이언트로 읽은 줄의 시재 금액을 돌려준다', async () => {
    const body = JSON.stringify([{ cash_float: 250000 }])
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }))
    await expect(loadCashFloatSetting(realClient(fakeFetch))).resolves.toBe(250000)
  })

  it('AC-1603.3: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => loadCashFloatSetting(client))
    expect(error.kind).toBe('offline')
    expect(calls.from).toEqual([])
  })

  it('AC-1603.3: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const { client } = fakeClient(failure(0))
    const error = await caught(() => loadCashFloatSetting(client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 406, 500])('AC-1603.3: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const { client } = fakeClient(failure(status))
    const error = await caught(() => loadCashFloatSetting(client))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-1603.3: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => loadCashFloatSetting(throwingClient))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-1603.3: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    // 읽기는 라이브러리가 끊긴 연결을 몇 번 더 해 본다. 기다리지 않게 시계만 가짜로 돌린다
    vi.useFakeTimers()
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const pending = caught(() => loadCashFloatSetting(realClient(fakeFetch)))
    await vi.runAllTimersAsync()
    const error = await pending
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })
})

describe('saveCashFloatSetting', () => {
  it('AC-1603.3: worklog_settings에 { cash_float: n }만 onConflict hospital_id로 한 번 upsert하고 병원 id를 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveCashFloatSetting(client, 250000)).resolves.toBeUndefined()
    expect(calls.from).toEqual(['worklog_settings'])
    expect(calls.upsert).toEqual([{ row: { cash_float: 250000 }, options: { onConflict: 'hospital_id' } }])
    expect(calls.upsert[0]?.row).not.toHaveProperty('hospital_id')
    expect(calls.select).toEqual([])
    expect(calls.eq).toEqual([])
    expect(calls.maybeSingle).toBe(0)
  })

  it('AC-1603.3: 0원도 그대로 보낸다', async () => {
    const { client, calls } = fakeClient()
    await saveCashFloatSetting(client, 0)
    expect(calls.upsert).toEqual([{ row: { cash_float: 0 }, options: { onConflict: 'hospital_id' } }])
  })

  it('AC-1603.3: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 시재 금액만 보낸다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }))
    await saveCashFloatSetting(realClient(fakeFetch), 250000)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    const url = new URL(String(input))
    expect(url.pathname).toBe('/rest/v1/worklog_settings')
    expect(url.searchParams.get('on_conflict')).toBe('hospital_id')
    expect(url.searchParams.has('hospital_id')).toBe(false)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Prefer')).toContain('resolution=merge-duplicates')
    expect(JSON.parse(String(init?.body))).toEqual({ cash_float: 250000 })
  })

  it('AC-1603.3: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => saveCashFloatSetting(client, 250000))
    expect(error.kind).toBe('offline')
    expect(calls.from).toEqual([])
    expect(calls.upsert).toEqual([])
  })

  it.each<[string, unknown]>([
    ['온라인', { onLine: true }],
    ['navigator 없음', undefined],
  ])('AC-1603.3: %s이면 그대로 저장한다', async (_name, navigator) => {
    vi.stubGlobal('navigator', navigator)
    const { client, calls } = fakeClient()
    await saveCashFloatSetting(client, 250000)
    expect(calls.upsert).toHaveLength(1)
  })

  it('AC-1603.3: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const { client } = fakeClient(failure(0))
    const error = await caught(() => saveCashFloatSetting(client, 250000))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 409, 500])('AC-1603.3: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const { client } = fakeClient(failure(status))
    const error = await caught(() => saveCashFloatSetting(client, 250000))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-1603.3: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => saveCashFloatSetting(throwingClient, 250000))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-1603.3: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const error = await caught(() => saveCashFloatSetting(realClient(fakeFetch), 250000))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it('AC-1603.3: 진짜 클라이언트에서 DB 제약이 거부하면 failed이고 원문이 없다', async () => {
    const body = JSON.stringify({ message: SECRET, details: SECRET, hint: SECRET, code: '23514' })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 400 }))
    const error = await caught(() => saveCashFloatSetting(realClient(fakeFetch), 250000))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})
