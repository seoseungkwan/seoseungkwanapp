// 통계 처방별 추세 묶음 저장·읽기(spec treatment-trend TASK-2, REQ-1203 · AC-1203.1~AC-1203.5). 실제 Supabase에 붙지 않는다.
// 제외할 처방(exclude_codes) 읽기·저장은 spec rx-group-exclude TASK-3(REQ-2702 · AC-2702.1·AC-2702.2)이다. 그 명세가
// 읽는 칸 글자(AC-1203.1)와 저장 본문 열쇠 넷(AC-1203.2)을 다섯 칸으로 대신해서 그 기대를 고쳤다.
// 가짜 클라이언트가 어느 표·함수에 어떤 칸·본문이 나갔는지 적어 둔다. save_stats_rx_groups 자체(한 트랜잭션·권한·겹침 검사)는
// supabase/statsRxGroups.rls.test.ts·statsRxGroupsExclude.rls.test.ts가 증명한다. 이름·코드는 모두 지어낸 값이다
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatsRxGroup } from '@/types/rxGroups'
import { StatsRxGroupStoreError, listStatsRxGroups, saveStatsRxGroups } from './statsRxGroups'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

beforeEach(() => {
  supabaseBrowser.mockReset()
})

const TABLE = 'stats_rx_groups'
const SAVE_FUNCTION = 'save_stats_rx_groups'
const READ_FAILED = 'E-STATS-GROUP-READ-FAILED'
const SAVE_FAILED = 'E-STATS-GROUP-SAVE-FAILED'
const RAW = 'permission denied for table stats_rx_groups (secret detail)' // 서버 답에 섞여 온 글자. 옮겨지면 안 된다
const READ_COLUMNS = 'id,name,codes,exclude_codes,sort_order'
const SENT_KEYS = ['codes', 'exclude_codes', 'id', 'name', 'sort_order']
const GROUP_KEYS = ['codes', 'exclude', 'id', 'name', 'sortOrder']

type Client = NonNullable<NonNullable<Parameters<typeof listStatsRxGroups>[0]>['client']>
type Recorded = {
  op: 'select' | 'rpc'
  target: string
  columns?: string
  args?: unknown
  orders: [string, { ascending?: boolean } | undefined][]
}
type Reply = { data?: unknown; error?: unknown }

/** 부른 표·함수·칸을 적는 가짜 클라이언트. 병원으로 거르는 일은 RLS 몫이라 eq가 없다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Recorded) => Reply = () => ({ data: [] })) {
  const calls: Recorded[] = []
  const query = (call: Omit<Recorded, 'orders'>) => {
    const recorded: Recorded = { ...call, orders: [] }
    calls.push(recorded)
    const q = {
      order: (column: string, options?: { ascending?: boolean }) => (recorded.orders.push([column, options]), q),
      // 진짜 빌더처럼 await할 때 답한다
      then: (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(() => reply(recorded))
          .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
          .then(ok, bad),
    }
    return q
  }
  const client = {
    from: (target: string) => ({ select: (columns: string) => query({ op: 'select', target, columns }) }),
    rpc: (target: string, args: unknown) => query({ op: 'rpc', target, args }),
  }
  return { client: client as unknown as Client, calls }
}

/** 표에 있는 줄 그대로. save_stats_rx_groups는 select *라 hospital_id·updated_at까지 돌려준다. exclude_codes는 not null 기본 빈 배열이다 */
const dbRow = (id: string, name: string, codes: string[], sortOrder: number, excludeCodes: unknown = []) => ({
  id,
  hospital_id: 'fake-hospital',
  name,
  codes,
  exclude_codes: excludeCodes,
  sort_order: sortOrder,
  updated_at: '2026-11-05T00:00:00Z',
})

/** exclude_codes 칸이 아예 없는 줄(새 migration을 붙이기 전 표 흉내) */
const withoutExcludeColumn = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'exclude_codes'))

