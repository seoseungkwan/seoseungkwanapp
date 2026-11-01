// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { use, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { checkedLabel, HeaderSignOut, PendingCard, type PendingHospital } from './PendingCard'
import { Stepper } from './Stepper'

// 실제 Supabase·Next 라우터에 붙지 않는다. [상태 다시 확인] → router.refresh(), 로그아웃 → signOut() 뒤 /login만 본다
const { signOut, router } = vi.hoisted(() => ({
  signOut: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() },
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

// 목업 Pending·Rejected의 예시 값. DB에는 연락처가 숫자만, 신청일이 UTC 시각으로 들어 있다
const PENDING: PendingHospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: '01000001234',
  email: 'manager@example.com',
  status: 'pending',
  createdAt: '2026-10-28T01:23:45.123456+00:00',
}
const REJECTED: PendingHospital = {
  id: 'h4',
  name: '사아 의원',
  applicantName: '박민수',
  phone: null,
  email: 'minsu@example.com',
  status: 'rejected',
  createdAt: '2026-10-22T05:00:00+00:00',
}

// 문구는 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs pendingBody·rejectedBody 글자 그대로(AC-419.4·AC-419.5)
const PENDING_LEAD = '관리자가 승인하면 대시보드를 쓸 수 있어요. 승인됐는지는 [상태 다시 확인]을 눌러 확인하세요.'
const REJECTED_LEAD = '궁금한 점은 아래 관리자 메일로 물어봐 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있어요.'
const CHECKING = '확인 중…'
const FALLBACK_MAIL = 'admin@example.com'
// 시험용 가짜 주소(진짜 메일 아님)
const SET_MAIL = 'office@clinic.example'
// 시안 parts.mjs의 시계·X 아이콘(Icon clock·x) path
const CLOCK_D = 'M8 4.75V8l2.25 1.5'
const X_D = 'm4.75 4.75 6.5 6.5m0-6.5-6.5 6.5'

const summary = () => screen.getByRole('region', { name: '보낸 신청 내용' })
// 보낸 신청 내용 표의 [이름, 값] 줄들(화면 순서). 값은 이름 바로 다음 dd
const rowsOf = (section: HTMLElement) =>
  [...section.querySelectorAll('dt')].map((dt) => {
    const dd = dt.nextElementSibling
    return [dt.textContent, dd?.tagName === 'DD' ? dd.textContent : null]
  })
const valueOf = (label: string) => rowsOf(summary()).find(([name]) => name === label)?.[1]
const ddOf = (label: string) => [...summary().querySelectorAll('dt')].find((dt) => dt.textContent === label)?.nextElementSibling as Element
const refresh = () => screen.getByRole<HTMLButtonElement>('button', { name: '상태 다시 확인' })
// 글이 여러 조각(줄 안 붙임 span)이어도 그 <p> 하나를 글 전체로 찾는다
const paragraph = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)
const result = () => screen.getByRole('status')
const contact = () => paragraph(`관리자 메일: ${FALLBACK_MAIL}`).parentElement as HTMLElement
const copyButton = () => screen.getByRole<HTMLButtonElement>('button', { name: '주소 복사' })
const steps = () => screen.getByRole('list', { name: '가입 단계' })
// 상태 줄 = 상태 칩을 담은 <p>
const statusLine = (chip: string) => screen.getByText(chip).parentElement as HTMLElement
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const expectOrder = (order: Node[]) => {
  for (let i = 1; i < order.length; i++) expect(isBefore(order[i - 1], order[i]), String(i)).toBe(true)
}
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 묶음(ds.*)의 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(el ? classesOf(el) : []).toEqual(expect.arrayContaining(wanted))
// 테두리·바탕 클래스(border·border-t·bg-* …, 화면 폭 접두사 포함)
const frameClasses = (el: Element) => classesOf(el).filter((c) => /^(?:[\w-]+:)?(?:border(?:-|$)|bg-)/.test(c))
const noArbitraryColor = () => {
  for (const el of document.querySelectorAll('[class]')) {
    expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
  }
}
// 네 변 테두리 상자(카드) 목록
const borderBoxes = (root: Element) => [root, ...root.querySelectorAll('*')].filter(isBorderBox).map((el) => el.outerHTML.slice(0, 80))

