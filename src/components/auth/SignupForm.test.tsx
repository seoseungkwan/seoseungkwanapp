// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { SignupForm } from './SignupForm'

// 실제 Supabase에 붙지 않는다. 진짜 validateSignup·submitSignup을 거쳐 hospitals에 어떤 값이 몇 번 나가는지만 본다
const { from, insert, signOut, router } = vi.hoisted(() => {
  const insert = vi.fn()
  return {
    insert,
    from: vi.fn(() => ({ insert })),
    signOut: vi.fn(),
    router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() },
  }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ from, auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const EMAIL = 'manager@example.com'
const MESSAGES = {
  nameEmpty: '병원 이름을 적어 주세요.',
  applicantEmpty: '신청자 이름을 적어 주세요.',
  phone: '연락처는 숫자 9~11자리로 적어 주세요.',
  agreed: '가입 신청을 보내려면 동의에 체크해 주세요.',
}
const CONSENT = '가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의합니다. 필수'
const RAW = 'new row violates check constraint "hospitals_phone_check" secret-detail'

const emailInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '구글 계정' })
const nameInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '병원 이름 필수' })
const applicantInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '신청자 이름 필수' })
const phoneInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '연락처 선택' })
const consent = () => screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT })
const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: '가입 신청' })
const otherAccount = () => screen.getByRole<HTMLButtonElement>('button', { name: '다른 계정으로 로그인' })
const form = () => {
  const el = document.querySelector('form')
  if (el === null) throw new Error('form 없음')
  return el
}
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
// 칸이 가리키는 설명(aria-describedby) 글자들
const descriptionsOf = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
const errorOf = (el: HTMLElement) => {
  const node = (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .find((n) => n !== null && Object.values(MESSAGES).includes(n.textContent ?? ''))
  return node ?? null
}

const css = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

async function fillValid(user: ReturnType<typeof userEvent.setup>, phone = '010-1234-5678') {
  await user.type(nameInput(), '  가나 정형외과의원 ')
  await user.type(applicantInput(), '홍길동')
  if (phone !== '') await user.type(phoneInput(), phone)
  await user.click(consent())
}

const assign = vi.fn()

beforeEach(() => {
  insert.mockReset()
  insert.mockResolvedValue({ data: null, error: null, status: 201 })
  from.mockClear()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  for (const fn of Object.values(router)) fn.mockReset()
  assign.mockReset()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/signup', assign })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SignupForm: 목업 가입 신청(Signup.dc.html)', () => {
  it('AC-004.2: 가입 단계 칩 3개 — 구글 로그인(끝남) · 02 가입 신청(지금) · 03 관리자 승인', () => {
    render(<SignupForm email={EMAIL} />)
    const steps = screen.getByRole('list', { name: '가입 단계' })
    expect(steps.tagName).toBe('OL')
    const items = within(steps).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['구글 로그인', '02가입 신청', '03관리자 승인'])
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null])
    // 끝난 단계의 체크 그림은 읽지 않는다
    expect(items[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-004.2: 제목 "가입 신청"과 안내 문장', () => {
    render(<SignupForm email={EMAIL} />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('가입 신청')
    const lead = screen.getByText('처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인합니다.')
    expect(isBefore(screen.getByRole('list', { name: '가입 단계' }), title)).toBe(true)
    expect(isBefore(title, lead)).toBe(true)
    expect(isBefore(lead, form())).toBe(true)
  })

  it('AC-004.2: 목업 순서 — 구글 계정 · 병원 이름 · 신청자 이름 · 연락처 · 동의 · [가입 신청], 폼 밖 아래에 [다른 계정으로 로그인]', () => {
    render(<SignupForm email={EMAIL} />)
    const inForm = [emailInput(), nameInput(), applicantInput(), phoneInput(), consent(), submit()]
    for (const el of inForm) expect(form().contains(el)).toBe(true)
    for (let i = 1; i < inForm.length; i++) expect(isBefore(inForm[i - 1], inForm[i])).toBe(true)
    expect(form().contains(otherAccount())).toBe(false)
    expect(isBefore(form(), otherAccount())).toBe(true)
    // 칸은 이것뿐(목업에 없는 칸을 더하지 않는다)
    expect(within(form()).getAllByRole('textbox')).toHaveLength(4)
    expect(within(form()).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(form()).getAllByRole('button')).toHaveLength(1)
  })

  it('AC-004.2: 구글 계정 칸은 로그인한 이메일을 바꿀 수 없게 보인다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    const email = emailInput()
    expect(email.value).toBe(EMAIL)
    expect(email.type).toBe('email')
    expect(email.readOnly).toBe(true)
    expect(descriptionsOf(email)).toContain('로그인한 계정이라 바꿀 수 없습니다.')
    await user.type(email, 'x')
    expect(email.value).toBe(EMAIL)
  })

  it('AC-004.2: 필수·선택 표시와 자리표시 글자는 목업 그대로', () => {
    render(<SignupForm email={EMAIL} />)
    expect(nameInput().required).toBe(true)
    expect(nameInput().type).toBe('text')
    expect(nameInput().placeholder).toBe('예: 가나 정형외과의원')
    expect(applicantInput().required).toBe(true)
    expect(applicantInput().type).toBe('text')
    expect(applicantInput().placeholder).toBe('예: 홍길동')
    expect(phoneInput().required).toBe(false)
    expect(phoneInput().type).toBe('tel')
    expect(phoneInput().placeholder).toBe('010-0000-0000')
    expect(descriptionsOf(phoneInput())).toContain('승인 관련해 연락이 필요할 때만 씁니다.')
    expect(consent().required).toBe(true)
    expect(consent().checked).toBe(false)
    for (const el of [nameInput(), applicantInput(), phoneInput()]) expect(el.value).toBe('')
  })

  it('AC-004.2: [가입 신청]은 submit 단추, [다른 계정으로 로그인]은 type="button" 단추(링크 아님)', () => {
    render(<SignupForm email={EMAIL} />)
    expect(submit().type).toBe('submit')
    expect(submit().disabled).toBe(false)
    expect(otherAccount().tagName).toBe('BUTTON')
    expect(otherAccount().type).toBe('button')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('AC-004.2: 처음에는 오류 문구·오류 카드가 없다', () => {
    render(<SignupForm email={EMAIL} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    for (const message of Object.values(MESSAGES)) expect(screen.queryByText(message)).toBeNull()
  })

  it('AC-004.2: 색·글꼴은 globals.css 변수만 쓴다(목업 색: 청록 끝난 단계·코랄 지금 단계·남색 단추·연한 배경)', () => {
    const text = css('src/components/auth/SignupForm.module.css')
    for (const v of [
      '--teal-soft',
      '--teal-text',
      '--coral-soft',
      '--coral-text',
      '--text-strong',
      '--text-body',
      '--text-muted',
      '--bg-soft',
      '--bg-page',
      '--border-card',
      '--font-num',
    ]) {
      expect(text, v).toContain(`var(${v})`)
    }
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(text).not.toMatch(/rgba?\(/)
  })
})

describe('SignupForm: 값 검사', () => {
  it('AC-004.1: 빈 채로 누르면 틀린 칸마다 칸 아래에 문구를 보이고 보내지 않는다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    for (const [el, message] of [
      [nameInput(), MESSAGES.nameEmpty],
      [applicantInput(), MESSAGES.applicantEmpty],
      [consent(), MESSAGES.agreed],
    ] as const) {
      expect(el.getAttribute('aria-invalid'), message).toBe('true')
      const error = errorOf(el)
      expect(error?.textContent).toBe(message)
      expect(isBefore(el, error as Node), message).toBe(true) // 칸 아래
    }
    // 이름 문구는 다음 칸(신청자 이름)보다 앞, 신청자 문구는 연락처보다 앞
    expect(isBefore(errorOf(nameInput()) as Node, applicantInput())).toBe(true)
    expect(isBefore(errorOf(applicantInput()) as Node, phoneInput())).toBe(true)
    expect(isBefore(errorOf(consent()) as Node, submit())).toBe(true)
    // 비운 연락처는 맞는 값
    expect(phoneInput().getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.queryByText(MESSAGES.phone)).toBeNull()
    expect(insert).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull() // 저장 실패 카드가 아니다
    expect(document.activeElement).toBe(nameInput()) // 첫 틀린 칸으로
  })

  it('AC-004.1: 연락처만 틀리면 연락처 아래에만 문구', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user, '010-12')
    await user.click(submit())
    expect(errorOf(phoneInput())?.textContent).toBe(MESSAGES.phone)
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1)
    expect(insert).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(phoneInput())
  })

  it('AC-004.1: 고쳐서 다시 누르면 문구가 사라지고 보낸다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(screen.getByText(MESSAGES.nameEmpty)).toBeTruthy()
    await fillValid(user)
    await user.click(submit())
    for (const message of Object.values(MESSAGES)) expect(screen.queryByText(message)).toBeNull()
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pending'))
    expect(insert).toHaveBeenCalledTimes(1)
  })
})

