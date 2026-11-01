// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import { SignupForm } from './SignupForm'
import { Stepper } from './Stepper'

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
  nameEmpty: '의원 이름을 적어 주세요.', // ui-90 AC-419.3: 이름표 "의원 이름"
  applicantEmpty: '신청자 이름을 적어 주세요.',
  phone: '연락처는 숫자 9~11자리로 적어 주세요.',
  agreed: '가입 신청을 보내려면 동의에 체크해 주세요.',
}
// 문구는 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs signupBody 글자 그대로(AC-419.3)
const CONSENT = '가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의해요. 필수'
const EMAIL_HELP = '로그인한 계정이라 바꿀 수 없어요.'
const PHONE_HELP = '승인 관련해 연락이 필요할 때만 써요.'
const SENDING = '보내는 중…'
const RAW = 'new row violates check constraint "hospitals_phone_check" secret-detail'

const emailInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '구글 계정' })
const nameInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '의원 이름 필수' })
const applicantInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '신청자 이름 필수' })
const phoneInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '연락처 선택' })
const consent = () => screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT })
const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: '가입 신청' })
// 보내는 동안의 [가입 신청](글자가 "보내는 중…"으로 바뀐다)
const sending = () => screen.getByRole<HTMLButtonElement>('button', { name: SENDING })
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

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 묶음(ds.*)의 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(el ? classesOf(el) : []).toEqual(expect.arrayContaining(wanted))
// 테두리·바탕 클래스(border·border-t·bg-* …, 화면 폭 접두사 포함)
const frameClasses = (el: Element) => classesOf(el).filter((c) => /^(?:[\w-]+:)?(?:border(?:-|$)|bg-|shadow(?:-|$))/.test(c))
// 시안 parts.mjs의 자물쇠 아이콘(Icon lock) 첫 모양
const LOCK_RECT = 'rect[x="3.25"][y="7"][width="9.5"][height="7"]'
const LEAD = '처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인해요.'
const steps = () => screen.getByRole('list', { name: '가입 단계' })
const labelFor = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent === text)
  if (label === undefined) throw new Error(`라벨 없음: ${text}`)
  return label
}
const noArbitraryColor = () => {
  for (const el of document.querySelectorAll('[class]')) {
    expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
  }
}

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
  it('AC-215.1: 단계는 <Stepper current={2} /> 그대로 — 1 구글 로그인(끝남 체크) · 2 가입 신청(지금) · 3 관리자 승인', () => {
    render(<SignupForm email={EMAIL} />)
    const ol = steps()
    expect(ol.tagName).toBe('OL')
    const items = within(ol).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    // 칸 번호는 1·2·3(옛 "02"·"03" 아님)이고 끝난 1은 번호 대신 체크
    const squares = items.map((li) => li.querySelector(':scope > [aria-hidden="true"]:not(.h-px)'))
    expect(squares.map((s) => s?.textContent)).toEqual(['', '2', '3'])
    expect(squares[0]?.querySelector('svg')).not.toBeNull()
    expect(within(items[0]).getByText('끝남')).toBeTruthy()
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null])
    for (const [li, label] of items.map((li, i) => [li, ['구글 로그인', '가입 신청', '관리자 승인'][i]] as const)) {
      expect(within(li).getByText(label)).toBeTruthy()
    }
    const html = ol.outerHTML
    cleanup()
    const alone = render(<Stepper current={2} />).container.firstElementChild
    expect(alone).not.toBeNull()
    expect(html).toBe(alone?.outerHTML)
  })

  it('AC-004.2·AC-419.3: 제목 "가입 신청"과 안내 문장', () => {
    render(<SignupForm email={EMAIL} />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('가입 신청')
    const lead = screen.getByText(LEAD)
    expect(isBefore(screen.getByRole('list', { name: '가입 단계' }), title)).toBe(true)
    expect(isBefore(title, lead)).toBe(true)
    expect(isBefore(lead, form())).toBe(true)
  })

  it('AC-004.2·AC-419.3: 목업 순서 — 구글 계정 · 의원 이름 · 신청자 이름 · 연락처 · 동의 · [가입 신청], 폼 밖 아래에 [다른 계정으로 로그인]', () => {
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

  it('AC-004.2·AC-419.3: 구글 계정 칸은 로그인한 이메일을 바꿀 수 없게 보인다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    const email = emailInput()
    expect(email.value).toBe(EMAIL)
    expect(email.type).toBe('email')
    expect(email.readOnly).toBe(true)
    expect(descriptionsOf(email)).toContain(EMAIL_HELP)
    await user.type(email, 'x')
    expect(email.value).toBe(EMAIL)
  })

  it('AC-004.2: 긴 구글 이메일도 잘리지 않고 읽기 전용 칸 안에서 줄을 바꿔 다 보인다(폰 390px)', () => {
    const long = 'newclinic.department.owner.longname@example-hospital.co.kr'
    render(<SignupForm email={long} />)
    const input = emailInput()
    expect(input.value).toBe(long)
    const box = input.parentElement as HTMLElement
    hasAll(box, ds.readonly)
    // 보이는 글자는 줄을 바꾸는 글자. 화면 읽기는 입력란 하나만 읽는다(같은 주소를 두 번 읽지 않게 숨김)
    const shown = within(box).getByText(long)
    expect(shown.tagName).toBe('SPAN')
    expect(shown.getAttribute('aria-hidden')).toBe('true')
    hasAll(shown, 'min-w-0 wrap-anywhere')
    // 입력란은 한 줄이라 긴 주소를 자른다 → 화면에서는 숨기고(sr-only) 라벨·설명·키보드 초점만 맡는다(초점은 칸 테두리로 보인다)
    hasAll(input, 'sr-only')
    expect(classesOf(box)).toContain('focus-within:border-accent')
  })

  it('AC-004.2·AC-419.3: 필수·선택 표시와 자리표시 글자는 목업 그대로', () => {
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
    expect(descriptionsOf(phoneInput())).toContain(PHONE_HELP)
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

  it('AC-215.1: 단계 색 — 끝난 1 accent-soft 칸·accent 체크·ink-2, 지금 2 accent 칸·흰 번호·ink 600, 다음 3 line-strong 테두리·muted', () => {
    render(<SignupForm email={EMAIL} />)
    const [done, current, next] = within(steps()).getAllByRole('listitem')
    const square = (li: Element) => li.querySelector(':scope > [aria-hidden="true"]:not(.h-px)') as Element
    expectClasses(done, 'text-ink-2')
    expectClasses(square(done), 'bg-accent-soft', 'text-accent')
    expectClasses(current, 'text-ink', 'font-semibold')
    expectClasses(square(current), 'bg-accent', 'text-surface')
    expectClasses(next, 'text-muted')
    expectClasses(square(next), 'border-line-strong', 'text-muted')
    expectClasses(steps(), 'mt-6', 'text-small')
  })

  it('AC-215.1: 이 순서 — 단계 → h1 → 안내 → 폼 → [다른 계정으로 로그인]이 한 뿌리에 바로 있고, 카드 상자가 없다(뿌리·폼에 테두리·바탕·그림자 없음)', () => {
    const { container } = render(<SignupForm email={EMAIL} />)
    const root = container.firstElementChild as HTMLElement
    const title = screen.getByRole('heading', { level: 1, name: '가입 신청' })
    const lead = screen.getByText(LEAD)
    expect(Array.from(root.children)).toEqual([steps(), title, lead, form(), otherAccount()])
    expect(lead.tagName).toBe('P')
    expect(container.querySelectorAll('h1, h2, h3')).toHaveLength(1)
    expect(frameClasses(root)).toEqual([])
    expect(frameClasses(form())).toEqual([])
    // 480 칸은 AuthFrame이 정한다(폼이 따로 폭을 정하지 않는다)
    expect(classesOf(root).filter((c) => /^max-w-/.test(c))).toEqual([])
    // 네 변 테두리 상자는 구글 계정 읽기 전용 칸 하나뿐이다(오류 카드·입력란·체크 상자는 상자가 아니다)
    const boxes = [root, ...root.querySelectorAll('div, section, article, ul, ol, li, dl, table, aside, form')].filter((el) =>
      classesOf(el).includes('border'),
    )
    expect(boxes).toEqual([emailInput().parentElement])
  })

  it('AC-215.1: 간격 — 단계 위 24px, h1 위 24px, 안내 위 8px, 폼 위 24px·칸 사이 20px, [다른 계정으로 로그인] 위 16px', () => {
    render(<SignupForm email={EMAIL} />)
    expectClasses(steps(), 'mt-6')
    expectClasses(screen.getByRole('heading', { level: 1 }), 'mt-6')
    expectClasses(screen.getByText(LEAD), 'mt-2')
    expectClasses(form(), 'mt-6', 'flex', 'flex-col', 'gap-5')
    expectClasses(otherAccount(), 'mt-4')
  })

  it('AC-215.1: 글자 — h1 "가입 신청"은 heading-m → heading(768px 이상) 600 ink, 안내는 body ink-2', () => {
    render(<SignupForm email={EMAIL} />)
    expectClasses(screen.getByRole('heading', { level: 1 }), 'text-heading-m', 'md:text-heading', 'font-semibold', 'text-ink')
    expectClasses(screen.getByText(LEAD), 'text-body', 'text-ink-2')
  })

  it('AC-215.1·AC-419.3: 칸 이름 줄 — 이름(ds.label: small 600) + 필수·선택(ds.labelHint: caption muted), 칸 묶음은 ds.field', () => {
    render(<SignupForm email={EMAIL} />)
    for (const [text, hint] of [
      ['구글 계정', null],
      ['의원 이름 필수', '필수'],
      ['신청자 이름 필수', '필수'],
      ['연락처 선택', '선택'],
    ] as const) {
      const label = labelFor(text)
      hasAll(label, ds.label)
      expectClasses(label, 'text-small', 'font-semibold')
      hasAll(label.parentElement as HTMLElement, ds.field)
      const tag = label.querySelector('span')
      if (hint === null) {
        expect(tag, text).toBeNull()
      } else {
        expect(tag?.textContent).toBe(hint)
        hasAll(tag as HTMLElement, ds.labelHint)
      }
    }
    // 동의 끝의 "필수"도 caption muted
    const consentTag = within(consent().closest('label') as HTMLElement).getByText('필수')
    hasAll(consentTag, ds.labelHint)
  })

  it('AC-215.1·AC-419.3: 도움말 — 구글 계정 "로그인한 계정이라 바꿀 수 없어요." · 연락처 "승인 관련해 연락이 필요할 때만 써요."는 ds.help이고 칸 바로 아래에서 칸이 가리킨다', () => {
    render(<SignupForm email={EMAIL} />)
    for (const [input, text] of [
      [emailInput(), EMAIL_HELP],
      [phoneInput(), PHONE_HELP],
    ] as const) {
      const help = screen.getByText(text)
      expect(help.tagName).toBe('P')
      hasAll(help, ds.help)
      expect(descriptionsOf(input)).toContain(text)
      expect(isBefore(input, help)).toBe(true)
    }
    // 다른 칸에는 도움말이 없다
    expect(document.querySelectorAll('form p')).toHaveLength(2)
  })

  it('AC-215.1: 구글 계정 칸 — ds.readonly 안에 자물쇠 14px(aria-hidden) + 이메일', () => {
    render(<SignupForm email={EMAIL} />)
    const box = emailInput().parentElement as HTMLElement
    hasAll(box, ds.readonly)
    const lock = box.querySelector('svg') as SVGElement
    expect(lock.querySelector(LOCK_RECT)).not.toBeNull()
    expect(lock.getAttribute('width')).toBe('14')
    expect(lock.getAttribute('height')).toBe('14')
    expect(lock.getAttribute('aria-hidden')).toBe('true')
    expect(within(box).getByText(EMAIL)).toBeTruthy()
    expect(isBefore(lock, within(box).getByText(EMAIL))).toBe(true)
  })

  it('AC-215.1: 모양 — 입력란 ds.input, 체크 상자 ds.checkbox(+ ds.checkboxMark), [가입 신청] ds.button.primaryLarge 전체 폭, 임의 색 없음', () => {
    render(<SignupForm email={EMAIL} />)
    for (const el of [nameInput(), applicantInput(), phoneInput()]) hasAll(el, ds.input)
    hasAll(consent(), ds.checkbox)
    hasAll(consent().parentElement as HTMLElement, ds.checkboxWrap)
    // 흰 체크 그림은 체크 상자 바로 뒤(peer-checked로 보인다), 읽지 않는다
    const mark = consent().nextElementSibling as Element
    hasAll(mark, ds.checkboxMark)
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    hasAll(submit(), ds.button.primaryLarge)
    expect(classesOf(submit())).toContain('w-full')
    noArbitraryColor()
  })

  it('AC-215.1: [다른 계정으로 로그인]은 폼 밖 아래(위 16px), 왼쪽 정렬 글자 단추(ds.textButton: accent·body 500) — 가운데·전체 폭이 아니다', () => {
    render(<SignupForm email={EMAIL} />)
    const button = otherAccount()
    expect(form().contains(button)).toBe(false)
    expect(isBefore(form(), button)).toBe(true)
    hasAll(button, ds.textButton)
    expectClasses(button, 'text-accent', 'text-body', 'font-medium', 'mt-4', 'self-start')
    expect(classesOf(button)).not.toContain('self-center')
    expect(classesOf(button)).not.toContain('w-full')
    expect(classesOf(button).filter((c) => /^(?:mx-auto|text-center|justify-center)$/.test(c))).toEqual([])
  })
})

describe('AC-419.3·AC-419.6: 가입 신청 문구는 시안 글자 그대로', () => {
  it('AC-419.3: 칸 이름 "의원 이름"(예: 가나 정형외과의원), 안내·도움말·동의 문구, 단추 글자가 시안 signupBody와 같다', () => {
    render(<SignupForm email={EMAIL} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 신청')
    expect(screen.getByText(LEAD).tagName).toBe('P')
    expect([...document.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      '구글 계정',
      '의원 이름 필수',
      '신청자 이름 필수',
      '연락처 선택',
      CONSENT,
    ])
    expect(nameInput().placeholder).toBe('예: 가나 정형외과의원')
    expect([...form().querySelectorAll('p')].map((p) => p.textContent)).toEqual([EMAIL_HELP, PHONE_HELP])
    expect(submit().textContent).toBe('가입 신청')
    expect(otherAccount().textContent).toBe('다른 계정으로 로그인')
  })

  it('AC-419.3: 의원 이름을 비우면 칸 아래 오류 글의 이름표도 "의원 이름"이다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(errorOf(nameInput())?.textContent).toBe('의원 이름을 적어 주세요.')
  })

  it('AC-419.6: 처음·틀린 칸·저장 실패 어느 상태에도 "병원 이름"·"니다." 글자가 없다', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '23514', message: RAW }, status: 400 })
    const user = userEvent.setup()
    const { container } = render(<SignupForm email={EMAIL} />)
    const check = (state: string) => {
      expect(container.textContent, state).not.toContain('병원 이름')
      expect(container.textContent, state).not.toContain('니다.')
    }
    check('처음')
    await user.click(submit())
    expect(screen.getByText(MESSAGES.nameEmpty)).toBeTruthy()
    check('틀린 칸')
    await fillValid(user)
    await user.click(submit())
    await screen.findByRole('alert')
    check('저장 실패')
  })
})