// [상태 다시 확인]이 기다리는 동안을 보려고: 가짜 refresh가 같은 전환 안에서 아직 끝나지 않은 약속을 읽는 부품을 띄운다
// (Next가 서버에서 새 화면을 받기 전처럼 전환이 끝나지 않는다). finish()를 부르면 새 화면을 받은 것처럼 끝난다.
// 멈춘 전환은 act 안에서 다시 이어지지 않는다 → 이 시험은 act 밖에서 누르고(pressOutsideAct) React 스케줄러가 이어 가게 둔 뒤 waitFor로 본다
const gate: { show: ((promise: Promise<void>) => void) | null } = { show: null }
function Wait({ promise }: { promise: Promise<void> }) {
  use(promise)
  return null
}
function Harness({ hospital }: { hospital: PendingHospital }) {
  const [promise, setPromise] = useState<Promise<void> | null>(null)
  useEffect(() => {
    gate.show = setPromise
    return () => {
      gate.show = null
    }
  }, [])
  return (
    <>
      <PendingCard hospital={hospital} />
      {promise !== null && <Wait promise={promise} />}
    </>
  )
}
function slowRefresh() {
  let done = () => {}
  const promise = new Promise<void>((resolve) => (done = resolve))
  router.refresh.mockImplementation(() => gate.show?.(promise))
  return () => done()
}
// 실제 브라우저처럼 act 밖에서 누른다. 시험이 끝나면 afterEach가 act 환경을 되돌린다
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
function pressOutsideAct(el: HTMLElement) {
  actEnv.IS_REACT_ACT_ENVIRONMENT = false
  el.click()
}

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn()

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  for (const fn of Object.values(router)) fn.mockReset()
  assign.mockReset()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/pending', assign })
  // 관리자 메일 설정값이 없으면 대체 주소(adminContactEmail)
  vi.stubEnv('NEXT_PUBLIC_ADMIN_CONTACT_EMAIL', '')
})

