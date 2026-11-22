import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TabAccessError, readTabAccess, readTabOwner, saveTabAccess } from './tabAccess'

// 설정 '관리자만 보는 탭' 칸의 브라우저 → Supabase 읽기·저장 (multi-admin REQ-7707 AC-7707.1, design.md '탭 목록 함수').
// 실제 Supabase에 붙지 않는다. 어느 표·함수에 어떤 값이 몇 번 나가는지만 본다.
// 권한 자체(주 관리자만 저장, 로그인한 사람 모두 읽기)는 supabase/multiAdmin.rls.test.ts가 증명한다
const { from, tables, rpc, supabaseBrowser } = vi.hoisted(() => {
  function table() {
    const maybeSingle = vi.fn()
    // select()의 답은 그대로 await하면 목록 읽기(tab_access), .maybeSingle()을 붙이면 한 줄 읽기(admins)
    const select = vi.fn(() => ({ maybeSingle, then: (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => list().then(ok, bad) }))
    const list = vi.fn()
    const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() }
    return { select, maybeSingle, list, writes }
  }
  const tables = { admins: table(), tab_access: table() }
  const from = vi.fn((name: string) => {
    const t = tables[name as keyof typeof tables]
    if (!t) throw new Error(`읽으면 안 되는 표: ${name}`)
    return { select: t.select, ...t.writes }
  })
  const rpc = vi.fn()
  const supabaseBrowser = vi.fn(() => ({ from, rpc }))
  return { from, tables, rpc, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function set_tab_access (secret detail)' // 서버 답에 섞여 온 글자. 메시지로 옮겨지면 안 된다

function ownerReply(data: unknown, error: unknown = null) {
  tables.admins.maybeSingle.mockResolvedValue({ data, error, status: error ? 400 : 200 })
}
function listReply(data: unknown, error: unknown = null) {
  tables.tab_access.list.mockResolvedValue({ data, error, status: error ? 400 : 200 })
}
function saveReply(error: unknown = null) {
  rpc.mockResolvedValue({ data: null, error, status: error ? 400 : 204 })
}

async function caught(run: () => Promise<unknown>): Promise<TabAccessError> {
  const thrown = await run().catch((error: unknown) => error)
  expect(thrown).toBeInstanceOf(TabAccessError)
  return thrown as TabAccessError
}

/** 메시지·글자 모양에 원래 오류 글이 없다 */
function expectClean(error: Error) {
  for (const shown of [error.message, String(error)]) {
    expect(shown).not.toContain(RAW)
    expect(shown).not.toContain('secret detail')
  }
}

function expectNoWrites() {
  for (const t of Object.values(tables)) for (const w of Object.values(t.writes)) expect(w).not.toHaveBeenCalled()
}

beforeEach(() => {
  from.mockClear()
  for (const t of Object.values(tables)) {
    t.select.mockClear()
    t.maybeSingle.mockReset()
    t.list.mockReset()
    for (const w of Object.values(t.writes)) w.mockClear()
  }
  rpc.mockReset()
  supabaseBrowser.mockClear()
  supabaseBrowser.mockImplementation(() => ({ from, rpc }))
  ownerReply(null)
  listReply([])
  saveReply()
})

describe('AC-7707.1 readTabOwner — 내가 주 관리자인가', () => {
  it("AC-7707.1: from('admins').select('is_owner').maybeSingle()을 한 번만 부르고 is_owner 참이면 참이다", async () => {
    ownerReply({ is_owner: true })
    await expect(readTabOwner()).resolves.toBe(true)
    expect(from).toHaveBeenCalledExactlyOnceWith('admins')
    expect(tables.admins.select).toHaveBeenCalledExactlyOnceWith('is_owner')
    expect(tables.admins.maybeSingle).toHaveBeenCalledTimes(1)
    expectNoWrites()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-7707.1: 내 관리자 줄의 is_owner가 거짓이면 거짓이다(주 관리자가 아닌 관리자)', async () => {
    ownerReply({ is_owner: false })
    await expect(readTabOwner()).resolves.toBe(false)
  })

  it('AC-7707.1: 내 관리자 줄이 없으면 거짓이다(관리자가 아닌 원장·데스크 — RLS가 내 줄만 준다)', async () => {
    ownerReply(null)
    await expect(readTabOwner()).resolves.toBe(false)
  })

  it.each([
    ['칸 없음(SQL을 붙여 넣기 전)', 'PGRST204'],
    ['권한 없음', '42501'],
  ])('AC-7707.1: 답이 오류이면(%s) TabAccessError이고 메시지에 원래 글이 없다(원래 오류는 cause에만)', async (_, code) => {
    const error = { code, message: RAW }
    ownerReply(null, error)
    const thrown = await caught(readTabOwner)
    expectClean(thrown)
    expect(thrown.cause).toBe(error)
  })

  it('AC-7707.1: 읽기가 던지면 TabAccessError다', async () => {
    const cause = new Error(RAW)
    tables.admins.maybeSingle.mockRejectedValue(cause)
    const thrown = await caught(readTabOwner)
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
  })

  it.each([
    ['is_owner 없음', {}],
    ['is_owner가 글자', { is_owner: 'true' }],
    ['is_owner가 숫자', { is_owner: 1 }],
    ['is_owner가 null', { is_owner: null }],
    ['줄이 목록', [{ is_owner: true }]],
    ['줄이 글자', 'owner'],
  ])('AC-7707.1: 답 모양이 틀리면(%s) 주 관리자로 보지 않고 TabAccessError다', async (_, data) => {
    ownerReply(data)
    await caught(readTabOwner)
  })
})

describe('AC-7707.1 readTabAccess — 탭 목록 읽기', () => {
  it("AC-7707.1: from('tab_access').select('path, admin_only')를 한 번만 부르고 toTabAccessRows의 줄을 돌려준다", async () => {
    listReply([
      { path: '/stats', admin_only: false },
      { path: '/staff', admin_only: true },
    ])
    await expect(readTabAccess()).resolves.toEqual([
      { path: '/stats', adminOnly: false },
      { path: '/staff', adminOnly: true },
    ])
    expect(from).toHaveBeenCalledExactlyOnceWith('tab_access')
    expect(tables.tab_access.select).toHaveBeenCalledExactlyOnceWith('path, admin_only')
    expect(tables.tab_access.list).toHaveBeenCalledTimes(1)
    expect(tables.tab_access.maybeSingle).not.toHaveBeenCalled()
    expectNoWrites()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-7707.1: 줄이 하나도 없으면 빈 목록이다', async () => {
    listReply([])
    await expect(readTabAccess()).resolves.toEqual([])
  })

  it.each([
    ['표 없음(SQL을 붙여 넣기 전)', 'PGRST205'],
    ['권한 없음', '42501'],
  ])('AC-7707.1: 답이 오류이면(%s) TabAccessError이고 메시지에 원래 글이 없다(원래 오류는 cause에만)', async (_, code) => {
    const error = { code, message: RAW }
    listReply(null, error)
    const thrown = await caught(readTabAccess)
    expectClean(thrown)
    expect(thrown.cause).toBe(error)
  })

  it('AC-7707.1: 읽기가 던지면 TabAccessError다', async () => {
    const cause = new Error(RAW)
    tables.tab_access.list.mockRejectedValue(cause)
    const thrown = await caught(readTabAccess)
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
  })

  it.each([
    ['null', null],
    ['목록 아님', { path: '/stats', admin_only: false }],
    ['줄 모양 틀림', [{ path: '/stats', admin_only: false }, { path: '/claim' }]],
  ])('AC-7707.1: 답 모양이 틀리면(%s) 빈 목록으로 보이지 않고 TabAccessError다', async (_, data) => {
    listReply(data)
    await caught(readTabAccess)
  })
})

describe('AC-7707.1 saveTabAccess — 탭 목록 저장', () => {
  it("AC-7707.1: rpc('set_tab_access', { p_admin_only, p_everyone })를 한 번만 부르고 표(from)는 쓰지 않는다", async () => {
    await expect(saveTabAccess(['/staff', '/inventory'], ['/stats', '/claim'])).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_tab_access', {
      p_admin_only: ['/staff', '/inventory'],
      p_everyone: ['/stats', '/claim'],
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-7707.1: 한쪽이 비어도 빈 목록 그대로 보낸다', async () => {
    await saveTabAccess([], ['/stats'])
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_tab_access', { p_admin_only: [], p_everyone: ['/stats'] })
  })

  it.each([
    ['주 관리자 아님', '42501'],
    ['틀린 인자', '22023'],
    ['함수 없음(SQL을 붙여 넣기 전)', 'PGRST202'],
  ])('AC-7707.1: 답이 오류이면(%s) TabAccessError(원래 글은 cause에만)이고 저절로 다시 부르지 않는다', async (_, code) => {
    const error = { code, message: RAW }
    saveReply(error)
    const thrown = await caught(() => saveTabAccess(['/staff'], ['/stats']))
    expectClean(thrown)
    expect(thrown.cause).toBe(error)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-7707.1: 부르기가 던지면 TabAccessError이고 저절로 다시 부르지 않는다', async () => {
    const cause = new Error(RAW)
    rpc.mockRejectedValue(cause)
    const thrown = await caught(() => saveTabAccess(['/staff'], ['/stats']))
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7707.1 클라이언트 만들기 실패', () => {
  it.each([
    ['readTabOwner', () => readTabOwner()],
    ['readTabAccess', () => readTabAccess()],
    ['saveTabAccess', () => saveTabAccess(['/staff'], ['/stats'])],
  ])('AC-7707.1: %s — supabaseBrowser()가 던지면 TabAccessError이고 메시지에 원래 글이 없다', async (_, run) => {
    const cause = new Error(RAW)
    supabaseBrowser.mockImplementation(() => {
      throw cause
    })
    const thrown = await caught(run)
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
