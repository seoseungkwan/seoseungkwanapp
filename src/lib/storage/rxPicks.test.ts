import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RxPick } from '@/types/rxPicks'
import { RxPickStoreError, addRxPick, clearRxPicks, readRxPicks, removeRxPick } from './rxPicks'
import type { SupabaseLike } from './stats'

// 고른 처방 저장·읽기. 실제 Supabase에 붙지 않는다 — 가짜 클라이언트가 어느 표에 어떤 본문·조건이 나갔는지 적어 두고,
// 읽기는 고른 칸만, 지우기는 받은 조건에 맞는 줄만 다룬다. 권한·제약 자체는 supabase/rxPicks.rls.test.ts가 증명한다
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

beforeEach(() => {
  supabaseBrowser.mockReset()
})

const TABLE = 'stats_rx_picks'
const READ_FAILED = 'E-STATS-PICK-READ-FAILED'
const SAVE_FAILED = 'E-STATS-PICK-SAVE-FAILED'
const RAW = 'permission denied for table stats_rx_picks (secret detail)' // 서버 답에 섞여 온 글자. 옮겨지면 안 된다
const SERVER_MAX_ROWS = 1000 // Supabase가 한 번에 주는 줄 수 기본값. 넘는 줄은 알리지 않고 잘라 준다

// 주민번호 모양은 소스에 통째로 쓰지 않는다(검문소가 막는다) — 조각을 이어 만든다
const idLike = () => ['900101', '1234567'].join('-')

type Stored = Record<string, unknown>
type Filter = ['eq' | 'gte', string, unknown]
type Call = {
  table: string
  op: 'select' | 'insert' | 'delete'
  columns?: string
  body?: unknown
  filters: Filter[]
  orders: [string, unknown][]
  range: [number, number] | null
}
type Answer = { code?: string; message: string } | 'throw' | 'not-a-list' | null
type Setup = { stored?: Stored[]; fail?: (call: Call) => Answer }

const matches = (row: Stored, [op, column, value]: Filter) =>
  op === 'eq' ? row[column] === value : (row[column] as number) >= (value as number)

function fakeClient({ stored = [], fail = () => null }: Setup = {}) {
  const calls: Call[] = []
  const rows = [...stored]

  // 진짜 빌더처럼 await할 때 나간다
  const answer = (call: Call, data: () => unknown) => ({
    then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
      return Promise.resolve()
        .then(() => {
          calls.push(call)
          const how = fail(call)
          if (how === 'throw') throw new Error(RAW)
          if (how === 'not-a-list') return { data: null, error: null }
          return how === null ? { data: data(), error: null } : { data: null, error: how }
        })
        .then(ok, no)
    },
  })

  const newCall = (table: string, op: Call['op']): Call => ({ table, op, filters: [], orders: [], range: null })

  const from = (table: string) => ({
    select(columns: string) {
      const call = { ...newCall(table, 'select'), columns }
      const builder = {
        order(column: string, options?: unknown) {
          call.orders.push([column, options])
          return builder
        },
        range(start: number, end: number) {
          call.range = [start, end]
          return builder
        },
        ...answer(call, () => {
          const kept = [...rows]
          for (const [column] of call.orders) kept.sort((a, b) => (a[column] as number) - (b[column] as number))
          const [start, end] = call.range ?? [0, SERVER_MAX_ROWS - 1]
          const names = columns.split(',').map((name) => name.trim())
          // 진짜처럼 고른 칸만 준다
          return kept.slice(start, Math.min(end + 1, start + SERVER_MAX_ROWS)).map((row) => Object.fromEntries(names.map((name) => [name, row[name]])))
        }),
      }
      return builder
    },
    insert(body: unknown) {
      return answer({ ...newCall(table, 'insert'), body }, () => null)
    },
    delete() {
      const call = newCall(table, 'delete')
      const builder = {
        eq(column: string, value: unknown) {
          call.filters.push(['eq', column, value])
          return builder
        },
        gte(column: string, value: unknown) {
          call.filters.push(['gte', column, value])
          return builder
        },
        ...answer(call, () => {
          const left = rows.filter((row) => !call.filters.every((filter) => matches(row, filter)))
          rows.length = 0
          rows.push(...left)
          return null
        }),
      }
      return builder
    },
  })

  return { client: { from } as unknown as SupabaseLike, calls, rows }
}