/** save_stats_rx_groups 흉내: 새 묶음에 id를 주고 표 줄을 돌려준다 */
function fakeSaveFunction() {
  let nextId = 1
  return fakeClient((call) => {
    const groups = (call.args as { groups: Record<string, unknown>[] }).groups
    return {
      data: groups.map((g) =>
        dbRow(
          (g.id as string | null) ?? `fake-group-${nextId++}`,
          g.name as string,
          g.codes as string[],
          g.sort_order as number,
          g.exclude_codes,
        ),
      ),
    }
  })
}

/** exclude를 주지 않으면 exclude 열쇠가 없는 묶음(예전 모양·제외할 처방 없음)이다 */
const group = (id: string | null, name: string, codes: string[], sortOrder: number, exclude?: string[]): StatsRxGroup =>
  exclude === undefined ? { id, name, codes, sortOrder } : { id, name, codes, exclude, sortOrder }

const failureOf = (work: Promise<unknown>) =>
  work.then(
    () => {
      throw new Error('실패해야 하는데 성공함')
    },
    (error: unknown) => error,
  )

function expectStoreError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(StatsRxGroupStoreError)
  expect((error as StatsRxGroupStoreError).name).toBe('StatsRxGroupStoreError')
  expect((error as StatsRxGroupStoreError).code).toBe(code)
  // 서버 답을 옮기지 않는다: 글에도 cause에도 남기지 않는다
  expect((error as StatsRxGroupStoreError).message).toBe(code)
  expect((error as StatsRxGroupStoreError).cause).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain('secret')
  expect(String(error)).not.toContain('secret')
}

describe('AC-1203.1·AC-2702.1 listStatsRxGroups', () => {
  // 읽는 칸 글자는 AC-2702.1이 AC-1203.1(네 칸)을 대신한다. 차례·한 번·병원으로 거르지 않음은 AC-1203.1 그대로다
  it('AC-2702.1: stats_rx_groups 표에서 id,name,codes,exclude_codes,sort_order만 sort_order 차례로 한 번 읽는다(AC-1203.1: 병원으로 거르지 않는다, RLS 몫)', async () => {
    const { client, calls } = fakeClient()
    await listStatsRxGroups({ client })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ op: 'select', target: TABLE, columns: READ_COLUMNS })
    expect(calls[0].orders.map(([column]) => column)).toEqual(['sort_order'])
    expect(calls[0].orders[0][1]?.ascending ?? true).toBe(true) // 작은 차례가 먼저
  })

  it('AC-2702.1: 받은 줄을 그 차례 그대로 StatsRxGroup({ id, name, codes, exclude, sortOrder })으로 바꾸고 다른 칸은 버린다', async () => {
    const { client } = fakeClient(() => ({
      data: [
        dbRow('fake-group-2', '가짜 묶음 가', ['AA100', 'aa200'], 0, ['ZZ900', 'zz901']),
        dbRow('fake-group-1', '가짜 묶음 나', [], 1, []),
      ],
    }))
    const groups = await listStatsRxGroups({ client })
    expect(groups).toEqual([
      { id: 'fake-group-2', name: '가짜 묶음 가', codes: ['AA100', 'aa200'], exclude: ['ZZ900', 'zz901'], sortOrder: 0 },
      { id: 'fake-group-1', name: '가짜 묶음 나', codes: [], exclude: [], sortOrder: 1 },
    ])
    for (const g of groups) expect(Object.keys(g).sort()).toEqual(GROUP_KEYS)
  })

  it('AC-2702.1: exclude_codes 칸이 없는 줄은 exclude: []다', async () => {
    const { client } = fakeClient(() => ({ data: [withoutExcludeColumn(dbRow('fake-group-1', '가짜 묶음 가', ['AA100'], 0))] }))
    const groups = await listStatsRxGroups({ client })
    expect(groups).toEqual([{ id: 'fake-group-1', name: '가짜 묶음 가', codes: ['AA100'], exclude: [], sortOrder: 0 }])
    expect(Object.keys(groups[0]).sort()).toEqual(GROUP_KEYS)
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['글자(배열 모양 글)', '{ZZ900}'],
    ['숫자', 7],
    ['객체', { 0: 'ZZ900', length: 1 }],
    ['참거짓', true],
  ])('AC-2702.1: exclude_codes가 배열이 아닌 줄(%s)은 exclude: []다', async (_, value) => {
    const { client } = fakeClient(() => ({ data: [dbRow('fake-group-1', '가짜 묶음 가', ['AA100'], 0, value)] }))
    await expect(listStatsRxGroups({ client })).resolves.toEqual([
      { id: 'fake-group-1', name: '가짜 묶음 가', codes: ['AA100'], exclude: [], sortOrder: 0 },
    ])
  })

  it('AC-2702.1: 줄마다 따로 본다 — 배열인 줄은 그 값, 아닌 줄은 빈 목록', async () => {
    const { client } = fakeClient(() => ({
      data: [
        dbRow('fake-group-1', '가짜 묶음 가', ['AA100'], 0, ['ZZ900']),
        withoutExcludeColumn(dbRow('fake-group-2', '가짜 묶음 나', ['BB200'], 1)),
        dbRow('fake-group-3', '가짜 묶음 다', ['CC300'], 2, null),
      ],
    }))
    const groups = await listStatsRxGroups({ client })
    expect(groups.map((g) => g.exclude)).toEqual([['ZZ900'], [], []])
  })

  it('AC-1203.1: 줄이 없으면 빈 목록이다', async () => {
    const { client } = fakeClient(() => ({ data: [] }))
    await expect(listStatsRxGroups({ client })).resolves.toEqual([])
  })

  it('AC-1203.1: 클라이언트를 주지 않으면 브라우저 Supabase 클라이언트로 읽는다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValue(client)
    await expect(listStatsRxGroups()).resolves.toEqual([])
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls.map((call) => [call.op, call.target])).toEqual([['select', TABLE]])
  })
})