// 상자 겹침(AC-204.7): 처음·틀린 칸·저장 실패 모두 상자 안에 상자가 없다
describe('AC-204.7: 가입 신청 — 상자 안 상자 없음', () => {
  it('AC-204.7·AC-215.1: 처음 상태', () => {
    const { container } = render(<SignupForm email={EMAIL} />)
    expect(submit()).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-204.7·AC-215.1: 틀린 칸 문구가 보이는 상태', async () => {
    const user = userEvent.setup()
    const { container } = render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(screen.getByText(MESSAGES.nameEmpty)).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-204.7·AC-215.1: 저장 실패(오류 카드) 상태', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '23514', message: RAW }, status: 400 })
    const user = userEvent.setup()
    const { container } = render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    await screen.findByRole('alert')
    expect(nestedBoxes(container)).toEqual([])
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

  it('AC-004.1·AC-215.1: 틀린 칸은 aria-invalid(ds.input·ds.checkbox의 aria-invalid:border-negative)이고 칸 아래 문구는 ds.fieldError', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    for (const el of [nameInput(), applicantInput(), consent()]) {
      expect(el.getAttribute('aria-invalid')).toBe('true')
      hasAll(errorOf(el) as HTMLElement, ds.fieldError)
    }
    for (const el of [nameInput(), applicantInput()]) hasAll(el, ds.input)
    hasAll(consent(), ds.checkbox)
    expect(tokens(ds.input)).toContain('aria-invalid:border-negative')
    expect(tokens(ds.checkbox)).toContain('aria-invalid:border-negative')
    noArbitraryColor()
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

  it('AC-004.3·AC-419.3: 보내는 동안 [가입 신청]은 기다림(aria-busy, "보내는 중…")이고 두 번 눌러도(두 번 클릭·연달은 submit) 한 번만 보낸다', async () => {
    let finish: (value: { data: null; error: null }) => void = () => {}
    insert.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    const button = submit()
    await user.dblClick(button)
    // 같은 틱에 두 번 들어와도 한 번만
    fireEvent.submit(form())
    fireEvent.submit(form())
    expect(insert).toHaveBeenCalledTimes(1)
    expect(sending()).toBe(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.disabled).toBe(false) // 막힘(40%)이 아니라 기다림(60%) 모양
    await user.click(button)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled() // 저장이 끝나기 전에는 넘어가지 않는다
    finish({ data: null, error: null })
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    // 넘어가는 동안 다시 보내지 않고 기다림도 풀지 않는다
    fireEvent.submit(form())
    expect(insert).toHaveBeenCalledTimes(1)
    expect(sending().getAttribute('aria-busy')).toBe('true')
  })

  it('AC-419.3: 보내는 동안에도 모양은 ds.button.primaryLarge 전체 폭 그대로이고 글자만 "보내는 중…"이다', async () => {
    insert.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    const button = sending()
    expect(button.textContent).toBe(SENDING)
    expect(button.type).toBe('submit')
    hasAll(button, ds.button.primaryLarge)
    expect(classesOf(button)).toContain('w-full')
    expect(tokens(ds.button.primaryLarge)).toEqual(expect.arrayContaining(['aria-busy:opacity-60', 'aria-busy:cursor-progress']))
    expect(screen.queryByRole('button', { name: '가입 신청' })).toBeNull()
  })

  it('AC-419.3: 틀린 칸이 있으면 기다림 없이 [가입 신청] 그대로다(보내지 않았다)', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(submit().getAttribute('aria-busy')).toBeNull()
    expect(screen.queryByRole('button', { name: SENDING })).toBeNull()
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
    expect(submit().getAttribute('aria-busy')).toBeNull()
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
