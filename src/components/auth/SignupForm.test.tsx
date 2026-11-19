// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { EMR_LABEL } from '@/lib/clinic/emrText'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import { EMR_KINDS, type EmrKind } from '@/types/clinicProfile'
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
  emr: '쓰는 EMR을 골라 주세요.', // emr-signup AC-7303.2
}
// 문구는 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs signupBody 글자 그대로(AC-419.3)
const CONSENT = '가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의해요. 필수'
const EMAIL_HELP = '로그인한 계정이라 바꿀 수 없어요.'
const PHONE_HELP = '승인 관련해 연락이 필요할 때만 써요.'
// emr-signup 시안 docs/mockups/emr-signup/index.html ① 글자 그대로(AC-7303.1)
const EMR_HELP = '진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 승인 뒤 설정 → 병원 정보에서 바꿀 수 있어요.'
const EMR_TEXTS = ['비트', '의사랑', '이지스', '그 밖의 EMR']
const SENDING = '보내는 중…'
const RAW = 'new row violates check constraint "hospitals_phone_check" secret-detail'

const emailInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '구글 계정' })
const nameInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '의원 이름 필수' })
const applicantInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '신청자 이름 필수' })
const phoneInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: '연락처 선택' })
const consent = () => screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT })
// 쓰는 EMR 묶음(칸 이름으로 이름 붙은 group)과 그 안 단추 넷
const emrGroup = () => screen.getByRole<HTMLDivElement>('group', { name: '쓰는 EMR 필수' })
const emrButtons = () => within(emrGroup()).getAllByRole<HTMLButtonElement>('button')
const emrButton = (text: string) => within(emrGroup()).getByRole<HTMLButtonElement>('button', { name: text })
const pressedOf = () => emrButtons().map((b) => b.getAttribute('aria-pressed'))
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