describe('AC-1203.2·AC-2702.2 saveStatsRxGroups', () => {
  // 본문 열쇠는 AC-2702.2(다섯)가 AC-1203.2(넷)를 대신한다. 한 번 부름·받은 목록 그대로 등은 AC-1203.2 그대로다
  it('AC-1203.2: RPC save_stats_rx_groups를 한 번만 부르고 본문 열쇠는 groups 하나다(표를 따로 건드리지 않는다)', async () => {
    const { client, calls } = fakeSaveFunction()
    await saveStatsRxGroups([group('fake-group-1', '가짜 묶음 가', ['AA100'], 0)], { client })
    expect(calls.map((call) => [call.op, call.target])).toEqual([['rpc', SAVE_FUNCTION]])
    expect(Object.keys(calls[0].args as object)).toEqual(['groups'])
  })

  it('AC-2702.2: 묶음마다 id·name·codes·exclude_codes·sort_order 다섯 열쇠만 값 그대로 보낸다(묻어 온 칸·hospital_id 없음, 새 묶음 id는 null)', async () => {
    const { client, calls } = fakeSaveFunction()
    // 제안 묶음 표시나 함께 묻어 온 칸이 있어도 정해 둔 칸만 나간다
    const carrying = {
      ...group('fake-group-1', '가짜 묶음 가', ['AA100', 'aa200'], 3, ['ZZ900', 'zz901']),
      suggested: true,
      hospital_id: 'other-hospital',
      updated_at: '2020-01-01T00:00:00Z',
    }
    await saveStatsRxGroups([carrying, group(null, '가짜 묶음 나', [], 4, [])], { client })
    const sent = (calls[0].args as { groups: Record<string, unknown>[] }).groups
    expect(sent).toEqual([
      { id: 'fake-group-1', name: '가짜 묶음 가', codes: ['AA100', 'aa200'], exclude_codes: ['ZZ900', 'zz901'], sort_order: 3 },
      { id: null, name: '가짜 묶음 나', codes: [], exclude_codes: [], sort_order: 4 },
    ])
    for (const g of sent) expect(Object.keys(g).sort()).toEqual(SENT_KEYS)
    expect(JSON.stringify(calls[0].args)).not.toContain('hospital')
    expect(JSON.stringify(calls[0].args)).not.toContain('sortOrder')
    expect(JSON.stringify(calls[0].args)).not.toContain('"exclude"') // 화면 칸 이름은 나가지 않는다
  })

  it('AC-2702.2: exclude가 없는 묶음(예전 모양)도 exclude_codes는 늘 배열 []로 보낸다(열쇠를 빼지 않는다)', async () => {
    const { client, calls } = fakeSaveFunction()
    await saveStatsRxGroups([group('fake-group-1', '가짜 묶음 가', ['AA100'], 0), group(null, '가짜 묶음 나', ['BB200'], 1)], { client })
    const sent = (calls[0].args as { groups: Record<string, unknown>[] }).groups
    expect(sent).toEqual([
      { id: 'fake-group-1', name: '가짜 묶음 가', codes: ['AA100'], exclude_codes: [], sort_order: 0 },
      { id: null, name: '가짜 묶음 나', codes: ['BB200'], exclude_codes: [], sort_order: 1 },
    ])
    for (const g of sent) {
      expect(Object.keys(g).sort()).toEqual(SENT_KEYS)
      expect(Array.isArray(g.exclude_codes)).toBe(true)
    }
  })

  it('AC-2702.2: exclude_codes는 받은 exclude의 복사본이다(같은 배열을 보내지 않고, 받은 목록은 그대로다)', async () => {
    const { client, calls } = fakeSaveFunction()
    const after = [group('fake-group-1', '가짜 묶음 가', ['AA100'], 0, ['ZZ900', 'ZZ901'])]
    const before = structuredClone(after)
    await saveStatsRxGroups(after, { client })
    const sent = (calls[0].args as { groups: Record<string, unknown>[] }).groups
    expect(sent[0].exclude_codes).toEqual(['ZZ900', 'ZZ901'])
    expect(sent[0].exclude_codes).not.toBe(after[0].exclude)
    expect(sent[0].codes).not.toBe(after[0].codes)
    ;(sent[0].exclude_codes as string[]).push('ZZ999') // 보낸 배열을 고쳐도 받은 묶음은 그대로다
    expect(after).toEqual(before)
  })

  it('AC-2702.2: 돌려받은 줄을 StatsRxGroup으로 바꾼다 — 새 묶음은 DB가 준 id를 갖고 exclude는 exclude_codes 값, hospital_id·updated_at은 없다', async () => {
    const { client } = fakeSaveFunction()
    const saved = await saveStatsRxGroups(
      [group('fake-group-9', '가짜 묶음 가', ['AA100'], 0, ['ZZ900']), group(null, '가짜 묶음 나', ['BB200'], 1)],
      { client },
    )
    expect(saved).toEqual([
      { id: 'fake-group-9', name: '가짜 묶음 가', codes: ['AA100'], exclude: ['ZZ900'], sortOrder: 0 },
      { id: 'fake-group-1', name: '가짜 묶음 나', codes: ['BB200'], exclude: [], sortOrder: 1 },
    ])
    for (const g of saved) expect(Object.keys(g).sort()).toEqual(GROUP_KEYS)
  })

  it('AC-2702.2: 저장 함수가 exclude_codes가 없거나 배열이 아닌 줄을 돌려줘도 exclude: []다(읽기와 같은 규칙)', async () => {
    const { client } = fakeClient(() => ({
      data: [
        withoutExcludeColumn(dbRow('fake-group-1', '가짜 묶음 가', ['AA100'], 0)),
        dbRow('fake-group-2', '가짜 묶음 나', ['BB200'], 1, 'ZZ900'),
      ],
    }))
    const saved = await saveStatsRxGroups([group('fake-group-1', '가짜 묶음 가', ['AA100'], 0), group('fake-group-2', '가짜 묶음 나', ['BB200'], 1)], {
      client,
    })
    expect(saved.map((g) => g.exclude)).toEqual([[], []])
  })

  it('AC-1203.2: 다 지운 목록도 함수를 한 번 불러 빈 목록을 보낸다', async () => {
    const { client, calls } = fakeSaveFunction()
    await expect(saveStatsRxGroups([], { client })).resolves.toEqual([])
    expect(calls.map((call) => [call.target, call.args])).toEqual([[SAVE_FUNCTION, { groups: [] }]])
  })

  it('AC-1203.2: 받은 목록을 고치지 않는다(새 id는 돌려준 목록에만)', async () => {
    const { client } = fakeSaveFunction()
    const after = [group(null, '가짜 묶음 가', ['AA100'], 0)]
    const before = structuredClone(after)
    const saved = await saveStatsRxGroups(after, { client })
    expect(after).toEqual(before)
    expect(saved).not.toBe(after)
  })

  it('AC-2702.2: 제외할 처방이 든 목록도 고치지 않는다(새 id·exclude 기본값은 돌려준 목록에만)', async () => {
    const { client } = fakeSaveFunction()
    const after = [group(null, '가짜 묶음 가', ['AA100'], 0, ['ZZ900']), group(null, '가짜 묶음 나', ['BB200'], 1)]
    const before = structuredClone(after)
    const saved = await saveStatsRxGroups(after, { client })
    expect(after).toEqual(before)
    expect('exclude' in after[1]).toBe(false)
    expect(saved[0]).not.toBe(after[0])
    expect(saved[0].exclude).not.toBe(after[0].exclude)
  })

  it('AC-1203.2: 클라이언트를 주지 않으면 브라우저 Supabase 클라이언트로 저장한다', async () => {
    const { client, calls } = fakeSaveFunction()
    supabaseBrowser.mockReturnValue(client)
    await saveStatsRxGroups([group(null, '가짜 묶음 가', [], 0)])
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls.map((call) => [call.op, call.target])).toEqual([['rpc', SAVE_FUNCTION]])
  })
})