function storedRow(code: unknown, name: unknown, pickOrder: number): Stored {
  return { hospital_id: 'fake-hospital', code, name, pick_order: pickOrder }
}

const failureOf = (work: Promise<unknown>) =>
  work.then(
    () => {
      throw new Error('실패해야 하는데 성공함')
    },
    (error: unknown) => error,
  )

function expectStoreError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(RxPickStoreError)
  expect((error as RxPickStoreError).code).toBe(code)
  expect((error as RxPickStoreError).message).toBe(code)
  // 서버 답을 옮기지 않는다
  expect((error as RxPickStoreError).cause).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain('secret')
  expect(String(error)).not.toContain('secret')
}

describe('AC-811.2 readRxPicks', () => {
  it('AC-811.2: pick_order 차례의 {code, name} 목록이다(병원 조건을 보내지 않는다)', async () => {
    const { client, calls } = fakeClient({
      stored: [storedRow('CC300', '가짜 다', 30), storedRow('AA100', '가짜 가', 10), storedRow('BB200', '가짜 나', 20)],
    })
    await expect(readRxPicks({ client })).resolves.toEqual([
      { code: 'AA100', name: '가짜 가' },
      { code: 'BB200', name: '가짜 나' },
      { code: 'CC300', name: '가짜 다' },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'select', filters: [] })
    expect(calls[0].columns).not.toContain('hospital_id')
    expect(calls[0].orders).toEqual([['pick_order', { ascending: true }]])
  })

  it('AC-811.2: 검사에 걸린 줄은 뺀다', async () => {
    const { client } = fakeClient({
      stored: [
        storedRow('AA100', '가짜 가', 1),
        storedRow('010-1234-5678', '전화 모양 코드', 2),
        storedRow('BB200', '줄\n바꿈', 3),
        storedRow(idLike(), '주민번호 모양 코드', 4),
        storedRow('CC300', 'fake@example.com', 5),
        storedRow(300, '숫자 코드', 6),
        storedRow('DD400', '', 7),
      ],
    })
    await expect(readRxPicks({ client })).resolves.toEqual([
      { code: 'AA100', name: '가짜 가' },
      { code: 'DD400', name: '' },
    ])
  })

  it('AC-811.2: 1000줄을 넘어도 쪽으로 나눠 다 읽는다(걸러진 줄이 쪽 계산을 흐리지 않는다)', async () => {
    const stored = Array.from({ length: 2345 }, (_, at) => storedRow(`RX${at}`, `가짜 ${at}`, at + 1))
    stored[5] = storedRow('010-1234-5678', '전화 모양 코드', 6)
    const { client, calls } = fakeClient({ stored })
    const picks = await readRxPicks({ client })
    expect(picks).toHaveLength(2344)
    expect(picks[0]).toEqual({ code: 'RX0', name: '가짜 0' })
    expect(picks[2343]).toEqual({ code: 'RX2344', name: '가짜 2344' })
    expect(calls.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('AC-811.2: 딱 1000줄이면 다음 쪽이 빈 것을 보고 멈춘다', async () => {
    const stored = Array.from({ length: 1000 }, (_, at) => storedRow(`RX${at}`, '', at + 1))
    const { client, calls } = fakeClient({ stored })
    await expect(readRxPicks({ client })).resolves.toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it.each([
    ['오류 답', { code: '42P01', message: RAW }],
    ['예외', 'throw'],
    ['줄 목록이 아닌 답', 'not-a-list'],
  ] as const)('AC-811.2: %s이면 번호만 던지고 서버 답을 옮기지 않는다(빈 목록으로 읽지 않는다)', async (_, how) => {
    const { client } = fakeClient({ fail: () => how })
    expectStoreError(await failureOf(readRxPicks({ client })), READ_FAILED)
  })

  it('AC-811.2: 둘째 쪽에서 실패하면 앞 쪽 줄을 돌려주지 않고 번호를 던진다', async () => {
    const stored = Array.from({ length: 1500 }, (_, at) => storedRow(`RX${at}`, '', at + 1))
    const { client } = fakeClient({ stored, fail: (call) => (call.range?.[0] === 1000 ? { message: RAW } : null) })
    expectStoreError(await failureOf(readRxPicks({ client })), READ_FAILED)
  })

  it('AC-811.2: 클라이언트를 받지 않으면 브라우저 클라이언트를 쓰고, 만들다 실패해도 같은 번호다', async () => {
    const { client } = fakeClient({ stored: [storedRow('AA100', '가짜 가', 1)] })
    supabaseBrowser.mockReturnValueOnce(client)
    await expect(readRxPicks()).resolves.toEqual([{ code: 'AA100', name: '가짜 가' }])

    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    expectStoreError(await failureOf(readRxPicks()), READ_FAILED)
  })
})

describe('AC-811.3 addRxPick', () => {
  it("AC-811.3: 본문은 검사한 code·name뿐이고 넣었으면 'added'다", async () => {
    const { client, calls } = fakeClient()
    await expect(addRxPick({ code: 'AA154', name: '가짜 주사' }, { client })).resolves.toBe('added')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'insert' })
    expect(calls[0].body).toEqual({ code: 'AA154', name: '가짜 주사' })
    expect(Object.keys(calls[0].body as object).sort()).toEqual(['code', 'name'])
  })

  it('AC-811.3: 이름이 빈 글자여도 보낸다', async () => {
    const { client, calls } = fakeClient()
    await expect(addRxPick({ code: 'AA154', name: '' }, { client })).resolves.toBe('added')
    expect(calls[0].body).toEqual({ code: 'AA154', name: '' })
  })

  it("AC-811.3: 겹침 오류(23505)면 'already'다", async () => {
    const { client } = fakeClient({ fail: () => ({ code: '23505', message: RAW }) })
    await expect(addRxPick({ code: 'aa154', name: '가짜 주사' }, { client })).resolves.toBe('already')
  })

  it.each([
    ['hospital_id를 끼워 넣음', { code: 'AA154', name: '가짜', hospital_id: 'fake-hospital' }],
    ['pick_order를 끼워 넣음', { code: 'AA154', name: '가짜', pick_order: 1 }],
    ['전화 모양 코드', { code: '010-1234-5678', name: '가짜' }],
    ['주민번호 모양 코드', { code: idLike(), name: '가짜' }],
    ['메일 모양 이름', { code: 'AA154', name: 'fake@example.com' }],
    ['제어 문자', { code: 'AA154', name: '가\n짜' }],
    ['빈 코드', { code: '', name: '가짜' }],
  ])('AC-811.3: 검사에 걸리면(%s) 보내지 않는다', async (_, pick) => {
    const { client, calls } = fakeClient()
    expectStoreError(await failureOf(addRxPick(pick as RxPick, { client })), SAVE_FAILED)
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['제약 오류', { code: '23514', message: RAW }],
    ['권한 오류', { code: '42501', message: RAW }],
    ['번호 없는 오류', { message: RAW }],
    ['예외', 'throw'],
  ] as const)('AC-811.3: 그 밖의 실패(%s)는 번호만 던지고 서버 답을 옮기지 않는다', async (_, how) => {
    const { client } = fakeClient({ fail: () => how })
    expectStoreError(await failureOf(addRxPick({ code: 'AA154', name: '가짜' }, { client })), SAVE_FAILED)
  })

  it('AC-811.3: 클라이언트를 받지 않으면 브라우저 클라이언트를 쓰고, 만들다 실패해도 같은 번호다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValueOnce(client)
    await expect(addRxPick({ code: 'AA154', name: '가짜' })).resolves.toBe('added')
    expect(calls).toHaveLength(1)

    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    expectStoreError(await failureOf(addRxPick({ code: 'AA154', name: '가짜' })), SAVE_FAILED)
  })
})

describe('AC-811.4 removeRxPick·clearRxPicks', () => {
  it('AC-811.4: removeRxPick은 받은 글자 그대로인 줄만 지우고 병원 조건을 보내지 않는다', async () => {
    const { client, calls, rows } = fakeClient({ stored: [storedRow('abC', '가짜 가', 1), storedRow('XYZ', '가짜 나', 2)] })
    await expect(removeRxPick('abC', { client })).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'delete', filters: [['eq', 'code', 'abC']] })
    expect(rows.map((row) => row.code)).toEqual(['XYZ'])
  })

  it('AC-811.4: removeRxPick은 글자를 바꾸지 않는다(대소문자가 다르면 0줄이고 성공이다)', async () => {
    const { client, calls, rows } = fakeClient({ stored: [storedRow('abC', '가짜 가', 1)] })
    await expect(removeRxPick('ABC', { client })).resolves.toBeUndefined()
    expect(calls[0].filters).toEqual([['eq', 'code', 'ABC']])
    expect(rows).toHaveLength(1)
  })

  it('AC-811.4: clearRxPicks는 내 줄 전부를 지우고 병원 조건을 보내지 않는다(조건 없는 지우기가 아니다)', async () => {
    const { client, calls, rows } = fakeClient({ stored: [storedRow('AA100', '가짜 가', 1), storedRow('BB200', '가짜 나', 2)] })
    await expect(clearRxPicks({ client })).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'delete', filters: [['gte', 'pick_order', 0]] })
    expect(rows).toHaveLength(0)
  })

  it('AC-811.4: 없는 줄을 지워도 성공이다', async () => {
    const { client, calls } = fakeClient()
    await expect(removeRxPick('AA100', { client })).resolves.toBeUndefined()
    await expect(clearRxPicks({ client })).resolves.toBeUndefined()
    expect(calls.map((call) => call.op)).toEqual(['delete', 'delete']) // 빈 표여도 실제로 보낸 답이다
  })

  it.each([
    ['오류 답', { code: '42501', message: RAW }],
    ['예외', 'throw'],
  ] as const)('AC-811.4: 실패(%s)는 AC-811.3과 같은 번호이고 서버 답을 옮기지 않는다', async (_, how) => {
    const { client } = fakeClient({ fail: () => how })
    expectStoreError(await failureOf(removeRxPick('AA100', { client })), SAVE_FAILED)
    expectStoreError(await failureOf(clearRxPicks({ client })), SAVE_FAILED)
  })

  it('AC-811.4: 클라이언트를 받지 않으면 브라우저 클라이언트를 쓰고, 만들다 실패해도 같은 번호다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValue(client)
    await removeRxPick('AA100')
    await clearRxPicks()
    expect(calls).toHaveLength(2)

    supabaseBrowser.mockReset()
    supabaseBrowser.mockImplementation(() => {
      throw new Error(RAW)
    })
    expectStoreError(await failureOf(removeRxPick('AA100')), SAVE_FAILED)
    expectStoreError(await failureOf(clearRxPicks()), SAVE_FAILED)
  })
})

