import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HospitalReadError, NotSignedInError, readMe } from './hospital.server'

// 실제 Supabase에 붙지 않는다. 사용자 확인 → hospitals·admins에서 내 줄 읽기만 흉내 낸다.
// 쓰기 메서드(insert·update·delete·upsert·rpc)도 흉내 내 두고, 하나도 부르지 않는지 본다
const { getUser, from, rpc, tables } = vi.hoisted(() => {
  function table() {
    const maybeSingle = vi.fn()
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() }
    return { select, eq, maybeSingle, writes }
  }
  const tables = { hospitals: table(), admins: table() }
  const from = vi.fn((name: string) => {
    const t = tables[name as keyof typeof tables]
    if (!t) throw new Error(`읽으면 안 되는 표: ${name}`)
    return { select: t.select, ...t.writes }
  })
  return { getUser: vi.fn(), from, rpc: vi.fn(), tables }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({ auth: { getUser }, from, rpc }) }))

const USER = { id: 'user-1', email: 'me@example.com' }
const ROW = {
  id: 'hospital-1',
  name: '가나정형외과의원',
  applicant_name: '김가나',
  phone: '0212345678',
  email: 'me@example.com',
  status: 'approved',
  created_at: '2026-10-28T01:00:00+00:00',
}

function hospitalRow(row: object | null) {
  tables.hospitals.maybeSingle.mockResolvedValue({ data: row, error: null })
}
function adminRow(row: object | null) {
  tables.admins.maybeSingle.mockResolvedValue({ data: row, error: null })
}
function columns(select: ReturnType<typeof vi.fn>): string[] {
  const arg = select.mock.calls[0]?.[0] as string
  return arg.split(',').map((c) => c.trim()).sort()
}

beforeEach(() => {
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: USER }, error: null })
  from.mockClear()
  rpc.mockClear()
  for (const t of Object.values(tables)) {
    t.select.mockClear()
    t.eq.mockClear()
    t.maybeSingle.mockReset()
    for (const w of Object.values(t.writes)) w.mockClear()
  }
  hospitalRow(null)
  adminRow(null)
})

describe('readMe(): 화면을 그리기 전(서버) 내 사용자·병원 줄·관리자 여부 읽기', () => {
  it("AC-002.2: 맨 첫 줄에서 server-only를 불러온다(서버에서만 내 병원을 읽는다)", () => {
    const source = readFileSync(fileURLToPath(new URL('./hospital.server.ts', import.meta.url)), 'utf-8')
    expect(source.split('\n')[0]).toBe("import 'server-only'")
  })

  it('AC-002.2: 병원 줄이 없으면 hospital은 null, 이메일은 확인한 사용자의 것', async () => {
    await expect(readMe()).resolves.toEqual({ email: 'me@example.com', hospital: null, isAdmin: false })
  })

  it.each([
    ['AC-002.3', 'pending'],
    ['AC-002.3', 'rejected'],
    ['AC-002.4', 'approved'],
  ] as const)('%s: %s 줄 → 정해 둔 Hospital 모양(camelCase)으로 바꿔 돌려준다', async (_, status) => {
    hospitalRow({ ...ROW, status })
    const me = await readMe()
    expect(me.hospital).toEqual({
      id: 'hospital-1',
      name: '가나정형외과의원',
      applicantName: '김가나',
      phone: '0212345678',
      email: 'me@example.com',
      status,
      createdAt: '2026-10-28T01:00:00+00:00',
    })
  })

  it('AC-002.2: 연락처가 없는 줄은 phone이 null', async () => {
    hospitalRow({ ...ROW, phone: null })
    const me = await readMe()
    expect(me.hospital?.phone).toBeNull()
  })

  // 관리자는 RLS로 모든 병원을 읽을 수 있다 → owner_id로 내 줄만 좁혀야 남의 병원 상태로 문지기를 지나지 않는다
  it('AC-002.2: hospitals에서 필요한 칸만, 내 줄(owner_id = 확인한 사용자)만 읽는다', async () => {
    await readMe()
    expect(from).toHaveBeenCalledWith('hospitals')
    expect(columns(tables.hospitals.select)).toEqual(
      ['applicant_name', 'created_at', 'email', 'id', 'name', 'phone', 'status'],
    )
    expect(tables.hospitals.eq).toHaveBeenCalledWith('owner_id', 'user-1')
    expect(tables.hospitals.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('AC-002.5: admins에 내 줄이 있으면 isAdmin = true (user_id = 확인한 사용자만 읽는다)', async () => {
    hospitalRow(ROW)
    adminRow({ user_id: 'user-1' })
    await expect(readMe()).resolves.toMatchObject({ isAdmin: true })
    expect(from).toHaveBeenCalledWith('admins')
    expect(columns(tables.admins.select)).toEqual(['user_id'])
    expect(tables.admins.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('AC-002.5: admins에 내 줄이 없으면 isAdmin = false', async () => {
    hospitalRow(ROW)
    await expect(readMe()).resolves.toMatchObject({ isAdmin: false })
  })

  it('AC-002.2: 세션과 hospitals·admins의 내 줄만 읽고, 아무것도 쓰지 않는다', async () => {
    hospitalRow(ROW)
    adminRow({ user_id: 'user-1' })
    await readMe()
    expect(from.mock.calls.map(([name]) => name).sort()).toEqual(['admins', 'hospitals'])
    for (const t of Object.values(tables)) {
      for (const w of Object.values(t.writes)) expect(w).not.toHaveBeenCalled()
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-002.2: 이메일이 없는 사용자면 빈 문자열', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    await expect(readMe()).resolves.toMatchObject({ email: '' })
  })

  it('AC-002.1: 사용자 확인이 실패하면(세션 만료 등) NotSignedInError를 던지고 표를 읽지 않는다', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('Auth session missing!') })
    await expect(readMe()).rejects.toBeInstanceOf(NotSignedInError)
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-002.1: 오류 없이 사용자가 없어도 NotSignedInError', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(readMe()).rejects.toBeInstanceOf(NotSignedInError)
    expect(from).not.toHaveBeenCalled()
  })

  // 로그인은 살아 있다 → '로그인 안 함'과 섞이면 guard가 /login으로 보내 middleware와 끝없이 주고받는다
  it.each([
    ['표 없음', 'PGRST205'],
    ['권한 없음', '42501'],
  ])('AC-002.8: hospitals 읽기가 오류를 돌려주면(%s) HospitalReadError — NotSignedInError가 아니다', async (_, code) => {
    tables.hospitals.maybeSingle.mockResolvedValue({ data: null, error: { code, message: 'db error' } })
    const thrown = await readMe().catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(HospitalReadError)
    expect(thrown).not.toBeInstanceOf(NotSignedInError)
  })

  it.each([
    ['표 없음', 'PGRST205'],
    ['권한 없음', '42501'],
  ])('AC-002.8: admins 읽기가 오류를 돌려주면(%s) HospitalReadError — 관리자 아님으로 넘기지 않는다', async (_, code) => {
    hospitalRow(ROW)
    tables.admins.maybeSingle.mockResolvedValue({ data: null, error: { code, message: 'db error' } })
    const thrown = await readMe().catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(HospitalReadError)
    expect(thrown).not.toBeInstanceOf(NotSignedInError)
  })
})
