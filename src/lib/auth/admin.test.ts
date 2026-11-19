import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminError, listApplications, setHospitalStatus, type Application } from './admin'

// 관리자 화면의 브라우저 → Supabase(RLS·DB 함수) 읽기·쓰기 (REQ-007, design.md '인터페이스' lib/auth/admin.ts).
// 실제 Supabase에 붙지 않는다. 어느 표·함수에 어떤 값이 몇 번 나가는지만 본다. 권한 자체는 supabase/rls.test.ts가 증명한다
const { from, select, order, rpc, supabaseBrowser } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  const supabaseBrowser = vi.fn(() => ({ from, rpc }))
  return { from, select, order, rpc, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function set_hospital_status (secret detail)'

const DB_ROWS = [
  {
    id: 'r1',
    name: '가나 정형외과의원',
    applicant_name: '홍길동',
    phone: '01000001234',
    email: 'manager@example.com',
    status: 'pending',
    created_at: '2026-10-28T01:00:00+00:00',
    emr: 'uisarang',
  },
  {
    id: 'r3',
    name: '마바 정형외과의원',
    applicant_name: '이영희',
    phone: null,
    email: 'younghee@example.com',
    status: 'approved',
    created_at: '2026-10-20T03:00:00+00:00',
    emr: 'bit',
  },
]

beforeEach(() => {
  order.mockReset()
  order.mockResolvedValue({ data: DB_ROWS, error: null, status: 200 })
  select.mockClear()
  from.mockClear()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 204 })
  supabaseBrowser.mockClear()
})

describe('listApplications(): 가입 신청 목록 읽기(브라우저 → RLS, 관리자는 전체)', () => {
  it('AC-007.1·AC-7302.4: hospitals 표에서 표에 그릴 칸(쓰는 EMR 포함)만 한 번 읽고, 신청일(created_at) 내림차순으로 받는다', async () => {
    await listApplications()
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(select).toHaveBeenCalledTimes(1)
    const columns = String((select.mock.calls[0] as unknown[])[0])
      .split(',')
      .map((c) => c.trim())
      .sort()
    expect(columns).toEqual(['applicant_name', 'created_at', 'email', 'emr', 'id', 'name', 'phone', 'status'])
    expect(order).toHaveBeenCalledExactlyOnceWith('created_at', { ascending: false })
  })

  it('AC-007.1·AC-7302.4: 받은 줄을 화면 모양(Application, 쓰는 EMR 포함)으로 바꾸고 순서는 그대로 둔다', async () => {
    const expected: Application[] = [
      {
        id: 'r1',
        name: '가나 정형외과의원',
        applicantName: '홍길동',
        phone: '01000001234',
        email: 'manager@example.com',
        status: 'pending',
        createdAt: '2026-10-28T01:00:00+00:00',
        emr: 'uisarang',
      },
      {
        id: 'r3',
        name: '마바 정형외과의원',
        applicantName: '이영희',
        phone: null,
        email: 'younghee@example.com',
        status: 'approved',
        createdAt: '2026-10-20T03:00:00+00:00',
        emr: 'bit',
      },
    ]
    await expect(listApplications()).resolves.toEqual(expected)
  })

  it.each(['bit', 'uisarang', 'egis', 'other'] as const)("AC-7302.4: 줄의 emr '%s'는 그대로 싣는다", async (emr) => {
    order.mockResolvedValue({ data: [{ ...DB_ROWS[0], emr }], error: null, status: 200 })
    const [row] = await listApplications()
    expect(row.emr).toBe(emr)
  })

  it.each([
    ['칸 없음', undefined],
    ['null', null],
    ['넷 밖의 값', 'ubcare'],
    ['대문자', 'EGIS'],
    ['숫자', 2],
  ] as const)("AC-7302.4: 줄의 emr이 %s이면 'bit'로 싣고 다른 칸은 그대로다", async (_name, emr) => {
    const raw: Record<string, unknown> = { ...DB_ROWS[0], emr }
    if (emr === undefined) delete raw.emr
    order.mockResolvedValue({ data: [raw], error: null, status: 200 })
    const [row] = await listApplications()
    expect(row.emr).toBe('bit')
    expect(row).toMatchObject({ id: 'r1', name: '가나 정형외과의원', applicantName: '홍길동', status: 'pending' })
  })

  it('AC-007.5: 신청이 하나도 없으면 빈 목록', async () => {
    order.mockResolvedValue({ data: [], error: null, status: 200 })
    await expect(listApplications()).resolves.toEqual([])
    order.mockResolvedValue({ data: null, error: null, status: 200 })
    await expect(listApplications()).resolves.toEqual([])
  })

  it('AC-007.1: 읽기 오류는 AdminError로 던진다(원래 오류 문구는 메시지에 넣지 않는다)', async () => {
    order.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    const thrown = await listApplications().catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminError)
    expect((thrown as Error).message).not.toContain('secret detail')
  })

  it('AC-007.1: 요청 자체가 던지거나 클라이언트를 만들지 못해도 AdminError', async () => {
    order.mockRejectedValue(new Error(`fetch failed ${RAW}`))
    const thrown = await listApplications().catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminError)
    expect((thrown as Error).message).not.toContain('secret detail')

    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 없음')
    })
    await expect(listApplications()).rejects.toBeInstanceOf(AdminError)
  })
})

describe('setHospitalStatus(): 신청 상태 바꾸기(브라우저 → DB 함수 set_hospital_status)', () => {
  it('AC-007.2: 승인은 set_hospital_status(id, approved)를 한 번 부른다(표를 직접 고치지 않는다)', async () => {
    await expect(setHospitalStatus('r1', 'approved')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r1', p_status: 'approved' })
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-007.3: 거절은 rejected로 바꾼다', async () => {
    await setHospitalStatus('r2', 'rejected')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r2', p_status: 'rejected' })
  })

  it('AC-007.4: 되돌리기는 pending으로 바꾼다', async () => {
    await setHospitalStatus('r4', 'pending')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r4', p_status: 'pending' })
  })

  it.each([
    ['관리자 아님', { code: '42501', message: RAW }],
    ['허용하지 않는 바꿈(바뀐 줄 없음)', { code: 'P0002', message: RAW }],
    ['로그인 풀림', { code: 'PGRST301', message: RAW }],
    ['네트워크 오류', { code: '', message: `TypeError: Failed to fetch ${RAW}` }],
  ])('AC-007.6: 함수 오류(%s)는 AdminError로 던지고 저절로 다시 부르지 않는다', async (_, error) => {
    rpc.mockResolvedValue({ data: null, error, status: 400 })
    const thrown = await setHospitalStatus('r1', 'approved').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminError)
    expect((thrown as Error).message).not.toContain('secret detail')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-007.6: 요청 자체가 던지거나 클라이언트를 만들지 못해도 AdminError', async () => {
    rpc.mockRejectedValue(new Error(`fetch failed ${RAW}`))
    const thrown = await setHospitalStatus('r1', 'approved').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminError)
    expect((thrown as Error).message).not.toContain('secret detail')

    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 없음')
    })
    await expect(setHospitalStatus('r1', 'approved')).rejects.toBeInstanceOf(AdminError)
  })

  it('AC-007.6: AdminError는 Error다', () => {
    expect(new AdminError('x')).toBeInstanceOf(Error)
  })
})