afterEach(() => {
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PendingCard: 승인 대기(목업 Pending)', () => {
  it('AC-005.1·AC-216.1: 가입 단계 — 가입 신청과 같은 단계 표시(구글 로그인·가입 신청 끝남, 3 관리자 승인 지금)', () => {
    render(<PendingCard hospital={PENDING} />)
    const list = steps()
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, 'step'])
    // 끝난 단계는 화면 읽기 "끝남"(AC-215.1), 지금 단계는 번호 3(옛 "03" 아님)
    for (const [i, name] of ['구글 로그인', '가입 신청'].entries()) {
      expect(items[i].textContent, name).toContain(name)
      expect(items[i].textContent, name).toContain('끝남')
    }
    expect(items[2].textContent).toContain('관리자 승인')
    expect(items[2].textContent).toContain('3')
    expect(items[2].textContent).not.toContain('03')
    expect(items[2].textContent).not.toContain('끝남')
    // 가입 신청 화면과 같은 부품(Stepper current 3)을 그대로 쓴다
    const { container } = render(<Stepper current={3} />)
    expect(list.outerHTML).toBe(container.querySelector('ol')?.outerHTML)
  })

  it('AC-005.1·AC-419.4: 제목 "신청을 확인하고 있어요"와 안내 문장', () => {
    render(<PendingCard hospital={PENDING} />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('신청을 확인하고 있어요')
    expect(paragraph(PENDING_LEAD)).toBeTruthy()
  })

  it('AC-005.1·AC-419.4: 보낸 신청 내용 — 의원 이름 · 신청자 · 구글 계정 · 연락처 4줄(신청일 줄 없음)을 시안 순서·모양으로', () => {
    render(<PendingCard hospital={PENDING} />)
    expect(within(summary()).getByRole('heading', { level: 2 }).textContent).toBe('보낸 신청 내용')
    expect(rowsOf(summary())).toEqual([
      ['의원 이름', '가나 정형외과의원'],
      ['신청자', '홍길동'],
      ['구글 계정', 'manager@example.com'],
      ['연락처', '010-0000-1234'],
    ])
  })

  it('AC-005.1·AC-419.4: 신청일은 위 상태 줄에만 한국 날짜로 있다(UTC 2026-10-27 15:30 → 2026-10-28)', () => {
    render(<PendingCard hospital={{ ...PENDING, createdAt: '2026-10-27T15:30:00+00:00' }} />)
    expect(statusLine('승인 대기').textContent).toBe('승인 대기2026-10-28 신청')
    expect(valueOf('신청일')).toBeUndefined()
    expect(document.body.textContent?.match(/2026-10-28/g)).toHaveLength(1)
  })

  it('AC-005.1: 연락처는 숫자만 저장된 값을 끊어 보인다(휴대폰·서울·지역 번호)', () => {
    for (const [phone, shown] of [
      ['01012345678', '010-1234-5678'],
      ['0212345678', '02-1234-5678'],
      ['021234567', '02-123-4567'],
      ['0311234567', '031-123-4567'],
    ]) {
      render(<PendingCard hospital={{ ...PENDING, phone }} />)
      expect(valueOf('연락처'), phone).toBe(shown)
      cleanup()
    }
  })

  it('AC-005.1: 연락처를 비워 보냈으면 "—"(목업 Admin의 빈 연락처와 같다)', () => {
    render(<PendingCard hospital={{ ...PENDING, phone: null }} />)
    expect(valueOf('연락처')).toBe('—')
  })

  it('AC-005.1·AC-419.4: 받은 값은 글자로만 그린다(HTML로 해석하지 않는다)', () => {
    const odd = '<img src=x onerror=alert(1)>'
    render(<PendingCard hospital={{ ...PENDING, name: odd, applicantName: odd, email: `${odd}@fake.test` }} />)
    expect(valueOf('의원 이름')).toBe(odd)
    expect(valueOf('신청자')).toBe(odd)
    expect(valueOf('구글 계정')).toBe(`${odd}@fake.test`)
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-005.1·AC-216.1·AC-419.4: 시안 순서 — 단계 · 상태 줄 · 제목 · 안내 · 보낸 신청 내용 · [상태 다시 확인](단추 하나, 링크 아님) · 결과 줄', () => {
    render(<PendingCard hospital={PENDING} />)
    const buttons = screen.getAllByRole<HTMLButtonElement>('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['상태 다시 확인'])
    expect(buttons.map((b) => b.type)).toEqual(['button'])
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expectOrder([steps(), statusLine('승인 대기'), screen.getByRole('heading', { level: 1 }), paragraph(PENDING_LEAD), summary(), buttons[0], result()])
  })

  it('AC-005.1: 오류 문구·오류 카드가 없다', () => {
    render(<PendingCard hospital={PENDING} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-005.2: [상태 다시 확인]은 router.refresh()로 페이지만 새로 그린다(다른 곳으로 보내지 않는다)', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={PENDING} />)
    await user.click(refresh())
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('AC-005.2: 다시 누르면 다시 새로 그린다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={PENDING} />)
    await user.click(refresh())
    await user.click(refresh())
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})

describe('PendingCard: 거절됨(목업 Rejected)', () => {
  it('AC-005.3·AC-216.2·AC-419.5: 제목 "가입이 승인되지 않았어요"와 문의 안내(아래 관리자 메일로, [이메일 주소] 빈칸 없음)', () => {
    render(<PendingCard hospital={REJECTED} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입이 승인되지 않았어요')
    const lead = screen.getByText(REJECTED_LEAD)
    expect(lead.tagName).toBe('P')
    expect(document.body.textContent).not.toContain('[이메일 주소]')
  })

  it('AC-005.3·AC-419.5: 보낸 신청 내용은 시안 그대로 의원 이름 · 구글 계정 2줄(신청일 줄 없음)', () => {
    render(<PendingCard hospital={REJECTED} />)
    expect(within(summary()).getByRole('heading', { level: 2 }).textContent).toBe('보낸 신청 내용')
    expect(rowsOf(summary())).toEqual([
      ['의원 이름', '사아 의원'],
      ['구글 계정', 'minsu@example.com'],
    ])
    expect(statusLine('승인되지 않음').textContent).toBe('승인되지 않음2026-10-22 신청')
  })

  it('AC-005.3·AC-216.2·AC-419.5: [주소 복사]·[다른 계정으로 로그인]만 있고 [상태 다시 확인]·가입 단계는 없다 — 상태 줄 · 제목 · 안내 · 관리자 메일 · 보낸 신청 내용 · 단추 순서', () => {
    render(<PendingCard hospital={REJECTED} />)
    const buttons = screen.getAllByRole<HTMLButtonElement>('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['주소 복사', '다른 계정으로 로그인'])
    expect(buttons.map((b) => b.type)).toEqual(['button', 'button'])
    expect(screen.queryByRole('button', { name: '상태 다시 확인' })).toBeNull()
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
    expect(screen.queryByRole('list', { name: '가입 단계' })).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
    expectOrder([
      statusLine('승인되지 않음'),
      screen.getByRole('heading', { level: 1 }),
      screen.getByText(REJECTED_LEAD),
      contact(),
      summary(),
      buttons[1],
    ])
  })

  it('AC-005.3·AC-419.5: 받은 값은 글자로만 그린다(HTML로 해석하지 않는다)', () => {
    const odd = '<img src=x onerror=alert(1)>'
    render(<PendingCard hospital={{ ...REJECTED, name: odd }} />)
    expect(valueOf('의원 이름')).toBe(odd)
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-005.3: [다른 계정으로 로그인]은 signOut() 뒤 /login을 새로 연다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={REJECTED} />)
    await user.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })
})

describe('HeaderSignOut: 머리띠 [로그아웃](목업 Pending·Rejected)', () => {
  it('AC-005.1·AC-005.3: "로그아웃" 단추 하나, 누르면 signOut() 뒤 /login을 새로 연다', async () => {
    const user = userEvent.setup()
    render(<HeaderSignOut />)
    const button = screen.getByRole<HTMLButtonElement>('button', { name: '로그아웃' })
    expect(button.type).toBe('button')
    await user.click(button)
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })
})

describe('PendingCard: 모양 (b2b-redesign REQ-216)', () => {
  it('AC-216.1: 상태 줄(위 24px) — ds.chip.warning(시계 12px) "승인 대기" + "<신청일> 신청"(small muted, 한국 날짜)', () => {
    render(<PendingCard hospital={{ ...PENDING, createdAt: '2026-10-27T15:30:00+00:00' }} />)
    const line = statusLine('승인 대기')
    expect(line.tagName).toBe('P')
    expectClasses(line, 'mt-6', 'flex', 'items-center', 'gap-2')
    const [chip, date] = Array.from(line.children)
    hasAll(chip, ds.chip.warning)
    expect(chip.textContent).toBe('승인 대기')
    const icon = chip.querySelector('svg') as Element
    expect(icon.querySelector(`path[d="${CLOCK_D}"]`)).not.toBeNull()
    expect(icon.getAttribute('width')).toBe('12')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(date.textContent).toBe('2026-10-28 신청')
    expectClasses(date, 'text-small', 'text-muted')
    expect(line.children).toHaveLength(2)
  })

  it('AC-216.1·AC-419.4: 제목·안내 — 상태 줄 바로 뒤 h1(위 8px, heading-m → heading 600 ink) → 안내 <p>(ink-2, 위 8px). 제목 옆 상태 그림이 없다', () => {
    render(<PendingCard hospital={PENDING} />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.previousElementSibling).toBe(statusLine('승인 대기'))
    expectClasses(title, 'mt-2', 'text-heading-m', 'md:text-heading', 'font-semibold', 'text-ink')
    const lead = paragraph(PENDING_LEAD)
    expect(lead.tagName).toBe('P')
    expect(title.nextElementSibling).toBe(lead)
    expectClasses(lead, 'mt-2', 'text-body', 'text-ink-2')
    expect(document.querySelector('svg[width="20"]')).toBeNull()
  })

  it('AC-216.1: 보낸 신청 내용 — <section aria-labelledby>(테두리·바탕 없음) 안 h2(small 600 muted, 위 32px) → <dl>(위 8px, 위 1px line)', () => {
    render(<PendingCard hospital={PENDING} />)
    const section = summary()
    expect(section.tagName).toBe('SECTION')
    expect(frameClasses(section)).toEqual([])
    const h2 = within(section).getByRole('heading', { level: 2 })
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id)
    expectClasses(h2, 'mt-8', 'text-small', 'font-semibold', 'text-muted')
    const list = section.querySelector('dl') as HTMLElement
    expect(h2.nextElementSibling).toBe(list)
    expectClasses(list, 'mt-2', 'border-t', 'border-line')
  })

  it('AC-216.1·AC-419.4: 신청 내용 줄 — 96px dt(small muted) + dd(body ink), 줄 아래 1px line, 44px 이상(위아래 12px). 의원 이름 600', () => {
    render(<PendingCard hospital={PENDING} />)
    const list = summary().querySelector('dl') as HTMLElement
    const dts = list.querySelectorAll('dt')
    expect(dts).toHaveLength(4)
    for (const dt of dts) {
      const row = dt.parentElement as Element
      expect(row.parentElement).toBe(list)
      expectClasses(row, 'border-b', 'border-line', 'py-3', 'min-h-11')
      expectClasses(dt, 'w-24', 'shrink-0', 'text-small', 'text-muted')
      expectClasses(dt.nextElementSibling, 'text-body', 'text-ink')
    }
    expectClasses(ddOf('의원 이름'), 'font-semibold')
    expectClasses(ddOf('구글 계정'), 'wrap-anywhere')
    expectClasses(ddOf('연락처'), 'tabular-nums')
  })

  it('AC-216.1: [상태 다시 확인]은 ds.button.primaryLarge(위 24px, 768px 미만 전체 폭), 머리띠 [로그아웃]은 ds.button.ghostSmall', () => {
    render(<PendingCard hospital={PENDING} />)
    hasAll(refresh(), ds.button.primaryLarge)
    expectClasses(refresh(), 'mt-6', 'max-md:w-full')
    expect(classesOf(refresh())).not.toContain('w-full')
    cleanup()
    render(<HeaderSignOut />)
    hasAll(screen.getByRole('button', { name: '로그아웃' }), ds.button.ghostSmall)
  })

  it('AC-216.2: 거절 상태 줄 — ds.chip.negative(× 12px) "승인되지 않음" + "<신청일> 신청", 제목·안내는 대기와 같은 모양', () => {
    render(<PendingCard hospital={REJECTED} />)
    const line = statusLine('승인되지 않음')
    expect(line.tagName).toBe('P')
    expectClasses(line, 'mt-6', 'flex', 'items-center', 'gap-2')
    const [chip, date] = Array.from(line.children)
    hasAll(chip, ds.chip.negative)
    expect(chip.textContent).toBe('승인되지 않음')
    const icon = chip.querySelector('svg') as Element
    expect(icon.querySelector(`path[d="${X_D}"]`)).not.toBeNull()
    expect(icon.getAttribute('width')).toBe('12')
    expect(date.textContent).toBe('2026-10-22 신청')
    expectClasses(date, 'text-small', 'text-muted')
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.previousElementSibling).toBe(line)
    expectClasses(title, 'mt-2', 'text-heading-m', 'md:text-heading', 'font-semibold', 'text-ink')
    expectClasses(screen.getByText(REJECTED_LEAD), 'mt-2', 'text-body', 'text-ink-2')
  })

  it('AC-216.2·AC-419.5: 거절 — 보낸 신청 내용 h2 → dl(2줄, 대기와 같은 모양), [다른 계정으로 로그인]은 ds.button.primaryLarge(위 24px, 768px 미만 전체 폭)', () => {
    render(<PendingCard hospital={REJECTED} />)
    const section = summary()
    expect(section.tagName).toBe('SECTION')
    expect(frameClasses(section)).toEqual([])
    const h2 = within(section).getByRole('heading', { level: 2 })
    expectClasses(h2, 'mt-8', 'text-small', 'font-semibold', 'text-muted')
    expectClasses(section.querySelector('dl'), 'mt-2', 'border-t', 'border-line')
    for (const dt of section.querySelectorAll('dt')) {
      expectClasses(dt.parentElement, 'border-b', 'border-line', 'py-3', 'min-h-11')
      expectClasses(dt, 'w-24', 'text-small', 'text-muted')
    }
    expect(section.querySelectorAll('dt')).toHaveLength(2)
    expectClasses(ddOf('의원 이름'), 'font-semibold')
    const button = screen.getByRole('button', { name: '다른 계정으로 로그인' })
    hasAll(button, ds.button.primaryLarge)
    expectClasses(button, 'mt-6', 'max-md:w-full')
  })

  it.each([
    ['대기', PENDING],
    ['거절', REJECTED],
  ] as const)('AC-216.1·AC-216.2·AC-204.7: %s — 카드 상자가 없고 상자 안 상자도 없다, 임의 색 없음', (_name, hospital) => {
    const { container } = render(<PendingCard hospital={hospital} />)
    expect(borderBoxes(container)).toEqual([])
    expect(nestedBoxes(container)).toEqual([])
    noArbitraryColor()
  })
})

describe('AC-419.4: 승인 대기 — 시안 pendingBody 문구와 [상태 다시 확인] 결과 줄', () => {
  it('AC-419.4: 안내 속 "[상태 다시 확인]을"은 한 덩이로 줄을 바꾼다(줄 붙임 span)', () => {
    render(<PendingCard hospital={PENDING} />)
    const keep = within(paragraph(PENDING_LEAD)).getByText('[상태 다시 확인]을')
    expect(keep.tagName).toBe('SPAN')
    expectClasses(keep, 'whitespace-nowrap')
  })

  it('AC-419.4: 결과 줄은 처음부터 있는 빈 role="status" <p>(small ink-2, 아이콘과 사이 6px)이고, 비었을 때는 위 여백도 없다', () => {
    render(<PendingCard hospital={PENDING} />)
    const line = result()
    expect(line.tagName).toBe('P')
    expect(line.textContent).toBe('')
    expect(line.children).toHaveLength(0)
    expect(refresh().nextElementSibling).toBe(line)
    expectClasses(line, 'mt-3', 'empty:mt-0', 'flex', 'items-center', 'gap-1.5', 'text-small', 'text-ink-2')
  })

  it('AC-419.4: 누르면 새로 받는 동안 "확인 중…"(aria-busy, 막힘 아님)이고 다시 눌러도 다시 부르지 않는다 → 끝나고 아직 대기면 결과 줄', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T05:31:00Z')) // 한국 오후 2:31
    const finish = slowRefresh()
    render(<Harness hospital={PENDING} />)
    const button = refresh()
    pressOutsideAct(button)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(button.textContent).toBe(CHECKING))
    expect(screen.getByRole('button', { name: CHECKING })).toBe(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.disabled).toBe(false)
    expect(result().textContent).toBe('')
    pressOutsideAct(button)
    pressOutsideAct(button)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(button.textContent).toBe(CHECKING)
    finish()
    await waitFor(() => expect(button.textContent).toBe('상태 다시 확인'))
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(result().textContent).toBe('아직 승인 전이에요 · 오후 2:31 확인')
  })

  it('AC-419.4: 결과 줄은 시계 아이콘(14px, 읽지 않음, warning 색) + 글자이고, 다시 누르면 확인하는 동안 지웠다가 새 시각으로 다시 쓴다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T05:31:00Z'))
    const user = userEvent.setup()
    render(<Harness hospital={PENDING} />)
    await user.click(refresh())
    const line = result()
    expect(line.textContent).toBe('아직 승인 전이에요 · 오후 2:31 확인')
    const icon = line.querySelector('svg') as Element
    expect(icon.querySelector(`path[d="${CLOCK_D}"]`)).not.toBeNull()
    expect(icon.getAttribute('width')).toBe('14')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expectClasses(icon, 'shrink-0', 'text-warning')
    expect(line.firstElementChild).toBe(icon)
    vi.setSystemTime(new Date('2026-11-01T06:05:00Z')) // 한국 오후 3:05
    const finish = slowRefresh()
    pressOutsideAct(refresh())
    await waitFor(() => expect(screen.getByRole('button', { name: CHECKING })).toBeTruthy())
    expect(result().textContent).toBe('')
    finish()
    await waitFor(() => expect(result().textContent).toBe('아직 승인 전이에요 · 오후 3:05 확인'))
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })

  it('AC-419.4·AC-005.2: [상태 다시 확인]은 그래도 router.refresh() 하나만 부른다(다른 곳으로 보내지 않는다)', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={PENDING} />)
    await user.click(refresh())
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(result().textContent).toMatch(/^아직 승인 전이에요 · 오[전후] \d{1,2}:\d{2} 확인$/)
  })
})