describe('SignupForm: 보내기', () => {
  it('AC-004.3: 맞는 값이면 다듬은 세 칸만 hospitals에 넣고 /pending으로 바꾼다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678' })
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-004.3: 연락처를 비우면 phone은 null', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user, '')
    await user.click(submit())
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: null })
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pending'))
  })

  it('AC-004.3: 보내는 동안 두 번 눌러도(두 번 클릭·연달은 submit) 한 번만 보내고, 단추는 눌리지 않는다', async () => {
    let finish: (value: { data: null; error: null }) => void = () => {}
    insert.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.dblClick(submit())
    // 단추가 막히기 전에 같은 틱에 두 번 들어와도 한 번만
    fireEvent.submit(form())
    fireEvent.submit(form())
    expect(insert).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
    expect(router.replace).not.toHaveBeenCalled() // 저장이 끝나기 전에는 넘어가지 않는다
    finish({ data: null, error: null })
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    // 넘어가는 동안 다시 보내지 않는다
    fireEvent.submit(form())
    expect(insert).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
  })

  it('AC-004.3: 이미 신청한 계정(23505)이어도 오류 카드 없이 /pending으로 바꾼다', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 })
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('SignupForm: 저장 실패', () => {
  it('AC-004.4: 저장이 실패하면 넣은 값을 그대로 두고 E-SIGNUP-FAILED 카드를 보인다(원래 오류 내용은 없다)', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '23514', message: RAW }, status: 400 })
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    const alert = await screen.findByRole('alert')
    const info = errorInfo('E-SIGNUP-FAILED')
    expect(within(alert).getByText(info.what)).toBeTruthy()
    expect(within(alert).getByText(info.fix)).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-SIGNUP-FAILED')).toBeTruthy()
    // 카드는 폼 안, [가입 신청] 바로 위
    expect(form().contains(alert)).toBe(true)
    expect(isBefore(consent(), alert)).toBe(true)
    expect(isBefore(alert, submit())).toBe(true)
    // 적은 값은 적은 그대로
    expect(nameInput().value).toBe('  가나 정형외과의원 ')
    expect(applicantInput().value).toBe('홍길동')
    expect(phoneInput().value).toBe('010-1234-5678')
    expect(consent().checked).toBe(true)
    expect(emailInput().value).toBe(EMAIL)
    expect(document.body.textContent).not.toContain('secret-detail')
    expect(document.body.textContent).not.toContain('23514')
    expect(router.replace).not.toHaveBeenCalled()
    expect(submit().disabled).toBe(false) // 다시 누를 수 있다
  })

  it('AC-004.4: 요청이 던져도 같은 카드', async () => {
    insert.mockRejectedValue(new TypeError(`Failed to fetch ${RAW}`))
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('오류 번호 E-SIGNUP-FAILED')).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret-detail')
    expect(document.body.textContent).not.toContain('Failed to fetch')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-004.4: 실패한 뒤 다시 누르면 다시 보내고, 성공하면 카드를 지우고 /pending으로', async () => {
    insert.mockResolvedValueOnce({ data: null, error: { code: '08006', message: RAW }, status: 503 })
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    await screen.findByRole('alert')
    await user.click(submit())
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[1][0]).toEqual({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('SignupForm: [다른 계정으로 로그인]', () => {
  it('AC-004.2: 누르면 로그아웃한 뒤 /login을 새로 연다(가입 신청은 보내지 않는다)', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(otherAccount())
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(insert).not.toHaveBeenCalled()
  })
})
