// 치료 묶음 저장·읽기(TASK-13, REQ-013 · AC-013.1~AC-013.3). 실제 Supabase에 붙지 않는다.
// 어느 표·함수에 어떤 칸이 나가는지만 본다. save_rx_groups 자체(한 트랜잭션·권한)는 supabase/revenue.rls.test.ts가 증명한다. 이름·코드는 모두 가짜다
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { suggestGroups } from '@/lib/revenue/treatments'
import type { RxGroup } from '@/types/rxGroups'
import { createRxGroupStore, RxGroupStoreError } from './rxGroups'

type Recorded = {
  op: 'select' | 'rpc'
  target: string
  columns?: string
  args?: { groups: Record<string, unknown>[] }
  orders: string[]
}
type Reply = { data?: unknown; error?: unknown }

const SAVE_FAILED = 'E-REVENUE-GROUP-SAVE-FAILED'
const LOAD_FAILED = 'E-REVENUE-GROUP-LOAD-FAILED'
const RAW = 'duplicate key value violates unique constraint (secret detail)'
const SENT_COLUMNS = ['codes', 'id', 'name', 'sort_order']

/** 부른 표·함수·칸을 기록하는 가짜 클라이언트. 병원으로 거르는 일은 RLS 몫이라 eq가 없다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Recorded) => Reply = () => ({ data: [] })) {
  const calls: Recorded[] = []
  const query = (call: Omit<Recorded, 'orders'>) => {
    const recorded: Recorded = { ...call, orders: [] }
    calls.push(recorded)
    const q = {
      order: (column: string) => (recorded.orders.push(column), q),
      then: (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(() => reply(recorded))
          .then((r) => ({ data: r.data ?? null, error: r.error ?? null }))
          .then(ok, bad),
    }
    return q
  }
  const client = {
    from: (target: string) => ({ select: (columns: string) => query({ op: 'select', target, columns }) }),
    rpc: (target: string, args: Recorded['args']) => query({ op: 'rpc', target, args }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

/** 표에 있는 줄 그대로. save_rx_groups는 select *라 hospital_id·updated_at까지 돌려준다 */
const dbRow = (id: unknown, name: unknown, codes: unknown, sortOrder: unknown) => ({
  id,
  hospital_id: 'hospital-1',
  name,
  codes,
  sort_order: sortOrder,
  updated_at: '2026-11-01T00:00:00Z',
})

/** save_rx_groups 흉내. 실패한 호출은 표를 바꾸지 않고(한 트랜잭션), 되면 새 묶음에 id를 주고 표 줄을 돌려준다 */
function fakeSaveFunction(failures = 0) {
  let table: Record<string, unknown>[] = []
  let left = failures
  let nextId = 1
  const fake = fakeClient((call) => {
    if (left > 0) {
      left -= 1
      return { error: { message: RAW } }
    }
    table = (call.args?.groups ?? []).map((g) => dbRow(g.id ?? `group-${nextId++}`, g.name, g.codes, g.sort_order))
    return { data: table }
  })
  return { ...fake, rows: () => table }
}

const group = (id: string | null, name: string, codes: string[], sortOrder: number): RxGroup => ({ id, name, codes, sortOrder })

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (e) {
    return e
  }
  throw new Error('던져야 하는데 던지지 않았어요')
}

function expectFailure(error: unknown, code: string) {
  expect(error).toBeInstanceOf(RxGroupStoreError)
  expect((error as RxGroupStoreError).code).toBe(code)
  // Supabase 오류 내용은 버린다: 글에도 cause에도 남기지 않는다
  expect((error as RxGroupStoreError).message).toBe(code)
  expect((error as RxGroupStoreError).cause).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain('secret detail')
}

