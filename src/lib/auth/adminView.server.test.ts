import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminViewReadError, readAdminView } from './adminView.server'

// 앱 틀이 그리기 전(서버) 이 브라우저에서 보는 의원 읽기 (admin-view REQ-8004 AC-8004.5, design.md '보기 열쇠 · 브라우저 쓰기 막기', ADR-046).
// 실제 Supabase에 붙지 않는다. 요청 쿠키(next/headers)와 rpc('my_admin_view') 한 번만 흉내 낸다.
// 표 읽기·쓰기(from)도 흉내 내 두고, 부르지 않는지 본다
const { cookies, store, rpc, from, supabaseServer } = vi.hoisted(() => {
  const store = { get: vi.fn() }
  const cookies = vi.fn(async () => store)
  const rpc = vi.fn()
  const from = vi.fn()
  const supabaseServer = vi.fn(async () => ({ rpc, from }))
  return { cookies, store, rpc, from, supabaseServer }
})
vi.mock('next/headers', () => ({ cookies }))
vi.mock('@/lib/supabase/server', () => ({ supabaseServer }))

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e'
const HB = '11111111-2222-4333-8444-555555555555'
const RAW = 'permission denied for function my_admin_view (secret detail)' // 서버 답에 섞여 온 글자. 메시지로 옮겨지면 안 된다

function viewCookie(value: string | undefined) {
  store.get.mockImplementation((name: string) => (name === 'ssk_view' && value !== undefined ? { name, value } : undefined))
}

function reply(data: unknown, error: unknown = null) {
  rpc.mockResolvedValue({ data, error, status: error ? 400 : 200 })
}

async function caught(): Promise<AdminViewReadError> {
  const thrown = await readAdminView().catch((error: unknown) => error)
  expect(thrown).toBeInstanceOf(AdminViewReadError)
  return thrown as AdminViewReadError
}

/** 메시지·글자 모양에 원래 오류 글이 없다 */
function expectClean(error: Error) {
  for (const shown of [error.message, String(error)]) {
    expect(shown).not.toContain(RAW)
    expect(shown).not.toContain('secret detail')
  }
}

beforeEach(() => {
  cookies.mockClear()
  cookies.mockImplementation(async () => store)
  store.get.mockReset()
  rpc.mockReset()
  from.mockReset()
  supabaseServer.mockClear()
  supabaseServer.mockImplementation(async () => ({ rpc, from }))
  viewCookie(KEY)
  reply([{ hospital_id: HB, name: '가짜정형외과의원' }])
})

describe('AC-8004.5 readAdminView — 서버에서 보는 의원 읽기', () => {
  it('AC-8004.5: 맨 첫 줄에서 server-only를 불러온다(서버에서만 읽는다)', () => {
    const source = readFileSync(fileURLToPath(new URL('./adminView.server.ts', import.meta.url)), 'utf-8')
    expect(source.split('\n')[0]).toBe("import 'server-only'")
  })

  it.each([
    ['쿠키 없음', undefined],
    ['값 비었음', ''],
    ['uuid 모양 아님', 'not-a-uuid'],
  ])('AC-8004.5: 보기 쿠키가 없으면(%s) DB를 부르지 않고 null이다', async (_, value) => {
    viewCookie(value)
    await expect(readAdminView()).resolves.toBeNull()
    expect(store.get).toHaveBeenCalledWith('ssk_view')
    expect(supabaseServer).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("AC-8004.5: 보기 쿠키가 있으면 rpc('my_admin_view')를 인자 없이 한 번만 부르고 한 줄을 { hospitalId, name }으로 준다", async () => {
    await expect(readAdminView()).resolves.toEqual({ hospitalId: HB, name: '가짜정형외과의원' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('my_admin_view')
  })

  it('AC-8004.5: 대문자 열쇠 쿠키도 보기 쿠키로 본다', async () => {
    viewCookie(KEY.toUpperCase())
    await expect(readAdminView()).resolves.toEqual({ hospitalId: HB, name: '가짜정형외과의원' })
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('AC-8004.5: 표를 읽거나 쓰지 않는다(from 안 부름)', async () => {
    await readAdminView()
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8004.5: 빈 목록이면(남의·끝난·12시간 지난 열쇠 등) null이다', async () => {
    reply([])
    await expect(readAdminView()).resolves.toBeNull()
  })

  it.each([
    ['권한 없음', '42501'],
    ['함수 없음(SQL을 붙여 넣기 전)', 'PGRST202'],
  ])('AC-8004.5: 답이 오류이면(%s) AdminViewReadError이고 메시지에 원래 글이 없다(원래 오류는 cause에만)', async (_, code) => {
    const error = { code, message: RAW }
    reply(null, error)
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(error)
  })

  it('AC-8004.5: rpc가 던지면 AdminViewReadError다', async () => {
    const cause = new Error(RAW)
    rpc.mockRejectedValue(cause)
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
  })

  it('AC-8004.5: 클라이언트 만들기가 던져도 AdminViewReadError다', async () => {
    const cause = new Error(RAW)
    supabaseServer.mockImplementation(async () => {
      throw cause
    })
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-8004.5: 요청 쿠키 읽기가 던져도 AdminViewReadError다', async () => {
    const cause = new Error(RAW)
    cookies.mockImplementation(async () => {
      throw cause
    })
    const thrown = await caught()
    expectClean(thrown)
    expect(thrown.cause).toBe(cause)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['목록 아님', { hospital_id: HB, name: '가짜정형외과의원' }],
    ['두 줄', [{ hospital_id: HB, name: '가짜정형외과의원' }, { hospital_id: KEY, name: '가짜의원' }]],
    ['병원 id 없음', [{ name: '가짜정형외과의원' }]],
    ['병원 id 빈 글', [{ hospital_id: '', name: '가짜정형외과의원' }]],
    ['병원 id 숫자', [{ hospital_id: 7, name: '가짜정형외과의원' }]],
    ['이름 없음', [{ hospital_id: HB }]],
    ['이름 null', [{ hospital_id: HB, name: null }]],
    ['이름 숫자', [{ hospital_id: HB, name: 7 }]],
    ['줄이 객체 아님', ['가짜정형외과의원']],
  ])('AC-8004.5: 답 모양이 틀리면(%s) 내 의원으로 넘기지 않고 AdminViewReadError다', async (_, data) => {
    reply(data)
    const thrown = await caught()
    expectClean(thrown)
  })
})
