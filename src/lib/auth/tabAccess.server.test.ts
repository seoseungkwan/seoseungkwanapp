import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TabAccessReadError, readTabAccessRows } from './tabAccess.server'

// 앱 틀이 그리기 전(서버) 탭 목록 표 읽기 (multi-admin REQ-7706 AC-7706.2, design.md '탭 목록 함수', ADR-042).
// 실제 Supabase에 붙지 않는다. tab_access를 한 번 읽는 것만 흉내 낸다.
// 쓰기 메서드(insert·update·delete·upsert)와 rpc도 흉내 내 두고, 하나도 부르지 않는지 본다
const { from, select, rpc, writes, supabaseServer } = vi.hoisted(() => {
  const select = vi.fn()
  const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() }
  const from = vi.fn((name: string) => {
    if (name !== 'tab_access') throw new Error(`읽으면 안 되는 표: ${name}`)
    return { select, ...writes }
  })
  const rpc = vi.fn()
  const supabaseServer = vi.fn(async () => ({ from, rpc }))
  return { from, select, rpc, writes, supabaseServer }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer }))

const RAW = 'permission denied for table tab_access (secret detail)' // 서버 답에 섞여 온 글자. 메시지로 옮겨지면 안 된다

const SEED = [
  { path: '/stats', admin_only: false },
  { path: '/staff', admin_only: true },
  { path: '/new-tab', admin_only: true },
]

function reply(data: unknown, error: unknown = null) {
  select.mockResolvedValue({ data, error, status: error ? 400 : 200 })
}

async function caught(): Promise<TabAccessReadError> {
  const thrown = await readTabAccessRows().catch((error: unknown) => error)
  expect(thrown).toBeInstanceOf(TabAccessReadError)
  return thrown as TabAccessReadError
}

/** 메시지·글자 모양에 원래 오류 글이 없다 */
function expectClean(error: Error) {
  for (const shown of [error.message, String(error)]) {
    expect(shown).not.toContain(RAW)
    expect(shown).not.toContain('secret detail')
  }
}

beforeEach(() => {
  from.mockClear()
  select.mockReset()
  rpc.mockReset()
  for (const w of Object.values(writes)) w.mockClear()
  supabaseServer.mockClear()
  supabaseServer.mockImplementation(async () => ({ from, rpc }))
  reply(SEED)
})

describe('AC-7706.2 readTabAccessRows — 서버에서 tab_access 읽기', () => {
  it("AC-7706.2: 맨 첫 줄에서 server-only를 불러온다(서버에서만 읽는다)", () => {
    const source = readFileSync(fileURLToPath(new URL('./tabAccess.server.ts', import.meta.url)), 'utf-8')
    expect(source.split('\n')[0]).toBe("import 'server-only'")
  })

  it("AC-7706.2: from('tab_access').select('path, admin_only')를 한 번만 부르고 줄을 { path, adminOnly }로 받은 차례대로 돌려준다", async () => {
    await expect(readTabAccessRows()).resolves.toEqual([
      { path: '/stats', adminOnly: false },
      { path: '/staff', adminOnly: true },
      { path: '/new-tab', adminOnly: true },
    ])
    expect(from).toHaveBeenCalledExactlyOnceWith('tab_access')
    expect(select).toHaveBeenCalledExactlyOnceWith('path, admin_only')
  })

  it('AC-7706.2: 아무것도 쓰지 않고 함수(rpc)도 부르지 않는다', async () => {
    await readTabAccessRows()
    for (const w of Object.values(writes)) expect(w).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-7706.2: 줄이 하나도 없으면 빈 목록이다(숨길 탭 계산은 adminOnlyTabs 몫)', async () => {
    reply([])
    await expect(readTabAccessRows()).resolves.toEqual([])
  })

  it.each([
    ['표 없음(SQL을 붙여 넣기 전)', 'PGRST205'],
    ['권한 없음', '42501'],
  ])('AC-7706.2: 답이 오류이면(%s) TabAccessReadError이고 메시지에 원래 글이 없다(원래 오류는 cause에만)', async (_, code) => {
    const error = { code, message: RAW }
    reply(null, error)
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(error)
  })

  it('AC-7706.2: 읽기가 던지면 TabAccessReadError이고 메시지에 원래 글이 없다', async () => {
    const cause = new Error(RAW)
    select.mockRejectedValue(cause)
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
  })

  it('AC-7706.2: 클라이언트 만들기가 던져도 TabAccessReadError다', async () => {
    const cause = new Error(RAW)
    supabaseServer.mockImplementation(async () => {
      throw cause
    })
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['목록 아님', { path: '/stats', admin_only: false }],
    ['줄 모양 틀림', [{ path: '/stats', admin_only: false }, { path: '/claim', admin_only: 'yes' }]],
    ['칸 없음', [{ path: '/stats' }]],
  ])('AC-7706.2: 답 모양이 틀리면(%s) 숨김 없음으로 넘기지 않고 TabAccessReadError다(막는 쪽)', async (_, data) => {
    reply(data)
    const thrown = await caught()
    expectClean(thrown)
  })
})