describe('AC-013.1 listGroups', () => {
  it('AC-013.1 rx_groups 표에서 네 칸만 sort_order 순으로 한 번 읽는다(병원으로 거르지 않는다, RLS 몫)', async () => {
    const { client, calls } = fakeClient()
    await createRxGroupStore(client).listGroups()
    expect(calls).toEqual([{ op: 'select', target: 'rx_groups', columns: 'id,name,codes,sort_order', orders: ['sort_order'] }])
  })

  it('AC-013.1 줄을 받은 순서 그대로 RxGroup 모양으로 바꾼다(sort_order → sortOrder)', async () => {
    const { client } = fakeClient(() => ({
      data: [
        { id: 'group-2', name: '가짜 묶음 가', codes: ['AA100', 'AA200'], sort_order: 0 },
        { id: 'group-1', name: '가짜 묶음 나', codes: [], sort_order: 1 },
      ],
    }))
    await expect(createRxGroupStore(client).listGroups()).resolves.toEqual([
      { id: 'group-2', name: '가짜 묶음 가', codes: ['AA100', 'AA200'], sortOrder: 0 },
      { id: 'group-1', name: '가짜 묶음 나', codes: [], sortOrder: 1 },
    ])
  })

  it('AC-013.1 줄이 없으면 빈 목록이다', async () => {
    const { client } = fakeClient(() => ({ data: [] }))
    await expect(createRxGroupStore(client).listGroups()).resolves.toEqual([])
  })

  it('AC-013.1 읽기 오류는 빈 목록이 아니라 E-REVENUE-GROUP-LOAD-FAILED를 던진다', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    expectFailure(await failure(() => createRxGroupStore(client).listGroups()), LOAD_FAILED)
  })

  it('AC-013.1 오류가 빈 줄 목록과 함께 와도 빈 목록이 아니라 E-REVENUE-GROUP-LOAD-FAILED를 던진다', async () => {
    const { client } = fakeClient(() => ({ data: [], error: { message: RAW } }))
    expectFailure(await failure(() => createRxGroupStore(client).listGroups()), LOAD_FAILED)
  })

  it('AC-013.1 오류 없이 줄 목록이 안 와도 빈 목록으로 바꾸지 않는다', async () => {
    const { client } = fakeClient(() => ({ data: null }))
    expectFailure(await failure(() => createRxGroupStore(client).listGroups()), LOAD_FAILED)
  })

  it('AC-013.1 읽다가 예외가 나도(네트워크) 같은 번호만 던지고 글을 버린다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRxGroupStore(client).listGroups()), LOAD_FAILED)
  })
})

describe('AC-013.2 saveGroups', () => {
  it('AC-013.2 save_rx_groups 함수를 한 번만 부르고 표를 따로 건드리지 않는다', async () => {
    const { client, calls } = fakeSaveFunction()
    await createRxGroupStore(client).saveGroups([group('group-1', '가짜 묶음 가', ['AA100'], 0)])
    expect(calls.map((call) => [call.op, call.target])).toEqual([['rpc', 'save_rx_groups']])
    expect(Object.keys(calls[0].args ?? {})).toEqual(['groups'])
  })

  it('AC-013.2 보내는 칸은 id·name·codes·sort_order뿐이고 값이 맞다(칸 이름 비교)', async () => {
    const { client, calls } = fakeSaveFunction()
    // 제안 묶음의 suggested나 함께 묻어 온 칸이 있어도 정해 둔 칸만 나간다
    const carrying = {
      ...group('group-1', '가짜 묶음 가', ['AA100', 'AA200'], 3),
      suggested: true,
      hospital_id: 'hospital-2',
      updated_at: '2020-01-01T00:00:00Z',
      amount: 3500,
    }
    await createRxGroupStore(client).saveGroups([carrying, group(null, '가짜 묶음 나', [], 4)])
    expect(calls[0].args?.groups).toEqual([
      { id: 'group-1', name: '가짜 묶음 가', codes: ['AA100', 'AA200'], sort_order: 3 },
      { id: null, name: '가짜 묶음 나', codes: [], sort_order: 4 },
    ])
    for (const sent of calls[0].args?.groups ?? []) expect(Object.keys(sent).sort()).toEqual(SENT_COLUMNS)
  })

  it('AC-013.2 돌려받은 줄을 RxGroup으로 바꾼다: 새 묶음은 DB가 준 id를 갖고 hospital_id·updated_at은 없다', async () => {
    const { client } = fakeSaveFunction()
    const saved = await createRxGroupStore(client).saveGroups([group(null, '가짜 묶음 가', ['AA100'], 0)])
    expect(saved).toEqual([{ id: 'group-1', name: '가짜 묶음 가', codes: ['AA100'], sortOrder: 0 }])
  })

  it('AC-013.2 다 지운 목록도 함수를 한 번 불러 빈 목록을 보낸다', async () => {
    const { client, calls } = fakeSaveFunction()
    await expect(createRxGroupStore(client).saveGroups([])).resolves.toEqual([])
    expect(calls.map((call) => call.args)).toEqual([{ groups: [] }])
  })

  it('AC-013.2 제안 묶음 다섯 개(id 없음)를 처음 저장하면 다섯 개 모두 들어간다', async () => {
    const { client, calls, rows } = fakeSaveFunction()
    const proposed = suggestGroups([])
    const saved = await createRxGroupStore(client).saveGroups(proposed)
    expect(calls).toHaveLength(1)
    expect(rows()).toHaveLength(5)
    expect(saved.map((g) => g.name)).toEqual(proposed.map((g) => g.name))
    expect(saved.map((g) => g.sortOrder)).toEqual([0, 1, 2, 3, 4])
    expect(new Set(saved.map((g) => g.id)).size).toBe(5)
    expect(saved.every((g) => g.id !== null)).toBe(true)
  })

  it('AC-013.2 첫 호출이 실패해도 같은 목록으로 다시 부르면 다섯 개 모두 들어간다(반쪽 저장 없음)', async () => {
    const { client, calls, rows } = fakeSaveFunction(1)
    const store = createRxGroupStore(client)
    const proposed = suggestGroups([])
    expectFailure(await failure(() => store.saveGroups(proposed)), SAVE_FAILED)
    expect(rows()).toEqual([])
    const saved = await store.saveGroups(proposed)
    expect(saved).toHaveLength(5)
    expect(rows()).toHaveLength(5)
    expect(calls).toHaveLength(2)
    expect(calls[1].args).toEqual(calls[0].args)
  })
})