describe('AC-419.4: checkedLabel — 한국 시각 "오전|오후 h:mm"', () => {
  it.each([
    ['2026-11-01T05:31:00Z', '오후 2:31'],
    ['2026-11-01T00:05:00Z', '오전 9:05'],
    ['2026-10-31T16:07:00Z', '오전 1:07'],
    ['2026-10-31T15:00:00Z', '오전 12:00'], // 한국 자정
    ['2026-10-31T15:59:59Z', '오전 12:59'],
    ['2026-11-01T03:00:00Z', '오후 12:00'], // 한국 정오
    ['2026-11-01T02:59:00Z', '오전 11:59'],
    ['2026-11-01T14:59:00Z', '오후 11:59'],
  ])('AC-419.4: %s → %s', (iso, label) => {
    expect(checkedLabel(new Date(iso))).toBe(label)
  })
})

describe('AC-419.5: 거절 — 시안 rejectedBody 문구와 관리자 메일', () => {
  it('AC-419.5: 안내 뒤(위 16px) "관리자 메일: <설정값>" — 설정이 없으면 대체 주소, 메일은 600 ink(줄바꿈 허용·한 번에 고르기)', () => {
    render(<PendingCard hospital={REJECTED} />)
    const line = paragraph(`관리자 메일: ${FALLBACK_MAIL}`)
    expectClasses(line, 'text-body', 'text-ink')
    const mail = within(line).getByText(FALLBACK_MAIL)
    expect(mail.tagName).toBe('B')
    expectClasses(mail, 'font-semibold', 'text-ink', 'wrap-anywhere', 'select-all')
    expect(screen.getByText(REJECTED_LEAD).nextElementSibling).toBe(contact())
  })

  it('AC-419.5: 관리자 메일은 설정값(NEXT_PUBLIC_ADMIN_CONTACT_EMAIL)을 따른다', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONTACT_EMAIL', SET_MAIL)
    const user = userEvent.setup()
    render(<PendingCard hospital={REJECTED} />)
    expect(paragraph(`관리자 메일: ${SET_MAIL}`)).toBeTruthy()
    expect(document.body.textContent).not.toContain(FALLBACK_MAIL)
    await user.click(copyButton())
    expect(await navigator.clipboard.readText()).toBe(SET_MAIL)
  })

  it('AC-419.5: 메일 줄 상자 — canvas 바탕·4px·테두리 없음, 좌우 16px·위아래 12px, 넘치면 줄바꿈(사이 12·8px), [주소 복사]는 ds.button.secondarySmall', () => {
    render(<PendingCard hospital={REJECTED} />)
    const box = contact()
    expect(box.tagName).toBe('DIV')
    expectClasses(box, 'mt-4', 'flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-x-3', 'gap-y-2', 'rounded-control', 'bg-canvas', 'px-4', 'py-3')
    expect(frameClasses(box)).toEqual(['bg-canvas'])
    expect(box.contains(copyButton())).toBe(true)
    hasAll(copyButton(), ds.button.secondarySmall)
    expect(copyButton().type).toBe('button')
  })

  it('AC-419.5: [주소 복사]는 관리자 메일을 복사하고 결과 줄(role="status")에 "복사했어요."를 보인다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={REJECTED} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    expect(contact().nextElementSibling).toBe(status)
    await user.click(copyButton())
    expect(await navigator.clipboard.readText()).toBe(FALLBACK_MAIL)
    expect(status.textContent).toBe('복사했어요.')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('AC-419.5: 복사가 막히면 "복사하지 못했어요. …"를 보이고 주소는 그대로 보인다(오류 내용은 없다)', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    render(<PendingCard hospital={REJECTED} />)
    await user.click(copyButton())
    const status = screen.getByRole('status')
    await waitFor(() => expect(status.textContent).toBe('복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요.'))
    expect(status.textContent).not.toContain('복사했어요.')
    expect(paragraph(`관리자 메일: ${FALLBACK_MAIL}`)).toBeTruthy()
    expect(document.body.textContent).not.toContain('denied')
  })
})

describe('AC-419.6: 승인 대기·거절에 "병원 이름"·"니다." 글자가 없다', () => {
  it('AC-419.6: 대기(처음 · 결과 줄 뒤)', async () => {
    const user = userEvent.setup()
    const { container } = render(<PendingCard hospital={PENDING} />)
    const check = (state: string) => {
      expect(container.textContent, state).not.toContain('병원 이름')
      expect(container.textContent, state).not.toContain('니다.')
    }
    check('처음')
    await user.click(refresh())
    expect(result().textContent).not.toBe('')
    check('결과 줄')
  })

  it('AC-419.6: 거절(처음 · 복사 뒤 · 복사 실패 뒤)', async () => {
    const user = userEvent.setup()
    const { container } = render(<PendingCard hospital={REJECTED} />)
    const check = (state: string) => {
      expect(container.textContent, state).not.toContain('병원 이름')
      expect(container.textContent, state).not.toContain('니다.')
    }
    check('처음')
    await user.click(copyButton())
    check('복사 뒤')
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(copyButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('복사하지 못했어요'))
    check('복사 실패 뒤')
  })
})
