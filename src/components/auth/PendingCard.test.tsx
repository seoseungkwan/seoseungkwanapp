// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ui } from '@/components/ui/classes'
import { HeaderSignOut, PendingCard, type PendingHospital } from './PendingCard'

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

const PENDING_LEAD = '관리자가 승인하면 대시보드를 쓸 수 있습니다. 승인된 뒤에는 이 화면을 새로 고치거나 다시 로그인해 주세요.'
const REJECTED_LEAD =
  '궁금한 점은 [이메일 주소]로 문의해 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있습니다.'

const summary = () => screen.getByRole('region', { name: '보낸 신청 내용' })
// 보낸 신청 내용 표의 [이름, 값] 줄들(화면 순서). 값은 이름 바로 다음 dd
const rowsOf = (section: HTMLElement) =>
  [...section.querySelectorAll('dt')].map((dt) => {
    const dd = dt.nextElementSibling
    return [dt.textContent, dd?.tagName === 'DD' ? dd.textContent : null]
  })
const valueOf = (label: string) => rowsOf(summary()).find(([name]) => name === label)?.[1]
const refresh = () => screen.getByRole<HTMLButtonElement>('button', { name: '상태 다시 확인' })
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 묶음(ui.*)의 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const noArbitraryColor = () => {
  for (const el of document.querySelectorAll('[class]')) {
    expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
  }
}
// 제목 옆 상태 그림(제목 묶음 바로 앞의 svg)
const stateIcon = () => {
  const head = screen.getByRole('heading', { level: 1 }).parentElement?.parentElement as HTMLElement
  return head.querySelector(':scope > svg') as SVGElement
}

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn()

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  for (const fn of Object.values(router)) fn.mockReset()
  assign.mockReset()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/pending', assign })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PendingCard: 승인 대기(목업 Pending)', () => {
  it('AC-005.1: 가입 단계 칩 3개 — 구글 로그인(끝남) · 가입 신청(끝남) · 03 관리자 승인(지금)', () => {
    render(<PendingCard hospital={PENDING} />)
    const steps = within(screen.getByRole('list', { name: '가입 단계' })).getAllByRole('listitem')
    expect(steps.map((li) => li.textContent)).toEqual(['구글 로그인', '가입 신청', '03관리자 승인'])
    expect(steps.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, 'step'])
  })

  it('AC-005.1: 제목 "신청을 확인하고 있습니다"와 안내 문장', () => {
    render(<PendingCard hospital={PENDING} />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('신청을 확인하고 있습니다')
    expect(screen.getByText(PENDING_LEAD)).toBeTruthy()
  })

  it('AC-005.1: 보낸 신청 내용 — 신청일 · 병원 이름 · 신청자 · 구글 계정 · 연락처를 목업 순서·모양으로', () => {
    render(<PendingCard hospital={PENDING} />)
    expect(within(summary()).getByRole('heading', { level: 2 }).textContent).toBe('보낸 신청 내용')
    expect(rowsOf(summary())).toEqual([
      ['신청일', '2026-10-28'],
      ['병원 이름', '가나 정형외과의원'],
      ['신청자', '홍길동'],
      ['구글 계정', 'manager@example.com'],
      ['연락처', '010-0000-1234'],
    ])
  })

  it('AC-005.1: 신청일은 한국 날짜다(UTC 2026-10-27 15:30 → 2026-10-28)', () => {
    render(<PendingCard hospital={{ ...PENDING, createdAt: '2026-10-27T15:30:00+00:00' }} />)
    expect(valueOf('신청일')).toBe('2026-10-28')
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

  it('AC-005.1: 받은 값은 글자로만 그린다(HTML로 해석하지 않는다)', () => {
    const odd = '<img src=x onerror=alert(1)>'
    render(<PendingCard hospital={{ ...PENDING, name: odd, applicantName: odd, email: `${odd}@fake.test` }} />)
    expect(valueOf('병원 이름')).toBe(odd)
    expect(valueOf('신청자')).toBe(odd)
    expect(valueOf('구글 계정')).toBe(`${odd}@fake.test`)
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-005.1: 목업 순서 — 단계 · 제목 · 보낸 신청 내용 · [상태 다시 확인] · [로그아웃](모두 단추, 링크 아님)', () => {
    render(<PendingCard hospital={PENDING} />)
    const buttons = screen.getAllByRole<HTMLButtonElement>('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['상태 다시 확인', '로그아웃'])
    expect(buttons.map((b) => b.type)).toEqual(['button', 'button'])
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    const order = [
      screen.getByRole('list', { name: '가입 단계' }),
      screen.getByRole('heading', { level: 1 }),
      summary(),
      buttons[0],
      buttons[1],
    ]
    for (let i = 1; i < order.length; i++) expect(isBefore(order[i - 1], order[i]), String(i)).toBe(true)
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

  it('AC-005.1: 본문 [로그아웃]은 signOut() 뒤 /login을 새로 연다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={PENDING} />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(router.refresh).not.toHaveBeenCalled()
  })
})

describe('PendingCard: 거절됨(목업 Rejected)', () => {
  it('AC-005.3: 제목 "가입이 승인되지 않았습니다"와 문의 안내([이메일 주소] 빈칸 그대로)', () => {
    render(<PendingCard hospital={REJECTED} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입이 승인되지 않았습니다')
    const lead = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === REJECTED_LEAD)
    expect(within(lead).getByText('[이메일 주소]')).toBeTruthy()
  })

  it('AC-005.3: 보낸 신청 내용은 목업 그대로 신청일 · 병원 이름 · 구글 계정', () => {
    render(<PendingCard hospital={REJECTED} />)
    expect(within(summary()).getByRole('heading', { level: 2 }).textContent).toBe('보낸 신청 내용')
    expect(rowsOf(summary())).toEqual([
      ['신청일', '2026-10-22'],
      ['병원 이름', '사아 의원'],
      ['구글 계정', 'minsu@example.com'],
    ])
  })

  it('AC-005.3: [다른 계정으로 로그인] · [로그아웃]만 있고 [상태 다시 확인]·가입 단계 칩은 없다', () => {
    render(<PendingCard hospital={REJECTED} />)
    const buttons = screen.getAllByRole<HTMLButtonElement>('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['다른 계정으로 로그인', '로그아웃'])
    expect(buttons.map((b) => b.type)).toEqual(['button', 'button'])
    expect(screen.queryByRole('button', { name: '상태 다시 확인' })).toBeNull()
    expect(screen.queryByRole('list', { name: '가입 단계' })).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
    const order = [screen.getByRole('heading', { level: 1 }), summary(), buttons[0], buttons[1]]
    for (let i = 1; i < order.length; i++) expect(isBefore(order[i - 1], order[i]), String(i)).toBe(true)
  })

  it('AC-005.3: 받은 값은 글자로만 그린다(HTML로 해석하지 않는다)', () => {
    const odd = '<img src=x onerror=alert(1)>'
    render(<PendingCard hospital={{ ...REJECTED, name: odd }} />)
    expect(valueOf('병원 이름')).toBe(odd)
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-005.3: [다른 계정으로 로그인]은 signOut() 뒤 /login을 새로 연다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={REJECTED} />)
    await user.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it('AC-005.3: 본문 [로그아웃]도 signOut() 뒤 /login을 새로 연다', async () => {
    const user = userEvent.setup()
    render(<PendingCard hospital={REJECTED} />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
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

describe('PendingCard: 모양', () => {
  it('AC-005.1·AC-013.3: 단계 표시 색 — 끝난 단계 ok 체크 + ink-2, 지금 단계(03) ink 600', () => {
    render(<PendingCard hospital={PENDING} />)
    const [login, signup, approval] = within(screen.getByRole('list', { name: '가입 단계' })).getAllByRole('listitem')
    for (const done of [login, signup]) {
      expect(classesOf(done)).toContain('text-ink-2')
      expect(classesOf(done.querySelector('svg') as Element)).toContain('text-ok')
    }
    expect(classesOf(approval)).toEqual(expect.arrayContaining(['text-ink', 'font-semibold']))
  })

  it('AC-005.1·AC-013.2·AC-013.3: 대기 — 20px 선 아이콘 ink-2(색 원 바탕 없음), 신청 내용 카드 ui.card, [상태 다시 확인] 주 단추, 본문 [로그아웃] 글자 단추, 임의 색 없음', () => {
    render(<PendingCard hospital={PENDING} />)
    const icon = stateIcon()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('width')).toBe('20')
    expect(classesOf(icon)).toContain('text-ink-2')
    expect(classesOf(icon).filter((c) => c.startsWith('bg-'))).toEqual([])
    hasAll(summary(), ui.card)
    hasAll(refresh(), ui.button.primary)
    hasAll(screen.getByRole('button', { name: '로그아웃' }), ui.textButton)
    noArbitraryColor()
  })

  it('AC-005.3·AC-013.2·AC-013.3: 거절 — 20px 선 아이콘 danger, 신청 내용 카드 ui.card, [다른 계정으로 로그인] 보조 단추, 임의 색 없음', () => {
    render(<PendingCard hospital={REJECTED} />)
    const icon = stateIcon()
    expect(icon.getAttribute('width')).toBe('20')
    expect(classesOf(icon)).toContain('text-danger')
    expect(classesOf(icon).filter((c) => c.startsWith('bg-'))).toEqual([])
    hasAll(summary(), ui.card)
    hasAll(screen.getByRole('button', { name: '다른 계정으로 로그인' }), ui.button.secondary)
    hasAll(screen.getByRole('button', { name: '로그아웃' }), ui.textButton)
    noArbitraryColor()
  })

  it('AC-005.1·AC-013.3: 신청 내용은 기록 목록 — 칸 이름 96px table muted, 값 table ink, 줄마다 1px 선', () => {
    render(<PendingCard hospital={PENDING} />)
    const list = summary().querySelector('dl') as HTMLElement
    expect(classesOf(list)).toContain('text-table')
    for (const dt of list.querySelectorAll('dt')) {
      expect(classesOf(dt)).toEqual(expect.arrayContaining(['w-24', 'text-muted']))
      expect(classesOf(dt.nextElementSibling as Element)).toContain('text-ink')
      expect(classesOf(dt.parentElement as Element)).toEqual(expect.arrayContaining(['border-t', 'border-line']))
    }
  })

  it('AC-005.1·AC-005.3·AC-013.3: 머리띠 [로그아웃]은 글자 단추', () => {
    render(<HeaderSignOut />)
    hasAll(screen.getByRole('button', { name: '로그아웃' }), ui.textButton)
  })
})