describe('AC-811.6 소스 울타리', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('./rxPicks.ts', import.meta.url)), 'utf-8')
  const BANNED_WORDS = /localStorage|sessionStorage|indexedDB|console/i
  const BANNED_PATH = /(^|\/)(parsers|bridge|analytics|workers)(\/|$)/

  const importsOf = (source: string) =>
    [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1])

  it('AC-811.6: 브라우저 저장소와 console을 쓰지 않는다', () => {
    expect(BANNED_WORDS.test('window.localStorage.getItem("k")')).toBe(true) // 낱말 목록이 헛돌지 않는지
    expect(SOURCE).not.toMatch(BANNED_WORDS)
  })

  it('AC-811.6: lib/parsers·lib/bridge·workers·lib/analytics를 불러오지 않는다', () => {
    // 찾는 식이 헛돌지 않는지: 네 경로와 상대 경로·동적 불러오기를 잡고, 실제 파일의 불러오기도 찾아낸다
    const samples = [
      "import a from '@/lib/parsers/bit'",
      "import b from '../bridge/client'",
      "const c = import('@/workers/analyzeFiles')",
      "import { d } from '@/lib/analytics/dates'",
    ].join('\n')
    expect(importsOf(samples).filter((path) => BANNED_PATH.test(path))).toHaveLength(4)
    expect(importsOf(SOURCE)).toContain('@/lib/payload/validate')

    expect(importsOf(SOURCE).filter((path) => BANNED_PATH.test(path))).toEqual([])
  })
})
