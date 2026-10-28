import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignupError, submitSignup } from './hospital'
import type { SignupValue } from './signup'

// 실제 Supabase에 붙지 않는다. 어떤 표에 어떤 값이 몇 번 나가는지만 본다
const { from, insert, supabaseBrowser } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  const supabaseBrowser = vi.fn(() => ({ from }))
  return { from, insert, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const VALUE: SignupValue = { name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678' }
const RAW = 'new row violates check constraint "hospitals_name_check" (secret detail)'

beforeEach(() => {
  insert.mockReset()
  insert.mockResolvedValue({ data: null, error: null, status: 201 })
  from.mockClear()
  supabaseBrowser.mockClear()
})

describe('submitSignup(): 가입 신청 넣기(브라우저 → RLS)', () => {
  it('AC-004.3: hospitals에 name·applicant_name·phone만 한 번 넣는다', async () => {
    await expect(submitSignup(VALUE)).resolves.toBeUndefined()
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678' })
  })

  it('AC-004.3: 연락처가 없으면 phone은 null로 넣는다', async () => {
    await submitSignup({ ...VALUE, phone: null })
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: null })
  })

  it('AC-004.3: 값에 다른 칸이 섞여 와도 세 칸만 보낸다(소유자·이메일·상태는 DB 기본값)', async () => {
    const tampered = { ...VALUE, status: 'approved', owner_id: 'someone', email: 'x@evil.test' } as SignupValue
    await submitSignup(tampered)
    const sent = insert.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['applicant_name', 'name', 'phone'])
  })

  it('AC-004.3: 넣은 줄을 다시 읽지 않는다(select를 붙이지 않는다)', async () => {
    const select = vi.fn()
    insert.mockReturnValue(Object.assign(Promise.resolve({ data: null, error: null }), { select }))
    await submitSignup(VALUE)
    expect(select).not.toHaveBeenCalled()
  })

  it('AC-004.3: 같은 계정 줄이 이미 있다는 오류(23505)는 성공으로 본다', async () => {
    insert.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "hospitals_owner_id_key"' },
      status: 409,
    })
    await expect(submitSignup(VALUE)).resolves.toBeUndefined()
  })

  it.each([
    ['검사 제약 위반', { code: '23514', message: RAW }],
    ['권한 없음', { code: '42501', message: RAW }],
    ['로그인 풀림', { code: 'PGRST301', message: RAW }],
    ['네트워크 오류', { code: '', message: `TypeError: Failed to fetch ${RAW}` }],
  ])('AC-004.4: 그 밖의 오류(%s)는 SignupError로 던진다(원래 오류 문구는 메시지에 넣지 않는다)', async (_, error) => {
    insert.mockResolvedValue({ data: null, error, status: 400 })
    const thrown = await submitSignup(VALUE).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(SignupError)
    expect((thrown as Error).message).not.toContain('secret detail')
    expect(insert).toHaveBeenCalledTimes(1) // 저절로 다시 보내지 않는다
  })

  it('AC-004.4: 요청 자체가 던져도 SignupError', async () => {
    insert.mockRejectedValue(new Error(`fetch failed ${RAW}`))
    const thrown = await submitSignup(VALUE).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(SignupError)
    expect((thrown as Error).message).not.toContain('secret detail')
  })

  it('AC-004.4: Supabase 클라이언트를 만들지 못해도(열쇠 없음) SignupError', async () => {
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 없음')
    })
    await expect(submitSignup(VALUE)).rejects.toBeInstanceOf(SignupError)
    expect(insert).not.toHaveBeenCalled()
  })

  it('AC-004.4: SignupError는 Error다', () => {
    expect(new SignupError('x')).toBeInstanceOf(Error)
  })
})