// emr: 누를 단추 글자(''이면 고르지 않는다)
async function fillValid(user: ReturnType<typeof userEvent.setup>, phone = '010-1234-5678', emr = '비트') {
  await user.type(nameInput(), '  가나 정형외과의원 ')
  if (emr !== '') await user.click(emrButton(emr))
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

  it('AC-004.2·AC-419.3·AC-7303.1: 목업 순서 — 구글 계정 · 의원 이름 · 쓰는 EMR(단추 넷) · 신청자 이름 · 연락처 · 동의 · [가입 신청], 폼 밖 아래에 [다른 계정으로 로그인]', () => {
    render(<SignupForm email={EMAIL} />)
    const inForm = [emailInput(), nameInput(), ...emrButtons(), applicantInput(), phoneInput(), consent(), submit()]
    for (const el of inForm) expect(form().contains(el)).toBe(true)
    for (let i = 1; i < inForm.length; i++) expect(isBefore(inForm[i - 1], inForm[i])).toBe(true)
    expect(form().contains(otherAccount())).toBe(false)
    expect(isBefore(form(), otherAccount())).toBe(true)
    // 칸은 이것뿐(목업에 없는 칸을 더하지 않는다)
    expect(within(form()).getAllByRole('textbox')).toHaveLength(4)
    expect(within(form()).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(form()).getAllByRole('button')).toHaveLength(5) // 쓰는 EMR 넷 + [가입 신청]
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
    // 네 변 테두리 상자는 구글 계정 읽기 전용 칸과 쓰는 EMR 묶음(ds.segment.group, AC-7303.1)뿐이다(오류 카드·입력란·체크 상자는 상자가 아니다)
    const boxes = [root, ...root.querySelectorAll('div, section, article, ul, ol, li, dl, table, aside, form')].filter((el) =>
      classesOf(el).includes('border'),
    )
    expect(boxes).toEqual([emailInput().parentElement, emrGroup()])
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
    // 다른 칸에는 도움말이 없다(쓰는 EMR 도움말은 AC-7303.1 시험이 본다)
    expect(document.querySelectorAll('form p')).toHaveLength(3)
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
    expect([...form().querySelectorAll('p')].map((p) => p.textContent)).toEqual([EMAIL_HELP, EMR_HELP, PHONE_HELP])
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
  it('AC-004.3·AC-7303.3: 맞는 값이면 다듬은 세 칸 + 고른 EMR만 hospitals에 넣고 /pending으로 바꾼다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(submit())
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr: 'bit' })
    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-004.3: 연락처를 비우면 phone은 null', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user, '')
    await user.click(submit())
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: null, emr: 'bit' })
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
    expect(insert.mock.calls[1][0]).toEqual({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr: 'bit' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// 쓰는 EMR 칸 (emr-signup REQ-7303, design.md 3절, 시안 docs/mockups/emr-signup/index.html ①)
const segmentBase = (classes: string) => tokens(classes).filter((t) => !t.includes(':'))
describe('SignupForm: 쓰는 EMR 칸 (emr-signup AC-7303.1)', () => {
  it('AC-7303.1: 의원 이름 다음·신청자 이름 앞에 칸 이름 "쓰는 EMR" + "필수"(ds.label·ds.labelHint, label이 아닌 span#su-emr-label)', () => {
    render(<SignupForm email={EMAIL} />)
    const name = document.getElementById('su-emr-label') as HTMLElement
    expect(name).not.toBeNull()
    expect(name.tagName).toBe('SPAN')
    expect(name.textContent).toBe('쓰는 EMR 필수')
    hasAll(name, ds.label)
    const hint = name.querySelector('span') as HTMLElement
    expect(hint.textContent).toBe('필수')
    hasAll(hint, ds.labelHint)
    // 칸 묶음(ds.field) 하나 안에 칸 이름 → 단추 묶음 → 도움말
    const field = name.parentElement as HTMLElement
    hasAll(field, ds.field)
    expect(field.contains(emrGroup())).toBe(true)
    expect(isBefore(nameInput(), field)).toBe(true)
    expect(isBefore(field, applicantInput())).toBe(true)
    expect(field.contains(nameInput())).toBe(false)
    expect(field.contains(applicantInput())).toBe(false)
  })

  it('AC-7303.1: 묶음은 칸 이름으로 이름 붙은 group이고 단추 넷은 비트·의사랑·이지스·그 밖의 EMR(EMR_KINDS 차례·EMR_LABEL 글), type="button"·aria-pressed 처음엔 모두 false', () => {
    render(<SignupForm email={EMAIL} />)
    const group = emrGroup()
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-labelledby')).toBe('su-emr-label')
    expect(emrButtons().map((b) => b.textContent)).toEqual(EMR_TEXTS)
    expect(EMR_KINDS.map((k) => EMR_LABEL[k])).toEqual(EMR_TEXTS)
    for (const b of emrButtons()) {
      expect(b.type).toBe('button')
      expect(b.getAttribute('aria-pressed')).toBe('false')
    }
    // 처음엔 아무것도 고르지 않는다(비트로 미리 골라 두지 않는다, design.md 5절)
    expect(pressedOf()).toEqual(['false', 'false', 'false', 'false'])
  })

  it('AC-7303.1: id — su-emr는 첫 단추("비트")에만, 묶음 div에는 id가 없다', () => {
    render(<SignupForm email={EMAIL} />)
    expect(document.querySelectorAll('#su-emr')).toHaveLength(1)
    expect(document.getElementById('su-emr')).toBe(emrButton('비트'))
    expect(emrGroup().hasAttribute('id')).toBe(false)
  })

  it('AC-7303.1: 도움말 — 시안 글자 그대로, ds.help p#su-emr-help가 묶음 아래에 있고 묶음이 aria-describedby로 그것만 가리킨다', () => {
    render(<SignupForm email={EMAIL} />)
    const help = screen.getByText(EMR_HELP)
    expect(help.tagName).toBe('P')
    expect(help.id).toBe('su-emr-help')
    hasAll(help, ds.help)
    expect(isBefore(emrGroup(), help)).toBe(true)
    expect(isBefore(help, applicantInput())).toBe(true)
    expect(emrGroup().getAttribute('aria-describedby')).toBe('su-emr-help')
    expect(descriptionsOf(emrGroup())).toEqual([EMR_HELP])
  })

  it('AC-7303.1: 모양 — ds.segment 묶음·단추, 넓은 화면은 한 줄 넷(md:grid md:w-full md:grid-cols-4)·높이 44px(md:h-11), 폰은 두 줄 둘씩(max-md:grid-cols-2)', () => {
    render(<SignupForm email={EMAIL} />)
    const group = emrGroup()
    hasAll(group, ds.segment.group)
    expectClasses(group, 'md:grid', 'md:w-full', 'md:grid-cols-4', 'max-md:grid-cols-2')
    // 접두사 없는 클래스는 ds.segment.group 그대로다(같은 속성을 접두사 없이 겹치지 않는다)
    expect(segmentBase(group.getAttribute('class') ?? '').sort()).toEqual(segmentBase(ds.segment.group).sort())
    for (const b of emrButtons()) {
      hasAll(b, ds.segment.button)
      hasAll(b, ds.segment.off)
      expectClasses(b, 'md:h-11')
      expect(segmentBase(b.getAttribute('class') ?? '').sort()).toEqual(segmentBase(`${ds.segment.button} ${ds.segment.off}`).sort())
    }
    noArbitraryColor()
  })

  it('AC-7303.1: 단추를 누르면 그 단추만 pressed(ds.segment.on)이고, 다른 것을 누르면 옮겨 간다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(emrButton('의사랑'))
    expect(pressedOf()).toEqual(['false', 'true', 'false', 'false'])
    hasAll(emrButton('의사랑'), ds.segment.on)
    for (const text of ['비트', '이지스', '그 밖의 EMR']) hasAll(emrButton(text), ds.segment.off)
    await user.click(emrButton('그 밖의 EMR'))
    expect(pressedOf()).toEqual(['false', 'false', 'false', 'true'])
    hasAll(emrButton('그 밖의 EMR'), ds.segment.on)
    hasAll(emrButton('의사랑'), ds.segment.off)
    // 고르기만으로는 보내지 않는다
    expect(insert).not.toHaveBeenCalled()
  })

  it('AC-7303.1·AC-204.7: 쓰는 EMR 칸이 있어도 상자 안 상자가 없다(처음·고름)', async () => {
    const user = userEvent.setup()
    const { container } = render(<SignupForm email={EMAIL} />)
    expect(nestedBoxes(container)).toEqual([])
    await user.click(emrButton('이지스'))
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('SignupForm: 쓰는 EMR을 안 고르고 보냄 (emr-signup AC-7303.2)', () => {
  it('AC-7303.2: 다른 칸이 맞아도 EMR을 고르지 않으면 보내지 않고, 칸 아래 "쓰는 EMR을 골라 주세요."(ds.fieldError p#su-emr-error)를 보이며 첫 단추에 초점', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user, '010-1234-5678', '')
    await user.click(submit())
    expect(insert).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    const error = screen.getByText(MESSAGES.emr)
    expect(error.tagName).toBe('P')
    expect(error.id).toBe('su-emr-error')
    hasAll(error, ds.fieldError)
    // 묶음 아래, 도움말 위(연락처 칸과 같은 차례)
    expect(isBefore(emrGroup(), error)).toBe(true)
    expect(isBefore(error, screen.getByText(EMR_HELP))).toBe(true)
    expect(errorOf(emrGroup())).toBe(error)
    expect(document.activeElement).toBe(emrButton('비트'))
  })

  it('AC-7303.2: 오류면 묶음 aria-describedby는 "오류 도움말" 차례이고, 묶음 테두리가 오류 색(data-invalid + data-invalid:border-negative, 입력란 오류와 같은 토큰)이다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    expect(emrGroup().hasAttribute('data-invalid')).toBe(false)
    await user.click(submit())
    const group = emrGroup()
    expect(group.getAttribute('aria-describedby')).toBe('su-emr-error su-emr-help')
    expect(descriptionsOf(group)).toEqual([MESSAGES.emr, EMR_HELP])
    expect(group.hasAttribute('data-invalid')).toBe(true)
    expectClasses(group, 'data-invalid:border-negative')
    expect(tokens(ds.input)).toContain('aria-invalid:border-negative') // 같은 오류 색 토큰
    // 접두사 없는 border-negative를 덧붙이지 않는다(ds.segment.group의 border-line-strong과 겹치지 않게)
    expect(classesOf(group)).not.toContain('border-negative')
    noArbitraryColor()
  })

  it('AC-7303.2: 틀린 칸이 여럿이면 화면 차례(의원 이름 → 쓰는 EMR → 신청자 이름 → 연락처 → 동의)로 첫 칸에 초점', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    // 모두 비움 → 의원 이름
    await user.click(submit())
    expect(screen.getByText(MESSAGES.emr)).toBeTruthy()
    expect(document.activeElement).toBe(nameInput())
    // 의원 이름만 채움 → 쓰는 EMR(신청자 이름·동의보다 앞)
    await user.type(nameInput(), '가나의원')
    await user.click(submit())
    expect(screen.getByText(MESSAGES.applicantEmpty)).toBeTruthy()
    expect(document.activeElement).toBe(emrButton('비트'))
    // EMR까지 고름 → 신청자 이름
    await user.click(emrButton('이지스'))
    await user.click(submit())
    expect(document.activeElement).toBe(applicantInput())
    expect(insert).not.toHaveBeenCalled()
  })

  it('AC-7303.2: 단추를 고르면 쓰는 EMR 오류 글·오류 테두리만 사라지고 다른 칸 오류는 그대로다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(screen.getByText(MESSAGES.emr)).toBeTruthy()
    await user.click(emrButton('의사랑'))
    expect(screen.queryByText(MESSAGES.emr)).toBeNull()
    expect(document.getElementById('su-emr-error')).toBeNull()
    expect(emrGroup().hasAttribute('data-invalid')).toBe(false)
    expect(emrGroup().getAttribute('aria-describedby')).toBe('su-emr-help')
    // 다른 칸 오류는 남는다
    expect(errorOf(nameInput())?.textContent).toBe(MESSAGES.nameEmpty)
    expect(errorOf(applicantInput())?.textContent).toBe(MESSAGES.applicantEmpty)
    expect(errorOf(consent())?.textContent).toBe(MESSAGES.agreed)
  })

  it('AC-7303.2·AC-204.7: EMR 오류가 보이는 상태에도 상자 안 상자가 없다', async () => {
    const user = userEvent.setup()
    const { container } = render(<SignupForm email={EMAIL} />)
    await user.click(submit())
    expect(screen.getByText(MESSAGES.emr)).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('SignupForm: 고른 EMR을 보냄 (emr-signup AC-7303.3)', () => {
  it.each(EMR_KINDS.map((kind) => [EMR_LABEL[kind], kind] as [string, EmrKind]))(
    'AC-7303.3: "%s"를 고르고 다른 칸이 맞으면 submitSignup에 emr %s가 실려 간다',
    async (text, kind) => {
      const user = userEvent.setup()
      render(<SignupForm email={EMAIL} />)
      await fillValid(user, '010-1234-5678', text)
      await user.click(submit())
      expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr: kind })
      await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pending'))
    },
  )

  it('AC-7303.3: 골랐다가 바꾸면 마지막에 고른 것이 간다', async () => {
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user)
    await user.click(emrButton('이지스'))
    await user.click(submit())
    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr: 'egis' })
  })

  it('AC-7303.3: 저장이 실패해도 고른 EMR은 그대로 골라져 있다', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '23514', message: RAW }, status: 400 })
    const user = userEvent.setup()
    render(<SignupForm email={EMAIL} />)
    await fillValid(user, '010-1234-5678', '의사랑')
    await user.click(submit())
    await screen.findByRole('alert')
    expect(pressedOf()).toEqual(['false', 'true', 'false', 'false'])
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