describe('AC-013.3 실패', () => {
  it('AC-013.3 저장 오류(이름 겹침 포함)는 E-REVENUE-GROUP-SAVE-FAILED만 던지고 글을 버린다', async () => {
    const { client } = fakeClient(() => ({ error: { code: '23505', message: RAW } }))
    expectFailure(await failure(() => createRxGroupStore(client).saveGroups([group(null, '가짜 묶음 가', [], 0)])), SAVE_FAILED)
  })

  it('AC-013.3 저장 오류가 빈 줄 목록과 함께 와도 저장된 것으로 보지 않고 E-REVENUE-GROUP-SAVE-FAILED를 던진다', async () => {
    const { client } = fakeClient(() => ({ data: [], error: { message: RAW } }))
    expectFailure(await failure(() => createRxGroupStore(client).saveGroups([group(null, '가짜 묶음 가', [], 0)])), SAVE_FAILED)
  })

  it('AC-013.3 저장하다 예외가 나도(네트워크) 같은 번호만 던진다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRxGroupStore(client).saveGroups([group(null, '가짜 묶음 가', [], 0)])), SAVE_FAILED)
  })

  it('AC-013.3 오류 없이 줄 목록이 안 와도 저장 실패다', async () => {
    const { client } = fakeClient(() => ({ data: null }))
    expectFailure(await failure(() => createRxGroupStore(client).saveGroups([group(null, '가짜 묶음 가', [], 0)])), SAVE_FAILED)
  })

  it('AC-013.3 실패해도 받은 목록은 그대로다', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    const after = [group('group-1', '가짜 묶음 가', ['AA100'], 0), group(null, '가짜 묶음 나', ['AA200'], 1)]
    const before = structuredClone(after)
    await failure(() => createRxGroupStore(client).saveGroups(after))
    expect(after).toEqual(before)
  })

  it('AC-013.3 저장이 되어도 받은 목록을 고치지 않는다(새 id는 돌려준 목록에만)', async () => {
    const { client } = fakeSaveFunction()
    const after = [group(null, '가짜 묶음 가', ['AA100'], 0)]
    const before = structuredClone(after)
    const saved = await createRxGroupStore(client).saveGroups(after)
    expect(after).toEqual(before)
    expect(saved).not.toBe(after)
  })
})