describe('AC-1203.3 실패는 번호 하나', () => {
  // 오류·예외·배열이 아닌 답. 오류가 빈 줄 목록과 함께 와도 성공이 아니다
  const BAD_REPLIES: [string, () => Reply][] = [
    ['오류 답', () => ({ error: { code: '42P01', message: RAW } })],
    ['오류가 빈 줄 목록과 함께 옴', () => ({ data: [], error: { message: RAW } })],
    ['오류 없이 줄 목록이 안 옴(null)', () => ({ data: null })],
    ['오류 없이 배열이 아닌 답', () => ({ data: { rows: [] } })],
    [
      '보내다 예외(네트워크)',
      () => {
        throw new Error(RAW)
      },
    ],
  ]

  it.each(BAD_REPLIES)('AC-1203.3: 읽기 — %s → 빈 목록이 아니라 E-STATS-GROUP-READ-FAILED만 던진다', async (_, reply) => {
    const { client } = fakeClient(reply)
    expectStoreError(await failureOf(listStatsRxGroups({ client })), READ_FAILED)
  })

  it.each(BAD_REPLIES)('AC-1203.3: 저장 — %s → E-STATS-GROUP-SAVE-FAILED만 던진다', async (_, reply) => {
    const { client } = fakeClient(reply)
    expectStoreError(await failureOf(saveStatsRxGroups([group(null, '가짜 묶음 가', ['AA100'], 0)], { client })), SAVE_FAILED)
  })

  it('AC-1203.3: 저장 함수의 겹침 오류(23505)도 같은 저장 번호다(서버 글을 옮기지 않는다)', async () => {
    const { client } = fakeClient(() => ({ error: { code: '23505', message: RAW } }))
    expectStoreError(await failureOf(saveStatsRxGroups([group(null, '가짜 묶음 가', ['AA100'], 0)], { client })), SAVE_FAILED)
  })

  it('AC-1203.3: 클라이언트를 만들다 실패해도 읽기는 읽기 번호, 저장은 저장 번호다', async () => {
    supabaseBrowser.mockImplementation(() => {
      throw new Error(RAW)
    })
    expectStoreError(await failureOf(listStatsRxGroups()), READ_FAILED)
    expectStoreError(await failureOf(saveStatsRxGroups([])), SAVE_FAILED)
  })

  it('AC-1203.3: 클라이언트 함수가 곧바로 던져도(빌더 만들기 실패) 번호 하나다', async () => {
    const throwing = {
      from: () => {
        throw new Error(RAW)
      },
      rpc: () => {
        throw new Error(RAW)
      },
    } as unknown as Client
    expectStoreError(await failureOf(listStatsRxGroups({ client: throwing })), READ_FAILED)
    expectStoreError(await failureOf(saveStatsRxGroups([], { client: throwing })), SAVE_FAILED)
  })

  it('AC-1203.3: 줄 목록 안에 줄이 아닌 값이 있으면 읽기 실패다(일부만 돌려주지 않는다)', async () => {
    const { client } = fakeClient(() => ({ data: [dbRow('fake-group-1', '가짜 묶음 가', [], 0), null] }))
    expectStoreError(await failureOf(listStatsRxGroups({ client })), READ_FAILED)
  })

  it.each(BAD_REPLIES)('AC-2702.2: 제외할 처방이 든 묶음 저장 — %s → 그대로 E-STATS-GROUP-SAVE-FAILED만 던진다', async (_, reply) => {
    const { client } = fakeClient(reply)
    expectStoreError(
      await failureOf(saveStatsRxGroups([group(null, '가짜 묶음 가', ['AA100'], 0, ['ZZ900'])], { client })),
      SAVE_FAILED,
    )
  })

  it('AC-1203.3: 저장이 실패해도 받은 목록은 그대로다', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    const after = [group('fake-group-1', '가짜 묶음 가', ['AA100'], 0), group(null, '가짜 묶음 나', ['BB200'], 1)]
    const before = structuredClone(after)
    await failureOf(saveStatsRxGroups(after, { client }))
    expect(after).toEqual(before)
  })
})

describe('AC-1203.5 소스 울타리(매출 묶음을 건드리지 않는다)', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('./statsRxGroups.ts', import.meta.url)), 'utf-8')
  const BARE_TABLE = /(?<!stats_)rx_groups/ // 앞에 stats_가 없는 rx_groups(매출 표, 그리고 save_rx_groups 속의 것)
  const importsOf = (source: string) =>
    [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1])

  it('AC-1203.5: 찾는 식이 헛돌지 않는다 — 매출 표·함수 이름은 잡고 통계 표·함수 이름은 잡지 않는다', () => {
    expect(BARE_TABLE.test("from('rx_groups')")).toBe(true)
    expect(BARE_TABLE.test("rpc('save_rx_groups')")).toBe(true)
    expect(BARE_TABLE.test("from('stats_rx_groups')")).toBe(false)
    expect(BARE_TABLE.test("rpc('save_stats_rx_groups')")).toBe(false)
  })

  it('AC-1203.5: 표 이름 rx_groups(앞에 stats_ 없음)와 save_rx_groups를 쓰지 않는다', () => {
    expect(SOURCE).toContain(TABLE)
    expect(SOURCE).toContain(SAVE_FUNCTION)
    expect(SOURCE).not.toMatch(BARE_TABLE)
    expect(SOURCE).not.toContain('save_rx_groups')
  })

  it('AC-1203.5: 매출 묶음 저장 코드(lib/storage/rxGroups)를 불러오지 않는다(모양 RxGroup 타입만 같이 쓴다)', () => {
    const imports = importsOf(SOURCE)
    expect(imports).toContain('@/types/rxGroups')
    expect(imports.filter((path) => /(^|\/)storage\/rxGroups$|^\.\/rxGroups$/.test(path))).toEqual([])
  })
})
